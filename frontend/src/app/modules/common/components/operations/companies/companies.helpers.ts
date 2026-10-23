import { normalizeDigits } from '../../../../../core/utils/date-utils';

/**
 * توابع خالص هستهٔ شرکت‌ها (D6). نسخه‌های بانک، هیئت‌مدیره، مدارک و دوره‌های مالی
 * در کامپوننت‌های ماژول حسابداری (`companies-studio/`) هستند.
 */

/** چکسام شناسهٔ ملی ۱۱ رقمی اشخاص حقوقی؛ خالی معتبر است */
export function isNationalIdChecksumValid(id?: string | null): boolean {
  if (!id) return true;
  const clean = id.replace(/[^0-9]/g, '');
  if (clean.length !== 11) return false;
  const checkDigit = parseInt(clean[10], 10);
  const tens = parseInt(clean[9], 10) + 2;
  const multipliers = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += (parseInt(clean[i], 10) + tens) * multipliers[i];
  }
  const remainder = sum % 11;
  const calculated = remainder === 10 ? 0 : remainder;
  return calculated === checkDigit;
}

/** بدنهٔ ذخیرهٔ شرکت از دادهٔ فرم؛ شناسه‌ها و کدها با رقم لاتین (normalizeDigits) */
export function buildCompanyPayload(d: any) {
  const text = (v: string | null | undefined) => normalizeDigits(v || '') || null;
  return {
    code: d.code.trim().toUpperCase(),
    name: d.name.trim(),
    company_type: d.company_type || 'private_joint_stock',
    national_id: text(d.national_id),
    economic_code: text(d.economic_code),
    registration_number: text(d.registration_number),
    registration_date: d.registration_date || null,
    registered_capital: d.registered_capital || null,
    shares_count: d.shares_count || null,
    share_nominal_value: d.share_nominal_value || null,
    fiscal_year_start_month: Number(d.fiscal_year_start_month) || 1,
    phone: text(d.phone),
    address: d.address?.trim() || null,
    postal_code: text(d.postal_code),
    ceo_name: d.ceo_name?.trim() || null,
    board_chairman: d.board_chairman?.trim() || null,
    board_vice_chairman: d.board_vice_chairman?.trim() || null,
    main_inspector: d.main_inspector?.trim() || null,
    alternate_inspector: d.alternate_inspector?.trim() || null,
    authorized_signers: d.authorized_signers?.trim() || null,
    board_term_expiry: d.board_term_expiry || null,
    workshop_code: text(d.workshop_code),
    social_security_branch_code: text(d.social_security_branch_code),
    social_security_branch_name: d.social_security_branch_name?.trim() || null,
    contract_row: text(d.contract_row),
    employer_name: d.employer_name?.trim() || null,
    tax_memory_id: text(d.tax_memory_id),
    tax_economic_code: text(d.tax_economic_code),
    primary_bank_name: d.primary_bank_name?.trim() || null,
    primary_account_number: d.primary_account_number?.trim() || null,
    primary_iban: d.primary_iban?.trim() || null,
    is_active: d.is_active,
    has_warehouse_module: d.has_warehouse_module
  };
}
