import { Component, ChangeDetectionStrategy } from '@angular/core';

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
      <div class="bg-white p-2.5 md:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="flex items-center overflow-x-auto w-full md:w-auto">
          <ng-content select="[cc-tabs]" />
        </div>
        <div class="flex items-center gap-2 justify-end w-full md:w-auto">
          <ng-content select="[cc-actions]" />
        </div>
      </div>
    </header>
  `,
  host: {
    class: 'block',
  },
})
export class CommandCenterComponent {}
