import type { PermissionStatus } from '../../services/LocalNetworkPermission';

/**
 * Android 17 : l'app ne peut joindre le PC qu'avec l'accès au réseau local.
 * « denied » = Android ne reproposera plus la demande : seul le passage par les paramètres reste.
 */
export function LocalNetworkBanner({ state, onAllow }: { state: PermissionStatus; onAllow: () => void }) {
  if (state === 'granted') return null;
  const blocked = state === 'denied';
  return (
    <div role="alert" className="card flex flex-col gap-3 border-warn/40 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-semibold text-white">Accès au réseau local requis</p>
        <p className="text-sm text-ink-400">
          {blocked
            ? 'L’accès a été refusé. Active « Appareils à proximité » (réseau local) dans les autorisations de SwipeCast.'
            : 'SwipeCast en a besoin pour joindre ton PC sur le même Wi-Fi ou partage de connexion.'}
        </p>
      </div>
      <button className="btn btn-primary shrink-0" onClick={onAllow}>
        {blocked ? 'Ouvrir les paramètres' : 'Autoriser'}
      </button>
    </div>
  );
}
