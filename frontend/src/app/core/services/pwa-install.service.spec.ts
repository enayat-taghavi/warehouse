// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { PwaInstallService } from './pwa-install.service';
import { ToastService } from '../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PwaInstallService', () => {
  let service: PwaInstallService;
  let mockToast: any;
  let mockConfirmDialog: any;

  beforeEach(() => {
    mockToast = {
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        PwaInstallService,
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog }
      ]
    });

    service = TestBed.inject(PwaInstallService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('باید سرویس با موفقیت ایجاد شود', () => {
    expect(service).toBeTruthy();
  });

  it('اگر برنامه از قبل نصب شده باشد، پیام مناسب نمایش می‌دهد', async () => {
    service.isInstalled.set(true);
    await service.installApp();
    expect(mockToast.show).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('روی دستگاه شما نصب و در حال اجرا است')
    );
  });

  it('در صورت وجود رویداد beforeinstallprompt، دستور prompt را اجرا کرده و پاسخ را بررسی می‌کند', async () => {
    service.isInstalled.set(false);
    const mockPromptEvent = {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' })
    };

    service.deferredPrompt.set(mockPromptEvent);
    expect(service.canInstall()).toBe(true);

    await service.installApp();

    expect(mockPromptEvent.prompt).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید گردید'));
    expect(service.deferredPrompt()).toBeNull();
  });

  it('برای دستگاه‌های iOS، راهنمای مخصوص باز می‌کند', async () => {
    service.isInstalled.set(false);
    service.deferredPrompt.set(null);
    service.isIos.set(true);

    await service.installApp();

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('iOS')
      })
    );
  });

  it('در صورت عدم وجود رویداد نصب و غیر iOS، راهنمای عمومی نصب باز می‌کند', async () => {
    service.isInstalled.set(false);
    service.deferredPrompt.set(null);
    service.isIos.set(false);

    await service.installApp();

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('نصب برنامه روی دستگاه')
      })
    );
  });
});
