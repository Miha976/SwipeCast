import { Bonjour } from 'bonjour-service';

/** Type DNS-SD du hub. Le téléphone cherche `_swipecast._tcp.local.` (NsdManager : "_swipecast._tcp"). */
export const SERVICE_TYPE = 'swipecast';

/**
 * Annonce le hub sur le réseau local en mDNS / DNS-SD.
 * L'enregistrement TXT porte l'identité stable du hub : le téléphone reconnaît son PC même si l'IP change.
 *
 * @param {{ id: string, name: string, port: number, log?: (...a: any[]) => void }} opts
 */
export function advertise({ id, name, port, log = () => {} }) {
  const bonjour = new Bonjour({}, (err) => log(`[swipecast] mDNS : ${err?.message ?? err}`));
  // Nom d'instance unique sur le réseau (deux PC peuvent porter le même nom d'hôte).
  const instance = `SwipeCast ${name} ${id.slice(0, 4)}`.slice(0, 63);
  const service = bonjour.publish({
    name: instance,
    type: SERVICE_TYPE,
    protocol: 'tcp',
    port,
    txt: { id, name, v: '1' },
    probe: false, // le nom contient déjà un suffixe unique ; évite 750 ms d'attente au démarrage
  });
  service.on?.('error', (e) => log(`[swipecast] mDNS : ${e?.message ?? e}`));
  log(`[swipecast] annonce mDNS : ${instance} (_${SERVICE_TYPE}._tcp, port ${port})`);
  return {
    stop: () =>
      new Promise((resolve) => {
        bonjour.unpublishAll(() => bonjour.destroy(() => resolve()));
      }),
  };
}
