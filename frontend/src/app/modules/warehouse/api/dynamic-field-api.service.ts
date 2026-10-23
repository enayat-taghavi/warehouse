import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DynamicFieldDefinition } from '../models/dynamic-field.model';

@Injectable({
  providedIn: 'root'
})
export class DynamicFieldApiService {
  private apiUrl = `${environment.apiUrl}/inventory/dynamic-fields/`;

  constructor(private http: HttpClient) { }

  getFields(warehouseId?: number): Observable<any> {
    let params = new HttpParams();
    if (warehouseId) {
      params = params.set('warehouse', warehouseId.toString());
    }
    // Set pagination large enough to get all fields at once
    params = params.set('page_size', '100');
    return this.http.get<any>(this.apiUrl, { params });
  }

  getField(id: number): Observable<DynamicFieldDefinition> {
    return this.http.get<DynamicFieldDefinition>(`${this.apiUrl}${id}/`);
  }

  createField(data: Partial<DynamicFieldDefinition>): Observable<DynamicFieldDefinition> {
    return this.http.post<DynamicFieldDefinition>(this.apiUrl, data);
  }

  updateField(id: number, data: Partial<DynamicFieldDefinition>): Observable<DynamicFieldDefinition> {
    return this.http.patch<DynamicFieldDefinition>(`${this.apiUrl}${id}/`, data);
  }

  deleteField(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}${id}/`);
  }

  copyFields(sourceWarehouseId: number, targetWarehouseId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}copy_from_warehouse/`, {
      source_warehouse_id: sourceWarehouseId,
      target_warehouse_id: targetWarehouseId
    });
  }
}
