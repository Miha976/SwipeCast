import { detectPlatform } from './platform';
import { createStorage } from './StorageService';
import { SyncService } from './SyncService';
import { HistoryRepository } from './HistoryRepository';
import { createNotifications } from './NotificationService';
import type { BrowserService } from './browser/BrowserService';
import { ElectronBrowserService } from './browser/ElectronBrowserService';
import { CapacitorBrowserService } from './browser/CapacitorBrowserService';
import { GeckoBrowserService } from './browser/GeckoBrowserService';
import { WebFallbackBrowserService } from './browser/WebFallbackBrowserService';

/**
 * Android : navigateur GeckoView (moteur Firefox + uBlock Origin). Repasser à false pour revenir à
 * l'ancienne WebView (plugin capgo) le temps de valider le prototype ; elle sera supprimée ensuite.
 */
const USE_GECKO = true;

/** Composition des dépendances selon la plateforme (point unique où l'on choisit les implémentations). */
export function createServices() {
  const platform = detectPlatform();
  const desktop = window.swipecastDesktop;
  const storage = createStorage();

  let browser: BrowserService;
  if (platform === 'windows' && desktop) browser = new ElectronBrowserService(desktop);
  else if (platform === 'android') browser = USE_GECKO ? new GeckoBrowserService() : new CapacitorBrowserService();
  else browser = new WebFallbackBrowserService();

  return {
    platform,
    desktop,
    storage,
    browser,
    sync: new SyncService(),
    history: new HistoryRepository(storage),
    notifications: createNotifications(platform, desktop?.focusWindow),
  };
}

export type Services = ReturnType<typeof createServices>;
