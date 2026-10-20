// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeScope,
  getScopedDbName,
  resolveScopeFromUrl,
  getCurrentActiveAppScope,
  getOfflineDb,
  warehouseOfflineDb,
  financeOfflineDb,
  AppScope,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';
import {
  runQueueSequential,
  getPendingCount,
  getUnsentCountStrict,
  getQueueEntries,
  buildScopedHeaders,
  refreshAccessToken
} from './offline-queue-runner';
import { purgeEphemeralQueueEntries } from './offline-local-patcher';
import { dismissError, deleteError } from './offline-conflict-manager';
import { SessionTabService } from '../session-tab.service';
import { getModuleRegistry } from '../../modules/module-registry.service';
import { NetworkStatusService } from '../network-status.service';

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

describe('Offline Scope Characterization & Dual-Queue Invariants (Session 16)', () => {
  let originalInstalledCodes: string[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    originalInstalledCodes = getModuleRegistry().getInstalledCodes();
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    getModuleRegistry().setInstalledModules(originalInstalledCodes);
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  // ─────────────────────────────────────────────────────────────
  // (a) normalizeScope and getScopedDbName
  // ─────────────────────────────────────────────────────────────
  it('(a-1) normalizeScope maps scopes to locked warehouse or finance scopes', () => {
    expect(normalizeScope(undefined)).toBe('warehouse');
    expect(normalizeScope(null)).toBe('warehouse');
    expect(normalizeScope('')).toBe('warehouse');
    expect(normalizeScope('warehouse')).toBe('warehouse');
    expect(normalizeScope('WAREHOUSE')).toBe('warehouse');

    expect(normalizeScope('finance')).toBe('finance');
    expect(normalizeScope('personnel')).toBe('finance');
    expect(normalizeScope('accounting')).toBe('finance');

    // Any other scope (including operations and unrecognized strings) defaults to warehouse
    expect(normalizeScope('operations')).toBe('warehouse');
    expect(normalizeScope('xyz')).toBe('warehouse');
  });

  it('(a-2) getScopedDbName returns the locked database name for each scope input', () => {
    expect(getScopedDbName(undefined)).toBe('WarehouseOfflineDB_warehouse');
    expect(getScopedDbName(null)).toBe('WarehouseOfflineDB_warehouse');
    expect(getScopedDbName('')).toBe('WarehouseOfflineDB_warehouse');
    expect(getScopedDbName('warehouse')).toBe('WarehouseOfflineDB_warehouse');
    expect(getScopedDbName('WAREHOUSE')).toBe('WarehouseOfflineDB_warehouse');

    expect(getScopedDbName('finance')).toBe('WarehouseOfflineDB_finance');
    expect(getScopedDbName('personnel')).toBe('WarehouseOfflineDB_finance');
    expect(getScopedDbName('accounting')).toBe('WarehouseOfflineDB_finance');

    expect(getScopedDbName('operations')).toBe('WarehouseOfflineDB_warehouse');
    expect(getScopedDbName('xyz')).toBe('WarehouseOfflineDB_warehouse');
  });

  // ─────────────────────────────────────────────────────────────
  // (b) resolveScopeFromUrl across 3 installed module subsets
  // ─────────────────────────────────────────────────────────────
  it('(b) resolveScopeFromUrl routes 23+ URLs consistently across all three installed module subsets', () => {
    const subsets = [
      ['warehouse', 'accounting'],
      ['warehouse'],
      ['accounting'],
    ];

    const urlTestCases: Array<{ url: string | null; expected: AppScope; label: string }> = [
      // 8 Finance patterns
      { url: '/api/v1/personnel/users/', expected: 'finance', label: '1. /personnel' },
      { url: '/api/v1/payroll/slips/generate/', expected: 'finance', label: '2. /payroll' },
      { url: '/api/v1/finance/transactions/', expected: 'finance', label: '3. /finance' },
      { url: '/api/v1/treasury/cheques/', expected: 'finance', label: '4. /treasury' },
      { url: '/api/v1/attendance/records/', expected: 'finance', label: '5. /attendance' },
      { url: '/api/v1/paya/transfers/batch/', expected: 'finance', label: '6. /paya' },
      { url: '/api/v1/slips/monthly/', expected: 'finance', label: '7. /slips' },
      { url: '/api/v1/fiscal/periods/', expected: 'finance', label: '8. /fiscal' },

      // Warehouse and core entities
      { url: '/api/v1/warehouse/doc-tasks/123/', expected: 'warehouse', label: '9. /doc-tasks/' },
      { url: '/api/v1/inventory/items/', expected: 'warehouse', label: '10. /inventory/' },
      { url: '/api/v1/warehouses/4/locations/', expected: 'warehouse', label: '11. /warehouses/' },
      { url: '/api/v1/chat/messages/', expected: 'warehouse', label: '12. /chat/' },
      { url: '/api/v1/notifications/unread/', expected: 'warehouse', label: '13. /notifications/' },
      { url: '/api/v1/auth/refresh/', expected: 'warehouse', label: '14. /auth/refresh/' },

      // Absolute URLs
      { url: 'https://soft.farsalish.ir/api/v1/inventory/items/', expected: 'warehouse', label: '15. absolute https warehouse' },
      { url: 'https://soft.farsalish.ir/api/v1/personnel/list/', expected: 'finance', label: '16. absolute https finance' },

      // Uppercase URLs
      { url: '/API/V1/PAYROLL/MONTHLY/', expected: 'finance', label: '17. uppercase payroll' },
      { url: '/API/V1/INVENTORY/STOCK/', expected: 'warehouse', label: '18. uppercase inventory' },

      // Additional endpoints
      { url: '/api/v1/operations/users/', expected: 'warehouse', label: '19. operations endpoint' },
      { url: '/api/v1/auth/login/', expected: 'warehouse', label: '20. auth login' },
      { url: '/api/v1/projects/', expected: 'warehouse', label: '21. projects endpoint' },
      { url: '/api/v1/attendance/devices/sync/', expected: 'finance', label: '22. attendance sync' },
      { url: '/api/v1/doc-tasks/summary/', expected: 'warehouse', label: '23. doc-tasks summary' },

      // null URL falls back to getCurrentActiveAppScope()
      { url: null, expected: 'warehouse', label: '24. null URL (default scope)' },
    ];

    for (const subset of subsets) {
      getModuleRegistry().setInstalledModules(subset);

      for (const { url, expected, label } of urlTestCases) {
        const result = resolveScopeFromUrl(url);
        expect(result, `Subset [${subset.join(', ')}] for ${label}`).toBe(expected);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────
  // (c) getCurrentActiveAppScope priority hierarchy
  // ─────────────────────────────────────────────────────────────
  it('(c-1) getCurrentActiveAppScope respects tab-scoped sessionStorage active_app_module', () => {
    sessionStorage.setItem('active_app_module', 'personnel');
    expect(getCurrentActiveAppScope()).toBe('finance');

    sessionStorage.setItem('active_app_module', 'warehouse');
    expect(getCurrentActiveAppScope()).toBe('warehouse');

    sessionStorage.setItem('active_app_module', 'operations');
    expect(getCurrentActiveAppScope()).toBe('warehouse');
  });

  it('(c-2) getCurrentActiveAppScope respects tab-scoped sessionStorage wh_active_app', () => {
    sessionStorage.setItem('wh_active_app', 'finance');
    expect(getCurrentActiveAppScope()).toBe('finance');
  });

  it('(c-3) getCurrentActiveAppScope falls back to window.location.pathname when session is empty', () => {
    window.history.pushState({}, '', '/app/finance/x');
    expect(getCurrentActiveAppScope()).toBe('finance');

    window.history.pushState({}, '', '/app/warehouse/x');
    expect(getCurrentActiveAppScope()).toBe('warehouse');

    window.history.pushState({}, '', '/app/operations/users');
    expect(getCurrentActiveAppScope()).toBe('warehouse');

    window.history.pushState({}, '', '/');
    expect(getCurrentActiveAppScope()).toBe('warehouse');
  });

  it('(c-4) getCurrentActiveAppScope falls back to localStorage active_app_module on path /', () => {
    window.history.pushState({}, '', '/');
    localStorage.setItem('active_app_module', 'accounting');
    expect(getCurrentActiveAppScope()).toBe('finance');
  });

  // ─────────────────────────────────────────────────────────────
  // (d) getOfflineDb instance identity and database names
  // ─────────────────────────────────────────────────────────────
  it('(d) getOfflineDb returns exact DB instances (toBe) and preserves locked DB names', () => {
    expect(getOfflineDb(undefined)).toBe(warehouseOfflineDb);
    expect(getOfflineDb(null)).toBe(warehouseOfflineDb);
    expect(getOfflineDb('' as any)).toBe(warehouseOfflineDb);
    expect(getOfflineDb('warehouse')).toBe(warehouseOfflineDb);
    expect(getOfflineDb('WAREHOUSE' as any)).toBe(warehouseOfflineDb);

    expect(getOfflineDb('finance')).toBe(financeOfflineDb);
    expect(getOfflineDb('personnel')).toBe(financeOfflineDb);
    expect(getOfflineDb('accounting' as any)).toBe(financeOfflineDb);

    expect(getOfflineDb('operations' as any)).toBe(warehouseOfflineDb);
    expect(getOfflineDb('xyz' as any)).toBe(warehouseOfflineDb);

    expect(warehouseOfflineDb.name).toBe('WarehouseOfflineDB_warehouse');
    expect(financeOfflineDb.name).toBe('WarehouseOfflineDB_finance');
  });

  // ─────────────────────────────────────────────────────────────
  // (e) runQueueSequential interleaved drain & origin DB delete
  // ─────────────────────────────────────────────────────────────
  it('(e) runQueueSequential drains both DBs interleaved by createdAt and calls delete on origin DB', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));

    let whItems: SyncQueueEntry[] = [
      {
        id: 1,
        url: '/api/v1/warehouse/item/1',
        method: 'POST',
        body: { name: 'wh-1' },
        createdAt: 100,
        status: 'pending',
        retryCount: 0,
        userId: 42,
        appScope: 'warehouse',
      },
      {
        id: 2,
        url: '/api/v1/warehouse/item/2',
        method: 'POST',
        body: { name: 'wh-2' },
        createdAt: 200,
        status: 'pending',
        retryCount: 0,
        userId: 42,
        appScope: 'warehouse',
      },
    ];

    let finItems: SyncQueueEntry[] = [
      {
        id: 1,
        url: '/api/v1/personnel/user/1',
        method: 'POST',
        body: { name: 'fin-1' },
        createdAt: 150,
        status: 'pending',
        retryCount: 0,
        userId: 42,
        appScope: 'finance',
      },
      {
        id: 2,
        url: '/api/v1/personnel/user/2',
        method: 'POST',
        body: { name: 'fin-2' },
        createdAt: 250,
        status: 'pending',
        retryCount: 0,
        userId: 42,
        appScope: 'finance',
      },
    ];

    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      whItems = whItems.filter((e) => e.id !== id);
    }) as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      finItems = finItems.filter((e) => e.id !== id);
    }) as any);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(financeOfflineDb.syncQueue, 'update').mockResolvedValue(1);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...whItems].sort((a, b) => a.createdAt - b.createdAt)),
        toArray: vi.fn(async () => [...whItems]),
        count: vi.fn(async () => whItems.length),
      })),
    } as any));

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...finItems].sort((a, b) => a.createdAt - b.createdAt)),
        toArray: vi.fn(async () => [...finItems]),
        count: vi.fn(async () => finItems.length),
      })),
    } as any));

    const sentRequests: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      sentRequests.push(String(url));
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: 1, success: true }),
      };
    });

    const mockNetworkStatus = {
      isBrowserOnline: true,
      reportServerUnreachable: vi.fn(),
      reportServerReachable: vi.fn(),
    } as unknown as NetworkStatusService;

    const outcome = await runQueueSequential(mockNetworkStatus);

    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.synced).toBe(4);
    }

    // Assert fetch was called in strict ascending createdAt order across both DBs:
    // 100 (wh id 1) -> 150 (fin id 1) -> 200 (wh id 2) -> 250 (fin id 2)
    expect(sentRequests.length).toBe(4);
    expect(sentRequests[0]).toContain('/api/v1/warehouse/item/1');
    expect(sentRequests[1]).toContain('/api/v1/personnel/user/1');
    expect(sentRequests[2]).toContain('/api/v1/warehouse/item/2');
    expect(sentRequests[3]).toContain('/api/v1/personnel/user/2');

    // Assert each delete was called on its own origin database handle (even though IDs overlap)
    expect(whDeleteSpy).toHaveBeenCalledTimes(2);
    expect(whDeleteSpy).toHaveBeenNthCalledWith(1, 1);
    expect(whDeleteSpy).toHaveBeenNthCalledWith(2, 2);

    expect(finDeleteSpy).toHaveBeenCalledTimes(2);
    expect(finDeleteSpy).toHaveBeenNthCalledWith(1, 1);
    expect(finDeleteSpy).toHaveBeenNthCalledWith(2, 2);

    expect(mockNetworkStatus.reportServerUnreachable).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────
  // (f) getPendingCount, getUnsentCountStrict, getQueueEntries
  // ─────────────────────────────────────────────────────────────
  it('(f-1) getPendingCount and getUnsentCountStrict sum counts across both DBs', async () => {
    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(3),
      }),
    } as any);

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(5),
      }),
    } as any);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'count').mockResolvedValue(4);
    vi.spyOn(financeOfflineDb.syncQueue, 'count').mockResolvedValue(6);

    const pendingAll = await getPendingCount();
    expect(pendingAll).toBe(8);

    const pendingWh = await getPendingCount('warehouse');
    expect(pendingWh).toBe(3);

    const pendingFin = await getPendingCount('finance');
    expect(pendingFin).toBe(5);

    const unsentStrict = await getUnsentCountStrict();
    expect(unsentStrict).toBe(10);
  });

  it('(f-2) getQueueEntries merges and sorts entries from both DBs by createdAt', async () => {
    const whEntries: SyncQueueEntry[] = [
      { id: 10, url: '/wh/1', method: 'POST', body: null, createdAt: 300, retryCount: 0, status: 'pending' },
      { id: 11, url: '/wh/2', method: 'POST', body: null, createdAt: 100, retryCount: 0, status: 'pending' },
    ];
    const finEntries: SyncQueueEntry[] = [
      { id: 20, url: '/fin/1', method: 'POST', body: null, createdAt: 200, retryCount: 0, status: 'pending' },
      { id: 21, url: '/fin/2', method: 'POST', body: null, createdAt: 400, retryCount: 0, status: 'pending' },
    ];

    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(whEntries),
      }),
    } as any);

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(finEntries),
      }),
    } as any);

    const allEntries = await getQueueEntries('all');
    expect(allEntries.map((e) => e.id)).toEqual([11, 20, 10, 21]);
    expect(allEntries.map((e) => e.createdAt)).toEqual([100, 200, 300, 400]);
  });

  // ─────────────────────────────────────────────────────────────
  // (g) purgeEphemeralQueueEntries
  // ─────────────────────────────────────────────────────────────
  it('(g) purgeEphemeralQueueEntries deletes only ephemeral entries across both DBs', async () => {
    const whEntries: SyncQueueEntry[] = [
      { id: 1, url: '/api/v1/telemetry/event', method: 'POST', body: null, createdAt: 1, retryCount: 0, status: 'pending' },
      { id: 2, url: '/api/v1/warehouse/items/', method: 'POST', body: null, createdAt: 2, retryCount: 0, status: 'pending' },
      { id: 3, url: '/api/v1/auth/logout', method: 'POST', body: null, createdAt: 3, retryCount: 0, status: 'pending' },
    ];
    const finEntries: SyncQueueEntry[] = [
      { id: 4, url: '/api/v1/personnel/users/', method: 'POST', body: null, createdAt: 4, retryCount: 0, status: 'pending' },
      { id: 5, url: '/api/v1/ping', method: 'GET', body: null, createdAt: 5, retryCount: 0, status: 'pending' },
      { id: 6, url: '/api/v1/health/', method: 'GET', body: null, createdAt: 6, retryCount: 0, status: 'pending' },
    ];

    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue(whEntries);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue(finEntries);

    const whBulkDelete = vi.spyOn(warehouseOfflineDb.syncQueue, 'bulkDelete').mockResolvedValue(undefined as any);
    const finBulkDelete = vi.spyOn(financeOfflineDb.syncQueue, 'bulkDelete').mockResolvedValue(undefined as any);

    const purged = await purgeEphemeralQueueEntries();

    expect(purged).toBe(4);
    expect(whBulkDelete).toHaveBeenCalledWith([1, 3]);
    expect(finBulkDelete).toHaveBeenCalledWith([5, 6]);
  });

  // ─────────────────────────────────────────────────────────────
  // (h) buildScopedHeaders and refreshAccessToken
  // ─────────────────────────────────────────────────────────────
  it('(h-1) buildScopedHeaders produces consistent headers across all three installed subsets', () => {
    const subsets = [
      ['warehouse', 'accounting'],
      ['warehouse'],
      ['accounting'],
    ];

    for (const subset of subsets) {
      getModuleRegistry().setInstalledModules(subset);
      sessionStorage.clear();
      localStorage.clear();

      sessionStorage.setItem('wh_access_token_warehouse', 'WH_TOKEN');
      sessionStorage.setItem('wh_access_token_finance', 'FIN_TOKEN');
      sessionStorage.setItem('wh_tab_session_id', 'tab_xyz');

      const whHeaders = buildScopedHeaders('warehouse');
      expect(whHeaders['X-Active-App']).toBe('warehouse');
      expect(whHeaders['X-Active-Role']).toBe('counter');
      expect(whHeaders['Authorization']).toBe('Bearer WH_TOKEN');
      expect(whHeaders['X-Client-Tab-Id']).toBe('tab_xyz');

      const finHeaders = buildScopedHeaders('finance');
      expect(finHeaders['X-Active-App']).toBe('personnel');
      expect(finHeaders['X-Active-Role']).toBe('operator');
      expect(finHeaders['Authorization']).toBe('Bearer FIN_TOKEN');
      expect(finHeaders['X-Client-Tab-Id']).toBe('tab_xyz');
    }
  });

  it('(h-2) refreshAccessToken writes to wh_access_token_finance when active scope is personnel', async () => {
    localStorage.setItem('wh_refresh_token', 'REFRESH_TEST');
    sessionStorage.setItem('active_app_module', 'personnel');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access: 'NEW_FIN_TOKEN', refresh: 'NEW_REFRESH' }),
    });

    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(true);
    expect(sessionStorage.getItem('wh_access_token_finance')).toBe('NEW_FIN_TOKEN');
    expect(localStorage.getItem('wh_access_token_finance')).toBe('NEW_FIN_TOKEN');
    expect(sessionStorage.getItem('wh_access_token_warehouse')).toBeNull();
  });

  it('(h-3) refreshAccessToken writes to wh_access_token_warehouse when active scope is warehouse', async () => {
    localStorage.setItem('wh_refresh_token', 'REFRESH_TEST');
    sessionStorage.setItem('active_app_module', 'warehouse');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access: 'NEW_WH_TOKEN' }),
    });

    const refreshed = await refreshAccessToken();
    expect(refreshed).toBe(true);
    expect(sessionStorage.getItem('wh_access_token_warehouse')).toBe('NEW_WH_TOKEN');
    expect(localStorage.getItem('wh_access_token_warehouse')).toBe('NEW_WH_TOKEN');
    expect(sessionStorage.getItem('wh_access_token_finance')).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // (i) dismissError and deleteError first-found priority
  // ─────────────────────────────────────────────────────────────
  it('(i-1) dismissError and deleteError prioritize warehouseOfflineDb when id exists in both DBs', async () => {
    const errorEntry: SyncErrorEntry = {
      id: 7,
      method: 'POST',
      url: '/api/v1/test/',
      body: {},
      statusCode: 400,
      serverMessage: 'Bad request',
      failedAt: 1000,
      dismissed: 0,
    };

    vi.spyOn(warehouseOfflineDb.syncErrors, 'get').mockResolvedValue(errorEntry);
    vi.spyOn(financeOfflineDb.syncErrors, 'get').mockResolvedValue(errorEntry);

    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'update').mockResolvedValue(1);
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncErrors, 'update').mockResolvedValue(1);

    await dismissError(7);
    expect(whUpdateSpy).toHaveBeenCalledWith(7, { dismissed: 1 });
    expect(finUpdateSpy).not.toHaveBeenCalled();

    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);

    await deleteError(7);
    expect(whDeleteSpy).toHaveBeenCalledWith(7);
    expect(finDeleteSpy).not.toHaveBeenCalled();
  });

  it('(i-2) dismissError and deleteError operate on financeOfflineDb when id is only present in finance', async () => {
    const errorEntry: SyncErrorEntry = {
      id: 7,
      method: 'POST',
      url: '/api/v1/personnel/test/',
      body: {},
      statusCode: 400,
      serverMessage: 'Personnel error',
      failedAt: 1000,
      dismissed: 0,
    };

    vi.spyOn(warehouseOfflineDb.syncErrors, 'get').mockResolvedValue(undefined);
    vi.spyOn(financeOfflineDb.syncErrors, 'get').mockResolvedValue(errorEntry);

    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'update').mockResolvedValue(1);
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncErrors, 'update').mockResolvedValue(1);

    await dismissError(7);
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).toHaveBeenCalledWith(7, { dismissed: 1 });

    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);

    await deleteError(7);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).toHaveBeenCalledWith(7);
  });

  // ─────────────────────────────────────────────────────────────
  // (j) SessionTabService domain-isolated access tokens
  // ─────────────────────────────────────────────────────────────
  it('(j) SessionTabService writes and reads scoped access tokens for personnel and warehouse', () => {
    const sessionTab = new SessionTabService();

    // setScopedAccessToken with 'personnel'
    sessionTab.setScopedAccessToken('PERS_TOKEN', 'personnel');
    expect(sessionStorage.getItem('wh_access_token_finance')).toBe('PERS_TOKEN');
    expect(localStorage.getItem('wh_access_token_finance')).toBe('PERS_TOKEN');
    expect(sessionStorage.getItem('wh_access_token_warehouse')).toBeNull();

    // setScopedAccessToken with 'warehouse'
    sessionTab.setScopedAccessToken('WH_TOKEN', 'warehouse');
    expect(sessionStorage.getItem('wh_access_token_warehouse')).toBe('WH_TOKEN');
    expect(localStorage.getItem('wh_access_token_warehouse')).toBe('WH_TOKEN');

    // getScopedAccessToken('personnel') reads finance key before general token
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('wh_access_token_finance', 'SCOPED_FIN');
    sessionStorage.setItem('wh_access_token', 'GENERAL_TOKEN');
    expect(sessionTab.getScopedAccessToken('personnel')).toBe('SCOPED_FIN');
  });
});
