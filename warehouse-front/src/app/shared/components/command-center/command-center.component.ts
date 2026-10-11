import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';

const ROW_CONTAINER_CLASSES: Record<'md' | 'lg', string> = {
  md: 'bg-white p-2.5 md:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3',
  lg: 'bg-white p-2.5 md:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3',
};

const ROW_SLOT_CLASSES: Record<'md' | 'lg', string> = {
  md: 'w-full md:w-auto',
  lg: 'w-full lg:w-auto',
};

/**
 * سربرگ چسبان فرماندهی استاندارد پروژه (AGENTS §7).
 * دارای دو جایگاه مجزا:
 * - [cc-tabs]: تب‌ها یا فیلترهای زیرمجموعه در سمت راست (RTL)
 * - [cc-actions]: دکمه‌های اقدام و ابزارها در سمت چپ (RTL)
 * در موبایل به دو سطر مجزا بدون اسکرول افقی (Zero-Scroll) تبدیل می‌شود.
 */
@Component({
  selector: 'app-command-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md pt-1 pb-2">
      <div [class]="containerClasses()">
        <div class="flex items-center overflow-x-auto" [class]="slotClasses()">
          <ng-content select="[cc-tabs]" />
        </div>
        <div class="flex flex-wrap items-center gap-2 justify-end" [class]="slotClasses()">
          <ng-content select="[cc-actions]" />
        </div>
      </div>
    </header>
  `,
  host: {
    // contents: والد واقعی header باید ظرف بلند صفحه باشد؛ با host بلوکی هم‌قد header، sticky هرگز نمی‌چسبد.
    class: 'contents',
  },
})
export class CommandCenterComponent {
  /** نقطه شکست تبدیل به تک‌سطری (پیش‌فرض md؛ برای صفحات با فیلتر پهن یا اکشن‌های متعدد lg) */
  readonly rowFrom = input<'md' | 'lg'>('md');

  readonly containerClasses = computed(() => ROW_CONTAINER_CLASSES[this.rowFrom()] ?? ROW_CONTAINER_CLASSES.md);
  readonly slotClasses = computed(() => ROW_SLOT_CLASSES[this.rowFrom()] ?? ROW_SLOT_CLASSES.md);
}
