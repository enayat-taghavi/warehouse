// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SectionToggleService } from './section-toggle.service';

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

describe('SectionToggleService', () => {
  let service: SectionToggleService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    service = TestBed.inject(SectionToggleService);
  });

  it('item without key is enabled', () => {
    expect(service.isEnabled(undefined)).toBe(true);
    expect(service.isEnabled('')).toBe(true);
  });

  it('applyConfig disables listed codes', () => {
    service.applyConfig({ disabled_sections: ['a.x'] });
    expect(service.isEnabled('a.x')).toBe(false);
    expect(service.isEnabled('a.y')).toBe(true);
  });

  it('config without key keeps previous list', () => {
    service.applyConfig({ disabled_sections: ['a.x'] });
    service.applyConfig({});
    expect(service.isEnabled('a.x')).toBe(false);
  });

  it('stores list for offline boot', () => {
    service.applyConfig({ disabled_sections: ['a.x'] });
    expect(localStorage.getItem('wh_disabled_sections')).toBe('["a.x"]');
  });

  it('declared keeps only valid items', () => {
    service.applyConfig({ toggle_sections: [{ code: 'a.x', title_fa: 'X' }, { code: 1 }] });
    expect(service.declared().length).toBe(1);
    expect(service.declared()[0]).toEqual({ code: 'a.x', title_fa: 'X' });
  });
});
