import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export interface StorageService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Android : SharedPreferences (survit au nettoyage du cache WebView). Ailleurs : localStorage. */
export function createStorage(): StorageService {
  const native = Capacitor.isNativePlatform();
  return {
    async get<T>(key: string) {
      const raw = native ? (await Preferences.get({ key })).value : localStorage.getItem(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T) {
      const raw = JSON.stringify(value);
      if (native) await Preferences.set({ key, value: raw });
      else localStorage.setItem(key, raw);
    },
    async remove(key: string) {
      if (native) await Preferences.remove({ key });
      else localStorage.removeItem(key);
    },
  };
}

export const StorageKeys = {
  connection: 'swipecast.connection',
  settings: 'swipecast.settings',
  history: 'swipecast.history',
} as const;
