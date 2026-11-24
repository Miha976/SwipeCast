import type { Platform } from '../models/types';
import { Gecko, type PermissionStatus } from './native/SwipecastGecko';

export type { PermissionStatus };

/**
 * Accès au réseau local, nécessaire pour joindre le hub du PC.
 * Android 17 : permission d'exécution ACCESS_LOCAL_NETWORK (sans elle : « PC injoignable »
 * alors que le navigateur du téléphone, lui, y arrive). Ailleurs : toujours accordé.
 */
export interface LocalNetworkPermission {
  check(): Promise<PermissionStatus>;
  request(): Promise<PermissionStatus>;
  openSettings(): Promise<void>;
}

export function createLocalNetworkPermission(platform: Platform): LocalNetworkPermission {
  if (platform !== 'android') {
    return { check: async () => 'granted', request: async () => 'granted', openSettings: async () => {} };
  }
  return {
    check: async () => (await Gecko.checkLocalNetwork()).state,
    request: async () => (await Gecko.requestLocalNetwork()).state,
    openSettings: () => Gecko.openAppSettings(),
  };
}
