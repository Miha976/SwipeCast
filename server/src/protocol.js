/**
 * Protocole partagé entre le serveur et les clients (messages JSON sur WebSocket).
 *
 * Client → serveur
 *   { type: 'progress', session: VideoSession }          heartbeat de lecture (~toutes les 3 s)
 *   { type: 'handoff',  session: VideoSession, to?: id }  "swipe" : envoyer la vidéo à l'autre appareil
 *   { type: 'ack',      id: string }                      le transfert a été ouvert / rejeté
 *   { type: 'ping' }
 *
 * Serveur → client
 *   { type: 'welcome',  self: Device, devices: Device[], pending: Handoff[], peerSessions: Record<id, VideoSession> }
 *   { type: 'devices',  devices: Device[] }               un appareil s'est (dé)connecté
 *   { type: 'peer-progress', from: id, session }          progression live de l'autre appareil
 *   { type: 'handoff',  handoff: Handoff }                transfert entrant
 *   { type: 'handoff-ack', id }                           le transfert envoyé a été pris en charge
 *   { type: 'error',    message }
 *   { type: 'pong' }
 *
 * @typedef {{ url: string, title: string, currentTime: number, duration: number,
 *             paused: boolean, updatedAt: number }} VideoSession
 * @typedef {{ id: string, name: string, platform: 'android'|'windows'|'web', online: boolean, lastSeen: number }} Device
 * @typedef {{ id: string, from: string, fromName: string, to: string, session: VideoSession, createdAt: number }} Handoff
 */

export const PENDING_TTL_MS = 2 * 60 * 60 * 1000; // un transfert non ouvert expire après 2 h
export const MAX_URL_LENGTH = 4096;

/** Valide et normalise une session reçue d'un client (jamais de confiance aveugle). */
export function sanitizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url ?? '');
  if (!/^https?:\/\//i.test(url) || url.length > MAX_URL_LENGTH) return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return {
    url,
    title: String(raw.title ?? '').slice(0, 300),
    currentTime: num(raw.currentTime),
    duration: num(raw.duration),
    paused: Boolean(raw.paused),
    updatedAt: Date.now(),
  };
}
