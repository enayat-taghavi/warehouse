import { ModuleRouteAccess } from '../../core/modules/module-contract';
import { permissionAlias } from '../../core/modules/permission-alias-token';

export const ACCOUNTING_ROUTE_ACCESS: ModuleRouteAccess = {
  deniedPageFallback: 'otherModuleDefault',
  guardAccessPermissions: [
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement',
    'perm_lock_work_period', 'perm_approve_personnel_supervisor', 'perm_approve_personnel_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager',
    'perm_approve_fleet_finance', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'perm_invoice_record', 'perm_invoice_approve', 'perm_invoice_review', 'perm_petty_cash_manage', 'perm_counterparty_manage',
    'perm_accounting_reports'
  ],
  pagePermissions: {
    'finance-audit': ['view_sys_payroll', 'perm_sys_logs', 'admin_all'],
    'personnel': ['view_sys_payroll', 'admin_all'],
    'payroll': ['view_sys_payroll', 'admin_all'],
    'fleet-settlement': ['view_sys_fleet_settlement', 'view_sys_payroll', 'admin_all'],
    'attendance': ['view_sys_personnel_attendance', permissionAlias('attendance_entry'), 'perm_register_daily_attendance', permissionAlias('attendance_supervisor'), 'admin_all'],
    'fleet': ['view_sys_fleet_attendance', permissionAlias('attendance_entry'), 'admin_all'],
    'fleet-attendance': ['view_sys_fleet_attendance', permissionAlias('attendance_entry'), 'admin_all'],
    'manager-approvals': ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', permissionAlias('manager_approver'), 'admin_all'],
    'finance-cartable': ['perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'view_sys_payroll', 'admin_all'],
    'treasury-cartable': ['perm_treasury_disburse_action', 'admin_all'],
    'treasury': ['perm_treasury_disburse_action', 'admin_all'],
    'profiles': ['view_sys_personnel', 'admin_all'],
    'personnel-profiles': ['view_sys_personnel', 'admin_all'],
    'base-settings': [
      'view_sys_settings', 'perm_sys_settings', 'admin_all',
      'view_sys_payroll', 'perm_approve_personnel_finance',
      'perm_manager_payment_authorize', 'perm_approve_personnel_manager'
    ],
    'counterparties': ['view_sys_payroll', 'view_sys_projects', 'perm_counterparty_manage', 'admin_all'],
    'employee-portal': ['view_sys_personnel_attendance', 'admin_all'],
    'employee-attendance': ['view_sys_personnel_attendance', 'admin_all'],
    'employee-fleet': ['view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
    'employee-invoices': ['view_sys_personnel_attendance', 'perm_invoice_record', 'admin_all'],
    // تب یکپارچهٔ «فاکتورها»: اجتماع مجوز صفحه‌های قبلی؛ هر زیرتب با کلید صفحهٔ قبلی خودش (زیر) سنجیده می‌شود
    'invoices': [
      'view_sys_personnel_attendance', 'perm_invoice_record', 'perm_invoice_approve', 'view_sys_payroll', 'perm_invoice_review',
      'perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', permissionAlias('manager_approver'),
      'perm_treasury_disburse_action', 'admin_all'
    ],
    // خزانه‌دار شارژ و صورت‌حساب تنخواه را از مسیر «کارهای من» همین صفحه واریز می‌کند (canTreasuryPay)
    'employee-petty-cash': ['view_sys_personnel_attendance', 'perm_petty_cash_manage', 'perm_treasury_disburse_action', 'admin_all'],
    'employee-new-vehicle': ['view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
    'employee-new-personnel': ['view_sys_personnel_attendance', 'view_sys_payroll', 'admin_all'],
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
    'treasurer-petty-cash': ['perm_treasury_disburse_action', 'admin_all'],
    'treasurer-bank-accounts': ['perm_treasury_disburse_action', 'admin_all'],
    'treasurer-cheques': ['perm_treasury_disburse_action', 'admin_all'],
    'treasurer-reconciliation': ['perm_treasury_disburse_action', 'admin_all']
  },
  loginPermissions: [
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement',
    'perm_approve_personnel_finance', 'perm_treasury_disburse_action',
    'perm_approve_personnel_manager'
  ],
  loginActiveAppModule: 'personnel',
  resolveLoginRoute: (): string => '/app/finance'
};
