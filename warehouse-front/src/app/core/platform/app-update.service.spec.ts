// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppUpdateService } from './app-update.service';
import { PwaUpdateService } from '../services/pwa-update.service';
import { liveUpdateController } from './live-update';

describe('AppUpdateService', () => {
  let mockPwaUpdate: any;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    mockPwaUpdate = {
      isChecking: signal(false),
      init: vi.fn(),
      checkAndApplyManualUpdate: vi.fn().mockResolvedValue(undefined),
      hardResetCache: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
        { provide: PwaUpdateService, useValue: mockPwaUpdate },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
  });

  it('1. should delegate init call to PwaUpdateService', () => {
    const service = TestBed.inject(AppUpdateService);
    service.init();
    expect(mockPwaUpdate.init).toHaveBeenCalled();
  });

  it('2. should delegate checkAndApplyManualUpdate call to PwaUpdateService', async () => {
    const service = TestBed.inject(AppUpdateService);
    await service.checkAndApplyManualUpdate({ pendingCount: 2 });
    expect(mockPwaUpdate.checkAndApplyManualUpdate).toHaveBeenCalledWith({ pendingCount: 2 });
  });

  it('3. should delegate hardResetCache call to PwaUpdateService', async () => {
    const service = TestBed.inject(AppUpdateService);
    await service.hardResetCache();
    expect(mockPwaUpdate.hardResetCache).toHaveBeenCalled();
  });

  it('4. should expose isChecking signal from PwaUpdateService', () => {
    const service = TestBed.inject(AppUpdateService);
    expect(service.isChecking()).toBe(false);
    mockPwaUpdate.isChecking.set(true);
    expect(service.isChecking()).toBe(true);
  });

  it('5. should call initLiveUpdate instead of PwaUpdateService on native platform', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
    };
    const initSpy = vi.spyOn(liveUpdateController, 'init').mockImplementation(() => {});
    try {
      const service = TestBed.inject(AppUpdateService);
      service.init();
      expect(mockPwaUpdate.init).not.toHaveBeenCalled();
      expect(initSpy).toHaveBeenCalled();
    } finally {
      initSpy.mockRestore();
      delete (globalThis as any).Capacitor;
    }
  });
});
