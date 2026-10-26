// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppPersonaService } from './app-persona.service';
import { AuthService } from '../auth/auth.service';
import { WebSocketService } from '../http/websocket.service';
import { SessionTabService } from './session-tab.service';
import { ActiveCompanyService } from './active-company.service';
import { ModuleRegistryService } from '../modules/module-registry.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();

describe('AppPersonaService Characterization Spec', () => {
  let service: AppPersonaService;
  let mockAuth: {
    user: ReturnType<typeof signal<any>>;
    userPermissions: ReturnType<typeof signal<string[]>>;
    switchAppScope: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    events: Subject<any>;
    navigate: ReturnType<typeof vi.fn>;
    url: string;
  };
  let mockWs: {
    sendMessage: ReturnType<typeof vi.fn>;
    switchAppChannel: ReturnType<typeof vi.fn>;
  };
  let mockSessionTab: {
    getActiveApp: ReturnType<typeof vi.fn>;
    getActiveRole: ReturnType<typeof vi.fn>;
    setActiveApp: ReturnType<typeof vi.fn>;
    setActiveRole: ReturnType<typeof vi.fn>;
  };
  let mockActiveCompany: {
    isModuleEnabled: (code: string) => boolean;
    hasCompanyDocumentsAccess: ReturnType<typeof vi.fn>;
    manageableCompanies: ReturnType<typeof signal<any[]>>;
  };

  const ACCESS_USER_BASE_PERMS = ['view_sys_dashboard', 'view_sys_personnel'];
  const ACCESS_USER_ALLOWED_APPS = ['warehouse', 'accounting', 'personnel', 'finance'];

  beforeEach(() => {
    localStorage.clear();

    mockAuth = {
      user: signal<any>({
        username: 'access_user',
        is_superuser: false,
        roles: [],
        allowed_apps: ACCESS_USER_ALLOWED_APPS,
      }),
      userPermissions: signal<string[]>([...ACCESS_USER_BASE_PERMS]),
      switchAppScope: vi.fn(),
    };

    mockRouter = {
      events: new Subject<any>(),
      navigate: vi.fn(),
      url: '/',
    };

    mockWs = {
      sendMessage: vi.fn(),
      switchAppChannel: vi.fn(),
    };

    mockSessionTab = {
      getActiveApp: vi.fn().mockReturnValue('personnel'),
      getActiveRole: vi.fn().mockReturnValue('operator'),
      setActiveApp: vi.fn(),
      setActiveRole: vi.fn(),
    };

    mockActiveCompany = {
      isModuleEnabled: () => true,
      hasCompanyDocumentsAccess: vi.fn().mockReturnValue(false),
      manageableCompanies: signal<any[]>([]),
    };

    TestBed.configureTestingModule({
      providers: [
        AppPersonaService,
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: WebSocketService, useValue: mockWs },
        { provide: SessionTabService, useValue: mockSessionTab },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
      ],
    });

    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['warehouse', 'accounting']);

    service = TestBed.inject(AppPersonaService);
  });

  // =========================================================================
  // a) Superuser persona lists for personnel, warehouse, and operations
  // =========================================================================
  describe('a) Superuser full persona objects', () => {
    beforeEach(() => {
      mockAuth.user.set({
        username: 'superadmin',
        is_superuser: true,
        roles: ['admin', 'superuser'],
        allowed_apps: ['warehouse', 'accounting', 'operations'],
      });
      mockAuth.userPermissions.set(['admin_all']);
    });

    it('returns full persona objects in order for activeApp personnel', () => {
      service.activeApp.set('personnel');
      expect(service.availableRoles()).toEqual([
        {
          code: 'operator',
          title: 'کارمند',
          app: 'personnel',
          badgeColor: '#64748b',
          bgClass: 'bg-slate-600',
          icon: 'user',
          tierLevel: 1,
        },
        {
          code: 'supervisor',
          title: 'سرپرست',
          app: 'personnel',
          badgeColor: '#2563eb',
          bgClass: 'bg-blue-600',
          icon: 'user-check',
          tierLevel: 2,
        },
        {
          code: 'accountant',
          title: 'حسابدار',
          app: 'personnel',
          badgeColor: '#059669',
          bgClass: 'bg-emerald-600',
          icon: 'layout',
          tierLevel: 3,
        },
        {
          code: 'manager',
          title: 'مدیر',
          app: 'personnel',
          badgeColor: '#7c3aed',
          bgClass: 'bg-purple-600',
          icon: 'crown',
          tierLevel: 4,
        },
        {
          code: 'treasury',
          title: 'خزانه‌دار',
          app: 'personnel',
          badgeColor: '#d97706',
          bgClass: 'bg-amber-600',
          icon: 'briefcase-2',
          tierLevel: 5,
        },
        {
          code: 'org_admin',
          title: 'راهبر تشکیلات و سیستم',
          app: 'personnel',
          badgeColor: '#0284c7',
          bgClass: 'bg-sky-600',
          icon: 'shield-check',
          tierLevel: 4,
        },
        {
          code: 'superuser',
          title: 'مدیر ارشد',
          app: 'personnel',
          badgeColor: '#e11d48',
          bgClass: 'bg-rose-600',
          icon: 'zap',
          tierLevel: 6,
        },
      ]);
    });

    it('returns full persona objects in order for activeApp warehouse', () => {
      service.activeApp.set('warehouse');
      expect(service.availableRoles()).toEqual([
        {
          code: 'counter',
          title: 'انبارگردان / شمارشگر کور',
          app: 'warehouse',
          badgeColor: '#0284c7',
          bgClass: 'bg-sky-600',
          icon: 'crosshair',
          tierLevel: 1,
        },
        {
          code: 'warehouse_supervisor',
          title: 'سرپرست انبار و شمارش',
          app: 'warehouse',
          badgeColor: '#4f46e5',
          bgClass: 'bg-indigo-600',
          icon: 'box',
          tierLevel: 2,
        },
        {
          code: 'docs_specialist',
          title: 'مسئول تطبیق و اسناد انبار',
          app: 'warehouse',
          badgeColor: '#0d9488',
          bgClass: 'bg-teal-600',
          icon: 'file-plus',
          tierLevel: 3,
        },
        {
          code: 'manager_review',
          title: 'ناظر عالی و بررسی مدیر',
          app: 'warehouse',
          badgeColor: '#9333ea',
          bgClass: 'bg-purple-600',
          icon: 'check-check',
          tierLevel: 4,
        },
        {
          code: 'superuser',
          title: 'مدیر ارشد',
          app: 'personnel',
          badgeColor: '#e11d48',
          bgClass: 'bg-rose-600',
          icon: 'zap',
          tierLevel: 6,
        },
      ]);
    });

    it('returns full persona objects in order for activeApp operations', () => {
      service.activeApp.set('operations');
      expect(service.availableRoles()).toEqual([
        {
          code: 'ops_commander',
          title: 'فرمانده عملیات و پدافند',
          app: 'operations',
          badgeColor: '#06b6d4',
          bgClass: 'bg-cyan-600',
          icon: 'shield',
          tierLevel: 6,
        },
        {
          code: 'superuser',
          title: 'مدیر ارشد',
          app: 'personnel',
          badgeColor: '#e11d48',
          bgClass: 'bg-rose-600',
          icon: 'zap',
          tierLevel: 6,
        },
      ]);
    });
  });

  // =========================================================================
  // b) Non-superuser role lists for app 'personnel'
  // =========================================================================
  describe('b) Non-superuser role lists for app personnel', () => {
    beforeEach(() => {
      service.activeApp.set('personnel');
    });

    it('triggers operator via user role operator', () => {
      mockAuth.user.set({ roles: ['operator'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['operator']);
    });

    it('triggers operator via permission view_sys_personnel_attendance', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_personnel_attendance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['operator']);
    });

    it('triggers operator via view_sys_personnel_attendance when no other explicit role exists', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_personnel_attendance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['operator']);
    });

    it('suppresses operator via view_sys_personnel_attendance when another explicit role exists (accountant)', () => {
      mockAuth.user.set({ roles: ['accountant'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_personnel_attendance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['accountant']);
    });

    it('suppresses operator via view_sys_personnel_attendance when another explicit perm exists (perm_approve_personnel_supervisor)', () => {
      mockAuth.userPermissions.set([
        ...ACCESS_USER_BASE_PERMS,
        'view_sys_personnel_attendance',
        'perm_approve_personnel_supervisor',
      ]);
      expect(service.availableRoles().map(r => r.code)).toEqual(['supervisor']);
    });

    it('triggers supervisor via user role supervisor', () => {
      mockAuth.user.set({ roles: ['supervisor'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['supervisor']);
    });

    it('triggers supervisor via permission perm_approve_personnel_supervisor', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_personnel_supervisor']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['supervisor']);
    });

    it('triggers supervisor via permission perm_approve_personnel_supervisor', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_personnel_supervisor']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['supervisor']);
    });

    it('triggers supervisor via permission perm_approve_fleet_supervisor', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_fleet_supervisor']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['supervisor']);
    });

    it('triggers accountant via user role accountant', () => {
      mockAuth.user.set({ roles: ['accountant'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['accountant']);
    });

    it('triggers accountant via permission perm_approve_personnel_finance', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_personnel_finance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['accountant']);
    });

    it('triggers accountant via permission perm_approve_personnel_finance', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_personnel_finance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['accountant']);
    });

    it('triggers accountant via permission perm_approve_fleet_finance', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_fleet_finance']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['accountant']);
    });

    it('triggers manager via user role manager', () => {
      mockAuth.user.set({ roles: ['manager'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager']);
    });

    it('triggers manager via permission perm_manager_payment_authorize', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_manager_payment_authorize']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager']);
    });

    it('triggers manager via permission perm_manager_payment_authorize', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_manager_payment_authorize']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager']);
    });

    it('triggers manager via permission perm_approve_personnel_manager', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_approve_personnel_manager']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager']);
    });

    it('triggers treasury via user role treasury', () => {
      mockAuth.user.set({ roles: ['treasury'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['treasury']);
    });

    it('triggers treasury via user role treasurer', () => {
      mockAuth.user.set({ roles: ['treasurer'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['treasury']);
    });

    it('triggers treasury via permission perm_treasury_disburse_action', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_treasury_disburse_action']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['treasury']);
    });

    it('triggers treasury via permission perm_treasury_disburse_action', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_treasury_disburse_action']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['treasury']);
    });

    it('triggers org_admin via write level of the projects company section', () => {
      mockActiveCompany.manageableCompanies.set([{ id: 1, section_levels: { projects: 'write' } }]);
      expect(service.availableRoles().map(r => r.code)).toEqual(['org_admin']);
    });

    it('does not trigger org_admin with only read level of the projects company section', () => {
      mockActiveCompany.manageableCompanies.set([{ id: 1, section_levels: { projects: 'read' } }]);
      expect(service.availableRoles().map(r => r.code)).not.toContain('org_admin');
    });

    it('triggers all personnel roles together in exact order', () => {
      mockAuth.user.set({
        roles: ['operator', 'supervisor', 'accountant', 'manager', 'treasury'],
        allowed_apps: ACCESS_USER_ALLOWED_APPS,
      });
      mockAuth.userPermissions.set([
        ...ACCESS_USER_BASE_PERMS,
        'view_sys_personnel_attendance',
        'perm_approve_personnel_supervisor',
        'perm_approve_personnel_finance',
        'perm_manager_payment_authorize',
        'perm_treasury_disburse_action',
      ]);
      mockActiveCompany.manageableCompanies.set([{ id: 1, section_levels: { projects: 'write' } }]);
      expect(service.availableRoles().map(r => r.code)).toEqual([
        'operator',
        'supervisor',
        'accountant',
        'manager',
        'treasury',
        'org_admin',
      ]);
    });
  });

  // =========================================================================
  // c) Non-superuser role lists for app 'warehouse'
  // =========================================================================
  describe('c) Non-superuser role lists for app warehouse', () => {
    beforeEach(() => {
      service.activeApp.set('warehouse');
    });

    it('triggers counter via user role counter', () => {
      mockAuth.user.set({ roles: ['counter'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['counter']);
    });

    it('triggers counter via permission view_sys_counter', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_counter']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['counter']);
    });

    it('triggers counter via permission can_act_as_counter', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'can_act_as_counter']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['counter']);
    });

    it('triggers counter via permission view_wh_dispatch', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_wh_dispatch']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['counter']);
    });

    it('triggers warehouse_supervisor via user role warehouse_supervisor', () => {
      mockAuth.user.set({ roles: ['warehouse_supervisor'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['warehouse_supervisor']);
    });

    it('triggers warehouse_supervisor via permission can_act_as_wh_supervisor', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'can_act_as_wh_supervisor']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['warehouse_supervisor']);
    });

    it('triggers warehouse_supervisor via view_sys_supervisor without perm_approve_personnel_supervisor', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_supervisor']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['warehouse_supervisor']);
    });

    it('suppresses warehouse_supervisor via view_sys_supervisor when perm_approve_personnel_supervisor is present', () => {
      mockAuth.userPermissions.set([
        ...ACCESS_USER_BASE_PERMS,
        'view_sys_supervisor',
        'perm_approve_personnel_supervisor',
      ]);
      expect(service.availableRoles().map(r => r.code)).toEqual([]);
    });

    it('triggers warehouse_supervisor via permission view_wh_doc_approvals', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_wh_doc_approvals']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['warehouse_supervisor']);
    });

    it('triggers docs_specialist via user role docs_specialist', () => {
      mockAuth.user.set({ roles: ['docs_specialist'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['docs_specialist']);
    });

    it('triggers docs_specialist via permission view_wh_docs', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_wh_docs']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['docs_specialist']);
    });

    it('triggers docs_specialist via permission can_act_as_doc_worker', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'can_act_as_doc_worker']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['docs_specialist']);
    });

    it('triggers docs_specialist via permission perm_doc_approve_action', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_doc_approve_action']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['docs_specialist']);
    });

    it('triggers manager_review via user role manager_review', () => {
      mockAuth.user.set({ roles: ['manager_review'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager_review']);
    });

    it('triggers manager_review via permission can_act_as_wh_manager', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'can_act_as_wh_manager']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager_review']);
    });

    it('triggers manager_review via permission view_sys_manager_review', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'view_sys_manager_review']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager_review']);
    });

    it('triggers manager_review via permission perm_inventory_finalize', () => {
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS, 'perm_inventory_finalize']);
      expect(service.availableRoles().map(r => r.code)).toEqual(['manager_review']);
    });

    it('triggers all warehouse roles together in exact order', () => {
      mockAuth.user.set({
        roles: ['counter', 'warehouse_supervisor', 'docs_specialist', 'manager_review'],
        allowed_apps: ACCESS_USER_ALLOWED_APPS,
      });
      mockAuth.userPermissions.set([
        ...ACCESS_USER_BASE_PERMS,
        'can_act_as_counter',
        'can_act_as_wh_supervisor',
        'can_act_as_doc_worker',
        'can_act_as_wh_manager',
      ]);
      expect(service.availableRoles().map(r => r.code)).toEqual([
        'counter',
        'warehouse_supervisor',
        'docs_specialist',
        'manager_review',
      ]);
    });
  });

  // =========================================================================
  // d) Non-superuser with no access to active app
  // =========================================================================
  describe('d) Non-superuser with no access to active app', () => {
    it('returns empty array when user lacks access to personnel', () => {
      mockAuth.user.set({ roles: ['operator'], allowed_apps: ['warehouse'] });
      mockAuth.userPermissions.set(['view_sys_dashboard']);
      service.activeApp.set('personnel');
      expect(service.availableRoles()).toEqual([]);
    });

    it('returns empty array when user lacks access to warehouse', () => {
      mockAuth.user.set({ roles: ['counter'], allowed_apps: ['accounting'] });
      mockAuth.userPermissions.set(['view_sys_personnel']);
      service.activeApp.set('warehouse');
      expect(service.availableRoles()).toEqual([]);
    });

    it('returns empty array for non-superuser on operations app', () => {
      mockAuth.user.set({ roles: ['ops_commander'], allowed_apps: ['operations'] });
      mockAuth.userPermissions.set([...ACCESS_USER_BASE_PERMS]);
      service.activeApp.set('operations');
      expect(service.availableRoles()).toEqual([]);
    });
  });

  // =========================================================================
  // e) isActionProhibited for every key of today's SoD map
  // =========================================================================
  describe('e) isActionProhibited for every key of SoD map', () => {
    const SOD_CASES = [
      {
        app: 'warehouse',
        role: 'counter',
        route: '/app/warehouse/manager-review',
        actions: ['finalize_inventory_count'],
      },
      {
        app: 'warehouse',
        role: 'counter',
        route: '/app/warehouse/customs',
        actions: ['view_customs_and_costs'],
      },
    ];

    for (const sc of SOD_CASES) {
      it(`evaluates ${sc.app}:${sc.role} on ${sc.route}`, () => {
        service.activeApp.set(sc.app);
        service.activeRole.set(sc.role);
        mockAuth.user.set({ is_superuser: false, roles: [sc.role], allowed_apps: ACCESS_USER_ALLOWED_APPS });

        for (const action of sc.actions) {
          expect(service.isActionProhibited(sc.route, action)).toBe(true);
          expect(service.canPerform(sc.route, action)).toBe(false);
        }

        expect(service.isActionProhibited(sc.route, 'arbitrary_unlisted_action')).toBe(false);
        expect(service.canPerform(sc.route, 'arbitrary_unlisted_action')).toBe(true);

        mockAuth.user.set({ is_superuser: true, roles: ['superuser'], allowed_apps: ACCESS_USER_ALLOWED_APPS });
        for (const action of sc.actions) {
          expect(service.isActionProhibited(sc.route, action)).toBe(false);
          expect(service.canPerform(sc.route, action)).toBe(true);
        }
      });
    }
  });

  // =========================================================================
  // f) canAccessRoute isolation across 14 routes for 7 roles
  // =========================================================================
  describe('f) canAccessRoute role route isolation', () => {
    const EVAL_ROUTES = [
      '/app/finance/employee-attendance',
      '/app/finance/supervisor-fleet',
      '/app/finance/accountant-payroll',
      '/app/finance/manager-dashboard',
      '/app/finance/treasurer-cheques',
      '/app/finance/finance-cartable',
      '/app/finance/treasury-cartable',
      '/app/finance/manager-approvals',
      '/app/finance/attendance',
      '/app/finance/fleet',
      '/app/finance/projects-and-sections',
      '/app/finance/health',
      '/app/warehouse/dashboard',
    ];

    it('evaluates accountant route access table', () => {
      service.activeRole.set('accountant');
      const expected = [
        false, // employee-attendance (/employee-)
        false, // supervisor-fleet (/supervisor-)
        true,  // accountant-payroll
        false, // manager-dashboard (/manager-)
        false, // treasurer-cheques (/treasurer-)
        true,  // finance-cartable
        false, // treasury-cartable
        false, // manager-approvals
        false, // /attendance
        false, // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates operator route access table', () => {
      service.activeRole.set('operator');
      const expected = [
        true,  // employee-attendance
        false, // supervisor-fleet (/supervisor-)
        false, // accountant-payroll (/accountant-)
        false, // manager-dashboard (/manager-)
        false, // treasurer-cheques (/treasurer-)
        false, // finance-cartable
        false, // treasury-cartable
        false, // manager-approvals
        true,  // /attendance
        true,  // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates supervisor route access table', () => {
      service.activeRole.set('supervisor');
      const expected = [
        false, // employee-attendance (/employee-)
        true,  // supervisor-fleet
        false, // accountant-payroll (/accountant-)
        false, // manager-dashboard (/manager-)
        false, // treasurer-cheques (/treasurer-)
        false, // finance-cartable
        false, // treasury-cartable
        false, // manager-approvals (/manager-)
        true,  // /attendance
        true,  // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates manager route access table', () => {
      service.activeRole.set('manager');
      const expected = [
        false, // employee-attendance (/employee-)
        false, // supervisor-fleet (/supervisor-)
        false, // accountant-payroll (/accountant-)
        true,  // manager-dashboard
        false, // treasurer-cheques (/treasurer-)
        true,  // finance-cartable
        true,  // treasury-cartable
        true,  // manager-approvals
        true,  // /attendance
        true,  // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates treasury route access table', () => {
      service.activeRole.set('treasury');
      const expected = [
        false, // employee-attendance (/employee-)
        false, // supervisor-fleet (/supervisor-)
        false, // accountant-payroll (/accountant-)
        false, // manager-dashboard (/manager-)
        true,  // treasurer-cheques
        false, // finance-cartable
        true,  // treasury-cartable
        false, // manager-approvals
        true,  // /attendance
        true,  // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates org_admin route access table', () => {
      service.activeRole.set('org_admin');
      const expected = [
        false, // employee-attendance
        false, // supervisor-fleet
        false, // accountant-payroll
        false, // manager-dashboard
        false, // treasurer-cheques
        false, // finance-cartable
        false, // treasury-cartable
        false, // manager-approvals
        false, // /attendance
        false, // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });

    it('evaluates counter route access table', () => {
      service.activeRole.set('counter');
      const expected = [
        true,  // employee-attendance
        true,  // supervisor-fleet
        true,  // accountant-payroll
        true,  // manager-dashboard
        true,  // treasurer-cheques
        true,  // finance-cartable
        true,  // treasury-cartable
        true,  // manager-approvals
        true,  // /attendance
        true,  // /fleet
        true,  // projects-and-sections
        true,  // health
        true,  // warehouse/dashboard
      ];
      expect(EVAL_ROUTES.map(r => service.canAccessRoute(r))).toEqual(expected);
    });
  });

  // =========================================================================
  // g) getDefaultRouteForRole
  // =========================================================================
  describe('g) getDefaultRouteForRole', () => {
    it('returns /app/operations/cockpit for ops_commander', () => {
      expect(service.getDefaultRouteForRole('ops_commander')).toBe('/app/operations/cockpit');
    });

    it('returns /app/finance/employee-attendance for operator', () => {
      expect(service.getDefaultRouteForRole('operator')).toBe('/app/finance/employee-attendance');
    });

    it('returns /app/finance/supervisor-attendance for supervisor', () => {
      expect(service.getDefaultRouteForRole('supervisor')).toBe('/app/finance/supervisor-attendance');
    });

    it('returns /app/finance/accountant-payroll for accountant', () => {
      expect(service.getDefaultRouteForRole('accountant')).toBe('/app/finance/accountant-payroll');
    });

    it('returns /app/finance/manager-dashboard for manager', () => {
      expect(service.getDefaultRouteForRole('manager')).toBe('/app/finance/manager-dashboard');
    });

    it('returns /app/finance/treasurer-disbursements for treasury', () => {
      expect(service.getDefaultRouteForRole('treasury')).toBe('/app/finance/treasurer-disbursements');
    });

    it('returns /app/finance/treasurer-disbursements for treasurer', () => {
      expect(service.getDefaultRouteForRole('treasurer')).toBe('/app/finance/treasurer-disbursements');
    });

    it('returns /app/finance/projects-and-sections for org_admin', () => {
      expect(service.getDefaultRouteForRole('org_admin')).toBe('/app/finance/projects-and-sections');
    });

    it('returns /app/warehouse/counter for counter', () => {
      expect(service.getDefaultRouteForRole('counter')).toBe('/app/warehouse/counter');
    });

    it('returns /app/warehouse/supervisor for warehouse_supervisor', () => {
      expect(service.getDefaultRouteForRole('warehouse_supervisor')).toBe('/app/warehouse/supervisor');
    });

    it('returns /app/warehouse/docs for docs_specialist', () => {
      expect(service.getDefaultRouteForRole('docs_specialist')).toBe('/app/warehouse/docs');
    });

    it('returns /app/warehouse/dashboard for manager_review', () => {
      expect(service.getDefaultRouteForRole('manager_review')).toBe('/app/warehouse/dashboard');
    });

    it('returns /app/finance/accountant-payroll for superuser when activeApp is personnel', () => {
      service.activeApp.set('personnel');
      expect(service.getDefaultRouteForRole('superuser')).toBe('/app/finance/accountant-payroll');
    });

    it('returns /app/warehouse/dashboard for unknown role when activeApp is warehouse', () => {
      service.activeApp.set('warehouse');
      expect(service.getDefaultRouteForRole('unknown_role')).toBe('/app/warehouse/dashboard');
    });

    it('returns /app/finance/accountant-payroll for unknown role when activeApp is personnel', () => {
      service.activeApp.set('personnel');
      expect(service.getDefaultRouteForRole('unknown_role')).toBe('/app/finance/accountant-payroll');
    });
  });
});
