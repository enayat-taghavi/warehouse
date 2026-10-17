import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { ReportApiService } from '../../../../core/api/report-api.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import {
  AggFn,
  ChartType,
  FilterGroup,
  HavingOperator,
  ReportChart,
  ReportJoinMeta,
  ReportJoinSpec,
  ReportTemplate,
  ReportFieldMeta,
  ReportSavedState,
  parseReportFromQueryParams,
  serializeReportToQueryParams,
} from '../../../../core/models/report.model';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  PageEvent,
  SortState,
  TableColumnDirective,
} from '../../../../shared/components/data-table/data-table.component';
import { ReportStore } from './report-store';
import { FilterGroupComponent } from './filter-group.component';
import { SavedReportsComponent } from './saved-reports.component';
import { ExportProgressComponent } from './export-progress.component';
import { ReportChartComponent } from './report-chart.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { OverflowMenuComponent } from '../../../../shared/components/overflow-menu/overflow-menu.component';
import { saveBlob } from '../../../../core/platform/file-output';

/**
 * صفحه گزارش‌ساز پویا — پوسته اصلی
 * سایدبار قالب‌های ذخیره‌شده + سازنده (موجودیت ← فیلدها ← فیلتر ← گروه‌بندی ← اجرا)
 */
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DataTableComponent, TableColumnDirective,
    FilterGroupComponent, SavedReportsComponent, ExportProgressComponent,
    ReportChartComponent,
    SvgIconDirective,
    ActionButtonComponent,
    TabBarComponent,
    OverflowMenuComponent
  ],
  providers: [ReportStore],
  templateUrl: './reports.html',
})
export class Reports implements OnInit, OnDestroy {
  readonly helpTabs: TabDef[] = [
    { id: 'scenarios', label: 'سناریوهای آماده انبار', shortLabel: 'سناریوها', icon: 'clipboard' },
    { id: 'steps', label: 'مراحل ساخت گزارش', shortLabel: 'مراحل', icon: 'file-text' },
    { id: 'joins', label: 'ترکیب جداول و تجمیع', shortLabel: 'ترکیب', icon: 'columns' },
    { id: 'export', label: 'قالب‌ها و خروجی اکسل/PDF', shortLabel: 'خروجی', icon: 'download' },
  ];

