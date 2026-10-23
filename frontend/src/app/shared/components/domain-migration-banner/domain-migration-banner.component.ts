import { Component, ElementRef, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { DomainMigrationService } from '../../../core/services/domain-migration.service';

const faNumber = new Intl.NumberFormat('fa-IR');

@Component({
  selector: 'app-domain-migration-banner',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  host: { class: 'block' },
  template: `
    @if (migration.showBanner()) {
      <section
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="انتقال نشانی سامانه"
        class="w-full bg-amber-50 border-b border-amber-200 text-amber-900 px-3.5 py-2 text-xs">
        <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-start gap-2 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <svg appIcon="alert-triangle" class="w-4 h-4 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"></svg>
            </span>
            <div class="leading-relaxed min-w-0">
              <p>
                سامانه به نشانی جدید
                <bdi dir="ltr" class="font-bold mx-1 px-1.5 py-0.5 rounded-md bg-amber-100 break-all">{{ migration.canonicalDomain() }}</bdi>
                منتقل شده است. پس از انتقال باید دوباره وارد شوید.
              </p>
              @switch (migration.blockReason()) {
                @case ('pending') {
                  @if (migration.pendingSyncCount() + migration.pendingPhotoCount() > 0) {
                    <p class="font-bold">
                      {{ fa(migration.pendingSyncCount() + migration.pendingPhotoCount()) }} تغییر یا عکس هنوز به سرور نرسیده است. برای حفظ داده‌ها، انتقال پس از ارسال آن‌ها انجام می‌شود؛ اتصال اینترنت را برقرار نگه دارید.
                    </p>
                  }
                  @if (migration.pendingDraftCount() > 0) {
                    <p class="font-bold">
                      {{ fa(migration.pendingDraftCount()) }} پیش‌نویس محلی پرسنل در این مرورگر هست؛ آن را ثبت یا حذف کنید تا انتقال انجام شود.
                    </p>
                  }
                }
                @case ('syncing') {
                  <p>در حال ارسال تغییرها به سرور؛ پس از پایان، انتقال انجام می‌شود.</p>
                }
                @case ('offline') {
                  <p>اینترنت وصل نیست. پس از اتصال، انتقال خودکار انجام می‌شود.</p>
                }
                @case ('server-unreachable') {
                  <p>سرور موقتاً در دسترس نیست. هر دقیقه دوباره بررسی می‌شود.</p>
                }
                @case ('target-unreachable') {
                  <p>نشانی جدید از این شبکه در دسترس نیست. هر دقیقه دوباره بررسی می‌شود.</p>
                }
                @case ('check-failed') {
                  <p class="font-bold">وضعیت داده‌های ذخیره‌شده در این مرورگر خوانده نشد؛ برای حفظ داده‌ها انتقال انجام نمی‌شود. صفحه را دوباره بارگذاری کنید.</p>
                }
                @case ('user-active') {
                  <p>پس از پایان کار جاری به نشانی جدید منتقل می‌شوید؛ کارتان را ذخیره کنید یا اکنون «انتقال» را بزنید.</p>
                }
                @default {
                  @if (migration.isChecking()) {
                    <p>در حال بررسی…</p>
                  }
                }
              }
            </div>
          </div>

          @if (migration.totalPendingCount() === 0 && migration.blockReason() !== 'check-failed') {
            <button
              type="button"
              (click)="onMove()"
              [attr.aria-disabled]="migration.isChecking()"
              title="بررسی ارسال داده‌ها و رفتن به نشانی جدید"
              class="shrink-0 min-h-[44px] sm:min-h-[32px] px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-900 focus-visible:ring-offset-2 aria-disabled:opacity-60 aria-disabled:cursor-wait">
              <svg
                appIcon="refresh-cw"
                class="w-3.5 h-3.5 text-white"
                [class.animate-spin]="migration.isChecking()"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"></svg>
              <span>انتقال</span>
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class DomainMigrationBannerComponent implements OnDestroy {
  protected readonly migration = inject(DomainMigrationService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    // ارتفاع نوار به --domain-banner-h می‌رود تا چیدمان ۱۰۰dvh زیر آن کوتاه شود و بریده نشود
    effect(() => {
      const visible = this.migration.showBanner();
      queueMicrotask(() => this.syncHeight(visible));
    });
  }

  protected fa(n: number): string {
    return faNumber.format(n);
  }

  protected onMove(): void {
    if (this.migration.isChecking()) return;
    this.migration.triggerImmediateCheck();
  }

  private syncHeight(visible: boolean): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const el = this.host.nativeElement as HTMLElement;
    if (!visible) {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      root.style.removeProperty('--domain-banner-h');
      return;
    }
    const apply = () => root.style.setProperty('--domain-banner-h', `${el.getBoundingClientRect().height}px`);
    apply();
    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(el);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (typeof document !== 'undefined') document.documentElement.style.removeProperty('--domain-banner-h');
  }
}
