// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { OfflinePendingBadgeComponent } from './offline-pending-badge.component';
import { NetworkStatusService, ConnectionState } from '../../../core/services/network-status.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { SystemHealthService } from '../../../core/services/system-health.service';
import { StateService } from '../../../core/services/state.service';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../icons/svg-icon.directive';

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

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('OfflinePendingBadgeComponent: DOM queue badge states, pending count and manual sync', () => {
  let fixture: ComponentFixture<OfflinePendingBadgeComponent>;
  let component: OfflinePendingBadgeComponent;

  let networkState$: BehaviorSubject<ConnectionState>;
  let isSyncing$: BehaviorSubject<boolean>;
  let pendingCount$: BehaviorSubject<number>;
  let errorCount$: BehaviorSubject<number>;
  let lastSyncTime$: BehaviorSubject<number | null>;

  let mockNetwork: {
    state: ConnectionState;
    state$: BehaviorSubject<ConnectionState>;
  };

  let mockSync: {
    isSyncing$: BehaviorSubject<boolean>;
    pendingCount$: BehaviorSubject<number>;
    errorCount$: BehaviorSubject<number>;
    lastSyncTime$: BehaviorSubject<number | null>;
    forceSync: ReturnType<typeof vi.fn>;
    getQueueEntries: ReturnType<typeof vi.fn>;
    getErrors: ReturnType<typeof vi.fn>;
    cancelQueueEntry: ReturnType<typeof vi.fn>;
    dismissError: ReturnType<typeof vi.fn>;
    dismissAllErrors: ReturnType<typeof vi.fn>;
    retryError: ReturnType<typeof vi.fn>;
  };

  let mockHealthService: any;
  let mockStateService: any;
  let mockRouter: any;
  let mockConfirmDialog: any;

  beforeEach(async () => {
    networkState$ = new BehaviorSubject<ConnectionState>('online');
    isSyncing$ = new BehaviorSubject<boolean>(false);
    pendingCount$ = new BehaviorSubject<number>(0);
    errorCount$ = new BehaviorSubject<number>(0);
    lastSyncTime$ = new BehaviorSubject<number | null>(null);

    mockNetwork = {
      get state() { return networkState$.value; },
      state$: networkState$,
    };

    mockSync = {
      isSyncing$: isSyncing$,
      pendingCount$: pendingCount$,
      errorCount$: errorCount$,
      lastSyncTime$: lastSyncTime$,
      forceSync: vi.fn().mockResolvedValue({} as any),
      getQueueEntries: vi.fn().mockResolvedValue([]),
      getErrors: vi.fn().mockResolvedValue([]),
      cancelQueueEntry: vi.fn().mockResolvedValue(true),
      dismissError: vi.fn().mockResolvedValue(true),
      dismissAllErrors: vi.fn().mockResolvedValue(true),
      retryError: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(NetworkStatusService, 'getInstance').mockReturnValue(mockNetwork as any);
    vi.spyOn(OfflineSyncService, 'getInstance').mockReturnValue(mockSync as any);

    mockHealthService = {
      healthScore$: new BehaviorSubject(100),
      networkPingMs$: new BehaviorSubject(null),
      serverHealth$: new BehaviorSubject(null),
      clientStorage$: new BehaviorSubject(null),
      isDiagnosing$: new BehaviorSubject(false),
      runFullDiagnostic: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockStateService = {
      appState: {},
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [OfflinePendingBadgeComponent],
      providers: [
        provideRouter([]),
        { provide: Router, useValue: mockRouter },
        { provide: SystemHealthService, useValue: mockHealthService },
        { provide: StateService, useValue: mockStateService },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OfflinePendingBadgeComponent);
    component = fixture.componentInstance;
    (component as any).network = mockNetwork;
    (component as any).sync = mockSync;
    component.mode = 'header';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a) online, idle, 0 pending: «متصل» renders', () => {
    networkState$.next('online');
    isSyncing$.next(false);
    pendingCount$.next(0);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('متصل');
    expect(text).not.toContain('در حال ارسال');
    expect(text).not.toContain('صف ارسال');
    expect(text).not.toContain('آفلاین');
  });

  it('b) online, 3 pending: «صف ارسال (3)» and the count badge 3 render', () => {
    networkState$.next('online');
    isSyncing$.next(false);
    pendingCount$.next(3);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('صف ارسال (3)');

    const mobileCountBadge = fixture.nativeElement.querySelector('.bg-amber-700');
    expect(mobileCountBadge).toBeTruthy();
    expect(mobileCountBadge.textContent.trim()).toBe('3');
  });

  it('c) syncing with 2 pending: «در حال ارسال (2)»', () => {
    networkState$.next('online');
    isSyncing$.next(true);
    pendingCount$.next(2);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('در حال ارسال (2)');

    const spinner = fixture.nativeElement.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('d) networkState offline with 0 pending: «آفلاین»', () => {
    networkState$.next('offline');
    isSyncing$.next(false);
    pendingCount$.next(0);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('آفلاین');
    expect(text).not.toContain('متصل');
    expect(text).not.toContain('صف ارسال');
  });

  it('e) networkState = "server-unreachable" with 1 pending: status-warning icon and «صف ارسال (1)»', () => {
    networkState$.next('server-unreachable');
    isSyncing$.next(false);
    pendingCount$.next(1);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('صف ارسال (1)');

    const svgEl = fixture.debugElement.query(By.directive(SvgIconDirective));
    expect(svgEl).toBeTruthy();
    const directive = svgEl.injector.get(SvgIconDirective);
    expect(directive.appIcon()).toBe('status-warning');
  });

  it('f) clicking badge opens panel: «3 رکورد در انتظار» for 3 pending and «همگام و بدون صف» for 0', async () => {
    // 1. 3 pending
    pendingCount$.next(3);
    fixture.detectChanges();

    const pillBtn = fixture.nativeElement.querySelector('button[type="button"]');
    pillBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isPopoverOpen).toBe(true);

    const statusTabBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((btn: any) => btn.textContent?.includes('سلامت و شبکه')) as HTMLButtonElement;
    expect(statusTabBtn).toBeTruthy();
    statusTabBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('3 رکورد در انتظار');

    // 2. 0 pending
    pendingCount$.next(0);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('همگام و بدون صف');
  });

  it('g) manual sync button is disabled when offline and enabled when online/idle; clicking calls forceSync once', async () => {
    networkState$.next('offline');
    isSyncing$.next(false);
    fixture.detectChanges();

    const pillBtn = fixture.nativeElement.querySelector('button[type="button"]');
    pillBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const statusTabBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((btn: any) => btn.textContent?.includes('سلامت و شبکه')) as HTMLButtonElement;
    statusTabBtn.click();
    fixture.detectChanges();

    const syncBtn = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((btn: any) => btn.textContent?.includes('ارسال دستی')) as HTMLButtonElement;
    expect(syncBtn).toBeTruthy();
    expect(syncBtn.disabled).toBe(true);

    networkState$.next('online');
    fixture.detectChanges();

    expect(syncBtn.disabled).toBe(false);

    syncBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockSync.forceSync).toHaveBeenCalledTimes(1);
  });

  it('h) changing mocked pending count from 3 to 0 updates DOM after change detection', () => {
    networkState$.next('online');
    isSyncing$.next(false);
    pendingCount$.next(3);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('صف ارسال (3)');
    expect(fixture.nativeElement.textContent).not.toContain('متصل');

    pendingCount$.next(0);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('متصل');
    expect(fixture.nativeElement.textContent).not.toContain('صف ارسال (3)');
  });
});
