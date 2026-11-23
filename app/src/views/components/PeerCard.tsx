import type { Device, VideoSession } from '../../models/types';
import { hostname, timeAgo } from '../../models/format';
import { Icon, PlatformIcon } from './Icon';
import { ProgressBar } from './ProgressBar';

/** "En cours sur l'autre appareil" — permet de récupérer la vidéo (pull) sans swipe préalable. */
export function PeerCard({
  peer,
  session,
  onResume,
}: {
  peer: Device;
  session: VideoSession | undefined;
  onResume: () => void;
}) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center gap-3 text-ink-400">
        <PlatformIcon platform={peer.platform} className="h-5 w-5" />
        <span className="text-sm font-semibold uppercase tracking-wider">Sur {peer.name}</span>
        {session && <span className="ml-auto text-sm">{timeAgo(session.updatedAt)}</span>}
      </div>

      {session ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-xl sm:text-2xl">{session.title || hostname(session.url)}</h2>
            <p className="mb-3 truncate text-ink-400">{hostname(session.url)}</p>
            <ProgressBar current={session.currentTime} duration={session.duration} />
          </div>
          <button className="btn btn-primary w-full text-lg sm:w-auto" onClick={onResume}>
            <Icon name="play" className="h-5 w-5" /> Reprendre ici
          </button>
        </div>
      ) : (
        <p className="text-ink-400">Aucune vidéo en cours sur cet appareil.</p>
      )}
    </section>
  );
}
