// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  migrateLegacyData,
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

    expect(targetQueue.add).toHaveBeenCalledTimes(2);
    expect(legacyTable.update).toHaveBeenCalledWith(301, expect.any(Object));
    expect(legacyTable.update).toHaveBeenCalledWith(302, expect.any(Object));
    // Marker must NOT be set when any row fails
    expect(localStorage.getItem(LEGACY_MIGRATION_MARKER)).toBeNull();
  });
});
