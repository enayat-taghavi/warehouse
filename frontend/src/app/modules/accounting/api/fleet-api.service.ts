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
export class FleetApiService {
  private readonly baseUrl = 'personnel';

  constructor(private api: ApiService) {}

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

  requestVehicleRevision(id: number, reason: string, targetStage?: 'employee' | 'supervisor'): Observable<any> {
    const payload: any = { reason };
    if (targetStage) payload.target_stage = targetStage;
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/request-revision/`, payload);
  }

  getVehicleRateBenchmark(vehicleId: number): Observable<{
    vehicle_id: number;
    vehicle_type: string;
    vehicle_type_display?: string;
    project_name?: string;
    count: number;
    avg_rate: number;
    min_rate: number;
    max_rate: number;
    current_rate: number;
  }> {
    return this.api.get<any>(`${this.baseUrl}/vehicles/${vehicleId}/rate-benchmark/`);
  }

  getVehicleCostEstimate(vehicleId: number): Observable<{
    vehicle_id: number;
    plate_number: string;
    driver_name: string;
    vehicle_type: string;
    vehicle_type_display?: string;
    ownership_type: string;
    ownership_type_display?: string;
    is_payable: boolean;
    daily_rate: number;
    standard_days: number;
    full_month_days: number;
    monthly_cost_standard: number;
    monthly_cost_full: number;
    yearly_cost_standard: number;
    avg_daily_rate: number;
    avg_monthly_cost: number;
    deviation_percentage: number;
    benchmark_count: number;
  }> {
    return this.api.get<any>(`${this.baseUrl}/vehicles/${vehicleId}/cost-estimate/`);
  }

  submitVehicleProfile(id: number, note?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/submit/`, note ? { note } : {});
  }

  reopenVehicleProfile(id: number, note?: string): Observable<{ message: string; data: VehicleDriverProfile }> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/reopen/`, note ? { note } : {}, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  endVehicleCollaboration(id: number, endDate: string, reason: string): Observable<{ message: string; data: VehicleDriverProfile }> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/${id}/end-collaboration/`, { end_date: endDate, reason }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  getVehicleDeleteImpact(id: number): Observable<{
    impact: Array<{ model_name: string; count: number }>;
    total_affected: number;
    history: { has_history: boolean; can_delete: boolean; reasons: string[] };
    can_delete: boolean;
    has_history: boolean;
    reasons: string[];
  }> {
    return this.api.get<any>(`${this.baseUrl}/vehicles/${id}/delete_impact/`, undefined, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  batchApproveVehicles(ids: number[], stage: 'supervisor' | 'finance' | 'manager', note?: string): Observable<{
    results: Array<{ id: number; plate_number?: string; success: boolean; error?: string }>;
  }> {
    return this.api.post<any>(`${this.baseUrl}/vehicles/batch-approve/`, { ids, stage, note: note || '' }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

  getVehicleBankAccounts(vehicleId: number): Observable<VehicleBankAccount[]> {
    return this.api.get<VehicleBankAccount[]>(`${this.baseUrl}/vehicles/${vehicleId}/bank-accounts/`);
  }

  addVehicleBankAccount(vehicleId: number, data: Partial<VehicleBankAccount>): Observable<VehicleBankAccount> {
    return this.api.post<VehicleBankAccount>(`${this.baseUrl}/vehicles/${vehicleId}/bank-accounts/`, data);
  }

  updateVehicleBankAccount(vehicleId: number, data: Partial<VehicleBankAccount>): Observable<VehicleBankAccount> {
    return this.api.put<VehicleBankAccount>(`${this.baseUrl}/vehicles/${vehicleId}/bank-accounts/`, data);
  }

  deleteVehicleBankAccount(vehicleId: number, accountId: number): Observable<any> {
    return this.api.delete<any>(`${this.baseUrl}/vehicles/${vehicleId}/bank-accounts/`, { params: { account_id: accountId } });
  }

  getVehicleDocuments(vehicleId: number): Observable<VehicleDocument[]> {
    return this.api.get<VehicleDocument[]>(`${this.baseUrl}/vehicles/${vehicleId}/documents/`);
  }

  uploadVehicleDocument(vehicleId: number, file: File, docType: string = 'other', title?: string, expiryDate?: string): Observable<VehicleDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);
    if (title) formData.append('title', title);
    if (expiryDate) formData.append('expiry_date', expiryDate);
    return this.api.upload<VehicleDocument>(`${this.baseUrl}/vehicles/${vehicleId}/documents/`, formData);
  }

  deleteVehicleDocument(vehicleId: number, docId: number): Observable<any> {
    return this.api.delete<any>(`${this.baseUrl}/vehicles/${vehicleId}/documents/`, { params: { doc_id: docId } });
  }

  cancelVehicleChangeRequest(changeRequestId: number, reason?: string): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/vehicle-change-requests/${changeRequestId}/cancel/`, { reason }, { context: new HttpContext().set(SKIP_OFFLINE, true) });
  }

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
}
