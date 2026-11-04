import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { AuthService } from '../../../../../../../core/auth/auth.service';
import { ActiveCompanyService } from '../../../../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../../../../core/services/server-reachability';
import { NetworkStatusService } from '../../../../../../../core/services/network-status.service';
import { ToastService } from '../../../../../../../shared/components/toast/toast.component';
import { ModalComponent } from '../../../../../../../shared/components/modal/modal.component';
import { ActionButtonComponent } from '../../../../../../../shared/components/action-button/action-button.component';
import { AmountInputComponent } from '../../../../../../../shared/components/amount-input/amount-input.component';
import { WorkflowReasonDialogComponent } from '../../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { PersonRolePickerComponent, PersonRoleValue } from '../../../../../../../shared/components/person-role-picker/person-role-picker.component';
import { SvgIconDirective } from '../../../../../../../shared/icons/svg-icon.directive';
import { LoadingSkeletonComponent } from '../../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TreasuryOrgApiService } from '../../../../../api/treasury-org-api.service';
import {
  PettyCashAccount,
  PettyCashBalanceSummary,
  PettyCashDebtSettlement,
  PettyCashReconciliation,
  PettyCashTransaction,
  isMaskedValue
} from '../../../../../models/personnel.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  ShebaValidationResult,
  extractShebaDigits,
  generateShebaFromAccount,
  validateAccountNumber,
  validateSheba
} from '../../../../../../../core/utils/sheba-utils';

type ModalKind = 'form' | 'settle' | 'reconcile' | 'close' | 'handover';

const PERM_MANAGER = 'perm_manager_payment_authorize';
const PERM_PETTY_MANAGE = 'perm_petty_cash_manage';
const OFFLINE_TITLE = 'این کار فقط با اتصال به سرور ممکن است';

/** پیام‌های کوتاه فارسی برای کدهای خطای سرور تنخواه */
const ERROR_MESSAGES: Record<string, string> = {
  opening_balance_locked: 'بعد از اولین گردش، فقط مدیر می‌تواند موجودی اولیه را تغییر دهد.',
  reason_required: 'برای تغییر موجودی اولیه نوشتن دلیل لازم است.',
  invalid_amount: 'مبلغ واردشده درست نیست.',
  reference_required: 'شماره پیگیری یا مرجع را بنویسید.',
  payroll_not_available: 'کسر از حقوق برای این حساب ممکن نیست.',
  amount_exceeds_debt: 'مبلغ از بدهی باقی‌مانده بیشتر است.',
  charge_not_open: 'این شارژ دیگر باز نیست.',
  offset_exceeds_charge: 'مبلغ از باقی‌ماندهٔ شارژ بیشتر است.',
  invalid_date: 'تاریخ درست نیست.',
  period_before_last: 'پایان دوره باید بعد از آخرین تطبیق باشد.',
  work_in_flight: 'کار نیمه‌تمام روی این حساب هست؛ اول آن را تمام کنید.',
  account_closed: 'این حساب بسته شده است.',
  debt_open: 'حساب بدهی باز دارد؛ اول بدهی را تسویه کنید.',
  settlement_pending: 'تسویهٔ در انتظار دارد؛ اول آن را نهایی یا باطل کنید.',
  invalid_custodian: 'تنخواه‌گردان جدید درست نیست.',
  custodian_has_account: 'این فرد از قبل حساب تنخواه دارد.',
  not_voidable: 'این تسویه قابل ابطال نیست.'
};

