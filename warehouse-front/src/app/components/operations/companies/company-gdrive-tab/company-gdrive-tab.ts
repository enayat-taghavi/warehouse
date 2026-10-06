import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ToastService } from '../../../../services/toast.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';

export interface GDriveConfigResponse {
  company_id: number;
  company_name: string;
  is_enabled: boolean;
  is_connected: boolean;
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
  target_filename: string;
  target_folder_path: string;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  error_message: string | null;
  gdrive_file_id: string | null;
  created_at: string;
  completed_at: string | null;
}

@Component({
  selector: 'app-company-gdrive-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './company-gdrive-tab.html'
})
export class CompanyGdriveTabComponent implements OnInit, OnDestroy, OnChanges {
  @Input() companyId?: number | null;
  private http = inject(HttpClient);
  public activeCompanyService = inject(ActiveCompanyService);
  private toastService = inject(ToastService);
  private auth = inject(AuthService);
  public isSuperuser = this.auth.isSuperuser;

  public config = signal<GDriveConfigResponse | null>(null);
  public queueItems = signal<GDriveQueueItem[]>([]);
  public isLoading = signal<boolean>(false);
  public isSyncing = signal<boolean>(false);
  public isTriggeringSync = signal<boolean>(false);
  public activeStatusFilter = signal<string>('all');
  public selectedCompanyId = signal<number | null>(null);

  private messageListener: any = null;
  private sub: Subscription | null = null;

  constructor() {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && this.companyId) {
      this.selectedCompanyId.set(this.companyId);
      this.loadAll();
    }
  }

  ngOnInit(): void {
    this.setupOAuthListener();

    if (this.companyId) {
      this.selectedCompanyId.set(this.companyId);
      this.loadAll();
      return;
    }

    // اطمینان از بارگذاری لیست شرکت‌های مجاز در صورت دسترسی مستقیم به تب تنظیمات
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
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  private setupOAuthListener(): void {
    this.messageListener = (event: MessageEvent) => {
      if (event.data && event.data.type === 'GDRIVE_OAUTH_SUCCESS') {
        this.toastService.success('اتصال به حساب گوگل‌درایو با موفقیت برقرار شد.');
        this.loadAll();
      }
    };
    window.addEventListener('message', this.messageListener);
  }

  public onCompanyChange(companyId: any): void {
    const numId = Number(companyId);
    if (!isNaN(numId) && numId > 0) {
      this.selectedCompanyId.set(numId);
      this.loadAll();
    }
  }

  public loadAll(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.isLoading.set(true);
    this.http.get<GDriveConfigResponse>(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/`).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loadQueue();
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.toastService.error('خطا در دریافت وضعیت گوگل‌درایو شرکت');
      }
    });
  }

  public loadQueue(filterStatus: string = this.activeStatusFilter()): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.activeStatusFilter.set(filterStatus);
    let url = `${environment.apiUrl}/personnel/companies/${cid}/gdrive/queue/?limit=50`;
    if (filterStatus !== 'all') {
      url += `&status=${filterStatus}`;
    }

    this.http.get<{ results: GDriveQueueItem[]; count: number }>(url).subscribe({
      next: (res) => {
        this.queueItems.set(res.results || []);
      },
      error: () => {}
    });
  }

  public updateToggles(): void {
    const cfg = this.config();
    const cid = this.selectedCompanyId();
    if (!cfg || !cid) return;

    const payload = {
      is_enabled: cfg.is_enabled,
      sync_accounting_docs: cfg.sync_accounting_docs,
      sync_personnel_docs: cfg.sync_personnel_docs,
      sync_fleet_docs: cfg.sync_fleet_docs,
      sync_inventory_photos: cfg.sync_inventory_photos,
      sync_backups: cfg.sync_backups,
      sync_mode: cfg.sync_mode,
      scheduled_start_time: cfg.scheduled_start_time,
      scheduled_end_time: cfg.scheduled_end_time,
      chunk_delay_seconds: cfg.chunk_delay_seconds
    };

    this.http.patch(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/`, payload).subscribe({
      next: () => {
        this.toastService.success('تنظیمات با موفقیت ذخیره شد.');
      },
      error: (err) => {
        this.toastService.error('خطا در ذخیره تنظیمات: ' + (err.error?.error || 'خطای سرور'));
      }
    });
  }

  public setSyncMode(mode: 'immediate' | 'scheduled' | 'manual'): void {
    const cfg = this.config();
    if (!cfg) return;
    cfg.sync_mode = mode;
    this.updateToggles();
  }

  public connectGoogleDrive(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.http.get<{ auth_url: string }>(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/auth-url/?_t=${Date.now()}`).subscribe({
      next: (res) => {
        if (res.auth_url) {
          const width = 600;
          const height = 700;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          window.open(
            res.auth_url,
            'GoogleDriveAuth',
            `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`
          );
        }
      },
      error: (err) => {
        this.toastService.error('خطا در دریافت لینک اتصال به گوگل: ' + (err.error?.error || 'خطای شبکه'));
      }
    });
  }

  public disconnectGoogleDrive(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    if (!confirm('آیا از قطع ارتباط این شرکت با گوگل‌درایو اطمینان دارید؟')) {
      return;
    }

    this.http.post(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/disconnect/`, {}).subscribe({
      next: () => {
        this.toastService.info('اتصال به گوگل‌درایو قطع شد.');
        this.loadAll();
      },
      error: (err) => {
        this.toastService.error('خطا در قطع ارتباط گوگل‌درایو');
      }
    });
  }

  public retryTask(taskId: number): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.http.post(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/tasks/${taskId}/retry/`, {}).subscribe({
      next: () => {
        this.toastService.success('تسک مجدداً در صف پردازش قرار گرفت.');
        this.loadAll();
      },
      error: (err) => {
        this.toastService.error('خطا در تلاش مجدد تسک');
      }
    });
  }

  public syncAllFiles(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.isSyncing.set(true);
    this.http.post<{ message: string; enqueued_count: number }>(`${environment.apiUrl}/personnel/companies/${cid}/gdrive/sync-all/`, {}).subscribe({
      next: (res) => {
        this.isSyncing.set(false);
        this.toastService.success(res.message || 'فایل‌ها به صف همگام‌سازی اضافه شدند.');
        this.loadAll();
      },
      error: (err) => {
        this.isSyncing.set(false);
        this.toastService.error(err.error?.error || 'خطا در همگام‌سازی فایل‌ها');
      }
    });
  }

  public triggerManualSync(): void {
    const cid = this.selectedCompanyId();
    if (!cid) return;

    this.isTriggeringSync.set(true);
    this.http.post<{ success: boolean; message: string; pending_count: number }>(
      `${environment.apiUrl}/personnel/companies/${cid}/gdrive/trigger-sync/`,
      {}
    ).subscribe({
      next: (res) => {
        this.isTriggeringSync.set(false);
        this.toastService.success(res.message || 'عملیات ارسال صف در پس‌زمینه آغاز شد.');
        this.loadAll();
      },
      error: (err) => {
        this.isTriggeringSync.set(false);
        this.toastService.error(err.error?.error || 'خطا در شروع ارسال دستی صف');
      }
    });
  }
}

export { CompanyGdriveTabComponent as SettingsGdriveTabComponent };
