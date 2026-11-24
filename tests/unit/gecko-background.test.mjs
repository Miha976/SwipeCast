// node tests/unit/gecko-background.test.mjs — background.js de l'extension GeckoView, API `browser` simulée
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../../app/gecko-ext/background.js', import.meta.url), 'utf8');
const sent = [];
let appListener = null;
let runtimeListener = null;
const browser = {
  runtime: {
    connectNative: (name) => ({
      name,
      onMessage: { addListener: (f) => (appListener = f) },
      onDisconnect: { addListener: () => {} },
    }),
    onMessage: { addListener: (f) => (runtimeListener = f) },
  },
  tabs: {
    query: async () => [{ id: 7 }],
    sendMessage: (id, m) => (sent.push([id, m]), Promise.resolve()),
  },
};
vm.runInNewContext(src, { browser, setTimeout, Date, Promise });

let ok = 0, total = 0;
const check = (n, c) => { total++; if (c) ok++; else console.log('FAIL', n); };

check('port natif "browser" ouvert au démarrage', typeof appListener === 'function');
check('sans reprise : hello → {}', JSON.stringify(await runtimeListener({ type: 'hello' })) === '{}');
appListener({ cmd: 'setRestore', restore: { time: 754, fullscreen: true, autoplay: true } });
const r = await runtimeListener({ type: 'hello' });
check('reprise transmise à chaque frame qui se charge', r.restore?.time === 754 && r.restore?.fullscreen === true);
check('…y compris une 2e frame (lecteur chargé après la page)', (await runtimeListener({ type: 'hello' })).restore?.time === 754);
runtimeListener({ type: 'restored' });
check('reprise consommée une fois la vidéo trouvée', JSON.stringify(await runtimeListener({ type: 'hello' })) === '{}');
appListener({ cmd: 'pause' });
appListener({ cmd: 'toast', text: 'x' });
await new Promise((res) => setTimeout(res, 10));
check('pause / toast diffusés à toutes les frames de l’onglet', sent.length === 2 && sent[0][0] === 7 && sent[0][1].cmd === 'pause');
appListener({ cmd: 'setRestore', restore: null });
check('reprise annulée par l’app', JSON.stringify(await runtimeListener({ type: 'hello' })) === '{}');

console.log(`${ok}/${total} OK`);
process.exitCode = ok === total ? 0 : 1;
