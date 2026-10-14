import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, EMPTY, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ImportResult } from './accounts-http.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { ModuleRegistryService } from '../modules/module-registry.service';

export interface Warehouse {
  id: number;
  code: string | null;
  name: string;
  project_name: string | null;
  type: string | null;
  location: string | null;
  gps_coordinates: string | null;
  phone_number: string | null;
  manager: number | null;
  is_active: boolean;
  capacity: number | null;
  parent_warehouse: number | null;
  description: string | null;
  operator_company: string | null;
  color: string;
  total_quantity?: number;
  counted_quantity?: number;
  percent?: number;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  modified_by: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class WarehouseHttpService {
  private baseUrl = `${environment.apiUrl}/warehouses/`;
  private moduleRegistry = inject(ModuleRegistryService);

  private get isWarehouseAvailable(): boolean {
    return this.moduleRegistry.getInstalledModules().some(m => m.scopeKind === 'warehouse');
  }

  constructor(private http: HttpClient) {}

  getAll(companyId?: number): Observable<Warehouse[]> {
    if (!this.isWarehouseAvailable) {
      return of([]);
    }
    let url = this.baseUrl;
    if (companyId) {
      url += `?company_id=${companyId}`;
    }
    return this.http.get<Warehouse[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  getById(id: number): Observable<Warehouse> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.get<Warehouse>(`${this.baseUrl}${id}/`);
  }

  create(data: Partial<Warehouse>): Observable<Warehouse> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.post<Warehouse>(this.baseUrl, data).pipe(
      tap(() => OfflineSyncService.getInstance().invalidateCache(this.baseUrl))
    );
  }

  update(id: number, data: Partial<Warehouse>): Observable<Warehouse> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.patch<Warehouse>(`${this.baseUrl}${id}/`, data).pipe(
      tap(() => OfflineSyncService.getInstance().invalidateCache(this.baseUrl))
    );
  }

  delete(id: number): Observable<void> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.delete<void>(`${this.baseUrl}${id}/`).pipe(
      tap(() => OfflineSyncService.getInstance().invalidateCache(this.baseUrl))
    );
  }

  toggleArchive(id: number): Observable<Warehouse> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.patch<Warehouse>(`${this.baseUrl}${id}/toggle_archive/`, {}).pipe(
      tap(() => OfflineSyncService.getInstance().invalidateCache(this.baseUrl))
    );
  }

  // ── Excel Import/Export ────────────────────────────────────────────
  exportExcel(): Observable<Blob> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.get(`${this.baseUrl}export_excel/`, { responseType: 'blob' });
  }

  importExcel(file: File): Observable<ImportResult> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ImportResult>(`${this.baseUrl}import_excel/`, formData);
  }

  downloadTemplate(): Observable<Blob> {
    if (!this.isWarehouseAvailable) {
      return EMPTY;
    }
    return this.http.get(`${this.baseUrl}download_template/`, { responseType: 'blob' });
  }
}
