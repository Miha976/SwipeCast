/* ---- liens target=_blank : ouverts dans l'onglet courant quand c'est légitime ----
 * GeckoView ne donne pas le geste utilisateur pour une demande de nouvelle fenêtre (hasUserGesture est
 * lu sur la fenêtre interne du navigateur, toujours faux) : le natif ne peut pas distinguer un lien
 * touché d'un popup publicitaire. Ici, dans la page, on voit le vrai tap (event.isTrusted) :
 *  - résultat touché sur un moteur de recherche → ouvert ici (Brave Search ouvre ses résultats en _blank) ;
 *  - lien du même site touché → ouvert ici.
 * Les liens _blank vers un autre site depuis un site quelconque restent bloqués par le natif (popups pub).
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
      if (!a || !openHere(location.href, a.href, a.target)) return;
      a.target = '_self'; // navigation normale de l'onglet, avec le geste de l'utilisateur
    },
    true, // phase de capture : avant que le lien ne soit suivi
  );

  window.__swipecastLinkGuard = { openHere: openHere };
})();
