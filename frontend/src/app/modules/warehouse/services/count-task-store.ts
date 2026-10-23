import { Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import { offlineDb } from '../../../core/services/offline-db';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { SyncPullService } from '../../../core/services/sync-pull.service';
import { environment } from '../../../../environments/environment';
import { CountTask, CountTaskStatus } from '../models/count-task.model';

/**
 * CountTaskStore — مخزن Local-First تسک‌های شمارش (فاز ۲)
 *
 * خواندن/نوشتن فقط با Dexie انجام می‌شود؛ سرور در پس‌زمینه سینک می‌شود:
 * - خواندن: از جدول `countTasks` (که Pull پُرش می‌کند) — نمایش فوری حتی آفلاین
 * - نوشتن: به‌روزرسانی خوش‌بینانه محلی (پرچم `_offlinePending`) + enqueue در صف
 * - بعد از هر پردازش موفق صف، Pull دلتا اجرا می‌شود تا نسخهٔ رسمی سرور جایگزین
 *   نسخهٔ خوش‌بینانه شود و پرچم‌ها پاک شوند.
 *
 * جریان ناظر/مدیر عمداً اینجا نیست — فقط شمارشگر Local-First است (طبق طرح).
 */
@Injectable({ providedIn: 'root' })
export class CountTaskStore {
  private sync = OfflineSyncService.getInstance();
  readonly pull = SyncPullService.getInstance();

  /** آخرین انباری که این store برایش استفاده شده — هدف Pullهای خودکار */
  private lastWarehouseId: number | null = null;
  private subs: Subscription[] = [];
  private wired = false;

  /**
   * سیم‌کشی تریگرهای Pull خودکار (یک‌بار):
   * ۱) بعد از هر دور موفق صف (تا نسخهٔ رسمی سرور جایگزین خوش‌بینانه شود)
   * ۲) بعد از هر رد صریح (reconciliation کامل با نسخهٔ سرور)
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
        if (err.entityType?.startsWith('count_task') && this.lastWarehouseId !== null) {
          this.pull.pullChanges(this.lastWarehouseId);
        }
      })
    );
  }

  // ════════════════════════════════════════════
  //  خواندن (از Dexie)
  // ════════════════════════════════════════════

  /** تسک‌های خود شمارشگر در یک انبار */
  async getMyTasks(warehouseId: number, userId: number): Promise<CountTask[]> {
    const rows = await offlineDb.countTasks
      .where('warehouse_id').equals(warehouseId).toArray();
    return rows.filter((t: CountTask) => t.counter === userId && !t._serverDeleted);
  }

  /** تسک‌های استخر (بدون شمارشگر، در انتظار شمارش) */
  async getPoolTasks(warehouseId: number): Promise<CountTask[]> {
    const rows = await offlineDb.countTasks
      .where('warehouse_id').equals(warehouseId).toArray();
    return rows.filter(
      (t: CountTask) => t.counter === null && t.status === 'PENDING_COUNT' && !t._serverDeleted
    );
  }

  // ════════════════════════════════════════════
  //  Pull
  // ════════════════════════════════════════════

  /** دانلود دلتای انبار در پس‌زمینه؛ warehouseId را برای تریگرهای بعدی به خاطر می‌سپارد */
  refresh(warehouseId: number): Promise<unknown> {
    this.lastWarehouseId = warehouseId;
    this.wireTriggers();
    return this.pull.pullChanges(warehouseId);
  }

  // ════════════════════════════════════════════
  //  نوشتن (خوش‌بینانه محلی + صف)
  // ════════════════════════════════════════════

  /**
   * ذخیرهٔ پیش‌نویس شمارش — در صورت وجود مقدار و وضعیت PENDING_COUNT، به INITIAL_COUNT تغییر می‌یابد.
   * baseUpdatedAt = نسخه‌ای که کاربر رویش تغییر داده → سرور تداخل را 409 می‌کند.
   */
  async saveDraft(
    task: CountTask,
    changes: { counted_balance: string | null; counter_note: string; status?: CountTaskStatus },
    userId: number
  ): Promise<void> {
    if (!task.sync_id) throw new Error('sync_id missing');

    const newStatus = changes.status || (task.status === 'PENDING_COUNT' && changes.counted_balance !== null ? 'INITIAL_COUNT' : task.status);
    const updatePayload = {
      ...changes,
      status: newStatus,
    };

    await offlineDb.countTasks.update(task.sync_id, {
      ...updatePayload,
      _offlinePending: true,
    });

    await this.sync.enqueue(
      'PATCH',
      `${environment.apiUrl}/inventory/count-tasks/${task.id}/`,
      { ...updatePayload, base_updated_at: task.updated_at },
      {
        userId,
        entityType: 'count_task',
        entitySyncId: task.sync_id,
        baseUpdatedAt: task.updated_at,
      }
    );

    // اگر آنلاین باشیم بلافاصله ارسال می‌شود؛ آفلاین → در صف می‌ماند
    this.sync.processQueue();
  }

  /**
   * ارسال گروهی تسک‌های شمرده‌شده به کارتابل.
   * وضعیت محلی خوش‌بینانه COUNTED می‌شود؛ وضعیت واقعی (COUNTED یا MANAGER_REVIEW
   * بسته به تنظیم انبار) با Pull بعدی از سرور می‌آید.
   * سمت سرور idempotent است (sync_ids + already_submitted) — retry صف بی‌خطر است.
   */
  async submitTasks(tasks: CountTask[], userId: number): Promise<void> {
    const withSyncId = tasks.filter((t) => t.sync_id);
    for (const t of withSyncId) {
      await offlineDb.countTasks.update(t.sync_id!, {
        status: 'COUNTED',
        _offlinePending: true,
      });
    }

    await this.sync.enqueue(
      'POST',
      `${environment.apiUrl}/inventory/count-tasks/bulk_submit/`,
      {
        task_ids: tasks.map((t) => t.id).filter((id) => !!id),
        sync_ids: withSyncId.map((t) => t.sync_id),
      },
      { userId, entityType: 'count_task_bulk' }
    );

    this.sync.processQueue();
  }
}
