import { Component, ChangeDetectorRef, DestroyRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { PermissionService } from '../../../../../core/services/permission.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyBankAccount, isSafeBankUrl } from '../../../../../core/models/company.model';
import { InvoicePayment, InvoicePaymentMethod, PartyBankAccount } from '../../../models/personnel.model';
import { AmountInputComponent } from '../../../../../shared/components/amount-input/amount-input.component';
import { WorkflowReasonDialogComponent } from '../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { AttachmentsComponent } from '../../../../../shared/components/attachments/attachments.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { PersianWordsPipe } from '../../../../../shared/pipes/persian-words.pipe';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import { gregorianToJalali } from '../../../../../core/utils/date-utils';
import { fiscalPeriodClosedMessage } from '../../../fiscal-period-error';
import { PAYMENT_RECEIPT_ACCEPT, PAYMENT_RECEIPT_LABEL, receiptFileError } from '../../../payment-receipt';
import { shebaCopyText } from '../../../../../core/utils/sheba-utils';
import { formatFileSizeFa } from '../../../../../core/utils/file-size';

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
  /* the shared payment-receipt list reads these */
  counterparty_name?: string;
  invoice_date_shamsi?: string;
  status_display?: string;
  possible_duplicate?: boolean;
  duplicate_reason?: string;
  vat_manual?: boolean;
}

/** وضعیت‌هایی که سرور برای ثبت قسط می‌پذیرد (PAYABLE_STATUSES در invoice_payments.py) */
export const PAYABLE_INVOICE_STATUSES = ['ready_to_pay', 'partially_paid'];

/** ردیف فاکتور (کارتابل خزانه، فهرست یکپارچه یا جزئیات فاکتور) به ردیف قابل پرداخت */
export function toPayableItem(inv: any): PayableInvoiceItem {
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
    counterparty_name: inv.counterparty_name || 'طرف‌حساب',
    invoice_date_shamsi: inv.invoice_date_shamsi,
    status_display: inv.status_display,
    possible_duplicate: !!inv.possible_duplicate,
    duplicate_reason: inv.duplicate_reason,
    vat_manual: !!inv.vat_manual,
    created_by_name: inv.created_by_name,
    created_at: inv.created_at,
    updated_by_name: inv.updated_by_name,
    updated_at: inv.updated_at,
    remaining: inv.remaining !== undefined && inv.remaining !== null ? Number(inv.remaining) : Number(inv.amount || 0) - Number(inv.paid_amount || 0)
  };
}

/**
 * بخش مشترک پرداخت رسید: خلاصهٔ مبلغ، قسط‌ها، سندهای واریز، فرم قسط تازه و ابطال قسط.
 * پنجرهٔ پرداخت خزانه‌دار و صفحهٔ «/invoices/:id/pay» هر دو همین را نشان می‌دهند.
 */
