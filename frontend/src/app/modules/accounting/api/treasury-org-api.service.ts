import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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
  PettyCashAccount,
  PettyCashTransaction,
  PettyCashBalanceSummary,
  PettyCashStatement,
  WorkflowAuditLog,
  PersonnelBankAccount,
  PersonnelDocument,
  PersonnelCostEstimate,
  VehicleBankAccount,
  VehicleDocument
} from './personnel-api.models';

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

  getManagerCartable(): Observable<any> {
    return this.api.get<any>(`${this.baseUrl}/cartable/manager/`);
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

  createExpenseInvoice(data: Partial<ExpenseInvoice> | FormData): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices`, data);
  }

  updateExpenseInvoice(id: number, data: Partial<ExpenseInvoice>): Observable<ExpenseInvoice> {
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

  submitExpenseInvoice(id: number): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/submit/`, {});
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

  payExpenseInvoice(id: number, data: { payment_ref: string; treasury_account_id?: number }): Observable<ExpenseInvoice> {
    return this.api.post<ExpenseInvoice>(`${this.baseUrl}/expense-invoices/${id}/pay/`, data);
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

  payPettyCashCharge(id: number, trackingCode: string): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/pay-charge/`, { tracking_code: trackingCode });
  }

  updatePettyCashAccount(id: number, data: Partial<PettyCashAccount>): Observable<PettyCashAccount> {
    return this.api.patch<PettyCashAccount>(`${this.baseUrl}/petty-cash-accounts/${id}`, data);
  }

  getPettyCashStatements(params?: { status?: string; custodian_id?: number }): Observable<PettyCashStatement[]> {
    return this.api.get<PettyCashStatement[]>(`${this.baseUrl}/petty-cash-statements`, params as Record<string, unknown>);
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

  payPettyCashStatement(id: number, trackingCode: string): Observable<PettyCashStatement> {
    return this.api.post<PettyCashStatement>(`${this.baseUrl}/petty-cash-statements/${id}/pay/`, { tracking_code: trackingCode });
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
