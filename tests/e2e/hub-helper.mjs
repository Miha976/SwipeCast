// Démarre un vrai hub + simule l'app PC (client WS) pilotée par stdin.
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import readline from 'node:readline';
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const WebSocket = require('ws');
const { createSwipecastServer } = await import('../../server/src/server.js');
const hub = createSwipecastServer({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(join(tmpdir(), 'hub-')), log: () => {}, advertise: false });
await hub.start();
const pc = hub.localDevice('PC-Bureau');
const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws?token=${pc.token}`);
const got = [];
ws.on('message', (d) => got.push(JSON.parse(String(d))));
await new Promise((r) => ws.on('open', r));
console.log(JSON.stringify({ port: hub.port, code: hub.pairingCode }));
const session = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Conférence — Architecture MVVM en React', currentTime: 1874, duration: 3605, paused: false };
for await (const line of readline.createInterface({ input: process.stdin })) {
  if (line === 'progress') ws.send(JSON.stringify({ type: 'progress', session }));
  if (line === 'handoff') ws.send(JSON.stringify({ type: 'handoff', session: { ...session, paused: true } }));
  if (line === 'dump') console.log(JSON.stringify(got.map((m) => m.type)));
}
