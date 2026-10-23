import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_GLOBAL_ERROR_TOAST } from '../../../core/error/error.interceptor';

export interface LabelElement {
  id: string;
  type: 'text' | 'qrcode' | 'special';
  field: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAlign: 'right' | 'center' | 'left';
  prefix?: string;
  suffix?: string;
  wrapText?: boolean;
}

export interface LabelTemplate {
  id?: number;
  warehouse: number | null;
  name: string;
  width_mm: number;
  height_mm: number;
  qr_source_field: string;
  elements: LabelElement[];
  paper_type: string;
  grid_rows: number;
  grid_cols: number;
  margin_mm: number;
  is_active: boolean;
}

export interface AvailableField {
  key: string;
  label: string;
  group: string;
}

@Injectable({
  providedIn: 'root'
})
export class LabelApiService {
  private apiUrl = `${environment.apiUrl}/warehouses/label-templates`;

  constructor(private http: HttpClient) {}

  /** Get the active template for a warehouse (with Global fallback) */
  getActiveTemplate(warehouseId: number | null): Observable<LabelTemplate> {
    const params: any = {};
    if (warehouseId) params.warehouse = warehouseId;
    return this.http.get<LabelTemplate>(`${this.apiUrl}/active/`, { params });
  }

  /** List all templates optionally filtered by warehouse */
  listTemplates(warehouseId?: number): Observable<LabelTemplate[]> {
    const params: any = {};
    if (warehouseId) params.warehouse = warehouseId;
    return this.http.get<LabelTemplate[]>(`${this.apiUrl}/`, { params });
  }

  /** Create a new template */
  createTemplate(template: Partial<LabelTemplate>): Observable<LabelTemplate> {
    return this.http.post<LabelTemplate>(`${this.apiUrl}/`, template);
  }

  /** Update an existing template — warehouseId is passed as query param for backend protection */
  updateTemplate(id: number, template: Partial<LabelTemplate>, warehouseId?: number | null): Observable<LabelTemplate> {
    const params: any = {};
    if (warehouseId) params.warehouse = warehouseId;
    return this.http.put<LabelTemplate>(`${this.apiUrl}/${id}/`, template, { params });
  }

  /** Save (create or update) */
  saveTemplate(template: Partial<LabelTemplate>, warehouseId?: number | null): Observable<LabelTemplate> {
    if (template.id) {
      return this.updateTemplate(template.id, template, warehouseId);
    }
    return this.createTemplate(template);
  }

  /** Delete a template — warehouseId is passed as query param for backend protection */
  deleteTemplate(id: number, warehouseId?: number | null): Observable<void> {
    const params: any = {};
    if (warehouseId) params.warehouse = warehouseId;
    return this.http.delete<void>(`${this.apiUrl}/${id}/`, { params });
  }

  /**
   * Copy a template (Global or from another warehouse) to the target warehouse.
   * The copy is created as inactive (is_active=false) and is fully independent.
   */
  copyToWarehouse(templateId: number, warehouseId: number, name?: string): Observable<LabelTemplate> {
    return this.http.post<LabelTemplate>(
      `${this.apiUrl}/${templateId}/copy-to-warehouse/`,
      { warehouse_id: warehouseId, name }
    );
  }

  /** Get available fields for label design */
  getAvailableFields(warehouseId?: number): Observable<AvailableField[]> {
    const params: any = {};
    if (warehouseId) params.warehouse = warehouseId;
    return this.http.get<AvailableField[]>(`${this.apiUrl}/available-fields/`, { params });
  }

  /** Generate PDF for printing */
  generatePdf(templateId: number, itemsConfig: {id: string|number, quantity: number}[], customRemark?: string, printSettings?: any): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/generate-pdf/`, {
      template_id: templateId,
      items_config: itemsConfig,
      custom_remark: customRemark,
      print_settings: printSettings
    }, {
      responseType: 'blob',
      context: new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true)
    });
  }
}
