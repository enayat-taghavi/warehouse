import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HrApiService } from './hr-api.service';
import { FleetApiService, FleetSettlementScope } from './fleet-api.service';
import type { Paginated } from '../../../core/models/api-response.model';
import { AttendanceApiService } from './attendance-api.service';
import { PayrollApiService } from './payroll-api.service';
import { TreasuryOrgApiService } from './treasury-org-api.service';
import type { AccountingReportParams } from '../models/accounting-reports.model';
export * from './personnel-api.models';
import {
  PagedResult,
  PersonnelLookupResult,
  PersonnelBatchApproveRow,
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
  VehicleDocument,
  FleetPeriodStatus,
  ImportResult
} from './personnel-api.models';

@Injectable({ providedIn: 'root' })
export class PersonnelApiService {
  public readonly baseUrl = 'personnel';
  public readonly hr: HrApiService;
  public readonly fleet: FleetApiService;
  public readonly attendance: AttendanceApiService;
  public readonly payroll: PayrollApiService;
  public readonly treasuryOrg: TreasuryOrgApiService;

  constructor(
    hrOrApi: HrApiService,
    fleet?: FleetApiService,
    attendance?: AttendanceApiService,
    payroll?: PayrollApiService,
    treasuryOrg?: TreasuryOrgApiService
  ) {
    if (fleet && attendance && payroll && treasuryOrg) {
      this.hr = hrOrApi;
      this.fleet = fleet;
      this.attendance = attendance;
      this.payroll = payroll;
      this.treasuryOrg = treasuryOrg;
    } else {
      const api = hrOrApi as any;
      this.hr = new HrApiService(api);
      this.fleet = new FleetApiService(api);
      this.attendance = new AttendanceApiService(api);
      this.payroll = new PayrollApiService(api);
      this.treasuryOrg = new TreasuryOrgApiService(api);
    }
  }

