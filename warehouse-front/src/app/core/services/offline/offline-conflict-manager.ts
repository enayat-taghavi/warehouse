import {
  warehouseOfflineDb,
  financeOfflineDb,
  getAllOfflineDbs,
  resolveOfflineDbStrict,
  resolveScopeFromUrl,
  AppScope,
  DEFAULT_OFFLINE_SCOPE,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry,
  getScopeSyncProfile,
} from '../offline-db';
import { invalidateCache } from './offline-local-patcher';
import { resolveServerUrl } from '../../platform/server-origin';

/**
 * دریافت تمام خطاهای خوانده‌نشده از پایگاه‌های داده تفکیک‌شده
 */
export async function getErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
  const targetScope = scope || 'all';
  if (targetScope !== 'all') {
    const db = resolveOfflineDbStrict(targetScope);
    if (!db) return [];
    const errors = await db.syncErrors
      .where('dismissed')
      .equals(0)
      .sortBy('failedAt');
    return errors.reverse();
  }
  const allDbs = getAllOfflineDbs();
  const errorsPerDb = await Promise.all(
    allDbs.map((db) => db.syncErrors.where('dismissed').equals(0).toArray())
  );
  return errorsPerDb.flat().sort((a, b) => b.failedAt - a.failedAt);
}

/**
 * دریافت تمام خطاها (حتی خوانده‌شده‌ها)
 */
export async function getAllErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
  const targetScope = scope || 'all';
  if (targetScope !== 'all') {
    const db = resolveOfflineDbStrict(targetScope);
    if (!db) return [];
    return db.syncErrors.reverse().sortBy('failedAt');
  }
  const allDbs = getAllOfflineDbs();
  const errorsPerDb = await Promise.all(
    allDbs.map((db) => db.syncErrors.toArray())
  );
  return errorsPerDb.flat().sort((a, b) => b.failedAt - a.failedAt);
}

/**
 * حذف (Dismiss) یک خطا از دیتابیس مربوطه
 */
export async function dismissError(id: number, scope?: AppScope): Promise<void> {
  if (scope) {
    const db = resolveOfflineDbStrict(scope);
    if (!db) {
      console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${scope}] یافت نشد؛ dismissError برای شناسه ${id} متوقف شد.`);
      return;
    }
    await db.syncErrors.update(id, { dismissed: 1 });
    return;
  }

  for (const db of getAllOfflineDbs()) {
    const err = await db.syncErrors.get(id);
    if (err) {
      await db.syncErrors.update(id, { dismissed: 1 });
      return;
    }
  }
}

/**
 * حذف تمام خطاها از هر دو دیتابیس
 */
export async function dismissAllErrors(): Promise<void> {
  const allDbs = getAllOfflineDbs();
  await Promise.all(
    allDbs.map((db) => db.syncErrors.toCollection().modify({ dismissed: 1 }))
  );
}

/**
 * حذف دائمی یک خطا از دیتابیس
 */
export async function deleteError(id: number, scope?: AppScope): Promise<void> {
  if (scope) {
    const db = resolveOfflineDbStrict(scope);
    if (!db) {
      console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${scope}] یافت نشد؛ deleteError برای شناسه ${id} متوقف شد.`);
      return;
    }
    await db.syncErrors.delete(id);
    return;
  }

  for (const db of getAllOfflineDbs()) {
    const err = await db.syncErrors.get(id);
    if (err) {
      await db.syncErrors.delete(id);
      return;
    }
  }
}

/**
 * حذف دائمی تمام خطاها از هر دو دیتابیس
 */
export async function clearAllErrors(): Promise<void> {
  const allDbs = getAllOfflineDbs();
  await Promise.all(
    allDbs.map((db) => db.syncErrors.clear())
  );
}

/**
 * استخراج پیام خطای قابل فهم سرور برای ۴xx و ۴۰۹
 */
export function extractServerErrorMessage(status: number, errorBody: any): string {
  let serverMessage = `خطای ${status}`;
  if (errorBody?.detail) {
    serverMessage =
      errorBody.detail === 'conflict'
        ? 'تداخل: این رکورد هم‌زمان توسط شخص دیگری تغییر کرده است'
        : errorBody.detail;
  } else if (errorBody && typeof errorBody === 'object') {
    const firstField = Object.keys(errorBody)[0];
    const firstError = errorBody[firstField];
    serverMessage = Array.isArray(firstError)
      ? `${firstField}: ${firstError[0]}`
      : String(firstError);
  }
  return serverMessage;
}

/**
 * تلاش مجدد یک درخواست ردشده — از Inbox خطاها.
 * رکورد به صف برمی‌گردد (با متادیتای اصلی و قلمرو) و صف بلافاصله پردازش می‌شود.
 */
