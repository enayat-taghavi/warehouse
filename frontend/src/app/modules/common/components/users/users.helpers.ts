import { AssignmentScopeLabels, ModuleRolePreset } from '../../../../core/modules/module-contract';

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
    description: 'همهٔ مجوزهای سامانه‌ای غیرحساس؛ مجوزهای حساس جداگانه و با تأیید داده می‌شوند',
    permissionCodenames: 'ALL'
  }
];

/** نام کوتاه مجوزهای پلتفرم؛ نام مجوزهای هر ماژول از users.shortPermissionNames همان ماژول می‌آید */
export const SHORT_PERMISSION_NAMES: Record<string, string> = {
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

export function getShortPermissionName(perm: any, names: Record<string, string> = SHORT_PERMISSION_NAMES): string {
  if (!perm) return '';
  return names[perm.codename] || perm.name || '';
}

export function getRolePermissionPercent(role: any, totalPermsCount: number): number {
  if (!role || !totalPermsCount || totalPermsCount === 0) return 0;
  const count = (role.permissions || []).length;
  return Math.min(100, Math.round((count / totalPermsCount) * 100));
}

/** برچسب‌های محدودهٔ تخصیص وقتی هیچ ماژول در دسترسی users.assignmentScope ندارد */
export const DEFAULT_ASSIGNMENT_SCOPE_LABELS: AssignmentScopeLabels = {
  singular: 'محدوده',
  plural: 'محدوده‌ها',
  pluralAttributive: 'محدوده‌های',
  allOption: 'همه محدوده‌ها',
  noneOption: 'بدون محدوده',
  listPrefix: 'محدوده‌ها:',
  column: 'محدوده دسترسی',
  roleTitlePlaceholder: 'مثال: کارشناس ارشد',
  presetsHint: 'تخصیص یکپارچه نقش‌های استاندارد سازمانی با ۱ کلیک',
  companiesTab: 'شرکت‌ها و محدوده‌ها',
  nextStep: 'محدوده‌های دسترسی',
  allowedTitle: 'شرکت‌ها و محدوده‌های مجاز',
  assignTitle: 'تخصیص محدوده‌های عملیاتی مجاز',
  emptyText: 'هیچ محدوده‌ای برای شرکت‌های انتخاب‌شده یافت نشد.',
  sensitiveRecords: 'پایگاه داده'
};
