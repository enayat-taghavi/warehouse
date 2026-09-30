import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProjectSection, VehicleDriverProfile } from '../../../../core/models/personnel.model';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { normalizeDigits } from '../../../../core/utils/date-utils';
import { ExcelImportModal } from '../../../../shared/components/excel-import-modal/excel-import-modal';
import { ImportResult } from '../../../../core/http/accounts-http.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import {
  cleanShebaInput,
  validateSheba,
  extractShebaDigits,
  extractAccountNumberFromSheba,
  generateShebaFromAccount,
  validateAccountNumber,
  ShebaValidationResult,
  IRANIAN_BANKS,
  IranianBankInfo
} from '../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

export type VehicleStatusFilter = 'all' | 'draft' | 'pending_supervisor' | 'revision_required' | 'approved' | 'rejected';

@Component({
  selector: 'app-employee-new-vehicle-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelImportModal, SvgIconDirective],
  templateUrl: './employee-new-vehicle.html',
  styleUrl: './employee-new-vehicle.css'
})
export class EmployeeNewVehicleHubComponent implements OnInit, OnDestroy {
  readonly Math = Math;

  // ─── مراجع المان‌های DOM جهت ارگونومی و هدایت فوکوس (UI-01 & UI-05) ───
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('p1Input') p1Input?: ElementRef<HTMLInputElement>;
  @ViewChild('p2Select') p2Select?: ElementRef<HTMLSelectElement>;
  @ViewChild('p3Input') p3Input?: ElementRef<HTMLInputElement>;
  @ViewChild('p4Input') p4Input?: ElementRef<HTMLInputElement>;

  // ─── مدیریت بخش و ایزولاسیون قلمرو (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;
  private pendingSectionId: number | null = null;

  // ─── جدول خودروهای اخیراً ثبت‌شده بخش ───
  recentVehicles: VehicleDriverProfile[] = [];
  isLoadingVehicles: boolean = false;
  isSaving: boolean = false;
  isExportingExcel: boolean = false;
  isImportingExcel: boolean = false;
  searchQuery: string = '';
  statusFilter: VehicleStatusFilter = 'all';
  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;
  private wsSub?: Subscription;
  private queryParamsSub?: Subscription;
  private personnelSearchSub?: Subscription;

  // ─── مودال مقایسه و مشاهده تغییرات معلق (Diff Viewer Modal) ───
  isPendingDiffModalOpen: boolean = false;
  pendingDiffVehicle: VehicleDriverProfile | null = null;

  // ─── وضعیت باز بودن مودال ثبت / ویرایش خودرو ───
  isNewVehicleModalOpen: boolean = false;
  editingVehicle: VehicleDriverProfile | null = null;
  editingId: number | null = null;
  rateFormattedDisplay: string = '';

  // ─── بخش‌های ۴ گانه پلاک خودرو ملی ───
  platePart1: string = '';
  platePart2: string = 'الف';
  platePart3: string = '';
  platePart4: string = '63';

  readonly plateLetters = [
    'الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'د', 'ز', 'س', 'ش', 'ص', 'ط', 'ع', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'هـ', 'ی', 'معلولین'
  ];

  // ─── مودال استاندارد ورود اطلاعات از فایل اکسل ───
  isExcelModalOpen: boolean = false;
  excelModalTitle: string = 'آپلود و ثبت دسته‌جمعی ناوگان از فایل اکسل';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  get isLoading(): boolean {
    return this.isLoadingSections || this.isLoadingVehicles;
  }

  // ─── فرم ثبت خودرو جدید ───
  newVehicle: Partial<VehicleDriverProfile> = {
    plate_number: '',
    vehicle_type: 'nissan',
    ownership_type: 'contract',
    driver_name: '',
    driver_national_code: '',
    driver_phone: '',
    is_driver_owner: true,
    owner_name: '',
    owner_national_code: '',
    owner_phone: '',
    default_service_rate: 0,
    bank_name: '',
    account_number: '',
    sheba_number: '',
    notes: '',
    is_active: true,
    approval_status: 'draft'
  };

  // اعتبارسنجی زنده و نمایش فرمت‌شده شبا و اطلاعات بانکی
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay: string = '';
  isShebaCopied: boolean = false;
  isAccountCopied: boolean = false;
  isBankDropdownOpen: boolean = false;
  bankSearchQuery: string = '';
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  private _isSyncingBank: boolean = false;

