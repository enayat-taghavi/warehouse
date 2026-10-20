// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { 
  WarehouseModuleMatchGuard, 
  WarehouseCompanyGuard, 
  AccountingModuleMatchGuard,
  AuthGuard 
} from './auth.guard';
import { AuthService } from './auth.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { ActiveCompanyService } from '../services/active-company.service';
import { AppPersonaService } from '../services/app-persona.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('AuthGuards & Warehouse Routing Integrity', () => {
  let moduleRegistryMock: any;
  let activeCompanyMock: any;
  let authServiceMock: any;
  let personaServiceMock: any;
  let routerMock: any;

  beforeEach(() => {
    TestBed.resetTestingModule();

    moduleRegistryMock = {
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getInstalledModules: vi.fn().mockReturnValue([
        { code: 'warehouse', scopeKind: 'warehouse', defaultRoute: '/app/warehouse' },
        { code: 'accounting', scopeKind: 'finance', defaultRoute: '/app/finance' }
      ])
    };

    activeCompanyMock = {
      activeCompany: null,
      hasWarehouseModule: true,
      hasWarehouseModuleSignal: vi.fn().mockReturnValue(true),
      hasCompanyDocumentsAccess: vi.fn().mockReturnValue(true)
    };

    authServiceMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      user: vi.fn().mockReturnValue({ is_superuser: true, roles: ['admin'] }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    personaServiceMock = {
      canAccessRoute: vi.fn().mockReturnValue(true),
      getDefaultRouteForRole: vi.fn().mockReturnValue('/app/launcher')
    };

    routerMock = {
      navigate: vi.fn(),
      parseUrl: vi.fn((url: string) => ({ toString: () => url } as any))
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ModuleRegistryService, useValue: moduleRegistryMock },
        { provide: ActiveCompanyService, useValue: activeCompanyMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: AppPersonaService, useValue: personaServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    });
  });

  describe('WarehouseModuleMatchGuard', () => {
    it('should match route when activeCompany is null on initial boot', () => {
      activeCompanyMock.activeCompany = null;
      const result = TestBed.runInInjectionContext(() => WarehouseModuleMatchGuard({} as any, [], {} as any));
      expect(result).toBe(true);
    });

    it('should match route when company has warehouse module', () => {
      activeCompanyMock.activeCompany = { id: 1, name: 'شرکت ۱', has_warehouse_module: true };
      const result = TestBed.runInInjectionContext(() => WarehouseModuleMatchGuard({} as any, [], {} as any));
      expect(result).toBe(true);
    });

    it('should reject route ONLY when company explicitly disables warehouse module', () => {
      activeCompanyMock.activeCompany = { id: 2, name: 'شرکت ۲', has_warehouse_module: false };
      const result = TestBed.runInInjectionContext(() => WarehouseModuleMatchGuard({} as any, [], {} as any));
      expect(result).toBe(false);
    });

    it('should reject route when the warehouse module is not installed even though other modules are', () => {
      moduleRegistryMock.isModuleInstalled.mockImplementation((code: string) => code !== 'warehouse');
      const result = TestBed.runInInjectionContext(() => WarehouseModuleMatchGuard({} as any, [], {} as any));
      expect(result).toBe(false);
    });
  });

  describe('AccountingModuleMatchGuard', () => {
    it('should match only when the accounting module is installed', () => {
      moduleRegistryMock.isModuleInstalled.mockImplementation((code: string) => code === 'accounting');
      expect(TestBed.runInInjectionContext(() => AccountingModuleMatchGuard({} as any, [], {} as any))).toBe(true);
      moduleRegistryMock.isModuleInstalled.mockImplementation((code: string) => code !== 'accounting');
      expect(TestBed.runInInjectionContext(() => AccountingModuleMatchGuard({} as any, [], {} as any))).toBe(false);
    });
  });

  describe('WarehouseCompanyGuard', () => {
    it('should allow navigation when activeCompany is null', () => {
      activeCompanyMock.activeCompany = null;
      const result = TestBed.runInInjectionContext(() => WarehouseCompanyGuard({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect to launcher ONLY when company explicitly disables warehouse module', () => {
      activeCompanyMock.activeCompany = { id: 2, name: 'شرکت ۲', has_warehouse_module: false };
      const result = TestBed.runInInjectionContext(() => WarehouseCompanyGuard({} as any, {} as any));
      expect(result).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/app/launcher']);
    });
  });

  describe('AuthGuard Settings Permissions & Redirects', () => {
    it('should allow access to settings for user with perm_sys_settings', () => {
      authServiceMock.user.mockReturnValue({ is_superuser: false, roles: [] });
      authServiceMock.userPermissions.mockReturnValue(['perm_sys_settings', 'view_sys_dashboard']);

      const route = { routeConfig: { path: 'settings' } } as ActivatedRouteSnapshot;
      const state = { url: '/app/warehouse/settings' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));
      expect(result).toBe(true);
    });

    it('should redirect unauthenticated user to login with returnUrl', () => {
      authServiceMock.isLoggedIn.mockReturnValue(false);

      const route = { routeConfig: { path: 'settings' } } as ActivatedRouteSnapshot;
      const state = { url: '/app/warehouse/settings' } as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));
      expect(routerMock.parseUrl).toHaveBeenCalledWith(
        '/login?returnUrl=' + encodeURIComponent('/app/warehouse/settings')
      );
    });
  });
});
