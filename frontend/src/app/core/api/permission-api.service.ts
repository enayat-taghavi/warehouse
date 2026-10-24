import { Injectable } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import {
  PermissionCatalog,
  PermissionMap,
  RoleBundleDetail,
  UserPermissionsDetail,
  UserPermissionsUpdate,
} from '../models/permission.model';

const ACCOUNTS = 'accounts';

/**
 * API مجوزهای ریز (طرح ۲.۲). کدها کدنام خالی مجوزند (`perm_x`)؛ کلیدهای عددی دیکشنری‌ها در JSON رشته‌اند.
 * خواندن‌های پس‌زمینه (`silent`) از کش آفلاین interceptor نمی‌گذرند و تُست خطای سراسری نمی‌دهند؛
 * نگه‌داری آفلاین کار PermissionService است.
 */
@Injectable({ providedIn: 'root' })
export class PermissionApiService {
  constructor(private api: ApiService) {}

  private static silent(): { context: HttpContext } {
    return { context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true) };
  }

  /** فهرست کامل: دسته‌ها، مجوزها، نقش‌های انتساب و بسته‌ها (superuser، view_sys_users یا perm_usr_role) */
  getCatalog(silent = false): Observable<PermissionCatalog> {
    return this.api.get<PermissionCatalog>(`${ACCOUNTS}/permission-catalog`, undefined, silent ? PermissionApiService.silent() : undefined);
  }

  /** نقشهٔ مجوزهای کاربر جاری (همان `user.permission_map` لاگین) */
  getMyPermissions(silent = true): Observable<PermissionMap> {
    return this.api.get<PermissionMap>(`${ACCOUNTS}/my-permissions`, undefined, silent ? PermissionApiService.silent() : undefined);
  }

  /** ویرایش بستهٔ نقش انتساب (فقط superuser): فهرست نهایی مؤثر؛ سرور فقط تفاوت با پیش‌فرض را نگه می‌دارد */
  updateRoleBundle(roleKey: string, effective: string[]): Observable<RoleBundleDetail> {
    return this.api.put<RoleBundleDetail>(`${ACCOUNTS}/role-bundles/${encodeURIComponent(roleKey)}`, { effective });
  }

  /** بازگشت بستهٔ نقش به پیش‌فرض ماژول‌ها (فقط superuser) */
  resetRoleBundle(roleKey: string): Observable<RoleBundleDetail> {
    return this.api.post<RoleBundleDetail>(`${ACCOUNTS}/role-bundles/${encodeURIComponent(roleKey)}/reset`, {});
  }

  /** مجوزهای یک کاربر: انتساب‌ها، سامانه‌ای و تفاوت هر شرکت، و قفل‌های ویرایش (ت۱۰) */
  getUserPermissions(userId: number): Observable<UserPermissionsDetail> {
    return this.api.get<UserPermissionsDetail>(`${ACCOUNTS}/users/${userId}/permissions`);
  }

  /**
   * جایگزینی همهٔ تفاوت‌های یک دامنه (`company_id` = شرکت برای مجوز بخشی، null برای سامانه‌ای).
   * همیشه فهرست کامل add/remove آن دامنه (از GET) را بفرستید، نه فقط کد تغییرکرده.
   */
  updateUserPermissions(userId: number, body: UserPermissionsUpdate): Observable<UserPermissionsDetail> {
    return this.api.put<UserPermissionsDetail>(`${ACCOUNTS}/users/${userId}/permissions`, body);
  }
}
