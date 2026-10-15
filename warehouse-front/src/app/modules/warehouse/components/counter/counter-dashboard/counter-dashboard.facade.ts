import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CountTaskApiService } from '../../../api/count-task-api.service';
import { ItemApiService } from '../../../api/item-api.service';
import { DynamicFieldApiService } from '../../../api/dynamic-field-api.service';
import { SettingsService } from '../../../../../core/services/settings';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CountTaskStore } from '../../../services/count-task-store';
import { CountTask, CountTaskStatus, CountTaskHistory } from '../../../../../core/models/count-task.model';
import { FieldPermissionConfig, mergeFieldPermissions } from '../../../../../core/models/field-config.model';
import { offlineDb } from '../../../../../core/services/offline-db';
import { environment } from '../../../../../../environments/environment';

@Injectable()
export class CounterDashboardFacade {
  constructor(
    private countTaskApi: CountTaskApiService,
    private itemApi: ItemApiService,
    private dynamicFieldApi: DynamicFieldApiService,
    private settingsService: SettingsService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private store: CountTaskStore,
    private http: HttpClient
  ) {}

  async loadTasksData(warehouseId: any, currentUserId: number, localFirst: boolean): Promise<CountTask[]> {
    if (localFirst) {
      return this.store.getMyTasks(warehouseId, currentUserId);
    }
    const params: any = { as_role: 'counter', page_size: 1000 };
    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== -1) {
      params.warehouse_id = warehouseId;
    }
    return new Promise((resolve, reject) => {
      this.countTaskApi.getAll(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res.results || [])),
        error: (err) => reject(err)
      });
    });
  }

  async loadPoolTasksData(warehouseId: any, localFirst: boolean): Promise<CountTask[]> {
    if (localFirst) {
      return this.store.getPoolTasks(warehouseId);
    }
    const params: any = { as_role: 'counter' };
    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== -1) {
      params.warehouse_id = warehouseId;
    }
    return new Promise((resolve, reject) => {
      this.http.get<CountTask[]>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params }).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res?.results || [])),
        error: (err: any) => reject(err)
      });
    });
  }

  async fetchPoolTasksSilently(warehouseId: any): Promise<CountTask[]> {
    const params: any = { as_role: 'counter' };
    if (warehouseId && warehouseId !== 'ALL' && warehouseId !== -1) {
      params.warehouse_id = warehouseId;
    }
    return new Promise((resolve) => {
      this.http.get<CountTask[]>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params }).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res?.results || [])),
        error: () => resolve([])
      });
    });
  }

  async saveExtraEditedFields(
    task: CountTask,
    editableFormFields: FieldPermissionConfig[],
    editableValues: Record<string, any>
  ): Promise<void> {
    if (editableFormFields.length === 0 || !task?.item) return;

    const item: any = task.item_details || {};
    const itemPayload: Record<string, any> = {};
    const dynamicDataUpdates: Record<string, any> = {};
    let hasChanges = false;

    editableFormFields.forEach(f => {
      const newVal = editableValues[f.key];
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        const oldVal = item.dynamic_data?.[realKey];
        if (newVal !== oldVal && (newVal !== '' || (oldVal !== null && oldVal !== undefined))) {
          dynamicDataUpdates[realKey] = newVal;
          hasChanges = true;
        }
      } else {
        const oldVal = item[f.key];
        if (newVal !== oldVal && (newVal !== '' || (oldVal !== null && oldVal !== undefined))) {
          itemPayload[f.key] = newVal;
          hasChanges = true;
        }
      }
    });

    if (Object.keys(dynamicDataUpdates).length > 0) {
      const existingDyn = item.dynamic_data || {};
      itemPayload['dynamic_data'] = { ...existingDyn, ...dynamicDataUpdates };
    }

    if (hasChanges && Object.keys(itemPayload).length > 0) {
      Object.assign(item, itemPayload);
      if (Object.keys(dynamicDataUpdates).length > 0) {
        item.dynamic_data = itemPayload['dynamic_data'];
      }

      const itemId = String(item.id || task.item);

      try {
        if (task.sync_id) {
          await offlineDb.countTasks.update(task.sync_id, {
            item_details: { ...item },
            _offlinePending: true
          });
        }
        if (item.sync_id) {
          await offlineDb.items.update(item.sync_id, {
            ...itemPayload,
            _offlinePending: true
          });
        }
      } catch (dbErr) {
        console.warn('[CounterDashboardFacade] خطا در ذخیره محلی فیلدهای کالا:', dbErr);
      }

      if (navigator.onLine && !itemId.startsWith('item_temp_')) {
        this.itemApi.update(itemId, itemPayload).subscribe({
          next: (savedItem) => {
            Object.assign(item, savedItem);
            if (task.sync_id) {
              offlineDb.countTasks.update(task.sync_id, {
                item_details: { ...item }
              }).catch(() => {});
            }
          },
          error: (err) => console.warn('[CounterDashboardFacade] خطا در ذخیره سروری فیلدهای کالا:', err)
        });
      }
    }
  }

  async saveDraft(
    task: CountTask,
    rawVal: string,
    counterNote: string,
    localFirst: boolean,
    currentUserId: number,
    currentUser: any,
    editableFormFields: FieldPermissionConfig[],
    editableValues: Record<string, any>
  ): Promise<{ success: boolean; newStatus: CountTaskStatus; newHistoryRecord: CountTaskHistory }> {
    let newStatus = task.status;
    if (rawVal !== '') {
      if (task.status === 'PENDING_COUNT' || task.status === 'SUPERVISOR_REJECTED' || task.status === 'MANAGER_REJECTED') {
        newStatus = 'INITIAL_COUNT';
      }
    } else {
      if (task.status === 'INITIAL_COUNT') {
        if (task.history && task.history.length > 0) {
          const sortedHistory = task.history.slice().sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
            const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
            return timeB - timeA;
          });
          const prevRecord = sortedHistory.find(h => h.action_type === 'SUPERVISOR_REJECTED' || h.action_type === 'MANAGER_REJECTED' || h.action_type === 'PENDING_COUNT');
          if (prevRecord) {
            newStatus = prevRecord.action_type as CountTaskStatus;
          } else if (task.manager_note) {
            newStatus = 'MANAGER_REJECTED';
          } else if (task.supervisor_note) {
            newStatus = 'SUPERVISOR_REJECTED';
          } else {
            newStatus = 'PENDING_COUNT';
          }
        } else if (task.manager_note) {
          newStatus = 'MANAGER_REJECTED';
        } else if (task.supervisor_note) {
          newStatus = 'SUPERVISOR_REJECTED';
        } else {
          newStatus = 'PENDING_COUNT';
        }
      }
    }

    const payload: any = {
      counted_balance: rawVal !== '' ? rawVal : null,
      counter_note: counterNote,
      status: newStatus
    };

    const newHistoryRecord: CountTaskHistory = {
      id: Date.now(),
      task: task.id,
      action_by: currentUser?.id || null,
      action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
      action_type: newStatus,
      counted_balance: rawVal !== '' ? rawVal : null,
      note: counterNote || null,
      created_at: new Date().toISOString()
    };

    if (localFirst && task.sync_id) {
      await this.store.saveDraft(task, payload, currentUserId);
      Object.assign(task, payload, { _offlinePending: true });
      if (!task.history) task.history = [];
      task.history = [newHistoryRecord, ...task.history];
      await this.saveExtraEditedFields(task, editableFormFields, editableValues);
      return { success: true, newStatus, newHistoryRecord };
    }

    return new Promise((resolve, reject) => {
      this.countTaskApi.update(task.id, payload).subscribe({
        next: async (res) => {
          Object.assign(task, res);
          if (!task.history) task.history = [];
          task.history = [newHistoryRecord, ...task.history];
          await this.saveExtraEditedFields(task, editableFormFields, editableValues);
          resolve({ success: true, newStatus, newHistoryRecord });
        },
        error: (err) => reject(err)
      });
    });
  }

  async submitDirectly(
    task: CountTask,
    rawVal: string,
    counterNote: string,
    localFirst: boolean,
    currentUserId: number,
    currentUser: any,
    activeWarehouseId: any,
    editableFormFields: FieldPermissionConfig[],
    editableValues: Record<string, any>
  ): Promise<{ success: boolean; targetStatus: CountTaskStatus; message?: string }> {
    const targetStatus: CountTaskStatus = task.skip_supervisor ? 'MANAGER_REVIEW' : 'COUNTED';
    const draftPayload: any = {
      counted_balance: rawVal,
      counter_note: counterNote,
      status: 'INITIAL_COUNT'
    };

    const submitHistoryRecord: CountTaskHistory = {
      id: Date.now(),
      task: task.id,
      action_by: currentUser?.id || null,
      action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
      action_type: targetStatus,
      counted_balance: rawVal,
      note: counterNote || null,
      created_at: new Date().toISOString()
    };

    if (localFirst) {
      await this.store.saveDraft(task, draftPayload, currentUserId);
      await this.store.submitTasks([task], currentUserId);
      Object.assign(task, { ...draftPayload, status: targetStatus, _offlinePending: true });
      if (!task.history) task.history = [];
      task.history = [submitHistoryRecord, ...task.history];
      await this.saveExtraEditedFields(task, editableFormFields, editableValues);
      return { success: true, targetStatus };
    }

    return new Promise((resolve, reject) => {
      this.countTaskApi.update(task.id, draftPayload).subscribe({
        next: () => {
          const submitPayload: any = { task_ids: [task.id] };
          if (activeWarehouseId && activeWarehouseId !== 'ALL' && activeWarehouseId !== -1) {
            submitPayload.warehouse_id = activeWarehouseId;
          }
          this.countTaskApi.bulkSubmit(submitPayload).subscribe({
            next: (res) => {
              Object.assign(task, { ...draftPayload, status: targetStatus });
              if (!task.history) task.history = [];
              task.history = [submitHistoryRecord, ...task.history];
              this.saveExtraEditedFields(task, editableFormFields, editableValues);
              resolve({ success: true, targetStatus, message: res.message });
            },
            error: (err) => reject(err)
          });
        },
        error: (err) => reject(err)
      });
    });
  }

  async quickSubmitTask(
    task: CountTask,
    localFirst: boolean,
    currentUserId: number,
    currentUser: any,
    activeWarehouseId: any
  ): Promise<{ success: boolean; targetStatus: CountTaskStatus; message?: string }> {
    const targetStatus: CountTaskStatus = task.skip_supervisor ? 'MANAGER_REVIEW' : 'COUNTED';
    const submitHistoryRecord: CountTaskHistory = {
      id: Date.now(),
      task: task.id,
      action_by: currentUser?.id || null,
      action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
      action_type: targetStatus,
      counted_balance: String(task.counted_balance),
      note: task.counter_note || null,
      created_at: new Date().toISOString()
    };

    if (localFirst) {
      await this.store.submitTasks([task], currentUserId);
      Object.assign(task, { status: targetStatus, _offlinePending: true });
      if (!task.history) task.history = [];
      task.history = [submitHistoryRecord, ...task.history];
      return { success: true, targetStatus };
    }

    const submitPayload: any = { task_ids: [task.id] };
    if (activeWarehouseId && activeWarehouseId !== 'ALL' && activeWarehouseId !== -1) {
      submitPayload.warehouse_id = activeWarehouseId;
    }

    return new Promise((resolve, reject) => {
      this.countTaskApi.bulkSubmit(submitPayload).subscribe({
        next: (res) => {
          Object.assign(task, { status: targetStatus });
          if (!task.history) task.history = [];
          task.history = [submitHistoryRecord, ...task.history];
          resolve({ success: true, targetStatus, message: res.message });
        },
        error: (err) => reject(err)
      });
    });
  }

  async submitAll(
    tasksToSubmit: CountTask[],
    localFirst: boolean,
    currentUserId: number,
    currentUser: any,
    activeWarehouseId: any
  ): Promise<{ success: boolean; count: number; message?: string }> {
    if (localFirst) {
      await this.store.submitTasks(tasksToSubmit, currentUserId);
      tasksToSubmit.forEach(t => {
        const targetStatus: CountTaskStatus = t.skip_supervisor ? 'MANAGER_REVIEW' : 'COUNTED';
        Object.assign(t, { status: targetStatus, _offlinePending: true });
        const record: CountTaskHistory = {
          id: Date.now() + Math.random(),
          task: t.id,
          action_by: currentUser?.id || null,
          action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
          action_type: targetStatus,
          counted_balance: String(t.counted_balance),
          note: t.counter_note || null,
          created_at: new Date().toISOString()
        };
        if (!t.history) t.history = [];
        t.history = [record, ...t.history];
      });
      return { success: true, count: tasksToSubmit.length };
    }

    const payload: any = { task_ids: tasksToSubmit.map(t => t.id) };
    if (activeWarehouseId && activeWarehouseId !== 'ALL' && activeWarehouseId !== -1) {
      payload.warehouse_id = activeWarehouseId;
    }

    return new Promise((resolve, reject) => {
      this.countTaskApi.bulkSubmit(payload).subscribe({
        next: (res) => {
          tasksToSubmit.forEach(t => {
            const targetStatus: CountTaskStatus = t.skip_supervisor ? 'MANAGER_REVIEW' : 'COUNTED';
            Object.assign(t, { status: targetStatus });
            const record: CountTaskHistory = {
              id: Date.now() + Math.random(),
              task: t.id,
              action_by: currentUser?.id || null,
              action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
              action_type: targetStatus,
              counted_balance: String(t.counted_balance),
              note: t.counter_note || null,
              created_at: new Date().toISOString()
            };
            if (!t.history) t.history = [];
            t.history = [record, ...t.history];
          });
          resolve({ success: true, count: tasksToSubmit.length, message: res.message });
        },
        error: (err) => reject(err)
      });
    });
  }

  async claimSelectedTasks(taskIds: number[], localFirst: boolean, warehouseId: any): Promise<{ success: boolean; claimedCount: number; message?: string }> {
    const payload = { task_ids: taskIds, as_role: 'counter' };
    return new Promise((resolve, reject) => {
      this.http.post<any>(`${environment.apiUrl}/inventory/count-tasks/claim_tasks/`, payload).subscribe({
        next: async (res) => {
          if (res.claimed_count === 0) {
            resolve({ success: false, claimedCount: 0, message: res.message || 'این کالا(ها) قبلاً توسط انبارگردان دیگری بر عهده گرفته شده است' });
            return;
          }
          if (localFirst && warehouseId) {
            await this.store.refresh(warehouseId);
          }
          resolve({ success: true, claimedCount: res.claimed_count, message: res.message });
        },
        error: (err) => reject(err)
      });
    });
  }

  async claimScannedTask(task: CountTask, localFirst: boolean, warehouseId: any): Promise<boolean> {
    const payload = { task_ids: [task.id], as_role: 'counter' };
    return new Promise((resolve) => {
      this.http.post<any>(`${environment.apiUrl}/inventory/count-tasks/claim_tasks/`, payload).subscribe({
        next: async (res) => {
          if (res.claimed_count === 0) {
            this.toast.error('این کالا قبلاً توسط انبارگردان دیگری بر عهده گرفته شده است.');
            resolve(false);
            return;
          }
          this.toast.success(`کالای «${task.item_details?.fa_unic_code || task.item_details?.description}» به کارتابل شما اضافه شد.`);
          if (localFirst && warehouseId) {
            await this.store.refresh(warehouseId);
          }
          resolve(true);
        },
        error: (err) => {
          this.toast.error(err?.error?.error || 'خطا در افزودن کالا به کارتابل شما.');
          resolve(false);
        }
      });
    });
  }

  async revertTaskStatus(
    task: CountTask,
    previousStatus: CountTaskStatus,
    localFirst: boolean,
    currentUserId: number,
    currentUser: any
  ): Promise<boolean> {
    const payload: any = {
      counted_balance: null,
      counter_note: task.counter_note || '',
      status: previousStatus
    };

    const revertHistoryRecord: CountTaskHistory = {
      id: Date.now(),
      task: task.id,
      action_by: currentUser?.id || null,
      action_by_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}`.trim() : (currentUser?.username || 'شما'),
      action_type: previousStatus,
      counted_balance: null,
      note: 'لغو پیش‌نویس توسط انبارگردان',
      created_at: new Date().toISOString()
    };

    if (localFirst && task.sync_id) {
      await this.store.saveDraft(task, payload, currentUserId);
      Object.assign(task, payload, { _offlinePending: true });
      if (!task.history) task.history = [];
      task.history = [revertHistoryRecord, ...task.history];
      return true;
    }

    return new Promise((resolve, reject) => {
      this.countTaskApi.update(task.id, payload).subscribe({
        next: (res) => {
          Object.assign(task, res);
          if (!task.history) task.history = [];
          task.history = [revertHistoryRecord, ...task.history];
          resolve(true);
        },
        error: (err) => reject(err)
      });
    });
  }

  exportExcel(params: any): Observable<Blob> {
    return this.countTaskApi.exportExcel(params);
  }

  downloadTemplate(warehouseId: any): Observable<Blob> {
    return this.countTaskApi.downloadTemplate(warehouseId);
  }
}
