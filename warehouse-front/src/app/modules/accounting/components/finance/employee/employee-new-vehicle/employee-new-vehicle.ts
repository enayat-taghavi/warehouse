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
} from '../../../../../../core/models/personnel.model';
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

import { EmployeeNewVehicleFacade } from './employee-new-vehicle.facade';
import {
  ROAD_VEHICLE_TYPES,
  isRoadVehicleType,
  PLATE_LETTERS,
  DOC_TYPE_OPTIONS,
  VEHICLE_GROUPS,
  VEHICLE_TYPES_FLAT,
  OWNERSHIP_TYPES,
  FIELD_LABELS_MAP,
  isValidPhone,
  isValidNationalCode,
  parsePlateString,
  buildPlateStringFromParts,
  checkServerMissingForTab,
  formatMissingFieldsText,
  computeVehicleMetrics,
  getStatusBadgeClassHelper,
  getStatusIconHelper,
  getStatusLabelHelper,
  getFullStatusDescriptionHelper,
  getWorkflowActionLabelHelper,
  getWorkflowActionBadgeClassHelper,
  getWorkflowActionIconHelper,
  formatDiffValueHelper,
  formatShebaDisplayHelper,
  formatNumberHelper,
  downloadBlobHelper,
  buildVehicleSavePayload,
  createDefaultVehicleForm,
  checkIsTabComplete,
  filterVehiclesHelper,
  getCleanTelUrlHelper,
  validateNationalCodeInput,
  parseVehicleEditModalData,
  getModalHeaderTitleHelper,
  handleVehicleWsUpdateHelper,
  createBankAccountFromState,
  copyTextToClipboard,
  serializeVehicleDraft,
  deserializeVehicleDraft,
  buildStatusFilterTabs,
  buildVehicleModalTabs,
  validateVehicleFormBeforeSave,
  applyVehicleEditModalSetup,
  resetVehicleFormState,
  submitDraftVehicleHelper,
  removeBankAccountHelper
} from './employee-new-vehicle.helpers';

export type VehicleStatusFilter = 'all' | 'draft' | 'pending_supervisor' | 'revision_required' | 'approved' | 'rejected';
export type VehicleModalTab = 'technical' | 'driver' | 'owner' | 'banking' | 'documents_expiry';

