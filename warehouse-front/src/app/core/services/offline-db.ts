import Dexie, { Table } from 'dexie';
import { saveBlob } from '../platform/file-output';
import { getModuleRegistry } from '../modules/module-registry.service';

/**
 * مدل صف همگام‌سازی — هر تغییر آفلاین یک رکورد در این صف ذخیره می‌شود
 */
export interface SyncQueueEntry {
  id?: number;
  /** متد HTTP: POST, PATCH, PUT, DELETE */
  method: string;
  /** مسیر API (endpoint) */
  url: string;
  /** بدنه درخواست */
  body: any;
  /** زمان ایجاد (Unix timestamp) */
  createdAt: number;
  /** تعداد دفعات تلاش ارسال */
  retryCount: number;
  /** وضعیت: pending, sending, failed */
  status: 'pending' | 'sending' | 'failed';
  /** پیام خطای آخرین تلاش */
  lastError?: string;
  // ─── فیلدهای Local-First (v3) — روی دستگاه مشترک صف هر کاربر جداست ───
  /** شناسه کاربر صاحب این تغییر */
  userId?: number;
  /** نوع موجودیت: count_task, item, ... (برای reconciliation) */
  entityType?: string;
  /** sync_id پایدار رکورد هدف (کلید idempotency و reconciliation) */
  entitySyncId?: string;
  /** updated_at نسخه‌ای که تغییر رویش اعمال شده (تشخیص تداخل 409) */
  baseUpdatedAt?: string;
  // ─── تفکیک قلمرو برنامه (Domain-Segregated Local Storage) ───
  /** قلمرو برنامه */
  appScope?: AppScope;
}

/**
 * مدل کش API — پاسخ‌های GET از سرور برای دسترسی آفلاین ذخیره می‌شوند
 */
export interface ApiCacheEntry {
  /** کلید یکتا: URL + params */
  url: string;
  /** بدنه پاسخ */
  response: any;
  /** زمان ذخیره‌سازی */
  cachedAt: number;
  /** زمان انقضا */
  expiresAt: number;
  /** قلمرو برنامه */
  appScope?: AppScope;
}

/**
 * مدل خطاهای همگام‌سازی — درخواست‌هایی که سرور با خطای 4xx رد کرده
 * این رکوردها برای بررسی کاربر در «صندوق خطای همگام‌سازی» نگه‌داری می‌شوند
 */
export interface SyncErrorEntry {
  id?: number;
  /** متد HTTP اصلی */
  method: string;
  /** مسیر API */
  url: string;
  /** بدنه درخواست اصلی */
  body: any;
  /** کد وضعیت HTTP (4xx) */
  statusCode: number;
  serverMessage: string;
  failedAt: number;
  dismissed: 0 | 1;
  // ─── فیلدهای Local-First (v3) ───
  userId?: number;
  entityType?: string;
  entitySyncId?: string;
  serverResponse?: any;
  /** قلمرو برنامه */
  appScope?: AppScope;
}

/**
 * مدل صف آپلود عکس — فایلی که کاربر گرفته تا لحظه رسیدن به سرور اینجا می‌ماند
 *
 * چرا جدا از syncQueue: آن صف بدنه را با `JSON.stringify` می‌فرستد و یک Blob در
 * آن مسیر به `{}` تبدیل می‌شود — یعنی عکسی که کاربر در انبار بی‌آنتن گرفته
 * بی‌صدا نابود می‌شد. IndexedDB خودش Blob را بدون تبدیل نگه می‌دارد، پس فایل
 * تا لحظه ارسال دست‌نخورده می‌ماند (حتی اگر مرورگر بسته و باز شود).
 */
export interface PhotoQueueEntry {
  id?: number;
  /** شناسه کالای مقصد */
  itemId: number;
  /** sync_id تولیدشده در کلاینت — کلید idempotency سرور (ارسال دوباره ⇒ رکورد تکراری نه) */
  syncId: string;
  /** فایل فشرده‌شده؛ همان بایت‌هایی که به سرور می‌رود */
  blob: Blob;
  /** نام فایل برای FormData */
  fileName: string;
  caption?: string;
  sourceType?: 'camera' | 'gallery';
  /** تسک شمارشی که عکس در جریان آن گرفته شده */
  countTaskId?: number;
  /** آیا این عکس باید شاخص کالا شود؟ */
  isPrimary?: boolean;
  width?: number;
  height?: number;
  /** روی دستگاه مشترک، صف هر کاربر جداست */
  userId?: number;
  createdAt: number;
  retryCount: number;
  /**
   * pending  → منتظر ارسال
   * sending  → در حال ارسال (با ری‌استارت برنامه به pending برمی‌گردد)
   * failed   → خطای موقت؛ همچنان در نوبت ارسال است
   * rejected → سرور صریحاً رد کرد؛ فایل نگه داشته می‌شود تا کاربر تصمیم بگیرد
   */
  status: 'pending' | 'sending' | 'failed' | 'rejected';
  lastError?: string;
}

