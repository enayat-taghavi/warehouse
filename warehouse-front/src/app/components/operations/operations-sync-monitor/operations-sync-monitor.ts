import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  offlineDb,
  warehouseOfflineDb,
  financeOfflineDb,
  SyncQueueEntry,
  SyncErrorEntry
} from '../../../core/services/offline-db';
import { NetworkStatusService, ConnectionState } from '../../../core/services/network-status.service';
import { SessionTabService } from '../../../core/services/session-tab.service';
import { ClientTelemetryService, FleetSessionItem } from '../../../core/services/client-telemetry.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../core/http/websocket.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ConflictResolutionModalComponent } from '../../../shared/components/conflict-resolution-modal/conflict-resolution-modal.component';
import { Subscription } from 'rxjs';
import { SvgIconDirective } from '../../../shared/icons/svg-icon.directive';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';

import { ActionButtonComponent } from '../../../shared/components/action-button/action-button.component';

export interface TabletDeviceTelemetry {
  tabId: string;
  isCurrentTab: boolean;
  appScope: string;
  status: 'online' | 'offline' | 'lie-fi';
  pendingQueueCount: number;
  lastPingShamsi: string;
  deviceModel?: string;
  osName?: string;
  browserName?: string;
  ipAddress?: string;
  userFullName?: string;
  activeRole?: string;
  sessionId?: number;
  isRevoked?: boolean;
}

export interface ConflictItem {
  id?: number;
  url: string;
  method: string;
  statusCode: number;
  entityType?: string;
  entitySyncId?: string;
  clientPayload: any;
  serverMessage: string;
  timestampShamsi: string;
}

@Component({
  selector: 'app-operations-sync-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule, ConflictResolutionModalComponent, SvgIconDirective, ActionButtonComponent],
  templateUrl: './operations-sync-monitor.html',
  styleUrl: './operations-sync-monitor.css'
})
export class OperationsSyncMonitorComponent implements OnInit, OnDestroy {
  public networkStatus = NetworkStatusService.getInstance();
  public sessionTab = inject(SessionTabService);
  public clientTelemetry = inject(ClientTelemetryService);
  public offlineSync = inject(OfflineSyncService);
  public ws = inject(WebSocketService);
  public moduleRegistry = inject(ModuleRegistryService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  private cdr = inject(ChangeDetectorRef);

  get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.isModuleInstalled('warehouse');
  }

  get isAccountingInstalled(): boolean {
    return this.moduleRegistry.isModuleInstalled('accounting');
  }

  get showWarehouseQueue(): boolean {
    return this.isWarehouseInstalled || this.warehouseQueueCount() > 0;
  }

  get showFinanceQueue(): boolean {
    return this.isAccountingInstalled || this.financeQueueCount() > 0;
  }

  get queueSummaryText(): string {
    const parts: string[] = [];
    if (this.showWarehouseQueue) {
      parts.push(`انبارداری: ${this.warehouseQueueCount()}`);
    }
    if (this.showFinanceQueue) {
      parts.push(`مالی: ${this.financeQueueCount()}`);
    }
    return parts.join(' | ');
  }

  public isRefreshing = signal<boolean>(false);
  public isFlushingQueue = signal<boolean>(false);
  public isRevoking = signal<number | null>(null);
  public connectionState = signal<ConnectionState>('online');
  public isWsConnected = signal<boolean>(false);
  public currentTabId = signal<string>('');
  public queueItems = signal<SyncQueueEntry[]>([]);
  public conflictErrors = signal<SyncErrorEntry[]>([]);
  public tabletFleet = signal<TabletDeviceTelemetry[]>([]);
  public currentDeviceModel = signal<string>('در حال شناسایی...');

  public warehouseQueueCount = signal<number>(0);
  public financeQueueCount = signal<number>(0);

  public selectedConflict: SyncErrorEntry | null = null;
  public showConflictModal = false;
  private subs = new Subscription();
  private autoRefreshTimer: any = null;