@Component({
  selector: 'app-petty-account-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgPersianDatepickerModule,
    ModalComponent,
    ActionButtonComponent,
    AmountInputComponent,
    WorkflowReasonDialogComponent,
    PersonRolePickerComponent,
    SvgIconDirective,
    LoadingSkeletonComponent
  ],
  templateUrl: './petty-account-manager.html'
})
export class PettyAccountManagerComponent implements OnInit, OnDestroy {
  private readonly api = inject(TreasuryOrgApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly activeCompany = inject(ActiveCompanyService, { optional: true });
  private readonly network = NetworkStatusService.getInstance();
  private netSub?: Subscription;

  readonly offlineTitle = OFFLINE_TITLE;
  isOnline = this.network.isOnline;

  accounts: PettyCashAccount[] = [];
  isLoading = false;
  loadError = '';

  // ─── گسترش ردیف: تسویه‌ها و تطبیق‌ها ───
  expandedId: number | null = null;
  isLoadingDetail = false;
  settlements: PettyCashDebtSettlement[] = [];
  reconciliations: PettyCashReconciliation[] = [];

  // ─── پنجره‌ها ───
  modal: ModalKind | null = null;
  current: PettyCashAccount | null = null;
  balance: PettyCashBalanceSummary | null = null;
  isBusy = false;
  modalError = '';

  // فرم حساب
  custodianPick: PersonRoleValue[] = [];
  form = { ceiling: null as string | number | null, opening: null as string | number | null, openingDate: '', reason: '', card: '', bank_name: '', sheba: '', description: '' };
  isFormDatePickerOpen = false;
  readonly openingDateControl = new FormControl<string>('');
  private original = { opening: 0, openingDate: '', card: '', sheba: '' };
  // شبا و حساب بر مبنای معماری استاندارد ناوگان و پرسنل (تبدیل دوطرفه، جستجوی بانک، کپی و اعتبارسنجی زنده)
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  isBankDropdownOpen = false;
  bankSearchQuery = '';
  isShebaCopied = false;
  isAccountCopied = false;
  private _isSyncingBank = false;
  shebaDigitsDisplay = '';
  shebaValidation: ShebaValidationResult | null = null;

  // تسویه
  settleForm = { amount: null as string | number | null, method: 'cash' as 'cash' | 'charge_offset' | 'payroll', reference: '', charge: null as number | null, note: '' };
  openCharges: PettyCashTransaction[] = [];
  isLoadingCharges = false;

  // تطبیق
  recForm = { date: '', counted: null as string | number | null, note: '' };
  isRecDatePickerOpen = false;
  readonly recDateControl = new FormControl<string>('');
  private readonly dateControlSubs = new Subscription();

  // بستن و تحویل
  closeForm = { reference: '', note: '' };
  handoverPick: PersonRoleValue[] = [];
  handoverForm = { reference: '', note: '' };

  // ابطال تسویه
  voidOpen = false;
  voidError = '';
  private voidTarget: PettyCashDebtSettlement | null = null;

  // ─── دسترسی‌ها ───
  private hasPerm(code: string): boolean {
    const user = this.auth.user();
    const perms = this.auth.userPermissions() || [];
    return !!user?.is_superuser || perms.includes('admin_all') || perms.includes(code);
  }
  get isManager(): boolean { return this.hasPerm(PERM_MANAGER); }
  get canManageAccounts(): boolean { return this.hasPerm(PERM_PETTY_MANAGE) || this.isManager; }
  private get companyId(): number | null { return this.activeCompany?.activeCompanyId ?? null; }

  ngOnInit(): void {
    this.netSub = this.network.state$.subscribe(() => {
      this.isOnline = this.network.isOnline;
      this.cdr.markForCheck();
    });
    this.dateControlSubs.add(
      this.openingDateControl.valueChanges.subscribe(val => {
        this.form.openingDate = val || '';
      })
    );
    this.dateControlSubs.add(
      this.recDateControl.valueChanges.subscribe(val => {
        this.recForm.date = val || '';
      })
    );
    this.load();
  }

  ngOnDestroy(): void {
    this.netSub?.unsubscribe();
    this.dateControlSubs.unsubscribe();
  }

  // ─── کمکی‌ها ───
  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  private num(v: string | number | null | undefined): number {
    return v === null || v === undefined || v === '' ? 0 : Number(v);
  }

  errorMessage(err: any, fallback: string): string {
    const body = err?.error;
    const code = body?.code;
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (isServerUnreachable(err?.status)) {
      return 'اتصال به سرور برقرار نیست؛ کمی بعد دوباره تلاش کنید.';
    }
    if (err?.status === 403 && !code) return 'اجازهٔ این کار را ندارید.';
    if (typeof body?.error === 'string' && body.error) return body.error;
    if (typeof body?.detail === 'string' && body.detail) return body.detail;
    // استخراج اولین خطای فیلدی از پاسخ اعتبارسنجی جنگو
    if (body && typeof body === 'object') {
      for (const k of Object.keys(body)) {
        if (k === 'code') continue;
        const v = body[k];
        if (typeof v === 'string' && v.trim()) return v;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
        if (v && typeof v === 'object' && typeof v.message === 'string') return v.message;
      }
    }
    return fallback;
  }

  resultLabel(r?: string): string {
    return r === 'shortage' ? 'کسری' : r === 'surplus' ? 'اضافه' : r === 'balanced' ? 'بدون مغایرت' : '—';
  }

  resultClass(r?: string): string {
    return r === 'shortage' ? 'text-rose-700 bg-rose-50 border-rose-200'
      : r === 'surplus' ? 'text-amber-800 bg-amber-50 border-amber-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';
  }

  // ─── بارگذاری ───
  load(): void {
    this.isLoading = true;
    this.loadError = '';
    this.api.getPettyCashAccounts({}).subscribe({
      next: list => {
        const cid = this.companyId;
        this.accounts = (list || []).filter(a => !cid || !a.company || a.company === cid);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.isLoading = false;
        this.loadError = this.errorMessage(err, 'خطا در دریافت حساب‌های تنخواه.');
        this.cdr.markForCheck();
      }
    });
  }

  toggleDetail(acc: PettyCashAccount): void {
    if (!acc.id) return;
    if (this.expandedId === acc.id) { this.expandedId = null; return; }
    this.expandedId = acc.id;
    this.loadDetail(acc);
  }

  private loadDetail(acc: PettyCashAccount): void {
    if (!acc.id) return;
    this.isLoadingDetail = true;
    this.settlements = [];
    this.reconciliations = [];
    let pending = 2;
    const done = () => { if (--pending === 0) { this.isLoadingDetail = false; this.cdr.markForCheck(); } };
    this.api.getPettyCashSettlements({ account_id: acc.id }).subscribe({
      next: l => { this.settlements = l || []; done(); },
      error: err => { this.toast.error(this.errorMessage(err, 'خطا در دریافت تسویه‌ها.')); done(); }
    });
    this.api.getPettyCashReconciliations({ account_id: acc.id }).subscribe({
      next: l => { this.reconciliations = l || []; done(); },
      error: err => { this.toast.error(this.errorMessage(err, 'خطا در دریافت تطبیق‌ها.')); done(); }
    });
  }

  private loadBalance(acc: PettyCashAccount): void {
    this.balance = null;
    this.api.getPettyCashBalance(null, acc.custodian, this.companyId).subscribe({
      next: b => { this.balance = b; this.cdr.markForCheck(); },
      error: err => { this.modalError = this.errorMessage(err, 'خطا در دریافت موجودی.'); this.cdr.markForCheck(); }
    });
  }

  // ─── باز و بستن پنجره‌ها ───
  private open(kind: ModalKind, acc: PettyCashAccount | null): void {
    this.modal = kind;
    this.current = acc;
    this.modalError = '';
    this.isBusy = false;
  }

  closeModal(): void {
    this.modal = null;
    this.current = null;
    this.balance = null;
    this.modalError = '';
    this.isFormDatePickerOpen = false;
    this.isRecDatePickerOpen = false;
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.openingDateControl.setValue('', { emitEvent: false });
    this.recDateControl.setValue('', { emitEvent: false });
  }

  openCreate(): void {
    this.custodianPick = [];
    this.form = { ceiling: null, opening: null, openingDate: '', reason: '', card: '', bank_name: '', sheba: '', description: '' };
    this.openingDateControl.setValue('', { emitEvent: false });
    this.original = { opening: 0, openingDate: '', card: '', sheba: '' };
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.loadSheba('');
    this.open('form', null);
  }

  openEdit(acc: PettyCashAccount): void {
    const openingDate = acc.opening_balance_date || '';
    this.form = {
      ceiling: acc.ceiling_amount ?? null,
      opening: acc.opening_balance ?? 0,
      openingDate,
      reason: '',
      card: acc.card_or_account_number || '',
      bank_name: '',
      sheba: acc.sheba_number || '',
      description: acc.description || ''
    };
    this.openingDateControl.setValue(openingDate, { emitEvent: false });
    this.original = {
      opening: Number(acc.opening_balance || 0),
      openingDate,
      card: acc.card_or_account_number || '',
      sheba: acc.sheba_number || ''
    };
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
    this.loadSheba(acc.sheba_number || '');
    if (this.shebaValidation?.bank?.name) {
      this.form.bank_name = this.shebaValidation.bank.name;
    }
    // مقدار نرمال‌شده مبنای مقایسه است تا بازکردن و بستن بدون تغییر، شبا را دوباره نفرستد
    this.original.sheba = this.form.sheba;
    this.open('form', acc);
  }

  openSettle(acc: PettyCashAccount): void {
    this.settleForm = { amount: null, method: 'cash', reference: '', charge: null, note: '' };
    this.openCharges = [];
    this.open('settle', acc);
    this.loadBalance(acc);
    this.isLoadingCharges = true;
    this.api.getPettyCashTransactions({ custodian_id: acc.custodian, transaction_type: 'allocation' }).subscribe({
      next: list => {
        this.openCharges = (list || []).filter(t => t.status === 'draft' && this.chargeRemaining(t) > 0);
        this.isLoadingCharges = false;
        this.cdr.markForCheck();
      },
      error: () => { this.isLoadingCharges = false; this.cdr.markForCheck(); }
    });
  }

  chargeRemaining(t: PettyCashTransaction): number {
    return Number(t.amount || 0) - Number(t.offset_total || 0);
  }

  openReconcile(acc: PettyCashAccount): void {
    this.recForm = { date: '', counted: null, note: '' };
    this.recDateControl.setValue('', { emitEvent: false });
    this.open('reconcile', acc);
    this.loadBalance(acc);
  }

  openClose(acc: PettyCashAccount): void {
    this.closeForm = { reference: '', note: '' };
    this.open('close', acc);
    this.loadBalance(acc);
  }

  openHandover(acc: PettyCashAccount): void {
    this.handoverPick = [];
    this.handoverForm = { reference: '', note: '' };
    this.open('handover', acc);
  }

  // ─── بانک، حساب و شبا (تبدیل دوطرفه، جستجو و کپی) ───
  get filteredBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery || !this.bankSearchQuery.trim()) {
      return this.iranianBanks;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanks.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.shortName.toLowerCase().includes(q) ||
      b.code.includes(q)
    );
  }

  openBankDropdown(): void {
    if (!this.canManageAccounts) return;
    this.bankSearchQuery = '';
    this.isBankDropdownOpen = true;
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.onBankSelect(bank.name);
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
  }

  onBankSelect(bankName: string): void {
    this.form.bank_name = bankName;
    const cleanAcc = (this.form.card || '').trim();
    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && bankName) {
      const generated = generateShebaFromAccount(bankName, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidation = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.form.sheba = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.markForCheck();
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.form.card = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }

    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.form.bank_name) {
      const generated = generateShebaFromAccount(this.form.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidation = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.form.sheba = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.markForCheck();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onAccountNumberInput(pasted);
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.form.card || this.shebaValidation?.accountNumber;
    if (acc) {
      navigator.clipboard.writeText(acc).then(() => {
        this.isAccountCopied = true;
        this.toast.success(`شماره حساب (${acc}) کپی شد.`);
        setTimeout(() => { this.isAccountCopied = false; this.cdr.markForCheck(); }, 2500);
        this.cdr.markForCheck();
      }).catch(() => {
        this.toast.error('عدم دسترسی به حافظهٔ موقت.');
      });
    }
  }

  get isShebaMasked(): boolean {
    return isMaskedValue(this.form.sheba);
  }

  private loadSheba(value: string): void {
    this.shebaValidation = null;
    this.shebaDigitsDisplay = '';
    this.form.sheba = '';
    if (isMaskedValue(value)) {
      // مقدار پوشیده فقط نمایش داده می‌شود و دست‌نخورده می‌ماند
      this.form.sheba = value;
      this.shebaDigitsDisplay = value.replace(/^IR/i, '');
    } else if (value) {
      this.onShebaInput(value);
    }
  }

  onShebaInput(event: any): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const raw = typeof event === 'string' ? event : (event?.target?.value || '');
      const digits = extractShebaDigits(raw);
      if (!digits) {
        this.shebaValidation = null;
        this.shebaDigitsDisplay = '';
        this.form.sheba = '';
      } else {
        const res = validateSheba(digits);
        this.shebaValidation = res;
        this.shebaDigitsDisplay = res.formattedDigits || digits;
        this.form.sheba = res.rawSheba || `IR${digits}`;
        if (res.bank?.name) {
          this.form.bank_name = res.bank.name;
        }
        if (res.accountNumber && !this.form.card) {
          this.form.card = res.accountNumber;
        }
      }
      if (event?.target) event.target.value = this.shebaDigitsDisplay;
    } finally {
      this._isSyncingBank = false;
    }
    this.cdr.markForCheck();
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  copyShebaToClipboard(): void {
    const rawSheba = this.form.sheba;
    const sheba = rawSheba ? rawSheba.toString().trim().toUpperCase().replace(/^IR/i, '') : '';
    if (sheba) {
      navigator.clipboard.writeText(sheba).then(() => {
        this.isShebaCopied = true;
        this.toast.success('شماره شبا (بدون IR) کپی شد: ' + sheba);
        setTimeout(() => { this.isShebaCopied = false; this.cdr.markForCheck(); }, 2500);
        this.cdr.markForCheck();
      }).catch(() => {
        this.toast.error('عدم دسترسی به حافظهٔ موقت.');
      });
    }
  }

  convertAccountToShebaNow(): void {
    if (!this.form.bank_name) {
      this.toast.warning('لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const cleanAcc = (this.form.card || '').trim();
    const accValidation = validateAccountNumber(cleanAcc);
    if (!accValidation.isValid) {
      this.toast.warning(accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(this.form.bank_name, cleanAcc);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.success(`شماره شبا با موفقیت بر اساس بانک ${this.form.bank_name} تولید شد.`);
    } else {
      this.toast.error('امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  // ─── ذخیرهٔ حساب ───
  get openingChanged(): boolean {
    return !!this.current && (this.num(this.form.opening) !== this.original.opening || this.form.openingDate !== this.original.openingDate);
  }

  onFormDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || '');
    this.form.openingDate = val;
    this.openingDateControl.setValue(val, { emitEvent: false });
    this.isFormDatePickerOpen = false;
  }

  onRecDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || '');
    this.recForm.date = val;
    this.recDateControl.setValue(val, { emitEvent: false });
    this.isRecDatePickerOpen = false;
  }

  saveAccount(): void {
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    const opening = this.num(this.form.opening);
    if (opening > 0 && !this.form.openingDate) { this.modalError = 'برای موجودی اولیه، تاریخ آن لازم است.'; return; }
    if (!this.current && !this.custodianPick[0]) { this.modalError = 'تنخواه‌گردان را انتخاب کنید.'; return; }
    if (this.form.sheba !== this.original.sheba && this.shebaValidation && !this.shebaValidation.isValid) {
      this.modalError = this.shebaValidation.errorMessage || 'شماره شبا نامعتبر است.';
      return;
    }
    const body: Partial<PettyCashAccount> = {
      opening_balance: opening,
      opening_balance_date: this.form.openingDate || null,
      description: this.form.description
    };
    if (this.isManager) body.ceiling_amount = this.num(this.form.ceiling);
    // مقدار پوشیده بدون تغییر پس فرستاده نمی‌شود
    if (this.form.card !== this.original.card) body.card_or_account_number = this.form.card.trim();
    if (this.form.sheba !== this.original.sheba) body.sheba_number = this.form.sheba.trim();
    if (this.current && this.openingChanged && this.form.reason.trim()) body.reason = this.form.reason.trim();
    this.isBusy = true;
    this.modalError = '';
    let req;
    if (this.current?.id) {
      req = this.api.updatePettyCashAccount(this.current.id, body);
    } else {
      body.custodian = Number(this.custodianPick[0].id);
      if (this.companyId) {
        body.company = this.companyId;
        (body as any).company_id = this.companyId;
      }
      if (!this.isManager) body.ceiling_amount = 0;
      req = this.api.createPettyCashAccount(body);
    }
    req.subscribe({
      next: () => {
        this.toast.success('حساب تنخواه ذخیره شد.');
        this.closeModal();
        this.load();
      },
      error: err => {
        this.isBusy = false;
        this.modalError = this.errorMessage(err, 'ذخیرهٔ حساب ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }

  // ─── تسویهٔ بدهی ───
  get settleMax(): number { return Number(this.balance?.debt ?? 0); }

  saveSettlement(): void {
    if (!this.current?.id) return;
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    const amount = this.num(this.settleForm.amount);
    if (amount <= 0) { this.modalError = ERROR_MESSAGES['invalid_amount']; return; }
    const f = this.settleForm;
    if (f.method === 'cash' && !f.reference.trim()) { this.modalError = ERROR_MESSAGES['reference_required']; return; }
    if (f.method === 'charge_offset' && !f.charge) { this.modalError = 'یک شارژ باز انتخاب کنید.'; return; }
    this.isBusy = true;
    this.modalError = '';
    this.api.createPettyCashSettlement({
      account: this.current.id,
      amount,
      method: f.method,
      reference: f.method === 'cash' ? f.reference.trim() : undefined,
      charge: f.method === 'charge_offset' ? f.charge : undefined,
      note: f.note.trim() || undefined
    }).subscribe({
      next: () => {
        this.toast.success('تسویهٔ بدهی ثبت شد.');
        const acc = this.current!;
        this.closeModal();
        this.load();
        if (this.expandedId === acc.id) this.loadDetail(acc);
      },
      error: err => {
        this.isBusy = false;
        this.modalError = this.errorMessage(err, 'ثبت تسویه ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }

  canVoid(s: PettyCashDebtSettlement): boolean {
    return s.status === 'pending' || (s.status === 'done' && s.method === 'cash');
  }

  openVoid(s: PettyCashDebtSettlement): void {
    this.voidTarget = s;
    this.voidError = '';
    this.voidOpen = true;
  }

  onVoidCancelled(): void {
    this.voidOpen = false;
    this.voidTarget = null;
    this.voidError = '';
  }

  onVoidConfirmed(reason: string): void {
    const s = this.voidTarget;
    if (!s) return;
    if (!this.isOnline) { this.voidError = OFFLINE_TITLE; return; }
    this.api.voidPettyCashSettlement(s.id, reason).subscribe({
      next: () => {
        this.toast.success('تسویه باطل شد.');
        this.onVoidCancelled();
        this.load();
        const acc = this.accounts.find(a => a.id === s.account);
        if (acc) this.loadDetail(acc);
      },
      error: err => {
        this.voidError = this.errorMessage(err, 'ابطال تسویه ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }

  // ─── تطبیق ───
  saveReconciliation(): void {
    if (!this.current?.id) return;
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    if (!this.recForm.date) { this.modalError = ERROR_MESSAGES['invalid_date']; return; }
    if (this.recForm.counted === null || this.recForm.counted === '') { this.modalError = 'مبلغ نقد شمارش‌شده را بنویسید.'; return; }
    this.isBusy = true;
    this.modalError = '';
    this.api.createPettyCashReconciliation({
      account: this.current.id,
      period_end_date: this.recForm.date,
      counted_cash: this.num(this.recForm.counted),
      note: this.recForm.note.trim() || undefined
    }).subscribe({
      next: rec => {
        this.toast.success(rec.result === 'shortage'
          ? 'تطبیق ثبت شد؛ کسری به بدهی تنخواه‌گردان اضافه شد.'
          : 'تطبیق ثبت شد.');
        const acc = this.current!;
        this.closeModal();
        this.load();
        if (this.expandedId === acc.id) this.loadDetail(acc);
      },
      error: err => {
        this.isBusy = false;
        this.modalError = this.errorMessage(err, 'ثبت تطبیق ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }

  // ─── بستن و تحویل ───
  get fundLevel(): number { return Number(this.balance?.current_balance ?? 0); }

  saveClose(): void {
    if (!this.current?.id) return;
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    if (this.fundLevel > 0 && !this.closeForm.reference.trim()) { this.modalError = ERROR_MESSAGES['reference_required']; return; }
    this.isBusy = true;
    this.modalError = '';
    this.api.closePettyCashAccount(this.current.id, {
      reference: this.closeForm.reference.trim() || undefined,
      note: this.closeForm.note.trim() || undefined
    }).subscribe({
      next: () => {
        this.toast.success('حساب تنخواه بسته شد.');
        this.closeModal();
        this.load();
      },
      error: err => {
        this.isBusy = false;
        this.modalError = this.errorMessage(err, 'بستن حساب ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }

  saveHandover(): void {
    if (!this.current?.id) return;
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    if (!this.handoverPick[0]) { this.modalError = 'تنخواه‌گردان جدید را انتخاب کنید.'; return; }
    this.isBusy = true;
    this.modalError = '';
    this.api.handoverPettyCashAccount(this.current.id, {
      new_custodian: Number(this.handoverPick[0].id),
      reference: this.handoverForm.reference.trim() || undefined,
      note: this.handoverForm.note.trim() || undefined
    }).subscribe({
      next: () => {
        this.toast.success('حساب به تنخواه‌گردان جدید تحویل شد.');
        this.closeModal();
        this.load();
      },
      error: err => {
        this.isBusy = false;
        this.modalError = this.errorMessage(err, 'تحویل حساب ناموفق بود.');
        this.cdr.markForCheck();
      }
    });
  }
}
