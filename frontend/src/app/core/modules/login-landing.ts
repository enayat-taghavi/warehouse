import { ModuleRegistryService } from './module-registry.service';

/** مقصد پس از ورود (یا تغییر رمز) و کد اپ فعالی که باید ذخیره شود */
export interface LoginLanding {
  route: string;
  activeAppModule: string | null;
}

/**
 * مقصد پس از ورود از routeAccess ماژول‌های نصب‌شده: اگر کاربر فقط به یک ماژول دسترسی دارد
 * صفحهٔ ورود همان ماژول، وگرنه لانچر. هسته نام هیچ ماژولی را نمی‌داند.
 */
export function resolveLoginLanding(registry: ModuleRegistryService, perms: string[], isSuper: boolean): LoginLanding {
  const accessible = registry.getInstalledModules().filter((mod) => {
    const routeAccess = mod.routeAccess ?? registry.getSpec(mod.code)?.routeAccess;
    if (!routeAccess) return false;
    return isSuper || routeAccess.loginPermissions.some((p) => perms.includes(p));
  });

  if (accessible.length === 1) {
    const mod = accessible[0];
    const routeAccess = mod.routeAccess ?? registry.getSpec(mod.code)?.routeAccess;
    if (routeAccess) {
      return { route: routeAccess.resolveLoginRoute(perms), activeAppModule: routeAccess.loginActiveAppModule };
    }
  }
  return { route: '/app/launcher', activeAppModule: null };
}
