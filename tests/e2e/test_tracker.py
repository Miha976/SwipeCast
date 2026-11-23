import json, sys, threading, http.server, functools, time
from playwright.sync_api import sync_playwright

ROOT, TRACKER = sys.argv[1], sys.argv[2]
src = open(TRACKER).read().replace('__SWIPECAST_NONCE__', 'N0NCE')
import subprocess
proc = subprocess.Popen(['node', 'tests/e2e/range-server.mjs', ROOT], stdout=subprocess.PIPE, text=True)
port = int(proc.stdout.readline())
url = f'http://127.0.0.1:{port}/page.html'

results = []
def check(name, cond, extra=''):
    results.append(cond); print(('PASS ' if cond else 'FAIL ') + name, extra)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    page = b.new_page(viewport={'width': 1000, 'height': 700})
    # pont simulé (rôle de view-preload.cjs / window.mobileApp)
    page.add_init_script("window.__msgs=[];window.__swipecastBridge={post:m=>window.__msgs.push(JSON.parse(JSON.stringify(m)))};")
    page.goto(url); page.wait_for_function("document.getElementById('v').readyState>=1")
    page.evaluate(src)
    msgs = lambda: page.evaluate("window.__msgs")

    st = page.evaluate("window.__swipecast.getState()")
    check('détecte la grande vidéo', st['hasVideo'] and abs(st['duration']-120) < 1, st)
    check('messages signés par le nonce', all(m.get('nonce') == 'N0NCE' for m in msgs()))

    res = page.evaluate("window.__swipecast.restore({time: 47.5, fullscreen: true, autoplay: true})")
    t = page.evaluate("document.getElementById('v').currentTime")
    check('restore → seek', 47 <= t <= 49, f't={t:.2f} res={res}')
    check('restore → lecture', res.get('playing') is True and not page.evaluate("document.getElementById('v').paused"))
    fs = page.evaluate("!!document.fullscreenElement || !!document.querySelector('video[data-swipecast-fs]')")
    check('plein écran (réel ou CSS)', fs)
    page.screenshot(path='/tmp/sctest/fullscreen.png')

    # simulation d'un lecteur qui remet la position à 0 pendant son init (cas YouTube)
    page.evaluate("document.getElementById('v').currentTime = 0")
    page.wait_for_timeout(1200)
    t2 = page.evaluate("document.getElementById('v').currentTime")
    check('re-seek si le lecteur réinitialise la position', t2 >= 45, f't={t2:.2f}')
    page.wait_for_timeout(2500)
    t3 = page.evaluate("document.getElementById('v').currentTime")
    check('pas de retour arrière pendant la lecture', t3 > t2, f'{t2:.2f} -> {t3:.2f}')
    prog = [m for m in msgs() if m['type'] == 'progress']
    check('progression remontée pendant la lecture', prog and prog[-1]['currentTime'] > 47, prog[-1] if prog else None)

    page.keyboard.press('Escape'); page.evaluate("document.exitFullscreen && document.fullscreenElement && document.exitFullscreen()")
    page.wait_for_timeout(300)
    # swipe vers le haut sur la pastille (shadow DOM fermé → coordonnées de l'hôte)
    box = page.locator('swipecast-handle').bounding_box()
    x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y-40, steps=4); page.mouse.move(x, y-120, steps=6); page.mouse.up()
    page.wait_for_timeout(200)
    ho = [m for m in msgs() if m['type'] == 'handoff-request']
    check('swipe vers le haut → handoff-request', len(ho) == 1 and ho[0]['state']['currentTime'] > 47, ho[0]['state'] if ho else None)

    # un simple tap ne doit PAS envoyer
    page.mouse.click(x, y); page.wait_for_timeout(200)
    check('tap seul n’envoie pas', len([m for m in msgs() if m['type']=='handoff-request']) == 1)

    page.evaluate("window.__swipecast.pause()")
    check('pause après envoi', page.evaluate("document.getElementById('v').paused"))

    # ré-injection idempotente
    page.evaluate(src)
    check('ré-injection idempotente', page.locator('swipecast-handle').count() == 1)

    page.keyboard.press('Alt+s'); page.wait_for_timeout(100)
    check('raccourci Alt+S', len([m for m in msgs() if m['type']=='handoff-request']) == 2)

    page.evaluate("window.__swipecast.toast('✓ Envoyé vers Pixel 8')")
    page.wait_for_timeout(150)
    page.screenshot(path='/tmp/sctest/page-handle.png')
    b.close()

proc.kill()
print(f"\n{sum(results)}/{len(results)} OK")
sys.exit(0 if all(results) else 1)
