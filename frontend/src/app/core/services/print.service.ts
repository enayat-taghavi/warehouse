import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { FileOutputService } from '../platform/file-output';
import { isNativePlatform } from '../platform/platform';
import { NetworkStatusService } from './network-status.service';
import { isServerUnreachable } from './server-reachability';
import { ToastService } from '../../shared/components/toast/toast.component';

/** عنوان (title) دکمه‌های چاپ وقتی دستگاه آفلاین است */
export const PRINT_OFFLINE_TITLE = 'چاپ در حالت آفلاین در دسترس نیست';

export type PrintPaperSize = 'A4' | 'A5';

/** گوشی/تبلت مرورگری: PDF درون iframe را چاپ نمی‌کند */
function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** PDF را در iframe پنهان بار می‌کند و پیش‌نمایش چاپ مرورگر را باز می‌کند؛ اگر نشد در زبانهٔ تازه */
function openPrintPreview(blob: Blob): void {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;';
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  // پنجرهٔ چاپ تا بسته شدن به iframe نیاز دارد؛ پس از یک دقیقه جمع می‌شود
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
}

/** دریافت PDF سند از سرور و ذخیره/اشتراک‌گذاری آن */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(FileOutputService);
  private readonly toast = inject(ToastService);
  private readonly network = NetworkStatusService.getInstance();

  private readonly _isOnline = signal(this.network.isBrowserOnline);
  /** آیا چاپ (که به سرور نیاز دارد) ممکن است؟ */
  readonly isOnline = this._isOnline.asReadonly();

  constructor() {
    this.network.state$.subscribe((s) => this._isOnline.set(s === 'online'));
  }

  async downloadPdf(kind: string, id: string | number, size: PrintPaperSize = 'A4'): Promise<boolean> {
    return this.withPdf(kind, id, size, (blob) => this.files.saveBlob(blob, `${kind}-${id}.pdf`));
  }

  /**
   * چاپ سند: روی رایانه پیش‌نمایش چاپ مرورگر با همان PDF باز می‌شود؛ روی گوشی و برنامهٔ اندروید
   * (که چاپ PDF درون صفحه را پشتیبانی نمی‌کنند) PDF به نمایشگر/برگهٔ اشتراک دستگاه می‌رود.
   */
  async printPdf(kind: string, id: string | number, size: PrintPaperSize = 'A4'): Promise<boolean> {
    return this.withPdf(kind, id, size, async (blob) => {
      if (isNativePlatform() || isTouchDevice()) {
        await this.files.saveBlob(blob, `${kind}-${id}.pdf`);
        return;
      }
      openPrintPreview(blob);
    });
  }

  /**
   * همرسانی PDF سند با برگهٔ اشتراک‌گذاری گوشی (Web Share / بومی)؛ اگر پشتیبانی نشود فایل دانلود می‌شود.
   * لغو برگه به دست کاربر خطا نیست.
   */
  async sharePdf(kind: string, id: string | number, filename?: string, size: PrintPaperSize = 'A4'): Promise<boolean> {
    return this.withPdf(kind, id, size, async (blob) => {
      await this.files.shareBlob(blob, filename || `${kind}-${id}.pdf`);
    }, false);
  }

  private async withPdf(
    kind: string, id: string | number, size: PrintPaperSize, use: (blob: Blob) => Promise<void>,
    useErrorToast = true,
  ): Promise<boolean> {
    if (!this.network.isBrowserOnline || this.network.state === 'offline') {
      this.toast.error('اتصال به سرور برقرار نیست؛ چاپ در حالت آفلاین ممکن نیست');
      return false;
    }
    const url =
      `${environment.apiUrl}/print/${encodeURIComponent(kind)}/${encodeURIComponent(String(id))}/pdf/` +
      `?size=${size === 'A5' ? 'A5' : 'A4'}`;
    let blob: Blob;
    try {
      blob = await firstValueFrom(
        this.http.get(url, {
          responseType: 'blob',
          context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true),
        }),
      );
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (typeof status === 'number' && isServerUnreachable(status)) {
        this.toast.error('اتصال به سرور برقرار نیست؛ چاپ در حالت آفلاین ممکن نیست');
      } else if (status === 404) {
        this.toast.error('سند برای چاپ در دسترس نیست');
      } else {
        this.toast.error('ساخت فایل PDF ناموفق بود');
      }
      return false;
    }
    try {
      await use(blob);
      return true;
    } catch {
      // همرسانی خطای خودش را نشان می‌دهد (shareBlob)؛ فقط ذخیره پیام جدا می‌خواهد
      if (useErrorToast) this.toast.error('ساخت فایل PDF ناموفق بود');
      return false;
    }
  }
}
