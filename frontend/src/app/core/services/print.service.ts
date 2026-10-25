import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { FileOutputService } from '../platform/file-output';
import { NetworkStatusService } from './network-status.service';
import { isServerUnreachable } from './server-reachability';
import { ToastService } from '../../shared/components/toast/toast.component';

/** عنوان (title) دکمه‌های چاپ وقتی دستگاه آفلاین است */
export const PRINT_OFFLINE_TITLE = 'چاپ در حالت آفلاین در دسترس نیست';

export type PrintPaperSize = 'A4' | 'A5';

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
    if (!this.network.isBrowserOnline || this.network.state === 'offline') {
      this.toast.error('اتصال به سرور برقرار نیست؛ چاپ در حالت آفلاین ممکن نیست');
      return false;
    }
    const url =
      `${environment.apiUrl}/print/${encodeURIComponent(kind)}/${encodeURIComponent(String(id))}/pdf/` +
      `?size=${size === 'A5' ? 'A5' : 'A4'}`;
    try {
      const blob = await firstValueFrom(
        this.http.get(url, {
          responseType: 'blob',
          context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true),
        }),
      );
      await this.files.saveBlob(blob, `${kind}-${id}.pdf`);
      return true;
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
  }
}
