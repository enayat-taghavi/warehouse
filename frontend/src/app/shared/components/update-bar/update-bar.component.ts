import { Component, inject } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

/**
 * نوار ماندگار پایین صفحه برای «نسخهٔ تازه آماده است» (طرح ۲.۵ ص۷).
 * پس از «بعداً» پنهان می‌شود و نشان کوچک در منوی کاربر می‌ماند.
 */
@Component({
  selector: 'app-update-bar',
  standalone: true,
  imports: [SvgIconDirective],
  template: `
    @if (pwaUpdate.updateReady() && !pwaUpdate.updateDismissed()) {
      <section
        role="status"
        aria-live="polite"
        aria-label="نسخهٔ تازهٔ برنامه"
        class="fixed inset-x-0 bottom-0 z-[90] pb-safe px-3 sm:px-4">
        <div class="max-w-3xl mx-auto mb-3 bg-surface border border-line rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2.5 text-xs text-fg">
          <span class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg appIcon="download" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
          </span>
          <p class="flex-1 min-w-0 font-bold leading-relaxed">نسخهٔ تازهٔ برنامه آماده است.</p>
          <button
            type="button"
            data-testid="update-bar-apply"
            (click)="onApply()"
            [disabled]="applying"
            title="به‌روزرسانی"
            aria-label="به‌روزرسانی"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="refresh-cw" class="w-4 h-4" [class.animate-spin]="applying" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline ms-1.5">به‌روزرسانی</span>
          </button>
          <button
            type="button"
            data-testid="update-bar-later"
            (click)="pwaUpdate.dismissUpdate()"
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
export class UpdateBarComponent {
  public readonly pwaUpdate = inject(PwaUpdateService);
  public applying = false;

  public async onApply(): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      await this.pwaUpdate.applyUpdate();
    } finally {
      this.applying = false;
    }
  }
}
