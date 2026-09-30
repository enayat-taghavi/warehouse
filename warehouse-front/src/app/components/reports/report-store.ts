import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ReportApiService } from '../../core/api/report-api.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { isServerUnreachable } from '../../core/services/server-reachability';
import {
  EntityFieldsResponse,
  FilterGroup,
  ReportAggregation,
  ReportChart,
  ReportColumn,
  ReportEntity,
  ReportFieldMeta,
  ReportHaving,
  ReportJoinMeta,
  ReportJoinSpec,
  ReportSavedState,
  ReportSort,
  ReportSpec,
  ReportTemplate,
} from '../../core/models/report.model';

/**
 * Store سیگنالی گزارش‌ساز — state کامل صفحه /reports
 *
 * نکته state درخت فیلتر: درخت حین ویرایش state محلی کامپوننت‌هاست؛
 * فقط لحظه «اجرا» به‌صورت یک آبجکت کامل وارد این store می‌شود.
 */
@Injectable()
export class ReportStore {
  private api = inject(ReportApiService);
  private network = NetworkStatusService.getInstance();

  // ─── وضعیت شبکه (گزارش‌گیری فقط-آنلاین) ───
  readonly connectionState = toSignal(this.network.state$, {
    initialValue: this.network.state,
  });
  readonly isOffline = computed(() => this.connectionState() !== 'online');

  // ─── انتخاب موجودیت و متادیتا ───
  readonly entities = signal<ReportEntity[]>([]);
  readonly entityKey = signal<string | null>(null);
  readonly warehouseId = signal<number | null>(null);
  readonly fieldsMeta = signal<ReportFieldMeta[]>([]);
  readonly joinsMeta = signal<ReportJoinMeta[]>([]);  // JOINهای مجاز از متادیتا
  readonly fieldsLoading = signal(false);
  readonly isRefreshing = signal(false);

  /** سابسکریپشن loadFields — برای لغو درخواست قبلی در صورت تغییر سریع entity/warehouse (#9) */
  private _fieldsReq: Subscription | null = null;

  readonly fieldByKey = computed(() => {
    const m = new Map<string, ReportFieldMeta>();
    for (const f of this.fieldsMeta()) m.set(f.key, f);
    return m;
  });

  // ─── spec در حال ساخت ───
  readonly selectedFields = signal<string[]>([]);
  readonly groupBy = signal<string[]>([]);
  readonly aggregations = signal<ReportAggregation[]>([]);
  readonly having = signal<ReportHaving[]>([]);
  readonly sort = signal<ReportSort[]>([]);
  readonly filters = signal<FilterGroup | null>(null); // فقط هنگام اجرا ست می‌شود
  readonly chart = signal<ReportChart | null>(null); // فقط-کلاینت؛ در قالب ذخیره می‌شود
  readonly joins = signal<ReportJoinSpec[]>([]);     // JOINهای انتخاب‌شده
  readonly page = signal(1);
  readonly pageSize = signal(50);

  readonly grouped = computed(() => this.groupBy().length > 0);

  /** مجموعه‌ای از aliasهای مربوط به JOINهای چندمقداری (many) */
  readonly manyJoinAliases = computed(() => {
    const metaMap = new Map(this.joinsMeta().map((j) => [j.key, j]));
    const set = new Set<string>();
    for (const j of this.joins()) {
      const meta = metaMap.get(j.to);
      if (meta && meta.cardinality === 'many') {
        set.add(j.as || j.to);
      }
    }
    return set;
  });

  /** 
   * برگرداندن alias اولین جدول چندمقداری که در حال حاضر فیلدی از آن در خروجی انتخاب شده است 
   * (در selectedFields، groupBy یا aggregations)
   */
  readonly activeManyJoinAlias = computed(() => {
    const manyAliases = this.manyJoinAliases();
    if (!manyAliases.size) return null;
    
    const usedFields = new Set([
      ...this.selectedFields(),
      ...this.groupBy(),
      ...this.aggregations().map(a => a.field)
    ]);
    
    for (const alias of manyAliases) {
      if ([...usedFields].some(f => f.startsWith(`${alias}.`))) {
        return alias;
      }
    }
    return null;
  });

  /** aliasهای معتبر تجمیع — منبع گزینه‌های HAVING و محور Y نمودار */
  readonly aggAliases = computed(() =>
    this.aggregations().map((a) => a.alias || `${a.fn}_${(a.field || '').replace(/\./g, '_')}`.replace(/__/g, '_')),
  );

