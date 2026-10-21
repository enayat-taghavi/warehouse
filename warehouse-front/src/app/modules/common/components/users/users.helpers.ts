import { ModuleRolePreset } from '../../../../core/modules/module-contract';

/** قالب آمادهٔ نقش؛ قالب‌های ماژول‌ها از extension users.rolePresets هر ماژول می‌آیند */
export type RolePreset = ModuleRolePreset;

/** قالب‌های سراسری سامانه (بیرون از ماژول‌ها) */
export const SYSTEM_ROLE_PRESETS: RolePreset[] = [
  // ─── دسته ۳: مدیریت و کلان سیستم (Infrastructure & SOC) ───
  {
    id: 'admin_all',
    title: 'مدیر کل سیستم (سوپریوزر)',
    category: 'system',
    categoryTitle: 'کلان سیستم',
    color: '#4f46e5',
    icon: '⚡',
    description: 'اعطای ۱۰۰٪ تمام دسترسی‌های سیستمی، عملیاتی، مالی، اتاق فرماندهی مرکز عملیات و بازیابی',
    permissionCodenames: 'ALL'
  }
];

export const SHORT_PERMISSION_NAMES: Record<string, string> = {
  // کارکرد و پرسنل و ناوگان
  'view_sys_personnel_attendance': 'کارکرد پرسنل',
  'view_sys_fleet_attendance': 'کارکرد ناوگان',
  'view_sys_payroll': 'حقوق و دستمزد',
  'view_sys_fleet_settlement': 'تسویه ناوگان',
  'view_sys_personnel': 'مدیریت پرسنل',
  'view_sys_treasury': 'خزانه‌داری',
  'view_wh_attendance': 'کارکرد ناوگان انبار',

  // تاییدات و کارتابل‌ها
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
  'perm_inventory_finalize': 'بستن انبارگردانی',
  'perm_doc_approve_action': 'امضا و تایید اسناد',
  'perm_feed_approve_action': 'تایید فیدهای گمرکی',
  'can_act_as_counter': 'شمارشگر میدانی',
  'can_act_as_supervisor': 'سرپرست شمارش (انبار)',
  'can_act_as_wh_supervisor': 'سرپرست شمارش انبار',
  'can_act_as_manager': 'مدیر انبار (انبار)',
  'can_act_as_wh_manager': 'مدیر انبار و شمارش',
  'can_act_as_doc_worker': 'کارشناس اسناد',
  'can_act_as_doc_supervisor': 'سرپرست اسناد',
  'can_act_as_operator': 'کارمند کارگاه',
  'can_act_as_workshop_supervisor': 'سرپرست کارگاه',
  'can_act_as_accountant': 'حسابدار',
  'can_act_as_company_manager': 'مدیر شرکت',
  'perm_manage_projects_sections': 'پروژه‌ها و بخش‌ها',

  // عملیات انبار و شمارش
  'view_sys_counter': 'میزکار شمارش کور',
  'view_sys_supervisor': 'کارتابل سرپرست',
  'view_sys_manager_review': 'بررسی مدیر انبار',
  'view_sys_recounts': 'مغایرت و بازشماری',
  'view_wh_dashboard': 'داشبورد انبار',
  'view_wh_docs': 'مدیریت کالا',
  'view_wh_dispatch': 'تخصیص کالا',
  'view_wh_customs': 'مالی و گمرکی',
  'view_wh_doc_approvals': 'تاییدات اسناد',
  'view_wh_feeding': 'تغذیه MT',
  'view_wh_feed_approvals': 'تاییدات تغذیه',
  'view_wh_labels': 'چاپ لیبل',
  'view_wh_label_designer': 'طراحی لیبل',
  'view_wh_audit': 'ممیزی انبار',
  'view_wh_settings': 'تنظیمات انبار',
  'perm_rec_dispatch': 'تخصیص به شمارشگر',
  'perm_rec_recount': 'دستور بازشماری',
  'perm_rec_label': 'دستور چاپ لیبل',
  'perm_rec_import': 'آپلود فایل پایه',
  'perm_wh_create': 'تعریف انبار جدید',
  'perm_wh_edit': 'ویرایش انبار',
  'perm_wh_freeze': 'فریز عملیات انبار',

  // کلان سیستم
  'view_sys_dashboard': 'داشبورد کلان',
  'view_sys_users': 'کاربران و نقش‌ها',
  'view_sys_projects': 'انبارها و پروژه‌ها',
  'view_sys_id_cards': 'صدور کارت پرسنلی',
  'view_sys_export': 'صدور فایل تغذیه',
  'view_sys_reports': 'گزارش‌ساز',
  'view_sys_settings': 'تنظیمات سیستم',
  'perm_sys_settings': 'تنظیمات کلان',
  'perm_sys_logs': 'لاگ‌های امنیتی',
  'perm_usr_add': 'ثبت پرسنل جدید',
  'perm_usr_edit': 'ویرایش پرونده',
  'perm_usr_role': 'تغییر ساختار نقش‌ها',

  // دسترسی‌های حساس
  'perm_rollback_data': 'احیای جامع داده‌ها',
  'perm_rollback_single': 'بازگردانی تکی سند',
  'perm_rollback_bulk': 'بازگردانی گروهی',
  'perm_restore_deleted': 'احیای حذف‌شده‌ها',
  'perm_sys_backup_manage': 'مدیریت فایل پشتیبان',
  'perm_sys_backup_restore': 'بازیابی دیتابیس',
  'perm_sys_audit_export': 'خروجی لاگ ممیزی',
  'perm_sys_purge_logs': 'حذف لاگ ممیزی',
  'perm_sys_hard_delete': 'حذف قطعی داده‌ها',
  'perm_sys_emergency_freeze': 'فریز اضطراری کل سیستم',
  'perm_sys_factory_reset': 'ریست فکتوری سیستم',

  // عملیات پایه انبار و کالا
  'view_warehouse': 'مشاهده انبارها',
  'add_warehouse': 'تعریف انبار جدید',
  'change_warehouse': 'ویرایش انبار',
  'delete_warehouse': 'حذف انبار',
  'view_record': 'مشاهده رکوردهای شمارش',
  'add_record': 'ثبت رکورد شمارش',
  'change_record': 'ویرایش رکورد شمارش',
  'delete_record': 'حذف رکورد شمارش',

  // عملیات پایه کاربران و گروه‌ها
  'view_customuser': 'مشاهده کاربران',
  'add_customuser': 'تعریف کاربر جدید',
  'change_customuser': 'ویرایش اطلاعات کاربر',
  'delete_customuser': 'حذف کاربر',
  'view_group': 'مشاهده گروه‌ها',
  'add_group': 'تعریف گروه جدید',
  'change_group': 'ویرایش گروه',
  'delete_group': 'حذف گروه'
};

export function getShortPermissionName(perm: any): string {
  if (!perm) return '';
  return SHORT_PERMISSION_NAMES[perm.codename] || perm.name || '';
}

export function getRolePermissionPercent(role: any, totalPermsCount: number): number {
  if (!role || !totalPermsCount || totalPermsCount === 0) return 0;
  const count = (role.permissions || []).length;
  return Math.min(100, Math.round((count / totalPermsCount) * 100));
}

export function getRoleDepthMargin(role: any, allRoles: any[]): number {
  let depth = 0;
  let current = role;
  const visited = new Set<number>();
  while (current && current.parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    depth++;
    current = allRoles.find(r => r.id === current.parent_id);
  }
  return Math.min(depth * 16, 64);
}
