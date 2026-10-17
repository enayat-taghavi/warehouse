// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import {
  SERVER_ORIGIN_STORAGE_KEY,
  isValidServerOrigin,
  getServerOrigin,
  setServerOriginOverride,
  resolveServerUrl,
  wsUrl,
  publicOrigin,
} from './server-origin';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

function setNativeStub(platform: 'android' | 'ios' = 'android') {
  (globalThis as any).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  };
}

describe('server-origin helpers', () => {
  const originalServerOrigin = environment.serverOrigin;

  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    environment.serverOrigin = '';
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    environment.serverOrigin = originalServerOrigin;
  });

  // 1. Web tests (no native Capacitor runtime)
  describe('Web mode (non-native)', () => {
    it('1. should return empty string for getServerOrigin on web', () => {
      expect(getServerOrigin()).toBe('');
    });

    it('2. should reject override and not store anything on web', () => {
      const result = setServerOriginOverride('https://test.example.com');
      expect(result).toBe(false);
      expect(localStorage.getItem(SERVER_ORIGIN_STORAGE_KEY)).toBeNull();
      expect(getServerOrigin()).toBe('');
    });

    it('3. should return relative /api URLs untouched on web', () => {
      expect(resolveServerUrl('/api/v1/users')).toBe('/api/v1/users');
      expect(resolveServerUrl('/api')).toBe('/api');
      expect(resolveServerUrl('/api?tab=all')).toBe('/api?tab=all');
    });

    it('4. should return relative /media URLs untouched on web', () => {
      expect(resolveServerUrl('/media/signatures/sig1.png')).toBe('/media/signatures/sig1.png');
    });

    it('5. should return assets and non-server URLs untouched on web', () => {
      expect(resolveServerUrl('/assets/icons/app.svg')).toBe('/assets/icons/app.svg');
      expect(resolveServerUrl('/dashboard')).toBe('/dashboard');
    });

    it('6. should construct wsUrl using window location on web', () => {
      const expectedProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const expectedUrl = `${expectedProtocol}//${location.host}/ws/sync/`;
      expect(wsUrl('/ws/sync/')).toBe(expectedUrl);
    });

    it('7. should return window.location.origin for publicOrigin on web', () => {
      expect(publicOrigin()).toBe(window.location.origin);
    });
  });

  // 2. Validation tests for isValidServerOrigin
  describe('isValidServerOrigin', () => {
    it('8. should validate valid https origins with or without port', () => {
      expect(isValidServerOrigin('https://app.farsalish.ir')).toBe(true);
      expect(isValidServerOrigin('https://192.168.1.100:8443')).toBe(true);
      expect(isValidServerOrigin('https://localhost:8000')).toBe(true);
      expect(isValidServerOrigin('https://sub-domain.example.com')).toBe(true);
    });

    it('9. should reject http:// schemes, trailing slashes, paths, and invalid formats', () => {
      expect(isValidServerOrigin('http://app.farsalish.ir')).toBe(false);
      expect(isValidServerOrigin('http://localhost:8000')).toBe(false);
      expect(isValidServerOrigin('https://app.farsalish.ir/')).toBe(false);
      expect(isValidServerOrigin('https://app.farsalish.ir/api')).toBe(false);
      expect(isValidServerOrigin('https://app.farsalish.ir:port')).toBe(false);
      expect(isValidServerOrigin('')).toBe(false);
      expect(isValidServerOrigin(null as any)).toBe(false);
    });
  });

  // 3. Native mobile mode tests
  describe('Native mobile mode (Capacitor stubbed)', () => {
    beforeEach(() => {
      setNativeStub('android');
    });

    it('10. should fall back to environment.serverOrigin when storage is empty', () => {
      environment.serverOrigin = 'https://env.farsalish.ir';
      expect(getServerOrigin()).toBe('https://env.farsalish.ir');
    });

    it('11. should strip trailing slash from environment.serverOrigin fallback', () => {
      environment.serverOrigin = 'https://env.farsalish.ir/';
      expect(getServerOrigin()).toBe('https://env.farsalish.ir');
    });

    it('12. should return empty string if environment.serverOrigin is invalid', () => {
      environment.serverOrigin = 'http://insecure.farsalish.ir';
      expect(getServerOrigin()).toBe('');
    });

    it('13. should store and prioritize valid setServerOriginOverride over environment', () => {
      environment.serverOrigin = 'https://env.farsalish.ir';
      const success = setServerOriginOverride('https://override.farsalish.ir');
      expect(success).toBe(true);
      expect(localStorage.getItem(SERVER_ORIGIN_STORAGE_KEY)).toBe('https://override.farsalish.ir');
      expect(getServerOrigin()).toBe('https://override.farsalish.ir');
    });

    it('14. should reject invalid override and preserve existing configuration', () => {
      environment.serverOrigin = 'https://env.farsalish.ir';
      const success = setServerOriginOverride('http://bad-origin.com');
      expect(success).toBe(false);
      expect(localStorage.getItem(SERVER_ORIGIN_STORAGE_KEY)).toBeNull();
      expect(getServerOrigin()).toBe('https://env.farsalish.ir');
    });

    it('15. should leave absolute URLs untouched on native', () => {
      setServerOriginOverride('https://api.farsalish.ir');
      expect(resolveServerUrl('https://cdn.example.com/api/data')).toBe('https://cdn.example.com/api/data');
      expect(resolveServerUrl('http://cdn.example.com/api/data')).toBe('http://cdn.example.com/api/data');
      expect(resolveServerUrl('blob:https://farsalish.ir/abc')).toBe('blob:https://farsalish.ir/abc');
      expect(resolveServerUrl('data:image/png;base64,123')).toBe('data:image/png;base64,123');
      expect(resolveServerUrl('ws://example.com/ws')).toBe('ws://example.com/ws');
      expect(resolveServerUrl('wss://example.com/ws')).toBe('wss://example.com/ws');
    });

    it('16. should leave /assets/ and non-server paths untouched on native', () => {
      setServerOriginOverride('https://api.farsalish.ir');
      expect(resolveServerUrl('/assets/logo.svg')).toBe('/assets/logo.svg');
      expect(resolveServerUrl('/assets/fonts/iransans.woff2')).toBe('/assets/fonts/iransans.woff2');
      expect(resolveServerUrl('/home')).toBe('/home');
      expect(resolveServerUrl('/api-v2-not-real')).toBe('/api-v2-not-real');
    });

    it('17. should prefix /api/, /api, /api?, and /media/ URLs on native', () => {
      setServerOriginOverride('https://api.farsalish.ir');
      expect(resolveServerUrl('/api/v1/auth/login')).toBe('https://api.farsalish.ir/api/v1/auth/login');
      expect(resolveServerUrl('/api')).toBe('https://api.farsalish.ir/api');
      expect(resolveServerUrl('/api?page=1')).toBe('https://api.farsalish.ir/api?page=1');
      expect(resolveServerUrl('/media/documents/receipt.pdf')).toBe('https://api.farsalish.ir/media/documents/receipt.pdf');
    });

    it('18. should map wsUrl scheme from https: to wss: on native', () => {
      setServerOriginOverride('https://app.farsalish.ir');
      expect(wsUrl('/ws/notifications/')).toBe('wss://app.farsalish.ir/ws/notifications/');
    });

    it('19. should return server origin for publicOrigin when native origin is set', () => {
      setServerOriginOverride('https://app.farsalish.ir');
      expect(publicOrigin()).toBe('https://app.farsalish.ir');
    });
  });
});
