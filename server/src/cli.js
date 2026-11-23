#!/usr/bin/env node
// Lancement autonome du hub (sans Electron), utile en dev ou sur un mini-PC toujours allumé.
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createSwipecastServer } from './server.js';

const port = Number(process.env.SWIPECAST_PORT ?? 47321);
const dataDir = process.env.SWIPECAST_DATA ?? join(homedir(), '.swipecast');

const server = createSwipecastServer({ port, dataDir });
await server.start();

const printCode = (code) => {
  console.log('\n  Appairage du téléphone');
  for (const ip of server.lanAddresses()) console.log(`    Adresse : ${ip}:${server.port}`);
  console.log(`    Code    : ${code}\n`);
};
printCode(server.pairingCode);
server.events.onPairingCodeChanged = printCode;

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