/**
 * cursor و زمان آخرین Pull موفق — per (کاربر، انبار)
 * lastServerTime همیشه از server_time پاسخ سرور است، نه ساعت دستگاه (رفع Clock Skew).
 */
export interface SyncCursorEntry {
  /** کلید مرکب: `${userId}:${scopeKind}:${scopeId}` یا میراثی `${userId}:${warehouseId}` */
  key: string;
  userId: number;
  warehouseId: number;
  scopeKind?: string;
  /** cursor مات وسط یک دانلود نیمه‌تمام؛ null یعنی دانلود قبلی کامل شد */
  cursor: string | null;
  /** since که دانلود نیمه‌تمام با آن شروع شد (باید تا پایان همان بماند) */
  inFlightSince: string | null;
  /** server_time صفحه اول دانلود نیمه‌تمام — پس از اتمام، lastServerTime می‌شود */
  pendingServerTime: string | null;
  /** مبنای دلتای بعدی (ISO) — فقط از server_time سرور */
  lastServerTime: string | null;
}

/**
 * OfflineDatabase — دیتابیس IndexedDB برنامه با استفاده از Dexie.js
 * جداول:
 * 1. syncQueue: صف درخواست‌های آفلاین (POST/PATCH/PUT/DELETE)
 * 2. apiCache: کش پاسخ‌های GET برای خواندن آفلاین
 * 3. syncErrors: صندوق خطاهایی که سرور رد کرده (4xx)
 * 4. countTasks / items / dynamicFields: دادهٔ دامنه Local-First (منبع: Pull API)
 * 5. syncCursors: cursor و server_time آخرین Pull per (کاربر، انبار)
 * 6. photoQueue: عکس‌های گرفته‌شده که هنوز به سرور نرسیده‌اند (Blob خام)
 *
 * قاعده: هیچ جدولی هرگز Clear نمی‌شود مگر صف خالی باشد و کاربر صریحاً تأیید کند.
 */

export type AppScope = 'warehouse' | 'finance' | (string & {});

/**
 * فاز ۶ §۶.۹ (تسک ۶۰) — قفل مطلق نام دو دیتابیس فعلی IndexedDB
 * هرگز rename انجام نمی‌شود تا کش و صف کاربران به هیچ وجه از دست نرود.
 */
export const SCOPED_DB_NAMES: Record<string, string> = {
  warehouse: 'WarehouseOfflineDB_warehouse',
  finance: 'WarehouseOfflineDB_finance',
  accounting: 'WarehouseOfflineDB_finance',
  personnel: 'WarehouseOfflineDB_finance',
};

const WH_SCOPE: AppScope = 'warehouse';
const FIN_SCOPE: AppScope = 'finance';
const ACCT_SCOPE: AppScope = 'accounting';
const PERS_SCOPE: AppScope = 'personnel';

interface ValidOfflineSyncSpec {
  scopeKind: string;
  dbName: string;
  scopeAliases?: string[];
  queueUrlPatterns: string[];
  activePathPatterns: string[];
  appRoutePrefixes: string[];
}

const reportedInvalidExtensions = new WeakSet<object>();

function isValidOfflineSyncExtension(ext: any): boolean {
  if (!ext || typeof ext !== 'object') return false;
  const { scopeKind, dbName } = ext;
  if (typeof scopeKind !== 'string' || typeof dbName !== 'string') return false;
  if (!/^[a-z][a-z0-9_]*$/.test(scopeKind)) return false;

  const lockedDbForScope = SCOPED_DB_NAMES[scopeKind];
  if (lockedDbForScope) {
    const isPrimaryLockedScope = lockedDbForScope === `WarehouseOfflineDB_${scopeKind}`;
    if (!isPrimaryLockedScope) {
      return false;
    }
    return dbName === lockedDbForScope;
  }

  const lockedDbNames = new Set(Object.values(SCOPED_DB_NAMES));
  if (lockedDbNames.has(dbName)) {
    return false;
  }

  return dbName === `WarehouseOfflineDB_${scopeKind}`;
}

function validateOfflineSyncExtension(ext: any): boolean {
  const valid = isValidOfflineSyncExtension(ext);
  if (!valid) {
    if (ext && typeof ext === 'object') {
      if (!reportedInvalidExtensions.has(ext)) {
        reportedInvalidExtensions.add(ext);
        console.error('[OfflineDB] Invalid offlineSync extension ignored:', ext);
      }
    } else {
      console.error('[OfflineDB] Invalid offlineSync extension ignored:', ext);
    }
  }
  return valid;
}

function getOfflineSyncSpecs(): ValidOfflineSyncSpec[] {
  try {
    const modules = getModuleRegistry().getAllModules();
    const specs: ValidOfflineSyncSpec[] = [];
    for (const mod of modules) {
      const ext = mod.extensions?.offlineSync;
      if (!ext) continue;
      if (validateOfflineSyncExtension(ext)) {
        specs.push({
          scopeKind: ext.scopeKind,
          dbName: ext.dbName,
          scopeAliases: Array.isArray(ext.scopeAliases) ? ext.scopeAliases : [],
          queueUrlPatterns: Array.isArray(ext.queueUrlPatterns) ? ext.queueUrlPatterns : [],
          activePathPatterns: Array.isArray(ext.activePathPatterns) ? ext.activePathPatterns : [],
          appRoutePrefixes: Array.isArray(ext.appRoutePrefixes) ? ext.appRoutePrefixes : [],
        });
      }
    }
    return specs;
  } catch {
    return [];
  }
}

