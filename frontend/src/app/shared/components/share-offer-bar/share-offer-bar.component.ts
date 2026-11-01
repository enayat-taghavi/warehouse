import { Component, OnDestroy, signal } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import {
  setFileShareOfferNotifier as _origSetFileShareOfferNotifier,
  shareBlob as _origShareBlob,
  ShareOffer,
  ShareResult
} from '../../../core/platform/file-output';

const setFileShareOfferNotifier = (fn: ((offer: ShareOffer) => void) | null) =>
  (_origSetFileShareOfferNotifier as any).__mock
    ? (_origSetFileShareOfferNotifier as any).__mock(fn)
    : _origSetFileShareOfferNotifier(fn);

const shareBlob = (blob: Blob, filename: string) =>
  (_origShareBlob as any).__mock
    ? (_origShareBlob as any).__mock(blob, filename)
    : _origShareBlob(blob, filename);

/**
 * نوار پیشنهاد اشتراک‌گذاری فایل پس از دانلود (Web / PWA).
 * با شنیدن پیشنهاد از file-output ظاهر می‌شود، پس از ۱۵ ثانیه خودکار پنهان می‌شود
 * و با کلیک روی اشتراک‌گذاری، برگهٔ اشتراک دستگاه را باز می‌کند.
 */
@Component({
  selector: 'app-share-offer-bar',
  standalone: true,
  imports: [SvgIconDirective],
  template: `
    @if (offer()) {
      <section
        role="region"
        aria-live="polite"
        aria-label="اشتراک‌گذاری فایل دانلودشده"
        data-testid="share-offer-bar"
        class="fixed inset-x-0 bottom-0 z-[90] pb-safe px-3 sm:px-4">
        <div class="max-w-3xl mx-auto mb-3 bg-surface border border-line rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2.5 text-xs text-fg">
          <span class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg appIcon="share" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
          </span>
          <p class="flex-1 min-w-0 font-bold truncate"><bdi>{{ offer()!.filename }}</bdi> آماده است.</p>
          <button
            type="button"
            data-testid="share-offer-share"
            (click)="onShare()"
            [disabled]="busy()"
            title="اشتراک‌گذاری"
            aria-label="اشتراک‌گذاری"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center cursor-pointer disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="share" class="w-4 h-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline">اشتراک‌گذاری</span>
          </button>
          <button
            type="button"
            data-testid="share-offer-close"
            (click)="close()"
            title="بستن"
            aria-label="بستن"
            class="shrink-0 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-line text-fg-muted hover:bg-surface-muted font-bold flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <svg appIcon="x" class="w-4 h-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            <span class="hidden sm:inline">بستن</span>
          </button>
        </div>
      </section>
    }
  `,
})
export class ShareOfferBarComponent implements OnDestroy {
  public readonly offer = signal<ShareOffer | null>(null);
  public readonly busy = signal(false);

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    setFileShareOfferNotifier((o: ShareOffer) => this.show(o));
  }

  public show(o: ShareOffer): void {
    this.clearTimer();
    this.offer.set(o);
    this.hideTimer = setTimeout(() => this.close(), 15000);
  }

  public close(): void {
    this.clearTimer();
    this.offer.set(null);
  }

  public async onShare(): Promise<void> {
    if (this.busy() || !this.offer()) return;
    const currentOffer = this.offer()!;
    this.busy.set(true);
    this.clearTimer();
    try {
      const result = await shareBlob(currentOffer.blob, currentOffer.filename);
      if (result !== 'offered') {
        this.close();
      }
    } catch {
      this.close();
    } finally {
      this.busy.set(false);
    }
  }

  public ngOnDestroy(): void {
    setFileShareOfferNotifier(null);
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
