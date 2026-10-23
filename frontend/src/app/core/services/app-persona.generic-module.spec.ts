// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { AppPersonaService } from './app-persona.service';

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

/**
 * ماژول ساخته‌شده از قالب (sample): کاشی و پیوند سریع باید به defaultRoute خود ماژول بروند،
 * نه به مسیر پیش‌فرض مالی، و تبادل قلمرو توکن و کانال انبار/مالی برایش انجام نشود.
 */
describe('AppPersonaService — ماژول عمومی (sample)', () => {
  let svc: any;

  beforeEach(() => {
    localStorage.clear();
    // بدون سازندهٔ واقعی: فقط وابستگی‌هایی که switchApp و syncScopeFromUrl می‌خوانند
    svc = Object.create(AppPersonaService.prototype);
    svc.activeApp = signal('operations');
    svc.sessionTab = { setActiveApp: vi.fn() };
    svc.router = { navigate: vi.fn() };
    svc.auth = { switchAppScope: vi.fn() };
    svc.ws = { switchAppChannel: vi.fn() };
    svc.canAccessApp = vi.fn().mockReturnValue(true);
    const SAMPLE = { code: 'sample', routePrefix: '/app/sample', defaultRoute: '/app/sample/home' };
    svc.moduleRegistry = {
      getSpec: (code: string) => (code === 'sample' ? SAMPLE : code === 'warehouse' ? { code: 'warehouse', routePrefix: '/app/warehouse' } : undefined),
      getInstalledSpecs: () => [{ code: 'warehouse', routePrefix: '/app/warehouse' }, SAMPLE]
    };
  });

  it('switchApp به defaultRoute ماژول می‌رود و قلمرو مالی را عوض نمی‌کند', () => {
    svc.switchApp('sample');
    expect(svc.activeApp()).toBe('sample');
    expect(svc.router.navigate).toHaveBeenCalledWith(['/app/sample/home']);
    expect(svc.auth.switchAppScope).not.toHaveBeenCalled();
    expect(svc.ws.switchAppChannel).not.toHaveBeenCalled();
  });

  it('syncScopeFromUrl با مسیر ماژول، همان ماژول را فعال می‌کند', () => {
    svc.syncScopeFromUrl('/app/sample/home?tab=1');
    expect(svc.activeApp()).toBe('sample');
    expect(localStorage.getItem('active_app_module')).toBe('sample');
  });

  it('انبار، مالی و عملیات ماژول عمومی شمرده نمی‌شوند', () => {
    expect(svc.isGenericModuleApp('warehouse')).toBe(false);
    expect(svc.isGenericModuleApp('personnel')).toBe(false);
    expect(svc.isGenericModuleApp('operations')).toBe(false);
    expect(svc.isGenericModuleApp('sample')).toBe(true);
    expect(svc.isGenericModuleApp('unknown')).toBe(false);
  });
});
