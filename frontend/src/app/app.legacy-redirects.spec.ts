// @vitest-environment jsdom
import '@angular/compiler';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { provideRouter, Router, Route } from '@angular/router';
import { INSTALLED_MODULES } from './modules/installed-modules';
import { MODULE as accountingModule } from './modules/accounting/module';
import { WAREHOUSE_ROUTES } from './modules/warehouse/warehouse.routes';
import { routes } from './app.routes';
import { AppPersonaService } from './core/services/app-persona.service';
import { getModuleRegistry } from './core/modules/module-registry.service';
import { redirectToCompanyProjects } from './core/modules/documents-archive-route';

/** ریدایرکت‌های ماژولی که پیش از گام ۶ مستقیم در app.routes.ts بودند: [مسیر قدیمی، مقصد] */
const FORMER_ROOT_REDIRECTS: [string, string][] = [
  ['dashboard', 'app/warehouse/dashboard'],
  ['projects', 'app/warehouse/projects'],
  ['dispatch', 'app/warehouse/dispatch'],
  ['docs', 'app/warehouse/docs'],
  ['users', 'app/warehouse/users'],
  ['settings', 'app/warehouse/settings'],
  ['wh-settings', 'app/warehouse/wh-settings'],
  ['audit', 'app/warehouse/audit'],
  ['feeding', 'app/warehouse/feeding'],
  ['counter', 'app/warehouse/counter'],
  ['supervisor', 'app/warehouse/supervisor'],
  ['manager-review', 'app/warehouse/manager-review'],
  ['count-tracking', 'app/warehouse/count-tracking'],
  ['reports', 'app/warehouse/reports'],
  ['customs', 'app/warehouse/customs'],
  ['tasks', 'app/warehouse/tasks'],
  ['labels', 'app/warehouse/labels'],
  ['approvals', 'app/warehouse/approvals'],
  ['doc_approvals', 'app/warehouse/doc_approvals'],
  ['feed_approvals', 'app/warehouse/feed_approvals'],
  ['finance-cartable', 'app/finance/accountant-payroll'],
  ['attendance', 'app/finance/employee-attendance'],
  ['fleet', 'app/finance/employee-fleet'],
  ['fleet-attendance', 'app/finance/employee-fleet'],
  ['manager-approvals', 'app/finance/manager-approvals'],
  ['treasury-cartable', 'app/finance/treasurer-disbursements'],
  ['treasury', 'app/finance/treasurer-disbursements'],
  ['profiles', 'app/finance/profiles'],
  ['personnel-profiles', 'app/finance/personnel-profiles'],
  ['base-settings', 'app/finance/base-settings'],
  ['employee-portal', 'app/finance/employee-attendance'],
  ['employee-attendance', 'app/finance/employee-attendance'],
  ['employee-fleet', 'app/finance/employee-fleet'],
  ['employee-invoices', 'app/finance/employee-invoices'],
  ['employee-petty-cash', 'app/finance/employee-petty-cash'],
  ['employee-new-vehicle', 'app/finance/employee-new-vehicle'],
  ['employee-new-personnel', 'app/finance/employee-new-personnel'],
  ['supervisor-personnel', 'app/finance/supervisor-personnel'],
  ['supervisor-attendance', 'app/finance/supervisor-attendance'],
  ['supervisor-fleet', 'app/finance/supervisor-fleet'],
  ['supervisor-invoices', 'app/finance/supervisor-invoices'],
  ['supervisor-petty-cash', 'app/finance/supervisor-petty-cash'],
  ['supervisor-new-profiles', 'app/finance/supervisor-personnel'],
  ['supervisor-period-lock', 'app/finance/supervisor-period-lock'],
  ['accountant', 'app/finance/accountant-payroll'],
  ['accountant-personnel', 'app/finance/accountant-personnel'],
  ['accountant-payroll', 'app/finance/accountant-payroll'],
  ['accountant-fleet', 'app/finance/accountant-fleet'],
  ['accountant-invoices', 'app/finance/accountant-invoices'],
  ['accountant-petty-cash', 'app/finance/accountant-petty-cash'],
  ['accountant-new-profiles', 'app/finance/accountant-personnel'],
  ['accountant-diskettes', 'app/finance/accountant-diskettes'],
  ['accountant-counterparties', 'app/finance/accountant-counterparties'],
  ['manager', 'app/finance/manager-dashboard'],
  ['manager-personnel', 'app/finance/manager-personnel'],
  ['manager-fleet', 'app/finance/manager-fleet'],
  ['manager-dashboard', 'app/finance/manager-dashboard'],
  ['manager-budget', 'app/finance/manager-budget'],
  ['manager-contracts', 'app/finance/manager-contracts'],
  ['manager-reports', 'app/finance/manager-reports'],
  ['treasurer', 'app/finance/treasurer-disbursements'],
  ['treasurer-disbursements', 'app/finance/treasurer-disbursements'],
  ['treasurer-invoices', 'app/finance/treasurer-invoices'],
  ['treasurer-bank-accounts', 'app/finance/treasurer-bank-accounts'],
  ['treasurer-cheques', 'app/finance/treasurer-cheques'],
  ['treasurer-reconciliation', 'app/finance/treasurer-reconciliation'],
  ['personnel', 'app/finance/accountant-payroll'],
  ['payroll', 'app/finance/accountant-payroll'],
  ['fleet-settlement', 'app/finance/treasurer-disbursements'],
  ['finance-audit', 'app/finance/audit'],
];

