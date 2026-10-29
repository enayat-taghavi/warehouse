import { Component, inject, signal } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { AuthService } from '../../../core/auth/auth.service';
import { WebPushService } from '../../../core/platform/web-push.service';
import { ToastService } from '../toast/toast.component';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

export const WEBPUSH_BAR_DISMISSED_KEY = 'wh_webpush_bar_dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(WEBPUSH_BAR_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * نوار یک‌بارهٔ درخواست اجازهٔ اعلان (Web Push).
 * فقط برای کاربر واردشده، وقتی مرورگر اعلان را پشتیبانی می‌کند و هنوز اجازه‌ای داده نشده است.
 * «بعداً» برای همیشه روی همین دستگاه پنهانش می‌کند؛ روشن‌کردن بعدی از منوی کاربر است.
 */
@Component({
  selector: 'app-webpush-bar',
  standalone: true,
  imports: [SvgIconDirective],
  template: `
    @if (visible()) {
      <section
        role="region"
        aria-live="polite"
        aria-label="درخواست اجازهٔ اعلان"
        data-testid="webpush-bar"
        class="fixed inset-x-0 bottom-0 z-[89] pb-safe px-3 sm:px-4">
        <div class="max-w-3xl mx-auto mb-3 bg-surface border border-line rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2.5 text-xs text-fg">
          <span class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg appIcon="bell" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
          </span>
          <p class="flex-1 min-w-0 font-bold leading-relaxed">اعلان‌ها را روی این دستگاه روشن کنید تا کارهای تازه را حتی با برنامهٔ بسته ببینید.</p>
          <button
            type="button"
            data-testid="webpush-bar-enable"
            (click)="onEnable()"
            [disabled]="webPush.busy()"
            title="فعال کردن اعلان"
            aria-label="فعال کردن اعلان"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="check" class="w-4 h-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline">فعال کردن</span>
          </button>
          <button
            type="button"
            data-testid="webpush-bar-later"
            (click)="onLater()"
            title="بعداً"
            aria-label="بعداً"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-line text-fg-muted hover:bg-surface-muted font-bold flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="x" class="w-4 h-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline">بعداً</span>
          </button>
        </div>
      </section>
    }
  `,
})
export class WebPushBarComponent {
  public readonly webPush = inject(WebPushService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly pwaUpdate = inject(PwaUpdateService);

  private readonly dismissed = signal(readDismissed());
  private readonly hiddenNow = signal(false);

  public visible(): boolean {
    return (
      this.auth.isLoggedIn() &&
      !(this.pwaUpdate.updateReady() && !this.pwaUpdate.updateDismissed()) &&
      !this.dismissed() &&
      !this.hiddenNow() &&
      this.webPush.isSupported() &&
      this.webPush.permission() === 'default' &&
      this.webPush.state() === 'off'
    );
  }

  /** enable باید هم‌زمان در همین کلیک صدا زده شود (بدون await پیش از آن) */
  public onEnable(): void {
    if (this.webPush.busy()) return;
    void this.webPush.enable().then(result => {
      this.toast.show(result.ok ? 'success' : 'error', result.messageFa);
      if (result.ok || this.webPush.state() === 'blocked') this.hiddenNow.set(true);
    });
  }

  public onLater(): void {
    try {
      localStorage.setItem(WEBPUSH_BAR_DISMISSED_KEY, '1');
    } catch {
      /* ذخیره‌سازی در دسترس نیست؛ فقط تا پایان این نشست پنهان می‌ماند */
    }
    this.dismissed.set(true);
  }
}
