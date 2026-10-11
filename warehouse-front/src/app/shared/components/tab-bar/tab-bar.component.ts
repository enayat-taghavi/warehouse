import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChildren,
  QueryList,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

const TAB_COUNTER_TONE_CLASSES: Record<
  'primary' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate',
  { active: string; inactive: string }
> = {
  primary: { active: 'bg-indigo-100 text-indigo-700', inactive: 'bg-slate-200/80 text-slate-600' },
  indigo: { active: 'bg-indigo-100 text-indigo-700', inactive: 'bg-slate-200/80 text-slate-600' },
  emerald: { active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-emerald-50 text-emerald-700' },
  rose: { active: 'bg-rose-100 text-rose-800', inactive: 'bg-rose-50 text-rose-700' },
  amber: { active: 'bg-amber-100 text-amber-800', inactive: 'bg-amber-50 text-amber-700' },
  slate: { active: 'bg-slate-200 text-slate-700', inactive: 'bg-slate-200/80 text-slate-600' },
};

const FULL_LABEL_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'hidden sm:inline',
  md: 'hidden md:inline',
  lg: 'hidden lg:inline',
  xl: 'hidden xl:inline',
};

const SHORT_LABEL_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
};

// حالت mobile="icon": زیر sm فقط آیکون دیده می‌شود و عنوان کامل sr-only نام دسترس‌پذیر را می‌سازد؛
// از sm تا fullLabelFrom عنوان کوتاه دیده می‌شود (تب فقط‌آیکون در دسکتاپ و تبلت ممنوع است، قاعده ۲ و ۵).
// not-sr-only فاصله‌گذاری را normal می‌کند؛ whitespace-nowrap هم‌نقطه آن را برمی‌گرداند تا عنوان نشکند.
const ICON_MODE_FULL_LABEL_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'sr-only sm:not-sr-only sm:whitespace-nowrap',
  md: 'sr-only sm:hidden md:not-sr-only md:inline md:whitespace-nowrap',
  lg: 'sr-only sm:hidden lg:not-sr-only lg:inline lg:whitespace-nowrap',
  xl: 'sr-only sm:hidden xl:not-sr-only xl:inline xl:whitespace-nowrap',
};

const ICON_MODE_SHORT_LABEL_CLASSES: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'hidden',
  md: 'hidden sm:inline md:hidden',
  lg: 'hidden sm:inline lg:hidden',
  xl: 'hidden sm:inline xl:hidden',
};

export interface TabDef {
  /** شناسه یکتای تب */
  id: string;
  /** عنوان کامل تب در دسکتاپ */
  label: string;
  /** عنوان کوتاه یک‌کلمه‌ای برای موبایل */
  shortLabel?: string;
  /** آیکون معنایی از فرهنگ آیکون (در mobile="icon" برای هر تب لازم است؛ وگرنه تب در موبایل خالی می‌ماند) */
  icon?: string;
  /** عدد شمارنده فراداده */
  count?: number;
  /** رنگ اختیاری شمارنده و تب طبق AGENTS §7 */
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
      class="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 overflow-x-auto w-full md:w-auto"
    >
      @for (tab of tabs(); track tab.id; let idx = $index) {
        <button
          #tabButton
          type="button"
          role="tab"
          [attr.aria-selected]="tab.id === active() ? 'true' : 'false'"
          [attr.tabindex]="tab.id === focusableTabId() ? 0 : -1"
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
            <span [class]="fullLabelClass()">{{ tab.label }}</span>
            <span [class]="shortLabelClass()">{{ tab.shortLabel || tab.label }}</span>
          } @else {
            <span [class]="iconModeFullLabelClass()">{{ tab.label }}</span>
            @if (fullLabelFrom() !== 'sm') {
              <span [class]="iconModeShortLabelClass()">{{ tab.shortLabel || tab.label }}</span>
            }
          }

          @if (tab.count !== undefined && tab.count !== null) {
            <!-- در حالت icon زیر sm فقط آیکون می‌ماند تا نوار بدون اسکرول جا شود -->
            <span
              class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md tabular-nums transition-colors sm:inline"
              [class.hidden]="mobile() === 'icon'"
              [ngClass]="counterClasses(tab)"
            >
              {{ tab.count }}
            </span>
          }
        </button>
      }
    </div>
  `,
  host: {
    // max-w-full و min-w-0: نوار از ظرف بزرگ‌تر نشود تا overflow-x-auto درونی کار کند، نه اسکرول کل صفحه.
    class: 'inline-block w-full md:w-auto max-w-full min-w-0',
  },
})
export class TabBarComponent {
  /** آرایه تب‌ها */
  readonly tabs = input.required<TabDef[]>();

  /** شناسه تب فعال */
  readonly active = input.required<string>();

  /**
   * رفتار زیر sm: عنوان کوتاه (پیش‌فرض) یا فقط‌آیکون. در حالت icon نام دسترس‌پذیر از عنوان کامل sr-only
   * و شمارنده دیده‌شده ساخته می‌شود، پس aria-label لازم نیست و با متن دیده‌شده ناهماهنگ نمی‌شود (WCAG 2.5.3).
   */
  readonly mobile = input<'short' | 'icon'>('short');

  /** نقطه شکست برای نمایش برچسب کامل (پیش‌فرض sm؛ در تبلت یا صفحه‌های با سایدبار md یا lg یا xl) */
  readonly fullLabelFrom = input<'sm' | 'md' | 'lg' | 'xl'>('sm');

  readonly fullLabelClass = computed(() => FULL_LABEL_CLASSES[this.fullLabelFrom()] ?? FULL_LABEL_CLASSES.sm);
  readonly shortLabelClass = computed(() => SHORT_LABEL_CLASSES[this.fullLabelFrom()] ?? SHORT_LABEL_CLASSES.sm);
  readonly iconModeFullLabelClass = computed(
    () => ICON_MODE_FULL_LABEL_CLASSES[this.fullLabelFrom()] ?? ICON_MODE_FULL_LABEL_CLASSES.sm,
  );
  readonly iconModeShortLabelClass = computed(
    () => ICON_MODE_SHORT_LABEL_CLASSES[this.fullLabelFrom()] ?? ICON_MODE_SHORT_LABEL_CLASSES.sm,
  );

  /** تغییر تب فعال */
  readonly activeChange = output<string>();

  @ViewChildren('tabButton') private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  counterClasses(tab: TabDef): string {
    const tone = tab.tone ?? 'indigo';
    const cfg = TAB_COUNTER_TONE_CLASSES[tone] ?? TAB_COUNTER_TONE_CLASSES.indigo;
    return tab.id === this.active() ? cfg.active : cfg.inactive;
  }

  /** تب قابل فوکوس با Tab؛ اگر active با هیچ تبی نخواند، تب اول تا نوار از صفحه‌کلید دور نماند. */
  readonly focusableTabId = computed<string | null>(() => {
    const list = this.tabs();
    return list.some((t) => t.id === this.active()) ? this.active() : (list[0]?.id ?? null);
  });

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
    // Alt+ArrowLeft و میان‌برهای مرورگر را نبلع
    if (event.altKey || event.ctrlKey || event.metaKey) return;
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