  readonly store = inject(ReportStore);
  private reportApi = inject(ReportApiService);
  private warehouseHttp = inject(WarehouseHttpService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  private authStore = inject(AuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private readonly DRAFT_STORAGE_KEY = 'warehouse_report_builder_draft';
  private stateSubject$ = new Subject<void>();
  private stateSub?: Subscription;
  private isRestoring = false;

  // ─── انبارها برای فیلدهای پویا/scope ───
  warehouses = signal<{ id: number; name: string }[]>([]);

  // ─── درخت فیلتر: state محلی — فقط هنگام اجرا وارد store می‌شود ───
  filterRoot: FilterGroup = { op: 'AND', children: [] };

  // ─── جستجوی فیلدها ───
  fieldSearch = signal('');

  /** فیلدهای پایه با فیلتر جستجو — فیلدهای JOIN از visibleJoinFields() می‌آیند */
  readonly visibleFields = computed(() => {
    const q = this.fieldSearch().trim();
    const all = this.store.fieldsMeta();
    if (!q) return all;
    return all.filter((f) => f.label.includes(q) || f.key.includes(q));
  });

  // ─── تجمیع ───
  readonly aggFns: { value: AggFn; label: string }[] = [
    { value: 'count', label: 'تعداد' },
    { value: 'sum', label: 'جمع' },
    { value: 'avg', label: 'میانگین' },
    { value: 'min', label: 'کمینه' },
    { value: 'max', label: 'بیشینه' },
  ];

  // ─── مودال ذخیره قالب ───
  isSaveModalOpen = signal(false);
  saveName = '';
  saveDescription = '';
  saveIsPublic = false;
  readonly saveNameInput = viewChild<ElementRef<HTMLInputElement>>('saveNameInput');
  private lastFocusedElement: HTMLElement | null = null;

  openSaveModal(): void {
    this.lastFocusedElement = document.activeElement as HTMLElement;
    const t = this.store.activeTemplate();
    this.saveName = t?.name ?? '';
    this.saveDescription = t?.description ?? '';
    this.saveIsPublic = t?.is_public ?? false;
    this.isSaveModalOpen.set(true);
    requestAnimationFrame(() => {
      this.saveNameInput()?.nativeElement?.focus();
    });
  }

  closeSaveModal(): void {
    this.isSaveModalOpen.set(false);
    this.lastFocusedElement?.focus();
  }

  // ─── مودال راهنمای جامع ───
  isHelpModalOpen = signal(false);
  activeHelpTab = signal<'scenarios' | 'steps' | 'joins' | 'export'>('scenarios');

  openHelpModal(): void {
    this.lastFocusedElement = document.activeElement as HTMLElement;
    this.isHelpModalOpen.set(true);
  }

  closeHelpModal(): void {
    this.isHelpModalOpen.set(false);
    this.lastFocusedElement?.focus();
  }

  onDialogKeyDown(e: KeyboardEvent, container: HTMLElement): void {
    if (e.key !== 'Tab') return;
    const focusable = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  setHelpTab(tab: string): void {
    if (tab === 'scenarios' || tab === 'steps' || tab === 'joins' || tab === 'export') {
      this.activeHelpTab.set(tab);
    }
  }

  // ─── job خروجی بزرگ ───
  private readonly ACTIVE_EXPORT_JOB_KEY = 'wh_reports_active_export_job';
  exportJobId = signal<number | null>(null);
  exportTotalRows = signal(0);

  setExportJob(jobId: number | null, totalRows = 0): void {
    this.exportJobId.set(jobId);
    this.exportTotalRows.set(totalRows);
    try {
      if (jobId) {
        localStorage.setItem(this.ACTIVE_EXPORT_JOB_KEY, JSON.stringify({ jobId, totalRows }));
      } else {
        localStorage.removeItem(this.ACTIVE_EXPORT_JOB_KEY);
      }
    } catch {}
  }

  /** export در حال انجام — جداگانه برای PDF و Excel (#8) */
  exportingPdf = signal(false);
  exportingExcel = signal(false);
  /** هر دو با هم — برای disable کردن هر دو دکمه */
  readonly exporting = computed(() => this.exportingPdf() || this.exportingExcel());

  /** alias تکراری در تجمیع‌ها — block اجرا (#4) */
  readonly hasAliasConflict = computed(() => {
    const aliases = this.store.aggAliases();
    return new Set(aliases).size !== aliases.length;
  });

  /** نمودار آماده برای رسم — computed برای جلوگیری از محاسبه مضاعف (#23) */
  readonly chartReady = computed(() => {
    const c = this.store.chart();
    return !!(c && c.type && c.x && c.y);
  });

  ngOnInit(): void {
    this.store.loadEntities();
    this.store.loadTemplates();
    this.warehouseHttp.getAll().subscribe({
      next: (list) => this.warehouses.set(list.map((w) => ({ id: w.id, name: w.name }))),
      error: () => {},
    });

    // فراخوانی فهرست jobهای خروجی کاربر جهت پاک‌سازی رکوردهای کهنه در سرور و بازیابی خودکار وضعیت
    this.reportApi.getExportJobs().subscribe({
      next: (jobs) => {
        if (!this.exportJobId() && jobs && jobs.length) {
          const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'pending');
          if (activeJob) {
            this.setExportJob(activeJob.id, activeJob.total_rows);
          }
        }
      },
      error: () => {},
    });

    // بازیابی job فعال خروجی پس‌زمینه در صورت وجود (پایداری در برابر رفرش صفحه)
    try {
      const savedJob = localStorage.getItem(this.ACTIVE_EXPORT_JOB_KEY);
      if (savedJob) {
        const parsed = JSON.parse(savedJob);
        if (parsed?.jobId) {
          this.setExportJob(parsed.jobId, parsed.totalRows || 0);
        }
      }
    } catch {}

    // سابسکریپشن همگام‌سازی بلادرنگ Debounced با URL و LocalStorage
    this.stateSub = this.stateSubject$.pipe(debounceTime(300)).subscribe(() => {
      if (this.isRestoring) return;
      const currentState = this.store.serializeState(this.filterRoot, this.tableDensity());
      if (currentState && currentState.entity) {
        try {
          localStorage.setItem(this.DRAFT_STORAGE_KEY, JSON.stringify(currentState));
        } catch {}
        const qp = serializeReportToQueryParams(currentState);
        this.router.navigate([], { relativeTo: this.route, queryParams: qp, replaceUrl: true });
      } else {
        try {
          localStorage.removeItem(this.DRAFT_STORAGE_KEY);
        } catch {}
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
    });

    // بررسی پارامترهای اولیه URL یا بازیابی پیش‌نویس از LocalStorage
    const params = this.route.snapshot.queryParams;
    let initialState = parseReportFromQueryParams(params);

    if (!initialState) {
      try {
        const savedDraft = localStorage.getItem(this.DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          initialState = parseReportFromQueryParams(parsed) || (parsed?.entity ? parsed : null);
        }
      } catch {}
    }

    if (initialState && initialState.entity) {
      this.restoreStateAndRun(initialState);
    } else {
      // در کانتکست انبار، انبار فعال پیش‌فرض شود
      const active = this.authStore.activeWarehouseId();
      if (typeof active === 'number') this.store.setWarehouse(active);
    }
  }

  ngOnDestroy(): void {
    this.stateSub?.unsubscribe();
  }

  /** بازیابی کامل وضعیت و اجرای خودکار (Auto-Run) */
  restoreStateAndRun(state: ReportSavedState): void {
    this.isRestoring = true;
    if (state.filters) {
      this.filterRoot = JSON.parse(JSON.stringify(state.filters));
    } else {
      this.filterRoot = { op: 'AND', children: [] };
    }
    if (state.density) {
      this.tableDensity.set(state.density);
    }

    this._joinTargetFields.set(new Map());

    this.store.applySavedState(state, (res) => {
      this._loadAllJoinFields(state.joins, res.joins, () => {
        this.isRestoring = false;
        // اجرای خودکار در صورت وجود موجودیت معتبر، آنلاین بودن و معتبر بودن ساختار
        if (this.store.entityKey() && !this.store.isOffline() && this.validateReportSpec(true)) {
          const snapshot: FilterGroup = JSON.parse(JSON.stringify(this.filterRoot));
          this.store.run(snapshot.children.length ? snapshot : null, true);
        }
        this.notifyStateChanged();
      });
    });
  }

  notifyStateChanged(): void {
    if (this.isRestoring) return;
    this.stateSubject$.next();
  }

  onFilterChanged(): void {
    this.notifyStateChanged();
  }

  resetReport(): void {
    this.isRestoring = true;
    try {
      localStorage.removeItem(this.DRAFT_STORAGE_KEY);
    } catch {}
    this.filterRoot = { op: 'AND', children: [] };
    this.store.selectEntity(null);
    this.tableDensity.set('standard');
    this._joinTargetFields.set(new Map());
    this.router.navigate(['/reports'], { queryParams: {}, replaceUrl: true }).then(() => {
      this.isRestoring = false;
      const active = this.authStore.activeWarehouseId();
      if (typeof active === 'number') this.store.setWarehouse(active);
      this.toast.success('فرم گزارش با موفقیت بازنشانی شد.');
    });
  }

  // ------------------------------------------------------------ entity/fields
  onEntityChange(key: string): void {
    this.filterRoot = { op: 'AND', children: [] };
    this.store.selectEntity(key || null);
    this.notifyStateChanged();
  }

  onWarehouseChange(v: number | null): void {
    this.store.setWarehouse(v ?? null);
    this.notifyStateChanged();
  }

  toggleField(key: string): void {
    this.store.selectedFields.update((arr) =>
      arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key],
    );
    this.notifyStateChanged();
  }

  moveField(key: string, dir: -1 | 1): void {
    this.store.selectedFields.update((arr) => {
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const copy = [...arr];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    this.notifyStateChanged();
  }

  removeSelectedField(key: string): void {
    this.store.selectedFields.update((arr) => arr.filter((k) => k !== key));
    this.notifyStateChanged();
  }

  getFieldLabel(key: string): string {
    const baseField = this.store.fieldByKey().get(key);
    if (baseField) return baseField.label;
    const found = this.allSelectableFields().find((f) => f.key === key);
    return found?.label || key;
  }

  // ─────────────────────────── JOINها ───────────────────────────
  /** JOIN‌هایی که کاربر انتخاب کرده (از store) */
  readonly activeJoins = computed(() => this.store.joins());

  /** اضافه کردن یک JOIN */
  addJoin(jm: ReportJoinMeta): void {
    const current = this.store.joins();
    if (current.some((j) => j.to === jm.key)) return; // تکراری نباشد
    const newJoin: ReportJoinSpec = { to: jm.key, type: 'left', as: jm.default_alias };
    this.store.joins.update((arr) => [...arr, newJoin]);
    // بعد از اضافه کردن JOIN، فیلدهای مقصد را از API بگیر
    this._loadJoinTargetFields(jm);

    // بررسی Auto-Swap برای توابع تجمیعی در صورت اضافه شدن جدول چندمقداری
    if (jm.cardinality === 'many') {
      let swapped = false;
      this.store.aggregations.update(arr => arr.map(a => {
        if (!a.field.includes('.') && a.fn !== 'count') {
          swapped = true;
          return { ...a, fn: 'count' };
        }
        return a;
      }));
      if (swapped) {
        this.store.pruneAggDependents();
        this.toast.info('به دلیل اضافه شدن جدول چندمقداری، توابع تجمیع فیلدهای پایه برای جلوگیری از محاسبه اشتباه، به صورت خودکار به شمارش (Count) تغییر یافتند.');
      }
    }
    this.notifyStateChanged();
  }

  removeJoin(joinKey: string): void {
    const alias = this.store.joins().find((j) => j.to === joinKey)?.as ?? joinKey;
    this.store.joins.update((arr) => arr.filter((j) => j.to !== joinKey));
    // فیلدهای این JOIN را از انتخاب‌ها حذف کن
    this.clearJoinSelections(alias);
    // فیلدهای کش این JOIN را حذف کن
    this._joinTargetFields.update((map) => {
      const next = new Map(map);
      next.delete(alias);
      return next;
    });
    this.notifyStateChanged();
  }

  clearJoinSelections(alias: string): void {
    const prefix = `${alias}.`;
    this.store.selectedFields.update((arr) => arr.filter((k) => !k.startsWith(prefix)));
    this.store.groupBy.update((arr) => arr.filter((k) => !k.startsWith(prefix)));
    this.store.aggregations.update((arr) => arr.filter((a) => !a.field.startsWith(prefix)));
    this.store.pruneAggDependents();
  }

  checkAndSwitchManyJoin(fieldKey: string): void {
    if (!fieldKey.includes('.')) return;
    const alias = fieldKey.split('.')[0];
    if (this.store.manyJoinAliases().has(alias)) {
      const active = this.store.activeManyJoinAlias();
      if (active && active !== alias) {
        this.clearJoinSelections(active);
        const activeLabel = this.store.joinsMeta().find(j => j.key === active)?.label || active;
        this.toast.info(`انتخاب‌های قبلی از جدول «${activeLabel}» به دلیل محدودیت جداول چندمقداری لغو شد.`);
      }
    }
  }

  updateJoinType(joinKey: string, type: 'left' | 'inner'): void {
    this.store.joins.update((arr) =>
      arr.map((j) => (j.to === joinKey ? { ...j, type } : j))
    );
    this.notifyStateChanged();
  }

  /** فیلدهای مقصد هر JOIN — بارگذاری‌شده از API */
  private _joinTargetFields = signal<Map<string, ReportFieldMeta[]>>(new Map());

  readonly joinTargetFieldsMap = computed(() => this._joinTargetFields());

  /** بارگذاری فیلدهای موجودیت مقصد JOIN از API */
  private _loadJoinTargetFields(jm: ReportJoinMeta, onComplete?: () => void): void {
    this.reportApi.getFields(jm.target, this.store.warehouseId()).subscribe({
      next: (res) => {
        const alias = this.store.joins().find((j) => j.to === jm.key)?.as ?? jm.default_alias;
        // فیلدها را با پیشوند alias. در map ذخیره کن
        const prefixed = res.fields.map((f) => ({
          key: `${alias}.${f.key}`,
          label: `${f.label} (${jm.label})`,
          type: f.type,
          operators: f.operators,
          choices: f.choices,
          groupable: f.groupable,
          aggregatable: f.aggregatable,
          dynamic: f.dynamic,
        }));
        this._joinTargetFields.update((map) => {
          const next = new Map(map);
          next.set(alias, prefixed);
          return next;
        });
        onComplete?.();
      },
      error: () => {
        onComplete?.();
      },
    });
  }

  /** بارگذاری هماهنگ تمام فیلدهای مقصدهای JOIN و فراخوانی اکشن نهایی پس از تکمیل کامل */
  private _loadAllJoinFields(joins: ReportJoinSpec[] | undefined, joinsMeta: ReportJoinMeta[] | undefined, onComplete: () => void): void {
    if (!joins || !joins.length || !joinsMeta || !joinsMeta.length) {
      onComplete();
      return;
    }
    const validJms = joins
      .map((jspec) => joinsMeta.find((j) => j.key === jspec.to))
      .filter((jm): jm is ReportJoinMeta => !!jm);
    if (!validJms.length) {
      onComplete();
      return;
    }
    let remaining = validJms.length;
    for (const jm of validJms) {
      this._loadJoinTargetFields(jm, () => {
        remaining--;
        if (remaining <= 0) {
          onComplete();
        }
      });
    }
  }

  /** همه فیلدهای قابل انتخاب: پایه + مقصدهای JOIN */
  readonly allSelectableFields = computed(() => {
    const base = this.store.fieldsMeta();
    const joinMap = this._joinTargetFields();
    const joined = Array.from(joinMap.values()).flat();
    return [...base, ...joined];
  });

  /** فیلدهای JOIN برای نمایش در picker — فیلتر با جستجو */
  readonly visibleJoinFields = computed(() => {
    const q = this.fieldSearch().trim();
    const joinMap = this._joinTargetFields();
    const joinsMeta = this.store.joinsMeta();
    const activeJoins = this.store.joins();
    const result: { alias: string; label: string; fields: ReportFieldMeta[] }[] = [];
    joinMap.forEach((fields, alias) => {
      const filtered = q ? fields.filter((f) => f.label.includes(q) || f.key.includes(q)) : fields;
      const jspec = activeJoins.find((j) => (j.as || j.to) === alias);
      const jm = joinsMeta.find((j) => j.key === (jspec?.to || alias));
      const groupLabel = jm ? `فیلدهای ${jm.label}` : alias;
      if (filtered.length) result.push({ alias, label: groupLabel, fields: filtered });
    });
    return result;
  });

  isJoinFieldSelected(key: string): boolean {
    return this.store.selectedFields().includes(key);
  }

  toggleJoinField(key: string): void {
    this.checkAndSwitchManyJoin(key);
    this.store.selectedFields.update((arr) =>
      arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]
    );
    this.notifyStateChanged();
  }

  // ─────────────────────────────────────────────────────────────
  toggleGroupBy(key: string): void {
    this.checkAndSwitchManyJoin(key);
    this.store.groupBy.update((arr) =>
      arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key],
    );
    // اولین تجمیع پیش‌فرض: تعداد ردیف
    if (this.store.groupBy().length && !this.store.aggregations().length) {
      const idField = this.store.fieldsMeta().find((f) => f.key === 'id');
      if (idField) {
        this.store.aggregations.set([{ field: 'id', fn: 'count', alias: 'row_count' }]);
      }
    }
    this.store.pruneAggDependents();
    this.notifyStateChanged();
  }

  addAggregation(): void {
    const numeric = this.store.fieldsMeta().find((f) => f.aggregatable);
    const target = numeric ?? this.store.fieldsMeta().find((f) => f.key === 'id');
    if (!target) return;
    this.store.aggregations.update((arr) => [
      ...arr,
      { field: target.key, fn: numeric ? 'sum' : 'count', alias: '', label: '' },
    ]);
    this.notifyStateChanged();
  }

  isFieldCountOnly(fieldKey: string): boolean {
    if (!fieldKey) return false;
    const isBase = !fieldKey.includes('.');
    const hasManyInOutput = !!this.store.activeManyJoinAlias();
    if (isBase && hasManyInOutput) return true;

    const fd = this.allSelectableFields().find(f => f.key === fieldKey);
    if (!fd) return true;
    return !fd.aggregatable;
  }

  // ── تراکم جدول خروجی ──
  readonly tableDensity = signal<'compact' | 'standard'>('standard');
  setTableDensity(d: 'compact' | 'standard') {
    this.tableDensity.set(d);
    this.notifyStateChanged();
  }

  // ── اعتبارسنجی نام مستعار (Alias Validation) ──
  readonly ALIAS_REGEX = /^[a-z_][a-z0-9_]{0,40}$/;

  isRowAliasConflict(alias: string | undefined, currentIndex: number): boolean {
    if (!alias || !alias.trim()) return false;
    const clean = alias.trim();
    const aggs = this.store.aggregations();
    return aggs.some((a, idx) => idx !== currentIndex && a.alias?.trim() === clean);
  }

  isRowAliasInvalidFormat(alias: string | undefined): boolean {
    if (!alias || !alias.trim()) return false;
    return !this.ALIAS_REGEX.test(alias.trim());
  }

  isRowAliasHasError(alias: string | undefined, currentIndex: number): boolean {
    return this.isRowAliasConflict(alias, currentIndex) || this.isRowAliasInvalidFormat(alias);
  }

  updateAggregation(index: number, patch: Partial<{ field: string; fn: AggFn; alias: string; label: string }>): void {
    if (patch.field) this.checkAndSwitchManyJoin(patch.field);
    this.store.aggregations.update((arr) =>
      arr.map((a, i) => {
        if (i !== index) return a;
        const next = { ...a, ...patch };
        if (this.isFieldCountOnly(next.field) && next.fn !== 'count') {
          next.fn = 'count';
          this.toast.info('تابع تجمیع به دلیل محدودیت فیلد به‌طور خودکار به شمارش (Count) تغییر یافت.');
        }
        return next;
      })
    );
    this.store.pruneAggDependents();
    this.notifyStateChanged();
  }

  removeAggregation(index: number): void {
    this.store.aggregations.update((arr) => arr.filter((_, i) => i !== index));
    this.store.pruneAggDependents();
    this.notifyStateChanged();
  }

  aggregatableFields() {
    const base = this.store.fieldsMeta().filter((f) => f.aggregatable || f.key === 'id');
    const joinFields = Array.from(this._joinTargetFields().values()).flat()
      .filter((f) => f.aggregatable || f.key.endsWith('.id'));
    return [...base, ...joinFields];
  }

  groupableFields() {
    const base = this.store.fieldsMeta().filter((f) => f.groupable);
    const joinFields = Array.from(this._joinTargetFields().values()).flat()
      .filter((f) => f.groupable);
    return [...base, ...joinFields];
  }
  // ------------------------------------------------------ HAVING (شرط تجمیع)
  readonly havingOps: { value: HavingOperator; label: string }[] = [
    { value: 'eq', label: 'برابر' },
    { value: 'gt', label: 'بزرگ‌تر' },
    { value: 'gte', label: 'بزرگ‌تر یا مساوی' },
    { value: 'lt', label: 'کوچک‌تر' },
    { value: 'lte', label: 'کوچک‌تر یا مساوی' },
    { value: 'between', label: 'بازه' },
  ];

  /** برچسب نمایشی alias — نام alias یا «تابع + برچسب فیلد» */
  aliasLabel(alias: string): string {
    const i = this.store.aggAliases().indexOf(alias);
    const agg = this.store.aggregations()[i];
    if (!agg) return alias;
    if (agg.label && agg.label.trim()) return agg.label.trim();
    const fn = this.aggFns.find((f) => f.value === agg.fn)?.label ?? agg.fn;
    const field = this.getFieldLabel(agg.field);
    return `${fn} ${field}`;
  }

  addHaving(): void {
    const alias = this.store.aggAliases()[0];
    if (!alias) return;
    this.store.having.update((arr) => [...arr, { alias, operator: 'gte', value: null }]);
    this.notifyStateChanged();
  }

  updateHaving(index: number, patch: Partial<{ alias: string; operator: HavingOperator; value: unknown }>): void {
    this.store.having.update((arr) =>
      arr.map((h, i) => {
        if (i !== index) return h;
        const next = { ...h, ...patch };
        if (patch.operator === 'between' && !Array.isArray(next.value)) next.value = [null, null];
        if (patch.operator && patch.operator !== 'between' && Array.isArray(next.value)) next.value = null;
        return next;
      }),
    );
    this.notifyStateChanged();
  }

  updateHavingBetween(index: number, pos: 0 | 1, v: unknown): void {
    this.store.having.update((arr) =>
      arr.map((h, i) => {
        if (i !== index) return h;
        const pair = Array.isArray(h.value) ? [...h.value] : [null, null];
        pair[pos] = v === '' ? null : v;
        return { ...h, value: pair };
      }),
    );
    this.notifyStateChanged();
  }

  removeHaving(index: number): void {
    this.store.having.update((arr) => arr.filter((_, i) => i !== index));
    this.notifyStateChanged();
  }

  havingBetweenVal(value: unknown, pos: 0 | 1): unknown {
    return Array.isArray(value) ? (value[pos] ?? '') : '';
  }

  // ---------------------------------------------------------------- نمودار
  readonly chartTypes: { value: ChartType; label: string }[] = [
    { value: 'bar', label: 'ستونی' },
    { value: 'pie', label: 'دایره‌ای' },
    { value: 'line', label: 'خطی' },
  ];

  setChart(patch: Partial<ReportChart>): void {
    const cur = this.store.chart() ?? { type: 'bar' as ChartType, x: '', y: '' };
    const next = { ...cur, ...patch };
    // پیش‌فرض هوشمند: تنها گزینه موجود انتخاب شود
    if (!next.x && this.store.groupBy().length === 1) next.x = this.store.groupBy()[0];
    if (!next.y && this.store.aggAliases().length === 1) next.y = this.store.aggAliases()[0];
    this.store.chart.set(next);
    if (this.chartReady() && this.store.hasRun()) this.store.fetchChartRows();
    this.notifyStateChanged();
  }

  clearChart(): void {
    this.store.chart.set(null);
    this.store.chartRows.set([]);
    this.notifyStateChanged();
  }

  chartXLabel(): string {
    const c = this.store.chart();
    if (!c) return '';
    return this.getFieldLabel(c.x);
  }

  chartYLabel(): string {
    const c = this.store.chart();
    return c ? this.aliasLabel(c.y) : '';
  }

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.isSaveModalOpen()) {
      this.closeSaveModal();
    } else if (this.isHelpModalOpen()) {
      this.closeHelpModal();
    }
  }

