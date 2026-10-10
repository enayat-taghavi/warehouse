import { IconName } from '../../shared/icons/icon-registry';

/**
 * فرهنگ آیکون موجودیت‌های ماژول انبارگردانی
 * مرجع: جدول ۳-۳ در طرح جامع ارگونومی واکنش‌گرا
 * فقط توسط ماژول warehouse مصرف می‌شود (جداسازی وابستگی‌ها).
 */
export const WAREHOUSE_ENTITY_ICONS = {
  warehouses: 'package',
  items: 'barcode',
  counterCartable: 'clipboard',
  dispatch: 'tag',
  customs: 'globe',
  supervisorCartable: 'check-square',
  managerReview: 'check-circle',
  countTracking: 'activity',
} as const satisfies Record<string, IconName>;

export type WarehouseEntityIconKey = keyof typeof WAREHOUSE_ENTITY_ICONS;
