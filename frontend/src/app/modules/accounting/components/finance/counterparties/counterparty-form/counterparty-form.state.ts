import { Counterparty, PartyBankAccount } from '../../../../models/personnel.model';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  extractShebaDigits,
  generateShebaFromAccount,
  validateAccountNumber
} from '../../../../../../core/utils/sheba-utils';
import { SearchSelectOption } from '../../../../../../shared/components/search-select/search-select.component';

type Notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;

export function emptyCounterpartyForm(): Partial<Counterparty> {
  return {
    kind: undefined,
    name: '',
    counterparty_type: 'driver',
    national_id: '',
    economic_code: '',
    registration_number: '',
    phone: '',
    mobile: '',
    email: '',
    address: '',
    postal_code: '',
    notes: '',
    bank_name: '',
    account_number: '',
    sheba_number: '',
    account_code: '',
    is_active: true
  };
}

/** مقدار پوشیده (دارای *) از سرور آمده و نباید دوباره فرستاده شود. */
export function isMaskedValue(val?: string | null): boolean {
  return !!val && val.includes('*');
}

export function normalizeDigits(val?: string | null): string {
  if (!val) return '';
  return val
    .toString()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .trim();
}

/**
 * وضعیت و منطق مشترک فرم طرف‌حساب (صفحهٔ طرف‌حساب‌های حسابدار و تعریف سریع در فاکتور):
 * اعتبارسنجی شبا، بانک عامل، ساخت شبا از شماره حساب، شماره کارت و صاحب حساب.
 */
export class CounterpartyFormState {
  model: Partial<Counterparty> = emptyCounterpartyForm();

  bankCardNumber = '';
  bankOwnerName = '';
  readonly iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  readonly bankOptions: SearchSelectOption[] = IRANIAN_BANKS.map(b => ({ value: b.name, label: b.name, hint: b.code, keywords: b.code }));
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';
  isShebaCopied = false;
  isAccountCopied = false;
  private isSyncingBank = false;

  readonly isMaskedValue = isMaskedValue;

  constructor(private notify: Notify, private changed: () => void = () => {}) {}

  reset(model: Partial<Counterparty> = emptyCounterpartyForm()): void {
    this.model = model;
    this.resetBank();
  }

  resetBank(): void {
    this.model.bank_name = '';
    this.model.account_number = '';
    this.model.sheba_number = '';
    this.bankCardNumber = '';
    this.bankOwnerName = '';
    this.shebaValidationResult = null;
    this.shebaDigitsDisplay = '';
    this.isAccountCopied = false;
    this.isShebaCopied = false;
  }

  /** پر کردن فیلدهای بانکی از حساب موجود (ویرایش در فاکتور)؛ مقدار پوشیده فقط نمایش داده می‌شود. */
  loadBank(bank: { bank_name?: string | null; account_number?: string | null; sheba_number?: string | null }): void {
    this.resetBank();
    this.model.bank_name = bank.bank_name || '';
    this.model.account_number = bank.account_number || '';
    const sheba = (bank.sheba_number || '').replace(/^IR/i, '');
    if (isMaskedValue(sheba)) {
      this.model.sheba_number = sheba;
      this.shebaDigitsDisplay = sheba;
    } else if (sheba) {
      this.onShebaInput(sheba);
    }
  }

  get isShebaMasked(): boolean {
    return isMaskedValue(this.model.sheba_number);
  }

  /** شبای واردشده نامعتبر است (خالی نامعتبر نیست). */
  get isShebaInvalid(): boolean {
    return !!this.model.sheba_number && !this.isShebaMasked && !!this.shebaValidationResult && !this.shebaValidationResult.isValid;
  }

  /** فرم بانک چیزی برای ثبت دارد (شبا اجباری است). */
  hasPendingBankAccount(): boolean {
    return !!this.model.sheba_number && !this.isShebaMasked;
  }

  buildBankAccountPayload(): PartyBankAccount {
    const digits = extractShebaDigits(this.model.sheba_number || '');
    return {
      bank_name: (this.model.bank_name || '').trim(),
      account_number: normalizeDigits(this.model.account_number),
      sheba_number: digits ? `IR${digits}` : '',
      card_number: normalizeDigits(this.bankCardNumber).replace(/\D/g, ''),
      owner_name: this.bankOwnerName.trim()
    };
  }

