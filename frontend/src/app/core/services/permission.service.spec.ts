// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { computed, signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { PermissionService, PERMISSION_STORAGE_KEYS } from './permission.service';
import { AuthService } from '../auth/auth.service';
import { PermissionApiService } from '../api/permission-api.service';
import { OrgStructureApiService } from '../api/org-structure-api.service';
import { WebSocketService } from '../http/websocket.service';
import { PermissionCatalog, PermissionMap } from '../models/permission.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

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

const UID = 7;

function makeMap(partial: Partial<PermissionMap> = {}): PermissionMap {
  return { is_superuser: false, system: [], company: {}, project: {}, section: {}, all: [], version: 'v1', ...partial };
}

const CATALOG: PermissionCatalog = {
  categories: [
    { module: 'mod_a', key: 'cat_inv', label_fa: 'الف', order: 10, menu: 'menu-inv' },
    { module: 'mod_a', key: 'cat_pay', label_fa: 'ب', order: 20, menu: 'menu-pay' },
  ],
  permissions: [
    { code: 'p_inv', label_fa: 'ثبت', module: 'mod_a', category: 'cat_inv', scope: 'section', sensitive: false },
    { code: 'p_pay', label_fa: 'پرداخت', module: 'mod_a', category: 'cat_pay', scope: 'section', sensitive: false },
    { code: 'sys_x', label_fa: 'سامانه', module: null, category: null, scope: 'system', sensitive: false },
  ],
  roles: [],
  bundles: {},
};

