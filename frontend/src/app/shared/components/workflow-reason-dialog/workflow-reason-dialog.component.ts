import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

@Component({
  selector: 'app-workflow-reason-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  template: `
    <div
      *ngIf="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm fade-in"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title"
      dir="rtl"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col transition-all"
        (click)="$event.stopPropagation()"
      >
        <!-- سربرگ -->
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="file-text"></svg>
            </div>
            <h3 class="text-sm font-black text-slate-800 leading-snug">{{ title }}</h3>
          </div>
          <button
            type="button"
            (click)="onCancel()"
            class="w-9 h-9 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 active:scale-95 transition-all cursor-pointer"
            title="انصراف و بستن"
            aria-label="انصراف و بستن"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="x"></svg>
          </button>
        </div>

        <!-- بدنه -->
        <div class="p-4 flex flex-col gap-2">
          <label for="workflow-reason-input" class="text-xs font-bold text-slate-700">
            دلیل اقدام <span class="text-rose-500 font-bold">*</span>
          </label>

          <textarea
            #reasonInput
            id="workflow-reason-input"
            [(ngModel)]="reason"
            (input)="onInputChange()"
            rows="4"
            class="w-full text-xs font-medium p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 resize-y"
            [ngClass]="hasError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-100 bg-slate-50/40 focus:bg-white'"
            placeholder="دلیل یا توضیحات لازم را بنویسید..."
            [attr.aria-invalid]="hasError ? 'true' : 'false'"
            [attr.aria-describedby]="hasError ? 'workflow-reason-error' : null"
          ></textarea>

          <!-- پیام خطای معتبرسازی فیلد یا خطای سرور -->
          <div
            *ngIf="errorMessage"
            id="workflow-reason-error"
            class="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50/90 border border-rose-200/70 px-2.5 py-1.5 rounded-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="alert-circle" class="shrink-0"></svg>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <!-- دکمه‌ها -->
        <div class="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            (click)="onCancel()"
            class="px-4 py-2 min-h-[40px] text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl active:scale-95 transition-all cursor-pointer"
            title="انصراف"
            aria-label="انصراف"
          >
            انصراف
          </button>
          <button
            type="button"
            (click)="onConfirm()"
            class="px-4 py-2 min-h-[40px] text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl active:scale-95 transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            [title]="confirmLabel"
            [attr.aria-label]="confirmLabel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="check"></svg>
            <span>{{ confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class WorkflowReasonDialogComponent implements OnChanges {
  @Input() open = false;
  @Input() title = 'ثبت دلیل';
  @Input() confirmLabel = 'تأیید';
  @Input() serverError = '';

  @Output() confirmed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('reasonInput') reasonInput?: ElementRef<HTMLTextAreaElement>;

  reason = '';
  clientError = '';

  get errorMessage(): string {
    return this.clientError || this.serverError || '';
  }

  get hasError(): boolean {
    return !!this.errorMessage;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.reason = '';
        this.clientError = '';
        setTimeout(() => this.reasonInput?.nativeElement.focus(), 50);
      } else {
        this.reason = '';
        this.clientError = '';
      }
    }
    if (changes['serverError'] && this.serverError) {
      this.clientError = '';
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.onCancel();
    }
  }

  onInputChange(): void {
    if (this.clientError && this.reason.trim()) {
      this.clientError = '';
    }
  }

  onConfirm(): void {
    const trimmed = this.reason.trim();
    if (!trimmed) {
      this.clientError = 'نوشتن دلیل الزامی است';
      this.reasonInput?.nativeElement.focus();
      return;
    }
    this.clientError = '';
    this.confirmed.emit(trimmed);
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
