import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, Optional } from '@angular/core';
import { EmployeeNewPersonnelFacade } from './employee-new-personnel.facade';
import {
  FIELD_LABELS_MAP,
  CONTRACT_TYPE_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  GENDER_OPTIONS,
  DOC_TYPE_OPTIONS,
  EDITABLE_FIELDS,
  BANK_MIRROR_FIELDS,
  getStatusBadgeClassHelper,
  getStatusIconHelper,
  getStatusLabelHelper,
  getFullStatusDescriptionHelper,
  getContractTypeLabelHelper,
  getWorkflowActionLabelHelper,
  getWorkflowActionBadgeClassHelper,
  getWorkflowActionIconHelper,
  formatWageNumberHelper,
  formatShebaDisplayHelper,
  formatDiffValueHelper,
  downloadBlobHelper,
  createDefaultPersonnelForm,
  buildFormValuesHelper,
  filterPersonnelHelper,
  computePersonnelMetrics,
  buildPersonnelStatusFilterTabs,
  buildPersonnelModalTabs,
  checkIsPersonnelTabComplete,
  checkIsFieldMissingHelper,
  validatePersonnelBeforeSave,
  parsePersonnelEditModalData,
  handlePersonnelWsUpdateHelper,
  normalizeForDiffHelper,
  buildChangedFieldsHelper,
  desiredBankAccountsHelper,
  extractServerErrorHelper,
  applyFoundPersonnelDataHelper,
  handleShebaInputHelper,
  handleAccountNumberInputHelper,
  handleWageInputHelper,
  handleNationalCodeChangeHelper,
  handlePhoneInputHelper,
  handlePostalCodeInputHelper,
  handleBirthDateInputHelper,
  getModalHeaderTitleHelper,
  getModalHeaderBadgeHelper,
  getMissingFieldsListHelper,
  validateNationalCodeMod11Helper,
  fetchLocalDraftCandidates,
  DEFAULT_JOB_TITLES,
  DEFAULT_CONTRACT_TYPES,
  buildCreatePersonnelPayloadHelper,
  matchRestoredBankAccountsHelper,
  resetPersonnelFormStateHelper,
  addCurrentAsNewAccountHelper
} from './employee-new-personnel.helpers';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription, concat, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, toArray } from 'rxjs/operators';
import { ProjectSection, PersonnelProfile, PersonnelBankAccount, PersonnelDocument, WorkflowAuditLog } from '../../../../../../core/models/personnel.model';
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

export type PersonnelStatusFilter = 'all' | 'draft' | 'pending' | 'pending_supervisor' | 'manager_approved' | 'approved' | 'revision_required' | 'rejected';
export type PersonnelModalTab = 'identity' | 'job' | 'banking' | 'address' | 'documents';

@Component({
  selector: 'app-employee-new-personnel-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelImportModal, SvgIconDirective, PersianDatePipe, ActionButtonComponent, TabBarComponent],
  providers: [EmployeeNewPersonnelFacade],
  templateUrl: './employee-new-personnel.html',
  styleUrl: './employee-new-personnel.css'
})
export class EmployeeNewPersonnelHubComponent implements OnInit, OnDestroy {
  readonly Math = Math;
  facade: EmployeeNewPersonnelFacade;

  // ─── مدیریت بخش و ایزولاسیون قلمرو (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  recentPersonnel: PersonnelProfile[] = [];
  isLoadingPersonnel = false;
  isSaving = false;
  isExportingExcel = false;
  isImportingExcel = false;
  searchQuery = '';
  statusFilter: PersonnelStatusFilter = 'all';
  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;
  private wsSub?: Subscription;

  isPendingDiffModalOpen = false;
  pendingDiffPersonnel: PersonnelProfile | null = null;
  isCancellingChangeRequest = false;

  isTimelineModalOpen = false;
  timelinePersonnel: PersonnelProfile | null = null;
  timelineLogs: WorkflowAuditLog[] = [];
  isLoadingTimeline = false;

  copiedKey: string | null = null;
  private copiedTimeout: any = null;

  isNewPersonnelModalOpen: boolean = false;
  editingPersonnel: PersonnelProfile | null = null;
  editingId: number | null = null;
  existingAttachmentUrl: string | null = null;
  wageFormattedDisplay: string = '';
  reviewedDraftIds: Set<number> = new Set<number>();

  isExcelModalOpen: boolean = false;
  excelModalTitle: string = 'آپلود و ثبت دسته‌جمعی پرسنل از فایل اکسل';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  get isLoading(): boolean { return this.isLoadingSections || this.isLoadingPersonnel; }

  activeModalTab: PersonnelModalTab = 'identity';
  phoneError: string | null = null;
  postalCodeError: string | null = null;
  serverMissingFields: Array<{ field: string; label: string }> = [];
  isFoundPersonnelRejected: boolean = false;
  jobItems: Array<{ title: string; job_codes: string[] }> = [];
  availableJobCodes: string[] = [];
  bankAccounts: PersonnelBankAccount[] = [];
  existingDocuments: PersonnelDocument[] = [];
  pendingUploadDocuments: Array<{ file: File; doc_type: string; previewUrl: string; name: string; size: number }> = [];
  isLightboxOpen: boolean = false;
  lightboxImageUrl: string = '';
  lightboxTitle: string = '';
  selectedDocTypeForUpload: string = 'national_card';

  private initialFormSnapshot: Record<string, any> | null = null;
  private initialBankAccounts: PersonnelBankAccount[] = [];
  localDraftAvailable: PersonnelLocalDraft | null = null;
  otherLocalDraftCount = 0;
  private activeLocalDraftId: string | null = null;
  isReopening = false;

