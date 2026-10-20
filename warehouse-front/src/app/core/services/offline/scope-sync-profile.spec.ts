// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  warehouseOfflineDb,
  financeOfflineDb,
  getScopeSyncProfile,
  DEFAULT_OFFLINE_SCOPE,
  SyncQueueEntry
} from '../offline-db';
import { buildScopedHeaders, runQueueSequential, getUnsentCountStrict, getPendingCount } from './offline-queue-runner';
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

const WH = { tokenKey: 'wh_access_token_warehouse', activeAppHeader: 'warehouse', defaultOfflineRole: 'counter' };
const FIN = { tokenKey: 'wh_access_token_finance', activeAppHeader: 'personnel', defaultOfflineRole: 'operator' };

function qaModule(syncOverrides: Record<string, string> = {}): WhFrontendModule {
  return {
    code: 'qa_mod',
    titleFa: 'ماژول تست کیفی',
    titleShortFa: 'کیفیت',
    descriptionFa: 'ماژول آزمایشی نمایهٔ همگام‌سازی',
    icon: '🧪',
    routePrefix: '/app/qa-mod',
    defaultRoute: '/app/qa-mod/dashboard',
    scopeKind: 'qa_mod',
    permissionMarkers: [],
    roles: [],
    extensions: {
      syncConfig: {
        scopeKind: 'qa_mod',
        pullEndpoint: '/qa-mod/sync/pull/',
        scopeParamKey: 'qa_id',
        activeAppHeader: 'qa_mod',
        defaultOfflineRole: 'qa_role',
        tokenScopeKey: 'qa_mod',
        ...syncOverrides
      },
      offlineSync: {
        scopeKind: 'qa_mod',
        dbName: 'WarehouseOfflineDB_qa_mod',
        queueUrlPatterns: ['/qa-mod/'],
        activePathPatterns: ['/app/qa-mod'],
        appRoutePrefixes: ['/app/qa-mod']
      }
    }
  };
}

