// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject, of } from 'rxjs';
import { PwaUpdateService } from './pwa-update.service';
import { ToastService } from '../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { NetworkStatusService } from './network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PwaUpdateService', () => {
  let service: PwaUpdateService;
  let mockSwUpdate: any;
  let mockToast: any;
  let mockConfirmDialog: any;
  let versionUpdates$: Subject<any>;
  let unrecoverable$: Subject<any>;

  beforeEach(() => {
    versionUpdates$ = new Subject();
    unrecoverable$ = new Subject();

    mockSwUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      unrecoverable: unrecoverable$.asObservable(),
      checkForUpdate: vi.fn().mockResolvedValue(false),
      activateUpdate: vi.fn().mockResolvedValue(true)
    };

    mockToast = {
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        PwaUpdateService,
        { provide: SwUpdate, useValue: mockSwUpdate },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog }
      ]
    });

    service = TestBed.inject(PwaUpdateService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('باید سرویس به درستی مقداردهی اولیه شود', () => {
    expect(service).toBeDefined();
    expect(service.isChecking()).toBe(false);
  });

  it('در صورت قطعی شبکه باید بررسی متوقف شده و پیام هشدار نمایش داده شود', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(false);

    await service.checkAndApplyManualUpdate();

    expect(mockToast.show).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('سامانه در حالت آفلاین')
    );
    expect(mockSwUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('در صورت وجود رکوردهای آفلاین ذخیره‌نشده باید از کاربر تاییدیه بخواهد', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);

    mockConfirmDialog.open.mockResolvedValue(false); // کاربر انصراف می‌دهد

    await service.checkAndApplyManualUpdate({ pendingCount: 3 });

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'تغییرات همگام‌سازی‌نشده آفلاین',
        type: 'warning'
      })
    );
    expect(mockSwUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('در محیط توسعه (isEnabled = false) باید پیام شفاف نمایش دهد و موفقیت دروغین نگوید', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);
    mockSwUpdate.isEnabled = false;

    await service.checkAndApplyManualUpdate();

    expect(mockToast.show).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('محیط توسعه')
    );
    expect(mockSwUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('در صورت یافتن نسخه جدید باید آن را دریافت و فعال کند', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);
    mockSwUpdate.checkForUpdate.mockResolvedValue(true);

    await service.checkAndApplyManualUpdate();

    expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('در حال استعلام'));
    expect(mockSwUpdate.activateUpdate).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('با موفقیت به آخرین نسخه بروزرسانی شد'));
  });

  it('در صورت نبود نسخه جدید باید اعلام کند کاربر از آخرین نسخه استفاده می‌کند', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);
    mockSwUpdate.checkForUpdate.mockResolvedValue(false);

    await service.checkAndApplyManualUpdate();

    expect(mockToast.show).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('شما هم‌اکنون در حال استفاده از آخرین نسخه برنامه هستید')
    );
  });

  it('در صورت وقوع خطای ۵۲۱ یا ۵۳۰ کلودفلر باید سرور را غیرقابل‌دسترس گزارش کند', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);
    const reportSpy = vi.spyOn(net, 'reportServerUnreachable').mockImplementation(() => {});

    mockSwUpdate.checkForUpdate.mockRejectedValue(new Error('Http failure response: 521 Origin Down'));

    await service.checkAndApplyManualUpdate();

    expect(reportSpy).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('سرور اصلی موقتاً در دسترس نیست')
    );
  });

  it('در زمان بروزرسانی دستی، رویداد VERSION_READY نباید مدال مزاحم باز کند', async () => {
    service.init();

    // فعال کردن آپدیت دستی
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);

    mockSwUpdate.checkForUpdate.mockImplementation(async () => {
      // شبیه‌سازی رسیدن رویداد در حین استعلام
      versionUpdates$.next({ type: 'VERSION_READY', currentVersion: { hash: '1' }, latestVersion: { hash: '2' } });
      return true;
    });

    await service.checkAndApplyManualUpdate();

    // نباید مدال اتوماتیک تایید باز شده باشد
    expect(mockConfirmDialog.open).not.toHaveBeenCalled();
  });
});
