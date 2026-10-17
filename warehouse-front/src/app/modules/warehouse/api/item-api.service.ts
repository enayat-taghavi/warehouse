import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpEvent } from '@angular/common/http';
import { ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Item,
} from '../../../core/models/item.model';
import { Paginated } from '../../../core/models/api-response.model';
import { ImportLog } from '../../../core/models/audit-log.model';
import { environment } from '../../../../environments/environment';
import { resolveServerUrl } from '../../../core/platform/server-origin';

@Injectable({ providedIn: 'root' })
export class ItemApiService {
  private readonly endpoint = 'inventory/items';

  constructor(private api: ApiService, private auth: AuthService) {}

  /** لیست رکوردها + فیلتر + مرتب‌سازی + صفحه‌بندی */
  getAll(filters?: any): Observable<Paginated<Item>> {
    return this.api.get<Paginated<Item>>(this.endpoint, filters as globalThis.Record<string, unknown>);
  }

  /** آمار داشبورد */
  getDashboardStats(projectId?: string): Observable<any> {
    return this.api.get<any>(`${this.endpoint}/dashboard_stats/`, projectId && projectId !== 'ALL' ? { project_id: projectId } : {});
  }

  /** جزئیات یک رکورد */
  getById(id: string): Observable<Item> {
    return this.api.get<Item>(`${this.endpoint}/${id}/`);
  }

  /** ایجاد رکورد */
  create(payload: any): Observable<Item> {
    return this.api.post<Item>(`${this.endpoint}/`, payload);
  }

  /** ویرایش رکورد */
  update(id: string, payload: any): Observable<Item> {
    return this.api.patch<Item>(`${this.endpoint}/${id}/`, payload);
  }

  /** حذف رکورد */
  delete(id: string | number): Observable<any> {
    return this.api.delete<any>(`${this.endpoint}/${id}/`);
  }

  /** ویرایش دسته‌ای (Inline Edit) */
  bulkUpdate(records: any[]): Observable<{ success: string }> {
    return this.api.post<{ success: string }>(`${this.endpoint}/bulk_update/`, records);
  }

  // ────────── عملیات دسته‌ای ──────────

  bulkImport(file: File, warehouseId: string | number, conflictStrategy: string, importTag: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('warehouse_id', warehouseId ? warehouseId.toString() : '');
    formData.append('conflict_strategy', conflictStrategy);
    formData.append('import_tag', importTag);
    return this.api.upload<any>(`${this.endpoint}/import_excel/`, formData);
  }

  revertImport(importId: string): Observable<any> {
    return this.api.post<any>(`${this.endpoint}/revert_import/`, { import_id: importId });
  }

  clearWarehouseData(warehouseId: string | number): Observable<any> {
    return this.api.post<any>(`${this.endpoint}/clear_warehouse_data/`, { warehouse_id: warehouseId });
  }

  getLatestImport(warehouseId: string | number): Observable<any> {
    return this.api.get<any>(`${this.endpoint}/latest_import/`, { warehouse_id: warehouseId.toString() });
  }

  deleteFromExcel(file: File, warehouseId: string | number): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('warehouse_id', warehouseId.toString());
    return this.api.upload<any>(`${this.endpoint}/delete_from_excel/`, formData);
  }

  async bulkImportStream(file: File, warehouseId: string | number, conflictStrategy: string, importTag: string, importId: string, isPreCounted: boolean = false, isDocPreApproved: boolean = false): Promise<Response> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('warehouse_id', warehouseId ? warehouseId.toString() : '');
    formData.append('conflict_strategy', conflictStrategy);
    formData.append('import_tag', importTag);
    formData.append('import_id', importId);
    formData.append('is_pre_counted', isPreCounted ? 'true' : 'false');
    formData.append('is_doc_pre_approved', isDocPreApproved ? 'true' : 'false');
    
    const token = this.auth.getAccessToken();
    const cleanEndpoint = this.endpoint.replace(/^\/|\/$/g, '');
    const url = `${environment.apiUrl}/${cleanEndpoint}/import_excel/`;
    
    return fetch(resolveServerUrl(url), {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }

  cancelImport(importId: string): Observable<any> {
    return this.api.post(`${this.endpoint}/cancel_import/`, { import_id: importId });
  }

  parseHeaders(file: File, warehouseId?: string | number): Observable<HttpEvent<any>> {
    const formData = new FormData();
    formData.append('file', file);
    if (warehouseId) {
      formData.append('warehouse_id', warehouseId.toString());
    }
    return this.api.uploadWithProgress(`${this.endpoint}/parse_headers/`, formData);
  }

  /** تگ‌گذاری دسته‌ای */
  bulkTag(payload: any): Observable<{ updated: number }> {
    return this.api.post(`${this.endpoint}/bulk_tag/`, payload);
  }

  /** تخصیص دسته‌ای به تیم میدانی یا اسناد */
  bulkDispatch(payload: any): Observable<any> {
    return this.api.post(`${this.endpoint}/bulk_assign/`, payload);
  }

  // ────────── خروجی ──────────

  /** خروجی Excel رکوردها */
  exportExcel(payload: any): Observable<Blob> {
    return this.api.downloadPost(`${this.endpoint}/export_excel/`, payload);
  }

  /** دریافت نام و عنوان فیلدهای قابل استخراج */
  getExportColumns(warehouseId?: string | number): Observable<{key: string, label: string}[]> {
    const params = warehouseId ? { warehouse_id: warehouseId } : {};
    return this.api.get<{key: string, label: string}[]>(`${this.endpoint}/export_columns/`, params);
  }

  /** دریافت فایل قالب نمونه */
  downloadTemplate(warehouseId?: string | number): Observable<Blob> {
    const params = warehouseId ? { warehouse_id: warehouseId } : {};
    return this.api.download(`${this.endpoint}/download_template/`, params);
  }

  /** دانلود فایل لاگ خطاهای ایمپورت اکسل */
  downloadImportLog(importId: string): Observable<Blob> {
    return this.api.download(`${this.endpoint}/download_import_log/`, { import_id: importId });
  }

  /** خروجی PDF رکوردها */
  exportPdf(filters?: any): Observable<Blob> {
    return this.api.download('reports/records/pdf', filters as globalThis.Record<string, unknown>);
  }
}
