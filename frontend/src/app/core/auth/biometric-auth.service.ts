import { Injectable } from '@angular/core';
import { isNativePlatform } from '../platform/platform';

export interface BiometricCredentials {
  username: string;
  password: string;
}

export interface BiometricAuthResult {
  success: boolean;
  username?: string;
  password?: string;
  error?: string;
}

export interface NativeBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; enrolled: boolean; reason?: string }>;
  hasSavedCredentials(): Promise<{ hasSaved: boolean; username?: string }>;
  saveCredentials(options: { username: string; password: string }): Promise<{ success: boolean }>;
  authenticate(options?: { title?: string; subtitle?: string; cancelButtonText?: string }): Promise<BiometricAuthResult>;
  clearCredentials(): Promise<{ success: boolean }>;
}

/**
 * کلیدهای نسخهٔ قبلی ورود بیومتریک وب. در آن نسخه کلید رمزگشایی از یک متن ثابت و نام کاربری
 * ساخته می‌شد و همه‌چیز در localStorage بود؛ یعنی رمز بدون اثر انگشت هم باز می‌شد.
 * ورود بیومتریک در وب خاموش است و این کلیدها فقط برای پاک‌سازی نگه داشته شده‌اند.
 */
const LEGACY_WEB_BIO_KEYS = [
  'bio_web_cipher',
  'bio_web_iv',
  'bio_web_username',
  'bio_web_salt',
  'bio_web_credential_id',
];

function purgeLegacyWebCredentials(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of LEGACY_WEB_BIO_KEYS) {
      localStorage.removeItem(key);
    }
  } catch { }
}

/**
 * ورود بیومتریک فقط در برنامهٔ اندروید (Capacitor) فعال است؛ رمز آنجا با کلید Android Keystore
 * رمز می‌شود و در حافظهٔ خصوصی برنامه می‌ماند. در وب و PWA جای امنی برای رمز وجود ندارد،
 * پس ذخیرهٔ رمز به مدیر رمز مرورگر سپرده می‌شود.
 */
@Injectable({
  providedIn: 'root'
})
export class BiometricAuthService {

  private getNativePlugin(): NativeBiometricPlugin | null {
    if (!isNativePlatform()) return null;
    if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.BiometricAuth) {
      return (window as any).Capacitor.Plugins.BiometricAuth as NativeBiometricPlugin;
    }
    return null;
  }

  /**
   * بررسی پشتیبانی دستگاه از احراز هویت بیومتریک (فقط اندروید)
   */
  async isAvailable(): Promise<boolean> {
    const plugin = this.getNativePlugin();
    if (!plugin) return false;
    try {
      const res = await plugin.isAvailable();
      return !!(res.available && res.enrolled);
    } catch (err) {
      console.warn('[BiometricAuth] Native availability check error:', err);
      return false;
    }
  }

  /**
   * بررسی وجود اعتبارنامهٔ بیومتریک ذخیره‌شده
   */
  async hasSavedCredentials(): Promise<boolean> {
    const plugin = this.getNativePlugin();
    if (!plugin) {
      purgeLegacyWebCredentials();
      return false;
    }
    try {
      const res = await plugin.hasSavedCredentials();
      return !!res.hasSaved;
    } catch (err) {
      console.warn('[BiometricAuth] Native hasSavedCredentials error:', err);
      return false;
    }
  }

  /**
   * دریافت نام کاربری ذخیره‌شده برای بیومتریک (در صورت وجود)
   */
  async getSavedUsername(): Promise<string | null> {
    const plugin = this.getNativePlugin();
    if (!plugin) return null;
    try {
      const res = await plugin.hasSavedCredentials();
      return res.username || null;
    } catch {
      return null;
    }
  }

  /**
   * ذخیره‌سازی امن نام کاربری و رمز عبور پس از ورود موفق (فقط با رضایت کاربر صدا زده می‌شود)
   */
  async saveCredentials(username: string, password: string): Promise<boolean> {
    const cleanUser = username?.trim();
    if (!cleanUser || !password) return false;

    const plugin = this.getNativePlugin();
    if (!plugin) return false;
    try {
      const res = await plugin.saveCredentials({ username: cleanUser, password });
      return !!res.success;
    } catch (err) {
      console.warn('[BiometricAuth] Native saveCredentials error:', err);
      return false;
    }
  }

  /**
   * درخواست احراز هویت با اثر انگشت یا چهره و بازگرداندن نام کاربری و پسورد
   */
  async authenticate(options?: { title?: string; subtitle?: string; cancelButtonText?: string }): Promise<BiometricCredentials | null> {
    const plugin = this.getNativePlugin();
    if (!plugin) return null;
    try {
      const res = await plugin.authenticate({
        title: options?.title || 'ورود با اثر انگشت یا تشخیص چهره',
        subtitle: options?.subtitle || 'برای ورود به سامانه هویت خود را تأیید کنید',
        cancelButtonText: options?.cancelButtonText || 'انصراف'
      });
      if (res.success && res.username && res.password) {
        return { username: res.username, password: res.password };
      }
      return null;
    } catch (err) {
      console.warn('[BiometricAuth] Native authenticate error:', err);
      return null;
    }
  }

  /**
   * حذف اعتبارنامه بیومتریک
   */
  async clearCredentials(): Promise<void> {
    const plugin = this.getNativePlugin();
    if (plugin) {
      try {
        await plugin.clearCredentials();
      } catch { }
    }
    purgeLegacyWebCredentials();
  }
}
