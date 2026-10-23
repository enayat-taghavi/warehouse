import { describe, it, expect } from 'vitest';
import {
  parseSmartDate,
  formatToStandardShamsi,
  normalizeDigits,
  jalaliToGregorian,
  gregorianToJalali
} from './date-utils';

describe('DateUtils Comprehensive Tests (Dual-Path Date Parser Engine)', () => {

  describe('Fast-Path standard parsing', () => {
    it('should parse standard Shamsi date with slash', () => {
      const d = parseSmartDate('1403/05/12');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7); // August (0-indexed)
      expect(d!.getDate()).toBe(2);
    });

    it('should parse standard Shamsi date with dash', () => {
      const d = parseSmartDate('1403-05-12');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });

    it('should parse standard Gregorian date', () => {
      const d = parseSmartDate('2024-08-02');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });

    it('should parse standard date with time', () => {
      const d = parseSmartDate('1403/05/12 14:30:45');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(14);
      expect(d!.getMinutes()).toBe(30);
      expect(d!.getSeconds()).toBe(45);
    });

    it('should return the same date when Date instance passed', () => {
      const now = new Date(2024, 7, 2);
      expect(parseSmartDate(now)).toBe(now);
    });
  });

  describe('Point 1: Variable lengths and Century Pivot (50)', () => {
    it('should map YY >= 50 to 13YY (e.g. 930520 -> 1393/05/20)', () => {
      const d = parseSmartDate('930520');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2014);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(11);
    });

    it('should map YY < 50 to 14YY (e.g. 030520 -> 1403/05/20)', () => {
      const d = parseSmartDate('030520');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(10);
    });

    it('should parse 8 digits without separators (14030512)', () => {
      const d = parseSmartDate('14030512');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });

    it('should parse 12 digits (YYYYMMDDHHmm)', () => {
      const d = parseSmartDate('140305121430');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(14);
      expect(d!.getMinutes()).toBe(30);
      expect(d!.getSeconds()).toBe(0);
    });

    it('should parse 14 digits (YYYYMMDDHHmmss)', () => {
      const d = parseSmartDate('14030512143045');
      expect(d).not.toBeNull();
      expect(d!.getHours()).toBe(14);
      expect(d!.getMinutes()).toBe(30);
      expect(d!.getSeconds()).toBe(45);
    });
  });

  describe('Point 2: Persian and Arabic numerals', () => {
    it('should parse Persian numerals with slash (۱۴۰۳/۰۵/۱۲)', () => {
      const d = parseSmartDate('۱۴۰۳/۰۵/۱۲');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });

    it('should parse continuous Persian numerals (۱۴۰۳۰۵۱۲)', () => {
      const d = parseSmartDate('۱۴۰۳۰۵۱۲');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });

    it('should parse Persian 2-digit year (۹۳۰۵۲۰)', () => {
      const d = parseSmartDate('۹۳۰۵۲۰');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2014);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(11);
    });

    it('should parse Arabic numerals (١٤٠٣/٠٥/١٢)', () => {
      const d = parseSmartDate('١٤٠٣/٠٥/١٢');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(7);
      expect(d!.getDate()).toBe(2);
    });
  });

  describe('Point 3: Token-padding for single-digit month and day', () => {
    it('should pad single digits with slash (1403/5/8 -> 1403/05/08)', () => {
      const d = parseSmartDate('1403/5/8');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(6); // July
      expect(d!.getDate()).toBe(29);
    });

    it('should pad single digits with dash (1403-5-8)', () => {
      const d = parseSmartDate('1403-5-8');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(6);
      expect(d!.getDate()).toBe(29);
    });

    it('should pad single digits with dot (1403.5.8)', () => {
      const d = parseSmartDate('1403.5.8');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(6);
      expect(d!.getDate()).toBe(29);
    });

    it('should pad single digits with space (1403 5 8)', () => {
      const d = parseSmartDate('1403 5 8');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(6);
      expect(d!.getDate()).toBe(29);
    });

    it('should pad Persian single digits (۱۴۰۳/۵/۸)', () => {
      const d = parseSmartDate('۱۴۰۳/۵/۸');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2024);
      expect(d!.getMonth()).toBe(6);
      expect(d!.getDate()).toBe(29);
    });
  });

  describe('Point 4 & Strict error handling', () => {
    it('should throw on invalid month in strict mode', () => {
      expect(() => parseSmartDate('1403/13/10', { strict: true })).toThrow();
      expect(() => parseSmartDate('14031310', { strict: true })).toThrow();
    });

    it('should throw on invalid day in strict mode', () => {
      expect(() => parseSmartDate('1403/05/35', { strict: true })).toThrow();
      expect(() => parseSmartDate('14030535', { strict: true })).toThrow();
    });

    it('should throw on invalid day exceeding month length (no silent overflow)', () => {
      // مهر ۳۰ روزه است؛ روز ۳۱ نباید بی‌صدا به ۱ آبان سرریز شود
      expect(() => parseSmartDate('1403/07/31', { strict: true })).toThrow();
      expect(parseSmartDate('1403/07/31', { strict: false })).toBeNull();

      // اسفند سال کبیسه ۱۴۰۳ حداکثر ۳۰ روز است؛ روز ۳۱ نامعتبر است
      expect(() => parseSmartDate('1403/12/31', { strict: true })).toThrow();

      // اسفند سال عادی ۱۴۰۴ حداکثر ۲۹ روز است؛ روز ۳۰ نامعتبر است
      expect(() => parseSmartDate('1404/12/30', { strict: true })).toThrow();
      expect(parseSmartDate('1404/12/30', { strict: false })).toBeNull();

      // میلادی: ۳۰ فوریه در سال کبیسه ۲۰۲۴ وجود ندارد
      expect(() => parseSmartDate('2024-02-30', { strict: true })).toThrow();

      // میلادی: ۲۹ فوریه در سال غیرکبیسه ۲۰۲۳ وجود ندارد
      expect(() => parseSmartDate('2023-02-29', { strict: true })).toThrow();
    });

    it('should correctly accept valid month boundary days', () => {
      // روز ۳۰ مهر معتبر است
      const mehr30 = parseSmartDate('1403/07/30');
      expect(mehr30).not.toBeNull();

      // روز ۳۰ اسفند سال کبیسه ۱۴۰۳ معتبر است
      const esfand30Leap = parseSmartDate('1403/12/30');
      expect(esfand30Leap).not.toBeNull();

      // روز ۲۹ اسفند سال عادی ۱۴۰۴ معتبر است
      const esfand29Normal = parseSmartDate('1404/12/29');
      expect(esfand29Normal).not.toBeNull();

      // ۲۹ فوریه سال کبیسه ۲۰۲۴ معتبر است
      const feb29Leap = parseSmartDate('2024-02-29');
      expect(feb29Leap).not.toBeNull();
    });

    it('should throw on invalid length (e.g. 7 digits)', () => {
      expect(() => parseSmartDate('1403051', { strict: true })).toThrow();
    });

    it('should throw on random text', () => {
      expect(() => parseSmartDate('invalid_text', { strict: true })).toThrow();
    });

    it('should return null in strict: false mode for invalid inputs', () => {
      expect(parseSmartDate('1403/13/10', { strict: false })).toBeNull();
      expect(parseSmartDate('14030535', { strict: false })).toBeNull();
      expect(parseSmartDate('1403/07/31', { strict: false })).toBeNull();
      expect(parseSmartDate('invalid_text', { strict: false })).toBeNull();
      expect(parseSmartDate(null, { strict: false })).toBeNull();
      expect(parseSmartDate('', { strict: false })).toBeNull();
    });
  });

  describe('formatToStandardShamsi', () => {
    it('should format Date to standard Shamsi YYYY/MM/DD', () => {
      const d = new Date(2024, 7, 2);
      expect(formatToStandardShamsi(d)).toBe('1403/05/12');
    });

    it('should format Date with time to YYYY/MM/DD HH:mm:ss', () => {
      const d = new Date(2024, 7, 2, 14, 30, 45);
      expect(formatToStandardShamsi(d, true)).toBe('1403/05/12 14:30:45');
    });

    it('should format string input directly', () => {
      expect(formatToStandardShamsi('14030512')).toBe('1403/05/12');
      expect(formatToStandardShamsi('930520')).toBe('1393/05/20');
    });
  });
});
