import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ItemPhoto } from '../../../core/models/item.model';
import { ImageCompressorService, ImageDecodeError } from '../../../core/services/image-compressor.service';
import { PhotoQueueEntry } from '../../../core/services/offline-db';
import { PhotoUploadQueueService } from '../../../core/services/photo-upload-queue.service';
import { SyncPullService } from '../../../core/services/sync-pull.service';

export interface UploadPhotoOptions {
  caption?: string;
  source_type?: 'camera' | 'gallery';
  is_primary?: boolean;
  count_task_id?: number;
  onProgress?: (percent: number) => void;
}

/**
 * نتیجه صادقانه یک آپلود — «ثبت شد» و «در صف ماند» دو چیز متفاوت‌اند
 *
 * پیش از این متد فقط یک لیست عکس برمی‌گرداند و در حالت آفلاین خطا می‌داد؛
 * رابط کاربری هم پیش‌نمایش‌ها را پاک می‌کرد و عکس کاربر واقعاً از بین می‌رفت.
 */
export interface PhotoUploadResult {
  /** عکس‌هایی که سرور همین حالا ثبت کرد */
  created: ItemPhoto[];
  /** عکس‌هایی که در صف ماندند تا اتصال برقرار شود */
  queued: PhotoQueueEntry[];
  /** عکس‌هایی که سرور صریحاً رد کرد — فایل حفظ شده و تصمیم با کاربر است */
  rejected: PhotoQueueEntry[];
  /** هشدارهایی که کاربر باید *پیش از* پاسخ سرور بداند (مثلاً قالب HEIC) */
  warnings: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ItemPhotoService {
  private http = inject(HttpClient);
  private compressor = inject(ImageCompressorService);
  private queue = PhotoUploadQueueService.getInstance();
  private baseUrl = `${environment.apiUrl}/inventory`;

  /** عکس‌هایی که در پس‌زمینه (پس از بازگشت اتصال) ثبت شدند */
  readonly uploaded$ = this.queue.uploaded$;

  /** هر تغییر در محتوای صف آپلود */
  readonly queueChanged$ = this.queue.changed$;

  /**
   * دریافت لیست تمام تصاویر یک کالا
   *
   * خطا عمداً بلعیده نمی‌شود: پیش از این هر خطا به «لیست خالی» تبدیل می‌شد و
   * فراخوان نمی‌توانست «کالا عکس ندارد» را از «سرور در دسترس نیست» تشخیص دهد —
   * نتیجه‌اش این بود که در حالت آفلاین شمارنده عکس کالا صفر نشان داده می‌شد.
   */
  getPhotos(itemId: number): Observable<ItemPhoto[]> {
    return this.http.get<ItemPhoto[]>(`${this.baseUrl}/items/${itemId}/photos/`);
  }

  /**
   * دریافت لیست تصاویر مرتبط با یک تسک شمارش
   */
  getTaskPhotos(countTaskId: number): Observable<ItemPhoto[]> {
    return this.http.get<ItemPhoto[]>(`${this.baseUrl}/item-photos/?count_task_id=${countTaskId}`).pipe(
      catchError(err => {
        console.error('Error fetching count task photos:', err);
        return of([]);
      })
    );
  }

  /**
   * فشرده‌سازی در کلاینت، سپس آپلود عکس‌ها از مسیر صف پایدار
   *
   * ترتیب کار «اول ذخیره در IndexedDB، بعد ارسال» است. تنها ترتیبی که عکس
   * گرفته‌شده در انبار بی‌آنتن را حفظ می‌کند: اگر آپلود نگیرد (آفلاین، تونل
   * قطع، بسته شدن مرورگر) فایل در صف می‌ماند و با بازگشت اتصال خودش می‌رود.
   */
  async uploadPhotos(
    itemId: number,
    files: File[],
    options?: UploadPhotoOptions
  ): Promise<PhotoUploadResult> {
    if (!files || files.length === 0) {
      throw new Error('هیچ فایلی برای آپلود انتخاب نشده است.');
    }

    const userId = SyncPullService.getInstance().getCurrentUserId() ?? undefined;
    const queuedIds: number[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let blob: Blob = file;
      let fileName = file.name;
      let width: number | undefined;
      let height: number | undefined;

      try {
        const compressed = await this.compressor.compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.88,
        });
        blob = compressed.file;
        fileName = compressed.file.name;
        width = compressed.width;
        height = compressed.height;
        // پیش‌نمایش را از blobِ صف می‌سازیم، پس این آدرس مصرفی ندارد و اگر
        // آزاد نشود تا بسته‌شدن تب در حافظه می‌ماند.
        URL.revokeObjectURL(compressed.previewUrl);
      } catch (err) {
        // فشرده‌سازی در مرورگر شکست خورد (مثلاً HEIC که Canvas نمی‌شناسد).
        // فایل اصلی صف می‌شود، نه دور انداخته: سرور خودش سه سطح WebP می‌سازد.
        console.warn('[ItemPhoto] فشرده‌سازی ناموفق — فایل اصلی در صف قرار گرفت:', file.name, err);
        if (err instanceof ImageDecodeError && err.isHeif) {
          // سرور هم HEIC را نمی‌پذیرد. کاربر باید همین حالا بداند تا تنظیم دوربین
          // را عوض کند، نه اینکه ساعت‌ها بعد در انبار پیام «پذیرفته نشد» ببیند.
          warnings.push(`«${file.name}»: ${err.message}`);
        }
      }

      const entry = await this.queue.enqueue({
        itemId,
        blob,
        fileName,
        caption: options?.caption,
        sourceType: options?.source_type,
        countTaskId: options?.count_task_id,
        // فقط اولین عکس دسته می‌تواند شاخص شود؛ وگرنه هر ارسال شاخص را جابه‌جا می‌کرد
        isPrimary: options?.is_primary && i === 0 ? true : undefined,
        width,
        height,
        userId,
      });
      if (entry.id) queuedIds.push(entry.id);
    }