describe('Scope sync profile from syncConfig (step 6, session 27)', () => {
  let originalModules: WhFrontendModule[];
  let originalInstalledCodes: string[];

  beforeEach(() => {
    originalModules = [...getModuleRegistry().getAllModules()];
    originalInstalledCodes = getModuleRegistry().getInstalledCodes();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    (getModuleRegistry() as any).modules = originalModules;
    getModuleRegistry().setInstalledModules(originalInstalledCodes);
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. today\'s values for warehouse, finance, personnel, accounting and xyz under every installed subset', () => {
    const subsets: string[][] = [['warehouse', 'accounting'], ['warehouse'], ['accounting']];
    for (const subset of subsets) {
      (getModuleRegistry() as any).modules = originalModules.filter(m => subset.includes(m.code));
      for (const scope of ['warehouse', 'xyz']) {
        expect(getScopeSyncProfile(scope), `${subset}:${scope}`).toEqual({ scope: 'warehouse', ...WH });
      }
      for (const scope of ['finance', 'personnel', 'accounting']) {
        expect(getScopeSyncProfile(scope), `${subset}:${scope}`).toEqual({ scope: 'finance', ...FIN });
      }
    }
    expect(DEFAULT_OFFLINE_SCOPE).toBe('warehouse');
  });

  it('2. buildScopedHeaders keeps today\'s token key, header and role for warehouse and finance', () => {
    sessionStorage.setItem('wh_access_token_warehouse', 'wh-token');
    sessionStorage.setItem('wh_access_token_finance', 'fin-token');
    const wh = buildScopedHeaders('warehouse');
    expect(wh['Authorization']).toBe('Bearer wh-token');
    expect(wh['X-Active-App']).toBe('warehouse');
    expect(wh['X-Active-Role']).toBe('counter');
    const fin = buildScopedHeaders('finance');
    expect(fin['Authorization']).toBe('Bearer fin-token');
    expect(fin['X-Active-App']).toBe('personnel');
    expect(fin['X-Active-Role']).toBe('operator');
  });

  it('3. a registered fake module qa_mod with its own syncConfig gets its own token key, header and role', () => {
    getModuleRegistry().registerModule(qaModule());
    expect(getScopeSyncProfile('qa_mod')).toEqual({
      scope: 'qa_mod', tokenKey: 'wh_access_token_qa_mod', activeAppHeader: 'qa_mod', defaultOfflineRole: 'qa_role'
    });
    sessionStorage.setItem('wh_access_token_qa_mod', 'qa-token');
    sessionStorage.setItem('wh_access_token_warehouse', 'wh-token');
    const headers = buildScopedHeaders('qa_mod');
    expect(headers['Authorization']).toBe('Bearer qa-token');
    expect(headers['X-Active-App']).toBe('qa_mod');
    expect(headers['X-Active-Role']).toBe('qa_role');
  });

  it('4. a module can never take over the locked token keys or the locked scopes', () => {
    getModuleRegistry().registerModule(qaModule({ tokenScopeKey: 'warehouse' }));
    expect(getScopeSyncProfile('qa_mod').tokenKey).toBe('wh_access_token_warehouse');
    expect(getScopeSyncProfile('qa_mod').activeAppHeader).toBe('warehouse');

    getModuleRegistry().registerModule({
      ...qaModule(),
      code: 'qa_hijack',
      extensions: { syncConfig: { scopeKind: 'finance', pullEndpoint: '/x/', scopeParamKey: 'id', activeAppHeader: 'evil', defaultOfflineRole: 'evil', tokenScopeKey: 'evil' } }
    });
    expect(getScopeSyncProfile('finance')).toEqual({ scope: 'finance', ...FIN });
  });

  it('5. a drain where one DB read rejects still sends the entries of the other DB', async () => {
    localStorage.setItem('wh_user_profile', JSON.stringify({ id: 42 }));
    const finEntry: SyncQueueEntry = {
      id: 30, url: '/api/v1/personnel/user/1', method: 'POST', body: { a: 1 },
      createdAt: 200, status: 'pending', retryCount: 0, userId: 42, appScope: 'finance',
    };
    let finItems: SyncQueueEntry[] = [finEntry];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(warehouseOfflineDb.syncQueue, 'where').mockImplementation(() => { throw new Error('DB blocked'); });
    vi.spyOn(financeOfflineDb.syncQueue, 'where').mockImplementation(() => ({
      anyOf: vi.fn(() => ({
        sortBy: vi.fn(async () => [...finItems]),
        count: vi.fn(async () => finItems.length),
      })),
    } as any));
    vi.spyOn(financeOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    const finDelete = vi.spyOn(financeOfflineDb.syncQueue, 'delete').mockImplementation((async (id: any) => {
      finItems = finItems.filter(e => e.id !== id);
    }) as any);
    const sentUrls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      sentUrls.push(String(url));
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const mockNetwork = {
      isBrowserOnline: true, reportServerUnreachable: vi.fn(), reportServerReachable: vi.fn(),
    } as unknown as NetworkStatusService;

    const outcome = await runQueueSequential(mockNetwork);

    expect(sentUrls.length).toBe(1);
    expect(sentUrls[0]).toContain('/api/v1/personnel/user/1');
    expect(finDelete).toHaveBeenCalledWith(30);
    expect(outcome.status).toBe('completed');
    expect(warn).toHaveBeenCalled();
    await expect(getPendingCount()).resolves.toBe(0);
  });

  it('6. getUnsentCountStrict fails closed when one DB cannot be read', async () => {
    vi.spyOn(warehouseOfflineDb.syncQueue, 'count').mockRejectedValue(new Error('DB blocked'));
    vi.spyOn(financeOfflineDb.syncQueue, 'count').mockResolvedValue(3);
    await expect(getUnsentCountStrict()).rejects.toThrow('DB blocked');
  });
});