  // ─── نتیجه ───
  readonly rows = signal<Record<string, unknown>[]>([]);
  readonly columns = signal<ReportColumn[]>([]);
  readonly count = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasRun = signal(false);
  readonly joinMode = signal<'flat' | 'exists' | 'aggregated' | null>(null);

  // ─── داده نمودار (کل نتیجه تا سقف ۲۰۰ گروه، مستقل از صفحه‌بندی جدول) ───
  readonly chartRows = signal<Record<string, unknown>[]>([]);
  readonly chartRowsLoading = signal(false);

  // ─── قالب‌ها ───
  readonly templates = signal<ReportTemplate[]>([]);
  readonly activeTemplate = signal<ReportTemplate | null>(null);

  // ------------------------------------------------------------------ actions
  refreshAll(): void {
    if (this.isOffline()) {
      return;
    }
    this.isRefreshing.set(true);
    let doneCount = 0;
    const checkDone = () => {
      doneCount++;
      if (doneCount >= 2) {
        this.isRefreshing.set(false);
      }
    };

    this.api.getEntities().subscribe({
      next: (list) => {
        this.entities.set(list);
        this.error.set(null);
      },
      error: (e) => {
        if (!this.isOffline()) {
          this.error.set(this.msg(e));
        }
      },
    }).add(checkDone);

    this.api.getTemplates().subscribe({
      next: (list) => this.templates.set(list),
      error: () => {},
    }).add(checkDone);
  }

  loadEntities(): void {
    if (this.isOffline()) {
      return;
    }
    this.api.getEntities().subscribe({
      next: (list) => {
        this.entities.set(list);
        this.error.set(null);
      },
      error: (e) => {
        if (!this.isOffline()) {
          this.error.set(this.msg(e));
        }
      },
    });
  }

  selectEntity(key: string | null, keepSpec = false): void {
    this.entityKey.set(key);
    if (!keepSpec) {
      this.selectedFields.set([]);
      this.groupBy.set([]);
      this.aggregations.set([]);
      this.having.set([]);
      this.sort.set([]);
      this.filters.set(null);
      this.chart.set(null);
      this.joins.set([]);
      this.rows.set([]);
      this.columns.set([]);
      this.count.set(0);
      this.chartRows.set([]);
      this.hasRun.set(false);
      this.activeTemplate.set(null);
    }
    this.error.set(null);
    this.fieldsMeta.set([]);
    this.joinsMeta.set([]);
    if (key) this.loadFields();
  }

  setWarehouse(id: number | null): void {
    this.warehouseId.set(id);
    if (this.entityKey()) this.loadFields();
  }

  loadFields(onLoaded?: (res: EntityFieldsResponse) => void): void {
    const key = this.entityKey();
    if (!key) return;
    this.fieldsLoading.set(true);
    // لغو درخواست قبلی — جلوگیری از race condition هنگام تغییر سریع entity/warehouse (#9)
    this._fieldsReq?.unsubscribe();
    this._fieldsReq = this.api.getFields(key, this.warehouseId()).subscribe({
      next: (res: EntityFieldsResponse) => {
        this._fieldsReq = null;
        this.fieldsMeta.set(res.fields);
        this.joinsMeta.set(res.joins ?? []);
        this.fieldsLoading.set(false);
        // فیلدهای انتخابی که دیگر مجاز/موجود نیستند حذف شوند
        const valid = new Set(res.fields.map((f) => f.key));
        // فیلدهای JOIN پیشوند‌دار (alias.field) همیشه معتبرند تا زمانی که JOIN باشد
        const activeAliases = new Set(this.joins().map((j) => j.as));
        this.selectedFields.update((arr) =>
          arr.filter((k) => valid.has(k) || (k.includes('.') && activeAliases.has(k.split('.')[0])))
        );
        this.groupBy.update((arr) =>
          arr.filter((k) => valid.has(k) || (k.includes('.') && activeAliases.has(k.split('.')[0])))
        );
        this.aggregations.update((arr) =>
          arr.filter((a) => valid.has(a.field) || (a.field.includes('.') && activeAliases.has(a.field.split('.')[0])))
        );
        this.pruneAggDependents();
        onLoaded?.(res);
      },
      error: (e) => {
        this._fieldsReq = null;
        this.fieldsLoading.set(false);
        this.error.set(this.msg(e));
      },
    });
  }

