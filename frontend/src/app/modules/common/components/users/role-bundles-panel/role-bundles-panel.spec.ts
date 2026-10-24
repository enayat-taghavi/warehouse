// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, signal } from '@angular/core';
import * as fs from 'fs';
import * as path from 'path';
import { of, Subject } from 'rxjs';
import { RoleBundlesPanel } from './role-bundles-panel';
import { PermissionService } from '../../../../../core/services/permission.service';
import { PermissionApiService } from '../../../../../core/api/permission-api.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PermissionCatalog, PermissionsUpdatedEvent } from '../../../../../core/models/permission.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

/** فهرست نمونه؛ نام ماژول‌ها فقط داده‌اند (هسته هیچ ماژولی را نمی‌شناسد) */
function makeCatalog(withBundles = true): PermissionCatalog {
  return {
    categories: [
      { module: 'mod_a', key: 'invoices', label_fa: 'فاکتورها', order: 10, menu: null },
      { module: 'mod_a', key: 'cash', label_fa: 'تنخواه', order: 20, menu: null },
    ],
    permissions: [
      { code: 'perm_inv', label_fa: 'ثبت فاکتور', module: 'mod_a', category: 'invoices', scope: 'section', sensitive: false },
      { code: 'perm_cash', label_fa: 'مدیریت تنخواه', module: 'mod_a', category: 'cash', scope: 'section', sensitive: false },
      { code: 'perm_extra', label_fa: 'مجوز اضافه', module: 'mod_a', category: 'cash', scope: 'section', sensitive: false },
      { code: 'view_sys_users', label_fa: 'کاربران', module: null, category: null, scope: 'system', sensitive: false },
      { code: 'perm_rollback_data', label_fa: 'بازگردانی', module: null, category: null, scope: 'system', sensitive: true },
    ],
    roles: [
      { key: 'employee', label_fa: 'کارمند', rank: 1 },
      { key: 'manager', label_fa: 'مدیر', rank: null },
    ],
    bundles: withBundles
      ? {
          employee: { defaults: ['perm_inv', 'perm_cash'], added: ['perm_extra'], removed: ['perm_cash'], effective: ['perm_extra', 'perm_inv'] },
          manager: { defaults: ['perm_inv'], added: [], removed: [], effective: ['perm_inv'] },
        }
      : {},
  };
}

