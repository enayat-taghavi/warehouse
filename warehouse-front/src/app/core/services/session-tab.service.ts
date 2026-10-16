import { Injectable, signal } from '@angular/core';
import { getModuleRegistry } from '../modules/module-registry.service';

export type AppModuleScope = 'warehouse' | 'personnel' | 'operations' | string;

export interface TabSessionMessage {
  type: 'AUTH_LOGOUT' | 'PROFILE_UPDATED' | 'SCOPE_CHANGED' | 'PING' | 'PONG';
  sourceTabId: string;
  payload?: any;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class SessionTabService {
  private readonly TAB_ID_KEY = 'wh_tab_session_id';
  private readonly APP_MODULE_KEY = 'active_app_module';
  private readonly ROLE_PERSONA_KEY = 'active_role_persona';
  private readonly TOKEN_KEY = 'wh_access_token';
  private readonly CHANNEL_NAME = 'wh_enterprise_multi_tab_bus';

  private broadcastChannel: BroadcastChannel | null = null;
  private _tabId: string = '';

  public get tabId(): string {
    if (!this._tabId) {
      this._tabId = this.initTabId();
    }
    return this._tabId;
  }

  constructor() {
    this._tabId = this.initTabId();
    this.initBroadcastChannel();
  }

  /**
   * راه‌اندازی و بازیابی شناسه سشن مستقل تب مرورگر (Tab-Scoped Session ID)
   */
  public initTabId(): string {
    if (typeof window === 'undefined') return 'tab_server';
    try {
      let id = sessionStorage.getItem(this.TAB_ID_KEY);
      if (!id) {
        id = 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        sessionStorage.setItem(this.TAB_ID_KEY, id);
      }
      return id;
    } catch {
      return 'tab_fallback_' + Date.now().toString(36);
    }
  }

  /**
   * چرخش و تولید شناسه سشن تازه برای تب (Session ID Rotation)
   * جهت جلوگیری از انتقال وضعیت‌های ابطال‌شده قبلی به لاگین‌های جدید
   */
  public rotateTabId(): string {
    if (typeof window === 'undefined') return 'tab_server';
    const newId = 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    try {
      sessionStorage.setItem(this.TAB_ID_KEY, newId);
    } catch {}
    this._tabId = newId;
    return newId;
  }

  /**
   * دریافت قلمرو فعال تب با اولویت حافظه تب، سپس کانتکست آدرس صفحه و نهایتاً پیش‌فرض سراسری
   */
  public getActiveApp(): AppModuleScope {
    if (typeof window === 'undefined') return 'personnel';
    try {
      const tabScoped = sessionStorage.getItem(this.APP_MODULE_KEY) as AppModuleScope | null;
      if (tabScoped && (tabScoped === 'warehouse' || tabScoped === 'personnel' || tabScoped === 'operations')) {
        return tabScoped;
      }

      // اگر تب به تازگی با یک آدرس مستقیم باز شده است:
      const path = window.location.pathname;
      if (path.includes('/app/operations')) {
        this.setActiveApp('operations');
        return 'operations';
      }

      for (const mod of getModuleRegistry().getInstalledModules()) {
        const appKey = mod.extensions?.launcherTile?.appKey;
        if (path.includes(mod.routePrefix) && appKey) {
          this.setActiveApp(appKey);
          return appKey;
        }
      }

      const globalFallback = (localStorage.getItem(this.APP_MODULE_KEY) as AppModuleScope) || 'personnel';
      sessionStorage.setItem(this.APP_MODULE_KEY, globalFallback);
      return globalFallback;
    } catch {
      return 'personnel';
    }
  }

  /**
   * ثبت قلمرو فعال به صورت ایزوله در سشن تب و ذخیره نسخه پشتیبان سراسری
   */
  public setActiveApp(app: AppModuleScope): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(this.APP_MODULE_KEY, app);
      localStorage.setItem(this.APP_MODULE_KEY, app);
    } catch (e) {
      console.warn('[SessionTabService] Storage write error:', e);
    }
  }

  /**
   * دریافت نقش فعال مختص این تب
   */
  public getActiveRole(): string {
    if (typeof window === 'undefined') return 'operator';
    try {
      return (
        sessionStorage.getItem(this.ROLE_PERSONA_KEY) ||
        localStorage.getItem(this.ROLE_PERSONA_KEY) ||
        'operator'
      );
    } catch {
      return 'operator';
    }
  }

  /**
   * تنظیم نقش فعال مختص این تب
   */
  public setActiveRole(roleCode: string): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(this.ROLE_PERSONA_KEY, roleCode);
      localStorage.setItem(this.ROLE_PERSONA_KEY, roleCode);
    } catch (e) {
      console.warn('[SessionTabService] Role storage write error:', e);
    }
  }

  /**
   * استخراج توکن دسترسی متناسب با قلمرو فعال تب (Domain-Isolated Token Extraction)
   * از نشت توکن مالی به درخواست‌های انبار یا برعکس در تب‌های همزمان جلوگیری می‌کند.
   */
  public getScopedAccessToken(targetScope?: 'warehouse' | 'finance' | 'personnel'): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const scope = targetScope || this.getActiveApp();
      const normScope = scope === 'personnel' || scope === 'finance' ? 'finance' : 'warehouse';

      // ۱. توکن تفکیک‌شده قلمرو در سشن تب
      const tabScoped = sessionStorage.getItem(`${this.TOKEN_KEY}_${normScope}`);
      if (tabScoped) return tabScoped;

      // ۲. توکن فعال سشن تب
      const tabActive = sessionStorage.getItem(this.TOKEN_KEY);
      if (tabActive) return tabActive;

      // ۳. توکن تفکیک‌شده در حافظه سراسری
      const globalScoped = localStorage.getItem(`${this.TOKEN_KEY}_${normScope}`);
      if (globalScoped) return globalScoped;

      // ۴. توکن سراسری
      return localStorage.getItem(this.TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * ذخیره‌سازی توکن تفکیک‌شده برای قلمرو بدون اختلال در سایر تب‌های مرورگر
   */
  public setScopedAccessToken(token: string, scope?: 'warehouse' | 'finance' | 'personnel'): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.TOKEN_KEY, token);

      if (scope) {
        const normScope = scope === 'personnel' || scope === 'finance' ? 'finance' : 'warehouse';
        sessionStorage.setItem(`${this.TOKEN_KEY}_${normScope}`, token);
        localStorage.setItem(`${this.TOKEN_KEY}_${normScope}`, token);
      }
    } catch (e) {
      console.warn('[SessionTabService] Token storage write error:', e);
    }
  }

  /**
   * پاکسازی نشست امنیتی تب
   */
  public clearTabSession(): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(`${this.TOKEN_KEY}_warehouse`);
      sessionStorage.removeItem(`${this.TOKEN_KEY}_finance`);
      sessionStorage.removeItem(this.APP_MODULE_KEY);
      sessionStorage.removeItem(this.ROLE_PERSONA_KEY);
      this.rotateTabId();
    } catch {}
  }

  /**
   * راه‌اندازی کانال پیام‌رسانی میان‌تبی (BroadcastChannel) جهت هماهنگی خروج سراسری و امنیت
   */
  private initBroadcastChannel(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.broadcastChannel = new BroadcastChannel(this.CHANNEL_NAME);
    } catch (e) {
      console.warn('[SessionTabService] BroadcastChannel init failed:', e);
    }
  }

  /**
   * ارسال رویداد امنیتی به سایر تب‌ها (مثلاً خروج کاربر)
   */
  public broadcastMessage(type: TabSessionMessage['type'], payload?: any): void {
    if (!this.broadcastChannel) return;
    try {
      const msg: TabSessionMessage = {
        type,
        sourceTabId: this.tabId,
        payload,
        timestamp: Date.now()
      };
      this.broadcastChannel.postMessage(msg);
    } catch (e) {
      console.warn('[SessionTabService] Broadcast post failed:', e);
    }
  }

  /**
   * گوش فرا دادن به رویدادهای سایر تب‌ها
   */
  public onMessage(callback: (msg: TabSessionMessage) => void): () => void {
    if (!this.broadcastChannel) return () => {};
    const listener = (event: MessageEvent) => {
      if (event.data && event.data.sourceTabId !== this.tabId) {
        callback(event.data as TabSessionMessage);
      }
    };
    this.broadcastChannel.addEventListener('message', listener);
    return () => {
      this.broadcastChannel?.removeEventListener('message', listener);
    };
  }
}
