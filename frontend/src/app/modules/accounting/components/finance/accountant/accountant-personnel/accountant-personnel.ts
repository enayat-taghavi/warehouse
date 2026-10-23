import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import {
  ProjectSection,
  PersonnelProfile,
  PersonnelChangeRequest,
  PayrollYearlySettings,
  PersonnelCostEstimate
} from '../../../../models/personnel.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  formatShebaDisplay,
  cleanShebaInput,
  extractShebaDigits,
  generateShebaFromAccount,
  getBankByName,
  validateAccountNumber
} from '../../../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ModalFocus } from '../../../../../../core/utils/modal-focus';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';

export type AccountantPersonnelSubTab = 'new' | 'payroll' | 'changes' | 'all';
export type AccountantPersonnelStatusFilter = 'ALL' | 'pending_accountant' | 'pending_manager' | 'approved' | 'revision_required' | 'rejected';

@Component({
  selector: 'app-accountant-personnel-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SvgIconDirective,
    TabBarComponent,
    ActionButtonComponent
  ],
  templateUrl: './accountant-personnel.html',
  styleUrl: './accountant-personnel.css',
  host: { '(document:keydown.escape)': 'onApprovalEscape()', '(document:keydown)': 'onDocumentKeydown($event)' }
})
export class AccountantPersonnelHubComponent implements OnInit, OnDestroy {
  activeSubTab: AccountantPersonnelSubTab = 'new';
  statusFilter: AccountantPersonnelStatusFilter = 'ALL';
  searchQuery = '';
  fiscalYear = '1405';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  isLoading = false;
  personnelItems: PersonnelProfile[] = [];
  payrollRecords: any[] = [];
  changeRequests: PersonnelChangeRequest[] = [];
  allPersonnelList: PersonnelProfile[] = [];
  yearlySettings: PayrollYearlySettings | null = null;

  statusCounters = {
    newPending: 0,
    payrollPending: 0,
    changesPending: 0,
    allTotal: 0
  };

