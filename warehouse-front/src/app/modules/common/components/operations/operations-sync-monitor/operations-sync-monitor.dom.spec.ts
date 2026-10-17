// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { OperationsSyncMonitorComponent } from './operations-sync-monitor';
import { SessionTabService } from '../../../../../core/services/session-tab.service';
import { ClientTelemetryService } from '../../../../../core/services/client-telemetry.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ModuleRegistryService, getModuleRegistry } from '../../../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('OperationsSyncMonitorComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<OperationsSyncMonitorComponent>;
  let component: OperationsSyncMonitorComponent;

  beforeAll(async () => {
    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; }
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, OperationsSyncMonitorComponent],
      providers: [
        { provide: SessionTabService, useValue: { tabId: 'tab-123' } },
        { provide: ClientTelemetryService, useValue: { loadFleetSessions: vi.fn().mockResolvedValue([]) } },
        { provide: OfflineSyncService, useValue: { flushQueueNow: vi.fn() } },
        { provide: WebSocketService, useValue: { connect: vi.fn(), notifications$: of(), connected$: of(true) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OperationsSyncMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('wh_installed_modules');
    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
    TestBed.resetTestingModule();
  });

  it('۱. در حالت پیش‌فرض (Full Suite): هر دو صف انبارداری و مالی در خلاصه نمایش داده می‌شوند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse', 'accounting']);

    component.warehouseQueueCount.set(0);
    component.financeQueueCount.set(0);
    fixture.detectChanges();

    expect(component.queueSummaryText).toBe('انبارداری: 0 | مالی: 0');
  });

  it('۲. در حالت فقط مالی و بدون صف معلق انبار: فقط مالی در خلاصه نمایش داده می‌شود (بی‌ردپای انبار)', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);

    component.warehouseQueueCount.set(0);
    component.financeQueueCount.set(0);
    fixture.detectChanges();

    expect(component.showWarehouseQueue).toBe(false);
    expect(component.showFinanceQueue).toBe(true);
    expect(component.queueSummaryText).toBe('مالی: 0');
  });

  it('۳. در حالت فقط مالی اما با رکوردهای معلق انبار (R7): صف انبار هرگز پنهان نمی‌شود تا از هدررفت داده جلوگیری شود', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);

    component.warehouseQueueCount.set(3);
    component.financeQueueCount.set(1);
    fixture.detectChanges();

    expect(component.showWarehouseQueue).toBe(true);
    expect(component.showFinanceQueue).toBe(true);
    expect(component.queueSummaryText).toBe('انبارداری: 3 | مالی: 1');
  });

  it('۴. در حالت فقط انبار: فقط انبارداری نمایش داده می‌شود و مالی بدون رکورد پنهان است', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse']);

    component.warehouseQueueCount.set(0);
    component.financeQueueCount.set(0);
    fixture.detectChanges();

    expect(component.showWarehouseQueue).toBe(true);
    expect(component.showFinanceQueue).toBe(false);
    expect(component.queueSummaryText).toBe('انبارداری: 0');
  });

  it('۵. دکمهٔ شبیه‌سازی تداخل فقط در نصب دارای انبار دیده می‌شود و در نصب فقط مالی چیزی در صف مالی نمی‌نویسد (L16)', async () => {
    const registry = TestBed.inject(ModuleRegistryService);
    const hasSimulateButton = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
        .some(b => (b.textContent || '').includes('شبیه‌سازی تداخل'));

    registry.setInstalledModules(['platform', 'warehouse', 'accounting']);
    fixture.detectChanges();
    expect(hasSimulateButton()).toBe(true);

    registry.setInstalledModules(['platform', 'accounting']);
    fixture.detectChanges();
    expect(hasSimulateButton()).toBe(false);

    const toast = TestBed.inject(ToastService) as any;
    toast.show.mockClear();
    await component.simulateConflictScenario();
    expect(toast.show).not.toHaveBeenCalled();
  });
});
