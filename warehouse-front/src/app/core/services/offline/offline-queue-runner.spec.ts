// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cancelQueueEntry } from './offline-queue-runner';
import { warehouseOfflineDb, financeOfflineDb, SyncQueueEntry } from '../offline-db';
import { OfflineSyncService } from '../offline-sync.service';

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

(globalThis as any).localStorage = createStorageMock();
(globalThis as any).sessionStorage = createStorageMock();

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
    localStorage.clear();
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
});
