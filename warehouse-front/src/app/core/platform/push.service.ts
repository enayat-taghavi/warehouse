import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  PushNotifications,
  PermissionStatus,
  Token,
  RegistrationError,
  ActionPerformed,
} from '@capacitor/push-notifications';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { isNativePlatform, getAppPlatform } from './platform';
import { APP_VERSION } from './app-version';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { NotificationNavigationContext } from '../modules/module-contract';

export const PUSH_TOKEN_STORAGE_KEY = 'wh_push_device_token';

export interface PushNotificationBridge {
  requestPermissions(): Promise<PermissionStatus>;
  checkPermissions(): Promise<PermissionStatus>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(eventName: 'registration', listenerFunc: (token: Token) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'registrationError', listenerFunc: (error: RegistrationError) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'pushNotificationActionPerformed', listenerFunc: (action: ActionPerformed) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const pushNotificationBridge: PushNotificationBridge = {
  requestPermissions: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.requestPermissions();
  },
  checkPermissions: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.checkPermissions();
  },
  register: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.register();
  },
  unregister: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.unregister();
  },
  addListener: (event: any, fn: any) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.addListener(event, fn);
  },
  removeAllListeners: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.PushNotifications ?? PushNotifications;
    return plugin.removeAllListeners();
  },
};

@Injectable({ providedIn: 'root' })
export class PushService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private moduleRegistry = inject(ModuleRegistryService);

  private currentToken: string | null = null;
  private listenersRegistered = false;

  constructor() {
    this.currentToken = this.getStoredToken();
  }

  /**
   * Returns current active push token (if registered).
   */
  getToken(): string | null {
    return this.currentToken || this.getStoredToken();
  }

  /**
   * Registers for push notifications (Native Android/iOS only).
   * Requests permission, registers with APNs/FCM, and posts token to backend.
   * Swallows and logs any runtime error (e.g. missing google-services.json).
   */
  async register(): Promise<void> {
    if (!isNativePlatform()) {
      return;
    }

    try {
      this.setupListeners();

      let permStatus = await pushNotificationBridge.checkPermissions();
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await pushNotificationBridge.requestPermissions();
      }

      if (permStatus.receive === 'granted') {
        await pushNotificationBridge.register();
      } else {
        console.warn('[PushService] Push notification permission not granted:', permStatus.receive);
      }
    } catch (err) {
      // Never block login or crash app when google-services.json is missing or permission fails
      console.warn('[PushService] Push registration failed (e.g. missing google-services.json):', err);
    }
  }

  /**
   * Deletes token from backend and unregisters push listeners (Native only).
   * Swallows any error to never block logout.
   */
  async deleteToken(): Promise<void> {
    if (!isNativePlatform()) {
      return;
    }

    const token = this.currentToken || this.getStoredToken();
    if (token) {
      try {
        const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
        const context = new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);

        this.http
          .delete(`${environment.apiUrl}/notifications/devices/`, {
            body: { token },
            headers,
            context,
          })
          .pipe(
            catchError((err) => {
              console.warn('[PushService] Failed to delete push device token on backend:', err);
              return of(null);
            })
          )
          .subscribe();
      } catch (err) {
        console.warn('[PushService] Error during deleteToken request:', err);
      }
    }

    this.clearStoredToken();
    this.currentToken = null;

    try {
      await pushNotificationBridge.removeAllListeners();
    } catch (err) {
      console.warn('[PushService] removeAllListeners error:', err);
    } finally {
      this.listenersRegistered = false;
    }
  }

  /**
   * Alias for deleteToken (used during session logout).
   */
  async unregister(): Promise<void> {
    await this.deleteToken();
  }

  private setupListeners(): void {
    if (this.listenersRegistered) {
      return;
    }
    this.listenersRegistered = true;

    try {
      pushNotificationBridge
        .addListener('registration', (token: Token) => {
          this.handleRegistrationSuccess(token?.value);
        })
        .catch((err) => {
          console.warn('[PushService] addListener registration error:', err);
        });

      pushNotificationBridge
        .addListener('registrationError', (error: RegistrationError) => {
          console.warn('[PushService] Push registrationError event:', error);
        })
        .catch((err) => {
          console.warn('[PushService] addListener registrationError error:', err);
        });

      pushNotificationBridge
        .addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
          this.handleNotificationTap(action);
        })
        .catch((err) => {
          console.warn('[PushService] addListener pushNotificationActionPerformed error:', err);
        });
    } catch (err) {
      console.warn('[PushService] setupListeners caught error:', err);
    }
  }

  handleRegistrationSuccess(tokenValue: string): void {
    if (!tokenValue || typeof tokenValue !== 'string') {
      return;
    }
    const cleanToken = tokenValue.trim();
    if (!cleanToken) {
      return;
    }

    this.currentToken = cleanToken;
    this.storeToken(cleanToken);

    const platform = getAppPlatform();
    const payload = {
      token: cleanToken,
      platform: platform === 'ios' ? 'ios' : 'android',
      app_version: APP_VERSION,
    };

    const headers = new HttpHeaders({ SKIP_GLOBAL_ERROR_TOAST: 'true' });
    const context = new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);

    this.http
      .post(`${environment.apiUrl}/notifications/devices/`, payload, { headers, context })
      .pipe(
        catchError((err) => {
          console.warn('[PushService] Backend device token registration error:', err);
          return of(null);
        })
      )
      .subscribe();
  }

  handleNotificationTap(action: ActionPerformed): void {
    try {
      const notif = action?.notification;
      const data = notif?.data ?? {};

      // ۱. اگر آدرس URL مستقیم در داده‌های اعلان وجود دارد
      const url = data.url || notif?.link || null;
      if (url) {
        this.router.navigateByUrl(url);
        return;
      }

      // ۲. بررسی هندلرهای ماژولار اعلان (target_model و target_id)
      const item: any = {
        id: data.notification_id ? Number(data.notification_id) : undefined,
        target_model: data.target_model || null,
        target_id: data.target_id || null,
        title: notif?.title || '',
        message: notif?.body || '',
        ...data,
      };

      let userPerms: string[] = [];
      let isSuperuser = false;
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('wh_user_profile') : null;
        if (raw) {
          const u = JSON.parse(raw);
          userPerms = u.permissions || [];
          isSuperuser = !!u.is_superuser || userPerms.includes('admin_all');
        }
      } catch {}

      const context: NotificationNavigationContext = {
        item,
        http: this.http,
        router: this.router,
        userPerms,
        isSuperuser,
      };

      let handled = false;
      const extensions = this.moduleRegistry.getExtensions('notificationHandlers');
      for (const entry of extensions) {
        for (const handler of entry.extension) {
          if (handler.canHandle(item)) {
            handler.navigate(context);
            handled = true;
            return;
          }
        }
      }

      // ۳. در غیر این صورت، هدایت به صفحه اعلان‌ها
      if (!handled) {
        this.router.navigate(['/notifications']);
      }
    } catch (err) {
      console.warn('[PushService] handleNotificationTap error:', err);
      try {
        this.router.navigate(['/notifications']);
      } catch {}
    }
  }

  private storeToken(token: string): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
      } catch {}
    }
  }

  private getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      } catch {}
    }
    return null;
  }

  private clearStoredToken(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      } catch {}
    }
  }
}
