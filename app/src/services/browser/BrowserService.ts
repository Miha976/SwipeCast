import type { BrowsingState, RestoreOptions, TrackerMessage } from '../../models/types';

/**
 * Navigateur intégré avec suivi vidéo. Deux implémentations natives :
 *  - Android : GeckoView (moteur Firefox) piloté en natif, extension intégrée dans toutes les frames
 *  - Windows : WebContentsView Electron (injection dans toutes les frames, y compris iframes cross-origin)
 */
export interface BrowserService {
  /** true si la barre du navigateur est dessinée par React (Electron) ; false si native (Android). */
  readonly reactChrome: boolean;
  /** Le script de suivi voit-il les vidéos dans les iframes cross-origin ? */
  readonly tracksIframes: boolean;
  open(url: string, restore?: RestoreOptions): Promise<void>;
  close(): Promise<void>;
  back(): Promise<void>;
  /** Met la vidéo en pause (après l'envoi vers l'autre appareil). */
  pause(): Promise<void>;
  /** Affiche un message dans la page (au-dessus de la vidéo). */
  toast(text: string): Promise<void>;
  onMessage(cb: (msg: TrackerMessage) => void): () => void;
  /** null = navigateur fermé */
  onState(cb: (state: BrowsingState | null) => void): () => void;
  /** Une popup (pub le plus souvent) a été bloquée. url = null si inconnue. */
  onPopupBlocked(cb: (p: PopupBlocked) => void): () => void;
}

export interface PopupBlocked {
  url: string | null;
}

export const restoreCall = (opts: RestoreOptions) =>
  `window.__swipecast && window.__swipecast.restore(${JSON.stringify({ ...opts, timeoutMs: 45000 })});`;
