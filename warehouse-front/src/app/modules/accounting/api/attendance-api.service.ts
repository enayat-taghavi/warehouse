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
export class AttendanceApiService {
  private readonly baseUrl = 'personnel';

  constructor(private api: ApiService) {}

  getDailyAttendance(params?: {
    warehouse_id?: number;
    section_id?: number;
    project_id?: number;
    date_shamsi?: string;
    personnel_id?: number;
  }): Observable<any[]> {
    return this.api.get<any[]>(`${this.baseUrl}/attendance`, params as Record<string, unknown>);
  }

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

  periodWorkflowAction(payload: {
    warehouse_id?: number | null;
    year_month: string;
    action: 'submit' | 'approve' | 'reject' | 'unlock';
    notes?: string;
  }): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/periods/workflow-action/`, payload);
  }

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

  patchDailyAttendance(id: number, data: any): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/attendance/${id}/`, data);
  }

  patchVehicleTrip(id: number, data: any): Observable<any> {
    return this.api.patch<any>(`${this.baseUrl}/trips/${id}/`, data);
  }
}