  // ------------------------------------------------------------------ اجرا
  countTotalConditions(node: any): number {
    if (!node) return 0;
    if (node.op) {
      return (node.children || []).reduce((sum: number, child: any) => sum + this.countTotalConditions(child), 0);
    }
    return 1;
  }

  get totalConditionsCount(): number {
    return this.countTotalConditions(this.filterRoot);
  }

  private validateReportSpec(silent = false): boolean {
    if (!this.store.grouped() && this.store.selectedFields().length === 0) {
      if (!silent) this.toast.warning('لطفاً حداقل یک فیلد برای نمایش در گزارش انتخاب کنید.');
      return false;
    }
    // جلوگیری از HAVING با مقدار خالی (#6)
    const invalidHaving = this.store.having().some((h) => {
      if (h.operator === 'between') {
        return !Array.isArray(h.value) || h.value[0] === null || h.value[1] === null;
      }
      return h.value === null || h.value === '';
    });
    if (invalidHaving) {
      if (!silent) this.toast.warning('لطفاً مقدار همه شرط‌های «HAVING» را وارد کنید.');
      return false;
    }
    // جلوگیری از فیلترهای ناقص
    let hasInvalidFilter = false;
    const checkFilters = (node: any) => {
      if (node.op) {
        node.children?.forEach(checkFilters);
      } else {
        if (!node.field) {
          hasInvalidFilter = true;
        } else if (node.operator === 'between' && (!Array.isArray(node.value) || node.value[0] === null || node.value[1] === null)) {
          hasInvalidFilter = true;
        } else if (node.operator === 'in' && (!Array.isArray(node.value) || node.value.length === 0)) {
          hasInvalidFilter = true;
        }
      }
    };
    checkFilters(this.filterRoot);
    if (hasInvalidFilter) {
      if (!silent) this.toast.warning('لطفاً مقدار همه فیلترها را کامل وارد کنید (مخصوصاً فیلترهای بازه و لیستی).');
      return false;
    }

    // جلوگیری از alias تکراری در تجمیع (#4)
    if (this.hasAliasConflict()) {
      if (!silent) this.toast.warning('دو تجمیع با نام مستعار یکسان وجود دارد — لطفاً نام مستعار دستی وارد کنید.');
      return false;
    }
    const hasInvalidAliasFormat = this.store.aggregations().some(a => a.alias && this.isRowAliasInvalidFormat(a.alias));
    if (hasInvalidAliasFormat) {
      if (!silent) this.toast.warning('نام مستعار ستون تجمیعی نامعتبر است. فقط حروف کوچک انگلیسی (a-z)، عدد و _ مجاز است (مثال: total_inv).');
      return false;
    }
    return true;
  }

