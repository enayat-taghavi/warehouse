import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { AttachmentsComponent } from '../../../../../../shared/components/attachments/attachments.component';
import { PAYMENT_RECEIPT_LABEL } from '../../../../payment-receipt';
import { fiscalPeriodClosedMessage } from '../../../../fiscal-period-error';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';
import { Subscription } from 'rxjs';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectSection, Counterparty, ExpenseInvoice, ExpenseInvoiceLine, InvoiceDuplicatesResponse } from '../../../../models/personnel.model';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';
import { validateSheba } from '../../../../../../core/utils/sheba-utils';
import { SearchSelectComponent, SearchSelectOption } from '../../../../../../shared/components/search-select/search-select.component';
import { InvoiceReceiptButtonComponent } from '../../invoice-receipt-button/invoice-receipt-button';
import { CounterpartyFormFieldsComponent } from '../../counterparties/counterparty-form/counterparty-form-fields.component';
import { CounterpartyFormState, emptyCounterpartyForm, isMaskedValue } from '../../counterparties/counterparty-form/counterparty-form.state';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ServerUrlPipe } from '../../../../../../shared/pipes/server-url.pipe';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { saveBlob, saveUrl } from '../../../../../../core/platform/file-output';
import { WorkflowHistoryComponent } from '../../../../../../shared/components/workflow-history/workflow-history.component';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { AmountInputComponent } from '../../../../../../shared/components/amount-input/amount-input.component';
import { PrintService, PRINT_OFFLINE_TITLE } from '../../../../../../core/services/print.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { ExpenseHeadOptionGroup, buildExpenseHeadOptions, expenseHeadErrorMessage, expenseHeadLabel } from '../../expense-head-options';

/** یک ردیف فرم (مبلغ ردیف فقط نمایشی است) */
export interface InvoiceLineForm {
  description: string;
  quantity: string | number;
  unit: string;
  unit_price: string | number | null;
  expense_head: number | null;
}

export type InvoiceStatusTab = 'all' | 'draft' | 'pending_supervisor' | 'pending_accountant' | 'ready_to_pay' | 'paid' | 'rejected';

