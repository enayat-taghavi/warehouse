import { WhFrontendModule } from '../../core/modules/module-contract';
import {
  ORG_ADMIN_NAV_ITEMS,
  EMPLOYEE_NAV_ITEMS,
  SUPERVISOR_NAV_ITEMS,
  ACCOUNTANT_NAV_ITEMS,
  MANAGER_NAV_ITEMS,
  TREASURER_NAV_ITEMS,
  ORG_ADMIN_ROLE_MARKERS,
  EMPLOYEE_ROLE_MARKERS,
  SUPERVISOR_ROLE_MARKERS,
  ACCOUNTANT_ROLE_MARKERS,
  MANAGER_ROLE_MARKERS,
  TREASURER_ROLE_MARKERS
} from './nav-items';
import { ACCOUNTING_ENTITY_ICONS } from './entity-icons';

/**
 * مانیفست رسمی و مستقل ماژول مالی، حقوق و کارکرد (Front-End Module Manifest)
 */
export const MODULE: WhFrontendModule = {
  code: 'accounting',
  aliases: ['personnel', 'finance'],
  titleFa: 'سامانه مالی، حقوق و کارکرد',
  titleShortFa: 'مالی و حقوق',
  descriptionFa: 'ثبت و کنترل کارکرد روزانه، کارتابل تاییدات ۵ سطحی، محاسبات فیش حقوقی، دیسکت‌های بیمه تامین اجتماعی و مالیات، خزانه‌داری و پرداخت پایا.',
  icon: '💳',
  routePrefix: '/app/finance',
  defaultRoute: '/app/finance',
  scopeKind: 'finance',
  permissionMarkers: [
    'view_sys_personnel', 'view_sys_personnel_attendance', 'view_sys_fleet_attendance',
    'view_sys_payroll', 'view_sys_fleet_settlement', 'view_sys_treasury',
    'perm_lock_work_period', 'perm_approve_personnel_supervisor', 'perm_approve_personnel_manager',
    'perm_approve_personnel_finance', 'perm_approve_fleet_supervisor', 'perm_approve_fleet_manager',
    'perm_approve_fleet_finance', 'perm_manager_payment_authorize', 'perm_treasury_disburse_action',
    'can_act_as_accountant', 'can_act_as_operator', 'view_sys_projects', 'perm_manage_projects_sections'
  ],
  roles: ['operator', 'supervisor', 'accountant', 'manager', 'treasury', 'org_admin'],
  routes: () => import('./accounting.routes').then(m => m.ACCOUNTING_ROUTES),
  navItems: {
    orgAdminNavItems: ORG_ADMIN_NAV_ITEMS,
    employeeNavItems: EMPLOYEE_NAV_ITEMS,
    supervisorNavItems: SUPERVISOR_NAV_ITEMS,
    accountantNavItems: ACCOUNTANT_NAV_ITEMS,
    managerNavItems: MANAGER_NAV_ITEMS,
    treasurerNavItems: TREASURER_NAV_ITEMS,
  },
  entityIcons: ACCOUNTING_ENTITY_ICONS,
  extensions: {
    launcherTile: {
      themeColor: 'emerald',
      tags: ['کارتابل مالی', 'ثبت کارکرد', 'خزانه‌داری'],
      appKey: 'personnel'
    },
    userMenu: {
      deepSyncScope: 'finance'
    },
    layoutNav: {
      hasCompanyDocumentsArchive: true,
      roleMenus: [
        { role: 'org_admin', items: ORG_ADMIN_NAV_ITEMS, roleMarkers: ORG_ADMIN_ROLE_MARKERS },
        { role: 'operator', items: EMPLOYEE_NAV_ITEMS, roleMarkers: EMPLOYEE_ROLE_MARKERS },
        { role: 'supervisor', items: SUPERVISOR_NAV_ITEMS, roleMarkers: SUPERVISOR_ROLE_MARKERS },
        { role: 'accountant', items: ACCOUNTANT_NAV_ITEMS, roleMarkers: ACCOUNTANT_ROLE_MARKERS },
        { role: 'manager', items: MANAGER_NAV_ITEMS, roleMarkers: MANAGER_ROLE_MARKERS },
        { role: 'treasury', items: TREASURER_NAV_ITEMS, roleMarkers: TREASURER_ROLE_MARKERS },
      ],
      defaultExitRoute: '/app/finance'
    },
    operations: {
      quickLink: { title: 'سامانه مالی و پرسنلی', route: '/app/finance' },
      hasExpiringDocsWidget: true,
      syncMonitorScope: 'accounting'
    },
    companies: {
      providesTreasury: true
    },
    users: {
      permissionGroupKeys: ['ACCOUNTING_FINANCE']
    },
    healthDashboard: {
      panelScopes: ['accounting']
    },
    audit: {
      appScopes: ['finance']
    },
    companyApiEndpoints: {
      companiesEndpoint: '/personnel/companies',
      accessEndpoint: '/personnel/user-company-access'
    },
    syncConfig: {
      scopeKind: 'finance',
      pullEndpoint: '/personnel/sync/pull/',
      scopeParamKey: 'project_id'
    },
    projectLookup: {
      financialProjectsEndpoint: '/personnel/financial-projects'
    }
  }
};
