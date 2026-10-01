import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn, CanMatchFn } from '@angular/router';
import { AuthService } from './auth.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { AppPersonaService } from '../services/app-persona.service';
import { ActiveCompanyService } from '../services/active-company.service';

/**
 * گارد تطبیق ماژول انبارداری — در صورت عدم نصب یا عدم فعال بودن ماژول برای شرکت، از روت عبور می‌کند
 */
export const WarehouseModuleMatchGuard: CanMatchFn = () => {
  const moduleRegistry = inject(ModuleRegistryService);
  const activeCompany = inject(ActiveCompanyService, { optional: true });

  if (!moduleRegistry.isModuleInstalled('warehouse')) {
    return false;
  }
  if (activeCompany && !activeCompany.hasWarehouseModule) {
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

  if (activeCompany && (!activeCompany.activeCompany || !activeCompany.hasWarehouseModule)) {
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
  return moduleRegistry.isModuleInstalled('accounting');
};

/**
 * گارد احراز هویت — فقط کاربران لاگین‌شده اجازه ورود دارند
 */
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  'dashboard': ['view_sys_dashboard', 'view_wh_dashboard'],
  'users': ['view_sys_users'],
  'projects': ['view_sys_projects'],
  'id-cards': ['view_sys_id_cards'],
  'counter': ['view_sys_counter'],
  'supervisor': ['view_sys_supervisor'],
  'manager-review': ['view_sys_manager_review', 'can_act_as_manager'],
  'recounts': ['view_sys_recounts'],
  'settings': ['view_sys_settings'],
  'reports': ['view_sys_reports', 'view_sys_dashboard'],
  'docs': ['view_wh_docs'],
  'dispatch': ['view_wh_dispatch'],
  'customs': ['view_wh_customs'],
  'doc_approvals': ['view_wh_doc_approvals'],
  'feeding': ['view_wh_feeding'],
  'feed_approvals': ['view_wh_feed_approvals'],
  'labels': ['view_wh_labels'],
  'label-designer': ['view_wh_label_designer'],
  'audit': ['view_wh_audit', 'perm_sys_logs', 'view_sys_payroll', 'admin_all'],
  'finance-audit': ['view_sys_payroll', 'perm_sys_logs', 'admin_all'],
  'count-tracking': ['view_sys_manager_review', 'view_sys_supervisor', 'view_sys_dashboard', 'perm_inventory_finalize', 'view_wh_stocktaking', 'can_act_as_manager', 'can_act_as_supervisor'],
  
  // Personnel, Attendance, Fleet, Finance & Treasury
  'personnel': ['view_sys_payroll', 'admin_all'],
  'payroll': ['view_sys_payroll', 'admin_all'],
  'fleet-settlement': ['view_sys_fleet_settlement', 'view_sys_payroll', 'admin_all'],
  'attendance': ['view_sys_personnel_attendance', 'view_wh_attendance', 'perm_register_daily_attendance', 'can_act_as_operator', 'can_act_as_supervisor', 'admin_all'],
  'fleet': ['view_sys_fleet_attendance', 'view_wh_attendance', 'admin_all'],
  'fleet-attendance': ['view_sys_fleet_attendance', 'view_wh_attendance', 'admin_all'],
  'manager-approvals': ['perm_manager_payment_authorize', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'can_act_as_manager', 'admin_all'],
  'finance-cartable': ['perm_approve_personnel_finance', 'perm_approve_fleet_finance', 'view_sys_payroll', 'admin_all'],
  'treasury-cartable': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
  'treasury': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
  'profiles': ['view_sys_personnel', 'admin_all'],
  'personnel-profiles': ['view_sys_personnel', 'admin_all'],
  // مشاهده برای حسابدار و مدیر؛ ویرایش همچنان فقط perm_sys_settings یا سوپریوزر (BaseSettings.canManageSettings و بک‌اند)
  'base-settings': [
    'view_sys_settings', 'perm_sys_settings', 'admin_all',
    'can_act_as_accountant', 'view_sys_payroll', 'perm_approve_personnel_finance',
    'can_act_as_company_manager', 'perm_manager_payment_authorize', 'perm_approve_personnel_manager'
  ],
  'projects-and-sections': ['view_sys_projects', 'perm_manage_projects_sections', 'admin_all'],
  'counterparties': ['view_sys_payroll', 'view_sys_projects', 'admin_all'],
  
  // منوی اختصاصی کارمند (Operator Portal)
  'employee-portal': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
  'employee-attendance': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
  'employee-fleet': ['can_act_as_operator', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance', 'admin_all'],
  'employee-invoices': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
  'employee-petty-cash': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
  'employee-new-vehicle': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],
  'employee-new-personnel': ['can_act_as_operator', 'view_sys_personnel_attendance', 'admin_all'],

  // منوی اختصاصی سرپرست کارگاه (Supervisor Portal)
  'supervisor-attendance': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
  'supervisor-fleet': ['perm_approve_fleet_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
  'supervisor-invoices': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
  'supervisor-petty-cash': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
  'supervisor-new-profiles': ['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor', 'admin_all'],
  'supervisor-period-lock': ['perm_lock_work_period', 'can_act_as_workshop_supervisor', 'admin_all'],

  // منوی اختصاصی حسابدار (Accountant Portal)
  'accountant-payroll': ['view_sys_payroll', 'perm_approve_personnel_finance', 'can_act_as_accountant', 'admin_all'],
  'accountant-fleet': ['view_sys_fleet_settlement', 'perm_approve_fleet_finance', 'can_act_as_accountant', 'admin_all'],
  'accountant-invoices': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
  'accountant-petty-cash': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
  'accountant-diskettes': ['view_sys_payroll', 'can_act_as_accountant', 'admin_all'],
  'accountant-counterparties': ['view_sys_payroll', 'can_act_as_accountant', 'perm_approve_personnel_finance', 'admin_all'],

  // منوی اختصاصی مدیر (Manager Portal)
  // تاییدکنندگان مدیریتی همان سطح ۴ بک‌اند (determine_user_tier) هستند و مقصد پیش‌فرض نقش مدیر همین صفحه است
  'manager-dashboard': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'admin_all'],
  'manager-budget': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],
  'manager-contracts': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],
  'manager-reports': ['perm_manager_payment_authorize', 'can_act_as_company_manager', 'admin_all'],

  // منوی اختصاصی خزانه‌دار (Treasurer Portal)
  'treasurer-disbursements': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
  'treasurer-invoices': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
  'treasurer-bank-accounts': ['view_sys_treasury', 'admin_all'],
  'treasurer-cheques': ['view_sys_treasury', 'perm_treasury_disburse_action', 'admin_all'],
  'treasurer-reconciliation': ['view_sys_treasury', 'admin_all']
};

