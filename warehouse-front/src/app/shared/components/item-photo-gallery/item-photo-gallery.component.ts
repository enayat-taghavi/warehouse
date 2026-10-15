import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { ItemPhoto } from '../../../core/models/item.model';
import { ItemPhotoService, PhotoUploadResult } from '../../../core/services/item-photo.service';
import { PhotoQueueEntry } from '../../../core/services/offline-db';
import { ToastService } from '../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

@Component({
  selector: 'app-item-photo-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './item-photo-gallery.component.html',
  styleUrls: ['./item-photo-gallery.component.css']
})
export class ItemPhotoGalleryComponent implements OnInit, OnChanges, OnDestroy {
  @Input() itemId!: number;
  @Input() itemFaUnicCode: string = '';
  @Input() itemDescription: string = '';
  @Input() countTaskId?: number;
  @Input() isOpen: boolean = false;
  @Input() readOnly: boolean = false;

  @Output() close = new EventEmitter<void>();
  @Output() photosChanged = new EventEmitter<ItemPhoto[]>();

  @ViewChild('cameraInput') cameraInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('galleryInput') galleryInputRef!: ElementRef<HTMLInputElement>;

  private photoService = inject(ItemPhotoService);
  private toast = inject(ToastService);

  /**
   * عکس‌های ثبت‌شده روی سرور — تنها منبعی که به بیرون emit می‌شود.
   * والدها با این خروجی شمارنده و بندانگشتی کالا را می‌سازند، پس ردیف‌های
   * کلاینتیِ صف نباید واردش شوند وگرنه شمارنده عددی نشان می‌دهد که روی سرور نیست.
   */
  private readonly serverPhotos = signal<ItemPhoto[]>([]);

  /** ردیف‌های صف آپلود (نرسیده به سرور یا ردشده) — فقط داخل همین گالری دیده می‌شوند */
  private readonly queuedPhotos = signal<ItemPhoto[]>([]);

  /** نمای واحد گالری: عکس‌های سرور + عکس‌های در صف */
  readonly photos = computed(() => [...this.serverPhotos(), ...this.queuedPhotos()]);

  readonly serverPhotoCount = computed(() => this.serverPhotos().length);
  readonly pendingPhotoCount = computed(() => this.queuedPhotos().filter(p => p._isUploading).length);
  readonly rejectedPhotoCount = computed(() => this.queuedPhotos().filter(p => !!p._error).length);

  readonly selectedIndex = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly isUploading = signal<boolean>(false);
  readonly uploadProgress = signal<number>(0);
  readonly isDragging = signal<boolean>(false);

  // Zoom & Pan state for inspector
  readonly zoomLevel = signal<number>(1);
  readonly rotation = signal<number>(0);

  // Inline deletion confirmation state
  readonly pendingDeletePhotoId = signal<number | null>(null);
  readonly isDeleting = signal<boolean>(false);

  /** عکسی که در انتظار تأیید حذف است هنوز به سرور نرسیده (شناسه منفی) */
  readonly pendingDeleteIsQueued = computed(() => (this.pendingDeletePhotoId() ?? 0) < 0);

  // Active photo
  readonly activePhoto = computed(() => {
    const list = this.photos();
    const idx = this.selectedIndex();
    return list.length > 0 && idx >= 0 && idx < list.length ? list[idx] : null;
  });

  private subs = new Subscription();

  /**
   * آدرس پیش‌نمایش هر رکورد صف، کلید‌شده با id همان رکورد.
   * کش‌کردن لازم است: با ساختن URL تازه در هر رندر، آدرس‌های قبلی تا بسته شدن
   * تب در حافظه می‌ماندند (نشتی حافظه در گوشی انبارگردان) و تصویر هم پرش می‌کرد.
   */
  private previewUrls = new Map<number, string>();

