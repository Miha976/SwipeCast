import type { BrowserService } from './BrowserService';

/**
 * Mode navigateur classique (dev avec `npm run dev`) : ouvre un onglet, sans suivi.
 * Sert uniquement à tester l'UI et la synchro ; le suivi vidéo exige Electron ou Android.
 */
export class WebFallbackBrowserService implements BrowserService {
  readonly reactChrome = false;
  readonly tracksIframes = false;
  async open(url: string) {
    window.open(url, '_blank', 'noopener');
  }
  async close() {}
  async back() {}
  async pause() {}
  async toast() {}
  onMessage() {
    return () => {};
  }
  onState() {
    return () => {};
  }
  onPopupBlocked() {
    return () => {};
  }
}
