import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, catchError } from 'rxjs/operators';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { Company, CompanyDocument, CompanyDocumentType, CompanyAccessLevel } from '../../../../../core/models/company.model';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ServerUrlPipe } from '../../../../../shared/pipes/server-url.pipe';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { PLATFORM_ENTITY_ICONS } from '../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../core/platform/file-output';
import { openExternal } from '../../../../../core/platform/external-link';
import { ExternalLinkDirective } from '../../../../../shared/directives/external-link.directive';

@Component({
  selector: 'app-company-documents-archive',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, TabBarComponent, ActionButtonComponent, ServerUrlPipe, ExternalLinkDirective],
  templateUrl: './company-documents-archive.html',
  styleUrls: ['./company-documents-archive.css']
})
export class CompanyDocumentsArchiveComponent implements OnInit, OnDestroy {
  private api = inject(CompanyApiService);
  private http = inject(HttpClient);
  public activeCompanyService = inject(ActiveCompanyService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private destroy$ = new Subject<void>();

  companies: Company[] = [];
  selectedCompanyId: number | null = null;
  selectedCompany: Company | null = null;
  currentUserAccessLevel: CompanyAccessLevel = 'docs_read';
  isSuperuser = false;

  documents: CompanyDocument[] = [];
  filteredDocuments: CompanyDocument[] = [];
  isLoading = false;
  isLoadingCompanies = false;

  searchQuery = '';
  private searchSubject = new Subject<string>();
  activeCategory: 'ALL' | 'CORPORATE' | 'LICENSES' | 'FISCAL' | 'CONTRACTS' | 'EXPIRING' = 'ALL';

  isDocIssueDatePickerOpen = false;
  isDocExpiryDatePickerOpen = false;
  docIssueDateControl = new FormControl('');
  docExpiryDateControl = new FormControl('');

  readonly documentTypesList: { value: CompanyDocumentType; label: string; category: string }[] = [
    { value: 'statute', label: 'اساسنامه شرکت', category: 'CORPORATE' },
    { value: 'establishment_gazette', label: 'روزنامه رسمی تأسیس', category: 'CORPORATE' },
    { value: 'changes_gazette', label: 'روزنامه آخرین تغییرات هیئت‌مدیره', category: 'CORPORATE' },
    { value: 'auditors_gazette', label: 'روزنامه رسمی بازرسان', category: 'CORPORATE' },
    { value: 'capital_gazette', label: 'روزنامه رسمی سرمایه و آدرس', category: 'CORPORATE' },
    { value: 'vat_certificate', label: 'گواهی ثبت‌نام ارزش افزوده', category: 'FISCAL' },
    { value: 'tax_clearance', label: 'مفاصاحساب مالیاتی / بیمه‌ای', category: 'FISCAL' },
    { value: 'commercial_card', label: 'کارت بازرگانی', category: 'LICENSES' },
    { value: 'contractor_qualification', label: 'گواهی رتبه‌بندی / ساجار', category: 'LICENSES' },
    { value: 'labor_safety_certificate', label: 'گواهی صلاحیت ایمنی کار', category: 'LICENSES' },
    { value: 'operating_license', label: 'پروانه بهره‌برداری / جواز', category: 'LICENSES' },
    { value: 'lease_contract', label: 'سند مالکیت / اجاره‌نامه رسمی', category: 'CONTRACTS' },
    { value: 'master_agreement', label: 'قرارداد مادر یا تفاهم‌نامه', category: 'CONTRACTS' },
    { value: 'other', label: 'سایر مدارک و اسناد رسمی', category: 'OTHER' },
  ];

  // مدال بارگذاری مدرک جدید
  uploadModal: {
    isOpen: boolean;
    isSubmitting: boolean;
    data: {
      document_type: CompanyDocumentType;
      title: string;
      file: File | null;
      issue_date: string;
      expiry_date: string;
      is_confidential: boolean;
      description: string;
    };
  } = {
    isOpen: false,
    isSubmitting: false,
    data: this.getEmptyDocData()
  };

  // پیش‌نمایش درجا
  isLoadingPreview = false;
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

  ngOnInit(): void {
    this.isSuperuser = !!this.authService.user()?.is_superuser;
    this.setupDateControls();
    this.setupSearch();
    this.loadAccessibleCompanies();
  }

  private setupDateControls(): void {
    this.docIssueDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.uploadModal.data.issue_date = val || '';
    });
    this.docExpiryDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.uploadModal.data.expiry_date = val || '';
    });
  }

  ngOnDestroy(): void {
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
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

  loadAccessibleCompanies(): void {
    this.isLoadingCompanies = true;
    this.activeCompanyService.loadDocumentCompanies().subscribe({
      next: (companies) => {
        this.isLoadingCompanies = false;
        this.companies = companies || [];
        if (this.companies.length > 0) {
          // انتخاب اولین شرکت یا شرکتی که با شرکت فعال جاری سیستم همخوانی دارد
          const current = this.activeCompanyService.activeCompany;
          const match = current ? this.companies.find(c => c.id === current.id) : null;
          this.selectCompany(match || this.companies[0]);
        } else {
          this.selectedCompanyId = null;
          this.selectedCompany = null;
          this.documents = [];
          this.filteredDocuments = [];
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingCompanies = false;
        this.toast.error('خطا در دریافت لیست شرکت‌های مجاز');
        this.cdr.markForCheck();
      }
    });
  }

  selectCompany(company: Company): void {
    this.selectedCompanyId = company.id;
    this.selectedCompany = company;
    this.currentUserAccessLevel = this.isSuperuser ? 'workspace_full' : (company.user_access_level || 'docs_read');
    this.loadDocuments(company.id);
  }

  loadDocuments(companyId: number): void {
    this.isLoading = true;
    this.api.getDocuments({ company_id: companyId }).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (Array.isArray(res)) {
          this.documents = res;
        } else if (res && Array.isArray(res.results)) {
          this.documents = res.results;
        } else {
          this.documents = [];
        }
        this.applyFilter();
      },
      error: (err) => {
        this.isLoading = false;
        const msg = err.error?.detail || 'خطا در بارگذاری مدارک شرکت';
        this.toast.error(msg);
        this.documents = [];
        this.filteredDocuments = [];
        this.cdr.markForCheck();
      }
    });
  }

  private categoryTabsKey = '';
  private categoryTabsCache: TabDef[] = [];

  get categoryTabs(): TabDef[] {
    const counts = [
      this.getCountByCategory('ALL'),
      this.getCountByCategory('CORPORATE'),
      this.getCountByCategory('LICENSES'),
      this.getCountByCategory('FISCAL'),
      this.getCountByCategory('CONTRACTS'),
      this.getCountByCategory('EXPIRING')
    ];
    const key = `${this.activeCategory}:${counts.join(',')}`;
    if (key === this.categoryTabsKey && this.categoryTabsCache.length > 0) {
      return this.categoryTabsCache;
    }
    this.categoryTabsKey = key;
    this.categoryTabsCache = [
      { id: 'ALL', label: 'همه اسناد', shortLabel: 'همه', icon: 'status-all', count: counts[0] },
      { id: 'CORPORATE', label: 'اساسنامه و روزنامه', shortLabel: 'اساسنامه', icon: PLATFORM_ENTITY_ICONS.company, count: counts[1] },
      { id: 'LICENSES', label: 'مجوزها و پروانه‌ها', shortLabel: 'مجوزها', icon: ACCOUNTING_ENTITY_ICONS.licenses, count: counts[2] },
      { id: 'FISCAL', label: 'مالیات و بیمه', shortLabel: 'مالیات', icon: ACCOUNTING_ENTITY_ICONS.tax, count: counts[3] },
      { id: 'CONTRACTS', label: 'قراردادها و اجاره‌نامه', shortLabel: 'قراردادها', icon: ACCOUNTING_ENTITY_ICONS.contractsAndLeases, count: counts[4] },
      { id: 'EXPIRING', label: 'نیازمند تمدید', shortLabel: 'تمدید', icon: 'status-warning', count: counts[5] > 0 ? counts[5] : undefined, tone: 'rose',
        // در mobile="icon" شمارنده زیر ۶۴۰px پنهان است؛ نقطه نشان می‌دهد سندی نیازمند تمدید هست
        indicator: counts[5] > 0 ? { tone: 'rose', label: `${counts[5]} سند نیازمند تمدید` } : undefined }
    ];
    return this.categoryTabsCache;
  }

  onCategoryTabChange(tabId: string): void {
    if (tabId === 'ALL' || tabId === 'CORPORATE' || tabId === 'LICENSES' || tabId === 'FISCAL' || tabId === 'CONTRACTS' || tabId === 'EXPIRING') {
      this.setCategory(tabId);
    }
  }

  setCategory(category: 'ALL' | 'CORPORATE' | 'LICENSES' | 'FISCAL' | 'CONTRACTS' | 'EXPIRING' | string): void {
    this.activeCategory = category as any;
    this.applyFilter();
  }

  applyFilter(): void {
    let result = [...this.documents];

    // ۱. فیلتر دسته‌بندی موضوعی
    if (this.activeCategory === 'EXPIRING') {
      result = result.filter(d => d.expiry_status === 'expiring_soon' || d.expiry_status === 'expired');
    } else if (this.activeCategory !== 'ALL') {
      const allowedTypes = this.documentTypesList
        .filter(t => t.category === this.activeCategory)
        .map(t => t.value);
      result = result.filter(d => allowedTypes.includes(d.document_type));
    }

    // ۲. فیلتر جستجوی زنده
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(d =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.document_type_display && d.document_type_display.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q))
      );
    }

    this.filteredDocuments = result;
    this.cdr.markForCheck();
  }

  get canUpload(): boolean {
    return this.isSuperuser || this.currentUserAccessLevel === 'docs_write' || this.currentUserAccessLevel === 'workspace_full';
  }

  get canDelete(): boolean {
    return this.isSuperuser || this.currentUserAccessLevel === 'docs_write' || this.currentUserAccessLevel === 'workspace_full';
  }

  openUploadModal(): void {
    if (!this.canUpload) {
      this.toast.warning('شما تنها مجوز مشاهده اسناد را دارید و مجاز به بارگذاری سند جدید نیستید.');
      return;
    }
    this.uploadModal = {
      isOpen: true,
      isSubmitting: false,
      data: this.getEmptyDocData()
    };
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
    this.cdr.markForCheck();
  }

  closeUploadModal(): void {
    this.uploadModal.isOpen = false;
    this.uploadModal.data = this.getEmptyDocData();
    this.docIssueDateControl.setValue('', { emitEvent: false });
    this.docExpiryDateControl.setValue('', { emitEvent: false });
    this.isDocIssueDatePickerOpen = false;
    this.isDocExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      // اعتبارسنجی حجم (حداکثر ۲۰ مگابایت)
      if (file.size > 20 * 1024 * 1024) {
        this.toast.error('حجم فایل انتخابی نباید بیشتر از ۲۰ مگابایت باشد.');
        return;
      }
      this.uploadModal.data.file = file;
      if (!this.uploadModal.data.title.trim()) {
        const defaultType = this.documentTypesList.find(t => t.value === this.uploadModal.data.document_type);
        this.uploadModal.data.title = defaultType ? defaultType.label : file.name;
      }
      this.cdr.markForCheck();
    }
  }

  onDocIssueDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.uploadModal.data.issue_date = val;
    this.docIssueDateControl.setValue(val, { emitEvent: false });
    this.isDocIssueDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onDocExpiryDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.uploadModal.data.expiry_date = val;
    this.docExpiryDateControl.setValue(val, { emitEvent: false });
    this.isDocExpiryDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  submitUpload(): void {
    if (!this.selectedCompanyId) {
      this.toast.warning('لطفاً ابتدا شرکت مورد نظر را مشخص فرمایید.');
      return;
    }
    const d = this.uploadModal.data;
    if (!d.title.trim()) {
      this.toast.warning('عنوان سند الزامی است.');
      return;
    }
    if (!d.file) {
      this.toast.warning('لطفاً فایل سند را ضمیمه نمایید.');
      return;
    }

    this.uploadModal.isSubmitting = true;
    const formData = new FormData();
    formData.append('company', String(this.selectedCompanyId));
    formData.append('document_type', d.document_type);
    formData.append('title', d.title.trim());
    formData.append('file', d.file);
    if (d.issue_date) formData.append('issue_date', d.issue_date);
    if (d.expiry_date) formData.append('expiry_date', d.expiry_date);
    formData.append('is_confidential', String(d.is_confidential));
    if (d.description?.trim()) formData.append('description', d.description.trim());

    this.api.createDocument(formData).subscribe({
      next: (created) => {
        this.uploadModal.isSubmitting = false;
        this.toast.success(`سند «${created.title}» با موفقیت در آرشیو شرکت بارگذاری شد.`);
        this.closeUploadModal();
        if (this.selectedCompanyId) {
          this.loadDocuments(this.selectedCompanyId);
        }
      },
      error: (err) => {
        this.uploadModal.isSubmitting = false;
        const msg = err.error?.detail || err.error?.file?.[0] || 'خطا در بارگذاری مدرک رسمی';
        this.toast.error(msg);
        this.cdr.markForCheck();
      }
    });
  }

  downloadDocument(doc: CompanyDocument): void {
    this.api.downloadDocument(doc.id).subscribe({
      next: (blob) => {
        const ext = doc.file ? doc.file.split('.').pop() : 'pdf';
        void saveBlob(blob, `${doc.title || 'document'}.${ext}`);
        this.toast.success('سند با موفقیت دریافت شد.');
      },
      error: (err) => {
        if (doc.file_url) {
          openExternal(doc.file_url, '_blank');
        } else {
          this.toast.error('خطا در دانلود ایمن سند رسمی');
        }
      }
    });
  }

  openPreview(doc: CompanyDocument): void {
    const url = doc.file_url || doc.file || '';
    if (!url) {
      this.toast.warning('فایل مدرک در دسترس نیست.');
      return;
    }

    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }

    const lower = (doc.file || doc.file_url || '').toLowerCase();
    const isPdf = lower.includes('.pdf') || Boolean(doc.title && doc.title.toLowerCase().includes('.pdf'));
    const isImage = /\.(jpe?g|png|webp|svg|gif|bmp)(\?.*)?$/i.test(url) || Boolean(doc.title && /\.(jpe?g|png|webp|svg|gif|bmp)$/i.test(doc.title));

    let cleanUrl = url;
    const mediaIdx = cleanUrl.indexOf('/media/');
    if (mediaIdx !== -1 && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
      cleanUrl = cleanUrl.substring(mediaIdx);
    } else if (cleanUrl.startsWith('http://127.0.0.1:8000') || cleanUrl.startsWith('http://localhost:8000')) {
      cleanUrl = cleanUrl.replace(/^https?:\/\/(127\.0\.0\.1|localhost):8000/, '');
    }

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
  }

  closePreview(): void {
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
    this.cdr.markForCheck();
  }

  deleteDocument(doc: CompanyDocument): void {
    if (!this.canUpload) {
      this.toast.warning('شما مجاز به حذف مدارک رسمی نیستید.');
      return;
    }
    if (!confirm(`آیا از حذف مدرک رسمی «${doc.title}» اطمینان کامل دارید؟`)) return;

    this.api.deleteDocument(doc.id).subscribe({
      next: () => {
        this.toast.success('سند از آرشیو شرکت حذف گردید.');
        if (this.selectedCompanyId) {
          this.loadDocuments(this.selectedCompanyId);
        }
      },
      error: (err) => {
        const msg = err.error?.detail || 'خطا در حذف سند رسمی';
        this.toast.error(msg);
      }
    });
  }

  getExpiryBadgeClass(status?: string): string {
    switch (status) {
      case 'expired':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'expiring_soon':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'valid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'permanent':
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  getExpiryLabel(status?: string, days?: number | null): string {
    switch (status) {
      case 'expired':
        return 'منقضی شده';
      case 'expiring_soon':
        return days !== undefined && days !== null ? `سررسید (${days} روز مانده)` : 'در آستانه انقضا';
      case 'valid':
        return days !== undefined && days !== null ? `معتبر (${days} روز مانده)` : 'معتبر';
      case 'permanent':
      default:
        return 'دائمی / بدون انقضا';
    }
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getCountByCategory(cat: 'ALL' | 'CORPORATE' | 'LICENSES' | 'FISCAL' | 'CONTRACTS' | 'EXPIRING'): number {
    if (cat === 'ALL') return this.documents.length;
    if (cat === 'EXPIRING') {
      return this.documents.filter(d => d.expiry_status === 'expiring_soon' || d.expiry_status === 'expired').length;
    }
    const types = this.documentTypesList.filter(t => t.category === cat).map(t => t.value);
    return this.documents.filter(d => types.includes(d.document_type)).length;
  }

  private getEmptyDocData() {
    return {
      document_type: 'statute' as CompanyDocumentType,
      title: '',
      file: null as File | null,
      issue_date: '',
      expiry_date: '',
      is_confidential: false,
      description: ''
    };
  }
}
