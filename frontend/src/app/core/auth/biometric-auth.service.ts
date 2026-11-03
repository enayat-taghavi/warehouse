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

const WEB_BIO_CIPHER_KEY = 'bio_web_cipher';
const WEB_BIO_IV_KEY = 'bio_web_iv';
const WEB_BIO_USER_KEY = 'bio_web_username';
const WEB_BIO_SALT_KEY = 'bio_web_salt';
const WEB_BIO_CREDENTIAL_ID_KEY = 'bio_web_credential_id';

@Injectable({
  providedIn: 'root'
})
export class BiometricAuthService {

  private getNativePlugin(): NativeBiometricPlugin | null {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.BiometricAuth) {
      return (window as any).Capacitor.Plugins.BiometricAuth as NativeBiometricPlugin;
    }
    return null;
  }

  /**
   * بررسی پشتیبانی دستگاه از احراز هویت بیومتریک (اندروید، وب و PWA)
   */
  async isAvailable(): Promise<boolean> {
    if (isNativePlatform()) {
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

    // بررسی بیومتریک مرورگر / وب (Windows Hello, Touch ID, Face ID, Android Chrome)
    if (typeof window !== 'undefined' && (window.isSecureContext !== false) && window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch (err) {
        console.warn('[BiometricAuth] WebAuthn availability check error:', err);
        return false;
      }
    }

    return false;
  }

  /**
   * بررسی وجود اعتبارنامهٔ بیومتریک ذخیره‌شده
   */
  async hasSavedCredentials(): Promise<boolean> {
    if (isNativePlatform()) {
      const plugin = this.getNativePlugin();
      if (!plugin) return false;
      try {
        const res = await plugin.hasSavedCredentials();
        return !!res.hasSaved;
      } catch (err) {
        console.warn('[BiometricAuth] Native hasSavedCredentials error:', err);
        return false;
      }
    }

    // حالت وب
    if (typeof localStorage !== 'undefined') {
      const hasCipher = !!(localStorage.getItem(WEB_BIO_CIPHER_KEY) && localStorage.getItem(WEB_BIO_IV_KEY));
      const hasCredId = !!localStorage.getItem(WEB_BIO_CREDENTIAL_ID_KEY);
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        if (hasCipher && !hasCredId) {
          // پاکسازی داده‌های ناقص قبلی که فاقد کلید Passkey ثبت‌شده هستند تا خطای "No passkeys" رخ ندهد
          localStorage.removeItem(WEB_BIO_CIPHER_KEY);
          localStorage.removeItem(WEB_BIO_IV_KEY);
          localStorage.removeItem(WEB_BIO_USER_KEY);
          localStorage.removeItem(WEB_BIO_SALT_KEY);
          return false;
        }
        return hasCipher && hasCredId;
      }
      return hasCipher;
    }
    return false;
  }

  /**
   * دریافت نام کاربری ذخیره‌شده برای بیومتریک (در صورت وجود)
   */
  async getSavedUsername(): Promise<string | null> {
    if (isNativePlatform()) {
      const plugin = this.getNativePlugin();
      if (plugin) {
        try {
          const res = await plugin.hasSavedCredentials();
          return res.username || null;
        } catch {
          return null;
        }
      }
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(WEB_BIO_USER_KEY) || null;
    }
    return null;
  }

  /**
   * ذخیره‌سازی امن نام کاربری و رمز عبور پس از ورود موفق
   */
  async saveCredentials(username: string, password: string): Promise<boolean> {
    const cleanUser = username?.trim();
    if (!cleanUser || !password) return false;

    if (isNativePlatform()) {
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

    // ذخیره‌سازی در وب و PWA با WebAuthn و Web Crypto API
    if (typeof window !== 'undefined' && window.crypto?.subtle && typeof localStorage !== 'undefined') {
      try {
        const encoder = new TextEncoder();

        // ۱. بررسی یا ثبت کلید بیومتریک پلتفرم (Google Passkeys / Windows Hello / Touch ID)
        let credentialIdStr: string | null = localStorage.getItem(WEB_BIO_CREDENTIAL_ID_KEY);
        const savedUser = localStorage.getItem(WEB_BIO_USER_KEY);

        // فقط در صورتی که کلید Passkey قبلاً ثبت نشده باشد یا کاربر عوض شده باشد، پنجرهٔ ایجاد Passkey باز می‌شود
        if ((!credentialIdStr || savedUser !== cleanUser) && (window.isSecureContext !== false) && window.PublicKeyCredential && typeof navigator.credentials?.create === 'function') {
          try {
            const challenge = window.crypto.getRandomValues(new Uint8Array(32));
            const userId = encoder.encode(cleanUser);
            const hostname = window.location.hostname;
            const rpId = (hostname && hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/))
              ? hostname
              : undefined;

            const cred = await navigator.credentials.create({
              publicKey: {
                challenge: challenge.buffer as ArrayBuffer,
                rp: {
                  name: 'سامانه مدیریت یکپارچه',
                  id: rpId
                },
                user: {
                  id: userId.buffer as ArrayBuffer,
                  name: cleanUser,
                  displayName: cleanUser
                },
                pubKeyCredParams: [
                  { alg: -7, type: 'public-key' },  // ES256
                  { alg: -257, type: 'public-key' } // RS256
                ],
                authenticatorSelection: {
                  authenticatorAttachment: 'platform',
                  userVerification: 'required',
                  residentKey: 'preferred'
                },
                timeout: 60000,
                attestation: 'none'
              }
            }) as PublicKeyCredential | null;

            if (cred && cred.rawId) {
              const rawIdBytes = new Uint8Array(cred.rawId);
              credentialIdStr = Array.from(rawIdBytes).toString();
            }
          } catch (passkeyErr) {
            console.warn('[BiometricAuth] WebAuthn passkey registration cancelled or failed:', passkeyErr);
            // اگر کاربر ثبت اثر انگشت را در کادر سیستم لغو کرد، ذخیره‌سازی انجام نمی‌شود
            return false;
          }
        }

        if (!credentialIdStr) {
          return false;
        }

        // ۲. رمزنگاری امن سمت کلاینت با Web Crypto API
        let saltStr = localStorage.getItem(WEB_BIO_SALT_KEY);
        let salt: Uint8Array;
        if (!saltStr) {
          salt = window.crypto.getRandomValues(new Uint8Array(16));
          localStorage.setItem(WEB_BIO_SALT_KEY, Array.from(salt).toString());
        } else {
          salt = new Uint8Array(saltStr.split(',').map(Number));
        }

        const baseKey = await window.crypto.subtle.importKey(
          'raw',
          encoder.encode('co-manage-local-bio-key-' + cleanUser),
          { name: 'PBKDF2' },
          false,
          ['deriveKey']
        );

        const encKey = await window.crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: 100000,
            hash: 'SHA-256'
          },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const dataToEncrypt = encoder.encode(cleanUser + '\n' + password);
        const encrypted = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          encKey,
          dataToEncrypt
        );

        localStorage.setItem(WEB_BIO_USER_KEY, cleanUser);
        localStorage.setItem(WEB_BIO_CREDENTIAL_ID_KEY, credentialIdStr);
        localStorage.setItem(WEB_BIO_CIPHER_KEY, Array.from(new Uint8Array(encrypted)).toString());
        localStorage.setItem(WEB_BIO_IV_KEY, Array.from(iv).toString());
        return true;
      } catch (err) {
        console.warn('[BiometricAuth] Web saveCredentials error:', err);
        return false;
      }
    }

    return false;
  }

  /**
   * درخواست احراز هویت با اثر انگشت یا چهره و بازگرداندن نام کاربری و پسورد
   */
  async authenticate(options?: { title?: string; subtitle?: string; cancelButtonText?: string }): Promise<BiometricCredentials | null> {
    if (isNativePlatform()) {
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

    // حالت وب (WebAuthn / Platform Authenticator)
    if (typeof window !== 'undefined' && window.PublicKeyCredential && window.crypto?.subtle && typeof localStorage !== 'undefined') {
      try {
        const cipherStr = localStorage.getItem(WEB_BIO_CIPHER_KEY);
        const ivStr = localStorage.getItem(WEB_BIO_IV_KEY);
        const savedUser = localStorage.getItem(WEB_BIO_USER_KEY);
        const saltStr = localStorage.getItem(WEB_BIO_SALT_KEY);
        const credIdStr = localStorage.getItem(WEB_BIO_CREDENTIAL_ID_KEY);

        // اگر هر کدام از اطلاعات یا کلید Passkey موجود نباشد، ورود بیومتریک ممکن نیست
        if (!cipherStr || !ivStr || !savedUser || !saltStr || !credIdStr) {
          return null;
        }

        const credIdBytes = new Uint8Array(credIdStr.split(',').map(Number));
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const hostname = window.location.hostname;
        const rpId = (hostname && hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/))
          ? hostname
          : undefined;

        // درخواست احراز هویت بیومتریک از سنسور سخت‌افزاری دستگاه
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: challenge.buffer as ArrayBuffer,
            rpId: rpId,
            timeout: 60000,
            userVerification: 'required',
            allowCredentials: [{
              id: credIdBytes.buffer as ArrayBuffer,
              type: 'public-key',
              transports: ['internal']
            }]
          }
        }).catch((err) => {
          console.warn('[BiometricAuth] WebAuthn get rejected/failed:', err);
          return null;
        });

        // بسیار حیاتی: اگر سنسور بیومتریک تایید نشد یا کاربر پنجره را بست، ورود کاملاً لغو می‌شود
        if (!assertion) {
          return null;
        }

        // فقط و فقط در صورت تایید موفق سنسور، رمزگشایی انجام می‌شود:
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const salt = new Uint8Array(saltStr.split(',').map(Number));
        const baseKey = await window.crypto.subtle.importKey(
          'raw',
          encoder.encode('co-manage-local-bio-key-' + savedUser),
          { name: 'PBKDF2' },
          false,
          ['deriveKey']
        );

        const encKey = await window.crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: 100000,
            hash: 'SHA-256'
          },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );

        const iv = new Uint8Array(ivStr.split(',').map(Number));
        const cipherBytes = new Uint8Array(cipherStr.split(',').map(Number));

        const decrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          encKey,
          cipherBytes
        );

        const decryptedStr = decoder.decode(decrypted);
        const [username, password] = decryptedStr.split('\n');
        if (username && password) {
          return { username, password };
        }
        return null;
      } catch (err) {
        console.warn('[BiometricAuth] Web authenticate error:', err);
        return null;
      }
    }

    return null;
  }

  /**
   * حذف اعتبارنامه بیومتریک
   */
  async clearCredentials(): Promise<void> {
    if (isNativePlatform()) {
      const plugin = this.getNativePlugin();
      if (plugin) {
        try {
          await plugin.clearCredentials();
        } catch { }
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WEB_BIO_CIPHER_KEY);
      localStorage.removeItem(WEB_BIO_IV_KEY);
      localStorage.removeItem(WEB_BIO_USER_KEY);
      localStorage.removeItem(WEB_BIO_SALT_KEY);
      localStorage.removeItem(WEB_BIO_CREDENTIAL_ID_KEY);
    }
  }
}
