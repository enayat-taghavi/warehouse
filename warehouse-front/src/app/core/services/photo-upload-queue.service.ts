import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ItemPhoto } from '../models/item.model';
import { NetworkStatusService } from './network-status.service';
import { offlineDb, PhotoQueueEntry } from './offline-db';
import { isServerUnreachable } from './server-reachability';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { resolveServerUrl } from '../platform/server-origin';

/**
 * نتیجه یک دور تخلیه صف عکس — با همان منطق سه‌حالته صف اصلی
 *
 * «آفلاین» شکست نیست؛ یعنی هیچ تلاشی انجام نشده و فایل‌ها سر جای خود هستند.
 */
export type PhotoFlushOutcome =
  | { status: 'offline'; remaining: number }
  | { status: 'nothing-to-send' }
  | { status: 'server-unreachable'; sent: number; remaining: number }
  | { status: 'auth-required'; sent: number; remaining: number }
  | { status: 'completed'; sent: number }
  | { status: 'partial'; sent: number; rejected: number; remaining: number };

type EntryResult = 'sent' | 'rejected' | 'auth-failed' | 'server-error' | 'transport-failed';

/** ورودی افزودن به صف — sync_id و متادیتای صف خودکار ساخته می‌شوند */
export interface PhotoQueueInput {
  itemId: number;
  blob: Blob;
  fileName: string;
  caption?: string;
  sourceType?: 'camera' | 'gallery';
  countTaskId?: number;
  isPrimary?: boolean;
  width?: number;
  height?: number;
  userId?: number;
}

/**
 * شناسه یکتا برای idempotency آپلود.
 *
 * `crypto.randomUUID` فقط در بستر امن (https/localhost) وجود دارد و سرور توسعه
 * روی IP محلی http است؛ بدون این جایگزین، آپلود در محیط توسعه می‌شکست.
 */
