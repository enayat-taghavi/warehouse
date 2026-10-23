import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import {
  ProjectSection,
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  PayrollYearlySettings
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

import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type AccountantSubTab = 'personnel' | 'vehicles' | 'change_requests' | 'all';
export type AccountantStatusFilter = 'ALL' | 'pending_accountant' | 'pending_manager' | 'approved' | 'revision_required' | 'rejected' | 'draft';

@Component({
  selector: 'app-accountant-new-profiles-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
  ],
  templateUrl: './accountant-new-profiles.html',
  styleUrl: './accountant-new-profiles.css'
})
export class AccountantNewProfilesHubComponent implements OnInit, OnDestroy {
  // ─── مدیریت تب‌ها و فیلترهای بالا ───
  activeSubTab: AccountantSubTab = 'personnel';
  statusFilter: AccountantStatusFilter = 'ALL';
  changeRequestSubTab: 'personnel' | 'vehicles' = 'personnel';
  searchQuery = '';
  fiscalYear = '1405';

  // ─── مدیریت بخش و ایزولاسیون قلمرو ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // ─── وضعیت بارگذاری و لیست‌ها ───
  isLoading = false;
  personnelItems: PersonnelProfile[] = [];
  vehicleItems: VehicleDriverProfile[] = [];
  personnelChangeRequests: PersonnelChangeRequest[] = [];
  vehicleChangeRequests: VehicleChangeRequest[] = [];
  yearlySettings: PayrollYearlySettings | null = null;

  // ─── شمارنده‌های زنده در انتظار تایید حسابدار ───
  statusCounters = {
    personnelPending: 0,
    personnelTotal: 0,
    vehiclesPending: 0,
    vehiclesTotal: 0,
    changeRequestsPending: 0,
    changeRequestsTotal: 0,
    allPending: 0,
    allTotal: 0
  };

  // ─── مودال جامع ویرایش و احکام مالی پرسنل ───
  isPersonnelModalOpen = false;
  personnelModalTab: 'identity' | 'contract' | 'insurance' | 'contact' = 'contract';
  editingPersonnel: Partial<PersonnelProfile> | null = null;
  isSavingPersonnel = false;
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  isBankDropdownOpen = false;
  bankSearchQuery = '';
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';

  // ─── مودال ثبت علت عودت به بازنگری یا رد ───
  isRejectModalOpen = false;
  rejectTarget: {
    id: number;
    title: string;
    type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr';
    action: 'reject' | 'revision';
  } | null = null;
  rejectReason = '';
  isSubmittingReject = false;

  // ─── مودال مقایسه تفاوت‌ها (Diff Viewer) ───
  isDiffModalOpen = false;
  selectedDiffCR: any = null;
  selectedDiffType: 'personnel' | 'vehicle' = 'personnel';
  diffRows: Array<{ label: string; key: string; oldValue: any; newValue: any; isDiff: boolean }> = [];

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
    @Optional() public activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['personnel', 'vehicles', 'change_requests', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['status_filter'] && ['ALL', 'pending_accountant', 'pending_manager', 'approved', 'revision_required', 'rejected', 'draft'].includes(params['status_filter'])) {
        this.statusFilter = params['status_filter'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      if (msg && (msg.type_str === 'personnel_updated' || msg.type === 'personnel_updated' || msg.type_str === 'vehicle_updated')) {
        if (!this.selectedSectionId || msg.section_id === this.selectedSectionId) {
          this.fetchData();
        }
      }
    });

