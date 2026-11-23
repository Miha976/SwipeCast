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
  const data = (await res.json().catch(() => ({}))) as { token?: string; deviceId?: string; error?: string };
  if (!res.ok || !data.token || !data.deviceId) {
    throw new PairingError(data.error ?? `Erreur ${res.status}`);
  }
  return { baseUrl, token: data.token, deviceId: data.deviceId };
}
