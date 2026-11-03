/**
 * موتور مرکزی تبدیل اعداد و مبالغ به حروف فارسی
 * Zero-dependency, High-performance Persian Number-to-Words Engine
 *
 * پشتیبانی از:
 * - اعداد بزرگ بدون محدودیت با رشته / BigInt
 * - ارقام فارسی و عربی، جداکننده‌های هزارگان (کاما، خط تیره، فاصله)
 * - واحد‌های مالی استاندارد (ریال، تومان) همراه با معادل‌سازی خودکار
 * - اعشار و مقادیر منفی
 */

export interface NumberToWordsOptions {
  /**
   * واحد مبلغ یا کمیت.
   * مقادیر خاص: 'rial' یا 'ریال'، 'toman' یا 'تومان'
   */
  unit?: 'rial' | 'toman' | 'ریال' | 'تومان' | string;

  /**
   * آیا برای ریال، معادل تومان به صورت خودکار در پرانتز آورده شود؟
   * مثال: دوازده میلیون و پانصد هزار ریال (معادل یک میلیون و دویست و پنجاه هزار تومان)
   * پیش‌فرض: false
   */
  showTomanEquivalent?: boolean;

  /**
   * آیا در صورت صفر بودن مبلغ، نام واحد نیز درج شود؟
   * پیش‌فرض: true (مثلاً «صفر ریال»)
   */
  includeUnitForZero?: boolean;
}

const UNITS = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

const SCALES = [
  '',
  'هزار',
  'میلیون',
  'میلیارد',
  'تریلیون',
  'کوادریلیون',
  'کوینتیلیون',
  'سکستیلیون',
  'سپتیلیون',
];

const DECIMAL_NAMES = [
  '',
  'دهم',
  'صدم',
  'هزارم',
  'ده‌هزارم',
  'صد‌هزارم',
  'میلیونیم',
  'ده‌میلیونیم',
  'صد‌میلیونیم',
  'میلیاردم',
];

/** پاکسازی و نرمال‌سازی ورودی به ارقام استاندارد لاتین */
export function normalizeNumberInput(input: number | string | bigint | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  let str = String(input).trim();
  // تبدیل ارقام فارسی (۰-۹) و عربی (٠-٩)
  str = str
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,_\s\u060C]/g, ''); // حذف کاما، آندرلاین، فاصله و کامای فارسی
  return str;
}

/** تبدیل یک دسته سه رقمی (۱ تا ۹۹۹) به حروف فارسی */
function convertThreeDigits(num: number): string {
  if (num <= 0 || num > 999) return '';
  const parts: string[] = [];

  const h = Math.floor(num / 100);
  const rem = num % 100;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rem > 0) {
    if (rem < 10) {
      parts.push(UNITS[rem]);
    } else if (rem < 20) {
      parts.push(TEENS[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const u = rem % 10;
      parts.push(TENS[t]);
      if (u > 0) parts.push(UNITS[u]);
    }
  }

  return parts.join(' و ');
}

/**
 * تبدیل عدد صحیح مثبت بدون صفر ابتدایی به حروف
 */
function convertIntegerStringToWords(digits: string): string {
  if (!digits || digits === '0') return 'صفر';

  // برش سه رقم سه رقم از راست به چپ
  const chunks: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    chunks.push(digits.substring(Math.max(0, i - 3), i));
  }

  const words: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const val = parseInt(chunks[i], 10);
    if (val === 0) continue;

    const chunkWords = convertThreeDigits(val);
    const scale = i < SCALES.length ? SCALES[i] : `۱۰^${i * 3}`;

    if (scale) {
      words.push(`${chunkWords} ${scale}`);
    } else {
      words.push(chunkWords);
    }
  }

  return words.join(' و ');
}

/**
 * تابع اصلی تبدیل عدد یا مبلغ به حروف فارسی
 *
 * @param input عدد، رشته، یا بیگ‌اینت
 * @param options تنظیمات واحد و معادل تومان
 * @returns رشتهٔ حروف فارسی یا رشتهٔ خالی برای ورودی‌های نامعتبر
 *
 * مثال:
 *   numberToPersianWords(1250000) => "یک میلیون و دویست و پنجاه هزار"
 *   numberToPersianWords(12500000, { unit: 'rial', showTomanEquivalent: true })
 *     => "دوازده میلیون و پانصد هزار ریال (معادل یک میلیون و دویست و پنجاه هزار تومان)"
 */
