import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ModuleRouteAccess, WhFrontendModule } from '../modules/module-contract';
import { expandPermissionAliases } from '../modules/permission-aliases';
import { AppPersonaService } from '../services/app-persona.service';
import { ActiveCompanyService } from '../services/active-company.service';

/**
 * گارد فعال بودن ماژول انبارداری برای شرکت فعال — هدایت مستقیم به پرتال لانچر
 */
export const WarehouseCompanyGuard: CanActivateFn = () => {
  const activeCompany = inject(ActiveCompanyService, { optional: true });
  const router = inject(Router);

  if (activeCompany?.activeCompany && activeCompany.activeCompany.has_warehouse_module === false) {
    router.navigate(['/app/launcher']);
    return false;
  }
  return true;
};

/**
 * گارد احراز هویت — فقط کاربران لاگین‌شده اجازه ورود دارند
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  'users': ['view_sys_users'],
};

function getModuleRouteAccess(mod?: WhFrontendModule | null): ModuleRouteAccess | undefined {
  if (!mod) return undefined;
  return mod.routeAccess ?? (mod.code ? getModuleRegistry().getSpec(mod.code)?.routeAccess : undefined);
}

function getRequiredRoutePermissions(path: string): string[] | undefined {
  const core = ROUTE_PERMISSIONS[path];
  if (core) {
    return core;
  }
  const installed = getModuleRegistry().getInstalledModules();
  for (const mod of installed) {
    const routeAccess = getModuleRouteAccess(mod);
    const perms = routeAccess?.pagePermissions?.[path];
    if (perms) {
      // توکن alias: (مجوز ماژول دیگر با نام توانایی) به کدهای اعلام‌شدهٔ ماژول‌های نصب‌شده باز می‌شود
      return expandPermissionAliases(perms);
    }
  }
  return undefined;
}

/** آیا کاربر از گارد مجوز صفحه (ROUTE_PERMISSIONS) رد می‌شود؟ مسیر بدون قاعده آزاد است. */
export function hasRoutePermission(path: string, userPerms: string[]): boolean {
  const required = getRequiredRoutePermissions(path);
  return !required || required.some(p => userPerms.includes(p));
}

/**
 * مجوز نوشتن ساختار سازمانی (همان has_structure_write_permission در personnel/permissions.py).
 * محدودهٔ شرکت را بک‌اند تعیین می‌کند: هر کاربر غیرسوپریوزر فقط درون شرکت‌های مجاز خودش می‌نویسد و درون‌ریزی می‌کند.
 */
export const STRUCTURE_WRITE_PERMS = ['admin_all', 'view_sys_projects', 'perm_sys_settings'];

/** مجوزهای پلتفرم به‌اضافهٔ users.structureWritePermissions ماژول‌های نصب‌شده (همتای org_structure_write_perms بک‌اند) */
export function getStructureWritePermissions(registry: ModuleRegistryService = getModuleRegistry()): string[] {
  const fromModules = registry.getExtensions('users').flatMap(e => e.extension.structureWritePermissions || []);
  return [...STRUCTURE_WRITE_PERMS, ...fromModules];
}

export function hasStructureWritePermission(userPerms: string[], isAdmin: boolean): boolean {
  return isAdmin || getStructureWritePermissions().some(p => userPerms.includes(p));
}

