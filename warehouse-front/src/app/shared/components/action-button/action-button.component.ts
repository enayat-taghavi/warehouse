import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  input,
  booleanAttribute,
} from '@angular/core';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ACTION_ICONS, ActionIconKey } from '../../icons/semantic-icons';
import {
  ACTION_CATALOG,
  ActionCatalogEntry,
  ActionDisplay,
  ActionLabelFrom,
  ActionSize,
  ActionTone,
} from './action-catalog';
import { OVERFLOW_MENU_CONTEXT } from '../overflow-menu/overflow-menu.token';

const LABEL_FROM_CLASSES: Record<ActionLabelFrom, string> = {
  sm: 'hidden sm:inline ms-1.5',
  md: 'hidden md:inline ms-1.5',
  lg: 'hidden lg:inline ms-1.5',
};

const TONE_CLASSES: Record<ActionTone, string> = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs border border-transparent',
  indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100/80',
  emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100/80',
  rose: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100/80',
  amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80',
  slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200',
  purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-100/80',
  blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100/80',
};

const SIZE_CLASSES: Record<ActionSize, { iconOnly: string; withLabel: string; auto: string }> = {
  sm: {
    iconOnly: 'w-8 h-8 rounded-lg text-xs min-w-[40px] min-h-[40px] sm:min-w-[32px] sm:min-h-[32px]',
    withLabel: 'px-2.5 py-1.5 rounded-lg text-xs min-h-[40px] sm:min-h-0',
    auto: 'px-2 sm:px-2.5 py-1.5 rounded-lg text-xs min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0',
  },
  md: {
    iconOnly: 'w-9 h-9 rounded-xl text-xs md:text-sm min-w-[40px] min-h-[40px]',
    withLabel: 'px-3 py-2 rounded-xl text-xs md:text-sm min-h-[40px]',
    auto: 'px-2.5 sm:px-3 py-2 rounded-xl text-xs md:text-sm min-w-[40px] min-h-[40px]',
  },
  lg: {
    iconOnly: 'w-11 h-11 md:w-12 md:h-12 rounded-xl text-sm min-w-[44px] min-h-[44px]',
    withLabel: 'px-4 py-2.5 rounded-xl text-sm min-h-[44px]',
    auto: 'px-3 sm:px-4 py-2.5 rounded-xl text-sm min-w-[44px] min-h-[44px]',
  },
};

/**
 * دکمه کاری استاندارد با ارگونومی واکنش‌گرا و اتصال به کاتالوگ کارها.
 * استفاده: `<button type="button" appAction="refresh" (click)="refresh()"></button>`
 */