  runReport(): void {
    if (this.store.isOffline()) {
      this.toast.warning('گزارش‌گیری فقط در حالت آنلاین در دسترس است.');
      return;
    }
    if (!this.validateReportSpec()) {
      return;
    }
    this.store.page.set(1);
    const snapshot: FilterGroup = JSON.parse(JSON.stringify(this.filterRoot));
    this.store.run(snapshot.children.length ? snapshot : null, true);
    this.notifyStateChanged();
  }

  onPageChanged(e: PageEvent): void {
    this.store.page.set(e.page);
    this.store.pageSize.set(e.pageSize);
    this.store.run();
    this.notifyStateChanged();
  }

  onSortChanged(s: SortState): void {
    if (!s.key) {
      this.store.sort.set([]);
    } else {
      this.store.sort.set([{ field: s.key, dir: s.direction }]);
    }
    this.store.page.set(1);
    this.store.run(undefined, true);
    this.notifyStateChanged();
  }

  // ------------------------------------------------------------ Excel / PDF
  exportExcel(): void {
    this.exportReport('xlsx');
  }

  exportPdf(): void {
    this.exportReport('pdf');
  }

  private exportReport(format: 'xlsx' | 'pdf'): void {
    const label = format === 'pdf' ? 'PDF' : 'Excel';
    if (this.store.isOffline()) {
      this.toast.warning(`خروجی ${label} فقط در حالت آنلاین در دسترس است.`);
      return;
    }
    if (!this.validateReportSpec()) {
      return;
    }
    // سینک فیلتر UI — export همیشه با وضعیت فعلی UI باشد، نه آخرین «اجرا» (#2)
    // store.filters بعد از اتمام export بازگردانده می‌شود تا صفحه‌بندی لطمه نخورد (#3)
    const snapshot: FilterGroup = JSON.parse(JSON.stringify(this.filterRoot));
    const savedFilters = this.store.filters();
    this.store.filters.set(snapshot.children.length ? snapshot : null);
    const spec = this.store.buildSpec(true);
    this.store.filters.set(savedFilters);

    if (!spec) return;
    spec.report_name = this.store.activeTemplate()?.name || 'report';
    spec.format = format;

    const exportSignal = format === 'pdf' ? this.exportingPdf : this.exportingExcel;
    this.setExportJob(null);
    exportSignal.set(true);

    this.reportApi.export(spec).subscribe({
      next: (outcome) => {
        exportSignal.set(false);
        if (outcome.kind === 'file') {
          void saveBlob(outcome.blob, `${spec.report_name}.${format}`);
          this.toast.success(`فایل ${label} دانلود شد.`);
        } else {
          // فقط xlsx بزرگ به job می‌رسد؛ PDF همیشه sync است
          this.setExportJob(outcome.jobId, outcome.totalRows);
          this.toast.info('نتیجه بزرگ است؛ فایل در سرور تولید می‌شود و درصد پیشرفت را می‌بینید.');
        }
      },
      error: async (e) => {
        exportSignal.set(false);
        let msg = `خطا در تولید خروجی ${label}.`;
        try {
          if (e?.error instanceof Blob) {
            const txt = await e.error.text();
            try {
              const j = JSON.parse(txt);
              msg = j.error || j.detail || msg;
            } catch {
              if (txt && txt.length < 200) msg = txt;
            }
          } else {
            msg = this.store.msg(e);
          }
        } catch { /* پیام پیش‌فرض */ }
        this.toast.error(msg);
      },
    });
  }

