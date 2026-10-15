import { ItemPhoto } from '../../../../core/models/item.model';

/**
 * وضعیت و منطق مشترک «میزبانِ گالری عکس»
 *
 * چرا این فایل ساخته شد: شش صفحه (کاردکس اسناد، رهگیری شمارش، تخصیص، شمارشگر،
 * سرپرست، مدیر) هر کدام یک کپی از همان ۴۵ خط باز/بسته/به‌روزرسانی را داشتند.
 * نتیجه‌اش این بود که هر اصلاح باید شش بار تکرار می‌شد و در عمل نمی‌شد؛ همین
 * حالا هم نسخه‌ها با هم فرق داشتند و دو ایراد واقعی در بعضی‌شان مانده بود
 * (پایین‌تر مستند شده). حالا یک نسخه هست و همه از آن استفاده می‌کنند.
 *
 * چرا کلاس ساده و نه سرویس `providedIn: 'root'`: این وضعیت متعلق به یک صفحه
 * است. نمونهٔ مشترک بین دو صفحهٔ همزمان‌مونت‌شده، شناسه کالای هم را بازنویسی
 * می‌کرد و گالری روی کالای اشتباه باز می‌شد.
 */

/** ردیف لیست — کالا یا تسک؛ شکل دقیقش در هر صفحه متفاوت است */
type PhotoRow = Record<string, any> | null | undefined;

export interface PhotoSummary {
  count: number;
  thumbUrl: string | null;
}

/**
 * خلاصه‌ای که لیست‌ها برای نمایش بندانگشتی لازم دارند
 *
 * `_previewUrl` هم خوانده می‌شود تا اگر روزی ردیف کلاینتی به این تابع رسید،
 * دست‌کم تصویری نشان داده شود؛ گالری فعلاً فقط عکس‌های سرور را emit می‌کند.
 */
export function summarizePhotos(photos: ItemPhoto[] | null | undefined): PhotoSummary {
  const list = photos ?? [];
  if (list.length === 0) return { count: 0, thumbUrl: null };
  const active = list.find(p => p.is_primary) ?? list[0];
  return {
    count: list.length,
    thumbUrl:
      active.thumbnail_url || active.medium_url || active.image_url || active._previewUrl || null,
  };
}

/**
 * شناسهٔ *کالای* یک ردیف
 *
 * نسخهٔ قبلی در همهٔ صفحه‌ها `row.item || row.item_details?.id || row.id`
 * می‌نوشت. برای تسکی که `item` و `item_details` هر دو خالی بودند (ردیف
 * کش‌شدهٔ آفلاین یا پاسخ سبک سرور) این عبارت *شناسهٔ تسک* را به‌جای شناسهٔ کالا
 * برمی‌گرداند: گالری کالای دیگری باز می‌شد و عکس انبارگردان روی کالای اشتباه
 * ثبت می‌شد. حالا `row.id` فقط برای ردیفی خوانده می‌شود که واقعاً خودِ کالاست.
 */
export function rowItemId(row: PhotoRow): number | null {
  if (!row) return null;
  const isTaskRow = 'item' in row || 'item_details' in row;
  const raw = isTaskRow ? (row['item'] ?? row['item_details']?.id) : row['id'];
  return typeof raw === 'number' && raw > 0 ? raw : null;
}

export class PhotoGalleryHost {
  isOpen = false;
  itemId: number | null = null;
  itemCode = '';
  itemDescription = '';
  countTaskId?: number;

  /** `warn` تزریق می‌شود تا این کلاس به ToastService و Angular DI وابسته نشود */
  constructor(private readonly warn?: (message: string) => void) {}

  /**
   * باز کردن گالری برای یک ردیف
   *
   * `countTaskId` عمداً پارامتر صریح است و از خود ردیف حدس زده نمی‌شود: در
   * صفحه‌های مدیر و سرپرست همین متد هم برای تسک شمارش و هم برای تسک سند صدا
   * زده می‌شود، و نسخهٔ قبلی در هر دو حالت `task.id` را به‌عنوان شناسهٔ تسکِ
   * *شمارش* می‌فرستاد — یعنی شناسهٔ یک DocTask به فیلدی می‌رفت که به CountTask
   * اشاره دارد. (سرور این لینک نامعتبر را دور می‌اندازد، ولی نباید فرستاده شود.)
   */
  open(row: PhotoRow, event?: MouseEvent, countTaskId?: number): void {
    if (event) event.stopPropagation();

    const itemId = rowItemId(row);
    if (itemId === null) {
      this.warn?.('شناسهٔ کالای این ردیف نامعتبر است — آلبوم تصاویر باز نشد.');
      return;
    }

    const details = row?.['item_details'];
    this.itemId = itemId;
    this.itemCode = details?.fa_unic_code || row?.['fa_unic_code'] || '';
    this.itemDescription = details?.description || row?.['description'] || '';
    this.countTaskId = typeof countTaskId === 'number' && countTaskId > 0 ? countTaskId : undefined;
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.itemId = null;
    this.itemCode = '';
    this.itemDescription = '';
    this.countTaskId = undefined;
  }

  /**
   * نوشتن شمارنده و بندانگشتی روی هر ردیفی که *همین* کالا است
   *
   * شرط تطبیق شناسهٔ کالا حذف‌شدنی نیست: در صفحه‌های مدیر و سرپرست، ردیف
   * «تسک بازشده در جزئیات» بی‌قید‌و‌شرط به‌روز می‌شد، پس اگر کاربر گالری را از
   * یک ردیف لیست باز می‌کرد، شمارندهٔ عکسِ آن کالا روی تسکِ بازِ دیگری نوشته
   * می‌شد و کاربر عددی می‌دید که به کالای مقابلش مربوط نبود.
   */
  apply(
    photos: ItemPhoto[] | null | undefined,
    ...sources: (PhotoRow[] | PhotoRow)[]
  ): PhotoSummary {
    const summary = summarizePhotos(photos);
    if (this.itemId === null) return summary;

    for (const source of sources) {
      const rows = Array.isArray(source) ? source : [source];
      for (const row of rows) {
        if (!row || rowItemId(row) !== this.itemId) continue;
        // ردیف تسک، خلاصه را داخل item_details نگه می‌دارد؛ ردیف کالا روی خودش
        const target = row['item_details'] ?? row;
        target['photos_count'] = summary.count;
        target['primary_thumbnail'] = summary.thumbUrl;
      }
    }

    return summary;
  }
}
