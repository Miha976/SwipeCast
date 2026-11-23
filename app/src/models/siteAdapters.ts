/**
 * Adaptateurs par site : encoder la position de reprise directement dans l'URL quand le site le permet.
 * C'est plus fiable que le seek JS (le lecteur démarre nativement au bon endroit, même après une pub).
 * Le seek du script injecté reste actif en complément pour tous les autres sites.
 */

const YT_HOSTS = /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/;

export function withStartTime(rawUrl: string, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const host = u.hostname.toLowerCase();

  // YouTube : /watch?v=…, /live/…, /embed/… et youtu.be/ID → paramètre t (en secondes)
  if (YT_HOSTS.test(host) || host === 'youtu.be') {
    if (u.pathname.startsWith('/shorts/')) return rawUrl; // les Shorts ignorent t
    const isEmbed = u.pathname.startsWith('/embed/');
    u.searchParams.delete('t');
    u.searchParams.delete('start');
    if (t > 0) {
      if (isEmbed) u.searchParams.set('start', String(t));
      else u.searchParams.set('t', `${t}s`);
    }
    return u.toString();
  }

  // Vimeo : fragment #t=123s
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    u.hash = t > 0 ? `t=${t}s` : '';
    return u.toString();
  }

  // Dailymotion : ?start=123
  if (host.endsWith('dailymotion.com') || host === 'dai.ly') {
    u.searchParams.delete('start');
    if (t > 0) u.searchParams.set('start', String(t));
    return u.toString();
  }

  return rawUrl;
}
