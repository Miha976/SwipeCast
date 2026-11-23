import adHosts from '../../shared/ad-hosts.json';
import { baseDomain, hostMatches } from './domain';

export { baseDomain } from './domain';

/** Liste partagée avec Electron (electron/main.cjs lit le même fichier). */
export const AD_HOSTS: string[] = adHosts.hosts;

export function isSameSite(a: string, b: string): boolean {
  try {
    return baseDomain(new URL(a).hostname) === baseDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

export function isAdHost(hostname: string): boolean {
  return hostMatches(hostname, AD_HOSTS);
}
