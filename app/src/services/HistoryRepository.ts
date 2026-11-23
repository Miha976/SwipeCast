import type { HistoryEntry } from '../models/types';
import { StorageKeys, type StorageService } from './StorageService';

const MAX = 30;

/** Historique local des vidéos ouvertes / envoyées / reçues (dédupliqué par URL). */
export class HistoryRepository {
  constructor(private storage: StorageService) {}

  async list(): Promise<HistoryEntry[]> {
    return (await this.storage.get<HistoryEntry[]>(StorageKeys.history)) ?? [];
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry[]> {
    const list = (await this.list()).filter((e) => e.url !== entry.url);
    list.unshift({ ...entry, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() });
    const next = list.slice(0, MAX);
    await this.storage.set(StorageKeys.history, next);
    return next;
  }

  /** Met à jour la position sans changer l'ordre (appelé périodiquement pendant la lecture). */
  async updatePosition(url: string, currentTime: number, duration: number, title: string): Promise<HistoryEntry[]> {
    const list = await this.list();
    const e = list.find((x) => x.url === url);
    if (!e) return list;
    Object.assign(e, { currentTime, duration, title: title || e.title });
    await this.storage.set(StorageKeys.history, list);
    return list;
  }

  async clear(): Promise<void> {
    await this.storage.remove(StorageKeys.history);
  }
}