@Component({
  selector: 'app-invoice-payment-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgPersianDatepickerModule,
    AmountInputComponent,
    WorkflowReasonDialogComponent,
    ActionButtonComponent,
    AttachmentsComponent,
    SvgIconDirective,
    PersianWordsPipe,
  ],
  templateUrl: './invoice-payment-panel.component.html',
})
export class InvoicePaymentPanelComponent implements OnDestroy {
  protected perm = inject(PermissionService);
  private toast = inject(ToastService);
  private personnelApi = inject(PersonnelApiService);
  private treasuryApi = inject(TreasuryOrgApiService);
  private companyApi = inject(CompanyApiService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** رسید در حال پرداخت؛ هر رسید تازه فرم و قسط‌ها را از نو می‌خواند */
  @Input({ required: true })
  set item(value: PayableInvoiceItem) {
    const changedId = this.payItem?.id !== value?.id;
    this.payItem = value;
    if (value && changedId) this.init(value);
  }
  get item(): PayableInvoiceItem { return this.payItem!; }

  /** false: وضعیت رسید پرداخت‌پذیر نیست؛ فرم قسط تازه نشان داده نمی‌شود */
  @Input() payable = true;
  /** پیوند «باز کردن در صفحهٔ جدا» (در پنجره) */
  @Input() showPageLink = false;

  /** دکمهٔ انصراف فرم یا پیوند صفحهٔ جدا */
  @Output() cancelled = new EventEmitter<void>();
  /** پس از هر ثبت یا ابطال موفق قسط */
  @Output() changed = new EventEmitter<PayableInvoiceItem>();
  /** مانده به صفر رسید */
  @Output() settled = new EventEmitter<PayableInvoiceItem>();

  @ViewChild('payReceipts') payReceipts?: AttachmentsComponent;

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
  isDraggingOver = false;
  private dragCounter = 0;
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

  /** کلیدِ آخرین مقدار کپی‌شده برای نشانهٔ «کپی شد» کنار همان دکمه */
  copiedKey: string | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  /** پنجره بسته می‌شود و همین رسید در صفحهٔ جدا باز می‌شود */
  openPage(): void {
    if (!this.payItem) return;
    const id = this.payItem.id;
    this.cancelled.emit();
    void this.router.navigate(['/app/finance/invoices', id, 'pay']);
  }

  private init(item: PayableInvoiceItem): void {
    this.payments = [];
    this.partyAccounts = [];
    this.resetPayForm(item.remaining);
    this.loadPayments();
    this.loadCompanyAccounts();
    this.loadPartyAccounts(item);
  }

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

  /** کپی شماره حساب یا شبا برای چسباندن در سایت بانک؛ مرورگر بی Clipboard API (آیفون قدیمی) از execCommand */
  async copyValue(value: string | null | undefined, key: string, labelFa: string): Promise<void> {
    const text = key === 'sheba' ? shebaCopyText(value) : (value || '').replace(/\s+/g, '');
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
    this.treasuryApi.getInvoicePayments(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.handleReceiptFile(file);
  }

  /** فایل سند واریز از انتخاب یا رها کردن؛ نام فایل پیوست‌شده و خطای زیر کادر بازخورد آن است (بی toast) */
  private handleReceiptFile(file: File | null): void {
    if (!file) {
      this.clearPayReceipt();
      return;
    }
    const error = receiptFileError(file);
    this.payReceipt = !error ? file : null;
    const { receipt: _old, ...rest } = this.payFieldErrors;
    this.payFieldErrors = error ? { ...rest, receipt: error } : rest;
    this.cdr.markForCheck();
  }

  clearPayReceipt(): void {
    this.payReceipt = null;
    if (this.payReceiptInput) this.payReceiptInput.value = '';
    const { receipt: _old, ...rest } = this.payFieldErrors;
    this.payFieldErrors = rest;
    this.cdr.markForCheck();
  }

  readonly fileSizeFa = formatFileSizeFa;

  /** شمارندهٔ dragenter/dragleave تا رفتن نشانگر روی بچه‌های فرم لایه را خاموش نکند */
  onDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragCounter++;
    this.isDraggingOver = true;
    this.cdr.markForCheck();
  }

  onDragOver(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave(event: DragEvent): void {
    if (!this.hasFiles(event)) return;
    this.dragCounter = Math.max(0, this.dragCounter - 1);
    if (this.dragCounter === 0) {
      this.isDraggingOver = false;
      this.cdr.markForCheck();
    }
  }

  /** فایل رهاشده در کادر فایل هم گذاشته می‌شود تا کادر و پیوست یکی باشند */
  onDrop(event: DragEvent, input?: HTMLInputElement): void {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragCounter = 0;
    this.isDraggingOver = false;
    const files = event.dataTransfer?.files;
    if (input && files?.length) {
      this.payReceiptInput = input;
      try { input.files = files; } catch { /* مرورگر قدیمی: فقط پیوست عوض می‌شود */ }
    }
    this.handleReceiptFile(files?.[0] ?? null);
  }

  private hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  submitPayment(): void {
    const item = this.payItem;
    if (!item || this.isPaying || !this.payable) return;
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
        const settled = item.remaining <= 0;
        if (settled) {
          item.status = 'paid';
        } else {
          item.status = 'partially_paid';
          this.resetPayForm(item.remaining);
        }
        // میزبان با پاسخ همین ثبت خبردار می‌شود؛ بازخوانی فهرست قسط‌ها بعد از آن است
        this.changed.emit(item);
        if (settled) this.settled.emit(item);
        this.loadPayments();
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
        this.changed.emit(item);
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
}
