import {
  Component,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  Input,
  inject,
  signal,
  computed,
  DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { openExternal } from '../../../../../../core/platform/external-link';
import { isNativePlatform } from '../../../../../../core/platform/platform';
import { ExternalLinkDirective } from '../../../../../../shared/directives/external-link.directive';

export interface GDriveConfigResponse {
  company_id: number;
  company_name: string;
  is_enabled: boolean;
  is_connected: boolean;
  auth_status?: 'connected' | 'needs_reauth' | 'unlinked' | string;
  worker_alive?: boolean;
  worker_heartbeat_at?: string | null;
  other_accounts_count?: number;
  account_email: string | null;
  root_folder_id: string | null;
  root_folder_name: string | null;
  root_folder_url: string | null;
  sync_accounting_docs: boolean;
  sync_personnel_docs: boolean;
  sync_fleet_docs: boolean;
  sync_inventory_photos: boolean;
  sync_backups: boolean;
  sync_mode: 'immediate' | 'scheduled' | 'manual';
  scheduled_start_time: string;
  scheduled_end_time: string;
  chunk_delay_seconds: number;
  last_sync_at: string | null;
  last_error: string | null;
  stats: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

export interface GDriveQueueItem {
  id: number;
  model_name: string;
  object_id: number | null;
  field_name?: string | null;
  drive_account?: string | null;
  target_filename: string;
  target_folder_path: string;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority?: number;
  retry_count: number;
  next_retry_at?: string | null;
  error_code?: string | null;
  error_message: string | null;
  gdrive_file_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// نام مدل‌هایی که بک‌اند در صف ثبت می‌کند (signals_gdrive.py و execute_company_scan_all)
export const MODEL_NAME_PERSIAN_MAP: Record<string, string> = {
  Company: 'سند پایهٔ شرکت',
  CompanyDocument: 'سند مرکزی شرکت',
  CompanyBoardMember: 'مدرک عضو هیئت‌مدیره',
  ExpenseInvoice: 'فاکتور هزینه',
  PettyCashTransaction: 'رسید تنخواه',
  PersonnelProfile: 'پرونده پرسنلی',
  PersonnelDocument: 'مدرک پرسنلی',
  VehicleDocument: 'مدرک خودرو / ناوگان',
  ItemPhoto: 'تصویر کالای انبار',
  DatabaseBackup: 'پشتیبان پایگاه داده'
};

@Component({
  selector: 'app-company-gdrive-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, PersianDatePipe, LoadingSkeletonComponent, ActionButtonComponent, ExternalLinkDirective],
  templateUrl: './company-gdrive-tab.html'
})
export class CompanyGdriveTabComponent implements OnInit, OnDestroy, OnChanges {
  @Input() companyId?: number | null;

  private http = inject(HttpClient);
  private companyApi = inject(CompanyApiService, { optional: true });
  public activeCompanyService = inject(ActiveCompanyService);
  private moduleRegistry = inject(ModuleRegistryService);
  private toastService = inject(ToastService);
  private auth = inject(AuthService);
  private confirmDialog = inject(ConfirmDialogService);
  private router = inject(Router, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private destroyRef = inject(DestroyRef);

  public isSuperuser = this.auth.isSuperuser;

  get isWarehouseInstalled(): boolean {
    return this.moduleRegistry.getExtensions('companies').some(e => e.extension.hasWarehouseModuleToggle);
  }

  // وضعیت‌های داده‌ای
  public config = signal<GDriveConfigResponse | null>(null);
  public queueItems = signal<GDriveQueueItem[]>([]);
  public totalQueueCount = signal<number>(0);

  // وضعیت‌های بارگذاری و اتصال
  public isLoading = signal<boolean>(true);
  public isQueueLoading = signal<boolean>(false);
  public isOffline = signal<boolean>(false);
  public loadError = signal<string | null>(null);
  public isConnecting = signal<boolean>(false);
  public isSyncing = signal<boolean>(false);
  public isTriggeringSync = signal<boolean>(false);
  public isSavingField = signal<string | null>(null);

  // فیلترها و صفحه‌بندی
  public activeStatusFilter = signal<string>('all');
  public selectedCompanyId = signal<number | null>(null);
  public currentPage = signal<number>(1);
  public readonly pageSize = 20;

  // تسک‌های بازشده در آکاردئون خطا و جزئیات
  public expandedTaskIds = signal<Set<number>>(new Set());

  public totalPages = computed(() => {
    const count = this.totalQueueCount();
    return Math.max(1, Math.ceil(count / this.pageSize));
  });

  private messageListener: ((event: MessageEvent) => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private windowFocusListener: (() => void) | null = null;
  private visibilityListener: (() => void) | null = null;
  private pollTimer: any = null;
  private sub: Subscription | null = null;
  private initialLoadDone = false;
  private lastOAuthEventAt = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cleanupListeners();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && this.companyId && this.companyId !== this.selectedCompanyId()) {
      this.selectedCompanyId.set(this.companyId);
      if (this.initialLoadDone) {
        this.loadAll();
      }
    }
  }

  ngOnInit(): void {
    this.setupOAuthListeners();
    this.setupWindowListeners();
    this.checkOAuthReturnParams();

    if (this.companyId) {
      this.selectedCompanyId.set(this.companyId);
      this.initialLoadDone = true;
      this.loadAll();
      return;
    }

    if (!this.activeCompanyService.availableCompanies || this.activeCompanyService.availableCompanies.length === 0) {
      if (typeof this.activeCompanyService.loadAvailableCompanies === 'function') {
        this.activeCompanyService.loadAvailableCompanies().subscribe();
      }
    }

    this.sub = this.activeCompanyService.activeCompany$.subscribe((active) => {
      if (active && (!this.selectedCompanyId() || this.selectedCompanyId() !== active.id)) {
        this.selectedCompanyId.set(active.id);
        this.loadAll();
      }
    });

    const active = this.activeCompanyService.activeCompanySignal();
    if (active && !this.selectedCompanyId()) {
      this.selectedCompanyId.set(active.id);
      this.initialLoadDone = true;
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
  }

  private cleanupListeners(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.windowFocusListener) {
      window.removeEventListener('focus', this.windowFocusListener);
      this.windowFocusListener = null;
    }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.sub) {
      this.sub.unsubscribe();
      this.sub = null;
    }
  }

  /**
   * گوش دادن امن به رویداد بازگشت از OAuth (GD-22)
   */
  private setupOAuthListeners(): void {
    this.messageListener = (event: MessageEvent) => {
      // فقط پیام صفحهٔ callback همین مبدأ پذیرفته می‌شود
      if (event.origin !== window.location.origin) return;
      this.handleOAuthEvent(event.data);
    };
    window.addEventListener('message', this.messageListener);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('gdrive-oauth');
        this.broadcastChannel.onmessage = (event) => this.handleOAuthEvent(event.data);
      } catch {
        this.broadcastChannel = null;
      }
    }
  }

  private handleOAuthEvent(data: any): void {
    if (!data || data.type !== 'gdrive_oauth_callback' || data.target !== 'company') return;
    if (Number(data.companyId) !== this.selectedCompanyId()) return;
    // پنجرهٔ بازشو هم postMessage و هم BroadcastChannel می‌فرستد؛ یک بار پردازش شود
    const now = Date.now();
    if (now - this.lastOAuthEventAt < 3000) return;
    this.lastOAuthEventAt = now;
    if (data.status === 'connected') {
      this.toastService.success('اتصال به حساب گوگل‌درایو با موفقیت برقرار شد.');
    } else {
      this.toastService.error('اتصال به حساب گوگل‌درایو با خطا مواجه شد.');
    }
    this.loadAll();
  }

  /**
   * گوش دادن به فوکوس و تغییر تب مرورگر جهت رفرش وضعیت (GD-22)
   */
  private setupWindowListeners(): void {
    this.windowFocusListener = () => {
      this.refreshSilently();
    };
    window.addEventListener('focus', this.windowFocusListener);

    this.visibilityListener = () => {
      if (!document.hidden) {
        this.refreshSilently();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
  }

  /**
   * بررسی پارامتر بازگشت از حالت Redirect در آدرس (GD-22)
   */
  private checkOAuthReturnParams(): void {
    let gdriveStatus: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      gdriveStatus = params.get('gdrive');
    } catch {
      gdriveStatus = null;
    }

    if (!gdriveStatus && this.route) {
      this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((map) => {
        const val = map.get('gdrive');
        if (val) {
          this.handleOAuthReturnStatus(val);
        }
      });
      return;
    }

    if (gdriveStatus) {
      this.handleOAuthReturnStatus(gdriveStatus);
    }
  }

  private handleOAuthReturnStatus(status: string): void {
    if (status === 'connected') {
      this.toastService.success('اتصال به حساب گوگل‌درایو با موفقیت برقرار شد.');
      this.clearGdriveQueryParam();
      this.loadAll();
    } else if (status === 'error') {
      this.toastService.error('اتصال به حساب گوگل‌درایو با خطا مواجه شد.');
      this.clearGdriveQueryParam();
      this.loadAll();
    }
  }

  private clearGdriveQueryParam(): void {
    if (this.router) {
      this.router.navigate([], {
        relativeTo: this.route || undefined,
        queryParams: { gdrive: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } else {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('gdrive');
        window.history.replaceState({}, document.title, url.toString());
      } catch {}
    }
  }

  public onCompanyChange(companyId: any): void {
    const numId = Number(companyId);
    if (!isNaN(numId) && numId > 0) {
      this.selectedCompanyId.set(numId);
      this.currentPage.set(1);
      this.loadAll();
    }
  }

  /**
   * بارگذاری کامل مشخصات و صف
   */
  public loadAll(silent: boolean = false): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    if (!silent) {
      this.isLoading.set(true);
      this.loadError.set(null);
      this.isOffline.set(false);
    }

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/');
    if (!url) {
      this.isLoading.set(false);
      this.loadError.set('خطا در دریافت وضعیت گوگل‌درایو شرکت');
      if (!silent) {
        this.toastService.error('خطا در دریافت وضعیت گوگل‌درایو شرکت');
      }
      return;
    }

    this.http.get<GDriveConfigResponse>(url).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.isLoading.set(false);
        this.isOffline.set(false);
        this.loadError.set(null);
        this.loadQueue(this.activeStatusFilter(), silent);
        this.managePolling();
      },
      error: (err) => {
        this.isLoading.set(false);
        const st = err?.status ?? 0;
        if (isServerUnreachable(st)) {
          this.isOffline.set(true);
          this.loadError.set('ارتباط با سرور برقرار نشد. لطفاً وضعیت شبکه خود را بررسی کنید.');
        } else {
          this.loadError.set(err.error?.error || 'خطا در دریافت وضعیت گوگل‌درایو شرکت');
          this.toastService.error('خطا در دریافت وضعیت گوگل‌درایو شرکت');
        }
      }
    });
  }

  private refreshSilently(): void {
    if (document.hidden) return;
    const cid = this.selectedCompanyId();
    if (!cid) return;

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/');
    if (!url) return;

    // takeUntilDestroyed: پاسخ دیررسیده پس از خروج از تب، polling تازه‌ای راه نیندازد
    this.http.get<GDriveConfigResponse>(url).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loadQueue(this.activeStatusFilter(), true);
        this.managePolling();
      },
      error: () => {}
    });
  }

  /**
   * مدیریت Polling هوشمند صف (GD-23)
   */
  private managePolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const cfg = this.config();
    const stats = cfg?.stats;
    const hasActiveTasks = stats && (stats.pending > 0 || stats.processing > 0);

    if (hasActiveTasks) {
      this.pollTimer = setInterval(() => {
        if (document.hidden) return;
        this.refreshSilently();
      }, 10000);
    }
  }

  /**
   * بارگذاری صف تسک‌ها با فیلتر و صفحه‌بندی (GD-19, GD-23)
   */
  public loadQueue(filterStatus: string = this.activeStatusFilter(), silent: boolean = false): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.activeStatusFilter.set(filterStatus);
    if (!silent) {
      this.isQueueLoading.set(true);
    }

    const page = this.currentPage();
    const offset = (page - 1) * this.pageSize;
    let subPath = `/queue/?limit=${this.pageSize}&offset=${offset}`;
    if (filterStatus !== 'all') {
      subPath += `&status=${filterStatus}`;
    }

    const url = this.companyApi?.getCompanyGdriveUrl(cid, subPath);
    if (!url) {
      this.isQueueLoading.set(false);
      if (!silent) {
        this.toastService.error('خطا در دریافت لیست صف گوگل‌درایو');
      }
      return;
    }

    this.http.get<{ results: GDriveQueueItem[]; count: number }>(url).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.queueItems.set(res.results || []);
        this.totalQueueCount.set(res.count ?? (res.results ? res.results.length : 0));
        this.isQueueLoading.set(false);
      },
      error: (err) => {
        this.isQueueLoading.set(false);
        if (!silent) {
          this.toastService.error(err?.error?.error || 'خطا در دریافت لیست صف گوگل‌درایو');
        }
      }
    });
  }

  public setFilter(status: string): void {
    this.currentPage.set(1);
    this.loadQueue(status);
  }

  public goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadQueue(this.activeStatusFilter());
  }

  public toggleTaskExpand(taskId: number): void {
    const set = new Set(this.expandedTaskIds());
    if (set.has(taskId)) {
      set.delete(taskId);
    } else {
      set.add(taskId);
    }
    this.expandedTaskIds.set(set);
  }

  public isTaskExpanded(taskId: number): boolean {
    return this.expandedTaskIds().has(taskId);
  }

  public getModelNamePersian(modelName: string, action?: string): string {
    if (action === 'scan_all') return 'پیمایش سوابق';
    return MODEL_NAME_PERSIAN_MAP[modelName] || modelName || 'سند ناشناخته';
  }

  /**
   * ذخیره امن تنظیمات با ساخت آبجکت ایزوله و رول‌بک در صورت خطا (GD-24, GD-25)
   */
  public updateConfigField(field: keyof GDriveConfigResponse | string, value: any): void {
    const current = this.config();
    const cid = this.selectedCompanyId();
    if (!current || !cid) return;

    // اعتبارسنجی سقف مکث بین فایل‌ها (۰ تا ۳۰۰ ثانیه)
    if (field === 'chunk_delay_seconds') {
      const num = Number(value);
      if (isNaN(num) || num < 0 || num > 300) {
        this.toastService.error('مکث بین فایل‌ها باید عددی بین ۰ تا ۳۰۰ ثانیه باشد.');
        return;
      }
    }

    // اعتبارسنجی تفاوت ساعت شروع و پایان
    if (field === 'scheduled_start_time' || field === 'scheduled_end_time') {
      const startTime = field === 'scheduled_start_time' ? String(value).trim() : current.scheduled_start_time;
      const endTime = field === 'scheduled_end_time' ? String(value).trim() : current.scheduled_end_time;
      if (startTime && endTime && startTime === endTime) {
        this.toastService.error('ساعت شروع و پایان ارسال ساعات خلوتی نمی‌تواند یکسان باشد.');
        return;
      }
    }

    const previousValue = (current as any)[field];
    const updated = { ...current, [field]: value };
    this.config.set(updated);
    this.isSavingField.set(field as string);

    const payload: Record<string, any> = { [field]: value };

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/');
    if (!url) {
      this.isSavingField.set(null);
      const rolledBack = { ...this.config()!, [field]: previousValue };
      this.config.set(rolledBack);
      this.toastService.error('خطا در ذخیره تنظیمات: خطای سرور');
      return;
    }

    this.http.patch(url, payload).subscribe({
      next: () => {
        this.isSavingField.set(null);
        this.toastService.success('تنظیمات با موفقیت ذخیره شد.');
      },
      error: (err) => {
        this.isSavingField.set(null);
        // رول‌بک مقدار به وضعیت پیشین
        const rolledBack = { ...this.config()!, [field]: previousValue };
        this.config.set(rolledBack);
        this.toastService.error('خطا در ذخیره تنظیمات: ' + (err.error?.error || 'خطای سرور'));
      }
    });
  }

  public setSyncMode(mode: 'immediate' | 'scheduled' | 'manual'): void {
    this.updateConfigField('sync_mode', mode);
  }

  public toggleIsEnabled(): void {
    const current = this.config();
    if (!current) return;
    this.updateConfigField('is_enabled', !current.is_enabled);
  }

  /**
   * اتصال دوگانه Popup و Redirect بر اساس دسترسی و مسدود بودن پاپ‌آپ (GD-22)
   */
  public connectGoogleDrive(): void {
    if (isNativePlatform()) {
      this.toastService.info('اتصال گوگل‌درایو را از نسخه وب انجام دهید.');
      return;
    }

    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.isConnecting.set(true);

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    let popup: Window | null = null;
    try {
      popup = openExternal('about:blank', 'GoogleDriveAuth', `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`);
    } catch {
      popup = null;
    }

    const isPopupBlocked = !popup || popup.closed || typeof popup.closed === 'undefined';
    const mode = isPopupBlocked ? 'redirect' : 'popup';

    const url = this.companyApi?.getCompanyGdriveUrl(cid, `/auth-url/?mode=${mode}&_t=${Date.now()}`);
    if (!url) {
      this.isConnecting.set(false);
      if (popup && !popup.closed) popup.close();
      this.toastService.error('خطا در دریافت لینک اتصال به گوگل');
      return;
    }

    this.http.get<{ auth_url: string }>(url).subscribe({
      next: (res) => {
        this.isConnecting.set(false);
        if (res.auth_url) {
          if (mode === 'popup' && popup && !popup.closed) {
            popup.location.href = res.auth_url;
          } else {
            window.location.href = res.auth_url;
          }
        } else {
          if (popup && !popup.closed) popup.close();
          this.toastService.error('لینک اتصال از سرور دریافت نشد.');
        }
      },
      error: (err) => {
        this.isConnecting.set(false);
        if (popup && !popup.closed) popup.close();
        this.toastService.error(err.error?.error || 'خطا در دریافت لینک اتصال به گوگل');
      }
    });
  }

  /**
   * قطع اتصال حساب با ConfirmDialogService و تشریح وضعیت صف (GD-27)
   */
  public async disconnectGoogleDrive(): Promise<void> {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    const confirmed = await this.confirmDialog.open({
      title: 'قطع اتصال حساب گوگل‌درایو',
      message: 'آیا از قطع ارتباط این شرکت با گوگل‌درایو اطمینان دارید؟\nدر صورت قطع ارتباط، فایل‌های معلق در صف ارسال موقتاً متوقف شده و تا زمان اتصال حساب بعدی ذخیره خواهند ماند.',
      type: 'danger',
      confirmText: 'قطع اتصال',
      cancelText: 'انصراف'
    });

    if (!confirmed) return;

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/disconnect/');
    if (!url) {
      this.toastService.error('خطا در قطع ارتباط گوگل‌درایو');
      return;
    }

    this.http.post(url, {}).subscribe({
      next: () => {
        this.toastService.info('اتصال به گوگل‌درایو با موفقیت قطع شد.');
        this.loadAll();
      },
      error: (err) => {
        this.toastService.error(err.error?.error || 'خطا در قطع ارتباط گوگل‌درایو');
      }
    });
  }

  /**
   * تلاش مجدد برای ارسال یک تسک دارای خطا (GD-09)
   */
  public retryTask(taskId: number): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    const url = this.companyApi?.getCompanyGdriveUrl(cid, `/tasks/${taskId}/retry/`);
    if (!url) {
      this.toastService.error('خطا در تلاش مجدد تسک');
      return;
    }

    this.http.post(url, {}).subscribe({
      next: () => {
        this.toastService.success('تسک با اولویت بالا در صف ارسال مجدد قرار گرفت.');
        this.loadAll(true);
      },
      error: (err) => {
        this.toastService.error(err.error?.error || 'خطا در تلاش مجدد تسک');
      }
    });
  }

  /**
   * پیمایش و همگام‌سازی فایل‌های قبلی (GD-10)
   */
  public syncAllFiles(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/sync-all/');
    if (!url) {
      this.toastService.error('خطا در پیمایش فایل‌ها');
      return;
    }

    this.isSyncing.set(true);
    this.http.post<{ message: string; enqueued_count: number }>(url, {}).subscribe({
      next: (res) => {
        this.isSyncing.set(false);
        this.toastService.success(res.message || 'فایل‌های واجد شرایط در صف همگام‌سازی ثبت شدند.');
        this.loadAll();
      },
      error: (err) => {
        this.isSyncing.set(false);
        this.toastService.error(err.error?.error || 'خطا در پیمایش فایل‌ها');
      }
    });
  }

  /**
   * ارسال سریع دستی صف فایل‌های معلق (GD-07)
   */
  public triggerManualSync(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    const url = this.companyApi?.getCompanyGdriveUrl(cid, '/trigger-sync/');
    if (!url) {
      this.toastService.error('خطا در شروع ارسال دستی صف');
      return;
    }

    this.isTriggeringSync.set(true);
    this.http.post<{ success: boolean; message: string; pending_count: number }>(
      url,
      {}
    ).subscribe({
      next: (res) => {
        this.isTriggeringSync.set(false);
        this.toastService.success(res.message || 'درخواست ارسال دستی صف ثبت شد.');
        this.loadAll(true);
      },
      error: (err) => {
        this.isTriggeringSync.set(false);
        this.toastService.error(err.error?.error || 'خطا در شروع ارسال دستی صف');
      }
    });
  }
}

export { CompanyGdriveTabComponent as SettingsGdriveTabComponent };
