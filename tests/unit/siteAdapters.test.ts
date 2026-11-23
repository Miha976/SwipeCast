import { withStartTime as w } from '../../app/src/models/siteAdapters.ts';
const cases: [string, number, string][] = [
  ['https://www.youtube.com/watch?v=abc&t=10s', 754.9, 'https://www.youtube.com/watch?v=abc&t=754s'],
  ['https://m.youtube.com/watch?v=abc', 61, 'https://m.youtube.com/watch?v=abc&t=61s'],
  ['https://youtu.be/abc?si=x', 30, 'https://youtu.be/abc?si=x&t=30s'],
  ['https://www.youtube.com/embed/abc', 30, 'https://www.youtube.com/embed/abc?start=30'],
  ['https://www.youtube.com/shorts/abc', 30, 'https://www.youtube.com/shorts/abc'],
  ['https://vimeo.com/123', 90, 'https://vimeo.com/123#t=90s'],
  ['https://anime-sama.fr/catalogue/x/', 90, 'https://anime-sama.fr/catalogue/x/'],
  ['https://notyoutube.com/watch?v=a', 5, 'https://notyoutube.com/watch?v=a'],
];
let ok = 0;
for (const [u, t, exp] of cases) { const got = w(u, t); if (got === exp) ok++; else console.log('FAIL', u, '→', got, '≠', exp); }
console.log(`${ok}/${cases.length} OK`);
process.exitCode = ok === cases.length ? 0 : 1;
