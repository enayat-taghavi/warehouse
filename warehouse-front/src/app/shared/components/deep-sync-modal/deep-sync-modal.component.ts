import { Component, Input, Output, EventEmitter, signal, computed, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

export type DeepSyncContextMode = 'warehouse' | 'finance' | 'operations';

@Component({
  selector: 'app-deep-sync-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent, SvgIconDirective, ActionButtonComponent],
  template: `
    <app-modal [isOpen]="isOpen" (closed)="close()" [title]="modalTitle" sizeClass="max-w-2xl">
      <div class="px-6 py-4 flex flex-col gap-4 max-h-[72vh] overflow-y-auto" dir="rtl">
        
        <!-- Header Banner & Info -->
        <div class="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-l from-indigo-50/80 to-blue-50/40 border border-indigo-100 shadow-xs">
          <div class="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="action-refresh"></svg>
          </div>
          <div class="flex-1">
            <h3 class="text-sm font-black text-indigo-950 mb-1">{{ bannerTitle }}</h3>
            <p class="text-xs text-indigo-800/80 leading-relaxed font-normal">
              {{ bannerDescription }}
            </p>
          </div>
        </div>

        <!-- Operations Navigation Tabs (فقط در حالت مرکز عملیات فعال می‌شود) -->
        <div *ngIf="effectiveContext === 'operations'" class="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            (click)="activeOpsTab.set('all')"
            class="flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px]"
            [ngClass]="activeOpsTab() === 'all' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            <span>کل سازمان</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black" [ngClass]="activeOpsTab() === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'">
              {{ totalSelectedCount() }}
            </span>
          </button>
          <button
            *ngIf="warehouses.length > 0"
            type="button"
            (click)="activeOpsTab.set('warehouse')"
            class="flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px]"
            [ngClass]="activeOpsTab() === 'warehouse' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="package"></svg>
            <span>انبارداری</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black" [ngClass]="activeOpsTab() === 'warehouse' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'">
              {{ selectedWarehouseIds().length }}/{{ warehouses.length }}
            </span>
          </button>
          <button
            *ngIf="projects.length > 0"
            type="button"
            (click)="activeOpsTab.set('finance')"
            class="flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px]"
            [ngClass]="activeOpsTab() === 'finance' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="credit-card"></svg>
            <span>مالی و پرسنلی</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black" [ngClass]="activeOpsTab() === 'finance' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'">
              {{ selectedProjectIds().length }}/{{ projects.length }}
            </span>
          </button>
        </div>

        <!-- ══════════ ۱. بخش انبارها (Warehouse Section) ══════════ -->
        <div *ngIf="showWarehouseSection" class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="package"></svg>
              <span>{{ effectiveContext === 'operations' ? 'انبارهای فعال سازمان' : 'لیست انبارها' }}</span>
              <span class="text-slate-500 font-mono text-[11px]">({{ selectedWarehouseIds().length }} از {{ warehouses.length }})</span>
            </span>
            <button 
              type="button"
              (click)="toggleSelectAllWarehouses()"
              class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              [ngClass]="allWarehousesSelected() ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'"
            >
              {{ allWarehousesSelected() ? 'لغو انتخاب انبارها' : 'انتخاب همه انبارها' }}
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            @for (wh of warehouses; track wh.id) {
              <div 
                (click)="toggleWarehouse(wh.id)"
                class="relative flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer group select-none"
                [ngClass]="{
                  'border-indigo-500 bg-indigo-50/40 shadow-xs': isWarehouseSelected(wh.id),
                  'border-slate-200 bg-white hover:border-slate-300': !isWarehouseSelected(wh.id)
                }"
              >
                <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                     [ngClass]="isWarehouseSelected(wh.id) ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'">
                  @if (isWarehouseSelected(wh.id)) {
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="hero-check-bold"></svg>
                  }
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-xs font-bold text-slate-800 truncate">{{ wh.name }}</h4>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- ══════════ ۲. بخش پروژه‌ها و کارگاه‌ها (Finance Section) ══════════ -->
        <div *ngIf="showFinanceSection" class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="credit-card"></svg>
              <span>{{ effectiveContext === 'operations' ? 'پروژه‌ها و کارگاه‌های مالی' : 'لیست پروژه‌ها / کارگاه‌ها' }}</span>
              <span class="text-slate-500 font-mono text-[11px]">({{ selectedProjectIds().length }} از {{ projects.length }})</span>
            </span>
            <button 
              type="button"
              (click)="toggleSelectAllProjects()"
              class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              [ngClass]="allProjectsSelected() ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'"
            >
              {{ allProjectsSelected() ? 'لغو انتخاب پروژه‌ها' : 'انتخاب همه پروژه‌ها' }}
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            @for (prj of projects; track prj.id) {
              <div 
                (click)="toggleProject(prj.id)"
                class="relative flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer group select-none"
                [ngClass]="{
                  'border-emerald-500 bg-emerald-50/40 shadow-xs': isProjectSelected(prj.id),
                  'border-slate-200 bg-white hover:border-slate-300': !isProjectSelected(prj.id)
                }"
              >
                <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                     [ngClass]="isProjectSelected(prj.id) ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'">
                  @if (isProjectSelected(prj.id)) {
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="hero-check-bold"></svg>
                  }
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-xs font-bold text-slate-800 truncate">{{ prj.name }}</h4>
                </div>
              </div>
            }
          </div>
        </div>

      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3" dir="rtl">
        <div>
          <button
            *ngIf="effectiveContext === 'operations'"
            type="button"
            (click)="toggleSelectEntireOrganization()"
            title="انتخاب یا لغو انتخاب کل سازمان"
            class="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200 flex items-center gap-1.5 tap-target"
          >
            <svg class="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="zap"></svg>
            <span>{{ allOrganizationSelected() ? 'لغو انتخاب کل سازمان' : 'انتخاب کل سامانه‌های سازمان' }}</span>
          </button>
        </div>

        <div class="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            appAction="close"
            size="lg"
            display="label"
            label="انصراف"
            (click)="close()"
            class="w-full sm:w-auto"
          ></button>
          <button
            appAction="confirm"
            size="lg"
            display="label"
            [label]="'شروع بروزرسانی (' + totalSelectedCount() + ')'"
            tone="primary"
            [disabled]="totalSelectedCount() === 0"
            (click)="confirm()"
            class="w-full sm:w-auto"
          ></button>
        </div>
      </div>
    </app-modal>
  `
})
export class DeepSyncModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() contextMode: DeepSyncContextMode = 'warehouse';
  @Input() warehouses: { id: number; name: string }[] = [];
  @Input() projects: { id: number; name: string }[] = [];
  @Input() preselectWarehouseId: number | null = null;
  @Input() preselectProjectId: number | null = null;

  // عقب‌گرد سازگار برای کدهای موجود قبلی
  @Input() set isWarehouseScope(val: boolean) {
    if (!this.explicitContextModeSet) {
      this.contextMode = val ? 'warehouse' : 'finance';
    }
  }
  @Input() set preselectId(id: number | null) {
    if (this.contextMode === 'finance') {
      this.preselectProjectId = id;
    } else {
      this.preselectWarehouseId = id;
    }
  }

  @Output() closed = new EventEmitter<void>();
  @Output() startSync = new EventEmitter<any>();
  @Output() startSyncMulti = new EventEmitter<{ warehouseIds: number[]; projectIds: number[] }>();

  private explicitContextModeSet = false;

  public activeOpsTab = signal<'all' | 'warehouse' | 'finance'>('all');

  public selectedWarehouseIds = signal<number[]>([]);
  public selectedProjectIds = signal<number[]>([]);

  public get effectiveContext(): DeepSyncContextMode {
    return this.contextMode || 'warehouse';
  }

  public get modalTitle(): string {
    if (this.effectiveContext === 'operations') {
      return 'بروزرسانی عمیق مرکز عملیات';
    }
    return 'بروزرسانی عمیق';
  }

  public get bannerTitle(): string {
    if (this.effectiveContext === 'operations') {
      return 'همگام‌سازی و بازخوانی یکپارچه سازمان';
    }
    if (this.effectiveContext === 'finance') {
      return 'انتخاب پروژه‌ها و کارگاه‌های هدف';
    }
    return 'انتخاب انبارهای هدف';
  }

  public get bannerDescription(): string {
    if (this.effectiveContext === 'operations') {
      return 'با بروزرسانی عمیق در مرکز عملیات، پایگاه‌های داده محلی برای تمامی سامانه‌های انتخاب‌شده از نو همگام‌سازی می‌شوند. این فرآیند رکوردهای شبح (Ghosts) را پاکسازی می‌کند.';
    }
    if (this.effectiveContext === 'finance') {
      return 'با بروزرسانی عمیق، اطلاعات آفلاین ذخیره‌شده برای پروژه‌ها و کارگاه‌های انتخاب‌شده کاملاً پاک شده و از نو دریافت می‌شود.';
    }
    return 'با بروزرسانی عمیق، اطلاعات آفلاین ذخیره‌شده برای انبارهای انتخاب‌شده کاملاً پاک شده و از نو دریافت می‌شود.';
  }

  public get showWarehouseSection(): boolean {
    if (this.effectiveContext === 'warehouse') return true;
    if (this.effectiveContext === 'operations') {
      return (this.activeOpsTab() === 'all' || this.activeOpsTab() === 'warehouse') && this.warehouses.length > 0;
    }
    return false;
  }

  public get showFinanceSection(): boolean {
    if (this.effectiveContext === 'finance') return true;
    if (this.effectiveContext === 'operations') {
      return (this.activeOpsTab() === 'all' || this.activeOpsTab() === 'finance') && this.projects.length > 0;
    }
    return false;
  }

  public allWarehousesSelected = computed(() => {
    return this.warehouses.length > 0 && this.selectedWarehouseIds().length === this.warehouses.length;
  });

  public allProjectsSelected = computed(() => {
    return this.projects.length > 0 && this.selectedProjectIds().length === this.projects.length;
  });

  public totalSelectedCount = computed(() => {
    if (this.effectiveContext === 'warehouse') return this.selectedWarehouseIds().length;
    if (this.effectiveContext === 'finance') return this.selectedProjectIds().length;
    return this.selectedWarehouseIds().length + this.selectedProjectIds().length;
  });

  public allOrganizationSelected = computed(() => {
    const whOk = this.warehouses.length === 0 || this.selectedWarehouseIds().length === this.warehouses.length;
    const prjOk = this.projects.length === 0 || this.selectedProjectIds().length === this.projects.length;
    return whOk && prjOk && (this.warehouses.length > 0 || this.projects.length > 0);
  });

  ngOnChanges(changes: any) {
    if (changes.contextMode) {
      this.explicitContextModeSet = true;
    }

    if (changes.isOpen && this.isOpen) {
      this.initSelections();
    }
  }

  private initSelections(): void {
    if (this.effectiveContext === 'warehouse') {
      if (this.preselectWarehouseId) {
        this.selectedWarehouseIds.set([this.preselectWarehouseId]);
      } else {
        this.selectedWarehouseIds.set([]);
      }
      this.selectedProjectIds.set([]);
    } else if (this.effectiveContext === 'finance') {
      if (this.preselectProjectId) {
        this.selectedProjectIds.set([this.preselectProjectId]);
      } else {
        this.selectedProjectIds.set([]);
      }
      this.selectedWarehouseIds.set([]);
    } else {
      // Operations: پیش‌گزینی هر دو
      const whInit = this.preselectWarehouseId ? [this.preselectWarehouseId] : [];
      const prjInit = this.preselectProjectId ? [this.preselectProjectId] : [];
      this.selectedWarehouseIds.set(whInit);
      this.selectedProjectIds.set(prjInit);
    }
  }

  public isWarehouseSelected(id: number): boolean {
    return this.selectedWarehouseIds().includes(id);
  }

  public isProjectSelected(id: number): boolean {
    return this.selectedProjectIds().includes(id);
  }

  public toggleWarehouse(id: number): void {
    const current = this.selectedWarehouseIds();
    if (current.includes(id)) {
      this.selectedWarehouseIds.set(current.filter(x => x !== id));
    } else {
      this.selectedWarehouseIds.set([...current, id]);
    }
  }

  public toggleProject(id: number): void {
    const current = this.selectedProjectIds();
    if (current.includes(id)) {
      this.selectedProjectIds.set(current.filter(x => x !== id));
    } else {
      this.selectedProjectIds.set([...current, id]);
    }
  }

  public toggleSelectAllWarehouses(): void {
    if (this.allWarehousesSelected()) {
      this.selectedWarehouseIds.set([]);
    } else {
      this.selectedWarehouseIds.set(this.warehouses.map(w => w.id));
    }
  }

  public toggleSelectAllProjects(): void {
    if (this.allProjectsSelected()) {
      this.selectedProjectIds.set([]);
    } else {
      this.selectedProjectIds.set(this.projects.map(p => p.id));
    }
  }

  public toggleSelectEntireOrganization(): void {
    if (this.allOrganizationSelected()) {
      this.selectedWarehouseIds.set([]);
      this.selectedProjectIds.set([]);
    } else {
      this.selectedWarehouseIds.set(this.warehouses.map(w => w.id));
      this.selectedProjectIds.set(this.projects.map(p => p.id));
    }
  }

  public close(): void {
    this.closed.emit();
  }

  public confirm(): void {
    const whIds = this.selectedWarehouseIds();
    const prjIds = this.selectedProjectIds();

    if (whIds.length === 0 && prjIds.length === 0) return;

    this.startSyncMulti.emit({ warehouseIds: whIds, projectIds: prjIds });

    if (this.effectiveContext === 'warehouse') {
      this.startSync.emit(whIds);
    } else if (this.effectiveContext === 'finance') {
      this.startSync.emit(prjIds);
    } else {
      this.startSync.emit({ warehouseIds: whIds, projectIds: prjIds });
    }

    this.close();
  }
}
