// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef, ElementRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

import { OfflinePendingBadgeComponent } from './offline-pending-badge.component';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { SystemHealthService } from '../../../core/services/system-health.service';
import { StateService } from '../../../core/services/state.service';
import { SyncQueueEntry } from '../../../core/services/offline-db';

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

describe('OfflinePendingBadgeComponent: queue handling & data-loss prevention', () => {
  let component: OfflinePendingBadgeComponent;
  let syncService: OfflineSyncService;
  let mockConfirmDialog: { open: ReturnType<typeof vi.fn> };
  let mockHealthService: any;
  let mockRouter: any;
  let mockCdr: any;
  let mockElementRef: any;
  let mockStateService: any;

  beforeEach(() => {
    localStorage.clear();
    syncService = OfflineSyncService.getInstance();

    mockConfirmDialog = {
      open: vi.fn(),
    };

    mockHealthService = {
      healthScore$: new BehaviorSubject(100),
      networkPingMs$: new BehaviorSubject(null),
      serverHealth$: new BehaviorSubject(null),
      clientStorage$: new BehaviorSubject(null),
      isDiagnosing$: new BehaviorSubject(false),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn(),
    };

    mockElementRef = {
      nativeElement: document.createElement('div'),
    };

    mockStateService = {
      appState: {},
    };

    const injector = Injector.create({
      providers: [
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: SystemHealthService, useValue: mockHealthService },
        { provide: Router, useValue: mockRouter },
      ],
    });

    runInInjectionContext(injector, () => {
      component = new OfflinePendingBadgeComponent(
        mockElementRef as ElementRef,
        mockCdr as ChangeDetectorRef,
        mockStateService as StateService
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the badge lists only own records in loadQueueEntries', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 10 }));

    const dummyEntries: Partial<SyncQueueEntry>[] = [
      { id: 1, userId: 10, url: '/api/v1/items/1/' },
      { id: 2, userId: undefined, url: '/api/v1/items/2/' },
      { id: 3, userId: 99, url: '/api/v1/items/3/' }, // other user
    ];

    vi.spyOn(syncService, 'getQueueEntries').mockResolvedValue(dummyEntries as SyncQueueEntry[]);

    await component.loadQueueEntries();

    expect(component.queueEntries.length).toBe(2);
    expect(component.queueEntries.map((e) => e.id)).toEqual([1, 2]);
  });

  it('the badge does not call cancelQueueEntry when the dialog resolves false', async () => {
    mockConfirmDialog.open.mockResolvedValue(false);
    const cancelSpy = vi.spyOn(syncService, 'cancelQueueEntry');

    await component.onCancelQueueItem(100);

    expect(mockConfirmDialog.open).toHaveBeenCalledWith({
      title: 'لغو این درخواست',
      message: 'این تغییر هنوز به سرور ارسال نشده است. با لغو، برای همیشه از این دستگاه حذف میشود و قابل بازگشت نیست.',
      confirmText: 'لغو درخواست',
      cancelText: 'انصراف',
      type: 'danger',
    });
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('the badge calls cancelQueueEntry and removes item from list when dialog resolves true and cancellation succeeds', async () => {
    mockConfirmDialog.open.mockResolvedValue(true);
    const cancelSpy = vi.spyOn(syncService, 'cancelQueueEntry').mockResolvedValue(true);

    component.queueEntries = [
      { id: 100, userId: 10 } as SyncQueueEntry,
      { id: 200, userId: 10 } as SyncQueueEntry,
    ];

    await component.onCancelQueueItem(100);

    expect(cancelSpy).toHaveBeenCalledWith(100);
    expect(component.queueEntries.map((e) => e.id)).toEqual([200]);
    expect(mockCdr.markForCheck).toHaveBeenCalled();
  });

  it('the badge reloads queue entries if cancelQueueEntry returns false', async () => {
    mockConfirmDialog.open.mockResolvedValue(true);
    vi.spyOn(syncService, 'cancelQueueEntry').mockResolvedValue(false);
    const reloadSpy = vi.spyOn(component, 'loadQueueEntries').mockResolvedValue();

    component.queueEntries = [{ id: 100, userId: 10 } as SyncQueueEntry];

    await component.onCancelQueueItem(100);

    expect(reloadSpy).toHaveBeenCalled();
  });
});
