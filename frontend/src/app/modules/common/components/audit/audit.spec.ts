// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeAll, describe, it, expect, beforeEach } from 'vitest';

import { provideRouter } from '@angular/router';

import { Audit } from './audit';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Audit', () => {
  let component: Audit;
  let fixture: ComponentFixture<Audit>;

  beforeAll(() => {
    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; },
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Audit],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Audit);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('بدون مدیر کل بودن: رفع قفل بر پایهٔ آی‌پی ممکن نیست و آی‌پی هرگز به سرور فرستاده نمی‌شود', () => {
    (component as any).isSuperuser = () => false;

    expect(component.canUnlockTarget(null, '10.0.0.5')).toBe(false);
    expect(component.canUnlockTarget('ali', '10.0.0.5')).toBe(true);

    component.confirmUnlockUser(null, '10.0.0.5');
    expect(component.showUnlockConfirmModal).toBe(false);

    component.confirmUnlockUser('ali', '10.0.0.5');
    expect(component.targetUserToUnlock).toEqual({ username: 'ali', ip_address: undefined });
  });

  it('مدیر کل: رفع قفل بر پایهٔ آی‌پی مجاز است', () => {
    (component as any).isSuperuser = () => true;

    expect(component.canUnlockTarget(null, '10.0.0.5')).toBe(true);
    component.confirmUnlockUser('ali', '10.0.0.5');
    expect(component.targetUserToUnlock).toEqual({ username: 'ali', ip_address: '10.0.0.5' });
  });
});
