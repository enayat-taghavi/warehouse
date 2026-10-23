// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';

import { HealthDashboardComponent } from './health-dashboard';
import { SystemHealthService } from '../../../../core/services/system-health.service';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('HealthDashboard DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<HealthDashboardComponent>;
  let component: HealthDashboardComponent;
  let mockRouter: any;
  let mockHealth: any;
  let mockPersona: any;
  let mockAuth: any;
  let mockRegistry: any;
  let whExtRef: any;
  let accExtRef: any;

  beforeAll(async () => {
    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; }
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
  });

  beforeEach(async () => {
    mockRouter = {
      events: of(),
      url: '/health'
    };

    mockHealth = {
      healthScore$: of(95),
      isDiagnosing$: of(false),
      networkPingMs$: of(12),
      serverHealth$: of({ components: {} }),
      clientStorage$: of({ recordsByScope: { warehouse: 40, finance: 15 } }),
      serviceWorker$: of({ active: true }),
      lastReport$: of(null),
      diagnosticReport$: of(null),
      lastStressReport$: of(null),
      runFullDiagnostic: vi.fn().mockResolvedValue({}),
      runConcurrencyStressTest: vi.fn().mockResolvedValue({})
    };

    let activeScopes: string[] = ['warehouse', 'accounting'];
    // پنل‌های healthDashboard دو ماژول، همان مقادیر module.ts هر ماژول (spec نمی‌تواند از modules/* ایمپورت کند)
    const whExt = {
      panelScopes: ['warehouse'],
      panel: {
        order: 10, scopeLabelFa: 'انبارداری و لجستیک', tone: 'blue', storageLabelFa: 'انبار',
        dbLabelEn: 'Warehouse IndexedDB', dbShortEn: 'Warehouse', overview: true,
        stressScenario: { value: 'warehouse', order: 20, optionLabelFa: 'فقط انبارداری (کسر اتمیک موجودی)', shortLabelFa: 'انبارداری', verdictLabelFa: 'تمامیت اتمیک موجودی انبار:', verdictValueFa: 'تایید شد (کسر دقیق بدون افت تراکنش)' }
      }
    };
    const accExt = {
      panelScopes: ['accounting'],
      panel: {
        order: 20, scopeLabelFa: 'امور مالی و حقوق', tone: 'purple', storageLabelFa: 'مالی',
        dbLabelEn: 'Finance & HR IndexedDB', dbShortEn: 'Finance',
        stressScenario: { value: 'treasury', order: 10, optionLabelFa: 'فقط خزانه‌داری (جلوگیری از پرداخت دوبل)', shortLabelFa: 'خزانه‌داری', verdictLabelFa: 'گارد خزانه‌داری (ممانعت از پرداخت دوبل):', verdictValueFa: 'تایید شد (۱ پرداخت نهایی)' }
      }
    };
    whExtRef = whExt;
    accExtRef = accExt;

    mockRegistry = {
      isModuleInstalled: vi.fn().mockImplementation((code: string) => activeScopes.includes(code)),
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'healthDashboard') {
          const list: any[] = [];
          if (activeScopes.includes('warehouse')) {
            list.push({ module: { code: 'warehouse' }, extension: whExt });
          }
          if (activeScopes.includes('accounting')) {
            list.push({ module: { code: 'accounting' }, extension: accExt });
          }
          return list;
        }
        return [];
      }),
      getAllModules: vi.fn().mockImplementation(() => [
        { code: 'warehouse', extensions: { healthDashboard: whExt } },
        { code: 'accounting', extensions: { healthDashboard: accExt } }
      ])
    };

    mockPersona = {
      moduleRegistry: mockRegistry,
      isSuperuser: vi.fn().mockReturnValue(true),
      activeApp: vi.fn().mockReturnValue('warehouse')
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ is_superuser: true })
    };

    await TestBed.configureTestingModule({
      imports: [HealthDashboardComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SystemHealthService, useValue: mockHealth },
        { provide: AppPersonaService, useValue: mockPersona },
        { provide: AuthService, useValue: mockAuth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HealthDashboardComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    try {
      localStorage.removeItem('wh_installed_modules');
    } catch {}
    TestBed.resetTestingModule();
  });

  it('در نصب کامل (هر دو ماژول)، وضعیت قلمرو و دیتابیس‌ها هر دو را نمایش می‌دهند', () => {
    mockRegistry.isModuleInstalled.mockReturnValue(true);
    fixture.detectChanges();

    expect(component.panels.map(p => p.scope)).toEqual(['warehouse', 'finance']);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('انبار: 40');
    expect(compiled.textContent).toContain('مالی: 15');
  });

  it('در حالت تک‌ماژول حسابداری (بدون انبار)، detectScope قلمرو مالی را انتخاب کرده و رکوردهای انبار نمایش داده نمی‌شوند (L20)', () => {
    mockRegistry.getExtensions.mockImplementation((point: string) => {
      if (point === 'healthDashboard') {
        return [{ module: { code: 'accounting' }, extension: accExtRef }];
      }
      return [];
    });
    component.detectScope();
    fixture.detectChanges();

    expect(component.panels.map(p => p.scope)).toEqual(['finance']);
    expect(component.appScope).toBe('finance');
    expect(component.selectedScenario).toBe('treasury');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Finance & HR IndexedDB');
    expect(compiled.textContent).not.toContain('انبار: 40');
    expect(compiled.textContent).toContain('مالی: 15');
  });

  it('در حالت تک‌ماژول انبارداری (بدون مالی)، detectScope قلمرو انبار را انتخاب کرده و گزینه‌های خزانه‌داری پنهان می‌مانند (L20)', () => {
    mockRegistry.getExtensions.mockImplementation((point: string) => {
      if (point === 'healthDashboard') {
        return [{ module: { code: 'warehouse' }, extension: whExtRef }];
      }
      return [];
    });
    component.detectScope();
    fixture.detectChanges();

    expect(component.panels.map(p => p.scope)).toEqual(['warehouse']);
    expect(component.appScope).toBe('warehouse');
    expect(component.selectedScenario).toBe('warehouse');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Warehouse IndexedDB');
    expect(compiled.textContent).toContain('انبار: 40');
    expect(compiled.textContent).not.toContain('مالی: 15');
  });

  it('در نصب کامل روی مسیر انبار، سناریوی پیش‌فرض همان «ترکیبی» می‌ماند (بند ۳-۱: نصب کامل بی‌تغییر)', () => {
    mockRouter.url = '/app/warehouse/health';
    component.detectScope();

    expect(component.appScope).toBe('warehouse');
    expect(component.selectedScenario).toBe('combined');
  });

  it('در نصب کامل متن‌ها همان دو قلمرو قبلی است (برچسب دیتابیس، رکوردها، سناریوها و نتیجه)', () => {
    mockRouter.url = '/app/warehouse/health';
    component.detectScope();
    expect(component.dbLabel).toBe('Warehouse & Finance DBs');
    expect(component.focusPanel?.scopeLabelFa).toBe('انبارداری و لجستیک');
    expect(component.stressOptions.map(o => o.label)).toEqual([
      'ترکیبی (خزانه‌داری + انبارداری)', 'فقط خزانه‌داری (جلوگیری از پرداخت دوبل)', 'فقط انبارداری (کسر اتمیک موجودی)'
    ]);
    expect(component.stressDescription).toContain('تراکنش موازی خزانه‌داری و انبارداری جهت');
    expect(component.stressVerdicts.map(v => v.label)).toEqual(['گارد خزانه‌داری (ممانعت از پرداخت دوبل):', 'تمامیت اتمیک موجودی انبار:']);

    mockRouter.url = '/app/finance/health';
    component.detectScope();
    expect(component.appScope).toBe('finance');
    expect(component.selectedScenario).toBe('treasury');
    expect(component.dbLabel).toBe('Finance & HR IndexedDB');
    expect(component.stressOptions.map(o => o.value)).toEqual(['treasury']);
  });

  it('قلمرو سوم بی‌تغییر پوسته در نمای کلی، رکوردها و سناریوها می‌آید', () => {
    const thirdExt = {
      panelScopes: ['showcase'],
      panel: {
        order: 30, scopeLabelFa: 'نمایشی', tone: 'blue', storageLabelFa: 'نمایشی', dbLabelEn: 'Showcase IndexedDB', dbShortEn: 'Showcase',
        stressScenario: { value: 'showcase', order: 30, optionLabelFa: 'فقط نمایشی', shortLabelFa: 'نمایشی', verdictLabelFa: 'نمایشی:', verdictValueFa: 'تایید شد' }
      }
    };
    mockRegistry.getExtensions.mockImplementation((point: string) => point === 'healthDashboard'
      ? [{ module: { code: 'warehouse' }, extension: whExtRef }, { module: { code: 'accounting' }, extension: accExtRef }, { module: { code: 'showcase' }, extension: thirdExt }]
      : []);
    mockRegistry.getAllModules.mockImplementation(() => [
      { code: 'warehouse', extensions: { healthDashboard: whExtRef } },
      { code: 'accounting', extensions: { healthDashboard: accExtRef } },
      { code: 'showcase', extensions: { healthDashboard: thirdExt } }
    ]);
    mockRouter.url = '/app/warehouse/health';
    component.storage = { recordsByScope: { warehouse: 1, finance: 2, showcase: 3 } } as any;
    component.detectScope();
    expect(component.panels.length).toBe(3);
    expect(component.dbLabel).toBe('Warehouse & Finance & Showcase DBs');
    expect(component.storageSummary).toBe('انبار: 1 | مالی: 2 | نمایشی: 3');
    expect(component.stressOptions[0].label).toBe('ترکیبی (خزانه‌داری + انبارداری + نمایشی)');
  });
});
