import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { getAllOfflineDbs, getCurrentActiveAppScope } from './offline-db';
import { NetworkStatusService } from './network-status.service';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  title: string;
  latency_ms?: number | null;
  message?: string;
  engine?: string;
  name?: string;
  layer_type?: string;
}

export interface ServerHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  health_score: number;
  timestamp: string;
  server_time: string;
  app_scope: string;
  total_check_time_ms: number;
  components: {
    database?: ComponentHealth;
    redis?: ComponentHealth;
    websocket?: ComponentHealth;
    [key: string]: ComponentHealth | undefined;
  };
}

export interface ClientStorageHealth {
  usedBytes: number;
  totalBytes: number;
  usagePercent: number;
  formattedUsed: string;
  formattedTotal: string;
  /** شمار رکوردهای کش و صف هر دیتابیس آفلاین، با کلید قلمرو آن (dbScope) */
  recordsByScope: Record<string, number>;
  status: 'healthy' | 'warning' | 'critical';
}

export interface ServiceWorkerHealth {
  isSupported: boolean;
  isActive: boolean;
  status: 'active' | 'inactive' | 'unsupported';
  message: string;
}

export interface ComprehensiveDiagnosticReport {
  timestamp: number;
  overallScore: number;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  networkPingMs: number;
  server: ServerHealthResponse | null;
  storage: ClientStorageHealth;
  serviceWorker: ServiceWorkerHealth;
  diagnosedAtShamsi: string;
}

export interface ConcurrencyStressReport {
  status: 'passed' | 'failed';
  test_session_id: string;
  scenario: string;
  concurrency_level: number;
  total_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  deadlock_count: number;
  deadlock_free: boolean;
  double_spend_prevented: boolean;
  inventory_integrity_verified: boolean;
  treasury_winner_count: number;
  treasury_serialized_count: number;
  initial_stock: number;
  final_stock: number;
  expected_stock: number;
  latency: {
    min_ms: number;
    avg_ms: number;
    max_ms: number;
    p95_ms: number;
  };
  duration_seconds: number;
  timestamp: string;
  server_time: string;
}

@Injectable({
  providedIn: 'root',
})
export class SystemHealthService {
  private static instance: SystemHealthService;
  private http = inject(HttpClient);
  private network = NetworkStatusService.getInstance();

  private _serverHealth$ = new BehaviorSubject<ServerHealthResponse | null>(null);
  readonly serverHealth$ = this._serverHealth$.asObservable();

  private _networkPingMs$ = new BehaviorSubject<number | null>(null);
  readonly networkPingMs$ = this._networkPingMs$.asObservable();

  private _clientStorage$ = new BehaviorSubject<ClientStorageHealth | null>(null);
  readonly clientStorage$ = this._clientStorage$.asObservable();

  private _serviceWorker$ = new BehaviorSubject<ServiceWorkerHealth | null>(null);
  readonly serviceWorker$ = this._serviceWorker$.asObservable();

  private _healthScore$ = new BehaviorSubject<number>(100);
  readonly healthScore$ = this._healthScore$.asObservable();

  private _isDiagnosing$ = new BehaviorSubject<boolean>(false);
  readonly isDiagnosing$ = this._isDiagnosing$.asObservable();

  private _lastReport$ = new BehaviorSubject<ComprehensiveDiagnosticReport | null>(null);
  readonly lastReport$ = this._lastReport$.asObservable();

  private monitorTimer: any = null;

  constructor() {
    SystemHealthService.instance = this;
    this.startPeriodicMonitoring();
  }

  static getInstance(): SystemHealthService {
    return SystemHealthService.instance;
  }

  /** شروع پایش دوره‌ای سبک هر ۶۰ ثانیه */
  startPeriodicMonitoring(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    // اجرای اولیه با اندکی تاخیر پس از بوت
    setTimeout(() => {
      this.runFullDiagnostic().catch(() => {});
    }, 2000);

    this.monitorTimer = setInterval(() => {
      if (this.network.isBrowserOnline) {
        this.runFullDiagnostic(false).catch(() => {});
      }
    }, 60000);
  }

