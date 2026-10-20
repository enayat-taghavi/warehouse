// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { OperationsSyncMonitorComponent } from './operations-sync-monitor';
import { SessionTabService } from '../../../../../core/services/session-tab.service';
import { ClientTelemetryService } from '../../../../../core/services/client-telemetry.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { warehouseOfflineDb, financeOfflineDb, SyncErrorEntry } from '../../../../../core/services/offline-db';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('OperationsSyncMonitorComponent Error Source Isolation (Session 17)', () => {
  let fixture: ComponentFixture<OperationsSyncMonitorComponent>;
  let component: OperationsSyncMonitorComponent;

  let whWhereSpy: any;
  let finWhereSpy: any;
  let whQueueSpy: any;
  let finQueueSpy: any;
  let whUpdateSpy: any;
  let finUpdateSpy: any;
  let whDeleteSpy: any;
  let finDeleteSpy: any;

  const warehouseError: SyncErrorEntry = {
    id: 5,
    url: '/api/warehouse/tasks/5/',
    method: 'PATCH',
    body: { count: 12 },
    statusCode: 409,
    serverMessage: 'Warehouse Conflict on Task 5',
    failedAt: 1000,
    dismissed: 0,
    appScope: 'warehouse',
    serverResponse: {}
  };

  const financeError: SyncErrorEntry = {
    id: 5,
    url: '/api/finance/slips/5/',
    method: 'PATCH',
    body: { amount: 5000000 },
    statusCode: 409,
    serverMessage: 'Finance Conflict on Slip 5',
    failedAt: 2000,
    dismissed: 0,
    appScope: 'finance',
    serverResponse: {}
  };

  beforeEach(async () => {
    whWhereSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'where').mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([warehouseError])
      })
    } as any);

    finWhereSpy = vi.spyOn(financeOfflineDb.syncErrors, 'where').mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([financeError])
      })
    } as any);

    whQueueSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    finQueueSpy = vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);

    whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'update').mockResolvedValue(1 as any);
    finUpdateSpy = vi.spyOn(financeOfflineDb.syncErrors, 'update').mockResolvedValue(1 as any);
    whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);
    finDeleteSpy = vi.spyOn(financeOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, OperationsSyncMonitorComponent],
      providers: [
        { provide: SessionTabService, useValue: { tabId: 'tab-123', getActiveApp: () => 'warehouse' } },
        { provide: ClientTelemetryService, useValue: { getFleetSessions: vi.fn().mockResolvedValue([]), getDeviceInfo: vi.fn().mockResolvedValue({}) } },
        { provide: OfflineSyncService, useValue: { flushQueueNow: vi.fn(), resolveConflict: vi.fn().mockResolvedValue({ success: true }) } },
        { provide: WebSocketService, useValue: { connect: vi.fn(), notifications$: of(), connected$: of(true) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } }
      ]
    })
      .overrideComponent(OperationsSyncMonitorComponent, { set: { template: '<div></div>' } })
      .compileComponents();

    fixture = TestBed.createComponent(OperationsSyncMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('۱. with id 5 in both DBs, discarding the warehouse error updates only warehouseOfflineDb.syncErrors', async () => {
    await component.refreshTelemetry(false);

    expect(component.conflictErrors()).toHaveLength(2);
    const whErr = component.conflictErrors().find(e => e.appScope === 'warehouse')!;
    expect(whErr.id).toBe(5);

    component.openConflictDetails(whErr);
    await component.resolveConflict('discard');

    expect(whUpdateSpy).toHaveBeenCalledWith(5, { dismissed: 1 });
    expect(finUpdateSpy).not.toHaveBeenCalled();
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).not.toHaveBeenCalled();
  });

  it('۲. the server strategy without server_record deletes only in the source DB for a warehouse error', async () => {
    await component.refreshTelemetry(false);

    const whErr = component.conflictErrors().find(e => e.appScope === 'warehouse')!;
    expect(whErr.id).toBe(5);

    component.openConflictDetails(whErr);
    await component.resolveConflict('server');

    expect(whDeleteSpy).toHaveBeenCalledWith(5);
    expect(finDeleteSpy).not.toHaveBeenCalled();
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
  });

  it('۳. same for a finance error: discarding or server strategy without server_record updates/deletes only in financeOfflineDb', async () => {
    await component.refreshTelemetry(false);

    const finErr = component.conflictErrors().find(e => e.appScope === 'finance')!;
    expect(finErr.id).toBe(5);

    // ۳.۱ تست استراتژی discard برای خطای مالی
    component.openConflictDetails(finErr);
    await component.resolveConflict('discard');

    expect(finUpdateSpy).toHaveBeenCalledWith(5, { dismissed: 1 });
    expect(whUpdateSpy).not.toHaveBeenCalled();

    // پاکسازی وضعیت جاسوس‌ها برای مرحله بعد
    whUpdateSpy.mockClear();
    finUpdateSpy.mockClear();
    whDeleteSpy.mockClear();
    finDeleteSpy.mockClear();

    // ۳.۲ تست استراتژی server برای خطای مالی
    component.openConflictDetails(finErr);
    await component.resolveConflict('server');

    expect(finDeleteSpy).toHaveBeenCalledWith(5);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
  });

  it('۴. getSourceDb accurately resolves source DB by error reference and falls back to appScope', () => {
    const errFin: SyncErrorEntry = {
      id: 10,
      url: '/api/test',
      method: 'GET',
      body: {},
      statusCode: 400,
      serverMessage: '',
      failedAt: 0,
      dismissed: 0,
      appScope: 'finance'
    };
    const errWh: SyncErrorEntry = {
      id: 10,
      url: '/api/test',
      method: 'GET',
      body: {},
      statusCode: 400,
      serverMessage: '',
      failedAt: 0,
      dismissed: 0,
      appScope: 'warehouse'
    };

    expect(component.getSourceDb(errFin)).toBe(financeOfflineDb);
    expect(component.getSourceDb(errWh)).toBe(warehouseOfflineDb);
  });
});
