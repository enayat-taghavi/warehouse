// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { signal } from '@angular/core';

import { CompanyGdriveTabComponent, GDriveConfigResponse } from './company-gdrive-tab';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { environment } from '../../../../../../../environments/environment';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyGdriveTabComponent: Google Drive Sync Tab with and without Accounting (Type 1 DOM)', () => {
  let fixture: ComponentFixture<CompanyGdriveTabComponent>;
  let component: CompanyGdriveTabComponent;

  let mockHttp: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockCompanyApi: {
    getCompanyGdriveUrl: ReturnType<typeof vi.fn>;
  };
  let mockActiveCompanyService: any;
  let mockModuleRegistry: any;
  let mockToastService: any;
  let mockAuthService: any;
  let mockConfirmDialog: any;

  const sampleConnectedConfig: GDriveConfigResponse = {
    company_id: 5,
    company_name: 'شرکت پاینده سازه پنج',
    is_enabled: true,
    is_connected: true,
    auth_status: 'connected',
    worker_alive: true,
    worker_heartbeat_at: '2026-10-17T01:00:00Z',
    other_accounts_count: 0,
    account_email: 'finance@payandeh-group.ir',
    root_folder_id: 'folder-root-555',
    root_folder_name: 'اسناد شرکت پاینده سازه',
    root_folder_url: 'https://drive.google.com/drive/folders/folder-root-555',
    sync_accounting_docs: true,
    sync_personnel_docs: true,
    sync_fleet_docs: true,
    sync_inventory_photos: true,
    sync_backups: true,
    sync_mode: 'immediate',
    scheduled_start_time: '01:00',
    scheduled_end_time: '06:00',
    chunk_delay_seconds: 5,
    last_sync_at: '2026-10-17T01:30:00Z',
    last_error: null,
    stats: {
      total: 15,
      pending: 4,
      processing: 1,
      completed: 10,
      failed: 0
    }
  };

  beforeAll(() => {
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
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      });
    }
  });

  beforeEach(() => {
    mockHttp = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/queue/')) {
          return of({ results: [], count: 0 });
        }
        return of({ ...sampleConnectedConfig });
      }),
      post: vi.fn().mockReturnValue(of({ success: true, message: 'عملیات با موفقیت انجام شد.', enqueued_count: 3 })),
      put: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({ success: true })),
      delete: vi.fn().mockReturnValue(of(void 0))
    };

    mockCompanyApi = {
      getCompanyGdriveUrl: vi.fn().mockImplementation((cid: number | string, subPath = '') => {
        let normalized = subPath;
        if (normalized && !normalized.startsWith('/')) {
          normalized = '/' + normalized;
        }
        return `${environment.apiUrl}/personnel/companies/${cid}/gdrive${normalized}`;
      })
    };

    mockActiveCompanyService = {
      activeCompany: { id: 5, name: 'شرکت پاینده سازه پنج' },
      activeCompanyId: 5,
      activeCompany$: of({ id: 5, name: 'شرکت پاینده سازه پنج' }),
      activeCompanySignal: signal({ id: 5, name: 'شرکت پاینده سازه پنج' }),
      availableCompanies: [{ id: 5, name: 'شرکت پاینده سازه پنج' }],
      availableCompanies$: of([{ id: 5, name: 'شرکت پاینده سازه پنج' }]),
      loadAvailableCompanies: vi.fn().mockReturnValue(of({ companies: [], is_superuser: true }))
    };

    mockModuleRegistry = {
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'companies') {
          return [
            {
              module: { code: 'accounting' },
              moduleCode: 'accounting',
              extension: {
                providesTreasury: true,
                hasWarehouseModuleToggle: true
              }
            }
          ];
        }
        return [];
      }),
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getInstalledModules: vi.fn().mockReturnValue([])
    };

    mockToastService = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockAuthService = {
      isSuperuser: signal(true),
      user: signal({ is_superuser: true, username: 'admin' })
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const createComponent = async (companyId: number = 5) => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, CompanyGdriveTabComponent],
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: mockHttp },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        { provide: ModuleRegistryService, useValue: mockModuleRegistry },
        { provide: ToastService, useValue: mockToastService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyGdriveTabComponent);
    component = fixture.componentInstance;
    component.companyId = companyId;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  it('با getCompanyGdriveUrl حسابداری و companyId=5: اولین HttpClient.get به نشانی زیر مجموعه apiUrl/personnel/companies/5/gdrive ارسال می‌شود', async () => {
    await createComponent(5);

    expect(mockCompanyApi.getCompanyGdriveUrl).toHaveBeenCalledWith(5, '/');
    expect(mockHttp.get).toHaveBeenCalled();

    const firstGetUrl = mockHttp.get.mock.calls[0][0];
    const expectedPrefix = `${environment.apiUrl}/personnel/companies/5/gdrive`;
    expect(firstGetUrl.startsWith(expectedPrefix)).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('همگام‌سازی ابری گوگل‌درایو شرکت‌ها');
    expect(el.textContent).toContain('متصل به درایو');
    expect(el.textContent).toContain('finance@payandeh-group.ir');
  });

  it('اقدام قطع اتصال: با کلیک روی دکمه رندر شده «قطع اتصال» و تایید دیالوگ، درخواست POST به نشانی ختم‌شونده به /gdrive/disconnect/ ارسال می‌شود', async () => {
    await createComponent(5);

    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const disconnectBtn = buttons.find(b => b.textContent?.includes('قطع اتصال'));
    expect(disconnectBtn).toBeDefined();

    disconnectBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'قطع اتصال حساب گوگل‌درایو',
        type: 'danger'
      })
    );

    expect(mockHttp.post).toHaveBeenCalled();
    const postCalls = mockHttp.post.mock.calls;
    const disconnectCall = postCalls.find((call: any[]) => call[0].endsWith('/gdrive/disconnect/'));
    expect(disconnectCall).toBeDefined();
    expect(disconnectCall![0]).toMatch(/\/gdrive\/disconnect\/$/);
  });

  it('اقدام ارسال دستی صف: با کلیک روی دکمه رندر شده اقدام، درخواست POST به نشانی ختم‌شونده به /gdrive/trigger-sync/ ارسال می‌شود', async () => {
    await createComponent(5);

    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const triggerBtn = buttons.find(b => b.textContent?.includes('ارسال دستی صف فایل‌های معلق'));
    expect(triggerBtn).toBeDefined();
    expect(triggerBtn!.disabled).toBe(false);

    triggerBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockHttp.post).toHaveBeenCalled();
    const postCalls = mockHttp.post.mock.calls;
    const triggerCall = postCalls.find((call: any[]) => call[0].endsWith('/gdrive/trigger-sync/'));
    expect(triggerCall).toBeDefined();
    expect(triggerCall![0]).toMatch(/\/gdrive\/trigger-sync\/$/);
  });

  it('وقتی getCompanyGdriveUrl مقدار null برمی‌گرداند: هیچ متد HttpClient فراخوانی نمی‌شود و کامپوننت بدون خطا رندر می‌شود', async () => {
    mockCompanyApi.getCompanyGdriveUrl.mockReturnValue(null);

    await createComponent(5);

    expect(mockHttp.get).not.toHaveBeenCalled();
    expect(mockHttp.post).not.toHaveBeenCalled();
    expect(mockHttp.patch).not.toHaveBeenCalled();
    expect(mockHttp.put).not.toHaveBeenCalled();
    expect(mockHttp.delete).not.toHaveBeenCalled();

    expect(component.loadError()).toBe('خطا در دریافت وضعیت گوگل‌درایو شرکت');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('خطا در بارگذاری اطلاعات تب گوگل‌درایو');
    expect(el.textContent).toContain('خطا در دریافت وضعیت گوگل‌درایو شرکت');
  });

  it('در صورت رد یا انصراف از دیالوگ تایید قطع اتصال، هیچ درخواست POST به /gdrive/disconnect/ ارسال نمی‌شود', async () => {
    mockConfirmDialog.open.mockResolvedValueOnce(false);
    await createComponent(5);

    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const disconnectBtn = buttons.find(b => b.textContent?.includes('قطع اتصال'));
    expect(disconnectBtn).toBeDefined();

    disconnectBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockConfirmDialog.open).toHaveBeenCalled();
    const postCalls = mockHttp.post.mock.calls;
    const disconnectCall = postCalls.find((call: any[]) => call[0].endsWith('/gdrive/disconnect/'));
    expect(disconnectCall).toBeUndefined();
  });

  it('اقدام پیمایش و ثبت فایل‌های پیشین (syncAllFiles): با کلیک روی دکمه، درخواست POST به نشانی ختم‌شونده به /gdrive/sync-all/ ارسال می‌شود', async () => {
    await createComponent(5);

    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const syncAllBtn = buttons.find(b => b.textContent?.includes('پیمایش و ثبت فایل‌های پیشین'));
    expect(syncAllBtn).toBeDefined();

    syncAllBtn!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockHttp.post).toHaveBeenCalled();
    const postCalls = mockHttp.post.mock.calls;
    const syncAllCall = postCalls.find((call: any[]) => call[0].endsWith('/gdrive/sync-all/'));
    expect(syncAllCall).toBeDefined();
    expect(syncAllCall![0]).toMatch(/\/gdrive\/sync-all\/$/);
  });
});
