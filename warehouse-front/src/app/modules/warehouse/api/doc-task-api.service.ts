import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../../core/api/api.service';
import { Paginated } from '../../../core/models/api-response.model';
import { DocTask } from '../models/doc-task.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DocTaskApiService {
  private readonly endpoint = 'inventory/doc-tasks';

  constructor(private api: ApiService, private http: HttpClient) {}

  getAll(filters?: any): Observable<Paginated<DocTask> | DocTask[]> {
    return this.api.get<Paginated<DocTask>>(this.endpoint, filters as Record<string, unknown>);
  }

  getById(id: number | string): Observable<DocTask> {
    return this.api.get<DocTask>(`${this.endpoint}/${id}/`);
  }

  update(id: number | string, payload: Partial<DocTask>): Observable<DocTask> {
    return this.api.patch<DocTask>(`${this.endpoint}/${id}/`, payload);
  }

  /** استخر تسک‌های بدون صاحب */
  poolTasks(params: { warehouse_id?: number | string; as_role: string }): Observable<DocTask[]> {
    return this.http.get<DocTask[]>(`${environment.apiUrl}/${this.endpoint}/pool_tasks/`, { params: params as any });
  }

  /** گرفتن تسک‌ها از استخر */
  claimTasks(taskIds: number[], asRole: string): Observable<{ success: boolean; claimed_count: number }> {
    return this.http.post<{ success: boolean; claimed_count: number }>(
      `${environment.apiUrl}/${this.endpoint}/claim_tasks/`,
      { task_ids: taskIds, as_role: asRole }
    );
  }

  /** ارسال تسک‌های بررسی‌شده به سرپرست یا مدیر */
  bulkSubmit(payload: { task_ids?: number[] } = {}): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/${this.endpoint}/bulk_submit/`,
      payload
    );
  }

  /** تأیید سرپرست → DOC_MANAGER_REVIEW */
  bulkApprove(taskIds: number[], note: string = ''): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/${this.endpoint}/bulk_approve/`,
      { task_ids: taskIds, note }
    );
  }

  /** رد سرپرست → DOC_SUPERVISOR_REJECTED */
  reject(taskIds: number[], note: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/${this.endpoint}/reject/`,
      { task_ids: taskIds, note }
    );
  }

  /** رد مدیر → DOC_MANAGER_REJECTED */
  managerReject(taskIds: number[], note: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/${this.endpoint}/manager_reject/`,
      { task_ids: taskIds, note }
    );
  }

  /** تأیید نهایی مدیر → DOC_FINAL_APPROVED */
  bulkManagerApprove(taskIds: number[], note: string = ''): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/${this.endpoint}/bulk_manager_approve/`,
      { task_ids: taskIds, note }
    );
  }

  /** دریافت ستون‌های خروجی اکسل */
  getExportColumns(params?: any): Observable<{key: string, label: string}[]> {
    return this.http.get<{key: string, label: string}[]>(`${environment.apiUrl}/${this.endpoint}/get_export_columns/`, { params: params as any });
  }

  /** دریافت فایل اکسل */
  exportExcel(payload: any): Observable<Blob> {
    return this.http.post(
      `${environment.apiUrl}/${this.endpoint}/export_excel/`,
      payload,
      { responseType: 'blob' }
    );
  }

  /** دانلود قالب اکسل نمونه آزمایشی با فیلدهای داینامیک و سلول‌های کشویی */
  downloadTemplate(warehouseId?: number | string | null): Observable<Blob> {
    const params: any = {};
    if (warehouseId && strVal(warehouseId) !== 'ALL' && strVal(warehouseId) !== '-1') {
      params.warehouse_id = warehouseId;
    }
    return this.http.get(
      `${environment.apiUrl}/${this.endpoint}/download_template/`,
      { params, responseType: 'blob' }
    );
  }
}

function strVal(v: any): string {
  return v !== null && v !== undefined ? String(v) : '';
}
