// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApplicationRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  checkForLiveUpdate,
  initLiveUpdate,
  liveUpdateBridge,
  resetLiveUpdateCheckTime,
  stopLiveUpdate,
} from './live-update';
import { OfflineSyncService } from '../services/offline-sync.service';

describe('live-update', () => {
  let notifySpy: ReturnType<typeof vi.spyOn>;
  let currentSpy: ReturnType<typeof vi.spyOn>;
  let downloadSpy: ReturnType<typeof vi.spyOn>;
  let nextSpy: ReturnType<typeof vi.spyOn>;
  let getAppInfoSpy: ReturnType<typeof vi.spyOn>;
  let addAppStateListenerSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    stopLiveUpdate();

    notifySpy = vi.spyOn(liveUpdateBridge, 'notifyAppReady').mockResolvedValue(undefined as any);
    currentSpy = vi.spyOn(liveUpdateBridge, 'current').mockResolvedValue({
      bundle: { id: 'builtin', version: '1.0.0' },
      native: '1.0.0',
    });
    downloadSpy = vi.spyOn(liveUpdateBridge, 'download').mockResolvedValue({
      id: 'bundle-uuid-1',
      version: '1.1.0',
    });
    nextSpy = vi.spyOn(liveUpdateBridge, 'next').mockResolvedValue(undefined as any);
    getAppInfoSpy = vi.spyOn(liveUpdateBridge, 'getAppInfo').mockResolvedValue({
      version: '1.0.0',
      build: '1',
    });
    addAppStateListenerSpy = vi.spyOn(liveUpdateBridge, 'addAppStateListener').mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });
    fetchSpy = vi.spyOn(liveUpdateBridge, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.1.0',
        file: '1.1.0.zip',
        sha256: 'a1b2c3d4e5f6',
        min_native_version: '1.0.0',
        url: 'https://app.farsalish.ir/api/public/mobile-files/updates/1.1.0.zip',
      }),
    } as any);

    // Default offline sync: not syncing
    vi.spyOn(OfflineSyncService.getInstance(), 'isSyncing', 'get').mockReturnValue(false);
  });

  afterEach(() => {
    stopLiveUpdate();
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
  });

  it('1. web does nothing when isNativePlatform is false', async () => {
    initLiveUpdate();
    await checkForLiveUpdate({ force: true });

    expect(notifySpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('2. a newer version downloads with checksum and calls next', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    await checkForLiveUpdate({ force: true });

    expect(fetchSpy).toHaveBeenCalled();
    expect(downloadSpy).toHaveBeenCalledWith({
      url: 'https://app.farsalish.ir/api/public/mobile-files/updates/1.1.0.zip',
      version: '1.1.0',
      checksum: 'a1b2c3d4e5f6',
    });
    expect(nextSpy).toHaveBeenCalledWith({ id: 'bundle-uuid-1' });
  });

  it('3. the same or an older version does nothing', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    // Case A: manifest has the same version as current active bundle
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '1.0.0',
        url: 'https://app.farsalish.ir/bundle.zip',
      }),
    } as any);

    await checkForLiveUpdate({ force: true });
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();

    // Case B: manifest has an older version than current active bundle
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '0.9.9',
        url: 'https://app.farsalish.ir/bundle.zip',
      }),
    } as any);

    await checkForLiveUpdate({ force: true });
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('4. a too high min_native_version does nothing', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    getAppInfoSpy.mockResolvedValueOnce({ version: '1.0.0', build: '1' });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '1.2.0',
        min_native_version: '2.0.0',
        url: 'https://app.farsalish.ir/bundle.zip',
      }),
    } as any);

    await checkForLiveUpdate({ force: true });

    expect(downloadSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('5. while isSyncing it does not download', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    // Mock OfflineSyncService in active synchronization state
    vi.spyOn(OfflineSyncService.getInstance(), 'isSyncing', 'get').mockReturnValue(true);

    await checkForLiveUpdate({ force: true });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it('6. errors are swallowed and do not throw', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    // Subcase 1: network request fails
    fetchSpy.mockRejectedValueOnce(new Error('Network timeout'));
    await expect(checkForLiveUpdate({ force: true })).resolves.not.toThrow();

    // Subcase 2: download fails
    resetLiveUpdateCheckTime();
    downloadSpy.mockRejectedValueOnce(new Error('Storage error'));
    await expect(checkForLiveUpdate({ force: true })).resolves.not.toThrow();

    // Subcase 3: notifyAppReady fails in initLiveUpdate
    notifySpy.mockRejectedValueOnce(new Error('Native bridge failure'));
    expect(() => initLiveUpdate()).not.toThrow();
  });

  it('7. notifyAppReady is called once the app is stable', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    const isStable$ = new BehaviorSubject<boolean>(true);
    const mockAppRef = {
      isStable: isStable$.asObservable(),
    } as unknown as ApplicationRef;

    initLiveUpdate(mockAppRef);
    await Promise.resolve();
    await Promise.resolve();

    expect(notifySpy).toHaveBeenCalled();
  });

  it('8. throttles checks to at most once per 30 minutes unless forced', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    await checkForLiveUpdate();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Immediate second check should be throttled
    await checkForLiveUpdate();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Force flag bypasses throttle
    await checkForLiveUpdate({ force: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
