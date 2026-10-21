import { ModuleRouteAccess } from '../../core/modules/module-contract';
import { permissionAlias } from '../../core/modules/permission-alias-token';

export const ACCOUNTING_ROUTE_ACCESS: ModuleRouteAccess = {
  deniedPageFallback: 'otherModuleDefault',
  guardAccessPermissions: [
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
    'perm_lock_work_period', 'perm_approve_personnel_supervisor', 'perm_approve_personnel_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager',
    'perm_approve_fleet_finance', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'perm_manage_projects_sections',
    'can_act_as_accountant', 'can_act_as_operator', 'can_act_as_workshop_supervisor', 'can_act_as_company_manager'
  ],
  pagePermissions: {
    'finance-audit': ['view_sys_payroll', 'perm_sys_logs', 'admin_all'],
    'personnel': ['view_sys_payroll', 'admin_all'],
    'payroll': ['view_sys_payroll', 'admin_all'],
    'fleet-settlement': ['view_sys_fleet_settlement', 'view_sys_payroll', 'admin_all'],
    'attendance': ['view_sys_personnel_attendance', permissionAlias('attendance_entry'), 'perm_register_daily_attendance', 'can_act_as_operator', permissionAlias('attendance_supervisor'), 'admin_all'],
    'fleet': ['view_sys_fleet_attendance', permissionAlias('attendance_entry'), 'admin_all'],
    'fleet-attendance': ['view_sys_fleet_attendance', permissionAlias('attendance_entry'), 'admin_all'],
    'manager-approvals': ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', permissionAlias('manager_approver'), 'admin_all'],
    'finance-cartable': ['perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'view_sys_payroll', 'admin_all'],
    'treasury-cartable': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
    'treasury': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
    'profiles': ['view_sys_personnel', 'admin_all'],
    'personnel-profiles': ['view_sys_personnel', 'admin_all'],
    'base-settings': [
      'view_sys_settings', 'perm_sys_settings', 'admin_all',
      'can_act_as_accountant', 'view_sys_payroll', 'perm_approve_personnel_finance',
      'can_act_as_company_manager', 'perm_manager_payment_authorize', 'perm_approve_personnel_manager'
    ],
    'projects-and-sections': ['view_sys_projects', 'perm_manage_projects_sections', 'admin_all'],
    'counterparties': ['view_sys_payroll', 'view_sys_projects', 'admin_all'],
    'employee-portal': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'employee-attendance': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'employee-fleet': ['can_act_as_operator', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
    'employee-invoices': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'employee-petty-cash': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'employee-new-vehicle': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'employee-new-personnel': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
    'supervisor-attendance': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
    'supervisor-fleet': ['perm_approve_fleet_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
    'supervisor-invoices': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
    'supervisor-petty-cash': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
    'supervisor-new-profiles': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
    'supervisor-period-lock': ['perm_lock_work_period', 'can_act_as_workshop_supervisor', 'admin_all'],
    'accountant-payroll': ['view_sys_payroll', 'perm_approve_personnel_finance', 'can_act_as_accountant', 'admin_all'],
    'accountant-fleet': ['view_sys_fleet_settlement', 'perm_approve_fleet_finance', 'can_act_as_accountant', 'admin_all'],
    'accountant-invoices': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
    'accountant-petty-cash': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
    'accountant-diskettes': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
    'accountant-counterparties': ['view_sys_payroll', 'can_act_as_accountant', 'perm_approve_personnel_finance', 'admin_all'],
    'manager-dashboard': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'admin_all'],
    'manager-budget': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],
    'manager-contracts': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],
    'manager-reports': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],
    'treasurer-disbursements': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
    'treasurer-invoices': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
    'treasurer-bank-accounts': ['view_sys_treasury', 'admin_all'],
    'treasurer-cheques': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
    'treasurer-reconciliation': ['view_sys_treasury', 'admin_all']
  },
  loginPermissions: [
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
    'perm_approve_personnel_finance', 'perm_treasury_disburse_action',
    'perm_approve_personnel_manager', 'perm_manage_projects_sections'
  ],
  loginActiveAppModule: 'personnel',
  resolveLoginRoute: (): string => '/app/finance'
};
