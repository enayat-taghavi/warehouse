import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Router, NavigationEnd } from '@angular/router';
import { WebSocketService } from '../http/websocket.service';
import { SessionTabService } from './session-tab.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ActiveCompanyService } from './active-company.service';
import { filter } from 'rxjs';

import { ROLE_ICONS } from '../../shared/icons/semantic-icons';
import { RolePersona, AppModuleType, ModulePersonas } from '../modules/module-contract';

export type { RolePersona, AppModuleType, ModulePersonas };

export const CORE_OPS_COMMANDER: RolePersona = {
  code: 'ops_commander',
  title: 'فرمانده عملیات و پدافند',
  app: 'operations',
  badgeColor: '#06b6d4',
  bgClass: 'bg-cyan-600',
  icon: ROLE_ICONS.ops_commander,
  tierLevel: 6
};

export const CORE_SUPERUSER: RolePersona = {
  code: 'superuser',
  title: 'مدیر ارشد',
  app: 'personnel',
  badgeColor: '#e11d48',
  bgClass: 'bg-rose-600',
  icon: ROLE_ICONS.superuser,
  tierLevel: 6
};

export function getAllAppRoles(): RolePersona[] {
  const roles: RolePersona[] = [CORE_OPS_COMMANDER];
  const registry = getModuleRegistry();
  for (const mod of registry.getInstalledModules()) {
    if (mod.personas?.roles) {
      roles.push(...mod.personas.roles);
    }
  }
  roles.push(CORE_SUPERUSER);
  return roles;
}