  // ------------------------------------------------------------------ قالب‌ها
  saveTemplate(asNew: boolean): void {
    const entity = this.store.entityKey();
    if (!entity || !this.saveName.trim()) return;
    const snapshot: FilterGroup = JSON.parse(JSON.stringify(this.filterRoot));
    // ذخیره و بازگرداندن store.filters — ذخیره قالب نباید فیلتر اجراشده را تغییر دهد (#3)
    const savedFilters = this.store.filters();
    this.store.filters.set(snapshot.children.length ? snapshot : null);
    const spec = this.store.buildSpec(true);
    this.store.filters.set(savedFilters);
    if (!spec) return;

    const payload = {
      name: this.saveName.trim(),
      description: this.saveDescription.trim() || null,
      entity,
      spec,
      is_public: this.saveIsPublic,
      warehouse: this.store.warehouseId(),
    } as Partial<ReportTemplate>;

    const existing = this.store.activeTemplate();
    const req = (!asNew && existing && existing.is_owner)
      ? this.reportApi.updateTemplate(existing.id, payload)
      : this.reportApi.createTemplate(payload);

    req.subscribe({
      next: (t) => {
        this.toast.success('قالب گزارش ذخیره شد.');
        this.closeSaveModal();
        this.store.activeTemplate.set(t);
        this.store.loadTemplates();
      },
      error: (e) => this.toast.error(this.store.msg(e)),
    });
  }

