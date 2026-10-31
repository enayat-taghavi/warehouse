import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SKIP_OFFLINE } from '../../../core/interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';
import type { AccountingReportParams } from '../models/accounting-reports.model';
import { ApiService } from '../../../core/api/api.service';
import { OrgAssignmentFilters, OrgAssignmentTarget, OrgStructureApiService } from '../../../core/api/org-structure-api.service';
import {
  ImportResult,
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  AttendanceMatrixResponse,
  VehicleMatrixResponse,
  AttendanceSummaryRow,
  VehicleSummaryRow,
  MonthlyWorkPeriod,
  MonthlyGridResponse,
  VehicleMonthlyGridResponse,
  VehicleTripAuditLog,
  FinancialProject,
  ProjectSection,
  UserSectionAssignment,
  Counterparty,
  PartyBankAccount,
  ExpenseHead,
  ExpenseInvoice,
  InvoiceDuplicatesResponse,
  InvoicePaymentCreate,
  InvoicePaymentResult,
  InvoicePaymentsResponse,
  PagedResult,
  PettyCashAccount,
  PettyCashTransaction,
  PettyCashBalanceSummary,
  PettyCashStatement,
  PettyCashDebtSettlement,
  PettyCashDebtSettlementCreate,
  PettyCashReconciliation,
  PettyCashReconciliationCreate,
  PettyCashAccountCloseResult,
  PettyCashHandoverResult,
  WorkflowAuditLog,
  PersonnelBankAccount,
  PersonnelDocument,
  PersonnelCostEstimate,
  VehicleBankAccount,
  VehicleDocument
} from './personnel-api.models';

/** بدنهٔ multipart پرداخت: فیلدهای پرداخت + رسید اجباری (فیلد receipt)؛ مقدار خالی فرستاده نمی‌شود */
export function paymentFormData(fields: object, receipt: File): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') continue;
    form.append(key, String(value));
  }
  form.append('receipt', receipt, receipt.name);
  return form;
}

@Injectable({ providedIn: 'root' })
export class TreasuryOrgApiService {
  private readonly baseUrl = 'personnel';

  private readonly org: OrgStructureApiService;

  // ساخت دستی (بی DI در PersonnelApiService و آزمون‌ها): سرویس هسته از همان ApiService ساخته می‌شود
  constructor(private api: ApiService, org?: OrgStructureApiService) {
    this.org = org ?? new OrgStructureApiService(api);
  }

  getSupervisorCartable(): Observable<any> {
    return this.api.get<any>(`${this.baseUrl}/cartable/supervisor/`);
  }

  getAccountantCartable(): Observable<any> {
    return this.api.get<any>(`${this.baseUrl}/cartable/accountant/`);
  }

