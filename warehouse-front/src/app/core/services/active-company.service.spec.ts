// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { ActiveCompanyService } from './active-company.service';
import { SessionTabService } from './session-tab.service';
import { ModuleRegistryService } from '../modules/module-registry.service';
import { Company } from '../models/company.model';

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

describe('ActiveCompanyService (Tab Isolation & Multi-Tenant State)', () => {
  let service: ActiveCompanyService;
  let mockHttpClient: any;
  let mockSessionTab: any;
  let mockSessionStorage: any;
  let mockLocalStorage: any;
  let tabMessageCallback: ((msg: any) => void) | null = null;

  const mockCompanyA: Company = {
    id: 1,
    name: 'شرکت آلفا',
    code: 'ALPHA',
    has_warehouse_module: true,
  } as Company;

  const mockCompanyB: Company = {
    id: 2,
    name: 'شرکت بتا',
    code: 'BETA',
    has_warehouse_module: true,
  } as Company;

  beforeEach(() => {
    mockSessionStorage = createStorageMock();
    mockLocalStorage = createStorageMock();

    Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage, writable: true, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
    (global as any).sessionStorage = mockSessionStorage;
    (global as any).localStorage = mockLocalStorage;

    mockHttpClient = {
      get: vi.fn().mockReturnValue(of({ companies: [mockCompanyA, mockCompanyB], is_superuser: false, count: 2 })),
      post: vi.fn().mockReturnValue(of({})),
    };

    mockSessionTab = {
      tabId: 'tab_test_123',
      onMessage: vi.fn().mockImplementation((cb) => {
        tabMessageCallback = cb;
        return () => {};
      }),
      broadcastMessage: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ActiveCompanyService,
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: SessionTabService, useValue: mockSessionTab },
      ],
    });

    service = TestBed.inject(ActiveCompanyService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    try {
      localStorage.removeItem('wh_installed_modules');
    } catch {}
  });

  it('۱. باید در حالت اولیه بدون شرکت ذخیره‌شده، مقدار null باشد', () => {
    expect(service.activeCompany).toBeNull();
    expect(service.activeCompanyId).toBeNull();
  });

  it('۲. باید با متد selectCompany شرکت در هر دو حافظه ذخیره و رویداد پنجره شلیک شود', () => {
    const eventSpy = vi.fn();
    window.addEventListener('company_context_changed', eventSpy);

    service.selectCompany(mockCompanyA);

    expect(service.activeCompany?.id).toBe(1);
    expect(service.activeCompanyId).toBe(1);
    expect(mockSessionStorage.getItem('active_company_id')).toBe('1');
    expect(mockLocalStorage.getItem('active_company_id')).toBe('1');
    expect(eventSpy).toHaveBeenCalled();

    window.removeEventListener('company_context_changed', eventSpy);
  });

  it('۳. باید در هنگام مقداردهی تب جدید، از localStorage خوانده و بلافاصله در sessionStorage قفل شود (ایزولاسیون تب)', () => {
    mockSessionStorage.clear();
    mockLocalStorage.setItem('active_company_data', JSON.stringify(mockCompanyB));
    mockLocalStorage.setItem('active_company_id', '2');

    // ایجاد یک نمونه جدید از سرویس برای شبیه‌سازی لود تب جدید
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ActiveCompanyService,
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: SessionTabService, useValue: mockSessionTab },
      ],
    });
    const newTabService = TestBed.inject(ActiveCompanyService);

    expect(newTabService.activeCompany?.id).toBe(2);
    // اطمینان از اینکه در سشن همین تب قفل شده است
    expect(mockSessionStorage.getItem('active_company_id')).toBe('2');
  });

  it('۴. باید اولویت مطلق با sessionStorage باشد حتی اگر localStorage مقدار دیگری داشته باشد (جلوگیری از State Desync)', () => {
    // تب اول شرکت آلفا را در سشن خود دارد
    mockSessionStorage.setItem('active_company_id', '1');
    mockSessionStorage.setItem('active_company_data', JSON.stringify(mockCompanyA));

    // تب دوم در این فاصله در localStorage شرکت بتا را ذخیره کرده است
    mockLocalStorage.setItem('active_company_id', '2');
    mockLocalStorage.setItem('active_company_data', JSON.stringify(mockCompanyB));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ActiveCompanyService,
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: SessionTabService, useValue: mockSessionTab },
      ],
    });
    const isolatedTabService = TestBed.inject(ActiveCompanyService);

    // سرویس باید همچنان شرکت آلفا (سشن اختصاصی تب) را حفظ کند
    expect(isolatedTabService.activeCompany?.id).toBe(1);
    expect(isolatedTabService.activeCompany?.code).toBe('ALPHA');
  });

  it('۵. باید در صورت دریافت سیگنال AUTH_LOGOUT از کانال چندتبی، وضعیت شرکت به طور خودکار پاکسازی شود', () => {
    service.selectCompany(mockCompanyA);
    expect(service.activeCompany).not.toBeNull();

    // شبیه‌سازی رویداد خروج در تب دیگر
    if (tabMessageCallback) {
      tabMessageCallback({ type: 'AUTH_LOGOUT', sourceTabId: 'other_tab', timestamp: Date.now() });
    }

    expect(service.activeCompany).toBeNull();
    expect(mockSessionStorage.getItem('active_company_id')).toBeNull();
    expect(mockLocalStorage.getItem('active_company_id')).toBeNull();
  });

  it('۶. باید متد clearActiveCompany تمامی کلیدهای ذخیره‌سازی را در هر دو حافظه پاک کند', () => {
    service.selectCompany(mockCompanyA);
    service.clearActiveCompany();

    expect(service.activeCompany).toBeNull();
    expect(mockSessionStorage.getItem('active_company_id')).toBeNull();
    expect(mockSessionStorage.getItem('active_company_data')).toBeNull();
    expect(mockLocalStorage.getItem('active_company_id')).toBeNull();
    expect(mockLocalStorage.getItem('active_company_data')).toBeNull();
  });

  it('۷. باید با متد selectCompany کوئری‌پارامتر ?cid=... در URL مرورگر همگام شود و در صورت وجود cid در لود، شرکت متناظر انتخاب شود', () => {
    service.selectCompany(mockCompanyB);
    const url = new URL(window.location.href);
    expect(url.searchParams.get('cid')).toBe('2');

    // لود شرکت‌ها با اولویت کوئری‌پارامتر
    service.loadAvailableCompanies().subscribe(res => {
      expect(service.activeCompanyId).toBe(2);
    });
  });

  it('۸. ایزولاسیون تک‌ماژول: در صورت عدم نصب ماژول انبارداری، hasWarehouseModuleSignal و hasWarehouseModule$ باید false باشند حتی اگر شرکت has_warehouse_module=true داشته باشد', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);

    service.selectCompany(mockCompanyA);
    expect(mockCompanyA.has_warehouse_module).toBe(true);
    expect(service.hasWarehouseModuleSignal()).toBe(false);
    expect(service.hasWarehouseModule).toBe(false);

    let obsVal: boolean | null = null;
    const sub = service.hasWarehouseModule$.subscribe(val => { obsVal = val; });
    expect(obsVal).toBe(false);
    sub.unsubscribe();
  });

  it('۹. در صورت نصب ماژول انبارداری، hasWarehouseModuleSignal باید مقدار شرکت را منعکس کند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse', 'accounting']);

    service.selectCompany(mockCompanyA);
    expect(service.hasWarehouseModuleSignal()).toBe(true);

    const mockCompanyWithoutWh = { ...mockCompanyA, id: 99, has_warehouse_module: false } as Company;
    service.selectCompany(mockCompanyWithoutWh);
    expect(service.hasWarehouseModuleSignal()).toBe(false);
  });
});