function newSyncId(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // نسخه ۴ و variant مطابق RFC 4122 — سرور با uuid.UUID اعتبارسنجی می‌کند
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * PhotoUploadQueueService — صف پایدار آپلود عکس کالا
 *
 * چرا صفی جدا از OfflineSyncService: آن صف بدنه را `JSON.stringify` می‌کند و با
 * `Content-Type: application/json` می‌فرستد. یک Blob از این مسیر رد نمی‌شود؛
 * عکس کاربر به `{}` تبدیل می‌شد. اینجا فایل به‌صورت Blob در IndexedDB می‌نشیند
 * و با FormData ارسال می‌شود.
 *
 * قواعد حذف از صف (همان قواعد صف اصلی — صف کار ناتمام کاربر است):
 * • ۲xx → پذیرش صریح سرور → حذف
 * • ۴xx → رد صریح سرور → فایل *نگه داشته* می‌شود با وضعیت `rejected`، چون
 *   نسخه دیگری از آن عکس هیچ‌جا وجود ندارد؛ تصمیم با کاربر است
 * • ۵xx / خطای شبکه / آفلاین → دست‌نخورده در صف می‌ماند
 */
@Injectable({
  providedIn: 'root',
})
export class PhotoUploadQueueService {
  private static instance: PhotoUploadQueueService;
  private network = NetworkStatusService.getInstance();
  private flushing = false;
  private moduleRegistry = getModuleRegistry();

  /** بعد از این تعداد تلاش ناموفق فقط پیام هشدار عوض می‌شود؛ رکورد نمی‌سوزد */
  private readonly MAX_RETRIES = 3;

  /** تعداد عکس‌های منتظر ارسال (شامل rejected نمی‌شود) */
  private _pendingCount$ = new BehaviorSubject<number>(0);
  readonly pendingCount$ = this._pendingCount$.asObservable();

  /**
   * عکس‌هایی که همین حالا سرور ثبت کرد.
   * گالری باز (یا بندانگشتی کالا) با شنیدن این جریان خودش را تازه می‌کند —
   * وگرنه کاربر عکسی را که در پس‌زمینه آپلود شد نمی‌دید.
   */
  private _uploaded$ = new Subject<{ itemId: number; photos: ItemPhoto[] }>();
  readonly uploaded$ = this._uploaded$.asObservable();

  /** هر تغییر در محتوای صف (افزودن، ارسال، رد شدن) */
  private _changed$ = new Subject<void>();
  readonly changed$ = this._changed$.asObservable();

  constructor() {
    PhotoUploadQueueService.instance = this;
  }

  static getInstance(): PhotoUploadQueueService {
    if (!PhotoUploadQueueService.instance) {
      PhotoUploadQueueService.instance = new PhotoUploadQueueService();
    }
    return PhotoUploadQueueService.instance;
  }

  get pendingCount(): number {
    return this._pendingCount$.value;
  }

  /**
   * آزادسازی رکوردهای گیرکرده در وضعیت sending
   * (برنامه وسط آپلود بسته شده؛ بدون این، عکس برای همیشه در حال ارسال می‌ماند)
   */
  async initialize(): Promise<void> {
    try {
      await offlineDb.photoQueue.where('status').equals('sending').modify({ status: 'pending' });
    } catch {
      /* دیتابیس ممکن است هنوز آماده نباشد */
    }
    await this.refreshCount();
  }

  // ════════════════════════════════════════════
  //  افزودن به صف
  // ════════════════════════════════════════════

  /**
   * افزودن یک عکس به صف — *قبل* از هر تلاش شبکه‌ای انجام می‌شود.
   *
   * ترتیب «اول ذخیره، بعد ارسال» تنها ترتیبی است که عکس را در برابر بسته شدن
   * ناگهانی مرورگر یا قطع وسط آپلود حفظ می‌کند.
   */
  async enqueue(input: PhotoQueueInput): Promise<PhotoQueueEntry> {
    // بررسی ظرفیت ذخیره‌سازی محلی جهت پیشگیری از QuotaExceededError (تسک ۱۹)
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.usage) {
          const remainingBytes = estimate.quota - estimate.usage;
          if (remainingBytes < 10 * 1024 * 1024) {
            console.warn('[PhotoQueue] ⚠️ حافظه مرورگر بسیار محدود است (کمتر از ۱۰ مگابایت فضای خالی باقیمانده).');
          }
        }
      } catch {
        /* عدم پشتیبانی مرورگر */
      }
    }

    const entry: PhotoQueueEntry = {
      ...input,
      syncId: newSyncId(),
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
    };
    entry.id = await offlineDb.photoQueue.add(entry);
    console.log(`[PhotoQueue] 📥 عکس کالای ${entry.itemId} به صف اضافه شد (id: ${entry.id})`);
    await this.refreshCount();
    this._changed$.next();
    return entry;
  }

  // ════════════════════════════════════════════
  //  خواندن صف
  // ════════════════════════════════════════════

  /** تعداد عکس‌های در انتظار ارسال */
  async countPending(): Promise<number> {
    try {
      return await offlineDb.photoQueue.where('status').anyOf(['pending', 'sending', 'failed']).count();
    } catch {
      return 0;
    }
  }

  /** مانند countPending ولی خطای IndexedDB را پنهان نمی‌کند (برای تصمیم‌های ایمنی مثل انتقال دامنه) */
  async countPendingStrict(): Promise<number> {
    return offlineDb.photoQueue.where('status').anyOf(['pending', 'sending', 'failed']).count();
  }

  /** آیا هم‌اکنون دوری از ارسال عکس در جریان است؟ */
  get isFlushing(): boolean {
    return this.flushing;
  }

  /** همه رکوردهای صف مربوط به یک کالا (منتظر ارسال + ردشده) */
  async entriesForItem(itemId: number): Promise<PhotoQueueEntry[]> {
    try {
      const rows = await offlineDb.photoQueue.where('itemId').equals(itemId).toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  }

  /**
   * حذف یک رکورد صف با تأیید صریح کاربر.
   *
   * تنها مسیری است که عکسِ نرسیده به سرور را پاک می‌کند و فقط برای عکس ردشده
   * معنا دارد (مثلاً فایل خراب). هیچ مسیر خودکاری این را صدا نمی‌زند.
   */
  async discard(entryId: number): Promise<void> {
    await offlineDb.photoQueue.delete(entryId);
    await this.refreshCount();
    this._changed$.next();
  }

  /** بازگرداندن یک عکس ردشده به نوبت ارسال (به درخواست کاربر) */
  async retry(entryId: number): Promise<void> {
    await offlineDb.photoQueue.update(entryId, {
      status: 'pending',
      retryCount: 0,
      lastError: undefined,
    });
    await this.refreshCount();
    this._changed$.next();
    this.flush().catch(() => {});
  }

  // ════════════════════════════════════════════
  //  تخلیه صف
  // ════════════════════════════════════════════

  /**
   * ارسال عکس‌های در صف به سرور، یکی‌یکی.
   *
   * هر عکس درخواست خودش را دارد (نه یک بسته مشترک): یک فایل خراب کل دسته را
   * زمین نمی‌زند و idempotency هم per-photo است.
   */
  async flush(onProgress?: (percent: number) => void): Promise<PhotoFlushOutcome> {
    if (this.flushing) return { status: 'nothing-to-send' };
    if (!this.network.isBrowserOnline) {
      return { status: 'offline', remaining: await this.countPending() };
    }

    this.flushing = true;
    let sent = 0;
    let rejected = 0;
    let aborted = false;
    let authRequired = false;
    const uploadedByItem = new Map<number, ItemPhoto[]>();

    try {
      const entries = await offlineDb.photoQueue
        .where('status')
        .anyOf(['pending', 'failed'])
        .sortBy('createdAt');

      if (entries.length === 0) return { status: 'nothing-to-send' };

      // اولویت‌بندی هوشمند (تسک ۱): رکوردهای مکرراً شکست‌خورده مانع عکس‌های تازه نشوند
      entries.sort((a, b) => {
        const aExceeded = (a.retryCount || 0) >= this.MAX_RETRIES ? 1 : 0;
        const bExceeded = (b.retryCount || 0) >= this.MAX_RETRIES ? 1 : 0;
        if (aExceeded !== bExceeded) return aExceeded - bExceeded;
        return a.createdAt - b.createdAt;
      });

      console.log(`[PhotoQueue] 🔄 ارسال ${entries.length} عکس از صف...`);

      for (let i = 0; i < entries.length; i++) {
        if (!this.network.isBrowserOnline) {
          console.log('[PhotoQueue] 📴 اتصال قطع شد — بقیه عکس‌ها در صف ماندند');
          aborted = true;
          break;
        }

        const result = await this.sendEntry(entries[i], uploadedByItem);
        onProgress?.(Math.round((100 * (i + 1)) / entries.length));

        if (result === 'sent') {
          sent++;
          continue;
        }
        if (result === 'rejected') {
          rejected++;
          continue;
        }
        if (result === 'auth-failed') {
          // با همین توکن بقیه هم رد می‌شوند؛ ادامه دادن بی‌فایده است
          authRequired = true;
          break;
        }
        if (result === 'server-error') {
          // رفع Head-of-line Blocking (تسک ۱): اگر عکس به سقف تلاش مجدد رسیده، متوقف نشو و بقیه عکس‌ها را بفرست
          if (entries[i].retryCount >= this.MAX_RETRIES) {
            console.warn(
              `[PhotoQueue] ⚠️ عکس ${entries[i].id} پس از حداکثر تلاش‌ها با خطای سرور معلق ماند؛ از مسدودسازی صف رد شد.`
            );
            continue;
          }
          aborted = true;
          break;
        }
        // transport-failed — سرور در دسترس نیست
        aborted = true;
        break;
      }
    } catch (error) {
      console.error('[PhotoQueue] ❌ خطا در تخلیه صف عکس:', error);
      aborted = true;
    } finally {
      this.flushing = false;
      await this.refreshCount();
      for (const [itemId, photos] of uploadedByItem) {
        if (photos.length) this._uploaded$.next({ itemId, photos });
      }
      this._changed$.next();
    }

    if (!this.network.isBrowserOnline) return { status: 'offline', remaining: await this.countPending() };
    if (authRequired) return { status: 'auth-required', sent, remaining: await this.countPending() };
    if (aborted) return { status: 'server-unreachable', sent, remaining: await this.countPending() };

    const remaining = await this.countPending();
    if (rejected > 0 || remaining > 0) return { status: 'partial', sent, rejected, remaining };
    if (sent === 0) return { status: 'nothing-to-send' };
    return { status: 'completed', sent };
  }

  /** ارسال یک رکورد صف */
  private async sendEntry(
    entry: PhotoQueueEntry,
    uploadedByItem: Map<number, ItemPhoto[]>,
    hasRetriedAuth = false
  ): Promise<EntryResult> {
    if (!entry.id) return 'rejected';

    try {
      await offlineDb.photoQueue.update(entry.id, { status: 'sending' });

      const form = new FormData();
      form.append('item', String(entry.itemId));
      form.append('images', entry.blob, entry.fileName);
      // کلید idempotency: اگر پاسخ در تونل گم شود و دوباره بفرستیم، سرور همان
      // رکورد را برمی‌گرداند و عکس تکراری ساخته نمی‌شود.
      form.append('sync_ids', entry.syncId);
      if (entry.caption) form.append('captions', entry.caption);
      if (entry.sourceType) form.append('source_type', entry.sourceType);
      if (entry.countTaskId) form.append('count_task', String(entry.countTaskId));
      if (entry.isPrimary) form.append('is_primary', 'true');

      const token =
        sessionStorage.getItem('wh_access_token_warehouse') ||
        sessionStorage.getItem('wh_access_token') ||
        localStorage.getItem('wh_access_token_warehouse') ||
        localStorage.getItem('wh_access_token');
      const tabId = sessionStorage.getItem('wh_tab_session_id') || 'tab_photo_queue';
      const role = sessionStorage.getItem('active_role_persona') || 'counter';
      const headers: Record<string, string> = {
        'X-Active-App': 'warehouse',
        'X-Active-Role': role,
        'X-Client-Tab-Id': tabId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      // Content-Type عمداً ست نمی‌شود: مرورگر باید خودش boundary را بگذارد.

      // خواندن آدرس آپلود عکس از نقطه توسعه ماژول انبار
      const photoUploadExt = this.moduleRegistry
        .getExtensions('photoUpload')[0]?.extension;
      if (!photoUploadExt?.itemPhotosEndpoint) {
        console.warn('[PhotoQueue] ⚠ نقطه توسعه photoUpload ثبت نشده است — رکورد در صف ماند');
        await offlineDb.photoQueue.update(entry.id, {
          status: 'pending',
          lastError: 'نقطه توسعه آپلود عکس در ماژول ثبت نشده است',
        });
        return 'server-error';
      }

      const endpoint = photoUploadExt.itemPhotosEndpoint(entry.itemId);
      const url = endpoint.startsWith('http') ? endpoint : `${environment.apiUrl}${endpoint}`;

      const response = await fetch(resolveServerUrl(url), {
        method: 'POST',
        headers,
        body: form,
      });

      // پاسخ گرفتن با «به بک‌اند رسیدن» یکی نیست: ۵۲۰–۵۳۰ از Cloudflare یک پاسخ
      // کامل HTTP است در حالی که origin بالا نیست.
      if (isServerUnreachable(response.status)) {
        this.network.reportServerUnreachable();
      } else {
        this.network.reportServerReachable();
      }

      if (response.ok) {
        let created: ItemPhoto[] = [];
        try {
          const body = await response.json();
          if (Array.isArray(body)) created = body as ItemPhoto[];
        } catch {
          /* بدنه غیرمنتظره؛ ثبت انجام شده و همین کافی است */
        }
        await offlineDb.photoQueue.delete(entry.id);
        const bucket = uploadedByItem.get(entry.itemId) || [];
        uploadedByItem.set(entry.itemId, [...bucket, ...created]);
        console.log(`[PhotoQueue] ✅ عکس کالای ${entry.itemId} ثبت شد`);
        return 'sent';
      }

      if (response.status === 401) {
        if (!hasRetriedAuth && (await this.refreshToken())) {
          return this.sendEntry(entry, uploadedByItem, true);
        }
        await offlineDb.photoQueue.update(entry.id, {
          status: 'pending',
          lastError: 'نشست منقضی شده — پس از ورود مجدد ارسال می‌شود',
        });
        console.warn('[PhotoQueue] 🔒 توکن منقضی — عکس در صف ماند');
        return 'auth-failed';
      }

      if (response.status === 408 || response.status === 429) {
        // رد صریح نیست؛ موقتی است و تلاش بعدی به احتمال زیاد موفق می‌شود
        await this.markRetry(entry, `خطای موقت سرور (${response.status}) — بعداً دوباره تلاش می‌شود`);
        return 'server-error';
      }

      if (response.status >= 400 && response.status < 500) {
        await this.markRejected(entry, await this.readError(response));
        return 'rejected';
      }

      await this.markRetry(entry, `خطای سرور (${response.status})`);
      return 'server-error';
    } catch (error: any) {
      // اصلاً به سرور نرسیدیم — این شکست نیست، فقط هنوز فرصتش نشده
      this.network.reportServerUnreachable();
      await offlineDb.photoQueue.update(entry.id, {
        status: 'pending',
        lastError: `در انتظار اتصال: ${error?.message || 'اتصال برقرار نشد'}`,
      });
      console.log('[PhotoQueue] 📴 عکس ارسال نشد — در صف ماند تا اتصال برقرار شود');
      return 'transport-failed';
    }
  }

  /** پیام خطای قابل‌فهم از بدنه پاسخ سرور */
  private async readError(response: Response): Promise<string> {
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') return body.error;
      if (typeof body?.detail === 'string') return body.detail;
      if (body && typeof body === 'object') {
        const firstKey = Object.keys(body)[0];
        const firstValue = (body as any)[firstKey];
        return Array.isArray(firstValue) ? `${firstKey}: ${firstValue[0]}` : String(firstValue);
      }
    } catch {
      /* بدنه JSON نبود */
    }
    return `خطای ${response.status}`;
  }

  /**
   * خطای موقت — رکورد در صف می‌ماند و فقط شمارنده تلاش بالا می‌رود.
   * رسیدن به سقف تلاش رکورد را حذف نمی‌کند؛ فقط پیام صریح‌تری می‌گذارد.
   */
  private async markRetry(entry: PhotoQueueEntry, message: string): Promise<void> {
    if (!entry.id) return;
    const retryCount = entry.retryCount + 1;
    await offlineDb.photoQueue.update(entry.id, {
      status: 'failed',
      retryCount,
      lastError:
        retryCount >= this.MAX_RETRIES
          ? `${message} — پس از ${retryCount} تلاش هنوز ارسال نشده (فایل محفوظ است)`
          : message,
    });
    console.warn(`[PhotoQueue] ⚠️ تلاش ${retryCount} ناموفق: ${message} (در صف باقی ماند)`);
  }

  /**
   * رد صریح سرور — رکورد حذف *نمی‌شود*.
   *
   * فایل اصلی جای دیگری وجود ندارد (کاربر عکس را گرفته و از حافظه دوربین رفته).
   * پاک کردن خودکار آن یعنی از دست رفتن داده کاربر؛ پس با وضعیت rejected و
   * پیام سرور می‌ماند تا کاربر خودش تلاش مجدد یا حذف را انتخاب کند.
   */
  private async markRejected(entry: PhotoQueueEntry, message: string): Promise<void> {
    if (!entry.id) return;
    await offlineDb.photoQueue.update(entry.id, { status: 'rejected', lastError: message });
    console.error(`[PhotoQueue] ❌ سرور عکس کالای ${entry.itemId} را رد کرد: ${message}`);
  }

  /**
   * تازه‌سازی توکن از مسیر همان سرویس صف اصلی.
   * import دینامیک است تا حلقه وابستگی ماژول‌ها ایجاد نشود.
   */
  private async refreshToken(): Promise<boolean> {
    try {
      const { OfflineSyncService } = await import('./offline-sync.service');
      return await OfflineSyncService.getInstance().refreshAccessToken();
    } catch {
      return false;
    }
  }

  private async refreshCount(): Promise<void> {
    this._pendingCount$.next(await this.countPending());
  }
}
