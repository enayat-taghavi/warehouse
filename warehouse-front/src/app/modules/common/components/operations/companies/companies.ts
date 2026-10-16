import { CompaniesFacade } from './companies.facade';
import {
  COMPANY_DOCUMENT_TYPES_LIST,
  getFiscalPeriodStatusBadge,
  getFiscalPeriodStatusLabel,
  getEmptyFiscalPeriodData,
  getEmptyBankAccountData,
  getEmptyBoardMemberData,
  getEmptyDocData,
  getDocStatusClass,
  getDocStatusLabel,
  filterCompanyDocuments,
  filterIranianBanksList,
  isNationalIdChecksumValid,
  validateNationalCode,
  buildCompanyPayload
} from './companies.helpers';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { AccountsHttpService, User } from '../../../../../core/http/accounts-http.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import {
  Company,
  CompanyDocument,
  CompanyDocumentType,
  CompanyBankAccount,
  CompanyBoardMember,
  CompanyBoardMemberRole,
  CompanyBoardMemberType,
  CompanyFiscalPeriod,
  UserCompanyAccess,
  CompanyAccessLevel
} from '../../../../../core/models/company.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  cleanShebaInput,
  extractShebaDigits,
  generateShebaFromAccount,
  getBankByName,
  validateAccountNumber
} from '../../../../../core/utils/sheba-utils';
import { normalizeDigits } from '../../../../../core/utils/date-utils';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { CompanyGdriveTabComponent } from './company-gdrive-tab/company-gdrive-tab';

@Component({
  selector: 'app-companies-management',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective, ActionButtonComponent, TabBarComponent, CompanyGdriveTabComponent],
  providers: [CompaniesFacade],
  templateUrl: './companies.html',
  styleUrls: ['./companies.css']
})
export class CompaniesManagementComponent implements OnInit, OnDestroy {
  private facade = inject(CompaniesFacade);
  /** تب‌هایی که داده‌شان در حسابداری است (بانک، هیئت‌مدیره، گوگل‌درایو). در تب مدارک فقط بایگانی حسابداری پنهان می‌شود. */
  private static readonly ACCOUNTING_TABS = ['treasury', 'governance', 'gdrive'];

