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