/**
 * دریافت نام قطعی دیتابیس بر اساس کد ماژول (با قفل نام دو دیتابیس فعلی)
 */
export function getScopedDbName(scope?: string | null): string {
  if (!scope) return SCOPED_DB_NAMES[WH_SCOPE];
  const s = scope.toLowerCase();
  if (s in SCOPED_DB_NAMES) {
    return SCOPED_DB_NAMES[s];
  }
  const norm = normalizeScope(s);
  if (norm !== WH_SCOPE) {
    return `WarehouseOfflineDB_${norm}`;
  }
  return SCOPED_DB_NAMES[WH_SCOPE];
}

/**
 * نرمال‌سازی نام قلمرو به یکی از دو قلمرو استاندارد یا ماژول‌های ثبت‌شده
 */
export function normalizeScope(scope?: string | null): AppScope {
  if (!scope) return WH_SCOPE;
  const s = scope.toLowerCase();
  if (s === WH_SCOPE) return WH_SCOPE;
  if (s === FIN_SCOPE || s === PERS_SCOPE || s === ACCT_SCOPE) return FIN_SCOPE;

  const specs = getOfflineSyncSpecs();
  for (const spec of specs) {
    if (spec.scopeKind in SCOPED_DB_NAMES) continue;
    if (spec.scopeKind.toLowerCase() === s) {
      return spec.scopeKind;
    }
    if (spec.scopeAliases && spec.scopeAliases.some(a => a.toLowerCase() === s)) {
      return spec.scopeKind;
    }
  }

  return WH_SCOPE;
}

/**
 * دریافت قلمرو فعال برنامه از روی سشن تب، URL یا حافظه محلی
 */
export function getCurrentActiveAppScope(): AppScope {
  if (typeof window === 'undefined') return WH_SCOPE;
  try {
    // ۱. اولویت سشن اختصاصی تب جاری
    const tabApp = sessionStorage.getItem('active_app_module') || sessionStorage.getItem('wh_active_app');
    if (tabApp) return normalizeScope(tabApp);

    // ۲. کانتکست آدرس مرورگر
    const path = window.location.pathname.toLowerCase();
    try {
      const specs = getOfflineSyncSpecs();
      for (const spec of specs) {
        if (spec.scopeKind === WH_SCOPE) continue;
        if (spec.activePathPatterns && spec.activePathPatterns.some(p => path.includes(p.toLowerCase()))) {
          return spec.scopeKind;
        }
      }
      const defaultSpec = specs.find(s => s.scopeKind === WH_SCOPE);
      if (defaultSpec && defaultSpec.activePathPatterns && defaultSpec.activePathPatterns.some(p => path.includes(p.toLowerCase()))) {
        return WH_SCOPE;
      }
    } catch {
      // در صورت خطای رجیستری، به حافظه محلی سقوط می‌کند
    }

    // ۳. حافظه سراسری محلی
    const globalApp = localStorage.getItem('active_app_module') || localStorage.getItem('wh_active_app');
    if (globalApp) return normalizeScope(globalApp);

    return WH_SCOPE;
  } catch {
    return WH_SCOPE;
  }
}

/**
 * رونوشت منطق قلمرویاب پیشین برای مهاجرت امن دیتابیس قدیمی
 */
function resolveLegacyScopeFromUrl(url?: string | null): AppScope {
  if (!url) return getCurrentActiveAppScope();
  const u = url.toLowerCase();
  if (
    u.includes('/personnel') ||
    u.includes('/payroll') ||
    u.includes('/finance') ||
    u.includes('/treasury') ||
    u.includes('/attendance') ||
    u.includes('/paya') ||
    u.includes('/slips') ||
    u.includes('/fiscal')
  ) {
    return FIN_SCOPE;
  }
  return WH_SCOPE;
}

/**
 * تشخیص هوشمند قلمرو از روی URL مسیر اندپوینت سرور بر اساس مشارکت‌های offlineSync ماژول‌ها
 */
export function resolveScopeFromUrl(url?: string | null): AppScope {
  if (!url) return getCurrentActiveAppScope();
  const u = url.toLowerCase();
  const specs = getOfflineSyncSpecs();
  for (const spec of specs) {
    if (spec.scopeKind === WH_SCOPE) continue;
    if (spec.queueUrlPatterns && spec.queueUrlPatterns.some(p => u.includes(p.toLowerCase()))) {
      return spec.scopeKind;
    }
  }
  return WH_SCOPE;
}

