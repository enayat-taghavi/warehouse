// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initNativeShell, nativeShellBridge } from './native-shell';
import { Style } from '@capacitor/status-bar';
import { ApplicationRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

describe('native-shell', () => {
  let addListenerSpy: ReturnType<typeof vi.spyOn>;
  let minimizeAppSpy: ReturnType<typeof vi.spyOn>;
  let setStyleSpy: ReturnType<typeof vi.spyOn>;
  let hideSplashSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    addListenerSpy = vi.spyOn(nativeShellBridge, 'addListener').mockResolvedValue({ remove: vi.fn() });
    minimizeAppSpy = vi.spyOn(nativeShellBridge, 'minimizeApp').mockResolvedValue(undefined);
    setStyleSpy = vi.spyOn(nativeShellBridge, 'setStyle').mockResolvedValue(undefined);
    hideSplashSpy = vi.spyOn(nativeShellBridge, 'hideSplash').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
  });

  it('1. does nothing when isNativePlatform() is false', () => {
    initNativeShell();

    expect(addListenerSpy).not.toHaveBeenCalled();
    expect(setStyleSpy).not.toHaveBeenCalled();
    expect(hideSplashSpy).not.toHaveBeenCalled();
  });

  it('2. sets up backButton listener, status bar style, and hides splash screen when native', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    let backHandler: ((e: { canGoBack: boolean }) => void) | undefined;
    addListenerSpy.mockImplementation((event: string, handler: any) => {
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

    expect(addListenerSpy).toHaveBeenCalledWith('backButton', expect.any(Function));
    expect(setStyleSpy).toHaveBeenCalledWith({ style: Style.Light });
    expect(hideSplashSpy).toHaveBeenCalled();

    // Verify back button behavior: canGoBack true vs false
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true });

    backHandler?.({ canGoBack: true });
    expect(historyBackSpy).toHaveBeenCalled();

    backHandler?.({ canGoBack: false });
    expect(minimizeAppSpy).toHaveBeenCalled();
  });
});