describe('PermissionService', () => {
  let service: PermissionService;
  let user: ReturnType<typeof signal<any>>;
  let fakeAuth: any;
  let api: { getMyPermissions: ReturnType<typeof vi.fn>; getCatalog: ReturnType<typeof vi.fn> };
  let orgApi: { getMySections: ReturnType<typeof vi.fn> };
  let notifications$: Subject<any>;
  let mockLocal: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    mockLocal = createStorageMock();
    vi.stubGlobal('localStorage', mockLocal);
    user = signal<any>(null);
    fakeAuth = {
      user,
      userPermissions: computed(() => user()?.permissions ?? []),
      isSuperuser: computed(() => user()?.is_superuser === true),
      updateUser: vi.fn((p: any) => user.set({ ...user(), ...p })),
    };
    api = {
      getMyPermissions: vi.fn(() => throwError(() => ({ status: 0 }))),
      getCatalog: vi.fn(() => throwError(() => ({ status: 403 }))),
    };
    orgApi = { getMySections: vi.fn(() => of([])) };
    notifications$ = new Subject<any>();

    TestBed.configureTestingModule({
      providers: [
        PermissionService,
        { provide: AuthService, useValue: fakeAuth },
        { provide: PermissionApiService, useValue: api },
        { provide: OrgStructureApiService, useValue: orgApi },
        { provide: WebSocketService, useValue: { notifications$ } },
      ],
    });
    service = TestBed.inject(PermissionService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function login(map: PermissionMap | undefined, extra: any = {}) {
    user.set({ id: UID, permissions: map?.all ?? [], permission_map: map, ...extra });
    service.syncFromAuth(user());
  }

  describe('can(): pure union per level', () => {
    beforeEach(() => {
      login(makeMap({
        system: ['sys_x'],
        company: { '3': ['p_comp'] },
        project: { '9': ['p_proj'] },
        section: { '12': ['p_sec'] },
        all: ['p_comp', 'p_proj', 'p_sec', 'sys_x'],
      }));
      mockLocal.setItem(PERMISSION_STORAGE_KEYS.sections(UID), JSON.stringify({}));
      (service as any)._sections.set({
        '12': { project_id: 9, company_id: 3 },
        '13': { project_id: 9, company_id: 3 },
        '20': { project_id: 10, company_id: 3 },
        '30': { project_id: 11, company_id: 4 },
      });
    });

    it('without section: holds it in at least one section', () => {
      expect(service.can('p_sec')).toBe(true);
      expect(service.can('p_comp')).toBe(true);
      expect(service.can('nope')).toBe(false);
    });

    it('section level applies only to that section', () => {
      expect(service.can('p_sec', 12)).toBe(true);
      expect(service.can('p_sec', 13)).toBe(false);
    });

    it('project level covers every section of the project', () => {
      expect(service.can('p_proj', 12)).toBe(true);
      expect(service.can('p_proj', 13)).toBe(true);
      expect(service.can('p_proj', 20)).toBe(false);
    });

    it('company level covers every section of the company', () => {
      expect(service.can('p_comp', 20)).toBe(true);
      expect(service.can('p_comp', 30)).toBe(false);
    });

    it('system permission ignores the section', () => {
      expect(service.can('sys_x', 30)).toBe(true);
      expect(service.can('sys_x', 999)).toBe(true);
    });

    it('unknown section only matches system permissions', () => {
      expect(service.can('p_comp', 999)).toBe(false);
    });

    it('canAny and sectionsWith', () => {
      expect(service.canAny(['nope', 'p_proj'], 13)).toBe(true);
      expect(service.canAny(['nope'], 13)).toBe(false);
      expect(service.sectionsWith('p_comp').sort()).toEqual([12, 13, 20]);
    });
  });

  it('superuser: everything is true', () => {
    login(makeMap({ is_superuser: true, system: ['a'], all: ['a'] }), { is_superuser: true });
    expect(service.can('anything', 5)).toBe(true);
    expect(service.can('anything')).toBe(true);
  });

  it('no map yet: falls back to the login permissions list', () => {
    login(undefined, { permissions: ['legacy_code'] });
    expect(service.map()).toBeNull();
    expect(service.can('legacy_code')).toBe(true);
    expect(service.can('other')).toBe(false);
  });

  describe('offline persistence', () => {
    it('login map is stored per user', () => {
      const m = makeMap({ all: ['a'], system: ['a'], version: 'v9' });
      login(m);
      expect(JSON.parse(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))!).version).toBe('v9');
    });

    it('stored map is used when the profile has none and the fetch fails; never cleared', async () => {
      mockLocal.setItem(PERMISSION_STORAGE_KEYS.map(UID), JSON.stringify(makeMap({ all: ['stored'], system: ['stored'], version: 's1' })));
      login(undefined);
      expect(service.can('stored')).toBe(true);
      api.getMyPermissions.mockReturnValue(throwError(() => ({ status: 530 })));
      const changed = await service.refresh();
      expect(changed).toBe(false);
      expect(service.isStale()).toBe(true);
      expect(service.version()).toBe('s1');
      expect(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))).not.toBeNull();
    });

    it('a 4xx answer does not clear the stored map either', async () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      api.getMyPermissions.mockReturnValue(throwError(() => ({ status: 403 })));
      await service.refresh();
      expect(service.version()).toBe('v1');
      expect(service.isStale()).toBe(false);
      expect(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))).not.toBeNull();
    });

    it('logout keeps the stored map; the next login of the same user starts from it', () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      user.set(null);
      service.syncFromAuth(null);
      expect(service.map()).toBeNull();
      expect(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))).not.toBeNull();
      user.set({ id: UID, permissions: [] });
      service.syncFromAuth(user());
      expect(service.version()).toBe('v1');
    });

    it('maps are kept per user', () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'u7' }));
      user.set({ id: 8, permissions: [] });
      service.syncFromAuth(user());
      expect(service.map()).toBeNull();
      expect(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))).not.toBeNull();
    });
  });

  describe('version-based replace', () => {
    it('replaces only on a new version and syncs AuthService permissions', async () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      api.getMyPermissions.mockReturnValue(of(makeMap({ all: ['a'], system: ['a'], version: 'v1' })));
      expect(await service.refresh()).toBe(false);
      expect(fakeAuth.updateUser).not.toHaveBeenCalled();

      const fresh = makeMap({ all: ['a', 'b'], system: ['a', 'b'], version: 'v2' });
      api.getMyPermissions.mockReturnValue(of(fresh));
      expect(await service.refresh()).toBe(true);
      expect(service.version()).toBe('v2');
      expect(fakeAuth.updateUser).toHaveBeenCalledWith({ permissions: ['a', 'b'], permission_map: fresh });
      expect(fakeAuth.userPermissions()).toEqual(['a', 'b']);
      expect(JSON.parse(mockLocal.getItem(PERMISSION_STORAGE_KEYS.map(UID))!).version).toBe('v2');
    });

    it('superuser refresh keeps the admin_all marker for AuthService', async () => {
      login(makeMap({ is_superuser: true, all: ['a'], system: ['a'], version: 'v1' }), { is_superuser: true });
      api.getMyPermissions.mockReturnValue(of(makeMap({ is_superuser: true, all: ['a', 'b'], system: ['a', 'b'], version: 'v2' })));
      await service.refresh();
      expect(fakeAuth.userPermissions()).toContain('admin_all');
    });

    it('invalid payload is ignored', async () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      api.getMyPermissions.mockReturnValue(of({ detail: 'x' }));
      await service.refresh();
      expect(service.version()).toBe('v1');
    });

    it('fetches section links when company/project level entries exist and stores them', async () => {
      login(makeMap({ company: { '3': ['p'] }, all: ['p'], version: 'v1' }));
      orgApi.getMySections.mockReturnValue(of([{ id: 12, project: 9, project_id: 9, company_id: 3, code: 's', name: 's', is_active: true }]));
      api.getMyPermissions.mockReturnValue(of(makeMap({ company: { '3': ['p'] }, all: ['p'], version: 'v2' })));
      await service.refresh();
      expect(service.can('p', 12)).toBe(true);
      expect(JSON.parse(mockLocal.getItem(PERMISSION_STORAGE_KEYS.sections(UID))!)['12']).toEqual({ project_id: 9, company_id: 3 });
    });
  });

  describe('websocket', () => {
    it('own permissions_updated → refetch; others only notify', async () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      api.getMyPermissions.mockReturnValue(of(makeMap({ all: ['a', 'z'], system: ['a', 'z'], version: 'v2' })));
      service.start();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      api.getMyPermissions.mockClear();

      const events: any[] = [];
      service.permissionsChanged$.subscribe((e) => events.push(e));

      notifications$.next({ type: 'permissions_updated', user_id: 99, company_id: 3, reason: 'override' });
      expect(api.getMyPermissions).not.toHaveBeenCalled();
      expect(events[0]).toEqual({ user_id: 99, reason: 'override', company_id: 3, own: false });

      notifications$.next({ type_str: 'permissions_updated', user_id: UID, reason: 'role' });
      expect(api.getMyPermissions).toHaveBeenCalledTimes(1);
      expect(events[1].own).toBe(true);

      notifications$.next({ type: 'org_structure_updated', user_id: UID });
      expect(events.length).toBe(2);
    });

    it('users_changed → usersChanged$ only, no permission refetch', async () => {
      login(makeMap({ all: ['a'], system: ['a'], version: 'v1' }));
      service.start();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      api.getMyPermissions.mockClear();
      const users: any[] = [];
      const perms: any[] = [];
      service.usersChanged$.subscribe((e) => users.push(e));
      service.permissionsChanged$.subscribe((e) => perms.push(e));

      notifications$.next({ type_str: 'users_changed', user_id: 42, company_id: 3, reason: 'user' });
      expect(users).toEqual([{ user_id: 42, reason: 'user', company_id: 3, own: false }]);
      expect(perms.length).toBe(0);
      expect(api.getMyPermissions).not.toHaveBeenCalled();
    });
  });

  describe('categories and menus (ت۵)', () => {
    beforeEach(async () => {
      login(makeMap({ section: { '12': ['p_inv'] }, all: ['p_inv'], version: 'v1' }));
      api.getCatalog.mockReturnValue(of(CATALOG));
      await service.ensureCatalog(true);
    });

    it('hasInCategory: at least one permission of the category', () => {
      expect(service.categoryCodes('mod_a', 'cat_inv')).toEqual(['p_inv']);
      expect(service.hasInCategory('mod_a', 'cat_inv')).toBe(true);
      expect(service.hasInCategory('mod_a', 'cat_pay')).toBe(false);
      expect(service.hasInCategory('other', 'cat_inv')).toBe(false);
    });

    it('menuUnlocked by backend menu key and module', () => {
      expect(service.menuUnlocked('mod_a', 'menu-inv')).toBe(true);
      expect(service.menuUnlocked('mod_a', 'menu-pay')).toBe(false);
      expect(service.menuUnlocked('mod_b', 'menu-inv')).toBe(false);
      expect(service.menuUnlocked('mod_a', 'unknown')).toBe(false);
    });

    it('catalog is stored per user and reused offline', () => {
      expect(JSON.parse(mockLocal.getItem(PERMISSION_STORAGE_KEYS.catalog(UID))!).categories.length).toBe(2);
      user.set(null);
      service.syncFromAuth(null);
      user.set({ id: UID, permissions: ['p_inv'] });
      service.syncFromAuth(user());
      expect(service.menuUnlocked('mod_a', 'menu-inv')).toBe(true);
      expect(service.spec('p_pay')?.label_fa).toBe('پرداخت');
    });

    it('403 on the catalog stops retries and keeps nothing broken', async () => {
      user.set({ id: 8, permissions: [] });
      service.syncFromAuth(user());
      api.getCatalog.mockClear();
      api.getCatalog.mockReturnValue(throwError(() => ({ status: 403 })));
      await service.ensureCatalog();
      await service.ensureCatalog();
      expect(api.getCatalog).toHaveBeenCalledTimes(1);
      expect(service.menuUnlocked('mod_a', 'menu-inv')).toBe(false);
    });
  });

  it('effect follows AuthService user changes', () => {
    user.set({ id: UID, permissions: ['a'], permission_map: makeMap({ all: ['a'], system: ['a'], version: 'e1' }) });
    TestBed.tick();
    expect(service.version()).toBe('e1');
  });
});
