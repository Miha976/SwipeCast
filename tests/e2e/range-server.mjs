// Serveur statique minimal avec support HTTP Range (comme un vrai CDN vidéo)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2];
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = f.endsWith('.webm') ? 'video/webm' : 'text/html; charset=utf-8';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) { const s = +m[1] || 0, e = m[2] ? +m[2] : size - 1;
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${size}`, 'content-length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size }); fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', () => console.log(srv.address().port));
