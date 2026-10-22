import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniesStudioFacade } from '../companies-studio.facade';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyDocument, CompanyDocumentType } from '../../../../../core/models/company.model';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DocumentPreviewComponent } from '../../../../../shared/components/document-preview/document-preview.component';
import { ExternalLinkDirective } from '../../../../../shared/directives/external-link.directive';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { FileUploadComponent } from '../../../../../shared/components/file-upload/file-upload.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';

/** شناسهٔ تب هسته‌ای که این بخش در انتهای آن می‌نشیند (شمارندهٔ تب از همین بخش می‌آید) */
const DOCUMENTS_TAB_ID = 'documents';

/**
 * بخش «بایگانی جامع مدارک» در انتهای تب «مدارک» استودیوی شرکت
 * (مشارکت ماژول حسابداری از راه `companies.studioSections`). دو سند مادر در هسته می‌مانند.
 */
@Component({
  selector: 'app-company-archive-section',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, DocumentPreviewComponent, ExternalLinkDirective, SvgIconDirective, ActionButtonComponent, FileUploadComponent, LoadingSkeletonComponent],
  providers: [CompaniesStudioFacade],
  host: { class: 'block' },
  templateUrl: './company-archive-section.html'
})
export class CompanyArchiveSectionComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private facade = inject(CompaniesStudioFacade);
  private companyApi = inject(CompanyApiService);
  private studioContext = inject(CompanyStudioContextService);

  /** حالت محدود استودیو: بارگذاری و حذف با «نوشتن» بایگانی؛ سند محرمانه با کار حساس (سرور هم می‌سنجد) */
  get canWriteArchive(): boolean {
    return this.studioContext.canWrite('docs_archive');
  }

  get canWriteConfidential(): boolean {
    return this.studioContext.canWrite('docs_confidential');
  }
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private ws = inject(WebSocketService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private offlineSync = OfflineSyncService.getInstance();
  private destroy$ = new Subject<void>();
  private unregisterDirty: () => void;
  @ViewChild(DocumentPreviewComponent, { static: true }) docPreview?: DocumentPreviewComponent;

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
  /** دریافت مدارک شکست خورد (حالت خطا با «تلاش دوباره») */
  loadError = false;
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

  isDocIssueDatePickerOpen = false;
  isDocExpiryDatePickerOpen = false;
  docIssueDateControl = new FormControl('');
  docExpiryDateControl = new FormControl('');

  constructor() {
    // مدرک انتخاب‌شده و ثبت‌نشده در هشدار خروج استودیو حساب می‌شود (ت۳)
    this.unregisterDirty = this.studioContext.registerDirty('company_archive', () => this.hasPendingForm());
  }

  ngOnInit(): void {
    this.docIssueDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newDoc.issue_date = val || '';
    });
    this.docExpiryDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newDoc.expiry_date = val || '';
    });
    this.setupRealtimeListeners();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.resetNewDoc();
      this.loadError = false;
      this.setDocuments([]);
      if (this.companyId) {
        this.loadCompanyDocuments(this.companyId);
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.destroy$.next();
    this.destroy$.complete();
  }

  hasPendingForm(): boolean {
    return !!(this.newDoc.file || this.newDoc.title.trim());
  }

  retry(): void {
    if (this.companyId) this.loadCompanyDocuments(this.companyId);
  }

  /** شمارندهٔ تب «مدارک» از context به هستهٔ استودیو می‌رسد */
  private setDocuments(docs: CompanyDocument[]): void {
    this.companyDocuments = docs;
    if (this.companyId) {
      this.studioContext.setCount(DOCUMENTS_TAB_ID, docs.length);
    }
    this.applyDocumentFilters();
  }

  private setupRealtimeListeners(): void {
    // ۱. وب‌سوکت: تغییر مدارک در تب یا دستگاه دیگر
    this.ws?.notifications$.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (msg?.type_str !== 'org_structure_updated' || msg.entity_type !== 'company_document') return;
      if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
      const targetCompanyId = msg.company_id || msg.project_id;
      if (this.companyId && (!targetCompanyId || targetCompanyId === this.companyId)) {
        this.loadCompanyDocuments(this.companyId);
      }
    });

    // ۲. نتیجهٔ پس‌زمینهٔ کش SWR
    this.offlineSync.liveDataUpdates$.pipe(takeUntil(this.destroy$)).subscribe(({ url, data }) => {
      if (!url || !this.companyId || !this.companyApi.matchesCompanyUrl(url, 'documents')) return;
      // تطبیق دقیق شناسه (company_id=1 نباید با company_id=12 جور شود)
      if (!new RegExp(`[?&]company_id=${this.companyId}(&|$)`).test(url)) return;
      if (Array.isArray(data)) {
        this.setDocuments(data);
      } else if (data && Array.isArray((data as any).results)) {
        this.setDocuments((data as any).results);
      }
      this.cdr.markForCheck();
    });
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

  // بارگذاری اسناد آرشیو شرکت
  loadCompanyDocuments(companyId: number): void {
    this.isLoadingDocuments = true;
    this.loadError = false;
    this.facade.getDocuments({ company_id: companyId }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // پاسخ دیررسِ شرکت پیشین شمارندهٔ شرکت تازه را عوض نمی‌کند
        if (companyId !== this.companyId) return;
        this.isLoadingDocuments = false;
        if (Array.isArray(res)) {
          this.setDocuments(res);
        } else if (res && Array.isArray((res as any).results)) {
          this.setDocuments((res as any).results);
        } else {
          this.setDocuments([]);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        if (companyId !== this.companyId) return;
        this.isLoadingDocuments = false;
        this.loadError = true;
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

  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');

  /** شمارنده با رقم فارسی (ت۷) */
  fa(n: number): string {
    return CompanyArchiveSectionComponent.FA_NUMBER.format(n);
  }

  /** تاریخ جلالی متنی با رقم فارسی (ت۷، A24)؛ خالی «—» */
  faDigits(value: string | null | undefined): string {
    if (!value) return '—';
    return String(value).replace(/[0-9]/g, d => String.fromCharCode(0x06F0 + Number(d)));
  }

  /** فایل از app-file-upload (File) یا رویداد input (سازگاری) */
  onDocFileSelected(event: any): void {
    if (event instanceof File) {
      this.newDoc.file = event;
      return;
    }
    const file = event.target?.files?.[0];
    if (file) {
      this.newDoc.file = file;
    }
  }

  uploadNewDocument(): void {
    if (!this.companyId) {
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
    formData.append('company', String(this.companyId));
    formData.append('document_type', this.newDoc.document_type);
    formData.append('title', this.newDoc.title.trim());
    formData.append('file', this.newDoc.file);
    if (this.newDoc.issue_date) formData.append('issue_date', this.newDoc.issue_date);
    if (this.newDoc.expiry_date) formData.append('expiry_date', this.newDoc.expiry_date);
    formData.append('is_confidential', String(this.newDoc.is_confidential));
    if (this.newDoc.description) formData.append('description', this.newDoc.description);

    const companyId = this.companyId;
    this.facade.createDocument(formData).subscribe({
      next: (created) => {
        this.isUploadingDoc = false;
        this.toast.success(`مدرک «${created.title}» با موفقیت در آرشیو ثبت شد.`);
        // پاسخ دیررس پس از رفتن به شرکت دیگر، فرم و فهرست آن شرکت را دست نمی‌زند
        if (companyId !== this.companyId) return;
        this.resetNewDoc();
        this.setDocuments([created, ...this.companyDocuments.filter(d => d.id !== created.id)]);
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
        this.setDocuments(this.companyDocuments.filter(d => d.id !== doc.id));
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در حذف مدرک')
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

  private resetNewDoc(): void {
    this.newDoc = this.getEmptyDocData();
    this.isDocIssueDatePickerOpen = false;
    this.isDocExpiryDatePickerOpen = false;
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
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
