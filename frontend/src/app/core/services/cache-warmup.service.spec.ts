import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { CacheWarmupService } from './cache-warmup.service';
import { ActiveCompanyService } from './active-company.service';
import { NetworkStatusService } from './network-status.service';
import { getModuleRegistry } from '../modules/module-registry.service';

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
if (typeof globalThis.sessionStorage === 'undefined' || typeof globalThis.sessionStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  });
}

describe('CacheWarmupService', () => {
  let service: CacheWarmupService;
  let activeCompanyMock: { activeCompanyId: number | null; activeCompany$: BehaviorSubject<unknown> };
  let hookA: any;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('wh_access_token', 't');
    sessionStorage.setItem('wh_user_profile', JSON.stringify({ id: 7 }));

    activeCompanyMock = {
      activeCompanyId: 3,
      activeCompany$: new BehaviorSubject<unknown>(null),
    };

    TestBed.configureTestingModule({
      providers: [
        CacheWarmupService,
        { provide: ActiveCompanyService, useValue: activeCompanyMock },
      ],
    });

    service = TestBed.inject(CacheWarmupService);

    hookA = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(true);

    vi.spyOn(getModuleRegistry(), 'getExtensions').mockReturnValue([
      {
        module: {} as any,
        moduleCode: 'm1',
        extension: {
          scopeKind: 'x',
          pullEndpoint: '/p',
          scopeParamKey: 'k',
          warmCache: hookA,
        },
      },
    ] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. calls each warmCache hook with the injector when online', async () => {
    await service.warm();
    expect(hookA).toHaveBeenCalledTimes(1);
    expect(typeof hookA.mock.calls[0][0]?.get).toBe('function');
  });

  it('2. does nothing when offline', async () => {
    vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(false);
    await service.warm();
    expect(hookA).not.toHaveBeenCalled();
  });

  it('3. does nothing without a token or without an active company', async () => {
    sessionStorage.removeItem('wh_access_token');
    localStorage.removeItem('wh_access_token');
    await service.warm();
    expect(hookA).not.toHaveBeenCalled();

    sessionStorage.setItem('wh_access_token', 't');
    activeCompanyMock.activeCompanyId = null;
    await service.warm();
    expect(hookA).not.toHaveBeenCalled();
  });

  it('4. second call within 10 minutes is skipped, force runs it', async () => {
    await service.warm();
    await service.warm();
    expect(hookA).toHaveBeenCalledTimes(1);

    await service.warm(true);
    expect(hookA).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('wh_cache_warmup:7:3')).not.toBeNull();
  });

  it('5. a failing hook does not stop the next one and warm never throws', async () => {
    const hook1 = vi.fn().mockRejectedValue(new Error('x'));
    const hook2 = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(getModuleRegistry(), 'getExtensions').mockReturnValue([
      {
        module: {} as any,
        moduleCode: 'm1',
        extension: {
          scopeKind: 'x',
          pullEndpoint: '/p',
          scopeParamKey: 'k',
          warmCache: hook1,
        },
      },
      {
        module: {} as any,
        moduleCode: 'm2',
        extension: {
          scopeKind: 'x',
          pullEndpoint: '/p',
          scopeParamKey: 'k',
          warmCache: hook2,
        },
      },
    ] as any);

    await expect(service.warm()).resolves.toBeUndefined();
    expect(hook1).toHaveBeenCalledTimes(1);
    expect(hook2).toHaveBeenCalledTimes(1);
  });

  it('6. throttle key is per company', async () => {
    await service.warm();
    expect(hookA).toHaveBeenCalledTimes(1);

    activeCompanyMock.activeCompanyId = 4;
    await service.warm();
    expect(hookA).toHaveBeenCalledTimes(2);
  });
});
