import { DEFAULT_PORT } from './types';

/** 754.2 → "12:34", 5400 → "1:30:00" */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function progressPercent(current: number, duration: number): number {
  if (!duration) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function timeAgo(ts: number, now = Date.now()): string {
  const d = Math.max(0, Math.round((now - ts) / 1000));
  if (d < 10) return 'à l’instant';
  if (d < 60) return `il y a ${d} s`;
  if (d < 3600) return `il y a ${Math.round(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return `il y a ${Math.round(d / 86400)} j`;
}

/**
 * Transforme la saisie de la barre d'adresse en URL :
 * URL complète, domaine nu ("youtube.com/watch…") ou recherche.
 */
export function toNavigableUrl(input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(v)) return `https://${v}`;
  return `https://search.brave.com/search?q=${encodeURIComponent(v)}`;
}

/** "192.168.1.20" | "192.168.1.20:47321" | "http://pc.local:47321/" → "http://192.168.1.20:47321" */
export function normalizeHubAddress(input: string): string | null {
  let v = input.trim().replace(/\/+$/, '');
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  try {
    const u = new URL(v);
    if (!u.port) u.port = String(DEFAULT_PORT);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Position de reprise : petit recul pour retrouver le contexte. */
export function resumeTime(currentTime: number, rewindSeconds: number): number {
  return Math.max(0, currentTime - rewindSeconds);
}
