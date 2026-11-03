import { Component, input, output } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

/**
 * نوار برند بالای هدر در موبایل (زیر md): دکمهٔ سه‌خط منوی کامل، «اتوماسیون شرکت» و در صورت نیاز نشان انبار فعال.
 * فاصلهٔ بالای ردیف (pt-2) نوشته را با فاصلهٔ زیرش تا هدر هم‌تراز می‌کند؛ ارتفاع کل ۴۴px است (--mobile-top-chrome-height).
 * حاشیهٔ امن بالای گوشی (ناچ/نوار وضعیت) روی همین نوار است، نه روی هدر.
 */
@Component({
  selector: 'app-mobile-brand-bar',
  standalone: true,
  imports: [SvgIconDirective],
  host: { class: 'md:hidden shrink-0 relative z-[45] block pt-safe bg-surface' },
  template: `
    <div class="pt-2"><div class="relative h-9 px-3 flex items-center justify-center" dir="rtl" data-testid="mobile-brand-bar">
      <button type="button" (click)="menuOpen.emit()"
              class="tap-target absolute start-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-xl text-fg-muted hover:bg-surface-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="منوی کامل" aria-label="منوی کامل" [attr.aria-expanded]="menuExpanded()" data-testid="mobile-brand-menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" appIcon="menu"></svg>
      </button>
      <div class="flex items-center gap-1.5 min-w-0 max-w-[60%]">
        <!-- خط لوگو در رجیستری سفید است؛ روی زمینهٔ سفید با رنگ برند کشیده می‌شود -->
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true" appIcon="logo-mark"
             class="shrink-0 text-indigo-600 [&_path]:stroke-current [&_circle]:fill-current"></svg>
        <span class="text-[13px] font-black tracking-tight text-fg truncate">اتوماسیون شرکت</span>
      </div>
      @if (badge()) {
        <span class="absolute end-3 top-1/2 -translate-y-1/2 max-w-[20%] truncate px-2 py-0.5 rounded-md bg-indigo-600 text-[10px] font-black text-white shadow-sm"
              [style.background]="badgeColor() || null" [title]="badge()" data-testid="mobile-brand-badge">{{ badge() }}</span>
      }
    </div></div>
  `
})
export class MobileBrandBarComponent {
  /** نام انبار فعال (کانتکست انبار)؛ تهی یعنی بدون نشان */
  readonly badge = input<string | null | undefined>(null);
  readonly badgeColor = input<string | null | undefined>(null);
  /** منوی کامل (سایدبار) باز است */
  readonly menuExpanded = input(false);

  readonly menuOpen = output<void>();
}
