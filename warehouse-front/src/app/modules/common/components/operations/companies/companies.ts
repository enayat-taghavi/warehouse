import { CompaniesFacade } from './companies.facade';
import {
  COMPANY_DOCUMENT_TYPES_LIST,
  getFiscalPeriodStatusBadge,
  getFiscalPeriodStatusLabel,
  getEmptyFiscalPeriodData,
  getEmptyDocData,
  getDocStatusClass,
  getDocStatusLabel,
  filterCompanyDocuments,
  isNationalIdChecksumValid,
  buildCompanyPayload
} from './companies.helpers';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, HostListener, Type, ViewChild, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, takeUntil } from 'rxjs/operators';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { AccountsHttpService, User } from '../../../../../core/http/accounts-http.service';
import { resolveServerUrl } from '../../../../../core/platform/server-origin';
import { saveBlob, saveUrl } from '../../../../../core/platform/file-output';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { CompanyStudioSection, CompanyStudioTab } from '../../../../../core/modules/module-contract';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { DocumentPreviewComponent } from '../../../../../shared/components/document-preview/document-preview.component';
import {
  Company,
  CompanyDocument,
  CompanyDocumentType,
  CompanyFiscalPeriod,
  UserCompanyAccess,
  CompanyAccessLevel
} from '../../../../../core/models/company.model';
import { normalizeDigits } from '../../../../../core/utils/date-utils';
import { ConfirmDialogService, ConfirmDialogConfig } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { CompanyGdriveTabComponent } from './company-gdrive-tab/company-gdrive-tab';
import { ServerUrlPipe } from '../../../../../shared/pipes/server-url.pipe';
import { ExternalLinkDirective } from '../../../../../shared/directives/external-link.directive';

@Component({
  selector: 'app-companies-management',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective, ActionButtonComponent, TabBarComponent, CompanyGdriveTabComponent, ServerUrlPipe, ExternalLinkDirective, LoadingSkeletonComponent, OfflinePendingBadgeComponent, DocumentPreviewComponent],
  providers: [CompaniesFacade, CompanyStudioContextService],
  templateUrl: './companies.html',
  styleUrls: ['./companies.css']
})
export class CompaniesManagementComponent implements OnInit, OnDestroy {
  private facade = inject(CompaniesFacade);
  /** تب‌هایی که داده‌شان در حسابداری است (بانک، هیئت‌مدیره، گوگل‌درایو). در تب مدارک فقط بایگانی حسابداری پنهان می‌شود. */
  private static readonly ACCOUNTING_TABS = ['gdrive'];
  private static readonly LIST_URL = '/app/operations/companies';
  /** فیلدهای فرم شرکت که در تب «بیمه و مالی» هستند؛ بقیه در تب هویتی‌اند (برای نشان خطای تب) */
  private static readonly FISCAL_TAB_FIELDS = [
    'workshop_code', 'economic_code', 'tax_memory_id', 'tax_economic_code', 'social_security_branch_code',
    'social_security_branch_name', 'contract_row', 'employer_name', 'fiscal_year_start_month'
  ];
  private static readonly CORE_DOC_MAX_BYTES = 20 * 1024 * 1024;
  /** فیلدهایی که زیرشان پیام خطا نمایش داده می‌شود */
  private static readonly FIELD_ERROR_KEYS = [
    'code', 'name', 'national_id', 'registration_number', 'phone', 'postal_code', 'workshop_code',
    'economic_code', 'tax_memory_id', 'tax_economic_code', 'social_security_branch_code', 'contract_row'
  ];

