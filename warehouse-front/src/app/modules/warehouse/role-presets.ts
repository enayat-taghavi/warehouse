import { ModuleRolePreset } from '../../core/modules/module-contract';

/** قالب‌های آمادهٔ نقش این ماژول در صفحهٔ کاربران (extension users.rolePresets) */
export const WAREHOUSE_ROLE_PRESETS: ModuleRolePreset[] = [
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
  }
];
