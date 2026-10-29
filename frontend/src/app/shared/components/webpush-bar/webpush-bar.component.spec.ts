// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

import { WebPushBarComponent, WEBPUSH_BAR_DISMISSED_KEY } from './webpush-bar.component';
import { AuthService } from '../../../core/auth/auth.service';
import { WebPushService, WebPushState } from '../../../core/platform/web-push.service';
import { ToastService } from '../toast/toast.component';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('WebPushBarComponent (DOM)', () => {
  let fixture: ComponentFixture<WebPushBarComponent>;
  let webPush: any;
  let toast: { show: ReturnType<typeof vi.fn> };
  const store: Record<string, string> = {};

  const q = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  function build(o: { loggedIn?: boolean; supported?: boolean; permission?: string; state?: WebPushState } = {}) {
    webPush = {
      isSupported: () => o.supported ?? true,
      permission: signal(o.permission ?? 'default'),
      state: signal<WebPushState>(o.state ?? 'off'),
      busy: signal(false),
      enable: vi.fn().mockResolvedValue({ ok: true, messageFa: 'اعلان روشن شد' }),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => o.loggedIn ?? true } },
        { provide: WebPushService, useValue: webPush },
        { provide: ToastService, useValue: toast },
        { provide: PwaUpdateService, useValue: { updateReady: signal(false), updateDismissed: signal(false) } },
      ],
    });
    fixture = TestBed.createComponent(WebPushBarComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  it('برای کاربر واردشده با اجازهٔ default نمایش داده می‌شود', () => {
    build();
    expect(q('webpush-bar')).not.toBeNull();
    expect(q('webpush-bar')!.getAttribute('role')).toBe('region');
  });

  it('«بعداً» نوار را پنهان می‌کند و برای همیشه (localStorage) پنهان می‌ماند', () => {
    build();
    (q('webpush-bar-later') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q('webpush-bar')).toBeNull();
    expect(store[WEBPUSH_BAR_DISMISSED_KEY]).toBe('1');

    TestBed.resetTestingModule();
    build();
    expect(q('webpush-bar')).toBeNull();
  });

  it('نمایش داده نمی‌شود: وارد نشده، پشتیبانی‌نشده (اپ بومی)، اجازه داده‌شده یا مسدود', () => {
    build({ loggedIn: false });
    expect(q('webpush-bar')).toBeNull();
    TestBed.resetTestingModule();
    build({ supported: false, state: 'unsupported' });
    expect(q('webpush-bar')).toBeNull();
    TestBed.resetTestingModule();
    build({ permission: 'granted', state: 'on' });
    expect(q('webpush-bar')).toBeNull();
    TestBed.resetTestingModule();
    build({ permission: 'denied', state: 'blocked' });
    expect(q('webpush-bar')).toBeNull();
  });

  it('«فعال کردن» enable را هم‌زمان صدا می‌زند، پیام نشان می‌دهد و نوار را می‌بندد', async () => {
    build();
    (q('webpush-bar-enable') as HTMLButtonElement).click();
    expect(webPush.enable).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(toast.show).toHaveBeenCalledWith('success', 'اعلان روشن شد');
    expect(q('webpush-bar')).toBeNull();
  });
});
