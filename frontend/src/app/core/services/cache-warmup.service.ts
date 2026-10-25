import { Injectable, Injector, inject } from '@angular/core';
import { Subscription, merge, filter, map, pairwise, startWith, distinctUntilChanged } from 'rxjs';
import { getModuleRegistry } from '../modules/module-registry.service';
import { NetworkStatusService } from './network-status.service';
import { ActiveCompanyService } from './active-company.service';
import { OfflineSyncService } from './offline-sync.service';
import { getStoredCurrentUserId } from './sync-pull.service';

/** کمترین فاصلهٔ دو پیش‌خوانی برای یک کاربر و شرکت (۱۰ دقیقه) */
export const CACHE_WARMUP_INTERVAL_MS = 10 * 60 * 1000;
const WARMUP_STAMP_PREFIX = 'wh_cache_warmup:';

/**
 * پیش‌خوانی کش GET ماژول‌ها (ص۵ طرح ۲.۵).
 * بعد از ورود (تعیین شرکت فعال)، برگشت اتصال و پایان «بروزرسانی عمیق»، hook اختیاری
 * `syncConfig.warmCache` هر ماژول نصب‌شده را صدا می‌زند. فقط آنلاین، حداکثر یک بار در ۱۰ دقیقه
 * برای هر کاربر و شرکت، خطاها بی‌صدا. خودش هیچ کش یا رکورد صفی را پاک نمی‌کند.
 */
@Injectable({ providedIn: 'root' })
export class CacheWarmupService {
  private injector = inject(Injector);
  private activeCompany = inject(ActiveCompanyService);
  private subscription: Subscription | null = null;
  private running: Promise<void> | null = null;
  private runningCompanyId: number | null = null;

  /** یک بار از app.config صدا زده می‌شود */
  start(): void {
    if (this.subscription) return;
    const network = NetworkStatusService.getInstance();

    const companySet$ = this.activeCompany.activeCompany$.pipe(
      map(c => c?.id ?? null),
      distinctUntilChanged(),
      filter((id): id is number => !!id),
      map(() => false)
    );
    const reconnected$ = network.state$.pipe(
      pairwise(),
      filter(([prev, next]) => prev !== 'online' && next === 'online'),
      map(() => false)
    );
    const deepUpdateDone$ = OfflineSyncService.getInstance().deepUpdateState$.pipe(
      startWith(null),
      pairwise(),
      filter(([prev, next]) => !!prev && next === null),
      map(() => true)
    );

    this.subscription = merge(companySet$, reconnected$, deepUpdateDone$).subscribe(force => {
      void this.warm(force);
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /**
   * اجرای پیش‌خوانی. `force` فقط برای پایان بروزرسانی عمیق (درخواست صریح کاربر) فاصله را نادیده می‌گیرد.
   * هرگز خطا پرتاب نمی‌کند.
   */
  async warm(force = false): Promise<void> {
    const companyId = this.activeCompany.activeCompanyId;
    if (this.running && this.runningCompanyId === companyId) return this.running;
    // شرکت عوض شده: پیش‌خوانی شرکت تازه بعد از اجرای جاری انجام می‌شود (نه نادیده)
    const previous = this.running ?? Promise.resolve();
    this.runningCompanyId = companyId;
    const run: Promise<void> = previous.then(() => this.runWarmup(force)).finally(() => {
      if (this.running === run) {
        this.running = null;
        this.runningCompanyId = null;
      }
    });
    this.running = run;
    return run;
  }

  private async runWarmup(force: boolean): Promise<void> {
    try {
      if (!NetworkStatusService.getInstance().isOnline) return;
      if (!hasAccessToken()) return;
      const companyId = this.activeCompany.activeCompanyId;
      const userId = getStoredCurrentUserId();
      if (!companyId || !userId) return;

      const hooks = getModuleRegistry()
        .getExtensions('syncConfig')
        .map(e => e.extension.warmCache)
        .filter((fn): fn is NonNullable<typeof fn> => typeof fn === 'function');
      if (hooks.length === 0) return;

      const stampKey = `${WARMUP_STAMP_PREFIX}${userId}:${companyId}`;
      const last = readStamp(stampKey);
      if (!force && last && Date.now() - last < CACHE_WARMUP_INTERVAL_MS) return;

      for (const hook of hooks) {
        try {
          await hook(this.injector);
        } catch (err) {
          console.warn('[CacheWarmup] پیش‌خوانی یک ماژول ناموفق بود:', err);
        }
      }
      // زمان فقط وقتی ثبت می‌شود که اتصال تا پایان برقرار ماند؛ وگرنه برگشت اتصال دوباره پیش‌خوانی می‌کند
      if (NetworkStatusService.getInstance().isOnline) writeStamp(stampKey, Date.now());
    } catch (err) {
      console.warn('[CacheWarmup] پیش‌خوانی انجام نشد:', err);
    }
  }
}

function hasAccessToken(): boolean {
  try {
    return !!(sessionStorage.getItem('wh_access_token') || localStorage.getItem('wh_access_token'));
  } catch {
    return false;
  }
}

function readStamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStamp(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}
