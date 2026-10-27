import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, Optional, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { Observable, Subject, Subscription, concat, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, toArray } from 'rxjs/operators';
import { ProjectSection, PersonnelProfile, PersonnelBankAccount, PersonnelDocument, WorkflowAuditLog, isMaskedValue, stripMaskedSensitive } from '../../../../models/personnel.model';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';
import { ExcelImportModal } from '../../../../../../shared/components/excel-import-modal/excel-import-modal';
import { ImportResult } from '../../../../../../core/http/accounts-http.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import {
  PersonnelLocalDraft,
  deletePersonnelLocalDraft,
  listPersonnelLocalDrafts,
  newPersonnelLocalDraftId,
  personnelLocalDraftKey,
  savePersonnelLocalDraft
} from '../../../../../../core/services/offline-db';
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
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ServerUrlPipe } from '../../../../../../shared/pipes/server-url.pipe';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { ExternalLinkDirective } from '../../../../../../shared/directives/external-link.directive';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';

export type PersonnelStatusFilter = 'all' | 'draft' | 'pending' | 'pending_supervisor' | 'manager_approved' | 'approved' | 'revision_required' | 'rejected';
export type PersonnelModalTab = 'identity' | 'job' | 'banking' | 'address' | 'documents';

function stripMaskedValues<T extends Record<string, any>>(obj: T): T {
  return stripMaskedSensitive(obj);
}

/** شبای ستاره‌دار پیش از پاک‌سازی شناخته می‌شود (cleanShebaInput ستاره را حذف می‌کند) */
function shebaOrMasked(raw: unknown): string {
  const s = String(raw || '');
  return isMaskedValue(s) ? s : cleanShebaInput(s);
}

@Component({
  selector: 'app-employee-new-personnel-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelImportModal, SvgIconDirective, PersianDatePipe, ActionButtonComponent, TabBarComponent, ServerUrlPipe, ExternalLinkDirective, ModalComponent],
  templateUrl: './employee-new-personnel.html',
  styleUrl: './employee-new-personnel.css'
})
export class EmployeeNewPersonnelHubComponent implements OnInit, OnDestroy {
  private readonly confirmDialog = (() => { try { return inject(ConfirmDialogService); } catch { return undefined as unknown as ConfirmDialogService; } })();
  readonly Math = Math;

  // ─── مدیریت بخش و ایزولاسیون قلمرو (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  // ─── جدول نیروهای اخیراً ثبت‌شده بخش ───
  recentPersonnel: PersonnelProfile[] = [];
  isLoadingPersonnel: boolean = false;
  isSaving: boolean = false;
  isExportingExcel: boolean = false;
  isImportingExcel: boolean = false;
  searchQuery: string = '';
  statusFilter: PersonnelStatusFilter = 'all';
  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;
  private wsSub?: Subscription;

  // ─── مودال مقایسه و مشاهده تغییرات معلق (Diff Viewer Modal) ───
  isPendingDiffModalOpen: boolean = false;
  pendingDiffPersonnel: PersonnelProfile | null = null;
  isCancellingChangeRequest: boolean = false;

  // ─── ممیزی و تایملاین گردش کار (فاز ۷ - تسک ۷.۱) ───
  isTimelineModalOpen: boolean = false;
  timelinePersonnel: PersonnelProfile | null = null;
  timelineLogs: WorkflowAuditLog[] = [];
  isLoadingTimeline: boolean = false;

  // ─── وضعیت کپی سریع با تیک سبز ۲ ثانیه‌ای (فاز ۷ - تسک ۷.۱) ───
  copiedKey: string | null = null;
  private copiedTimeout: any = null;

  // ─── وضعیت باز بودن مودال ثبت پرسنل جدید ───
  isNewPersonnelModalOpen: boolean = false;
  editingPersonnel: PersonnelProfile | null = null;
  editingId: number | null = null;
  existingAttachmentUrl: string | null = null;
  wageFormattedDisplay: string = '';
  reviewedDraftIds: Set<number> = new Set<number>();

  // ─── مودال استاندارد ورود اطلاعات از فایل اکسل (مشابه projects-and-sections) ───
  isExcelModalOpen: boolean = false;
  excelModalTitle: string = 'آپلود و ثبت دسته‌جمعی پرسنل از فایل اکسل';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  get isLoading(): boolean {
    return this.isLoadingSections || this.isLoadingPersonnel;
  }

  // ─── تب فعال در مودال ثبت پرسنل (تسک ۶.۱) ───
  activeModalTab: PersonnelModalTab = 'identity';
  phoneError: string | null = null;
  postalCodeError: string | null = null;
  serverMissingFields: Array<{ field: string; label: string }> = [];
  isFoundPersonnelRejected: boolean = false;
  /** نام پروندهٔ یافت‌شده برای کاربر بدون دید کامل (پاسخ masked)؛ فقط نمایش */
  maskedLookupName: string | null = null;
  readonly maskedHint = 'برای دیدن کامل مجوز لازم است';

  isMasked(v: unknown): boolean {
    return isMaskedValue(v);
  }

  /** چاپ پروندهٔ ذخیره‌شده در سرور (تب جدید) */
  openPersonnelPrint(p: { id?: number } | null | undefined): void {
    if (!p?.id || p.id < 0) return;
    window.open(this.personnelApi.personnelProfilePrintUrl(p.id), '_blank', 'noopener');
  }

  formatFa(n: number | null | undefined): string {
    return new Intl.NumberFormat('fa-IR').format(n ?? 0);
  }

  /** تعداد مدارکی که کاربر نمی‌بیند (documents_count بزرگ‌تر از لیست دریافتی) */
  hiddenDocumentsCount(p: PersonnelProfile | null | undefined): number {
    const total = (p as any)?.documents_count;
    const got = Array.isArray(p?.documents) ? p!.documents!.length : 0;
    return typeof total === 'number' && total > got ? total : 0;
  }
  jobItems: Array<{ title: string; job_codes: string[] }> = [];
  availableJobCodes: string[] = [];
  bankAccounts: PersonnelBankAccount[] = [];
  existingDocuments: PersonnelDocument[] = [];
  pendingUploadDocuments: Array<{ file: File; doc_type: string; previewUrl: string; name: string; size: number }> = [];
  isLightboxOpen: boolean = false;
  lightboxImageUrl: string = '';
  lightboxTitle: string = '';
  selectedDocTypeForUpload: string = 'national_card';

  // وضعیت فرم در لحظهٔ بازشدن؛ ویرایش فقط تغییرات نسبت به این را می‌فرستد (DEF-08 و DEF-16)
  private initialFormSnapshot: Record<string, any> | null = null;
  private initialBankAccounts: PersonnelBankAccount[] = [];
  // پیش‌نویس محلی ذخیره‌شده هنگام قطعی سرور برای همین بخش (DEF-24)
  localDraftAvailable: PersonnelLocalDraft | null = null;
  // شمار پیش‌نویس‌های محلی دیگرِ پرسنل جدید در همین بخش (جز موردی که بنر نشان می‌دهد)
  otherLocalDraftCount = 0;
  // اسلات پیش‌نویس فرم باز؛ هر فرم پرسنل جدید اسلات تازه و هر پرونده اسلات خودش را دارد
  private activeLocalDraftId: string | null = null;
  isReopening = false;

