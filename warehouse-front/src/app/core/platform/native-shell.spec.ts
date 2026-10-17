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
    document.documentElement.classList.remove('dark');
    addListenerSpy = vi.spyOn(nativeShellBridge, 'addListener').mockResolvedValue({ remove: vi.fn() });
    minimizeAppSpy = vi.spyOn(nativeShellBridge, 'minimizeApp').mockResolvedValue(undefined);
    setStyleSpy = vi.spyOn(nativeShellBridge, 'setStyle').mockResolvedValue(undefined);
    hideSplashSpy = vi.spyOn(nativeShellBridge, 'hideSplash').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    document.documentElement.classList.remove('dark');
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
  });

  it('3. with an element aria-modal="true" in the document, the back button dispatches an Escape keydown on document and does not call history.back or minimizeApp', () => {
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

    initNativeShell();

    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true });

    let escapeEventFired = false;
    let escapeBubbles = false;
    const keydownListener = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        escapeEventFired = true;
        escapeBubbles = ke.bubbles;
      }
    };
    document.addEventListener('keydown', keydownListener);

    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);

    try {
      backHandler?.({ canGoBack: true });

      expect(escapeEventFired).toBe(true);
      expect(escapeBubbles).toBe(true);
      expect(historyBackSpy).not.toHaveBeenCalled();
      expect(minimizeAppSpy).not.toHaveBeenCalled();
    } finally {
      modal.remove();
      document.removeEventListener('keydown', keydownListener);
    }
  });

  it('4. back button navigates history back when canGoBack is true and window.history.length > 1 and no modal is open', () => {
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

    initNativeShell();

    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true });

    backHandler?.({ canGoBack: true });
    expect(historyBackSpy).toHaveBeenCalled();
    expect(minimizeAppSpy).not.toHaveBeenCalled();
  });

  it('5. back button calls minimizeApp when canGoBack is false and no modal is open', () => {
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

    initNativeShell();

    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    backHandler?.({ canGoBack: false });
    expect(historyBackSpy).not.toHaveBeenCalled();
    expect(minimizeAppSpy).toHaveBeenCalled();
  });

  it('6. with OS dark mode mocked (matchMedia returning matches: true) and no dark class, setStyle gets Style.Light', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    document.documentElement.classList.remove('dark');
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      initNativeShell();
      expect(setStyleSpy).toHaveBeenCalledWith({ style: Style.Light });
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });

  it('7. with dark class on documentElement, setStyle gets Style.Dark', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };

    document.documentElement.classList.add('dark');
    try {
      initNativeShell();
      expect(setStyleSpy).toHaveBeenCalledWith({ style: Style.Dark });
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });
});
