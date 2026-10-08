import { Injectable, InjectionToken, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfigApiService, PublicConfig } from '../api/config-api.service';
import { OfflineSyncService } from './offline-sync.service';
import { PhotoUploadQueueService } from './photo-upload-queue.service';
import { isServerUnreachable } from './server-reachability';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class DomainMigrationService {
  private configApi = inject(ConfigApiService);
  private offlineSync = inject(OfflineSyncService);
  private photoQueue = inject(PhotoUploadQueueService);
  private navigator = inject(LOCATION_NAVIGATOR);
  private destroyRef = inject(DestroyRef);

  readonly canonicalDomain = signal<string>('');
  readonly isLegacyDomain = signal<boolean>(false);
  readonly pendingSyncCount = signal<number>(0);
  readonly pendingPhotoCount = signal<number>(0);
  readonly totalPendingCount = computed(() => this.pendingSyncCount() + this.pendingPhotoCount());
  readonly isServerReachable = signal<boolean>(true);
  readonly isChecking = signal<boolean>(false);
  readonly hasMigrated = signal<boolean>(false);

  readonly showBanner = computed(() => this.isLegacyDomain() && !this.hasMigrated());

  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // بارگذاری پیکربندی سیستم
    this.configApi
      .getPublicConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => this.handleConfig(config),
        error: () => {
          // در خطای اولیه سرور غیرقابل دسترس است
          this.isServerReachable.set(false);
        },
      });

    // پایش تغییرات تعداد درخواست‌های صف همگام‌سازی
    this.offlineSync.pendingCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((count) => {
        this.pendingSyncCount.set(count);
        if (this.isLegacyDomain() && count === 0) {
          void this.evaluateAndMigrateIfReady();
        }
      });

    // پایش تغییرات صف آپلود عکس
    this.photoQueue.pendingCount$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((count) => {
        this.pendingPhotoCount.set(count);
        if (this.isLegacyDomain() && count === 0) {
          void this.evaluateAndMigrateIfReady();
        }
      });
  }

  handleConfig(config: PublicConfig | null): void {
    if (!config?.canonical_domain) {
      this.isLegacyDomain.set(false);
      return;
    }

    const canonical = config.canonical_domain.trim().toLowerCase();
    this.canonicalDomain.set(canonical);

    const currentHost = (this.navigator.getHost() || '').trim().toLowerCase();
    const currentHostname = (this.navigator.getHostname() || '').trim().toLowerCase();

    // مقایسه با دامنهٔ فعلی (هم با پورت و هم بدون پورت)
    const isLegacy = !!canonical && currentHost !== canonical && currentHostname !== canonical;
    this.isLegacyDomain.set(isLegacy);

    if (isLegacy) {
      void this.evaluateAndMigrateIfReady();
    }
  }

  async checkReachability(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.configApi.getPublicConfig().pipe(
          timeout(5000),
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

  async evaluateAndMigrateIfReady(): Promise<boolean> {
    if (!this.isLegacyDomain() || this.hasMigrated()) {
      return false;
    }

    this.isChecking.set(true);
    try {
      // استعلام دقیق تعداد آیتم‌های صف در این لحظه
      const syncCount = await this.offlineSync.getPendingCount();
      const photoCount = await this.photoQueue.countPending();

      this.pendingSyncCount.set(syncCount);
      this.pendingPhotoCount.set(photoCount);

      if (syncCount > 0 || photoCount > 0) {
        // صف پر است — هرگز بدون ارسال داده‌ها انتقال انجام نمی‌شود
        return false;
      }

      // صف خالی است؛ حال در دسترس بودن سرور سنجیده می‌شود
      const reachable = await this.checkReachability();
      if (!reachable) {
        // سرور در دسترس نیست؛ کاربر تا برقراری ارتباط روی دامنهٔ فعلی می‌ماند
        return false;
      }

      // همهٔ شرایط مهیاست: صف خالی و سرور در دسترس
      this.performMigration();
      return true;
    } finally {
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
    void this.evaluateAndMigrateIfReady();
  }
}
