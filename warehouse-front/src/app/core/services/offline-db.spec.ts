// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { financeOfflineDb, warehouseOfflineDb, isSensitiveConflictScope } from './offline-db';

describe('OfflineDatabase schema and indexing specifications', () => {
  it('should include project_id as an indexed key in financeOfflineDb attendanceRecords table', () => {
    expect(financeOfflineDb.attendanceRecords).toBeDefined();
    const indexes = financeOfflineDb.attendanceRecords.schema.indexes;
    const indexNames = indexes.map(idx => idx.name);
    
    expect(indexNames).toContain('project_id');
    expect(indexNames).toContain('date');
    expect(indexNames).toContain('status');
  });

  it('should include project_id as an indexed key in warehouseOfflineDb attendanceRecords table', () => {
    expect(warehouseOfflineDb.attendanceRecords).toBeDefined();
    const indexes = warehouseOfflineDb.attendanceRecords.schema.indexes;
    const indexNames = indexes.map(idx => idx.name);
    
    expect(indexNames).toContain('project_id');
  });

  it('should find project_id index in table schema indexes', () => {
    const hasIndexInFinance = financeOfflineDb.attendanceRecords.schema.indexes.some(idx => idx.name === 'project_id');
    const hasIndexInWarehouse = warehouseOfflineDb.attendanceRecords.schema.indexes.some(idx => idx.name === 'project_id');

    expect(hasIndexInFinance).toBe(true);
    expect(hasIndexInWarehouse).toBe(true);
  });
});

describe('isSensitiveConflictScope (offlineSync.sensitiveConflicts of the owning module)', () => {
  it('is true for the finance scope and its aliases, false for warehouse, unknown and empty', () => {
    expect(isSensitiveConflictScope('finance')).toBe(true);
    expect(isSensitiveConflictScope('personnel')).toBe(true);
    expect(isSensitiveConflictScope('accounting')).toBe(true);
    expect(isSensitiveConflictScope('warehouse')).toBe(false);
    expect(isSensitiveConflictScope('no_such_scope')).toBe(false);
    expect(isSensitiveConflictScope(null)).toBe(false);
  });
});
