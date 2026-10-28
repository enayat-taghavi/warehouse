import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { applyLiveUpdateNow, liveUpdateReady } from '../../../core/platform/live-update';

/**
 * نوار ماندگار پایین صفحه برای «نسخهٔ تازه آماده است» (طرح ۲.۵ ص۷).
 * پس از «بعداً» پنهان می‌شود و نشان کوچک در منوی کاربر می‌ماند.
 * روی اپ اندروید همین نوار برای بستهٔ آمادهٔ Live Update است (طرح ۵ د۴): دکمه بسته را
 * همان لحظه اعمال می‌کند، هنگام ارسال صف غیرفعال است و صف و IndexedDB دست نمی‌خورند.
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
    } @else if (liveReady() && !liveDismissed()) {
      <section
        role="status"
        aria-live="polite"
        aria-label="نسخهٔ تازهٔ برنامه"
        data-testid="live-update-bar"
        class="fixed inset-x-0 bottom-0 z-[90] pb-safe px-3 sm:px-4">
        <div class="max-w-3xl mx-auto mb-3 bg-surface border border-line rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2.5 text-xs text-fg">
          <span class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg appIcon="download" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
          </span>
          <div class="flex-1 min-w-0 leading-relaxed">
            <p class="font-bold">نسخهٔ تازه آماده است.</p>
            @if (isSyncing()) {
              <p class="text-fg-muted" data-testid="live-update-syncing">پس از پایان ارسال تغییرها می‌توانید به‌روزرسانی کنید.</p>
            } @else if (pendingCount() > 0) {
              <p class="text-fg-muted" data-testid="live-update-pending">تغییرهای ارسال‌نشده بعد از به‌روزرسانی هم می‌مانند.</p>
            }
          </div>
          <button
            type="button"
            data-testid="live-update-apply"
            (click)="onApplyLive()"
            [disabled]="applyingLive || isSyncing()"
            title="به‌روزرسانی"
            aria-label="به‌روزرسانی"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="refresh-cw" class="w-4 h-4" [class.animate-spin]="applyingLive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline ms-1.5">به‌روزرسانی</span>
          </button>
          <button
            type="button"
            data-testid="live-update-later"
            (click)="liveDismissed.set(true)"
            title="بعداً (در باز کردن بعدی برنامه اعمال می‌شود)"
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

  private readonly offlineSync = OfflineSyncService.getInstance();
  public readonly liveReady = liveUpdateReady;
  public readonly liveDismissed = signal(false);
  public readonly isSyncing = toSignal(this.offlineSync.isSyncing$, { initialValue: false });
  public readonly pendingCount = toSignal(this.offlineSync.pendingCount$, { initialValue: 0 });
  public applyingLive = false;

  public async onApply(): Promise<void> {
    if (this.applying) return;
    this.applying = true;
    try {
      await this.pwaUpdate.applyUpdate();
    } finally {
      this.applying = false;
    }
  }

  /** اعمال بستهٔ Live Update؛ هنگام ارسال صف رد می‌شود و هیچ داده‌ای پاک نمی‌شود */
  public async onApplyLive(): Promise<void> {
    if (this.applyingLive || this.isSyncing()) return;
    this.applyingLive = true;
    try {
      await applyLiveUpdateNow();
    } finally {
      this.applyingLive = false;
    }
  }
}
