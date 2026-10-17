import {
  warehouseOfflineDb,
  financeOfflineDb,
  resolveScopeFromUrl,
  AppScope,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';
import { invalidateCache } from './offline-local-patcher';
import { resolveServerUrl } from '../../platform/server-origin';

/**
 * دریافت تمام خطاهای خوانده‌نشده از پایگاه‌های داده تفکیک‌شده
 */
export async function getErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
  const targetScope = scope || 'all';
  if (targetScope === 'warehouse') {
    const errors = await warehouseOfflineDb.syncErrors
      .where('dismissed')
      .equals(0)
      .sortBy('failedAt');
    return errors.reverse();
  }
  if (targetScope === 'finance') {
    const errors = await financeOfflineDb.syncErrors
      .where('dismissed')
      .equals(0)
      .sortBy('failedAt');
    return errors.reverse();
  }
  const [wh, fin] = await Promise.all([
    warehouseOfflineDb.syncErrors.where('dismissed').equals(0).toArray(),
    financeOfflineDb.syncErrors.where('dismissed').equals(0).toArray(),
  ]);
  return [...wh, ...fin].sort((a, b) => b.failedAt - a.failedAt);
}

/**
 * دریافت تمام خطاها (حتی خوانده‌شده‌ها)
 */
export async function getAllErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
  const targetScope = scope || 'all';
  if (targetScope === 'warehouse') {
    return warehouseOfflineDb.syncErrors.reverse().sortBy('failedAt');
  }
  if (targetScope === 'finance') {
    return financeOfflineDb.syncErrors.reverse().sortBy('failedAt');
  }
  const [wh, fin] = await Promise.all([
    warehouseOfflineDb.syncErrors.toArray(),
    financeOfflineDb.syncErrors.toArray(),
  ]);
  return [...wh, ...fin].sort((a, b) => b.failedAt - a.failedAt);
}

/**
 * حذف (Dismiss) یک خطا از دیتابیس مربوطه
 */
export async function dismissError(id: number): Promise<void> {
  const whErr = await warehouseOfflineDb.syncErrors.get(id);
  if (whErr) {
    await warehouseOfflineDb.syncErrors.update(id, { dismissed: 1 });
  } else {
    await financeOfflineDb.syncErrors.update(id, { dismissed: 1 });
  }
}

/**
 * حذف تمام خطاها از هر دو دیتابیس
 */
export async function dismissAllErrors(): Promise<void> {
  await Promise.all([
    warehouseOfflineDb.syncErrors.toCollection().modify({ dismissed: 1 }),
    financeOfflineDb.syncErrors.toCollection().modify({ dismissed: 1 }),
  ]);
}

/**
 * حذف دائمی یک خطا از دیتابیس
 */
export async function deleteError(id: number): Promise<void> {
  const whErr = await warehouseOfflineDb.syncErrors.get(id);
  if (whErr) {
    await warehouseOfflineDb.syncErrors.delete(id);
  } else {
    await financeOfflineDb.syncErrors.delete(id);
  }
}

/**
 * حذف دائمی تمام خطاها از هر دو دیتابیس
 */
export async function clearAllErrors(): Promise<void> {
  await Promise.all([
    warehouseOfflineDb.syncErrors.clear(),
    financeOfflineDb.syncErrors.clear(),
  ]);
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
  ) => Promise<SyncQueueEntry>
): Promise<SyncErrorEntry | null> {
  let err = await warehouseOfflineDb.syncErrors.get(errorId);
  let db = warehouseOfflineDb;
  if (!err) {
    err = await financeOfflineDb.syncErrors.get(errorId);
    db = financeOfflineDb;
  }
  if (!err) return null;

  await enqueueFn(err.method, err.url, err.body, {
    userId: err.userId,
    entityType: err.entityType,
    entitySyncId: err.entitySyncId,
    appScope: err.appScope,
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
  ) => Promise<SyncQueueEntry>
): Promise<{ success: boolean; message: string; online: boolean }> {
  let err = await warehouseOfflineDb.syncErrors.get(errorId);
  let db = warehouseOfflineDb;
  if (!err) {
    err = await financeOfflineDb.syncErrors.get(errorId);
    db = financeOfflineDb;
  }
  if (!err) {
    return { success: false, message: 'رکورد تداخل یافت نشد.', online: isBrowserOnline };
  }

  const appScope: AppScope = err.appScope || resolveScopeFromUrl(err.url);
  const serverRecord = err.serverResponse?.server_record;
  const finalPayload = {
    ...mergedBody,
    base_updated_at: serverRecord?.updated_at || new Date().toISOString(),
  };

  // اگر آنلاین است، تلاش برای ارسال مستقیم به سرور
  if (isBrowserOnline) {
    try {
      const tokenKey = appScope === 'finance' ? 'wh_access_token_finance' : 'wh_access_token_warehouse';
      const token =
        sessionStorage.getItem(tokenKey) ||
        sessionStorage.getItem('wh_access_token') ||
        localStorage.getItem(tokenKey) ||
        localStorage.getItem('wh_access_token');
      const tabId = sessionStorage.getItem('wh_tab_session_id') || 'tab_conflict_resolver';
      const role =
        sessionStorage.getItem('active_role_persona') ||
        (appScope === 'finance' ? 'operator' : 'counter');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Active-App': appScope === 'finance' ? 'personnel' : 'warehouse',
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
