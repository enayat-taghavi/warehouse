import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChildren,
  QueryList,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export interface TabDef {
  /** شناسه یکتای تب */
  id: string;
  /** عنوان کامل تب در دسکتاپ */
  label: string;
  /** عنوان کوتاه یک‌کلمه‌ای برای موبایل */
  shortLabel?: string;
  /** آیکون معنایی از فرهنگ آیکون */
  icon?: string;
  /** عدد شمارنده فراداده */
  count?: number;
  /** رنگ اختیاری */
  tone?: 'primary' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';
}

/**
 * نوار تب استاندارد پروژه با ظرف قرصی و ارگونومی واکنش‌گرا (AGENTS §7).
 * استفاده: `<app-tab-bar [tabs]="tabs" [active]="activeTab" (activeChange)="onTabChange($event)" />`
 */
@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="tablist"
      class="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 overflow-x-auto w-full md:w-auto scrollbar-none"
    >
      @for (tab of tabs(); track tab.id; let idx = $index) {
        <button
          #tabButton
          type="button"
          role="tab"
          [attr.id]="'tab-' + tab.id"
          [attr.aria-selected]="tab.id === active() ? 'true' : 'false'"
          [attr.tabindex]="tab.id === active() ? 0 : -1"
          [attr.aria-label]="mobile() === 'icon' ? tab.label : null"
          [attr.title]="mobile() === 'icon' ? tab.label : null"
          (click)="selectTab(tab.id)"
          (keydown)="onKeydown($event, idx)"
          class="relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm whitespace-nowrap cursor-pointer transition-all duration-150 select-none min-h-[40px] md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          [ngClass]="tab.id === active()
            ? 'bg-white text-indigo-700 shadow-xs font-black'
            : 'text-slate-600 hover:text-slate-900 font-bold'"
        >
          @if (tab.icon) {
            <svg
              [appIcon]="tab.icon"
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            ></svg>
          }

          @if (mobile() === 'short') {
            <span class="hidden sm:inline">{{ tab.label }}</span>
            <span class="sm:hidden">{{ tab.shortLabel || tab.label }}</span>
          } @else {
            <span class="hidden sm:inline">{{ tab.label }}</span>
          }

          @if (tab.count !== undefined && tab.count !== null) {
            <span
              class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md tabular-nums transition-colors"
              [ngClass]="tab.id === active()
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-slate-200/80 text-slate-600'"
            >
              {{ tab.count }}
            </span>
          }
        </button>
      }
    </div>
  `,
  host: {
    class: 'inline-block w-full md:w-auto',
  },
})
export class TabBarComponent {
  /** آرایه تب‌ها */
  readonly tabs = input.required<TabDef[]>();

  /** شناسه تب فعال */
  readonly active = input.required<string>();

  /** رفتار در موبایل: عنوان کوتاه (پیش‌فرض) یا فقط‌آیکون */
  readonly mobile = input<'short' | 'icon'>('short');

  /** تغییر تب فعال */
  readonly activeChange = output<string>();

  @ViewChildren('tabButton') private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  selectTab(id: string): void {
    if (id !== this.active()) {
      this.activeChange.emit(id);
    }
  }

  /**
   * ناوبری با کلیدهای جهت‌دار با توجه به جهت RTL فارسی:
   * در راست‌به‌چپ، کلید راست به تب قبلی و کلید چپ به تب بعدی می‌رود.
   */
  onKeydown(event: KeyboardEvent, currentIndex: number): void {
    const tabList = this.tabs();
    const count = tabList.length;
    if (count === 0) return;

    let targetIndex = -1;

    switch (event.key) {
      case 'ArrowRight': // قبلی در RTL
        targetIndex = (currentIndex - 1 + count) % count;
        break;
      case 'ArrowLeft': // بعدی در RTL
        targetIndex = (currentIndex + 1) % count;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = count - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const targetTab = tabList[targetIndex];
    if (targetTab) {
      this.selectTab(targetTab.id);
      const buttonsArray = this.tabButtons.toArray();
      buttonsArray[targetIndex]?.nativeElement.focus();
    }
  }
}
