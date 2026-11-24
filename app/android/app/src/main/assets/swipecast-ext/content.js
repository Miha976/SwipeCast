/*
 * SwipeCast — script de contenu (toutes les frames, document_start), monde isolé de l'extension.
 * Fichier généré par app/scripts/build-gecko-ext.mjs : prélude + shared/tracker.js + épilogue.
 * La page ne peut ni lire ni imiter ce pont : aucun jeton nécessaire.
 */
(function () {
  'use strict';
  var FRAME = Math.random().toString(36).slice(2);
  window.__swipecastBridge = {
    post: function (msg) {
      msg.frame = FRAME;
      try {
        browser.runtime.sendNativeMessage('browser', msg).catch(function () {});
      } catch (e) {
        /* app pas encore à l'écoute */
      }
    },
  };
})();

/* ---- liens touchés : ouverture dans l'onglet + signal « tap réel » pour le natif ----
 * GeckoView ne donne pas le geste utilisateur pour une demande de nouvelle fenêtre (hasUserGesture est
 * lu sur la fenêtre interne du navigateur, toujours faux) : le natif ne peut pas distinguer un lien
 * touché d'un popup publicitaire. Ici, dans la page, on voit le vrai tap (event.isTrusted) :
 *  - résultat touché sur un moteur de recherche → ouvert ici (Brave Search ouvre ses résultats en _blank) ;
 *  - lien du même site touché → ouvert ici.
 * Les liens _blank vers un autre site depuis un site quelconque restent bloqués par le natif (popups pub).
 *
 * Pour la même raison, une navigation vers un AUTRE site arrive au natif sans geste (changement de
 * processus) et serait prise pour une redirection pub : on lui signale le tap réel (message « userNav »),
 * qu'il attend brièvement avant de décider (GeckoHost.allowIfTapped).
 */
