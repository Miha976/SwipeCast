import { LocalNotifications } from '@capacitor/local-notifications';
import { Emitter } from '../core/Emitter';
import type { Handoff, Platform } from '../models/types';
import { formatTime } from '../models/format';

type Events = { open: string /* handoffId */ };

export interface NotificationService {
  init(): Promise<void>;
  showHandoff(h: Handoff): Promise<void>;
  clear(handoffId: string): Promise<void>;
  /** L'utilisateur a touché la notification → ouvrir ce transfert. */
  onOpen(cb: (handoffId: string) => void): () => void;
}

const body = (h: Handoff) =>
  `${h.session.title || 'Vidéo'} — reprendre à ${formatTime(h.session.currentTime)}. Touchez pour ouvrir en plein écran.`;

/** Android : notification locale avec action "Ouvrir en plein écran". */
class CapacitorNotifications extends Emitter<Events> implements NotificationService {
  private ids = new Map<string, number>();
  private nextId = 1;

  async init() {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({
      id: 'handoff',
      name: 'Vidéos reçues',
      description: 'Vidéo envoyée depuis ton autre appareil',
      importance: 5, // heads-up
      visibility: 1,
      vibration: true,
    }).catch(() => undefined);
    await LocalNotifications.registerActionTypes({
      types: [{ id: 'HANDOFF', actions: [{ id: 'open', title: 'Ouvrir en plein écran', foreground: true }] }],
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = e.notification.extra?.handoffId as string | undefined;
      if (id) this.emit('open', id);
    });
  }

  async showHandoff(h: Handoff) {
    const id = this.nextId++;
    this.ids.set(h.id, id);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: `📲 Depuis ${h.fromName}`,
          body: body(h),
          channelId: 'handoff',
          actionTypeId: 'HANDOFF',
          autoCancel: true,
          extra: { handoffId: h.id },
        },
      ],
    });
  }

  async clear(handoffId: string) {
    const id = this.ids.get(handoffId);
    if (id) await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => undefined);
  }

  onOpen(cb: (id: string) => void) {
    return this.on('open', cb);
  }
}

/** Windows (Electron → toast natif Windows) et web : API Notification standard. */
class WebNotifications extends Emitter<Events> implements NotificationService {
  private open = new Map<string, Notification>();

  constructor(private onClickFocus?: () => Promise<void>) {
    super();
  }

  async init() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  async showHandoff(h: Handoff) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(`📲 Depuis ${h.fromName}`, { body: body(h), tag: h.id, requireInteraction: true });
    n.onclick = () => {
      void this.onClickFocus?.();
      this.emit('open', h.id);
      n.close();
    };
    this.open.set(h.id, n);
  }

  async clear(handoffId: string) {
    this.open.get(handoffId)?.close();
    this.open.delete(handoffId);
  }

  onOpen(cb: (id: string) => void) {
    return this.on('open', cb);
  }
}

export function createNotifications(platform: Platform, focus?: () => Promise<void>): NotificationService {
  return platform === 'android' ? new CapacitorNotifications() : new WebNotifications(focus);
}
