import Dexie from 'dexie';
import { getAllOfflineDbs, clearAllScopedCaches } from './offline-db';
import type { PhotoUploadQueueService } from './photo-upload-queue.service';

/**
 * گیت مشترک بازگردانی و بازیابی پایگاه‌دادهٔ سرور (قانون «هیچ داده‌ای نباید از دست برود»).
 * هر مسیری که دادهٔ سرور را با نسخهٔ قدیمی‌تر جایگزین می‌کند، پیش از درخواست از این گیت می‌گذرد
 * و پس از موفقیت کش‌های هر دو قلمرو را پاک و کاربر را خارج می‌کند.
 */

interface ToastLike {
  show(type: 'error' | 'success' | 'warning' | 'info', message: string, duration?: number): void;
}

interface LogoutLike {
  logout(): void;
}

/** همهٔ داده‌های ارسال‌نشده: صف همگام‌سازی تمامی پایگاه‌های داده و عکس‌های در انتظار؛ خطای خواندن پرتاب می‌شود */
export async function countUnsentEntries(photoQueue: PhotoUploadQueueService | null | undefined): Promise<number> {
  const allDbs = getAllOfflineDbs();
  const knownNames = new Set(allDbs.map((db) => db.name));

  const knownCounts = await Promise.all(
    allDbs.map(async (db) => {
      try {
        const items = await db.syncQueue.toArray();
        if (Array.isArray(items)) {
          return items.length;
        }
      } catch (err: any) {
        if (err?.name !== 'MissingAPIError' && !err?.message?.includes('IndexedDB API missing')) {
          throw err;
        }
      }
      return await db.syncQueue.count();
    })
  );
  let total = knownCounts.reduce((acc, c) => acc + c, 0);

  let dbNames: string[] = [];
  try {
    dbNames = await Dexie.getDatabaseNames();
  } catch (err: any) {
    if (err?.name === 'MissingAPIError' || err?.message?.includes('IndexedDB API missing')) {
      dbNames = [];
    } else {
      throw err;
    }
  }

  for (const name of dbNames) {
    if (name.startsWith('WarehouseOfflineDB_') && !knownNames.has(name)) {
      const db = new Dexie(name);
      try {
        await db.open();
        if (db.tables.some((t) => t.name === 'syncQueue')) {
          const count = await db.table('syncQueue').count();
          total += count;
        }
      } finally {
        db.close();
      }
    }
  }

  const photos = photoQueue ? await photoQueue.countPendingStrict() : 0;
  total += photos;
  return total;
}

/**
 * فقط وقتی هیچ دادهٔ ارسال‌نشده‌ای نیست true می‌دهد؛ اگر صف‌ها خوانده نشوند، مسدود می‌ماند (fail closed).
 */
export async function isUnsentQueueEmpty(
  toast: ToastLike,
  photoQueue: PhotoUploadQueueService | null | undefined,
): Promise<boolean> {
  let pendingCount: number;
  try {
    pendingCount = await countUnsentEntries(photoQueue);
  } catch {
    toast.show('error', 'امکان بررسی صف آفلاین وجود ندارد؛ بازگردانی متوقف شد.');
    return false;
  }
  if (pendingCount > 0) {
    toast.show('error', `صف آفلاین شامل ${pendingCount} رکورد همگام‌نشده است. جهت جلوگیری از نابودی داده‌ها، ابتدا باید آنها را به سرور ارسال کنید.`);
    return false;
  }
  return true;
}

/** پاک‌سازی کش‌های مشتق از سرورِ هر دو قلمرو؛ خروج در هر حال انجام می‌شود */
export async function clearCachesThenLogout(auth: LogoutLike, beforeLogout?: () => void): Promise<void> {
  try {
    await clearAllScopedCaches();
  } catch (e) {
    console.warn('[ServerRestoreGate] پاک‌سازی کش‌ها پس از بازگردانی ناموفق بود:', e);
  } finally {
    setTimeout(() => {
      beforeLogout?.();
      auth.logout();
    }, 1500);
  }
}
