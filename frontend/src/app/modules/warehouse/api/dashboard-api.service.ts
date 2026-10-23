import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { DashboardSummary, DashboardWeekly } from '../../../core/models/api-response.model';
import { ProjectStats } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  constructor(private api: ApiService) {}

  /** KPI‌ها + آمار تجمیعی */
  getSummary(projectId?: number | string): Observable<DashboardSummary> {
    const params = projectId && projectId !== 'ALL' ? { project: projectId } : {};
    return this.api.get<DashboardSummary>('dashboard/summary', params);
  }

  /** چارت هفتگی */
  getWeekly(projectId?: number | string): Observable<DashboardWeekly> {
    const params = projectId && projectId !== 'ALL' ? { project: projectId } : {};
    return this.api.get<DashboardWeekly>('dashboard/weekly', params);
  }

  /** درصد پیشرفت هر انبار */
  getProgress(): Observable<ProjectStats[]> {
    return this.api.get<ProjectStats[]>('dashboard/progress');
  }
}
