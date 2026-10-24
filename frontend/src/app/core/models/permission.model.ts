/**
 * مدل‌های مجوزهای ریز (طرح ۲.۲، قرارداد API در `accounts/views_domains/permission_views.py`).
 * کد مجوز همیشه کدنام خالی است (`perm_x`). کلیدهای عددی (شناسهٔ شرکت/پروژه/بخش) در JSON رشته‌اند.
 */

export type PermissionScope = 'section' | 'system';

/** نقشهٔ فشردهٔ مجوزهای کاربر جاری (`GET accounts/my-permissions/` و `user.permission_map` لاگین) */
export interface PermissionMap {
  is_superuser: boolean;
  /** مجوزهای سامانه‌ای (بخش در آن‌ها بی‌اثر است) */
  system: string[];
  /** مجوزهای بخشی از انتساب سطح شرکت: شناسهٔ شرکت → کدها */
  company: Record<string, string[]>;
  /** از انتساب سطح پروژه: شناسهٔ پروژه → کدها */
  project: Record<string, string[]>;
  /** از انتساب سطح بخش: شناسهٔ بخش → کدها */
  section: Record<string, string[]>;
  /** اجتماع همه (برای منوها: «دست‌کم در یک بخش دارد») */
  all: string[];
  /** چکیدهٔ نقشه؛ فقط وقتی نقشه عوض شود تغییر می‌کند */
  version?: string;
}

export interface PermissionCategory {
  module: string;
  key: string;
  label_fa: string;
  order: number;
  /** کلید منویی که این دسته باز می‌کند (ت۵)؛ همان شناسهٔ آیتم منوی ماژول */
  menu: string | null;
}

export interface PermissionSpec {
  code: string;
  label_fa: string;
  /** null = مجوز هستهٔ پلتفرم */
  module: string | null;
  category: string | null;
  scope: PermissionScope;
  sensitive: boolean;
}

export interface AssignmentRoleEntry {
  key: string;
  label_fa: string;
  rank: number | null;
}

export interface RoleBundleDetail {
  role_key?: string;
  defaults: string[];
  added: string[];
  removed: string[];
  effective: string[];
}

/** `GET accounts/permission-catalog/` */
export interface PermissionCatalog {
  categories: PermissionCategory[];
  permissions: PermissionSpec[];
  roles: AssignmentRoleEntry[];
  bundles: Record<string, RoleBundleDetail>;
}

export interface UserPermissionAssignment {
  id: number;
  level: 'company' | 'project' | 'section';
  role: string;
  role_label_fa: string;
  company_id: number | null;
  company_name: string | null;
  project_id: number | null;
  project_name: string | null;
  section_id: number | null;
  section_name: string | null;
}

export interface PermissionOverrideSet {
  from_roles: string[];
  added: string[];
  removed: string[];
  effective: string[];
}

export interface CompanyPermissionOverrideSet extends PermissionOverrideSet {
  name: string;
  has_assignment: boolean;
}

/** `GET/PUT accounts/users/<id>/permissions/` */
export interface UserPermissionsDetail {
  user_id: number;
  is_superuser: boolean;
  assignments: UserPermissionAssignment[];
  system: PermissionOverrideSet;
  companies: Record<string, CompanyPermissionOverrideSet>;
  editable: {
    system: boolean;
    system_reason_fa: string | null;
    companies: number[];
    /** کد سامانه‌ای → دلیل فارسی قفل */
    locked_codes: Record<string, string>;
    /** شناسهٔ شرکت → (کد بخشی → دلیل فارسی قفل) */
    company_locked_codes: Record<string, Record<string, string>>;
  };
}

/** بدنهٔ `PUT accounts/users/<id>/permissions/`؛ فهرست کامل تفاوت‌های همان دامنه */
export interface UserPermissionsUpdate {
  company_id: number | null;
  add: string[];
  remove: string[];
}

export type PermissionsUpdatedReason = 'bundle' | 'role' | 'override' | 'assignment';

/** رویداد وب‌سوکت `permissions_updated` (کانال شخصی یا کانال شرکت) */
export interface PermissionsUpdatedEvent {
  user_id: number | null;
  reason?: PermissionsUpdatedReason | string;
  company_id?: number | null;
  /** true اگر رویداد مربوط به کاربر جاری باشد */
  own: boolean;
}
