// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject } from 'rxjs';
import { Layout } from './layout';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { StateService } from '../../../../core/services/state.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { Router, NavigationEnd } from '@angular/router';
import { ScopeDirectoryService } from '../../../../core/http/scope-directory.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { NavigationHistoryService } from '../../../../core/services/navigation-history.service';
import { CommunicationService } from '../../../../core/services/communication.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';

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

describe('Layout Modular Extension Points & Shell Behavior Tests', () => {
  let component: Layout;
  let mockRegistry: any;
  let mockRouter: any;
  let mockStore: any;
  let mockPersona: any;
  let mockAuth: any;

  beforeEach(() => {
    mockRouter = {
      url: '/app/warehouse/items',
      navigate: vi.fn(),
      events: new Subject<any>()
    };

    mockStore = {
      activeWarehouseId: vi.fn().mockReturnValue('1'),
      setCurrentTab: vi.fn(),
      isWarehouseContext: vi.fn().mockReturnValue(true),
      setWarehouseContext: vi.fn(),
      setIsSwitchingWarehouse: vi.fn(),
      sanitizeActiveWarehouse: vi.fn(),
      closeSidebar: vi.fn(),
      openSidebar: vi.fn()
    };

    mockPersona = {
      activeApp: vi.fn().mockReturnValue('warehouse'),
      isSuperuser: vi.fn().mockReturnValue(false)
    };

    mockRegistry = {
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getSpec: vi.fn().mockImplementation((code: string) => {
        if (code === 'warehouse') return { code: 'warehouse', routePrefix: '/app/warehouse' };
        if (code === 'accounting' || code === 'personnel') return { code: 'accounting', routePrefix: '/app/finance' };
        if (code === 'operations') return { code: 'operations', routePrefix: '/app/operations' };
        return undefined;
      }),
      getInstalledModules: vi.fn().mockImplementation(() => [
        {
          code: 'accounting',
          routePrefix: '/app/finance',
          extensions: {
            layoutNav: {
              showWarehouseSwitcher: false,
              defaultExitRoute: '/app/finance',
              roleMenus: []
            }
          }
        },
        {
          code: 'warehouse',
          routePrefix: '/app/warehouse',
          extensions: {
            layoutNav: {
              showWarehouseSwitcher: true,
              defaultExitRoute: '/app/warehouse/projects',
              primaryItems: [
                { id: 'dashboard', label: 'داشبورد', icon: 'grid', permission: 'view_wh_dashboard' }
              ],
              contextItems: [
                { id: 'items', label: 'کالاها', icon: 'package', permission: 'view_wh_dashboard' }
              ]
            }
          }
        }
      ]),
      getExtensions: vi.fn().mockImplementation((extKey: string) => {
        if (extKey === 'layoutNav') {
          // همان ترتیب واقعی INSTALLED_MODULES (الفبایی: accounting پیش از warehouse)
          return [
            {
              moduleCode: 'accounting',
              extension: {
                showWarehouseSwitcher: false,
                defaultExitRoute: '/app/finance',
                hasCompanyDocumentsArchive: true,
                extraRouteTabs: ['companies', 'company-documents', 'documents']
              }
            },
            {
              moduleCode: 'warehouse',
              extension: {
                showWarehouseSwitcher: true,
                defaultExitRoute: '/app/warehouse/projects',
                primaryItems: [
                  { id: 'dashboard', label: 'داشبورد', icon: 'grid', permission: 'view_wh_dashboard' }
                ],
                contextItems: [
                  { id: 'items', label: 'کالاها', icon: 'package', permission: 'view_wh_dashboard' }
                ]
              }
            }
          ];
        }
        return [];
      })
    };

    mockAuth = {
      user: () => ({ id: 1, username: 'admin' }),
      userPermissions: () => ['admin_all', 'manage_warehouse', 'view_reports'],
      userRoleTitles: () => ['مدیر سیستم']
    };

    const mockState: any = {
      appState: { projects: [], activeWarehouseId: '1' }
    };

    const mockWhService: any = {
      getAll: vi.fn().mockReturnValue(of([]))
    };

    const mockCdr: any = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    const mockComm: any = {
      isChatDrawerOpen: vi.fn().mockReturnValue(false),
      activeConversation$: { value: null }
    };

    const mockWs: any = {
      notifications$: new Subject<any>()
    };

    const mockActiveCompany: any = {
      activeCompany: vi.fn().mockReturnValue({ id: 1, name: 'شرکت اصلی', has_warehouse_module: true })
    };

    const injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: AuthStore, useValue: mockStore },
        { provide: StateService, useValue: mockState },
        { provide: ConfirmDialogService, useValue: { open: vi.fn() } },
        { provide: Router, useValue: mockRouter },
        { provide: ScopeDirectoryService, useValue: mockWhService },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ConfigApiService, useValue: { getPublicConfig: () => of({}) } },
        { provide: AccountsHttpService, useValue: {} },
        { provide: NavigationHistoryService, useValue: { canGoBack: () => false, canGoForward: () => false } },
        { provide: CommunicationService, useValue: mockComm },
        { provide: WebSocketService, useValue: mockWs },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: ModuleRegistryService, useValue: mockRegistry },
        { provide: ActiveCompanyService, useValue: mockActiveCompany }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new Layout(
        mockAuth,
        mockStore,
        mockState,
        { open: vi.fn() } as any,
        mockRouter,
        mockWhService,
        mockCdr,
        { show: vi.fn() } as any,
        { getPublicConfig: () => of({}) } as any,
        {} as any,
        { canGoBack: () => false, canGoForward: () => false } as any
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('حالت ۱: هر دو ماژول فعال — سوییچر انبار فعال و برچسب دیپ‌سینک «انبار» است', () => {
    expect(component.hasWarehouseSwitcher).toBe(true);
    expect(component.deepSyncScopeLabel).toBe('انبار');
    expect(component.primaryNavItems().length).toBeGreaterThan(0);
  });

  it('حالت ۱: هر دو ماژول فعال — خروج از بافت انبار به پروژه‌های انبار می‌رود، نه مالی', () => {
    component.exitWarehouseMode();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/projects']);
  });

  it('حالت ۲: فقط ماژول انبار فعال — خروج از بافت انبار به مسیر اختصاصی انبار ریدایرکت می‌کند', () => {
    mockRegistry.getExtensions.mockImplementation((extKey: string) => {
      if (extKey === 'layoutNav') {
        return [
          {
            moduleCode: 'warehouse',
            extension: {
              showWarehouseSwitcher: true,
              defaultExitRoute: '/app/warehouse/projects'
            }
          }
        ];
      }
      return [];
    });

    expect(component.hasWarehouseSwitcher).toBe(true);
    expect(component.deepSyncScopeLabel).toBe('انبار');

    component.exitWarehouseMode();
    expect(mockStore.setWarehouseContext).toHaveBeenCalledWith(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/projects']);
  });

  it('حالت ۳: فقط ماژول مالی فعال — سوییچر انبار مخفی، برچسب دیپ‌سینک «پروژه / کارگاه» و خروج به /app/finance', () => {
    mockRegistry.getExtensions.mockImplementation((extKey: string) => {
      if (extKey === 'layoutNav') {
        return [
          {
            moduleCode: 'accounting',
            extension: {
              showWarehouseSwitcher: false,
              defaultExitRoute: '/app/finance'
            }
          }
        ];
      }
      return [];
    });

    expect(component.hasWarehouseSwitcher).toBe(false);
    expect(component.deepSyncScopeLabel).toBe('پروژه / کارگاه');
    expect(component.primaryNavItems()).toEqual([]);

    component.exitWarehouseMode();
    expect(mockStore.setWarehouseContext).toHaveBeenCalledWith(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance']);
  });

  it('مسیرهای امروز انبار و مالی (از جمله audit و health در هر persona) عوض نمی‌شوند', () => {
    // مسیرهای عمومی انبار
    component.switchTab('dashboard');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/dashboard']);

    component.switchTab('items');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/items']);

    // مسیرهای مالی و ریدایرکت شرکت‌ها
    component.switchTab('companies');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/companies']);

    component.switchTab('company-documents');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/company-documents']);

    // شناسه مشترک audit در پرسونای انبار
    mockPersona.activeApp.mockReturnValue('warehouse');
    component.switchTab('audit');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/audit']);

    // شناسه مشترک audit در پرسونای مالی
    mockPersona.activeApp.mockReturnValue('personnel');
    component.switchTab('audit');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/audit']);

    // شناسه مشترک health در پرسونای انبار
    mockPersona.activeApp.mockReturnValue('warehouse');
    component.switchTab('health');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/health']);

    // شناسه مشترک health در پرسونای مالی
    mockPersona.activeApp.mockReturnValue('personnel');
    component.switchTab('health');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/health']);
  });

  it('ماژول ساختگی سوم sample با routePrefix برابر /app/sample — آیتم سایدبار به مسیر ماژول می‌رود', () => {
    const SAMPLE_MODULE: any = {
      code: 'sample',
      titleFa: 'ماژول نمونه',
      routePrefix: '/app/sample',
      extensions: {
        layoutNav: {
          primaryItems: [
            { id: 'sample-overview', label: 'نمای کلی نمونه', icon: 'box', permission: 'view_sample' },
            { id: 'custom-path', label: 'مسیر اختصاصی', icon: 'box', permission: 'view_sample', route: '/app/sample/custom-page' }
          ],
          showWarehouseSwitcher: false,
          defaultExitRoute: '/app/sample'
        }
      }
    };

    mockRegistry.getInstalledModules.mockReturnValue([
      {
        code: 'warehouse',
        routePrefix: '/app/warehouse',
        extensions: {
          layoutNav: { showWarehouseSwitcher: true, defaultExitRoute: '/app/warehouse/projects' }
        }
      },
      SAMPLE_MODULE
    ]);

    mockRegistry.getExtensions.mockImplementation((extKey: string) => {
      if (extKey === 'layoutNav') {
        return [
          {
            moduleCode: 'sample',
            module: SAMPLE_MODULE,
            extension: SAMPLE_MODULE.extensions.layoutNav
          }
        ];
      }
      return [];
    });

    // خارج از بافت انبار: بخش «سامانه‌های دیگر» فعال می‌شود
    mockStore.isWarehouseContext.mockReturnValue(false);

    const sections = component.otherModuleNavSections();
    expect(sections.length).toBe(1);
    expect(sections[0].module.code).toBe('sample');
    expect(sections[0].items.length).toBe(2);
    expect(component.otherModuleTotalItemsCount).toBe(2);

    // ناوبری بر اساس prefix و id
    component.switchTab('sample-overview');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/sample/sample-overview']);

    // ناوبری با فیلد اختیاری route
    component.switchTab('custom-path');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/sample/custom-page']);
  });

  it('ماژول sample که در ترتیب الفبایی پیش از warehouse است، منوی اصلی و بافت انبار را نمی‌گیرد و شناسهٔ هم‌نامش به مسیر خودش می‌رود', () => {
    const SAMPLE_NAV = {
      showWarehouseSwitcher: false,
      primaryItems: [{ id: 'dashboard', label: 'داشبورد نمونه', icon: 'box', permission: 'view_sample' }],
      contextItems: [{ id: 'dashboard', label: 'داشبورد نمونه', icon: 'box', permission: 'view_sample' }]
    };
    const WAREHOUSE_NAV = {
      showWarehouseSwitcher: true,
      defaultExitRoute: '/app/warehouse/projects',
      primaryItems: [{ id: 'dashboard', label: 'داشبورد', icon: 'grid', permission: 'view_wh_dashboard' }],
      contextItems: [{ id: 'items', label: 'کالاها', icon: 'package', permission: 'view_wh_dashboard' }]
    };
    mockRegistry.getExtensions.mockImplementation((extKey: string) => extKey === 'layoutNav'
      ? [
          { moduleCode: 'accounting', extension: { showWarehouseSwitcher: false, defaultExitRoute: '/app/finance' } },
          { moduleCode: 'sample', extension: SAMPLE_NAV },
          { moduleCode: 'warehouse', extension: WAREHOUSE_NAV }
        ]
      : []);
    mockRegistry.getSpec.mockImplementation((code: string) => {
      if (code === 'sample') return { code: 'sample', titleFa: 'ماژول نمونه', routePrefix: '/app/sample' };
      if (code === 'warehouse') return { code: 'warehouse', routePrefix: '/app/warehouse' };
      return undefined;
    });

    expect((component as any).systemNavItems).toBe(WAREHOUSE_NAV.primaryItems);
    expect((component as any).warehouseNavItems).toBe(WAREHOUSE_NAV.contextItems);

    component.openModuleNavItem('sample', SAMPLE_NAV.primaryItems[0] as any);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/sample/dashboard']);
  });

  describe('پیوند بایگانی اسناد شرکت‌ها (company-documents) بر اساس نقطه توسعه hasCompanyDocumentsArchive', () => {
    it('در نسخه کامل برای سوپریوزر پیوند بایگانی اسناد شرکت‌ها (company-documents) فعال و قابل مشاهده است', () => {
      mockAuth.user = () => ({ id: 1, username: 'admin', is_superuser: true });
      mockPersona.isSuperuser.mockReturnValue(true);
      mockStore.isWarehouseContext.mockReturnValue(false);

      expect(component.isCompanyDocumentsArchiveSupported).toBe(true);
      expect(component.hasCompanyDocumentsAccess).toBe(true);
    });

    it('در نسخه فقط‌انبار حتی برای سوپریوزر پیوند بایگانی اسناد شرکت‌ها (company-documents) پنهان است', () => {
      mockAuth.user = () => ({ id: 1, username: 'admin', is_superuser: true });
      mockPersona.isSuperuser.mockReturnValue(true);
      mockStore.isWarehouseContext.mockReturnValue(false);

      // شبیه‌سازی نسخه فقط‌انبار بدون ماژول حسابداری
      mockRegistry.getExtensions.mockImplementation((extKey: string) => {
        if (extKey === 'layoutNav') {
          return [
            {
              moduleCode: 'warehouse',
              extension: {
                showWarehouseSwitcher: true,
                defaultExitRoute: '/app/warehouse/projects'
              }
            }
          ];
        }
        return [];
      });

      expect(component.isCompanyDocumentsArchiveSupported).toBe(false);
      expect(component.hasCompanyDocumentsAccess).toBe(false);
    });
  });
});


