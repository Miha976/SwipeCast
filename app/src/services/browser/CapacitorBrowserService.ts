import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';
import type { PluginListenerHandle } from '@capacitor/core';
import { Emitter } from '../../core/Emitter';
import type { BrowsingState, RestoreOptions, TrackerMessage } from '../../models/types';
import { restoreCall, type BrowserService } from './BrowserService';
import trackerSource from '../../../shared/tracker.js?raw';

type Events = { message: TrackerMessage; state: BrowsingState | null };

/** Android : WebView native du plugin capgo, script de suivi injecté à chaque chargement. */
export class CapacitorBrowserService extends Emitter<Events> implements BrowserService {
  readonly reactChrome = false;
  readonly tracksIframes = false; // executeScript ne cible que la frame principale
  private webviewId: string | null = null;
  private pendingRestore: RestoreOptions | null = null;
  private handles: PluginListenerHandle[] = [];
  private current: BrowsingState = { url: '', title: '', canGoBack: false };
  private readonly nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  private readonly tracker = trackerSource.replace('__SWIPECAST_NONCE__', this.nonce);

  async open(url: string, restore?: RestoreOptions): Promise<void> {
    this.pendingRestore = restore ?? null;
    this.current = { url, title: '', canGoBack: false };

    if (this.webviewId) {
      // déjà ouvert : on change simplement de page
      await InAppBrowser.setUrl({ url, id: this.webviewId });
      return;
    }
    await this.bindListeners();
    const { id } = await InAppBrowser.openWebView({
      url,
      title: 'SwipeCast',
      toolbarType: ToolBarType.NAVIGATION,
      showReloadButton: true,
      activeNativeNavigationForWebview: true,
      // le script de suivi est injecté à chaque 'browserPageLoaded' (il est idempotent)
    });
    this.webviewId = id;
    this.emit('state', this.current);
  }

  private async bindListeners(): Promise<void> {
    if (this.handles.length) return;
    this.handles.push(
      await InAppBrowser.addListener('browserPageLoaded', () => void this.injectAndRestore()),
      await InAppBrowser.addListener('urlChangeEvent', (e) => {
        this.current = { ...this.current, url: e.url, canGoBack: true };
        this.emit('state', this.current);
      }),
      await InAppBrowser.addListener('messageFromWebview', (e) => {
        const msg = e.detail as TrackerMessage & { nonce?: string };
        if (msg?.nonce !== this.nonce) return; // message forgé par la page
        if (msg?.type === 'progress' && msg.isTop) {
          this.current = { ...this.current, title: msg.title, url: msg.url };
        }
        if (msg?.type) this.emit('message', msg);
      }),
      await InAppBrowser.addListener('closeEvent', () => {
        this.webviewId = null;
        this.pendingRestore = null;
        this.unbind();
        this.emit('state', null);
      }),
    );
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
    if (this.webviewId) await InAppBrowser.close().catch(() => undefined);
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
}
