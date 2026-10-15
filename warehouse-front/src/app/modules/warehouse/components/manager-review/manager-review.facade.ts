import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CountTaskApiService } from '../../api/count-task-api.service';
import { DocTaskApiService } from '../../api/doc-task-api.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../core/services/state.service';
import { environment } from '../../../../../environments/environment';

@Injectable()
export class ManagerReviewFacade {
  constructor(
    private countTaskApi: CountTaskApiService,
    private docTaskApi: DocTaskApiService,
    private http: HttpClient,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private state: StateService
  ) {}

  loadCountTasks(params: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.countTaskApi.getAll(params).subscribe({
        next: (res: any) => {
          const allTasks = Array.isArray(res) ? res : (res.results || []);
          const filtered = Array.isArray(allTasks) ? allTasks.filter((t: any) => t.status === 'MANAGER_REVIEW' || t.status === 'MANAGER_REJECTED') : [];
          resolve(filtered);
        },
        error: (err) => reject(err)
      });
    });
  }

  loadCountPoolTasks(params: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.http.get<any>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params }).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res.results || [])),
        error: (err) => reject(err)
      });
    });
  }

  loadDocTasksData(params: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.docTaskApi.getAll(params).subscribe({
        next: (res: any) => {
          const all = Array.isArray(res) ? res : (res.results || []);
          resolve(all.filter((t: any) => t.status === 'DOC_MANAGER_REVIEW' || t.status === 'DOC_MANAGER_REJECTED'));
        },
        error: (err) => reject(err)
      });
    });
  }

  loadDocPoolTasksData(params: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.docTaskApi.poolTasks(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res.results || [])),
        error: (err) => reject(err)
      });
    });
  }

  loadPoolTasks(params: any): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params });
  }

  loadDocTasks(params: any): Observable<any> {
    return this.docTaskApi.getAll(params);
  }

  loadDocPoolTasks(params: any): Observable<any> {
    return this.docTaskApi.poolTasks(params);
  }

  approveCountTasks(taskIds: number[], note: string): Observable<any> {
    return this.countTaskApi.bulkApprove(taskIds, note);
  }

  rejectCountTask(taskId: number, note: string): Observable<any> {
    return this.countTaskApi.managerReject(taskId, note);
  }

  bulkRejectCountTasks(taskIds: number[], note: string): Observable<any> {
    return this.countTaskApi.bulkManagerReject(taskIds, note);
  }

  approveDocTasks(taskIds: number[], note: string): Observable<any> {
    return this.docTaskApi.bulkApprove(taskIds, note);
  }

  rejectDocTask(taskId: number, note: string): Observable<any> {
    return this.docTaskApi.managerReject([taskId], note);
  }

  bulkRejectDocTasks(taskIds: number[], note: string): Observable<any> {
    return this.docTaskApi.managerReject(taskIds, note);
  }

  claimCountTasks(taskIds: number[], warehouseId: any): Observable<any> {
    const payload: any = { task_ids: taskIds, as_role: 'manager' };
    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== -1) {
      payload.warehouse_id = warehouseId;
    }
    return this.http.post<any>(`${environment.apiUrl}/inventory/count-tasks/claim_tasks/`, payload);
  }

  claimDocTasks(taskIds: number[], warehouseId: any): Observable<any> {
    const payload: any = { task_ids: taskIds, as_role: 'doc_manager' };
    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== -1) {
      payload.warehouse_id = warehouseId;
    }
    return this.http.post<any>(`${environment.apiUrl}/inventory/doc-tasks/claim_tasks/`, payload);
  }

  exportExcel(isCount: boolean, payload: any, params: any): Observable<Blob> {
    const api = isCount ? this.countTaskApi : this.docTaskApi;
    return api.exportExcel({ ...payload, ...params });
  }
}