describe('RoleBundlesPanel (نقش‌های انتساب، طرح ۲.۲)', () => {
  let fixture: ComponentFixture<RoleBundlesPanel>;
  let el: HTMLElement;
  let catalog: ReturnType<typeof signal<PermissionCatalog | null>>;
  let superuser: ReturnType<typeof signal<boolean>>;
  let changes$: Subject<PermissionsUpdatedEvent>;
  let permMock: any;
  let apiMock: any;
  let confirmMock: any;
  let toastMock: any;

  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const local = path.resolve(__dirname, path.basename(url));
      return fs.existsSync(local) ? fs.readFileSync(local, 'utf-8') : '';
    });
  });

  async function setup(opts: { superuser?: boolean; withBundles?: boolean; catalog?: PermissionCatalog | null } = {}) {
    catalog = signal<PermissionCatalog | null>(opts.catalog === undefined ? makeCatalog(opts.withBundles ?? true) : opts.catalog);
    superuser = signal(opts.superuser ?? true);
    changes$ = new Subject<PermissionsUpdatedEvent>();
    permMock = {
      catalog,
      isSuperuser: superuser,
      isStale: signal(false),
      permissionsChanged$: changes$,
      ensureCatalog: vi.fn().mockResolvedValue(catalog()),
    };
    apiMock = {
      updateRoleBundle: vi.fn((key: string, effective: string[]) =>
        of({ role_key: key, defaults: ['perm_inv', 'perm_cash'], added: [], removed: [], effective })),
      resetRoleBundle: vi.fn((key: string) =>
        of({ role_key: key, defaults: ['perm_inv', 'perm_cash'], added: [], removed: [], effective: ['perm_cash', 'perm_inv'] })),
    };
    confirmMock = { open: vi.fn().mockResolvedValue(true) };
    toastMock = { success: vi.fn(), error: vi.fn(), show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RoleBundlesPanel],
      providers: [
        { provide: PermissionService, useValue: permMock },
        { provide: PermissionApiService, useValue: apiMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ModuleRegistryService, useValue: { getSpec: () => ({ titleFa: 'ماژول الف' }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoleBundlesPanel);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const box = (code: string) => el.querySelector<HTMLInputElement>(`[data-code="${code}"] input[type="checkbox"]`)!;
  const badge = (code: string) => el.querySelector(`[data-code="${code}"] [data-badge]`)?.getAttribute('data-badge') ?? null;

  afterEach(() => TestBed.resetTestingModule());

  it('بسته را بر اساس ماژول و دسته با تیک و نشان افزوده/برداشته نشان می‌دهد؛ مجوز سامانه‌ای و حساس نیست', async () => {
    await setup();
    expect(el.textContent).toContain('ماژول الف');
    const legends = [...el.querySelectorAll('legend')].map((l) => l.textContent?.trim());
    expect(legends).toEqual(['فاکتورها', 'تنخواه']);
    expect(box('perm_inv').checked).toBe(true);
    expect(box('perm_extra').checked).toBe(true);
    expect(box('perm_cash').checked).toBe(false);
    expect(badge('perm_extra')).toBe('added');
    expect(badge('perm_cash')).toBe('removed');
    expect(badge('perm_inv')).toBeNull();
    expect(el.querySelector('[data-code="view_sys_users"]')).toBeNull();
    expect(el.querySelector('[data-code="perm_rollback_data"]')).toBeNull();
    // رتبهٔ نقش نمایش داده می‌شود
    expect(el.querySelector('[data-role="employee"]')?.textContent).toContain('۱');
  });

  it('مدیر کل: تیک‌زدن و ذخیره فهرست مؤثر را می‌فرستد', async () => {
    await setup();
    box('perm_cash').click();
    fixture.detectChanges();
    const save = el.querySelector<HTMLButtonElement>('[data-testid="bundle-save"]')!;
    expect(save.disabled).toBe(false);
    save.click();
    await fixture.whenStable();
    expect(apiMock.updateRoleBundle).toHaveBeenCalledWith('employee', ['perm_cash', 'perm_extra', 'perm_inv']);
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('hasUnsavedChanges پس از تیک‌زدن true و پس از برگرداندن تیک false است', async () => {
    await setup();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    box('perm_cash').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    box('perm_cash').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });

  it('بازگشت به پیش‌فرض پنجرهٔ تأیید دارد و سپس reset را صدا می‌زند', async () => {
    await setup();
    el.querySelector<HTMLButtonElement>('[data-testid="bundle-reset"]')!.click();
    await fixture.whenStable();
    expect(confirmMock.open).toHaveBeenCalledTimes(1);
    expect(apiMock.resetRoleBundle).toHaveBeenCalledWith('employee');
  });

  it('با لغو پنجرهٔ تأیید reset صدا زده نمی‌شود', async () => {
    await setup();
    confirmMock.open.mockResolvedValue(false);
    await fixture.componentInstance.resetToDefault();
    expect(apiMock.resetRoleBundle).not.toHaveBeenCalled();
  });

  it('غیرمدیر کل: فقط خواندنی، بدون دکمه‌های ذخیره و بازگشت، با یادداشت فارسی', async () => {
    await setup({ superuser: false });
    expect(el.querySelector('[data-testid="bundles-readonly-note"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="bundle-save"]')).toBeNull();
    expect(el.querySelector('[data-testid="bundle-reset"]')).toBeNull();
    expect(box('perm_inv').disabled).toBe(true);
    fixture.componentInstance.toggle('perm_cash');
    expect(fixture.componentInstance.isChecked('perm_cash')).toBe(false);
  });

  it('بدون دادهٔ بسته‌ها حالت خالیِ توضیحی نشان داده می‌شود', async () => {
    await setup({ withBundles: false });
    expect(el.querySelector('[data-testid="bundles-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="bundle-body"]')).toBeNull();
  });

  it('بدون فهرست، حالت خطا با تلاش دوباره', async () => {
    await setup({ catalog: null });
    expect(el.querySelector('[data-testid="bundles-error"]')).not.toBeNull();
  });

  it('رویداد زندهٔ bundle فهرست را دوباره می‌خواند', async () => {
    await setup();
    permMock.ensureCatalog.mockClear();
    changes$.next({ user_id: null, reason: 'bundle', own: false });
    changes$.next({ user_id: 3, reason: 'override', own: false });
    expect(permMock.ensureCatalog).toHaveBeenCalledTimes(1);
    expect(permMock.ensureCatalog).toHaveBeenCalledWith(true);
  });

  it('آفلاین: نسخهٔ ذخیره‌شده دیده می‌شود ولی ذخیره غیرفعال است', async () => {
    await setup();
    fixture.componentInstance.online.set(false);
    box('perm_cash').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="bundles-offline"]')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[data-testid="bundle-save"]')!.disabled).toBe(true);
  });
});
