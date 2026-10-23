import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, Output, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { resolveServerUrl } from '../../../core/platform/server-origin';
import { saveUrl } from '../../../core/platform/file-output';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ServerUrlPipe } from '../../pipes/server-url.pipe';
import { OverflowMenuComponent } from '../overflow-menu/overflow-menu.component';

let nextPreviewId = 0;

/** مدرکی که پیش‌نمایش می‌شود: عنوان و نشانی فایل (نسبی یا مطلق) */
export interface DocumentPreviewSource {
  title: string;
  url: string;
}

/**
 * لایت‌باکس پیش‌نمایش درجای مدرک (PDF روی بوم با pdf.js و فال‌بک iframe، تصویر با زوم، چرخش و جابه‌جایی).
 * میزبان آن را یک بار در قالب می‌گذارد و با `open()` باز می‌کند.
 * جابه‌جایی و زوم دوانگشتی با pointer events؛ در موبایل تمام‌صفحه است و با Esc یا دکمهٔ برگشت مرورگر بسته می‌شود.
 */
@Component({
  selector: 'app-document-preview',
  standalone: true,
  imports: [CommonModule, SvgIconDirective, ServerUrlPipe, OverflowMenuComponent],
  templateUrl: './document-preview.component.html'
})
export class DocumentPreviewComponent implements OnDestroy {
  private http = inject(HttpClient, { optional: true });
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  /** پس از بسته شدن لایت‌باکس */
  @Output() closed = new EventEmitter<void>();

  @ViewChild('dialogPanel') private dialogPanel?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;

  readonly titleId = `document-preview-title-${nextPreviewId++}`;

  /** کلاس ابزارهای نوار: در موبایل ردیف برچسب‌دار منوی «بیشتر»، از sm دکمهٔ آیکونی تیره */
  readonly toolButtonClass =
    'flex items-center gap-2 w-full min-h-[40px] px-3 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
    'sm:w-10 sm:h-10 sm:min-h-0 sm:px-0 sm:justify-center lg:w-8 lg:h-8 sm:text-slate-300 sm:bg-slate-800/80 sm:border sm:border-slate-700/80 sm:hover:bg-slate-700 sm:hover:text-white';

  /** ورودی برگشت مرورگر که هنگام باز شدن افزوده شده و هنوز مصرف نشده است */
  private historyPushed = false;
  /** popstateهایی که از history.back() خود ما می‌آیند و باید نادیده گرفته شوند */
  private pendingBackPops = 0;
  private returnFocusTo: HTMLElement | null = null;
  private focusTimeoutId: any = null;

  /** اشاره‌گرهای فعال (ماوس، قلم یا انگشت) برای جابه‌جایی و زوم دوانگشتی */
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartScale = 1;
  isPinching = false;
  /** مقیاس بوم PDF هنگام زوم دوانگشتی ثبت می‌شود تا تا رندر دوباره، بزرگ‌نمایی زنده با CSS دیده شود */
  private pinchRenderedScale = 1;

  /** بازخورد زندهٔ زوم دوانگشتی روی بوم PDF؛ پس از رندر دوباره ۱ است */
  get pinchCanvasScale(): number {
    return this.isPinching && this.pinchRenderedScale > 0 ? +(this.previewScale / this.pinchRenderedScale).toFixed(3) : 1;
  }

  private pdfTimeoutId: any = null;

  // کنترل‌های پیش‌رفته لایت‌باکس پیش‌نمایش درجا (زوم، پن، جابجایی، تمام‌صفحه و رندر اختصاصی بوم بدون فعال‌سازی IDM)
  isLoadingPreview = false;
  previewScale = 1.0;
  previewRotation = 0;
  isFullscreenPreview = false;
  isPdfLoading = false;
  pdfCurrentPage = 1;
  pdfTotalPages = 1;
  pdfDoc: any = null;
  pdfRenderTask: any = null;
  panX = 0;
  panY = 0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  useIframeFallback = false;

