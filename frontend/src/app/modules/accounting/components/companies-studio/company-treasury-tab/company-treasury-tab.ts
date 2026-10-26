import { ChangeDetectorRef, Component, HostListener, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompaniesStudioFacade } from '../companies-studio.facade';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyBankAccount, CompanyBankOpeningBalancePayload, CompanyBankOpeningHistoryEntry } from '../../../../../core/models/company.model';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  cleanShebaInput,
  extractShebaDigits,
  generateShebaFromAccount,
  getBankByName,
  validateAccountNumber
} from '../../../../../core/utils/sheba-utils';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { LoadingSkeletonComponent } from '../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { AmountInputComponent } from '../../../../../shared/components/amount-input/amount-input.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';

/** شناسهٔ تب در استودیوی شرکت (`?tab=treasury`) */
export const TREASURY_TAB_ID = 'treasury';

/**
 * تب «بانک و شبا» استودیوی شرکت (مشارکت ماژول حسابداری از راه `companies.studioTabs`).
 * فقط با CompanyStudioContextService با هستهٔ استودیو حرف می‌زند.
 */
@Component({
  selector: 'app-company-treasury-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective, ActionButtonComponent, OfflinePendingBadgeComponent, LoadingSkeletonComponent, ModalComponent, AmountInputComponent],
  providers: [CompaniesStudioFacade],
  templateUrl: './company-treasury-tab.html'
})
export class CompanyTreasuryTabComponent implements OnInit, OnChanges, OnDestroy {
  /** شناسهٔ شرکت ذخیره‌شده؛ برای شرکت تازه null */
  @Input() companyId: number | null = null;

