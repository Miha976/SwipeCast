import type { Device } from '../../models/types';
import type { SyncStatus } from '../../services/SyncService';

export function StatusPill({ status, peer }: { status: SyncStatus; peer: Device | null }) {
  if (status === 'online' && peer?.online) {
    return (
      <span className="chip chip-ok">
        <span className="h-2 w-2 shrink-0 rounded-full bg-ok" /> <span className="truncate">{peer.name} connecté</span>
      </span>
    );
  }
  if (status === 'online') {
    return (
      <span className="chip chip-warn">
        <span className="h-2 w-2 rounded-full bg-warn" />
        {peer ? `${peer.name} hors ligne` : 'En attente d’un appareil'}
      </span>
    );
  }
  if (status === 'connecting') {
    return (
      <span className="chip chip-warn">
        <span className="h-2 w-2 animate-pulse2 rounded-full bg-warn" /> Connexion…
      </span>
    );
  }
  if (status === 'unauthorized') {
    return <span className="chip chip-bad">Appairage révoqué</span>;
  }
  return (
    <span className="chip chip-bad">
      <span className="h-2 w-2 rounded-full bg-bad" /> PC injoignable
    </span>
  );
}
