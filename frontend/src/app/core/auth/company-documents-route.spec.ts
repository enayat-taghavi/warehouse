// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { routes } from '../../app.routes';
import { INSTALLED_MODULES } from '../../modules/installed-modules';
import { AuthService } from './auth.service';
import { AuthStore } from '../stores/auth.store';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ActiveCompanyService } from '../services/active-company.service';
import { Company } from '../models/company.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

/** بایگانی اسناد شرکت در تب «مدارک» استودیو ادغام شد (طرح مجوزهای شرکت، گام ۱۲) */
describe('Company documents archive merged into the company studio', () => {
  let moduleRegistry: ModuleRegistryService;
  let companies: ActiveCompanyService;
  let router: Router;

  const company = (id: number, levels: Record<string, 'none' | 'read' | 'write'>): Company =>
    ({ id, code: `C${id}`, name: `شرکت ${id}`, is_active: true, section_levels: levels } as Company);

  const redirectOf = (list: any[], path: string): string => {
    const r = list.find(x => x.path === path);
    expect(r, path).toBeDefined();
    const target = TestBed.runInInjectionContext(() =>
      typeof r.redirectTo === 'function' ? r.redirectTo({} as any) : r.redirectTo);
    return target instanceof UrlTree ? router.serializeUrl(target) : String(target);
  };

  const memoryStorage = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      clear: () => m.clear(),
      getItem: (k: string) => m.get(k) ?? null,
      key: (i: number) => [...m.keys()][i] ?? null,
      removeItem: (k: string) => { m.delete(k); },
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
    };
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    moduleRegistry = getModuleRegistry();
    moduleRegistry.setInstalledModules(['warehouse', 'accounting']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ModuleRegistryService, useValue: moduleRegistry },
        { provide: AuthService, useValue: { isLoggedIn: () => true, user: signal<any>({ is_superuser: false, roles: [] }), userPermissions: signal<string[]>([]) } },
        { provide: AuthStore, useValue: { setWarehouseContext: () => {} } },
      ],
    });
    companies = TestBed.inject(ActiveCompanyService);
    router = TestBed.inject(Router);
  });

  it('the root redirect sends a user without module access to the restricted studio', () => {
    expect(redirectOf(routes, 'app')).toBe('app/companies');
    expect(redirectOf(routes, '')).toBe('app/companies');
  });

  it('legacy archive urls open the documents tab of the active company', async () => {
    // مسیرهای قدیمی ماژولِ دارای بایگانی (از رجیستری، بی نام بردن ماژول)
    const owner = INSTALLED_MODULES.find(m => m.extensions?.layoutNav?.hasCompanyDocumentsArchive);
    expect(owner?.routes).toBeDefined();
    const moduleRoutes = await owner!.routes!();
    companies.manageableCompanies.set([company(7, { founding_docs: 'read' })]);
    companies.selectCompany(company(7, {}));
    expect(redirectOf(routes, 'documents')).toBe('/app/companies/7?tab=documents');
    expect(redirectOf(routes, 'company-documents')).toBe('/app/companies/7?tab=documents');
    expect(redirectOf(moduleRoutes, 'company-documents')).toBe('/app/companies/7?tab=documents');
    expect(redirectOf(moduleRoutes, 'company-documents-archive')).toBe('/app/companies/7?tab=documents');
    expect(redirectOf(moduleRoutes, 'documents')).toBe('/app/companies/7?tab=documents');
  });

  it('without an active company the legacy archive url opens the company list', () => {
    companies.selectCompany(null);
    expect(redirectOf(routes, 'documents')).toBe('/app/companies');
  });

  it('documents access comes from the documents tab sections of the restricted list', () => {
    companies.manageableCompanies.set([company(1, { bank: 'read' })]);
    expect(companies.hasCompanyDocumentsAccess()).toBe(false);
    companies.manageableCompanies.set([company(1, { bank: 'read' }), company(2, { docs_archive: 'read' })]);
    expect(companies.hasCompanyDocumentsAccess()).toBe(true);
    companies.manageableCompanies.set([company(3, { founding_docs: 'write' })]);
    expect(companies.hasCompanyDocumentsAccess()).toBe(true);
  });

  it('the target company is the active one only when its documents are readable', () => {
    companies.manageableCompanies.set([company(1, { bank: 'read' }), company(2, { docs_archive: 'read' })]);
    companies.selectCompany(company(1, {}));
    expect(companies.companyDocumentsTargetId()).toBe(2);
    expect(redirectOf(routes, 'documents')).toBe('/app/companies/2?tab=documents');
    companies.selectCompany(company(2, {}));
    expect(companies.companyDocumentsTargetId()).toBe(2);
    companies.manageableCompanies.set([]);
    expect(companies.companyDocumentsTargetId()).toBeNull();
  });

  it('without the archive module installed only the core documents section counts', () => {
    moduleRegistry.setInstalledModules(['warehouse']);
    companies.manageableCompanies.set([company(2, { docs_archive: 'write' })]);
    expect(companies.hasCompanyDocumentsAccess()).toBe(false);
  });
});
