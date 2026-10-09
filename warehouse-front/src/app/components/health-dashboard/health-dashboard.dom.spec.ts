// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';

import { HealthDashboardComponent } from './health-dashboard';
import { SystemHealthService } from '../../core/services/system-health.service';
import { AppPersonaService } from '../../core/services/app-persona.service';
import { AuthService } from '../../core/auth/auth.service';
import { ModuleRegistryService } from '../../core/modules/module-registry.service';

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
      clientStorage$: of({ warehouseRecords: 40, financeRecords: 15 }),
      serviceWorker$: of({ active: true }),
      lastReport$: of(null),
      diagnosticReport$: of(null),
      lastStressReport$: of(null),
      runFullDiagnostic: vi.fn().mockResolvedValue({}),
      runConcurrencyStressTest: vi.fn().mockResolvedValue({})
    };

    mockRegistry = {
      isModuleInstalled: vi.fn().mockReturnValue(true)
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

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('انبار: 40');
    expect(compiled.textContent).toContain('مالی: 15');
  });

  it('در حالت تک‌ماژول حسابداری (بدون انبار)، detectScope قلمرو مالی را انتخاب کرده و رکوردهای انبار نمایش داده نمی‌شوند (L20)', () => {
    mockRegistry.isModuleInstalled.mockImplementation((code: string) => code === 'accounting');
    component.detectScope();
    fixture.detectChanges();

    expect(component.isWarehouseInstalled).toBe(false);
    expect(component.isAccountingInstalled).toBe(true);
    expect(component.appScope).toBe('finance');
    expect(component.selectedScenario).toBe('treasury');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Finance & HR IndexedDB');
    expect(compiled.textContent).not.toContain('انبار: 40');
    expect(compiled.textContent).toContain('مالی: 15');
  });

  it('در حالت تک‌ماژول انبارداری (بدون مالی)، detectScope قلمرو انبار را انتخاب کرده و گزینه‌های خزانه‌داری پنهان می‌مانند (L20)', () => {
    mockRegistry.isModuleInstalled.mockImplementation((code: string) => code === 'warehouse');
    component.detectScope();
    fixture.detectChanges();

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(false);
    expect(component.appScope).toBe('warehouse');
    expect(component.selectedScenario).toBe('warehouse');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Warehouse IndexedDB');
    expect(compiled.textContent).toContain('انبار: 40');
    expect(compiled.textContent).not.toContain('مالی: 15');
  });

  it('در نصب کامل روی مسیر انبار، سناریوی پیش‌فرض همان «ترکیبی» می‌ماند (بند ۳-۱: نصب کامل بی‌تغییر)', () => {
    mockRouter.url = '/app/warehouse/health';
    mockRegistry.isModuleInstalled.mockReturnValue(true);
    component.detectScope();

    expect(component.appScope).toBe('warehouse');
    expect(component.selectedScenario).toBe('combined');
  });
});
