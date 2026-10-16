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

export function resolveAccountingRoleCodes(ctx: { perms: string[]; userRoles: string[] }): string[] {
  const { perms, userRoles } = ctx;
  const roles: string[] = [];

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
    roles.push('operator');
  }

  // سرپرست کارگاه
  if (userRoles.includes('supervisor') || perms.includes('can_act_as_workshop_supervisor') || perms.includes('perm_approve_personnel_supervisor') || perms.includes('perm_approve_fleet_supervisor')) {
    roles.push('supervisor');
  }

  // حسابدار
  if (userRoles.includes('accountant') || perms.includes('can_act_as_accountant') || perms.includes('perm_approve_personnel_finance') || perms.includes('perm_approve_fleet_finance')) {
    roles.push('accountant');
  }

  // مدیر شرکت
  if (userRoles.includes('manager') || perms.includes('can_act_as_company_manager') || perms.includes('perm_manager_payment_authorize') || perms.includes('perm_approve_personnel_manager')) {
    roles.push('manager');
  }

  // خزانه‌دار
  if (userRoles.includes('treasury') || userRoles.includes('treasurer') || perms.includes('perm_treasury_disburse_action') || perms.includes('view_sys_treasury')) {
    roles.push('treasury');
  }

  // راهبر تشکیلات: آخر فهرست تا نقش عملیاتی کاربر چندنقشه پیش‌فرض بماند
  if (perms.includes('perm_manage_projects_sections')) {
    roles.push('org_admin');
  }

  return roles;
}

export const ACCOUNTING_PERSONAS: ModulePersonas = {
  roles: ACCOUNTING_ROLES,
  resolveRoleCodes: resolveAccountingRoleCodes
};
