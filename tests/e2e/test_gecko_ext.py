# Extension GeckoView : content.js réel, API `browser` simulée, lecteur dans une iframe d'un autre domaine.
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
CONTENT = open(sys.argv[1]).read()
proc = subprocess.Popen(['node', sys.argv[2], '/tmp/sctest'], stdout=subprocess.PIPE, text=True)
port = int(proc.stdout.readline()); base = f'http://127.0.0.1:{port}'
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)
TOP = '<!doctype html><html><head><title>Firefly Wedding - Saison 1</title></head><body><h1>episode</h1><iframe id="playerDF" src="http://ansembed.test/embed-x.html" width="660" height="380"></iframe></body></html>'
PLAYER = '<!doctype html><body style="margin:0"><video id="v" src="http://ansembed.test/clip.webm" width="640" height="360" muted></video></body>'
SHIM = """
window.__listeners = [];
window.browser = { runtime: {
  sendNativeMessage: function (app, m) { window.__native(app, JSON.stringify(m)); return Promise.resolve(); },
  sendMessage: function (m) {
    if (m.type === 'hello') return window.__hello().then(function (r) { return JSON.parse(r); });
    window.__native('bg', JSON.stringify(m)); return Promise.resolve();
  },
  onMessage: { addListener: function (fn) { window.__listeners.push(fn); } } } };
"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(); ctx.set_default_timeout(10000)
        native = []
        ctx.expose_function('__native', lambda app, m: native.append((app, json.loads(m))))
        ctx.expose_function('__hello', lambda: json.dumps({'restore': {'time': 40, 'fullscreen': False, 'autoplay': True}}))
        ctx.add_init_script(SHIM); ctx.add_init_script(CONTENT)
        ctx.route('http://anime.test/**', lambda r: r.fulfill(status=200, content_type='text/html', body=TOP))
        def player_route(r):
            if r.request.url.endswith('/clip.webm'):
                r.fulfill(response=r.fetch(url=base + '/clip.webm'))  # en-têtes Range transmis → 206
            else:
                r.fulfill(status=200, content_type='text/html', body=PLAYER)
        ctx.route('http://ansembed.test/**', player_route)
        page = ctx.new_page(); page.goto('http://anime.test/ep1')
        time.sleep(4)
        frame = page.frame(url=lambda u: 'ansembed.test' in u)
        t = frame.evaluate("document.getElementById('v').currentTime")
        check('reprise demandée au chargement et appliquée DANS l’iframe du lecteur', t >= 39, f't={t:.1f}')
        check('reprise confirmée au background (restored)', any(a == 'bg' and m.get('type') == 'restored' for a, m in native))
        prog = [m for a, m in native if a == 'browser' and m.get('type') == 'progress' and m.get('hasVideo')]
        check('progression remontée depuis l’iframe (autre domaine)', prog and prog[-1]['currentTime'] > 39 and 'ansembed.test' in prog[-1]['url'], prog[-1] if prog else None)
        frames = {m.get('frame') for a, m in native if a == 'browser'}
        check('chaque frame s’identifie (page + lecteur)', len(frames) >= 2 and None not in frames, frames)
        check('pont natif "browser" utilisé', all(a in ('browser', 'bg') for a, _ in native))
        check('pastille dans la page principale uniquement', page.locator('swipecast-handle').count() == 1 and frame.locator('swipecast-handle').count() == 0)
        frame.evaluate("window.__listeners.forEach(function(f){ f({cmd:'pause'}) })")
        time.sleep(0.3)
        check('commande pause de l’app → vidéo en pause dans l’iframe', frame.evaluate("document.getElementById('v').paused"))
        box = page.locator('swipecast-handle').bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y - 120, steps=8); page.mouse.up(); time.sleep(0.3)
        check('swipe dans la page → handoff-request', any(a == 'browser' and m.get('type') == 'handoff-request' for a, m in native))
        b.close()
finally:
    proc.kill()
print(f"{sum(ok)}/{len(ok)} OK"); sys.exit(0 if all(ok) else 1)
