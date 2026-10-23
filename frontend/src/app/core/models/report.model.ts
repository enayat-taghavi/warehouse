/**
 * مدل‌های گزارش‌ساز پویا — قرارداد با /api/reports/
 */

export type ReportFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'choice';

export type ReportOperator =
  | 'eq' | 'icontains' | 'istartswith' | 'in' | 'isnull'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

export type AggFn = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface ReportEntity {
  key: string;
  label: string;
}

export interface ReportFieldMeta {
  key: string;
  label: string;
  type: ReportFieldType;
  operators: ReportOperator[];
  choices: string[] | null;
  groupable: boolean;
  aggregatable: boolean;
  dynamic: boolean;
}

export interface ReportJoinMeta {
  key: string;           // کلید JOIN در whitelist
  target: string;        // کلید موجودیت مقصد
  label: string;         // برچسب فارسی
  cardinality: 'many' | 'one';
  allowed_types: ('left' | 'inner')[];
  default_alias: string; // alias پیشنهادی (= key)
}

export interface EntityFieldsResponse {
  entity: string;
  label: string;
  warehouse_required_for_dynamic: boolean;
  fields: ReportFieldMeta[];
  joins: ReportJoinMeta[];
}

export interface ReportJoinSpec {
  to: string;            // کلید JOIN در whitelist
  type: 'left' | 'inner';
  as: string;            // alias — فیلدهای مقصد با alias.field آدرس‌دهی می‌شوند
}

/** برگ شرط فیلتر */
export interface FilterCondition {
  field: string;
  operator: ReportOperator;
  value: unknown;
  /** نقیض شرط (NOT) */
  not?: boolean;
}

/** گروه AND/OR بازگشتی */
export interface FilterGroup {
  op: 'AND' | 'OR';
  children: FilterNode[];
  /** نقیض کل گروه (NOT) */
  not?: boolean;
}

export type FilterNode = FilterGroup | FilterCondition;

export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return (node as FilterGroup).op !== undefined;
}

export interface ReportAggregation {
  field: string;
  fn: AggFn;
  alias?: string;
  label?: string;
}

export interface ReportSort {
  field: string;
  dir: 'asc' | 'desc';
}

export type HavingOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

/** شرط روی نتایج تجمیع (HAVING) — فقط با گروه‌بندی */
export interface ReportHaving {
  alias: string;
  operator: HavingOperator;
  value: unknown;
}

export type ChartType = 'bar' | 'pie' | 'line';

/** تنظیم نمودار — فقط سمت کلاینت؛ engine آن را نادیده می‌گیرد */
export interface ReportChart {
  type: ChartType;
  /** کلید یکی از فیلدهای group_by */
  x: string;
  /** alias یکی از تجمیع‌ها */
  y: string;
}

export interface ReportSpec {
  entity: string;
  warehouse_id?: number | null;
  joins?: ReportJoinSpec[];
  fields?: string[];
  filters?: FilterGroup | null;
  group_by?: string[];
  aggregations?: ReportAggregation[];
  having?: ReportHaving[];
  sort?: ReportSort[];
  chart?: ReportChart | null;
  page?: number;
  page_size?: number;
  report_name?: string;
  /** فقط برای export — پیش‌فرض بک‌اند xlsx است */
  format?: 'xlsx' | 'pdf';
}

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportFieldType;
}

export interface ReportResult {
  columns: ReportColumn[];
  count: number;
  page: number;
  page_size: number;
  rows: Record<string, unknown>[];
  /** حالت JOIN — فقط وقتی joins در spec بود برمی‌گردد */
  join_mode?: 'flat' | 'exists' | 'aggregated';
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string | null;
  entity: string;
  spec: ReportSpec;
  is_public: boolean;
  warehouse: number | null;
  owner: number;
  owner_username: string;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
}

