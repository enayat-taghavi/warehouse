// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cancelQueueEntry, buildScopedHeaders, sendEntry } from './offline-queue-runner';
import { warehouseOfflineDb, financeOfflineDb, SyncQueueEntry } from '../offline-db';
import { OfflineSyncService } from '../offline-sync.service';
import { getModuleRegistry } from '../../modules/module-registry.service';
import { SERVER_ORIGIN_STORAGE_KEY, resolveServerUrl } from '../../platform/server-origin';

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

describe('offline-queue-runner: cancelQueueEntry data-loss protection', () => {
  const createMockEntry = (overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry => ({
    id: 1,
    url: '/api/v1/warehouse/items/',
    method: 'POST',
    body: { name: 'تست' },
    appScope: 'warehouse',
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    userId: 42,
    ...overrides,
  });

  beforeEach(() => {
    localStorage.removeItem('wh_user_profile');
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(undefined);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(undefined);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    vi.spyOn(warehouseOfflineDb as any, 'transaction').mockImplementation((_mode: any, ...args: any[]) => {
      const fn = args[args.length - 1];
      return Promise.resolve().then(() => fn());
    });
    vi.spyOn(financeOfflineDb as any, 'transaction').mockImplementation((_mode: any, ...args: any[]) => {
      const fn = args[args.length - 1];
      return Promise.resolve().then(() => fn());
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancelQueueEntry returns false and keeps the record when entry status is sending', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const sendingEntry = createMockEntry({ id: 10, status: 'sending', userId: 42 });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(sendingEntry);
    const deleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(10, undefined, invalidateSpy);

    expect(result).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('cancelQueueEntry returns false and keeps the record when entry belongs to another user', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const otherUserEntry = createMockEntry({ id: 20, status: 'pending', userId: 99 });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(otherUserEntry);
    const deleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(20, undefined, invalidateSpy);

    expect(result).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('cancelQueueEntry returns true and deletes an own pending record', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const ownPendingEntry = createMockEntry({ id: 30, status: 'pending', userId: 42 });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(ownPendingEntry);
    const deleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(30, undefined, invalidateSpy);

    expect(result).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(30);
    expect(invalidateSpy).toHaveBeenCalledWith('/api/v1/warehouse/items/', 'warehouse');
  });

  it('cancelQueueEntry returns true and deletes record when userId is empty (own record by definition)', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const anonEntry = createMockEntry({ id: 40, status: 'pending', userId: undefined });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(anonEntry);
    const deleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(40, undefined, invalidateSpy);

    expect(result).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(40);
    expect(invalidateSpy).toHaveBeenCalledWith('/api/v1/warehouse/items/', 'warehouse');
  });

  it('cancelQueueEntry returns false when record does not exist', async () => {
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(undefined);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);

    const result = await cancelQueueEntry(999);

    expect(result).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('OfflineSyncService.cancelQueueEntry wraps runner and returns boolean result', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const ownEntry = createMockEntry({ id: 50, status: 'pending', userId: 42 });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(ownEntry);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);

    const service = OfflineSyncService.getInstance();
    const resTrue = await service.cancelQueueEntry(50);
    expect(resTrue).toBe(true);

    const sendingEntry = createMockEntry({ id: 51, status: 'sending', userId: 42 });
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(sendingEntry);
    const resFalse = await service.cancelQueueEntry(51);
    expect(resFalse).toBe(false);
  });

  it('when finance and warehouse share the same id, cancel with scope finance deletes only the finance record', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const whEntry = createMockEntry({ id: 5, appScope: 'warehouse', status: 'pending', userId: 42 });
    const finEntry = createMockEntry({ id: 5, appScope: 'finance', url: '/api/v1/finance/entries/5/', status: 'pending', userId: 42 });

    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(whEntry);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(finEntry);
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(5, 'finance', invalidateSpy);

    expect(result).toBe(true);
    expect(finDeleteSpy).toHaveBeenCalledWith(5);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith('/api/v1/finance/entries/5/', 'finance');
  });

  it('when finance and warehouse share the same id, cancel without scope returns false and deletes nothing (ambiguous id)', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const whEntry = createMockEntry({ id: 5, appScope: 'warehouse', status: 'pending', userId: 42 });
    const finEntry = createMockEntry({ id: 5, appScope: 'finance', url: '/api/v1/finance/entries/5/', status: 'pending', userId: 42 });

    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(whEntry);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(finEntry);
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(5, undefined, invalidateSpy);

    expect(result).toBe(false);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('when finance read throws in an unscoped call, cancelQueueEntry refuses (returns false) and deletes nothing', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const whEntry = createMockEntry({ id: 5, appScope: 'warehouse', status: 'pending', userId: 42 });

    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(whEntry);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockRejectedValue(new Error('Finance DB read error'));
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(5, undefined, invalidateSpy);

    expect(result).toBe(false);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('when warehouse read throws in an unscoped call, cancelQueueEntry refuses (returns false) and deletes nothing', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const finEntry = createMockEntry({ id: 5, appScope: 'finance', url: '/api/v1/finance/entries/5/', status: 'pending', userId: 42 });

    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockRejectedValue(new Error('Warehouse DB read error'));
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(finEntry);
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(5, undefined, invalidateSpy);

    expect(result).toBe(false);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('cancelQueueEntry resets deletedEntry before fallback and returns false if fallback exits on guard', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const entry = createMockEntry({ id: 60, status: 'pending', userId: 42 });

    let getCalls = 0;
    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockImplementation((() => {
      getCalls++;
      if (getCalls === 1) {
        // Transaction callback finds own pending entry and deletes it inside transaction
        return Promise.resolve(entry);
      }
      // Fallback attempt sees entry in sending state
      return Promise.resolve({ ...entry, status: 'sending' });
    }) as any);
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);

    // Make transaction fail with DatabaseClosedError so it falls back to non-transaction attempt
    vi.spyOn(warehouseOfflineDb as any, 'transaction').mockImplementation(async (_mode: any, ...args: any[]) => {
      const fn = args[args.length - 1];
      // Simulate that the callback ran and set deletedEntry, but transaction threw
      await fn();
      throw { name: 'DatabaseClosedError' };
    });
    const invalidateSpy = vi.fn().mockResolvedValue(undefined);

    const result = await cancelQueueEntry(60, 'warehouse', invalidateSpy);

    expect(result).toBe(false);
    expect(whDeleteSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('offline-queue-runner: buildScopedHeaders', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asserts exact headers for warehouse and finance with the real registry', () => {
    sessionStorage.setItem('wh_tab_session_id', 'tab_real_123');
    sessionStorage.setItem('wh_access_token_warehouse', 'token_wh_real');
    sessionStorage.setItem('wh_access_token_finance', 'token_fin_real');

    const whHeaders = buildScopedHeaders('warehouse');
    expect(whHeaders).toEqual({
      'Content-Type': 'application/json',
      'X-Active-App': 'warehouse',
      'X-Active-Role': 'counter',
      'X-Client-Tab-Id': 'tab_real_123',
      'Authorization': 'Bearer token_wh_real',
    });

    const finHeaders = buildScopedHeaders('finance');
    expect(finHeaders).toEqual({
      'Content-Type': 'application/json',
      'X-Active-App': 'personnel',
      'X-Active-Role': 'operator',
      'X-Client-Tab-Id': 'tab_real_123',
      'Authorization': 'Bearer token_fin_real',
    });
  });

  it('asserts exact headers for warehouse and finance with a registry whose getExtensions returns [] (fallback)', () => {
    sessionStorage.setItem('wh_tab_session_id', 'tab_fallback_456');
    sessionStorage.setItem('wh_access_token_warehouse', 'token_wh_fallback');
    sessionStorage.setItem('wh_access_token_finance', 'token_fin_fallback');

    const registry = getModuleRegistry();
    const spy = vi.spyOn(registry, 'getExtensions').mockReturnValue([]);

    const whHeaders = buildScopedHeaders('warehouse');
    expect(whHeaders).toEqual({
      'Content-Type': 'application/json',
      'X-Active-App': 'warehouse',
      'X-Active-Role': 'counter',
      'X-Client-Tab-Id': 'tab_fallback_456',
      'Authorization': 'Bearer token_wh_fallback',
    });

    const finHeaders = buildScopedHeaders('finance');
    expect(finHeaders).toEqual({
      'Content-Type': 'application/json',
      'X-Active-App': 'personnel',
      'X-Active-Role': 'operator',
      'X-Client-Tab-Id': 'tab_fallback_456',
      'Authorization': 'Bearer token_fin_fallback',
    });

    spy.mockRestore();
  });
});

describe('offline-queue-runner: direct fetch server-origin resolution', () => {
  const originalCapacitor = (globalThis as any).Capacitor;

  const createMockEntry = (overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry => ({
    id: 101,
    url: '/api/v1/warehouse/items/',
    method: 'POST',
    body: { name: 'کالای تست' },
    appScope: 'warehouse',
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
    userId: 42,
    ...overrides,
  });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCapacitor !== undefined) {
      (globalThis as any).Capacitor = originalCapacitor;
    } else {
      delete (globalThis as any).Capacitor;
    }
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);
    localStorage.clear();
    sessionStorage.clear();
  });

  it('in native mobile with valid override origin, queued entry is sent with fetch to origin + url, and queued entry retains relative url', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://test.farsalish.ir');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    } as any);

    const entry = createMockEntry({ url: '/api/v1/warehouse/items/' });
    expect(resolveServerUrl(entry.url)).toBe('https://test.farsalish.ir/api/v1/warehouse/items/');
    const result = await sendEntry(entry, warehouseOfflineDb);

    expect(result).toBe('sent');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.farsalish.ir/api/v1/warehouse/items/',
      expect.objectContaining({ method: 'POST' })
    );
    expect(entry.url).toBe('/api/v1/warehouse/items/');
  });

  it('in native mobile on server error retry, queued entry retains relative url and update never stores resolved origin', async () => {
    (globalThis as any).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    localStorage.setItem(SERVER_ORIGIN_STORAGE_KEY, 'https://test.farsalish.ir');

    const updateSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
    } as any);

    const entry = createMockEntry({ url: '/api/v1/warehouse/items/' });
    const result = await sendEntry(entry, warehouseOfflineDb);

    expect(result).toBe('server-error');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.farsalish.ir/api/v1/warehouse/items/',
      expect.objectContaining({ method: 'POST' })
    );
    expect(entry.url).toBe('/api/v1/warehouse/items/');
    expect(updateSpy).toHaveBeenCalledWith(
      entry.id,
      expect.not.objectContaining({ url: expect.stringContaining('https://') })
    );
  });

  it('on the web platform, queued entry is fetched with relative url unchanged', async () => {
    delete (globalThis as any).Capacitor;
    localStorage.removeItem(SERVER_ORIGIN_STORAGE_KEY);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    } as any);

    const entry = createMockEntry({ url: '/api/v1/warehouse/items/' });
    expect(resolveServerUrl(entry.url)).toBe('/api/v1/warehouse/items/');
    const result = await sendEntry(entry, warehouseOfflineDb);

    expect(result).toBe('sent');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/warehouse/items/',
      expect.objectContaining({ method: 'POST' })
    );
    expect(entry.url).toBe('/api/v1/warehouse/items/');
  });
});

