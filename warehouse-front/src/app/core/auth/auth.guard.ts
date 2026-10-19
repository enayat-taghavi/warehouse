import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn, CanMatchFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ModuleRouteAccess, WhFrontendModule } from '../modules/module-contract';
import { AppPersonaService } from '../services/app-persona.service';
import { ActiveCompanyService } from '../services/active-company.service';

/**
 * گارد تطبیق ماژول انبارداری — در صورت عدم نصب یا عدم فعال بودن ماژول برای شرکت، از روت عبور می‌کند
 */
export const WarehouseModuleMatchGuard: CanMatchFn = () => {
  const moduleRegistry = inject(ModuleRegistryService);
  const activeCompany = inject(ActiveCompanyService, { optional: true });

  const hasWh = moduleRegistry.getInstalledModules().some(m => m.scopeKind === 'warehouse');
  if (!hasWh) {
    return false;
  }
  if (activeCompany?.activeCompany && activeCompany.activeCompany.has_warehouse_module === false) {
    return false;
  }
  return true;
};

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
 * گارد تطبیق ماژول مالی و پرسنلی — در صورت عدم نصب، از روت عبور می‌کند
 */
export const AccountingModuleMatchGuard: CanMatchFn = () => {
  const moduleRegistry = inject(ModuleRegistryService);
  return moduleRegistry.getInstalledModules().some(m => m.scopeKind === 'finance');
};

