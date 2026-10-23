// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal, Injector, runInInjectionContext } from '@angular/core';
import { of, Subject } from 'rxjs';
import { Layout } from './layout';
import { Login } from '../login/login';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { StateService } from '../../../../core/services/state.service';
import { Router } from '@angular/router';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ModuleRegistryService, getModuleRegistry } from '../../../../core/modules/module-registry.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { CommunicationService } from '../../../../core/services/communication.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { NavigationHistoryService } from '../../../../core/services/navigation-history.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

describe('سناریوی ۱: ورود، خروج و جابه‌جایی بین برنامه‌ها (Login, Logout & App Switching)', () => {
  let mockRouter: any;
  let mockAuth: any;
  let mockToast: any;
  let mockStore: any;
  let mockConfigApi: any;
  let mockWhService: any;
  let mockComm: any;
  let mockWs: any;
  let mockActiveCompany: any;
  let mockCdr: any;

  beforeEach(() => {
    localStorage.clear();

    mockRouter = {
      url: '/login',
      navigate: vi.fn().mockResolvedValue(true),
      navigateByUrl: vi.fn().mockResolvedValue(true),
      events: new Subject<any>()
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      show: vi.fn()
    };

    mockStore = {
      activeWarehouseId: vi.fn().mockReturnValue('1'),
      setCurrentTab: vi.fn(),
      isWarehouseContext: vi.fn().mockReturnValue(false),
      setWarehouseContext: vi.fn(),
      setIsSwitchingWarehouse: vi.fn(),
      sanitizeActiveWarehouse: vi.fn(),
      closeSidebar: vi.fn(),
      openSidebar: vi.fn()
    };

    mockConfigApi = {
      getPublicConfig: () => of({ system_version: '1.0.0' })
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([]))
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    mockComm = {
      isChatDrawerOpen: vi.fn().mockReturnValue(false),
      activeConversation$: { value: null }
    };

    mockWs = {
      notifications$: new Subject<any>()
    };

    mockActiveCompany = {
      activeCompany: vi.fn().mockReturnValue({ id: 2, name: 'شرکت فارس عالیش', has_warehouse_module: true }),
      hasWarehouseModule: true,
      hasCompanyDocumentsAccess: vi.fn().mockReturnValue(false)
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('۱. کاربر فقط مالی (m.bagheri)', () => {
    const FINANCE_PERMS = [
      'perm_approve_personnel_finance',
      'view_sys_fleet_settlement',
      'view_sys_payroll',
      'view_sys_personnel',
      'perm_approve_fleet_finance',
      'can_act_as_accountant'
    ];
    const USER_FINANCE = {
      id: 5,
      username: 'm.bagheri',
      first_name: 'مهدی',
      last_name: 'باقری',
      roles: ['accountant'],
      is_superuser: false
    };

    it('ورود موفق کاربر فقط مالی، ریدایرکت خودکار به سامانه مالی و عدم دسترسی به انبار', async () => {
      mockAuth = {
        login: vi.fn().mockReturnValue(of({ user: USER_FINANCE })),
        logout: vi.fn(),
        user: vi.fn().mockReturnValue(USER_FINANCE),
        userPermissions: vi.fn().mockReturnValue(FINANCE_PERMS),
        userRoleTitles: vi.fn().mockReturnValue(['حسابدار'])
      };

      const loginComp = runInInjectionContext(
        Injector.create({ providers: [{ provide: ActiveCompanyService, useValue: mockActiveCompany }] }),
        () => new Login(
        mockAuth,
        mockRouter,
        mockToast,
        mockCdr,
        mockConfigApi,
        { snapshot: { queryParams: {} } } as any
      ));

      loginComp.username = 'm.bagheri';
      loginComp.password = '1234567';

      await loginComp.handleLogin();

      // هدایت به سامانه مالی
      expect(mockAuth.login).toHaveBeenCalledWith('m.bagheri', '1234567', expect.any(String));
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/finance');
      expect(localStorage.getItem('active_app_module')).toBe('personnel');

      // اعتبارسنجی پرسونای کاربر در سرویس اپلیکییشن
      const personaSvc: any = Object.create(AppPersonaService.prototype);
      personaSvc.auth = mockAuth;
      personaSvc.activeCompanyService = mockActiveCompany;
      personaSvc.moduleRegistry = getModuleRegistry();
      personaSvc.isSuperuser = () => false;

      expect(personaSvc.canAccessApp('accounting')).toBe(true);
      expect(personaSvc.canAccessApp('warehouse')).toBe(false);
    });
  });

  describe('۲. کاربر فقط انبار (test_wh_only)', () => {
    const WAREHOUSE_PERMS = [
      'view_wh_dashboard',
      'view_sys_recounts',
      'view_wh_docs',
      'perm_wh_freeze',
      'can_act_as_wh_manager'
    ];
    const USER_WH = {
      id: 99,
      username: 'test_wh_only',
      first_name: 'کاربر تست',
      last_name: 'انبار',
      roles: ['count_manager'],
      is_superuser: false
    };

    it('ورود موفق کاربر فقط انبار، ریدایرکت مستقیم به داشبورد انبار و عدم دسترسی به مالی', async () => {
      mockAuth = {
        login: vi.fn().mockReturnValue(of({ user: USER_WH })),
        logout: vi.fn(),
        user: vi.fn().mockReturnValue(USER_WH),
        userPermissions: vi.fn().mockReturnValue(WAREHOUSE_PERMS),
        userRoleTitles: vi.fn().mockReturnValue(['مدیر انبار و شمارش'])
      };

      const loginComp = runInInjectionContext(
        Injector.create({ providers: [{ provide: ActiveCompanyService, useValue: mockActiveCompany }] }),
        () => new Login(
        mockAuth,
        mockRouter,
        mockToast,
        mockCdr,
        mockConfigApi,
        { snapshot: { queryParams: {} } } as any
      ));

      loginComp.username = 'test_wh_only';
      loginComp.password = '1234567';

      await loginComp.handleLogin();

      // هدایت مستقیم به داشبورد انبار
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/warehouse/dashboard');
      expect(localStorage.getItem('active_app_module')).toBe('warehouse');

      // اعتبارسنجی پرسونای کاربر در سرویس اپلیکیشن
      const personaSvc: any = Object.create(AppPersonaService.prototype);
      personaSvc.auth = mockAuth;
      personaSvc.activeCompanyService = mockActiveCompany;
      personaSvc.moduleRegistry = getModuleRegistry();
      personaSvc.isSuperuser = () => false;

      expect(personaSvc.canAccessApp('warehouse')).toBe(true);
      expect(personaSvc.canAccessApp('accounting')).toBe(false);
    });
  });

  describe('۳. کاربر دارای هر دو دسترسی (admin)', () => {
    const DUAL_PERMS = ['admin_all'];
    const USER_ADMIN = {
      id: 1,
      username: 'admin',
      first_name: 'مدیر',
      last_name: 'سیستم',
      roles: ['admin_all', 'company_manager'],
      is_superuser: true
    };

    it('ورود کاربر سوپریوزر و امکان جابه‌جایی آزاد بین انبار و مالی با حفظ منوها', async () => {
      mockAuth = {
        login: vi.fn().mockReturnValue(of({ user: USER_ADMIN })),
        logout: vi.fn(),
        user: vi.fn().mockReturnValue(USER_ADMIN),
        userPermissions: vi.fn().mockReturnValue(DUAL_PERMS),
        userRoleTitles: vi.fn().mockReturnValue(['مدیر کل']),
        switchAppScope: vi.fn().mockReturnValue(of({}))
      };

      const loginComp = runInInjectionContext(
        Injector.create({ providers: [{ provide: ActiveCompanyService, useValue: mockActiveCompany }] }),
        () => new Login(
        mockAuth,
        mockRouter,
        mockToast,
        mockCdr,
        mockConfigApi,
        { snapshot: { queryParams: {} } } as any
      ));

      loginComp.username = 'admin';
      loginComp.password = '1234567';

      await loginComp.handleLogin();

      // سوپریوزر به لانچر هدایت می‌شود
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/app/launcher');

      // ایجاد سرویس پرسونا برای کاربر سوپریوزر
      const activeAppSignal = signal<'warehouse' | 'personnel' | 'operations'>('warehouse');
      const personaSvc: any = Object.create(AppPersonaService.prototype);
      personaSvc.activeApp = activeAppSignal;
      personaSvc.sessionTab = { setActiveApp: vi.fn() };
      personaSvc.router = mockRouter;
      personaSvc.auth = mockAuth;
      personaSvc.ws = { switchAppChannel: vi.fn() };
      personaSvc.activeCompanyService = mockActiveCompany;
      personaSvc.moduleRegistry = getModuleRegistry();
      personaSvc.isSuperuser = () => true;
      personaSvc.availableRoles = signal([]);
      personaSvc.switchRole = vi.fn();
      personaSvc.activeRole = signal('manager');
      personaSvc.isGenericModuleApp = () => false;

      expect(personaSvc.canAccessApp('warehouse')).toBe(true);
      expect(personaSvc.canAccessApp('accounting')).toBe(true);
      expect(personaSvc.canAccessApp('operations')).toBe(true);

      // جابه‌جایی به سامانه مالی
      personaSvc.switchApp('personnel');
      expect(personaSvc.activeApp()).toBe('personnel');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/manager-dashboard']);

      // جابه‌جایی مجدد به سامانه انبارداری
      personaSvc.switchApp('warehouse');
      expect(personaSvc.activeApp()).toBe('warehouse');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/dashboard']);
    });

    it('در Layout هنگام فعال بودن سامانه انبار، منوها و سوییچر انبار فعالند', () => {
      const mockPersona: any = {
        activeApp: vi.fn().mockReturnValue('warehouse'),
        isSuperuser: vi.fn().mockReturnValue(true)
      };

      const injector = Injector.create({
        providers: [
          { provide: AuthService, useValue: mockAuth },
          { provide: AuthStore, useValue: mockStore },
          { provide: StateService, useValue: { appState: { projects: [] } } },
          { provide: ConfirmDialogService, useValue: { open: vi.fn() } },
          { provide: Router, useValue: mockRouter },
          { provide: ScopeDirectoryService, useValue: mockWhService },
          { provide: ToastService, useValue: mockToast },
          { provide: ConfigApiService, useValue: mockConfigApi },
          { provide: NavigationHistoryService, useValue: { canGoBack: () => false, canGoForward: () => false } },
          { provide: CommunicationService, useValue: mockComm },
          { provide: WebSocketService, useValue: mockWs },
          { provide: AppPersonaService, useValue: mockPersona },
          { provide: ModuleRegistryService, useValue: getModuleRegistry() },
          { provide: ActiveCompanyService, useValue: mockActiveCompany }
        ]
      });

      let layout: Layout;
      runInInjectionContext(injector, () => {
        layout = new Layout(
          mockAuth,
          mockStore,
          { appState: { projects: [] } } as any,
          { open: vi.fn() } as any,
          mockRouter,
          mockWhService,
          mockCdr,
          mockToast,
          mockConfigApi,
          {} as any,
          { canGoBack: () => false, canGoForward: () => false } as any
        );
      });

      expect(layout!.hasWarehouseSwitcher).toBe(true);
      expect(layout!.deepSyncScopeLabel).toBe('انبار');
      expect(layout!.primaryNavItems().length).toBeGreaterThan(0);

      // خروج از بافت انبار به پروژه‌ها هدایت می‌کند
      layout!.exitWarehouseMode();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/projects']);
    });
  });
});