  private api = inject(CompanyApiService);
  private companyApi = this.api;
  private http = inject(HttpClient);
  public activeCompanyService = inject(ActiveCompanyService);
  private accountsHttp = inject(AccountsHttpService, { optional: true });
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private ws = inject(WebSocketService, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });
  private moduleRegistry = inject(ModuleRegistryService);
  private offlineSync = OfflineSyncService.getInstance();
  private network = NetworkStatusService.getInstance();
  private destroy$ = new Subject<void>();
  private pdfTimeoutId: any = null;

  // حالت نمای جاری: 'list' (فهرست شرکت‌ها) یا 'studio' (استودیوی تمام‌صفحه)
  public viewMode: 'list' | 'studio' = 'list';

  public isOnline = this.network.isOnline;

  companies: Company[] = [];
  filteredCompanies: Company[] = [];
  systemUsers: User[] = [];
  isLoading = false;

  // فیلتر جستجوی زنده درجا
  searchQuery = '';
  private searchSubject = new Subject<string>();

  // مدیریت آپلود و حذف لوگو
  selectedLogoFile: File | null = null;
  logoPreviewUrl: string | null = null;
  isLogoCleared = false;

  // تب فعال در استودیوی مودال به ترتیب استاندارد حقوقی و مالی
  activeModalTab: 'identity' | 'fiscal_insurance' | 'treasury' | 'governance' | 'documents' | 'access' | 'gdrive' = 'identity';

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
  boardTermStartControl = new FormControl('');
  boardTermExpiryControl = new FormControl('');
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

  // کنترل‌های پیش‌رفته لایت‌باکس پیش‌نمایش درجا (زوم، پن، جابجایی، تمام‌صفحه و رندر اختصاصی بوم بدون فعال‌سازی IDM)
  isLoadingPreview = false;
  previewScale = 1.0;
  previewRotation = 0;
  isFullscreenPreview = false;
  isPdfLoading = false;
  pdfCurrentPage = 1;
  pdfTotalPages = 1;
  pdfDoc: any = null;
  pdfRenderTask: any = null;
  panX = 0;
  panY = 0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  useIframeFallback = false;

  previewBlobUrl: string | null = null;
  previewModal: {
    isOpen: boolean;
    title: string;
    fileUrl: string;
    safeFileUrl: SafeResourceUrl | null;
    isPdf: boolean;
    isImage: boolean;
  } = {
    isOpen: false,
    title: '',
    fileUrl: '',
    safeFileUrl: null,
    isPdf: false,
    isImage: false
  };

  newDoc: {
    document_type: CompanyDocumentType;
    title: string;
    file: File | null;
    issue_date: string;
    expiry_date: string;
    is_confidential: boolean;
    description: string;
  } = this.getEmptyDocData();

  // مدیریت چند حسابی و شماره‌های شبای شرکت
  companyBankAccounts: CompanyBankAccount[] = [];
  isLoadingBankAccounts = false;
  isSavingBankAccount = false;
  isEditingAccount = false;
  editingAccountId: number | null = null;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';
  isShebaCopied = false;
  isAccountCopied = false;
  copiedShebaId: number | string | null = null;
  copiedSheba: string | null = null;
  iranianBanksList: IranianBankInfo[] = IRANIAN_BANKS;
  bankSearchQuery = '';
  isBankDropdownOpen = false;

  newAccount = this.getEmptyBankAccountData();

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

  // مدیریت اعضای هیئت‌مدیره، مدیرعامل و صاحبان امضا (تب سوم استودیو)
  companyBoardMembers: CompanyBoardMember[] = [];
  isLoadingBoardMembers = false;
  isSavingBoardMember = false;
  isEditingBoardMember = false;
  editingBoardMemberId: number | null = null;
  showBoardMemberForm = false;
  isBoardTermStartDatePickerOpen = false;
  isBoardTermExpiryDatePickerOpen = false;
  selectedIdDocFile: File | null = null;
  selectedAppointmentDocFile: File | null = null;

  readonly boardRolesList: { value: CompanyBoardMemberRole; label: string; badgeClass: string }[] = [
    { value: 'chairman', label: 'رئیس هیئت‌مدیره', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'vice_chairman', label: 'نایب‌رئیس هیئت‌مدیره', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'managing_director', label: 'مدیرعامل', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'managing_director_and_member', label: 'عضو هیئت‌مدیره و مدیرعامل', badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
    { value: 'board_member', label: 'عضو هیئت‌مدیره', badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' },
    { value: 'main_inspector', label: 'بازرس اصلی', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'alternate_inspector', label: 'بازرس علی‌البدل', badgeClass: 'bg-amber-50/60 text-amber-600 border-amber-100' },
    { value: 'secretary', label: 'دبیر هیئت‌مدیره', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
    { value: 'other', label: 'سایر ارکان قانونی', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  ];

  newBoardMember = this.getEmptyBoardMemberData();

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

  // وضعیت مدال مدیریت دسترسی کاربران (UserCompanyAccess)
  userAccessModal: {
    isOpen: boolean;
    company: Company | null;
    accesses: UserCompanyAccess[];
    isLoading: boolean;
    selectedUserId: number | null;
    accessLevel: CompanyAccessLevel;
    roleInCompany: string;
    isDefault: boolean;
    isSubmitting: boolean;
  } = {
    isOpen: false,
    company: null,
    accesses: [],
    isLoading: false,
    selectedUserId: null,
    accessLevel: 'docs_read',
    roleInCompany: '',
    isDefault: false,
    isSubmitting: false
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
    this.network.state$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOnline = this.network.isOnline;
      this.cdr.markForCheck();
    });
    this.setupDateControls();
    this.setupSearch();
    this.loadCompanies();
    this.loadSystemUsers();
    this.setupRouteNavigation();
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
            this.loadCompanies();
          } else if (msg.entity_type === 'company_bank_account') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadCompanyBankAccounts(currentCompanyId);
            }
            this.loadCompanies();
          } else if (msg.entity_type === 'company_board_member') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadCompanyBoardMembers(currentCompanyId);
            }
            this.loadCompanies();
          } else if (msg.entity_type === 'company_document') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadCompanyDocuments(currentCompanyId);
            }
            this.loadCompanies();
          } else if (msg.entity_type === 'company_access') {
            if (this.companyModal.isOpen && currentCompanyId && (!targetCompanyId || targetCompanyId === currentCompanyId)) {
              this.loadStudioAccesses(currentCompanyId);
            }
            if (this.userAccessModal.isOpen && this.userAccessModal.company?.id && (!targetCompanyId || targetCompanyId === this.userAccessModal.company.id)) {
              this.loadUserAccesses(this.userAccessModal.company.id);
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
      } else if (this.companyApi.matchesCompanyUrl(url, 'bankAccounts')) {
        if (this.companyModal.isOpen && currentCompanyId && url.includes(`company_id=${currentCompanyId}`)) {
          if (Array.isArray(data)) {
            this.companyBankAccounts = data;
          } else if (data && Array.isArray((data as any).results)) {
            this.companyBankAccounts = (data as any).results;
          }
          this.cdr.markForCheck();
        }
      } else if (this.companyApi.matchesCompanyUrl(url, 'boardMembers')) {
        if (this.companyModal.isOpen && currentCompanyId && url.includes(`company_id=${currentCompanyId}`)) {
          if (Array.isArray(data)) {
            this.companyBoardMembers = data;
          } else if (data && Array.isArray((data as any).results)) {
            this.companyBoardMembers = (data as any).results;
          }
          this.cdr.markForCheck();
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
        if (this.userAccessModal.isOpen && this.userAccessModal.company?.id && url.includes(`company_id=${this.userAccessModal.company.id}`)) {
          if (Array.isArray(data)) {
            this.userAccessModal.accesses = data;
          } else if (data && Array.isArray((data as any).results)) {
            this.userAccessModal.accesses = (data as any).results;
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
    this.boardTermStartControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newBoardMember.term_start = val || '';
    });
    this.boardTermExpiryControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newBoardMember.term_expiry = val || '';
    });
    this.fiscalStartControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.start_date = val || '';
    });
    this.fiscalEndControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newFiscalPeriod.end_date = val || '';
    });
  }

  ngOnDestroy(): void {
    if (this.pdfTimeoutId) {
      clearTimeout(this.pdfTimeoutId);
      this.pdfTimeoutId = null;
    }
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isBankDropdownOpen && !target.closest('.bank-combobox-container')) {
      this.isBankDropdownOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('window:keydown.escape')
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.previewModal.isOpen) {
      this.closePreview();
    }
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
        if (this.network.isOnline && err?.status !== 503) {
          this.toast.error('خطا در دریافت فهرست شرکت‌ها');
        }
        this.cdr.markForCheck();
      }
    });
  }

  applyFilter(): void {
    if (!this.searchQuery.trim()) {
      this.filteredCompanies = [...this.companies];
      this.cdr.markForCheck();
      return;
    }
    const rawQ = this.searchQuery.trim().toLowerCase();
    const normQ = normalizeDigits(rawQ).toLowerCase();
    this.filteredCompanies = this.companies.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      const nationalId = (c.national_id || '');
      const economicCode = (c.economic_code || '');
      const ceoName = (c.ceo_name || '').toLowerCase();
      const workshopCode = (c.workshop_code || '');

      return (
        name.includes(rawQ) ||
        name.includes(normQ) ||
        code.includes(rawQ) ||
        code.includes(normQ) ||
        nationalId.includes(rawQ) ||
        nationalId.includes(normQ) ||
        economicCode.includes(rawQ) ||
        economicCode.includes(normQ) ||
        ceoName.includes(rawQ) ||
        ceoName.includes(normQ) ||
        workshopCode.includes(rawQ) ||
        workshopCode.includes(normQ)
      );
    });
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

  private isTabAvailable(tab: string): boolean {
    return this.isAccountingInstalled || !CompaniesManagementComponent.ACCOUNTING_TABS.includes(tab);
  }

  private _cachedModalTabs: TabDef[] = [];
  private _modalTabsKey = '';

  get modalTabs(): TabDef[] {
    const key = `${this.isAccountingInstalled}_${this.companyBankAccounts.length}_${this.companyBoardMembers.length}_${this.companyDocuments.length}_${this.studioAccesses.length}_${this.companyModal.isEdit}`;
    if (this._modalTabsKey === key && this._cachedModalTabs.length > 0) {
      return this._cachedModalTabs;
    }
    this._modalTabsKey = key;
    const tabs: TabDef[] = [
      { id: 'identity', label: 'مشخصات هویتی و ثبتی', shortLabel: 'هویتی', icon: 'building' },
      { id: 'fiscal_insurance', label: 'سال مالی، بیمه و مودیان', shortLabel: 'بیمه و مالی', icon: 'file-check' },
    ];
    if (this.isAccountingInstalled) {
      tabs.push({ id: 'treasury', label: 'بانک و شبا', shortLabel: 'بانک', icon: 'database', count: this.companyBankAccounts.length || undefined });
      tabs.push({ id: 'governance', label: 'هیئت‌مدیره و امضا', shortLabel: 'هیئت‌مدیره', icon: 'users', count: this.companyBoardMembers.length || undefined });
    }
    tabs.push({ id: 'documents', label: 'بایگانی مدارک', shortLabel: 'مدارک', icon: 'book', count: this.companyDocuments.length || undefined });
    tabs.push({ id: 'access', label: 'دسترسی کاربران', shortLabel: 'دسترسی', icon: 'shield', count: this.studioAccesses.length || undefined });
    if (this.companyModal.isEdit && this.isAccountingInstalled) {
      tabs.push({ id: 'gdrive', label: 'همگام‌سازی گوگل‌درایو', shortLabel: 'گوگل‌درایو', icon: 'google-drive' });
    }
    this._cachedModalTabs = tabs;
    return tabs;
  }

  setModalTab(tab: string): void {
    if (!this.isTabAvailable(tab)) tab = 'identity';
    this.activeModalTab = tab as typeof this.activeModalTab;
    if (this.companyModal.data.id) {
      if (tab === 'fiscal_insurance') {
        this.loadCompanyFiscalPeriods(this.companyModal.data.id);
      } else if (tab === 'treasury') {
        this.loadCompanyBankAccounts(this.companyModal.data.id);
      } else if (tab === 'governance') {
        this.loadCompanyBoardMembers(this.companyModal.data.id);
      } else if (tab === 'documents') {
        this.loadCompanyDocuments(this.companyModal.data.id);
      } else if (tab === 'access') {
        this.loadStudioAccesses(this.companyModal.data.id);
      }
    }
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
    this.openEditModal(company);
    this.setModalTab('gdrive');
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
      const isNew = url.includes('/companies/new');

      if (idParam) {
        const companyId = Number(idParam);
        this.viewMode = 'studio';
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
      if (tabParam && ['identity', 'fiscal_insurance', 'treasury', 'governance', 'documents', 'access', 'gdrive'].includes(tabParam)) {
        if (this.isTabAvailable(tabParam)) {
          this.activeModalTab = tabParam as any;
        } else {
          // پیوند مستقیم به تب حسابداری در نصب «فقط انبار»: بازگشت به تب مشخصات
          this.setModalTab('identity');
        }
        this.cdr.markForCheck();
      }
    });
  }

  private setupStudioForCompany(companyId: number): void {
    if (this.companyModal.data?.id === companyId && this.companyModal.isOpen) {
      return;
    }
    const found = this.companies.find(c => c.id === companyId);
    if (found) {
      this.populateStudioData(found);
    } else {
      this.isLoading = true;
      this.api.getById(companyId).subscribe({
        next: (comp) => {
          this.isLoading = false;
          if (comp) {
            this.populateStudioData(comp);
          }
        },
        error: () => {
          this.isLoading = false;
          this.toast.error('شرکت مورد نظر یافت نشد.');
          this.router?.navigate(['/app/operations/companies']);
        }
      });
    }
  }

  setupStudioForNew(): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = null;
    this.isLogoCleared = false;
    this.activeModalTab = 'identity';
    this.companyDocuments = [];
    this.filteredDocuments = [];
    this.companyBankAccounts = [];
    this.companyBoardMembers = [];
    this.companyFiscalPeriods = [];
    this.studioAccesses = [];
    this.showFiscalPeriodForm = false;
    this.newFiscalPeriod = this.getEmptyFiscalPeriodData();
    this.newAccount = this.getEmptyBankAccountData();
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.isEditingAccount = false;
    this.editingAccountId = null;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.showBoardMemberForm = false;
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.shebaValidationResult = null;
    this.newDoc = this.getEmptyDocData();
    this.regDateControl.setValue('', { emitEvent: false });
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });
    this.companyModal = {
      isOpen: true,
      isEdit: false,
      isSubmitting: false,
      data: this.getEmptyCompanyData(),
      errors: {}
    };
    this.viewMode = 'studio';
    this.cdr.markForCheck();
  }

  populateStudioData(company: Company): void {
    this.selectedLogoFile = null;
    this.logoPreviewUrl = company.logo || null;
    this.isLogoCleared = false;
    this.newDoc = this.getEmptyDocData();
    this.newAccount = this.getEmptyBankAccountData();
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.isEditingAccount = false;
    this.editingAccountId = null;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.showBoardMemberForm = false;
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.shebaValidationResult = null;
    this.companyBoardMembers = [];
    this.regDateControl.setValue(company.registration_date || '', { emitEvent: false });
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });

    this.companyModal = {
      isOpen: true,
      isEdit: true,
      isSubmitting: false,
      data: {
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
      },
      errors: {}
    };

    if (company.id) {
      this.loadCompanyFiscalPeriods(company.id);
      this.loadCompanyDocuments(company.id);
      this.loadCompanyBankAccounts(company.id);
      this.loadCompanyBoardMembers(company.id);
      this.loadStudioAccesses(company.id);
    }

    this.viewMode = 'studio';
    this.cdr.markForCheck();
  }

  openCreateModal(): void {
    this.setupStudioForNew();
    if (this.router) {
      this.router.navigate(['/app/operations/companies/new']);
    }
  }

  openEditModal(company: Company): void {
    this.populateStudioData(company);
    if (this.router) {
      this.router.navigate(['/app/operations/companies', company.id], {
        queryParams: { tab: this.activeModalTab || 'identity' }
      });
    }
  }

  closeCompanyModal(): void {
    this.companyModal.isOpen = false;
    this.viewMode = 'list';
    this.selectedLogoFile = null;
    this.logoPreviewUrl = null;
    this.companyDocuments = [];
    this.filteredDocuments = [];
    this.companyBankAccounts = [];
    this.companyFiscalPeriods = [];
    this.studioAccesses = [];
    this.showFiscalPeriodForm = false;
    this.isFiscalStartDatePickerOpen = false;
    this.isFiscalEndDatePickerOpen = false;
    this.isRegDatePickerOpen = false;
    this.isBoardDatePickerOpen = false;
    this.isDocIssueDatePickerOpen = false;
    this.isDocExpiryDatePickerOpen = false;
    this.isBankDropdownOpen = false;
    if (this.router) {
      this.router.navigate(['/app/operations/companies']);
    }
    this.cdr.markForCheck();
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت دوره‌های مالی رسمی شرکت (CompanyFiscalPeriod)
  // ═════════════════════════════════════════════════════════════════════
  loadCompanyFiscalPeriods(companyId: number): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingFiscalPeriods = true;
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
        this.toast.error('خطا در دریافت دوره‌های مالی شرکت');
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

  closeFiscalPeriod(period: CompanyFiscalPeriod): void {
    if (!period.id) return;
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

  freezeFiscalPeriod(period: CompanyFiscalPeriod): void {
    if (!period.id) return;
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

  reopenFiscalPeriod(period: CompanyFiscalPeriod): void {
    if (!period.id) return;
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
        this.toast.error('خطا در دریافت اسناد شرکت');
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

  // پیش‌نمایش درجا (In-Place Preview)
  openPreview(doc: CompanyDocument): void {
    const url = doc.file_url || doc.file;
    if (!url) {
      this.toast.warning('فایل مدرک در دسترس نیست.');
      return;
    }

    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }

    const isPdf = url.toLowerCase().includes('.pdf') || Boolean(doc.title && doc.title.toLowerCase().includes('.pdf'));
    const isImage = /\.(jpe?g|png|webp|svg|gif|bmp)(\?.*)?$/i.test(url) || Boolean(doc.title && /\.(jpe?g|png|webp|svg|gif|bmp)$/i.test(doc.title));

    // تبدیل آدرس‌های مطلق به مسیر نسبی جهت عبور بهینه از پروکسی و جلوگیری از خطای هم‌مبدایی فریم‌ها
    let cleanUrl = url;
    const mediaIdx = cleanUrl.indexOf('/media/');
    if (mediaIdx !== -1 && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
      cleanUrl = cleanUrl.substring(mediaIdx);
    } else if (cleanUrl.startsWith('http://127.0.0.1:8000') || cleanUrl.startsWith('http://localhost:8000')) {
      cleanUrl = cleanUrl.replace(/^https?:\/\/(127\.0\.0\.1|localhost):8000/, '');
    }

    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.isFullscreenPreview = false;
    this.useIframeFallback = false;

    this.previewModal = {
      isOpen: true,
      title: doc.title,
      fileUrl: cleanUrl,
      safeFileUrl: cleanUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(cleanUrl) : null,
      isPdf,
      isImage
    };
    this.isLoadingPreview = false;
    this.cdr.markForCheck();

    if (isPdf) {
      if (this.pdfTimeoutId) {
        clearTimeout(this.pdfTimeoutId);
      }
      this.pdfTimeoutId = setTimeout(() => {
        this.loadPdfWithPdfJs(cleanUrl);
      }, 50);
    }
  }

  async loadPdfWithPdfJs(url: string): Promise<void> {
    try {
      this.isPdfLoading = true;
      this.cdr.markForCheck();

      // دانلود مستقیم باینری با استفاده از HttpClient و رعایت توکن‌های احراز هویت
      let buffer: ArrayBuffer;
      if (this.http) {
        buffer = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        buffer = await res.arrayBuffer();
      }

      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        cMapPacked: true
      });

      this.pdfDoc = await loadingTask.promise;
      this.pdfTotalPages = this.pdfDoc.numPages || 1;
      this.pdfCurrentPage = 1;
      await this.renderPdfPage(1);
    } catch (err: any) {
      console.warn('PDF.js rendering fallback to native iframe:', err);
      this.isPdfLoading = false;
      this.useIframeFallback = true;
      this.cdr.markForCheck();
    }
  }

  async renderPdfPage(pageNumber: number): Promise<void> {
    if (!this.pdfDoc) return;
    try {
      this.isPdfLoading = true;
      this.cdr.markForCheck();

      if (this.pdfRenderTask) {
        try {
          this.pdfRenderTask.cancel();
        } catch (_) {}
        this.pdfRenderTask = null;
      }

      const page = await this.pdfDoc.getPage(pageNumber);
      const canvas = document.getElementById('pdf-render-canvas') as HTMLCanvasElement;
      if (!canvas) {
        this.isPdfLoading = false;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.isPdfLoading = false;
        return;
      }

      const viewport = page.getViewport({ scale: this.previewScale, rotation: this.previewRotation });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      this.pdfRenderTask = page.render(renderContext);
      await this.pdfRenderTask.promise;
      this.pdfCurrentPage = pageNumber;
      this.isPdfLoading = false;
      this.cdr.markForCheck();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Render page error:', err);
      }
      this.isPdfLoading = false;
      this.cdr.markForCheck();
    }
  }

  zoomIn(): void {
    this.previewScale = Math.min(3.0, +(this.previewScale + 0.25).toFixed(2));
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  zoomOut(): void {
    this.previewScale = Math.max(0.5, +(this.previewScale - 0.25).toFixed(2));
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  resetZoom(): void {
    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  rotatePreview(): void {
    this.previewRotation = (this.previewRotation + 90) % 360;
    if (this.previewModal.isPdf && this.pdfDoc) {
      this.renderPdfPage(this.pdfCurrentPage);
    }
    this.cdr.markForCheck();
  }

  toggleFullscreen(): void {
    this.isFullscreenPreview = !this.isFullscreenPreview;
    this.cdr.markForCheck();
  }

  nextPdfPage(): void {
    if (this.pdfCurrentPage < this.pdfTotalPages) {
      this.pdfCurrentPage++;
      this.renderPdfPage(this.pdfCurrentPage);
    }
  }

  prevPdfPage(): void {
    if (this.pdfCurrentPage > 1) {
      this.pdfCurrentPage--;
      this.renderPdfPage(this.pdfCurrentPage);
    }
  }

  startPan(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.panX;
    this.dragStartY = event.clientY - this.panY;
  }

  onPan(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.panX = event.clientX - this.dragStartX;
    this.panY = event.clientY - this.dragStartY;
    this.cdr.markForCheck();
  }

  stopPan(): void {
    this.isDragging = false;
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

  closePreview(): void {
    if (this.pdfTimeoutId) {
      clearTimeout(this.pdfTimeoutId);
      this.pdfTimeoutId = null;
    }
    if (this.pdfRenderTask) {
      try {
        this.pdfRenderTask.cancel();
      } catch (_) {}
      this.pdfRenderTask = null;
    }
    this.pdfDoc = null;
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.isLoadingPreview = false;
    this.previewModal = {
      isOpen: false,
      title: '',
      fileUrl: '',
      safeFileUrl: null,
      isPdf: false,
      isImage: false
    };
    this.previewScale = 1.0;
    this.previewRotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.isFullscreenPreview = false;
    this.isPdfLoading = false;
    this.useIframeFallback = false;
    this.cdr.markForCheck();
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت حساب‌های بانکی و شبای شرکت (چند حسابی)
  // ═════════════════════════════════════════════════════════════════════
  loadCompanyBankAccounts(companyId: number): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingBankAccounts = true;
    this.facade.getBankAccounts(companyId).subscribe({
      next: (res) => {
        this.isLoadingBankAccounts = false;
        if (Array.isArray(res)) {
          this.companyBankAccounts = res;
        } else if (res && Array.isArray((res as any).results)) {
          this.companyBankAccounts = (res as any).results;
        } else {
          this.companyBankAccounts = [];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingBankAccounts = false;
        this.toast.error('خطا در دریافت حساب‌های بانکی شرکت');
        this.cdr.markForCheck();
      }
    });
  }

  onShebaInput(val: string): void {
    const cleaned = cleanShebaInput(val);
    if (!cleaned) {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
      this.newAccount.sheba_number = '';
      this.cdr.markForCheck();
      return;
    }

    const digits = extractShebaDigits(cleaned);
    this.shebaValidationResult = validateSheba(digits);
    this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || digits;
    this.newAccount.sheba_number = this.shebaValidationResult?.rawSheba || cleaned;

    if (this.shebaValidationResult?.bank) {
      this.newAccount.bank_name = this.shebaValidationResult.bank.name;
    }
    if (this.shebaValidationResult?.accountNumber) {
      this.newAccount.account_number = this.shebaValidationResult.accountNumber;
    }
    this.cdr.markForCheck();
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  selectBankForAccount(bank: IranianBankInfo): void {
    this.newAccount.bank_name = bank.name;
    this.isBankDropdownOpen = false;
    this.onAccountNumberInput();
    this.cdr.markForCheck();
  }

  filterBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery.trim()) {
      return this.iranianBanksList;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanksList.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.shortName.toLowerCase().includes(q) ||
      b.code.includes(q)
    );
  }

  onAccountNumberInput(event?: any): void {
    let cleanAcc = this.newAccount.account_number || '';
    if (event) {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                       .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                       .replace(/\D/g, '')
                       .substring(0, 18);
      this.newAccount.account_number = cleanAcc;
      if (event?.target) event.target.value = cleanAcc;
    }
    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.newAccount.bank_name) {
      const bankInfo = getBankByName(this.newAccount.bank_name);
      const bankCode = bankInfo ? bankInfo.code : this.newAccount.bank_name;
      const generated = generateShebaFromAccount(bankCode, cleanAcc);
      if (generated) {
        const res = validateSheba(generated);
        this.shebaValidationResult = res;
        this.newAccount.sheba_number = res.rawSheba || generated;
        this.shebaDigitsDisplay = res.formattedDigits || '';
      }
    }
    this.cdr.markForCheck();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    const cleanAcc = pasted.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.newAccount.account_number = cleanAcc;
    this.onAccountNumberInput();
  }

  convertAccountToShebaNow(): void {
    if (!this.newAccount.bank_name) {
      this.toast.warning('لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.newAccount.account_number);
    if (!accValidation.isValid) {
      this.toast.warning(accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const bankInfo = getBankByName(this.newAccount.bank_name);
    const bankCode = bankInfo ? bankInfo.code : this.newAccount.bank_name;
    const generated = generateShebaFromAccount(bankCode, this.newAccount.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.success(`شماره شبا با موفقیت بر اساس بانک ${this.newAccount.bank_name} تولید شد.`);
    } else {
      this.toast.error('امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  copyAccountNumber(acc: string): void {
    if (!acc) return;
    navigator.clipboard.writeText(acc).then(() => {
      this.isAccountCopied = true;
      this.toast.success(`شماره حساب (${acc}) کپی شد.`);
      setTimeout(() => {
        this.isAccountCopied = false;
        this.cdr.markForCheck();
      }, 2000);
      this.cdr.markForCheck();
    }).catch(() => {
      this.toast.error('عدم دسترسی به حافظه موقت.');
    });
  }

  copySheba(sheba: string, id?: number | string): void {
    if (!sheba) return;
    navigator.clipboard.writeText(sheba).then(() => {
      this.copiedShebaId = id ?? null;
      this.copiedSheba = sheba;
      this.toast.success('شماره شبا در حافظه کپی شد.');
      setTimeout(() => {
        this.copiedShebaId = null;
        this.copiedSheba = null;
        this.cdr.markForCheck();
      }, 2500);
      this.cdr.markForCheck();
    }).catch(() => {
      this.toast.error('امکان کپی در حافظه وجود ندارد.');
    });
  }

  saveBankAccount(): void {
    if (!this.companyModal.data.id) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید.');
      return;
    }
    if (!this.newAccount.sheba_number.trim()) {
      this.toast.warning('لطفاً شماره شبا را وارد فرمایید.');
      return;
    }

    const shebaVal = validateSheba(this.newAccount.sheba_number);
    if (!shebaVal.isValid) {
      this.toast.error(shebaVal.errorMessage || 'شماره شبا نامعتبر است.');
      return;
    }

    this.isSavingBankAccount = true;
    const payload: Partial<CompanyBankAccount> = {
      company: this.companyModal.data.id,
      bank_name: this.newAccount.bank_name.trim() || (shebaVal.bank?.name || 'نامشخص'),
      account_number: this.newAccount.account_number.trim() || shebaVal.accountNumber || null,
      sheba_number: shebaVal.formattedSheba.replace(/\s+/g, ''),
      account_title: this.newAccount.account_title?.trim() || null,
      is_primary: this.newAccount.is_primary,
      is_active: true
    };

    if (this.isEditingAccount && this.editingAccountId) {
      this.facade.updateBankAccount(this.editingAccountId, payload).subscribe({
        next: (saved) => {
          this.isSavingBankAccount = false;
          this.toast.success(`حساب بانکی «${saved.bank_name}» با موفقیت ویرایش شد.`);
          this.cancelEditAccount();
          const idx = this.companyBankAccounts.findIndex(a => a.id === saved.id);
          if (idx !== -1) {
            this.companyBankAccounts[idx] = saved;
            this.companyBankAccounts = [...this.companyBankAccounts];
          } else {
            this.companyBankAccounts = [saved, ...this.companyBankAccounts];
          }
          if (saved.is_primary) {
            this.companyBankAccounts = this.companyBankAccounts.map(a => ({
              ...a,
              is_primary: a.id === saved.id
            }));
          }
          this.loadCompanies();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBankAccount = false;
          const msg = err.error?.detail || err.error?.sheba_number?.[0] || 'خطا در ویرایش حساب بانکی';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    } else {
      this.facade.createBankAccount(payload).subscribe({
        next: (created) => {
          this.isSavingBankAccount = false;
          this.toast.success(`حساب بانکی «${created.bank_name}» با موفقیت افزوده شد.`);
          this.cancelEditAccount();
          if (created.is_primary) {
            this.companyBankAccounts = this.companyBankAccounts.map(a => ({
              ...a,
              is_primary: false
            }));
          }
          this.companyBankAccounts = [created, ...this.companyBankAccounts.filter(a => a.id !== created.id)];
          this.loadCompanies();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBankAccount = false;
          const msg = err.error?.detail || err.error?.sheba_number?.[0] || 'خطا در ثبت حساب بانکی';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    }
  }

  editAccount(acc: CompanyBankAccount): void {
    this.isEditingAccount = true;
    this.editingAccountId = acc.id || null;
    this.newAccount = {
      id: acc.id,
      bank_name: acc.bank_name,
      account_number: acc.account_number || '',
      sheba_number: acc.sheba_number,
      account_title: acc.account_title || '',
      is_primary: acc.is_primary
    };
    this.shebaValidationResult = validateSheba(acc.sheba_number);
    this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || extractShebaDigits(acc.sheba_number);
    this.cdr.markForCheck();
  }

  cancelEditAccount(): void {
    this.isEditingAccount = false;
    this.editingAccountId = null;
    this.newAccount = this.getEmptyBankAccountData();
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.cdr.markForCheck();
  }

  async deleteBankAccount(acc: CompanyBankAccount): Promise<void> {
    if (!acc.id) return;
    const ok = await this.askConfirm(
      'حذف حساب بانکی',
      `آیا از حذف حساب بانکی «${acc.bank_name}» با شماره شبای «${acc.sheba_number}» اطمینان دارید؟`
    );
    if (!ok) return;
    this.facade.deleteBankAccount(acc.id).subscribe({
      next: () => {
        this.toast.success('حساب بانکی با موفقیت حذف شد.');
        this.companyBankAccounts = this.companyBankAccounts.filter(a => a.id !== acc.id);
        this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف حساب بانکی')
    });
  }

  setPrimaryAccount(acc: CompanyBankAccount): void {
    if (!acc.id) return;
    this.api.setPrimaryBankAccount(acc.id).subscribe({
      next: () => {
        this.toast.success(`حساب «${acc.bank_name}» به عنوان حساب اصلی شرکت تنظیم شد.`);
        this.companyBankAccounts = this.companyBankAccounts.map(a => ({
          ...a,
          is_primary: a.id === acc.id
        }));
        if (this.companyModal.data) {
          this.companyModal.data.primary_bank_name = acc.bank_name;
          this.companyModal.data.primary_account_number = acc.account_number || '';
          this.companyModal.data.primary_iban = acc.sheba_number || '';
        }
        this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در تنظیم حساب اصلی')
    });
  }

  private getEmptyBankAccountData() {
    return {
      id: undefined as number | undefined,
      bank_name: '',
      account_number: '',
      sheba_number: '',
      account_title: '',
      is_primary: false
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت اعضای هیئت‌مدیره و ارکان قانونی شرکت (تب سوم استودیو)
  // ═════════════════════════════════════════════════════════════════════
  getEmptyBoardMemberData() {
    return {
      first_name: '',
      last_name: '',
      national_code: '',
      member_type: 'real' as CompanyBoardMemberType,
      represented_legal_name: '',
      role: 'board_member' as CompanyBoardMemberRole,
      has_signature_right: false,
      signature_scope: '',
      term_start: '',
      term_expiry: '',
      is_active: true
    };
  }

  loadCompanyBoardMembers(companyId: number): void {
    if (!this.isAccountingInstalled) return;
    this.isLoadingBoardMembers = true;
    this.facade.getBoardMembers(companyId).subscribe({
      next: (res) => {
        this.isLoadingBoardMembers = false;
        if (Array.isArray(res)) {
          this.companyBoardMembers = res;
        } else if (res && Array.isArray((res as any).results)) {
          this.companyBoardMembers = (res as any).results;
        } else {
          this.companyBoardMembers = [];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingBoardMembers = false;
        this.toast.error('خطا در دریافت لیست اعضای هیئت‌مدیره شرکت');
        this.cdr.markForCheck();
      }
    });
  }

  openNewBoardMemberForm(): void {
    if (!this.companyModal.data.id) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید تا شناسه شرکت صادر گردد.');
      return;
    }
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.showBoardMemberForm = true;
    this.cdr.markForCheck();
  }

  editBoardMember(member: CompanyBoardMember): void {
    this.editingBoardMemberId = member.id || null;
    this.isEditingBoardMember = true;
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.newBoardMember = {
      first_name: member.first_name,
      last_name: member.last_name,
      national_code: member.national_code,
      member_type: member.member_type,
      represented_legal_name: member.represented_legal_name || '',
      role: member.role,
      has_signature_right: member.has_signature_right,
      signature_scope: member.signature_scope || '',
      term_start: member.term_start || '',
      term_expiry: member.term_expiry || '',
      is_active: member.is_active !== false
    };
    this.showBoardMemberForm = true;
    this.boardTermStartControl.setValue(member.term_start || '', { emitEvent: false });
    this.boardTermExpiryControl.setValue(member.term_expiry || '', { emitEvent: false });
    this.cdr.markForCheck();
  }

  cancelBoardMemberForm(): void {
    this.showBoardMemberForm = false;
    this.isEditingBoardMember = false;
    this.editingBoardMemberId = null;
    this.newBoardMember = this.getEmptyBoardMemberData();
    this.boardTermStartControl.setValue('', { emitEvent: false });
    this.boardTermExpiryControl.setValue('', { emitEvent: false });
    this.selectedIdDocFile = null;
    this.selectedAppointmentDocFile = null;
    this.cdr.markForCheck();
  }

  onIdDocFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        this.toast.error('حجم فایل مدارک هویتی نباید بیش از ۲۰ مگابایت باشد.');
        return;
      }
      this.selectedIdDocFile = file;
    }
  }

  onAppointmentDocFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        this.toast.error('حجم فایل حکم انتصاب نباید بیش از ۲۰ مگابایت باشد.');
        return;
      }
      this.selectedAppointmentDocFile = file;
    }
  }

  onBoardTermStartSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newBoardMember.term_start = val;
    this.boardTermStartControl.setValue(val, { emitEvent: false });
    this.isBoardTermStartDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onBoardTermExpirySelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newBoardMember.term_expiry = val;
    this.boardTermExpiryControl.setValue(val, { emitEvent: false });
    this.isBoardTermExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  saveBoardMember(): void {
    if (!this.companyModal.data.id) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید.');
      return;
    }
    if (!this.newBoardMember.first_name.trim() || !this.newBoardMember.last_name.trim()) {
      this.toast.warning('نام و نام خانوادگی عضو هیئت‌مدیره الزامی است.');
      return;
    }
    const cleanCode = this.newBoardMember.national_code.replace(/[^0-9]/g, '');
    if (cleanCode.length !== 10) {
      this.toast.warning('کد ملی عضو باید دقیقاً ۱۰ رقم باشد.');
      return;
    }
    if (!this.validateNationalCode(cleanCode)) {
      this.toast.warning('کد ملی عضو هیئت‌مدیره با الگوریتم ثبت احوال همخوانی ندارد.');
      return;
    }

    this.isSavingBoardMember = true;
    const formData = new FormData();
    formData.append('company', String(this.companyModal.data.id));
    formData.append('first_name', this.newBoardMember.first_name.trim());
    formData.append('last_name', this.newBoardMember.last_name.trim());
    formData.append('national_code', cleanCode);
    formData.append('member_type', this.newBoardMember.member_type);
    if (this.newBoardMember.member_type === 'legal_rep' && this.newBoardMember.represented_legal_name) {
      formData.append('represented_legal_name', this.newBoardMember.represented_legal_name.trim());
    }
    formData.append('role', this.newBoardMember.role);
    formData.append('has_signature_right', String(this.newBoardMember.has_signature_right));
    if (this.newBoardMember.signature_scope) {
      formData.append('signature_scope', this.newBoardMember.signature_scope.trim());
    }
    if (this.newBoardMember.term_start) {
      formData.append('term_start', this.newBoardMember.term_start);
    }
    if (this.newBoardMember.term_expiry) {
      formData.append('term_expiry', this.newBoardMember.term_expiry);
    }
    formData.append('is_active', String(this.newBoardMember.is_active));

    if (this.selectedIdDocFile) {
      formData.append('attached_id_doc', this.selectedIdDocFile);
    }
    if (this.selectedAppointmentDocFile) {
      formData.append('attached_appointment_doc', this.selectedAppointmentDocFile);
    }

    const companyId = this.companyModal.data.id;
    if (this.isEditingBoardMember && this.editingBoardMemberId) {
      this.facade.updateBoardMember(this.editingBoardMemberId, formData).subscribe({
        next: (updated) => {
          this.isSavingBoardMember = false;
          this.toast.success(`مشخصات «${updated.first_name} ${updated.last_name}» با موفقیت ویرایش شد.`);
          this.cancelBoardMemberForm();
          const idx = this.companyBoardMembers.findIndex(m => m.id === updated.id);
          if (idx !== -1) {
            this.companyBoardMembers[idx] = updated;
            this.companyBoardMembers = [...this.companyBoardMembers];
          } else {
            this.companyBoardMembers = [updated, ...this.companyBoardMembers];
          }
          this.loadCompanies();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBoardMember = false;
          const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ویرایش عضو هیئت‌مدیره';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    } else {
      this.facade.createBoardMember(formData).subscribe({
        next: (created) => {
          this.isSavingBoardMember = false;
          this.toast.success(`عضو جدید «${created.first_name} ${created.last_name}» با موفقیت افزوده شد.`);
          this.cancelBoardMemberForm();
          this.companyBoardMembers = [created, ...this.companyBoardMembers.filter(m => m.id !== created.id)];
          this.loadCompanies();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBoardMember = false;
          const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ثبت عضو هیئت‌مدیره';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    }
  }

  async deleteBoardMember(member: CompanyBoardMember): Promise<void> {
    if (!member.id) return;
    const ok = await this.askConfirm(
      'حذف عضو هیئت‌مدیره',
      `آیا از حذف عضو «${member.first_name} ${member.last_name}» اطمینان دارید؟`
    );
    if (!ok) return;
    this.facade.deleteBoardMember(member.id).subscribe({
      next: () => {
        this.toast.success('عضو هیئت‌مدیره با موفقیت حذف گردید.');
        this.companyBoardMembers = this.companyBoardMembers.filter(m => m.id !== member.id);
        this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف عضو هیئت‌مدیره')
    });
  }

  getRoleBadgeClass(role: CompanyBoardMemberRole): string {
    const found = this.boardRolesList.find(r => r.value === role);
    return found ? found.badgeClass : 'bg-slate-50 text-slate-700 border-slate-200';
  }

  getRoleLabel(role: CompanyBoardMemberRole): string {
    const found = this.boardRolesList.find(r => r.value === role);
    return found ? found.label : role;
  }

  getSignersCount(): number {
    return this.companyBoardMembers.filter(m => m.has_signature_right).length;
  }

  getCeoMember(): CompanyBoardMember | undefined {
    return this.companyBoardMembers.find(m => m.role === 'managing_director' || m.role === 'managing_director_and_member');
  }

  getChairmanMember(): CompanyBoardMember | undefined {
    return this.companyBoardMembers.find(m => m.role === 'chairman');
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

  validateNationalCode(code?: string | null): boolean {
    if (!code) return true;
    let clean = code.replace(/[^0-9]/g, '');
    if (clean.length > 0 && clean.length < 10) {
      clean = clean.padStart(10, '0');
    }
    if (clean.length !== 10) return false;
    if (/^(\d)\1{9}$/.test(clean)) return false;
    const digits = clean.split('').map(Number);
    const checksum = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
    const remainder = sum % 11;
    return (remainder < 2 && checksum === remainder) || (remainder >= 2 && checksum === 11 - remainder);
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
        this.loadCompanies();
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
        this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف مدرک')
    });
  }

  onCoreDocSelected(event: any, docType: 'articles_of_association' | 'latest_gazette'): void {
    const file = event.target?.files?.[0];
    if (!file || !this.companyModal.data.id) return;

    this.api.uploadCoreDoc(this.companyModal.data.id, docType, file).subscribe({
      next: (res) => {
        const title = docType === 'articles_of_association' ? 'اساسنامه' : 'روزنامه رسمی';
        this.toast.success(`فایل ${title} با موفقیت بارگذاری شد.`);
        if (docType === 'articles_of_association') {
          this.companyModal.data.articles_of_association = res.articles_of_association;
        } else {
          this.companyModal.data.latest_gazette = res.latest_gazette;
        }
        this.loadCompanies();
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در بارگذاری فایل')
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

  validateCompanyForm(): boolean {
    const errors: { [key: string]: string } = {};
    const d = this.companyModal.data;

    if (!d.code || !d.code.trim()) {
      errors['code'] = 'کد یکتای شرکت الزامی است.';
    }
    if (!d.name || !d.name.trim()) {
      errors['name'] = 'نام کامل شرکت الزامی است.';
    }
    if (d.national_id && d.national_id.trim()) {
      const nid = d.national_id.trim();
      if (!/^\d+$/.test(nid)) {
        errors['national_id'] = 'شناسه ملی باید فقط شامل ارقام عددی باشد.';
      } else if (nid.length !== 11) {
        errors['national_id'] = 'شناسه ملی اشخاص حقوقی باید دقیقاً ۱۱ رقم باشد.';
      } else if (!this.isNationalIdChecksumValid(nid)) {
        errors['national_id'] = 'شناسه ملی واردشده با الگوریتم کنترلی ثبت شرکت‌ها همخوانی ندارد.';
      }
    }

    this.companyModal = {
      ...this.companyModal,
      errors
    };
    this.cdr.markForCheck();
    return Object.keys(errors).length === 0;
  }

  submitCompanyForm(): void {
    if (!this.validateCompanyForm()) {
      return;
    }

    this.companyModal.isSubmitting = true;
    const d = this.companyModal.data;
    const payload = {
      code: d.code.trim().toUpperCase(),
      name: d.name.trim(),
      company_type: d.company_type || 'private_joint_stock',
      national_id: d.national_id?.trim() || null,
      economic_code: d.economic_code?.trim() || null,
      registration_number: d.registration_number?.trim() || null,
      registration_date: d.registration_date || null,
      registered_capital: d.registered_capital || null,
      shares_count: d.shares_count || null,
      share_nominal_value: d.share_nominal_value || null,
      fiscal_year_start_month: Number(d.fiscal_year_start_month) || 1,
      phone: d.phone?.trim() || null,
      address: d.address?.trim() || null,
      postal_code: d.postal_code?.trim() || null,
      ceo_name: d.ceo_name?.trim() || null,
      board_chairman: d.board_chairman?.trim() || null,
      board_vice_chairman: d.board_vice_chairman?.trim() || null,
      main_inspector: d.main_inspector?.trim() || null,
      alternate_inspector: d.alternate_inspector?.trim() || null,
      authorized_signers: d.authorized_signers?.trim() || null,
      board_term_expiry: d.board_term_expiry || null,
      workshop_code: d.workshop_code?.trim() || null,
      social_security_branch_code: d.social_security_branch_code?.trim() || null,
      social_security_branch_name: d.social_security_branch_name?.trim() || null,
      contract_row: d.contract_row?.trim() || null,
      employer_name: d.employer_name?.trim() || null,
      tax_memory_id: d.tax_memory_id?.trim() || null,
      tax_economic_code: d.tax_economic_code?.trim() || null,
      primary_bank_name: d.primary_bank_name?.trim() || null,
      primary_account_number: d.primary_account_number?.trim() || null,
      primary_iban: d.primary_iban?.trim() || null,
      is_active: d.is_active,
      has_warehouse_module: d.has_warehouse_module
    };

    if (this.companyModal.isEdit && this.companyModal.data.id) {
      const companyId = this.companyModal.data.id;
      this.api.update(companyId, payload).subscribe({
        next: (updated) => {
          this.companyModal.isSubmitting = false;
          this.companyModal.isOpen = false;
          this.viewMode = 'list';
          this.router?.navigate(['/app/operations/companies']);
          this.toast.success(`اطلاعات شرکت «${updated.name}» با موفقیت ویرایش شد.`);
          if (this.selectedLogoFile) {
            this.api.uploadLogo(companyId, this.selectedLogoFile).subscribe({
              next: () => this.loadCompanies(),
              error: (err) => {
                const msg = err.error?.detail || err.error?.logo?.[0] || 'خطا در بارگذاری لوگوی شرکت';
                this.toast.warning(msg);
                this.loadCompanies();
              }
            });
          } else if (this.isLogoCleared) {
            this.api.deleteLogo(companyId).subscribe({
              next: () => this.loadCompanies(),
              error: () => {
                this.toast.warning('خطا در حذف لوگوی شرکت');
                this.loadCompanies();
              }
            });
          } else {
            this.loadCompanies();
          }
          this.activeCompanyService.loadAvailableCompanies().subscribe();
        },
        error: (err) => {
          this.companyModal.isSubmitting = false;
          const msg = err.error?.detail || err.error?.code?.[0] || 'خطا در ثبت ویرایش شرکت';
          this.toast.error(msg);
        }
      });
    } else {
      this.api.create(payload).subscribe({
        next: (created) => {
          this.companyModal.isSubmitting = false;
          this.companyModal.isOpen = false;
          this.viewMode = 'list';
          this.router?.navigate(['/app/operations/companies']);
          this.toast.success(`شرکت «${created.name}» با موفقیت ثبت شد.`);
          if (this.selectedLogoFile && created.id) {
            this.api.uploadLogo(created.id, this.selectedLogoFile).subscribe({
              next: () => this.loadCompanies(),
              error: (err) => {
                const msg = err.error?.detail || err.error?.logo?.[0] || 'خطا در بارگذاری لوگوی شرکت';
                this.toast.warning(msg);
                this.loadCompanies();
              }
            });
          } else {
            this.loadCompanies();
          }
          this.activeCompanyService.loadAvailableCompanies().subscribe();
        },
        error: (err) => {
          this.companyModal.isSubmitting = false;
          const msg = err.error?.detail || err.error?.code?.[0] || 'خطا در ایجاد شرکت جدید';
          this.toast.error(msg);
        }
      });
    }
  }

  confirmDelete(company: Company): void {
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
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `companies_${new Date().getTime()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل اکسل با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت خروجی اکسل شرکت‌ها');
      }
    });
  }

  importExcel(): void {
    this.toast.info('امکان ورود اطلاعات شرکت‌ها از اکسل در این نسخه آماده است.');
  }

  // مدیریت دسترسی کاربران (UserCompanyAccess)
  openUserAccessModal(company: Company): void {
    this.userAccessModal = {
      isOpen: true,
      company,
      accesses: [],
      isLoading: true,
      selectedUserId: null,
      accessLevel: 'docs_read',
      roleInCompany: '',
      isDefault: false,
      isSubmitting: false
    };
    this.loadUserAccesses(company.id);
    this.cdr.markForCheck();
  }

  closeUserAccessModal(): void {
    this.userAccessModal.isOpen = false;
    this.userAccessModal.company = null;
    this.userAccessModal.accesses = [];
    this.cdr.markForCheck();
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

  private loadSystemUsers(): void {
    if (this.accountsHttp) {
      this.accountsHttp.getUsers().subscribe({
        next: (users) => {
          this.systemUsers = users;
        },
        error: () => {}
      });
    }
  }

  loadStudioAccesses(companyId: number): void {
    this.isLoadingStudioAccesses = true;
    this.api.getUserAccesses({ company_id: companyId }).subscribe({
      next: (res) => {
        this.isLoadingStudioAccesses = false;
        this.studioAccesses = res || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingStudioAccesses = false;
        this.toast.error('خطا در دریافت لیست دسترسی کاربران شرکت');
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
        this.toast.success('دسترسی کاربر با موفقیت ثبت شد.');
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
    const ok = await this.askConfirm(
      'لغو دسترسی کاربر',
      'آیا از لغو دسترسی این کاربر اطمینان دارید؟'
    );
    if (!ok) return;
    this.api.deleteUserAccess(accessId).subscribe({
      next: () => {
        this.toast.success('دسترسی کاربر با موفقیت لغو شد.');
        this.studioAccesses = this.studioAccesses.filter(a => a.id !== accessId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('خطا در لغو دسترسی کاربر');
      }
    });
  }

  private loadUserAccesses(companyId: number): void {
    this.userAccessModal.isLoading = true;
    this.api.getUserAccesses({ company_id: companyId }).subscribe({
      next: (res) => {
        this.userAccessModal.isLoading = false;
        this.userAccessModal.accesses = res;
        this.cdr.markForCheck();
      },
      error: () => {
        this.userAccessModal.isLoading = false;
        this.toast.error('خطا در بارگذاری دسترسی‌های کاربران');
      }
    });
  }

  addUserAccess(): void {
    if (!this.userAccessModal.company || !this.userAccessModal.selectedUserId) {
      this.toast.warning('لطفاً کاربر مورد نظر را انتخاب نمایید.');
      return;
    }
    const companyId = this.userAccessModal.company.id;
    const targetUserId = this.userAccessModal.selectedUserId;
    this.userAccessModal.isSubmitting = true;
    this.api.createUserAccess({
      user: this.userAccessModal.selectedUserId,
      company: this.userAccessModal.company.id,
      access_level: this.userAccessModal.accessLevel,
      role_in_company: this.userAccessModal.roleInCompany.trim() || null,
      is_default: this.userAccessModal.isDefault
    }).subscribe({
      next: (created) => {
        this.userAccessModal.isSubmitting = false;
        this.userAccessModal.selectedUserId = null;
        this.userAccessModal.roleInCompany = '';
        this.userAccessModal.accessLevel = 'docs_read';
        this.userAccessModal.isDefault = false;
        this.toast.success('دسترسی کاربر به شرکت با موفقیت ثبت شد.');
        const userObj = this.systemUsers.find(u => u.id === (created.user || targetUserId));
        const fullAccess: UserCompanyAccess = {
          ...created,
          username: created.username || userObj?.username || '',
          user_full_name: created.user_full_name || (userObj ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() : '')
        };
        this.userAccessModal.accesses = [fullAccess, ...this.userAccessModal.accesses.filter(a => a.id !== created.id)];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.userAccessModal.isSubmitting = false;
        const msg = err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ثبت دسترسی کاربر';
        this.toast.error(msg);
      }
    });
  }

  async removeUserAccess(accessId?: number): Promise<void> {
    if (!accessId) return;
    const ok = await this.askConfirm(
      'لغو دسترسی کاربر',
      'آیا از لغو دسترسی این کاربر اطمینان دارید؟'
    );
    if (!ok) return;
    this.api.deleteUserAccess(accessId).subscribe({
      next: () => {
        this.toast.success('دسترسی کاربر لغو شد.');
        this.userAccessModal.accesses = this.userAccessModal.accesses.filter(a => a.id !== accessId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('خطا در لغو دسترسی');
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
