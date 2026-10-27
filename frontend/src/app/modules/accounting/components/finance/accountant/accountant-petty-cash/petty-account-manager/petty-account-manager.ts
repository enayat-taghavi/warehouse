import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { TreasuryOrgApiService } from '../../../../../api/treasury-org-api.service';
import {
  PettyCashAccount,
  PettyCashBalanceSummary,
  PettyCashDebtSettlement,
  PettyCashReconciliation,
  PettyCashTransaction
} from '../../../../../models/personnel.model';

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
    NgPersianDatepickerModule,
    ModalComponent,
    ActionButtonComponent,
    AmountInputComponent,
    WorkflowReasonDialogComponent,
    PersonRolePickerComponent,
    SvgIconDirective
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
  form = { ceiling: null as string | number | null, opening: null as string | number | null, openingDate: '', reason: '', card: '', sheba: '', description: '' };
  isFormDatePickerOpen = false;
  private original = { opening: 0, openingDate: '', card: '', sheba: '' };

  // تسویه
  settleForm = { amount: null as string | number | null, method: 'cash' as 'cash' | 'charge_offset' | 'payroll', reference: '', charge: null as number | null, note: '' };
  openCharges: PettyCashTransaction[] = [];
  isLoadingCharges = false;

  // تطبیق
  recForm = { date: '', counted: null as string | number | null, note: '' };
  isRecDatePickerOpen = false;

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
    this.load();
  }

  ngOnDestroy(): void {
    this.netSub?.unsubscribe();
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
    return (typeof body?.error === 'string' && body.error) || (typeof body?.detail === 'string' && body.detail) || fallback;
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
  }

  openCreate(): void {
    this.custodianPick = [];
    this.form = { ceiling: null, opening: null, openingDate: '', reason: '', card: '', sheba: '', description: '' };
    this.original = { opening: 0, openingDate: '', card: '', sheba: '' };
    this.open('form', null);
  }

  openEdit(acc: PettyCashAccount): void {
    this.form = {
      ceiling: acc.ceiling_amount ?? null,
      opening: acc.opening_balance ?? 0,
      openingDate: acc.opening_balance_date || '',
      reason: '',
      card: acc.card_or_account_number || '',
      sheba: acc.sheba_number || '',
      description: acc.description || ''
    };
    this.original = {
      opening: Number(acc.opening_balance || 0),
      openingDate: acc.opening_balance_date || '',
      card: acc.card_or_account_number || '',
      sheba: acc.sheba_number || ''
    };
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

  // ─── ذخیرهٔ حساب ───
  get openingChanged(): boolean {
    return !!this.current && (this.num(this.form.opening) !== this.original.opening || this.form.openingDate !== this.original.openingDate);
  }

  onFormDateSelect(event: any): void {
    this.form.openingDate = typeof event === 'string' ? event : (event?.shamsi || '');
    this.isFormDatePickerOpen = false;
  }

  onRecDateSelect(event: any): void {
    this.recForm.date = typeof event === 'string' ? event : (event?.shamsi || '');
    this.isRecDatePickerOpen = false;
  }

  saveAccount(): void {
    if (!this.isOnline) { this.modalError = OFFLINE_TITLE; return; }
    const opening = this.num(this.form.opening);
    if (opening > 0 && !this.form.openingDate) { this.modalError = 'برای موجودی اولیه، تاریخ آن لازم است.'; return; }
    if (!this.current && !this.custodianPick[0]) { this.modalError = 'تنخواه‌گردان را انتخاب کنید.'; return; }
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
      if (this.companyId) body.company = this.companyId;
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