  /** فیلدهای هویتی و مالی بی بانک؛ مقدار پوشیده فرستاده نمی‌شود. */
  buildIdentityPayload(name: string): Partial<Counterparty> {
    const f = this.model;
    const payload: Partial<Counterparty> = {
      name,
      counterparty_type: f.counterparty_type || 'other',
      economic_code: normalizeDigits(f.economic_code),
      registration_number: normalizeDigits(f.registration_number),
      phone: normalizeDigits(f.phone),
      mobile: normalizeDigits(f.mobile),
      email: (f.email || '').trim(),
      address: (f.address || '').trim(),
      postal_code: normalizeDigits(f.postal_code),
      notes: (f.notes || '').trim(),
      account_code: normalizeDigits(f.account_code),
      is_active: f.is_active !== false
    };
    if (f.kind) payload.kind = f.kind;
    const nationalId = normalizeDigits(f.national_id);
    if (!isMaskedValue(nationalId)) payload.national_id = nationalId;
    return payload;
  }

  /** انتخاب بانک از کادر جستجوپذیر بانک عامل */
  onBankSelected(name: string): void {
    const bank = this.iranianBanks.find(b => b.name === name);
    if (bank) this.selectBank(bank);
  }

  selectBank(bank: IranianBankInfo): void {
    this.model.bank_name = bank.name;

    const accValidation = validateAccountNumber(this.model.account_number);
    if (accValidation.isValid) {
      const generated = generateShebaFromAccount(bank.name, this.model.account_number);
      if (generated) {
        this.onShebaInput(generated);
      }
    }
    this.changed();
  }

  onShebaInput(event: any): void {
    if (this.isSyncingBank) return;
    this.isSyncingBank = true;
    try {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      const digits = extractShebaDigits(rawVal);
      if (!digits) {
        this.shebaValidationResult = null;
        this.shebaDigitsDisplay = '';
        this.model.sheba_number = '';
      } else {
        const res = validateSheba(digits);
        this.shebaValidationResult = res;
        this.shebaDigitsDisplay = res.formattedDigits || digits;
        this.model.sheba_number = digits;
        if (res.bank) {
          this.model.bank_name = res.bank.name;
        }
        if (res.accountNumber) {
          this.model.account_number = res.accountNumber;
        }
      }
      if (event?.target) {
        event.target.value = this.shebaDigitsDisplay;
      }
    } finally {
      this.isSyncingBank = false;
    }
    this.changed();
  }

  onAccountNumberInput(event: any): void {
    if (this.isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = normalizeDigits(rawVal).replace(/\D/g, '').substring(0, 18);
    this.model.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }
    if (cleanAcc && this.model.bank_name) {
      const generated = generateShebaFromAccount(this.model.bank_name, cleanAcc);
      if (generated) {
        this.isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.model.sheba_number = res.rawSheba?.replace(/^IR/i, '') || '';
        } finally {
          this.isSyncingBank = false;
        }
      }
    }
    this.changed();
  }

  copyShebaToClipboard(event?: Event): void {
    if (event) event.stopPropagation();
    const shebaDigits = this.model.sheba_number;
    if (!shebaDigits || isMaskedValue(shebaDigits)) return;
    const cleanDigits = shebaDigits.toString().trim().toUpperCase().replace(/^IR/i, '');
    navigator.clipboard.writeText(cleanDigits).then(() => {
      this.isShebaCopied = true;
      this.notify('success', `شماره شبا (بدون IR) در کلیپ‌بورد کپی شد: ${cleanDigits}`);
      setTimeout(() => { this.isShebaCopied = false; this.changed(); }, 2000);
      this.changed();
    });
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.model.account_number || '';
    if (!acc || isMaskedValue(acc)) return;
    navigator.clipboard.writeText(acc).then(() => {
      this.isAccountCopied = true;
      this.notify('success', `شماره حساب ${acc} کپی شد.`);
      setTimeout(() => { this.isAccountCopied = false; this.changed(); }, 2000);
      this.changed();
    });
  }
}
