export interface SystemSettingsConfig {
  require_supervisor_approval: boolean;
  require_doc_supervisor_approval: boolean;
  blind_counting: 'blind' | 'visible';
  default_conflict_strategy: 'ignore' | 'replace' | 'update_empty' | 'log';
  system_version?: string;
  offline_sync_interval_minutes: number;
  offline_cache_ttl_minutes: number;
  field_permissions_counter: Record<string, FieldPermission>;
  field_permissions_doc: Record<string, FieldPermission>;
  scanner_row_delimiter: string;
  scanner_col_delimiter: string;
  counter_can_view_history: boolean;
  counter_can_view_previous_notes: boolean;
  financial_can_view_history: boolean;
  financial_can_view_previous_notes: boolean;
  scanner_camera_preset: 'adaptive' | 'ultra' | 'high' | 'balanced' | 'lite' | 'custom';
  scanner_custom_resolution: '2k_1440p' | '1080p' | '720p' | '480p';
  scanner_custom_interval_ms: number;
  scanner_custom_roi_size: number;
  scanner_custom_try_harder: boolean;
  chat_enabled: boolean;
  chat_file_sharing: boolean;
  [key: string]: any; // To support future fields temporarily
}

export interface FieldPermission {
  visible: boolean;
  editable: boolean;
  custom_label: string;
}
