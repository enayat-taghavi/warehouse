import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, forwardRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export interface SearchSelectOption {
  value: any;
  label: string;
  /** متن کمرنگ کنار گزینه (مثلاً کد بانک) */
  hint?: string;
  /** واژه‌های اضافی برای جستجو (کد ملی، تلفن، …) */
  keywords?: string;
}

/** یکسان‌سازی متن جستجو: ی/ک عربی، ارقام فارسی/عربی، فاصله و نیم‌فاصله */
export function normalizeSearch(v: string): string {
  return (v || '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[‌\s]+/g, ' ')
    .trim().toLowerCase();
}

let nextId = 0;

/**
 * کادر انتخاب جستجوپذیر: کاربر در همان کادر اصلی تایپ می‌کند و فهرست زیر آن کوتاه می‌شود
 * (بی کادر جستجوی جدا). صفحه‌کلید: بالا/پایین، Enter، Escape.
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelectComponent), multi: true }],
  template: `
    <div class="relative">
      <input
        #field
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.id]="inputId || null"
        [attr.aria-label]="ariaLabel || null"
        [attr.aria-controls]="listId"
        [attr.aria-expanded]="open"
        [attr.aria-activedescendant]="open && activeIndex >= 0 ? listId + '-' + activeIndex : null"
        [value]="open ? query : selectedLabel"
        [placeholder]="open && selectedLabel ? selectedLabel : placeholder"
        [disabled]="disabled"
        (focus)="openList()"
        (click)="openList()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
        [class]="inputClass + ' pe-8'"
      />
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        appIcon="chevron-down" aria-hidden="true"
        class="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 pointer-events-none"></svg>
      <ul
        *ngIf="open"
        role="listbox"
        [attr.id]="listId"
        (mousedown)="$event.preventDefault()"
        class="absolute z-50 left-0 right-0 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-0.5"
        [ngClass]="openUp ? 'bottom-full mb-1' : 'top-full mt-1'"
      >
        <li
          *ngFor="let o of filtered; let i = index"
          role="option"
          [attr.id]="listId + '-' + i"
          [attr.aria-selected]="isSelected(o)"
          (click)="select(o)"
          (mouseenter)="activeIndex = i"
          class="min-h-[36px] px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold flex items-center justify-between gap-2 transition-colors"
          [ngClass]="i === activeIndex ? 'bg-indigo-50 text-indigo-800' : (isSelected(o) ? 'text-indigo-700' : 'text-slate-800')"
        >
          <span class="truncate">{{ o.label }}</span>
          <span *ngIf="o.hint" class="text-[10px] text-slate-400 font-mono shrink-0">{{ o.hint }}</span>
        </li>
        <li *ngIf="filtered.length === 0" class="px-2.5 py-2 text-center text-xs text-slate-500">{{ emptyText }}</li>
      </ul>
    </div>
  `
})
export class SearchSelectComponent implements ControlValueAccessor {
  private cdr = inject(ChangeDetectorRef);

  @Input() options: SearchSelectOption[] = [];
  @Input() placeholder = 'انتخاب کنید...';
  @Input() inputId = '';
  @Input() ariaLabel = '';
  @Input() emptyText = 'موردی پیدا نشد';
  @Input() openUp = false;
  @Input() inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors';
  @Output() selected = new EventEmitter<any>();

  @ViewChild('field') field?: ElementRef<HTMLInputElement>;

  readonly listId = `search-select-${++nextId}`;
  value: any = null;
  disabled = false;
  open = false;
  query = '';
  activeIndex = -1;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  get selectedLabel(): string {
    const o = this.options.find(x => this.isSelected(x));
    if (o) return o.label;
    return this.value === null || this.value === undefined ? '' : String(this.value);
  }

  get filtered(): SearchSelectOption[] {
    const q = normalizeSearch(this.query);
    if (!q) return this.options;
    return this.options.filter(o => normalizeSearch(`${o.label} ${o.hint || ''} ${o.keywords || ''}`).includes(q));
  }

  isSelected(o: SearchSelectOption): boolean {
    return this.value !== null && this.value !== undefined && String(o.value) === String(this.value);
  }

  openList(): void {
    if (this.disabled || this.open) return;
    this.open = true;
    this.query = '';
    this.activeIndex = this.filtered.findIndex(o => this.isSelected(o));
  }

  onInput(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
    this.open = true;
    this.activeIndex = this.filtered.length ? 0 : -1;
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.filtered;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) { this.openList(); return; }
      if (!list.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = (this.activeIndex + step + list.length) % list.length;
    } else if (event.key === 'Enter') {
      if (this.open && this.activeIndex >= 0 && list[this.activeIndex]) {
        event.preventDefault();
        this.select(list[this.activeIndex]);
      }
    } else if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.close();
    }
  }

  onBlur(): void {
    this.close();
    this.onTouched();
  }

  select(o: SearchSelectOption): void {
    this.value = o.value;
    this.onChange(o.value);
    this.selected.emit(o.value);
    this.close();
  }

  private close(): void {
    this.open = false;
    this.query = '';
    this.activeIndex = -1;
    this.cdr.markForCheck();
  }

  writeValue(v: any): void {
    this.value = v;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (v: any) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }
}
