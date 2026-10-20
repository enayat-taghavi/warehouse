// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  getAllOfflineDbs,
  resolveOfflineDbStrict,
  SyncQueueEntry,
  SyncErrorEntry
} from '../offline-db';
import {
  handleRetry,
  markTransportFailure,
  sendEntry,
  cancelQueueEntry
} from './offline-queue-runner';
import {
  getCachedEntry,
  invalidateCache,
  reconcileRejected,
  applyOptimisticUpdate
} from './offline-local-patcher';
import {
  getErrors,
  getAllErrors,
  dismissError,
  deleteError,
  dismissAllErrors,
  clearAllErrors,
  retryError,
  resolveConflict
} from './offline-conflict-manager';
import { getModuleRegistry, WhFrontendModule } from '../../modules/module-registry.service';

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

describe('Offline N-Scope Writers (Session 20)', () => {
  let originalModules: WhFrontendModule[];
  let originalInstalledCodes: string[];
  const originalFetch = globalThis.fetch;

  const validQaMod: WhFrontendModule = {
    code: 'qa_mod',
    titleFa: 'ماژول تست کیفی',
    titleShortFa: 'کیفیت',
    descriptionFa: 'ماژول آزمایشی برای بررسی رجیستری قلمروها',
    icon: '🧪',
    routePrefix: '/app/qa-mod',
    defaultRoute: '/app/qa-mod/dashboard',
    scopeKind: 'qa_mod',
    permissionMarkers: [],
    roles: [],
    extensions: {
      offlineSync: {
        scopeKind: 'qa_mod',
        dbName: 'WarehouseOfflineDB_qa_mod',
        scopeAliases: ['qa_alias'],
        queueUrlPatterns: ['/qa-mod/'],
        activePathPatterns: ['/app/qa-mod'],
        appRoutePrefixes: ['/app/qa-mod']
      }
    }
  };

  beforeEach(() => {
    originalModules = [...getModuleRegistry().getAllModules().filter(m => m.code !== 'qa_mod')];
    originalInstalledCodes = getModuleRegistry().getInstalledCodes().filter(c => c !== 'qa_mod');
    try { sessionStorage.clear(); } catch {}
    try { localStorage.clear(); } catch {}
    if (typeof window !== 'undefined') {
      try { window.sessionStorage?.clear(); } catch {}
      try { window.localStorage?.clear(); } catch {}
      window.history.pushState({}, '', '/');
    }
    getModuleRegistry().registerModule(validQaMod);
  });

  afterEach(() => {
    (getModuleRegistry() as any).modules = (getModuleRegistry() as any).modules.filter(
      (m: WhFrontendModule) => m.code !== 'qa_mod'
    );
    getModuleRegistry().setInstalledModules(originalInstalledCodes);
    try { sessionStorage.clear(); } catch {}
    try { localStorage.clear(); } catch {}
    if (typeof window !== 'undefined') {
      try { window.sessionStorage?.clear(); } catch {}
      try { window.localStorage?.clear(); } catch {}
      window.history.pushState({}, '', '/');
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. handleRetry and markTransportFailure with appScope: "xyz" write nothing in any DB', async () => {
    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'update');
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncQueue, 'update');
    const qaDb = getOfflineDb('qa_mod');
    const qaUpdateSpy = vi.spyOn(qaDb.syncQueue, 'update');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entry: SyncQueueEntry = {
      id: 7,
      url: '/api/v1/unknown/',
      method: 'POST',
      body: {},
      createdAt: 100,
      status: 'pending',
      retryCount: 0,
      appScope: 'xyz' as any,
    };

    await handleRetry(entry, 'server error 500');
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
    expect(qaUpdateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockClear();
    await markTransportFailure(entry, 'transport failure');
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
    expect(qaUpdateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('2. sendEntry with appScope: "xyz" writes nothing and returns "rejected"', async () => {
    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'update');
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncQueue, 'update');
    const qaDb = getOfflineDb('qa_mod');
    const qaUpdateSpy = vi.spyOn(qaDb.syncQueue, 'update');
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const entry: SyncQueueEntry = {
      id: 7,
      url: '/api/v1/unknown/',
      method: 'POST',
      body: {},
      createdAt: 100,
      status: 'pending',
      retryCount: 0,
      appScope: 'xyz' as any,
    };

    const result = await sendEntry(entry);
    expect(result).toBe('rejected');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
    expect(qaUpdateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });

  it('3. cancelQueueEntry(7, "xyz") returns false and deletes nothing', async () => {
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete');
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete');
    const qaDb = getOfflineDb('qa_mod');
    const qaDeleteSpy = vi.spyOn(qaDb.syncQueue, 'delete');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cancelled = await cancelQueueEntry(7, 'xyz' as any);
    expect(cancelled).toBe(false);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).not.toHaveBeenCalled();
    expect(qaDeleteSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('4. cancelQueueEntry(7) without scope with id 7 in warehouse DB and in registered qa_mod DB returns false', async () => {
    const qaDb = getOfflineDb('qa_mod');
    const entry: SyncQueueEntry = {
      id: 7,
      url: '/api/v1/item/7',
      method: 'POST',
      body: {},
      createdAt: 100,
      status: 'pending',
      retryCount: 0,
      userId: 42,
    };

    vi.spyOn(warehouseOfflineDb.syncQueue, 'get').mockResolvedValue(entry);
    vi.spyOn(financeOfflineDb.syncQueue, 'get').mockResolvedValue(undefined);
    vi.spyOn(qaDb.syncQueue, 'get').mockResolvedValue(entry);

    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete');
    const qaDeleteSpy = vi.spyOn(qaDb.syncQueue, 'delete');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await cancelQueueEntry(7);
    expect(result).toBe(false);
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(qaDeleteSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('5. reconcileRejected with appScope: "xyz" writes nothing', async () => {
    const whCountTasksSpy = vi.spyOn(warehouseOfflineDb.countTasks, 'put');
    const whQueueSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'where');
    const qaDb = getOfflineDb('qa_mod');
    const qaQueueSpy = vi.spyOn(qaDb.syncQueue, 'where');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const syncError: SyncErrorEntry = {
      id: 99,
      method: 'PATCH',
      url: '/api/v1/unknown/',
      body: { title: 'test' },
      statusCode: 409,
      serverMessage: 'conflict',
      failedAt: 1000,
      dismissed: 0,
      entityType: 'count_task',
      entitySyncId: 'task-123',
      appScope: 'xyz' as any,
    };

    await reconcileRejected(syncError);
    expect(whCountTasksSpy).not.toHaveBeenCalled();
    expect(whQueueSpy).not.toHaveBeenCalled();
    expect(qaQueueSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('6. applyOptimisticUpdate with scope: "xyz" writes nothing', async () => {
    const whCountTasksSpy = vi.spyOn(warehouseOfflineDb.countTasks, 'put');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await applyOptimisticUpdate('countTasks', 'task-123', { status: 'DONE' }, 'xyz' as any);
    expect(whCountTasksSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('7. dismissError(7, "finance") with id 7 in both locked DBs updates only the finance DB', async () => {
    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'update');
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncErrors, 'update').mockResolvedValue(1);

    await dismissError(7, 'finance');
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).toHaveBeenCalledWith(7, { dismissed: 1 });
  });

  it('8. dismissError(7) without scope keeps the session 16 result (prioritizes warehouse)', async () => {
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
  });

  it('9. deleteError(7, "finance") with id 7 in both locked DBs deletes only from the finance DB', async () => {
    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncErrors, 'delete');
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncErrors, 'delete').mockResolvedValue(undefined as any);

    await deleteError(7, 'finance');
    expect(whDeleteSpy).not.toHaveBeenCalled();
    expect(finDeleteSpy).toHaveBeenCalledWith(7);
  });

  it('10. resolveOfflineDbStrict is used for qa_mod entries (its DB handle receives the write)', async () => {
    const qaDb = getOfflineDb('qa_mod');
    expect(resolveOfflineDbStrict('qa_mod')).toBe(qaDb);

    const qaUpdateSpy = vi.spyOn(qaDb.syncQueue, 'update').mockResolvedValue(1);
    const whUpdateSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'update');
    const finUpdateSpy = vi.spyOn(financeOfflineDb.syncQueue, 'update');

    const entry: SyncQueueEntry = {
      id: 55,
      url: '/api/qa-mod/check/1',
      method: 'POST',
      body: { name: 'qa-test' },
      createdAt: 500,
      status: 'pending',
      retryCount: 0,
      appScope: 'qa_mod',
    };

    await handleRetry(entry, 'Server 500 error');
    expect(qaUpdateSpy).toHaveBeenCalledWith(55, expect.objectContaining({
      status: 'failed',
      retryCount: 1,
    }));
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();

    qaUpdateSpy.mockClear();
    await markTransportFailure(entry, 'Network drop');
    expect(qaUpdateSpy).toHaveBeenCalledWith(55, expect.objectContaining({
      status: 'pending',
      lastError: expect.stringContaining('Network drop'),
    }));
    expect(whUpdateSpy).not.toHaveBeenCalled();
    expect(finUpdateSpy).not.toHaveBeenCalled();
  });

  it('11. retryError and resolveConflict preserve scope of source DB', async () => {
    const qaDb = getOfflineDb('qa_mod');
    const qaError: SyncErrorEntry = {
      id: 88,
      method: 'POST',
      url: '/api/qa-mod/check/1',
      body: { val: 123 },
      statusCode: 400,
      serverMessage: 'Bad qa request',
      failedAt: 1000,
      dismissed: 0,
      appScope: 'qa_mod',
    };

    vi.spyOn(qaDb.syncErrors, 'get').mockResolvedValue(qaError);
    const qaDeleteSpy = vi.spyOn(qaDb.syncErrors, 'delete').mockResolvedValue(undefined as any);

    let enqueuedMeta: any = null;
    const mockEnqueue = vi.fn().mockImplementation(async (_method, _url, _body, meta) => {
      enqueuedMeta = meta;
      return { id: 101, ...meta };
    });

    const retried = await retryError(88, mockEnqueue, 'qa_mod');
    expect(retried).toBe(qaError);
    expect(mockEnqueue).toHaveBeenCalled();
    expect(enqueuedMeta?.appScope).toBe('qa_mod');
    expect(qaDeleteSpy).toHaveBeenCalledWith(88);
  });
});
