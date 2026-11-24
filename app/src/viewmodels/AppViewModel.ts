import { App as CapApp } from '@capacitor/app';
import { ViewModel } from '../core/ViewModel';
import type {
  BrowsingState,
  Connection,
  Device,
  Handoff,
  HistoryEntry,
  ServerMessage,
  Settings,
  TrackerState,
  VideoSession,
} from '../models/types';
import { DEFAULT_SETTINGS } from '../models/types';
import { resumeTime, toNavigableUrl } from '../models/format';
import { withStartTime } from '../models/siteAdapters';
import type { Services } from '../services/container';
import type { SyncStatus } from '../services/SyncService';
import { StorageKeys } from '../services/StorageService';
import type { PermissionStatus } from '../services/LocalNetworkPermission';

export interface AppState {
  ready: boolean;
  platform: Services['platform'];
  connection: Connection | null;
  status: SyncStatus;
  self: Device | null;
  devices: Device[];
  /** dernière progression connue de chaque autre appareil */
  peerSessions: Record<string, VideoSession>;
  /** transfert entrant à proposer à l'utilisateur */
  incoming: Handoff | null;
  browsing: BrowsingState | null;
  /** dernière progression de la page ouverte ici */
  local: TrackerState | null;
  history: HistoryEntry[];
  settings: Settings;
  snackbar: { text: string; tone: 'ok' | 'warn' | 'bad' } | null;
  /** accès au réseau local (Android 17 : permission d'exécution) — requis pour joindre le PC */
  localNetwork: PermissionStatus;
  /** dernière popup bloquée (affichée dans la barre du navigateur sur PC) */
  blockedPopup: { url: string | null; count: number } | null;
  view: 'home' | 'pairing';
}

/**
 * ViewModel principal : orchestre la synchro, le navigateur intégré et les notifications.
 * Ne connaît aucune API de plateforme directement (tout passe par Services).
 */