  // ─── فرم ثبت پرسنل جدید (Guardian G2: Enforced Draft Invariant) ───
  newPersonnel: Partial<PersonnelProfile> = createDefaultPersonnelForm();

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
    const q = this.bankSearchQuery?.trim()?.toLowerCase();
    return q ? this.iranianBanks.filter(b => b.name.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q) || b.code.includes(q)) : this.iranianBanks;
  }

  // مدیریت پیوست و آپلود مدارک هویتی پرسنل
  selectedDocumentAttachment: File | null = null;
  attachmentFileName: string = '';

  // اعتبارسنجی زنده کد ملی
  nationalCodeError: string | null = null;

  jobTitles: string[] = [...DEFAULT_JOB_TITLES];
  readonly contractTypes = DEFAULT_CONTRACT_TYPES;

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
    @Optional() facade?: EmployeeNewPersonnelFacade
  ) {
    this.facade = facade ?? new EmployeeNewPersonnelFacade(this.personnelApi, this.toast);
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
    const res = handlePersonnelWsUpdateHelper(
      this.recentPersonnel,
      msg,
      this.activeCompanyService?.activeCompanySignal?.()?.id,
      this.selectedSectionId,
      this.editingPersonnel?.id
    );
    if (res.ignore) return;
    if (res.shouldReload) { this.loadRecentPersonnel(); return; }
    if (res.isDeleted) {
      this.recentPersonnel = res.updatedList;
      if (this.editingPersonnel && this.editingPersonnel.id === res.deletedId) {
        this.closeNewPersonnelModal();
        this.toast.show('info', 'پرونده باز شده توسط کاربر دیگر حذف گردید.');
      }
      this.cdr.detectChanges();
      return;
    }
    this.recentPersonnel = res.updatedList;
    if (res.updatedPersonnel && this.editingPersonnel && this.editingPersonnel.id === res.updatedPersonnel.id) {
      this.editingPersonnel = { ...res.updatedPersonnel };
    }
    this.cdr.detectChanges();
  }

  loadJobTitles(): void {
    this.facade.getJobTitles().subscribe({
      next: (res: any) => {
        if (res?.job_titles?.length) this.jobTitles = res.job_titles;
        if (res?.items?.length) this.jobItems = res.items;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onJobTitleSelect(title: string): void {
    this.newPersonnel.job_title = title;
    const match = this.jobItems.find(j => j.title === title);
    this.availableJobCodes = match?.job_codes || [];
    if (this.availableJobCodes.length && (!this.newPersonnel.job_code || !this.availableJobCodes.includes(this.newPersonnel.job_code))) {
      this.newPersonnel.job_code = this.availableJobCodes[0];
    }
    this.cdr.detectChanges();
  }

  onJobTitleInput(event: any): void { this.onJobTitleSelect(typeof event === 'string' ? event : (event?.target?.value || '')); }
  selectJobCode(code: string): void { this.newPersonnel.job_code = code; this.cdr.detectChanges(); }

  onJobCodeInput(event: any): void {
    const clean = normalizeDigits(typeof event === 'string' ? event : (event?.target?.value || '')).replace(/\D/g, '').substring(0, 6);
    this.newPersonnel.job_code = clean;
    if (event?.target) event.target.value = clean;
    this.cdr.detectChanges();
  }

  loadMySections(): void {
    this.isLoadingSections = true;
    this.facade.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0 && (this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all'))) {
          this.facade.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs) => { this.mySections = allSecs || []; this.pickDefaultSection(); },
            error: () => { this.isLoadingSections = false; this.cdr.detectChanges(); }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => { this.isLoadingSections = false; this.cdr.detectChanges(); }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      if (this.selectedSectionId) this.loadRecentPersonnel();
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

  get filteredPersonnel(): PersonnelProfile[] { return filterPersonnelHelper(this.recentPersonnel, this.statusFilter, this.searchQuery); }
  get personnelMetrics() { return computePersonnelMetrics(this.recentPersonnel); }
  get unreviewedDraftCount(): number { return this.recentPersonnel.filter(p => p.approval_status === 'draft' && !this.isDraftReviewed(p.id)).length; }
  isDraftReviewed(id?: number): boolean { return id ? this.reviewedDraftIds.has(id) : false; }
  get isApprovedRecord(): boolean { return this.editingPersonnel?.approval_status === 'approved' || this.editingPersonnel?.approval_status === 'manager_approved'; }
  get editingPersonnelHasPendingChanges(): boolean { return !!this.editingPersonnel?.has_pending_changes; }
  get editingPersonnelStatus(): string | null { return this.editingPersonnel?.approval_status || null; }
  get isReadOnlyMode(): boolean {
    if (!this.editingPersonnel || this.isApprovedRecord) return false;
    return this.editingPersonnelStatus !== 'draft' && this.editingPersonnelStatus !== 'revision_required';
  }
  get rejectionReasonToDisplay(): string | null { return this.editingPersonnel?.rejection_reason || null; }
  get rejectionRequestedByName(): string | null {
    return (this.editingPersonnel as any)?.revision_requested_by_name || (this.editingPersonnel as any)?.supervisor_name || null;
  }
  get modalHeaderTitle(): string { return getModalHeaderTitleHelper(this.editingPersonnel, this.isApprovedRecord, this.editingPersonnelStatus, this.isReadOnlyMode); }
  get modalHeaderBadge(): { label: string; class: string } { return getModalHeaderBadgeHelper(this.isApprovedRecord, this.editingPersonnelStatus, this.editingId); }

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
      const step = (tab: 'identity' | 'job' | 'banking' | 'address'): TabDef['indicator'] =>
        this.isTabComplete(tab) ? { tone: 'emerald', label: 'تکمیل شده' } : { tone: 'rose', label: 'دارای فیلد الزامی' };
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
  cancelPendingChangeRequest(p?: PersonnelProfile | null): void {
    const target = p || this.pendingDiffPersonnel || this.editingPersonnel;
    const crId = target?.pending_change_request?.id;
    if (!crId) { this.toast.show('warning', 'شناسه درخواست تغییرات یافت نشد.'); return; }
    if (!confirm('آیا از ابطال این درخواست تغییرات اطمینان دارید؟')) return;
    this.isCancellingChangeRequest = true;
    this.facade.cancelPersonnelChangeRequest(crId).subscribe({
      next: (res: any) => {
        this.isCancellingChangeRequest = false;
        this.toast.show('success', res?.message || 'درخواست تغییرات با موفقیت ابطال شد.');
        if (target) { target.has_pending_changes = false; target.pending_change_request = null; }
        if (this.isPendingDiffModalOpen) this.closePendingDiffModal();
        this.loadRecentPersonnel();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isCancellingChangeRequest = false;
        this.toast.show('error', 'خطا در ابطال درخواست تغییرات: ' + this.extractServerError(err));
        this.cdr.detectChanges();
      }
    });
  }

  openTimelineModal(p: PersonnelProfile): void {
    this.timelinePersonnel = p;
    this.timelineLogs = [];
    this.isTimelineModalOpen = true;
    this.isLoadingTimeline = true;
    this.cdr.detectChanges();
    this.facade.getWorkflowAuditLogs({ content_type: 'personnel', object_id: p.id }).subscribe({
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
    this.timelinePersonnel = null;
    this.timelineLogs = [];
    this.isLoadingTimeline = false;
    this.cdr.detectChanges();
  }

  formatDiffValue(key: string, value: any): string { return formatDiffValueHelper(key, value); }
  getWorkflowActionLabel(action?: string): string { return getWorkflowActionLabelHelper(action); }
  getWorkflowActionBadgeClass(action?: string): string { return getWorkflowActionBadgeClassHelper(action); }
  getWorkflowActionIcon(action?: string): string { return getWorkflowActionIconHelper(action); }

  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.isExportingExcel = true;
    this.facade.exportPersonnelExcel(this.selectedSectionId).subscribe({
      next: (blob: Blob) => {
        this.isExportingExcel = false;
        downloadBlobHelper(blob, `personnel_section_${this.selectedSectionId}.xlsx`);
        this.toast.show('success', 'فایل اکسل پرسنل با موفقیت دانلود شد.');
      },
      error: (err: any) => {
        this.isExportingExcel = false;
        this.toast.show('error', 'خطا در دریافت خروجی اکسل: ' + this.extractServerError(err));
      }
    });
  }

  openImportModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => {
      return this.facade.importPersonnelExcelModal(file, this.selectedSectionId!, updateExisting, dryRun);
    };
    this.excelTemplateFn = () => this.downloadPersonnelTemplate();
    this.isExcelModalOpen = true;
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.loadRecentPersonnel();
  }

  onExcelImported(result: any): void {
    if (result?.success || result?.created_count || result?.summary?.created) {
      this.toast.show('success', 'اطلاعات پرسنل با موفقیت از فایل اکسل اعمال شد.');
      this.loadRecentPersonnel();
    }
    const warnings: Array<{ row: number; message: string }> = result?.warnings || [];
    if (warnings.length) {
      this.toast.show('warning', `${warnings.length} ردیف به‌دلیل نقص اطلاعات پیش‌نویس ماند: ` +
        warnings.slice(0, 3).map(w => `ردیف ${w.row}`).join('، ') + (warnings.length > 3 ? '، …' : ''));
    }
  }

  downloadPersonnelTemplate(): void {
    this.facade.downloadPersonnelTemplate().subscribe({
      next: (blob: Blob) => { downloadBlobHelper(blob, 'personnel_import_template.xlsx'); this.toast.show('success', 'قالب استاندارد اکسل پرسنل با موفقیت دانلود شد.'); },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل پرسنل')
    });
  }

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
    const editingId = this.editingId;
    fetchLocalDraftCandidates(this.auth.user()?.id ?? null, this.selectedSectionId, editingId, this.localDraftKey)
      .then(res => {
        if (!this.isNewPersonnelModalOpen || this.editingId !== editingId) return;
        this.localDraftAvailable = res.available;
        this.otherLocalDraftCount = res.otherCount;
        this.cdr.detectChanges();
      })
      .catch(() => {});
  }

  restoreLocalDraft(): void {
    const draft = this.localDraftAvailable;
    if (!draft) return;
    const hasTyped = !this.editingId && !!(this.newPersonnel.national_code || this.newPersonnel.last_name || this.newPersonnel.first_name);
    if (hasTyped && !confirm('مقادیر فعلی فرم با پیش‌نویس محلی جایگزین شود؟')) return;
    this.newPersonnel = { ...this.newPersonnel, ...(draft.form as Partial<PersonnelProfile>) };
    this.bankAccounts = (draft.bankAccounts || []).map(a => ({ ...(a as unknown as PersonnelBankAccount) }));
    if (this.bankAccounts.length) this.syncPrimaryToProfile();
    if (this.newPersonnel.national_code && !this.editingId) this.onNationalCodeChange();
    const parts = draft.key.split('_');
    this.activeLocalDraftId = parts.length >= 3 ? parts.slice(2).join('_') : draft.key;
    if (parts.length < 3) {
      this.activeLocalDraftId = this.editingId ? `p${this.editingId}` : newPersonnelLocalDraftId();
      this.cachePersonnelFormLocally();
      deletePersonnelLocalDraft(draft.key).catch(() => {});
    }
    this.localDraftAvailable = null;
    this.toast.show('success', 'پیش‌نویس محلی بازیابی شد.');
    this.cdr.detectChanges();
  }

  discardLocalDraft(): void {
    const draft = this.localDraftAvailable;
    if (!draft) return;
    if (!confirm('پیش‌نویس محلی ذخیره‌نشده روی سرور حذف شود؟')) return;
    deletePersonnelLocalDraft(draft.key).catch(() => {});
    this.localDraftAvailable = null;
    this.checkLocalDraft();
    this.cdr.detectChanges();
  }

  private clearLocalDraftAfterServerSave(): void {
    if (this.localDraftKey) deletePersonnelLocalDraft(this.localDraftKey).catch(() => {});
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
    if (p.id) this.reviewedDraftIds.add(p.id);

    const parsed = parsePersonnelEditModalData(p);
    this.newPersonnel = parsed.form;
    this.wageFormattedDisplay = parsed.wageFormattedDisplay;
    this.shebaValidationResult = parsed.shebaValidationResult;
    this.shebaDigitsDisplay = parsed.shebaDigitsDisplay;
    this.bankAccounts = parsed.bankAccounts;
    if (this.bankAccounts.length) this.syncPrimaryToProfile();

    if (p.job_title) {
      this.onJobTitleSelect(p.job_title);
      if (p.job_code) this.newPersonnel.job_code = p.job_code;
    }
    this.existingAttachmentUrl = p.attachment || null;
    this.selectedDocumentAttachment = null;
    this.attachmentFileName = '';
    this.nationalCodeError = null;
    this.pendingUploadDocuments = [];

    if (p.documents?.length) {
      this.existingDocuments = p.documents.map(d => ({ ...d }));
    } else if (p.id) {
      this.facade.getPersonnelDocuments(p.id).subscribe({
        next: (docs) => { this.existingDocuments = docs || []; this.cdr.detectChanges(); },
        error: () => { this.existingDocuments = []; }
      });
    } else {
      this.existingDocuments = [];
    }

    this.serverMissingFields = p.missing_fields && Array.isArray(p.missing_fields)
      ? p.missing_fields.map((m: any) => typeof m === 'string' ? { field: m, label: m } : m)
      : [];

    this.initialFormSnapshot = this.buildFormValues();
    this.initialBankAccounts = this.bankAccounts.map(a => ({ ...a }));
    this.activeLocalDraftId = p.id ? `p${p.id}` : newPersonnelLocalDraftId();
    this.isNewPersonnelModalOpen = true;
    this.checkLocalDraft();
    this.cdr.detectChanges();
  }

  submitDraftToSupervisor(p: PersonnelProfile): void {
    if (!p.id || p.id < 0) {
      this.toast.show('warning', 'این پرونده هنوز در صف آفلاین است؛ پس از ثبت روی سرور ارسال کنید.');
      return;
    }
    this.facade.submitPersonnelProfile(p.id).subscribe({
      next: (res: any) => {
        this.toast.show(res?._offlinePending ? 'warning' : 'success', res?._offlinePending ? `ارسال پرونده «${p.first_name} ${p.last_name}» در صف آفلاین ثبت شد.` : `پرونده «${p.first_name} ${p.last_name}» به کارتابل سرپرست بخش ارسال گردید.`);
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        const missing: Array<{ field: string; label: string }> = err?.error?.missing_fields || [];
        if (missing.length) {
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
    const res = handleWageInputHelper(oldVal, oldSel);
    this.newPersonnel.daily_base_wage = res.num;
    this.wageFormattedDisplay = res.wageFormattedDisplay;
    if (inputEl && typeof event !== 'string') {
      inputEl.value = res.wageFormattedDisplay;
      try { inputEl.setSelectionRange(res.newCursorPos, res.newCursorPos); } catch {}
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
      const res = handleShebaInputHelper(oldVal, oldSel);
      this.shebaValidationResult = res.res;
      this.shebaDigitsDisplay = res.shebaDigitsDisplay;
      this.newPersonnel.sheba_number = res.rawSheba;
      if (res.bankName) this.newPersonnel.bank_name = res.bankName;
      if (res.accountNumber) this.newPersonnel.account_number = res.accountNumber;
      if (inputEl && typeof event !== 'string') {
        inputEl.value = this.shebaDigitsDisplay;
        try { inputEl.setSelectionRange(res.newCursorPos, res.newCursorPos); } catch {}
      }
    } finally {
      this._isSyncingBank = false;
    }
    this.cdr.detectChanges();
  }

  onShebaPaste(event: ClipboardEvent): void { event.preventDefault(); this.onShebaInput(event.clipboardData?.getData('text') || ''); }

  onShebaCopy(event: ClipboardEvent): void {
    const digits = extractShebaDigits(this.newPersonnel.sheba_number || '');
    if (digits && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', digits);
      this.isShebaCopied = true;
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  copyShebaToClipboard(): void { const d = extractShebaDigits(this.newPersonnel.sheba_number || ''); if (d) { this.copyValue(d, 'sheba', 'شماره شبا (۲۴ رقم بدون IR)'); this.isShebaCopied = true; setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000); } }

  onShebaChange(): void {
    const raw = this.newPersonnel.sheba_number || '';
    if (!raw.trim()) { this.shebaValidationResult = null; this.shebaDigitsDisplay = ''; return; }
    const clean = cleanShebaInput(raw);
    this.newPersonnel.sheba_number = clean;
    this.shebaValidationResult = validateSheba(clean);
    this.shebaDigitsDisplay = this.shebaValidationResult.formattedDigits || extractShebaDigits(clean);
    if (this.shebaValidationResult.isValid && this.shebaValidationResult.bank) {
      this.newPersonnel.bank_name = this.shebaValidationResult.bank.name;
      if (!this.newPersonnel.account_number) this.newPersonnel.account_number = extractAccountNumberFromSheba(clean);
    }
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const res = handleAccountNumberInputHelper(rawVal, this.newPersonnel.bank_name);
    this.newPersonnel.account_number = res.cleanAcc;
    if (event?.target) event.target.value = res.cleanAcc;
    if (res.shebaRes && res.generatedSheba) {
      this._isSyncingBank = true;
      try {
        this.shebaValidationResult = res.shebaRes;
        this.shebaDigitsDisplay = res.shebaRes.formattedDigits;
        this.newPersonnel.sheba_number = res.shebaRes.rawSheba || res.generatedSheba;
      } finally {
        this._isSyncingBank = false;
      }
    }
    this.cdr.detectChanges();
  }

  onAccountNumberPaste(event: ClipboardEvent): void { event.preventDefault(); this.onAccountNumberInput(event.clipboardData?.getData('text') || ''); }

  onAccountNumberCopy(event: ClipboardEvent): void {
    const acc = this.newPersonnel.account_number || '';
    if (acc && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', acc);
      this.isAccountCopied = true;
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
    }
  }

  copyAccountNumberToClipboard(): void { if (this.newPersonnel.account_number) { this.copyValue(this.newPersonnel.account_number, 'account', 'شماره حساب'); this.isAccountCopied = true; setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000); } }
  copyPhoneToClipboard(): void { if (this.newPersonnel.phone_number) { this.copyValue(this.newPersonnel.phone_number, 'phone', 'شماره همراه'); this.isPhoneCopied = true; setTimeout(() => { this.isPhoneCopied = false; this.cdr.detectChanges(); }, 2000); } }

  onBankSelect(event: any): void {
    this.newPersonnel.bank_name = typeof event === 'string' ? event : (event?.target?.value || '');
    if (this.newPersonnel.account_number) this.onAccountNumberInput(this.newPersonnel.account_number);
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.newPersonnel.bank_name = bank.name;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    if (this.newPersonnel.account_number) this.onAccountNumberInput(this.newPersonnel.account_number);
    this.cdr.detectChanges();
  }

  openBankDropdown(): void { this.isBankDropdownOpen = true; this.bankSearchQuery = ''; }

  convertAccountToShebaNow(): void {
    if (!this.newPersonnel.bank_name) { this.toast.show('warning', 'ابتدا بانک عامل را انتخاب نمایید.'); return; }
    if (!this.newPersonnel.account_number) { this.toast.show('warning', 'ابتدا شماره حساب را وارد نمایید.'); return; }
    const gen = generateShebaFromAccount(this.newPersonnel.bank_name, this.newPersonnel.account_number);
    if (!gen) { this.toast.show('warning', 'امکان تولید خودکار شماره شبا برای این بانک یا طول شماره حساب وجود ندارد.'); return; }
    this.onShebaInput(gen);
    this.toast.show('success', 'شماره شبا با موفقیت بر اساس بانک ' + this.newPersonnel.bank_name + ' تولید شد.');
  }

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

  onNationalCodeChange(): void {
    const res = validateNationalCodeMod11Helper(this.newPersonnel.national_code || '');
    this.newPersonnel.national_code = res.code;
    this.nationalCodeError = res.error;
    if (res.isValid && !this.editingPersonnel) {
      this.lookupExistingPersonnel(res.code);
    } else {
      this.foundExistingPersonnel = null;
      this.existingPersonnelId = null;
      this.existingPersonnelSectionId = null;
    }
    this.cdr.detectChanges();
  }

  lookupExistingPersonnel(code: string): void {
    this.isLookingUpNationalCode = true;
    this.facade.lookupPersonnelByNationalCode(code).subscribe({
      next: (res: any) => {
        this.isLookingUpNationalCode = false;
        if (res?.found && res.personnel) {
          this.foundExistingPersonnel = res.personnel;
          this.existingPersonnelId = res.personnel.id;
          this.existingPersonnelSectionId = res.personnel.current_section_id;
          this.isFoundPersonnelRejected = (res.personnel.approval_status === 'rejected');
        } else {
          this.foundExistingPersonnel = null;
          this.existingPersonnelId = null;
          this.existingPersonnelSectionId = null;
          this.isFoundPersonnelRejected = false;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLookingUpNationalCode = false;
        this.foundExistingPersonnel = null;
        this.existingPersonnelId = null;
        this.existingPersonnelSectionId = null;
        this.isFoundPersonnelRejected = false;
        this.cdr.detectChanges();
      }
    });
  }

  reopenEditingRejectedPersonnel(): void {
    if (!this.editingPersonnel || this.editingPersonnel.approval_status !== 'rejected') return;
    this.foundExistingPersonnel = this.editingPersonnel;
    this.reopenRejectedPersonnel();
  }

  reopenRejectedPersonnel(): void {
    if (!this.foundExistingPersonnel || this.isReopening) return;
    const p = this.foundExistingPersonnel;
    this.isReopening = true;
    this.facade.reopenPersonnelProfile(p.id).subscribe({
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
    this.existingPersonnelId = this.foundExistingPersonnel.id || null;
    this.existingPersonnelSectionId = this.foundExistingPersonnel.current_section_id || null;
    const res = applyFoundPersonnelDataHelper(this.foundExistingPersonnel, this.newPersonnel);
    this.newPersonnel = res.updatedForm; this.wageFormattedDisplay = res.wageFormattedDisplay;
    this.shebaValidationResult = res.shebaValidationResult; this.shebaDigitsDisplay = res.shebaDigitsDisplay;
    this.dismissFoundPersonnelBanner();
    this.toast.show('success', `مشخصات هویتی و بانکی «${res.updatedForm.first_name || ''} ${res.updatedForm.last_name || ''}» با موفقیت فراخوانی شد.`);
    this.cdr.detectChanges();
  }

  dismissFoundPersonnelBanner(): void { this.foundExistingPersonnel = null; this.isFoundPersonnelRejected = false; }

  onBirthDateInput(event: any): void {
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    this.newPersonnel.birth_date = handleBirthDateInputHelper(rawVal);
    if (event?.target) event.target.value = this.newPersonnel.birth_date;
    this.cdr.detectChanges();
  }

  onPhoneInput(event: any): void {
    const res = handlePhoneInputHelper(typeof event === 'string' ? event : (event?.target?.value || ''));
    this.newPersonnel.phone_number = res.cleanPhone;
    this.phoneError = res.error;
    if (event?.target) event.target.value = res.cleanPhone;
    this.cdr.detectChanges();
  }

  onPostalCodeInput(event: any): void {
    const res = handlePostalCodeInputHelper(typeof event === 'string' ? event : (event?.target?.value || ''));
    this.newPersonnel.postal_code = res.cleanPostal;
    this.postalCodeError = res.error;
    if (event?.target) event.target.value = res.cleanPostal;
    this.cdr.detectChanges();
  }

  onIdNumberInput(event: any): void {
    const clean = normalizeDigits(typeof event === 'string' ? event : (event?.target?.value || '')).replace(/\D/g, '').substring(0, 10);
    this.newPersonnel.id_number = clean;
    if (event?.target) event.target.value = clean;
    this.cdr.detectChanges();
  }

  onIdSerialInput(event: any): void {
    const clean = normalizeDigits(typeof event === 'string' ? event : (event?.target?.value || '')).replace(/\D/g, '').substring(0, 6);
    this.newPersonnel.id_serial = clean;
    if (event?.target) event.target.value = clean;
    this.cdr.detectChanges();
  }

  onChildrenCountInput(event: any): void {
    this.newPersonnel.children_count = Math.max(0, Number(typeof event === 'number' ? event : (event?.target?.value || 0)) || 0);
    this.cdr.detectChanges();
  }

  setActiveTab(tab: PersonnelModalTab): void { this.activeModalTab = tab; this.cdr.detectChanges(); }
  isTabComplete(tab: PersonnelModalTab): boolean { return checkIsPersonnelTabComplete(tab, this.newPersonnel, this.bankAccounts, this.serverMissingFields); }
  isFieldMissing(field: string): boolean { return checkIsFieldMissingHelper(field, this.serverMissingFields); }
  get missingFieldsList(): string[] { return getMissingFieldsListHelper(this.newPersonnel, this.serverMissingFields); }
  get isSubmitDisabled(): boolean {
    return !this.isTabComplete('identity') || !this.isTabComplete('job') || !this.isTabComplete('banking') || !this.isTabComplete('address');
  }

  get hasValidPrimaryBankAccount(): boolean {
    if (this.bankAccounts.length > 0) return this.bankAccounts.some(a => a.is_primary && a.sheba_number && validateSheba(extractShebaDigits(a.sheba_number)).isValid);
    return !!(this.newPersonnel.sheba_number && this.shebaValidationResult?.isValid);
  }

  setPrimaryAccount(index: number): void {
    if (this.isReadOnlyMode) return;
    this.bankAccounts.forEach((acc, i) => acc.is_primary = (i === index));
    this.syncPrimaryToProfile();
    this.toast.show('success', `حساب «${this.bankAccounts[index].bank_name}» به عنوان حساب اصلی تعیین شد.`);
    this.cdr.detectChanges();
  }

  removeBankAccount(index: number): void {
    if (this.isReadOnlyMode) return;
    const wasPrimary = this.bankAccounts[index].is_primary;
    this.bankAccounts.splice(index, 1);
    if (wasPrimary && this.bankAccounts.length > 0) this.bankAccounts[0].is_primary = true;
    this.syncPrimaryToProfile();
    this.toast.show('info', 'حساب بانکی حذف شد.');
    this.cdr.detectChanges();
  }

  addCurrentAsNewAccount(): void {
    if (this.isReadOnlyMode) return;
    const res = addCurrentAsNewAccountHelper(this.bankAccounts, this.newPersonnel, this.shebaValidationResult);
    if (res.error) { this.toast.show('warning', res.error); return; }
    this.bankAccounts = res.accounts;
    this.toast.show('success', `حساب بانکی «${res.successName}» افزوده شد.`);
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
      const digits = extractShebaDigits(prim.sheba_number);
      if (digits) {
        this.shebaValidationResult = validateSheba(digits);
        this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || digits;
      } else {
        this.shebaValidationResult = null;
        this.shebaDigitsDisplay = '';
      }
    }
  }

  // ─── مدیریت مدارک چندگانه و لایت‌باکس (تسک ۶.۶) ───
  get isOffline(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  openLightbox(url: string, title?: string): void { this.lightboxImageUrl = url; this.lightboxTitle = title || 'پیش‌نمایش مدرک'; this.isLightboxOpen = true; this.cdr.detectChanges(); }
  closeLightbox(): void { this.isLightboxOpen = false; this.lightboxImageUrl = ''; this.lightboxTitle = ''; this.cdr.detectChanges(); }

  onMultipleFilesSelected(event: any): void {
    const files = event?.target?.files as FileList | undefined;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.pendingUploadDocuments.push({
        file,
        doc_type: this.selectedDocTypeForUpload,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        name: file.name,
        size: file.size
      });
    }
    this.toast.show('success', `${files.length} مدرک به صف پیوست‌ها افزوده شد.`);
    this.cdr.detectChanges();
  }

  removePendingDocument(doc: any): void {
    const idx = this.pendingUploadDocuments.indexOf(doc);
    if (idx !== -1) {
      if (doc.previewUrl) { try { URL.revokeObjectURL(doc.previewUrl); } catch {} }
      this.pendingUploadDocuments.splice(idx, 1);
      this.cdr.detectChanges();
    }
  }

  deleteExistingDocument(doc: PersonnelDocument): void {
    if (this.isReadOnlyMode || !doc.id || !this.editingId) return;
    if (!confirm('آیا از حذف این مدرک اطمینان دارید؟')) return;
    this.facade.deletePersonnelDocument(this.editingId, doc.id).subscribe({
      next: () => {
        this.existingDocuments = this.existingDocuments.filter(d => d.id !== doc.id);
        this.toast.show('success', 'مدرک با موفقیت حذف گردید.');
        this.cdr.detectChanges();
      },
      error: (err: any) => this.toast.show('error', 'خطا در حذف مدرک: ' + this.extractServerError(err))
    });
  }

  get wageInTomans(): number { return Math.floor((Number(this.newPersonnel.daily_base_wage) || 0) / 10); }

  buildFormValues(): Record<string, any> {
    return {
      ...buildFormValuesHelper(this.newPersonnel),
      section: this.selectedSectionId,
      bank_name: (this.newPersonnel.bank_name || '').trim(),
      account_number: (this.newPersonnel.account_number || '').trim(),
      sheba_number: this.newPersonnel.sheba_number ? cleanShebaInput(this.newPersonnel.sheba_number) : '',
      card_number: (this.newPersonnel.card_number || '').trim()
    };
  }

  normalizeForDiff(v: any): string { return normalizeForDiffHelper(v); }
  buildChangedFields(includeBankMirror: boolean): Record<string, any> {
    return buildChangedFieldsHelper(this.buildFormValues(), this.initialFormSnapshot || {}, includeBankMirror);
  }
  extractServerError(err: any): string { return extractServerErrorHelper(err); }
  desiredBankAccounts(): PersonnelBankAccount[] { return desiredBankAccountsHelper(this.bankAccounts, this.newPersonnel); }

  savePersonnel(targetStatus: 'draft' | 'pending_supervisor' = 'draft'): void {
    if (!this.selectedSectionId) { this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.'); return; }
    if (!this.newPersonnel.first_name?.trim() || !this.newPersonnel.last_name?.trim()) { this.toast.show('warning', 'نام و نام خانوادگی پرسنل الزامی است.'); return; }
    if (!this.newPersonnel.national_code?.trim() || this.newPersonnel.national_code.trim().length !== 10) { this.toast.show('warning', 'کد ملی ۱۰ رقمی الزامی است.'); return; }
    if (this.nationalCodeError) { this.toast.show('warning', this.nationalCodeError); return; }
    if (this.shebaValidationResult && !this.shebaValidationResult.isValid) { this.toast.show('warning', this.shebaValidationResult.errorMessage || 'شماره شبا نامعتبر است.'); return; }

    this.isSaving = true;
    this.syncPrimaryToProfile();
    if (this.editingId) this.saveExistingPersonnel(targetStatus);
    else if (this.existingPersonnelId) this.assignExistingPersonnelToSection();
    else this.createNewPersonnel(targetStatus);
  }

  private assignExistingPersonnelToSection(): void {
    if (this.selectedSectionId === this.existingPersonnelSectionId) {
      this.toast.show('warning', 'این پرسنل قبلاً در همین بخش ثبت شده است.');
      this.isSaving = false;
      return;
    }
    const payload = {
      section_id: this.selectedSectionId!,
      job_title: this.newPersonnel.job_title?.trim() || undefined,
      daily_base_wage: this.newPersonnel.daily_base_wage !== undefined ? this.newPersonnel.daily_base_wage : undefined,
      notes: this.newPersonnel.notes?.trim() || undefined
    };
    this.facade.assignPersonnelToSection(this.existingPersonnelId!, payload).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.toast.show('success', res?.message || `پرسنل با موفقیت به این بخش منتسب شد.`);
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

  private createNewPersonnel(targetStatus: 'draft' | 'pending_supervisor'): void {
    const payload = buildCreatePersonnelPayloadHelper(
      this.buildFormValues(),
      this.selectedSection?.company_id,
      targetStatus,
      this.selectedDocumentAttachment,
      this.bankAccounts
    );
    const isFormData = payload instanceof FormData;
    this.facade.createPersonnelFull$(payload, isFormData, this.bankAccounts, this.pendingUploadDocuments).subscribe({
      next: ({ created, problems, queued, uploadedDocs, remainingDocs }) => {
        if (uploadedDocs?.length) this.existingDocuments = [...this.existingDocuments, ...uploadedDocs];
        if (remainingDocs) this.pendingUploadDocuments = remainingDocs;
        const fullName = `${created.first_name} ${created.last_name}`;
        if (!queued) this.clearLocalDraftAfterServerSave();
        if (queued) {
          this.isSaving = false;
          const docsLeft = this.pendingUploadDocuments.length;
          this.toast.show('warning', `پرونده «${fullName}» در صف آفلاین ذخیره شد.` + (docsLeft ? ` ${docsLeft} مدرک بارگذاری نشد.` : ''));
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

  private saveExistingPersonnel(targetStatus: 'draft' | 'pending_supervisor'): void {
    const id = this.editingId!;
    const isApproved = this.isApprovedRecord;
    const changes = this.buildChangedFields(isApproved);

    this.facade.updatePersonnelFull$(id, changes, this.selectedDocumentAttachment, isApproved, this.desiredBankAccounts(), this.initialBankAccounts, this.pendingUploadDocuments).subscribe({
      next: ({ res, problems, uploadedDocs, remainingDocs }) => {
        if (uploadedDocs?.length) this.existingDocuments = [...this.existingDocuments, ...uploadedDocs];
        if (remainingDocs) this.pendingUploadDocuments = remainingDocs;
        const fullName = `${this.newPersonnel.first_name} ${this.newPersonnel.last_name}`;
        if (!res?._offlinePending) this.clearLocalDraftAfterServerSave();
        if (isApproved) {
          this.isSaving = false;
          if (res?._offlinePending) {
            this.toast.show('warning', `درخواست تغییرات پرونده «${fullName}» در صف آفلاین ثبت شد.`);
          } else if (res?.change_request_id) {
            this.toast.show('success', `درخواست تغییرات پرونده «${fullName}» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.`);
          } else {
            this.toast.show('info', 'تغییری نسبت به اطلاعات فعلی پرونده مصوب ثبت نشد.');
          }
          if (problems?.length) this.toast.show('warning', `هشدار: ${problems.join('، ')}`);
          this.closeNewPersonnelModal();
          this.loadRecentPersonnel();
          return;
        }
        const saved: PersonnelProfile = res && res.id && !res._offlinePending
          ? res
          : ({ ...(this.editingPersonnel || {}), ...changes, id } as PersonnelProfile);
        this.finishSave(saved, targetStatus, problems || [], false);
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

  private keepModalOnSavedRecord(saved: PersonnelProfile, missing?: Array<{ field: string; label: string }>): void {
    const keepDocs = this.pendingUploadDocuments;
    const keepDocsList = this.existingDocuments;
    const intendedAccounts = this.desiredBankAccounts().map(a => ({ ...a }));
    this.openEditModal(missing ? ({ ...saved, missing_fields: missing } as PersonnelProfile) : saved);
    this.pendingUploadDocuments = keepDocs;
    if (!saved.documents?.length) this.existingDocuments = keepDocsList;
    if (saved.id && !this.isApprovedRecord) this.restoreIntendedBankAccounts(saved.id, intendedAccounts);
    this.loadRecentPersonnel();
  }

  private restoreIntendedBankAccounts(personnelId: number, intended: PersonnelBankAccount[]): void {
    if (!intended.length) return;
    this.facade.getPersonnelBankAccounts(personnelId).subscribe({
      next: (serverAccounts) => {
        if (this.editingId !== personnelId) return;
        const { initial, matched } = matchRestoredBankAccountsHelper(intended, serverAccounts || []);
        this.initialBankAccounts = initial;
        this.bankAccounts = matched;
        this.syncPrimaryToProfile();
        this.cdr.detectChanges();
      },
      error: () => {
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
        this.toast.show('success', isNew ? `پرونده «${fullName}» در وضعیت پیش‌نویس ثبت شد.` : `تغییرات پیش‌نویس پرونده «${fullName}» با موفقیت ذخیره شد.`);
        this.resetForm();
        this.closeNewPersonnelModal();
        this.loadRecentPersonnel();
      }
      return;
    }

    if (saved.approval_status && !['draft', 'revision_required'].includes(saved.approval_status)) {
      this.isSaving = false;
      this.toast.show(problems.length ? 'warning' : 'success', `پرونده «${fullName}» ثبت شد و با عبور هوشمند در مرحلهٔ «${this.getStatusLabel(saved.approval_status)}» قرار گرفت.${problemNote}`);
      this.resetForm();
      this.closeNewPersonnelModal();
      this.loadRecentPersonnel();
      return;
    }

    this.facade.submitPersonnelProfile(saved.id!).subscribe({
      next: (res: any) => {
        this.isSaving = false;
        this.toast.show(problems.length ? 'warning' : 'success', res?._offlinePending ? `پرونده «${fullName}» ذخیره شد و ارسال آن در صف آفلاین است.${problemNote}` : `پرونده «${fullName}» ذخیره و به کارتابل سرپرست ارسال گردید.${problemNote}`);
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
        const missing: Array<{ field: string; label: string }> = err?.error?.missing_fields || [];
        this.keepModalOnSavedRecord(saved, missing.length ? missing : undefined);
        this.toast.show('warning', `پرونده «${fullName}» ذخیره شد ولی به سرپرست ارسال نشد؛ ` + (missing.length ? `نواقص: ${missing.map(m => m.label).join('، ')}` : this.extractServerError(err)) + problemNote);
        this.cdr.detectChanges();
      }
    });
  }

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
    this.savePersonnel('pending_supervisor');
  }

  cachePersonnelFormLocally(): void {
    if (!this.activeLocalDraftId) this.activeLocalDraftId = this.editingId ? `p${this.editingId}` : newPersonnelLocalDraftId();
    if (!this.localDraftKey || !this.selectedSectionId) return;
    const { attachment, documents, ...form } = this.newPersonnel as any;
    savePersonnelLocalDraft({
      key: this.localDraftKey,
      userId: this.auth.user()?.id ?? null,
      sectionId: this.selectedSectionId,
      personnelId: this.editingId || null,
      savedAt: new Date().toISOString(),
      form,
      bankAccounts: this.bankAccounts.map(a => ({ ...a })) as unknown as Array<Record<string, unknown>>
    }).catch(() => { this.toast.show('error', 'ذخیرهٔ محلی پیش‌نویس ممکن نشد.'); });
  }

  savePersonnelDraft(): void { this.savePersonnel('draft'); }

  resetForm(): void {
    Object.assign(this, resetPersonnelFormStateHelper());
  }

  deleteDraftPersonnel(personnel: PersonnelProfile): void {
    if (!personnel.id) return;
    if (personnel.approval_status !== 'draft' && personnel.approval_status !== 'revision_required') {
      this.toast.show('warning', 'فقط پرونده‌های در وضعیت پیش‌نویس یا عودت‌داده‌شده قابل حذف توسط کارمند هستند.');
      return;
    }
    const typeDesc = personnel.approval_status === 'revision_required' ? 'عودت‌داده‌شده' : 'پیش‌نویس';
    if (!confirm(`آیا از حذف پرونده ${typeDesc} «${personnel.first_name} ${personnel.last_name}» اطمینان دارید؟`)) return;
    this.facade.deletePersonnelProfile(personnel.id).subscribe({
      next: () => {
        this.toast.show('success', `پرونده ${typeDesc} «${personnel.first_name} ${personnel.last_name}» حذف گردید.`);
        this.loadRecentPersonnel();
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در حذف پرونده: ' + this.extractServerError(err));
      }
    });
  }

  // ─── فرمت‌بندی و نمایش وضعیت (Concise Icons & Labels) ───
  getStatusBadgeClass(status?: string): string { return getStatusBadgeClassHelper(status); }
  getStatusIcon(status?: string): string { return getStatusIconHelper(status); }
  getStatusLabel(status?: string): string { return getStatusLabelHelper(status); }
  getFullStatusDescription(status?: string): string { return getFullStatusDescriptionHelper(status); }
  getContractTypeLabel(type?: string): string { return getContractTypeLabelHelper(type); }
  formatNumber(val: number | string | undefined | null): string { return formatWageNumberHelper(val); }
  formatShebaDisplay(sheba?: string): string { return formatShebaDisplayHelper(sheba); }

  copyToClipboard(text?: string, label: string = 'متن'): void {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => this.toast.show('success', `${label} در کلیپ‌بورد کپی شد.`)).catch(() => this.toast.show('info', text));
    } else {
      this.toast.show('info', text);
    }
  }

  copyValue(val?: string, key?: string, label: string = 'مقدار'): void {
    if (!val) return;
    this.copyToClipboard(val, label);
    if (key) {
      if (this.copiedTimeout) clearTimeout(this.copiedTimeout);
      this.copiedKey = key;
      this.cdr.detectChanges();
      this.copiedTimeout = setTimeout(() => { this.copiedKey = null; this.cdr.detectChanges(); }, 2000);
    }
  }

  isKeyCopied(key: string): boolean { return this.copiedKey === key; }
  navigateToVehicle(): void {
    this.router.navigate(['/app/finance/employee-new-vehicle'], { queryParams: this.selectedSectionId ? { section_id: this.selectedSectionId } : {} });
  }
}
