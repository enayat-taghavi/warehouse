import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  User,
  UserCreatePayload,
  UserUpdatePayload,
} from '../models/user.model';
import { Paginated } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class UserApiService {
  private readonly endpoint = 'users';

  constructor(private api: ApiService) {}

  /** لیست کاربران با فیلتر */
  getAll(filters?: {
    role?: number;
    project?: number;
    is_active?: boolean;
    search?: string;
    page?: number;
  }): Observable<Paginated<User>> {
    return this.api.get<Paginated<User>>(this.endpoint, filters as Record<string, unknown>);
  }

  /** جزئیات کاربر */
  getById(id: number): Observable<User> {
    return this.api.get<User>(`${this.endpoint}/${id}`);
  }

  /** ایجاد کاربر */
  create(payload: UserCreatePayload): Observable<User> {
    return this.api.post<User>(this.endpoint, payload);
  }

  /** ویرایش کاربر */
  update(id: number, payload: UserUpdatePayload): Observable<User> {
    return this.api.patch<User>(`${this.endpoint}/${id}`, payload);
  }

  /** تعلیق / فعال‌سازی */
  toggleSuspend(id: number): Observable<{ is_active: boolean }> {
    return this.api.post(`${this.endpoint}/${id}/suspend`);
  }

  /** بازنشانی رمز عبور به کد ملی */
  resetPassword(id: number): Observable<{ detail: string }> {
    return this.api.post(`${this.endpoint}/${id}/reset-password`);
  }
}
