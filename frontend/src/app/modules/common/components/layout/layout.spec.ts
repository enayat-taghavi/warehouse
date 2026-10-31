import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SwUpdate } from '@angular/service-worker';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

import { Layout } from './layout';

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

describe('Layout', () => {
  let component: Layout;
  let fixture: ComponentFixture<Layout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Layout],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SwUpdate, useValue: { isEnabled: false } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Layout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('logout with unsent chat messages', () => {
    it('count 1 opens confirm dialog once with danger type', async () => {
      const confirmDialog = TestBed.inject(ConfirmDialogService);
      const openSpy = vi.spyOn(confirmDialog, 'open').mockResolvedValue(false);
      vi.spyOn(component.commService, 'unsentOutboxCount').mockResolvedValue(1);

      await component.logout();

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'danger',
          title: expect.stringContaining('پیام‌های ارسال‌نشده'),
        })
      );
    });

    it('cancel (open resolves false) performs no discard and no auth logout', async () => {
      const confirmDialog = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirmDialog, 'open').mockResolvedValue(false);
      vi.spyOn(component.commService, 'unsentOutboxCount').mockResolvedValue(1);
      const discardSpy = vi.spyOn(component.commService, 'discardOutboxForLogout');
      const logoutSpy = vi.spyOn(component.auth, 'logout');

      await component.logout();

      expect(discardSpy).not.toHaveBeenCalled();
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('confirm (open resolves true for every dialog) calls discard then auth logout in order', async () => {
      const confirmDialog = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirmDialog, 'open').mockResolvedValue(true);
      vi.spyOn(component.commService, 'unsentOutboxCount').mockResolvedValue(1);

      const callOrder: string[] = [];
      const discardSpy = vi.spyOn(component.commService, 'discardOutboxForLogout').mockImplementation(async () => {
        callOrder.push('discard');
      });
      const logoutSpy = vi.spyOn(component.auth, 'logout').mockImplementation(() => {
        callOrder.push('logout');
      });

      await component.logout();

      expect(discardSpy).toHaveBeenCalledTimes(1);
      expect(logoutSpy).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['discard', 'logout']);
    });
  });
});

