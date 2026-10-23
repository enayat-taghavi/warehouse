// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AppVersionLockComponent, EMERGENCY_SEND_ERROR_TEXT } from './app-version-lock.component';
import { AppVersionService } from '../../../core/platform/app-version.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';

describe('AppVersionLockComponent', () => {
  let fixture: ComponentFixture<AppVersionLockComponent>;
  let component: AppVersionLockComponent;
  let mockVersionService: {
    state: ReturnType<typeof signal<'ok' | 'recommend' | 'locked'>>;
    downloadUrl: string;
    emergencySend: ReturnType<typeof vi.fn>;
  };
  let mockOfflineSync: {
    pendingCount$: any;
    getUnsentCountStrict: ReturnType<typeof vi.fn>;
  };
  let appMainContent: HTMLDivElement;

  beforeEach(() => {
    // ایجاد عنصر نگه‌دارنده محتوای اصلی در سند
    appMainContent = document.createElement('div');
    appMainContent.id = 'app-main-content';
    document.body.appendChild(appMainContent);

    mockVersionService = {
      state: signal<'ok' | 'recommend' | 'locked'>('ok'),
      downloadUrl: 'https://test.domain/download',
      emergencySend: vi.fn().mockResolvedValue({ status: 'completed' }),
    };

    mockOfflineSync = {
      pendingCount$: of(0),
      getUnsentCountStrict: vi.fn().mockResolvedValue(0),
    };

    TestBed.configureTestingModule({
      imports: [AppVersionLockComponent],
      providers: [
        { provide: AppVersionService, useValue: mockVersionService },
        { provide: OfflineSyncService, useValue: mockOfflineSync },
      ],
    });

    fixture = TestBed.createComponent(AppVersionLockComponent);
    component = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    fixture.destroy();
    if (fixture.nativeElement.parentElement === document.body) {
      document.body.removeChild(fixture.nativeElement);
    }
    appMainContent.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('1. should show still pending text when emergency send leaves records in local queue', async () => {
    // رکوردهای باقی‌مانده پس از ارسال اضطراری
    mockOfflineSync.getUnsentCountStrict.mockResolvedValue(5);

    await component.onEmergencySend();

    const msg = component.emergencyStatusMessage();
    expect(msg).toBe('هنوز ۵ رکورد ارسال نشده است؛ دوباره تلاش کنید');
    expect(msg).not.toContain('ارسال با موفقیت انجام شد');
  });

  it('2. should show success message when unsent count is 0 after emergency send', async () => {
    mockOfflineSync.getUnsentCountStrict.mockResolvedValue(0);

    await component.onEmergencySend();

    expect(component.emergencyStatusMessage()).toBe('ارسال با موفقیت انجام شد.');
  });

  it('3. should show fixed Persian error text on emergency send failure without leaking error message', async () => {
    mockVersionService.emergencySend.mockRejectedValue(new Error('Sensitive database timeout 504'));

    await component.onEmergencySend();

    const msg = component.emergencyStatusMessage();
    expect(msg).toBe(EMERGENCY_SEND_ERROR_TEXT);
    expect(msg).not.toContain('Sensitive');
    expect(msg).not.toContain('504');
  });

  it('4. should move focus into the dialog when locked and set inert on background content', async () => {
    mockVersionService.state.set('locked');
    fixture.detectChanges();

    // مهلت اجرای setTimeout برای فوکوس
    await new Promise((r) => setTimeout(r, 20));

    const updateBtn = fixture.nativeElement.querySelector('#version-lock-update-btn') as HTMLElement;
    expect(updateBtn).not.toBeNull();
    expect(document.activeElement).toBe(updateBtn);
    expect(appMainContent.hasAttribute('inert')).toBe(true);
  });

  it('5. should remove inert attribute when locked state closes or component is destroyed', async () => {
    mockVersionService.state.set('locked');
    fixture.detectChanges();
    expect(appMainContent.hasAttribute('inert')).toBe(true);

    mockVersionService.state.set('ok');
    fixture.detectChanges();
    expect(appMainContent.hasAttribute('inert')).toBe(false);
  });

  it('6. should keep Tab navigation trapped inside the dialog when Tab is pressed', () => {
    mockVersionService.state.set('locked');
    fixture.detectChanges();

    const updateBtn = fixture.nativeElement.querySelector('#version-lock-update-btn') as HTMLButtonElement;
    const emergencyBtn = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(updateBtn).not.toBeNull();
    expect(emergencyBtn).not.toBeNull();

    // فوکوس روی آخرین دکمه (ارسال اضطراری) و فشردن Tab عادی
    emergencyBtn.focus();
    expect(document.activeElement).toBe(emergencyBtn);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const prevented = !document.dispatchEvent(tabEvent);

    // فوکوس باید به اولین دکمه بازگردد
    expect(document.activeElement).toBe(updateBtn);
  });
});
