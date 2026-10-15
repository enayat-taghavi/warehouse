import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import {
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
  ProjectStats,
} from '../../../core/models/project.model';
import { Paginated } from '../../../core/models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private readonly endpoint = 'projects';

  constructor(private api: ApiService) {}

  /** لیست انبارها با فیلتر وضعیت */
  getAll(filters?: { status?: string }): Observable<Paginated<Project>> {
    return this.api.get<Paginated<Project>>(this.endpoint, filters);
  }

  /** جزئیات یک انبار */
  getById(id: number): Observable<Project> {
    return this.api.get<Project>(`${this.endpoint}/${id}`);
  }

  /** ایجاد انبار جدید */
  create(payload: ProjectCreatePayload): Observable<Project> {
    return this.api.post<Project>(this.endpoint, payload);
  }

  /** ویرایش انبار */
  update(id: number, payload: ProjectUpdatePayload): Observable<Project> {
    return this.api.patch<Project>(`${this.endpoint}/${id}`, payload);
  }

  /** حذف نرم (تغییر وضعیت به deleted) */
  delete(id: number): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }

  /** آمار پیشرفت انبار */
  getStats(id: number): Observable<ProjectStats> {
    return this.api.get<ProjectStats>(`${this.endpoint}/${id}/stats`);
  }

  /** خروجی Excel */
  exportExcel(id: number): Observable<Blob> {
    return this.api.download(`${this.endpoint}/${id}/export`);
  }
}
