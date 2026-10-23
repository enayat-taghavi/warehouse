/**
 * Iranian IBAN (Sheba) Validation and Bank Detection Utility
 * Standard: ISO 7064 Mod 97-10 & ISO 13616
 */

export interface IranianBankInfo {
  code: string;       // کد ۳ رقمی شبا
  binCode?: string;   // پیش‌شماره ۶ رقمی کارت شتاب
  name: string;       // نام فارسی بانک
  shortName: string;  // نام کوتاه
  icon?: string;      // ایموجی یا آیکون
}

// لیست کامل ۳۲ بانک و مؤسسه اعتباری رسمی کشور با کد ۳ رقمی استاندارد شبا (CBI Official Directory)
export const IRANIAN_BANKS: IranianBankInfo[] = [
  { code: '010', binCode: '636795', name: 'بانک مرکزی جمهوری اسلامی ایران', shortName: 'مرکزی', icon: '🏛️' },
  { code: '011', binCode: '627760', name: 'بانک صنعت و معدن', shortName: 'صنعت و معدن', icon: '🏭' },
  { code: '012', binCode: '610433', name: 'بانک ملت', shortName: 'ملت', icon: '🔴' },
  { code: '013', binCode: '589463', name: 'بانک رفاه کارگران', shortName: 'رفاه', icon: '🔵' },
  { code: '014', binCode: '628023', name: 'بانک مسکن', shortName: 'مسکن', icon: '🏠' },
  { code: '015', binCode: '589210', name: 'بانک سپه', shortName: 'سپه', icon: '⭐' },
  { code: '016', binCode: '603770', name: 'بانک کشاورزی', shortName: 'کشاورزی', icon: '🌾' },
  { code: '017', binCode: '603799', name: 'بانک ملی ایران', shortName: 'ملی', icon: '🦁' },
  { code: '018', binCode: '627353', name: 'بانک تجارت', shortName: 'تجارت', icon: '🔷' },
  { code: '019', binCode: '603769', name: 'بانک صادرات ایران', shortName: 'صادرات', icon: '💎' },
  { code: '020', binCode: '627961', name: 'بانک توسعه صادرات ایران', shortName: 'توسعه صادرات', icon: '🚢' },
  { code: '021', binCode: '627648', name: 'پست بانک ایران', shortName: 'پست بانک', icon: '📮' },
  { code: '022', binCode: '502908', name: 'بانک توسعه تعاون', shortName: 'توسعه تعاون', icon: '🤝' },
  { code: '051', binCode: '621986', name: 'موسسه اعتباری غیربانکی ملل (عسکریه)', shortName: 'ملل', icon: '🏢' },
  { code: '053', binCode: '627412', name: 'بانک کارآفرین', shortName: 'کارآفرین', icon: '💼' },
  { code: '054', binCode: '622106', name: 'بانک پارسیان', shortName: 'پارسیان', icon: '🌸' },
  { code: '055', binCode: '627488', name: 'بانک اقتصاد نوین', shortName: 'اقتصاد نوین', icon: '🌐' },
  { code: '056', binCode: '621986', name: 'بانک سامان', shortName: 'سامان', icon: '🌊' },
  { code: '057', binCode: '502229', name: 'بانک پاسارگاد', shortName: 'پاسارگاد', icon: '🏛️' },
  { code: '058', binCode: '639607', name: 'بانک سرمایه', shortName: 'سرمایه', icon: '📊' },
  { code: '059', binCode: '639346', name: 'بانک سینا', shortName: 'سینا', icon: '💠' },
  { code: '060', binCode: '627381', name: 'بانک قرض‌الحسنه مهر ایران', shortName: 'مهر ایران', icon: '☀️' },
  { code: '061', binCode: '504706', name: 'بانک شهر', shortName: 'شهر', icon: '🏙️' },
  { code: '062', binCode: '636214', name: 'بانک آینده', shortName: 'آینده', icon: '🔮' },
  { code: '063', binCode: '627353', name: 'بانک انصار (ادغام در سپه)', shortName: 'انصار', icon: '⭐' },
  { code: '064', binCode: '505785', name: 'بانک گردشگری', shortName: 'گردشگری', icon: '🧭' },
  { code: '065', binCode: '636949', name: 'بانک حکمت ایرانیان (ادغام در سپه)', shortName: 'حکمت', icon: '⭐' },
  { code: '066', binCode: '505416', name: 'بانک دی', shortName: 'دی', icon: '🦅' },
  { code: '069', binCode: '505801', name: 'بانک ایران زمین', shortName: 'ایران زمین', icon: '🌍' },
  { code: '070', binCode: '504172', name: 'بانک قرض‌الحسنه رسالت', shortName: 'رسالت', icon: '🌿' },
  { code: '075', binCode: '606373', name: 'موسسه اعتباری غیربانکی نور', shortName: 'نور', icon: '💡' },
  { code: '078', binCode: '507677', name: 'بانک خاورمیانه', shortName: 'خاورمیانه', icon: '🗺️' }
];

