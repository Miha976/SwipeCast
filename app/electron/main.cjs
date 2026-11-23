/*
 * SwipeCast — processus principal Electron (Windows).
 *
 *  1. Démarre le hub (@swipecast/server) dans ce processus : le PC est le point de rendez-vous du téléphone.
 *  2. Affiche l'UI React (dist/ ou serveur Vite en dev).
 *  3. Gère le navigateur intégré : une WebContentsView sous la barre de 64 px,
 *     avec injection de shared/tracker.js dans TOUTES les frames (iframes de lecteurs incluses).
 *  4. Reste dans la zone de notification quand on ferme la fenêtre, pour que le téléphone puisse envoyer.
 */
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
  webFrameMain,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const BAR_HEIGHT = 64;
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const PORT = Number(process.env.SWIPECAST_PORT || 47321);
const NONCE = crypto.randomBytes(16).toString('hex');
const TRACKER = fs
  .readFileSync(path.join(__dirname, '..', 'shared', 'tracker.js'), 'utf8')
  .replace('__SWIPECAST_NONCE__', NONCE);
const ICON = path.join(__dirname, 'assets', 'icon.png');

/** @type {BrowserWindow | null} */ let win = null;
/** @type {WebContentsView | null} */ let view = null;
/** @type {Tray | null} */ let tray = null;
let hub = null;
let localDevice = null;
let quitting = false;

// --- état du navigateur intégré
let pendingRestore = null; // options de reprise en attente pour la page en cours de chargement
const restoredFrames = new Set();
const frameStates = new Map(); // frameKey -> dernier état tracker
let htmlFullscreen = false;

app.setAppUserModelId('dev.miha976.swipecast'); // indispensable pour les notifications Windows

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(boot);
}

// ======================================================================= hub
async function startHub() {
  const { createSwipecastServer } = await import('@swipecast/server');
  hub = createSwipecastServer({
    port: PORT,
    dataDir: path.join(app.getPath('userData'), 'hub'),
    log: (...a) => console.log(...a),
  });
  try {
    await hub.start();
  } catch (e) {
    dialog.showErrorBox(
      'SwipeCast',
      `Impossible d'ouvrir le port ${PORT} (${e.code || e.message}).\n` +
        'Une autre instance tourne peut-être déjà. Tu peux changer de port avec la variable SWIPECAST_PORT.',
    );
    throw e;
  }
  localDevice = hub.localDevice(os.hostname());
  hub.events.onPairingCodeChanged = (code) => win?.webContents.send('sc:pairing-code', code);
}

