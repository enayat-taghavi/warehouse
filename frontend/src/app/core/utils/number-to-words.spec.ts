import { describe, it, expect } from 'vitest';
import {
  numberToPersianWords,
  rialToPersianWords,
  tomanToPersianWords,
  normalizeNumberInput,
} from './number-to-words';

describe('numberToPersianWords - Central Engine Spec', () => {
  describe('normalizeNumberInput', () => {
    it('normalizes english, persian and arabic digits with commas', () => {
      expect(normalizeNumberInput('۱,۲۵۰,۰۰۰')).toBe('1250000');
      expect(normalizeNumberInput('١٢٣٤٥٦')).toBe('123456');
      expect(normalizeNumberInput('10_000_000')).toBe('10000000');
      expect(normalizeNumberInput(' 500,000 ')).toBe('500000');
      expect(normalizeNumberInput(null)).toBe('');
      expect(normalizeNumberInput(undefined)).toBe('');
    });
  });

  describe('Basic Numbers & Scales', () => {
    it('handles zero correctly', () => {
      expect(numberToPersianWords(0)).toBe('صفر');
      expect(numberToPersianWords('0')).toBe('صفر');
      expect(numberToPersianWords('۰۰۰')).toBe('صفر');
      expect(numberToPersianWords(0, { unit: 'ریال' })).toBe('صفر ریال');
      expect(numberToPersianWords(0, { unit: 'ریال', includeUnitForZero: false })).toBe('صفر');
    });

    it('converts single digits (1-9)', () => {
      expect(numberToPersianWords(1)).toBe('یک');
      expect(numberToPersianWords(2)).toBe('دو');
      expect(numberToPersianWords(5)).toBe('پنج');
      expect(numberToPersianWords(9)).toBe('نه');
    });

    it('converts teens (10-19)', () => {
      expect(numberToPersianWords(10)).toBe('ده');
      expect(numberToPersianWords(11)).toBe('یازده');
      expect(numberToPersianWords(15)).toBe('پانزده');
      expect(numberToPersianWords(19)).toBe('نوزده');
    });

    it('converts tens (20-99)', () => {
      expect(numberToPersianWords(20)).toBe('بیست');
      expect(numberToPersianWords(25)).toBe('بیست و پنج');
      expect(numberToPersianWords(78)).toBe('هفتاد و هشت');
      expect(numberToPersianWords(99)).toBe('نود و نه');
    });

    it('converts hundreds (100-999)', () => {
      expect(numberToPersianWords(100)).toBe('یکصد');
      expect(numberToPersianWords(101)).toBe('یکصد و یک');
      expect(numberToPersianWords(110)).toBe('یکصد و ده');
      expect(numberToPersianWords(115)).toBe('یکصد و پانزده');
      expect(numberToPersianWords(200)).toBe('دویست');
      expect(numberToPersianWords(350)).toBe('سیصد و پنجاه');
      expect(numberToPersianWords(999)).toBe('نهصد و نود و نه');
    });

    it('converts thousands (1,000 - 999,999)', () => {
      expect(numberToPersianWords(1000)).toBe('یک هزار');
      expect(numberToPersianWords(1001)).toBe('یک هزار و یک');
      expect(numberToPersianWords(1250)).toBe('یک هزار و دویست و پنجاه');
      expect(numberToPersianWords(20000)).toBe('بیست هزار');
      expect(numberToPersianWords(100000)).toBe('یکصد هزار');
      expect(numberToPersianWords(999999)).toBe('نهصد و نود و نه هزار و نهصد و نود و نه');
    });

    it('converts millions and billions', () => {
      expect(numberToPersianWords(1000000)).toBe('یک میلیون');
      expect(numberToPersianWords(12500000)).toBe('دوازده میلیون و پانصد هزار');
      expect(numberToPersianWords(1000000000)).toBe('یک میلیارد');
      expect(numberToPersianWords(53400000000)).toBe('پنجاه و سه میلیارد و چهارصد میلیون');
    });

    it('converts trillions and beyond without precision loss', () => {
      expect(numberToPersianWords('1000000000000')).toBe('یک تریلیون');
      expect(numberToPersianWords('123456789012')).toBe(
        'یکصد و بیست و سه میلیارد و چهارصد و پنجاه و شش میلیون و هفتصد و هشتاد و نه هزار و دوازده'
      );
    });

    it('handles negative numbers', () => {
      expect(numberToPersianWords(-500)).toBe('منفی پانصد');
      expect(numberToPersianWords('-1250000')).toBe('منفی یک میلیون و دویست و پنجاه هزار');
    });

    it('handles decimal numbers', () => {
      expect(numberToPersianWords('12.5')).toBe('دوازده و پنج دهم');
      expect(numberToPersianWords('0.75')).toBe('هفتاد و پنج صدم');
      expect(numberToPersianWords('100.005')).toBe('یکصد و پنج هزارم');
    });
  });

  describe('Financial Units & Shortcuts', () => {
    it('appends rial unit', () => {
      expect(numberToPersianWords(12500000, { unit: 'rial' })).toBe('دوازده میلیون و پانصد هزار ریال');
      expect(numberToPersianWords('2500000', { unit: 'ریال' })).toBe('دو میلیون و پانصد هزار ریال');
    });

    it('appends toman unit', () => {
      expect(tomanToPersianWords(1250000)).toBe('یک میلیون و دویست و پنجاه هزار تومان');
    });

    it('calculates and appends toman equivalent when requested for rials', () => {
      expect(
        numberToPersianWords(12500000, {
          unit: 'rial',
          showTomanEquivalent: true,
        })
      ).toBe('دوازده میلیون و پانصد هزار ریال (معادل یک میلیون و دویست و پنجاه هزار تومان)');

      expect(rialToPersianWords('50000000', true)).toBe(
        'پنجاه میلیون ریال (معادل پنج میلیون تومان)'
      );
    });

    it('handles invalid inputs gracefully without error', () => {
      expect(numberToPersianWords('')).toBe('');
      expect(numberToPersianWords(null)).toBe('');
      expect(numberToPersianWords(undefined)).toBe('');
      expect(numberToPersianWords('abc')).toBe('');
      expect(numberToPersianWords('12a34')).toBe('');
    });
  });
});
