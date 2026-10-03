import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ImportResult } from '../http/accounts-http.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import {
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
  PersonnelCostEstimate
} from '../models/personnel.model';

@Injectable({ providedIn: 'root' })
export class PersonnelApiService {
  private readonly baseUrl = 'personnel';

  constructor(private api: ApiService) {}

  // --- پرسنل و کارگزینی ---
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

  /** حذف، بازگشایی، قطع همکاری و تأیید گروهی در صف آفلاین نمی‌روند: پاسخ خوش‌بینانهٔ ۲۰۰ موفقیت کاذب نشان می‌داد */
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

  // --- گردش کار تایید پرسنل ---
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

  /** بازگشایی پروندهٔ ردشده به پیش‌نویس (DEF-15) */
  reopenPersonnelProfile(id: number, note?: string): Observable<{ message: string; data: PersonnelProfile }> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/reopen/`, note ? { note } : {}, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  /** قطع همکاری پرسنل دارای سابقه: تاریخ پایان شمسی و دلیل الزامی (DEF-18) */
  endPersonnelCollaboration(id: number, endDate: string, reason: string): Observable<{ message: string; data: PersonnelProfile }> {
    return this.api.post<any>(`${this.baseUrl}/profiles/${id}/end-collaboration/`, { end_date: endDate, reason }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  /** برآورد سروری هزینهٔ ماهانه با همان موتور حقوق؛ overrides مقادیر فرم ذخیره‌نشده است (DEF-05) */
  getPersonnelCostEstimate(personnelId: number, overrides?: Record<string, unknown>, yearMonth?: string): Observable<PersonnelCostEstimate> {
    return this.api.post<PersonnelCostEstimate>(
      `${this.baseUrl}/profiles/cost-estimate/`,
      { personnel_id: personnelId, overrides: overrides || {}, ...(yearMonth ? { year_month: yearMonth } : {}) },
      { context: new HttpContext().set(SKIP_OFFLINE, true) }
    );
  }

  /** میانگین هزینهٔ ماهانهٔ پرسنل مصوب و فعال شرکت فعال (DEF-04) */
  getCompanyPersonnelCostSummary(yearMonth?: string): Observable<{
    year_month: string;
    personnel_count: number;
    total_employer_monthly_cost: number;
    average_employer_monthly_cost: number;
    average_gross_salary: number;
  }> {
    return this.api.get<any>(`${this.baseUrl}/profiles/company-cost-summary/`, yearMonth ? { year_month: yearMonth } : undefined);
  }

  // --- ناوگان و رانندگان ---
  getVehicleProfiles(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string; company_id?: number }): Observable<VehicleDriverProfile[]> {
    return this.api.get<VehicleDriverProfile[]>(`${this.baseUrl}/vehicles`, params as Record<string, unknown>);
  }

  getVehicleProfile(id: number): Observable<VehicleDriverProfile> {
    return this.api.get<VehicleDriverProfile>(`${this.baseUrl}/vehicles/${id}`);
  }

  getVehicleDriverProfile(id: number): Observable<VehicleDriverProfile> {
    return this.getVehicleProfile(id);
  }

  createVehicleProfile(data: Partial<VehicleDriverProfile>): Observable<VehicleDriverProfile> {
    return this.api.post<VehicleDriverProfile>(`${this.baseUrl}/vehicles`, data);
  }

  createVehicleDriverProfile(data: Partial<VehicleDriverProfile>): Observable<VehicleDriverProfile> {
    return this.createVehicleProfile(data);
  }

  updateVehicleProfile(id: number, data: Partial<VehicleDriverProfile>): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/vehicles/${id}`, data);
  }

  updateVehicleDriverProfile(id: number, data: Partial<VehicleDriverProfile>): Observable<any> {
    return this.updateVehicleProfile(id, data);
  }

  deleteVehicleProfile(id: number): Observable<void> {
    return this.api.delete<void>(`${this.baseUrl}/vehicles/${id}`);
  }

  exportVehiclesExcel(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string }): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/vehicles/export-excel`, params as Record<string, unknown>);
  }

  importVehicleExcel(formData: FormData): Observable<any> {
    return this.api.upload<any>(`${this.baseUrl}/vehicles/import-excel/`, formData);
  }

  downloadVehicleTemplate(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/vehicles/download-template/`);
  }

  importVehicleExcelModal(file: File, sectionId?: number | null, updateExisting: boolean = true, dryRun: boolean = false): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (sectionId) formData.append('section_id', String(sectionId));
    formData.append('update_existing', updateExisting ? 'true' : 'false');
    if (dryRun) formData.append('dry_run', 'true');
    return this.api.upload<ImportResult>(`${this.baseUrl}/vehicles/import-excel/`, formData);
  }

  // --- گردش کار تایید ناوگان ---
  approveVehicleSupervisor(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/approve-supervisor/`, note ? { note } : {});
  }

  approveVehicleManager(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/approve-manager/`, note ? { note } : {});
  }

  approveVehicleFinance(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/approve-finance/`, note ? { note } : {});
  }

  rejectVehicle(id: number, reason: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/reject/`, { reason });
  }

  requestVehicleRevision(id: number, reason: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/request-revision/`, { reason });
  }

  // --- کارتابل تغییرات پرسنل (Personnel Change Requests) ---
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

  // --- کارتابل تغییرات ناوگان (Vehicle Change Requests) ---
  getVehicleChangeRequests(params?: { status?: string; search?: string; company_id?: number }): Observable<VehicleChangeRequest[]> {
    return this.api.get<VehicleChangeRequest[]>(`${this.baseUrl}/vehicle-change-requests`, params as Record<string, unknown>);
  }

  approveVehicleChangeRequestSupervisor(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicle-change-requests/${id}/approve-supervisor/`, note ? { note } : {});
  }

  approveVehicleChangeRequestFinance(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicle-change-requests/${id}/approve-finance/`, note ? { note } : {});
  }

  approveVehicleChangeRequestManager(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicle-change-requests/${id}/approve-manager/`, note ? { note } : {});
  }

  rejectVehicleChangeRequest(id: number, reason: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicle-change-requests/${id}/reject/`, { reason });
  }

  // --- حضور و غیاب و کارکرد روزانه ---
  getDailyAttendance(params?: {
    warehouse_id?: number;
    section_id?: number;
    project_id?: number;
    date_shamsi?: string;
    personnel_id?: number;
  }): Observable<any[]> {
    return this.api.get<any[]>(`${this.baseUrl}/attendance`, params as Record<string, unknown>);
  }

  // --- ماتریس ثبت کارکرد پرسنل ---
  getAttendanceMatrix(
    warehouseId: number | null | undefined,
    dateShamsi: string,
    options?: { context?: import('@angular/common/http').HttpContext; section_id?: number; project_id?: number }
  ): Observable<AttendanceMatrixResponse> {
    const params: any = { date_shamsi: dateShamsi };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (options?.section_id) {
      params.section_id = options.section_id;
    }
    if (options?.project_id) {
      params.project_id = options.project_id;
    }
    return this.api.get<AttendanceMatrixResponse>(`${this.baseUrl}/attendance/matrix`, params, options);
  }

  saveAttendanceBulk(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    date_shamsi: string;
    client_tab_id?: string;
    items: Array<{
      personnel_id: number;
      status: string;
      effective_hours: number;
      overtime_hours: number;
      is_friday_work: boolean;
      is_mission: boolean;
      advance_payment: number;
      notes?: string;
    }>;
  }): Observable<{ message: string; saved_count: number; updated_count: number }> {
    return this.api.post<{ message: string; saved_count: number; updated_count: number }>(
      `${this.baseUrl}/attendance/bulk-save`,
      payload
    );
  }

  clearAttendanceDay(payload: {
    warehouse_id?: number | null;
    date_shamsi: string;
    client_tab_id?: string;
    personnel_ids?: number[];
  }): Observable<{ message: string; cleared_count: number }> {
    return this.api.post<{ message: string; cleared_count: number }>(
      `${this.baseUrl}/attendance/clear-day`,
      payload
    );
  }

  getAttendanceMonthlySummary(
    warehouseId: number | null | undefined,
    yearMonth: string,
    options?: { section_id?: number; project_id?: number }
  ): Observable<{
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    year_month: string;
    period_id?: number | null;
    period_status: string;
    is_locked: boolean;
    pending_approvals_count?: number;
    summary: AttendanceSummaryRow[];
  }> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (options?.section_id) {
      params.section_id = options.section_id;
    }
    if (options?.project_id) {
      params.project_id = options.project_id;
    }
    return this.api.get<{
      warehouse_id?: number | null;
      section_id?: number | null;
      project_id?: number | null;
      year_month: string;
      period_id?: number | null;
      period_status: string;
      is_locked: boolean;
      pending_approvals_count?: number;
      summary: AttendanceSummaryRow[];
    }>(`${this.baseUrl}/attendance/monthly-summary`, params);
  }

  getMonthlyAttendanceGrid(
    warehouseId: number | null | undefined,
    yearMonth: string,
    options?: { context?: import('@angular/common/http').HttpContext; section_id?: number; project_id?: number }
  ): Observable<MonthlyGridResponse> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (options?.section_id) {
      params.section_id = options.section_id;
    }
    if (options?.project_id) {
      params.project_id = options.project_id;
    }
    return this.api.get<MonthlyGridResponse>(`${this.baseUrl}/attendance/monthly-grid`, params, options);
  }

  bulkSaveMonthlyGrid(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    year_month: string;
    client_tab_id?: string;
    items: Array<{
      personnel_id: number;
      day: number;
      status: string;
      effective_hours: number;
      overtime_hours: number;
      is_friday_work: boolean;
      is_mission: boolean;
      advance_payment: number;
      notes?: string;
    }>;
  }): Observable<{ message: string; saved_count: number; updated_count: number }> {
    return this.api.post<{ message: string; saved_count: number; updated_count: number }>(
      `${this.baseUrl}/attendance/bulk-save-monthly-grid/`,
      payload
    );
  }

  // --- گردش کار دو مرحله‌ای تایید کارکرد ---
  periodWorkflowAction(payload: {
    warehouse_id?: number | null;
    year_month: string;
    action: 'submit' | 'approve' | 'reject' | 'unlock';
    notes?: string;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/periods/workflow-action/`, payload);
  }

  // --- خروجی و بارگذاری دوطرفه اکسل شیت ماهانه ---
  exportMonthlyAttendanceExcel(warehouseId: number | null | undefined, yearMonth: string, sectionId?: number | null): Observable<Blob> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (sectionId) {
      params.section_id = sectionId;
    }
    return this.api.download(`${this.baseUrl}/attendance/export-monthly-excel/`, params);
  }

  importMonthlyAttendanceExcel(formData: FormData): Observable<any> {
    return this.api.upload<any>(`${this.baseUrl}/attendance/import-monthly-excel/`, formData);
  }

  // --- ماتریس ثبت سرویس‌های خودرو ---
  getVehicleMatrix(
    warehouseId: number | null | undefined,
    dateShamsi: string,
    options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number }
  ): Observable<VehicleMatrixResponse> {
    const params: any = { date_shamsi: dateShamsi };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (options?.status) {
      params.status = options.status;
    }
    if (options?.section_id) {
      params.section_id = options.section_id;
    }
    if (options?.project_id) {
      params.project_id = options.project_id;
    }
    return this.api.get<VehicleMatrixResponse>(`${this.baseUrl}/trips/matrix`, params, options);
  }

  getVehicleTripsMatrix(
    warehouseId: number | null | undefined,
    dateShamsi: string,
    options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number }
  ): Observable<VehicleMatrixResponse> {
    return this.getVehicleMatrix(warehouseId, dateShamsi, options);
  }

  saveVehicleTripsBulk(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    date_shamsi: string;
    client_tab_id?: string;
    items: Array<{
      vehicle_id: number;
      trip_count: number;
      unit_rate?: number;
      dispatch_reference?: string;
      origin_destination?: string;
      notes?: string;
    }>;
  }): Observable<{ message: string; saved_count: number }> {
    return this.api.post<{ message: string; saved_count: number }>(
      `${this.baseUrl}/trips/bulk-save`,
      payload
    );
  }

  getVehicleMonthlySummary(warehouseId: number | null | undefined, yearMonth: string): Observable<{
    warehouse_id: number;
    year_month: string;
    summary: VehicleSummaryRow[];
  }> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    return this.api.get<{
      warehouse_id: number;
      year_month: string;
      summary: VehicleSummaryRow[];
    }>(`${this.baseUrl}/trips/monthly-summary`, params);
  }

  getVehicleMonthlyGrid(
    warehouseId: number | null | undefined,
    yearMonth: string,
    options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number }
  ): Observable<VehicleMonthlyGridResponse> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    if (options?.status) {
      params.status = options.status;
    }
    if (options?.section_id) {
      params.section_id = options.section_id;
    }
    if (options?.project_id) {
      params.project_id = options.project_id;
    }
    return this.api.get<VehicleMonthlyGridResponse>(`${this.baseUrl}/trips/monthly-grid`, params, options);
  }

  updateVehicleDayTrip(payload: {
    vehicle_id: number;
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    date_shamsi: string;
    trip_count: number;
    unit_rate?: number;
    dispatch_reference?: string;
    origin_destination?: string;
    notes?: string;
    client_tab_id?: string;
  }): Observable<{ message: string; trip_id: number | null }> {
    return this.api.post<{ message: string; trip_id: number | null }>(
      `${this.baseUrl}/trips/update-day-trip/`,
      payload
    );
  }

  saveVehicleMonthlyGridBulk(payload: {
    warehouse_id?: number | null;
    section_id?: number | null;
    project_id?: number | null;
    year_month: string;
    client_tab_id?: string;
    items: Array<{
      vehicle_id: number;
      day: number;
      trip_count: number;
      unit_rate?: number;
      dispatch_reference?: string;
      origin_destination?: string;
      notes?: string;
    }>;
  }): Observable<{ message: string; saved_count: number }> {
    return this.api.post<{ message: string; saved_count: number }>(
      `${this.baseUrl}/trips/bulk-save-monthly-grid/`,
      payload
    );
  }

  // --- دوره‌های ماهانه و قفل ---
  getWorkPeriods(params: { year_month?: string; warehouse_id?: number | null }): Observable<any[]> {
    const query: Record<string, unknown> = {};
    if (params.year_month) query['year_month'] = params.year_month;
    if (params.warehouse_id) query['warehouse_id'] = params.warehouse_id;
    return this.api.get<any[]>(`${this.baseUrl}/periods/`, query);
  }

  lockPeriod(periodId: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`${this.baseUrl}/periods/${periodId}/lock/`, {});
  }

  unlockPeriod(periodId: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`${this.baseUrl}/periods/${periodId}/unlock/`, {});
  }

  // --- تنظیمات پایه سالانه و ۲۰ گروه شغلی ---
  getYearlySettings(year = '1405', projectId?: number | null, versionId?: number | null, effectiveFrom?: string | null): Observable<any> {
    const params: any = { year };
    if (projectId) {
      params.project_id = projectId;
    }
    if (versionId) {
      params.version_id = versionId;
    }
    if (effectiveFrom) {
      params.effective_from = effectiveFrom;
    }
    return this.api.get<any>(`${this.baseUrl}/settings/active-or-year/`, params);
  }

  getSettingsVersions(year = '1405', projectId?: number | null): Observable<any[]> {
    const params: any = { year };
    if (projectId) {
      params.project_id = projectId;
    }
    return this.api.get<any[]>(`${this.baseUrl}/settings/versions/`, params);
  }

  createSettingsVersion(payload: {
    year: string;
    effective_from: string;
    version_title?: string;
    project_id?: number | null;
    source_setting_id?: number | null;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/settings/create-version/`, payload);
  }

  cloneSettingsForProject(projectId: number, year = '1405'): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/settings/clone-for-project/`, { project_id: projectId, year });
  }

  getAvailableFiscalYears(): Observable<{ years: string[] }> {
    return this.api.get<{ years: string[] }>(`${this.baseUrl}/settings/available-years/`);
  }

  createFiscalYear(payload: {
    year: string;
    source_year?: string;
    project_id?: number | null;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/settings/create-year/`, payload);
  }

  getJobGradeRate(grade: string, year = '1405'): Observable<{
    grade_number: number;
    daily_base_wage: number;
    daily_seniority_bonus: number;
    hourly_rate: number;
  }> {
    return this.api.get<any>(`${this.baseUrl}/settings/job-grade-rate/`, { grade, year });
  }

  updateAllSettingsTabs(settingsId: number, payload: any): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/settings/${settingsId}/update-all/`, payload);
  }

  revertSettingsToGlobal(settingsId: number): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/settings/${settingsId}/revert-to-global/`, {});
  }

  updateYearlySettings(year: string, payload: any): Observable<any> {
    if (payload && payload.id) {
      return this.updateAllSettingsTabs(payload.id, payload);
    }
    return this.api.post<any>(`${this.baseUrl}/settings/active-or-year/`, { year, ...payload });
  }

  // --- محاسبه ماهانه ۵۸ ستون حقوق و دیسکت‌ها ---
  calculateMonthlyPayroll(warehouseId: number | null | undefined, yearMonth: string): Observable<{
    message: string;
    period_id: number;
    period_status: string;
    summary: {
      total_personnel: number;
      total_gross: number;
      total_payable: number;
      total_insurance: number;
      total_tax: number;
    };
    records: any[];
  }> {
    return this.api.post<any>(`${this.baseUrl}/monthly-payroll/calculate-period/`, {
      warehouse_id: warehouseId,
      year_month: yearMonth
    });
  }

  getMonthlyPayrollRecords(params: { period_id?: number | null; warehouse_id?: number | null; year_month?: string }): Observable<any[]> {
    return this.api.get<any[]>(`${this.baseUrl}/monthly-payroll/`, params as Record<string, unknown>);
  }

  importTaxExcel(payload: FormData | { items: any[]; period_id?: number | null; year_month?: string }): Observable<{
    message: string;
    matched_count: number;
    unmatched_count: number;
    unmatched_rows: any[];
    total_imported_tax: number;
    period_year_month: string;
  }> {
    if (payload instanceof FormData) {
      return this.api.upload<any>(`${this.baseUrl}/monthly-payroll/import-tax-excel/`, payload);
    }
    return this.api.post<any>(`${this.baseUrl}/monthly-payroll/import-tax-excel/`, payload);
  }

  // لینک‌های مستقیم دانلود فایل‌ها و دیسکت‌ها
  getDskZipDownloadUrl(periodId: number, projectId?: number): string {
    const projParam = projectId ? `&project_id=${projectId}` : '';
    return `/api/personnel/monthly-payroll/export-bimeh-diskettes/?period_id=${periodId}${projParam}`;
  }

  getBimehDiskettesDownloadUrl(periodId: number, projectId?: number): string {
    const projParam = projectId ? `&project_id=${projectId}` : '';
    return `/api/personnel/monthly-payroll/export-bimeh-diskettes/?period_id=${periodId}${projParam}`;
  }

  getTaxWhDownloadUrl(periodId: number, projectId?: number): string {
    const projParam = projectId ? `&project_id=${projectId}` : '';
    return `/api/personnel/monthly-payroll/export-tax-wh/?period_id=${periodId}${projParam}`;
  }

  getTaxWpDownloadUrl(periodId: number, projectId?: number): string {
    const projParam = projectId ? `&project_id=${projectId}` : '';
    return `/api/personnel/monthly-payroll/export-tax-wp/?period_id=${periodId}${projParam}`;
  }

  getBankExcelDownloadUrl(periodId: number, projectId?: number): string {
    const projParam = projectId ? `&project_id=${projectId}` : '';
    return `/api/personnel/monthly-payroll/export-bank-excel/?period_id=${periodId}${projParam}`;
  }

  getMonthlyExcelDownloadUrl(periodId: number): string {
    return `/api/personnel/monthly-payroll/export-monthly-excel/?period_id=${periodId}`;
  }

  getFleetMonthlyExcelDownloadUrl(warehouseId: number | null | undefined, yearMonth: string, sectionId?: number | null): string {
    const whParam = warehouseId ? `&warehouse_id=${warehouseId}` : '';
    const secParam = sectionId ? `&section_id=${sectionId}` : '';
    return `/api/personnel/trips/export-monthly-excel/?year_month=${yearMonth}${whParam}${secParam}`;
  }

  importFleetMonthlyExcel(formData: FormData): Observable<any> {
    return this.api.upload<any>(`${this.baseUrl}/trips/import-monthly-excel/`, formData);
  }

  getVehicleTripAuditLogs(params?: { vehicle_id?: number; year_month?: string; section_id?: number }): Observable<VehicleTripAuditLog[]> {
    return this.api.get<VehicleTripAuditLog[]>(`${this.baseUrl}/trips/audit-logs/`, params as Record<string, unknown>);
  }

  // --- محاسبات و تسویه مالی ناوگان ---
  calculateFleetSettlement(warehouseId: number | null | undefined, yearMonth: string): Observable<any> {
    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }
    return this.api.get<any>(`${this.baseUrl}/fleet-settlement/calculate/`, params);
  }

  getFleetBankExcelDownloadUrl(warehouseId: number | null | undefined, yearMonth: string): string {
    const whParam = warehouseId ? `&warehouse_id=${warehouseId}` : '';
    return `/api/personnel/fleet-settlement/export-bank-excel/?year_month=${yearMonth}${whParam}`;
  }

  exportFleetBankExcel(warehouseId: number | null | undefined, yearMonth: string): Observable<Blob> {
    const params: Record<string, unknown> = { year_month: yearMonth };
    if (warehouseId) params['warehouse_id'] = warehouseId;
    return this.api.download(`${this.baseUrl}/fleet-settlement/export-bank-excel/`, params);
  }

  // --- کارتابل‌های ۵ سطحی سازمانی و خزانه‌داری ---
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

  patchDailyAttendance(id: number, data: any): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/attendance/${id}/`, data);
  }

  patchVehicleTrip(id: number, data: any): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/trips/${id}/`, data);
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

  // --- ساختار سازمانی: پروژه‌های مالی و عملیاتی ---
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

  // --- ساختار سازمانی: بخش‌ها و دپارتمان‌های پروژه ---
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

  // --- ساختار سازمانی: انتساب کاربران به بخش‌ها ---
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

  // --- طرف‌حساب‌های مالی ---
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

  // --- فاکتورهای هزینه ---
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

  // --- مدیریت تنخواه‌گردان (Petty Cash Management) ---
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

  // --- تاریخچه و لاگ‌های گردش کار (Workflow Audit Logs) ---
  getWorkflowAuditLogs(params?: { content_type?: string; object_id?: number }): Observable<WorkflowAuditLog[]> {
    const query: Record<string, unknown> = {};
    if (params?.content_type) query['content_type'] = params.content_type;
    if (params?.object_id) query['object_id'] = params.object_id;
    return this.api.get<WorkflowAuditLog[]>(`${this.baseUrl}/workflow-audit-logs/`, query);
  }

  // --- ورودی و خروجی اکسل ساختار سازمانی و طرف‌های حساب ---
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

  calculatePeriodPayroll(payload: {
    warehouse_id?: number | null;
    company_id?: number | null;
    year_month: string;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/monthly-payroll/calculate-period/`, payload);
  }

  exportMonthlyPayrollExcel(periodId: number): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/monthly-payroll/export-monthly-excel/`, { period_id: periodId });
  }

  exportTreasuryDiskette(periodId: number, type: 'paya' | 'satna' = 'paya'): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/cartable/treasury/export-diskette/`, { period_id: periodId, type });
  }

  exportBimehDisketteZip(periodId: number, projectId: number): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/monthly-payroll/export-dsk-zip/`, { period_id: periodId, project_id: projectId });
  }

  exportTaxWh(periodId: number, projectId: number): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/monthly-payroll/export-tax-wh/`, { period_id: periodId, project_id: projectId });
  }

  exportTaxWp(periodId: number, projectId: number): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/monthly-payroll/export-tax-wp/`, { period_id: periodId, project_id: projectId });
  }

  exportBankPaymentExcel(periodId: number, projectId: number, onlyReleased: boolean = false): Observable<Blob> {
    const params: any = { period_id: periodId, project_id: projectId };
    if (onlyReleased) {
      params.only_released = 'true';
    }
    return this.api.download(`${this.baseUrl}/monthly-payroll/export-bank-excel/`, params);
  }

  /** آزادسازی پرداخت معلق فیش حقوقی پرسنل منقضی پس از تمدید اعتبار (DEF-20) */
  releasePayrollPaymentHold(recordId: number): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/monthly-payroll/${recordId}/release-payment-hold/`, {});
  }

  /** مسیر ثبت‌شدهٔ بک‌اند personnel-change-requests است (DEF-16) */
  cancelPersonnelChangeRequest(changeRequestId: number, reason?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/personnel-change-requests/${changeRequestId}/cancel/`, { reason });
  }

  /** فهرست پرسنل منقضی که از دیسکت این دوره و پروژه کنار گذاشته می‌شوند (DEF-20) */
  getDisketteExpiredPersonnel(periodId: number, projectId: number): Observable<{
    count: number;
    year_month: string;
    personnel: Array<{ personnel_id: number; full_name: string; national_code: string; valid_until_date: string | null }>;
  }> {
    return this.api.get<any>(`${this.baseUrl}/monthly-payroll/expired-personnel/`, { period_id: periodId, project_id: projectId });
  }

  /** گزارش اکسل حساب‌های اصلی فاقد شبای معتبر (DEF-23) */
  downloadMissingPrimaryShebaReport(): Observable<Blob> {
    return this.api.download(`${this.baseUrl}/profiles/missing-primary-sheba-report/`);
  }
}



