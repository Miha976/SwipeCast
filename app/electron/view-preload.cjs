// Preload des pages web (et de leurs iframes) : un seul pont en écriture vers le processus principal.
// Le script de suivi, injecté dans le monde de la page, l'utilise via window.__swipecastBridge.post().
// Les messages sont signés par un jeton que seule la copie injectée du tracker connaît.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__swipecastBridge', {
  post: (msg) => {
    if (msg && typeof msg === 'object') ipcRenderer.send('sc:view-msg', msg);
  },
});
