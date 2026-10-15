import { Injectable, inject } from '@angular/core';
import { offlineDb, warehouseOfflineDb, financeOfflineDb, SyncCursorEntry } from './offline-db';
import { NetworkStatusService } from './network-status.service';
import { isServerUnreachable } from './server-reachability';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';

/**
 * SyncPullService — دانلود دلتای سرور به Dexie (نیمهٔ Pull معماری Local-First)
 *
 * قواعد کلیدی:
 * - مبنای دلتا فقط `server_time` برگشتی سرور است، نه ساعت دستگاه (Clock Skew).
 * - کلاینت خودش ۳۰ ثانیه حاشیهٔ همپوشانی از since کم می‌کند؛ upsert تکراری بی‌ضرر است.
 * - هر صفحه بلافاصله در Dexie ذخیره و cursor ثبت می‌شود → قطعی وسط دانلود یعنی
 *   دفعهٔ بعد از همان‌جا ادامه می‌یابد، نه از اول.
 * - tombstone (is_deleted) رکورد محلی را حذف می‌کند مگر تغییری از همان رکورد در صف
 *   pending باشد → نگه داشتن با پرچم _serverDeleted (داده کاربر هرگز گم نمی‌شود).
 * - پاسخ 410 یعنی cursor/since قدیمی‌تر از عمر tombstoneهاست → Full Resync همان انبار.
 */

/** همان حاشیهٔ همپوشانی که سند طراحی تعیین کرده */
const SINCE_OVERLAP_MS = 30_000;
const PAGE_LIMIT = 500;

/**
 * رجیستری مدل‌های مجاز برای همگام‌سازی و نگاشت به جداول محلی — فاز ۶ (تسک ۵۸)
 * به صورت پویا قابل ثبت توسط هر ماژول
 */
export const PULL_ENTITIES: Record<string, 'countTasks' | 'items' | 'dynamicFields' | 'docTasks' | string> = {
  count_tasks: 'countTasks',
  items: 'items',
  dynamic_fields: 'dynamicFields',
  doc_tasks: 'docTasks',
};

export function registerPullEntity(modelKey: string, tableName: string): void {
  PULL_ENTITIES[modelKey] = tableName;
}

const MODEL_TABLES = PULL_ENTITIES;

/**
 * فاز ۶ (تسک ۵۹) — ساخت کلید کرسر با استاندارد توسعه‌یافته userId:scopeKind:scopeId
 */
export function buildCursorKey(userId: number, scopeId: number, scopeKind: string = 'warehouse'): string {
  return `${userId}:${scopeKind}:${scopeId}`;
}

