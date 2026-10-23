import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  Role,
  RoleCreatePayload,
  RoleUpdatePayload,
  Permission,
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class RoleApiService {
  private readonly endpoint = 'roles';

  constructor(private api: ApiService) {}

  /** لیست نقش‌ها — سلسله‌مراتبی */
  getAll(): Observable<Role[]> {
    return this.api.get<Role[]>(this.endpoint);
  }

  /** جزئیات نقش */
  getById(id: number): Observable<Role> {
    return this.api.get<Role>(`${this.endpoint}/${id}`);
  }

  /** ایجاد نقش */
  create(payload: RoleCreatePayload): Observable<Role> {
    return this.api.post<Role>(this.endpoint, payload);
  }

  /** ویرایش نقش */
  update(id: number, payload: RoleUpdatePayload): Observable<Role> {
    return this.api.patch<Role>(`${this.endpoint}/${id}`, payload);
  }

  /** حذف نقش (فقط اگر کاربر و زیرمجموعه نداشته باشد) */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }

  /** لیست تمام دسترسی‌های سیستمی */
  getPermissions(): Observable<Permission[]> {
    return this.api.get<Permission[]>('permissions');
  }
}
