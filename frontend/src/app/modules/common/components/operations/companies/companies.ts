import {
  isNationalIdChecksumValid as nationalIdChecksumValid,
  buildCompanyPayload
} from './companies.helpers';
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, HostListener, Type, ViewChild, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { forkJoin, Observable, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, takeUntil } from 'rxjs/operators';
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
import { CompanyListCell, CompanyRowAction, CompanyStudioSection, CompanyStudioTab } from '../../../../../core/modules/module-contract';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { DocumentPreviewComponent } from '../../../../../shared/components/document-preview/document-preview.component';
import { SmartDeleteModalComponent } from '../../../../../shared/components/smart-delete-modal/smart-delete-modal';
import {
  Company,
  UserCompanyAccess,
  CompanyMember,
  CompanyPermissionSection,
  CompanyPermissionSpec,
  CompanySectionLevels,
  SectionLevel
} from '../../../../../core/models/company.model';
import { normalizeDigits } from '../../../../../core/utils/date-utils';
import { ConfirmDialogService, ConfirmDialogConfig } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { getStoredCurrentUserId } from '../../../../../core/services/sync-pull.service';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ServerUrlPipe } from '../../../../../shared/pipes/server-url.pipe';
import { PersianDatePipe } from '../../../../../shared/pipes/persian-date.pipe';
import { CommandCenterComponent } from '../../../../../shared/components/command-center/command-center.component';
import { ExcelImportModal } from '../../../../../shared/components/excel-import-modal/excel-import-modal';
import { PLATFORM_ENTITY_ICONS } from '../../../../../shared/icons/semantic-icons';
import { CompanyProjectsTabComponent } from './company-projects-tab/company-projects-tab';
import { CompanyWorkflowTabComponent } from './company-workflow-tab/company-workflow-tab.component';

@Component({
  selector: 'app-companies-management',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective, ActionButtonComponent, TabBarComponent, ServerUrlPipe, PersianDatePipe, LoadingSkeletonComponent, OfflinePendingBadgeComponent, DocumentPreviewComponent, CommandCenterComponent, SmartDeleteModalComponent, ExcelImportModal, CompanyProjectsTabComponent, CompanyWorkflowTabComponent],
  providers: [CompanyStudioContextService],
  templateUrl: './companies.html',
  styleUrls: ['./companies.css']
})
export class CompaniesManagementComponent implements OnInit, OnDestroy {
  /** نشانی فهرست: حالت کامل مدیر کل زیر عملیات، حالت محدود جدا (ت۱۰) */
  private get listUrl(): string {
    return this.isRestricted ? '/app/companies' : '/app/operations/companies';
  }