/** شناسه کاربر لاگین‌شده از پروفایل ذخیره‌شده (صف/cursor per-user است) */
export function getStoredCurrentUserId(): number | null {
  try {
    const raw = sessionStorage.getItem('wh_user_profile') || localStorage.getItem('wh_user_profile');
    if (!raw) return null;
    const id = JSON.parse(raw)?.id;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

/**
 * دریافت وضعیت کرسر به روش expand-contract (ابتدا کلید جدید، سپس fallback به کلید قدیمی)
 */
async function getCursorState(userId: number, scopeId: number, scopeKind: string = 'warehouse'): Promise<any> {
  const newKey = buildCursorKey(userId, scopeId, scopeKind);
  let state = await offlineDb.syncCursors.get(newKey);
  if (!state && scopeKind === 'warehouse') {
    // خواندن کلید قدیمی جهت تداوم نشست کاربر بدون نیاز به full resync
    const legacyKey = `${userId}:${scopeId}`;
    state = await offlineDb.syncCursors.get(legacyKey);
    if (state) {
      state.key = newKey; // ارتقای کلید در حافظه
    }
  }
  return state;
}

export type PullOutcome =
  | { status: 'completed'; upserted: number; deleted: number; bytes: number }
  | { status: 'offline' }
  | { status: 'server-unreachable' }
  | { status: 'auth-required' }
  | { status: 'forbidden' }
  | { status: 'already-running' }
  | { status: 'error'; message: string };

@Injectable({
  providedIn: 'root',
})
export class SyncPullService {
  private static instance: SyncPullService;
  private network = NetworkStatusService.getInstance();
  private inFlight = false;
  private moduleRegistry: ModuleRegistryService;

  private _isPulling$ = new BehaviorSubject<boolean>(false);
  readonly isPulling$ = this._isPulling$.asObservable();

  private _pullProgress$ = new BehaviorSubject<{ current: number, total: number | null, bytes: number } | null>(null);
  readonly pullProgress$ = this._pullProgress$.asObservable();

  /** بعد از هر Pull موفق emit می‌شود — storeهای دامنه برای رفرش UI گوش می‌دهند */
  private _pullCompleted$ = new Subject<{ warehouseId: number }>();
  readonly pullCompleted$ = this._pullCompleted$.asObservable();

  constructor(moduleRegistry?: ModuleRegistryService) {
    if (moduleRegistry) {
      this.moduleRegistry = moduleRegistry;
    } else {
      try {
        this.moduleRegistry = inject(ModuleRegistryService);
      } catch {
        this.moduleRegistry = getModuleRegistry();
      }
    }
    SyncPullService.instance = this;
  }

  static getInstance(): SyncPullService {
    if (!SyncPullService.instance) {
      try {
        SyncPullService.instance = inject(SyncPullService);
      } catch {
        SyncPullService.instance = new SyncPullService();
      }
    }
    return SyncPullService.instance;
  }

  // ════════════════════════════════════════════
  //  Pull اصلی
  // ════════════════════════════════════════════

  /**
   * دانلود دلتای یک قلمرو (انبار یا مالی). امن برای فراخوانی مکرر (هم‌زمانی ندارد).
   * @param scopeId شناسه انبار یا شناسه پروژه مالی
   * @param scopeKindOrRetry نوع قلمرو ('warehouse' یا 'finance') یا پرچم ریترای میراثی (boolean)
   * @param isRetryAfter410 جلوگیری از حلقهٔ بی‌نهایت Full Resync
   */
  async pullChanges(
    scopeId: number,
    scopeKindOrRetry: 'warehouse' | 'finance' | boolean = 'warehouse',
    isRetryAfter410 = false
  ): Promise<PullOutcome> {
    const scopeKind: 'warehouse' | 'finance' = typeof scopeKindOrRetry === 'string' ? scopeKindOrRetry : 'warehouse';
    const isRetry: boolean = typeof scopeKindOrRetry === 'boolean' ? scopeKindOrRetry : isRetryAfter410;

    if (this.inFlight) return { status: 'already-running' };
    if (!this.network.isBrowserOnline) return { status: 'offline' };
    const syncConfig = this.moduleRegistry
      .getExtensions('syncConfig')
      .find(e => e.extension.scopeKind === scopeKind)?.extension;
    if (!syncConfig) {
      return { status: 'completed', upserted: 0, deleted: 0, bytes: 0 };
    }

    const userId = this.getCurrentUserId();
    if (userId === null) return { status: 'auth-required' };

    this.inFlight = true;
    this._isPulling$.next(true);

    let upserted = 0;
    let deleted = 0;
    let totalRecords: number | null = null;
    let bytesDownloaded = 0;

    this._pullProgress$.next({ current: 0, total: null, bytes: 0 });

    try {
      const cursorKey = buildCursorKey(userId, scopeId, scopeKind);
      let state = await getCursorState(userId, scopeId, scopeKind);
      if (!state) {
        state = {
          key: cursorKey, userId, warehouseId: scopeId, scopeKind,
          cursor: null, inFlightSince: null, pendingServerTime: null, lastServerTime: null,
        };
      }

      // اگر دانلود قبلی نیمه‌تمام مانده، با همان since ادامه می‌دهیم؛
      // وگرنه since جدید = آخرین server_time منهای ۳۰ ثانیه همپوشانی.
      let since: string | null;
      if (state.cursor) {
        since = state.inFlightSince;
      } else {
        since = state.lastServerTime
          ? new Date(new Date(state.lastServerTime).getTime() - SINCE_OVERLAP_MS).toISOString()
          : null;
        state.inFlightSince = since;
        state.pendingServerTime = null;
      }

      let cursor: string | null = state.cursor;
      let hasMore = true;

      const endpoint = syncConfig.pullEndpoint;

      while (hasMore) {
        const paramKey = syncConfig.scopeParamKey;
        const params = new URLSearchParams({ [paramKey]: String(scopeId), limit: String(PAGE_LIMIT) });
        if (since) params.set('since', since);
        if (cursor) params.set('cursor', cursor);

        const response = await this.fetchPage(endpoint, params);

        if (response.kind === 'http') {
          const res = response.res;
          if (isServerUnreachable(res.status)) {
            this.network.reportServerUnreachable();
            return { status: 'server-unreachable' };
          }
          this.network.reportServerReachable();

          if (res.status === 401) return { status: 'auth-required' };
          if (res.status === 403) {
            // ابطال دسترسی کاربر به این قلمرو — پاکسازی فوری داده‌های محلی جهت جلوگیری از نشت اطلاعات (تسک ۲۱)
            console.warn(`[SyncPull] ⛔ دسترسی ۴۰۳ برای قلمرو ${scopeKind} (${scopeId}) — پاکسازی داده‌های محلی`);
            try {
              if (scopeKind === 'warehouse') {
                await Promise.all([
                  warehouseOfflineDb.items.where('warehouse_id').equals(scopeId).delete(),
                  warehouseOfflineDb.countTasks.where('warehouse_id').equals(scopeId).delete(),
                  warehouseOfflineDb.docTasks.where('warehouse_id').equals(scopeId).delete(),
                  warehouseOfflineDb.dynamicFields.where('warehouse_id').equals(scopeId).delete(),
                ]);
              }
            } catch (clearErr) {
              console.warn('[SyncPull] خطا در پاکسازی داده‌های قلمرو ابطال‌شده:', clearErr);
            }
            return { status: 'forbidden' };
          }
          if (res.status === 404) {
            // اندپوینت در این پروفایل سرور موجود نیست
            return { status: 'completed', upserted: 0, deleted: 0, bytes: 0 };
          }
          if (res.status === 410) {
            // کلاینت قدیمی‌تر از عمر tombstoneها → Full Resync (فقط یک بار)
            console.warn(`[SyncPull] ⏳ 410 — Full Resync قلمرو ${scopeKind}:`, scopeId);
            await offlineDb.syncCursors.delete(cursorKey);
            if (scopeKind === 'warehouse') {
              await offlineDb.syncCursors.delete(`${userId}:${scopeId}`);
            }
            this.inFlight = false;
            this._isPulling$.next(false);
            if (isRetry) return { status: 'error', message: 'full_resync_loop' };
            return this.pullChanges(scopeId, scopeKind, true);
          }
          if (!res.ok) {
            return { status: 'error', message: `HTTP ${res.status}` };
          }

          const textData = await res.text();
          bytesDownloaded += textData.length;
          const data = JSON.parse(textData);

          if (data.total_records !== undefined) {
            totalRecords = data.total_records;
          }

          // ذخیرهٔ server_time صفحهٔ اول به‌عنوان مبنای دلتای بعدی (پس از اتمام)
          if (!state.pendingServerTime) {
            state.pendingServerTime = data.server_time;
          }

          const counts = await this.applyPage(data.results || {}, scopeId, userId);
          upserted += counts.upserted;
          deleted += counts.deleted;

          this._pullProgress$.next({ current: upserted + deleted, total: totalRecords, bytes: bytesDownloaded });

          cursor = data.next_cursor || null;
          hasMore = !!data.has_more && !!cursor;

          // ثبت پیشرفت — قطعی بعد از این نقطه یعنی ادامه از همین‌جا
          await offlineDb.syncCursors.put({
            ...state,
            key: cursorKey,
            scopeKind,
            cursor: hasMore ? cursor : null,
            inFlightSince: hasMore ? state.inFlightSince : null,
            pendingServerTime: hasMore ? state.pendingServerTime : null,
            lastServerTime: hasMore ? state.lastServerTime : (state.pendingServerTime || state.lastServerTime),
          });
        } else {
          // transport error — به سرور نرسیدیم؛ cursor ذخیره‌شده دست‌نخورده می‌ماند
          this.network.reportServerUnreachable();
          return { status: 'server-unreachable' };
        }
      }

      console.log(`[SyncPull] ✅ قلمرو ${scopeKind} ${scopeId}: ${upserted} upsert، ${deleted} حذف`);
      this._pullCompleted$.next({ warehouseId: scopeId });
      return { status: 'completed', upserted, deleted, bytes: bytesDownloaded };
    } catch (error: any) {
      console.error('[SyncPull] ❌ خطا در Pull:', error);
      return { status: 'error', message: error?.message || 'unknown' };
    } finally {
      this.inFlight = false;
      this._isPulling$.next(false);
      this._pullProgress$.next(null);
    }
  }

  /** fetch یک صفحه — خطای transport را از پاسخ HTTP جدا می‌کند */
  private async fetchPage(endpoint: string, params: URLSearchParams): Promise<{ kind: 'http'; res: Response } | { kind: 'transport' }> {
    const token = sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`${environment.apiUrl}${endpoint}?${params.toString()}`, { headers });
      return { kind: 'http', res };
    } catch {
      return { kind: 'transport' };
    }
  }

  /**
   * اعمال یک صفحه از پاسخ روی Dexie — upsert بر اساس sync_id.
   * tombstone → حذف محلی، مگر رکورد در صف pending ارجاع داشته باشد.
   */
  private async applyPage(
    results: Record<string, any[]>,
    warehouseId: number,
    userId: number
  ): Promise<{ upserted: number; deleted: number }> {
    let upserted = 0;
    let deleted = 0;

    // sync_id هایی که تغییر ارسال‌نشده در صف هر دو قلمرو دارند — رکوردشان هرگز پاک نمی‌شود (تسک ۲)
    const [whPending, finPending] = await Promise.all([
      warehouseOfflineDb.syncQueue.where('status').anyOf(['pending', 'sending', 'failed']).toArray(),
      financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'sending', 'failed']).toArray(),
    ]);
    const pendingSyncIds = new Set(
      [...whPending, ...finPending].map((e) => e.entitySyncId).filter((s): s is string => !!s)
    );

    for (const [modelKey, rows] of Object.entries(results)) {
      const tableName = MODEL_TABLES[modelKey];
      if (!tableName || !Array.isArray(rows) || rows.length === 0) continue;
      const table = (offlineDb as any)[tableName];

      const toPut: any[] = [];
      const toDelete: string[] = [];

      for (const row of rows) {
        if (!row.sync_id) continue; // بدون کلید پایدار قابل upsert نیست
        if (row.is_deleted) {
          if (pendingSyncIds.has(row.sync_id)) {
            // تغییر ارسال‌نشدهٔ کاربر روی رکوردی که سرور حذف کرده — نگه بدار و علامت بزن
            const existing = await table.get(row.sync_id);
            if (existing) {
              toPut.push({ ...existing, _serverDeleted: true, updated_at: row.updated_at });
            }
          } else {
            toDelete.push(row.sync_id);
          }
        } else {
          // پرچم‌های محلی رکورد قبلی (مثل _offlinePending وقتی صف pending دارد) حفظ شوند
          const existing = await table.get(row.sync_id);
          const keepPending = existing?._offlinePending && pendingSyncIds.has(row.sync_id);
          toPut.push({
            ...row,
            warehouse_id: row.warehouse_id ?? row.warehouse ?? warehouseId,
            ...(keepPending ? { _offlinePending: true, _localDraft: existing._localDraft } : {}),
          });
        }
      }

      if (toPut.length) {
        await table.bulkPut(toPut);
        upserted += toPut.length;
      }
      if (toDelete.length) {
        await table.bulkDelete(toDelete);
        deleted += toDelete.length;
      }
    }

    return { upserted, deleted };
  }

  // ════════════════════════════════════════════
  //  ابزارها
  // ════════════════════════════════════════════

  /** شناسه کاربر لاگین‌شده از پروفایل ذخیره‌شده (صف/cursor per-user است) */
  getCurrentUserId(): number | null {
    return getStoredCurrentUserId();
  }

  /** زمان آخرین Pull موفق (server_time) برای نمایش در UI */
  async getLastServerTime(warehouseId: number, scopeKind: string = 'warehouse'): Promise<string | null> {
    const userId = this.getCurrentUserId();
    if (userId === null) return null;
    const state = await getCursorState(userId, warehouseId, scopeKind);
    return state?.lastServerTime ?? null;
  }
}