@Injectable({
  providedIn: 'root'
})
export class AppPersonaService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private ws = inject(WebSocketService);
  private sessionTab = inject(SessionTabService);
  public moduleRegistry = inject(ModuleRegistryService);
  private activeCompanyService = inject(ActiveCompanyService, { optional: true });

  // سیگنال ماژول فعال (انبارداری یا مالی)
  public activeApp = signal<AppModuleType>(
    this.sessionTab.getActiveApp()
  );

  // سیگنال کد نقش فعال
  public activeRole = signal<string>(
    this.sessionTab.getActiveRole()
  );

  public isSuperuser(): boolean {
    const u = this.auth.user();
    const perms = this.auth.userPermissions();
    return Boolean(
      u?.is_superuser ||
      perms.includes('admin_all') ||
      u?.roles?.includes('admin') ||
      u?.roles?.includes('superuser')
    );
  }

  // بررسی دسترسی کاربر به سامانه انبارداری (وارونه‌سازی — فاز ۶، تسک ۵۴)
  public hasWarehouseAccess = computed<boolean>(() => {
    return this.canAccessApp('warehouse');
  });

  // بررسی دسترسی کاربر به سامانه مالی و کارکرد پرسنل
  public hasPersonnelAccess = computed<boolean>(() => {
    return this.canAccessApp('accounting');
  });

  // بررسی دسترسی کاربر به مرکز عملیات و زیرساخت سازمان (ویژه سوپریوزر)
  public hasOperationsAccess = computed<boolean>(() => {
    return this.canAccessApp('operations');
  });

  public canAccessApp(app: AppModuleType): boolean {
    // اگر سامانه انبارداری است و شرکت فعال فاقد ماژول انبارداری است، دسترسی مسدود می‌شود
    if (app === 'warehouse' && this.activeCompanyService && !this.activeCompanyService.hasWarehouseModule) {
      return false;
    }

    if ((app === 'accounting' || app === 'personnel') && this.activeCompanyService?.hasCompanyDocumentsAccess()) {
      return true;
    }

    const spec = this.moduleRegistry.getSpec(app);
    if (!spec) return false;
    return this.moduleRegistry.userHasAccessToModule(
      spec.code,
      this.auth.userPermissions() || [],
      this.auth.user()?.allowed_apps,
      this.isSuperuser()
    );
  }

  // فهرست سامانه‌های مجاز در دسترس کاربر بر پایه رجیستری پویا
  public accessibleApps = computed<AppModuleType[]>(() => {
    const specs = this.moduleRegistry.getInstalledSpecs();
    const apps: AppModuleType[] = [];
    for (const spec of specs) {
      if (this.canAccessApp(spec.code)) {
        // برای سازگاری عقبگرد با کدهای موجود که 'personnel' را چک می‌کنند
        const code = spec.code === 'accounting' ? 'personnel' : spec.code;
        if (!apps.includes(code)) apps.push(code);
      }
    }
    return apps;
  });

  // آیا کاربر مجوز سوئیچ بین سامانه‌ها را دارد؟ (نیازمند دسترسی به حداقل دو سامانه)
  public canSwitchApps = computed<boolean>(() => {
    return this.accessibleApps().length > 1;
  });

  // لیست نقش‌های واجد شرایط کاربر در ماژول جاری
  public availableRoles = computed<RolePersona[]>(() => {
    const app = this.activeApp();
    const isSuper = this.isSuperuser();
    
    if (isSuper) {
      return getAllAppRoles().filter(r => r.app === app || r.code === 'superuser');
    }

    if (app === 'warehouse' && !this.hasWarehouseAccess()) {
      return [];
    }
    if (app === 'personnel' && !this.hasPersonnelAccess()) {
      return [];
    }

    const perms = this.auth.userPermissions() || [];
    const userRoles = (this.auth.user()?.roles || []).map(r => String(r).toLowerCase());
    const roles: RolePersona[] = [];

    const targetModule = this.moduleRegistry.getInstalledModules().find(m =>
      m.personas?.roles.some(r => r.app === app)
    );

    if (targetModule?.personas) {
      const roleCodes = targetModule.personas.resolveRoleCodes({ perms, userRoles });
      for (const code of roleCodes) {
        const persona = targetModule.personas.roles.find(r => r.code === code);
        if (persona) {
          roles.push(persona);
        }
      }
    } else if (app === 'operations') {
      if (isSuper) {
        const opsRole = getAllAppRoles().find(r => r.code === 'ops_commander');
        if (opsRole) roles.push(opsRole);
        const superRole = getAllAppRoles().find(r => r.code === 'superuser');
        if (superRole) roles.push(superRole);
      }
    }

    return roles.filter(Boolean);
  });

  // آیا کاربر چندنقشه است؟
  public isMultiRole = computed<boolean>(() => {
    return this.availableRoles().length > 1;
  });

  // شیء کامل نقش فعال جاری
  public currentPersona = computed<RolePersona>(() => {
    const code = this.activeRole();
    const app = this.activeApp();
    const allRoles = getAllAppRoles();
    const match = allRoles.find(r => r.code === code && (r.app === app || r.code === 'superuser'));
    return match || this.availableRoles()[0] || allRoles[0];
  });

  constructor() {
    this.sanitizeActiveRole();
    this.setupUrlSyncListener();
  }

  private setupUrlSyncListener(): void {
    if (typeof window === 'undefined') return;
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((event) => {
      this.syncScopeFromUrl(event.urlAfterRedirects || event.url);
    });
  }

  public syncScopeFromUrl(url: string): void {
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.startsWith('/app/operations') && this.activeApp() !== 'operations' && this.hasOperationsAccess()) {
      this.activeApp.set('operations');
      this.sessionTab.setActiveApp('operations');
      localStorage.setItem('active_app_module', 'operations');
      try { this.ws.switchAppChannel('operations'); } catch {}
      this.sanitizeActiveRole();
    } else if (cleanUrl.startsWith('/app/warehouse') && this.activeApp() !== 'warehouse' && this.hasWarehouseAccess()) {
      this.activeApp.set('warehouse');
      this.sessionTab.setActiveApp('warehouse');
      localStorage.setItem('active_app_module', 'warehouse');
      try { this.ws.switchAppChannel('warehouse'); } catch {}
      this.sanitizeActiveRole();
    } else if (cleanUrl.startsWith('/app/finance') && this.activeApp() !== 'personnel' && this.hasPersonnelAccess()) {
      this.activeApp.set('personnel');
      this.sessionTab.setActiveApp('personnel');
      localStorage.setItem('active_app_module', 'personnel');
      try { this.ws.switchAppChannel('finance'); } catch {}
      this.sanitizeActiveRole();
    } else {
      // ماژول‌های دیگر (ساخته‌شده از قالب) از روی routePrefix خودشان
      const generic = this.moduleRegistry.getInstalledSpecs().find(s =>
        this.isGenericModuleApp(s.code) && !!s.routePrefix
        && (cleanUrl === s.routePrefix || cleanUrl.startsWith(s.routePrefix + '/')));
      if (generic && this.activeApp() !== generic.code && this.canAccessApp(generic.code)) {
        this.activeApp.set(generic.code);
        this.sessionTab.setActiveApp(generic.code);
        localStorage.setItem('active_app_module', generic.code);
      }
    }
  }

  /** ماژولی غیر از انبار، مالی و عملیات که تبادل قلمرو توکن و کانال وب‌سوکت ویژهٔ خودش را ندارد */
  public isGenericModuleApp(app: AppModuleType): boolean {
    if (['warehouse', 'personnel', 'accounting', 'finance', 'operations'].includes(app)) return false;
    return !!this.moduleRegistry.getSpec(app);
  }

  public sanitizeActiveRole(): void {
    const hasWh = this.hasWarehouseAccess();
    const hasPers = this.hasPersonnelAccess();

    if (this.isGenericModuleApp(this.activeApp())) {
      // ماژول دیگرِ فعال به انبار یا مالی برگردانده نشود
    } else if (!hasWh && hasPers && this.activeApp() !== 'personnel') {
      this.activeApp.set('personnel');
      this.sessionTab.setActiveApp('personnel');
      localStorage.setItem('active_app_module', 'personnel');
    } else if (!hasPers && hasWh && this.activeApp() !== 'warehouse') {
      this.activeApp.set('warehouse');
      this.sessionTab.setActiveApp('warehouse');
      localStorage.setItem('active_app_module', 'warehouse');
    }

    const roles = this.availableRoles();
    const current = this.activeRole();
    const isValid = roles.some(r => r.code === current);
    
    if (!isValid && roles.length > 0) {
      this.switchRole(roles[0].code, false);
    }
  }

  public switchApp(app: AppModuleType): void {
    if (!this.canAccessApp(app)) {
      return;
    }

    this.activeApp.set(app);
    this.sessionTab.setActiveApp(app);
    localStorage.setItem('active_app_module', app);

    if (this.isGenericModuleApp(app)) {
      // ماژول دیگر: بی‌تبادل قلمرو توکن و کانال (ویژهٔ انبار و مالی)، مستقیم به مسیر پیش‌فرض خود ماژول
      const spec = this.moduleRegistry.getSpec(app);
      this.router.navigate([spec?.defaultRoute || spec?.routePrefix || '/app/launcher']);
      return;
    }

    // تبادل زنده قلمرو فعال توکن در بک‌اند (Live Token Exchange)
    const targetScope: 'warehouse' | 'finance' = app === 'warehouse' ? 'warehouse' : 'finance';
    if (app !== 'operations') {
      this.auth.switchAppScope(targetScope).subscribe({
        next: () => {},
        error: (err) => console.warn('[AppPersonaService] خطا در تبادل زنده توکن:', err)
      });
    }

    // تغییر کانال رویدادهای زنده وب‌سوکت متناسب با قلمرو جدید (Domain Isolation)
    try {
      if (app === 'operations') {
        this.ws.switchAppChannel('operations');
      } else {
        this.ws.switchAppChannel(targetScope);
      }
    } catch (e) {
      console.warn('[AppPersonaService] خطا در تغییر کانال وب‌سوکت:', e);
    }

    // انتخاب اولین نقش مجاز در ماژول مقصد
    const roles = this.availableRoles();
    if (roles.length > 0) {
      this.switchRole(roles[0].code, false);
    }

    // ریدایرکت خودکار به صفحه پیش‌فرض اپلیکیشن و نقش مقصد
    if (app === 'warehouse') {
      this.router.navigate(['/app/warehouse/dashboard']);
    } else if (app === 'operations') {
      this.router.navigate(['/app/operations/cockpit']);
    } else {
      this.router.navigate([this.getDefaultRouteForRole()]);
    }
  }

  public getDefaultRouteForRole(roleCode?: string): string {
    const role = roleCode || this.activeRole();

    for (const mod of this.moduleRegistry.getInstalledModules()) {
      const route = mod.personas?.defaultRouteForRole?.[role];
      if (route) {
        return route;
      }
    }

    switch (role) {
      case 'ops_commander':
        return '/app/operations/cockpit';
      default:
        if (this.activeApp() === 'warehouse') {
          return '/app/warehouse/dashboard';
        }
        if (this.activeCompanyService?.hasCompanyDocumentsAccess()) {
          return '/app/finance/company-documents';
        }
        return '/app/finance/accountant-payroll';
    }
  }

  public toggleApp(): void {
    if (!this.canSwitchApps()) {
      return;
    }
    const apps = this.accessibleApps();
    const currentIndex = apps.indexOf(this.activeApp());
    const nextIndex = (currentIndex + 1) % apps.length;
    this.switchApp(apps[nextIndex]);
  }

  public switchRole(roleCode: string, redirectIfUnauthorized: boolean = true): void {
    this.activeRole.set(roleCode);
    this.sessionTab.setActiveRole(roleCode);
    localStorage.setItem('active_role_persona', roleCode);

    if (redirectIfUnauthorized) {
      const currentUrl = this.router.url.split('?')[0];
      if (!this.canAccessRoute(currentUrl)) {
        const fallback = this.getDefaultRouteForRole(roleCode);
        this.router.navigate([fallback]);
      }
    }
  }

  public canAccessRoute(routePath: string): boolean {
    if (this.isSuperuser()) return true;
    const cleanRoute = routePath.split('?')[0];
    const role = this.activeRole();

    // بررسی قلمرو کلان اپلیکیشن‌ها
    if (cleanRoute.startsWith('/app/warehouse') && !this.hasWarehouseAccess()) return false;
    if (cleanRoute.startsWith('/app/finance')) {
      const isDocs = cleanRoute.includes('company-documents') || cleanRoute.includes('/documents');
      if (isDocs) {
        return !!this.activeCompanyService?.hasCompanyDocumentsAccess();
      }
      if (!this.hasPersonnelAccess()) {
        return false;
      }
    }
    if (cleanRoute.startsWith('/app/operations') && !this.hasOperationsAccess()) return false;

    // بررسی قوانین ایزولاسیون مسیر نقش‌ها در ماژول‌های نصب‌شده
    for (const mod of this.moduleRegistry.getInstalledModules()) {
      if (mod.personas?.isRouteDeniedForRole?.(role, cleanRoute)) {
        return false;
      }
    }

    return true;
  }

  public isActionProhibited(pageRoute: string, actionCode: string): boolean {
    if (this.isSuperuser() || this.activeRole() === 'superuser') {
      return false;
    }
    const app = this.activeApp();
    const role = this.activeRole();
    // نرمال‌سازی پیشوند ماژولار /app/warehouse یا /app/finance به مسیر نسبی پایه
    const normalizedRoute = pageRoute.replace(/^\/app\/(warehouse|finance)/, '') || pageRoute;
    const key = `${app}:${role}:${normalizedRoute}`;

    const mergedProhibitions: Record<string, string[]> = {};
    for (const mod of this.moduleRegistry.getInstalledModules()) {
      if (mod.personas?.sodProhibitions) {
        Object.assign(mergedProhibitions, mod.personas.sodProhibitions);
      }
    }
    const prohibitedList = mergedProhibitions[key];

    return prohibitedList ? prohibitedList.includes(actionCode) : false;
  }

  public canPerform(pageRoute: string, actionCode: string): boolean {
    return !this.isActionProhibited(pageRoute, actionCode);
  }
}
