import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SessionTabService, TabSessionMessage } from './session-tab.service';
import { detectClientDeviceModel, formatDeviceModelName } from '../utils/device-detector';
import { getAllOfflineDbs, DEFAULT_OFFLINE_SCOPE } from './offline-db';
import { NetworkStatusService } from './network-status.service';
import { ToastService } from '../../shared/components/toast/toast.component';
import { WebSocketService } from '../http/websocket.service';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { firstValueFrom } from 'rxjs';

export interface FleetSessionItem {
  id: number;
  user_id: number;
  username: string;
  user_full_name: string;
  tab_id: string;
  device_model: string;
  os_name: string;
  browser_name: string;
  ip_address: string;
  app_scope: string;
  active_role: string;
  pending_queue_count: number;
  conflict_count: number;
  is_revoked: boolean;
  is_online: boolean;
  is_current: boolean;
  last_heartbeat_iso: string;
  last_heartbeat_seconds_ago: number;
  created_at_iso: string;
}

export interface LocalTabTelemetry {
  tabId: string;
  deviceModel: string;
  appScope: string;
  activeRole: string;
  isCurrentTab: boolean;
  lastSeen: number;
}

@Injectable({
  providedIn: 'root'
})
export class ClientTelemetryService {
  private http = inject(HttpClient);
  private sessionTab = inject(SessionTabService);
  private network = NetworkStatusService.getInstance();
  private toast = inject(ToastService);
  private ws = inject(WebSocketService);

  private cachedDeviceModel: string | null = null;
  private heartbeatTimer: any = null;
  private localTabsMap = new Map<string, LocalTabTelemetry>();

  public localTabs = signal<LocalTabTelemetry[]>([]);

  constructor() {
    this.initDeviceDetection();
    this.initLocalTabBus();
    this.initWebSocketListener();
    this.startHeartbeatLoop();
  }

  /**
   * شنود رویدادهای زنده وب‌سوکت (ابطال بلادرنگ نشست توسط مدیر)
   */
  private initWebSocketListener(): void {
    this.ws.notifications$.subscribe((data: any) => {
      if (data?.type === 'session_revoked' || data?.type_str === 'session_revoked' || data?.event === 'session_revoked') {
        const revokedTab = data.revoked_tab_id || data.tab_id;
        if (revokedTab && revokedTab === this.sessionTab.tabId) {
          this.handleRevocationEnforcement();
        }
      }
    });
  }

