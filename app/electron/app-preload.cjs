// Preload de la fenêtre principale : expose une API minimale et typée à l'UI React (window.swipecastDesktop).
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('swipecastDesktop', {
  getHub: () => ipcRenderer.invoke('sc:get-hub'),
  onPairingCode: (cb) => listen('sc:pairing-code', cb),
  unpair: (id) => ipcRenderer.invoke('sc:unpair', id),
  focusWindow: () => ipcRenderer.invoke('sc:focus'),
  browser: {
    open: (url, restore) => ipcRenderer.invoke('sc:browser-open', url, restore),
    close: () => ipcRenderer.invoke('sc:browser-close'),
    back: () => ipcRenderer.invoke('sc:browser-back'),
    pause: () => ipcRenderer.invoke('sc:browser-pause'),
    toast: (text) => ipcRenderer.invoke('sc:browser-toast', text),
    onMessage: (cb) => listen('sc:browser-msg', cb),
    onState: (cb) => listen('sc:browser-state', cb),
    onPopupBlocked: (cb) => listen('sc:popup-blocked', cb),
  },
});
