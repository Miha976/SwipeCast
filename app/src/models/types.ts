// ===== Modèle : types du domaine (miroir de server/src/protocol.js) =====

export type Platform = 'android' | 'windows' | 'web';

export interface VideoSession {
  url: string;
  title: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  updatedAt: number;
}

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  online: boolean;
  lastSeen: number;
}

export interface Handoff {
  id: string;
  from: string;
  fromName: string;
  to: string;
  session: VideoSession;
  createdAt: number;
}

export interface Connection {
  baseUrl: string; // ex. http://192.168.1.20:47321
  token: string;
  deviceId: string;
  /** identité stable du PC : permet de le retrouver par découverte quand son IP change */
  hubId?: string;
  hubName?: string;
}

export type ServerMessage =
  | {
      type: 'welcome';
      self: Device;
      devices: Device[];
      pending: Handoff[];
      peerSessions: Record<string, VideoSession>;
    }
  | { type: 'devices'; devices: Device[] }
  | { type: 'peer-progress'; from: string; session: VideoSession }
  | { type: 'handoff'; handoff: Handoff }
  | { type: 'handoff-ack'; id: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'progress'; session: Omit<VideoSession, 'updatedAt'> }
  | { type: 'handoff'; session: Omit<VideoSession, 'updatedAt'>; to?: string }
  | { type: 'ack'; id: string }
  | { type: 'ping' };

/** État remonté par shared/tracker.js depuis la page. */
export interface TrackerState {
  url: string;
  title: string;
  isTop: boolean;
  hasVideo: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
}

export type TrackerMessage =
  | ({ type: 'progress' } & TrackerState)
  | { type: 'handoff-request'; state: TrackerState }
  | { type: 'ready'; isTop: boolean; url: string }
  | { type: 'toast'; text: string };

export interface RestoreOptions {
  time: number;
  fullscreen: boolean;
  autoplay: boolean;
}

export interface BrowsingState {
  url: string;
  title: string;
  canGoBack: boolean;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  currentTime: number;
  duration: number;
  at: number;
  kind: 'received' | 'sent' | 'opened';
  peerName?: string;
}

export interface Settings {
  /** secondes de recul à la reprise, pour retrouver le contexte */
  rewindSeconds: number;
  autoFullscreen: boolean;
}

export const DEFAULT_SETTINGS: Settings = { rewindSeconds: 3, autoFullscreen: true };
export const DEFAULT_PORT = 47321;
