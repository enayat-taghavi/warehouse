import { Injectable, InjectionToken, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { OfflineSyncService } from './offline-sync.service';
import { PhotoUploadQueueService } from './photo-upload-queue.service';
import { countPersonnelLocalDraftsStrict } from './offline-db';
import { isServerUnreachable } from './server-reachability';
import { firstValueFrom, timeout, catchError, of, interval, fromEvent, EMPTY } from 'rxjs';

export interface LocationNavigator {
  replace(url: string): void;
  getHost(): string;
  getHostname(): string;
  getPathname(): string;
  getSearch(): string;
  getHash(): string;
}

export const LOCATION_NAVIGATOR = new InjectionToken<LocationNavigator>('LOCATION_NAVIGATOR', {
  providedIn: 'root',
  factory: () => ({
    replace: (url: string) => {
      if (typeof window !== 'undefined') {
        window.location.replace(url);
      }
    },
    getHost: () => (typeof window !== 'undefined' ? window.location.host : ''),
    getHostname: () => (typeof window !== 'undefined' ? window.location.hostname : ''),
    getPathname: () => (typeof window !== 'undefined' ? window.location.pathname : ''),
    getSearch: () => (typeof window !== 'undefined' ? window.location.search : ''),
    getHash: () => (typeof window !== 'undefined' ? window.location.hash : ''),
  }),
});

/** وابستگی‌های محیطی انتقال دامنه (قابل جایگزینی در تست) */
export interface DomainMigrationProbes {
  /** آیا مرورگر اصلاً شبکه دارد؟ */
  isBrowserOnline(): boolean;
  /** آیا دامنهٔ مقصد از این شبکه در دسترس است؟ (فقط شکست شبکه سنجیده می‌شود) */
  reachTarget(origin: string): Promise<boolean>;
  /** تعداد پیش‌نویس‌های محلی ارسال‌نشده؛ خطا باید به فراخوان برسد */
  countDrafts(): Promise<number>;
}

export const DOMAIN_MIGRATION_PROBES = new InjectionToken<DomainMigrationProbes>('DOMAIN_MIGRATION_PROBES', {
  providedIn: 'root',
  factory: () => ({
    isBrowserOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true),
    reachTarget: async (origin: string) => {
      if (typeof fetch === 'undefined') return false;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        // no-cors: پاسخ مات است ولی فقط موفقیت شبکه مهم است، نه محتوا
        await fetch(`${origin}/api/public/config/?_probe=${Date.now()}`, {
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
          signal: ctrl.signal,
        });
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
    countDrafts: () => countPersonnelLocalDraftsStrict(),
  }),
});

/**
 * PhotoUploadQueueService با getInstance ساخته می‌شود و Injectable نیست؛ inject مستقیم آن
 * کل اپ را هنگام راه‌اندازی با NG0201 از کار می‌انداخت. این توکن همان نمونهٔ یکتا را می‌دهد.
 */
export const DOMAIN_MIGRATION_PHOTO_QUEUE = new InjectionToken<PhotoUploadQueueService>('DOMAIN_MIGRATION_PHOTO_QUEUE', {
  providedIn: 'root',
  factory: () => PhotoUploadQueueService.getInstance(),
});

/** چرا کاربر هنوز منتقل نشده است */
export type MigrationBlockReason =
  | 'pending'
  | 'syncing'
  | 'offline'
  | 'server-unreachable'
  | 'target-unreachable'
  | 'check-failed'
  | 'user-active';

/** فاصلهٔ بررسی دوباره وقتی کاربر روی دامنهٔ قبلی مانده است */
export const DOMAIN_MIGRATION_RETRY_MS = 60_000;
/** انتقال خودکار فقط وقتی کاربر این مدت با صفحه کار نکرده باشد (ورودی ذخیره‌نشدهٔ فرم از دست نرود) */
export const DOMAIN_MIGRATION_IDLE_MS = 120_000;

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

@Injectable({ providedIn: 'root' })
export class DomainMigrationService {
  private configApi = inject(ConfigApiService);
  private offlineSync = inject(OfflineSyncService);
  private photoQueue = inject(DOMAIN_MIGRATION_PHOTO_QUEUE);
  private navigator = inject(LOCATION_NAVIGATOR);
  private probes = inject(DOMAIN_MIGRATION_PROBES);
  private destroyRef = inject(DestroyRef);

  readonly canonicalDomain = signal<string>('');
  readonly isLegacyDomain = signal<boolean>(false);
  readonly pendingSyncCount = signal<number>(0);
  readonly pendingPhotoCount = signal<number>(0);
  readonly pendingDraftCount = signal<number>(0);
  readonly totalPendingCount = computed(
    () => this.pendingSyncCount() + this.pendingPhotoCount() + this.pendingDraftCount()
  );
  readonly isServerReachable = signal<boolean>(true);
  readonly isChecking = signal<boolean>(false);
  readonly hasMigrated = signal<boolean>(false);
  readonly blockReason = signal<MigrationBlockReason | null>(null);

  readonly showBanner = computed(() => this.isLegacyDomain() && !this.hasMigrated());

  private initialized = false;
  private evaluating = false;
  /** پیکربندی دست‌کم یک بار (از سرور یا کش) خوانده شده است؛ پیش از آن تلاش دوباره می‌شود */
  private configLoaded = false;
  /** زمان آخرین تعامل کاربر؛ صفر یعنی از بارگذاری صفحه تاکنون تعاملی نبوده است */
  private lastInteractionAt = 0;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.loadConfig();

    // تغییر صف‌ها فقط محرک بررسی است؛ شمارش معتبر را evaluate خودش می‌خواند
    this.offlineSync.pendingCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((count) => {
        if (this.isLegacyDomain() && count === 0) void this.evaluateAndMigrateIfReady();
      });
    this.photoQueue.pendingCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((count) => {
        if (this.isLegacyDomain() && count === 0) void this.evaluateAndMigrateIfReady();
      });

    // تلاش دوباره: دوره‌ای و هنگام بازگشت شبکه
    interval(DOMAIN_MIGRATION_RETRY_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.retryTick());
    if (typeof window !== 'undefined') {
      fromEvent(window, 'online')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.retryTick());
    }

    if (typeof document !== 'undefined') {
      const mark = () => (this.lastInteractionAt = Date.now());
      for (const type of ['keydown', 'input', 'pointerdown']) {
        document.addEventListener(type, mark, { capture: true, passive: true });
      }
      this.destroyRef.onDestroy(() => {
        for (const type of ['keydown', 'input', 'pointerdown']) {
          document.removeEventListener(type, mark, { capture: true });
        }
      });
    }
  }

  private loadConfig(): void {
    this.configApi
      .getPublicConfig()
      .pipe(
        catchError(() => {
          this.isServerReachable.set(false);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((config) => this.handleConfig(config));
  }

  private retryTick(): void {
    if (this.hasMigrated()) return;
    if (!this.configLoaded) {
      this.loadConfig();
      return;
    }
    if (this.isLegacyDomain()) void this.evaluateAndMigrateIfReady();
  }

  handleConfig(config: PublicConfig | null): void {
    this.configLoaded = true;
    const canonical = (config?.canonical_domain || '').trim().toLowerCase();
    if (!canonical || !HOSTNAME_RE.test(canonical)) {
      this.isLegacyDomain.set(false);
      return;
    }
    this.canonicalDomain.set(canonical);

    const currentHost = (this.navigator.getHost() || '').trim().toLowerCase();
    const currentHostname = (this.navigator.getHostname() || '').trim().toLowerCase();

    // مقایسه با دامنهٔ فعلی (هم با پورت و هم بدون پورت)
    const isLegacy = currentHost !== canonical && currentHostname !== canonical;
    this.isLegacyDomain.set(isLegacy);

    if (isLegacy) {
      void this.evaluateAndMigrateIfReady();
    }
  }

  /** سنجش واقعی سرور فعلی؛ پاسخ کش آفلاین هرگز «در دسترس» تعبیر نمی‌شود */
  async checkReachability(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.configApi.probePublicConfig().pipe(
          timeout(8000),
          catchError((err) => {
            const status = typeof err?.status === 'number' ? err.status : 0;
            return of({ __error_status: status });
          })
        )
      );

      if (res && '__error_status' in res) {
        const unreachable = isServerUnreachable(res.__error_status as number);
        this.isServerReachable.set(!unreachable);
        return !unreachable;
      }

      this.isServerReachable.set(true);
      return true;
    } catch {
      this.isServerReachable.set(false);
      return false;
    }
  }

  /** شمارش سخت‌گیرانهٔ هر چیزی که هنوز به سرور نرسیده است؛ خطای خواندن پرتاب می‌شود */
  private async readUnsentCounts(): Promise<number> {
    const [sync, photos, drafts] = await Promise.all([
      this.offlineSync.getUnsentCountStrict(),
      this.photoQueue.countPendingStrict(),
      this.probes.countDrafts(),
    ]);
    this.pendingSyncCount.set(sync);
    this.pendingPhotoCount.set(photos);
    this.pendingDraftCount.set(drafts);
    return sync + photos + drafts;
  }

  private isSendingNow(): boolean {
    return this.offlineSync.isSyncing || this.photoQueue.isFlushing;
  }

  /**
   * انتقال فقط وقتی انجام می‌شود که همهٔ این‌ها برقرار باشد:
   * صف همگام‌سازی (با رکوردهای در حال ارسال)، صف عکس و پیش‌نویس‌های محلی خالی؛ هیچ ارسالی در جریان نیست؛
   * مرورگر آنلاین؛ سرور فعلی و دامنهٔ مقصد واقعاً در دسترس؛ و درست پیش از رفتن، شمارش دوباره هنوز صفر است.
   * @param manual درخواست صریح کاربر (دکمه)؛ شرط بی‌کاری کاربر را کنار می‌گذارد.
   */
  async evaluateAndMigrateIfReady(manual = false): Promise<boolean> {
    if (!this.isLegacyDomain() || this.hasMigrated() || this.evaluating) {
      return false;
    }

    this.evaluating = true;
    this.isChecking.set(true);
    try {
      if ((await this.readUnsentCounts()) > 0) {
        // صف پر است — هرگز بدون ارسال داده‌ها انتقال انجام نمی‌شود
        this.blockReason.set('pending');
        return false;
      }
      if (this.isSendingNow()) {
        this.blockReason.set('syncing');
        return false;
      }
      if (!this.probes.isBrowserOnline()) {
        this.blockReason.set('offline');
        return false;
      }
      if (!(await this.checkReachability())) {
        this.blockReason.set('server-unreachable');
        return false;
      }
      const target = this.canonicalDomain();
      if (!(await this.probes.reachTarget(`https://${target}`))) {
        this.blockReason.set('target-unreachable');
        return false;
      }
      if (!manual && this.lastInteractionAt > 0 && Date.now() - this.lastInteractionAt < DOMAIN_MIGRATION_IDLE_MS) {
        this.blockReason.set('user-active');
        return false;
      }

      // در فاصلهٔ سنجش شبکه ممکن است رکوردی به صف رسیده باشد: شمارش دوباره، درست پیش از رفتن
      if ((await this.readUnsentCounts()) > 0) {
        this.blockReason.set('pending');
        return false;
      }
      if (this.isSendingNow()) {
        this.blockReason.set('syncing');
        return false;
      }

      this.blockReason.set(null);
      this.performMigration();
      return true;
    } catch {
      // خطای خواندن صف هرگز «صف خالی» تعبیر نمی‌شود
      this.blockReason.set('check-failed');
      return false;
    } finally {
      this.evaluating = false;
      this.isChecking.set(false);
    }
  }

  performMigration(): void {
    if (this.hasMigrated()) return;
    const targetDomain = this.canonicalDomain();
    if (!targetDomain) return;

    this.hasMigrated.set(true);
    const pathname = this.navigator.getPathname() || '/';
    const search = this.navigator.getSearch() || '';
    const hash = this.navigator.getHash() || '';
    const targetUrl = `https://${targetDomain}${pathname}${search}${hash}`;

    this.navigator.replace(targetUrl);
  }

  triggerImmediateCheck(): void {
    void this.evaluateAndMigrateIfReady(true);
  }
}
