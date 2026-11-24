import { detectPlatform } from './platform';
import { createStorage } from './StorageService';
import { SyncService } from './SyncService';
import { HistoryRepository } from './HistoryRepository';
import { createNotifications } from './NotificationService';
import type { BrowserService } from './browser/BrowserService';
import { ElectronBrowserService } from './browser/ElectronBrowserService';
import { GeckoBrowserService } from './browser/GeckoBrowserService';
import { createLocalNetworkPermission } from './LocalNetworkPermission';
import { WebFallbackBrowserService } from './browser/WebFallbackBrowserService';

/** Composition des dépendances selon la plateforme (point unique où l'on choisit les implémentations). */
export function createServices() {
  const platform = detectPlatform();
  const desktop = window.swipecastDesktop;
  const storage = createStorage();

  let browser: BrowserService;
  if (platform === 'windows' && desktop) browser = new ElectronBrowserService(desktop);
  else if (platform === 'android') browser = new GeckoBrowserService(); // moteur Firefox + uBlock Origin
  else browser = new WebFallbackBrowserService();

  return {
    platform,
    desktop,
    storage,
    browser,
    sync: new SyncService(),
    history: new HistoryRepository(storage),
    notifications: createNotifications(platform, desktop?.focusWindow),
    localNetwork: createLocalNetworkPermission(platform),
  };
}

export type Services = ReturnType<typeof createServices>;
