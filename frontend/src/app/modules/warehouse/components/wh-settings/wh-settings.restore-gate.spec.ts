// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';

import { warehouseOfflineDb, financeOfflineDb } from '../../../../core/services/offline-db';
import { WhSettings } from './wh-settings';

/**
 * بازیابی پایگاه‌دادهٔ سرور از صفحهٔ تنظیمات انبار از همان گیت داده‌های ارسال‌نشده می‌گذرد
 * که تب پشتیبان‌گیری تنظیمات دارد (core/services/server-restore-gate.ts).
 */
describe('WhSettings server restore gate', () => {
  let cmp: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(warehouseOfflineDb, 'clearServerDerivedCaches').mockResolvedValue(undefined as any);
    vi.spyOn(financeOfflineDb, 'clearServerDerivedCaches').mockResolvedValue(undefined as any);

    // بدون سازندهٔ واقعی: فقط وابستگی‌هایی که executeRestore می‌خواند
    cmp = Object.create(WhSettings.prototype);
    cmp.toast = { show: vi.fn() };
    cmp.auth = { logout: vi.fn() };
    cmp.photoQueue = { countPendingStrict: vi.fn().mockResolvedValue(0) };
    cmp.backupApi = { restoreBackup: vi.fn().mockReturnValue(of({ message: 'ok' })) };
    cmp.selectedBackupForRestore = { filename: 'backup_1.dump' };
    cmp.restoreConfirmInput = 'RESTORE_DATABASE_CONFIRM';
    cmp.isRestoringDatabase = false;
    cmp.isRestoreModalOpen = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not restore while an offline sync record is unsent', async () => {
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 1 }] as any);
    await cmp.executeRestore();
    expect(cmp.backupApi.restoreBackup).not.toHaveBeenCalled();
    expect(cmp.isRestoringDatabase).toBe(false);
    expect(cmp.toast.show).toHaveBeenCalledWith('error', expect.stringMatching('صف آفلاین'));
  });

  it('does not restore while a photo is unsent', async () => {
    cmp.photoQueue.countPendingStrict.mockResolvedValue(1);
    await cmp.executeRestore();
    expect(cmp.backupApi.restoreBackup).not.toHaveBeenCalled();
  });

  it('does not restore when the offline queues cannot be read', async () => {
    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockRejectedValue(new Error('VersionError'));
    await cmp.executeRestore();
    expect(cmp.backupApi.restoreBackup).not.toHaveBeenCalled();
    expect(cmp.toast.show).toHaveBeenCalledWith('error', 'امکان بررسی صف آفلاین وجود ندارد؛ بازگردانی متوقف شد.');
  });

  it('restores once when nothing is unsent, then clears both scopes and logs out', async () => {
    await Promise.all([cmp.executeRestore(), cmp.executeRestore()]);
    expect(cmp.backupApi.restoreBackup).toHaveBeenCalledTimes(1);
    expect(cmp.backupApi.restoreBackup).toHaveBeenCalledWith('backup_1.dump', 'RESTORE_DATABASE_CONFIRM');

    await vi.advanceTimersByTimeAsync(2000);
    expect(warehouseOfflineDb.clearServerDerivedCaches).toHaveBeenCalled();
    expect(financeOfflineDb.clearServerDerivedCaches).toHaveBeenCalled();
    expect(cmp.auth.logout).toHaveBeenCalled();
  });
});
