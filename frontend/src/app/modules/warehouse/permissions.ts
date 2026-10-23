/**
 * مجوزهای ماژول انبارداری در صفحهٔ نقش‌ها.
 * کدها همان PERMISSION_CODENAMES مانیفست بک‌اند (`backend/modules/warehouse/module.py`)؛ نگهبان ۵۷ برابری را می‌سنجد.
 */
export const WAREHOUSE_PERMISSION_CODENAMES: string[] = [
  'view_wh_dashboard', 'view_wh_docs', 'view_wh_dispatch', 'view_sys_counter',
  'view_wh_customs', 'view_sys_supervisor', 'view_sys_manager_review', 'view_sys_recounts',
  'view_wh_attendance', 'view_wh_doc_approvals', 'view_wh_feeding', 'view_wh_feed_approvals',
  'view_wh_labels', 'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
  'view_wh_stocktaking', 'view_warehouse', 'add_warehouse', 'change_warehouse',
  'delete_warehouse', 'view_record', 'add_record', 'change_record',
  'delete_record', 'can_act_as_counter', 'can_act_as_supervisor', 'can_act_as_wh_supervisor',
  'can_act_as_manager', 'can_act_as_wh_manager', 'can_act_as_doc_worker', 'can_act_as_doc_supervisor',
  'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize', 'perm_rec_dispatch',
  'perm_rec_recount', 'perm_rec_label', 'perm_rec_import', 'perm_wh_create',
  'perm_wh_edit', 'perm_wh_freeze'
];

/** نام کوتاه مجوزهای این ماژول در چیپ‌های دسترسی */
export const WAREHOUSE_SHORT_PERMISSION_NAMES: Record<string, string> = {
  'view_wh_attendance': 'کارکرد ناوگان انبار',
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
  'view_warehouse': 'مشاهده انبارها',
  'add_warehouse': 'تعریف انبار جدید',
  'change_warehouse': 'ویرایش انبار',
  'delete_warehouse': 'حذف انبار',
  'view_record': 'مشاهده رکوردهای شمارش',
  'add_record': 'ثبت رکورد شمارش',
  'change_record': 'ویرایش رکورد شمارش',
  'delete_record': 'حذف رکورد شمارش'
};
