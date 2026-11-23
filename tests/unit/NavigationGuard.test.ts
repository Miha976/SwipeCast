// npx tsx tests/unit/NavigationGuard.test.ts
import { NavigationGuard } from '../../app/src/models/NavigationGuard';

const ads = new Set(['onclckmn.com', 'doubleclick.net']);
const isAd = (h: string) => [...ads].some((d) => h === d || h.endsWith('.' + d));
const EP = 'https://anime-sama.to/catalogue/firefly-wedding/saison1/vostfr/';
const CASINO = 'https://centrimpor.com/contato/';

let ok = 0;
let total = 0;
function check(name: string, cond: boolean) {
  total++;
  if (cond) ok++;
  else console.log('FAIL', name);
}

{
  const g = new NavigationGuard(isAd);
  g.noteIntent(EP, 0);
  g.noteVisited(EP);
  check('redirection pub sans clic (onclick → casino) → annulée', g.shouldRevert(CASINO, EP, 60_000));
  check('navigation interne au site → autorisée', !g.shouldRevert('https://anime-sama.to/catalogue/', EP, 60_000));
  check('sous-domaine du même site → autorisé', !g.shouldRevert('https://cdn.anime-sama.to/x', EP, 60_000));
}
{
  const g = new NavigationGuard(isAd);
  g.noteIntent('https://youtube.com/watch?v=a', 1000); // vrai clic sur un lien
  check('vrai clic sur un lien externe → autorisé', !g.shouldRevert('https://youtube.com/watch?v=a', EP, 2000));
  check('chaîne de redirections après le clic → autorisée', !g.shouldRevert('https://consent.google.com/x', 'https://youtube.com/', 3000));
  check('fin de chaîne : redirection tardive → annulée', g.shouldRevert(CASINO, 'https://youtube.com/', 3000 + NavigationGuard.INTENT_WINDOW_MS + 1));
}
{
  const g = new NavigationGuard(isAd);
  g.noteIntent('https://anime-sama.to/catalogue/x/episode-2', 1000); // clic sur un lien du site lui-même
  check('clic sur un lien du site puis redirection vers un autre site → annulée', g.shouldRevert(CASINO, EP, 1500));
}
{
  const g = new NavigationGuard(isAd);
  g.noteIntent('https://youtube.com/watch?v=a', 1000);
  check('intention expirée → annulée', g.shouldRevert('https://youtube.com/watch?v=a', EP, 1000 + NavigationGuard.INTENT_WINDOW_MS + 1));
}
{
  const g = new NavigationGuard(isAd);
  g.noteIntent('https://js.onclckmn.com/landing', 1000); // calque cliquable de la régie
  check('clic sur un calque pointant vers une régie ≠ intention', g.shouldRevert(CASINO, EP, 2000));
  check('navigation directe vers une régie → toujours annulée', g.shouldRevert('https://x.doubleclick.net/a', EP, 1500));
}
{
  const g = new NavigationGuard(isAd);
  g.noteVisited('https://youtube.com/watch?v=a#t');
  check('retour vers une page déjà visitée → autorisé', !g.shouldRevert('https://youtube.com/watch?v=a', EP, 99_000));
  check('un bouton (▶ du site) ne vaut pas intention → redirection annulée', g.shouldRevert(CASINO, EP, 101_000));
}
check('URL non http ignorée', !new NavigationGuard().shouldRevert('about:blank', EP));

console.log(`${ok}/${total} OK`);
process.exitCode = ok === total ? 0 : 1;
