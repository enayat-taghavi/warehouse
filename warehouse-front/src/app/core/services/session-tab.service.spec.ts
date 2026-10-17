// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionTabService } from './session-tab.service';
import { getModuleRegistry } from '../modules/module-registry.service';

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

describe('SessionTabService: getActiveApp', () => {
  let service: SessionTabService;

  beforeEach(() => {
    const sMock = createStorageMock();
    const lMock = createStorageMock();
    try {
      Object.defineProperty(window, 'sessionStorage', { value: sMock, writable: true, configurable: true });
      Object.defineProperty(window, 'localStorage', { value: lMock, writable: true, configurable: true });
    } catch {}
    (globalThis as any).sessionStorage = sMock;
    (globalThis as any).localStorage = lMock;

    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
    service = new SessionTabService();
  });

  afterEach(() => {
    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
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
