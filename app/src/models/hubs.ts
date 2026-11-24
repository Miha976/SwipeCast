import type { Connection } from './types';

/** Hub SwipeCast (le PC) trouvé sur le réseau local par mDNS ou par scan. */
export interface FoundHub {
  /** identité stable du hub (ne change pas avec l'IP) */
  id: string;
  name: string;
  host: string;
  port: number;
  via?: 'mdns' | 'scan';
}

export const hubBaseUrl = (h: Pick<FoundHub, 'host' | 'port'>): string => `http://${h.host}:${h.port}`;

/** Ajoute un hub à la liste sans doublon (même identité = même PC, même s'il a plusieurs adresses). */
export function mergeHub(list: FoundHub[], hub: FoundHub): FoundHub[] {
  if (list.some((h) => h.id === hub.id)) return list;
  return [...list, hub].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Le PC appairé a-t-il changé d'adresse ? (partage de connexion, bail DHCP renouvelé…)
 * Renvoie la connexion mise à jour, ou null si rien à changer ou si le hub n'a pas été retrouvé.
 * On ne suit QUE l'identité appairée : un autre PC SwipeCast du réseau n'est jamais pris à sa place.
 */
export function relocateConnection(conn: Connection, hubs: FoundHub[]): Connection | null {
  if (!conn.hubId) return null;
  const match = hubs.find((h) => h.id === conn.hubId);
  if (!match) return null;
  const baseUrl = hubBaseUrl(match);
  if (baseUrl === conn.baseUrl) return null;
  return { ...conn, baseUrl, hubName: match.name };
}
