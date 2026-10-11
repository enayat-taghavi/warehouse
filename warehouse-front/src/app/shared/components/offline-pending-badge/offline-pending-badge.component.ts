import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NetworkStatusService, ConnectionState } from '../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { SyncQueueEntry, SyncErrorEntry, offlineDb, getCurrentActiveAppScope } from '../../../core/services/offline-db';
import { SystemHealthService, ServerHealthResponse, ClientStorageHealth } from '../../../core/services/system-health.service';
import { StateService } from '../../../services/state.service';
import { Subscription } from 'rxjs';
import { ConflictResolutionModalComponent } from '../conflict-resolution-modal/conflict-resolution-modal.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

/**
 * مرکز یکپارچه وضعیت اتصال، صف انتظار و صندوق خطاهای همگام‌سازی
 * (Unified Network, Offline Queue & Sync Error Hub)
 *
 * حالت‌ها:
 * • mode="inline" → برای سطرهای جدول (فشرده، غیرتعاملی، نشان‌دهنده رکورد آفلاین)
 * • mode="header" → برای هدر سراسری با پاپ‌اور تعاملی کامل، مدیریت صف و خطاها
 */
@Component({
  selector: 'app-offline-pending-badge',
  standalone: true,
  imports: [CommonModule, ConflictResolutionModalComponent, SvgIconDirective],
  template: `
    <!-- Inline Mode (مخصوص سطرهای جدول) -->
    <ng-container *ngIf="mode === 'inline'">
      <span
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-sky-200 bg-sky-50 text-sky-700 text-[9px] font-bold whitespace-nowrap align-middle"
        title="این مورد هنوز به سرور ارسال نشده است. به‌محض برقراری اتصال، خودکار همگام‌سازی می‌شود."
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="cloud-off"></svg>
        در انتظار ارسال
      </span>
    </ng-container>

    <!-- Header Mode: کپسول یکپارچه وضعیت، صف و هشدار خطا -->
    <div *ngIf="mode === 'header'" class="relative inline-block text-right select-none" dir="rtl">
      <!-- Status Pill Button (دکمه کپسولی ادغام‌شده) -->
      <button
        type="button"
        (click)="togglePopover($event)"
        class="relative inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-95 whitespace-nowrap tap-target sm:min-h-[36px]"
        [ngClass]="pillClasses"
        [title]="tooltipText"
      >
        <!-- 1. Connected / Synced -->
        <ng-container *ngIf="networkState === 'online' && !isSyncing && pendingCount === 0">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span class="text-emerald-700 font-extrabold hidden sm:inline">متصل</span>
        </ng-container>

        <!-- 2. Syncing in progress -->
        <ng-container *ngIf="isSyncing">
          <svg class="animate-spin text-sky-600" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="spinner"></svg>
          <span class="text-sky-800 font-extrabold hidden sm:inline">در حال ارسال ({{ pendingCount }})</span>
          <!-- موبایل: شمارنده در حباب گوشه تا قرص ثابت ۴۰×۴۰ بماند و سربرگ ۳۶۰px نشکند -->
          <span class="sm:hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-700 text-white text-[10px] font-mono font-black leading-none flex items-center justify-center border-2 border-white">{{ pendingCount }}</span>
        </ng-container>

        <!-- 3. Offline or Pending in queue -->
        <ng-container *ngIf="!isSyncing && (networkState !== 'online' || pendingCount > 0)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" [ngClass]="networkState === 'online' ? 'text-amber-600' : 'text-rose-600'" appIcon="cloud-off"></svg>
          <span *ngIf="networkState !== 'online' && pendingCount === 0" class="text-rose-800 font-extrabold hidden sm:inline">آفلاین</span>
          <span *ngIf="pendingCount > 0" class="text-amber-800 font-extrabold hidden sm:inline">صف ارسال ({{ pendingCount }})</span>
          <span *ngIf="pendingCount > 0" class="sm:hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-700 text-white text-[10px] font-mono font-black leading-none flex items-center justify-center border-2 border-white">{{ pendingCount }}</span>
        </ng-container>

        <!-- 4. ادغام زنگوله/هشدار خطای همگام‌سازی (Integrated Sync Error Chip) -->
        <span
          *ngIf="errorCount > 0"
          class="hidden sm:inline-flex items-center gap-1 mr-0.5 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black shadow-xs animate-pulse"
          title="{{ errorCount }} خطای ارسال نیازمند بررسی"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" appIcon="bell"></svg>
          <span>{{ errorCount }}</span>
        </span>
        <span
          *ngIf="errorCount > 0"
          class="sm:hidden absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono font-black leading-none flex items-center justify-center border-2 border-white animate-pulse"
          title="{{ errorCount }} خطای ارسال نیازمند بررسی"
        >{{ errorCount }}</span>
      </button>

      <!-- Backdrop to close on click outside -->
      <div *ngIf="isPopoverOpen" class="fixed inset-0 z-40 bg-black/5 sm:bg-transparent" (click)="closePopover()"></div>

      <!-- Unified Popover Modal (پاپ‌اور یکپارچه مرکز همگام‌سازی — بازشونده به سمت چپ بدون تداخل با سایدبار) -->
      <div
        *ngIf="isPopoverOpen"
        class="fixed inset-x-3 top-[74px] sm:absolute sm:inset-x-auto sm:right-0 sm:left-auto sm:top-full sm:mt-2 w-auto sm:w-[350px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xl z-50 overflow-hidden text-right fade-in flex flex-col max-h-[calc(100dvh-90px)] sm:max-h-[520px]"
        (click)="$event.stopPropagation()"
      >
        <!-- Modal Top Header -->
        <div class="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full" [ngClass]="statusDotClass"></div>
            <span class="text-xs font-black text-slate-800 dark:text-slate-100">مرکز اتصال و همگام‌سازی</span>
          </div>
          <button
            type="button"
            (click)="closePopover()"
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-200/50 transition-all cursor-pointer tap-target sm:min-w-[28px] sm:min-h-[28px]"
            title="بستن"
            aria-label="بستن"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="x"></svg>
          </button>
        </div>

        <!-- ─── 3 Navigation Tabs (Segmented Pill Style) ─── -->
        <div class="flex border-b border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/50 p-1.5 gap-1 shrink-0 text-xs font-bold">
          <button
            type="button"
            (click)="activeTab = 'queue'"
            class="flex-1 py-1.5 px-2 rounded-xl text-center transition-all cursor-pointer flex items-center justify-center gap-1 text-[11px]"
            [ngClass]="activeTab === 'queue' 
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-black' 
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
          >
            <span>صف ارسال</span>
            <span
              *ngIf="pendingCount > 0"
              class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold"
              [ngClass]="activeTab === 'queue' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'"
            >
              {{ pendingCount }}
            </span>
          </button>
          <button
            type="button"
            (click)="activeTab = 'status'"
            class="flex-1 py-1.5 px-2 rounded-xl text-center transition-all cursor-pointer text-[11px]"
            [ngClass]="activeTab === 'status' 
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-black' 
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
          >
            سلامت و شبکه
          </button>
          <button
            type="button"
            (click)="activeTab = 'errors'"
            class="flex-1 py-1.5 px-2 rounded-xl text-center transition-all cursor-pointer flex items-center justify-center gap-1 text-[11px]"
            [ngClass]="activeTab === 'errors' 
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs font-black' 
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
          >
            <span>خطاها</span>
            <span
              *ngIf="errorCount > 0"
              class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-rose-500 text-white"
            >
              {{ errorCount }}
            </span>
          </button>
        </div>

        <!-- ─── Tab Content Scrollable Area ─── -->
        <div class="overflow-y-auto flex-1 p-3.5 space-y-3 text-xs">

          <!-- ─── TAB 1: سلامت و شبکه (Live Health Matrix & Sync) ─── -->
          <div *ngIf="activeTab === 'status'" class="space-y-2 fade-in">
            <!-- Health Score Mini Widget -->
            <div class="p-2.5 rounded-xl bg-slate-900 text-white border border-slate-800 flex items-center justify-between shadow-xs">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" [ngClass]="healthScore >= 85 ? 'bg-emerald-400 animate-ping' : healthScore >= 60 ? 'bg-amber-400' : 'bg-rose-500'"></span>
                <span class="text-[11px] font-bold text-slate-300">نمره سلامت زیرساخت:</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-black text-sm" [ngClass]="healthScore >= 85 ? 'text-emerald-400' : healthScore >= 60 ? 'text-amber-400' : 'text-rose-400'">
                  {{ healthScore }}٪
                </span>
                <span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {{ healthScore >= 85 ? 'پایدار' : healthScore >= 60 ? 'هشدار' : 'خطا' }}
                </span>
              </div>
            </div>

            <!-- Network Ping & Latency -->
            <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="wifi"></svg>
                <span>تاخیر شبکه (Ping):</span>
              </div>
              <span dir="ltr" class="font-bold font-mono text-[11px]" [ngClass]="networkPingMs && networkPingMs <= 300 ? 'text-emerald-600 dark:text-emerald-400' : networkPingMs && networkPingMs <= 700 ? 'text-amber-600' : 'text-rose-600'">
                {{ networkPingMs !== null && networkPingMs >= 0 ? (networkPingMs + ' ms') : 'قطع ارتباط' }}
              </span>
            </div>

            <!-- Server Core Services Status (Postgres, Redis, WebSocket) -->
            <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-1.5">
              <div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                <span>سرویس‌های هسته سرور:</span>
                <span class="text-[9px] text-slate-400 font-normal" *ngIf="serverHealth?.total_check_time_ms">
                  پاسخ: <span dir="ltr" class="font-mono font-bold">{{ serverHealth?.total_check_time_ms }} ms</span>
                </span>
              </div>
              <div class="grid grid-cols-3 gap-1 text-[10px] font-bold">
                <!-- PostgreSQL -->
                <div class="p-1 rounded-lg border text-center" [ngClass]="serverHealth?.components?.database?.status === 'healthy' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700'">
                  دیتابیس
                </div>
                <!-- Redis -->
                <div class="p-1 rounded-lg border text-center" [ngClass]="serverHealth?.components?.redis?.status === 'healthy' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700'">
                  ردیس
                </div>
                <!-- WebSocket -->
                <div class="p-1 rounded-lg border text-center" [ngClass]="serverHealth?.components?.websocket?.status === 'healthy' ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700'">
                  سوکت
                </div>
              </div>
            </div>

            <!-- Local Client Offline Storage -->
            <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span class="text-slate-500 dark:text-slate-400">حافظه مرورگر (IndexedDB):</span>
              <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-[10px]">
                {{ clientStorage?.formattedUsed || '۰' }} ({{ clientStorage?.usagePercent || 0 }}٪)
              </span>
            </div>

            <!-- Pending Queue Summary -->
            <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span class="text-slate-500 dark:text-slate-400 font-medium">صف ارسال محلی:</span>
              <div class="flex items-center gap-2">
                <span class="font-bold text-[11px]" [class.text-amber-600]="pendingCount > 0" [class.text-emerald-600]="pendingCount === 0">
                  {{ pendingCount > 0 ? (pendingCount + ' رکورد در انتظار') : 'همگام و بدون صف' }}
                </span>
                <button
                  *ngIf="pendingCount > 0"
                  type="button"
                  (click)="activeTab = 'queue'"
                  class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
                >
                  مشاهده
                </button>
              </div>
            </div>

            <!-- Actions Row: Diagnostic Check + Manual Sync -->
            <div class="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                (click)="onRunQuickDiagnostic()"
                [disabled]="isDiagnosing"
                class="py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" [class.animate-spin]="isDiagnosing" appIcon="refresh-cw"></svg>
                <span>{{ isDiagnosing ? 'در حال تست...' : 'تست عیب‌یابی' }}</span>
              </button>

              <button
                type="button"
                (click)="onManualSync()"
                [disabled]="isSyncing || networkState !== 'online'"
                class="py-1.5 px-2 rounded-xl text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                [ngClass]="networkState === 'online' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400'"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" [class.animate-spin]="isSyncing" appIcon="refresh-cw"></svg>
                <span>{{ isSyncing ? 'در حال ارسال...' : 'ارسال دستی' }}</span>
              </button>
            </div>

            <!-- Full Dashboard Link for Managerial Roles -->
            <div class="pt-1 text-center" *ngIf="canAccessFullHealthDashboard">
              <button
                type="button"
                (click)="navigateToFullHealthDashboard()"
                class="w-full py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>مشاهده داشبورد کامل مانیتورینگ</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="chevron-left"></svg>
              </button>
            </div>
          </div>

          <!-- ─── TAB 2: جزئیات صف انتظار و امکان لغو ─── -->
          <div *ngIf="activeTab === 'queue'" class="space-y-2.5 fade-in">
            <div class="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                درخواست‌های ذخیره‌شده روی دستگاه ({{ queueEntries.length }})
              </span>
              <button
                *ngIf="queueEntries.length > 1"
                type="button"
                (click)="onClearAllQueue()"
                class="text-[10px] text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
              >
                لغو همه موارد
              </button>
            </div>

            <!-- Empty Queue State -->
            <div *ngIf="queueEntries.length === 0" class="py-8 text-center">
              <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
              </div>
              <p class="text-xs font-bold text-slate-700 dark:text-slate-300">صف انتظار خالی است</p>
              <p class="text-[10px] text-slate-400 mt-1">کلیه تغییرات شما با سرور همگام شده‌اند.</p>
            </div>

            <!-- Queue Items List -->
            <div *ngFor="let item of queueEntries" class="p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 space-y-2 transition-all">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-2.5 min-w-0 flex-1">
                  <!-- Human Action Icon Badge -->
                  <div
                    class="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold shadow-2xs"
                    [ngClass]="getHumanActionBadgeClass(item)"
                  >
                    {{ getHumanActionIcon(item) }}
                  </div>

                  <!-- Human Readable Title & Subtitle -->
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-black text-slate-800 dark:text-slate-100 leading-snug">
                      {{ getHumanTitle(item) }}
                    </div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium leading-tight">
                      {{ getHumanSubtitle(item) }}
                    </div>
                    <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                      <span>ثبت در ساعت {{ formatTime(item.createdAt) }}</span>
                      <span *ngIf="item.retryCount > 0" class="text-amber-500 font-bold">({{ item.retryCount }} بار تلاش)</span>
                    </div>
                  </div>
                </div>

                <!-- Action: Cancel / Discard this item from queue -->
                <button
                  type="button"
                  (click)="onCancelQueueItem(item.id!)"
                  class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[11px] font-bold transition-all active:scale-95 shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
                  title="لغو این عملیات و جلوگیری از ارسال آن به سرور"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="x"></svg>
                  <span>لغو</span>
                </button>
              </div>
            </div>
          </div>

          <!-- ─── TAB 3: صندوق خطاهای همگام‌سازی ─── -->
          <div *ngIf="activeTab === 'errors'" class="space-y-2.5 fade-in">
            <div class="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <span class="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                خطاهای ثبت‌شده توسط سرور ({{ syncErrors.length }})
              </span>
              <button
                *ngIf="syncErrors.length > 0"
                type="button"
                (click)="onDismissAllErrors()"
                class="text-[10px] text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
              >
                پاک کردن همه
              </button>
            </div>

            <!-- Empty Errors State -->
            <div *ngIf="syncErrors.length === 0" class="py-8 text-center">
              <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
              </div>
              <p class="text-xs font-bold text-slate-700 dark:text-slate-300">هیچ خطایی وجود ندارد</p>
              <p class="text-[10px] text-slate-400 mt-1">تمام درخواست‌های ارسالی با موفقیت پردازش شده‌اند.</p>
            </div>

            <!-- Errors List -->
            <div *ngFor="let err of syncErrors" class="p-2.5 rounded-xl border border-rose-200/70 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5 transition-all">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 mb-1">
                    <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300">
                      {{ err.statusCode || 'ERR' }}
                    </span>
                    <span class="text-[10px] font-mono font-bold text-slate-500">{{ err.method }}</span>
                    <span class="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                      {{ err.serverMessage || 'خطای اعتبارسنجی سرور' }}
                    </span>
                  </div>
                  <p class="text-[9px] text-slate-400 font-mono">{{ formatTime(err.failedAt) }}</p>
                </div>

                <!-- Dismiss Button -->
                <button
                  type="button"
                  (click)="onDismissError(err.id!)"
                  class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition-colors shrink-0 cursor-pointer"
                  title="حذف خطا"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="x"></svg>
                </button>
              </div>

              <!-- Actions: Conflict Resolver (3-Way Merge) + Retry + View Data -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rose-100 dark:border-rose-900/50">
                <!-- 3-Way Merge Button for 409 Conflicts -->
                <button
                  *ngIf="isConflictError(err)"
                  type="button"
                  (click)="openConflictResolver(err)"
                  class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 animate-pulse"
                  title="مقایسه بصری نسخه‌ها و حل تداخل خوش‌بینانه"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="git-pull-request"></svg>
                  <span>حل تداخل (۳-Way Merge)</span>
                </button>

                <button
                  type="button"
                  (click)="onRetryError(err.id!)"
                  class="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="rotate-cw"></svg>
                  تلاش مجدد
                </button>
                <button
                  *ngIf="hasPayload(err.body)"
                  type="button"
                  (click)="togglePayload(err.id!)"
                  class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-all cursor-pointer"
                >
                  {{ expandedPayloadId === err.id ? 'بستن داده' : 'نمایش داده' }}
                </button>
              </div>

              <!-- Error Payload Details -->
              <div *ngIf="expandedPayloadId === err.id" class="mt-1 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-[9px] font-mono max-h-32 overflow-y-auto space-y-0.5">
                <div *ngFor="let field of formatPayload(err.body)" class="flex items-start gap-1 py-0.5">
                  <span class="text-slate-400 shrink-0" dir="ltr">{{ field.key }}:</span>
                  <span class="text-slate-700 dark:text-slate-300 break-all" dir="auto">{{ field.value }}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Visual 3-Way Conflict Resolution Modal -->
      <app-conflict-resolution-modal
        [isOpen]="isConflictModalOpen"
        [errorEntry]="selectedConflictError"
        (closed)="onConflictModalClosed()"
        (resolved)="onConflictResolved($event)"
      ></app-conflict-resolution-modal>
    </div>
  `,
  styles: [`
    .fade-in {
      animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class OfflinePendingBadgeComponent implements OnInit, OnDestroy {
  @Input() mode: 'header' | 'inline' = 'inline';
  @Output() openSyncInbox = new EventEmitter<void>();

  networkState: ConnectionState = 'online';
  isSyncing = false;
  pendingCount = 0;
  lastSyncTime: number | null = null;
  errorCount = 0;

  isPopoverOpen = false;
  activeTab: 'queue' | 'status' | 'errors' = 'queue';

  queueEntries: SyncQueueEntry[] = [];
  syncErrors: SyncErrorEntry[] = [];
  expandedPayloadId: number | null = null;

  isConflictModalOpen = false;
  selectedConflictError: SyncErrorEntry | null = null;

  healthScore = 100;
  networkPingMs: number | null = null;
  serverHealth: ServerHealthResponse | null = null;
  clientStorage: ClientStorageHealth | null = null;
  isDiagnosing = false;

  private network = NetworkStatusService.getInstance();
  private sync = OfflineSyncService.getInstance();
  private healthService = inject(SystemHealthService);
  private router = inject(Router);
  private subs: Subscription[] = [];

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef,
    private state: StateService
  ) {}

  ngOnInit(): void {
    if (this.mode === 'header') {
      this.networkState = this.network.state;
      this.subs.push(
        this.network.state$.subscribe((state) => {
          this.networkState = state;
          this.cdr.markForCheck();
        })
      );

      this.subs.push(
        this.sync.isSyncing$.subscribe((syncing) => {
          this.isSyncing = syncing;
          if (!syncing && this.isPopoverOpen) {
            this.refreshData();
          }
          this.cdr.markForCheck();
        })
      );

      this.subs.push(
        this.sync.pendingCount$.subscribe((count) => {
          this.pendingCount = count;
          if (this.isPopoverOpen) {
            this.loadQueueEntries();
          }
          this.cdr.markForCheck();
        })
      );

      this.subs.push(
        this.sync.lastSyncTime$.subscribe((time) => {
          this.lastSyncTime = time;
          this.cdr.markForCheck();
        })
      );

      this.subs.push(
        this.sync.errorCount$.subscribe((errors) => {
          this.errorCount = errors;
          if (this.isPopoverOpen) {
            this.loadSyncErrors();
          }
          this.cdr.markForCheck();
        })
      );

      this.subs.push(
        this.healthService.healthScore$.subscribe(score => {
          this.healthScore = score;
          this.cdr.markForCheck();
        }),
        this.healthService.networkPingMs$.subscribe(ping => {
          this.networkPingMs = ping;
          this.cdr.markForCheck();
        }),
        this.healthService.serverHealth$.subscribe(srv => {
          this.serverHealth = srv;
          this.cdr.markForCheck();
        }),
        this.healthService.clientStorage$.subscribe(st => {
          this.clientStorage = st;
          this.cdr.markForCheck();
        }),
        this.healthService.isDiagnosing$.subscribe(d => {
          this.isDiagnosing = d;
          this.cdr.markForCheck();
        })
      );
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isPopoverOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.closePopover();
    }
  }

  togglePopover(event: MouseEvent): void {
    event.stopPropagation();
    this.isPopoverOpen = !this.isPopoverOpen;
    if (this.isPopoverOpen) {
      // انتخاب هوشمند تب فعال بر اساس اولویت
      if (this.errorCount > 0) {
        this.activeTab = 'errors';
      } else {
        this.activeTab = 'queue';
      }
      this.refreshData();
    }
  }

  closePopover(): void {
    this.isPopoverOpen = false;
    this.expandedPayloadId = null;
    this.cdr.markForCheck();
  }

  async refreshData(): Promise<void> {
    await Promise.all([this.loadQueueEntries(), this.loadSyncErrors()]);
    this.cdr.markForCheck();
  }

  humanTitlesCache: Map<number, { title: string; subtitle: string; icon: string; badgeClass: string }> = new Map();

  async loadQueueEntries(): Promise<void> {
    try {
      this.queueEntries = await this.sync.getQueueEntries();

      // بازیابی مشخصات کاربرپسند برای تک‌تک اقلام صف
      for (const item of this.queueEntries) {
        if (!item.id) continue;
        const details = this.resolveHumanSyncDetails(item);

        // اگر نام کاربر در StateService پیدا نشد، در کش IndexedDB آفلاین جستجو کن
        if (details.title.includes('کاربر شماره #') && item.url) {
          const targetId = this.getTargetId(item.url);
          if (targetId) {
            try {
              const cached = await offlineDb.apiCache.filter(e => e.url.includes('/users')).first();
              if (cached?.response) {
                const list = Array.isArray(cached.response) ? cached.response : (cached.response.results || []);
                const u = list.find((x: any) => String(x.id) === String(targetId));
                if (u) {
                  const userName = (u.first_name ? (u.first_name + ' ' + (u.last_name || '')).trim() : '') || u.username;
                  if (userName) {
                    details.title = item.method === 'DELETE' ? `حذف حساب کاربری «${userName}»` : `ویرایش حساب کاربری «${userName}»`;
                    if (u.username) details.subtitle = `نام کاربری: ${u.username} • درخواست حذف دائمی از سیستم`;
                  }
                }
              }
            } catch {}
          }
        }

        // اگر نام نقش پیدا نشد، در کش IndexedDB جستجو کن
        if (details.title.includes('نقش شماره #') && item.url) {
          const targetId = this.getTargetId(item.url);
          if (targetId) {
            try {
              const cached = await offlineDb.apiCache.filter(e => e.url.includes('/roles')).first();
              if (cached?.response) {
                const list = Array.isArray(cached.response) ? cached.response : (cached.response.results || []);
                const r = list.find((x: any) => String(x.id) === String(targetId));
                if (r) {
                  const roleName = r.title || r.name;
                  if (roleName) {
                    details.title = item.method === 'DELETE' ? `حذف نقش کاربری «${roleName}»` : `ویرایش نقش کاربری «${roleName}»`;
                    details.subtitle = 'درخواست حذف این نقش از سیستم';
                  }
                }
              }
            } catch {}
          }
        }

        this.humanTitlesCache.set(item.id, details);
      }
    } catch (e) {
      console.warn('[SyncBadge] Failed to load queue:', e);
      this.queueEntries = [];
    }
    this.cdr.markForCheck();
  }

  async loadSyncErrors(): Promise<void> {
    try {
      this.syncErrors = await this.sync.getErrors();
    } catch (e) {
      console.warn('[SyncBadge] Failed to load errors:', e);
      this.syncErrors = [];
    }
    this.cdr.markForCheck();
  }

  async onCancelQueueItem(id: number): Promise<void> {
    try {
      await this.sync.cancelQueueEntry(id);
      this.queueEntries = this.queueEntries.filter(item => item.id !== id);
    } catch (e) {
      console.error('[SyncBadge] Failed to cancel queue item:', e);
    }
    this.cdr.markForCheck();
  }

  async onClearAllQueue(): Promise<void> {
    if (!confirm('آیا از لغو و حذف کلیه رکوردهای صف انتظار اطمینان دارید؟ این تغییرات دیگر به سرور ارسال نخواهند شد.')) {
      return;
    }
    try {
      await this.sync.clearQueue();
      this.queueEntries = [];
    } catch (e) {
      console.error('[SyncBadge] Failed to clear queue:', e);
    }
    this.cdr.markForCheck();
  }

  async onDismissError(id: number): Promise<void> {
    try {
      await this.sync.dismissError(id);
      this.syncErrors = this.syncErrors.filter(err => err.id !== id);
    } catch (e) {
      console.error('[SyncBadge] Failed to dismiss error:', e);
    }
    this.cdr.markForCheck();
  }

  async onDismissAllErrors(): Promise<void> {
    try {
      await this.sync.dismissAllErrors();
      this.syncErrors = [];
    } catch (e) {
      console.error('[SyncBadge] Failed to dismiss all errors:', e);
    }
    this.cdr.markForCheck();
  }

  isConflictError(err: SyncErrorEntry): boolean {
    return (
      err.statusCode === 409 ||
      !!err.serverResponse?.server_record ||
      (err.serverMessage?.includes('تداخل') ?? false)
    );
  }

  openConflictResolver(err: SyncErrorEntry): void {
    this.selectedConflictError = err;
    this.isConflictModalOpen = true;
    this.cdr.markForCheck();
  }

  onConflictModalClosed(): void {
    this.isConflictModalOpen = false;
    this.selectedConflictError = null;
    this.cdr.markForCheck();
  }

  async onConflictResolved(result: { success: boolean; message: string; online: boolean }): Promise<void> {
    this.isConflictModalOpen = false;
    this.selectedConflictError = null;
    await this.refreshData();
    this.cdr.markForCheck();
  }

  async onRetryError(id: number): Promise<void> {
    try {
      await this.sync.retryError(id);
      this.syncErrors = this.syncErrors.filter(err => err.id !== id);
      await this.loadQueueEntries();
    } catch (e) {
      console.error('[SyncBadge] Failed to retry error:', e);
    }
    this.cdr.markForCheck();
  }

  async onManualSync(): Promise<void> {
    if (this.isSyncing || this.networkState !== 'online') return;
    try {
      await this.sync.forceSync();
      await this.refreshData();
    } catch (e) {
      console.error('[SyncBadge] Manual sync error:', e);
    }
    this.cdr.markForCheck();
  }

  async onRunQuickDiagnostic(): Promise<void> {
    try {
      await this.healthService.runFullDiagnostic(true);
    } catch (e) {
      console.error('[SyncBadge] Diagnostic error:', e);
    }
    this.cdr.markForCheck();
  }

  get canAccessFullHealthDashboard(): boolean {
    const role = sessionStorage.getItem('active_role_persona') || '';
    return ['supervisor', 'accountant', 'manager', 'admin', 'superuser'].includes(role) || !['operator', 'counter'].includes(role);
  }

  navigateToFullHealthDashboard(): void {
    this.closePopover();
    const scope = getCurrentActiveAppScope();
    this.router.navigate(['/app', scope, 'health']);
  }

  togglePayload(id: number): void {
    this.expandedPayloadId = this.expandedPayloadId === id ? null : id;
    this.cdr.markForCheck();
  }

  hasPayload(body: any): boolean {
    return !!body && typeof body === 'object' && Object.keys(body).length > 0;
  }

  formatPayload(body: any): { key: string; value: string }[] {
    if (!body || typeof body !== 'object') return [];
    return Object.entries(body)
      .filter(([k]) => !k.startsWith('_'))
      .slice(0, 10)
      .map(([k, v]) => ({
        key: k,
        value: v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80),
      }));
  }

  getTargetId(url?: string): string | null {
    if (!url) return null;
    const match = url.match(/\/(\d+)\/?(?:\?.*)?$/);
    return match ? match[1] : null;
  }

  getShortUrl(url?: string): string {
    if (!url) return '—';
    try {
      const u = url.split('?')[0];
      return u.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/api/, '');
    } catch {
      return url;
    }
  }

  getHumanTitle(item: SyncQueueEntry): string {
    const cached = item.id ? this.humanTitlesCache.get(item.id) : null;
    if (cached) return cached.title;
    return this.resolveHumanSyncDetails(item).title;
  }

  getHumanSubtitle(item: SyncQueueEntry): string {
    const cached = item.id ? this.humanTitlesCache.get(item.id) : null;
    if (cached) return cached.subtitle;
    return this.resolveHumanSyncDetails(item).subtitle;
  }

  getHumanActionIcon(item: SyncQueueEntry): string {
    const cached = item.id ? this.humanTitlesCache.get(item.id) : null;
    if (cached) return cached.icon;
    return this.resolveHumanSyncDetails(item).icon;
  }

  getHumanActionBadgeClass(item: SyncQueueEntry): string {
    const cached = item.id ? this.humanTitlesCache.get(item.id) : null;
    if (cached) return cached.badgeClass;
    return this.resolveHumanSyncDetails(item).badgeClass;
  }

  resolveHumanSyncDetails(item: SyncQueueEntry): { title: string; subtitle: string; icon: string; badgeClass: string } {
    const url = item.url || '';
    const method = item.method?.toUpperCase() || 'GET';
    const targetId = this.getTargetId(url);
    const body = item.body || {};

    // 1. حساب‌های کاربری (Users)
    if (url.includes('/users')) {
      let userName = '';
      let username = '';

      // ۱. جستجو در حافظه برنامه (StateService)
      const uFromState = this.state?.appState?.users?.find((u: any) => String(u.id) === String(targetId));
      if (uFromState) {
        userName = (uFromState.first_name ? (uFromState.first_name + ' ' + (uFromState.last_name || '')).trim() : '') || uFromState.username;
        username = uFromState.username || '';
      }

      // ۲. اگر از طریق بدنه ارسال شده (POST / PATCH)
      if (!userName && (body.first_name || body.username)) {
        userName = (body.first_name ? (body.first_name + ' ' + (body.last_name || '')).trim() : '') || body.username;
        username = body.username || '';
      }

      const displayUser = userName ? `«${userName}»` : (targetId ? `کاربر شماره #${targetId}` : 'کاربر');
      const subInfo = username ? `نام کاربری: ${username}` : (targetId ? `شناسه سیستمی: #${targetId}` : '');

      if (method === 'DELETE') {
        return {
          title: `حذف حساب کاربر ${displayUser}`,
          subtitle: subInfo ? `${subInfo} • درخواست حذف دائمی از سیستم` : 'درخواست حذف دائمی حساب کاربری از سیستم',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      if (method === 'POST') {
        return {
          title: `ایجاد کاربر جدید: ${displayUser}`,
          subtitle: subInfo || 'ثبت اطلاعات و دسترسی‌های کاربر جدید',
          icon: '👤',
          badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
        };
      }
      return {
        title: `ویرایش مشخصات ${displayUser}`,
        subtitle: subInfo || 'بروزرسانی اطلاعات و دسترسی‌های کاربر',
        icon: '✏️',
        badgeClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
      };
    }

    // 2. نقش‌های کاربری (Custom Roles)
    if (url.includes('/roles') || url.includes('/custom-roles')) {
      let roleTitle = body.name || body.title || '';
      if (!roleTitle) {
        const rFromState = this.state?.appState?.roles?.find((r: any) => String(r.id) === String(targetId));
        if (rFromState) roleTitle = rFromState.title || rFromState.name;
      }
      const displayRole = roleTitle ? `«${roleTitle}»` : (targetId ? `نقش شماره #${targetId}` : 'نقش سازمانی');

      if (method === 'DELETE') {
        return {
          title: `حذف نقش کاربری ${displayRole}`,
          subtitle: 'درخواست حذف این نقش از لیست نقش‌های سیستم',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      if (method === 'POST') {
        return {
          title: `تعریف نقش جدید: ${displayRole}`,
          subtitle: 'ایجاد نقش سازمانی و اعطای مجوزها',
          icon: '🛡️',
          badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
        };
      }
      return {
        title: `ویرایش نقش کاربری ${displayRole}`,
        subtitle: 'تغییر مجوزها یا عنوان این نقش',
        icon: '✏️',
        badgeClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
      };
    }

    // 3. دسترسی‌ها (Permissions)
    if (url.includes('/permissions')) {
      const permName = body.name || body.codename;
      if (method === 'DELETE') {
        return {
          title: 'حذف مجوز دسترسی',
          subtitle: permName ? `کد دسترسی: ${permName}` : 'حذف دسترسی از سیستم',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `مدیریت مجوزها ${permName ? ': ' + permName : ''}`,
        subtitle: 'بروزرسانی جدول دسترسی‌های سامانه',
        icon: '🔑',
        badgeClass: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
      };
    }

    // 4. کارکرد روزانه پرسنل (Attendance)
    if (url.includes('/attendance')) {
      const person = body.personnel_name || body.personnel || '';
      const date = body.date || body.work_date || '';
      const statusFa = body.status === 'PRESENT' ? 'حاضر' : (body.status === 'ABSENT' ? 'غایب' : (body.status === 'LEAVE' ? 'مرخصی' : (body.status || '')));
      const hours = body.hours || body.effective_hours ? `${body.hours || body.effective_hours} ساعت` : '';
      const displayPerson = person ? `«${person}»` : 'پرسنل';

      if (method === 'DELETE') {
        return {
          title: `حذف کارکرد ${displayPerson}`,
          subtitle: date ? `مربوط به تاریخ ${date}` : 'لغو ثبت کارکرد روزانه',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `ثبت کارکرد ${displayPerson}${statusFa ? ' (' + statusFa + ')' : ''}`,
        subtitle: `${date ? 'تاریخ: ' + date : ''}${hours ? ' • کارکرد: ' + hours : ''}` || 'ثبت حضور و غیاب پرسنل',
        icon: '⏱️',
        badgeClass: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
      };
    }

    // 5. تردد ناوگان (Fleet Trips)
    if (url.includes('/trips')) {
      const plate = body.plate_number || body.vehicle_name || '';
      const driver = body.driver_name || '';
      const displayVehicle = plate ? `خودرو «${plate}»` : 'ناوگان حمل و نقل';

      if (method === 'DELETE') {
        return {
          title: `حذف تردد ${displayVehicle}`,
          subtitle: driver ? `راننده: ${driver}` : 'لغو تردد ثبت‌شده',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `ثبت تردد ${displayVehicle}`,
        subtitle: driver ? `راننده: ${driver}` : 'ثبت تردد خودرو',
        icon: '🚛',
        badgeClass: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
      };
    }

    // 6. انبارگردانی و شمارش (Inventory Counts)
    if (url.includes('/count-tasks') || url.includes('/count')) {
      const tag = body.tag_number || body.tag || '';
      const qty = body.count_quantity ?? body.counted_quantity;
      const itemName = body.item_name || body.name || '';
      const displayItem = itemName ? `«${itemName}»` : (tag ? `تگ شمارش #${tag}` : 'کالای انبار');

      if (method === 'DELETE') {
        return {
          title: `حذف شمارش ${displayItem}`,
          subtitle: 'لغو رکورد شمارش فیزیکی',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `شمارش انبار: ${displayItem}`,
        subtitle: `${qty !== undefined ? 'تعداد: ' + qty + ' عدد' : ''}${tag ? ' • تگ: ' + tag : ''}` || 'ثبت شمارش فیزیکی کالا در انبارگردانی',
        icon: '📦',
        badgeClass: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
      };
    }

    // 7. پرونده پرسنلی (Personnel Profiles)
    if (url.includes('/personnel') || url.includes('/profiles')) {
      const name = body.full_name || (body.first_name ? (body.first_name + ' ' + (body.last_name || '')).trim() : '');
      const code = body.personnel_code || '';
      const displayName = name ? `«${name}»` : (targetId ? `پرسنل شماره #${targetId}` : 'پرونده پرسنلی');

      if (method === 'DELETE') {
        return {
          title: `حذف پرونده ${displayName}`,
          subtitle: code ? `کد پرسنلی: ${code}` : 'حذف اطلاعات پرسنل از سیستم',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `ویرایش پرونده ${displayName}`,
        subtitle: code ? `کد پرسنلی: ${code}` : 'بروزرسانی مشخصات پرسنلی و احکام شغلی',
        icon: '👤',
        badgeClass: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
      };
    }

    // 8. اقلام انبار (Items)
    if (url.includes('/items')) {
      const name = body.name || body.description || '';
      const code = body.code || body.sku || '';
      const displayItem = name ? `«${name}»` : (code ? `کد کالا ${code}` : (targetId ? `کالا #${targetId}` : 'کالای انبار'));

      if (method === 'DELETE') {
        return {
          title: `حذف کالای ${displayItem}`,
          subtitle: code ? `کد کالا: ${code}` : 'حذف قلم کالا از فهرست انبار',
          icon: '🗑️',
          badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
        };
      }
      return {
        title: `ویرایش کالای ${displayItem}`,
        subtitle: code ? `کد کالا: ${code}` : 'بروزرسانی مشخصات کالا در سیستم',
        icon: '📦',
        badgeClass: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
      };
    }

    // سایر موارد عمومی
    return {
      title: method === 'DELETE' ? `درخواست حذف رکورد #${targetId || ''}` : (method === 'POST' ? 'ثبت اطلاعات جدید در سیستم' : 'ویرایش اطلاعات در سیستم'),
      subtitle: 'تغییر ذخیره‌شده روی دستگاه، در انتظار همگام‌سازی با سرور',
      icon: '📝',
      badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
    };
  }

  formatTime(timestamp?: number): string {
    if (!timestamp) return 'نامشخص';
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'لحظاتی قبل';
    }
  }

  get pillClasses(): Record<string, boolean> {
    if (this.networkState === 'online' && !this.isSyncing && this.pendingCount === 0) {
      return {
        'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100': true,
      };
    }
    if (this.isSyncing) {
      return {
        'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100': true,
      };
    }
    if (this.networkState !== 'online') {
      return {
        'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100': true,
      };
    }
    return {
      'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100': true,
    };
  }

  get tooltipText(): string {
    if (this.errorCount > 0) {
      return `${this.errorCount} خطای ارسال در صف وجود دارد (کلیک برای بررسی و مدیریت)`;
    }
    if (this.networkState === 'online' && !this.isSyncing && this.pendingCount === 0) {
      return 'اتصال برقرار است و تمام داده‌ها همگام هستند (کلیک برای جزئیات)';
    }
    if (this.isSyncing) {
      return `در حال ارسال ${this.pendingCount} مورد به سرور...`;
    }
    if (this.networkState !== 'online') {
      return `آفلاین - ${this.pendingCount} مورد در صف ارسال محلی (کلیک برای مشاهده و لغو)`;
    }
    return `${this.pendingCount} مورد در صف ارسال (کلیک برای مشاهده و لغو)`;
  }

  get statusDotClass(): Record<string, boolean> {
    return {
      'bg-emerald-500': this.networkState === 'online',
      'bg-amber-500': this.networkState === 'server-unreachable',
      'bg-rose-500': this.networkState === 'offline',
    };
  }

  get serverStatusText(): string {
    if (this.networkState === 'online') return 'در دسترس و متصل';
    if (this.networkState === 'server-unreachable') return 'قطع موقت سرور';
    return 'قطع ارتباط کامل';
  }

  get serverStatusClass(): Record<string, boolean> {
    return {
      'text-emerald-600': this.networkState === 'online',
      'text-amber-600': this.networkState === 'server-unreachable',
      'text-rose-600': this.networkState === 'offline',
    };
  }

  get formattedLastSync(): string {
    if (!this.lastSyncTime) return 'هنوز ثبت نشده';
    return this.formatTime(this.lastSyncTime);
  }
}
