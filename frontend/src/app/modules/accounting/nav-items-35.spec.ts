import { describe, it, expect } from 'vitest';
import {
  EMPLOYEE_NAV_ITEMS,
  SUPERVISOR_NAV_ITEMS,
  ACCOUNTANT_NAV_ITEMS,
  MANAGER_NAV_ITEMS,
  TREASURER_NAV_ITEMS,
  EMPLOYEE_ROLE_MARKERS,
  SUPERVISOR_ROLE_MARKERS,
  ACCOUNTANT_ROLE_MARKERS,
  MANAGER_ROLE_MARKERS,
  TREASURER_ROLE_MARKERS,
  filterRoleNavItems,
  NavItem
} from './nav-items';
import { ACCOUNTING_ROUTE_ACCESS } from './route-access';
import { resolveAccountingRoleCodes, isAccountingRouteDeniedForRole } from './personas';

describe('accounting role menus spec (step 3.5-c)', () => {
  const routeAllowed = (perms: string[]) => (id: string) => {
    const list = ACCOUNTING_ROUTE_ACCESS.pagePermissions?.[id];
    return !list || list.some(p => perms.includes(p));
  };

  const menuIds = (items: NavItem[], markers: string[], perms: string[]) =>
    filterRoleNavItems(items, {
      isAdmin: false,
      userPerms: perms,
      roleMarkers: markers,
      routeAllowed: routeAllowed(perms)
    }).map(i => i.id);

  const employeePerms = [
    'view_sys_personnel_attendance',
    'view_sys_fleet_attendance',
    'perm_invoice_record'
  ];

  const supervisorPerms = [
    'view_sys_personnel_attendance',
    'view_sys_fleet_attendance',
    'perm_approve_personnel_supervisor',
    'perm_approve_fleet_supervisor',
    'perm_lock_work_period',
    'perm_invoice_record',
    'perm_invoice_approve',
    'perm_petty_cash_manage'
  ];

  const accountantPerms = [
    'perm_approve_personnel_finance',
    'perm_approve_fleet_finance',
    'view_sys_payroll',
    'view_sys_fleet_settlement',
    'perm_invoice_record',
    'perm_invoice_review',
    'perm_petty_cash_manage',
    'perm_counterparty_manage',
    'perm_accounting_reports'
  ];

  const managerPerms = [
    'view_sys_personnel',
    'perm_delete_personnel_nomovement',
    'perm_delete_vehicle_nomovement',
    'perm_approve_personnel_manager',
    'perm_approve_fleet_manager',
    'perm_lock_work_period',
    'view_sys_payroll',
    'view_sys_fleet_settlement',
    'perm_manager_payment_authorize',
    'perm_invoice_record',
    'perm_petty_cash_manage',
    'perm_accounting_reports'
  ];

  const treasurerPerms = [
    'perm_treasury_disburse_action',
    'perm_invoice_record',
    'perm_petty_cash_manage',
    'perm_counterparty_manage'
  ];

  it('a) employee bundle: resolves operator persona and employee menu items', () => {
    const roles = resolveAccountingRoleCodes({ perms: employeePerms, userRoles: [] });
    expect(roles).toEqual(['operator']);

    const items = menuIds(EMPLOYEE_NAV_ITEMS, EMPLOYEE_ROLE_MARKERS, employeePerms);
    expect(items).toEqual([
      'employee-attendance',
      'employee-fleet',
      'employee-invoices',
      'employee-petty-cash',
      'employee-new-vehicle',
      'employee-new-personnel'
    ]);
  });

  it('b) supervisor bundle: resolves supervisor persona and supervisor menu items', () => {
    const roles = resolveAccountingRoleCodes({ perms: supervisorPerms, userRoles: [] });
    expect(roles).toEqual(['supervisor']);

    const items = menuIds(SUPERVISOR_NAV_ITEMS, SUPERVISOR_ROLE_MARKERS, supervisorPerms);
    expect(items).toEqual([
      'supervisor-personnel',
      'supervisor-fleet',
      'employee-invoices',
      'supervisor-invoices',
      'supervisor-petty-cash',
      'supervisor-period-lock'
    ]);
  });

  it('c) accountant bundle: resolves accountant persona and accountant menu items (profiles is hidden)', () => {
    const roles = resolveAccountingRoleCodes({ perms: accountantPerms, userRoles: [] });
    expect(roles).toEqual(['accountant']);

    const items = menuIds(ACCOUNTANT_NAV_ITEMS, ACCOUNTANT_ROLE_MARKERS, accountantPerms);
    expect(items).toEqual([
      'accountant-personnel',
      'accountant-payroll',
      'accountant-fleet',
      'employee-invoices',
      'accountant-invoices',
      'accountant-petty-cash',
      'accountant-diskettes',
      'accountant-counterparties',
      'base-settings',
      'manager-reports'
    ]);
    // the accountant persona opens the reports page (plan 4.7 d8) but no other manager page
    expect(isAccountingRouteDeniedForRole('accountant', '/app/finance/manager-reports')).toBe(false);
    expect(isAccountingRouteDeniedForRole('accountant', '/app/finance/manager-dashboard')).toBe(true);
  });

  it('d) manager bundle: resolves manager persona and manager menu items', () => {
    const roles = resolveAccountingRoleCodes({ perms: managerPerms, userRoles: [] });
    expect(roles).toEqual(['manager']);

    const items = menuIds(MANAGER_NAV_ITEMS, MANAGER_ROLE_MARKERS, managerPerms);
    expect(items).toEqual([
      'manager-dashboard',
      'manager-personnel',
      'manager-fleet',
      'manager-approvals',
      'employee-invoices',
      'manager-budget',
      'manager-reports',
      'base-settings'
    ]);
  });

  it('d2) supervisor, accountant and manager personas open the invoice entry page, but no other employee page', () => {
    for (const role of ['supervisor', 'accountant', 'manager']) {
      expect(isAccountingRouteDeniedForRole(role, '/app/finance/employee-invoices')).toBe(false);
      expect(isAccountingRouteDeniedForRole(role, '/app/finance/employee-attendance')).toBe(true);
    }
    expect(isAccountingRouteDeniedForRole('treasury', '/app/finance/employee-invoices')).toBe(true);
  });

  it('e) treasurer bundle: resolves treasury persona and treasurer menu items', () => {
    const roles = resolveAccountingRoleCodes({ perms: treasurerPerms, userRoles: [] });
    expect(roles).toEqual(['treasury']);

    const items = menuIds(TREASURER_NAV_ITEMS, TREASURER_ROLE_MARKERS, treasurerPerms);
    expect(items).toEqual([
      'treasurer-disbursements',
      'treasurer-invoices',
      'treasurer-bank-accounts',
      'treasurer-cheques',
      'treasurer-reconciliation'
    ]);
  });

  it('f) supervisor bundle without perm_invoice_approve: supervisor menu hides invoices and petty cash', () => {
    const perms = supervisorPerms.filter(p => p !== 'perm_invoice_approve');
    const items = menuIds(SUPERVISOR_NAV_ITEMS, SUPERVISOR_ROLE_MARKERS, perms);
    expect(items).toEqual([
      'supervisor-personnel',
      'supervisor-fleet',
      'employee-invoices',
      'supervisor-period-lock'
    ]);
  });

  // treasurer has perm_counterparty_manage, so only that item passes; the accountant menu is never shown to the treasury persona
  it('g) cross-role: menus of another role stay empty', () => {
    // the invoice entry passes on its own perm_invoice_record; the layout shows only the active persona's menu
    expect(menuIds(SUPERVISOR_NAV_ITEMS, SUPERVISOR_ROLE_MARKERS, employeePerms)).toEqual(['employee-invoices']);
    // the accountant bundle holds perm_accounting_reports, so only the reports page of the manager menu opens (plan 4.7 d8)
    expect(menuIds(MANAGER_NAV_ITEMS, MANAGER_ROLE_MARKERS, accountantPerms)).toEqual(['employee-invoices', 'manager-reports']);
    expect(menuIds(TREASURER_NAV_ITEMS, TREASURER_ROLE_MARKERS, managerPerms)).toEqual([]);
    expect(menuIds(ACCOUNTANT_NAV_ITEMS, ACCOUNTANT_ROLE_MARKERS, treasurerPerms)).toEqual(['employee-invoices', 'accountant-counterparties']);
  });

  it('h) none of the five removed codes appears in any nav item, role marker, or route access permission', () => {
    const removedCodes = [
      'can_act_as_operator',
      'can_act_as_workshop_supervisor',
      'can_act_as_accountant',
      'can_act_as_company_manager',
      'view_sys_treasury'
    ];

    const allNavItems = [
      ...EMPLOYEE_NAV_ITEMS,
      ...SUPERVISOR_NAV_ITEMS,
      ...ACCOUNTANT_NAV_ITEMS,
      ...MANAGER_NAV_ITEMS,
      ...TREASURER_NAV_ITEMS
    ];
    const navPermissions = allNavItems.map(i => i.permission);

    const allRoleMarkers = [
      ...EMPLOYEE_ROLE_MARKERS,
      ...SUPERVISOR_ROLE_MARKERS,
      ...ACCOUNTANT_ROLE_MARKERS,
      ...MANAGER_ROLE_MARKERS,
      ...TREASURER_ROLE_MARKERS
    ];

    const pagePermissions = Object.values(ACCOUNTING_ROUTE_ACCESS.pagePermissions ?? {}).flat();
    const guardPermissions = ACCOUNTING_ROUTE_ACCESS.guardAccessPermissions ?? [];
    const loginPermissions = ACCOUNTING_ROUTE_ACCESS.loginPermissions ?? [];

    const allCheckedCodes = [
      ...navPermissions,
      ...allRoleMarkers,
      ...pagePermissions,
      ...guardPermissions,
      ...loginPermissions
    ];

    const matchedRemovedCodes = removedCodes.filter(code => allCheckedCodes.includes(code));
    expect(matchedRemovedCodes).toEqual([]);
  });
});
