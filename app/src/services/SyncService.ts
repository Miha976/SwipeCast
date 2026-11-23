import { Emitter } from '../core/Emitter';
import type { ClientMessage, Connection, ServerMessage } from '../models/types';

export type SyncStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'unauthorized';

type Events = {
  status: SyncStatus;
  message: ServerMessage;
};

/**
 * Client WebSocket vers le hub (PC). Reconnexion automatique avec backoff,
 * keep-alive applicatif, et reconnexion immédiate au retour au premier plan.
 */
export class SyncService extends Emitter<Events> {
  private ws: WebSocket | null = null;
  private conn: Connection | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _status: SyncStatus = 'idle';

  get status(): SyncStatus {
    return this._status;
  }

  connect(conn: Connection): void {
    this.conn = conn;
    this.retry = 0;
    this.open();
  }

  disconnect(): void {
    this.conn = null;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.setStatus('idle');
  }

  /** À appeler quand l'app revient au premier plan (Android met les sockets en veille). */
  ensureConnected(): void {
    if (!this.conn) return;
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) {
      this.retry = 0;
      this.open();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
    }
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private open(): void {
    if (!this.conn) return;
    this.clearTimers();
    this.ws?.close();
    this.setStatus('connecting');

    const wsUrl = `${this.conn.baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.conn.token)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      this.retry = 0;
      this.setStatus('online');
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25_000);
    };
    ws.onmessage = (ev) => {
      try {
        this.emit('message', JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        /* message illisible ignoré */
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return; // socket remplacée
      this.clearTimers();
      if (ev.code === 4001) return this.setStatus('unauthorized');
      // échec immédiat sans ouverture : soit hub injoignable, soit jeton refusé (401 au handshake)
      if (!opened && this.retry >= 3) void this.probeAuth();
      this.setStatus('offline');
      this.scheduleRetry();
    };
  }

  /** Distingue "PC éteint" de "appairage révoqué" (le handshake WS ne donne pas le code HTTP). */
  private async probeAuth(): Promise<void> {
    if (!this.conn) return;
    try {
      const r = await fetch(`${this.conn.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok && this.retry >= 3) {
        // hub joignable mais WS refusée de façon répétée → jeton invalide
        this.clearTimers();
        this.setStatus('unauthorized');
      }
    } catch {
      /* hub injoignable : on continue de réessayer */
    }
  }

  private scheduleRetry(): void {
    if (!this.conn || this._status === 'unauthorized') return;
    const delay = Math.min(15_000, 1000 * 2 ** this.retry) + Math.random() * 400;
    this.retry += 1;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private setStatus(s: SyncStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.emit('status', s);
  }
}
