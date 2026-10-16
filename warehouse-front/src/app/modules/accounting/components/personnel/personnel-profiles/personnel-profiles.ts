import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { WarehouseHttpService } from '../../../../../core/http/warehouse-http.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  PayrollYearlySettings
} from '../../../models/personnel.model';
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
} from '../../../../../core/utils/sheba-utils';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';

@Component({
  selector: 'app-personnel-profiles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SvgIconDirective,
    TabBarComponent,
    ActionButtonComponent,
  ],
  templateUrl: './personnel-profiles.html',
  styleUrl: './personnel-profiles.css'
})
export class PersonnelProfilesHub implements OnInit, OnDestroy {
  private wsSub?: Subscription;
  private queryParamsSub?: Subscription;
  private companySub?: Subscription;

  // Main Top Tabs: 'personnel' | 'vehicles' | 'change_requests'
  activeTab: 'personnel' | 'vehicles' | 'change_requests' = 'personnel';
  profileApprovalFilter: string = 'ALL';
  changeRequestSubTab: 'personnel' | 'vehicles' = 'personnel';
  profileSearch = '';

  // ── نوار تب‌های اصلی هدر (Main Tabs) ─────────────────────────
  private mainTabsKey = '';
  private cachedMainTabs: TabDef[] = [];
  get mainTabs(): TabDef[] {
    const key = `${this.personnelList.length}_${this.vehiclesList.length}`;
    if (key !== this.mainTabsKey) {
      this.mainTabsKey = key;
      this.cachedMainTabs = [
        {
          id: 'personnel',
          label: 'پرونده‌های پرسنل',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.personnel,
          count: this.personnelList.length,
        },
        {
          id: 'vehicles',
          label: 'پرونده‌های ناوگان و ماشین‌آلات',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: this.vehiclesList.length,
        },
        {
          id: 'change_requests',
          label: 'تاریخچه درخواست‌های تغییر',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
        },
      ];
    }
    return this.cachedMainTabs;
  }

  // ── زیرتب‌های درخواست تغییر (Change Request SubTabs) ───────────
  private crSubTabsKey = '';
  private cachedCrSubTabs: TabDef[] = [];
  get changeRequestSubTabs(): TabDef[] {
    const key = `${this.personnelChangeRequests.length}_${this.vehicleChangeRequests.length}`;
    if (key !== this.crSubTabsKey) {
      this.crSubTabsKey = key;
      this.cachedCrSubTabs = [
        {
          id: 'personnel',
          label: 'درخواست‌های تغییرات پرسنل',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.personnel,
          count: this.personnelChangeRequests.length,
        },
        {
          id: 'vehicles',
          label: 'درخواست‌های تغییرات ناوگان',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: this.vehicleChangeRequests.length,
        },
      ];
    }
    return this.cachedCrSubTabs;
  }

  // ── تب‌های مودال ۵گانه پرسنل (Personnel Modal Tabs) ───────────
  readonly personnelModalTabs: TabDef[] = [
    {
      id: 'identity',
      label: 'اطلاعات شناسنامه‌ای',
      shortLabel: 'هویتی',
      icon: ACCOUNTING_ENTITY_ICONS.identity,
    },
    {
      id: 'contract',
      label: 'قرارداد و گروه شغلی',
      shortLabel: 'قرارداد',
      icon: ACCOUNTING_ENTITY_ICONS.jobGrades,
    },
    {
      id: 'insurance',
      label: 'بیمه و مالیات',
      shortLabel: 'بیمه',
      icon: ACCOUNTING_ENTITY_ICONS.insurance,
    },
    {
      id: 'allowances',
      label: 'مزایا و فوق‌العاده‌ها',
      shortLabel: 'مزایا',
      icon: ACCOUNTING_ENTITY_ICONS.payroll,
    },
    {
      id: 'contact',
      label: 'بانکی و تماس',
      shortLabel: 'بانکی',
      icon: ACCOUNTING_ENTITY_ICONS.bankAccounts,
    },
  ];
  selectedWarehouseId: number | null = null;
  warehouses: any[] = [];
  fiscalYear = '1405';

  // Data lists
  personnelList: PersonnelProfile[] = [];
  vehiclesList: VehicleDriverProfile[] = [];
  personnelChangeRequests: PersonnelChangeRequest[] = [];
  vehicleChangeRequests: VehicleChangeRequest[] = [];
  yearlySettings: PayrollYearlySettings | null = null;

  // Loading flags
  isProfilesLoading = false;
  isChangeRequestsLoading = false;
  isSavingPersonnel = false;
  isSavingVehicle = false;

  // 1. Personnel 5-Tab Modal
  isPersonnelModalOpen = false;
  personnelModalTab: 'identity' | 'contract' | 'insurance' | 'allowances' | 'contact' = 'identity';
  editingPersonnel: Partial<PersonnelProfile> | null = null;
  // وضعیت فرم ویرایش در لحظهٔ بازشدن؛ ذخیره فقط تغییرات نسبت به این را می‌فرستد
  private originalPersonnelSnapshot: Record<string, any> | null = null;

  // 2. Vehicle Modal & Sheba Engine
  isVehicleModalOpen = false;
  editingVehicle: Partial<VehicleDriverProfile> | null = null;
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay: string = '';
  isBankDropdownOpen: boolean = false;
  bankSearchQuery: string = '';
  isShebaCopied = false;
  isAccountCopied = false;
  private _isSyncingBank = false;

  // 3. Diff Viewer Modal
  isDiffModalOpen = false;
  selectedDiffCR: any = null;
  selectedDiffType: 'personnel' | 'vehicle' = 'personnel';
  diffRows: Array<{ label: string; key: string; oldValue: any; newValue: any; isDiff: boolean }> = [];

