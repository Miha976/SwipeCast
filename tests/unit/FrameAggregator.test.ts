// npx tsx tests/unit/FrameAggregator.test.ts
import { FrameAggregator } from '../../app/src/models/FrameAggregator';
import type { TrackerState } from '../../app/src/models/types';

let ok = 0, total = 0;
const check = (n: string, c: boolean) => { total++; if (c) ok++; else console.log('FAIL', n); };
const s = (o: Partial<TrackerState>): TrackerState =>
  ({ url: '', title: '', isTop: false, hasVideo: false, currentTime: 0, duration: 0, paused: true, ...o });
const PAGE = { url: 'https://anime-sama.to/catalogue/firefly-wedding/saison1/vostfr/', title: 'Firefly Wedding - Saison 1' };

const a = new FrameAggregator();
a.update('top', s({ isTop: true, url: PAGE.url, title: 'Firefly' }));
a.update('vidmoly', s({ url: 'https://ansembed.net/embed-x.html', title: 'embed', hasVideo: true, currentTime: 307, duration: 1374, paused: false }));
a.update('pub', s({ url: 'https://anime-sama.to/pub/cadre', hasVideo: true, currentTime: 3, duration: 15, paused: true }));
const b = a.best(PAGE);
check('vidéo du lecteur (iframe) retenue, pas la pub', b.currentTime === 307 && b.duration === 1374);
check('URL et titre de la PAGE partagés, pas ceux de l’iframe', b.url === PAGE.url && b.title === PAGE.title);
a.update('vidmoly', s({ hasVideo: true, currentTime: 320, duration: 1374, paused: true }));
check('en pause : la vidéo la plus longue reste retenue', a.best(PAGE).currentTime === 320);
a.clear();
check('sans vidéo : page seule, position 0', a.best(PAGE).hasVideo === false && a.best(PAGE).url === PAGE.url);
console.log(`${ok}/${total} OK`);
process.exitCode = ok === total ? 0 : 1;