export async function retryError(
  errorId: number,
  enqueueFn: (
    method: string,
    url: string,
    body: any,
    meta?: { userId?: number; entityType?: string; entitySyncId?: string; baseUpdatedAt?: string; appScope?: AppScope }
  ) => Promise<SyncQueueEntry>,
  scope?: AppScope
): Promise<SyncErrorEntry | null> {
  let err: SyncErrorEntry | undefined;
  let db: OfflineDatabase | undefined;

  if (scope) {
    const resolvedDb = resolveOfflineDbStrict(scope);
    if (!resolvedDb) {
      console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${scope}] یافت نشد؛ retryError برای شناسه ${errorId} متوقف شد.`);
      return null;
    }
    err = await resolvedDb.syncErrors.get(errorId);
    db = resolvedDb;
  } else {
    for (const d of getAllOfflineDbs()) {
      const found = await d.syncErrors.get(errorId);
      if (found) {
        err = found;
        db = d;
        break;
      }
    }
  }

  if (!err || !db) return null;

  const targetScope: AppScope = db.dbScope || err.appScope || DEFAULT_OFFLINE_SCOPE;
  await enqueueFn(err.method, err.url, err.body, {
    userId: err.userId,
    entityType: err.entityType,
    entitySyncId: err.entitySyncId,
    appScope: targetScope,
  });
  await db.syncErrors.delete(errorId);
  console.log(`[OfflineSync] 🔁 خطای ${errorId} به صف برگشت (${err.method} ${err.url})`);
  return err;
}

/**
 * حل تداخل داده‌های همگام‌سازی (409 Conflict Resolution):
 * اعمال نسخه ادغام‌شده با base_updated_at سرور و ارسال مستقیم به سرور
 * یا صف‌بندی ایمن در صورت آفلاین بودن دستگاه
 */
export async function resolveConflict(
  errorId: number,
  mergedBody: any,
  isBrowserOnline: boolean,
  enqueueFn: (
    method: string,
    url: string,
    body: any,
    meta?: { userId?: number; entityType?: string; entitySyncId?: string; baseUpdatedAt?: string; appScope?: AppScope }
  ) => Promise<SyncQueueEntry>,
  scope?: AppScope
): Promise<{ success: boolean; message: string; online: boolean }> {
  let err: SyncErrorEntry | undefined;
  let db: OfflineDatabase | undefined;

  if (scope) {
    const resolvedDb = resolveOfflineDbStrict(scope);
    if (!resolvedDb) {
      console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${scope}] یافت نشد؛ resolveConflict برای شناسه ${errorId} متوقف شد.`);
      return { success: false, message: 'دیتابیس قلمرو درخواستی یافت نشد.', online: isBrowserOnline };
    }
    err = await resolvedDb.syncErrors.get(errorId);
    db = resolvedDb;
  } else {
    for (const d of getAllOfflineDbs()) {
      const found = await d.syncErrors.get(errorId);
      if (found) {
        err = found;
        db = d;
        break;
      }
    }
  }

  if (!err || !db) {
    return { success: false, message: 'رکورد تداخل یافت نشد.', online: isBrowserOnline };
  }

  const appScope: AppScope = db.dbScope || err.appScope || resolveScopeFromUrl(err.url);
  const serverRecord = err.serverResponse?.server_record;
  const finalPayload = {
    ...mergedBody,
    base_updated_at: serverRecord?.updated_at || new Date().toISOString(),
  };

  // اگر آنلاین است، تلاش برای ارسال مستقیم به سرور
  if (isBrowserOnline) {
    try {
      const profile = getScopeSyncProfile(appScope);
      const tokenKey = profile.tokenKey;
      const token =
        sessionStorage.getItem(tokenKey) ||
        sessionStorage.getItem('wh_access_token') ||
        localStorage.getItem(tokenKey) ||
        localStorage.getItem('wh_access_token');
      const tabId = sessionStorage.getItem('wh_tab_session_id') || 'tab_conflict_resolver';
      const role = sessionStorage.getItem('active_role_persona') || profile.defaultOfflineRole;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Active-App': profile.activeAppHeader,
        'X-Active-Role': role,
        'X-Client-Tab-Id': tabId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(resolveServerUrl(err.url), {
        method: err.method || 'PATCH',
        headers,
        body: JSON.stringify(finalPayload),
      });

      if (res.ok) {
        await db.syncErrors.delete(errorId);
        if (err.url) await invalidateCache(err.url.split('?')[0], appScope);
        console.log(`[OfflineSync] 🤝 تداخل خطای ${errorId} حل و با موفقیت در سرور ثبت شد.`);
        return { success: true, message: 'تداخل داده‌ها حل و با موفقیت در سرور ثبت شد.', online: true };
      } else if (res.status === 409) {
        // در صورتی که سرور دوباره در همین لحظه تغییر کرده باشد
        const newConflictBody = await res.json().catch(() => null);
        await db.syncErrors.update(errorId, {
          body: finalPayload,
          serverResponse: newConflictBody,
          failedAt: Date.now(),
        });
        return {
          success: false,
          message: 'سرور در این لحظه مجدداً توسط کاربر دیگری به‌روزرسانی شد. لطفاً تداخل جدید را بازبینی کنید.',
          online: true,
        };
      }
    } catch (networkErr) {
      console.warn('[OfflineSync] ارسال مستقیم با خطا مواجه شد، ذخیره در صف آفلاین:', networkErr);
    }
  }

  // حالت آفلاین یا خطای اتصال: حذف خطا و انتقال نسخه ادغام‌شده به صف آفلاین
  await enqueueFn(err.method, err.url, finalPayload, {
    userId: err.userId,
    entityType: err.entityType,
    entitySyncId: err.entitySyncId,
    appScope,
    baseUpdatedAt: finalPayload.base_updated_at,
  });
  await db.syncErrors.delete(errorId);
  return {
    success: true,
    message: 'رکورد ادغام‌شده در صف آفلاین ذخیره شد و به محض برقراری اتصال ارسال خواهد شد.',
    online: false,
  };
}
