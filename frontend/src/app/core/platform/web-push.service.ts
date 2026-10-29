import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_OFFLINE } from '../interceptors/offline.interceptor';
import { SKIP_GLOBAL_ERROR_TOAST } from '../error/error.interceptor';
import { isServerUnreachable } from '../services/server-reachability';
import { isNativePlatform } from './platform';

/**
 * وضعیت اعلان وب (Web Push استاندارد، فقط وب/PWA؛ اپ نیتیو همچنان FCM دارد):
 *  - unsupported       مرورگر یا محیط پشتیبانی نمی‌کند (یا اپ نیتیو است)
 *  - ios-needs-install آیفون/آیپد: اعلان وب فقط پس از نصب روی صفحه اصلی کار می‌کند
 *  - blocked           کاربر اجازه اعلان را رد کرده است
 *  - off               پشتیبانی می‌شود ولی اشتراکی نیست
 *  - on                اشتراک فعال است
 */
export type WebPushState = 'unsupported' | 'ios-needs-install' | 'blocked' | 'off' | 'on';

export interface WebPushResult {
  ok: boolean;
  /** پیام فارسی برای نمایش به کاربر (toast)؛ در موفقیت هم پر می‌شود */
  messageFa: string;
}

export const WEB_PUSH_LOGOUT_TIMEOUT_MS = 3000;

const MSG_ENABLED = 'اعلان‌های این دستگاه روشن شد.';
const MSG_DISABLED = 'اعلان‌های این دستگاه خاموش شد.';
const MSG_UNSUPPORTED = 'این مرورگر از اعلان وب پشتیبانی نمی‌کند.';
const MSG_IOS_INSTALL = 'برای دریافت اعلان در آیفون، ابتدا برنامه را به صفحه اصلی اضافه کنید و از همان‌جا باز کنید.';
const MSG_BLOCKED = 'اجازه اعلان در مرورگر رد شده است. آن را از تنظیمات مرورگر برای این سایت فعال کنید.';
const MSG_SERVER_DISABLED = 'اعلان وب فعلاً روی سرور فعال نیست.';
const MSG_OFFLINE = 'به سرور دسترسی نیست. پس از برقراری اتصال دوباره تلاش کنید.';
const MSG_FAILED = 'روشن کردن اعلان انجام نشد. دوباره تلاش کنید.';
const MSG_DISABLE_FAILED = 'خاموش کردن اعلان انجام نشد. دوباره تلاش کنید.';

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ خودش را Macintosh معرفی می‌کند
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {}
  return (navigator as any).standalone === true;
}

@Injectable({ providedIn: 'root' })
export class WebPushService {
  private http = inject(HttpClient);
  private swPush = inject(SwPush, { optional: true });

  private readonly _state = signal<WebPushState>('unsupported');
  private readonly _busy = signal(false);
  private readonly _permission = signal<NotificationPermission | null>(null);
  private currentSub: PushSubscription | null = null;

  /** وضعیت فعلی اعلان وب */
  readonly state = this._state.asReadonly();
  /** در حال روشن/خاموش کردن */
  readonly busy = this._busy.asReadonly();
  /** مجوز اعلان مرورگر؛ null یعنی پشتیبانی نمی‌شود */
  readonly permission = this._permission.asReadonly();

  private readonly endpointUrl = `${environment.apiUrl}/notifications/webpush/subscriptions/`;
  private readonly keyUrl = `${environment.apiUrl}/notifications/webpush/key/`;

  constructor() {
    this.refreshState();
    if (this.isSupported() && this.swPush) {
      this.swPush.subscription.subscribe({
        next: (sub) => {
          this.currentSub = sub;
          this.refreshState();
        },
        error: () => {},
      });
    }
  }

  /** وب/PWA با Service Worker فعال و Push API؛ اپ نیتیو همیشه false */
  isSupported(): boolean {
    if (isNativePlatform()) return false;
    if (typeof window === 'undefined') return false;
    return !!this.swPush?.isEnabled && 'PushManager' in window && 'Notification' in window;
  }

  /** محاسبه دوباره وضعیت از مجوز مرورگر و اشتراک فعلی */
  refreshState(): void {
    if (!this.isSupported()) {
      this._permission.set(null);
      this._state.set('unsupported');
      return;
    }
    const perm = Notification.permission;
    this._permission.set(perm);
    if (isIosDevice() && !isStandalone()) {
      this._state.set('ios-needs-install');
    } else if (perm === 'denied') {
      this._state.set('blocked');
    } else if (this.currentSub && perm === 'granted') {
      this._state.set('on');
    } else {
      this._state.set('off');
    }
  }

