import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, of } from 'rxjs';
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
  PersonnelCostEstimate,
  PersonnelWorkflowError,
  isMaskedValue,
  isMaskedSensitive
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
    ActionButtonComponent,
    RouterLink
  ],
  templateUrl: './accountant-personnel.html',
  styleUrl: './accountant-personnel.css'
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
  // صفحه‌بندی سمت سرور (۴.۳-ج): فهرست‌ها فقط‌خواندنی‌اند؛ تایید/عودت/رد در «کارهای من» انجام می‌شود
  readonly pageSize = 20;
  personnelPage = 1;
  personnelCount = 0;
  changesPage = 1;
  changesCount = 0;
  loadError = false;
  readonly isMasked = isMaskedValue;
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
      // ق۴: رویداد همین زبانه یا شرکت دیگر نادیده گرفته می‌شود
      if (this.ws.skipLiveEvent?.(msg)) return;
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
    this.personnelPage = 1;
    this.changesPage = 1;
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  switchSubTab(tab: string): void {
    if (tab !== 'new' && tab !== 'payroll' && tab !== 'changes' && tab !== 'all') {
      return;
    }
    this.activeSubTab = tab as AccountantPersonnelSubTab;
    this.personnelPage = 1;
    this.changesPage = 1;
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
    this.loadError = false;
    const baseParams: any = {};
    if (this.selectedSectionId) {
      baseParams.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      baseParams.search = this.searchQuery.trim();
    }
    const pendingStatuses = 'pending_accountant,supervisor_approved';

    // ۱. پرونده‌های پرسنل (صفحه‌ای): زبانهٔ «احکام» فقط در انتظار حسابدار، «همه» بدون فیلتر
    const pParams: any = { ...baseParams, page: this.personnelPage, page_size: this.pageSize };
    if (this.activeSubTab === 'new') {
      pParams.approval_status = pendingStatuses;
    } else if (this.statusFilter !== 'ALL') {
      pParams.approval_status = this.statusFilter;
    }
    this.personnelApi.getPersonnelProfilesPage(pParams).subscribe({
      next: (res) => {
        this.personnelItems = res?.results || [];
        this.personnelCount = res?.count ?? this.personnelItems.length;
        if (this.activeSubTab === 'new') this.statusCounters.newPending = this.personnelCount;
        if (this.activeSubTab === 'all' && this.statusFilter === 'ALL') this.statusCounters.allTotal = this.personnelCount;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err?.status === 404 && this.personnelPage > 1) {
          this.personnelPage = 1;
          this.fetchData();
          return;
        }
        this.loadError = true;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
    // شمارنده‌های زبانه‌ها (فقط تعداد)
    if (this.activeSubTab !== 'new') {
      this.personnelApi.getPersonnelProfilesPage({ ...baseParams, page: 1, page_size: 1, approval_status: pendingStatuses }).subscribe({
        next: (res) => { this.statusCounters.newPending = res?.count ?? 0; this.cdr.detectChanges(); },
        error: () => {}
      });
    }
    if (this.activeSubTab !== 'all' || this.statusFilter !== 'ALL') {
      this.personnelApi.getPersonnelProfilesPage({ ...baseParams, page: 1, page_size: 1 }).subscribe({
        next: (res) => { this.statusCounters.allTotal = res?.count ?? 0; this.cdr.detectChanges(); },
        error: () => {}
      });
    }

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

    // ۳. درخواست‌های تغییر پرسنل (صفحه‌ای، فقط‌خواندنی)
    const crParams: any = { ...baseParams, page: this.changesPage, page_size: this.pageSize, status: 'pending_accountant' };
    this.personnelApi.getPersonnelChangeRequestsPage(crParams).subscribe({
      next: (res) => {
        this.changeRequests = res?.results || [];
        this.changesCount = res?.count ?? this.changeRequests.length;
        this.statusCounters.changesPending = this.changesCount;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err?.status === 404 && this.changesPage > 1) {
          this.changesPage = 1;
          this.fetchData();
          return;
        }
        this.changeRequests = [];
      }
    });
  }

  get personnelTotalPages(): number { return Math.max(1, Math.ceil(this.personnelCount / this.pageSize)); }
  get changesTotalPages(): number { return Math.max(1, Math.ceil(this.changesCount / this.pageSize)); }

  goToPersonnelPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.personnelTotalPages);
    if (next === this.personnelPage) return;
    this.personnelPage = next;
    this.fetchData();
  }

  goToChangesPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.changesTotalPages);
    if (next === this.changesPage) return;
    this.changesPage = next;
    this.fetchData();
  }

  onSearchChanged(): void {
    this.personnelPage = 1;
    this.changesPage = 1;
    this.fetchData();
  }

  /** خطای فارسی از بدنهٔ پاسخ سرور (کدهای گردش کار) */
  workflowErrorText(err: any, fallback: string): string {
    const body: PersonnelWorkflowError = err?.error || {};
    if (body.code === 'wrong_step') return 'این کار در مرحلهٔ دیگری است؛ از کارهای من پیگیری کنید';
    let msg = body.error || body.detail || fallback;
    if (body.code === 'action_blocked' && body.missing_fields?.length) {
      const labels = body.missing_fields.map(m => typeof m === 'string' ? m : (m.label || m.field));
      msg += ': ' + labels.join('، ');
    }
    return msg;
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

  // ─── مودال جامع ویرایش و تکمیل مدارک مالی پرسنل (تسک‌های ۹.۲، ۹.۳، ۹.۴) ───
  // فیلدهای قابل‌ویرایش حسابدار؛ ذخیره فقط تغییرات همین‌ها را نسبت به پروندهٔ سرور می‌فرستد (DEF-08)
  private static readonly ACCOUNTANT_EDITABLE_FIELDS = [
    'first_name', 'last_name', 'national_code', 'father_name', 'birth_date', 'id_number', 'phone_number',
    'job_title', 'job_code', 'job_grade', 'contract_type', 'start_date', 'contract_hours', 'contract_base_salary',
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
      contract_type: p.contract_type || 'daily', start_date: p.start_date || `${this.fiscalYear}/01/01`,
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
      if (isMaskedSensitive(field, edited[field])) continue; // مقدار پوشیدهٔ سرور هرگز پس فرستاده نمی‌شود (ق۱۶)
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
        this.toast.showError(this.workflowErrorText(err, fieldMsg || 'خطا در ذخیره احکام مالی پرسنل'));
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
      contract_type: 'نوع قرارداد', start_date: 'تاریخ شروع به کار',
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
