/**
 * مجوزهای ماژول حسابداری در صفحهٔ نقش‌ها.
 * کدها همان PERMISSION_CODENAMES مانیفست بک‌اند (`backend/modules/accounting/module.py`)؛ نگهبان ۵۷ برابری را می‌سنجد.
 */
export const ACCOUNTING_PERMISSION_CODENAMES: string[] = [
  'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'view_sys_payroll',
  'view_sys_fleet_settlement', 'view_sys_treasury', 'can_act_as_operator', 'can_act_as_workshop_supervisor',
  'can_act_as_accountant', 'can_act_as_company_manager', 'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
  'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'perm_approve_personnel_finance', 'perm_approve_fleet_finance',
  'perm_lock_work_period', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
  'perm_delete_personnel_nomovement', 'perm_delete_vehicle_nomovement'
];

/** نام کوتاه مجوزهای این ماژول در چیپ‌های دسترسی */
export const ACCOUNTING_SHORT_PERMISSION_NAMES: Record<string, string> = {
  'view_sys_personnel_attendance': 'کارکرد پرسنل',
  'view_sys_fleet_attendance': 'کارکرد ناوگان',
  'view_sys_payroll': 'حقوق و دستمزد',
  'view_sys_fleet_settlement': 'تسویه ناوگان',
  'view_sys_personnel': 'مدیریت پرسنل',
  'view_sys_treasury': 'خزانه‌داری',
  'perm_approve_personnel_supervisor': 'تایید سرپرست پرسنل',
  'perm_approve_personnel_manager': 'تایید مدیر پرسنل',
  'perm_approve_personnel_finance': 'تایید مالی پرسنل',
  'perm_delete_personnel_nomovement': 'حذف پرسنل فاقد سابقه',
  'perm_delete_vehicle_nomovement': 'حذف خودرو فاقد سابقه',
  'perm_approve_fleet_supervisor': 'تایید سرپرست ناوگان',
  'perm_approve_fleet_manager': 'تایید مدیر ناوگان',
  'perm_approve_fleet_finance': 'تایید مالی ناوگان',
  'perm_manager_payment_authorize': 'مجوز پرداخت مدیر',
  'perm_treasury_disburse_action': 'واریز خزانه‌داری',
  'perm_lock_work_period': 'قفل کارکرد ماهانه',
  'can_act_as_operator': 'کارمند کارگاه',
  'can_act_as_workshop_supervisor': 'سرپرست کارگاه',
  'can_act_as_accountant': 'حسابدار',
  'can_act_as_company_manager': 'مدیر شرکت'
};
