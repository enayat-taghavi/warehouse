import { Injectable, inject } from '@angular/core';
import { PwaUpdateService } from '../services/pwa-update.service';

/**
 * AppUpdateService — Wrapper service around PwaUpdateService.
 * Exposes identical public API needed by the application shell and user menu,
 * allowing web PWA updating to work unchanged while serving as the unified update contract.
 */
@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private pwaUpdate = inject(PwaUpdateService);

  /** نشان‌دهنده وضعیت در حال استعلام دستی نسخه */
  public readonly isChecking = this.pwaUpdate.isChecking;

  /**
   * مقداردهی اولیه و رجیستر کردن شنوندگان PWA
   */
  public init(): void {
    this.pwaUpdate.init();
  }

  /**
   * استعلام و اعمال دستی آخرین نسخه برنامه
   */
  public checkAndApplyManualUpdate(options?: { pendingCount?: number }): Promise<void> {
    return this.pwaUpdate.checkAndApplyManualUpdate(options);
  }

  /**
   * بازنشانی کامل و اجباری کش‌های محلی
   */
  public hardResetCache(): Promise<void> {
    return this.pwaUpdate.hardResetCache();
  }
}
