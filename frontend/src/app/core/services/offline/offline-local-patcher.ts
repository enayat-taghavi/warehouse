import {
  offlineDb,
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  getAllOfflineDbs,
  resolveOfflineDbStrict,
  resolveScopeFromUrl,
  AppScope,
  DEFAULT_OFFLINE_SCOPE,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';
import {
  DEFAULT_CACHE_TTL,
  PRUNE_STORAGE_KEY
} from './offline-sync.models';

/**
 * پاکسازی رکوردهای گذرا، ضربان قلب، تله‌متری و لاگ‌اوت از صف‌های آفلاین IndexedDB
 */
export async function purgeEphemeralQueueEntries(): Promise<number> {
  let deletedCount = 0;
  try {
    const isEphemeral = (url?: string) => {
      const u = (url || '').toLowerCase();
      return (
        u.includes('/telemetry/') ||
        u.includes('/heartbeat/') ||
        u.includes('/health/') ||
        u.includes('/system-health/') ||
        u.includes('/auth/logout') ||
        u.includes('/auth/login') ||
        u.includes('/ping')
      );
    };

    for (const db of [warehouseOfflineDb, financeOfflineDb]) {
      const entries = await db.syncQueue.toArray();
      const toDelete = entries
        .filter((e) => isEphemeral(e.url))
        .map((e) => e.id)
        .filter((id): id is number => typeof id === 'number');

      if (toDelete.length > 0) {
        await db.syncQueue.bulkDelete(toDelete);
        deletedCount += toDelete.length;
        console.log(`[OfflineSync] 🧹 ${toDelete.length} رکورد غیرمجاز پالس/تله‌متری از صف آفلاین پاکسازی شد.`);
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] خطا در پاکسازی رکوردهای گذرا از صف:', err);
  }
  return deletedCount;
}

/**
 * حذف رکوردهای دامنهٔ محلی قدیمی‌تر از ۶ ماه (updated_at) که هیچ تغییر
 * ارسال‌نشده‌ای در صف ندارند. صف و صندوق خطا هرگز prune نمی‌شوند.
 */
export async function pruneOldLocalData(): Promise<number> {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const last = parseInt(localStorage.getItem(PRUNE_STORAGE_KEY) || '0', 10);
  if (Date.now() - last < ONE_DAY) return 0;
  localStorage.setItem(PRUNE_STORAGE_KEY, String(Date.now()));

  const cutoffIso = new Date(Date.now() - 180 * ONE_DAY).toISOString();
  // خواندن صف تمامی قلمروها تا هیچ رکورد معلقی هرگز پاک نشود (تسک ۲)
  const allDbs = getAllOfflineDbs();
  const queueEntriesPerDb = await Promise.all(allDbs.map((db) => db.syncQueue.toArray()));
  const pendingEntries = queueEntriesPerDb.flat();
  const protectedIds = new Set(pendingEntries.map((e) => e.entitySyncId).filter(Boolean));

  let pruned = 0;
  for (const table of [warehouseOfflineDb.countTasks, warehouseOfflineDb.items, warehouseOfflineDb.dynamicFields]) {
    const old = await table.where('updated_at').below(cutoffIso).primaryKeys();
    const deletable = old.filter((k) => !protectedIds.has(k as string));
    if (deletable.length) {
      await table.bulkDelete(deletable as string[]);
      pruned += deletable.length;
    }
  }
  if (pruned > 0) {
    console.log(`[OfflineSync] 🧹 ${pruned} رکورد محلی قدیمی‌تر از ۶ ماه پاک شد`);
  }
  return pruned;
}

/**
 * ذخیره پاسخ GET در کش اختصاصی قلمرو مربوطه.
 */
export async function cacheResponse(
  url: string,
  response: any,
  scope?: AppScope,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> {
  if (response === null || response === undefined) return;

  const appScope = scope || resolveScopeFromUrl(url);
  const targetDb = getOfflineDb(appScope);
  await targetDb.apiCache.put({
    url,
    response,
    cachedAt: Date.now(),
    // TTL صفر یعنی «هیچ‌وقت کهنه نشود»
    expiresAt: ttl === 0 ? Number.MAX_SAFE_INTEGER : Date.now() + ttl,
    appScope,
  });
}

/**
 * خواندن رکورد کش‌شده GET از دیتابیس اختصاصی قلمرو
 */
export async function getCachedEntry(
  url: string,
  scope?: AppScope
): Promise<{ response: any; cachedAt: number; isStale: boolean } | null> {
  const appScope = scope || resolveScopeFromUrl(url);
  const primaryDb = getOfflineDb(appScope);
  let entry = await primaryDb.apiCache.get(url);
  if (!entry) {
    const allDbs = getAllOfflineDbs();
    for (const db of allDbs) {
      if (db === primaryDb) continue;
      entry = await db.apiCache.get(url);
      if (entry) break;
    }
  }
  if (!entry) return null;
  return {
    response: entry.response,
    cachedAt: entry.cachedAt,
    isStale: entry.expiresAt < Date.now(),
  };
}

/**
 * ابطال و پاکسازی یک مسیر یا الگوی URL از کش محلی IndexedDB
 * برای جلوگیری از دیدن داده‌های استیل پس از اعمال تغییرات یا حذف‌ها
 */
export async function invalidateCache(urlPatternOrExact: string, scope?: AppScope): Promise<void> {
  try {
    let dbs: OfflineDatabase[];
    if (scope) {
      const resolved = resolveOfflineDbStrict(scope);
      dbs = resolved ? [resolved] : [];
    } else {
      dbs = getAllOfflineDbs();
    }
    for (const db of dbs) {
      await db.apiCache.delete(urlPatternOrExact);
      const matchingKeys = await db.apiCache
        .filter(entry => entry.url.startsWith(urlPatternOrExact) || entry.url.includes(urlPatternOrExact))
        .primaryKeys();
      if (matchingKeys.length > 0) {
        await db.apiCache.bulkDelete(matchingKeys as string[]);
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] خطا در ابطال کش:', err);
  }
}

/**
 * Reconciliation پس از رد صریح سرور (اصلاح ۵ طرح):
 * دادهٔ خوش‌بینانهٔ محلی نباید طوری بماند که انگار پذیرفته شده.
 * اگر سرور نسخهٔ خودش را داده (server_record در 409) همان جایگزین می‌شود؛
 * وگرنه فقط پرچم pending پاک می‌شود و نسخهٔ تازه با Pull بعدی می‌رسد.
 */
export async function reconcileRejected(err: SyncErrorEntry): Promise<void> {
  const db = err.appScope ? resolveOfflineDbStrict(err.appScope) : getOfflineDb(err.appScope);
  if (!db) {
    console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${err.appScope}] یافت نشد؛ عملیات reconcileRejected متوقف شد.`);
    return;
  }

  // ۱. ابطال کش متناظر در apiCache برای دریافت نسخه تازه از سرور
  if (err.url) {
    const baseUrl = err.url.split('?')[0];
    await invalidateCache(baseUrl, err.appScope);
  }

  if (err.entityType === 'count_task_bulk') {
    try {
      if (db.countTasks) {
        await db.countTasks.where('status').equals('SENDING').modify({ status: 'PENDING_COUNT' });
      }
    } catch (bulkErr) {
      console.warn('[OfflineSync] خطا در reconciliation تسک‌های گروهی:', bulkErr);
    }
    return;
  }

  if (!err.entitySyncId || !err.entityType) return;
  const tableMap: Record<string, 'countTasks' | 'items' | 'dynamicFields' | 'docTasks'> = {
    count_task: 'countTasks',
    item: 'items',
    dynamic_field: 'dynamicFields',
    doc_task: 'docTasks',
  };
  const tableName = tableMap[err.entityType];
  if (!tableName) return;
  const table = (db as any)[tableName];
  if (!table) return;

  try {
    // آیا تغییر دیگری از همین رکورد هنوز در صف است؟ اگر بله پرچم می‌ماند.
    const stillPending = await db.syncQueue
      .where('entitySyncId').equals(err.entitySyncId)
      .and((e) => ['pending', 'sending', 'failed'].includes(e.status))
      .count();

    const serverRecord = err.serverResponse?.server_record;
    if (serverRecord?.sync_id) {
      const existing = await table.get(err.entitySyncId);
      await table.put({
        ...serverRecord,
        warehouse_id: serverRecord.warehouse_id ?? serverRecord.warehouse ?? existing?.warehouse_id,
        ...(stillPending > 0 ? { _offlinePending: true } : {}),
      });
    } else if (stillPending === 0) {
      const existing = await table.get(err.entitySyncId);
      if (existing?._offlinePending) {
        delete existing._offlinePending;
        delete existing._localDraft;
        await table.put(existing);
      }
    }
  } catch (e) {
    console.warn('[OfflineSync] ⚠️ reconciliation ناموفق:', e);
  }
}

/**
 * اعمال خوش‌بینانهٔ تغییر روی جدول‌های محلی و علامت‌گذاری _offlinePending
 */
export async function applyOptimisticUpdate(
  tableName: 'countTasks' | 'items' | 'dynamicFields' | 'docTasks',
  syncId: string,
  patch: Record<string, any>,
  scope: AppScope = DEFAULT_OFFLINE_SCOPE
): Promise<void> {
  const db = scope ? resolveOfflineDbStrict(scope) : getOfflineDb(scope);
  if (!db) {
    console.warn(`[OfflineSync] ⚠️ دیتابیس برای قلمرو [${scope}] یافت نشد؛ applyOptimisticUpdate متوقف شد.`);
    return;
  }
  const table = (db as any)[tableName];
  if (!table) return;
  const existing = await table.get(syncId);
  if (existing) {
    await table.put({
      ...existing,
      ...patch,
      _offlinePending: true,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * ادغام رکوردهای _offlinePending با رکوردهای واکشی‌شده
 */
export function mergeOfflinePending<T extends { sync_id?: string; _offlinePending?: boolean }>(
  records: T[],
  pendingEntries: SyncQueueEntry[]
): T[] {
  if (!pendingEntries || pendingEntries.length === 0) return records;
  const pendingSet = new Set(pendingEntries.map((e) => e.entitySyncId).filter(Boolean));
  return records.map((record) => {
    if (record.sync_id && pendingSet.has(record.sync_id)) {
      return { ...record, _offlinePending: true };
    }
    return record;
  });
}
