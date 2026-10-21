// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import { of, firstValueFrom } from 'rxjs';
import { UserMenuComponent } from './user-menu.component';
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
import { Router } from '@angular/router';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { AppPersonaService } from '../../../core/services/app-persona.service';
import { ApiService } from '../../../core/api/api.service';

describe('UserMenuComponent Deep Sync Logic & Behavior Tests', () => {
  let component: UserMenuComponent;

  let mockAuth: any;
  let mockStore: any;
  let mockState: any;
  let mockAccountsService: any;
  let mockWhService: any;
  let mockModuleRegistry: any;
  let mockToast: any;
  let mockConfirmDialog: any;
  let mockPwaUpdate: any;
  let mockPwaInstall: any;
  let mockRouter: any;
  let mockSyncService: any;
  let mockCdr: any;
  let mockPersona: any;
  let mockApi: any;

  beforeEach(() => {
    mockAuth = {
      currentUser: () => ({ id: 1, full_name: 'مدیر سیستم', username: 'admin' }),
      logout: vi.fn()
    };

    mockStore = {
      activeWarehouseId: vi.fn().mockReturnValue('1'),
      user: () => ({ id: 1, full_name: 'مدیر سیستم', role: 'admin' })
    };

    mockState = {
      appState: {
        projects: [
          { id: 1, name: 'انبار مرکزی' },
          { id: 2, name: 'انبار ثانویه' }
        ]
      }
    };

    mockAccountsService = {
      updateMyAvatar: vi.fn(),
      deleteMyAvatar: vi.fn()
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([
        { id: 1, name: 'انبار مرکزی' },
        { id: 2, name: 'انبار ثانویه' }
      ]))
    };

    mockApi = {
      get: vi.fn().mockImplementation((endpoint: string, params: any) => {
        if (endpoint === '/personnel/financial-projects') {
          return of([
            { id: 10, name: 'پروژه خط ۲ مترو', code: 'PRJ-10', is_active: true },
            { id: 11, name: 'کارگاه ساختمانی سپهر', code: 'PRJ-11', is_active: true }
          ]);
        }
        return of([]);
      })
    };

    mockPersona = {
      activeApp: vi.fn().mockReturnValue('warehouse')
    };

    mockModuleRegistry = {
      isModuleInstalled: vi.fn().mockImplementation((m: string) => m === 'warehouse' || m === 'personnel' || m === 'accounting'),
      getExtensions: vi.fn().mockImplementation((extKey: string) => {
        if (extKey === 'userMenu') {
          return [
            {
              moduleCode: 'warehouse',
              extension: {
                shortcutsCategory: { id: 'counting', label: 'انبارگردانی و اسکنر', count: 5 },
                deepSyncScope: 'warehouse',
                deepSync: {
                  scope: 'warehouse', order: 10, tabLabel: 'انبارداری', icon: 'package',
                  sectionTitle: 'لیست انبارها', opsSectionTitle: 'انبارهای فعال سازمان',
                  bannerTitle: 'انتخاب انبارهای هدف', bannerDescription: '', emptyText: '',
                  selectAllLabel: 'انتخاب همه انبارها', clearAllLabel: 'لغو انتخاب انبارها',
                  itemLabel: 'انبار', summaryLabel: '📦 انبارداری', accent: 'indigo',
                  initialItems: (inj: Injector) => inj.get(StateService).appState.projects || [],
                  preselectId: (inj: Injector) => {
                    const id = inj.get(AuthStore).activeWarehouseId();
                    return id && id !== 'ALL' ? Number(id) : null;
                  },
                  loadItems: async (inj: Injector) => (await firstValueFrom(inj.get(ScopeDirectoryService).getAll())) || []
                }
              }
            },
            {
              moduleCode: 'accounting',
              extension: {
                deepSyncScope: 'finance',
                deepSync: {
                  scope: 'finance', order: 20, tabLabel: 'مالی و پرسنلی', icon: 'credit-card',
                  sectionTitle: 'لیست پروژه‌ها / کارگاه‌ها', opsSectionTitle: 'پروژه‌ها و کارگاه‌های مالی',
                  bannerTitle: 'انتخاب پروژه‌ها و کارگاه‌های هدف', bannerDescription: '', emptyText: '',
                  selectAllLabel: 'انتخاب همه پروژه‌ها', clearAllLabel: 'لغو انتخاب پروژه‌ها',
                  itemLabel: 'پروژه / کارگاه', summaryLabel: '💳 مالی', accent: 'emerald',
                  loadItems: async (inj: Injector) =>
                    (await firstValueFrom(inj.get(ApiService).get<any[]>('/personnel/financial-projects', { is_active: true }))) || []
                }
              }
            }
          ];
        }
        if (extKey === 'projectLookup') {
          return [
            {
              moduleCode: 'accounting',
              extension: {
                financialProjectsEndpoint: '/personnel/financial-projects'
              }
            }
          ];
        }
        return [];
      })
    };

    mockToast = {
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockPwaUpdate = {
      isChecking: vi.fn().mockReturnValue(false),
      checkForUpdateManually: vi.fn()
    };

    mockPwaInstall = {
      deferredPrompt: vi.fn().mockReturnValue(null),
      isInstalled: vi.fn().mockReturnValue(false),
      isIos: vi.fn().mockReturnValue(false),
      canInstall: vi.fn().mockReturnValue(false),
      installApp: vi.fn().mockResolvedValue(undefined)
    };

    mockRouter = {
      url: '/app/warehouse/items',
      navigate: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    mockSyncService = {
      performDeepUpdate: vi.fn().mockResolvedValue([
        { warehouseName: 'انبار مرکزی', records: 45, bytes: 10240 }
      ])
    };
    vi.spyOn(OfflineSyncService, 'getInstance').mockReturnValue(mockSyncService);

    try {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload: vi.fn() }
      });
    } catch {}

    const injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: AuthStore, useValue: mockStore },
        { provide: StateService, useValue: mockState },
        { provide: AccountsHttpService, useValue: mockAccountsService },
        { provide: ScopeDirectoryService, useValue: mockWhService },
        { provide: ModuleRegistryService, useValue: mockModuleRegistry },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: PwaUpdateService, useValue: mockPwaUpdate },
        { provide: PwaInstallService, useValue: mockPwaInstall },
        { provide: Router, useValue: mockRouter },
        { provide: ChangeDetectorRef, useValue: mockCdr },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: ApiService, useValue: mockApi }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new UserMenuComponent();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should instantiate successfully with default closed state', () => {
    expect(component).toBeTruthy();
    expect(component.isDeepSyncModalOpen).toBe(false);
  });

  it('should prevent deep update and show toast if user is offline', async () => {
    component.isOffline = true;
    await component.onDeepUpdate();

    expect(mockToast.show).toHaveBeenCalledWith('error', 'برای بروزرسانی عمیق باید به اینترنت متصل باشید.');
    expect(component.isDeepSyncModalOpen).toBe(false);
  });

  it('should prevent deep update and show toast if there are pending unsynced changes', async () => {
    component.isOffline = false;
    component.pendingCount = 3;
    await component.onDeepUpdate();

    expect(mockToast.show).toHaveBeenCalledWith(
      'error',
      'ابتدا باید تغییرات ذخیره‌نشده خود را همگام‌سازی (Sync) کنید تا از دست نروند.'
    );
    expect(component.isDeepSyncModalOpen).toBe(false);
  });

  it('should detect warehouse context mode from warehouse URL and load warehouses', async () => {
    mockRouter.url = '/app/warehouse/counting';
    expect(component.currentScopeContext).toBe('warehouse');

    component.isOffline = false;
    component.pendingCount = 0;
    await component.onDeepUpdate();

    expect(component.isDeepSyncModalOpen).toBe(true);
    expect(component.deepSyncWarehouses.length).toBe(2);
    expect(component.deepSyncProjects.length).toBe(0);
    expect(component.deepSyncPreselectWarehouseId).toBe(1);
  });

  it('should detect finance context mode from finance URL and load financial projects', async () => {
    mockRouter.url = '/app/finance/cartable';
    expect(component.currentScopeContext).toBe('finance');

    component.isOffline = false;
    component.pendingCount = 0;
    await component.onDeepUpdate();

    expect(component.isDeepSyncModalOpen).toBe(true);
    expect(component.deepSyncWarehouses.length).toBe(0);
    expect(component.deepSyncProjects.length).toBe(2);
    expect(mockApi.get).toHaveBeenCalledWith('/personnel/financial-projects', { is_active: true });
  });

  it('should detect operations context mode from operations URL and load both warehouses and projects', async () => {
    mockRouter.url = '/app/operations/governance';
    expect(component.currentScopeContext).toBe('operations');

    component.isOffline = false;
    component.pendingCount = 0;
    await component.onDeepUpdate();

    expect(component.isDeepSyncModalOpen).toBe(true);
    expect(component.deepSyncWarehouses.length).toBe(2);
    expect(component.deepSyncProjects.length).toBe(2);
    expect(mockWhService.getAll).toHaveBeenCalled();
    expect(mockApi.get).toHaveBeenCalledWith('/personnel/financial-projects', { is_active: true });
  });

  it('should pass scopeKind = "warehouse" when syncing warehouseIds', async () => {
    mockRouter.url = '/app/warehouse';
    component.deepSyncWarehouses = [{ id: 1, name: 'انبار مرکزی' }];

    await component.startDeepSync([1]);

    expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith(
      [1],
      { 1: 'انبار مرکزی' },
      'warehouse'
    );
    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'گزارش بروزرسانی عمیق',
        confirmText: 'بارگذاری مجدد و اعمال',
        cancelText: 'ادامه در همین صفحه',
        showCancel: true
      })
    );
  });

  it('should pass scopeKind = "finance" when syncing in finance context', async () => {
    mockRouter.url = '/app/finance';
    component.deepSyncProjects = [{ id: 10, name: 'پروژه مترو' }];
    mockSyncService.performDeepUpdate.mockResolvedValue([
      { warehouseName: 'پروژه مترو', records: 20, bytes: 5000 }
    ]);

    await component.startDeepSync([10]);

    expect(mockSyncService.performDeepUpdate).toHaveBeenCalledWith(
      [10],
      { 10: 'پروژه مترو' },
      'finance'
    );

    const dialogArg = mockConfirmDialog.open.mock.calls[0][0];
    expect(dialogArg.message).toContain('پروژه / کارگاه');
    expect(dialogArg.message).toContain('پروژه مترو');
  });

  it('should execute dual-scope deep sync and aggregate report in operations mode', async () => {
    mockRouter.url = '/app/operations';
    component.deepSyncWarehouses = [{ id: 1, name: 'انبار مرکزی' }];
    component.deepSyncProjects = [{ id: 10, name: 'پروژه کارگاه شمال' }];

    mockSyncService.performDeepUpdate
      .mockResolvedValueOnce([
        { warehouseName: 'انبار مرکزی', records: 50, bytes: 10000 }
      ])
      .mockResolvedValueOnce([
        { warehouseName: 'پروژه کارگاه شمال', records: 25, bytes: 5000 }
      ]);

    await component.startDeepSync({ warehouseIds: [1], projectIds: [10] });

    expect(mockSyncService.performDeepUpdate).toHaveBeenNthCalledWith(
      1,
      [1],
      { 1: 'انبار مرکزی' },
      'warehouse'
    );
    expect(mockSyncService.performDeepUpdate).toHaveBeenNthCalledWith(
      2,
      [10],
      { 10: 'پروژه کارگاه شمال' },
      'finance'
    );

    const dialogArg = mockConfirmDialog.open.mock.calls[0][0];
    expect(dialogArg.title).toBe('گزارش بروزرسانی یکپارچه سازمان');
    expect(dialogArg.message).toContain('📦 انبارداری');
    expect(dialogArg.message).toContain('💳 مالی');
    expect(dialogArg.message).toContain('مجموع کل');
    expect(dialogArg.message).toContain('75'); // 50 + 25
  });

  it('should sanitize names in the deep sync summary HTML to prevent XSS', async () => {
    mockRouter.url = '/app/warehouse';
    component.deepSyncWarehouses = [{ id: 1, name: '<script>alert("xss")</script>' }];
    mockSyncService.performDeepUpdate.mockResolvedValue([
      { warehouseName: '<script>alert("xss")</script>', records: 10, bytes: 2048 }
    ]);

    await component.startDeepSync([1]);

    const dialogArg = mockConfirmDialog.open.mock.calls[0][0];
    expect(dialogArg.message).not.toContain('<script>');
    expect(dialogArg.message).toContain('&lt;script&gt;');
  });

  it('باید با فراخوانی onInstallApp متد installApp از سرویس PwaInstallService صدا زده شود', async () => {
    await component.onInstallApp();
    expect(mockPwaInstall.installApp).toHaveBeenCalled();
  });

  it('باید نام عمومی سامانه را از BRANDING.systemName در دسترس قرار دهد (L13)', () => {
    expect(component.BRANDING.systemName).toBeDefined();
    expect(component.BRANDING.systemName.length).toBeGreaterThan(0);
  });

  describe('Modular Extension Points & Configuration Behavior', () => {
    it('حالت ۱: هر دو ماژول فعال — دسته‌بندی انبارگردانی در کلیدها و قابلیت دیپ‌سینک انبار فعال است', () => {
      expect(component.isWarehouseInstalled).toBe(true);
      expect(component.shortcutsCategories.some(c => c.id === 'counting')).toBe(true);
      expect(component.shortcutsCategories.length).toBe(5);
      expect(component.allShortcuts.length).toBe(20);
    });

    it('حالت ۲: فقط ماژول انبار فعال — دسته‌بندی انبارگردانی فعال است', () => {
      mockModuleRegistry.getExtensions.mockImplementation((extKey: string) => {
        if (extKey === 'userMenu') {
          return [
            {
              moduleCode: 'warehouse',
              extension: {
                shortcutsCategory: { id: 'counting', label: 'انبارگردانی و اسکنر', count: 5 },
                allowWarehouseDeepSync: true
              }
            }
          ];
        }
        return [];
      });

      expect(component.isWarehouseInstalled).toBe(true);
      expect(component.shortcutsCategories.some(c => c.id === 'counting')).toBe(true);
      expect(component.shortcutsCategories.find(c => c.id === 'all')?.count).toBe(20);
      expect(component.allShortcuts.length).toBe(20);
    });

    it('حالت ۳: فقط ماژول مالی فعال — دسته‌بندی انبارگردانی وجود ندارد و تعداد کلیدها به ۱۵ کاهش می‌یابد', () => {
      mockModuleRegistry.getExtensions.mockReturnValue([]);

      expect(component.isWarehouseInstalled).toBe(false);
      expect(component.shortcutsCategories.some(c => c.id === 'counting')).toBe(false);
      expect(component.shortcutsCategories.length).toBe(4);
      expect(component.shortcutsCategories.find(c => c.id === 'all')?.count).toBe(15);
      expect(component.allShortcuts.length).toBe(15);
    });

    it('شمارنده «همه کلیدها» به صورت پویا از مجموع دسته‌ها محاسبه می‌شود و عدد ثابت نیست', () => {
      mockModuleRegistry.getExtensions.mockReturnValue([]);
      const allCat = component.shortcutsCategories.find(c => c.id === 'all');
      const otherCats = component.shortcutsCategories.filter(c => c.id !== 'all');
      const expectedTotal = otherCats.reduce((sum, c) => sum + (c.count || 0), 0);
      expect(allCat?.count).toBe(expectedTotal);
      expect(allCat?.count).toBe(15);
    });
  });

  describe('currentScopeContext URL-based Routing Characterization', () => {
    const scopeRouteCases: Array<{ url: string; expected: string }> = [
      { url: '/app/finance/x', expected: 'finance' },
      { url: '/app/personnel/x', expected: 'finance' },
      { url: '/app/payroll/x', expected: 'finance' },
      { url: '/app/treasury/x', expected: 'finance' },
      { url: '/app/projects/x', expected: 'finance' },
      { url: '/app/warehouse/x', expected: 'warehouse' },
      { url: '/app/inventory/x', expected: 'warehouse' },
      { url: '/app/counting/x', expected: 'warehouse' },
      { url: '/app/items/x', expected: 'warehouse' },
      { url: '/app/tag-templates/x', expected: 'warehouse' },
      { url: '/app/operations/x', expected: 'operations' },
    ];

    for (const { url, expected } of scopeRouteCases) {
      it(`resolves router URL ${url} to '${expected}'`, () => {
        mockRouter.url = url;
        expect(component.currentScopeContext).toBe(expected);
      });
    }
  });
});

