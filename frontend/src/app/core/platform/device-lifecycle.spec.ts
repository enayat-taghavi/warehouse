// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initResumeSync, requestPersistentStorage, stopResumeSync } from './device-lifecycle';
import { liveUpdateBridge } from './live-update';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('device-lifecycle', () => {
  let listener: ((state: { isActive: boolean }) => void) | null;
  let removeSpy: any;
  let addSpy: ReturnType<typeof vi.spyOn>;
  const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    listener = null;
    removeSpy = vi.fn().mockResolvedValue(undefined);
    addSpy = vi.spyOn(liveUpdateBridge, 'addAppStateListener').mockImplementation((fn) => {
      listener = fn;
      return Promise.resolve({ remove: removeSpy });
    });
  });

  afterEach(() => {
    stopResumeSync();
    vi.restoreAllMocks();
    delete (globalThis as any).Capacitor;
    if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
    else delete (navigator as any).storage;
  });

  const setNative = () => {
    (globalThis as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  };
  const setStorage = (value: unknown) =>
    Object.defineProperty(navigator, 'storage', { value, configurable: true });

  it('resume sync is not registered on the web', () => {
    initResumeSync(vi.fn());
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('calls onResume only when the native app becomes active', async () => {
    setNative();
    const onResume = vi.fn().mockResolvedValue(undefined);
    initResumeSync(onResume);
    await flush();
    listener!({ isActive: false });
    expect(onResume).not.toHaveBeenCalled();
    listener!({ isActive: true });
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('registers one listener and stop removes it', async () => {
    setNative();
    initResumeSync(vi.fn());
    await flush();
    initResumeSync(vi.fn());
    await flush();
    expect(addSpy).toHaveBeenCalledTimes(2);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    stopResumeSync();
    expect(removeSpy).toHaveBeenCalledTimes(2);
  });

  it('a failing onResume does not throw', async () => {
    setNative();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initResumeSync(() => Promise.reject(new Error('x')));
    await flush();
    expect(() => listener!({ isActive: true })).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalled();
  });

  it('requests persistent storage once when not yet persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('skips persist when already persisted, and survives missing API or errors', async () => {
    const persist = vi.fn();
    setStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();

    setStorage(undefined);
    expect(await requestPersistentStorage()).toBe(false);

    setStorage({ persisted: vi.fn().mockRejectedValue(new Error('denied')), persist });
    expect(await requestPersistentStorage()).toBe(false);
  });
});
