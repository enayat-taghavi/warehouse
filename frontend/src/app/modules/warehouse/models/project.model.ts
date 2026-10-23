/**
 * مدل‌های مربوط به انبارها / پروژه‌ها
 * مطابق با Django warehouse.Project model
 */

export type ProjectStatus = 'active' | 'configured' | 'frozen' | 'deleted';

export interface Project {
  id: number;
  code: string;
  name: string;
  manager_name: string;
  location: string;
  total_records: number;
  completed_records: number;
  status: ProjectStatus;
  color: string;
  created_at: string;
  /** درصد پیشرفت — محاسبه شده */
  progress_percent: number;
}

export interface ProjectCreatePayload {
  code: string;
  name: string;
  manager_name: string;
  location: string;
  status?: ProjectStatus;
  color?: string;
}

export type ProjectUpdatePayload = Partial<ProjectCreatePayload>;

export interface ProjectStats {
  total_records: number;
  completed_records: number;
  counting_records: number;
  feeding_records: number;
  archived_records: number;
  progress_percent: number;
}
