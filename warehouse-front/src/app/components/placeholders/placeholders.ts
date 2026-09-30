import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-placeholders',
  imports: [CommonModule, RouterModule, SvgIconDirective],
  template: `
    <div class="space-y-6 fade-in text-right max-w-4xl mx-auto py-8 px-4" dir="rtl">
      <div class="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-8 sm:p-12 relative overflow-hidden text-center">
        <div class="absolute -left-12 -top-12 w-48 h-48 bg-gradient-to-br from-indigo-100/40 to-violet-100/40 rounded-full blur-2xl pointer-events-none"></div>
        <div class="absolute -right-12 -bottom-12 w-48 h-48 bg-gradient-to-tl from-amber-100/30 to-indigo-100/30 rounded-full blur-2xl pointer-events-none"></div>
        
        <div class="w-16 h-16 mx-auto mb-5 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-sm">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" appIcon="briefcase"></svg>
        </div>

        <h2 class="text-lg sm:text-xl font-black text-slate-800 mb-2">این کارتابل در دست ساخت و توسعه است</h2>
        <p class="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
          فرآیندهای تکمیلی، گزارش‌ها و ابزارهای مرتبط با این بخش طبق برنامه‌ریزی در حال آماده‌سازی و استقرار است.
        </p>

        <a routerLink="/app/warehouse/dashboard" class="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="home"></svg>
          <span>بازگشت به داشبورد انبارگردانی</span>
        </a>
      </div>
    </div>
  `
})
export class Placeholders {}
