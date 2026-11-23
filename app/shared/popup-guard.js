/*
 * SwipeCast — garde-fou anti-popup, injecté au tout début du document (avant les scripts de la page)
 * dans TOUTES les frames, y compris l'iframe du lecteur vidéo.
 *
 * Cible le "tab-under" des régies pub : le script ouvre la page courante dans une nouvelle fenêtre
 * puis remplace la page d'origine par la pub (location.replace) → la pub devient la page active et
 * l'historique perd l'épisode. Si window.open renvoie null, ces scripts abandonnent (c'est ce qui se
 * passe sur PC où Electron refuse toutes les fenêtres).
 *
 * Règles :
 *  - window.open est TOUJOURS bloqué, y compris vers le même site : le tab-under ouvre justement
 *    la page courante. (Même politique que sur PC, où Electron refuse toutes les fenêtres.)
 *  - liens <a target=_blank> : autorisés vers le même site depuis la page principale, bloqués sinon
 *    (un lien ne rend pas de référence de fenêtre au script : pas de tab-under possible).
 *  - liens target=_top depuis une iframe : autorisés seulement vers le site hôte.
 * Aucune dépendance, ES5, compatible Trusted Types.
 */
(function () {
  'use strict';
  if (window.__swipecastPopupGuard) return;
  window.__swipecastPopupGuard = true;

  var NONCE = '__SWIPECAST_NONCE__';
  var IS_TOP = window.top === window;
  var lastReport = 0;

  function baseDomain(host) {
    var p = String(host || '').toLowerCase().split('.');
    var twoLevel = p.length > 2 && /^(co|com|org|net|gov|ac|edu)$/.test(p[p.length - 2]);
    return p.slice(twoLevel ? -3 : -2).join('.');
  }

  function resolve(url) {
    try {
      return new URL(String(url || ''), location.href);
    } catch (e) {
      return null;
    }
  }

  function allowed(url) {
    if (!IS_TOP) return false;
    var u = resolve(url);
    return !!u && /^https?:$/.test(u.protocol) && baseDomain(u.hostname) === baseDomain(location.hostname);
  }

  function report(url) {
    var now = Date.now();
    if (now - lastReport < 800) return; // une rafale de popups = un seul message
    lastReport = now;
    try {
      if (window.mobileApp && window.mobileApp.postMessage) {
        window.mobileApp.postMessage({ detail: { type: 'popup-blocked', url: String(url || ''), nonce: NONCE } });
      }
    } catch (e) {
      /* pont indisponible dans cette frame */
    }
  }

  function guardedOpen(url) {
    report(url);
    return null;
  }

  try {
    Object.defineProperty(window, 'open', { value: guardedOpen, writable: false, configurable: false });
  } catch (e) {
    window.open = guardedOpen;
  }

  // Liens <a target="_blank"> (souvent un calque transparent posé sur le lecteur) : vers un autre site → bloqués.
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[target]') : null;
      if (!a) return;
      var t = String(a.getAttribute('target') || '').toLowerCase();
      if (t === '' || t === '_self') return;
      if (t === '_top' || t === '_parent') {
        // depuis l'iframe du lecteur, un lien _top remplace toute la page : autorisé seulement vers le site hôte
        if (IS_TOP) return;
        var dest = resolve(a.href);
        var host = resolve(document.referrer);
        if (dest && host && baseDomain(dest.hostname) === baseDomain(host.hostname)) return;
      } else if (allowed(a.href)) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      report(a.href);
    },
    true,
  );
})();
