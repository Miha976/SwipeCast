import type { FoundHub } from '../models/hubs';
import type { Platform } from '../models/types';
import { Gecko } from './native/SwipecastGecko';

/**
 * Découverte du PC sur le réseau local (le téléphone cherche le hub ; le PC, lui, s'annonce).
 * Android : plugin natif (NsdManager pour mDNS + scan HTTP du sous-réseau).
 * Navigateur / PC : non disponible (un navigateur ne peut ni écouter le mDNS ni scanner efficacement).
 */
export interface DiscoveryService {
  readonly supported: boolean;
  /** Cherche pendant timeoutMs ; onFound est appelé dès qu'un hub répond. */
  discover(onFound?: (h: FoundHub) => void, timeoutMs?: number): Promise<FoundHub[]>;
}

declare global {
  interface Window {
    /** Dev uniquement (vite dev) : hubs simulés pour tester l'écran d'appairage dans un navigateur. */
    __swipecastFakeHubs?: FoundHub[];
  }
}

export function createDiscovery(platform: Platform): DiscoveryService {
  if (platform === 'android') {
    return {
      supported: true,
      async discover(onFound, timeoutMs = 3000) {
        const handle = await Gecko.addListener('hubFound', (h) => onFound?.(h));
        try {
          return (await Gecko.discover({ timeoutMs })).hubs;
        } catch (e) {
          // Recherche déjà lancée ailleurs (écran d'appairage / reconnexion) : ses résultats arrivent via onFound.
          if ((e as { code?: string }).code === 'BUSY') return [];
          throw e;
        } finally {
          void handle.remove();
        }
      },
    };
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__swipecastFakeHubs) {
    return {
      supported: true,
      async discover(onFound, timeoutMs = 3000) {
        const hubs = window.__swipecastFakeHubs ?? [];
        for (const h of hubs) {
          await new Promise((r) => setTimeout(r, Math.min(300, timeoutMs / (hubs.length + 1))));
          onFound?.(h);
        }
        return hubs;
      },
    };
  }
  return { supported: false, discover: async () => [] };
}