  previewBlobUrl: string | null = null;
  previewModal: {
    isOpen: boolean;
    title: string;
    fileUrl: string;
    safeFileUrl: SafeResourceUrl | null;
    isPdf: boolean;
    isImage: boolean;
  } = {
    isOpen: false,
    title: '',
    fileUrl: '',
    safeFileUrl: null,
    isPdf: false,
    isImage: false
  };

  ngOnDestroy(): void {
    // اگر میزبان با ناوبری از بین برود، history.back() زده نمی‌شود تا ناوبری کاربر برنگردد.
    this.historyPushed = false;
    if (this.focusTimeoutId) {
      clearTimeout(this.focusTimeoutId);
      this.focusTimeoutId = null;
    }
    if (this.pdfTimeoutId) {
      clearTimeout(this.pdfTimeoutId);
      this.pdfTimeoutId = null;
    }
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
  }

  @HostListener('window:keydown.escape')
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.previewModal.isOpen) {
      this.closePreview();
    }
  }

  /** دکمهٔ برگشت مرورگر (یا اشارهٔ برگشت گوشی) پیش‌نمایش را می‌بندد و از صفحه بیرون نمی‌رود */
  @HostListener('window:popstate')
  onPopState(): void {
    if (this.pendingBackPops > 0) {
      this.pendingBackPops--;
      return;
    }
    if (this.previewModal.isOpen && this.historyPushed) {
      this.historyPushed = false;
      this.closePreview();
    }
  }

  /** تله‌کانون: Tab و Shift+Tab درون پنجره می‌چرخند */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.dialogPanel) return;
    const panel = this.dialogPanel.nativeElement;
    const all = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])')
    );
    // عنصر پنهان (مثلاً گزینه‌های منوی بستهٔ «بیشتر» در موبایل) جعبه‌ای ندارد؛ بدون چیدمان (jsdom) همه حساب می‌شوند.
    const visible = all.filter(el => el.getClientRects().length > 0);
    const focusables = visible.length > 0 ? visible : all;
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = !!active && panel.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  // پیش‌نمایش درجا (In-Place Preview)
  open(doc: DocumentPreviewSource): void {
    const url = doc.url;
    const wasOpen = this.previewModal.isOpen;

    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }

    const isPdf = url.toLowerCase().includes('.pdf') || Boolean(doc.title && doc.title.toLowerCase().includes('.pdf'));
    const isImage = /\.(jpe?g|png|webp|svg|gif|bmp)(\?.*)?$/i.test(url) || Boolean(doc.title && /\.(jpe?g|png|webp|svg|gif|bmp)$/i.test(doc.title));

    // تبدیل آدرس‌های مطلق به مسیر نسبی جهت عبور بهینه از پروکسی و جلوگیری از خطای هم‌مبدایی فریم‌ها
    let cleanUrl = url;
    const mediaIdx = cleanUrl.indexOf('/media/');
    if (mediaIdx !== -1 && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
      cleanUrl = cleanUrl.substring(mediaIdx);
    } else if (cleanUrl.startsWith('http://127.0.0.1:8000') || cleanUrl.startsWith('http://localhost:8000')) {
      cleanUrl = cleanUrl.replace(/^https?:\/\/(127\.0\.0\.1|localhost):8000/, '');
    }
    cleanUrl = resolveServerUrl(cleanUrl);

    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.isFullscreenPreview = false;
    this.useIframeFallback = false;

    this.previewModal = {
      isOpen: true,
      title: doc.title,
      fileUrl: cleanUrl,
      safeFileUrl: cleanUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(cleanUrl) : null,
      isPdf,
      isImage
    };
    this.isLoadingPreview = false;
    this.activePointers.clear();
    this.isPinching = false;
    this.isDragging = false;
    this.cdr.markForCheck();

    if (!wasOpen) {
      const active = document.activeElement;
      this.returnFocusTo = active instanceof HTMLElement ? active : null;
      this.pushHistoryEntry();
      if (this.focusTimeoutId) clearTimeout(this.focusTimeoutId);
      this.focusTimeoutId = setTimeout(() => {
        this.focusTimeoutId = null;
        this.closeButton?.nativeElement.focus({ preventScroll: true });
      }, 0);
    }

    if (isPdf) {
      if (this.pdfTimeoutId) {
        clearTimeout(this.pdfTimeoutId);
      }
      this.pdfTimeoutId = setTimeout(() => {
        this.loadPdfWithPdfJs(cleanUrl);
      }, 50);
    }
  }

  async loadPdfWithPdfJs(url: string): Promise<void> {
    try {
      this.isPdfLoading = true;
      this.cdr.markForCheck();

      // دانلود مستقیم باینری با استفاده از HttpClient و رعایت توکن‌های احراز هویت
      let buffer: ArrayBuffer;
      if (this.http) {
        buffer = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
      } else {
        const res = await fetch(resolveServerUrl(url));
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        buffer = await res.arrayBuffer();
      }

      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        cMapPacked: true
      });

      this.pdfDoc = await loadingTask.promise;
      this.pdfTotalPages = this.pdfDoc.numPages || 1;
      this.pdfCurrentPage = 1;
      await this.renderPdfPage(1);
    } catch (err: any) {
      console.warn('PDF.js rendering fallback to native iframe:', err);
      this.isPdfLoading = false;
      this.useIframeFallback = true;
      this.cdr.markForCheck();
    }
  }

  async renderPdfPage(pageNumber: number): Promise<void> {
    if (!this.pdfDoc) return;
    try {
      this.isPdfLoading = true;
      this.cdr.markForCheck();

      if (this.pdfRenderTask) {
        try {
          this.pdfRenderTask.cancel();
        } catch (_) {}
        this.pdfRenderTask = null;
      }

      const page = await this.pdfDoc.getPage(pageNumber);
      const canvas = document.getElementById('pdf-render-canvas') as HTMLCanvasElement;
      if (!canvas) {
        this.isPdfLoading = false;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.isPdfLoading = false;
        return;
      }

      const viewport = page.getViewport({ scale: this.previewScale, rotation: this.previewRotation });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      this.pdfRenderTask = page.render(renderContext);
      await this.pdfRenderTask.promise;
      this.pdfCurrentPage = pageNumber;
      this.isPdfLoading = false;
      this.cdr.markForCheck();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Render page error:', err);
      }
      this.isPdfLoading = false;
      this.cdr.markForCheck();
    }
  }

  zoomIn(): void {
    this.previewScale = Math.min(3.0, +(this.previewScale + 0.25).toFixed(2));
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  zoomOut(): void {
    this.previewScale = Math.max(0.5, +(this.previewScale - 0.25).toFixed(2));
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  resetZoom(): void {
    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  rotatePreview(): void {
    this.previewRotation = (this.previewRotation + 90) % 360;
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  toggleFullscreen(): void {
    this.isFullscreenPreview = !this.isFullscreenPreview;
    this.cdr.markForCheck();
  }

  nextPdfPage(): void {
    if (this.pdfCurrentPage < this.pdfTotalPages) {
      this.pdfCurrentPage++;
      this.renderPdfPage(this.pdfCurrentPage);
    }
  }

  prevPdfPage(): void {
    if (this.pdfCurrentPage > 1) {
      this.pdfCurrentPage--;
      this.renderPdfPage(this.pdfCurrentPage);
    }
  }

  /** شروع جابه‌جایی با یک اشاره‌گر یا زوم با دو انگشت */
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // روی دکمه یا پیوند درون بدنه، اشاره‌گر گرفته نمی‌شود تا کلیک آن گم نشود.
    if ((event.target as Element | null)?.closest?.('button, a')) return;
    const surface = event.currentTarget as Element | null;
    try {
      surface?.setPointerCapture?.(event.pointerId);
    } catch {}
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size >= 2) {
      this.isDragging = false;
      this.isPinching = true;
      this.pinchStartDistance = this.pointerDistance();
      this.pinchStartScale = this.previewScale;
      this.pinchRenderedScale = this.previewScale;
    } else {
      this.beginDrag(event.clientX, event.clientY);
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.isPinching && this.activePointers.size >= 2) {
      const distance = this.pointerDistance();
      if (this.pinchStartDistance > 0) {
        const scale = this.pinchStartScale * (distance / this.pinchStartDistance);
        this.previewScale = Math.min(3.0, Math.max(0.5, +scale.toFixed(2)));
        this.cdr.markForCheck();
      }
      return;
    }
    if (!this.isDragging) return;
    this.panX = event.clientX - this.dragStartX;
    this.panY = event.clientY - this.dragStartY;
    this.cdr.markForCheck();
  }

  /** پایان اشاره (بلند شدن انگشت، رها کردن ماوس یا لغو از سوی مرورگر) */
  onPointerUp(event: PointerEvent): void {
    if (!this.activePointers.delete(event.pointerId)) return;
    if (this.isPinching && this.activePointers.size < 2) {
      this.isPinching = false;
      // بوم PDF فقط پس از پایان زوم دوباره رندر می‌شود؛ تصویر با CSS زنده بزرگ می‌شود.
      if (this.previewModal.isPdf && this.pdfDoc) {
        this.renderPdfPage(this.pdfCurrentPage);
      }
      const remaining = this.activePointers.values().next().value;
      if (remaining) {
        this.beginDrag(remaining.x, remaining.y);
      }
      this.cdr.markForCheck();
      return;
    }
    if (this.activePointers.size === 0) {
      this.isDragging = false;
    }
  }

  private beginDrag(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.dragStartX = clientX - this.panX;
    this.dragStartY = clientY - this.panY;
  }

  private pointerDistance(): number {
    const [a, b] = Array.from(this.activePointers.values());
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pushHistoryEntry(): void {
    if (typeof window === 'undefined' || !window.history?.pushState) return;
    try {
      // state پیشین (navigationId روتر) حفظ می‌شود تا برگشت به همان نشانی ناوبری تازه‌ای نسازد.
      const current = window.history.state;
      const state = current && typeof current === 'object' ? current : {};
      window.history.pushState({ ...state, documentPreview: true }, '');
      this.historyPushed = true;
    } catch {
      this.historyPushed = false;
    }
  }

  /** رقم فارسی برای شمارهٔ صفحه، درصد و درجه */
  fa(value: number): string {
    return new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(value);
  }

  downloadFile(url?: string | null, filename?: string): void {
    if (url) {
      void saveUrl(url, filename);
    }
  }

  closePreview(): void {
    const wasOpen = this.previewModal.isOpen;
    if (this.pdfTimeoutId) {
      clearTimeout(this.pdfTimeoutId);
      this.pdfTimeoutId = null;
    }
    if (this.pdfRenderTask) {
      try {
        this.pdfRenderTask.cancel();
      } catch (_) {}
      this.pdfRenderTask = null;
    }
    this.pdfDoc = null;
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.isLoadingPreview = false;
    this.previewModal = {
      isOpen: false,
      title: '',
      fileUrl: '',
      safeFileUrl: null,
      isPdf: false,
      isImage: false
    };
    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.isFullscreenPreview = false;
    this.isPdfLoading = false;
    this.useIframeFallback = false;
    this.activePointers.clear();
    this.isPinching = false;
    this.isDragging = false;
    if (this.focusTimeoutId) {
      clearTimeout(this.focusTimeoutId);
      this.focusTimeoutId = null;
    }
    this.cdr.markForCheck();
    if (this.historyPushed) {
      // ورودی‌ای که هنگام باز شدن افزوده شد برداشته می‌شود؛ popstate حاصل نادیده گرفته می‌شود.
      this.historyPushed = false;
      this.pendingBackPops++;
      window.history.back();
    }
    if (wasOpen) {
      const target = this.returnFocusTo;
      this.returnFocusTo = null;
      if (target?.isConnected) {
        target.focus({ preventScroll: true });
      }
      this.closed.emit();
    }
  }
}
