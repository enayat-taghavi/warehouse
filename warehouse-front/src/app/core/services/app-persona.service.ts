import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Router, NavigationEnd } from '@angular/router';
import { WebSocketService } from '../http/websocket.service';
import { SessionTabService, DEFAULT_ACTIVE_APP_MODULE } from './session-tab.service';
import { ModuleRegistryService, getModuleRegistry } from '../modules/module-registry.service';
import { ActiveCompanyService } from './active-company.service';
import { resolveOfflineDbStrict } from './offline-db';
import { filter } from 'rxjs';

import { ROLE_ICONS } from '../../shared/icons/semantic-icons';
import { RolePersona, AppModuleType, ModulePersonas, FrontendModuleSpec, WhFrontendModule, ModuleAccent } from '../modules/module-contract';
import { IconName } from '../../shared/icons/icon-registry';
import { getPermissionAliases } from '../modules/permission-aliases';

export type { RolePersona, AppModuleType, ModulePersonas };

/** گزینهٔ یک ماژول در منوی تعویض سامانه (از launcherTile.switcher همان ماژول) */
export interface AppSwitcherOption {
  app: AppModuleType;
  labelFa: string;
  descriptionFa: string;
  icon: IconName;
  accent: ModuleAccent;
  onlyAccessTitleFa: string;
  showRoleSelector: boolean;
}

