import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface TableViewState {
  id?: number;
  table_name: string;
  view_name: string;
  columns_state: string[];
  is_last_selected?: boolean;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class TableViewApiService {
  private readonly endpoint = 'auth/table-views';

  constructor(private api: ApiService) {}

  getAll(tableName: string): Observable<TableViewState[]> {
    return this.api.get<TableViewState[]>(this.endpoint, { table_name: tableName });
  }

  create(payload: TableViewState): Observable<TableViewState> {
    return this.api.post<TableViewState>(this.endpoint, payload);
  }

  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }

  setLastSelected(id: number): Observable<{ status: string; message: string }> {
    return this.api.post<{ status: string; message: string }>(`${this.endpoint}/${id}/set_last_selected`, {});
  }
}
