// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError, NEVER } from 'rxjs';
import {
  DomainMigrationService,
  LOCATION_NAVIGATOR,
  LocationNavigator,
  DOMAIN_MIGRATION_PROBES,
  DomainMigrationProbes,
  DOMAIN_MIGRATION_RETRY_MS,
  DOMAIN_MIGRATION_PHOTO_QUEUE,
} from './domain-migration.service';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { OfflineSyncService } from './offline-sync.service';
import { PhotoUploadQueueService } from './photo-upload-queue.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const CONFIG: PublicConfig = {
  system_version: '1.0.0',
  system_name: 'Warehouse',
  canonical_domain: 'new.farsalish.ir',
};

describe('DomainMigrationService (گام ۵: انتقال دامنه)', () => {
  let service: DomainMigrationService;
  let fakeNavigator: LocationNavigator;
  let mockConfigApi: { getPublicConfig: ReturnType<typeof vi.fn>; probePublicConfig: ReturnType<typeof vi.fn> };
  let mockOfflineSync: { getUnsentCountStrict: ReturnType<typeof vi.fn>; pendingCount$: any; isSyncing: boolean };
  let mockPhotoQueue: { countPendingStrict: ReturnType<typeof vi.fn>; pendingCount$: any; isFlushing: boolean };
  let probes: { [K in keyof DomainMigrationProbes]: ReturnType<typeof vi.fn> };

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        DomainMigrationService,
        { provide: LOCATION_NAVIGATOR, useValue: fakeNavigator },
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: OfflineSyncService, useValue: mockOfflineSync },
        { provide: DOMAIN_MIGRATION_PHOTO_QUEUE, useValue: mockPhotoQueue },
        { provide: DOMAIN_MIGRATION_PROBES, useValue: probes },
      ],
    });
    service = TestBed.inject(DomainMigrationService);
  }

  /** پیکربندی را بدون init و بدون بررسی خودکار بار می‌کند تا هر آزمون فقط یک ارزیابی صریح داشته باشد */
  function loadLegacyConfigWithoutAutoCheck(): void {
    service.canonicalDomain.set('new.farsalish.ir');
    service.isLegacyDomain.set(true);
  }

  beforeEach(() => {
    fakeNavigator = {
      replace: vi.fn(),
      getHost: vi.fn().mockReturnValue('old.farsalish.ir'),
      getHostname: vi.fn().mockReturnValue('old.farsalish.ir'),
      getPathname: vi.fn().mockReturnValue('/app/inventory'),
      getSearch: vi.fn().mockReturnValue('?tab=items'),
      getHash: vi.fn().mockReturnValue('#section-2'),
    };
    mockConfigApi = {
      getPublicConfig: vi.fn().mockReturnValue(of(CONFIG)),
      probePublicConfig: vi.fn().mockReturnValue(of(CONFIG)),
    };
    mockOfflineSync = { getUnsentCountStrict: vi.fn().mockResolvedValue(0), pendingCount$: NEVER, isSyncing: false };
    mockPhotoQueue = { countPendingStrict: vi.fn().mockResolvedValue(0), pendingCount$: NEVER, isFlushing: false };
    probes = {
      isBrowserOnline: vi.fn().mockReturnValue(true),
      reachTarget: vi.fn().mockResolvedValue(true),
      countDrafts: vi.fn().mockResolvedValue(0),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('بدون جایگزین تست، صف عکس همان نمونهٔ یکتای getInstance است (NG0201 در راه‌اندازی اپ رخ نمی‌دهد)', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCATION_NAVIGATOR, useValue: fakeNavigator },
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: OfflineSyncService, useValue: mockOfflineSync },
        { provide: DOMAIN_MIGRATION_PROBES, useValue: probes },
      ],
    });
    expect(() => TestBed.inject(DomainMigrationService)).not.toThrow();
    expect(TestBed.inject(DOMAIN_MIGRATION_PHOTO_QUEUE)).toBe(PhotoUploadQueueService.getInstance());
  });

  it('تشخیص می‌دهد که دامنهٔ فعلی یک دامنهٔ قدیمی است و بنر را فعال می‌کند', () => {
    mockOfflineSync.getUnsentCountStrict.mockResolvedValue(1); // بررسی خودکار منتقل نکند
    setup();
    service.init();
    expect(service.canonicalDomain()).toBe('new.farsalish.ir');
    expect(service.isLegacyDomain()).toBe(true);
    expect(service.showBanner()).toBe(true);
  });

  it('اگر روی همان دامنهٔ اصلی باشیم، بنر نشان داده نمی‌شود', () => {
    (fakeNavigator.getHost as any).mockReturnValue('new.farsalish.ir');
    (fakeNavigator.getHostname as any).mockReturnValue('new.farsalish.ir');
    setup();
    service.init();
    expect(service.isLegacyDomain()).toBe(false);
    expect(service.showBanner()).toBe(false);
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('canonical_domain نامعتبر (نشانی یا مسیر) نادیده گرفته می‌شود', () => {
    mockConfigApi.getPublicConfig.mockReturnValue(of({ ...CONFIG, canonical_domain: 'evil.com/x' }));
    setup();
    service.init();
    expect(service.isLegacyDomain()).toBe(false);
  });

  it('با صف همگام‌سازی پر (از جمله رکورد در حال ارسال) و صف عکس پر انتقال نمی‌دهد', async () => {
    mockOfflineSync.getUnsentCountStrict.mockResolvedValue(2);
    mockPhotoQueue.countPendingStrict.mockResolvedValue(1);
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(service.totalPendingCount()).toBe(3);
    expect(service.blockReason()).toBe('pending');
    expect(mockConfigApi.probePublicConfig).not.toHaveBeenCalled();
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('با پیش‌نویس محلی ارسال‌نشده انتقال نمی‌دهد', async () => {
    probes.countDrafts.mockResolvedValue(1);
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(service.pendingDraftCount()).toBe(1);
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('خطای خواندن صف «صف خالی» تعبیر نمی‌شود', async () => {
    mockPhotoQueue.countPendingStrict.mockRejectedValue(new Error('IDB blocked'));
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(service.blockReason()).toBe('check-failed');
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('وقتی ارسالی در جریان است انتقال نمی‌دهد', async () => {
    mockOfflineSync.isSyncing = true;
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(service.blockReason()).toBe('syncing');
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('رکوردی که در حین سنجش سرور به صف می‌رسد، انتقال را متوقف می‌کند', async () => {
    mockOfflineSync.getUnsentCountStrict.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(mockOfflineSync.getUnsentCountStrict).toHaveBeenCalledTimes(2);
    expect(service.blockReason()).toBe('pending');
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('مرورگر آفلاین: انتقال نمی‌دهد حتی اگر پیکربندی از کش آمده باشد', async () => {
    probes.isBrowserOnline.mockReturnValue(false);
    setup();
    service.init(); // getPublicConfig (کش SWR) موفق است و بررسی خودکار را آغاز می‌کند
    await vi.waitFor(() => expect(service.blockReason()).toBe('offline'));
    expect(service.isLegacyDomain()).toBe(true);
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('سنجش دسترسی از probePublicConfig (بدون کش) است، نه از getPublicConfig', async () => {
    mockConfigApi.probePublicConfig.mockReturnValue(throwError(() => ({ status: 0 })));
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(mockConfigApi.probePublicConfig).toHaveBeenCalledTimes(1);
    expect(mockConfigApi.getPublicConfig).not.toHaveBeenCalled();
    expect(service.blockReason()).toBe('server-unreachable');
  });

  for (const status of [0, 502, 503, 504, 520, 530]) {
    it(`پیکربندی بار شده ولی سرور با ${status} پاسخ می‌دهد: انتقال نمی‌دهد`, async () => {
      mockConfigApi.probePublicConfig.mockReturnValue(throwError(() => ({ status })));
      setup();
      loadLegacyConfigWithoutAutoCheck();
      expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
      expect(service.isServerReachable()).toBe(false);
      expect(service.hasMigrated()).toBe(false);
      expect(fakeNavigator.replace).not.toHaveBeenCalled();
    });
  }

  it('اگر دامنهٔ مقصد در دسترس نباشد انتقال نمی‌دهد', async () => {
    probes.reachTarget.mockResolvedValue(false);
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(false);
    expect(probes.reachTarget).toHaveBeenCalledWith('https://new.farsalish.ir');
    expect(service.blockReason()).toBe('target-unreachable');
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('با صف خالی و سرور در دسترس انتقال می‌دهد (حفظ کامل مسیر، کوئری و هش)', async () => {
    setup();
    loadLegacyConfigWithoutAutoCheck();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(true);
    expect(service.hasMigrated()).toBe(true);
    expect(fakeNavigator.replace).toHaveBeenCalledWith('https://new.farsalish.ir/app/inventory?tab=items#section-2');
  });

  it('بررسی خودکار هنگام کار کاربر منتقل نمی‌کند ولی دکمهٔ صریح منتقل می‌کند', async () => {
    mockConfigApi.getPublicConfig.mockReturnValue(NEVER); // init فقط شنونده‌ها را ثبت کند
    setup();
    loadLegacyConfigWithoutAutoCheck();
    service.init(); // شنوندهٔ تعامل
    document.dispatchEvent(new KeyboardEvent('keydown'));
    expect(await service.evaluateAndMigrateIfReady()).toBe(false);
    expect(service.blockReason()).toBe('user-active');
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
    expect(await service.evaluateAndMigrateIfReady(true)).toBe(true);
  });

  it('اگر بار اول پیکربندی نرسد، دوره‌ای دوباره تلاش می‌کند و سپس منتقل می‌کند', async () => {
    vi.useFakeTimers();
    mockConfigApi.getPublicConfig.mockReturnValueOnce(throwError(() => ({ status: 0 })));
    setup();
    service.init();
    expect(service.isLegacyDomain()).toBe(false);
    await vi.advanceTimersByTimeAsync(DOMAIN_MIGRATION_RETRY_MS);
    expect(service.isLegacyDomain()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeNavigator.replace).toHaveBeenCalledTimes(1);
  });
});
