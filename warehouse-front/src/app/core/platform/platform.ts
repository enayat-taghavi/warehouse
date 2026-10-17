export type AppPlatform = 'web' | 'android' | 'ios';

/**
 * Returns true if the application is running inside a native mobile container (Capacitor).
 * Detects runtime purely via `globalThis.Capacitor` without importing any npm packages.
 */
export function isNativePlatform(): boolean {
  return (globalThis as any).Capacitor?.isNativePlatform?.() === true;
}

/**
 * Returns the current application platform: 'web', 'android', or 'ios'.
 */
export function getAppPlatform(): AppPlatform {
  if (!isNativePlatform()) {
    return 'web';
  }
  const platform = (globalThis as any).Capacitor?.getPlatform?.();
  if (platform === 'android' || platform === 'ios') {
    return platform;
  }
  return 'web';
}
