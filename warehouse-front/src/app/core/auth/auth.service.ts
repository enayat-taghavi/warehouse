import { Injectable, signal, computed, inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, of, from, throwError, tap, catchError, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { offlineDb } from '../services/offline-db';
import {
  AuthTokens,
  LoginPayload,
  LoginResponse,
  AuthUserProfile,
} from '../models/api-response.model';
import { detectClientDeviceModel } from '../utils/device-detector';
import { SessionTabService } from '../services/session-tab.service';
import { WebSocketService } from '../http/websocket.service';

const TOKEN_KEY = 'wh_access_token';
const REFRESH_KEY = 'wh_refresh_token';
const USER_KEY = 'wh_user_profile';

/**
 * سرویس احراز هویت — آماده JWT
 * فعلاً با mock data کار می‌کند و با سوئیچ environment.useMockData به API واقعی وصل می‌شود
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** سیگنال‌های reactive */
  private readonly _user = signal<AuthUserProfile | null>(this.loadUserFromStorage());
  private readonly _isLoading = signal(false);

  /** computed signals — قابل خواندن توسط تمام کامپوننت‌ها */
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isLoading = this._isLoading.asReadonly();
  readonly userName = computed(() => {
    const u = this._user();
    return u ? `${u.first_name} ${u.last_name}` : '';
  });
  readonly userAvatar = computed(() => this._user()?.avatar_letter ?? '');
  readonly userAvatarUrl = computed(() => this._user()?.avatar ?? null);
  readonly userDepartment = computed(() => this._user()?.department ?? '');
  readonly userRoleTitles = computed(() => this._user()?.role_titles ?? []);
  readonly userPermissions = computed(() => this._user()?.permissions ?? []);
  readonly isSuperuser = computed(() => this._user()?.is_superuser === true);

  updateUserAvatar(avatarUrl: string | null) {
    const current = this._user();
    if (current) {
      const finalAvatar = avatarUrl ? (avatarUrl.includes('?') ? avatarUrl : `${avatarUrl}?t=${Date.now()}`) : null;
      const updated = { ...current, avatar: finalAvatar };
      this._user.set(updated);
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  }

  /** Mock database — فقط در حالت useMockData */
  private readonly mockUsers: Record<string, any> = {
    saman_admin: {
      password: '123456',
      profile: {
        id: 1, username: 'saman_admin', first_name: 'سامان', last_name: 'تقوی سوق',
        avatar_letter: 'س', department: 'admin', role_titles: ['مدیریت کل سیستم (Admin)'], roles: ['admin'],
        permissions: ['perm_sys_settings', 'perm_sys_logs', 'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze', 'perm_rec_import', 'perm_rec_dispatch', 'perm_rec_label', 'perm_rec_recount', 'perm_usr_add', 'perm_usr_edit', 'perm_usr_role'],
      },
    },
    heydari_manager: {
      password: '123456',
      profile: {
        id: 2, username: 'heydari_manager', first_name: 'ناصر', last_name: 'حیدری',
        avatar_letter: 'ح', department: 'management', role_titles: ['مدیریت پروژه'], roles: ['manager'],
        permissions: ['perm_wh_edit', 'perm_rec_dispatch', 'perm_rec_recount'],
      },
    },
    ghasemi_exec: {
      password: '123456',
      profile: {
        id: 3, username: 'ghasemi_exec', first_name: 'علی', last_name: 'قاسمی',
        avatar_letter: 'ع', department: 'execution', role_titles: ['سرپرست اجرا'], roles: ['supervisor'],
        permissions: ['perm_rec_label'],
      } as any,
    },
    rezaei_docs: {
      password: '123456',
      profile: {
        id: 4, username: 'rezaei_docs', first_name: 'فاطمه', last_name: 'رضایی',
        avatar_letter: 'ف', department: 'documents', role_titles: ['کارشناس مدارک'], roles: ['document_expert'],
        permissions: [],
      },
    },
    karimi_feed: {
      password: '123456',
      profile: {
        id: 5, username: 'karimi_feed', first_name: 'حسین', last_name: 'کریمی',
        avatar_letter: 'ه', department: 'feeding', role_titles: ['اپراتور تغذیه MT'], roles: ['feeding_operator'],
        permissions: [],
      },
    },
  };

  constructor(
    private router: Router,
    private http: HttpClient,
    private sessionTab: SessionTabService
  ) {
    this.sessionTab.onMessage((msg) => {
      if (msg.type === 'AUTH_LOGOUT') {
        this.handleRemoteLogout();
      }
    });
  }

  private handleRemoteLogout(): void {
    this.sessionTab.clearTabSession();
    this.removeItem(TOKEN_KEY);
    this.removeItem(REFRESH_KEY);
    this.removeItem(USER_KEY);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  /** لاگین — mock یا API واقعی */
  login(username: string, password: string, deviceModel?: string): Observable<LoginResponse> {
    this._isLoading.set(true);

    if (environment.useMockData) {
      return this.mockLogin(username, password);
    }

    const doLogin = (detectedModel?: string) => {
      const payload: any = { username, password };
      const finalModel = deviceModel || detectedModel;
      if (finalModel) {
        payload.device_model = finalModel;
      }

      return this.http
        .post<LoginResponse>(`${environment.apiUrl}/auth/login/`, payload, {
          context: new HttpContext().set(SKIP_OFFLINE, true),
        })
        .pipe(
          tap((response) => this.handleLoginSuccess(response)),
          catchError((err) => {
            this._isLoading.set(false);
            return throwError(() => err);
          })
        );
    };

    if (!deviceModel) {
      return from(detectClientDeviceModel()).pipe(
        switchMap((detected: string) => doLogin(detected))
      );
    }

    return doLogin(deviceModel);
  }

  /** ثبت حضور فعال روزانه کاربر (یک‌بار در هر روز تقویمی) */
  sendDailyHeartbeat(): void {
    if (environment.useMockData || !this.isLoggedIn()) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const lastHeartbeat = this.getItem('last_daily_heartbeat');
    if (lastHeartbeat === todayStr) return;

    const authContext = new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);

    detectClientDeviceModel().then((deviceModel) => {
      const body = deviceModel ? { device_model: deviceModel } : {};
      this.http
        .post(`${environment.apiUrl}/auth/login-logs/heartbeat/`, body, { context: authContext })
        .pipe(catchError(() => of(null)))
        .subscribe(() => {
          this.setItem('last_daily_heartbeat', todayStr);
        });
    }).catch(() => {
      this.http
        .post(`${environment.apiUrl}/auth/login-logs/heartbeat/`, {}, { context: authContext })
        .pipe(catchError(() => of(null)))
        .subscribe(() => {
          this.setItem('last_daily_heartbeat', todayStr);
        });
    });
  }

  private injector = inject(Injector);

  /** لاگ‌اوت */
  logout(): void {
    // ۱. مخابره بلادرنگ خروج از طریق وب‌سوکت جهت حذف آنی سشن و به‌روزرسانی ناوگان
    try {
      const ws = this.injector.get(WebSocketService);
      ws?.sendLogout(this.sessionTab.tabId);
    } catch {}

    // ۲. ارسال درخواست خروج رسمی به سرور همراه با شناسه تب جهت ابطال سشن
    try {
      const token = this.getItem(TOKEN_KEY);
      if (token) {
        this.http.post(`${environment.apiUrl}/auth/logout/`, { tab_id: this.sessionTab.tabId }, {
          headers: { 'X-Client-Tab-Id': this.sessionTab.tabId },
          context: new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true)
        }).subscribe({ error: () => {} });
      }
    } catch {}

    this.clearAuth();
    offlineDb.clearServerDerivedCaches().catch(() => {});
    this.router.navigate(['/login']);
  }

  /** رفرش توکن — خودکار توسط interceptor */
  refreshToken(): Observable<string> {
    const refresh = this.getItem(REFRESH_KEY);
    if (!refresh) {
      this.clearAuth();
      this.router.navigate(['/login']);
      return throwError(() => new Error('No refresh token'));
    }

    if (environment.useMockData) {
      return of('mock-access-token-refreshed');
    }

    return this.http
      .post<{ access: string; refresh?: string }>(`${environment.apiUrl}/auth/refresh/`, { refresh }, {
        context: new HttpContext().set(SKIP_OFFLINE, true),
      })
      .pipe(
        tap((response) => {
          this.setItem(TOKEN_KEY, response.access);
          if (response.refresh) {
            this.setItem(REFRESH_KEY, response.refresh);
          }
        }),
        catchError((err) => {
          // نشست فقط با «رد صریح سرور» (4xx) پایان می‌یابد. اگر به سرور نرسیدیم
          // (قطع شبکه/تونل — status 0/5xx/530) کاربر وسط کار میدانی بیرون
          // انداخته نمی‌شود؛ آفلاین اصلاً امکان ورود مجدد وجود ندارد.
          const status = err?.status ?? 0;
          if (status >= 400 && status < 500) {
            this.clearAuth();
            this.router.navigate(['/login']);
          }
          return throwError(() => err);
        }),
        map((response) => response.access),
      );
  }

  /**
   * تبادل زنده قلمرو فعال توکن (Live App-Scope Token Exchange)
   * صدور و جایگزینی آنی توکن امضاشده برای سامانه مقصد (warehouse یا finance)
   */
  switchAppScope(targetApp: 'warehouse' | 'finance'): Observable<any> {
    if (environment.useMockData) {
      return of({ success: true, active_app: targetApp });
    }

    return this.http
      .post<{
        success: boolean;
        active_app: string;
        allowed_apps: string[];
        tokens: { access: string; refresh: string };
      }>(
        `${environment.apiUrl}/auth/token/switch-app/`,
        { app: targetApp, target_app: targetApp },
        { context: new HttpContext().set(SKIP_OFFLINE, true) }
      )
      .pipe(
        tap((response) => {
          if (response?.tokens?.access) {
            this.sessionTab.setScopedAccessToken(response.tokens.access, targetApp);
            this.setItem(TOKEN_KEY, response.tokens.access);
          }
          if (response?.tokens?.refresh) {
            this.setItem(REFRESH_KEY, response.tokens.refresh);
          }
          const u = this._user();
          if (u) {
            const updated = {
              ...u,
              allowed_apps: response.allowed_apps || u.allowed_apps,
            };
            this._user.set(updated);
            this.setItem(USER_KEY, JSON.stringify(updated));
          }
        }),
        catchError((err) => {
          console.warn('[AuthService] خطا در سوئیچ قلمرو توکن:', err);
          return throwError(() => err);
        })
      );
  }

  /** دریافت access token فعلی متناسب با قلمرو فعال تب (Multi-Tab Multi-App Isolation) */
  getAccessToken(preferredScope?: 'warehouse' | 'finance'): string | null {
    return this.sessionTab.getScopedAccessToken(preferredScope) || this.getItem(TOKEN_KEY);
  }

  /** بررسی دسترسی */
  hasPermission(permCode: string): boolean {
    const perms = this.userPermissions();
    return perms.includes('admin_all') || perms.includes(permCode);
  }

  /** بررسی نقش (department) */
  hasDepartment(dept: string): boolean {
    return this.userDepartment() === dept;
  }

  /** به‌روزرسانی مشخصات کاربر جاری در سیگنال و ذخیره‌سازی محلی */
  updateUser(partial: Partial<AuthUserProfile>): void {
    const u = this._user();
    if (u) {
      const updated = { ...u, ...partial };
      this._user.set(updated);
      this.setItem(USER_KEY, JSON.stringify(updated));
    }
  }

  // ────────── Preferences ──────────
  
  updatePreferences(prefs: any): Observable<any> {
    if (environment.useMockData) {
      const u = this._user();
      if (u) {
        u.ui_preferences = { ...u.ui_preferences, ...prefs };
        this._user.set({ ...u });
        this.setItem(USER_KEY, JSON.stringify(u));
      }
      return of({ status: 'success', preferences: u?.ui_preferences });
    }

    return this.http.post(`${environment.apiUrl}/auth/users/update_preferences/`, { preferences: prefs }).pipe(
      tap((res: any) => {
        const u = this._user();
        if (u) {
          u.ui_preferences = res.preferences;
          this._user.set({ ...u });
          this.setItem(USER_KEY, JSON.stringify(u));
        }
      })
    );
  }

  // ────────── Storage Helpers ──────────

  private setItem(key: string, value: string): void {
    if (typeof window !== 'undefined') {
      try { sessionStorage.setItem(key, value); } catch {}
      try { localStorage.setItem(key, value); } catch {}
    }
  }

  private getItem(key: string): string | null {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    }
    return null;
  }

  private removeItem(key: string): void {
    if (typeof window !== 'undefined') {
      try { sessionStorage.removeItem(key); } catch {}
      try { localStorage.removeItem(key); } catch {}
    }
  }

  // ────────── Private ──────────

  private mockLogin(username: string, password: string): Observable<LoginResponse> {
    return new Observable((subscriber) => {
      setTimeout(() => {
        const account = this.mockUsers[username];
        if (account && account.password === password) {
          const response: LoginResponse = {
            tokens: { access: 'mock-access-token', refresh: 'mock-refresh-token' },
            user: account.profile,
          };
          this.handleLoginSuccess(response);
          subscriber.next(response);
          subscriber.complete();
        } else {
          this._isLoading.set(false);
          subscriber.error({ detail: 'نام کاربری یا رمز عبور نادرست است.' });
        }
      }, 800);
    });
  }

  private handleLoginSuccess(response: LoginResponse): void {
    // چرخش امنیتی شناسه سشن تب با هر لاگین موفق (Session Rotation on Authentication)
    this.sessionTab.rotateTabId();

    const access = response.tokens.access;
    this.sessionTab.setScopedAccessToken(access);
    const allowed = response.user.allowed_apps || [];
    if (allowed.includes('warehouse')) {
      this.sessionTab.setScopedAccessToken(access, 'warehouse');
    }
    if (allowed.includes('finance') || allowed.includes('personnel')) {
      this.sessionTab.setScopedAccessToken(access, 'finance');
    }

    this.setItem(TOKEN_KEY, access);
    this.setItem(REFRESH_KEY, response.tokens.refresh);
    this.setItem(USER_KEY, JSON.stringify(response.user));
    this._user.set(response.user);
    this._isLoading.set(false);
  }

  private clearAuth(): void {
    this.sessionTab.clearTabSession();
    this.sessionTab.broadcastMessage('AUTH_LOGOUT');
    this.removeItem(TOKEN_KEY);
    this.removeItem(REFRESH_KEY);
    this.removeItem(USER_KEY);
    this.removeItem('active_company_id');
    this.removeItem('active_company_data');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('active_company_id');
      sessionStorage.removeItem('active_company_data');
    }
    this._user.set(null);
  }

  private loadUserFromStorage(): AuthUserProfile | null {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(USER_KEY) : null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
