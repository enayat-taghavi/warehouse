import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ProjectSection, VehicleDriverProfile, VehicleChangeRequest, VehicleBankAccount } from '../../../../core/models/personnel.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  cleanShebaInput,
  generateShebaFromAccount,
  getBankByName
} from '../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ModalFocus } from '../../../../core/utils/modal-focus';
import {
  PAYROLL_MONTHS,
  defaultPayrollPeriod,
  isPayrollMonthName,
  mergeFiscalYears,
  payrollMonthCode
} from '../payroll-period';

export type AccountantFleetSubTab = 'new' | 'settlement' | 'changes' | 'all';

@Component({
  selector: 'app-accountant-fleet-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective, LoadingSkeletonComponent],
  templateUrl: './accountant-fleet.html',
  styleUrl: './accountant-fleet.css',
  host: { '(document:keydown.escape)': 'onApprovalEscape()', '(document:keydown)': 'onDocumentKeydown($event)' }
})
export class AccountantFleetHubComponent implements OnInit, OnDestroy {
  activeSubTab: AccountantFleetSubTab = 'new';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  isLoading = false;

  // دوره و دامنهٔ تسویه ناوگان
  readonly monthNames = PAYROLL_MONTHS.map(m => m.name);
  availableYears: string[] = [];
  fiscalYear = defaultPayrollPeriod().year;
  selectedMonth = defaultPayrollPeriod().month;
  selectedWarehouseId: number | null = null;
  warehouses: { id: number; name: string }[] = [];
  isExportingFleetBank = false;
  isExportingExcel = false;

  // لیست‌های داده
  newVehiclesList: VehicleDriverProfile[] = [];
  settlementItems: any[] = [];
  settlementSummary: {
    total_vehicles_count?: number;
    active_contractor_count?: number;
    total_fleet_trips?: number;
    total_payable_settlement?: number;
    period_status?: string;
  } | null = null;
  settlementError = false;
  isSettlementLoading = false;
  changeRequests: VehicleChangeRequest[] = [];
  allVehiclesList: VehicleDriverProfile[] = [];

  // شمارنده‌های زنده
  statusCounters = {
    newPending: 0,
    settlementPending: 0,
    changesPending: 0,
    allTotal: 0
  };

  // تسک ۹.۶: تایید گروهی حسابدار
  selectedVehicleIds: Set<number> = new Set();
  isBatchApprovalModalOpen = false;
  batchApprovalNote = '';
  isBatchApproving = false;

  // تسک ۹.۲ و ۹.۳: مودال ویرایش نرخ کرایه و اطلاعات بانکی + مقایسه هم‌تیپ‌ها
  isVehicleModalOpen = false;
  editingVehicle: Partial<VehicleDriverProfile> | null = null;
  isSavingVehicle = false;
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';
  vehicleBankAccounts: VehicleBankAccount[] = [];
  isLoadingBankAccounts = false;

  // تسک ۹.۳: مقایسه نرخ با میانگین هم‌تیپ‌ها
  rateBenchmark: {
    vehicle_id: number;
    vehicle_type: string;
    vehicle_type_display?: string;
    project_name?: string;
    count: number;
    avg_rate: number;
    min_rate: number;
    max_rate: number;
    current_rate: number;
  } | null = null;
  isLoadingBenchmark = false;

  // مودال تایید مالی با یادداشت اختیاری
  isApprovalModalOpen = false;
  approvalTarget: { id: number; title: string; type: 'vehicle' | 'vehicle_cr' } | null = null;
  approvalNote = '';
  isApproving = false;

  // تسک ۹.۵: مودال ثبت علت عودت یا رد همراه با عودت دومقصده
  isRejectModalOpen = false;
  rejectTarget: { id: number; title: string; type: 'vehicle' | 'vehicle_cr'; action: 'reject' | 'revision' } | null = null;
  rejectReason = '';
  revisionDestination: 'supervisor' | 'employee' = 'supervisor';
  isSubmittingReject = false;

