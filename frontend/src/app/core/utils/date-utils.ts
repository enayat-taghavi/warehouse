/**
 * موتور جامع و یکپارچه تحلیل، اعتبارسنجی و تبدیل تاریخ در فرانت‌اند (Dual-Path Date Parser Engine)
 * انطباق ۱۰۰٪ با ۴ اصل فنی چت قبل و موتور بک‌اند (common/date_utils.py):
 * ۱. پشتیبانی از طول‌های متغیر (۶، ۸، ۱۲ و ۱۴ رقم) با قانون آستانه محوری ۵۰ (Pivot=50).
 * ۲. تبدیل ارقام فارسی و عربی به ارقام انگلیسی.
 * ۳. پیش‌پردازش قطعات جداکننده‌دار (Token-Padding) جهت رفع تداخل ماه‌ها و روزهای تک‌رقمی (مانند 1403/5/8).
 * ۴. اعتبارسنجی دامنه تقویمی و پرتاب خطای صریح در حالت سخت‌گیرانه (Strict).
 */

import { Utils } from 'jalali-ts';

export interface DateParseOptions {
  asTime?: boolean;
  strict?: boolean;
}

// رگکس اعتبارسنجی مسیر سریع برای تاریخ‌های استاندارد خورشیدی یا میلادی با اسلش یا خط تیره
const RE_STANDARD_DATE = /^\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?\s*$/;

// رگکس شناسایی جداکننده‌های متداول
const RE_SEPARATORS = /[^0-9]+/;

/**
 * تبدیل ارقام فارسی (۰-۹) و عربی (٠-٩) به ارقام استاندارد لاتین
 */
export function normalizeDigits(val: string): string {
  if (!val) return '';
  return String(val)
    .trim()
    .replace(/[\u06F0-\u06F9]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728))
    .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584));
}

/**
 * تبدیل دقیق تاریخ خورشیدی (جلالی) به میلادی
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const res = Utils.toGregorian(jy, jm, jd);
  return { gy: res.year, gm: res.month, gd: res.date };
}

/**
 * تبدیل دقیق تاریخ میلادی به خورشیدی (جلالی)
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const res = Utils.toJalali(gy, gm, gd);
  return { jy: res.year, jm: res.month, jd: res.date };
}

/**
 * اعتبارسنجی تقویمی و تولید شیء تاریخ
 */
function createValidatedDate(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  strict: boolean = true
): Date | null {
  if (month < 1 || month > 12) {
    if (strict) throw new Error(`ماه تاریخ نامعتبر است (${month}). مقدار باید بین ۱ تا ۱۲ باشد.`);
    return null;
  }
  if (day < 1 || day > 31) {
    if (strict) throw new Error(`روز تاریخ نامعتبر است (${day}). مقدار باید بین ۱ تا ۳۱ باشد.`);
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    if (strict) throw new Error(`زمان نامعتبر است (${hour}:${minute}:${second}).`);
    return null;
  }

  if (year >= 1300 && year <= 1500) {
    const maxDays = Utils.monthLength(year, month);
    if (day > maxDays) {
      if (strict) {
        throw new Error(
          `روز تاریخ برای ماه ${month} در سال ${year} نامعتبر است (${day}). این ماه حداکثر ${maxDays} روز دارد.`
        );
      }
      return null;
    }
    const g = jalaliToGregorian(year, month, day);
    const d = new Date(g.gy, g.gm - 1, g.gd, hour, minute, second);
    if (isNaN(d.getTime())) {
      if (strict) throw new Error(`تبدیل تاریخ خورشیدی به میلادی ناموفق بود (${year}/${month}/${day}).`);
      return null;
    }
    return d;
  } else if (year >= 1900 && year <= 2150) {
    const d = new Date(year, month - 1, day, hour, minute, second);
    // در جاوااسکریپت، روزهای نامعتبر مثل 2024-02-30 به ماه بعد سرریز می‌شوند (overflow).
    // بررسی تطبیق سال، ماه و روز برای جلوگیری از سرریز بی‌صدا ضروری است.
    if (
      isNaN(d.getTime()) ||
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      if (strict) throw new Error(`تاریخ میلادی نامعتبر است (${year}-${month}-${day}).`);
      return null;
    }
    return d;
  } else {
    if (strict) {
      throw new Error(`سال خارج از محدوده مجاز سامانه است (${year}). دامنه‌های معتبر: ۱۳۰۰ تا ۱۵۰۰ خورشیدی یا ۱۹۰۰ تا ۲۱۵۰ میلادی.`);
    }
    return null;
  }
}

/**
 * مسیر کمکی هوشمند ارقام (Fallback Engine)
 */
