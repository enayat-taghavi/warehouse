export interface PersonnelProfile {
  id?: number;
  user?: number | null;
  user_username?: string;
  
  // ۱. هویتی و شناسنامه‌ای
  first_name: string;
  last_name: string;
  full_name?: string;
  national_code: string;
  father_name?: string;
  id_number?: string;
  id_series?: string;
  id_serial?: string;
  birth_date?: string;
  birth_place?: string;
  issue_place?: string;
  issue_date?: string;
  gender?: string;
  nationality_code?: string;
  citizenship_country_code?: string;
  residence_country_code?: string;
  education_level?: string;
  marital_status: 'single' | 'married';
  children_count: number;

  // ۲. بیمه و مالیات
  insurance_number?: string;
  insurance_type?: string;
  insurance_name?: string;
  exemption_type?: string;
  job_category?: string;
  job_code?: string;
  job_title: string;
  employment_type?: string;
  status_category?: string;
  group_status?: string;
  include_in_insurance?: boolean;
  include_in_tax?: boolean;
  include_in_bank?: boolean;

  // فیلدهای تنظیمی جدول WHFildeTable و راهنمای رسمی مالیات دارایی (نسخه 1.7.0.4)
  tax_payment_type?: string;
  tax_service_location?: string;
  tax_exceptions?: string;
  tax_currency_type?: string;
  tax_currency_exchange_rate?: number;
  tax_housing_benefit_type?: string;
  tax_vehicle_benefit_type?: string;

  // ۳. قرارداد، دستمزد پایه و سنوات
  contract_type: 'daily' | 'hourly' | 'monthly';
  start_date?: string;
  end_date?: string;
  retirement_date?: string;
  contract_hours?: number;
  contract_base_salary?: number;
  job_grade?: string;
  daily_base_wage: number;
  daily_seniority_bonus?: number;
  base_daily_rate?: number;
  effective_daily_rate?: number;
  hourly_rate?: number;
  base_years_experience?: number;
  personnel_id_code?: string;

  // ۴. مزایای مستمر و فوق‌العاده‌ها
  housing_allowance?: number;
  food_allowance?: number;
  spouse_allowance?: number;
  weather_bonus?: number;
  asaluyeh_parsian_bonus?: number;
  remote_hardship_bonus?: number;
  market_attraction_bonus?: number;
  transport_allowance?: number;

  // ۵. حساب بانکی و نشانی
  bank_name?: string;
  account_number?: string;
  sheba_number?: string;
  card_number?: string;
  phone_number?: string;
  postal_code?: string;
  address?: string;
  notes?: string;
  valid_until_date?: string;
  recommender?: string;
  /** برای بینندهٔ بی دید کامل null است */
  attachment?: string | null;
  bank_accounts?: PersonnelBankAccount[];
  /** برای بینندهٔ بی دید کامل فقط مدرک‌های بارگذاری‌شده به دست خودش */
  documents?: PersonnelDocument[];
  /** تعداد همهٔ مدرک‌ها (برای همه) */
  documents_count?: number;
  missing_fields?: Array<{ field: string; label: string } | string>;

  assigned_warehouse?: number | null;
  assigned_warehouse_name?: string;
  company?: number | null;
  company_name?: string;
  project?: number | null;
  project_name?: string;
  section?: number | null;
  section_name?: string;
  is_active: boolean;

  // فیلدهای گردش کار تایید سه مرحله‌ای (سرپرست، حسابدار، مدیر)
  approval_status?: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'supervisor_approved' | 'pending_manager' | 'accountant_approved' | 'manager_approved' | 'approved' | 'rejected' | 'revision_required';
  approval_status_display?: string;
  supervisor_approved_by?: number | null;
  supervisor_approved_by_name?: string;
  supervisor_approved_at?: string | null;
  manager_approved_by?: number | null;
  manager_approved_by_name?: string;
  manager_approved_at?: string | null;
  accountant_approved_by?: number | null;
  accountant_approved_by_name?: string;
  accountant_approved_at?: string | null;
  rejection_reason?: string;
  has_pending_changes?: boolean;
  pending_change_request?: {
    id: number;
    status?: string;
    proposed_changes?: Record<string, any>;
    previous_values?: Record<string, any>;
    created_at?: string;
  } | null;

  created_at?: string;
  updated_at?: string;
}

