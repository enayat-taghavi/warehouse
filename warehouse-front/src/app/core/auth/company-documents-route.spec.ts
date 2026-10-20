// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';

import { routes, getCompanyDocumentsRedirect } from '../../app.routes';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthStore } from '../stores/auth.store';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ActiveCompanyService } from '../services/active-company.service';
import { AppPersonaService } from '../services/app-persona.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Company Documents Route via layoutNav Extension', () => {
  let moduleRegistry: ModuleRegistryService;
  let activeCompanyMock: {
    activeCompany: any;
    hasWarehouseModule: boolean;
    hasCompanyDocumentsAccess: ReturnType<typeof vi.fn>;
  };
  let authServiceMock: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof signal>;
    userPermissions: ReturnType<typeof signal>;
  };
  let authStoreMock: {
    setWarehouseContext: ReturnType<typeof vi.fn>;
  };
  let personaServiceMock: {
    canAccessRoute: ReturnType<typeof vi.fn>;
    getDefaultRouteForRole: ReturnType<typeof vi.fn>;
  };
  let routerMock: {
    navigate: ReturnType<typeof vi.fn>;
    parseUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TestBed.resetTestingModule();

    moduleRegistry = getModuleRegistry();
    moduleRegistry.setInstalledModules(['warehouse', 'accounting']);

    activeCompanyMock = {
      activeCompany: { id: 1, name: 'شرکت تستی', has_warehouse_module: true },
      hasWarehouseModule: true,
      hasCompanyDocumentsAccess: vi.fn().mockReturnValue(true),
    };

    authServiceMock = {
      isLoggedIn: vi.fn().mockReturnValue(true),
      user: signal<any>({ is_superuser: false, roles: [] }),
      userPermissions: signal<string[]>([]),
    };

    authStoreMock = {
      setWarehouseContext: vi.fn(),
    };

    personaServiceMock = {
      canAccessRoute: vi.fn().mockReturnValue(true),
      getDefaultRouteForRole: vi.fn().mockReturnValue('/app/finance/company-documents'),
    };

    routerMock = {
      navigate: vi.fn(),
      parseUrl: vi.fn((url: string) => ({ toString: () => url, url } as any)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ModuleRegistryService, useValue: moduleRegistry },
        { provide: ActiveCompanyService, useValue: activeCompanyMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: AuthStore, useValue: authStoreMock },
        { provide: AppPersonaService, useValue: personaServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  it('the root redirect sends a user with company-documents access and no module access to the archive route', () => {
    authServiceMock.userPermissions.set([]);
    authServiceMock.user.set({ is_superuser: false, roles: [] });
    activeCompanyMock.hasCompanyDocumentsAccess.mockReturnValue(true);

    const appRoute = routes.find(r => r.path === 'app');
    expect(appRoute).toBeDefined();
    expect(typeof appRoute?.redirectTo).toBe('function');

    const redirectTarget = TestBed.runInInjectionContext(() => {
      const fn = appRoute!.redirectTo as any;
      return fn();
    });

    expect(redirectTarget).toBe('app/finance/company-documents');
  });

  it('the guard allows that user on the archive route', () => {
    authServiceMock.isLoggedIn.mockReturnValue(true);
    authServiceMock.userPermissions.set([]);
    authServiceMock.user.set({ is_superuser: false, roles: [] });
    activeCompanyMock.hasCompanyDocumentsAccess.mockReturnValue(true);

    const route = {
      routeConfig: { path: 'app/finance' },
    } as unknown as ActivatedRouteSnapshot;

    const state = {
      url: '/app/finance/company-documents',
    } as RouterStateSnapshot;

    const allowed = TestBed.runInInjectionContext(() => AuthGuard(route, state));
    expect(allowed).toBe(true);
  });

  it('the legacy documents redirect resolves to the archive route', () => {
    const docRoute = routes.find(r => r.path === 'documents');
    expect(docRoute).toBeDefined();

    const redirectTarget = TestBed.runInInjectionContext(() => {
      if (typeof docRoute?.redirectTo === 'function') {
        return (docRoute.redirectTo as any)({} as any);
      }
      return docRoute?.redirectTo;
    });

    expect(redirectTarget).toBe('app/finance/company-documents');

    const helperTarget = TestBed.runInInjectionContext(() => getCompanyDocumentsRedirect());
    expect(helperTarget).toBe('app/finance/company-documents');
  });

  it('without the archive module installed the redirect goes to app/launcher', () => {
    moduleRegistry.setInstalledModules(['warehouse']);
    activeCompanyMock.hasCompanyDocumentsAccess.mockReturnValue(true);

    const redirectTarget = TestBed.runInInjectionContext(() => getCompanyDocumentsRedirect());
    expect(redirectTarget).toBe('app/launcher');

    const appRoute = routes.find(r => r.path === 'app');
    const rootRedirect = TestBed.runInInjectionContext(() => {
      const fn = appRoute!.redirectTo as any;
      return fn();
    });
    expect(rootRedirect).toBe('app/launcher');

    const docRoute = routes.find(r => r.path === 'documents');
    const legacyRedirect = TestBed.runInInjectionContext(() => {
      const fn = docRoute!.redirectTo as any;
      return fn({} as any);
    });
    expect(legacyRedirect).toBe('app/launcher');
  });
});
