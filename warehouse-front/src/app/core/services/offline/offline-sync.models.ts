import {
  AppScope,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';

/**
 * نتیجه یک عملیات همگام‌سازی
 *
 * تفاوت کلیدی: «آفلاین بودن» شکست نیست — هیچ تلاشی انجام نشده است.
 * شکست فقط وقتی معنا دارد که واقعاً به سرور وصل شده باشیم.
 */
export type SyncOutcome =
  /** مرورگر آفلاین است — هیچ درخواستی ارسال نشد */
  | { status: 'offline' }
  /** مرورگر آنلاین است ولی سرور پاسخ نمی‌دهد — داده‌ها دست‌نخورده در صف ماندند */
  | { status: 'server-unreachable'; synced: number }
  /** نشست منقضی شده — نیاز به ورود مجدد */
  | { status: 'auth-required'; synced: number }
  /** صف خالی بود */
  | { status: 'nothing-to-sync' }
  /** همه چیز با موفقیت ارسال شد */
  | { status: 'completed'; synced: number }
  /** بخشی ارسال شد؛ بخشی رد شد یا باقی ماند */
  | { status: 'partial'; synced: number; rejected: number; remaining: number };

/**
 * نتیجه ارسال یک رکورد از صف
 *
 * • sent             → سرور پذیرفت (۲xx) → از صف حذف شد
 * • rejected         → سرور صریحاً رد کرد (۴xx) → به صندوق خطاها رفت
 * • auth-failed      → نشست منقضی → در صف ماند
 * • server-error     → خطای ۵xx → در صف ماند
 * • transport-failed → اصلاً به سرور نرسید → در صف ماند (بدون افزایش شمارنده تلاش)
 */
export type EntryResult = 'sent' | 'rejected' | 'auth-failed' | 'server-error' | 'transport-failed';

export interface DeepUpdateSummary {
  warehouseName: string;
  records: number;
  bytes: number;
}

export interface DeepUpdateState {
  isActive: boolean;
  mode: 'current' | 'all';
  totalWarehouses: number;
  currentIndex: number;
  currentWarehouseName: string;
}

/** حداکثر تعداد تلاش مجدد برای هر درخواست */
export const MAX_SYNC_RETRIES = 3;

/** مدت زمان پیش‌فرض اعتبار کش (۱ ساعت) */
export const DEFAULT_CACHE_TTL = 60 * 60 * 1000;

/** فاصله پیش‌فرض همگام‌سازی خودکار (۱۵ دقیقه) */
export const DEFAULT_SYNC_INTERVAL = 15 * 60 * 1000;

export const CACHE_TTL_STORAGE_KEY = 'wh_cache_ttl';
export const SYNC_INTERVAL_STORAGE_KEY = 'wh_sync_interval';
export const PRUNE_STORAGE_KEY = 'wh_last_prune';
export const QUEUE_LOCK_NAME = 'wh_offline_sync_queue_lock';

export type { AppScope, OfflineDatabase, SyncQueueEntry, SyncErrorEntry };
