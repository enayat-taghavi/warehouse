// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import {
  warehouseOfflineDb,
  financeOfflineDb,
  getOfflineDb,
  getAllOfflineDbs,
  resolveOfflineDbStrict,
  SyncQueueEntry
} from '../offline-db';
import {
  runQueueSequential,
  getPendingCount,
  getUnsentCountStrict,
  getQueueEntries
} from './offline-queue-runner';
import { countUnsentEntries } from '../server-restore-gate';
import { purgeEphemeralQueueEntries } from './offline-local-patcher';
import { getModuleRegistry, WhFrontendModule } from '../../modules/module-registry.service';
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

describe('Offline N-Scope Readers (Session 19)', () => {
  let originalModules: WhFrontendModule[];
  let originalInstalledCodes: string[];

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
    originalModules = [...getModuleRegistry().getAllModules()];
    originalInstalledCodes = getModuleRegistry().getInstalledCodes();
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    getModuleRegistry().registerModule(validQaMod);
  });

  afterEach(() => {
    (getModuleRegistry() as any).modules = originalModules;
    getModuleRegistry().setInstalledModules(originalInstalledCodes);
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('1. runQueueSequential drains qa_mod entry with its own DB handle in global createdAt order', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));

    const qaDb = getOfflineDb('qa_mod');

    const whEntry: SyncQueueEntry = {
      id: 10,
      url: '/api/v1/warehouse/item/1',
      method: 'POST',
      body: { name: 'wh-item' },
      createdAt: 100,
      status: 'pending',
      retryCount: 0,
      userId: 42,
      appScope: 'warehouse',
    };

    const qaEntry: SyncQueueEntry = {
      id: 20,
      url: '/api/qa-mod/check/1',
      method: 'POST',
      body: { name: 'qa-check' },
      createdAt: 150,
      status: 'pending',
      retryCount: 0,
      userId: 42,
      appScope: 'qa_mod',
    };

    const finEntry: SyncQueueEntry = {
      id: 30,
      url: '/api/v1/personnel/user/1',
      method: 'POST',
      body: { name: 'fin-user' },
      createdAt: 200,
      status: 'pending',
      retryCount: 0,
      userId: 42,
      appScope: 'finance',
    };

    let whItems: SyncQueueEntry[] = [whEntry];
    let qaItems: SyncQueueEntry[] = [qaEntry];
    let finItems: SyncQueueEntry[] = [finEntry];

    const whDeleteSpy = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      whItems = whItems.filter((e) => e.id !== id);
    }) as any);
    const qaDeleteSpy = vi.spyOn(qaDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      qaItems = qaItems.filter((e) => e.id !== id);
    }) as any);
    const finDeleteSpy = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      finItems = finItems.filter((e) => e.id !== id);
    }) as any);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(qaDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(financeOfflineDb.syncQueue, 'update').mockResolvedValue(1);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...whItems].sort((a, b) => a.createdAt - b.createdAt)),
        toArray: vi.fn(async () => [...whItems]),
        count: vi.fn(async () => whItems.length),
      })),
    } as any));

    vi.spyOn(qaDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...qaItems].sort((a, b) => a.createdAt - b.createdAt)),
        toArray: vi.fn(async () => [...qaItems]),
        count: vi.fn(async () => qaItems.length),
      })),
    } as any));

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...finItems].sort((a, b) => a.createdAt - b.createdAt)),
        toArray: vi.fn(async () => [...finItems]),
        count: vi.fn(async () => finItems.length),
      })),
    } as any));

    const sentUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      sentUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });

    const mockNetwork = {
      isBrowserOnline: true,
      reportServerUnreachable: vi.fn(),
      reportServerReachable: vi.fn(),
    } as unknown as NetworkStatusService;

    const outcome = await runQueueSequential(mockNetwork);

    expect(outcome.status).toBe('completed');
    if (outcome.status === 'completed') {
      expect(outcome.synced).toBe(3);
    }

    expect(sentUrls.length).toBe(3);
    expect(sentUrls[0]).toContain('/api/v1/warehouse/item/1');
    expect(sentUrls[1]).toContain('/api/qa-mod/check/1');
    expect(sentUrls[2]).toContain('/api/v1/personnel/user/1');

    expect(whDeleteSpy).toHaveBeenCalledWith(10);
    expect(qaDeleteSpy).toHaveBeenCalledWith(20);
    expect(finDeleteSpy).toHaveBeenCalledWith(30);
  });

  it('1b. a 401 in one scope keeps only that DB queued; the other scopes still drain', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    // بدون refresh token: refresh ناموفق و رکورد qa_mod در صف می‌ماند
    const qaDb = getOfflineDb('qa_mod');
    const mk = (id: number, url: string, createdAt: number, appScope: string): SyncQueueEntry => ({
      id, url, method: 'POST', body: {}, createdAt, status: 'pending', retryCount: 0, userId: 42, appScope,
    });
    let whItems = [mk(10, '/api/v1/warehouse/item/1', 300, 'warehouse')];
    let qaItems = [mk(20, '/api/qa-mod/check/1', 100, 'qa_mod'), mk(21, '/api/qa-mod/check/2', 150, 'qa_mod')];
    let finItems = [mk(30, '/api/v1/personnel/user/1', 200, 'finance')];

    const fakeTable = (get: () => SyncQueueEntry[], set: (v: SyncQueueEntry[]) => void) => ({
      del: async (id: any) => set(get().filter((e) => e.id !== id)),
      where: () => ({
        anyOf: vi.fn(() => ({
          sortBy: vi.fn(async () => [...get()].sort((a, b) => a.createdAt - b.createdAt)),
          toArray: vi.fn(async () => [...get()]),
          count: vi.fn(async () => get().length),
        })),
      }) as any,
    });
    const wh = fakeTable(() => whItems, (v) => (whItems = v));
    const qa = fakeTable(() => qaItems, (v) => (qaItems = v));
    const fin = fakeTable(() => finItems, (v) => (finItems = v));
    vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockImplementation(wh.del as any);
    const qaDeleteSpy = vi.spyOn(qaDb.syncQueue, 'delete').mockImplementation(qa.del as any);
    vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockImplementation(fin.del as any);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(qaDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(financeOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockImplementation(wh.where);
    vi.spyOn(qaDb.syncQueue, 'where').mockImplementation(qa.where);
    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockImplementation(fin.where);

    const sentUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      sentUrls.push(String(url));
      const unauthorized = String(url).includes('/qa-mod/');
      return { ok: !unauthorized, status: unauthorized ? 401 : 200, json: async () => ({}) };
    });
    const mockNetwork = {
      isBrowserOnline: true,
      reportServerUnreachable: vi.fn(),
      reportServerReachable: vi.fn(),
    } as unknown as NetworkStatusService;

    const outcome = await runQueueSequential(mockNetwork);

    expect(outcome.status).toBe('auth-required');
    // فقط نخستین رکورد qa_mod فرستاده شد؛ دومی بی‌ارسال در صف ماند
    expect(sentUrls.filter((u) => u.includes('/qa-mod/')).length).toBe(1);
    expect(sentUrls.some((u) => u.includes('/api/v1/personnel/user/1'))).toBe(true);
    expect(sentUrls.some((u) => u.includes('/api/v1/warehouse/item/1'))).toBe(true);
    expect(qaDeleteSpy).not.toHaveBeenCalled();
    expect(qaItems.map((e) => e.id)).toEqual([20, 21]);
    expect(whItems.length).toBe(0);
    expect(finItems.length).toBe(0);
  });

  it('2. getPendingCount includes qa_mod in total when scope is all or omitted', async () => {
    const qaDb = getOfflineDb('qa_mod');

    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(2),
      }),
    } as any);

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(3),
      }),
    } as any);

    vi.spyOn(qaDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(4),
      }),
    } as any);

    const totalAll = await getPendingCount('all');
    expect(totalAll).toBe(9);

    const totalOmitted = await getPendingCount();
    expect(totalOmitted).toBe(9);

    const qaOnly = await getPendingCount('qa_mod');
    expect(qaOnly).toBe(4);
  });

  it('3. getUnsentCountStrict includes qa_mod in total unsent count', async () => {
    const qaDb = getOfflineDb('qa_mod');

    vi.spyOn(warehouseOfflineDb.syncQueue, 'count').mockResolvedValue(10);
    vi.spyOn(financeOfflineDb.syncQueue, 'count').mockResolvedValue(20);
    vi.spyOn(qaDb.syncQueue, 'count').mockResolvedValue(30);

    const unsent = await getUnsentCountStrict();
    expect(unsent).toBe(60);
  });

  it('4. getQueueEntries("all") merges and sorts entries from every DB including qa_mod', async () => {
    const qaDb = getOfflineDb('qa_mod');

    const whEntry = { id: 1, createdAt: 300 } as SyncQueueEntry;
    const qaEntry = { id: 2, createdAt: 100 } as SyncQueueEntry;
    const finEntry = { id: 3, createdAt: 200 } as SyncQueueEntry;

    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([whEntry]),
      }),
    } as any);

    vi.spyOn(qaDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([qaEntry]),
        sortBy: vi.fn().mockResolvedValue([qaEntry]),
      }),
    } as any);

    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([finEntry]),
      }),
    } as any);

    const allEntries = await getQueueEntries('all');
    expect(allEntries.map((e) => e.createdAt)).toEqual([100, 200, 300]);

    const qaEntries = await getQueueEntries('qa_mod');
    expect(qaEntries.map((e) => e.createdAt)).toEqual([100]);
  });

  it('5. getPendingCount("xyz") is 0 and getQueueEntries("xyz") is empty array', async () => {
    expect(resolveOfflineDbStrict('xyz')).toBeNull();
    const count = await getPendingCount('xyz');
    expect(count).toBe(0);

    const entries = await getQueueEntries('xyz');
    expect(entries).toEqual([]);
  });

  it('6. countUnsentEntries counts a qa_mod row and a row from an unknown device DB returned by Dexie.getDatabaseNames', async () => {
    const qaDb = getOfflineDb('qa_mod');

    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 1 }] as any);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([{ id: 2 }] as any);
    vi.spyOn(qaDb.syncQueue, 'toArray').mockResolvedValue([{ id: 3 }, { id: 4 }] as any);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'count').mockResolvedValue(1);
    vi.spyOn(financeOfflineDb.syncQueue, 'count').mockResolvedValue(1);
    vi.spyOn(qaDb.syncQueue, 'count').mockResolvedValue(2);

    vi.spyOn(Dexie, 'getDatabaseNames').mockResolvedValue([
      'WarehouseOfflineDB_warehouse',
      'WarehouseOfflineDB_finance',
      'WarehouseOfflineDB_qa_mod',
      'WarehouseOfflineDB_unknown_old',
    ]);

    vi.spyOn(Dexie.prototype, 'open').mockImplementation(async function(this: any) {
      if (this.name === 'WarehouseOfflineDB_unknown_old') {
        this._allTables = {
          syncQueue: {
            name: 'syncQueue',
            count: vi.fn().mockResolvedValue(4),
          },
        };
      }
      return this;
    });

    vi.spyOn(Dexie.prototype, 'close').mockImplementation(() => {});

    const total = await countUnsentEntries(null);
    // 1 (wh) + 1 (fin) + 2 (qa) + 4 (unknown) = 8
    expect(total).toBe(8);
  });

  it('7. countUnsentEntries rejects if Dexie.getDatabaseNames rejects', async () => {
    const qaDb = getOfflineDb('qa_mod');
    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(qaDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(warehouseOfflineDb.syncQueue, 'count').mockResolvedValue(0);
    vi.spyOn(financeOfflineDb.syncQueue, 'count').mockResolvedValue(0);
    vi.spyOn(qaDb.syncQueue, 'count').mockResolvedValue(0);

    vi.spyOn(Dexie, 'getDatabaseNames').mockRejectedValue(new Error('IndexedDB blocked'));

    await expect(countUnsentEntries(null)).rejects.toThrow('IndexedDB blocked');
  });

  it('8. purgeEphemeralQueueEntries does not touch the qa_mod DB', async () => {
    const qaDb = getOfflineDb('qa_mod');

    const whBulkDelete = vi.spyOn(warehouseOfflineDb.syncQueue, 'bulkDelete').mockResolvedValue(undefined as any);
    const finBulkDelete = vi.spyOn(financeOfflineDb.syncQueue, 'bulkDelete').mockResolvedValue(undefined as any);
    const qaBulkDelete = vi.spyOn(qaDb.syncQueue, 'bulkDelete').mockResolvedValue(undefined as any);

    vi.spyOn(warehouseOfflineDb.syncQueue, 'toArray').mockResolvedValue([
      { id: 1, url: '/api/v1/telemetry/ping' } as any,
    ]);
    vi.spyOn(financeOfflineDb.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(qaDb.syncQueue, 'toArray').mockResolvedValue([
      { id: 99, url: '/api/qa-mod/telemetry/heartbeat' } as any,
    ]);

    const deleted = await purgeEphemeralQueueEntries();
    expect(deleted).toBe(1);

    expect(whBulkDelete).toHaveBeenCalledWith([1]);
    expect(qaBulkDelete).not.toHaveBeenCalled();
  });
});
