import { PLATFORM_ENTITY_ICONS } from '../../shared/icons/semantic-icons';
import { ACCOUNTING_ENTITY_ICONS } from './entity-icons';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  module?: string;
  isAccounting?: boolean;
  sectionKey?: string;
}

// منوی عمومی «کارکرد و حسابداری» برچیده شد؛ هر آیتم به منوی نقش خودش منتقل یا بازنشسته شد.
// مرجع: Documents/Organization_Admin_And_Menu_Architecture/implementation_plan_org_admin_menu.md

export const ORG_ADMIN_NAV_ITEMS: NavItem[] = [
  // تعریف پروژه و بخش در تب «پروژه‌ها و بخش‌ها» استودیوی شرکت (هسته) است؛ این مسیر به همان تب هدایت می‌شود.
  // دسترسی از سطح «نوشتن» بخش projects شرکت می‌آید، نه از مجوز؛ پرسونای فعال org_admin خودش نشانگر است
  { id: 'projects-and-sections', label: 'پروژه‌ها و بخش‌ها', icon: PLATFORM_ENTITY_ICONS.projects, permission: '', module: 'accounting', isAccounting: true },
];

export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { id: 'employee-attendance', label: 'کارکرد پرسنل', icon: ACCOUNTING_ENTITY_ICONS.attendance, permission: 'view_sys_personnel_attendance', module: 'accounting', isAccounting: true },
  { id: 'employee-fleet', label: 'تردد ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'view_sys_fleet_attendance', module: 'accounting', isAccounting: true, sectionKey: 'accounting.fleet' },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_record', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'employee-petty-cash', label: 'مدیریت تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'perm_petty_cash_manage', module: 'accounting', isAccounting: true, sectionKey: 'accounting.petty_cash' },
  { id: 'employee-new-vehicle', label: 'تعریف خودرو', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'view_sys_fleet_attendance', module: 'accounting', isAccounting: true, sectionKey: 'accounting.fleet' },
  { id: 'employee-new-personnel', label: 'تعریف پرسنل', icon: ACCOUNTING_ENTITY_ICONS.newPersonnel, permission: 'view_sys_personnel_attendance', module: 'accounting', isAccounting: true },
];