  // ─── فرم ثبت پرسنل جدید (Guardian G2: Enforced Draft Invariant) ───
  newPersonnel: Partial<PersonnelProfile> = {
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
    gender: 'مرد',
    job_title: 'کارگر انبار',
    job_code: '',
    contract_type: 'daily',
    marital_status: 'single',
    children_count: 0,
    daily_base_wage: 0,
    phone_number: '',
    address: '',
    postal_code: '',
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
  isPhoneCopied: boolean = false;
  foundExistingPersonnel: any = null;
  existingPersonnelId: number | null = null;
  existingPersonnelSectionId: number | null = null;
  isLookingUpNationalCode: boolean = false;
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

  // مدیریت پیوست و آپلود مدارک هویتی پرسنل
  selectedDocumentAttachment: File | null = null;
  attachmentFileName: string = '';

  // اعتبارسنجی زنده کد ملی
  nationalCodeError: string | null = null;

  // ─── عناوین شغلی استاندارد (قابلیت گسترش داینامیک از بک‌اند) ───
  jobTitles: string[] = [
    'کارگر ساده انبار',
    'اپراتور لیفتراک',
    'کمک انباردار',
    'راننده خودرو سبک/سنگین',
    'مسئول انبار',
    'کارشناس اداری و مالی',
    'نگهبان و انتظامات',
    'کارگر فنی و تاسیسات',
    'سایر'
  ];

  // ─── انواع قرارداد (منحصر بر روزمزد مبنا ۱۰ ساعت بر اساس قوانین کارگاه) ───
  readonly contractTypes = [
    { value: 'daily', label: 'روزمزد (مبنا ۱۰ ساعت)' }
  ];

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
    this.loadMySections();
    this.loadJobTitles();
    this.setupWebSocket();

    if (this.activeCompanyService?.activeCompany$) {
      this.companySub = this.activeCompanyService.activeCompany$.subscribe(() => {
        this.loadMySections();
        if (this.selectedSectionId) {
          this.loadRecentPersonnel();
        }
      });
    }

    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && sId !== this.selectedSectionId) {
          this.selectedSectionId = sId;
          this.selectedSection = this.mySections.find(s => s.id === sId) || null;
          if (this.selectedSectionId) {
            this.loadRecentPersonnel();
          }
        }
      }
      if (params['status_filter'] && ['all', 'draft', 'pending', 'pending_supervisor', 'manager_approved', 'approved', 'revision_required', 'rejected'].includes(params['status_filter'])) {
        this.statusFilter = params['status_filter'] as PersonnelStatusFilter;
      }
      if (params['search'] !== undefined) {
        this.searchQuery = params['search'] || '';
      }
    });
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.companySub?.unsubscribe();
    if (this.copiedTimeout) {
      clearTimeout(this.copiedTimeout);
    }
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
      if (msg && (msg.type_str === 'personnel_updated' || msg.type === 'personnel_updated')) {
        this.handlePersonnelWebSocketUpdate(msg);
      }
    });
  }

  handlePersonnelWebSocketUpdate(msg: any): void {
    if (!msg) return;

    // بررسی انطباق بخش انتخابی: اگر شناسه بخش دارد و با بخش فعال مغایر است
    if (this.selectedSectionId && msg.section_id && msg.section_id !== this.selectedSectionId) {
      const targetId = msg.personnel_id || msg.profile_id;
      if (targetId && this.recentPersonnel.some(p => p.id === targetId)) {
        this.recentPersonnel = this.recentPersonnel.filter(p => p.id !== targetId);
        this.cdr.detectChanges();
      }
      return;
    }

    const pId = msg.personnel_id || msg.profile_id;
    if (!pId) return;

    if (msg.action === 'deleted') {
      this.recentPersonnel = this.recentPersonnel.filter(p => p.id !== pId);
      if (this.editingPersonnel?.id === pId) {
        this.closeNewPersonnelModal();
        this.toast.show('info', 'پرونده باز شده توسط کاربر دیگر حذف گردید.');
      }
      this.cdr.detectChanges();
      return;
    }

    const idx = this.recentPersonnel.findIndex(p => p.id === pId);
    if (idx !== -1) {
      // به‌روزرسانی درجا بدون بارگذاری دوباره کل فهرست (فاز ۷ - تسک ۷.۴)
      const existing = this.recentPersonnel[idx];
      this.recentPersonnel[idx] = {
        ...existing,
        approval_status: msg.approval_status !== undefined && msg.approval_status !== '' ? msg.approval_status : existing.approval_status,
        has_pending_changes: msg.has_pending_changes !== undefined ? msg.has_pending_changes : existing.has_pending_changes,
        job_title: msg.job_title !== undefined && msg.job_title !== '' ? msg.job_title : existing.job_title,
        national_code: msg.national_code !== undefined && msg.national_code !== '' ? msg.national_code : existing.national_code,
        full_name: msg.full_name !== undefined && msg.full_name !== '' ? msg.full_name : existing.full_name,
        is_active: msg.is_active !== undefined ? msg.is_active : existing.is_active,
        valid_until_date: msg.valid_until_date !== undefined ? msg.valid_until_date : existing.valid_until_date,
        rejection_reason: msg.rejection_reason !== undefined ? msg.rejection_reason : existing.rejection_reason,
      };
      // بهینه‌سازی ایمیوتبلیتی جهت رفرش اتوماتیک getterهای filteredPersonnel و personnelMetrics
      this.recentPersonnel = [...this.recentPersonnel];
    } else {
      // رکورد هنوز در لیست جاری وجود ندارد (رکورد جدید یا لیست خالی)، بارگذاری هوشمند
      this.loadRecentPersonnel();
      return;
    }

    // به‌روزرسانی زنده پرونده در حال ویرایش در صورت باز بودن مودال
    if (this.editingPersonnel && this.editingPersonnel.id === pId) {
      if (msg.approval_status !== undefined && msg.approval_status !== '') {
        this.editingPersonnel.approval_status = msg.approval_status;
      }
      if (msg.has_pending_changes !== undefined) {
        this.editingPersonnel.has_pending_changes = msg.has_pending_changes;
      }
      if (msg.rejection_reason !== undefined) {
        this.editingPersonnel.rejection_reason = msg.rejection_reason;
      }
    }

    this.cdr.detectChanges();
  }

  loadJobTitles(): void {
    this.personnelApi.getJobTitles().subscribe({
      next: (res: any) => {
        if (res?.job_titles && Array.isArray(res.job_titles) && res.job_titles.length > 0) {
          this.jobTitles = res.job_titles;
        }
        if (res?.items && Array.isArray(res.items) && res.items.length > 0) {
          this.jobItems = res.items;
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onJobTitleSelect(title: string): void {
    this.newPersonnel.job_title = title;
    const match = this.jobItems.find(j => j.title === title);
    if (match && match.job_codes?.length) {
      this.availableJobCodes = match.job_codes;
      if (!this.newPersonnel.job_code || !match.job_codes.includes(this.newPersonnel.job_code)) {
        this.newPersonnel.job_code = match.job_codes[0];
      }
    } else {
      this.availableJobCodes = [];
    }
    this.cdr.detectChanges();
  }

  onJobTitleInput(event: any): void {
    const title = typeof event === 'string' ? event : (event?.target?.value || '');
    this.newPersonnel.job_title = title;
    const match = this.jobItems.find(j => j.title === title.trim());
    if (match && match.job_codes?.length) {
      this.availableJobCodes = match.job_codes;
      if (!this.newPersonnel.job_code || !match.job_codes.includes(this.newPersonnel.job_code)) {
        this.newPersonnel.job_code = match.job_codes[0];
      }
    } else {
      this.availableJobCodes = [];
    }
    this.cdr.detectChanges();
  }

  selectJobCode(code: string): void {
    this.newPersonnel.job_code = code;
    this.cdr.detectChanges();
  }

  onJobCodeInput(event: any): void {
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const clean = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 6);
    this.newPersonnel.job_code = clean;
    if (event?.target) event.target.value = clean;
    this.cdr.detectChanges();
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
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      if (this.selectedSectionId) {
        this.loadRecentPersonnel();
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
    this.loadRecentPersonnel();
  }

  // ─── بارگذاری پرسنل بخش فعال (Guardian G1: Section Isolation) ───
  loadRecentPersonnel(): void {
    if (!this.selectedSectionId) return;
    this.isLoadingPersonnel = true;
    this.personnelApi.getPersonnelProfiles({ section_id: this.selectedSectionId }).subscribe({
      next: (res: PersonnelProfile[]) => {
        this.recentPersonnel = res || [];
        this.isLoadingPersonnel = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoadingPersonnel = false;
        this.toast.show('error', 'خطا در بارگذاری پرسنل: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فیلتر پرسنل اخیر ───
  get filteredPersonnel(): PersonnelProfile[] {
    let list = this.recentPersonnel;

    if (this.statusFilter !== 'all') {
      if (this.statusFilter === 'pending' || this.statusFilter === 'pending_supervisor') {
        list = list.filter(p =>
          p.approval_status === 'pending_supervisor' ||
          p.approval_status === 'pending_accountant' ||
          p.approval_status === 'pending_manager'
        );
      } else if (this.statusFilter === 'approved') {
        list = list.filter(p => p.approval_status === 'approved' || p.approval_status === 'manager_approved');
      } else {
        list = list.filter(p => p.approval_status === this.statusFilter);
      }
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.first_name && p.first_name.toLowerCase().includes(q)) ||
        (p.last_name && p.last_name.toLowerCase().includes(q)) ||
        (p.full_name && p.full_name.toLowerCase().includes(q)) ||
        (p.national_code && p.national_code.includes(q)) ||
        (p.job_title && p.job_title.toLowerCase().includes(q)) ||
        (p.phone_number && p.phone_number.includes(q))
      );
    }

    return list;
  }

  // ─── شاخص‌های آماری پرسنل بخش ───
  get personnelMetrics() {
    const total = this.recentPersonnel.length;
    const drafts = this.recentPersonnel.filter(p => p.approval_status === 'draft').length;
    const pending = this.recentPersonnel.filter(p =>
      p.approval_status === 'pending_supervisor' ||
      p.approval_status === 'pending_accountant' ||
      p.approval_status === 'pending_manager'
    ).length;
    const approved = this.recentPersonnel.filter(p => p.approval_status === 'approved' || p.approval_status === 'manager_approved').length;
    const rejected = this.recentPersonnel.filter(p => p.approval_status === 'rejected').length;
    const revision_required = this.recentPersonnel.filter(p => p.approval_status === 'revision_required').length;
    const dailyCount = this.recentPersonnel.filter(p => p.contract_type === 'daily').length;

    return {
      total,
      drafts,
      pending,
      approved,
      rejected,
      revision_required,
      dailyCount
    };
  }

  get unreviewedDraftCount(): number {
    return this.recentPersonnel.filter(p => p.approval_status === 'draft' && !this.isDraftReviewed(p.id)).length;
  }

  isDraftReviewed(id?: number): boolean {
    if (!id) return false;
    return this.reviewedDraftIds.has(id);
  }

  get isApprovedRecord(): boolean {
    return this.editingPersonnel?.approval_status === 'approved' || this.editingPersonnel?.approval_status === 'manager_approved';
  }

  get editingPersonnelHasPendingChanges(): boolean {
    return !!this.editingPersonnel?.has_pending_changes;
  }

  get editingPersonnelStatus(): string | null {
    return this.editingPersonnel?.approval_status || null;
  }

  get isReadOnlyMode(): boolean {
    if (!this.editingPersonnel) return false;
    if (this.isApprovedRecord) return false;
    return this.editingPersonnelStatus !== 'draft' && this.editingPersonnelStatus !== 'revision_required';
  }

  get rejectionReasonToDisplay(): string | null {
    return this.editingPersonnel?.rejection_reason || null;
  }

  get rejectionRequestedByName(): string | null {
    return (this.editingPersonnel as any)?.revision_requested_by_name || (this.editingPersonnel as any)?.supervisor_name || null;
  }

  get modalHeaderTitle(): string {
    if (this.editingPersonnel) {
      if (this.isApprovedRecord) return 'ویرایش و پیشنهاد تغییرات پرونده مصوب';
      if (this.editingPersonnelStatus === 'revision_required') return 'اصلاح و بازنگری پرونده پرسنل';
      if (this.isReadOnlyMode) return 'مشاهده مشخصات پرسنل';
      return 'ویرایش پرونده پیش‌نویس پرسنل';
    }
    return 'تشکیل پرونده و معرفی پرسنل جدید';
  }

  get modalHeaderBadge(): { label: string; class: string } {
    if (this.isApprovedRecord) {
      return { label: 'پرونده مصوب', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    if (this.editingPersonnelStatus === 'revision_required') {
      return { label: 'نیازمند اصلاح', class: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    if (this.editingPersonnelStatus === 'pending_supervisor') {
      return { label: 'در انتظار تایید سرپرست', class: 'bg-purple-100 text-purple-800 border-purple-300' };
    }
    if (this.editingPersonnelStatus === 'pending_accountant') {
      return { label: 'در انتظار بررسی حسابدار', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
    }
    if (this.editingPersonnelStatus === 'pending_manager') {
      return { label: 'در انتظار تصویب مدیر', class: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
    }
    if (this.editingPersonnelStatus === 'rejected') {
      return { label: 'رد شده', class: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
    if (this.editingId) {
      return { label: 'پیش‌نویس کارمند', class: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
    return { label: 'جدید', class: 'bg-white/20 text-white border-white/30' };
  }

  // ─── تب‌های حافظه‌دار وضعیت و مراحل ثبت برای app-tab-bar ───
  private statusFilterTabsKey = '';
  private statusFilterTabsCache: TabDef[] = [];
  get statusFilterTabs(): TabDef[] {
    const pm = this.personnelMetrics;
    const key = `${pm.total}:${this.unreviewedDraftCount}:${pm.pending}:${pm.revision_required}:${pm.approved}:${pm.rejected}`;
    if (key !== this.statusFilterTabsKey) {
      this.statusFilterTabsKey = key;
      this.statusFilterTabsCache = [
        { id: 'all', label: 'همه', icon: 'status-all', count: pm.total },
        { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: this.unreviewedDraftCount, tone: this.unreviewedDraftCount > 0 ? 'amber' : undefined },
        { id: 'pending', label: 'معلق', icon: 'status-pending', count: pm.pending },
        { id: 'revision_required', label: 'عودت', icon: 'status-revision', count: pm.revision_required, tone: pm.revision_required > 0 ? 'amber' : undefined },
        { id: 'approved', label: 'مصوب', icon: 'status-approved', count: pm.approved, tone: 'emerald' },
        { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected', count: pm.rejected, tone: 'rose' },
      ];
    }
    return this.statusFilterTabsCache;
  }

  private personnelModalTabsKey = '';
  private personnelModalTabsCache: TabDef[] = [];
  get personnelModalTabs(): TabDef[] {
    const docCount = this.existingDocuments.length + this.pendingUploadDocuments.length;
    const bankCount = this.bankAccounts.length;
    const key = `${this.isTabComplete('identity')}:${this.isTabComplete('job')}:${this.isTabComplete('banking')}:${bankCount}:${this.isTabComplete('address')}:${this.isTabComplete('documents')}:${docCount}`;
    if (key !== this.personnelModalTabsKey) {
      this.personnelModalTabsKey = key;
      // نشانگر ✓/! قالب پیشین: کدام مرحله فیلد الزامی خالی دارد
      const step = (tab: 'identity' | 'job' | 'banking' | 'address'): TabDef['indicator'] =>
        this.isTabComplete(tab)
          ? { tone: 'emerald', label: 'تکمیل شده' }
          : { tone: 'rose', label: 'دارای فیلد الزامی' };
      this.personnelModalTabsCache = [
        { id: 'identity', label: 'اطلاعات هویتی', shortLabel: 'هویتی', icon: 'user', indicator: step('identity') },
        { id: 'job', label: 'مشخصات شغلی', shortLabel: 'شغلی', icon: 'briefcase', indicator: step('job') },
        { id: 'banking', label: 'حساب‌های بانکی', shortLabel: 'بانکی', icon: 'credit-card', count: bankCount > 0 ? bankCount : undefined, indicator: step('banking') },
        { id: 'address', label: 'نشانی و تماس', shortLabel: 'نشانی', icon: 'map-pin', indicator: step('address') },
        { id: 'documents', label: 'مدارک و یادداشت', shortLabel: 'مدارک', icon: 'file-text', count: docCount > 0 ? docCount : undefined },
      ];
    }
    return this.personnelModalTabsCache;
  }

  setStatusFilter(filter: string): void {
    if (
      filter === 'all' ||
      filter === 'draft' ||
      filter === 'pending' ||
      filter === 'pending_supervisor' ||
      filter === 'manager_approved' ||
      filter === 'approved' ||
      filter === 'revision_required' ||
      filter === 'rejected'
    ) {
      this.statusFilter = filter;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { status_filter: filter === 'all' ? null : filter },
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
  }

  getCleanTelUrl(phone?: string): string {
    if (!phone) return '';
    const clean = normalizeDigits(phone).replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  }

  // ─── مدیریت مودال مشاهده تغییرات معلق (Diff Viewer) ───
  openPendingDiffModal(p: PersonnelProfile): void {
    this.pendingDiffPersonnel = p;
    this.isPendingDiffModalOpen = true;
    this.cdr.detectChanges();
  }

  closePendingDiffModal(): void {
    this.isPendingDiffModalOpen = false;
    this.pendingDiffPersonnel = null;
    this.cdr.detectChanges();
  }

  // ─── ابطال درخواست تغییرات معلق (فاز ۷ - تسک ۷.۲) ───
  async cancelPendingChangeRequest(p?: PersonnelProfile | null): Promise<void> {
    const target = p || this.pendingDiffPersonnel || this.editingPersonnel;
    if (!target) return;
    const crId = target.pending_change_request?.id;
    if (!crId) {
      this.toast.show('warning', 'شناسه درخواست تغییرات یافت نشد.');
      return;
    }

    if ((await this.confirmDialog?.open({ title: 'ابطال درخواست', message: 'آیا از ابطال این درخواست تغییرات اطمینان دارید؟', type: 'danger' })) !== true) {
      return;
    }

    this.isCancellingChangeRequest = true;
    if (this.personnelApi?.cancelPersonnelChangeRequest) {
      this.personnelApi.cancelPersonnelChangeRequest(crId).subscribe({
        next: (res: any) => {
          this.isCancellingChangeRequest = false;
          this.toast.show('success', res?.message || 'درخواست تغییرات با موفقیت ابطال شد.');
          if (target) {
            target.has_pending_changes = false;
            target.pending_change_request = null;
          }
          if (this.isPendingDiffModalOpen) {
            this.closePendingDiffModal();
          }
          this.loadRecentPersonnel();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isCancellingChangeRequest = false;
          this.toast.show('error', 'خطا در ابطال درخواست تغییرات: ' + (err.error?.error || err.message || 'نامشخص'));
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isCancellingChangeRequest = false;
      this.cdr.detectChanges();
    }
  }

  // ─── مدیریت تایملاین گردش کار پرونده (فاز ۷ - تسک ۷.۱) ───
  openTimelineModal(p: PersonnelProfile): void {
    this.timelinePersonnel = p;
    this.timelineLogs = [];
    this.isTimelineModalOpen = true;
    this.isLoadingTimeline = true;
    this.cdr.detectChanges();

    if (this.personnelApi?.getWorkflowAuditLogs) {
      this.personnelApi.getWorkflowAuditLogs({ content_type: 'personnel', object_id: p.id }).subscribe({
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
    } else {
      this.isLoadingTimeline = false;
      this.cdr.detectChanges();
    }
  }

  closeTimelineModal(): void {
    this.isTimelineModalOpen = false;
    this.timelinePersonnel = null;
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
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'auto_pass':
      case 'change_request_applied':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'reopen':
      case 'change_request_created':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }

  getWorkflowActionIcon(action?: string): string {
    switch (action) {
      case 'submit':
        return '📤';
      case 'approve_supervisor':
      case 'approve_accountant':
      case 'approve_finance':
        return '✓';
      case 'approve_manager':
        return '🌟';
      case 'batch_approve':
        return '👥';
      case 'revision':
      case 'request_revision':
        return '↩';
      case 'reject':
      case 'purge':
      case 'delete':
      case 'change_request_rejected':
        return '✕';
      case 'cancel_change_request':
      case 'change_request_cancelled':
        return '🚫';
      case 'auto_pass':
        return '⚡';
      case 'reopen':
        return '🔄';
      case 'end_collaboration':
        return '⏹';
      case 'create':
      case 'change_request_created':
        return '📝';
      default:
        return '📋';
    }
  }

  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.isExportingExcel = true;
    this.personnelApi.exportPersonnelExcel({ section_id: this.selectedSectionId }).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        void saveBlob(blob, `personnel_section_${this.selectedSectionId}.xlsx`);
        this.toast.show('success', 'فایل اکسل پرسنل با موفقیت دانلود شد.');
      },
      error: (err: any) => {
        this.isExportingExcel = false;
        this.toast.show('error', 'خطا در دریافت خروجی اکسل: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── مدیریت مودال استاندارد ورود اکسل (مشابه projects-and-sections) ───
  openImportModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.excelModalTitle = 'آپلود و ثبت دسته‌جمعی پرسنل از فایل اکسل';
    this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => {
      return this.personnelApi.importPersonnelExcelModal(file, this.selectedSectionId, updateExisting, dryRun);
    };
    this.excelTemplateFn = () => this.downloadPersonnelTemplate();
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.cdr.detectChanges();
  }

  onExcelImported(result: any): void {
    if (result?.success || result?.created_count || result?.summary?.created) {
      this.toast.show('success', 'اطلاعات پرسنل با موفقیت از فایل اکسل اعمال شد.');
      this.loadRecentPersonnel();
    }
    // ردیف‌هایی که گیت تکمیل را نگذراندند پیش‌نویس ماندند (DEF-14)
    const warnings: Array<{ row: number; message: string }> = result?.warnings || [];
    if (warnings.length) {
      this.toast.show('warning', `${warnings.length} ردیف به‌دلیل نقص اطلاعات پیش‌نویس ماند: ` +
        warnings.slice(0, 3).map(w => `ردیف ${w.row}`).join('، ') + (warnings.length > 3 ? '، …' : ''));
    }
  }

  downloadPersonnelTemplate(): void {
    this.personnelApi.downloadPersonnelTemplate().subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, 'personnel_template.xlsx');
        this.toast.show('success', 'قالب استاندارد اکسل پرسنل با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل پرسنل')
    });
  }

  // ─── مدیریت مودال ثبت و معرفی پرسنل جدید (تسک ۶.۱) ───
  openNewPersonnelModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.editingPersonnel = null;
    this.editingId = null;
    this.existingAttachmentUrl = null;
    this.wageFormattedDisplay = '';
    this.activeModalTab = 'identity';
    this.bankAccounts = [];
    this.existingDocuments = [];
    this.pendingUploadDocuments = [];
    this.serverMissingFields = [];
    this.phoneError = null;
    this.postalCodeError = null;
    this.isFoundPersonnelRejected = false;
    this.resetForm();
    this.initialFormSnapshot = null;
    this.initialBankAccounts = [];
    this.activeLocalDraftId = newPersonnelLocalDraftId();
    this.isNewPersonnelModalOpen = true;
    this.checkLocalDraft();
    this.cdr.detectChanges();
  }

  // ─── پیش‌نویس محلی هنگام قطعی سرور (DEF-24) ───
  private get localDraftKey(): string | null {
    if (!this.selectedSectionId || !this.activeLocalDraftId) return null;
    return personnelLocalDraftKey(this.auth.user()?.id ?? null, this.selectedSectionId, this.activeLocalDraftId);
  }

  /**
   * فرم پرسنل جدید تازه‌ترین پیش‌نویسِ پرسنل جدید را پیشنهاد می‌دهد و فرم ویرایش، پیش‌نویس همان پرونده را.
   * پیش‌نویس قدیمی localStorage با اسلات تازه منتقل می‌شود تا پیش‌نویس دیگری را بازنویسی نکند.
   */
  private checkLocalDraft(): void {
    this.localDraftAvailable = null;
    this.otherLocalDraftCount = 0;
    if (!this.selectedSectionId) return;
    const sectionId = this.selectedSectionId;
    const userId = this.auth.user()?.id ?? null;
    const editingId = this.editingId;
    const legacyKey = `draft_personnel_section_${sectionId}`;
    let legacy: string | null = null;
    try { legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(legacyKey) : null; } catch {}
    let legacyForm: Record<string, unknown> | null = null;
    if (legacy) {
      try { legacyForm = JSON.parse(legacy); } catch { legacyForm = null; }
    }
    const migrate = legacyForm
      ? savePersonnelLocalDraft({
          key: personnelLocalDraftKey(userId, sectionId, newPersonnelLocalDraftId()),
          userId, sectionId, personnelId: null,
          savedAt: new Date().toISOString(), form: legacyForm, bankAccounts: []
        }).then(ok => { if (ok) { try { localStorage.removeItem(legacyKey); } catch {} } })
      : Promise.resolve();
    migrate
      .then(() => listPersonnelLocalDrafts(userId, sectionId))
      .then(drafts => {
        if (!this.isNewPersonnelModalOpen || this.editingId !== editingId) return;
        const candidates = editingId
          ? drafts.filter(d => d.personnelId === editingId)
          : drafts.filter(d => !d.personnelId && d.key !== this.localDraftKey);
        if (candidates.length) {
          this.localDraftAvailable = candidates[0];
          this.otherLocalDraftCount = candidates.length - 1;
          this.cdr.detectChanges();
        }
      })
      .catch(() => {});
  }

  async restoreLocalDraft(): Promise<void> {
    const draft = this.localDraftAvailable;
    if (!draft) return;
    const hasTypedData = !this.editingId && !!(this.newPersonnel.national_code || this.newPersonnel.last_name || this.newPersonnel.first_name);
    if (hasTypedData && (await this.confirmDialog?.open({ title: 'جایگزینی با پیشنویس', message: 'مقادیر فعلی فرم با پیش‌نویس محلی جایگزین شود؟', type: 'warning' })) !== true) return;
    this.newPersonnel = { ...this.newPersonnel, ...(draft.form as Partial<PersonnelProfile>) };
    this.bankAccounts = (draft.bankAccounts || []).map(a => ({ ...(a as unknown as PersonnelBankAccount) }));
    if (this.bankAccounts.length) this.syncPrimaryToProfile();
    if (this.newPersonnel.national_code && !this.editingId) this.onNationalCodeChange();
    // از این پس همین فرم در اسلات همان پیش‌نویس ذخیره و پس از پذیرش سرور فقط همان پاک می‌شود
    const parts = draft.key.split('_');
    this.activeLocalDraftId = parts.length >= 3 ? parts.slice(2).join('_') : draft.key;
    if (parts.length < 3) {
      // اسلات قدیمی بدون شناسه: به اسلات تازه منتقل می‌شود تا با کلید قدیمی پاک نشود
      this.activeLocalDraftId = this.editingId ? `p${this.editingId}` : newPersonnelLocalDraftId();
      this.cachePersonnelFormLocally();
      deletePersonnelLocalDraft(draft.key).catch(() => {});
    }
    this.localDraftAvailable = null;
    this.toast.show('success', 'پیش‌نویس محلی ذخیره‌شده بازیابی شد؛ پس از بررسی، آن را ذخیره کنید.');
    this.cdr.detectChanges();
  }

  async discardLocalDraft(): Promise<void> {
    const draft = this.localDraftAvailable;
    if (!draft) return;
    if ((await this.confirmDialog?.open({ title: 'حذف', message: 'پیش‌نویس محلی ذخیره‌نشده روی سرور برای همیشه حذف شود؟', type: 'danger', confirmText: 'حذف' })) !== true) return;
    deletePersonnelLocalDraft(draft.key).catch(() => {});
    this.localDraftAvailable = null;
    this.checkLocalDraft();
    this.cdr.detectChanges();
  }

  /** فقط پس از پذیرش سرور (نه صف آفلاین) و فقط اسلات همین فرم پاک می‌شود */
  private clearLocalDraftAfterServerSave(): void {
    const key = this.localDraftKey;
    if (key) deletePersonnelLocalDraft(key).catch(() => {});
  }

  closeNewPersonnelModal(): void {
    this.isNewPersonnelModalOpen = false;
    this.editingPersonnel = null;
    this.editingId = null;
    this.existingAttachmentUrl = null;
    this.wageFormattedDisplay = '';
    this.activeModalTab = 'identity';
    this.cdr.detectChanges();
  }

  openEditModal(p: PersonnelProfile): void {
    if (!this.selectedSectionId && p.section) {
      this.selectedSectionId = p.section;
      this.selectedSection = this.mySections.find(s => s.id === p.section) || null;
    }
    this.editingPersonnel = p;
    this.editingId = p.id || null;
    this.activeModalTab = 'identity';
    this.phoneError = null;
    this.postalCodeError = null;
    this.isFoundPersonnelRejected = false;
    if (p.id) {
      this.reviewedDraftIds.add(p.id);
    }
    this.newPersonnel = {
      ...p,
      contract_type: p.contract_type || 'daily',
      marital_status: p.marital_status || 'single',
      children_count: p.children_count || 0,
      daily_base_wage: p.daily_base_wage || 0,
      gender: p.gender || 'مرد',
      id_number: p.id_number || '',
      id_series: p.id_series || '',
      id_serial: p.id_serial || '',
      birth_date: p.birth_date || '',
      birth_place: p.birth_place || '',
      issue_place: p.issue_place || '',
      phone_number: p.phone_number || '',
      address: p.address || '',
      postal_code: p.postal_code || '',
      job_title: p.job_title || 'کارگر انبار',
      job_code: p.job_code || '',
      notes: p.notes || ''
    };
    if (p.job_title) {
      this.onJobTitleSelect(p.job_title);
      if (p.job_code) this.newPersonnel.job_code = p.job_code;
    }
    this.wageFormattedDisplay = (p.daily_base_wage && p.daily_base_wage > 0) ? (p.daily_base_wage).toLocaleString('fa-IR') : '';
    this.existingAttachmentUrl = p.attachment || null;
    this.selectedDocumentAttachment = null;
    this.attachmentFileName = '';
    this.nationalCodeError = null;

    // بارگذاری حساب‌های بانکی چندگانه (تسک ۶.۴)
    if (p.bank_accounts && p.bank_accounts.length > 0) {
      this.bankAccounts = p.bank_accounts.map(a => ({ ...a }));
      this.syncPrimaryToProfile();
    } else if (p.sheba_number || p.account_number || p.bank_name) {
      this.bankAccounts = [{
        bank_name: p.bank_name || '',
        account_number: p.account_number || '',
        sheba_number: p.sheba_number || '',
        card_number: p.card_number || '',
        is_primary: true,
        is_active: true
      }];
      if (p.sheba_number) {
        this.onShebaChange();
      }
    } else {
      this.bankAccounts = [];
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
    }

    // بارگذاری مدارک چندگانه (تسک ۶.۶)
    this.pendingUploadDocuments = [];
    if (p.documents && p.documents.length > 0) {
      this.existingDocuments = p.documents.map(d => ({ ...d }));
    } else if (p.id && this.personnelApi?.getPersonnelDocuments) {
      this.personnelApi.getPersonnelDocuments(p.id).subscribe({
        next: (docs) => {
          this.existingDocuments = docs || [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.existingDocuments = [];
        }
      });
    } else {
      this.existingDocuments = [];
    }

    // فهرست فیلدهای ناقص از سرور
    if (p.missing_fields && Array.isArray(p.missing_fields)) {
      this.serverMissingFields = (p.missing_fields as any[]).map(m => typeof m === 'string' ? { field: m, label: m } : m);
    } else {
      this.serverMissingFields = [];
    }

    // وضعیت فرم و حساب‌ها در لحظهٔ بازشدن؛ مبنای PATCH تغییرات و همگام‌سازی حساب‌ها
    this.initialFormSnapshot = this.buildFormValues();
    this.initialBankAccounts = this.bankAccounts.map(a => ({ ...a }));
    this.activeLocalDraftId = p.id ? `p${p.id}` : newPersonnelLocalDraftId();

    this.isNewPersonnelModalOpen = true;
    this.checkLocalDraft();
    this.cdr.detectChanges();
  }

  /** ارسال سریع پیش‌نویس از جدول با اکشن submit و گیت سرور (DEF-02)؛ PATCH وضعیت را سرور نادیده می‌گیرد */
  submitDraftToSupervisor(p: PersonnelProfile): void {
    if (!p.id || p.id < 0) {
      this.toast.show('warning', 'این پرونده هنوز در صف آفلاین است؛ پس از ثبت روی سرور ارسال کنید.');
      return;
    }
    this.personnelApi.submitPersonnelProfile(p.id).subscribe({
      next: (res: any) => {
        if (res?._offlinePending) {
          this.toast.show('warning', `ارسال پرونده «${p.first_name} ${p.last_name}» در صف آفلاین ثبت شد و پس از اتصال انجام می‌شود.`);
        } else {
          this.toast.show('success', `پرونده «${p.first_name} ${p.last_name}» به کارتابل سرپرست بخش ارسال گردید.`);
        }
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        const missing: Array<{ field: string; label: string }> = err?.error?.missing_fields || [];
        if (missing.length) {
          // نواقص سرور روی تب‌های فرم نمایش داده می‌شود تا کاربر کاملشان کند
          this.toast.show('warning', `پرونده ارسال نشد؛ نواقص: ${missing.map(m => m.label).join('، ')}`);
          this.openEditModal({ ...p, missing_fields: missing } as PersonnelProfile);
        } else {
          this.toast.show('error', 'خطا در ارسال پرونده به سرپرست: ' + this.extractServerError(err));
        }
      }
    });
  }

  onWageInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const oldVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const oldSel = inputEl?.selectionStart ?? 0;
    const cleanDigits = normalizeDigits(oldVal).replace(/\D/g, '');
    const num = Number(cleanDigits) || 0;
    this.newPersonnel.daily_base_wage = num;
    this.wageFormattedDisplay = num > 0 ? num.toLocaleString('fa-IR') : '';
    if (inputEl && typeof event !== 'string') {
      const digitsBeforeCursor = normalizeDigits(oldVal.slice(0, oldSel)).replace(/\D/g, '').length;
      inputEl.value = this.wageFormattedDisplay;
      let newPos = 0;
      let countedDigits = 0;
      for (let i = 0; i < this.wageFormattedDisplay.length; i++) {
        if (countedDigits >= digitsBeforeCursor) break;
        if (/\d/.test(normalizeDigits(this.wageFormattedDisplay[i]))) {
          countedDigits++;
        }
        newPos = i + 1;
      }
      try { inputEl.setSelectionRange(newPos, newPos); } catch {}
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.isPendingDiffModalOpen) {
      this.closePendingDiffModal();
      return;
    }
    if (this.isNewPersonnelModalOpen) {
      this.closeNewPersonnelModal();
    }
  }

  // ─── اعتبارسنجی و فرمت‌بندی پیشرفته شماره شبا (مشابه تعریف راننده و خودرو) ───
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
      this.newPersonnel.sheba_number = res.rawSheba;
      if (res.bank) {
        this.newPersonnel.bank_name = res.bank.name;
      }
      if (res.accountNumber) {
        this.newPersonnel.account_number = res.accountNumber;
      }
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
    this.cdr.detectChanges();
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  onShebaCopy(event: ClipboardEvent): void {
    const digits = extractShebaDigits(this.newPersonnel.sheba_number || '');
    if (digits && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', digits);
      this.isShebaCopied = true;
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  copyShebaToClipboard(): void {
    const digits = extractShebaDigits(this.newPersonnel.sheba_number || '');
    if (!digits) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(digits).then(() => {
        this.isShebaCopied = true;
        this.toast.show('success', 'شماره شبا (۲۴ رقم بدون IR) در کلیپ‌بورد کپی شد.');
        setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('warning', 'امکان کپی خودکار در کلیپ‌بورد مقدور نشد.');
      });
    } else {
      this.isShebaCopied = true;
      this.toast.show('success', 'شماره شبا کپی شد.');
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  // متد سازگاری رو به عقب برای شبا
  onShebaChange(): void {
    const raw = this.newPersonnel.sheba_number || '';
    if (!raw.trim()) {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
      return;
    }
    const clean = cleanShebaInput(raw);
    this.newPersonnel.sheba_number = clean;
    this.shebaValidationResult = validateSheba(clean);
    this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || extractShebaDigits(clean);
    if (this.shebaValidationResult.isValid && this.shebaValidationResult.bank) {
      this.newPersonnel.bank_name = this.shebaValidationResult.bank.name;
      if (!this.newPersonnel.account_number) {
        this.newPersonnel.account_number = extractAccountNumberFromSheba(clean);
      }
    }
  }

  // ─── مدیریت دوطرفه شماره حساب بانکی و شبا (Banking Standard) ───
  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.newPersonnel.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }

    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.newPersonnel.bank_name) {
      const generated = generateShebaFromAccount(this.newPersonnel.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.newPersonnel.sheba_number = res.rawSheba;
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
  }

  onAccountNumberCopy(event: ClipboardEvent): void {
    const acc = this.newPersonnel.account_number || '';
    if (acc && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', acc);
      this.isAccountCopied = true;
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.newPersonnel.account_number || '';
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

  copyPhoneToClipboard(): void {
    const phone = this.newPersonnel.phone_number?.trim() || '';
    if (!phone) return;
    this.isPhoneCopied = true;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(phone).then(() => {
        this.toast.show('success', 'شماره همراه در کلیپ‌بورد کپی شد.');
        setTimeout(() => { this.isPhoneCopied = false; this.cdr.detectChanges(); }, 2000);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('warning', 'امکان کپی خودکار مقدور نشد.');
      });
    } else {
      this.toast.show('success', 'شماره همراه کپی شد.');
      setTimeout(() => { this.isPhoneCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  onBankSelect(bankName: string): void {
    this.newPersonnel.bank_name = bankName;
    const accValidation = validateAccountNumber(this.newPersonnel.account_number);
    if (accValidation.isValid && bankName) {
      const generated = generateShebaFromAccount(bankName, this.newPersonnel.account_number);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.newPersonnel.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
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

  openBankDropdown(): void {
    if (!this.isReadOnlyMode) {
      this.isBankDropdownOpen = true;
      this.bankSearchQuery = '';
    }
  }

  convertAccountToShebaNow(): void {
    if (!this.newPersonnel.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.newPersonnel.account_number);
    if (!accValidation.isValid) {
      this.toast.show('warning', accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(this.newPersonnel.bank_name, this.newPersonnel.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.show('success', `شماره شبا با موفقیت بر اساس بانک ${this.newPersonnel.bank_name} تولید شد.`);
    } else {
      this.toast.show('error', 'امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  // ─── مدیریت آپلود مدارک هویتی پرسنل ───
  onDocumentFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      // محدودیت حجم فایل تا ۱۰ مگابایت
      if (file.size > 10 * 1024 * 1024) {
        this.toast.show('warning', 'حجم فایل مدارک نباید بیشتر از ۱۰ مگابایت باشد.');
        return;
      }
      this.selectedDocumentAttachment = file;
      this.attachmentFileName = file.name;
      this.cdr.detectChanges();
    }
  }

  removeSelectedAttachment(): void {
    this.selectedDocumentAttachment = null;
    this.attachmentFileName = '';
    this.cdr.detectChanges();
  }

  // ─── اعتبارسنجی الگوریتم ۱۰ رقمی کد ملی (Mod 11) ───
  onNationalCodeChange(): void {
    const raw = (this.newPersonnel.national_code || '').trim();
    if (!raw) {
      this.nationalCodeError = null;
      return;
    }
    const code = normalizeDigits(raw).replace(/\D/g, '');
    this.newPersonnel.national_code = code;

    if (code.length !== 10) {
      this.nationalCodeError = 'کد ملی باید دقیقاً ۱۰ رقم عددی باشد.';
      return;
    }
    if (/^(\d)\1{9}$/.test(code)) {
      this.nationalCodeError = 'کد ملی نامعتبر است (ارقام تکراری).';
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

    if (isValid && !this.editingPersonnel) {
      this.lookupExistingPersonnel(code);
    } else {
      this.maskedLookupName = null;
      this.foundExistingPersonnel = null;
      this.existingPersonnelId = null;
      this.existingPersonnelSectionId = null;
    }
  }

  // ─── استعلام پرونده پرسنل در شرکت بر مبنای کد ملی ───
  lookupExistingPersonnel(code: string): void {
    if (!this.personnelApi?.lookupPersonnelByNationalCode) return;
    this.isLookingUpNationalCode = true;
    this.maskedLookupName = null;
    this.personnelApi.lookupPersonnelByNationalCode(code).subscribe({
      next: (res) => {
        this.isLookingUpNationalCode = false;
        if (res?.found && res.masked) {
          // کاربر بدون دید کامل: فقط «پرونده دارد» و نام؛ بدون پرکردن فرم و بدون بازگشایی
          this.maskedLookupName = `${res.personnel?.first_name || ''} ${res.personnel?.last_name || ''}`.trim();
          this.foundExistingPersonnel = null;
          this.existingPersonnelId = null;
          this.existingPersonnelSectionId = null;
          this.isFoundPersonnelRejected = false;
          this.cdr.detectChanges();
        } else if (res?.found && res.personnel) {
          this.maskedLookupName = null;
          this.foundExistingPersonnel = res.personnel;
          this.existingPersonnelId = res.personnel.id;
          this.existingPersonnelSectionId = res.personnel.current_section_id;
          this.isFoundPersonnelRejected = (res.personnel.approval_status === 'rejected');
          this.cdr.detectChanges();
        } else {
          this.foundExistingPersonnel = null;
          this.existingPersonnelId = null;
          this.existingPersonnelSectionId = null;
          this.isFoundPersonnelRejected = false;
        }
      },
      error: () => {
        this.isLookingUpNationalCode = false;
        this.foundExistingPersonnel = null;
        this.existingPersonnelId = null;
        this.existingPersonnelSectionId = null;
        this.isFoundPersonnelRejected = false;
      }
    });
  }

  // ─── بازگشایی پرونده ردشده در شرکت جهت اصلاح و بازنگری (تسک ۶.۳) ───
  /** بازگشایی پروندهٔ ردشده‌ای که از جدول باز شده است */
  reopenEditingRejectedPersonnel(): void {
    if (!this.editingPersonnel || this.editingPersonnel.approval_status !== 'rejected') return;
    this.foundExistingPersonnel = this.editingPersonnel;
    this.reopenRejectedPersonnel();
  }

  reopenRejectedPersonnel(): void {
    if (!this.foundExistingPersonnel || this.isReopening) return;
    const p = this.foundExistingPersonnel;
    this.isReopening = true;
    // بازگشایی در سرور (rejected ← draft با لاگ)؛ بدون آن ذخیره و ارسال پرونده ردشده ممکن نیست (DEF-15)
    this.personnelApi.reopenPersonnelProfile(p.id).subscribe({
      next: (res: any) => {
        this.isReopening = false;
        this.foundExistingPersonnel = null;
        this.isFoundPersonnelRejected = false;
        this.existingPersonnelId = null;
        this.existingPersonnelSectionId = null;
        const reopened = res?.data && res.data.id ? res.data : { ...p, approval_status: 'draft' };
        this.openEditModal(reopened);
        this.toast.show('info', `پرونده ردشده «${p.first_name} ${p.last_name}» جهت اصلاح و تکمیل اطلاعات بازگشایی شد.`);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isReopening = false;
        this.toast.show('error', 'خطا در بازگشایی پرونده ردشده: ' + this.extractServerError(err));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── اعمال خودکار مشخصات هویتی و بانکی پرونده یافت‌شده ───
  applyFoundPersonnelData(): void {
    if (!this.foundExistingPersonnel) return;
    const p = this.foundExistingPersonnel;
    this.existingPersonnelId = p.id;
    this.existingPersonnelSectionId = p.current_section_id;
    this.newPersonnel.first_name = p.first_name || '';
    this.newPersonnel.last_name = p.last_name || '';
    this.newPersonnel.father_name = p.father_name || '';
    this.newPersonnel.gender = p.gender || 'مرد';
    this.newPersonnel.id_number = p.id_number || '';
    this.newPersonnel.id_series = p.id_series || '';
    this.newPersonnel.id_serial = p.id_serial || '';
    this.newPersonnel.birth_date = p.birth_date || '';
    this.newPersonnel.birth_place = p.birth_place || '';
    this.newPersonnel.issue_place = p.issue_place || '';
    this.newPersonnel.marital_status = p.marital_status || 'single';
    this.newPersonnel.children_count = p.children_count || 0;
    this.newPersonnel.phone_number = p.phone_number || '';
    this.newPersonnel.address = p.address || '';
    this.newPersonnel.postal_code = p.postal_code || '';
    if (p.job_title) {
      this.onJobTitleSelect(p.job_title);
      if (p.job_code) this.newPersonnel.job_code = p.job_code;
    }
    if (p.daily_base_wage) {
      this.newPersonnel.daily_base_wage = p.daily_base_wage;
      this.wageFormattedDisplay = (p.daily_base_wage).toLocaleString('fa-IR');
    }
    if (p.bank_name) this.newPersonnel.bank_name = p.bank_name;
    if (p.account_number) this.newPersonnel.account_number = p.account_number;
    if (p.sheba_number) {
      this.newPersonnel.sheba_number = p.sheba_number;
      this.onShebaChange();
    }
    if (p.bank_accounts && p.bank_accounts.length > 0) {
      this.bankAccounts = p.bank_accounts.map((a: any) => ({ ...a }));
      this.syncPrimaryToProfile();
    } else if (p.sheba_number || p.account_number || p.bank_name) {
      this.bankAccounts = [{
        bank_name: p.bank_name || '',
        account_number: p.account_number || '',
        sheba_number: p.sheba_number || '',
        card_number: p.card_number || '',
        is_primary: true,
        is_active: true
      }];
    }
    if (p.notes) {
      this.newPersonnel.notes = p.notes;
    }
    if (p.attachment_url) {
      this.existingAttachmentUrl = p.attachment_url;
    }
    this.toast.show('success', `مشخصات هویتی و بانکی «${p.first_name} ${p.last_name}» با موفقیت فراخوانی شد.`);
    this.foundExistingPersonnel = null;
    this.isFoundPersonnelRejected = false;
    this.cdr.detectChanges();
  }

  dismissFoundPersonnelBanner(): void {
    this.foundExistingPersonnel = null;
    this.isFoundPersonnelRejected = false;
  }

  // ─── فرمت‌بندی و ماسک‌گذاری خودکار تاریخ تولد شمسی (YYYY/MM/DD) ───
  onBirthDateInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 8);

    let formatted = cleanDigits;
    if (cleanDigits.length > 4 && cleanDigits.length <= 6) {
      formatted = `${cleanDigits.slice(0, 4)}/${cleanDigits.slice(4)}`;
    } else if (cleanDigits.length > 6) {
      formatted = `${cleanDigits.slice(0, 4)}/${cleanDigits.slice(4, 6)}/${cleanDigits.slice(6, 8)}`;
    }

    this.newPersonnel.birth_date = formatted;
    if (inputEl) {
      inputEl.value = formatted;
    }
    this.cdr.detectChanges();
  }

  // ─── اعتبارسنجی یکدست شماره همراه (تسک ۶.۲) ───
  onPhoneInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 11);
    this.newPersonnel.phone_number = cleanDigits;
    if (inputEl) inputEl.value = cleanDigits;

    if (!cleanDigits) {
      this.phoneError = 'شماره همراه الزامی است.';
    } else if (!/^09\d{9}$/.test(cleanDigits)) {
      this.phoneError = 'شماره همراه باید ۱۱ رقم بوده و با ۰۹ شروع شود.';
    } else {
      this.phoneError = null;
    }
    this.cdr.detectChanges();
  }

  // ─── اعتبارسنجی کد پستی ۱۰ رقمی (تسک ۶.۲) ───
  onPostalCodeInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 10);
    this.newPersonnel.postal_code = cleanDigits;
    if (inputEl) inputEl.value = cleanDigits;

    if (!cleanDigits) {
      this.postalCodeError = 'کد پستی ۱۰ رقمی الزامی است.';
    } else if (cleanDigits.length !== 10) {
      this.postalCodeError = 'کد پستی باید دقیقاً ۱۰ رقم عددی باشد.';
    } else if (/^(\d)\1{9}$/.test(cleanDigits)) {
      this.postalCodeError = 'کد پستی نامعتبر است (ارقام یکسان).';
    } else {
      this.postalCodeError = null;
    }
    this.cdr.detectChanges();
  }

  onIdNumberInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '');
    this.newPersonnel.id_number = cleanDigits;
    if (inputEl) inputEl.value = cleanDigits;
    this.cdr.detectChanges();
  }

  onIdSerialInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '');
    this.newPersonnel.id_serial = cleanDigits;
    if (inputEl) inputEl.value = cleanDigits;
    this.cdr.detectChanges();
  }

  onChildrenCountInput(event: any): void {
    const inputEl = event?.target as HTMLInputElement | undefined;
    const rawVal = inputEl?.value || (typeof event === 'string' ? event : '');
    const cleanDigits = normalizeDigits(rawVal).replace(/\D/g, '');
    this.newPersonnel.children_count = Number(cleanDigits) || 0;
    if (inputEl) inputEl.value = String(this.newPersonnel.children_count);
    this.cdr.detectChanges();
  }

  // ─── مدیریت تب‌ها و گیت تکمیل هر تب (تسک ۶.۱ و ۶.۷) ───
  setActiveTab(tab: PersonnelModalTab): void {
    this.activeModalTab = tab;
    this.cdr.detectChanges();
  }

  isTabComplete(tab: PersonnelModalTab): boolean {
    switch (tab) {
      case 'identity':
        return !!(
          this.newPersonnel.first_name?.trim() &&
          this.newPersonnel.last_name?.trim() &&
          this.newPersonnel.national_code?.trim() &&
          this.newPersonnel.national_code.length === 10 &&
          !this.nationalCodeError &&
          this.newPersonnel.father_name?.trim() &&
          this.newPersonnel.birth_date?.trim() &&
          this.newPersonnel.id_number?.trim() &&
          this.newPersonnel.gender &&
          !this.isFieldMissing('first_name') &&
          !this.isFieldMissing('last_name') &&
          !this.isFieldMissing('national_code') &&
          !this.isFieldMissing('father_name') &&
          !this.isFieldMissing('birth_date') &&
          !this.isFieldMissing('id_number') &&
          !this.isFieldMissing('gender')
        );
      case 'job':
        return !!(
          this.newPersonnel.job_title?.trim() &&
          !this.isFieldMissing('job_title')
        );
      case 'banking':
        return this.hasValidPrimaryBankAccount && !this.isFieldMissing('primary_bank_account');
      case 'address':
        return !!(
          this.newPersonnel.phone_number?.trim() &&
          !this.phoneError &&
          this.newPersonnel.address?.trim() &&
          this.newPersonnel.postal_code?.trim() &&
          !this.postalCodeError &&
          !this.isFieldMissing('phone_number') &&
          !this.isFieldMissing('address') &&
          !this.isFieldMissing('postal_code')
        );
      case 'documents':
        return true;
    }
  }

  isFieldMissing(field: string): boolean {
    return this.serverMissingFields.some(m => m.field === field);
  }

  get missingFieldsList(): string[] {
    const missing: string[] = [];
    if (!this.newPersonnel.first_name?.trim()) missing.push('نام');
    if (!this.newPersonnel.last_name?.trim()) missing.push('نام خانوادگی');
    if (!this.newPersonnel.national_code?.trim() || this.nationalCodeError) missing.push('کد ملی ۱۰ رقمی معتبر');
    if (!this.newPersonnel.father_name?.trim()) missing.push('نام پدر');
    if (!this.newPersonnel.birth_date?.trim()) missing.push('تاریخ تولد');
    if (!this.newPersonnel.id_number?.trim()) missing.push('شماره شناسنامه');
    if (!this.newPersonnel.job_title?.trim()) missing.push('سمت شغلی');
    if (!this.hasValidPrimaryBankAccount) missing.push('حساب بانکی اصلی با شبای معتبر');
    if (!this.newPersonnel.phone_number?.trim() || this.phoneError) missing.push('شماره همراه معتبر (۰۹...)');
    if (!this.newPersonnel.address?.trim()) missing.push('نشانی محل سکونت');
    if (!this.newPersonnel.postal_code?.trim() || this.postalCodeError) missing.push('کد پستی ۱۰ رقمی');

    for (const sm of this.serverMissingFields) {
      if (sm.label && !missing.includes(sm.label)) {
        missing.push(sm.label);
      }
    }
    return missing;
  }

  get isSubmitDisabled(): boolean {
    return !this.isTabComplete('identity') ||
           !this.isTabComplete('job') ||
           !this.isTabComplete('banking') ||
           !this.isTabComplete('address');
  }

  // ─── مدیریت حساب‌های بانکی چندگانه (تسک ۶.۴) ───
  get hasValidPrimaryBankAccount(): boolean {
    if (this.bankAccounts.length > 0) {
      return this.bankAccounts.some(a => a.is_primary && a.sheba_number && validateSheba(extractShebaDigits(a.sheba_number)).isValid);
    }
    return !!(this.newPersonnel.sheba_number && this.shebaValidationResult?.isValid);
  }

  setPrimaryAccount(index: number): void {
    if (this.isReadOnlyMode) return;
    this.bankAccounts.forEach((acc, i) => {
      acc.is_primary = (i === index);
    });
    this.syncPrimaryToProfile();
    this.toast.show('success', `حساب «${this.bankAccounts[index].bank_name}» به عنوان حساب اصلی واریز حقوق تعیین شد.`);
    this.cdr.detectChanges();
  }

  removeBankAccount(index: number): void {
    if (this.isReadOnlyMode) return;
    const wasPrimary = this.bankAccounts[index].is_primary;
    this.bankAccounts.splice(index, 1);
    if (wasPrimary && this.bankAccounts.length > 0) {
      this.bankAccounts[0].is_primary = true;
    }
    this.syncPrimaryToProfile();
    this.toast.show('info', 'حساب بانکی حذف شد.');
    this.cdr.detectChanges();
  }

  addCurrentAsNewAccount(): void {
    if (this.isReadOnlyMode) return;
    if (!this.newPersonnel.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    if (!this.newPersonnel.sheba_number || !this.shebaValidationResult?.isValid) {
      this.toast.show('warning', this.shebaValidationResult?.errorMessage || 'شماره شبا معتبر نیست.');
      return;
    }
    const isFirst = this.bankAccounts.length === 0;
    const clean = cleanShebaInput(this.newPersonnel.sheba_number);
    const newAcc: PersonnelBankAccount = {
      bank_name: this.newPersonnel.bank_name,
      account_number: this.newPersonnel.account_number || '',
      sheba_number: clean,
      card_number: this.newPersonnel.card_number || '',
      is_primary: isFirst,
      is_active: true
    };
    this.bankAccounts.push(newAcc);
    this.toast.show('success', `حساب بانکی «${newAcc.bank_name}» به لیست حساب‌های پرسنل افزوده شد.`);
    this.syncPrimaryToProfile();
    this.cdr.detectChanges();
  }

  syncPrimaryToProfile(): void {
    const prim = this.bankAccounts.find(a => a.is_primary) || this.bankAccounts[0];
    if (prim) {
      this.newPersonnel.bank_name = prim.bank_name;
      this.newPersonnel.account_number = prim.account_number;
      this.newPersonnel.sheba_number = prim.sheba_number;
      this.newPersonnel.card_number = prim.card_number;
      this.shebaValidationResult = validateSheba(extractShebaDigits(prim.sheba_number));
      this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || extractShebaDigits(prim.sheba_number || '');
    }
  }

  // ─── مدیریت مدارک چندگانه و لایت‌باکس (تسک ۶.۶) ───
  get isOffline(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
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

  onMultipleFilesSelected(event: any): void {
    if (this.isReadOnlyMode) return;
    const files: FileList | null = event.target?.files;
    if (!files || files.length === 0) return;

    if (this.isOffline) {
      this.toast.show('warning', 'در حالت آفلاین امکان آپلود مدارک وجود ندارد. مشخصات متنی پرونده را ذخیره فرمایید.');
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        this.toast.show('warning', `حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است.`);
        continue;
      }
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      this.pendingUploadDocuments.push({
        file,
        doc_type: this.selectedDocTypeForUpload,
        previewUrl,
        name: file.name,
        size: file.size
      });
    }
    this.toast.show('success', `${files.length} مدرک به صف پیوست‌ها افزوده شد.`);
    this.cdr.detectChanges();
  }

  removePendingDocument(index: number): void {
    const doc = this.pendingUploadDocuments[index];
    if (doc?.previewUrl) {
      try { URL.revokeObjectURL(doc.previewUrl); } catch {}
    }
    this.pendingUploadDocuments.splice(index, 1);
    this.cdr.detectChanges();
  }

  async deleteExistingDocument(doc: PersonnelDocument): Promise<void> {
    if (this.isReadOnlyMode) return;
    if (!this.editingId || !doc.id) return;
    if ((await this.confirmDialog?.open({ title: 'حذف', message: 'آیا از حذف این مدرک اطمینان دارید؟', type: 'danger', confirmText: 'حذف' })) !== true) return;

    this.personnelApi.deletePersonnelDocument(this.editingId, doc.id).subscribe({
      next: () => {
        this.existingDocuments = this.existingDocuments.filter(d => d.id !== doc.id);
        this.toast.show('success', 'مدرک با موفقیت حذف گردید.');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در حذف مدرک: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── معادل تومان مزد پایه روزانه ───
  get wageInTomans(): number {
    return Math.floor((Number(this.newPersonnel.daily_base_wage) || 0) / 10);
  }

  // ─── ثبت و بروزرسانی پرونده پرسنل (پیش‌نویس، ارسال به سرپرست یا پیشنهاد ویرایش) ───
  // فیلدهای قابل‌ویرایش فرم کارمند؛ در ویرایش فقط تغییرات همین‌ها فرستاده می‌شود (DEF-08 و DEF-16)
  private static readonly EDITABLE_FIELDS = [
    'first_name', 'last_name', 'national_code', 'father_name', 'gender', 'id_number', 'id_series', 'id_serial',
    'birth_date', 'birth_place', 'issue_place', 'issue_date', 'job_title', 'job_code', 'contract_type',
    'marital_status', 'children_count', 'phone_number', 'address', 'postal_code', 'notes',
    'valid_until_date', 'recommender', 'section'
  ];
  private static readonly BANK_MIRROR_FIELDS = ['bank_name', 'account_number', 'sheba_number', 'card_number'];

  /**
   * مقادیر فرم برای ارسال. دستمزد عمداً حذف است؛ تعیین آن منحصراً در کارتابل حسابدار است
   * (تصمیم‌های مصوب ۶.۵ و ۶.۹، DEF-21) و وضعیت گردش کار هم فقط از اکشن‌ها تغییر می‌کند (DEF-02).
   */
  private buildFormValues(): Record<string, any> {
    const np: any = this.newPersonnel;
    const text = (v: any): string => (typeof v === 'string' ? v.trim() : (v === null || v === undefined ? '' : String(v)));
    return stripMaskedValues({
      first_name: text(np.first_name),
      last_name: text(np.last_name),
      national_code: text(np.national_code),
      father_name: text(np.father_name),
      gender: np.gender || 'مرد',
      id_number: text(np.id_number),
      id_series: text(np.id_series),
      id_serial: text(np.id_serial),
      birth_date: text(np.birth_date),
      birth_place: text(np.birth_place),
      issue_place: text(np.issue_place),
      issue_date: text(np.issue_date),
      job_title: text(np.job_title),
      job_code: text(np.job_code),
      contract_type: np.contract_type || 'daily',
      marital_status: np.marital_status || 'single',
      children_count: Number(np.children_count) || 0,
      phone_number: text(np.phone_number),
      address: text(np.address),
      postal_code: text(np.postal_code),
      notes: text(np.notes),
      valid_until_date: text(np.valid_until_date),
      recommender: text(np.recommender),
      section: this.selectedSectionId,
      bank_name: text(np.bank_name),
      account_number: text(np.account_number),
      sheba_number: np.sheba_number ? cleanShebaInput(np.sheba_number) : '',
      card_number: text(np.card_number),
    });
  }

  private normalizeForDiff(v: any): string {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  /** فقط فیلدهایی که نسبت به لحظهٔ بازشدن فرم تغییر کرده‌اند؛ پیش‌فرض‌های نمایشی diff نمی‌شوند */
  private buildChangedFields(includeBankMirror: boolean): Record<string, any> {
    const current = this.buildFormValues();
    const initial = this.initialFormSnapshot || {};
    const keys = [
      ...EmployeeNewPersonnelHubComponent.EDITABLE_FIELDS,
      ...(includeBankMirror ? EmployeeNewPersonnelHubComponent.BANK_MIRROR_FIELDS : [])
    ];
    const changed: Record<string, any> = {};
    for (const key of keys) {
      if (this.normalizeForDiff(current[key]) !== this.normalizeForDiff(initial[key])) {
        changed[key] = current[key];
      }
    }
    return changed;
  }

  private extractServerError(err: any): string {
    const e = err?.error;
    if (!e) return err?.message || 'نامشخص';
    if (typeof e === 'string') return e;
    if (e.error || e.detail) {
      let msg: string = e.error || e.detail;
      if (Array.isArray(e.missing_fields) && e.missing_fields.length) {
        const labels = e.missing_fields.map((m: any) => (typeof m === 'string' ? m : (m?.label || m?.field))).filter(Boolean);
        if (labels.length) msg += ': ' + labels.join('، ');
      }
      return msg;
    }
    for (const [field, value] of Object.entries(e)) {
      const msg = Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : null);
      if (msg) return `${field}: ${msg}`;
    }
    return err?.message || 'نامشخص';
  }

  /** حساب‌های مطلوب فرم؛ اگر کاربر فقط شبای اصلی را تایپ کرده باشد همان حساب اصلی است */
  private desiredBankAccounts(): PersonnelBankAccount[] {
    if (this.bankAccounts.length > 0) return this.bankAccounts;
    const sheba = this.newPersonnel.sheba_number ? cleanShebaInput(this.newPersonnel.sheba_number) : '';
    if (sheba && validateSheba(extractShebaDigits(sheba)).isValid) {
      return [{
        bank_name: this.newPersonnel.bank_name || '',
        account_number: this.newPersonnel.account_number || '',
        sheba_number: sheba,
        card_number: this.newPersonnel.card_number || '',
        is_primary: true,
        is_active: true
      }];
    }
    return [];
  }

  private accountFieldChanges(original: PersonnelBankAccount | undefined, current: PersonnelBankAccount): Record<string, any> {
    const changes: Record<string, any> = {};
    const fields: Array<keyof PersonnelBankAccount> = ['bank_name', 'account_number', 'sheba_number', 'card_number', 'description'];
    for (const f of fields) {
      const cur = f === 'sheba_number' ? cleanShebaInput(String(current.sheba_number || '')) : current[f];
      const orig = f === 'sheba_number' ? cleanShebaInput(String(original?.sheba_number || '')) : original?.[f];
      if (this.normalizeForDiff(cur) !== this.normalizeForDiff(orig)) changes[f as string] = cur ?? '';
    }
    return stripMaskedValues(changes);
  }

  /**
   * همگام‌سازی حساب‌های بانکی پروندهٔ موجود فقط با اکشن bank-accounts (نویسندهٔ واحد، DEF-08 و DEF-10).
   * ترتیب: اول حساب اصلی (اصلی‌شدن آن حساب اصلی قبلی را در سرور خاموش می‌کند)، بعد حساب‌های دیگر، و در آخر حذف‌ها.
   * خطای هر عملیات جمع می‌شود و بقیه را متوقف نمی‌کند.
   */
  private syncBankAccounts$(personnelId: number): Observable<string[]> {
    const desired = this.desiredBankAccounts();
    const original = this.initialBankAccounts;
    const snapshot = (list: PersonnelBankAccount[]) => JSON.stringify(list.map(a => [a.id ?? null, a.bank_name, a.account_number || '', cleanShebaInput(String(a.sheba_number || '')), a.card_number || '', !!a.is_primary]));
    if (snapshot(desired) === snapshot(original)) return of([]);

    const body = (a: PersonnelBankAccount) => stripMaskedValues({
      bank_name: a.bank_name,
      account_number: a.account_number || '',
      sheba_number: shebaOrMasked(a.sheba_number),
      card_number: a.card_number || '',
      description: a.description || ''
    });
    const ops: Array<{ label: string; obs: Observable<any> }> = [];
    const primary = desired.find(a => a.is_primary) || desired[0];
    const ordered = primary ? [primary, ...desired.filter(a => a !== primary)] : desired;
    for (const acc of ordered) {
      const isPrimary = acc === primary;
      if (!acc.id) {
        ops.push({ label: acc.bank_name, obs: this.personnelApi.addPersonnelBankAccount(personnelId, { ...body(acc), is_primary: isPrimary }) });
        continue;
      }
      const orig = original.find(o => o.id === acc.id);
      const changes = this.accountFieldChanges(orig, acc);
      // is_primary=false هرگز فرستاده نمی‌شود؛ سرور برداشتن مستقیم حساب اصلی را رد می‌کند
      if (isPrimary && !orig?.is_primary) changes['is_primary'] = true;
      if (Object.keys(changes).length) {
        ops.push({ label: acc.bank_name, obs: this.personnelApi.updatePersonnelBankAccount(personnelId, { id: acc.id, ...changes }) });
      }
    }
    const keptIds = new Set(desired.filter(a => a.id).map(a => a.id));
    const deletions: Array<{ label: string; obs: Observable<any> }> = [];
    for (const orig of original) {
      if (orig.id && !keptIds.has(orig.id)) {
        deletions.push({ label: orig.bank_name, obs: this.personnelApi.deletePersonnelBankAccount(personnelId, orig.id) });
      }
    }
    const runAll = (list: Array<{ label: string; obs: Observable<any> }>): Observable<string[]> => list.length
      ? concat(...list.map(op => op.obs.pipe(
          map(() => null as string | null),
          catchError(err => of(`حساب «${op.label}»: ${this.extractServerError(err)}`))
        ))).pipe(toArray(), map(results => results.filter((r): r is string => !!r)))
      : of([]);
    // حساب قدیمی فقط پس از ثبت موفق همهٔ حساب‌های جدید و ویرایش‌ها حذف می‌شود؛ وگرنه پرونده بی‌حساب می‌ماند
    return runAll(ops).pipe(switchMap(problems => {
      if (problems.length && deletions.length) {
        return of([...problems, `${deletions.length} حساب کنارگذاشته حذف نشد تا ابتدا حساب جایگزین با موفقیت ثبت شود`]);
      }
      return runAll(deletions).pipe(map(deleteProblems => [...problems, ...deleteProblems]));
    }));
  }

  /** آپلود مدارک صف؛ موارد ناموفق در صف می‌مانند و پیام خطایشان برمی‌گردد (DEF-24) */
  private uploadPendingDocuments$(personnelId: number): Observable<string[]> {
    if (this.pendingUploadDocuments.length === 0) return of([]);
    const queue = [...this.pendingUploadDocuments];
    return concat(...queue.map(doc => this.personnelApi.uploadPersonnelDocument(personnelId, doc.file, doc.doc_type).pipe(
      map((uploaded: PersonnelDocument) => {
        this.pendingUploadDocuments = this.pendingUploadDocuments.filter(d => d !== doc);
        if (uploaded) this.existingDocuments = [...this.existingDocuments, uploaded];
        if (doc.previewUrl) {
          try { URL.revokeObjectURL(doc.previewUrl); } catch {}
        }
        return null as string | null;
      }),
      catchError(err => of(`مدرک «${doc.name}»: ${this.extractServerError(err)}`))
    ))).pipe(toArray(), map(results => results.filter((r): r is string => !!r)));
  }

  /** حساب‌های غیراصلی پس از ایجاد با FormData (که حساب تودرتو ندارد) از اکشن bank-accounts افزوده می‌شوند */
  private addExtraAccountsAfterFormDataCreate$(personnelId: number): Observable<string[]> {
    const extras = this.bankAccounts.filter(a => !a.is_primary);
    if (!extras.length) return of([]);
    return concat(...extras.map(acc => this.personnelApi.addPersonnelBankAccount(personnelId, {
      bank_name: acc.bank_name,
      account_number: acc.account_number || '',
      sheba_number: cleanShebaInput(String(acc.sheba_number || '')),
      card_number: acc.card_number || '',
      is_primary: false
    }).pipe(
      map(() => null as string | null),
      catchError(err => of(`حساب «${acc.bank_name}»: ${this.extractServerError(err)}`))
    ))).pipe(toArray(), map(results => results.filter((r): r is string => !!r)));
  }

  savePersonnel(targetStatus: 'draft' | 'pending_supervisor' = 'draft'): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    if (!this.newPersonnel.first_name?.trim() || !this.newPersonnel.last_name?.trim()) {
      this.toast.show('warning', 'نام و نام خانوادگی پرسنل الزامی است.');
      return;
    }
    if (!this.newPersonnel.national_code?.trim() || this.newPersonnel.national_code.trim().length !== 10) {
      this.toast.show('warning', 'کد ملی ۱۰ رقمی الزامی است.');
      return;
    }
    if (this.nationalCodeError) {
      this.toast.show('warning', this.nationalCodeError);
      return;
    }
    if (this.shebaValidationResult && !this.shebaValidationResult.isValid) {
      this.toast.show('warning', this.shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.');
      return;
    }

    this.isSaving = true;

    // همگام‌سازی حساب بانکی اصلی با فیلدهای ریشه پرونده
    this.syncPrimaryToProfile();

    if (this.editingId) {
      this.saveExistingPersonnel(targetStatus);
    } else if (this.existingPersonnelId) {
      this.assignExistingPersonnelToSection();
    } else {
      this.createNewPersonnel(targetStatus);
    }
  }

  private assignExistingPersonnelToSection(): void {
    if (this.selectedSectionId === this.existingPersonnelSectionId) {
      this.toast.show('warning', 'این پرسنل قبلاً در همین بخش ثبت شده است. در صورت نیاز به ویرایش مشخصات، از دکمه ویرایش در جدول پرسنل استفاده نمایید.');
      this.isSaving = false;
      return;
    }

    this.personnelApi.assignPersonnelToSection(this.existingPersonnelId!, {
      section_id: this.selectedSectionId!,
      job_title: this.newPersonnel.job_title?.trim() || undefined,
      daily_base_wage: this.newPersonnel.daily_base_wage !== undefined ? this.newPersonnel.daily_base_wage : undefined,
      notes: this.newPersonnel.notes?.trim() || undefined
    }).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.toast.show('success', res?.message || `پرسنل «${this.newPersonnel.first_name} ${this.newPersonnel.last_name}» با موفقیت به این بخش منتسب شد.`);
        this.resetForm();
        this.closeNewPersonnelModal();
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در انتساب پرسنل به بخش جدید: ' + this.extractServerError(err));
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * ایجاد پرونده: سرور همیشه پیش‌نویس می‌سازد (DEF-02). برای «ارسال»، وضعیت draft فرستاده نمی‌شود تا سرور
   * عبور هوشمند نقش‌های بالاتر را با گیت اعمال کند؛ اگر پرونده پیش‌نویس ماند، submit جدا صدا زده می‌شود.
   */
  private createNewPersonnel(targetStatus: 'draft' | 'pending_supervisor'): void {
    const values = this.buildFormValues();
    const companyId = this.selectedSection?.company_id;
    let payload: Record<string, any> | FormData;

    if (this.selectedDocumentAttachment) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(values)) {
        if (value !== '' && value !== null && value !== undefined) formData.append(key, String(value));
      }
      if (companyId) formData.append('company', String(companyId));
      if (targetStatus === 'draft') formData.append('approval_status', 'draft');
      formData.append('attachment', this.selectedDocumentAttachment);
      payload = formData;
    } else {
      const body: Record<string, any> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value !== '' && value !== null && value !== undefined) body[key] = value;
      }
      if (companyId) body['company'] = companyId;
      if (targetStatus === 'draft') body['approval_status'] = 'draft';
      if (this.bankAccounts.length > 0) {
        // نویسندهٔ واحد: با حساب‌های تودرتو، سرور فیلدهای تخت بانکی را نادیده می‌گیرد (DEF-01)
        body['bank_accounts'] = this.bankAccounts.map(a => stripMaskedValues({
          bank_name: a.bank_name,
          account_number: a.account_number || '',
          sheba_number: shebaOrMasked(a.sheba_number),
          card_number: a.card_number || '',
          is_primary: !!a.is_primary,
          is_active: a.is_active !== false
        }));
      }
      payload = body;
    }

    const isFormData = payload instanceof FormData;
    this.personnelApi.createPersonnelProfile(payload as any).pipe(
      switchMap((created: any) => {
        if (created?._offlinePending || !created?.id || created.id < 0) {
          return of({ created, problems: [] as string[], queued: true });
        }
        const extras$ = isFormData ? this.addExtraAccountsAfterFormDataCreate$(created.id) : of([] as string[]);
        return extras$.pipe(
          switchMap(accountProblems => this.uploadPendingDocuments$(created.id).pipe(
            map(docProblems => ({ created, problems: [...accountProblems, ...docProblems], queued: false }))
          ))
        );
      })
    ).subscribe({
      next: ({ created, problems, queued }) => {
        const fullName = `${created.first_name} ${created.last_name}`;
        if (!queued) this.clearLocalDraftAfterServerSave();
        if (queued) {
          // در صف آفلاین؛ ارسال به سرپرست شناسهٔ واقعی سرور را لازم دارد و پس از ثبت، از جدول انجام می‌شود
          this.isSaving = false;
          const docsLeft = this.pendingUploadDocuments.length;
          this.toast.show('warning',
            `پرونده «${fullName}» در صف آفلاین ذخیره شد و پس از برقراری اتصال ثبت می‌شود.` +
            (targetStatus === 'pending_supervisor' ? ' پس از ثبت، آن را از جدول به سرپرست ارسال کنید.' : '') +
            (docsLeft ? ` ${docsLeft} مدرک بارگذاری نشد و باید پس از اتصال دوباره افزوده شود.` : ''));
          this.resetForm();
          this.closeNewPersonnelModal();
          this.loadRecentPersonnel();
          return;
        }
        this.finishSave(created, targetStatus, problems, true);
      },
      error: (err: any) => {
        this.isSaving = false;
        if (isServerUnreachable(err?.status || 0)) {
          this.cachePersonnelFormLocally();
          this.toast.show('warning', 'ارتباط با سرور برقرار نشد؛ اطلاعات پرونده به صورت محلی ذخیره گردید.');
        } else {
          this.toast.show('error', 'خطا در ثبت پرسنل: ' + this.extractServerError(err));
        }
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * ویرایش پروندهٔ موجود: PATCH فقط تغییرات (DEF-08). پروندهٔ مصوب از مسیر درخواست تغییرات و همراه فیلدهای
   * آینهٔ بانکی؛ پیش‌نویس و عودت‌شده با همگام‌سازی حساب‌ها از اکشن bank-accounts.
   */
  private saveExistingPersonnel(targetStatus: 'draft' | 'pending_supervisor'): void {
    const id = this.editingId!;
    const isApproved = this.isApprovedRecord;
    const changes = this.buildChangedFields(isApproved);

    let patch$: Observable<any>;
    if (this.selectedDocumentAttachment) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(changes)) {
        formData.append(key, value === null || value === undefined ? '' : String(value));
      }
      formData.append('attachment', this.selectedDocumentAttachment);
      patch$ = this.personnelApi.updatePersonnelProfile(id, formData);
    } else if (Object.keys(changes).length) {
      patch$ = this.personnelApi.updatePersonnelProfile(id, changes);
    } else {
      patch$ = of(null);
    }

    patch$.pipe(
      switchMap((res: any) => {
        const bank$ = isApproved ? of([] as string[]) : this.syncBankAccounts$(id);
        return bank$.pipe(
          switchMap(accountProblems => this.uploadPendingDocuments$(id).pipe(
            map(docProblems => ({ res, problems: [...accountProblems, ...docProblems] }))
          ))
        );
      })
    ).subscribe({
      next: ({ res, problems }) => {
        const fullName = `${this.newPersonnel.first_name} ${this.newPersonnel.last_name}`;
        if (!res?._offlinePending) this.clearLocalDraftAfterServerSave();
        if (isApproved) {
          this.isSaving = false;
          if (res?._offlinePending) {
            this.toast.show('warning', `درخواست تغییرات پرونده «${fullName}» در صف آفلاین ثبت شد و پس از اتصال ارسال می‌شود.`);
          } else if (res?.change_request_id) {
            this.toast.show('success', `درخواست تغییرات پرونده «${fullName}» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.`);
          } else {
            this.toast.show('info', 'تغییری نسبت به اطلاعات فعلی پرونده مصوب ثبت نشد.');
          }
          if (problems.length) {
            this.toast.show('warning', `هشدار: ${problems.join('، ')}`);
          }
          this.closeNewPersonnelModal();
          this.loadRecentPersonnel();
          return;
        }
        const saved: PersonnelProfile = res && res.id && !res._offlinePending
          ? res
          : ({ ...(this.editingPersonnel || {}), ...changes, id } as PersonnelProfile);
        this.finishSave(saved, targetStatus, problems, false);
      },
      error: (err: any) => {
        this.isSaving = false;
        if (isServerUnreachable(err?.status || 0)) {
          this.cachePersonnelFormLocally();
          this.toast.show('warning', 'ارتباط با سرور برقرار نشد؛ اطلاعات پرونده به صورت محلی ذخیره گردید.');
        } else {
          this.toast.show('error', 'خطا در ذخیره تغییرات پرسنل: ' + this.extractServerError(err));
        }
        this.cdr.detectChanges();
      }
    });
  }

  /** پس از ذخیره، مودال روی همان پرونده می‌ماند تا نواقص یا مدارک ناموفق قابل اصلاح باشند */
  private keepModalOnSavedRecord(saved: PersonnelProfile, missing?: Array<{ field: string; label: string }>): void {
    const keepDocs = this.pendingUploadDocuments;
    const keepDocsList = this.existingDocuments;
    const intendedAccounts = this.desiredBankAccounts().map(a => ({ ...a }));
    this.openEditModal(missing ? ({ ...saved, missing_fields: missing } as PersonnelProfile) : saved);
    this.pendingUploadDocuments = keepDocs;
    if (!saved.documents?.length) this.existingDocuments = keepDocsList;
    if (saved.id && !this.isApprovedRecord) {
      this.restoreIntendedBankAccounts(saved.id, intendedAccounts);
    }
    this.loadRecentPersonnel();
  }

  /**
   * حساب‌های سرور مبنای diff می‌شوند و خواستهٔ کاربر (حساب ناموفق، ویرایش ناموفق، حذف انجام‌نشده) در فرم می‌ماند
   * تا ذخیرهٔ بعدی همان‌ها را دوباره بفرستد؛ حساب تازه‌ای که ثبت شده با شبا به ردیف سرور پیوند می‌خورد.
   */
  private restoreIntendedBankAccounts(personnelId: number, intended: PersonnelBankAccount[]): void {
    if (!intended.length) return;
    this.personnelApi.getPersonnelBankAccounts(personnelId).subscribe({
      next: (serverAccounts) => {
        if (this.editingId !== personnelId) return;
        const server = (serverAccounts || []).map(a => ({ ...a }));
        const usedIds = new Set(intended.filter(a => a.id).map(a => a.id));
        this.initialBankAccounts = server.map(a => ({ ...a }));
        this.bankAccounts = intended.map(acc => {
          if (acc.id) return acc;
          const sheba = cleanShebaInput(String(acc.sheba_number || ''));
          const match = server.find(sa => !usedIds.has(sa.id) && cleanShebaInput(String(sa.sheba_number || '')) === sheba);
          if (!match) return acc;
          usedIds.add(match.id);
          return { ...match, is_primary: acc.is_primary };
        });
        this.syncPrimaryToProfile();
        this.cdr.detectChanges();
      },
      error: () => {
        // بدون پاسخ سرور، خواستهٔ کاربر در فرم می‌ماند تا داده‌ای از دست نرود
        this.bankAccounts = intended;
        this.cdr.detectChanges();
      }
    });
  }

  private finishSave(saved: PersonnelProfile, targetStatus: 'draft' | 'pending_supervisor', problems: string[], isNew: boolean): void {
    const fullName = `${saved.first_name || this.newPersonnel.first_name} ${saved.last_name || this.newPersonnel.last_name}`;
    const problemNote = problems.length ? ` هشدار: ${problems.join('، ')}` : '';

    if (targetStatus !== 'pending_supervisor') {
      this.isSaving = false;
      if (problems.length) {
        this.toast.show('warning', `پرونده «${fullName}» در وضعیت پیش‌نویس ذخیره شد.${problemNote}`);
        this.keepModalOnSavedRecord(saved);
      } else {
        this.toast.show('success', isNew
          ? `پرونده «${fullName}» در وضعیت پیش‌نویس ثبت شد.`
          : `تغییرات پیش‌نویس پرونده «${fullName}» با موفقیت ذخیره شد.`);
        this.resetForm();
        this.closeNewPersonnelModal();
        this.loadRecentPersonnel();
      }
      return;
    }

    // عبور هوشمند نقش بالاتر در سرور: پرونده دیگر پیش‌نویس نیست و submit لازم ندارد
    if (saved.approval_status && !['draft', 'revision_required'].includes(saved.approval_status)) {
      this.isSaving = false;
      this.toast.show(problems.length ? 'warning' : 'success',
        `پرونده «${fullName}» ثبت شد و با عبور هوشمند در مرحلهٔ «${this.getStatusLabel(saved.approval_status)}» قرار گرفت.${problemNote}`);
      this.resetForm();
      this.closeNewPersonnelModal();
      this.loadRecentPersonnel();
      return;
    }

    this.personnelApi.submitPersonnelProfile(saved.id!).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        if (res?._offlinePending) {
          this.toast.show('warning', `پرونده «${fullName}» ذخیره شد و ارسال آن به سرپرست در صف آفلاین است.${problemNote}`);
        } else {
          this.toast.show(problems.length ? 'warning' : 'success', `پرونده «${fullName}» ذخیره و به کارتابل سرپرست ارسال گردید.${problemNote}`);
        }
        if (problems.length) {
          this.keepModalOnSavedRecord(res && res.id && !res._offlinePending ? res : saved);
          return;
        }
        this.resetForm();
        this.closeNewPersonnelModal();
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        this.isSaving = false;
        // ذخیره شد ولی ارسال نشد: مودال باز می‌ماند و نواقص سرور روی تب‌ها نشان داده می‌شود (DEF-02)
        const missing: Array<{ field: string; label: string }> = err?.error?.missing_fields || [];
        this.keepModalOnSavedRecord(saved, missing.length ? missing : undefined);
        this.toast.show('warning', `پرونده «${fullName}» ذخیره شد ولی به سرپرست ارسال نشد؛ ` +
          (missing.length ? `نواقص: ${missing.map(m => m.label).join('، ')}` : this.extractServerError(err)) + problemNote);
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ارسال پرونده جهت بررسی و تایید سرپرست بخش (تسک ۶.۷) ───
  submitDraftPersonnel(): void {
    if (this.isSubmitDisabled) {
      const missing = this.missingFieldsList;
      this.toast.show('warning', `نواقص الزامی جهت ارسال به سرپرست: ${missing.join('، ')}`);
      return;
    }

    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }

    // ذخیرهٔ آخرین تغییرات و سپس اکشن submit سرور
    this.savePersonnel('pending_supervisor');
  }

  /** حفظ دادهٔ فرم هنگام قطعی سرور در پایگاه‌دادهٔ محلی (نه localStorage)؛ هنگام بازکردن مودال پیشنهاد می‌شود (DEF-24) */
  cachePersonnelFormLocally(): void {
    if (!this.activeLocalDraftId) this.activeLocalDraftId = this.editingId ? `p${this.editingId}` : newPersonnelLocalDraftId();
    const key = this.localDraftKey;
    if (!key || !this.selectedSectionId) return;
    const { attachment, documents, ...form } = this.newPersonnel as any;
    savePersonnelLocalDraft({
      key,
      userId: this.auth.user()?.id ?? null,
      sectionId: this.selectedSectionId,
      personnelId: this.editingId || null,
      savedAt: new Date().toISOString(),
      form,
      bankAccounts: this.bankAccounts.map(a => ({ ...a })) as unknown as Array<Record<string, unknown>>
    }).catch(() => {
      this.toast.show('error', 'ذخیرهٔ محلی پیش‌نویس ممکن نشد؛ لطفاً مودال را نبندید تا اتصال برقرار شود.');
    });
  }

  savePersonnelDraft(): void {
    this.savePersonnel('draft');
  }

  resetForm(): void {
    this.newPersonnel = {
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
      gender: 'مرد',
      job_title: 'کارگر انبار',
      job_code: '',
      contract_type: 'daily',
      marital_status: 'single',
      children_count: 0,
      daily_base_wage: 0,
      phone_number: '',
      address: '',
      postal_code: '',
      bank_name: '',
      account_number: '',
      sheba_number: '',
      notes: '',
      is_active: true,
      approval_status: 'draft'
    };
    this.activeModalTab = 'identity';
    this.phoneError = null;
    this.postalCodeError = null;
    this.serverMissingFields = [];
    this.bankAccounts = [];
    this.existingDocuments = [];
    this.pendingUploadDocuments = [];
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.wageFormattedDisplay = '';
    this.isShebaCopied = false;
    this.isAccountCopied = false;
    this.isPhoneCopied = false;
    this.foundExistingPersonnel = null;
    this.isFoundPersonnelRejected = false;
    this.existingPersonnelId = null;
    this.existingPersonnelSectionId = null;
    this.isLookingUpNationalCode = false;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.selectedDocumentAttachment = null;
    this.attachmentFileName = '';
    this.nationalCodeError = null;
  }

  // ─── حذف پرسنل پیش‌نویس یا عودت‌داده‌شده ───
  async deleteDraftPersonnel(personnel: PersonnelProfile): Promise<void> {
    if (!personnel.id) return;
    if (personnel.approval_status !== 'draft' && personnel.approval_status !== 'revision_required') {
      this.toast.show('warning', 'فقط پرونده‌های در وضعیت پیش‌نویس یا عودت‌داده‌شده قابل حذف توسط کارمند هستند.');
      return;
    }

    const typeDesc = personnel.approval_status === 'revision_required' ? 'عودت‌داده‌شده' : 'پیش‌نویس';
    if ((await this.confirmDialog?.open({ title: 'حذف', message: `آیا از حذف پرونده ${typeDesc} «${personnel.first_name} ${personnel.last_name}» اطمینان دارید؟`, type: 'danger', confirmText: 'حذف' })) !== true) {
      return;
    }

    this.personnelApi.deletePersonnelProfile(personnel.id).subscribe({
      next: () => {
        this.toast.show('success', `پرونده ${typeDesc} «${personnel.first_name} ${personnel.last_name}» حذف گردید.`);
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در حذف پرونده: ' + (err.error?.error || err.message || 'نامشخص'));
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
      case 'pending_accountant':
      case 'pending_manager':
      case 'manager_approved':
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
      case 'pending_accountant':
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
        return 'سرپرست';
      case 'pending_accountant':
        return 'حسابدار';
      case 'pending_manager':
        return 'مدیر';
      case 'manager_approved':
        return 'تایید مدیر';
      case 'approved':
        return 'مصوب';
      case 'revision_required':
        return 'عودت';
      case 'rejected':
        return 'رد شده';
      default:
        return status || 'نامشخص';
    }
  }

  getFullStatusDescription(status?: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس ثبت شده توسط کارمند انبار';
      case 'pending_supervisor':
        return 'در انتظار بررسی و تایید سرپرست انبار';
      case 'pending_accountant':
        return 'تایید سرپرست / در انتظار بررسی حسابدار';
      case 'pending_manager':
        return 'تایید حسابدار / در انتظار تصویب مدیر';
      case 'manager_approved':
        return 'تایید اولیه مدیر';
      case 'approved':
        return 'تصویب و فعال‌سازی نهایی شده';
      case 'revision_required':
        return 'نیازمند بازنگری و اصلاح به دلیل اشکال';
      case 'rejected':
        return 'رد شده و باطل گردیده';
      default:
        return status || 'نامشخص';
    }
  }

  getContractTypeLabel(type?: string): string {
    switch (type) {
      case 'daily':
        return 'روزمزد (۱۰ ساعت)';
      default:
        return 'روزمزد (۱۰ ساعت)';
    }
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

  copyToClipboard(text?: string, label: string = 'متن'): void {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.toast.show('success', `${label} در کلیپ‌بورد کپی شد.`);
      }).catch(() => {
        this.toast.show('info', text);
      });
    } else {
      this.toast.show('info', text);
    }
  }

  // ─── مدیریت کپی سریع با تیک سبز ۲ ثانیه‌ای (فاز ۷ - تسک ۷.۱) ───
  copyValue(val?: string, key?: string, label: string = 'مقدار'): void {
    if (!val || isMaskedValue(val)) return;
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

  navigateToVehicle(): void {
    this.router.navigate(['/app/finance/employee-new-vehicle'], {
      queryParams: this.selectedSectionId ? { section_id: this.selectedSectionId } : {}
    });
  }
}
