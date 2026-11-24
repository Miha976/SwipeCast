// npx tsx tests/unit/hubs.test.ts
import { mergeHub, relocateConnection, type FoundHub } from '../../app/src/models/hubs';
import type { Connection } from '../../app/src/models/types';

let ok = 0, total = 0;
const check = (n: string, c: boolean) => { total++; if (c) ok++; else console.log('FAIL', n); };

const pc: FoundHub = { id: 'hub-1', name: 'PC-Bureau', host: '192.168.43.120', port: 47321, via: 'mdns' };
const autre: FoundHub = { id: 'hub-2', name: 'Autre-PC', host: '192.168.43.77', port: 47321, via: 'scan' };
const conn: Connection = { baseUrl: 'http://192.168.1.20:47321', token: 't', deviceId: 'd', hubId: 'hub-1', hubName: 'PC-Bureau' };

const moved = relocateConnection(conn, [autre, pc]);
check('PC appairé retrouvé à sa nouvelle adresse', moved?.baseUrl === 'http://192.168.43.120:47321');
check('jeton et appareil conservés (pas de réappairage)', moved?.token === 't' && moved?.deviceId === 'd' && moved?.hubId === 'hub-1');
check('même adresse : rien à changer', relocateConnection({ ...conn, baseUrl: 'http://192.168.43.120:47321' }, [pc]) === null);
check('jamais un autre PC à la place du sien', relocateConnection(conn, [autre]) === null);
check('ancien appairage sans identité : pas de déplacement à l’aveugle', relocateConnection({ ...conn, hubId: undefined }, [pc]) === null);

let list = mergeHub([], pc);
list = mergeHub(list, { ...pc, host: '10.0.0.5' }); // même PC, autre interface
list = mergeHub(list, autre);
check('dédoublonné par identité', list.length === 2);
check('trié par nom', list[0].name === 'Autre-PC');

console.log(`${ok}/${total} OK`);
process.exitCode = ok === total ? 0 : 1;
