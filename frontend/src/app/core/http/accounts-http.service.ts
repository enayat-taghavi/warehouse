import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Permission {
  id: number;
  name: string;
  codename: string;
  is_sensitive?: boolean;
}

export interface Role {
  id: number;
  name: string;
  title: string;
  color: string;
  permissions: number[];
  user_ids?: number[];
  users_count?: number;
  children?: Role[];
}

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  national_code: string;
  phone_number: string;
  operational_zone: string;
  company?: string;
  address?: string;
  avatar?: string | null;
  blood_type?: string | null;
  emergency_contact?: string | null;
  supervisor: number | null;
  is_active: boolean;
  groups: number[];
  roles?: string[];
  role_titles?: string[];
  assigned_warehouses: string[];
  company_ids?: number[];
  default_company_id?: number | null;
  company_accesses?: Array<{
    company_id: number;
    company_name: string;
    company_code: string;
    role_in_company?: string;
    is_default: boolean;
  }>;
  user_permissions?: any[];
}

export interface ImportResult {
  success: boolean;
  dry_run?: boolean;
  summary: {
    total_rows: number;
    created: number;
    updated: number;
    skipped: number;
    valid_count?: number;
    error_count?: number;
  };
  preview_rows?: Array<{
    row: number;
    name: string;
    username: string;
    national_code?: string;
    phone_number?: string;
    roles?: string;
    warehouses?: string;
    is_update?: boolean;
    is_active?: boolean;
  }>;
  errors: { row: number; field: string; message: string }[];
  /** رمزهای یک‌بارمصرف کاربران تازه (فقط یک بار برگردانده می‌شود) */
  one_time_passwords?: { row: number; username: string; one_time_password: string }[];
}

@Injectable({ providedIn: 'root' })
export class AccountsHttpService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getUsers(has_perm?: string): Observable<User[]> {
    let url = `${this.apiUrl}/auth/users/`;
    if (has_perm) {
      url += `?has_perm=${has_perm}`;
    }
    return this.http.get<any>(url).pipe(
      map(res => res.results !== undefined ? res.results : res)
    );
  }

  getUser(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/users/${id}/`);
  }

  createUser(data: any): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/users/`, data);
  }

  updateUser(id: number, data: any): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/auth/users/${id}/`, data);
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/auth/users/${id}/`);
  }

  /** بازنشانی رمز توسط مدیر؛ سرور رمز یک‌بارمصرف `one_time_password` برمی‌گرداند */
  adminResetPassword(id: number): Observable<{ one_time_password?: string; detail?: string; message?: string }> {
    return this.http.post<{ one_time_password?: string; detail?: string; message?: string }>(`${this.apiUrl}/auth/users/${id}/admin_reset_password/`, {});
  }

  toggleUserStatus(id: number, isActive?: boolean): Observable<any> {
    const body = isActive !== undefined ? { is_active: isActive } : {};
    return this.http.patch(`${this.apiUrl}/auth/users/${id}/toggle_status/`, body);
  }

  getRoles(): Observable<Role[]> {
    return this.http.get<any>(`${this.apiUrl}/auth/roles/`).pipe(
      map(res => res.results !== undefined ? res.results : res)
    );
  }

  createRole(data: any): Observable<Role> {
    return this.http.post<Role>(`${this.apiUrl}/auth/roles/`, data);
  }

  updateRole(id: number, data: any): Observable<Role> {
    return this.http.put<Role>(`${this.apiUrl}/auth/roles/${id}/`, data);
  }

  deleteRole(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/auth/roles/${id}/`);
  }

  getPermissions(): Observable<Permission[]> {
    return this.http.get<any>(`${this.apiUrl}/auth/permissions/`).pipe(
      map(res => res.results !== undefined ? res.results : res)
    );
  }

  // ── Users Excel ──────────────────────────────────────────────────
  exportUsersExcel(ids?: number[]): Observable<Blob> {
    const params: any = {};
    if (ids && ids.length > 0) {
      params.ids = ids.join(',');
    }
    return this.http.get(`${this.apiUrl}/auth/users/export_excel/`, {
      params,
      responseType: 'blob'
    });
  }

  importUsersExcel(file: File, updateExisting: boolean = false, dryRun: boolean = false): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('update_existing', String(updateExisting));
    formData.append('dry_run', String(dryRun));
    return this.http.post<ImportResult>(`${this.apiUrl}/auth/users/import_excel/`, formData);
  }

  downloadUsersTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/auth/users/download_template/`, { responseType: 'blob' });
  }

  // ── Roles Excel ──────────────────────────────────────────────────
  exportRolesExcel(ids?: number[]): Observable<Blob> {
    const params: any = {};
    if (ids && ids.length > 0) {
      params.ids = ids.join(',');
    }
    return this.http.get(`${this.apiUrl}/auth/roles/export_excel/`, { params, responseType: 'blob' });
  }

  importRolesExcel(file: File, updateExisting: boolean = false, dryRun: boolean = false): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('update_existing', String(updateExisting));
    formData.append('dry_run', String(dryRun));
    return this.http.post<ImportResult>(`${this.apiUrl}/auth/roles/import_excel/`, formData);
  }

  downloadRolesTemplate(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/auth/roles/download_template/`, { responseType: 'blob' });
  }

  // ── Avatar Management ────────────────────────────────────────────
  updateMyAvatar(file: Blob): Observable<{ success: boolean; avatar: string; message: string }> {
    const formData = new FormData();
    formData.append('avatar', file, 'avatar.webp');
    return this.http.post<any>(`${this.apiUrl}/auth/users/me/avatar/`, formData);
  }

  deleteMyAvatar(): Observable<{ success: boolean; avatar: null; message: string }> {
    return this.http.delete<any>(`${this.apiUrl}/auth/users/me/avatar/`);
  }

  updateUserAvatar(userId: number, file: Blob): Observable<{ success: boolean; avatar: string; message: string }> {
    const formData = new FormData();
    formData.append('avatar', file, 'avatar.webp');
    return this.http.post<any>(`${this.apiUrl}/auth/users/${userId}/avatar/`, formData);
  }

  deleteUserAvatar(userId: number): Observable<{ success: boolean; avatar: null; message: string }> {
    return this.http.delete<any>(`${this.apiUrl}/auth/users/${userId}/avatar/`);
  }

  // ── Axes Lockout Management ──────────────────────────────────────
  getLockedStatus(): Observable<{ locked_users: any[]; total_locked: number }> {
    return this.http.get<any>(`${this.apiUrl}/auth/login-logs/locked_status/`);
  }

  resetLockout(username: string, ipAddress?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login-logs/reset_lockout/`, { username, ip_address: ipAddress });
  }
}
