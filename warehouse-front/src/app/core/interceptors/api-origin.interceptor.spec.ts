// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpRequest } from '@angular/common/http';
import { of } from 'rxjs';
import { apiOriginInterceptor } from './api-origin.interceptor';
import { SERVER_ORIGIN_STORAGE_KEY } from '../platform/server-origin';

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

function setNativeStub() {
  (globalThis as any).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  };
}

describe('apiOriginInterceptor', () => {
  beforeEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
  });

  it('1. should pass through the exact same HttpRequest instance on web', () => {
    const originalReq = new HttpRequest('GET', '/api/users');
    let handledReq: HttpRequest<any> | undefined;
    const next = (req: HttpRequest<unknown>) => {
      handledReq = req as HttpRequest<any>;
      return of({} as any);
    };

    apiOriginInterceptor(originalReq, next);

    expect(handledReq).toBe(originalReq);
    expect(handledReq?.url).toBe('/api/users');
    expect(handledReq?.headers.has('X-App-Version')).toBe(false);
    expect(handledReq?.headers.has('X-App-Platform')).toBe(false);
  });

  it('2. should rewrite /api/ requests with server origin on native and attach headers', () => {
    setNativeStub();
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://api.farsalish.ir');

    const originalReq = new HttpRequest('GET', '/api/v1/warehouses/');
    let handledReq: HttpRequest<any> | undefined;
    const next = (req: HttpRequest<unknown>) => {
      handledReq = req as HttpRequest<any>;
      return of({} as any);
    };

    apiOriginInterceptor(originalReq, next);

    expect(handledReq).not.toBe(originalReq);
    expect(handledReq?.url).toBe('https://api.farsalish.ir/api/v1/warehouses/');
    expect(handledReq?.headers.get('X-App-Version')).toBe('1.0.0');
    expect(handledReq?.headers.get('X-App-Platform')).toBe('android');
  });

  it('3. should rewrite /media/ requests with server origin on native and attach headers', () => {
    setNativeStub();
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://api.farsalish.ir');

    const originalReq = new HttpRequest('GET', '/media/attachments/doc.pdf');
    let handledReq: HttpRequest<any> | undefined;
    const next = (req: HttpRequest<unknown>) => {
      handledReq = req as HttpRequest<any>;
      return of({} as any);
    };

    apiOriginInterceptor(originalReq, next);

    expect(handledReq).not.toBe(originalReq);
    expect(handledReq?.url).toBe('https://api.farsalish.ir/media/attachments/doc.pdf');
    expect(handledReq?.headers.get('X-App-Version')).toBe('1.0.0');
    expect(handledReq?.headers.get('X-App-Platform')).toBe('android');
  });

  it('4. should pass through absolute URLs untouched (exact same instance, no headers) on native', () => {
    setNativeStub();
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://api.farsalish.ir');

    const originalReq = new HttpRequest('GET', 'https://other-domain.com/api/test');
    let handledReq: HttpRequest<any> | undefined;
    const next = (req: HttpRequest<unknown>) => {
      handledReq = req as HttpRequest<any>;
      return of({} as any);
    };

    apiOriginInterceptor(originalReq, next);

    expect(handledReq).toBe(originalReq);
    expect(handledReq?.url).toBe('https://other-domain.com/api/test');
    expect(handledReq?.headers.has('X-App-Version')).toBe(false);
    expect(handledReq?.headers.has('X-App-Platform')).toBe(false);
  });

  it('5. should pass through /assets/ URLs untouched (exact same instance, no headers) on native', () => {
    setNativeStub();
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://api.farsalish.ir');

    const originalReq = new HttpRequest('GET', '/assets/i18n/fa.json');
    let handledReq: HttpRequest<any> | undefined;
    const next = (req: HttpRequest<unknown>) => {
      handledReq = req as HttpRequest<any>;
      return of({} as any);
    };

    apiOriginInterceptor(originalReq, next);

    expect(handledReq).toBe(originalReq);
    expect(handledReq?.url).toBe('/assets/i18n/fa.json');
    expect(handledReq?.headers.has('X-App-Version')).toBe(false);
    expect(handledReq?.headers.has('X-App-Platform')).toBe(false);
  });
});
