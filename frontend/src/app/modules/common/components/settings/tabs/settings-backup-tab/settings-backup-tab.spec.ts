// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runInInjectionContext, Injector, ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { offlineDb, warehouseOfflineDb, financeOfflineDb } from '../../../../../../core/services/offline-db';
import { SettingsBackupTabComponent } from './settings-backup-tab';
import { SettingsService } from '../../../../../../core/services/settings';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PhotoUploadQueueService } from '../../../../../../core/services/photo-upload-queue.service';

describe('SettingsBackupTabComponent (Real Backup & Restore Path)', () => {
  let component: SettingsBackupTabComponent;
  let settingsServiceMock: any;
  let toastServiceMock: any;
  let authServiceMock: any;
  let cdrMock: any;
  let clearCachesSpy: any;
  let financeClearCachesSpy: any;
  let photoQueueMock: any;

  beforeEach(() => {
    vi.useFakeTimers();
    clearCachesSpy = vi.spyOn(warehouseOfflineDb, 'clearServerDerivedCaches').mockResolvedValue(undefined as any);
    financeClearCachesSpy = vi.spyOn(financeOfflineDb, 'clearServerDerivedCaches').mockResolvedValue(undefined as any);
    vi.spyOn(offlineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);

    settingsServiceMock = {
      downloadBackup: vi.fn().mockReturnValue(of(new Blob(['test-dump']))),
      restoreBackup: vi.fn().mockReturnValue(of({ message: 'بازیابی موفق' })),
      rollbackSnapshot: vi.fn().mockReturnValue(of({ message: 'بازگردانی موفق' })),
    };

    photoQueueMock = {
      countPendingStrict: vi.fn().mockResolvedValue(0),
    };

    toastServiceMock = {
      show: vi.fn(),
    };

    authServiceMock = {
      hasPermission: vi.fn().mockReturnValue(true),
      logout: vi.fn(),
    };

    cdrMock = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn(),
    };

    const injector = Injector.create({
      providers: [
        { provide: SettingsService, useValue: settingsServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: ChangeDetectorRef, useValue: cdrMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: PhotoUploadQueueService, useValue: photoQueueMock },
      ],
    });

    runInInjectionContext(injector, () => {
      component = new SettingsBackupTabComponent(
        settingsServiceMock,
        toastServiceMock,
        cdrMock,
        authServiceMock,
        { patch: vi.fn().mockReturnValue(of({})) } as any
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should create component with default states', () => {
    expect(component).toBeTruthy();
    expect(component.backupPassword).toBe('');
    expect(component.isBackupLoading).toBe(false);
    expect(component.restoreFile).toBeNull();
    expect(component.showRestoreConfirm).toBe(false);
  });

  describe('Download Backup Flow', () => {
    it('should reject backup download when password is empty', () => {
      component.backupPassword = '';
      component.downloadBackup();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('رمز عبور'));
      expect(settingsServiceMock.downloadBackup).not.toHaveBeenCalled();
    });

    it('should reject backup download when password is less than 12 chars', () => {
      component.backupPassword = 'short';
      component.downloadBackup();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('۱۲ کاراکتر'));
      expect(settingsServiceMock.downloadBackup).not.toHaveBeenCalled();
    });

    it('should download backup when password is valid', () => {
      component.backupPassword = 'StrongPassword123!';
      component.downloadBackup();

      expect(settingsServiceMock.downloadBackup).toHaveBeenCalledWith('StrongPassword123!');
      expect(toastServiceMock.show).toHaveBeenCalledWith('success', expect.stringMatching('با موفقیت'));
      expect(component.backupPassword).toBe('');
    });
  });

  describe('Restore Backup Flow & Modal (Items 3-4, 5-7)', () => {
    it('should block restore modal if sync queue has pending offline items', async () => {
      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 1, action: 'save' }] as any);
      vi.spyOn(offlineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 1, action: 'save' }] as any);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';

      await component.openRestoreConfirm();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('صف آفلاین'));
      expect(component.showRestoreConfirm).toBe(false);
    });

    it('should block restore modal when only the finance queue has a record and warehouse queue is empty', async () => {
      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
      vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 2, action: 'pay' }] as any);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';

      await component.openRestoreConfirm();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('صف آفلاین'));
      expect(component.showRestoreConfirm).toBe(false);
    });

    it('should open restore confirm modal when queue is clear', async () => {
      vi.spyOn(offlineDb.syncQueue, 'toArray').mockResolvedValue([]);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';

      await component.openRestoreConfirm();

      expect(component.showRestoreConfirm).toBe(true);
    });

    it('should close restore confirm modal on cancelRestore or Escape key', () => {
      component.showRestoreConfirm = true;
      component.restoreConfirmInput = 'SOME_INPUT';

      component.onDocumentKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component.showRestoreConfirm).toBe(false);
      expect(component.restoreConfirmInput).toBe('');
    });

    it('should NOT close restore confirm modal on Escape key or backdrop click while isRestoreLoading is true', () => {
      component.showRestoreConfirm = true;
      component.isRestoreLoading = true;
      component.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';

      component.onDocumentKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.showRestoreConfirm).toBe(true);

      const fakeEvent = new MouseEvent('click');
      component.onRestoreBackdropClick(fakeEvent);
      expect(component.showRestoreConfirm).toBe(true);

      component.cancelRestore();
      expect(component.showRestoreConfirm).toBe(true);
    });

    it('should reject restore if confirmation text is not RESTORE_DATABASE_CONFIRM', async () => {
      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';
      component.restoreConfirmInput = 'INCORRECT_TEXT';

      await component.restoreBackup();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('متن تایید'));
      expect(settingsServiceMock.restoreBackup).not.toHaveBeenCalled();
    });

    it('should call clearServerDerivedCaches and auth.logout after successful restore (Item 3-4)', async () => {
      const mockFile = new File(['dump'], 'test.wbak');
      component.restoreFile = mockFile;
      component.restorePassword = 'secretPassword123';
      component.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';

      await component.restoreBackup();

      expect(settingsServiceMock.restoreBackup).toHaveBeenCalledWith(
        mockFile,
        'secretPassword123',
        'RESTORE_DATABASE_CONFIRM'
      );
      // Flush microtasks and advance timer to allow the 1500ms delay to complete
      await vi.advanceTimersByTimeAsync(2000);

      expect(clearCachesSpy).toHaveBeenCalled();
      expect(financeClearCachesSpy).toHaveBeenCalled();
      expect(authServiceMock.logout).toHaveBeenCalled();
    });

    it('should handle restore error and show structured rollback failure if present', async () => {
      const mockFile = new File(['dump'], 'test.wbak');
      component.restoreFile = mockFile;
      component.restorePassword = 'secretPassword123';
      component.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';

      settingsServiceMock.restoreBackup.mockReturnValue(
        throwError(() => ({
          error: {
            error: 'خطای بازگردانی',
            rollback_state: 'failed'
          }
        }))
      );

      await component.restoreBackup();

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', 'خطای بازگردانی');
      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('فایل نجات'), 10000);
      expect(component.showRestoreConfirm).toBe(false);
    });
  });

  describe('Server Rollback Flow & Offline Queue Gate', () => {
    it('should block rollback modal when only the finance queue has a record and warehouse queue is empty', async () => {
      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
      vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 10, action: 'payroll' }] as any);

      const fakeSnapshot = { filename: 'snap_1.dump' };
      await component.openRollbackConfirm(fakeSnapshot);

      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('صف آفلاین'));
      expect(component.showRollbackConfirm).toBe(false);
      expect(component.selectedRollbackSnapshot).toBeNull();
    });

    it('should open rollback modal when both offline queues are clear', async () => {
      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
      vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);

      const fakeSnapshot = { filename: 'snap_1.dump' };
      await component.openRollbackConfirm(fakeSnapshot);

      expect(component.showRollbackConfirm).toBe(true);
      expect(component.selectedRollbackSnapshot).toBe(fakeSnapshot);
    });
  });

  describe('Unsent data gate at confirm time, photos and read errors', () => {
    const queueRecord = [{ id: 7, action: 'save' }] as any;

    it('blocks the rollback at confirm time when a record was queued after the modal opened', async () => {
      await component.openRollbackConfirm({ filename: 'snap_2.dump' });
      expect(component.showRollbackConfirm).toBe(true);

      vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue(queueRecord);
      component.rollbackConfirmInput = 'ROLLBACK_CONFIRM';
      await component.confirmRollback();

      expect(settingsServiceMock.rollbackSnapshot).not.toHaveBeenCalled();
      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('صف آفلاین'));
      expect(component.isRollingBack).toBe(false);
    });

    it('blocks the restore at confirm time when a record was queued after the modal opened', async () => {
      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';
      await component.openRestoreConfirm();
      expect(component.showRestoreConfirm).toBe(true);

      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue(queueRecord);
      component.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';
      await component.restoreBackup();

      expect(settingsServiceMock.restoreBackup).not.toHaveBeenCalled();
      expect(component.isRestoreLoading).toBe(false);
    });

    it('a pending photo blocks both the rollback and the restore modal', async () => {
      photoQueueMock.countPendingStrict.mockResolvedValue(2);

      await component.openRollbackConfirm({ filename: 'snap_3.dump' });
      expect(component.showRollbackConfirm).toBe(false);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';
      await component.openRestoreConfirm();
      expect(component.showRestoreConfirm).toBe(false);
      expect(toastServiceMock.show).toHaveBeenCalledWith('error', expect.stringMatching('2 رکورد'));
    });

    it('cannot read the offline queues: both gates stay blocked and show a message', async () => {
      vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockRejectedValue(new Error('VersionError'));

      await component.openRollbackConfirm({ filename: 'snap_4.dump' });
      expect(component.showRollbackConfirm).toBe(false);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';
      await component.openRestoreConfirm();
      expect(component.showRestoreConfirm).toBe(false);
      expect(toastServiceMock.show).toHaveBeenCalledWith('error', 'امکان بررسی صف آفلاین وجود ندارد؛ بازگردانی متوقف شد.');
    });

    it('runs the rollback at confirm time when nothing is unsent and clears both scopes before logout', async () => {
      const snapshot = { filename: 'snap_5.dump' };
      await component.openRollbackConfirm(snapshot);
      component.rollbackConfirmInput = 'ROLLBACK_CONFIRM';
      await component.confirmRollback();

      expect(settingsServiceMock.rollbackSnapshot).toHaveBeenCalledWith('snap_5.dump', 'ROLLBACK_CONFIRM');
      await vi.advanceTimersByTimeAsync(2000);
      expect(clearCachesSpy).toHaveBeenCalled();
      expect(financeClearCachesSpy).toHaveBeenCalled();
      expect(authServiceMock.logout).toHaveBeenCalled();
    });

    it('logout still runs when clearing the caches fails after a successful rollback', async () => {
      financeClearCachesSpy.mockRejectedValue(new Error('QuotaExceeded'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await component.openRollbackConfirm({ filename: 'snap_6.dump' });
      component.rollbackConfirmInput = 'ROLLBACK_CONFIRM';
      await component.confirmRollback();

      await vi.advanceTimersByTimeAsync(2000);
      expect(authServiceMock.logout).toHaveBeenCalled();
    });

    it('a second confirm click while the confirm time gate runs sends no second request', async () => {
      await component.openRollbackConfirm({ filename: 'snap_7.dump' });
      component.rollbackConfirmInput = 'ROLLBACK_CONFIRM';
      await Promise.all([component.confirmRollback(), component.confirmRollback()]);
      expect(settingsServiceMock.rollbackSnapshot).toHaveBeenCalledTimes(1);

      component.restoreFile = new File(['dump'], 'test.wbak');
      component.restorePassword = 'secretPassword123';
      component.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';
      await Promise.all([component.restoreBackup(), component.restoreBackup()]);
      expect(settingsServiceMock.restoreBackup).toHaveBeenCalledTimes(1);
    });
  });
});
