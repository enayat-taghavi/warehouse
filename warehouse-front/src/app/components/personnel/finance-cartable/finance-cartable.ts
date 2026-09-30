import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { StateService } from '../../../services/state.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../core/http/warehouse-http.service';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  MonthlyPayrollRecord,
  AttendanceSummaryRow,
  VehicleSummaryRow,
  FinancialProject
} from '../../../core/models/personnel.model';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-finance-cartable',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './finance-cartable.html',
  styleUrl: './finance-cartable.css'
})
export class FinanceCartable implements OnInit, OnDestroy {
  // 5 Top Tabs:
  activeTab: 'final_approvals' | 'payroll' | 'fleet_settlement' | 'legal_diskettes' | 'reports' = 'final_approvals';

  isLoading = false;

  // Filters & State
  selectedWarehouseId: number | null = null;
  warehouses: any[] = [];
  fiscalYear = '1405';
  selectedYearMonth = '1405/04';

  projects: FinancialProject[] = [];
  selectedProjectId: number | null = null;

  // Final Approvals Sub-Tab
  approvalSubTab: 'personnel' | 'fleet' | 'change_requests' = 'personnel';
  pendingPersonnelList: PersonnelProfile[] = [];
  pendingFleetList: VehicleDriverProfile[] = [];
  pendingPersonnelCR: PersonnelChangeRequest[] = [];
  pendingFleetCR: VehicleChangeRequest[] = [];

  // 58-Column Payroll Engine State
  payrollRecords: MonthlyPayrollRecord[] = [];
  filteredPayrollRecords: MonthlyPayrollRecord[] = [];
  isCalculatingPayroll = false;
  isPeriodLocked = false;
  currentPeriodId: number | null = null;
  payrollSearch = '';
  selectedStatusCategory = 'ALL';
  payrollSummary = {
    total_personnel: 0,
    total_gross: 0,
    total_payable: 0,
    total_insurance: 0,
    total_tax: 0,
  };

  // Payslip Modal State
  isPayslipModalOpen = false;
  selectedPayslipRecord: MonthlyPayrollRecord | null = null;

  // Fleet Settlement State
  fleetSettlementRecords: any[] = [];
  fleetSettlementSummary: any = null;
  isFleetSettlementLoading = false;

  // Reports State
  reportSubTab: 'personnel' | 'fleet' = 'personnel';
  personnelReports: AttendanceSummaryRow[] = [];
  fleetReports: VehicleSummaryRow[] = [];
  isReportLoading = false;

  // Tax Modal State
  isTaxModalOpen = false;
  taxModalMode: 'file' | 'paste' = 'file';
  selectedTaxFile: File | null = null;
  taxExcelText = '';
  taxParsedRows: Array<{
    national_code: string;
    tax_amount: number;
    full_name?: string;
    matched: boolean;
  }> = [];
  isImportingTax = false;
  taxImportResult: {
    message: string;
    matched_count: number;
    unmatched_count: number;
    unmatched_rows: any[];
    total_imported_tax: number;
    period_year_month: string;
  } | null = null;

