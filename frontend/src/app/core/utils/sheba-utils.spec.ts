import { describe, it, expect } from 'vitest';
import {
  IRANIAN_BANKS,
  validateSheba,
  getBankFromSheba,
  getBankByName,
  formatShebaDisplay,
  cleanShebaInput,
  extractShebaDigits,
  formatShebaDigitsDisplay,
  extractAccountNumberFromSheba,
  generateShebaFromAccount,
  validateAccountNumber
} from './sheba-utils';

describe('ShebaUtils - Iranian IBAN Validator & Bank Directory', () => {
  it('should validate account number and reject zeros or short strings', () => {
    expect(validateAccountNumber('0').isValid).toBe(false);
    expect(validateAccountNumber('00000000').isValid).toBe(false);
    expect(validateAccountNumber('12').isValid).toBe(false);
    expect(validateAccountNumber('').isValid).toBe(false);
    
    expect(validateAccountNumber('101111111001').isValid).toBe(true);
    expect(validateAccountNumber('12345').isValid).toBe(true);

    // generateShebaFromAccount must return empty string for 0
    expect(generateShebaFromAccount('017', '0')).toBe('');
    expect(generateShebaFromAccount('017', '0000000')).toBe('');
  });

  it('should reject all-zero account numbers in validateSheba', () => {
    // Sheba with 000000000000000000 account number
    const zeroSheba = 'IR260700000000000000000000';
    const res = validateSheba(zeroSheba);
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('صفر');
  });
  it('should generate a valid Sheba from Bank Code/Name and Account Number', () => {
    const sheba = generateShebaFromAccount('017', '101111111001');
    expect(sheba).toBeTruthy();
    expect(sheba.startsWith('IR')).toBe(true);

    const validation = validateSheba(sheba);
    expect(validation.isValid).toBe(true);
    expect(validation.bank?.name).toBe('بانک ملی ایران');
    expect(validation.accountNumber).toBe('101111111001');

    // Test with Bank Name string
    const tejaratSheba = generateShebaFromAccount('بانک تجارت', '801458494059');
    expect(tejaratSheba).toBeTruthy();
    const valTejarat = validateSheba(tejaratSheba);
    expect(valTejarat.isValid).toBe(true);
    expect(valTejarat.bank?.name).toBe('بانک تجارت');
  });
  it('should contain 32 official Iranian banks', () => {
    expect(IRANIAN_BANKS.length).toBeGreaterThanOrEqual(30);
    const melli = IRANIAN_BANKS.find(b => b.code === '017');
    expect(melli).toBeDefined();
    expect(melli?.name).toBe('بانک ملی ایران');

    const mellat = IRANIAN_BANKS.find(b => b.code === '012');
    expect(mellat).toBeDefined();
    expect(mellat?.name).toBe('بانک ملت');
  });

  it('should extract purely digits from messy pasted strings with Persian, English, and symbols', () => {
    const messyPasted = 'I090ث180ل0یی000080145$849405ق957';
    const digits = extractShebaDigits(messyPasted);
    expect(digits).toBe('090180000008014584940595');
    expect(digits.length).toBe(24);
  });

  it('should clean and normalize Persian and Arabic digits', () => {
    const persianSheba = 'IR۱۲ ۰۱۷۰ ۰۰۰۰ ۰۰۱۰ ۱۱۱۱ ۱۱۱۰ ۰۱';
    const cleaned = cleanShebaInput(persianSheba);
    expect(cleaned).toBe('IR120170000000101111111001');
  });

  it('should automatically prepend IR if digits are provided', () => {
    const digitsOnly = '120170000000101111111001';
    const cleaned = cleanShebaInput(digitsOnly);
    expect(cleaned).toBe('IR120170000000101111111001');
  });

  it('should identify bank correctly from 3-digit Sheba bank code', () => {
    const melliSheba = 'IR120170000000101111111001';
    const bank = getBankFromSheba(melliSheba);
    expect(bank).toBeDefined();
    expect(bank?.code).toBe('017');
    expect(bank?.name).toBe('بانک ملی ایران');

    const tejaratSheba = 'IR180180000000102222222002';
    const tejaratBank = getBankFromSheba(tejaratSheba);
    expect(tejaratBank?.code).toBe('018');
    expect(tejaratBank?.name).toBe('بانک تجارت');
  });

  it('should extract account number from Sheba correctly without leading zeros', () => {
    const raw = 'IR120170000000101111111001';
    const acc = extractAccountNumberFromSheba(raw);
    expect(acc).toBe('101111111001');

    const res = validateSheba(raw);
    expect(res.accountNumber).toBe('101111111001');
  });

  it('should format Sheba into 4-character separated blocks', () => {
    const raw = '120170000000101111111001';
    const formatted = formatShebaDigitsDisplay(raw);
    expect(formatted).toBe('12 0170 0000 0010 1111 1110 01');
  });

  it('should validate a valid Iranian Sheba mathematically using ISO 7064 Mod 97', () => {
    // Generate mathematically valid Sheba: Bank Tejarat 018
    const payload = '0180000000801458494059182700';
    const rem = Number(BigInt(payload) % 97n);
    const checkDigits = (98 - rem).toString().padStart(2, '0');
    const validDigits = `${checkDigits}0180000000801458494059`;

    const res = validateSheba(validDigits);
    expect(res.isValid).toBe(true);
    expect(res.errorMessage).toBeNull();
    expect(res.bank?.code).toBe('018');
    expect(res.bank?.name).toBe('بانک تجارت');
    expect(res.rawSheba).toBe('IR' + validDigits);
  });

  it('should reject invalid Sheba numbers with bad checksum or length', () => {
    const invalidChecksum = '000170000000101111111001';
    const res1 = validateSheba(invalidChecksum);
    expect(res1.isValid).toBe(false);

    const tooShort = '120170000123';
    const res2 = validateSheba(tooShort);
    expect(res2.isValid).toBe(false);
    expect(res2.errorMessage).toContain('ناقص');
  });
});