(function () {
  'use strict';
  if (window.top !== window) return; // les liens des iframes (pubs dans le lecteur) ne sont pas concernés

  var SEARCH_HOSTS = ['search.brave.com', 'duckduckgo.com', 'html.duckduckgo.com', 'www.bing.com',
    'www.qwant.com', 'www.ecosia.org', 'www.startpage.com', 'search.yahoo.com'];

  function baseDomain(host) {
    var p = String(host || '').toLowerCase().replace(/\.$/, '').split('.');
    if (p.length <= 2) return p.join('.');
    var n = /^(co|com|org|net|gov|ac|edu)$/.test(p[p.length - 2]) ? 3 : 2;
    return p.slice(p.length - n).join('.');
  }
  function isSearchEngine(u) {
    return SEARCH_HOSTS.indexOf(u.hostname) >= 0 || /^www\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(u.hostname);
  }
  /** Lien vers un autre site (http/https) : le natif doit être prévenu du tap. (fonction pure, testée) */
  function crossSite(pageHref, linkHref) {
    try {
      var page = new URL(pageHref), link = new URL(linkHref, pageHref);
      return /^https?:$/.test(link.protocol) && baseDomain(link.hostname) !== baseDomain(page.hostname);
    } catch (e) {
      return false;
    }
  }

  /** Ouvrir ce lien dans l'onglet courant ? (fonction pure, testée) */
  function openHere(pageHref, linkHref, target) {
    var t = String(target || '').toLowerCase();
    if (!t || t === '_self' || t === '_top' || t === '_parent') return false; // déjà dans l'onglet
    var page, link;
    try {
      page = new URL(pageHref);
      link = new URL(linkHref, pageHref);
    } catch (e) {
      return false;
    }
    if (!/^https?:$/.test(link.protocol) || !/^https?:$/.test(page.protocol)) return false;
    return isSearchEngine(page) || baseDomain(link.hostname) === baseDomain(page.hostname);
  }

  document.addEventListener(
    'click',
    function (e) {
      if (!e.isTrusted || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      if (openHere(location.href, a.href, a.target)) a.target = '_self'; // navigation normale de l'onglet
      if (crossSite(location.href, a.href) && window.__swipecastBridge) {
        window.__swipecastBridge.post({ type: 'userNav', url: a.href, page: location.href });
      }
    },
    true, // phase de capture : avant que le lien ne soit suivi
  );

  window.__swipecastLinkGuard = { openHere: openHere, crossSite: crossSite };
})();

/* ---- shared/tracker.js ---- */
/*
 * SwipeCast — script injecté dans chaque page du navigateur intégré (monde principal de la page).
 *
 *  - détecte la vidéo principale (<video> le plus grand) et remonte sa progression ;
 *  - restaure une position (seek + lecture + plein écran) à la réception d'un transfert ;
 *  - affiche une poignée "glisser pour envoyer" (frame principale uniquement).
 *
 * Pont vers l'app : window.__swipecastBridge.post(msg)
 *   - PC (Electron)        : exposé par electron/view-preload.cjs
 *   - Android (GeckoView)  : défini par l'extension intégrée (app/gecko-ext/content-prelude.js)
 *
 * Idempotent : peut être ré-injecté à chaque navigation sans effet de bord.
 */
(function () {
  'use strict';
  if (window.__swipecast && window.__swipecast.version === 1) {
    window.__swipecast.rescan();
    return;
  }

  var IS_TOP = window.top === window;
  // Jeton remplacé à l'injection par l'app : une page ne peut pas le lire (closure),
  // donc elle ne peut pas forger un "handoff-request" via le pont.
  var NONCE = '__SWIPECAST_NONCE__';
  var REPORT_EVERY_MS = 3000;

  function post(msg) {
    msg.nonce = NONCE;
    try {
      if (window.__swipecastBridge && window.__swipecastBridge.post) return window.__swipecastBridge.post(msg);
    } catch (e) {
      /* le pont n'est pas encore prêt */
    }
  }

  // ---------------------------------------------------------------- vidéo
  var video = null;
  var lastReport = 0;

  function area(v) {
    var r = v.getBoundingClientRect();
    return r.width * r.height;
  }

  function findVideos(root, out) {
    var list = root.querySelectorAll('video');
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    // certains lecteurs (web components) cachent la vidéo dans un shadow DOM ouvert
    var all = root.querySelectorAll('*');
    for (var j = 0; j < all.length && j < 4000; j++) if (all[j].shadowRoot) findVideos(all[j].shadowRoot, out);
    return out;
  }

  function pickVideo() {
    var vids = findVideos(document, []).filter(function (v) {
      return (v.duration > 0 || v.readyState > 0 || v.src || v.currentSrc) && area(v) > 0;
    });
    vids.sort(function (a, b) {
      // priorité à celle qui joue, puis à la plus grande
      return (b.paused ? 0 : 1) - (a.paused ? 0 : 1) || area(b) - area(a);
    });
    return vids[0] || null;
  }

  // Pendant une pub YouTube, le <video> lit la pub : on ne doit ni rapporter sa position ni la "seeker".
  function isAdPlaying() {
    return /(^|\.)youtube\.com$/.test(location.hostname) && !!document.querySelector('.ad-showing');
  }

  function state() {
    var v = video;
    return {
      url: location.href,
      title: document.title || location.hostname,
      isTop: IS_TOP,
      hasVideo: !!v,
      currentTime: v ? v.currentTime || 0 : 0,
      duration: v && isFinite(v.duration) ? v.duration : 0,
      paused: v ? v.paused : true,
    };
  }

  function report(force) {
    var now = Date.now();
    if (!force && now - lastReport < REPORT_EVERY_MS) return;
    if (isAdPlaying()) return;
    lastReport = now;
    var s = state();
    s.type = 'progress';
    post(s);
  }

  function onVideoEvent(e) {
    report(e.type !== 'timeupdate');
  }

  function attach(v) {
    if (video === v) return;
    if (video) {
      ['timeupdate', 'pause', 'play', 'seeked', 'ended'].forEach(function (t) {
        video.removeEventListener(t, onVideoEvent);
      });
    }
    video = v;
    if (v) {
      ['timeupdate', 'pause', 'play', 'seeked', 'ended'].forEach(function (t) {
        v.addEventListener(t, onVideoEvent);
      });
      report(true);
    }
    updateHandle();
  }

  function rescan() {
    attach(pickVideo());
    if (host && !host.isConnected) buildHandle();
  }

  // Les SPA (YouTube…) remplacent les vidéos sans recharger la page.
  var scanTimer = setInterval(rescan, 1500);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) report(true);
  });
  window.addEventListener('pagehide', function () {
    report(true);
  });

  // ------------------------------------------------- restauration / pilotage
  function waitForVideo(timeoutMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function poll() {
        var v = pickVideo();
        if (v && v.readyState >= 1 && v.duration > 0) return resolve(v);
        if (Date.now() - start > timeoutMs) return resolve(v);
        setTimeout(poll, 400);
      })();
    });
  }

  function restore(opts) {
    opts = opts || {};
    var t = Math.max(0, Number(opts.time) || 0);
    return waitForVideo(opts.timeoutMs || 45000).then(function (v) {
      if (!v) return { ok: false, reason: 'no-video' };
      attach(v);
      if (t > 0 && (!v.duration || t < v.duration - 3)) seekRobust(v, t);
      var fs = opts.fullscreen ? enterFullscreen(v) : Promise.resolve();
      return fs.then(function () {
        if (opts.autoplay === false) return { ok: true, playing: false };
        return v.play().then(
          function () {
            return { ok: true, playing: true };
          },
          function () {
            // Politique d'autoplay : on relance en muet et on propose de réactiver le son.
            v.muted = true;
            return v.play().then(
              function () {
                toast('Touchez pour activer le son', function () {
                  v.muted = false;
                });
                return { ok: true, playing: true, muted: true };
              },
              function () {
                toast('Touchez pour reprendre la lecture', function () {
                  v.play();
                });
                return { ok: true, playing: false };
              },
            );
          },
        );
      });
    });
  }

  /*
   * Seek "têtu" : la vidéo peut ne pas être encore seekable (flux pas chargé) et certains
   * lecteurs (YouTube, lecteurs MSE) remettent la position à zéro pendant leur initialisation.
   * On réapplique la position tant qu'elle n'a pas tenu, pendant 15 s maximum.
   */
  function seekRobust(v, t) {
    var deadline = Date.now() + 15000;
    var settledSince = 0;
    // "tenu" = le lecteur n'est pas revenu en arrière (pendant la lecture, la position dépasse t)
    function held() {
      return v.currentTime >= t - 2.5;
    }
    function apply() {
      if (isAdPlaying()) return false; // on attend la fin de la pub
      if (held()) return true;
      try {
        v.currentTime = t;
      } catch (e) {
        /* pas encore seekable */
      }
      return false;
    }
    apply();
    var events = ['loadedmetadata', 'canplay', 'progress', 'durationchange', 'seeked'];
    function onEvt() {
      apply();
    }
    events.forEach(function (e) {
      v.addEventListener(e, onEvt);
    });
    var timer = setInterval(function () {
      if (isAdPlaying()) {
        deadline = Date.now() + 15000; // la pub ne consomme pas le délai
        settledSince = 0;
        return;
      }
      // la position doit tenir 2 s de suite (le lecteur peut la réinitialiser juste après)
      if (held()) {
        if (!settledSince) settledSince = Date.now();
      } else {
        settledSince = 0;
        apply();
      }
      if ((settledSince && Date.now() - settledSince > 2000) || Date.now() > deadline || v !== video) {
        clearInterval(timer);
        events.forEach(function (e) {
          v.removeEventListener(e, onEvt);
        });
      }
    }, 300);
  }

  function pause() {
    if (video && !video.paused) video.pause();
    report(true);
  }

  // Plein écran : vrai plein écran si autorisé (Electron injecte avec userGesture),
  // sinon "pseudo plein écran" CSS qui fonctionne partout.
  var pseudoStyle = null;
  function enterFullscreen(v) {
    if (document.fullscreenElement) return Promise.resolve();
    var req = v.requestFullscreen || v.webkitRequestFullscreen;
    var p;
    try {
      p = req ? req.call(v) : null;
    } catch (e) {
      p = null;
    }
    return Promise.resolve(p).then(
      function () {
        if (!document.fullscreenElement) setPseudoFullscreen(v, true);
      },
      function () {
        setPseudoFullscreen(v, true);
      },
    );
  }

  function setPseudoFullscreen(v, on) {
    if (on && !pseudoStyle) {
      v.setAttribute('data-swipecast-fs', '');
      pseudoStyle = document.createElement('style');
      pseudoStyle.textContent =
        'video[data-swipecast-fs]{position:fixed!important;inset:0!important;width:100vw!important;' +
        'height:100vh!important;max-width:none!important;max-height:none!important;z-index:2147483646!important;' +
        'background:#000!important;object-fit:contain!important;transform:none!important}' +
        'html,body{overflow:hidden!important}';
      (document.head || document.documentElement).appendChild(pseudoStyle);
      v.controls = true;
    } else if (!on && pseudoStyle) {
      pseudoStyle.remove();
      pseudoStyle = null;
      var el = document.querySelector('video[data-swipecast-fs]');
      if (el) el.removeAttribute('data-swipecast-fs');
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pseudoStyle) setPseudoFullscreen(null, false);
    if (IS_TOP && e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      requestHandoff();
    }
  });

  // ------------------------------------------------------- UI injectée
  var host = null;
  var ui = {};

  // Construction sans innerHTML : YouTube (et d'autres) imposent Trusted Types,
  // qui fait lever une exception sur toute affectation d'innerHTML.
  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  function buildHandle() {
    if (!IS_TOP || !document.body) return;
    if (host) {
      // certaines SPA réécrivent <body> : on raccroche la pastille si elle a été retirée
      if (!host.isConnected) document.body.appendChild(host);
      return;
    }
    try {
      host = document.createElement('swipecast-handle');
      host.style.cssText = 'all:initial;position:fixed;right:14px;bottom:88px;z-index:2147483647;';
      var root = host.attachShadow({ mode: 'closed' });
      var style = el('style', null, root);
      style.textContent =
        ':host{all:initial}' +
        '.pill{font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;' +
        'align-items:center;gap:6px;padding:12px 10px;border-radius:999px;color:#fff;cursor:grab;user-select:none;' +
        'touch-action:none;background:linear-gradient(160deg,#6d5efc,#22d3ee);box-shadow:0 8px 24px rgba(0,0,0,.35);' +
        'opacity:.85;transition:opacity .2s,transform .25s cubic-bezier(.2,.8,.2,1)}' +
        '.pill:hover,.pill.active{opacity:1}' +
        '.pill.idle{opacity:.5}' +
        '.arrow{width:20px;height:20px;display:block}' +
        '.label{writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.06em;font-size:13px;text-shadow:0 1px 2px rgba(0,0,0,.35)}' +
        '.pill.sent{transform:translateY(-120vh)!important;opacity:0}' +
        '.toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);max-width:86vw;' +
        'font:600 16px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;background:#111827f0;' +
        'padding:14px 20px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.4);cursor:pointer;display:none}' +
        '.toast.show{display:block}';

      ui.pill = el('div', 'pill', root);
      ui.pill.title = 'Glisser vers le haut pour envoyer (Alt+S)';
      var SVG = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'arrow');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#fff');
      svg.setAttribute('stroke-width', '2.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', 'M12 19V5M6 11l6-6 6 6');
      svg.appendChild(path);
      ui.pill.appendChild(svg);
      ui.label = el('span', 'label', ui.pill);
      ui.label.textContent = 'Envoyer';
      ui.toast = el('div', 'toast', root);

      document.body.appendChild(host);
      bindGesture(ui.pill);
      updateHandle();
    } catch (e) {
      // l'interface ne doit jamais empêcher le suivi vidéo de fonctionner
      host = null;
      ui = {};
    }
  }

  function updateHandle() {
    if (!ui.pill) return;
    ui.pill.classList.toggle('idle', !video);
  }

  function bindGesture(el) {
    var startY = 0;
    var startX = 0;
    var dragging = false;
    el.addEventListener('pointerdown', function (e) {
      dragging = true;
      startY = e.clientY;
      startX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.classList.add('active');
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = Math.min(0, e.clientY - startY);
      el.style.transform = 'translateY(' + dy + 'px) scale(' + (1 + Math.min(0.25, -dy / 400)) + ')';
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      el.style.transform = '';
      el.classList.remove('active');
      var dy = e.clientY - startY;
      var dx = Math.abs(e.clientX - startX);
      if (dy < -70) {
        el.classList.add('sent');
        setTimeout(function () {
          el.classList.remove('sent');
        }, 1200);
        requestHandoff();
      } else if (Math.abs(dy) < 8 && dx < 8) {
        toast('Glisse la pastille vers le haut pour envoyer la vidéo');
      }
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  var toastTimer = null;
  function toast(text, onClick) {
    if (!IS_TOP) {
      post({ type: 'toast', text: text });
      if (onClick) document.addEventListener('pointerdown', onClick, { once: true, capture: true });
      return;
    }
    buildHandle();
    if (!ui.toast) return;
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    ui.toast.onclick = function () {
      ui.toast.classList.remove('show');
      if (onClick) onClick();
    };
    if (onClick) document.addEventListener('pointerdown', onClick, { once: true, capture: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      ui.toast.classList.remove('show');
    }, onClick ? 8000 : 3500);
  }

  function requestHandoff() {
    report(true);
    post({ type: 'handoff-request', state: state() });
  }

  window.__swipecast = {
    version: 1,
    rescan: rescan,
    getState: state,
    restore: restore,
    pause: pause,
    toast: toast,
    exitFullscreen: function () {
      setPseudoFullscreen(null, false);
    },
    dispose: function () {
      clearInterval(scanTimer);
      attach(null);
      if (host) host.remove();
    },
  };

  if (IS_TOP) {
    if (document.body) buildHandle();
    else document.addEventListener('DOMContentLoaded', buildHandle);
  }

  rescan();
  post({ type: 'ready', isTop: IS_TOP, url: location.href });
})();

/* ---- épilogue : commandes de l'app et reprise demandée au chargement ---- */
(function () {
  'use strict';
  var api = window.__swipecast;
  if (!api) return;

  browser.runtime.onMessage.addListener(function (m) {
    if (!m || !m.cmd) return;
    if (m.cmd === 'pause') api.pause();
    if (m.cmd === 'toast' && window.top === window) api.toast(m.text);
  });

  browser.runtime
    .sendMessage({ type: 'hello' })
    .then(function (r) {
      if (!r || !r.restore) return;
      return api.restore(r.restore).then(function (res) {
        if (res && res.ok) browser.runtime.sendMessage({ type: 'restored' });
      });
    })
    .catch(function () {});
})();
