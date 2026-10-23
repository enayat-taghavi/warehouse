// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import {
  AppVersionService,
  compareVersions,
  parseVersion,
  isAutoSendBlocked,
  setActiveAppVersionService,
} from './app-version.service';
import { APP_VERSION } from './app-version';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { environment } from '../../../environments/environment';

function setNativeStub(platform: 'android' | 'ios' = 'android') {
  (globalThis as any).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  };
}

describe('AppVersionService & version comparison', () => {
  let originalChannel: any;
  let mockConfigApi: { getPublicConfig: any };
  let mockOfflineSync: { emergencyFlush: any; pendingCount$: any; getUnsentCountStrict: any };

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    originalChannel = (environment as any).appChannel;
    (environment as any).appChannel = 'direct';

    mockConfigApi = {
      getPublicConfig: vi.fn().mockReturnValue(of({
        system_version: '1.0.0',
        system_name: 'انبار',
        app_min_version: '',
        app_recommended_version: '',
        app_download_urls: {
          direct: 'https://download.farsalish.ir/app.apk',
          bazaar: 'https://cafebazaar.ir/app/com.warehouse',
          myket: 'https://myket.ir/app/com.warehouse',
        },
      } as PublicConfig)),
    };

    mockOfflineSync = {
      emergencyFlush: vi.fn().mockResolvedValue({ status: 'completed', synced: 5 }),
      pendingCount$: of(0),
      getUnsentCountStrict: vi.fn().mockResolvedValue(0),
    };

    TestBed.configureTestingModule({
      providers: [
        AppVersionService,
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: OfflineSyncService, useValue: mockOfflineSync },
      ],
    });
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    (environment as any).appChannel = originalChannel;
    setActiveAppVersionService(null);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // 1. compareVersions standard numeric cases
  it('1. should accurately compare major, minor, and patch numbers', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });

  // 2. parseVersion and compareVersions invalid or empty rules
  it('2. should treat empty and invalid version strings as no rule', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(' ')).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('1.0.0.0')).toBeNull();
    expect(parseVersion('1.a.0')).toBeNull();
    expect(parseVersion('invalid')).toBeNull();

    expect(compareVersions('', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '')).toBe(1);
    expect(compareVersions('', '')).toBe(0);
  });

  // 3. Web mode always ok
  it('3. should always return ok status on web regardless of server version constraints', () => {
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '9.9.9',
      app_recommended_version: '9.9.9',
    });

    expect(service.state()).toBe('ok');
    expect(service.isAutoSendBlocked()).toBe(false);
    expect(isAutoSendBlocked()).toBe(false);
  });

  // 4. Native mode locked
  it('4. should transition to locked on native when app_min_version is higher than APP_VERSION', () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '1.1.0',
      app_recommended_version: '1.2.0',
    });

    expect(service.state()).toBe('locked');
  });

  // 5. Native mode recommend
  it('5. should transition to recommend on native when not locked and app_recommended_version is higher', () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '1.0.0',
      app_recommended_version: '1.0.1',
    });

    expect(service.state()).toBe('recommend');
    expect(service.isAutoSendBlocked()).toBe(false);
  });

  // 6. Native mode ok when meeting or exceeding versions
  it('6. should remain ok on native when current version satisfies min and recommended', () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '1.0.0',
      app_recommended_version: '1.0.0',
    });

    expect(service.state()).toBe('ok');
    expect(service.isAutoSendBlocked()).toBe(false);
  });

  // 7. Empty and invalid rules ignored on native
  it('7. should ignore empty and invalid version rules on native and remain ok', () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '',
      app_recommended_version: 'invalid-semver',
    });

    expect(service.state()).toBe('ok');
    expect(service.isAutoSendBlocked()).toBe(false);
  });

  // 8. isAutoSendBlocked only when locked
  it('8. should report isAutoSendBlocked as true only when locked', () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    // Initial state ok
    service.applyConfig({ system_version: '1.0.0', system_name: 'انبار' });
    expect(service.isAutoSendBlocked()).toBe(false);
    expect(isAutoSendBlocked()).toBe(false);

    // Recommend state
    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_recommended_version: '2.0.0',
    });
    expect(service.state()).toBe('recommend');
    expect(service.isAutoSendBlocked()).toBe(false);
    expect(isAutoSendBlocked()).toBe(false);

    // Locked state
    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '2.0.0',
    });
    expect(service.state()).toBe('locked');
    expect(service.isAutoSendBlocked()).toBe(true);
    expect(isAutoSendBlocked()).toBe(true);
  });

  // 9. emergencySend calls flush even when locked
  it('9. should ensure emergencySend executes queue flush even when locked', async () => {
    setNativeStub('android');
    const service = TestBed.inject(AppVersionService);

    service.applyConfig({
      system_version: '1.0.0',
      system_name: 'انبار',
      app_min_version: '2.0.0',
    });
    expect(service.state()).toBe('locked');
    expect(service.isAutoSendBlocked()).toBe(true);

    const outcome = await service.emergencySend();

    expect(mockOfflineSync.emergencyFlush).toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'completed', synced: 5 });
  });

  // 10. downloadUrl per channel
  it('10. should resolve downloadUrl per channel and fall back to direct', () => {
    const service = TestBed.inject(AppVersionService);
    const configWithUrls: PublicConfig = {
      system_version: '1.0.0',
      system_name: 'انبار',
      app_download_urls: {
        direct: 'https://dl.farsalish.ir/app.apk',
        bazaar: 'https://cafebazaar.ir/app/com.warehouse',
        myket: 'https://myket.ir/app/com.warehouse',
      },
    };
    service.applyConfig(configWithUrls);

    // Direct channel
    (environment as any).appChannel = 'direct';
    expect(service.downloadUrl).toBe('https://dl.farsalish.ir/app.apk');

    // Bazaar channel
    (environment as any).appChannel = 'bazaar';
    expect(service.downloadUrl).toBe('https://cafebazaar.ir/app/com.warehouse');

    // Myket channel
    (environment as any).appChannel = 'myket';
    expect(service.downloadUrl).toBe('https://myket.ir/app/com.warehouse');

    // Unknown channel fallback to direct
    (environment as any).appChannel = 'play_store';
    expect(service.downloadUrl).toBe('https://dl.farsalish.ir/app.apk');

    // Empty urls fallback to empty string
    service.applyConfig({ system_version: '1.0.0', system_name: 'انبار' });
    expect(service.downloadUrl).toBe('');
  });
});
