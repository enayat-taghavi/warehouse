import { ACTION_ICONS, ActionIconKey } from '../../icons/semantic-icons';
import { IconName } from '../../icons/icon-registry';

export type ActionTone = 'primary' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate' | 'purple' | 'blue';
export type ActionDisplay = 'auto' | 'icon' | 'label';
export type ActionSize = 'sm' | 'md' | 'lg';
export type ActionLabelFrom = 'sm' | 'md' | 'lg';

export interface ActionCatalogEntry {
  /** آیکون واحد مصوب در فرهنگ آیکون */
  icon: IconName;
  /** عنوان پیش‌فرض فارسی */
  defaultLabel: string;
  /** رنگ زمینه و حاشیه */
  tone: ActionTone;
  /** آیا کار حساس/برگشت‌ناپذیر است (همیشه با عنوان نمایش داده می‌شود) */
  sensitive: boolean;
  /** آیا به‌طور پیش‌فرض در همه اندازه‌ها فقط‌آیکون است (استثنای AGENTS §7 برای ۳ دکمه سربرگ) */
  defaultIconOnly?: boolean;
}

/**
 * کاتالوگ جامع کارها (Action Catalog)
 * مرجع: جدول ۳-۱ در طرح جامع ارگونومی واکنش‌گرا
 * برای هر ۳۷ کلید ACTION_ICONS یک ورودی دقیق با بررسی خطای زمان کامپایل (satisfies).
 */
export const ACTION_CATALOG = {
  'create': {
    icon: ACTION_ICONS['create'],
    defaultLabel: 'جدید',
    tone: 'primary',
    sensitive: false,
  },
  'edit': {
    icon: ACTION_ICONS['edit'],
    defaultLabel: 'ویرایش',
    tone: 'slate',
    sensitive: false,
  },
  'delete': {
    icon: ACTION_ICONS['delete'],
    defaultLabel: 'حذف',
    tone: 'rose',
    sensitive: true,
  },
  'refresh': {
    icon: ACTION_ICONS['refresh'],
    defaultLabel: 'تازه‌سازی',
    tone: 'slate',
    sensitive: false,
    defaultIconOnly: true,
  },
  'export-excel': {
    icon: ACTION_ICONS['export-excel'],
    defaultLabel: 'خروجی اکسل',
    tone: 'emerald',
    sensitive: false,
    defaultIconOnly: true,
  },
  'import-excel': {
    icon: ACTION_ICONS['import-excel'],
    defaultLabel: 'ورود اکسل',
    tone: 'indigo',
    sensitive: false,
    defaultIconOnly: true,
  },
  'download': {
    icon: ACTION_ICONS['download'],
    defaultLabel: 'دانلود',
    tone: 'slate',
    sensitive: false,
  },
  'upload': {
    icon: ACTION_ICONS['upload'],
    defaultLabel: 'بارگذاری',
    tone: 'indigo',
    sensitive: false,
  },
  'attach': {
    icon: ACTION_ICONS['attach'],
    defaultLabel: 'پیوست',
    tone: 'slate',
    sensitive: false,
  },
  'save': {
    icon: ACTION_ICONS['save'],
    defaultLabel: 'ذخیره',
    tone: 'primary',
    sensitive: false,
  },
  'approve': {
    icon: ACTION_ICONS['approve'],
    defaultLabel: 'تایید',
    tone: 'emerald',
    sensitive: false,
  },
  'reject': {
    icon: ACTION_ICONS['reject'],
    defaultLabel: 'رد',
    tone: 'rose',
    sensitive: true,
  },
  'return': {
    icon: ACTION_ICONS['return'],
    defaultLabel: 'برگشت برای اصلاح',
    tone: 'amber',
    sensitive: false,
  },
  'restore': {
    icon: ACTION_ICONS['restore'],
    defaultLabel: 'بازیابی',
    tone: 'amber',
    sensitive: true,
  },
  'confirm': {
    icon: ACTION_ICONS['confirm'],
    defaultLabel: 'تایید',
    tone: 'primary',
    sensitive: false,
  },
  'close': {
    icon: ACTION_ICONS['close'],
    defaultLabel: 'بستن',
    tone: 'slate',
    sensitive: false,
  },
  'send': {
    icon: ACTION_ICONS['send'],
    defaultLabel: 'ارسال',
    tone: 'indigo',
    sensitive: false,
  },
  'print': {
    icon: ACTION_ICONS['print'],
    defaultLabel: 'چاپ',
    tone: 'slate',
    sensitive: false,
  },
  'copy': {
    icon: ACTION_ICONS['copy'],
    defaultLabel: 'کپی',
    tone: 'slate',
    sensitive: false,
  },
  'view': {
    icon: ACTION_ICONS['view'],
    defaultLabel: 'مشاهده',
    tone: 'slate',
    sensitive: false,
  },
  'hide': {
    icon: ACTION_ICONS['hide'],
    defaultLabel: 'پنهان کردن',
    tone: 'slate',
    sensitive: false,
  },
  'search': {
    icon: ACTION_ICONS['search'],
    defaultLabel: 'جستجو',
    tone: 'slate',
    sensitive: false,
  },
  'filter': {
    icon: ACTION_ICONS['filter'],
    defaultLabel: 'فیلتر',
    tone: 'slate',
    sensitive: false,
  },
  'more': {
    icon: ACTION_ICONS['more'],
    defaultLabel: 'کارهای بیشتر',
    tone: 'slate',
    sensitive: false,
  },
  'camera': {
    icon: ACTION_ICONS['camera'],
    defaultLabel: 'دوربین',
    tone: 'slate',
    sensitive: false,
  },
  'scan': {
    icon: ACTION_ICONS['scan'],
    defaultLabel: 'اسکن',
    tone: 'slate',
    sensitive: false,
  },
  'loading': {
    icon: ACTION_ICONS['loading'],
    defaultLabel: 'در حال انجام',
    tone: 'slate',
    sensitive: false,
  },
  'lock': {
    icon: ACTION_ICONS['lock'],
    defaultLabel: 'قفل',
    tone: 'amber',
    sensitive: true,
  },
  'unlock': {
    icon: ACTION_ICONS['unlock'],
    defaultLabel: 'بازگشایی',
    tone: 'amber',
    sensitive: true,
  },
  'history': {
    icon: ACTION_ICONS['history'],
    defaultLabel: 'تاریخچه',
    tone: 'slate',
    sensitive: false,
  },
  'sync': {
    icon: ACTION_ICONS['sync'],
    defaultLabel: 'همگام‌سازی',
    tone: 'indigo',
    sensitive: false,
  },
  'settings': {
    icon: ACTION_ICONS['settings'],
    defaultLabel: 'تنظیمات',
    tone: 'slate',
    sensitive: false,
  },
  'back': {
    icon: ACTION_ICONS['back'],
    defaultLabel: 'بازگشت',
    tone: 'slate',
    sensitive: false,
  },
  'forward': {
    icon: ACTION_ICONS['forward'],
    defaultLabel: 'جلو',
    tone: 'slate',
    sensitive: false,
  },
  'expand': {
    icon: ACTION_ICONS['expand'],
    defaultLabel: 'باز کردن',
    tone: 'slate',
    sensitive: false,
  },
  'collapse': {
    icon: ACTION_ICONS['collapse'],
    defaultLabel: 'جمع کردن',
    tone: 'slate',
    sensitive: false,
  },
  'logout': {
    icon: ACTION_ICONS['logout'],
    defaultLabel: 'خروج',
    tone: 'rose',
    sensitive: false,
  },
} as const satisfies Record<ActionIconKey, ActionCatalogEntry>;
