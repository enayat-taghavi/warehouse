import { environment } from '../../../../environments/environment';
import {
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  resolveScopeFromUrl,
  getCurrentActiveAppScope,
  AppScope,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';
import { getStoredCurrentUserId } from '../sync-pull.service';
import { NetworkStatusService } from '../network-status.service';
import { isServerUnreachable } from '../server-reachability';
import {
  MAX_SYNC_RETRIES,
  SyncOutcome,
  EntryResult
} from './offline-sync.models';
import { reconcileRejected } from './offline-local-patcher';
import { extractServerErrorMessage } from './offline-conflict-manager';

/**
 * ساخت هدرهای تفکیک‌شده قلمرو و شناسه تب
 */
export function buildScopedHeaders(appScope: AppScope): Record<string, string> {
  const tokenKey = appScope === 'finance' ? 'wh_access_token_finance' : 'wh_access_token_warehouse';
  const token =
    sessionStorage.getItem(tokenKey) ||
    sessionStorage.getItem('wh_access_token') ||
    localStorage.getItem(tokenKey) ||
    localStorage.getItem('wh_access_token');
  const tabId = sessionStorage.getItem('wh_tab_session_id') || 'tab_offline_sync';
  const role =
    sessionStorage.getItem('active_role_persona') ||
    (appScope === 'finance' ? 'operator' : 'counter');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Active-App': appScope === 'finance' ? 'personnel' : 'warehouse',
    'X-Active-Role': role,
    'X-Client-Tab-Id': tabId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * تلاش برای تازه‌سازی access token با استفاده از refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refresh = localStorage.getItem('wh_refresh_token');
  if (!refresh) return false;

  try {
    const response = await fetch(`${environment.apiUrl}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!response.ok) return false;

    const data = await response.json();
    if (!data?.access) return false;

    // ذخیره توکن جدید در localStorage و sessionStorage (تسک ۲۰)
    localStorage.setItem('wh_access_token', data.access);
    sessionStorage.setItem('wh_access_token', data.access);

    const currentScope = getCurrentActiveAppScope();
    const scopedKey = currentScope === 'finance' ? 'wh_access_token_finance' : 'wh_access_token_warehouse';
    sessionStorage.setItem(scopedKey, data.access);
    localStorage.setItem(scopedKey, data.access);

    // ذخیره refresh token جدید
    if (data.refresh) {
      localStorage.setItem('wh_refresh_token', data.refresh);
      sessionStorage.setItem('wh_refresh_token', data.refresh);
    }
    console.log('[OfflineSync] 🔑 توکن با موفقیت تازه‌سازی شد');
    return true;
  } catch {
    return false;
  }
}

/**
 * مدیریت خطای سرور (۵xx) — رکورد هرگز حذف نمی‌شود
 */
export async function handleRetry(
  entry: SyncQueueEntry,
  errorMessage: string,
  targetDb?: OfflineDatabase
): Promise<void> {
  if (!entry.id) return;
  const db = targetDb || getOfflineDb(entry.appScope);
  const newRetryCount = entry.retryCount + 1;

  await db.syncQueue.update(entry.id, {
    status: 'failed',
    retryCount: newRetryCount,
    lastError:
      newRetryCount >= MAX_SYNC_RETRIES
        ? `${errorMessage} — پس از ${newRetryCount} تلاش هنوز ارسال نشده (داده‌ها محفوظ است)`
        : errorMessage,
  });

  console.warn(
    `[OfflineSync] ⚠️ تلاش ${newRetryCount} ناموفق: ${entry.url} — ${errorMessage} (در صف باقی ماند)`
  );
}

/**
 * خطای انتقال (به سرور نرسیدیم) — رکورد بدون تغییر به صف برمی‌گردد
 */
export async function markTransportFailure(
  entry: SyncQueueEntry,
  errorMessage: string,
  targetDb?: OfflineDatabase
): Promise<void> {
  if (!entry.id) return;
  const db = targetDb || getOfflineDb(entry.appScope);
  await db.syncQueue.update(entry.id, {
    status: 'pending',
    lastError: `در انتظار اتصال: ${errorMessage}`,
  });
  console.log(`[OfflineSync] 📴 ${entry.url} ارسال نشد — در صف ماند تا اتصال برقرار شود`);
}

/**
 * ارسال یک درخواست از صف تفکیک‌شده به سرور با هدرها و توکن متناسب قلمرو
 */
export async function sendEntry(
  entry: SyncQueueEntry,
  targetDb?: OfflineDatabase,
  hasRetriedAuth = false,
  networkStatus: NetworkStatusService = NetworkStatusService.getInstance(),
  onRejected?: (err: SyncErrorEntry) => Promise<void>
): Promise<EntryResult> {
  if (!entry.id) return 'rejected';

  const appScope: AppScope = entry.appScope || resolveScopeFromUrl(entry.url);
  const db = targetDb || getOfflineDb(appScope);

  try {
    // علامت‌گذاری به عنوان در حال ارسال در دیتابیس اختصاصی قلمرو
    await db.syncQueue.update(entry.id, { status: 'sending' });

    const headers = buildScopedHeaders(appScope);
    const fetchOptions: RequestInit = {
      method: entry.method,
      headers,
    };

    // برای DELETE بدنه ارسال نمی‌کنیم
    if (entry.method !== 'DELETE' && entry.body) {
      fetchOptions.body = JSON.stringify(entry.body);
    }

    const response = await fetch(entry.url, fetchOptions);

    // بررسی دسترس‌پذیری سرور
    if (isServerUnreachable(response.status)) {
      networkStatus.reportServerUnreachable();
    } else {
      networkStatus.reportServerReachable();
    }

    if (response.ok) {
      // موفقیت‌آمیز — حذف از صف اختصاصی
      await db.syncQueue.delete(entry.id);
      console.log(`[OfflineSync] ✅ ارسال موفق [${appScope}]: ${entry.method} ${entry.url}`);
      return 'sent';
    } else if (response.status === 401) {
      // توکن منقضی — تلاش برای refresh و ارسال مجدد (فقط یک بار)
      if (!hasRetriedAuth && (await refreshAccessToken())) {
        return sendEntry(entry, db, true, networkStatus, onRejected);
      }
      // refresh ناموفق — رکورد در صف بماند تا بعد از login مجدد ارسال شود
      await db.syncQueue.update(entry.id, {
        status: 'pending',
        lastError: 'نشست منقضی شده — پس از ورود مجدد ارسال می‌شود',
      });
      console.warn(`[OfflineSync] 🔒 توکن منقضی [${appScope}] — ${entry.url} در صف ماند`);
      return 'auth-failed';
    } else if (response.status === 408 || response.status === 429) {
      // خطاهای موقت نرخ یا مهلت
      await handleRetry(entry, `خطای موقت سرور (${response.status}) — بعداً دوباره تلاش می‌شود`, db);
      return 'server-error';
    } else if (response.status >= 400 && response.status < 500) {
      // خطای کلاینت (4xx شامل 409) — انتقال به صندوق خطاها
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch {
        /* ignore JSON parse error */
      }
      const serverMessage = extractServerErrorMessage(response.status, errorBody);

      // ذخیره در صندوق خطاها در همان دیتابیس تفکیک‌شده
      const syncError: SyncErrorEntry = {
        method: entry.method,
        url: entry.url,
        body: entry.body,
        statusCode: response.status,
        serverMessage,
        failedAt: Date.now(),
        dismissed: 0,
        userId: entry.userId,
        entityType: entry.entityType,
        entitySyncId: entry.entitySyncId,
        serverResponse: errorBody,
        appScope,
      };
      syncError.id = await db.syncErrors.add(syncError);

      // حذف از صف
      await db.syncQueue.delete(entry.id);
      console.error(
        `[OfflineSync] ❌ خطای ${response.status} برای [${appScope}] ${entry.url} — منتقل به صندوق خطاها`
      );

      // Reconciliation: بازگشت رکورد محلی به نسخه سرور
      await reconcileRejected(syncError);
      if (onRejected) {
        await onRejected(syncError);
      }
      return 'rejected';
    } else {
      // خطای سرور (5xx)
      await handleRetry(entry, `خطای سرور (${response.status})`, db);
      return 'server-error';
    }
  } catch (error: any) {
    networkStatus.reportServerUnreachable();
    await markTransportFailure(entry, error?.message || 'اتصال برقرار نشد', db);
    return 'transport-failed';
  }
}

/** دریافت تعداد درخواست‌های در صف */
export async function getPendingCount(scope?: AppScope | 'all'): Promise<number> {
  const targetScope = scope || 'all';
  if (targetScope === 'warehouse') {
    return warehouseOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count();
  }
  if (targetScope === 'finance') {
    return financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count();
  }
  const [wh, fin] = await Promise.all([
    warehouseOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count(),
    financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count(),
  ]);
  return wh + fin;
}

/** همهٔ رکوردهای صف هر دو پایگاه‌داده، با هر وضعیتی */
export async function getUnsentCountStrict(): Promise<number> {
  const [wh, fin] = await Promise.all([
    warehouseOfflineDb.syncQueue.count(),
    financeOfflineDb.syncQueue.count(),
  ]);
  return wh + fin;
}

/**
 * پردازش ترتیبی صف با تخلیه چندمرحله‌ای و تفکیک کاربر
 */
export async function runQueueSequential(
  networkStatus: NetworkStatusService,
  onProgress?: () => Promise<void>,
  onRejected?: (err: SyncErrorEntry) => Promise<void>,
  onSyncSuccess?: () => void
): Promise<SyncOutcome> {
  // بررسی پیش‌پرواز — آفلاین یعنی «تلاشی انجام نشد»، نه «شکست خورد»
  if (!networkStatus.isBrowserOnline) return { status: 'offline' };

  let synced = 0;
  let rejected = 0;
  let transportAborted = false;
  let authRequired = false;

  console.log('[OfflineSync] 🔄 شروع پردازش صف همگام‌سازی تفکیک‌شده...');

  try {
    const currentUserId = getStoredCurrentUserId();
    let drainPass = 0;
    const MAX_DRAIN_PASSES = 5;

    // تخلیه چندمرحله‌ای (Drain Loop) جهت جلوگیری از جا ماندن تغییرات همزمان (تسک ۱۱)
    while (drainPass < MAX_DRAIN_PASSES && !transportAborted && !authRequired && networkStatus.isBrowserOnline) {
      drainPass++;

      const currentScope = getCurrentActiveAppScope();
      const otherScope: AppScope = currentScope === 'warehouse' ? 'finance' : 'warehouse';

      const currentDb = getOfflineDb(currentScope);
      const otherDb = getOfflineDb(otherScope);

      const [currentEntries, otherEntries] = await Promise.all([
        currentDb.syncQueue.where('status').anyOf(['pending', 'failed']).sortBy('createdAt'),
        otherDb.syncQueue.where('status').anyOf(['pending', 'failed']).sortBy('createdAt'),
      ]);

      let queueJobs: { entry: SyncQueueEntry; db: OfflineDatabase }[] = [
        ...currentEntries.map((e) => ({ entry: e, db: currentDb })),
        ...otherEntries.map((e) => ({ entry: e, db: otherDb })),
      ];

      if (queueJobs.length === 0) {
        if (drainPass === 1) {
          console.log('[OfflineSync] ✅ صف‌های هر دو قلمرو خالی هستند');
          if (onSyncSuccess) onSyncSuccess();
        }
        break;
      }

      // اولویت‌بندی هوشمند صف (تسک ۱): رکوردهای تازه اولویت بالاتر از رکوردهای مکرراً شکست‌خورده دارند
      queueJobs.sort((a, b) => {
        const aExceeded = (a.entry.retryCount || 0) >= MAX_SYNC_RETRIES ? 1 : 0;
        const bExceeded = (b.entry.retryCount || 0) >= MAX_SYNC_RETRIES ? 1 : 0;
        if (aExceeded !== bExceeded) return aExceeded - bExceeded;
        return a.entry.createdAt - b.entry.createdAt;
      });

      console.log(
        `[OfflineSync] 📋 دور ${drainPass}: ${queueJobs.length} درخواست در صف‌های تفکیک‌شده (${currentEntries.length} در ${currentScope}، ${otherEntries.length} در ${otherScope})`
      );

      let passProcessed = 0;

      for (const { entry, db } of queueJobs) {
        if (!networkStatus.isBrowserOnline) {
          console.log('[OfflineSync] 📴 اتصال قطع شد — پردازش متوقف شد (داده‌ها محفوظ است)');
          transportAborted = true;
          break;
        }

        // امنیت چندکاربری (تسک ۴): اگر رکورد متعلق به کاربر دیگری است، با توکن کاربر جاری ارسال نشود
        if (entry.userId && currentUserId && entry.userId !== currentUserId) {
          console.warn(
            `[OfflineSync] ⏸️ رکورد ${entry.id} متعلق به کاربر ${entry.userId} است (کاربر لاگین: ${currentUserId})؛ ارسال متوقف شد.`
          );
          continue;
        }

        const result = await sendEntry(entry, db, false, networkStatus, onRejected);
        if (onProgress) await onProgress();
        passProcessed++;

        if (result === 'sent') {
          synced++;
          continue;
        }
        if (result === 'rejected') {
          rejected++;
          continue;
        }
        if (result === 'auth-failed') {
          authRequired = true;
          break;
        }
        if (result === 'server-error') {
          // رفع Head-of-line Blocking (تسک ۱): اگر رکورد به سقف تلاش رسیده، متوقف نشو و مانع کارهای بعدی نشو
          if (entry.retryCount >= MAX_SYNC_RETRIES) {
            console.warn(`[OfflineSync] ⚠️ رکورد ${entry.id} به سقف تلاش مجدد رسید و با خطای سرور معلق شد؛ مسدودسازی برداشته شد.`);
            continue;
          }
          transportAborted = true;
          break;
        }
        // transport-failed: عدم دسترسی واقعی به سرور
        transportAborted = true;
        break;
      }

      if (passProcessed === 0) {
        // همه رکوردهای باقیمانده متعلق به کاربران دیگر یا غیرقابل‌پردازش هستند
        break;
      }

      const remainingCount = await getPendingCount();
      if (remainingCount === 0) {
        break;
      }
    }

    // زمان آخرین همگام‌سازی فقط وقتی معنا دارد که واقعاً با سرور حرف زده باشیم
    if (!transportAborted && synced > 0) {
      if (onSyncSuccess) onSyncSuccess();
    }
  } catch (error) {
    console.error('[OfflineSync] ❌ خطا در پردازش صف:', error);
  }

  // ─── تعیین نتیجه ───
  if (!networkStatus.isBrowserOnline) return { status: 'offline' };
  if (authRequired) return { status: 'auth-required', synced };
  if (transportAborted) return { status: 'server-unreachable', synced };

  const remaining = await getPendingCount();
  if (rejected > 0 || remaining > 0) {
    return { status: 'partial', synced, rejected, remaining };
  }
  if (synced === 0) return { status: 'nothing-to-sync' };
  return { status: 'completed', synced };
}

/**
 * لغو و حذف یک درخواست معلق از صف انتظار محلی قبل از ارسال به سرور
 */
export async function cancelQueueEntry(
  id: number,
  scope?: AppScope,
  invalidateCacheFn?: (url: string, scope?: AppScope) => Promise<void>
): Promise<boolean> {
  let entry: SyncQueueEntry | undefined;
  let targetDb: OfflineDatabase | undefined;
  if (scope) {
    targetDb = getOfflineDb(scope);
    entry = await targetDb.syncQueue.get(id);
  } else {
    entry = await warehouseOfflineDb.syncQueue.get(id);
    if (entry) {
      targetDb = warehouseOfflineDb;
    } else {
      entry = await financeOfflineDb.syncQueue.get(id);
      if (entry) targetDb = financeOfflineDb;
    }
  }

  if (!entry || !targetDb) {
    return false;
  }

  if (entry.status === 'sending') {
    return false;
  }

  const currentUserId = getStoredCurrentUserId();
  const isOwnRecord = !entry.userId || entry.userId === currentUserId;
  if (!isOwnRecord) {
    return false;
  }

  await targetDb.syncQueue.delete(id);
  if (entry?.url && invalidateCacheFn) {
    await invalidateCacheFn(entry.url, entry.appScope);
  }
  console.log(`[OfflineSync] 🗑️ درخواست با شناسه ${id} از صف انتظار محلی لغو و حذف شد.`);
  return true;
}

/**
 * دریافت تمام رکوردهای صف
 */
export async function getQueueEntries(scope?: AppScope | 'all'): Promise<SyncQueueEntry[]> {
  const targetScope = scope || 'all';
  if (targetScope === 'warehouse') {
    return warehouseOfflineDb.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .sortBy('createdAt');
  }
  if (targetScope === 'finance') {
    return financeOfflineDb.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .sortBy('createdAt');
  }
  const [wh, fin] = await Promise.all([
    warehouseOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).toArray(),
    financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).toArray(),
  ]);
  return [...wh, ...fin].sort((a, b) => a.createdAt - b.createdAt);
}
