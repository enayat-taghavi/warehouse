import { Component, input } from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

/**
 * نوار برند بالای هدر در موبایل (زیر md): «اتوماسیون شرکت» و در صورت نیاز نشان انبار فعال.
 * حاشیهٔ امن بالای گوشی (ناچ/نوار وضعیت) روی همین نوار است، نه روی هدر.
 */
@Component({
  selector: 'app-mobile-brand-bar',
  standalone: true,
  imports: [SvgIconDirective],
  host: { class: 'md:hidden shrink-0 relative z-[45] block pt-safe bg-slate-900 text-white' },
  template: `
    <div class="h-7 px-3 flex items-center justify-between gap-2" dir="rtl" data-testid="mobile-brand-bar">
      <div class="flex items-center gap-1.5 min-w-0">
        <svg width="14" height="14" viewBox="0 0 32 32" fill="none" aria-hidden="true" appIcon="logo-mark"></svg>
        <span class="text-[11px] font-black tracking-tight text-slate-100 truncate">اتوماسیون شرکت</span>
      </div>
      @if (badge()) {
        <span class="min-w-0 max-w-[55%] truncate px-2 py-0.5 rounded-md bg-indigo-600 text-[10px] font-black text-white shadow-sm"
              [style.background]="badgeColor() || null" [title]="badge()" data-testid="mobile-brand-badge">{{ badge() }}</span>
      }
    </div>
  `
})
export class MobileBrandBarComponent {
  /** نام انبار فعال (کانتکست انبار)؛ تهی یعنی بدون نشان */
  readonly badge = input<string | null | undefined>(null);
  readonly badgeColor = input<string | null | undefined>(null);
}
