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
 *  - window.open dans la PAGE PRINCIPALE : toujours bloqué (null), même vers le même site, car le
 *    tab-under ouvre justement la page courante.
 *  - window.open dans une IFRAME (lecteur Vidmoly & co) : on le laisse RÉUSSIR, comme Brave qui ouvre
 *    un onglet. Le plugin ouvre la fenêtre cachée (hiddenPopupWindow) et l'app la ferme aussitôt.
 *    Renvoyer null y serait contre-productif : ces scripts ont un plan B `if (!w) top.location = pub`
 *    lancé depuis une iframe d'un autre domaine, que la Navigation API ne peut pas annuler.
 *  - liens <a target=_blank> : autorisés vers le même site depuis la page principale, bloqués sinon
 *    (un lien ne rend pas de référence de fenêtre au script : pas de tab-under possible).
 *  - liens target=_top depuis une iframe : autorisés seulement vers le site hôte.
 *  - scripts / iframes / requêtes vers les régies connues (__SWIPECAST_AD_HOSTS__) : jamais exécutés.
 *    Balises du HTML : MutationObserver qui change leur type avant exécution (technique de « yett »).
 *    Balises ajoutées par script : interception de l'affectation de src.
 *  - page principale : redirection vers un autre site sans geste de l'utilisateur → annulée avant
 *    de partir (Navigation API), sans recharger la page.
 *  - page principale : signale les VRAIS clics (isTrusted) sur des liens → « intention de navigation ».
 *    Côté natif, un changement de site sans intention récente = redirection pub → annulée (NavigationGuard).
 * Aucune dépendance, ES5, compatible Trusted Types (les valeurs passées aux setters ne sont pas converties).
 */
(function () {
  'use strict';
  if (window.__swipecastPopupGuard) return;
  window.__swipecastPopupGuard = true;

  var NONCE = '__SWIPECAST_NONCE__';
  var AD_HOSTS = [];
  try {
    AD_HOSTS = JSON.parse('__SWIPECAST_AD_HOSTS__');
  } catch (e) {
    /* liste non injectée */
  }
  var IS_TOP = window.top === window;
  var nativeOpen = window.open;
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

  function send(detail) {
    detail.nonce = NONCE;
    try {
      if (window.mobileApp && window.mobileApp.postMessage) window.mobileApp.postMessage({ detail: detail });
    } catch (e) {
      /* pont indisponible dans cette frame */
    }
  }

  function report(url) {
    var now = Date.now();
    if (now - lastReport < 800) return; // une rafale de popups = un seul message
    lastReport = now;
    send({ type: 'popup-blocked', url: String(url || '') });
  }

  function isAdUrl(url) {
    var u = resolve(url);
    if (!u) return false;
    var h = u.hostname.toLowerCase();
    for (var i = 0; i < AD_HOSTS.length; i++) {
      if (h === AD_HOSTS[i] || h.slice(-(AD_HOSTS[i].length + 1)) === '.' + AD_HOSTS[i]) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- scripts et iframes publicitaires
  function blockSrcProperty(proto) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, 'src');
    if (!d || !d.set) return;
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) {
        if (isAdUrl(String(v))) return; // jamais chargé
        d.set.call(this, v);
      },
    });
  }
  try {
    blockSrcProperty(window.HTMLScriptElement && HTMLScriptElement.prototype);
    blockSrcProperty(window.HTMLIFrameElement && HTMLIFrameElement.prototype);
    var nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (
        String(name).toLowerCase() === 'src' &&
        (this instanceof HTMLScriptElement || this instanceof HTMLIFrameElement) &&
        isAdUrl(String(value))
      ) {
        return;
      }
      return nativeSetAttribute.apply(this, arguments);
    };
  } catch (e) {
    /* prototype verrouillé */
  }

  // Balises écrites dans le HTML : neutralisées avant exécution.
  function neutralize(node) {
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if ((tag === 'SCRIPT' || tag === 'IFRAME') && node.src && isAdUrl(node.src)) {
      if (tag === 'SCRIPT') node.type = 'javascript/blocked';
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }
  try {
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) neutralize(added[j]);
      }
    }).observe(document, { childList: true, subtree: true });
  } catch (e) {
    /* MutationObserver indisponible */
  }

  // Requêtes réseau des régies (enchères, URL de destination de la redirection…)
  try {
    if (window.fetch) {
      var nativeFetch = window.fetch;
      window.fetch = function (input) {
        var url = input && input.url ? input.url : input;
        if (isAdUrl(String(url))) return Promise.reject(new TypeError('blocked by SwipeCast'));
        return nativeFetch.apply(this, arguments);
      };
    }
    var nativeXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isAdUrl(String(url))) arguments[1] = 'about:blank#blocked';
      return nativeXhrOpen.apply(this, arguments);
    };
    if (navigator.sendBeacon) {
      var nativeBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url) {
        return isAdUrl(String(url)) ? true : nativeBeacon.apply(null, arguments);
      };
    }
  } catch (e) {
    /* API absente */
  }

  // ---------------------------------------------------------------- intentions de navigation
  // Seule la page principale compte : un clic dans l'iframe du lecteur n'est jamais une intention de changer de site.
  // ---------------------------------------------------------------- redirections : annulées AVANT de partir
  // Navigation API (Chromium ≥ 102) : l'événement navigate est annulable et indique si l'utilisateur
  // l'a déclenché (lien touché, formulaire). Une régie qui fait location.replace(pub) depuis un script de
  // la page (ou d'une iframe du même site, cas d'onclicka sur anime-sama) est stoppée net : la page ne
  // bouge pas, rien n'est rechargé. Limite de l'API : non émis si l'initiateur est une iframe d'un autre
  // domaine → filet natif (NavigationGuard, rechargement à la même position).
  if (IS_TOP && window.navigation && window.navigation.addEventListener) {
    window.navigation.addEventListener('navigate', function (e) {
      try {
        if (!e.cancelable || e.hashChange || e.navigationType === 'traverse' || e.navigationType === 'reload') return;
        var dest = resolve(e.destination && e.destination.url);
        if (!dest || !/^https?:$/.test(dest.protocol)) return;
        var adDest = isAdUrl(dest.href);
        var otherSite = baseDomain(dest.hostname) !== baseDomain(location.hostname);
        if (adDest || (otherSite && !e.userInitiated)) {
          e.preventDefault();
          send({ type: 'redirect-blocked', url: dest.href });
        }
      } catch (err) {
        /* en cas de doute, on laisse passer */
      }
    });
  }

  if (IS_TOP) {
    // Seuls les LIENS comptent (pas les boutons : la régie se déclenche au clic sur le ▶ du site).
    window.addEventListener(
      'click',
      function (e) {
        if (!e.isTrusted || !e.target || !e.target.closest) return; // a.click() d'un script ≠ clic de l'utilisateur
        var a = e.target.closest('a[href]');
        if (a && /^https?:/i.test(a.href)) send({ type: 'nav-intent', url: a.href });
      },
      true,
    );
  }

  function guardedOpen(url) {
    if (!IS_TOP) {
      // vraie fenêtre (cachée puis fermée côté natif) : le script pub ne déclenche pas son plan B
      try {
        return nativeOpen.apply(window, arguments);
      } catch (e) {
        return null;
      }
    }
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
