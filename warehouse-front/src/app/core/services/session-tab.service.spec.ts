// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionTabService } from './session-tab.service';

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

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = createStorageMock();
}
if (!(globalThis as any).sessionStorage) {
  (globalThis as any).sessionStorage = createStorageMock();
}

describe('SessionTabService: getActiveApp', () => {
  let service: SessionTabService;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    service = new SessionTabService();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('/app/warehouse/counter gives warehouse', () => {
    window.history.pushState({}, '', '/app/warehouse/counter');
    expect(service.getActiveApp()).toBe('warehouse');
  });

  it('/app/finance/x gives personnel', () => {
    window.history.pushState({}, '', '/app/finance/x');
    expect(service.getActiveApp()).toBe('personnel');
  });

  it('/app/operations/cockpit gives operations', () => {
    window.history.pushState({}, '', '/app/operations/cockpit');
    expect(service.getActiveApp()).toBe('operations');
  });
});
