/**
 * مدل‌های مربوط به کاربران و پرسنل
 * مطابق با Django accounts.User model
 */

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  national_code: string | null;
  phone_number: string | null;
  operational_zone: string | null;
  supervisor_id: number | null;
  address: string;
  avatar_letter: string;
  company: string;
  is_active: boolean;
  expiry_date: string | null;
  date_joined: string;
  last_login: string | null;
  updated_at: string;
  created_by: number | null;
  modified_by: number | null;
  roles: Role[];
  role_ids: number[];
  projects: ProjectRef[];
  project_ids: number[];
}

export interface UserCreatePayload {
  username: string;
  password?: string;
  first_name: string;
  last_name: string;
  email?: string;
  national_code?: string;
  phone_number?: string;
  operational_zone?: string;
  supervisor_id?: number | null;
  address?: string;
  company?: string;
  is_active?: boolean;
  expiry_date?: string | null;
  role_ids: number[];
  project_ids: number[];
}

export type UserUpdatePayload = Partial<Omit<UserCreatePayload, 'username'>>;

export interface Role {
  id: number;
  title: string;
  parent_id: number | null;
  color: string;
  permissions: Permission[];
  permission_ids: string[];
  children?: Role[];
}

export interface RoleCreatePayload {
  title: string;
  parent_id: number | null;
  color: string;
  permission_ids: string[];
}

export type RoleUpdatePayload = Partial<RoleCreatePayload>;

export interface Permission {
  id: number;
  code: string;
  title: string;
  group: PermissionGroup;
}

export type PermissionGroup = 'SYS' | 'WH' | 'REC' | 'USR';

/** مرجع خلاصه‌شده پروژه (برای نمایش درون User) */
export interface ProjectRef {
  id: number;
  code: string;
  name: string;
}
