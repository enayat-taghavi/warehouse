import { RolePersona, ModulePersonas } from '../../core/modules/module-contract';
import { ROLE_ICONS } from '../../shared/icons/semantic-icons';

export const WAREHOUSE_ROLES: RolePersona[] = [
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
  }
];

export function resolveWarehouseRoleCodes(ctx: { perms: string[]; userRoles: string[] }): string[] {
  const { perms, userRoles } = ctx;
  const roles: string[] = [];

  if (userRoles.includes('counter') || perms.includes('view_sys_counter') || perms.includes('can_act_as_counter') || perms.includes('view_wh_dispatch')) {
    roles.push('counter');
  }
  if (userRoles.includes('warehouse_supervisor') || perms.includes('can_act_as_wh_supervisor') || (perms.includes('view_sys_supervisor') && !perms.includes('can_act_as_workshop_supervisor')) || perms.includes('view_wh_doc_approvals')) {
    roles.push('warehouse_supervisor');
  }
  if (userRoles.includes('docs_specialist') || perms.includes('view_wh_docs') || perms.includes('can_act_as_doc_worker') || perms.includes('perm_doc_approve_action')) {
    roles.push('docs_specialist');
  }
  if (userRoles.includes('manager_review') || perms.includes('can_act_as_wh_manager') || perms.includes('view_sys_manager_review') || perms.includes('perm_inventory_finalize')) {
    roles.push('manager_review');
  }

  return roles;
}

export const WAREHOUSE_SOD_PROHIBITIONS: Record<string, string[]> = {
  'warehouse:counter:/manager-review': ['finalize_inventory_count'],
  'warehouse:counter:/customs': ['view_customs_and_costs']
};

export const WAREHOUSE_DEFAULT_ROUTES: Record<string, string> = {
  counter: '/app/warehouse/counter',
  warehouse_supervisor: '/app/warehouse/supervisor',
  docs_specialist: '/app/warehouse/docs',
  manager_review: '/app/warehouse/dashboard'
};

export const WAREHOUSE_PERSONAS: ModulePersonas = {
  roles: WAREHOUSE_ROLES,
  resolveRoleCodes: resolveWarehouseRoleCodes,
  sodProhibitions: WAREHOUSE_SOD_PROHIBITIONS,
  defaultRouteForRole: WAREHOUSE_DEFAULT_ROUTES
};
