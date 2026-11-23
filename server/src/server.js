import http from 'node:http';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Store } from './store.js';
import { sanitizeSession } from './protocol.js';

export { sanitizeSession } from './protocol.js';

/**
 * Hub SwipeCast : tourne sur le PC Windows (intégré au processus Electron, ou seul via `npm run server`).
 * Le téléphone s'y connecte en WebSocket sur le réseau local.
 *
 * @param {{ port?: number, host?: string, dataDir: string, log?: (...a: any[]) => void }} opts
 */
export function createSwipecastServer({ port = 47321, host = '0.0.0.0', dataDir, log = console.log }) {
  const store = new Store(dataDir);
  /** @type {Map<string, Set<import('ws').WebSocket>>} deviceId → sockets */
  const sockets = new Map();
  const failedPairing = { count: 0, lockedUntil: 0 };

  const isOnline = (id) => (sockets.get(id)?.size ?? 0) > 0;
  const deviceList = () =>
    Object.values(store.state.devices).map((d) => store.publicDevice(d, isOnline(d.id)));

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const sendTo = (deviceId, msg) => {
    for (const ws of sockets.get(deviceId) ?? []) send(ws, msg);
    return isOnline(deviceId);
  };
  const broadcast = (msg, exceptId) => {
    for (const [id] of sockets) if (id !== exceptId) sendTo(id, msg);
  };

  // ---------- HTTP : santé + appairage ----------
  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 10_000) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          reject(e);
        }
      });
    });

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    const json = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    if (req.method === 'GET' && req.url === '/health') {
      return json(200, { ok: true, app: 'swipecast', version: 1 });
    }

    if (req.method === 'POST' && req.url === '/pair') {
      if (Date.now() < failedPairing.lockedUntil) {
        return json(429, { error: 'Trop de tentatives, réessaie dans une minute.' });
      }
      let body;
      try {
        body = await readJson(req);
      } catch {
        return json(400, { error: 'JSON invalide' });
      }
      if (!store.checkPairingCode(body.code)) {
        failedPairing.count += 1;
        if (failedPairing.count >= 5) {
          failedPairing.lockedUntil = Date.now() + 60_000;
          failedPairing.count = 0;
        }
        return json(401, { error: 'Code d’appairage incorrect' });
      }
      failedPairing.count = 0;
      const { deviceId, token } = store.registerDevice(body);
      store.rotatePairingCode(); // code à usage unique
      events.onPairingCodeChanged?.(store.pairingCode);
      log(`[swipecast] appareil appairé : ${body.name} (${body.platform})`);
      broadcast({ type: 'devices', devices: deviceList() });
      return json(200, { deviceId, token });
    }

    json(404, { error: 'not found' });
  });

  // ---------- WebSocket ----------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const device = store.findByToken(url.searchParams.get('token'));
    if (!device) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, device));
  });

  function onConnection(ws, device) {
    const id = device.id;
    if (!sockets.has(id)) sockets.set(id, new Set());
    sockets.get(id).add(ws);
    device.lastSeen = Date.now();
    store.save();

    const peerSessions = Object.fromEntries(
      Object.entries(store.state.lastSessions).filter(([k]) => k !== id),
    );
    send(ws, {
      type: 'welcome',
      self: store.publicDevice(device, true),
      devices: deviceList(),
      pending: store.takePendingFor(id),
      peerSessions,
    });
    broadcast({ type: 'devices', devices: deviceList() }, id);

    // keep-alive : détecte les connexions mortes (Wi-Fi coupé, téléphone en veille)
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(ws, { type: 'error', message: 'JSON invalide' });
      }
      device.lastSeen = Date.now();
      handleMessage(ws, device, msg);
    });

    ws.on('close', () => {
      sockets.get(id)?.delete(ws);
      if (sockets.get(id)?.size === 0) sockets.delete(id);
      broadcast({ type: 'devices', devices: deviceList() });
    });
  }

  function handleMessage(ws, device, msg) {
    switch (msg?.type) {
      case 'ping':
        return send(ws, { type: 'pong' });

      case 'progress': {
        const session = sanitizeSession(msg.session);
        if (!session) return;
        store.state.lastSessions[device.id] = session;
        store.save();
        return broadcast({ type: 'peer-progress', from: device.id, session }, device.id);
      }

      case 'handoff': {
        const session = sanitizeSession(msg.session);
        if (!session) return send(ws, { type: 'error', message: 'Session vidéo invalide' });
        const targets = msg.to
          ? [msg.to].filter((t) => store.state.devices[t] && t !== device.id)
          : Object.keys(store.state.devices).filter((t) => t !== device.id);
        if (targets.length === 0) {
          return send(ws, { type: 'error', message: 'Aucun autre appareil appairé' });
        }
        for (const to of targets) {
          const handoff = {
            id: randomUUID(),
            from: device.id,
            fromName: device.name,
            to,
            session,
            createdAt: Date.now(),
          };
          // Toujours stocké : si le destinataire est hors ligne (app Android fermée),
          // il le récupère dans le message `welcome` à sa prochaine connexion.
          store.addPending(handoff);
          sendTo(to, { type: 'handoff', handoff });
        }
        return;
      }

      case 'ack': {
        const h = store.ackPending(String(msg.id));
        if (h) sendTo(h.from, { type: 'handoff-ack', id: h.id });
        return;
      }

      default:
        return send(ws, { type: 'error', message: `Type inconnu : ${msg?.type}` });
    }
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 20_000);

  const events = { onPairingCodeChanged: null };

  return {
    store,
    events,
    get pairingCode() {
      return store.pairingCode;
    },
    get port() {
      return httpServer.address()?.port ?? port;
    },
    /** Adresses IPv4 du PC sur le réseau local, à saisir sur le téléphone. */
    lanAddresses() {
      return Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
    },
    /** Jeton pour l'app PC elle-même (pas besoin de code : elle tourne dans le même processus). */
    localDevice(name = os.hostname()) {
      const existing = Object.values(store.state.devices).find((d) => d.local);
      if (existing) return { deviceId: existing.id, token: existing.token };
      const reg = store.registerDevice({ name, platform: 'windows' });
      store.state.devices[reg.deviceId].local = true;
      store.save();
      return reg;
    },
    devices: deviceList,
    removeDevice(id) {
      for (const ws of sockets.get(id) ?? []) ws.close(4001, 'unpaired');
      store.removeDevice(id);
      broadcast({ type: 'devices', devices: deviceList() });
    },
    start: () =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          log(`[swipecast] hub à l'écoute sur ${host}:${httpServer.address().port}`);
          resolve();
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        store.flush();
        httpServer.close(() => resolve());
      }),
  };
}
