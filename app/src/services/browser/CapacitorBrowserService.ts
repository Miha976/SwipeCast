import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';
import type { PluginListenerHandle } from '@capacitor/core';
import { Emitter } from '../../core/Emitter';
import type { BrowsingState, RestoreOptions, TrackerMessage } from '../../models/types';
import { AD_HOSTS, isAdHost, isSameSite } from '../../models/adBlock';
import { NavigationGuard } from '../../models/NavigationGuard';
import { restoreCall, type BrowserService, type PopupBlocked } from './BrowserService';
import trackerSource from '../../../shared/tracker.js?raw';
import popupGuardSource from '../../../shared/popup-guard.js?raw';

type Events = { message: TrackerMessage; state: BrowsingState | null; popup: PopupBlocked };

/**
 * Android : WebView native du plugin capgo, script de suivi injecté à chaque chargement.
 *
 * Popups : ouvertes en mode caché (`hiddenPopupWindow`) puis fermées immédiatement, sauf si elles
 * restent sur le même site (connexion, lecteur). C'est ce qui empêchait la pub de passer devant la vidéo.
 * NB : le plugin émet closeEvent / browserPageLoaded aussi pour les popups → tout est filtré par id.
 */
export class CapacitorBrowserService extends Emitter<Events> implements BrowserService {
  readonly reactChrome = false;
  readonly tracksIframes = false; // executeScript ne cible que la frame principale
  private webviewId: string | null = null;
  private pendingRestore: RestoreOptions | null = null;
  private handles: PluginListenerHandle[] = [];
  private current: BrowsingState = { url: '', title: '', canGoBack: false };
  private readonly nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  private readonly tracker = trackerSource.replace('__SWIPECAST_NONCE__', this.nonce);
  private readonly popupGuard = popupGuardSource
    .replace('__SWIPECAST_NONCE__', this.nonce)
    .replace('__SWIPECAST_AD_HOSTS__', JSON.stringify(AD_HOSTS));
  /** Annule les redirections publicitaires de la page principale (régies « onclick » mobiles). */
  private readonly navGuard = new NavigationGuard(isAdHost);
  private lastProgress: { url: string; time: number } | null = null;
  private lastToastAt = 0;

  /** Événement provenant de la vue principale ? (sans id = ancienne version du plugin → on accepte) */
  private isMain(id?: string): boolean {
    return !id || !this.webviewId || id === this.webviewId;
  }

  async open(url: string, restore?: RestoreOptions): Promise<void> {
    this.pendingRestore = restore ?? null;
    this.current = { url, title: '', canGoBack: false };
    this.navGuard.noteIntent(url); // ouverture demandée par l'app
    this.navGuard.noteVisited(url);

    if (this.webviewId) {
      // déjà ouvert : on change simplement de page
      await InAppBrowser.setUrl({ url, id: this.webviewId });
      return;
    }
    await this.bindListeners();
    let id: string;
    try {
      ({ id } = await InAppBrowser.openWebView({
        url,
        title: 'SwipeCast',
        toolbarType: ToolBarType.NAVIGATION,
        showReloadButton: true,
        activeNativeNavigationForWebview: true,
        hiddenPopupWindow: true, // les popups qui passeraient malgré tout ne s'affichent jamais
        // window.open neutralisé avant tout script de la page, dans toutes les frames (iframe du lecteur comprise).
        // Le plugin exige isPresentAfterPageLoad dès qu'un preShowScript est fourni : la vue s'affiche
        // à la fin du premier chargement (l'UI affiche « Ouverture… » en attendant).
        preShowScript: this.popupGuard,
        preShowScriptInjectionTime: 'documentStart',
        isPresentAfterPageLoad: true,
        blockedHosts: AD_HOSTS.flatMap((h) => [h, `*.${h}`]), // navigations vers les régies pub
      }));
    } catch (e) {
      // échec du premier chargement : on ne laisse pas une vue invisible derrière nous
      await InAppBrowser.close().catch(() => undefined);
      this.unbind();
      throw new Error(e instanceof Error ? e.message : String(e));
    }
    this.webviewId = id;
    this.emit('state', this.current);
  }

