// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject, of, throwError } from 'rxjs';

import { UserPermissionsTabComponent } from './user-permissions-tab';
import { PermissionApiService } from '../../../../../core/api/permission-api.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { OrgStructureApiService } from '../../../../../core/api/org-structure-api.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PermissionCatalog, PermissionsUpdatedEvent, UserPermissionsDetail } from '../../../../../core/models/permission.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

// کدها و ماژول ساختگی‌اند: پوسته نباید کد مجوز یا نام ماژول واقعی بشناسد (نگهبان ۵۷)
const CATALOG: PermissionCatalog = {
  categories: [{ module: 'mod_a', key: 'cat1', label_fa: 'دستهٔ یک', order: 1, menu: null }],
  permissions: [
    { code: 'perm_alpha', label_fa: 'آلفا', module: 'mod_a', category: 'cat1', scope: 'section', sensitive: false },
    { code: 'perm_beta', label_fa: 'بتا', module: 'mod_a', category: 'cat1', scope: 'section', sensitive: false },
    { code: 'perm_gamma', label_fa: 'گاما', module: 'mod_a', category: 'cat1', scope: 'section', sensitive: false },
    { code: 'sys_view', label_fa: 'دیدن', module: null, category: null, scope: 'system', sensitive: false },
    { code: 'sys_other', label_fa: 'دیگر', module: null, category: null, scope: 'system', sensitive: false },
    { code: 'sys_extra', label_fa: 'افزون', module: null, category: null, scope: 'system', sensitive: false },
    { code: 'sys_danger', label_fa: 'خطرناک', module: null, category: null, scope: 'system', sensitive: true },
  ],
  roles: [],
  bundles: {},
};

function payload(): UserPermissionsDetail {
  return {
    user_id: 7,
    is_superuser: false,
    assignments: [{
      id: 51, level: 'section', role: 'employee', role_label_fa: 'کارمند', company_id: 3, company_name: 'شرکت الف',
      project_id: 9, project_name: 'پروژه', section_id: 12, section_name: 'بخش یک',
    }],
    system: { from_roles: ['sys_view'], added: [], removed: [], effective: ['sys_view'] },
    companies: {
      '3': { name: 'شرکت الف', has_assignment: true, from_roles: ['perm_alpha', 'perm_beta'], added: [], removed: ['perm_beta'], effective: ['perm_alpha'] },
      '5': { name: 'شرکت ب', has_assignment: true, from_roles: ['perm_alpha'], added: [], removed: [], effective: ['perm_alpha'] },
    },
    editable: {
      system: true, system_reason_fa: null, companies: [3],
      locked_codes: { sys_other: 'خودتان این مجوز را ندارید.' },
      company_locked_codes: {},
    },
  };
}

