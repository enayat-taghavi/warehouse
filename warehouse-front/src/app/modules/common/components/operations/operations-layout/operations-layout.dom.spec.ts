// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { OperationsLayoutComponent } from './operations-layout';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { SystemHealthService } from '../../../../../core/services/system-health.service';
import { NavigationHistoryService } from '../../../../../core/services/navigation-history.service';
import { CommunicationService } from '../../../../../core/services/communication.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';

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

describe('OperationsLayoutComponent DOM & Modular Navigation Tests', () => {
  let component: OperationsLayoutComponent;
  let injector: Injector;
  let mockRegistry: any;
  let mockRouter: any;
  let mockAuth: any;
  let mockPersona: any;
  let mockHealth: any;
  let mockComm: any;
  let mockActiveCompany: any;
  let activeModuleCodes: string[];

  beforeEach(() => {
    mockRouter = {
      navigate: vi.fn(),
      url: '/app/operations/cockpit',
      events: of()
    };

    mockAuth = {
      isLoggedIn: () => true,
      userName: () => 'مدیر سامانه',
      user: () => ({ username: 'admin', is_superuser: true, roles: ['superuser'] }),
      userRoleTitles: () => ['مدیر ارشد'],
      isSuperuser: () => true,
      userPermissions: () => ['admin_all']
    };

    mockPersona = {
      isSuperuser: () => true,
      activePersonaRole: () => 'superuser',
      activeApp: () => 'operations'
    };

    mockHealth = {
      healthScore$: of(100),
      isDiagnosing$: of(false)
    };

    mockComm = {
      isChatEnabled: () => false,
      totalUnreadCount: () => 0,
      hasNewIncomingPulse: () => false,
      isChatDrawerOpen: Object.assign(vi.fn().mockReturnValue(false), { set: vi.fn() }),
      hasNewIncomingPulseSignal: Object.assign(vi.fn().mockReturnValue(false), { set: vi.fn() }),
      activeConversation$: { value: null },
      closeActiveConversation: vi.fn(),
      markAsRead: vi.fn()
    };

    mockActiveCompany = {
      activeCompany: { id: 1, name: 'شرکت اصلی', has_warehouse_module: true },
      hasWarehouseModuleSignal: vi.fn().mockReturnValue(true),
      availableCompanies: [{ id: 1, name: 'شرکت اصلی' }],
      availableCompanies$: of([{ id: 1, name: 'شرکت اصلی' }]),
      loadAvailableCompanies: vi.fn().mockReturnValue(of([]))
    };

    activeModuleCodes = ['warehouse', 'accounting'];

    mockRegistry = {
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'operations') {
          const list: any[] = [];
          if (activeModuleCodes.includes('warehouse')) {
            list.push({
              moduleCode: 'warehouse',
              extension: {
                quickLink: { title: 'سامانه انبارداری', route: '/app/warehouse' },
                syncMonitorScope: 'warehouse'
              }
            });
          }
          if (activeModuleCodes.includes('accounting')) {
            list.push({
              moduleCode: 'accounting',
              extension: {
                quickLink: { title: 'سامانه مالی و پرسنلی', route: '/app/finance' },
                hasExpiringDocsWidget: true,
                syncMonitorScope: 'accounting'
              }
            });
          }
          return list;
        }
        return [];
      })
    };

    injector = Injector.create({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        { provide: AuthService, useValue: mockAuth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: SystemHealthService, useValue: mockHealth },
        { provide: NavigationHistoryService, useValue: { getRecentBreadcrumbs: () => [] } },
        { provide: CommunicationService, useValue: mockComm },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: ModuleRegistryService, useValue: mockRegistry }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new OperationsLayoutComponent();
      component.ngOnInit();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('پروفایل ۱: نصب کامل (هر دو ماژول انبار و مالی) — نمایش همزمان پیوندهای سایدبار به هر دو ماژول', () => {
    activeModuleCodes = ['warehouse', 'accounting'];
    mockActiveCompany.hasWarehouseModuleSignal.mockReturnValue(true);

    expect(component.showWarehouseLink).toBe(true);
    expect(component.showAccountingLink).toBe(true);
    expect(component.hasMultipleConnectedModules).toBe(true);
    expect(component.hasAnyConnectedModule).toBe(true);

    component.goToWarehouse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/dashboard']);

    component.goToFinance();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance']);
  });

  it('پروفایل ۲: تک‌ماژول انبارداری (بدون مالی) — نمایش انحصاری پیوند انبار و عنوان سامانه متصل', () => {
    activeModuleCodes = ['warehouse'];
    mockActiveCompany.hasWarehouseModuleSignal.mockReturnValue(true);

    expect(component.showWarehouseLink).toBe(true);
    expect(component.showAccountingLink).toBe(false);
    expect(component.hasMultipleConnectedModules).toBe(false);
    expect(component.hasAnyConnectedModule).toBe(true);
  });

  it('پروفایل ۳: تک‌ماژول مالی (بدون انبار) — نمایش انحصاری پیوند مالی و حذف پیوند انبارداری', () => {
    activeModuleCodes = ['accounting'];
    mockActiveCompany.hasWarehouseModuleSignal.mockReturnValue(false);

    expect(component.showWarehouseLink).toBe(false);
    expect(component.showAccountingLink).toBe(true);
    expect(component.hasMultipleConnectedModules).toBe(false);
    expect(component.hasAnyConnectedModule).toBe(true);
  });

  it('عملکرد منوی تاشو و نوار کناری در مرکز عملیات', () => {
    expect(component.isSidebarCollapsed()).toBe(false);
    component.toggleSidebar();
    expect(component.isSidebarCollapsed()).toBe(true);

    expect(component.isMobileMenuOpen()).toBe(false);
    component.toggleMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(true);
    component.closeMobileMenu();
    expect(component.isMobileMenuOpen()).toBe(false);
  });

  it('ماژول ساختگی سوم sample با routePrefix برابر /app/sample — پیوند سریع در operations-layout دیده می‌شود', () => {
    activeModuleCodes = ['warehouse', 'accounting', 'sample'];
    const prevGetExtensions = mockRegistry.getExtensions;
    mockRegistry.getExtensions = vi.fn().mockImplementation((point: string) => {
      const list = prevGetExtensions(point);
      if (point === 'operations') {
        list.push({
          moduleCode: 'sample',
          extension: {
            quickLink: { title: 'ماژول نمونه', route: '/app/sample', icon: 'box' },
            syncMonitorScope: 'sample'
          }
        });
      }
      return list;
    });

    const extra = component.extraQuickLinks;
    expect(extra.length).toBe(1);
    expect(extra[0].code).toBe('sample');
    expect(extra[0].title).toBe('ماژول نمونه');
    expect(extra[0].route).toBe('/app/sample');
    expect(component.hasAnyConnectedModule).toBe(true);

    component.navigateToQuickLink('/app/sample');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/sample']);
  });
});