export class OfflineDatabase extends Dexie {
  syncQueue!: Table<SyncQueueEntry, number>;
  apiCache!: Table<ApiCacheEntry, string>;
  syncErrors!: Table<SyncErrorEntry, number>;
  countTasks!: Table<any, string>;
  items!: Table<any, string>;
  dynamicFields!: Table<any, string>;
  syncCursors!: Table<SyncCursorEntry, string>;
  docTasks!: Table<any, string>;
  photoQueue!: Table<PhotoQueueEntry, number>;
  attendanceRecords!: Table<any, string>;
  public readonly dbScope: AppScope;

  constructor(dbName: string = 'WarehouseOfflineDB_warehouse', scope: AppScope = 'warehouse') {
    super(dbName);
    this.dbScope = scope;

    if (scope === 'finance') {
      // ساختار دیتابیس قلمرو مالی و پرسنلی (Finance & Personnel DB)
      this.version(1).stores({
        syncQueue: '++id, status, createdAt, userId, entitySyncId, appScope',
        apiCache: 'url, expiresAt, appScope',
        syncErrors: '++id, failedAt, dismissed, userId, appScope',
        docTasks: 'sync_id, id, warehouse_id, status, updated_at',
        syncCursors: 'key, userId, warehouseId',
        attendanceRecords: 'id, project_id, sync_id, personnel_id, date, status, updated_at',
        countTasks: 'sync_id, id, warehouse_id, status, updated_at',
        items: 'sync_id, id, warehouse_id, fa_unic_code, updated_at',
        dynamicFields: 'sync_id, id, warehouse_id, updated_at',
        photoQueue: '++id, status, createdAt, userId, itemId, syncId',
      });

      // نسخه ۲ — ارتقای پایگاه داده‌های موجود برای اضافه شدن ایندکس project_id به attendanceRecords
      this.version(2).stores({
        attendanceRecords: 'id, project_id, sync_id, personnel_id, date, status, updated_at',
      });
    } else {
      // نسخه ۱ تا ۵ برای حفظ سازگاری کامل پایگاه داده انبارداری
      this.version(1).stores({
        syncQueue: '++id, status, createdAt',
        apiCache: 'url, expiresAt',
      });

      this.version(2).stores({
        syncQueue: '++id, status, createdAt',
        apiCache: 'url, expiresAt',
        syncErrors: '++id, failedAt, dismissed',
      });

      this.version(3).stores({
        syncQueue: '++id, status, createdAt, userId, entitySyncId',
        apiCache: 'url, expiresAt',
        syncErrors: '++id, failedAt, dismissed, userId',
        countTasks: 'sync_id, id, warehouse_id, status, updated_at',
        items: 'sync_id, id, warehouse_id, fa_unic_code, updated_at',
        dynamicFields: 'sync_id, id, warehouse_id, updated_at',
        syncCursors: 'key, userId, warehouseId',
      });

      this.version(4).stores({
        syncQueue: '++id, status, createdAt, userId, entitySyncId',
        apiCache: 'url, expiresAt',
        syncErrors: '++id, failedAt, dismissed, userId',
        countTasks: 'sync_id, id, warehouse_id, status, updated_at',
        items: 'sync_id, id, warehouse_id, fa_unic_code, updated_at',
        dynamicFields: 'sync_id, id, warehouse_id, updated_at',
        syncCursors: 'key, userId, warehouseId',
        docTasks: 'sync_id, id, warehouse_id, status, updated_at',
      });

      this.version(5).stores({
        syncQueue: '++id, status, createdAt, userId, entitySyncId',
        apiCache: 'url, expiresAt',
        syncErrors: '++id, failedAt, dismissed, userId',
        countTasks: 'sync_id, id, warehouse_id, status, updated_at',
        items: 'sync_id, id, warehouse_id, fa_unic_code, updated_at',
        dynamicFields: 'sync_id, id, warehouse_id, updated_at',
        syncCursors: 'key, userId, warehouseId',
        docTasks: 'sync_id, id, warehouse_id, status, updated_at',
        photoQueue: '++id, status, createdAt, userId, itemId, syncId',
      });

      // نسخه ۶ — تفکیک قلمرو با ایندکس appScope و پشتیبانی از attendanceRecords
      this.version(6).stores({
        syncQueue: '++id, status, createdAt, userId, entitySyncId, appScope',
        apiCache: 'url, expiresAt, appScope',
        syncErrors: '++id, failedAt, dismissed, userId, appScope',
        countTasks: 'sync_id, id, warehouse_id, status, updated_at',
        items: 'sync_id, id, warehouse_id, fa_unic_code, updated_at',
        dynamicFields: 'sync_id, id, warehouse_id, updated_at',
        syncCursors: 'key, userId, warehouseId',
        docTasks: 'sync_id, id, warehouse_id, status, updated_at',
        photoQueue: '++id, status, createdAt, userId, itemId, syncId',
        attendanceRecords: 'id, project_id, sync_id, personnel_id, date, status, updated_at',
      });

      // نسخه ۷ — ارتقای پایگاه داده انبارداری موجود برای اضافه شدن ایندکس project_id
      this.version(7).stores({
        attendanceRecords: 'id, project_id, sync_id, personnel_id, date, status, updated_at',
      });
    }
  }

