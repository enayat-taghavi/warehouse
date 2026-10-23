import { Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, Subject, from, map, switchMap, of, takeUntil, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import {
  EntityFieldsResponse,
  ExportOutcome,
  ReportEntity,
  ReportExportJob,
  ReportResult,
  ReportSpec,
  ReportTemplate,
} from '../models/report.model';

/**
 * سرویس API گزارش‌ساز — همه درخواست‌ها با SKIP_OFFLINE ارسال می‌شوند تا
 * هرگز وارد کش/صف آفلاین (Dexie) نشوند. گزارش‌گیری فقط-آنلاین است.
 */
@Injectable({ providedIn: 'root' })
export class ReportApiService {
  private readonly base = `${environment.apiUrl}/reports/`;

  constructor(private http: HttpClient) {}

  /** کانتکست تازه برای هر درخواست (HttpContext قابل اشتراک نیست) */
  private ctx(): HttpContext {
    return new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);
  }

  getEntities(): Observable<ReportEntity[]> {
    return this.http.get<ReportEntity[]>(`${this.base}entities/`, { context: this.ctx() });
  }

  getFields(entityKey: string, warehouseId?: number | null): Observable<EntityFieldsResponse> {
    let params = new HttpParams();
    if (warehouseId) params = params.set('warehouse_id', String(warehouseId));
    return this.http.get<EntityFieldsResponse>(
      `${this.base}entities/${entityKey}/fields/`,
      { params, context: this.ctx() },
    );
  }

  run(spec: ReportSpec): Observable<ReportResult> {
    return this.http.post<ReportResult>(`${this.base}run/`, spec, { context: this.ctx() });
  }

  /**
   * خروجی Excel ترکیبی:
   * - 200 با blob → فایل آماده است (دانلود فوری)
   * - 202 با JSON → job پس‌زمینه ساخته شده (باید poll شود)
   */
  export(spec: ReportSpec): Observable<ExportOutcome> {
    const exportCtx = this.ctx().set(SKIP_GLOBAL_ERROR_TOAST, true);
    return this.http
      .post(`${this.base}export/`, spec, {
        responseType: 'blob',
        observe: 'response',
        context: exportCtx,
      })
      .pipe(
        switchMap((res) => {
          if (res.status === 202) {
            // بدنه blob است ولی محتوایش JSON job — بازگشایی
            if (!res.body) {
              return throwError(() => new Error('پاسخ سرور خالی بود — دوباره تلاش کنید.'));
            }
            return from(res.body.text()).pipe(
              map((txt) => {
                const j = JSON.parse(txt);
                return {
                  kind: 'job',
                  jobId: j.job_id,
                  totalRows: j.total_rows,
                } as ExportOutcome;
              }),
            );
          }
          if (!res.body) {
            return throwError(() => new Error('پاسخ سرور خالی بود — دوباره تلاش کنید.'));
          }
          return of({ kind: 'file', blob: res.body } as ExportOutcome);
        }),
      );
  }

  getExportJob(jobId: number): Observable<ReportExportJob> {
    return this.http.get<ReportExportJob>(`${this.base}exports/${jobId}/`, { context: this.ctx() });
  }

  getExportJobs(): Observable<ReportExportJob[]> {
    return this.http.get<ReportExportJob[]>(`${this.base}exports/`, { context: this.ctx() });
  }

  downloadExportFile(jobId: number): Observable<Blob> {
    return this.http.get(`${this.base}exports/${jobId}/download/`, {
      responseType: 'blob',
      context: this.ctx(),
    });
  }

  // ------------------------------------------------------------ قالب‌ها
  getTemplates(): Observable<ReportTemplate[]> {
    return this.http.get<ReportTemplate[]>(`${this.base}templates/`, { context: this.ctx() });
  }

  createTemplate(data: Partial<ReportTemplate>): Observable<ReportTemplate> {
    return this.http.post<ReportTemplate>(`${this.base}templates/`, data, { context: this.ctx() });
  }

  updateTemplate(id: number, data: Partial<ReportTemplate>): Observable<ReportTemplate> {
    return this.http.patch<ReportTemplate>(`${this.base}templates/${id}/`, data, { context: this.ctx() });
  }

  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}templates/${id}/`, { context: this.ctx() });
  }
}
