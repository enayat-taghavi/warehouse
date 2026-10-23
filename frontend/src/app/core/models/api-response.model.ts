/**
 * تایپ‌های عمومی پاسخ API
 * مطابق با DRF pagination و error format
 */

/** پاسخ صفحه‌بندی‌شده DRF */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** ساختار خطای DRF */
export interface ApiError {
  detail?: string;
  code?: string;
  field_errors?: FieldErrors;
}

export type FieldErrors = Record<string, string[]>;

/** توکن‌های JWT */
export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface TokenRefreshPayload {
  refresh: string;
}

export interface TokenRefreshResponse {
  access: string;
}

/** پروفایل کاربر لاگین شده */
export interface AuthUserProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  national_code: string | null;
  phone_number: string | null;
  operational_zone: string | null;
  supervisor_id: number | null;
  avatar?: string | null;
  avatar_letter: string;
  department: string;
  role_titles: string[];
  roles: string[];
  permissions: string[];
  is_superuser?: boolean;
  requires_password_change: boolean;
  ui_preferences?: any;
  allowed_apps?: string[];
  scopes?: Record<string, string[]>;
  active_app?: string;
}

/** پیلود لاگین */
export interface LoginPayload {
  username: string;
  password: string;
}

/** پاسخ لاگین */
export interface LoginResponse {
  tokens: AuthTokens;
  user: AuthUserProfile;
}

/** آمار داشبورد */
export interface DashboardSummary {
  total_records: number;
  completed_records: number;
  counting_records: number;
  feeding_records: number;
  archived_records: number;
  total_projects: number;
  active_projects: number;
  total_users: number;
  active_users: number;
  overall_progress: number;
}

export interface WeeklyChartData {
  day: string;
  count: number;
  docs: number;
  feed: number;
}

export interface DashboardWeekly {
  data: WeeklyChartData[];
  max_value: number;
}