  /**
   * پاک کردن جداول کش مشتق‌شده از سرور پس از بازیابی دیتابیس.
   * جداول صف (syncQueue, photoQueue, syncErrors) به هیچ عنوان پاک نمی‌شوند.
   */
  async clearServerDerivedCaches(): Promise<void> {
    const promises: Promise<any>[] = [this.apiCache.clear()];
    if (this.countTasks) promises.push(this.countTasks.clear());
    if (this.docTasks) promises.push(this.docTasks.clear());
    if (this.items) promises.push(this.items.clear());
    if (this.dynamicFields) promises.push(this.dynamicFields.clear());
    if (this.syncCursors) promises.push(this.syncCursors.clear());
    if (this.attendanceRecords) promises.push(this.attendanceRecords.clear());
    await Promise.all(promises);
  }
}

// ─── کارخانه و رجیستری نمونه‌های دیتابیس تفکیک‌شده ───
const dbInstances = new Map<string, OfflineDatabase>();

/**
 * دریافت یا ایجاد نمونه پایگاه‌داده متناسب با قلمرو درخواستی
 */
export function getOfflineDb(scope?: AppScope | 'personnel' | null): OfflineDatabase {
  const normScope = normalizeScope(scope || getCurrentActiveAppScope());
  const dbName = SCOPED_DB_NAMES[normScope] || getScopedDbName(normScope);
  if (!dbInstances.has(dbName)) {
    const db = new OfflineDatabase(dbName, normScope);
    dbInstances.set(dbName, db);
  }
  return dbInstances.get(dbName)!;
}

/** نمونه صریح دیتابیس آفلاین انبارداری */
export const warehouseOfflineDb: OfflineDatabase = getOfflineDb('warehouse');

/** نمونه صریح دیتابیس آفلاین مالی و پرسنلی */
export const financeOfflineDb: OfflineDatabase = getOfflineDb('finance');

/**
 * حل دقیق و سخت‌گیرانه دیتابیس بر اساس قلمرو درخواستی — فاز ۴ (گام ۴)
 * برای قلمروهای قفل یا ثبت‌شده نمونه دیتابیس را برمی‌گرداند و برای موارد ناشناخته null. هرگز fallback به انبار ندارد.
 */
export function resolveOfflineDbStrict(scope?: string | null): OfflineDatabase | null {
  if (!scope) return null;
  const s = scope.toLowerCase();
  if (s === WH_SCOPE) return warehouseOfflineDb;
  if (s === FIN_SCOPE || s === PERS_SCOPE || s === ACCT_SCOPE) return financeOfflineDb;

  const specs = getOfflineSyncSpecs();
  for (const spec of specs) {
    if (spec.scopeKind in SCOPED_DB_NAMES) continue;
    if (spec.scopeKind.toLowerCase() === s) {
      return getOfflineDb(spec.scopeKind);
    }
    if (spec.scopeAliases && spec.scopeAliases.some(a => a.toLowerCase() === s)) {
      return getOfflineDb(spec.scopeKind);
    }
  }

  return null;
}

/**
 * دریافت کلیه نمونه‌های دیتابیس‌های آفلاین فعال در سامانه — فاز ۴ (گام ۴)
 * شامل دو دیتابیس قفل‌شده به همراه کلیه دیتابیس‌های ماژول‌های ثبت‌شده بدون تکرار.
 */
export function getAllOfflineDbs(): OfflineDatabase[] {
  const result: OfflineDatabase[] = [warehouseOfflineDb, financeOfflineDb];
  try {
    const specs = getOfflineSyncSpecs();
    for (const spec of specs) {
      if (spec.scopeKind in SCOPED_DB_NAMES) continue;
      const db = getOfflineDb(spec.scopeKind);
      if (!result.includes(db)) {
        result.push(db);
      }
    }
  } catch {
    // on registry error only the two locked DBs
  }
  return result;
}

/**
 * پروکسی هوشمند و شفاف offlineDb — سازگاری ۱۰۰٪ با کدهای پیشین بدون نیاز به تغییر ایمپورت‌ها
 * دسترسی‌ها به جداول و متدها را به طور خودکار به دیتابیس قلمرو فعال جاری هدایت می‌کند.
 */
export const offlineDb: OfflineDatabase = new Proxy({} as OfflineDatabase, {
  get(target, prop: string | symbol) {
    if (prop in target) {
      const val = (target as any)[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    }

    // ۱. جداول اختصاصی دامنه انبارداری
    if (['countTasks', 'items', 'dynamicFields', 'photoQueue', 'docTasks'].includes(prop as string)) {
      const whDb = getOfflineDb('warehouse');
      const val = (whDb as any)[prop];
      return typeof val === 'function' ? val.bind(whDb) : val;
    }

    // ۲. جداول اختصاصی دامنه مالی
    if (prop === 'attendanceRecords') {
      const finDb = getOfflineDb('finance');
      const val = (finDb as any)[prop];
      return typeof val === 'function' ? val.bind(finDb) : val;
    }

    // ۳. سایر جداول و متدها بر اساس قلمرو فعال جاری هدایت می‌شوند
    const currentDb = getOfflineDb();
    const val = (currentDb as any)[prop];
    return typeof val === 'function' ? val.bind(currentDb) : val;
  },
  has(target, prop: string | symbol) {
    if (prop in target) return true;
    const currentDb = getOfflineDb();
    return prop in currentDb;
  },
  set(target, prop: string | symbol, value: any) {
    (target as any)[prop] = value;
    const currentDb = getOfflineDb();
    (currentDb as any)[prop] = value;
    return true;
  },
  getOwnPropertyDescriptor(target, prop: string | symbol) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    const currentDb = getOfflineDb();
    return Object.getOwnPropertyDescriptor(currentDb, prop) || {
      configurable: true,
      enumerable: true,
      value: (currentDb as any)[prop],
      writable: true
    };
  }
});