const combined = (): Route[] => INSTALLED_MODULES.flatMap(m => m.legacyRedirects ?? []);

@Component({ standalone: true, template: '' })
class DummyPage {}

describe('legacyRedirects ماژول‌ها', () => {
  it('هر ریدایرکت قدیمی ریشه دقیقاً یک بار با همان مقصد و pathMatch در legacyRedirects ماژول‌ها هست', () => {
    const all = combined();
    for (const [path, target] of FORMER_ROOT_REDIRECTS) {
      const hits = all.filter(r => r.path === path);
      expect(hits.length, path).toBe(1);
      expect(hits[0].redirectTo, path).toBe(target);
      expect(hits[0].pathMatch, path).toBe('full');
    }
    // ریدایرکت جابه‌جاشدهٔ attendance انبار، و projects-and-sections که اکنون به تب استودیوی شرکت می‌رود
    const projects = all.filter(r => r.path === 'projects-and-sections');
    expect(projects.length).toBe(1);
    expect(projects[0].redirectTo).toBe(redirectToCompanyProjects);
    expect(all.length).toBe(FORMER_ROOT_REDIRECTS.length + 2);
  });

  it('app/warehouse/attendance در ماژول مالی به صفحهٔ کارکرد کارمند می‌رود و روت‌های انبار دیگر به مالی پیوند ندارند', () => {
    const r = (accountingModule.legacyRedirects ?? []).find(x => x.path === 'app/warehouse/attendance');
    expect(r?.redirectTo).toBe('app/finance/employee-attendance');
    expect(r?.pathMatch).toBe('full');
    expect(WAREHOUSE_ROUTES.some(x => x.path === 'attendance')).toBe(false);
  });

  it('روت‌های ریشه: ریدایرکت‌های هسته سر جایشان و ریدایرکت‌های ماژولی در همان جای قبلی پهن شده‌اند', () => {
    const paths = routes.map(r => r.path);
    const ops = routes.find(r => r.path === 'operations');
    const cockpit = routes.find(r => r.path === 'cockpit');
    expect(ops?.redirectTo).toBe('app/operations/cockpit');
    expect(cockpit?.redirectTo).toBe('app/operations/cockpit');
    const firstLegacy = paths.indexOf(FORMER_ROOT_REDIRECTS[0][0]);
    expect(firstLegacy).toBeGreaterThan(paths.indexOf('app'));
    expect(firstLegacy).toBeLessThan(paths.indexOf('company-documents'));
    expect(paths.indexOf('operations')).toBeLessThan(paths.indexOf('**'));
  });

  it('URL قدیمی /app/warehouse/attendance پس از ناکامی فرزندان ماژول انبار به ریدایرکت ریشه می‌رسد', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'app/warehouse', loadChildren: () => Promise.resolve([{ path: 'dashboard', component: DummyPage }]) },
        { path: 'app/finance/employee-attendance', component: DummyPage },
        ...(accountingModule.legacyRedirects ?? []),
        { path: '**', redirectTo: 'login' },
        { path: 'login', component: DummyPage },
      ])]
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/warehouse/attendance');
    expect(router.url).toBe('/app/finance/employee-attendance');
  });

  it('isGenericModuleApp بدون فهرست نام: ماژول‌های دارای قلمرو و عملیات عمومی نیستند، ماژول بی‌قلمرو عمومی است', () => {
    const svc: any = Object.create(AppPersonaService.prototype);
    svc.moduleRegistry = getModuleRegistry();
    for (const app of ['warehouse', 'accounting', 'personnel', 'finance', 'operations']) {
      expect(svc.isGenericModuleApp(app), app).toBe(false);
    }
    getModuleRegistry().registerModule({
      code: 'qa_generic', titleFa: 'آزمون', icon: '', routePrefix: '/app/qa_generic',
      defaultRoute: '/app/qa_generic', scopeKind: 'qa_generic', permissionMarkers: [], roles: []
    } as any);
    expect(svc.isGenericModuleApp('qa_generic')).toBe(true);
    expect(svc.isGenericModuleApp('unknown')).toBe(false);
  });
});