  getPersonnelProfiles(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string; company_id?: number }): Observable<PersonnelProfile[]> { return this.hr.getPersonnelProfiles(params); }
  getPersonnelProfilesPage(params: { page: number; page_size?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string; company_id?: number }): Observable<PagedResult<PersonnelProfile>> { return this.hr.getPersonnelProfilesPage(params); }
  personnelProfilePrintUrl(id: number): string { return this.hr.personnelProfilePrintUrl(id); }
  getPersonnelProfile(id: number): Observable<PersonnelProfile> { return this.hr.getPersonnelProfile(id); }
  createPersonnelProfile(data: Partial<PersonnelProfile> | FormData): Observable<PersonnelProfile> { return this.hr.createPersonnelProfile(data); }
  updatePersonnelProfile(id: number, data: Partial<PersonnelProfile> | FormData): Observable<any> { return this.hr.updatePersonnelProfile(id, data); }
  submitPersonnelProfile(id: number, note?: string): Observable<any> { return this.hr.submitPersonnelProfile(id, note); }
  getPersonnelBankAccounts(id: number): Observable<PersonnelBankAccount[]> { return this.hr.getPersonnelBankAccounts(id); }
  addPersonnelBankAccount(id: number, data: Partial<PersonnelBankAccount>): Observable<PersonnelBankAccount> { return this.hr.addPersonnelBankAccount(id, data); }
  updatePersonnelBankAccount(id: number, data: Partial<PersonnelBankAccount>): Observable<PersonnelBankAccount> { return this.hr.updatePersonnelBankAccount(id, data); }
  deletePersonnelBankAccount(id: number, accountId: number): Observable<any> { return this.hr.deletePersonnelBankAccount(id, accountId); }
  getPersonnelDocuments(id: number): Observable<PersonnelDocument[]> { return this.hr.getPersonnelDocuments(id); }
  uploadPersonnelDocument(id: number, file: File, docType: string = 'other'): Observable<PersonnelDocument> { return this.hr.uploadPersonnelDocument(id, file, docType); }
  deletePersonnelDocument(id: number, docId: number): Observable<any> { return this.hr.deletePersonnelDocument(id, docId); }
  getJobTitles(params?: { search?: string; q?: string }): Observable<{ job_titles: string[]; items?: { title: string; job_codes: string[] }[] }> { return this.hr.getJobTitles(params); }
  lookupPersonnelByNationalCode(nationalCode: string): Observable<PersonnelLookupResult> { return this.hr.lookupPersonnelByNationalCode(nationalCode); }
  assignPersonnelToSection(id: number, data: { section_id: number; project_id?: number; job_title?: string; daily_base_wage?: number; notes?: string }): Observable<any> { return this.hr.assignPersonnelToSection(id, data); }
  deletePersonnelProfile(id: number): Observable<void> { return this.hr.deletePersonnelProfile(id); }
  importPersonnelExcel(formData: FormData): Observable<any> { return this.hr.importPersonnelExcel(formData); }
  downloadPersonnelTemplate(): Observable<Blob> { return this.hr.downloadPersonnelTemplate(); }
  importPersonnelExcelModal(file: File, sectionId?: number | null, updateExisting: boolean = true, dryRun: boolean = false): Observable<ImportResult> { return this.hr.importPersonnelExcelModal(file, sectionId, updateExisting, dryRun); }
  exportPersonnelExcel(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string }): Observable<Blob> { return this.hr.exportPersonnelExcel(params); }
  approvePersonnelSupervisor(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelSupervisor(id, note); }
  approvePersonnelManager(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelManager(id, note); }
  approvePersonnelFinance(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelFinance(id, note); }
  rejectPersonnel(id: number, reason: string): Observable<any> { return this.hr.rejectPersonnel(id, reason); }
  requestPersonnelRevision(id: number, reason: string, targetStatus?: 'revision_required' | 'pending_supervisor' | 'pending_accountant'): Observable<any> { return this.hr.requestPersonnelRevision(id, reason, targetStatus); }
  getPersonnelDeleteImpact(id: number): Observable<{ impact: Array<{ model_name: string; count: number }>; total_affected: number; history: { has_history: boolean; can_delete: boolean; reasons: string[] }; can_delete: boolean; has_history: boolean; reasons: string[]; }> { return this.hr.getPersonnelDeleteImpact(id); }
  batchApprovePersonnel(ids: number[], stage: 'supervisor' | 'finance' | 'manager', note?: string): Observable<{ results: PersonnelBatchApproveRow[]; }> { return this.hr.batchApprovePersonnel(ids, stage, note); }
  reopenPersonnelProfile(id: number, note?: string): Observable<{ message: string; data: PersonnelProfile }> { return this.hr.reopenPersonnelProfile(id, note); }
  endPersonnelCollaboration(id: number, endDate: string, reason: string): Observable<{ message: string; data: PersonnelProfile }> { return this.hr.endPersonnelCollaboration(id, endDate, reason); }
  getPersonnelCostEstimate(personnelId: number, overrides?: Record<string, unknown>, yearMonth?: string): Observable<PersonnelCostEstimate> { return this.hr.getPersonnelCostEstimate(personnelId, overrides, yearMonth); }
  getCompanyPersonnelCostSummary(yearMonth?: string): Observable<{ year_month: string; personnel_count: number; total_employer_monthly_cost: number; average_employer_monthly_cost: number; average_gross_salary: number; }> { return this.hr.getCompanyPersonnelCostSummary(yearMonth); }
  getVehicleProfiles(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string; company_id?: number }): Observable<VehicleDriverProfile[]> { return this.fleet.getVehicleProfiles(params); }
  getVehicleProfile(id: number): Observable<VehicleDriverProfile> { return this.fleet.getVehicleProfile(id); }
  getVehicleDriverProfile(id: number): Observable<VehicleDriverProfile> { return this.fleet.getVehicleDriverProfile(id); }
  createVehicleProfile(data: Partial<VehicleDriverProfile>): Observable<VehicleDriverProfile> { return this.fleet.createVehicleProfile(data); }
  createVehicleDriverProfile(data: Partial<VehicleDriverProfile>): Observable<VehicleDriverProfile> { return this.fleet.createVehicleDriverProfile(data); }
  updateVehicleProfile(id: number, data: Partial<VehicleDriverProfile>): Observable<any> { return this.fleet.updateVehicleProfile(id, data); }
  updateVehicleDriverProfile(id: number, data: Partial<VehicleDriverProfile>): Observable<any> { return this.fleet.updateVehicleDriverProfile(id, data); }
  deleteVehicleProfile(id: number): Observable<void> { return this.fleet.deleteVehicleProfile(id); }
  exportVehiclesExcel(params?: { warehouse_id?: number; section_id?: number; project_id?: number; is_active?: boolean; approval_status?: string; search?: string }): Observable<Blob> { return this.fleet.exportVehiclesExcel(params); }
  importVehicleExcel(formData: FormData): Observable<any> { return this.fleet.importVehicleExcel(formData); }
  downloadVehicleTemplate(): Observable<Blob> { return this.fleet.downloadVehicleTemplate(); }
  importVehicleExcelModal(file: File, sectionId?: number | null, updateExisting: boolean = true, dryRun: boolean = false): Observable<ImportResult> { return this.fleet.importVehicleExcelModal(file, sectionId, updateExisting, dryRun); }
  approveVehicleSupervisor(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleSupervisor(id, note); }
  approveVehicleManager(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleManager(id, note); }
  approveVehicleFinance(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleFinance(id, note); }
  rejectVehicle(id: number, reason: string): Observable<any> { return this.fleet.rejectVehicle(id, reason); }
  requestVehicleRevision(id: number, reason: string): Observable<any> { return this.fleet.requestVehicleRevision(id, reason); }
  getVehicleRateBenchmark(vehicleId: number): Observable<{ vehicle_id: number; vehicle_type: string; vehicle_type_display?: string; project_name?: string; count: number; avg_rate: number; min_rate: number; max_rate: number; current_rate: number; }> { return this.fleet.getVehicleRateBenchmark(vehicleId); }
  getVehicleCostEstimate(vehicleId: number): Observable<{ vehicle_id: number; plate_number: string; driver_name: string; vehicle_type: string; vehicle_type_display?: string; ownership_type: string; ownership_type_display?: string; is_payable: boolean; daily_rate: number; standard_days: number; full_month_days: number; monthly_cost_standard: number; monthly_cost_full: number; yearly_cost_standard: number; avg_daily_rate: number; avg_monthly_cost: number; deviation_percentage: number; benchmark_count: number; }> { return this.fleet.getVehicleCostEstimate(vehicleId); }
  submitVehicleProfile(id: number, note?: string): Observable<any> { return this.fleet.submitVehicleProfile(id, note); }
  reopenVehicleProfile(id: number, note?: string): Observable<{ message: string; data: VehicleDriverProfile }> { return this.fleet.reopenVehicleProfile(id, note); }
  endVehicleCollaboration(id: number, endDate: string, reason: string): Observable<{ message: string; data: VehicleDriverProfile }> { return this.fleet.endVehicleCollaboration(id, endDate, reason); }
  getVehicleDeleteImpact(id: number): Observable<{ impact: Array<{ model_name: string; count: number }>; total_affected: number; history: { has_history: boolean; can_delete: boolean; reasons: string[] }; can_delete: boolean; has_history: boolean; reasons: string[]; }> { return this.fleet.getVehicleDeleteImpact(id); }
  batchApproveVehicles(ids: number[], stage: 'supervisor' | 'finance' | 'manager', note?: string): Observable<{ results: Array<{ id: number; plate_number?: string; success: boolean; error?: string }>; }> { return this.fleet.batchApproveVehicles(ids, stage, note); }
  getVehicleBankAccounts(vehicleId: number): Observable<VehicleBankAccount[]> { return this.fleet.getVehicleBankAccounts(vehicleId); }
  addVehicleBankAccount(vehicleId: number, data: Partial<VehicleBankAccount>): Observable<VehicleBankAccount> { return this.fleet.addVehicleBankAccount(vehicleId, data); }
  updateVehicleBankAccount(vehicleId: number, data: Partial<VehicleBankAccount>): Observable<VehicleBankAccount> { return this.fleet.updateVehicleBankAccount(vehicleId, data); }
  deleteVehicleBankAccount(vehicleId: number, accountId: number): Observable<any> { return this.fleet.deleteVehicleBankAccount(vehicleId, accountId); }
  getVehicleDocuments(vehicleId: number): Observable<VehicleDocument[]> { return this.fleet.getVehicleDocuments(vehicleId); }
  uploadVehicleDocument(vehicleId: number, file: File, docType: string = 'other', title?: string, expiryDate?: string): Observable<VehicleDocument> { return this.fleet.uploadVehicleDocument(vehicleId, file, docType, title, expiryDate); }
  deleteVehicleDocument(vehicleId: number, docId: number): Observable<any> { return this.fleet.deleteVehicleDocument(vehicleId, docId); }
  cancelVehicleChangeRequest(changeRequestId: number, reason?: string): Observable<any> { return this.fleet.cancelVehicleChangeRequest(changeRequestId, reason); }
  getPersonnelChangeRequests(params?: { status?: string; search?: string; company_id?: number }): Observable<PersonnelChangeRequest[]> { return this.hr.getPersonnelChangeRequests(params); }
  approvePersonnelChangeRequestSupervisor(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelChangeRequestSupervisor(id, note); }
  approvePersonnelChangeRequestFinance(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelChangeRequestFinance(id, note); }
  approvePersonnelChangeRequestManager(id: number, note?: string): Observable<any> { return this.hr.approvePersonnelChangeRequestManager(id, note); }
  rejectPersonnelChangeRequest(id: number, reason: string): Observable<any> { return this.hr.rejectPersonnelChangeRequest(id, reason); }
  getPersonnelChangeRequestsPage(params: { page: number; page_size?: number; status?: string; search?: string; company_id?: number }): Observable<PagedResult<PersonnelChangeRequest>> { return this.hr.getPersonnelChangeRequestsPage(params); }
  requestPersonnelChangeRequestRevision(id: number, reason: string): Observable<any> { return this.hr.requestPersonnelChangeRequestRevision(id, reason); }
  getVehicleChangeRequests(params?: { status?: string; search?: string; company_id?: number }): Observable<VehicleChangeRequest[]> { return this.fleet.getVehicleChangeRequests(params); }
  approveVehicleChangeRequestSupervisor(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleChangeRequestSupervisor(id, note); }
  approveVehicleChangeRequestFinance(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleChangeRequestFinance(id, note); }
  approveVehicleChangeRequestManager(id: number, note?: string): Observable<any> { return this.fleet.approveVehicleChangeRequestManager(id, note); }
  rejectVehicleChangeRequest(id: number, reason: string): Observable<any> { return this.fleet.rejectVehicleChangeRequest(id, reason); }
  requestVehicleChangeRequestRevision(id: number, reason: string): Observable<any> { return this.fleet.requestVehicleChangeRequestRevision(id, reason); }
  getVehicleProfilesPage(params: { page: number; page_size?: number; section_id?: number; company_id?: number; approval_status?: string; search?: string; is_active?: boolean }): Observable<Paginated<VehicleDriverProfile>> { return this.fleet.getVehicleProfilesPage(params); }
  getVehicleChangeRequestsPage(params: { page: number; page_size?: number; status?: string; search?: string; company_id?: number; section_id?: number }): Observable<Paginated<VehicleChangeRequest>> { return this.fleet.getVehicleChangeRequestsPage(params); }
  submitFleetPeriod(data: { period_id: number } | { section_id: number; year_month: string }): Observable<any> { return this.fleet.submitFleetPeriod(data); }
  getFleetPeriodStatus(sectionId: number, yearMonth: string): Observable<FleetPeriodStatus> { return this.fleet.getFleetPeriodStatus(sectionId, yearMonth); }
  getDailyAttendance(params?: { warehouse_id?: number; section_id?: number; project_id?: number; date_shamsi?: string; personnel_id?: number; }): Observable<any[]> { return this.attendance.getDailyAttendance(params); }
  getAttendanceMatrix( warehouseId: number | null | undefined, dateShamsi: string, options?: { context?: import('@angular/common/http').HttpContext; section_id?: number; project_id?: number } ): Observable<AttendanceMatrixResponse> { return this.attendance.getAttendanceMatrix(warehouseId, dateShamsi, options); }
  saveAttendanceBulk(payload: { warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; date_shamsi: string; client_tab_id?: string; is_override?: boolean; override_reason?: string; items: Array<{ personnel_id: number; status: string; effective_hours: number; overtime_hours: number; is_friday_work: boolean; is_mission: boolean; advance_payment: number; notes?: string; }>; }): Observable<{ message: string; saved_count: number; updated_count: number }> { return this.attendance.saveAttendanceBulk(payload); }
  clearAttendanceDay(payload: { warehouse_id?: number | null; date_shamsi: string; client_tab_id?: string; personnel_ids?: number[]; }): Observable<{ message: string; cleared_count: number }> { return this.attendance.clearAttendanceDay(payload); }
  getAttendanceMonthlySummary( warehouseId: number | null | undefined, yearMonth: string, options?: { section_id?: number; project_id?: number } ): Observable<{ warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; year_month: string; period_id?: number | null; period_status: string; is_locked: boolean; pending_approvals_count?: number; summary: AttendanceSummaryRow[]; }> { return this.attendance.getAttendanceMonthlySummary(warehouseId, yearMonth, options); }
  getMonthlyAttendanceGrid( warehouseId: number | null | undefined, yearMonth: string, options?: { context?: import('@angular/common/http').HttpContext; section_id?: number; project_id?: number } ): Observable<MonthlyGridResponse> { return this.attendance.getMonthlyAttendanceGrid(warehouseId, yearMonth, options); }
  bulkSaveMonthlyGrid(payload: { warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; year_month: string; client_tab_id?: string; is_override?: boolean; override_reason?: string; items: Array<{ personnel_id: number; day: number; status: string; effective_hours: number; overtime_hours: number; is_friday_work: boolean; is_mission: boolean; advance_payment: number; notes?: string; }>; }): Observable<{ message: string; saved_count: number; updated_count: number }> { return this.attendance.bulkSaveMonthlyGrid(payload); }
  periodWorkflowAction(payload: { warehouse_id?: number | null; section_id?: number | null; year_month: string; action: 'submit' | 'approve' | 'reject' | 'return' | 'unlock'; notes?: string; }): Observable<any> { return this.attendance.periodWorkflowAction(payload); }
  getOrCreatePeriod(payload: { year_month: string; section_id?: number | null; warehouse_id?: number | null }): Observable<MonthlyWorkPeriod> { return this.attendance.getOrCreatePeriod(payload); }
  exportMonthlyAttendanceExcel(warehouseId: number | null | undefined, yearMonth: string, sectionId?: number | null): Observable<Blob> { return this.attendance.exportMonthlyAttendanceExcel(warehouseId, yearMonth, sectionId); }
  importMonthlyAttendanceExcel(formData: FormData): Observable<any> { return this.attendance.importMonthlyAttendanceExcel(formData); }
  getVehicleMatrix( warehouseId: number | null | undefined, dateShamsi: string, options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number } ): Observable<VehicleMatrixResponse> { return this.attendance.getVehicleMatrix(warehouseId, dateShamsi, options); }
  getVehicleTripsMatrix( warehouseId: number | null | undefined, dateShamsi: string, options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number } ): Observable<VehicleMatrixResponse> { return this.attendance.getVehicleTripsMatrix(warehouseId, dateShamsi, options); }
  saveVehicleTripsBulk(payload: { warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; date_shamsi: string; client_tab_id?: string; items: Array<{ vehicle_id: number; trip_count: number; unit_rate?: number; dispatch_reference?: string; origin_destination?: string; notes?: string; }>; }): Observable<{ message: string; saved_count: number }> { return this.attendance.saveVehicleTripsBulk(payload); }
  getVehicleMonthlySummary(warehouseId: number | null | undefined, yearMonth: string): Observable<{ warehouse_id: number; year_month: string; summary: VehicleSummaryRow[]; }> { return this.attendance.getVehicleMonthlySummary(warehouseId, yearMonth); }
  getVehicleMonthlyGrid( warehouseId: number | null | undefined, yearMonth: string, options?: { context?: import('@angular/common/http').HttpContext; status?: string; section_id?: number; project_id?: number } ): Observable<VehicleMonthlyGridResponse> { return this.attendance.getVehicleMonthlyGrid(warehouseId, yearMonth, options); }
  updateVehicleDayTrip(payload: { vehicle_id: number; warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; date_shamsi: string; trip_count: number; unit_rate?: number; dispatch_reference?: string; origin_destination?: string; notes?: string; client_tab_id?: string; }): Observable<{ message: string; trip_id: number | null }> { return this.attendance.updateVehicleDayTrip(payload); }
  saveVehicleMonthlyGridBulk(payload: { warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; year_month: string; client_tab_id?: string; items: Array<{ vehicle_id: number; day: number; trip_count: number; unit_rate?: number; dispatch_reference?: string; origin_destination?: string; notes?: string; }>; }): Observable<{ message: string; saved_count: number }> { return this.attendance.saveVehicleMonthlyGridBulk(payload); }
  getWorkPeriods(params: { year_month?: string; warehouse_id?: number | null; section_id?: number | null }): Observable<any[]> { return this.attendance.getWorkPeriods(params); }
  lockPeriod(periodId: number, notes?: string): Observable<{ message: string; status?: string; status_display?: string }> { return this.attendance.lockPeriod(periodId, notes); }
  unlockPeriod(periodId: number, reason: string): Observable<{ message: string; status?: string; status_display?: string }> { return this.attendance.unlockPeriod(periodId, reason); }
  getYearlySettings(year = '1405', projectId?: number | null, versionId?: number | null, effectiveFrom?: string | null): Observable<any> { return this.payroll.getYearlySettings(year, projectId, versionId, effectiveFrom); }
  getSettingsVersions(year = '1405', projectId?: number | null): Observable<any[]> { return this.payroll.getSettingsVersions(year, projectId); }
  createSettingsVersion(payload: { year: string; effective_from: string; version_title?: string; project_id?: number | null; source_setting_id?: number | null; }): Observable<any> { return this.payroll.createSettingsVersion(payload); }
  cloneSettingsForProject(projectId: number, year = '1405'): Observable<any> { return this.payroll.cloneSettingsForProject(projectId, year); }
  getAvailableFiscalYears(): Observable<{ years: string[] }> { return this.payroll.getAvailableFiscalYears(); }
  createFiscalYear(payload: { year: string; source_year?: string; project_id?: number | null; }): Observable<any> { return this.payroll.createFiscalYear(payload); }
  getJobGradeRate(grade: string, year = '1405'): Observable<{ grade_number: number; daily_base_wage: number; daily_seniority_bonus: number; hourly_rate: number; }> { return this.payroll.getJobGradeRate(grade, year); }
  updateAllSettingsTabs(settingsId: number, payload: any): Observable<any> { return this.payroll.updateAllSettingsTabs(settingsId, payload); }
  revertSettingsToGlobal(settingsId: number): Observable<any> { return this.payroll.revertSettingsToGlobal(settingsId); }
  updateYearlySettings(year: string, payload: any): Observable<any> { return this.payroll.updateYearlySettings(year, payload); }
  calculateMonthlyPayroll(warehouseId: number | null | undefined, yearMonth: string): Observable<{ message: string; period_id: number; period_status: string; summary: { total_personnel: number; total_gross: number; total_payable: number; total_insurance: number; total_tax: number; }; records: any[]; }> { return this.payroll.calculateMonthlyPayroll(warehouseId, yearMonth); }
  getMonthlyPayrollRecords(params: { period_id?: number | null; warehouse_id?: number | null; year_month?: string }): Observable<any[]> { return this.payroll.getMonthlyPayrollRecords(params); }
  importTaxExcel(payload: FormData | { items: any[]; period_id?: number | null; year_month?: string }): Observable<{ message: string; matched_count: number; unmatched_count: number; unmatched_rows: any[]; total_imported_tax: number; period_year_month: string; }> { return this.payroll.importTaxExcel(payload); }
  getDskZipDownloadUrl(periodId: number, projectId?: number): string { return this.payroll.getDskZipDownloadUrl(periodId, projectId); }
  getBimehDiskettesDownloadUrl(periodId: number, projectId?: number): string { return this.payroll.getBimehDiskettesDownloadUrl(periodId, projectId); }
  getTaxWhDownloadUrl(periodId: number, projectId?: number): string { return this.payroll.getTaxWhDownloadUrl(periodId, projectId); }
  getTaxWpDownloadUrl(periodId: number, projectId?: number): string { return this.payroll.getTaxWpDownloadUrl(periodId, projectId); }
  getBankExcelDownloadUrl(periodId: number, projectId?: number): string { return this.payroll.getBankExcelDownloadUrl(periodId, projectId); }
  getMonthlyExcelDownloadUrl(periodId: number): string { return this.payroll.getMonthlyExcelDownloadUrl(periodId); }
  getFleetMonthlyExcelDownloadUrl(warehouseId: number | null | undefined, yearMonth: string, sectionId?: number | null): string { return this.attendance.getFleetMonthlyExcelDownloadUrl(warehouseId, yearMonth, sectionId); }
  importFleetMonthlyExcel(formData: FormData): Observable<any> { return this.attendance.importFleetMonthlyExcel(formData); }
  getVehicleTripAuditLogs(params?: { vehicle_id?: number; year_month?: string; section_id?: number }): Observable<VehicleTripAuditLog[]> { return this.attendance.getVehicleTripAuditLogs(params); }
  calculateFleetSettlement(warehouseId: number | null | undefined, yearMonth: string, scope?: FleetSettlementScope): Observable<any> { return this.fleet.calculateFleetSettlement(warehouseId, yearMonth, scope); }
  getFleetBankExcelDownloadUrl(warehouseId: number | null | undefined, yearMonth: string, scope?: FleetSettlementScope): string { return this.fleet.getFleetBankExcelDownloadUrl(warehouseId, yearMonth, scope); }
  exportFleetBankExcel(warehouseId: number | null | undefined, yearMonth: string, scope?: FleetSettlementScope): Observable<Blob> { return this.fleet.exportFleetBankExcel(warehouseId, yearMonth, scope); }
  getSupervisorCartable(): Observable<any> { return this.treasuryOrg.getSupervisorCartable(); }
  getAccountantCartable(): Observable<any> { return this.treasuryOrg.getAccountantCartable(); }
  getAccountingReport<T>(key: string, params?: AccountingReportParams): Observable<T> { return this.treasuryOrg.getAccountingReport<T>(key, params); }
  exportAccountingReport(key: string, params?: AccountingReportParams): Observable<Blob> { return this.treasuryOrg.exportAccountingReport(key, params); }
  getTreasuryCartable(): Observable<any> { return this.treasuryOrg.getTreasuryCartable(); }
  postCartableAction( cartableType: 'supervisor' | 'accountant' | 'manager', data: { action: 'approve' | 'revision' | 'reject'; model: string; id?: number; ids?: number[]; reason?: string; year_month?: string; warehouse_id?: number | null; section_id?: number | null; project_id?: number | null; } ): Observable<any> { return this.treasuryOrg.postCartableAction(cartableType, data); }
  patchDailyAttendance(id: number, data: any): Observable<any> { return this.attendance.patchDailyAttendance(id, data); }
  patchVehicleTrip(id: number, data: any): Observable<any> { return this.attendance.patchVehicleTrip(id, data); }
  disburseTreasury(data: { action: 'disburse_period' | 'disburse_single_payroll' | 'disburse_fleet' | 'disburse_invoice'; tracking_code: string; period_id?: number; payroll_id?: number; trip_ids?: number[]; invoice_id?: number; batch_id?: string; }): Observable<any> { return this.treasuryOrg.disburseTreasury(data); }
  getTreasuryDisketteDownloadUrl(periodId: number, type: 'paya' | 'satna' = 'paya'): string { return this.treasuryOrg.getTreasuryDisketteDownloadUrl(periodId, type); }
  getFinancialProjects(params?: { is_active?: boolean; search?: string }): Observable<FinancialProject[]> { return this.treasuryOrg.getFinancialProjects(params); }
  createFinancialProject(data: Partial<FinancialProject>): Observable<FinancialProject> { return this.treasuryOrg.createFinancialProject(data); }
  updateFinancialProject(id: number, data: Partial<FinancialProject>): Observable<FinancialProject> { return this.treasuryOrg.updateFinancialProject(id, data); }
  deleteFinancialProject(id: number): Observable<void> { return this.treasuryOrg.deleteFinancialProject(id); }
  getProjectSections(params?: { project_id?: number; is_active?: boolean; search?: string }): Observable<ProjectSection[]> { return this.treasuryOrg.getProjectSections(params); }
  createProjectSection(data: Partial<ProjectSection>): Observable<ProjectSection> { return this.treasuryOrg.createProjectSection(data); }
  updateProjectSection(id: number, data: Partial<ProjectSection>): Observable<ProjectSection> { return this.treasuryOrg.updateProjectSection(id, data); }
  deleteProjectSection(id: number): Observable<void> { return this.treasuryOrg.deleteProjectSection(id); }
  getUserSectionAssignments( params?: { section_id?: number; project_id?: number; user_id?: number; role?: string }, forceFresh: boolean = false ): Observable<UserSectionAssignment[]> { return this.treasuryOrg.getUserSectionAssignments(params, forceFresh); }
  bulkAssignUsersToSection(data: { section_id: number; user_ids: number[]; role: string }): Observable<UserSectionAssignment[]> { return this.treasuryOrg.bulkAssignUsersToSection(data); }
  createUserSectionAssignment(data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> { return this.treasuryOrg.createUserSectionAssignment(data); }
  updateUserSectionAssignment(id: number, data: Partial<UserSectionAssignment>): Observable<UserSectionAssignment> { return this.treasuryOrg.updateUserSectionAssignment(id, data); }
  deleteUserSectionAssignment(id: number): Observable<void> { return this.treasuryOrg.deleteUserSectionAssignment(id); }
  getMySections(): Observable<ProjectSection[]> { return this.treasuryOrg.getMySections(); }
  getCounterparties(params?: { counterparty_type?: string; kind?: string; is_active?: boolean; search?: string }): Observable<Counterparty[]> { return this.treasuryOrg.getCounterparties(params); }
  createCounterparty(data: Partial<Counterparty>): Observable<Counterparty> { return this.treasuryOrg.createCounterparty(data); }
  updateCounterparty(id: number, data: Partial<Counterparty>): Observable<Counterparty> { return this.treasuryOrg.updateCounterparty(id, data); }
  deleteCounterparty(id: number): Observable<void> { return this.treasuryOrg.deleteCounterparty(id); }
  getPartyBankAccounts(partyId: number): Observable<PartyBankAccount[]> { return this.treasuryOrg.getPartyBankAccounts(partyId); }
  createPartyBankAccount(data: Partial<PartyBankAccount>): Observable<PartyBankAccount> { return this.treasuryOrg.createPartyBankAccount(data); }
  updatePartyBankAccount(id: number, data: Partial<PartyBankAccount>): Observable<PartyBankAccount> { return this.treasuryOrg.updatePartyBankAccount(id, data); }
  deletePartyBankAccount(id: number): Observable<void> { return this.treasuryOrg.deletePartyBankAccount(id); }
  getExpenseHeads(companyId: number, activeOnly = false): Observable<ExpenseHead[]> { return this.treasuryOrg.getExpenseHeads(companyId, activeOnly); }
  getExpenseInvoices(params?: { section_id?: number; status?: string; search?: string }): Observable<ExpenseInvoice[]> { return this.treasuryOrg.getExpenseInvoices(params); }
  createExpenseInvoice(data: Partial<ExpenseInvoice> | FormData): Observable<ExpenseInvoice> { return this.treasuryOrg.createExpenseInvoice(data); }
  updateExpenseInvoice(id: number, data: Partial<ExpenseInvoice>): Observable<ExpenseInvoice> { return this.treasuryOrg.updateExpenseInvoice(id, data); }
  deleteExpenseInvoice(id: number): Observable<void> { return this.treasuryOrg.deleteExpenseInvoice(id); }
  submitExpenseInvoice(id: number): Observable<ExpenseInvoice> { return this.treasuryOrg.submitExpenseInvoice(id); }
  approveExpenseInvoice(id: number): Observable<ExpenseInvoice> { return this.treasuryOrg.approveExpenseInvoice(id); }
  rejectExpenseInvoice(id: number, reason: string): Observable<ExpenseInvoice> { return this.treasuryOrg.rejectExpenseInvoice(id, reason); }
  requestRevisionExpenseInvoice(id: number, reason: string): Observable<ExpenseInvoice> { return this.treasuryOrg.requestRevisionExpenseInvoice(id, reason); }
  payExpenseInvoice(id: number, data: { payment_ref: string; treasury_account_id?: number }): Observable<ExpenseInvoice> { return this.treasuryOrg.payExpenseInvoice(id, data); }
  exportExpenseInvoicesExcel(params?: { section_id?: number; status?: string }): Observable<Blob> { return this.treasuryOrg.exportExpenseInvoicesExcel(params); }
  getPettyCashAccounts(params?: { section_id?: number; custodian_id?: number }): Observable<PettyCashAccount[]> { return this.treasuryOrg.getPettyCashAccounts(params); }
  getPettyCashTransactions(params?: { section_id?: number; custodian_id?: number; transaction_type?: string; status?: string; search?: string; statement_id?: number; line_status?: string; }): Observable<PettyCashTransaction[]> { return this.treasuryOrg.getPettyCashTransactions(params); }
  getPettyCashBalance(sectionId?: number | null, custodianId?: number, companyId?: number | null): Observable<PettyCashBalanceSummary> { return this.treasuryOrg.getPettyCashBalance(sectionId, custodianId, companyId); }
  createPettyCashTransaction(data: Partial<PettyCashTransaction> | FormData): Observable<PettyCashTransaction> { return this.treasuryOrg.createPettyCashTransaction(data); }
  updatePettyCashTransaction(id: number, data: Partial<PettyCashTransaction>): Observable<PettyCashTransaction> { return this.treasuryOrg.updatePettyCashTransaction(id, data); }
  deletePettyCashTransaction(id: number): Observable<void> { return this.treasuryOrg.deletePettyCashTransaction(id); }
  approvePettyCashTransaction(id: number): Observable<PettyCashTransaction> { return this.treasuryOrg.approvePettyCashTransaction(id); }
  rejectPettyCashTransaction(id: number, reason: string): Observable<PettyCashTransaction> { return this.treasuryOrg.rejectPettyCashTransaction(id, reason); }
  requestPettyCashCharge(data: { amount: number; title?: string; description?: string }): Observable<PettyCashTransaction> { return this.treasuryOrg.requestPettyCashCharge(data); }
  sendPettyCashCharge(id: number): Observable<PettyCashTransaction> { return this.treasuryOrg.sendPettyCashCharge(id); }
  payPettyCashCharge(id: number, trackingCode: string): Observable<PettyCashTransaction> { return this.treasuryOrg.payPettyCashCharge(id, trackingCode); }
  updatePettyCashAccount(id: number, data: Partial<PettyCashAccount>): Observable<PettyCashAccount> { return this.treasuryOrg.updatePettyCashAccount(id, data); }
  getPettyCashStatements(params?: { status?: string; custodian_id?: number }): Observable<PettyCashStatement[]> { return this.treasuryOrg.getPettyCashStatements(params); }
  getPettyCashStatement(id: number): Observable<PettyCashStatement> { return this.treasuryOrg.getPettyCashStatement(id); }
  createPettyCashStatement(data: { line_ids: number[]; statement_date_shamsi?: string }): Observable<PettyCashStatement> { return this.treasuryOrg.createPettyCashStatement(data); }
  sendPettyCashStatement(id: number): Observable<PettyCashStatement> { return this.treasuryOrg.sendPettyCashStatement(id); }
  rejectPettyCashStatementLine(id: number, lineId: number, reason: string): Observable<PettyCashStatement> { return this.treasuryOrg.rejectPettyCashStatementLine(id, lineId, reason); }
  payPettyCashStatement(id: number, trackingCode: string): Observable<PettyCashStatement> { return this.treasuryOrg.payPettyCashStatement(id, trackingCode); }
  exportPettyCashTransactionsExcel(params?: { section_id?: number; custodian_id?: number; transaction_type?: string; status?: string; search?: string; }): Observable<Blob> { return this.treasuryOrg.exportPettyCashTransactionsExcel(params); }
  getWorkflowAuditLogs(params?: { content_type?: string; object_id?: number }): Observable<WorkflowAuditLog[]> { return this.treasuryOrg.getWorkflowAuditLogs(params); }
  exportCounterpartiesExcel(): Observable<Blob> { return this.treasuryOrg.exportCounterpartiesExcel(); }
  downloadCounterpartiesTemplate(): Observable<Blob> { return this.treasuryOrg.downloadCounterpartiesTemplate(); }
  importCounterpartiesExcel(file: File, dryRun: boolean = false): Observable<any> { return this.treasuryOrg.importCounterpartiesExcel(file, dryRun); }
  calculatePeriodPayroll(payload: { warehouse_id?: number | null; company_id?: number | null; year_month?: string; section_id?: number | null; period_id?: number | null; }): Observable<any> { return this.payroll.calculatePeriodPayroll(payload); }
  submitPayrollWorkflow(periodId: number): Observable<{ message: string; period_id: number; workflow_step: string | null }> { return this.payroll.submitPayrollWorkflow(periodId); }
  exportMonthlyPayrollExcel(periodId: number): Observable<Blob> { return this.payroll.exportMonthlyPayrollExcel(periodId); }
  exportTreasuryDiskette(periodId: number, type: 'paya' | 'satna' = 'paya'): Observable<Blob> { return this.payroll.exportTreasuryDiskette(periodId, type); }
  exportBimehDisketteZip(periodId: number, projectId: number): Observable<Blob> { return this.payroll.exportBimehDisketteZip(periodId, projectId); }
  exportProjectMonth(kind: 'dsk-zip' | 'tax-wh' | 'tax-wp' | 'bank-excel', projectId: number, yearMonth: string, onlyReleased = false): Observable<{ blob: Blob; unapprovedPeriods: number; unapprovedSections: string[] }> { return this.payroll.exportProjectMonth(kind, projectId, yearMonth, onlyReleased); }
  exportTaxWh(periodId: number, projectId: number): Observable<Blob> { return this.payroll.exportTaxWh(periodId, projectId); }
  exportTaxWp(periodId: number, projectId: number): Observable<Blob> { return this.payroll.exportTaxWp(periodId, projectId); }
  exportBankPaymentExcel(periodId: number, projectId: number, onlyReleased: boolean = false): Observable<Blob> { return this.payroll.exportBankPaymentExcel(periodId, projectId, onlyReleased); }
  releasePayrollPaymentHold(recordId: number): Observable<any> { return this.payroll.releasePayrollPaymentHold(recordId); }
  cancelPersonnelChangeRequest(changeRequestId: number, reason?: string): Observable<any> { return this.hr.cancelPersonnelChangeRequest(changeRequestId, reason); }
  getDisketteExpiredPersonnel(periodId: number, projectId: number): Observable<{ count: number; year_month: string; personnel: Array<{ personnel_id: number; full_name: string; national_code: string; valid_until_date: string | null }>; }> { return this.hr.getDisketteExpiredPersonnel(periodId, projectId); }
  downloadMissingPrimaryShebaReport(): Observable<Blob> { return this.hr.downloadMissingPrimaryShebaReport(); }
}
