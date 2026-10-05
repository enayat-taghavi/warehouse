import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../../../services/settings';
import { ToastService } from '../../../../services/toast.service';
import { finalize } from 'rxjs/operators';
import { offlineDb, downloadLocalDatabaseSnapshotFile } from '../../../../core/services/offline-db';
import { AuthService } from '../../../../core/auth/auth.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-settings-backup-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective],
  templateUrl: './settings-backup-tab.html'
})
export class SettingsBackupTabComponent implements OnInit, OnDestroy {
  @ViewChild('confirmTextInput') confirmTextInput?: ElementRef<HTMLInputElement>;
  @ViewChild('confirmDialogContainer') confirmDialogContainer?: ElementRef<HTMLElement>;

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

  constructor(
    private settingsService: SettingsService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private auth: AuthService
  ) {}

  ngOnInit() {
    if (this.canManageBackup() || this.canRestoreDatabase()) {
      this.loadSnapshots();
    }
  }

  ngOnDestroy() {
    this.stopRestoreProgress();
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
}
