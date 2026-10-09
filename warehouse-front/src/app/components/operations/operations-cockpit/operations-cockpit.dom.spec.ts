// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { OperationsCockpitComponent } from './operations-cockpit';
import { SystemHealthService } from '../../../core/services/system-health.service';
import { SettingsService } from '../../../services/settings';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { ToastService } from '../../../shared/components/toast/toast.component';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('OperationsCockpitComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<OperationsCockpitComponent>;
  let component: OperationsCockpitComponent;
  let mockRouter: any;
  let mockHealth: any;
  let mockSettings: any;
  let mockCompanyApi: any;
  let mockToast: any;

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

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  beforeEach(async () => {
    mockRouter = { navigate: vi.fn() };
    mockHealth = { runFullDiagnostic: vi.fn().mockResolvedValue({}) };
    mockSettings = {
      getSnapshotSummary: vi.fn().mockReturnValue(of({
        total_count: 5,
        latest_created_at_jalali: '1405/01/15',
        latest_file_size: '12 مگابایت'
      }))
    };
    mockCompanyApi = {
      getExpiringDocuments: vi.fn().mockReturnValue(of([]))
    };
    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, OperationsCockpitComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: SystemHealthService, useValue: mockHealth },
        { provide: SettingsService, useValue: mockSettings },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OperationsCockpitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('wh_installed_modules');
    TestBed.resetTestingModule();
  });

  it('۱. در حالت پیش‌فرض (Full Suite): دکمه تنظیمات انبارداری و ویجت مدارک در DOM نمایش داده می‌شوند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse', 'accounting']);
    fixture.detectChanges();

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    const settingsBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تنظیمات منبع (انبار)'));
    expect(settingsBtn).toBeDefined();

    const text = el.textContent || '';
    expect(text).toContain('پایش همگام‌سازی و حل تداخل');
    // متن خنثی شده
    expect(text).toContain('تبلت‌ها و کلاینت‌ها');
  });

  it('۲. ایزولاسیون تک‌ماژول (فقط مالی): دکمه تنظیمات انبارداری در DOM حذف است و هیچ ردی از تنظیمات انبار دیده نمی‌شود', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);
    fixture.detectChanges();

    expect(component.isWarehouseInstalled).toBe(false);
    expect(component.isAccountingInstalled).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    const settingsBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تنظیمات منبع (انبار)'));
    expect(settingsBtn).toBeUndefined();

    const html = el.innerHTML;
    expect(html).not.toContain('wh-settings');
  });

  it('۳. ایزولاسیون تک‌ماژول (فقط انبار): دکمه تنظیمات انبار نمایش داده می‌شود و ویجت مدارک حسابداری پنهان است', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse']);
    fixture.detectChanges();

    expect(component.isWarehouseInstalled).toBe(true);
    expect(component.isAccountingInstalled).toBe(false);

    const el: HTMLElement = fixture.nativeElement;
    const settingsBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تنظیمات منبع (انبار)'));
    expect(settingsBtn).toBeDefined();

    // ویجت مدارک هلدینگ (مختص حسابداری) مخفی است
    const docWidget = el.querySelector('[title="مدارک هلدینگ"]');
    expect(docWidget).toBeNull();
  });
});
