import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditApiService } from '../../../../core/api/audit-api.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
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
} from '../../../../core/models/audit-log.model';
import { Paginated } from '../../../../core/models/api-response.model';

@Injectable()
export class AuditFacade {
  private api = inject(AuditApiService);
  private toast = inject(ToastService);

  // ═════════════════════════════════════════════════════════════════════
  // ۱. دریافت لاگ‌ها و آمار حجم و تراکنش‌ها
  // ═════════════════════════════════════════════════════════════════════
  getAuditLogs(filters?: AuditFilters): Observable<Paginated<AuditLog>> {
    return this.api.getAuditLogs(filters);
  }

  getAuditLog(id: number): Observable<AuditLog> {
    return this.api.getAuditLog(id);
  }

  getLoginLogs(filters?: LoginFilters): Observable<Paginated<UserLoginLog>> {
    return this.api.getLoginLogs(filters);
  }

  getAuditStats(warehouseId?: number | string): Observable<AuditStats> {
    return this.api.getAuditStats(warehouseId);
  }

  getLoginStats(): Observable<LoginStats> {
    return this.api.getLoginStats();
  }

  getLockedUsers(): Observable<LockedUsersResponse> {
    return this.api.getLockedUsers();
  }

  resetUserLockout(req: UnlockUserRequest): Observable<UnlockUserResponse> {
    return this.api.resetUserLockout(req);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۲. پیش‌نمایش بازگردانی و عملیات رول‌بک نقطه در زمان
  // ═════════════════════════════════════════════════════════════════════
  previewRollback(logId: number): Observable<RevertPreviewResponse> {
    return this.api.previewRevert(logId);
  }

  revertLog(logId: number, reason?: string): Observable<RevertResult> {
    return this.api.revertLog(logId, reason);
  }

  bulkRevert(logIds: number[], reason?: string): Observable<RevertResult> {
    return this.api.bulkRevert(logIds, reason);
  }

  previewPointInTimeRollback(req: PointInTimeRollbackRequest): Observable<PointInTimeRollbackPreview> {
    return this.api.previewPointInTimeRollback(req);
  }

  executePointInTimeRollback(req: PointInTimeRollbackRequest): Observable<PointInTimeRollbackResult> {
    return this.api.executePointInTimeRollback(req);
  }

  getPurgePreview(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.getPurgePreview(req);
  }

  purgeLogs(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.purgeLogs(req);
  }

  getLoginPurgePreview(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.getLoginPurgePreview(req);
  }

  purgeLoginLogs(req: PurgeRequest): Observable<PurgePreviewResponse> {
    return this.api.purgeLoginLogs(req);
  }

  // ═════════════════════════════════════════════════════════════════════
  // ۳. خروجی و اکسپورت اکسل / CSV لاگ‌ها
  // ═════════════════════════════════════════════
  exportAuditLogs(options?: AuditExportRequest): Observable<Blob> {
    return this.api.exportAuditExcel(options);
  }

  exportLoginLogs(options?: LoginExportRequest): Observable<Blob> {
    return this.api.exportLoginExcel(options);
  }
}
