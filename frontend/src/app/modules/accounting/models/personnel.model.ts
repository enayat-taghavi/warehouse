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
  attachment?: string | null;
  bank_accounts?: PersonnelBankAccount[];
  documents?: PersonnelDocument[];
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

export interface Counterparty {
  id?: number;
  /** شرکت مالک؛ تهی یعنی طرف‌حساب سراسری */
  company?: number | null;
  name: string;
  counterparty_type: 'driver' | 'repair_shop' | 'fuel_station' | 'contractor' | 'other';
  counterparty_type_display?: string;
  national_id?: string;
  phone?: string;
  bank_name?: string;
  account_number?: string;
  sheba_number?: string;
  account_code?: string;
  project?: number | null;
  section?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseInvoice {
  id?: number;
  section: number;
  section_name?: string;
  project_id?: number;
  project_name?: string;
  counterparty: number;
  counterparty_name?: string;
  invoice_number: string;
  invoice_date_shamsi: string;
  amount: number;
  total_amount?: number;
  category: string;
  description: string;
  attachment?: string | null;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'pending_manager' | 'ready_to_pay' | 'paid' | 'rejected' | 'revision_required';
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

export interface PettyCashAccount {
  id?: number;
  section: number;
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
  created_at?: string;
  updated_at?: string;
}

export interface PettyCashTransaction {
  id?: number;
  account?: number | null;
  section: number;
  section_name?: string;
  project_id?: number;
  project_name?: string;
  custodian: number;
  custodian_name?: string;
  transaction_type: 'expense' | 'allocation' | 'refund';
  transaction_type_display?: string;
  amount: number;
  transaction_date_shamsi: string;
  title: string;
  category: string;
  description?: string;
  counterparty?: number | null;
  counterparty_name?: string;
  receipt_number?: string;
  attachment?: string | null;
  status: 'draft' | 'pending_supervisor' | 'pending_accountant' | 'pending_manager' | 'approved' | 'rejected' | 'revision_required';
  status_display?: string;
  rejection_reason?: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PettyCashBalanceSummary {
  account_id?: number | null;
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
}





