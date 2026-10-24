// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import * as fs from 'fs';
import * as path from 'path';
import { Users } from './users';
import { of, Subject, firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { By } from '@angular/platform-browser';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ApiService } from '../../../../core/api/api.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Users & Roles Management Comprehensive Tests (Tab 1: Users & Tab 2: Roles)', () => {
  let component: Users;
  let fixture: ComponentFixture<Users>;

  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
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
      supervisor: null
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
      supervisor: 1
    }
  ];

  const mockCompanies = [
    { id: 1, name: 'شرکت پاینده توان ساینا', code: 'PTS', is_active: true },
    { id: 2, name: 'شرکت فارس عالیش', code: 'FA', is_active: true }
  ];

  const mockWarehouses = [
    { id: 101, name: 'انبار مرکزی شماره ۱', code: 'WH-01', company: 1, company_name: 'پاینده توان ساینا' },
    { id: 102, name: 'انبار قطعات یدکی', code: 'WH-02', company: 2, company_name: 'فارس عالیش' }
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
  let mockRouter: any;
  let queryParamsSubject: Subject<any>;
  let activeModuleList: string[];
  let usersExtRef: Record<string, any>;

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
      resetLockout: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockWarehouseHttp = {
      getAll: vi.fn().mockImplementation((companyId?: number) => {
        if (companyId) {
          return of(mockWarehouses.filter(w => w.company === companyId));
        }
        return of(mockWarehouses);
      }),
      getWarehouses: vi.fn().mockImplementation((companyId?: number) => {
        if (companyId) {
          return of(mockWarehouses.filter(w => w.company === companyId));
        }
        return of(mockWarehouses);
      })
    };

    mockCompanyApi = {
      getAll: vi.fn().mockReturnValue(of({ results: mockCompanies })),
      getCompanies: vi.fn().mockReturnValue(of({ results: mockCompanies }))
    };

    mockActiveCompanyService = {
      activeCompany$: of(mockCompanies[0]),
      activeCompanyId$: of(1),
      getActiveCompanyId: vi.fn().mockReturnValue(1),
      getActiveCompany: vi.fn().mockReturnValue(mockCompanies[0]),
      setActiveCompany: vi.fn(),
      loadAvailableCompanies: vi.fn().mockReturnValue(of(mockCompanies)),
      availableCompanies$: of(mockCompanies)
    };

    mockApi = {
      get: vi.fn().mockReturnValue(of([])),
      post: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({}))
    };

    mockToast = {
      show: vi.fn()
    };

    mockAuth = {
      hasPermission: vi.fn().mockReturnValue(true),
      isSuperUser: vi.fn().mockReturnValue(true),
      isSuperuser: vi.fn().mockReturnValue(true),
      userPermissions: vi.fn().mockReturnValue([]),
      user: vi.fn().mockReturnValue(mockUsers[0]),
      currentUser: vi.fn().mockReturnValue(mockUsers[0]),
      updateUserAvatar: vi.fn()
    };

    mockPersona = {
      activeApp: vi.fn().mockReturnValue('warehouse'),
      canPerform: vi.fn().mockReturnValue(true),
      isCurrentActive: vi.fn().mockReturnValue(true)
    };

    activeModuleList = ['warehouse', 'accounting'];
    // مشارکت users دو ماژول، همان مقادیر module.ts هر ماژول (spec نمی‌تواند از modules/* ایمپورت کند)
    const scopeLabels = (singular: string, plural: string, extra: Record<string, string>) => ({
      singular, plural, pluralAttributive: `${plural.replace(/‌ها$|ها$/, '')}‌های`,
      allOption: `همه ${plural}`, noneOption: `بدون ${singular}`, listPrefix: `${plural}:`,
      column: '', roleTitlePlaceholder: '', presetsHint: '', nextStep: '', allowedTitle: '', assignTitle: '', emptyText: '', sensitiveRecords: '',
      ...extra
    });
    const usersExt: Record<string, any> = {
      warehouse: {
        permissionGroup: { key: 'WH_AUDIT', titleFa: 'انبارگردانی 📦', order: 10, codenames: ['view_wh_dashboard'] },
        shortPermissionNames: { view_wh_dashboard: 'داشبورد انبار' },
        assignmentScope: {
          priority: 10,
          labels: scopeLabels('انبار', 'انبارها', { companiesTab: 'شرکت‌ها و انبارها' }),
          loadItems: async (inj: any) => (await firstValueFrom(inj.get(ScopeDirectoryService).getAll())) || []
        },
        presetCategory: { key: 'inventory', labelFa: 'انبارگردانی', icon: 'package', tone: 'sky' },
        rolePresets: [{ id: 'counter', title: 'انبارگردان / شمارشگر کور', category: 'inventory', categoryTitle: 'انبارگردانی', color: '#0284c7', icon: '📦', description: '', permissionCodenames: [] }],
        roleScope: {
          key: 'warehouse', order: 10, tabLabelFa: '📦 سامانه انبارداری', badgeLabelFa: 'سامانه انبارداری', shortLabelFa: 'انبارداری', tinyLabelFa: 'انبار',
          icon: '📦', tone: 'sky', countsWarehouses: true, nameHints: ['warehouse'], titleHints: ['انبار', 'شمارش']
        }
      },
      accounting: {
        permissionGroup: { key: 'ACCOUNTING_FINANCE', titleFa: 'حسابداری 💳', order: 20, codenames: ['view_sys_personnel'] },
        shortPermissionNames: { view_sys_personnel: 'مدیریت پرسنل' },
        assignmentScope: {
          priority: 20,
          labels: scopeLabels('پروژه', 'پروژه‌ها', { companiesTab: 'شرکت‌ها و پروژه‌ها' }),
          loadItems: async () => []
        },
        presetCategory: { key: 'accounting', labelFa: 'حسابداری', icon: 'credit-card', tone: 'emerald' },
        rolePresets: [{ id: 'workshop_operator', title: 'کارمند کارگاه', category: 'accounting', categoryTitle: 'حسابداری و کارگاه', color: '#64748b', icon: '👤', description: '', permissionCodenames: [] }],
        roleScope: {
          key: 'finance', order: 20, tabLabelFa: '💳 سامانه مالی و پرسنلی', badgeLabelFa: 'سامانه مالی و پرسنلی', shortLabelFa: 'مالی', tinyLabelFa: 'مالی',
          icon: '💳', tone: 'emerald', nameHints: ['finance', 'payroll'], titleHints: ['مالی', 'حقوق'],
          extraRoleNames: ['workshop_supervisor', 'company_manager'], extraTitleHints: ['سرپرست کارگاه', 'مدیر شرکت']
        }
      }
    };
    usersExtRef = usersExt;
    const moduleOf = (code: string) => ({ code, extensions: { users: usersExt[code] } });
    mockRegistry = {
      isModuleActive: vi.fn().mockImplementation((c: string) => activeModuleList.includes(c)),
      isModuleInstalled: vi.fn().mockImplementation((c: string) => activeModuleList.includes(c)),
      permissionMarkers: vi.fn().mockReturnValue([]),
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
      })
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockRouter = {
      navigate: vi.fn()
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
            queryParams: queryParamsSubject.asObservable()
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. کامپوننت و لود اولیه داده‌ها
  // ─────────────────────────────────────────────────────────────────
  describe('۱. راه‌اندازی و بارگذاری اولیه (Initialization & Data Loading)', () => {
    it('باید کامپوننت با موفقیت ساخته شود و داده‌های کاربران و نقش‌ها را لود کند', () => {
      expect(component).toBeTruthy();
      expect(mockAccountsHttp.getPermissions).toHaveBeenCalled();
      expect(mockAccountsHttp.getRoles).toHaveBeenCalled();
      expect(mockAccountsHttp.getUsers).toHaveBeenCalled();
      expect(mockWarehouseHttp.getAll).toHaveBeenCalled();
      expect(component.state.appState.users.length).toBe(2);
      expect(component.state.appState.roles.length).toBe(2);
    });

    it('باید گروه‌بندی مجوزها (Permissions Grouping) با تفکیک حساس‌ها به درستی ایجاد شود', () => {
      expect(component.systemPermissionGroups.length).toBeGreaterThan(0);
      const sensitiveGroup = component.systemPermissionGroups.find(g => g.key === 'SENSITIVE');
      expect(sensitiveGroup).toBeDefined();
      expect(sensitiveGroup?.items.some((p: any) => p.codename === 'perm_sys_hard_delete')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. مدیریت تب‌ها (Tabs Switching)
  // ─────────────────────────────────────────────────────────────────
  describe('۲. پیمایش و تغییر تب‌ها (Tabs Navigation)', () => {
    it('باید تغییر تب به نقش‌ها (roles) پارامترهای روت را به‌روز کند', () => {
      component.switchTab('roles');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        queryParams: { tab: 'roles' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    it('باید تغییر تب به کارت‌های پرسنلی (id-cards) پارامتر روت را اعمال کند', () => {
      component.switchTab('id-cards');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        queryParams: { tab: 'id-cards' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    it('باید با دریافت پارامتر tab از کوئری، activeTab به‌روز شود', () => {
      queryParamsSubject.next({ tab: 'roles' });
      expect(component.activeTab).toBe('roles');
      queryParamsSubject.next({ tab: 'id-cards' });
      expect(component.activeTab).toBe('id-cards');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. تب کاربران: فیلترها، جستجو و صفحه‌بندی (Users: Filter, Search, Pagination)
  // ─────────────────────────────────────────────────────────────────
  describe('۳. فیلترها و صفحه‌بندی کاربران (Users Filtering & Pagination)', () => {
    it('باید فیلتر کاربران بر اساس وضعیت (فعال/غیرفعال/کل) به درستی عمل کند', () => {
      component.setStatusFilter('active');
      expect(component.filteredUsers.every((u: any) => u.is_active)).toBe(true);
      expect(component.filteredUsers.length).toBe(1);

      component.setStatusFilter('inactive');
      expect(component.filteredUsers.every((u: any) => !u.is_active)).toBe(true);
      expect(component.filteredUsers.length).toBe(1);

      component.setStatusFilter('all');
      expect(component.filteredUsers.length).toBe(2);
    });

    it('باید فیلتر کاربران بر اساس انبار (Warehouse Filter) لیست را پالایش کند', () => {
      component.userWarehouseFilter = 101;
      expect(component.filteredUsers.every((u: any) => (u.assigned_warehouses || []).includes(101))).toBe(true);
      expect(component.filteredUsers.length).toBe(1);

      component.userWarehouseFilter = 'ALL';
      expect(component.filteredUsers.length).toBe(2);
    });

    it('باید فیلتر کاربران بر اساس نقش (Role Filter) اعمال شود', () => {
      component.userRoleFilter = 10; // admin role
      expect(component.filteredUsers.length).toBe(1);
      expect(component.filteredUsers[0].username).toBe('admin_user');
    });

    it('باید جستجوی متنی کاربر (Search Query) نتایج متناظر را برگرداند', () => {
      component.searchQuery = 'کارگر';
      expect(component.filteredUsers.length).toBe(1);
      expect(component.filteredUsers[0].username).toBe('worker_user');

      component.searchQuery = '0011223344';
      expect(component.filteredUsers.length).toBe(1);
      expect(component.filteredUsers[0].username).toBe('admin_user');
    });

    it('باید محاسبات صفحه‌بندی و تعویض صفحات با goToPage به درستی کار کند', () => {
      component.setPageSize(1);
      expect(component.totalPages).toBe(2);

      component.goToPage(2);
      expect(component.currentPage).toBe(2);

      component.goToPage(99); // Should not exceed totalPages
      expect(component.currentPage).toBe(2);

      component.goToPage(1);
      expect(component.currentPage).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. انتخاب دسته‌جمعی و عملیات گروهی کاربران (Bulk Selection & Actions)
  // ─────────────────────────────────────────────────────────────────
  describe('۴. انتخاب گروهی کاربران (Bulk Operations)', () => {
    it('باید بتوان یک کاربر خاص را انتخاب یا از حالت انتخاب خارج کرد', () => {
      expect(component.isUserSelected(1)).toBe(false);

      component.toggleSelectUser(1);
      expect(component.isUserSelected(1)).toBe(true);
      expect(component.selectedUserIds.size).toBe(1);

      component.toggleSelectUser(1);
      expect(component.isUserSelected(1)).toBe(false);
      expect(component.selectedUserIds.size).toBe(0);
    });

    it('باید انتخاب همه رکوردهای صفحه جاری (Select All Current Page) کار کند', () => {
      component.toggleSelectAllCurrentPage();
      expect(component.isAllCurrentPageSelected()).toBe(true);
      expect(component.selectedUserIds.size).toBe(2);

      component.toggleSelectAllCurrentPage();
      expect(component.selectedUserIds.size).toBe(0);
    });

    it('باید عملیات تغییر وضعیت دسته‌جمعی (Bulk Toggle Status) به صورت امن اجرا شود', () => {
      component.toggleSelectUser(1);
      component.toggleSelectUser(2);

      component.bulkToggleStatus(true);

      // Only inactive user (user 2) will be sent for activation
      expect(mockAccountsHttp.toggleUserStatus).toHaveBeenCalledWith(2, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. فرم مودال ایجاد و ویرایش کاربر (User Modal & Validation)
  // ─────────────────────────────────────────────────────────────────
  describe('۵. ایجاد، ویرایش و اعتبارسنجی کاربر (User Modal & Form)', () => {
    it('باید مودال ثبت کاربر جدید با مقادیر پیش‌فرض باز شود', () => {
      component.openUserModal();
      expect(component.isUserModalOpen).toBe(true);
      expect(component.editingUser).toBeNull();
      expect(component.userForm.username).toBe('');
      expect(component.userForm.is_active).toBe(true);
    });

    it('باید مودال ویرایش کاربر مقادیر کاربر را پر کند', () => {
      component.openUserModal(1);
      expect(component.isUserModalOpen).toBe(true);
      expect(component.editingUser).toBeTruthy();
      expect(component.userForm.username).toBe('admin_user');
      expect(component.userForm.first_name).toBe('مدیر');
    });

    it('باید ثبت کاربر بدون نام یا نام خانوادگی متوقف شده و اخطار دهد', () => {
      component.openUserModal();
      component.userForm.username = 'test_user';
      component.userForm.first_name = '';
      component.userForm.last_name = '';
      component.saveUser();
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('الزامی'));
      expect(mockAccountsHttp.createUser).not.toHaveBeenCalled();
    });

    it('باید ثبت کاربر با شماره موبایل نامعتبر با خطا مواجه شود', () => {
      component.openUserModal();
      component.userForm.username = 'test_user';
      component.userForm.first_name = 'تست';
      component.userForm.last_name = 'تستی';
      component.userForm.phone_number = '02112345678'; // Not mobile
      component.saveUser();
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('همراه'));
      expect(mockAccountsHttp.createUser).not.toHaveBeenCalled();
    });

    it('باید ثبت کاربر جدید با کلمه عبور کمتر از ۶ کاراکتر متوقف شود', () => {
      component.openUserModal();
      component.userForm.username = 'test_user';
      component.userForm.first_name = 'تست';
      component.userForm.last_name = 'تستی';
      component.userForm.phone_number = '09121112233';
      component.userForm.password = '123';
      component.saveUser();
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('کلمه عبور'));
      expect(mockAccountsHttp.createUser).not.toHaveBeenCalled();
    });

    it('باید ثبت کاربر با اطلاعات معتبر با موفقیت ذخیره شود', () => {
      component.openUserModal();
      component.userForm.first_name = 'محمد';
      component.userForm.last_name = 'رضایی';
      component.userForm.username = 'm.rezaei';
      component.userForm.phone_number = '09121112233';
      component.userForm.password = 'Pass@1234';
      component.saveUser();

      expect(mockAccountsHttp.createUser).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
      expect(component.isUserModalOpen).toBe(false);
    });

    it('باید متد resetPassword پس از تایید دیالوگ رمز را ریست کند', async () => {
      await component.resetPassword(2);
      expect(mockConfirmDialog.open).toHaveBeenCalled();
      expect(mockAccountsHttp.adminResetPassword).toHaveBeenCalledWith(2);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('ریست'));
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. تب نقش‌ها: سلسله‌مراتب، مجوزها و اعتبارسنجی حلقه (Roles Tab & Hierarchy)
  // ─────────────────────────────────────────────────────────────────
  describe('۶. تب نقش‌های سازمانی (Roles Tab Management)', () => {
    it('باید زیرتب نقش‌ها پیش‌فرض «نقش‌های انتساب» باشد و به «سامانه‌ای» برود (طرح ۲.۲)', () => {
      expect(component.rolesSubTab).toBe('assignment');
      component.switchRolesSubTab('system');
      expect(component.rolesSubTab).toBe('system');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { roles: 'system' } }));
    });

    it('باید نقش‌های سامانه‌ای فهرست تخت باشند (بدون درخت و ستون والد)', () => {
      expect((component as any).getRoleChildren).toBeUndefined();
      expect((component as any).getSelectableParents).toBeUndefined();
      expect((component as any).roleViewMode).toBeUndefined();
      component.activeTab = 'roles';
      component.rolesSubTab = 'system';
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const section = el.querySelector('[data-testid="system-roles"]')!;
      expect(section).not.toBeNull();
      expect(section.querySelectorAll('[data-testid="system-roles-cards"] [data-role-id]').length).toBe(2);
      expect(section.querySelectorAll('table tbody tr').length).toBe(2);
      const headers = [...section.querySelectorAll('th')].map(th => th.textContent?.trim());
      expect(headers).not.toContain('نقش والد');
      expect(headers.length).toBe(5);
    });

    it('باید زیرتب «نقش‌های انتساب» پنل بسته‌ها را نشان دهد', () => {
      component.activeTab = 'roles';
      component.rolesSubTab = 'assignment';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-role-bundles-panel')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="system-roles"]')).toBeNull();
    });

    it('بدون perm_usr_role (فقط view_sys_users) نقش سامانه‌ای فقط خواندنی است', () => {
      (component as any).isSuperuser = () => false;
      mockAuth.hasPermission.mockImplementation((code: string) => code === 'view_sys_users');
      expect(component.canWriteRoles()).toBe(false);
      component.activeTab = 'roles';
      component.rolesSubTab = 'system';
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-testid="system-roles-readonly"]')).not.toBeNull();
      expect(el.querySelector('[aria-label="ویرایش نقش"]')).toBeNull();
      expect(el.querySelector('[aria-label="حذف نقش"]')).toBeNull();
      component.openRoleModal(10);
      expect(component.isRoleModalOpen).toBe(false);
      component.deleteRole(10);
      expect(component.isDeleteModalOpen).toBe(false);
    });

    it('با perm_usr_role نوشتن نقش سامانه‌ای مجاز است', () => {
      (component as any).isSuperuser = () => false;
      mockAuth.hasPermission.mockImplementation((code: string) => code === 'perm_usr_role');
      expect(component.canWriteRoles()).toBe(true);
      component.openRoleModal(10);
      expect(component.isRoleModalOpen).toBe(true);
    });

    it('«انتخاب همه» و قالب «همه» هرگز مجوز حساس را تیک نمی‌زنند (ت۱۰-۴)', () => {
      component.openRoleModal();
      component.roleForm.permissions = [];
      component.toggleAllPermissions();
      expect(component.roleForm.permissions).not.toContain(4);
      expect(component.roleForm.permissions.length).toBeGreaterThan(0);
      component.applyRolePreset({ id: 'admin_all', title: 'همه', permissionCodenames: 'ALL' });
      expect(component.roleForm.permissions).not.toContain(4);
    });

    it('باید جستجوی نقش‌ها لیست را فیلتر کند', () => {
      component.onRoleSearchChange('سرپرست');
      expect(component.displayedRoles.length).toBe(1);
      expect(component.displayedRoles[0].name).toBe('supervisor');
    });

    it('باید باز کردن مودال نقش جدید فرم را ریست کند', () => {
      component.openRoleModal();
      expect(component.isRoleModalOpen).toBe(true);
      expect(component.editingRole).toBeNull();
      expect(component.roleForm.name).toBe('');
    });

    it('باید ثبت نقش بدون نام یکتا یا عنوان فارسی با خطا متوقف شود', () => {
      component.openRoleModal();
      component.roleForm.name = '';
      component.roleForm.title = '';
      component.saveRole();
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('الزامی'));
      expect(mockAccountsHttp.createRole).not.toHaveBeenCalled();
    });

    it('باید انتخاب رنگ سازمانی نقش فیلد color را تغییر دهد', () => {
      component.setRoleColor('#dc2626');
      expect(component.roleForm.color).toBe('#dc2626');
    });

    it('باید ثبت نقش معتبر با موفقیت به سرور ارسال شود', () => {
      component.openRoleModal();
      component.roleForm.name = 'accountant';
      component.roleForm.title = 'حسابدار رسمی';
      component.roleForm.permissions = [1, 2];
      component.saveRole();

      expect(mockAccountsHttp.createRole).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
      expect(component.isRoleModalOpen).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. اکسپورت و ایمپورت اکسل کاربران و نقش‌ها (Excel Exporters & Templates)
  // ─────────────────────────────────────────────────────────────────
  describe('۷. خروجی و ورودی اکسل (Excel Operations)', () => {
    it('باید متد exportUsersExcel فایل اکسل کاربران را دانلود کند', () => {
      component.exportUsersExcel();
      expect(mockAccountsHttp.exportUsersExcel).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اکسل'));
    });

    it('باید متد exportRolesExcel فایل اکسل نقش‌ها را دانلود کند', () => {
      component.exportRolesExcel();
      expect(mockAccountsHttp.exportRolesExcel).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اکسل'));
    });

    it('باید متد downloadUsersTemplate قالب نمونه اکسل کاربران را فراخوانی کند', () => {
      component.downloadUsersTemplate();
      expect(mockAccountsHttp.downloadUsersTemplate).toHaveBeenCalled();
    });

    it('باید متد downloadRolesTemplate قالب نمونه اکسل نقش‌ها را فراخوانی کند', () => {
      component.downloadRolesTemplate();
      expect(mockAccountsHttp.downloadRolesTemplate).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 8. تفویض عملکرد به ساب‌کامپوننت کارت پرسنلی (ID Cards Delegation)
  // ─────────────────────────────────────────────────────────────────
  describe('۸. ارتباط با کامپوننت کارت پرسنلی (ID Cards Delegation)', () => {
    it('باید متدهای چاپ و پیش‌نمایش در صورت فعال بودن کامپوننت به درستی اجرا شوند', () => {
      const mockIdCards = {
        executeCardPrint: vi.fn(),
        openSheetPreviewModal: vi.fn(),
        openExportModal: vi.fn(),
        printableUsers: [mockUsers[0]],
        isExportingImage: false
      };
      component.idCardsComponent = mockIdCards as any;

      component.printIdCards();
      expect(mockIdCards.executeCardPrint).toHaveBeenCalled();

      component.openIdCardsSheetPreview();
      expect(mockIdCards.openSheetPreviewModal).toHaveBeenCalled();

      component.openIdCardsExportModal();
      expect(mockIdCards.openExportModal).toHaveBeenCalled();

      expect(component.idCardsPrintableCount).toBe(1);
      expect(component.isIdCardsExporting).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 9. اعتبارسنجی تعاملات DOM (DOM Tests)
  // ─────────────────────────────────────────────────────────────────
  describe('۹. تست عناصر DOM و ظاهر صفحه (DOM Elements & Render Testing)', () => {
    it('باید دکمه‌های ۳ تب کاربران، نقش‌ها و کارت پرسنلی در صفحه وجود داشته باشند', () => {
      const tabButtons = fixture.debugElement.queryAll(By.css('button[type="button"]'));
      const buttonTexts = tabButtons.map(b => b.nativeElement.textContent);
      expect(buttonTexts.some((t: string) => t.includes('کاربران') || t.includes('پرسنل'))).toBe(true);
    });

    it('باید تغییر نمای گرید به جدول کلاس‌های مناسب را فعال کند', () => {
      component.setViewMode('table');
      fixture.detectChanges();
      expect(component.userViewMode).toBe('table');
    });

    it('باید کادر تکراری سربرگ بالای صفحه در DOM وجود نداشته باشد', () => {
      fixture.detectChanges();
      const topHeaderH1 = fixture.debugElement.query(By.css('h1'));
      expect(topHeaderH1).toBeNull();
    });

    it('باید ورودی‌های نام کاربری و رمز در مودال دارای autocomplete="new-password" باشند تا مرورگر تکمیل خودکار نکند', () => {
      component.openUserModal();
      component.userModalInnerTab = 'security';
      fixture.detectChanges();
      const usernameInput = fixture.debugElement.query(By.css('input[name="personnel_username"]'));
      const passwordInput = fixture.debugElement.query(By.css('input[name="personnel_password"]'));
      expect(usernameInput).not.toBeNull();
      expect(passwordInput).not.toBeNull();
      expect(usernameInput.nativeElement.getAttribute('autocomplete')).toBe('new-password');
      expect(passwordInput.nativeElement.getAttribute('autocomplete')).toBe('new-password');
      expect(component.userForm.username).toBe('');
      expect(component.userForm.password).toBe('');
      expect(component.showPassword).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 10. اعتبارسنجی نشانگر خودکار سامانه‌های مجاز (Computed Scope Badges)
  // ─────────────────────────────────────────────────────────────────
  describe('۱۰. نشانگر خودکار سامانه‌های مجاز کاربر (Computed Scope Badges)', () => {
    it('باید برای مدیر ارشد (Superuser) نشانگر تمام سامانه‌ها را فعال کند', () => {
      const authSystems = component.getUserAuthorizedSystems({ is_superuser: true });
      expect(authSystems.isSuperuser).toBe(true);
      expect(authSystems.hasWarehouse).toBe(true);
      expect(authSystems.hasFinance).toBe(true);
      expect(authSystems.isEmpty).toBe(false);
      expect(authSystems.badges.some(b => b.key === 'superuser')).toBe(true);
    });

    it('باید برای کاربر دارای نقش انبارداری، نشانگر سامانه انبارداری فعال شود', () => {
      // نقش ۱۱ در mockRoles نقش سرپرست انبار است
      const authSystems = component.getUserAuthorizedSystems({
        is_superuser: false,
        groups: [11],
        assigned_warehouses: [101, 102]
      });
      expect(authSystems.isSuperuser).toBe(false);
      expect(authSystems.hasWarehouse).toBe(true);
      expect(authSystems.warehouseCount).toBe(2);
      expect(authSystems.badges.some(b => b.key === 'warehouse')).toBe(true);
    });

    it('باید برای کاربر دارای نقش مالی، نشانگر سامانه مالی و پرسنلی فعال شود', () => {
      // ایجاد یا شبیه‌سازی نقش مالی در کش
      component.state.appState.roles = [
        ...component.state.appState.roles,
        { id: 99, name: 'accountant_role', title: 'کارشناس مالی و حقوق', color: '#10b981', permissions: [] }
      ];
      const authSystems = component.getUserAuthorizedSystems({
        is_superuser: false,
        groups: [99]
      });
      expect(authSystems.hasFinance).toBe(true);
      expect(authSystems.badges.some(b => b.key === 'finance')).toBe(true);
    });

    it('باید برای کاربر بدون نقش، نشانگر فاقد سامانه (isEmpty) فعال شود', () => {
      const authSystems = component.getUserAuthorizedSystems({
        is_superuser: false,
        groups: []
      });
      expect(authSystems.isEmpty).toBe(true);
      expect(authSystems.badges.length).toBe(0);
    });

    it('باید گتر currentFormAuthorizedSystems در مودال با تغییر نقش‌ها ری‌اکتیو به‌روز شود', () => {
      component.openUserModal();
      expect(component.currentFormAuthorizedSystems.isEmpty).toBe(true);

      // افزودن نقش انبارداری (نقش ۱۱: سرپرست انبار)
      component.userForm.groups = [11];
      expect(component.currentFormAuthorizedSystems.hasWarehouse).toBe(true);

      // فعال‌سازی سوپریوزر
      component.userForm.is_superuser = true;
      expect(component.currentFormAuthorizedSystems.isSuperuser).toBe(true);
      expect(component.currentFormAuthorizedSystems.badges[0].key).toBe('superuser');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 11. مدیریت چندشرکتی کاربران (Multi-Company User Assignment & Warehouses)
  // ─────────────────────────────────────────────────────────────────
  describe('۱۱. مدیریت چندشرکتی کاربران و فیلتر پویای انبارها بر اساس شرکت انتخابی', () => {
    it('باید لیست شرکت‌ها هنگام باز شدن مودال کاربر لود شود', () => {
      component.openUserModal();
      fixture.detectChanges();
      expect(component.availableCompanies.length).toBe(2);
      expect(component.userForm.company_ids).toBeDefined();
    });

    it('باید با کلیک بر روی شرکت، شرکت به company_ids افزوده یا کاسته شود', () => {
      component.openUserModal();
      component.userForm.company_ids = [];
      component.toggleUserCompany(1);
      expect(component.userForm.company_ids).toContain(1);
      expect(component.userForm.default_company_id).toBe(1);

      component.toggleUserCompany(2);
      expect(component.userForm.company_ids).toContain(2);

      component.toggleUserCompany(1);
      expect(component.userForm.company_ids).not.toContain(1);
      expect(component.userForm.default_company_id).toBe(2);
    });

    it('باید انبارها براساس شرکت‌های انتخابی در modalWarehouses فیلتر شوند', () => {
      component.openUserModal();
      component.userForm.company_ids = [1];
      component.updateModalWarehouses();
      expect(component.modalWarehouses.length).toBe(1);
      expect(component.modalWarehouses[0].company).toBe(1);

      component.userForm.company_ids = [1, 2];
      component.updateModalWarehouses();
      expect(component.modalWarehouses.length).toBe(2);
    });

    it('باید در saveUser، مقادیر company_ids و default_company_id ارسال شوند', () => {
      component.openUserModal();
      component.userForm.username = 'new_multitenant_user';
      component.userForm.first_name = 'تست';
      component.userForm.last_name = 'چندشرکتی';
      component.userForm.phone_number = '09121112233';
      component.userForm.password = 'Pass@1234';
      component.userForm.company_ids = [1, 2];
      component.userForm.default_company_id = 1;

      component.saveUser();

      expect(mockAccountsHttp.createUser).toHaveBeenCalled();
      const calledArg = mockAccountsHttp.createUser.mock.calls[0][0];
      expect(calledArg.company_ids).toEqual([1, 2]);
      expect(calledArg.default_company_id).toBe(1);
    });

    it('باید متدهای انتخاب همه و لغو همه انبارها در تب شرکت‌ها و انبارها به درستی کار کنند', () => {
      component.openUserModal();
      component.modalWarehouses = [{ id: 101, name: 'انبار ۱' }, { id: 102, name: 'انبار ۲' }] as any;
      component.selectAllModalWarehouses();
      expect(component.userForm.assigned_warehouses).toContain(101);
      expect(component.userForm.assigned_warehouses).toContain(102);

      component.clearAllModalWarehouses();
      expect(component.userForm.assigned_warehouses).not.toContain(101);
      expect(component.userForm.assigned_warehouses).not.toContain(102);
    });

    it('باید با تغییر شرکت‌ها، انبارهای نامعتبر به صورت خودکار از assigned_warehouses پاک شوند', () => {
      component.openUserModal();
      component.userForm.company_ids = [1, 2];
      component.updateModalWarehouses();
      // انتساب انبار ۱۰۱ (شرکت ۱) و ۱۰۲ (شرکت ۲)
      component.userForm.assigned_warehouses = [101, 102];

      // حذف شرکت ۲ و حفظ فقط شرکت ۱
      component.userForm.company_ids = [1];
      component.updateModalWarehouses();

      expect(component.modalWarehouses.map((w: any) => w.id)).toEqual([101]);
      expect(component.userForm.assigned_warehouses).toEqual([101]);
      expect(component.userForm.assigned_warehouses).not.toContain(102);

      // در صورت لغو همه شرکت‌ها، انبارها خالی می‌شوند
      component.userForm.company_ids = [];
      component.updateModalWarehouses();
      expect(component.modalWarehouses).toEqual([]);
      expect(component.userForm.assigned_warehouses).toEqual([]);
    });

    it('باید متد getUserCompanyBadges برای کاربران چندشرکتی نشان‌های مجزا با مشخص بودن شرکت اصلی برگرداند', () => {
      const multiCompanyUser = {
        id: 99,
        company: 'پاینده توان ساینا',
        company_accesses: [
          { company_id: 1, company_name: 'پاینده توان ساینا', is_default: true },
          { company_id: 2, company_name: 'فارس عالیش', is_default: false }
        ]
      };
      const badges = component.getUserCompanyBadges(multiCompanyUser);
      expect(badges.length).toBe(2);
      expect(badges[0].name).toBe('پاینده توان ساینا');
      expect(badges[0].is_default).toBe(true);
      expect(badges[1].name).toBe('فارس عالیش');
      expect(badges[1].is_default).toBe(false);

      // کاربر تک‌شرکت سنتی بدون company_accesses
      const legacyUser = { id: 98, company: 'فارس عالیش' };
      const legacyBadges = component.getUserCompanyBadges(legacyUser);
      expect(legacyBadges.length).toBe(1);
      expect(legacyBadges[0].name).toBe('فارس عالیش');
      expect(legacyBadges[0].is_default).toBe(true);

      // کاربر بدون شرکت
      const noCompUser = { id: 97 };
      expect(component.getUserCompanyBadges(noCompUser)).toEqual([]);
    });

    it('باید جستجوی کاربران بتواند کاربران را بر اساس نام شرکت‌های موجود در company_accesses نیز پیدا کند', () => {
      component.state.appState.users = [
        {
          id: 10,
          first_name: 'کاربر',
          last_name: 'چندشرکتی',
          username: 'user_multi',
          company: 'پاینده توان ساینا',
          company_accesses: [
            { company_id: 1, company_name: 'پاینده توان ساینا', is_default: true },
            { company_id: 2, company_name: 'فارس عالیش', is_default: false }
          ],
          is_active: true
        }
      ] as any;
      component.searchQuery = 'فارس عالیش';
      const results = component.filteredUsers;
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(10);
    });
  });

  describe('گروه مجوزها و برچسب‌ها از اعلام ماژول‌ها (گام ۷)', () => {
    it('گروه هر ماژول از users.permissionGroup آن ساخته می‌شود و ترتیبش order است', () => {
      const keys = component.systemPermissionGroups.map(g => g.key);
      expect(keys.slice(0, 2)).toEqual(['WH_AUDIT', 'ACCOUNTING_FINANCE']);
      expect(component.systemPermissionGroups.find(g => g.key === 'WH_AUDIT')?.items.map(p => p.codename)).toEqual(['view_wh_dashboard']);
      expect(component.systemPermissionGroups.find(g => g.key === 'ACCOUNTING_FINANCE')?.title).toBe('حسابداری 💳');
    });

    it('نام کوتاه مجوز ماژول از users.shortPermissionNames همان ماژول می‌آید', () => {
      expect(component.getShortPermissionName({ codename: 'view_sys_personnel', name: 'x' })).toBe('مدیریت پرسنل');
      expect(component.getShortPermissionName({ codename: 'view_sys_users', name: 'x' })).toBe('کاربران و نقش‌ها');
    });

    it('با دو ماژول برچسب‌ها از ماژول با priority کمتر می‌آیند', () => {
      expect(component.scopeLabels.companiesTab).toBe('شرکت‌ها و انبارها');
    });

    it('بدون هیچ ماژول، برچسب‌های عمومی پوسته به کار می‌روند', () => {
      activeModuleList = [];
      expect(component.scopeLabels.singular).toBe('محدوده');
    });

    it('راهنمای تنهای مجوز فقط وقتی محدودهٔ تخصیص از ماژول صاحب آن است نشان داده می‌شود', () => {
      usersExtRef['accounting'].standalonePermissionTooltips = { view_sys_personnel: 'راهنمای تنها' };
      usersExtRef['accounting'].permissionGroup.codenames = ['view_sys_personnel'];
      const perm = { codename: 'view_sys_personnel', name: 'نام کامل' };
      expect(component.getPermissionTooltip(perm)).toBe('نام کامل');
      activeModuleList = ['accounting'];
      expect(component.getPermissionTooltip(perm)).toBe('راهنمای تنها');
    });
  });

  describe('Single-Module Isolation Zero-Trace Tests (Phase 4)', () => {
    beforeEach(() => {
      component.systemPermissionGroups = [
        { key: 'WH_AUDIT', title: 'انبار', items: [] },
        { key: 'ACCOUNTING_FINANCE', title: 'مالی', items: [] }
      ];
    });

    afterEach(() => {
      try {
        localStorage.removeItem('wh_installed_modules');
      } catch {}
    });

    it('در حالت تک‌ماژول بدون مالی (فقط انبارداری)، برچسب‌ها از انبار می‌آیند و تب مالی مخفی بماند (L10)', () => {
      activeModuleList = ['warehouse'];
      expect(component.scopeLabels.singular).toBe('انبار');

      component.openUserModal();
      component.setUserModalInnerTab('roles');
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).not.toContain('سامانه مالی و پرسنلی');
      expect(compiled.textContent).toContain('سامانه انبارداری');
    });

    it('در حالت تک‌ماژول بدون انبارداری (فقط مالی)، متون به پروژه تغییر یابند (L11)', () => {
      activeModuleList = ['accounting'];
      expect(component.scopeLabels.singular).toBe('پروژه');

      component.openUserModal();
      component.setUserModalInnerTab('warehouses');
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('شرکت‌ها و پروژه‌ها');
      expect(compiled.textContent).not.toContain('شرکت‌ها و انبارها');
    });
  });
});


