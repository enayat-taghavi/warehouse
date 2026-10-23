import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { OrgStructureApiService } from '../../../core/api/org-structure-api.service';
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
  ExpenseInvoice,
  PettyCashAccount,
  PettyCashTransaction,
  PettyCashBalanceSummary,
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
    params?: { section_id?: number; project_id?: number; user_id?: number; role?: string },
    forceFresh: boolean = false
  ): Observable<UserSectionAssignment[]> {
    return this.org.getAssignments(params, forceFresh) as Observable<UserSectionAssignment[]>;
  }

  bulkAssignUsersToSection(data: { section_id: number; user_ids: number[]; role: string }): Observable<UserSectionAssignment[]> {
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

  getCounterparties(params?: { counterparty_type?: string; search?: string }): Observable<Counterparty[]> {
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

  getExpenseInvoices(params?: { section_id?: number; status?: string; search?: string }): Observable<ExpenseInvoice[]> {
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
  }): Observable<PettyCashTransaction[]> {
    return this.api.get<PettyCashTransaction[]>(`${this.baseUrl}/petty-cash-transactions`, params as Record<string, unknown>);
  }

  getPettyCashBalance(sectionId: number, custodianId?: number): Observable<PettyCashBalanceSummary> {
    const params: Record<string, unknown> = { section_id: sectionId };
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

  submitPettyCashTransaction(id: number): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/submit/`, {});
  }

  approvePettyCashTransaction(id: number): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/approve/`, {});
  }

  rejectPettyCashTransaction(id: number, reason: string): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/${id}/reject/`, { reason });
  }

  requestPettyCashReplenishment(data: {
    section_id: number;
    amount: number;
    title?: string;
    description?: string;
    receipt_number?: string;
  }): Observable<PettyCashTransaction> {
    return this.api.post<PettyCashTransaction>(`${this.baseUrl}/petty-cash-transactions/request-replenishment/`, data);
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