/** آیا کاربر از گارد مجوز صفحه (ROUTE_PERMISSIONS) رد می‌شود؟ مسیر بدون قاعده آزاد است. */
export function hasRoutePermission(path: string, userPerms: string[]): boolean {
  const required = ROUTE_PERMISSIONS[path];
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

const WAREHOUSE_PERMISSIONS = [
  'view_sys_dashboard', 'view_wh_dashboard', 'view_sys_counter',
  'view_sys_supervisor', 'can_act_as_wh_supervisor', 'view_sys_manager_review',
  'can_act_as_wh_manager', 'view_wh_docs',
  'view_wh_dispatch', 'view_wh_customs', 'view_wh_doc_approvals',
  'view_wh_feeding', 'view_wh_feed_approvals', 'view_wh_labels',
  'view_wh_label_designer', 'view_wh_audit', 'view_wh_settings',
  'view_sys_recounts', 'view_sys_export', 'view_sys_reports',
  'perm_doc_approve_action', 'perm_feed_approve_action', 'perm_inventory_finalize',
  'perm_rec_import', 'perm_rec_recount', 'perm_rec_dispatch',
  'perm_wh_create', 'perm_wh_edit', 'perm_wh_freeze'
];

const PERSONNEL_PERMISSIONS = [
  'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
  'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
  'perm_lock_work_period', 'perm_approve_personnel_supervisor', 'perm_approve_personnel_manager',
  'perm_approve_personnel_finance', 'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager',
  'perm_approve_fleet_finance', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
  'perm_manage_projects_sections',
  'can_act_as_accountant', 'can_act_as_operator', 'can_act_as_workshop_supervisor', 'can_act_as_company_manager'
];

const WAREHOUSE_ROUTE_KEYS = new Set([
  'dashboard', 'projects', 'id-cards', 'counter', 'supervisor', 'manager-review',
  'recounts', 'settings', 'reports', 'docs', 'dispatch', 'customs', 'doc_approvals',
  'feeding', 'feed_approvals', 'labels', 'label-designer', 'audit', 'count-tracking'
]);

const FINANCE_ROUTE_KEYS = new Set([
  'personnel', 'payroll', 'fleet-settlement', 'attendance', 'fleet', 'fleet-attendance',
  'manager-approvals', 'finance-cartable', 'treasury-cartable', 'treasury', 'profiles',
  'personnel-profiles', 'base-settings', 'projects-and-sections', 'counterparties',
  'employee-portal', 'employee-attendance', 'employee-fleet', 'employee-invoices',
  'employee-petty-cash', 'employee-new-vehicle', 'employee-new-personnel',
  'supervisor-attendance', 'supervisor-fleet', 'supervisor-invoices', 'supervisor-petty-cash',
  'supervisor-new-profiles', 'supervisor-period-lock',
  'accountant-payroll', 'accountant-fleet', 'accountant-invoices', 'accountant-petty-cash',
  'accountant-diskettes', 'accountant-counterparties',
  'manager-dashboard', 'manager-budget', 'manager-contracts', 'manager-reports',
  'treasurer-disbursements', 'treasurer-invoices', 'treasurer-bank-accounts', 'treasurer-cheques', 'treasurer-reconciliation'
]);

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
    const hasWarehouseAccess = isAdmin || WAREHOUSE_PERMISSIONS.some(p => userPerms.includes(p));
    const hasPersonnelAccess = isAdmin || PERSONNEL_PERMISSIONS.some(p => userPerms.includes(p));

    // بررسی دسترسی به سطح ماژول انبار (هم نصب بودن ماژول و هم مجوز دسترسی کاربر)
    const isWarehouseScope = state.url.includes('/app/warehouse') || route.routeConfig?.path === 'warehouse';
    if (isWarehouseScope) {
      if (!moduleRegistry.isModuleInstalled('warehouse')) {
        return router.parseUrl(moduleRegistry.isModuleInstalled('accounting') ? '/app/finance' : '/app/launcher');
      }
      if (!hasWarehouseAccess) {
        if (hasPersonnelAccess && moduleRegistry.isModuleInstalled('accounting')) {
          return router.parseUrl('/app/finance');
        }
        return router.parseUrl('/login');
      }
    }

    // بررسی دسترسی به سطح ماژول مالی (هم نصب بودن ماژول و هم مجوز دسترسی کاربر)
    const isFinanceScope = state.url.includes('/app/finance') || route.routeConfig?.path === 'finance';
    const isCompanyDocsRoute = state.url.includes('company-documents') || state.url.includes('/documents') || route.routeConfig?.path === 'company-documents' || route.routeConfig?.path === 'documents';

    if (isFinanceScope) {
      if (!moduleRegistry.isModuleInstalled('accounting')) {
        return router.parseUrl(moduleRegistry.isModuleInstalled('warehouse') ? '/app/warehouse/dashboard' : '/app/launcher');
      }
      if (isCompanyDocsRoute) {
        // دسترسی به اسناد شرکت‌ها فارغ از شغل کاربری و فقط منوط به داشتن دسترسی در حداقل یک شرکت است
        const activeCompanyService = inject(ActiveCompanyService);
        const hasDocAccess = isAdmin || activeCompanyService.hasCompanyDocumentsAccess();
        if (!hasDocAccess) {
          return router.parseUrl(hasWarehouseAccess ? '/app/warehouse/dashboard' : '/app/launcher');
        }
      } else if (!hasPersonnelAccess) {
        if (hasWarehouseAccess && moduleRegistry.isModuleInstalled('warehouse')) {
          return router.parseUrl('/app/warehouse/dashboard');
        }
        return router.parseUrl('/login');
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
    if (path && ROUTE_PERMISSIONS[path]) {
      const requiredPerms = ROUTE_PERMISSIONS[path];
      if (!isAdmin) {
        if (!hasWarehouseAccess && WAREHOUSE_ROUTE_KEYS.has(path)) {
          if (hasPersonnelAccess) {
            return roleHome();
          }
          return router.parseUrl('/login');
        }

        if (!hasPersonnelAccess && FINANCE_ROUTE_KEYS.has(path)) {
          if (hasWarehouseAccess) {
            return router.parseUrl('/app/warehouse/dashboard');
          }
          return router.parseUrl('/login');
        }

        const hasAccess = requiredPerms.some(p => userPerms.includes(p));
        if (!hasAccess) {
          return roleHome();
        }
      }
    }

    return true;
  }
  return router.parseUrl('/login');
};

export const AuthGuardChild: CanActivateChildFn = (childRoute, state) => {
  return AuthGuard(childRoute, state);
};