export const AuthGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // اگر URL حاوی هش verify-card باشد (مثلاً از لینک‌های قدیمی یا اسکن با #)، مستقیماً بدون لاگین هدایت شود
  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash;
    const match = hash.match(/#\/?verify-card(?:\/([^/?#]+))?/);
    if (match) {
      const code = match[1];
      const targetUrl = code ? `/verify-card/${code}` : '/verify-card';
      return router.parseUrl(targetUrl);
    }
  }

  if (auth.isLoggedIn()) {
    const user = auth.user();
    if (user?.requires_password_change) {
      if (state.url.includes('/change-password')) {
        return true;
      }
      return router.parseUrl('/change-password');
    }

    const userPerms = auth.userPermissions() || [];
    const isAdmin = Boolean(
      userPerms.includes('admin_all') ||
      user?.is_superuser ||
      user?.roles?.includes('admin') ||
      user?.roles?.includes('superuser') ||
      user?.department === 'admin'
    );

    // اگر مسیر launcher باشد، هر کاربر احراز هویت شده مجاز است
    if (state.url.includes('/app/launcher') || route.routeConfig?.path === 'launcher') {
      return true;
    }

    const moduleRegistry = inject(ModuleRegistryService);
    // ماژول‌های نصب‌نشده هم لازم‌اند تا ریدایرکت «ماژول نصب نیست» کار کند؛ mock ناقص رجیستری به رجیستری سراسری برمی‌گردد
    const allKnownSpecs = typeof moduleRegistry.getAllModules === 'function'
      ? moduleRegistry.getAllModules()
      : getModuleRegistry().getAllModules();

    const installed = moduleRegistry.getInstalledModules();
    const installedWithRouteAccess = installed.filter(m => Boolean(getModuleRouteAccess(m)));
    const hasModuleAccess = (m: WhFrontendModule) =>
      Boolean(getModuleRouteAccess(m)?.guardAccessPermissions?.some(p => userPerms.includes(p)));

    const specMap = new Map<string, WhFrontendModule>();
    for (const m of [...allKnownSpecs, ...installed]) {
      if (m?.code && !specMap.has(m.code)) specMap.set(m.code, m);
    }
    const candidateModules = Array.from(specMap.values()).filter(m => Boolean(getModuleRouteAccess(m)));

    // بررسی دسترسی دقیق بر اساس نقش فعال SoD (Segregation of Duties)
    const personaService = inject(AppPersonaService);
    // مقصد جایگزین نقش؛ اگر همان مسیرِ ردشده باشد (حلقهٔ ریدایرکت) به لانچر برو
    const roleHome = () => {
      const fallback = personaService.getDefaultRouteForRole();
      const current = (state.url || '').split('?')[0];
      return router.parseUrl(fallback === current ? '/app/launcher' : fallback);
    };

    const path = route.routeConfig?.path;

    // قلمرو ماژول: یک حلقه برای همهٔ ماژول‌های شناخته‌شده دارای routeAccess
    for (const mod of candidateModules) {
      const cleanPrefix = (mod.routePrefix || '').replace(/^\//, '');
      const isModScope = (mod.routePrefix && state.url.startsWith(mod.routePrefix)) || path === cleanPrefix;

      if (isModScope) {
        if (!moduleRegistry.isModuleInstalled(mod.code)) {
          const fallbackInstalled = installedWithRouteAccess.find(m => m.code !== mod.code);
          return router.parseUrl(fallbackInstalled ? fallbackInstalled.defaultRoute : '/app/launcher');
        }

        let hasModAccess = isAdmin || hasModuleAccess(mod);

        if (mod.extensions?.companies?.hasWarehouseModuleToggle) {
          const activeCompany = inject(ActiveCompanyService, { optional: true });
          if (activeCompany?.activeCompany && activeCompany.activeCompany.has_warehouse_module === false) {
            hasModAccess = false;
          }
        }

        if (!hasModAccess) {
          const fallbackMod = installedWithRouteAccess.find(m => m.code !== mod.code && (isAdmin || hasModuleAccess(m)));
          if (fallbackMod) {
            return router.parseUrl(fallbackMod.defaultRoute);
          }
          return router.parseUrl('/login');
        }
        break;
      }
    }

    if (!isAdmin && !personaService.canAccessRoute(state.url)) {
      return roleHome();
    }

    // Check RBAC permissions on individual page
    const requiredPerms = path ? getRequiredRoutePermissions(path) : undefined;
    if (path && requiredPerms) {
      if (!isAdmin) {
        // صفحهٔ متعلق به ماژولی که کاربر به آن دسترسی ندارد: مقصد را خود ماژول تعیین می‌کند (deniedPageFallback)
        for (const mod of installedWithRouteAccess) {
          const modRouteAccess = getModuleRouteAccess(mod)!;
          const isModRoute = Boolean(modRouteAccess.pagePermissions && path in modRouteAccess.pagePermissions);
          if (isModRoute && !hasModuleAccess(mod)) {
            const otherAccessible = installedWithRouteAccess.find(m => m.code !== mod.code && hasModuleAccess(m));
            if (otherAccessible) {
              return modRouteAccess.deniedPageFallback === 'roleHome'
                ? roleHome()
                : router.parseUrl(otherAccessible.defaultRoute);
            }
            return router.parseUrl('/login');
          }
        }

        const hasAccess = requiredPerms.some(p => userPerms.includes(p));
        if (!hasAccess) {
          return roleHome();
        }
      }
    }

    return true;
  }
  const returnUrl = state.url && state.url !== '/' && state.url !== '/login' ? `?returnUrl=${encodeURIComponent(state.url)}` : '';
  return router.parseUrl(`/login${returnUrl}`);
};

export const AuthGuardChild: CanActivateChildFn = (childRoute, state) => {
  return AuthGuard(childRoute, state);
};
