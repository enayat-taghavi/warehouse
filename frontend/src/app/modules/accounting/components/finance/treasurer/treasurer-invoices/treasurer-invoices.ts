import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional, ViewChild, Input, Output, EventEmitter, inject } from '@angular/core';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { FormControl } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { fiscalPeriodClosedMessage } from '../../../../fiscal-period-error';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, InvoicePayment, InvoicePaymentMethod, PartyBankAccount, ExpenseInvoice } from '../../../../models/personnel.model';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { CompanyBankAccount, isSafeBankUrl } from '../../../../../../core/models/company.model';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { AmountInputComponent } from '../../../../../../shared/components/amount-input/amount-input.component';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';
import { PrintService } from '../../../../../../core/services/print.service';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { AttachmentsComponent } from '../../../../../../shared/components/attachments/attachments.component';
import { PAYMENT_RECEIPT_ACCEPT, PAYMENT_RECEIPT_LABEL, receiptFileError } from '../../../../payment-receipt';
import { InvoiceReceiptButtonComponent } from '../../invoice-receipt-button/invoice-receipt-button';
import { InvoicePreviewModalComponent } from '../../invoice-preview-modal/invoice-preview-modal.component';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';

export interface PayableInvoiceItem {
  id: number;
  invoice_number: string;
  vendor_name: string;
  category: string;
  section_id?: number | null;
  project_name?: string;
  section_name: string;
  amount: number;
  due_date: string;
  status: 'pending_payment' | 'partially_paid' | 'paid' | 'settled_outside';
  tracking_code?: string;
  number?: string | null;
  counterparty_id?: number | null;
  paid_amount: number;
  remaining: number;
  created_by_name?: string;
  created_at?: string;
  updated_by_name?: string;
  updated_at?: string;
}

@Component({
  selector: 'app-treasurer-invoices-hub',
  standalone: true,
  imports: [
    CommonModule,
    AttachmentsComponent,
    FormsModule,
    ReactiveFormsModule,
    ActionButtonComponent,
    CommandCenterComponent,
    ModalComponent,
    AmountInputComponent,
    WorkflowReasonDialogComponent,
    NgPersianDatepickerModule,
    SvgIconDirective,
    InvoiceReceiptButtonComponent,
    InvoicePreviewModalComponent,
    PersianDatePipe
  ],
  templateUrl: './treasurer-invoices.html',
  styleUrl: './treasurer-invoices.css'
})
export class TreasurerInvoicesComponent implements OnInit, OnDestroy {
  protected perm = inject(PermissionService);
  /** درون فهرست یکپارچهٔ فاکتورها: فقط کارها و پنجره‌ها؛ بارگذاری و فهرست با میزبان است */
  @Input() embedded = false;
  /** پس از هر کار موفق در حالت embedded (میزبان فهرست را دوباره می‌خواند) */
  @Output() changed = new EventEmitter<void>();

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Search & Filters
  searchQuery = '';
  fiscalYear = '1405';

  // State
  isLoading = false;

  /** همهٔ فاکتورهای کارتابل (دامنهٔ سرور)؛ invoices همین فهرست با فیلتر بخش انتخاب‌شده است */
  allInvoices: PayableInvoiceItem[] = [];
  invoices: PayableInvoiceItem[] = [];

  // مودال پیش‌نمایش و سابقه فاکتور
  previewModalOpen = false;
  previewInvoiceId: number | null = null;
  previewInvoiceItem: any = null;
  previewInitialTab: 'preview' | 'history' = 'preview';

  openPreview(item: PayableInvoiceItem, tab: 'preview' | 'history' = 'preview'): void {
    this.previewInvoiceId = item.id || null;
    this.previewInvoiceItem = item;
    this.previewInitialTab = tab;
    this.previewModalOpen = true;
  }

  closePreview(): void {
    this.previewModalOpen = false;
    this.previewInvoiceId = null;
    this.previewInvoiceItem = null;
  }

