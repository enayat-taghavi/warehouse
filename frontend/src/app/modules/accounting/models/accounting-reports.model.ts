/** پاسخ‌های گزارش‌های حسابداری (طرح ۴.۷)؛ GET /api/personnel/reports/<key>/ */

export type AccountingReportKey =
  | 'expense'
  | 'unpaid-invoices'
  | 'petty-cash'
  | 'bank-payments'
  | 'labor-cost'
  | 'fleet-cost';

export type ExpenseGroupBy = 'head' | 'section' | 'project' | 'counterparty' | 'month';

export interface AccountingReportParams {
  company_id?: number | null;
  section_id?: number | null;
  project_id?: number | null;
  date_from?: string;
  date_to?: string;
  group_by?: ExpenseGroupBy;
  page?: number;
  page_size?: number;
}

export interface ReportDateRange {
  date_from: string;
  date_to: string;
}

export interface ReportPage<T> {
  page: number;
  page_size: number;
  count: number;
  results: T[];
}

export interface ReportFilters {
  company_id: number | null;
  section_id: number | null;
  project_id: number | null;
}

export interface ExpenseReportRow {
  key: number | string | null;
  label: string | null;
  group_key: number | null;
  group_label: string | null;
  group_code?: string;
  code?: string;
  invoice_amount: number;
  petty_amount: number;
  total: number;
  vat_amount: number | null;
  invoice_count: number;
}

export interface ExpenseReport extends ReportDateRange {
  report: 'expense';
  filters: ReportFilters;
  group_by: ExpenseGroupBy;
  rows: ExpenseReportRow[];
  totals: { invoice_amount: number; petty_amount: number; total: number; vat_amount: number; invoice_count: number };
}

export interface UnpaidSummaryRow {
  counterparty_id: number | null;
  counterparty_name: string;
  count: number;
  remaining: number;
  age_0_30: number;
  age_31_60: number;
  age_61_90: number;
  age_over_90: number;
}

export interface UnpaidDetailRow {
  invoice_id: number;
  number: string;
  invoice_number: string;
  invoice_date: string;
  approved_date: string;
  age_days: number;
  amount: number;
  paid_amount: number;
  remaining: number;
  section_name: string;
  counterparty_name: string;
}

export interface UnpaidInvoicesReport {
  report: 'unpaid-invoices';
  filters: ReportFilters;
  as_of: string;
  rows: UnpaidSummaryRow[];
  totals: { remaining: number; count: number; age_0_30: number; age_31_60: number; age_61_90: number; age_over_90: number };
  details: ReportPage<UnpaidDetailRow>;
}

export interface PettyCashRow {
  account_id: number;
  company_name: string;
  custodian_name: string;
  is_active: boolean;
  ceiling_amount: number;
  opening_balance: number;
  received_total: number;
  spent_total: number;
  rejected_total: number;
  refund_total: number;
  balance: number;
  debt: number;
  open_statements: number;
}

export interface PettyCashReport {
  report: 'petty-cash';
  filters: ReportFilters;
  rows: PettyCashRow[];
  totals: Record<string, number>;
}

export interface BankPaymentRow {
  bank_account_id: number | null;
  company_name: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  sheba_number: string;
  opening_balance: number | null;
  opening_balance_date: string | null;
  total: number;
  count: number;
}

export interface BankPaymentDetail {
  payment_id: number;
  payment_date: string;
  amount: number;
  tracking_code: string;
  method: string;
  invoice_number: string;
  counterparty_name: string;
  bank_name: string;
  sheba_number: string;
}

export interface BankPaymentsReport extends ReportDateRange {
  report: 'bank-payments';
  filters: ReportFilters;
  rows: BankPaymentRow[];
  totals: { total: number; count: number };
  details: ReportPage<BankPaymentDetail>;
}

export interface LaborCostRow {
  section_id: number | null;
  section_name: string;
  year_month: string;
  headcount: number;
  base_salary: number;
  overtime: number;
  allowances: number;
  employer_insurance: number;
  total_cost: number;
  average_cost: number;
}

export interface LaborCostReport extends ReportDateRange {
  report: 'labor-cost';
  filters: ReportFilters;
  rows: LaborCostRow[];
  totals: Record<string, number>;
}

export interface FleetCostRow {
  section_id: number | null;
  section_name: string;
  year_month: string;
  vehicles: number;
  services: number;
  rent: number;
  settlement: number;
}

export interface FleetCostReport extends ReportDateRange {
  report: 'fleet-cost';
  filters: ReportFilters;
  rows: FleetCostRow[];
  totals: Record<string, number>;
}

export type AccountingReportData =
  | ExpenseReport
  | UnpaidInvoicesReport
  | PettyCashReport
  | BankPaymentsReport
  | LaborCostReport
  | FleetCostReport;

export interface DashboardSummaryRow {
  section_id: number | null;
  section_name: string;
  month_expense: number;
  personnel_count: number;
  vehicle_count: number;
}

export interface DashboardSummary extends ReportDateRange {
  report: 'dashboard-summary';
  filters: ReportFilters;
  rows: DashboardSummaryRow[];
  totals: { month_expense: number; personnel_count: number; vehicle_count: number };
}
