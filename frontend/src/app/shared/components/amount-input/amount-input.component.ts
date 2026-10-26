import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

/** تبدیل ارقام فارسی/عربی به لاتین و حذف هر چیز غیر رقم */
function extractDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 0x30 && c <= 0x39) out += ch;
    else if (c >= PERSIAN_ZERO && c <= PERSIAN_ZERO + 9) out += String(c - PERSIAN_ZERO);
    else if (c >= ARABIC_ZERO && c <= ARABIC_ZERO + 9) out += String(c - ARABIC_ZERO);
  }
  return out;
}

function normalize(digits: string): string {
  const t = digits.replace(/^0+/, '');
  return t === '' && digits !== '' ? '0' : t;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ورودی مبلغ (ریال): کیبورد عددی، جداکننده هزارگان، ارقام فارسی/عربی، معادل تومان */
@Component({
  selector: 'app-amount-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AmountInputComponent), multi: true }],
  template: `
    <div class="min-w-0">
      <input
        #field
        type="text"
        inputmode="numeric"
        dir="ltr"
        autocomplete="off"
        class="w-full min-h-[40px] bg-surface border border-line rounded-xl px-3 text-sm text-fg text-end tabular-nums placeholder:text-fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
        [attr.id]="inputId() || null"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-describedby]="describedBy() || null"
        [attr.aria-invalid]="invalid() || null"
        [class.border-rose-400]="invalid()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="display()"
        (input)="onInput($event)"
        (blur)="onTouched()"
      />
      @if (tomanText(); as t) {
        <p class="text-[11px] text-fg-muted mt-1 tabular-nums">{{ t }}</p>
      }
    </div>
  `,
})
export class AmountInputComponent implements ControlValueAccessor {
  readonly placeholder = input('');
  readonly inputId = input('');
  readonly ariaLabel = input('');
  /** شناسهٔ پیام خطای کنار فیلد */
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  private readonly digits = signal('');
  readonly disabled = signal(false);
  readonly display = computed(() => group(this.digits()));
  readonly tomanText = computed(() => {
    const d = this.digits();
    if (!d) return '';
    const fa = new Intl.NumberFormat('fa-IR');
    if (d.length <= 15) {
      const toman = Math.floor(Number(d) / 10);
      return `${fa.format(toman)} تومان`;
    }
    return `${fa.format(BigInt(d) / 10n)} تومان`;
  });

  private onChange: (v: string | null) => void = () => {};
  onTouched: () => void = () => {};

  onInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const digitsLeft = extractDigits(raw.slice(0, caret)).length;
    const allDigits = extractDigits(raw);
    const leadingStripped = allDigits.length - allDigits.replace(/^0+/, '').length;
    const next = normalize(allDigits);
    this.digits.set(next);
    const formatted = group(next);
    el.value = formatted;
    // جای نشانگر: به تعداد رقم‌های سمت چپ نشانگر (پس از حذف صفرهای ابتدایی)
    let target = Math.max(0, digitsLeft - Math.min(leadingStripped, digitsLeft));
    if (next === '0' && allDigits.length > 0) target = Math.min(target, 1);
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < target) {
      if (formatted[pos] !== ',') seen++;
      pos++;
    }
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* برخی نوع‌های ورودی انتخاب را پشتیبانی نمی‌کنند */
    }
    this.onChange(next === '' ? null : next);
  }

  writeValue(v: number | string | null): void {
    const d = v === null || v === undefined ? '' : normalize(extractDigits(String(v).split('.')[0]));
    this.digits.set(d);
    const el = this.field()?.nativeElement;
    if (el) el.value = group(d);
  }
  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