export interface ShebaValidationResult {
  isValid: boolean;
  rawSheba: string;          // مثل IR120170000000101111111001
  shebaDigitsOnly: string;   // صرفاً ۲۴ رقم: 120170000000101111111001
  accountNumber: string;     // شماره حساب استخراج‌شده (مثلاً 101111111001)
  formattedDigits: string;   // فرمت ۲۴ رقمی: 12 0170 0000 0010 1111 1110 01
  formattedSheba: string;    // فرمت کامل: IR12 0170 0000 0010 1111 1110 01
  bank: IranianBankInfo | null;
  errorMessage: string | null;
}

export interface AccountValidationResult {
  isValid: boolean;
  errorMessage: string | null;
  cleanAccountNumber: string;
}

/**
 * اعتبارسنجی سخت‌گیرانه شماره حساب بانکی بر اساس استانداردهای شبکه بانکی کشور
 * (حداقل ۴ رقم، حداکثر ۱۸ رقم، رد قاطع شماره حساب صفر و پوچ)
 */
export function validateAccountNumber(accountNumber?: string | null, bankCode?: string): AccountValidationResult {
  if (!accountNumber || !accountNumber.toString().trim()) {
    return { isValid: false, errorMessage: 'شماره حساب نمی‌تواند خالی باشد.', cleanAccountNumber: '' };
  }
  const cleanDigits = accountNumber.toString()
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/\D/g, '');

  if (!cleanDigits) {
    return { isValid: false, errorMessage: 'شماره حساب فاقد هرگونه رقم عددی است.', cleanAccountNumber: '' };
  }
  if (/^0+$/.test(cleanDigits)) {
    return { isValid: false, errorMessage: 'شماره حساب نمی‌تواند صفر یا تماماً صفر باشد.', cleanAccountNumber: cleanDigits };
  }
  if (cleanDigits.length < 4) {
    return { isValid: false, errorMessage: `طول شماره حساب ناقص است (${cleanDigits.length} از حداقل ۴ رقم).`, cleanAccountNumber: cleanDigits };
  }
  if (cleanDigits.length > 18) {
    return { isValid: false, errorMessage: 'طول شماره حساب بیشتر از سقف مجاز بانکی (۱۸ رقم) است.', cleanAccountNumber: cleanDigits };
  }

  return { isValid: true, errorMessage: null, cleanAccountNumber: cleanDigits };
}

/**
 * استخراج شماره حساب بانکی از داخل ارقام شماره شبا (حذف صفرهای زائد سمت چپ)
 */
export function extractAccountNumberFromSheba(input: string): string {
  const digits = extractShebaDigits(input);
  if (digits.length <= 6) return '';
  const rawAccount = digits.substring(6);
  const trimmed = rawAccount.replace(/^0+/, '');
  return trimmed || '';
}

