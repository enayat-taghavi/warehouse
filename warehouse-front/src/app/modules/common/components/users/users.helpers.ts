export interface RolePreset {
  id: string;
  title: string;
  category: 'inventory' | 'accounting' | 'system';
  categoryTitle: string;
  color: string;
  icon: string;
  description: string;
  permissionCodenames: string[] | 'ALL';
}

export const ROLE_PRESETS: RolePreset[] = [
  // ─── دسته ۱: انبارگردانی و اسناد (Inventory Audit) ───
  {
    id: 'counter',
    title: 'انبارگردان / شمارشگر کور',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#0284c7',
    icon: '🔢',
    description: 'میزکار شمارش کور فیزیکی، اسکن بارکد و ثبت تگ‌ها بدون دسترسی به مبالغ مالی',
    permissionCodenames: [
      'view_sys_counter', 'can_act_as_counter'
    ]
  },
  {
    id: 'count_supervisor',
    title: 'سرپرست شمارش',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#2563eb',
    icon: '📋',
    description: 'مدیریت شمارشگران میدانی، تخصیص کالا و زون‌ها، مقایسه با موجودی دفتری و صدور دستور بازشماری',
    permissionCodenames: [
      'view_sys_supervisor', 'can_act_as_wh_supervisor', 'can_act_as_supervisor', 'view_sys_recounts', 'perm_rec_recount',
      'view_wh_dispatch', 'perm_rec_dispatch', 'view_sys_counter'
    ]
  },
  {
    id: 'doc_worker',
    title: 'کارشناس اسناد و کالا',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#0d9488',
    icon: '📑',
    description: 'ورود اطلاعات فاکتورها، پکینگ‌لیست‌ها، بارگذاری عکس‌ها و انطباق اسناد در کارتابل اسناد',
    permissionCodenames: [
      'view_wh_docs', 'can_act_as_doc_worker', 'view_wh_labels', 'view_wh_dispatch'
    ]
  },
  {
    id: 'doc_supervisor',
    title: 'سرپرست مالی انبار',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#0891b2',
    icon: '⚖️',
    description: 'ممیزی کارتابل اسناد، تایید ارزی و ریالی فاکتورها، مهر و امضا و تایید فیدهای گمرکی و MT',
    permissionCodenames: [
      'view_wh_doc_approvals', 'perm_doc_approve_action', 'view_wh_customs',
      'view_wh_feed_approvals', 'perm_feed_approve_action', 'can_act_as_doc_supervisor', 'view_wh_docs'
    ]
  },
  {
    id: 'finance_manager',
    title: 'مدیر مالی انبارگردانی',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#059669',
    icon: '📊',
    description: 'ممیزی ارزش ریالی کل انبار، ارزیابی مالی مغایرت‌های کسری و اضافات و امضای صورتجلسه مالی',
    permissionCodenames: [
      'view_wh_customs', 'view_wh_audit', 'view_sys_reports', 'view_sys_manager_review',
      'perm_doc_approve_action'
    ]
  },
  {
    id: 'count_manager',
    title: 'مدیر شمارش و انبار',
    category: 'inventory',
    categoryTitle: 'انبارگردانی',
    color: '#7c3aed',
    icon: '📦',
    description: 'فرماندهی عملیاتی انبارگردانی، داوری نهایی مغایرت‌ها، فریز انبار و بستن قطعی دوره انبارگردانی',
    permissionCodenames: [
      'view_sys_manager_review', 'can_act_as_wh_manager', 'can_act_as_manager', 'perm_inventory_finalize',
      'perm_wh_freeze', 'view_wh_dashboard', 'view_sys_recounts', 'view_wh_docs'
    ]
  },

  // ─── دسته ۲: حسابداری، کارگاه و کارکرد (Accounting & Workshop) ───
  {
    id: 'workshop_operator',
    title: 'کارمند کارگاه',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#64748b',
    icon: '👤',
    description: 'ثبت روزانه کارت‌های تردد، حضور و غیاب پرسنل و ساعات کارکرد و سرویس ماشین‌آلات و ناوگان',
    permissionCodenames: [
      'can_act_as_operator', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance'
    ]
  },
  {
    id: 'workshop_supervisor',
    title: 'سرپرست کارگاه',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#3b82f6',
    icon: '🦺',
    description: 'کنترل کارکردها و تایید مرحله اول (عملیاتی و میدانی) کارکرد ماهانه پرسنل و ناوگان',
    permissionCodenames: [
      'can_act_as_workshop_supervisor', 'perm_approve_personnel_supervisor', 'perm_approve_fleet_supervisor',
      'perm_lock_work_period', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance'
    ]
  },
  {
    id: 'accountant',
    title: 'حسابدار',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#10b981',
    icon: '💳',
    description: 'محاسبات حقوق و دستمزد ماهانه، کسر بیمه و مالیات، تسویه پیمانکاران ناوگان و تایید مرحله مالی',
    permissionCodenames: [
      'can_act_as_accountant', 'view_sys_payroll', 'view_sys_fleet_settlement',
      'perm_approve_personnel_finance', 'perm_approve_fleet_finance'
    ]
  },
  {
    id: 'company_manager',
    title: 'مدیر شرکت',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#8b5cf6',
    icon: '👑',
    description: 'بررسی گزارش‌های مالی و حقوق کارگاه‌ها، قفل دوره ماهانه، تصویب و صدور مجوز پرداخت بانکی',
    permissionCodenames: [
      'can_act_as_company_manager', 'perm_manager_payment_authorize',
      'perm_approve_personnel_manager', 'perm_approve_fleet_manager',
      'perm_lock_work_period', 'view_sys_payroll', 'view_sys_fleet_settlement',
      'perm_delete_personnel_nomovement', 'perm_delete_vehicle_nomovement'
    ]
  },
  {
    id: 'treasury',
    title: 'خزانه‌دار و پرداخت',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#d97706',
    icon: '🏦',
    description: 'کارتابل خزانه‌داری، صدور فایل پرداخت پایا/چک، ثبت واریز قطعی و صدور رسید تسویه',
    permissionCodenames: [
      'view_sys_treasury', 'perm_treasury_disburse_action'
    ]
  },
  {
    id: 'org_admin',
    title: 'راهبر تشکیلات و سیستم',
    category: 'accounting',
    categoryTitle: 'حسابداری و کارگاه',
    color: '#0284c7',
    icon: '🏢',
    description: 'تعریف پروژه‌ها و بخش‌ها و انتساب کاربران به بخش‌ها؛ بدون تایید کارکرد، مجوز پرداخت یا ابزار زیرساخت',
    permissionCodenames: [
      'perm_manage_projects_sections'
    ]
  },

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
