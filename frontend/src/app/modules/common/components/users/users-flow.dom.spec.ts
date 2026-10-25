// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import * as fs from 'fs';
import * as path from 'path';
import { of, Subject, firstValueFrom } from 'rxjs';

import { Users } from './users';
import { PermissionService } from '../../../../core/services/permission.service';
import { ActivatedRoute, Router } from '@angular/router';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ApiService } from '../../../../core/api/api.service';

// سرویس‌های موردنیاز کامپوننت‌های تب مجوزها و جانشین (UserPermissionsTabComponent و WorkflowSubstitutesComponent)
import { PermissionApiService } from '../../../../core/api/permission-api.service';
import { OrgStructureApiService } from '../../../../core/api/org-structure-api.service';
import { WorkflowApiService } from '../../../../core/api/workflow-api.service';
import { PermissionCatalog, UserPermissionsDetail } from '../../../../core/models/permission.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const mockPermissionsCatalog: PermissionCatalog = {
  categories: [{ module: 'warehouse', key: 'wh_cat', label_fa: 'انبارداری', order: 1, menu: null }],
  permissions: [
    { code: 'view_wh_dashboard', label_fa: 'مشاهده داشبورد انبار', module: 'warehouse', category: 'wh_cat', scope: 'section', sensitive: false },
    { code: 'view_sys_personnel', label_fa: 'مشاهده پرسنل', module: 'accounting', category: 'wh_cat', scope: 'section', sensitive: false },
    { code: 'view_sys_users', label_fa: 'مشاهده کاربران', module: null, category: null, scope: 'system', sensitive: false },
  ],
  roles: [],
  bundles: {},
};

function createMockUserPermissionsDetail(userId = 77): UserPermissionsDetail {
  return {
    user_id: userId,
    is_superuser: false,
    assignments: [{
      id: 51,
      level: 'section',
      role: 'employee',
      role_label_fa: 'کارمند انبار',
      company_id: 1,
      company_name: 'پاینده توان ساینا',
      project_id: 9,
      project_name: 'پروژه مرکزی',
      section_id: 12,
      section_name: 'بخش انبار ۱',
    }],
    system: { from_roles: ['view_sys_users'], added: [], removed: [], effective: ['view_sys_users'] },
    companies: {
      '1': {
        name: 'پاینده توان ساینا',
        has_assignment: true,
        from_roles: ['view_wh_dashboard'],
        added: [],
        removed: [],
        effective: ['view_wh_dashboard'],
      },
      '2': {
        name: 'فارس عالیش',
        has_assignment: false,
        from_roles: [],
        added: [],
        removed: [],
        effective: [],
      },
    },
    editable: {
      system: true,
      system_reason_fa: null,
      companies: [1, 2],
      locked_codes: {},
      company_locked_codes: {},
    },
  };
}

