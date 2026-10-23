// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AppPersonaService } from '../../core/services/app-persona.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasRoutePermission } from '../../core/auth/auth.guard';
import { ModuleRegistryService } from '../../core/modules/module-registry.service';
import { WebSocketService } from '../../core/http/websocket.service';
import { SessionTabService } from '../../core/services/session-tab.service';
import { ActiveCompanyService } from '../../core/services/active-company.service';
import {
  NavItem,
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
  TREASURER_ROLE_MARKERS,
  filterRoleNavItems
} from './nav-items';

// switchRole نقش فعال را در localStorage می‌نویسد؛ محیط آزمون آن را ندارد
function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

export interface UserTestCase {
  username: string;
  fullName: string;
  expectedRole: 'operator' | 'supervisor' | 'accountant' | 'manager' | 'treasury' | 'org_admin' | 'superuser';
  allowedApps: string[];
  permissions: string[];
  roles: string[];
  isSuperuser: boolean;
  assignedProjects: string[];
  assignedSections: string[];
  canAccessWarehouse: boolean;
  /** سطح بخش‌های مجوز شرکت (نقش org_admin از نوشتن بخش projects می‌آید) */
  sectionLevels?: Record<string, 'none' | 'read' | 'write'>;
}

export const ALL_12_SYSTEM_USERS: UserTestCase[] = [
  {
    username: 'admin',
    fullName: 'مدیر شرکت',
    expectedRole: 'superuser',
    allowedApps: ['warehouse', 'finance'],
    permissions: ['admin_all'],
    roles: ['company_manager', 'admin_all'],
    isSuperuser: true,
    assignedProjects: ['دالان', 'پارسیان', 'انبارداری'],
    assignedSections: ['سراسری سیستم'],
    canAccessWarehouse: true
  },
  {
    username: 'h.alishvandi',
    fullName: 'حبیب عالیشوندی',
    expectedRole: 'manager',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_company_manager',
      'perm_approve_fleet_manager',
      'perm_approve_personnel_manager',
      'perm_lock_work_period',
      'perm_manager_payment_authorize',
      'view_sys_fleet_settlement',
      'view_sys_payroll',
      'view_sys_personnel'
    ],
    roles: ['company_manager'],
    isSuperuser: false,
    assignedProjects: ['دالان', 'پارسیان', 'انبارداری'],
    assignedSections: [
      'دالان > دالان فقط بیمه',
      'دالان > دالان کارگاه',
      'پارسیان > پارسیان کارگاه',
      'پارسیان > پارسیان فقط بیمه',
      'انبارداری > انبارداری کارگاه'
    ],
    canAccessWarehouse: false
  },
  {
    username: 'a.haghshenas',
    fullName: 'امیر حق شناس',
    expectedRole: 'manager',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_company_manager',
      'perm_approve_fleet_manager',
      'perm_approve_personnel_manager',
      'perm_lock_work_period',
      'perm_manager_payment_authorize',
      'view_sys_fleet_settlement',
      'view_sys_payroll',
      'view_sys_personnel'
    ],
    roles: ['company_manager'],
    isSuperuser: false,
    assignedProjects: ['دالان', 'پارسیان'],
    assignedSections: [
      'دالان > دالان فقط بیمه',
      'دالان > دالان کارگاه',
      'پارسیان > پارسیان کارگاه',
      'پارسیان > پارسیان فقط بیمه'
    ],
    canAccessWarehouse: false
  },
  {
    username: 'm.bagheri',
    fullName: 'مهری باقری',
    expectedRole: 'accountant',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_accountant',
      'perm_approve_fleet_finance',
      'perm_approve_personnel_finance',
      'view_sys_fleet_settlement',
      'view_sys_payroll',
      'view_sys_personnel'
    ],
    roles: ['accountant'],
    isSuperuser: false,
    assignedProjects: ['دالان', 'پارسیان', 'انبارداری'],
    assignedSections: [
      'دالان > دالان فقط بیمه',
      'دالان > دالان کارگاه',
      'پارسیان > پارسیان کارگاه',
      'پارسیان > پارسیان فقط بیمه',
      'انبارداری > انبارداری کارگاه'
    ],
    canAccessWarehouse: false
  },
  {
    username: 'e.taghavi',
    fullName: 'عنایت تقوی',
    expectedRole: 'treasury',
    allowedApps: ['finance'],
    permissions: [
      'perm_treasury_disburse_action',
      'view_sys_payroll',
      'view_sys_personnel',
      'view_sys_treasury'
    ],
    roles: ['treasury'],
    isSuperuser: false,
    assignedProjects: ['دالان', 'پارسیان'],
    assignedSections: [
      'دالان > دالان فقط بیمه',
      'دالان > دالان کارگاه',
      'پارسیان > پارسیان فقط بیمه',
      'پارسیان > پارسیان کارگاه'
    ],
    canAccessWarehouse: false
  },
  {
    username: 'n.beyrami',
    fullName: 'نسرین بیرمی',
    expectedRole: 'treasury',
    allowedApps: ['finance'],
    permissions: [
      'perm_treasury_disburse_action',
      'view_sys_payroll',
      'view_sys_personnel',
      'view_sys_treasury'
    ],
    roles: ['treasury'],
    isSuperuser: false,
    assignedProjects: ['انبارداری'],
    assignedSections: ['انبارداری > انبارداری کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'h.akbari',
    fullName: 'حسین اکبری',
    expectedRole: 'supervisor',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_workshop_supervisor',
      'perm_approve_fleet_supervisor',
      'perm_approve_personnel_supervisor',
      'perm_lock_work_period',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_supervisor'],
    isSuperuser: false,
    assignedProjects: ['انبارداری'],
    assignedSections: ['انبارداری > انبارداری کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'r.hoseeni',
    fullName: 'رزاق حسینی',
    expectedRole: 'supervisor',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_workshop_supervisor',
      'perm_approve_fleet_supervisor',
      'perm_approve_personnel_supervisor',
      'perm_lock_work_period',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_supervisor'],
    isSuperuser: false,
    assignedProjects: ['دالان'],
    assignedSections: ['دالان > دالان کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'm.amiri',
    fullName: 'محمد امیری',
    expectedRole: 'supervisor',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_workshop_supervisor',
      'perm_approve_fleet_supervisor',
      'perm_approve_personnel_supervisor',
      'perm_lock_work_period',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_supervisor'],
    isSuperuser: false,
    assignedProjects: ['پارسیان'],
    assignedSections: ['پارسیان > پارسیان کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'a.mohammadi',
    fullName: 'امین محمدی',
    expectedRole: 'operator',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_operator',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_operator'],
    isSuperuser: false,
    assignedProjects: ['انبارداری'],
    assignedSections: ['انبارداری > انبارداری کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'gh.alishvandi',
    fullName: 'قاسم عالیشوندی',
    expectedRole: 'operator',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_operator',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_operator'],
    isSuperuser: false,
    assignedProjects: ['دالان'],
    assignedSections: ['دالان > دالان کارگاه'],
    canAccessWarehouse: false
  },
  {
    username: 'a.ghashghaee',
    fullName: 'علی قشقایی',
    expectedRole: 'operator',
    allowedApps: ['finance'],
    permissions: [
      'can_act_as_operator',
      'view_sys_fleet_attendance',
      'view_sys_personnel_attendance'
    ],
    roles: ['workshop_operator'],
    isSuperuser: false,
    assignedProjects: [],
    assignedSections: [],
    canAccessWarehouse: false
  }
];

/**
 * کاربر نمونهٔ «راهبر تشکیلات و سیستم»: بی مجوز ویژه، فقط سطح «نوشتن» بخش «پروژه‌ها و بخش‌ها» در یک شرکت.
 */
export const ORG_ADMIN_SAMPLE_USER: UserTestCase = {
  username: 'org.admin.sample',
  fullName: 'راهبر تشکیلات (نمونهٔ آزمون)',
  expectedRole: 'org_admin',
  allowedApps: ['finance'],
  permissions: [],
  roles: ['org_admin'],
  isSuperuser: false,
  assignedProjects: [],
  assignedSections: [],
  canAccessWarehouse: false,
  sectionLevels: { projects: 'write' }
};

/** گروه‌های منوی نقش در سایدبار، به همان ترتیب و با همان نشانگرهای layout.ts */
const ROLE_MENU_GROUPS: Array<{ role: string; cls: string; title: string; items: NavItem[]; markers: string[] }> = [
  { role: 'org_admin', cls: 'org-admin', title: 'منوی راهبر تشکیلات', items: ORG_ADMIN_NAV_ITEMS, markers: ORG_ADMIN_ROLE_MARKERS },
  { role: 'operator', cls: 'employee', title: 'منوی ثبت کارمند', items: EMPLOYEE_NAV_ITEMS, markers: EMPLOYEE_ROLE_MARKERS },
  { role: 'supervisor', cls: 'supervisor', title: 'منوی سرپرست کارگاه', items: SUPERVISOR_NAV_ITEMS, markers: SUPERVISOR_ROLE_MARKERS },
  { role: 'accountant', cls: 'accountant', title: 'منوی حسابدار', items: ACCOUNTANT_NAV_ITEMS, markers: ACCOUNTANT_ROLE_MARKERS },
  { role: 'manager', cls: 'manager', title: 'منوی مدیر کلان', items: MANAGER_NAV_ITEMS, markers: MANAGER_ROLE_MARKERS },
  { role: 'treasury', cls: 'treasurer', title: 'منوی خزانه‌دار', items: TREASURER_NAV_ITEMS, markers: TREASURER_ROLE_MARKERS }
];

/** مسیرهای بازنشسته یا آیتم‌های منوی عمومی برچیده که هیچ منوی نقشی نباید به آن‌ها لینک بدهد */
const RETIRED_MENU_IDS = [
  'finance-cartable', 'treasury-cartable', 'treasury', 'employee-portal', 'attendance', 'fleet',
  'fleet-attendance', 'counterparties', 'finance-audit', 'finance-health', 'audit', 'health'
];

/** همان قاعدهٔ layout.roleNavItems: منوی هر نقش فقط برای نقش فعال (یا مدیر ارشد) و از فیلتر مشترک */
function resolveRoleNav(role: string, activeRole: string, userPerms: string[], items: NavItem[], markers: string[]): NavItem[] {
  const isAdmin = userPerms.includes('admin_all');
  if (!isAdmin && activeRole !== role) return [];
  return filterRoleNavItems(items, {
    isAdmin,
    userPerms,
    roleMarkers: markers,
    routeAllowed: (id) => hasRoutePermission(id, userPerms)
  });
}

function createPersona(user: UserTestCase, sessionRole: string): AppPersonaService {
  const mockAuth = {
    user: signal<any>({
      username: user.username,
      is_superuser: user.isSuperuser,
      roles: user.roles,
      allowed_apps: user.allowedApps,
      active_app: user.allowedApps.includes('finance') ? 'finance' : 'warehouse'
    }),
    userPermissions: signal<string[]>(user.permissions),
    isSuperuser: signal<boolean>(user.isSuperuser),
    hasRole: vi.fn(),
    hasPermission: vi.fn()
  };

  const injector = Injector.create({
    providers: [
      {
        provide: Router,
        useValue: {
          events: { pipe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) },
          navigate: vi.fn(),
          url: '/'
        }
      },
      { provide: AppPersonaService, useClass: AppPersonaService },
      { provide: AuthService, useValue: mockAuth },
      {
        provide: ActiveCompanyService,
        useValue: {
          isModuleEnabled: () => true,
          hasCompanyDocumentsAccess: () => false,
          manageableCompanies: signal<any[]>(user.sectionLevels ? [{ id: 1, section_levels: user.sectionLevels }] : [])
        }
      },
      { provide: ModuleRegistryService, useValue: new ModuleRegistryService() },
      { provide: WebSocketService, useValue: { sendMessage: vi.fn(), switchAppChannel: vi.fn() } },
      {
        provide: SessionTabService,
        useValue: {
          getTabId: vi.fn().mockReturnValue('test-tab-456'),
          getActiveApp: vi.fn().mockReturnValue(user.allowedApps.includes('finance') ? 'personnel' : 'warehouse'),
          getActiveRole: vi.fn().mockReturnValue(sessionRole),
          setActiveApp: vi.fn(),
          setActiveRole: vi.fn()
        }
      }
    ]
  });

  return injector.get(AppPersonaService);
}

describe('Segregation of Duties (SoD) & DOM Verification for All 12 Database Users + Org Admin', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  for (const user of [...ALL_12_SYSTEM_USERS, ORG_ADMIN_SAMPLE_USER]) {
    it(`[DOM & SoD Verify] User ${user.username} (${user.fullName}) - Role: ${user.expectedRole}`, () => {
      // 1. پرسونا با وضعیت همان کاربر دیتابیس
      const personaService = createPersona(user, user.expectedRole);

      // 2. ایزولاسیون سامانه‌ها
      const apps = personaService.accessibleApps();
      if (user.isSuperuser) {
        expect(apps).toContain('personnel');
        expect(apps).toContain('warehouse');
        expect(personaService.canAccessApp('warehouse')).toBe(true);
      } else {
        expect(apps).toContain('personnel');
        expect(apps).not.toContain('warehouse');
        expect(personaService.canAccessApp('warehouse')).toBe(false);
      }
      expect(personaService.canAccessApp('warehouse')).toBe(user.canAccessWarehouse);

      // 3. تک‌نقشی بودن (SoD سخت‌گیرانه)
      const roleCodes = personaService.availableRoles().map((r: any) => r.code);
      if (user.isSuperuser) {
        expect(roleCodes).toContain('superuser');
      } else {
        expect(roleCodes).toEqual([user.expectedRole]);
        expect(personaService.activeRole()).toBe(user.expectedRole);
      }

      // 4. سایدبار با همان فیلتر مشترک layout
      const userPerms = user.permissions;
      const activeRole = personaService.activeRole();
      const domContainer = document.createElement('div');
      domContainer.id = 'test-sidebar-dom';
      document.body.appendChild(domContainer);

      let domHtml = '<nav id="sidebar-nav">';
      for (const group of ROLE_MENU_GROUPS) {
        const resolved = resolveRoleNav(group.role, activeRole, userPerms, group.items, group.markers);
        if (resolved.length > 0) {
          domHtml += `<div class="accordion-${group.cls}"><span class="accordion-title">${group.title}</span>`;
          for (const item of resolved) {
            domHtml += `<a class="sidebar-link ${group.cls}-link" data-tab-id="${item.id}">${item.label}</a>`;
          }
          domHtml += `</div>`;
        }
      }
      if (user.canAccessWarehouse) {
        domHtml += `<div class="warehouse-switcher-card"><button class="change-wh-btn">تغییر انبار</button></div>`;
      }
      domHtml += '</nav>';
      domContainer.innerHTML = domHtml;

      // 5. شمارش لینک‌ها در DOM
      const count = (cls: string) => domContainer.querySelectorAll(`.${cls}-link`).length;
      const linkIds = Array.from(domContainer.querySelectorAll('.sidebar-link')).map(a => a.getAttribute('data-tab-id')!);
      const warehouseCard = domContainer.querySelector('.warehouse-switcher-card');

      // ترتیب: راهبر تشکیلات، کارمند، سرپرست، حسابدار، مدیر، خزانه‌دار
      const expected: Record<string, number[]> = {
        operator: [0, 6, 0, 0, 0, 0],
        supervisor: [0, 0, 5, 0, 0, 0],
        accountant: [0, 0, 0, 9, 0, 0],
        manager: [0, 0, 0, 0, 7, 0],
        treasury: [0, 0, 0, 0, 0, 5],
        org_admin: [1, 0, 0, 0, 0, 0]
      };

      if (user.expectedRole === 'superuser') {
        for (const group of ROLE_MENU_GROUPS) {
          expect(count(group.cls)).toBe(group.items.length);
        }
        expect(warehouseCard).not.toBeNull();
      } else {
        expect(ROLE_MENU_GROUPS.map(g => count(g.cls))).toEqual(expected[user.expectedRole]);
        expect(warehouseCard).toBeNull();
      }

      // 6. لینک مرده نداریم: هر لینک نمایش‌داده‌شده از گارد مسیر (ROUTE_PERMISSIONS) رد می‌شود
      for (const id of linkIds) {
        expect(hasRoutePermission(id, userPerms), `link ${id} for ${user.username}`).toBe(true);
      }

      // 7. هیچ منوی نقشی به صفحهٔ بازنشسته یا آیتم منوی عمومی برچیده لینک نمی‌دهد
      for (const retired of RETIRED_MENU_IDS) {
        expect(linkIds).not.toContain(retired);
      }

      // 8. آیتم‌های منتقل‌شده در منوی نقش مقصد
      if (user.expectedRole === 'accountant') {
        expect(linkIds).toEqual(expect.arrayContaining(['accountant-payroll', 'accountant-counterparties', 'profiles', 'base-settings']));
      }
      if (user.expectedRole === 'manager') {
        expect(linkIds).toEqual(expect.arrayContaining(['manager-approvals', 'base-settings']));
      }
      if (user.expectedRole === 'org_admin') {
        expect(linkIds).toEqual(['projects-and-sections']);
      }

      document.body.removeChild(domContainer);
    });
  }
});