export type ExportJobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ReportExportJob {
  id: number;
  report_name: string;
  status: ExportJobStatus;
  status_display: string;
  progress: number;
  total_rows: number;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

/** نتیجه export: یا فایل فوری یا job پس‌زمینه */
export type ExportOutcome =
  | { kind: 'file'; blob: Blob }
  | { kind: 'job'; jobId: number; totalRows: number };

/** وضعیت کامل ذخیره‌شده گزارش جهت همگام‌سازی با URL و LocalStorage */
export interface ReportSavedState {
  entity: string;
  warehouse_id?: number | null;
  joins?: ReportJoinSpec[];
  fields?: string[];
  filters?: FilterGroup | null;
  group_by?: string[];
  aggregations?: ReportAggregation[];
  having?: ReportHaving[];
  sort?: ReportSort[];
  chart?: ReportChart | null;
  page?: number;
  pageSize?: number;
  density?: 'compact' | 'standard';
}

/** تبدیل وضعیت گزارش به پارامترهای تمیز و استاندارد URL */
export function serializeReportToQueryParams(state: ReportSavedState): Record<string, string> {
  const params: Record<string, string> = {};
  if (state.entity) params['entity'] = state.entity;
  if (state.warehouse_id !== undefined && state.warehouse_id !== null) {
    params['warehouse_id'] = String(state.warehouse_id);
  }
  if (state.fields && state.fields.length) {
    params['fields'] = state.fields.join(',');
  }
  if (state.joins && state.joins.length) {
    params['joins'] = JSON.stringify(state.joins);
  }
  if (state.group_by && state.group_by.length) {
    params['group_by'] = state.group_by.join(',');
  }
  if (state.aggregations && state.aggregations.length) {
    params['aggregations'] = JSON.stringify(state.aggregations);
  }
  if (state.sort && state.sort.length) {
    params['sort'] = JSON.stringify(state.sort);
  }
  if (state.chart) {
    params['chart'] = JSON.stringify(state.chart);
  }
  if (state.page && state.page > 1) {
    params['page'] = String(state.page);
  }
  if (state.pageSize && state.pageSize !== 50) {
    params['pageSize'] = String(state.pageSize);
  }
  if (state.density && state.density !== 'standard') {
    params['density'] = state.density;
  }
  return params;
}

/** پارس امن پارامترهای URL یا شیء LocalStorage به وضعیت استاندارد گزارش‌ساز */
export function parseReportFromQueryParams(params: Record<string, any>): ReportSavedState | null {
  const entity = params['entity'];
  if (!entity || typeof entity !== 'string') return null;

  const state: ReportSavedState = { entity };

  if (params['warehouse_id'] !== undefined && params['warehouse_id'] !== null && params['warehouse_id'] !== '') {
    const w = Number(params['warehouse_id']);
    state.warehouse_id = isNaN(w) ? null : w;
  }

  if (params['fields']) {
    if (Array.isArray(params['fields'])) {
      state.fields = params['fields'];
    } else if (typeof params['fields'] === 'string') {
      state.fields = params['fields'].split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  if (params['group_by']) {
    if (Array.isArray(params['group_by'])) {
      state.group_by = params['group_by'];
    } else if (typeof params['group_by'] === 'string') {
      state.group_by = params['group_by'].split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  const safeJsonParse = <T>(val: unknown, fallback: T): T => {
    if (!val) return fallback;
    if (typeof val === 'object') return val as T;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  if (params['joins']) state.joins = safeJsonParse<ReportJoinSpec[]>(params['joins'], []);
  if (params['aggregations']) state.aggregations = safeJsonParse<ReportAggregation[]>(params['aggregations'], []);
  if (params['having']) state.having = safeJsonParse<ReportHaving[]>(params['having'], []);
  if (params['filters']) state.filters = safeJsonParse<FilterGroup | null>(params['filters'], null);
  if (params['sort']) state.sort = safeJsonParse<ReportSort[]>(params['sort'], []);
  if (params['chart']) state.chart = safeJsonParse<ReportChart | null>(params['chart'], null);

  if (params['page']) {
    const p = parseInt(params['page'], 10);
    if (!isNaN(p) && p > 0) state.page = p;
  }

  if (params['pageSize']) {
    const ps = parseInt(params['pageSize'], 10);
    if (!isNaN(ps) && ps > 0) state.pageSize = ps;
  }

  if (params['density'] === 'compact' || params['density'] === 'standard') {
    state.density = params['density'];
  }

  return state;
}

