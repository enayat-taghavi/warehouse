import { Injectable } from '@angular/core';
import {
  offlineDb,
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  resolveScopeFromUrl,
  getCurrentActiveAppScope,
  migrateLegacyDatabaseIfNeeded,
  AppScope,
  OfflineDatabase,
  SyncQueueEntry,
  SyncErrorEntry,
} from './offline-db';
import { SyncPullService, getStoredCurrentUserId, buildCursorKey } from './sync-pull.service';
import { NetworkStatusService } from './network-status.service';
import { PhotoUploadQueueService, PhotoFlushOutcome } from './photo-upload-queue.service';
import { isServerUnreachable } from './server-reachability';
import { BehaviorSubject, Subject, Subscription, filter } from 'rxjs';
import { environment } from '../../../environments/environment';

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
type EntryResult = 'sent' | 'rejected' | 'auth-failed' | 'server-error' | 'transport-failed';

/**
 * OfflineSyncService — سرویس پیشرفته همگام‌سازی آفلاین
 *
 * وظایف:
 * 1. درخواست‌های تغییری (POST/PATCH/PUT/DELETE) را در صف ذخیره می‌کند
 * 2. پاسخ‌های GET را در کش ذخیره می‌کند (با TTL قابل تنظیم)
 * 3. به محض آنلاین شدن، صف را پردازش می‌کند
 * 4. همگام‌سازی خودکار با اینتروال قابل تنظیم
 * 5. همگام‌سازی دستی (forceSync)
 * 6. انتقال خطاهای 4xx به صندوق خطا (syncErrors)
 */

