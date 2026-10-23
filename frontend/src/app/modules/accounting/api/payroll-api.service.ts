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
export class PayrollApiService {
  private readonly baseUrl = 'personnel';

  constructor(private api: ApiService) {}

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

  releasePayrollPaymentHold(recordId: number): Observable<any> {
    return this.api.post<any>(`${this.baseUrl}/monthly-payroll/${recordId}/release-payment-hold/`, {});
  }
}