  // 4. Rejection / Revision Modal
  isProfileRejectModalOpen = false;
  profileRejectTarget: { id: number; title: string; type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr'; action: 'reject' | 'revision' } | null = null;
  profileRejectReason = '';
  isSubmittingProfileReject = false;

  constructor(
    public state: StateService,
    public auth: AuthService,
    public persona: AppPersonaService,
    private api: PersonnelApiService,
    private whService: WarehouseHttpService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() private ws?: WebSocketService,
    @Optional() public activeCompanyService?: ActiveCompanyService
  ) {}

  get canApprovePersonnelManager(): boolean {
    if (!this.persona.canPerform('/profiles', 'approve_personnel_profile')) {
      return false;
    }
    return this.auth.userPermissions().includes('perm_approve_personnel_manager') ||
           this.auth.userPermissions().includes('admin_all');
  }

  get canApprovePersonnelFinance(): boolean {
    if (!this.persona.canPerform('/profiles', 'approve_personnel_profile')) {
      return false;
    }
    return this.auth.userPermissions().includes('perm_approve_personnel_finance') ||
           this.auth.userPermissions().includes('admin_all');
  }

  get canApproveFleetManager(): boolean {
    if (!this.persona.canPerform('/profiles', 'approve_vehicle_profile')) {
      return false;
    }
    return this.auth.userPermissions().includes('perm_approve_fleet_manager') ||
           this.auth.userPermissions().includes('admin_all');
  }

  get canApproveFleetFinance(): boolean {
    if (!this.persona.canPerform('/profiles', 'approve_vehicle_profile')) {
      return false;
    }
    return this.auth.userPermissions().includes('perm_approve_fleet_finance') ||
           this.auth.userPermissions().includes('admin_all');
  }

  get canEditWageAndAllowances(): boolean {
    return this.persona.canPerform('/profiles', 'edit_base_wage_and_bonuses');
  }

  private onCompanyContextChanged = () => {
    this.selectedWarehouseId = null;
    this.loadWarehouses();
    this.loadProfiles();
  };

  ngOnInit(): void {
    this.loadWarehouses();
    this.loadYearlySettings();

    // گوش دادن به رویداد سراسری تغییر کانتکست شرکت
    if (typeof window !== 'undefined') {
      window.addEventListener('company_context_changed', this.onCompanyContextChanged);
    }

    // گوش دادن به تغییر شرکت فعال و به‌روزرسانی درجا فهرست پرسنل و ناوگان
    if (this.activeCompanyService?.activeCompany$) {
      let lastCompanyId = this.activeCompanyService.activeCompanyId;
      this.companySub = this.activeCompanyService.activeCompany$.subscribe(company => {
        const newId = company?.id ?? null;
        if (newId !== lastCompanyId) {
          lastCompanyId = newId;
          this.selectedWarehouseId = null;
          this.loadWarehouses();
          this.loadProfiles();
        }
      });
    }

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      let shouldReload = false;
      if (params['cid']) {
        const queryCid = Number(params['cid']);
        if (this.activeCompanyService && this.activeCompanyService.activeCompanyId !== queryCid) {
          const target = this.activeCompanyService.availableCompanies.find(c => c.id === queryCid);
          if (target) {
            this.activeCompanyService.selectCompany(target);
          }
        }
      }
      if (params['tab'] && (params['tab'] === 'personnel' || params['tab'] === 'vehicles' || params['tab'] === 'change_requests')) {
        this.activeTab = params['tab'];
      }
      if (params['subtab'] && (params['subtab'] === 'personnel' || params['subtab'] === 'vehicles')) {
        this.changeRequestSubTab = params['subtab'];
      }
      if (params['status']) {
        this.profileApprovalFilter = params['status'];
      }
      if (params['search']) {
        this.profileSearch = params['search'];
      }
      if (params['wh'] !== undefined) {
        const whId = params['wh'] ? Number(params['wh']) : null;
        if (this.selectedWarehouseId !== whId) {
          this.selectedWarehouseId = whId;
          shouldReload = true;
        }
      }
      this.loadProfiles();
    });

