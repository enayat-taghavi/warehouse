import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Company } from '../../../../core/models/company.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

/**
 * ستون‌های حسابداری فهرست شرکت‌ها (مشارکت از راه `companies.listCells`).
 * `variant`: `'table'` درون خانهٔ جدول دسکتاپ، `'card'` درون کارت موبایل.
 */

const FA_NUMBER = new Intl.NumberFormat('fa-IR');

/** شمارنده با رقم فارسی (ت۷) */
function faCount(n: number | null | undefined): string {
  return FA_NUMBER.format(n ?? 0);
}

/** ستون «پروژه‌ها» */
@Component({
  selector: 'app-company-projects-cell',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  host: { class: 'block' },
  template: `
    @if (variant === 'table') {
      <span class="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full text-[11px]">
        {{ fa(company?.projects_count) }} پروژه
      </span>
    } @else {
      <div class="flex items-center gap-1.5">
        <span class="text-slate-400 text-[10px]">پروژه‌ها:</span>
        <span class="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-600" appIcon="briefcase"></svg>
          <span>{{ fa(company?.projects_count) }}</span>
        </span>
      </div>
    }
  `
})
export class CompanyProjectsCellComponent {
  @Input() company: Company | null = null;
  @Input() variant: 'table' | 'card' = 'table';
  readonly fa = faCount;
}

/** ستون «سلامت مدارک» */
@Component({
  selector: 'app-company-documents-health-cell',
  standalone: true,
  imports: [CommonModule, SvgIconDirective],
  host: { class: 'block' },
  template: `
    @if (variant === 'table') {
      <span *ngIf="company?.documents_health_status === 'valid'"
            class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full text-[10px]"
            title="کلیه مدارک رسمی معتبر هستند">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600" appIcon="check-circle"></svg>
        <span>{{ fa(company?.documents_count) }} مدرک معتبر</span>
      </span>
      <span *ngIf="company?.documents_health_status === 'expiring_soon'"
            class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full text-[10px]"
            title="هشدار: دست‌کم یک مدرک کمتر از ۳۰ روز مانده به انقضا">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-600" appIcon="alert-triangle"></svg>
        <span>در آستانه انقضا ({{ fa(company?.documents_count) }})</span>
      </span>
      <span *ngIf="company?.documents_health_status === 'expired'"
            class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full text-[10px]"
            title="اخطار: دست‌کم یک مدرک منقضی شده است!">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-rose-600" appIcon="alert-circle"></svg>
        <span>منقضی شده ({{ fa(company?.documents_count) }})</span>
      </span>
      <span *ngIf="!company?.documents_health_status || company?.documents_health_status === 'no_documents'"
            class="inline-flex items-center gap-1 font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[10px]">
        <span>—</span>
        <span>فاقد مدرک</span>
      </span>
    } @else {
      <!-- سلامت اسناد و مدارک رسمی -->
      <div class="flex items-center justify-between text-[11px] px-1">
        <span class="text-slate-500 text-[10px]">وضعیت مدارک:</span>
        <div>
          <span *ngIf="company?.documents_health_status === 'valid'"
                class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600" appIcon="check-circle"></svg>
            <span>{{ fa(company?.documents_count) }} مدرک معتبر</span>
          </span>
          <span *ngIf="company?.documents_health_status === 'expiring_soon'"
                class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-amber-600" appIcon="alert-triangle"></svg>
            <span>در آستانه انقضا ({{ fa(company?.documents_count) }})</span>
          </span>
          <span *ngIf="company?.documents_health_status === 'expired'"
                class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-rose-600" appIcon="alert-circle"></svg>
            <span>منقضی شده ({{ fa(company?.documents_count) }})</span>
          </span>
          <span *ngIf="!company?.documents_health_status || company?.documents_health_status === 'no_documents'"
                class="inline-flex items-center gap-1 font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[10px]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400" appIcon="file-text"></svg>
            <span>فاقد مدرک</span>
          </span>
        </div>
      </div>
    }
  `
})
export class CompanyDocumentsHealthCellComponent {
  @Input() company: Company | null = null;
  @Input() variant: 'table' | 'card' = 'table';
  readonly fa = faCount;
}
