import { ACCOUNTING_ENTITY_ICONS } from './entity-icons';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  module?: 'warehouse' | 'accounting' | 'platform';
  isAccounting?: boolean;
}

// منوی عمومی «کارکرد و حسابداری» برچیده شد؛ هر آیتم به منوی نقش خودش منتقل یا بازنشسته شد.
// مرجع: Documents/Organization_Admin_And_Menu_Architecture/implementation_plan_org_admin_menu.md

export const ORG_ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'projects-and-sections', label: 'پروژه‌ها و بخش‌ها', icon: ACCOUNTING_ENTITY_ICONS.projectsAndSections, permission: 'perm_manage_projects_sections', module: 'accounting', isAccounting: true },
];

export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { id: 'employee-attendance', label: 'کارکرد پرسنل', icon: ACCOUNTING_ENTITY_ICONS.attendance, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
  { id: 'employee-fleet', label: 'تردد ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
  { id: 'employee-petty-cash', label: 'مدیریت تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
  { id: 'employee-new-vehicle', label: 'تعریف خودرو', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
  { id: 'employee-new-personnel', label: 'تعریف پرسنل', icon: ACCOUNTING_ENTITY_ICONS.newPersonnel, permission: 'can_act_as_operator', module: 'accounting', isAccounting: true },
];

export const SUPERVISOR_NAV_ITEMS: NavItem[] = [
  { id: 'supervisor-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'perm_approve_personnel_supervisor', module: 'accounting', isAccounting: true },
  { id: 'supervisor-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'perm_approve_fleet_supervisor', module: 'accounting', isAccounting: true },
  { id: 'supervisor-invoices', label: 'تایید فاکتورها', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'supervisor-petty-cash', label: 'تایید تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'supervisor-period-lock', label: 'بستن دوره ماهانه', icon: ACCOUNTING_ENTITY_ICONS.periodLock, permission: 'perm_lock_work_period', module: 'accounting', isAccounting: true },
];

export const ACCOUNTANT_NAV_ITEMS: NavItem[] = [
  { id: 'accountant-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-payroll', label: 'حقوق و دستمزد', icon: ACCOUNTING_ENTITY_ICONS.payroll, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'view_sys_fleet_settlement', module: 'accounting', isAccounting: true },
  { id: 'accountant-invoices', label: 'ممیزی فاکتورها', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-petty-cash', label: 'رسیدگی تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-diskettes', label: 'دیسکت‌های بیمه و مالیات', icon: ACCOUNTING_ENTITY_ICONS.diskettes, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-counterparties', label: 'طرف‌حساب‌های مالی', icon: ACCOUNTING_ENTITY_ICONS.counterparties, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'profiles', label: 'بانک پرونده‌ها', icon: ACCOUNTING_ENTITY_ICONS.profilesArchive, permission: 'view_sys_personnel', module: 'accounting', isAccounting: true },
  { id: 'base-settings', label: 'تنظیمات پایه حقوق', icon: 'settings', permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
];

export const MANAGER_NAV_ITEMS: NavItem[] = [
  { id: 'manager-dashboard', label: 'داشبورد هوش مالی', icon: 'bar-chart-2', permission: 'can_act_as_company_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'perm_approve_personnel_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'perm_approve_fleet_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-approvals', label: 'کارتابل تاییدات', icon: ACCOUNTING_ENTITY_ICONS.approvals, permission: 'perm_approve_personnel_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-budget', label: 'کنترل بودجه', icon: ACCOUNTING_ENTITY_ICONS.budget, permission: 'can_act_as_company_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-reports', label: 'گزارش‌های مدیریتی', icon: 'bar-chart-2', permission: 'can_act_as_company_manager', module: 'accounting', isAccounting: true },
  { id: 'base-settings', label: 'تنظیمات پایه حقوق', icon: 'settings', permission: 'can_act_as_company_manager', module: 'accounting', isAccounting: true },
];

export const TREASURER_NAV_ITEMS: NavItem[] = [
  { id: 'treasurer-disbursements', label: 'پرداخت حقوق و ناوگان', icon: ACCOUNTING_ENTITY_ICONS.payroll, permission: 'view_sys_treasury', module: 'accounting', isAccounting: true },
  { id: 'treasurer-invoices', label: 'تسویه فاکتور و تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'view_sys_treasury', module: 'accounting', isAccounting: true },
  { id: 'treasurer-bank-accounts', label: 'حساب‌های بانکی و صندوق', icon: ACCOUNTING_ENTITY_ICONS.bankAccounts, permission: 'view_sys_treasury', module: 'accounting', isAccounting: true },
  { id: 'treasurer-cheques', label: 'مدیریت چک و اسناد', icon: ACCOUNTING_ENTITY_ICONS.cheques, permission: 'view_sys_treasury', module: 'accounting', isAccounting: true },
  { id: 'treasurer-reconciliation', label: 'مغایرت‌گیری و نقدینگی', icon: ACCOUNTING_ENTITY_ICONS.reconciliation, permission: 'view_sys_treasury', module: 'accounting', isAccounting: true },
];

/** نشانگرهای هر نقش؛ همان مجوزهایی که پرسونای نقش را برای کاربر فعال می‌کنند (app-persona.service). */
export const EMPLOYEE_ROLE_MARKERS = ['can_act_as_operator'];
export const SUPERVISOR_ROLE_MARKERS = ['can_act_as_workshop_supervisor', 'perm_approve_personnel_supervisor'];
export const ACCOUNTANT_ROLE_MARKERS = ['can_act_as_accountant', 'view_sys_payroll', 'perm_approve_personnel_finance'];
export const MANAGER_ROLE_MARKERS = ['can_act_as_company_manager', 'perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager'];
export const TREASURER_ROLE_MARKERS = ['view_sys_treasury', 'perm_treasury_disburse_action'];
export const ORG_ADMIN_ROLE_MARKERS = ['perm_manage_projects_sections'];

/**
 * آیتم‌های قابل نمایش یک منوی نقش: کاربر باید نشانگر نقش (یا مجوز خود آیتم) را داشته باشد
 * و گارد مسیر (`routeAllowed`، همان ROUTE_PERMISSIONS) هم او را رد نکند؛
 * تا لینکی که کلیکش برگشت می‌خورد نمایش داده نشود.
 */
export function filterRoleNavItems(
  items: NavItem[],
  opts: { isAdmin: boolean; userPerms: string[]; roleMarkers: string[]; routeAllowed: (id: string) => boolean }
): NavItem[] {
  if (opts.isAdmin) return items;
  const hasRoleMarker = opts.roleMarkers.some(m => opts.userPerms.includes(m));
  return items.filter(item =>
    (hasRoleMarker || opts.userPerms.includes(item.permission)) && opts.routeAllowed(item.id)
  );
}





