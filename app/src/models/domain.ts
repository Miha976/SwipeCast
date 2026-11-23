/** "www.anime-sama.fr" → "anime-sama.fr" (approximation : 2 derniers labels, 3 pour co.uk & co). */
export function baseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  const twoLevelTld = /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2] ?? '') && parts.length > 2;
  return parts.slice(twoLevelTld ? -3 : -2).join('.');
}

export function hostMatches(hostname: string, domains: readonly string[]): boolean {
  const h = hostname.toLowerCase();
  return domains.some((d) => h === d || h.endsWith('.' + d));
}
