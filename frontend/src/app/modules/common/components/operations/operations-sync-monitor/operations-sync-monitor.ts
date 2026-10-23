import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  offlineDb,
  getAllOfflineDbs,
  getOfflineDb,
  DEFAULT_OFFLINE_SCOPE,
  OfflineDatabase,
  normalizeScope,
  resolveOfflineDbStrict,
  SyncQueueEntry,
  SyncErrorEntry
} from '../../../../../core/services/offline-db';
import { NetworkStatusService, ConnectionState } from '../../../../../core/services/network-status.service';
import { SessionTabService, DEFAULT_ACTIVE_APP_MODULE } from '../../../../../core/services/session-tab.service';
import { ClientTelemetryService, FleetSessionItem } from '../../../../../core/services/client-telemetry.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ConflictResolutionModalComponent } from '../../../../../shared/components/conflict-resolution-modal/conflict-resolution-modal.component';
import { Subscription } from 'rxjs';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';

import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';

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

/** قلمرو صف: نام مستعار قلمرو ثبت‌شده نرمال می‌شود؛ قلمرو بی دیتابیس آفلاین به انبار پیش‌فرض نمی‌ریزد */
function monitorScope(raw: string): string {
  return resolveOfflineDbStrict(raw) ? normalizeScope(raw) : raw.toLowerCase();
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

  /**
   * صف‌های پایش: هر ماژول این بیلد که syncMonitorScope دارد، به ترتیب queueOrder.
   * صف ماژول نصب‌نشده هم وقتی رکورد معلق دارد دیده می‌شود تا هیچ داده‌ای پنهان نماند.
   */
  private get queueSpecs(): { scope: string; label: string; installed: boolean; order: number }[] {
    const installed = new Set(this.moduleRegistry.getExtensions('operations')
      .map(e => e.extension.syncMonitorScope)
      .filter((s): s is string => !!s)
      .map(s => monitorScope(s)));
    const seen = new Set<string>();
    const specs: { scope: string; label: string; installed: boolean; order: number }[] = [];
    for (const mod of this.moduleRegistry.getAllModules()) {
      const ops = mod.extensions?.operations;
      if (!ops?.syncMonitorScope) continue;
      const scope = monitorScope(ops.syncMonitorScope);
      if (seen.has(scope)) continue;
      seen.add(scope);
      specs.push({ scope, label: ops.queueLabelFa ?? mod.titleShortFa, installed: installed.has(scope), order: ops.queueOrder ?? 100 });
    }
    return specs.sort((a, b) => a.order - b.order);
  }

  /** صف‌های قابل‌نمایش با شمار رکوردهای معلق هر کدام؛ صف معلق دیتابیسی که ماژولش در این بیلد نیست زیر «سایر» */
  get monitoredQueues(): { scope: string; label: string; count: number }[] {
    const counts = this.queueCounts();
    const specs = this.queueSpecs;
    const queues = specs
      .filter(s => s.installed || (counts[s.scope] || 0) > 0)
      .map(s => ({ scope: s.scope, label: s.label, count: counts[s.scope] || 0 }));
    const known = new Set(specs.map(s => s.scope));
    const other = Object.entries(counts).filter(([scope]) => !known.has(scope)).reduce((sum, [, n]) => sum + (n || 0), 0);
    if (other > 0) queues.push({ scope: '', label: 'سایر', count: other });
    return queues;
  }

  isQueueShown(scope: string): boolean {
    return this.monitoredQueues.some(q => q.scope === monitorScope(scope));
  }

  /** نخستین ماژول نصب‌شده‌ای که نمونهٔ تداخل برای آزمایشگاه تداخل عرضه می‌کند */
  get conflictSimulator(): { scope: string; build: () => Record<string, any> } | null {
    const ext = this.moduleRegistry.getExtensions('operations')
      .find(e => !!e.extension.conflictSimulation && !!e.extension.syncMonitorScope);
    return ext ? { scope: ext.extension.syncMonitorScope!, build: ext.extension.conflictSimulation! } : null;
  }

  /** ماژول نصب‌شدهٔ یک کد اپ (کلید اپ لانچر، کد ماژول یا نام مستعار) */
  private moduleForApp(app: string | null | undefined) {
    if (!app) return undefined;
    return this.moduleRegistry.getInstalledModules().find(m =>
      m.extensions?.launcherTile?.appKey === app || m.code === app || !!m.aliases?.includes(app));
  }

  /** برچسب و رنگ قلمرو یک تب متصل (از ماژول همان کد اپ؛ کد ناشناخته ماژول اپ پیش‌فرض را می‌گیرد) */
  scopeBadge(appScope: string): { label: string; classes: string } {
    const mod = this.moduleForApp(appScope) ?? this.moduleForApp(DEFAULT_ACTIVE_APP_MODULE);
    const accent = mod?.extensions?.launcherTile?.switcher?.accent ?? 'emerald';
    const classes: Record<string, string> = {
      indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
    return { label: mod?.extensions?.operations?.monitorLabelFa ?? mod?.titleShortFa ?? appScope, classes: classes[accent] };
  }

  get queueSummaryText(): string {
    return this.monitoredQueues.map(q => `${q.label}: ${q.count}`).join(' | ');
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

  /** شمار رکوردهای صف هر قلمرو (کلید: قلمرو نرمال‌شده) */
  public queueCounts = signal<Record<string, number>>({});

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

  private errorSourceMap = new Map<SyncErrorEntry, OfflineDatabase>();

  getSourceDb(err: SyncErrorEntry | null): OfflineDatabase {
    if (!err) return getOfflineDb(DEFAULT_OFFLINE_SCOPE);
    const fromMap = this.errorSourceMap.get(err);
    if (fromMap) return fromMap;
    return (err.appScope ? resolveOfflineDbStrict(err.appScope) : null) ?? getOfflineDb(DEFAULT_OFFLINE_SCOPE);
  }

  /**
   * بازخوانی کامل تله‌متری صف‌های آفلاین، تداخل‌ها و ناوگان دستگاه‌های متصل
   */
  async refreshTelemetry(showSpinner: boolean = true): Promise<void> {
    if (showSpinner) this.isRefreshing.set(true);

    try {
      // ۱. پایش همهٔ پایگاه داده‌های محلی (هر قلمرو دیتابیس خودش را دارد)
      const dbs = getAllOfflineDbs();
      const perDb = await Promise.all(dbs.map(db => Promise.all([
        db.syncQueue.toArray().catch(() => [] as SyncQueueEntry[]),
        db.syncErrors.where('dismissed').equals(0).toArray().catch(() => [] as SyncErrorEntry[]),
      ])));

      const counts: Record<string, number> = {};
      this.errorSourceMap.clear();
      const combinedQueue: SyncQueueEntry[] = [];
      const combinedErrors: SyncErrorEntry[] = [];
      dbs.forEach((db, i) => {
        const [queue, errors] = perDb[i];
        counts[db.dbScope] = (counts[db.dbScope] || 0) + queue.length;
        for (const err of errors) {
          this.errorSourceMap.set(err, db);
        }
        combinedQueue.push(...queue);
        combinedErrors.push(...errors);
      });
      this.queueCounts.set(counts);

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
    const sourceDb = this.getSourceDb(this.selectedConflict);

    try {
      if (strategy === 'discard') {
        // نادیده گرفتن خطا فقط در دیتابیس منبع
        await sourceDb.syncErrors.update(errorId, { dismissed: 1 }).catch(() => {});
        this.toast.show('info', 'تداخل نادیده گرفته شد و از فهرست پنهان شد؛ داده روی دستگاه محفوظ است.');
      } else if (strategy === 'client') {
        // استفاده از متد واقعی OfflineSyncService برای ارسال نسخه کلاینت با زمان بروزرسانی سرور
        const body = this.selectedConflict.body || {};
        const res = await this.offlineSync.resolveConflict(errorId, body, sourceDb.dbScope);
        if (res.success) {
          this.toast.show('success', 'تغییر نسخه کلاینت با موفقیت در سرور اعمال شد.');
        } else {
          this.toast.show('warning', res.message);
        }
      } else {
        // پذیرش نسخه سرور
        const serverRecord = this.selectedConflict.serverResponse?.server_record;
        if (serverRecord) {
          const res = await this.offlineSync.resolveConflict(errorId, serverRecord, sourceDb.dbScope);
          if (res.success) {
            this.toast.show('success', 'نسخه سرور پذیرفته شد و دیتابیس محلی همگام گردید.');
          }
        } else {
          // syncErrors تنها نسخهٔ بدنهٔ ردشده است و سرور چیزی را نپذیرفته؛ پس حذف نمی‌شود، فقط پنهان می‌شود
          await sourceDb.syncErrors.update(errorId, { dismissed: 1 }).catch(() => {});
          this.toast.show('success', 'نسخه سرور تایید شد و خطای تداخل از فهرست پنهان شد.');
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
      title: 'پاک‌سازی فهرست خطاهای همگام‌سازی',
      message: 'خطاهای غیر تداخلی از این فهرست پنهان می‌شوند، ولی داده آن‌ها روی دستگاه حذف نمی‌شود. تداخل‌های ۴۰۹ حل‌نشده در فهرست می‌مانند.',
      type: 'warning',
      confirmText: 'بله، پنهان شود',
      cancelText: 'انصراف'
    });

    if (!confirmed) {
      return;
    }

    try {
      // هیچ رکوردی حذف نمی‌شود: syncErrors تنها نسخه بدنه ردشده است و retryError هر کد 4xx را دوباره به صف می‌برد.
      // پس فقط خطاهای غیر ۴۰۹ دیده‌نشده پنهان (dismissed) می‌شوند؛ شکست هر پایگاه به catch بیرونی می‌رسد.
      const dismissNonConflicts = (db: OfflineDatabase) =>
        db.syncErrors.where('dismissed').equals(0).filter(e => e.statusCode !== 409).modify({ dismissed: 1 });

      await Promise.all(getAllOfflineDbs().map(db => dismissNonConflicts(db)));
      this.toast.show('success', 'خطاهای غیر تداخلی از فهرست پنهان شدند؛ داده آن‌ها روی دستگاه محفوظ است.');
      await this.refreshTelemetry();
    } catch {
      this.toast.show('error', 'خطا در پاکسازی خطاهای همگام‌سازی.');
    }
  }

  /**
   * شبیه‌سازی یک تداخل ۴۰۹ واقعی جهت تست موتور حل اختلاف و ۳-Way Merge.
   * نمونه را ماژول نصب‌شدهٔ صاحب آن (operations.conflictSimulation) می‌دهد و در syncErrors دیتابیس همان ماژول
   * ثبت می‌شود (L16)؛ بی چنین ماژولی دکمه پنهان است و چیزی نوشته نمی‌شود.
   */
  async simulateConflictScenario(): Promise<void> {
    const simulator = this.conflictSimulator;
    if (!simulator) return;
    const db = resolveOfflineDbStrict(simulator.scope);
    if (!db) return;
    try {
      await db.syncErrors.add({
        ...simulator.build(),
        failedAt: Date.now(),
        dismissed: 0
      } as SyncErrorEntry);
      this.toast.show('warning', 'یک تداخل نمونه ۴۰۹ در آزمایشگاه تداخل ثبت گردید.');
      await this.refreshTelemetry();
    } catch (e) {
      console.error(e);
    }
  }
}
