import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Router, NavigationEnd } from '@angular/router';
import { WebSocketService } from '../http/websocket.service';
import { SessionTabService } from './session-tab.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { ActiveCompanyService } from './active-company.service';
import { filter } from 'rxjs';

import { IconName } from '../../shared/icons/icon-registry';
import { ROLE_ICONS } from '../../shared/icons/semantic-icons';

export type AppModuleType = 'warehouse' | 'personnel' | 'operations' | string;

export interface RolePersona {
  code: string;
  title: string;
  app: AppModuleType;
  badgeColor: string;
  bgClass: string;
  icon: IconName;
  tierLevel: number;
}

export const ALL_APP_ROLES: RolePersona[] = [
  // --- Operations / Infrastructure Roles ---
  {
    code: 'ops_commander',
    title: 'فرمانده عملیات و پدافند',
    app: 'operations',
    badgeColor: '#06b6d4',
    bgClass: 'bg-cyan-600',
    icon: ROLE_ICONS.ops_commander,
    tierLevel: 6
  },
  // --- Personnel / Payroll / Treasury Roles ---
  {
    code: 'operator',
    title: 'کارمند',
    app: 'personnel',
    badgeColor: '#64748b',
    bgClass: 'bg-slate-600',
    icon: ROLE_ICONS.operator,
    tierLevel: 1
  },
  {
    code: 'supervisor',
    title: 'سرپرست',
    app: 'personnel',
    badgeColor: '#2563eb',
    bgClass: 'bg-blue-600',
    icon: ROLE_ICONS.supervisor,
    tierLevel: 2
  },
  {
    code: 'accountant',
    title: 'حسابدار',
    app: 'personnel',
    badgeColor: '#059669',
    bgClass: 'bg-emerald-600',
    icon: ROLE_ICONS.accountant,
    tierLevel: 3
  },
  {
    code: 'manager',
    title: 'مدیر',
    app: 'personnel',
    badgeColor: '#7c3aed',
    bgClass: 'bg-purple-600',
    icon: ROLE_ICONS.manager,
    tierLevel: 4
  },
  {
    code: 'treasury',
    title: 'خزانه‌دار',
    app: 'personnel',
    badgeColor: '#d97706',
    bgClass: 'bg-amber-600',
    icon: ROLE_ICONS.treasury,
    tierLevel: 5
  },
  {
    code: 'org_admin',
    title: 'راهبر تشکیلات و سیستم',
    app: 'personnel',
    badgeColor: '#0284c7',
    bgClass: 'bg-sky-600',
    icon: ROLE_ICONS.org_admin,
    tierLevel: 4
  },
  // --- Warehouse / Inventory Roles ---
  {
    code: 'counter',
    title: 'انبارگردان / شمارشگر کور',
    app: 'warehouse',
    badgeColor: '#0284c7',
    bgClass: 'bg-sky-600',
    icon: ROLE_ICONS.counter,
    tierLevel: 1
  },
  {
    code: 'warehouse_supervisor',
    title: 'سرپرست انبار و شمارش',
    app: 'warehouse',
    badgeColor: '#4f46e5',
    bgClass: 'bg-indigo-600',
    icon: ROLE_ICONS.warehouse_supervisor,
    tierLevel: 2
  },
  {
    code: 'docs_specialist',
    title: 'مسئول تطبیق و اسناد انبار',
    app: 'warehouse',
    badgeColor: '#0d9488',
    bgClass: 'bg-teal-600',
    icon: ROLE_ICONS.docs_specialist,
    tierLevel: 3
  },
  {
    code: 'manager_review',
    title: 'ناظر عالی و بررسی مدیر',
    app: 'warehouse',
    badgeColor: '#9333ea',
    bgClass: 'bg-purple-600',
    icon: ROLE_ICONS.manager_review,
    tierLevel: 4
  },
  // --- Global Superuser ---
  {
    code: 'superuser',
    title: 'مدیر ارشد',
    app: 'personnel',
    badgeColor: '#e11d48',
    bgClass: 'bg-rose-600',
    icon: ROLE_ICONS.superuser,
    tierLevel: 6
  }
];

