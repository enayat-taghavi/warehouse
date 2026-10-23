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
export class HrApiService {
  private readonly baseUrl = 'personnel';

  constructor(private api: ApiService) {}

  getPersonnelProfiles(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string; company_id?: number }): Observable<PersonnelProfile[]> {
    return this.api.get<PersonnelProfile[]>(`${this.baseUrl}/profiles`, params as Record<string, unknown>);
  }

  getPersonnelProfile(id: number): Observable<PersonnelProfile> {
    return this.api.get<PersonnelProfile>(`${this.baseUrl}/profiles/${id}`);
  }

  createPersonnelProfile(data: Partial<PersonnelProfile> | FormData): Observable<PersonnelProfile> {
    return this.api.post<PersonnelProfile>(`${this.baseUrl}/profiles`, data);
  }

  updatePersonnelProfile(id: number, data: Partial<PersonnelProfile> | FormData): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/profiles/${id}/`, data);
  }

  submitPersonnelProfile(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/submit/`, note ? { note } : {});
  }

  getPersonnelBankAccounts(id: number): Observable<PersonnelBankAccount[]> {
    return this.api.get<PersonnelBankAccount[]>(`${this.baseUrl}/profiles/${id}/bank-accounts/`);
  }

  addPersonnelBankAccount(id: number, data: Partial<PersonnelBankAccount>): Observable<PersonnelBankAccount> {
    return this.api.post<PersonnelBankAccount>(`${this.baseUrl}/profiles/${id}/bank-accounts/`, data);
  }

  updatePersonnelBankAccount(id: number, data: Partial<PersonnelBankAccount>): Observable<PersonnelBankAccount> {
    return this.api.put<PersonnelBankAccount>(`${this.baseUrl}/profiles/${id}/bank-accounts/`, data);
  }

  deletePersonnelBankAccount(id: number, accountId: number): Observable<any> {
    return this.api.delete<any>(`${this.baseUrl}/profiles/${id}/bank-accounts`, { params: { id: accountId } });
  }

  getPersonnelDocuments(id: number): Observable<PersonnelDocument[]> {
    return this.api.get<PersonnelDocument[]>(`${this.baseUrl}/profiles/${id}/documents/`);
  }

  uploadPersonnelDocument(id: number, file: File, docType: string = 'other'): Observable<PersonnelDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);
    return this.api.upload<PersonnelDocument>(`${this.baseUrl}/profiles/${id}/documents/`, formData);
  }

  deletePersonnelDocument(id: number, docId: number): Observable<any> {
    return this.api.delete<any>(`${this.baseUrl}/profiles/${id}/documents`, { params: { doc_id: docId } });
  }

  getJobTitles(params?: { search?: string; q?: string }): Observable<{ job_titles: string[]; items?: { title: string; job_codes: string[] }[] }> {
    return this.api.get<{ job_titles: string[]; items?: { title: string; job_codes: string[] }[] }>(`${this.baseUrl}/profiles/job-titles/`, params as Record<string, unknown>);
  }

  lookupPersonnelByNationalCode(nationalCode: string): Observable<{ found: boolean; personnel?: any }> {
    return this.api.get<{ found: boolean; personnel?: any }>(`${this.baseUrl}/profiles/lookup-by-national-code/`, { national_code: nationalCode });
  }

  assignPersonnelToSection(id: number, data: { section_id: number; project_id?: number; job_title?: string; daily_base_wage?: number; notes?: string }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/assign-section/`, data);
  }

  deletePersonnelProfile(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/profiles/${id}`, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  importPersonnelExcel(formData: FormData): Observable<any> {
    return this.api.upload<any>(`${this.baseUrl}/profiles/import-excel/`, formData);
  }

  downloadPersonnelTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/profiles/download-template/`);
  }

  importPersonnelExcelModal(file: File, sectionId?: number | null, updateExisting: boolean = true, dryRun: boolean = false): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (sectionId) formData.append('section_id', String(sectionId));
    formData.append('update_existing', updateExisting ? 'true' : 'false');
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.upload<ImportResult>(`${this.baseUrl}/profiles/import-excel/`, formData);
  }

  exportPersonnelExcel(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string }): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/profiles/export-excel`, params as Record<string, unknown>);
  }

  approvePersonnelSupervisor(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-supervisor/`, note ? { note } : {});
  }

  approvePersonnelManager(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-manager/`, note ? { note } : {});
  }

  approvePersonnelFinance(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/approve-finance/`, note ? { note } : {});
  }

  rejectPersonnel(id: number, reason: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/reject/`, { reason });
  }

  requestPersonnelRevision(id: number, reason: string, targetStatus?: 'revision_required' | 'pending_supervisor' | 'pending_accountant'): Observable<any> {
    const payload: any = { reason };
    if (targetStatus) payload.target_status = targetStatus;
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/request-revision/`, payload);
  }

  getPersonnelDeleteImpact(id: number): Observable<{
    impact: Array<{ model_name: string; count: number }>;
    total_affected: number;
    history: { has_history: boolean; can_delete: boolean; reasons: string[] };
    can_delete: boolean;
    has_history: boolean;
    reasons: string[];
  }> {
    return this.api.get<any>(`${this.baseUrl}/profiles/${id}/delete_impact/`, undefined, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  batchApprovePersonnel(ids: number[], stage: 'supervisor' | 'finance' | 'manager', note?: string): Observable<{
    results: Array<{ id: number; full_name?: string; success: boolean; error?: string }>;
  }> {
    return this.api.post<any>(`${this.baseUrl}/profiles/batch-approve/`, { ids, stage, note: note || '' }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  reopenPersonnelProfile(id: number, note?: string): Observable<{ message: string; data: PersonnelProfile }> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/reopen/`, note ? { note } : {}, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  endPersonnelCollaboration(id: number, endDate: string, reason: string): Observable<{ message: string; data: PersonnelProfile }> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/end-collaboration/`, { end_date: endDate, reason }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  getPersonnelCostEstimate(personnelId: number, overrides?: Record<string, unknown>, yearMonth?: string): Observable<PersonnelCostEstimate> {
    return this.api.post<PersonnelCostEstimate>(
      `${this.baseUrl}/profiles/cost-estimate/`,
      { personnel_id: personnelId, overrides: overrides || {}, ...(yearMonth ? { year_month: yearMonth } : {}) },
      { context: new HttpContext().set(SKIP_OFFLINE, true) }
    );
  }

  getCompanyPersonnelCostSummary(yearMonth?: string): Observable<{
    year_month: string;
    personnel_count: number;
    total_employer_monthly_cost: number;
    average_employer_monthly_cost: number;
    average_gross_salary: number;
  }> {
    return this.api.get<any>(`${this.baseUrl}/profiles/company-cost-summary/`, yearMonth ? { year_month: yearMonth } : undefined);
  }

  getPersonnelChangeRequests(params?: { status?: string; search?: string; company_id?: number }): Observable<PersonnelChangeRequest[]> {
    return this.api.get<PersonnelChangeRequest[]>(`${this.baseUrl}/personnel-change-requests`, params as Record<string, unknown>);
  }

  approvePersonnelChangeRequestSupervisor(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${id}/approve-supervisor/`, note ? { note } : {});
  }

  approvePersonnelChangeRequestFinance(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${id}/approve-finance/`, note ? { note } : {});
  }

  approvePersonnelChangeRequestManager(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${id}/approve-manager/`, note ? { note } : {});
  }

  rejectPersonnelChangeRequest(id: number, reason: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${id}/reject/`, { reason });
  }

  cancelPersonnelChangeRequest(changeRequestId: number, reason?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${changeRequestId}/cancel/`, { reason });
  }

  getDisketteExpiredPersonnel(periodId: number, projectId: number): Observable<{
    count: number;
    year_month: string;
    personnel: Array<{ personnel_id: number; full_name: string; national_code: string; valid_until_date: string | null }>;
  }> {
    return this.api.get<any>(`${this.baseUrl}/monthly-payroll/expired-personnel/`, { period_id: periodId, project_id: projectId });
  }

  downloadMissingPrimaryShebaReport(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/profiles/missing-primary-sheba-report/`);
  }
}
