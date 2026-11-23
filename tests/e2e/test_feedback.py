# Régressions issues des retours terrain (YouTube Trusted Types, pubs YouTube, SPA qui réécrit le body)
import sys, subprocess
from playwright.sync_api import sync_playwright
ROOT, TRACKER = sys.argv[1], sys.argv[2]
src = open(TRACKER).read().replace('__SWIPECAST_NONCE__', 'N')
import atexit
proc = subprocess.Popen(['node', 'tests/e2e/range-server.mjs' if len(sys.argv) < 4 else sys.argv[3], ROOT], stdout=subprocess.PIPE, text=True)
atexit.register(proc.kill)
port = int(proc.stdout.readline()); base = f'http://127.0.0.1:{port}'
ok = []
def check(n, c, x=''): ok.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n, x)

YT = f'''<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'"><title>Vidéo YouTube</title></head>
<body><div id="movie_player" class="html5-video-player ad-showing"><video id="v" src="{base}/clip.webm" width="640" height="360" muted></video></div></body></html>'''

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    page = b.new_page()
    page.add_init_script("window.__m=[];window.__swipecastBridge={post:m=>window.__m.push(JSON.parse(JSON.stringify(m)))};")
    page.route('http://www.youtube.com/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=YT))
    page.set_default_timeout(15000); page.goto('http://www.youtube.com/watch?v=abc&t=40s'); 
    import time as _t
    for _ in range(60):
        if page.evaluate("document.getElementById('v').readyState") >= 1: break
        _t.sleep(0.25)

    page.evaluate(src)
    check('Trusted Types : injection sans exception, API définie', page.evaluate("!!window.__swipecast"))
    check('Trusted Types : pastille affichée', page.locator('swipecast-handle').count() == 1)

    # pub en cours : pas de seek, pas de progression rapportée
    page.evaluate("window.__swipecast.restore({time: 40, fullscreen: false, autoplay: true})")
    page.wait_for_timeout(1500)
    t_ad = page.evaluate("document.getElementById('v').currentTime")
    prog_during_ad = [m for m in page.evaluate("window.__m") if m['type'] == 'progress']
    check('pub YouTube : la pub n’est pas « seekée »', t_ad < 10, f't={t_ad:.1f}')
    check('pub YouTube : aucune progression rapportée', len(prog_during_ad) == 0, len(prog_during_ad))

    # fin de pub → le seek s'applique
    page.evaluate("document.getElementById('movie_player').classList.remove('ad-showing')")
    page.wait_for_timeout(1500)
    t_after = page.evaluate("document.getElementById('v').currentTime")
    check('après la pub : reprise à la bonne position', t_after >= 38, f't={t_after:.1f}')

    # la SPA retire la pastille → elle revient
    page.evaluate("document.querySelector('swipecast-handle').remove()")
    page.wait_for_timeout(1800)
    check('pastille raccrochée après réécriture du DOM', page.locator('swipecast-handle').count() == 1)

    # le swipe fonctionne toujours sous Trusted Types
    box = page.locator('swipecast-handle').bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y - 120, steps=8); page.mouse.up(); page.wait_for_timeout(200)
    check('swipe sous Trusted Types → handoff-request', any(m['type'] == 'handoff-request' for m in page.evaluate("window.__m")))
    b.close()
proc.kill()
print(f"{sum(ok)}/{len(ok)} OK"); sys.exit(0 if all(ok) else 1)
