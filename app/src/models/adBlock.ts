import adHosts from '../../shared/ad-hosts.json';

/** Liste partagée avec Electron (electron/main.cjs lit le même fichier). */
export const AD_HOSTS: string[] = adHosts.hosts;

/** "www.anime-sama.fr" → "anime-sama.fr" (approximation : 2 derniers labels, 3 pour co.uk & co). */
export function baseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  const twoLevelTld = /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2] ?? '') && parts.length > 2;
  return parts.slice(twoLevelTld ? -3 : -2).join('.');
}

export function isSameSite(a: string, b: string): boolean {
  try {
    return baseDomain(new URL(a).hostname) === baseDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}
