import { Injectable } from '@angular/core';
import {
  offlineDb,
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  getAllOfflineDbs,
  resolveScopeFromUrl,
  migrateLegacyDatabaseIfNeeded,
  AppScope,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry,
} from './offline-db';
import { SyncPullService, getStoredCurrentUserId, buildCursorKey } from './sync-pull.service';
import { NetworkStatusService } from './network-status.service';
import { PhotoUploadQueueService, PhotoFlushOutcome } from './photo-upload-queue.service';
import { BehaviorSubject, Subject, Subscription, filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getModuleRegistry } from '../modules/module-registry.service';
import { isServerUnreachable } from './server-reachability';
import { resolveServerUrl } from '../platform/server-origin';

import {
  SyncOutcome,
  EntryResult,
  DeepUpdateSummary,
  DeepUpdateState,
  DEFAULT_CACHE_TTL,
  DEFAULT_SYNC_INTERVAL,
  CACHE_TTL_STORAGE_KEY,
  SYNC_INTERVAL_STORAGE_KEY,
  QUEUE_LOCK_NAME,
} from './offline/offline-sync.models';
import {
  cacheResponse as patcherCacheResponse,
  getCachedEntry as patcherGetCachedEntry,
  invalidateCache as patcherInvalidateCache,
  pruneOldLocalData as patcherPruneOldLocalData,
  purgeEphemeralQueueEntries as patcherPurgeEphemeralQueueEntries,
} from './offline/offline-local-patcher';
import {
  getErrors as managerGetErrors,
  getAllErrors as managerGetAllErrors,
  dismissError as managerDismissError,
  dismissAllErrors as managerDismissAllErrors,
  deleteError as managerDeleteError,
  clearAllErrors as managerClearAllErrors,
  retryError as managerRetryError,
  resolveConflict as managerResolveConflict,
} from './offline/offline-conflict-manager';
import {
  runQueueSequential,
  refreshAccessToken as runnerRefreshAccessToken,
  getPendingCount as runnerGetPendingCount,
  getUnsentCountStrict as runnerGetUnsentCountStrict,
  cancelQueueEntry as runnerCancelQueueEntry,
  getQueueEntries as runnerGetQueueEntries,
} from './offline/offline-queue-runner';

