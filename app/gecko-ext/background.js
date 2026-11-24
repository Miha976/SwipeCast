/*
 * SwipeCast — script d'arrière-plan de l'extension intégrée (GeckoView).
 *
 * App → extension : commandes reçues sur le port natif « browser »
 *   { cmd: 'setRestore', restore: {time, fullscreen, autoplay} | null }
 *   { cmd: 'pause' } | { cmd: 'toast', text }
 * Extension → frames : diffusion à toutes les frames de l'onglet (tabs.sendMessage sans frameId).
 *
 * La reprise n'est pas « poussée » : chaque frame la DEMANDE à son chargement ({type:'hello'}).
 * Ainsi l'iframe du lecteur, qui se charge après la page, la reçoit aussi.
 */
'use strict';

const RESTORE_TTL_MS = 60000;
let port = null;
let pendingRestore = null; // { time, fullscreen, autoplay, until }

function connect() {
  port = browser.runtime.connectNative('browser');
  port.onMessage.addListener(onAppMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 1000);
  });
}

async function broadcast(message) {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) browser.tabs.sendMessage(tab.id, message).catch(() => {});
}

function onAppMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.cmd === 'setRestore') {
    pendingRestore = m.restore ? { ...m.restore, until: Date.now() + RESTORE_TTL_MS } : null;
  } else if (m.cmd === 'pause' || m.cmd === 'toast') {
    broadcast(m);
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return undefined;
  if (msg.type === 'hello') {
    const r = pendingRestore && Date.now() < pendingRestore.until ? pendingRestore : null;
    return Promise.resolve(r ? { restore: r } : {});
  }
  if (msg.type === 'restored') pendingRestore = null; // une frame a trouvé la vidéo et repris la lecture
  return undefined;
});

connect();
