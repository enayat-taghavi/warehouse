import { ApplicationRef } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativePlatform } from './platform';

export interface NativeShellBridge {
  addListener(eventName: 'backButton', listener: (status: { canGoBack: boolean }) => void): Promise<{ remove: () => Promise<void> }>;
  minimizeApp(): Promise<void>;
  setStyle(options: { style: Style }): Promise<void>;
  hideSplash(): Promise<void>;
}

export const nativeShellBridge: NativeShellBridge = {
  addListener: (event, fn) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.App ?? App;
    return plugin.addListener(event, fn);
  },
  minimizeApp: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.App ?? App;
    return plugin.minimizeApp();
  },
  setStyle: (opts) => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.StatusBar ?? StatusBar;
    return plugin.setStyle(opts);
  },
  hideSplash: () => {
    const plugin = (globalThis as any).Capacitor?.Plugins?.SplashScreen ?? SplashScreen;
    return plugin.hide();
  },
};

/**
 * Initializes native mobile shell capabilities (Capacitor runtime):
 * - Android back button handling: navigates back in window history when possible, or minimizes the app.
 * - Status bar styling matching theme appearance.
 * - Hides the splash screen once the Angular application becomes stable.
 */
export function initNativeShell(appRef?: ApplicationRef): void {
  if (!isNativePlatform()) {
    return;
  }

  // 1. Android Back Button handling
  try {
    nativeShellBridge.addListener('backButton', ({ canGoBack }) => {
      const openModal = typeof document !== 'undefined' ? document.querySelector('[aria-modal="true"]') : null;
      if (openModal) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      if (canGoBack && typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else {
        nativeShellBridge.minimizeApp().catch((err) => {
          console.warn('[NativeShell] minimizeApp error:', err);
        });
      }
    }).catch((err) => {
      console.warn('[NativeShell] backButton listener registration error:', err);
    });
  } catch (err) {
    console.warn('[NativeShell] Error setting up backButton listener:', err);
  }

  // 2. Status bar styling matching theme appearance
  try {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    nativeShellBridge.setStyle({
      style: isDark ? Style.Dark : Style.Light,
    }).catch((err) => {
      console.warn('[NativeShell] StatusBar.setStyle error:', err);
    });
  } catch (err) {
    console.warn('[NativeShell] Error setting up StatusBar:', err);
  }

  // 3. Hide splash screen once the application is stable
  if (appRef && isObservable(appRef.isStable)) {
    const fallbackTimer = setTimeout(() => {
      nativeShellBridge.hideSplash().catch(() => { });
    }, 3000);

    firstValueFrom(appRef.isStable.pipe(filter(Boolean)))
      .then(() => {
        clearTimeout(fallbackTimer);
        return nativeShellBridge.hideSplash();
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        nativeShellBridge.hideSplash().catch(() => { });
      });
  } else {
    nativeShellBridge.hideSplash().catch(() => { });
  }
}