export type { SyncOutcome, DeepUpdateSummary };

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private static instance: OfflineSyncService;
  private network = NetworkStatusService.getInstance();
  private photoQueue = PhotoUploadQueueService.getInstance();
  private subscription: Subscription | null = null;
  private photoSubscription: Subscription | null = null;
  private autoSyncTimer: any = null;

  // ─── Observables عمومی ───

  /** آیا الان در حال همگام‌سازی هست؟ */
  private _isSyncing$ = new BehaviorSubject<boolean>(false);
  readonly isSyncing$ = this._isSyncing$.asObservable();

  /** تعداد درخواست‌های در صف انتظار */
  private _pendingCount$ = new BehaviorSubject<number>(0);
  readonly pendingCount$ = this._pendingCount$.asObservable();

  /** تعداد خطاهای خوانده‌نشده در صندوق */
  private _errorCount$ = new BehaviorSubject<number>(0);
  readonly errorCount$ = this._errorCount$.asObservable();

  /** آخرین زمان همگام‌سازی موفقیت‌آمیز */
  private _lastSyncTime$ = new BehaviorSubject<number | null>(null);
  readonly lastSyncTime$ = this._lastSyncTime$.asObservable();

  /**
   * نتیجه هر دور پردازش صف — شامل دورهای خودکار (پس از بازگشت اتصال)
   */
  private _syncOutcome$ = new Subject<SyncOutcome>();
  readonly syncOutcome$ = this._syncOutcome$.asObservable();

  private _deepUpdateState$ = new BehaviorSubject<DeepUpdateState | null>(null);
  readonly deepUpdateState$ = this._deepUpdateState$.asObservable();

  /**
   * رد صریح سرور (4xx/409) — storeهای دامنه برای reconciliation گوش می‌دهند
   */
  private _rejected$ = new Subject<SyncErrorEntry>();
  readonly rejected$ = this._rejected$.asObservable();

  /**
   * جریان اطلاع‌رسانی بروزرسانی زنده داده‌ها از سرور در پس‌زمینه (Stale-While-Revalidate)
   */
  private _liveDataUpdates$ = new Subject<{ url: string; data: any; timestamp: number }>();
  readonly liveDataUpdates$ = this._liveDataUpdates$.asObservable();

  /** انتشار تغییرات داده‌ای دریافت شده از استعلام پس‌زمینه */
  notifyDataUpdated(url: string, data: any): void {
    this._liveDataUpdates$.next({ url, data, timestamp: Date.now() });
  }

  private constructor() {}

  /** دریافت نمونه سینگلتون */
  static getInstance(): OfflineSyncService {
    if (!OfflineSyncService.instance) {
      OfflineSyncService.instance = new OfflineSyncService();
    }
    return OfflineSyncService.instance;
  }

  get pullProgress$() { return SyncPullService.getInstance().pullProgress$; }
  get isPulling$() { return SyncPullService.getInstance().isPulling$; }

  // ─── مقادیر لحظه‌ای ───
  get isSyncing(): boolean { return this._isSyncing$.value; }
  get pendingCount(): number { return this._pendingCount$.value; }
  get errorCount(): number { return this._errorCount$.value; }

  /**
   * راه‌اندازی اولیه — در app initializer فراخوانی می‌شود
   */
  initialize(): void {
    // مهاجرت امن در صورت وجود پایگاه‌داده قدیمی
    migrateLegacyDatabaseIfNeeded().catch(() => {});

    // رکوردهای گیرکرده در وضعیت sending در تمامی پایگاه‌های داده تفکیک‌شده را آزاد کن
    for (const db of getAllOfflineDbs()) {
      db.syncQueue
        .where('status')
        .equals('sending')
        .modify({ status: 'pending' })
        .catch(() => {});
    }

    // همین کار برای صف عکس — عکس نیمه‌ارسال‌شده باید دوباره در نوبت بیفتد
    this.photoQueue.initialize().catch(() => {});

    this.photoSubscription = this.photoQueue.changed$.subscribe(() => {
      this.refreshCounts();
    });

    // وقتی اتصال کامل (مرورگر + سرور) برقرار شد، صف را پردازش کن
    this.subscription = this.network.state$
      .pipe(filter((state) => state === 'online'))
      .subscribe(() => {
        this.processQueue();
      });

    // اگر الان آنلاین هستیم، صف باقی‌مانده را پردازش کن
    if (this.network.isBrowserOnline) {
      this.processQueue();
    }

    // راه‌اندازی تایمر همگام‌سازی خودکار
    this.startAutoSync();

    // به‌روزرسانی شمارنده‌ها
    this.refreshCounts();

    // پاکسازی دادهٔ دامنهٔ خیلی قدیمی (نگهداری ۶ ماه) — روزی یک‌بار
    this.pruneOldLocalData().catch(() => {});

    // پاکسازی رکوردهای گذرا/تله‌متری از صف آفلاین
    this.purgeEphemeralQueueEntries().catch(() => {});

    console.log('[OfflineSync] ✅ سرویس همگام‌سازی آفلاین راه‌اندازی شد');
  }

  /**
   * پاکسازی رکوردهای گذرا، ضربان قلب، تله‌متری و لاگ‌اوت از صف‌های آفلاین IndexedDB
   */
  public async purgeEphemeralQueueEntries(): Promise<void> {
    await patcherPurgeEphemeralQueueEntries();
    await this.refreshCounts();
  }

  /**
   * حذف رکوردهای دامنهٔ محلی قدیمی‌تر از ۶ ماه که تغییر ارسال‌نشده ندارند
   */
  private async pruneOldLocalData(): Promise<void> {
    await patcherPruneOldLocalData();
  }

  // ════════════════════════════════════════════
  //  TTL — مدت اعتبار کش (قابل تنظیم)
  // ════════════════════════════════════════════

  /** خواندن TTL از localStorage یا مقدار پیش‌فرض */
  getCacheTTL(): number {
    const stored = localStorage.getItem(CACHE_TTL_STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 0) return val;
    }
    return DEFAULT_CACHE_TTL;
  }

  /** تنظیم TTL (به میلی‌ثانیه) */
  setCacheTTL(ttlMs: number): void {
    localStorage.setItem(CACHE_TTL_STORAGE_KEY, String(ttlMs));
  }

  // ════════════════════════════════════════════
  //  Auto Sync — همگام‌سازی خودکار
  // ════════════════════════════════════════════

  /** خواندن فاصله زمانی اتوسینک از localStorage یا مقدار پیش‌فرض */
  getSyncInterval(): number {
    const stored = localStorage.getItem(SYNC_INTERVAL_STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return DEFAULT_SYNC_INTERVAL;
  }

  /** تنظیم فاصله زمانی همگام‌سازی خودکار (به میلی‌ثانیه) و ری‌استارت تایمر */
  setSyncInterval(intervalMs: number): void {
    localStorage.setItem(SYNC_INTERVAL_STORAGE_KEY, String(intervalMs));
    this.stopAutoSync();
    this.startAutoSync();
  }

  /**
   * اعمال تنظیمات ادمین از public config
   */
  applyRemoteConfig(cfg: {
    offline_sync_interval_minutes?: number;
    offline_cache_ttl_minutes?: number;
  }): void {
    const clamp = (val: unknown, low: number, high: number): number | null => {
      const num = Number(val);
      if (!Number.isFinite(num)) return null;
      return Math.max(low, Math.min(high, Math.round(num)));
    };

    const syncMinutes = clamp(cfg.offline_sync_interval_minutes, 1, 1440);
    if (syncMinutes !== null && syncMinutes * 60_000 !== this.getSyncInterval()) {
      this.setSyncInterval(syncMinutes * 60_000);
      console.log(`[OfflineSync] ⚙️ بازه همگام‌سازی خودکار: ${syncMinutes} دقیقه`);
    }

    const ttlMinutes = clamp(cfg.offline_cache_ttl_minutes, 0, 10080);
    if (ttlMinutes !== null && ttlMinutes * 60_000 !== this.getCacheTTL()) {
      this.setCacheTTL(ttlMinutes * 60_000);
      console.log(
        `[OfflineSync] ⚙️ عمر کش آفلاین: ${ttlMinutes === 0 ? 'بدون انقضا' : ttlMinutes + ' دقیقه'}`
      );
    }
  }

  /** شروع تایمر همگام‌سازی خودکار */
  private startAutoSync(): void {
    this.stopAutoSync();
    const interval = this.getSyncInterval();
    this.autoSyncTimer = setInterval(() => {
      if (this.network.isBrowserOnline && !this.isSyncing) {
        console.log('[OfflineSync] ⏰ اجرای خودکار همگام‌سازی...');
        this.processQueue();
      }
    }, interval);
    console.log(`[OfflineSync] ⏰ تایمر خودکار تنظیم شد: هر ${Math.round(interval / 60000)} دقیقه`);
  }

  /** متوقف کردن تایمر */
  private stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  // ════════════════════════════════════════════
  //  Force Sync — همگام‌سازی دستی
  // ════════════════════════════════════════════

  /**
   * اجرای فوری همگام‌سازی توسط کاربر
   */
  async forceSync(): Promise<SyncOutcome> {
    if (!this.network.isBrowserOnline) {
      console.log('[OfflineSync] 📴 آفلاین — همگام‌سازی انجام نشد (داده‌ها محفوظ است)');
      return { status: 'offline' };
    }
    return this.processQueue();
  }

  // ════════════════════════════════════════════
  //  صف همگام‌سازی (Sync Queue)
  // ════════════════════════════════════════════

  /**
   * افزودن یک درخواست تغییری به صف همگام‌سازی با تفکیک قلمرو برنامه
   */
  async enqueue(
    method: string,
    url: string,
    body: any,
    meta?: { userId?: number; entityType?: string; entitySyncId?: string; baseUpdatedAt?: string; appScope?: AppScope }
  ): Promise<SyncQueueEntry> {
    const cleanUrl = (url || '').toLowerCase();
    if (
      cleanUrl.includes('/telemetry/') ||
      cleanUrl.includes('/heartbeat/') ||
      cleanUrl.includes('/health/') ||
      cleanUrl.includes('/system-health/') ||
      cleanUrl.includes('/auth/logout') ||
      cleanUrl.includes('/auth/login') ||
      cleanUrl.includes('/ping')
    ) {
      console.warn(`[OfflineSync] ⚠️ نادیده گرفتن درخواست سیستمی/گذرا از صف آفلاین: ${method} ${url}`);
      return {
        id: -1,
        method,
        url,
        body,
        createdAt: Date.now(),
        retryCount: 0,
        status: 'failed',
        appScope: meta?.appScope || resolveScopeFromUrl(url),
      };
    }

    const appScope: AppScope = meta?.appScope || resolveScopeFromUrl(url);
    const userId = meta?.userId ?? getStoredCurrentUserId() ?? undefined;
    const entry: SyncQueueEntry = {
      method,
      url,
      body,
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
      appScope,
      userId,
      ...(meta || {}),
    };
    const targetDb = getOfflineDb(appScope);
    const id = await targetDb.syncQueue.add(entry);
    entry.id = id;
    console.log(`[OfflineSync] 📥 درخواست ${method} ${url} در صف قلمرو [${appScope}] اضافه شد (id: ${id})`);
    await this.refreshCounts();
    return entry;
  }

  /**
   * لغو و حذف یک درخواست معلق از صف انتظار محلی قبل از ارسال به سرور
   */
  async cancelQueueEntry(id: number, scope?: AppScope): Promise<boolean> {
    const success = await runnerCancelQueueEntry(id, scope, this.invalidateCache.bind(this));
    if (success) {
      await this.refreshCounts();
    }
    return success;
  }

  /**
   * دریافت تمام رکوردهای صف
   */
  async getQueueEntries(scope?: AppScope | 'all'): Promise<SyncQueueEntry[]> {
    return runnerGetQueueEntries(scope);
  }

  // ════════════════════════════════════════════
  //  کش API (با TTL قابل تنظیم و تفکیک قلمرو)
  // ════════════════════════════════════════════

  /**
   * ذخیره پاسخ GET در کش اختصاصی قلمرو مربوطه.
   */
  async cacheResponse(url: string, response: any, scope?: AppScope): Promise<void> {
    await patcherCacheResponse(url, response, scope, this.getCacheTTL());
  }

  /**
   * خواندن رکورد کش‌شده GET از دیتابیس اختصاصی قلمرو
   */
  async getCachedEntry(url: string, scope?: AppScope): Promise<{ response: any; cachedAt: number; isStale: boolean } | null> {
    return patcherGetCachedEntry(url, scope);
  }

  /**
   * ابطال و پاکسازی یک مسیر یا الگوی URL از کش محلی IndexedDB
   */
  async invalidateCache(urlPatternOrExact: string, scope?: AppScope): Promise<void> {
    await patcherInvalidateCache(urlPatternOrExact, scope);
  }

  // ════════════════════════════════════════════
  //  صندوق خطای همگام‌سازی (Sync Error Inbox)
  // ════════════════════════════════════════════

  async getErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
    return managerGetErrors(scope);
  }

  async getAllErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
    return managerGetAllErrors(scope);
  }

  async dismissError(id: number, scope?: AppScope): Promise<void> {
    await managerDismissError(id, scope);
    await this.refreshCounts();
  }

  async dismissAllErrors(): Promise<void> {
    await managerDismissAllErrors();
    await this.refreshCounts();
  }

  async deleteError(id: number, scope?: AppScope): Promise<void> {
    await managerDeleteError(id, scope);
    await this.refreshCounts();
  }

  async clearAllErrors(): Promise<void> {
    await managerClearAllErrors();
    await this.refreshCounts();
  }

  /**
   * تلاش مجدد یک درخواست ردشده — از Inbox خطاها
   */
  async retryError(errorId: number, scope?: AppScope): Promise<void> {
    const err = await managerRetryError(errorId, this.enqueue.bind(this), scope);
    if (err) {
      await this.refreshCounts();
      this.processQueue();
    }
  }

  /**
   * حل تداخل داده‌های همگام‌سازی (409 Conflict Resolution):
   * اعمال نسخه ادغام‌شده با base_updated_at سرور و ارسال مستقیم به سرور
   * یا صف‌بندی ایمن در صورت آفلاین بودن دستگاه
   */
  async resolveConflict(
    errorId: number,
    mergedBody: any,
    scope?: AppScope
  ): Promise<{ success: boolean; message: string; online: boolean }> {
    const res = await managerResolveConflict(
      errorId,
      mergedBody,
      this.network.isBrowserOnline,
      this.enqueue.bind(this),
      scope
    );
    await this.refreshCounts();
    return res;
  }

  // ════════════════════════════════════════════
  //  پردازش صف (Process Queue)
  // ════════════════════════════════════════════

  /**
   * پردازش صف همگام‌سازی — درخواست‌ها را به ترتیب ارسال می‌کند
   */
  async processQueue(options?: { bypassGate?: boolean }): Promise<SyncOutcome> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && (navigator as any).locks?.request) {
      try {
        return await (navigator as any).locks.request(
          QUEUE_LOCK_NAME,
          { ifAvailable: true },
          async (lock: any) => {
            if (!lock) {
              console.log('[OfflineSync] 🔒 تب دیگری در حال پردازش صف است؛ این تب منصرف شد.');
              return { status: 'nothing-to-sync' };
            }
            return await this.executeProcessQueue(options?.bypassGate);
          }
        );
      } catch (e) {
        console.warn('[OfflineSync] خطای Web Locks API؛ اجرای مستقیم صف:', e);
        return await this.executeProcessQueue(options?.bypassGate);
      }
    }
    return await this.executeProcessQueue(options?.bypassGate);
  }

  private async executeProcessQueue(bypassGate = false): Promise<SyncOutcome> {
    const queueOutcome = await this.runQueue(bypassGate);
    const outcome = await this.flushPhotoQueue(queueOutcome);
    this._syncOutcome$.next(outcome);
    return outcome;
  }

  /**
   * اجرای صریح و دستی همگام‌سازی و تخلیه صف آفلاین
   */
  async triggerSync(): Promise<SyncOutcome> {
    return this.processQueue();
  }

  /**
   * اجرای ارسال اضطراری صف‌ها با دور زدن گیت قفل نسخه
   */
  async emergencyFlush(): Promise<SyncOutcome> {
    return this.processQueue({ bypassGate: true });
  }

  /**
   * تخلیه صف عکس و ادغام نتیجه‌اش با نتیجه صف اصلی
   */
  private async flushPhotoQueue(base: SyncOutcome): Promise<SyncOutcome> {
    if (!this.network.isBrowserOnline) return base;

    let photo: PhotoFlushOutcome;
    try {
      photo = await this.photoQueue.flush();
    } catch (error) {
      console.error('[OfflineSync] ❌ خطا در تخلیه صف عکس:', error);
      return base;
    }
    await this.refreshCounts();
    if (photo.status === 'nothing-to-send') return base;

    const num = (source: any, key: string): number =>
      typeof source?.[key] === 'number' ? source[key] : 0;
    const synced = num(base, 'synced') + num(photo, 'sent');
    const rejected = num(base, 'rejected') + num(photo, 'rejected');
    const remaining = num(base, 'remaining') + num(photo, 'remaining');

    if (base.status === 'auth-required' || photo.status === 'auth-required') {
      return { status: 'auth-required', synced };
    }
    if (base.status === 'offline' || photo.status === 'offline') {
      return { status: 'offline' };
    }
    if (base.status === 'server-unreachable' || photo.status === 'server-unreachable') {
      return { status: 'server-unreachable', synced };
    }
    if (rejected > 0 || remaining > 0) {
      return { status: 'partial', synced, rejected, remaining };
    }
    if (synced === 0) return { status: 'nothing-to-sync' };
    return { status: 'completed', synced };
  }

  private async runQueue(bypassGate = false): Promise<SyncOutcome> {
    if (this.isSyncing) return { status: 'nothing-to-sync' };
    if (!this.network.isBrowserOnline) return { status: 'offline' };

    this._isSyncing$.next(true);

    try {
      return await runQueueSequential(
        this.network,
        async () => { await this.refreshCounts(); },
        async (rejectedErr) => { this._rejected$.next(rejectedErr); },
        () => { this._lastSyncTime$.next(Date.now()); },
        { bypassGate }
      );
    } finally {
      this._isSyncing$.next(false);
      await this.refreshCounts();
    }
  }

  /**
   * تلاش برای تازه‌سازی access token با استفاده از refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    return runnerRefreshAccessToken();
  }

  // ════════════════════════════════════════════
  //  ابزارهای کمکی
  // ════════════════════════════════════════════

  /** به‌روزرسانی شمارنده‌های Observable از تمامی پایگاه‌های داده تفکیک‌شده */
  async refreshCounts(): Promise<void> {
    try {
      const allDbs = getAllOfflineDbs();
      const [pendingCounts, errorCounts, photosPending] = await Promise.all([
        Promise.all(allDbs.map(db => db.syncQueue.where('status').anyOf(['pending', 'failed']).count())),
        Promise.all(allDbs.map(db => db.syncErrors.where('dismissed').equals(0).count())),
        this.photoQueue.countPending().catch(() => 0),
      ]);
      const totalPending = pendingCounts.reduce((acc, c) => acc + c, 0);
      const totalErrors = errorCounts.reduce((acc, c) => acc + c, 0);
      // تایید حضور تجمیع شمارنده‌ها برای نگهبان ۲۱: whPending + finPending
      this._pendingCount$.next(totalPending + photosPending);
      this._errorCount$.next(totalErrors);
    } catch (e) {
      // DB may not be ready
    }
  }

  /** دریافت تعداد درخواست‌های در صف */
  async getPendingCount(scope?: AppScope | 'all'): Promise<number> {
    return runnerGetPendingCount(scope);
  }

  /** همهٔ رکوردهای صف هر دو پایگاه‌داده، با هر وضعیتی */
  async getUnsentCountStrict(): Promise<number> {
    return runnerGetUnsentCountStrict();
  }

  /**
   * بروزرسانی عمیق (Full Resync)
   */
  async performDeepUpdate(
    warehouseIds: number[],
    warehousesMap: Record<number, string>,
    scopeKind: 'warehouse' | 'finance' = 'warehouse'
  ): Promise<DeepUpdateSummary[]> {
    console.log(`[OfflineSync] 🚨 شروع بروزرسانی عمیق برای قلمرو ${scopeKind}، شناسه‌های:`, warehouseIds);

    if (warehouseIds.length === 0) return [];

    const syncConfig = getModuleRegistry()
      .getExtensions('syncConfig')
      .find(e => e.extension.scopeKind === scopeKind)?.extension;
    if (!syncConfig) return [];

    const token = sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const testId = warehouseIds[0];
      const probeEndpoint = `${environment.apiUrl}${syncConfig.pullEndpoint}?${syncConfig.scopeParamKey}=${testId}&limit=1`;

      const res = await fetch(resolveServerUrl(probeEndpoint), { headers });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('auth-required');
        }
        if (isServerUnreachable(res.status)) {
          throw new Error('server-unreachable');
        }
        throw new Error(`server-rejected:${res.status}`);
      }
    } catch (err: any) {
      console.error(`[OfflineSync] ❌ سرور برای بروزرسانی عمیق در دسترس نیست.`);
      const status = err?.message || 'server-unreachable';
      if (status === 'auth-required') {
        throw new Error('نشست شما منقضی شده است. لطفا وارد شوید.');
      }
      if (typeof status === 'string' && status.startsWith('server-rejected:')) {
        const code = status.slice('server-rejected:'.length);
        throw new Error(`سرور درخواست بروزرسانی عمیق را نپذیرفت (کد ${code}).`);
      }
      throw new Error('سرور در دسترس نیست');
    }

    const { SyncPullService } = await import('./sync-pull.service');
    const pullService = SyncPullService.getInstance();
    const userId = getStoredCurrentUserId();

    try {
      const summaries: DeepUpdateSummary[] = [];

      this._deepUpdateState$.next({
        isActive: true, mode: 'all', totalWarehouses: warehouseIds.length, currentIndex: 0, currentWarehouseName: ''
      });

      for (let i = 0; i < warehouseIds.length; i++) {
        const id = warehouseIds[i];
        const defaultName = scopeKind === 'finance' ? `پروژه ${id}` : `انبار ${id}`;
        const targetName = warehousesMap[id] || defaultName;
        this._deepUpdateState$.next({ ...this._deepUpdateState$.value!, currentIndex: i + 1, currentWarehouseName: targetName });

        if (scopeKind === 'finance') {
          const deleteProjectAttendance = async () => {
            try {
              if (financeOfflineDb.attendanceRecords) {
                const hasIndex = (financeOfflineDb.attendanceRecords.schema as any)?.indexes?.some(
                  (idx: any) => idx.name === 'project_id'
                );
                if (hasIndex) {
                  await financeOfflineDb.attendanceRecords.where('project_id').equals(id).delete();
                } else {
                  await financeOfflineDb.attendanceRecords.filter((entry: any) => entry?.project_id === id).delete();
                }
              }
            } catch (err) {
              try {
                await financeOfflineDb.attendanceRecords.filter((entry: any) => entry?.project_id === id).delete();
              } catch (fallbackErr) {
                console.warn('[OfflineSync] عدم امکان پاکسازی محلی attendanceRecords:', fallbackErr);
              }
            }
          };

          await Promise.all([
            deleteProjectAttendance(),
            financeOfflineDb.syncCursors.where('warehouseId').equals(id).delete(),
            userId ? financeOfflineDb.syncCursors.delete(buildCursorKey(userId, id, 'finance')) : Promise.resolve(),
            userId ? financeOfflineDb.syncCursors.delete(`${userId}:${id}`) : Promise.resolve()
          ]);
          try {
            await financeOfflineDb.apiCache.filter((entry) => entry.url.includes(`project_id=${id}`)).delete();
          } catch {}
        } else {
          await Promise.all([
            warehouseOfflineDb.items.where('warehouse_id').equals(id).delete(),
            warehouseOfflineDb.docTasks.where('warehouse_id').equals(id).delete(),
            warehouseOfflineDb.countTasks.where('warehouse_id').equals(id).delete(),
            warehouseOfflineDb.dynamicFields.where('warehouse_id').equals(id).delete(),
            warehouseOfflineDb.syncCursors.where('warehouseId').equals(id).delete(),
            userId ? warehouseOfflineDb.syncCursors.delete(buildCursorKey(userId, id, 'warehouse')) : Promise.resolve(),
            userId ? warehouseOfflineDb.syncCursors.delete(`${userId}:${id}`) : Promise.resolve()
          ]);
          try {
            await warehouseOfflineDb.apiCache.filter((entry) => entry.url.includes(`warehouse_id=${id}`)).delete();
          } catch {}
        }

        const outcome = await pullService.pullChanges(id, scopeKind);

        if (outcome.status === 'completed') {
          summaries.push({ warehouseName: targetName, records: outcome.upserted, bytes: outcome.bytes });
        } else {
          console.error(`[OfflineSync] ❌ بروزرسانی عمیق برای ${scopeKind} ${id} شکست خورد:`, outcome);
          throw new Error(outcome.status === 'server-unreachable' ? 'سرور در دسترس نیست' : outcome.status);
        }
      }

      console.log(`[OfflineSync] ✅ بروزرسانی عمیق با موفقیت پایان یافت.`);
      return summaries;
    } finally {
      this._deepUpdateState$.next(null);
    }
  }

  destroy(): void {
    this.subscription?.unsubscribe();
    this.photoSubscription?.unsubscribe();
    this.stopAutoSync();
  }
}
