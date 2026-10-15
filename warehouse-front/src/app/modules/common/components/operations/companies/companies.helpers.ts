import { CompanyDocument, CompanyDocumentType, Company } from '../../../../../core/models/company.model';
import { IRANIAN_BANKS } from '../../../../../core/utils/sheba-utils';

export const COMPANY_DOCUMENT_TYPES_LIST: { value: CompanyDocumentType; label: string }[] = [
  { value: 'statute', label: 'اساسنامه شرکت' },
  { value: 'establishment_gazette', label: 'روزنامه رسمی تأسیس' },
  { value: 'changes_gazette', label: 'روزنامه رسمی آخرین تغییرات هیئت‌مدیره' },
  { value: 'auditors_gazette', label: 'روزنامه رسمی تمدید بازرسان' },
  { value: 'capital_gazette', label: 'روزنامه رسمی تغییرات سرمایه و آدرس' },
  { value: 'vat_certificate', label: 'گواهی ثبت‌نام ارزش افزوده' },
  { value: 'tax_clearance', label: 'مفاصاحساب مالیاتی / بیمه‌ای' },
  { value: 'commercial_card', label: 'کارت بازرگانی' },
  { value: 'contractor_qualification', label: 'گواهی رتبه‌بندی / صلاحیت پیمانکاری (ساجار)' },
  { value: 'labor_safety_certificate', label: 'گواهی صلاحیت ایمنی پیمانکاران (اداره کار)' },
  { value: 'operating_license', label: 'پروانه بهره‌برداری / جواز فعالیت' },
  { value: 'lease_contract', label: 'سند مالکیت / اجاره‌نامه رسمی' },
  { value: 'master_agreement', label: 'قرارداد مادر یا تفاهم‌نامه' },
  { value: 'other', label: 'سایر مدارک و اسناد رسمی' },
];

export function getFiscalPeriodStatusBadge(status?: string): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'frozen':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'closed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function getFiscalPeriodStatusLabel(status?: string): string {
  switch (status) {
    case 'open':
      return 'جاری و باز';
    case 'frozen':
      return 'منجمد شده';
    case 'closed':
      return 'بسته شده رسمی';
    default:
      return status || '—';
  }
}

export function getEmptyFiscalPeriodData() {
  return {
    fiscal_year: '',
    title: '',
    start_date: '',
    end_date: '',
    notes: ''
  };
}

export function getEmptyBankAccountData() {
  return {
    id: undefined as number | undefined,
    bank_name: '',
    account_number: '',
    sheba_number: '',
    account_title: '',
    is_primary: false
  };
}

export function getEmptyBoardMemberData() {
  return {
    first_name: '',
    last_name: '',
    national_code: '',
    member_type: 'real' as any,
    represented_legal_name: '',
    role: 'board_member' as any,
    has_signature_right: false,
    signature_scope: '',
    term_start: '',
    term_expiry: '',
    is_active: true
  };
}

export function getEmptyDocData() {
  return {
    title: '',
    document_type: 'statute' as CompanyDocumentType,
    description: '',
    issue_date: '',
    expiry_date: '',
    file: null as File | null,
  };
}

export function getDocStatusClass(docOrStatus?: CompanyDocument | string): string {
  const status = typeof docOrStatus === 'string' ? docOrStatus : docOrStatus?.expiry_status;
  switch (status) {
    case 'valid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'expiring_soon': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'expired': return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function getDocStatusLabel(docOrStatus?: CompanyDocument | string): string {
  const status = typeof docOrStatus === 'string' ? docOrStatus : docOrStatus?.expiry_status;
  switch (status) {
    case 'valid': return 'معتبر';
    case 'expiring_soon': return 'نزدیک انقضا';
    case 'expired': return 'منقضی شده';
    default: return 'بدون سررسید';
  }
}

export function filterCompanyDocuments(docs: CompanyDocument[], searchQuery: string, docTypeFilter: string): CompanyDocument[] {
  let filtered = [...docs];
  if (docTypeFilter) {
    filtered = filtered.filter(d => d.document_type === docTypeFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(d =>
      (d.title && d.title.toLowerCase().includes(q)) ||
      (d.description && d.description.toLowerCase().includes(q)) ||
      (d.document_type_display && d.document_type_display.toLowerCase().includes(q))
    );
  }
  return filtered;
}

export function filterIranianBanksList(query: string) {
  if (!query || !query.trim()) {
    return [...IRANIAN_BANKS];
  }
  const q = query.trim().toLowerCase();
  return IRANIAN_BANKS.filter(
    b => b.name.toLowerCase().includes(q) || b.code.includes(q)
  );
}

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

export function validateNationalCode(code?: string | null): boolean {
  if (!code) return true;
  let clean = code.replace(/[^0-9]/g, '');
  if (clean.length > 0 && clean.length < 10) {
    clean = clean.padStart(10, '0');
  }
  if (clean.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(clean)) return false;
  const digits = clean.split('').map(Number);
  const checksum = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const remainder = sum % 11;
  return (remainder < 2 && checksum === remainder) || (remainder >= 2 && checksum === 11 - remainder);
}

export function buildCompanyPayload(d: any) {
  return {
    code: d.code?.trim().toUpperCase(),
    name: d.name?.trim(),
    company_type: d.company_type || 'private_joint_stock',
    national_id: d.national_id?.trim() || null,
    economic_code: d.economic_code?.trim() || null,
    registration_number: d.registration_number?.trim() || null,
    registration_date: d.registration_date || null,
    registered_capital: d.registered_capital || null,
    shares_count: d.shares_count || null,
    share_nominal_value: d.share_nominal_value || null,
    fiscal_year_start_month: Number(d.fiscal_year_start_month) || 1,
    phone: d.phone?.trim() || null,
    address: d.address?.trim() || null,
    postal_code: d.postal_code?.trim() || null,
    ceo_name: d.ceo_name?.trim() || null,
    board_chairman: d.board_chairman?.trim() || null,
    board_vice_chairman: d.board_vice_chairman?.trim() || null,
    main_inspector: d.main_inspector?.trim() || null,
    alternate_inspector: d.alternate_inspector?.trim() || null,
    authorized_signers: d.authorized_signers?.trim() || null,
    board_term_expiry: d.board_term_expiry || null,
    workshop_code: d.workshop_code?.trim() || null,
    social_security_branch_code: d.social_security_branch_code?.trim() || null,
    social_security_branch_name: d.social_security_branch_name?.trim() || null,
    contract_row: d.contract_row?.trim() || null,
    employer_name: d.employer_name?.trim() || null,
    tax_memory_id: d.tax_memory_id?.trim() || null,
    tax_economic_code: d.tax_economic_code?.trim() || null,
    primary_bank_name: d.primary_bank_name?.trim() || null,
    primary_account_number: d.primary_account_number?.trim() || null,
    primary_iban: d.primary_iban?.trim() || null,
    is_active: d.is_active,
    has_warehouse_module: d.has_warehouse_module
  };
}