    if (this.activeCompanyService?.activeCompany$) {
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

  // ─── بارگذاری تنظیمات پایه حقوق سالانه ───
  loadYearlySettings(): void {
    this.personnelApi.getYearlySettings(this.fiscalYear).subscribe({
      next: (s) => {
        this.yearlySettings = s;
      },
      error: () => {}
    });
  }

  // ─── بارگذاری بخش‌های مجاز ───
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

  // ─── نوار تب‌های اصلی (Memoized برای جلوگیری از NG0100) ───
  private subTabsKey = '';
  private subTabsCache: TabDef[] = [];
  get subTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.personnelPending}:${sc.vehiclesPending}:${sc.changeRequestsPending}:${sc.allTotal}`;
    if (key !== this.subTabsKey) {
      this.subTabsKey = key;
      this.subTabsCache = [
        {
          id: 'personnel',
          label: 'پرونده‌های پرسنل',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: sc.personnelPending,
          tone: sc.personnelPending > 0 ? 'amber' : 'slate',
          indicator: sc.personnelPending > 0 ? { tone: 'amber', label: 'پرونده‌های پرسنل در انتظار تایید مالی', pulse: true } : undefined,
        },
        {
          id: 'vehicles',
          label: 'پرونده‌های ناوگان',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: sc.vehiclesPending,
          tone: sc.vehiclesPending > 0 ? 'amber' : 'slate',
          indicator: sc.vehiclesPending > 0 ? { tone: 'amber', label: 'پرونده‌های ناوگان در انتظار تایید مالی', pulse: true } : undefined,
        },
        {
          id: 'change_requests',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changeRequestsPending,
          tone: sc.changeRequestsPending > 0 ? 'amber' : 'slate',
        },
        {
          id: 'all',
          label: 'همه موارد',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allTotal,
          tone: 'slate',
        },
      ];
    }
    return this.subTabsCache;
  }

  // ─── نوار تب درخواست‌های تغییرات (Memoized) ───
  private crTabsKey = '';
  private crTabsCache: TabDef[] = [];
  get changeRequestTabs(): TabDef[] {
    const pCount = this.personnelChangeRequests.length;
    const vCount = this.vehicleChangeRequests.length;
    const key = `${pCount}:${vCount}`;
    if (key !== this.crTabsKey) {
      this.crTabsKey = key;
      this.crTabsCache = [
        {
          id: 'personnel',
          label: 'تغییرات پرسنل',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.personnel,
          count: pCount,
        },
        {
          id: 'vehicles',
          label: 'تغییرات ناوگان',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: vCount,
        },
      ];
    }
    return this.crTabsCache;
  }

  setChangeRequestSubTab(tab: string): void {
    if (tab === 'personnel' || tab === 'vehicles') {
      this.changeRequestSubTab = tab;
      this.cdr.detectChanges();
    }
  }

  switchSubTab(tab: string): void {
    if (tab === 'personnel' || tab === 'vehicles' || tab === 'change_requests' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchData();
    }
  }

  setStatusFilter(filter: AccountantStatusFilter): void {
    this.statusFilter = (this.statusFilter === filter && filter !== 'ALL') ? 'ALL' : filter;
    this.syncUrlParams();
    this.fetchData();
  }

  clearSearch(): void {
    this.searchQuery = '';
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

  // ─── دریافت پرونده‌ها بر اساس بخش و فیلترها ───
  fetchData(): void {
    this.isLoading = true;
    const baseParams: any = {};
    if (this.selectedSectionId) {
      baseParams.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      baseParams.search = this.searchQuery.trim();
    }

    // دریافت پرونده‌های پرسنل
    this.personnelApi.getPersonnelProfiles(baseParams).subscribe({
      next: (res: PersonnelProfile[]) => {
        const allList = res || [];
        this.statusCounters.personnelTotal = allList.length;
        this.statusCounters.personnelPending = allList.filter(p => p.approval_status === 'pending_accountant' || p.approval_status === 'supervisor_approved').length;

        if (this.statusFilter === 'pending_accountant') {
          this.personnelItems = allList.filter(p => p.approval_status === 'pending_accountant' || p.approval_status === 'supervisor_approved');
        } else if (this.statusFilter !== 'ALL') {
          this.personnelItems = allList.filter(p => p.approval_status === this.statusFilter);
        } else {
          this.personnelItems = allList;
        }

        this.updateCombinedCounters();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });

    // دریافت پرونده‌های ناوگان
    this.personnelApi.getVehicleProfiles(baseParams).subscribe({
      next: (vRes: VehicleDriverProfile[]) => {
        const vList = vRes || [];
        this.statusCounters.vehiclesTotal = vList.length;
        this.statusCounters.vehiclesPending = vList.filter(v => v.approval_status === 'pending_accountant' || v.approval_status === 'supervisor_approved').length;

        if (this.statusFilter === 'pending_accountant') {
          this.vehicleItems = vList.filter(v => v.approval_status === 'pending_accountant' || v.approval_status === 'supervisor_approved');
        } else if (this.statusFilter !== 'ALL') {
          this.vehicleItems = vList.filter(v => v.approval_status === this.statusFilter);
        } else {
          this.vehicleItems = vList;
        }

        this.updateCombinedCounters();
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    // دریافت درخواست‌های تغییرات معلق
    this.personnelApi.getPersonnelChangeRequests(this.selectedSectionId ? { section_id: this.selectedSectionId } as any : {}).subscribe({
      next: (crList: PersonnelChangeRequest[]) => {
        this.personnelChangeRequests = (crList || []).filter(cr => cr.status === 'pending_accountant' || cr.status === 'pending_finance' || cr.status === 'supervisor_approved');
        this.updateCRCounts();
      },
      error: () => {}
    });

    this.personnelApi.getVehicleChangeRequests(this.selectedSectionId ? { section_id: this.selectedSectionId } as any : {}).subscribe({
      next: (vcrList: VehicleChangeRequest[]) => {
        this.vehicleChangeRequests = (vcrList || []).filter(vcr => vcr.status === 'pending_accountant' || vcr.status === 'pending_finance' || vcr.status === 'supervisor_approved');
        this.updateCRCounts();
      },
      error: () => {}
    });
  }

  private updateCRCounts(): void {
    const totalCR = this.personnelChangeRequests.length + this.vehicleChangeRequests.length;
    this.statusCounters.changeRequestsPending = totalCR;
    this.statusCounters.changeRequestsTotal = totalCR;
    this.updateCombinedCounters();
    this.cdr.detectChanges();
  }

  private updateCombinedCounters(): void {
    this.statusCounters.allPending = this.statusCounters.personnelPending + this.statusCounters.vehiclesPending + this.statusCounters.changeRequestsPending;
    this.statusCounters.allTotal = this.statusCounters.personnelTotal + this.statusCounters.vehiclesTotal + this.statusCounters.changeRequestsTotal;
  }

  // ─── اکشن‌های تایید مالی ۳ مرحله‌ای (Financial Approvals) ───
  approvePersonnelFinance(p: PersonnelProfile): void {
    if (!p.id) return;
    this.personnelApi.approvePersonnelFinance(p.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || `تایید مالی پرسنل «${p.first_name} ${p.last_name}» صادر و پرونده جهت تصویب نهایی به مدیر ارسال شد.`);
        this.fetchData();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی پرسنل');
      }
    });
  }

  approveVehicleFinance(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.personnelApi.approveVehicleFinance(v.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || `تایید مالی خودرو «${v.plate_number}» صادر و پرونده جهت تصویب نهایی به مدیر ارسال شد.`);
        this.fetchData();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی خودرو');
      }
    });
  }

  // ─── ارجاع به بازنگری یا رد پرونده ───
  openRejectModal(id: number, title: string, type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr', action: 'reject' | 'revision'): void {
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
      this.toast.show('warning', 'لطفاً علت رد یا عودت پرونده را به صورت کامل و مستند وارد نمایید.');
      return;
    }

    this.isSubmittingReject = true;
    const { id, type, action } = this.rejectTarget;
    const reason = this.rejectReason.trim();

    let obs: Observable<any>;
    if (type === 'personnel') {
      obs = action === 'reject' ? this.personnelApi.rejectPersonnel(id, reason) : this.personnelApi.requestPersonnelRevision(id, reason);
    } else if (type === 'vehicle') {
      obs = action === 'reject' ? this.personnelApi.rejectVehicle(id, reason) : this.personnelApi.requestVehicleRevision(id, reason);
    } else if (type === 'personnel_cr') {
      obs = this.personnelApi.rejectPersonnelChangeRequest(id, reason);
    } else {
      obs = this.personnelApi.rejectVehicleChangeRequest(id, reason);
    }

    obs.subscribe({
      next: (res) => {
        this.isSubmittingReject = false;
        this.toast.show('success', res.message || 'عملیات با موفقیت انجام شد.');
        this.closeRejectModal();
        this.fetchData();
      },
      error: (err) => {
        this.isSubmittingReject = false;
        this.toast.show('error', err?.error?.error || 'خطا در انجام عملیات');
      }
    });
  }

  // ─── مودال جامع ویرایش و تکمیل مدارک مالی پرسنل ───
  openEditPersonnelModal(p: PersonnelProfile): void {
    this.personnelModalTab = 'contract'; // باز شدن مستقیم روی تب مزد و مزایای مالی
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

  // ─── تب‌های مودال احکام مالی پرسنل ───
  readonly modalTabs: TabDef[] = [
    { id: 'contract', label: 'مزد و مزایای قانونی', shortLabel: 'مزد', icon: ACCOUNTING_ENTITY_ICONS.payroll },
    { id: 'insurance', label: 'بیمه و مالیات', shortLabel: 'بیمه', icon: ACCOUNTING_ENTITY_ICONS.insurance },
    { id: 'contact', label: 'شماره حساب و شبا', shortLabel: 'بانکی', icon: ACCOUNTING_ENTITY_ICONS.bankAccounts },
    { id: 'identity', label: 'مشخصات فردی', shortLabel: 'فردی', icon: ACCOUNTING_ENTITY_ICONS.identity },
  ];

  setPersonnelTab(tab: string): void {
    if (tab === 'contract' || tab === 'insurance' || tab === 'contact' || tab === 'identity') {
      this.personnelModalTab = tab;
      this.cdr.detectChanges();
    }
  }

  // ─── محاسبات آنی مزد بر اساس فرمول‌های حقوق انبارداری و قانون کار ───
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

  // ─── مدیریت بانک و شبا در فرم پرسنل ───
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
    if (!this.editingPersonnel?.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.editingPersonnel.account_number);
    if (!accValidation.isValid) {
      this.toast.show('warning', accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(this.editingPersonnel.bank_name, this.editingPersonnel.account_number || '');
    if (generated) {
      this.onShebaInput(generated);
      this.toast.show('success', `شماره شبا با موفقیت بر اساس بانک ${this.editingPersonnel.bank_name} تولید گردید.`);
    } else {
      this.toast.show('error', 'امکان تولید شماره شبا برای این ساختار حساب وجود ندارد.');
    }
  }

  savePersonnel(): void {
    if (!this.editingPersonnel || !this.editingPersonnel.id) return;
    if (!this.editingPersonnel.first_name?.trim() || !this.editingPersonnel.last_name?.trim()) {
      this.toast.show('warning', 'نام و نام خانوادگی الزامی است.');
      return;
    }

    this.isSavingPersonnel = true;
    this.personnelApi.updatePersonnelProfile(this.editingPersonnel.id, this.editingPersonnel).subscribe({
      next: (res) => {
        this.isSavingPersonnel = false;
        this.toast.show('success', 'مشخصات و ارقام مالی پرسنل با موفقیت ذخیره شد.');
        this.closePersonnelModal();
        this.fetchData();
      },
      error: (err) => {
        this.isSavingPersonnel = false;
        this.toast.show('error', err?.error?.error || err?.message || 'خطا در ذخیره مشخصات مالی پرسنل');
      }
    });
  }

  // ─── مدیریت مودال تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: any, type: 'personnel' | 'vehicle'): void {
    this.selectedDiffCR = cr;
    this.selectedDiffType = type;
    this.diffRows = [];

    const changes = cr.proposed_changes || {};
    const previous = cr.previous_values || {};

    for (const [key, newVal] of Object.entries(changes)) {
      const oldVal = previous[key];
      this.diffRows.push({
        label: this.getFieldLabel(key),
        key,
        oldValue: oldVal,
        newValue: newVal,
        isDiff: JSON.stringify(oldVal) !== JSON.stringify(newVal)
      });
    }

    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffRows = [];
  }

  approveChangeRequestFinance(cr: any, type: 'personnel' | 'vehicle'): void {
    const call = type === 'personnel'
      ? this.personnelApi.approvePersonnelChangeRequestFinance(cr.id)
      : this.personnelApi.approveVehicleChangeRequestFinance(cr.id);

    call.subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تایید مالی درخواست تغییرات با موفقیت انجام شد و جهت تصویب نهایی به مدیر ارسال گردید.');
        this.closeDiffModal();
        this.fetchData();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی درخواست تغییرات');
      }
    });
  }

  // ─── هلپرهای نمایشی ───
  getFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      father_name: 'نام پدر',
      job_title: 'عنوان شغل',
      job_grade: 'گروه شغلی',
      daily_base_wage: 'مزد روزانه پایه',
      daily_seniority_bonus: 'پایه سنواتی روزانه',
      base_daily_rate: 'مزد مبنا روزانه',
      hourly_rate: 'نرخ ساعتی',
      insurance_number: 'شماره بیمه',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      sheba_number: 'شماره شبا',
      default_service_rate: 'نرخ پایه سرویس',
      driver_name: 'نام راننده',
      plate_number: 'پلاک خودرو'
    };
    return labels[key] || key;
  }

  getStatusBadgeClass(status?: string): string {
    switch (status) {
      case 'pending_accountant':
      case 'supervisor_approved':
        return 'bg-blue-50 text-blue-700 border-blue-200 font-black';
      case 'pending_manager':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 font-black';
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-black';
      case 'revision_required':
        return 'bg-orange-50 text-orange-700 border-orange-200 font-black';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-black';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'pending_accountant':
      case 'supervisor_approved':
        return '💼 در انتظار تایید حسابدار';
      case 'pending_manager':
        return '⏳ در انتظار تصویب مدیر';
      case 'approved':
        return '✓ مصوب و فعال';
      case 'revision_required':
        return '↩️ نیازمند اصلاح';
      case 'rejected':
        return '✕ رد شده';
      case 'draft':
        return '📝 پیش‌نویس اولیه';
      default:
        return status || 'نامشخص';
    }
  }

  formatNumber(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '۰';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString('fa-IR');
  }

  formatSheba(sheba?: string): string {
    return formatShebaDisplay(sheba || '');
  }
}