@Component({
  selector: 'button[appAction]',
  standalone: true,
  imports: [SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [appIcon]="currentIcon()"
      [class]="iconClasses()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    ></svg>
    @if (isLabelRendered()) {
      <span [class]="labelClasses()">
        <ng-content>{{ resolvedLabel() }}</ng-content>
      </span>
    }
  `,
  host: {
    '[disabled]': 'isDisabled()',
    '[attr.aria-busy]': 'busy() ? "true" : null',
    '[attr.aria-label]': 'resolvedLabel()',
    '[attr.title]': 'resolvedLabel()',
    '[attr.type]': 'type()',
    '[class]': 'hostClasses()',
    '(click)': 'onHostClick($event)',
  },
})
export class ActionButtonComponent {
  /** کلید کار در فرهنگ و کاتالوگ (الزامی) */
  readonly appAction = input.required<ActionIconKey>();

  /** عنوان دکمه (پیش‌فرض از کاتالوگ) */
  readonly label = input<string>();

  /** شیوه نمایش: خودکار، فقط‌آیکون، یا همیشه عنوان‌دار */
  readonly display = input<ActionDisplay>('auto');

  /** در حالت auto، عنوان از چه نقطه‌ای ظاهر شود */
  readonly labelFrom = input<ActionLabelFrom>('sm');

  /** رنگ و تون دکمه (پیش‌فرض از کاتالوگ) */
  readonly tone = input<ActionTone>();

  /** اندازه دکمه (sm، md، یا lg برای کلیدهای ثبت ۴۴ تا ۴۸px) */
  readonly size = input<ActionSize>('md');

  /** حالت لودینگ / در حال انجام */
  readonly busy = input<boolean, unknown>(false, { transform: booleanAttribute });

  /** غیرفعال بودن دکمه از سوی صفحه */
  readonly disabled = input<boolean, unknown>(false, { transform: booleanAttribute });

  /** نوع بومی دکمه در HTML (پیش‌فرض button) */
  readonly type = input<string>('button');

  /** آیا هنگام کلیک داخل منوی پاپ‌اوور، منو به‌طور خودکار بسته شود (پیش‌فرض بله) */
  readonly autoClose = input<boolean, unknown>(true, { transform: booleanAttribute });

  /** توکن اختیاری برای تشخیص حضور داخل پاپ‌اوور app-overflow-menu */
  private readonly overflowContext = inject(OVERFLOW_MENU_CONTEXT, { optional: true });

  readonly catalogEntry = computed<ActionCatalogEntry>(() => ACTION_CATALOG[this.appAction()]);

  readonly isSensitive = computed<boolean>(() => this.catalogEntry().sensitive);

  readonly resolvedLabel = computed<string>(() => this.label() ?? this.catalogEntry().defaultLabel);

  readonly resolvedTone = computed<ActionTone>(() => this.tone() ?? this.catalogEntry().tone);

  /**
   * نمایش نهایی دکمه:
   * کارهای حساس همیشه label هستند.
   * ۳ دکمه استاندارد سربرگ در auto به‌طور پیش‌فرض icon هستند.
   */
  readonly effectiveDisplay = computed<ActionDisplay>(() => {
    if (this.isSensitive()) return 'label';
    if (this.display() === 'auto' && this.catalogEntry().defaultIconOnly) return 'icon';
    return this.display();
  });

  readonly isEffectiveIconOnly = computed<boolean>(() => {
    if (this.isSensitive()) return false;
    if (this.overflowContext != null) return false;
    return this.effectiveDisplay() === 'icon';
  });

  readonly isLabelRendered = computed<boolean>(() => {
    if (this.isSensitive()) return true;
    if (this.overflowContext != null) return true;
    if (this.effectiveDisplay() === 'icon') return false;
    return true;
  });

  readonly currentIcon = computed<string>(() => {
    if (this.busy()) return ACTION_ICONS['loading'];
    return this.catalogEntry().icon;
  });

  readonly isDisabled = computed<boolean>(() => Boolean(this.disabled()) || Boolean(this.busy()));

  readonly iconClasses = computed<string>(() => {
    if (this.busy()) {
      return 'w-4 h-4 shrink-0 animate-spin';
    }
    const sz = this.size();
    if (sz === 'lg') return 'w-5 h-5 shrink-0';
    if (sz === 'sm') return 'w-3.5 h-3.5 shrink-0';
    return 'w-4 h-4 shrink-0';
  });

  readonly labelClasses = computed<string>(() => {
    if (this.overflowContext != null) {
      return 'inline ms-2 font-medium';
    }
    if (this.isSensitive() || this.effectiveDisplay() === 'label') {
      return 'inline ms-1.5 font-bold';
    }
    return `${LABEL_FROM_CLASSES[this.labelFrom()]} font-bold`;
  });

  readonly hostClasses = computed<string>(() => {
    const base = 'inline-flex items-center justify-center font-bold whitespace-nowrap shrink-0 transition-all duration-150 select-none cursor-pointer active:scale-95 disabled:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1';
    const toneClass = TONE_CLASSES[this.resolvedTone()];
    const szConfig = SIZE_CLASSES[this.size()];

    let sizeClass: string;
    if (this.overflowContext != null) {
      sizeClass = 'w-full sm:w-auto justify-start sm:justify-center text-start px-3 py-2 rounded-xl text-xs md:text-sm min-h-[40px]';
    } else if (this.isEffectiveIconOnly()) {
      sizeClass = szConfig.iconOnly;
    } else if (this.effectiveDisplay() === 'label' || this.isSensitive()) {
      sizeClass = szConfig.withLabel;
    } else {
      sizeClass = szConfig.auto;
    }

    return `${base} ${toneClass} ${sizeClass}`.trim();
  });

  onHostClick(event: MouseEvent): void {
    if (this.isDisabled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.overflowContext != null && this.autoClose()) {
      this.overflowContext.close();
    }
  }
}
