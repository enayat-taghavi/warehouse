import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { NetworkStatusService } from '../services/network-status.service';
import { OfflineSyncService } from '../services/offline-sync.service';
import { environment } from '../../../environments/environment';
import { APP_VERSION } from './app-version';
import { isNativePlatform } from './platform';

export type AppVersionState = 'ok' | 'recommend' | 'locked';

/**
 * Parses a semantic version string of the form MAJOR.MINOR.PATCH into a tuple of 3 numbers.
 * Returns null if the version string is empty, invalid, or does not contain exactly 3 numeric segments.
 */
export function parseVersion(v: string | null | undefined): [number, number, number] | null {
  if (!v || typeof v !== 'string') {
    return null;
  }
  const trimmed = v.trim();
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    nums.push(parseInt(part, 10));
  }
  return [nums[0], nums[1], nums[2]];
}

/**
 * Numeric comparison of MAJOR.MINOR.PATCH versions.
 * Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 *
 * An empty or invalid version string is treated as "no rule" by callers.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;

  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

let _activeAppVersionService: AppVersionService | null = null;

/**
 * Global function to check if automatic sending is blocked by the version lock state.
 * Can be safely called from background runners and non-Angular contexts.
 */
export function isAutoSendBlocked(): boolean {
  if (!_activeAppVersionService) {
    return false;
  }
  return _activeAppVersionService.isAutoSendBlocked();
}

export function setActiveAppVersionService(service: AppVersionService | null): void {
  _activeAppVersionService = service;
}

@Injectable({ providedIn: 'root' })
export class AppVersionService {
  private configApi = inject(ConfigApiService);
  private network = NetworkStatusService.getInstance();
  private offlineSync = inject(OfflineSyncService, { optional: true });
  private destroyRef = inject(DestroyRef, { optional: true });

  private readonly _config = signal<PublicConfig | null>(null);
  public readonly state = signal<AppVersionState>('ok');

  public get downloadUrl(): string {
    const urls = this._config()?.app_download_urls;
    if (!urls) return '';
    const channel = (environment as any).appChannel || 'direct';
    return urls[channel] || urls['direct'] || '';
  }

  constructor() {
    _activeAppVersionService = this;

    // بارگذاری اولیه پیکربندی عمومی
    this.refreshConfig();

    // به‌روزرسانی هنگام برقراری اتصال اینترنت
    if (this.destroyRef) {
      this.network.state$
        .pipe(
          filter((st) => st === 'online'),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(() => {
          this.refreshConfig();
        });
    }
  }

  /**
   * اعمال و ارزیابی مستقیم پیکربندی عمومی (مورد استفاده در تست‌ها و فراخوانی‌های درونی)
   */
  public applyConfig(config: PublicConfig | null): void {
    this._config.set(config);
    this.evaluateState();
  }

  /**
   * واکشی آخرین نسخه پیکربندی عمومی از سرور و بررسی نسخه
   */
  public refreshConfig(): void {
    this.configApi.getPublicConfig().subscribe({
      next: (cfg) => this.applyConfig(cfg),
      error: () => {
        // در صورت عدم دسترسی به سرور یا خطا، تغییری در وضعیت نمی‌دهیم
      },
    });
  }

  private evaluateState(): void {
    // در محیط وب همیشه وضعیت ok است
    if (!isNativePlatform()) {
      this.state.set('ok');
      return;
    }

    const cfg = this._config();
    if (!cfg) {
      this.state.set('ok');
      return;
    }

    // ۱. بررسی حداقل نسخه مجاز (app_min_version) -> locked
    const minParsed = parseVersion(cfg.app_min_version);
    if (minParsed && compareVersions(APP_VERSION, cfg.app_min_version!) < 0) {
      this.state.set('locked');
      return;
    }

    // ۲. بررسی نسخه پیشنهادی (app_recommended_version) -> recommend
    const recParsed = parseVersion(cfg.app_recommended_version);
    if (recParsed && compareVersions(APP_VERSION, cfg.app_recommended_version!) < 0) {
      this.state.set('recommend');
      return;
    }

    // ۳. سایر حالات -> ok
    this.state.set('ok');
  }

  /**
   * آیا ارسال خودکار صف‌ها به دلیل قفل نسخه مسدود است؟
   * فقط زمانی که وضعیت locked باشد true است.
   */
  public isAutoSendBlocked(): boolean {
    return isNativePlatform() && this.state() === 'locked';
  }

  /**
   * ارسال اضطراری: اجرای دستی تخلیه صف آفلاین و صف عکس با دور زدن گیت قفل.
   */
  public async emergencySend(): Promise<any> {
    const sync = this.offlineSync || OfflineSyncService.getInstance();
    return await sync.emergencyFlush();
  }
}