// ماتریس محلی خطوط قرمز جهت پنهان‌سازی سریع در DOM فرانت‌اند (O(1))
export const FRONTEND_SOD_PROHIBITIONS: Record<string, string[]> = {
  'personnel:operator:/attendance': ['approve_attendance_period', 'lock_period'],
  'personnel:operator:/profiles': ['approve_personnel_profile', 'approve_vehicle_profile'],
  'personnel:operator:/finance-cartable': ['view_and_calculate_payroll', 'calculate_payroll', 'export_dsk'],
  'personnel:operator:/treasury-cartable': ['disburse_treasury_payment'],

  'personnel:supervisor:/profiles': ['edit_base_wage_and_bonuses'],
  'personnel:supervisor:/finance-cartable': ['approve_payroll_finance'],
  'personnel:supervisor:/treasury-cartable': ['disburse_treasury_payment'],

  'personnel:accountant:/attendance': ['create_daily_attendance_entry'],
  'personnel:accountant:/manager-approvals': ['authorize_manager_payment'],
  'personnel:accountant:/treasury-cartable': ['disburse_direct_payment'],

  'personnel:manager:/attendance': ['input_bulk_attendance_records'],
  'personnel:manager:/treasury-cartable': ['disburse_treasury_paya'],

  'personnel:treasury:/finance-cartable': ['modify_payroll_calculations'],
  'personnel:treasury:/profiles': ['modify_employment_contracts'],

  'warehouse:counter:/manager-review': ['finalize_inventory_count'],
  'warehouse:counter:/customs': ['view_customs_and_costs']
};

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
      return ALL_APP_ROLES.filter(r => r.app === app || r.code === 'superuser');
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

    if (app === 'personnel') {
      // کارمند: صراحتاً در نقش‌های کاربر یا دارای مجوز ثبت کارکرد (بدون تحمیل به حسابدار/سرپرست/مدیر/خزانه‌دار)
      const hasOperatorRole = userRoles.includes('operator') || perms.includes('can_act_as_operator');
      const hasOperatorPerm = perms.includes('view_sys_personnel_attendance');
      const isOtherExplicitRole = userRoles.some(r => ['accountant', 'supervisor', 'manager', 'treasury'].includes(r)) ||
        perms.includes('can_act_as_workshop_supervisor') ||
        perms.includes('can_act_as_accountant') ||
        perms.includes('can_act_as_company_manager') ||
        perms.includes('perm_treasury_disburse_action') ||
        perms.includes('perm_approve_personnel_supervisor') ||
        perms.includes('perm_manage_projects_sections');
      if (hasOperatorRole || (hasOperatorPerm && !isOtherExplicitRole)) {
        const op = ALL_APP_ROLES.find(r => r.code === 'operator');
        if (op) roles.push(op);
      }

      // سرپرست کارگاه
      if (userRoles.includes('supervisor') || perms.includes('can_act_as_workshop_supervisor') || perms.includes('perm_approve_personnel_supervisor') || perms.includes('perm_approve_fleet_supervisor')) {
        const sp = ALL_APP_ROLES.find(r => r.code === 'supervisor');
        if (sp) roles.push(sp);
      }

      // حسابدار
      if (userRoles.includes('accountant') || perms.includes('can_act_as_accountant') || perms.includes('perm_approve_personnel_finance') || perms.includes('perm_approve_fleet_finance')) {
        const acc = ALL_APP_ROLES.find(r => r.code === 'accountant');
        if (acc) roles.push(acc);
      }

      // مدیر شرکت
      if (userRoles.includes('manager') || perms.includes('can_act_as_company_manager') || perms.includes('perm_manager_payment_authorize') || perms.includes('perm_approve_personnel_manager')) {
        const mg = ALL_APP_ROLES.find(r => r.code === 'manager');
        if (mg) roles.push(mg);
      }

      // خزانه‌دار
      if (userRoles.includes('treasury') || userRoles.includes('treasurer') || perms.includes('perm_treasury_disburse_action') || perms.includes('view_sys_treasury')) {
        const tr = ALL_APP_ROLES.find(r => r.code === 'treasury');
        if (tr) roles.push(tr);
      }

      // راهبر تشکیلات: آخر فهرست تا نقش عملیاتی کاربر چندنقشه پیش‌فرض بماند
      if (perms.includes('perm_manage_projects_sections')) {
        const oa = ALL_APP_ROLES.find(r => r.code === 'org_admin');
        if (oa) roles.push(oa);
      }
    } else if (app === 'warehouse') {
      // Warehouse App
      if (userRoles.includes('counter') || perms.includes('view_sys_counter') || perms.includes('can_act_as_counter') || perms.includes('view_wh_dispatch')) {
        roles.push(ALL_APP_ROLES.find(r => r.code === 'counter')!);
      }
      if (userRoles.includes('warehouse_supervisor') || perms.includes('can_act_as_wh_supervisor') || (perms.includes('view_sys_supervisor') && !perms.includes('can_act_as_workshop_supervisor')) || perms.includes('view_wh_doc_approvals')) {
        roles.push(ALL_APP_ROLES.find(r => r.code === 'warehouse_supervisor')!);
      }
      if (userRoles.includes('docs_specialist') || perms.includes('view_wh_docs') || perms.includes('can_act_as_doc_worker') || perms.includes('perm_doc_approve_action')) {
        roles.push(ALL_APP_ROLES.find(r => r.code === 'docs_specialist')!);
      }
      if (userRoles.includes('manager_review') || perms.includes('can_act_as_wh_manager') || perms.includes('view_sys_manager_review') || perms.includes('perm_inventory_finalize')) {
        roles.push(ALL_APP_ROLES.find(r => r.code === 'manager_review')!);
      }
    } else if (app === 'operations') {
      if (isSuper) {
        const opsRole = ALL_APP_ROLES.find(r => r.code === 'ops_commander');
        if (opsRole) roles.push(opsRole);
        const superRole = ALL_APP_ROLES.find(r => r.code === 'superuser');
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
    const match = ALL_APP_ROLES.find(r => r.code === code && (r.app === app || r.code === 'superuser'));
    return match || this.availableRoles()[0] || ALL_APP_ROLES[0];
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
    switch (role) {
      case 'operator':
        return '/app/finance/employee-attendance';
      case 'supervisor':
        return '/app/finance/supervisor-attendance';
      case 'accountant':
        return '/app/finance/accountant-payroll';
      case 'manager':
        return '/app/finance/manager-dashboard';
      case 'treasury':
      case 'treasurer':
        return '/app/finance/treasurer-disbursements';
      case 'org_admin':
        return '/app/finance/projects-and-sections';
      case 'counter':
        return '/app/warehouse/counter';
      case 'warehouse_supervisor':
        return '/app/warehouse/supervisor';
      case 'docs_specialist':
        return '/app/warehouse/docs';
      case 'manager_review':
        return '/app/warehouse/dashboard';
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

    // ایزولاسیون صددرصدی نقش فعال در سامانه مالی و کارکرد (Strict RBAC & SoD)
    if (role === 'accountant') {
      // حسابدار نباید به صفحات کارمند، سرپرست کارگاه، مدیر، خزانه‌دار دسترسی داشته باشد
      if (cleanRoute.includes('/employee-') || cleanRoute.includes('/supervisor-') || cleanRoute.includes('/manager-') || cleanRoute.includes('/treasurer-')) {
        return false;
      }
      if (cleanRoute.includes('treasury-cartable') || cleanRoute.includes('manager-approvals') || cleanRoute.includes('/attendance') || cleanRoute.includes('/fleet')) {
        return false;
      }
    } else if (role === 'operator') {
      // کارمند نباید به کارتابل‌های سرپرست، حسابدار، مدیر یا خزانه‌دار دسترسی داشته باشد
      if (cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-') || cleanRoute.includes('/treasurer-')) {
        return false;
      }
      if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('treasury-cartable') || cleanRoute.includes('manager-approvals')) {
        return false;
      }
    } else if (role === 'supervisor') {
      // سرپرست نباید به منوی کارمند، حسابدار، مدیر یا خزانه‌دار دسترسی داشته باشد
      if (cleanRoute.includes('/employee-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-') || cleanRoute.includes('/treasurer-')) {
        return false;
      }
      if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('treasury-cartable')) {
        return false;
      }
    } else if (role === 'manager') {
      // مدیر نباید به ثبت خام کارمند یا سرپرست یا محاسبات خام حسابدار دسترسی مستقیم داشته باشد
      if (cleanRoute.includes('/employee-') || cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/treasurer-')) {
        return false;
      }
    } else if (role === 'treasury') {
      // خزانه‌دار فقط به امور پرداخت و بانک دسترسی دارد
      if (cleanRoute.includes('/employee-') || cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-')) {
        return false;
      }
      if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('manager-approvals')) {
        return false;
      }
    } else if (role === 'org_admin') {
      // راهبر تشکیلات فقط ساختار سازمانی را اداره می‌کند؛ هیچ کارتابل تایید، پرداخت یا ثبت کارکردی ندارد
      if (cleanRoute.startsWith('/app/finance')) {
        const allowed = ['/app/finance/projects-and-sections', '/app/finance/company-documents', '/app/finance/documents', '/app/finance/health'];
        if (!allowed.some(a => cleanRoute === a || cleanRoute.startsWith(a + '/'))) {
          return false;
        }
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
    const prohibitedList = FRONTEND_SOD_PROHIBITIONS[key];

    return prohibitedList ? prohibitedList.includes(actionCode) : false;
  }

  public canPerform(pageRoute: string, actionCode: string): boolean {
    return !this.isActionProhibited(pageRoute, actionCode);
  }
}
