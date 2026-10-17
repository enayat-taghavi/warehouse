// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initNativeShell } from './native-shell';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { ApplicationRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    minimizeApp: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn().mockResolvedValue(undefined),
  },
  Style: {
    Dark: 'DARK',
    Light: 'LIGHT',
    Default: 'DEFAULT',
  },
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: {
    hide: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('native-shell', () => {
  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    vi.mocked(App.addListener).mockClear();
    vi.mocked(App.minimizeApp).mockClear();
    vi.mocked(StatusBar.setStyle).mockClear();
    vi.mocked(SplashScreen.hide).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
  });

  it('1. does nothing when isNativePlatform() is false', () => {
    initNativeShell();

    expect(App.addListener).not.toHaveBeenCalled();
    expect(StatusBar.setStyle).not.toHaveBeenCalled();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  it('2. sets up backButton listener, status bar style, and hides splash screen when native', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    let backHandler: ((e: { canGoBack: boolean }) => void) | undefined;
    vi.mocked(App.addListener).mockImplementation((event: string, handler: any) => {
      if (event === 'backButton') {
        backHandler = handler;
      }
      return Promise.resolve({ remove: vi.fn() });
    });

    const isStable$ = new BehaviorSubject<boolean>(true);
    const mockAppRef = {
      isStable: isStable$.asObservable(),
    } as unknown as ApplicationRef;

    initNativeShell(mockAppRef);
    await Promise.resolve();
    await Promise.resolve();

    expect(App.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    expect(StatusBar.setStyle).toHaveBeenCalledWith({ style: Style.Light });
    expect(SplashScreen.hide).toHaveBeenCalled();

    // Verify back button behavior: canGoBack true vs false
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true });

    backHandler?.({ canGoBack: true });
    expect(historyBackSpy).toHaveBeenCalled();

    backHandler?.({ canGoBack: false });
    expect(App.minimizeApp).toHaveBeenCalled();
  });
});
