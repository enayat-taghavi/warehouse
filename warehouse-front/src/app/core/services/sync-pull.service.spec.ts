import { TestBed } from '@angular/core/testing';
import { SyncPullService } from './sync-pull.service';
import { ModuleRegistryService } from '../modules/module-registry.service';

describe('SyncPullService', () => {
  it('باید نمونهٔ سرویس را با تزریق ModuleRegistryService مقداردهی کند', () => {
    TestBed.configureTestingModule({
      providers: [SyncPullService, ModuleRegistryService],
    });
    const service = TestBed.inject(SyncPullService);
    expect(service).toBeTruthy();
    expect(SyncPullService.getInstance()).toBe(service);
  });
});