export interface PersonnelBankAccount {
  id?: number;
  personnel?: number;
  bank_name: string;
  account_number: string;
  sheba_number: string;
  card_number?: string;
  is_primary: boolean;
  is_active?: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/** برآورد سروری هزینهٔ ماهانهٔ پرسنل با همان موتور حقوق (DEF-05) */
export interface PersonnelCostEstimate {
  year_month: string;
  settings_id: number | null;
  job_grade: string;
  base_daily_rate: number;
  insurance_base_hourly_rate: number | null;
  real_hourly_rate: number | null;
  insurance_days: number;
  gross_salary: number;
  base_salary: number;
  marital_allowance: number;
  child_allowance: number;
  housing_allowance: number;
  food_allowance: number;
  total_insurable_salary_allowances: number;
  worker_insurance: number;
  employer_insurance: number;
  unemployment_insurance: number;
  net_salary: number;
  employer_monthly_cost: number;
  employer_insurance_rate: number;
  unemployment_insurance_rate: number;
  worker_insurance_rate: number;
}

export interface PersonnelDocument {
  id?: number;
  personnel?: number;
  doc_type: 'national_card' | 'birth_certificate' | 'contract' | 'other';
  doc_type_display?: string;
  file?: string;
  file_name?: string;
  uploaded_by?: number;
  uploaded_by_name?: string;
  created_at?: string;
}

export interface VehicleBankAccount {
  id?: number;
  vehicle?: number;
  bank_name: string;
  account_number: string;
  sheba_number: string;
  card_number?: string;
  account_owner_name?: string;
  account_owner_national_code?: string;
  payee_type?: 'driver' | 'owner' | 'other';
  payee_type_display?: string;
  is_primary: boolean;
  is_active?: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VehicleDocument {
  id?: number;
  vehicle?: number;
  doc_type: 'car_card' | 'insurance' | 'inspection' | 'driver_license' | 'contract' | 'other' | string;
  doc_type_display?: string;
  file?: string;
  file_url?: string;
  file_name?: string;
  title?: string;
  issue_date?: string;
  expiry_date?: string;
  uploaded_by?: number;
  uploaded_by_name?: string;
  created_at?: string;
}

export interface VehicleDriverProfile {
  id?: number;
  user?: number | null;
  user_username?: string;
  plate_number: string;
  vehicle_type: 'pickup' | 'nissan' | 'khavar' | 'sedan' | 'truck' | 'trailer' | 'forklift' | 'other';
  vehicle_type_display?: string;
  ownership_type?: 'contract' | 'company' | 'personal';
  ownership_type_display?: string;
  driver_name: string;
  driver_national_code?: string;
  driver_phone?: string;
  is_driver_owner?: boolean;
  owner_name?: string;
  owner_national_code?: string;
  owner_phone?: string;
  default_service_rate: number;
  bank_name?: string;
  account_number?: string;
  sheba_number?: string;
  notes?: string;
  insurance_expiry_date?: string | null;
  inspection_expiry_date?: string | null;
  license_expiry_date?: string | null;
  valid_until_date?: string | null;
  end_date?: string | null;
  missing_fields?: string[];
  bank_accounts?: VehicleBankAccount[];
  documents?: VehicleDocument[];
  assigned_warehouse?: number | null;
  assigned_warehouse_name?: string;
  company?: number | null;
  company_name?: string;
  project?: number | null;
  project_name?: string;
  section?: number | null;
  section_name?: string;
  is_active: boolean;

  // فیلدهای گردش کار تایید سه مرحله‌ای (سرپرست، حسابدار، مدیر)
  approval_status?: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'supervisor_approved' | 'pending_manager' | 'accountant_approved' | 'manager_approved' | 'approved' | 'rejected' | 'revision_required';
  approval_status_display?: string;
  supervisor_approved_by?: number | null;
  supervisor_approved_by_name?: string;
  supervisor_approved_at?: string | null;
  manager_approved_by?: number | null;
  manager_approved_by_name?: string;
  manager_approved_at?: string | null;
  accountant_approved_by?: number | null;
  accountant_approved_by_name?: string;
  accountant_approved_at?: string | null;
  rejection_reason?: string;
  has_pending_changes?: boolean;

  pending_change_request?: {
    id: number;
    status?: string;
    proposed_changes?: Record<string, any>;
    previous_values?: Record<string, any>;
    created_at?: string;
  } | null;