  // مودال مقایسه تفاوت‌ها (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: VehicleChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];

  copiedId: number | null = null;

  private routeSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private whService?: WarehouseHttpService,
    @Optional() private moduleRegistry?: ModuleRegistryService
  ) {}

  get yearMonth(): string {
    return `${this.fiscalYear}/${payrollMonthCode(this.selectedMonth)}`;
  }

  get showWarehouseScope(): boolean {
    return !!this.moduleRegistry?.isModuleInstalled('warehouse') && this.warehouses.length > 0;
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['new', 'settlement', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as AccountantFleetSubTab;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
      if (params['year'] && /^\d{4}$/.test(params['year'])) {
        this.fiscalYear = params['year'];
      }
      if (params['month'] && isPayrollMonthName(params['month'])) {
        this.selectedMonth = params['month'];
      }
      if (params['wh']) {
        const wh = Number(params['wh']);
        this.selectedWarehouseId = Number.isFinite(wh) && wh > 0 ? wh : null;
      }
    });

    this.availableYears = mergeFiscalYears([], this.fiscalYear);
    this.personnelApi.getAvailableFiscalYears().subscribe({
      next: (res) => {
        this.availableYears = mergeFiscalYears(res?.years, this.fiscalYear);
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    if (this.whService && this.moduleRegistry?.isModuleInstalled('warehouse')) {
      this.whService.getAll().subscribe({
        next: (data: any) => {
          this.warehouses = (Array.isArray(data) ? data : []).map((w: any) => ({ id: w.id, name: w.name }));
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    this.loadSections();
  }

  onPeriodChanged(): void {
    this.syncUrlParams();
    this.loadSettlement();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          this.personnelApi.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs: ProjectSection[]) => {
              this.mySections = allSecs || [];
              this.pickDefaultSection();
            },
            error: () => {
              this.isLoadingSections = false;
              this.fetchFleetData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchFleetData();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    }
    this.isLoadingSections = false;
    this.fetchFleetData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchFleetData();
  }

  switchSubTab(tab: AccountantFleetSubTab): void {
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.fetchFleetData();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null,
        year: this.fiscalYear,
        month: this.selectedMonth,
        wh: this.selectedWarehouseId || null
      },
      queryParamsHandling: 'merge'
    });
  }

  fetchFleetData(): void {
    this.isLoading = true;
    const baseParams: any = {};
    if (this.selectedSectionId) baseParams.section_id = this.selectedSectionId;
    if (this.searchQuery.trim()) baseParams.search = this.searchQuery.trim();

    // ۱. دریافت خودروهای جدید در انتظار تایید مالی حسابدار
    this.personnelApi.getVehicleProfiles(baseParams).subscribe({
      next: (res: VehicleDriverProfile[]) => {
        const allList = res || [];
        this.allVehiclesList = allList;
        this.statusCounters.allTotal = allList.length;
        this.newVehiclesList = allList.filter(v => v.approval_status === 'pending_accountant' || v.approval_status === 'supervisor_approved');
        this.statusCounters.newPending = this.newVehiclesList.length;

        // پالایش رکوردهای انتخاب‌شده
        const validIds = new Set(this.newVehiclesList.map(v => v.id));
        for (const id of Array.from(this.selectedVehicleIds)) {
          if (!validIds.has(id)) {
            this.selectedVehicleIds.delete(id);
          }
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });

    // ۲. تسویه‌حساب و کارکرد ناوگان
    this.loadSettlement();

    // ۳. درخواست‌های تغییرات ناوگان
    this.personnelApi.getVehicleChangeRequests(baseParams).subscribe({
      next: (crList: VehicleChangeRequest[]) => {
        this.changeRequests = (crList || []).filter(cr => cr.status === 'pending_accountant' || cr.status === 'pending_finance' || cr.status === 'supervisor_approved');
        this.statusCounters.changesPending = this.changeRequests.length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.changeRequests = [];
      }
    });
  }

  /**
   * تسویه ماهانه ناوگان؛ پاسخ بک‌اند `{ summary, records }` است
   */
  loadSettlement(): void {
    this.settlementError = false;
    this.isSettlementLoading = true;
    this.settlementItems = [];
    this.settlementSummary = null;
    this.personnelApi.calculateFleetSettlement(this.selectedWarehouseId, this.yearMonth).subscribe({
      next: (res: any) => {
        const rows = Array.isArray(res?.records) ? res.records : [];
        this.isSettlementLoading = false;
        this.settlementItems = rows;
        this.settlementSummary = res?.summary || null;
        this.statusCounters.settlementPending = rows.filter((x: any) => x.is_payable && Number(x.payable_amount || 0) > 0).length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSettlementLoading = false;
        this.settlementItems = [];
        this.settlementSummary = null;
        this.settlementError = true;
        this.cdr.detectChanges();
      }
    });
  }

  /** فایل پرداخت بانکی تسویه ناوگان */
  exportFleetBankExcel(): void {
    this.isExportingFleetBank = true;
    this.personnelApi.exportFleetBankExcel(this.selectedWarehouseId, this.yearMonth).subscribe({
      next: (blob: Blob) => {
        this.isExportingFleetBank = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Fleet_Bank_Payment_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.showSuccess('فایل پرداخت بانکی تسویه ناوگان با موفقیت صادر گردید.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isExportingFleetBank = false;
        this.toast.showError('خطا در صدور فایل پرداخت بانکی ناوگان.');
        this.cdr.detectChanges();
      }
    });
  }

  exportExcel(): void {
    this.isExportingExcel = true;
    const params: any = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    this.personnelApi.exportVehiclesExcel(params).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Fleet_Vehicles_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.showSuccess('خروجی اکسل ناوگان با موفقیت صادر گردید.');
      },
      error: () => {
        this.isExportingExcel = false;
        this.toast.showError('خطا در دریافت خروجی اکسل ناوگان.');
      }
    });
  }

  // ─── تسک ۹.۴: قفل «ارسال به مدیر» با missing_fields ───
  canSendToManager(v: VehicleDriverProfile): boolean {
    if (!v) return false;
    const isContractOrPersonal = v.ownership_type === 'contract' || v.ownership_type === 'personal';
    if (isContractOrPersonal) {
      const rate = Number(v.default_service_rate || 0);
      if (rate <= 0) return false;
      const cleanSheba = v.sheba_number ? String(v.sheba_number).replace(/^IR/i, '').trim() : '';
      if (cleanSheba.length < 24) return false;
    }
    if (v.missing_fields && Array.isArray(v.missing_fields) && v.missing_fields.length > 0) {
      const finMissing = v.missing_fields.some((m: any) => {
        const f = typeof m === 'string' ? m : (m.field || '');
        return ['default_service_rate', 'sheba_number', 'bank_name', 'primary_bank_account'].includes(f);
      });
      if (finMissing) return false;
    }
    return true;
  }

  getMissingFieldsSummary(v: VehicleDriverProfile): string[] {
    const missing: string[] = [];
    const isContractOrPersonal = v.ownership_type === 'contract' || v.ownership_type === 'personal';
    if (isContractOrPersonal) {
      if (Number(v.default_service_rate || 0) <= 0) {
        missing.push('تعیین نرخ پایه سرویس');
      }
      const cleanSheba = v.sheba_number ? String(v.sheba_number).replace(/^IR/i, '').trim() : '';
      if (cleanSheba.length < 24) {
        missing.push('شماره شبا معتبر ۲۴ رقمی');
      }
    }
    if (v.missing_fields && Array.isArray(v.missing_fields)) {
      v.missing_fields.forEach((m: any) => {
        const label = typeof m === 'string' ? m : (m.message || m.field);
        if (!missing.includes(label)) missing.push(label);
      });
    }
    return missing;
  }

  // ─── تسک ۹.۶: تایید گروهی حسابدار ───
  toggleSelectAll(): void {
    const eligibleItems = this.newVehiclesList.filter(v => v.id && this.canSendToManager(v));
    if (this.selectedVehicleIds.size === eligibleItems.length && eligibleItems.length > 0) {
      this.selectedVehicleIds.clear();
    } else {
      this.selectedVehicleIds.clear();
      eligibleItems.forEach(v => {
        if (v.id) this.selectedVehicleIds.add(v.id);
      });
    }
    this.cdr.detectChanges();
  }

  toggleSelection(id: number | undefined): void {
    if (!id) return;
    if (this.selectedVehicleIds.has(id)) {
      this.selectedVehicleIds.delete(id);
    } else {
      this.selectedVehicleIds.add(id);
    }
    this.cdr.detectChanges();
  }

  isSelected(id: number | undefined): boolean {
    return id ? this.selectedVehicleIds.has(id) : false;
  }

  isAllSelected(): boolean {
    const eligibleItems = this.newVehiclesList.filter(v => v.id && this.canSendToManager(v));
    return eligibleItems.length > 0 && this.selectedVehicleIds.size === eligibleItems.length;
  }

  openBatchApprovalModal(): void {
    if (this.selectedVehicleIds.size === 0) return;
    this.batchApprovalNote = '';
    this.isBatchApprovalModalOpen = true;
    this.cdr.detectChanges();
  }

  closeBatchApprovalModal(): void {
    this.isBatchApprovalModalOpen = false;
    this.batchApprovalNote = '';
    this.cdr.detectChanges();
  }

  confirmBatchApproval(): void {
    if (this.selectedVehicleIds.size === 0 || this.isBatchApproving) return;
    this.isBatchApproving = true;
    const ids = Array.from(this.selectedVehicleIds);
    this.personnelApi.batchApproveVehicles(ids, 'finance', this.batchApprovalNote).subscribe({
      next: (res: any) => {
        this.isBatchApproving = false;
        const count = (res?.results || []).filter((r: any) => r.success).length;
        this.toast.showSuccess(`تایید مالی گروهی برای ${count} خودرو صادر و پرونده‌ها به کارتابل مدیر ارسال گردید.`);
        this.selectedVehicleIds.clear();
        this.closeBatchApprovalModal();
        this.fetchFleetData();
      },
      error: (err: any) => {
        this.isBatchApproving = false;
        this.toast.showError(err?.error?.error || 'خطا در ثبت تایید مالی گروهی');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── اکشن‌های مالی خودرو ───
  approveVehicleFinance(v: VehicleDriverProfile, note?: string): void {
    if (!v.id) return;
    if (!this.canSendToManager(v)) {
      const reasons = this.getMissingFieldsSummary(v).join('، ');
      this.toast.showWarning(`ارسال پرونده به مدیر مقدور نیست؛ موارد ناقص: ${reasons}`);
      return;
    }
    const req$ = note ? this.personnelApi.approveVehicleFinance(v.id, note) : this.personnelApi.approveVehicleFinance(v.id);
    req$.subscribe({
      next: (res) => {
        this.toast.showSuccess(res.message || `تایید مالی خودرو «${v.plate_number || ''}» صادر و پرونده جهت تصویب نهایی به مدیر ارسال شد.`);
        this.fetchFleetData();
      },
      error: (err) => {
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در تایید مالی خودرو');
      }
    });
  }

  /** تایید مالی درخواست تغییرات ناوگان و ارسال به مدیر */
  approveChangeRequestFinance(cr: VehicleChangeRequest, note?: string): void {
    if (!cr.id) return;
    const req$ = note
      ? this.personnelApi.approveVehicleChangeRequestFinance(cr.id, note)
      : this.personnelApi.approveVehicleChangeRequestFinance(cr.id);
    req$.subscribe({
      next: (res: any) => {
        this.toast.showSuccess(res?.message || 'تایید مالی ثبت و درخواست تغییرات ناوگان جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.closeDiffModal();
        this.fetchFleetData();
      },
      error: (err: any) => {
        this.toast.showError(err?.error?.error || 'خطا در تایید مالی درخواست تغییرات ناوگان');
      }
    });
  }

  // ─── مودال تایید مالی با یادداشت اختیاری ───
  private readonly approvalFocus = new ModalFocus();

  openApprovalModal(id: number | undefined, title: string, type: 'vehicle' | 'vehicle_cr'): void {
    if (!id) return;
    this.approvalTarget = { id, title, type };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
    this.cdr.detectChanges();
    this.approvalFocus.open('acc-fleet-approve-dialog');
  }

  closeApprovalModal(): void {
    const wasOpen = this.isApprovalModalOpen;
    this.isApprovalModalOpen = false;
    this.approvalTarget = null;
    this.approvalNote = '';
    this.cdr.detectChanges();
    if (wasOpen) this.approvalFocus.close();
  }

  onApprovalEscape(): void {
    if (this.isApprovalModalOpen && !this.isApproving) this.closeApprovalModal();
    if (this.isRejectModalOpen && !this.isSubmittingReject) this.closeRejectModal();
    if (this.isVehicleModalOpen && !this.isSavingVehicle) this.closeVehicleModal();
    if (this.isBatchApprovalModalOpen && !this.isBatchApproving) this.closeBatchApprovalModal();
    if (this.isDiffModalOpen) this.closeDiffModal();
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.isApprovalModalOpen) this.approvalFocus.trapTab(event, 'acc-fleet-approve-dialog');
  }

  confirmApproval(): void {
    if (!this.approvalTarget || this.isApproving) return;
    const { id, type } = this.approvalTarget;
    const note = this.approvalNote.trim() || undefined;
    this.isApproving = true;
    const req$ = type === 'vehicle'
      ? (note ? this.personnelApi.approveVehicleFinance(id, note) : this.personnelApi.approveVehicleFinance(id))
      : (note ? this.personnelApi.approveVehicleChangeRequestFinance(id, note) : this.personnelApi.approveVehicleChangeRequestFinance(id));
    req$.subscribe({
      next: (res: any) => {
        this.isApproving = false;
        this.toast.showSuccess(res?.message || 'تایید مالی ثبت و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.closeApprovalModal();
        this.closeDiffModal();
        this.fetchFleetData();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در ثبت تایید مالی');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── تسک ۹.۲ و ۹.۳: فرم نرخ و حساب در pending_accountant ───
  openEditVehicleModal(v: VehicleDriverProfile): void {
    this.editingVehicle = { ...v };
    this.vehicleBankAccounts = [];
    if (v.sheba_number) {
      const clean = cleanShebaInput(v.sheba_number);
      this.shebaValidationResult = validateSheba(clean);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || clean;
    } else {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
    }

    if (v.id) {
      this.loadRateBenchmark(v.id);
      this.loadVehicleBankAccounts(v.id);
    }

    this.isVehicleModalOpen = true;
  }

  loadRateBenchmark(vehicleId: number): void {
    this.rateBenchmark = null;
    this.isLoadingBenchmark = true;
    this.personnelApi.getVehicleRateBenchmark(vehicleId).subscribe({
      next: (res) => {
        this.rateBenchmark = res;
        this.isLoadingBenchmark = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.rateBenchmark = null;
        this.isLoadingBenchmark = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadVehicleBankAccounts(vehicleId: number): void {
    this.isLoadingBankAccounts = true;
    this.personnelApi.getVehicleBankAccounts(vehicleId).subscribe({
      next: (accs) => {
        this.vehicleBankAccounts = accs || [];
        this.isLoadingBankAccounts = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.vehicleBankAccounts = [];
        this.isLoadingBankAccounts = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeVehicleModal(): void {
    this.isVehicleModalOpen = false;
    this.editingVehicle = null;
    this.rateBenchmark = null;
    this.vehicleBankAccounts = [];
  }

  onShebaInput(event: any): void {
    const raw = typeof event === 'string' ? event : (event?.target?.value || '');
    const clean = cleanShebaInput(raw);
    this.shebaValidationResult = validateSheba(clean);
    this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || clean;
    if (this.editingVehicle) {
      this.editingVehicle.sheba_number = this.shebaValidationResult.rawSheba || clean;
      if (this.shebaValidationResult.bank && !this.editingVehicle.bank_name) {
        this.editingVehicle.bank_name = this.shebaValidationResult.bank.name;
      }
      if (this.shebaValidationResult.accountNumber && !this.editingVehicle.account_number) {
        this.editingVehicle.account_number = this.shebaValidationResult.accountNumber;
      }
    }
  }

  onAccountNumberInput(event: any): void {
    const raw = typeof event === 'string' ? event : (event?.target?.value || '');
    const clean = raw.replace(/[^\d]/g, '');
    if (this.editingVehicle) {
      this.editingVehicle.account_number = clean;
      this.autoGenerateShebaFromAccount();
    }
  }

  onBankSelect(): void {
    this.autoGenerateShebaFromAccount();
  }

  private autoGenerateShebaFromAccount(): void {
    if (!this.editingVehicle?.account_number || !this.editingVehicle?.bank_name) return;
    const bank = getBankByName(this.editingVehicle.bank_name);
    if (!bank) return;
    const generated = generateShebaFromAccount(bank.code, this.editingVehicle.account_number);
    if (generated) {
      this.editingVehicle.sheba_number = generated;
      this.shebaValidationResult = validateSheba(generated);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || generated;
      this.cdr.detectChanges();
    }
  }

  convertAccountToShebaNow(): void {
    if (!this.editingVehicle?.account_number || !this.editingVehicle?.bank_name) {
      this.toast.showWarning('برای ساخت شماره شبا، شماره حساب و نام بانک الزامی است.');
      return;
    }
    const bank = getBankByName(this.editingVehicle.bank_name);
    if (!bank) {
      this.toast.showError('اطلاعات بانک انتخابی برای الگوریتم شبا معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(bank.code, this.editingVehicle.account_number);
    if (generated) {
      this.editingVehicle.sheba_number = generated;
      this.shebaValidationResult = validateSheba(generated);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || generated;
      this.toast.showSuccess('شماره شبا با موفقیت تولید شد.');
    }
  }

  saveVehicleFinancialChanges(): void {
    if (!this.editingVehicle?.id) return;
    this.isSavingVehicle = true;

    this.personnelApi.updateVehicleProfile(this.editingVehicle.id, this.editingVehicle).subscribe({
      next: () => {
        this.isSavingVehicle = false;
        this.toast.showSuccess(`اطلاعات و نرخ کرایه خودرو «${this.editingVehicle?.plate_number}» با موفقیت ذخیره شد.`);
        this.closeVehicleModal();
        this.fetchFleetData();
      },
      error: (err) => {
        this.isSavingVehicle = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در ذخیره اطلاعات مالی خودرو');
      }
    });
  }

  // ─── تسک ۹.۲ و ن-۱۶: تعیین حساب اصلی خودرو ───
  setPrimaryBankAccount(acc: VehicleBankAccount): void {
    if (!this.editingVehicle?.id || !acc.id) return;
    this.personnelApi.updateVehicleBankAccount(this.editingVehicle.id, { id: acc.id, is_primary: true }).subscribe({
      next: () => {
        this.toast.showSuccess(`حساب بانکی «${acc.bank_name} - ${acc.account_number || acc.sheba_number}» به عنوان حساب اصلی تعیین شد.`);
        if (this.editingVehicle?.id) {
          this.loadVehicleBankAccounts(this.editingVehicle.id);
          this.editingVehicle.bank_name = acc.bank_name;
          this.editingVehicle.account_number = acc.account_number;
          this.editingVehicle.sheba_number = acc.sheba_number;
          if (acc.sheba_number) {
            const clean = cleanShebaInput(acc.sheba_number);
            this.shebaValidationResult = validateSheba(clean);
            this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || clean;
          }
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در تعیین حساب اصلی');
      }
    });
  }

  isShebaValid(sheba?: string): boolean {
    if (!sheba) return false;
    return validateSheba(cleanShebaInput(sheba)).isValid;
  }

  // ─── تسک ۹.۵: اکشن‌های رد و عودت دومقصده ───
  openRejectModal(id: number, title: string, type: 'vehicle' | 'vehicle_cr', action: 'reject' | 'revision'): void {
    this.rejectTarget = { id, title, type, action };
    this.rejectReason = '';
    this.revisionDestination = 'supervisor';
    this.isRejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.rejectTarget = null;
    this.rejectReason = '';
    this.revisionDestination = 'supervisor';
  }

  submitRejectModal(): void {
    if (!this.rejectTarget || !this.rejectReason.trim()) {
      this.toast.showWarning('لطفاً دلیل مستند عودت یا رد را وارد فرمایید.');
      return;
    }
    this.isSubmittingReject = true;
    const { id, type, action } = this.rejectTarget;
    const reason = this.rejectReason.trim();

    if (type === 'vehicle') {
      const obs = action === 'reject'
        ? this.personnelApi.rejectVehicle(id, reason)
        : this.personnelApi.requestVehicleRevision(id, reason, this.revisionDestination);
      obs.subscribe({
        next: (res) => {
          this.isSubmittingReject = false;
          this.toast.showSuccess(res.message || 'عملیات با موفقیت انجام شد.');
          this.closeRejectModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isSubmittingReject = false;
          this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در انجام عملیات');
        }
      });
    } else {
      this.personnelApi.rejectVehicleChangeRequest(id, reason).subscribe({
        next: (res) => {
          this.isSubmittingReject = false;
          this.toast.showSuccess(res.message || 'درخواست تغییرات با موفقیت رد شد.');
          this.closeRejectModal();
          this.fetchFleetData();
        },
        error: (err) => {
          this.isSubmittingReject = false;
          this.toast.showError(err?.error?.error || 'خطا در رد درخواست');
        }
      });
    }
  }

  // ─── مقایسه تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: VehicleChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    const proposed = (cr.proposed_changes || {}) as Record<string, any>;
    const current = (cr.previous_values || {}) as Record<string, any>;

    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)]));
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'vehicle'].includes(key)) continue;
      const oldVal = current[key];
      const newVal = proposed[key];
      const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
      this.diffFieldRows.push({
        field_name: key,
        field_label: this.getFieldLabel(key),
        old_value: oldVal ?? '—',
        new_value: newVal ?? '—',
        is_changed: isChanged
      });
    }
    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
  }

  getFieldLabel(field: string): string {
    const dict: Record<string, string> = {
      plate_number: 'شماره پلاک',
      model_name: 'مدل / برند',
      driver_name: 'نام راننده',
      driver_mobile: 'موبایل راننده',
      owner_name: 'مالک خودرو',
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      default_service_rate: 'نرخ هر سرویس'
    };
    return dict[field] || field;
  }

  copyToClipboard(text: string, id: number): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedId = id;
      this.toast.showSuccess('در حافظه کپی شد: ' + text);
      setTimeout(() => {
        if (this.copiedId === id) this.copiedId = null;
        this.cdr.markForCheck();
      }, 2000);
    });
  }
}