// ======================================================================= fenêtre
async function boot() {
  await startHub().catch(() => app.exit(1));
  createWindow();
  createTray();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#07090f',
    title: 'SwipeCast',
    icon: ICON,
    autoHideMenuBar: true,
    show: !process.argv.includes('--hidden'),
    webPreferences: {
      preload: path.join(__dirname, 'app-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('resize', layout);
  win.on('close', (e) => {
    // fermer = réduire dans la zone de notification (le hub doit rester joignable)
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  // l'UI ne navigue jamais ailleurs
  win.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip('SwipeCast — prêt à recevoir');
  const rebuild = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir SwipeCast', click: showWindow },
        {
          label: 'Lancer au démarrage de Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
            rebuild();
          },
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  rebuild();
  tray.on('click', showWindow);
}

app.on('before-quit', async () => {
  quitting = true;
  await hub?.stop().catch(() => undefined);
});
app.on('window-all-closed', () => {
  /* on reste dans la zone de notification */
});

// ======================================================================= navigateur intégré
function layout() {
  if (!win || !view) return;
  const { width, height } = win.getContentBounds();
  view.setBounds(
    htmlFullscreen ? { x: 0, y: 0, width, height } : { x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) },
  );
}

function ensureView() {
  if (view) return view;
  view = new WebContentsView({
    webPreferences: {
      partition: 'persist:browser', // cookies conservés : on reste connecté aux sites de streaming
      preload: path.join(__dirname, 'view-preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true, // = exécuter le preload aussi dans les iframes (pas de Node)
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  const wc = view.webContents;
  // UA "Chrome" standard : certains sites refusent l'UA Electron.
  wc.setUserAgent(wc.getUserAgent().replace(/\sElectron\/\S+/, '').replace(/\s(swipecast|@swipecast\/app)\/\S+/i, ''));

  wc.on('dom-ready', () => injectInto(wc.mainFrame));
  wc.on('did-frame-finish-load', (_e, isMainFrame, processId, routingId) => {
    if (isMainFrame) return; // déjà fait au dom-ready
    const frame = webFrameMain.fromId(processId, routingId);
    if (frame) injectInto(frame);
  });
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) frameStates.clear();
  });
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated']) wc.on(ev, sendState);

  wc.on('enter-html-full-screen', () => {
    htmlFullscreen = true;
    win?.setFullScreen(true);
    layout();
  });
  wc.on('leave-html-full-screen', () => {
    htmlFullscreen = false;
    win?.setFullScreen(false);
    layout();
  });

  // Popups publicitaires bloquées ; un vrai clic "nouvel onglet" s'ouvre dans la même vue.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'foreground-tab' && /^https?:/i.test(url)) wc.loadURL(url);
    return { action: 'deny' };
  });

  win.contentView.addChildView(view);
  layout();
  return view;
}

function frameKey(frame) {
  return `${frame.processId}:${frame.routingId}`;
}

async function injectInto(frame) {
  try {
    await frame.executeJavaScript(TRACKER);
  } catch {
    return; // frame détruite ou page interdisant l'exécution
  }
  if (!pendingRestore || restoredFrames.has(frameKey(frame))) return;
  restoredFrames.add(frameKey(frame));
  const opts = JSON.stringify({ ...pendingRestore, timeoutMs: 45000 });
  // userGesture=true : autorise requestFullscreen() et play() avec le son
  frame
    .executeJavaScript(`window.__swipecast && window.__swipecast.restore(${opts})`, true)
    .then((res) => {
      if (res && res.ok) pendingRestore = null;
    })
    .catch(() => undefined);
}

function runInAllFrames(code) {
  if (!view) return;
  for (const f of view.webContents.mainFrame.framesInSubtree) f.executeJavaScript(code).catch(() => undefined);
}

function sendState() {
  if (!view || !win) return;
  const wc = view.webContents;
  win.webContents.send('sc:browser-state', {
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.navigationHistory.canGoBack(),
  });
}

/** Choisit l'état de la frame qui porte la vraie vidéo (souvent une iframe de lecteur). */
function bestState() {
  const wc = view?.webContents;
  if (!wc) return null;
  const states = [...frameStates.values()];
  const withVideo = states.filter((s) => s.hasVideo);
  const pick =
    withVideo.find((s) => !s.paused) ||
    withVideo.sort((a, b) => b.duration - a.duration)[0] ||
    states.find((s) => s.isTop) || { hasVideo: false, currentTime: 0, duration: 0, paused: true };
  // l'URL et le titre à partager sont ceux de la page, pas ceux de l'iframe du lecteur
  return { ...pick, url: wc.getURL(), title: wc.getTitle() || pick.title || '', isTop: true };
}

ipcMain.on('sc:view-msg', (event, msg) => {
  if (!view || event.sender !== view.webContents || !msg || msg.nonce !== NONCE) return;
  const frame = event.senderFrame;
  if (!frame) return;
  if (msg.type === 'progress') {
    frameStates.set(frameKey(frame), msg);
    const state = bestState();
    if (state) win?.webContents.send('sc:browser-msg', { type: 'progress', ...state });
  } else if (msg.type === 'handoff-request') {
    if (msg.state) frameStates.set(frameKey(frame), msg.state);
    win?.webContents.send('sc:browser-msg', { type: 'handoff-request', state: bestState() });
  } else if (msg.type === 'toast') {
    view.webContents.mainFrame
      .executeJavaScript(`window.__swipecast && window.__swipecast.toast(${JSON.stringify(String(msg.text))})`)
      .catch(() => undefined);
  }
});

// ======================================================================= IPC depuis l'UI React
const fromUi = (event) => event.sender === win?.webContents;

ipcMain.handle('sc:get-hub', (event) => {
  if (!fromUi(event)) return null;
  return {
    baseUrl: `http://127.0.0.1:${hub.port}`,
    token: localDevice.token,
    deviceId: localDevice.deviceId,
    port: hub.port,
    addresses: hub.lanAddresses(),
    pairingCode: hub.pairingCode,
  };
});

ipcMain.handle('sc:unpair', (event, id) => {
  if (fromUi(event) && id !== localDevice.deviceId) hub.removeDevice(String(id));
});

ipcMain.handle('sc:focus', (event) => fromUi(event) && showWindow());

ipcMain.handle('sc:browser-open', async (event, url, restore) => {
  if (!fromUi(event) || !/^https?:\/\//i.test(String(url))) return;
  ensureView();
  pendingRestore = restore || null;
  restoredFrames.clear();
  frameStates.clear();
  showWindow();
  sendState();
  await view.webContents.loadURL(String(url)).catch(() => undefined); // les erreurs de chargement s'affichent dans la page
  sendState();
});

ipcMain.handle('sc:browser-close', (event) => {
  if (!fromUi(event) || !view) return;
  win.contentView.removeChildView(view);
  view.webContents.close();
  view = null;
  pendingRestore = null;
  frameStates.clear();
  if (htmlFullscreen) {
    htmlFullscreen = false;
    win.setFullScreen(false);
  }
  win.webContents.send('sc:browser-state', null);
});

ipcMain.handle('sc:browser-back', (event) => {
  if (fromUi(event) && view?.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack();
});

ipcMain.handle('sc:browser-pause', (event) => {
  if (fromUi(event)) runInAllFrames('window.__swipecast && window.__swipecast.pause()');
});

ipcMain.handle('sc:browser-toast', (event, text) => {
  if (!fromUi(event) || !view) return;
  view.webContents.mainFrame
    .executeJavaScript(`window.__swipecast && window.__swipecast.toast(${JSON.stringify(String(text))})`)
    .catch(() => undefined);
});
