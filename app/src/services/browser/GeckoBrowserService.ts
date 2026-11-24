import { Emitter } from '../../core/Emitter';
import { FrameAggregator } from '../../models/FrameAggregator';
import type { TrackerMessage, BrowsingState, RestoreOptions, TrackerState } from '../../models/types';
import type { BrowserService, PopupBlocked } from './BrowserService';
import { Gecko } from '../native/SwipecastGecko';



type Events = { message: TrackerMessage; state: BrowsingState | null; popup: PopupBlocked };

/**
 * Android : navigateur GeckoView (moteur Firefox) piloté en natif.
 * Blocage des pubs = uBlock Origin + règles de navigation natives (avant départ) ;
 * le script de suivi tourne dans toutes les frames grâce à l'extension intégrée.
 */
export class GeckoBrowserService extends Emitter<Events> implements BrowserService {
  readonly reactChrome = false;
  readonly tracksIframes = true;
  private frames = new FrameAggregator();
  private page: BrowsingState = { url: '', title: '', canGoBack: false };
  private ready: Promise<void>;

  constructor() {
    super();
    this.ready = this.bind();
  }

  private async bind(): Promise<void> {
    await Gecko.addListener('message', (m) => this.onFrameMessage(m));
    await Gecko.addListener('state', (s) => {
      if ('closed' in s) {
        this.frames.clear();
        this.page = { url: '', title: '', canGoBack: false };
        this.emit('state', null);
        return;
      }
      if (stripHash(s.url) !== stripHash(this.page.url)) this.frames.clear(); // nouvelle page
      this.page = s;
      this.emit('state', s);
    });
    await Gecko.addListener('popupBlocked', (p) => this.emit('popup', { url: p.url ?? null }));
  }

  private onFrameMessage(m: TrackerMessage & { frame?: string }): void {
    if (m.type === 'progress') {
      const { type: _type, frame, ...state } = m as { type: 'progress'; frame?: string } & TrackerState;
      this.frames.update(frame ?? 'top', state);
      this.emit('message', { type: 'progress', ...this.frames.best(this.page) });
    } else if (m.type === 'handoff-request') {
      if (m.state) this.frames.update(m.frame ?? 'top', m.state);
      this.emit('message', { type: 'handoff-request', state: this.frames.best(this.page) });
    }
  }

  async open(url: string, restore?: RestoreOptions): Promise<void> {
    await this.ready;
    this.frames.clear();
    this.page = { url, title: '', canGoBack: false };
    this.emit('state', this.page);
    await Gecko.open(restore ? { url, restore } : { url });
  }

  close() {
    return Gecko.close();
  }
  back() {
    return Gecko.back();
  }
  pause() {
    return Gecko.pause();
  }
  toast(text: string) {
    return Gecko.toast({ text });
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

function stripHash(url: string): string {
  return url.replace(/#.*$/, '');
}
