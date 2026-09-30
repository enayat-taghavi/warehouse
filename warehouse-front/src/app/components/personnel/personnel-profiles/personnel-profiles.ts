import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { StateService } from '../../../services/state.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../core/http/warehouse-http.service';
import { WebSocketService } from '../../../core/http/websocket.service';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  PayrollYearlySettings
} from '../../../core/models/personnel.model';
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
} from '../../../core/utils/sheba-utils';
import { AppPersonaService } from '../../../core/services/app-persona.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-personnel-profiles',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
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

  setTab(tab: 'personnel' | 'vehicles' | 'change_requests'): void {
    this.activeTab = tab;
    this.updateUrlParams();
    this.loadProfiles();
  }

  setChangeRequestSubTab(subTab: 'personnel' | 'vehicles'): void {
    this.changeRequestSubTab = subTab;
    this.updateUrlParams();
    this.loadChangeRequests();
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
    this.isPersonnelModalOpen = true;
  }

  closePersonnelModal(): void {
    this.isPersonnelModalOpen = false;
    this.editingPersonnel = null;
  }

  setPersonnelTab(tab: 'identity' | 'contract' | 'insurance' | 'allowances' | 'contact'): void {
    this.personnelModalTab = tab;
  }

  savePersonnel(): void {
    if (!this.editingPersonnel) return;
    if (!this.editingPersonnel.first_name || !this.editingPersonnel.last_name || !this.editingPersonnel.national_code) {
      this.toast.show('error', 'نام، نام خانوادگی و کد ملی الزامی است.');
      return;
    }

    this.isSavingPersonnel = true;
    if (this.editingPersonnel.id) {
      this.api.updatePersonnelProfile(this.editingPersonnel.id, this.editingPersonnel).subscribe({
        next: () => {
          this.isSavingPersonnel = false;
          this.toast.show('success', 'اطلاعات پرسنل با موفقیت به‌روزرسانی شد.');
          this.closePersonnelModal();
          this.loadProfiles();
        },
        error: (err) => {
          this.isSavingPersonnel = false;
          this.toast.show('error', err?.error?.error || 'خطا در ویرایش پرسنل');
        }
      });
    } else {
      this.api.createPersonnelProfile(this.editingPersonnel).subscribe({
        next: () => {
          this.isSavingPersonnel = false;
          this.toast.show('success', 'پرسنل جدید با موفقیت ثبت شد.');
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

  async deletePersonnel(p: Partial<PersonnelProfile> | PersonnelProfile): Promise<void> {
    if (!p.id) return;
    const confirmed = await this.confirmDialog.open({
      title: 'حذف پرونده پرسنلی',
      message: `آیا از حذف پرونده پرسنل «${p.full_name || ((p.first_name || '') + ' ' + (p.last_name || ''))}» اطمینان دارید؟`,
      confirmText: 'بله، حذف کن',
      cancelText: 'انصراف',
      type: 'danger'
    });

    if (!confirmed) return;

    this.api.deletePersonnelProfile(p.id).subscribe({
      next: () => {
        this.toast.show('success', `پرونده پرسنل «${p.full_name || p.first_name}» با موفقیت حذف گردید.`);
        if (this.isPersonnelModalOpen) {
          this.closePersonnelModal();
        }
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'امکان حذف این پرسنل وجود ندارد (دارای سابقه کارکرد یا حقوق است).');
      }
    });
  }

  togglePersonnelActive(p: PersonnelProfile): void {
    if (!p.id) return;
    const newStatus = !p.is_active;
    this.api.updatePersonnelProfile(p.id, { is_active: newStatus }).subscribe({
      next: () => {
        p.is_active = newStatus;
        this.toast.show('success', `وضعیت پرسنل به «${newStatus ? 'فعال' : 'غیرفعال'}» تغییر یافت.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در تغییر وضعیت پرسنل');
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
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.editingVehicle = {
      driver_name: '',
      driver_national_code: '',
      driver_phone: '',
      plate_number: '',
      vehicle_type: 'pickup',
      ownership_type: 'contract',
      default_service_rate: 1500000,
      sheba_number: '',
      account_number: '',
      bank_name: 'بانک ملی ایران',
      assigned_warehouse: this.selectedWarehouseId || undefined,
      is_active: true
    };
    this.isVehicleModalOpen = true;
  }

  openEditVehicleModal(v: VehicleDriverProfile): void {
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.editingVehicle = { ...v };
    if (v.sheba_number) {
      const res = validateSheba(v.sheba_number);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || v.sheba_number;
    }
    this.isVehicleModalOpen = true;
  }

  closeVehicleModal(): void {
    this.isVehicleModalOpen = false;
    this.editingVehicle = null;
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
  }

  saveVehicle(): void {
    if (!this.editingVehicle) return;
    if (!this.editingVehicle.plate_number || !this.editingVehicle.driver_name) {
      this.toast.show('error', 'نام راننده و شماره پلاک خودرو الزامی است.');
      return;
    }

    this.isSavingVehicle = true;
    if (this.editingVehicle.id) {
      this.api.updateVehicleProfile(this.editingVehicle.id, this.editingVehicle).subscribe({
        next: (res) => {
          this.isSavingVehicle = false;
          const msg = res?.message || 'اطلاعات خودرو با موفقیت به‌روزرسانی شد.';
          this.toast.show('success', msg);
          this.closeVehicleModal();
          this.loadProfiles();
        },
        error: (err) => {
          this.isSavingVehicle = false;
          this.toast.show('error', err?.error?.error || 'خطا در ویرایش خودرو');
        }
      });
    } else {
      this.api.createVehicleProfile(this.editingVehicle).subscribe({
        next: (res) => {
          this.isSavingVehicle = false;
          this.toast.show('success', 'خودروی جدید با موفقیت ثبت شد.');
          this.closeVehicleModal();
          this.loadProfiles();
        },
        error: (err) => {
          this.isSavingVehicle = false;
          this.toast.show('error', err?.error?.error || 'خطا در ثبت خودرو');
        }
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
        if (this.isVehicleModalOpen) {
          this.closeVehicleModal();
        }
        this.loadProfiles();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'امکان حذف این خودرو وجود ندارد.');
      }
    });
  }

  toggleVehicleActive(v: VehicleDriverProfile): void {
    if (!v.id) return;
    const newStatus = !v.is_active;
    this.api.updateVehicleProfile(v.id, { is_active: newStatus }).subscribe({
      next: () => {
        v.is_active = newStatus;
        this.toast.show('success', `وضعیت خودرو به «${newStatus ? 'فعال' : 'غیرفعال'}» تغییر یافت.`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در تغییر وضعیت خودرو');
      }
    });
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