    // عکس‌هایی که در همین تخلیه ثبت شدند. اشتراک *قبل* از flush گرفته می‌شود
    // چون رویداد به‌صورت همگام و پیش از resolve شدن flush منتشر می‌شود.
    const created: ItemPhoto[] = [];
    const sub = this.queue.uploaded$.subscribe(event => {
      if (event.itemId === itemId) created.push(...event.photos);
    });
    try {
      // تلاش فوری برای ارسال؛ ناکامی‌اش خطا نیست چون فایل‌ها در صف محفوظ‌اند
      await this.queue.flush(options?.onProgress);
    } catch (err) {
      console.warn('[ItemPhoto] ارسال فوری نگرفت — عکس‌ها در صف ماندند:', err);
    } finally {
      sub.unsubscribe();
    }

    // وضعیت واقعی همین دسته را از صف بخوان — چه چیزی رفت، چه چیزی ماند
    const survivors = await this.queue.entriesForItem(itemId);
    const stillQueued = survivors.filter(e => e.id !== undefined && queuedIds.includes(e.id));

    return {
      created,
      queued: stillQueued.filter(e => e.status !== 'rejected'),
      rejected: stillQueued.filter(e => e.status === 'rejected'),
      warnings,
    };
  }

  /** تلاش مجدد برای عکسی که سرور رد کرده بود (به درخواست کاربر) */
  retryQueued(entryId: number): Promise<void> {
    return this.queue.retry(entryId);
  }

  /** حذف عکس نرسیده به سرور — فقط با تأیید صریح کاربر */
  discardQueued(entryId: number): Promise<void> {
    return this.queue.discard(entryId);
  }

  /** رکوردهای صف آپلود مربوط به یک کالا (منتظر ارسال + ردشده) */
  queuedForItem(itemId: number): Promise<PhotoQueueEntry[]> {
    return this.queue.entriesForItem(itemId);
  }

  /**
   * تعیین یک تصویر به عنوان تصویر شاخص کالا
   */
  setPrimary(photoId: number): Observable<ItemPhoto> {
    return this.http.patch<ItemPhoto>(`${this.baseUrl}/item-photos/${photoId}/set_primary/`, {});
  }

  /**
   * تغییر ترتیب تصاویر کالا
   */
  reorderPhotos(order: { id: number; display_order: number }[]): Observable<any> {
    return this.http.patch(`${this.baseUrl}/item-photos/reorder/`, { order });
  }

  /**
   * حذف نرم تصویر کالا
   */
  deletePhoto(photoId: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/item-photos/${photoId}/`);
  }
}
