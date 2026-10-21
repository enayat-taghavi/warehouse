import { ModuleRegistryService, getModuleRegistry } from './module-registry.service';

/** اندپوینت فهرست انبارها که ماژول نصب‌شدهٔ صاحب آن اعلام کرده (crossModuleFilters.warehouseDirectoryEndpoint) */
export function getWarehouseDirectoryEndpoint(registry: ModuleRegistryService = getModuleRegistry()): string | undefined {
  return registry.getExtensions('crossModuleFilters')
    .map(e => e.extension.warehouseDirectoryEndpoint)
    .find((ep): ep is string => !!ep);
}