// ─── پیش‌نویس محلی فرم پرسنل (DEF-24) ───
// در یک پایگاه‌دادهٔ جدای کوچک نگه داشته می‌شود تا ارتقای نسخهٔ دیتابیس‌های صف و کش لازم نشود؛
// ارتقای نسخه اتصال تب‌های باز قدیمی را می‌بندد و صف آفلاین آن‌ها را در خطر می‌اندازد.
// این داده کاربر است: فقط با ذخیرهٔ موفق روی سرور یا انتخاب صریح کاربر پاک می‌شود.
export interface PersonnelLocalDraft {
  key: string;
  userId: number | null;
  sectionId: number;
  /** شناسهٔ سروری پرونده برای پیش‌نویس ویرایش؛ تهی برای پرسنل جدید */
  personnelId?: number | null;
  savedAt: string;
  form: Record<string, unknown>;
  bankAccounts: Array<Record<string, unknown>>;
}

class PersonnelDraftDatabase extends Dexie {
  drafts!: Table<PersonnelLocalDraft, string>;

  constructor() {
    super('FinancePersonnelDraftsDB');
    this.version(1).stores({ drafts: 'key, userId, sectionId, savedAt' });
  }
}

let personnelDraftDb: PersonnelDraftDatabase | null = null;

function getPersonnelDraftDb(): PersonnelDraftDatabase | null {
  if (typeof indexedDB === 'undefined') return null;
  if (!personnelDraftDb) personnelDraftDb = new PersonnelDraftDatabase();
  return personnelDraftDb;
}

/**
 * کلید یکتای هر پیش‌نویس: ویرایش هر پرونده اسلات خودش را دارد و هر فرم پرسنل جدید اسلات تازه‌ای می‌گیرد؛
 * پس ذخیرهٔ یک فرم پیش‌نویس فرم دیگری را بازنویسی یا پاک نمی‌کند.
 */
export function personnelLocalDraftKey(userId: number | null | undefined, sectionId: number, draftId: string): string {
  return `${userId ?? 'anon'}_${sectionId}_${draftId}`;
}

export function newPersonnelLocalDraftId(): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `new-${rand}`;
}

