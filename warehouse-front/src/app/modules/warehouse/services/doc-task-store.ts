import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { offlineDb } from '../../../core/services/offline-db';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { SyncPullService } from '../../../core/services/sync-pull.service';
import { environment } from '../../../../environments/environment';
import { DocTask } from '../../../core/models/doc-task.model';

/**
 * DocTaskStore — مخزن Local-First تسک‌های مالی/اسناد
 *
 * خواندن/نوشتن فقط با Dexie انجام می‌شود؛ سرور در پس‌زمینه سینک می‌شود:
 * - خواندن: از جدول `docTasks` (که Pull پُرش می‌کند) — نمایش فوری حتی آفلاین
 * - نوشتن: به‌روزرسانی خوش‌بینانه محلی (پرچم `_offlinePending`) + enqueue در صف
 * - بعد از هر پردازش موفق صف، Pull دلتا اجرا می‌شود تا نسخهٔ رسمی سرور جایگزین شود
 */
@Injectable({ providedIn: 'root' })
export class DocTaskStore {
  private sync = OfflineSyncService.getInstance();
  readonly pull = SyncPullService.getInstance();

  private lastWarehouseId: number | null = null;
  private subs: Subscription[] = [];
  private wired = false;

  /**
   * سیم‌کشی تریگرهای Pull خودکار (یک‌بار)
   */
  private wireTriggers(): void {
    if (this.wired) return;
    this.wired = true;

    this.subs.push(
      this.sync.syncOutcome$.subscribe((outcome) => {
        const touched =
          (outcome.status === 'completed' && outcome.synced > 0) ||
          (outcome.status === 'partial' && (outcome.synced > 0 || outcome.rejected > 0));
        if (touched && this.lastWarehouseId !== null) {
          this.pull.pullChanges(this.lastWarehouseId);
        }
      })
    );

    this.subs.push(
      this.sync.rejected$.subscribe((err) => {
        if (err.entityType?.startsWith('doc_task') && this.lastWarehouseId !== null) {
          this.pull.pullChanges(this.lastWarehouseId);
        }
      })
    );
  }

  // ════════════════════════════════════════════
  //  خواندن (از Dexie)
  // ════════════════════════════════════════════

  /** تسک‌های خود کارشناس مالی در یک انبار */
  async getMyTasks(warehouseId: number, userId: number): Promise<DocTask[]> {
    const rows = await offlineDb.docTasks
      .where('warehouse_id').equals(warehouseId).toArray();
    return rows.filter((t: DocTask) => t.doc_worker === userId);
  }

  /** تسک‌های استخر (بدون کارشناس، در انتظار بررسی) */
  async getPoolTasks(warehouseId: number): Promise<DocTask[]> {
    const rows = await offlineDb.docTasks
      .where('warehouse_id').equals(warehouseId).toArray();
    return rows.filter(
      (t: DocTask) => t.doc_worker === null && t.status === 'PENDING_DOC'
    );
  }

  // ════════════════════════════════════════════
  //  Pull
  // ════════════════════════════════════════════

  /** دانلود دلتای انبار در پس‌زمینه */
  refresh(warehouseId: number): Promise<unknown> {
    this.lastWarehouseId = warehouseId;
    this.wireTriggers();
    return this.pull.pullChanges(warehouseId);
  }

  // ════════════════════════════════════════════
  //  نوشتن (خوش‌بینانه محلی + صف)
  // ════════════════════════════════════════════

  /**
   * ذخیرهٔ پیش‌نویس فیلدهای مالی — status تغییری نمی‌کند.
   */
  async saveDraft(
    task: DocTask,
    changes: Partial<DocTask>,
    userId: number
  ): Promise<void> {
    const syncId = task.sync_id || (task as any)._offlineId;
    if (!syncId && !task.id) throw new Error('Task identifier (sync_id or id) missing');

    if (syncId) {
      await offlineDb.docTasks.update(syncId, {
        ...changes,
        _offlinePending: true,
      });
    }

    const entitySyncId = syncId || `temp_${task.id}`;
    await this.sync.enqueue(
      'PATCH',
      `${environment.apiUrl}/inventory/doc-tasks/${task.id}/`,
      { ...changes, base_updated_at: task.updated_at },
      {
        userId,
        entityType: 'doc_task',
        entitySyncId,
        baseUpdatedAt: task.updated_at,
      }
    );

    this.sync.processQueue();
  }

  /**
   * ارسال گروهی تسک‌های بررسی‌شده.
   * وضعیت محلی خوش‌بینانه بر اساس skip_supervisor به DOC_MANAGER_REVIEW یا DOC_PROCESSED تبدیل می‌شود.
   */
  async submitTasks(tasks: DocTask[], userId: number, warehouseId?: number): Promise<void> {
    const withSyncId = tasks.filter((t) => t.sync_id);
    for (const t of withSyncId) {
      const nextStatus = t.skip_supervisor ? 'DOC_MANAGER_REVIEW' : 'DOC_PROCESSED';
      await offlineDb.docTasks.update(t.sync_id!, {
        status: nextStatus,
        _offlinePending: true,
      });
    }

    const payload: any = {
      task_ids: tasks.map((t) => t.id).filter((id) => !!id),
      sync_ids: withSyncId.map((t) => t.sync_id),
    };
    if (warehouseId) payload.warehouse_id = warehouseId;

    await this.sync.enqueue(
      'POST',
      `${environment.apiUrl}/inventory/doc-tasks/bulk_submit/`,
      payload,
      { userId, entityType: 'doc_task_bulk' }
    );

    this.sync.processQueue();
  }

  /**
   * بر عهده گرفتن گروهی تسک‌ها از استخر عمومی (Local-First Claim)
   */
  async claimTasks(tasks: DocTask[], userId: number, asRole: 'doc_worker' | 'doc_supervisor' = 'doc_worker'): Promise<void> {
    const withSyncId = tasks.filter((t) => t.sync_id);
    for (const t of withSyncId) {
      const updateData: Partial<DocTask> & { _offlinePending: boolean } = {
        _offlinePending: true
      };
      if (asRole === 'doc_worker') {
        updateData.doc_worker = userId;
      } else {
        updateData.doc_supervisor = userId;
      }
      await offlineDb.docTasks.update(t.sync_id!, updateData);
    }

    await this.sync.enqueue(
      'POST',
      `${environment.apiUrl}/inventory/doc-tasks/claim_tasks/`,
      {
        task_ids: tasks.map((t) => t.id).filter((id) => !!id),
        sync_ids: withSyncId.map((t) => t.sync_id),
        as_role: asRole,
      },
      { userId, entityType: 'doc_task_claim' }
    );

    this.sync.processQueue();
  }
}
