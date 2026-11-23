import type { BrowsingState, RestoreOptions, TrackerMessage } from '../../models/types';
import type { DesktopBridge } from '../platform';
import type { BrowserService, PopupBlocked } from './BrowserService';

/** Windows : délègue au processus principal Electron (WebContentsView + injection multi-frames). */
export class ElectronBrowserService implements BrowserService {
  readonly reactChrome = true;
  readonly tracksIframes = true;

  constructor(private bridge: DesktopBridge) {}

  open(url: string, restore?: RestoreOptions) {
    return this.bridge.browser.open(url, restore);
  }
  close() {
    return this.bridge.browser.close();
  }
  back() {
    return this.bridge.browser.back();
  }
  pause() {
    return this.bridge.browser.pause();
  }
  toast(text: string) {
    return this.bridge.browser.toast(text);
  }
  onMessage(cb: (msg: TrackerMessage) => void) {
    return this.bridge.browser.onMessage(cb);
  }
  onState(cb: (s: BrowsingState | null) => void) {
    return this.bridge.browser.onState(cb);
  }
  onPopupBlocked(cb: (p: PopupBlocked) => void) {
    return this.bridge.browser.onPopupBlocked(cb);
  }
}
