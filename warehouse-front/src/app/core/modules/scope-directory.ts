import { ModuleRegistryService, getModuleRegistry } from './module-registry.service';

/** اندپوینت فهرست قلمرو عملیاتی که ماژول نصب‌شدهٔ صاحب آن اعلام کرده (scopeDirectory.endpoint) */
export function getScopeDirectoryEndpoint(registry: ModuleRegistryService = getModuleRegistry()): string | undefined {
  return registry.getExtensions('scopeDirectory')
    .map(e => e.extension.endpoint)
    .find((ep): ep is string => !!ep);
}

/** ماژول نصب‌شده‌ای فیلتر قلمرو بین‌ماژولی عرضه می‌کند (scopeDirectory.offersScopeFilter) */
export function hasScopeDirectoryFilter(registry: ModuleRegistryService | null | undefined = getModuleRegistry()): boolean {
  return !!registry?.getExtensions('scopeDirectory').some(e => !!e.extension.offersScopeFilter);
}