  /**
   * هرس وابسته‌های تجمیع: havingها و نمودار که alias/محورشان دیگر معتبر نیست.
   * بعد از هر تغییر aggregations/groupBy (از reports.ts) و بعد از loadFields صدا زده می‌شود.
   */
  pruneAggDependents(): void {
    const aliases = new Set(this.aggAliases());
    this.having.update((arr) => arr.filter((h) => aliases.has(h.alias)));
    const c = this.chart();
    if (c) {
      const xInvalid = !!c.x && !this.groupBy().includes(c.x);
      const yInvalid = !!c.y && !aliases.has(c.y);
      if (xInvalid || yInvalid) {
        this.chart.update((cur) => cur ? {
          ...cur,
          x: xInvalid ? '' : cur.x,
          y: yInvalid ? '' : cur.y,
        } : null);
      }
    }
  }

  buildSpec(forExport = false): ReportSpec | null {
    const entity = this.entityKey();
    if (!entity) return null;
    const spec: ReportSpec = { entity };
    if (this.warehouseId()) spec.warehouse_id = this.warehouseId();
    if (this.joins().length) spec.joins = this.joins();
    if (this.grouped()) {
      spec.group_by = this.groupBy();
      spec.aggregations = this.aggregations();
      if (this.having().length) spec.having = this.having();
      if (this.chart()) spec.chart = this.chart();
    } else {
      spec.fields = this.selectedFields();
    }
    const f = this.filters();
    if (f && f.children.length) spec.filters = f;
    if (this.sort().length) spec.sort = this.sort();
    if (!forExport) {
      spec.page = this.page();
      spec.page_size = this.pageSize();
    }
    return spec;
  }

  /**
   * اجرای گزارش — درخت فیلتر کامل از کامپوننت فیلتر پاس می‌شود.
   * refreshChart فقط در «اجرای جدید» (اجرای دستی/تغییر مرتب‌سازی) true است؛
   * ورق زدن صفحه‌ها نمودار را دست نمی‌زند (بدون کوئری مضاعف).
   */
  run(filters?: FilterGroup | null, refreshChart = false): void {
    if (filters !== undefined) this.filters.set(filters);
    const spec = this.buildSpec();
    if (!spec) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.run(spec).subscribe({
      next: (res) => {
        this.rows.set(res.rows);
        this.columns.set(res.columns);
        this.count.set(res.count);
        this.joinMode.set(res.join_mode ?? null);
        this.loading.set(false);
        this.hasRun.set(true);
        if (refreshChart) this.fetchChartRows();
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(this.msg(e));
      },
    });
  }

  /**
   * داده نمودار از کل نتیجه (صفحه ۱ با page_size=200 — سقف بک‌اند).
   * اگر همه نتایج در صفحه جاری باشند، بدون درخواست اضافه همان rows کپی می‌شود.
   */
  fetchChartRows(): void {
    if (!this.grouped() || !this.chart()) {
      this.chartRows.set([]);
      this.chartRowsLoading.set(false);
      return;
    }
    if (this.page() === 1 && this.count() <= this.rows().length) {
      this.chartRows.set(this.rows());
      this.chartRowsLoading.set(false);
      return;
    }
    const spec = this.buildSpec(true);
    if (!spec) return;
    spec.page = 1;
    spec.page_size = 50;
    this.chartRowsLoading.set(true);
    this.api.run(spec).subscribe({
      next: (res) => {
        this.chartRows.set(res.rows);
        this.chartRowsLoading.set(false);
      },
      error: () => {
        // نمودار حیاتی نیست — fallback به صفحه جاری جدول
        this.chartRows.set(this.rows());
        this.chartRowsLoading.set(false);
      },
    });
  }

  loadTemplates(): void {
    this.api.getTemplates().subscribe({
      next: (list) => this.templates.set(list),
      error: () => {}, // سایدبار قالب‌ها حیاتی نیست
    });
  }