/**
 * یافتن اطلاعات بانک بر اساس نام، نام کوتاه یا کد ۳ رقمی
 */
export function getBankByName(bankName?: string | null): IranianBankInfo | null {
  if (!bankName) return null;
  const clean = bankName.trim();
  return IRANIAN_BANKS.find(b => b.name === clean || b.shortName === clean || b.code === clean || clean.includes(b.name) || b.name.includes(clean)) || null;
}

/**
 * تبدیل مستقیم شماره حساب و بانک به شماره شبای رسمی بر مبنای استاندارد ISO 7064 Mod 97-10 با گارد اعتبارسنجی
 */
export function generateShebaFromAccount(bankIdentifier?: string | null, accountNumber?: string | null, accountType: string = '0'): string {
  if (!bankIdentifier || !accountNumber) return '';
  const bank = getBankByName(bankIdentifier) || IRANIAN_BANKS.find(b => b.code === bankIdentifier);
  if (!bank) return '';

  const accValidation = validateAccountNumber(accountNumber, bank.code);
  if (!accValidation.isValid) return '';

  const paddedAccount = accValidation.cleanAccountNumber.padStart(18, '0');
  const bban = bank.code + (accountType || '0') + paddedAccount;
  const payload = bban + '182700';

  try {
    const remainder = BigInt(payload) % 97n;
    const checkDigits = (98n - remainder).toString().padStart(2, '0');
    return 'IR' + checkDigits + bban;
  } catch {
    return '';
  }
}

/**
 * استخراج هوشمند فقط ارقام عددی از هرگونه رشته، متن، کاراکترهای فارسی، انگلیسی یا نمادها هنگام تایپ و کپی‌پیست
 */
export function extractShebaDigits(input: string): string {
  if (!input) return '';
  // ۱. تبدیل ارقام فارسی و عربی به انگلیسی
  let normalized = input
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  // ۲. استخراج دقیقاً ارقام عددی 0-9 و حذف کلیه حروف، فواصل و نشانه‌ها (مثل I, R, ث, ل, $, _, -, ...)
  const digitsOnly = normalized.replace(/\D/g, '');
  
  // ۳. سقف حداکثر ۲۴ رقم شبا
  return digitsOnly.substring(0, 24);
}

/**
 * پاکسازی و نرمال‌سازی شماره شبا و افزودن قطعی پیشوند IR به ابتدای ۲۴ رقم
 */
export function cleanShebaInput(input: string): string {
  if (!input) return '';
  const digits = extractShebaDigits(input);
  if (!digits) return '';
  return 'IR' + digits;
}

/**
 * فرمت‌بندی ۲۴ رقم عددی به صورت بلوک‌های خوانا (مثلاً: 12 0170 0000 0010 1111 1110 01)
 */
export function formatShebaDigitsDisplay(digits: string): string {
  if (!digits) return '';
  const cleanDigits = digits.replace(/\D/g, '');
  if (cleanDigits.length <= 2) return cleanDigits;
  
  const parts: string[] = [cleanDigits.substring(0, 2)];
  for (let i = 2; i < cleanDigits.length; i += 4) {
    parts.push(cleanDigits.substring(i, i + 4));
  }
  return parts.join(' ');
}

/**
 * فرمت‌بندی نمایشی ۲۶ کاراکتری شبا به صورت بلوک‌های ۴ کاراکتری خوانا
 */
export function formatShebaDisplay(rawSheba: string): string {
  const clean = cleanShebaInput(rawSheba);
  if (!clean || clean.length < 2) return '';
  const digits = clean.substring(2);
  return 'IR ' + formatShebaDigitsDisplay(digits);
}

/**
 * استخراج بانک بر اساس کد ۳ رقمی استاندارد شبا (کاراکترهای ۵ تا ۷ شبا یا ارقام ۳ تا ۵ بدون IR)
 */
