import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';


@Injectable({ providedIn: 'root' })
export class TagApiService {
  private readonly endpoint = 'tags';

  constructor(private api: ApiService) {}

  /** لیست تگ‌ها (فیلتر بر اساس پروژه) */
  getAll(projectId?: number): Observable<any[]> {
    const params = projectId ? { project: projectId } : {};
    return this.api.get<any[]>(this.endpoint, params);
  }

  /** ایجاد تگ جدید */
  create(name: string, projectId: number | null = null): Observable<any> {
    return this.api.post<any>(this.endpoint, { name, project: projectId });
  }
}
