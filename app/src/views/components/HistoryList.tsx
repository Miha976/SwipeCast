import type { HistoryEntry } from '../../models/types';
import { formatTime, hostname, progressPercent, timeAgo } from '../../models/format';
import { Icon } from './Icon';

const kindLabel: Record<HistoryEntry['kind'], string> = {
  received: 'Reçu',
  sent: 'Envoyé',
  opened: 'Ouvert',
};

export function HistoryList({ items, onOpen }: { items: HistoryEntry[]; onOpen: (e: HistoryEntry) => void }) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-ink-400">
        Les vidéos ouvertes, envoyées et reçues apparaîtront ici.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {items.map((e) => (
        <li key={e.id}>
          <button
            onClick={() => onOpen(e)}
            className="group flex w-full items-center gap-4 rounded-2xl bg-white/[.03] p-3 text-left transition hover:bg-white/[.07]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand/20 text-brand-soft group-hover:bg-brand group-hover:text-white">
              <Icon name="play" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-white">{e.title || hostname(e.url)}</span>
              <span className="block truncate text-sm text-ink-400">
                {kindLabel[e.kind]}
                {e.peerName ? ` · ${e.peerName}` : ''} · {hostname(e.url)} · {timeAgo(e.at)}
              </span>
              {e.duration > 0 && (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full bg-brand-soft"
                    style={{ width: `${progressPercent(e.currentTime, e.duration)}%` }}
                  />
                </span>
              )}
            </span>
            {e.currentTime > 0 && (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-200">{formatTime(e.currentTime)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