describe('Org Admin persona (راهبر تشکیلات و سیستم)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('org-admin-only user gets only the org_admin role, its home route and an allowlist inside finance', () => {
    // نقش ذخیره‌شدهٔ نامعتبر با نقش معتبر جایگزین می‌شود و فال‌بک کارمند ندارد
    const persona = createPersona(ORG_ADMIN_SAMPLE_USER, 'operator');

    expect(persona.availableRoles().map(r => r.code)).toEqual(['org_admin']);
    expect(persona.activeRole()).toBe('org_admin');
    expect(persona.getDefaultRouteForRole()).toBe('/app/finance/projects-and-sections');

    expect(persona.canAccessRoute('/app/finance/projects-and-sections')).toBe(true);
    expect(persona.canAccessRoute('/app/finance/health')).toBe(true);
    for (const blocked of [
      '/app/finance/accountant-payroll',
      '/app/finance/manager-approvals',
      '/app/finance/employee-attendance',
      '/app/finance/treasurer-disbursements',
      '/app/finance/base-settings',
      '/app/finance/profiles'
    ]) {
      expect(persona.canAccessRoute(blocked), blocked).toBe(false);
    }
    expect(persona.canAccessRoute('/app/operations/cockpit')).toBe(false);
  });

  it('accountant who is also org admin keeps accountant as the default role (org_admin comes last)', () => {
    const accountant = ALL_12_SYSTEM_USERS.find(u => u.expectedRole === 'accountant')!;
    const mixed: UserTestCase = {
      ...accountant,
      username: 'accountant.org.admin',
      sectionLevels: { projects: 'write' }
    };
    const persona = createPersona(mixed, '');

    expect(persona.availableRoles().map(r => r.code)).toEqual(['accountant', 'org_admin']);
    expect(persona.activeRole()).toBe('accountant');
    expect(persona.getDefaultRouteForRole()).toBe('/app/finance/accountant-payroll');

    // منوی راهبر فقط با انتخاب صریح پرسونای راهبر دیده می‌شود
    expect(resolveRoleNav('org_admin', persona.activeRole(), mixed.permissions, ORG_ADMIN_NAV_ITEMS, ORG_ADMIN_ROLE_MARKERS)).toEqual([]);
    persona.switchRole('org_admin', false);
    expect(resolveRoleNav('org_admin', persona.activeRole(), mixed.permissions, ORG_ADMIN_NAV_ITEMS, ORG_ADMIN_ROLE_MARKERS).map(i => i.id))
      .toEqual(['projects-and-sections']);
  });

  it('hides a role-menu link that the route guard would bounce', () => {
    // کاربر فرضی بدون نشانگر حسابدار که فقط view_sys_personnel دارد: فقط لینک پرونده‌ها دیده می‌شود
    const perms = ['view_sys_personnel'];
    const items = filterRoleNavItems(ACCOUNTANT_NAV_ITEMS, {
      isAdmin: false,
      userPerms: perms,
      roleMarkers: ACCOUNTANT_ROLE_MARKERS,
      routeAllowed: (id) => hasRoutePermission(id, perms)
    });
    expect(items.map(i => i.id)).toEqual(['profiles']);

    // کاربری که نشانگر نقش دارد ولی گارد مسیر او را رد می‌کند، آن لینک را نمی‌بیند
    const markerOnly = ['view_sys_payroll'];
    const markerItems = filterRoleNavItems(ACCOUNTANT_NAV_ITEMS, {
      isAdmin: false,
      userPerms: markerOnly,
      roleMarkers: ACCOUNTANT_ROLE_MARKERS,
      routeAllowed: (id) => hasRoutePermission(id, markerOnly)
    }).map(i => i.id);
    expect(markerItems).not.toContain('accountant-fleet');
    expect(markerItems).not.toContain('profiles');
    expect(markerItems).toContain('accountant-payroll');
  });
});