  /**
   * شناسایی سخت‌افزاری و مدل دستگاه کلاینت
   */
  public async getDeviceInfo(): Promise<{ model: string; os: string; browser: string }> {
    if (!this.cachedDeviceModel) {
      try {
        const detected = await detectClientDeviceModel();
        if (detected && detected.trim()) {
          this.cachedDeviceModel = formatDeviceModelName(detected.trim());
        }
      } catch (e) {
        console.warn('[ClientTelemetry] Device detection fallback:', e);
      }
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let os = 'Unknown';
    if (ua.includes('Windows')) os = 'Windows PC';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'Unknown';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';

    let fallbackModel = 'پایانه کاربری';
    const isMobile = /Android|iPhone|iPod|Mobile/i.test(ua);
    const isTablet = /Tablet|iPad/i.test(ua);

    if (isTablet) {
      fallbackModel = os === 'iOS' ? 'تبلت اپل آیپد (iPadOS)' : 'تبلت اندروید';
    } else if (isMobile) {
      fallbackModel = os === 'iOS' ? 'گوشی هوشمند اپل آیفون' : 'گوشی هوشمند اندروید';
    } else if (os === 'Windows PC') {
      fallbackModel = 'رایانه رومیزی / لپ‌تاپ ویندوز';
    } else if (os === 'macOS') {
      fallbackModel = 'رایانه اپل مکینتاش (macOS)';
    } else if (os === 'Linux') {
      fallbackModel = 'رایانه رومیزی لینوکس';
    }

    const rawModel = this.cachedDeviceModel || fallbackModel;
    const model = formatDeviceModelName(rawModel);

    return { model, os, browser };
  }

  private async initDeviceDetection(): Promise<void> {
    await this.getDeviceInfo();
  }

  /**
   * پایش تب‌های محلی روی همین سیستم با استفاده از BroadcastChannel
   */
  private initLocalTabBus(): void {
    this.sessionTab.onMessage((msg: TabSessionMessage) => {
      // فقط به پیام‌های PING اولیه پاسخ یک‌باره PONG داده می‌شود (هرگز به PONG یا پیام دارای isReply پاسخی داده نمی‌شود)
      if (msg.type === 'PING' && !msg.payload?.isReply) {
        this.sessionTab.broadcastMessage('PONG', {
          deviceModel: this.cachedDeviceModel || 'این سیستم',
          appScope: this.sessionTab.getActiveApp(),
          activeRole: this.sessionTab.getActiveRole(),
          isReply: true
        });
      }

      // ثبت و به‌روزرسانی مشخصات تب‌های همسایه بر اساس پیام دریافتی (چه PING اولیه چه PONG)
      if (msg.type === 'PONG' || (msg.type === 'PING' && msg.payload)) {
        this.localTabsMap.set(msg.sourceTabId, {
          tabId: msg.sourceTabId,
          deviceModel: msg.payload.deviceModel || 'این سیستم',
          appScope: msg.payload.appScope || DEFAULT_OFFLINE_SCOPE,
          activeRole: msg.payload.activeRole || 'counter',
          isCurrentTab: false,
          lastSeen: Date.now()
        });
        this.updateLocalTabsSignal();
      }

      if (msg.type === 'AUTH_LOGOUT' && msg.payload?.reason === 'REVOKED') {
        this.handleRevocationEnforcement();
      }
    });

    // اعلان حضور تب جاری
    this.pingLocalTabs();
  }

  public pingLocalTabs(): void {
    // ثبت تب جاری
    this.localTabsMap.set(this.sessionTab.tabId, {
      tabId: this.sessionTab.tabId,
      deviceModel: this.cachedDeviceModel || 'این سیستم',
      appScope: this.sessionTab.getActiveApp(),
      activeRole: this.sessionTab.getActiveRole(),
      isCurrentTab: true,
      lastSeen: Date.now()
    });
    this.updateLocalTabsSignal();

    this.sessionTab.broadcastMessage('PING', {
      deviceModel: this.cachedDeviceModel || 'این سیستم',
      appScope: this.sessionTab.getActiveApp(),
      activeRole: this.sessionTab.getActiveRole(),
      isReply: false
    });
  }

  private updateLocalTabsSignal(): void {
    const now = Date.now();
    let hasDeleted = false;
    // حذف تب‌های بی‌صدا بعد از ۲ دقیقه
    for (const [id, tab] of this.localTabsMap.entries()) {
      if (!tab.isCurrentTab && now - tab.lastSeen > 120000) {
        this.localTabsMap.delete(id);
        hasDeleted = true;
      }
    }
    const currentList = this.localTabs();
    const newList = Array.from(this.localTabsMap.values());
    if (hasDeleted || currentList.length !== newList.length || !this.areTabListsEqual(currentList, newList)) {
      this.localTabs.set(newList);
    }
  }

  private areTabListsEqual(a: LocalTabTelemetry[], b: LocalTabTelemetry[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].tabId !== b[i].tabId || a[i].appScope !== b[i].appScope || a[i].activeRole !== b[i].activeRole) {
        return false;
      }
    }
    return true;
  }

  /**
   * حلقه ضربان قلب به سرور هر ۳۰ ثانیه
   */
  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    // ارسال پالس اولیه با اندکی تاخیر پس از لود
    setTimeout(() => {
      this.sendHeartbeat().catch(() => {});
    }, 3000);

    this.heartbeatTimer = setInterval(() => {
      if (this.network.isBrowserOnline && !this.network.isServerUnreachable) {
        this.sendHeartbeat().catch(() => {});
      }
    }, 30000);
  }

  /**
   * ارسال پالس زنده به سرور
   */
  public async sendHeartbeat(): Promise<boolean> {
    if (!this.network.isBrowserOnline || this.network.isServerUnreachable) return false;

    // بررسی وجود توکن ورود
    const token = this.sessionTab.getScopedAccessToken();
    if (!token) return false;

    try {
      const deviceInfo = await this.getDeviceInfo();

      // شمارش صف‌ها و تداخل‌های همهٔ دیتابیس‌های آفلاین (دو دیتابیس قفل‌شده و ماژول‌های دیگر)
      const perDb = await Promise.all(getAllOfflineDbs().map(db => Promise.all([
        db.syncQueue.where('status').anyOf(['pending', 'failed']).count().catch(() => 0),
        db.syncErrors.where('dismissed').equals(0).count().catch(() => 0),
      ])));
      const queueCount = perDb.reduce((acc, [q]) => acc + q, 0);
      const errorCount = perDb.reduce((acc, [, e]) => acc + e, 0);

      const payload = {
        tab_id: this.sessionTab.tabId,
        device_model: deviceInfo.model,
        os_name: deviceInfo.os,
        browser_name: deviceInfo.browser,
        app_scope: this.sessionTab.getActiveApp(),
        active_role: this.sessionTab.getActiveRole(),
        pending_queue_count: queueCount,
        conflict_count: errorCount
      };

      const res = await firstValueFrom(
        this.http.post<{ status: string; is_revoked: boolean }>(
          '/api/accounts/telemetry/heartbeat/',
          payload,
          {
            context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
          }
        )
      );

      return res?.status === 'ok';
    } catch (err: any) {
      if (err?.status === 403 && (err?.error?.error === 'SESSION_REVOKED' || err?.error?.detail?.includes('ابطال'))) {
        this.handleRevocationEnforcement();
      }
      return false;
    }
  }

  /**
   * واکشی فهرست زنده ناوگان تبلت‌ها و پایانه‌ها از سرور
   */
  public async getFleetSessions(): Promise<FleetSessionItem[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string; fleet: FleetSessionItem[] }>(
          `/api/accounts/telemetry/fleet/?tab_id=${this.sessionTab.tabId}`,
          {
            context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
          }
        )
      );
      return res?.fleet || [];
    } catch (e) {
      console.warn('[ClientTelemetry] Error fetching fleet:', e);
      return [];
    }
  }

  /**
   * ابطال نشست و اخراج اجباری تبلت توسط مدیر
   */
  public async revokeSession(sessionId: number): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ status: string; message: string }>(
          `/api/accounts/telemetry/sessions/${sessionId}/revoke/`,
          {},
          {
            context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
          }
        )
      );
      return { success: true, message: res?.message || 'نشست دستگاه با موفقیت ابطال شد.' };
    } catch (err: any) {
      const msg = err?.error?.detail || err?.error?.error || 'خطا در ابطال نشست دستگاه';
      return { success: false, message: msg };
    }
  }

  /**
   * اخراج اجباری در صورت ابطال نشست توسط سرور
   */
  private handleRevocationEnforcement(): void {
    this.toast.show('error', 'نشست این دستگاه توسط مدیر سیستم ابطال گردید. دسترسی به سامانه مسدود شد.');
    this.sessionTab.broadcastMessage('AUTH_LOGOUT', { reason: 'REVOKED' });
    this.sessionTab.clearTabSession();
    setTimeout(() => {
      window.location.href = '/login?revoked=1';
    }, 1500);
  }
}
