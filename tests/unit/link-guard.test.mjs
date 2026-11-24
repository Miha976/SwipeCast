// node tests/unit/link-guard.test.mjs — liens target=_blank ouverts dans l'onglet (extension GeckoView)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../app/gecko-ext/link-guard.js', import.meta.url), 'utf8');
let onClick = null;
const window = {};
window.top = window;
const ctx = { window, URL, location: { href: '' }, document: { addEventListener: (t, f) => t === 'click' && (onClick = f) } };
vm.runInNewContext(src, ctx);
const { openHere } = window.__swipecastLinkGuard;

let ok = 0, total = 0;
const check = (n, c) => { total++; if (c) ok++; else console.log('FAIL', n); };
const BRAVE = 'https://search.brave.com/search?q=firefly+wedding';
const EP = 'https://anime-sama.to/catalogue/firefly-wedding/saison1/vostfr/';

check('résultat Brave Search (_blank) ouvert ici', openHere(BRAVE, EP, '_blank'));
check('résultat Google ouvert ici', openHere('https://www.google.fr/search?q=x', EP, '_blank'));
check('lien du même site (_blank) ouvert ici', openHere(EP, 'https://www.anime-sama.to/planning', '_blank'));
check('lien vers un autre site depuis un site de streaming : laissé au blocage natif', !openHere(EP, 'https://casino.example/', '_blank'));
check('lien sans target : rien à faire', !openHere(BRAVE, EP, ''));
check('schéma non http : ignoré', !openHere(BRAVE, 'intent://x#Intent;end', '_blank'));
check('faux moteur (sous-domaine trompeur) : non', !openHere('https://www.google.evil.com/', 'https://autre.example/', '_blank'));

// clic réel sur un résultat
ctx.location.href = BRAVE;
const a = { href: EP, target: '_blank' };
const ev = (trusted) => ({ isTrusted: trusted, defaultPrevented: false, button: 0, target: { closest: () => a } });
onClick(ev(false));
check('clic simulé par script : ignoré', a.target === '_blank');
onClick(ev(true));
check('vrai tap : le lien passe en _self', a.target === '_self');

const frame = {}; frame.top = {};
let frameListener = null;
vm.runInNewContext(src, { window: frame, URL, location: {}, document: { addEventListener: () => (frameListener = true) } });
check('inactif dans les iframes', frameListener === null);

console.log(`${ok}/${total} OK`);
process.exitCode = ok === total ? 0 : 1;
