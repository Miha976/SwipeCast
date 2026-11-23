import { baseDomain } from './domain';

/**
 * Décide si un changement de site de la page principale est légitime.
 *
 * Contexte : sur mobile, les régies « onclick » ne font pas de popup, elles redirigent l'onglet
 * (top.location.replace) au premier clic sur le lecteur, en écrasant l'entrée de l'épisode.
 * Ce code ne peut pas être intercepté en JS ; on le détecte côté natif à l'arrivée de l'URL.
 *
 * Un changement de site est légitime si :
 *  - il va vers le site d'un lien que l'utilisateur vient VRAIMENT de toucher (isTrusted), ou vers
 *    l'URL ouverte par l'app ; une fois ce site atteint, les redirections suivantes sont tolérées
 *    pendant INTENT_WINDOW_MS (raccourcisseurs, m./www., etc.) ;
 *  - ou s'il revient vers une URL déjà visitée pendant la session (geste retour / avant).
 * Un clic sur un bouton ne vaut PAS intention : la régie se déclenche justement au clic sur ▶.
 */
export class NavigationGuard {
  static readonly INTENT_WINDOW_MS = 8000;
  private intent: { site: string; at: number } | null = null;
  private chainUntil = Number.NEGATIVE_INFINITY;
  private visited = new Set<string>();
  private readonly isAdHost: (hostname: string) => boolean;

  constructor(isAdHost: (hostname: string) => boolean = () => false) {
    this.isAdHost = isAdHost;
  }

  /** Lien réellement touché par l'utilisateur, ou URL ouverte par l'app. */
  noteIntent(url: string, now = Date.now()): void {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    if (this.isAdHost(host)) return; // calque cliquable posé par une régie
    this.intent = { site: baseDomain(host), at: now };
  }

  noteVisited(url: string): void {
    this.visited.add(normalize(url));
  }

  /** true = navigation à annuler (retour à `previousUrl`). */
  shouldRevert(nextUrl: string, previousUrl: string, now = Date.now()): boolean {
    if (!previousUrl || !/^https?:/i.test(nextUrl)) return false;
    let next: URL;
    let prev: URL;
    try {
      next = new URL(nextUrl);
      prev = new URL(previousUrl);
    } catch {
      return false;
    }
    if (this.isAdHost(next.hostname)) return true;
    const site = baseDomain(next.hostname);
    if (site === baseDomain(prev.hostname)) return false;
    if (now < this.chainUntil) return false; // redirection en chaîne après une navigation voulue
    if (this.intent && now - this.intent.at < NavigationGuard.INTENT_WINDOW_MS && this.intent.site === site) {
      this.chainUntil = now + NavigationGuard.INTENT_WINDOW_MS;
      this.intent = null;
      return false;
    }
    if (this.visited.has(normalize(nextUrl))) return false;
    return true;
  }
}

function normalize(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/$/, '');
}