export class AppViewModel extends ViewModel<AppState> {
  private autoOpenId: string | null = null;
  private lastProgressSent = 0;
  private lastHistorySave = 0;
  private snackTimer: ReturnType<typeof setTimeout> | null = null;
  private initStarted = false;
  private popupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private s: Services) {
    super({
      ready: false,
      platform: s.platform,
      connection: null,
      status: 'idle',
      self: null,
      devices: [],
      peerSessions: {},
      incoming: null,
      browsing: null,
      local: null,
      history: [],
      settings: DEFAULT_SETTINGS,
      snackbar: null,
      blockedPopup: null,
      localNetwork: 'granted',
      view: 'home',
    });
  }

  // ------------------------------------------------------------ cycle de vie
  async init(): Promise<void> {
    if (this.initStarted) return;
    this.initStarted = true;
    const { sync, browser, notifications, storage, history } = this.s;

    this.track(sync.on('status', (status) => this.setState({ status })));
    this.track(sync.on('message', (m) => this.onServerMessage(m)));
    this.track(browser.onMessage((m) => this.onTrackerMessage(m)));
    this.track(
      browser.onState((browsing) => {
        this.setState({ browsing, ...(browsing ? {} : { local: null }) });
      }),
    );
    this.track(notifications.onOpen((id) => this.openHandoffById(id)));
    this.track(
      browser.onPopupBlocked(({ url }) => {
        if (this.popupTimer) clearTimeout(this.popupTimer);
        this.setState((st) => ({ blockedPopup: { url, count: (st.blockedPopup?.count ?? 0) + 1 } }));
        this.popupTimer = setTimeout(() => this.setState({ blockedPopup: null }), 10_000);
      }),
    );

    await notifications.init().catch((e) => console.warn('notifications', e));

    if (this.s.platform === 'android') {
      // Android suspend la WebView en arrière-plan : on se reconnecte au retour.
      // Retour au premier plan (ex. depuis les paramètres Android) : permission revérifiée, reconnexion.
      const h = await CapApp.addListener('resume', () => void this.refreshLocalNetwork().then(() => sync.ensureConnected()));
      this.track(() => void h.remove());
    }
    const onVisible = () => document.visibilityState === 'visible' && sync.ensureConnected();
    document.addEventListener('visibilitychange', onVisible);
    this.track(() => document.removeEventListener('visibilitychange', onVisible));

    const settings = { ...DEFAULT_SETTINGS, ...((await storage.get<Settings>(StorageKeys.settings)) ?? {}) };
    const list = await history.list();

    // Sur PC, la connexion est fournie par le hub embarqué ; ailleurs, elle vient de l'appairage.
    let connection: Connection | null = null;
    if (this.s.desktop) {
      const hub = await this.s.desktop.getHub();
      connection = { baseUrl: hub.baseUrl, token: hub.token, deviceId: hub.deviceId };
    } else {
      connection = await storage.get<Connection>(StorageKeys.connection);
    }

    this.setState({
      ready: true,
      settings,
      history: list,
      connection,
      view: connection ? 'home' : 'pairing',
      localNetwork: await this.s.localNetwork.check(),
    });
    if (connection) {
      // Déjà appairé : sans l'accès au réseau local, la connexion échouerait en silence.
      if (this.state.localNetwork !== 'granted') await this.ensureLocalNetwork();
      sync.connect(connection);
    }
  }

  // ------------------------------------------------------------ réseau local (Android 17)
  private async refreshLocalNetwork(): Promise<PermissionStatus> {
    const localNetwork = await this.s.localNetwork.check();
    this.setState({ localNetwork });
    return localNetwork;
  }

  /** Demande la permission si Android peut encore l'afficher ; renvoie l'état final. */
  async ensureLocalNetwork(): Promise<PermissionStatus> {
    let state = await this.refreshLocalNetwork();
    if (state === 'prompt' || state === 'prompt-with-rationale') {
      state = await this.s.localNetwork.request();
      this.setState({ localNetwork: state });
    }
    if (state === 'granted') this.s.sync.ensureConnected();
    return state;
  }

  /** Bouton du bandeau : nouvelle demande, ou paramètres Android si la demande n'est plus proposée. */
  async allowLocalNetwork(): Promise<void> {
    if (this.state.localNetwork === 'denied') {
      await this.s.localNetwork.openSettings(); // la permission est revérifiée au retour (resume)
      return;
    }
    await this.ensureLocalNetwork();
  }

  // ------------------------------------------------------------ appairage
  async setConnection(conn: Connection): Promise<void> {
    await this.s.storage.set(StorageKeys.connection, conn);
    this.setState({ connection: conn, view: 'home' });
    this.s.sync.connect(conn);
    this.flash('Appairé avec le PC ✓', 'ok');
  }

  async forgetConnection(): Promise<void> {
    this.s.sync.disconnect();
    await this.s.storage.remove(StorageKeys.connection);
    this.setState({ connection: null, self: null, devices: [], peerSessions: {}, view: 'pairing' });
  }

  showPairing(show: boolean): void {
    this.setState({ view: show ? 'pairing' : 'home' });
  }

  // ------------------------------------------------------------ messages serveur
  private onServerMessage(m: ServerMessage): void {
    switch (m.type) {
      case 'welcome':
        this.setState({ self: m.self, devices: m.devices, peerSessions: m.peerSessions });
        // transferts reçus pendant que l'app était fermée
        if (m.pending.length) this.receiveHandoff(m.pending[m.pending.length - 1], false);
        break;
      case 'devices':
        this.setState({ devices: m.devices });
        break;
      case 'peer-progress':
        this.setState((st) => ({ peerSessions: { ...st.peerSessions, [m.from]: m.session } }));
        break;
      case 'handoff':
        this.receiveHandoff(m.handoff, true);
        break;
      case 'handoff-ack':
        this.flash('Bien reçu par l’autre appareil ✓', 'ok');
        break;
      case 'error':
        this.flash(m.message, 'bad');
        break;
    }
  }

  private receiveHandoff(h: Handoff, notify: boolean): void {
    this.setState({ incoming: h });
    if (this.autoOpenId === h.id) {
      // l'app a été lancée en touchant la notification
      this.autoOpenId = null;
      void this.acceptIncoming();
      return;
    }
    if (notify) void this.s.notifications.showHandoff(h);
    // sur Android, la WebView native masque l'UI React : on prévient aussi dans la page
    if (this.state.browsing && !this.s.browser.reactChrome) {
      void this.s.browser.toast(`📲 ${h.fromName} t’envoie « ${h.session.title || 'une vidéo'} »`);
    }
  }

  private openHandoffById(id: string): void {
    if (this.state.incoming?.id === id) void this.acceptIncoming();
    else this.autoOpenId = id; // le message 'welcome' n'est pas encore arrivé
  }

  // ------------------------------------------------------------ messages du navigateur
  private onTrackerMessage(m: import('../models/types').TrackerMessage): void {
    if (m.type === 'progress') {
      if (!m.hasVideo && this.state.local?.hasVideo) return; // ne pas écraser la vidéo suivie
      this.setState({ local: m });
      const now = Date.now();
      if (m.hasVideo && now - this.lastProgressSent > 2500) {
        this.lastProgressSent = now;
        this.s.sync.send({ type: 'progress', session: toSession(m) });
      }
      if (m.hasVideo && now - this.lastHistorySave > 10_000) {
        this.lastHistorySave = now;
        void this.s.history
          .updatePosition(m.url, m.currentTime, m.duration, m.title)
          .then((history) => this.setState({ history }));
      }
    } else if (m.type === 'handoff-request') {
      void this.sendToPeer(m.state);
    } else if (m.type === 'toast') {
      void this.s.browser.toast(m.text);
    }
  }

  // ------------------------------------------------------------ commandes (appelées par les Views)
  get peer(): Device | null {
    const { devices, self } = this.state;
    return devices.find((d) => d.id !== self?.id) ?? null;
  }

  async openUrl(input: string): Promise<void> {
    const url = toNavigableUrl(input);
    if (!url) return;
    const history = await this.s.history.add({ url, title: url, currentTime: 0, duration: 0, kind: 'opened' });
    this.setState({ history });
    await this.openInBrowser(url);
  }

  /** Ouvre le navigateur intégré avec retour visuel pendant le chargement et message en cas d'échec. */
  private async openInBrowser(url: string, restore?: import('../models/types').RestoreOptions): Promise<void> {
    if (!this.s.browser.reactChrome) this.flash('Ouverture…', 'ok'); // Android : la vue apparaît après chargement
    try {
      await this.s.browser.open(url, restore);
      if (this.state.snackbar?.text === 'Ouverture…') this.setState({ snackbar: null });
    } catch (e) {
      console.warn('[browser] ouverture impossible', e);
      this.flash('Impossible d’ouvrir la page (réseau ou adresse invalide)', 'bad');
    }
  }

  /** Ouvre une session à une position donnée (transfert, reprise de l'autre appareil, historique). */
  async resume(session: Pick<VideoSession, 'url' | 'title' | 'currentTime' | 'duration'>, kind: HistoryEntry['kind'], peerName?: string) {
    const { rewindSeconds, autoFullscreen } = this.state.settings;
    const history = await this.s.history.add({ ...session, kind, peerName });
    this.setState({ history });
    const time = resumeTime(session.currentTime, rewindSeconds);
    // position encodée dans l'URL quand le site le permet (YouTube t=, Vimeo #t=, Dailymotion start=)
    await this.openInBrowser(withStartTime(session.url, time), {
      time,
      fullscreen: autoFullscreen,
      autoplay: true,
    });
  }

  async acceptIncoming(): Promise<void> {
    const h = this.state.incoming;
    if (!h) return;
    this.setState({ incoming: null });
    this.s.sync.send({ type: 'ack', id: h.id });
    void this.s.notifications.clear(h.id);
    await this.resume(h.session, 'received', h.fromName);
  }

  dismissIncoming(): void {
    const h = this.state.incoming;
    if (!h) return;
    this.s.sync.send({ type: 'ack', id: h.id });
    void this.s.notifications.clear(h.id);
    this.setState({ incoming: null });
  }

  /** "Reprendre ici" la vidéo en cours sur l'autre appareil (mode pull). */
  async resumePeer(deviceId: string): Promise<void> {
    const sess = this.state.peerSessions[deviceId];
    const name = this.state.devices.find((d) => d.id === deviceId)?.name;
    if (sess) await this.resume(sess, 'received', name);
  }

  /** Le "swipe" : envoie la vidéo courante vers l'autre appareil puis met en pause ici. */
  async sendToPeer(state: TrackerState | null = this.state.local): Promise<void> {
    const peer = this.peer;
    if (!state?.url) return this.flash('Aucune page ouverte à envoyer', 'warn');
    if (!peer) return this.flash('Aucun autre appareil appairé', 'warn');
    const ok = this.s.sync.send({ type: 'handoff', session: toSession(state) });
    if (!ok) {
      void this.s.browser.toast('⚠️ Hors ligne : PC injoignable');
      return this.flash('Hors ligne : impossible d’envoyer', 'bad');
    }
    await this.s.browser.pause();
    const where = peer.online ? peer.name : `${peer.name} (à l’ouverture de l’app)`;
    void this.s.browser.toast(`✓ Envoyé vers ${where}`);
    this.flash(`Envoyé vers ${where}`, 'ok');
    const history = await this.s.history.add({
      url: state.url,
      title: state.title,
      currentTime: state.currentTime,
      duration: state.duration,
      kind: 'sent',
      peerName: peer.name,
    });
    this.setState({ history });
  }

  /** L'utilisateur veut quand même voir la popup bloquée (cas légitime). */
  async openBlockedPopup(): Promise<void> {
    const url = this.state.blockedPopup?.url;
    this.setState({ blockedPopup: null });
    if (url) await this.openInBrowser(url);
  }

  dismissBlockedPopup(): void {
    this.setState({ blockedPopup: null });
  }

  closeBrowser() {
    return this.s.browser.close();
  }

  browserBack() {
    return this.s.browser.back();
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const settings = { ...this.state.settings, ...patch };
    this.setState({ settings });
    await this.s.storage.set(StorageKeys.settings, settings);
  }

  async clearHistory(): Promise<void> {
    await this.s.history.clear();
    this.setState({ history: [] });
  }

  flash(text: string, tone: 'ok' | 'warn' | 'bad' = 'ok'): void {
    if (this.snackTimer) clearTimeout(this.snackTimer);
    this.setState({ snackbar: { text, tone } });
    this.snackTimer = setTimeout(() => this.setState({ snackbar: null }), 3500);
  }

  override dispose(): void {
    this.s.sync.disconnect();
    super.dispose();
  }
}

function toSession(t: TrackerState) {
  return { url: t.url, title: t.title, currentTime: t.currentTime, duration: t.duration, paused: t.paused };
}