  private api = inject(CompanyApiService);
  private companyApi = this.api;
  public activeCompanyService = inject(ActiveCompanyService);
  private accountsHttp = inject(AccountsHttpService, { optional: true });
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private ws = inject(WebSocketService, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });
  private moduleRegistry = inject(ModuleRegistryService);
  /** context مشترک با تب‌ها و بخش‌های مشارکتی ماژول‌ها (§۵-۲) */
  readonly studioContext = inject(CompanyStudioContextService);
  @ViewChild(DocumentPreviewComponent, { static: true }) docPreview?: DocumentPreviewComponent;
  private offlineSync = OfflineSyncService.getInstance();
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();

  // حالت نمای جاری: 'list' (فهرست شرکت‌ها) یا 'studio' (استودیوی تمام‌صفحه)
  public viewMode: 'list' | 'studio' = 'list';

  public isOnline = this.network.isOnline;

  companies: Company[] = [];
  filteredCompanies: Company[] = [];
  systemUsers: User[] = [];
  isLoading = false;
  /** دریافت فهرست شرکت‌ها شکست خورد (حالت خطا با «تلاش دوباره») */
  listLoadError = false;

  // وضعیت بارگذاری استودیو در باز کردن مستقیم /companies/:id
  studioLoading = false;
  studioLoadError = false;
  /** خطای دریافت دادهٔ هر تب استودیو (کلید: شناسهٔ تب) */
  tabLoadError: { [tab: string]: boolean } = {};
  /** ثبت شرکت تازه در حالت آفلاین در صف رفته و هنوز شناسهٔ سرور ندارد */
  isQueuedCreate = false;
  /** آخرین ذخیرهٔ ویرایش در صف آفلاین است */
  isQueuedSave = false;
  /** بارگذاری در جریان اساسنامه و روزنامهٔ رسمی */
  uploadingCoreDoc: { [key: string]: boolean } = {};
  private studioSnapshot: string | null = null;
  /** پس از ذخیرهٔ موفق و هنگام رفتن به نشانی شرکت تازه، هشدار خروج لازم نیست */
  private leavingAfterSave = false;
  /** لوگویی که بارگذاری‌اش پس از ثبت شرکت شکست خورد و با state ناوبری به این نمونه رسید */
  private pendingLogoFromNavigation: File | null = null;
  private systemUsersRequested = false;

  // فیلتر جستجوی زنده درجا
  searchQuery = '';
  private searchSubject = new Subject<string>();

  // مدیریت آپلود و حذف لوگو
  selectedLogoFile: File | null = null;
  logoPreviewUrl: string | null = null;
  isLogoCleared = false;

  // تب فعال در استودیوی مودال به ترتیب استاندارد حقوقی و مالی
  // شناسهٔ تب هسته یا تب مشارکتی ماژول‌ها (studioTabs)
  activeModalTab: string = 'identity';

  // مدیریت باز/بسته بودن پاپ‌اورهای تقویم جلالی
  isRegDatePickerOpen = false;
  isBoardDatePickerOpen = false;
  isDocIssueDatePickerOpen = false;
  isDocExpiryDatePickerOpen = false;
  isFiscalStartDatePickerOpen = false;
  isFiscalEndDatePickerOpen = false;

  // کنترل‌های فرم تقویم شمسی جلالی (Reactive FormControls برای عملکرد بی‌نقص ng-persian-datepicker)
  regDateControl = new FormControl('');
  docIssueDateControl = new FormControl('');
  docExpiryDateControl = new FormControl('');
  fiscalStartControl = new FormControl('');
  fiscalEndControl = new FormControl('');

  // فهرست انواع اسناد و مدارک رسمی
  readonly documentTypesList: { value: CompanyDocumentType; label: string }[] = [
    { value: 'statute', label: 'اساسنامه شرکت' },
    { value: 'establishment_gazette', label: 'روزنامه رسمی تأسیس' },
    { value: 'changes_gazette', label: 'روزنامه رسمی آخرین تغییرات هیئت‌مدیره' },
    { value: 'auditors_gazette', label: 'روزنامه رسمی تمدید بازرسان' },
    { value: 'capital_gazette', label: 'روزنامه رسمی تغییرات سرمایه و آدرس' },
    { value: 'vat_certificate', label: 'گواهی ثبت‌نام ارزش افزوده' },
    { value: 'tax_clearance', label: 'مفاصاحساب مالیاتی / بیمه‌ای' },
    { value: 'commercial_card', label: 'کارت بازرگانی' },
    { value: 'contractor_qualification', label: 'گواهی رتبه‌بندی / صلاحیت پیمانکاری (ساجار)' },
    { value: 'labor_safety_certificate', label: 'گواهی صلاحیت ایمنی پیمانکاران (اداره کار)' },
    { value: 'operating_license', label: 'پروانه بهره‌برداری / جواز فعالیت' },
    { value: 'lease_contract', label: 'سند مالکیت / اجاره‌نامه رسمی' },
    { value: 'master_agreement', label: 'قرارداد مادر یا تفاهم‌نامه' },
    { value: 'other', label: 'سایر مدارک و اسناد رسمی' },
  ];

  // مدیریت آرشیو مدارک شرکت
  companyDocuments: CompanyDocument[] = [];
  filteredDocuments: CompanyDocument[] = [];
  docSearchQuery = '';
  selectedDocTypeFilter = '';
  isLoadingDocuments = false;
  isUploadingDoc = false;

  newDoc: {
    document_type: CompanyDocumentType;
    title: string;
    file: File | null;
    issue_date: string;
    expiry_date: string;
    is_confidential: boolean;
    description: string;
  } = this.getEmptyDocData();

  // مدیریت دوره‌های مالی رسمی شرکت (CompanyFiscalPeriod)
  companyFiscalPeriods: CompanyFiscalPeriod[] = [];
  isLoadingFiscalPeriods = false;
  isSavingFiscalPeriod = false;
  showFiscalPeriodForm = false;
  newFiscalPeriod = {
    fiscal_year: '',
    title: '',
    start_date: '',
    end_date: '',
    notes: ''
  };

  // سطوح دسترسی سه‌گانه به شرکت
  readonly accessLevelsList: { value: CompanyAccessLevel; label: string; desc: string }[] = [
    {
      value: 'docs_read',
      label: 'فقط مشاهده مدارک رسمی',
      desc: 'دسترسی فقط‌خواندنی به اساسنامه، روزنامه‌ها و مدارک شرکت (بدون دسترسی به فضاهای عملیاتی)'
    },
    {
      value: 'docs_write',
      label: 'مشاهده و بارگذاری مدارک رسمی',
      desc: 'امکان مشاهده و بارگذاری اسناد و مدارک شرکت در کارتابل بایگانی اسناد'
    },
    {
      value: 'workspace_full',
      label: 'عضویت کامل در فضای کاری و ماژول‌ها',
      desc: 'دسترسی عملیاتی به سامانه‌ها، پروژه‌ها، پرسنل و سوئیچر هدر'
    }
  ];

  // مدیریت دسترسی‌های استودیو (تب ششم)
  studioAccesses: UserCompanyAccess[] = [];
  isLoadingStudioAccesses = false;
  studioSelectedUserId: number | null = null;
  studioAccessLevel: CompanyAccessLevel = 'docs_read';
  studioRoleInCompany = '';
  studioIsDefaultAccess = false;
  userSearchQuery = '';


  // وضعیت مدال ثبت و ویرایش
  companyModal: {
    isOpen: boolean;
    isEdit: boolean;
    isSubmitting: boolean;
    data: {
      id?: number;
      code: string;
      name: string;
      company_type: string;
      national_id: string;
      economic_code: string;
      registration_number: string;
      registration_date: string;
      registered_capital: number | null;
      shares_count: number | null;
      share_nominal_value: number | null;
      fiscal_year_start_month: number;
      phone: string;
      address: string;
      postal_code: string;
      ceo_name: string;
      board_chairman: string;
      board_vice_chairman: string;
      main_inspector: string;
      alternate_inspector: string;
      authorized_signers: string;
      board_term_expiry: string;
      workshop_code: string;
      social_security_branch_code: string;
      social_security_branch_name: string;
      contract_row: string;
      employer_name: string;
      tax_memory_id: string;
      tax_economic_code: string;
      primary_bank_name: string;
      primary_account_number: string;
      primary_iban: string;
      articles_of_association?: string | null;
      latest_gazette?: string | null;
      is_active: boolean;
      has_warehouse_module: boolean;
      logo?: string | null;
    };
    errors: { [key: string]: string };
  } = {
    isOpen: false,
    isEdit: false,
    isSubmitting: false,
    data: this.getEmptyCompanyData(),
    errors: {}
  };

  // وضعیت مدال تایید حذف
  deleteModal: {
    isOpen: boolean;
    target: Company | null;
    isDeleting: boolean;
  } = {
    isOpen: false,
    target: null,
    isDeleting: false
  };

  ngOnInit(): void {
    this.ws?.connect();
    this.setupRealtimeAndOfflineListeners();
    // فیلدهای شرکت که تب مشارکتی روی سرور ثبت کرد (مثلاً حساب اصلی) در فرم می‌آیند و تغییر ذخیره‌نشده حساب نمی‌شوند
    this.studioContext.serverFields$.pipe(takeUntil(this.destroy$)).subscribe(({ companyId, fields }) => {
      // پاسخ دیررسِ شرکتی که کاربر از آن رفته در فرم شرکت دیگر نمی‌نشیند
      if (companyId !== this.studioContext.companyId()) return;
      for (const [key, value] of Object.entries(fields)) {
        if (!(key in this.companyModal.data)) continue;
        (this.companyModal.data as Record<string, unknown>)[key] = value;
        this.patchStudioSnapshot(key, value);
      }
      this.cdr.markForCheck();
    });
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOnline = this.network.isOnline;
      this.cdr.markForCheck();
    });
    const navState = this.router?.getCurrentNavigation()?.extras?.state as { pendingLogo?: unknown } | undefined;
    if (navState?.pendingLogo instanceof File) {
      this.pendingLogoFromNavigation = navState.pendingLogo;
    }
    this.setupDateControls();
    this.setupSearch();
    // مسیر نخست خوانده می‌شود تا در حالت استودیو فهرست شرکت‌ها بی‌دلیل دریافت نشود
    this.setupRouteNavigation();
    if (this.viewMode === 'list') {
      this.loadCompanies();
    }
    this.setupListReloadOnReturn();
  }

  /**
   * فهرست با راهبرد reuse نگه داشته می‌شود؛ هر بار که کاربر از استودیو به فهرست برمی‌گردد
   * داده تازه می‌شود تا تغییرات همین تب (که وب‌سوکت به‌خاطر فیلتر اکو نمی‌رساند) دیده شوند.
   */
  private setupListReloadOnReturn(): void {
    if (!this.router) return;
    const initialNavigationId = this.router.getCurrentNavigation()?.id ?? null;
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((e) => {
      if (e.id === initialNavigationId || this.viewMode !== 'list') return;
      if (e.urlAfterRedirects.split('?')[0] === CompaniesManagementComponent.LIST_URL) {
        this.loadCompanies();
      }
    });
  }

  /** پس از کارهای استودیو، فهرست فقط وقتی دیده می‌شود دوباره دریافت شود */
  private reloadListIfVisible(): void {
    if (this.viewMode === 'list') {
      this.loadCompanies();
    }
  }

  /** رکوردی که در حالت آفلاین ساخته شده و هنوز شناسهٔ سرور ندارد */
  isPendingRecord(rec: any): boolean {
    return !!rec?._offlinePending || (typeof rec?.id === 'number' && rec.id < 0);
  }

  private requireOnline(actionFa: string): boolean {
    if (this.network.isOnline) return true;
    this.toast.warning(`${actionFa} فقط در حالت برخط ممکن است.`);
    return false;
  }

  private async confirmAction(config: ConfirmDialogConfig): Promise<boolean> {
    if (this.confirmDialog) {
      return (await this.confirmDialog.open({ cancelText: 'انصراف', ...config })) === true;
    }
    return window.confirm(config.message);
  }

  // ═════════════════════════════════════════════════════════════════════
  // هشدار تغییرات ذخیره‌نشده (ت۳)
  // ═════════════════════════════════════════════════════════════════════
  private takeStudioSnapshot(): void {
    this.studioSnapshot = JSON.stringify(this.companyModal.data);
  }

  /** فیلدی که بیرون از دکمهٔ ذخیره روی سرور ثبت شد (مثلاً سند مادر) نباید تغییر ذخیره‌نشده حساب شود */
  private patchStudioSnapshot(key: string, value: unknown): void {
    if (this.studioSnapshot === null) return;
    const snap = JSON.parse(this.studioSnapshot);
    snap[key] = value;
    this.studioSnapshot = JSON.stringify(snap);
  }

  private hasPendingSubForms(): boolean {
    if (this.showFiscalPeriodForm) return true;
    if (this.newDoc.file || this.newDoc.title.trim()) return true;
    return !!this.studioSelectedUserId;
  }

  hasUnsavedChanges(): boolean {
    if (this.leavingAfterSave || this.viewMode !== 'studio' || !this.companyModal.isOpen || this.studioLoading) return false;
    if (this.studioSnapshot !== null && JSON.stringify(this.companyModal.data) !== this.studioSnapshot) return true;
    if (this.selectedLogoFile || this.isLogoCleared) return true;
    // فرم‌های ذخیره‌نشدهٔ تب‌ها و بخش‌های مشارکتی ماژول‌ها
    return this.hasPendingSubForms() || this.studioContext.isDirty();
  }

  /** پرسش پیش از خروج از استودیو؛ گارد مسیر و دکمه‌های بازگشت از همین استفاده می‌کنند */
  async confirmLeave(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    return this.confirmAction({
      title: 'تغییرات ذخیره نشده',
      message: 'تغییراتی که در این شرکت داده‌اید هنوز ذخیره نشده است. با خروج، این تغییرات از بین می‌رود.',
      type: 'warning',
      confirmText: 'خروج بدون ذخیره',
      cancelText: 'ماندن در صفحه'
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private setupRealtimeAndOfflineListeners(): void {
    // ۱. شنود وب‌سوکت سراسری برای اعمال بلادرنگ تغییرات سایر تب‌ها یا دستگاه‌های کاربر
    if (this.ws) {
      this.ws.notifications$.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
        if (msg?.type_str === 'org_structure_updated') {
          // فیلتر اکو: رویدادهایی که مبدا آنها همین تب بوده قبلاً به شکل خوش‌بینانه و درجا اعمال شده‌اند
          if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) {
            return;
          }
          const currentCompanyId = this.companyModal.data?.id;
          const targetCompanyId = msg.company_id || msg.project_id;

          if (msg.entity_type === 'company') {
            this.reloadListIfVisible();
          } else if (msg.entity_type === 'company_bank_account' || msg.entity_type === 'company_board_member') {
            // تب‌های مشارکتی دادهٔ خودشان را تازه می‌کنند؛ فهرست (ستون‌های حسابداری) فقط وقتی دیده می‌شود
            this.reloadListIfVisible();
          } else if (msg.entity_type === 'company_document') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadCompanyDocuments(currentCompanyId);
            }
            this.reloadListIfVisible();
          } else if (msg.entity_type === 'company_access') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadStudioAccesses(currentCompanyId);
            }
          }
        }
      });
    }

    // ۲. شنود تغییرات زنده کش و صف آفلاین SWR جهت دریافت نتایج پس‌زمینه
    this.offlineSync.liveDataUpdates$.pipe(takeUntil(this.destroy$)).subscribe(({ url, data }) => {
      if (!url) return;
      const currentCompanyId = this.companyModal.data?.id;
      if (this.companyApi.matchesCompanyUrl(url, 'companies')) {
        if (Array.isArray(data)) {
          this.companies = data;
          this.applyFilter();
        } else if (data && Array.isArray((data as any).results)) {
          this.companies = (data as any).results;
          this.applyFilter();
        }
      } else if (this.companyApi.matchesCompanyUrl(url, 'documents')) {
        if (this.companyModal.isOpen && currentCompanyId && url.includes(`company_id=${currentCompanyId}`)) {
          if (Array.isArray(data)) {
            this.companyDocuments = data;
          } else if (data && Array.isArray((data as any).results)) {
            this.companyDocuments = (data as any).results;
          }
          this.applyDocumentFilters();
        }
      } else if (url.includes('/user-company-access/')) {
        if (this.companyModal.isOpen && currentCompanyId && url.includes(`company_id=${currentCompanyId}`)) {
          if (Array.isArray(data)) {
            this.studioAccesses = data;
          } else if (data && Array.isArray((data as any).results)) {
            this.studioAccesses = (data as any).results;
          }
          this.cdr.markForCheck();
        }
      }
    });
  }

  private setupDateControls(): void {
    this.regDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.companyModal.data.registration_date = val || '';
    });
    this.docIssueDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newDoc.issue_date = val || '';
    });
    this.docExpiryDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newDoc.expiry_date = val || '';
    });
    this.fiscalStartControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.start_date = val || '';
    });
    this.fiscalEndControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.end_date = val || '';
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async askConfirm(title: string, message: string): Promise<boolean> {
    if (this.confirmDialog) {
      const res = await this.confirmDialog.open({
        title,
        message,
        type: 'danger',
        confirmText: 'حذف',
        cancelText: 'انصراف'
      });
      return res === true;
    }
    return window.confirm(message);
  }

  private setupSearch(): void {
    this.searchSubject
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyFilter();
      });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilter();
  }

  loadCompanies(): void {
    this.isLoading = true;
    this.listLoadError = false;
    this.api.getAll().subscribe({
      next: (res) => {
        this.isLoading = false;
        if (Array.isArray(res)) {
          this.companies = res;
        } else if (res && Array.isArray(res.results)) {
          this.companies = res.results;
        } else {
          this.companies = [];
        }
        this.applyFilter();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoading = false;
        this.listLoadError = true;
        // قطعی سرور (از جمله ۵۲۰ تا ۵۳۰ تونل) با حالت خطای صفحه نشان داده می‌شود، نه toast
        if (this.network.isOnline && !isServerUnreachable(err?.status ?? 0)) {
          this.toast.error('خطا در دریافت فهرست شرکت‌ها');
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** یکسان‌سازی رقم فارسی و عربی و «ي/ك» عربی برای جستجو */
  private normalizeSearchText(value: string | null | undefined): string {
    return normalizeDigits(value || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
  }

  applyFilter(): void {
    if (!this.searchQuery.trim()) {
      this.filteredCompanies = [...this.companies];
      this.cdr.markForCheck();
      return;
    }
    const q = this.normalizeSearchText(this.searchQuery);
    this.filteredCompanies = this.companies.filter((c) =>
      [c.name, c.code, c.national_id, c.economic_code, c.ceo_name, c.workshop_code]
        .some(field => this.normalizeSearchText(field).includes(q))
    );
    this.cdr.markForCheck();
  }

  onLogoFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.selectedLogoFile = file;
      this.isLogoCleared = false;
      const reader = new FileReader();
      reader.onload = () => {
        this.logoPreviewUrl = reader.result as string;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }

  clearLogo(): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = null;
    this.isLogoCleared = true;
    if (this.companyModal.data) {
      this.companyModal.data.logo = null;
    }
    this.cdr.markForCheck();
  }

  /** در نصب «فقط انبار» تب‌ها و بخش‌های حسابداری شرکت پنهان‌اند */
  get isAccountingInstalled(): boolean {
    return this.moduleRegistry.getExtensions('companies').some(e => e.extension.providesTreasury === true);
  }

  /** در نصب «فقط مالی» ستون‌ها، فیلدها و تب‌های انبارداری شرکت پنهان‌اند */
  get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.getExtensions('companies').some(e => e.extension.hasWarehouseModuleToggle);
  }

  /** تعداد ستون‌های پویا: ۸ پایه + ۲ حسابداری + ۱ انبار */
  get tableColspan(): number {
    return 8 + (this.isAccountingInstalled ? 2 : 0) + (this.isWarehouseInstalled ? 1 : 0);
  }

  /** جای تب‌های هسته؛ تب مشارکتی با `order` خودش میان آن‌ها می‌نشیند (§۵-۴) */
  private static readonly CORE_TAB_ORDER: Record<string, number> = {
    identity: 10, fiscal_insurance: 20, documents: 50, access: 60, gdrive: 70
  };

  private _contributedTabsKey = '';
  private _contributedTabs: CompanyStudioTab[] = [];

  /** تب‌های مشارکتی ماژول‌های نصب‌شده (studioTabs) به ترتیب order؛ شناسهٔ هم‌نام با تب هسته نادیده گرفته می‌شود */
  get contributedTabs(): CompanyStudioTab[] {
    const exts = this.moduleRegistry.getExtensions('companies');
    const key = exts.map(e => e.moduleCode).join(',');
    if (key !== this._contributedTabsKey) {
      this._contributedTabsKey = key;
      this._contributedTabs = exts
        .flatMap(e => e.extension.studioTabs || [])
        .filter(t => !(t.id in CompaniesManagementComponent.CORE_TAB_ORDER))
        .sort((a, b) => a.order - b.order);
    }
    return this._contributedTabs;
  }

  /** تب‌های مشارکتی که اکنون در دسترس‌اند (hiddenUntilSaved پیش از ذخیره کنار می‌رود) */
  get visibleContributedTabs(): CompanyStudioTab[] {
    return this.contributedTabs.filter(t => this.isTabAvailable(t.id));
  }

  /** تب‌های هسته‌ای که جایگاه بخش مشارکتی دارند */
  readonly sectionSlots: CompanyStudioSection['slot'][] = ['fiscal_insurance', 'documents'];

  /** بخش‌های مشارکتی یک تب هسته (studioSections) به ترتیب order */
  sectionsFor(slot: CompanyStudioSection['slot']): CompanyStudioSection[] {
    return this.moduleRegistry.getExtensions('companies')
      .flatMap(e => e.extension.studioSections || [])
      .filter(sec => sec.slot === slot)
      .sort((a, b) => a.order - b.order);
  }

  /** شرکت ذخیره‌شده (شناسهٔ سرور دارد)؛ تب‌های وابسته به شناسه پیش از آن پیام «ابتدا ذخیره کنید» نشان می‌دهند */
  get hasSavedCompany(): boolean {
    return (this.companyModal.data.id ?? 0) > 0;
  }

  private contributedTab(tab: string): CompanyStudioTab | undefined {
    return this.contributedTabs.find(t => t.id === tab);
  }

  /** شناسهٔ تب در query معتبر است: تب هسته یا تب مشارکتی ماژول نصب‌شده */
  private isKnownTab(tab: string): boolean {
    return tab in CompaniesManagementComponent.CORE_TAB_ORDER || !!this.contributedTab(tab);
  }

  private isTabAvailable(tab: string): boolean {
    const contributed = this.contributedTab(tab);
    if (contributed) return !(contributed.hiddenUntilSaved && !this.hasSavedCompany);
    return tab in CompaniesManagementComponent.CORE_TAB_ORDER
      && (this.isAccountingInstalled || !CompaniesManagementComponent.ACCOUNTING_TABS.includes(tab));
  }

  // ═════════════════════════════════════════════════════════════════════
  // بارگذاری تنبل کامپوننت‌های مشارکتی (تب‌ها و بخش‌ها)
  // ═════════════════════════════════════════════════════════════════════
  private readonly contributionComponents = signal<Record<string, Type<unknown>>>({});
  private readonly contributionFailures = signal<Record<string, boolean>>({});
  private readonly contributionsLoading = new Set<string>();

  /** کامپوننت بارگذاری‌شده؛ تا رسیدن آن null (و بارگذاری یک بار آغاز می‌شود) */
  contributionComponent(key: string, loader: () => Promise<Type<unknown>>): Type<unknown> | null {
    const loaded = this.contributionComponents()[key];
    if (loaded) return loaded;
    if (!this.contributionFailures()[key] && !this.contributionsLoading.has(key)) {
      this.contributionsLoading.add(key);
      loader()
        .then(component => this.contributionComponents.update(c => ({ ...c, [key]: component })))
        .catch(() => this.contributionFailures.update(f => ({ ...f, [key]: true })))
        .finally(() => {
          this.contributionsLoading.delete(key);
          this.cdr.markForCheck();
        });
    }
    return null;
  }

  contributionFailed(key: string): boolean {
    return this.contributionFailures()[key] === true;
  }

  retryContribution(key: string): void {
    this.contributionFailures.update(f => ({ ...f, [key]: false }));
  }

  private _cachedModalTabs: TabDef[] = [];
  private _modalTabsKey = '';

  get modalTabs(): TabDef[] {
    const errorTabs = this.errorTabs();
    const contributed = this.contributedTabs.filter(t => this.isTabAvailable(t.id));
    const contributedKey = contributed
      .map(t => `${t.id}:${this.studioContext.count(t.id) ?? ''}:${this.studioContext.hasError(t.id)}`)
      .join('|');
    const key = `${this.isAccountingInstalled}_${this.companyDocuments.length}_${this.studioAccesses.length}_${this.companyModal.isEdit}_${[...errorTabs].join(',')}_${contributedKey}`;
    if (this._modalTabsKey === key && this._cachedModalTabs.length > 0) {
      return this._cachedModalTabs;
    }
    this._modalTabsKey = key;
    const errorIndicator = { tone: 'rose' as const, label: 'دارای خطا' };
    const tabs: TabDef[] = [
      { id: 'identity', label: 'مشخصات هویتی و ثبتی', shortLabel: 'هویتی', icon: 'building', indicator: errorTabs.has('identity') ? errorIndicator : undefined },
      { id: 'fiscal_insurance', label: 'سال مالی، بیمه و مودیان', shortLabel: 'بیمه و مالی', icon: 'file-check', indicator: errorTabs.has('fiscal_insurance') ? errorIndicator : undefined },
    ];
    tabs.push({ id: 'documents', label: 'بایگانی مدارک', shortLabel: 'مدارک', icon: 'book', count: this.companyDocuments.length || undefined });
    tabs.push({ id: 'access', label: 'دسترسی کاربران', shortLabel: 'دسترسی', icon: 'shield', count: this.studioAccesses.length || undefined });
    if (this.companyModal.isEdit && this.isAccountingInstalled) {
      tabs.push({ id: 'gdrive', label: 'همگام‌سازی گوگل‌درایو', shortLabel: 'گوگل‌درایو', icon: 'google-drive' });
    }
    // تب‌های مشارکتی ماژول‌ها با شمارنده و نشان خطای context، به ترتیب order میان تب‌های هسته
    const order = (id: string) => CompaniesManagementComponent.CORE_TAB_ORDER[id] ?? contributed.find(t => t.id === id)?.order ?? 0;
    for (const t of contributed) {
      tabs.push({
        id: t.id,
        label: t.labelFa,
        shortLabel: t.shortLabelFa,
        icon: t.icon,
        count: this.studioContext.count(t.id),
        indicator: this.studioContext.hasError(t.id) ? errorIndicator : undefined
      });
    }
    tabs.sort((a, b) => order(a.id) - order(b.id));
    this._cachedModalTabs = tabs;
    return tabs;
  }

  /** تب‌هایی که فیلد خطادار دارند (خطای اعتبارسنجی یا خطای فیلدی سرور) */
  private errorTabs(): Set<string> {
    const tabs = new Set<string>();
    for (const field of Object.keys(this.companyModal.errors || {})) {
      tabs.add(this.tabForField(field));
    }
    return tabs;
  }

  private tabForField(field: string): string {
    if (CompaniesManagementComponent.FISCAL_TAB_FIELDS.includes(field)) return 'fiscal_insurance';
    return 'identity';
  }

  /** نخستین تبی که خطا دارد باز شود تا کاربر خطای تب دیگر را از دست ندهد */
  private openFirstErrorTab(): void {
    const order = this.modalTabs.map(t => t.id);
    const tabs = this.errorTabs();
    if (tabs.size === 0 || tabs.has(this.activeModalTab)) return;
    const first = order.find(id => tabs.has(id));
    if (first) this.setModalTab(first);
  }

  /** دادهٔ هر تب یک بار برای هر شرکت دریافت می‌شود؛ تازه‌سازی با وب‌سوکت یا «تلاش دوباره» است */
  private onTabActivated(tab: string): void {
    if (tab === 'access') {
      this.ensureSystemUsers();
    }
  }

  /** تلاش دوباره برای دریافت دادهٔ تبی که خطا داده است */
  retryTab(tab: string): void {
    const id = this.companyModal.data.id;
    if (!id) return;
    switch (tab) {
      case 'fiscal_insurance': this.loadCompanyFiscalPeriods(id); break;
      case 'documents': this.loadCompanyDocuments(id); break;
      case 'access': this.loadStudioAccesses(id); break;
    }
  }

  setModalTab(tab: string): void {
    if (!this.isTabAvailable(tab)) tab = 'identity';
    this.activeModalTab = tab as typeof this.activeModalTab;
    this.onTabActivated(tab);
    if (this.router && this.route) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
    this.cdr.markForCheck();
  }

  openGoogleDriveModal(company: Company): void {
    this.openEditModal(company, 'gdrive');
  }

  /** دسترسی کاربران فقط در تب «دسترسی» استودیو مدیریت می‌شود (ت۴) */
  openAccessTab(company: Company): void {
    this.openEditModal(company, 'access');
  }

  // انتخاب تاریخ‌های تقویم شمسی جلالی
  onRegDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.companyModal.data.registration_date = val;
    this.regDateControl.setValue(val, { emitEvent: false });
    this.isRegDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onBoardExpiryDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.companyModal.data.board_term_expiry = val;
    this.isBoardDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onDocIssueDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newDoc.issue_date = val;
    this.docIssueDateControl.setValue(val, { emitEvent: false });
    this.isDocIssueDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onDocExpiryDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newDoc.expiry_date = val;
    this.docExpiryDateControl.setValue(val, { emitEvent: false });
    this.isDocExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  private setupRouteNavigation(): void {
    if (!this.route || !this.router) return;

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const idParam = params.get('id');
      const url = this.router?.url || '';
      const isNew = this.route?.snapshot?.routeConfig?.path === 'companies/new' || url.includes('/companies/new');

      if (idParam) {
        const companyId = Number(idParam);
        this.viewMode = 'studio';
        if (!Number.isInteger(companyId) || companyId <= 0) {
          this.toast.error('نشانی شرکت معتبر نیست.');
          this.router?.navigate([CompaniesManagementComponent.LIST_URL], { replaceUrl: true });
          return;
        }
        this.setupStudioForCompany(companyId);
      } else if (isNew) {
        this.viewMode = 'studio';
        this.setupStudioForNew();
      } else {
        this.viewMode = 'list';
        this.companyModal.isOpen = false;
        this.cdr.markForCheck();
      }
    });

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      const tabParam = queryParams.get('tab');
      if (tabParam) {
        if (this.isKnownTab(tabParam) && this.isTabAvailable(tabParam)) {
          this.activeModalTab = tabParam as any;
          this.onTabActivated(tabParam);
        } else {
          // تب ناشناخته یا پیوند مستقیم به تب ماژولی که نصب نیست: بازگشت به تب مشخصات
          this.setModalTab('identity');
        }
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * باز کردن مستقیم /companies/:id: تا رسیدن پاسخ، استودیو در حالت «ویرایش» با اسکلت بارگذاری
   * دیده می‌شود (نه فرم خالی «ثبت شرکت جدید»).
   */
  setupStudioForCompany(companyId: number): void {
    if (this.companyModal.data?.id === companyId && this.companyModal.isOpen && !this.studioLoadError) {
      return;
    }
    this.companyModal = {
      isOpen: true,
      isEdit: true,
      isSubmitting: false,
      data: { ...this.getEmptyCompanyData(), id: companyId },
      errors: {}
    };
    this.studioContext.setCompany(null);
    this.studioSnapshot = null;
    this.studioLoading = true;
    this.studioLoadError = false;
    this.cdr.markForCheck();
    this.api.getById(companyId).subscribe({
      next: (comp) => {
        this.studioLoading = false;
        if (comp) {
          this.populateStudioData(comp);
        } else {
          this.studioLoadError = true;
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.studioLoading = false;
        if (err?.status === 404) {
          this.toast.error('شرکت مورد نظر یافت نشد.');
          this.router?.navigate([CompaniesManagementComponent.LIST_URL], { replaceUrl: true });
        } else {
          this.studioLoadError = true;
        }
        this.cdr.markForCheck();
      }
    });
  }

  retryStudioLoad(): void {
    const id = this.companyModal.data.id;
    if (id) this.setupStudioForCompany(id);
  }

  setupStudioForNew(): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = null;
    this.isLogoCleared = false;
    this.activeModalTab = 'identity';
    this.companyDocuments = [];
    this.filteredDocuments = [];
    this.companyFiscalPeriods = [];
    this.studioAccesses = [];
    this.showFiscalPeriodForm = false;
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.newDoc = this.getEmptyDocData();
    this.regDateControl.setValue('', { emitEvent: false });
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
    this.companyModal = {
      isOpen: true,
      isEdit: false,
      isSubmitting: false,
      data: this.getEmptyCompanyData(),
      errors: {}
    };
    this.isQueuedCreate = false;
    this.isQueuedSave = false;
    this.tabLoadError = {};
    this.studioContext.setCompany(null);
    this.takeStudioSnapshot();
    this.viewMode = 'studio';
    this.cdr.markForCheck();
  }

  /** نشانی لوگوی سرور از serverUrl می‌گذرد تا روی مبدأ دیگر (مثل اپ موبایل) نشکند */
  private logoUrlFor(logo: string | null | undefined): string | null {
    return logo ? resolveServerUrl(logo) : null;
  }

  private buildStudioData(company: Company): typeof this.companyModal.data {
    return {
      id: company.id,
      code: company.code,
      name: company.name,
      company_type: company.company_type || 'private_joint_stock',
      national_id: company.national_id || '',
      economic_code: company.economic_code || '',
      registration_number: company.registration_number || '',
      registration_date: company.registration_date || '',
      registered_capital: company.registered_capital || null,
      shares_count: company.shares_count || null,
      share_nominal_value: company.share_nominal_value || null,
      fiscal_year_start_month: company.fiscal_year_start_month || 1,
      phone: company.phone || '',
      address: company.address || '',
      postal_code: company.postal_code || '',
      ceo_name: company.ceo_name || '',
      board_chairman: company.board_chairman || '',
      board_vice_chairman: company.board_vice_chairman || '',
      main_inspector: company.main_inspector || '',
      alternate_inspector: company.alternate_inspector || '',
      authorized_signers: company.authorized_signers || '',
      board_term_expiry: company.board_term_expiry || '',
      workshop_code: company.workshop_code || '',
      social_security_branch_code: company.social_security_branch_code || '',
      social_security_branch_name: company.social_security_branch_name || '',
      contract_row: company.contract_row || '',
      employer_name: company.employer_name || '',
      tax_memory_id: company.tax_memory_id || '',
      tax_economic_code: company.tax_economic_code || '',
      primary_bank_name: company.primary_bank_name || '',
      primary_account_number: company.primary_account_number || '',
      primary_iban: company.primary_iban || '',
      articles_of_association: company.articles_of_association || null,
      latest_gazette: company.latest_gazette || null,
      is_active: company.is_active,
      has_warehouse_module: company.has_warehouse_module !== false,
      logo: company.logo || null
    };
  }

  /** پس از ذخیرهٔ موفق، فرم با پاسخ سرور هم‌گام می‌شود و فرم‌های فرعی تب‌های دیگر دست نمی‌خورند */
  private applySavedCompany(company: Company, sentDataJson: string): void {
    const serverData = this.buildStudioData(company);
    this.studioContext.setCompany(company);
    if (JSON.stringify(this.companyModal.data) !== sentDataJson) {
      // کاربر در فاصلهٔ ذخیره تایپ کرده است: نوشته‌هایش می‌ماند و فرم تغییرنکرده حساب نمی‌شود
      this.studioSnapshot = JSON.stringify(serverData);
      this.companyModal = { ...this.companyModal, isEdit: true, errors: {} };
    } else {
      this.companyModal = { ...this.companyModal, isEdit: true, data: serverData, errors: {} };
      this.regDateControl.setValue(company.registration_date || '', { emitEvent: false });
      this.takeStudioSnapshot();
    }
    if (!this.selectedLogoFile) {
      this.logoPreviewUrl = this.logoUrlFor(company.logo);
    }
  }

  /** پس از بارگذاری یا حذف لوگو فقط فیلد لوگو تازه می‌شود */
  private applySavedLogo(company: Company): void {
    this.companyModal.data.logo = company.logo || null;
    this.patchStudioSnapshot('logo', company.logo || null);
    if (!this.selectedLogoFile) {
      this.logoPreviewUrl = this.logoUrlFor(company.logo);
    }
  }

  populateStudioData(company: Company): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = this.logoUrlFor(company.logo);
    this.isLogoCleared = false;
    this.isQueuedCreate = false;
    this.isQueuedSave = false;
    this.tabLoadError = {};
    this.newDoc = this.getEmptyDocData();
    this.regDateControl.setValue(company.registration_date || '', { emitEvent: false });
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });

    this.companyModal = {
      isOpen: true,
      isEdit: true,
      isSubmitting: false,
      data: this.buildStudioData(company),
      errors: {}
    };
    this.studioContext.setCompany(company);
    this.takeStudioSnapshot();
    if (this.pendingLogoFromNavigation) {
      // لوگوی ثبت‌نشده تغییر ذخیره‌نشده حساب می‌شود تا بی‌صدا از دست نرود
      this.onLogoFileSelected({ target: { files: [this.pendingLogoFromNavigation] } });
      this.pendingLogoFromNavigation = null;
    }

    // دادهٔ همهٔ تب‌ها یک بار برای هر شرکت دریافت می‌شود (برای شمارندهٔ تب‌ها)؛ کلیک تب دوباره دریافت نمی‌کند
    if (company.id) {
      this.loadCompanyFiscalPeriods(company.id);
      this.loadCompanyDocuments(company.id);
      this.loadStudioAccesses(company.id);
    }

    this.viewMode = 'studio';
    this.cdr.markForCheck();
  }

  openCreateModal(): void {
    if (this.router) {
      this.router.navigate(['/app/operations/companies/new']);
    } else {
      this.setupStudioForNew();
    }
  }

  /** یک ناوبری با تب مقصد؛ استودیو در نمونهٔ مسیر /companies/:id داده را خودش می‌گیرد */
  openEditModal(company: Company, tab: string = 'identity'): void {
    if (this.isPendingRecord(company)) {
      this.toast.warning('این شرکت هنوز به سرور ارسال نشده است؛ پس از اتصال قابل ویرایش است.');
      return;
    }
    if (this.router) {
      this.router.navigate([CompaniesManagementComponent.LIST_URL, company.id], {
        queryParams: { tab }
      });
    } else {
      this.populateStudioData(company);
      this.setModalTab(tab);
    }
  }

  /** بازگشت به فهرست؛ گارد مسیر پیش از خروج دربارهٔ تغییرات ذخیره‌نشده می‌پرسد */
  closeCompanyModal(): void {
    if (this.router) {
      this.router.navigate([CompaniesManagementComponent.LIST_URL]).then((ok) => {
        if (ok) this.resetStudioState();
      });
      return;
    }
    this.resetStudioState();
  }

  private resetStudioState(): void {
    this.companyModal.isOpen = false;
    this.studioContext.setCompany(null);
    this.viewMode = 'list';
    this.studioSnapshot = null;
    this.selectedLogoFile = null;
    this.logoPreviewUrl = null;
    this.companyDocuments = [];
    this.filteredDocuments = [];
    this.companyFiscalPeriods = [];
    this.studioAccesses = [];
    this.showFiscalPeriodForm = false;
    this.isFiscalStartDatePickerOpen = false;
    this.isFiscalEndDatePickerOpen = false;
    this.isRegDatePickerOpen = false;
    this.isBoardDatePickerOpen = false;
    this.isDocIssueDatePickerOpen = false;
    this.isDocExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت دوره‌های مالی رسمی شرکت (CompanyFiscalPeriod)
  // ═════════════════════════════════════════════════════════════════════
  loadCompanyFiscalPeriods(companyId: number): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingFiscalPeriods = true;
    this.tabLoadError['fiscal_insurance'] = false;
    this.facade.getFiscalPeriods(companyId).subscribe({
      next: (res) => {
        this.isLoadingFiscalPeriods = false;
        if (Array.isArray(res)) {
          this.companyFiscalPeriods = res;
        } else if (res && Array.isArray((res as any).results)) {
          this.companyFiscalPeriods = (res as any).results;
        } else {
          this.companyFiscalPeriods = [];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingFiscalPeriods = false;
        this.tabLoadError['fiscal_insurance'] = true;
        this.cdr.markForCheck();
      }
    });
  }

  openCreateFiscalPeriod(): void {
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.fiscalStartControl.setValue('', { emitEvent: false });
    this.fiscalEndControl.setValue('', { emitEvent: false });
    this.showFiscalPeriodForm = true;
    this.cdr.markForCheck();
  }

  cancelCreateFiscalPeriod(): void {
    this.showFiscalPeriodForm = false;
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.fiscalStartControl.setValue('', { emitEvent: false });
    this.fiscalEndControl.setValue('', { emitEvent: false });
    this.cdr.markForCheck();
  }

  onFiscalStartSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newFiscalPeriod.start_date = val;
    this.fiscalStartControl.setValue(val, { emitEvent: false });
    this.isFiscalStartDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onFiscalEndSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newFiscalPeriod.end_date = val;
    this.fiscalEndControl.setValue(val, { emitEvent: false });
    this.isFiscalEndDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  saveFiscalPeriod(): void {
    if (!this.companyModal.data.id) return;
    if (!this.newFiscalPeriod.fiscal_year.trim()) {
      this.toast.warning('لطفاً سال مالی (مثال: ۱۴۰۳) را وارد فرمایید.');
      return;
    }
    if (!this.newFiscalPeriod.title.trim()) {
      this.toast.warning('لطفاً عنوان دوره مالی را وارد فرمایید.');
      return;
    }
    if (!this.newFiscalPeriod.start_date || !this.newFiscalPeriod.end_date) {
      this.toast.warning('لطفاً تاریخ شروع و پایان دوره مالی را تعیین فرمایید.');
      return;
    }
    if (this.newFiscalPeriod.start_date > this.newFiscalPeriod.end_date) {
      this.toast.warning('تاریخ پایان دوره مالی نمی‌تواند قبل از تاریخ آغاز آن باشد.');
      return;
    }

    this.isSavingFiscalPeriod = true;
    const payload: Partial<CompanyFiscalPeriod> = {
      company: this.companyModal.data.id,
      fiscal_year: this.newFiscalPeriod.fiscal_year.trim(),
      title: this.newFiscalPeriod.title.trim(),
      start_date: this.newFiscalPeriod.start_date,
      end_date: this.newFiscalPeriod.end_date,
      notes: this.newFiscalPeriod.notes.trim() || null
    };

    this.facade.createFiscalPeriod(payload).subscribe({
      next: (created) => {
        this.isSavingFiscalPeriod = false;
        this.toast.success(`دوره مالی «${created.title}» با موفقیت تعریف شد.`);
        this.cancelCreateFiscalPeriod();
        this.companyFiscalPeriods = [created, ...this.companyFiscalPeriods.filter(p => p.id !== created.id)];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSavingFiscalPeriod = false;
        const msg = err.error?.detail || err.error?.fiscal_year?.[0] || 'خطا در تعریف دوره مالی جدید';
        this.toast.error(msg);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * بستن، انجماد و بازگشایی دوره‌های مالی کارهای حساس‌اند: فقط برخط (رد سرور در صف دیده نمی‌شود)
   * و با پرسش تأیید که پیامد هر کار را می‌گوید.
   */
  async closeFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('بستن دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'بستن قطعی دورهٔ مالی',
      message: `با بستن «${period.title}»، ثبت و ویرایش سند در این دوره متوقف می‌شود تا وقتی که دوباره بازگشایی شود.`,
      type: 'danger',
      confirmText: 'بستن قطعی'
    });
    if (!ok) return;
    this.facade.closeFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» با موفقیت بسته شد.`);
        period.status = 'closed';
        period.status_display = 'بسته شده رسمی';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در بستن دوره مالی');
      }
    });
  }

  async freezeFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('انجماد دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'انجماد دورهٔ مالی',
      message: `با انجماد «${period.title}»، ثبت سند تازه در این دوره تا بازگشایی متوقف می‌شود.`,
      type: 'warning',
      confirmText: 'انجماد دوره'
    });
    if (!ok) return;
    this.facade.freezeFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» منجمد شد.`);
        period.status = 'frozen';
        period.status_display = 'منجمد شده';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در انجماد دوره مالی');
      }
    });
  }

  async reopenFiscalPeriod(period: CompanyFiscalPeriod): Promise<void> {
    if (!period.id || !this.requireOnline('بازگشایی دورهٔ مالی')) return;
    const ok = await this.confirmAction({
      title: 'بازگشایی دورهٔ مالی',
      message: `با بازگشایی «${period.title}»، ثبت و ویرایش سند در این دوره دوباره ممکن می‌شود.`,
      type: 'warning',
      confirmText: 'بازگشایی دوره'
    });
    if (!ok) return;
    this.facade.reopenFiscalPeriod(period.id).subscribe({
      next: () => {
        this.toast.success(`دوره مالی «${period.title}» مجدداً بازگشایی شد.`);
        period.status = 'open';
        period.status_display = 'جاری و باز';
        this.companyFiscalPeriods = [...this.companyFiscalPeriods];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(err.error?.detail || 'خطا در بازگشایی دوره مالی');
      }
    });
  }

  getFiscalPeriodStatusBadge(status?: string): string {
    switch (status) {
      case 'open':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'frozen':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'closed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  getFiscalPeriodStatusLabel(status?: string): string {
    switch (status) {
      case 'open':
        return 'جاری و باز';
      case 'frozen':
        return 'منجمد شده';
      case 'closed':
        return 'بسته شده رسمی';
      default:
        return status || '—';
    }
  }

  private getEmptyFiscalPeriodData() {
    return {
      fiscal_year: '',
      title: '',
      start_date: '',
      end_date: '',
      notes: ''
    };
  }

  // بارگذاری اسناد آرشیو شرکت
  loadCompanyDocuments(companyId: number): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingDocuments = true;
    this.tabLoadError['documents'] = false;
    this.facade.getDocuments({ company_id: companyId }).subscribe({
      next: (res) => {
        this.isLoadingDocuments = false;
        if (Array.isArray(res)) {
          this.companyDocuments = res;
        } else if (res && Array.isArray((res as any).results)) {
          this.companyDocuments = (res as any).results;
        } else {
          this.companyDocuments = [];
        }
        this.applyDocumentFilters();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingDocuments = false;
        this.tabLoadError['documents'] = true;
        this.cdr.markForCheck();
      }
    });
  }

  // فیلتر زنده مدارک بر اساس جستجو و نوع مدرک
  applyDocumentFilters(): void {
    let docs = [...this.companyDocuments];
    if (this.selectedDocTypeFilter) {
      docs = docs.filter(d => d.document_type === this.selectedDocTypeFilter);
    }
    if (this.docSearchQuery.trim()) {
      const q = this.docSearchQuery.trim().toLowerCase();
      docs = docs.filter(d =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        (d.document_type_display && d.document_type_display.toLowerCase().includes(q))
      );
    }
    this.filteredDocuments = docs;
    this.cdr.markForCheck();
  }

  onDocFilterChange(): void {
    this.applyDocumentFilters();
  }

  clearDocFilter(): void {
    this.docSearchQuery = '';
    this.selectedDocTypeFilter = '';
    this.applyDocumentFilters();
  }

  // پیش‌نمایش درجا (In-Place Preview) در لایت‌باکس مشترک
  openPreview(doc: CompanyDocument): void {
    const url = doc.file_url || doc.file;
    if (!url) {
      this.toast.warning('فایل مدرک در دسترس نیست.');
      return;
    }
    this.docPreview?.open({ title: doc.title, url });
  }

  // پیش‌نمایش مدارک اصلی (اساسنامه و روزنامه رسمی)
  openCoreDocPreview(docKey: 'articles_of_association' | 'latest_gazette', title: string): void {
    const url = this.companyModal.data[docKey];
    if (!url) {
      this.toast.warning(`فایل ${title} هنوز بارگذاری نشده است.`);
      return;
    }
    const dummyDoc: CompanyDocument = {
      id: 0,
      company: this.companyModal.data.id || 0,
      document_type: docKey === 'articles_of_association' ? 'statute' : 'changes_gazette',
      title,
      file: url,
      file_url: url,
      file_size: 0,
      is_confidential: false
    };
    this.openPreview(dummyDoc);
  }

  downloadFile(url?: string | null, filename?: string): void {
    if (url) {
      void saveUrl(url, filename);
    }
  }

  isNationalIdChecksumValid(id?: string | null): boolean {
    if (!id) return true;
    const clean = id.replace(/[^0-9]/g, '');
    if (clean.length !== 11) return false;
    const checkDigit = parseInt(clean[10], 10);
    const tens = parseInt(clean[9], 10) + 2;
    const multipliers = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += (parseInt(clean[i], 10) + tens) * multipliers[i];
    }
    const remainder = sum % 11;
    const calculated = remainder === 10 ? 0 : remainder;
    return calculated === checkDigit;
  }

  // ═════════════════════════════════════════════════════════════════════

  onDocFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.newDoc.file = file;
    }
  }

  uploadNewDocument(): void {
    if (!this.companyModal.data.id) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید.');
      return;
    }
    if (!this.newDoc.file) {
      this.toast.warning('لطفاً فایل مدرک را انتخاب فرمایید.');
      return;
    }
    if (!this.newDoc.title.trim()) {
      this.toast.warning('لطفاً عنوان مدرک را وارد فرمایید.');
      return;
    }
    if (this.newDoc.issue_date && this.newDoc.expiry_date && this.newDoc.issue_date > this.newDoc.expiry_date) {
      this.toast.warning('تاریخ انقضای مدرک نمی‌تواند قبل از تاریخ صدور آن باشد.');
      return;
    }

    this.isUploadingDoc = true;
    const formData = new FormData();
    formData.append('company', String(this.companyModal.data.id));
    formData.append('document_type', this.newDoc.document_type);
    formData.append('title', this.newDoc.title.trim());
    formData.append('file', this.newDoc.file);
    if (this.newDoc.issue_date) formData.append('issue_date', this.newDoc.issue_date);
    if (this.newDoc.expiry_date) formData.append('expiry_date', this.newDoc.expiry_date);
    formData.append('is_confidential', String(this.newDoc.is_confidential));
    if (this.newDoc.description) formData.append('description', this.newDoc.description);

    this.facade.createDocument(formData).subscribe({
      next: (created) => {
        this.isUploadingDoc = false;
        this.toast.success(`مدرک «${created.title}» با موفقیت در آرشیو ثبت شد.`);
        this.newDoc = this.getEmptyDocData();
        this.docIssueDateControl.setValue('', { emitEvent: false });
        this.docExpiryDateControl.setValue('', { emitEvent: false });
        this.companyDocuments = [created, ...this.companyDocuments.filter(d => d.id !== created.id)];
        this.applyDocumentFilters();
        this.reloadListIfVisible();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isUploadingDoc = false;
        const msg = err.error?.detail || err.error?.file?.[0] || 'خطا در بارگذاری مدرک';
        this.toast.error(msg);
        this.cdr.markForCheck();
      }
    });
  }

  async deleteCompanyDocument(doc: CompanyDocument): Promise<void> {
    const ok = await this.askConfirm(
      'حذف مدرک رسمی',
      `آیا از حذف مدرک «${doc.title}» اطمینان دارید؟`
    );
    if (!ok) return;
    this.facade.deleteDocument(doc.id).subscribe({
      next: () => {
        this.toast.success('مدرک با موفقیت حذف شد.');
        this.companyDocuments = this.companyDocuments.filter(d => d.id !== doc.id);
        this.applyDocumentFilters();
        this.reloadListIfVisible();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف مدرک')
    });
  }

  onCoreDocSelected(event: any, docType: 'articles_of_association' | 'latest_gazette'): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    // پاک کردن input تا انتخاب دوبارهٔ همان فایل هم رویداد بدهد
    if (input) input.value = '';
    if (!file || !this.companyModal.data.id || this.uploadingCoreDoc[docType]) return;
    if (file.size > CompaniesManagementComponent.CORE_DOC_MAX_BYTES) {
      this.toast.error('حجم فایل نباید بیش از ۲۰ مگابایت باشد.');
      return;
    }

    const title = docType === 'articles_of_association' ? 'اساسنامه' : 'روزنامه رسمی';
    this.uploadingCoreDoc = { ...this.uploadingCoreDoc, [docType]: true };
    this.cdr.markForCheck();
    this.api.uploadCoreDoc(this.companyModal.data.id, docType, file).subscribe({
      next: (res) => {
        this.uploadingCoreDoc = { ...this.uploadingCoreDoc, [docType]: false };
        this.toast.success(`فایل ${title} با موفقیت بارگذاری شد.`);
        const value = docType === 'articles_of_association' ? res.articles_of_association : res.latest_gazette;
        this.companyModal.data[docType] = value;
        this.patchStudioSnapshot(docType, value);
        this.reloadListIfVisible();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.uploadingCoreDoc = { ...this.uploadingCoreDoc, [docType]: false };
        this.toast.error(err?.error?.detail || `خطا در بارگذاری فایل ${title}`);
        this.cdr.markForCheck();
      }
    });
  }

  formatBytes(bytes?: number): string {
    if (!bytes || bytes === 0) return '—';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getDocStatusClass(status?: string): string {
    switch (status) {
      case 'valid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'expiring_soon': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'expired': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  getDocStatusLabel(status?: string): string {
    switch (status) {
      case 'valid': return 'معتبر';
      case 'expiring_soon': return 'نزدیک انقضا';
      case 'expired': return 'منقضی شده';
      default: return 'بدون سررسید';
    }
  }

  /** فیلدهای شناسه‌ای: رقم فارسی و عربی هنگام تایپ لاتین می‌شود (ت۷) */
  onDigitsInput(field: 'national_id' | 'economic_code' | 'registration_number' | 'phone' | 'postal_code' | 'workshop_code' | 'tax_economic_code' | 'social_security_branch_code' | 'contract_row', value: string): void {
    this.companyModal.data[field] = normalizeDigits(value ?? '');
    this.clearFieldError(field);
  }

  onTaxMemoryIdInput(value: string): void {
    this.companyModal.data.tax_memory_id = normalizeDigits(value ?? '').toUpperCase();
    this.clearFieldError('tax_memory_id');
  }

  private clearFieldError(field: string): void {
    if (!this.companyModal.errors[field]) return;
    const errors = { ...this.companyModal.errors };
    delete errors[field];
    this.companyModal = { ...this.companyModal, errors };
  }

  validateCompanyForm(): boolean {
    const errors: { [key: string]: string } = {};
    const d = this.companyModal.data;
    const val = (v: string | null | undefined) => normalizeDigits(v || '');

    if (!d.code || !d.code.trim()) {
      errors['code'] = 'کد یکتای شرکت الزامی است.';
    }
    if (!d.name || !d.name.trim()) {
      errors['name'] = 'نام کامل شرکت الزامی است.';
    }
    const nid = val(d.national_id);
    if (nid) {
      if (!/^\d+$/.test(nid)) {
        errors['national_id'] = 'شناسه ملی باید فقط شامل ارقام عددی باشد.';
      } else if (nid.length !== 11) {
        errors['national_id'] = 'شناسه ملی اشخاص حقوقی باید دقیقاً ۱۱ رقم باشد.';
      } else if (!this.isNationalIdChecksumValid(nid)) {
        errors['national_id'] = 'شناسه ملی واردشده با الگوریتم کنترلی ثبت شرکت‌ها همخوانی ندارد.';
      }
    }
    const exactDigits: [keyof typeof d, number, string][] = [
      ['economic_code', 12, 'کد اقتصادی قدیم باید ۱۲ رقم باشد.'],
      ['postal_code', 10, 'کد پستی باید ۱۰ رقم باشد.'],
      ['workshop_code', 10, 'کد کارگاه بیمه باید ۱۰ رقم باشد.'],
      ['tax_economic_code', 16, 'کد اقتصادی جدید باید ۱۶ رقم باشد.'],
    ];
    for (const [field, len, msg] of exactDigits) {
      const v = val(d[field] as string);
      if (v && !new RegExp(`^\\d{${len}}$`).test(v)) errors[field as string] = msg;
    }
    for (const field of ['social_security_branch_code', 'contract_row', 'registration_number'] as const) {
      const v = val(d[field]);
      if (v && !/^\d+$/.test(v)) errors[field] = 'فقط رقم وارد کنید.';
    }
    const memoryId = val(d.tax_memory_id);
    if (memoryId && !/^[A-Za-z0-9]{6}$/.test(memoryId)) {
      errors['tax_memory_id'] = 'شناسهٔ حافظهٔ مالیاتی باید ۶ حرف یا رقم لاتین باشد.';
    }
    const phone = val(d.phone);
    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '');
      if (!/^[\d\s()+\-]+$/.test(phone) || phoneDigits.length < 8 || phoneDigits.length > 13) {
        errors['phone'] = 'شمارهٔ تلفن معتبر نیست (۸ تا ۱۳ رقم).';
      }
    }

    this.companyModal = {
      ...this.companyModal,
      errors
    };
    this.openFirstErrorTab();
    this.cdr.markForCheck();
    return Object.keys(errors).length === 0;
  }

  /** خطاهای فیلدی DRF به خطای همان فیلد نگاشت می‌شوند و تب نخستین خطا باز می‌شود */
  private applyServerErrors(err: any, fallback: string): void {
    const body = err?.error;
    const errors: { [key: string]: string } = {};
    const otherMessages: string[] = [];
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body)) {
        if (key === 'detail' || key === 'non_field_errors') continue;
        const msg = Array.isArray(value) ? value[0] : value;
        if (typeof msg !== 'string' || !msg) continue;
        if (CompaniesManagementComponent.FIELD_ERROR_KEYS.includes(key)) {
          errors[key] = msg;
        } else {
          // فیلدی که جای پیام ندارد: پیام خودش در toast می‌آید
          otherMessages.push(msg);
        }
      }
    }
    this.companyModal = { ...this.companyModal, errors };
    this.openFirstErrorTab();
    const detail = body?.detail || body?.non_field_errors?.[0] || otherMessages[0];
    const fieldCount = Object.keys(errors).length;
    this.toast.error(detail || (fieldCount ? 'برخی فیلدها خطا دارند؛ موارد مشخص‌شده را اصلاح کنید.' : fallback));
    this.cdr.markForCheck();
  }

  /** تغییر لوگو پس از ذخیرهٔ موفق فرم؛ نتیجه: آیا لوگو روی سرور عوض شد */
  private finishLogoChange(companyId: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.selectedLogoFile) {
        this.api.uploadLogo(companyId, this.selectedLogoFile).subscribe({
          next: () => {
            this.selectedLogoFile = null;
            resolve(true);
          },
          error: (err) => {
            this.toast.warning(err.error?.detail || err.error?.logo?.[0] || 'خطا در بارگذاری لوگوی شرکت');
            resolve(false);
          }
        });
      } else if (this.isLogoCleared) {
        this.api.deleteLogo(companyId).subscribe({
          next: () => {
            this.isLogoCleared = false;
            resolve(true);
          },
          error: () => {
            this.toast.warning('خطا در حذف لوگوی شرکت');
            resolve(false);
          }
        });
      } else {
        resolve(false);
      }
    });
  }

  submitCompanyForm(): void {
    if (this.companyModal.isSubmitting || this.studioLoading || this.isQueuedCreate) {
      return;
    }
    if (!this.validateCompanyForm()) {
      return;
    }

    this.companyModal.isSubmitting = true;
    const d = this.companyModal.data;
    const sentDataJson = JSON.stringify(d);
    const text = (v: string | null | undefined) => normalizeDigits(v || '') || null;
    const payload = {
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      company_type: d.company_type || 'private_joint_stock',
      national_id: text(d.national_id),
      economic_code: text(d.economic_code),
      registration_number: text(d.registration_number),
      registration_date: d.registration_date || null,
      registered_capital: d.registered_capital || null,
      shares_count: d.shares_count || null,
      share_nominal_value: d.share_nominal_value || null,
      fiscal_year_start_month: Number(d.fiscal_year_start_month) || 1,
      phone: text(d.phone),
      address: d.address?.trim() || null,
      postal_code: text(d.postal_code),
      ceo_name: d.ceo_name?.trim() || null,
      board_chairman: d.board_chairman?.trim() || null,
      board_vice_chairman: d.board_vice_chairman?.trim() || null,
      main_inspector: d.main_inspector?.trim() || null,
      alternate_inspector: d.alternate_inspector?.trim() || null,
      authorized_signers: d.authorized_signers?.trim() || null,
      board_term_expiry: d.board_term_expiry || null,
      workshop_code: text(d.workshop_code),
      social_security_branch_code: text(d.social_security_branch_code),
      social_security_branch_name: d.social_security_branch_name?.trim() || null,
      contract_row: text(d.contract_row),
      employer_name: d.employer_name?.trim() || null,
      tax_memory_id: text(d.tax_memory_id),
      tax_economic_code: text(d.tax_economic_code),
      primary_bank_name: d.primary_bank_name?.trim() || null,
      primary_account_number: d.primary_account_number?.trim() || null,
      primary_iban: d.primary_iban?.trim() || null,
      is_active: d.is_active,
      has_warehouse_module: d.has_warehouse_module
    };

    if (this.companyModal.isEdit && this.companyModal.data.id) {
      const companyId = this.companyModal.data.id;
      this.api.update(companyId, payload).subscribe({
        next: (updated: any) => {
          this.companyModal.isSubmitting = false;
          if (this.isPendingRecord(updated)) {
            // پاسخ خوش‌بینانهٔ صف آفلاین شناسهٔ موقت دارد؛ داده‌های فرم همان چیزی است که در صف رفت
            this.isQueuedSave = true;
            this.takeStudioSnapshot();
            this.toast.info(`ویرایش «${payload.name}» در صف ارسال است و پس از اتصال ثبت می‌شود.`);
            if (this.selectedLogoFile || this.isLogoCleared) {
              this.toast.warning('تغییر لوگو فقط در حالت برخط ذخیره می‌شود؛ پس از اتصال دوباره ذخیره کنید.');
            }
            this.cdr.markForCheck();
            return;
          }
          this.isQueuedSave = false;
          this.toast.success(`اطلاعات شرکت «${updated.name}» با موفقیت ویرایش شد.`);
          this.applySavedCompany(updated, sentDataJson);
          this.activeCompanyService.loadAvailableCompanies().subscribe();
          this.finishLogoChange(companyId).then((changed) => {
            if (!changed) return;
            this.api.getById(companyId).subscribe({
              next: (fresh) => {
                if (fresh) this.applySavedLogo(fresh);
                this.cdr.markForCheck();
              },
              error: () => {}
            });
          });
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.companyModal.isSubmitting = false;
          this.applyServerErrors(err, 'خطا در ثبت ویرایش شرکت');
        }
      });
    } else {
      this.api.create(payload).subscribe({
        next: (created: any) => {
          this.companyModal.isSubmitting = false;
          if (this.isPendingRecord(created) || !created?.id) {
            // شناسهٔ موقت منفی است؛ رفتن به /companies/-N به getById ناموفق می‌رسد (E1)
            this.isQueuedCreate = true;
            this.takeStudioSnapshot();
            this.toast.info(`شرکت «${payload.name}» در صف ارسال است و پس از اتصال ثبت می‌شود.`);
            if (this.selectedLogoFile) {
              this.toast.warning('لوگو پس از ثبت شرکت در سرور باید از استودیوی همان شرکت بارگذاری شود.');
            }
            this.cdr.markForCheck();
            return;
          }
          // شرکت ثبت شد؛ تا رفتن به نشانی شرکت تازه دکمهٔ ثبت قفل می‌ماند تا POST تکراری نرود
          this.companyModal.isSubmitting = true;
          this.toast.success(`شرکت «${created.name}» با موفقیت ثبت شد.`);
          this.activeCompanyService.loadAvailableCompanies().subscribe();
          const logoFile = this.selectedLogoFile;
          this.finishLogoChange(created.id).then((logoSaved) => {
            // اگر لوگو نرسید، فایل با state ناوبری به نمونهٔ استودیوی شرکت تازه برده می‌شود تا دوباره ذخیره شود
            const pendingLogo = logoFile && !logoSaved ? logoFile : null;
            if (pendingLogo) {
              this.toast.warning('لوگو بارگذاری نشد؛ فایل نگه داشته شد، دوباره «ذخیره» را بزنید.');
            }
            this.leavingAfterSave = true;
            if (this.router) {
              this.router.navigate([CompaniesManagementComponent.LIST_URL, created.id], {
                queryParams: { tab: 'identity' },
                replaceUrl: true,
                state: pendingLogo ? { pendingLogo } : undefined
              }).finally(() => {
                this.leavingAfterSave = false;
                this.companyModal.isSubmitting = false;
              });
            } else {
              this.leavingAfterSave = false;
              this.companyModal.isSubmitting = false;
              this.populateStudioData(created);
            }
          });
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.companyModal.isSubmitting = false;
          this.applyServerErrors(err, 'خطا در ایجاد شرکت جدید');
        }
      });
    }
  }

  confirmDelete(company: Company): void {
    if (this.isPendingRecord(company)) {
      this.toast.warning('این شرکت هنوز به سرور ارسال نشده است.');
      return;
    }
    // حذف آبشاری است و پیش از آن باید اثر حذف دیده شود؛ در صف آفلاین نمی‌رود
    if (!this.requireOnline('حذف شرکت')) return;
    if (company.projects_count && company.projects_count > 0) {
      this.toast.error(`این شرکت دارای ${company.projects_count} پروژه فعال است و امکان حذف آن وجود ندارد.`);
      return;
    }
    this.deleteModal = {
      isOpen: true,
      target: company,
      isDeleting: false
    };
  }

  closeDeleteModal(): void {
    this.deleteModal.isOpen = false;
    this.deleteModal.target = null;
  }

  executeDelete(): void {
    if (!this.deleteModal.target) return;
    this.deleteModal.isDeleting = true;
    this.api.delete(this.deleteModal.target.id).subscribe({
      next: () => {
        this.deleteModal.isDeleting = false;
        this.toast.success(`شرکت «${this.deleteModal.target!.name}» با موفقیت حذف شد.`);
        this.closeDeleteModal();
        this.loadCompanies();
        this.activeCompanyService.loadAvailableCompanies().subscribe();
      },
      error: (err) => {
        this.deleteModal.isDeleting = false;
        const msg = err.error?.detail || 'خطا در حذف شرکت';
        this.toast.error(msg);
      }
    });
  }

  exportExcel(): void {
    this.api.exportExcel().subscribe({
      next: (blob) => {
        void saveBlob(blob, `companies_${new Date().getTime()}.xlsx`);
        this.toast.success('فایل اکسل با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت خروجی اکسل شرکت‌ها');
      }
    });
  }

  filterSystemUsers(): User[] {
    if (!this.userSearchQuery.trim()) {
      return this.systemUsers;
    }
    const q = this.userSearchQuery.trim().toLowerCase();
    return this.systemUsers.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.last_name && u.last_name.toLowerCase().includes(q))
    );
  }

  getAccessLevelBadgeClass(level?: CompanyAccessLevel): string {
    switch (level) {
      case 'workspace_full':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'docs_write':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'docs_read':
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  }

  getAccessLevelLabel(level?: CompanyAccessLevel): string {
    switch (level) {
      case 'workspace_full':
        return 'عضویت فضای کاری و ماژول‌ها';
      case 'docs_write':
        return 'مشاهده و بارگذاری اسناد';
      case 'docs_read':
      default:
        return 'فقط مشاهده اسناد رسمی';
    }
  }

  /** فهرست کاربران سامانه فقط وقتی تب «دسترسی» باز می‌شود، یک بار دریافت می‌شود */
  private ensureSystemUsers(): void {
    if (this.systemUsersRequested || !this.accountsHttp) return;
    this.systemUsersRequested = true;
    this.accountsHttp.getUsers().subscribe({
      next: (users) => {
        this.systemUsers = users;
        this.cdr.markForCheck();
      },
      error: () => {
        this.systemUsersRequested = false;
      }
    });
  }

  loadStudioAccesses(companyId: number): void {
    this.isLoadingStudioAccesses = true;
    this.tabLoadError['access'] = false;
    this.api.getUserAccesses({ company_id: companyId }).subscribe({
      next: (res) => {
        this.isLoadingStudioAccesses = false;
        this.studioAccesses = res || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingStudioAccesses = false;
        this.tabLoadError['access'] = true;
        this.cdr.markForCheck();
      }
    });
  }

  addStudioAccess(): void {
    if (!this.companyModal.data.id || !this.studioSelectedUserId) {
      this.toast.warning('لطفاً کاربر مورد نظر را انتخاب فرمایید.');
      return;
    }
    const companyId = this.companyModal.data.id;
    const targetUserId = this.studioSelectedUserId;
    this.api.createUserAccess({
      user: this.studioSelectedUserId,
      company: companyId,
      access_level: this.studioAccessLevel,
      role_in_company: this.studioRoleInCompany.trim() || null,
      is_default: this.studioIsDefaultAccess
    }).subscribe({
      next: (created) => {
        if (this.isPendingRecord(created)) {
          this.toast.info('دسترسی کاربر در صف ارسال است و پس از اتصال ثبت می‌شود.');
        } else {
          this.toast.success('دسترسی کاربر با موفقیت ثبت شد.');
        }
        this.studioSelectedUserId = null;
        this.studioRoleInCompany = '';
        this.studioAccessLevel = 'docs_read';
        this.studioIsDefaultAccess = false;
        const userObj = this.systemUsers.find(u => u.id === (created.user || targetUserId));
        const fullAccess: UserCompanyAccess = {
          ...created,
          username: created.username || userObj?.username || '',
          user_full_name: created.user_full_name || (userObj ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() : '')
        };
        this.studioAccesses = [fullAccess, ...this.studioAccesses.filter(a => a.id !== created.id)];
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ثبت دسترسی کاربر به شرکت';
        this.toast.error(msg);
      }
    });
  }

  async removeStudioAccess(accessId?: number): Promise<void> {
    if (!accessId) return;
    if (accessId < 0) {
      // ردیف آفلاین هنوز شناسهٔ سرور ندارد؛ حذف آن در صف به ۴۰۴ می‌رسد (E2)
      this.toast.warning('این دسترسی هنوز به سرور ارسال نشده است؛ پس از ارسال قابل لغو است.');
      return;
    }
    const ok = await this.askConfirm(
      'لغو دسترسی کاربر',
      'آیا از لغو دسترسی این کاربر اطمینان دارید؟'
    );
    if (!ok) return;
    this.api.deleteUserAccess(accessId).subscribe({
      next: (res: any) => {
        if (res?._offlinePending) {
          this.toast.info('لغو دسترسی در صف ارسال است و پس از اتصال اعمال می‌شود.');
        } else {
          this.toast.success('دسترسی کاربر با موفقیت لغو شد.');
        }
        this.studioAccesses = this.studioAccesses.filter(a => a.id !== accessId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('خطا در لغو دسترسی کاربر');
      }
    });
  }

  private getEmptyCompanyData() {
    return {
      code: '',
      name: '',
      company_type: 'private_joint_stock',
      national_id: '',
      economic_code: '',
      registration_number: '',
      registration_date: '',
      registered_capital: null,
      shares_count: null,
      share_nominal_value: null,
      fiscal_year_start_month: 1,
      phone: '',
      address: '',
      postal_code: '',
      ceo_name: '',
      board_chairman: '',
      board_vice_chairman: '',
      main_inspector: '',
      alternate_inspector: '',
      authorized_signers: '',
      board_term_expiry: '',
      workshop_code: '',
      social_security_branch_code: '',
      social_security_branch_name: '',
      contract_row: '',
      employer_name: '',
      tax_memory_id: '',
      tax_economic_code: '',
      primary_bank_name: '',
      primary_account_number: '',
      primary_iban: '',
      articles_of_association: null,
      latest_gazette: null,
      is_active: true,
      has_warehouse_module: true
    };
  }

  private getEmptyDocData(): {
    document_type: CompanyDocumentType;
    title: string;
    file: File | null;
    issue_date: string;
    expiry_date: string;
    is_confidential: boolean;
    description: string;
  } {
    return {
      document_type: 'statute',
      title: '',
      file: null,
      issue_date: '',
      expiry_date: '',
      is_confidential: false,
      description: ''
    };
  }
}
