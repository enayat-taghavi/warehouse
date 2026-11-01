import { RolePersona, ModulePersonas } from '../../core/modules/module-contract';
import { ROLE_ICONS } from '../../shared/icons/semantic-icons';

export const ACCOUNTING_ROLES: RolePersona[] = [
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
  }
];

export function resolveAccountingRoleCodes(ctx: {
  perms: string[];
  userRoles: string[];
  companySectionLevel?: (section: string) => 'none' | 'read' | 'write';
}): string[] {
  const { perms, userRoles } = ctx;
  const roles: string[] = [];
  // راهبر تشکیلات: نوشتن «پروژه‌ها و بخش‌ها» (بخش هستهٔ projects) دست‌کم در یک شرکت؛ همتای role_resolver بک‌اند
  const isOrgAdmin = ctx.companySectionLevel?.('projects') === 'write';

  // کارمند: صراحتاً در نقش‌های کاربر یا دارای مجوز ثبت کارکرد (بدون تحمیل به حسابدار/سرپرست/مدیر/خزانه‌دار)
  const hasOperatorRole = userRoles.includes('operator');
  const hasOperatorPerm = perms.includes('view_sys_personnel_attendance');
  const isOtherExplicitRole = userRoles.some(r => ['accountant', 'supervisor', 'manager', 'treasury'].includes(r)) ||
    perms.includes('perm_approve_fleet_supervisor') ||
    perms.includes('perm_approve_personnel_finance') ||
    perms.includes('perm_approve_fleet_finance') ||
    perms.includes('perm_manager_payment_authorize') ||
    perms.includes('perm_approve_personnel_manager') ||
    perms.includes('perm_treasury_disburse_action') ||
    perms.includes('perm_approve_personnel_supervisor') ||
    isOrgAdmin;
  if (hasOperatorRole || (hasOperatorPerm && !isOtherExplicitRole)) {
    roles.push('operator');
  }

  // سرپرست کارگاه
  if (userRoles.includes('supervisor') || perms.includes('perm_approve_personnel_supervisor') || perms.includes('perm_approve_fleet_supervisor')) {
    roles.push('supervisor');
  }

  // حسابدار
  if (userRoles.includes('accountant') || perms.includes('perm_approve_personnel_finance') || perms.includes('perm_approve_fleet_finance')) {
    roles.push('accountant');
  }

  // مدیر شرکت
  if (userRoles.includes('manager') || perms.includes('perm_manager_payment_authorize') || perms.includes('perm_approve_personnel_manager')) {
    roles.push('manager');
  }

  // خزانه‌دار
  if (userRoles.includes('treasury') || userRoles.includes('treasurer') || perms.includes('perm_treasury_disburse_action')) {
    roles.push('treasury');
  }

  // راهبر تشکیلات: آخر فهرست تا نقش عملیاتی کاربر چندنقشه پیش‌فرض بماند
  if (isOrgAdmin) {
    roles.push('org_admin');
  }

  return roles;
}


/** «ثبت فاکتور» صفحهٔ کارمند است ولی در منوی سرپرست، حسابدار، مدیر و خزانه‌دار هم هست (مجوز perm_invoice_record پیش‌فرض این نقش‌هاست) */
function isSharedInvoiceRoute(cleanRoute: string): boolean {
  return cleanRoute.endsWith('/employee-invoices');
}

export function isAccountingRouteDeniedForRole(role: string, cleanRoute: string): boolean {
  if (role === 'accountant') {
    // حسابدار نباید به صفحات کارمند، سرپرست کارگاه، مدیر، خزانه‌دار دسترسی داشته باشد
    // گزارش‌های مدیریتی با مجوز perm_accounting_reports برای حسابدار هم باز است (طرح ۴.۷ د۸)
    const isReports = cleanRoute.endsWith('/manager-reports');
    const isAllowedEmployeeRoute = cleanRoute.endsWith('/employee-petty-cash') || isSharedInvoiceRoute(cleanRoute) || cleanRoute.endsWith('/employee-new-personnel');
    if ((cleanRoute.includes('/employee-') && !isAllowedEmployeeRoute) || cleanRoute.includes('/supervisor-') || (cleanRoute.includes('/manager-') && !isReports) || cleanRoute.includes('/treasurer-')) {
      return true;
    }
    if (cleanRoute.includes('treasury-cartable') || cleanRoute.includes('manager-approvals') || cleanRoute.includes('/attendance') || cleanRoute.includes('/fleet')) {
      return true;
    }
  } else if (role === 'operator') {
    // کارمند نباید به کارتابل‌های سرپرست، حسابدار، مدیر یا خزانه‌دار دسترسی داشته باشد
    if (cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-') || cleanRoute.includes('/treasurer-')) {
      return true;
    }
    if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('treasury-cartable') || cleanRoute.includes('manager-approvals')) {
      return true;
    }
  } else if (role === 'supervisor') {
    // سرپرست نباید به منوی کارمند، حسابدار، مدیر یا خزانه‌دار دسترسی داشته باشد
    if ((cleanRoute.includes('/employee-') && !isSharedInvoiceRoute(cleanRoute)) || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-') || cleanRoute.includes('/treasurer-')) {
      return true;
    }
    if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('treasury-cartable')) {
      return true;
    }
  } else if (role === 'manager') {
    // مدیر نباید به ثبت خام کارمند یا سرپرست یا محاسبات خام حسابدار دسترسی مستقیم داشته باشد
    if ((cleanRoute.includes('/employee-') && !cleanRoute.endsWith('/employee-petty-cash') && !isSharedInvoiceRoute(cleanRoute)) || cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/treasurer-')) {
      return true;
    }
  } else if (role === 'treasury') {
    // خزانه‌دار فقط به امور پرداخت و بانک دسترسی دارد
    if ((cleanRoute.includes('/employee-') && !cleanRoute.endsWith('/employee-petty-cash') && !isSharedInvoiceRoute(cleanRoute)) || cleanRoute.includes('/supervisor-') || cleanRoute.includes('/accountant-') || cleanRoute.includes('/manager-')) {
      return true;
    }
    if (cleanRoute.includes('finance-cartable') || cleanRoute.includes('manager-approvals')) {
      return true;
    }
  } else if (role === 'org_admin') {
    // راهبر تشکیلات فقط ساختار سازمانی را اداره می‌کند؛ هیچ کارتابل تایید، پرداخت یا ثبت کارکردی ندارد
    if (cleanRoute.startsWith('/app/finance')) {
      const allowed = ['/app/finance/projects-and-sections', '/app/finance/health'];
      if (!allowed.some(a => cleanRoute === a || cleanRoute.startsWith(a + '/'))) {
        return true;
      }
    }
  }

  return false;
}

export const ACCOUNTING_DEFAULT_ROUTES: Record<string, string> = {
  operator: '/app/finance/employee-attendance',
  supervisor: '/app/finance/supervisor-attendance',
  accountant: '/app/finance/accountant-payroll',
  manager: '/app/finance/manager-dashboard',
  treasury: '/app/finance/treasurer-disbursements',
  treasurer: '/app/finance/treasurer-disbursements',
  org_admin: '/app/finance/projects-and-sections'
};

export const ACCOUNTING_PERSONAS: ModulePersonas = {
  roles: ACCOUNTING_ROLES,
  resolveRoleCodes: resolveAccountingRoleCodes,
  isRouteDeniedForRole: isAccountingRouteDeniedForRole,
  defaultRouteForRole: ACCOUNTING_DEFAULT_ROUTES,
  lastResortRoute: '/app/finance/accountant-payroll'
};
