// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { signal } from '@angular/core';

import { CompaniesManagementComponent } from '../../../common/components/operations/companies/companies';
import { CompanyApiService } from '../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { Company } from '../../../../core/models/company.model';
import { ModuleRegistryService } from '../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { MODULE as ACCOUNTING_MODULE } from '../../module';

// بارگذاری تنبل کامپوننت واقعی (import پویا) چند چرخه طول می‌کشد
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 20));
};

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompaniesManagementComponent: Company Finance Tabs with and without Accounting (Type 1 DOM)', () => {
  let fixture: ComponentFixture<CompaniesManagementComponent>;
  let component: CompaniesManagementComponent;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockAccountsHttp: any;
  let mockToast: any;
  let mockWebSocket: any;
  let mockConfirmDialog: any;
  let mockHttp: any;
  let isAccountingInstalledFlag = true;

  const sampleCompanies: Company[] = [
    {
      id: 1,
      code: 'PTS',
      name: 'پاینده توان ساینا',
      national_id: '10101234565',
      economic_code: '4111222333',
      registration_number: '12345',
      phone: '02188889999',
      address: 'تهران، خیابان ولیعصر',
      ceo_name: 'مهندس پاینده',
      projects_count: 2,
      documents_count: 3,
      documents_health_status: 'valid',
      is_active: true,
      created_at: '2026-09-23T10:00:00Z',
      updated_at: '2026-09-23T10:00:00Z'
    },
    {
      id: 2,
      code: 'FA',
      name: 'فارس عالیش',
      national_id: '10207654320',
      economic_code: '4222333444',
      registration_number: '67890',
      phone: '07133334444',
      address: 'شیراز، شهرک صنعتی',
      ceo_name: 'مهندس عالیشوندی',
      projects_count: 1,
      documents_count: 1,
      documents_health_status: 'expiring_soon',
      is_active: true,
      created_at: '2026-09-23T10:00:00Z',
      updated_at: '2026-09-23T10:00:00Z'
    }
  ];

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

    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:4200/test-blob');
    window.URL.revokeObjectURL = vi.fn();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  const setupTestBed = async (accountingInstalled: boolean) => {
    TestBed.resetTestingModule();
    isAccountingInstalledFlag = accountingInstalled;

    mockCompanyApi = {
      getAll: vi.fn().mockReturnValue(of([...sampleCompanies])),
      getById: vi.fn().mockImplementation((id: number) => of(sampleCompanies.find(c => c.id === id))),
      create: vi.fn().mockImplementation((data: any) => of({ id: 3, ...data, projects_count: 0 })),
      update: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      delete: vi.fn().mockReturnValue(of(void 0)),
      getUserAvailable: vi.fn().mockReturnValue(of({ companies: sampleCompanies, is_superuser: true })),
      getUserAccesses: vi.fn().mockReturnValue(of([])),
      getPermissionSections: vi.fn().mockReturnValue(of({ levels: ['none', 'read', 'write'], templates: [], sections: [], fields: {} })),
      getCompanyMembers: vi.fn().mockReturnValue(of([])),
      createUserAccess: vi.fn().mockReturnValue(of({})),
      deleteUserAccess: vi.fn().mockReturnValue(of({})),
      exportExcel: vi.fn().mockReturnValue(of(new Blob())),
      uploadLogo: vi.fn().mockReturnValue(of({})),
      getDocuments: vi.fn().mockReturnValue(of([])),
      createDocument: vi.fn().mockReturnValue(of({ id: 101, title: 'مدرک تست' })),
      deleteDocument: vi.fn().mockReturnValue(of(void 0)),
      uploadCoreDoc: vi.fn().mockReturnValue(of({ file_url: '/media/test.pdf' })),
      getExpiringDocuments: vi.fn().mockReturnValue(of([])),
      getBankAccounts: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          bank_name: 'بانک ملت',
          account_number: '1234567890',
          sheba_number: 'IR120120000000001234567890',
          account_title: 'حساب جاری پاینده',
          is_primary: true,
          is_active: true
        }
      ])),
      createBankAccount: vi.fn().mockImplementation((data: any) => of({ id: 2, ...data })),
      updateBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteBankAccount: vi.fn().mockReturnValue(of(void 0)),
      setPrimaryBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      getBoardMembers: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          first_name: 'رضا',
          last_name: 'پاینده',
          national_code: '0012345679',
          member_type: 'real',
          role: 'chairman',
          has_signature_right: true,
          signature_scope: 'امضای کلیه اسناد',
          term_start: '1403/01/01',
          term_expiry: '1405/01/01',
          is_active: true
        }
      ])),
      createBoardMember: vi.fn().mockReturnValue(of({ id: 2, first_name: 'عضو', last_name: 'جدید', is_active: true })),
      updateBoardMember: vi.fn().mockReturnValue(of({ id: 1, first_name: 'عضو', last_name: 'ویرایش', is_active: true })),
      deleteBoardMember: vi.fn().mockReturnValue(of(void 0)),
      getFiscalPeriods: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          fiscal_year: '1403',
          title: 'سال مالی ۱۴۰۳',
          start_date: '1403/01/01',
          end_date: '1403/12/29',
          status: 'open',
          status_display: 'جاری و باز',
          is_active: true
        }
      ])),
      createFiscalPeriod: vi.fn().mockReturnValue(of({ id: 2, fiscal_year: '1404', status: 'open' })),
      closeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی بسته شد.' })),
      freezeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی منجمد شد.' })),
      reopenFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی بازگشایی شد.' })),
      getCompanyGdriveUrl: vi.fn().mockReturnValue('/api/personnel/companies/1/gdrive')
    };

    mockActiveCompanyService = {
      activeCompany: sampleCompanies[0],
      activeCompanyId: 1,
      activeCompany$: of(sampleCompanies[0]),
      activeCompanySignal: signal(sampleCompanies[0]),
      availableCompanies: sampleCompanies,
      availableCompanies$: of(sampleCompanies),
      loadAvailableCompanies: vi.fn().mockReturnValue(of({ companies: sampleCompanies, is_superuser: true })),
      selectCompany: vi.fn(),
      openSwitchModal: vi.fn(),
      closeSwitchModal: vi.fn()
    };

    mockAccountsHttp = {
      getUsers: vi.fn().mockReturnValue(of([]))
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockWebSocket = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      notifications$: new Subject<any>(),
      connected$: of(true),
      tabId: 'test-client-tab-id'
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockHttp = {
      get: vi.fn().mockReturnValue(of({})),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of(void 0))
    };

    const mockModuleRegistry = {
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'companies') {
          return [
            {
              module: { code: isAccountingInstalledFlag ? 'accounting' : 'warehouse' },
              moduleCode: isAccountingInstalledFlag ? 'accounting' : 'warehouse',
              // تب‌ها، بخش‌ها، ستون‌ها و دکمهٔ ردیف همان ثبت واقعی ماژول حسابداری‌اند
              extension: {
                ...(isAccountingInstalledFlag ? ACCOUNTING_MODULE.extensions?.companies : {}),
                hasWarehouseModuleToggle: true
              }
            }
          ];
        }
        return [];
      }),
      isModuleInstalled: vi.fn().mockImplementation((code: string) => {
        if (code === 'accounting') return isAccountingInstalledFlag;
        return true;
      }),
      getInstalledModules: vi.fn().mockReturnValue([])
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, CompaniesManagementComponent],
      providers: [
        provideRouter([
          { path: 'app/operations/companies', component: CompaniesManagementComponent },
          { path: 'app/operations/companies/new', component: CompaniesManagementComponent },
          { path: 'app/operations/companies/:id', component: CompaniesManagementComponent }
        ]),
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        { provide: AccountsHttpService, useValue: mockAccountsHttp },
        { provide: ToastService, useValue: mockToast },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: HttpClient, useValue: mockHttp },
        { provide: ModuleRegistryService, useValue: mockModuleRegistry },
        { provide: AuthService, useValue: { isSuperuser: signal(true), user: signal({ is_superuser: true, username: 'admin' }) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompaniesManagementComponent);
    component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/operations/companies');
    // fixture در router-outlet نیست؛ ناوبری به /:id همان کار paramMap نمونهٔ استودیو را می‌کند
    vi.spyOn(router, 'navigate').mockImplementation(async (commands: readonly any[], extras?: any): Promise<boolean> => {
      const [base, id] = commands || [];
      if (base === '/app/operations/companies/new') {
        component.setupStudioForNew();
      } else if (base === '/app/operations/companies' && id !== undefined) {
        component.viewMode = 'studio';
        component.setupStudioForCompany(Number(id));
        if (extras?.queryParams?.tab) component.activeModalTab = extras.queryParams.tab;
      }
      return true;
    });
    component.viewMode = 'list';
    fixture.detectChanges();
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('با نصب حسابداری: ستون‌های «پروژه‌ها» و «سلامت مدارک» (listCells) در جدول و کارت موبایل رندر می‌شوند', async () => {
    await setupTestBed(true);
    // سلول‌ها تنبل بارگذاری می‌شوند
    await flush();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
    expect(headers).toContain('پروژه‌ها');
    expect(headers).toContain('سلامت مدارک');
    expect(component.tableColspan).toBe(11);

    const firstRowText = el.querySelector('tbody tr:first-child')?.textContent || '';
    expect(firstRowText).toContain('۲ پروژه');
    expect(firstRowText).toContain('مدرک معتبر');

    // کارت موبایل: «پروژه‌ها» در جدول مشخصات و «وضعیت مدارک» در ردیف کامل
    const card = el.querySelector('.block.xl\\:hidden > div.p-4') as HTMLElement;
    expect(card.querySelector('.grid app-company-projects-cell')?.textContent).toContain('پروژه‌ها:');
    expect(card.querySelector(':scope > app-company-documents-health-cell')?.textContent).toContain('وضعیت مدارک:');
    expect(card.textContent).toContain('مدرک معتبر');
    expect(el.textContent).toContain('در آستانه انقضا (۱)');
  });

  it('با نصب حسابداری: دکمهٔ گوگل‌درایو ردیف (rowActions) تب گوگل‌درایو استودیو را باز می‌کند؛ بدون حسابداری دکمه‌ای نیست', async () => {
    await setupTestBed(true);
    const el: HTMLElement = fixture.nativeElement;
    const router = TestBed.inject(Router);
    const gdriveBtn = el.querySelector('tbody button[aria-label="گوگل‌درایو"]') as HTMLButtonElement;
    expect(gdriveBtn).not.toBeNull();
    expect(gdriveBtn.getAttribute('title')).toBe('تنظیمات همگام‌سازی گوگل‌درایو');
    gdriveBtn.click();
    expect(router.navigate).toHaveBeenCalledWith(['/app/operations/companies', 1], { queryParams: { tab: 'gdrive' } });
    expect(component.activeModalTab).toBe('gdrive');

    await setupTestBed(false);
    expect(fixture.nativeElement.querySelector('button[aria-label="گوگل‌درایو"]')).toBeNull();
    expect(component.tableColspan).toBe(9);
  });

  it('با نصب حسابداری: باز کردن استودیو از طریق دکمه رندر شده، تب‌های treasury، governance و gdrive را نشان داده و زیرعنوان حسابداری است', async () => {
    await setupTestBed(true);

    const el: HTMLElement = fixture.nativeElement;
    const editBtn = el.querySelector('button[aria-label="استودیو"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    editBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.viewMode).toBe('studio');
    expect(component.companyModal.isOpen).toBe(true);

    const tabs = Array.from(el.querySelectorAll('button[role="tab"]')) as HTMLButtonElement[];
    const tabLabels = tabs.map(t => t.getAttribute('title') || t.textContent?.trim());

    expect(tabLabels.some(l => l?.includes('بانک و شبا'))).toBe(true);
    expect(tabLabels.some(l => l?.includes('هیئت‌مدیره و امضا'))).toBe(true);
    expect(tabLabels.some(l => l?.includes('همگام‌سازی گوگل‌درایو'))).toBe(true);

    // زیرنویس هدر استودیو خنثی است و نام ماژول نمی‌برد (C6)
    const subtitle = el.querySelector('.sticky.top-0 p')?.textContent?.trim();
    expect(subtitle).toBe('شناسنامهٔ حقوقی، اسناد و دسترسی کاربران شرکت');
  });

  it('بدون نصب حسابداری: هیچ‌یک از ستون‌های پروژه‌ها و سلامت مدارک رندر نمی‌شوند و زیرعنوان خنثی است', async () => {
    await setupTestBed(false);

    const el: HTMLElement = fixture.nativeElement;
    const headers = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
    expect(headers).not.toContain('پروژه‌ها');
    expect(headers).not.toContain('سلامت مدارک');

    const editBtn = el.querySelector('button[aria-label="استودیو"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    editBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.viewMode).toBe('studio');

    const tabs = Array.from(el.querySelectorAll('button[role="tab"]')) as HTMLButtonElement[];
    const tabLabels = tabs.map(t => t.getAttribute('title') || t.textContent?.trim());

    expect(tabLabels.some(l => l?.includes('بانک و شبا'))).toBe(false);
    expect(tabLabels.some(l => l?.includes('هیئت‌مدیره و امضا'))).toBe(false);
    expect(tabLabels.some(l => l?.includes('همگام‌سازی گوگل‌درایو'))).toBe(false);

    const subtitle = el.querySelector('.sticky.top-0 p')?.textContent?.trim();
    expect(subtitle).toBe('شناسنامهٔ حقوقی، اسناد و دسترسی کاربران شرکت');

    // A11: بخش دوره‌های مالی و بایگانی جامع در تب‌های هسته نیست
    component.setModalTab('fiscal_insurance');
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('دوره‌های مالی رسمی و وضعیت بستن سال‌ها');
    expect(el.textContent).not.toContain('تعریف دوره مالی جدید');
    expect(el.querySelector('app-company-fiscal-periods-section')).toBeNull();
    expect(el.querySelector('app-company-archive-section')).toBeNull();
  });

  it('با نصب حسابداری: کلیک روی هر یک از دکمه‌های سه تب (خزانه‌داری، هیئت‌مدیره، گوگل‌درایو) پنل مربوط به آن را رندر می‌کند', async () => {
    await setupTestBed(true);

    const el: HTMLElement = fixture.nativeElement;
    const editBtn = el.querySelector('button[aria-label="استودیو"]') as HTMLButtonElement;
    editBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // تب‌های مشارکتی تنبل بارگذاری می‌شوند
    await flush();
    fixture.detectChanges();

    // ۱. تب خزانه‌داری (treasury)
    component.setModalTab('treasury');
    fixture.detectChanges();
    expect(component.activeModalTab).toBe('treasury');
    expect(el.textContent).toContain('حساب‌های بانکی و شماره‌های شبای رسمی شرکت');

    // ۲. تب هیئت‌مدیره (governance)
    component.setModalTab('governance');
    fixture.detectChanges();
    expect(component.activeModalTab).toBe('governance');
    expect(el.textContent).toContain('صاحبان حق امضا');

    // ۳. تب گوگل‌درایو (gdrive): فقط وقتی باز است ساخته می‌شود (renderOnlyWhenActive)
    expect(el.querySelector('app-company-gdrive-tab')).toBeNull();
    component.setModalTab('gdrive');
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(component.activeModalTab).toBe('gdrive');
    const gdriveComponent = el.querySelector('app-company-gdrive-tab');
    expect(gdriveComponent).not.toBeNull();
    component.setModalTab('identity');
    fixture.detectChanges();
    expect(el.querySelector('app-company-gdrive-tab')).toBeNull();

    // ۴. بخش دوره‌های مالی در انتهای تب «بیمه و مالی» و بایگانی جامع در انتهای تب «مدارک»
    component.setModalTab('fiscal_insurance');
    fixture.detectChanges();
    const fiscalSection = el.querySelector('app-company-fiscal-periods-section') as HTMLElement;
    expect(fiscalSection.closest('[hidden]')).toBeNull();
    expect(fiscalSection.textContent).toContain('سال مالی ۱۴۰۳');
    expect((el.querySelector('app-company-archive-section') as HTMLElement).closest('[hidden]')).not.toBeNull();
    component.setModalTab('documents');
    fixture.detectChanges();
    expect((el.querySelector('app-company-archive-section') as HTMLElement).closest('[hidden]')).toBeNull();
    expect(fiscalSection.closest('[hidden]')).not.toBeNull();
  });

  it('شرکت تازه: تب گوگل‌درایو پنهان است و بخش دوره‌های مالی پیام «پس از ثبت اولیه» نشان می‌دهد', async () => {
    await setupTestBed(true);
    mockCompanyApi.getFiscalPeriods.mockClear();
    mockCompanyApi.getDocuments.mockClear();
    component.setupStudioForNew();
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(component.modalTabs.some(t => t.id === 'gdrive')).toBe(false);
    component.setModalTab('fiscal_insurance');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('پس از ثبت اولیه مشخصات شرکت، امکان تعریف دوره‌های مالی');
    expect(mockCompanyApi.getFiscalPeriods).not.toHaveBeenCalled();
    expect(mockCompanyApi.getDocuments).not.toHaveBeenCalled();
  });

  it('بدون نصب حسابداری: متدهای بارگذاری حساب‌های بانکی و اعضای هیئت‌مدیره در CompanyApiService فراخوانی نمی‌شوند', async () => {
    await setupTestBed(false);

    mockCompanyApi.getBankAccounts.mockClear();
    mockCompanyApi.getBoardMembers.mockClear();
    mockCompanyApi.getFiscalPeriods.mockClear();
    mockCompanyApi.getDocuments.mockClear();

    const editBtn = fixture.nativeElement.querySelector('button[aria-label="استودیو"]') as HTMLButtonElement;
    editBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await flush();
    fixture.detectChanges();

    expect(component.modalTabs.some(t => t.id === 'treasury' || t.id === 'governance')).toBe(false);
    expect(mockCompanyApi.getBankAccounts).not.toHaveBeenCalled();
    expect(mockCompanyApi.getBoardMembers).not.toHaveBeenCalled();
    expect(mockCompanyApi.getFiscalPeriods).not.toHaveBeenCalled();
    expect(mockCompanyApi.getDocuments).not.toHaveBeenCalled();
    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('با نصب حسابداری: با باز کردن استودیو، متدهای بارگذاری حساب‌های بانکی و اعضای هیئت‌مدیره فراخوانی می‌شوند', async () => {
    await setupTestBed(true);

    mockCompanyApi.getBankAccounts.mockClear();
    mockCompanyApi.getBoardMembers.mockClear();
    mockCompanyApi.getFiscalPeriods.mockClear();
    mockCompanyApi.getDocuments.mockClear();
    mockCompanyApi.getDocuments.mockReturnValue(of([{ id: 5, company: 1, title: 'گواهی', document_type: 'other' }]));

    const editBtn = fixture.nativeElement.querySelector('button[aria-label="استودیو"]') as HTMLButtonElement;
    editBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await flush();
    fixture.detectChanges();

    // هر دو تب یک بار ساخته و نگه داشته می‌شوند (شمارنده‌ها بی‌آنکه تب باز شود)
    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledWith(1);
    expect(mockCompanyApi.getBoardMembers).toHaveBeenCalledWith(1);
    expect(component.modalTabs.find(t => t.id === 'treasury')?.count).toBe(1);
    // بخش‌های دوره‌های مالی و بایگانی هم یک بار دریافت می‌کنند؛ شمارندهٔ تب مدارک از بخش بایگانی است
    expect(mockCompanyApi.getFiscalPeriods).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getDocuments).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getDocuments).toHaveBeenCalledWith({ company_id: 1 });
    expect(component.modalTabs.find(t => t.id === 'documents')?.count).toBe(1);
    // گوگل‌درایو تا باز شدن تب هیچ درخواستی نمی‌زند
    expect(mockHttp.get).not.toHaveBeenCalled();

    // جابه‌جایی تب دوباره دریافت نمی‌کند (A7)
    component.setModalTab('treasury');
    fixture.detectChanges();
    component.setModalTab('identity');
    fixture.detectChanges();
    component.setModalTab('treasury');
    fixture.detectChanges();
    component.setModalTab('documents');
    fixture.detectChanges();
    component.setModalTab('fiscal_insurance');
    fixture.detectChanges();
    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getDocuments).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getFiscalPeriods).toHaveBeenCalledTimes(1);
  });
});