describe('جریان ساخت کاربر → مجوزها → جانشین (۲.۹-د)', () => {
  let component: Users;
  let fixture: ComponentFixture<Users>;

  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const candidates = [
        path.resolve(__dirname, filename),
        path.resolve(__dirname, 'user-permissions-tab', filename),
        path.resolve(__dirname, '../../../../shared/components/workflow-substitutes', filename),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf-8');
        }
      }
      return '';
    });
  });

  // Mock Data
  const mockPermissions = [
    { id: 1, name: 'مشاهده داشبورد انبار', codename: 'view_wh_dashboard', content_type: 1 },
    { id: 2, name: 'مشاهده پرسنل', codename: 'view_sys_personnel', content_type: 1 },
    { id: 3, name: 'مشاهده کاربران', codename: 'view_sys_users', content_type: 1 },
    { id: 4, name: 'حذف دائمی سیستم', codename: 'perm_sys_hard_delete', content_type: 1, is_sensitive: true },
  ];

  const mockRoles = [
    { id: 10, name: 'admin', title: 'مدیر ارشد', color: '#4f46e5', permissions: [1, 2, 3], user_ids: [1] },
    { id: 11, name: 'supervisor', title: 'سرپرست انبار', color: '#059669', permissions: [1], user_ids: [2] },
  ];

  const mockUsers = [
    {
      id: 1,
      username: 'admin_user',
      first_name: 'مدیر',
      last_name: 'سیستم',
      national_code: '0011223344',
      phone_number: '09120000001',
      email: 'admin@test.com',
      is_active: true,
      is_superuser: true,
      groups: [10],
      assigned_warehouses: [101],
      company_ids: [1],
      default_company_id: 1,
      blood_type: 'O+',
      emergency_contact: '09129999999',
      company: 'مرکزی',
      operational_zone: 'منطقه ۱',
      avatar: null,
      supervisor: null,
    },
    {
      id: 2,
      username: 'worker_user',
      first_name: 'کارگر',
      last_name: 'انبار',
      national_code: '0011223345',
      phone_number: '09120000002',
      email: 'worker@test.com',
      is_active: false,
      is_superuser: false,
      groups: [11],
      assigned_warehouses: [],
      company_ids: [2],
      default_company_id: 2,
      blood_type: 'A+',
      emergency_contact: '09128888888',
      company: 'پیمانکار',
      operational_zone: 'منطقه ۲',
      avatar: null,
      supervisor: 1,
    },
  ];

  const mockCompanies = [
    { id: 1, name: 'شرکت پاینده توان ساینا', code: 'PTS', is_active: true },
    { id: 2, name: 'شرکت فارس عالیش', code: 'FA', is_active: true },
  ];

  const mockWarehouses = [
    { id: 101, name: 'انبار مرکزی شماره ۱', code: 'WH-01', company: 1, company_name: 'پاینده توان ساینا' },
    { id: 102, name: 'انبار قطعات یدکی', code: 'WH-02', company: 2, company_name: 'فارس عالیش' },
  ];

  let mockAccountsHttp: any;
  let mockWarehouseHttp: any;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockApi: any;
  let mockToast: any;
  let mockAuth: any;
  let mockPersona: any;
  let mockRegistry: any;
  let mockConfirmDialog: any;
  let mockPermApi: any;
  let mockOrgApi: any;
  let mockWorkflowApi: any;
  let mockPermissionService: any;

  const resetSharedMockUsers = () => {
    mockUsers.splice(0, mockUsers.length, ...mockUsers.filter((u: any) => u.id === 1 || u.id === 2).sort((a: any, b: any) => a.id - b.id));
    mockUsers[0].is_active = true;
    mockUsers[1].is_active = false;
  };

  let mockRouter: any;
  let queryParamsSubject: Subject<any>;
  let activeModuleList: string[];
  let usersExtRef: Record<string, any>;

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    queryParamsSubject = new Subject();

    mockAccountsHttp = {
      getPermissions: vi.fn().mockReturnValue(of(mockPermissions)),
      getRoles: vi.fn().mockReturnValue(of(mockRoles)),
      getUsers: vi.fn().mockReturnValue(of(mockUsers)),
      createUser: vi.fn().mockImplementation((u) => of({ ...u, id: 99 })),
      updateUser: vi.fn().mockImplementation((id, u) => of({ ...u, id })),
      createRole: vi.fn().mockImplementation((r) => of({ ...r, id: 88 })),
      updateRole: vi.fn().mockImplementation((id, r) => of({ ...r, id })),
      deleteUser: vi.fn().mockReturnValue(of({ success: true })),
      deleteRole: vi.fn().mockReturnValue(of({ success: true })),
      toggleUserStatus: vi.fn().mockReturnValue(of({ success: true })),
      adminResetPassword: vi.fn().mockReturnValue(of({ success: true, message: 'رمز ریست شد' })),
      exportUsersExcel: vi.fn().mockReturnValue(of(new Blob(['users-excel']))),
      exportRolesExcel: vi.fn().mockReturnValue(of(new Blob(['roles-excel']))),
      downloadUsersTemplate: vi.fn().mockReturnValue(of(new Blob(['template-users']))),
      downloadRolesTemplate: vi.fn().mockReturnValue(of(new Blob(['template-roles']))),
      uploadUserAvatar: vi.fn().mockReturnValue(of({ success: true, avatar: '/media/avatar.webp' })),
      getLockedStatus: vi.fn().mockReturnValue(of({ locked_users: [] })),
      resetLockout: vi.fn().mockReturnValue(of({ success: true })),
    };

    mockWarehouseHttp = {
      getAll: vi.fn().mockImplementation((companyId?: number) => {
        if (companyId) {
          return of(mockWarehouses.filter((w) => w.company === companyId));
        }
        return of(mockWarehouses);
      }),
      getWarehouses: vi.fn().mockImplementation((companyId?: number) => {
        if (companyId) {
          return of(mockWarehouses.filter((w) => w.company === companyId));
        }
        return of(mockWarehouses);
      }),
    };

    mockCompanyApi = {
      getAll: vi.fn().mockReturnValue(of({ results: mockCompanies })),
      getCompanies: vi.fn().mockReturnValue(of({ results: mockCompanies })),
    };

    mockActiveCompanyService = {
      activeCompany$: of(mockCompanies[0]),
      activeCompanyId$: of(1),
      getActiveCompanyId: vi.fn().mockReturnValue(1),
      getActiveCompany: vi.fn().mockReturnValue(mockCompanies[0]),
      setActiveCompany: vi.fn(),
      loadAvailableCompanies: vi.fn().mockReturnValue(of(mockCompanies)),
      availableCompanies$: of(mockCompanies),
      manageableCompanies: vi.fn().mockReturnValue(mockCompanies),
    };

    mockApi = {
      get: vi.fn().mockReturnValue(of([])),
      post: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({})),
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    mockAuth = {
      hasPermission: vi.fn().mockReturnValue(true),
      isSuperUser: vi.fn().mockReturnValue(true),
      isSuperuser: vi.fn().mockReturnValue(true),
      userPermissions: vi.fn().mockReturnValue([]),
      user: vi.fn().mockReturnValue(mockUsers[0]),
      currentUser: vi.fn().mockReturnValue(mockUsers[0]),
      updateUserAvatar: vi.fn(),
    };

    mockPersona = {
      activeApp: vi.fn().mockReturnValue('warehouse'),
      canPerform: vi.fn().mockReturnValue(true),
      isCurrentActive: vi.fn().mockReturnValue(true),
    };

    activeModuleList = ['warehouse', 'accounting'];
    const scopeLabels = (singular: string, plural: string, extra: Record<string, string>) => ({
      singular,
      plural,
      pluralAttributive: `${plural.replace(/‌ها$|ها$/, '')}‌های`,
      allOption: `همه ${plural}`,
      noneOption: `بدون ${singular}`,
      listPrefix: `${plural}:`,
      column: '',
      roleTitlePlaceholder: '',
      presetsHint: '',
      nextStep: '',
      allowedTitle: '',
      assignTitle: '',
      emptyText: '',
      sensitiveRecords: '',
      ...extra,
    });

    const usersExt: Record<string, any> = {
      warehouse: {
        permissionGroup: { key: 'WH_AUDIT', titleFa: 'انبارگردانی 📦', order: 10, codenames: ['view_wh_dashboard'] },
        shortPermissionNames: { view_wh_dashboard: 'داشبورد انبار' },
        assignmentScope: {
          priority: 10,
          labels: scopeLabels('انبار', 'انبارها', { companiesTab: 'شرکت‌ها و انبارها' }),
          loadItems: async (inj: any) => (await firstValueFrom(inj.get(ScopeDirectoryService).getAll())) || [],
        },
        presetCategory: { key: 'inventory', labelFa: 'انبارگردانی', icon: 'package', tone: 'sky' },
        rolePresets: [{ id: 'counter', title: 'انبارگردان / شمارشگر کور', category: 'inventory', categoryTitle: 'انبارگردانی', color: '#0284c7', icon: '📦', description: '', permissionCodenames: [] }],
        roleScope: {
          key: 'warehouse',
          order: 10,
          tabLabelFa: '📦 سامانه انبارداری',
          badgeLabelFa: 'سامانه انبارداری',
          shortLabelFa: 'انبارداری',
          tinyLabelFa: 'انبار',
          icon: '📦',
          tone: 'sky',
          countsWarehouses: true,
          nameHints: ['warehouse'],
          titleHints: ['انبار', 'شمارش'],
        },
      },
      accounting: {
        permissionGroup: { key: 'ACCOUNTING_FINANCE', titleFa: 'حسابداری 💳', order: 20, codenames: ['view_sys_personnel'] },
        shortPermissionNames: { view_sys_personnel: 'مدیریت پرسنل' },
        assignmentScope: {
          priority: 20,
          labels: scopeLabels('پروژه', 'پروژه‌ها', { companiesTab: 'شرکت‌ها و پروژه‌ها' }),
          loadItems: async () => [],
        },
        presetCategory: { key: 'accounting', labelFa: 'حسابداری', icon: 'credit-card', tone: 'emerald' },
        rolePresets: [{ id: 'workshop_operator', title: 'کارمند کارگاه', category: 'accounting', categoryTitle: 'حسابداری و کارگاه', color: '#64748b', icon: '👤', description: '', permissionCodenames: [] }],
        roleScope: {
          key: 'finance',
          order: 20,
          tabLabelFa: '💳 سامانه مالی و پرسنلی',
          badgeLabelFa: 'سامانه مالی و پرسنلی',
          shortLabelFa: 'مالی',
          tinyLabelFa: 'مالی',
          icon: '💳',
          tone: 'emerald',
          nameHints: ['finance', 'payroll'],
          titleHints: ['مالی', 'حقوق'],
          extraRoleNames: ['workshop_supervisor', 'company_manager'],
          extraTitleHints: ['سرپرست کارگاه', 'مدیر شرکت'],
        },
      },
    };
    usersExtRef = usersExt;
    const moduleOf = (code: string) => ({ code, extensions: { users: usersExt[code] } });
    mockRegistry = {
      isModuleActive: vi.fn().mockImplementation((c: string) => activeModuleList.includes(c)),
      isModuleInstalled: vi.fn().mockImplementation((c: string) => activeModuleList.includes(c)),
      permissionMarkers: vi.fn().mockReturnValue([]),
      getSpec: vi.fn().mockImplementation((c: string) => ({ titleFa: c, titleShortFa: c })),
      getAllModules: vi.fn().mockImplementation(() => ['warehouse', 'accounting'].map(moduleOf)),
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'users') {
          const list: any[] = [];
          if (activeModuleList.includes('warehouse')) {
            list.push({ module: moduleOf('warehouse'), moduleCode: 'warehouse', extension: usersExt['warehouse'] });
          }
          if (activeModuleList.includes('accounting')) {
            list.push({ module: moduleOf('accounting'), moduleCode: 'accounting', extension: usersExt['accounting'] });
          }
          return list;
        }
        if (point === 'projectLookup') {
          if (activeModuleList.includes('accounting')) {
            return [{ moduleCode: 'accounting', extension: { financialProjectsEndpoint: '/org/projects' } }];
          }
          return [];
        }
        return [];
      }),
    };

    resetSharedMockUsers();
    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockPermApi = {
      getUserPermissions: vi.fn().mockImplementation((uid?: number) => of(createMockUserPermissionsDetail(uid || 77))),
      updateUserPermissions: vi.fn().mockImplementation((uid?: number) => of(createMockUserPermissionsDetail(uid || 77))),
      getCatalog: vi.fn().mockReturnValue(of(mockPermissionsCatalog)),
    };

    mockOrgApi = {
      getProjects: vi.fn().mockReturnValue(of([{ id: 9, name: 'پروژه مرکزی' }])),
      getSections: vi.fn().mockReturnValue(of([{ id: 12, name: 'بخش انبار ۱' }])),
      bulkAssign: vi.fn().mockReturnValue(of([])),
    };

    mockWorkflowApi = {
      getSubstitutes: vi.fn().mockReturnValue(of([])),
      getSubstituteCandidates: vi.fn().mockReturnValue(of([
        { id: 1, name: 'مدیر سیستم' },
        { id: 2, name: 'کارگر انبار' },
      ])),
      createSubstitute: vi.fn().mockReturnValue(of({})),
      deleteSubstitute: vi.fn().mockReturnValue(of({})),
    };

    const permissionsChanged$ = new Subject();
    const usersChanged$ = new Subject();
    mockPermissionService = {
      ensureCatalog: vi.fn().mockResolvedValue(mockPermissionsCatalog),
      catalog: vi.fn().mockReturnValue(mockPermissionsCatalog),
      spec: vi.fn().mockImplementation((code: string) => mockPermissionsCatalog.permissions.find((p) => p.code === code)),
      isSuperuser: vi.fn().mockReturnValue(true),
      permissionsChanged$,
      usersChanged$,
    };

    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [
        StateService,
        { provide: AccountsHttpService, useValue: mockAccountsHttp },
        { provide: ScopeDirectoryService, useValue: mockWarehouseHttp },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        { provide: ApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: AuthService, useValue: mockAuth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: ModuleRegistryService, useValue: mockRegistry },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParamsSubject.asObservable(),
          },
        },
        { provide: PermissionService, useValue: mockPermissionService },
        { provide: PermissionApiService, useValue: mockPermApi },
        { provide: OrgStructureApiService, useValue: mockOrgApi },
        { provide: WorkflowApiService, useValue: mockWorkflowApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('الف) پیش از ساخت: در پنجرهٔ کاربر جدید دکمه‌های تب مجوزها و جانشین وجود ندارند', async () => {
    // ۱. کلیک روی دکمهٔ «کاربر جدید» در سربرگ (DOM)
    const createBtn = (fixture.nativeElement as HTMLElement).querySelector('button[appAction="create"]') as HTMLButtonElement;
    expect(createBtn).toBeTruthy();
    createBtn.click();
    await settle();

    // ۲. بررسی باز بودن دیالوگ و حالت کاربر جدید
    expect(component.isUserModalOpen).toBe(true);
    expect(component.editingUser).toBeNull();
    const modalDialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    expect(modalDialog).toBeTruthy();

    // ۳. دکمه‌های تب مجوزها و جانشین نباید در نوار تب‌های پنجره وجود داشته باشند
    const permissionsTab = (fixture.nativeElement as HTMLElement).querySelector('#user-modal-tab-permissions');
    const substituteTab = (fixture.nativeElement as HTMLElement).querySelector('#user-modal-tab-substitute');
    expect(permissionsTab).toBeNull();
    expect(substituteTab).toBeNull();
  });

  it('ب) پس از ساخت موفق: پنجره باز می‌ماند، شناسه کاربر ثبت می‌شود، تب مجوزها فعال و کامپوننت مجوزها نمایش می‌یابد', async () => {
    mockAccountsHttp.createUser.mockReturnValue(of({
      id: 77,
      username: 's.karimi',
      first_name: 'سارا',
      last_name: 'کریمی',
      phone_number: '09121112244',
      is_active: true,
      is_superuser: false,
      groups: [],
      assigned_warehouses: [],
      company_ids: [1],
      one_time_password: 'Tmp9Pass',
    }));

    // ۱. باز کردن پنجره با کلیک دکمه در DOM
    const createBtn = (fixture.nativeElement as HTMLElement).querySelector('button[appAction="create"]') as HTMLButtonElement;
    expect(createBtn).toBeTruthy();
    createBtn.click();
    await settle();

    // ۲. مقداردهی فیلدهای هویتی از طریق رویدادهای ورودی DOM
    const fNameInput = (fixture.nativeElement as HTMLElement).querySelector('#user-first-name') as HTMLInputElement;
    const lNameInput = (fixture.nativeElement as HTMLElement).querySelector('#user-last-name') as HTMLInputElement;
    const uNameInput = (fixture.nativeElement as HTMLElement).querySelector('#user-username') as HTMLInputElement;
    const phoneInput = (fixture.nativeElement as HTMLElement).querySelector('#user-phone-number') as HTMLInputElement;

    expect(fNameInput).toBeTruthy();
    fNameInput.value = 'سارا';
    fNameInput.dispatchEvent(new Event('input'));

    expect(lNameInput).toBeTruthy();
    lNameInput.value = 'کریمی';
    lNameInput.dispatchEvent(new Event('input'));

    expect(uNameInput).toBeTruthy();
    uNameInput.value = 's.karimi';
    uNameInput.dispatchEvent(new Event('input'));

    expect(phoneInput).toBeTruthy();
    phoneInput.value = '09121112244';
    phoneInput.dispatchEvent(new Event('input'));

    component.userForm.first_name = 'سارا';
    component.userForm.last_name = 'کریمی';
    component.userForm.username = 's.karimi';
    component.userForm.phone_number = '09121112244';
    await settle();

    // ۳. فشردن دکمهٔ ایجاد در DOM
    const modalDialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    const saveBtn = Array.from(modalDialog?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('ایجاد حساب کاربری') || b.textContent?.includes('ذخیره')
    ) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await settle();

    // ۴. تایید که پنجره باز مانده و editingUser.id مقدار گرفته است
    expect(component.isUserModalOpen).toBe(true);
    expect(component.editingUser?.id).toBe(77);

    // ۵. دکمهٔ #user-modal-tab-permissions اکنون در DOM وجود دارد و تب فعال است
    const permissionsTab = (fixture.nativeElement as HTMLElement).querySelector('#user-modal-tab-permissions') as HTMLButtonElement;
    expect(permissionsTab).toBeTruthy();
    expect(permissionsTab.getAttribute('aria-selected')).toBe('true');
    expect(component.userModalInnerTab).toBe('permissions');

    // ۶. کامپوننت مجوزهای کاربر (app-user-permissions-tab) در DOM رندر شده است
    const permTabComp = (fixture.nativeElement as HTMLElement).querySelector('app-user-permissions-tab');
    expect(permTabComp).toBeTruthy();
  });

  it('ج) در تب مجوزها: کلیک روی دکمهٔ «افزودن انتساب» فرم درون‌خطی و نخستین فیلد انتخاب شرکت را نشان می‌دهد', async () => {
    mockAccountsHttp.createUser.mockReturnValue(of({
      id: 77,
      username: 's.karimi',
      first_name: 'سارا',
      last_name: 'کریمی',
      phone_number: '09121112244',
      is_active: true,
      is_superuser: false,
      groups: [],
      assigned_warehouses: [],
      company_ids: [1],
      one_time_password: 'Tmp9Pass',
    }));

    // ۱. ساخت کاربر و انتقال به تب مجوزها از طریق DOM
    const createBtn = (fixture.nativeElement as HTMLElement).querySelector('button[appAction="create"]') as HTMLButtonElement;
    createBtn.click();
    await settle();

    component.userForm.first_name = 'سارا';
    component.userForm.last_name = 'کریمی';
    component.userForm.username = 's.karimi';
    component.userForm.phone_number = '09121112244';
    await settle();

    const modalDialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    const saveBtn = Array.from(modalDialog?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('ایجاد حساب کاربری') || b.textContent?.includes('ذخیره')
    ) as HTMLButtonElement;
    saveBtn.click();
    await settle();

    // بستن پنل رمز یک‌بارمصرف با کلیک روی دکمهٔ بستن آن در صورت وجود
    const otpCloseBtn = (fixture.nativeElement as HTMLElement).querySelector('[data-otp-panel] button') as HTMLButtonElement;
    if (otpCloseBtn) {
      otpCloseBtn.click();
      await settle();
    }

    // ۲. پیدا کردن دکمهٔ افزودن انتساب با aria-label="افزودن انتساب"
    const addAssignBtn = (fixture.nativeElement as HTMLElement).querySelector('button[aria-label="افزودن انتساب"]') as HTMLButtonElement;
    expect(addAssignBtn).toBeTruthy();

    // ۳. کلیک روی دکمهٔ «افزودن انتساب»
    addAssignBtn.click();
    await settle();

    // ۴. تایید نمایش فرم درون‌خطی و وجود نخستین کنترل انتخاب
    const assignForm = (fixture.nativeElement as HTMLElement).querySelector('[data-assign-form]');
    expect(assignForm).toBeTruthy();

    const firstSelect = (fixture.nativeElement as HTMLElement).querySelector('#uptab-assign-company') || assignForm?.querySelector('select');
    expect(firstSelect).toBeTruthy();
  });

  it('د) کلیک روی تب جانشین کامپوننت جانشین را نشان می‌دهد و کلیک دوباره روی تب مجوزها کامپوننت مجوزها را برمی‌گرداند', async () => {
    mockAccountsHttp.createUser.mockReturnValue(of({
      id: 77,
      username: 's.karimi',
      first_name: 'سارا',
      last_name: 'کریمی',
      phone_number: '09121112244',
      is_active: true,
      is_superuser: false,
      groups: [],
      assigned_warehouses: [],
      company_ids: [1],
      one_time_password: 'Tmp9Pass',
    }));

    // ۱. ساخت کاربر و انتقال به تب مجوزها
    const createBtn = (fixture.nativeElement as HTMLElement).querySelector('button[appAction="create"]') as HTMLButtonElement;
    createBtn.click();
    await settle();

    component.userForm.first_name = 'سارا';
    component.userForm.last_name = 'کریمی';
    component.userForm.username = 's.karimi';
    component.userForm.phone_number = '09121112244';
    await settle();

    const modalDialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    const saveBtn = Array.from(modalDialog?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('ایجاد حساب کاربری') || b.textContent?.includes('ذخیره')
    ) as HTMLButtonElement;
    saveBtn.click();
    await settle();

    // ۲. کلیک روی دکمهٔ تب جانشین موقت (#user-modal-tab-substitute)
    const substituteTabBtn = (fixture.nativeElement as HTMLElement).querySelector('#user-modal-tab-substitute') as HTMLButtonElement;
    expect(substituteTabBtn).toBeTruthy();
    substituteTabBtn.click();
    await settle();

    // ۳. بررسی حضور app-workflow-substitutes و عدم حضور app-user-permissions-tab
    expect((fixture.nativeElement as HTMLElement).querySelector('app-workflow-substitutes')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-user-permissions-tab')).toBeNull();
    expect(substituteTabBtn.getAttribute('aria-selected')).toBe('true');
    expect(component.userModalInnerTab).toBe('substitute');

    // ۴. کلیک مجدد روی دکمهٔ تب مجوزها (#user-modal-tab-permissions)
    const permissionsTabBtn = (fixture.nativeElement as HTMLElement).querySelector('#user-modal-tab-permissions') as HTMLButtonElement;
    expect(permissionsTabBtn).toBeTruthy();
    permissionsTabBtn.click();
    await settle();

    // ۵. بررسی بازگشت app-user-permissions-tab و خروج app-workflow-substitutes
    expect((fixture.nativeElement as HTMLElement).querySelector('app-user-permissions-tab')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-workflow-substitutes')).toBeNull();
    expect(permissionsTabBtn.getAttribute('aria-selected')).toBe('true');
    expect(component.userModalInnerTab).toBe('permissions');
  });
});