    // اشتراک بلادرنگ وب‌سوکت برای همگام‌سازی لحظه‌ای پرونده پرسنل و ناوگان
    if (this.ws) {
      this.wsSub = this.ws.notifications$.subscribe(notif => {
        if (!notif) return;
        // نادیده گرفتن اکوی پیام به تب جاری
        if (notif.client_tab_id && notif.client_tab_id === this.ws?.tabId) {
          return;
        }
        if (notif.type === 'personnel_updated' || notif.event === 'personnel_updated' || notif.type_str === 'personnel_updated' ||
            notif.type === 'vehicle_updated' || notif.event === 'vehicle_updated' || notif.type_str === 'vehicle_updated') {
          this.loadProfiles();
        }
        if (notif.type === 'personnel_change_request_updated' || notif.type_str === 'personnel_change_request_updated') {
          this.loadChangeRequests();
        }
      });
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('company_context_changed', this.onCompanyContextChanged);
    }
    if (this.wsSub) {
      this.wsSub.unsubscribe();
    }
    if (this.queryParamsSub) {
      this.queryParamsSub.unsubscribe();
    }
    if (this.companySub) {
      this.companySub.unsubscribe();
    }
  }

  // ─── بهینه‌سازی رندر و جلوگیری از بازسازی مکرر DOM با TrackBy ───
  trackByPersonnelId(index: number, p: PersonnelProfile): any {
    return p?.id || index;
  }

  trackByVehicleId(index: number, v: VehicleDriverProfile): any {
    return v?.id || index;
  }

  trackByCrId(index: number, cr: any): any {
    return cr?.id || index;
  }

  trackByDiffKey(index: number, row: any): any {
    return row?.key || index;
  }

  updateUrlParams(): void {
    const queryParams: any = {
      tab: this.activeTab,
      subtab: this.activeTab === 'change_requests' ? this.changeRequestSubTab : null,
      status: this.profileApprovalFilter !== 'ALL' ? this.profileApprovalFilter : null,
      wh: this.selectedWarehouseId !== null ? this.selectedWarehouseId : null,
      search: this.profileSearch.trim() || null
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  setTab(tab: string): void {
    if (tab === 'personnel' || tab === 'vehicles' || tab === 'change_requests') {
      this.activeTab = tab;
      this.updateUrlParams();
      this.loadProfiles();
    }
  }

  setChangeRequestSubTab(subTab: string): void {
    if (subTab === 'personnel' || subTab === 'vehicles') {
      this.changeRequestSubTab = subTab;
      this.updateUrlParams();
      this.loadChangeRequests();
    }
  }

  loadWarehouses(): void {
    this.whService.getAll().subscribe({
      next: (whs: any[]) => {
        this.warehouses = whs || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در بارگذاری لیست انبارها');
      }
    });
  }

  loadYearlySettings(): void {
    this.api.getYearlySettings(this.fiscalYear).subscribe({
      next: (data) => {
        this.yearlySettings = data;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadProfiles(): void {
    if (this.activeTab === 'change_requests') {
      this.loadChangeRequests();
      return;
    }

    this.isProfilesLoading = true;
    const approvalParam = this.profileApprovalFilter === 'ALL' ? undefined : this.profileApprovalFilter;

    if (this.activeTab === 'personnel') {
      this.api.getPersonnelProfiles({
        warehouse_id: this.selectedWarehouseId || undefined,
        approval_status: approvalParam,
        search: this.profileSearch || undefined,
        company_id: this.activeCompanyService?.activeCompanyId || undefined
      }).subscribe({
        next: (res) => {
          this.personnelList = res || [];
          this.isProfilesLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isProfilesLoading = false;
          this.toast.show('error', 'خطا در بارگذاری پرونده پرسنل');
        }
      });
    } else {
      this.api.getVehicleProfiles({
        warehouse_id: this.selectedWarehouseId || undefined,
        approval_status: approvalParam,
        search: this.profileSearch || undefined,
        company_id: this.activeCompanyService?.activeCompanyId || undefined
      }).subscribe({
        next: (res) => {
          this.vehiclesList = res || [];
          this.isProfilesLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isProfilesLoading = false;
          this.toast.show('error', 'خطا در بارگذاری لیست ناوگان');
        }
      });
    }
  }

  loadChangeRequests(): void {
    this.isChangeRequestsLoading = true;
    const statusParam = this.profileApprovalFilter === 'ALL' ? undefined : this.profileApprovalFilter;

    if (this.changeRequestSubTab === 'personnel') {
      this.api.getPersonnelChangeRequests({
        status: statusParam,
        search: this.profileSearch || undefined,
        company_id: this.activeCompanyService?.activeCompanyId || undefined
      }).subscribe({
        next: (res) => {
          this.personnelChangeRequests = res || [];
          this.isChangeRequestsLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isChangeRequestsLoading = false;
          this.toast.show('error', 'خطا در دریافت کارتابل تغییرات پرسنل');
        }
      });
    } else {
      this.api.getVehicleChangeRequests({
        status: statusParam,
        search: this.profileSearch || undefined,
        company_id: this.activeCompanyService?.activeCompanyId || undefined
      }).subscribe({
        next: (res) => {
          this.vehicleChangeRequests = res || [];
          this.isChangeRequestsLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isChangeRequestsLoading = false;
          this.toast.show('error', 'خطا در دریافت کارتابل تغییرات ناوگان');
        }
      });
    }
  }

  onSearchChange(): void {
    this.updateUrlParams();
    this.loadProfiles();
  }

  onFilterChange(): void {
    this.updateUrlParams();
    this.loadProfiles();
  }

  // ── عملیات تایید و رد پرونده‌ها ─────────────────────────────
  approvePersonnelManager(p: PersonnelProfile): void {
    if (!p.id) return;
    this.api.approvePersonnelManager(p.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تصویب نهایی مدیر با موفقیت ثبت شد و پرونده فعال گردید.');
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تصویب نهایی مدیر');
      }
    });
  }

  approvePersonnelFinance(p: PersonnelProfile): void {
    if (!p.id) return;
    this.api.approvePersonnelFinance(p.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تایید مالی با موفقیت ثبت شد و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی');
      }
    });
  }

  approveVehicleManager(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.api.approveVehicleManager(v.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تصویب نهایی مدیر با موفقیت ثبت شد و خودرو فعال گردید.');
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تصویب نهایی خودرو');
      }
    });
  }

  approveVehicleFinance(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.api.approveVehicleFinance(v.id).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تایید مالی خودرو با موفقیت انجام شد و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.');
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی');
      }
    });
  }

  // ── تایید و رد درخواست‌های تغییرات (Change Requests) ────────
  approveChangeRequestManager(cr: any, type: 'personnel' | 'vehicle'): void {
    const call = type === 'personnel'
      ? this.api.approvePersonnelChangeRequestManager(cr.id)
      : this.api.approveVehicleChangeRequestManager(cr.id);

    call.subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تصویب نهایی تغییرات توسط مدیر انجام و به پرونده اصلی اعمال گردید.');
        if (this.isDiffModalOpen) this.closeDiffModal();
        this.loadChangeRequests();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تصویب نهایی مدیر');
      }
    });
  }

  approveChangeRequestFinance(cr: any, type: 'personnel' | 'vehicle'): void {
    const call = type === 'personnel'
      ? this.api.approvePersonnelChangeRequestFinance(cr.id)
      : this.api.approveVehicleChangeRequestFinance(cr.id);

    call.subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'تایید مالی درخواست تغییرات انجام و جهت تصویب نهایی به مدیر ارسال شد.');
        if (this.isDiffModalOpen) this.closeDiffModal();
        this.loadChangeRequests();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید مالی');
      }
    });
  }

  openProfileRejectModal(id: number, title: string, type: 'personnel' | 'vehicle' | 'personnel_cr' | 'vehicle_cr', action: 'reject' | 'revision'): void {
    this.profileRejectTarget = { id, title, type, action };
    this.profileRejectReason = '';
    this.isProfileRejectModalOpen = true;
  }

  closeProfileRejectModal(): void {
    this.isProfileRejectModalOpen = false;
    this.profileRejectTarget = null;
    this.profileRejectReason = '';
  }

  submitProfileRejectModal(): void {
    if (!this.profileRejectTarget || !this.profileRejectReason.trim()) {
      this.toast.show('warning', 'لطفاً علت رد یا بازنگری را به صورت کامل و مستند وارد نمایید.');
      return;
    }

    this.isSubmittingProfileReject = true;
    const { id, type, action } = this.profileRejectTarget;
    const reason = this.profileRejectReason.trim();

    let obs: Observable<any>;
    if (type === 'personnel') {
      obs = action === 'reject' ? this.api.rejectPersonnel(id, reason) : this.api.requestPersonnelRevision(id, reason);
    } else if (type === 'vehicle') {
      obs = action === 'reject' ? this.api.rejectVehicle(id, reason) : this.api.requestVehicleRevision(id, reason);
    } else if (type === 'personnel_cr') {
      obs = this.api.rejectPersonnelChangeRequest(id, reason);
    } else {
      obs = this.api.rejectVehicleChangeRequest(id, reason);
    }

    obs.subscribe({
      next: (res) => {
        this.isSubmittingProfileReject = false;
        this.toast.show('success', res.message || 'عملیات با موفقیت ثبت شد.');
        this.closeProfileRejectModal();
        if (type.includes('_cr')) {
          this.loadChangeRequests();
        } else {
          this.loadProfiles();
        }
      },
      error: (err) => {
        this.isSubmittingProfileReject = false;
        this.toast.show('error', err?.error?.error || 'خطا در انجام عملیات');
      }
    });
  }

  openDiffModal(cr: any, type: 'personnel' | 'vehicle'): void {
    this.selectedDiffCR = cr;
    this.selectedDiffType = type;
    this.diffRows = [];

    const changes = cr.proposed_changes || {};
    const baseProfile = type === 'personnel'
      ? this.personnelList.find(p => p.id === cr.personnel)
      : this.vehiclesList.find(v => v.id === cr.vehicle);

    for (const [key, newVal] of Object.entries(changes)) {
      const oldVal = baseProfile ? (baseProfile as any)[key] : null;
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

  getFieldLabel(key: string): string {
    const labels: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      father_name: 'نام پدر',
      id_number: 'شماره شناسنامه',
      job_title: 'عنوان شغل',
      job_grade: 'گروه شغلی',
      daily_base_wage: 'مزد روزانه پایه',
      daily_seniority_bonus: 'پایه سنواتی روزانه',
      base_daily_rate: 'مزد مبنا روزانه',
      hourly_rate: 'نرخ ساعتی',
      contract_type: 'نوع قرارداد',
      contract_base_salary: 'حقوق ماهانه قرارداد',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      sheba_number: 'شماره شبا',
      card_number: 'شماره کارت',
      phone_number: 'شماره تماس',
      postal_code: 'کد پستی',
      address: 'نشانی',
      assigned_warehouse: 'پروژه / کارگاه انتسابی',
      driver_name: 'نام راننده',
      plate_number: 'پلاک خودرو',
      vehicle_type: 'نوع خودرو',
      ownership_type: 'نوع مالکیت',
      default_service_rate: 'نرخ مصوب هر سرویس',
      driver_phone: 'تلفن راننده',
      driver_national_code: 'کد ملی راننده'
    };
    return labels[key] || key;
  }

  getApprovalBadgeClass(status?: string): string {
    switch (status) {
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'manager_approved':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'draft':
      case 'pending_manager':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'revision_required':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getApprovalStatusTitle(status?: string): string {
    switch (status) {
      case 'approved':
        return 'تایید نهایی شده';
      case 'manager_approved':
        return 'تایید مدیر (در انتظار حسابدار)';
      case 'draft':
        return 'پیش‌نویس (در انتظار تایید مدیر)';
      case 'pending_manager':
        return 'در انتظار تایید مدیر';
      case 'revision_required':
        return 'نیازمند بازنگری و اصلاح';
      case 'rejected':
        return 'رد شده';
      default:
        return 'نامشخص';
    }
  }

  // ── محاسبات آنی نرخ پرسنل و انتخاب گروه شغلی ─────────────────
  recalculatePersonnelRates(): void {
    if (!this.editingPersonnel) return;
    const daily = Number(this.editingPersonnel.daily_base_wage || 0);
    const seniority = Number(this.editingPersonnel.daily_seniority_bonus || 0);
    const years = Number(this.editingPersonnel.base_years_experience || 0);
    const baseDaily = daily + (years * seniority);
    this.editingPersonnel.base_daily_rate = baseDaily;
    this.editingPersonnel.hourly_rate = Math.round(baseDaily / 10);
  }

  onJobGradeChange(grade: string): void {
    if (!grade || !this.editingPersonnel) return;
    this.api.getJobGradeRate(grade, this.fiscalYear).subscribe({
      next: (res) => {
        if (this.editingPersonnel) {
          this.editingPersonnel.daily_base_wage = res.daily_base_wage;
          this.editingPersonnel.daily_seniority_bonus = res.daily_seniority_bonus;
          const years = this.editingPersonnel.base_years_experience || 0;
          this.editingPersonnel.base_daily_rate = res.daily_base_wage + (years * res.daily_seniority_bonus);
          this.editingPersonnel.hourly_rate = res.hourly_rate;
          this.cdr.detectChanges();
        }
      }
    });
  }

  // ── مودال ۵ تبِ پرونده پرسنلی ────────────────────────────────
  openAddPersonnelModal(): void {
    this.personnelModalTab = 'identity';
    this.editingPersonnel = {
      first_name: '',
      last_name: '',
      national_code: '',
      father_name: '',
      id_number: '',
      id_series: '',
      id_serial: '',
      birth_date: '',
      birth_place: '',
      issue_place: '',
      issue_date: '',
      gender: 'مرد',
      nationality_code: '1',
      citizenship_country_code: '103',
      residence_country_code: '103',
      education_level: '5',
      marital_status: 'single',
      children_count: 0,
      contract_type: 'daily',
      contract_hours: 230,
      contract_base_salary: 0,
      job_grade: '19',
      base_years_experience: 0,
      daily_base_wage: 6572696,
      daily_seniority_bonus: 171867,
      base_daily_rate: 6572696,
      hourly_rate: 657270,
      start_date: '',
      end_date: '',
      retirement_date: '',
      personnel_id_code: '',
      job_title: 'کارشناس',
      job_code: '',
      job_category: '5',
      insurance_number: '',
      insurance_type: '2',
      insurance_name: 'تامین اجتماعی',
      exemption_type: '1',
      employment_type: '2',
      status_category: 'نفرات شرکتی',
      group_status: 'شاغل',
      include_in_insurance: true,
      include_in_tax: true,
      include_in_bank: true,
      tax_payment_type: this.yearlySettings?.tax_settings?.payment_type || '1',
      tax_service_location: this.yearlySettings?.tax_settings?.service_location || '1',
      tax_exceptions: this.yearlySettings?.tax_settings?.exceptions || '1',
      tax_currency_type: this.yearlySettings?.tax_settings?.currency_type || '84',
      tax_currency_exchange_rate: Number(this.yearlySettings?.tax_settings?.currency_exchange_rate) || 1,
      tax_housing_benefit_type: this.yearlySettings?.tax_settings?.housing_benefit_type || '1',
      tax_vehicle_benefit_type: this.yearlySettings?.tax_settings?.vehicle_benefit_type || '1',
      housing_allowance: Number(this.yearlySettings?.monthly_housing_allowance) || 30000000,
      food_allowance: Number(this.yearlySettings?.monthly_food_allowance) || 22000000,
      spouse_allowance: Number(this.yearlySettings?.monthly_spouse_allowance) || 5000000,
      weather_bonus: 0,
      asaluyeh_parsian_bonus: 0,
      remote_hardship_bonus: 0,
      market_attraction_bonus: 0,
      transport_allowance: 0,
      bank_name: this.yearlySettings?.bank_export_settings?.bank_name || 'بانک ملی ایران',
      account_number: '',
      sheba_number: '',
      card_number: '',
      phone_number: '',
      postal_code: '',
      address: '',
      assigned_warehouse: this.selectedWarehouseId,
      is_active: true
    };
    this.isPersonnelModalOpen = true;
  }

  openEditPersonnelModal(p: PersonnelProfile): void {
    this.personnelModalTab = 'identity';
    this.editingPersonnel = {
      ...p,
      nationality_code: p.nationality_code || '1',
      citizenship_country_code: p.citizenship_country_code || '103',
      residence_country_code: p.residence_country_code || '103',
      education_level: p.education_level || '5',
      insurance_type: p.insurance_type || '2',
      insurance_name: p.insurance_name || 'تامین اجتماعی',
      exemption_type: p.exemption_type || '1',
      job_category: p.job_category || '5',
      employment_type: p.employment_type || '2',
      tax_payment_type: p.tax_payment_type || this.yearlySettings?.tax_settings?.payment_type || '1',
      tax_service_location: p.tax_service_location || this.yearlySettings?.tax_settings?.service_location || '1',
      tax_exceptions: p.tax_exceptions || this.yearlySettings?.tax_settings?.exceptions || '1',
      tax_currency_type: p.tax_currency_type || this.yearlySettings?.tax_settings?.currency_type || '84',
      tax_currency_exchange_rate: Number(p.tax_currency_exchange_rate) || Number(this.yearlySettings?.tax_settings?.currency_exchange_rate) || 1,
      tax_housing_benefit_type: p.tax_housing_benefit_type || this.yearlySettings?.tax_settings?.housing_benefit_type || '1',
      tax_vehicle_benefit_type: p.tax_vehicle_benefit_type || this.yearlySettings?.tax_settings?.vehicle_benefit_type || '1',
    };
    this.recalculatePersonnelRates();
    this.originalPersonnelSnapshot = { ...this.editingPersonnel };
    this.isPersonnelModalOpen = true;
  }

  /** فیلدهای تغییرکرده نسبت به لحظهٔ بازشدن فرم؛ عدد و رشتهٔ عددی سرور (مثل «3500000.00») یکسان سنجیده می‌شوند */
  private changedPersonnelFields(current: Record<string, any>): Record<string, any> {
    const orig = this.originalPersonnelSnapshot || {};
    const norm = (v: any): string => {
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'object') return JSON.stringify(v);
      const str = String(v).trim();
      return /^-?\d+(\.\d+)?$/.test(str) ? String(Number(str)) : str;
    };
    const changes: Record<string, any> = {};
    for (const [key, value] of Object.entries(current)) {
      if (norm(value) !== norm(orig[key])) changes[key] = value;
    }
    return changes;
  }

  closePersonnelModal(): void {
    this.isPersonnelModalOpen = false;
    this.editingPersonnel = null;
  }

  setPersonnelTab(tab: string): void {
    if (tab === 'identity' || tab === 'contract' || tab === 'insurance' || tab === 'allowances' || tab === 'contact') {
      this.personnelModalTab = tab;
    }
  }

  savePersonnel(): void {
    if (!this.editingPersonnel) return;
    if (!this.editingPersonnel.first_name || !this.editingPersonnel.last_name || !this.editingPersonnel.national_code) {
      this.toast.show('error', 'نام، نام خانوادگی و کد ملی الزامی است.');
      return;
    }

    this.isSavingPersonnel = true;
    // فایل پیوست (رشتهٔ نشانی)، مدارک و حساب‌های تودرتو از این فرم نوشتنی نیستند؛ حساب‌ها از اکشن bank-accounts تغییر می‌کنند
    const { attachment, documents, bank_accounts, ...payload } = this.editingPersonnel as any;
    if (this.editingPersonnel.id) {
      const changes = this.changedPersonnelFields(payload);
      delete changes['is_active'];
      if (!Object.keys(changes).length) {
        this.isSavingPersonnel = false;
        this.toast.show('info', 'تغییری نسبت به اطلاعات فعلی پرونده ثبت نشد.');
        this.closePersonnelModal();
        return;
      }
      this.api.updatePersonnelProfile(this.editingPersonnel.id, changes).subscribe({
        next: (res: any) => {
          this.isSavingPersonnel = false;
          if (res?.change_request_id) {
            // پروندهٔ مصوب برای همه جز مدیر سیستم فقط از مسیر درخواست تغییرات ویرایش می‌شود (DEF-17)
            this.toast.show('info', 'درخواست تغییرات ثبت شد و پس از بررسی سرپرست، حسابدار و تصویب مدیر روی پرونده اعمال می‌شود.');
          } else {
            this.toast.show('success', 'اطلاعات پرسنل با موفقیت به‌روزرسانی شد.');
          }
          this.closePersonnelModal();
          this.loadProfiles();
        },
        error: (err) => {
          this.isSavingPersonnel = false;
          this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در ویرایش پرسنل');
        }
      });
    } else {
      this.api.createPersonnelProfile(payload).subscribe({
        next: (created: any) => {
          this.isSavingPersonnel = false;
          // پرونده پیش‌نویس ساخته می‌شود و عبور هوشمند نقش‌های بالاتر با گیت سرور انجام می‌شود (DEF-02 و DEF-14)
          const status = created?.approval_status;
          const missing = Array.isArray(created?.missing_fields) ? created.missing_fields.length : 0;
          if (status === 'approved') {
            this.toast.show('success', 'پرسنل جدید ثبت و با عبور هوشمند تصویب شد.');
          } else if (created?._offlinePending) {
            this.toast.show('warning', 'پرونده در صف آفلاین ذخیره شد و پس از اتصال ثبت می‌شود.');
          } else {
            this.toast.show('warning', `پرسنل جدید ثبت شد ولی به‌دلیل ${missing ? missing + ' مورد نقص' : 'نقص اطلاعات'} در وضعیت «${status === 'draft' ? 'پیش‌نویس' : status}» ماند.`);
          }
          this.closePersonnelModal();
          this.loadProfiles();
        },
        error: (err) => {
          this.isSavingPersonnel = false;
          this.toast.show('error', err?.error?.error || 'خطا در ثبت پرسنل');
        }
      });
    }
  }

  /**
   * حذف هماهنگ با ماتریس سرور (تسک ۲.۴ و ۱۰.۳، DEF-27): ابتدا delete_impact سابقه و مجوز را می‌سنجد؛
   * پروندهٔ دارای سابقه حذف نمی‌شود و «قطع همکاری» پیشنهاد می‌شود. حذف مجاز با تایپ «حذف» تأیید می‌شود.
   */
  deletePersonnel(p: Partial<PersonnelProfile> | PersonnelProfile): void {
    if (!p.id) return;
    const fullName = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
    this.api.getPersonnelDeleteImpact(p.id).subscribe({
      next: async (impact) => {
        if (!impact?.can_delete) {
          const reasons = impact?.reasons?.length ? impact.reasons.join('، ') : 'مجوز حذف این پرونده را ندارید.';
          const canEnd = !!impact?.has_history && this.canEndCollaboration && p.approval_status === 'approved' && p.is_active !== false;
          const choice = await this.confirmDialog.open({
            title: 'حذف فیزیکی این پرونده مجاز نیست',
            message: `پروندهٔ «${fullName}» قابل حذف نیست: ${reasons}`,
            type: 'warning',
            confirmText: canEnd ? 'ثبت قطع همکاری' : 'متوجه شدم',
            showCancel: canEnd,
            cancelText: 'بستن'
          });
          if (choice === true && canEnd) {
            this.openEndCollaborationModal(p as PersonnelProfile);
          }
          return;
        }
        const total = impact.total_affected || 0;
        const confirmed = await this.confirmDialog.open({
          title: 'حذف پرونده پرسنلی فاقد سابقه',
          message: `پروندهٔ «${fullName}»${total ? ` همراه ${total} رکورد وابسته (حساب‌های بانکی و مدارک)` : ''} برای همیشه حذف می‌شود؛ عکس کامل آن در لاگ ممیزی می‌ماند.`,
          confirmText: 'بله، حذف کن',
          cancelText: 'انصراف',
          type: 'danger',
          requireText: 'حذف',
          requireTextLabel: 'برای تأیید، کلمهٔ «حذف» را بنویسید'
        });
        if (confirmed !== true) return;
        this.api.deletePersonnelProfile(p.id!).subscribe({
          next: () => {
            this.toast.show('success', `پرونده پرسنل «${fullName}» با موفقیت حذف گردید.`);
            if (this.isPersonnelModalOpen) {
              this.closePersonnelModal();
            }
            this.loadProfiles();
          },
          error: (err) => {
            this.toast.show('error', err?.error?.error || err?.error?.detail || 'امکان حذف این پرسنل وجود ندارد.');
          }
        });
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || err?.error?.detail || 'استعلام سابقهٔ پرونده پیش از حذف ممکن نشد.');
      }
    });
  }

  /** قطع همکاری با مجوز مدیر؛ فعال/غیرفعال کردن مستقیم is_active در سرور فقط‌خواندنی است (DEF-18) */
  get canEndCollaboration(): boolean {
    if (this.auth.user()?.is_superuser) return true;
    const perms = this.auth.userPermissions();
    return ['perm_approve_personnel_manager', 'can_act_as_manager', 'can_act_as_company_manager'].some(c => perms.includes(c));
  }

  isEndCollaborationModalOpen = false;
  endCollaborationTarget: PersonnelProfile | null = null;
  endCollaborationVehicleTarget: VehicleDriverProfile | null = null;
  endCollaborationDate = '';
  endCollaborationReason = '';
  isEndingCollaboration = false;

  togglePersonnelActive(p: PersonnelProfile): void {
    if (!p.id) return;
    if (!p.is_active) {
      this.toast.show('info', `همکاری «${p.first_name} ${p.last_name}» پیش‌تر پایان یافته است${p.end_date ? ` (تاریخ پایان: ${p.end_date})` : ''}.`);
      return;
    }
    if (!this.canEndCollaboration) {
      this.toast.show('warning', 'ثبت قطع همکاری فقط با دسترسی مدیر ممکن است.');
      return;
    }
    this.openEndCollaborationModal(p);
  }

  openEndCollaborationModal(p: PersonnelProfile): void {
    this.endCollaborationTarget = p;
    this.endCollaborationVehicleTarget = null;
    this.endCollaborationDate = '';
    this.endCollaborationReason = '';
    this.isEndCollaborationModalOpen = true;
    this.cdr.detectChanges();
  }

  closeEndCollaborationModal(): void {
    this.isEndCollaborationModalOpen = false;
    this.endCollaborationTarget = null;
    this.endCollaborationVehicleTarget = null;
    this.isEndingCollaboration = false;
    this.cdr.detectChanges();
  }

  submitEndCollaboration(): void {
    if (this.endCollaborationVehicleTarget?.id) {
      const vTarget = this.endCollaborationVehicleTarget;
      const vehicleId = vTarget.id;
      if (!vehicleId) return;
      if (!this.endCollaborationDate.trim() || !this.endCollaborationReason.trim()) {
        this.toast.show('warning', 'تاریخ پایان همکاری (شمسی) و دلیل آن الزامی است.');
        return;
      }
      this.isEndingCollaboration = true;
      this.api.endVehicleCollaboration(vehicleId, this.endCollaborationDate.trim(), this.endCollaborationReason.trim()).subscribe({
        next: (res: any) => {
          vTarget.is_active = false;
          vTarget.end_date = res?.data?.end_date || this.endCollaborationDate.trim();
          this.toast.show('success', res?.message || `همکاری خودروی «${vTarget.driver_name} (${vTarget.plate_number})» پایان یافت.`);
          this.closeEndCollaborationModal();
          this.loadProfiles();
        },
        error: (err: any) => {
          this.isEndingCollaboration = false;
          this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در ثبت قطع همکاری');
          this.cdr.detectChanges();
        }
      });
      return;
    }
    const target = this.endCollaborationTarget;
    if (!target?.id || this.isEndingCollaboration) return;
    if (!this.endCollaborationDate.trim() || !this.endCollaborationReason.trim()) {
      this.toast.show('warning', 'تاریخ پایان همکاری (شمسی) و دلیل آن الزامی است.');
      return;
    }
    this.isEndingCollaboration = true;
    this.api.endPersonnelCollaboration(target.id, this.endCollaborationDate.trim(), this.endCollaborationReason.trim()).subscribe({
      next: (res: any) => {
        target.is_active = false;
        target.end_date = res?.data?.end_date || this.endCollaborationDate.trim();
        this.toast.show('success', res?.message || `همکاری «${target.first_name} ${target.last_name}» پایان یافت.`);
        this.closeEndCollaborationModal();
        this.loadProfiles();
      },
      error: (err: any) => {
        this.isEndingCollaboration = false;
        this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در ثبت قطع همکاری');
        this.cdr.detectChanges();
      }
    });
  }

  // ── مدیریت ناوگان و خودروها (منطبق بر موتور شبا و فرم استاندارد) ──
  get filteredBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery || !this.bankSearchQuery.trim()) {
      return this.iranianBanks;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanks.filter(b => 
      b.name.toLowerCase().includes(q) || 
      b.shortName.toLowerCase().includes(q) || 
      b.code.includes(q)
    );
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.onBankSelect(bank.name);
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
  }

  onShebaInput(event: any): void {
    if (this._isSyncingBank || !this.editingVehicle) return;
    this._isSyncingBank = true;
    try {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      const digits = extractShebaDigits(rawVal);
      const res = validateSheba(digits);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || digits;
      this.editingVehicle.sheba_number = res.rawSheba;
      if (res.bank) {
        this.editingVehicle.bank_name = res.bank.name;
      }
      if (res.accountNumber) {
        this.editingVehicle.account_number = res.accountNumber;
      }
      if (event?.target) {
        event.target.value = this.shebaDigitsDisplay;
      }
    } finally {
      this._isSyncingBank = false;
    }
    this.cdr.detectChanges();
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank || !this.editingVehicle) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.editingVehicle.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }
    
    // تبدیل خودکار شماره حساب و بانک به شماره شبا با گارد سخت‌گیر اعتبارسنجی
    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.editingVehicle.bank_name) {
      const generated = generateShebaFromAccount(this.editingVehicle.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.editingVehicle.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.detectChanges();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onAccountNumberInput(pasted);
    const target = event.target as HTMLInputElement;
    if (target && this.editingVehicle) {
      target.value = this.editingVehicle.account_number || '';
    }
  }

  onAccountNumberCopy(event: ClipboardEvent): void {
    const acc = this.editingVehicle?.account_number || '';
    if (acc && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', acc);
      this.isAccountCopied = true;
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  onBankSelect(bankName: string): void {
    if (!this.editingVehicle) return;
    this.editingVehicle.bank_name = bankName;
    const accValidation = validateAccountNumber(this.editingVehicle.account_number);
    if (accValidation.isValid && bankName) {
      const generated = generateShebaFromAccount(bankName, this.editingVehicle.account_number);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.editingVehicle.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.detectChanges();
  }

  convertAccountToShebaNow(): void {
    if (!this.editingVehicle) return;
    if (!this.editingVehicle.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.editingVehicle.account_number);
    if (!accValidation.isValid) {
      this.toast.show('warning', accValidation.errorMessage || 'لطفاً یک شماره حساب معتبر وارد نمایید.');
      return;
    }
    const generated = generateShebaFromAccount(this.editingVehicle.bank_name, this.editingVehicle.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.show('success', `شماره شبا با موفقیت بر اساس شماره حساب و ${this.editingVehicle.bank_name} تولید شد.`);
    } else {
      this.toast.show('error', 'امکان تولید شماره شبا برای این شماره حساب وجود ندارد.');
    }
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  onShebaCopy(event: ClipboardEvent): void {
    const rawSheba = this.editingVehicle?.sheba_number || '';
    const cleanSheba = rawSheba.toString().trim().toUpperCase().replace(/^IR/i, '');
    if (cleanSheba && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', cleanSheba);
      this.isShebaCopied = true;
      this.toast.show('success', 'شماره شبا (بدون IR) کپی شد: ' + cleanSheba);
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  copyShebaToClipboard(): void {
    const rawSheba = this.editingVehicle?.sheba_number;
    const sheba = rawSheba ? rawSheba.toString().trim().toUpperCase().replace(/^IR/i, '') : '';
    if (sheba) {
      navigator.clipboard.writeText(sheba).then(() => {
        this.isShebaCopied = true;
        this.toast.show('success', 'شماره شبا (بدون IR) کپی شد: ' + sheba);
        setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2500);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('error', 'امکان دسترسی به کلیپ‌بورد وجود ندارد.');
      });
    }
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.editingVehicle?.account_number || this.shebaValidationResult?.accountNumber;
    if (acc) {
      navigator.clipboard.writeText(acc).then(() => {
        this.isAccountCopied = true;
        this.toast.show('success', `شماره حساب (${acc}) با موفقیت کپی شد.`);
        setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2500);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('error', 'امکان دسترسی به کلیپ‌بورد وجود ندارد.');
      });
    } else {
      this.toast.show('warning', 'شماره حسابی برای کپی یافت نشد.');
    }
  }

  openAddVehicleModal(): void {
    this.router.navigate(['/app/finance/employee-new-vehicle'], {
      queryParams: { new: 'true' }
    });
  }

  openEditVehicleModal(v: VehicleDriverProfile): void {
    if (v?.id) {
      this.router.navigate(['/app/finance/employee-new-vehicle'], {
        queryParams: { edit: v.id }
      });
    }
  }

  async deleteVehicle(v: VehicleDriverProfile): Promise<void> {
    if (!v.id) return;
    const confirmed = await this.confirmDialog.open({
      title: 'حذف پرونده خودرو / راننده',
      message: `آیا از حذف خودروی «${v.driver_name} (${v.plate_number})» اطمینان دارید؟`,
      confirmText: 'بله، حذف کن',
      cancelText: 'انصراف',
      type: 'danger'
    });

    if (!confirmed) return;

    this.api.deleteVehicleProfile(v.id).subscribe({
      next: () => {
        this.toast.show('success', `پرونده خودروی «${v.driver_name}» با موفقیت حذف گردید.`);
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'امکان حذف این خودرو وجود ندارد.');
      }
    });
  }

  toggleVehicleActive(v: VehicleDriverProfile): void {
    if (!v.id) return;
    if (!v.is_active) {
      this.toast.show('info', `همکاری خودروی «${v.driver_name} (${v.plate_number})» پیش‌تر پایان یافته است${v.end_date ? ` (تاریخ پایان: ${v.end_date})` : ''}.`);
      return;
    }
    this.endCollaborationVehicleTarget = v;
    this.endCollaborationTarget = null;
    this.endCollaborationDate = '';
    this.endCollaborationReason = '';
    this.isEndCollaborationModalOpen = true;
    this.cdr.detectChanges();
  }

  // ── درون‌ریزی اکسل پرسنل ────────────────────────────────────
  importExcel(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    if (this.selectedWarehouseId) {
      formData.append('warehouse_id', this.selectedWarehouseId.toString());
    }

    this.toast.show('info', 'در حال پردازش فایل اکسل...');
    this.api.importPersonnelExcel(formData).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || `درون‌ریزی انجام شد: ${res.created_count} جدید، ${res.updated_count} به‌روزرسانی.`);
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در درون‌ریزی اکسل');
      }
    });
  }
}
