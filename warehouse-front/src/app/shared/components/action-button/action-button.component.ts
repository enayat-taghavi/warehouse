import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  Input,
  signal,
  Signal,
  booleanAttribute,
  ElementRef,
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

const OVERFLOW_LABEL_CLASSES: Record<
  'icon' | 'label' | 'auto-sm' | 'auto-md' | 'auto-lg',
  string
> = {
  'icon': 'max-sm:inline max-sm:ms-2 max-sm:font-medium sm:hidden',
  'label': 'max-sm:inline max-sm:ms-2 max-sm:font-medium sm:inline sm:ms-1.5 sm:font-bold',
  'auto-sm': 'max-sm:inline max-sm:ms-2 max-sm:font-medium sm:inline sm:ms-1.5 sm:font-bold',
  'auto-md': 'max-sm:inline max-sm:ms-2 max-sm:font-medium sm:hidden md:inline md:ms-1.5 md:font-bold',
  'auto-lg': 'max-sm:inline max-sm:ms-2 max-sm:font-medium sm:hidden lg:inline lg:ms-1.5 lg:font-bold',
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
      <span [class]="labelClasses()">{{ resolvedLabel() }}</span>
    }
  `,
  host: {
    '[disabled]': 'disabled()',
    '[attr.aria-disabled]': '(busy() || disabled()) ? "true" : null',
    '[attr.aria-busy]': 'busy() ? "true" : null',
    '[attr.aria-label]': 'resolvedLabel()',
    '[attr.title]': 'resolvedLabel()',
    '[attr.type]': 'resolvedType()',
    '[class]': 'hostClasses()',
    '(click)': 'onHostClick($event)',
  },
})
export class ActionButtonComponent {
  private readonly elementRef = inject(ElementRef<HTMLButtonElement>);
  private readonly overflowContext = inject(OVERFLOW_MENU_CONTEXT, { optional: true });

  private readonly _appAction = signal<ActionIconKey>('refresh');
  @Input('appAction')
  set appAction(value: ActionIconKey | string | null | undefined) {
    if (value && value in ACTION_CATALOG) {
      this._appAction.set(value as ActionIconKey);
    }
  }
  get appAction(): Signal<ActionIconKey> {
    return this.computedAppAction;
  }

  readonly computedAppAction = computed<ActionIconKey>(() => {
    const fromSignal = this._appAction();
    if (fromSignal && fromSignal in ACTION_CATALOG && fromSignal !== 'refresh') {
      return fromSignal;
    }
    const fromAttr = this.elementRef?.nativeElement?.getAttribute('appAction');
    if (fromAttr && fromAttr in ACTION_CATALOG) {
      return fromAttr as ActionIconKey;
    }
    return fromSignal;
  });

  private readonly _label = signal<string | undefined>(undefined);
  @Input()
  set label(value: string | undefined | null) {
    this._label.set(value ?? undefined);
  }
  get label(): Signal<string | undefined> {
    return this._label;
  }

  private readonly _display = signal<ActionDisplay>('auto');
  @Input()
  set display(value: ActionDisplay | undefined | null) {
    if (value) this._display.set(value);
  }
  get display(): Signal<ActionDisplay> {
    return this._display;
  }

  private readonly _labelFrom = signal<ActionLabelFrom>('sm');
  @Input()
  set labelFrom(value: ActionLabelFrom | undefined | null) {
    if (value) this._labelFrom.set(value);
  }
  get labelFrom(): Signal<ActionLabelFrom> {
    return this._labelFrom;
  }

  private readonly _tone = signal<ActionTone | undefined>(undefined);
  @Input()
  set tone(value: ActionTone | undefined | null) {
    this._tone.set(value ?? undefined);
  }
  get tone(): Signal<ActionTone | undefined> {
    return this._tone;
  }

  private readonly _size = signal<ActionSize>('md');
  @Input()
  set size(value: ActionSize | undefined | null) {
    if (value && value in SIZE_CLASSES) {
      this._size.set(value);
    }
  }
  get size(): Signal<ActionSize> {
    return this._size;
  }

  private readonly _busy = signal<boolean>(false);
  @Input()
  set busy(value: unknown) {
    this._busy.set(booleanAttribute(value));
  }
  get busy(): Signal<boolean> {
    return this._busy;
  }

  private readonly _disabled = signal<boolean>(false);
  @Input()
  set disabled(value: unknown) {
    this._disabled.set(booleanAttribute(value));
  }
  get disabled(): Signal<boolean> {
    return this._disabled;
  }

  private readonly _type = signal<string>('button');
  @Input()
  set type(value: string | undefined | null) {
    if (value) this._type.set(value);
  }
  get type(): Signal<string> {
    return this._type;
  }

  constructor() {
    // جلوگیری از کلیک و submit در سطح capture هنگام busy بودن بدون حذف فوکوس بومی
    this.elementRef.nativeElement.addEventListener(
      'click',
      (event: MouseEvent) => {
        if (this.disabled() || this.busy()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true }
    );
  }

  readonly catalogEntry = computed<ActionCatalogEntry>(() => ACTION_CATALOG[this.appAction()]);

  readonly isSensitive = computed<boolean>(() => this.catalogEntry().sensitive);

  readonly resolvedLabel = computed<string>(() => {
    return this._label() ?? this.elementRef?.nativeElement?.getAttribute('label') ?? this.catalogEntry().defaultLabel;
  });

  readonly resolvedSize = computed<ActionSize>(() => {
    const fromSignal = this._size();
    if (fromSignal !== 'md') return fromSignal;
    const fromAttr = this.elementRef?.nativeElement?.getAttribute('size') as ActionSize;
    return (fromAttr && fromAttr in SIZE_CLASSES) ? fromAttr : fromSignal;
  });

  readonly userDisplay = computed<ActionDisplay>(() => {
    const fromSignal = this._display();
    if (fromSignal !== 'auto') return fromSignal;
    const fromAttr = this.elementRef?.nativeElement?.getAttribute('display') as ActionDisplay;
    return fromAttr ?? fromSignal;
  });

  readonly resolvedType = computed<string>(() => {
    const fromSignal = this._type();
    if (fromSignal !== 'button') return fromSignal;
    return this.elementRef?.nativeElement?.getAttribute('type') ?? fromSignal;
  });

  readonly resolvedTone = computed<ActionTone>(() => this.tone() ?? this.catalogEntry().tone);

  /**
   * نمایش نهایی دکمه:
   * کارهای حساس همیشه label هستند.
   * ۳ دکمه استاندارد سربرگ در auto به‌طور پیش‌فرض icon هستند.
   */
  readonly effectiveDisplay = computed<ActionDisplay>(() => {
    if (this.isSensitive()) return 'label';
    if (this.userDisplay() === 'auto' && this.catalogEntry().defaultIconOnly) return 'icon';
    return this.userDisplay();
  });

  readonly isEffectiveIconOnly = computed<boolean>(() => {
    if (this.isSensitive()) return false;
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

  readonly iconClasses = computed<string>(() => {
    if (this.busy()) {
      return 'w-4 h-4 shrink-0 animate-spin';
    }
    const sz = this.resolvedSize();
    if (sz === 'lg') return 'w-5 h-5 shrink-0';
    if (sz === 'sm') return 'w-3.5 h-3.5 shrink-0';
    return 'w-4 h-4 shrink-0';
  });

  readonly labelClasses = computed<string>(() => {
    if (this.overflowContext != null) {
      if (this.isSensitive() || this.effectiveDisplay() === 'label') {
        return OVERFLOW_LABEL_CLASSES['label'];
      }
      if (this.effectiveDisplay() === 'icon') {
        return OVERFLOW_LABEL_CLASSES['icon'];
      }
      if (this.labelFrom() === 'md') return OVERFLOW_LABEL_CLASSES['auto-md'];
      if (this.labelFrom() === 'lg') return OVERFLOW_LABEL_CLASSES['auto-lg'];
      return OVERFLOW_LABEL_CLASSES['auto-sm'];
    }
    if (this.isSensitive() || this.effectiveDisplay() === 'label') {
      return 'inline ms-1.5 font-bold';
    }
    return `${LABEL_FROM_CLASSES[this.labelFrom()]} font-bold`;
  });

  readonly hostClasses = computed<string>(() => {
    const justifyClass =
      this.overflowContext != null ? 'max-sm:justify-start sm:justify-center' : 'justify-center';
    const cursorClass =
      this.disabled() || this.busy() ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-95';
    const base = `inline-flex items-center ${justifyClass} font-bold whitespace-nowrap shrink-0 transition-all duration-150 select-none ${cursorClass} disabled:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:active:scale-100 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1`;
    const toneClass = TONE_CLASSES[this.resolvedTone()];
    const szConfig = SIZE_CLASSES[this.resolvedSize()];

    let sizeClass: string;
    if (this.overflowContext != null) {
      const desktopSizeClass = this.isEffectiveIconOnly()
        ? szConfig.iconOnly
        : (this.effectiveDisplay() === 'label' || this.isSensitive())
          ? szConfig.withLabel
          : szConfig.auto;
      sizeClass = `max-sm:w-full max-sm:text-start max-sm:px-3 max-sm:py-2 max-sm:rounded-xl max-sm:text-xs max-sm:min-h-[40px] max-sm:min-w-[40px] ${desktopSizeClass}`;
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
    if (this.disabled() || this.busy()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.overflowContext != null) {
      this.overflowContext.close();
    }
  }
}

