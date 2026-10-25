import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../../core/error/error.interceptor';
import { isServerUnreachable } from '../../../../core/services/server-reachability';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

interface DocumentVerifyResponse {
  valid: boolean;
  number?: string;
  title?: string;
  date?: string;
  company_name?: string;
}

type VerifyState = 'loading' | 'valid' | 'invalid' | 'error';

/** صفحه عمومی (بدون ورود) برای اصالت‌سنجی سند چاپ‌شده با QR */
@Component({
  selector: 'app-document-verify',
  standalone: true,
  imports: [SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-verify.html',
})
export class DocumentVerify {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  readonly state = signal<VerifyState>('loading');
  readonly result = signal<DocumentVerifyResponse | null>(null);
  readonly errorMessage = signal('');

  constructor() {
    this.route.paramMap.subscribe(() => this.load());
  }

  load(): void {
    const token = (this.route.snapshot.paramMap.get('token') || '').trim();
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.state.set('loading');
    this.result.set(null);
    this.http
      .get<DocumentVerifyResponse>(`${environment.apiUrl}/public/verify/${encodeURIComponent(token)}/`, {
        context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true),
      })
      .subscribe({
        next: (res) => {
          if (res && res.valid) {
            this.result.set(res);
            this.state.set('valid');
          } else {
            this.state.set('invalid');
          }
        },
        error: (err) => {
          const status = typeof err?.status === 'number' ? err.status : 0;
          this.errorMessage.set(
            isServerUnreachable(status)
              ? 'اتصال به سرور برقرار نیست؛ بعداً دوباره تلاش کنید'
              : 'بررسی سند ناموفق بود؛ دوباره تلاش کنید',
          );
          this.state.set('error');
        },
      });
  }

  get isFull(): boolean {
    const r = this.result();
    return !!r && !!(r.title || r.date || r.company_name);
  }
}