export interface DeepUpdateSummary {
  warehouseName: string;
  records: number;
  bytes: number;
}

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

  /** حداکثر تعداد تلاش مجدد برای هر درخواست */
  private readonly MAX_RETRIES = 3;

  /** مدت زمان پیش‌فرض اعتبار کش (۱ ساعت) */
  private readonly DEFAULT_CACHE_TTL = 60 * 60 * 1000;

  /** فاصله پیش‌فرض همگام‌سازی خودکار (۱۵ دقیقه) */
  private readonly DEFAULT_SYNC_INTERVAL = 15 * 60 * 1000;

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
   * نتیجه هر دور پردازش صف — شامل دورهای خودکار (پس از بازگشت اتصال) که
   * کاربر دکمه‌ای نزده و بدون این جریان هیچ بازخوردی نمی‌گرفت.
   */
  private _syncOutcome$ = new Subject<SyncOutcome>();
  readonly syncOutcome$ = this._syncOutcome$.asObservable();

  private _deepUpdateState$ = new BehaviorSubject<{
    isActive: boolean;
    mode: 'current' | 'all';
    totalWarehouses: number;
    currentIndex: number;
    currentWarehouseName: string;
  } | null>(null);
  readonly deepUpdateState$ = this._deepUpdateState$.asObservable();

  /**
   * رد صریح سرور (4xx/409) — storeهای دامنه برای reconciliation گوش می‌دهند:
   * رکورد محلی خوش‌بینانه باید به آخرین نسخهٔ سروری برگردد.
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

    // رکوردهای گیرکرده در وضعیت sending در هر دو پایگاه‌داده تفکیک‌شده را آزاد کن
    warehouseOfflineDb.syncQueue
      .where('status')
      .equals('sending')
      .modify({ status: 'pending' })
      .catch(() => {});

    financeOfflineDb.syncQueue
      .where('status')
      .equals('sending')
      .modify({ status: 'pending' })
      .catch(() => {});

    // همین کار برای صف عکس — عکس نیمه‌ارسال‌شده باید دوباره در نوبت بیفتد
    this.photoQueue.initialize().catch(() => {});

    // شمارنده در انتظار، مجموع دو صف است؛ وگرنه بَج «۰» نشان می‌داد در حالی که
    // عکس کاربر هنوز ارسال نشده بود.
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
          console.log(`[OfflineSync] 🧹 ${toDelete.length} رکورد غیرمجاز پالس/تله‌متری از صف آفلاین پاکسازی شد.`);
        }
      }
      await this.refreshCounts();
    } catch (err) {
      console.warn('[OfflineSync] خطا در پاکسازی رکوردهای گذرا از صف:', err);
    }
  }

  /**
   * حذف رکوردهای دامنهٔ محلی قدیمی‌تر از ۶ ماه (updated_at) که هیچ تغییر
   * ارسال‌نشده‌ای در صف ندارند. صف و صندوق خطا هرگز prune نمی‌شوند.
   */
  private async pruneOldLocalData(): Promise<void> {
    const PRUNE_KEY = 'wh_last_prune';
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const last = parseInt(localStorage.getItem(PRUNE_KEY) || '0', 10);
    if (Date.now() - last < ONE_DAY) return;
    localStorage.setItem(PRUNE_KEY, String(Date.now()));

    const cutoffIso = new Date(Date.now() - 180 * ONE_DAY).toISOString();
    // خواندن صف هر دو قلمرو تا هیچ رکورد معلقی چه در انبار و چه در مالی هرگز پاک نشود (تسک ۲)
    const [whPending, finPending] = await Promise.all([
      warehouseOfflineDb.syncQueue.toArray(),
      financeOfflineDb.syncQueue.toArray(),
    ]);
    const pendingEntries = [...whPending, ...finPending];
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
  }

  // ════════════════════════════════════════════
  //  TTL — مدت اعتبار کش (قابل تنظیم)
  // ════════════════════════════════════════════

  /** خواندن TTL از localStorage یا مقدار پیش‌فرض (صفر = بدون انقضا) */
  getCacheTTL(): number {
    const stored = localStorage.getItem('wh_cache_ttl');
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 0) return val;
    }
    return this.DEFAULT_CACHE_TTL;
  }

  /** تنظیم TTL (به میلی‌ثانیه) */
  setCacheTTL(ttlMs: number): void {
    localStorage.setItem('wh_cache_ttl', String(ttlMs));
  }

  // ════════════════════════════════════════════
  //  Auto Sync — همگام‌سازی خودکار
  // ════════════════════════════════════════════

  /** خواندن فاصله زمانی اتوسینک از localStorage یا مقدار پیش‌فرض */
  getSyncInterval(): number {
    const stored = localStorage.getItem('wh_sync_interval');
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return this.DEFAULT_SYNC_INTERVAL;
  }

  /** تنظیم فاصله زمانی همگام‌سازی خودکار (به میلی‌ثانیه) و ری‌استارت تایمر */
  setSyncInterval(intervalMs: number): void {
    localStorage.setItem('wh_sync_interval', String(intervalMs));
    this.stopAutoSync();
    this.startAutoSync();
  }

  /**
   * اعمال تنظیمات ادمین از public config.
   * عمداً مسدودکننده نیست: بوت آفلاین این endpoint را نمی‌گیرد و localStorage
   * آخرین مقدار شناخته‌شده را نگه می‌دارد.
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

    // صفر = «هیچ‌وقت کهنه نشود»، پس کف بازه صفر است نه یک
    const ttlMinutes = clamp(cfg.offline_cache_ttl_minutes, 0, 10080);
    if (ttlMinutes !== null && ttlMinutes * 60_000 !== this.getCacheTTL()) {
      // فقط روی نوشتن‌های آینده اثر دارد؛ expiresAt لحظه نوشتن مهر می‌شود.
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
   * اجرای فوری همگام‌سازی — توسط کاربر (از دکمه UI) فراخوانی می‌شود
   *
   * بررسی پیش‌پرواز: اگر مرورگر آفلاین باشد، هیچ تلاشی انجام نمی‌شود و
   * نتیجه «offline» برمی‌گردد — این «شکست» نیست، فقط «هنوز نه».
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
   * @param meta متادیتای Local-First: مالک، نوع/شناسه موجودیت، نسخهٔ مبنا (409) و قلمرو
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
  async cancelQueueEntry(id: number, scope?: AppScope): Promise<void> {
    let entry: SyncQueueEntry | undefined;
    if (scope) {
      const targetDb = getOfflineDb(scope);
      entry = await targetDb.syncQueue.get(id);
      if (entry) await targetDb.syncQueue.delete(id);
    } else {
      entry = await warehouseOfflineDb.syncQueue.get(id);
      if (entry) {
        await warehouseOfflineDb.syncQueue.delete(id);
      } else {
        entry = await financeOfflineDb.syncQueue.get(id);
        if (entry) await financeOfflineDb.syncQueue.delete(id);
      }
    }
    if (entry?.url) {
      await this.invalidateCache(entry.url, entry.appScope);
    }
    await this.refreshCounts();
    console.log(`[OfflineSync] 🗑️ درخواست با شناسه ${id} از صف انتظار محلی لغو و حذف شد.`);
  }

  /**
   * دریافت تمام رکوردهای صف (با تفکیک قلمرو یا ادغام سراسری برای نمایش به کاربر)
   */
  async getQueueEntries(scope?: AppScope | 'all'): Promise<SyncQueueEntry[]> {
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

  // ════════════════════════════════════════════
  //  کش API (با TTL قابل تنظیم و تفکیک قلمرو)
  // ════════════════════════════════════════════

  /**
   * ذخیره پاسخ GET در کش اختصاصی قلمرو مربوطه.
   */
  async cacheResponse(url: string, response: any, scope?: AppScope): Promise<void> {
    if (response === null || response === undefined) return;

    const appScope = scope || resolveScopeFromUrl(url);
    const ttl = this.getCacheTTL();
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
  async getCachedEntry(url: string, scope?: AppScope): Promise<{ response: any; cachedAt: number; isStale: boolean } | null> {
    const appScope = scope || resolveScopeFromUrl(url);
    let entry = await getOfflineDb(appScope).apiCache.get(url);
    if (!entry) {
      // جستجو در قلمرو دیگر به عنوان پشتیبان در صورت اشتراک اندپوینت‌ها
      const otherScope: AppScope = appScope === 'warehouse' ? 'finance' : 'warehouse';
      entry = await getOfflineDb(otherScope).apiCache.get(url);
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
  async invalidateCache(urlPatternOrExact: string, scope?: AppScope): Promise<void> {
    try {
      const dbs = scope ? [getOfflineDb(scope)] : [warehouseOfflineDb, financeOfflineDb];
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

  // ════════════════════════════════════════════
  //  صندوق خطای همگام‌سازی (Sync Error Inbox)
  // ════════════════════════════════════════════

  /** دریافت تمام خطاهای خوانده‌نشده از پایگاه‌های داده تفکیک‌شده */
  async getErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
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

  /** دریافت تمام خطاها (حتی خوانده‌شده‌ها) */
  async getAllErrors(scope?: AppScope | 'all'): Promise<SyncErrorEntry[]> {
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

  /** حذف (Dismiss) یک خطا از دیتابیس مربوطه */
  async dismissError(id: number): Promise<void> {
    const whErr = await warehouseOfflineDb.syncErrors.get(id);
    if (whErr) {
      await warehouseOfflineDb.syncErrors.update(id, { dismissed: 1 });
    } else {
      await financeOfflineDb.syncErrors.update(id, { dismissed: 1 });
    }
    await this.refreshCounts();
  }

  /** حذف تمام خطاها از هر دو دیتابیس */
  async dismissAllErrors(): Promise<void> {
    await Promise.all([
      warehouseOfflineDb.syncErrors.toCollection().modify({ dismissed: 1 }),
      financeOfflineDb.syncErrors.toCollection().modify({ dismissed: 1 }),
    ]);
    await this.refreshCounts();
  }

  /** حذف دائمی یک خطا از دیتابیس */
  async deleteError(id: number): Promise<void> {
    const whErr = await warehouseOfflineDb.syncErrors.get(id);
    if (whErr) {
      await warehouseOfflineDb.syncErrors.delete(id);
    } else {
      await financeOfflineDb.syncErrors.delete(id);
    }
    await this.refreshCounts();
  }

  /** حذف دائمی تمام خطاها از هر دو دیتابیس */
  async clearAllErrors(): Promise<void> {
    await Promise.all([
      warehouseOfflineDb.syncErrors.clear(),
      financeOfflineDb.syncErrors.clear(),
    ]);
    await this.refreshCounts();
  }

  /**
   * تلاش مجدد یک درخواست ردشده — از Inbox خطاها.
   * رکورد به صف برمی‌گردد (با متادیتای اصلی و قلمرو) و صف بلافاصله پردازش می‌شود.
   */
  async retryError(errorId: number): Promise<void> {
    let err = await warehouseOfflineDb.syncErrors.get(errorId);
    let db = warehouseOfflineDb;
    if (!err) {
      err = await financeOfflineDb.syncErrors.get(errorId);
      db = financeOfflineDb;
    }
    if (!err) return;

    await this.enqueue(err.method, err.url, err.body, {
      userId: err.userId,
      entityType: err.entityType,
      entitySyncId: err.entitySyncId,
      appScope: err.appScope,
    });
    await db.syncErrors.delete(errorId);
    await this.refreshCounts();
    console.log(`[OfflineSync] 🔁 خطای ${errorId} به صف برگشت (${err.method} ${err.url})`);
    this.processQueue();
  }

  /**
   * حل تداخل داده‌های همگام‌سازی (409 Conflict Resolution):
   * اعمال نسخه ادغام‌شده با base_updated_at سرور و ارسال مستقیم به سرور
   * یا صف‌بندی ایمن در صورت آفلاین بودن دستگاه
   */
  async resolveConflict(
    errorId: number,
    mergedBody: any
  ): Promise<{ success: boolean; message: string; online: boolean }> {
    let err = await warehouseOfflineDb.syncErrors.get(errorId);
    let db = warehouseOfflineDb;
    if (!err) {
      err = await financeOfflineDb.syncErrors.get(errorId);
      db = financeOfflineDb;
    }
    if (!err) {
      return { success: false, message: 'رکورد تداخل یافت نشد.', online: this.network.isBrowserOnline };
    }

    const appScope: AppScope = err.appScope || resolveScopeFromUrl(err.url);
    const serverRecord = err.serverResponse?.server_record;
    const finalPayload = {
      ...mergedBody,
      base_updated_at: serverRecord?.updated_at || new Date().toISOString(),
    };

    // اگر آنلاین است، تلاش برای ارسال مستقیم به سرور
    if (this.network.isBrowserOnline) {
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

        const res = await fetch(err.url, {
          method: err.method || 'PATCH',
          headers,
          body: JSON.stringify(finalPayload),
        });

        if (res.ok) {
          await db.syncErrors.delete(errorId);
          if (err.url) await this.invalidateCache(err.url.split('?')[0], appScope);
          await this.refreshCounts();
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
          await this.refreshCounts();
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
    await this.enqueue(err.method, err.url, finalPayload, {
      userId: err.userId,
      entityType: err.entityType,
      entitySyncId: err.entitySyncId,
      appScope,
      baseUpdatedAt: finalPayload.base_updated_at,
    });
    await db.syncErrors.delete(errorId);
    await this.refreshCounts();
    return {
      success: true,
      message: 'رکورد ادغام‌شده در صف آفلاین ذخیره شد و به محض برقراری اتصال ارسال خواهد شد.',
      online: false,
    };
  }

  /**
   * Reconciliation پس از رد صریح سرور (اصلاح ۵ طرح):
   * دادهٔ خوش‌بینانهٔ محلی نباید طوری بماند که انگار پذیرفته شده.
   * اگر سرور نسخهٔ خودش را داده (server_record در 409) همان جایگزین می‌شود؛
   * وگرنه فقط پرچم pending پاک می‌شود و نسخهٔ تازه با Pull بعدی می‌رسد.
   */
  private async reconcileRejected(err: SyncErrorEntry): Promise<void> {
    // ۱. ابطال کش متناظر در apiCache برای دریافت نسخه تازه از سرور
    if (err.url) {
      const baseUrl = err.url.split('?')[0];
      await this.invalidateCache(baseUrl, err.appScope);
    }

    if (err.entityType === 'count_task_bulk') {
      try {
        const db = getOfflineDb('warehouse');
        await db.countTasks.where('status').equals('SENDING').modify({ status: 'PENDING_COUNT' });
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
    const db = getOfflineDb(err.appScope);
    const table = (db as any)[tableName] || (warehouseOfflineDb as any)[tableName] || (offlineDb as any)[tableName];

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

  // ════════════════════════════════════════════
  //  پردازش صف (Process Queue)
  // ════════════════════════════════════════════

  /**
   * پردازش صف همگام‌سازی — درخواست‌ها را به ترتیب ارسال می‌کند
   *
   * قوانین حذف از صف (صف = کار ناتمام کاربر و مقدس است):
   * • فقط وقتی حذف می‌شود که سرور صریحاً بپذیرد (۲xx) یا صریحاً رد کند (۴xx)
   * • خطای شبکه یا ۵xx هرگز باعث از دست رفتن داده نمی‌شود
   */
  async processQueue(): Promise<SyncOutcome> {
    // قفل هماهنگ‌سازی میان تب‌های باز مرورگر (تسک ۱۶: Web Locks API)
    if (typeof navigator !== 'undefined' && 'locks' in navigator && (navigator as any).locks?.request) {
      try {
        return await (navigator as any).locks.request(
          'wh_offline_sync_queue_lock',
          { ifAvailable: true },
          async (lock: any) => {
            if (!lock) {
              console.log('[OfflineSync] 🔒 تب دیگری در حال پردازش صف است؛ این تب منصرف شد.');
              return { status: 'nothing-to-sync' };
            }
            return await this.executeProcessQueue();
          }
        );
      } catch (e) {
        console.warn('[OfflineSync] خطای Web Locks API؛ اجرای مستقیم صف:', e);
        return await this.executeProcessQueue();
      }
    }
    return await this.executeProcessQueue();
  }

  private async executeProcessQueue(): Promise<SyncOutcome> {
    const queueOutcome = await this.runQueue();
    // صف عکس *بعد* از صف JSON تخلیه می‌شود: اگر توکن منقضی بوده باشد تا اینجا
    // یک بار تازه شده و آپلود عکس با توکن معتبر انجام می‌شود.
    const outcome = await this.flushPhotoQueue(queueOutcome);
    this._syncOutcome$.next(outcome);
    return outcome;
  }

  /**
   * اجرای صریح و دستی همگام‌سازی و تخلیه صف آفلاین (Trigger Sync)
   */
  async triggerSync(): Promise<SyncOutcome> {
    return this.processQueue();
  }

  /**
   * تخلیه صف عکس و ادغام نتیجه‌اش با نتیجه صف اصلی.
   *
   * ادغام لازم است چون بدون آن، وقتی صف JSON خالی بود ولی عکسی گیر کرده،
   * پیام «همه‌چیز همگام شد» به کاربر نشان داده می‌شد.
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

  private async runQueue(): Promise<SyncOutcome> {
    if (this.isSyncing) return { status: 'nothing-to-sync' };

    // بررسی پیش‌پرواز — آفلاین یعنی «تلاشی انجام نشد»، نه «شکست خورد»
    if (!this.network.isBrowserOnline) return { status: 'offline' };

    this._isSyncing$.next(true);
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
      while (drainPass < MAX_DRAIN_PASSES && !transportAborted && !authRequired && this.network.isBrowserOnline) {
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
            this._lastSyncTime$.next(Date.now());
          }
          break;
        }

        // اولویت‌بندی هوشمند صف (تسک ۱): رکوردهای تازه اولویت بالاتر از رکوردهای مکرراً شکست‌خورده دارند
        queueJobs.sort((a, b) => {
          const aExceeded = (a.entry.retryCount || 0) >= this.MAX_RETRIES ? 1 : 0;
          const bExceeded = (b.entry.retryCount || 0) >= this.MAX_RETRIES ? 1 : 0;
          if (aExceeded !== bExceeded) return aExceeded - bExceeded;
          return a.entry.createdAt - b.entry.createdAt;
        });

        console.log(
          `[OfflineSync] 📋 دور ${drainPass}: ${queueJobs.length} درخواست در صف‌های تفکیک‌شده (${currentEntries.length} در ${currentScope}، ${otherEntries.length} در ${otherScope})`
        );

        let passProcessed = 0;

        for (const { entry, db } of queueJobs) {
          if (!this.network.isBrowserOnline) {
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

          const result = await this.sendEntry(entry, db);
          await this.refreshCounts();
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
            if (entry.retryCount >= this.MAX_RETRIES) {
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

        const remainingCount = await this.getPendingCount();
        if (remainingCount === 0) {
          break;
        }
      }

      // زمان آخرین همگام‌سازی فقط وقتی معنا دارد که واقعاً با سرور حرف زده باشیم
      if (!transportAborted && synced > 0) {
        this._lastSyncTime$.next(Date.now());
      }
    } catch (error) {
      console.error('[OfflineSync] ❌ خطا در پردازش صف:', error);
    } finally {
      this._isSyncing$.next(false);
      await this.refreshCounts();
    }

    // ─── تعیین نتیجه ───
    if (!this.network.isBrowserOnline) return { status: 'offline' };
    if (authRequired) return { status: 'auth-required', synced };
    if (transportAborted) return { status: 'server-unreachable', synced };

    const remaining = await this.getPendingCount();
    if (rejected > 0 || remaining > 0) {
      return { status: 'partial', synced, rejected, remaining };
    }
    if (synced === 0) return { status: 'nothing-to-sync' };
    return { status: 'completed', synced };
  }

  /**
   * ارسال یک درخواست از صف تفکیک‌شده به سرور با هدرها و توکن متناسب قلمرو
   * @returns نتیجه دقیق ارسال (نگاه کنید به EntryResult)
   */
  private async sendEntry(
    entry: SyncQueueEntry,
    targetDb?: OfflineDatabase,
    hasRetriedAuth = false
  ): Promise<EntryResult> {
    if (!entry.id) return 'rejected';

    const appScope: AppScope = entry.appScope || resolveScopeFromUrl(entry.url);
    const db = targetDb || getOfflineDb(appScope);

    try {
      // علامت‌گذاری به عنوان در حال ارسال در دیتابیس اختصاصی قلمرو
      await db.syncQueue.update(entry.id, { status: 'sending' });

      // ساخت هدرهای تفکیک‌شده قلمرو و شناسه تب
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
        this.network.reportServerUnreachable();
      } else {
        this.network.reportServerReachable();
      }

      if (response.ok) {
        // موفقیت‌آمیز — حذف از صف اختصاصی
        await db.syncQueue.delete(entry.id);
        console.log(`[OfflineSync] ✅ ارسال موفق [${appScope}]: ${entry.method} ${entry.url}`);
        return 'sent';
      } else if (response.status === 401) {
        // توکن منقضی — تلاش برای refresh و ارسال مجدد (فقط یک بار)
        if (!hasRetriedAuth && (await this.refreshAccessToken())) {
          return this.sendEntry(entry, db, true);
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
        await this.handleRetry(entry, `خطای موقت سرور (${response.status}) — بعداً دوباره تلاش می‌شود`, db);
        return 'server-error';
      } else if (response.status >= 400 && response.status < 500) {
        // خطای کلاینت (4xx شامل 409) — انتقال به صندوق خطاها
        let serverMessage = `خطای ${response.status}`;
        let errorBody: any = null;
        try {
          errorBody = await response.json();
          if (errorBody.detail) {
            serverMessage =
              errorBody.detail === 'conflict'
                ? 'تداخل: این رکورد هم‌زمان توسط شخص دیگری تغییر کرده است'
                : errorBody.detail;
          } else if (typeof errorBody === 'object') {
            const firstField = Object.keys(errorBody)[0];
            const firstError = errorBody[firstField];
            serverMessage = Array.isArray(firstError)
              ? `${firstField}: ${firstError[0]}`
              : String(firstError);
          }
        } catch {
          /* ignore JSON parse error */
        }

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
        await this.reconcileRejected(syncError);
        this._rejected$.next(syncError);
        return 'rejected';
      } else {
        // خطای سرور (5xx)
        await this.handleRetry(entry, `خطای سرور (${response.status})`, db);
        return 'server-error';
      }
    } catch (error: any) {
      this.network.reportServerUnreachable();
      await this.markTransportFailure(entry, error?.message || 'اتصال برقرار نشد', db);
      return 'transport-failed';
    }
  }

  /**
   * تلاش برای تازه‌سازی access token با استفاده از refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
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
  private async handleRetry(
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
        newRetryCount >= this.MAX_RETRIES
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
  private async markTransportFailure(
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

  // ════════════════════════════════════════════
  //  ابزارهای کمکی
  // ════════════════════════════════════════════

  /** به‌روزرسانی شمارنده‌های Observable از هر دو پایگاه‌داده تفکیک‌شده */
  async refreshCounts(): Promise<void> {
    try {
      const [whPending, finPending, whErrors, finErrors, photosPending] = await Promise.all([
        warehouseOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count(),
        financeOfflineDb.syncQueue.where('status').anyOf(['pending', 'failed']).count(),
        warehouseOfflineDb.syncErrors.where('dismissed').equals(0).count(),
        financeOfflineDb.syncErrors.where('dismissed').equals(0).count(),
        this.photoQueue.countPending().catch(() => 0),
      ]);
      this._pendingCount$.next(whPending + finPending + photosPending);
      this._errorCount$.next(whErrors + finErrors);
    } catch (e) {
      // DB may not be ready
    }
  }

  /** دریافت تعداد درخواست‌های در صف */
  async getPendingCount(scope?: AppScope | 'all'): Promise<number> {
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

  /**
   * همهٔ رکوردهای صف هر دو پایگاه‌داده، با هر وضعیتی (از جمله sending که در getPendingCount نیست).
   * خطای خواندن IndexedDB به فراخوان می‌رسد تا «خطا» هرگز «صف خالی» تعبیر نشود.
   */
  async getUnsentCountStrict(): Promise<number> {
    const [wh, fin] = await Promise.all([
      warehouseOfflineDb.syncQueue.count(),
      financeOfflineDb.syncQueue.count(),
    ]);
    return wh + fin;
  }

  /** تخلیه کامل صف (برای حالت‌های اضطراری یا لغو کاربر) */
  async clearQueue(scope?: AppScope | 'all'): Promise<void> {
    const targetScope = scope || 'all';
    if (targetScope === 'warehouse' || targetScope === 'all') {
      await warehouseOfflineDb.syncQueue.clear();
    }
    if (targetScope === 'finance' || targetScope === 'all') {
      await financeOfflineDb.syncQueue.clear();
    }
    await this.refreshCounts();
  }

  /** 
   * بروزرسانی عمیق (Full Resync): 
   * پاک کردن کامل و اتمیک داده‌های محلی هر انبار/پروژه و دانلود مجدد داده‌های سرور
   */
  async performDeepUpdate(
    warehouseIds: number[],
    warehousesMap: Record<number, string>,
    scopeKind: 'warehouse' | 'finance' = 'warehouse'
  ): Promise<DeepUpdateSummary[]> {
    console.log(`[OfflineSync] 🚨 شروع بروزرسانی عمیق برای قلمرو ${scopeKind}، شناسه‌های:`, warehouseIds);
    
    if (warehouseIds.length === 0) return [];

    // ۱. گارد اطمینان از سلامت سرور پیش از پاکسازی داده‌ها متناسب با قلمرو فعال
    const token = sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
      const testId = warehouseIds[0];
      const probeEndpoint = scopeKind === 'finance'
        ? `${environment.apiUrl}/personnel/sync/pull/?project_id=${testId}&limit=1`
        : `${environment.apiUrl}/inventory/sync/pull/?warehouse_id=${testId}&limit=1`;

      const res = await fetch(probeEndpoint, { headers });
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'auth-required' : 'server-unreachable');
      }
    } catch (err: any) {
      console.error(`[OfflineSync] ❌ سرور برای بروزرسانی عمیق در دسترس نیست.`);
      const status = err.message || 'server-unreachable';
      throw new Error(status === 'auth-required' ? 'نشست شما منقضی شده است. لطفا وارد شوید.' : 'سرور در دسترس نیست');
    }

    // ۲. دریافت و دانلود مجدد داده‌ها به صورت اتمیک و مرحله‌ای (انبار به انبار / پروژه به پروژه)
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

        // پاکسازی اتمیک دقیقاً قبل از دانلود همان قلمرو جهت پیشگیری از نابودی کل داده‌ها در قطعی شبکه
        if (scopeKind === 'finance') {
          const deleteProjectAttendance = async () => {
            try {
              if (financeOfflineDb.attendanceRecords) {
                // اگر ایندکس در ساختار دیتابیس موجود باشد با ایندکس پاکسازی می‌شود
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
              // در صورت بروز هرگونه خطای اسکیما یا ایندکس، fallback به filter مانع قطع شدن بروزرسانی می‌شود
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
        
        // فراخوانی دانلود دلتا با مشخص کردن صریح نوع قلمرو
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
