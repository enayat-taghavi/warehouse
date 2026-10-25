import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../../core/http/scope-directory.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { AttendanceSummaryRow, ProjectSection } from '../../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ModalFocus } from '../../../../../../core/utils/modal-focus';
import {
  PAYROLL_MONTHS,
  defaultPayrollPeriod,
  isPayrollMonthName,
  mergeFiscalYears,
  payrollMonthCode
} from '../payroll-period';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { STATUS_ICONS, PLATFORM_ENTITY_ICONS } from '../../../../../../shared/icons/semantic-icons';
import { saveBlob, printWindow } from '../../../../../../core/platform/file-output';

export type AccountantPayrollSubTab = 'ready_to_calculate' | 'calculated' | 'approved' | 'all' | 'work_summary';

@Component({
  selector: 'app-accountant-payroll-hub',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SvgIconDirective,
    LoadingSkeletonComponent,
    TabBarComponent,
    ActionButtonComponent
  ],
  templateUrl: './accountant-payroll.html',
  styleUrl: './accountant-payroll.css',
  host: { '(document:keydown.escape)': 'onEscapeKey()', '(document:keydown)': 'onDocumentKeydown($event)' }
})
export class AccountantPayrollHubComponent implements OnInit, OnDestroy {
  // Subtabs navigation
  activeSubTab: AccountantPayrollSubTab = 'ready_to_calculate';

