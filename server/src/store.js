import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { PENDING_TTL_MS } from './protocol.js';

/**
 * Persistance minimale dans un fichier JSON (2 appareils : pas besoin d'une base).
 * Écriture atomique (fichier temporaire + rename) et debounce.
 */
export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = join(dataDir, 'swipecast-data.json');
    mkdirSync(dataDir, { recursive: true });
    this.state = { devices: {}, lastSessions: {}, pending: [] };
    try {
      this.state = { ...this.state, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch {
      /* premier lancement */
    }
    this.pairingCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this._timer = null;
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file);
  }

  rotatePairingCode() {
    this.pairingCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    return this.pairingCode;
  }

  checkPairingCode(code) {
    const a = Buffer.from(String(code ?? ''));
    const b = Buffer.from(this.pairingCode);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Enregistre (ou ré-enregistre) un appareil et renvoie son jeton secret. */
  registerDevice({ name, platform, id }) {
    const deviceId = id && this.state.devices[id] ? id : randomUUID();
    const token = randomBytes(32).toString('base64url');
    this.state.devices[deviceId] = {
      id: deviceId,
      name: String(name || 'Appareil').slice(0, 60),
      platform: ['android', 'windows', 'web'].includes(platform) ? platform : 'web',
      token,
      lastSeen: Date.now(),
    };
    this.save();
    return { deviceId, token };
  }

  findByToken(token) {
    if (!token) return null;
    return Object.values(this.state.devices).find((d) => d.token === token) ?? null;
  }

  removeDevice(id) {
    delete this.state.devices[id];
    delete this.state.lastSessions[id];
    this.state.pending = this.state.pending.filter((h) => h.to !== id && h.from !== id);
    this.save();
  }

  publicDevice(d, online) {
    return { id: d.id, name: d.name, platform: d.platform, online, lastSeen: d.lastSeen };
  }

  addPending(handoff) {
    // Un seul transfert en attente par destinataire : le plus récent gagne.
    this.state.pending = this.state.pending.filter((h) => h.to !== handoff.to);
    this.state.pending.push(handoff);
    this.save();
  }

  takePendingFor(deviceId) {
    const now = Date.now();
    this.state.pending = this.state.pending.filter((h) => now - h.createdAt < PENDING_TTL_MS);
    return this.state.pending.filter((h) => h.to === deviceId);
  }

  ackPending(id) {
    const h = this.state.pending.find((p) => p.id === id);
    this.state.pending = this.state.pending.filter((p) => p.id !== id);
    this.save();
    return h ?? null;
  }
}
