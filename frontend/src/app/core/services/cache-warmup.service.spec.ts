import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheWarmupService } from './cache-warmup.service';
import { ActiveCompanyService } from './active-company.service';
import { NetworkStatusService } from './network-status.service';
import { getModuleRegistry } from '../modules/module-registry.service';

function createStorageMock(): Storage {
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
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorageMock(),
    writable: true,
    configurable: true,
  });
}
if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorageMock(),
    writable: true,
    configurable: true,
  });
}
if (typeof window !== 'undefined') {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', {
      value: globalThis.localStorage,
      writable: true,
      configurable: true,
    });
  }
  if (!window.sessionStorage) {
    Object.defineProperty(window, 'sessionStorage', {
      value: globalThis.sessionStorage,
      writable: true,
      configurable: true,
    });
  }
}

describe('CacheWarmupService', () => {
  let service: CacheWarmupService;
  let activeCompanyMock: {
    activeCompanyId: number | null;
    activeCompany$: BehaviorSubject<any>;
  };
  let hookA: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('wh_access_token', 't');
    sessionStorage.setItem('wh_user_profile', JSON.stringify({ id: 7 }));

    activeCompanyMock = {
      activeCompanyId: 3,
      activeCompany$: new BehaviorSubject(null),
    };

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

    TestBed.configureTestingModule({
      providers: [
        CacheWarmupService,
        { provide: ActiveCompanyService, useValue: activeCompanyMock },
      ],
    });

    service = TestBed.inject(CacheWarmupService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. calls each warmCache hook with the injector when online', async () => {
    await service.warm();
    expect(hookA).toHaveBeenCalledOnce();
    const firstArg = hookA.mock.calls[0][0];
    expect(firstArg).toBeDefined();
    expect(typeof firstArg.get).toBe('function');
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
    expect(hookA).toHaveBeenCalledOnce();

    await service.warm(true);
    expect(hookA).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('wh_cache_warmup:7:3')).not.toBeNull();
  });

  it('5. a failing hook does not stop the next one and warm never throws', async () => {
    const hookFail = vi.fn().mockRejectedValue(new Error('x'));
    const hookSuccess = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(getModuleRegistry(), 'getExtensions').mockReturnValue([
      {
        module: {} as any,
        moduleCode: 'm1',
        extension: {
          scopeKind: 'x',
          pullEndpoint: '/p',
          scopeParamKey: 'k',
          warmCache: hookFail,
        },
      },
      {
        module: {} as any,
        moduleCode: 'm2',
        extension: {
          scopeKind: 'x',
          pullEndpoint: '/p',
          scopeParamKey: 'k',
          warmCache: hookSuccess,
        },
      },
    ] as any);

    await expect(service.warm()).resolves.toBeUndefined();
    expect(hookFail).toHaveBeenCalledOnce();
    expect(hookSuccess).toHaveBeenCalledOnce();
  });

  it('6. throttle key is per company', async () => {
    await service.warm();
    expect(hookA).toHaveBeenCalledOnce();

    activeCompanyMock.activeCompanyId = 4;
    await service.warm();
    expect(hookA).toHaveBeenCalledTimes(2);
  });
});
