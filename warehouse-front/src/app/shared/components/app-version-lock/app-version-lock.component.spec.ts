// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppVersionLockComponent } from './app-version-lock.component';
import { AppVersionService, AppVersionState } from '../../../core/platform/app-version.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';

describe('AppVersionLockComponent', () => {
  let mockVersionState: any;
  let mockDownloadUrl: string;
  let mockEmergencySend: any;
  let mockOfflineSync: any;
  let windowOpenSpy: any;

  beforeEach(async () => {
    mockVersionState = signal<AppVersionState>('ok');
    mockDownloadUrl = 'https://download.farsalish.ir/app.apk';
    mockEmergencySend = vi.fn().mockResolvedValue({ status: 'completed', synced: 3 });

    mockOfflineSync = {
      pendingCount$: of(5),
      getUnsentCountStrict: vi.fn().mockResolvedValue(5),
    };

    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await TestBed.configureTestingModule({
      imports: [AppVersionLockComponent],
      providers: [
        {
          provide: AppVersionService,
          useValue: {
            state: mockVersionState,
            get downloadUrl() {
              return mockDownloadUrl;
            },
            emergencySend: mockEmergencySend,
          },
        },
        {
          provide: OfflineSyncService,
          useValue: mockOfflineSync,
        },
      ],
    }).compileComponents();

    try {
      sessionStorage.clear();
    } catch {}
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    try {
      sessionStorage.clear();
    } catch {}
  });

  it('1. should render nothing when version state is ok', () => {
    mockVersionState.set('ok');
    const fixture = TestBed.createComponent(AppVersionLockComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector('section[role="status"]')).toBeNull();
  });

  it('2. should render locked modal with warning text, unsent records, update button and emergency send button', () => {
    mockVersionState.set('locked');
    const fixture = TestBed.createComponent(AppVersionLockComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    expect(dialog?.textContent).toContain('نسخهٔ اپ قدیمی است و باید به‌روز شود');
    expect(dialog?.textContent).toContain('اپ را حذف نکنید؛ نسخهٔ جدید را روی همین نصب کنید تا داده‌های ارسال‌نشده حفظ شوند');
    expect(dialog?.textContent).toContain('شما دارای ۵ رکورد ذخیره‌نشده در صف محلی هستید');

    const updateBtn = el.querySelector('button[aria-label="به‌روزرسانی برنامه"]') as HTMLButtonElement;
    expect(updateBtn).toBeTruthy();
    expect(updateBtn.textContent).toContain('به‌روزرسانی');

    const emergencyBtn = el.querySelector('button[aria-label="ارسال اضطراری اطلاعات به سرور"]') as HTMLButtonElement;
    expect(emergencyBtn).toBeTruthy();
    expect(emergencyBtn.textContent).toContain('ارسال اضطراری');
  });

  it('3. should trigger openExternal on clicking update button in locked state', () => {
    mockVersionState.set('locked');
    const fixture = TestBed.createComponent(AppVersionLockComponent);
    fixture.detectChanges();

    const updateBtn = fixture.nativeElement.querySelector('button[aria-label="به‌روزرسانی برنامه"]') as HTMLButtonElement;
    updateBtn.click();

    expect(windowOpenSpy).toHaveBeenCalledWith('https://download.farsalish.ir/app.apk', '_blank');
  });

  it('4. should trigger emergencySend on clicking emergency send button in locked state', async () => {
    mockVersionState.set('locked');
    const fixture = TestBed.createComponent(AppVersionLockComponent);
    fixture.detectChanges();

    const emergencyBtn = fixture.nativeElement.querySelector('button[aria-label="ارسال اضطراری اطلاعات به سرور"]') as HTMLButtonElement;
    emergencyBtn.click();

    expect(mockEmergencySend).toHaveBeenCalled();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ارسال با موفقیت انجام شد');
  });

  it('5. should render dismissible banner in recommend state', () => {
    mockVersionState.set('recommend');
    const fixture = TestBed.createComponent(AppVersionLockComponent);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('section[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('نسخه جدیدتری از اپلیکیشن موجود است');

    const dismissBtn = fixture.nativeElement.querySelector('button[aria-label="بستن اعلان به‌روزرسانی"]') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('section[role="status"]')).toBeNull();
  });
});
