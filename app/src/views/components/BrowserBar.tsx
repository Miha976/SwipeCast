import type { AppState } from '../../viewmodels/AppViewModel';
import type { Device } from '../../models/types';
import { formatTime, hostname } from '../../models/format';
import { Icon } from './Icon';

/**
 * Barre du navigateur intégré (Windows). La page web est une WebContentsView native
 * placée juste en dessous (64 px) : rien de React ne peut s'afficher par-dessus,
 * donc les transferts entrants et messages s'affichent DANS la barre.
 */
export function BrowserBar({
  state,
  peer,
  onBack,
  onClose,
  onSend,
  onAccept,
  onDismiss,
}: {
  state: AppState;
  peer: Device | null;
  onBack: () => void;
  onClose: () => void;
  onSend: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { browsing, local, incoming, snackbar } = state;
  if (!browsing) return null;

  return (
    <header className="browser-bar fixed inset-x-0 top-0 z-50">
      <button className="btn btn-ghost btn-icon" onClick={onBack} disabled={!browsing.canGoBack} aria-label="Retour">
        <Icon name="back" />
      </button>

      <div className="min-w-0 flex-1 px-2">
        {incoming ? (
          <div className="flex items-center gap-3">
            <span className="truncate font-semibold text-white">
              📲 {incoming.fromName} : {incoming.session.title || hostname(incoming.session.url)} ·{' '}
              {formatTime(incoming.session.currentTime)}
            </span>
            <button className="btn btn-primary h-10 min-h-0 shrink-0 px-4" onClick={onAccept}>
              Ouvrir
            </button>
            <button className="btn btn-ghost h-10 min-h-0 shrink-0 px-3" onClick={onDismiss} aria-label="Ignorer">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        ) : snackbar ? (
          <p className="truncate font-semibold text-white">{snackbar.text}</p>
        ) : (
          <>
            <p className="truncate font-semibold leading-tight text-white">{local?.title || browsing.title || hostname(browsing.url)}</p>
            <p className="truncate text-sm leading-tight text-ink-400">
              {hostname(browsing.url)}
              {local?.hasVideo && ` · ${formatTime(local.currentTime)} / ${formatTime(local.duration)}`}
            </p>
          </>
        )}
      </div>

      <button
        className="btn btn-primary shrink-0"
        onClick={onSend}
        disabled={!peer}
        title="Envoyer vers l'autre appareil (Alt+S)"
      >
        <Icon name="swipeUp" className="h-5 w-5" />
        <span className="hidden md:inline">Envoyer vers {peer?.name ?? '…'}</span>
        <span className="md:hidden">Envoyer</span>
      </button>
      <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer le navigateur">
        <Icon name="close" />
      </button>
    </header>
  );
}
