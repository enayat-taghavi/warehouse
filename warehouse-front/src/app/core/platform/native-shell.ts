import { ApplicationRef } from '@angular/core';
import { firstValueFrom, isObservable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativePlatform } from './platform';

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
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else {
        App.minimizeApp().catch((err) => {
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
    const isDark = typeof window !== 'undefined' && (
      document.documentElement.classList.contains('dark') ||
      window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );
    StatusBar.setStyle({
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
      SplashScreen.hide().catch(() => {});
    }, 3000);

    firstValueFrom(appRef.isStable.pipe(filter(Boolean)))
      .then(() => {
        clearTimeout(fallbackTimer);
        return SplashScreen.hide();
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        SplashScreen.hide().catch(() => {});
      });
  } else {
    SplashScreen.hide().catch(() => {});
  }
}
