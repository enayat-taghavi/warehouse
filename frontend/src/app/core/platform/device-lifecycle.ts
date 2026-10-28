import { isNativePlatform } from './platform';
import { liveUpdateBridge } from './live-update';

/**
 * د۶ طرح ۵ اندروید — آفلاین روی گوشی:
 * (الف) یک‌بار درخواست حافظهٔ ماندگار تا مرورگر/WebView در کمبود جا IndexedDB را خودسرانه پاک نکند؛
 * (ب) روی اپ بومی، با برگشت اپ به جلو یک بار همان مسیر عادی ارسال صف (با همهٔ دروازه‌ها، بی bypassGate).
 * هیچ مسیر پاک کردن تازه‌ای اینجا نیست.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? (navigator as any).storage : undefined;
    if (!storage || typeof storage.persist !== 'function') return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return !!(await storage.persist());
  } catch {
    // شکست درخواست بی‌خطر است؛ رفتار پیش‌فرض مرورگر می‌ماند
    return false;
  }
}

let resumeHandle: { remove: () => Promise<void> } | null = null;
let resumeGeneration = 0;

/** روی اپ بومی، با هر برگشت به جلو `onResume` (ارسال صف) یک بار صدا زده می‌شود. فقط یک شنونده. */
export function initResumeSync(onResume: () => Promise<unknown> | void): void {
  if (!isNativePlatform()) return;
  stopResumeSync();
  const generation = resumeGeneration;
  try {
    liveUpdateBridge
      .addAppStateListener(({ isActive }) => {
        if (!isActive) return;
        try {
          Promise.resolve(onResume()).catch((err) => console.warn('[DeviceLifecycle] resume sync error:', err));
        } catch (err) {
          console.warn('[DeviceLifecycle] resume sync error:', err);
        }
      })
      .then((handle) => {
        // اگر پیش از ثبت، stop صدا زده شده بود، همین شنونده را هم بردار
        if (generation !== resumeGeneration) {
          handle.remove().catch(() => {});
          return;
        }
        resumeHandle = handle;
      })
      .catch((err) => console.warn('[DeviceLifecycle] appStateChange listener error:', err));
  } catch (err) {
    console.warn('[DeviceLifecycle] Error registering appStateChange listener:', err);
  }
}

export function stopResumeSync(): void {
  resumeGeneration++;
  if (resumeHandle) {
    resumeHandle.remove().catch(() => {});
    resumeHandle = null;
  }
}
