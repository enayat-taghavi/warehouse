// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';
import { DomainMigrationService, LOCATION_NAVIGATOR, LocationNavigator } from './domain-migration.service';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { OfflineSyncService } from './offline-sync.service';
import { PhotoUploadQueueService } from './photo-upload-queue.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DomainMigrationService (گام ۵: انتقال دامنه)', () => {
  let service: DomainMigrationService;
  let fakeNavigator: LocationNavigator;
  let mockConfigApi: { getPublicConfig: ReturnType<typeof vi.fn> };
  let mockOfflineSync: { getPendingCount: ReturnType<typeof vi.fn>; pendingCount$: any };
  let mockPhotoQueue: { countPending: ReturnType<typeof vi.fn>; pendingCount$: any };

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
      getPublicConfig: vi.fn().mockReturnValue(
        of({
          system_version: '1.0.0',
          system_name: 'Warehouse',
          canonical_domain: 'new.farsalish.ir',
        } as PublicConfig)
      ),
    };

    mockOfflineSync = {
      getPendingCount: vi.fn().mockResolvedValue(0),
      pendingCount$: of(0),
    };

    mockPhotoQueue = {
      countPending: vi.fn().mockResolvedValue(0),
      pendingCount$: of(0),
    };

    TestBed.configureTestingModule({
      providers: [
        DomainMigrationService,
        { provide: LOCATION_NAVIGATOR, useValue: fakeNavigator },
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: OfflineSyncService, useValue: mockOfflineSync },
        { provide: PhotoUploadQueueService, useValue: mockPhotoQueue },
      ],
    });

    service = TestBed.inject(DomainMigrationService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('تشخیص می‌دهد که دامنهٔ فعلی یک دامنهٔ قدیمی است و بنر را فعال می‌کند', () => {
    service.init();
    expect(service.canonicalDomain()).toBe('new.farsalish.ir');
    expect(service.isLegacyDomain()).toBe(true);
    expect(service.showBanner()).toBe(true);
  });

  it('اگر روی همان دامنهٔ اصلی (کانونیکال) باشیم، بنر نشان داده نمی‌شود', () => {
    (fakeNavigator.getHost as any).mockReturnValue('new.farsalish.ir');
    (fakeNavigator.getHostname as any).mockReturnValue('new.farsalish.ir');

    service.init();
    expect(service.isLegacyDomain()).toBe(false);
    expect(service.showBanner()).toBe(false);
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('با صف پر انتقال نمی‌دهد (حفظ داده‌های در صف و جلوگیری از پاک‌شدن اطلاعات کاربر)', async () => {
    // فرض: صف همگام‌سازی دارای ۲ آیتم و صف عکس دارای ۱ عکس است
    mockOfflineSync.getPendingCount.mockResolvedValue(2);
    mockPhotoQueue.countPending.mockResolvedValue(1);

    service.init();
    const migrated = await service.evaluateAndMigrateIfReady();

    expect(migrated).toBe(false);
    expect(service.hasMigrated()).toBe(false);
    expect(service.pendingSyncCount()).toBe(2);
    expect(service.pendingPhotoCount()).toBe(1);
    expect(service.totalPendingCount()).toBe(3);
    // عدم فراخوانی انتقال
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });

  it('با صف خالی و سرور در دسترس انتقال می‌دهد (حفظ کامل مسیر، کوئری و هش)', async () => {
    // صف‌ها هر دو خالی هستند
    mockOfflineSync.getPendingCount.mockResolvedValue(0);
    mockPhotoQueue.countPending.mockResolvedValue(0);
    mockConfigApi.getPublicConfig.mockReturnValue(
      of({
        system_version: '1.0.0',
        system_name: 'Warehouse',
        canonical_domain: 'new.farsalish.ir',
      } as PublicConfig)
    );

    service.init();
    const migrated = await service.evaluateAndMigrateIfReady();

    expect(migrated).toBe(true);
    expect(service.hasMigrated()).toBe(true);
    expect(fakeNavigator.replace).toHaveBeenCalledWith(
      'https://new.farsalish.ir/app/inventory?tab=items#section-2'
    );
  });

  it('با سرور در دسترس‌نشده انتقال نمی‌دهد (خطاهای ۵۰۲، ۵۰۳، ۵۰۴، ۵۳۰ و قطع شبکه)', async () => {
    // صف خالی است اما سرور با خطای ۵۰۳ پاسخ می‌دهد (isServerUnreachable)
    mockOfflineSync.getPendingCount.mockResolvedValue(0);
    mockPhotoQueue.countPending.mockResolvedValue(0);

    // پاسخ سرور با خطای ۵۰۳ شبیه‌سازی می‌شود
    mockConfigApi.getPublicConfig.mockReturnValue(
      throwError(() => ({ status: 503, message: 'Service Unavailable' }))
    );

    service.init();
    const migrated = await service.evaluateAndMigrateIfReady();

    expect(migrated).toBe(false);
    expect(service.isServerReachable()).toBe(false);
    expect(service.hasMigrated()).toBe(false);
    expect(fakeNavigator.replace).not.toHaveBeenCalled();
  });
});