  get filteredBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery?.trim()) {
      return this.iranianBanks;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanks.filter(b => 
      b.name.toLowerCase().includes(q) || 
      b.shortName.toLowerCase().includes(q) || 
      b.code.includes(q)
    );
  }

  // اعتبارسنجی زنده کدهای ملی
  nationalCodeError: string | null = null;
  ownerNationalCodeError: string | null = null;
  matchedPersonnelNotice: string | null = null;

  // ─── گروه‌بندی سازمان‌یافته انواع خودرو (Organized Vehicle Types) ───
  readonly vehicleGroups = [
    {
      group: 'سبک و نیمه‌باری',
      types: [
        { value: 'pickup', label: 'وانت بار' },
        { value: 'nissan', label: 'وانت نیسان' },
        { value: 'sedan', label: 'سواری' }
      ]
    },
    {
      group: 'سنگین و تجاری',
      types: [
        { value: 'khavar', label: 'خاور / کامیونت' },
        { value: 'truck', label: 'کامیون تک / جفت' },
        { value: 'trailer', label: 'تریلی / کشنده' }
      ]
    },
    {
      group: 'ماشین‌آلات و تجهیزات انبار',
      types: [
        { value: 'forklift', label: 'لیفتراک' },
        { value: 'other', label: 'سایر ماشین‌آلات کارگاهی' }
      ]
    }
  ];

  readonly vehicleTypesFlat = [
    { value: 'pickup', label: 'وانت بار' },
    { value: 'nissan', label: 'وانت نیسان' },
    { value: 'sedan', label: 'سواری' },
    { value: 'khavar', label: 'خاور / کامیونت' },
    { value: 'truck', label: 'کامیون تک / جفت' },
    { value: 'trailer', label: 'تریلی / کشنده' },
    { value: 'forklift', label: 'لیفتراک' },
    { value: 'other', label: 'سایر ماشین‌آلات' }
  ];

  // ─── لیست انواع مالکیت ───
  readonly ownershipTypes = [
    { value: 'contract', label: 'استیجاری / پیمانکاری سرویسی' },
    { value: 'company', label: 'خودرو شرکتی / ملکی پروژه' },
    { value: 'personal', label: 'خودرو ملکی راننده' }
  ];

  // ─── نگاشت فارسی کلیدهای تغییرات جهت نمایش در مودال Diff ───
  readonly fieldLabelsMap: Record<string, string> = {
    plate_number: 'شماره پلاک',
    driver_name: 'نام راننده',
    driver_national_code: 'کد ملی راننده',
    driver_phone: 'شماره همراه راننده',
    is_driver_owner: 'مالک شخص راننده است',
    owner_name: 'نام مالک',
    owner_national_code: 'کد ملی مالک',
    owner_phone: 'شماره تماس مالک',
    vehicle_type: 'نوع خودرو',
    ownership_type: 'نوع مالکیت',
    default_service_rate: 'نرخ پایه سرویس (ریال)',
    bank_name: 'نام بانک',
    account_number: 'شماره حساب',
    sheba_number: 'شماره شبا',
    is_active: 'وضعیت فعال/غیرفعال',
    notes: 'توضیحات و یادداشت تکمیلی'
  };

  getFieldLabel(key: string): string {
    return this.fieldLabelsMap[key] || key;
  }

  private companySub?: Subscription;

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private ws: WebSocketService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() public activeCompanyService?: ActiveCompanyService
  ) {
    this.setupSearchDebounce();
  }

  ngOnInit(): void {
    this.setupWebSocket();

    if (this.activeCompanyService?.activeCompany$) {
      this.companySub = this.activeCompanyService.activeCompany$.subscribe(() => {
        this.loadMySections();
        if (this.selectedSectionId) {
          this.loadRecentVehicles();
        }
      });
    }

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId)) {
          if (this.mySections.length > 0) {
            if (sId !== this.selectedSectionId && this.mySections.some(s => s.id === sId)) {
              this.selectedSectionId = sId;
              this.selectedSection = this.mySections.find(s => s.id === sId) || null;
              this.loadRecentVehicles();
            }
          } else {
            this.pendingSectionId = sId;
          }
        }
      }
      if (params['status_filter'] && ['all', 'draft', 'pending_supervisor', 'revision_required', 'approved', 'rejected'].includes(params['status_filter'])) {
        this.statusFilter = params['status_filter'] as VehicleStatusFilter;
      }
      if (params['search'] !== undefined) {
        this.searchQuery = params['search'] || '';
      }
    });
    this.loadMySections();
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.queryParamsSub?.unsubscribe();
    this.personnelSearchSub?.unsubscribe();
    this.companySub?.unsubscribe();
  }

  private setupSearchDebounce(): void {
    this.searchSub = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(q => {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { search: q.trim() || null },
        queryParamsHandling: 'merge'
      });
    });
  }

  private setupWebSocket(): void {
    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      if (msg && (msg.type_str === 'vehicle_updated' || msg.type === 'vehicle_updated')) {
        if (!this.selectedSectionId || !msg.section_id || msg.section_id === this.selectedSectionId) {
          this.loadRecentVehicles();
        }
      }
    });
  }

  // ─── بارگذاری بخش‌های مجاز کارمند ───
  loadMySections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            this.personnelApi.getProjectSections({ is_active: true }).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => {
                this.isLoadingSections = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.cdr.detectChanges();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (this.pendingSectionId && this.mySections.some(s => s.id === this.pendingSectionId)) {
        this.selectedSectionId = this.pendingSectionId;
      } else if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      this.pendingSectionId = null;
      if (this.selectedSectionId) {
        this.loadRecentVehicles();
      }
    }
    this.isLoadingSections = false;
    this.cdr.detectChanges();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.loadRecentVehicles();
  }

  // ─── بارگذاری خودروهای بخش فعال ───
  loadRecentVehicles(): void {
    if (!this.selectedSectionId) return;
    this.isLoadingVehicles = true;
    this.personnelApi.getVehicleProfiles({ section_id: this.selectedSectionId }).subscribe({
      next: (res: VehicleDriverProfile[]) => {
        this.recentVehicles = res || [];
        this.isLoadingVehicles = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoadingVehicles = false;
        this.toast.show('error', 'خطا در بارگذاری خودروها: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فیلتر خودروهای اخیر ───
  get filteredVehicles(): VehicleDriverProfile[] {
    let list = this.recentVehicles;

    if (this.statusFilter !== 'all') {
      if (this.statusFilter === 'approved') {
        list = list.filter(v => v.approval_status === 'approved' || v.approval_status === 'manager_approved');
      } else {
        list = list.filter(v => v.approval_status === this.statusFilter);
      }
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(v =>
        (v.plate_number && v.plate_number.toLowerCase().includes(q)) ||
        (v.driver_name && v.driver_name.toLowerCase().includes(q)) ||
        (v.driver_phone && v.driver_phone.includes(q)) ||
        (v.driver_national_code && v.driver_national_code.includes(q)) ||
        (v.owner_name && v.owner_name.toLowerCase().includes(q)) ||
        (v.owner_national_code && v.owner_national_code.includes(q)) ||
        (v.bank_name && v.bank_name.toLowerCase().includes(q))
      );
    }

    return list;
  }

  // ─── شاخص‌های آماری خودروهای بخش ───
  get vehicleMetrics() {
    const total = this.recentVehicles.length;
    const drafts = this.recentVehicles.filter(v => v.approval_status === 'draft').length;
    const pending = this.recentVehicles.filter(v => v.approval_status === 'pending_supervisor').length;
    const revision = this.recentVehicles.filter(v => v.approval_status === 'revision_required').length;
    const approved = this.recentVehicles.filter(v => v.approval_status === 'approved' || v.approval_status === 'manager_approved').length;
    const rejected = this.recentVehicles.filter(v => v.approval_status === 'rejected').length;
    const contractCount = this.recentVehicles.filter(v => v.ownership_type === 'contract').length;

    return {
      total,
      drafts,
      pending,
      revision,
      approved,
      rejected,
      contractCount
    };
  }

  // ─── رفتار دوحالته (Toggle) تب‌های وضعیت طبق Rule 7 ───
  setStatusFilter(filter: VehicleStatusFilter): void {
    const nextFilter: VehicleStatusFilter = (this.statusFilter === filter && filter !== 'all') ? 'all' : filter;
    this.statusFilter = nextFilter;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status_filter: nextFilter === 'all' ? null : nextFilter },
      queryParamsHandling: 'merge'
    });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge'
    });
    this.searchSubject.next('');
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 0);
  }

  // ─── مدیریت پیش‌نویس ذخیره‌شده فرم در حافظه محلی (DATA-02) ───
  getDraftStorageKey(): string {
    return `vehicle_draft_form_${this.selectedSectionId || 'default'}`;
  }

  saveDraftToStorage(): void {
    if (this.editingId || this.isReadOnlyMode) return;
    try {
      const draft = {
        newVehicle: this.newVehicle,
        platePart1: this.platePart1,
        platePart2: this.platePart2,
        platePart3: this.platePart3,
        platePart4: this.platePart4,
        rateFormattedDisplay: this.rateFormattedDisplay
      };
      localStorage.setItem(this.getDraftStorageKey(), JSON.stringify(draft));
    } catch {}
  }

  loadDraftFromStorage(): boolean {
    if (this.editingId) return false;
    try {
      const raw = localStorage.getItem(this.getDraftStorageKey());
      if (!raw) return false;
      const draft = JSON.parse(raw);
      if (draft && draft.newVehicle) {
        this.newVehicle = { ...this.newVehicle, ...draft.newVehicle };
        this.platePart1 = draft.platePart1 || '';
        this.platePart2 = draft.platePart2 || 'الف';
        this.platePart3 = draft.platePart3 || '';
        this.platePart4 = draft.platePart4 || '63';
        this.rateFormattedDisplay = draft.rateFormattedDisplay || '';
        if (this.newVehicle.sheba_number) {
          this.onShebaChange();
        }
        return true;
      }
    } catch {}
    return false;
  }

  clearDraftFromStorage(): void {
    try {
      localStorage.removeItem(this.getDraftStorageKey());
    } catch {}
  }

  getCleanTelUrl(phone?: string): string {
    if (!phone) return '';
    const clean = normalizeDigits(phone).replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  }

  // ─── مدیریت اکسل ───
  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.isExportingExcel = true;
    this.personnelApi.exportVehiclesExcel({ section_id: this.selectedSectionId }).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fleet_vehicles_section_${this.selectedSectionId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.show('success', 'فایل اکسل ناوگان با موفقیت دانلود شد.');
      },
      error: (err: any) => {
        this.isExportingExcel = false;
        this.toast.show('error', 'خطا در دریافت خروجی اکسل: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  openImportModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => {
      return this.personnelApi.importVehicleExcelModal(file, this.selectedSectionId, updateExisting, dryRun);
    };
    this.excelTemplateFn = () => this.downloadExcelTemplate();
    this.isExcelModalOpen = true;
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.loadRecentVehicles();
  }

  onExcelImported(res: ImportResult): void {
    this.closeExcelModal();
    this.loadRecentVehicles();
  }

  downloadExcelTemplate(): void {
    this.personnelApi.downloadVehicleTemplate().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vehicle_fleet_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.show('success', 'قالب استاندارد اکسل ناوگان با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل ناوگان')
    });
  }

  // ─── مدیریت مودال ثبت و ویرایش خودرو ───
  openNewVehicleModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.editingVehicle = null;
    this.editingId = null;
    this.rateFormattedDisplay = '';
    this.resetForm();
    const hasDraft = this.loadDraftFromStorage();
    if (hasDraft) {
      this.toast.show('info', 'پیش‌نویس ذخیره‌شده فرم خودرو بازیابی گردید.');
    }
    this.isNewVehicleModalOpen = true;
    this.cdr.detectChanges();
  }

  closeNewVehicleModal(): void {
    this.isNewVehicleModalOpen = false;
    this.editingVehicle = null;
    this.editingId = null;
    this.rateFormattedDisplay = '';
    this.matchedPersonnelNotice = null;
    this.cdr.detectChanges();
  }

  openEditModal(v: VehicleDriverProfile): void {
    if (!this.selectedSectionId && v.section) {
      this.selectedSectionId = v.section;
      this.selectedSection = this.mySections.find(s => s.id === v.section) || null;
    }
    this.editingVehicle = v;
    this.editingId = v.id || null;
    this.newVehicle = {
      ...v,
      is_driver_owner: v.is_driver_owner ?? true,
      owner_name: v.owner_name || '',
      owner_national_code: v.owner_national_code || '',
      owner_phone: v.owner_phone || '',
      vehicle_type: v.vehicle_type || 'nissan',
      ownership_type: v.ownership_type || 'contract',
      default_service_rate: v.default_service_rate || 0,
      notes: v.notes || ''
    };
    this.rateFormattedDisplay = (v.default_service_rate && v.default_service_rate > 0)
      ? Number(v.default_service_rate).toLocaleString('fa-IR')
      : '';
    this.parsePlateToParts(v.plate_number);
    this.nationalCodeError = null;
    this.ownerNationalCodeError = null;
    this.matchedPersonnelNotice = null;

    if (v.sheba_number) {
      const digits = extractShebaDigits(v.sheba_number);
      this.shebaValidationResult = validateSheba(digits);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || digits;
    } else {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
    }
    this.isNewVehicleModalOpen = true;
    this.cdr.detectChanges();
  }

  // ─── گترهای وضعیت مودال و حالت فقط‌خواندنی (isReadOnlyMode) ───
  get isApprovedRecord(): boolean {
    return !!(this.editingVehicle && (this.editingVehicle.approval_status === 'approved' || this.editingVehicle.approval_status === 'manager_approved'));
  }

  get isRevisionMode(): boolean {
    return !!(this.editingVehicle && this.editingVehicle.approval_status === 'revision_required');
  }

  get isReadOnlyMode(): boolean {
    if (!this.editingVehicle) return false;
    if (this.isApprovedRecord) return false;
    return this.editingVehicle.approval_status !== 'draft' && this.editingVehicle.approval_status !== 'revision_required';
  }

  get modalHeaderTitle(): string {
    if (!this.editingId) return 'ثبت مشخصات خودرو و راننده جدید';
    if (this.isReadOnlyMode) return `مشاهده پرونده خودرو «${this.editingVehicle?.plate_number}»`;
    if (this.isApprovedRecord) return `ویرایش مشخصات خودرو «${this.editingVehicle?.plate_number}» (پیشنهاد تغییرات)`;
    if (this.isRevisionMode) return `اصلاح مشخصات خودرو «${this.editingVehicle?.plate_number}» (عودت سرپرست)`;
    return `ویرایش پیش‌نویس خودرو «${this.editingVehicle?.plate_number}»`;
  }

  toggleIsDriverOwner(checked: boolean): void {
    this.newVehicle.is_driver_owner = checked;
    if (checked) {
      this.newVehicle.owner_name = '';
      this.newVehicle.owner_national_code = '';
      this.newVehicle.owner_phone = '';
      this.ownerNationalCodeError = null;
    }
    this.saveDraftToStorage();
  }

  // ─── تحلیل و ترکیب ۴ بخشی پلاک ملی ایران ───
  parsePlateToParts(plateStr?: string): void {
    if (!plateStr) {
      this.platePart1 = '';
      this.platePart2 = 'الف';
      this.platePart3 = '';
      this.platePart4 = '63';
      return;
    }
    const clean = normalizeDigits(plateStr).trim();
    const match = clean.match(/^(\d{2})\s*([^\d\s]+)\s*(\d{3})\s*(?:ایران|-)?\s*(\d{2})$/);
    if (match) {
      this.platePart1 = match[1];
      this.platePart2 = match[2];
      this.platePart3 = match[3];
      this.platePart4 = match[4];
    } else {
      this.platePart1 = clean.slice(0, 2);
      this.platePart2 = 'الف';
      this.platePart3 = '';
      this.platePart4 = '63';
    }
  }

  onPlatePartChange(): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
  }

  onPlatePart1Input(event: any): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    const val = normalizeDigits(this.platePart1).replace(/\D/g, '');
    if (val.length >= 2) {
      this.p2Select?.nativeElement.focus();
    }
  }

  onPlatePart2Change(): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    this.p3Input?.nativeElement.focus();
  }

  onPlatePart3Input(event: any): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    const val = normalizeDigits(this.platePart3).replace(/\D/g, '');
    if (val.length >= 3) {
      this.p4Input?.nativeElement.focus();
    }
  }

  onPlatePart4Input(event: any): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
  }

  updatePlateFromParts(): void {
    const p1 = normalizeDigits(this.platePart1).replace(/\D/g, '').slice(0, 2);
    const p2 = this.platePart2 || 'الف';
    const p3 = normalizeDigits(this.platePart3).replace(/\D/g, '').slice(0, 3);
    const p4 = normalizeDigits(this.platePart4).replace(/\D/g, '').slice(0, 2);

    this.platePart1 = p1;
    this.platePart3 = p3;
    this.platePart4 = p4;

    if (p1 && p3 && p4) {
      this.newVehicle.plate_number = `${p1} ${p2} ${p3} ایران ${p4}`;
    } else if (p1 || p3) {
      this.newVehicle.plate_number = `${p1 || ''} ${p2} ${p3 || ''} ایران ${p4 || ''}`.trim();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.isPendingDiffModalOpen) {
      this.closePendingDiffModal();
      return;
    }
    if (this.isNewVehicleModalOpen) {
      this.closeNewVehicleModal();
      return;
    }
    if (this.isExcelModalOpen) {
      this.closeExcelModal();
    }
  }

  // ─── مدیریت ورود نرخ با جداکننده هزارگان ───
  onRateInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const oldVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const oldSel = inputEl?.selectionStart ?? 0;
    const cleanDigits = normalizeDigits(oldVal).replace(/\D/g, '');
    const num = Number(cleanDigits) || 0;
    this.newVehicle.default_service_rate = num;
    this.rateFormattedDisplay = num > 0 ? num.toLocaleString('fa-IR') : '';
    this.saveDraftToStorage();
    if (inputEl && typeof event !== 'string') {
      const digitsBeforeCursor = normalizeDigits(oldVal.slice(0, oldSel)).replace(/\D/g, '').length;
      inputEl.value = this.rateFormattedDisplay;
      let newPos = 0;
      let countedDigits = 0;
      for (let i = 0; i < this.rateFormattedDisplay.length; i++) {
        if (countedDigits >= digitsBeforeCursor) break;
        if (/\d/.test(normalizeDigits(this.rateFormattedDisplay[i]))) {
          countedDigits++;
        }
        newPos = i + 1;
      }
      try { inputEl.setSelectionRange(newPos, newPos); } catch {}
    }
  }

  // ─── اعتبارسنجی و فرمت‌بندی پیشرفته شماره شبا ───
  onShebaInput(event: any): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const inputEl = event?.target as HTMLInputElement | undefined;
      const oldVal = inputEl?.value || (typeof event === 'string' ? event : '');
      const oldSel = inputEl?.selectionStart ?? 0;
      const digitsBeforeCursor = extractShebaDigits(oldVal.slice(0, oldSel)).length;

      const digits = extractShebaDigits(oldVal);
      const res = validateSheba(digits);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || digits;
      this.newVehicle.sheba_number = res.rawSheba;
      if (res.bank) {
        this.newVehicle.bank_name = res.bank.name;
      }
      if (res.accountNumber) {
        this.newVehicle.account_number = res.accountNumber;
      }
      this.saveDraftToStorage();
      if (inputEl && typeof event !== 'string') {
        inputEl.value = this.shebaDigitsDisplay;
        let newPos = 0;
        let countedDigits = 0;
        for (let i = 0; i < this.shebaDigitsDisplay.length; i++) {
          if (countedDigits >= digitsBeforeCursor) break;
          if (/\d/.test(this.shebaDigitsDisplay[i])) {
            countedDigits++;
          }
          newPos = i + 1;
        }
        try { inputEl.setSelectionRange(newPos, newPos); } catch {}
      }
    } finally {
      this._isSyncingBank = false;
    }
  }

  copyShebaToClipboard(sheba?: string): void {
    const raw = sheba || this.newVehicle.sheba_number || '';
    if (!raw) return;
    const clean = 'IR' + extractShebaDigits(raw);
    this.isShebaCopied = true;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(clean).then(() => {
        this.toast.show('success', 'شماره شبا در کلیپ‌بورد کپی شد.');
        setTimeout(() => this.isShebaCopied = false, 2500);
      }).catch(() => {
        this.toast.show('info', clean);
      });
    } else {
      this.toast.show('info', clean);
      setTimeout(() => this.isShebaCopied = false, 2500);
    }
  }

  openBankDropdown(): void {
    if (!this.isReadOnlyMode) {
      this.isBankDropdownOpen = true;
      this.bankSearchQuery = '';
    }
  }

  onShebaChange(): void {
    const raw = this.newVehicle.sheba_number || '';
    if (!raw.trim()) {
      this.shebaValidationResult = null;
      this.saveDraftToStorage();
      return;
    }
    const clean = cleanShebaInput(raw);
    this.shebaValidationResult = validateSheba(clean);
    if (this.shebaValidationResult.isValid && this.shebaValidationResult.bank) {
      this.newVehicle.bank_name = this.shebaValidationResult.bank.name;
      if (!this.newVehicle.account_number) {
        this.newVehicle.account_number = extractAccountNumberFromSheba(clean);
      }
    }
    this.saveDraftToStorage();
  }

  // ─── مدیریت دوطرفه شماره حساب بانکی و شبا (Banking Standard) ───
  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.newVehicle.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }

    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.newVehicle.bank_name) {
      const generated = generateShebaFromAccount(this.newVehicle.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.newVehicle.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.saveDraftToStorage();
    this.cdr.detectChanges();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onAccountNumberInput(pasted);
  }

  onAccountNumberCopy(event: ClipboardEvent): void {
    const acc = this.newVehicle.account_number || '';
    if (acc && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', acc);
      this.isAccountCopied = true;
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.newVehicle.account_number || '';
    if (!acc) return;
    this.isAccountCopied = true;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(acc).then(() => {
        this.toast.show('success', 'شماره حساب در کلیپ‌بورد کپی شد.');
        setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('warning', 'امکان کپی خودکار مقدور نشد.');
      });
    } else {
      this.toast.show('success', 'شماره حساب کپی شد.');
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  onBankSelect(bankName: string): void {
    this.newVehicle.bank_name = bankName;
    const accValidation = validateAccountNumber(this.newVehicle.account_number);
    if (accValidation.isValid && bankName) {
      const generated = generateShebaFromAccount(bankName, this.newVehicle.account_number);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.newVehicle.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.saveDraftToStorage();
    this.cdr.detectChanges();
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.onBankSelect(bank.name);
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
  }

  convertAccountToShebaNow(): void {
    if (!this.newVehicle.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.newVehicle.account_number);
    if (!accValidation.isValid) {
      this.toast.show('warning', accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(this.newVehicle.bank_name, this.newVehicle.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.show('success', `شماره شبا با موفقیت بر اساس بانک ${this.newVehicle.bank_name} تولید شد.`);
    } else {
      this.toast.show('error', 'امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  // ─── اعتبارسنجی الگوریتم ۱۰ رقمی کد ملی راننده (Mod 11) و انطباق با پرسنل موجود ───
  onNationalCodeChange(): void {
    const raw = (this.newVehicle.driver_national_code || '').trim();
    if (!raw) {
      this.nationalCodeError = null;
      this.matchedPersonnelNotice = null;
      this.saveDraftToStorage();
      return;
    }
    const code = normalizeDigits(raw).replace(/\D/g, '');
    this.newVehicle.driver_national_code = code;

    if (code.length !== 10) {
      this.nationalCodeError = 'کد ملی باید دقیقاً ۱۰ رقم عددی باشد.';
      this.matchedPersonnelNotice = null;
      this.saveDraftToStorage();
      return;
    }
    if (/^(\d)\1{9}$/.test(code)) {
      this.nationalCodeError = 'کد ملی نامعتبر است (ارقام تکراری).';
      this.matchedPersonnelNotice = null;
      this.saveDraftToStorage();
      return;
    }
    const digits = code.split('').map(Number);
    const checksum = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const rem = sum % 11;
    const isValid = (rem < 2 && checksum === rem) || (rem >= 2 && checksum === 11 - rem);
    this.nationalCodeError = isValid ? null : 'ساختار کد ملی نامعتبر است (خطای رقم کنترلی).';

    this.saveDraftToStorage();

    if (isValid) {
      this.searchMatchingPersonnel(code);
    } else {
      this.matchedPersonnelNotice = null;
    }
  }

  // ─── جستجوی هوشمند در لیست پرسنل موجود شرکت جهت پیش‌پر کردن اطلاعات راننده (LEAK-01) ───
  private searchMatchingPersonnel(nationalCode: string): void {
    this.personnelSearchSub?.unsubscribe();
    this.personnelSearchSub = this.personnelApi.getPersonnelProfiles({ search: nationalCode }).subscribe({
      next: (res) => {
        const found = res?.find(p => p.national_code === nationalCode);
        if (found) {
          this.matchedPersonnelNotice = `یافت شد: ${found.first_name} ${found.last_name} (${found.job_title || 'پرسنل شاغل'})`;
          if (!this.newVehicle.driver_name) {
            this.newVehicle.driver_name = `${found.first_name} ${found.last_name}`;
          }
          if (!this.newVehicle.driver_phone && found.phone_number) {
            this.newVehicle.driver_phone = found.phone_number;
          }
          if (!this.newVehicle.sheba_number && found.sheba_number) {
            this.newVehicle.sheba_number = found.sheba_number;
            this.onShebaChange();
          }
          this.saveDraftToStorage();
          this.cdr.detectChanges();
        } else {
          this.matchedPersonnelNotice = null;
        }
      },
      error: () => {
        this.matchedPersonnelNotice = null;
      }
    });
  }

  // ─── اعتبارسنجی کد ملی مالک خودرو ───
  onOwnerNationalCodeChange(): void {
    const raw = (this.newVehicle.owner_national_code || '').trim();
    if (!raw) {
      this.ownerNationalCodeError = null;
      this.saveDraftToStorage();
      return;
    }
    const code = normalizeDigits(raw).replace(/\D/g, '');
    this.newVehicle.owner_national_code = code;

    if (code.length !== 10) {
      this.ownerNationalCodeError = 'کد ملی مالک باید دقیقاً ۱۰ رقم عددی باشد.';
      this.saveDraftToStorage();
      return;
    }
    if (/^(\d)\1{9}$/.test(code)) {
      this.ownerNationalCodeError = 'کد ملی مالک نامعتبر است (ارقام تکراری).';
      this.saveDraftToStorage();
      return;
    }
    const digits = code.split('').map(Number);
    const checksum = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const rem = sum % 11;
    const isValid = (rem < 2 && checksum === rem) || (rem >= 2 && checksum === 11 - rem);
    this.ownerNationalCodeError = isValid ? null : 'ساختار کد ملی مالک نامعتبر است (خطای رقم کنترلی).';
    this.saveDraftToStorage();
  }

  // ─── معادل تومان نرخ پیش‌فرض ───
  get rateInTomans(): number {
    return Math.floor((Number(this.newVehicle.default_service_rate) || 0) / 10);
  }

  // ─── ثبت و بروزرسانی پرونده خودرو (پیش‌نویس، ارسال به سرپرست یا پیشنهاد ویرایش) ───
  saveVehicle(targetStatus: 'draft' | 'pending_supervisor' | 'approved' = 'draft'): void {
    if (this.isReadOnlyMode) {
      this.closeNewVehicleModal();
      return;
    }
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.updatePlateFromParts();
    if (!this.newVehicle.plate_number?.trim()) {
      this.toast.show('warning', 'شماره پلاک خودرو الزامی است.');
      return;
    }
    if (!this.newVehicle.driver_name?.trim()) {
      this.toast.show('warning', 'نام و نام خانوادگی راننده الزامی است.');
      return;
    }
    if (this.nationalCodeError) {
      this.toast.show('warning', this.nationalCodeError);
      return;
    }

    // بررسی مشخصات مالک در صورت تفکیک راننده و مالک
    if (!this.newVehicle.is_driver_owner) {
      if (!this.newVehicle.owner_name?.trim()) {
        this.toast.show('warning', 'نام و نام خانوادگی مالک خودرو الزامی است.');
        return;
      }
      if (this.ownerNationalCodeError) {
        this.toast.show('warning', this.ownerNationalCodeError);
        return;
      }
    }

    if (this.shebaValidationResult && !this.shebaValidationResult.isValid) {
      this.toast.show('warning', this.shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.');
      return;
    }

    this.isSaving = true;

    const payload: Partial<VehicleDriverProfile> = {
      ...this.newVehicle,
      plate_number: this.newVehicle.plate_number.trim(),
      driver_name: this.newVehicle.driver_name.trim(),
      driver_national_code: this.newVehicle.driver_national_code?.trim() || undefined,
      driver_phone: this.newVehicle.driver_phone?.trim() || undefined,
      is_driver_owner: this.newVehicle.is_driver_owner ?? true,
      owner_name: !this.newVehicle.is_driver_owner ? (this.newVehicle.owner_name?.trim() || undefined) : undefined,
      owner_national_code: !this.newVehicle.is_driver_owner ? (this.newVehicle.owner_national_code?.trim() || undefined) : undefined,
      owner_phone: !this.newVehicle.is_driver_owner ? (this.newVehicle.owner_phone?.trim() || undefined) : undefined,
      default_service_rate: Number(this.newVehicle.default_service_rate) || 0,
      sheba_number: this.newVehicle.sheba_number ? cleanShebaInput(this.newVehicle.sheba_number) : undefined,
      notes: this.newVehicle.notes?.trim() || undefined,
      section: this.selectedSectionId,
      company: this.selectedSection?.company_id || (this.selectedSection as any)?.company || this.mySections.find(s => Number(s.id) === Number(this.selectedSectionId))?.company_id || undefined,
      approval_status: targetStatus,
      is_active: true
    };

    if (this.editingId) {
      this.personnelApi.updateVehicleProfile(this.editingId, payload).subscribe({
        next: (res: any) => {
          this.isSaving = false;
          const plate = res?.plate_number || this.newVehicle.plate_number;
          if (this.isApprovedRecord) {
            this.toast.show('success', `درخواست تغییرات خودرو «${plate}» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.`);
          } else if (this.isRevisionMode) {
            this.toast.show('success', `پرونده خودرو «${plate}» پس از اصلاح، مجدداً به کارتابل سرپرست ارسال گردید.`);
          } else if (targetStatus === 'pending_supervisor') {
            this.toast.show('success', `پرونده خودرو «${plate}» به کارتابل سرپرست ارسال گردید.`);
          } else {
            this.toast.show('success', `تغییرات پیش‌نویس خودرو «${plate}» با موفقیت ذخیره شد.`);
          }
          this.closeNewVehicleModal();
          this.loadRecentVehicles();
        },
        error: (err: any) => {
          this.isSaving = false;
          const msg = err.error?.plate_number?.[0] || err.error?.error || err.message || 'نامشخص';
          this.toast.show('error', 'خطا در ویرایش خودرو: ' + msg);
          this.cdr.detectChanges();
        }
      });
    } else {
      this.personnelApi.createVehicleProfile(payload).subscribe({
        next: (created: VehicleDriverProfile) => {
          this.isSaving = false;
          this.clearDraftFromStorage();
          if (targetStatus === 'pending_supervisor') {
            this.toast.show('success', `خودرو «${created.plate_number}» ثبت و به کارتابل سرپرست ارسال گردید.`);
          } else {
            this.toast.show('success', `خودرو «${created.plate_number}» با راننده «${created.driver_name}» در وضعیت پیش‌نویس ثبت شد.`);
          }
          this.closeNewVehicleModal();
          this.loadRecentVehicles();
        },
        error: (err: any) => {
          this.isSaving = false;
          const msg = err.error?.plate_number?.[0] || err.error?.error || err.message || 'نامشخص';
          this.toast.show('error', 'خطا در ثبت خودرو: ' + msg);
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ─── ارسال مستقیم پیش‌نویس به کارتابل سرپرست (Quick Submit) ───
  submitDraftToSupervisor(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.personnelApi.updateVehicleProfile(v.id, { approval_status: 'pending_supervisor' }).subscribe({
      next: (updated: VehicleDriverProfile) => {
        this.toast.show('success', `پرونده خودرو «${updated.plate_number}» به کارتابل سرپرست بخش ارسال گردید.`);
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در ارسال پرونده به سرپرست: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── مدیریت مودال مشاهده تغییرات معلق (Diff Viewer) ───
  openPendingDiffModal(v: VehicleDriverProfile): void {
    this.pendingDiffVehicle = v;
    this.isPendingDiffModalOpen = true;
    this.cdr.detectChanges();
  }

  closePendingDiffModal(): void {
    this.isPendingDiffModalOpen = false;
    this.pendingDiffVehicle = null;
    this.cdr.detectChanges();
  }

  isReadOnlyVehicle(v: VehicleDriverProfile): boolean {
    if (v.approval_status === 'approved' || v.approval_status === 'manager_approved') return false;
    return v.approval_status !== 'draft' && v.approval_status !== 'revision_required';
  }

  getPreviousValueDisplay(key: string): string {
    if (!this.pendingDiffVehicle?.pending_change_request?.previous_values) {
      const directVal = (this.pendingDiffVehicle as any)?.[key];
      return this.formatDiffValue(key, directVal);
    }
    const prevVal = this.pendingDiffVehicle.pending_change_request.previous_values[key];
    return this.formatDiffValue(key, prevVal);
  }

  getProposedValueDisplay(key: string, value: any): string {
    return this.formatDiffValue(key, value);
  }

  private formatDiffValue(key: string, value: any): string {
    if (value === undefined || value === null || value === '') return '—';
    if (key === 'default_service_rate') {
      return this.formatNumber(value) + ' ریال';
    }
    if (key === 'vehicle_type') {
      return this.getVehicleTypeLabel(value);
    }
    if (key === 'ownership_type') {
      return this.getOwnershipTypeLabel(value);
    }
    if (key === 'is_driver_owner') {
      return value ? 'بله (راننده)' : 'خیر (غیر راننده)';
    }
    if (key === 'is_active') {
      return value ? 'فعال' : 'غیرفعال';
    }
    return String(value);
  }

  resetForm(): void {
    this.newVehicle = {
      plate_number: '',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: '',
      driver_national_code: '',
      driver_phone: '',
      is_driver_owner: true,
      owner_name: '',
      owner_national_code: '',
      owner_phone: '',
      default_service_rate: 0,
      bank_name: '',
      account_number: '',
      sheba_number: '',
      notes: '',
      is_active: true,
      approval_status: 'draft'
    };
    this.platePart1 = '';
    this.platePart2 = 'الف';
    this.platePart3 = '';
    this.platePart4 = '63';
    this.rateFormattedDisplay = '';
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isShebaCopied = false;
    this.isAccountCopied = false;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.nationalCodeError = null;
    this.ownerNationalCodeError = null;
    this.matchedPersonnelNotice = null;
  }

  // ─── حذف خودرو پیش‌نویس یا عودت‌داده‌شده ───
  deleteDraftVehicle(vehicle: VehicleDriverProfile): void {
    if (!vehicle.id) return;
    if (vehicle.approval_status !== 'draft' && vehicle.approval_status !== 'revision_required') {
      this.toast.show('warning', 'فقط خودروهای در وضعیت پیش‌نویس یا عودت‌داده‌شده قابل حذف توسط کارمند هستند.');
      return;
    }

    const typeDesc = vehicle.approval_status === 'revision_required' ? 'عودت‌داده‌شده' : 'پیش‌نویس';
    if (!confirm(`آیا از حذف پرونده ${typeDesc} خودرو شماره «${vehicle.plate_number}» (${vehicle.driver_name}) اطمینان دارید؟`)) {
      return;
    }

    this.personnelApi.deleteVehicleProfile(vehicle.id).subscribe({
      next: () => {
        this.toast.show('success', `پرونده ${typeDesc} خودرو «${vehicle.plate_number}» با موفقیت حذف گردید.`);
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در حذف پیش‌نویس خودرو: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── فرمت‌بندی و نمایش وضعیت (Concise Icons & Labels) ───
  getStatusBadgeClass(status?: string): string {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'pending_supervisor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'manager_approved':
      case 'pending_manager':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'revision_required':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getStatusIcon(status?: string): string {
    switch (status) {
      case 'draft':
        return '📝';
      case 'pending_supervisor':
      case 'pending_manager':
        return '⏳';
      case 'manager_approved':
      case 'approved':
        return '✓';
      case 'revision_required':
        return '↩';
      case 'rejected':
        return '✕';
      default:
        return '•';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس';
      case 'pending_supervisor':
        return 'در انتظار سرپرست';
      case 'manager_approved':
        return 'تایید مدیر';
      case 'approved':
        return 'مصوب';
      case 'revision_required':
        return 'عودت جهت اصلاح';
      case 'rejected':
        return 'رد شده';
      default:
        return status || 'نامشخص';
    }
  }

  getFullStatusDescription(status?: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس ثبت شده توسط کارمند بخش ترابری';
      case 'pending_supervisor':
        return 'در انتظار بررسی و تایید سرپرست کارگاه';
      case 'manager_approved':
        return 'تایید اولیه مدیر / در انتظار نهایی‌سازی';
      case 'approved':
        return 'تصویب و فعال‌سازی نهایی شده در ناوگان رسمی';
      case 'revision_required':
        return 'نیازمند بازنگری و اصلاح توسط کارمند';
      case 'rejected':
        return 'رد شده و غیرقابل استفاده';
      default:
        return status || 'نامشخص';
    }
  }

  getVehicleTypeLabel(type?: string): string {
    const found = this.vehicleTypesFlat.find(t => t.value === type);
    return found ? found.label : (type || '-');
  }

  getOwnershipTypeLabel(type?: string): string {
    const found = this.ownershipTypes.find(t => t.value === type);
    return found ? found.label : (type || '-');
  }

  formatNumber(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '۰';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString('fa-IR');
  }

  formatShebaDisplay(sheba?: string): string {
    if (!sheba) return '—';
    const clean = sheba.replace(/\s+/g, '').toUpperCase();
    return clean.replace(/(.{4})/g, '$1 ').trim();
  }

  navigateToPersonnel(): void {
    this.router.navigate(['/app/finance/employee-new-personnel'], {
      queryParams: this.selectedSectionId ? { section_id: this.selectedSectionId } : {}
    });
  }
}
