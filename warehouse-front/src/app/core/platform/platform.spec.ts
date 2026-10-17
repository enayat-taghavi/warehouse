// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isNativePlatform, getAppPlatform } from './platform';

describe('platform detection', () => {
  beforeEach(() => {
    delete (globalThis as any).Capacitor;
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
  });

  it('should detect web platform when Capacitor is absent', () => {
    expect(isNativePlatform()).toBe(false);
    expect(getAppPlatform()).toBe('web');
  });

  it('should detect web platform when Capacitor.isNativePlatform returns false', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    };
    expect(isNativePlatform()).toBe(false);
    expect(getAppPlatform()).toBe('web');
  });

  it('should detect android platform when running in native android container', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    expect(isNativePlatform()).toBe(true);
    expect(getAppPlatform()).toBe('android');
  });

  it('should detect ios platform when running in native ios container', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
    expect(isNativePlatform()).toBe(true);
    expect(getAppPlatform()).toBe('ios');
  });

  it('should fallback to web if platform string is unrecognized', () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'electron',
    };
    expect(isNativePlatform()).toBe(true);
    expect(getAppPlatform()).toBe('web');
  });
});
