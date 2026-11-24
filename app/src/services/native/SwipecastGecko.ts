import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BrowsingState, RestoreOptions, TrackerMessage } from '../../models/types';

/** granted | prompt | prompt-with-rationale | denied (denied = Android ne reproposera plus la demande) */
export type PermissionStatus = 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied';

/**
 * Plugin natif Android : android/app/src/main/java/dev/miha976/swipecast/gecko/SwipecastGeckoPlugin.java
 * Enregistré une seule fois ici (un second registerPlugin du même nom n'est pas souhaitable).
 */
export interface SwipecastGeckoPlugin {
  open(options: { url: string; restore?: RestoreOptions }): Promise<void>;
  close(): Promise<void>;
  back(): Promise<void>;
  pause(): Promise<void>;
  toast(options: { text: string }): Promise<void>;
  checkLocalNetwork(): Promise<{ state: PermissionStatus }>;
  requestLocalNetwork(): Promise<{ state: PermissionStatus }>;
  openAppSettings(): Promise<void>;
  addListener(event: 'message', cb: (m: TrackerMessage & { frame?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'state', cb: (s: BrowsingState | { closed: true }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'popupBlocked', cb: (p: { url?: string }) => void): Promise<PluginListenerHandle>;
}

export const Gecko = registerPlugin<SwipecastGeckoPlugin>('SwipecastGecko');
