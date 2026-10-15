import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import {
  SKIP_OFFLINE,
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

  constructor(private api: ApiService) {}

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

  getFinancialProjects(params?: { is_active?: boolean; search?: string }): Observable<FinancialProject[]> {
    return this.api.get<FinancialProject[]>(`${this.baseUrl}/financial-projects`, params as Record<string, unknown>);
  }

  createFinancialProject(data: Partial<FinancialProject>): Observable<FinancialProject> {
    return this.api.post<FinancialProject>(`${this.baseUrl}/financial-projects`, data);
  }

  updateFinancialProject(id: number, data: Partial<FinancialProject>): Observable<FinancialProject> {
    return this.api.patch<FinancialProject>(`${this.baseUrl}/financial-projects/${id}`, data);
  }

  deleteFinancialProject(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/financial-projects/${id}`);
  }

  getProjectSections(params?: { project_id?: number; is_active?: boolean; search?: string }): Observable<ProjectSection[]> {
    return this.api.get<ProjectSection[]>(`${this.baseUrl}/project-sections`, params as Record<string, unknown>);
  }

  createProjectSection(data: Partial<ProjectSection>): Observable<ProjectSection> {
    return this.api.post<ProjectSection>(`${this.baseUrl}/project-sections`, data);
  }

  updateProjectSection(id: number, data: Partial<ProjectSection>): Observable<ProjectSection> {
    return this.api.patch<ProjectSection>(`${this.baseUrl}/project-sections/${id}`, data);
  }

  deleteProjectSection(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/project-sections/${id}`);
  }

  getUserSectionAssignments(
    params?: { section_id?: number; project_id?: number; user_id?: number; role?: string },
    forceFresh: boolean = false
  ): Observable<UserSectionAssignment[]> {
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    return this.api.get<UserSectionAssignment[]>(
      `${this.baseUrl}/user-section-assignments`,
      params as Record<string, unknown>,
      { context }
    );
  }

  bulkAssignUsersToSection(data: { section_id: number; user_ids: number[]; role: string }): Observable<UserSectionAssignment[]> {
    return this.api.post<UserSectionAssignment[]>(`${this.baseUrl}/user-section-assignments/bulk-assign/`, data);
  }

  createUserSectionAssignment(data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> {
    return this.api.post<UserSectionAssignment>(`${this.baseUrl}/user-section-assignments`, data);
  }

  updateUserSectionAssignment(id: number, data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> {
    return this.api.patch<UserSectionAssignment>(`${this.baseUrl}/user-section-assignments/${id}`, data);
  }

  deleteUserSectionAssignment(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/user-section-assignments/${id}`);
  }

  getMySections(): Observable<ProjectSection[]> {
    return this.api.get<ProjectSection[]>(`${this.baseUrl}/user-section-assignments/my-sections/`);
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

  exportFinancialProjectsExcel(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/financial-projects/export-excel/`);
  }

  downloadFinancialProjectsTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/financial-projects/download-template/`);
  }

  importFinancialProjectsExcel(file: File, dryRun: boolean = false): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.post<any>(`${this.baseUrl}/financial-projects/import-excel/`, formData);
  }

  exportProjectSectionsExcel(projectId?: number): Observable<Blob> {
    const params = projectId ? { project_id: projectId } : undefined;
    return this.api.download(`${this.baseUrl}/project-sections/export-excel/`, params);
  }

  downloadProjectSectionsTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/project-sections/download-template/`);
  }

  importProjectSectionsExcel(file: File, dryRun: boolean = false): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.post<any>(`${this.baseUrl}/project-sections/import-excel/`, formData);
  }

  cloneSectionAssignments(targetSectionId: number, sourceSectionId: number): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/project-sections/${targetSectionId}/clone-assignments/`, {
      source_section_id: sourceSectionId
    });
  }

  exportUserSectionAssignmentsExcel(projectId?: number, role?: string): Observable<Blob> {
    const params: Record<string, unknown> = {};
    if (projectId) params['project_id'] = projectId;
    if (role && role !== 'all') params['role'] = role;
    return this.api.download(`${this.baseUrl}/user-section-assignments/export-excel/`, Object.keys(params).length ? params : undefined);
  }

  downloadUserSectionAssignmentsTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/user-section-assignments/download-template/`);
  }

  importUserSectionAssignmentsExcel(file: File, dryRun: boolean = false): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.post<any>(`${this.baseUrl}/user-section-assignments/import-excel/`, formData);
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