  // Diff Modal State
  isDiffModalOpen = false;
  diffTargetType: 'personnel' | 'vehicle' = 'personnel';
  selectedDiffCR: any = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];

  // Reject Modal State
  isRejectModalOpen = false;
  rejectActionType: 'reject' | 'revision' = 'reject';
  rejectTargetType: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr' = 'personnel';
  rejectTargetId: number | null = null;
  rejectTargetName = '';
  rejectReasonText = '';

  // Approval Note Modal State
  isApprovalModalOpen = false;
  approvalTargetType: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr' = 'personnel';
  approvalTargetId: number | null = null;
  approvalTargetName = '';
  approvalNoteText = '';
  isApproving = false;

  private querySub!: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private api: PersonnelApiService,
    private whService: WarehouseHttpService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get canApprovePersonnelFinance(): boolean {
    const p = this.auth.userPermissions();
    return p.includes('perm_approve_personnel_finance') || p.includes('admin_all');
  }

  get canApproveFleetFinance(): boolean {
    const p = this.auth.userPermissions();
    return p.includes('perm_approve_fleet_finance') || p.includes('admin_all');
  }

  get pendingFinanceCount(): number {
    const p = this.pendingPersonnelList.length;
    const v = this.pendingFleetList.length;
    const crP = this.pendingPersonnelCR.length;
    const crV = this.pendingFleetCR.length;
    return p + v + crP + crV;
  }

  ngOnInit(): void {
    this.whService.getAll().subscribe({
      next: (data: any) => {
        this.warehouses = Array.isArray(data) ? data : [];
      },
      error: () => {}
    });

    this.api.getFinancialProjects().subscribe({
      next: (projs) => {
        this.projects = projs;
        if (this.projects.length > 0 && !this.selectedProjectId) {
          this.selectedProjectId = this.projects[0].id ?? null;
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    this.querySub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['final_approvals', 'payroll', 'fleet_settlement', 'legal_diskettes', 'reports'].includes(params['tab'])) {
        this.activeTab = params['tab'];
      }
      if (params['period']) {
        this.selectedYearMonth = params['period'];
        this.fiscalYear = params['period'].split('/')[0] || '1405';
      }
      if (params['wh']) {
        this.selectedWarehouseId = params['wh'] === 'ALL' ? null : Number(params['wh']);
      }
      if (params['status_cat']) {
        this.selectedStatusCategory = params['status_cat'];
      }
      if (params['sub_tab']) {
        this.approvalSubTab = params['sub_tab'];
      }
      this.refreshCurrentTabData();
    });
  }

  ngOnDestroy(): void {
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
  }

  setTab(tab: 'final_approvals' | 'payroll' | 'fleet_settlement' | 'legal_diskettes' | 'reports'): void {
    this.activeTab = tab;
    this.updateQueryParams();
  }

  setApprovalSubTab(subTab: 'personnel' | 'fleet' | 'change_requests'): void {
    this.approvalSubTab = subTab;
    this.updateQueryParams();
  }

  onFilterChange(): void {
    this.updateQueryParams();
  }

  private updateQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeTab,
        period: this.selectedYearMonth,
        wh: this.selectedWarehouseId !== null ? this.selectedWarehouseId : undefined,
        status_cat: this.selectedStatusCategory !== 'ALL' ? this.selectedStatusCategory : undefined,
        sub_tab: this.activeTab === 'final_approvals' ? this.approvalSubTab : undefined
      },
      queryParamsHandling: 'merge'
    });
  }

  refreshCurrentTabData(): void {
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    }, 600);
    if (this.activeTab === 'final_approvals') {
      this.loadFinalApprovalsData();
    } else if (this.activeTab === 'payroll') {
      this.loadMonthlyPayroll();
    } else if (this.activeTab === 'fleet_settlement') {
      this.loadFleetSettlement();
    } else if (this.activeTab === 'reports') {
      this.loadReports();
    }
  }

  // ─── 1. Final Approvals (Finance Stage) ────────────────────
  loadFinalApprovalsData(): void {
    this.api.getPersonnelProfiles({
      warehouse_id: this.selectedWarehouseId || undefined,
      approval_status: 'pending_accountant,supervisor_approved,manager_approved'
    }).subscribe({
      next: (res: any) => {
        this.pendingPersonnelList = Array.isArray(res) ? res : (res?.results || []);
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    this.api.getVehicleProfiles({
      warehouse_id: this.selectedWarehouseId || undefined,
      approval_status: 'pending_accountant,supervisor_approved,manager_approved'
    }).subscribe({
      next: (res: any) => {
        this.pendingFleetList = Array.isArray(res) ? res : (res?.results || []);
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    this.api.getPersonnelChangeRequests().subscribe({
      next: (res: any) => {
        const all = Array.isArray(res) ? res : (res?.results || []);
        this.pendingPersonnelCR = all.filter((cr: any) =>
          cr.status === 'pending_accountant' || cr.status === 'supervisor_approved' || cr.status === 'manager_approved' || cr.status === 'pending_finance'
        );
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    this.api.getVehicleChangeRequests().subscribe({
      next: (res: any) => {
        const all = Array.isArray(res) ? res : (res?.results || []);
        this.pendingFleetCR = all.filter((cr: any) =>
          cr.status === 'pending_accountant' || cr.status === 'supervisor_approved' || cr.status === 'manager_approved' || cr.status === 'pending_finance'
        );
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  openApprovalModal(id: number, name: string, type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr'): void {
    this.approvalTargetId = id;
    this.approvalTargetName = name;
    this.approvalTargetType = type;
    this.approvalNoteText = '';
    this.isApprovalModalOpen = true;
    this.cdr.detectChanges();
  }

  closeApprovalModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTargetId = null;
    this.approvalTargetName = '';
    this.approvalNoteText = '';
    this.cdr.detectChanges();
  }

  confirmApprovalWithNote(): void {
    if (!this.approvalTargetId) return;
    const id = this.approvalTargetId;
    const note = this.approvalNoteText.trim() || undefined;
    const type = this.approvalTargetType;
    this.isApproving = true;

    let req$: any;
    if (type === 'personnel') {
      req$ = note ? this.api.approvePersonnelFinance(id, note) : this.api.approvePersonnelFinance(id);
    } else if (type === 'vehicle') {
      req$ = note ? this.api.approveVehicleFinance(id, note) : this.api.approveVehicleFinance(id);
    } else if (type === 'personnel_cr') {
      req$ = note ? this.api.approvePersonnelChangeRequestFinance(id, note) : this.api.approvePersonnelChangeRequestFinance(id);
    } else if (type === 'vehicle_cr') {
      req$ = note ? this.api.approveVehicleChangeRequestFinance(id, note) : this.api.approveVehicleChangeRequestFinance(id);
    }

    if (req$) {
      req$.subscribe({
        next: (res: any) => {
          this.isApproving = false;
          this.toast.show('success', res.message || 'تایید مالی با موفقیت ثبت شد و پرونده به کارتابل مدیر ارسال گردید.');
          this.closeApprovalModal();
          this.isDiffModalOpen = false;
          this.loadFinalApprovalsData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.show('error', err?.error?.error || 'خطا در ثبت تایید مالی');
          this.cdr.detectChanges();
        }
      });
    }
  }

  approvePersonnelFinance(p: PersonnelProfile, note?: string): void {
    if (!p.id) return;
    const req$ = note ? this.api.approvePersonnelFinance(p.id, note) : this.api.approvePersonnelFinance(p.id);
    req$.subscribe({
      next: (res: any) => {
        this.toast.show('success', res.message || 'تایید مالی با موفقیت صادر و پرونده پرسنل جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.loadFinalApprovalsData();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در ثبت تایید مالی پرسنل');
      }
    });
  }

  approveVehicleFinance(v: VehicleDriverProfile, note?: string): void {
    if (!v.id) return;
    const req$ = note ? this.api.approveVehicleFinance(v.id, note) : this.api.approveVehicleFinance(v.id);
    req$.subscribe({
      next: (res: any) => {
        this.toast.show('success', res.message || 'تایید مالی با موفقیت صادر و پرونده ناوگان جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.loadFinalApprovalsData();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در ثبت تایید مالی ناوگان');
      }
    });
  }

  approveChangeRequestFinance(cr: any, type: 'personnel' | 'vehicle', note?: string): void {
    const req$ = type === 'personnel'
      ? (note ? this.api.approvePersonnelChangeRequestFinance(cr.id, note) : this.api.approvePersonnelChangeRequestFinance(cr.id))
      : (note ? this.api.approveVehicleChangeRequestFinance(cr.id, note) : this.api.approveVehicleChangeRequestFinance(cr.id));

    req$.subscribe({
      next: (res: any) => {
        this.toast.show('success', res.message || 'تایید مالی ثبت و درخواست تغییرات جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.isDiffModalOpen = false;
        this.loadFinalApprovalsData();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی تغییرات');
      }
    });
  }

  // ─── 2. 58-Column Payroll Engine ──────────────────────────
  loadMonthlyPayroll(): void {
    this.isCalculatingPayroll = true;
    this.api.getMonthlyPayrollRecords({
      year_month: this.selectedYearMonth,
      warehouse_id: this.selectedWarehouseId || undefined
    }).subscribe({
      next: (res: any) => {
        this.payrollRecords = Array.isArray(res) ? res : (res?.records || []);
        if (res?.summary) {
          this.payrollSummary = res.summary;
        }
        if (this.payrollRecords.length > 0) {
          this.currentPeriodId = this.payrollRecords[0]?.period || 1;
        }
        this.applyPayrollFilter();
        this.isCalculatingPayroll = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isCalculatingPayroll = false;
        this.cdr.detectChanges();
      }
    });
  }

  calculateMonthlyPayroll(): void {
    this.isCalculatingPayroll = true;
    this.api.calculateMonthlyPayroll(this.selectedWarehouseId || undefined, this.selectedYearMonth).subscribe({
      next: (res: any) => {
        this.payrollRecords = res.records || [];
        this.payrollSummary = res.summary || this.payrollSummary;
        this.isPeriodLocked = res.period_status === 'LOCKED';
        this.currentPeriodId = res.period_id || null;
        this.applyPayrollFilter();
        this.isCalculatingPayroll = false;
        this.toast.show('success', 'محاسبه ۵۸ ستون حقوق ماه با موفقیت انجام و ذخیره شد.');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isCalculatingPayroll = false;
        this.toast.show('error', err?.error?.error || 'خطا در محاسبه حقوق');
        this.cdr.detectChanges();
      }
    });
  }

  applyPayrollFilter(): void {
    let list = this.payrollRecords;
    if (this.selectedStatusCategory !== 'ALL') {
      list = list.filter(r => r.status_category === this.selectedStatusCategory);
    }
    if (this.payrollSearch.trim()) {
      const q = this.payrollSearch.trim().toLowerCase();
      list = list.filter(r =>
        (r.full_name && r.full_name.toLowerCase().includes(q)) ||
        (r.national_code && r.national_code.includes(q)) ||
        (r.job_grade && String(r.job_grade).includes(q))
      );
    }
    this.filteredPayrollRecords = list;
  }

  toggleLockPeriod(): void {
    if (!this.currentPeriodId) return;
    const req$ = this.isPeriodLocked
      ? this.api.unlockPeriod(this.currentPeriodId)
      : this.api.lockPeriod(this.currentPeriodId);

    req$.subscribe({
      next: (res: any) => {
        this.isPeriodLocked = !this.isPeriodLocked;
        this.toast.show('info', res.message || (this.isPeriodLocked ? 'دوره کارکرد قفل شد.' : 'دوره کارکرد بازگشایی شد.'));
      },
      error: () => {}
    });
  }

  // ─── 3. Fleet Settlement ──────────────────────────────────
  loadFleetSettlement(): void {
    this.isFleetSettlementLoading = true;
    this.api.calculateFleetSettlement(this.selectedWarehouseId || undefined, this.selectedYearMonth).subscribe({
      next: (res: any) => {
        this.fleetSettlementRecords = res.records || [];
        this.fleetSettlementSummary = res.summary || null;
        this.isFleetSettlementLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isFleetSettlementLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── 4. Reports ───────────────────────────────────────────
  loadReports(): void {
    this.isReportLoading = true;
    if (this.reportSubTab === 'personnel') {
      this.api.getAttendanceMonthlySummary(this.selectedWarehouseId || undefined, this.selectedYearMonth).subscribe({
        next: (res: any) => {
          this.personnelReports = res.summary || [];
          this.isReportLoading = false;
          this.cdr.detectChanges();
        },
        error: () => { this.isReportLoading = false; }
      });
    } else {
      this.api.getVehicleMonthlySummary(this.selectedWarehouseId || undefined, this.selectedYearMonth).subscribe({
        next: (res: any) => {
          this.fleetReports = res.summary || [];
          this.isReportLoading = false;
          this.cdr.detectChanges();
        },
        error: () => { this.isReportLoading = false; }
      });
    }
  }

  // ─── 5. File Downloads (Diskettes & Excel) ─────────────────
  downloadMonthlyExcel(): void {
    if (this.currentPeriodId) {
      window.open(this.api.getMonthlyExcelDownloadUrl(this.currentPeriodId), '_blank');
    }
  }

  downloadDskZip(): void {
    if (!this.selectedProjectId) {
      this.toast.show('warning', 'لطفاً ابتدا پروژه مورد نظر را انتخاب نمایید.');
      return;
    }
    if (this.currentPeriodId) {
      window.open(this.api.getBimehDiskettesDownloadUrl(this.currentPeriodId, this.selectedProjectId), '_blank');
    }
  }

  downloadTaxWh(): void {
    if (!this.selectedProjectId) {
      this.toast.show('warning', 'جهت صدور فایل متنی WH مالیات، انتخاب پروژه الزامی است.');
      return;
    }
    if (this.currentPeriodId) {
      window.open(this.api.getTaxWhDownloadUrl(this.currentPeriodId, this.selectedProjectId), '_blank');
    }
  }

  downloadTaxWp(): void {
    if (!this.selectedProjectId) {
      this.toast.show('warning', 'جهت صدور فایل متنی WP مالیات، انتخاب پروژه الزامی است.');
      return;
    }
    if (this.currentPeriodId) {
      window.open(this.api.getTaxWpDownloadUrl(this.currentPeriodId, this.selectedProjectId), '_blank');
    }
  }

  downloadBankExcel(): void {
    if (!this.selectedProjectId) {
      this.toast.show('warning', 'لطفاً ابتدا پروژه مورد نظر را انتخاب نمایید.');
      return;
    }
    if (this.currentPeriodId) {
      window.open(this.api.getBankExcelDownloadUrl(this.currentPeriodId, this.selectedProjectId), '_blank');
    }
  }

  downloadFleetBankExcel(): void {
    window.open(this.api.getFleetBankExcelDownloadUrl(this.selectedWarehouseId || undefined, this.selectedYearMonth), '_blank');
  }

  // ─── Diff & Reject Modals ─────────────────────────────────
  openDiffModal(cr: any, type: 'personnel' | 'vehicle'): void {
    this.diffTargetType = type;
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];

    const proposed = cr.proposed_changes || {};
    const previous = cr.previous_values || {};
    const payload = cr.changes_payload || {};
    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(previous), ...Object.keys(payload)]));

    const labels: { [k: string]: string } = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      daily_base_wage: 'مزد روزانه پایه',
      daily_seniority_bonus: 'پایه سنواتی روزانه',
      base_daily_rate: 'مزد مبنا روزانه',
      job_title: 'سمت شغلی',
      job_grade: 'گروه شغلی',
      sheba_number: 'شماره شبا',
      account_number: 'شماره حساب',
      bank_name: 'نام بانک',
      driver_name: 'نام راننده',
      plate_number: 'شماره پلاک',
      default_service_rate: 'نرخ پایه سرویس'
    };

    for (const key of allKeys) {
      let oldVal = previous[key];
      let newVal = proposed[key];

      if (oldVal === undefined && payload[key]?.old !== undefined) {
        oldVal = payload[key].old;
      }
      if (newVal === undefined && payload[key]?.new !== undefined) {
        newVal = payload[key].new;
      }
      if (newVal === undefined && payload[key] !== undefined && typeof payload[key] !== 'object') {
        newVal = payload[key];
      }

      this.diffFieldRows.push({
        field_name: key,
        field_label: labels[key] || key,
        old_value: oldVal ?? '—',
        new_value: newVal ?? '—',
        is_changed: String(oldVal ?? '') !== String(newVal ?? '')
      });
    }

    this.isDiffModalOpen = true;
  }

  openProfileRejectModal(id: number, name: string, type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr', action: 'reject' | 'revision'): void {
    this.rejectTargetId = id;
    this.rejectTargetName = name;
    this.rejectTargetType = type;
    this.rejectActionType = action;
    this.rejectReasonText = '';
    this.isRejectModalOpen = true;
  }

  confirmProfileRejectOrRevision(): void {
    if (!this.rejectTargetId) return;
    const id = this.rejectTargetId;
    const reason = this.rejectReasonText.trim();
    const action = this.rejectActionType;
    const type = this.rejectTargetType;

    let req$: any;
    if (type === 'personnel') {
      req$ = action === 'reject' ? this.api.rejectPersonnel(id, reason) : this.api.requestPersonnelRevision(id, reason);
    } else if (type === 'vehicle') {
      req$ = action === 'reject' ? this.api.rejectVehicle(id, reason) : this.api.requestVehicleRevision(id, reason);
    } else if (type === 'personnel_cr') {
      req$ = this.api.rejectPersonnelChangeRequest(id, reason);
    } else if (type === 'vehicle_cr') {
      req$ = this.api.rejectVehicleChangeRequest(id, reason);
    }

    if (req$) {
      req$.subscribe({
        next: (res: any) => {
          this.toast.show('info', res.message || 'عملیات با موفقیت انجام شد.');
          this.isRejectModalOpen = false;
          this.isDiffModalOpen = false;
          this.refreshCurrentTabData();
        },
        error: (err: any) => {
          this.toast.show('error', err?.error?.error || 'خطا در ثبت اقدام');
        }
      });
    }
  }

  downloadPayslipsZip(): void {
    this.downloadDskZip();
  }

  // ─── Payslip Modal Methods ────────────────────────────────
  openPayslipModal(r: MonthlyPayrollRecord): void {
    this.selectedPayslipRecord = r;
    this.isPayslipModalOpen = true;
  }

  closePayslipModal(): void {
    this.isPayslipModalOpen = false;
    this.selectedPayslipRecord = null;
  }

  printCurrentPayslip(): void {
    window.print();
  }

  // ─── Tax Modal ────────────────────────────────────────────
  openTaxModal(): void {
    this.isTaxModalOpen = true;
    this.taxModalMode = 'file';
    this.selectedTaxFile = null;
    this.taxExcelText = '';
    this.taxParsedRows = [];
    this.taxImportResult = null;
  }

  closeTaxModal(): void {
    this.isTaxModalOpen = false;
    this.selectedTaxFile = null;
    this.taxExcelText = '';
    this.taxParsedRows = [];
    this.taxImportResult = null;
  }

  setTaxModalMode(mode: 'file' | 'paste'): void {
    this.taxModalMode = mode;
    this.taxImportResult = null;
  }

  onTaxFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.selectedTaxFile = file;
      this.taxImportResult = null;
    }
  }

  onTaxTextChange(): void {
    if (!this.taxExcelText.trim()) {
      this.taxParsedRows = [];
      return;
    }

    const normalizeDigits = (str: string): string => {
      if (!str) return '';
      return str
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    };

    const lines = this.taxExcelText.trim().split(/\r?\n/);
    const parsed: typeof this.taxParsedRows = [];

    // Map existing payroll records by national code
    const recordMap = new Map<string, MonthlyPayrollRecord>();
    (this.payrollRecords || []).forEach(r => {
      if (r.national_code) {
        recordMap.set(normalizeDigits(r.national_code).trim().padStart(10, '0'), r);
      }
    });

    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Skip header line if detected
      if (idx === 0 && (cleanLine.includes('کد ملی') || cleanLine.includes('مالیات') || cleanLine.includes('نام') || cleanLine.includes('ردیف'))) {
        return;
      }

      const rawCols = cleanLine.split(/[\t,;|]/).map(c => c.trim()).filter(c => c.length > 0);
      const normalizedCols = rawCols.map(c => normalizeDigits(c));

      let nationalCode = '';
      let taxAmount = 0;

      for (const col of normalizedCols) {
        const digitsOnly = col.replace(/\D/g, '');
        if (digitsOnly.length === 10 && !nationalCode) {
          nationalCode = digitsOnly;
        } else if (/^-?\d+([.,]\d+)?$/.test(col.replace(/,/g, '')) && !taxAmount) {
          taxAmount = Math.abs(parseFloat(col.replace(/,/g, '')) || 0);
        }
      }

      // If columns weren't isolated by regex loop, check index positions
      if (!nationalCode && normalizedCols.length >= 1) {
        const d = normalizedCols[0].replace(/\D/g, '');
        if (d.length >= 8 && d.length <= 10) {
          nationalCode = d.padStart(10, '0');
        }
      }
      if (!taxAmount && normalizedCols.length >= 2) {
        const cleanNum = normalizedCols[1].replace(/,/g, '').replace(/[^\d.-]/g, '');
        taxAmount = Math.abs(parseFloat(cleanNum) || 0);
      }

      if (nationalCode) {
        const matchedRecord = recordMap.get(nationalCode);
        parsed.push({
          national_code: nationalCode,
          tax_amount: taxAmount,
          full_name: matchedRecord?.full_name || '—',
          matched: !!matchedRecord
        });
      }
    });

    this.taxParsedRows = parsed;
  }

  submitTaxImport(): void {
    if (this.taxModalMode === 'file') {
      if (!this.selectedTaxFile) {
        this.toast.show('warning', 'لطفاً ابتدا فایل اکسل مالیات دارایی را انتخاب نمایید.');
        return;
      }

      const formData = new FormData();
      formData.append('file', this.selectedTaxFile);
      formData.append('year_month', this.selectedYearMonth);
      if (this.currentPeriodId) {
        formData.append('period_id', String(this.currentPeriodId));
      }

      this.isImportingTax = true;
      this.api.importTaxExcel(formData).subscribe({
        next: (res: any) => {
          this.isImportingTax = false;
          this.taxImportResult = res;
          this.toast.show('success', res.message || `اطلاعات مالیات دارایی با موفقیت اعمال شد (${res.matched_count || 0} رکورد).`);
          this.loadMonthlyPayroll();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isImportingTax = false;
          this.toast.show('error', err?.error?.error || 'خطا در درون‌ریزی فایل اکسل مالیات');
          this.cdr.detectChanges();
        }
      });
    } else {
      // Paste mode
      if (this.taxParsedRows.length === 0) {
        this.toast.show('warning', 'هیچ سطر معتبری از متن پیست‌شده شناسایی نشد.');
        return;
      }

      const payload = {
        year_month: this.selectedYearMonth,
        period_id: this.currentPeriodId,
        items: this.taxParsedRows.map(r => ({
          national_code: r.national_code,
          tax_amount: r.tax_amount
        }))
      };

      this.isImportingTax = true;
      this.api.importTaxExcel(payload).subscribe({
        next: (res: any) => {
          this.isImportingTax = false;
          this.taxImportResult = res;
          this.toast.show('success', res.message || `اطلاعات مالیات دارایی با موفقیت اعمال شد (${res.matched_count || 0} رکورد).`);
          this.loadMonthlyPayroll();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isImportingTax = false;
          this.toast.show('error', err?.error?.error || 'خطا در اعمال اطلاعات متنی مالیات');
          this.cdr.detectChanges();
        }
      });
    }
  }

  getApprovalBadgeClass(status?: string): string {
    switch (status) {
      case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'manager_approved': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'draft': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'revision_required': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getApprovalStatusTitle(status?: string): string {
    switch (status) {
      case 'approved': return 'تایید نهایی';
      case 'manager_approved': return 'تایید مدیر (در انتظار حسابدار)';
      case 'draft': return 'پیش‌نویس';
      case 'revision_required': return 'نیازمند بازنگری';
      case 'rejected': return 'رد شده';
      default: return status || '—';
    }
  }
}
