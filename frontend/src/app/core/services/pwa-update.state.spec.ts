// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaUpdateService } from './pwa-update.service';
import { ToastService } from '../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { NetworkStatusService } from './network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PwaUpdateService state', () => {
  let service: PwaUpdateService;
  let mockSwUpdate: any;
  let mockToast: any;
  let mockConfirmDialog: any;
  let versionUpdates$: Subject<any>;
  let unrecoverable$: Subject<any>;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() }
    });

    versionUpdates$ = new Subject();
    unrecoverable$ = new Subject();

    mockSwUpdate = {
      isEnabled: true,
      versionUpdates: versionUpdates$.asObservable(),
      unrecoverable: unrecoverable$.asObservable(),
      checkForUpdate: vi.fn().mockResolvedValue(false),
      activateUpdate: vi.fn().mockResolvedValue(true)
    };

    mockToast = {
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    TestBed.configureTestingModule({
      providers: [
        PwaUpdateService,
        { provide: SwUpdate, useValue: mockSwUpdate },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog }
      ]
    });

    service = TestBed.inject(PwaUpdateService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation
    });
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('1. VERSION_READY sets updateReady and opens no dialog', () => {
    service.init();
    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: '1' },
      latestVersion: { hash: '2' }
    });
    expect(service.updateReady()).toBe(true);
    expect(service.updateDismissed()).toBe(false);
    expect(mockConfirmDialog.open).not.toHaveBeenCalled();
  });

  it('2. dismissUpdate sets updateDismissed and a new VERSION_READY clears it', () => {
    service.init();
    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: '1' },
      latestVersion: { hash: '2' }
    });
    expect(service.updateReady()).toBe(true);
    expect(service.updateDismissed()).toBe(false);

    service.dismissUpdate();
    expect(service.updateDismissed()).toBe(true);

    versionUpdates$.next({
      type: 'VERSION_READY',
      currentVersion: { hash: '2' },
      latestVersion: { hash: '3' }
    });
    expect(service.updateDismissed()).toBe(false);
  });

  it('3. applyUpdate activates the update and reloads', async () => {
    await service.applyUpdate();
    expect(mockSwUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('4. applyUpdate still reloads when activateUpdate fails', async () => {
    mockSwUpdate.activateUpdate.mockRejectedValue(new Error('x'));
    await service.applyUpdate();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('5. manual update with an update already ready applies it without a new check', async () => {
    const net = NetworkStatusService.getInstance();
    vi.spyOn(net, 'isBrowserOnline', 'get').mockReturnValue(true);
    vi.spyOn(net, 'isServerUnreachable', 'get').mockReturnValue(false);

    service.updateReady.set(true);

    await service.checkAndApplyManualUpdate();

    expect(mockSwUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(mockSwUpdate.activateUpdate).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