  loadTemplate(t: ReportTemplate): void {
    this.filterRoot = t.spec.filters
      ? JSON.parse(JSON.stringify(t.spec.filters))
      : { op: 'AND', children: [] };
    // بارگذاری فیلدهای مقصد JOINهای ذخیره‌شده در قالب پس از رسیدن متادیتای فیلدها
    this._joinTargetFields.set(new Map());
    this.store.applyTemplate(t, (res) => {
      this._loadAllJoinFields(t.spec.joins, res.joins, () => {
        this.toast.success(`قالب «${t.name}» با موفقیت بارگذاری شد.`);
        this.notifyStateChanged();
        // اجرای خودکار پس از بارگذاری قالب جهت تجربه کاربری سریع و روان
        if (!this.store.isOffline() && this.validateReportSpec()) {
          this.runReport();
        }
      });
    });
  }

  deleteTemplate(t: ReportTemplate): void {
    this.confirmDialog.open({
      title: 'حذف قالب گزارش',
      message: `آیا از حذف قالب «${t.name}» اطمینان دارید؟`,
      type: 'danger',
      confirmText: 'حذف'
    }).then((ok) => {
      if (!ok) return;
      this.reportApi.deleteTemplate(t.id).subscribe({
        next: () => {
          this.toast.success('قالب حذف شد.');
          if (this.store.activeTemplate()?.id === t.id) this.store.activeTemplate.set(null);
          this.store.loadTemplates();
        },
        error: (e) => this.toast.error(this.store.msg(e)),
      });
    });
  }

  toggleTemplatePublic(t: ReportTemplate): void {
    this.reportApi.updateTemplate(t.id, { is_public: !t.is_public }).subscribe({
      next: () => {
        this.toast.success(t.is_public ? 'قالب خصوصی شد.' : 'قالب عمومی شد.');
        this.store.loadTemplates();
      },
      error: (e) => this.toast.error(this.store.msg(e)),
    });
  }

  // ------------------------------------------------------------------ نمایش
  formatCell(value: unknown, type: string): string {
    if (value === null || value === undefined || value === '') return '—';
    if (type === 'boolean') return value === true || value === 'true' ? 'بله' : 'خیر';
    if (type === 'number') {
      const num = Number(value);
      if (!isNaN(num)) {
        return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 3 }).format(num);
      }
    }
    if ((type === 'date' || type === 'datetime') && typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('fa-IR', {
          dateStyle: 'short',
          ...(type === 'datetime' ? { timeStyle: 'short' } : {}),
        }).format(d);
      }
    }
    return String(value);
  }
}
