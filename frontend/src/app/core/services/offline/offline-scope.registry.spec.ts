// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeScope,
  getScopedDbName,
  resolveScopeFromUrl,
  getCurrentActiveAppScope,
  getOfflineDb,
  resolveOfflineDbStrict,
  getAllOfflineDbs,
  warehouseOfflineDb,
  financeOfflineDb
} from '../offline-db';
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

describe('Offline Scope Registry Resolution (Session 18)', () => {
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
  });

  afterEach(() => {
    (getModuleRegistry() as any).modules = originalModules;
    getModuleRegistry().setInstalledModules(originalInstalledCodes);
    sessionStorage.clear();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('1. registers a valid third module qa_mod and resolves scope from URL', () => {
    getModuleRegistry().registerModule(validQaMod);
    expect(resolveScopeFromUrl('/api/qa-mod/x/')).toBe('qa_mod');
    expect(resolveScopeFromUrl('https://server.local/api/qa-mod/items/42')).toBe('qa_mod');
  });

  it('2. getOfflineDb creates and reuses database instance for qa_mod with correct name', () => {
    getModuleRegistry().registerModule(validQaMod);
    const db1 = getOfflineDb('qa_mod');
    expect(db1.name).toBe('WarehouseOfflineDB_qa_mod');

    const db2 = getOfflineDb('qa_mod');
    expect(db2).toBe(db1);
  });

  it('3. getAllOfflineDbs returns 3 entries with the locked two first when qa_mod is registered', () => {
    getModuleRegistry().registerModule(validQaMod);
    const dbs = getAllOfflineDbs();
    expect(dbs.length).toBe(3);
    expect(dbs[0]).toBe(warehouseOfflineDb);
    expect(dbs[1]).toBe(financeOfflineDb);
    expect(dbs[2].name).toBe('WarehouseOfflineDB_qa_mod');
  });

  it('4. ignores module with invalid dbName and logs console.error once', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalidMod: WhFrontendModule = {
      ...validQaMod,
      code: 'bad_db_mod',
      scopeKind: 'bad_db_mod',
      extensions: {
        offlineSync: {
          scopeKind: 'bad_db_mod',
          dbName: 'CustomDB_invalid',
          queueUrlPatterns: ['/bad-db/'],
          activePathPatterns: [],
          appRoutePrefixes: []
        }
      }
    };
    getModuleRegistry().registerModule(invalidMod);

    expect(resolveScopeFromUrl('/api/bad-db/x/')).toBe('warehouse');
    expect(resolveOfflineDbStrict('bad_db_mod')).toBeNull();
    expect(getScopedDbName('bad_db_mod')).toBe('WarehouseOfflineDB_warehouse');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('5. ignores module with uppercase scopeKind and logs console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const upperMod: WhFrontendModule = {
      ...validQaMod,
      code: 'UPPER_MOD',
      scopeKind: 'UPPER_MOD',
      extensions: {
        offlineSync: {
          scopeKind: 'UPPER_MOD',
          dbName: 'WarehouseOfflineDB_UPPER_MOD',
          queueUrlPatterns: ['/upper/'],
          activePathPatterns: [],
          appRoutePrefixes: []
        }
      }
    };
    getModuleRegistry().registerModule(upperMod);

    expect(resolveScopeFromUrl('/api/upper/x/')).toBe('warehouse');
    expect(resolveOfflineDbStrict('UPPER_MOD')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('6. ignores module claiming scopeKind personnel or locked finance dbName for another scope', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const personnelClaimMod: WhFrontendModule = {
      ...validQaMod,
      code: 'fake_personnel',
      scopeKind: 'personnel',
      extensions: {
        offlineSync: {
          scopeKind: 'personnel',
          dbName: 'WarehouseOfflineDB_personnel',
          queueUrlPatterns: ['/fake-pers/'],
          activePathPatterns: [],
          appRoutePrefixes: []
        }
      }
    };
    const financeHijackMod: WhFrontendModule = {
      ...validQaMod,
      code: 'hijack_fin',
      scopeKind: 'hijack_fin',
      extensions: {
        offlineSync: {
          scopeKind: 'hijack_fin',
          dbName: 'WarehouseOfflineDB_finance',
          queueUrlPatterns: ['/hijack/'],
          activePathPatterns: [],
          appRoutePrefixes: []
        }
      }
    };

    getModuleRegistry().registerModule(personnelClaimMod);
    getModuleRegistry().registerModule(financeHijackMod);

    expect(resolveScopeFromUrl('/api/fake-pers/x/')).toBe('warehouse');
    expect(resolveScopeFromUrl('/api/hijack/x/')).toBe('warehouse');
    expect(resolveOfflineDbStrict('hijack_fin')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('7. with setInstalledModules(["warehouse"]), getOfflineDb("finance") is still financeOfflineDb and resolveScopeFromUrl is still finance', () => {
    getModuleRegistry().setInstalledModules(['warehouse']);

    expect(getOfflineDb('finance')).toBe(financeOfflineDb);
    expect(resolveScopeFromUrl('/api/payroll/x/')).toBe('finance');
  });

  it('8. resolveOfflineDbStrict returns locked instance, registered DB, or null for invalid/unknown scopes', () => {
    getModuleRegistry().registerModule(validQaMod);

    expect(resolveOfflineDbStrict('xyz')).toBeNull();
    expect(resolveOfflineDbStrict('')).toBeNull();
    expect(resolveOfflineDbStrict(undefined)).toBeNull();
    expect(resolveOfflineDbStrict(null)).toBeNull();

    expect(resolveOfflineDbStrict('personnel')).toBe(financeOfflineDb);
    expect(resolveOfflineDbStrict('accounting')).toBe(financeOfflineDb);
    expect(resolveOfflineDbStrict('finance')).toBe(financeOfflineDb);
    expect(resolveOfflineDbStrict('warehouse')).toBe(warehouseOfflineDb);

    const qaDb = resolveOfflineDbStrict('qa_mod');
    expect(qaDb).not.toBeNull();
    expect(qaDb?.name).toBe('WarehouseOfflineDB_qa_mod');

    const qaAliasDb = resolveOfflineDbStrict('qa_alias');
    expect(qaAliasDb).toBe(qaDb);
  });

  it('9. offlineSync.scopeKind equals syncConfig.scopeKind for both real modules', () => {
    const acct = getModuleRegistry().getSpec('accounting');
    expect(acct).toBeDefined();
    expect(acct?.extensions?.offlineSync?.scopeKind).toBe(acct?.extensions?.syncConfig?.scopeKind);

    const wh = getModuleRegistry().getSpec('warehouse');
    expect(wh).toBeDefined();
    expect(wh?.extensions?.offlineSync?.scopeKind).toBe(wh?.extensions?.syncConfig?.scopeKind);
  });

  it('10. normalizeScope and getCurrentActiveAppScope handle registered non-locked scopes and aliases', () => {
    getModuleRegistry().registerModule(validQaMod);

    expect(normalizeScope('qa_mod')).toBe('qa_mod');
    expect(normalizeScope('qa_alias')).toBe('qa_mod');
    expect(normalizeScope('QA_MOD')).toBe('qa_mod');

    window.history.pushState({}, '', '/app/qa-mod/items');
    expect(getCurrentActiveAppScope()).toBe('qa_mod');
  });
});
