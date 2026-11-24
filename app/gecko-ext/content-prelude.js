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
