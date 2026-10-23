// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Dexie from 'dexie';
import {
  migrateLegacyData,
  migrateLegacyDatabaseIfNeeded,
  LEGACY_MIGRATION_MARKER,
  LegacyDatabaseLike,
  LegacyMigrationTargets
} from './offline-db';

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

describe('Legacy Database Migration (Session 17)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('۱. marker set means nothing is read (wh_legacy_offline_db_migrated_v1)', async () => {
    localStorage.setItem(LEGACY_MIGRATION_MARKER, 'true');
    const tableSpy = vi.fn();
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'docTasks' }, { name: 'syncQueue' }],
      table: tableSpy
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        docTasks: {
          get: vi.fn(),
          bulkAdd: vi.fn()
        },
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      },
      finance: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(tableSpy).not.toHaveBeenCalled();
    expect(targets.warehouse.docTasks!.bulkAdd).not.toHaveBeenCalled();
    expect(targets.warehouse.syncQueue.add).not.toHaveBeenCalled();
  });

  it('۲. existing docTasks row is not overwritten and a missing one is added', async () => {
    const legacyDocs = [
      { sync_id: 'sync-existing-1', title: 'Old Legacy Copy 1', _offlinePending: false },
      { sync_id: 'sync-missing-2', title: 'Legacy Doc 2', _offlinePending: false }
    ];
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'docTasks' }],
      table: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(legacyDocs),
        update: vi.fn().mockResolvedValue(1)
      })
    };

    const targetDocTasks = {
      get: vi.fn().mockImplementation(async (syncId: string) => {
        if (syncId === 'sync-existing-1') {
          return { sync_id: 'sync-existing-1', title: 'Newer Local Edit 1', _offlinePending: true };
        }
        return undefined;
      }),
      bulkAdd: vi.fn().mockResolvedValue(['sync-missing-2'])
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        docTasks: targetDocTasks,
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      },
      finance: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(targetDocTasks.get).toHaveBeenCalledWith('sync-existing-1');
    expect(targetDocTasks.get).toHaveBeenCalledWith('sync-missing-2');
    expect(targetDocTasks.bulkAdd).toHaveBeenCalledTimes(1);
    expect(targetDocTasks.bulkAdd).toHaveBeenCalledWith([legacyDocs[1]]);
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });

  it('۳. a legacy queue row is added once without its legacy id and gets migratedAt', async () => {
    const legacyQueue = [
      { id: 999, url: '/api/warehouse/tasks/10/', method: 'POST', createdAt: 1600000000000, body: { count: 5 } }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockResolvedValue(1)
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };

    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn().mockResolvedValue(1)
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        syncQueue: targetQueue
      },
      finance: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(targetQueue.add).toHaveBeenCalledTimes(1);
    const addedItem = targetQueue.add.mock.calls[0][0];
    expect(addedItem.id).toBeUndefined();
    expect(addedItem.url).toBe('/api/warehouse/tasks/10/');
    expect(addedItem.appScope).toBe('warehouse');
    expect(legacyTable.update).toHaveBeenCalledWith(999, expect.objectContaining({
      migratedAt: expect.any(Number)
    }));
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });

  it('۴. a row with migratedAt is skipped', async () => {
    const legacyQueue = [
      { id: 101, url: '/api/warehouse/tasks/1/', method: 'POST', createdAt: 1600000000000, migratedAt: 1600000050000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn()
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };

    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn()
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        syncQueue: targetQueue
      },
      finance: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(targetQueue.filter).not.toHaveBeenCalled();
    expect(targetQueue.add).not.toHaveBeenCalled();
    expect(legacyTable.update).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });

  it('۵. a second run with an existing copy adds nothing', async () => {
    const legacyQueue = [
      { id: 202, url: '/api/finance/attendance/1/', method: 'POST', createdAt: 1600000000000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockResolvedValue(1)
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };

    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 5, url: '/api/finance/attendance/1/', method: 'POST', createdAt: 1600000000000 })
      }),
      add: vi.fn()
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      },
      finance: {
        syncQueue: targetQueue
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(targetQueue.filter).toHaveBeenCalledTimes(1);
    expect(targetQueue.add).not.toHaveBeenCalled();
    expect(legacyTable.update).toHaveBeenCalledWith(202, expect.objectContaining({
      migratedAt: expect.any(Number)
    }));
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });

  it('۶. a failing row leaves the marker unset', async () => {
    const legacyQueue = [
      { id: 301, url: '/api/warehouse/tasks/1/', method: 'POST', createdAt: 1600000000000 },
      { id: 302, url: '/api/warehouse/tasks/2/', method: 'POST', createdAt: 1600000001000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockImplementation(async (id: number) => {
        if (id === 301) throw new Error('Simulated update error on row 1');
        return 1;
      })
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };

    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn().mockResolvedValue(1)
    };
    const targets: LegacyMigrationTargets = {
      warehouse: {
        syncQueue: targetQueue
      },
      finance: {
        syncQueue: {
          filter: vi.fn() as any,
          add: vi.fn()
        }
      }
    };

    await migrateLegacyData(legacy, targets);

    expect(targetQueue.add).toHaveBeenCalledTimes(1);
    expect(legacyTable.update).toHaveBeenCalledWith(301, expect.any(Object));
    expect(legacyTable.update).toHaveBeenCalledWith(302, expect.any(Object));
    // Marker must NOT be set when any row fails
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBeNull();
  });

  it('۷. the claim update happens before targetQueue.add', async () => {
    const callOrder: string[] = [];
    const legacyQueue = [
      { id: 401, url: '/api/warehouse/items/', method: 'POST', createdAt: 1600000000000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockImplementation(async (id: number, changes: any) => {
        callOrder.push(`claim-${id}-${changes.migratedAt != null}`);
        return 1;
      })
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };
    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn().mockImplementation(async () => {
        callOrder.push('target-add');
        return 1;
      })
    };
    const targets: LegacyMigrationTargets = {
      warehouse: { syncQueue: targetQueue },
      finance: { syncQueue: { filter: vi.fn() as any, add: vi.fn() } }
    };

    await migrateLegacyData(legacy, targets);

    expect(callOrder).toEqual(['claim-401-true', 'target-add']);
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });

  it('۸. a failing add releases the claim and leaves the marker unset', async () => {
    const legacyQueue = [
      { id: 501, url: '/api/warehouse/items/', method: 'POST', createdAt: 1600000000000 }
    ];
    const updateCalls: Array<{ id: number; changes: any }> = [];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockImplementation(async (id: number, changes: any) => {
        updateCalls.push({ id, changes });
        return 1;
      })
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };
    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn().mockRejectedValue(new Error('Simulated add failure'))
    };
    const targets: LegacyMigrationTargets = {
      warehouse: { syncQueue: targetQueue },
      finance: { syncQueue: { filter: vi.fn() as any, add: vi.fn() } }
    };

    await migrateLegacyData(legacy, targets);

    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]).toEqual({
      id: 501,
      changes: expect.objectContaining({ migratedAt: expect.any(Number) })
    });
    expect(updateCalls[1]).toEqual({
      id: 501,
      changes: { migratedAt: undefined }
    });
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBeNull();
  });

  it('۹. a failing claim adds nothing', async () => {
    const legacyQueue = [
      { id: 601, url: '/api/warehouse/items/', method: 'POST', createdAt: 1600000000000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn().mockRejectedValue(new Error('Simulated claim update disk error'))
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };
    const targetQueue = {
      filter: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null)
      }),
      add: vi.fn().mockResolvedValue(1)
    };
    const targets: LegacyMigrationTargets = {
      warehouse: { syncQueue: targetQueue },
      finance: { syncQueue: { filter: vi.fn() as any, add: vi.fn() } }
    };

    await migrateLegacyData(legacy, targets);

    expect(legacyTable.update).toHaveBeenCalledWith(601, expect.objectContaining({
      migratedAt: expect.any(Number)
    }));
    expect(targetQueue.filter).not.toHaveBeenCalled();
    expect(targetQueue.add).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBeNull();
  });

  it('۱۰. with a mocked navigator.locks.request the migration body runs inside it, and without navigator.locks it still runs', async () => {
    const originalNavigatorLocks = (navigator as any).locks;
    const getDbsSpy = vi.spyOn(Dexie, 'getDatabaseNames').mockResolvedValue([]);

    try {
      // الف) با وجود navigator.locks.request، مهاجرت درون قفل اختصاصی اجرا می‌شود
      const lockExecutionOrder: string[] = [];
      const mockRequest = vi.fn().mockImplementation(async (name: string, options: any, callback: () => Promise<any>) => {
        lockExecutionOrder.push(`lock-acquired:${name}:${options?.mode}`);
        const result = await callback();
        lockExecutionOrder.push('lock-released');
        return result;
      });

      Object.defineProperty(navigator, 'locks', {
        value: { request: mockRequest },
        configurable: true,
        writable: true
      });

      await migrateLegacyDatabaseIfNeeded();

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(
        'wh-legacy-offline-migration',
        { mode: 'exclusive' },
        expect.any(Function)
      );
      expect(getDbsSpy).toHaveBeenCalledTimes(1);
      expect(lockExecutionOrder).toEqual([
        'lock-acquired:wh-legacy-offline-migration:exclusive',
        'lock-released'
      ]);

      // ب) بدون navigator.locks نیز بدنه مهاجرت به شکل مستقیم اجرا می‌شود
      Object.defineProperty(navigator, 'locks', {
        value: undefined,
        configurable: true,
        writable: true
      });

      getDbsSpy.mockClear();
      await migrateLegacyDatabaseIfNeeded();

      expect(getDbsSpy).toHaveBeenCalledTimes(1);
    } finally {
      getDbsSpy.mockRestore();
      Object.defineProperty(navigator, 'locks', {
        value: originalNavigatorLocks,
        configurable: true,
        writable: true
      });
    }
  });

  it('۱۱. a row without id is skipped and logged without calling claim or add', async () => {
    const legacyQueue = [
      { url: '/api/warehouse/tasks/1/', method: 'POST', createdAt: 1600000000000 }
    ];
    const legacyTable = {
      toArray: vi.fn().mockResolvedValue(legacyQueue),
      update: vi.fn()
    };
    const legacy: LegacyDatabaseLike = {
      tables: [{ name: 'syncQueue' }],
      table: vi.fn().mockReturnValue(legacyTable)
    };
    const targetQueue = {
      filter: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }),
      add: vi.fn()
    };
    const targets: LegacyMigrationTargets = {
      warehouse: { syncQueue: targetQueue },
      finance: { syncQueue: { filter: vi.fn() as any, add: vi.fn() } }
    };

    await migrateLegacyData(legacy, targets);

    expect(legacyTable.update).not.toHaveBeenCalled();
    expect(targetQueue.add).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBe('true');
  });
});
