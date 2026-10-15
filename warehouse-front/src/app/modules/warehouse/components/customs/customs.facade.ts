import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { DocTaskApiService } from '../../api/doc-task-api.service';
import { ItemApiService } from '../../api/item-api.service';
import { DynamicFieldApiService } from '../../api/dynamic-field-api.service';
import { SettingsService } from '../../../../core/services/settings';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../core/services/state.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { DocTaskStore } from '../../services/doc-task-store';
import { DocTask } from '../../../../core/models/doc-task.model';
import { FieldPermissionConfig, mergeDocFieldPermissions } from '../../../../core/models/field-config.model';
import { offlineDb } from '../../../../core/services/offline-db';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { environment } from '../../../../../environments/environment';
import { CustomsScannerParser } from './customs-scanner-parser';
import { ParsedScanRow, ScanBatchSummary } from './customs-scanner.types';
import { DOC_TASK_DIRECT_KEYS, isFinancialField } from './customs.helpers';

@Injectable()
export class CustomsFacade {
  constructor(
    private docTaskApi: DocTaskApiService,
    private itemApi: ItemApiService,
    private dynamicFieldApi: DynamicFieldApiService,
    private settingsService: SettingsService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private state: StateService,
    private auth: AuthService,
    private store: DocTaskStore
  ) {}

