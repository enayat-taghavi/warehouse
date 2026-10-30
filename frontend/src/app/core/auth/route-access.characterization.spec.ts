// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthGuard, hasRoutePermission } from './auth.guard';
import { AuthService } from './auth.service';
import { AppPersonaService } from '../services/app-persona.service';
import { ActiveCompanyService } from '../services/active-company.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';

const ROUTE_PERMISSIONS_LITERAL: Record<string, string[]> = {
  'dashboard': ['view_sys_dashboard', 'view_wh_dashboard'],
  'users': ['view_sys_users'],
  'projects': ['view_sys_projects'],
  'id-cards': ['view_sys_id_cards'],
  'counter': ['view_sys_counter'],
  'supervisor': ['view_sys_supervisor'],
  'manager-review': ['view_sys_manager_review', 'can_act_as_manager'],
  'recounts': ['view_sys_recounts'],
  'settings': ['view_sys_settings', 'perm_sys_settings', 'view_wh_settings', 'admin_all'],
  'reports': ['view_sys_reports', 'view_sys_dashboard'],
  'docs': ['view_wh_docs'],
  'dispatch': ['view_wh_dispatch'],
  'customs': ['view_wh_customs'],
  'doc_approvals': ['view_wh_doc_approvals'],
  'feeding': ['view_wh_feeding'],
  'feed_approvals': ['view_wh_feed_approvals'],
  'labels': ['view_wh_labels'],
  'label-designer': ['view_wh_label_designer'],
  'audit': ['view_wh_audit', 'perm_sys_logs', 'view_sys_payroll', 'admin_all'],
  'finance-audit': ['view_sys_payroll', 'perm_sys_logs', 'admin_all'],
  'count-tracking': ['view_sys_manager_review', 'view_sys_supervisor', 'view_sys_dashboard', 'perm_inventory_finalize', 'view_wh_stocktaking', 'can_act_as_manager', 'can_act_as_supervisor'],
  'personnel': ['view_sys_payroll', 'admin_all'],
  'payroll': ['view_sys_payroll', 'admin_all'],
  'fleet-settlement': ['view_sys_fleet_settlement', 'view_sys_payroll', 'admin_all'],
  'attendance': ['view_sys_personnel_attendance', 'view_wh_attendance', 'perm_register_daily_attendance', 'view_sys_personnel_attendance', 'can_act_as_supervisor', 'admin_all'],
  'fleet': ['view_sys_fleet_attendance', 'view_wh_attendance', 'admin_all'],
  'fleet-attendance': ['view_sys_fleet_attendance', 'view_wh_attendance', 'admin_all'],
  'manager-approvals': ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'can_act_as_manager', 'admin_all'],
  'finance-cartable': ['perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'view_sys_payroll', 'admin_all'],
  'treasury-cartable': ['perm_treasury_disburse_action', 'admin_all'],
  'treasury': ['perm_treasury_disburse_action', 'admin_all'],
  'profiles': ['view_sys_personnel', 'admin_all'],
  'personnel-profiles': ['view_sys_personnel', 'admin_all'],
  'base-settings': [
    'view_sys_settings', 'perm_sys_settings', 'admin_all',
    'perm_approve_personnel_finance', 'view_sys_payroll', 'perm_approve_personnel_finance',
    'perm_manager_payment_authorize', 'perm_approve_personnel_manager'
  ],
  'counterparties': ['view_sys_payroll', 'view_sys_projects', 'perm_counterparty_manage', 'admin_all'],
  'employee-portal': ['view_sys_personnel_attendance', 'admin_all'],
  'employee-attendance': ['view_sys_personnel_attendance', 'admin_all'],
  'employee-fleet': ['view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
  'employee-invoices': ['view_sys_personnel_attendance', 'perm_invoice_record', 'admin_all'],
  'employee-petty-cash': ['view_sys_personnel_attendance', 'perm_petty_cash_manage', 'perm_treasury_disburse_action', 'admin_all'],
  'employee-new-vehicle': ['view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
  'employee-new-personnel': ['view_sys_personnel_attendance', 'admin_all'],
  'supervisor-attendance': ['perm_approve_personnel_supervisor', 'admin_all'],
  'supervisor-fleet': ['perm_approve_fleet_supervisor', 'admin_all'],
  'supervisor-invoices': ['perm_invoice_approve', 'admin_all'],
  'supervisor-petty-cash': ['perm_invoice_approve', 'admin_all'],
  'supervisor-new-profiles': ['perm_approve_personnel_supervisor', 'admin_all'],
  'supervisor-period-lock': ['perm_lock_work_period', 'admin_all'],
  'accountant-payroll': ['view_sys_payroll', 'perm_approve_personnel_finance', 'admin_all'],
  'accountant-fleet': ['view_sys_fleet_settlement', 'perm_approve_fleet_finance', 'admin_all'],
  'accountant-invoices': ['view_sys_payroll', 'perm_invoice_review', 'admin_all'],
  'accountant-petty-cash': ['view_sys_payroll', 'perm_invoice_review', 'admin_all'],
  'accountant-diskettes': ['view_sys_payroll', 'admin_all'],
  'accountant-counterparties': ['view_sys_payroll', 'perm_counterparty_manage', 'perm_approve_personnel_finance', 'admin_all'],
  'manager-dashboard': ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'admin_all'],
  'manager-budget': ['perm_manager_payment_authorize', 'admin_all'],
  'manager-contracts': ['perm_manager_payment_authorize', 'admin_all'],
  'manager-reports': ['perm_accounting_reports', 'admin_all'],
  'treasurer-disbursements': ['perm_treasury_disburse_action', 'admin_all'],
  'treasurer-invoices': ['perm_treasury_disburse_action', 'admin_all'],
  'treasurer-bank-accounts': ['perm_treasury_disburse_action', 'admin_all'],
  'treasurer-cheques': ['perm_treasury_disburse_action', 'admin_all'],
  'treasurer-reconciliation': ['perm_treasury_disburse_action', 'admin_all']
};

function verifyRouteKey(key: string) {
  const perms = ROUTE_PERMISSIONS_LITERAL[key];
  expect(perms, `Key ${key} must exist in literal ROUTE_PERMISSIONS`).toBeDefined();
  for (const perm of perms) {
    expect(hasRoutePermission(key, [perm]), `hasRoutePermission(${key}, [${perm}]) should be true`).toBe(true);
  }
  expect(hasRoutePermission(key, ['unrelated_perm']), `hasRoutePermission(${key}, ['unrelated_perm']) should be false`).toBe(false);
}

describe('Route Access Characterization Spec', () => {
  // =========================================================================
  // Section 1: hasRoutePermission for all 64 literal keys
  // =========================================================================
  describe('hasRoutePermission characterization', () => {
    beforeEach(() => {
      getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
    });

    afterEach(() => {
      getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
    });

    it('returns true for unknown route key regardless of permissions', () => {
      expect(hasRoutePermission('unknown-route-key', [])).toBe(true);
      expect(hasRoutePermission('unknown-route-key', ['unrelated_perm'])).toBe(true);
    });

    it('validates Group 1: General & Operations (dashboard, users, projects, id-cards)', () => {
      for (const k of ['dashboard', 'users', 'projects', 'id-cards']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 2: Warehouse Operations (counter, supervisor, manager-review, recounts)', () => {
      for (const k of ['counter', 'supervisor', 'manager-review', 'recounts']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 3: Settings & Reports (settings, reports, audit, finance-audit)', () => {
      for (const k of ['settings', 'reports', 'audit', 'finance-audit']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 4: Warehouse Logistics (docs, dispatch, customs, doc_approvals)', () => {
      for (const k of ['docs', 'dispatch', 'customs', 'doc_approvals']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 5: Warehouse Feeding & Labels (feeding, feed_approvals, labels, label-designer)', () => {
      for (const k of ['feeding', 'feed_approvals', 'labels', 'label-designer']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 6: Inventory Count Tracking (count-tracking)', () => {
      verifyRouteKey('count-tracking');
    });

    it('validates Group 7: Personnel & Payroll Core (personnel, payroll, fleet-settlement, attendance)', () => {
      for (const k of ['personnel', 'payroll', 'fleet-settlement', 'attendance']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 8: Fleet & Manager Approvals (fleet, fleet-attendance, manager-approvals, finance-cartable)', () => {
      for (const k of ['fleet', 'fleet-attendance', 'manager-approvals', 'finance-cartable']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 9: Treasury & Profiles (treasury-cartable, treasury, profiles, personnel-profiles)', () => {
      for (const k of ['treasury-cartable', 'treasury', 'profiles', 'personnel-profiles']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 10: Base Settings & Counterparties (base-settings, counterparties); projects-and-sections is a redirect with no page permission', () => {
      expect(hasRoutePermission('projects-and-sections', ['unrelated_perm'])).toBe(true);
      for (const k of ['base-settings', 'counterparties']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 11: Employee Portal Basic (employee-portal, employee-attendance, employee-fleet, employee-invoices)', () => {
      for (const k of ['employee-portal', 'employee-attendance', 'employee-fleet', 'employee-invoices']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 12: Employee Portal Actions (employee-petty-cash, employee-new-vehicle, employee-new-personnel)', () => {
      for (const k of ['employee-petty-cash', 'employee-new-vehicle', 'employee-new-personnel']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 13: Supervisor Portal Basic (supervisor-attendance, supervisor-fleet, supervisor-invoices, supervisor-petty-cash)', () => {
      for (const k of ['supervisor-attendance', 'supervisor-fleet', 'supervisor-invoices', 'supervisor-petty-cash']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 14: Supervisor Portal Actions (supervisor-new-profiles, supervisor-period-lock)', () => {
      for (const k of ['supervisor-new-profiles', 'supervisor-period-lock']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 15: Accountant Portal (accountant-payroll, accountant-fleet, accountant-invoices, accountant-petty-cash, accountant-diskettes, accountant-counterparties)', () => {
      for (const k of ['accountant-payroll', 'accountant-fleet', 'accountant-invoices', 'accountant-petty-cash', 'accountant-diskettes', 'accountant-counterparties']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 16: Manager Portal (manager-dashboard, manager-budget, manager-contracts, manager-reports)', () => {
      for (const k of ['manager-dashboard', 'manager-budget', 'manager-contracts', 'manager-reports']) {
        verifyRouteKey(k);
      }
    });

    it('validates Group 17: Treasurer Portal (treasurer-disbursements, treasurer-invoices, treasurer-bank-accounts, treasurer-cheques, treasurer-reconciliation)', () => {
      for (const k of ['treasurer-disbursements', 'treasurer-invoices', 'treasurer-bank-accounts', 'treasurer-cheques', 'treasurer-reconciliation']) {
        verifyRouteKey(k);
      }
    });
  });

  // =========================================================================
  // Section 2: AuthGuard decisions on 6 key pages for 5 users
  // =========================================================================
  describe('AuthGuard characterization', () => {
    let router: Router;
    let mockAuth: {
      isLoggedIn: ReturnType<typeof vi.fn>;
      user: ReturnType<typeof vi.fn>;
      userPermissions: ReturnType<typeof vi.fn>;
    };
    let mockPersonaService: {
      canAccessRoute: ReturnType<typeof vi.fn>;
      getDefaultRouteForRole: ReturnType<typeof vi.fn>;
      hasWarehouseAccess: ReturnType<typeof vi.fn>;
      hasPersonnelAccess: ReturnType<typeof vi.fn>;
      canAccessApp: ReturnType<typeof vi.fn>;
    };
    let mockActiveCompanyService: {
      hasCompanyDocumentsAccess: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
      mockAuth = {
        isLoggedIn: vi.fn().mockReturnValue(true),
        user: vi.fn().mockReturnValue(null),
        userPermissions: vi.fn().mockReturnValue([]),
      };

      mockPersonaService = {
        canAccessRoute: vi.fn().mockReturnValue(true),
        getDefaultRouteForRole: vi.fn().mockReturnValue('/role-home'),
        hasWarehouseAccess: vi.fn().mockReturnValue(false),
        hasPersonnelAccess: vi.fn().mockReturnValue(false),
        canAccessApp: vi.fn().mockReturnValue(false),
      };

      mockActiveCompanyService = {
        hasCompanyDocumentsAccess: vi.fn().mockReturnValue(false),
      };

      await TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: mockAuth },
          { provide: AppPersonaService, useValue: mockPersonaService },
          { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        ],
      });

      const registry = TestBed.inject(ModuleRegistryService);
      registry.setInstalledModules(['warehouse', 'accounting']);

      router = TestBed.inject(Router);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function evaluateGuardForPages(): Record<string, boolean | string> {
      const PAGES = [
        { path: 'docs', url: '/app/warehouse/docs' },
        { path: 'count-tracking', url: '/app/warehouse/count-tracking' },
        { path: 'payroll', url: '/app/finance/payroll' },
        { path: 'treasurer-reconciliation', url: '/app/finance/treasurer-reconciliation' },
        { path: 'feed_approvals', url: '/app/warehouse/feed_approvals' },
        { path: 'users', url: '/app/operations/users' },
      ];

      const results: Record<string, boolean | string> = {};
      for (const page of PAGES) {
        const guardRes = TestBed.runInInjectionContext(() =>
          AuthGuard(
            { routeConfig: { path: page.path } } as any,
            { url: page.url } as any
          )
        );
        results[page.url] = guardRes === true ? true : router.serializeUrl(guardRes as UrlTree);
      }
      return results;
    }

    it('1. Admin user (admin_all) has access to all pages', () => {
      mockAuth.user.mockReturnValue({ id: 1, username: 'admin', is_superuser: true });
      mockAuth.userPermissions.mockReturnValue(['admin_all']);
      mockPersonaService.hasWarehouseAccess.mockReturnValue(true);
      mockPersonaService.hasPersonnelAccess.mockReturnValue(true);
      mockPersonaService.canAccessApp.mockReturnValue(true);

      const results = evaluateGuardForPages();

      expect(results).toEqual({
        '/app/warehouse/docs': true,
        '/app/warehouse/count-tracking': true,
        '/app/finance/payroll': true,
        '/app/finance/treasurer-reconciliation': true,
        '/app/warehouse/feed_approvals': true,
        '/app/operations/users': true,
      });
    });

    it('2. Warehouse-only user (view_wh_docs) guard decisions', () => {
      mockAuth.user.mockReturnValue({ id: 2, username: 'wh_user', is_superuser: false });
      mockAuth.userPermissions.mockReturnValue(['view_wh_docs']);
      mockPersonaService.hasWarehouseAccess.mockReturnValue(true);
      mockPersonaService.hasPersonnelAccess.mockReturnValue(false);
      mockPersonaService.canAccessApp.mockImplementation((c: string) => c === 'warehouse');

      const results = evaluateGuardForPages();

      expect(results).toEqual({
        '/app/warehouse/docs': true,
        '/app/warehouse/count-tracking': '/role-home',
        '/app/finance/payroll': '/app/warehouse/dashboard',
        '/app/finance/treasurer-reconciliation': '/app/warehouse/dashboard',
        '/app/warehouse/feed_approvals': '/role-home',
        '/app/operations/users': '/role-home',
      });
    });

    it('3. Finance-only user (view_sys_payroll) guard decisions', () => {
      mockAuth.user.mockReturnValue({ id: 3, username: 'fin_user', is_superuser: false });
      mockAuth.userPermissions.mockReturnValue(['view_sys_payroll']);
      mockPersonaService.hasWarehouseAccess.mockReturnValue(false);
      mockPersonaService.hasPersonnelAccess.mockReturnValue(true);
      mockPersonaService.canAccessApp.mockImplementation((c: string) => c === 'accounting' || c === 'finance' || c === 'personnel');

      const results = evaluateGuardForPages();

      expect(results).toEqual({
        '/app/warehouse/docs': '/app/finance',
        '/app/warehouse/count-tracking': '/app/finance',
        '/app/finance/payroll': true,
        '/app/finance/treasurer-reconciliation': '/role-home',
        '/app/warehouse/feed_approvals': '/app/finance',
        '/app/operations/users': '/role-home',
      });
    });

    it('4. Both modules user (view_wh_docs, view_sys_payroll) guard decisions', () => {
      mockAuth.user.mockReturnValue({ id: 4, username: 'both_user', is_superuser: false });
      mockAuth.userPermissions.mockReturnValue(['view_wh_docs', 'view_sys_payroll']);
      mockPersonaService.hasWarehouseAccess.mockReturnValue(true);
      mockPersonaService.hasPersonnelAccess.mockReturnValue(true);
      mockPersonaService.canAccessApp.mockReturnValue(true);

      const results = evaluateGuardForPages();

      expect(results).toEqual({
        '/app/warehouse/docs': true,
        '/app/warehouse/count-tracking': '/role-home',
        '/app/finance/payroll': true,
        '/app/finance/treasurer-reconciliation': '/role-home',
        '/app/warehouse/feed_approvals': '/role-home',
        '/app/operations/users': '/role-home',
      });
    });

    it('5. Neither module user (view_sys_users) guard decisions', () => {
      mockAuth.user.mockReturnValue({ id: 5, username: 'neither_user', is_superuser: false });
      mockAuth.userPermissions.mockReturnValue(['view_sys_users']);
      mockPersonaService.hasWarehouseAccess.mockReturnValue(false);
      mockPersonaService.hasPersonnelAccess.mockReturnValue(false);
      mockPersonaService.canAccessApp.mockReturnValue(false);

      const results = evaluateGuardForPages();

      expect(results).toEqual({
        '/app/warehouse/docs': '/login',
        '/app/warehouse/count-tracking': '/login',
        '/app/finance/payroll': '/login',
        '/app/finance/treasurer-reconciliation': '/login',
        '/app/warehouse/feed_approvals': '/login',
        '/app/operations/users': true,
      });
    });
  });
});
