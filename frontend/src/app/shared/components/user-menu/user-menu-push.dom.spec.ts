// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';

import { UserMenuComponent } from './user-menu.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { StateService } from '../../../core/services/state.service';
import { AccountsHttpService } from '../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../core/http/scope-directory.service';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';
import { ToastService } from '../toast/toast.component';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { PwaInstallService } from '../../../core/services/pwa-install.service';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { AppPersonaService } from '../../../core/services/app-persona.service';
import { ApiService } from '../../../core/api/api.service';
import { WorkflowTasksService } from '../../../core/services/workflow-tasks.service';
import { WebPushService, WebPushState } from '../../../core/platform/web-push.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('UserMenu: اعلان، نصب و به‌روزرسانی (DOM)', () => {
  let fixture: ComponentFixture<UserMenuComponent>;
  let pushState: ReturnType<typeof signal<WebPushState>>;
  let webPush: any;
  let pwaInstall: any;
  let toast: { show: ReturnType<typeof vi.fn> };

  const q = (id: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

  async function build(opts: { state?: WebPushState; ios?: boolean; installed?: boolean; isNative?: boolean } = {}) {
    (globalThis as any).Capacitor = opts.isNative ? { isNativePlatform: () => true } : undefined;
    pushState = signal<WebPushState>(opts.state ?? 'off');
    webPush = {
      state: pushState,
      busy: signal(false),
      permission: signal('default'),
      refreshState: vi.fn().mockResolvedValue(undefined),
      enable: vi.fn().mockResolvedValue({ ok: true, messageFa: 'روشن شد' }),
      disable: vi.fn().mockResolvedValue({ ok: true, messageFa: 'خاموش شد' }),
    };
    pwaInstall = {
      isInstalled: signal(!!opts.installed),
      isIos: signal(!!opts.ios),
      canInstall: signal(false),
      installApp: vi.fn().mockResolvedValue(undefined),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { userAvatarUrl: () => null, userAvatar: () => 'م', userName: () => 'مدیر', userRoleTitles: () => ['ادمین'], logout: vi.fn() } },
        { provide: AuthStore, useValue: {} },
        { provide: StateService, useValue: {} },
        { provide: AccountsHttpService, useValue: {} },
        { provide: ScopeDirectoryService, useValue: {} },
        { provide: ModuleRegistryService, useValue: { getExtensions: () => [], getInstalledModules: () => [], isModuleInstalled: () => false } },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: { open: vi.fn() } },
        { provide: PwaUpdateService, useValue: { isChecking: () => false, updateReady: () => false, updateDismissed: () => false } },
        { provide: PwaInstallService, useValue: pwaInstall },
        { provide: WebPushService, useValue: webPush },
        { provide: AppPersonaService, useValue: { activeApp: () => 'accounting' } },
        { provide: ApiService, useValue: { get: () => of([]) } },
        { provide: WorkflowTasksService, useValue: { count: () => 0 } },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/app' } },
      ],
    });
    TestBed.overrideComponent(UserMenuComponent, {
      set: { imports: [CommonModule, FormsModule, SvgIconDirective], schemas: [NO_ERRORS_SCHEMA] },
    });
    fixture = TestBed.createComponent(UserMenuComponent);
    fixture.detectChanges();
    fixture.componentInstance.toggleUserMenu();
    fixture.detectChanges();
  }

  beforeAll(() => {
    vi.spyOn(NetworkStatusService, 'getInstance').mockReturnValue({ state$: of('online') } as any);
    vi.spyOn(OfflineSyncService, 'getInstance').mockReturnValue({ isSyncing$: of(false), pendingCount$: of(0) } as any);
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('منو که باز شد وضعیت اعلان تازه‌سازی می‌شود و پنل علامت دکمهٔ برگشت دارد', async () => {
    await build();
    expect(webPush.refreshState).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-back-closes]')).not.toBeNull();
  });

  it.each([
    ['on', 'روشن', 'true'],
    ['off', 'خاموش', 'false'],
    ['blocked', 'مسدود', 'false'],
    ['ios-needs-install', 'نیاز به نصب', 'false'],
  ] as [WebPushState, string, string][])('سوییچ اعلان در حالت %s', async (state, label, checked) => {
    await build({ state });
    const sw = q('user-menu-push-switch') as HTMLButtonElement;
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('aria-checked')).toBe(checked);
    expect(q('user-menu-push-label')!.textContent!.trim()).toBe(label);
    expect(sw.disabled).toBe(state === 'blocked');
    const hinted = state === 'blocked' || state === 'ios-needs-install';
    expect(sw.getAttribute('aria-describedby')).toBe(hinted ? 'user-menu-push-hint' : null);
    expect(!!q('user-menu-push-hint')).toBe(hinted);
  });

  it('وقتی پشتیبانی نمی‌شود سوییچ نمایش داده نمی‌شود', async () => {
    await build({ state: 'unsupported' });
    expect(q('user-menu-push-switch')).toBeNull();
  });

  it('کلیک در حالت خاموش enable را هم‌زمان صدا می‌زند و پیام را نشان می‌دهد', async () => {
    await build({ state: 'off' });
    (q('user-menu-push-switch') as HTMLButtonElement).click();
    expect(webPush.enable).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(toast.show).toHaveBeenCalledWith('success', 'روشن شد');
  });

  it('کلیک در حالت روشن disable را صدا می‌زند', async () => {
    await build({ state: 'on' });
    (q('user-menu-push-switch') as HTMLButtonElement).click();
    expect(webPush.disable).toHaveBeenCalledTimes(1);
    expect(webPush.enable).not.toHaveBeenCalled();
  });

  it('آیفون بدون نصب: فقط راهنما باز می‌شود و enable صدا زده نمی‌شود', async () => {
    await build({ state: 'ios-needs-install', ios: true });
    (q('user-menu-push-switch') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(webPush.enable).not.toHaveBeenCalled();
    expect(webPush.disable).not.toHaveBeenCalled();
  });

  it('آیفون: دکمهٔ نصب راهنمای Share را باز می‌کند، نه نصب مستقیم', async () => {
    await build({ ios: true });
    expect(q('user-menu-ios-guide')).toBeNull();
    (q('user-menu-install-ios') as HTMLButtonElement).click();
    fixture.detectChanges();
    const guide = q('user-menu-ios-guide');
    expect(guide).not.toBeNull();
    expect(guide!.textContent).toContain('Add to Home Screen');
    expect(pwaInstall.installApp).not.toHaveBeenCalled();
  });

  it('برنامهٔ نصب‌شده: برچسب غیرفعال «برنامه نصب شده است»', async () => {
    await build({ installed: true });
    const done = q('user-menu-install-done') as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.textContent).toContain('برنامه نصب شده است');
  });

  it('مرورگر معمولی: آیتم نصب و به‌روزرسانی PWA دیده می‌شود', async () => {
    await build();
    expect(q('user-menu-install')).not.toBeNull();
    expect(q('user-menu-pwa-update')).not.toBeNull();
  });

  it('داخل اپ بومی: نه نصب، نه به‌روزرسانی PWA و نه سوییچ اعلان وب', async () => {
    await build({ isNative: true, state: 'unsupported' });
    expect(q('user-menu-install')).toBeNull();
    expect(q('user-menu-install-ios')).toBeNull();
    expect(q('user-menu-install-done')).toBeNull();
    expect(q('user-menu-pwa-update')).toBeNull();
    expect(q('user-menu-push-switch')).toBeNull();
  });
});