export const SUPERVISOR_NAV_ITEMS: NavItem[] = [
  { id: 'supervisor-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'perm_approve_personnel_supervisor', module: 'accounting', isAccounting: true },
  { id: 'supervisor-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'perm_approve_fleet_supervisor', module: 'accounting', isAccounting: true, sectionKey: 'accounting.fleet' },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_record', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'supervisor-invoices', label: 'تایید فاکتورها', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_approve', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'supervisor-petty-cash', label: 'تایید تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'perm_invoice_approve', module: 'accounting', isAccounting: true, sectionKey: 'accounting.petty_cash' },
  { id: 'supervisor-period-lock', label: 'بستن دوره ماهانه', icon: ACCOUNTING_ENTITY_ICONS.periodLock, permission: 'perm_lock_work_period', module: 'accounting', isAccounting: true },
];

export const ACCOUNTANT_NAV_ITEMS: NavItem[] = [
  { id: 'accountant-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-payroll', label: 'حقوق و دستمزد', icon: ACCOUNTING_ENTITY_ICONS.payroll, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'view_sys_fleet_settlement', module: 'accounting', isAccounting: true, sectionKey: 'accounting.fleet' },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_record', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'accountant-invoices', label: 'ممیزی فاکتورها', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_review', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'accountant-petty-cash', label: 'رسیدگی تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, permission: 'perm_invoice_review', module: 'accounting', isAccounting: true, sectionKey: 'accounting.petty_cash' },
  { id: 'accountant-diskettes', label: 'دیسکت‌های بیمه و مالیات', icon: ACCOUNTING_ENTITY_ICONS.diskettes, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'accountant-counterparties', label: 'طرف‌حساب‌های مالی', icon: ACCOUNTING_ENTITY_ICONS.counterparties, permission: 'perm_counterparty_manage', module: 'accounting', isAccounting: true },
  { id: 'profiles', label: 'بانک پرونده‌ها', icon: ACCOUNTING_ENTITY_ICONS.profilesArchive, permission: 'view_sys_personnel', module: 'accounting', isAccounting: true },
  { id: 'base-settings', label: 'تنظیمات پایه حقوق', icon: PLATFORM_ENTITY_ICONS.settings, permission: 'view_sys_payroll', module: 'accounting', isAccounting: true },
  { id: 'manager-reports', label: 'گزارش‌های مدیریتی', icon: PLATFORM_ENTITY_ICONS.reports, permission: 'perm_accounting_reports', module: 'accounting', isAccounting: true },
];

export const MANAGER_NAV_ITEMS: NavItem[] = [
  { id: 'manager-dashboard', label: 'داشبورد مدیریتی', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'perm_manager_payment_authorize', module: 'accounting', isAccounting: true },
  { id: 'manager-personnel', label: 'پرسنل', icon: ACCOUNTING_ENTITY_ICONS.personnel, permission: 'perm_approve_personnel_manager', module: 'accounting', isAccounting: true },
  { id: 'manager-fleet', label: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, permission: 'perm_approve_fleet_manager', module: 'accounting', isAccounting: true, sectionKey: 'accounting.fleet' },
  { id: 'manager-approvals', label: 'کارتابل تاییدات', icon: ACCOUNTING_ENTITY_ICONS.approvals, permission: 'perm_approve_personnel_manager', module: 'accounting', isAccounting: true },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_record', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'manager-budget', label: 'کنترل بودجه', icon: ACCOUNTING_ENTITY_ICONS.budget, permission: 'perm_manager_payment_authorize', module: 'accounting', isAccounting: true },
  { id: 'manager-reports', label: 'گزارش‌های مدیریتی', icon: PLATFORM_ENTITY_ICONS.reports, permission: 'perm_accounting_reports', module: 'accounting', isAccounting: true },
  { id: 'base-settings', label: 'تنظیمات پایه حقوق', icon: PLATFORM_ENTITY_ICONS.settings, permission: 'perm_manager_payment_authorize', module: 'accounting', isAccounting: true },
];

export const TREASURER_NAV_ITEMS: NavItem[] = [
  { id: 'treasurer-disbursements', label: 'پرداخت حقوق و ناوگان', icon: ACCOUNTING_ENTITY_ICONS.payroll, permission: 'perm_treasury_disburse_action', module: 'accounting', isAccounting: true },
  { id: 'employee-invoices', label: 'ثبت فاکتور', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_invoice_record', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'treasurer-invoices', label: 'تسویه فاکتور و تن‌خواه', icon: ACCOUNTING_ENTITY_ICONS.invoices, permission: 'perm_treasury_disburse_action', module: 'accounting', isAccounting: true, sectionKey: 'accounting.invoices' },
  { id: 'treasurer-bank-accounts', label: 'حساب‌های بانکی و صندوق', icon: ACCOUNTING_ENTITY_ICONS.bankAccounts, permission: 'perm_treasury_disburse_action', module: 'accounting', isAccounting: true },
  { id: 'treasurer-cheques', label: 'مدیریت چک و اسناد', icon: ACCOUNTING_ENTITY_ICONS.cheques, permission: 'perm_treasury_disburse_action', module: 'accounting', isAccounting: true },
  { id: 'treasurer-reconciliation', label: 'مغایرت‌گیری و نقدینگی', icon: ACCOUNTING_ENTITY_ICONS.reconciliation, permission: 'perm_treasury_disburse_action', module: 'accounting', isAccounting: true },
];

/** نشانگرهای هر نقش؛ همان مجوزهایی که پرسونای نقش را برای کاربر فعال می‌کنند (app-persona.service). */
export const EMPLOYEE_ROLE_MARKERS = ['view_sys_personnel_attendance'];
export const SUPERVISOR_ROLE_MARKERS = ['perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor'];
export const ACCOUNTANT_ROLE_MARKERS = ['view_sys_payroll', 'perm_approve_personnel_finance', 'perm_approve_fleet_finance'];
export const MANAGER_ROLE_MARKERS = ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager'];
export const TREASURER_ROLE_MARKERS = ['perm_treasury_disburse_action'];
/** تهی: نقش org_admin از سطح «نوشتن» بخش projects شرکت می‌آید (resolveAccountingRoleCodes)، نه از مجوز */
export const ORG_ADMIN_ROLE_MARKERS: string[] = [];

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
  const hasRoleMarker = opts.roleMarkers.length === 0 || opts.roleMarkers.some(m => opts.userPerms.includes(m));
  return items.filter(item =>
    (hasRoleMarker || opts.userPerms.includes(item.permission)) && opts.routeAllowed(item.id)
  );
}