  created_at?: string;
  updated_at?: string;
}

export interface WorkflowAuditLog {
  id?: number;
  content_type: string;
  object_id: number;
  action: string;
  action_display?: string;
  from_status?: string;
  to_status?: string;
  reason?: string;
  note?: string;
  actor?: number | null;
  actor_name?: string;
  performed_by_name?: string;
  metadata?: Record<string, any>;
  snapshot?: Record<string, any>;
  created_at: string;
  created_at_shamsi?: string;
  created_at_jalali?: string;
  jalali_date?: string;
}

export interface PersonnelChangeRequest {
  id: number;
  personnel: number;
  personnel_name?: string;
  national_code?: string;
  personnel_national_code?: string;
  proposed_changes: Record<string, any>;
  previous_values?: Record<string, any>;
  change_reason?: string;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'supervisor_approved' | 'pending_manager' | 'accountant_approved' | 'manager_approved' | 'approved' | 'rejected' | 'revision_required' | 'pending_finance';
  status_display?: string;
  created_by?: number;
  created_by_name?: string;
  requested_by?: number;
  requested_by_name?: string;
  supervisor_reviewed_by?: number;
  supervisor_reviewed_by_name?: string;
  supervisor_reviewed_at?: string;
  manager_approved_by?: number;
  manager_approved_by_name?: string;
  manager_approved_at?: string;
  accountant_approved_by?: number;
  accountant_approved_by_name?: string;
  accountant_approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleChangeRequest {
  id: number;
  vehicle: number;
  driver_name?: string;
  plate_number?: string;
  proposed_changes: Record<string, any>;
  previous_values?: Record<string, any>;
  change_reason?: string;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'supervisor_approved' | 'pending_manager' | 'accountant_approved' | 'manager_approved' | 'approved' | 'rejected' | 'revision_required' | 'pending_finance';
  status_display?: string;
  created_by?: number;
  created_by_name?: string;
  requested_by?: number;
  requested_by_name?: string;
  supervisor_reviewed_by?: number;
  supervisor_reviewed_by_name?: string;
  supervisor_reviewed_at?: string;
  manager_approved_by?: number;
  manager_approved_by_name?: string;
  manager_approved_at?: string;
  accountant_approved_by?: number;
  accountant_approved_by_name?: string;
  accountant_approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ImportPersonnelExcelResponse {
  message: string;
  created_count: number;
  updated_count: number;
  errors?: string[];
}

export interface AttendanceMatrixRow {
  personnel_id: number;
  full_name: string;
  national_code: string;
  job_title: string;
  attendance_id?: number | null;
  warehouse_id?: number | null;
  warehouse_name?: string;
  status: 'PRESENT_10H' | 'HALF_5H' | 'ABSENT' | 'LEAVE' | 'MISSION' | 'FRIDAY_WORK' | 'CUSTOM' | '' | string;
  effective_hours: number;
  overtime_hours: number;
  is_friday_work: boolean;
  is_mission: boolean;
  advance_payment: number;
  notes: string;
  is_existing: boolean;
  _isDirty?: boolean;
  is_active?: boolean;
}

export interface AttendanceMatrixResponse {
  warehouse_id?: number | null;
  date_shamsi: string;
  year_month: string;
  is_locked: boolean;
  period_status: string;
  rows: AttendanceMatrixRow[];
}

export interface VehicleMatrixRow {
  vehicle_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type_display: string;
  default_rate: number;
  trip_id?: number | null;
  trip_count: number;
  unit_rate: number;
  total_amount: number;
  dispatch_reference: string;
  origin_destination: string;
  notes: string;
  is_existing: boolean;
  is_active?: boolean;
  warehouse_name?: string;
}

export interface VehicleMatrixResponse {
  warehouse_id: number;
  date_shamsi: string;
  rows: VehicleMatrixRow[];
}

export interface VehicleMonthlyGridDay {
  day: number;
  date_shamsi: string;
  trip_id: number | null;
  trip_count: number;
  unit_rate: number;
  total_amount: number;
  dispatch_reference: string;
  origin_destination: string;
  notes: string;
  is_existing: boolean;
}

export interface VehicleMonthlyGridRow {
  vehicle_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type: string;
  vehicle_type_display: string;
  ownership_type: string;
  ownership_type_display: string;
  default_rate: number;
  sheba_number: string;
  total_trips: number;
  total_amount: number;
  active_days: number;
  is_active?: boolean;
  days: VehicleMonthlyGridDay[];
}

export interface VehicleMonthlyGridResponse {
  warehouse_id: number | null;
  year_month: string;
  month_name: string;
  days_in_month: number;
  days_meta: Array<{
    day: number;
    date_shamsi: string;
    weekday_short: string;
    weekday_name: string;
    is_friday: boolean;
    is_editable: boolean;
    is_today: boolean;
  }>;
  is_locked: boolean;
  period_status: string;
  rows: VehicleMonthlyGridRow[];
}

export interface VehicleTripAuditLog {
  id: number;
  trip: number;
  driver_name: string;
  plate_number?: string;
  date_shamsi: string;
  changed_by?: number;
  changed_by_name?: string;
  changed_at: string;
  field_name: string;
  old_value: string;
  new_value: string;
  reason?: string;
}

export interface AttendanceSummaryRow {
  personnel_id: number;
  full_name: string;
  national_code: string;
  job_title: string;
  contract_type: string;
  daily_base_wage: number;
  total_hours: number;
  equivalent_days: number;
  present_days: number;
  total_overtime_hours: number;
  friday_days: number;
  mission_days: number;
  absent_days: number;
  leave_days: number;
  total_advances: number;
  gross_base_pay: number;
  overtime_pay: number;
  estimated_total_pay: number;
}

export interface VehicleSummaryRow {
  vehicle_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type: string;
  default_rate: number;
  sheba_number: string;
  active_days: number;
  total_trips: number;
  total_payable: number;
}

export interface MonthlyWorkPeriod {
  id: number;
  warehouse: number;
  warehouse_name?: string;
  year_month: string;
  status: 'OPEN' | 'SUBMITTED' | 'LOCKED' | 'REJECTED' | 'FINALIZED' | string;
  status_display?: string;
  submitted_at?: string;
  submitted_by_name?: string;
  submission_notes?: string;
  rejection_reason?: string;
  locked_at?: string;
  locked_by_name?: string;
  notes?: string;
}

export interface JobGradeTier {
  id?: number;
  grade_number: number;
  daily_base_wage: number;
  daily_seniority_bonus: number;
}

export interface WorkshopInsuranceSettings {
  id?: number;
  workshop_code: string;
  workshop_name: string;
  employer_name: string;
  workshop_address: string;
  list_type: string | number;
  list_number: string;
  default_dsk_rate: number;
  default_mon_pym: string;
}

export interface TaxRuleSettings {
  id?: number;
  payment_type: string;
  service_location: string;
  exceptions: string;
  currency_type: string;
  currency_exchange_rate: number;
  housing_benefit_type: string;
  vehicle_benefit_type?: string;
  wh_file_prefix?: string;
  wp_file_prefix?: string;
}

export interface BankExportSettings {
  id?: number;
  bank_name: string;
  source_account_number: string;
  source_sheba_number?: string;
  default_deposit_id: string;
  deposit_description_template: string;
}

export interface PayrollYearlySettings {
  id?: number;
  fiscal_year: string;
  project?: number | null;
  project_name?: string | null;
  title?: string;
  version_title?: string;
  effective_from?: string;
  effective_to?: string | null;
  is_active: boolean;
  notes?: string;
  created_by_name?: string;
  updated_by_name?: string;

  // قانون کار
  monthly_food_allowance: number;
  monthly_housing_allowance: number;
  monthly_spouse_allowance: number;
  monthly_child_allowance: number;

  // ضرایب و فوق‌العاده‌ها
  shift_percent: number;
  transport_help_percent: number;
  transport_fixed_amount: number;
  specialist_attraction_percent: number;
  bad_weather_percent: number;
  remote_hardship_percent: number;
  south_pars_percent: number;
  travel_cost_per_day: number;

  // ساعات کار استاندارد و ضرایب مصوب اکسل شرکت
  standard_daily_hours?: number;
  bonus_daily_coefficient?: number;
  seniority_monthly_coefficient?: number;
  overtime_rate_multiplier?: number;
  friday_work_rate_multiplier?: number;

  // سقف دستی بیمه
  max_insurable_daily_wage?: number | null;

  // بیمه
  worker_insurance_rate: number;
  employer_insurance_rate: number;
  unemployment_insurance_rate: number;

  // تسهیم مازاد
  surplus_overtime_percent?: number;

  // محدودیت بازه زمانی ویرایش کارکرد
  attendance_edit_past_days?: number;
  attendance_edit_future_days?: number;

  // Nested
  job_grades: JobGradeTier[];
  workshop_insurance?: WorkshopInsuranceSettings;
  tax_settings?: TaxRuleSettings;
  bank_export_settings?: BankExportSettings;
}

export interface MonthlyPayrollRecord {
  id?: number;
  period: number;
  personnel: number;
  row_number: number;
  status_category: string;
  include_in_tax: boolean;
  include_in_insurance: boolean;
  include_in_bank: boolean;
  national_code: string;
  full_name: string;
  marital_status: string;
  children_count: number;
  contract_hours: number;
  contract_salary: number;
  job_grade: string;
  daily_wage: number;
  daily_seniority: number;
  years_of_service: number;
  base_daily_rate: number;
  worked_hours: number;
  insurance_days: number;
  overtime_hours: number;
  friday_work_days: number;
  mission_days: number;
  income_tax: number;
  advance_payment_deduction: number;
  other_allowances: number;
  friday_work_amount: number;
  overtime_amount: number;
  travel_cost_amount: number;
  mission_amount: number;
  bonus_amount: number;
  leave_amount: number;
  food_allowance: number;
  housing_allowance: number;
  marital_allowance: number;
  transport_allowance: number;
  market_attraction_allowance: number;
  bad_weather_allowance: number;
  remote_hardship_allowance: number;
  south_pars_allowance: number;
  child_allowance: number;
  seniority_allowance: number;
  total_taxable_allowances: number;
  total_non_continuous_taxable_allowances: number;
  continuous_taxable_allowances: number;
  total_non_taxable_allowances: number;
  total_seniority_accumulated: number;
  worker_insurance: number;
  employer_insurance: number;
  unemployment_insurance: number;
  total_insurance: number;
  base_salary: number;
  continuous_taxable_salary_allowances: number;
  total_insurable_salary_allowances: number;
  gross_salary: number;
  total_deductions: number;
  net_salary: number;
  bank_account_number: string;
  payable_amount: number;
  tax_check_discrepancy: number;
  tax_source_type?: string;
  tax_exemption_months?: number;
  has_multiple_employers?: boolean;
  is_tax_imported?: boolean;
  is_manually_overridden: boolean;
}

export interface MonthlyGridDayMeta {
  day: number;
  date_shamsi: string;
  weekday_short: string;
  weekday_name: string;
  is_friday: boolean;
  is_editable: boolean;
  is_today: boolean;
}

export interface MonthlyGridPersonnelDay {
  day: number;
  date_shamsi: string;
  status: 'PRESENT_10H' | 'HALF_5H' | 'ABSENT' | 'LEAVE' | 'MISSION' | 'FRIDAY_WORK' | 'CUSTOM' | '' | string;
  status_display?: string;
  effective_hours: number;
  overtime_hours: number;
  is_friday_work: boolean;
  is_mission: boolean;
  advance_payment: number;
  notes: string;
  is_existing: boolean;
  attendance_id: number | null;
}

export interface MonthlyGridRow {
  personnel_id: number;
  full_name: string;
  national_code: string;
  job_title: string;
  total_hours: number;
  total_overtime: number;
  present_days: number;
  is_active?: boolean;
  days: MonthlyGridPersonnelDay[];
}

export interface AttendanceAnomaly {
  type: 'EXCESSIVE_HOURS' | 'CONFLICT_OVERTIME' | 'ADVANCE_ABSENT' | 'GAP_DAY' | string;
  severity: 'high' | 'medium' | 'low';
  personnel_id: number;
  full_name: string;
  day: number;
  message: string;
}

export interface MonthlyGridResponse {
  warehouse_id?: number | null;
  year_month: string;
  month_name: string;
  days_in_month: number;
  is_locked: boolean;
  period_status: string;
  period_info?: {
    id: number | null;
    status: string;
    status_display: string;
    is_locked: boolean;
    submitted_at?: string | null;
    submitted_by_name?: string | null;
    submission_notes?: string;
    rejection_reason?: string;
    locked_at?: string | null;
    locked_by_name?: string | null;
  };
  settings_window: {
    past_days: number;
    future_days: number;
  };
  days_meta: MonthlyGridDayMeta[];
  rows: MonthlyGridRow[];
  anomalies?: AttendanceAnomaly[];
}

export interface FinancialProject {
  id?: number;
  company?: number | null;
  company_name?: string;
  company_code?: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  sections_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectSection {
  id?: number;
  project: number;
  project_id?: number;
  project_name?: string;
  project_code?: string;
  company_id?: number;
  company_name?: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserSectionAssignment {
  id?: number;
  user: number;
  username?: string;
  user_full_name?: string;
  /** انتساب سه‌سطحی: دقیقاً یکی از company، project و section پر است (سطح شرکت و پروژه: section تهی) */
  section: number | null;
  project?: number | null;
  company?: number | null;
  level?: 'company' | 'project' | 'section';
  target_company_id?: number | null;
  company_name?: string | null;
  section_name?: string | null;
  section_code?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  role: 'employee' | 'supervisor' | 'accountant' | 'manager' | 'treasury';
  role_display?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** حساب بانکی طرف بیرونی (`/api/personnel/party-bank-accounts/`)؛ شبا با پیشوند IR ذخیره می‌شود. */
export interface PartyBankAccount {
  id?: number;
  /** شناسهٔ طرف بیرونی (`Counterparty.party`)، نه شناسهٔ طرف حساب */
  party?: number;
  bank_name?: string;
  account_number?: string;
  sheba_number: string;
  card_number?: string;
  owner_name?: string;
  is_primary?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type CounterpartyKind = 'person' | 'legal';

/** طرف حساب = نقش مالی یک طرف بیرونی؛ هر طرف حساب یک شرکت دارد. */
export interface Counterparty {
  id?: number;
  /** شناسهٔ طرف بیرونی هسته */
  party?: number;
  /** شرکت مالک (با ویرایش عوض نمی‌شود) */
  company?: number;
  company_name?: string;
  kind?: CounterpartyKind;
  kind_display?: string;
  name: string;
  counterparty_type: 'driver' | 'repair_shop' | 'fuel_station' | 'contractor' | 'other';
  counterparty_type_display?: string;
  national_id?: string;
  economic_code?: string;
  registration_number?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  postal_code?: string;
  notes?: string;
  /** حساب‌های بانکی؛ در ساخت، حساب اولیه هم با همین فهرست فرستاده می‌شود */
  bank_accounts?: PartyBankAccount[];
  /** true یعنی شبا، شماره‌حساب، کارت و کد ملی حقیقی پوشیده‌اند (چهار رقم آخر) */
  bank_masked?: boolean;
  /** فیلدهای تخت سازگار = حساب اصلی (شبا بی IR) */
  bank_name?: string;
  account_number?: string;
  sheba_number?: string;
  account_code?: string;
  is_active: boolean;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
  /** فقط در پاسخ ساخت: true یعنی همان طرف حساب موجود برگشت (تکراری) */
  existing?: boolean;
}

/** ردیف فاکتور هزینه (۴.۱)؛ مبلغ ردیف را سرور حساب می‌کند */
export interface ExpenseInvoiceLine {
  id?: number;
  position?: number;
  description: string;
  quantity: number | string;
  unit?: string;
  unit_price: number | string;
  line_amount?: number | string;
  expense_head: number | null;
  expense_head_code?: string | null;
  expense_head_title?: string | null;
  expense_head_group_title?: string | null;
}

export type InvoicePaymentMethod = 'transfer' | 'cheque' | 'cash';

/** قسط پرداخت فاکتور (۴.۱-ب)؛ شبای حساب شرکت هرگز برنمی‌گردد */
export interface InvoicePayment {
  id: number;
  invoice: number;
  amount: number | string;
  payment_date_shamsi: string;
  tracking_code: string;
  method: InvoicePaymentMethod;
  method_display?: string;
  company_bank_account?: number | null;
  company_bank_name?: string | null;
  party_bank_account?: number | null;
  party_bank_name?: string | null;
  party_sheba_number?: string | null;
  party_account_number?: string | null;
  notes?: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at?: string;
  is_voided: boolean;
  voided_at?: string | null;
  voided_by?: number | null;
  voided_by_name?: string | null;
  void_reason?: string;
}

export interface InvoicePaymentCreate {
  amount: number | string;
  payment_date_shamsi: string;
  tracking_code: string;
  method: InvoicePaymentMethod;
  company_bank_account?: number | null;
  party_bank_account?: number | null;
  notes?: string;
  revision?: number;
}

/** پاسخ ثبت/ابطال قسط و تسویه */
export interface InvoicePaymentResult {
  message: string;
  status: ExpenseInvoice['status'];
  status_display?: string;
  amount: number | string;
  paid_amount: number | string;
  remaining: number | string;
  payment?: InvoicePayment;
}

export interface InvoicePaymentsResponse {
  amount: number | string;
  paid_amount: number | string;
  remaining: number | string;
  status: ExpenseInvoice['status'];
  results: InvoicePayment[];
}

export interface InvoiceDuplicateMatch {
  id: number;
  number?: string | null;
  invoice_number: string;
  invoice_date_shamsi: string;
  amount: number | string;
  status: ExpenseInvoice['status'];
  status_display?: string;
  section_name?: string;
}

export interface InvoiceDuplicatesResponse {
  count: number;
  hidden_count: number;
  matches: InvoiceDuplicateMatch[];
}

export interface PagedResult<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** مقدار پوشیدهٔ سرور (۴.۳، ق۱۶) ستاره دارد؛ نمایش فقط‌خواندنی، هرگز دوباره فرستاده نمی‌شود */
export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('*');
}

/** فیلدهای حساسی که سرور برای بینندهٔ بی دید کامل ستاره‌دار می‌کند (هم‌تراز PERSONNEL_SENSITIVE_FIELDS سرور) */
export const PERSONNEL_SENSITIVE_FIELDS: readonly string[] = [
  'national_code', 'id_number', 'id_series', 'id_serial', 'account_number', 'card_number', 'sheba_number'
];

/** فقط فیلد حساسِ ستاره‌دار پوشیده است؛ «*» در نشانی، توضیح یا نام دادهٔ واقعی کاربر است و نباید حذف شود */
export function isMaskedSensitive(field: string, value: unknown): boolean {
  return PERSONNEL_SENSITIVE_FIELDS.includes(field) && isMaskedValue(value);
}

/** کلیدهای حساسِ ستاره‌دار را از payload برمی‌دارد؛ بقیه دست نمی‌خورند */
export function stripMaskedSensitive<T extends object>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isMaskedSensitive(k, v)) out[k] = v;
  }
  return out as T;
}

/** پاسخ جستجوی کد ملی؛ برای کاربر بی دید کامل فقط «هست/نیست» و نام (masked) */
export interface PersonnelLookupResult {
  found: boolean;
  masked?: boolean;
  /** پاسخ کامل همان پرونده؛ در حالت masked فقط first_name و last_name */
  personnel?: any;
}

/** کدهای خطای اکشن‌های پرونده و درخواست تغییر روی موتور گردش (۴.۳-ب) */
export type PersonnelWorkflowErrorCode =
  | 'wrong_step' | 'action_blocked' | 'reason_required' | 'not_recipient' | 'self_approval'
  | 'task_already_done' | 'invalid_state' | 'invalid_change_request';

export interface PersonnelWorkflowError {
  code?: PersonnelWorkflowErrorCode | string;
  error?: string;
  detail?: string;
  missing_fields?: Array<{ field: string; label: string } | string>;
}

export interface PersonnelBatchApproveRow {
  id: number;
  full_name?: string;
  success: boolean;
  error?: string;
  code?: PersonnelWorkflowErrorCode | string;
  missing_fields?: Array<{ field: string; label: string } | string>;
}

export interface ExpenseInvoice {
  id?: number;
  /** شمارهٔ داخلی (۱۴۰۵/ف/۱۲۳)؛ پس از ارسال */
  number?: string | null;
  section: number;
  section_name?: string;
  project_id?: number;
  project_name?: string;
  counterparty: number;
  counterparty_name?: string;
  invoice_number: string;
  invoice_date_shamsi: string;
  /** مبلغ قابل پرداخت = جمع ردیف‌ها − تخفیف + مالیات (سرور) */
  amount: number;
  total_amount?: number;
  lines?: ExpenseInvoiceLine[];
  subtotal?: number | string;
  discount_amount?: number | string;
  vat_applicable?: boolean;
  vat_rate?: number | string;
  vat_amount?: number | string;
  /** مالیات دستی (با مقدار پیشنهادی فرق دارد) */
  vat_manual?: boolean;
  possible_duplicate?: boolean;
  duplicate_reason?: string;
  paid_amount?: number | string;
  remaining?: number | string;
  payments?: InvoicePayment[];
  /** عنوان سرفصل؛ فقط‌خواندنی و پرشده در سرور (۳.۴ ص۲) */
  category?: string;
  /** قدیمی (پیش از ردیف‌ها)؛ سرور آن را به یک ردیف تبدیل می‌کند */
  expense_head?: number | null;
  expense_head_code?: string | null;
  expense_head_title?: string | null;
  expense_head_group_title?: string | null;
  description: string;
  attachment?: string | null;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'pending_manager' | 'ready_to_pay' | 'partially_paid' | 'paid' | 'rejected' | 'revision_required';
  status_display?: string;
  rejection_reason?: string;
  supervisor_approver_name?: string;
  accountant_approver_name?: string;
  manager_approver_name?: string;
  date?: string;
  issue_date_shamsi?: string;
  payment_ref?: string;
  paid_at?: string;
  paid_by?: number | null;
  paid_by_name?: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

/** سرفصل هزینهٔ شرکت (۳.۴)؛ ردیف بی والد «گروه» است و روی سند انتخاب نمی‌شود */
export interface ExpenseHead {
  id: number;
  company: number;
  parent: number | null;
  parent_title?: string | null;
  is_group?: boolean;
  code: string;
  title: string;
  is_active: boolean;
  order?: number;
  /** فقط برای دارندهٔ نوشتن `expense_heads` */
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PettyCashAccount {
  id?: number;
  /** حساب سطح شرکت است؛ بخش دیگر لازم نیست (ص۱ طرح ۳.۶) */
  company?: number | null;
  company_name?: string | null;
  /** بدهی = جمع ردیف‌های ردشده (ص۵) */
  debt?: number;
  section?: number | null;
  section_name?: string;
  project_id?: number;
  project_name?: string;
  custodian: number;
  custodian_name?: string;
  ceiling_amount: number;
  card_or_account_number?: string;
  sheba_number?: string;
  is_active?: boolean;
  description?: string;
  /** موجودی اولیه (ریال، د۲ طرح ۴.۲) و تاریخ شمسی آن */
  opening_balance?: number;
  opening_balance_date?: string | null;
  /** فقط نوشتنی: دلیل تغییر موجودی اولیه بعد از اولین گردش */
  reason?: string;
  /** حساب بسته فقط خواندنی است (د۶) */
  is_closed?: boolean;
  closed_at?: string | null;
  closed_by?: number | null;
  /** تحویل به تنخواه‌گردان تازه (د۷) */
  handover_from?: number | null;
  handover_to?: number | null;
  created_at?: string;
  updated_at?: string;
}

export type PettyCashTransactionSource = '' | 'charge' | 'statement_refill' | 'handover_in';

export interface PettyCashTransaction {
  id?: number;
  account?: number | null;
  company?: number | null;
  company_name?: string | null;
  /** بخش و پروژهٔ ردیف اختیاری‌اند (هر دو از همان شرکت) */
  section?: number | null;
  section_name?: string;
  /** پروژهٔ اختیاری خود ردیف */
  project?: number | null;
  statement?: number | null;
  line_status?: 'open' | 'approved' | 'rejected';
  line_status_display?: string;
  line_reject_reason?: string;
  is_locked?: boolean;
  project_id?: number;
  project_name?: string;
  custodian: number;
  custodian_name?: string;
  transaction_type: 'expense' | 'allocation' | 'refund';
  transaction_type_display?: string;
  amount: number;
  transaction_date_shamsi: string;
  title: string;
  /** عنوان سرفصل یا متن ثابت شارژ و عودت؛ فقط‌خواندنی (۳.۴ ص۲) */
  category?: string;
  /** سرفصل هزینه؛ فقط برای نوع `expense` */
  expense_head?: number | null;
  expense_head_code?: string | null;
  expense_head_title?: string | null;
  expense_head_group_title?: string | null;
  description?: string;
  counterparty?: number | null;
  counterparty_name?: string;
  receipt_number?: string;
  attachment?: string | null;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'pending_manager' | 'approved' | 'rejected' | 'revision_required';
  status_display?: string;
  rejection_reason?: string;
  /** منبع شارژ (فقط allocation، د۳) */
  source?: PettyCashTransactionSource;
  source_display?: string;
  source_statement?: number | null;
  /** کسر بدهی از این شارژ و مبلغ خالص واریز (د۴)؛ برای غیرشارژ null */
  offset_total?: number | null;
  net_amount?: number | null;
  created_by?: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type PettyCashSettlementMethod = 'cash' | 'charge_offset' | 'payroll';
export type PettyCashSettlementStatus = 'pending' | 'done' | 'void';

/** تسویهٔ بدهی تنخواه‌گردان (د۴) */
export interface PettyCashDebtSettlement {
  id: number;
  account: number;
  company?: number;
  amount: number;
  method: PettyCashSettlementMethod;
  method_display?: string;
  status: PettyCashSettlementStatus;
  status_display?: string;
  reference?: string;
  charge?: number | null;
  payroll_ref?: string;
  note?: string;
  created_by?: number | null;
  created_by_name?: string | null;
  done_at?: string | null;
  voided_by?: number | null;
  void_reason?: string;
  created_at?: string;
}

export interface PettyCashDebtSettlementCreate {
  account: number;
  amount: number;
  method: PettyCashSettlementMethod;
  reference?: string;
  charge?: number | null;
  note?: string;
}

/** تطبیق دورهٔ تنخواه (د۵)؛ difference = شمارش − انتظار، منفی یعنی کسری */
export interface PettyCashReconciliation {
  id: number;
  account: number;
  company?: number;
  custodian_id?: number;
  period_end_date: string;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  result?: 'shortage' | 'surplus' | 'balanced';
  note?: string;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string;
}

export interface PettyCashReconciliationCreate {
  account: number;
  period_end_date: string;
  counted_cash: number;
  note?: string;
}

export interface PettyCashAccountCloseResult extends PettyCashAccount {
  refund_id?: number | null;
}

export interface PettyCashHandoverResult {
  old_account: PettyCashAccount;
  new_account: PettyCashAccount;
}

export type PettyCashStatementStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'returned';

/** صورت‌حساب تنخواه (ص۴ طرح ۳.۶) */
export interface PettyCashStatement {
  id: number;
  company: number;
  company_name?: string | null;
  account: number;
  custodian: number;
  custodian_name?: string | null;
  statement_date_shamsi: string;
  total_amount: number;
  approved_amount: number;
  status: PettyCashStatementStatus;
  status_display?: string;
  /** شمارهٔ رسمی صورت‌حساب (د۹)؛ در اولین ارسال داده می‌شود */
  document_number?: string | null;
  issued_number?: number | null;
  lines_count?: number;
  is_locked?: boolean;
  created_by_name?: string | null;
  created_at?: string;
}

export interface PettyCashBalanceSummary {
  account_id?: number | null;
  company_id?: number | null;
  /** بدهی تنخواه‌گردان از ردیف‌های ردشده */
  debt?: number;
  debt_tomans?: number;
  ceiling_amount: number;
  ceiling_amount_tomans: number;
  total_allocated: number;
  total_allocated_tomans: number;
  total_spent: number;
  total_spent_tomans: number;
  current_balance: number;
  current_balance_tomans: number;
  pending_settlement: number;
  pending_settlement_tomans: number;
  utilization_rate: number;
  card_or_account_number?: string;
  sheba_number?: string;
  custodian_name?: string;
  custodian_id?: number;
  /** د۱ و د۲ طرح ۴.۲ */
  opening_balance?: number;
  opening_balance_date?: string | null;
  refund_total?: number;
  /** ریز بدهی: ردشده + کسری تطبیق − تسویهٔ قطعی */
  rejected_total?: number;
  shortage_total?: number;
  settled_total?: number;
  pending_debt_settlements?: number;
  /** کسر از حقوق فقط وقتی ماژول حقوق ثبت شده باشد */
  payroll_deduction_available?: boolean;
}





