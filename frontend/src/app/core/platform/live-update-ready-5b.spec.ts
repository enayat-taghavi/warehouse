// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import {
  checkForLiveUpdate,
  applyLiveUpdateNow,
  liveUpdateReady,
  liveUpdateBridge,
  stopLiveUpdate,
} from './live-update';
import { OfflineSyncService } from '../services/offline-sync.service';
import { UpdateBarComponent } from '../../shared/components/update-bar/update-bar.component';
import { PwaUpdateService } from '../services/pwa-update.service';

let localStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => localStore[key] ?? null,
  setItem: (key: string, val: string) => { localStore[key] = String(val); },
  removeItem: (key: string) => { delete localStore[key]; },
  clear: () => { localStore = {}; },
  get length() { return Object.keys(localStore).length; },
  key: (i: number) => Object.keys(localStore)[i] ?? null,
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}
if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe("Live Update ready bar (Release v1 step 5-b)", () => {
  let setSpy: ReturnType<typeof vi.spyOn>;
  let nextSpy: ReturnType<typeof vi.spyOn>;
  let downloadSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let currentSpy: ReturnType<typeof vi.spyOn>;
  let getAppInfoSpy: ReturnType<typeof vi.spyOn>;
  let notifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    liveUpdateReady.set(null);
    stopLiveUpdate();

    delete (globalThis as any).Capacitor;

    setSpy = vi.spyOn(liveUpdateBridge, 'set').mockResolvedValue(undefined as any);
    nextSpy = vi.spyOn(liveUpdateBridge, 'next').mockResolvedValue(undefined as any);
    downloadSpy = vi.spyOn(liveUpdateBridge, 'download').mockResolvedValue({ id: 'b1', version: '9.0.0' });
    currentSpy = vi.spyOn(liveUpdateBridge, 'current').mockResolvedValue({
      bundle: { id: 'builtin', version: '1.0.0' },
    });
    getAppInfoSpy = vi.spyOn(liveUpdateBridge, 'getAppInfo').mockResolvedValue({
      version: '1.0.0',
      build: '1',
    });
    notifySpy = vi.spyOn(liveUpdateBridge, 'notifyAppReady').mockResolvedValue(undefined as any);
    fetchSpy = vi.spyOn(liveUpdateBridge, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '9.0.0',
        url: 'https://app.farsalish.ir/bundle.zip',
      }),
    } as any);

    const offline = OfflineSyncService.getInstance();
    (offline as any)._isSyncing$.next(false);
    (offline as any)._pendingCount$.next(0);
  });

  afterEach(() => {
    localStorage.clear();
    liveUpdateReady.set(null);
    stopLiveUpdate();

    const offline = OfflineSyncService.getInstance();
    (offline as any)._isSyncing$.next(false);
    (offline as any)._pendingCount$.next(0);

    delete (globalThis as any).Capacitor;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('a) checkForLiveUpdate on native with higher version calls next and sets liveUpdateReady, not set', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };

    await checkForLiveUpdate({ force: true });

    expect(nextSpy).toHaveBeenCalledWith({ id: 'b1' });
    expect(liveUpdateReady()).toEqual({ id: 'b1', version: '9.0.0' });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('b) when download rejects, liveUpdateReady stays null', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };
    downloadSpy.mockRejectedValue(new Error('Download failed'));

    await checkForLiveUpdate({ force: true });

    expect(liveUpdateReady()).toBeNull();
  });

  it('c) applyLiveUpdateNow with liveUpdateReady null returns none and does not call set', async () => {
    expect(liveUpdateReady()).toBeNull();

    const res = await applyLiveUpdateNow();

    expect(res).toBe('none');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('d) with liveUpdateReady set and isSyncing true returns syncing and does not call set', async () => {
    liveUpdateReady.set({ id: 'b1', version: '9.0.0' });
    (OfflineSyncService.getInstance() as any)._isSyncing$.next(true);

    const res = await applyLiveUpdateNow();

    expect(res).toBe('syncing');
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('e) same but not syncing returns applied and calls set once with { id: b1 }', async () => {
    liveUpdateReady.set({ id: 'b1', version: '9.0.0' });
    (OfflineSyncService.getInstance() as any)._isSyncing$.next(false);

    const res = await applyLiveUpdateNow();

    expect(res).toBe('applied');
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({ id: 'b1' });
  });

  it('f) UpdateBarComponent DOM handles liveUpdateReady, syncing, pending count, apply click, and later click', async () => {
    const fakePwa = {
      updateReady: signal(false),
      updateDismissed: signal(false),
      applyUpdate: vi.fn().mockResolvedValue(undefined),
      dismissUpdate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UpdateBarComponent],
      providers: [
        { provide: PwaUpdateService, useValue: fakePwa },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UpdateBarComponent);

    // with liveUpdateReady set, [data-testid="live-update-bar"] is shown
    liveUpdateReady.set({ id: 'b1', version: '9.0.0' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="live-update-bar"]')).not.toBeNull();

    // with _isSyncing$ true the [data-testid="live-update-apply"] button is disabled and [data-testid="live-update-syncing"] is shown
    (OfflineSyncService.getInstance() as any)._isSyncing$.next(true);
    fixture.detectChanges();
    const applyBtn = fixture.nativeElement.querySelector('[data-testid="live-update-apply"]') as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="live-update-syncing"]')).not.toBeNull();

    // with _isSyncing$ false and _pendingCount$ 2 the button is enabled and [data-testid="live-update-pending"] is shown
    (OfflineSyncService.getInstance() as any)._isSyncing$.next(false);
    (OfflineSyncService.getInstance() as any)._pendingCount$.next(2);
    fixture.detectChanges();
    expect(applyBtn.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="live-update-pending"]')).not.toBeNull();

    // clicking it calls the set spy
    applyBtn.click();
    await fixture.whenStable();
    expect(setSpy).toHaveBeenCalledWith({ id: 'b1' });

    // clicking [data-testid="live-update-later"] hides the bar
    const laterBtn = fixture.nativeElement.querySelector('[data-testid="live-update-later"]') as HTMLButtonElement;
    laterBtn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="live-update-bar"]')).toBeNull();
  });

  it('g) no storage clear: spy on localStorage.clear and indexedDB.deleteDatabase -> after case (e) neither was called', async () => {
    if (!globalThis.indexedDB) {
      (globalThis as any).indexedDB = {
        deleteDatabase: vi.fn(),
      };
    } else if (typeof (globalThis.indexedDB as any).deleteDatabase !== 'function') {
      (globalThis.indexedDB as any).deleteDatabase = vi.fn();
    }

    const clearSpy = vi.spyOn(localStorage, 'clear');
    const idbSpy = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');

    liveUpdateReady.set({ id: 'b1', version: '9.0.0' });
    (OfflineSyncService.getInstance() as any)._isSyncing$.next(false);

    const res = await applyLiveUpdateNow();
    expect(res).toBe('applied');
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({ id: 'b1' });

    expect(clearSpy).not.toHaveBeenCalled();
    expect(idbSpy).not.toHaveBeenCalled();
  });
});
