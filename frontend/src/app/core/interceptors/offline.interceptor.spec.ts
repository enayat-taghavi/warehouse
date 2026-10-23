// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { HttpRequest, HttpHeaders } from '@angular/common/http';
import { getOfflineCacheKey } from './offline.interceptor';

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
(globalThis as any).sessionStorage = createStorageMock();

describe('offlineInterceptor (Multi-Tenant Cache Key Isolation)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should isolate cache key based on X-Company-ID header', () => {
    const req1 = new HttpRequest('GET', '/api/warehouses/', {
      headers: new HttpHeaders({ 'X-Company-ID': '1' })
    });

    const req2 = new HttpRequest('GET', '/api/warehouses/', {
      headers: new HttpHeaders({ 'X-Company-ID': '2' })
    });

    const key1 = getOfflineCacheKey(req1);
    const key2 = getOfflineCacheKey(req2);

    expect(key1).toContain('::cid_1');
    expect(key2).toContain('::cid_2');
    expect(key1).not.toBe(key2);
  });

  it('should isolate cache key based on query parameter company_id', () => {
    const req1 = new HttpRequest('GET', '/api/warehouses/?company_id=1');
    const req2 = new HttpRequest('GET', '/api/warehouses/?company_id=2');

    const key1 = getOfflineCacheKey(req1);
    const key2 = getOfflineCacheKey(req2);

    expect(key1).toContain('::cid_1');
    expect(key2).toContain('::cid_2');
    expect(key1).not.toBe(key2);
  });

  it('should fallback to active_company_id in sessionStorage when header is missing', () => {
    sessionStorage.setItem('active_company_id', '5');

    const req = new HttpRequest('GET', '/api/warehouses/');
    const key = getOfflineCacheKey(req);

    expect(key).toBe('/api/warehouses/::cid_5');
  });
});
