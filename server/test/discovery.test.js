import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bonjour } from 'bonjour-service';
import { createSwipecastServer } from '../src/server.js';

const quiet = () => {};

test('identité du hub stable entre redémarrages, exposée par /health et /pair', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'sc-'));
  const a = createSwipecastServer({ port: 0, host: '127.0.0.1', dataDir, name: 'PC-Test', advertise: false, log: quiet });
  await a.start();
  const health = await (await fetch(`http://127.0.0.1:${a.port}/health`)).json();
  assert.equal(health.app, 'swipecast');
  assert.equal(health.name, 'PC-Test');
  assert.match(health.id, /^[0-9a-f-]{36}$/);
  const pair = await (
    await fetch(`http://127.0.0.1:${a.port}/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: a.pairingCode, name: 'Pixel', platform: 'android' }),
    })
  ).json();
  assert.equal(pair.hubId, health.id);
  assert.equal(pair.hubName, 'PC-Test');
  await a.stop();

  const b = createSwipecastServer({ port: 0, host: '127.0.0.1', dataDir, advertise: false, log: quiet });
  await b.start();
  assert.equal(b.hubId, health.id, 'même dossier de données → même identité');
  await b.stop();
});

test('annonce mDNS _swipecast._tcp avec l’identité dans le TXT', async (t) => {
  const server = createSwipecastServer({ port: 0, dataDir: mkdtempSync(join(tmpdir(), 'sc-')), name: 'PC-Test', log: quiet });
  await server.start();
  const browser = new Bonjour();
  try {
    const found = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('service mDNS non trouvé')), 5000);
      browser.find({ type: 'swipecast' }, (svc) => {
        if (svc.txt?.id === server.hubId) {
          clearTimeout(timer);
          resolve(svc);
        }
      });
    }).catch((e) => {
      // Certains bacs à sable n'ont pas de multicast : on le signale sans masquer un vrai échec ailleurs.
      if (process.env.CI) throw e;
      t.skip(`multicast indisponible ici : ${e.message}`);
      return null;
    });
    if (found) {
      assert.equal(found.port, server.port);
      assert.equal(found.txt.name, 'PC-Test');
    }
  } finally {
    await new Promise((r) => browser.destroy(r));
    await server.stop();
  }
});