/** پوستهٔ هستهٔ مرکز عملیات؛ ماژول نیست و قلمرو توکن جدا ندارد */
const OPERATIONS_APP = 'operations';

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
  app: DEFAULT_ACTIVE_APP_MODULE,
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

  // گزینه‌های ماژول‌های در دسترس کاربر در منوی تعویض سامانه، به ترتیب switcher.order
  public switcherApps = computed<AppSwitcherOption[]>(() => {
    const options: Array<AppSwitcherOption & { order: number }> = [];
    for (const spec of this.moduleRegistry.getInstalledModules()) {
      const sw = spec.extensions?.launcherTile?.switcher;
      if (!sw || !this.canAccessApp(spec.code)) continue;
      options.push({
        app: this.appCodeOf(spec),
        labelFa: sw.labelFa,
        descriptionFa: sw.descriptionFa,
        icon: sw.icon,
        accent: sw.accent,
        onlyAccessTitleFa: sw.onlyAccessTitleFa,
        showRoleSelector: !!sw.showRoleSelector,
        order: sw.order,
      });
    }
    return options.sort((a, b) => a.order - b.order).map(({ order, ...o }) => o);
  });

  /** ماژول نصب‌شدهٔ یک کد اپ (کد اپ پرسونا، کد ماژول یا نام مستعار)؛ پوستهٔ عملیات ماژول ندارد */
  public moduleForApp(app: AppModuleType): WhFrontendModule | undefined {
    if (!app || app === OPERATIONS_APP) return undefined;
    return this.moduleRegistry.getInstalledModules().find(s =>
      this.appCodeOf(s) === app || s.code === app || !!s.aliases?.includes(app));
  }

  /** ماژول اپ فعال تب */
  public activeModule = computed<WhFrontendModule | undefined>(() => this.moduleForApp(this.activeApp()));

  /** گزینهٔ منوی سامانه برای یک کد اپ (بدون فیلتر دسترسی)؛ برای نمایش دکمهٔ سامانهٔ فعال */
  public switcherOptionFor(app: AppModuleType): AppSwitcherOption | undefined {
    for (const spec of this.moduleRegistry.getInstalledModules()) {
      const sw = spec.extensions?.launcherTile?.switcher;
      if (!sw || this.appCodeOf(spec) !== app) continue;
      return {
        app, labelFa: sw.labelFa, descriptionFa: sw.descriptionFa, icon: sw.icon, accent: sw.accent,
        onlyAccessTitleFa: sw.onlyAccessTitleFa, showRoleSelector: !!sw.showRoleSelector,
      };
    }
    return undefined;
  }

  /** گزینهٔ سامانهٔ فعال تب؛ اپ ناشناخته گزینهٔ اپ پیش‌فرض را می‌گیرد (همان رفتار پیشین) */
  public activeSwitcherOption = computed<AppSwitcherOption | undefined>(() =>
    this.switcherOptionFor(this.activeApp()) ?? this.switcherOptionFor(DEFAULT_ACTIVE_APP_MODULE)
  );

  // بررسی دسترسی کاربر به مرکز عملیات و زیرساخت سازمان (ویژه سوپریوزر)
  public hasOperationsAccess = computed<boolean>(() => {
    return this.canAccessApp('operations');
  });

  public canAccessApp(app: AppModuleType): boolean {
    const spec = this.moduleRegistry.getSpec(app);
    if (!spec) return false;

    // اگر ماژول وابسته به پرچم ماژول انبارداری شرکت است و شرکت فعال فاقد ماژول است، دسترسی مسدود می‌شود
    if (spec.extensions?.companies?.hasWarehouseModuleToggle && this.activeCompanyService && !this.activeCompanyService.hasWarehouseModule) {
      return false;
    }

    return this.moduleRegistry.userHasAccessToModule(
      spec.code,
      this.auth.userPermissions() || [],
      this.auth.user()?.allowed_apps,
      this.isSuperuser()
    );
  }

  /** کد اپ پرسونا (مقدار `active_app_module`) برای یک ماژول؛ مثلاً ماژول حسابداری با کد قدیمی `personnel` */
  private appCodeOf(spec: FrontendModuleSpec): AppModuleType {
    return (spec as WhFrontendModule).routeAccess?.loginActiveAppModule ?? spec.code;
  }

  /**
   * ماژول‌هایی که قلمرو توکن و کانال وب‌سوکت خودشان را دارند: همهٔ ماژول‌های شناخته‌شدهٔ این بیلد
   * به‌جز پوستهٔ عملیات و ماژول‌های عمومی. مانند `canAccessApp`، نصب‌بودن را خود بررسی دسترسی می‌سنجد.
   */
  private scopedModules(): WhFrontendModule[] {
    const reg = this.moduleRegistry;
    const all = typeof reg.getAllModules === 'function' ? reg.getAllModules() : reg.getInstalledSpecs();
    return (all as WhFrontendModule[]).filter(s =>
      !!s.routePrefix && s.code !== OPERATIONS_APP && !this.isGenericModuleApp(s.code));
  }

  /** ماژول دارای قلمروِ یک کد اپ (کد پرسونا، کد ماژول یا نام مستعار آن) */
  private scopedModuleFor(app: AppModuleType): WhFrontendModule | undefined {
    return this.scopedModules().find(s => this.appCodeOf(s) === app || s.code === app || !!s.aliases?.includes(app));
  }

  private setActiveAppCode(app: AppModuleType): void {
    this.activeApp.set(app);
    this.sessionTab.setActiveApp(app);
    localStorage.setItem('active_app_module', app);
  }

  // فهرست سامانه‌های مجاز در دسترس کاربر بر پایه رجیستری پویا
  public accessibleApps = computed<AppModuleType[]>(() => {
    const specs = this.moduleRegistry.getInstalledSpecs();
    const apps: AppModuleType[] = [];
    for (const spec of specs) {
      if (this.canAccessApp(spec.code)) {
        const code = this.appCodeOf(spec);
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

    const appModule = this.scopedModuleFor(app);
    if (appModule && !this.canAccessApp(appModule.code)) {
      return [];
    }

    const perms = this.auth.userPermissions() || [];
    const userRoles = (this.auth.user()?.roles || []).map(r => String(r).toLowerCase());
    const roles: RolePersona[] = [];

    const targetModule = this.moduleRegistry.getInstalledModules().find(m =>
      m.personas?.roles.some(r => r.app === app)
    );

    if (targetModule?.personas) {
      const roleCodes = targetModule.personas.resolveRoleCodes({
        perms, userRoles, permissionAliases: (capability: string) => getPermissionAliases(capability, this.moduleRegistry)
      });
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
      return;
    }

    const scoped = this.scopedModules().find(s =>
      cleanUrl.startsWith(s.routePrefix) && this.activeApp() !== this.appCodeOf(s) && this.canAccessApp(s.code));
    if (scoped) {
      this.setActiveAppCode(this.appCodeOf(scoped));
      try { this.ws.switchAppChannel(scoped.scopeKind); } catch {}
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

  /** ماژولی بدون قلمرو (نه syncConfig، نه پایگاه آفلاین قفل‌شده) که تبادل قلمرو توکن و کانال وب‌سوکت ویژهٔ خودش را ندارد */
  public isGenericModuleApp(app: AppModuleType): boolean {
    if (!app || app === OPERATIONS_APP) return false;
    const spec = this.moduleRegistry.getSpec(app);
    if (!spec || spec.code === OPERATIONS_APP) return false;
    if (spec.extensions?.syncConfig) return false;
    return resolveOfflineDbStrict(app) === null && resolveOfflineDbStrict(spec.scopeKind) === null;
  }

  public sanitizeActiveRole(): void {
    if (!this.isGenericModuleApp(this.activeApp())) {
      // ماژول دیگرِ فعال به انبار یا مالی برگردانده نشود؛ کاربرِ تنها یک ماژولِ دارای قلمرو به همان می‌رود
      const accessible = this.scopedModules().filter(s => this.canAccessApp(s.code));
      if (accessible.length === 1 && this.activeApp() !== this.appCodeOf(accessible[0])) {
        this.setActiveAppCode(this.appCodeOf(accessible[0]));
      }
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

    // ماژول مقصد؛ scopeKind آن همان قلمرو توکن و کانال وب‌سوکت است
    const target = this.scopedModuleFor(app);

    // تبادل زنده قلمرو فعال توکن در بک‌اند (Live Token Exchange)
    if (app !== 'operations' && target) {
      this.auth.switchAppScope(target.scopeKind as Parameters<AuthService['switchAppScope']>[0]).subscribe({
        next: () => {},
        error: (err) => console.warn('[AppPersonaService] خطا در تبادل زنده توکن:', err)
      });
    }

    // تغییر کانال رویدادهای زنده وب‌سوکت متناسب با قلمرو جدید (Domain Isolation)
    try {
      if (app === 'operations') {
        this.ws.switchAppChannel('operations');
      } else if (target) {
        this.ws.switchAppChannel(target.scopeKind);
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
    if (target?.personas?.homeIsModuleDefault) {
      this.router.navigate([target.defaultRoute]);
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
      default: {
        const active = this.scopedModuleFor(this.activeApp());
        if (active?.personas?.homeIsModuleDefault) {
          return active.defaultRoute;
        }
        // بایگانی مدارک در تب مدارک استودیوی شرکت است (حالت محدود)
        if (this.activeCompanyService?.hasCompanyDocumentsAccess()) {
          return '/app/companies';
        }
        const lastResort = this.scopedModules().find(s => s.personas?.lastResortRoute)?.personas?.lastResortRoute;
        return lastResort ?? '/app/launcher';
      }
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
    for (const mod of this.scopedModules()) {
      if (cleanRoute.startsWith(mod.routePrefix) && !this.canAccessApp(mod.code)) return false;
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
    // نرمال‌سازی پیشوند ماژول دارای قلمرو به مسیر نسبی پایه
    const owner = this.scopedModules().find(s => pageRoute.startsWith(s.routePrefix));
    const normalizedRoute = (owner ? pageRoute.slice(owner.routePrefix.length) : pageRoute) || pageRoute;
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
