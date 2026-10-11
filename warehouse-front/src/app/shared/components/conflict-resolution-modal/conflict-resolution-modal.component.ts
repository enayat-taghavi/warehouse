import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../modal/modal.component';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { SyncErrorEntry } from '../../../core/services/offline-db';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export interface ConflictingField {
  key: string;
  label: string;
  localVal: any;
  serverVal: any;
  choice: 'local' | 'server';
}

const PERSIAN_FIELD_LABELS: Record<string, string> = {
  name: 'نام / عنوان',
  title: 'عنوان',
  code: 'کد کالا',
  barcode: 'بارکد',
  stock: 'موجودی انبار',
  quantity: 'تعداد / مقدار',
  count_1: 'شمارش اول',
  count_2: 'شمارش دوم',
  count_3: 'شمارش سوم',
  final_count: 'شمارش نهایی',
  discrepancy: 'مغایرت',
  status: 'وضعیت',
  description: 'توضیحات',
  tracking_code: 'کد پیگیری',
  price: 'مبلغ / نرخ',
  wage: 'دستمزد',
  base_wage: 'حقوق پایه',
  overtime_hours: 'اضافه‌کاری',
  work_hours: 'ساعات کارکرد',
  date: 'تاریخ',
  notes: 'یادداشت',
  reason: 'علت / دلیل',
  warehouse_id: 'شناسه انبار',
  unit: 'واحد سنجش',
  category: 'دسته‌بندی',
  assigned_to: 'تخصیص به',
  is_approved: 'تایید شده',
};

const IGNORED_COMPARE_KEYS = new Set([
  '_offlinePending',
  '_localDraft',
  'base_updated_at',
  'created_at',
  'updated_at',
  'id',
  'sync_id',
  'warehouse',
]);