/**
 * گارد احراز هویت — فقط کاربران لاگین‌شده اجازه ورود دارند
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  'users': ['view_sys_users'],
  'finance-audit': ['view_sys_payroll', 'perm_sys_logs', 'admin_all'],
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
      return perms;
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
export const STRUCTURE_WRITE_PERMS = ['admin_all', 'view_sys_projects', 'perm_sys_settings', 'perm_approve_personnel_manager', 'can_act_as_manager'];

export function hasStructureWritePermission(userPerms: string[], isAdmin: boolean): boolean {
  return isAdmin || STRUCTURE_WRITE_PERMS.some(p => userPerms.includes(p));
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
    const installed = moduleRegistry.getInstalledModules();
    const whModule = installed.find(m => m.scopeKind === 'warehouse');
    const accModule = installed.find(m => m.scopeKind === 'finance');
    const whRouteAccess = getModuleRouteAccess(whModule);
    const accRouteAccess = getModuleRouteAccess(accModule);

    const hasWarehouseAccess = isAdmin || Boolean(whRouteAccess?.guardAccessPermissions?.some(p => userPerms.includes(p)));
    const hasPersonnelAccess = isAdmin || Boolean(accRouteAccess?.guardAccessPermissions?.some(p => userPerms.includes(p)));

    // بررسی دسترسی به سطح ماژول انبار (هم نصب بودن ماژول و هم مجوز دسترسی کاربر)
    const isWarehouseScope = state.url.includes('/app/warehouse') || route.routeConfig?.path === 'warehouse';
    if (isWarehouseScope) {
      if (!whModule) {
        return router.parseUrl(accModule ? accModule.defaultRoute : '/app/launcher');
      }
      if (!hasWarehouseAccess) {
        if (hasPersonnelAccess && accModule) {
          return router.parseUrl(accModule.defaultRoute);
        }
        return router.parseUrl('/login');
      }
    }

    // بررسی دسترسی به سطح ماژول مالی (هم نصب بودن ماژول و هم مجوز دسترسی کاربر)
    const isFinanceScope = state.url.includes('/app/finance') || route.routeConfig?.path === 'finance';
    const isCompanyDocsRoute = state.url.includes('company-documents') || state.url.includes('/documents') || route.routeConfig?.path === 'company-documents' || route.routeConfig?.path === 'documents';

    if (isFinanceScope) {
      if (!accModule) {
        return router.parseUrl(whModule ? whModule.defaultRoute : '/app/launcher');
      }
      if (isCompanyDocsRoute) {
        // دسترسی به اسناد شرکت‌ها فارغ از شغل کاربری و فقط منوط به داشتن دسترسی در حداقل یک شرکت است
        const activeCompanyService = inject(ActiveCompanyService);
        const hasDocAccess = isAdmin || activeCompanyService.hasCompanyDocumentsAccess();
        if (!hasDocAccess) {
          return router.parseUrl(hasWarehouseAccess && whModule ? whModule.defaultRoute : '/app/launcher');
        }
      } else if (!hasPersonnelAccess) {
        if (hasWarehouseAccess && whModule) {
          return router.parseUrl(whModule.defaultRoute);
        }
        return router.parseUrl('/login');
      }
    }

    // بررسی تعمیم‌یافته برای هر ماژول نصب‌شده دیگر (N ماژول)
    for (const mod of installed) {
      if (mod.scopeKind === 'warehouse' || mod.scopeKind === 'finance') {
        continue;
      }
      const cleanPrefix = (mod.routePrefix || '').replace(/^\//, '');
      const isModScope = (mod.routePrefix && state.url.startsWith(mod.routePrefix)) || route.routeConfig?.path === cleanPrefix;
      if (isModScope) {
        const modRouteAccess = getModuleRouteAccess(mod);
        let hasModAccess = isAdmin || Boolean(modRouteAccess?.guardAccessPermissions?.some(p => userPerms.includes(p)));

        if (mod.extensions?.companies?.hasWarehouseModuleToggle) {
          const activeCompany = inject(ActiveCompanyService, { optional: true });
          if (activeCompany?.activeCompany && activeCompany.activeCompany.has_warehouse_module === false) {
            hasModAccess = false;
          }
        }

        if (isCompanyDocsRoute && mod.extensions?.layoutNav?.hasCompanyDocumentsArchive) {
          const activeCompanyService = inject(ActiveCompanyService);
          hasModAccess = isAdmin || activeCompanyService.hasCompanyDocumentsAccess();
        }

        if (!hasModAccess) {
          const fallbackMod = installed.find(m => m.code !== mod.code && (isAdmin || Boolean(getModuleRouteAccess(m)?.guardAccessPermissions?.some(p => userPerms.includes(p)))));
          if (fallbackMod) {
            return router.parseUrl(fallbackMod.defaultRoute);
          }
          return router.parseUrl('/login');
        }
      }
    }

    // بررسی دسترسی دقیق بر اساس نقش فعال SoD (Segregation of Duties)
    const personaService = inject(AppPersonaService);
    // مقصد جایگزین نقش؛ اگر همان مسیرِ ردشده باشد (حلقهٔ ریدایرکت) به لانچر برو
    const roleHome = () => {
      const fallback = personaService.getDefaultRouteForRole();
      const current = (state.url || '').split('?')[0];
      return router.parseUrl(fallback === current ? '/app/launcher' : fallback);
    };
    if (!isAdmin && !personaService.canAccessRoute(state.url)) {
      return roleHome();
    }

    // Check RBAC permissions on individual page
    const path = route.routeConfig?.path;
    const requiredPerms = path ? getRequiredRoutePermissions(path) : undefined;
    if (path && requiredPerms) {
      if (!isAdmin) {
        // پیمایش تعمیم‌یافته روی کلیه ماژول‌های نصب‌شده برای بررسی دسترسی ماژول در صورت نیاز به روت
        for (const mod of installed) {
          const modRouteAccess = getModuleRouteAccess(mod);
          const isModRoute = Boolean(modRouteAccess?.pagePermissions && path in modRouteAccess.pagePermissions);
          if (isModRoute) {
            const hasModAccess = Boolean(modRouteAccess?.guardAccessPermissions?.some(p => userPerms.includes(p)));
            if (!hasModAccess) {
              const otherAccessible = installed.find(m => m.code !== mod.code && Boolean(getModuleRouteAccess(m)?.guardAccessPermissions?.some(p => userPerms.includes(p))));
              if (otherAccessible) {
                return mod.scopeKind === 'warehouse' ? roleHome() : router.parseUrl(otherAccessible.defaultRoute);
              }
              return router.parseUrl('/login');
            }
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