/** ارقام فارسی/عربی به لاتین (تاریخ تقویم) */
function toAsciiDigits(v: string): string {
  return v.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

@Component({
  selector: 'app-employee-invoices-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, AttachmentsComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent, CommandCenterComponent, ServerUrlPipe, WorkflowHistoryComponent, WorkflowReasonDialogComponent, AmountInputComponent, ReactiveFormsModule, NgPersianDatepickerModule, CounterpartyFormFieldsComponent, SearchSelectComponent, InvoiceReceiptButtonComponent],
  templateUrl: './employee-invoices.html',
  styleUrl: './employee-invoices.css'
})
export class EmployeeInvoicesHubComponent implements OnInit, OnDestroy {
  /** برچسب پیوست رسید پرداخت (فهرست فقط خواندنی در جزئیات فاکتور) */
  readonly receiptLabel = PAYMENT_RECEIPT_LABEL;
  readonly Math = Math;

  // شمارندهٔ تب‌ها حذف شد: فهرست صفحه‌بندی سمت سرور است و شمار هر وضعیت از یک صفحه درست نمی‌شود
  readonly invoiceStatusTabs: TabDef[] = [
    { id: 'all', label: 'همه', icon: 'status-all' },
    { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft' },
    { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending' },
    { id: 'pending_accountant', label: 'در انتظار حسابدار', shortLabel: 'حسابدار', icon: 'role-accountant' },
    { id: 'ready_to_pay', label: 'آماده پرداخت', shortLabel: 'آماده', icon: 'status-approved' },
    { id: 'paid', label: 'پرداخت‌شده', icon: ACCOUNTING_ENTITY_ICONS.payroll },
  ];
  // ─── مدیریت بخش و ایزولاسیون داده‌ها (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  // ─── لیست فاکتورها و وضعیت بارگذاری ───
  invoices: ExpenseInvoice[] = [];
  isLoading: boolean = false;
  isSaving: boolean = false;
  /** خطای بارگذاری فهرست (برای حالت «خطا» و دکمهٔ تلاش دوباره) */
  loadError: string = '';
  // ─── صفحه‌بندی سمت سرور (ق۱۸) ───
  readonly pageSize = 25;
  page = 1;
  totalCount = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── جستجو و فیلتر کارتابل ───
  invoiceSearch: string = '';
  statusFilter: InvoiceStatusTab = 'all';

  // ─── لیست طرف‌های حساب ───
  counterparties: Counterparty[] = [];
  isLoadingCounterparties: boolean = false;

  // ─── سرفصل‌های هزینهٔ فعال شرکت بخش (۳.۴ ص۷) ───
  expenseHeadGroups: ExpenseHeadOptionGroup[] = [];
  isLoadingExpenseHeads: boolean = false;
  /** شرکتی که فهرست سرفصلش بار شده (پاسخ دیررس شرکت پیشین نادیده گرفته می‌شود) */
  private expenseHeadsCompanyId: number | null = null;
  readonly expenseHeadLabel = expenseHeadLabel;

  // ─── مودال ثبت فاکتور جدید (Guardian G2: Draft Invariant) ───
  isNewInvoiceModalOpen: boolean = false;
  newInvoice: Partial<ExpenseInvoice> = {
    invoice_number: '',
    invoice_date_shamsi: '',
    counterparty: undefined,
    description: '',
    status: 'draft'
  };
  /** شناسهٔ فاکتوری که در حال ویرایش است (null = فاکتور تازه) */
  editingInvoiceId: number | null = null;
  /** کاربر شرح کلی را خودش نوشته؛ تا وقتی false است شرح کلی از شرح ردیف اول پر می‌شود */
  descriptionTouched = false;
  // ─── ردیف‌ها، تخفیف و مالیات (۴.۱-ج؛ جمع‌های نهایی را سرور حساب می‌کند) ───
  readonly maxLines = 100;
  formLines: InvoiceLineForm[] = [];
  discountInput: string | number | null = null;
  vatApplicable = false;
  /** مبلغ مالیاتی که کاربر دستی نوشته (null = همان پیشنهاد) */
  vatManualInput: string | number | null = null;
  /** نرخ نمایشی؛ هنگام ویرایش از فاکتور می‌آید و سرور حرف آخر را می‌زند */
  vatRate = 10;
  /** خطای سرور روی هر ردیف (اندیس ردیف) و خطای کلی ردیف‌ها */
  lineErrors: Record<number, string> = {};
  linesError = '';
  discountError = '';
  vatError = '';
  // ─── هشدار فاکتور تکراری ───
  duplicateInfo: InvoiceDuplicatesResponse | null = null;
  private duplicateTimer: ReturnType<typeof setTimeout> | null = null;
  private duplicateSeq = 0;
  // ─── دلیل ارسال فاکتور تکراری ───
  isDuplicateReasonOpen = false;
  duplicateReasonServerError = '';
  private duplicateReasonInvoice: ExpenseInvoice | null = null;
  readonly printOfflineTitle = PRINT_OFFLINE_TITLE;
  selectedInvoiceAttachment: File | null = null;
  attachmentFileName: string = '';
  /** پیوست فعلی فاکتوری که ویرایش می‌شود (فایل تازه جای آن را می‌گیرد) */
  existingAttachmentUrl: string | null = null;
  /** متن جستجوی طرف‌حساب در فرم فاکتور */
  /** تقویم شمسی تاریخ فاکتور؛ ng-persian-datepicker فقط با FormControl روز ماه را می‌کشد (AGENTS.md) */
  readonly invoiceDateControl = new FormControl<string>('', { nonNullable: true });
  private invoiceDateSub?: Subscription;
  /** تخفیف و مالیات به‌طور پیش‌فرض بسته است؛ با مقدار یا خطا خودش باز می‌شود */
  showTotalsExtras = false;

  // ─── مودال تعریف سریع طرف‌حساب جدید ───
  isQuickCounterpartyModalOpen: boolean = false;
  /** همان فرم مشترک صفحهٔ طرف‌حساب‌های حسابدار (اعتبارسنجی شبا، بانک عامل، شبا از شماره حساب) */
  readonly cpForm = new CounterpartyFormState(
    (type, message) => this.toast.show(type, message),
    () => this.cdr.detectChanges()
  );
  get newCounterparty(): Partial<Counterparty> { return this.cpForm.model; }
  set newCounterparty(value: Partial<Counterparty>) { this.cpForm.model = value; }

  // ─── مودال پیش‌نمایش تصویر پیوست فاکتور ───
  isAttachmentPreviewModalOpen: boolean = false;
  previewAttachmentUrl: string | null = null;
  previewInvoiceTitle: string = '';

  // ─── پنل جزئیات و سابقه گردش کار فاکتور ───
  isDetailPanelOpen: boolean = false;
  selectedInvoiceDetail: ExpenseInvoice | null = null;
  isLoadingDetail: boolean = false;

  private docSub?: Subscription;

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() private activeCompanyService?: ActiveCompanyService,
    @Optional() private treasuryOrgApi?: TreasuryOrgApiService,
    @Optional() private confirmDialog?: ConfirmDialogService,
    @Optional() private ws?: WebSocketService,
    @Optional() private printService?: PrintService
  ) {}

  private readonly network = NetworkStatusService.getInstance();

  /** آیا دستگاه آفلاین است؟ (ارسال، چاپ و هشدار تکراری فقط آنلاین‌اند) */
  get isOffline(): boolean {
    return !this.network.isBrowserOnline || this.network.state === 'offline';
  }

  ngOnDestroy(): void {
    this.docSub?.unsubscribe();
    this.invoiceDateSub?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
  }

  ngOnInit(): void {
    this.initTodayShamsi();
    this.invoiceDateSub?.unsubscribe();
    this.invoiceDateSub = this.invoiceDateControl.valueChanges.subscribe(v => {
      this.newInvoice.invoice_date_shamsi = toAsciiDigits(v || '').replace(/-/g, '/').trim();
      this.invoiceDateError = '';
    });
    // ص۶ طرح ۲.۵: فاکتوری از این بخش که جای دیگری عوض شد درجا به‌روز می‌شود، وگرنه فهرست بی‌صدا دوباره خوانده می‌شود
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(ev => {
      if (patchDocumentRow(this.invoices, ev)) {
        this.cdr.detectChanges();
      } else if (this.selectedSectionId && (!ev.section_id || Number(ev.section_id) === Number(this.selectedSectionId))) {
        this.loadInvoices(true);
      }
    });
    this.loadMySections();
    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && sId !== this.selectedSectionId) {
          this.selectedSectionId = sId;
          this.selectedSection = this.mySections.find(s => s.id === sId) || null;
          if (this.selectedSectionId) {
            this.loadInvoices();
            this.loadCounterparties();
          }
        }
      }
      if (params['invoice']) {
        const invId = Number(params['invoice']);
        if (!isNaN(invId) && invId > 0) {
          this.openInvoiceDetail(invId);
        }
      }
    });
  }

  openInvoiceDetail(id: number | undefined): void {
    if (!id) return;
    this.isLoadingDetail = true;
    this.isDetailPanelOpen = true;
    if (this.treasuryOrgApi) {
      this.treasuryOrgApi.getExpenseInvoice(id).subscribe({
        next: (inv) => {
          this.selectedInvoiceDetail = inv;
          this.isLoadingDetail = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isLoadingDetail = false;
          this.toast.show('error', 'خطا در بارگذاری جزئیات فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
          this.cdr.detectChanges();
        }
      });
    } else {
      const found = this.invoices.find(i => i.id === id);
      this.selectedInvoiceDetail = found || null;
      this.isLoadingDetail = false;
      this.cdr.detectChanges();
    }
  }

  openInvoiceHistory(id: number | undefined): void {
    if (!id) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { invoice: id },
      queryParamsHandling: 'merge'
    });
    this.openInvoiceDetail(id);
  }

  closeInvoiceDetail(): void {
    this.isDetailPanelOpen = false;
    this.selectedInvoiceDetail = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { invoice: null },
      queryParamsHandling: 'merge'
    });
  }

  async onCancelInvoice(instanceId?: number): Promise<void> {
    const invoiceId = this.selectedInvoiceDetail?.id;
    if (!invoiceId) return;

    if (this.confirmDialog) {
      const ok = await this.confirmDialog.open({
        title: 'لغو فاکتور هزینه',
        message: 'آیا از لغو این فاکتور هزینه اطمینان دارید؟ این عملیات غیرقابل بازگشت است.',
        type: 'danger',
        confirmText: 'لغو فاکتور',
        cancelText: 'انصراف'
      });
      if (!ok) return;
    }

    if (this.treasuryOrgApi) {
      this.treasuryOrgApi.cancelExpenseInvoice(invoiceId, 'لغو توسط کاربر').subscribe({
        next: () => {
          this.toast.show('success', 'فاکتور هزینه با موفقیت لغو شد.');
          this.loadInvoices();
          if (invoiceId) {
            this.openInvoiceDetail(invoiceId);
          }
        },
        error: (err: any) => {
          if (err.status === 409) {
            const detail = err.error?.detail || err.error?.message || 'امکان لغو وجود ندارد چون مرحله بعد اقدام شده است.';
            this.toast.show('warning', detail);
          } else {
            const msg = err.error?.detail || err.error?.error || err.message || 'خطا در لغو فاکتور';
            this.toast.show('error', msg);
          }
        }
      });
    }
  }

  // ─── تاریخ شمسی امروز ───
  todayShamsi: string = '';
  private initTodayShamsi(): void {
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    this.todayShamsi = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
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
        this.loadInvoices();
        this.loadCounterparties();
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
    this.page = 1;
    this.loadInvoices();
    this.loadCounterparties();
  }

  // ─── بارگذاری فاکتورهای بخش فعال (Guardian G1: Section Isolation) ───
  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadInvoices(silent = false): void {
    if (!this.selectedSectionId || !this.treasuryOrgApi) return;
    if (!silent) {
      this.isLoading = true;
      this.loadError = '';
    }
    const params: { page: number; page_size: number; section_id: number; status?: string; search?: string } = {
      page: this.page,
      page_size: this.pageSize,
      section_id: this.selectedSectionId
    };
    if (this.statusFilter !== 'all') params.status = this.statusFilter;
    const q = this.invoiceSearch.trim();
    if (q) params.search = q;
    this.treasuryOrgApi.getExpenseInvoicesPage(params).subscribe({
      next: (res) => {
        this.invoices = res?.results || [];
        this.totalCount = res?.count ?? this.invoices.length;
        this.isLoading = false;
        this.loadError = '';
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        // صفحه‌ای که دیگر وجود ندارد (مثلاً پس از حذف): برگشت به صفحهٔ اول
        if (err?.status === 404 && this.page > 1) {
          this.page = 1;
          this.loadInvoices(silent);
          return;
        }
        if (silent) return;
        this.loadError = (typeof err?.status === 'number' && isServerUnreachable(err.status)) || this.isOffline
          ? 'اتصال به سرور برقرار نیست.'
          : 'خطا در بارگذاری فاکتورها: ' + (err.error?.error || err.message || 'نامشخص');
        this.cdr.detectChanges();
      }
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  goToPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages);
    if (next === this.page) return;
    this.page = next;
    this.loadInvoices();
  }

  /** جستجوی سمت سرور با تأخیر کوتاه */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.loadInvoices();
    }, 350);
  }

  clearSearch(): void {
    this.invoiceSearch = '';
    this.onSearchChange();
  }

  // ─── بارگذاری طرف‌های حساب ───
  loadCounterparties(): void {
    this.isLoadingCounterparties = true;
    this.personnelApi.getCounterparties().subscribe({
      next: (res: any) => {
        // Handle pagination or plain list
        this.counterparties = Array.isArray(res) ? res : (res?.results || []);
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── سوییچ تب وضعیت ───
  setStatusFilter(tab: string): void {
    if (
      tab === 'all' ||
      tab === 'draft' ||
      tab === 'pending_supervisor' ||
      tab === 'pending_accountant' ||
      tab === 'ready_to_pay' ||
      tab === 'paid' ||
      tab === 'rejected'
    ) {
      this.statusFilter = tab;
      this.page = 1;
      this.loadInvoices();
    }
  }

  // ─── مودال ثبت فاکتور جدید (Guardian G2: Force status = 'draft') ───
  private blankLine(expenseHead: number | null = null): InvoiceLineForm {
    return { description: '', quantity: 1, unit: '', unit_price: null, expense_head: expenseHead };
  }

  private resetFormExtras(): void {
    this.invoiceDateError = '';
    this.expenseHeadError = '';
    this.lineErrors = {};
    this.linesError = '';
    this.discountError = '';
    this.vatError = '';
    this.duplicateInfo = null;
    this.duplicateSeq++;
    this.selectedInvoiceAttachment = null;
    this.attachmentFileName = '';
    this.existingAttachmentUrl = null;
  }

  openNewInvoiceModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.resetFormExtras();
    this.loadExpenseHeads();
    this.editingInvoiceId = null;
    this.newInvoice = {
      section: this.selectedSectionId,
      invoice_number: '',
      invoice_date_shamsi: this.todayShamsi,
      counterparty: undefined,
      description: '',
      status: 'draft' // Guardian G2: تحمیل وضعیت پیش‌نویس
    };
    this.formLines = [this.blankLine(this.defaultExpenseHeadId)];
    this.descriptionTouched = false;
    this.invoiceDateControl.setValue(this.todayShamsi, { emitEvent: false });
    this.showTotalsExtras = false;
    this.discountInput = null;
    this.vatApplicable = false;
    this.vatManualInput = null;
    this.vatRate = 10;
    this.isNewInvoiceModalOpen = true;
    this.cdr.detectChanges();
  }

  /** پیش‌نویس یا برگشتی برای اصلاح: ویرایش و ارسال دوباره (مثل INVOICE_EDITABLE_STATUSES سرور) */
  isEditable(inv: ExpenseInvoice): boolean {
    return inv.status === 'draft' || inv.status === 'revision_required';
  }

  /** ویرایش پیش‌نویس (ردیف‌ها با یک درخواست جایگزین می‌شوند) */
  openEditInvoiceModal(inv: ExpenseInvoice): void {
    if (!inv.id || !this.isEditable(inv)) {
      this.toast.show('warning', 'فقط فاکتورهای پیش‌نویس قابل ویرایش‌اند.');
      return;
    }
    this.resetFormExtras();
    this.loadExpenseHeads();
    this.editingInvoiceId = inv.id;
    this.newInvoice = {
      section: inv.section,
      counterparty: inv.counterparty,
      invoice_number: inv.invoice_number,
      invoice_date_shamsi: inv.invoice_date_shamsi,
      description: inv.description || '',
      status: 'draft'
    };
    const lines = (inv.lines || []).map(l => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit || '',
      unit_price: l.unit_price,
      expense_head: l.expense_head
    }));
    this.formLines = lines.length ? lines : [this.blankLine()];
    const desc = (inv.description || '').trim();
    this.descriptionTouched = !!desc && desc !== (this.formLines[0]?.description || '').trim();
    const disc = Number(inv.discount_amount) || 0;
    this.discountInput = disc > 0 ? String(disc) : null;
    this.vatApplicable = !!inv.vat_applicable;
    this.vatRate = Number(inv.vat_rate) || 10;
    this.vatManualInput = inv.vat_applicable && inv.vat_manual ? String(Number(inv.vat_amount) || 0) : null;
    this.showTotalsExtras = disc > 0 || this.vatApplicable;
    this.invoiceDateControl.setValue(inv.invoice_date_shamsi || '', { emitEvent: false });
    this.existingAttachmentUrl = inv.attachment || null;
    this.isNewInvoiceModalOpen = true;
    this.onDuplicateKeyChange();
    this.cdr.detectChanges();
  }

  closeNewInvoiceModal(): void {
    this.isNewInvoiceModalOpen = false;
    this.editingInvoiceId = null;
    if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
    this.cdr.detectChanges();
  }

  // ─── ردیف‌ها و جمع‌ها ───
  addLine(): void {
    if (this.formLines.length >= this.maxLines) {
      this.toast.show('warning', `حداکثر ${this.formatNumber(this.maxLines)} ردیف مجاز است.`);
      return;
    }
    const last = this.formLines[this.formLines.length - 1];
    this.formLines = [...this.formLines, this.blankLine(this.defaultExpenseHeadId ?? last?.expense_head ?? null)];
  }

  removeLine(i: number): void {
    if (this.formLines.length <= 1) return;
    this.formLines = this.formLines.filter((_, idx) => idx !== i);
    this.lineErrors = {};
    this.linesError = '';
    if (i === 0) this.syncDescriptionFromFirstLine();
  }

  // ─── شرح کلی: خودکار از ردیف اول تا وقتی کاربر خودش آن را ننوشته ───
  onLineDescriptionChange(i: number, value: string): void {
    if (i === 0) this.syncDescriptionFromFirstLine(value);
  }

  onDescriptionInput(value: string): void {
    // پاک کردن کامل شرح یعنی برگشت به حالت خودکار
    this.descriptionTouched = !!(value || '').trim();
  }

  private syncDescriptionFromFirstLine(value?: string): void {
    if (this.descriptionTouched) return;
    this.newInvoice.description = value ?? this.formLines[0]?.description ?? '';
  }

  /** شرحی که فرستاده می‌شود: شرح کلی، وگرنه شرح ردیف اول */
  private get effectiveDescription(): string {
    return (this.newInvoice.description || '').trim() || (this.formLines[0]?.description || '').trim();
  }

  /**
   * سرفصل پیش‌فرض ردیف تازه: آخرین سرفصلی که کاربر در این شرکت انتخاب کرده (اگر هنوز فعال است)،
   * وگرنه تنها سرفصل فعال شرکت
   */
  private get defaultExpenseHeadId(): number | null {
    if (this.isLoadingExpenseHeads || this.expenseHeadsCompanyId !== this.sectionCompanyId) return null;
    const heads = this.expenseHeadGroups.flatMap(g => g.heads);
    const last = this.readLastExpenseHead();
    if (last !== null && heads.some(h => h.id === last)) return last;
    return heads.length === 1 ? (heads[0].id ?? null) : null;
  }

  private get lastExpenseHeadKey(): string | null {
    const companyId = this.sectionCompanyId;
    return companyId ? `employee-invoices.last-expense-head.${companyId}` : null;
  }

  private readLastExpenseHead(): number | null {
    const key = this.lastExpenseHeadKey;
    if (!key) return null;
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  /** انتخاب سرفصل یک ردیف: آخرین انتخاب برای ردیف و فاکتور بعدی به خاطر سپرده می‌شود */
  onLineHeadChange(headId: number | null): void {
    this.expenseHeadError = '';
    const key = this.lastExpenseHeadKey;
    if (!key || !headId) return;
    try {
      localStorage.setItem(key, String(headId));
    } catch {
      // حافظهٔ مرورگر در دسترس نیست؛ فقط پیش‌فرض از دست می‌رود
    }
  }

  /** طرف‌حساب انتخاب‌شده حساب فعال با شبای معتبر ندارد (فقط وقتی فهرست حساب‌ها را داریم) */
  get counterpartyShebaMissing(): boolean {
    const cp = this.counterparties.find(c => c.id === Number(this.newInvoice.counterparty));
    if (!cp || !Array.isArray(cp.bank_accounts)) return false;
    // شبای پوشیده (چهار رقم آخر) را این‌جا نمی‌شود سنجید؛ داوری نهایی با سرور است
    return !cp.bank_accounts.some(a => a.is_active !== false && !!a.sheba_number
      && (cp.bank_masked || validateSheba(a.sheba_number).isValid));
  }

  // ─── جستجوی طرف‌حساب: فهرست کوتاه می‌شود؛ تنها نتیجه خودش انتخاب می‌شود ───
  /** گزینه‌های کادر جستجوپذیر طرف‌حساب (جستجو در نام، کد ملی و تلفن در همان کادر) */
  private cpOptionsSource: Counterparty[] | null = null;
  private cpOptionsCache: SearchSelectOption[] = [];
  get counterpartyOptions(): SearchSelectOption[] {
    if (this.cpOptionsSource !== this.counterparties) {
      this.cpOptionsSource = this.counterparties;
      this.cpOptionsCache = this.counterparties.map(cp => ({
        value: cp.id,
        label: `${cp.name} (${cp.counterparty_type_display || cp.counterparty_type})`,
        keywords: `${cp.national_id || ''} ${cp.phone || ''} ${cp.mobile || ''}`
      }));
    }
    return this.cpOptionsCache;
  }

  onCounterpartySelected(id: number): void {
    this.newInvoice.counterparty = id;
    this.onDuplicateKeyChange();
  }

  // ─── Enter در ردیف: به ردیف بعد می‌رود و در ردیف آخر ردیف تازه می‌سازد ───
  onLineEnter(i: number, event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target || target.tagName !== 'INPUT') return;
    event.preventDefault();
    if (i === this.formLines.length - 1) {
      if (this.formLines.length >= this.maxLines) return;
      this.addLine();
      this.cdr.detectChanges();
    }
    setTimeout(() => (document.getElementById(`line_desc_${i + 1}`) as HTMLInputElement | null)?.focus());
  }

  /** نام کوتاه فاکتور در پیام‌ها (شمارهٔ فروشنده اختیاری است) */
  invoiceLabel(inv: Partial<ExpenseInvoice> | null | undefined): string {
    return inv?.invoice_number || inv?.number || (inv?.id ? `#${inv.id}` : '');
  }

  lineAmount(l: InvoiceLineForm): number {
    const q = Number(l.quantity);
    const p = Number(l.unit_price);
    if (!isFinite(q) || !isFinite(p) || q <= 0 || p < 0) return 0;
    return Math.round(q * p);
  }

  get subtotal(): number {
    return this.formLines.reduce((acc, l) => acc + this.lineAmount(l), 0);
  }

  get discountAmount(): number {
    const d = Number(this.discountInput);
    return isFinite(d) && d > 0 ? d : 0;
  }

  /** پایهٔ مالیات = جمع ردیف‌ها منهای تخفیف */
  get vatBase(): number {
    return Math.max(0, this.subtotal - this.discountAmount);
  }

  get suggestedVat(): number {
    return Math.round((this.vatBase * this.vatRate) / 100);
  }

  get vatAmount(): number {
    if (!this.vatApplicable) return 0;
    if (this.vatManualInput !== null) {
      const v = Number(this.vatManualInput);
      return isFinite(v) && v >= 0 ? v : 0;
    }
    return this.suggestedVat;
  }

  get vatDisplay(): string {
    return String(this.vatAmount);
  }

  get payableAmount(): number {
    return Math.max(0, this.subtotal - this.discountAmount) + this.vatAmount;
  }

  onVatInput(v: string | null): void {
    this.vatManualInput = v;
    this.vatError = '';
  }

  resetVatToSuggested(): void {
    this.vatManualInput = null;
  }

  get isVatManual(): boolean {
    return this.vatApplicable && this.vatManualInput !== null && this.vatAmount !== this.suggestedVat;
  }

  /** سرفصل‌های ردیف‌های یک فاکتور: «عنوان اول و n سرفصل دیگر» */
  headsSummary(inv: ExpenseInvoice): string {
    const titles: string[] = [];
    for (const l of inv.lines || []) {
      const t = l.expense_head_title;
      if (t && !titles.includes(t)) titles.push(t);
    }
    if (!titles.length) return inv.category || 'عمومی';
    return titles.length > 1 ? `${titles[0]} و ${this.formatNumber(titles.length - 1)} سرفصل دیگر` : titles[0];
  }

  // ─── هشدار فاکتور تکراری (فقط آنلاین؛ خطا بی‌صدا نادیده گرفته می‌شود) ───
  onDuplicateKeyChange(): void {
    if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
    this.duplicateTimer = setTimeout(() => this.runDuplicateCheck(), 400);
  }

  private runDuplicateCheck(): void {
    const counterparty = Number(this.newInvoice.counterparty);
    const invoiceNumber = (this.newInvoice.invoice_number || '').trim();
    const seq = ++this.duplicateSeq;
    if (!counterparty || !invoiceNumber || !this.treasuryOrgApi || this.isOffline || !this.isNewInvoiceModalOpen) {
      this.duplicateInfo = null;
      return;
    }
    const params: { counterparty: number; invoice_number: string; exclude?: number } = { counterparty, invoice_number: invoiceNumber };
    if (this.editingInvoiceId) params.exclude = this.editingInvoiceId;
    this.treasuryOrgApi.getExpenseInvoiceDuplicates(params).subscribe({
      next: (res) => {
        if (seq !== this.duplicateSeq) return;
        this.duplicateInfo = res && res.count > 0 ? res : null;
        this.cdr.detectChanges();
      },
      error: () => {
        if (seq !== this.duplicateSeq) return;
        this.duplicateInfo = null;
        this.cdr.detectChanges();
      }
    });
  }

  onInvoiceFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      // محدودیت حجم فایل تا ۱۰ مگابایت
      if (file.size > 10 * 1024 * 1024) {
        this.toast.show('warning', 'حجم فایل پیوست نباید بیشتر از ۱۰ مگابایت باشد.');
        return;
      }
      this.selectedInvoiceAttachment = file;
      this.attachmentFileName = file.name;
    }
    // انتخاب دوبارهٔ همان فایل هم رویداد change بدهد
    if (event.target) event.target.value = '';
  }

  removeSelectedAttachment(): void {
    this.selectedInvoiceAttachment = null;
    this.attachmentFileName = '';
  }

  /** پیام ردِ سرور کنار فیلد تاریخ فاکتور (دورهٔ مالی بسته) */
  invoiceDateError = '';
  /** پیام کنار انتخابگر سرفصل هزینه */
  expenseHeadError = '';

  /** شرکت بخش انتخاب‌شده (برای فهرست سرفصل)؛ وگرنه شرکت فعال */
  private get sectionCompanyId(): number | null {
    return this.selectedSection?.company_id ?? this.activeCompanyService?.activeCompanyId ?? null;
  }

  /** سرفصل‌های فعال شرکت بخش؛ از کش خواندن آفلاین هم پر می‌شود */
  loadExpenseHeads(): void {
    const companyId = this.sectionCompanyId;
    if (!companyId) {
      this.expenseHeadGroups = [];
      this.expenseHeadsCompanyId = null;
      return;
    }
    if (companyId === this.expenseHeadsCompanyId && this.expenseHeadGroups.length) return;
    this.expenseHeadsCompanyId = companyId;
    this.isLoadingExpenseHeads = true;
    this.personnelApi.getExpenseHeads(companyId, true).subscribe({
      next: (heads) => {
        if (companyId !== this.expenseHeadsCompanyId) return;
        this.expenseHeadGroups = buildExpenseHeadOptions(heads);
        this.isLoadingExpenseHeads = false;
        const only = this.defaultExpenseHeadId;
        if (only !== null) this.formLines.forEach(l => { if (l.expense_head == null) l.expense_head = only; });
        this.cdr.detectChanges();
      },
      error: () => {
        if (companyId !== this.expenseHeadsCompanyId) return;
        this.expenseHeadGroups = [];
        this.expenseHeadsCompanyId = null;
        this.isLoadingExpenseHeads = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** اعتبارسنجی سمت کاربر؛ سرور حرف آخر را می‌زند */
  private validateForm(): boolean {
    if (!this.newInvoice.counterparty) {
      this.toast.show('warning', 'لطفاً طرف‌حساب فاکتور را انتخاب کنید.');
      return false;
    }
    if (!this.newInvoice.invoice_date_shamsi?.trim()) {
      this.toast.show('warning', 'تاریخ فاکتور الزامی است.');
      return false;
    }
    this.lineErrors = {};
    this.linesError = '';
    this.formLines.forEach((l, i) => {
      if (!l.description.trim()) this.lineErrors[i] = 'شرح ردیف الزامی است.';
      else if (!(Number(l.quantity) > 0)) this.lineErrors[i] = 'تعداد باید بزرگ‌تر از صفر باشد.';
      else if (l.unit_price === null || l.unit_price === '' || !(Number(l.unit_price) >= 0)) this.lineErrors[i] = 'فی ردیف را وارد کنید.';
      else if (!l.expense_head) this.lineErrors[i] = 'سرفصل هزینهٔ این ردیف را انتخاب کنید.';
    });
    if (Object.keys(this.lineErrors).length) {
      this.toast.show('warning', 'ردیف‌های فاکتور را کامل کنید.');
      return false;
    }
    if (this.subtotal <= 0) {
      this.toast.show('warning', 'مبلغ فاکتور باید بزرگتر از صفر ریال باشد.');
      return false;
    }
    if (this.discountAmount > this.subtotal) {
      this.showTotalsExtras = true;
      this.discountError = 'تخفیف نمی‌تواند از جمع ردیف‌ها بیشتر باشد.';
      this.toast.show('warning', this.discountError);
      return false;
    }
    if (this.vatApplicable && this.vatAmount > this.vatBase) {
      this.showTotalsExtras = true;
      this.vatError = 'مالیات نمی‌تواند از مبلغ پس از تخفیف بیشتر باشد.';
      this.toast.show('warning', this.vatError);
      return false;
    }
    return true;
  }

  private linesPayload(): ExpenseInvoiceLine[] {
    return this.formLines.map(l => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unit: l.unit.trim(),
      unit_price: Number(l.unit_price) || 0,
      expense_head: l.expense_head
    }));
  }

  /** جمع‌ها را سرور حساب می‌کند؛ مبلغ مالیات فقط وقتی کاربر دستی نوشته فرستاده می‌شود */
  private totalsPayload(): { discount_amount: number; vat_applicable: boolean; vat_amount?: number } {
    const out: { discount_amount: number; vat_applicable: boolean; vat_amount?: number } = {
      discount_amount: this.discountAmount,
      vat_applicable: this.vatApplicable
    };
    if (this.vatApplicable && this.vatManualInput !== null) out.vat_amount = this.vatAmount;
    return out;
  }

  /** نگاشت خطای 400 ردیف‌ها (`lines`) از سرور به ردیف‌های فرم */
  private applyLineErrors(err: any): boolean {
    const lines = err?.error?.lines;
    if (!lines) return false;
    const first = (v: any): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
    this.lineErrors = {};
    this.linesError = '';
    if (Array.isArray(lines)) {
      this.linesError = first(lines);
    } else if (typeof lines === 'object') {
      for (const [idx, val] of Object.entries(lines)) {
        const msg = typeof val === 'object' && val !== null && !Array.isArray(val)
          ? Object.values(val as Record<string, unknown>).map(first).filter(Boolean)[0] || ''
          : first(val);
        if (msg) this.lineErrors[Number(idx)] = msg;
      }
    }
    const shown = this.linesError || Object.values(this.lineErrors)[0];
    if (shown) this.toast.show('error', shown);
    return !!shown;
  }

  /** mode: close = فقط ذخیره؛ send = ذخیره و ارسال به سرپرست (فقط آنلاین)؛ new = ذخیره و فرم خالی برای فاکتور بعدی */
  saveInvoice(mode: 'close' | 'send' | 'new' = 'close'): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'بخش فعال مشخص نیست.');
      return;
    }
    if (mode === 'send' && this.isOffline) {
      this.toast.show('warning', 'ارسال فاکتور به گردش فقط در حالت آنلاین ممکن است؛ فعلاً فقط ذخیره کنید.');
      return;
    }
    if (mode === 'send' && this.counterpartyShebaMissing) {
      this.toast.show('warning', 'طرف‌حساب شبای معتبر ندارد؛ فاکتور را پیش‌نویس ذخیره کنید و پس از ثبت شبا بفرستید.');
      return;
    }
    if (!this.validateForm()) return;

    this.isSaving = true;
    this.invoiceDateError = '';
    this.expenseHeadError = '';
    this.discountError = '';
    this.vatError = '';

    const lines = this.linesPayload();
    const totals = this.totalsPayload();
    const editingId = this.editingInvoiceId;

    // در صورت وجود پیوست از FormData استفاده می‌کنیم (`lines` به‌صورت رشتهٔ JSON؛ سرور می‌پذیرد)
    let payload: Partial<ExpenseInvoice> | FormData;
    if (this.selectedInvoiceAttachment) {
      const formData = new FormData();
      formData.append('section', String(this.selectedSectionId));
      formData.append('counterparty', String(this.newInvoice.counterparty));
      formData.append('invoice_number', (this.newInvoice.invoice_number || '').trim());
      formData.append('invoice_date_shamsi', this.newInvoice.invoice_date_shamsi!.trim());
      formData.append('lines', JSON.stringify(lines));
      formData.append('discount_amount', String(totals.discount_amount));
      formData.append('vat_applicable', String(totals.vat_applicable));
      if (totals.vat_amount !== undefined) formData.append('vat_amount', String(totals.vat_amount));
      formData.append('description', this.effectiveDescription);
      if (!editingId) formData.append('status', 'draft'); // Guardian G2
      formData.append('attachment', this.selectedInvoiceAttachment);
      payload = formData;
    } else {
      const body: Partial<ExpenseInvoice> = {
        section: this.selectedSectionId,
        counterparty: this.newInvoice.counterparty,
        invoice_number: (this.newInvoice.invoice_number || '').trim(),
        invoice_date_shamsi: this.newInvoice.invoice_date_shamsi!.trim(),
        lines,
        ...totals,
        description: this.effectiveDescription
      };
      if (!editingId) body.status = 'draft'; // Guardian G2
      payload = body;
    }

    const request$ = editingId
      ? this.personnelApi.updateExpenseInvoice(editingId, payload)
      : this.personnelApi.createExpenseInvoice(payload);
    request$.subscribe({
      next: (saved: ExpenseInvoice) => {
        this.isSaving = false;
        const keptDate = this.newInvoice.invoice_date_shamsi || this.todayShamsi;
        this.closeNewInvoiceModal();
        if (mode === 'send' && saved?.id) {
          // ارسال همان مسیر دکمهٔ «ارسال» است (دلیل تکراری و خطاها را خودش نشان می‌دهد)
          this.submitInvoice(saved);
          return;
        }
        this.toast.show('success', editingId
          ? `فاکتور «${this.invoiceLabel(saved) || this.invoiceLabel(this.newInvoice)}» ویرایش شد.`
          : `فاکتور${this.invoiceLabel(saved) ? ` «${this.invoiceLabel(saved)}»` : ''} با موفقیت در وضعیت پیش‌نویس ثبت شد.`);
        if (mode === 'new') {
          this.openNewInvoiceModal();
          this.newInvoice.invoice_date_shamsi = keptDate;
          this.invoiceDateControl.setValue(keptDate, { emitEvent: false });
        }
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        const closedMsg = fiscalPeriodClosedMessage(err, 'invoice_date_shamsi');
        const e = err?.error;
        const firstOf = (v: any): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
        if (closedMsg) {
          // دورهٔ مالی بسته: پیام کنار فیلد تاریخ (۳.۲ ص۵)
          this.invoiceDateError = closedMsg;
          this.toast.show('error', closedMsg);
        } else if (this.applyLineErrors(err)) {
          // خطای ردیف‌ها (سرفصل نادرست و ...) کنار همان ردیف نمایش داده شد
        } else if (firstOf(e?.discount_amount)) {
          this.showTotalsExtras = true;
          this.discountError = firstOf(e.discount_amount);
          this.toast.show('error', this.discountError);
        } else if (firstOf(e?.vat_amount)) {
          this.showTotalsExtras = true;
          this.vatError = firstOf(e.vat_amount);
          this.toast.show('error', this.vatError);
        } else {
          this.toast.show('error', 'خطا در ثبت فاکتور: ' + (e?.error || err.message || 'نامشخص'));
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ─── مودال تعریف سریع / ویرایش طرف‌حساب ───
  /** طرف‌حسابی که در مودال ویرایش می‌شود (null = تعریف تازه) */
  editingCounterpartyId: number | null = null;

  /** کارمند طرف‌حسابی را که خودش ثبت کرده ویرایش می‌کند (سرور هم همین را می‌سنجد) */
  get canEditSelectedCounterparty(): boolean {
    const cp = this.counterparties.find(c => c.id === Number(this.newInvoice.counterparty));
    if (!cp) return false;
    const userId = this.auth.user()?.id;
    return !!this.auth.user()?.is_superuser || (!!userId && cp.created_by === userId);
  }

  openEditCounterpartyModal(): void {
    const cp = this.counterparties.find(c => c.id === Number(this.newInvoice.counterparty));
    if (!cp?.id) return;
    this.cpForm.reset({
      ...emptyCounterpartyForm(),
      kind: cp.kind || 'person',
      name: cp.name,
      counterparty_type: cp.counterparty_type,
      national_id: cp.national_id || '',
      economic_code: cp.economic_code || '',
      registration_number: cp.registration_number || '',
      phone: cp.phone || '',
      mobile: cp.mobile || '',
      email: cp.email || '',
      address: cp.address || '',
      postal_code: cp.postal_code || '',
      notes: cp.notes || '',
      account_code: cp.account_code || '',
      is_active: cp.is_active !== false
    });
    this.cpForm.loadBank(cp);
    this.editingCounterpartyId = cp.id;
    this.isQuickCounterpartyModalOpen = true;
    this.cdr.detectChanges();
  }

  openQuickCounterpartyModal(): void {
    this.editingCounterpartyId = null;
    this.cpForm.reset({ ...emptyCounterpartyForm(), counterparty_type: 'repair_shop' });
    this.isQuickCounterpartyModalOpen = true;
    this.cdr.detectChanges();
  }

  closeQuickCounterpartyModal(): void {
    this.isQuickCounterpartyModalOpen = false;
    this.editingCounterpartyId = null;
    this.cdr.detectChanges();
  }

  saveQuickCounterparty(): void {
    const name = this.newCounterparty.name?.trim() || '';
    if (!name) {
      this.toast.show('warning', 'نام شخص یا شرکت/فروشگاه الزامی است.');
      return;
    }
    if (this.cpForm.isShebaInvalid) {
      this.toast.show('warning', 'شماره شبا معتبر نیست.');
      return;
    }

    this.isSaving = true;
    const payload: Partial<Counterparty> = this.cpForm.buildIdentityPayload(name);

    const editId = this.editingCounterpartyId;
    if (editId) {
      // ویرایش حساب اصلی با فیلدهای تخت؛ مقدار پوشیده (دارای *) فرستاده نمی‌شود
      if (this.cpForm.hasPendingBankAccount()) {
        const bank = this.cpForm.buildBankAccountPayload();
        payload.sheba_number = bank.sheba_number;
        payload.bank_name = bank.bank_name;
        if (!isMaskedValue(bank.account_number)) payload.account_number = bank.account_number;
      }
      this.personnelApi.updateCounterparty(editId, payload).subscribe({
        next: (saved: Counterparty) => {
          this.isSaving = false;
          this.toast.show('success', `طرف‌حساب «${saved?.name || payload.name}» ویرایش شد.`);
          this.closeQuickCounterpartyModal();
          this.loadCounterparties();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isSaving = false;
          const e = err?.error;
          const first = (v: any): string => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');
          this.toast.show('error', first(e?.sheba_number) || first(e?.national_id) || first(e?.detail)
            || first(e?.error) || 'ویرایش طرف‌حساب انجام نشد.');
          this.cdr.detectChanges();
        }
      });
      return;
    }

    // شرکت فعال در بدنه می‌ماند تا بازپخش صف آفلاین (که هدر شرکت ندارد) طرف‌حساب در شرکت درست ساخته شود
    // حساب اولیه (اصلی) تو در تو در همان درخواست، مثل صفحهٔ طرف‌حساب‌ها
    if (this.cpForm.hasPendingBankAccount()) {
      payload.bank_accounts = [{ ...this.cpForm.buildBankAccountPayload(), is_primary: true }];
    }
    const companyId = this.activeCompanyService?.activeCompanyId;
    this.personnelApi.createCounterparty(companyId ? { ...payload, company: companyId } : payload).subscribe({
      next: (created: Counterparty) => {
        this.isSaving = false;
        // پاسخ 200 با existing یعنی همان طرف حساب موجود برگشت (تکراری)، نه خطا
        if (created.existing) {
          this.toast.show('info', `طرف‌حساب «${created.name}» از قبل ثبت شده بود (تکراری) و انتخاب شد.`);
        } else {
          this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت افزوده شد.`);
        }
        this.closeQuickCounterpartyModal();
        this.loadCounterparties();
        // انتساب خودکار طرف‌حساب تازه تعریف‌شده در فرم ثبت فاکتور
        if (this.isNewInvoiceModalOpen && created.id) {
          this.newInvoice.counterparty = created.id;
          this.onDuplicateKeyChange();
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت طرف‌حساب: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ارسال فاکتور پیش‌نویس به سرپرست کارگاه ───
  async sendToSupervisor(invoice: ExpenseInvoice): Promise<void> {
    if (!invoice.id) return;
    if (!this.isEditable(invoice)) {
      this.toast.show('warning', 'فقط فاکتورهای پیش‌نویس یا برگشتی برای اصلاح قابلیت ارسال به سرپرست را دارند.');
      return;
    }

    if ((await this.confirmDialog?.open({ title: 'ارسال برای سرپرست', message: `آیا از ارسال فاکتور شماره «${this.invoiceLabel(invoice)}» به سرپرست جهت بررسی و تایید اطمینان دارید؟`, type: 'info' })) !== true) {
      return;
    }

    if (this.isOffline) {
      this.toast.show('warning', 'ارسال فاکتور به گردش فقط در حالت آنلاین ممکن است.');
      return;
    }
    this.submitInvoice(invoice);
  }

  /** ارسال به گردش (همیشه آنلاین)؛ فاکتور تکراری دلیل می‌خواهد */
  private submitInvoice(invoice: ExpenseInvoice, reason?: string): void {
    if (!invoice.id || !this.treasuryOrgApi) return;
    this.isSaving = true;
    this.treasuryOrgApi.submitExpenseInvoice(invoice.id, reason).subscribe({
      next: () => {
        this.isSaving = false;
        this.closeDuplicateReason();
        this.toast.show('success', `فاکتور شماره «${this.invoiceLabel(invoice)}» با موفقیت جهت تایید به کارتابل سرپرست ارسال شد.`);
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        if (err?.status === 400 && err.error?.code === 'duplicate_reason_required' && !reason) {
          this.duplicateReasonInvoice = invoice;
          this.duplicateReasonServerError = '';
          this.isDuplicateReasonOpen = true;
          this.cdr.detectChanges();
          return;
        }
        const msg = (typeof err?.status === 'number' && isServerUnreachable(err.status))
          ? 'اتصال به سرور برقرار نیست؛ ارسال فقط آنلاین ممکن است.'
          : err?.error?.code === 'counterparty_sheba_required'
          ? String(err.error.error || '')
          : (fiscalPeriodClosedMessage(err, 'invoice_date_shamsi') || expenseHeadErrorMessage(err) || ('خطا در ارسال به سرپرست: ' + (err.error?.error || err.error?.detail || err.message || 'نامشخص')));
        if (this.isDuplicateReasonOpen) {
          this.duplicateReasonServerError = msg;
        } else {
          this.toast.show('error', msg);
        }
        this.cdr.detectChanges();
      }
    });
  }

  onDuplicateReasonConfirmed(reason: string): void {
    if (this.duplicateReasonInvoice) this.submitInvoice(this.duplicateReasonInvoice, reason);
  }

  closeDuplicateReason(): void {
    this.isDuplicateReasonOpen = false;
    this.duplicateReasonInvoice = null;
    this.duplicateReasonServerError = '';
  }

  // ─── چاپ / PDF ───
  get canPrint(): boolean {
    return this.printService ? this.printService.isOnline() : !this.isOffline;
  }

  printInvoice(inv: ExpenseInvoice | null | undefined): void {
    if (!inv?.id || !this.printService) return;
    void this.printService.downloadPdf('expense_invoice', inv.id);
  }

  // ─── حذف فاکتور پیش‌نویس ───
  async deleteDraftInvoice(invoice: ExpenseInvoice): Promise<void> {
    if (!invoice.id) return;
    if (invoice.status !== 'draft') {
      this.toast.show('warning', 'فقط فاکتورهای در وضعیت پیش‌نویس قابل حذف توسط کارمند هستند.');
      return;
    }

    if ((await this.confirmDialog?.open({ title: 'حذف', message: `آیا از حذف فاکتور پیش‌نویس شماره «${this.invoiceLabel(invoice)}» اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`, type: 'danger', confirmText: 'حذف' })) !== true) {
      return;
    }

    this.isSaving = true;
    this.personnelApi.deleteExpenseInvoice(invoice.id).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `فاکتور پیش‌نویس «${this.invoiceLabel(invoice)}» حذف شد.`);
        this.loadInvoices();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', fiscalPeriodClosedMessage(err, 'invoice_date_shamsi') || expenseHeadErrorMessage(err) || ('خطا در حذف فاکتور: ' + (err.error?.error || err.message || 'نامشخص')));
      }
    });
  }

  // ─── پیش‌نمایش تصویر پیوست ───
  openAttachmentPreview(invoice: ExpenseInvoice): void {
    if (!invoice.attachment) return;
    this.previewAttachmentUrl = invoice.attachment;
    this.previewInvoiceTitle = `پیوست فاکتور شماره ${this.invoiceLabel(invoice)} - ${invoice.counterparty_name || ''}`;
    this.isAttachmentPreviewModalOpen = true;
    this.cdr.detectChanges();
  }

  closeAttachmentPreview(): void {
    this.isAttachmentPreviewModalOpen = false;
    this.previewAttachmentUrl = null;
    this.previewInvoiceTitle = '';
    this.cdr.detectChanges();
  }

  downloadPreviewAttachment(): void {
    if (this.previewAttachmentUrl) {
      void saveUrl(this.previewAttachmentUrl);
    }
  }

  // ─── خروجی اکسل استاندارد فاکتورها ───
  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    const params = {
      section_id: this.selectedSectionId,
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined
    };

    this.toast.show('info', 'در حال تولید فایل اکسل فاکتورهای هزینه...');
    this.personnelApi.exportExpenseInvoicesExcel(params).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `expense_invoices_${this.selectedSection?.code || 'section'}.xlsx`);
        this.toast.show('success', 'فایل اکسل با موفقیت دانلود شد.');
      },
      error: (err: any) => {
        this.toast.show('error', 'خطا در دانلود فایل اکسل: ' + (err.message || 'نامشخص'));
      }
    });
  }

  // ─── برچسب‌ها و استایل‌های وضعیت فاکتور ───
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'pending_supervisor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'pending_accountant':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'ready_to_pay':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'partially_paid':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس کارمند';
      case 'pending_supervisor':
        return 'در انتظار تایید سرپرست';
      case 'pending_accountant':
        return 'در انتظار بررسی حسابدار';
      case 'ready_to_pay':
        return 'تایید مدیر / آماده پرداخت';
      case 'partially_paid':
        return 'پرداخت ناقص';
      case 'paid':
        return 'تسویه و پرداخت‌شده';
      case 'rejected':
        return 'رد شده';
      default:
        return status || 'نامشخص';
    }
  }

  formatNumber(val: number | string | undefined | null): string {
    if (val === undefined || val === null || val === '') return '۰';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    return n.toLocaleString('fa-IR');
  }
}
