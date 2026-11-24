import type { Connection, Platform } from '../models/types';

export class PairingError extends Error {}

/** Échange le code à 6 chiffres affiché sur le PC contre un jeton d'appareil permanent. */
export async function pairWithHub(
  baseUrl: string,
  code: string,
  device: { name: string; platform: Platform },
): Promise<Connection> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), ...device }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new PairingError(
      'PC injoignable. Vérifie que SwipeCast est ouvert sur le PC et que les deux appareils sont sur le même Wi-Fi.',
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    deviceId?: string;
    hubId?: string;
    hubName?: string;
    error?: string;
  };
  if (!res.ok || !data.token || !data.deviceId) {
    throw new PairingError(data.error ?? `Erreur ${res.status}`);
  }
  return { baseUrl, token: data.token, deviceId: data.deviceId, hubId: data.hubId, hubName: data.hubName };
}

/** Identité du hub (pour les appairages faits avant la découverte réseau, qui ne l'ont pas enregistrée). */
export async function fetchHubIdentity(baseUrl: string): Promise<{ id: string; name: string } | null> {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const d = (await r.json()) as { app?: string; id?: string; name?: string };
    return d.app === 'swipecast' && d.id ? { id: d.id, name: d.name ?? '' } : null;
  } catch {
    return null;
  }
}