export function numberToPersianWords(
  input: number | string | bigint | null | undefined,
  options?: NumberToWordsOptions
): string {
  const normalized = normalizeNumberInput(input);
  if (!normalized) return '';

  // بررسی قالب عددی مجاز (عدد صحیح یا اعشاری، با علامت منفی اختیاری)
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return '';
  }

  const isNegative = normalized.startsWith('-');
  const clean = isNegative ? normalized.slice(1) : normalized;

  const [intPartRaw, decPartRaw] = clean.split('.');
  const intTrimmed = intPartRaw.replace(/^0+/, '');
  const isZero = !intTrimmed && (!decPartRaw || /^0+$/.test(decPartRaw));

  let resultWords = '';

  if (isZero) {
    resultWords = 'صفر';
  } else {
    const intDigits = intTrimmed || '0';
    let intWords = convertIntegerStringToWords(intDigits);

    // اگر اعشار دارد
    if (decPartRaw && !/^0+$/.test(decPartRaw)) {
      const decTrimmed = decPartRaw.replace(/0+$/, ''); // حذف صفرهای انتهایی اعشار
      const decDigits = decTrimmed.replace(/^0+/, '') || '0';
      const decWords = convertIntegerStringToWords(decDigits);
      const decScale =
        decTrimmed.length < DECIMAL_NAMES.length
          ? DECIMAL_NAMES[decTrimmed.length]
          : `یک بر ۱۰ به توان ${decTrimmed.length}`;

      if (intWords === 'صفر') {
        resultWords = `${decWords} ${decScale}`;
      } else {
        resultWords = `${intWords} و ${decWords} ${decScale}`;
      }
    } else {
      resultWords = intWords;
    }

    if (isNegative) {
      resultWords = `منفی ${resultWords}`;
    }
  }

  // تنظیم واحد
  const rawUnit = (options?.unit || '').trim().toLowerCase();
  let unitTitle = '';
  let isRial = false;
  let isToman = false;

  if (rawUnit === 'rial' || rawUnit === 'ریال') {
    unitTitle = 'ریال';
    isRial = true;
  } else if (rawUnit === 'toman' || rawUnit === 'تومان') {
    unitTitle = 'تومان';
    isToman = true;
  } else if (options?.unit) {
    unitTitle = options.unit.trim();
  }

  const includeUnit = isZero ? options?.includeUnitForZero !== false : true;

  let finalOutput = resultWords;
  if (unitTitle && includeUnit) {
    finalOutput += ` ${unitTitle}`;
  }

  // معادل تومان در صورت درخواست برای ریال
  if (isRial && options?.showTomanEquivalent) {
    const rawVal = intTrimmed || '0';
    try {
      // محاسبه تومان با BigInt برای دقت صد در صدی مبالغ نجومی
      const rialBig = BigInt(rawVal);
      const tomanBig = rialBig / 10n;
      const tomanWords = convertIntegerStringToWords(tomanBig.toString());
      if (tomanWords && tomanWords !== 'صفر') {
        finalOutput += ` (معادل ${tomanWords} تومان)`;
      }
    } catch {
      /* در صورت خطای تبدیل بیگ‌اینت نادیده گرفته می‌شود */
    }
  }

  return finalOutput;
}

/** میانبر سریع برای تبدیل مبالغ ریالی همراه با معادل تومان */
export function rialToPersianWords(
  amount: number | string | bigint | null | undefined,
  includeTomanEquiv = true
): string {
  return numberToPersianWords(amount, {
    unit: 'ریال',
    showTomanEquivalent: includeTomanEquiv,
  });
}

/** میانبر سریع برای تبدیل مبالغ تومانی */
export function tomanToPersianWords(
  amount: number | string | bigint | null | undefined
): string {
  return numberToPersianWords(amount, {
    unit: 'تومان',
  });
}
