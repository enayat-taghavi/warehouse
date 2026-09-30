import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { ReportFieldMeta, ReportOperator } from '../../core/models/report.model';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';

/**
 * کنترل مقدار فیلتر بر اساس نوع فیلد + اپراتور
 * تاریخ: انتخاب جلالی با ng-persian-datepicker، خروجی ISO میلادی ($event.gregorian)
 */
@Component({
  selector: 'app-filter-value',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective],
  template: `
    @if (operator === 'isnull') {
      <select [ngModel]="value" (ngModelChange)="setValue($event)" class="ctl custom-select">
        <option [ngValue]="true">خالی است (بدون مقدار)</option>
        <option [ngValue]="false">خالی نیست (دارای مقدار)</option>
      </select>
    } @else if (operator === 'between') {
      <div class="flex items-center gap-1.5">
        @if (isDate) {
          <div class="relative flex items-center">
            <ng-persian-datepicker [dateInitValue]="false" (dateOnSelect)="setPair(0, $event.gregorian)">
              <input type="text" [formControl]="datePair0Control" class="ctl pr-7 pl-2 w-32 cursor-pointer bg-slate-50/50 hover:bg-white" placeholder="از تاریخ…" readonly>
            </ng-persian-datepicker>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute right-2 text-slate-400 pointer-events-none" appIcon="calendar"></svg>
            @if (pair()[0]) {
              <button type="button" (click)="setPair(0, null)" class="absolute left-1 text-slate-400 hover:text-rose-600 text-xs font-bold" title="پاک‌کردن">✕</button>
            }
          </div>
          <span class="text-slate-400 text-xs">تا</span>
          <div class="relative flex items-center">
            <ng-persian-datepicker [dateInitValue]="false" (dateOnSelect)="setPair(1, $event.gregorian)">
              <input type="text" [formControl]="datePair1Control" class="ctl pr-7 pl-2 w-32 cursor-pointer bg-slate-50/50 hover:bg-white" placeholder="تا تاریخ…" readonly>
            </ng-persian-datepicker>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute right-2 text-slate-400 pointer-events-none" appIcon="calendar"></svg>
            @if (pair()[1]) {
              <button type="button" (click)="setPair(1, null)" class="absolute left-1 text-slate-400 hover:text-rose-600 text-xs font-bold" title="پاک‌کردن">✕</button>
            }
          </div>
        } @else {
          <input type="number" class="ctl w-24" placeholder="از: 100" [ngModel]="pair()[0]" (ngModelChange)="setPair(0, $event)">
          <span class="text-slate-400 text-xs">تا</span>
          <input type="number" class="ctl w-24" placeholder="تا: 500" [ngModel]="pair()[1]" (ngModelChange)="setPair(1, $event)">
        }
      </div>
    } @else if (operator === 'in') {
      @if (field?.type === 'choice' && field?.choices?.length) {
        <div class="flex flex-wrap gap-1 max-w-sm p-1 bg-slate-50/70 border border-slate-200/80 rounded-xl">
          @for (c of field!.choices; track c) {
            <button type="button" (click)="toggleChoice(c)"
                    class="text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-95 cursor-pointer shadow-2xs"
                    [class.bg-indigo-600]="isChoiceSelected(c)"
                    [class.text-white]="isChoiceSelected(c)"
                    [class.border-indigo-600]="isChoiceSelected(c)"
                    [class.bg-white]="!isChoiceSelected(c)"
                    [class.text-slate-700]="!isChoiceSelected(c)"
                    [class.border-slate-200]="!isChoiceSelected(c)">
              {{ c }}
            </button>
          }
        </div>
      } @else {
        <input type="text" class="ctl min-w-44" placeholder="مقادیر با ویرگول (مثال: A, B, C)"
               [ngModel]="rawListText" (ngModelChange)="onListInput($event)">
      }
    } @else if (field?.type === 'boolean') {
      <select [ngModel]="value" (ngModelChange)="setValue($event)" class="ctl custom-select">
        <option [ngValue]="true">بله</option>
        <option [ngValue]="false">خیر</option>
      </select>
    } @else if (field?.type === 'choice') {
      <select [ngModel]="value" (ngModelChange)="setValue($event)" class="ctl custom-select min-w-36">
        <option [ngValue]="null" disabled>انتخاب کنید…</option>
        @for (c of field!.choices || []; track c) {
          <option [ngValue]="c">{{ c }}</option>
        }
      </select>
    } @else if (isDate) {
      <div class="relative flex items-center">
        <ng-persian-datepicker [dateInitValue]="false" (dateOnSelect)="setValue($event.gregorian)">
          <input type="text" [formControl]="singleDateControl" class="ctl pr-7 pl-2 w-36 cursor-pointer bg-slate-50/50 hover:bg-white" placeholder="انتخاب تاریخ…" readonly>
        </ng-persian-datepicker>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute right-2 text-slate-400 pointer-events-none" appIcon="calendar"></svg>
        @if (value) {
          <button type="button" (click)="setValue(null)" class="absolute left-1 text-slate-400 hover:text-rose-600 text-xs font-bold" title="پاک‌کردن">✕</button>
        }
      </div>
    } @else if (field?.type === 'number') {
      <input type="number" class="ctl w-32" placeholder="مثال: 1200" [ngModel]="value" (ngModelChange)="setValue($event)">
    } @else {
      <input type="text" class="ctl min-w-40" placeholder="مثال: PIPING یا کد قطعه…" [ngModel]="value" (ngModelChange)="setValue($event)">
    }
  `,
  styles: [`
    .ctl {
      font-size: 0.75rem;
      padding: 0.375rem 0.5rem;
      border-radius: 0.75rem;
      border: 1px solid #e2e8f0;
      background: #fff;
      outline: none;
      transition: all 0.2s;
    }
    .ctl:focus { border-color: #818cf8; box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15); }
  `],
})
export class FilterValueComponent implements OnChanges {
  @Input() field: ReportFieldMeta | null = null;
  @Input() operator: ReportOperator = 'eq';
  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  datePair0Control = new FormControl('');
  datePair1Control = new FormControl('');
  singleDateControl = new FormControl('');