  ngOnInit(): void {
    this.currentTabId.set(this.sessionTab.tabId);
    this.connectionState.set(this.networkStatus.state);

    this.subs.add(
      this.networkStatus.state$.subscribe((state: ConnectionState) => {
        this.connectionState.set(state);
        this.cdr.detectChanges();
      })
    );

    // اتصال و شنود بلادرنگ رویدادهای وب‌سوکت
    this.ws.connect();
    this.subs.add(
      this.ws.connected$.subscribe(connected => {
        this.isWsConnected.set(connected);
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.ws.notifications$.subscribe((data: any) => {
        const type = data?.type || data?.type_str || data?.event;
        if (
          type === 'fleet_update' ||
          type === 'session_revoked' ||
          type === 'telemetry_update' ||
          type === 'count_task_update' ||
          type === 'doc_task_update'
        ) {
          this.refreshTelemetry(false);
        }
      })
    );

    this.initDeviceInfo();
    this.refreshTelemetry();

    // رفرش دوره‌ای تله‌متری ناوگان هر ۲۰ ثانیه جهت پشتیبان
    this.autoRefreshTimer = setInterval(() => {
      this.refreshTelemetry(false);
    }, 20000);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
  }

  private async initDeviceInfo(): Promise<void> {
    try {
      const dev = await this.clientTelemetry.getDeviceInfo();
      this.currentDeviceModel.set(dev.model);
    } catch {
      this.currentDeviceModel.set('این پایانه');
    }
  }

  /**
   * بازخوانی کامل تله‌متری صف‌های آفلاین، تداخل‌ها و ناوگان دستگاه‌های متصل
   */
  async refreshTelemetry(showSpinner: boolean = true): Promise<void> {
    if (showSpinner) this.isRefreshing.set(true);

    try {
      // ۱. پایش دوگانه پایگاه داده‌های محلی (انبارداری + مالی)
      const [wQueue, fQueue, wErrors, fErrors] = await Promise.all([
        warehouseOfflineDb.syncQueue.toArray().catch(() => [] as SyncQueueEntry[]),
        financeOfflineDb.syncQueue.toArray().catch(() => [] as SyncQueueEntry[]),
        warehouseOfflineDb.syncErrors.where('dismissed').equals(0).toArray().catch(() => [] as SyncErrorEntry[]),
        financeOfflineDb.syncErrors.where('dismissed').equals(0).toArray().catch(() => [] as SyncErrorEntry[]),
      ]);

      this.warehouseQueueCount.set(wQueue.length);
      this.financeQueueCount.set(fQueue.length);

      // تجمیع صف‌ها و خطاها
      const combinedQueue = [...wQueue, ...fQueue];
      const combinedErrors = [...wErrors, ...fErrors];

      this.queueItems.set(combinedQueue);
      this.conflictErrors.set(combinedErrors);

      // ۲. واکشی ناوگان زنده متصل از سرور
      const serverFleet: FleetSessionItem[] = await this.clientTelemetry.getFleetSessions();
      const currentTab = this.sessionTab.tabId;
      const currentScope = this.sessionTab.getActiveApp();
      const devInfo = await this.clientTelemetry.getDeviceInfo();

      const fleet: TabletDeviceTelemetry[] = [];

      if (serverFleet && serverFleet.length > 0) {
        for (const s of serverFleet) {
          const isCurrent = s.tab_id === currentTab;
          let pingTime = 'همین الان';
          try {
            pingTime = new Date(s.last_heartbeat_iso).toLocaleTimeString('fa-IR');
          } catch {}

          fleet.push({
            tabId: s.tab_id,
            isCurrentTab: isCurrent,
            appScope: s.app_scope,
            activeRole: s.active_role,
            status: s.is_online ? 'online' : 'offline',
            pendingQueueCount: isCurrent ? combinedQueue.length : s.pending_queue_count,
            lastPingShamsi: pingTime,
            deviceModel: s.device_model,
            osName: s.os_name,
            browserName: s.browser_name,
            ipAddress: s.ip_address,
            userFullName: s.user_full_name || s.username,
            sessionId: s.id,
            isRevoked: s.is_revoked
          });
        }
      }

      // اگر تب جاری هنوز در لیست سرور ثبت نشده بود، آن را در ابتدای لیست درج کن
      if (!fleet.some(f => f.isCurrentTab)) {
        fleet.unshift({
          tabId: currentTab,
          isCurrentTab: true,
          appScope: currentScope,
          activeRole: this.sessionTab.getActiveRole(),
          status: this.connectionState() === 'offline' ? 'offline' : 'online',
          pendingQueueCount: combinedQueue.length,
          lastPingShamsi: new Date().toLocaleTimeString('fa-IR'),
          deviceModel: devInfo.model,
          osName: devInfo.os,
          browserName: devInfo.browser,
          ipAddress: 'این پایانه',
          userFullName: 'کاربر جاری',
          sessionId: 0,
          isRevoked: false
        });
      }

      this.tabletFleet.set(fleet);
    } catch (e) {
      console.warn('[OperationsSyncMonitor] خطا در خواندن اطلاعات تله‌متری:', e);
    } finally {
      if (showSpinner) this.isRefreshing.set(false);
      this.cdr.detectChanges();
    }
  }

  openConflictDetails(err: SyncErrorEntry): void {
    this.selectedConflict = err;
    this.showConflictModal = true;
  }

  closeConflictModal(): void {
    this.showConflictModal = false;
    this.selectedConflict = null;
  }

  /**
   * بازخورد پس از حل تداخل از طریق کامپوننت ConflictResolutionModalComponent
   */
  async onConflictResolved(result: { success: boolean; message: string; online: boolean }): Promise<void> {
    this.closeConflictModal();
    if (result.success) {
      this.toast.show('success', result.message || 'تداخل با موفقیت حل و در سرور ثبت شد.');
    } else {
      this.toast.show('warning', result.message || 'خطا در حل تداخل');
    }
    await this.refreshTelemetry();
  }

  /**
   * حل تداخل به شکل مستقیم یا برنامه‌نویسی
   */
  async resolveConflict(strategy: 'client' | 'server' | 'discard'): Promise<void> {
    if (!this.selectedConflict || !this.selectedConflict.id) return;
    const errorId = this.selectedConflict.id;

    try {
      if (strategy === 'discard') {
        // نادیده گرفتن خطا در هر دو دیتابیس
        await warehouseOfflineDb.syncErrors.update(errorId, { dismissed: 1 }).catch(() => {});
        await financeOfflineDb.syncErrors.update(errorId, { dismissed: 1 }).catch(() => {});
        this.toast.show('info', 'تداخل از صف خطاها نادیده گرفته و حذف شد.');
      } else if (strategy === 'client') {
        // استفاده از متد واقعی OfflineSyncService برای ارسال نسخه کلاینت با زمان بروزرسانی سرور
        const body = this.selectedConflict.body || {};
        const res = await this.offlineSync.resolveConflict(errorId, body);
        if (res.success) {
          this.toast.show('success', 'تغییر نسخه کلاینت با موفقیت در سرور اعمال شد.');
        } else {
          this.toast.show('warning', res.message);
        }
      } else {
        // پذیرش نسخه سرور
        const serverRecord = this.selectedConflict.serverResponse?.server_record;
        if (serverRecord) {
          const res = await this.offlineSync.resolveConflict(errorId, serverRecord);
          if (res.success) {
            this.toast.show('success', 'نسخه سرور پذیرفته شد و دیتابیس محلی همگام گردید.');
          }
        } else {
          await warehouseOfflineDb.syncErrors.delete(errorId).catch(() => {});
          await financeOfflineDb.syncErrors.delete(errorId).catch(() => {});
          this.toast.show('success', 'نسخه سرور تایید و خطای تداخل پاکسازی شد.');
        }
      }

      this.closeConflictModal();
      await this.refreshTelemetry();
    } catch (e) {
      console.error('خطا در حل تداخل:', e);
      this.toast.show('error', 'خطا در اعمال استراتژی حل تداخل.');
    }
  }

  /**
   * اجرای واقعی تخلیه و ارسال صف آفلاین به سرور
   */
  async flushOfflineQueue(): Promise<void> {
    const totalQueue = this.queueItems().length;
    if (totalQueue === 0) {
      this.toast.show('info', 'صف ارسال آفلاین خالی است.');
      return;
    }

    this.isFlushingQueue.set(true);
    try {
      const res: any = await this.offlineSync.triggerSync();
      const syncedCount = res?.synced ?? 0;
      const rejectedCount = res?.rejected ?? 0;
      if (res?.status === 'completed' || syncedCount > 0) {
        this.toast.show('success', `${syncedCount} تراکنش آفلاین با موفقیت به سرور ارسال و ثبت شد.`);
      } else if (res?.status === 'offline') {
        this.toast.show('warning', 'دستگاه در وضعیت آفلاین است؛ ارسال پس از اتصال اینترنت انجام خواهد شد.');
      } else if (rejectedCount > 0) {
        this.toast.show('warning', `${rejectedCount} تراکنش با خطای سرور یا تداخل ۴۰۹ مواجه شد.`);
      } else {
        this.toast.show('info', 'فرآیند همگام‌سازی صف تکمیل شد.');
      }
    } catch (e: any) {
      this.toast.show('error', e?.message || 'خطا در برقراری ارتباط با سرور.');
    } finally {
      this.isFlushingQueue.set(false);
      await this.refreshTelemetry();
    }
  }

  /**
   * بررسی مصونیت نظارتی نشست سرپرستان و مدیران سیستم
   */
  isSupervisorSession(t: TabletDeviceTelemetry): boolean {
    const role = (t.activeRole || '').toLowerCase();
    const user = (t.userFullName || '').toLowerCase();
    return role.includes('supervisor') || role.includes('manager') || role.includes('admin') || user.includes('سرپرست') || user.includes('مدیر');
  }

  /**
   * ابطال نشست و اخراج اجباری دستگاه توسط مدیر
   */
  async revokeDeviceSession(sessionId?: number, deviceName?: string): Promise<void> {
    if (!sessionId) {
      this.toast.show('warning', 'شناسه نشست دستگاه برای ابطال یافت نشد.');
      return;
    }

    const confirmed = await this.confirmDialog.open({
      title: 'ابطال نشست و اخراج اجباری دستگاه',
      message: `آیا از ابطال نشست دستگاه «${deviceName || 'این پایانه'}» و خروج اجباری آن از سامانه اطمینان دارید؟ دسترسی این پایانه بلافاصله مسدود خواهد شد.`,
      type: 'danger',
      confirmText: 'بله، ابطال و اخراج شود',
      cancelText: 'انصراف'
    });

    if (!confirmed) {
      return;
    }

    this.isRevoking.set(sessionId);
    try {
      const res = await this.clientTelemetry.revokeSession(sessionId);
      if (res.success) {
        this.toast.show('success', res.message);
      } else {
        this.toast.show('error', res.message);
      }
      await this.refreshTelemetry();
    } finally {
      this.isRevoking.set(null);
    }
  }

  async clearAllResolvedErrors(): Promise<void> {
    const confirmed = await this.confirmDialog.open({
      title: 'پاک‌سازی خطاهای همگام‌سازی',
      message: 'آیا از پاک‌سازی خطاهای همگام‌سازی رفع‌شده یا ردشده اطمینان دارید؟ توجه: تداخل‌های ۴۰۹ حل‌نشده جهت جلوگیری از اتلاف داده حفظ خواهند شد.',
      type: 'danger',
      confirmText: 'بله، پاک‌سازی شود',
      cancelText: 'انصراف'
    });

    if (!confirmed) {
      return;
    }

    try {
      const clearSafeErrors = async (db: typeof warehouseOfflineDb) => {
        const toDelete = await db.syncErrors
          .filter(e => e.statusCode !== 409 || e.dismissed === 1)
          .toArray();
        const ids = toDelete.map(e => e.id).filter((id): id is number => id !== undefined);
        if (ids.length > 0) {
          await db.syncErrors.bulkDelete(ids);
        }
      };

      await Promise.all([
        clearSafeErrors(warehouseOfflineDb).catch(() => {}),
        clearSafeErrors(financeOfflineDb).catch(() => {})
      ]);
      this.toast.show('success', 'خطاهای همگام‌سازی رفع‌شده پاکسازی شدند.');
      await this.refreshTelemetry();
    } catch {
      this.toast.show('error', 'خطا در پاکسازی خطاهای همگام‌سازی.');
    }
  }

  /**
   * شبیه‌سازی یک تداخل ۴۰۹ واقعی جهت تست موتور حل اختلاف و ۳-Way Merge.
   * فقط در نصب دارای انبار (L16): نمونهٔ مالی به نشانی واقعیِ سرور نمی‌رسد و حل آن
   * رکورد ساختگی را در صف واقعی مالی می‌چرخاند؛ پس در نبود انبار دکمه پنهان است.
   */
  async simulateConflictScenario(): Promise<void> {
    if (!this.isWarehouseInstalled) return;
    try {
      await warehouseOfflineDb.syncErrors.add({
        method: 'PATCH',
        url: '/api/counting/tasks/101/',
        body: {
          quantity: 45,
          reason: 'شمارش ردیف A-04',
          notes: 'شمارش انجام‌شده توسط انباردار تبلت ۱'
        },
        statusCode: 409,
        serverMessage: 'تداخل نسخه سرور (409 Conflict): رکورد هم‌زمان توسط کاربر دیگری در سرور تغییر یافته است.',
        failedAt: Date.now(),
        dismissed: 0,
        entityType: 'count_task',
        serverResponse: {
          error: 'CONFLICT',
          server_record: {
            id: 101,
            quantity: 50,
            reason: 'ثبت مغایرت توسط سرپرست',
            notes: 'تطبیق نهایی فیزیکی قفسه',
            updated_at: new Date().toISOString()
          }
        }
      });
      this.toast.show('warning', 'یک تداخل نمونه ۴۰۹ در آزمایشگاه تداخل ثبت گردید.');
      await this.refreshTelemetry();
    } catch (e) {
      console.error(e);
    }
  }
}