  private facade = inject(CompaniesStudioFacade);
  private companyApi = inject(CompanyApiService);
  private studioContext = inject(CompanyStudioContextService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private ws = inject(WebSocketService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private offlineSync = OfflineSyncService.getInstance();
  private destroy$ = new Subject<void>();
  private unregisterDirty: () => void;

  // مدیریت چند حسابی و شماره‌های شبای شرکت
  companyBankAccounts: CompanyBankAccount[] = [];
  isLoadingBankAccounts = false;
  /** دریافت حساب‌ها شکست خورد (حالت خطا با «تلاش دوباره») */
  loadError = false;
  isSavingBankAccount = false;
  isEditingAccount = false;
  editingAccountId: number | null = null;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';
  isShebaCopied = false;
  isAccountCopied = false;
  copiedShebaId: number | string | null = null;
  copiedSheba: string | null = null;
  iranianBanksList: IranianBankInfo[] = IRANIAN_BANKS;
  bankSearchQuery = '';
  isBankDropdownOpen = false;

  newAccount = this.getEmptyBankAccountData();
  /** خطای کنار فیلدهای موجودی اولیه در فرم ساخت (۳.۳) */
  createFieldErrors: Partial<Record<'opening_balance' | 'opening_balance_date', string>> = {};
  isCreateDatePickerOpen = false;
  createDateControl = new FormControl('');

  // مودال «تغییر موجودی اولیه» و سابقهٔ آن (۳.۳-ج)
  openingAccount: CompanyBankAccount | null = null;
  openingForm = { opening_balance: null as string | null, opening_balance_date: '', reason: '' };
  openingErrors: Partial<Record<'opening_balance' | 'opening_balance_date' | 'reason', string>> = {};
  isOpeningDatePickerOpen = false;
  openingDateControl = new FormControl('');
  isSavingOpening = false;
  openingHistory: CompanyBankOpeningHistoryEntry[] = [];
  isLoadingHistory = false;
  historyError = false;

  readonly bankAccountIcon = ACCOUNTING_ENTITY_ICONS.bankAccounts;

  /** حالت محدود استودیو: ویرایش و حذف حساب با «بانک»، ثبت و شبا و حساب اصلی با کار حساس «شبا» (سرور هم می‌سنجد) */
  get canWriteBank(): boolean {
    return this.studioContext.canWrite('bank');
  }

  get canWriteSheba(): boolean {
    return this.studioContext.canWrite('bank_sheba');
  }

  /** دید رقم موجودی اولیه و سابقهٔ آن با سطح خواندن «بانک» (سرور برای دیگران پوشیده می‌دهد) */
  get canReadBank(): boolean {
    return this.studioContext.canRead('bank');
  }

  /** پس از اولین گردش، تغییر موجودی اولیه کار حساس جداست */
  canChangeOpening(acc: CompanyBankAccount): boolean {
    if (!this.canWriteBank || !acc.id || this.isPendingRecord(acc)) return false;
    return !acc.has_movements || this.studioContext.canWrite('bank_opening_balance');
  }

  /** مبلغ ریالی با جداکنندهٔ هزارگان و رقم فارسی */
  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return isNaN(n) ? String(value) : CompanyTreasuryTabComponent.FA_NUMBER.format(n);
  }

  faDigits(value: string | null | undefined): string {
    return (value || '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  }

  /** متن موجودی اولیهٔ کارت: رقم، «ثبت نشده» برای حساب قدیمی یا «—» برای پوشیده */
  openingText(acc: CompanyBankAccount): string {
    if (!this.canReadBank || acc.opening_balance === null || acc.opening_balance === undefined) return '—';
    if (!acc.opening_balance_date) return 'ثبت نشده';
    return `${this.faAmount(acc.opening_balance)} ریال — تاریخ ${this.faDigits(acc.opening_balance_date)}`;
  }
  private static readonly FA_NUMBER = new Intl.NumberFormat('fa-IR');

  /** شمارنده با رقم فارسی (ت۷) */
  fa(n: number): string {
    return CompanyTreasuryTabComponent.FA_NUMBER.format(n);
  }

  /** حسابی که در حالت آفلاین ساخته شده و هنوز شناسهٔ سرور ندارد (E2) */
  isPendingRecord(rec: any): boolean {
    return !!rec?._offlinePending || (typeof rec?.id === 'number' && rec.id < 0);
  }

  /** حساب دیگری با همین شبا (A15)؛ قید یکتایی بک‌اند بیرون از این طرح است */
  private findDuplicateSheba(sheba: string): CompanyBankAccount | undefined {
    const norm = (v: string | null | undefined) => (v || '').replace(/\s+/g, '').toUpperCase();
    const target = norm(sheba);
    return this.companyBankAccounts.find(a => a.id !== this.editingAccountId && norm(a.sheba_number) === target);
  }

  constructor() {
    // فرم حساب نیمه‌کاره در هشدار خروج استودیو حساب می‌شود (ت۳)
    this.unregisterDirty = this.studioContext.registerDirty(TREASURY_TAB_ID, () => this.hasPendingForm());
  }

  ngOnInit(): void {
    this.setupRealtimeListeners();
    this.createDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.newAccount.opening_balance_date = val || '';
    });
    this.openingDateControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((val) => {
      this.openingForm.opening_balance_date = val || '';
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      this.cancelEditAccount();
      this.setAccounts([]);
      if (this.companyId) {
        this.loadCompanyBankAccounts(this.companyId);
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterDirty();
    this.openingAccount = null;
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isBankDropdownOpen && !target.closest('.bank-combobox-container')) {
      this.isBankDropdownOpen = false;
      this.cdr.markForCheck();
    }
  }

  hasPendingForm(): boolean {
    const acc = this.newAccount;
    return this.isEditingAccount || !!this.openingAccount
      || !!(acc.bank_name || acc.sheba_number || acc.account_number || acc.account_title || acc.opening_balance || acc.opening_balance_date);
  }

  /** شمارندهٔ تب از context به هستهٔ استودیو می‌رسد */
  private setAccounts(accounts: CompanyBankAccount[]): void {
    this.companyBankAccounts = accounts;
    this.studioContext.setCount(TREASURY_TAB_ID, accounts.length);
  }

  private setupRealtimeListeners(): void {
    // ۱. وب‌سوکت: تغییر حساب‌ها در تب یا دستگاه دیگر
    this.ws?.notifications$.pipe(takeUntil(this.destroy$)).subscribe((msg) => {
      if (msg?.type_str !== 'org_structure_updated' || msg.entity_type !== 'company_bank_account') return;
      if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
      const targetCompanyId = msg.company_id;
      if (this.companyId && (!targetCompanyId || targetCompanyId === this.companyId)) {
        this.loadCompanyBankAccounts(this.companyId);
      }
    });

    // ۲. نتیجهٔ پس‌زمینهٔ کش SWR
    this.offlineSync.liveDataUpdates$.pipe(takeUntil(this.destroy$)).subscribe(({ url, data }) => {
      if (!url || !this.companyId || !this.companyApi.matchesCompanyUrl(url, 'bankAccounts')) return;
      // تطبیق دقیق شناسه (company_id=1 نباید با company_id=12 جور شود)
      if (!new RegExp(`[?&]company_id=${this.companyId}(&|$)`).test(url)) return;
      if (Array.isArray(data)) {
        this.setAccounts(data);
      } else if (data && Array.isArray((data as any).results)) {
        this.setAccounts((data as any).results);
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
    return false;
  }

  retry(): void {
    if (this.companyId) this.loadCompanyBankAccounts(this.companyId);
  }

  // ═════════════════════════════════════════════════════════════════════
  // مدیریت حساب‌های بانکی و شبای شرکت (چند حسابی)
  // ═════════════════════════════════════════════════════════════════════
  loadCompanyBankAccounts(companyId: number): void {
    this.isLoadingBankAccounts = true;
    this.loadError = false;
    this.studioContext.reportError(TREASURY_TAB_ID, false);
    this.facade.getBankAccounts(companyId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        // پاسخ دیررسِ شرکت پیشین شمارندهٔ شرکت تازه را عوض نمی‌کند
        if (companyId !== this.companyId) return;
        this.isLoadingBankAccounts = false;
        if (Array.isArray(res)) {
          this.setAccounts(res);
        } else if (res && Array.isArray((res as any).results)) {
          this.setAccounts((res as any).results);
        } else {
          this.setAccounts([]);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingBankAccounts = false;
        this.loadError = true;
        this.studioContext.reportError(TREASURY_TAB_ID);
        this.cdr.markForCheck();
      }
    });
  }

  onShebaInput(val: string): void {
    const cleaned = cleanShebaInput(val);
    if (!cleaned) {
      this.shebaValidationResult = null;
      this.shebaDigitsDisplay = '';
      this.newAccount.sheba_number = '';
      this.cdr.markForCheck();
      return;
    }

    const digits = extractShebaDigits(cleaned);
    this.shebaValidationResult = validateSheba(digits);
    this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || digits;
    this.newAccount.sheba_number = this.shebaValidationResult?.rawSheba || cleaned;

    if (this.shebaValidationResult?.bank) {
      this.newAccount.bank_name = this.shebaValidationResult.bank.name;
    }
    if (this.shebaValidationResult?.accountNumber) {
      this.newAccount.account_number = this.shebaValidationResult.accountNumber;
    }
    this.cdr.markForCheck();
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  selectBankForAccount(bank: IranianBankInfo): void {
    this.newAccount.bank_name = bank.name;
    this.isBankDropdownOpen = false;
    this.onAccountNumberInput();
    this.cdr.markForCheck();
  }

  filterBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery.trim()) {
      return this.iranianBanksList;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanksList.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.shortName.toLowerCase().includes(q) ||
      b.code.includes(q)
    );
  }

  onAccountNumberInput(event?: any): void {
    let cleanAcc = this.newAccount.account_number || '';
    if (event) {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                       .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                       .replace(/\D/g, '')
                       .substring(0, 18);
      this.newAccount.account_number = cleanAcc;
      if (event?.target) event.target.value = cleanAcc;
    }
    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.newAccount.bank_name) {
      const bankInfo = getBankByName(this.newAccount.bank_name);
      const bankCode = bankInfo ? bankInfo.code : this.newAccount.bank_name;
      const generated = generateShebaFromAccount(bankCode, cleanAcc);
      if (generated) {
        const res = validateSheba(generated);
        this.shebaValidationResult = res;
        this.newAccount.sheba_number = res.rawSheba || generated;
        this.shebaDigitsDisplay = res.formattedDigits || '';
      }
    }
    this.cdr.markForCheck();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    const cleanAcc = pasted.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.newAccount.account_number = cleanAcc;
    this.onAccountNumberInput();
  }

  convertAccountToShebaNow(): void {
    if (!this.newAccount.bank_name) {
      this.toast.warning('لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.newAccount.account_number);
    if (!accValidation.isValid) {
      this.toast.warning(accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const bankInfo = getBankByName(this.newAccount.bank_name);
    const bankCode = bankInfo ? bankInfo.code : this.newAccount.bank_name;
    const generated = generateShebaFromAccount(bankCode, this.newAccount.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.success(`شماره شبا با موفقیت بر اساس بانک ${this.newAccount.bank_name} تولید شد.`);
    } else {
      this.toast.error('امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  copyAccountNumber(acc: string): void {
    if (!acc) return;
    navigator.clipboard.writeText(acc).then(() => {
      this.isAccountCopied = true;
      this.toast.success(`شماره حساب (${acc}) کپی شد.`);
      setTimeout(() => {
        this.isAccountCopied = false;
        this.cdr.markForCheck();
      }, 2000);
      this.cdr.markForCheck();
    }).catch(() => {
      this.toast.error('عدم دسترسی به حافظه موقت.');
    });
  }

  copySheba(sheba: string, id?: number | string): void {
    if (!sheba) return;
    navigator.clipboard.writeText(sheba).then(() => {
      this.copiedShebaId = id ?? null;
      this.copiedSheba = sheba;
      this.toast.success('شماره شبا در حافظه کپی شد.');
      setTimeout(() => {
        this.copiedShebaId = null;
        this.copiedSheba = null;
        this.cdr.markForCheck();
      }, 2500);
      this.cdr.markForCheck();
    }).catch(() => {
      this.toast.error('امکان کپی در حافظه وجود ندارد.');
    });
  }

  async saveBankAccount(): Promise<void> {
    if (!this.companyId) {
      this.toast.warning('لطفاً ابتدا شرکت را ذخیره فرمایید.');
      return;
    }
    if (!this.newAccount.sheba_number.trim()) {
      this.toast.warning('لطفاً شماره شبا را وارد فرمایید.');
      return;
    }

    const shebaVal = validateSheba(this.newAccount.sheba_number);
    if (!shebaVal.isValid) {
      this.toast.error(shebaVal.errorMessage || 'شماره شبا نامعتبر است.');
      return;
    }

    this.createFieldErrors = {};
    if (!this.isEditingAccount && !this.newAccount.opening_balance_date) {
      this.createFieldErrors = { opening_balance_date: 'تاریخ موجودی اولیه الزامی است.' };
      this.cdr.markForCheck();
      return;
    }

    const duplicate = this.findDuplicateSheba(shebaVal.formattedSheba);
    if (duplicate) {
      const ok = this.confirmDialog
        ? (await this.confirmDialog.open({
            title: 'شبای تکراری',
            message: `این شماره شبا پیش‌تر برای حساب «${duplicate.bank_name}${duplicate.account_title ? ' – ' + duplicate.account_title : ''}» ثبت شده است. باز هم ثبت شود؟`,
            type: 'warning',
            confirmText: 'ثبت تکراری',
            cancelText: 'انصراف'
          })) === true
        : false;
      if (!ok) return;
    }

    this.isSavingBankAccount = true;
    const payload: Partial<CompanyBankAccount> = {
      company: this.companyId,
      bank_name: this.newAccount.bank_name.trim() || (shebaVal.bank?.name || 'نامشخص'),
      account_number: this.newAccount.account_number.trim() || shebaVal.accountNumber || null,
      sheba_number: shebaVal.formattedSheba.replace(/\s+/g, ''),
      account_title: this.newAccount.account_title?.trim() || null,
      is_primary: this.newAccount.is_primary,
      is_active: true
    };
    // موجودی اولیه فقط هنگام ساخت فرستاده می‌شود؛ پس از آن فقط از «تغییر موجودی اولیه» (سرور تغییر در ویرایش را رد می‌کند)
    if (!this.isEditingAccount) {
      payload.opening_balance = this.newAccount.opening_balance || '0';
      payload.opening_balance_date = this.newAccount.opening_balance_date;
    }

    if (this.isEditingAccount && this.editingAccountId) {
      this.facade.updateBankAccount(this.editingAccountId, payload).subscribe({
        next: (saved) => {
          this.isSavingBankAccount = false;
          if (this.isPendingRecord(saved)) {
            this.toast.info('ویرایش حساب بانکی در صف ارسال است و پس از اتصال ثبت می‌شود.');
          } else {
            this.toast.success(`حساب بانکی «${saved.bank_name}» با موفقیت ویرایش شد.`);
          }
          this.cancelEditAccount();
          const idx = this.companyBankAccounts.findIndex(a => a.id === saved.id);
          if (idx !== -1) {
            this.companyBankAccounts[idx] = saved;
            this.setAccounts([...this.companyBankAccounts]);
          } else {
            this.setAccounts([saved, ...this.companyBankAccounts]);
          }
          if (saved.is_primary) {
            this.setAccounts(this.companyBankAccounts.map(a => ({
              ...a,
              is_primary: a.id === saved.id
            })));
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBankAccount = false;
          const msg = err.error?.detail || err.error?.sheba_number?.[0] || 'خطا در ویرایش حساب بانکی';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    } else {
      this.facade.createBankAccount(payload).subscribe({
        next: (created) => {
          this.isSavingBankAccount = false;
          if (this.isPendingRecord(created)) {
            this.toast.info('حساب بانکی در صف ارسال است و پس از اتصال ثبت می‌شود.');
          } else {
            this.toast.success(`حساب بانکی «${created.bank_name}» با موفقیت افزوده شد.`);
          }
          this.cancelEditAccount();
          if (created.is_primary) {
            this.setAccounts(this.companyBankAccounts.map(a => ({
              ...a,
              is_primary: false
            })));
          }
          this.setAccounts([created, ...this.companyBankAccounts.filter(a => a.id !== created.id)]);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSavingBankAccount = false;
          this.createFieldErrors = this.extractErrors(err?.error, ['opening_balance', 'opening_balance_date']);
          if (Object.keys(this.createFieldErrors).length) {
            this.cdr.markForCheck();
            return;
          }
          const msg = err.error?.detail || err.error?.sheba_number?.[0] || 'خطا در ثبت حساب بانکی';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
    }
  }

  editAccount(acc: CompanyBankAccount): void {
    // ویرایش رکورد آفلاین به نشانی شناسهٔ موقت می‌رود و هنگام ارسال ۴۰۴ می‌گیرد (E2)
    if (this.isPendingRecord(acc)) return;
    this.isEditingAccount = true;
    this.editingAccountId = acc.id || null;
    this.newAccount = {
      id: acc.id,
      bank_name: acc.bank_name,
      account_number: acc.account_number || '',
      sheba_number: acc.sheba_number,
      account_title: acc.account_title || '',
      is_primary: acc.is_primary,
      opening_balance: null,
      opening_balance_date: ''
    };
    this.shebaValidationResult = validateSheba(acc.sheba_number);
    this.shebaDigitsDisplay = this.shebaValidationResult?.formattedDigits || extractShebaDigits(acc.sheba_number);
    this.cdr.markForCheck();
  }

  cancelEditAccount(): void {
    this.isEditingAccount = false;
    this.editingAccountId = null;
    this.newAccount = this.getEmptyBankAccountData();
    this.createFieldErrors = {};
    this.isCreateDatePickerOpen = false;
    this.createDateControl.setValue('', { emitEvent: false });
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.cdr.markForCheck();
  }

  onCreateDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.newAccount.opening_balance_date = val;
    delete this.createFieldErrors.opening_balance_date;
    this.createDateControl.setValue(val, { emitEvent: false });
    this.isCreateDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  // ═════════════════════════════════════════════════════════════════════
  // تغییر موجودی اولیه و سابقهٔ آن (۳.۳-ج)
  // ═════════════════════════════════════════════════════════════════════
  openOpeningBalance(acc: CompanyBankAccount): void {
    if (!this.canChangeOpening(acc)) return;
    this.openingAccount = acc;
    this.openingForm = {
      opening_balance: acc.opening_balance ?? null,
      opening_balance_date: acc.opening_balance_date || '',
      reason: ''
    };
    this.openingDateControl.setValue(this.openingForm.opening_balance_date, { emitEvent: false });
    this.openingErrors = {};
    this.isOpeningDatePickerOpen = false;
    this.loadOpeningHistory(acc);
    this.cdr.markForCheck();
  }

  closeOpeningBalance(): void {
    if (this.isSavingOpening) return;
    this.openingAccount = null;
    this.openingHistory = [];
    this.openingErrors = {};
    this.isOpeningDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  onOpeningDateSelect(event: any): void {
    const val = typeof event === 'string' ? event : (event?.shamsi || event?.gregorian || '');
    this.openingForm.opening_balance_date = val;
    delete this.openingErrors.opening_balance_date;
    this.openingDateControl.setValue(val, { emitEvent: false });
    this.isOpeningDatePickerOpen = false;
    this.cdr.markForCheck();
  }

  loadOpeningHistory(acc: CompanyBankAccount): void {
    this.openingHistory = [];
    this.historyError = false;
    if (!acc.id || !this.canReadBank) return;
    const accountId = acc.id;
    this.isLoadingHistory = true;
    this.facade.getOpeningHistory(accountId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (this.openingAccount?.id !== accountId) return;
        this.isLoadingHistory = false;
        this.openingHistory = Array.isArray(res?.results) ? res.results : [];
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.openingAccount?.id !== accountId) return;
        this.isLoadingHistory = false;
        this.historyError = true;
        this.cdr.markForCheck();
      }
    });
  }

  saveOpeningBalance(): void {
    const acc = this.openingAccount;
    if (!acc?.id) return;
    this.openingErrors = {};
    if (!this.openingForm.opening_balance_date) {
      this.openingErrors.opening_balance_date = 'تاریخ موجودی اولیه الزامی است.';
    }
    if (acc.has_movements && !this.openingForm.reason.trim()) {
      this.openingErrors.reason = 'علت تغییر برای حساب دارای گردش الزامی است.';
    }
    if (Object.keys(this.openingErrors).length) {
      this.cdr.markForCheck();
      return;
    }
    const body: CompanyBankOpeningBalancePayload = {
      opening_balance: this.openingForm.opening_balance || '0',
      opening_balance_date: this.openingForm.opening_balance_date,
      reason: this.openingForm.reason.trim()
    };
    const accountId = acc.id;
    this.isSavingOpening = true;
    this.facade.setOpeningBalance(accountId, body).subscribe({
      next: (saved: any) => {
        this.isSavingOpening = false;
        if (saved?._offlinePending) {
          this.toast.info('تغییر موجودی اولیه در صف ارسال است و پس از اتصال ثبت می‌شود.');
        } else {
          this.toast.success('موجودی اولیهٔ حساب ثبت شد.');
          const idx = this.companyBankAccounts.findIndex(a => a.id === accountId);
          if (idx !== -1 && saved?.id === accountId) {
            this.companyBankAccounts[idx] = { ...this.companyBankAccounts[idx], ...saved };
            this.setAccounts([...this.companyBankAccounts]);
          }
        }
        this.closeOpeningBalance();
      },
      error: (err) => {
        this.isSavingOpening = false;
        this.openingErrors = this.extractErrors(err?.error, ['opening_balance', 'opening_balance_date', 'reason']);
        if (!Object.keys(this.openingErrors).length) {
          this.toast.error(err?.error?.detail || 'خطا در تغییر موجودی اولیه');
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** پاسخ 400 سرور به شکل { فیلد: [پیام] } را به پیام کنار فیلد تبدیل می‌کند */
  private extractErrors<K extends string>(body: any, keys: K[]): Partial<Record<K, string>> {
    const out: Partial<Record<K, string>> = {};
    if (!body || typeof body !== 'object') return out;
    for (const key of keys) {
      const v = body[key];
      const msg = Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : '');
      if (msg) out[key] = String(msg);
    }
    return out;
  }

  async deleteBankAccount(acc: CompanyBankAccount): Promise<void> {
    if (!acc.id || this.isPendingRecord(acc)) return;
    const ok = await this.askConfirm(
      'حذف حساب بانکی',
      `آیا از حذف حساب بانکی «${acc.bank_name}» با شماره شبای «${acc.sheba_number}» اطمینان دارید؟`
    );
    if (!ok) return;
    this.facade.deleteBankAccount(acc.id).subscribe({
      next: (res: any) => {
        if (res?._offlinePending) {
          this.toast.info('حذف حساب بانکی در صف ارسال است و پس از اتصال انجام می‌شود.');
        } else {
          this.toast.success('حساب بانکی با موفقیت حذف شد.');
        }
        this.setAccounts(this.companyBankAccounts.filter(a => a.id !== acc.id));
        this.cdr.markForCheck();
      },
      error: (err) => this.toast.error(err?.error?.detail || 'خطا در حذف حساب بانکی')
    });
  }

  setPrimaryAccount(acc: CompanyBankAccount): void {
    if (!acc.id || !this.companyId || this.isPendingRecord(acc)) return;
    const companyId = this.companyId;
    this.facade.setPrimaryBankAccount(acc.id).subscribe({
      next: (res: any) => {
        if (res?._offlinePending) {
          this.toast.info('تنظیم حساب اصلی در صف ارسال است و پس از اتصال انجام می‌شود.');
        } else {
          this.toast.success(`حساب «${acc.bank_name}» به عنوان حساب اصلی شرکت تنظیم شد.`);
        }
        // حساب اصلی فقط `is_primary` همین حساب‌هاست (ت۶ طرح ۲.۱)؛ شرکت فیلد بانک اصلی ندارد
        if (companyId !== this.companyId) return;
        this.setAccounts(this.companyBankAccounts.map(a => ({
          ...a,
          is_primary: a.id === acc.id
        })));
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('خطا در تنظیم حساب اصلی')
    });
  }

  private getEmptyBankAccountData() {
    return {
      id: undefined as number | undefined,
      bank_name: '',
      account_number: '',
      sheba_number: '',
      account_title: '',
      is_primary: false,
      opening_balance: null as string | null,
      opening_balance_date: ''
    };
  }
}
