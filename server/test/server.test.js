import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createSwipecastServer } from '../src/server.js';

const quiet = () => {};

function connect(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(String(d));
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  ws.next = (type) =>
    new Promise((resolve, reject) => {
      const i = queue.findIndex((m) => m.type === type);
      if (i >= 0) return resolve(queue.splice(i, 1)[0]);
      waiters.push({ type, resolve });
      setTimeout(() => reject(new Error(`timeout waiting ${type}`)), 2000);
    });
  ws.json = (m) => ws.send(JSON.stringify(m));
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

const session = { url: 'https://example.com/video', title: 'Film', currentTime: 754.2, duration: 5400, paused: true };

test('appairage, progression live, handoff en ligne et hors ligne', async () => {
  const server = createSwipecastServer({ port: 0, host: '127.0.0.1', dataDir: mkdtempSync(join(tmpdir(), 'sc-')), log: quiet, advertise: false });
  await server.start();
  const base = `http://127.0.0.1:${server.port}`;

  // mauvais code refusé
  const bad = await fetch(`${base}/pair`, { method: 'POST', body: JSON.stringify({ code: '000000x' }) });
  assert.equal(bad.status, 401);

  // appairage du téléphone
  const code = server.pairingCode;
  const res = await fetch(`${base}/pair`, {
    method: 'POST',
    body: JSON.stringify({ code, name: 'Pixel', platform: 'android' }),
  });
  assert.equal(res.status, 200);
  const phone = await res.json();
  assert.notEqual(server.pairingCode, code, 'le code est à usage unique');

  const pc = server.localDevice('PC');
  const pcWs = await connect(server.port, pc.token);
  await pcWs.next('welcome');

  // jeton invalide rejeté
  await assert.rejects(connect(server.port, 'nope'));

  // le téléphone est hors ligne : le PC envoie quand même → stocké en attente
  pcWs.json({ type: 'handoff', session });
  await new Promise((r) => setTimeout(r, 50));

  const phoneWs = await connect(server.port, phone.token);
  const welcome = await phoneWs.next('welcome');
  assert.equal(welcome.pending.length, 1);
  assert.equal(welcome.pending[0].session.currentTime, 754.2);
  assert.equal(welcome.pending[0].fromName, 'PC');

  // ack → le PC est prévenu
  phoneWs.json({ type: 'ack', id: welcome.pending[0].id });
  const ack = await pcWs.next('handoff-ack');
  assert.equal(ack.id, welcome.pending[0].id);

  // progression live téléphone → PC
  phoneWs.json({ type: 'progress', session: { ...session, currentTime: 800 } });
  const prog = await pcWs.next('peer-progress');
  assert.equal(prog.session.currentTime, 800);

  // handoff en ligne téléphone → PC
  phoneWs.json({ type: 'handoff', session: { ...session, currentTime: 812 } });
  const ho = await pcWs.next('handoff');
  assert.equal(ho.handoff.session.currentTime, 812);
  assert.equal(ho.handoff.fromName, 'Pixel');

  // URL non http refusée
  phoneWs.json({ type: 'handoff', session: { ...session, url: 'javascript:alert(1)' } });
  const err = await phoneWs.next('error');
  assert.match(err.message, /invalide/);

  pcWs.close();
  phoneWs.close();
  await server.stop();
});
