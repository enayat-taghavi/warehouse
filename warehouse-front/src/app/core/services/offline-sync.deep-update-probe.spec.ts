// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflineSyncService } from './offline-sync.service';
import { getModuleRegistry } from '../modules/module-registry.service';
import { DeepUpdateState } from './offline/offline-sync.models';

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

describe('OfflineSyncService: deep-update probe error classification and reachability', () => {
  let service: OfflineSyncService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let registrySpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  const warehouseSyncConfig = {
    scopeKind: 'warehouse' as const,
    pullEndpoint: '/inventory/sync/pull/',
    scopeParamKey: 'warehouse_id',
    activeAppHeader: 'warehouse',
    defaultOfflineRole: 'counter',
    tokenScopeKey: 'warehouse',
  };

  function mockResponse(status: number, ok: boolean = status >= 200 && status < 300) {
    return Promise.resolve({
      status,
      ok,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    registrySpy = vi.spyOn(getModuleRegistry(), 'getExtensions').mockImplementation((key: string) => {
      if (key === 'syncConfig') {
        return [{ moduleCode: 'warehouse', extension: warehouseSyncConfig } as any];
      }
      return [];
    });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    service = OfflineSyncService.getInstance();
    (service as any)._deepUpdateState$.next(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    registrySpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('401 gives the session-expired message', async () => {
    fetchMock.mockImplementation(() => mockResponse(401, false));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'نشست شما منقضی شده است. لطفا وارد شوید.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('530 gives "سرور در دسترس نیست"', async () => {
    fetchMock.mockImplementation(() => mockResponse(530, false));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'سرور در دسترس نیست'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('503 gives "سرور در دسترس نیست"', async () => {
    fetchMock.mockImplementation(() => mockResponse(503, false));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'سرور در دسترس نیست'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a network rejection gives "سرور در دسترس نیست"', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'سرور در دسترس نیست'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('403 gives the rejected message containing the numeric status', async () => {
    fetchMock.mockImplementation(() => mockResponse(403, false));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'سرور درخواست بروزرسانی عمیق را نپذیرفت (کد 403).'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('500 gives the rejected message containing the numeric status', async () => {
    fetchMock.mockImplementation(() => mockResponse(500, false));

    await expect(service.performDeepUpdate([1], { 1: 'انبار مرکزی' })).rejects.toThrow(
      'سرور درخواست بروزرسانی عمیق را نپذیرفت (کد 500).'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('in every failing case fetch was called exactly once and deep-update state observable never reported isActive: true', async () => {
    const failureScenarios: Array<{
      name: string;
      action: () => Promise<Response>;
      expectedMessage: string;
    }> = [
      {
        name: '401',
        action: () => mockResponse(401, false),
        expectedMessage: 'نشست شما منقضی شده است. لطفا وارد شوید.',
      },
      {
        name: '530',
        action: () => mockResponse(530, false),
        expectedMessage: 'سرور در دسترس نیست',
      },
      {
        name: '503',
        action: () => mockResponse(503, false),
        expectedMessage: 'سرور در دسترس نیست',
      },
      {
        name: 'network-rejection',
        action: () => Promise.reject(new TypeError('Network offline')),
        expectedMessage: 'سرور در دسترس نیست',
      },
      {
        name: '403',
        action: () => mockResponse(403, false),
        expectedMessage: 'سرور درخواست بروزرسانی عمیق را نپذیرفت (کد 403).',
      },
      {
        name: '500',
        action: () => mockResponse(500, false),
        expectedMessage: 'سرور درخواست بروزرسانی عمیق را نپذیرفت (کد 500).',
      },
    ];

    for (const scenario of failureScenarios) {
      fetchMock.mockReset();
      fetchMock.mockImplementation(scenario.action);
      (service as any)._deepUpdateState$.next(null);

      const emittedStates: (DeepUpdateState | null)[] = [];
      const sub = service.deepUpdateState$.subscribe((state) => emittedStates.push(state));

      await expect(
        service.performDeepUpdate([10], { 10: 'انبار تست' })
      ).rejects.toThrow(scenario.expectedMessage);

      sub.unsubscribe();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const activeEmitted = emittedStates.some((s) => s?.isActive === true);
      expect(activeEmitted).toBe(false);
    }
  });

  it('an empty id list returns [] without calling fetch', async () => {
    const result = await service.performDeepUpdate([], {});

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