  rawListText = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['operator']) {
      if (this.operator === 'in') {
        if (!this.field?.choices?.length) {
          this.rawListText = Array.isArray(this.value) ? this.value.join('، ') : (this.value || '');
        }
      }
      this.syncDateControls();
    }
  }

  private syncDateControls(): void {
    if (this.operator === 'between') {
      const p = this.pair();
      this.datePair0Control.setValue(this.formatDateLabel(p[0]), { emitEvent: false });
      this.datePair1Control.setValue(this.formatDateLabel(p[1]), { emitEvent: false });
    } else if (this.isDate) {
      this.singleDateControl.setValue(this.formatDateLabel(this.value), { emitEvent: false });
    }
  }

  get isDate(): boolean {
    return this.field?.type === 'date' || this.field?.type === 'datetime';
  }

  formatDateLabel(isoDate: string | null): string {
    if (!isoDate) return '';
    try {
      const parts = String(isoDate).split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const date = new Date(y, m - 1, d);
        if (!isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(date);
        }
      }
    } catch {
      // fallback
    }
    return String(isoDate);
  }

  isChoiceSelected(c: string): boolean {
    return Array.isArray(this.value) && this.value.includes(c);
  }

  toggleChoice(c: string): void {
    const arr: string[] = Array.isArray(this.value) ? [...this.value] : [];
    const idx = arr.indexOf(c);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(c);
    }
    this.setValue(arr);
  }

  setValue(v: any): void {
    this.value = v;
    this.valueChange.emit(v);
  }

  onListInput(text: string): void {
    this.rawListText = text;
    const arr = String(text)
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    this.setValue(arr);
  }

  pair(): any[] {
    return Array.isArray(this.value) && this.value.length === 2 ? this.value : [null, null];
  }

  setPair(i: number, v: any): void {
    const p = [...this.pair()];
    p[i] = v;
    this.setValue(p);
  }
}