  // Memoized tabs for app-tab-bar (getter با آرایه تازه در هر چرخه، در dev mode خطای NG0100 می‌دهد)
  private personnelSubTabsKey = '';
  private personnelSubTabsCache: TabDef[] = [];
  get personnelSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newPending}:${sc.payrollPending}:${sc.changesPending}:${sc.allTotal}`;
    if (key !== this.personnelSubTabsKey) {
      this.personnelSubTabsKey = key;
      this.personnelSubTabsCache = [
        {
          id: 'new',
          label: 'احکام و مدارک مالی',
          shortLabel: 'احکام',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: sc.newPending,
          tone: 'amber',
          indicator: sc.newPending > 0 ? { tone: 'amber', label: 'نیازمند اقدام', pulse: true } : undefined
        },
        {
          id: 'payroll',
          label: 'حقوق و دستمزد ماهانه',
          shortLabel: 'حقوق',
          icon: ACCOUNTING_ENTITY_ICONS.payroll,
          count: sc.payrollPending,
          tone: 'indigo'
        },
        {
          id: 'changes',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesPending,
          tone: 'amber',
          indicator: sc.changesPending > 0 ? { tone: 'amber', label: 'نیازمند اقدام', pulse: true } : undefined
        },
        {
          id: 'all',
          label: 'همه پرسنل',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allTotal,
          tone: 'slate'
        }
      ];
    }
    return this.personnelSubTabsCache;
  }

  readonly personnelModalTabs: TabDef[] = [
    {
      id: 'contract',
      label: 'مزد و قرارداد',
      shortLabel: 'مزد',
      icon: ACCOUNTING_ENTITY_ICONS.payroll
    },
    {
      id: 'insurance',
      label: 'بیمه و شغل',
      shortLabel: 'بیمه',
      icon: ACCOUNTING_ENTITY_ICONS.insurance
    },
    {
      id: 'identity',
      label: 'مشخصات فردی',
      shortLabel: 'فردی',
      icon: ACCOUNTING_ENTITY_ICONS.identity
    },
    {
      id: 'contact',
      label: 'حساب بانکی و شبا',
      shortLabel: 'بانکی',
      icon: ACCOUNTING_ENTITY_ICONS.bankAccounts
    }
  ];

  // انتخاب و تایید گروهی حسابدار (تسک ۹.۷)
  selectedPersonnelIds: Set<number> = new Set();
  isBatchApprovalModalOpen = false;
  batchApprovalNote = '';
  isBatchApproving = false;

  // عناوین و کدهای شغلی استاندارد تامین اجتماعی (تسک ۹.۴)
  jobTitles: string[] = [];
  jobItems: Array<{ title: string; job_codes: string[] }> = [];
  availableJobCodes: string[] = [];

  // مودال جامع احکام مالی و شبا
  isPersonnelModalOpen = false;
  personnelModalTab: 'identity' | 'contract' | 'insurance' | 'contact' = 'contract';
  editingPersonnel: Partial<PersonnelProfile> | null = null;
  accountantNote = '';
  isSavingPersonnel = false;
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  isBankDropdownOpen = false;
  bankSearchQuery = '';
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';

  // مودال تایید مالی با یادداشت اختیاری
  isApprovalModalOpen = false;
  approvalTarget: { id: number; title: string; type: 'personnel' | 'personnel_cr' } | null = null;
  approvalNote = '';
  isApproving = false;

  // مودال علت عودت یا رد (تسک ۹.۶: انتخاب مقصد عودت)
  isRejectModalOpen = false;
  rejectTarget: {
    id: number;
    title: string;
    type: 'personnel' | 'personnel_cr';
    action: 'reject' | 'revision';
  } | null = null;
  rejectReason = '';
  revisionDestination: 'revision_required' | 'pending_supervisor' = 'pending_supervisor';
  isSubmittingReject = false;

  // مودال مقایسه تفاوت‌ها (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: PersonnelChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];

  copiedId: number | null = null;
  copiedFieldKey: string | null = null;

  private routeSub?: Subscription;
  private wsSub?: Subscription;
  private companySub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private ws: WebSocketService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['new', 'payroll', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as AccountantPersonnelSubTab;
      }
      if (params['status_filter'] && ['ALL', 'pending_accountant', 'pending_manager', 'approved', 'revision_required', 'rejected'].includes(params['status_filter'])) {
        this.statusFilter = params['status_filter'] as AccountantPersonnelStatusFilter;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      if (msg && (msg.type_str === 'personnel_updated' || msg.type === 'personnel_updated' || msg.type_str === 'change_request_submitted')) {
        this.fetchData();
      }
    });

    if (this.activeCompanyService) {
      this.companySub = this.activeCompanyService.activeCompany$.subscribe(() => {
        this.loadSections();
      });
    }

    this.loadYearlySettings();
    this.loadSections();
    this.loadJobTitles();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.companySub?.unsubscribe();
    this.estimateSub?.unsubscribe();
  }

  loadYearlySettings(): void {
    this.personnelApi.getYearlySettings(this.fiscalYear).subscribe({
      next: (s) => {
        this.yearlySettings = s;
      },
      error: () => {}
    });
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
              this.fetchData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchData();
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
    this.fetchData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  switchSubTab(tab: string): void {
    if (tab !== 'new' && tab !== 'payroll' && tab !== 'changes' && tab !== 'all') {
      return;
    }
    this.activeSubTab = tab as AccountantPersonnelSubTab;
    this.syncUrlParams();
    this.fetchData();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        status_filter: this.statusFilter !== 'ALL' ? this.statusFilter : null,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery.trim() ? this.searchQuery.trim() : null
      },
      queryParamsHandling: 'merge'
    });
  }

  isDownloadingShebaReport = false;

  downloadMissingPrimaryShebaReport(): void {
    if (this.isDownloadingShebaReport) return;
    this.isDownloadingShebaReport = true;
    this.toast.info('در حال تولید و دریافت فایل اکسل حساب‌های فاقد شبا...');
    this.personnelApi.downloadMissingPrimaryShebaReport().subscribe({
      next: (blob: Blob) => {
        this.isDownloadingShebaReport = false;
        void saveBlob(blob, 'Missing_Primary_Sheba_Report.xlsx');
        this.toast.success('گزارش پرونده‌های فاقد شبا با موفقیت دانلود شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isDownloadingShebaReport = false;
        this.toast.error('خطا در دریافت گزارش اکسل حساب‌های فاقد شبا.');
        this.cdr.detectChanges();
      }
    });
  }

  fetchData(): void {
    this.isLoading = true;
    const baseParams: any = {};
    if (this.selectedSectionId) {
      baseParams.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      baseParams.search = this.searchQuery.trim();
    }

    // ۱. دریافت پرونده‌های جدید پرسنل در انتظار تایید حسابدار
    this.personnelApi.getPersonnelProfiles(baseParams).subscribe({
      next: (res: PersonnelProfile[]) => {
        const allList = res || [];
        this.allPersonnelList = allList;
        this.statusCounters.allTotal = allList.length;
        this.statusCounters.newPending = allList.filter(p => p.approval_status === 'pending_accountant' || p.approval_status === 'supervisor_approved').length;

        if (this.activeSubTab === 'new') {
          this.personnelItems = allList.filter(p => p.approval_status === 'pending_accountant' || p.approval_status === 'supervisor_approved');
        } else if (this.statusFilter !== 'ALL') {
          this.personnelItems = allList.filter(p => p.approval_status === this.statusFilter);
        } else {
          this.personnelItems = allList;
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });

    // ۲. دریافت اطلاعات حقوق و دستمزد
    this.personnelApi.getMonthlyPayrollRecords({ ...baseParams, year_month: `${this.fiscalYear}/04` }).subscribe({
      next: (payList: any[]) => {
        this.payrollRecords = payList || [];
        this.statusCounters.payrollPending = this.payrollRecords.filter(r => r.finance_approved === false || r.status === 'pending').length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.payrollRecords = [];
      }
    });

    // ۳. دریافت درخواست‌های تغییرات پرسنل
    this.personnelApi.getPersonnelChangeRequests(baseParams).subscribe({
      next: (crList: PersonnelChangeRequest[]) => {
        this.changeRequests = (crList || []).filter(cr => cr.status === 'pending_accountant' || cr.status === 'pending_finance' || cr.status === 'supervisor_approved');
        this.statusCounters.changesPending = this.changeRequests.length;
        this.cdr.detectChanges();
      },
      error: () => {
        this.changeRequests = [];
      }
    });
  }

  // ─── اکشن‌های تایید مالی ۳ مرحله‌ای ───
  approvePersonnelFinance(p: PersonnelProfile, note?: string): void {
    if (!p.id) return;
    const req$ = note ? this.personnelApi.approvePersonnelFinance(p.id, note) : this.personnelApi.approvePersonnelFinance(p.id);
    req$.subscribe({
      next: (res) => {
        this.toast.showSuccess(res.message || `تایید مالی پرسنل «${p.first_name || ''} ${p.last_name || ''}» صادر و پرونده جهت تصویب نهایی به مدیر ارسال شد.`);
        this.fetchData();
      },
      error: (err) => {
        this.toast.showError(err?.error?.error || 'خطا در تایید مالی پرسنل');
      }
    });
  }

  /** تایید مالی درخواست تغییرات پرسنل و ارسال به مدیر (منتقل‌شده از کارتابل مالی قدیمی) */
  approveChangeRequestFinance(cr: PersonnelChangeRequest, note?: string): void {
    if (!cr.id) return;
    const req$ = note
      ? this.personnelApi.approvePersonnelChangeRequestFinance(cr.id, note)
      : this.personnelApi.approvePersonnelChangeRequestFinance(cr.id);
    req$.subscribe({
      next: (res) => {
        this.toast.showSuccess(res?.message || 'تایید مالی ثبت و درخواست تغییرات جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.closeDiffModal();
        this.fetchData();
      },
      error: (err) => {
        this.toast.showError(err?.error?.error || 'خطا در تایید مالی درخواست تغییرات');
      }
    });
  }

  // ─── مودال تایید مالی با یادداشت اختیاری ───
  private readonly approvalFocus = new ModalFocus();

  openApprovalModal(id: number | undefined, title: string, type: 'personnel' | 'personnel_cr'): void {
    if (!id) return;
    this.approvalTarget = { id, title, type };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
    this.cdr.detectChanges();
    this.approvalFocus.open('acc-personnel-approve-dialog');
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
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.isApprovalModalOpen) this.approvalFocus.trapTab(event, 'acc-personnel-approve-dialog');
  }

  confirmApproval(): void {
    if (!this.approvalTarget || this.isApproving) return;
    const { id, type } = this.approvalTarget;
    const note = this.approvalNote.trim() || undefined;
    this.isApproving = true;
    const req$ = type === 'personnel'
      ? (note ? this.personnelApi.approvePersonnelFinance(id, note) : this.personnelApi.approvePersonnelFinance(id))
      : (note ? this.personnelApi.approvePersonnelChangeRequestFinance(id, note) : this.personnelApi.approvePersonnelChangeRequestFinance(id));
    req$.subscribe({
      next: (res: any) => {
        this.isApproving = false;
        this.toast.showSuccess(res?.message || 'تایید مالی ثبت و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.closeApprovalModal();
        this.closeDiffModal();
        this.fetchData();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.showError(err?.error?.error || 'خطا در ثبت تایید مالی');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ارجاع به بازنگری یا رد پرونده (تسک ۹.۶) ───
  openRejectModal(id: number, title: string, type: 'personnel' | 'personnel_cr', action: 'reject' | 'revision'): void {
    this.rejectTarget = { id, title, type, action };
    this.rejectReason = '';
    this.revisionDestination = 'pending_supervisor';
    this.isRejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.rejectTarget = null;
    this.rejectReason = '';
    this.revisionDestination = 'pending_supervisor';
  }

  submitRejectModal(): void {
    if (!this.rejectTarget || !this.rejectReason.trim()) {
      this.toast.showWarning('لطفاً علت رد یا عودت پرونده را به صورت کامل و مستند وارد نمایید.');
      return;
    }

    this.isSubmittingReject = true;
    const { id, type, action } = this.rejectTarget;
    const reason = this.rejectReason.trim();

    let obs: Observable<any>;
    if (type === 'personnel') {
      obs = action === 'reject'
        ? this.personnelApi.rejectPersonnel(id, reason)
        : this.personnelApi.requestPersonnelRevision(id, reason, this.revisionDestination);
    } else {
      obs = this.personnelApi.rejectPersonnelChangeRequest(id, reason);
    }

    obs.subscribe({
      next: (res) => {
        this.isSubmittingReject = false;
        this.toast.showSuccess(res.message || 'عملیات با موفقیت انجام شد.');
        this.closeRejectModal();
        this.fetchData();
      },
      error: (err) => {
        this.isSubmittingReject = false;
        this.toast.showError(err?.error?.error || 'خطا در انجام عملیات');
      }
    });
  }

  // ─── استعلام عناوین شغلی و کدهای ۶ رقمی بیمه (تسک ۹.۴) ───
  loadJobTitles(): void {
    if (!this.personnelApi?.getJobTitles) return;
    this.personnelApi.getJobTitles().subscribe({
      next: (res) => {
        if (res?.job_titles && Array.isArray(res.job_titles)) {
          this.jobTitles = res.job_titles;
        }
        if (res?.items && Array.isArray(res.items)) {
          this.jobItems = res.items;
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onJobTitleSelect(title: string): void {
    if (!this.editingPersonnel) return;
    this.editingPersonnel.job_title = title;
    const match = this.jobItems.find(j => j.title === title.trim());
    if (match && match.job_codes?.length) {
      this.availableJobCodes = match.job_codes;
      if (!this.editingPersonnel.job_code || !match.job_codes.includes(this.editingPersonnel.job_code)) {
        this.editingPersonnel.job_code = match.job_codes[0];
      }
    } else {
      this.availableJobCodes = [];
    }
    this.cdr.detectChanges();
  }

  onJobTitleInput(event: any): void {
    if (!this.editingPersonnel) return;
    const title = typeof event === 'string' ? event : (event?.target?.value || '');
    this.editingPersonnel.job_title = title;
    const match = this.jobItems.find(j => j.title === title.trim());
    if (match && match.job_codes?.length) {
      this.availableJobCodes = match.job_codes;
      if (!this.editingPersonnel.job_code || !match.job_codes.includes(this.editingPersonnel.job_code)) {
        this.editingPersonnel.job_code = match.job_codes[0];
      }
    } else {
      this.availableJobCodes = [];
    }
    this.cdr.detectChanges();
  }

  selectJobCode(code: string): void {
    if (!this.editingPersonnel) return;
    this.editingPersonnel.job_code = code;
    this.cdr.detectChanges();
  }

  // ─── گیت سروری و امکان ارسال به مدیر (تسک ۹.۵) ───
  canSendToManager(p: PersonnelProfile): boolean {
    if (!p) return false;
    const hasSheba = !!(p.sheba_number && p.sheba_number.length >= 24);
    const jcode = p.job_code ? String(p.job_code).trim() : '';
    const hasJobCode = jcode.length === 6 && /^\d{6}$/.test(jcode);
    const hasInsurance = !!(p.insurance_number || p.insurance_name);
    const dwage = Number(p.daily_base_wage || 0);
    const msalary = Number(p.contract_base_salary || 0);
    const hasWage = dwage > 0 || msalary > 0;

    if (p.missing_fields && Array.isArray(p.missing_fields) && p.missing_fields.length > 0) {
      const accountantCritical = ['job_code', 'wage_or_salary', 'primary_bank_account', 'insurance_name'];
      const hasCritMissing = p.missing_fields.some((m: any) => {
        const field = typeof m === 'string' ? m : m.field;
        return accountantCritical.includes(field);
      });
      if (hasCritMissing) return false;
    }

    return hasSheba && hasJobCode && hasInsurance && hasWage;
  }

  getMissingFieldsSummary(p: PersonnelProfile): string[] {
    const missing: string[] = [];
    if (!p.sheba_number || p.sheba_number.length < 24) missing.push('شماره شبا (۲۴ رقم)');
    const jcode = p.job_code ? String(p.job_code).trim() : '';
    if (!jcode || jcode.length !== 6 || !/^\d{6}$/.test(jcode)) missing.push('کد ۶ رقمی شغل تامین اجتماعی');
    if (!p.insurance_number && !p.insurance_name) missing.push('شماره یا عنوان بیمه');
    const dwage = Number(p.daily_base_wage || 0);
    const msalary = Number(p.contract_base_salary || 0);
    if (dwage <= 0 && msalary <= 0) missing.push('مزد روزانه یا حقوق ماهانه');
    return missing;
  }

  // ─── تایید گروهی حسابدار (تسک ۹.۷) ───
  toggleSelectAll(): void {
    const eligibleItems = this.personnelItems.filter(p => this.canSendToManager(p) && p.id);
    if (this.selectedPersonnelIds.size === eligibleItems.length && eligibleItems.length > 0) {
      this.selectedPersonnelIds.clear();
    } else {
      this.selectedPersonnelIds.clear();
      eligibleItems.forEach(p => {
        if (p.id) this.selectedPersonnelIds.add(p.id);
      });
    }
    this.cdr.detectChanges();
  }

  toggleSelection(id: number | undefined): void {
    if (!id) return;
    if (this.selectedPersonnelIds.has(id)) {
      this.selectedPersonnelIds.delete(id);
    } else {
      this.selectedPersonnelIds.add(id);
    }
    this.cdr.detectChanges();
  }

  isSelected(id: number | undefined): boolean {
    return id ? this.selectedPersonnelIds.has(id) : false;
  }

  isAllSelected(): boolean {
    const eligibleItems = this.personnelItems.filter(p => this.canSendToManager(p) && p.id);
    return eligibleItems.length > 0 && this.selectedPersonnelIds.size === eligibleItems.length;
  }

  selectedCount(): number {
    return this.selectedPersonnelIds.size;
  }

  openBatchApprovalModal(): void {
    if (this.selectedPersonnelIds.size === 0) {
      this.toast.showWarning('هیچ رکوردی برای تایید گروهی انتخاب نشده است.');
      return;
    }
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
    const ids = Array.from(this.selectedPersonnelIds);
    if (ids.length === 0 || this.isBatchApproving) return;

    this.isBatchApproving = true;
    const note = this.batchApprovalNote.trim() || undefined;

    this.personnelApi.batchApprovePersonnel(ids, 'finance', note).subscribe({
      next: (res) => {
        this.isBatchApproving = false;
        const successes = res?.results?.filter(r => r.success)?.length || 0;
        const failures = res?.results?.filter(r => !r.success)?.length || 0;

        if (failures === 0) {
          this.toast.showSuccess(`تایید مالی هر ${successes} پرونده انتخاب‌شده با موفقیت ثبت و به مدیر ارسال شد.`);
        } else {
          this.toast.showWarning(`تایید مالی ${successes} پرونده ثبت شد؛ ${failures} پرونده با خطا مواجه شد.`);
        }

        this.selectedPersonnelIds.clear();
        this.closeBatchApprovalModal();
        this.fetchData();
      },
      error: (err) => {
        this.isBatchApproving = false;
        this.toast.showError(err?.error?.error || 'خطا در پردازش تایید گروهی حسابداری');
        this.cdr.detectChanges();
      }
    });
  }

  // ─── مودال جامع ویرایش و تکمیل مدارک مالی پرسنل (تسک‌های ۹.۲، ۹.۳، ۹.۴) ───
  // فیلدهای قابل‌ویرایش حسابدار؛ ذخیره فقط تغییرات همین‌ها را نسبت به پروندهٔ سرور می‌فرستد (DEF-08)
  private static readonly ACCOUNTANT_EDITABLE_FIELDS = [
    'first_name', 'last_name', 'national_code', 'father_name', 'birth_date', 'id_number', 'phone_number',
    'job_title', 'job_code', 'job_grade', 'contract_type', 'contract_hours', 'contract_base_salary',
    'base_years_experience', 'daily_base_wage', 'daily_seniority_bonus', 'insurance_type', 'insurance_name',
    'insurance_number', 'status_category', 'employment_type', 'housing_allowance', 'food_allowance',
    'spouse_allowance', 'children_count', 'bank_name', 'account_number', 'sheba_number', 'card_number'
  ];
  private static readonly ACCOUNTANT_NUMERIC_FIELDS = new Set([
    'contract_hours', 'contract_base_salary', 'base_years_experience', 'daily_base_wage', 'daily_seniority_bonus',
    'housing_allowance', 'food_allowance', 'spouse_allowance', 'children_count'
  ]);
  private originalEditingPersonnel: PersonnelProfile | null = null;

  // ─── ماشین‌حساب زنده با برآورد سروری همان موتور حقوق (DEF-05) ───
  costEstimate: PersonnelCostEstimate | null = null;
  isEstimatingCost = false;
  private estimateTrigger$ = new Subject<void>();
  private estimateSub = this.estimateTrigger$.pipe(
    debounceTime(400),
    switchMap(() => {
      const p = this.editingPersonnel;
      if (!p?.id) return of(null);
      this.isEstimatingCost = true;
      return this.personnelApi.getPersonnelCostEstimate(p.id, {
        job_grade: p.job_grade,
        daily_base_wage: p.daily_base_wage,
        daily_seniority_bonus: p.daily_seniority_bonus,
        base_years_experience: p.base_years_experience,
        contract_hours: p.contract_hours,
        contract_base_salary: p.contract_base_salary,
        marital_status: p.marital_status,
        children_count: p.children_count,
        include_in_insurance: p.include_in_insurance
      }).pipe(catchError(() => of(null)));
    })
  ).subscribe(res => {
    this.costEstimate = res;
    this.isEstimatingCost = false;
    this.cdr.detectChanges();
  });

  openEditPersonnelModal(p: PersonnelProfile): void {
    this.personnelModalTab = 'contract'; // باز شدن مستقیم روی تب احکام مزد و قرارداد
    this.accountantNote = '';
    this.originalEditingPersonnel = { ...p };
    this.costEstimate = null;
    this.editingPersonnel = {
      ...p,
      contract_type: p.contract_type || 'daily',
      job_grade: p.job_grade || '19',
      job_title: p.job_title || '',
      job_code: p.job_code || '',
      contract_hours: p.contract_hours || 220,
      contract_base_salary: p.contract_base_salary || 0,
      base_years_experience: p.base_years_experience || 0,
      daily_base_wage: Number(p.daily_base_wage) || 6572696,
      daily_seniority_bonus: Number(p.daily_seniority_bonus) || 171867,
      base_daily_rate: Number(p.base_daily_rate) || 6572696,
      hourly_rate: Number(p.hourly_rate) || 657270,
      insurance_type: p.insurance_type || '2',
      insurance_name: p.insurance_name || 'تامین اجتماعی',
      status_category: p.status_category || 'نفرات شرکتی',
      employment_type: p.employment_type || '2',
      housing_allowance: Number(p.housing_allowance) || Number(this.yearlySettings?.monthly_housing_allowance) || 30000000,
      food_allowance: Number(p.food_allowance) || Number(this.yearlySettings?.monthly_food_allowance) || 22000000,
      // حق تأهل فقط برای متأهل (DEF-05)
      spouse_allowance: Number(p.spouse_allowance) || (p.marital_status === 'married' ? (Number(this.yearlySettings?.monthly_spouse_allowance) || 5000000) : 0),
      children_count: p.children_count || 0
    };

    if (p.sheba_number) {
      const clean = cleanShebaInput(p.sheba_number);
      this.shebaValidationResult = validateSheba(clean);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || clean;
    } else {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
    }

    if (this.editingPersonnel.job_title) {
      const match = this.jobItems.find(j => j.title === this.editingPersonnel?.job_title?.trim());
      this.availableJobCodes = match?.job_codes || [];
    } else {
      this.availableJobCodes = [];
    }

    this.recalculatePersonnelRates();
    this.isPersonnelModalOpen = true;
    this.cdr.detectChanges();
  }

  closePersonnelModal(): void {
    this.isPersonnelModalOpen = false;
    this.editingPersonnel = null;
    this.accountantNote = '';
    this.cdr.detectChanges();
  }

  setPersonnelTab(tab: string): void {
    if (tab === 'identity' || tab === 'contract' || tab === 'insurance' || tab === 'contact') {
      this.personnelModalTab = tab;
      this.cdr.detectChanges();
    }
  }

  recalculatePersonnelRates(): void {
    if (!this.editingPersonnel) return;
    const daily = Number(this.editingPersonnel.daily_base_wage || 0);
    const seniority = Number(this.editingPersonnel.daily_seniority_bonus || 0);
    const years = Number(this.editingPersonnel.base_years_experience || 0);
    const baseDaily = daily + (years * seniority);
    this.editingPersonnel.base_daily_rate = baseDaily;
    this.editingPersonnel.hourly_rate = Math.round(baseDaily / 10);
    this.estimateTrigger$.next();
    this.cdr.detectChanges();
  }

  /** نرخ ساعتی واقعی = حقوق قرارداد ÷ ساعت قرارداد؛ بی‌حقوق قرارداد تهی است و به «مبنا ÷ ۱۰» برنمی‌گردد (DEF-05) */
  get realHourlyRate(): number | null {
    return this.costEstimate?.real_hourly_rate ?? null;
  }

  /** برآورد ناخالص یک ماه کامل از موتور حقوق سرور */
  get estimatedGrossSalary(): number | null {
    return this.costEstimate ? this.costEstimate.gross_salary : null;
  }

  /** پایهٔ بیمه شامل همهٔ مزایای مشمول (از جمله حق تأهل) با سقف قانونی، از موتور حقوق سرور */
  get estimatedInsuranceBase(): number | null {
    return this.costEstimate ? this.costEstimate.total_insurable_salary_allowances : null;
  }

  onJobGradeChange(grade: string): void {
    if (!grade || !this.editingPersonnel) return;
    this.personnelApi.getJobGradeRate(grade, this.fiscalYear).subscribe({
      next: (res) => {
        if (this.editingPersonnel) {
          this.editingPersonnel.daily_base_wage = res.daily_base_wage;
          this.editingPersonnel.daily_seniority_bonus = res.daily_seniority_bonus;
          const years = Number(this.editingPersonnel.base_years_experience || 0);
          this.editingPersonnel.base_daily_rate = res.daily_base_wage + (years * res.daily_seniority_bonus);
          this.editingPersonnel.hourly_rate = res.hourly_rate;
          this.estimateTrigger$.next();
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.recalculatePersonnelRates();
      }
    });
  }

  onShebaInput(event: any): void {
    const raw = typeof event === 'string' ? event : (event?.target?.value || '');
    const clean = cleanShebaInput(raw);
    this.shebaValidationResult = validateSheba(clean);
    this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || clean;
    if (this.editingPersonnel) {
      this.editingPersonnel.sheba_number = this.shebaValidationResult.rawSheba || clean;
      if (this.shebaValidationResult.bank && !this.editingPersonnel.bank_name) {
        this.editingPersonnel.bank_name = this.shebaValidationResult.bank.name;
      }
      if (this.shebaValidationResult.accountNumber && !this.editingPersonnel.account_number) {
        this.editingPersonnel.account_number = this.shebaValidationResult.accountNumber;
      }
    }
    this.cdr.detectChanges();
  }

  convertAccountToShebaNow(): void {
    if (!this.editingPersonnel?.account_number || !this.editingPersonnel?.bank_name) {
      this.toast.showWarning('برای ساخت شماره شبا، شماره حساب و نام بانک الزامی است.');
      return;
    }
    const bank = getBankByName(this.editingPersonnel.bank_name);
    if (!bank) {
      this.toast.showError('اطلاعات بانک انتخابی برای الگوریتم شبا معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(bank.code, this.editingPersonnel.account_number);
    if (generated) {
      this.editingPersonnel.sheba_number = generated;
      this.shebaValidationResult = validateSheba(generated);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || generated;
      this.toast.showSuccess('شماره شبا با الگوریتم ISO 7064 Mod 97 با موفقیت تولید شد.');
      this.cdr.detectChanges();
    } else {
      this.toast.showError('خطا در تولید شماره شبا از روی شماره حساب.');
    }
  }

  private normalizeAccountantValue(field: string, value: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (field === 'sheba_number') return cleanShebaInput(String(value));
    if (AccountantPersonnelHubComponent.ACCOUNTANT_NUMERIC_FIELDS.has(field)) {
      const n = Number(value);
      return Number.isFinite(n) ? String(n) : String(value).trim();
    }
    return String(value).trim();
  }

  /**
   * فقط فیلدهای حسابدار که با مقدار پروندهٔ سرور فرق دارند (DEF-08). پیش‌فرض‌هایی که حسابدار در فرم می‌بیند
   * و تأیید می‌کند هم تغییر حساب می‌شوند؛ ولی attachment، حساب‌های تودرتو و فیلدهای فقط‌خواندنی هرگز فرستاده نمی‌شوند.
   */
  private buildAccountantChanges(): Record<string, any> {
    const edited: any = this.editingPersonnel || {};
    const original: any = this.originalEditingPersonnel || {};
    const changes: Record<string, any> = {};
    for (const field of AccountantPersonnelHubComponent.ACCOUNTANT_EDITABLE_FIELDS) {
      if (!(field in edited)) continue;
      if (this.normalizeAccountantValue(field, edited[field]) !== this.normalizeAccountantValue(field, original[field])) {
        changes[field] = field === 'sheba_number' && edited[field] ? cleanShebaInput(String(edited[field])) : edited[field];
      }
    }
    return changes;
  }

  savePersonnelFinancialChanges(): void {
    if (!this.editingPersonnel?.id) return;
    const changes = this.buildAccountantChanges();
    if (!Object.keys(changes).length) {
      this.toast.showInfo('تغییری نسبت به پروندهٔ فعلی برای ذخیره وجود ندارد.');
      return;
    }
    this.isSavingPersonnel = true;

    const payload: Record<string, any> = {
      ...changes,
      note: this.accountantNote.trim() || undefined
    };

    this.personnelApi.updatePersonnelProfile(this.editingPersonnel.id, payload).subscribe({
      next: (res: any) => {
        this.isSavingPersonnel = false;
        if (res?._offlinePending) {
          this.toast.showWarning(`تغییرات «${this.editingPersonnel?.first_name} ${this.editingPersonnel?.last_name}» در صف آفلاین ثبت شد و پس از اتصال ذخیره می‌شود.`);
        } else {
          this.toast.showSuccess(`احکام مالی و مدارک «${this.editingPersonnel?.first_name} ${this.editingPersonnel?.last_name}» ذخیره شد.`);
        }
        this.closePersonnelModal();
        this.fetchData();
      },
      error: (err) => {
        this.isSavingPersonnel = false;
        const e = err?.error;
        const fieldMsg = e && typeof e === 'object' && !e.error && !e.detail
          ? Object.entries(e).map(([k, v]) => `${this.getFieldLabel(k)}: ${Array.isArray(v) ? v[0] : v}`)[0]
          : null;
        this.toast.showError(e?.error || e?.detail || fieldMsg || 'خطا در ذخیره احکام مالی پرسنل');
      }
    });
  }

  // ─── مقایسه تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: PersonnelChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    const proposed = (cr.proposed_changes || {}) as Record<string, any>;
    const current = (cr.previous_values || {}) as Record<string, any>;

    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)]));
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'personnel'].includes(key)) continue;
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
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      mobile: 'شماره موبایل',
      phone_number: 'شماره همراه',
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      contract_type: 'نوع قرارداد',
      job_title: 'عنوان شغلی',
      job_code: 'کد ۶ رقمی شغل بیمه',
      insurance_number: 'شماره بیمه',
      daily_base_wage: 'مزد مبنای روزانه',
      job_grade: 'گروه شغلی'
    };
    return dict[field] || field;
  }

  copyField(value: string | undefined | null, key: string, label: string = 'مقدار'): void {
    if (!value) return;
    this.copiedFieldKey = key;
    this.toast.showSuccess(`${label} در حافظه کپی شد: ${value}`);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    setTimeout(() => {
      if (this.copiedFieldKey === key) {
        this.copiedFieldKey = null;
        this.cdr.markForCheck();
      }
    }, 2000);
  }

  isFieldCopied(key: string): boolean {
    return this.copiedFieldKey === key;
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
