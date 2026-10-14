// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { AppLauncherComponent } from './app-launcher';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ConfigApiService } from '../../../../core/api/config-api.service';
import { Router } from '@angular/router';

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

describe('AppLauncherComponent DOM & Modular Layout Tests', () => {
  let component: AppLauncherComponent;
  let registry: ModuleRegistryService;

  let mockAuth: any;
  let mockPersona: any;
  let mockConfigApi: any;
  let mockRouter: any;
  let mockStore: any;
  let injector: Injector;

  beforeEach(() => {
    mockAuth = {
      userName: () => 'کاربر آزمون',
      user: () => ({ username: 'admin', allowed_apps: ['warehouse', 'accounting', 'personnel', 'finance'] }),
      userRoleTitles: () => ['مدیر سیستم'],
      logout: vi.fn()
    };

    mockPersona = {
      isSuperuser: () => false,
      canAccessApp: vi.fn().mockReturnValue(true),
      hasWarehouseAccess: () => true,
      hasPersonnelAccess: () => true,
      hasOperationsAccess: () => false,
      switchApp: vi.fn()
    };

    mockConfigApi = {
      getPublicConfig: () => of({ installed_modules: ['warehouse', 'accounting'] })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockStore = {
      setWarehouseContext: vi.fn()
    };

    registry = new ModuleRegistryService();

    injector = Injector.create({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: ConfigApiService, useValue: mockConfigApi },
        { provide: Router, useValue: mockRouter },
        { provide: AuthStore, useValue: mockStore },
        { provide: ModuleRegistryService, useValue: registry }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new AppLauncherComponent();
    });
  });

  afterEach(() => {
    try {
      localStorage.removeItem('wh_installed_modules');
    } catch {}
    vi.restoreAllMocks();
  });

  it('حالت ۱: هر دو ماژول انبار و مالی فعال — نمایش هر دو کارت و ساختار دو ستونی', () => {
    registry.setInstalledModules(['warehouse', 'accounting']);

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isFinanceInstalled).toBe(true);
    expect(component.isSingleAppMode).toBe(false);
    expect(component.visibleCardsCount).toBe(2);
    expect(component.gridContainerClass).toContain('md:grid-cols-2');

    const cards = component.appCards();
    expect(cards.some(c => c.code === 'warehouse')).toBe(true);
    expect(cards.some(c => c.code === 'personnel')).toBe(true);
    expect(cards.find(c => c.code === 'warehouse')?.title).toBe('سامانه انبارداری و ره‌گیری کالا');
    expect(cards.find(c => c.code === 'personnel')?.title).toBe('سامانه مالی، حقوق و کارکرد');
  });

  it('حالت ۲: فقط ماژول انبار فعال — نمایش حالت تک‌ماژول و عدم نمایش مالی', () => {
    registry.setInstalledModules(['warehouse']);

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isFinanceInstalled).toBe(false);
    expect(component.isSingleAppMode).toBe(true);
    expect(component.visibleCardsCount).toBe(1);
    expect(component.gridContainerClass).toBe('max-w-xl mx-auto');

    const cards = component.appCards();
    expect(cards.some(c => c.code === 'warehouse')).toBe(true);
    expect(cards.some(c => c.code === 'personnel')).toBe(false);
  });

  it('حالت ۳: فقط ماژول مالی فعال — نمایش کارت مالی و پنهان شدن کارت انبار', () => {
    registry.setInstalledModules(['accounting']);

    expect(component.isWarehouseInstalled).toBe(false);
    expect(component.isFinanceInstalled).toBe(true);
    expect(component.isSingleAppMode).toBe(true);
    expect(component.visibleCardsCount).toBe(1);
    expect(component.gridContainerClass).toBe('max-w-xl mx-auto');

    const cards = component.appCards();
    expect(cards.some(c => c.code === 'warehouse')).toBe(false);
    expect(cards.some(c => c.code === 'personnel')).toBe(true);
  });

  it('سوپریوزر با allowed_apps بدون operations — کارت عملیات شمرده می‌شود (سه ستون در نسخهٔ کامل)', () => {
    mockAuth.user = () => ({ username: 'root', allowed_apps: ['warehouse', 'finance'] });
    mockPersona.isSuperuser = () => true;
    mockPersona.hasOperationsAccess = () => true;
    registry.setInstalledModules(['warehouse', 'accounting']);

    expect(component.appCards().some(c => c.code === 'operations')).toBe(true);
    expect(component.visibleCardsCount).toBe(3);
    expect(component.gridContainerClass).toContain('lg:grid-cols-3');
  });

  it('سوپریوزر در نسخهٔ تک‌ماژول — دو کارت (ماژول و عملیات) و نه حالت تک‌ماژول', () => {
    mockAuth.user = () => ({ username: 'root', allowed_apps: ['warehouse'] });
    mockPersona.isSuperuser = () => true;
    mockPersona.hasOperationsAccess = () => true;
    registry.setInstalledModules(['warehouse']);

    expect(component.visibleCardsCount).toBe(2);
    expect(component.isSingleAppMode).toBe(false);
  });

  it('ورود به برنامه سوئیچ به persona مناسب و خروج از بافت انبار انجام می‌دهد', () => {
    registry.setInstalledModules(['warehouse', 'accounting']);
    component.enterApp('warehouse');
    expect(mockStore.setWarehouseContext).toHaveBeenCalledWith(false);
    expect(mockPersona.switchApp).toHaveBeenCalledWith('warehouse');
  });

  it('ماژول ساختگی سوم sample — کاشی ماژول sample رندر می‌شود و تعداد کاشی‌ها با visibleCardsCount برابر است', () => {
    mockAuth.user = () => ({ username: 'admin', allowed_apps: ['warehouse', 'accounting', 'sample'] });
    const SAMPLE_MODULE: any = {
      code: 'sample',
      titleFa: 'ماژول نمونه',
      titleShortFa: 'نمونه',
      descriptionFa: 'ماژول نمونه جهت آزمون توسعه‌پذیری',
      icon: 'box',
      routePrefix: '/app/sample',
      defaultRoute: '/app/sample/overview',
      scopeKind: 'operations',
      permissionMarkers: ['view_sample'],
      roles: ['sample_user'],
      extensions: {
        launcherTile: {
          themeColor: 'amber',
          tags: ['نمونه', 'آزمایشی'],
          appKey: 'sample'
        }
      }
    };
    registry.registerModule(SAMPLE_MODULE);
    registry.setInstalledModules(['warehouse', 'accounting', 'sample']);

    const extras = component.extraCards();
    expect(extras.length).toBe(1);
    expect(extras[0].code).toBe('sample');
    expect(extras[0].title).toBe('ماژول نمونه');
    expect(extras[0].routePrefix).toBe('/app/sample');
    expect(extras[0].themeColor).toBe('amber');

    // ۲ کاشی غنی (انبار و مالی) + ۱ کاشی عمومی ماژول نمونه = ۳
    expect(component.visibleCardsCount).toBe(3);
    expect(component.isSingleAppMode).toBe(false);

    component.enterApp('sample');
    expect(mockPersona.switchApp).toHaveBeenCalledWith('sample');
  });
});

