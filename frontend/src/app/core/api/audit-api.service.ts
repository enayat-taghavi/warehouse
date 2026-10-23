import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import {
  AuditLog,
  UserLoginLog,
  AuditStats,
  LoginStats,
  AuditFilters,
  LoginFilters,
  RevertPreviewResponse,
  RevertResult,
  PurgeRequest,
  PurgePreviewResponse,
  PointInTimeRollbackPreview,
  PointInTimeRollbackRequest,
  PointInTimeRollbackResult,
  AuditExportRequest,
  LoginExportRequest,
  LockedUsersResponse,
  UnlockUserRequest,
  UnlockUserResponse
} from '../models/audit-log.model';
import { Paginated } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private readonly auditEndpoint = 'auth/audit-logs';
  private readonly loginEndpoint = 'auth/login-logs';

  constructor(
    private api: ApiService,
    private http: HttpClient
  ) {}

  /** دریافت لیست لاگ‌های ممیزی با فیلتر و صفحه‌بندی */
  getAuditLogs(filters?: AuditFilters): Observable<Paginated<AuditLog>> {
    return this.api.get<Paginated<AuditLog>>(this.auditEndpoint, filters as Record<string, unknown>);
  }

  /** دریافت اطلاعات تفصیلی یک لاگ ممیزی (شامل before_state و after_state) */
  getAuditLog(id: number): Observable<AuditLog> {
    return this.api.get<AuditLog>(`${this.auditEndpoint}/${id}`);
  }

  /** دریافت لیست لاگ‌های ورود کاربران با فیلتر و صفحه‌بندی */
  getLoginLogs(filters?: LoginFilters): Observable<Paginated<UserLoginLog>> {
    return this.api.get<Paginated<UserLoginLog>>(this.loginEndpoint, filters as Record<string, unknown>);
  }

  /** دریافت آمار ممیزی تغییرات */
  getAuditStats(warehouseId?: number | string): Observable<AuditStats> {
    const params = warehouseId ? { warehouse: warehouseId } : undefined;
    return this.api.get<AuditStats>(`${this.auditEndpoint}/stats`, params, {
      context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
    });
  }

  /** دریافت آمار ورود کاربران */
  getLoginStats(): Observable<LoginStats> {
    return this.api.get<LoginStats>(`${this.loginEndpoint}/stats`, undefined, {
      context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
    });
  }

  /** دانلود خروجی CSV ممیزی */
  exportAuditCsv(filters?: AuditFilters): Observable<Blob> {
    const url = `${environment.apiUrl}/${this.auditEndpoint}/export_csv/`;
    return this.http.get(url, {
      params: this.cleanParams(filters as Record<string, any>),
      responseType: 'blob'
    });
  }

  /** دانلود خروجی CSV تاریخچه ورود */
  exportLoginCsv(filters?: LoginFilters): Observable<Blob> {
    const url = `${environment.apiUrl}/${this.loginEndpoint}/export_csv/`;
    return this.http.get(url, {
      params: this.cleanParams(filters as Record<string, any>),
      responseType: 'blob'
    });
  }

  /** دانلود خروجی اکسل/CSV ممیزی با فیلترها و ستون‌های انتخابی */
  exportAuditExcel(options?: AuditExportRequest): Observable<Blob> {
    const url = `${environment.apiUrl}/${this.auditEndpoint}/export_excel/`;
    return this.http.post(url, options || {}, {
      responseType: 'blob'
    });
  }

  /** دانلود خروجی اکسل/CSV تاریخچه ورود با فیلترها و ستون‌های انتخابی */
  exportLoginExcel(options?: LoginExportRequest): Observable<Blob> {
    const url = `${environment.apiUrl}/${this.loginEndpoint}/export_excel/`;
    return this.http.post(url, options || {}, {
      responseType: 'blob'
    });
  }

  /** استعلام وضعیت کاربران مسدودشده در ضدنفوذ */
  getLockedUsers(): Observable<LockedUsersResponse> {
    return this.api.get<LockedUsersResponse>(`${this.loginEndpoint}/locked_users`, undefined, {
      context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
    });
  }

  /** رفع مسدودیت و بازنشانی قفل کاربر */
  resetUserLockout(req: UnlockUserRequest): Observable<UnlockUserResponse> {
    return this.api.post<UnlockUserResponse>(`${this.loginEndpoint}/reset_lockout`, req);
  }

  /** پیش‌نمایش تفاوت‌های بازگردانی لاگ */
  previewRevert(logId: number): Observable<RevertPreviewResponse> {
    return this.api.get<RevertPreviewResponse>(`${this.auditEndpoint}/${logId}/preview_revert`);
  }

  /** اجرای بازگردانی یک لاگ */
  revertLog(logId: number, reason?: string): Observable<RevertResult> {
    return this.api.post<RevertResult>(`${this.auditEndpoint}/${logId}/revert`, { reason });
  }

  /** اجرای بازگردانی گروهی لاگ‌ها */
  bulkRevert(logIds: number[], reason?: string): Observable<RevertResult> {
    return this.api.post<RevertResult>(`${this.auditEndpoint}/bulk_revert`, { log_ids: logIds, reason });
  }

  /** پیش‌نمایش پاکسازی لاگ‌ها (تعداد رکوردهای مشمول حذف) */
  getPurgePreview(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.post<PurgePreviewResponse>(`${this.auditEndpoint}/purge`, { ...req, dry_run: true });
  }

  /** پاکسازی قطعی لاگ‌های ممیزی با تاییدیه */
  purgeLogs(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.post<PurgePreviewResponse>(`${this.auditEndpoint}/purge`, { ...req, dry_run: false });
  }

  /** پیش‌نمایش پاکسازی لاگ‌های ورود (تعداد رکوردهای مشمول حذف) */
  getLoginPurgePreview(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.post<PurgePreviewResponse>(`${this.loginEndpoint}/purge`, { ...req, dry_run: true });
  }

  /** پاکسازی قطعی لاگ‌های ورود با تاییدیه */
  purgeLoginLogs(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.post<PurgePreviewResponse>(`${this.loginEndpoint}/purge`, { ...req, dry_run: false });
  }

  /** پیش‌نمایش بازگردانی زنجیره‌ای به یک تاریخ مشخص */
  previewPointInTimeRollback(req: PointInTimeRollbackRequest): Observable<PointInTimeRollbackPreview> {
    return this.api.post<PointInTimeRollbackPreview>(`${this.auditEndpoint}/preview_point_in_time_rollback`, req);
  }

  /** اجرای بازگردانی زنجیره‌ای و اتمیک به یک تاریخ مشخص */
  executePointInTimeRollback(req: PointInTimeRollbackRequest): Observable<PointInTimeRollbackResult> {
    return this.api.post<PointInTimeRollbackResult>(`${this.auditEndpoint}/execute_point_in_time_rollback`, req);
  }

  private cleanParams(params?: Record<string, any>): Record<string, string | number | boolean> {
    if (!params) return {};
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }
}


