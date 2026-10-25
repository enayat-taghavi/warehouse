import { Component, Input, inject } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

/**
 * دکمهٔ «نصب برنامه» برای صفحهٔ ورود و صفحه‌های اصلی (طرح ۲.۵ ص۷).
 * فقط وقتی دیده می‌شود که مرورگر اجازهٔ نصب بدهد و برنامه هنوز نصب نشده باشد.
 */
@Component({
  selector: 'app-install-button',
  standalone: true,
  imports: [SvgIconDirective],
  host: { class: 'contents' },
  template: `
    @if (pwaInstall.canInstall() && !pwaInstall.isInstalled()) {
      <button
        type="button"
        data-testid="install-button"
        (click)="pwaInstall.installApp()"
        title="نصب برنامه"
        aria-label="نصب برنامه"
        class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl text-xs font-bold flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        [class]="tone === 'dark'
          ? 'border border-indigo-400/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 focus-visible:ring-indigo-400 focus-visible:ring-offset-slate-900'
          : 'border border-line bg-surface hover:bg-indigo-50 text-indigo-600 focus-visible:ring-indigo-500'">
        <svg appIcon="download" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
        <span class="ms-1.5" [class]="showLabelOnMobile ? 'inline' : 'hidden sm:inline'">نصب برنامه</span>
      </button>
    }
  `,
})
export class InstallButtonComponent {
  public readonly pwaInstall = inject(PwaInstallService);
  /** رنگ‌بندی برای زمینهٔ تیره (ورود، لانچر) یا روشن (سربرگ برنامه) */
  @Input() tone: 'dark' | 'light' = 'light';
  /** روی موبایل هم برچسب نشان داده شود (وقتی جای کافی هست، مثل صفحهٔ ورود) */
  @Input() showLabelOnMobile = false;
}
