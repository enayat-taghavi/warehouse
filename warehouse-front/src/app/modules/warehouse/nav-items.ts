import { PLATFORM_ENTITY_ICONS } from '../../shared/icons/semantic-icons';
import { WAREHOUSE_ENTITY_ICONS } from './entity-icons';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  permission: string;
  module?: string;
  isAccounting?: boolean;
}

export const WAREHOUSE_SYSTEM_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'داشبورد مانیتورینگ کلی', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_sys_dashboard', module: 'warehouse' },
  { id: 'users', label: 'کاربران و نقش ها', icon: PLATFORM_ENTITY_ICONS.users, permission: 'view_sys_users', module: 'warehouse' },
  { id: 'projects', label: 'انبارها', icon: WAREHOUSE_ENTITY_ICONS.warehouses, permission: 'view_sys_projects', module: 'warehouse' },
  { id: 'counter', label: 'کارتابل انبارگردان', icon: WAREHOUSE_ENTITY_ICONS.counterCartable, permission: 'view_sys_counter', module: 'warehouse' },
  { id: 'customs', label: 'کارتابل مالی', icon: WAREHOUSE_ENTITY_ICONS.customs, permission: 'view_wh_customs', module: 'warehouse' },
  { id: 'supervisor', label: 'کارتابل سرپرست', icon: WAREHOUSE_ENTITY_ICONS.supervisorCartable, permission: 'view_sys_supervisor', module: 'warehouse' },
  { id: 'manager-review', label: 'بررسی نهایی مدیر', icon: WAREHOUSE_ENTITY_ICONS.managerReview, permission: 'view_sys_manager_review', module: 'warehouse' },
  { id: 'count-tracking', label: 'پیگیری وضعیت شمارش', icon: WAREHOUSE_ENTITY_ICONS.countTracking, permission: 'view_sys_manager_review', module: 'warehouse' },
  { id: 'audit', label: 'رهگیری تغییرات', icon: PLATFORM_ENTITY_ICONS.audit, permission: 'view_wh_audit', module: 'warehouse' },
  { id: 'health', label: 'پایش سلامت سامانه', icon: PLATFORM_ENTITY_ICONS.health, permission: 'view_sys_settings', module: 'warehouse' },
  { id: 'reports', label: 'گزارش‌ساز', icon: PLATFORM_ENTITY_ICONS.reports, permission: 'view_sys_reports', module: 'warehouse' },
  { id: 'settings', label: 'تنظیمات سیستم', icon: PLATFORM_ENTITY_ICONS.settings, permission: 'view_sys_settings', module: 'warehouse' },
];

export const WAREHOUSE_CONTEXT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'داشبورد انبار', icon: PLATFORM_ENTITY_ICONS.dashboard, permission: 'view_wh_dashboard', module: 'warehouse' },
  { id: 'docs', label: 'مدیریت کالا', icon: WAREHOUSE_ENTITY_ICONS.items, permission: 'view_wh_docs', module: 'warehouse' },
  { id: 'dispatch', label: 'تخصیص کالا', icon: WAREHOUSE_ENTITY_ICONS.dispatch, permission: 'view_wh_dispatch', module: 'warehouse' },
  { id: 'counter', label: 'کارتابل انبارگردان', icon: WAREHOUSE_ENTITY_ICONS.counterCartable, permission: 'view_sys_counter', module: 'warehouse' },
  { id: 'customs', label: 'کارتابل مالی', icon: WAREHOUSE_ENTITY_ICONS.customs, permission: 'view_wh_customs', module: 'warehouse' },
  { id: 'supervisor', label: 'کارتابل سرپرست', icon: WAREHOUSE_ENTITY_ICONS.supervisorCartable, permission: 'view_sys_supervisor', module: 'warehouse' },
  { id: 'manager-review', label: 'بررسی نهایی مدیر', icon: WAREHOUSE_ENTITY_ICONS.managerReview, permission: 'view_sys_manager_review', module: 'warehouse' },
  { id: 'count-tracking', label: 'پیگیری وضعیت شمارش', icon: WAREHOUSE_ENTITY_ICONS.countTracking, permission: 'view_sys_manager_review', module: 'warehouse' },
  { id: 'feeding', label: 'مدیریت و تغذیه MT26/49 (به‌زودی)', icon: 'database', permission: 'view_wh_feeding', module: 'warehouse' },
  { id: 'audit', label: 'رهگیری تغییرات', icon: PLATFORM_ENTITY_ICONS.audit, permission: 'view_wh_audit', module: 'warehouse' },
  { id: 'health', label: 'پایش سلامت سامانه', icon: PLATFORM_ENTITY_ICONS.health, permission: 'view_wh_settings', module: 'warehouse' },
  { id: 'reports', label: 'گزارش‌ساز', icon: PLATFORM_ENTITY_ICONS.reports, permission: 'view_sys_reports', module: 'warehouse' },
  { id: 'wh-settings', label: 'تنظیمات انبار', icon: PLATFORM_ENTITY_ICONS.settings, permission: 'view_wh_settings', module: 'warehouse' },
];