/** همهٔ پیش‌نویس‌های محلی یک کاربر در یک بخش، تازه‌ترین اول */
export async function listPersonnelLocalDrafts(userId: number | null | undefined, sectionId: number): Promise<PersonnelLocalDraft[]> {
  const db = getPersonnelDraftDb();
  if (!db) return [];
  const rows = await db.drafts.where('sectionId').equals(sectionId).toArray();
  return rows
    .filter(d => (d.userId ?? null) === (userId ?? null))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

export async function savePersonnelLocalDraft(draft: PersonnelLocalDraft): Promise<boolean> {
  const db = getPersonnelDraftDb();
  if (!db) return false;
  await db.drafts.put(draft);
  return true;
}

export async function getPersonnelLocalDraft(key: string): Promise<PersonnelLocalDraft | null> {
  const db = getPersonnelDraftDb();
  if (!db) return null;
  return (await db.drafts.get(key)) ?? null;
}

/** تعداد همهٔ پیش‌نویس‌های محلی این مرورگر (همهٔ کاربران)؛ خطای IndexedDB به فراخوان می‌رسد */
export async function countPersonnelLocalDraftsStrict(): Promise<number> {
  const db = getPersonnelDraftDb();
  if (!db) return 0;
  return db.drafts.count();
}

export async function deletePersonnelLocalDraft(key: string): Promise<void> {
  const db = getPersonnelDraftDb();
  if (!db) return;
  await db.drafts.delete(key);
}

/**
 * پاکسازی کش‌های مشتق‌شده از سرور در تمامی دیتابیس‌های تفکیک‌شده
 */
export async function clearAllScopedCaches(): Promise<void> {
  const dbs = getAllOfflineDbs();
  await Promise.all(dbs.map(db => db.clearServerDerivedCaches()));
}

export const LEGACY_MIGRATION_MARKER = 'wh_legacy_offline_db_migrated_v1';

export interface LegacyTableLike {
  toArray(): Promise<any[]>;
  update(key: any, changes: any): Promise<any>;
  [key: string]: any;
}

export interface LegacyDatabaseLike {
  tables: Array<{ name: string }>;
  table(name: string): LegacyTableLike;
  [key: string]: any;
}

export interface LegacyMigrationTargets {
  warehouse: {
    docTasks?: {
      get?: (key: any) => Promise<any>;
      bulkGet?: (keys: any[]) => Promise<any[]>;
      bulkAdd: (rows: any[]) => Promise<any>;
      [key: string]: any;
    };
    syncQueue: {
      filter: (predicate: (item: any) => boolean) => { first: () => Promise<any> };
      add: (item: any) => Promise<any>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  finance: {
    syncQueue: {
      filter: (predicate: (item: any) => boolean) => { first: () => Promise<any> };
      add: (item: any) => Promise<any>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * مهاجرت داده‌های قدیمی از پایگاه داده موروثی WarehouseOfflineDB به پایگاه‌های داده تفکیک‌شده
 */
export async function migrateLegacyData(
  legacy: LegacyDatabaseLike,
  targets: LegacyMigrationTargets = { warehouse: warehouseOfflineDb, finance: financeOfflineDb }
): Promise<void> {
  // b) Run-once marker: وقتی کلید wh_legacy_offline_db_migrated_v1 تنظیم شده است، بلافاصله بازمی‌گردد
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_MIGRATION_MARKER)) {
      return;
    }
  } catch {
    // دسترسی به localStorage ممکن است در برخی محیط‌ها محدود باشد
  }

  let hasError = false;
  const tableNames = legacy.tables.map(t => t.name);

  // c) انتقال docTasks: فقط رکوردهایی که primary key آنها (sync_id) در warehouseOfflineDb.docTasks نیست اضافه می‌شوند
  if (tableNames.includes('docTasks')) {
    try {
      const legacyDocTable = legacy.table('docTasks');
      const legacyDocs = await legacyDocTable.toArray();
      if (Array.isArray(legacyDocs) && legacyDocs.length > 0) {
        const targetDocTasks = targets.warehouse?.docTasks;
        if (targetDocTasks) {
          const missingDocs: any[] = [];
          if (typeof targetDocTasks.bulkGet === 'function') {
            const syncIds = legacyDocs.map((d: any) => d.sync_id).filter((id: any) => id != null);
            const foundRecords = await targetDocTasks.bulkGet(syncIds);
            const existingIds = new Set(
              (foundRecords || []).filter(Boolean).map((d: any) => d.sync_id)
            );
            for (const doc of legacyDocs) {
              if (doc.sync_id == null || !existingIds.has(doc.sync_id)) {
                missingDocs.push(doc);
              }
            }
          } else if (typeof targetDocTasks.get === 'function') {
            for (const doc of legacyDocs) {
              if (doc.sync_id != null) {
                const found = await targetDocTasks.get(doc.sync_id);
                if (!found) {
                  missingDocs.push(doc);
                }
              } else {
                missingDocs.push(doc);
              }
            }
          } else {
            missingDocs.push(...legacyDocs);
          }

          if (missingDocs.length > 0) {
            await targetDocTasks.bulkAdd(missingDocs);
            console.log(`[OfflineDB Migration] 🚚 ${missingDocs.length} سند انبار به دیتابیس انبارداری اضافه شد.`);
          }
        }
      }
    } catch (err) {
      hasError = true;
      console.warn('[OfflineDB Migration] خطا در مهاجرت اسناد انبار (docTasks):', err);
    }
  }

  // d) انتقال صف همگام‌سازی: صرف‌نظر کردن از رکوردهایی که migratedAt دارند (Claim-first)
  if (tableNames.includes('syncQueue')) {
    try {
      const legacyQueueTable = legacy.table('syncQueue');
      const legacyQueue: SyncQueueEntry[] = await legacyQueueTable.toArray();
      for (const item of legacyQueue) {
        if ((item as any).migratedAt) {
          continue;
        }

        if (item.id == null) {
          console.warn('[OfflineDB Migration] رکورد صف قدیمی فاقد id است و نادیده گرفته شد:', item);
          continue;
        }

        try {
          await legacyQueueTable.update(item.id, { migratedAt: Date.now() });
        } catch (claimErr) {
          hasError = true;
          console.warn(`[OfflineDB Migration] خطا در ثبت ادعای رکورد صف (id: ${item.id}):`, claimErr);
          continue;
        }

        try {
          const scope = resolveLegacyScopeFromUrl(item.url);
          const targetDb = targets[scope] || targets.warehouse;
          const targetQueue = targetDb.syncQueue;
          const existing = await targetQueue
            .filter((e: any) => e.url === item.url && e.method === item.method && e.createdAt === item.createdAt)
            .first();

          if (!existing) {
            const { id: _legacyId, ...itemWithoutId } = item as any;
            await targetQueue.add({
              ...itemWithoutId,
              appScope: scope,
            });
          }
        } catch (opErr) {
          hasError = true;
          console.warn(`[OfflineDB Migration] خطا در بررسی یا اضافه کردن رکورد صف (id: ${item.id}):`, opErr);
          try {
            await legacyQueueTable.update(item.id, { migratedAt: undefined });
          } catch (releaseErr) {
            console.warn(`[OfflineDB Migration] خطا در آزادسازی ادعای رکورد صف (id: ${item.id}):`, releaseErr);
          }
        }
      }
    } catch (err) {
      hasError = true;
      console.warn('[OfflineDB Migration] خطا در خواندن جدول صف قدیمی:', err);
    }
  }

  // تنظیم نشانگر تنها در صورتی که کل فرایند بدون خطا تکمیل شده باشد
  if (!hasError) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEGACY_MIGRATION_MARKER, 'true');
      }
    } catch {
      // نادیده گرفتن خطاهای احتمالی حافظه محلی
    }
  }
}

