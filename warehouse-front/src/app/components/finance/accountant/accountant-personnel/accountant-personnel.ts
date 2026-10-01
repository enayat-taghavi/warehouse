import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import {
  ProjectSection,
  PersonnelProfile,
  PersonnelChangeRequest,
  PayrollYearlySettings
} from '../../../../core/models/personnel.model';
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
} from '../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ModalFocus } from '../../../../core/utils/modal-focus';

export type AccountantPersonnelSubTab = 'new' | 'payroll' | 'changes' | 'all';
export type AccountantPersonnelStatusFilter = 'ALL' | 'pending_accountant' | 'pending_manager' | 'approved' | 'revision_required' | 'rejected';

@Component({
  selector: 'app-accountant-personnel-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
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

  // مودال جامع احکام مالی و شبا
  isPersonnelModalOpen = false;
  personnelModalTab: 'identity' | 'contract' | 'insurance' | 'contact' = 'contract';
  editingPersonnel: Partial<PersonnelProfile> | null = null;
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

  // مودال علت عودت به بازنگری یا رد
  isRejectModalOpen = false;
  rejectTarget: {
    id: number;
    title: string;
    type: 'personnel' | 'personnel_cr';
    action: 'reject' | 'revision';
  } | null = null;
  rejectReason = '';
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
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.companySub?.unsubscribe();
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

  switchSubTab(tab: AccountantPersonnelSubTab): void {
    this.activeSubTab = tab;
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

  // ─── ارجاع به بازنگری یا رد پرونده ───
  openRejectModal(id: number, title: string, type: 'personnel' | 'personnel_cr', action: 'reject' | 'revision'): void {
    this.rejectTarget = { id, title, type, action };
    this.rejectReason = '';
    this.isRejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.rejectTarget = null;
    this.rejectReason = '';
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
      obs = action === 'reject' ? this.personnelApi.rejectPersonnel(id, reason) : this.personnelApi.requestPersonnelRevision(id, reason);
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

  // ─── مودال جامع ویرایش و تکمیل مدارک مالی پرسنل ───
  openEditPersonnelModal(p: PersonnelProfile): void {
    this.personnelModalTab = 'contract'; // باز شدن مستقیم روی تب احکام مزد و قرارداد
    this.editingPersonnel = {
      ...p,
      contract_type: p.contract_type || 'daily',
      job_grade: p.job_grade || '19',
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
      spouse_allowance: Number(p.spouse_allowance) || Number(this.yearlySettings?.monthly_spouse_allowance) || 5000000,
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

    this.recalculatePersonnelRates();
    this.isPersonnelModalOpen = true;
    this.cdr.detectChanges();
  }

  closePersonnelModal(): void {
    this.isPersonnelModalOpen = false;
    this.editingPersonnel = null;
    this.cdr.detectChanges();
  }

  setPersonnelTab(tab: 'identity' | 'contract' | 'insurance' | 'contact'): void {
    this.personnelModalTab = tab;
    this.cdr.detectChanges();
  }

  recalculatePersonnelRates(): void {
    if (!this.editingPersonnel) return;
    const daily = Number(this.editingPersonnel.daily_base_wage || 0);
    const seniority = Number(this.editingPersonnel.daily_seniority_bonus || 0);
    const years = Number(this.editingPersonnel.base_years_experience || 0);
    const baseDaily = daily + (years * seniority);
    this.editingPersonnel.base_daily_rate = baseDaily;
    this.editingPersonnel.hourly_rate = Math.round(baseDaily / 10);
    this.cdr.detectChanges();
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

  savePersonnelFinancialChanges(): void {
    if (!this.editingPersonnel?.id) return;
    this.isSavingPersonnel = true;

    this.personnelApi.updatePersonnelProfile(this.editingPersonnel.id, this.editingPersonnel).subscribe({
      next: () => {
        this.isSavingPersonnel = false;
        this.toast.showSuccess(`احکام مالی و مدارک «${this.editingPersonnel?.first_name} ${this.editingPersonnel?.last_name}» ذخیره شد.`);
        this.closePersonnelModal();
        this.fetchData();
      },
      error: (err) => {
        this.isSavingPersonnel = false;
        this.toast.showError(err?.error?.error || 'خطا در ذخیره احکام مالی پرسنل');
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
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      contract_type: 'نوع قرارداد',
      job_title: 'عنوان شغلی',
      insurance_number: 'شماره بیمه',
      daily_base_wage: 'مزد مبنای روزانه',
      job_grade: 'گروه شغلی'
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