describe('UserPermissionsTabComponent (تب «مجوزها» پنجرهٔ کاربر، ت۴ و ت۱۰ طرح ۲.۲)', () => {
  let fixture: ComponentFixture<UserPermissionsTabComponent>;
  let component: UserPermissionsTabComponent;
  let api: { getUserPermissions: ReturnType<typeof vi.fn>; updateUserPermissions: ReturnType<typeof vi.fn> };
  let changed$: Subject<PermissionsUpdatedEvent>;
  let editorSuperuser: boolean;
  let confirm: { open: ReturnType<typeof vi.fn> };
  let org: { getProjects: ReturnType<typeof vi.fn>; getSections: ReturnType<typeof vi.fn>; bulkAssign: ReturnType<typeof vi.fn> };

  const el = (): HTMLElement => fixture.nativeElement;
  const block = (key: string) => el().querySelector(`[data-block="${key}"]`) as HTMLElement;
  const row = (key: string, code: string) => block(key).querySelector(`[data-code="${code}"]`) as HTMLElement;
  const box = (key: string, code: string) => row(key, code).querySelector('input[type="checkbox"]') as HTMLInputElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r));
      fixture.detectChanges();
    }
  }

  async function create(userId: number | null = 7): Promise<void> {
    fixture = TestBed.createComponent(UserPermissionsTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', userId);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(async () => {
    editorSuperuser = false;
    changed$ = new Subject();
    api = {
      getUserPermissions: vi.fn().mockImplementation(() => of(payload())),
      updateUserPermissions: vi.fn().mockImplementation(() => of(payload())),
    };
    confirm = { open: vi.fn().mockResolvedValue(true) };
    org = {
      getProjects: vi.fn().mockReturnValue(of([{ id: 9, name: 'پروژه الف' }])),
      getSections: vi.fn().mockReturnValue(of([{ id: 12, name: 'بخش یک' }])),
      bulkAssign: vi.fn().mockReturnValue(of([])),
    };
    TestBed.configureTestingModule({
      imports: [UserPermissionsTabComponent],
      providers: [
        { provide: PermissionApiService, useValue: api },
        {
          provide: PermissionService,
          useValue: {
            ensureCatalog: vi.fn().mockResolvedValue(CATALOG),
            catalog: () => CATALOG,
            isSuperuser: () => editorSuperuser,
            permissionsChanged$: changed$,
          },
        },
        { provide: ModuleRegistryService, useValue: {
          getSpec: (c: string) => (c === 'mod_a' ? { titleShortFa: 'ماژول آ' } : undefined),
          getExtensions: () => [{ moduleCode: 'mod_a', extension: { sectionRoles: [{ key: 'employee', labelFa: 'کارمند', shortLabelFa: 'کارمند', icon: 'users', tone: 'blue', order: 1 }] } }],
        } },
        { provide: ConfirmDialogService, useValue: confirm },
        { provide: OrgStructureApiService, useValue: org },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), show: vi.fn() } },
      ],
    });
    await TestBed.compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('انتساب‌ها، گروه‌بندی ماژول/دسته و برچسب‌های «از نقش» و «برداشته» را نشان می‌دهد', async () => {
    await create();
    expect(api.getUserPermissions).toHaveBeenCalledWith(7);
    expect(el().textContent).toContain('شرکت الف › پروژه › بخش یک');
    expect(el().textContent).toContain('کارمند');
    // بلوک شرکت فقط مجوز بخشی، بلوک سامانه فقط سامانه‌ای
    expect(block('c3').textContent).toContain('ماژول آ');
    expect(block('c3').textContent).toContain('دستهٔ یک');
    expect(block('c3').querySelector('[data-code="sys_view"]')).toBeNull();
    expect(block('system').querySelector('[data-code="perm_alpha"]')).toBeNull();
    expect(box('c3', 'perm_alpha').checked).toBe(true);
    expect(row('c3', 'perm_alpha').querySelector('[data-badge]')?.textContent).toContain('از نقش');
    expect(box('c3', 'perm_beta').checked).toBe(false);
    expect(row('c3', 'perm_beta').querySelector('[data-badge]')?.textContent).toContain('برداشته');
    expect(row('c3', 'perm_gamma').querySelector('[data-badge]')).toBeNull();
  });

  it('تیک‌زدن یک کد فهرست کامل افزوده/برداشتهٔ همان شرکت را می‌فرستد', async () => {
    await create();
    box('c3', 'perm_gamma').click();
    await settle();
    expect(api.updateUserPermissions).toHaveBeenCalledWith(7, { company_id: 3, add: ['perm_gamma'], remove: ['perm_beta'] });
    api.updateUserPermissions.mockClear();
    box('c3', 'perm_beta').click();
    await settle();
    expect(api.updateUserPermissions).toHaveBeenCalledWith(7, { company_id: 3, add: [], remove: [] });
  });

  it('برداشتن مجوز سامانه‌ای از نقش با company_id برابر null فرستاده می‌شود', async () => {
    await create();
    box('system', 'sys_view').click();
    await settle();
    expect(api.updateUserPermissions).toHaveBeenCalledWith(7, { company_id: null, add: [], remove: ['sys_view'] });
  });

  it('کد قفل‌شده غیرفعال است و دلیل فارسی دارد؛ مجوز حساس برای غیرمدیر کل قفل است', async () => {
    await create();
    expect(box('system', 'sys_other').disabled).toBe(true);
    expect(row('system', 'sys_other').querySelector('[data-lock-reason]')?.textContent).toContain('خودتان این مجوز را ندارید.');
    expect(box('system', 'sys_danger').disabled).toBe(true);
    expect(row('system', 'sys_danger').querySelector('[data-lock-reason]')?.textContent).toContain('حساس');
    box('system', 'sys_other').click();
    await settle();
    expect(api.updateUserPermissions).not.toHaveBeenCalled();
  });

  it('مجوز حساس در «انتخاب همه» نمی‌آید و پیش از دادن پنجرهٔ تأیید دارد', async () => {
    editorSuperuser = true;
    await create();
    const selectAll = block('system').querySelector('[data-select-all]') as HTMLButtonElement;
    selectAll.click();
    await settle();
    // sys_other قفل سرور است؛ sys_danger حساس؛ فقط sys_extra
    expect(api.updateUserPermissions).toHaveBeenCalledWith(7, { company_id: null, add: ['sys_extra'], remove: [] });
    expect(confirm.open).not.toHaveBeenCalled();

    api.updateUserPermissions.mockClear();
    confirm.open.mockResolvedValueOnce(false);
    box('system', 'sys_danger').click();
    await settle();
    expect(confirm.open).toHaveBeenCalledTimes(1);
    expect(api.updateUserPermissions).not.toHaveBeenCalled();

    box('system', 'sys_danger').click();
    await settle();
    expect(confirm.open).toHaveBeenCalledTimes(2);
    expect(api.updateUserPermissions).toHaveBeenCalledWith(7, { company_id: null, add: ['sys_danger'], remove: [] });
  });

  it('بلوک شرکتی که ویرایش‌کننده در آن مجاز نیست فقط خواندنی است', async () => {
    await create();
    expect(block('c5').querySelector('[data-code]')).toBeNull(); // جمع‌شده
    (block('c5').querySelector('button[aria-expanded]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(block('c5').querySelector('[data-block-readonly]')).not.toBeNull();
    expect(box('c5', 'perm_alpha').disabled).toBe(true);
    expect(block('c5').querySelector('[data-select-all]')).toBeNull();
  });

  it('خطای سرور هنگام ذخیره پیام فارسی را در همان بلوک نشان می‌دهد و تیک را برنمی‌گرداند', async () => {
    api.updateUserPermissions.mockReturnValue(throwError(() => ({ status: 403, error: { detail: 'خودتان این مجوز را در این شرکت ندارید.' } })));
    await create();
    box('c3', 'perm_gamma').click();
    await settle();
    expect(block('c3').querySelector('[data-block-error]')?.textContent).toContain('خودتان این مجوز را در این شرکت ندارید.');
    expect(box('c3', 'perm_gamma').checked).toBe(false);
    expect(component.savingKey).toBeNull();
  });

  it('هنگام ذخیره تیک‌ها فعال می‌مانند (فوکوس نمی‌پرد) ولی تیک دوم نادیده است و بلوک aria-busy دارد', async () => {
    const pending$ = new Subject<any>();
    api.updateUserPermissions.mockReturnValue(pending$);
    await create();
    box('c3', 'perm_gamma').click();
    fixture.detectChanges();
    expect(block('c3').getAttribute('aria-busy')).toBe('true');
    expect(box('c3', 'perm_gamma').disabled).toBe(false);
    box('c3', 'perm_gamma').click();
    await settle();
    expect(api.updateUserPermissions).toHaveBeenCalledTimes(1);
    pending$.complete();
  });

  it('خطای فیلدی ۴۰۰ هم نمایش داده می‌شود', () => {
    expect(UserPermissionsTabComponent.errorMessage({ status: 400, error: { add: ['این کدهای مجوز شناخته نیستند: x'] } }, 'پیش‌فرض'))
      .toBe('این کدهای مجوز شناخته نیستند: x');
  });

  it('خطای بارگذاری نخست با دکمهٔ تلاش دوباره', async () => {
    api.getUserPermissions.mockReturnValueOnce(throwError(() => ({ status: 404, error: { detail: 'یافت نشد.' } })));
    await create();
    expect(el().querySelector('[data-load-error]')?.textContent).toContain('یافت نشد.');
  });

  it('کاربر بدون انتساب توضیح مجوز بخشی را می‌بیند و پیوند تب انتساب رویداد می‌دهد', async () => {
    api.getUserPermissions.mockImplementation(() => of({ ...payload(), assignments: [], companies: {} }));
    await create();
    expect(el().querySelector('[data-no-assignments]')).not.toBeNull();
    const spy = vi.fn();
    component.goToAssignments.subscribe(spy);
    (el().querySelector('[data-go-assignments]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('رویداد permissions_updated همین کاربر یا رویداد شرکتی بی‌کاربر دوباره می‌خواند', async () => {
    await create();
    api.getUserPermissions.mockClear();
    changed$.next({ user_id: 99, own: false });
    expect(api.getUserPermissions).not.toHaveBeenCalled();
    changed$.next({ user_id: 7, reason: 'override', own: false });
    expect(api.getUserPermissions).toHaveBeenCalledTimes(1);
    changed$.next({ user_id: null, company_id: 3, reason: 'bundle', own: false });
    expect(api.getUserPermissions).toHaveBeenCalledTimes(2);
  });

  describe('فرم «افزودن انتساب» (۲.۹-ب)', () => {
    const q = (sel: string) => el().querySelector(sel) as HTMLSelectElement;
    const pick = async (sel: string, value: string) => {
      const node = q(sel);
      node.value = value;
      node.dispatchEvent(new Event('change'));
      await settle();
    };

    async function openForm(): Promise<void> {
      fixture = TestBed.createComponent(UserPermissionsTabComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('userId', 7);
      fixture.componentRef.setInput('canAssign', true);
      fixture.componentRef.setInput('companies', [{ id: 3, name: 'شرکت الف' }, { id: 5, name: 'شرکت ب' }]);
      fixture.detectChanges();
      await settle();
      (el().querySelector('[data-add-assignment]') as HTMLButtonElement).click();
      await settle();
    }

    it('زنجیرهٔ شرکت › پروژه › بخش API ساختار سازمانی را صدا می‌زند و ثبت در دقیق‌ترین سطح انجام می‌شود', async () => {
      await openForm();
      await pick('[data-assign-company]', '3');
      expect(org.getProjects).toHaveBeenCalled();
      await pick('[data-assign-project]', '9');
      expect(org.getSections).toHaveBeenCalledWith({ project_id: 9, is_active: true }, 3);
      await pick('[data-assign-section]', '12');
      await pick('[data-assign-role]', 'employee');
      (el().querySelector('[data-assign-submit]') as HTMLButtonElement).click();
      await settle();
      expect(org.bulkAssign).toHaveBeenCalledWith({ section_id: 12, user_ids: [7], role: 'employee' });
    });

    it('بدون پروژه، انتساب در سطح شرکت ثبت می‌شود', async () => {
      await openForm();
      await pick('[data-assign-company]', '5');
      await pick('[data-assign-role]', 'employee');
      (el().querySelector('[data-assign-submit]') as HTMLButtonElement).click();
      await settle();
      expect(org.bulkAssign).toHaveBeenCalledWith({ company_id: 5, user_ids: [7], role: 'employee' });
    });

    it('خطای ۴۰۳ سرور با متن detail در فرم نشان داده می‌شود', async () => {
      org.bulkAssign.mockReturnValue(throwError(() => ({ status: 403, error: { detail: 'اجازهٔ انتساب در این شرکت را ندارید.' } })));
      await openForm();
      await pick('[data-assign-company]', '3');
      await pick('[data-assign-role]', 'employee');
      (el().querySelector('[data-assign-submit]') as HTMLButtonElement).click();
      await settle();
      expect(el().querySelector('[data-assign-error]')?.textContent).toContain('اجازهٔ انتساب در این شرکت را ندارید.');
    });

    it('کنترل‌های فرم انتساب درون‌خطی با شناسه uptab- و label دارای for متصل هستند', async () => {
      await openForm();
      const controlIds = [
        'uptab-assign-company',
        'uptab-assign-project',
        'uptab-assign-section',
        'uptab-assign-role'
      ];
      for (const id of controlIds) {
        const inputOrSelect = el().querySelector(`#${id}`);
        expect(inputOrSelect).toBeTruthy();
        const label = el().querySelector(`label[for="${id}"]`);
        expect(label).toBeTruthy();
      }
    });

    it('دست‌کم یک دکمهٔ فقط‌آیکون دارای aria-label و کلاس min-w-[40px] است', async () => {
      await create(7);
      const selectAllBtn = el().querySelector('[data-select-all]') as HTMLButtonElement;
      expect(selectAllBtn).toBeTruthy();
      expect(selectAllBtn.getAttribute('aria-label')).toBeTruthy();
      expect(selectAllBtn.classList.contains('min-w-[40px]')).toBe(true);
    });
  });
});
