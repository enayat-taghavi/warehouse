// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject } from 'rxjs';
import { Layout } from './layout';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { StateService } from '../../../../services/state.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { Router, NavigationEnd } from '@angular/router';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
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
      sanitizeActiveWarehouse: vi.fn()
    };

    mockPersona = {
      activeApp: vi.fn().mockReturnValue('warehouse'),
      isSuperuser: vi.fn().mockReturnValue(false)
    };

    mockRegistry = {
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getExtensions: vi.fn().mockImplementation((extKey: string) => {
        if (extKey === 'layoutNav') {
          return [
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
            },
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
      })
    };

    const mockAuth: any = {
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
        { provide: WarehouseHttpService, useValue: mockWhService },
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
});