  // Memoized tabs for app-tab-bar (getter با آرایه تازه در هر چرخه، در dev mode خطای NG0100 می‌دهد)
  private payrollSubTabsKey = '';
  private payrollSubTabsCache: TabDef[] = [];
  get payrollSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.ready_to_calculate}:${sc.calculated}:${sc.approved}:${sc.all}`;
    if (key !== this.payrollSubTabsKey) {
      this.payrollSubTabsKey = key;
      this.payrollSubTabsCache = [
        {
          id: 'ready_to_calculate',
          label: 'آماده محاسبه',
          shortLabel: 'آماده',
          icon: STATUS_ICONS.pending,
          count: sc.ready_to_calculate,
          tone: 'amber'
        },
        {
          id: 'calculated',
          label: 'محاسبه‌شده',
          shortLabel: 'محاسبه',
          icon: STATUS_ICONS.draft,
          count: sc.calculated,
          tone: 'indigo'
        },
        {
          id: 'approved',
          label: 'تایید نهایی',
          shortLabel: 'تایید',
          icon: STATUS_ICONS.approved,
          count: sc.approved,
          tone: 'emerald'
        },
        {
          id: 'all',
          label: 'کل پرونده‌ها',
          shortLabel: 'همه',
          icon: STATUS_ICONS.all,
          count: sc.all,
          tone: 'slate'
        },
        {
          id: 'work_summary',
          label: 'خلاصه کارکرد ماهانه',
          shortLabel: 'خلاصه',
          icon: PLATFORM_ENTITY_ICONS.reports,
          tone: 'slate'
        }
      ];
    }
    return this.payrollSubTabsCache;
  }

  // Section Isolation (Guardian G1)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Fiscal Context & Filters (دوره و دامنهٔ محاسبه؛ منتقل‌شده از کارتابل مالی قدیمی)
  readonly monthNames = PAYROLL_MONTHS.map(m => m.name);
  availableYears: string[] = [];
  searchQuery = '';
  fiscalYear = defaultPayrollPeriod().year;
  selectedMonth = defaultPayrollPeriod().month;
  /** دامنهٔ محاسبه: تهی = کل شرکت (سراسری)، یا یک انبار */
  selectedWarehouseId: number | null = null;
  warehouses: { id: number; name: string }[] = [];
  statusCategoryFilter = 'ALL';
  showDetailedColumns = false;

  // State & Indicators
  isLoading = false;
  loadError = false;
  isCalculating = false;
  isReleasingHold: number | null = null;
  allRecords: any[] = [];
  items: any[] = [];

  // Period lock state (از رکوردهای دوره، پس از محاسبه یا پس از تغییر قفل معلوم می‌شود)
  currentPeriodId: number | null = null;
  periodStatus: string | null = null;
  isTogglingLock = false;

  // Summary Metrics (Mirroring reference Excel: حقوق تیر ماه انبارداری.xlsm)
  payrollSummary = {
    totalPersonnel: 0,
    totalGross: 0,
    totalPayable: 0,
    totalInsurance: 0,
    totalTax: 0
  };

  // Status Counters
  statusCounters = {
    ready_to_calculate: 0,
    calculated: 0,
    approved: 0,
    all: 0
  };

  // Work summary (خلاصهٔ کارکرد ماهانهٔ پرسنل)
  workSummaryRows: AttendanceSummaryRow[] = [];
  isWorkSummaryLoading = false;
  workSummaryError = false;

  // Payslip Modal
  isPayslipModalOpen = false;
  selectedPayslipRecord: any = null;

  // Tax Modal (فایل اکسل یا چسباندن متن)
  isTaxModalOpen = false;
  taxModalMode: 'file' | 'paste' = 'file';
  selectedTaxFile: File | null = null;
  taxExcelText = '';
  taxParsedRows: Array<{ national_code: string; tax_amount: number; full_name?: string; matched: boolean }> = [];
  isImportingTax = false;
  taxImportResult: {
    message: string;
    matched_count: number;
    unmatched_count: number;
    unmatched_rows: any[];
    total_imported_tax: number;
    period_year_month: string;
  } | null = null;

  private routeSub?: Subscription;
  private docSub?: Subscription;
  private readonly payslipFocus = new ModalFocus();
  private readonly taxFocus = new ModalFocus();

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private scopeDirectory?: ScopeDirectoryService,
    @Optional() private moduleRegistry?: ModuleRegistryService,
    @Optional() private confirmDialog?: ConfirmDialogService,
    @Optional() private ws?: WebSocketService
  ) {}

  get yearMonth(): string {
    return `${this.fiscalYear}/${payrollMonthCode(this.selectedMonth)}`;
  }

  get showWarehouseScope(): boolean {
    const hasFilter = this.moduleRegistry?.getExtensions('scopeDirectory').some(e => !!e.extension.offersScopeFilter);
    return !!hasFilter && this.warehouses.length > 0;
  }

  get isPeriodLocked(): boolean {
    return this.periodStatus === 'LOCKED';
  }

  get canLockPeriod(): boolean {
    const p = this.auth.userPermissions() || [];
    return p.includes('perm_lock_work_period') || p.includes('admin_all') || !!this.auth.user()?.is_superuser;
  }

  /** بازگشایی دوره در بک‌اند فقط برای سوپریوزر مجاز است */
  get canUnlockPeriod(): boolean {
    return !!this.auth.user()?.is_superuser;
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['ready_to_calculate', 'calculated', 'approved', 'all', 'work_summary'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
      if (params['month'] && isPayrollMonthName(params['month'])) {
        this.selectedMonth = params['month'];
      }
      if (params['year'] && /^\d{4}$/.test(params['year'])) {
        this.fiscalYear = params['year'];
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

    const hasWhFilter = this.moduleRegistry?.getExtensions('scopeDirectory').some(e => !!e.extension.offersScopeFilter);
    if (this.scopeDirectory && hasWhFilter) {
      this.scopeDirectory.getAll().subscribe({
        next: (data: any) => {
          this.warehouses = (Array.isArray(data) ? data : []).map((w: any) => ({ id: w.id, name: w.name }));
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    this.loadSections();

    // ص۶ طرح ۲.۵: وضعیت پرداخت فیش درجا به‌روز می‌شود؛ تغییر دورهٔ همین فهرست (محاسبه، پرداخت) یا فیش ناپیدا = بازخوانی بی‌صدا
    this.docSub = this.ws?.documentChanges$?.(['payroll_record', 'payroll_period']).subscribe(ev => {
      if (ev.doc_type === 'payroll_record' && patchDocumentRow(this.allRecords, ev, 'payment_status')) {
        this.applyFilters();
        this.cdr.detectChanges();
      } else if (ev.doc_type === 'payroll_record' || (this.currentPeriodId && Number(ev.doc_id) === Number(this.currentPeriodId))) {
        this.fetchPayrollData(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.docSub?.unsubscribe();
  }

  onEscapeKey(): void {
    if (this.isPayslipModalOpen) this.closePayslipModal();
    if (this.isTaxModalOpen && !this.isImportingTax) this.closeTaxModal();
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.isPayslipModalOpen) {
      this.payslipFocus.trapTab(event, 'payroll-payslip-dialog');
    } else if (this.isTaxModalOpen) {
      this.taxFocus.trapTab(event, 'payroll-tax-dialog');
    }
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
              this.refreshCurrentTab();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.refreshCurrentTab();
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
    this.refreshCurrentTab();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.refreshCurrentTab();
  }

  /** تغییر سال، ماه یا دامنه: وضعیت قفل دورهٔ قبلی دیگر معتبر نیست */
  onPeriodChanged(): void {
    this.periodStatus = null;
    this.currentPeriodId = null;
    this.syncUrlParams();
    this.refreshCurrentTab();
  }

  switchSubTab(tab: string): void {
    if (tab !== 'ready_to_calculate' && tab !== 'calculated' && tab !== 'approved' && tab !== 'all' && tab !== 'work_summary') {
      return;
    }
    this.activeSubTab = tab;
    this.syncUrlParams();
    if (tab === 'work_summary') {
      this.loadWorkSummary();
    } else {
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null,
        month: this.selectedMonth,
        year: this.fiscalYear,
        wh: this.selectedWarehouseId || null
      },
      queryParamsHandling: 'merge'
    });
  }

  refreshCurrentTab(): void {
    if (this.activeSubTab === 'work_summary') {
      this.loadWorkSummary();
    }
    this.fetchPayrollData();
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری؛ خطایش فهرست فعلی را دست نمی‌زند */
  fetchPayrollData(silent = false): void {
    if (!silent) {
      this.isLoading = true;
      this.loadError = false;
    }
    const params: any = { year_month: this.yearMonth };
    if (this.selectedWarehouseId) {
      params.warehouse_id = this.selectedWarehouseId;
    }

    this.personnelApi.getMonthlyPayrollRecords(params).subscribe({
      next: (records: any[]) => {
        this.isLoading = false;
        this.allRecords = Array.isArray(records) ? records : [];
        const first = this.allRecords[0];
        this.currentPeriodId = first?.period ? (typeof first.period === 'object' ? first.period.id : first.period) : null;
        // وضعیت قفل همان هنگام بارگذاری معلوم شود، نه فقط پس از محاسبه
        if (first?.period_status) {
          this.periodStatus = first.period_status;
        }
        this.applyFilters();
        this.cdr.detectChanges();
      },
      error: () => {
        if (silent) return;
        this.isLoading = false;
        this.loadError = true;
        this.allRecords = [];
        this.applyFilters();
        this.toast.error('خطا در دریافت رکوردهای حقوق دوره.');
        this.cdr.detectChanges();
      }
    });
  }

  private isReadyToCalculate(x: any): boolean {
    return !x.gross_salary || Number(x.gross_salary) === 0 || x.payment_status === 'PENDING';
  }

  applyFilters(): void {
    const allItems = this.allRecords;

    let filtered = allItems;
    if (this.statusCategoryFilter !== 'ALL') {
      filtered = filtered.filter(x => (x.status_category || 'نفرات شرکتی') === this.statusCategoryFilter);
    }
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(x =>
        (x.personnel_name && x.personnel_name.toLowerCase().includes(q)) ||
        (x.full_name && x.full_name.toLowerCase().includes(q)) ||
        (x.national_code && x.national_code.includes(q)) ||
        (x.job_grade && String(x.job_grade).includes(q))
      );
    }

    if (this.activeSubTab === 'ready_to_calculate') {
      this.items = filtered.filter(x => this.isReadyToCalculate(x));
    } else if (this.activeSubTab === 'calculated') {
      this.items = filtered.filter(x => Number(x.gross_salary || 0) > 0 && x.payment_status === 'PENDING');
    } else if (this.activeSubTab === 'approved') {
      this.items = filtered.filter(x => ['READY_TO_PAY', 'PAID', 'FINANCE_APPROVED'].includes(x.payment_status));
    } else {
      this.items = filtered;
    }

    this.statusCounters = {
      ready_to_calculate: allItems.filter(x => this.isReadyToCalculate(x)).length,
      calculated: allItems.filter(x => Number(x.gross_salary || 0) > 0 && x.payment_status === 'PENDING').length,
      approved: allItems.filter(x => ['READY_TO_PAY', 'PAID', 'FINANCE_APPROVED'].includes(x.payment_status)).length,
      all: allItems.length
    };

    this.payrollSummary = {
      totalPersonnel: allItems.length,
      totalGross: allItems.reduce((sum, x) => sum + Number(x.gross_salary || 0), 0),
      totalPayable: allItems.reduce((sum, x) => sum + Number(x.payable_amount || x.net_salary || 0), 0),
      totalInsurance: allItems.reduce((sum, x) => sum + Number(x.total_insurance || (Number(x.worker_insurance || 0) + Number(x.employer_insurance || 0))), 0),
      totalTax: allItems.reduce((sum, x) => sum + Number(x.income_tax || 0), 0)
    };
  }

  calculateBatch(): void {
    if (this.isPeriodLocked) {
      this.toast.warning('دوره قفل شده است و امکان محاسبه مجدد ندارد.');
      return;
    }
    this.isCalculating = true;
    this.personnelApi.calculatePeriodPayroll({
      warehouse_id: this.selectedWarehouseId,
      year_month: this.yearMonth
    }).subscribe({
      next: (res: any) => {
        this.isCalculating = false;
        this.currentPeriodId = res?.period_id || null;
        this.periodStatus = res?.period_status || null;
        this.toast.success(res?.message || 'محاسبه مکانیزه حقوق با موفقیت انجام شد.');
        this.fetchPayrollData();
      },
      error: (err: any) => {
        this.isCalculating = false;
        const msg = err?.error?.error || 'خطا در محاسبه حقوق دوره.';
        this.toast.error(msg);
        this.cdr.detectChanges();
      }
    });
  }

  async toggleLockPeriod(): Promise<void> {
    if (!this.currentPeriodId || this.isTogglingLock) return;
    const unlocking = this.isPeriodLocked;
    if (unlocking ? !this.canUnlockPeriod : !this.canLockPeriod) return;

    // قفل را فقط مدیر ارشد باز می‌کند؛ پس پیش از قفل تأیید گرفته می‌شود
    if (!unlocking && this.confirmDialog) {
      const confirmed = await this.confirmDialog.open({
        title: 'قفل نهایی دوره',
        message: `دوره ${this.selectedMonth} ${this.fiscalYear} قفل می‌شود و دیگر محاسبهٔ دوباره نمی‌پذیرد. بازگشایی فقط با مدیر ارشد ممکن است.`,
        confirmText: 'بله، قفل شود',
        cancelText: 'انصراف',
        type: 'warning'
      });
      if (confirmed !== true) return;
    }

    this.isTogglingLock = true;
    const req$ = unlocking
      ? this.personnelApi.unlockPeriod(this.currentPeriodId)
      : this.personnelApi.lockPeriod(this.currentPeriodId);
    req$.subscribe({
      next: (res: any) => {
        this.isTogglingLock = false;
        this.periodStatus = unlocking ? 'OPEN' : 'LOCKED';
        this.toast.info(res?.message || (unlocking ? 'دوره کارکرد بازگشایی شد.' : 'دوره کارکرد قفل شد.'));
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isTogglingLock = false;
        this.toast.error(err?.error?.error || 'خطا در تغییر وضعیت قفل دوره.');
        this.cdr.detectChanges();
      }
    });
  }

  approveSingle(item: any): void {
    this.personnelApi.postCartableAction('accountant', {
      action: 'approve',
      model: 'payroll',
      id: item.id
    }).subscribe({
      next: () => {
        this.toast.success(`فیش حقوقی ${item.personnel_name || item.full_name || ''} تایید مالی شد.`);
        this.fetchPayrollData();
      },
      error: (err: any) => {
        const msg = err?.error?.error || 'خطا در تایید مالی فیش حقوقی.';
        this.toast.error(msg);
      }
    });
  }

  /** آزادسازی پرداخت معلق فیش حقوقی پرسنل منقضی پس از تمدید اعتبار (DEF-20) */
  releasePaymentHold(item: any): void {
    if (!item?.id || this.isReleasingHold) return;
    this.isReleasingHold = item.id;
    this.personnelApi.releasePayrollPaymentHold(item.id).subscribe({
      next: (res: any) => {
        this.isReleasingHold = null;
        item.payment_hold = false;
        if (this.selectedPayslipRecord && this.selectedPayslipRecord.id === item.id) {
          this.selectedPayslipRecord.payment_hold = false;
        }
        this.toast.success(res?.message || `پرداخت معلق فیش «${item.personnel_name || item.full_name || ''}» آزاد شد.`);
        this.fetchPayrollData();
      },
      error: (err: any) => {
        this.isReleasingHold = null;
        const msg = err?.error?.error || 'خطا در آزادسازی پرداخت معلق.';
        this.toast.error(msg);
      }
    });
  }

  exportExcel(): void {
    if (!this.currentPeriodId) {
      this.toast.warning('ابتدا باید محاسبات یک دوره انجام شده باشد تا خروجی اکسل صادر گردد.');
      return;
    }
    this.toast.info('در حال تولید فایل اکسل ۵۸ ستونی حقوق دوره...');
    this.personnelApi.exportMonthlyPayrollExcel(this.currentPeriodId).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `Payroll_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`);
        this.toast.success('فایل اکسل حقوق با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل اکسل حقوق.');
      }
    });
  }

  // ─── خلاصهٔ کارکرد ماهانه ───
  loadWorkSummary(): void {
    this.isWorkSummaryLoading = true;
    this.workSummaryError = false;
    this.personnelApi.getAttendanceMonthlySummary(this.selectedWarehouseId, this.yearMonth).subscribe({
      next: (res: any) => {
        this.workSummaryRows = res?.summary || [];
        this.isWorkSummaryLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.workSummaryRows = [];
        this.isWorkSummaryLoading = false;
        this.workSummaryError = true;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فیش حقوقی تکی ───
  openPayslipModal(record: any): void {
    this.selectedPayslipRecord = record;
    this.isPayslipModalOpen = true;
    this.cdr.detectChanges();
    this.payslipFocus.open('payroll-payslip-dialog');
  }

  closePayslipModal(): void {
    this.isPayslipModalOpen = false;
    this.selectedPayslipRecord = null;
    this.cdr.detectChanges();
    this.payslipFocus.close();
  }

  printCurrentPayslip(): void {
    printWindow();
  }

  // ─── ورود مالیات دارایی (فایل اکسل یا چسباندن متن) ───
  openTaxModal(): void {
    this.isTaxModalOpen = true;
    this.taxModalMode = 'file';
    this.selectedTaxFile = null;
    this.taxExcelText = '';
    this.taxParsedRows = [];
    this.taxImportResult = null;
    this.cdr.detectChanges();
    this.taxFocus.open('payroll-tax-dialog');
  }

  closeTaxModal(): void {
    this.isTaxModalOpen = false;
    this.selectedTaxFile = null;
    this.taxExcelText = '';
    this.taxParsedRows = [];
    this.taxImportResult = null;
    this.cdr.detectChanges();
    this.taxFocus.close();
  }

  readonly taxModalTabs: TabDef[] = [
    { id: 'file', label: 'بارگذاری فایل اکسل', shortLabel: 'فایل', icon: 'action-upload' },
    { id: 'paste', label: 'چسباندن متن', shortLabel: 'متن', icon: 'clipboard-paste' }
  ];

  setTaxModalMode(mode: string): void {
    if (mode === 'file' || mode === 'paste') {
      this.taxModalMode = mode;
      this.taxImportResult = null;
    }
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

    // تطبیق با رکوردهای حقوق دوره بر اساس کد ملی
    const recordMap = new Map<string, any>();
    this.allRecords.forEach(r => {
      if (r.national_code) {
        recordMap.set(normalizeDigits(r.national_code).trim().padStart(10, '0'), r);
      }
    });

    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // رد کردن سطر عنوان
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
          full_name: matchedRecord?.full_name || matchedRecord?.personnel_name || '—',
          matched: !!matchedRecord
        });
      }
    });

    this.taxParsedRows = parsed;
  }

  submitTaxImport(): void {
    const onSuccess = (res: any) => {
      this.isImportingTax = false;
      this.taxImportResult = res;
      this.toast.success(res?.message || `اطلاعات مالیات دارایی با موفقیت اعمال شد (${res?.matched_count || 0} رکورد).`);
      this.fetchPayrollData();
      this.cdr.detectChanges();
    };

    if (this.taxModalMode === 'file') {
      if (!this.selectedTaxFile) {
        this.toast.warning('لطفاً ابتدا فایل اکسل مالیات دارایی را انتخاب نمایید.');
        return;
      }
      const formData = new FormData();
      formData.append('file', this.selectedTaxFile);
      formData.append('year_month', this.yearMonth);
      if (this.currentPeriodId) {
        formData.append('period_id', String(this.currentPeriodId));
      }

      this.isImportingTax = true;
      this.personnelApi.importTaxExcel(formData).subscribe({
        next: onSuccess,
        error: (err: any) => {
          this.isImportingTax = false;
          this.toast.error(err?.error?.error || 'خطا در درون‌ریزی فایل اکسل مالیات');
          this.cdr.detectChanges();
        }
      });
      return;
    }

    if (this.taxParsedRows.length === 0) {
      this.toast.warning('هیچ سطر معتبری از متن چسبانده‌شده شناسایی نشد.');
      return;
    }

    this.isImportingTax = true;
    this.personnelApi.importTaxExcel({
      year_month: this.yearMonth,
      period_id: this.currentPeriodId,
      items: this.taxParsedRows.map(r => ({ national_code: r.national_code, tax_amount: r.tax_amount }))
    }).subscribe({
      next: onSuccess,
      error: (err: any) => {
        this.isImportingTax = false;
        this.toast.error(err?.error?.error || 'خطا در اعمال اطلاعات متنی مالیات');
        this.cdr.detectChanges();
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.applyFilters();
    this.cdr.detectChanges();
  }
}