  /**
   * روشن کردن اعلان وب.
   * باید مستقیماً از رویداد کاربر (click) صدا زده شود؛ مرورگرها (به‌ویژه Safari)
   * درخواست مجوز بیرون از user gesture را رد می‌کنند.
   * هرگز reject نمی‌شود؛ نتیجه را با پیام فارسی برمی‌گرداند.
   */
  async enable(): Promise<WebPushResult> {
    if (!this.isSupported() || !this.swPush) {
      this.refreshState();
      return { ok: false, messageFa: MSG_UNSUPPORTED };
    }
    this.refreshState();
    if (this._state() === 'ios-needs-install') return { ok: false, messageFa: MSG_IOS_INSTALL };
    if (this._state() === 'blocked') return { ok: false, messageFa: MSG_BLOCKED };

    this._busy.set(true);
    try {
      let publicKey = '';
      try {
        const res = await firstValueFrom(
          this.http.get<{ public_key?: string }>(this.keyUrl, { context: this.ctx() })
        );
        publicKey = (res?.public_key || '').trim();
      } catch (err) {
        return { ok: false, messageFa: this.httpErrorMessage(err, MSG_FAILED) };
      }
      if (!publicKey) {
        this.refreshState();
        return { ok: false, messageFa: MSG_SERVER_DISABLED };
      }

      let sub: PushSubscription;
      try {
        sub = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      } catch {
        this.refreshState();
        if (this._state() === 'blocked') return { ok: false, messageFa: MSG_BLOCKED };
        return { ok: false, messageFa: MSG_FAILED };
      }

      try {
        await firstValueFrom(this.http.post(this.endpointUrl, sub.toJSON(), { context: this.ctx() }));
      } catch (err) {
        // سرور اشتراک را نپذیرفت؛ اشتراک محلی هم برداشته می‌شود تا وضعیت یکدست بماند
        try {
          await this.swPush.unsubscribe();
        } catch {}
        this.currentSub = null;
        this.refreshState();
        return { ok: false, messageFa: this.httpErrorMessage(err, MSG_FAILED) };
      }

      this.currentSub = sub;
      this.refreshState();
      return { ok: true, messageFa: MSG_ENABLED };
    } finally {
      this._busy.set(false);
    }
  }

  /** خاموش کردن اعلان وب: حذف از سرور (۴۰۴ هم قبول) و لغو اشتراک محلی در هر حال */
  async disable(): Promise<WebPushResult> {
    if (!this.isSupported() || !this.swPush) {
      this.refreshState();
      return { ok: false, messageFa: MSG_UNSUPPORTED };
    }
    this._busy.set(true);
    try {
      const endpoint = this.currentSub?.endpoint;
      if (endpoint) {
        try {
          await firstValueFrom(
            this.http.delete(this.endpointUrl, { body: { endpoint }, context: this.ctx() })
          );
        } catch {
          // ۴۰۴ یا قطعی شبکه: اشتراک محلی به‌هرحال لغو می‌شود
        }
      }
      let unsubscribed = true;
      try {
        await this.swPush.unsubscribe();
      } catch {
        unsubscribed = !this.currentSub;
      }
      if (unsubscribed) this.currentSub = null;
      this.refreshState();
      return unsubscribed ? { ok: true, messageFa: MSG_DISABLED } : { ok: false, messageFa: MSG_DISABLE_FAILED };
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * پس از ورود یا شروع برنامه (کاربر واردشده): اگر مجوز داده شده و اشتراک هست،
   * دوباره به سرور فرستاده می‌شود (انتقال مالکیت به کاربر فعلی؛ جایگزین pushsubscriptionchange).
   * خطاها بی‌صدا هستند.
   */
  async syncOnStart(): Promise<void> {
    try {
      if (!this.isSupported() || !this.swPush) return;
      if (Notification.permission !== 'granted') return;
      const sub = this.currentSub ?? (await this.readSubscription());
      if (!sub) return;
      this.currentSub = sub;
      this.refreshState();
      await firstValueFrom(this.http.post(this.endpointUrl, sub.toJSON(), { context: this.ctx() }));
    } catch {
      // بی‌صدا
    }
  }

  /**
   * هنگام خروج: حذف اشتراک از سرور و لغو محلی، با سقف کل حدود ۳ ثانیه.
   * درخواست DELETE همین‌جا و به‌صورت همگام شروع می‌شود تا هدر احراز هویت
   * پیش از پاک شدن نشست گرفته شود. هرگز reject نمی‌شود.
   */
  unsubscribeOnLogout(): Promise<void> {
    try {
      if (!this.isSupported() || !this.swPush) return Promise.resolve();
      const sub = this.currentSub;
      if (!sub) return Promise.resolve();
      const swPush = this.swPush;

      const deleteDone = new Promise<void>((resolve) => {
        try {
          this.http
            .delete(this.endpointUrl, { body: { endpoint: sub.endpoint }, context: this.ctx() })
            .subscribe({ next: () => {}, error: () => resolve(), complete: () => resolve() });
        } catch {
          resolve();
        }
      });

      const work = deleteDone
        .then(() => swPush.unsubscribe())
        .catch(() => {})
        .then(() => {
          this.currentSub = null;
          this.refreshState();
        })
        .catch(() => {});

      const timeout = new Promise<void>((resolve) => setTimeout(resolve, WEB_PUSH_LOGOUT_TIMEOUT_MS));
      return Promise.race([work, timeout]).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  private async readSubscription(): Promise<PushSubscription | null> {
    if (!this.swPush) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WEB_PUSH_LOGOUT_TIMEOUT_MS));
    return Promise.race([firstValueFrom(this.swPush.subscription).catch(() => null), timeout]);
  }

  private ctx(): HttpContext {
    return new HttpContext().set(SKIP_OFFLINE, true).set(SKIP_GLOBAL_ERROR_TOAST, true);
  }

  private httpErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (isServerUnreachable(err.status)) return MSG_OFFLINE;
      const detail = (err.error as any)?.detail;
      // سرور در دسترس بود و درخواست را رد کرد (مثلاً میزبان پوش مجاز نیست): پیام فارسی خود سرور
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
    }
    return fallback;
  }
}