export { ROAD_VEHICLE_TYPES, isRoadVehicleType };

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
    TabBarComponent
  ],
  providers: [EmployeeNewVehicleFacade],
  templateUrl: './employee-new-vehicle.html',
  styleUrl: './employee-new-vehicle.css'
})
export class EmployeeNewVehicleHubComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  facade: EmployeeNewVehicleFacade;

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

  readonly plateLetters = PLATE_LETTERS;

  // ─── مودال استاندارد ورود اطلاعات از فایل اکسل ───
  isExcelModalOpen: boolean = false;
  excelModalTitle: string = 'آپلود و ثبت دسته‌جمعی ناوگان از فایل اکسل';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  get isLoading(): boolean {
    return this.isLoadingSections || this.isLoadingVehicles;
  }

  // ─── فرم ثبت خودرو جدید ───
  newVehicle: Partial<VehicleDriverProfile> = createDefaultVehicleForm();

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
    const q = this.bankSearchQuery?.trim().toLowerCase();
    return q ? this.iranianBanks.filter(b => b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q)) : this.iranianBanks;
  }

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

  readonly docTypeOptions = DOC_TYPE_OPTIONS;

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
  nationalCodeError: string | null = null;
  ownerNationalCodeError: string | null = null;
  matchedPersonnelNotice: string | null = null;

  // ─── گروه‌بندی سازمان‌یافته انواع خودرو (Organized Vehicle Types) ───
  readonly vehicleGroups = VEHICLE_GROUPS;
  readonly vehicleTypesFlat = VEHICLE_TYPES_FLAT;

  // ─── لیست انواع مالکیت ───
  readonly ownershipTypes = OWNERSHIP_TYPES;

  // ─── نگاشت فارسی کلیدهای تغییرات جهت نمایش در مودال Diff ───
  readonly fieldLabelsMap: Record<string, string> = FIELD_LABELS_MAP;

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
    @Optional() public activeCompanyService?: ActiveCompanyService,
    @Optional() facade?: EmployeeNewVehicleFacade
  ) {
    this.facade = facade ?? new EmployeeNewVehicleFacade(this.personnelApi, this.toast);
    this.setupSearchDebounce();
    this.initDateControls();
  }

  ngOnInit(): void {
    this.setupWebSocket();
    if (this.activeCompanyService?.activeCompany$) {
      this.companySub = this.activeCompanyService.activeCompany$.subscribe(() => {
        this.loadMySections();
        if (this.selectedSectionId) this.loadRecentVehicles();
      });
    }

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId)) {
          if (this.mySections.length > 0 && sId !== this.selectedSectionId && this.mySections.some(s => s.id === sId)) {
            this.selectedSectionId = sId;
            this.selectedSection = this.mySections.find(s => s.id === sId) || null;
            this.loadRecentVehicles();
          } else if (!this.mySections.length) {
            this.pendingSectionId = sId;
          }
        }
      }
      if (params['status_filter'] && ['all', 'draft', 'pending_supervisor', 'revision_required', 'approved', 'rejected'].includes(params['status_filter'])) {
        this.statusFilter = params['status_filter'] as VehicleStatusFilter;
      }
      if (params['search'] !== undefined) this.searchQuery = params['search'] || '';
      const editId = params['edit'] ? Number(params['edit']) : (params['id'] ? Number(params['id']) : null);
      if (editId && !isNaN(editId)) {
        (this.facade?.getVehicleDriverProfile(editId) || this.personnelApi.getVehicleDriverProfile(editId)).subscribe({
          next: (v) => this.openEditModal(v),
          error: () => this.toast.show('error', 'خطا در بارگذاری پرونده خودرو برای ویرایش')
        });
      } else if (params['new'] === 'true' || params['new'] === true) {
        if (this.selectedSectionId) this.openNewVehicleModal();
        else this.pendingOpenNewModal = true;
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
    const bind = (ctrl: FormControl, field: keyof VehicleDriverProfile) => {
      ctrl.valueChanges.subscribe(val => { (this.newVehicle as any)[field] = val || null; this.saveDraftToStorage(); });
    };
    bind(this.insuranceDateControl, 'insurance_expiry_date');
    bind(this.inspectionDateControl, 'inspection_expiry_date');
    bind(this.licenseDateControl, 'license_expiry_date');
    bind(this.validUntilDateControl, 'valid_until_date');
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
    const res = handleVehicleWsUpdateHelper(
      this.recentVehicles,
      msg,
      this.activeCompanyService?.activeCompanySignal?.()?.id,
      this.selectedSectionId,
      this.editingVehicle?.id
    );
    if (res.ignore) return;
    if (res.shouldReload) { this.loadRecentVehicles(); return; }
    if (res.isDeleted) {
      this.recentVehicles = res.updatedList;
      if (this.editingVehicle && this.editingVehicle.id === res.deletedId) {
        this.closeNewVehicleModal();
        this.toast.show('info', 'پرونده باز شده توسط کاربر دیگر حذف گردید.');
      }
      this.cdr.detectChanges();
      return;
    }
    this.recentVehicles = res.updatedList;
    if (res.updatedVehicle && this.editingVehicle && this.editingVehicle.id === res.updatedVehicle.id) {
      this.editingVehicle = { ...res.updatedVehicle };
    }
    this.cdr.detectChanges();
  }

  // ─── بارگذاری بخش‌های مجاز کارمند ───
  loadMySections(): void {
    this.isLoadingSections = true;
    (this.facade?.getMySections() || this.personnelApi.getMySections()).subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            (this.facade?.getProjectSections({ is_active: true }) || this.personnelApi.getProjectSections({ is_active: true })).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => { this.isLoadingSections = false; this.cdr.detectChanges(); }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: () => { this.isLoadingSections = false; this.cdr.detectChanges(); }
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
    (this.facade?.loadVehicleProfiles(this.selectedSectionId) || this.personnelApi.getVehicleProfiles({ section_id: this.selectedSectionId })).subscribe({
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
    return filterVehiclesHelper(this.recentVehicles, this.statusFilter, this.searchQuery);
  }

  // ─── شاخص‌های آماری خودروهای بخش ───
  get vehicleMetrics() {
    return computeVehicleMetrics(this.recentVehicles);
  }

  // ─── تب‌های حافظه‌دار وضعیت و مراحل ثبت برای app-tab-bar ───
  private statusFilterTabsKey = '';
  private statusFilterTabsCache: TabDef[] = [];
  get statusFilterTabs(): TabDef[] {
    const vm = this.vehicleMetrics;
    const key = `${vm.total}:${vm.drafts}:${vm.pending}:${vm.revision}:${vm.approved}:${vm.rejected}`;
    if (key !== this.statusFilterTabsKey) {
      this.statusFilterTabsKey = key;
      this.statusFilterTabsCache = buildStatusFilterTabs(vm);
    }
    return this.statusFilterTabsCache;
  }

  private vehicleModalTabsKey = '';
  private vehicleModalTabsCache: TabDef[] = [];
  get vehicleModalTabs(): TabDef[] {
    const key = `${this.hasServerMissingForTab('technical')}:${this.isTabComplete('technical')}:${this.hasServerMissingForTab('driver')}:${this.isTabComplete('driver')}:${this.hasServerMissingForTab('owner')}:${this.isTabComplete('owner')}:${this.hasServerMissingForTab('banking')}:${this.isTabComplete('banking')}:${this.hasServerMissingForTab('documents_expiry')}:${this.isTabComplete('documents_expiry')}`;
    if (key !== this.vehicleModalTabsKey) {
      this.vehicleModalTabsKey = key;
      this.vehicleModalTabsCache = buildVehicleModalTabs((t, done, todo) =>
        this.hasServerMissingForTab(t)
          ? { tone: 'rose', label: 'دارای نقص سروری', pulse: true }
          : this.isTabComplete(t)
            ? { tone: 'emerald', label: done || 'تکمیل شده' }
            : { tone: 'amber', label: todo || 'ناقص' }
      );
    }
    return this.vehicleModalTabsCache;
  }

  // ─── رفتار دوحالته (Toggle) تب‌های وضعیت طبق Rule 7 ───
  setStatusFilter(filter: string): void {
    if (['all', 'draft', 'pending_supervisor', 'revision_required', 'approved', 'rejected'].includes(filter)) {
      const nextFilter: VehicleStatusFilter = (this.statusFilter === filter && filter !== 'all') ? 'all' : filter as VehicleStatusFilter;
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
    this.router.navigate([], { relativeTo: this.route, queryParams: { search: null }, queryParamsHandling: 'merge' });
    this.searchSubject.next('');
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
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
    return isValidPhone(phone);
  }

  isValidNationalCode(code?: string): boolean {
    return isValidNationalCode(code);
  }

  hasServerMissingForTab(tab: string): boolean {
    return checkServerMissingForTab(this.serverMissingFields, tab);
  }

  isTabComplete(tab: string): boolean {
    return checkIsTabComplete(
      tab,
      this.newVehicle,
      this.isRoadVehicle(this.newVehicle.vehicle_type),
      this.serverMissingFields,
      this.platePart1,
      this.platePart3,
      this.platePart4,
      this.hasValidPrimaryBankAccount
    );
  }

  get isSubmitDisabled(): boolean {
    return (['technical', 'driver', 'owner', 'banking', 'documents_expiry'] as VehicleModalTab[]).some(t => !this.isTabComplete(t));
  }

  get missingFieldsList(): string[] {
    const map: Record<string, string> = {
      technical: 'مشخصات فنی و پلاک',
      driver: 'مشخصات راننده',
      owner: 'مشخصات مالک',
      banking: 'اطلاعات حساب بانکی',
      documents_expiry: 'تاریخ انقضای بیمه‌نامه شخص ثالث'
    };
    return (['technical', 'driver', 'owner', 'banking', 'documents_expiry'] as VehicleModalTab[])
      .filter(t => !this.isTabComplete(t))
      .map(t => map[t]);
  }

  switchToFirstIncompleteTab(): void {
    const t = (['technical', 'driver', 'owner', 'banking', 'documents_expiry'] as VehicleModalTab[]).find(tab => !this.isTabComplete(tab));
    if (t) this.setActiveTab(t);
  }

  mapMissingFieldsToTab(missing: string[]): void {
    const str = missing.join(' ').toLowerCase();
    if (str.includes('plate') || str.includes('پلاک') || str.includes('vehicle_type') || str.includes('ownership_type')) {
      this.setActiveTab('technical');
    } else if (str.includes('driver') || str.includes('راننده')) {
      this.setActiveTab('driver');
    } else if (str.includes('owner') || str.includes('مالک')) {
      this.setActiveTab('owner');
    } else if (str.includes('rate') || str.includes('نرخ') || str.includes('bank') || str.includes('sheba') || str.includes('حساب') || str.includes('شبا')) {
      this.setActiveTab('banking');
    } else if (str.includes('insurance') || str.includes('بیمه') || str.includes('انقضا') || str.includes('doc')) {
      this.setActiveTab('documents_expiry');
    }
  }

  // ─── مدیریت پیش‌نویس ذخیره‌شده فرم در حافظه محلی (DATA-02) ───
  getDraftStorageKey(): string {
    return `vehicle_draft_form_${this.selectedSectionId || 'default'}`;
  }

  saveDraftToStorage(): void {
    if (this.editingId || this.isReadOnlyMode) return;
    try { localStorage.setItem(this.getDraftStorageKey(), serializeVehicleDraft(this)); } catch {}
  }

  loadDraftFromStorage(): boolean {
    if (this.editingId) return false;
    try {
      const raw = localStorage.getItem(this.getDraftStorageKey());
      if (raw) return deserializeVehicleDraft(raw, this);
    } catch {}
    return false;
  }

  clearDraftFromStorage(): void {
    try { localStorage.removeItem(this.getDraftStorageKey()); } catch {}
  }

  getCleanTelUrl(phone?: string): string {
    return getCleanTelUrlHelper(phone);
  }

  // ─── مدیریت اکسل ───
  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.isExportingExcel = true;
    (this.facade?.exportVehiclesExcel(this.selectedSectionId) || this.personnelApi.exportVehiclesExcel({ section_id: this.selectedSectionId })).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        downloadBlobHelper(blob, `fleet_vehicles_section_${this.selectedSectionId}.xlsx`);
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
    (this.facade?.downloadVehicleTemplate() || this.personnelApi.downloadVehicleTemplate()).subscribe({
      next: (blob: Blob) => {
        downloadBlobHelper(blob, 'vehicle_fleet_template.xlsx');
        this.toast.show('success', 'قالب استاندارد اکسل ناوگان با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل ناوگان')
    });
  }

  // ─── مدیریت مودال ثبت و ویرایش خودرو ───
  openNewVehicleModal(): void {
    if (!this.selectedSectionId) { this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.'); return; }
    this.editingVehicle = null;
    this.editingId = null;
    this.rateFormattedDisplay = '';
    this.resetForm();
    if (this.loadDraftFromStorage()) this.toast.show('info', 'پیش‌نویس ذخیره‌شده فرم خودرو بازیابی گردید.');
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
    applyVehicleEditModalSetup(this, v);
  }

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
    return getModalHeaderTitleHelper(this.editingId, this.isReadOnlyMode, this.isApprovedRecord, this.isRevisionMode, this.editingVehicle?.plate_number);
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
    const res = parsePlateString(plateStr);
    this.platePart1 = res.platePart1;
    this.platePart2 = res.platePart2;
    this.platePart3 = res.platePart3;
    this.platePart4 = res.platePart4;
    this.freePlateNumber = res.freePlateNumber;
  }

  onPlatePartChange(): void {
    this.updatePlateFromParts();
    this.saveDraftToStorage();
  }

  onPlatePart1Input(event?: any): void {
    if (event?.target?.value !== undefined) this.platePart1 = event.target.value;
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    const val = normalizeDigits(this.platePart1).replace(/\D/g, '');
    if (val.length >= 2) this.p2Select?.nativeElement.focus();
  }

  onPlatePart2Change(event?: any): void {
    if (event?.target?.value !== undefined) this.platePart2 = event.target.value;
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    this.p3Input?.nativeElement.focus();
  }

  onPlatePart3Input(event?: any): void {
    if (event?.target?.value !== undefined) this.platePart3 = event.target.value;
    this.updatePlateFromParts();
    this.saveDraftToStorage();
    const val = normalizeDigits(this.platePart3).replace(/\D/g, '');
    if (val.length >= 3) this.p4Input?.nativeElement.focus();
  }

  onPlatePart4Input(event?: any): void {
    if (event?.target?.value !== undefined) this.platePart4 = event.target.value;
    this.updatePlateFromParts();
    this.saveDraftToStorage();
  }

  onPlateKeydown(event: KeyboardEvent, partIndex: number): void {
    if (event.key === 'Backspace') {
      if (partIndex === 4 && !this.platePart4) this.p3Input?.nativeElement.focus();
      else if (partIndex === 3 && !this.platePart3) this.p2Select?.nativeElement.focus();
    }
  }

  updatePlateFromParts(): void {
    const res = buildPlateStringFromParts(
      this.isRoadVehicle(this.newVehicle.vehicle_type),
      this.platePart1,
      this.platePart2,
      this.platePart3,
      this.platePart4,
      this.freePlateNumber
    );
    this.platePart1 = res.p1;
    this.platePart3 = res.p3;
    this.platePart4 = res.p4;
    if (res.plateNumber) {
      this.newVehicle.plate_number = res.plateNumber;
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.isLightboxOpen) { this.closeLightbox(); return; }
    if (this.isTimelineModalOpen) { this.closeTimelineModal(); return; }
    if (this.isPendingDiffModalOpen) { this.closePendingDiffModal(); return; }
    if (this.isNewVehicleModalOpen) { this.closeNewVehicleModal(); return; }
    if (this.isExcelModalOpen) { this.closeExcelModal(); }
  }

  // ─── مدیریت ورود نرخ (نگهداری‌شده جهت تطبیق کدهای قبلی) ───
  onRateInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const oldVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(oldVal).replace(/\D/g, '');
    const num = Number(cleanDigits) || 0;
    this.newVehicle.default_service_rate = num;
    this.rateFormattedDisplay = num > 0 ? num.toLocaleString('fa-IR') : '';
    this.saveDraftToStorage();
    if (inputEl && typeof event !== 'string') inputEl.value = this.rateFormattedDisplay;
  }

  onShebaInput(event: any): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const inputEl = event?.target as HTMLInputElement | undefined;
      const oldVal = inputEl?.value || (typeof event === 'string' ? event : '');
      const digits = extractShebaDigits(oldVal);
      const res = validateSheba(digits);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || digits;
      this.newVehicle.sheba_number = digits;
      if (res.isValid && res.bank) {
        this.newVehicle.bank_name = res.bank.name;
        const autoAcc = extractAccountNumberFromSheba(digits);
        if (autoAcc && !this.newVehicle.account_number) this.newVehicle.account_number = autoAcc;
      }
      this.saveDraftToStorage();
      if (inputEl && typeof event !== 'string') inputEl.value = this.shebaDigitsDisplay;
    } finally {
      this._isSyncingBank = false;
    }
  }

  onShebaChange(): void {
    const digits = extractShebaDigits(this.newVehicle.sheba_number || '');
    const res = validateSheba(digits);
    this.shebaValidationResult = res;
    this.shebaDigitsDisplay = res.formattedDigits || digits;
    if (res.isValid && res.bank) {
      if (!this.newVehicle.bank_name) this.newVehicle.bank_name = res.bank.name;
      const autoAcc = extractAccountNumberFromSheba(digits);
      if (autoAcc && !this.newVehicle.account_number) this.newVehicle.account_number = autoAcc;
    }
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.onShebaInput({ target: { value: event.clipboardData?.getData('text') || '' } });
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const inputEl = event?.target as HTMLInputElement | undefined;
    const clean = normalizeDigits(inputEl?.value ?? (typeof event === 'string' ? event : '')).replace(/\D/g, '');
    this.newVehicle.account_number = clean;
    if (inputEl && typeof event !== 'string') inputEl.value = clean;
    if (this.newVehicle.bank_name && clean) this.attemptAutoGenerateSheba(this.newVehicle.bank_name, clean);
    this.saveDraftToStorage();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.onAccountNumberInput({ target: { value: event.clipboardData?.getData('text') || '' } });
  }

  onAccountNumberCopy(event?: ClipboardEvent): void {
    if (this.newVehicle.account_number) this.copyValue(this.newVehicle.account_number, 'account', 'شماره حساب');
  }

  openBankDropdown(): void {
    this.isBankDropdownOpen = true;
    this.bankSearchQuery = '';
  }

  selectBankFromDropdown(b: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.onBankSelect(b.name);
    this.isBankDropdownOpen = false;
  }

  onBankSelect(bankName: string): void {
    this.newVehicle.bank_name = bankName;
    if (this.newVehicle.account_number) {
      this.attemptAutoGenerateSheba(bankName, this.newVehicle.account_number);
    }
    this.saveDraftToStorage();
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

  private attemptAutoGenerateSheba(bankName: string, accountNum: string): void {
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

  copyShebaToClipboard(val?: string): void {
    const text = val || this.newVehicle.sheba_number;
    if (!text) return;
    this.copyValue('IR' + extractShebaDigits(text), 'sheba', 'شماره شبا');
    this.isShebaCopied = true;
    setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
  }

  copyAccountNumberToClipboard(val?: string): void {
    const text = val || this.newVehicle.account_number;
    if (!text) return;
    this.copyValue(text, 'account', 'شماره حساب');
    this.isAccountCopied = true;
    setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
  }

  copyValue(val: string, key?: string, label: string = 'مقدار'): void {
    if (!val) return;
    copyTextToClipboard(val, label, (type, msg) => this.toast.show(type as any, msg));
    if (key) {
      if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
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
    if (this.bankAccounts.some(a => extractShebaDigits(a.sheba_number) === cleanSheba)) {
      this.toast.show('warning', 'این شماره شبا قبلاً در لیست حساب‌ها اضافه شده است.');
      return;
    }
    const newAcc = createBankAccountFromState(this.newVehicle, cleanSheba, this.shebaValidationResult, this.newAccountPayeeType, this.bankAccounts.length === 0);
    if (this.editingId) {
      (this.facade?.addVehicleBankAccount(this.editingId, newAcc) || this.personnelApi.addVehicleBankAccount(this.editingId, newAcc)).subscribe({
        next: (saved) => {
          this.bankAccounts.push(saved);
          if (newAcc.is_primary) this.syncPrimaryAccountFields(newAcc);
          this.toast.show('success', `حساب بانکی «${newAcc.bank_name}» با موفقیت اضافه شد.`);
          this.cdr.detectChanges();
        },
        error: (err) => this.toast.show('error', 'خطا در ثبت حساب بانکی: ' + (err.error?.error || err.message || 'نامشخص'))
      });
    } else {
      this.bankAccounts.push(newAcc);
      if (newAcc.is_primary) this.syncPrimaryAccountFields(newAcc);
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
      (this.facade?.updateVehicleBankAccount(this.editingId, { ...primary, is_primary: true }) || this.personnelApi.updateVehicleBankAccount(this.editingId, { ...primary, is_primary: true })).subscribe({
        next: () => {
          this.toast.show('success', `حساب «${primary.bank_name}» به عنوان حساب اصلی واریز تنظیم شد.`);
          this.cdr.detectChanges();
        },
        error: (err) => this.toast.show('error', 'خطا در تغییر حساب اصلی: ' + (err.error?.error || err.message || 'نامشخص'))
      });
    } else {
      this.toast.show('success', `حساب «${primary.bank_name}» به عنوان حساب اصلی تنظیم گردید.`);
      this.saveDraftToStorage();
    }
  }

  removeBankAccount(index: number): void {
    removeBankAccountHelper(this, index);
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
    (this.facade?.getVehicleDocuments(vehicleId) || this.personnelApi?.getVehicleDocuments?.(vehicleId))?.subscribe({
      next: (docs) => { this.vehicleDocuments = Array.isArray(docs) ? docs : []; this.cdr.detectChanges(); },
      error: () => { this.vehicleDocuments = []; this.cdr.detectChanges(); }
    });
  }

  uploadAllPendingDocuments(vehicleId: number, onComplete?: () => void): void {
    if (!this.pendingUploadDocuments.length) { onComplete?.(); return; }
    const item = this.pendingUploadDocuments[0];
    if (!item) { onComplete?.(); return; }

    (this.facade?.uploadVehicleDocument(vehicleId, item.file, item.doc_type, item.title, item.expiry_date) ||
     this.personnelApi.uploadVehicleDocument(vehicleId, item.file, item.doc_type, item.title, item.expiry_date)).subscribe({
      next: (doc) => {
        this.pendingUploadDocuments.shift();
        this.vehicleDocuments.push(doc);
        this.toast.show('success', `مدرک «${doc.title || item.name}» بارگذاری شد.`);
        this.uploadAllPendingDocuments(vehicleId, onComplete);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSaving = false;
        this.toast.show('error', `خطا در آپلود مدرک «${item.name}»: ` + (err.error?.error || err.message || 'نامشخص'));
        this.loadRecentVehicles();
        this.cdr.detectChanges();
      }
    });
  }

  deleteExistingDocument(doc: VehicleDocument): void {
    if (!doc.id || !this.editingId) return;
    if (!confirm(`آیا از حذف مدرک «${doc.title || doc.file_name}» اطمینان دارید؟`)) return;

    (this.facade?.deleteVehicleDocument(this.editingId, doc.id) || this.personnelApi.deleteVehicleDocument(this.editingId, doc.id)).subscribe({
      next: () => {
        this.vehicleDocuments = this.vehicleDocuments.filter(d => d.id !== doc.id);
        this.toast.show('success', 'مدرک با موفقیت حذف گردید.');
        this.cdr.detectChanges();
      },
      error: (err) => this.toast.show('error', 'خطا در حذف مدرک: ' + (err.error?.error || err.message || 'نامشخص'))
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
    const { error, cleanCode } = validateNationalCodeInput(raw, false);
    this.newVehicle.driver_national_code = cleanCode;
    this.nationalCodeError = error;
    if (!cleanCode || error) {
      this.matchedPersonnelNotice = null;
      this.saveDraftToStorage();
      return;
    }
    this.saveDraftToStorage();
    this.lookupExistingPersonnel(cleanCode);
  }

  private lookupExistingPersonnel(nationalCode: string): void {
    this.personnelSearchSub?.unsubscribe();
    this.personnelSearchSub = (this.facade?.lookupPersonnelByNationalCode(nationalCode) || this.personnelApi?.lookupPersonnelByNationalCode?.(nationalCode) || this.personnelApi?.getPersonnelProfiles?.({ search: nationalCode }))?.subscribe({
      next: (res: any) => {
        const p = res?.personnel || (Array.isArray(res) ? res.find((item: any) => item.national_code === nationalCode) || res[0] : null);
        if (p) {
          this.matchedPersonnelNotice = `هم‌پوشانی با پرسنل سیستم (یافت شد: ${p.first_name} ${p.last_name}): «${p.first_name} ${p.last_name}» (${p.job_title || 'بدون عنوان'}).`;
          if (!this.newVehicle.driver_name) this.newVehicle.driver_name = `${p.first_name} ${p.last_name}`;
          if (!this.newVehicle.driver_phone && p.phone_number) this.newVehicle.driver_phone = p.phone_number;
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

  // ─── اعتبارسنجی کد ملی مالک خودرو ───
  onOwnerNationalCodeChange(): void {
    const raw = (this.newVehicle.owner_national_code || '').trim();
    const { error, cleanCode } = validateNationalCodeInput(raw, true);
    this.newVehicle.owner_national_code = cleanCode;
    this.ownerNationalCodeError = error;
    this.saveDraftToStorage();
  }

  // ─── معادل تومان نرخ پیش‌فرض (جهت سازگاری) ───
  get rateInTomans(): number {
    return Math.floor((Number(this.newVehicle.default_service_rate) || 0) / 10);
  }

  // ─── ثبت و بروزرسانی پرونده خودرو (تسک ۶.۷) ───
  saveVehicle(targetStatus: 'draft' | 'pending_supervisor' | 'approved' = 'draft'): void {
    if (this.isReadOnlyMode) { this.closeNewVehicleModal(); return; }
    this.updatePlateFromParts();
    const vCheck = validateVehicleFormBeforeSave(
      this.newVehicle,
      this.selectedSectionId,
      this.nationalCodeError,
      this.ownerNationalCodeError,
      this.shebaValidationResult
    );
    if (vCheck.error) {
      this.toast.show('warning', vCheck.error);
      if (vCheck.tab) this.setActiveTab(vCheck.tab);
      return;
    }

    this.isSaving = true;
    const payload = buildVehicleSavePayload(this.newVehicle, this.selectedSectionId, this.selectedSection, this.mySections);
    const req$ = this.editingId
      ? (this.facade?.updateVehicleProfile(this.editingId, payload) || this.personnelApi.updateVehicleProfile(this.editingId, payload))
      : (this.facade?.createVehicleProfile(payload) || this.personnelApi.createVehicleProfile(payload));

    req$.subscribe({
      next: (res: any) => {
        const vehicleId = this.editingId || res?.id;
        const plate = res?.plate_number || this.newVehicle.plate_number;

        const proceed = () => {
          if (this.isApprovedRecord) {
            this.isSaving = false;
            this.toast.show('success', `درخواست تغییرات خودرو «${plate}» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.`);
            this.closeNewVehicleModal();
            this.loadRecentVehicles();
            return;
          }
          const currentStatus = res?.approval_status || this.editingVehicle?.approval_status || 'draft';
          if (targetStatus === 'pending_supervisor' && vehicleId && (currentStatus === 'draft' || currentStatus === 'revision_required')) {
            if (typeof this.personnelApi?.submitVehicleProfile === 'function' || typeof this.facade?.submitVehicleProfile === 'function') {
              (this.facade?.submitVehicleProfile(vehicleId) || this.personnelApi.submitVehicleProfile(vehicleId)).subscribe({
                next: () => {
                  this.isSaving = false;
                  this.clearDraftFromStorage();
                  this.toast.show('success', `خودرو «${plate}» ثبت و به کارتابل سرپرست ارسال گردید.`);
                  this.closeNewVehicleModal();
                  this.loadRecentVehicles();
                },
                error: (submitErr: any) => {
                  this.isSaving = false;
                  if (!this.editingId) { this.editingId = vehicleId; this.editingVehicle = res; }
                  const missing = submitErr.error?.missing_fields;
                  if (Array.isArray(missing) && missing.length > 0) {
                    this.serverMissingFields = missing.map((m: any) => typeof m === 'object' && m !== null && m.field ? m.field : String(m));
                    this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما به دلیل نواقص پرونده ارسال نشد: ' + this.formatMissingFields(missing));
                    this.mapMissingFieldsToTab(this.serverMissingFields);
                  } else {
                    this.toast.show('warning', 'پیش‌نویس ذخیره شد، اما خطا در ارسال به سرپرست: ' + (submitErr.error?.error || submitErr.message || 'نامشخص'));
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
            this.toast.show('success', this.editingId ? (this.isRevisionMode ? `پرونده خودرو «${plate}» با موفقیت ذخیره شد.` : `تغییرات پیش‌نویس خودرو «${plate}» با موفقیت ذخیره شد.`) : `خودرو «${plate}» با راننده «${res.driver_name}» در وضعیت پیش‌نویس ثبت شد.`);
            this.closeNewVehicleModal();
            this.loadRecentVehicles();
          }
        };

        if (vehicleId && this.pendingUploadDocuments.length > 0) {
          this.uploadAllPendingDocuments(vehicleId, proceed);
        } else {
          proceed();
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
          this.toast.show('error', (this.editingId ? 'خطا در ویرایش خودرو: ' : 'خطا در ثبت خودرو: ') + msg);
        }
        this.cdr.detectChanges();
      }
    });
  }

  formatMissingFields(missing: any[]): string {
    return formatMissingFieldsText(missing);
  }

  // ─── ارسال صریح پرونده پیش‌نویس به کارتابل سرپرست (تسک ۶.۷ - POST /submit/) ───
  submitDraftVehicle(v?: VehicleDriverProfile): void {
    submitDraftVehicleHelper(this, v);
  }

  submitDraftToSupervisor(v: VehicleDriverProfile): void {
    this.submitDraftVehicle(v);
  }

  // ─── فاز ۷: بازگشایی پرونده ردشده (تسک ۷.۳ - reopen) ───
  reopenRejectedVehicle(v: VehicleDriverProfile): void {
    if (!v.id || this.isReopening) return;
    this.isReopening = true;
    (this.facade?.reopenVehicleProfile(v.id) || this.personnelApi.reopenVehicleProfile(v.id)).subscribe({
      next: (res: any) => {
        this.isReopening = false;
        this.toast.show('success', 'پرونده با موفقیت به وضعیت پیش‌نویس بازگشایی شد.');
        v.approval_status = 'draft';
        this.loadRecentVehicles();
        this.openEditModal({ ...v, ...res, approval_status: 'draft' });
      },
      error: (err: any) => {
        this.isReopening = false;
        this.toast.show('error', 'خطا در بازگشایی پرونده: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  cancelPendingChangeRequest(v: VehicleDriverProfile): void {
    const crId = v.pending_change_request?.id;
    if (!crId) {
      this.toast.show('warning', 'شناسه درخواست تغییرات یافت نشد.');
      return;
    }
    if (!confirm(`آیا از ابطال درخواست تغییرات خودرو «${v.plate_number}» اطمینان دارید؟`)) return;

    this.isCancellingChangeRequest = true;
    (this.facade?.cancelVehicleChangeRequest(crId) || this.personnelApi.cancelVehicleChangeRequest(crId)).subscribe({
      next: () => {
        this.isCancellingChangeRequest = false;
        this.toast.show('success', 'درخواست تغییرات با موفقیت ابطال شد.');
        v.has_pending_changes = false;
        v.pending_change_request = null;
        if (this.isPendingDiffModalOpen) this.closePendingDiffModal();
        this.loadRecentVehicles();
      },
      error: (err: any) => {
        this.isCancellingChangeRequest = false;
        this.toast.show('error', 'خطا در ابطال درخواست تغییرات: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  openTimelineModal(v: VehicleDriverProfile): void {
    if (!v.id) return;
    this.timelineVehicle = v;
    this.timelineLogs = [];
    this.isTimelineModalOpen = true;
    this.isLoadingTimeline = true;
    this.cdr.detectChanges();

    (this.facade?.getWorkflowAuditLogs({ content_type: 'vehicle', object_id: v.id }) || this.personnelApi.getWorkflowAuditLogs({ content_type: 'vehicle', object_id: v.id })).subscribe({
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
    return getWorkflowActionLabelHelper(action);
  }

  getWorkflowActionBadgeClass(action?: string): string {
    return getWorkflowActionBadgeClassHelper(action);
  }

  getWorkflowActionIcon(action?: string): string {
    return getWorkflowActionIconHelper(action);
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
    return formatDiffValueHelper(key, value, this.vehicleTypesFlat, this.ownershipTypes);
  }

  resetForm(): void {
    resetVehicleFormState(this);
  }

  // ─── حذف خودرو پیش‌نویس یا عودت‌داده‌شده ───
  deleteDraftVehicle(vehicle: VehicleDriverProfile): void {
    if (!vehicle.id) return;
    if (vehicle.approval_status !== 'draft' && vehicle.approval_status !== 'revision_required') {
      this.toast.show('warning', 'فقط خودروهای در وضعیت پیش‌نویس یا عودت‌داده‌شده قابل حذف توسط کارمند هستند.');
      return;
    }
    const typeDesc = vehicle.approval_status === 'revision_required' ? 'عودت‌داده‌شده' : 'پیش‌نویس';
    if (!confirm(`آیا از حذف پرونده ${typeDesc} خودرو شماره «${vehicle.plate_number}» (${vehicle.driver_name}) اطمینان دارید؟`)) return;

    (this.facade?.deleteVehicleProfile(vehicle.id) || this.personnelApi.deleteVehicleProfile(vehicle.id)).subscribe({
      next: () => {
        this.toast.show('success', `پرونده ${typeDesc} خودرو «${vehicle.plate_number}» با موفقیت حذف گردید.`);
        this.loadRecentVehicles();
      },
      error: (err: any) => this.toast.show('error', 'خطا در حذف پیش‌نویس خودرو: ' + (err.error?.error || err.message || 'نامشخص'))
    });
  }

  // ─── فرمت‌بندی و نمایش وضعیت (Concise Icons & Labels) ───
  getStatusBadgeClass(status?: string): string { return getStatusBadgeClassHelper(status); }
  getStatusIcon(status?: string): string { return getStatusIconHelper(status); }
  getStatusLabel(status?: string): string { return getStatusLabelHelper(status); }
  getFullStatusDescription(status?: string): string { return getFullStatusDescriptionHelper(status); }
  getVehicleTypeLabel(type?: string): string { const f = this.vehicleTypesFlat.find(t => t.value === type); return f ? f.label : (type || '-'); }
  getOwnershipTypeLabel(type?: string): string { const f = this.ownershipTypes.find(t => t.value === type); return f ? f.label : (type || '-'); }
  formatNumber(val: number | string | undefined | null): string { return formatNumberHelper(val); }
  formatShebaDisplay(sheba?: string): string { return formatShebaDisplayHelper(sheba); }

  navigateToPersonnel(): void {
    this.router.navigate(['/app/finance/employee-new-personnel'], {
      queryParams: this.selectedSectionId ? { section_id: this.selectedSectionId } : {}
    });
  }
}
