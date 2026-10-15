import { TestBed } from '@angular/core/testing';
import { PhotoUploadQueueService } from './photo-upload-queue.service';
import { ModuleRegistryService } from '../modules/module-registry.service';

describe('PhotoUploadQueueService', () => {
  it('باید نمونهٔ سرویس را با تزریق ModuleRegistryService مقداردهی کند', () => {
    TestBed.configureTestingModule({
      providers: [PhotoUploadQueueService, ModuleRegistryService],
    });
    const service = TestBed.inject(PhotoUploadQueueService);
    expect(service).toBeTruthy();
    expect(PhotoUploadQueueService.getInstance()).toBe(service);
  });
});
