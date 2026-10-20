// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

import { routes } from '../../app.routes';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ActiveCompanyService } from '../services/active-company.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Module route canMatch (dynamicModuleRoutes)', () => {
  let registry: ModuleRegistryService;
  let activeCompanyMock: { activeCompany: any };

  const canMatchOf = (prefix: string) => {
    const route = routes.find(r => r.path === prefix.replace(/^\//, ''));
    expect(route?.canMatch?.length).toBeGreaterThan(0);
    return () => TestBed.runInInjectionContext(() => (route!.canMatch![0] as any)({}, []));
  };

  const prefixOf = (code: string) => registry.getSpec(code)!.routePrefix;

  beforeEach(() => {
    TestBed.resetTestingModule();
    registry = getModuleRegistry();
    registry.setInstalledModules(['warehouse', 'accounting']);
    activeCompanyMock = { activeCompany: null };
    TestBed.configureTestingModule({
      providers: [
        { provide: ModuleRegistryService, useValue: registry },
        { provide: ActiveCompanyService, useValue: activeCompanyMock },
      ],
    });
  });

  it('matches every installed module route on initial boot without an active company', () => {
    expect(canMatchOf(prefixOf('warehouse'))()).toBe(true);
    expect(canMatchOf(prefixOf('accounting'))()).toBe(true);
  });

  it('does not match the route of a module that is not installed while the other module is', () => {
    registry.setInstalledModules(['accounting']);
    expect(canMatchOf(prefixOf('warehouse'))()).toBe(false);
    expect(canMatchOf(prefixOf('accounting'))()).toBe(true);

    registry.setInstalledModules(['warehouse']);
    expect(canMatchOf(prefixOf('accounting'))()).toBe(false);
    expect(canMatchOf(prefixOf('warehouse'))()).toBe(true);
  });

  it('rejects the toggled module only when the active company explicitly disables it', () => {
    activeCompanyMock.activeCompany = { id: 1, has_warehouse_module: true };
    expect(canMatchOf(prefixOf('warehouse'))()).toBe(true);

    activeCompanyMock.activeCompany = { id: 2, has_warehouse_module: false };
    expect(canMatchOf(prefixOf('warehouse'))()).toBe(false);
    expect(canMatchOf(prefixOf('accounting'))()).toBe(true);
  });
});