  private routeSub?: Subscription;
  private docSub?: Subscription;
  private liveSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private treasuryApi: TreasuryOrgApiService,
    private companyApi: CompanyApiService,
    private printService: PrintService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    if (this.embedded) return;
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.loadSections();

    // ص۶ طرح ۲.۵: ردیف‌های این صفحه برچسب وضعیت خودشان را دارند، پس هر تغییر فاکتور = بازخوانی بی‌صدا
    this.liveSub = this.ws?.liveRefresh$?.().subscribe(() => this.loadTreasuryData(true));
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(() => this.loadTreasuryData(true));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.docSub?.unsubscribe();
    this.liveSub?.unsubscribe();
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          this.personnelApi.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs: ProjectSection[]) => {
              this.mySections = allSecs || [];
              this.pickDefaultSection();
            },
            error: () => {
              this.isLoadingSections = false;
              this.loadTreasuryData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.loadTreasuryData();
      }
    });
  }

  /** پیش‌فرض «همه بخش‌ها» (null)؛ section_id نشانی فقط وقتی بخش در فهرست کاربر باشد می‌ماند */
  private pickDefaultSection(): void {
    if (this.selectedSectionId && !this.mySections.some(s => s.id === this.selectedSectionId)) {
      this.selectedSectionId = null;
    }
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.isLoadingSections = false;
    this.loadTreasuryData();
  }

  onSectionChanged(): void {
    this.selectedSectionId = this.selectedSectionId ? Number(this.selectedSectionId) : null;
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.syncUrlParams();
    this.applySectionFilter();
  }

  /** کارتابل خزانه بخش نمی‌گیرد؛ فیلتر بخش سمت کاربر و فقط روی فهرست دامنه‌دار سرور اعمال می‌شود */
  private applySectionFilter(): void {
    const sid = this.selectedSectionId;
    this.invoices = sid ? this.allInvoices.filter(i => Number(i.section_id) === sid) : [...this.allInvoices];
    this.cdr.detectChanges();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** ردیف فاکتور (کارتابل خزانه یا فهرست یکپارچه) به ردیف قابل پرداخت */
  toPayableItem(inv: any): PayableInvoiceItem {
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      vendor_name: inv.counterparty_name || 'طرف‌حساب',
      category: inv.category,
      section_id: inv.section ?? null,
      project_name: inv.project_name || '',
      section_name: inv.section_name || '',
      amount: inv.amount,
      due_date: inv.invoice_date_shamsi,
      status: inv.status === 'paid' ? 'paid' : (inv.status === 'settled_outside' ? 'settled_outside' : (inv.status === 'partially_paid' ? 'partially_paid' : 'pending_payment')),
      tracking_code: inv.payment_ref,
      number: inv.number || null,
      counterparty_id: inv.counterparty ?? null,
      paid_amount: Number(inv.paid_amount || 0),
      remaining: inv.remaining !== undefined && inv.remaining !== null ? Number(inv.remaining) : Number(inv.amount || 0) - Number(inv.paid_amount || 0)
    };
  }

  /** پرداخت از فهرست یکپارچهٔ فاکتورها (حالت embedded) */
  payExpenseInvoice(inv: ExpenseInvoice): void {
    this.payInvoice(this.toPayableItem(inv));
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadTreasuryData(silent = false): void {
    if (this.embedded) { this.cdr.markForCheck(); this.changed.emit(); return; }
    if (!silent) this.isLoading = true;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (res: any) => {
        const rawInvoices = res?.invoices || [];
        this.allInvoices = rawInvoices.map((inv: any) => this.toPayableItem(inv));

        this.isLoading = false;
        this.applySectionFilter();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.toast.error('خطا در دریافت اطلاعات خزانه‌داری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ── پنجرهٔ ثبت قسط (۴.۱-ج) ──
  payModalOpen = false;
  payItem: PayableInvoiceItem | null = null;
  payAmount: string | number | null = null;
  payMethod: InvoicePaymentMethod = 'transfer';
  payCompanyAccount: number | null = null;
  payPartyAccount: number | null = null;
  payTracking = '';
  payNotes = '';
  payDateControl = new FormControl('');
  isPayDatePickerOpen = false;
  payFieldErrors: Record<string, string> = {};
  payGeneralError = '';
  isPaying = false;
  payments: InvoicePayment[] = [];
  paymentsLoading = false;
  // رسید پرداخت اجباری هر قسط (۹ آبان ۱۴۰۵)
  payReceipt: File | null = null;
  readonly receiptLabel = PAYMENT_RECEIPT_LABEL;
  readonly receiptAccept = PAYMENT_RECEIPT_ACCEPT;
  private payReceiptInput: HTMLInputElement | null = null;
  @ViewChild('payReceipts') payReceipts?: AttachmentsComponent;
  companyAccounts: CompanyBankAccount[] = [];
  partyAccounts: PartyBankAccount[] = [];
  readonly methodOptions: { value: InvoicePaymentMethod; label: string }[] = [
    { value: 'transfer', label: 'انتقال' },
    { value: 'cheque', label: 'چک' },
    { value: 'cash', label: 'نقد' }
  ];

  // ابطال قسط
  voidDialogOpen = false;
  voidDialogServerError = '';
  pendingVoid: InvoicePayment | null = null;

  get needsCompanyAccount(): boolean {
    return this.payMethod !== 'cash';
  }

  get selectedPartyAccount(): PartyBankAccount | null {
    return this.partyAccounts.find(a => a.id === this.payPartyAccount) || null;
  }

  get selectedCompanyAccount(): CompanyBankAccount | null {
    return this.companyAccounts.find(a => a.id === this.payCompanyAccount) || null;
  }

  /** آدرس سایت بانکِ حساب انتخاب‌شدهٔ شرکت؛ فقط https (دفاع دوم پس از سرور) */
  get selectedCompanyBankUrl(): string | null {
    const url = (this.selectedCompanyAccount?.internet_bank_url || '').trim();
    return isSafeBankUrl(url) ? url : null;
  }

  /** کلیدِ آخرین مقدار کپی‌شده برای نشانهٔ «کپی شد» کنار همان دکمه */
  copiedKey: string | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  /** کپی شماره حساب یا شبا برای چسباندن در سایت بانک؛ مرورگر بی Clipboard API (آیفون قدیمی) از execCommand */
  async copyValue(value: string | null | undefined, key: string, labelFa: string): Promise<void> {
    const text = (value || '').replace(/\s+/g, '');
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { ok = false; }
    if (!ok) ok = this.legacyCopy(text);
    if (!ok) {
      this.toast.error('کپی ممکن نشد؛ شماره را دستی انتخاب کنید.');
      return;
    }
    this.copiedKey = key;
    this.toast.success(`${labelFa} کپی شد.`);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.copiedKey = null;
      this.cdr.detectChanges();
    }, 2000);
    this.cdr.detectChanges();
  }

  private legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  private isOffline(): boolean {
    const net = NetworkStatusService.getInstance();
    return !net.isBrowserOnline || net.state === 'offline';
  }

  private todayShamsi(): string {
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }

  private resetPayForm(remaining: number): void {
    this.payAmount = remaining > 0 ? String(remaining) : null;
    this.payMethod = 'transfer';
    this.payPartyAccount = null;
    this.payTracking = '';
    this.payNotes = '';
    this.clearPayReceipt();
    this.payFieldErrors = {};
    this.payGeneralError = '';
    this.isPayDatePickerOpen = false;
    this.payDateControl.setValue(this.todayShamsi(), { emitEvent: false });
    if (this.companyAccounts.length && !this.companyAccounts.some(a => a.id === this.payCompanyAccount)) {
      const primary = this.companyAccounts.find(a => a.is_primary) || this.companyAccounts[0];
      this.payCompanyAccount = primary?.id ?? null;
    }
  }

  payInvoice(item: PayableInvoiceItem): void {
    if (this.isOffline()) {
      this.toast.error('پرداخت فقط با اتصال به سرور ممکن است.');
      return;
    }
    this.payItem = item;
    this.payments = [];
    this.partyAccounts = [];
    this.payModalOpen = true;
    this.resetPayForm(item.remaining);
    this.loadPayments();
    this.loadCompanyAccounts();
    this.loadPartyAccounts(item);
  }

  closePayModal(): void {
    this.payModalOpen = false;
    this.payItem = null;
    this.isPayDatePickerOpen = false;
  }

  private loadCompanyAccounts(): void {
    if (this.companyAccounts.length) return;
    this.companyApi.getBankAccounts().subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.results || []);
        this.companyAccounts = list.filter(a => a.is_active !== false);
        const primary = this.companyAccounts.find(a => a.is_primary) || this.companyAccounts[0];
        if (this.payCompanyAccount === null) this.payCompanyAccount = primary?.id ?? null;
        this.cdr.detectChanges();
      },
      error: () => { /* فهرست حساب‌ها فقط برای انتخاب است؛ خطای ثبت از سرور می‌آید */ }
    });
  }

  private loadPartyAccounts(item: PayableInvoiceItem): void {
    if (!item.counterparty_id) return;
    this.personnelApi.getCounterparties().subscribe({
      next: (list) => {
        const cp = (list || []).find(c => c.id === item.counterparty_id);
        if (!cp?.party) return;
        this.personnelApi.getPartyBankAccounts(cp.party).subscribe({
          next: (accs) => {
            // پاسخ دیرِ فاکتور قبلی جای حساب‌های فاکتور تازه را نمی‌گیرد
            if (this.payItem?.id !== item.id) return;
            this.partyAccounts = (accs || []).filter(a => a.is_active !== false);
            // حساب اصلی (یا تنها حساب) طرف‌حساب از پیش انتخاب می‌شود تا شماره‌اش برای کپی دیده شود
            if (this.payPartyAccount === null) {
              const preferred = this.partyAccounts.find(a => a.is_primary)
                || (this.partyAccounts.length === 1 ? this.partyAccounts[0] : undefined);
              this.payPartyAccount = preferred?.id ?? null;
            }
            this.cdr.detectChanges();
          },
          error: () => { /* اختیاری */ }
        });
      },
      error: () => { /* اختیاری */ }
    });
  }

  loadPayments(): void {
    if (!this.payItem) return;
    const item = this.payItem;
    this.paymentsLoading = true;
    this.treasuryApi.getInvoicePayments(item.id).subscribe({
      next: (res) => {
        this.paymentsLoading = false;
        this.payments = res.results || [];
        item.paid_amount = Number(res.paid_amount || 0);
        item.remaining = Number(res.remaining || 0);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.paymentsLoading = false;
        this.payGeneralError = this.isUnreachable(err)
          ? 'اتصال به سرور برقرار نیست؛ ثبت و ابطال قسط فقط آنلاین ممکن است.'
          : this.errorText(err, 'خطا در دریافت قسط‌ها');
        this.cdr.detectChanges();
      }
    });
  }

  togglePayDatePicker(event?: Event): void {
    if (event) event.stopPropagation();
    this.isPayDatePickerOpen = !this.isPayDatePickerOpen;
  }

  onPayDateSelect(event: any): void {
    if (!event) return;
    this.isPayDatePickerOpen = false;
    if (event.shamsi) {
      let raw = String(event.shamsi).replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
      const parts = raw.split('/');
      if (parts.length === 3) {
        raw = `${parts[0]}/${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}`;
      }
      this.payDateControl.setValue(raw, { emitEvent: false });
    }
  }

  private isUnreachable(err: any): boolean {
    return typeof err?.status === 'number' && isServerUnreachable(err.status);
  }

  private errorText(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body) return body;
    return body?.error || body?.detail || body?.message || err?.message || fallback;
  }

  /** پیام اولین رشتهٔ یک خطای فیلد DRF (رشته، فهرست یا شیء) */
  private fieldMessage(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      for (const x of v) {
        const m = this.fieldMessage(x);
        if (m) return m;
      }
      return '';
    }
    if (typeof v === 'object') {
      return this.fieldMessage(v.message ?? v.error ?? v.detail ?? Object.values(v).find(x => typeof x === 'string' || Array.isArray(x)));
    }
    return '';
  }

  onPayReceiptChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.payReceiptInput = input;
    const file = input.files?.[0] ?? null;
    const error = file ? receiptFileError(file) : '';
    this.payReceipt = file && !error ? file : null;
    const { receipt: _old, ...rest } = this.payFieldErrors;
    this.payFieldErrors = error ? { ...rest, receipt: error } : rest;
  }

  private clearPayReceipt(): void {
    this.payReceipt = null;
    if (this.payReceiptInput) this.payReceiptInput.value = '';
  }

  submitPayment(): void {
    const item = this.payItem;
    if (!item || this.isPaying) return;
    if (this.isOffline()) {
      this.payGeneralError = 'اتصال به سرور برقرار نیست؛ پرداخت فقط آنلاین ممکن است.';
      return;
    }
    const errors: Record<string, string> = {};
    const amount = Number(String(this.payAmount ?? '').replace(/,/g, ''));
    if (!amount || amount <= 0) errors['amount'] = 'مبلغ پرداخت را وارد کنید.';
    else if (amount > item.remaining) errors['amount'] = 'مبلغ پرداخت از مانده بیشتر است.';
    if (this.needsCompanyAccount && !this.payCompanyAccount) errors['company_bank_account'] = 'حساب بانکی شرکت را انتخاب کنید.';
    const date = (this.payDateControl.value || '').trim();
    if (!date) errors['payment_date_shamsi'] = 'تاریخ پرداخت را وارد کنید.';
    if (!this.payReceipt) errors['receipt'] = 'سند واریز را پیوست کنید.';
    this.payFieldErrors = errors;
    this.payGeneralError = '';
    if (Object.keys(errors).length) return;

    const body: any = {
      amount: String(amount),
      payment_date_shamsi: date,
      tracking_code: this.payTracking.trim(),
      method: this.payMethod,
      notes: this.payNotes.trim()
    };
    if (this.needsCompanyAccount) body.company_bank_account = this.payCompanyAccount;
    if (this.payPartyAccount) body.party_bank_account = this.payPartyAccount;

    this.isPaying = true;
    this.treasuryApi.addInvoicePayment(item.id, body, this.payReceipt!).subscribe({
      next: (res) => {
        this.isPaying = false;
        this.toast.success(res.message || 'قسط پرداخت ثبت شد.');
        void this.payReceipts?.load();
        item.paid_amount = Number(res.paid_amount || 0);
        item.remaining = Number(res.remaining || 0);
        if (item.remaining <= 0) {
          item.status = 'paid';
          this.closePayModal();
        } else {
          item.status = 'partially_paid';
          this.resetPayForm(item.remaining);
          this.loadPayments();
        }
        this.loadTreasuryData(true);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isPaying = false;
        this.handlePayError(err);
        this.cdr.detectChanges();
      }
    });
  }

  private handlePayError(err: any): void {
    if (this.isUnreachable(err)) {
      this.payGeneralError = 'اتصال به سرور برقرار نیست؛ پرداخت فقط آنلاین ممکن است.';
      return;
    }
    const body = err?.error;
    if (err?.status === 400 && body && typeof body === 'object' && !Array.isArray(body)) {
      const known = ['amount', 'payment_date_shamsi', 'tracking_code', 'method', 'company_bank_account', 'party_bank_account', 'notes', 'receipt'];
      const errs: Record<string, string> = {};
      for (const k of known) {
        const m = this.fieldMessage(body[k]);
        if (m) errs[k] = m;
      }
      if (errs['payment_date_shamsi']) {
        errs['payment_date_shamsi'] = fiscalPeriodClosedMessage(err, 'payment_date_shamsi') || errs['payment_date_shamsi'];
      }
      this.payFieldErrors = errs;
      this.payGeneralError = Object.keys(errs).length ? '' : this.errorText(err, 'پرداخت ناموفق بود.');
      return;
    }
    // 403 و 409: {code, error}
    this.payGeneralError = this.errorText(err, 'پرداخت ناموفق بود.');
  }

  // ── ابطال قسط ──
  askVoid(p: InvoicePayment): void {
    if (this.isOffline()) {
      this.toast.error('ابطال قسط فقط با اتصال به سرور ممکن است.');
      return;
    }
    this.pendingVoid = p;
    this.voidDialogServerError = '';
    this.voidDialogOpen = true;
  }

  onVoidConfirmed(reason: string): void {
    const item = this.payItem;
    const p = this.pendingVoid;
    if (!item || !p) return;
    this.treasuryApi.voidInvoicePayment(item.id, p.id, reason).subscribe({
      next: (res) => {
        this.voidDialogOpen = false;
        this.pendingVoid = null;
        this.toast.success(res.message || 'قسط باطل شد و مانده برگشت.');
        item.paid_amount = Number(res.paid_amount || 0);
        item.remaining = Number(res.remaining || 0);
        item.status = item.paid_amount > 0 ? 'partially_paid' : 'pending_payment';
        this.payAmount = item.remaining > 0 ? String(item.remaining) : null;
        this.loadPayments();
        this.loadTreasuryData(true);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.voidDialogServerError = this.isUnreachable(err)
          ? 'اتصال به سرور برقرار نیست؛ ابطال قسط فقط آنلاین ممکن است.'
          : (this.fieldMessage(err?.error?.reason) || this.errorText(err, 'ابطال قسط ناموفق بود.'));
        this.cdr.detectChanges();
      }
    });
  }

  onVoidCancelled(): void {
    this.voidDialogOpen = false;
    this.pendingVoid = null;
    this.voidDialogServerError = '';
  }

  printInvoice(item: PayableInvoiceItem): void {
    void this.printService.downloadPdf('expense_invoice', item.id);
  }

  sharingId: number | null = null;

  async shareInvoice(item: PayableInvoiceItem): Promise<void> {
    const id = item?.id;
    if (!id || this.sharingId) return;
    this.sharingId = id;
    this.cdr.detectChanges();
    try {
      const num = item.number || (item as any).invoice_number || id;
      await this.printService.sharePdf('expense_invoice', id, `payment-receipt-${num}.pdf`);
    } finally {
      this.sharingId = null;
      this.cdr.detectChanges();
    }
  }

  /** خروجی اکسل فاکتورهای هزینهٔ در دسترس خزانه‌دار (پیش‌تر فقط پیام موفقیت نشان می‌داد و فایلی نمی‌ساخت) */
  exportExcel(): void {
    this.personnelApi.exportExpenseInvoicesExcel().subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, 'treasury_expense_invoices.xlsx');
        this.toast.success('فایل اکسل رسیدهای پرداخت هزینه دانلود شد.');
      },
      error: (err: any) => {
        const msg = (typeof err?.status === 'number' && isServerUnreachable(err.status))
          ? 'اتصال به سرور برقرار نیست؛ خروجی اکسل فقط آنلاین ممکن است.'
          : 'خطا در ساخت فایل اکسل.';
        this.toast.error(msg);
      }
    });
  }

  refreshData(): void {
    this.loadTreasuryData();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.loadTreasuryData();
  }
}