function parseDigitsFallback(cleanedStr: string, strict: boolean): Date | null {
  // نکته ۳: پر کردن قطعات تک‌رقمی با صفر در صورت وجود جداکننده (مانند 1403/5/8 -> 14030508)
  const tokens = cleanedStr.split(RE_SEPARATORS).filter(t => t.length > 0);
  let digits = '';

  if (tokens.length >= 3) {
    const yToken = tokens[0];
    const mToken = tokens[1].padStart(2, '0');
    const dToken = tokens[2].padStart(2, '0');
    const timeTokens = tokens.slice(3).map(t => t.padStart(2, '0'));
    digits = yToken + mToken + dToken + timeTokens.join('');
  } else {
    digits = cleanedStr.replace(/\D/g, '');
  }

  const numLen = digits.length;
  let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;

  if (numLen === 6) {
    // نکته ۱: سال دو رقمی با قاعده آستانه محوری ۵۰ (Pivot=50)
    const yy = parseInt(digits.slice(0, 2), 10);
    const century = yy >= 50 ? 13 : 14;
    year = century * 100 + yy;
    month = parseInt(digits.slice(2, 4), 10);
    day = parseInt(digits.slice(4, 6), 10);
  } else if (numLen === 8) {
    // ۸ رقم: YYYYMMDD
    year = parseInt(digits.slice(0, 4), 10);
    month = parseInt(digits.slice(4, 6), 10);
    day = parseInt(digits.slice(6, 8), 10);
  } else if (numLen === 12) {
    // ۱۲ رقم: YYYYMMDDHHmm
    year = parseInt(digits.slice(0, 4), 10);
    month = parseInt(digits.slice(4, 6), 10);
    day = parseInt(digits.slice(6, 8), 10);
    hour = parseInt(digits.slice(8, 10), 10);
    minute = parseInt(digits.slice(10, 12), 10);
  } else if (numLen === 14) {
    // ۱۴ رقم: YYYYMMDDHHmmss
    year = parseInt(digits.slice(0, 4), 10);
    month = parseInt(digits.slice(4, 6), 10);
    day = parseInt(digits.slice(6, 8), 10);
    hour = parseInt(digits.slice(8, 10), 10);
    minute = parseInt(digits.slice(10, 12), 10);
    second = parseInt(digits.slice(12, 14), 10);
  } else {
    if (strict) {
      throw new Error(
        `تعداد ارقام ورودی تاریخ نامعتبر است (${numLen} رقم برای ورودی '${cleanedStr}'). ` +
        `طول‌های مجاز: ۶ رقم (سال دو رقمی)، ۸ رقم (تاریخ)، ۱۲ یا ۱۴ رقم (تاریخ و زمان).`
      );
    }
    return null;
  }

  return createValidatedDate(year, month, day, hour, minute, second, strict);
}

/**
 * تابع سراسری و هوشمند تحلیل، اعتبارسنجی و تبدیل تاریخ در کلاینت (Fast-Path + Fallback)
 */
export function parseSmartDate(val: any, options?: DateParseOptions): Date | null {
  const strict = options?.strict ?? true;

  if (val === null || val === undefined) {
    return null;
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? (strict ? (() => { throw new Error('تاریخ نامعتبر است.'); })() : null) : val;
  }

  const rawStr = String(val).trim();
  if (!rawStr) {
    return null;
  }

  // ۱. مسیر سریع (Fast-Path): ارزیابی مستقیم فرمت‌های استاندارد انگلیسی
  const match = RE_STANDARD_DATE.exec(rawStr);
  if (match) {
    try {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const hh = match[4] ? parseInt(match[4], 10) : 0;
      const mm = match[5] ? parseInt(match[5], 10) : 0;
      const ss = match[6] ? parseInt(match[6], 10) : 0;

      const dateObj = createValidatedDate(y, m, d, hh, mm, ss, strict);
      if (dateObj) return dateObj;
    } catch (e) {
      // در صورت شکست مسیر سریع، پردازش به مسیر کمکی واگذار می‌شود
    }
  }

  // ۲. مسیر کمکی هوشمند (Fallback Engine): نرمال‌سازی ارقام فارسی/عربی و استخراج
  const cleanedStr = normalizeDigits(rawStr);
  return parseDigitsFallback(cleanedStr, strict);
}

/**
 * فرمت‌دهی شیء تاریخ یا رشته به خروجی استاندارد خورشیدی اسلش‌دار (YYYY/MM/DD یا YYYY/MM/DD HH:mm:ss)
 */
export function formatToStandardShamsi(val: Date | string | null | undefined, includeTime: boolean = false): string {
  if (!val) return '';

  let d: Date | null = null;
  if (val instanceof Date) {
    d = val;
  } else {
    d = parseSmartDate(val, { strict: false });
  }

  if (!d || isNaN(d.getTime())) return '';

  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const datePart = `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;

  if (includeTime) {
    const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${datePart} ${timePart}`;
  }
  return datePart;
}
