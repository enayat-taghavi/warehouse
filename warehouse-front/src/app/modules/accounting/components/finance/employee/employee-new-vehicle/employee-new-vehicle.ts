import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  ProjectSection,
  VehicleDriverProfile,
  VehicleBankAccount,
  VehicleDocument,
  WorkflowAuditLog
} from '../../../../models/personnel.model';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';
import { ExcelImportModal } from '../../../../../../shared/components/excel-import-modal/excel-import-modal';
import { ImportResult } from '../../../../../../core/http/accounts-http.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
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
} from '../../../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ServerUrlPipe } from '../../../../../../shared/pipes/server-url.pipe';
import { saveBlob } from '../../../../../../core/platform/file-output';

export type VehicleStatusFilter = 'all' | 'draft' | 'pending_supervisor' | 'revision_required' | 'approved' | 'rejected';
export type VehicleModalTab = 'technical' | 'driver' | 'owner' | 'banking' | 'documents_expiry';

export const ROAD_VEHICLE_TYPES = ['pickup', 'nissan', 'khavar', 'sedan', 'truck', 'trailer'];

export function isRoadVehicleType(type?: string): boolean {
  if (!type) return false;
  return ROAD_VEHICLE_TYPES.includes(type);
}

@Component({
  selector: 'app-employee-new-vehicle-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgPersianDatepickerModule,
    ExcelImportModal,
    SvgIconDirective,
    ActionButtonComponent,
    TabBarComponent,
    ServerUrlPipe
  ],
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
  private pendingOpenNewModal: boolean = false;

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
  isCancellingChangeRequest: boolean = false;

  // ─── وضعیت باز بودن مودال ثبت / ویرایش خودرو ───
  isNewVehicleModalOpen: boolean = false;
  editingVehicle: VehicleDriverProfile | null = null;
  editingId: number | null = null;
  rateFormattedDisplay: string = '';

  // ─── مدیریت تب‌های ۵گانه مودال ثبت / ویرایش خودرو (تسک ۶.۱) ───
  activeModalTab: VehicleModalTab = 'technical';
  serverMissingFields: string[] = [];

  // ─── بخش‌های ۴ گانه پلاک خودرو ملی ───
  platePart1: string = '';
  platePart2: string = 'الف';
  platePart3: string = '';
  platePart4: string = '63';
  freePlateNumber: string = '';

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
    insurance_expiry_date: null,
    inspection_expiry_date: null,
    license_expiry_date: null,
    valid_until_date: null,
    is_active: true,
    approval_status: 'draft'
  };

  // ─── فرم‌کنترل‌های تاریخ شمسی (CRITICAL INVARIANT: paired with ReactiveForms) ───
  insuranceDateControl = new FormControl('');
  inspectionDateControl = new FormControl('');
  licenseDateControl = new FormControl('');
  validUntilDateControl = new FormControl('');
  docExpiryDateControl = new FormControl('');

  // ─── مدیریت حساب‌های بانکی چندگانه (تسک ۶.۴) ───
  bankAccounts: VehicleBankAccount[] = [];
  newAccountPayeeType: 'driver' | 'owner' | 'other' = 'driver';

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

  // ─── مدیریت مدارک و اسناد خودرو (تسک ۶.۶) ───
  vehicleDocuments: VehicleDocument[] = [];
  pendingUploadDocuments: Array<{
    file: File;
    name: string;
    doc_type: string;
    title: string;
    expiry_date?: string;
  }> = [];
  selectedDocTypeForUpload: string = 'car_card';
  docUploadTitle: string = '';

  readonly docTypeOptions = [
    { value: 'car_card', label: 'کارت خودرو / سند مالکیت' },
    { value: 'insurance', label: 'بیمه‌نامه شخص ثالث' },
    { value: 'inspection', label: 'گواهی معاینه فنی' },
    { value: 'driver_license', label: 'گواهینامه راننده' },
    { value: 'contract', label: 'قرارداد استیجاری / پیمانکاری' },
    { value: 'other', label: 'سایر مدارک' }
  ];

  // لایت‌باکس پیش‌نمایش تصویر مدرک
  isLightboxOpen: boolean = false;
  lightboxImageUrl: string = '';
  lightboxTitle: string = '';

  // ─── فاز ۷: تایملاین گردش کار و ممیزی (WorkflowAuditLog) ───
  isTimelineModalOpen: boolean = false;
  timelineVehicle: VehicleDriverProfile | null = null;
  timelineLogs: WorkflowAuditLog[] = [];
  isLoadingTimeline: boolean = false;

  // کپی سریع با فیدبک ۲ ثانیه‌ای
  private copiedKey: string | null = null;
  private copiedTimeout: any = null;

  // بازگشایی پرونده ردشده
  isReopening: boolean = false;

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
    insurance_expiry_date: 'انقضای بیمه شخص ثالث',
    inspection_expiry_date: 'انقضای معاینه فنی',
    license_expiry_date: 'انقضای گواهینامه راننده',
    valid_until_date: 'پایان اعتبار قرارداد',
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
    this.initDateControls();
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
      const editId = params['edit'] ? Number(params['edit']) : (params['id'] ? Number(params['id']) : null);
      if (editId && !isNaN(editId)) {
        this.personnelApi.getVehicleDriverProfile(editId).subscribe({
          next: (v) => {
            this.openEditModal(v);
          },
          error: () => {
            this.toast.show('error', 'خطا در بارگذاری پرونده خودرو برای ویرایش');
          }
        });
      } else if (params['new'] === 'true' || params['new'] === true) {
        if (this.selectedSectionId) {
          this.openNewVehicleModal();
        } else {
          this.pendingOpenNewModal = true;
        }
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
    if (this.copiedTimeout) {
      clearTimeout(this.copiedTimeout);
    }
  }

  private initDateControls(): void {
    this.insuranceDateControl.valueChanges.subscribe(val => {
      this.newVehicle.insurance_expiry_date = val || null;
      this.saveDraftToStorage();
    });
    this.inspectionDateControl.valueChanges.subscribe(val => {
      this.newVehicle.inspection_expiry_date = val || null;
      this.saveDraftToStorage();
    });
    this.licenseDateControl.valueChanges.subscribe(val => {
      this.newVehicle.license_expiry_date = val || null;
      this.saveDraftToStorage();
    });
    this.validUntilDateControl.valueChanges.subscribe(val => {
      this.newVehicle.valid_until_date = val || null;
      this.saveDraftToStorage();
    });
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
      if (msg && (msg.type_str === 'vehicle_updated' || msg.type === 'vehicle_updated' || msg.type === 'vehicle_status_changed')) {
        this.handleVehicleWebSocketUpdate(msg);
      }
    });
  }

  // ─── تسک ۷.۵: به‌روزرسانی درجای سطر و آمار با رویدادهای وب‌سوکت ───
  handleVehicleWebSocketUpdate(msg: any): void {
    if (!msg) return;
    const cId = msg.company_id || msg.metadata?.company_id;
    const currentCompanyId = this.activeCompanyService?.activeCompanySignal?.()?.id;
    if (currentCompanyId && cId && Number(cId) !== Number(currentCompanyId)) {
      return;
    }
    const sId = msg.section_id || msg.metadata?.section_id;
    if (this.selectedSectionId && sId && Number(sId) !== Number(this.selectedSectionId)) {
      return;
    }
    const vehicleId = msg.vehicle_id || msg.id || msg.object_id || msg.metadata?.vehicle_id;
    if (!vehicleId) {
      this.loadRecentVehicles();
      return;
    }

    const hasInlineData = !!(msg.data || msg.approval_status || msg.to_status || msg.action || msg.driver_name || msg.plate_number || msg.vehicle_type);
    if (!hasInlineData) {
      this.loadRecentVehicles();
      return;
    }

    if (msg.action === 'deleted') {
      this.recentVehicles = this.recentVehicles.filter(v => v.id !== vehicleId);
      if (this.editingVehicle && this.editingVehicle.id === vehicleId) {
        this.closeNewVehicleModal();
        this.toast.show('info', 'پرونده باز شده توسط کاربر دیگر حذف گردید.');
      }
      this.cdr.detectChanges();
      return;
    }

    const index = this.recentVehicles.findIndex(v => v.id === vehicleId);
    if (index !== -1) {
      const existing = this.recentVehicles[index];
      const updated: VehicleDriverProfile = {
        ...existing,
        ...msg.data,
        approval_status: msg.approval_status || msg.to_status || existing.approval_status,
        rejection_reason: msg.rejection_reason !== undefined ? msg.rejection_reason : (msg.reason || existing.rejection_reason),
        has_pending_changes: msg.has_pending_changes !== undefined ? msg.has_pending_changes : existing.has_pending_changes
      };
      if (msg.driver_name) updated.driver_name = msg.driver_name;
      if (msg.plate_number) updated.plate_number = msg.plate_number;
      if (msg.vehicle_type) updated.vehicle_type = msg.vehicle_type;

      this.recentVehicles[index] = updated;
      this.recentVehicles = [...this.recentVehicles];
      if (this.editingVehicle && this.editingVehicle.id === vehicleId) {
        this.editingVehicle = { ...updated };
      }
      this.cdr.detectChanges();
    } else {
      this.loadRecentVehicles();
    }
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
        if (this.pendingOpenNewModal) {
          this.pendingOpenNewModal = false;
          this.openNewVehicleModal();
        }
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

  // ─── تب‌های حافظه‌دار وضعیت و مراحل ثبت برای app-tab-bar ───
  private statusFilterTabsKey = '';
  private statusFilterTabsCache: TabDef[] = [];
  get statusFilterTabs(): TabDef[] {
    const vm = this.vehicleMetrics;
    const key = `${vm.total}:${vm.drafts}:${vm.pending}:${vm.revision}:${vm.approved}:${vm.rejected}`;
    if (key !== this.statusFilterTabsKey) {
      this.statusFilterTabsKey = key;
      this.statusFilterTabsCache = [
        { id: 'all', label: 'همه', icon: 'status-all', count: vm.total },
        { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: vm.drafts },
        { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending', count: vm.pending },
        { id: 'revision_required', label: 'نیازمند اصلاح', shortLabel: 'اصلاح', icon: 'status-revision', count: vm.revision, tone: 'amber' },
        { id: 'approved', label: 'مصوب', icon: 'status-approved', count: vm.approved, tone: 'emerald' },
        { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected', count: vm.rejected, tone: 'rose' },
      ];
    }
    return this.statusFilterTabsCache;
  }

  private vehicleModalTabsKey = '';
  private vehicleModalTabsCache: TabDef[] = [];
  get vehicleModalTabs(): TabDef[] {
    const key = `${this.hasServerMissingForTab('technical')}:${this.isTabComplete('technical')}:${this.hasServerMissingForTab('driver')}:${this.isTabComplete('driver')}:${this.hasServerMissingForTab('owner')}:${this.isTabComplete('owner')}:${this.hasServerMissingForTab('banking')}:${this.isTabComplete('banking')}:${this.hasServerMissingForTab('documents_expiry')}:${this.isTabComplete('documents_expiry')}`;
    if (key !== this.vehicleModalTabsKey) {
      this.vehicleModalTabsKey = key;
      // نقطه وضعیت قالب پیشین: نقص سروری (قرمز چشمک‌زن)، تکمیل (سبز)، ناقص (کهربایی)
      const step = (tab: 'technical' | 'driver' | 'owner' | 'banking' | 'documents_expiry', done = 'تکمیل شده', todo = 'ناقص'): TabDef['indicator'] =>
        this.hasServerMissingForTab(tab)
          ? { tone: 'rose', label: 'دارای نقص سروری', pulse: true }
          : this.isTabComplete(tab)
            ? { tone: 'emerald', label: done }
            : { tone: 'amber', label: todo };
      this.vehicleModalTabsCache = [
        { id: 'technical', label: '۱. مشخصات فنی و پلاک', shortLabel: 'فنی', icon: 'truck', indicator: step('technical') },
        { id: 'driver', label: '۲. مشخصات راننده', shortLabel: 'راننده', icon: 'user', indicator: step('driver') },
        { id: 'owner', label: '۳. مشخصات مالک', shortLabel: 'مالک', icon: 'key', indicator: step('owner') },
        { id: 'banking', label: '۴. حساب‌های بانکی', shortLabel: 'بانک', icon: 'credit-card', indicator: step('banking', 'حساب اصلی ثبت شده', 'بدون حساب اصلی') },
        { id: 'documents_expiry', label: '۵. مدارک و انقضا', shortLabel: 'مدارک', icon: 'file-text', indicator: step('documents_expiry') },
      ];
    }
    return this.vehicleModalTabsCache;
  }

  // ─── رفتار دوحالته (Toggle) تب‌های وضعیت طبق Rule 7 ───
  setStatusFilter(filter: string): void {
    if (
      filter === 'all' ||
      filter === 'draft' ||
      filter === 'pending_supervisor' ||
      filter === 'revision_required' ||
      filter === 'approved' ||
      filter === 'rejected'
    ) {
      const nextFilter: VehicleStatusFilter = (this.statusFilter === filter && filter !== 'all') ? 'all' : filter;
      this.statusFilter = nextFilter;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { status_filter: nextFilter === 'all' ? null : nextFilter },
        queryParamsHandling: 'merge'
      });
    }
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

  // ─── تسک ۶.۱: مدیریت تب‌های ۵گانه و گیت‌های تکمیل ───
  setActiveTab(tab: VehicleModalTab): void {
    this.activeModalTab = tab;
    this.cdr.detectChanges();
  }

  isRoadVehicle(type?: string): boolean {
    return isRoadVehicleType(type || this.newVehicle.vehicle_type);
  }

  isValidPhone(phone?: string): boolean {
    if (!phone) return false;
    const clean = normalizeDigits(phone).replace(/\D/g, '');
    return /^09\d{9}$/.test(clean);
  }

  isValidNationalCode(code?: string): boolean {
    if (!code) return false;
    const clean = normalizeDigits(code).replace(/\D/g, '');
    if (clean.length !== 10) return false;
    if (/^(\d)\1{9}$/.test(clean)) return false;
    const digits = clean.split('').map(Number);
    const checksum = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const rem = sum % 11;
    return (rem < 2 && checksum === rem) || (rem >= 2 && checksum === 11 - rem);
  }

  hasServerMissingForTab(tab: string): boolean {
    if (!this.serverMissingFields || this.serverMissingFields.length === 0) return false;
    const str = this.serverMissingFields.join(' ').toLowerCase();
    switch (tab) {
      case 'technical':
        return str.includes('plate') || str.includes('پلاک') || str.includes('vehicle_type') || str.includes('ownership_type');
      case 'driver':
        return str.includes('driver') || str.includes('راننده');
      case 'owner':
        return str.includes('owner') || str.includes('مالک');
      case 'banking':
        return str.includes('rate') || str.includes('نرخ') || str.includes('bank') || str.includes('sheba') || str.includes('حساب') || str.includes('شبا');
      case 'documents_expiry':
        return str.includes('insurance') || str.includes('بیمه') || str.includes('انقضا') || str.includes('doc');
      default:
        return false;
    }
  }

  isTabComplete(tab: string): boolean {
    if (this.hasServerMissingForTab(tab)) return false;
    switch (tab) {
      case 'technical':
        if (!this.newVehicle.vehicle_type || !this.newVehicle.ownership_type) return false;
        if (this.isRoadVehicle(this.newVehicle.vehicle_type)) {
          return !!(this.platePart1 && this.platePart3 && this.platePart4);
        }
        return !!(this.newVehicle.plate_number && this.newVehicle.plate_number.trim());

      case 'driver':
        if (!this.newVehicle.driver_name?.trim()) return false;
        if (this.newVehicle.driver_phone && !this.isValidPhone(this.newVehicle.driver_phone)) return false;
        if (this.newVehicle.ownership_type !== 'company') {
          if (!this.newVehicle.driver_national_code || !this.isValidNationalCode(this.newVehicle.driver_national_code)) return false;
        }
        return true;

      case 'owner':
        if (this.newVehicle.is_driver_owner) return true;
        if (!this.newVehicle.owner_name?.trim()) return false;
        if (!this.newVehicle.owner_national_code || !this.isValidNationalCode(this.newVehicle.owner_national_code)) return false;
        return true;

      case 'banking':
        if (this.newVehicle.ownership_type === 'company') return true;
        return this.hasValidPrimaryBankAccount;

      case 'documents_expiry':
        if (this.isRoadVehicle(this.newVehicle.vehicle_type)) {
          return !!(this.newVehicle.insurance_expiry_date && this.newVehicle.insurance_expiry_date.trim());
        }
        return true;

      default:
        return true;
    }
  }

  get isSubmitDisabled(): boolean {
    return !this.isTabComplete('technical') ||
           !this.isTabComplete('driver') ||
           !this.isTabComplete('owner') ||
           !this.isTabComplete('banking') ||
           !this.isTabComplete('documents_expiry');
  }

  get missingFieldsList(): string[] {
    const missing: string[] = [];
    if (!this.isTabComplete('technical')) {
      missing.push('مشخصات فنی و پلاک');
    }
    if (!this.isTabComplete('driver')) {
      missing.push('مشخصات راننده');
    }
    if (!this.isTabComplete('owner')) {
      missing.push('مشخصات مالک');
    }
    if (!this.isTabComplete('banking')) {
      missing.push('اطلاعات حساب بانکی');
    }
    if (!this.isTabComplete('documents_expiry')) {
      missing.push('تاریخ انقضای بیمه‌نامه شخص ثالث');
    }
    return missing;
  }

  switchToFirstIncompleteTab(): void {
    const tabs: VehicleModalTab[] = ['technical', 'driver', 'owner', 'banking', 'documents_expiry'];
    for (const t of tabs) {
      if (!this.isTabComplete(t)) {
        this.setActiveTab(t);
        return;
      }
    }
  }

  mapMissingFieldsToTab(missing: string[]): void {
    const missingStr = missing.join(' ');
    if (missingStr.includes('plate') || missingStr.includes('پلاک') || missingStr.includes('vehicle_type') || missingStr.includes('ownership_type')) {
      this.setActiveTab('technical');
    } else if (missingStr.includes('driver') || missingStr.includes('راننده')) {
      this.setActiveTab('driver');
    } else if (missingStr.includes('owner') || missingStr.includes('مالک')) {
      this.setActiveTab('owner');
    } else if (missingStr.includes('rate') || missingStr.includes('نرخ') || missingStr.includes('bank') || missingStr.includes('sheba') || missingStr.includes('حساب') || missingStr.includes('شبا')) {
      this.setActiveTab('banking');
    } else if (missingStr.includes('insurance') || missingStr.includes('بیمه') || missingStr.includes('انقضا') || missingStr.includes('doc')) {
      this.setActiveTab('documents_expiry');
    }
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
        freePlateNumber: this.freePlateNumber,
        rateFormattedDisplay: this.rateFormattedDisplay,
        bankAccounts: this.bankAccounts,
        activeModalTab: this.activeModalTab
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
        this.freePlateNumber = draft.freePlateNumber || '';
        this.rateFormattedDisplay = draft.rateFormattedDisplay || '';
        this.bankAccounts = Array.isArray(draft.bankAccounts) ? draft.bankAccounts : [];

        this.insuranceDateControl.setValue(this.newVehicle.insurance_expiry_date || '', { emitEvent: false });
        this.inspectionDateControl.setValue(this.newVehicle.inspection_expiry_date || '', { emitEvent: false });
        this.licenseDateControl.setValue(this.newVehicle.license_expiry_date || '', { emitEvent: false });
        this.validUntilDateControl.setValue(this.newVehicle.valid_until_date || '', { emitEvent: false });

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
        void saveBlob(blob, `fleet_vehicles_section_${this.selectedSectionId}.xlsx`);
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
        void saveBlob(blob, 'vehicle_fleet_template.xlsx');
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
    this.activeModalTab = 'technical';
    this.cdr.detectChanges();
  }

  closeNewVehicleModal(): void {
    this.isNewVehicleModalOpen = false;
    this.editingVehicle = null;
    this.editingId = null;
    this.rateFormattedDisplay = '';
    this.matchedPersonnelNotice = null;
    this.serverMissingFields = [];
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
      notes: v.notes || '',
      insurance_expiry_date: v.insurance_expiry_date || null,
      inspection_expiry_date: v.inspection_expiry_date || null,
      license_expiry_date: v.license_expiry_date || null,
      valid_until_date: v.valid_until_date || null
    };

    this.insuranceDateControl.setValue(v.insurance_expiry_date || '', { emitEvent: false });
    this.inspectionDateControl.setValue(v.inspection_expiry_date || '', { emitEvent: false });
    this.licenseDateControl.setValue(v.license_expiry_date || '', { emitEvent: false });
    this.validUntilDateControl.setValue(v.valid_until_date || '', { emitEvent: false });

    this.rateFormattedDisplay = (v.default_service_rate && v.default_service_rate > 0)
      ? Number(v.default_service_rate).toLocaleString('fa-IR')
      : '';
    this.parsePlateToParts(v.plate_number);
    this.nationalCodeError = null;
    this.ownerNationalCodeError = null;
    this.matchedPersonnelNotice = null;

    if (v.bank_accounts && Array.isArray(v.bank_accounts) && v.bank_accounts.length > 0) {
      this.bankAccounts = [...v.bank_accounts];
    } else if (v.id) {
      this.loadVehicleBankAccounts(v.id);
    } else {
      this.bankAccounts = [];
    }

    if (v.documents && Array.isArray(v.documents)) {
      this.vehicleDocuments = [...v.documents];
    } else if (v.id) {
      this.loadVehicleDocuments(v.id);
    } else {
      this.vehicleDocuments = [];
    }

    if (v.sheba_number) {
      const digits = extractShebaDigits(v.sheba_number);
      this.shebaValidationResult = validateSheba(digits);
      this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || digits;
    } else {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
    }

    if (v.missing_fields && Array.isArray(v.missing_fields) && v.missing_fields.length > 0) {
      this.serverMissingFields = (v.missing_fields as any[]).map(m => typeof m === 'string' ? m : (m.field || m.label || JSON.stringify(m)));
      this.mapMissingFieldsToTab(this.serverMissingFields);
    } else {
      this.serverMissingFields = [];
      this.activeModalTab = 'technical';
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
      this.freePlateNumber = '';
      return;
    }
    const clean = normalizeDigits(plateStr).trim();
    this.freePlateNumber = clean;
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

  onPlateKeydown(event: KeyboardEvent, partIndex: number): void {
    if (event.key === 'Backspace') {
      if (partIndex === 4 && (!this.platePart4 || this.platePart4.length === 0)) {
        this.p3Input?.nativeElement.focus();
      } else if (partIndex === 3 && (!this.platePart3 || this.platePart3.length === 0)) {
        this.p2Select?.nativeElement.focus();
      }
    }
  }

  updatePlateFromParts(): void {
    if (!this.isRoadVehicle(this.newVehicle.vehicle_type)) {
      if (this.freePlateNumber) {
        this.newVehicle.plate_number = this.freePlateNumber.trim();
      }
      return;
    }
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
    if (this.isLightboxOpen) {
      this.closeLightbox();
      return;
    }
    if (this.isTimelineModalOpen) {
      this.closeTimelineModal();
      return;
    }
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

  // ─── مدیریت ورود نرخ (نگهداری‌شده جهت تطبیق کدهای قبلی) ───
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
      this.newVehicle.sheba_number = digits;

      if (res.isValid && res.bank) {
        this.newVehicle.bank_name = res.bank.name;
        const autoAcc = extractAccountNumberFromSheba(digits);
        if (autoAcc && !this.newVehicle.account_number) {
          this.newVehicle.account_number = autoAcc;
        }
      }

      this.saveDraftToStorage();

      if (inputEl && typeof event !== 'string') {
        let newPos = 0;
        let countedDigits = 0;
        for (let i = 0; i < this.shebaDigitsDisplay.length; i++) {
          if (countedDigits >= digitsBeforeCursor) break;
          if (/\d/.test(this.shebaDigitsDisplay[i])) {
            countedDigits++;
          }
          newPos = i + 1;
        }
        inputEl.value = this.shebaDigitsDisplay;
        try { inputEl.setSelectionRange(newPos, newPos); } catch {}
      }
    } finally {
      this._isSyncingBank = false;
    }
  }

  onShebaChange(): void {
    const raw = this.newVehicle.sheba_number || '';
    const digits = extractShebaDigits(raw);
    const res = validateSheba(digits);
    this.shebaValidationResult = res;
    this.shebaDigitsDisplay = res.formattedDigits || digits;
    if (res.isValid && res.bank) {
      if (!this.newVehicle.bank_name) {
        this.newVehicle.bank_name = res.bank.name;
      }
      const autoAcc = extractAccountNumberFromSheba(digits);
      if (autoAcc && !this.newVehicle.account_number) {
        this.newVehicle.account_number = autoAcc;
      }
    }
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text') || '';
    this.onShebaInput({ target: { value: pastedText } });
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const inputEl = event?.target as HTMLInputElement | undefined;
    const val = inputEl?.value ?? (typeof event === 'string' ? event : '');
    const clean = normalizeDigits(val).replace(/\D/g, '');
    this.newVehicle.account_number = clean;

    if (inputEl && typeof event !== 'string') {
      inputEl.value = clean;
    }

    if (this.newVehicle.bank_name && clean) {
      this.attemptAutoGenerateSheba(this.newVehicle.bank_name, clean);
    }
    this.saveDraftToStorage();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onAccountNumberInput({ target: { value: pasted } });
  }

  onAccountNumberCopy(event: ClipboardEvent): void {
    if (this.newVehicle.account_number) {
      this.copyValue(this.newVehicle.account_number, 'acc_num', 'شماره حساب');
    }
  }

  openBankDropdown(): void {
    if (this.isReadOnlyMode) return;
    this.isBankDropdownOpen = true;
    this.bankSearchQuery = '';
    this.cdr.detectChanges();
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: Event): void {
    event?.stopPropagation();
    this.newVehicle.bank_name = bank.name;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';

    if (this.newVehicle.account_number) {
      this.attemptAutoGenerateSheba(bank.name, this.newVehicle.account_number);
    }
    this.saveDraftToStorage();
    this.cdr.detectChanges();
  }

  onBankSelect(bankName: string): void {
    this.newVehicle.bank_name = bankName;
    if (this.newVehicle.account_number) {
      this.attemptAutoGenerateSheba(bankName, this.newVehicle.account_number);
    }
    this.saveDraftToStorage();
    this.cdr.detectChanges();
  }

  private attemptAutoGenerateSheba(bankName: string, accountNum: string): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const generated = generateShebaFromAccount(bankName, accountNum);
      if (generated) {
        this.newVehicle.sheba_number = generated;
        const res = validateSheba(generated);
        this.shebaValidationResult = res;
        this.shebaDigitsDisplay = res.formattedDigits || generated;
      }
    } finally {
      this._isSyncingBank = false;
    }
  }

  convertAccountToShebaNow(): void {
    if (!this.newVehicle.bank_name || !this.newVehicle.account_number) {
      this.toast.show('warning', 'برای تولید خودکار شبا، انتخاب بانک عامل و شماره حساب الزامی است.');
      return;
    }
    const generated = generateShebaFromAccount(this.newVehicle.bank_name, this.newVehicle.account_number);
    if (generated) {
      this.newVehicle.sheba_number = generated;
      const res = validateSheba(generated);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || generated;
      this.saveDraftToStorage();
      this.toast.show('success', `شماره شبا با موفقیت بر اساس شماره حساب و بانک ${this.newVehicle.bank_name} تولید گردید.`);
    } else {
      this.toast.show('warning', 'الگوی تولید شماره شبا برای این بانک یا شماره حساب پشتیبانی نمی‌شود.');
    }
    this.cdr.detectChanges();
  }

  copyShebaToClipboard(val?: string): void {
    const text = val || this.newVehicle.sheba_number;
    if (!text) return;
    const clean = 'IR' + extractShebaDigits(text);
    this.copyValue(clean, 'sheba', 'شماره شبا');
    this.isShebaCopied = true;
    setTimeout(() => {
      this.isShebaCopied = false;
      this.cdr.detectChanges();
    }, 2000);
  }

  copyAccountNumberToClipboard(val?: string): void {
    const text = val || this.newVehicle.account_number;
    if (!text) return;
    this.copyValue(text, 'account', 'شماره حساب');
    this.isAccountCopied = true;
    setTimeout(() => {
      this.isAccountCopied = false;
      this.cdr.detectChanges();
    }, 2000);
  }

  private copyToClipboard(text: string, title: string): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.toast.show('success', `${title} در کلیپ‌بورد کپی شد.`);
      }).catch(() => {
        this.fallbackCopyText(text, title);
      });
    } else {
      this.fallbackCopyText(text, title);
    }
  }

  private fallbackCopyText(text: string, title: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast.show('success', `${title} در کلیپ‌بورد کپی شد.`);
    } catch {
      this.toast.show('warning', `امکان کپی خودکار وجود ندارد: ${text}`);
    }
  }

  // ─── تسک ۷.۱: کپی سریع با فیدبک ۲ ثانیه‌ای ───
  copyValue(val: string, key?: string, label: string = 'مقدار'): void {
    if (!val) return;
    this.copyToClipboard(val, label);
    if (key) {
      if (this.copiedTimeout) {
        clearTimeout(this.copiedTimeout);
      }
      this.copiedKey = key;
      this.cdr.detectChanges();
      this.copiedTimeout = setTimeout(() => {
        this.copiedKey = null;
        this.cdr.detectChanges();
      }, 2000);
    }
  }

  isKeyCopied(key: string): boolean {
    return this.copiedKey === key;
  }

  // ─── تسک ۶.۴: ماژول حساب‌های بانکی چندگانه (VehicleBankAccount) ───
  get hasValidPrimaryBankAccount(): boolean {
    const primary = this.bankAccounts.find(a => a.is_primary && a.is_active !== false);
    if (!primary && this.newVehicle.sheba_number) {
      const vRes = validateSheba(extractShebaDigits(this.newVehicle.sheba_number));
      return vRes.isValid;
    }
    if (!primary) return false;
    const vRes = validateSheba(extractShebaDigits(primary.sheba_number));
    return vRes.isValid;
  }

  addCurrentAsNewAccount(): void {
    if (!this.newVehicle.sheba_number || !this.shebaValidationResult?.isValid) {
      this.toast.show('warning', 'لطفاً ابتدا یک شماره شبای معتبر ۲۴ رقمی وارد نمایید.');
      return;
    }
    const cleanSheba = extractShebaDigits(this.newVehicle.sheba_number);
    const existing = this.bankAccounts.find(a => extractShebaDigits(a.sheba_number) === cleanSheba);
    if (existing) {
      this.toast.show('warning', 'این شماره شبا قبلاً در لیست حساب‌ها اضافه شده است.');
      return;
    }

    const isFirst = this.bankAccounts.length === 0;
    const newAcc: VehicleBankAccount = {
      bank_name: this.newVehicle.bank_name || this.shebaValidationResult.bank?.name || 'نامشخص',
      account_number: this.newVehicle.account_number || '',
      sheba_number: cleanSheba,
      payee_type: this.newAccountPayeeType || (this.newVehicle.is_driver_owner ? 'driver' : 'owner'),
      is_primary: isFirst,
      is_active: true,
      account_owner_name: !this.newVehicle.is_driver_owner ? this.newVehicle.owner_name : this.newVehicle.driver_name,
      account_owner_national_code: !this.newVehicle.is_driver_owner ? this.newVehicle.owner_national_code : this.newVehicle.driver_national_code
    };

    if (this.editingId) {
      this.personnelApi.addVehicleBankAccount(this.editingId, newAcc).subscribe({
        next: (saved) => {
          this.bankAccounts.push(saved);
          if (newAcc.is_primary) {
            this.syncPrimaryAccountFields(newAcc);
          }
          this.toast.show('success', `حساب بانکی «${newAcc.bank_name}» با موفقیت اضافه شد.`);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', 'خطا در ثبت حساب بانکی: ' + (err.error?.error || err.message || 'نامشخص'));
        }
      });
    } else {
      this.bankAccounts.push(newAcc);
      if (newAcc.is_primary) {
        this.syncPrimaryAccountFields(newAcc);
      }
      this.toast.show('success', `حساب بانکی «${newAcc.bank_name}» اضافه شد.`);
      this.saveDraftToStorage();
    }
  }

  setPrimaryAccount(index: number): void {
    if (index < 0 || index >= this.bankAccounts.length) return;
    this.bankAccounts.forEach((acc, i) => acc.is_primary = (i === index));
    const primary = this.bankAccounts[index];
    this.syncPrimaryAccountFields(primary);

    if (this.editingId && primary.id) {
      this.personnelApi.updateVehicleBankAccount(this.editingId, { ...primary, is_primary: true }).subscribe({
        next: () => {
          this.toast.show('success', `حساب «${primary.bank_name}» به عنوان حساب اصلی واریز تنظیم شد.`);
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', 'خطا در تغییر حساب اصلی: ' + (err.error?.error || err.message || 'نامشخص'));
        }
      });
    } else {
      this.toast.show('success', `حساب «${primary.bank_name}» به عنوان حساب اصلی تنظیم گردید.`);
      this.saveDraftToStorage();
    }
  }

  removeBankAccount(index: number): void {
    if (index < 0 || index >= this.bankAccounts.length) return;
    const acc = this.bankAccounts[index];
    const doRemove = () => {
      const wasPrimary = acc.is_primary;
      this.bankAccounts.splice(index, 1);
      if (wasPrimary && this.bankAccounts.length > 0) {
        this.bankAccounts[0].is_primary = true;
        this.syncPrimaryAccountFields(this.bankAccounts[0]);
      } else if (this.bankAccounts.length === 0) {
        this.newVehicle.bank_name = '';
        this.newVehicle.account_number = '';
        this.newVehicle.sheba_number = '';
        this.shebaDigitsDisplay = '';
        this.shebaValidationResult = null;
      }
      this.toast.show('success', 'حساب بانکی حذف شد.');
      this.saveDraftToStorage();
      this.cdr.detectChanges();
    };

    if (this.editingId && acc.id) {
      this.personnelApi.deleteVehicleBankAccount(this.editingId, acc.id).subscribe({
        next: () => doRemove(),
        error: (err) => {
          this.toast.show('error', 'خطا در حذف حساب: ' + (err.error?.error || err.message || 'نامشخص'));
        }
      });
    } else {
      doRemove();
    }
  }

  private syncPrimaryAccountFields(acc: VehicleBankAccount): void {
    this.newVehicle.bank_name = acc.bank_name;
    this.newVehicle.account_number = acc.account_number;
    this.newVehicle.sheba_number = acc.sheba_number;
    const vRes = validateSheba(extractShebaDigits(acc.sheba_number));
    this.shebaValidationResult = vRes;
    this.shebaDigitsDisplay = vRes.formattedDigits || acc.sheba_number;
  }

  loadVehicleBankAccounts(vehicleId: number): void {
    if (typeof this.personnelApi?.getVehicleBankAccounts !== 'function') {
      this.bankAccounts = [];
      return;
    }
    this.personnelApi.getVehicleBankAccounts(vehicleId).subscribe({
      next: (accounts) => {
        this.bankAccounts = Array.isArray(accounts) ? accounts : [];
        const primary = this.bankAccounts.find(a => a.is_primary);
        if (primary) {
          this.syncPrimaryAccountFields(primary);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.bankAccounts = [];
        this.cdr.detectChanges();
      }
    });
  }

  // ─── تسک ۶.۶: مدیریت آپلود و مدارک خودرو ───
  get isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  getDocTypeLabel(type?: string): string {
    const found = this.docTypeOptions.find(o => o.value === type);
    return found ? found.label : (type || 'سایر مدارک');
  }

  onMultipleFilesSelected(event: any): void {
    const input = event?.target as HTMLInputElement;
    if (!input?.files || input.files.length === 0) return;
    if (!this.isOnline) {
      this.toast.show('warning', 'آپلود مدارک فقط در حالت آنلاین امکان‌پذیر است.');
      return;
    }

    const files = Array.from(input.files);
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        this.toast.show('warning', `حجم فایل ${f.name} بیش از ۱۰ مگابایت است.`);
        continue;
      }
      this.pendingUploadDocuments.push({
        file: f,
        name: f.name,
        doc_type: this.selectedDocTypeForUpload || 'other',
        title: this.docUploadTitle?.trim() || f.name,
        expiry_date: this.docExpiryDateControl.value || undefined
      });
    }

    if (this.editingId && this.pendingUploadDocuments.length > 0) {
      this.uploadAllPendingDocuments(this.editingId);
    } else {
      this.toast.show('info', `${files.length} مدرک به صف مدارک پیوست اضافه شد.`);
    }

    input.value = '';
    this.docUploadTitle = '';
    this.docExpiryDateControl.setValue('');
    this.cdr.detectChanges();
  }

  removePendingUploadDocument(index: number): void {
    if (index >= 0 && index < this.pendingUploadDocuments.length) {
      this.pendingUploadDocuments.splice(index, 1);
      this.cdr.detectChanges();
    }
  }

  loadVehicleDocuments(vehicleId: number): void {
    if (typeof this.personnelApi?.getVehicleDocuments !== 'function') {
      this.vehicleDocuments = [];
      return;
    }
    this.personnelApi.getVehicleDocuments(vehicleId).subscribe({
      next: (docs) => {
        this.vehicleDocuments = Array.isArray(docs) ? docs : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.vehicleDocuments = [];
        this.cdr.detectChanges();
      }
    });
  }

  uploadAllPendingDocuments(vehicleId: number, onComplete?: () => void): void {
    if (this.pendingUploadDocuments.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    const item = this.pendingUploadDocuments[0];
    if (!item) {
      if (onComplete) onComplete();
      return;
    }

    this.personnelApi.uploadVehicleDocument(vehicleId, item.file, item.doc_type, item.title, item.expiry_date).subscribe({
      next: (doc) => {
        this.pendingUploadDocuments.shift();
        this.vehicleDocuments.push(doc);
        this.toast.show('success', `مدرک «${doc.title || item.name}» بارگذاری شد.`);
        this.uploadAllPendingDocuments(vehicleId, onComplete);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSaving = false;
        this.toast.show('error', `خطا در آپلود مدرک «${item.name}»: ` + (err.error?.error || err.message || 'نامشخص') + ' (ارسال به دلیل نقص آپلود مدرک متوقف شد).');
        this.loadRecentVehicles();
        this.cdr.detectChanges();
      }
    });
  }

  deleteExistingDocument(doc: VehicleDocument): void {
    if (!doc.id || !this.editingId) return;
    if (!confirm(`آیا از حذف مدرک «${doc.title || doc.file_name}» اطمینان دارید؟`)) return;

    this.personnelApi.deleteVehicleDocument(this.editingId, doc.id).subscribe({
      next: () => {
        this.vehicleDocuments = this.vehicleDocuments.filter(d => d.id !== doc.id);
        this.toast.show('success', 'مدرک با موفقیت حذف گردید.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', 'خطا در حذف مدرک: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  openLightbox(url: string, title?: string): void {
    this.lightboxImageUrl = url;
    this.lightboxTitle = title || 'پیش‌نمایش مدرک';
    this.isLightboxOpen = true;
    this.cdr.detectChanges();
  }

  closeLightbox(): void {
    this.isLightboxOpen = false;
    this.lightboxImageUrl = '';
    this.lightboxTitle = '';
    this.cdr.detectChanges();
  }

  // ─── اعتبارسنجی کد ملی راننده ───
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
    if (!this.isValidNationalCode(code)) {
      this.nationalCodeError = 'ساختار کد ملی نامعتبر است (خطای رقم کنترلی).';
      this.matchedPersonnelNotice = null;
      this.saveDraftToStorage();
      return;
    }
    this.nationalCodeError = null;
    this.saveDraftToStorage();
    this.lookupExistingPersonnel(code);
  }

  private lookupExistingPersonnel(nationalCode: string): void {
    this.personnelSearchSub?.unsubscribe();
    if (typeof this.personnelApi?.lookupPersonnelByNationalCode === 'function') {
      this.personnelSearchSub = this.personnelApi.lookupPersonnelByNationalCode(nationalCode).subscribe({
        next: (res: any) => {
          if (res && res.found && res.personnel) {
            const p = res.personnel;
            this.matchedPersonnelNotice = `هم‌پوشانی با پرسنل سیستم (یافت شد: ${p.first_name} ${p.last_name}): «${p.first_name} ${p.last_name}» (${p.job_title || 'بدون عنوان'}).`;
            if (!this.newVehicle.driver_name) {
              this.newVehicle.driver_name = `${p.first_name} ${p.last_name}`;
            }
            if (!this.newVehicle.driver_phone && p.phone_number) {
              this.newVehicle.driver_phone = p.phone_number;
            }
            this.saveDraftToStorage();
          } else {
            this.matchedPersonnelNotice = null;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.matchedPersonnelNotice = null;
          this.cdr.detectChanges();
        }
      });
    } else if (typeof this.personnelApi?.getPersonnelProfiles === 'function') {
      this.personnelSearchSub = this.personnelApi.getPersonnelProfiles({ search: nationalCode }).subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : (res?.results || []);
          const p = list.find((item: any) => item.national_code === nationalCode) || list[0];
          if (p) {
            this.matchedPersonnelNotice = `هم‌پوشانی با پرسنل سیستم (یافت شد: ${p.first_name} ${p.last_name}): «${p.first_name} ${p.last_name}» (${p.job_title || 'بدون عنوان'}).`;
            if (!this.newVehicle.driver_name) {
              this.newVehicle.driver_name = `${p.first_name} ${p.last_name}`;
            }
            if (!this.newVehicle.driver_phone && p.phone_number) {
              this.newVehicle.driver_phone = p.phone_number;
            }
            this.saveDraftToStorage();
          } else {
            this.matchedPersonnelNotice = null;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.matchedPersonnelNotice = null;
          this.cdr.detectChanges();
        }
      });
    }
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
    if (!this.isValidNationalCode(code)) {
      this.ownerNationalCodeError = 'ساختار کد ملی مالک نامعتبر است (خطای رقم کنترلی).';
      this.saveDraftToStorage();
      return;
    }
    this.ownerNationalCodeError = null;
    this.saveDraftToStorage();
  }

  // ─── معادل تومان نرخ پیش‌فرض (جهت سازگاری) ───
  get rateInTomans(): number {
    return Math.floor((Number(this.newVehicle.default_service_rate) || 0) / 10);
  }

  // ─── ثبت و بروزرسانی پرونده خودرو (تسک ۶.۷) ───
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
      this.setActiveTab('technical');
      return;
    }
    if (!this.newVehicle.driver_name?.trim()) {
      this.toast.show('warning', 'نام و نام خانوادگی راننده الزامی است.');
      this.setActiveTab('driver');
      return;
    }
    if (this.nationalCodeError) {
      this.toast.show('warning', this.nationalCodeError);
      this.setActiveTab('driver');
      return;
    }

    if (!this.newVehicle.is_driver_owner) {
      if (!this.newVehicle.owner_name?.trim()) {
        this.toast.show('warning', 'نام و نام خانوادگی مالک خودرو الزامی است.');
        this.setActiveTab('owner');
        return;
      }
      if (this.ownerNationalCodeError) {
        this.toast.show('warning', this.ownerNationalCodeError);
        this.setActiveTab('owner');
        return;
      }
    }

    if (this.shebaValidationResult && !this.shebaValidationResult.isValid) {
      this.toast.show('warning', this.shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.');
      this.setActiveTab('banking');
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
      sheba_number: this.newVehicle.sheba_number ? cleanShebaInput(this.newVehicle.sheba_number) : undefined,
      insurance_expiry_date: this.newVehicle.insurance_expiry_date || undefined,
      inspection_expiry_date: this.newVehicle.inspection_expiry_date || undefined,
      license_expiry_date: this.newVehicle.license_expiry_date || undefined,
      valid_until_date: this.newVehicle.valid_until_date || undefined,
      notes: this.newVehicle.notes?.trim() || undefined,
      section: this.selectedSectionId,
      company: this.selectedSection?.company_id || (this.selectedSection as any)?.company || this.mySections.find(s => Number(s.id) === Number(this.selectedSectionId))?.company_id || undefined,
      is_active: true
    };
    delete (payload as any).approval_status;

    if (this.editingId) {
      this.personnelApi.updateVehicleProfile(this.editingId, payload).subscribe({
        next: (res: any) => {
          const vehicleId = this.editingId!;
          const plate = res?.plate_number || this.newVehicle.plate_number;

          const proceedToSubmitOrClose = () => {
            if (this.isApprovedRecord) {
              this.isSaving = false;
              this.toast.show('success', `درخواست تغییرات خودرو «${plate}» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.`);
              this.closeNewVehicleModal();
              this.loadRecentVehicles();
              return;
            }

            const currentStatus = res?.approval_status || this.editingVehicle?.approval_status || 'draft';
            if (targetStatus === 'pending_supervisor' && (currentStatus === 'draft' || currentStatus === 'revision_required')) {
              if (typeof this.personnelApi?.submitVehicleProfile === 'function') {
                this.personnelApi.submitVehicleProfile(vehicleId).subscribe({
                  next: () => {
                    this.isSaving = false;
                    this.toast.show('success', `پرونده خودرو «${plate}» به کارتابل سرپرست ارسال گردید.`);
                    this.closeNewVehicleModal();
                    this.loadRecentVehicles();
                  },
                  error: (submitErr: any) => {
                    this.isSaving = false;
                    const missing = submitErr.error?.missing_fields;
                    if (Array.isArray(missing) && missing.length > 0) {
                      this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
                      const labels = this.formatMissingFields(missing);
                      this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما به دلیل نواقص پرونده ارسال نشد: ' + labels);
                      this.mapMissingFieldsToTab(this.serverMissingFields);
                    } else {
                      const msg = submitErr.error?.error || submitErr.message || 'نامشخص';
                      this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما خطا در ارسال به سرپرست: ' + msg);
                    }
                    this.loadRecentVehicles();
                    this.cdr.detectChanges();
                  }
                });
              } else {
                this.isSaving = false;
                this.closeNewVehicleModal();
                this.loadRecentVehicles();
              }
            } else {
              this.isSaving = false;
              if (this.isRevisionMode) {
                this.toast.show('success', `پرونده خودرو «${plate}» با موفقیت ذخیره شد.`);
              } else {
                this.toast.show('success', `تغییرات پیش‌نویس خودرو «${plate}» با موفقیت ذخیره شد.`);
              }
              this.closeNewVehicleModal();
              this.loadRecentVehicles();
            }
          };

          if (this.pendingUploadDocuments.length > 0) {
            this.uploadAllPendingDocuments(vehicleId, proceedToSubmitOrClose);
          } else {
            proceedToSubmitOrClose();
          }
        },
        error: (err: any) => {
          this.isSaving = false;
          const missing = err.error?.missing_fields;
          if (Array.isArray(missing) && missing.length > 0) {
            this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
            this.toast.show('error', 'نواقص پرونده: ' + this.formatMissingFields(missing));
            this.mapMissingFieldsToTab(this.serverMissingFields);
          } else {
            const msg = err.error?.plate_number?.[0] || err.error?.error || err.message || 'نامشخص';
            this.toast.show('error', 'خطا در ویرایش خودرو: ' + msg);
          }
          this.cdr.detectChanges();
        }
      });
    } else {
      this.personnelApi.createVehicleProfile(payload).subscribe({
        next: (created: VehicleDriverProfile) => {
          const vehicleId = created.id;
          const plate = created.plate_number;

          const proceedToSubmitOrClose = () => {
            const currentStatus = created.approval_status || 'draft';
            if (targetStatus === 'pending_supervisor' && vehicleId && (currentStatus === 'draft' || currentStatus === 'revision_required')) {
              if (typeof this.personnelApi?.submitVehicleProfile === 'function') {
                this.personnelApi.submitVehicleProfile(vehicleId).subscribe({
                  next: () => {
                    this.isSaving = false;
                    this.clearDraftFromStorage();
                    this.toast.show('success', `خودرو «${plate}» ثبت و به کارتابل سرپرست ارسال گردید.`);
                    this.closeNewVehicleModal();
                    this.loadRecentVehicles();
                  },
                  error: (submitErr: any) => {
                    this.isSaving = false;
                    this.editingId = vehicleId;
                    this.editingVehicle = created;
                    const missing = submitErr.error?.missing_fields;
                    if (Array.isArray(missing) && missing.length > 0) {
                      this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
                      const labels = this.formatMissingFields(missing);
                      this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما به دلیل نواقص پرونده ارسال نشد: ' + labels);
                      this.mapMissingFieldsToTab(this.serverMissingFields);
                    } else {
                      const msg = submitErr.error?.error || submitErr.message || 'نامشخص';
                      this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما خطا در ارسال به سرپرست: ' + msg);
                    }
                    this.loadRecentVehicles();
                    this.cdr.detectChanges();
                  }
                });
              } else {
                this.isSaving = false;
                this.clearDraftFromStorage();
                this.closeNewVehicleModal();
                this.loadRecentVehicles();
              }
            } else {
              this.isSaving = false;
              this.clearDraftFromStorage();
              if (currentStatus === 'approved') {
                this.toast.show('success', `خودرو «${plate}» با موفقیت ثبت و مستقیماً تصویب گردید.`);
              } else if (currentStatus === 'pending_accountant' || currentStatus === 'pending_manager') {
                this.toast.show('success', `خودرو «${plate}» ثبت شد و بر اساس نقش شما به مرحله بعد ارسال گردید.`);
              } else {
                this.toast.show('success', `خودرو «${plate}» با راننده «${created.driver_name}» در وضعیت پیش‌نویس ثبت شد.`);
              }
              this.closeNewVehicleModal();
              this.loadRecentVehicles();
            }
          };

          if (vehicleId && this.pendingUploadDocuments.length > 0) {
            this.uploadAllPendingDocuments(vehicleId, proceedToSubmitOrClose);
          } else {
            proceedToSubmitOrClose();
          }
        },
        error: (err: any) => {
          this.isSaving = false;
          const missing = err.error?.missing_fields;
          if (Array.isArray(missing) && missing.length > 0) {
            this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
            this.toast.show('error', 'نواقص پرونده: ' + this.formatMissingFields(missing));
            this.mapMissingFieldsToTab(this.serverMissingFields);
          } else {
            const msg = err.error?.plate_number?.[0] || err.error?.error || err.message || 'نامشخص';
            this.toast.show('error', 'خطا در ثبت خودرو: ' + msg);
          }
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ─── قالب‌بندی متنی نواقص پرونده با برچسب فارسی (تسک ۱۱.۱۲ و ن-۱۲) ───
  formatMissingFields(missing: any): string {
    if (!Array.isArray(missing) || missing.length === 0) return '';
    return missing.map((m: any) => {
      if (typeof m === 'object' && m !== null) {
        return m.label || m.field || JSON.stringify(m);
      }
      return String(m);
    }).filter(Boolean).join('، ');
  }

  // ─── ارسال صریح پرونده پیش‌نویس به کارتابل سرپرست (تسک ۶.۷ - POST /submit/) ───
  submitDraftVehicle(v?: VehicleDriverProfile): void {
    const target = v || this.editingVehicle;
    if (!target && !this.editingId) {
      if (this.isSubmitDisabled) {
        this.toast.show('warning', 'لطفاً ابتدا نواقص فرم را تکمیل فرمایید: ' + this.missingFieldsList.join('، '));
        this.switchToFirstIncompleteTab();
        return;
      }
      this.saveVehicle('pending_supervisor');
      return;
    }

    const id = target?.id || this.editingId;
    if (!id) return;

    if (typeof this.personnelApi?.submitVehicleProfile !== 'function') {
      this.saveVehicle('pending_supervisor');
      return;
    }

    this.isSaving = true;
    this.personnelApi.submitVehicleProfile(id).subscribe({
      next: () => {
        this.isSaving = false;
        const plate = target?.plate_number || this.newVehicle.plate_number;
        this.toast.show('success', `پرونده خودرو «${plate}» به کارتابل سرپرست ارسال گردید.`);
        if (this.isNewVehicleModalOpen) {
          this.closeNewVehicleModal();
        }
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.isSaving = false;
        const missing = err.error?.missing_fields;
        if (Array.isArray(missing) && missing.length > 0) {
          this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
          const labels = this.formatMissingFields(missing);
          this.toast.show('error', 'ارسال ناموفق؛ نواقص سروری: ' + labels);
          if (!this.isNewVehicleModalOpen && target) {
            this.openEditModal({ ...target, missing_fields: missing });
          } else {
            this.mapMissingFieldsToTab(this.serverMissingFields);
          }
        } else {
          const msg = err.error?.error || err.message || 'نامشخص';
          this.toast.show('error', 'خطا در ارسال پرونده به سرپرست: ' + msg);
        }
        this.cdr.detectChanges();
      }
    });
  }

  submitDraftToSupervisor(v: VehicleDriverProfile): void {
    this.submitDraftVehicle(v);
  }

  // ─── فاز ۷: بازگشایی پرونده ردشده (تسک ۷.۳ - reopen) ───
  reopenRejectedVehicle(v: VehicleDriverProfile): void {
    if (!v.id || this.isReopening) return;
    this.isReopening = true;
    this.personnelApi.reopenVehicleProfile(v.id).subscribe({
      next: (res: any) => {
        this.isReopening = false;
        this.toast.show('info', `پرونده خودرو «${v.plate_number}» با موفقیت بازگشایی شد و به حالت پیش‌نویس درآمد.`);
        const reopened = res?.data && res.data.id ? res.data : { ...v, approval_status: 'draft' };
        this.openEditModal(reopened);
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.isReopening = false;
        this.toast.show('error', 'خطا در بازگشایی پرونده: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فاز ۷: لغو درخواست تغییرات معلق (تسک ۷.۲ - cancel) ───
  cancelPendingChangeRequest(v: VehicleDriverProfile): void {
    const crId = v.pending_change_request?.id;
    if (!crId) {
      this.toast.show('warning', 'شناسه درخواست تغییرات یافت نشد.');
      return;
    }
    if (!confirm(`آیا از ابطال درخواست تغییرات خودرو «${v.plate_number}» اطمینان دارید؟`)) {
      return;
    }

    this.isCancellingChangeRequest = true;
    this.personnelApi.cancelVehicleChangeRequest(crId).subscribe({
      next: () => {
        this.isCancellingChangeRequest = false;
        this.toast.show('success', 'درخواست تغییرات با موفقیت ابطال شد.');
        v.has_pending_changes = false;
        v.pending_change_request = null;
        if (this.isPendingDiffModalOpen) {
          this.closePendingDiffModal();
        }
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.isCancellingChangeRequest = false;
        this.toast.show('error', 'خطا در ابطال درخواست تغییرات: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فاز ۷: تایملاین ممیزی گردش کار (تسک ۷.۱) ───
  openTimelineModal(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.timelineVehicle = v;
    this.timelineLogs = [];
    this.isTimelineModalOpen = true;
    this.isLoadingTimeline = true;
    this.cdr.detectChanges();

    this.personnelApi.getWorkflowAuditLogs({ content_type: 'vehicle', object_id: v.id }).subscribe({
      next: (logs: WorkflowAuditLog[]) => {
        this.isLoadingTimeline = false;
        this.timelineLogs = Array.isArray(logs) ? logs : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingTimeline = false;
        this.timelineLogs = [];
        this.cdr.detectChanges();
      }
    });
  }

  closeTimelineModal(): void {
    this.isTimelineModalOpen = false;
    this.timelineVehicle = null;
    this.timelineLogs = [];
    this.isLoadingTimeline = false;
    this.cdr.detectChanges();
  }

  getWorkflowActionLabel(action?: string): string {
    switch (action) {
      case 'submit':
        return 'ارسال به سرپرست';
      case 'approve_supervisor':
        return 'تایید سرپرست';
      case 'approve_accountant':
      case 'approve_finance':
        return 'تایید حسابدار';
      case 'approve_manager':
        return 'تصویب نهایی مدیر';
      case 'batch_approve':
        return 'تایید گروهی';
      case 'revision':
      case 'request_revision':
        return 'عودت جهت اصلاح';
      case 'reject':
        return 'رد پرونده';
      case 'cancel_change_request':
      case 'change_request_cancelled':
        return 'ابطال درخواست تغییرات';
      case 'change_request_created':
        return 'ثبت درخواست تغییرات';
      case 'change_request_approve_supervisor':
        return 'تایید سرپرست بر درخواست تغییرات';
      case 'change_request_approve_finance':
        return 'تایید حسابدار بر درخواست تغییرات';
      case 'change_request_applied':
        return 'تصویب و اعمال درخواست تغییرات';
      case 'change_request_rejected':
        return 'رد درخواست تغییرات';
      case 'auto_pass':
        return 'عبور هوشمند مراحل';
      case 'accountant_edit':
        return 'ویرایش حسابدار';
      case 'superuser_edit':
        return 'ویرایش مدیر سیستم';
      case 'bank_account_deleted':
        return 'حذف حساب بانکی';
      case 'document_deleted':
        return 'حذف مدرک';
      case 'excel_import_update':
        return 'به‌روزرسانی از درون‌ریزی اکسل';
      case 'reopen':
        return 'بازگشایی پرونده ردشده';
      case 'end_collaboration':
        return 'قطع همکاری';
      case 'purge':
        return 'پاک‌سازی پرونده';
      case 'delete':
        return 'حذف پرونده';
      case 'create':
        return 'تشکیل پرونده اولیه';
      case 'update':
      case 'edit':
        return 'ویرایش اطلاعات';
      default:
        return action || 'اقدام گردش کار';
    }
  }

  getWorkflowActionBadgeClass(action?: string): string {
    switch (action) {
      case 'submit':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'approve_supervisor':
      case 'approve_accountant':
      case 'approve_finance':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'approve_manager':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'batch_approve':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'revision':
      case 'request_revision':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'reject':
      case 'purge':
      case 'delete':
      case 'change_request_rejected':
      case 'end_collaboration':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'cancel_change_request':
      case 'change_request_cancelled':
        return 'bg-surface-muted text-fg-muted border-line';
      case 'auto_pass':
      case 'change_request_applied':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'reopen':
      case 'change_request_created':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-surface-alt text-fg-muted border-line';
    }
  }

  getWorkflowActionIcon(action?: string): string {
    switch (action) {
      case 'submit':
        return 'send';
      case 'approve_supervisor':
      case 'approve_accountant':
      case 'approve_finance':
        return 'check';
      case 'approve_manager':
        return 'star';
      case 'batch_approve':
        return 'users';
      case 'revision':
      case 'request_revision':
        return 'undo';
      case 'reject':
      case 'purge':
      case 'delete':
      case 'change_request_rejected':
        return 'x';
      case 'cancel_change_request':
      case 'change_request_cancelled':
        return 'slash';
      case 'auto_pass':
        return 'zap';
      case 'reopen':
        return 'refresh-cw';
      case 'end_collaboration':
        return 'slash';
      case 'create':
      case 'change_request_created':
        return 'file-text';
      default:
        return 'file';
    }
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
      insurance_expiry_date: null,
      inspection_expiry_date: null,
      license_expiry_date: null,
      valid_until_date: null,
      is_active: true,
      approval_status: 'draft'
    };
    this.platePart1 = '';
    this.platePart2 = 'الف';
    this.platePart3 = '';
    this.platePart4 = '63';
    this.freePlateNumber = '';
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

    this.insuranceDateControl.setValue('', { emitEvent: false });
    this.inspectionDateControl.setValue('', { emitEvent: false });
    this.licenseDateControl.setValue('', { emitEvent: false });
    this.validUntilDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });

    this.bankAccounts = [];
    this.vehicleDocuments = [];
    this.pendingUploadDocuments = [];
    this.serverMissingFields = [];
    this.activeModalTab = 'technical';
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
        return 'bg-surface-muted text-fg-muted border-line';
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
        return 'bg-surface-alt text-fg-muted border-line';
    }
  }

  getStatusIcon(status?: string): string {
    switch (status) {
      case 'draft':
        return 'edit-2';
      case 'pending_supervisor':
      case 'pending_manager':
      case 'pending_accountant':
        return 'clock';
      case 'manager_approved':
      case 'approved':
        return 'check';
      case 'revision_required':
        return 'undo';
      case 'rejected':
        return 'x';
      default:
        return 'circle';
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
