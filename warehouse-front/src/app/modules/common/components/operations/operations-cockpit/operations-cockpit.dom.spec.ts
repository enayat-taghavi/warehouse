// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { OperationsCockpitComponent } from './operations-cockpit';
import { SystemHealthService } from '../../../../../core/services/system-health.service';
import { SettingsService } from '../../../../../services/settings';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';

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

describe('OperationsCockpitComponent DOM & Modular Profiles Tests', () => {
  let component: OperationsCockpitComponent;
  let mockRegistry: any;
  let mockRouter: any;
  let mockHealth: any;
  let mockSettings: any;
  let mockCompanyApi: any;
  let mockToast: any;
  let injector: Injector;
  let activeModuleCodes: string[];

  beforeEach(() => {
    mockRouter = {
      navigate: vi.fn(),
      url: '/app/operations/cockpit'
    };

    mockHealth = {
      healthScore$: of(98),
      networkPingMs$: of(10),
      serverHealth$: of({ components: { database: { status: 'healthy' } } }),
      clientStorage$: of({ warehouseRecords: 120, financeRecords: 80 }),
      serviceWorker$: of({ active: true }),
      lastReport$: of(null),
      runFullDiagnostic: vi.fn().mockResolvedValue({})
    };

    mockSettings = {
      getBackups: vi.fn().mockReturnValue(of({
        backups: [
          { filename: 'snapshot_20261014.dump', size_mb: '12.4 MB', created_at: '2026-10-14T10:00:00Z' }
        ]
      })),
      getSnapshotSummary: vi.fn().mockReturnValue(of({
        total_count: 5,
        latest_created_at_jalali: '۱۴۰۵/۰۷/۲۳',
        latest_file_size: '۱۲ مگابایت'
      })),
      createBackup: vi.fn().mockReturnValue(of({ success: true })),
      createSnapshot: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockCompanyApi = {
      getExpiringDocuments: vi.fn().mockReturnValue(of({
        results: [
          {
            id: 1,
            company_name: 'شرکت توزیع سراسری',
            document_type_display: 'روزنامه رسمی',
            expiry_status: 'expiring_soon'
          }
        ]
      }))
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    };

    activeModuleCodes = ['warehouse', 'accounting'];

    mockRegistry = {
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'operations') {
          const list: any[] = [];
          if (activeModuleCodes.includes('warehouse')) {
            list.push({
              moduleCode: 'warehouse',
              extension: {
                quickLink: { title: 'سامانه انبارداری', route: '/app/warehouse' },
                syncMonitorScope: 'warehouse'
              }
            });
          }
          if (activeModuleCodes.includes('accounting')) {
            list.push({
              moduleCode: 'accounting',
              extension: {
                quickLink: { title: 'سامانه مالی و پرسنلی', route: '/app/finance' },
                hasExpiringDocsWidget: true,
                syncMonitorScope: 'accounting'
              }
            });
          }
          return list;
        }
        return [];
      })
    };

    injector = Injector.create({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SystemHealthService, useValue: mockHealth },
        { provide: SettingsService, useValue: mockSettings },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ModuleRegistryService, useValue: mockRegistry }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new OperationsCockpitComponent();
      component.ngOnInit();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('پروفایل ۱: نصب کامل (هر دو ماژول انبار و مالی) — فعال بودن ویجت سررسید مدارک و تنظیمات منبع انبار', () => {
    activeModuleCodes = ['warehouse', 'accounting'];

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(true);
    expect(component.expiringDocs().length).toBe(1);
    expect(component.expiringDocs()[0].company_name).toBe('شرکت توزیع سراسری');
  });

  it('پروفایل ۲: تک‌ماژول انبارداری (بدون مالی) — فعال بودن تنظیمات انبار و غیرفعال بودن ویجت مدارک حسابداری', () => {
    activeModuleCodes = ['warehouse'];

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(false);
  });

  it('پروفایل ۳: تک‌ماژول مالی (بدون انبار) — فعال بودن ویجت مدارک و غیرفعال بودن ماژول انبارداری', () => {
    activeModuleCodes = ['accounting'];

    expect(component.isWarehouseInstalled).toBe(false);
    expect(component.isAccountingInstalled).toBe(true);
  });

  it('پایش عملکرد اکشن‌ها و ناوبری در اتاق فرماندهی مرکز عملیات', () => {
    component.navigateTo('/app/warehouse/wh-settings');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/warehouse/wh-settings']);

    component.createInstantSnapshot();
    expect(mockSettings.createSnapshot).toHaveBeenCalled();
  });
});
