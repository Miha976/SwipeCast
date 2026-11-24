// Construit l'extension intégrée au navigateur GeckoView (Android) :
//   app/gecko-ext/*  +  shared/tracker.js  →  android/app/src/main/assets/swipecast-ext/
// Le script de suivi est le MÊME que sur PC (Electron) : une seule source de vérité.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(app, 'gecko-ext');
const out = process.argv[2] ?? join(app, 'android', 'app', 'src', 'main', 'assets', 'swipecast-ext');

mkdirSync(out, { recursive: true });
for (const f of ['manifest.json', 'background.js']) copyFileSync(join(src, f), join(out, f));

const content = [
  readFileSync(join(src, 'content-prelude.js'), 'utf8'),
  readFileSync(join(src, 'link-guard.js'), 'utf8'),
  '/* ---- shared/tracker.js ---- */',
  readFileSync(join(app, 'shared', 'tracker.js'), 'utf8'),
  readFileSync(join(src, 'content-epilogue.js'), 'utf8'),
].join('\n');
writeFileSync(join(out, 'content.js'), content);
console.log(`extension SwipeCast → ${out}`);