  private async bindListeners(): Promise<void> {
    if (this.handles.length) return;
    this.handles.push(
      await InAppBrowser.addListener('browserPageLoaded', (e) => {
        if (this.isMain(e.id)) void this.injectAndRestore();
      }),
      await InAppBrowser.addListener('urlChangeEvent', (e) => {
        if (!this.isMain(e.id)) return;
        const previous = this.current.url;
        let nextHost = '';
        try {
          nextHost = new URL(e.url).hostname;
        } catch {
          /* about:blank, data:… */
        }
        if (nextHost && isAdHost(nextHost)) {
          // le plugin a déjà bloqué la navigation (blockedHosts) mais émet quand même l'événement
          this.notifyBlocked(null, '🚫 Redirection publicitaire bloquée');
          return;
        }
        if (this.navGuard.shouldRevert(e.url, previous)) {
          void this.recoverFromRedirect(previous);
          return;
        }
        this.navGuard.noteVisited(e.url);
        this.current = { ...this.current, url: e.url, canGoBack: true };
        this.emit('state', this.current);
      }),
      await InAppBrowser.addListener('messageFromWebview', (e) => {
        const msg = e.detail as TrackerMessage & { nonce?: string };
        if (msg?.nonce !== this.nonce) return; // message forgé par la page (ou venant d'une popup)
        const kind = (msg as { type: string }).type;
        if (kind === 'popup-blocked') {
          this.notifyBlocked((msg as unknown as { url?: string }).url ?? null);
          return;
        }
        if (kind === 'redirect-blocked') {
          // annulée dans la page avant de partir : rien à recharger
          this.notifyBlocked(null, '🚫 Redirection publicitaire bloquée', 0);
          return;
        }
        if (kind === 'nav-intent') {
          const url = (msg as unknown as { url?: string }).url;
          if (url) this.navGuard.noteIntent(url);
          return;
        }
        if (msg.type === 'progress' && msg.isTop) {
          this.current = { ...this.current, title: msg.title, url: msg.url };
          if (msg.hasVideo) this.lastProgress = { url: msg.url, time: msg.currentTime };
        }
        this.emit('message', msg);
      }),
      await InAppBrowser.addListener('popupWindowOpened', (e) => void this.onPopup(e.id, e.url)),
      await InAppBrowser.addListener('closeEvent', (e) => {
        if (!this.isMain(e.id)) return; // fermeture d'une popup, pas du navigateur
        this.webviewId = null;
        this.pendingRestore = null;
        this.unbind();
        this.emit('state', null);
      }),
    );
  }

  private async onPopup(id: string, url?: string): Promise<void> {
    const legit = !!url && /^https?:/i.test(url) && isSameSite(url, this.current.url);
    if (legit) {
      await InAppBrowser.show({ id }).catch(() => undefined);
      return;
    }
    // une popup a échappé au garde-fou (ouverture native) : on la ferme ; un éventuel tab-under
    // sera rattrapé par NavigationGuard (changement de site sans clic sur un lien)
    await InAppBrowser.close({ id }).catch(() => undefined);
    this.notifyBlocked(url ?? null);
  }

  private notifyBlocked(url: string | null, text = '🚫 Popup publicitaire bloquée', delayMs = 1500): void {
    this.emit('popup', { url: url && /^https?:/i.test(url) ? url : null });
    if (Date.now() - this.lastToastAt > 4000) {
      this.lastToastAt = Date.now();
      // le toast est affiché par le script de la page : on attend qu'elle soit rechargée
      setTimeout(() => void this.toast(text), delayMs);
    }
  }

  /** Redirection pub détectée : on recharge la page d'origine et on reprend la vidéo là où elle en était. */
  private async recoverFromRedirect(previousUrl: string): Promise<void> {
    if (!this.webviewId) return;
    const p = this.lastProgress;
    if (p && p.url === previousUrl && p.time > 0) {
      this.pendingRestore = { time: p.time, fullscreen: false, autoplay: true };
    }
    this.navGuard.noteIntent(previousUrl);
    await InAppBrowser.setUrl({ url: previousUrl, id: this.webviewId }).catch(() => undefined);
    this.notifyBlocked(null, '🚫 Redirection publicitaire bloquée');
  }

  private async injectAndRestore(): Promise<void> {
    const id = this.webviewId ?? undefined;
    try {
      await InAppBrowser.executeScript({ code: this.tracker, id });
      if (this.pendingRestore) {
        const opts = this.pendingRestore;
        this.pendingRestore = null;
        // vrai plein écran immersif côté natif (masque barres système + toolbar)
        if (opts.fullscreen) await InAppBrowser.setFullscreen({ enabled: true, id }).catch(() => undefined);
        await InAppBrowser.executeScript({ code: restoreCall(opts), id });
      }
    } catch (e) {
      console.warn('[browser] injection impossible', e);
    }
  }

  private unbind(): void {
    this.handles.splice(0).forEach((h) => void h.remove());
  }

  async close(): Promise<void> {
    if (this.webviewId) await InAppBrowser.close({ id: this.webviewId }).catch(() => undefined);
  }

  async back(): Promise<void> {
    await InAppBrowser.goBack().catch(() => undefined);
  }

  async pause(): Promise<void> {
    await this.exec('window.__swipecast && window.__swipecast.pause();');
  }

  async toast(text: string): Promise<void> {
    await this.exec(`window.__swipecast && window.__swipecast.toast(${JSON.stringify(text)});`);
  }

  private async exec(code: string): Promise<void> {
    if (!this.webviewId) return;
    await InAppBrowser.executeScript({ code, id: this.webviewId }).catch(() => undefined);
  }

  onMessage(cb: (msg: TrackerMessage) => void) {
    return this.on('message', cb);
  }

  onState(cb: (s: BrowsingState | null) => void) {
    return this.on('state', cb);
  }

  onPopupBlocked(cb: (p: PopupBlocked) => void) {
    return this.on('popup', cb);
  }
}