  /** بارگذاری قالب ذخیره‌شده در سازنده */
  applyTemplate(t: ReportTemplate, onLoaded?: (res: EntityFieldsResponse) => void): void {
    this.activeTemplate.set(t);
    this.entityKey.set(t.entity);
    const wId = t.spec.warehouse_id !== undefined ? t.spec.warehouse_id : (t.warehouse ?? null);
    this.warehouseId.set(wId as number | null);
    this.joins.set(t.spec.joins ?? []);
    this.selectedFields.set(t.spec.fields ?? []);
    this.groupBy.set(t.spec.group_by ?? []);
    this.aggregations.set(t.spec.aggregations ?? []);
    this.having.set(t.spec.having ?? []);
    this.sort.set(t.spec.sort ?? []);
    this.filters.set(t.spec.filters ?? null);
    this.chart.set(t.spec.chart ?? null);
    this.page.set(1);
    this.rows.set([]);
    this.columns.set([]);
    this.count.set(0);
    this.chartRows.set([]);
    this.hasRun.set(false);
    this.error.set(null);
    this.loadFields(onLoaded);
  }

  /** تبدیل وضعیت سیگنال‌های فعلی استور به ساختار قابل ذخیره در URL و LocalStorage */
  serializeState(filterRoot?: FilterGroup | null, density?: 'compact' | 'standard'): ReportSavedState | null {
    const entity = this.entityKey();
    if (!entity) return null;
    const state: ReportSavedState = { entity };
    if (this.warehouseId() !== null) state.warehouse_id = this.warehouseId();
    if (this.selectedFields().length) state.fields = this.selectedFields();
    if (this.joins().length) state.joins = this.joins();
    if (this.groupBy().length) state.group_by = this.groupBy();
    if (this.aggregations().length) state.aggregations = this.aggregations();
    if (this.having().length) state.having = this.having();
    if (this.sort().length) state.sort = this.sort();
    if (this.chart()) state.chart = this.chart();
    if (this.page() > 1) state.page = this.page();
    if (this.pageSize() !== 50) state.pageSize = this.pageSize();
    if (density) state.density = density;

    const f = filterRoot !== undefined ? filterRoot : this.filters();
    if (f && f.children && f.children.length) state.filters = f;

    return state;
  }

  /** بازیابی وضعیت ذخیره‌شده از URL یا LocalStorage در استور */
  applySavedState(state: ReportSavedState, onLoaded?: (res: EntityFieldsResponse) => void): void {
    this.activeTemplate.set(null);
    this.entityKey.set(state.entity);
    this.warehouseId.set(state.warehouse_id ?? null);
    this.joins.set(state.joins ?? []);
    this.selectedFields.set(state.fields ?? []);
    this.groupBy.set(state.group_by ?? []);
    this.aggregations.set(state.aggregations ?? []);
    this.having.set(state.having ?? []);
    this.sort.set(state.sort ?? []);
    this.filters.set(state.filters ?? null);
    this.chart.set(state.chart ?? null);
    this.page.set(state.page ?? 1);
    this.pageSize.set(state.pageSize ?? 50);
    this.rows.set([]);
    this.columns.set([]);
    this.count.set(0);
    this.chartRows.set([]);
    this.hasRun.set(false);
    this.error.set(null);
    this.loadFields(onLoaded);
  }

  /** پیام خطای قابل نمایش — status 0 یعنی آفلاین/سرور در دسترس نیست */
  msg(e: unknown): string {
    if (e instanceof HttpErrorResponse) {
      if (isServerUnreachable(e.status)) {
        return 'گزارش‌گیری فقط در حالت آنلاین در دسترس است — اتصال به سرور برقرار نیست.';
      }
      if (e.error) {
        if (typeof e.error === 'string' && e.error.trim().length > 0 && e.error.length < 300) {
          return e.error;
        }
        if (typeof e.error === 'object') {
          const errObj = e.error as Record<string, unknown>;
          if (typeof errObj['error'] === 'string') return errObj['error'];
          if (typeof errObj['detail'] === 'string') return errObj['detail'];
          if (typeof errObj['message'] === 'string') return errObj['message'];
          
          // جمع‌آوری خطاهای فیلدها یا خطاهای عمومی
          const msgs: string[] = [];
          for (const key of Object.keys(errObj)) {
            const val = errObj[key];
            if (Array.isArray(val)) {
              msgs.push(`${key !== 'non_field_errors' && key !== 'detail' ? key + ': ' : ''}${val.join('، ')}`);
            } else if (typeof val === 'string') {
              msgs.push(`${key !== 'non_field_errors' && key !== 'detail' ? key + ': ' : ''}${val}`);
            }
          }
          if (msgs.length > 0) return msgs.join(' | ');
        }
      }
    } else if (e instanceof Error && e.message) {
      return e.message;
    }
    return 'خطای غیرمنتظره در اجرای گزارش.';
  }
}
