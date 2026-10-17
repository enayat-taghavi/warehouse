import { ApplicationRef } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { isNativePlatform } from './platform';
import { APP_VERSION } from './app-version';
import { compareVersions } from './app-version.service';
import { resolveServerUrl } from './server-origin';
import { OfflineSyncService } from '../services/offline-sync.service';

export interface MobileUpdateManifest {
  version?: string;
  file?: string;
  sha256?: string;
  min_native_version?: string;
  published_at?: string;
  url?: string;
}

export interface LiveUpdateBridge {
  notifyAppReady(): Promise<any>;
  current(): Promise<any>;
  download(options: { url: string; version: string; checksum?: string }): Promise<{ id: string; version?: string }>;
  next(options: { id: string }): Promise<any>;
  getAppInfo(): Promise<{ version: string; build?: string }>;
  addAppStateListener(listener: (state: { isActive: boolean }) => void): Promise<{ remove: () => Promise<void> }>;
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export const liveUpdateBridge: LiveUpdateBridge = {
  notifyAppReady: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.CapacitorUpdater ?? CapacitorUpdater;
    return plugin.notifyAppReady();
  },
  current: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.CapacitorUpdater ?? CapacitorUpdater;
    return plugin.current();
  },
  download: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.CapacitorUpdater ?? CapacitorUpdater;
    return plugin.download(opts);
  },
  next: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.CapacitorUpdater ?? CapacitorUpdater;
    return plugin.next(opts);
  },
  getAppInfo: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.App ?? App;
    return plugin.getInfo();
  },
  addAppStateListener: (listener) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.App ?? App;
    return plugin.addListener('appStateChange', listener);
  },
  fetch: (url, init) => fetch(url, init),
};

export const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let lastCheckTimestamp = 0;

export function resetLiveUpdateCheckTime(): void {
  lastCheckTimestamp = 0;
}

/**
 * Checks for a live update bundle against the backend manifest.
 *
 * Security and Stability Invariants:
 * 1. Native only: executes only when isNativePlatform() is true.
 * 2. Throttled: at most once every 30 minutes unless force=true.
 * 3. Offline safety: skips when OfflineSyncService.isSyncing is true to prevent network contention.
 * 4. Safe activation: only marks bundle for the NEXT restart via next({ id }); never set() or reload().
 * 5. Error resilience: errors are logged and swallowed without interrupting user operations.
 */
export async function checkForLiveUpdate(options?: { force?: boolean }): Promise<void> {
  if (!isNativePlatform()) {
    return;
  }

  // 1. Throttling
  const now = Date.now();
  if (!options?.force && now - lastCheckTimestamp < CHECK_INTERVAL_MS) {
    return;
  }

  // 2. Offline sync check
  try {
    if (OfflineSyncService.getInstance().isSyncing) {
      return;
    }
  } catch {
    // ignore lookup error
  }

  lastCheckTimestamp = now;

  try {
    // 3. Fetch manifest from backend
    const manifestUrl = resolveServerUrl('/api/public/mobile-update/');
    const response = await liveUpdateBridge.fetch(manifestUrl);
    if (!response.ok) {
      return;
    }

    const manifest: MobileUpdateManifest = await response.json();
    if (!manifest || !manifest.version || !manifest.url) {
      return;
    }

    // 4. Current active bundle version
    let currentBundleVersion = APP_VERSION;
    try {
      const cur = await liveUpdateBridge.current();
      const bundle = cur?.bundle;
      if (bundle && bundle.id !== 'builtin' && bundle.version && bundle.version !== 'builtin') {
        currentBundleVersion = bundle.version;
      }
    } catch {
      // fallback to APP_VERSION
    }

    // 5. Version comparison
    if (compareVersions(manifest.version, currentBundleVersion) <= 0) {
      return;
    }

    // 6. Native container compatibility check
    let nativeAppVersion = APP_VERSION;
    try {
      const info = await liveUpdateBridge.getAppInfo();
      if (info?.version) {
        nativeAppVersion = info.version;
      }
    } catch {
      // fallback to APP_VERSION
    }

    if (manifest.min_native_version && compareVersions(manifest.min_native_version, nativeAppVersion) > 0) {
      return;
    }

    // 7. Download bundle with SHA-256 checksum and stage for next restart
    const downloadOpts: { url: string; version: string; checksum?: string } = {
      url: resolveServerUrl(manifest.url),
      version: manifest.version,
    };
    if (manifest.sha256) {
      downloadOpts.checksum = manifest.sha256;
    }

    const downloaded = await liveUpdateBridge.download(downloadOpts);
    if (downloaded?.id) {
      await liveUpdateBridge.next({ id: downloaded.id });
    }
  } catch (err) {
    console.warn('[LiveUpdate] Error checking or downloading live update:', err);
  }
}

/**
 * Initializes Capgo live update on native platforms:
 * - Registers foreground listener to re-check updates (at most once every 30m).
 * - Calls notifyAppReady() once the Angular application is stable to clear rollback timers.
 * - Performs initial update check.
 */
export function initLiveUpdate(appRef?: ApplicationRef): void {
  if (!isNativePlatform()) {
    return;
  }

  // 1. Listen for app foreground events
  try {
    liveUpdateBridge
      .addAppStateListener(({ isActive }) => {
        if (isActive) {
          checkForLiveUpdate().catch((err) => {
            console.warn('[LiveUpdate] Foreground check error:', err);
          });
        }
      })
      .catch((err) => {
        console.warn('[LiveUpdate] addAppStateListener error:', err);
      });
  } catch (err) {
    console.warn('[LiveUpdate] Error registering appStateChange listener:', err);
  }

  // 2. Clear native rollback timer once the app is stable, then run initial check
  const notifyAndCheck = async () => {
    try {
      await liveUpdateBridge.notifyAppReady();
    } catch (err) {
      console.warn('[LiveUpdate] notifyAppReady error:', err);
    }
    try {
      await checkForLiveUpdate();
    } catch (err) {
      console.warn('[LiveUpdate] Initial update check error:', err);
    }
  };

  if (appRef && isObservable(appRef.isStable)) {
    const fallbackTimer = setTimeout(() => {
      notifyAndCheck().catch(() => {});
    }, 3000);

    firstValueFrom(appRef.isStable.pipe(filter(Boolean)))
      .then(() => {
        clearTimeout(fallbackTimer);
        return notifyAndCheck();
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        return notifyAndCheck();
      });
  } else {
    notifyAndCheck().catch(() => {});
  }
}
