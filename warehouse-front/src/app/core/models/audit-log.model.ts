/**
 * مدل‌های رهگیری تغییرات و لاگ‌های امنیتی ورود کاربران
 * مطابق با مدل‌های Accounts در جنگو (AuditLog و UserLoginLog)
 */

export interface AuditLogDetails {
  event?: string;
  active_app?: string;
  attempted_app?: string;
  allowed_apps?: string[];
  target_module?: string;
  [key: string]: any;
}

export interface AuditLog {
  id: number;
  user: number | null;
  actor_username?: string | null;
  actor_name?: string | null;
  user_display: string;
  user_role?: string;
  warehouse: number | null;
  warehouse_name?: string;
  module: string;
  module_display: string;
  action: string;
  action_display: string;
  severity: 'info' | 'warning' | 'critical';
  severity_display: string;
  target_model?: string;
  target_object_id?: string;
  target_repr?: string;
  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;
  details?: AuditLogDetails;
  ip_address?: string | null;
  created_at: string;
}

export interface UserLoginLog {
  id: number;
  user: number | null;
  user_display: string;
  username_attempted: string;
  ip_address?: string | null;
  user_agent?: string | null;
  device_model?: string | null;
  status: 'SUCCESS' | 'DAILY_ACTIVE' | 'FAILED_CREDENTIALS' | 'FAILED_LOCKED' | 'FAILED_INACTIVE' | 'LOGOUT';
  status_display: string;
  failure_reason?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AuditStorageStats {
  db_total_bytes?: number;
  db_total_formatted?: string;
  audit_bytes?: number;
  audit_formatted?: string;
  audit_percent?: number;
  login_bytes?: number;
  login_formatted?: string;
  login_percent?: number;
  total_logs_bytes?: number;
  total_logs_formatted?: string;
  total_logs_percent?: number;
  avg_row_size_kb?: number;
}

export interface AuditStats {
  total_all_time: number;
  logs_24h?: number;
  audits_24h?: number;
  critical_24h?: number;
  critical_all_time?: number;
  critical_count?: number;
  warning_24h?: number;
  warning_all_time?: number;
  warning_count?: number;
  rollbacks_24h?: number;
  rollbacks_all_time?: number;
  security_all_time?: number;
  cross_app_denied_count?: number;
  app_switch_count?: number;
  warehouse_logs_count?: number;
  finance_logs_count?: number;
  module_breakdown: Record<string, number>;
  storage?: AuditStorageStats;
}

export interface LoginStats {
  total_all_time: number;
  logins_24h: number;
  success_24h: number;
  failed_24h: number;
  status_breakdown: Record<string, number>;
  storage?: AuditStorageStats;
}

export interface PurgeRequest {
  from_date?: string;
  to_date?: string;
  warehouse?: number | string;
  module?: string;
  days?: number | string;
  confirm_text?: string;
  dry_run?: boolean;
}

export interface PurgePreviewResponse {
  success: boolean;
  dry_run?: boolean;
  count: number;
  message?: string;
  purged_count?: number;
  error?: string;
}

export interface PointInTimeRollbackRecordItem {
  target_model: string;
  target_object_id: string;
  target_repr: string;
  logs_count: number;
  first_action: string;
  last_action: string;
  changes: RevertChangeItem[];
}

export interface PointInTimeRollbackPreview {
  can_rollback: boolean;
  has_conflict?: boolean;
  message?: string;
  total_logs: number;
  total_records: number;
  models_breakdown: Record<string, number>;
  target_datetime?: string;
  items_preview: PointInTimeRollbackRecordItem[];
  summary?: string;
}

export interface PointInTimeRollbackRequest {
  target_datetime: string;
  warehouse?: number | string;
  module?: string;
  target_model?: string;
  reason?: string;
}

export interface PointInTimeRollbackResult {
  success: boolean;
  reverted_count?: number;
  total_attempted?: number;
  errors?: string[];
  message?: string;
  error?: string;
}

export interface AuditFilters {
  user?: number | string;
  module?: string;
  action_type?: string;
  severity?: string;
  warehouse?: number | string;
  app_scope?: string;
  event?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface LoginFilters {
  user?: number | string;
  username?: string;
  status?: string;
  ip_address?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface ImportLog {
  id: number;
  user: number | null;
  user_display: string;
  project: number;
  project_name: string;
  original_filename: string;
  records_created: number;
  records_updated: number;
  errors: ImportError[];
  status: 'processing' | 'done' | 'failed';
  created_at: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface RevertChangeItem {
  field: string;
  label: string;
  current_value: string;
  target_revert_value: string;
  has_conflict: boolean;
}

export interface RevertPreviewResponse {
  can_revert: boolean;
  message?: string;
  has_conflict?: boolean;
  action?: string;
  action_display?: string;
  target_model?: string;
  target_object_id?: string;
  target_repr?: string;
  changes?: RevertChangeItem[];
  summary?: string;
}

export interface RevertResult {
  success: boolean;
  message?: string;
  error?: string;
  rollback_log_id?: number;
  success_count?: number;
  errors?: string[];
}

export interface ExportColumnOption {
  key: string;
  label: string;
  defaultChecked?: boolean;
}

export interface AuditExportRequest extends AuditFilters {
  format?: 'xlsx' | 'csv';
  columns?: string[];
}

export interface LoginExportRequest extends LoginFilters {
  format?: 'xlsx' | 'csv';
  columns?: string[];
}

export interface LockedUserItem {
  username: string;
  ip_address: string;
  failures: number;
  is_locked: boolean;
  attempt_time?: string | null;
  user_agent?: string;
}

export interface LockedUsersResponse {
  locked_users: LockedUserItem[];
  total_locked: number;
}

export interface UnlockUserRequest {
  username?: string;
  ip_address?: string;
}

export interface UnlockUserResponse {
  success: boolean;
  username?: string;
  ip_address?: string;
  message: string;
  error?: string;
}