export function getBankFromSheba(input: string): IranianBankInfo | null {
  const digits = extractShebaDigits(input);
  if (digits.length < 5) return null;
  // دو رقم اول ارقام کنترلی هستند، ۳ رقم بعدی (اندیس ۲ تا ۵) کد بانک هستند
  const bankCode = digits.substring(2, 5);
  return IRANIAN_BANKS.find(b => b.code === bankCode) || null;
}

/**
 * اعتبارسنجی کامل ریاضی شماره شبا بر مبنای ISO 7064 Mod 97-10
 */
export function validateSheba(input: string): ShebaValidationResult {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      rawSheba: '',
      shebaDigitsOnly: '',
      accountNumber: '',
      formattedDigits: '',
      formattedSheba: '',
      bank: null,
      errorMessage: null
    };
  }

  const digits = extractShebaDigits(input);
  const rawSheba = digits ? 'IR' + digits : '';
  const bank = getBankFromSheba(digits);
  const formattedDigits = formatShebaDigitsDisplay(digits);
  const formattedSheba = formatShebaDisplay(rawSheba);
  const accountNumber = extractAccountNumberFromSheba(digits);

  if (digits.length === 0) {
    return {
      isValid: false,
      rawSheba: '',
      shebaDigitsOnly: '',
      accountNumber: '',
      formattedDigits: '',
      formattedSheba: '',
      bank: null,
      errorMessage: 'شماره شبا شامل هیچ رقمی نیست.'
    };
  }

  if (digits.length < 24) {
    return {
      isValid: false,
      rawSheba,
      shebaDigitsOnly: digits,
      accountNumber,
      formattedDigits,
      formattedSheba,
      bank,
      errorMessage: `طول ارقام شبا ناقص است (${digits.length} از ۲۴ رقم).`
    };
  }

  // الگوریتم رسمی ISO 7064 Mod 97-10
  // ساختار: ۲ رقم اول Check Digits، ۲۲ رقم بعدی شماره حساب
  // چرخش: ۲۲ رقم آخر + 1827 + ۲ رقم اول
  const checkDigits = digits.substring(0, 2);
  if (checkDigits === '00' || checkDigits === '01' || checkDigits === '99') {
    return {
      isValid: false,
      rawSheba,
      shebaDigitsOnly: digits,
      accountNumber,
      formattedDigits,
      formattedSheba,
      bank,
      errorMessage: 'ارقام کنترلی شبا نامعتبر است.'
    };
  }

  // گارد سخت‌گیر: رد شماره حساب‌های تماماً صفر در شماره شبا
  if (!accountNumber || /^0+$/.test(accountNumber)) {
    return {
      isValid: false,
      rawSheba,
      shebaDigitsOnly: digits,
      accountNumber: '',
      formattedDigits,
      formattedSheba,
      bank,
      errorMessage: 'شماره حساب مندرج در شبا نامعتبر (صفر) است.'
    };
  }

  const bban = digits.substring(2); // ۲۲ رقم حساب
  const numericString = bban + '1827' + checkDigits;

  try {
    const remainder = BigInt(numericString) % 97n;
    if (remainder === 1n) {
      return {
        isValid: true,
        rawSheba,
        shebaDigitsOnly: digits,
        accountNumber,
        formattedDigits,
        formattedSheba,
        bank,
        errorMessage: null
      };
    } else {
      return {
        isValid: false,
        rawSheba,
        shebaDigitsOnly: digits,
        accountNumber,
        formattedDigits,
        formattedSheba,
        bank,
        errorMessage: 'کد کنترلی شبا معتبر نیست (خطای محاسباتی Mod 97).'
      };
    }
  } catch {
    return {
      isValid: false,
      rawSheba,
      shebaDigitsOnly: digits,
      accountNumber,
      formattedDigits,
      formattedSheba,
      bank,
      errorMessage: 'خطا در ارزیابی ساختار شبا.'
    };
  }
}
