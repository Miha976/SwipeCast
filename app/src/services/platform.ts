import { Capacitor } from '@capacitor/core';
import type { BrowsingState, Platform, RestoreOptions, TrackerMessage } from '../models/types';

/** API exposée par electron/app-preload.cjs (contextBridge). */
export interface DesktopBridge {
  getHub(): Promise<{
    baseUrl: string;
    token: string;
    deviceId: string;
    port: number;
    addresses: string[];
    pairingCode: string;
  }>;
  onPairingCode(cb: (code: string) => void): () => void;
  unpair(deviceId: string): Promise<void>;
  focusWindow(): Promise<void>;
  browser: {
    open(url: string, restore?: RestoreOptions): Promise<void>;
    close(): Promise<void>;
    back(): Promise<void>;
    pause(): Promise<void>;
    toast(text: string): Promise<void>;
    onMessage(cb: (msg: TrackerMessage) => void): () => void;
    onState(cb: (s: BrowsingState | null) => void): () => void;
  };
}

declare global {
  interface Window {
    swipecastDesktop?: DesktopBridge;
  }
}

export function detectPlatform(): Platform {
  if (window.swipecastDesktop) return 'windows';
  if (Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}
