import { BehaviorSubject, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../environments/environment';
import { resolveServerUrl } from '../platform/server-origin';

/**
 * وضعیت اتصال — مدل سه‌حالته
 *
 * • online              → مرورگر آنلاین است و سرور پاسخ می‌دهد
 * • server-unreachable  → مرورگر آنلاین است ولی سرور جواب نمی‌دهد (Lie-Fi)
 * • offline             → مرورگر آفلاین است (navigator.onLine === false)
 */
export type ConnectionState = 'online' | 'server-unreachable' | 'offline';

/**
 * NetworkStatusService — تشخیص وضعیت واقعی اتصال به سرور
 *
 * منابع سیگنال:
 * 1. رویدادهای online/offline مرورگر (فوری و رایگان)
 * 2. گزارش interceptor از هر پاسخ موفق یا خطای شبکه (هر درخواست کاربر = یک probe رایگان)
 * 3. probe سبک دوره‌ای — فقط زمانی که در حالت server-unreachable هستیم
 */
export class NetworkStatusService {
  private static instance: NetworkStatusService;

  /** وضعیت خام مرورگر */
  private _browserOnline = navigator.onLine;

  /** آیا آخرین تماس با سرور موفق بوده؟ */
  private _serverReachable = true;

  private _state$ = new BehaviorSubject<ConnectionState>(
    navigator.onLine ? 'online' : 'offline'
  );

  /** وضعیت اتصال به صورت Observable (بدون تکرار مقدار یکسان) */
  readonly state$ = this._state$.pipe(distinctUntilChanged());

  /** فاصله probe وقتی سرور در دسترس نیست (۳۰ ثانیه) */
  private readonly PROBE_INTERVAL = 30 * 1000;
  private probeTimer: any = null;

  private constructor() {
    window.addEventListener('online', () => {
      console.log('[NetworkStatus] 🟢 مرورگر آنلاین شد');
      this._browserOnline = true;
      // با برگشت اتصال، خوش‌بینانه فرض می‌کنیم سرور در دسترس است؛
      // اولین درخواست ناموفق این را اصلاح می‌کند
      this._serverReachable = true;
      this.recompute();
    });

    window.addEventListener('offline', () => {
      console.log('[NetworkStatus] 🔴 مرورگر آفلاین شد');
      this._browserOnline = false;
      this.recompute();
    });
  }

  /** دریافت نمونه سینگلتون */
  static getInstance(): NetworkStatusService {
    if (!NetworkStatusService.instance) {
      NetworkStatusService.instance = new NetworkStatusService();
    }
    return NetworkStatusService.instance;
  }

  // ─── مقادیر لحظه‌ای ───

  /** وضعیت فعلی اتصال */
  get state(): ConnectionState {
    return this._state$.value;
  }

  /** آیا کاملاً آنلاین هستیم (مرورگر آنلاین + سرور پاسخگو)؟ */
  get isOnline(): boolean {
    return this.state === 'online';
  }

  /**
   * آیا مرورگر آنلاین است؟ (بدون توجه به در دسترس بودن سرور)
   * برای تصمیم «آیا اصلاً ارزش دارد درخواست بفرستیم؟» استفاده می‌شود —
   * هر درخواست واقعی کاربر خودش نقش probe را بازی می‌کند.
   */
  get isBrowserOnline(): boolean {
    return this._browserOnline;
  }

  /** آیا در حالت Lie-Fi هستیم (اینترنت وصل ولی سرور خاموش)؟ */
  get isServerUnreachable(): boolean {
    return this.state === 'server-unreachable';
  }

  // ─── گزارش از طرف interceptor ───

  /** هر پاسخ موفق از سرور این را صدا می‌زند */
  reportServerReachable(): void {
    if (this._serverReachable) return; // تغییری نکرده
    console.log('[NetworkStatus] ✅ سرور دوباره در دسترس است');
    this._serverReachable = true;
    this.recompute();
  }

  /** هر خطای شبکه (status 0) این را صدا می‌زند */
  reportServerUnreachable(): void {
    if (!this._serverReachable) return; // قبلاً می‌دانستیم
    console.warn('[NetworkStatus] ⚠️ سرور در دسترس نیست (Lie-Fi)');
    this._serverReachable = false;
    this.recompute();
  }

  // ─── محاسبه وضعیت و probe ───

  private recompute(): void {
    const next: ConnectionState = !this._browserOnline
      ? 'offline'
      : this._serverReachable
        ? 'online'
        : 'server-unreachable';

    if (next !== this._state$.value) {
      this._state$.next(next);
    }

    // probe فقط در حالت server-unreachable لازم است
    if (next === 'server-unreachable') {
      this.startProbe();
    } else {
      this.stopProbe();
    }
  }

  /**
   * probe سبک برای تشخیص برگشت سرور وقتی کاربر بی‌کار است
   * از اندپوینت عمومی و سبک /public/config/ استفاده می‌کند (بدون نیاز به توکن)
   */
  private startProbe(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(async () => {
      if (!this._browserOnline) return;
      try {
        const res = await fetch(resolveServerUrl(`${environment.apiUrl}/public/config/`), {
          method: 'GET',
          cache: 'no-store',
        });
        if (res.ok) {
          this.reportServerReachable();
        }
      } catch {
        // هنوز در دسترس نیست — probe ادامه می‌یابد
      }
    }, this.PROBE_INTERVAL);
  }

  private stopProbe(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }
}
