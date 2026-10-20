import type { ModuleRegistryService } from './module-registry.service';

type RegistryLike = Partial<Pick<ModuleRegistryService, 'getExtensions' | 'getInstalledModules'>> | null | undefined;

/**
 * مسیر بایگانی اسناد شرکت از ماژول نصب‌شده‌ای که `layoutNav.hasCompanyDocumentsArchive` دارد.
 * برای mockهای ناقص رجیستری در تست‌ها، نبودِ متد به معنای نبودِ بایگانی است.
 */
export function findCompanyDocumentsRoute(registry: RegistryLike): string | undefined {
  if (typeof registry?.getExtensions === 'function') {
    return registry.getExtensions('layoutNav')
      .find(e => e.extension.hasCompanyDocumentsArchive)?.extension.companyDocumentsRoute;
  }
  if (typeof registry?.getInstalledModules === 'function') {
    return registry.getInstalledModules()
      .find(m => m.extensions?.layoutNav?.hasCompanyDocumentsArchive)?.extensions?.layoutNav?.companyDocumentsRoute;
  }
  return undefined;
}

/**
 * آیا آدرس به بایگانی اسناد شرکت (یا نام مستعار قدیمی `documents` در همان والد) اشاره می‌کند؟
 */
export function isCompanyDocumentsUrl(url: string, archiveRoute: string | undefined): boolean {
  if (!archiveRoute) return false;
  const clean = (url || '').split('?')[0];
  const normalized = clean.startsWith('/') ? clean : `/${clean}`;
  if (normalized.startsWith(archiveRoute)) return true;
  const lastSlash = archiveRoute.lastIndexOf('/');
  return lastSlash > 0 && normalized.startsWith(`${archiveRoute.substring(0, lastSlash)}/documents`);
}