  /**
   * اجرای تست عیب‌یابی جامع (One-Click Diagnostic Self-Test)
   * ارزیابی ۶ لایه: PostgreSQL، Redis، WebSocket، Network Ping، IndexedDB، ServiceWorker
   */
  async runFullDiagnostic(setLoading = true): Promise<ComprehensiveDiagnosticReport> {
    if (setLoading) this._isDiagnosing$.next(true);

    const startTime = performance.now();
    let serverHealth: ServerHealthResponse | null = null;
    let pingMs = 0;

    // ۱. استعلام سلامت سرور و پینگ شبکه
    try {
      const url = `${environment.apiUrl}/accounts/health/`;
      const t0 = performance.now();
      serverHealth = await firstValueFrom(
        this.http.get<ServerHealthResponse>(url, {
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        })
      );
      pingMs = Math.round(performance.now() - t0);
      this._serverHealth$.next(serverHealth);
      this._networkPingMs$.next(pingMs);
    } catch (err) {
      pingMs = Math.round(performance.now() - startTime);
      this._networkPingMs$.next(this.network.isBrowserOnline ? pingMs : -1);
      this._serverHealth$.next({
        status: 'unhealthy',
        health_score: 0,
        timestamp: new Date().toISOString(),
        server_time: '—',
        app_scope: getCurrentActiveAppScope(),
        total_check_time_ms: pingMs,
        components: {
          database: { status: 'unhealthy', title: 'پایگاه‌داده', message: 'عدم دسترسی به سرور' },
          redis: { status: 'unhealthy', title: 'حافظه Redis', message: 'سرور پاسخ نمی‌دهد' },
          websocket: { status: 'unhealthy', title: 'وب‌سوکت', message: 'ارتباط قطع است' },
        },
      });
    }

    // ۲. بررسی حافظه ذخیره‌سازی محلی کلاینت (IndexedDB & Quota)
    const storage = await this.checkClientStorage();
    this._clientStorage$.next(storage);

    // ۳. بررسی وضعیت سرویس‌ورکر PWA
    const swHealth = this.checkServiceWorker();
    this._serviceWorker$.next(swHealth);

    // ۴. محاسبه نمره سلامت کلی (Health Score 0-100)
    let score = serverHealth ? serverHealth.health_score : (this.network.isBrowserOnline ? 30 : 10);
    
    // کسر امتیاز در صورت تاخیر بالای شبکه (> 800ms)
    if (pingMs > 800) score = Math.max(0, score - 15);
    else if (pingMs > 400) score = Math.max(0, score - 5);

    // کسر امتیاز در صورت پر شدن حافظه (> 85%)
    if (storage.status === 'critical') score = Math.max(0, score - 20);
    else if (storage.status === 'warning') score = Math.max(0, score - 10);

    this._healthScore$.next(score);

    const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
      score >= 85 ? 'healthy' : score >= 50 ? 'degraded' : 'unhealthy';

    const report: ComprehensiveDiagnosticReport = {
      timestamp: Date.now(),
      overallScore: score,
      overallStatus,
      networkPingMs: pingMs,
      server: serverHealth,
      storage,
      serviceWorker: swHealth,
      diagnosedAtShamsi: this.formatShamsiNow(),
    };

    this._lastReport$.next(report);
    if (setLoading) this._isDiagnosing$.next(false);
    return report;
  }

  /** پایش حافظه محلی آفلاین IndexedDB و محاسبه سهمیه دیسک مرورگر */
  async checkClientStorage(): Promise<ClientStorageHealth> {
    let used = 0;
    let total = 0;

    if ('storage' in navigator && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        used = est.usage || 0;
        total = est.quota || 0;
      } catch {}
    }

    // شمارش رکوردهای کش و صف در هر دیتابیس تفکیک‌شده (همهٔ قلمروها)
    const recordsByScope: Record<string, number> = {};
    try {
      const dbs = getAllOfflineDbs();
      const counts = await Promise.all(dbs.map(db => Promise.all([
        db.syncQueue.count().catch(() => 0),
        db.apiCache.count().catch(() => 0),
      ])));
      dbs.forEach((db, i) => {
        recordsByScope[db.dbScope] = (recordsByScope[db.dbScope] || 0) + counts[i][0] + counts[i][1];
      });
    } catch {}

    const percent = total > 0 ? Math.round((used / total) * 100) : 0;
    const status = percent > 90 ? 'critical' : percent > 75 ? 'warning' : 'healthy';

    return {
      usedBytes: used,
      totalBytes: total,
      usagePercent: percent,
      formattedUsed: this.formatBytes(used),
      formattedTotal: this.formatBytes(total),
      recordsByScope,
      status,
    };
  }

  /** ارزیابی سرویس‌ورکر PWA */
  checkServiceWorker(): ServiceWorkerHealth {
    if (!('serviceWorker' in navigator)) {
      return {
        isSupported: false,
        isActive: false,
        status: 'unsupported',
        message: 'مرورگر کاربر از Service Worker پشتیبانی نمی‌کند.',
      };
    }

    const hasController = !!navigator.serviceWorker.controller;
    return {
      isSupported: true,
      isActive: hasController,
      status: hasController ? 'active' : 'inactive',
      message: hasController
        ? 'کش هوشمند PWA و ورکر پس‌زمینه فعال است.'
        : 'ورکر ثبت شده ولی هنوز کنترل تب جاری را بر عهده نگرفته است.',
    };
  }

  private formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '۰ بایت';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatShamsiNow(): string {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString();
    }
  }

  /**
   * اجرای تست فشار همروندی و مقاومت در برابر بن‌بست دیتابیس
   * (High-Concurrency Stress & Deadlock Resistance API)
   */
  async runConcurrencyStressTest(concurrency_level = 30, scenario = 'combined'): Promise<ConcurrencyStressReport> {
    const url = `${environment.apiUrl}/accounts/health/stress-test/`;
    return firstValueFrom(
      this.http.post<ConcurrencyStressReport>(
        url,
        { concurrency_level, scenario },
        {
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true),
        }
      )
    );
  }
}
