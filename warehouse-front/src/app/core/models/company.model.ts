export type CompanyDocumentType =
  | 'statute'
  | 'establishment_gazette'
  | 'changes_gazette'
  | 'auditors_gazette'
  | 'capital_gazette'
  | 'vat_certificate'
  | 'tax_clearance'
  | 'commercial_card'
  | 'contractor_qualification'
  | 'labor_safety_certificate'
  | 'operating_license'
  | 'lease_contract'
  | 'master_agreement'
  | 'other';

export interface CompanyDocument {
  id: number;
  company: number;
  company_name?: string;
  document_type: CompanyDocumentType;
  document_type_display?: string;
  title: string;
  file: string;
  file_url?: string;
  file_size: number;
  issue_date?: string | null;
  expiry_date?: string | null;
  expiry_status?: 'permanent' | 'expired' | 'expiring_soon' | 'valid';
  days_until_expiry?: number | null;
  is_confidential: boolean;
  version?: number;
  is_superseded?: boolean;
  description?: string | null;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpiringDocumentsResponse {
  count: number;
  results: CompanyDocument[];
}

export type CompanyBoardMemberRole =
  | 'chairman'
  | 'vice_chairman'
  | 'board_member'
  | 'managing_director'
  | 'managing_director_and_member'
  | 'main_inspector'
  | 'alternate_inspector'
  | 'secretary'
  | 'other';

export type CompanyBoardMemberType = 'real' | 'legal_rep';

export interface CompanyBoardMember {
  id?: number;
  company: number;
  company_name?: string;
  first_name: string;
  last_name: string;
  national_code: string;
  member_type: CompanyBoardMemberType;
  member_type_display?: string;
  represented_legal_name?: string | null;
  role: CompanyBoardMemberRole;
  role_display?: string;
  has_signature_right: boolean;
  signature_scope?: string | null;
  term_start?: string | null;
  term_expiry?: string | null;
  attached_id_doc?: File | string | null;
  attached_appointment_doc?: File | string | null;
  attached_id_doc_url?: string | null;
  attached_appointment_doc_url?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Company {
  id: number;
  code: string;
  name: string;
  company_type?: string;
  national_id?: string | null;
  economic_code?: string | null;
  registration_number?: string | null;
  registration_date?: string | null;
  registered_capital?: number | null;
  shares_count?: number | null;
  share_nominal_value?: number | null;
  fiscal_year_start_month?: number;
  phone?: string | null;
  address?: string | null;
  postal_code?: string | null;
  ceo_name?: string | null;
  board_chairman?: string | null;
  board_vice_chairman?: string | null;
  main_inspector?: string | null;
  alternate_inspector?: string | null;
  authorized_signers?: string | null;
  board_term_expiry?: string | null;
  workshop_code?: string | null;
  social_security_branch_code?: string | null;
  social_security_branch_name?: string | null;
  contract_row?: string | null;
  employer_name?: string | null;
  tax_memory_id?: string | null;
  tax_economic_code?: string | null;
  primary_bank_name?: string | null;
  primary_account_number?: string | null;
  primary_iban?: string | null;
  articles_of_association?: string | null;
  latest_gazette?: string | null;
  logo?: string | null;
  is_active: boolean;
  has_warehouse_module?: boolean;
  projects_count?: number;
  documents_count?: number;
  documents_health_status?: 'valid' | 'expiring_soon' | 'expired' | 'no_documents';
  bank_accounts?: CompanyBankAccount[];
  board_members?: CompanyBoardMember[];
  is_member?: boolean;
  membership_sources?: string[];
  section_levels?: CompanySectionLevels;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyBankAccount {
  id?: number;
  company: number;
  company_name?: string;
  bank_name: string;
  account_number?: string | null;
  sheba_number: string;
  account_title?: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserAvailableCompaniesResponse {
  companies: Company[];
  is_superuser: boolean;
  count: number;
}

export interface UserCompanyAccess {
  id?: number;
  user: number;
  username?: string;
  user_full_name?: string | null;
  company: number;
  company_name?: string;
  company_code?: string;
  /** سطح هر بخش شرکت (طرح مجوزهای بخش‌به‌بخش) */
  section_levels?: CompanySectionLevels;
  role_in_company?: string | null;
  is_default: boolean;
  created_at?: string;
}

export interface CompanyFiscalPeriod {
  id?: number;
  company: number;
  company_name?: string;
  fiscal_year: string;
  title: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'frozen' | 'closed';
  status_display?: string;
  is_active: boolean;
  closed_at?: string | null;
  closed_by?: number | null;
  closed_by_name?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}


export type SectionLevel = 'none' | 'read' | 'write';
export type CompanySectionLevels = Record<string, SectionLevel>;

export interface CompanyPermissionSection {
  key: string;
  label_fa: string;
  order: number;
  kind: 'levels' | 'action';
  sensitive: boolean;
  studio: string | null;
}

export interface CompanyPermissionSpec {
  levels: SectionLevel[];
  templates: { key: string; label_fa: string; levels: CompanySectionLevels }[];
  sections: CompanyPermissionSection[];
  /** فیلد مدل شرکت ← کلید بخش (فیلد بی‌نگاشت فقط برای مدیر کل) */
  fields?: Record<string, string>;
}

export interface CompanyMember {
  user_id: number;
  username: string;
  user_full_name: string;
  sources: string[];
}