  get activeWarehouseId(): number | null {
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && Number(whId) !== -1) return Number(whId);
    return null;
  }

  get currentUserId(): number | null {
    const id = this.auth.user()?.id;
    return typeof id === 'number' ? id : null;
  }

  get localFirst(): boolean {
    return (
      (environment as any).useLocalFirstDoc === true &&
      this.activeWarehouseId !== null &&
      this.currentUserId !== null
    );
  }

  async loadFieldPermissions(): Promise<{
    fieldConfigs: FieldPermissionConfig[];
    dynamicFieldsList: any[];
    financialCanViewHistory: boolean;
    financialCanViewPreviousNotes: boolean;
    scannerCameraPreset: string;
    scannerRowSep: string;
    scannerColSep: string;
  }> {
    let fieldConfigs: FieldPermissionConfig[] = [];
    let dynamicFieldsList: any[] = [];
    let financialCanViewHistory = true;
    let financialCanViewPreviousNotes = true;
    let scannerCameraPreset = 'adaptive';
    let scannerRowSep = ';';
    let scannerColSep = '|';

    const numWhId = this.activeWarehouseId;

    if (this.localFirst && numWhId) {
      try {
        const localDf = await offlineDb.dynamicFields.where('warehouse_id').equals(numWhId).toArray();
        if (localDf && localDf.length > 0) {
          dynamicFieldsList = localDf;
        }
      } catch (err) {
        console.warn('[CustomsFacade] Dexie dynamic fields read error:', err);
      }
    }

    const decodeDelim = (val: string) => {
      if (!val) return val;
      if (val === 'Chr(30)') return '\x1E';
      if (val === 'Chr(31)') return '\x1F';
      if (val === 'Chr(30) & ";"') return '\x1E;';
      if (val === 'Chr(31) & "|"') return '\x1F|';
      if (val === '\\n') return '\n';
      if (val === '\\t') return '\t';
      return val;
    };

    if (numWhId) {
      try {
        const dfRes: any = await firstValueFrom(this.dynamicFieldApi.getFields(numWhId));
        dynamicFieldsList = Array.isArray(dfRes) ? dfRes : (dfRes?.results || []);
        if (this.localFirst) {
          offlineDb.dynamicFields.bulkPut(dynamicFieldsList).catch(() => {});
        }
      } catch (err: any) {
        console.warn('[CustomsFacade] Dynamic fields load error:', err);
      }
    }

    try {
      const res: any = numWhId
        ? await firstValueFrom(this.settingsService.getWarehouseSettings(numWhId))
        : await firstValueFrom(this.settingsService.getGlobalSettings());
      const savedPerms = numWhId ? res?.field_permissions_doc?.value : res?.field_permissions_doc;
      fieldConfigs = mergeDocFieldPermissions(savedPerms, dynamicFieldsList);
      if (res?.financial_can_view_history !== undefined) {
        financialCanViewHistory = res.financial_can_view_history?.value ?? res.financial_can_view_history ?? true;
      }
      if (res?.financial_can_view_previous_notes !== undefined) {
        financialCanViewPreviousNotes = res.financial_can_view_previous_notes?.value ?? res.financial_can_view_previous_notes ?? true;
      }
      scannerCameraPreset = res?.scanner_camera_preset?.value ?? res?.scanner_camera_preset ?? 'adaptive';
      scannerRowSep = decodeDelim(res?.scanner_row_delimiter?.value ?? res?.scanner_row_delimiter ?? ';');
      scannerColSep = decodeDelim(res?.scanner_col_delimiter?.value ?? res?.scanner_col_delimiter ?? '|');
    } catch {
      fieldConfigs = mergeDocFieldPermissions(null, dynamicFieldsList);
    }

    return {
      fieldConfigs,
      dynamicFieldsList,
      financialCanViewHistory,
      financialCanViewPreviousNotes,
      scannerCameraPreset,
      scannerRowSep,
      scannerColSep
    };
  }

  buildTaskPayload(
    task: DocTask,
    editableValues: Record<string, any>,
    f_worker_note: string
  ): Partial<DocTask> {
    const payload: Partial<DocTask> = {
      worker_note: f_worker_note
    };

    DOC_TASK_DIRECT_KEYS.forEach(key => {
      if (key === 'worker_note') return;
      if (editableValues[key] !== undefined) {
        const val = editableValues[key];
        if (key === 'stamp' || key === 'signature') {
          (payload as any)[key] = Boolean(val);
        } else if (key === 'invoice_page' || key === 'page_row') {
          (payload as any)[key] = val !== '' && val !== null ? Number(val) : null;
        } else if (isFinancialField(key)) {
          const clean = val !== '' && val !== null ? String(val).replace(/,/g, '').trim() : null;
          (payload as any)[key] = clean && !isNaN(Number(clean)) ? clean : null;
        } else {
          (payload as any)[key] = val !== '' && val !== null ? val : null;
        }
      } else {
        (payload as any)[key] = (task as any)?.[key] ?? null;
      }
    });

    return payload;
  }

  async saveExtraEditedFields(
    task: DocTask,
    editableValues: Record<string, any>,
    editableFormFields: FieldPermissionConfig[]
  ): Promise<void> {
    const itemPayload: Record<string, any> = {};
    const dynamicDataUpdates: Record<string, any> = {};
    let hasChanges = false;

    editableFormFields.forEach(f => {
      if (DOC_TASK_DIRECT_KEYS.has(f.key)) return;
      const newVal = editableValues[f.key];
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        dynamicDataUpdates[realKey] = newVal;
        hasChanges = true;
      } else {
        itemPayload[f.key] = newVal;
        hasChanges = true;
      }
    });

    if (Object.keys(dynamicDataUpdates).length > 0) {
      const existingDyn = (task.item_details as any)?.dynamic_data || {};
      itemPayload['dynamic_data'] = { ...existingDyn, ...dynamicDataUpdates };
    }

    if (hasChanges && Object.keys(itemPayload).length > 0) {
      const itemSyncId = (task.item_details as any)?.sync_id;
      const itemId = String(task.item_details?.id || task.item);

      if (this.localFirst && itemSyncId) {
        try {
          await offlineDb.items.update(itemSyncId, {
            ...itemPayload,
            _offlinePending: true
          });
          await OfflineSyncService.getInstance().enqueue(
            'PATCH',
            `${environment.apiUrl}/inventory/items/${itemId}/`,
            itemPayload,
            {
              userId: this.currentUserId!,
              entityType: 'item',
              entitySyncId: itemSyncId
            }
          );
          OfflineSyncService.getInstance().processQueue();
        } catch (err) {
          console.warn('[CustomsFacade] Could not update local item in Dexie', err);
        }
      } else if (itemId && itemId !== 'undefined') {
        try {
          await firstValueFrom(this.itemApi.update(itemId, itemPayload));
        } catch (err) {
          console.warn('[CustomsFacade] Could not save extra item fields', err);
        }
      }
    }
  }

  async saveDraft(
    task: DocTask,
    editableValues: Record<string, any>,
    f_worker_note: string,
    editableFormFields: FieldPermissionConfig[],
    showToast = true
  ): Promise<boolean> {
    const payload = this.buildTaskPayload(task, editableValues, f_worker_note);

    const draftHistoryRecord: any = {
      id: Date.now(),
      action_type: 'DOC_DRAFT_SAVED',
      action_by_name: this.auth.user()?.username || 'کارشناس مالی',
      created_at: new Date().toISOString(),
      note: f_worker_note || 'ذخیره پیش‌نویس مدارک مالی'
    };
    if (!task.history) task.history = [];
    task.history = [draftHistoryRecord, ...task.history];

    if (this.localFirst && task.sync_id) {
      try {
        await this.store.saveDraft(task, payload, this.currentUserId!);
        Object.assign(task, payload, { _offlinePending: true });
        await this.saveExtraEditedFields(task, editableValues, editableFormFields);
        if (showToast) this.toast.success('پیش‌نویس ذخیره شد');
        return true;
      } catch (e) {
        this.toast.error('خطا در ذخیره اطلاعات');
        return false;
      }
    }

    return new Promise<boolean>((resolve) => {
      this.docTaskApi.update(task.id, payload).subscribe({
        next: (res) => {
          Object.assign(task, res);
          this.saveExtraEditedFields(task, editableValues, editableFormFields);
          if (showToast) this.toast.success('پیش‌نویس ذخیره شد');
          resolve(true);
        },
        error: () => {
          this.toast.error('خطا در ذخیره اطلاعات');
          resolve(false);
        }
      });
    });
  }

  async submitCurrentTask(
    task: DocTask,
    editableValues: Record<string, any>,
    f_worker_note: string,
    editableFormFields: FieldPermissionConfig[]
  ): Promise<boolean> {
    const payload = this.buildTaskPayload(task, editableValues, f_worker_note);

    if (this.localFirst && task.sync_id) {
      try {
        await this.store.submitTasks([task], this.currentUserId!, this.activeWarehouseId || undefined);
        await this.saveExtraEditedFields(task, editableValues, editableFormFields);
        this.toast.success('اطلاعات با موفقیت ثبت و ارسال شد (محلی)');
        return true;
      } catch (e) {
        this.toast.error('خطا در ثبت اطلاعات');
        return false;
      }
    }

    return new Promise<boolean>((resolve) => {
      this.docTaskApi.update(task.id, payload).subscribe({
        next: () => {
          this.saveExtraEditedFields(task, editableValues, editableFormFields);
          const submitPayload: any = { task_ids: [task.id] };
          if (this.activeWarehouseId) submitPayload.warehouse_id = this.activeWarehouseId;
          this.docTaskApi.bulkSubmit(submitPayload).subscribe({
            next: (res: any) => {
              if (res?.message && (res.message.includes('یافت نشد') || res.message.includes('هیچ سند مالی'))) {
                this.toast.warning(res.message);
                resolve(false);
                return;
              }
              this.toast.success('سند با موفقیت به سرپرست ارسال شد');
              resolve(true);
            },
            error: (err: any) => {
              this.toast.error(err?.error?.error || 'خطا در ارسال سند');
              resolve(false);
            }
          });
        },
        error: (err: any) => {
          this.toast.error(err?.error?.error || 'خطا در ثبت اطلاعات مالی');
          resolve(false);
        }
      });
    });
  }

  async quickSubmitTask(
    task: DocTask,
    editableFormFields: FieldPermissionConfig[]
  ): Promise<boolean> {
    if (this.localFirst && task.sync_id) {
      try {
        await this.store.submitTasks([task], this.currentUserId!, this.activeWarehouseId || undefined);
        this.toast.success('کالا با موفقیت به سرپرست ارسال شد (محلی)');
        return true;
      } catch (e) {
        this.toast.error('خطا در ارسال کالا');
        return false;
      }
    }

    const payload: any = { task_ids: [task.id] };
    if (this.activeWarehouseId) payload.warehouse_id = this.activeWarehouseId;
    return new Promise<boolean>((resolve) => {
      this.docTaskApi.bulkSubmit(payload).subscribe({
        next: (res: any) => {
          this.toast.success(res?.message || 'کالا با موفقیت ارسال شد');
          resolve(true);
        },
        error: (err: any) => {
          this.toast.error(err?.error?.error || 'خطا در ارسال کالا');
          resolve(false);
        }
      });
    });
  }

  async submitAll(toSubmit: DocTask[], isPartial: boolean): Promise<boolean> {
    if (toSubmit.length === 0) {
      if (isPartial) {
        this.toast.warning('هیچ‌کدام از کالاهای انتخابی دارای اطلاعات سند مالی نیستند. لطفاً ابتدا اطلاعات را وارد کنید.');
      } else {
        this.toast.warning('هیچ سند مالی تکمیل‌شده‌ای برای ارسال وجود ندارد. لطفاً ابتدا اطلاعات اسناد را ثبت فرمایید.');
      }
      return false;
    }

    const confirmed = await this.confirmDialog.open({
      title: isPartial ? 'ارسال موارد انتخابی' : 'ارسال همه موارد تکمیل‌شده',
      message: `آیا از ارسال ${toSubmit.length} سند مالی به سرپرست اطمینان دارید؟`,
      confirmText: 'بله، ارسال کن',
      cancelText: 'انصراف',
      type: 'info'
    });
    if (!confirmed) return false;

    if (this.localFirst) {
      try {
        await this.store.submitTasks(toSubmit, this.currentUserId!, this.activeWarehouseId || undefined);
        this.toast.success(`${toSubmit.length} کالا با موفقیت به سرپرست ارسال شدند (محلی)`);
        return true;
      } catch {
        this.toast.error('خطا در ارسال اطلاعات');
        return false;
      }
    }

    const payload: any = { task_ids: toSubmit.map(t => t.id) };
    if (this.activeWarehouseId) payload.warehouse_id = this.activeWarehouseId;
    return new Promise<boolean>((resolve) => {
      this.docTaskApi.bulkSubmit(payload).subscribe({
        next: () => {
          this.toast.success(`${toSubmit.length} کالا با موفقیت به سرپرست ارسال شدند`);
          resolve(true);
        },
        error: (err: any) => {
          this.toast.error(err?.error?.error || 'خطا در ارسال گروهی کالاها');
          resolve(false);
        }
      });
    });
  }

  async claimSelectedTasks(poolTasks: DocTask[], selectedIds: Set<number>): Promise<boolean> {
    const toClaim = poolTasks.filter(t => selectedIds.has(t.id));
    if (toClaim.length === 0) return false;

    if (this.localFirst) {
      await this.store.claimTasks(toClaim, this.currentUserId!, 'doc_worker');
      this.toast.success(`${toClaim.length} تسک به کارتابل شما اضافه شد (محلی).`);
      return true;
    }

    if (!navigator.onLine) {
      this.toast.error('در حالت آفلاین امکان بر عهده گرفتن کالاهای جدید وجود ندارد.');
      return false;
    }

    const ids = toClaim.map(t => t.id);
    return new Promise<boolean>((resolve) => {
      this.docTaskApi.claimTasks(ids, 'doc_worker').subscribe({
        next: () => {
          this.toast.success(`${toClaim.length} تسک با موفقیت به کارتابل شما افزوده شد.`);
          resolve(true);
        },
        error: (err: any) => {
          this.toast.error(err?.error?.error || 'خطا در انتساب تسک‌ها');
          resolve(false);
        }
      });
    });
  }

  async revertTaskStatus(task: DocTask): Promise<boolean> {
    let previousStatus: any = 'PENDING_DOC';
    let statusLabel = 'در انتظار';
    if (task.manager_note) {
      previousStatus = 'DOC_MANAGER_REJECTED';
      statusLabel = 'بررسی مجدد (مدیر)';
    } else if (task.supervisor_note) {
      previousStatus = 'DOC_SUPERVISOR_REJECTED';
      statusLabel = 'بررسی مجدد (سرپرست)';
    }

    const confirmed = await this.confirmDialog.open({
      title: 'بازگرداندن وضعیت کالا',
      message: `آیا از لغو پیش‌نویس و بازگرداندن این کالا به وضعیت «${statusLabel}» اطمینان دارید؟`,
      confirmText: 'بله، بازگردان',
      cancelText: 'انصراف',
      type: 'warning'
    });
    if (!confirmed) return false;

    const payload: any = {
      status: previousStatus
    };

    if (previousStatus === 'PENDING_DOC') {
      payload.added_rti_no = '';
      payload.inv_rti_number = '';
      payload.invoice_type = null;
      payload.invoice_date = null;
      payload.invoice_page = null;
      payload.page_row = null;
      payload.doc_supplier = '';
      payload.total_value = null;
      payload.price_amount = null;
      payload.similar_unit_price = null;
      payload.currency = null;
      payload.folder_address = '';
      payload.stamp = false;
      payload.signature = false;
      payload.worker_note = '';
    }

    const revertHistoryRecord: any = {
      id: Date.now(),
      action_type: 'CANCELLED',
      action_by_name: this.auth.user()?.username || 'کارشناس مالی',
      created_at: new Date().toISOString(),
      note: `لغو پیش‌نویس و بازگشت به وضعیت «${statusLabel}»`
    };
    if (!task.history) task.history = [];
    task.history = [revertHistoryRecord, ...task.history];

    if (this.localFirst && task.sync_id) {
      try {
        await this.store.saveDraft(task, payload, this.currentUserId!);
        Object.assign(task, payload, { _offlinePending: true });
        this.toast.success(`کالا به وضعیت «${statusLabel}» بازگردانده شد`);
        return true;
      } catch (e) {
        console.error('[CustomsFacade] خطا در بازگرداندن وضعیت محلی:', e);
        this.toast.error('خطا در بازگرداندن وضعیت کالا');
        return false;
      }
    }

    return new Promise<boolean>((resolve) => {
      this.docTaskApi.update(task.id, payload).subscribe({
        next: () => {
          Object.assign(task, payload);
          this.toast.success(`کالا به وضعیت «${statusLabel}» بازگردانده شد`);
          resolve(true);
        },
        error: (err: any) => {
          this.toast.error(err?.error?.error || 'خطا در بازگرداندن وضعیت کالا');
          resolve(false);
        }
      });
    });
  }

  getExportColumns(): Observable<any[]> {
    return this.docTaskApi.getExportColumns();
  }

  exportExcel(params: any): Observable<Blob> {
    return this.docTaskApi.exportExcel(params);
  }

  downloadTemplate(warehouseId?: number | null): Observable<Blob> {
    return this.docTaskApi.downloadTemplate(warehouseId);
  }

  async applyBulkScanUpdate(
    summary: ScanBatchSummary,
    editableFormFields: FieldPermissionConfig[],
    isWorkerNoteVisible: boolean
  ): Promise<boolean> {
    const eligibleRows = summary.rows.filter(r => r.status === 'ready' || r.status === 'pool');
    if (eligibleRows.length === 0) {
      this.toast.warning('هیچ کالای مجازی برای به‌روزرسانی وجود ندارد.');
      return false;
    }

    const poolRows = eligibleRows.filter(r => r.isFromPool && r.matchedTask);
    if (poolRows.length > 0) {
      if (this.localFirst) {
        const poolTasksList = poolRows.map(r => r.matchedTask!);
        await this.store.claimTasks(poolTasksList, this.currentUserId!, 'doc_worker');
      } else {
        if (!navigator.onLine) {
          this.toast.error('بر عهده گرفتن کالاهای استخر نیاز به اتصال اینترنت دارد.');
          return false;
        }
        const poolTaskIds = poolRows.map(r => r.matchedTask!.id);
        await new Promise<void>((resolve, reject) => {
          this.docTaskApi.claimTasks(poolTaskIds, 'doc_worker').subscribe({
            next: () => resolve(),
            error: (err) => reject(err)
          });
        });
      }
    }

    const editableKeys = new Set(editableFormFields.map(f => f.key));
    if (isWorkerNoteVisible) editableKeys.add('worker_note');

    const processRow = async (row: ParsedScanRow) => {
      const task = row.matchedTask;
      if (!task) return;

      const payload: Record<string, any> = {};
      const dynamicUpdates: Record<string, any> = {};
      const itemExtraPayload: Record<string, any> = {};

      row.changes.forEach(chg => {
        if (!editableKeys.has(chg.key)) return;

        const val = chg.newValue;
        if (DOC_TASK_DIRECT_KEYS.has(chg.key)) {
          if (chg.key === 'stamp' || chg.key === 'signature') {
            payload[chg.key] = CustomsScannerParser.parseBoolean(val);
          } else if (chg.key === 'invoice_type') {
            payload[chg.key] = CustomsScannerParser.normalizeInvoiceType(val) || val;
          } else if (chg.key === 'currency') {
            payload[chg.key] = CustomsScannerParser.normalizeCurrency(val) || val;
          } else if (chg.key === 'invoice_page' || chg.key === 'page_row') {
            payload[chg.key] = val !== '' && val !== null ? Number(val) : null;
          } else if (isFinancialField(chg.key)) {
            const clean = String(val).replace(/,/g, '').trim();
            payload[chg.key] = clean !== '' ? clean : null;
          } else {
            payload[chg.key] = val;
          }
        } else if (chg.key.startsWith('dyn_')) {
          const realKey = chg.key.replace(/^dyn_/, '');
          dynamicUpdates[realKey] = val;
        } else {
          itemExtraPayload[chg.key] = val;
        }
      });

      if (Object.keys(dynamicUpdates).length > 0) {
        const existingDyn = (task.item_details as any)?.dynamic_data || {};
        itemExtraPayload['dynamic_data'] = { ...existingDyn, ...dynamicUpdates };
        if (task.item_details) {
          (task.item_details as any).dynamic_data = itemExtraPayload['dynamic_data'];
        }
      }

      if (Object.keys(itemExtraPayload).length > 0) {
        const itemSyncId = (task.item_details as any)?.sync_id;
        const itemId = String(task.item_details?.id || task.item);
        if (this.localFirst && itemSyncId) {
          offlineDb.items.update(itemSyncId, { ...itemExtraPayload, _offlinePending: true })
            .catch(err => console.warn('[Customs Batch] Dexie item update error:', err));
          OfflineSyncService.getInstance().enqueue('PATCH', `${environment.apiUrl}/inventory/items/${itemId}/`, itemExtraPayload, {
            userId: this.currentUserId!,
            entityType: 'item',
            entitySyncId: itemSyncId
          });
        } else if (itemId && itemId !== 'undefined') {
          this.itemApi.update(itemId, itemExtraPayload).subscribe({
            next: () => {},
            error: (err) => console.warn('[Customs Batch] item update error:', err)
          });
        }
      }

      if (Object.keys(payload).length > 0) {
        if (this.localFirst && task.sync_id) {
          await this.store.saveDraft(task, payload, this.currentUserId!);
          Object.assign(task, payload, { _offlinePending: true });
        } else {
          await new Promise<void>((resolve) => {
            this.docTaskApi.update(task.id, payload).subscribe({
              next: (res) => { Object.assign(task, res); resolve(); },
              error: () => resolve()
            });
          });
        }
      }
    };

    const chunkSize = 5;
    for (let i = 0; i < eligibleRows.length; i += chunkSize) {
      const chunk = eligibleRows.slice(i, i + chunkSize);
      await Promise.all(chunk.map(row => processRow(row)));
    }

    this.toast.success(`${eligibleRows.length} کالا با موفقیت به‌روزرسانی شدند.`);
    return true;
  }

  async processStructuredScan(
    table: any,
    fieldConfigs: FieldPermissionConfig[],
    myTasksList: DocTask[],
    poolTasksList: DocTask[],
    isReadOnlyFn: (t: DocTask) => boolean,
    getStatusLabelFn: (s: string) => string
  ): Promise<ScanBatchSummary> {
    let myTasks: DocTask[];
    let pool: DocTask[];

    if (this.localFirst) {
      [myTasks, pool] = await Promise.all([
        this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!),
        this.store.getPoolTasks(this.activeWarehouseId!),
      ]);
    } else {
      myTasks = myTasksList;
      pool = poolTasksList.length > 0 ? poolTasksList : await this.fetchPoolOnce();
    }

    const rows: ParsedScanRow[] = [];
    let readyCount = 0;
    let poolCount = 0;
    let readOnlyCount = 0;
    let notFoundCount = 0;

    const editableKeyMap = new Map<string, FieldPermissionConfig>();
    fieldConfigs.forEach(f => {
      if (f.visible && f.editable) {
        editableKeyMap.set(f.key, f);
      }
    });

    table.rows.forEach((rawRow: any, idx: number) => {
      const rawUnic = (rawRow['fa_unic_code'] || '').trim();
      const normUnic = rawUnic.toLowerCase();

      const match = (t: DocTask) => {
        const tUnic = (t.item_details?.fa_unic_code || '').trim().toLowerCase();
        const tEnUnic = (t.item_details?.en_unic_code || '').trim().toLowerCase();
        return tUnic === rawUnic.toLowerCase() || tUnic === normUnic || tEnUnic === normUnic;
      };

      let matched = myTasks.find(match);
      let isFromPool = false;

      if (!matched) {
        matched = pool.find(match);
        if (matched) isFromPool = true;
      }

      let rowStatus: any = 'not_found';
      let statusMessage = 'کالا در کارتابل یا استخر یافت نشد';

      if (matched) {
        if (isFromPool) {
          rowStatus = 'pool';
          statusMessage = 'موجود در استخر اسناد (تخصیص خودکار به شما)';
          poolCount++;
        } else if (isReadOnlyFn(matched)) {
          rowStatus = 'readonly';
          statusMessage = `کالا در وضعیت ${getStatusLabelFn(matched.status)} قرار دارد و غیرقابل ویرایش است`;
          readOnlyCount++;
        } else {
          rowStatus = 'ready';
          statusMessage = 'آماده اعمال تغییرات';
          readyCount++;
        }
      } else {
        notFoundCount++;
      }

      const changes: any[] = [];
      Object.keys(rawRow).forEach(key => {
        if (key === 'fa_unic_code' || key.startsWith('col_')) return;
        const rawVal = rawRow[key];
        if (rawVal === undefined || rawVal === '') return;

        const fieldCfg = fieldConfigs.find(f => f.key === key);
        const isEditable = editableKeyMap.has(key);

        let parsedVal = rawVal;
        if (DOC_TASK_DIRECT_KEYS.has(key)) {
          if (key === 'stamp' || key === 'signature') {
            parsedVal = CustomsScannerParser.parseBoolean(rawVal);
          } else if (key === 'invoice_type') {
            parsedVal = CustomsScannerParser.normalizeInvoiceType(rawVal) || rawVal;
          } else if (key === 'currency') {
            parsedVal = CustomsScannerParser.normalizeCurrency(rawVal) || rawVal;
          }
        }

        changes.push({
          key,
          label: fieldCfg?.custom_label?.trim() || fieldCfg?.default_label || key,
          oldValue: matched ? (matched as any)[key] : null,
          newValue: parsedVal,
          isEditable
        });
      });

      rows.push({
        rowIndex: idx + 1,
        unicCode: rawUnic,
        rawValues: rawRow,
        status: rowStatus,
        statusMessage,
        matchedTask: matched || null,
        isFromPool,
        isReadOnly: rowStatus === 'readonly',
        changes
      });
    });

    return {
      totalRows: rows.length,
      readyCount,
      poolCount,
      readOnlyCount,
      notFoundCount,
      rows,
      detectedRowSeparator: table.detectedRowSep,
      detectedColSeparator: table.detectedColSep,
      headers: table.headers
    };
  }

  fetchPoolOnce(): Promise<DocTask[]> {
    const params: any = { as_role: 'doc_worker' };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;
    return new Promise(resolve => {
      this.docTaskApi.poolTasks(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : []),
        error: () => resolve([])
      });
    });
  }

  async claimScannedTask(task: DocTask): Promise<boolean> {
    const confirmed = await this.confirmDialog.open({
      title: 'بر عهده گرفتن کالا',
      message: `کالای <b dir="ltr">${task.item_details?.fa_unic_code || ''}</b><br>${task.item_details?.description || ''}<br>در استخر است. آیا آن را بر عهده می‌گیرید؟`,
      confirmText: 'بله، بر عهده می‌گیرم', cancelText: 'انصراف', type: 'info'
    });
    if (!confirmed) return false;
    if (!navigator.onLine) { this.toast.error('بر عهده گرفتن کالا نیاز به اتصال اینترنت دارد'); return false; }

    return new Promise<boolean>(resolve => {
      this.docTaskApi.claimTasks([task.id], 'doc_worker').subscribe({
        next: () => {
          this.toast.success('کالا با موفقیت به عهده گرفته شد');
          resolve(true);
        },
        error: (err) => { this.toast.error(err?.error?.error || 'خطا در عملیات'); resolve(false); }
      });
    });
  }

  async loadTasksData(): Promise<DocTask[]> {
    if (this.localFirst) {
      return this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!);
    }
    const params: any = { as_role: 'doc_worker', page_size: 1000 };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;
    return new Promise((resolve, reject) => {
      this.docTaskApi.getAll(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : (res.results || [])),
        error: (err) => reject(err)
      });
    });
  }

  async loadPoolTasksData(): Promise<DocTask[]> {
    if (this.localFirst) {
      return this.store.getPoolTasks(this.activeWarehouseId!);
    }
    const params: any = { as_role: 'doc_worker' };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;
    return new Promise((resolve, reject) => {
      this.docTaskApi.poolTasks(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : []),
        error: (err) => reject(err)
      });
    });
  }
}
