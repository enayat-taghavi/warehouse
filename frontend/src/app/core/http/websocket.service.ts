import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../../shared';
import { wsUrl } from '../platform/server-origin';
import { normalizeScope, resolveOfflineDbStrict, DEFAULT_OFFLINE_SCOPE } from '../services/offline-db';
import { ActiveCompanyService } from '../services/active-company.service';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  public notifications$ = new Subject<any>();
  public connected$ = new BehaviorSubject<boolean>(false);

  // شناسه یکتای تب مرورگر جهت جلوگیری از اکو روی همان تب بدون بلاک کردن سایر دستگاه‌های کاربر
  public readonly tabId: string = typeof window !== 'undefined'
    ? (sessionStorage.getItem('wh_tab_session_id') || this.initTabId())
    : 'tab_server';

  private initTabId(): string {
    const id = 'tab_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    try { sessionStorage.setItem('wh_tab_session_id', id); } catch {}
    return id;
  }

  private injector = inject(Injector);

  /**
   * ق۴: رویداد زندهٔ همین زبانه، یا رویداد شرکتی جز شرکت فعال، کنار گذاشته می‌شود.
   * سرور هم اکوی زبانه را می‌گیرد؛ این بررسی برای کاربر چندشرکتی و پیام‌های بی‌شناسهٔ زبانه است.
   */
  skipLiveEvent(msg: any): boolean {
    if (!msg) return true;
    if (msg.client_tab_id && msg.client_tab_id === this.tabId) return true;
    const eventCompanyId = msg.company_id ?? msg.metadata?.company_id;
    // تزریق دیرهنگام تا وابستگی چرخه‌ای ساخته نشود
    const activeCompanyId = this.injector.get(ActiveCompanyService, null)?.activeCompanySignal()?.id;
    return !!(eventCompanyId && activeCompanyId && Number(eventCompanyId) !== Number(activeCompanyId));
  }

  private isExplicitlyClosed = false;
  private reconnectTimeout: any = null;
  private reconnectAttempts = 0;
  private pingInterval: any = null;
  private isDestroyed = false;

  // تنظیمات پایداری
  private readonly baseDelay = 1000;
  private readonly maxDelay = 20000;
  private readonly pingTimeMs = 30000;

  constructor(private auth: AuthService, private toast: ToastService) {
    this.setupBrowserLifecycleListeners();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.cleanupListeners();
    this.disconnect();
  }

  private setupBrowserLifecycleListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', this.onNetworkOnline);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private cleanupListeners(): void {
    if (typeof window === 'undefined') return;

    window.removeEventListener('online', this.onNetworkOnline);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onNetworkOnline = (): void => {
    if (this.isExplicitlyClosed || this.isDestroyed) return;
    console.log('[WebSocket] 🌐 شبکه وصل شد — تلاش برای اتصال مجدد آنی...');
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();
    this.connect();
  };

  private onVisibilityChange = (): void => {
    if (this.isExplicitlyClosed || this.isDestroyed) return;
    if (document.visibilityState === 'visible') {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
        console.log('[WebSocket] 👁️ بازگشت به تب فعال — بازسازی اتصال سوکت...');
        this.clearReconnectTimeout();
        this.connect();
      }
    }
  };

  connect(): void {
    if (this.isDestroyed) return;
    this.isExplicitlyClosed = false;

    // اگر اتصال در حال باز شدن یا باز است، نیازی به اتصال مجدد نیست
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.clearReconnectTimeout();
    this.stopPing();

    try {
      const activeApp = typeof window !== 'undefined' 
        ? (sessionStorage.getItem('active_app_module') || localStorage.getItem('active_app_module') || DEFAULT_OFFLINE_SCOPE) 
        : DEFAULT_OFFLINE_SCOPE;
      const url = wsUrl(`/ws/notifications/?app=${encodeURIComponent(activeApp)}&tab_id=${encodeURIComponent(this.tabId)}`);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket] ⚡ اتصال با موفقیت برقرار شد.');
        this.connected$.next(true);
        this.reconnectAttempts = 0;
        this.startPing();
        this.switchAppChannel(activeApp);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          // بسته‌های Pong مربوط به Heartbeat هستند
          if (data.type === 'pong') {
            return;
          }

          this.notifications$.next(data);

          // نمایش اعلان‌های سیستم در Toast (صرفاً برای رویدادهای کاربری و پیام‌های معتبر، نه لاگ‌های پس‌زمینه و ممیزی)
          const silentTypes = [
            'count_task_update',
            'doc_task_update',
            'pong',
            'ping',
            'fleet_update',
            'telemetry_update',
            'audit_log_created',
            'login_log_created',
            'warehouse_mutation',
            'attendance_updated',
            'personnel_updated',
            'fleet_trips_updated',
            'org_structure_updated',
            'session_revoked',
            'permissions_updated',
            'users_changed'
          ];
          const validToastTypes: string[] = ['info', 'warning', 'success', 'error'];
          if (data.message && data.type && !silentTypes.includes(data.type) && validToastTypes.includes(data.type)) {
            this.toast.show(data.type as any, data.message);
          }
        } catch (e) {
          console.error('[WebSocket] خطا در پارس پیام دریافتی:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket] خطای اتصال سوکت:', err);
      };

      this.ws.onclose = (event) => {
        this.connected$.next(false);
        this.stopPing();
        this.ws = null;

        if (!this.isExplicitlyClosed && !this.isDestroyed) {
          this.scheduleReconnect();
        } else {
          console.log('[WebSocket] ارتباط به صورت صریح بسته شد.');
        }
      };
    } catch (err) {
      console.error('[WebSocket] خطا در راه‌اندازی سوکت:', err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearReconnectTimeout();
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected$.next(false);
  }

  /**
   * سوئیچ پویای کانال رویدادهای زنده قلمرو به ماژول فعال (Domain Isolation)
   */
  switchAppChannel(app: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // نام مستعار قلمروهای آفلاین (مثل personnel) به قلمرو اصلی؛ operations و بقیه دست‌نخورده
      const normalizedApp = resolveOfflineDbStrict(app) ? normalizeScope(app) : app;
      this.ws.send(JSON.stringify({
        type: 'switch_app',
        app: normalizedApp,
        tab_id: this.tabId
      }));
      console.log(`[WebSocket] 🔀 کانال رویدادهای زنده به قلمرو ${normalizedApp} تغییر یافت.`);
    }
  }

  /**
   * مخابره بلادرنگ رویداد خروج تب جاری روی وب‌سوکت
   */
  sendLogout(tabId?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'logout',
          tab_id: tabId || this.tabId
        }));
      } catch (e) {
        console.warn('[WebSocket] خطا در ارسال پیام خروج:', e);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isExplicitlyClosed || this.isDestroyed) return;

    // الگوریتم Exponential Backoff با شروع از 1 ثانیه تا سقف 20 ثانیه همراه با Jitter
    const delay = Math.min(
      this.maxDelay,
      this.baseDelay * Math.pow(1.5, this.reconnectAttempts)
    ) + Math.random() * 800;

    this.reconnectAttempts++;
    console.log(`[WebSocket] تلاش مجدد اتصال شماره ${this.reconnectAttempts} در ${Math.round(delay)} میلی‌ثانیه دیگر...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (e) {
          console.warn('[WebSocket] خطا در ارسال پکت Ping:', e);
        }
      }
    }, this.pingTimeMs);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