@Component({
  selector: 'app-conflict-resolution-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, SvgIconDirective],
  template: `
    <app-modal [isOpen]="isOpen" (closed)="close()" title="مرکز حل تداخل همگام‌سازی (۳-Way Merge)" sizeClass="max-w-2xl">
      <div class="px-5 py-4 flex flex-col gap-4 text-right" dir="rtl">
        
        <!-- Header Banner & Explanations -->
        <div class="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" appIcon="alert-circle"></svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-xs font-black text-amber-900 dark:text-amber-200">
              تداخل در به‌روزرسانی هم‌زمان رکورد (409 Conflict)
            </h3>
            <p class="text-[11px] text-amber-800/90 dark:text-amber-300/80 mt-0.5 leading-relaxed">
              این رکورد در حین ثبت تغییرات شما، توسط کاربر دیگری در سرور تغییر کرده است. فیلدهای دارای تداخل را بررسی و نسخه مطلوب را انتخاب فرمایید. سایر فیلدهای بدون تداخل به شکل خودکار تلفیق (Auto-Merge) می‌شوند.
            </p>
          </div>
        </div>

        <!-- SoD Warning Banner if Restricted -->
        <div *ngIf="isSodRestricted" class="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" appIcon="shield"></svg>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-black text-rose-900 dark:text-rose-200">
              سد تفکیک وظایف (SoD Barrier - Separation of Duties)
            </h4>
            <p class="text-[11px] text-rose-800/90 dark:text-rose-300/80 mt-0.5 leading-relaxed">
              تایید و نهایی‌سازی تداخل اسناد مالی و کارتابل‌ها نیازمند دسترسی سرپرست، حسابدار یا مدیر سیستم است. شما با نقش فعال «{{ getRoleTitle(activeRole) }}» مجاز به اعمال ادغام نیستید.
            </p>
          </div>
        </div>

        <!-- Fast Bulk Actions -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>فیلدهای دارای تداخل:</span>
            <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 text-[10px] font-mono font-black">
              {{ conflicts.length }} مورد
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="selectAllServer()"
              class="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
            >
              انتخاب کل نسخه سرور
            </button>
            <button
              type="button"
              (click)="selectAllLocal()"
              class="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
            >
              انتخاب کل تغییرات من
            </button>
          </div>
        </div>

        <!-- Conflicting Fields Side-by-Side Cards -->
        <div class="space-y-3 max-h-[40vh] overflow-y-auto px-0.5 py-1">
          <div
            *ngFor="let c of conflicts"
            class="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs space-y-2.5 transition-all"
          >
            <!-- Field Title -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <span class="text-xs font-black text-slate-800 dark:text-slate-100">
                {{ c.label }}
              </span>
              <span class="text-[10px] font-mono text-slate-400" dir="ltr">{{ c.key }}</span>
            </div>

            <!-- Two Comparison Options -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <!-- Local Version Card -->
              <div
                (click)="c.choice = 'local'"
                class="p-2.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between"
                [ngClass]="c.choice === 'local' 
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs' 
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-1.5">
                    <div class="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                      [ngClass]="c.choice === 'local' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'">
                      <div *ngIf="c.choice === 'local'" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </div>
                    <span class="font-black text-[11px]" [ngClass]="c.choice === 'local' ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-600 dark:text-slate-400'">
                      نسخه محلی شما (Local)
                    </span>
                  </div>
                  <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 font-bold">
                    پیش‌نویس شما
                  </span>
                </div>
                <div class="font-mono text-[11px] p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 break-all" dir="auto">
                  {{ formatValue(c.localVal) }}
                </div>
              </div>

              <!-- Server Version Card -->
              <div
                (click)="c.choice = 'server'"
                class="p-2.5 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between"
                [ngClass]="c.choice === 'server' 
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 shadow-xs' 
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
              >
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-1.5">
                    <div class="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                      [ngClass]="c.choice === 'server' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'">
                      <div *ngIf="c.choice === 'server'" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </div>
                    <span class="font-black text-[11px]" [ngClass]="c.choice === 'server' ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-400'">
                      نسخه سرور (Server)
                    </span>
                  </div>
                  <span class="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 font-bold">
                    آخرین ذخیره
                  </span>
                </div>
                <div class="font-mono text-[11px] p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 break-all" dir="auto">
                  {{ formatValue(c.serverVal) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Fallback when no individual field diff was found -->
          <div *ngIf="conflicts.length === 0" class="py-6 text-center text-slate-500 text-xs">
            <p>تفاوت مستقیمی در فیلدهای اصلی یافت نشد. تداخل مربوط به برچسب زمانی به‌روزرسانی است.</p>
          </div>
        </div>

        <!-- Auto-Merged Fields Collapsible Summary -->
        <div *ngIf="autoMergedCount > 0" class="border border-slate-100 dark:border-slate-800 rounded-xl p-2.5 bg-slate-50/70 dark:bg-slate-800/40">
          <button
            type="button"
            (click)="showAutoMerged = !showAutoMerged"
            class="w-full flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <div class="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-600" appIcon="check"></svg>
              <span>{{ autoMergedCount }} فیلد بدون مغایرت به شکل خودکار تلفیق گردیدند</span>
            </div>
            <span class="text-[10px] text-indigo-600 dark:text-indigo-400">{{ showAutoMerged ? 'بستن' : 'مشاهده' }}</span>
          </button>

          <div *ngIf="showAutoMerged" class="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
            <div *ngFor="let item of autoMergedList" class="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 truncate">
              <span class="text-slate-400 font-mono">{{ item.key }}: </span>
              <span class="font-bold text-slate-700 dark:text-slate-200">{{ formatValue(item.val) }}</span>
            </div>
          </div>
        </div>

        <!-- Feedback Messages -->
        <div *ngIf="saveErrorMsg" class="p-2.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" appIcon="alert-circle"></svg>
          <span>{{ saveErrorMsg }}</span>
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5" dir="rtl">
        <button
          type="button"
          (click)="close()"
          title="انصراف"
          aria-label="انصراف"
          class="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer tap-target flex items-center justify-center"
        >
          انصراف
        </button>

        <button
          type="button"
          (click)="resolveAndSave()"
          [disabled]="isSodRestricted || isSaving"
          title="تایید و نهایی‌سازی ادغام"
          class="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-black text-white transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95 tap-target"
          [ngClass]="isSodRestricted || isSaving 
            ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60' 
            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'"
        >
          <svg *ngIf="isSaving" class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="spinner"></svg>
          <svg *ngIf="!isSaving" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" appIcon="check"></svg>
          <span>{{ isSaving ? 'در حال اعمال ادغام...' : 'تایید و نهایی‌سازی ادغام' }}</span>
        </button>
      </div>
    </app-modal>
  `
})
export class ConflictResolutionModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() errorEntry: SyncErrorEntry | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() resolved = new EventEmitter<{ success: boolean; message: string; online: boolean }>();

  conflicts: ConflictingField[] = [];
  autoMergedFields: Record<string, any> = {};
  autoMergedList: { key: string; val: any }[] = [];
  autoMergedCount = 0;
  showAutoMerged = false;

  isSaving = false;
  saveErrorMsg: string | null = null;

  private syncService = OfflineSyncService.getInstance();
  private cdr = inject(ChangeDetectorRef);

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue || changes['errorEntry']) {
      if (this.isOpen && this.errorEntry) {
        this.saveErrorMsg = null;
        this.analyzeDifferences();
      }
    }
  }

  close(): void {
    this.isOpen = false;
    this.closed.emit();
    this.cdr.markForCheck();
  }

  get isFinanceOrSensitive(): boolean {
    if (!this.errorEntry) return false;
    return (
      this.errorEntry.appScope === 'finance' ||
      this.errorEntry.entityType === 'doc_task' ||
      (this.errorEntry.url?.includes('personnel') ?? false) ||
      (this.errorEntry.url?.includes('payroll') ?? false) ||
      (this.errorEntry.url?.includes('treasury') ?? false)
    );
  }

  get activeRole(): string {
    return sessionStorage.getItem('active_role_persona') || 'operator';
  }

  get isSodRestricted(): boolean {
    if (!this.isFinanceOrSensitive) return false;
    const role = this.activeRole;
    return role === 'operator' || role === 'counter';
  }

  getRoleTitle(role: string): string {
    const map: Record<string, string> = {
      operator: 'اپراتور ثبت',
      counter: 'شمارشگر انبار',
      supervisor: 'سرپرست',
      accountant: 'حسابدار',
      manager: 'مدیر سیستم',
      treasury: 'خزانه‌دار',
      admin: 'مدیر ارشد',
    };
    return map[role] || role;
  }

  getFieldLabel(key: string): string {
    return PERSIAN_FIELD_LABELS[key] || key;
  }

  formatValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'بله / تایید' : 'خیر / عدم تایید';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  selectAllServer(): void {
    this.conflicts.forEach(c => (c.choice = 'server'));
    this.cdr.markForCheck();
  }

  selectAllLocal(): void {
    this.conflicts.forEach(c => (c.choice = 'local'));
    this.cdr.markForCheck();
  }

  analyzeDifferences(): void {
    if (!this.errorEntry) return;

    const localData = (this.errorEntry.body && typeof this.errorEntry.body === 'object') ? this.errorEntry.body : {};
    const serverRecord =
      this.errorEntry.serverResponse?.server_record ||
      this.errorEntry.serverResponse?.data ||
      {};

    const allKeys = new Set<string>([
      ...Object.keys(localData),
      ...Object.keys(serverRecord),
    ]);

    this.conflicts = [];
    this.autoMergedFields = {};
    this.autoMergedList = [];

    for (const key of allKeys) {
      if (IGNORED_COMPARE_KEYS.has(key)) continue;

      const hasLocal = key in localData;
      const hasServer = key in serverRecord;

      if (hasLocal && hasServer) {
        const lVal = localData[key];
        const sVal = serverRecord[key];
        const isIdentical = JSON.stringify(lVal) === JSON.stringify(sVal);

        if (!isIdentical) {
          this.conflicts.push({
            key,
            label: this.getFieldLabel(key),
            localVal: lVal,
            serverVal: sVal,
            choice: 'local', // پیش‌فرض: تغییرات اخیر کلاینت با امکان انتخاب سرور
          });
        } else {
          this.autoMergedFields[key] = sVal;
          this.autoMergedList.push({ key: this.getFieldLabel(key), val: sVal });
        }
      } else if (hasLocal) {
        this.autoMergedFields[key] = localData[key];
        this.autoMergedList.push({ key: this.getFieldLabel(key), val: localData[key] });
      } else if (hasServer) {
        this.autoMergedFields[key] = serverRecord[key];
        this.autoMergedList.push({ key: this.getFieldLabel(key), val: serverRecord[key] });
      }
    }

    this.autoMergedCount = this.autoMergedList.length;
    this.cdr.markForCheck();
  }

  async resolveAndSave(): Promise<void> {
    if (this.isSodRestricted || this.isSaving || !this.errorEntry?.id) return;
    this.isSaving = true;
    this.saveErrorMsg = null;

    try {
      const merged: Record<string, any> = { ...this.autoMergedFields };
      for (const c of this.conflicts) {
        merged[c.key] = c.choice === 'server' ? c.serverVal : c.localVal;
      }

      const result = await this.syncService.resolveConflict(this.errorEntry.id, merged);
      if (result.success) {
        this.resolved.emit(result);
        this.close();
      } else {
        this.saveErrorMsg = result.message;
        if (this.errorEntry.serverResponse) {
          this.analyzeDifferences();
        }
      }
    } catch (err: any) {
      this.saveErrorMsg = err?.message || 'خطای غیرمنتظره در ارسال ادغام رخ داد.';
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }
}
