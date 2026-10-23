import { TestBed } from '@angular/core/testing';
import { SyncPullService } from './sync-pull.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';

describe('SyncPullService', () => {
  it('باید نمونهٔ سرویس را با تزریق ModuleRegistryService مقداردهی کند', () => {
    TestBed.configureTestingModule({
      providers: [SyncPullService],
    });
    const service = TestBed.inject(SyncPullService);
    expect(service).toBeTruthy();
    expect(SyncPullService.getInstance()).toBe(service);
  });

  it('نمونه واحد: TestBed.inject(ModuleRegistryService) === getModuleRegistry()', () => {
    TestBed.configureTestingModule({});
    const diRegistry = TestBed.inject(ModuleRegistryService);
    const staticRegistry = getModuleRegistry();
    expect(diRegistry === staticRegistry).toBe(true);
    expect(diRegistry).toBe(staticRegistry);
  });

  it('SyncPullService.getInstance() بیرون از TestBed.runInInjectionContext بدون خطا نمونه برمیگرداند', () => {
    const instance = SyncPullService.getInstance();
    expect(instance).toBeTruthy();
    expect(instance instanceof SyncPullService).toBe(true);
    expect(instance.pullProgress$).toBeDefined();
    expect(instance.isPulling$).toBeDefined();
  });
});