  /** حالت استودیو از data مسیر: «محدود» برای دارندگان مجوز بخش‌ها (ق۳)، وگرنه کامل */
  get isRestricted(): boolean {
    return this.route?.snapshot?.data?.['studioMode'] === 'restricted';
  }
  private static readonly CORE_DOC_MAX_BYTES = 20 * 1024 * 1024;
  /** فیلدهایی که زیرشان پیام خطا نمایش داده می‌شود */
  private static readonly FIELD_ERROR_KEYS = [
    'code', 'name', 'national_id', 'registration_number', 'phone', 'postal_code', 'economic_code'
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
  @ViewChild(SmartDeleteModalComponent) smartDeleteModal?: SmartDeleteModalComponent;
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

  // کنترل‌های فرم تقویم شمسی جلالی (Reactive FormControls برای عملکرد بی‌نقص ng-persian-datepicker)
  regDateControl = new FormControl('');

  // مدیریت دسترسی‌های استودیو (تب ششم)
  studioAccesses: UserCompanyAccess[] = [];
  isLoadingStudioAccesses = false;
  studioSelectedUserId: number | null = null;
  studioRoleInCompany = '';
  studioIsDefaultAccess = false;
  userSearchQuery = '';
  /** combobox جستجوپذیر کاربران (A23) */
  isUserListOpen = false;
  userActiveIndex = -1;
  systemUsersLoaded = false;
  systemUsersError = false;

  /** آیکون‌های معنایی صفحه (C5) */
  readonly icons = {
    company: PLATFORM_ENTITY_ICONS.company,
    permissions: PLATFORM_ENTITY_ICONS.permissions,
    projects: PLATFORM_ENTITY_ICONS.projects,
  } as const;

  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');


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
      articles_of_association?: string | null;
      latest_gazette?: string | null;
      is_active: boolean;
      /** فقط حالت کامل مدیر کل: کد ماژول‌های خاموش این شرکت (کلید ماژول‌ها) */
      disabled_modules?: string[];
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

  // وضعیت مدال تایید حذف (smart-delete-modal با اثر حذف آبشاری؛ ت۹)
  deleteModal: {
    isOpen: boolean;
    target: Company | null;
    isDeleting: boolean;
    impactUrl: string;
    errorMessage: string;
  } = {
    isOpen: false,
    target: null,
    isDeleting: false,
    impactUrl: '',
    errorMessage: ''
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
      const cid = this.companyModal.data.id;
      if (this.isOnline && this.accessRefreshOnReconnect && cid && cid > 0) {
        this.accessRefreshOnReconnect = false;
        this.loadStudioAccesses(cid);
      }
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
      if (e.urlAfterRedirects.split('?')[0] === this.listUrl) {
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
          const targetCompanyId = msg.company_id;

          if (msg.entity_type === 'company') {
            this.reloadListIfVisible();
          } else if (msg.entity_type === 'company_bank_account' || msg.entity_type === 'company_board_member' || msg.entity_type === 'company_document') {
            // تب‌ها و بخش‌های مشارکتی دادهٔ خودشان را تازه می‌کنند؛ فهرست (ستون‌های مشارکتی) فقط وقتی دیده می‌شود
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
    // حالت محدود: فقط شرکت‌هایی که دست‌کم یک بخش آن‌ها خواندنی است، همراه سطح هر بخش
    const source$: Observable<Company[] | { results: Company[]; count: number }> = this.isRestricted
      ? this.api.getUserAvailable('manage').pipe(map(res => res?.companies || []))
      : this.api.getAll();
    source$.subscribe({
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
      [c.name, c.code, c.national_id, c.economic_code, c.ceo_name]
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

  /**
   * ماژول‌های نصب‌شده‌ای که برای هر شرکت روشن و خاموش می‌شوند (ت۸ طرح ۲.۱)؛ پوستهٔ عملیات ماژول نیست.
   * پوسته نام هیچ ماژولی را نمی‌داند: فهرست از رجیستری ماژول‌ها و وضعیت از `enabled_modules` شرکت می‌آید.
   */
  get switchableModules(): { code: string; titleFa: string; titleShortFa: string }[] {
    return this.moduleRegistry.getInstalledModules()
      .filter(m => !m.isSuperuserOnly)
      .map(m => ({ code: m.code, titleFa: m.titleFa, titleShortFa: m.titleShortFa }));
  }

  /** ستون «ماژول‌ها» فقط وقتی بیش از یک ماژول نصب است معنا دارد */
  get showModulesColumn(): boolean {
    return this.switchableModules.length > 1;
  }

  /** نام کوتاه ماژول‌های روشن یک شرکت در فهرست */
  companyModuleState(company: Company): { code: string; titleShortFa: string; enabled: boolean }[] {
    return this.switchableModules.map(m => ({
      code: m.code, titleShortFa: m.titleShortFa, enabled: this.moduleRegistry.isModuleEnabledForCompany(m.code, company)
    }));
  }

  /** کلید یک ماژول در فرم شرکت (مدیر کل): روشن یعنی در `disabled_modules` نیست */
  isModuleSwitchOn(code: string): boolean {
    return !(this.companyModal.data.disabled_modules || []).includes(code);
  }

  toggleModuleSwitch(code: string, on: boolean): void {
    const current = new Set(this.companyModal.data.disabled_modules || []);
    if (on) current.delete(code);
    else current.add(code);
    this.companyModal.data.disabled_modules = this.switchableModules.map(m => m.code).filter(c => current.has(c));
    this.cdr.markForCheck();
  }

  /** تعداد ستون‌های پویا: ۸ پایه + ستون‌های مشارکتی + ۱ ماژول‌ها */
  get tableColspan(): number {
    return 8 + this.listCells.length + (this.showModulesColumn ? 1 : 0);
  }

  private _listContribKey = '';
  private _listCells: CompanyListCell[] = [];
  private _cardGridCells: CompanyListCell[] = [];
  private _cardRowCells: CompanyListCell[] = [];
  private _rowActions: CompanyRowAction[] = [];

  /** ستون‌ها و دکمه‌های ردیفِ مشارکتی فهرست، یک بار برای هر مجموعهٔ ماژول‌های نصب‌شده (کش برای ردیابی پایدار ngFor) */
  private refreshListContributions(): void {
    const exts = this.moduleRegistry.getExtensions('companies');
    const key = exts.map(e => e.moduleCode).join(',');
    if (key === this._listContribKey) return;
    this._listContribKey = key;
    this._listCells = exts.flatMap(e => e.extension.listCells || []).sort((a, b) => a.order - b.order);
    this._cardGridCells = this._listCells.filter(c => c.cardPlacement === 'grid');
    this._cardRowCells = this._listCells.filter(c => c.cardPlacement !== 'grid');
    this._rowActions = exts.flatMap(e => e.extension.rowActions || []);
  }

  /** ستون‌های مشارکتی جدول دسکتاپ (listCells) به ترتیب order */
  get listCells(): CompanyListCell[] {
    this.refreshListContributions();
    return this._listCells;
  }

  /** سلول‌های مشارکتی کارت موبایل در جدول دوستونی مشخصات */
  get cardGridCells(): CompanyListCell[] {
    this.refreshListContributions();
    return this._cardGridCells;
  }

  /** سلول‌های مشارکتی کارت موبایل در ردیف کامل زیر مشخصات */
  get cardRowCells(): CompanyListCell[] {
    this.refreshListContributions();
    return this._cardRowCells;
  }

  /** دکمه‌های مشارکتی ردیف فهرست که تبی از استودیو را باز می‌کنند */
  get rowActions(): CompanyRowAction[] {
    this.refreshListContributions();
    return this._rowActions;
  }

  /** جای تب‌های هسته؛ تب مشارکتی با `order` خودش میان آن‌ها می‌نشیند (§۵-۴) */
  private static readonly CORE_TAB_ORDER: Record<string, number> = {
    identity: 10, documents: 50, projects: 55, access: 60, workflow: 70
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
  readonly sectionSlots: CompanyStudioSection['slot'][] = ['identity', 'documents'];

  /** بخش‌های مشارکتی یک تب هسته (studioSections) به ترتیب order؛ در حالت محدود بخشِ «هیچ» کنار می‌رود */
  sectionsFor(slot: CompanyStudioSection['slot']): CompanyStudioSection[] {
    return this.moduleRegistry.getExtensions('companies')
      .flatMap(e => e.extension.studioSections || [])
      .filter(sec => sec.slot === slot && this.isContributionVisible(sec))
      .sort((a, b) => a.order - b.order);
  }

  // ─── حالت محدود (ق۳): تب و بخش بر پایهٔ سطح کاربر در بخش‌های مجوز شرکت ───
  private static readonly FORM_FIELD_KEYS = Object.keys(buildCompanyPayload({ code: '', name: '' }));

  /** حوزهٔ اطلاعات هر تب هسته؛ تب‌های هویتی و مدارک بخش مشارکتی هم دارند */
  private static readonly CORE_TAB_SECTION: Record<string, string> = {
    identity: 'identity', documents: 'founding_docs', projects: 'projects', access: 'user_access'
  };

  canReadSection(key: string): boolean {
    return this.actorLevel(key) !== 'none';
  }

  canWriteSection(key: string): boolean {
    return this.actorLevel(key) === 'write';
  }

  private isContributionVisible(item: { permissionSection?: string }): boolean {
    return !item.permissionSection || this.canReadSection(item.permissionSection);
  }

  /** بخش هستهٔ یک تب (مثلاً هویتی) دیدنی است؛ تب مدارک یا بیمه ممکن است فقط بخش مشارکتی داشته باشد */
  isCoreSectionVisible(tab: string): boolean {
    const section = CompaniesManagementComponent.CORE_TAB_SECTION[tab];
    return !section || this.canReadSection(section);
  }

  /** تب هسته‌ای که سطح «خواندن» دارد: فیلدها غیرفعال‌اند */
  isCoreTabReadonly(tab: string): boolean {
    const section = CompaniesManagementComponent.CORE_TAB_SECTION[tab];
    return !!section && !this.canWriteSection(section);
  }

  /** دکمهٔ ذخیرهٔ مشخصات فقط وقتی دست‌کم یک فیلد شرکت نوشتنی است */
  get canSaveCompany(): boolean {
    if (!this.isRestricted) return true;
    // فقط فیلدهای فرم مشخصات (اسناد مادر و لوگو بارگذاری جدا دارند)
    const fields = this.permissionSpec?.fields || {};
    return CompaniesManagementComponent.FORM_FIELD_KEYS.some(k => !!fields[k] && this.canWriteSection(fields[k]));
  }

  /** فیلد فرم مشخصات در حالت محدود نوشتنی است (نگاشت فیلد ← بخش از سرور) */
  canWriteField(key: string): boolean {
    if (!this.isRestricted || this.isSuperuserActor) return true;
    const section = this.permissionSpec?.fields?.[key];
    return !!section && this.canWriteSection(section);
  }

  /**
   * حالت محدود: بدنهٔ PATCH فقط از فیلدهای تغییرکرده (نسبت به آخرین دادهٔ سرور) ساخته می‌شود تا مقدار کهنهٔ
   * فیلدهای دیگر روی تغییر تازهٔ سرور ننشیند. تغییرِ فیلد غیرنوشتنی بی‌صدا کنار نمی‌رود: ذخیره با پیام متوقف می‌شود.
   * null یعنی ارسال نشود (پیام نمایش داده شده است).
   */
  private restrictedChanges(): Record<string, unknown> | null {
    if (!this.permissionSpec?.fields) {
      this.toast.error('نگاشت فیلدها و مجوزها دریافت نشده است؛ صفحه را دوباره باز کنید.');
      return null;
    }
    const before: Record<string, unknown> = this.studioSnapshot ? buildCompanyPayload(JSON.parse(this.studioSnapshot)) : {};
    const now: Record<string, unknown> = buildCompanyPayload(this.companyModal.data);
    const changed = Object.keys(now).filter(k => JSON.stringify(now[k]) !== JSON.stringify(before[k]));
    if (changed.some(k => !this.canWriteField(k))) {
      this.toast.error('برخی تغییرها در حوزه‌هایی است که مجوز نوشتنش را ندارید؛ ذخیره انجام نشد.');
      return null;
    }
    const logoChanged = !!this.selectedLogoFile || this.isLogoCleared;
    if (changed.length === 0 && !logoChanged) {
      this.toast.info('تغییری برای ذخیره وجود ندارد.');
      return null;
    }
    // اعتبارسنجی فقط برای فیلدهای ارسالی؛ فیلد پنهان یا فقط‌خواندنی ذخیره را قفل نمی‌کند
    this.validateCompanyForm();
    const errors = Object.fromEntries(Object.entries(this.companyModal.errors).filter(([k]) => changed.includes(k)));
    this.companyModal = { ...this.companyModal, errors };
    if (Object.keys(errors).length > 0) {
      this.toast.error('برخی فیلدها خطا دارند؛ موارد مشخص‌شده را اصلاح کنید.');
      this.cdr.markForCheck();
      return null;
    }
    return Object.fromEntries(changed.map(k => [k, now[k]]));
  }

  /** سطح کاربر در بخشی از یک شرکتِ فهرست (حالت محدود از section_levels همان ردیف) */
  companyCanRead(company: Company, key: string): boolean {
    if (!this.isRestricted || this.isSuperuserActor) return true;
    return (company.section_levels?.[key] ?? 'none') !== 'none';
  }

  /** دکمه‌های مشارکتی ردیف که تب مقصدشان برای همین شرکت دیدنی است */
  rowActionsFor(company: Company): CompanyRowAction[] {
    if (!this.isRestricted || this.isSuperuserActor) return this.rowActions;
    return this.rowActions.filter(a => {
      const section = this.contributedTab(a.tab)?.permissionSection;
      return !section || this.companyCanRead(company, section);
    });
  }

  backToLauncher(): void {
    this.router?.navigate(['/app/launcher']);
  }

  /** نخستین تبِ دیدنی (وقتی تب درخواستی در حالت محدود بسته است) */
  private firstAvailableTab(): string {
    return this.modalTabs[0]?.id || 'identity';
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
    if (contributed) return !(contributed.hiddenUntilSaved && !this.hasSavedCompany) && this.isContributionVisible(contributed);
    if (!(tab in CompaniesManagementComponent.CORE_TAB_ORDER)) return false;
    // تب «هیچ» در حالت محدود رندر نمی‌شود، مگر بخش مشارکتیِ دیدنی داشته باشد
    return this.isCoreSectionVisible(tab)
      || ((this.sectionSlots as string[]).includes(tab) && this.sectionsFor(tab as CompanyStudioSection['slot']).length > 0);
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
    // شمارندهٔ تب «مدارک» از بخش مشارکتی بایگانی (studioSections) از راه context می‌آید
    const documentsCount = this.studioContext.count('documents');
    const levelsKey = this.isRestricted ? JSON.stringify(this.actorLevels) : '';
    const projectsKey = `${this.studioContext.count('projects') ?? ''}:${this.studioContext.hasError('projects')}`;
    const key = `${documentsCount ?? ''}_${this.studioAccesses.length}_${[...errorTabs].join(',')}_${contributedKey}_${levelsKey}_${projectsKey}`;
    if (this._modalTabsKey === key && this._cachedModalTabs.length > 0) {
      return this._cachedModalTabs;
    }
    this._modalTabsKey = key;
    const errorIndicator = { tone: 'rose' as const, label: 'دارای خطا' };
    const tabs: TabDef[] = [
      { id: 'identity', label: 'مشخصات هویتی و ثبتی', shortLabel: 'هویتی', icon: this.icons.company, indicator: errorTabs.has('identity') ? errorIndicator : undefined },
    ];
    tabs.push({ id: 'documents', label: 'بایگانی مدارک', shortLabel: 'مدارک', icon: 'book', count: documentsCount });
    // ساختار سازمانی زیر شرکت (پروژه ← بخش) و انتساب کاربران؛ شمارنده و نشان خطا از کامپوننت تب می‌آید
    tabs.push({
      id: 'projects', label: 'پروژه‌ها و بخش‌ها', shortLabel: 'پروژه‌ها', icon: this.icons.projects,
      count: this.studioContext.count('projects'),
      indicator: this.studioContext.hasError('projects') ? errorIndicator : undefined
    });
    tabs.push({ id: 'access', label: 'دسترسی کاربران', shortLabel: 'دسترسی', icon: this.icons.permissions, count: this.studioAccesses.length || undefined });
    tabs.push({ id: 'workflow', label: 'گردش کار', shortLabel: 'گردش', icon: 'activity-path' });
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
    this._cachedModalTabs = tabs.filter(t => this.isTabAvailable(t.id));
    return this._cachedModalTabs;
  }

  /** تب‌هایی که فیلد خطادار دارند (خطای اعتبارسنجی یا خطای فیلدی سرور) */
  private errorTabs(): Set<string> {
    const tabs = new Set<string>();
    for (const field of Object.keys(this.companyModal.errors || {})) {
      tabs.add(this.tabForField(field));
    }
    return tabs;
  }

  /** همهٔ فیلدهای فرم مشخصات شرکت در تب هویتی‌اند */
  private tabForField(_field: string): string {
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
  /** تب «پروژه‌ها و بخش‌ها» یک بار ساخته و سپس با hidden نگه داشته می‌شود تا فرم نیمه‌کاره و فیلترها نروند */
  projectsTabOpened = false;
  /** شمارندهٔ بازسازی بلوک defer تب پروژه‌ها پس از شکست بارگذاری */
  projectsTabAttempt = 0;

  retryProjectsTab(): void {
    this.projectsTabAttempt++;
    this.cdr.markForCheck();
  }

  private onTabActivated(tab: string): void {
    if (tab === 'projects' && !this.actorLevelsLoading && this.isTabAvailable('projects')) this.projectsTabOpened = true;
    // فهرست کاربران فقط برای فرم تخصیص (نوشتن دسترسی کاربران) لازم است
    if (tab === 'access' && !this.actorLevelsLoading && this.canWriteSection('user_access')) {
      this.ensureSystemUsers();
    }
  }

  /** تلاش دوباره برای دریافت دادهٔ تبی که خطا داده است */
  retryTab(tab: string): void {
    const id = this.companyModal.data.id;
    if (!id) return;
    switch (tab) {
      case 'access': this.loadStudioAccesses(id); break;
    }
  }

  setModalTab(tab: string): void {
    if (!this.isTabAvailable(tab)) tab = this.firstAvailableTab();
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
          this.router?.navigate([this.listUrl], { replaceUrl: true });
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
        if (this.isKnownTab(tabParam) && (this.isTabAvailable(tabParam) || this.actorLevelsLoading)) {
          // در حالت محدود تا رسیدن سطح‌ها تب درخواستی نگه داشته می‌شود؛ پس از رسیدن دوباره سنجیده می‌شود
          this.activeModalTab = tabParam as any;
          this.onTabActivated(tabParam);
        } else {
          // تب ناشناخته یا پیوند مستقیم به تب ماژولی که نصب نیست: بازگشت به تب مشخصات
          this.setModalTab(this.firstAvailableTab());
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
    // حالت محدود: سطح‌های خود کاربر در این شرکت و نگاشت فیلدها پیش از رندر تب‌ها لازم‌اند
    const restricted = this.isRestricted && !this.isSuperuserActor;
    const levels$: Observable<CompanySectionLevels | null> = restricted
      ? this.api.getUserAvailable('manage').pipe(map(res => (res?.companies || []).find(c => c.id === companyId)?.section_levels || {}))
      : of(null);
    const spec$: Observable<CompanyPermissionSpec | null> = this.permissionSpec?.fields || !restricted
      ? of(this.permissionSpec)
      : this.api.getPermissionSections();
    this.actorLevelsLoading = restricted;
    forkJoin({ comp: this.api.getById(companyId), levels: levels$, spec: spec$ }).subscribe({
      next: ({ comp, levels, spec }) => {
        this.studioLoading = false;
        this.actorLevelsLoading = false;
        if (spec) this.permissionSpec = spec;
        if (restricted && !this.permissionSpec?.fields) {
          // پاسخ کهنهٔ کش بدون نگاشت فیلدها: ذخیرهٔ ناقص ممکن است، پس بارگذاری با «تلاش دوباره» متوقف می‌شود
          this.studioLoadError = true;
          this.cdr.markForCheck();
          return;
        }
        this.actorLevels = levels ? { ...levels } : {};
        this.studioContext.sectionLevels.set(restricted ? { ...this.actorLevels } : null);
        if (restricted && !Object.values(this.actorLevels).some(l => l !== 'none')) {
          this.toast.error('به هیچ حوزه‌ای از اطلاعات این شرکت دسترسی ندارید.');
          this.router?.navigate([this.listUrl], { replaceUrl: true });
          return;
        }
        if (comp) {
          this.populateStudioData(comp);
          if (!this.isTabAvailable(this.activeModalTab)) this.setModalTab(this.firstAvailableTab());
          else this.onTabActivated(this.activeModalTab);
        } else {
          this.studioLoadError = true;
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.studioLoading = false;
        this.actorLevelsLoading = false;
        if (err?.status === 404) {
          this.toast.error('شرکت مورد نظر یافت نشد.');
          this.router?.navigate([this.listUrl], { replaceUrl: true });
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
    this.studioAccesses = [];
    this.regDateControl.setValue('', { emitEvent: false });
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
      articles_of_association: company.articles_of_association || null,
      latest_gazette: company.latest_gazette || null,
      is_active: company.is_active,
      // کلید ماژول‌ها فقط در حالت کامل مدیر کل فرستاده می‌شود (سرور برای دیگران 403 می‌دهد)
      ...(this.isRestricted ? {} : { disabled_modules: [...(company.disabled_modules || [])] }),
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
    this.regDateControl.setValue(company.registration_date || '', { emitEvent: false });

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

    // دادهٔ تب دسترسی یک بار برای هر شرکت دریافت می‌شود (برای شمارندهٔ تب)؛ کلیک تب دوباره دریافت نمی‌کند.
    // تب‌ها و بخش‌های مشارکتی دادهٔ خودشان را با ورودی companyId می‌گیرند.
    if (company.id && this.canReadSection('user_access')) {
      this.loadStudioAccesses(company.id);
    }

    this.viewMode = 'studio';
    this.cdr.markForCheck();
  }

  openCreateModal(): void {
    if (this.router) {
      this.router.navigate([`${this.listUrl}/new`]);
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
      this.router.navigate([this.listUrl, company.id], {
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
      this.router.navigate([this.listUrl]).then((ok) => {
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
    this.studioAccesses = [];
    this.studioSelectedUserId = null;
    this.userSearchQuery = '';
    this.isUserListOpen = false;
    this.isRegDatePickerOpen = false;
    this.isBoardDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  // پیش‌نمایش مدارک اصلی (اساسنامه و روزنامه رسمی) در لایت‌باکس مشترک
  openCoreDocPreview(docKey: 'articles_of_association' | 'latest_gazette', title: string): void {
    const url = this.companyModal.data[docKey];
    if (!url) {
      this.toast.warning(`فایل ${title} هنوز بارگذاری نشده است.`);
      return;
    }
    this.docPreview?.open({ title, url });
  }

  downloadFile(url?: string | null, filename?: string): void {
    if (url) {
      void saveUrl(url, filename);
    }
  }

  /** D6: یک نسخه در companies.helpers.ts */
  isNationalIdChecksumValid(id?: string | null): boolean {
    return nationalIdChecksumValid(id);
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

  /** فیلدهای شناسه‌ای: رقم فارسی و عربی هنگام تایپ لاتین می‌شود (ت۷) */
  onDigitsInput(field: 'national_id' | 'economic_code' | 'registration_number' | 'phone' | 'postal_code', value: string): void {
    this.companyModal.data[field] = normalizeDigits(value ?? '');
    this.clearFieldError(field);
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
    ];
    for (const [field, len, msg] of exactDigits) {
      const v = val(d[field] as string);
      if (v && !new RegExp(`^\\d{${len}}$`).test(v)) errors[field as string] = msg;
    }
    const regNo = val(d.registration_number);
    if (regNo && !/^\d+$/.test(regNo)) errors['registration_number'] = 'فقط رقم وارد کنید.';
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
      if (!this.canWriteSection('identity')) {
        resolve(false);
      } else if (this.selectedLogoFile) {
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
    // حالت محدود: فقط فیلدهای تغییرکرده و نوشتنی فرستاده می‌شوند (نه کل فرم)
    const restrictedBody = this.isRestricted && !this.isSuperuserActor && this.companyModal.isEdit
      ? this.restrictedChanges()
      : undefined;
    if (restrictedBody === null) {
      return;
    }
    if (restrictedBody === undefined && !this.validateCompanyForm()) {
      return;
    }

    this.companyModal.isSubmitting = true;
    const d = this.companyModal.data;
    const sentDataJson = JSON.stringify(d);
    const payload = buildCompanyPayload(d);

    if (this.companyModal.isEdit && this.companyModal.data.id) {
      const companyId = this.companyModal.data.id;
      const request$ = restrictedBody
        ? this.api.patch(companyId, restrictedBody as Partial<Company>)
        : this.api.update(companyId, payload);
      request$.subscribe({
        next: (updated: any) => {
          this.companyModal.isSubmitting = false;
          if (this.isPendingRecord(updated)) {
            // پاسخ خوش‌بینانهٔ صف آفلاین شناسهٔ موقت دارد؛ داده‌های فرم همان چیزی است که در صف رفت
            this.isQueuedSave = true;
            this.takeStudioSnapshot();
            this.toast.info(`ویرایش «${d.name || 'شرکت'}» در صف ارسال است و پس از اتصال ثبت می‌شود.`);
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
              this.router.navigate([this.listUrl, created.id], {
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
    this.deleteModal = {
      isOpen: true,
      target: company,
      isDeleting: false,
      impactUrl: this.api.deleteImpactUrl(company.id),
      errorMessage: ''
    };
  }

  closeDeleteModal(): void {
    if (this.deleteModal.isDeleting) return;
    this.deleteModal.isOpen = false;
    this.deleteModal.target = null;
    this.deleteModal.errorMessage = '';
  }

  executeDelete(): void {
    const target = this.deleteModal.target;
    if (!target || this.deleteModal.isDeleting) return;
    // اگر در فاصلهٔ باز بودن پنجره اتصال قطع شده باشد، حذف آبشاری در صف آفلاین نمی‌رود
    if (!this.requireOnline('حذف شرکت')) return;
    // اثری که به کاربر نشان داده شده همراه حذف می‌رود؛ اگر سوابق وابسته در این فاصله تغییر کرده باشد سرور ۴۰۹ می‌دهد
    const shownImpact = this.smartDeleteModal?.impactLoaded ? this.smartDeleteModal.totalAffected : undefined;
    this.deleteModal.isDeleting = true;
    this.deleteModal.errorMessage = '';
    this.api.delete(target.id, shownImpact).subscribe({
      next: () => {
        this.deleteModal.isDeleting = false;
        this.toast.success(`شرکت «${target.name}» با موفقیت حذف شد.`);
        this.closeDeleteModal();
        this.loadCompanies();
        this.activeCompanyService.loadAvailableCompanies().subscribe();
      },
      error: (err) => {
        this.deleteModal.isDeleting = false;
        this.deleteModal.errorMessage = this.deleteErrorMessage(err);
        if (err?.status === 409) {
          // اثر تازه دوباره خوانده می‌شود تا کاربر پیش از حذف، فهرست درست را ببیند
          this.smartDeleteModal?.fetchImpact();
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** پیشنهاد جایگزین حذف: شرکت غیرفعال می‌شود و همهٔ سوابقش می‌مانند */
  deactivateInsteadOfDelete(): void {
    const target = this.deleteModal.target;
    if (!target || this.deleteModal.isDeleting) return;
    if (!this.requireOnline('غیرفعال کردن شرکت')) return;
    this.deleteModal.isDeleting = true;
    this.deleteModal.errorMessage = '';
    this.api.patch(target.id, { is_active: false }).subscribe({
      next: () => {
        this.deleteModal.isDeleting = false;
        this.toast.success(`شرکت «${target.name}» غیرفعال شد و سوابق آن حفظ شد.`);
        this.closeDeleteModal();
        this.loadCompanies();
        this.activeCompanyService.loadAvailableCompanies().subscribe();
      },
      error: (err) => {
        this.deleteModal.isDeleting = false;
        this.deleteModal.errorMessage = this.deleteErrorMessage(err, 'خطا در غیرفعال کردن شرکت');
        this.cdr.markForCheck();
      }
    });
  }

  /** پیام خطای حذف از پاسخ DRF: detail، error (DeleteImpactMixin) یا فهرست ValidationError */
  private deleteErrorMessage(err: any, fallback = 'خطا در حذف شرکت'): string {
    if (isServerUnreachable(err?.status ?? 0)) return 'سرور در دسترس نیست. پس از برقراری اتصال دوباره تلاش کنید.';
    const body = err?.error;
    if (Array.isArray(body) && typeof body[0] === 'string') return body[0];
    if (typeof body?.detail === 'string') return body.detail;
    if (typeof body?.error === 'string') return body.error;
    return fallback;
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

  // ورود از اکسل (F4): فقط superuser و فقط ساخت شرکت تازه
  isExcelModalOpen = false;

  get canImportExcel(): boolean {
    return this.activeCompanyService.isSuperuser;
  }

  excelImportFn = (file: File, _updateExisting: boolean, dryRun?: boolean) => this.api.importExcel(file, !!dryRun);

  excelTemplateFn = () => {
    this.api.downloadImportTemplate().subscribe({
      next: (blob) => void saveBlob(blob, 'companies_import_template.xlsx'),
      error: () => this.toast.error('خطا در دریافت الگوی اکسل شرکت‌ها')
    });
  };

  onExcelImported(result: { success?: boolean; summary?: { created?: number } }): void {
    if (result?.summary?.created) {
      this.loadCompanies();
      this.activeCompanyService.loadAvailableCompanies();
    }
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.cdr.markForCheck();
  }

  /** شمارنده و ردیف با رقم فارسی (ت۷) */
  fa(n: number | null | undefined): string {
    return CompaniesManagementComponent.FA_NUMBER.format(n ?? 0);
  }

  get studioTitle(): string {
    if (!this.companyModal.isEdit) return 'ثبت شرکت جدید';
    if (this.studioLoading) return 'در حال بارگذاری شرکت…';
    return this.companyModal.data.name || 'شرکت';
  }

  /** مبلغ و شمار سهام: نمایش با جداکنندهٔ فارسی، مقدار عددی در مدل (A20) */
  formatAmount(value: number | null | undefined): string {
    return value === null || value === undefined ? '' : CompaniesManagementComponent.FA_NUMBER.format(value);
  }

  onAmountInput(field: 'registered_capital' | 'shares_count' | 'share_nominal_value', event: Event): void {
    const el = event.target as HTMLInputElement;
    const caret = el.selectionStart ?? el.value.length;
    const digitsBeforeCaret = normalizeDigits(el.value.slice(0, caret)).replace(/[^0-9]/g, '').length;
    const digits = normalizeDigits(el.value || '').replace(/[^0-9]/g, '');
    const value = digits ? Number(digits) : null;
    // عدد بزرگ‌تر از دقت ممیز شناور پذیرفته نمی‌شود و مقدار پیشین می‌ماند
    if (value === null || Number.isSafeInteger(value)) {
      this.companyModal.data[field] = value;
    }
    const formatted = this.formatAmount(this.companyModal.data[field]);
    el.value = formatted;
    // نشانگر پس از همان شمار رقم بماند تا ویرایش وسط عدد آن را به انتها نبرد
    let pos = 0;
    for (let seen = 0; pos < formatted.length && seen < digitsBeforeCaret; pos++) {
      if (/[0-9\u06F0-\u06F9]/.test(formatted[pos])) seen++;
    }
    if (document.activeElement === el) el.setSelectionRange(pos, pos);
  }

  userDisplayName(u: User): string {
    return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
  }

  /** کاربرانی که هنوز به این شرکت دسترسی ندارند، با جستجوی نام و نام کاربری («ي/ك» یکسان) */
  get availableSystemUsers(): User[] {
    const taken = new Set(this.studioAccesses.map(a => a.user));
    const q = this.normalizeSearch(this.userSearchQuery);
    return this.systemUsers.filter(u => {
      if (taken.has(u.id)) return false;
      if (!q) return true;
      return this.normalizeSearch(`${u.username || ''} ${u.first_name || ''} ${u.last_name || ''}`).includes(q);
    });
  }

  private normalizeSearch(text: string): string {
    return normalizeDigits(text || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();
  }

  retrySystemUsers(): void {
    this.systemUsersError = false;
    this.ensureSystemUsers();
  }

  openUserList(): void {
    this.ensureSystemUsers();
    this.isUserListOpen = true;
  }

  onUserSearchInput(value: string): void {
    this.userSearchQuery = value;
    // نوشتن متن تازه انتخاب پیشین را باطل می‌کند تا متن و کاربر انتخاب‌شده ناهماهنگ نشوند
    this.studioSelectedUserId = null;
    this.userActiveIndex = -1;
    this.openUserList();
  }

  onUserComboKeydown(event: KeyboardEvent): void {
    const list = this.availableSystemUsers;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.isUserListOpen) this.openUserList();
      if (list.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.userActiveIndex = (this.userActiveIndex + step + list.length) % list.length;
    } else if (event.key === 'Enter') {
      if (this.isUserListOpen && this.userActiveIndex >= 0 && list[this.userActiveIndex]) {
        event.preventDefault();
        this.selectStudioUser(list[this.userActiveIndex]);
      }
    } else if (event.key === 'Escape' && this.isUserListOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.isUserListOpen = false;
      this.userActiveIndex = -1;
    }
  }

  onUserComboFocusOut(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (container && next && container.contains(next)) return;
    this.isUserListOpen = false;
    this.userActiveIndex = -1;
  }

  selectStudioUser(u: User): void {
    this.studioSelectedUserId = u.id;
    this.userSearchQuery = this.userDisplayName(u);
    this.isUserListOpen = false;
    this.userActiveIndex = -1;
  }

  clearSelectedUser(): void {
    this.studioSelectedUserId = null;
    this.userSearchQuery = '';
    this.userActiveIndex = -1;
  }

  /** فهرست کاربران سامانه فقط وقتی تب «دسترسی» باز می‌شود، یک بار دریافت می‌شود */
  private ensureSystemUsers(): void {
    if (this.systemUsersRequested || !this.accountsHttp) return;
    this.systemUsersRequested = true;
    this.accountsHttp.getUsers().subscribe({
      next: (users) => {
        this.systemUsers = users;
        this.systemUsersLoaded = true;
        this.systemUsersError = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.systemUsersRequested = false;
        this.systemUsersError = true;
        this.cdr.markForCheck();
      }
    });
  }

  loadStudioAccesses(companyId: number): void {
    this.isLoadingStudioAccesses = true;
    this.loadPermissionExtras(companyId);
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
      section_levels: this.studioTemplate ? this.templateLevels(this.studioTemplate) : {},
      role_in_company: this.studioRoleInCompany.trim() || null,
      is_default: this.studioIsDefaultAccess
    }).subscribe({
      next: (created) => {
        this.toast.success('دسترسی کاربر با موفقیت ثبت شد.');
        this.studioSelectedUserId = null;
        this.userSearchQuery = '';
        this.studioRoleInCompany = '';
        this.studioTemplate = '';
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
        const msg = isServerUnreachable(err?.status ?? 0) ? this.permissionWriteUnreachable() : (err.error?.detail || err.error?.non_field_errors?.[0] || 'خطا در ثبت دسترسی کاربر به شرکت');
        this.toast.error(msg);
      }
    });
  }

  // ─── مجوزهای بخش‌به‌بخش شرکت (طرح مجوزهای شرکت، گام ۱۰) ───
  /** پاسخ تغییر مجوز نرسید؛ پس از برقراری اتصال فهرست دوباره دریافت می‌شود (شاید روی سرور اعمال شده باشد) */
  private accessRefreshOnReconnect = false;

  private permissionWriteUnreachable(): string {
    this.accessRefreshOnReconnect = true;
    return 'اتصال به سرور برقرار نیست؛ تغییر مجوز فقط برخط انجام می‌شود و ممکن است ثبت نشده باشد. پس از اتصال، فهرست خودکار تازه می‌شود.';
  }

  permissionSpec: CompanyPermissionSpec | null = null;
  companyMembers: CompanyMember[] = [];
  studioTemplate = '';
  editingAccessId: number | null = null;
  editingLevels: CompanySectionLevels = {};
  savingLevels = false;
  membersLoading = false;
  permissionExtrasError = false;

  get isSuperuserActor(): boolean {
    return this.activeCompanyService.isSuperuser;
  }

  get permissionSections(): CompanyPermissionSection[] {
    return this.permissionSpec?.sections || [];
  }

  get permissionTemplates(): CompanyPermissionSpec['templates'] {
    return this.permissionSpec?.templates || [];
  }

  /** سطح خودِ کاربرِ جاری در هر بخش همین شرکت (سقف اعطا؛ §۵-۱). superuser همه را می‌نویسد */
  actorLevels: CompanySectionLevels = {};

  actorLevel(key: string): SectionLevel {
    // حالت کامل فقط برای مدیر کل است (OperationsGuard)
    if (this.isSuperuserActor || !this.isRestricted) return 'write';
    return this.actorLevels[key] || 'none';
  }

  private static readonly LEVEL_RANK: Record<SectionLevel, number> = { none: 0, read: 1, write: 2 };

  /** گزینهٔ بالاتر از سطح خود کاربر قفل است (سقف «نوشتن دسترسی کاربران») */
  isLevelAboveActor(key: string, level: SectionLevel): boolean {
    const rank = CompaniesManagementComponent.LEVEL_RANK;
    return rank[level] > rank[this.actorLevel(key)];
  }

  /** فرم «تخصیص دسترسی» فقط برای دارندهٔ «نوشتن» دسترسی کاربران */
  get canWriteAccess(): boolean {
    return this.actorLevel('user_access') === 'write';
  }

  /** ردیفی که در بخشی از کاربر جاری بالاتر است یا ردیف خودش است، فقط با مدیر کل تغییر می‌کند */
  canEditAccessRow(acc: UserCompanyAccess): boolean {
    return this.accessRowLockReason(acc) === null;
  }

  /** علت قفل بودن ویرایش یا لغو یک ردیف (همان قاعدهٔ سرور در _ensure_can_grant)؛ null یعنی آزاد */
  accessRowLockReason(acc: UserCompanyAccess): string | null {
    if (this.isPendingRecord(acc)) return 'پس از ارسال به سرور قابل تغییر است';
    if (this.isSuperuserActor) return null;
    if (this.actorLevel('user_access') !== 'write') return 'مجوز «نوشتن دسترسی کاربران» این شرکت را ندارید';
    if (acc.user === getStoredCurrentUserId()) return 'دسترسی خودتان را نمی‌توانید تغییر دهید';
    const levels = acc.section_levels || {};
    const sensitiveKeys = new Set(this.permissionSections.filter(s => s.sensitive).map(s => s.key));
    if (Object.entries(levels).some(([k, v]) => sensitiveKeys.has(k) && v !== 'none')) {
      return 'این کاربر کار حساس دارد؛ فقط مدیر کل سامانه تغییرش می‌دهد';
    }
    if (Object.entries(levels).some(([k, v]) => this.isLevelAboveActor(k, v))) {
      return 'سطح این کاربر در حوزه‌ای از سطح شما بالاتر است';
    }
    return null;
  }

  /** مجوزهای کاربر جاری در شرکت هنوز دریافت نشده است (فرم تخصیص تا آن زمان نشان داده نمی‌شود) */
  actorLevelsLoading = false;

  private isStudioCompany(companyId: number): boolean {
    return this.companyModal.data.id === companyId;
  }

  private loadPermissionExtras(companyId: number): void {
    this.permissionExtrasError = false;
    this.permissionExtrasOffline = false;
    // سطح‌های خود کاربر در setupStudioForCompany همراه شرکت دریافت می‌شوند
    if (!this.permissionSpec) {
      this.api.getPermissionSections().subscribe({
        next: (spec) => { this.permissionSpec = spec; this.cdr.markForCheck(); },
        error: () => { this.permissionExtrasError = true; this.cdr.markForCheck(); }
      });
    }
    this.membersLoading = true;
    this.api.getCompanyMembers(companyId).subscribe({
      next: (members) => {
        if (!this.isStudioCompany(companyId)) return;
        this.companyMembers = members || [];
        this.membersLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (!this.isStudioCompany(companyId)) return;
        this.companyMembers = [];
        this.membersLoading = false;
        this.permissionExtrasError = true;
        this.permissionExtrasOffline = isServerUnreachable(err?.status ?? 0);
        this.cdr.markForCheck();
      }
    });
  }

  /** خطای دریافت اعضا از قطع اتصال است (پیام جدا) */
  permissionExtrasOffline = false;

  /** سطح‌های قالب، بریده‌شده به سطح خود کاربر جاری (سرور هم همین سقف را می‌سنجد) */
  templateLevels(key: string): CompanySectionLevels {
    const levels = { ...(this.permissionTemplates.find(t => t.key === key)?.levels || {}) };
    for (const [k, v] of Object.entries(levels)) {
      if (this.isLevelAboveActor(k, v)) levels[k] = this.actorLevel(k);
    }
    return levels;
  }

  // آرایه‌های ثابت تا ngFor گزینه‌ها را در هر دور تشخیص تغییر از نو نسازد
  private static readonly ACTION_OPTIONS: { value: SectionLevel; label: string }[] =
    [{ value: 'none', label: 'ندارد' }, { value: 'write', label: 'مجاز' }];
  private static readonly LEVEL_OPTIONS: { value: SectionLevel; label: string }[] =
    [{ value: 'none', label: 'هیچ' }, { value: 'read', label: 'فقط خواندن' }, { value: 'write', label: 'نوشتن' }];

  levelOptions(section: CompanyPermissionSection): { value: SectionLevel; label: string }[] {
    return section.kind === 'action'
      ? CompaniesManagementComponent.ACTION_OPTIONS
      : CompaniesManagementComponent.LEVEL_OPTIONS;
  }

  levelLabel(section: CompanyPermissionSection, level?: SectionLevel): string {
    return this.levelOptions(section).find(o => o.value === (level || 'none'))?.label || 'هیچ';
  }

  /** خلاصهٔ مجوزهای یک ردیف برای جدول و کارت */
  accessSummary(acc: UserCompanyAccess): string {
    // بی فهرست بخش‌ها (در حال دریافت یا خطا) ادعای «بدون مجوز» نادرست است
    if (!this.permissionSpec) return '—';
    const levels = acc.section_levels || {};
    const granted = this.permissionSections.filter(s => (levels[s.key] || 'none') !== 'none');
    if (granted.length === 0) return 'فقط پیوند (بدون مجوز حوزه)';
    return `${this.fa(granted.length)} حوزه از ${this.fa(this.permissionSections.length)}`;
  }

  /** بخش حساس فقط با مدیر کل (ت۹) */
  canEditSection(section: CompanyPermissionSection): boolean {
    return !section.sensitive || this.isSuperuserActor;
  }

  startEditLevels(acc: UserCompanyAccess): void {
    if (!acc.id || this.isPendingRecord(acc)) return;
    this.editingAccessId = acc.id;
    this.editingLevels = { ...(acc.section_levels || {}) };
    this.cdr.markForCheck();
    // ویرایشگر هم در جدول دسکتاپ و هم در کارت موبایل هست؛ فوکوس به نمونهٔ دیدنی
    setTimeout(() => ['tpl_d', 'tpl_m']
      .map(p => document.getElementById(p + acc.id) as HTMLElement | null)
      .find(el => !!el?.offsetParent)?.focus());
  }

  cancelEditLevels(): void {
    const id = this.editingAccessId;
    this.editingAccessId = null;
    this.editingLevels = {};
    this.cdr.markForCheck();
    this.focusEditButton(id);
  }

  /** پس از بستن ویرایشگر فوکوس به دکمهٔ «ویرایش مجوزها» همان ردیف برمی‌گردد (WCAG 2.4.3) */
  private focusEditButton(accessId: number | null): void {
    if (accessId == null) return;
    setTimeout(() => Array.from(document.querySelectorAll<HTMLElement>(`[data-edit-access="${accessId}"]`))
      .find(el => !!el.offsetParent)?.focus());
  }

  applyTemplateToEditing(key: string, select?: HTMLSelectElement): void {
    if (select) select.value = '';
    if (!key) return;
    const next = this.templateLevels(key);
    // قالب‌ها کار حساس ندارند؛ مقدار فعلی بخش‌های حساس دست نمی‌خورد
    for (const s of this.permissionSections) {
      if (s.sensitive) next[s.key] = this.editingLevels[s.key] || 'none';
    }
    this.editingLevels = next;
    this.cdr.markForCheck();
  }

  setEditingLevel(key: string, value: SectionLevel): void {
    this.editingLevels = { ...this.editingLevels, [key]: value };
  }

  async saveEditLevels(acc: UserCompanyAccess): Promise<void> {
    if (!acc.id || this.savingLevels) return;
    const before = acc.section_levels || {};
    const sensitiveGrant = this.permissionSections.some(s =>
      s.sensitive && (this.editingLevels[s.key] || 'none') !== 'none' && (before[s.key] || 'none') !== this.editingLevels[s.key]);
    if (sensitiveGrant) {
      const ok = this.confirmDialog
        ? (await this.confirmDialog.open({
            title: 'اعطای کار حساس',
            message: 'این کاربر به کار حساس (مدارک محرمانه، شبا یا بستن دورهٔ مالی) دسترسی می‌گیرد. اطمینان دارید؟',
            type: 'danger',
            confirmText: 'اعطا',
            cancelText: 'انصراف'
          })) === true
        : window.confirm('اعطای کار حساس؟');
      if (!ok) return;
    }
    this.savingLevels = true;
    this.api.updateUserAccess(acc.id, { section_levels: this.editingLevels }).subscribe({
      next: (updated: UserCompanyAccess) => {
        this.savingLevels = false;
        this.studioAccesses = this.studioAccesses.map(a => a.id === acc.id ? { ...a, section_levels: updated.section_levels || this.editingLevels } : a);
        this.editingAccessId = null;
        this.toast.success('مجوز حوزه‌ها ذخیره شد.');
        this.cdr.markForCheck();
        this.focusEditButton(acc.id ?? null);
      },
      error: (err) => {
        this.savingLevels = false;
        this.toast.error(isServerUnreachable(err?.status ?? 0) ? this.permissionWriteUnreachable() : (err?.error?.detail || 'ذخیرهٔ مجوزها انجام نشد.'));
        this.cdr.markForCheck();
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
        this.toast.success('دسترسی کاربر با موفقیت لغو شد.');
        this.studioAccesses = this.studioAccesses.filter(a => a.id !== accessId);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.error(isServerUnreachable(err?.status ?? 0) ? this.permissionWriteUnreachable() : (err?.error?.detail || 'خطا در لغو دسترسی کاربر'));
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
      articles_of_association: null,
      latest_gazette: null,
      is_active: true,
      disabled_modules: [] as string[]
    };
  }
}
