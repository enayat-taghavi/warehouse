// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import {
  moduleCompanyGuard,
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
      isModuleEnabled: vi.fn().mockReturnValue(true),
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

  describe('moduleCompanyGuard (enabled_modules شرکت فعال)', () => {
    it('should allow navigation when activeCompany is null', () => {
      activeCompanyMock.activeCompany = null;
      const result = TestBed.runInInjectionContext(() => moduleCompanyGuard('warehouse')({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should allow navigation for an old cached company without enabled_modules', () => {
      activeCompanyMock.activeCompany = { id: 1, name: 'شرکت ۱' };
      const result = TestBed.runInInjectionContext(() => moduleCompanyGuard('warehouse')({} as any, {} as any));
      expect(result).toBe(true);
    });

    it('should redirect to launcher ONLY when the module is not in the company enabled_modules', () => {
      activeCompanyMock.activeCompany = { id: 2, name: 'شرکت ۲', enabled_modules: ['accounting'] };
      const result = TestBed.runInInjectionContext(() => moduleCompanyGuard('warehouse')({} as any, {} as any));
      expect(result).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/app/launcher']);
      routerMock.navigate.mockClear();
      const acc = TestBed.runInInjectionContext(() => moduleCompanyGuard('accounting')({} as any, {} as any));
      expect(acc).toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalled();
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
