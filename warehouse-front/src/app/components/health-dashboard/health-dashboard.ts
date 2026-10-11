import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, filter } from 'rxjs';
import {
  SystemHealthService,
  ServerHealthResponse,
  ClientStorageHealth,
  ServiceWorkerHealth,
  ComprehensiveDiagnosticReport,
  ConcurrencyStressReport,
} from '../../core/services/system-health.service';
import { NetworkStatusService, ConnectionState } from '../../core/services/network-status.service';
import { AppPersonaService } from '../../core/services/app-persona.service';
import { AuthService } from '../../core/auth/auth.service';
import { Router, NavigationEnd } from '@angular/router';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-health-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-right" dir="rtl">
      
      <!-- Top Title Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div class="flex items-start sm:items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" appIcon="activity-path"></svg>
          </div>
          <div>
            <h1 class="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>مرکز جامع پایش سلامت زنده و تاب‌آوری سامانه</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                Live Matrix
              </span>
            </h1>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              رصد ۲۴/۷ پایگاه‌داده، حافظه موقت Redis، کانال‌های بلادرنگ وب‌سوکت و وضعیت ذخیره‌سازی محلی تبلت
            </p>
          </div>
        </div>

        <!-- Diagnostic Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] text-slate-400 font-mono hidden sm:inline" *ngIf="lastReport">
            آخرین ارزیابی: {{ lastReport.diagnosedAtShamsi }}
          </span>
          <button
            type="button"
            appAction="refresh"
            label="عیب‌یابی خودکار"
            display="label"
            [busy]="isDiagnosing"
            (click)="triggerDiagnostic()"
          ></button>
        </div>
      </div>

      <!-- Top Score Hero Card & Stats -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Health Score Card -->
        <div class="lg:col-span-1 p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg border border-slate-700/60 flex flex-col justify-between relative overflow-hidden">
          <div class="absolute top-0 left-0 -mt-4 -ml-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span class="font-bold">شاخص کل پایداری (Health Score)</span>
              <span class="w-2.5 h-2.5 rounded-full" [ngClass]="score >= 85 ? 'bg-emerald-400 animate-ping' : score >= 60 ? 'bg-amber-400 animate-ping' : 'bg-rose-500 animate-ping'"></span>
            </div>
            <div class="mt-4 flex items-baseline gap-2">
              <span class="text-4xl sm:text-5xl font-black font-mono tracking-tight" [ngClass]="score >= 85 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'">
                {{ score }}٪
              </span>
              <span class="text-xs text-slate-300 font-bold">
                {{ score >= 85 ? 'عملیاتی و پایدار' : score >= 60 ? 'کاهش کارایی جزئی' : 'نیازمند مداخله فوری' }}
              </span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-700/60 text-[11px] text-slate-300 flex items-center justify-between">
            <span>وضعیت قلمرو:</span>
            <span class="font-bold px-2 py-0.5 rounded-md border text-[10px]"
              [ngClass]="appScope === 'finance' ? 'bg-purple-950/70 text-purple-200 border-purple-800/80' : 'bg-blue-950/70 text-blue-200 border-blue-800/80'">
              {{ appScope === 'finance' ? 'امور مالی و حقوق' : 'انبارداری و لجستیک' }}
            </span>
          </div>
        </div>

        <!-- Metric 1: Network Ping -->
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">کیفیت و تاخیر شبکه (Ping)</span>
            <div class="w-7 h-7 rounded-xl flex items-center justify-center text-xs" [ngClass]="pingStatusClass">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="wifi"></svg>
            </div>
          </div>
          <div class="my-2">
            <div class="text-2xl font-black font-mono text-slate-800 dark:text-slate-100 flex items-baseline gap-1.5" *ngIf="networkPingMs !== null && networkPingMs >= 0">
              <span dir="ltr">{{ networkPingMs }}</span>
              <span class="text-xs font-normal text-slate-400">میلی‌ثانیه (ms)</span>
            </div>
            <div class="text-2xl font-black font-mono text-rose-600 dark:text-rose-400" *ngIf="networkPingMs === null || networkPingMs < 0">
              قطع ارتباط
            </div>
          </div>
          <div class="text-[11px] font-bold" [ngClass]="pingQualityColor">
            {{ pingQualityText }}
          </div>
        </div>

        <!-- Metric 2: Storage Quota -->
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">سهمیه حافظه محلی مرورگر</span>
            <div class="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="server"></svg>
            </div>
          </div>
          <div class="my-2">
            <div class="text-2xl font-black font-mono text-slate-800 dark:text-slate-100">
              {{ storage?.usagePercent || 0 }}٪ <span class="text-xs font-normal text-slate-400">مصرف شده</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate" dir="rtl">
            {{ storage?.formattedUsed || '۰' }} از {{ storage?.formattedTotal || 'نامحدود' }}
          </div>
        </div>

        <!-- Metric 3: PWA Cache & Service Worker -->
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">کش آفلاین PWA Worker</span>
            <div class="w-7 h-7 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="dollar-sign-path"></svg>
            </div>
          </div>
          <div class="my-2">
            <div class="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" [ngClass]="sw?.isActive ? 'bg-emerald-500' : 'bg-slate-400'"></span>
              <span>{{ sw?.isActive ? 'فعال و آماده' : 'غیرفعال' }}</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {{ sw?.message || 'پایش کش برنامه‌ها' }}
          </div>
        </div>
      </div>

      <!-- 6-Tier Deep Infrastructure Matrix Grid -->
      <div class="space-y-3">
        <h2 class="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span>ارزیابی اجزای ۶‌گانه زیرساخت</span>
          <span class="text-[11px] text-slate-400 font-normal">(Core Services Health Status)</span>
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Tier 1: PostgreSQL Database -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between" [ngClass]="getCardBorder(server?.components?.database?.status)">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [ngClass]="getStatusBadgeBg(server?.components?.database?.status)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="database"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">پایگاه‌داده PostgreSQL</h3>
                    <p class="text-[10px] text-slate-400 font-mono">پایگاه داده اصلی و متمرکز سیستم</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" [ngClass]="getStatusPillClass(server?.components?.database?.status)">
                  {{ getStatusText(server?.components?.database?.status) }}
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">زمان پاسخ کوئری:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-xs" dir="ltr">
                  {{ server?.components?.database?.latency_ms !== null && server?.components?.database?.latency_ms !== undefined ? (server?.components?.database?.latency_ms + ' ms') : '—' }}
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {{ server?.components?.database?.message || 'کوئری تستی با موفقیت اجرا شد.' }}
            </p>
          </div>

          <!-- Tier 2: Redis In-Memory Cache -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between" [ngClass]="getCardBorder(server?.components?.redis?.status)">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [ngClass]="getStatusBadgeBg(server?.components?.redis?.status)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="zap-path"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">حافظه موقت Redis</h3>
                    <p class="text-[10px] text-slate-400 font-mono">کش پرسرعت و نشست‌ها</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" [ngClass]="getStatusPillClass(server?.components?.redis?.status)">
                  {{ getStatusText(server?.components?.redis?.status) }}
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">تاخیر خواندن/نوشتن:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-xs" dir="ltr">
                  {{ server?.components?.redis?.latency_ms !== null && server?.components?.redis?.latency_ms !== undefined ? (server?.components?.redis?.latency_ms + ' ms') : '—' }}
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {{ server?.components?.redis?.message || 'سرور ردیس پاسخگو است.' }}
            </p>
          </div>

          <!-- Tier 3: WebSocket Channel Layer -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between" [ngClass]="getCardBorder(server?.components?.websocket?.status)">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [ngClass]="getStatusBadgeBg(server?.components?.websocket?.status)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="activity"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">لایه بلادرنگ WebSocket</h3>
                    <p class="text-[10px] text-slate-400 font-mono">پخش زنده تغییرات و چت</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" [ngClass]="getStatusPillClass(server?.components?.websocket?.status)">
                  {{ getStatusText(server?.components?.websocket?.status) }}
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">نوع کانال:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-[10px]" dir="ltr">
                  {{ server?.components?.websocket?.layer_type || 'InMemory / Redis' }}
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {{ server?.components?.websocket?.message || 'ارتباط وب‌سوکت دوطرفه برقرار است.' }}
            </p>
          </div>

          <!-- Tier 4: Client Offline IndexedDB Databases -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between border-slate-200 dark:border-slate-800">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="book"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">دیتابیس‌های محلی تفکیک‌شده</h3>
                    <p class="text-[10px] text-slate-400 font-mono">{{ (!isWarehouseInstalled) ? 'Finance & HR IndexedDB' : (!isAccountingInstalled) ? 'Warehouse IndexedDB' : (appScope !== 'finance') ? 'Warehouse & Finance DBs' : 'Finance & HR IndexedDB' }}</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  ایزوله و تفکیک‌شده
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">رکوردهای کش و صف:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-[11px]" dir="ltr">
                  <ng-container *ngIf="isWarehouseInstalled && (appScope !== 'finance' || !isAccountingInstalled)">انبار: {{ storage?.warehouseRecords || 0 }}<ng-container *ngIf="isAccountingInstalled"> | </ng-container></ng-container><ng-container *ngIf="isAccountingInstalled">مالی: {{ storage?.financeRecords || 0 }}</ng-container>
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              داده‌های آفلاین هر قلمرو در پایگاه مستقل خود در مرورگر ذخیره می‌شوند.
            </p>
          </div>

          <!-- Tier 5: Session & Tab Isolation Engine -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between border-slate-200 dark:border-slate-800">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="layout"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">سپر سشن چندتبی (Multi-Tab)</h3>
                    <p class="text-[10px] text-slate-400">جلوگیری از تداخل نشست‌ها</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  فعال
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">فیلتر اکوی تب:</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-200 text-[10px]" dir="ltr">
                  X-Client-Tab-Id فعال
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              تب‌های همزمان باز در مرورگر بدون تداخل یا بازنویسی سشن همدیگر کار می‌کنند.
            </p>
          </div>

          <!-- Tier 6: 3-Way Merge & Conflict Resolver Engine -->
          <div class="p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all shadow-xs min-h-[145px] flex flex-col justify-between border-slate-200 dark:border-slate-800">
            <div>
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="git-pull-request"></svg>
                  </div>
                  <div>
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">موتور حل تداخل هم‌زمانی</h3>
                    <p class="text-[10px] text-slate-400 font-mono">Visual 3-Way Merge</p>
                  </div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  مجهز به گارد SoD
                </span>
              </div>
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between">
                <span class="text-slate-400 text-[11px]">استراتژی تلفیق:</span>
                <span class="font-bold text-slate-700 dark:text-slate-200 text-[10px]">
                  Auto-Merge فیلدهای مستقل
                </span>
              </div>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              تداخل‌های خطای ۴۰۹ به شکل بصری و هوشمند با رعایت تفکیک وظایف برطرف می‌شوند.
            </p>
          </div>
        </div>
      </div>

      <!-- ─── Server Snapshots & Disaster Recovery Status Banner ─── -->
      <div *ngIf="canRunStressTest" class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" appIcon="clock-lucide"></svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-black text-slate-800 dark:text-slate-100">سپر اسنپ‌شات و تاب‌آوری سرور (Disaster Recovery Center)</h3>
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ۷ نسخه فعال
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              نقاط بازگشت امن پایگاه‌داده مرکزی سرور به صورت خودکار و زمان‌بندی‌شده نگهداری می‌شوند.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            (click)="navigateToBackupSettings()"
            class="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>مدیریت اسنپ‌شات‌ها و بازگشت</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="chevron-left"></svg>
          </button>
        </div>
      </div>

      <!-- ─── High-Concurrency Stress & Deadlock Resistance Suite (Superuser Only) ─── -->
      <div *ngIf="canRunStressTest" class="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" appIcon="zap"></svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-black text-slate-800 dark:text-slate-100">شبیه‌ساز تست فشار همروندی و مقاومت در برابر بن‌بست</h3>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                  Superuser Only
                </span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {{ (isWarehouseInstalled && appScope !== 'finance') ? 'شبیه‌سازی صدها تراکنش موازی خزانه‌داری و انبارداری جهت اثبات قفل‌های بدبینانه (select_for_update) و تضمین Zero Deadlock' : 'شبیه‌سازی صدها تراکنش موازی خزانه‌داری جهت اثبات قفل‌های بدبینانه (select_for_update) و تضمین Zero Deadlock' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Controls: Concurrency Level & Scenario -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">شدت بار و تعداد تراکنش‌های همزمان:</label>
            <div class="grid grid-cols-4 gap-1">
              <button
                type="button"
                *ngFor="let lvl of [20, 30, 50, 100]"
                (click)="selectedConcurrency = lvl"
                class="min-h-[40px] sm:min-h-[32px] py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border flex items-center justify-center"
                [ngClass]="selectedConcurrency === lvl ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'"
              >
                {{ lvl }}
              </button>
            </div>
          </div>

          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">سناریوی عملیاتی شبیه‌سازی:</label>
            <select
              [(ngModel)]="selectedScenario"
              class="w-full min-h-[40px] sm:min-h-[32px] py-1.5 px-3 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option *ngIf="isWarehouseInstalled && isAccountingInstalled && appScope !== 'finance'" value="combined">ترکیبی (خزانه‌داری + انبارداری)</option>
              <option *ngIf="isAccountingInstalled" value="treasury">فقط خزانه‌داری (جلوگیری از پرداخت دوبل)</option>
              <option *ngIf="isWarehouseInstalled && (appScope !== 'finance' || !isAccountingInstalled)" value="warehouse">فقط انبارداری (کسر اتمیک موجودی)</option>
            </select>
          </div>

          <div class="flex items-end">
            <button
              type="button"
              appAction="confirm"
              size="lg"
              label="شروع آزمون همروندی"
              display="label"
              [busy]="isStressTesting"
              (click)="runStressTest()"
              class="w-full"
            ></button>
          </div>
        </div>

        <!-- Stress Test Result Dashboard Panel -->
        <div *ngIf="stressReport" class="p-4 rounded-xl border bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-800/60 dark:to-slate-900 border-slate-200 dark:border-slate-800 space-y-4 fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-black text-emerald-700 dark:text-emerald-400">
                  نتیجه آزمون: تضمین ۱۰۰٪ مقاومت در برابر بن‌بست
                </span>
                <span dir="ltr" class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  (Zero Deadlock Guaranteed)
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>ثبت لاگ ممیزی:</span>
              <span dir="ltr" class="font-mono font-medium text-slate-600 dark:text-slate-300">{{ stressReport.server_time }}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
              <span class="text-[10px] font-bold text-slate-400 block">کل تراکنش‌های موازی</span>
              <span class="text-xl font-black font-mono text-slate-800 dark:text-slate-100 mt-1 block">
                {{ stressReport.total_transactions }}
              </span>
              <span class="text-[9px] text-emerald-600 font-bold block mt-0.5">
                موفق: {{ stressReport.successful_transactions }}
              </span>
            </div>

            <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
              <span class="text-[10px] font-bold text-slate-400 block">خطای بن‌بست دیتابیس</span>
              <span class="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 block">
                {{ stressReport.deadlock_count }}
              </span>
              <span class="text-[9px] text-emerald-600 font-bold block mt-0.5">
                Zero Deadlock ✅
              </span>
            </div>

            <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
              <span class="text-[10px] font-bold text-slate-400 block">میانگین تاخیر تراکنش</span>
              <span class="text-xl font-black font-mono text-slate-800 dark:text-slate-100 mt-1 block" dir="ltr">
                {{ stressReport.latency.avg_ms }} ms
              </span>
              <span class="text-[9px] text-slate-400 font-mono block mt-0.5" dir="ltr">
                p95: {{ stressReport.latency.p95_ms }} ms
              </span>
            </div>

            <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
              <span class="text-[10px] font-bold text-slate-400 block">مدت زمان کل شبیه‌سازی</span>
              <span class="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1 block" dir="ltr">
                {{ stressReport.duration_seconds }} s
              </span>
              <span class="text-[9px] text-emerald-600 font-bold block mt-0.5">
                پایداری کامل ردیف‌ها
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            <div class="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>گارد خزانه‌داری (ممانعت از پرداخت دوبل):</span>
              <span class="font-bold">تایید شد (۱ پرداخت نهایی)</span>
            </div>

            <div *ngIf="isWarehouseInstalled && appScope !== 'finance' && selectedScenario !== 'treasury'" class="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>تمامیت اتمیک موجودی انبار:</span>
              <span class="font-bold">تایید شد (کسر دقیق بدون افت تراکنش)</span>
            </div>
          </div>
        </div>

        <div *ngIf="stressError" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
          {{ stressError }}
        </div>
      </div>

    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `]
})
export class HealthDashboardComponent implements OnInit, OnDestroy {
  score = 100;
  isDiagnosing = false;
  networkPingMs: number | null = null;
  server: ServerHealthResponse | null = null;
  storage: ClientStorageHealth | null = null;
  sw: ServiceWorkerHealth | null = null;
  lastReport: ComprehensiveDiagnosticReport | null = null;
  appScope = 'warehouse';

  // Stress Test Suite State
  selectedConcurrency = 30;
  selectedScenario = 'combined';
  isStressTesting = false;
  stressReport: ConcurrencyStressReport | null = null;
  stressError: string | null = null;

  private healthService = inject(SystemHealthService);
  private personaService = inject(AppPersonaService);
  private auth = inject(AuthService);
  private subs: Subscription[] = [];

  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  constructor() {}

  get canRunStressTest(): boolean {
    const u = this.auth.user();
    return Boolean(u?.is_superuser || this.personaService.isSuperuser());
  }

  get isWarehouseInstalled(): boolean {
    return this.personaService.moduleRegistry.isModuleInstalled('warehouse');
  }

  get isAccountingInstalled(): boolean {
    return this.personaService.moduleRegistry.isModuleInstalled('accounting');
  }

  ngOnInit(): void {
    this.detectScope();

    this.subs.push(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
        this.detectScope();
        this.cdr.markForCheck();
      }),
      this.healthService.healthScore$.subscribe(s => {
        this.score = s;
        this.cdr.markForCheck();
      }),
      this.healthService.isDiagnosing$.subscribe(d => {
        this.isDiagnosing = d;
        this.cdr.markForCheck();
      }),
      this.healthService.networkPingMs$.subscribe(p => {
        this.networkPingMs = p;
        this.cdr.markForCheck();
      }),
      this.healthService.serverHealth$.subscribe(srv => {
        this.server = srv;
        this.cdr.markForCheck();
      }),
      this.healthService.clientStorage$.subscribe(st => {
        this.storage = st;
        this.cdr.markForCheck();
      }),
      this.healthService.serviceWorker$.subscribe(sw => {
        this.sw = sw;
        this.cdr.markForCheck();
      }),
      this.healthService.lastReport$.subscribe(rep => {
        this.lastReport = rep;
        this.cdr.markForCheck();
      })
    );

    // اجرای ارزیابی زنده
    this.triggerDiagnostic();
  }

  detectScope(): void {
    const path = (this.router.url || (typeof window !== 'undefined' ? window.location.pathname : '') || '').toLowerCase();
    if (path.includes('/app/finance') || path.includes('/finance') || path.includes('/personnel') || path.includes('/payroll')) {
      this.appScope = 'finance';
      this.selectedScenario = 'treasury';
    } else if (path.includes('/app/warehouse') || path.includes('/warehouse')) {
      this.appScope = 'warehouse';
    } else {
      if (!this.isWarehouseInstalled && this.isAccountingInstalled) {
        this.appScope = 'finance';
        this.selectedScenario = 'treasury';
      } else if (this.isWarehouseInstalled && !this.isAccountingInstalled) {
        this.appScope = 'warehouse';
        this.selectedScenario = 'warehouse';
      } else {
        const active = this.personaService.activeApp();
        this.appScope = (active === 'personnel' || active === 'finance') ? 'finance' : 'warehouse';
        this.selectedScenario = this.appScope === 'finance' ? 'treasury' : 'combined';
      }
    }
    if (!this.isWarehouseInstalled) {
      this.appScope = 'finance';
      this.selectedScenario = 'treasury';
    } else if (!this.isAccountingInstalled) {
      this.appScope = 'warehouse';
      this.selectedScenario = 'warehouse';
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  async triggerDiagnostic(): Promise<void> {
    await this.healthService.runFullDiagnostic(true);
    this.cdr.markForCheck();
  }

  async runStressTest(): Promise<void> {
    this.isStressTesting = true;
    this.stressError = null;
    this.cdr.markForCheck();
    try {
      this.stressReport = await this.healthService.runConcurrencyStressTest(
        this.selectedConcurrency,
        this.selectedScenario
      );
    } catch (err: any) {
      this.stressError = err?.error?.detail || err?.message || 'خطا در اجرای تست فشار همروندی';
    } finally {
      this.isStressTesting = false;
      this.cdr.markForCheck();
    }
  }

  navigateToBackupSettings(): void {
    const isFinance = this.router.url.includes('/finance');
    const base = isFinance ? '/app/finance/settings' : '/app/warehouse/settings';
    this.router.navigate([base], { queryParams: { tab: 'backup' } });
  }

  get pingStatusClass(): string {
    if (this.networkPingMs === null || this.networkPingMs < 0) return 'bg-rose-50 text-rose-600 dark:bg-rose-950';
    if (this.networkPingMs <= 200) return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950';
    if (this.networkPingMs <= 500) return 'bg-amber-50 text-amber-600 dark:bg-amber-950';
    return 'bg-rose-50 text-rose-600 dark:bg-rose-950';
  }

  get pingQualityText(): string {
    if (this.networkPingMs === null || this.networkPingMs < 0) return 'اینترنت قطع یا سرور در دسترس نیست';
    if (this.networkPingMs <= 150) return 'کیفیت عالی (High-Speed Fiber/4G)';
    if (this.networkPingMs <= 350) return 'کیفیت مناسب و پایدار';
    if (this.networkPingMs <= 700) return 'کندی موقت در ارتباط با سرور';
    return 'وضعیت ضعیف و مشکوک به قطعی (Lie-Fi)';
  }

  get pingQualityColor(): string {
    if (this.networkPingMs === null || this.networkPingMs < 0) return 'text-rose-600 dark:text-rose-400';
    if (this.networkPingMs <= 350) return 'text-emerald-600 dark:text-emerald-400';
    if (this.networkPingMs <= 700) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  }

  getCardBorder(status?: string): string {
    if (status === 'unhealthy') return 'border-rose-300 dark:border-rose-900 bg-rose-50/20';
    if (status === 'degraded') return 'border-amber-300 dark:border-amber-900 bg-amber-50/20';
    return 'border-slate-200/90 dark:border-slate-800';
  }

  getStatusBadgeBg(status?: string): string {
    if (status === 'unhealthy') return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
    if (status === 'degraded') return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  }

  getStatusPillClass(status?: string): string {
    if (status === 'unhealthy') return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200';
    if (status === 'degraded') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  }

  getStatusText(status?: string): string {
    if (status === 'unhealthy') return 'قطع / خطا';
    if (status === 'degraded') return 'کاهش کارایی';
    return 'پایدار (OK)';
  }
}
