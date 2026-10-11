import { ICONS, IconName } from './icon-registry';

/**
 * فرهنگ آیکون معنایی کارها (Action Icons)
 * مرجع: جدول ۳-۱ در طرح جامع ارگونومی واکنش‌گرا
 * هر کار دقیقاً به یک آیکون واحد در رجیستری متصل است.
 */
export const ACTION_ICONS = {
  'create': 'plus',
  'edit': 'edit',
  'delete': 'trash-2',
  'refresh': 'refresh-cw',
  'export-excel': 'download',
  'import-excel': 'upload',
  'download': 'download',
  'upload': 'upload',
  'attach': 'hero-paper-clip',
  'save': 'save',
  'approve': 'check-circle',
  'reject': 'x-circle',
  'return': 'rotate-ccw',
  'restore': 'rotate-ccw',
  'confirm': 'check',
  'close': 'x',
  'send': 'send',
  'print': 'printer',
  'copy': 'copy',
  'view': 'eye',
  'hide': 'eye-off',
  'search': 'search',
  'filter': 'filter',
  'more': 'more-vertical',
  'camera': 'camera',
  'scan': 'scan-line',
  'loading': 'spinner',
  'lock': 'lock',
  'unlock': 'unlock',
  'history': 'file-lines',
  'sync': 'cloud-upload',
  'settings': 'settings',
  'back': 'chevron-right',
  'forward': 'chevron-left',
  'expand': 'chevron-down',
  'collapse': 'chevron-up',
  'logout': 'log-out',
} as const satisfies Record<string, IconName>;

export type ActionIconKey = keyof typeof ACTION_ICONS;

/**
 * فرهنگ آیکون معنایی وضعیت‌ها (Status Icons)
 * مرجع: جدول ۳-۲ در طرح جامع ارگونومی واکنش‌گرا
 * جایگزین استاندارد ایموجی‌ها در تب‌ها و برچسب‌های وضعیت.
 */
export const STATUS_ICONS = {
  'pending': 'clock',
  'approved': 'check-circle',
  'rejected': 'x-circle',
  'revision': 'rotate-ccw',
  'draft': 'file',
  'archived': 'archive',
  'all': 'list',
  'warning': 'alert-triangle',
  'error': 'alert-circle',
  'alert': 'bell',
  'locked': 'lock',
  'offline': 'wifi-off',
  'queued': 'cloud-upload',
  'cloud-off': 'cloud-off',
  'wifi': 'wifi',
} as const satisfies Record<string, IconName>;

export type StatusIconKey = keyof typeof STATUS_ICONS;

/**
 * فرهنگ آیکون موجودیت‌های عمومی و پلتفرم (Platform Entity Icons)
 * مرجع: جدول ۳-۳ در طرح جامع ارگونومی واکنش‌گرا
 */
export const PLATFORM_ENTITY_ICONS = {
  'dashboard': 'grid',
  'reports': 'bar-chart-2',
  'company': 'building',
  'users': 'user-circle',
  'settings': 'settings',
  'audit': 'file-lines',
  'health': 'server',
  'backup': 'cloud',
  'notifications': 'bell',
  'chat': 'message-square',
  'permissions': 'key',
} as const satisfies Record<string, IconName>;

export type PlatformEntityIconKey = keyof typeof PLATFORM_ENTITY_ICONS;

/**
 * فرهنگ آیکون معنایی نقش‌های سازمانی (Role Icons)
 * هیچ آیکونی با کارها، وضعیت‌ها یا موجودیت‌ها (و نقش دیگر) مشترک نیست؛ spec فرهنگ آیکون این را می‌سنجد.
 */
export const ROLE_ICONS = {
  'ops_commander': 'shield',
  'operator': 'user',
  'supervisor': 'user-check',
  'accountant': 'layout',
  'manager': 'crown',
  'treasury': 'briefcase-2',
  'org_admin': 'shield-check',
  'counter': 'crosshair',
  'warehouse_supervisor': 'box',
  'docs_specialist': 'file-plus',
  'manager_review': 'check-check',
  'superuser': 'zap',
} as const satisfies Record<string, IconName>;

export type RoleIconKey = keyof typeof ROLE_ICONS;

/**
 * حل نام‌های معنایی (action-* یا status-* یا role-*) یا نام مستقیم رجیستری به IconName معتبر.
 * فقط کلیدهای خود رجیستری پذیرفته می‌شوند (Object.hasOwn)، نه کلیدهای prototype مثل constructor.
 */
export function resolveSemanticIcon(name: string | null | undefined): IconName | null {
  if (!name) return null;

  let target: string = name;
  if (name.startsWith('action-')) {
    const key = name.slice(7);
    if (!Object.hasOwn(ACTION_ICONS, key)) return null;
    target = ACTION_ICONS[key as ActionIconKey];
  } else if (name.startsWith('status-')) {
    const key = name.slice(7);
    if (!Object.hasOwn(STATUS_ICONS, key)) return null;
    target = STATUS_ICONS[key as StatusIconKey];
  } else if (name.startsWith('role-')) {
    const key = name.slice(5);
    if (!Object.hasOwn(ROLE_ICONS, key)) return null;
    target = ROLE_ICONS[key as RoleIconKey];
  }

  return Object.hasOwn(ICONS, target) ? (target as IconName) : null;
}