  ngOnInit(): void {
    // عکسی که در پس‌زمینه و پس از بازگشت اتصال ثبت می‌شود باید فوراً دیده شود؛
    // وگرنه کاربر گالری را باز می‌دید و عکسش را نمی‌یافت.
    this.subs.add(
      this.photoService.uploaded$.subscribe(event => {
        if (event.itemId !== this.itemId) return;
        this.serverPhotos.update(list => this.mergeServerPhotos(list, event.photos));
        this.photosChanged.emit(this.serverPhotos());
      })
    );
    this.subs.add(
      this.photoService.queueChanged$.subscribe(() => {
        if (this.isOpen && this.itemId) this.refreshQueued();
      })
    );

    if (this.isOpen && this.itemId) {
      this.loadPhotos();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen && this.itemId) {
      this.resetViewerState();
      this.loadPhotos();
    } else if (changes['itemId'] && this.isOpen && this.itemId) {
      this.resetViewerState();
      this.loadPhotos();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.releasePreviewUrls(new Set());
  }

  resetViewerState(): void {
    this.zoomLevel.set(1);
    this.rotation.set(0);
    this.selectedIndex.set(0);
    this.uploadProgress.set(0);
    this.isUploading.set(false);
    this.pendingDeletePhotoId.set(null);
    this.isDeleting.set(false);
  }

  async loadPhotos(): Promise<void> {
    if (!this.itemId) return;
    this.isLoading.set(true);

    // صف را همیشه و مستقل از سرور بخوان: عکس نرسیده به سرور هم عکس کاربر است و
    // باید دیده شود، حتی وقتی تونل قطع است.
    await this.refreshQueued();

    try {
      const data = await firstValueFrom(this.photoService.getPhotos(this.itemId));
      this.serverPhotos.set(data);
      this.photosChanged.emit(data);
      this.focusPrimary();
    } catch (err) {
      // لیست قبلی و ردیف‌های صف دست‌نخورده می‌مانند و چیزی emit نمی‌شود:
      // صفر کردن شمارنده عکس کالا در حالت آفلاین یعنی نمایش داده نادرست.
      console.warn('[Gallery] دریافت لیست عکس‌های سرور نگرفت:', err);
      if (this.photos().length > 0) {
        this.toast.warning('لیست عکس‌ها از سرور تازه نشد — عکس‌های موجود نمایش داده می‌شوند.');
      } else {
        this.toast.error('خطا در دریافت لیست تصاویر کالا');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  triggerCamera(): void {
    if (this.readOnly || this.isUploading()) return;
    this.cameraInputRef?.nativeElement?.click();
  }

  triggerGallery(): void {
    if (this.readOnly || this.isUploading()) return;
    this.galleryInputRef?.nativeElement?.click();
  }

  onFilesSelected(event: Event, sourceType: 'camera' | 'gallery'): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const fileList = Array.from(input.files);
      this.uploadFiles(fileList, sourceType);
      // Reset input value so same files can be reselected if needed
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.readOnly && !this.isUploading()) {
      this.isDragging.set(true);
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (this.readOnly || this.isUploading()) return;

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (droppedFiles.length > 0) {
        this.uploadFiles(droppedFiles, 'gallery');
      } else {
        this.toast.warning('لطفاً فقط فایل‌های تصویری معتبر انتخاب نمایید.');
      }
    }
  }

  /**
   * ثبت عکس‌های انتخاب‌شده
   *
   * سرویس، فایل را *اول* در صف پایدار می‌نشاند و بعد ارسال می‌کند؛ پس هیچ
   * مسیری در این متد نباید ردیفی را از لیست بیرون بیندازد. پیش از این، شکست
   * آپلود پیش‌نمایش‌ها را پاک می‌کرد و کاربر باور می‌کرد عکسش از بین رفته.
   */
  async uploadFiles(files: File[], sourceType: 'camera' | 'gallery'): Promise<void> {
    if (!this.itemId || files.length === 0) return;

    this.isUploading.set(true);
    this.uploadProgress.set(10);

    try {
      // فشرده‌سازی و ساخت پیش‌نمایش داخل خود سرویس انجام می‌شود. پیش از این
      // همین کار دو بار تکرار می‌شد (یک بار برای پیش‌نمایش، یک بار برای ارسال)
      // و روی گوشی، برای هر عکس دو بار Canvas تمام‌قد ساخته می‌شد.
      const result = await this.photoService.uploadPhotos(this.itemId, files, {
        source_type: sourceType,
        count_task_id: this.countTaskId,
        onProgress: percent => this.uploadProgress.set(Math.max(10, percent)),
      });
      this.uploadProgress.set(100);
      this.reportUploadResult(result);
    } catch (err: any) {
      console.error('[Gallery] آپلود عکس ناموفق:', err);
      this.toast.error(err?.message || 'خطا در آپلود تصاویر');
    } finally {
      this.isUploading.set(false);
      await this.loadPhotos();
    }
  }

  /**
   * گزارش صادقانه نتیجه آپلود
   *
   * پیش از این همیشه «n تصویر با موفقیت ثبت شد» گفته می‌شد؛ حتی وقتی سرور فقط
   * یکی را پذیرفته یا هیچ‌کدام نرفته بود. «در صف ماند» و «ثبت شد» یکی نیستند.
   */
  private reportUploadResult(result: PhotoUploadResult): void {
    const { created, queued, rejected, warnings } = result;

    // هشدار قالب (HEIC) اول گفته می‌شود: تا کاربر تنظیم دوربین را عوض نکند،
    // هر عکس بعدی هم همین سرنوشت را دارد.
    for (const warning of warnings) {
      this.toast.warning(warning);
    }

    if (created.length > 0) {
      this.toast.success(`${created.length} تصویر ثبت شد.`);
    }
    if (queued.length > 0) {
      this.toast.warning(
        `${queued.length} تصویر در صف ماند و با برقراری اتصال به‌صورت خودکار ارسال می‌شود.`
      );
    }
    if (rejected.length > 0) {
      this.toast.error(
        `${rejected.length} تصویر پذیرفته نشد: ${rejected[0].lastError || 'خطای نامشخص سرور'}`
      );
    }
    if (created.length === 0 && queued.length === 0 && rejected.length === 0) {
      this.toast.info('تصویری ثبت نشد.');
    }
  }

  /** بازگرداندن عکس ردشده به نوبت ارسال (به درخواست کاربر) */
  async retryQueued(photo: ItemPhoto, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    const entryId = photo._queueEntryId;
    if (!entryId || this.readOnly) return;

    try {
      await this.photoService.retryQueued(entryId);
      this.toast.info('عکس دوباره در نوبت ارسال قرار گرفت.');
    } catch {
      this.toast.error('تلاش مجدد ناموفق بود.');
    }
    await this.refreshQueued();
  }

  setPrimary(photo: ItemPhoto, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    // عکس در صف روی سرور وجود ندارد، پس شاخص‌شدن هم برایش معنا ندارد
    if (this.readOnly || !photo.id || photo.id < 0 || photo.is_primary) return;

    this.photoService.setPrimary(photo.id).subscribe({
      next: () => {
        this.serverPhotos.update(list =>
          list.map(p => ({
            ...p,
            is_primary: p.id === photo.id
          }))
        );
        this.toast.success('تصویر به عنوان عکس شاخص کالا تنظیم شد.');
        this.photosChanged.emit(this.serverPhotos());
      },
      error: () => {
        this.toast.error('خطا در تنظیم تصویر شاخص');
      }
    });
  }

  requestDelete(photo: ItemPhoto, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.readOnly || photo.id === undefined || this.isDeleting()) return;
    this.pendingDeletePhotoId.set(photo.id);
  }

  cancelDelete(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.pendingDeletePhotoId.set(null);
  }

  /**
   * حذف با تأیید صریح کاربر
   *
   * شناسه منفی یعنی ردیف صف: روی سرور وجود ندارد و تنها نسخه آن فایل همان است،
   * پس فقط با همین تأیید صریح از IndexedDB پاک می‌شود.
   */
  async confirmDelete(event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    const photoId = this.pendingDeletePhotoId();
    if (photoId === null || this.isDeleting()) return;

    this.isDeleting.set(true);
    try {
      if (photoId < 0) {
        await this.photoService.discardQueued(-photoId);
        await this.refreshQueued();
        this.toast.success('عکس نرسیده به سرور از صف حذف شد.');
      } else {
        await firstValueFrom(this.photoService.deletePhoto(photoId));
        this.serverPhotos.update(list => list.filter(p => p.id !== photoId));
        this.photosChanged.emit(this.serverPhotos());
        this.toast.success('تصویر کالا با موفقیت حذف شد.');
      }

      this.pendingDeletePhotoId.set(null);
      const currLen = this.photos().length;
      if (this.selectedIndex() >= currLen) {
        this.selectedIndex.set(Math.max(0, currLen - 1));
      }
    } catch (err) {
      console.error('[Gallery] حذف تصویر ناموفق:', err);
      this.toast.error('خطا در حذف تصویر کالا');
    } finally {
      this.isDeleting.set(false);
    }
  }

  zoomIn(): void {
    this.zoomLevel.update(z => Math.min(3, +(z + 0.25).toFixed(2)));
  }

  zoomOut(): void {
    this.zoomLevel.update(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
    this.rotation.set(0);
  }

  rotate(): void {
    this.rotation.update(r => (r + 90) % 360);
  }

  selectPhoto(index: number): void {
    this.selectedIndex.set(index);
    this.resetZoom();
  }

  nextPhoto(): void {
    const list = this.photos();
    if (list.length === 0) return;
    this.selectedIndex.update(idx => (idx + 1) % list.length);
    this.resetZoom();
  }

  prevPhoto(): void {
    const list = this.photos();
    if (list.length === 0) return;
    this.selectedIndex.update(idx => (idx - 1 + list.length) % list.length);
    this.resetZoom();
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** شناسه پایدار برای ngFor — با آن، رندر دوباره تصویر و پرش اسکرول رخ نمی‌دهد */
  trackPhoto(_index: number, photo: ItemPhoto): number | string {
    return photo.id ?? photo.sync_id ?? _index;
  }

  closeModal(): void {
    this.close.emit();
  }

  // ════════════════════════════════════════════
  //  صف آپلود
  // ════════════════════════════════════════════

  /** خواندن رکوردهای صف این کالا و تبدیلشان به ردیف قابل‌نمایش */
  private async refreshQueued(): Promise<void> {
    let entries: PhotoQueueEntry[];
    try {
      entries = await this.photoService.queuedForItem(this.itemId);
    } catch (err) {
      // ردیف‌های قبلی حفظ می‌شوند؛ خطای خواندن دلیلی برای پنهان‌کردن عکس نیست
      console.warn('[Gallery] خواندن صف عکس نگرفت:', err);
      return;
    }

    const usable = entries.filter(e => e.id !== undefined);
    this.queuedPhotos.set(usable.map((entry, offset) => this.toDisplayRow(entry, offset)));
    this.releasePreviewUrls(new Set(usable.map(e => e.id!)));
  }

  /** ساخت یک ردیف نمایشی از رکورد صف (روی سرور وجود ندارد) */
  private toDisplayRow(entry: PhotoQueueEntry, offset: number): ItemPhoto {
    const url = this.previewUrlFor(entry);
    const rejected = entry.status === 'rejected';

    return {
      // شناسه منفی و *قطعی* بر پایه id صف؛ نه تصادفی. با شناسه تصادفی، هر بار
      // ساخت لیست ردیف را «جدید» می‌کرد و تصویر از نو دانلود/رندر می‌شد.
      id: -entry.id!,
      _queueEntryId: entry.id,
      item: entry.itemId,
      image_url: url,
      medium_url: url,
      thumbnail_url: url,
      caption: entry.caption,
      // شاخص‌بودن را سرور تعیین می‌کند؛ ستاره زدن روی عکس نرسیده گمراه‌کننده است
      is_primary: false,
      display_order: this.serverPhotos().length + offset,
      file_size: entry.blob.size,
      width: entry.width,
      height: entry.height,
      source_type: entry.sourceType ?? 'gallery',
      count_task: entry.countTaskId,
      created_at: new Date(entry.createdAt).toISOString(),
      _previewUrl: url,
      _isUploading: !rejected,
      _error: rejected ? (entry.lastError || 'سرور این عکس را رد کرد') : undefined,
    };
  }

  private previewUrlFor(entry: PhotoQueueEntry): string {
    const existing = this.previewUrls.get(entry.id!);
    if (existing) return existing;
    const url = URL.createObjectURL(entry.blob);
    this.previewUrls.set(entry.id!, url);
    return url;
  }

  /** آزادسازی آدرس‌های پیش‌نمایشی که رکوردشان دیگر در صف نیست */
  private releasePreviewUrls(keep: Set<number>): void {
    for (const [entryId, url] of Array.from(this.previewUrls.entries())) {
      if (!keep.has(entryId)) {
        URL.revokeObjectURL(url);
        this.previewUrls.delete(entryId);
      }
    }
  }

  /** افزودن عکس‌های تازه‌ثبت‌شده بدون ایجاد ردیف تکراری */
  private mergeServerPhotos(current: ItemPhoto[], incoming: ItemPhoto[]): ItemPhoto[] {
    const known = new Set(current.map(p => p.id));
    return [...current, ...incoming.filter(p => !known.has(p.id))];
  }

  private focusPrimary(): void {
    const list = this.photos();
    if (list.length === 0) {
      this.selectedIndex.set(0);
      return;
    }
    const primaryIdx = list.findIndex(p => p.is_primary);
    this.selectedIndex.set(primaryIdx >= 0 ? primaryIdx : 0);
  }
}
