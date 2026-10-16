import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { SettingsService } from '../../../../../../core/services/settings';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { finalize } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { offlineDb, downloadLocalDatabaseSnapshotFile } from '../../../../../../core/services/offline-db';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-settings-backup-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, PersianDatePipe, ActionButtonComponent],
  templateUrl: './settings-backup-tab.html'
})
export class SettingsBackupTabComponent implements OnInit, OnDestroy {
  @ViewChild('confirmTextInput') confirmTextInput?: ElementRef<HTMLInputElement>;
  @ViewChild('confirmDialogContainer') confirmDialogContainer?: ElementRef<HTMLElement>;

  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private router = inject(Router, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private companyApi = inject(CompanyApiService, { optional: true });

  // ─── اسنپ‌شات‌های سرور و بازگشت سریع ───
  snapshots: any[] = [];
  snapshotSummary: any = null;
  isLoadingSnapshots = false;
  isCreatingSnapshot = false;
  isRollingBack = false;
  selectedRollbackSnapshot: any = null;
  showRollbackConfirm = false;
  rollbackConfirmInput = '';
  isExportingLocalDb = false;

  // ─── درایو سراسری سامانه (فاز ۲ - D1) ───
  systemGDrive: any = null;
  isLoadingGDrive = false;
  isConnectingGDrive = false;
  isDisconnectingGDrive = false;
  gdriveTasks: any[] = [];
  private gdriveBroadcast?: BroadcastChannel;
  private messageListener?: (event: MessageEvent) => void;
  private routeSub?: Subscription;

  backupPassword = '';
  backupShowPassword = false;
  isBackupLoading = false;

  restorePassword = '';
  restoreShowPassword = false;
  restoreFile: File | null = null;
  restoreFileName = '';
  restoreConfirmInput = '';
  isRestoreLoading = false;
  showRestoreConfirm = false;
  restoreStatusMessage = '';
  restoreProgressPercent = 0;
  private restoreTimer: any = null;

  private previousActiveElement: HTMLElement | null = null;

  canManageBackup() {
    return this.auth.hasPermission('CanManageBackup');
  }

  canRestoreDatabase() {
    return this.auth.hasPermission('CanRestoreDatabase');
  }

  isSuperuser() {
    return this.auth.isSuperuser();
  }

  constructor(
    private settingsService: SettingsService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private auth: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    if (this.canManageBackup() || this.canRestoreDatabase()) {
      this.loadSnapshots();
    }
    if (this.isSuperuser()) {
      this.loadSystemGDrive();
      this.initGDriveListeners();
      this.checkUrlCallbackParams();
    }
  }

  ngOnDestroy() {
    this.stopRestoreProgress();
    if (this.routeSub) {
      this.routeSub.unsubscribe();
      this.routeSub = undefined;
    }
    if (this.gdriveBroadcast) {
      try { this.gdriveBroadcast.close(); } catch {}
    }
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
  }

  startRestoreProgress() {
    this.stopRestoreProgress();
    this.restoreProgressPercent = 8;
    this.restoreStatusMessage = 'در حال ارسال فایل پشتیبان به سرور...';
    let elapsedSeconds = 0;

    this.restoreTimer = setInterval(() => {
      elapsedSeconds += 1;
      if (elapsedSeconds < 4) {
        this.restoreProgressPercent = Math.min(25, this.restoreProgressPercent + 5);
        this.restoreStatusMessage = 'در حال ارسال فایل پشتیبان به سرور...';
      } else if (elapsedSeconds < 8) {
        this.restoreProgressPercent = Math.min(45, this.restoreProgressPercent + 4);
        this.restoreStatusMessage = 'در حال اعتبارسنجی و رمزگشایی فایل پشتیبان...';
      } else if (elapsedSeconds < 14) {
        this.restoreProgressPercent = Math.min(65, this.restoreProgressPercent + 3);
        this.restoreStatusMessage = 'در حال ایجاد نسخه پشتیبان اضطراری و آماده‌سازی پایگاه داده...';
      } else if (elapsedSeconds < 40) {
        this.restoreProgressPercent = Math.min(88, this.restoreProgressPercent + 1);
        this.restoreStatusMessage = 'در حال بازنشانی ساختار، جداول و داده‌ها (pg_restore)... لطفاً پنجره را نبندید.';
      } else {
        this.restoreProgressPercent = Math.min(95, this.restoreProgressPercent + 0.5);
        this.restoreStatusMessage = 'در حال اتمام فرآیند بازگردانی و بازنشانی شاخص‌ها...';
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  stopRestoreProgress() {
    if (this.restoreTimer) {
      clearInterval(this.restoreTimer);
      this.restoreTimer = null;
    }
  }

  loadSnapshots() {
    this.isLoadingSnapshots = true;
    this.cdr.detectChanges();
    this.settingsService.getSnapshots()
      .pipe(finalize(() => {
        this.isLoadingSnapshots = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (res) => {
          this.snapshots = res.snapshots || [];
          this.snapshotSummary = res.summary || null;
        },
        error: (err) => {
          console.warn('Could not load snapshots:', err);
        }
      });
  }

  createManualSnapshot() {
    this.isCreatingSnapshot = true;
    this.cdr.detectChanges();
    this.settingsService.createSnapshot('اسنپ‌شات دستی سرور')
      .pipe(finalize(() => {
        this.isCreatingSnapshot = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (res) => {
          this.toast.show('success', res.message || 'اسنپ‌شات جدید با موفقیت ثبت شد.');
          this.loadSnapshots();
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || 'خطا در ثبت اسنپ‌شات سرور.');
        }
      });
  }

  async openRollbackConfirm(snapshot: any) {
    const q = await offlineDb.syncQueue.toArray();
    if (q.length > 0) {
      this.toast.show('error', `صف آفلاین شامل ${q.length} رکورد همگام‌نشده است. جهت جلوگیری از نابودی داده‌ها، ابتدا باید آنها را به سرور ارسال کنید.`);
      return;
    }

    this.selectedRollbackSnapshot = snapshot;
    this.rollbackConfirmInput = '';
    this.showRollbackConfirm = true;
    this.cdr.detectChanges();
  }

  cancelRollback() {
    if (this.isRollingBack) return;
    this.showRollbackConfirm = false;
    this.selectedRollbackSnapshot = null;
    this.rollbackConfirmInput = '';
    this.cdr.detectChanges();
  }

  confirmRollback() {
    if (this.rollbackConfirmInput.trim() !== 'ROLLBACK_CONFIRM') {
      this.toast.show('error', 'جهت تایید، عبارت ROLLBACK_CONFIRM را به درستی وارد کنید.');
      return;
    }
    if (!this.selectedRollbackSnapshot) return;

    this.isRollingBack = true;
    this.cdr.detectChanges();

    this.settingsService.rollbackSnapshot(this.selectedRollbackSnapshot.filename, this.rollbackConfirmInput.trim())
      .pipe(finalize(() => {
        this.isRollingBack = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: async (res) => {
          this.toast.show('success', res.message || 'دیتابیس با موفقیت به اسنپ‌شات بازگردانی شد.');
          this.showRollbackConfirm = false;
          this.selectedRollbackSnapshot = null;
          this.rollbackConfirmInput = '';

          await offlineDb.clearServerDerivedCaches();
          setTimeout(() => {
            this.auth.logout();
          }, 1500);
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || 'خطا در بازگردانی اسنپ‌شات.');
          this.showRollbackConfirm = false;
          this.selectedRollbackSnapshot = null;
        }
      });
  }

  async downloadLocalIndexedDb() {
    this.isExportingLocalDb = true;
    this.cdr.detectChanges();
    try {
      const res = await downloadLocalDatabaseSnapshotFile();
      this.toast.show('success', `نسخه پشتیبان تبلت (${res.totalRecords} رکورد) با موفقیت دانلود شد.`);
    } catch (err: any) {
      this.toast.show('error', 'خطا در تهیه نسخه پشتیبان پایگاه‌داده محلی مرورگر.');
    } finally {
      this.isExportingLocalDb = false;
      this.cdr.detectChanges();
    }
  }

  downloadBackup() {
    if (!this.backupPassword) {
      this.toast.show('error', 'لطفاً رمز عبور بک‌آپ را وارد کنید.');
      return;
    }
    if (this.backupPassword.trim().length < 12) {
      this.toast.show('error', 'رمز عبور پشتیبان باید حداقل ۱۲ کاراکتر باشد.');
      return;
    }
    this.isBackupLoading = true;
    this.cdr.detectChanges();

    this.settingsService.downloadBackup(this.backupPassword)
      .pipe(finalize(() => {
        this.isBackupLoading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (blob: Blob) => {
          const now = new Date();
          const pDate = new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          }).format(now).replace(/[/\s:]/g, '-');
          const fileName = `warehouse_backup_${pDate}.wbak`;

          // Firefox fix (Issue 5-5)
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);

          this.toast.show('success', 'نسخه پشتیبان با موفقیت ساخته و دانلود شد.');
          this.backupPassword = '';
        },
        error: (err: any) => {
          this.toast.show('error', err?.error?.error || 'خطا در دریافت نسخه پشتیبان.');
          this.backupPassword = '';
        }
      });
  }

  triggerFileInput() {
    document.getElementById('backupFileInput')?.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.restoreFile = file;
      this.restoreFileName = file.name;
    }
    event.target.value = null;
  }

  async openRestoreConfirm() {
    if (!this.restoreFile) {
      this.toast.show('error', 'لطفاً فایل پشتیبان را انتخاب کنید.');
      return;
    }
    if (!this.restorePassword) {
      this.toast.show('error', 'لطفاً رمز عبور فایل را وارد کنید.');
      return;
    }

    const q = await offlineDb.syncQueue.toArray();
    if (q.length > 0) {
      this.toast.show('error', `صف آفلاین شامل ${q.length} رکورد همگام‌نشده است. جهت جلوگیری از نابودی داده‌ها، ابتدا باید آنها را به سرور ارسال کنید.`);
      return;
    }

    // Save previous active element for restoring focus (Item 5-7)
    this.previousActiveElement = (document.activeElement as HTMLElement) || null;
    this.showRestoreConfirm = true;
    this.cdr.detectChanges();

    // Autofocus confirmation input (Item 5-7)
    setTimeout(() => {
      this.confirmTextInput?.nativeElement?.focus();
    }, 50);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent) {
    if (this.showRestoreConfirm) {
      if (this.isRestoreLoading) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelRestore();
        return;
      }

      if (event.key === 'Tab') {
        this.handleFocusTrap(event);
      }
    } else if (this.showRollbackConfirm) {
      if (this.isRollingBack) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelRollback();
        return;
      }
    }
  }

  private handleFocusTrap(event: KeyboardEvent) {
    if (!this.confirmDialogContainer?.nativeElement) return;
    const focusable = this.confirmDialogContainer.nativeElement.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  cancelRestore() {
    if (this.isRestoreLoading) {
      return;
    }
    this.showRestoreConfirm = false;
    this.restoreConfirmInput = '';
    this.cdr.detectChanges();

    // Restore focus to previous active element (Item 5-7)
    if (this.previousActiveElement) {
      setTimeout(() => {
        this.previousActiveElement?.focus();
        this.previousActiveElement = null;
      }, 50);
    }
  }

  onRestoreBackdropClick(event: MouseEvent) {
    if (this.isRestoreLoading) {
      event.stopPropagation();
      return;
    }
    this.cancelRestore();
  }

  onRollbackBackdropClick(event: MouseEvent) {
    if (this.isRollingBack) {
      event.stopPropagation();
      return;
    }
    this.cancelRollback();
  }

  restoreBackup() {
    if (this.restoreConfirmInput.trim() !== 'RESTORE_DATABASE_CONFIRM') {
      this.toast.show('error', 'متن تایید به درستی وارد نشده است.');
      return;
    }

    this.isRestoreLoading = true;
    this.startRestoreProgress();
    this.cdr.detectChanges();

    this.settingsService.restoreBackup(this.restoreFile!, this.restorePassword, this.restoreConfirmInput.trim())
      .pipe(finalize(() => {
        this.stopRestoreProgress();
        this.isRestoreLoading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: async (res: any) => {
          this.restoreProgressPercent = 100;
          this.restoreStatusMessage = 'بازیابی پایگاه‌داده با موفقیت انجام شد! در حال انتقال به صفحه ورود...';
          this.cdr.detectChanges();

          this.toast.show('success', 'بازیابی پایگاه‌داده با موفقیت انجام شد. سیستم در حال انتقال به صفحه ورود است...');

          await offlineDb.clearServerDerivedCaches();

          setTimeout(() => {
            this.showRestoreConfirm = false;
            this.restoreFile = null;
            this.restoreFileName = '';
            this.restorePassword = '';
            this.restoreConfirmInput = '';
            this.auth.logout();
          }, 1500);
        },
        error: (err: any) => {
          this.stopRestoreProgress();
          this.restoreProgressPercent = 0;
          this.restoreStatusMessage = '';
          const msg = err?.error?.error || 'خطا در بازیابی پایگاه‌داده.';
          this.toast.show('error', msg);
          if (err?.error?.rollback_state === 'failed') {
            this.toast.show('error', 'فایل نجات در سرور نگهداری شد. لطفا فورا با پشتیبانی تماس بگیرید.', 10000);
          }
          this.showRestoreConfirm = false;
          this.restorePassword = '';
          this.restoreConfirmInput = '';

          // Restore focus on error as well
          if (this.previousActiveElement) {
            setTimeout(() => {
              this.previousActiveElement?.focus();
              this.previousActiveElement = null;
            }, 50);
          }
        }
      });
  }

  // ─── توابع مدیریت درایو سراسری سامانه (فاز ۲) ───
  loadSystemGDrive() {
    this.isLoadingGDrive = true;
    this.settingsService.getSystemGDriveConfig()
      .pipe(finalize(() => { this.isLoadingGDrive = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.systemGDrive = res;
          if (res?.is_connected) {
            this.loadSystemGDriveTasks();
          }
        },
        error: (err) => {
          console.warn('Could not load system gdrive config:', err);
        }
      });
  }

  loadSystemGDriveTasks() {
    this.settingsService.getSystemGDriveTasks(10)
      .subscribe({
        next: (res) => {
          this.gdriveTasks = res.results || [];
          this.cdr.detectChanges();
        },
        error: () => {}
      });
  }

  connectSystemGDrive() {
    this.isConnectingGDrive = true;
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    let popup: Window | null = null;
    try {
      popup = window.open('about:blank', 'GoogleDriveSystemAuth', `width=${width},height=${height},top=${top},left=${left},status=no,toolbar=no,menubar=no`);
    } catch {
      popup = null;
    }

    const isPopupBlocked = !popup || popup.closed || typeof popup.closed === 'undefined';
    const mode = isPopupBlocked ? 'redirect' : 'popup';

    this.settingsService.getSystemGDriveAuthUrl(mode)
      .pipe(finalize(() => { this.isConnectingGDrive = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: (res) => {
          if (res?.auth_url) {
            if (mode === 'popup' && popup && !popup.closed) {
              popup.location.href = res.auth_url;
            } else {
              window.location.href = res.auth_url;
            }
          } else {
            if (popup && !popup.closed) popup.close();
            this.toast.show('error', 'خطا در دریافت لینک اتصال به گوگل‌درایو');
          }
        },
        error: (err) => {
          if (popup && !popup.closed) popup.close();
          this.toast.show('error', err?.error?.error || 'خطا در ایجاد لینک اتصال به گوگل‌درایو');
        }
      });
  }

  async disconnectSystemGDrive() {
    if (this.confirmDialog) {
      const confirmed = await this.confirmDialog.open({
        title: 'قطع اتصال حساب درایو سراسری سامانه',
        message: 'آیا از قطع ارتباط حساب درایو سراسری سامانه اطمینان دارید؟\nدر صورت قطع ارتباط، فایل‌های پشتیبان جدید تا زمان اتصال مجدد بر روی ابر ذخیره نخواهند شد.',
        type: 'danger',
        confirmText: 'قطع اتصال',
        cancelText: 'انصراف'
      });
      if (!confirmed) return;
    } else if (!confirm('آیا از قطع اتصال حساب درایو سراسری سامانه اطمینان دارید؟ پشتیبان‌های جدید دیتابیس تا اتصال مجدد بر روی ابر ذخیره نخواهند شد.')) {
      return;
    }

    this.isDisconnectingGDrive = true;
    this.settingsService.disconnectSystemGDrive()
      .pipe(finalize(() => { this.isDisconnectingGDrive = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: () => {
          this.toast.show('success', 'ارتباط درایو سراسری سامانه قطع گردید.');
          this.loadSystemGDrive();
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || 'خطا در قطع ارتباط');
        }
      });
  }

  toggleSystemGDriveEnabled() {
    if (!this.systemGDrive) return;
    const newVal = !this.systemGDrive.is_enabled;
    this.settingsService.patchSystemGDriveConfig({ is_enabled: newVal }).subscribe({
      next: () => {
        this.systemGDrive.is_enabled = newVal;
        this.toast.show('success', newVal ? 'ارسال ابری سامانه فعال گردید.' : 'ارسال ابری سامانه متوقف شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در تغییر وضعیت ارسال ابری');
      }
    });
  }

  toggleCompanyBackupSync(company: any) {
    const nextState = !company.sync_backups;
    const url = this.companyApi?.getCompanyGdriveUrl(company.company_id, '/');
    if (!url) {
      this.toast.show('error', 'خطا در تغییر تنظیمات شرکت');
      return;
    }
    this.http.patch(url, { sync_backups: nextState }).subscribe({
      next: () => {
        company.sync_backups = nextState;
        this.toast.show('success', `تنظیمات ارسال پشتیبان برای شرکت ${company.company_name} بروزرسانی شد.`);
        this.loadSystemGDrive();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در تغییر تنظیمات شرکت');
      }
    });
  }

  private lastGDriveEventAt = 0;

  private initGDriveListeners() {
    try {
      if (window.BroadcastChannel) {
        this.gdriveBroadcast = new BroadcastChannel('gdrive-oauth');
        this.gdriveBroadcast.onmessage = (e) => this.handleGDriveOAuthEvent(e.data);
      }
    } catch {}

    this.messageListener = (event: MessageEvent) => {
      // فقط پیام صفحهٔ callback همین مبدأ پذیرفته می‌شود
      if (event.origin !== window.location.origin) return;
      this.handleGDriveOAuthEvent(event.data);
    };
    window.addEventListener('message', this.messageListener);
  }

  private handleGDriveOAuthEvent(data: any) {
    // فقط رویداد درایو سامانه؛ اتصال درایو شرکت‌ها در تب دیگر به این کارت ربطی ندارد
    if (!data || data.type !== 'gdrive_oauth_callback' || data.target !== 'system') return;
    // پنجرهٔ بازشو هم postMessage و هم BroadcastChannel می‌فرستد؛ یک بار پردازش شود
    const now = Date.now();
    if (now - this.lastGDriveEventAt < 3000) return;
    this.lastGDriveEventAt = now;
    if (data.status === 'connected') {
      this.toast.show('success', 'اتصال درایو سامانه با موفقیت برقرار شد.');
      this.loadSystemGDrive();
    } else {
      this.toast.show('error', 'اتصال درایو سامانه با خطا مواجه شد.');
    }
  }

  private checkUrlCallbackParams() {
    let gdriveParam: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      gdriveParam = params.get('gdrive');
    } catch {
      gdriveParam = null;
    }

    if (!gdriveParam && this.route) {
      this.routeSub = this.route.queryParamMap.subscribe((map) => {
        const val = map.get('gdrive');
        if (val) {
          this.handleGDriveUrlParam(val);
        }
      });
      return;
    }

    if (gdriveParam) {
      this.handleGDriveUrlParam(gdriveParam);
    }
  }

  private handleGDriveUrlParam(gdriveParam: string) {
    if (gdriveParam === 'connected') {
      this.toast.show('success', 'اتصال درایو سامانه با موفقیت برقرار شد.');
      this.loadSystemGDrive();
    } else {
      this.toast.show('error', 'خطا در اتصال به درایو سامانه');
    }
    if (this.router) {
      this.router.navigate([], {
        queryParams: { gdrive: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } else {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }
}
