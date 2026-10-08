import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { DomainMigrationService } from '../../../core/services/domain-migration.service';

@Component({
  selector: 'app-domain-migration-banner',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  template: `
    @if (migration.showBanner()) {
      <aside
        dir="rtl"
        role="alert"
        aria-live="polite"
        class="sticky top-0 z-[9990] w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-950 px-3.5 py-2 text-xs backdrop-blur-md shadow-xs transition-all">
        <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <svg appIcon="alert-triangle" class="w-4 h-4 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
            </span>
            <div class="leading-relaxed">
              <span>سامانه به نشانی جدید</span>
              <strong class="font-bold font-mono dir-ltr inline-block mx-1.5 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-900 text-[11px]">{{ migration.canonicalDomain() }}</strong>
              <span>منتقل شده است.</span>
              @if (migration.totalPendingCount() > 0) {
                <span class="font-bold text-amber-900 ms-1">
                  (جهت حفظ داده‌ها، ابتدا باید <span class="font-mono tabular-nums">{{ migration.totalPendingCount() }}</span> تغییر ذخیره‌نشده به سرور ارسال شوند)
                </span>
              } @else if (!migration.isServerReachable()) {
                <span class="text-amber-800 ms-1">(سرور موقتاً در دسترس نیست؛ انتقال خودکار پس از برقراری ارتباط انجام خواهد شد)</span>
              } @else {
                <span class="text-emerald-800 font-bold ms-1">(صف خالی و آماده — در حال بررسی نهایی و انتقال خودکار...)</span>
              }
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              (click)="migration.triggerImmediateCheck()"
              [disabled]="migration.isChecking()"
              aria-label="بررسی وضعیت صف و انتقال به نشانی جدید"
              title="بررسی وضعیت صف و انتقال به نشانی جدید"
              class="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-[11px] shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
              <svg
                appIcon="refresh-cw"
                class="w-3 h-3 text-white"
                [class.animate-spin]="migration.isChecking()"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"></svg>
              <span>بررسی و انتقال</span>
            </button>
          </div>
        </div>
      </aside>
    }
  `,
})
export class DomainMigrationBannerComponent {
  protected readonly migration = inject(DomainMigrationService);
}