/**
 * مهاجرت خودکار و امن داده‌ها از پایگاه داده قدیمی WarehouseOfflineDB در صورت وجود
 */
export async function migrateLegacyDatabaseIfNeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_MIGRATION_MARKER)) {
      return;
    }

    const runMigration = async () => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_MIGRATION_MARKER)) {
        return;
      }
      const dbs = await Dexie.getDatabaseNames();
      if (!dbs.includes('WarehouseOfflineDB')) return;

      const legacyDb = new Dexie('WarehouseOfflineDB');
      await legacyDb.open();
      try {
        await migrateLegacyData(legacyDb, { warehouse: warehouseOfflineDb, finance: financeOfflineDb });
      } finally {
        legacyDb.close();
      }
    };

    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
      await navigator.locks.request('wh-legacy-offline-migration', { mode: 'exclusive' }, runMigration);
    } else {
      await runMigration();
    }
  } catch (err) {
    console.warn('[OfflineDB Migration] عدم اجرای مهاجرت دیتابیس قبلی:', err);
  }
}

/**
 * خروجی جامع و ساختاریافته از تمام داده‌های محلی هر دو پایگاه‌داده تفکیک‌شده (انبارداری و مالی)
 */
export async function exportLocalDatabaseSnapshot(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  exportedAtUnix: number;
  warehouse: { [tableName: string]: any[] };
  finance: { [tableName: string]: any[] };
  others: { [dbName: string]: { [tableName: string]: any[] } };
  /** پیش‌نویس‌های محلی فرم پرسنل (پایگاه‌دادهٔ جدای FinancePersonnelDraftsDB) */
  personnelDrafts: { [tableName: string]: any[] };
  metrics: {
    totalRecords: number;
    warehouseRecords: number;
    financeRecords: number;
    pendingSyncCount: number;
  };
}> {
  const exportTable = async (db: Dexie): Promise<{ [tableName: string]: any[] }> => {
    const result: { [tableName: string]: any[] } = {};
    for (const table of db.tables) {
      try {
        result[table.name] = await table.toArray();
      } catch (e) {
        result[table.name] = [];
      }
    }
    return result;
  };

  const allDbs = getAllOfflineDbs();
  const otherDbs = allDbs.slice(2);
  const draftDb = getPersonnelDraftDb();
  const [whData, finData, draftData, otherEntries] = await Promise.all([
    exportTable(warehouseOfflineDb),
    exportTable(financeOfflineDb),
    draftDb ? exportTable(draftDb) : Promise.resolve({} as { [tableName: string]: any[] }),
    Promise.all(otherDbs.map(async (db) => ({ name: db.name, data: await exportTable(db) }))),
  ]);

  const others: { [dbName: string]: { [tableName: string]: any[] } } = {};
  for (const entry of otherEntries) {
    others[entry.name] = entry.data;
  }

  const countRecords = (data: { [k: string]: any[] }) =>
    Object.values(data).reduce((acc, arr) => acc + (arr?.length || 0), 0);

  const whCount = countRecords(whData);
  const finCount = countRecords(finData);
  const draftCount = countRecords(draftData);
  let otherCount = 0;
  for (const data of Object.values(others)) {
    otherCount += countRecords(data);
  }
  const pendingSync = (whData['syncQueue']?.length || 0) + (finData['syncQueue']?.length || 0);

  const now = new Date();
  let shamsiDate = '';
  try {
    shamsiDate = new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(now);
  } catch {
    shamsiDate = now.toISOString();
  }

  return {
    schemaVersion: 4,
    exportedAt: shamsiDate,
    exportedAtUnix: Date.now(),
    warehouse: whData,
    finance: finData,
    others,
    personnelDrafts: draftData,
    metrics: {
      totalRecords: whCount + finCount + draftCount + otherCount,
      warehouseRecords: whCount,
      financeRecords: finCount,
      pendingSyncCount: pendingSync,
    }
  };
}

/**
 * ایجاد و دانلود فایل JSON نسخه پشتیبان پایگاه داده محلی روی سیستم یا تبلت
 */
export async function downloadLocalDatabaseSnapshotFile(): Promise<{ fileName: string; totalRecords: number }> {
  const snapshot = await exportLocalDatabaseSnapshot();
  const dateSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `warehouse_indexeddb_snapshot_${dateSlug}.json`;

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
  await saveBlob(blob, fileName);

  return { fileName, totalRecords: snapshot.metrics.totalRecords };
}

