import { ModuleRegistryService, getModuleRegistry } from './module-registry.service';
import { PERMISSION_ALIAS_PREFIX } from './permission-alias-token';

export { PERMISSION_ALIAS_PREFIX, permissionAlias } from './permission-alias-token';

/** کدهای مجوزی که ماژول‌های نصب‌شده برای یک توانایی اعلام کرده‌اند (extension permissionAliases) */
export function getPermissionAliases(capability: string, registry: ModuleRegistryService = getModuleRegistry()): string[] {
  const codes = registry.getExtensions('permissionAliases').flatMap(e => e.extension[capability] || []);
  return Array.from(new Set(codes));
}

/** توکن‌های alias: را با کدهای اعلام‌شده جایگزین می‌کند؛ کد عادی دست‌نخورده می‌ماند */
export function expandPermissionAliases(perms: string[], registry: ModuleRegistryService = getModuleRegistry()): string[] {
  const out: string[] = [];
  for (const p of perms) {
    if (p.startsWith(PERMISSION_ALIAS_PREFIX)) {
      out.push(...getPermissionAliases(p.slice(PERMISSION_ALIAS_PREFIX.length), registry));
    } else {
      out.push(p);
    }
  }
  return Array.from(new Set(out));
}