  /** گزارش‌های حسابداری (۴.۷): فقط آنلاین، بدون کش آفلاین و بدون توست سراسری خطا */
  getAccountingReport<T>(key: string, params?: AccountingReportParams): Observable<T> {
    const context = new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);
    return this.api.get<T>(`${this.baseUrl}/reports/${key}/`, params as Record<string, unknown>, { context });
  }

  exportAccountingReport(key: string, params?: AccountingReportParams): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/reports/${key}/export-excel/`, params as Record<string, unknown>);
  }

  getTreasuryCartable(): Observable<any> {
    return this.api.get<any>(`${this.baseUrl}/cartable/treasury/`);
  }

  postCartableAction(
    cartableType: 'supervisor' | 'accountant' | 'manager',
    data: {
      action: 'approve' | 'revision' | 'reject';
      model: string;
      id?: number;
      ids?: number[];
      reason?: string;
      year_month?: string;
      warehouse_id?: number | null;
      section_id?: number | null;
      project_id?: number | null;
    }
  ): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/cartable/${cartableType}/`, data);
  }

  disburseTreasury(data: {
    action: 'disburse_period' | 'disburse_single_payroll' | 'disburse_fleet' | 'disburse_invoice';
    tracking_code: string;
    period_id?: number;
    payroll_id?: number;
    trip_ids?: number[];
    invoice_id?: number;
    batch_id?: string;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/cartable/treasury/`, data);
  }

  getTreasuryDisketteDownloadUrl(periodId: number, type: 'paya' | 'satna' = 'paya'): string {
    return `/api/personnel/cartable/treasury/export-diskette/?period_id=${periodId}&type=${type}`;
  }

  // پروژه، بخش و انتساب کاربر به بخش در هسته‌اند (/api/org/)؛ این متدها فقط به سرویس هسته واگذار می‌شوند
  getFinancialProjects(params?: { is_active?: boolean; search?: string }): Observable<FinancialProject[]> {
    return this.org.getProjects(params);
  }

  createFinancialProject(data: Partial<FinancialProject>): Observable<FinancialProject> {
    return this.org.createProject(data);
  }

  updateFinancialProject(id: number, data: Partial<FinancialProject>): Observable<FinancialProject> {
    return this.org.updateProject(id, data);
  }

  deleteFinancialProject(id: number): Observable<void> {
    return this.org.deleteProject(id);
  }

  getProjectSections(params?: { project_id?: number; is_active?: boolean; search?: string }): Observable<ProjectSection[]> {
    return this.org.getSections(params);
  }

  createProjectSection(data: Partial<ProjectSection>): Observable<ProjectSection> {
    return this.org.createSection(data);
  }

  updateProjectSection(id: number, data: Partial<ProjectSection>): Observable<ProjectSection> {
    return this.org.updateSection(id, data);
  }

  deleteProjectSection(id: number): Observable<void> {
    return this.org.deleteSection(id);
  }

  getUserSectionAssignments(
    params?: OrgAssignmentFilters,
    forceFresh: boolean = false
  ): Observable<UserSectionAssignment[]> {
    return this.org.getAssignments(params, forceFresh) as Observable<UserSectionAssignment[]>;
  }

  bulkAssignUsersToSection(data: OrgAssignmentTarget & { user_ids: number[]; role: string }): Observable<UserSectionAssignment[]> {
    return this.org.bulkAssign(data) as Observable<UserSectionAssignment[]>;
  }

  createUserSectionAssignment(data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> {
    return this.org.createAssignment(data) as Observable<UserSectionAssignment>;
  }

  updateUserSectionAssignment(id: number, data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> {
    return this.org.updateAssignment(id, data) as Observable<UserSectionAssignment>;
  }

  deleteUserSectionAssignment(id: number): Observable<void> {
    return this.org.deleteAssignment(id);
  }

  getMySections(): Observable<ProjectSection[]> {
    return this.org.getMySections();
  }

  getCounterparties(params?: { counterparty_type?: string; kind?: string; is_active?: boolean; search?: string }): Observable<Counterparty[]> {
    return this.api.get<Counterparty[]>(`${this.baseUrl}/counterparties`, params as Record<string, unknown>);
  }

  createCounterparty(data: Partial<Counterparty>): Observable<Counterparty> {
    return this.api.post<Counterparty>(`${this.baseUrl}/counterparties`, data);
  }

  updateCounterparty(id: number, data: Partial<Counterparty>): Observable<Counterparty> {
    return this.api.patch<Counterparty>(`${this.baseUrl}/counterparties/${id}`, data);
  }

  deleteCounterparty(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/counterparties/${id}`);
  }

  /** حساب‌های بانکی یک طرف بیرونی؛ `partyId` همان `Counterparty.party` است. */
  getPartyBankAccounts(partyId: number): Observable<PartyBankAccount[]> {
    return this.api.get<PartyBankAccount[]>(`${this.baseUrl}/party-bank-accounts`, { party: partyId });
  }

  createPartyBankAccount(data: Partial<PartyBankAccount>): Observable<PartyBankAccount> {
    return this.api.post<PartyBankAccount>(`${this.baseUrl}/party-bank-accounts`, data);
  }

  updatePartyBankAccount(id: number, data: Partial<PartyBankAccount>): Observable<PartyBankAccount> {
    return this.api.patch<PartyBankAccount>(`${this.baseUrl}/party-bank-accounts/${id}`, data);
  }

  deletePartyBankAccount(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/party-bank-accounts/${id}`);
  }

  /** سرفصل‌های هزینهٔ شرکت (۳.۴)؛ پاسخ تخت، درخت در فرانت ساخته می‌شود. آدرس با `warm-cache.ts` یکی بماند. */
  getExpenseHeads(companyId: number, activeOnly = false): Observable<ExpenseHead[]> {
    const params: Record<string, unknown> = { company_id: companyId };
    if (activeOnly) params['active'] = 1;
    return this.api.get<ExpenseHead[]>(`${this.baseUrl}/expense-heads`, params);
  }

  createExpenseHead(data: Partial<ExpenseHead>): Observable<ExpenseHead> {
    return this.api.post<ExpenseHead>(`${this.baseUrl}/expense-heads`, data);
  }

  updateExpenseHead(id: number, data: Partial<ExpenseHead>): Observable<ExpenseHead> {
    return this.api.patch<ExpenseHead>(`${this.baseUrl}/expense-heads/${id}`, data);
  }

  deleteExpenseHead(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/expense-heads/${id}`);
  }

  /** فهرست پیش‌فرض برای شرکتی که سرفصلی ندارد؛ برای فهرست پر بی‌اثر */
  seedDefaultExpenseHeads(companyId: number): Observable<{ created: number }> {
    return this.api.post<{ created: number }>(`${this.baseUrl}/expense-heads/seed-defaults`, {}, { params: { company_id: companyId } });
  }

  getExpenseInvoices(params?:{ section_id?: number; status?: string; search?: string }): Observable<ExpenseInvoice[]> {
    return this.api.get<ExpenseInvoice[]>(`${this.baseUrl}/expense-invoices`, params as Record<string, unknown>);
  }

  /** صفحه‌بندی فقط وقتی `page` فرستاده شود (۴.۱) */
  getExpenseInvoicesPage(params: { page: number; page_size?: number; section_id?: number; status?: string; search?: string }): Observable<PagedResult<ExpenseInvoice>> {
    return this.api.get<PagedResult<ExpenseInvoice>>(`${this.baseUrl}/expense-invoices`, params as Record<string, unknown>);
  }

  /** فاکتورهای هم‌شمارهٔ همین طرف حساب (هشدار تکراری) */
  getExpenseInvoiceDuplicates(params: { counterparty: number; invoice_number: string; exclude?: number }): Observable<InvoiceDuplicatesResponse> {
    return this.api.get<InvoiceDuplicatesResponse>(`${this.baseUrl}/expense-invoices/duplicates/`, params as Record<string, unknown>);
  }

  getInvoicePayments(id: number): Observable<InvoicePaymentsResponse> {
    return this.api.get<InvoicePaymentsResponse>(`${this.baseUrl}/expense-invoices/${id}/payments/`);
  }

  /** ثبت قسط با رسید اجباری (multipart؛ در حالت آفلاین صف نمی‌شود و فایل نزد کاربر می‌ماند) */
  addInvoicePayment(id: number, data: InvoicePaymentCreate, receipt: File): Observable<InvoicePaymentResult> {
    return this.api.upload<InvoicePaymentResult>(`${this.baseUrl}/expense-invoices/${id}/payments/`, paymentFormData(data, receipt));
  }

  voidInvoicePayment(id: number, paymentId: number, reason: string): Observable<InvoicePaymentResult> {
    return this.api.post<InvoicePaymentResult>(`${this.baseUrl}/expense-invoices/${id}/payments/${paymentId}/void/`, { reason });
  }

  /** نشانی چاپ PDF فاکتور (هستهٔ چاپ) */
  expenseInvoicePrintUrl(id: number, size?: 'A4' | 'A5'): string {
    return `/api/print/expense_invoice/${id}/pdf/${size ? `?size=${size}` : ''}`;
  }

  createExpenseInvoice(data: Partial<ExpenseInvoice> | FormData): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices`, data);
  }

  updateExpenseInvoice(id: number, data: Partial<ExpenseInvoice> | FormData): Observable<ExpenseInvoice> {
    return this.api.patch<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}`, data);
  }

  deleteExpenseInvoice(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/expense-invoices/${id}`);
  }

  getExpenseInvoice(id: number): Observable<ExpenseInvoice> {
    return this.api.get<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}`);
  }

  cancelExpenseInvoice(id: number, reason: string): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/cancel/`, { reason });
  }

  /** فاکتور تکراری: بی دلیل → ۴۰۰ `duplicate_reason_required` */
  submitExpenseInvoice(id: number, duplicateReason?: string): Observable<ExpenseInvoice> {
    const body = duplicateReason ? { duplicate_reason: duplicateReason } : {};
    // صفحه همهٔ خطاهای ارسال را خودش نشان می‌دهد (و ۴۰۰ تکراری فقط پنجرهٔ دلیل را باز می‌کند)؛ پیام قرمز عمومی نه
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/submit/`, body,
      { context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true) });
  }

  approveExpenseInvoice(id: number): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/approve/`, {});
  }

  rejectExpenseInvoice(id: number, reason: string): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/reject/`, { reason });
  }

  requestRevisionExpenseInvoice(id: number, reason: string): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/request-revision/`, { reason });
  }

  /** پرداخت قدیمی کل مانده؛ رسید پرداخت اجباری است (multipart) */
  payExpenseInvoice(id: number, data: { payment_ref: string; treasury_account_id?: number }, receipt: File): Observable<ExpenseInvoice> {
    return this.api.upload<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/pay/`, paymentFormData(data, receipt));
  }

  exportExpenseInvoicesExcel(params?: { section_id?: number; status?: string }): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/expense-invoices/export-excel/`, params as Record<string, unknown>);
  }

  getPettyCashAccounts(params?: { section_id?: number; custodian_id?: number }): Observable<PettyCashAccount[]> {
    return this.api.get<PettyCashAccount[]>(`${this.baseUrl}/petty-cash-accounts`, params as Record<string, unknown>);
  }

  getPettyCashTransactions(params?: {
    section_id?: number;
    custodian_id?: number;
    transaction_type?: string;
    status?: string;
    search?: string;
    statement_id?: number;
    line_status?: string;
  }): Observable<PettyCashTransaction[]> {
    return this.api.get<PettyCashTransaction[]>(`${this.baseUrl}/petty-cash-transactions`, params as Record<string, unknown>);
  }

  /** شرکت: company_id، وگرنه section_id (قدیمی)، وگرنه شرکت فعال سرور */
  getPettyCashBalance(sectionId?: number | null, custodianId?: number, companyId?: number | null): Observable<PettyCashBalanceSummary> {
    const params: Record<string, unknown> = {};
    if (companyId) params['company_id'] = companyId;
    if (sectionId) params['section_id'] = sectionId;
    if (custodianId) params['custodian_id'] = custodianId;
    return this.api.get<PettyCashBalanceSummary>(`${this.baseUrl}/petty-cash-transactions/my-balance`, params);
  }

  createPettyCashTransaction(data: Partial<PettyCashTransaction> | FormData): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions`, data);
  }

  updatePettyCashTransaction(id: number, data: Partial<PettyCashTransaction>): Observable<PettyCashTransaction> {
    return this.api.patch<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}`, data);
  }

  deletePettyCashTransaction(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/petty-cash-transactions/${id}`);
  }

  approvePettyCashTransaction(id: number): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/approve/`, {});
  }

  rejectPettyCashTransaction(id: number, reason: string): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/reject/`, { reason });
  }

  /** درخواست شارژ سطح شرکت؛ فقط آنلاین (گردش کار petty_cash_charge) */
  requestPettyCashCharge(data: { amount: number; title?: string; description?: string }): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/request-charge/`, data);
  }

  sendPettyCashCharge(id: number): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/send-charge/`, {});
  }

  payPettyCashCharge(id: number, trackingCode: string, receipt: File): Observable<PettyCashTransaction> {
    return this.api.upload<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/pay-charge/`,
      paymentFormData({ tracking_code: trackingCode }, receipt));
  }

  updatePettyCashAccount(id: number, data: Partial<PettyCashAccount>): Observable<PettyCashAccount> {
    return this.api.patch<PettyCashAccount>(`${this.baseUrl}/petty-cash-accounts/${id}`, data);
  }

  /** ساخت حساب سطح شرکت (تنخواه‌گردان، سقف، موجودی اولیه، کارت و شبا) */
  createPettyCashAccount(data: Partial<PettyCashAccount>): Observable<PettyCashAccount> {
    return this.api.post<PettyCashAccount>(`${this.baseUrl}/petty-cash-accounts/`, data);
  }

  /** بستن حساب (د۶)؛ با مانده > ۰ شمارهٔ پیگیری عودت لازم است. فقط آنلاین */
  closePettyCashAccount(id: number, data: { reference?: string; note?: string }): Observable<PettyCashAccountCloseResult> {
    return this.api.post<PettyCashAccountCloseResult>(`${this.baseUrl}/petty-cash-accounts/${id}/close/`, data);
  }

  /** تحویل به تنخواه‌گردان تازه (د۷). فقط آنلاین */
  handoverPettyCashAccount(id: number, data: { new_custodian: number; reference?: string; note?: string }): Observable<PettyCashHandoverResult> {
    return this.api.post<PettyCashHandoverResult>(`${this.baseUrl}/petty-cash-accounts/${id}/handover/`, data);
  }

  /** صفحه‌بندی سرور (د۱۳)؛ بی `page` فهرست کامل برمی‌گردد */
  getPettyCashTransactionsPage(params: {
    page: number;
    page_size?: number;
    custodian_id?: number;
    transaction_type?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    statement_id?: number;
    line_status?: string;
  }): Observable<PagedResult<PettyCashTransaction>> {
    return this.api.get<PagedResult<PettyCashTransaction>>(`${this.baseUrl}/petty-cash-transactions`, params as Record<string, unknown>);
  }

  getPettyCashSettlements(params?: { account_id?: number; status?: string; method?: string; charge_id?: number }): Observable<PettyCashDebtSettlement[]> {
    return this.api.get<PettyCashDebtSettlement[]>(`${this.baseUrl}/petty-cash-settlements/`, params as Record<string, unknown>);
  }

  createPettyCashSettlement(data: PettyCashDebtSettlementCreate): Observable<PettyCashDebtSettlement> {
    return this.api.post<PettyCashDebtSettlement>(`${this.baseUrl}/petty-cash-settlements/`, data);
  }

  voidPettyCashSettlement(id: number, reason: string): Observable<PettyCashDebtSettlement> {
    return this.api.post<PettyCashDebtSettlement>(`${this.baseUrl}/petty-cash-settlements/${id}/void/`, { reason });
  }

  getPettyCashReconciliations(params?: { account_id?: number }): Observable<PettyCashReconciliation[]> {
    return this.api.get<PettyCashReconciliation[]>(`${this.baseUrl}/petty-cash-reconciliations/`, params as Record<string, unknown>);
  }

  createPettyCashReconciliation(data: PettyCashReconciliationCreate): Observable<PettyCashReconciliation> {
    return this.api.post<PettyCashReconciliation>(`${this.baseUrl}/petty-cash-reconciliations/`, data);
  }

  getPettyCashStatements(params?: { status?: string; custodian_id?: number }): Observable<PettyCashStatement[]> {
    return this.api.get<PettyCashStatement[]>(`${this.baseUrl}/petty-cash-statements`, params as Record<string, unknown>);
  }

  getPettyCashStatementsPage(params: {
    page: number;
    page_size?: number;
    status?: string;
    custodian_id?: number;
    account_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  }): Observable<PagedResult<PettyCashStatement>> {
    return this.api.get<PagedResult<PettyCashStatement>>(`${this.baseUrl}/petty-cash-statements`, params as Record<string, unknown>);
  }

  pettyCashStatementPrintUrl(id: number): string {
    return `/api/print/petty_cash_statement/${id}/pdf/`;
  }

  getPettyCashStatement(id: number): Observable<PettyCashStatement> {
    return this.api.get<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/${id}`);
  }

  createPettyCashStatement(data: { line_ids: number[]; statement_date_shamsi?: string }): Observable<PettyCashStatement> {
    return this.api.post<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/`, data);
  }

  sendPettyCashStatement(id: number): Observable<PettyCashStatement> {
    return this.api.post<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/${id}/send/`, {});
  }

  rejectPettyCashStatementLine(id: number, lineId: number, reason: string): Observable<PettyCashStatement> {
    return this.api.post<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/${id}/reject-line/`, { line_id: lineId, reason });
  }

  payPettyCashStatement(id: number, trackingCode: string, receipt: File): Observable<PettyCashStatement> {
    return this.api.upload<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/${id}/pay/`,
      paymentFormData({ tracking_code: trackingCode }, receipt));
  }

  exportPettyCashTransactionsExcel(params?: {
    section_id?: number;
    custodian_id?: number;
    transaction_type?: string;
    status?: string;
    search?: string;
  }): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/petty-cash-transactions/export-excel/`, params as Record<string, unknown>);
  }

  getWorkflowAuditLogs(params?: { content_type?: string; object_id?: number }): Observable<WorkflowAuditLog[]> {
    const query: Record<string, unknown> = {};
    if (params?.content_type) query['content_type'] = params.content_type;
    if (params?.object_id) query['object_id'] = params.object_id;
    return this.api.get<WorkflowAuditLog[]>(`${this.baseUrl}/workflow-audit-logs/`, query);
  }

  exportCounterpartiesExcel(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/counterparties/export-excel/`);
  }

  downloadCounterpartiesTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/counterparties/download-template/`);
  }

  importCounterpartiesExcel(file: File, dryRun: boolean = false): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.post<any>(`${this.baseUrl}/counterparties/import-excel/`, formData);
  }
}
