import { Component, Input, Output, EventEmitter, signal, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { DeepSyncSectionSpec } from '../../../core/modules/module-contract';
import { LOCKED_OFFLINE_SCOPES } from '../../../core/services/offline-db';

/** زمینهٔ دیالوگ: قلمرو یک بخش، یا مرکز عملیات برای همهٔ بخش‌ها */
export type DeepSyncContextMode = string;

const OPERATIONS_CONTEXT = 'operations';

/** بخش آمادهٔ نمایش: مشخصات ماژول به‌اضافهٔ فهرست هدف‌ها */
export type DeepSyncSectionView =
  Omit<DeepSyncSectionSpec, 'loadItems' | 'initialItems' | 'preselectId'> & { items?: { id: number; name: string }[] };

/** کلاس‌های هر رنگ پایه؛ کلاس‌ها کامل نوشته شده‌اند تا Tailwind آن‌ها را بسازد */
interface AccentClasses {
  iconColor: string;
  tabActive: string;
  tabCountActive: string;
  selectAllActive: string;
  cardSelected: string;
  radioSelected: string;
}

const ACCENT_CLASSES: Record<string, AccentClasses> = {
  indigo: {
    iconColor: 'text-indigo-600',
    tabActive: 'bg-white text-indigo-600 shadow-sm',
    tabCountActive: 'bg-indigo-100 text-indigo-700',
    selectAllActive: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
    cardSelected: 'border-indigo-500 bg-indigo-50/40 shadow-sm',
    radioSelected: 'border-indigo-600 bg-indigo-600',
  },
  emerald: {
    iconColor: 'text-emerald-600',
    tabActive: 'bg-white text-emerald-600 shadow-sm',
    tabCountActive: 'bg-emerald-100 text-emerald-700',
    selectAllActive: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
    cardSelected: 'border-emerald-500 bg-emerald-50/40 shadow-sm',
    radioSelected: 'border-emerald-600 bg-emerald-600',
  },
};

/** فراخوان‌پذیر مثل signal با set، برای سازگاری با selectedWarehouseIds/selectedProjectIds پیشین */
type LegacySelection = (() => number[]) & { set: (ids: number[]) => void };

@Component({
  selector: 'app-deep-sync-modal',
  standalone: true,
  imports: [CommonModule, ModalComponent, SvgIconDirective, ActionButtonComponent],
  template: `
    <app-modal [isOpen]="isOpen" (closed)="close()" [title]="modalTitle" sizeClass="max-w-2xl">
      <div class="px-6 py-4 flex flex-col gap-4 max-h-[72vh] overflow-y-auto" dir="rtl">

        <!-- Header Banner & Info -->
        <div class="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-l from-indigo-50/80 to-blue-50/40 border border-indigo-100 shadow-sm">
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
        <div *ngIf="isOperations" class="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            (click)="activeOpsTab.set('all')"
            class="flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px]"
            [ngClass]="activeOpsTab() === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
          >
            <span>کل سازمان</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-black" [ngClass]="activeOpsTab() === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'">
              {{ totalSelectedCount() }}
            </span>
          </button>
          @for (sec of tabSections; track sec.scope) {
            <button
              type="button"
              (click)="activeOpsTab.set(sec.scope)"
              class="flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[36px]"
              [ngClass]="activeOpsTab() === sec.scope ? accentOf(sec).tabActive : 'text-slate-600 hover:text-slate-900'"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" [appIcon]="sec.icon"></svg>
              <span>{{ sec.tabLabel }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-black" [ngClass]="activeOpsTab() === sec.scope ? accentOf(sec).tabCountActive : 'bg-slate-200 text-slate-600'">
                {{ idsOf(sec.scope).length }}/{{ itemsOf(sec).length }}
              </span>
            </button>
          }
        </div>

        <!-- ══════════ بخش‌های قلمرو (از extension منوی کاربر هر ماژول) ══════════ -->
        @for (sec of visibleSections; track sec.scope) {
          <div class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <svg class="w-4 h-4" [ngClass]="accentOf(sec).iconColor" fill="none" stroke="currentColor" viewBox="0 0 24 24" [appIcon]="sec.icon"></svg>
                <span>{{ isOperations ? sec.opsSectionTitle : sec.sectionTitle }}</span>
                <span class="text-slate-500 font-mono text-[11px]">({{ idsOf(sec.scope).length }} از {{ itemsOf(sec).length }})</span>
              </span>
              <button
                type="button"
                (click)="toggleSelectAll(sec)"
                class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                [ngClass]="allSelectedIn(sec) ? accentOf(sec).selectAllActive : 'text-slate-600 bg-slate-100 hover:bg-slate-200'"
              >
                {{ allSelectedIn(sec) ? sec.clearAllLabel : sec.selectAllLabel }}
              </button>
            </div>

            @if (itemsOf(sec).length === 0) {
              <div class="flex flex-wrap items-center gap-2 py-2">
                <p
                  class="text-xs"
                  role="status"
                  aria-live="polite"
                  [class.text-rose-600]="failedScopes.includes(sec.scope) && !loadingScopes.includes(sec.scope)"
                  [class.text-slate-500]="!failedScopes.includes(sec.scope) || loadingScopes.includes(sec.scope)"
                >
                  @if (loadingScopes.includes(sec.scope)) {
                    در حال دریافت فهرست…
                  } @else if (failedScopes.includes(sec.scope)) {
                    دریافت فهرست ناموفق بود؛ اتصال را بررسی کنید.
                  } @else {
                    {{ sec.emptyText }}
                  }
                </p>
                @if (failedScopes.includes(sec.scope)) {
                  <button
                    type="button"
                    (click)="retryLoad.emit(sec.scope)"
                    [disabled]="loadingScopes.includes(sec.scope)"
                    [attr.aria-busy]="loadingScopes.includes(sec.scope)"
                    class="text-xs font-bold px-3 py-1.5 min-h-[40px] rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    تلاش دوباره
                  </button>
                }
              </div>
            }

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              @for (item of itemsOf(sec); track item.id) {
                <div
                  (click)="toggleItem(sec.scope, item.id)"
                  class="relative flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer group select-none"
                  [ngClass]="isSelected(sec.scope, item.id) ? accentOf(sec).cardSelected : 'border-slate-200 bg-white hover:border-slate-300'"
                >
                  <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                       [ngClass]="isSelected(sec.scope, item.id) ? accentOf(sec).radioSelected : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'">
                    @if (isSelected(sec.scope, item.id)) {
                      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" appIcon="hero-check-bold"></svg>
                    }
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="text-xs font-bold text-slate-800 truncate">{{ item.name }}</h4>
                  </div>
                </div>
              }
            </div>
          </div>
        }

      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3" dir="rtl">
        <div>
          <button
            *ngIf="isOperations"
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
            appAction="sync"
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
  /** قلمرو یک بخش یا operations؛ خالی یعنی نخستین بخش */
  @Input() contextMode: DeepSyncContextMode = '';
  /** بخش‌ها از extension منوی کاربر ماژول‌ها */
  @Input() set sections(val: DeepSyncSectionView[] | null | undefined) {
    this._sections.set([...(val || [])].sort((a, b) => a.order - b.order));
  }
  get sections(): DeepSyncSectionView[] {
    return this._sections();
  }
  /** شناسهٔ پیش‌انتخاب هر قلمرو */
  @Input() preselectByScope: Record<string, number | null> = {};
  /** قلمروهایی که فهرستشان هنوز از سرور نرسیده (متن خالی بودن نشان داده نمی‌شود) */
  @Input() loadingScopes: string[] = [];
  /** قلمروهایی که دریافت فهرستشان شکست خورد (به‌جای «یافت نشد» پیام خطا و دکمهٔ تلاش دوباره) */
  @Input() failedScopes: string[] = [];

  // سازگاری پیشین: فهرست و پیش‌انتخاب دو قلمرو قفل‌شده
  @Input() set warehouses(items: { id: number; name: string }[]) {
    this.setLegacyItems(LOCKED_OFFLINE_SCOPES[0], items);
  }
  get warehouses(): { id: number; name: string }[] {
    return this._legacyItems()[LOCKED_OFFLINE_SCOPES[0]] || [];
  }
  @Input() set projects(items: { id: number; name: string }[]) {
    this.setLegacyItems(LOCKED_OFFLINE_SCOPES[1], items);
  }
  get projects(): { id: number; name: string }[] {
    return this._legacyItems()[LOCKED_OFFLINE_SCOPES[1]] || [];
  }
  @Input() preselectWarehouseId: number | null = null;
  @Input() preselectProjectId: number | null = null;

  // عقب‌گرد سازگار برای کدهای موجود قبلی
  @Input() set isWarehouseScope(val: boolean) {
    if (!this.explicitContextModeSet) {
      this.contextMode = val ? LOCKED_OFFLINE_SCOPES[0] : LOCKED_OFFLINE_SCOPES[1];
    }
  }
  @Input() set preselectId(id: number | null) {
    if (this.contextMode === LOCKED_OFFLINE_SCOPES[1]) {
      this.preselectProjectId = id;
    } else {
      this.preselectWarehouseId = id;
    }
  }

  @Output() closed = new EventEmitter<void>();
  /** درخواست دریافت دوبارهٔ فهرست یک قلمرو */
  @Output() retryLoad = new EventEmitter<string>();
  @Output() startSync = new EventEmitter<any>();
  /** warehouseIds و projectIds برای دو قلمرو قفل‌شده؛ idsByScope وقتی قلمرو دیگری هم انتخاب شده باشد */
  @Output() startSyncMulti = new EventEmitter<{ warehouseIds: number[]; projectIds: number[]; idsByScope?: Record<string, number[]> }>();

  private explicitContextModeSet = false;
  private readonly _sections = signal<DeepSyncSectionView[]>([]);
  private readonly _legacyItems = signal<Record<string, { id: number; name: string }[]>>({});

  /** 'all' یا قلمرو یک بخش */
  public activeOpsTab = signal<string>('all');

  /** شناسه‌های انتخاب‌شدهٔ هر قلمرو */
  public readonly selectedByScope = signal<Record<string, number[]>>({});

  public readonly selectedWarehouseIds: LegacySelection = this.legacySelection(LOCKED_OFFLINE_SCOPES[0]);
  public readonly selectedProjectIds: LegacySelection = this.legacySelection(LOCKED_OFFLINE_SCOPES[1]);

  public get effectiveContext(): DeepSyncContextMode {
    return this.contextMode || this.sections[0]?.scope || LOCKED_OFFLINE_SCOPES[0];
  }

  public get isOperations(): boolean {
    return this.effectiveContext === OPERATIONS_CONTEXT;
  }

  /** بخش زمینهٔ جاری وقتی دیالوگ فقط یک قلمرو را نشان می‌دهد */
  public get contextSection(): DeepSyncSectionView | undefined {
    return this.sections.find(s => s.scope === this.effectiveContext);
  }

  public get modalTitle(): string {
    if (this.isOperations) {
      return 'بروزرسانی عمیق مرکز عملیات';
    }
    return 'بروزرسانی عمیق';
  }

  public get bannerTitle(): string {
    if (this.isOperations) {
      return 'همگام‌سازی و بازخوانی یکپارچه سازمان';
    }
    return this.contextSection?.bannerTitle || '';
  }

  public get bannerDescription(): string {
    if (this.isOperations) {
      return 'با بروزرسانی عمیق در مرکز عملیات، پایگاه‌های داده محلی برای تمامی سامانه‌های انتخاب‌شده از نو همگام‌سازی می‌شوند. این فرآیند رکوردهای شبح (Ghosts) را پاکسازی می‌کند.';
    }
    return this.contextSection?.bannerDescription || '';
  }

  /** زبانه‌های مرکز عملیات: فقط بخش‌هایی که هدفی دارند */
  public get tabSections(): DeepSyncSectionView[] {
    return this.sections.filter(s => this.itemsOf(s).length > 0);
  }

  public get visibleSections(): DeepSyncSectionView[] {
    if (!this.isOperations) {
      const sec = this.contextSection;
      return sec ? [sec] : [];
    }
    const tab = this.activeOpsTab();
    return this.tabSections.filter(s => tab === 'all' || tab === s.scope);
  }

  /** متد ساده، نه computed: به contextMode که signal نیست وابسته است */
  public totalSelectedCount(): number {
    const sel = this.selectedByScope();
    if (!this.isOperations) return (sel[this.effectiveContext] || []).length;
    return this.sections.reduce((acc, s) => acc + (sel[s.scope] || []).length, 0);
  }

  public allOrganizationSelected(): boolean {
    const secs = this.sections;
    const sel = this.selectedByScope();
    const anyItems = secs.some(s => this.itemsOf(s).length > 0);
    return anyItems && secs.every(s => {
      const total = this.itemsOf(s).length;
      return total === 0 || (sel[s.scope] || []).length === total;
    });
  }

  ngOnChanges(changes: any) {
    if (changes.contextMode) {
      this.explicitContextModeSet = true;
    }

    if (changes.isOpen && this.isOpen) {
      this.initSelections();
    }
  }

  public accentOf(sec: DeepSyncSectionView): AccentClasses {
    return ACCENT_CLASSES[sec.accent] || ACCENT_CLASSES['indigo'];
  }

  public itemsOf(sec: DeepSyncSectionView): { id: number; name: string }[] {
    return sec.items ?? this._legacyItems()[sec.scope] ?? [];
  }

  public idsOf(scope: string): number[] {
    return this.selectedByScope()[scope] || [];
  }

  public isSelected(scope: string, id: number): boolean {
    return this.idsOf(scope).includes(id);
  }

  public allSelectedIn(sec: DeepSyncSectionView): boolean {
    const total = this.itemsOf(sec).length;
    return total > 0 && this.idsOf(sec.scope).length === total;
  }

  public toggleItem(scope: string, id: number): void {
    const current = this.idsOf(scope);
    this.setIds(scope, current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }

  public toggleSelectAll(sec: DeepSyncSectionView): void {
    this.setIds(sec.scope, this.allSelectedIn(sec) ? [] : this.itemsOf(sec).map(i => i.id));
  }

  public toggleSelectEntireOrganization(): void {
    const selectAll = !this.allOrganizationSelected();
    const next: Record<string, number[]> = {};
    for (const sec of this.sections) {
      next[sec.scope] = selectAll ? this.itemsOf(sec).map(i => i.id) : [];
    }
    this.selectedByScope.set(next);
  }

  public close(): void {
    this.closed.emit();
  }

  public confirm(): void {
    const sel = this.selectedByScope();
    const scopes = this.isOperations ? this.sections.map(s => s.scope) : [this.effectiveContext];
    const idsByScope: Record<string, number[]> = {};
    for (const scope of scopes) {
      if ((sel[scope] || []).length > 0) idsByScope[scope] = [...sel[scope]];
    }
    if (Object.keys(idsByScope).length === 0) return;

    const payload: { warehouseIds: number[]; projectIds: number[]; idsByScope?: Record<string, number[]> } = {
      warehouseIds: idsByScope[LOCKED_OFFLINE_SCOPES[0]] || [],
      projectIds: idsByScope[LOCKED_OFFLINE_SCOPES[1]] || [],
    };
    if (Object.keys(idsByScope).some(scope => !LOCKED_OFFLINE_SCOPES.includes(scope))) {
      payload.idsByScope = idsByScope;
    }
    this.startSyncMulti.emit(payload);

    if (this.isOperations) {
      this.startSync.emit(payload);
    } else {
      this.startSync.emit(idsByScope[this.effectiveContext] || []);
    }

    this.close();
  }

  private initSelections(): void {
    const preselect = (scope: string): number | null => {
      if (this.preselectByScope[scope] != null) return this.preselectByScope[scope];
      if (scope === LOCKED_OFFLINE_SCOPES[0]) return this.preselectWarehouseId;
      if (scope === LOCKED_OFFLINE_SCOPES[1]) return this.preselectProjectId;
      return null;
    };
    const scopes = new Set<string>([...LOCKED_OFFLINE_SCOPES, ...this.sections.map(s => s.scope)]);
    const next: Record<string, number[]> = {};
    for (const scope of scopes) {
      const id = this.isOperations || scope === this.effectiveContext ? preselect(scope) : null;
      next[scope] = id ? [id] : [];
    }
    this.selectedByScope.set(next);
  }

  private setIds(scope: string, ids: number[]): void {
    this.selectedByScope.set({ ...this.selectedByScope(), [scope]: ids });
  }

  private setLegacyItems(scope: string, items: { id: number; name: string }[]): void {
    this._legacyItems.set({ ...this._legacyItems(), [scope]: items || [] });
  }

  private legacySelection(scope: string): LegacySelection {
    const fn = (() => this.idsOf(scope)) as LegacySelection;
    fn.set = (ids: number[]) => this.setIds(scope, ids);
    return fn;
  }
}
