import { useEffect } from 'react';
import type { Handoff } from '../../models/types';
import { hostname } from '../../models/format';
import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';

/** Feuille modale "Vidéo reçue — ouvrir en plein écran ?" */
export function HandoffSheet({
  handoff,
  onAccept,
  onDismiss,
}: {
  handoff: Handoff;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onAccept();
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAccept, onDismiss]);

  const s = handoff.session;
  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in bg-black/60" onClick={onDismiss} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-brand-soft">
          📲 Envoyé depuis {handoff.fromName}
        </p>
        <h2 id="handoff-title" className="mb-1 line-clamp-2 text-2xl">
          {s.title || hostname(s.url)}
        </h2>
        <p className="mb-4 truncate text-ink-400">{hostname(s.url)}</p>
        <ProgressBar current={s.currentTime} duration={s.duration} />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button autoFocus className="btn btn-primary flex-1 text-lg" onClick={onAccept}>
            <Icon name="play" className="h-5 w-5" /> Regarder en plein écran
          </button>
          <button className="btn btn-ghost sm:w-36" onClick={onDismiss}>
            Plus tard
          </button>
        </div>
      </div>
    </>
  );
}
