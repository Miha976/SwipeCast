# Garde-fou anti-popup (Android) : simulé dans Chrome, injection au début du document dans toutes les frames.
import sys
from playwright.sync_api import sync_playwright
import json, os
ad_hosts = json.load(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'ad-hosts.json')))['hosts']
guard = open(sys.argv[1]).read().replace('__SWIPECAST_NONCE__', 'N').replace('__SWIPECAST_AD_HOSTS__', json.dumps(ad_hosts))
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)

TOP = '''<!doctype html><html><head><meta charset="utf-8"><title>Episode</title></head><body>
<h1>anime.test episode</h1>
<iframe id="f" src="http://player.test/embed" width="600" height="300"></iframe>
<iframe id="cadre" src="http://anime.test/cadre-onclicka.html" sandbox="allow-scripts allow-same-origin" width="10" height="10"></iframe>
<script src="http://anime.test/site.js"></script>
<button id="play" style="width:120px;height:40px">▶</button>
<a id="ext" href="#ancre" style="display:block;width:200px;height:30px">lien</a>
<a id="topblank" href="http://ads.test/promo" target="_blank" style="display:block;width:200px;height:40px">pub</a>
<script>window.open = function(){ return 'hijacked' };</script>
</body></html>'''
PLAYER = '''<!doctype html><html><body style="margin:0">
<a id="overlay" href="http://ads.test/x" target="_blank" style="display:block;width:300px;height:100px;background:#c00">overlay</a>
<a id="toplink" href="http://ads.test/y" target="_top" style="display:block;width:300px;height:50px;background:#0c0">top ad</a>
<a id="tophost" href="http://anime.test/next" target="_top" style="display:block;width:300px;height:50px;background:#00c">ep suivant</a>
</body></html>'''

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context()
    popups = []
    ctx.on('page', lambda pg: popups.append(pg))
    ctx.add_init_script("window.__m=[];window.mobileApp={postMessage:function(o){(window.top===window?window:window).__m.push(o.detail)}};")
    ctx.add_init_script(guard)
    def route(r):
        u = r.request.url
        if u.startswith('http://js.onclck'):
            # faux onclicka.js : redirige l'onglet au premier clic (comportement mobile observé)
            r.fulfill(status=200, content_type='application/javascript',
                      body="var d=top.document,s=d.createElement('script');s.textContent=\"window.__adLoaded=1;document.addEventListener('click',function(){location.replace('http://casino.test/contato/')},true);\";d.head.appendChild(s);")
        elif u.startswith('http://anime.test/site.js'):
            r.fulfill(status=200, content_type='application/javascript', body="window.__siteJs=1;")
        elif u.startswith('http://anime.test/cadre-onclicka'):
            r.fulfill(status=200, content_type='text/html', body='<script src="http://js.onclckmn.com/static/onclicka.js"></script>')
        elif u.startswith('http://anime.test/'): r.fulfill(status=200, content_type='text/html', body=TOP)
        elif u.startswith('http://player.test/'): r.fulfill(status=200, content_type='text/html', body=PLAYER)
        else: r.fulfill(status=200, content_type='text/html', body='<h1>PUB</h1>')
    ctx.route('**/*', route)
    page = ctx.new_page(); page.set_default_timeout(8000)
    page.goto('http://anime.test/episode-1'); page.wait_for_timeout(400)
    frame = page.frame(url=lambda u: 'player.test' in u)

    page.wait_for_timeout(400)
    check('script de régie écrit dans le HTML (iframe cadre-onclicka) → jamais exécuté', page.evaluate("window.__adLoaded") is None)
    check('les scripts du site fonctionnent toujours', page.evaluate("window.__siteJs") == 1)
    page.click('#play'); page.wait_for_timeout(500)
    check('clic sur ▶ : aucune redirection vers le casino', page.url.startswith('http://anime.test/episode-1'), page.url)
    check('clic sur un bouton ≠ intention de navigation', not any(m['type'] == 'nav-intent' for m in page.evaluate("window.__m")))
    page.evaluate("var s=document.createElement('script');s.src='http://js.onclckbnr.com/banner-admanager/build.m.js';document.head.appendChild(s)")
    page.evaluate("var s=document.createElement('script');s.setAttribute('src','http://js.onclcktg.com/x.js');document.head.appendChild(s)")
    page.wait_for_timeout(400)
    check('script de régie ajouté par JS (src / setAttribute) → jamais exécuté', page.evaluate("window.__adLoaded") is None)
    check('fetch vers une régie → rejeté', page.evaluate("fetch('http://bid.onclcktg.com/tags/1').then(()=>'ok',()=>'blocked')") == 'blocked')
    page.evaluate("document.getElementById('ext').click()"); page.wait_for_timeout(100)
    check('a.click() d’un script ≠ intention', not any(m['type'] == 'nav-intent' for m in page.evaluate("window.__m")))
    page.click('#ext'); page.wait_for_timeout(100)
    check('vrai clic sur un lien → intention signalée', any(m['type'] == 'nav-intent' and m['url'].endswith('#ancre') for m in page.evaluate("window.__m")))
    check('le site ne peut pas remplacer window.open', page.evaluate("window.open('http://ads.test/a')") is None)
    check('popup vers une régie → bloquée et signalée', any(m['type'] == 'popup-blocked' and m['nonce'] == 'N' for m in page.evaluate("window.__m")))

    # tab-under classique
    page.evaluate("(function(){ var w = window.open(location.href); if (w) location.replace('http://ads.test/tabunder'); })()")
    page.wait_for_timeout(400)
    check('tab-under : la page de l’épisode reste active', page.url.startswith('http://anime.test/episode-1'), page.url)

    check('window.open même site → bloqué aussi (vecteur du tab-under)', page.evaluate("window.open('/episode-2')") is None)

    check('window.open depuis l’iframe du lecteur → bloqué', frame.evaluate("window.open('http://player.test/other')") is None)

    n1 = len(popups)
    frame.click('#overlay'); page.wait_for_timeout(500)
    check('calque <a target=_blank> sur le lecteur → bloqué', len(popups) == n1, f'{len(popups) - n1} popup(s)')

    frame.click('#toplink'); page.wait_for_timeout(500)
    check('lien _top de l’iframe vers une régie → bloqué', page.url.startswith('http://anime.test/episode-1'), page.url)

    page.click('#topblank'); page.wait_for_timeout(500)
    check('lien _blank de la page vers une régie → bloqué', len(popups) == n1)
    page.evaluate("var a=document.createElement('a');a.id='same';a.href='/episode-3';a.target='_blank';a.textContent='ep3';a.style.cssText='display:block;width:200px;height:40px';document.body.appendChild(a)")
    page.click('#same'); page.wait_for_timeout(500)
    check('lien _blank vers le même site → autorisé', len(popups) == n1 + 1)

    frame.click('#tophost'); page.wait_for_timeout(600)
    check('lien _top de l’iframe vers le site hôte → autorisé', page.url == 'http://anime.test/next', page.url)
    b.close()
print(f"{sum(ok)}/{len(ok)} OK"); sys.exit(0 if all(ok) else 1)
