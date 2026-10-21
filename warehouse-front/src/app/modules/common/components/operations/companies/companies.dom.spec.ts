// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { CompaniesManagementComponent } from './companies';
import { resolveEntityTypeFromUrl } from '../../../../../core/services/offline-db';
import { companiesLeaveGuard } from './companies-leave.guard';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { AccountsHttpService } from '../../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { Company } from '../../../../../core/models/company.model';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { By } from '@angular/platform-browser';
import { SmartDeleteModalComponent } from '../../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { SKIP_OFFLINE } from '../../../../../core/interceptors/offline.interceptor';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

/** کامپوننت‌های مشارکتی ماژول‌ها (ستون‌ها، تب‌ها و بخش‌ها) با import پویا چند چرخه بعد می‌رسند */
async function flushLazy(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.detectChanges();
  }
}

/**
 * fixture در router-outlet نیست، پس ناوبری به /new و /:id نمونهٔ تازه نمی‌سازد.
 * این شبیه‌ساز همان کاری را می‌کند که paramMap و queryParamMap مسیر واقعی در نمونهٔ استودیو می‌کنند.
 */
function simulateStudioRoutes(router: Router, getComponent: () => CompaniesManagementComponent) {
  return vi.spyOn(router, 'navigate').mockImplementation(async (commands: readonly any[], extras?: any): Promise<boolean> => {
    const c = getComponent();
    const [base, id] = commands || [];
    if (base === '/app/operations/companies/new') {
      c.setupStudioForNew();
    } else if (base === '/app/operations/companies' && id !== undefined) {
      c.viewMode = 'studio';
      c.setupStudioForCompany(Number(id));
      const tab = extras?.queryParams?.tab;
      if (tab) c.activeModalTab = tab;
    }
    return true;
  });
}

describe('CompaniesManagementComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<CompaniesManagementComponent>;
  let component: CompaniesManagementComponent;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockAccountsHttp: any;
  let mockToast: any;
  let mockWebSocket: any;
  let mockConfirmDialog: any;
  let navigateSpy: ReturnType<typeof simulateStudioRoutes>;

  const sampleCompanies: Company[] = [
    {
      id: 1,
      code: 'PTS',
      name: 'پاینده توان ساینا',
      national_id: '10101234565',
      economic_code: '411122233344',
      registration_number: '12345',
      phone: '02188889999',
      address: 'تهران، خیابان ولیعصر',
      ceo_name: 'مهندس پاینده',
      projects_count: 2,
      is_active: true,
      created_at: '2026-09-23T10:00:00Z',
      updated_at: '2026-09-23T10:00:00Z'
    },
    {
      id: 2,
      code: 'FA',
      name: 'فارس عالیش',
      national_id: '10207654320',
      economic_code: '422233344455',
      registration_number: '67890',
      phone: '07133334444',
      address: 'شیراز، شهرک صنعتی',
      ceo_name: 'مهندس عالیشوندی',
      projects_count: 1,
      is_active: true,
      created_at: '2026-09-23T10:00:00Z',
      updated_at: '2026-09-23T10:00:00Z'
    }
  ];

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
    mockCompanyApi = {
      getAll: vi.fn().mockReturnValue(of([...sampleCompanies])),
      getById: vi.fn().mockImplementation((id: number) => of(sampleCompanies.find(c => c.id === id))),
      create: vi.fn().mockImplementation((data: any) => of({ id: 3, ...data, projects_count: 0 })),
      update: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      delete: vi.fn().mockReturnValue(of(void 0)),
      patch: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteImpactUrl: vi.fn().mockImplementation((id: number) => `/api/org/companies/${id}/delete_impact/`),
      getUserAvailable: vi.fn().mockReturnValue(of({ companies: sampleCompanies, is_superuser: true })),
      getUserAccesses: vi.fn().mockReturnValue(of([])),
      createUserAccess: vi.fn().mockReturnValue(of({})),
      deleteUserAccess: vi.fn().mockReturnValue(of({})),
      exportExcel: vi.fn().mockReturnValue(of(new Blob())),
      uploadLogo: vi.fn().mockReturnValue(of({})),
      getDocuments: vi.fn().mockReturnValue(of([])),
      createDocument: vi.fn().mockImplementation((data: any) => {
        const title = (data instanceof FormData ? data.get('title') : data?.title) || 'مدرک تست';
        return of({ id: 101, title });
      }),
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
      createBoardMember: vi.fn().mockImplementation((data: any) => of({ id: 2, first_name: 'عضو', last_name: 'جدید', is_active: true })),
      updateBoardMember: vi.fn().mockImplementation((id: number, data: any) => of({ id, first_name: 'عضو', last_name: 'ویرایش', is_active: true })),
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
      createFiscalPeriod: vi.fn().mockImplementation((payload: any) => of({ id: 2, ...payload, status: 'open', status_display: 'جاری و باز', is_active: true })),
      closeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی با موفقیت بسته شد.' })),
      freezeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی منجمد شد.' })),
      reopenFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'دوره مالی بازگشایی شد.' }))
    };

    mockActiveCompanyService = {
      activeCompany: sampleCompanies[0],
      activeCompanyId: 1,
      activeCompany$: of(sampleCompanies[0]),
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

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective, CompaniesManagementComponent],
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
        { provide: HttpClient, useValue: { get: vi.fn().mockReturnValue(of(new ArrayBuffer(8))) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompaniesManagementComponent);
    component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/operations/companies');
    navigateSpy = simulateStudioRoutes(router, () => component);
    component.viewMode = 'list';
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('۱. ساختار هدر چسبان و استانداردهای نوار فرمان (Unified Sticky Command Center)', () => {
    it('باید عنوان ماژول «مدیریت شرکت‌ها و هلدینگ» و نشان تعداد در DOM رندر شوند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const title = el.querySelector('h1');
      expect(title).not.toBeNull();
      expect(title?.textContent?.trim()).toBe('مدیریت شرکت‌ها و هلدینگ');

      const badge = el.querySelector('.bg-indigo-50.text-indigo-700');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('۲ شرکت');
    });

    it('باید سه دکمه آیکونی استاندارد (اکسل خروجی، اکسل ورودی، رفرش) با اندازه w-9 h-9 در هدر وجود داشته باشند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const exportBtn = el.querySelector('button[title="خروجی اکسل شرکت‌ها"]');
      const importBtn = el.querySelector('button[title="ورود اطلاعات از اکسل"]');
      const refreshBtn = el.querySelector('button[title="به‌روزرسانی داده‌ها"]');

      expect(exportBtn).not.toBeNull();
      expect(exportBtn?.className).toContain('w-9');
      expect(exportBtn?.className).toContain('h-9');

      // دکمهٔ «ورود از اکسل» کار نمی‌کرد و حذف شد (ت۵)
      expect(importBtn).toBeNull();

      expect(refreshBtn).not.toBeNull();
      expect(refreshBtn?.className).toContain('w-9');
      expect(refreshBtn?.className).toContain('h-9');
    });

    it('کلیک روی دکمه به‌روزرسانی داده‌ها در DOM باید متد loadCompanies را فراخوانی کند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const refreshBtn = el.querySelector('button[title="به‌روزرسانی داده‌ها"]') as HTMLButtonElement;
      expect(refreshBtn).not.toBeNull();

      refreshBtn.click();
      expect(mockCompanyApi.getAll).toHaveBeenCalled();
    });

    it('باید دکمه اصلی «ثبت شرکت جدید» با کلاس indigo-600 رندر شده باشد', () => {
      const el: HTMLElement = fixture.nativeElement;
      const createBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('ثبت شرکت جدید'));
      expect(createBtn).toBeDefined();
      expect(createBtn?.className).toContain('bg-indigo-600');
    });
  });

  describe('۲. جدول داده‌ها و نمایش ستون‌های مشخصات شرکت (Data Table Card Standard)', () => {
    it('باید سطرهای جدول به تعداد شرکت‌های بارگذاری‌شده در DOM رندر شوند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
    });

    it('باید کد، نام شرکت و نشان شرکت فعال جاری در ردیف اول نمایش داده شود', () => {
      const el: HTMLElement = fixture.nativeElement;
      const firstRow = el.querySelectorAll('tbody tr')[0];

      expect(firstRow.textContent).toContain('PTS');
      expect(firstRow.textContent).toContain('پاینده توان ساینا');
      expect(firstRow.textContent).toContain('فعال جاری');
    });

    it('باید ستون‌های شناسه ملی، مدیرعامل و تعداد پروژه‌ها با فرمت صحیح رندر شوند', async () => {
      await flushLazy(fixture);
      const el: HTMLElement = fixture.nativeElement;
      const firstRow = el.querySelectorAll('tbody tr')[0];

      expect(firstRow.textContent).toContain('10101234565');
      expect(firstRow.textContent).toContain('مهندس پاینده');
      expect(firstRow.textContent).toContain('2 پروژه');
    });

    it('ردیف دوم که شرکت فعال جاری نیست نباید نشان «فعال جاری» داشته باشد', async () => {
      await flushLazy(fixture);
      const el: HTMLElement = fixture.nativeElement;
      const secondRow = el.querySelectorAll('tbody tr')[1];

      expect(secondRow.textContent).toContain('FA');
      expect(secondRow.textContent).toContain('فارس عالیش');
      expect(secondRow.textContent).not.toContain('فعال جاری');
      expect(secondRow.textContent).toContain('1 پروژه');
    });
  });

  describe('۳. فیلتر جستجوی زنده درجا (In-place Live Search Bar)', () => {
    it('جستجوی نام «فارس» باید جدول را فیلتر کرده و تنها ۱ سطر نمایش دهد', () => {
      component.searchQuery = 'فارس';
      component.applyFilter();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('فارس عالیش');
      expect(rows[0].textContent).not.toContain('پاینده توان ساینا');
    });

    it('جستجوی کد «PTS» باید شرکت پاینده توان ساینا را فیلتر کند', () => {
      component.searchQuery = 'PTS';
      component.applyFilter();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('پاینده توان ساینا');
    });

    it('جستجوی شناسه ملی یا کد با ارقام فارسی باید به کمک normalizeDigits به درستی فیلتر کند', () => {
      component.searchQuery = '۱۰۱۰۱۲۳۴۵۶۵'; // ارقام فارسی برای 10101234565
      component.applyFilter();
      fixture.detectChanges();

      expect(component.filteredCompanies.length).toBe(1);
      expect(component.filteredCompanies[0].name).toBe('پاینده توان ساینا');

      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('پاینده توان ساینا');
    });

    it('جستجوی عبارتی که وجود ندارد باید پیام خالی بودن را در DOM نمایش دهد', () => {
      component.searchQuery = 'عبارت ناموجود ۱۲۳۴۵';
      component.applyFilter();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('هیچ شرکتی با معیارهای جستجو یافت نشد');
    });

    it('متد clearSearch باید عبارت جستجو را پاک کرده و تمام شرکت‌ها را بازگرداند', () => {
      component.searchQuery = 'فارس';
      component.applyFilter();
      fixture.detectChanges();
      expect(component.filteredCompanies.length).toBe(1);

      component.clearSearch();
      fixture.detectChanges();

      expect(component.searchQuery).toBe('');
      expect(component.filteredCompanies.length).toBe(2);
      const el: HTMLElement = fixture.nativeElement;
      const rows = el.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
    });
  });

  describe('۴. مودال ثبت شرکت و اعتبارسنجی فرم (Create Company Modal & Validation)', () => {
    it('کلیک روی دکمه «ثبت شرکت جدید» باید مودال ثبت را باز کند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const createBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('ثبت شرکت جدید')) as HTMLButtonElement;
      createBtn.click();
      fixture.detectChanges();

      expect(component.companyModal.isOpen).toBe(true);
      expect(component.companyModal.isEdit).toBe(false);

      const modalTitle = el.querySelector('h1[title]');
      expect(modalTitle?.textContent?.trim()).toContain('ثبت شرکت');
    });

    it('تلاش برای ثبت با فیلدهای خالی باید خطای اعتبارسنجی را نشان دهد و از ارسال جلوگیری کند', () => {
      component.openCreateModal();
      fixture.detectChanges();

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(component.companyModal.errors['code']).toBe('کد یکتای شرکت الزامی است.');
      expect(component.companyModal.errors['name']).toBe('نام کامل شرکت الزامی است.');
      expect(mockCompanyApi.create).not.toHaveBeenCalled();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('کد یکتای شرکت الزامی است.');
      expect(el.textContent).toContain('نام کامل شرکت الزامی است.');
    });

    it('شناسه ملی با طول غیر از ۱۱ رقم باید خطای اعتبارسنجی بدهد', () => {
      component.openCreateModal();
      component.companyModal.data.code = 'TST';
      component.companyModal.data.name = 'شرکت تستی';
      component.companyModal.data.national_id = '12345'; // کمتر از ۱۱ رقم

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(component.companyModal.errors['national_id']).toBe('شناسه ملی اشخاص حقوقی باید دقیقاً ۱۱ رقم باشد.');
      expect(mockCompanyApi.create).not.toHaveBeenCalled();
    });

    it('شناسه ملی شامل حروف باید خطای عددی بودن بدهد', () => {
      component.openCreateModal();
      component.companyModal.data.code = 'TST';
      component.companyModal.data.name = 'شرکت تستی';
      component.companyModal.data.national_id = '12345ABCDEF';

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(component.companyModal.errors['national_id']).toBe('شناسه ملی باید فقط شامل ارقام عددی باشد.');
    });

    it('شناسه ملی ۱۱ رقمی با رقم کنترلی نامعتبر باید خطای الگوریتم ثبت شرکت‌ها بدهد', () => {
      component.openCreateModal();
      component.companyModal.data.code = 'TST';
      component.companyModal.data.name = 'شرکت تستی';
      component.companyModal.data.national_id = '10100000007'; // رقم کنترلی نامعتبر

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(component.companyModal.errors['national_id']).toBe('شناسه ملی واردشده با الگوریتم کنترلی ثبت شرکت‌ها همخوانی ندارد.');
      expect(mockCompanyApi.create).not.toHaveBeenCalled();
    });

    it('فرم معتبر ثبت می‌شود و کاربر به استودیوی شرکت تازه می‌رود (A2)', async () => {
      component.openCreateModal();
      component.companyModal.data.code = 'NEW';
      component.companyModal.data.name = 'شرکت جدید آزمایشی';
      component.companyModal.data.national_id = '10320987659';
      component.companyModal.data.economic_code = '499988877766';

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(mockCompanyApi.create).toHaveBeenCalledWith(expect.objectContaining({
        code: 'NEW',
        name: 'شرکت جدید آزمایشی',
        national_id: '10320987659',
        economic_code: '499988877766'
      }));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('شرکت جدید آزمایشی'));
      await fixture.whenStable();
      // ماندن در استودیو: شرکت تازه با شناسهٔ سرور باز می‌شود تا تب‌های وابسته فعال شوند
      expect(navigateSpy).toHaveBeenCalledWith(['/app/operations/companies', 3], { queryParams: { tab: 'identity' }, replaceUrl: true });
      expect(component.viewMode).toBe('studio');
    });

    it('ثبت آفلاین (پاسخ _offlinePending) به شناسهٔ موقت نمی‌رود و استودیو در حالت صف می‌ماند (E1)', () => {
      mockCompanyApi.create.mockReturnValueOnce(of({ id: -7, _offlinePending: true }));
      component.openCreateModal();
      component.companyModal.data.code = 'OFF';
      component.companyModal.data.name = 'شرکت آفلاین';
      navigateSpy.mockClear();

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(component.isQueuedCreate).toBe(true);
      expect(component.hasUnsavedChanges()).toBe(false);
      expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('در صف ارسال'));
      // ذخیرهٔ دوباره نباید ثبت تکراری در صف بگذارد
      component.submitCompanyForm();
      expect(mockCompanyApi.create).toHaveBeenCalledTimes(1);
    });

    it('شکست لوگو پس از ثبت شرکت فایل را دور نمی‌ریزد و با state ناوبری به استودیوی تازه می‌برد', async () => {
      mockCompanyApi.uploadLogo.mockReturnValueOnce(throwError(() => ({ status: 503, error: {} })));
      component.openCreateModal();
      component.companyModal.data.code = 'LOGO';
      component.companyModal.data.name = 'شرکت لوگو';
      const file = new File(['x'], 'logo.png', { type: 'image/png' });
      component.selectedLogoFile = file;
      navigateSpy.mockClear();

      component.submitCompanyForm();
      // دکمهٔ ثبت تا ناوبری قفل است تا POST تکراری نرود
      expect(component.companyModal.isSubmitting).toBe(true);
      await fixture.whenStable();

      expect(navigateSpy).toHaveBeenCalledWith(['/app/operations/companies', 3],
        expect.objectContaining({ replaceUrl: true, state: { pendingLogo: file } }));
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('فایل نگه داشته شد'));
    });

    it('پاسخ ویرایش نوشته‌های هم‌زمان کاربر را پاک نمی‌کند و فرم تغییرکرده می‌ماند', () => {
      const pending = new Subject<any>();
      mockCompanyApi.update.mockReturnValueOnce(pending);
      component.populateStudioData(sampleCompanies[0]);
      component.companyModal.data.name = 'نام ذخیره‌شده';
      component.submitCompanyForm();
      // کاربر در فاصلهٔ ذخیره تایپ می‌کند
      component.companyModal.data.address = 'نشانی تایپ‌شده در حین ذخیره';
      pending.next({ ...sampleCompanies[0], name: 'نام ذخیره‌شده' });

      expect(component.companyModal.data.address).toBe('نشانی تایپ‌شده در حین ذخیره');
      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it('خطای فیلدی سرور در تب دیگر نشان داده می‌شود و تب نخستین خطا باز می‌شود (A18)', () => {
      mockCompanyApi.create.mockReturnValueOnce(throwError(() => ({ status: 400, error: { workshop_code: ['کد کارگاه تکراری است.'] } })));
      component.openCreateModal();
      component.companyModal.data.code = 'ERR';
      component.companyModal.data.name = 'شرکت خطادار';

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(component.companyModal.errors['workshop_code']).toBe('کد کارگاه تکراری است.');
      expect(component.activeModalTab).toBe('fiscal_insurance');
      expect(component.modalTabs.find(t => t.id === 'fiscal_insurance')?.indicator?.tone).toBe('rose');
    });
  });

  describe('ت۳. هشدار تغییرات ذخیره‌نشده (A3)', () => {
    it('بدون تغییر، خروج بدون پرسش مجاز است', async () => {
      component.populateStudioData(sampleCompanies[0]);
      expect(component.hasUnsavedChanges()).toBe(false);
      await expect(component.confirmLeave()).resolves.toBe(true);
      expect(mockConfirmDialog.open).not.toHaveBeenCalled();
    });

    it('تغییر فیلد یا فرم فرعی ثبت‌نشده پیش از خروج پرسیده می‌شود و «ماندن» خروج را لغو می‌کند', async () => {
      component.populateStudioData(sampleCompanies[0]);
      component.companyModal.data.ceo_name = 'مدیر تازه';
      expect(component.hasUnsavedChanges()).toBe(true);
      mockConfirmDialog.open.mockResolvedValueOnce(false);
      await expect(companiesLeaveGuard(component, null as any, null as any, null as any)).resolves.toBe(false);
      expect(mockConfirmDialog.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));

      component.companyModal.data.ceo_name = sampleCompanies[0].ceo_name || '';
      expect(component.hasUnsavedChanges()).toBe(false);
      component.studioSelectedUserId = 7;
      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it('فیلدهایی که تب مشارکتی روی سرور ثبت کرد (حساب اصلی) در فرم می‌آیند و تغییر ذخیره‌نشده حساب نمی‌شوند', () => {
      component.populateStudioData(sampleCompanies[0]);
      component.studioContext.applyServerFields(2, { primary_bank_name: 'شرکت دیگر' });
      expect(component.companyModal.data.primary_bank_name).not.toBe('شرکت دیگر');
      component.studioContext.applyServerFields(1, { primary_bank_name: 'بانک تجارت', primary_iban: 'IR980180000000000987654321', unknown_field: 'x' } as any);
      expect(component.companyModal.data.primary_bank_name).toBe('بانک تجارت');
      expect(component.companyModal.data.primary_iban).toBe('IR980180000000000987654321');
      expect((component.companyModal.data as any).unknown_field).toBeUndefined();
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('رویداد beforeunload با تغییر ذخیره‌نشده جلوگیری می‌شود', () => {
      component.populateStudioData(sampleCompanies[0]);
      component.companyModal.data.address = 'نشانی تازه';
      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
      component.onBeforeUnload(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('۵. ویرایش اطلاعات شرکت (Edit Company Flow)', () => {
    it('کلیک روی دکمه «استودیو» باید داده‌های شرکت را در فرم مودال لود کند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const editBtns = el.querySelectorAll('button[title="ویرایش مشخصات و مدارک شرکت"]');
      (editBtns[0] as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.companyModal.isOpen).toBe(true);
      expect(component.companyModal.isEdit).toBe(true);
      expect(component.companyModal.data.id).toBe(1);
      expect(component.companyModal.data.code).toBe('PTS');
      expect(component.companyModal.data.name).toBe('پاینده توان ساینا');
    });

    it('ارسال فرم ویرایش شده باید متد update سرویس را فراخوانی کند', () => {
      component.openEditModal(sampleCompanies[0]);
      component.companyModal.data.name = 'پاینده توان ساینا (ویرایش‌شده)';

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(mockCompanyApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'پاینده توان ساینا (ویرایش‌شده)'
      }));
      expect(mockToast.success).toHaveBeenCalled();
      // A2: پس از ویرایش کاربر در استودیو می‌ماند و فرم تمیز است
      expect(component.companyModal.isOpen).toBe(true);
      expect(component.viewMode).toBe('studio');
      expect(component.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('۶. امنیت و گارد حذف شرکت (Delete Guard & Active Projects Invariant)', () => {
    it('هسته دادهٔ پروژه‌ها (حسابداری) را پیش از حذف نمی‌سنجد؛ رد حذف با PROTECT بک‌اند است (C4)', () => {
      const companyWithProjects = sampleCompanies[0]; // projects_count: 2
      component.confirmDelete(companyWithProjects);
      fixture.detectChanges();

      expect(component.deleteModal.isOpen).toBe(true);
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('حذف شرکت بدون پروژه باید مودال تایید حذف را باز کند و با تایید حذف شود', () => {
      const companyWithoutProjects: Company = {
        id: 99,
        code: 'EMPTY',
        name: 'شرکت بدون پروژه',
        projects_count: 0,
        is_active: false
      };

      component.confirmDelete(companyWithoutProjects);
      fixture.detectChanges();

      expect(component.deleteModal.isOpen).toBe(true);
      expect(component.deleteModal.target?.id).toBe(99);

      component.executeDelete();
      fixture.detectChanges();

      expect(mockCompanyApi.delete).toHaveBeenCalledWith(99, 0); // اثرِ نشان‌داده‌شده (بی رکورد وابسته) همراه حذف می‌رود
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('شرکت «شرکت بدون پروژه» با موفقیت حذف شد.'));
      expect(component.deleteModal.isOpen).toBe(false);
    });

    describe('ت۹ و A21: smart-delete-modal با اثر حذف آبشاری', () => {
      const impactBody = {
        impact: [{ model_name: 'مدرک شرکت', count: 12 }, { model_name: 'حساب بانکی شرکت', count: 2 }],
        total_affected: 14, blocked: false, blockers: [], protected: []
      };
      let httpGet: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        httpGet = TestBed.inject(HttpClient).get as unknown as ReturnType<typeof vi.fn>;
      });

      const modalEl = () => fixture.nativeElement.querySelector('app-smart-delete-modal') as HTMLElement | null;

      it('اثر حذف از نشانی delete_impact خوانده و با رقم فارسی فهرست می‌شود؛ متن نادرست «فقط شرکت بدون رکورد وابسته» نیست', () => {
        httpGet.mockReturnValue(of(impactBody));
        component.confirmDelete(sampleCompanies[0]);
        fixture.detectChanges();
        expect(mockCompanyApi.deleteImpactUrl).toHaveBeenCalledWith(sampleCompanies[0].id);
        expect(httpGet).toHaveBeenCalledWith(`/api/org/companies/${sampleCompanies[0].id}/delete_impact/`, expect.anything());
        // اثر حذف از کش آفلاین (SWR) خوانده نمی‌شود
        const options = httpGet.mock.calls.at(-1)![1] as { context: HttpContext };
        expect(options.context.get(SKIP_OFFLINE)).toBe(true);
        const text = modalEl()!.textContent || '';
        expect(text).toContain('۱۲ رکورد از «مدرک شرکت»');
        expect(text).toContain('۱۴ رکورد');
        expect(text).not.toContain('فاقد هرگونه پروژه');
        expect(modalEl()!.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
      });

      it('شکست دریافت اثر حذف، حذف را قفل می‌کند تا «تلاش دوباره» موفق شود', () => {
        httpGet.mockReturnValue(throwError(() => ({ status: 500, error: { error: 'محاسبهٔ اثر حذف ممکن نشد.' } })));
        component.confirmDelete(sampleCompanies[0]);
        fixture.detectChanges();
        const modal = fixture.debugElement.query(By.directive(SmartDeleteModalComponent)).componentInstance as SmartDeleteModalComponent;
        modal.countdown = 0;
        modal.confirmationText = 'حذف';
        expect(modal.isHardDeleteEnabled).toBe(false);
        expect(modalEl()!.textContent).toContain('تا اثر حذف دیده نشود، حذف ممکن نیست.');

        httpGet.mockReturnValue(of(impactBody));
        const retry = Array.from(modalEl()!.querySelectorAll('button')).find(b => b.textContent?.includes('تلاش دوباره')) as HTMLButtonElement;
        retry.click();
        fixture.detectChanges();
        expect(modal.isHardDeleteEnabled).toBe(true);
      });

      it('مانع کسب‌وکاری حذف را می‌بندد و پیامش را نشان می‌دهد', () => {
        httpGet.mockReturnValue(of({ impact: [], total_affected: 0, blocked: true, blockers: ['این شرکت دارای پروژه‌های ثبت‌شده است و نمی‌توان آن را حذف کرد.'], protected: [] }));
        component.confirmDelete(sampleCompanies[0]);
        fixture.detectChanges();
        const modal = fixture.debugElement.query(By.directive(SmartDeleteModalComponent)).componentInstance as SmartDeleteModalComponent;
        modal.countdown = 0;
        modal.confirmationText = 'حذف';
        expect(modal.isHardDeleteEnabled).toBe(false);
        expect(modalEl()!.textContent).toContain('دارای پروژه‌های ثبت‌شده');
      });

      it('خطای ValidationError بک‌اند (فهرست) درون پنجره نمایش داده می‌شود و پنجره باز می‌ماند', () => {
        httpGet.mockReturnValue(of(impactBody));
        mockCompanyApi.delete.mockReturnValueOnce(throwError(() => ({ status: 400, error: ['این شرکت دارای انبارهای ثبت‌شده در سامانه است و نمی‌توان آن را حذف کرد.'] })));
        component.confirmDelete(sampleCompanies[0]);
        fixture.detectChanges();
        component.executeDelete();
        fixture.detectChanges();
        expect(mockCompanyApi.delete).toHaveBeenCalled();
        expect(component.deleteModal.isOpen).toBe(true);
        expect(modalEl()!.textContent).toContain('دارای انبارهای ثبت‌شده');
        expect(mockToast.success).not.toHaveBeenCalled();
      });

      it('«غیرفعال کردن» به‌جای حذف فقط is_active را false می‌کند و چیزی پاک نمی‌شود', () => {
        httpGet.mockReturnValue(of(impactBody));
        const active = { ...sampleCompanies[0], is_active: true };
        component.confirmDelete(active);
        fixture.detectChanges();
        const btn = Array.from(modalEl()!.querySelectorAll('button')).find(b => b.textContent?.includes('غیرفعال کردن')) as HTMLButtonElement;
        expect(btn).toBeTruthy();
        btn.click();
        fixture.detectChanges();
        expect(mockCompanyApi.patch).toHaveBeenCalledWith(active.id, { is_active: false });
        expect(mockCompanyApi.delete).not.toHaveBeenCalled();
        expect(component.deleteModal.isOpen).toBe(false);
      });

      it('حذف همان اثرِ نشان‌داده‌شده را می‌فرستد و ۴۰۹ (تغییر سوابق) اثر را دوباره می‌خواند و پنجره باز می‌ماند', () => {
        httpGet.mockReturnValue(of(impactBody));
        component.confirmDelete(sampleCompanies[0]);
        fixture.detectChanges();
        mockCompanyApi.delete.mockReturnValueOnce(throwError(() => ({ status: 409, error: { detail: 'سوابق وابسته پس از محاسبهٔ اثر حذف تغییر کرده است. اثر حذف را دوباره ببینید.' } })));
        const callsBefore = httpGet.mock.calls.length;
        component.executeDelete();
        fixture.detectChanges();
        expect(mockCompanyApi.delete).toHaveBeenCalledWith(sampleCompanies[0].id, 14);
        expect(httpGet.mock.calls.length).toBe(callsBefore + 1);
        expect(component.deleteModal.isOpen).toBe(true);
        expect(modalEl()!.textContent).toContain('سوابق وابسته پس از محاسبهٔ اثر حذف تغییر کرده است');
        expect(mockToast.success).not.toHaveBeenCalled();
      });

      it('شرکت غیرفعال پیشنهاد «غیرفعال کردن» ندارد', () => {
        httpGet.mockReturnValue(of(impactBody));
        component.confirmDelete({ ...sampleCompanies[0], is_active: false });
        fixture.detectChanges();
        expect(Array.from(modalEl()!.querySelectorAll('button')).some(b => b.textContent?.includes('غیرفعال کردن'))).toBe(false);
      });
    });
  });

  describe('۷. استودیوی مودال ۵ تبی و مدیریت اسناد حقوقی (5-Tab Studio & Document Management)', () => {
    it('باز کردن مودال شرکت باید به طور پیش‌فرض روی تب هویتی تنظیم شود و تغییر تب کار کند', () => {
      component.openCreateModal();
      fixture.detectChanges();

      expect(component.companyModal.isOpen).toBe(true);
      expect(component.activeModalTab).toBe('identity');

      // جابجایی بین تب‌های ۵گانه
      component.setModalTab('documents');
      expect(component.activeModalTab).toBe('documents');

      component.setModalTab('governance');
      expect(component.activeModalTab).toBe('governance');

      component.setModalTab('fiscal_insurance');
      expect(component.activeModalTab).toBe('fiscal_insurance');

      component.setModalTab('treasury');
      expect(component.activeModalTab).toBe('treasury');
    });

    it('باز کردن استودیوی شرکت، بخش بایگانی ماژول را می‌سازد و شمارندهٔ تب مدارک از آن می‌آید', async () => {
      mockCompanyApi.getDocuments.mockReturnValue(of([
        { id: 1, title: 'اساسنامه ثبتی', document_type: 'articles_of_association', file_url: '/media/test.pdf' }
      ]));

      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();
      await flushLazy(fixture);

      expect(mockCompanyApi.getDocuments).toHaveBeenCalledWith({ company_id: 1 });
      expect(component.modalTabs.find(t => t.id === 'documents')?.count).toBe(1);
    });

    it('ستون وضعیت مدارک باید بر اساس documents_health_status برچسب مناسب نمایش دهد', () => {
      const companiesWithHealth: Company[] = [
        {
          ...sampleCompanies[0],
          documents_health_status: 'valid',
          documents_count: 5
        },
        {
          ...sampleCompanies[1],
          documents_health_status: 'expiring_soon',
          documents_count: 2
        }
      ];

      component.companies = companiesWithHealth;
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const htmlText = el.textContent || '';
      // بررسی وجود نشانگرهای سلامت مدارک در رندر DOM
      expect(htmlText).toContain('پاینده توان ساینا');
      expect(htmlText).toContain('فارس عالیش');
    });
  });

  describe('۹. انتخابگر تقویم شمسی جلالی (Jalali Shamsi Datepicker Integration)', () => {
    it('متد onRegDateSelect باید تاریخ ثبت شرکت را با تاریخ جلالی به‌روز کند', () => {
      component.openCreateModal();
      component.onRegDateSelect('1402/05/18');
      expect(component.companyModal.data.registration_date).toBe('1402/05/18');
    });

    it('متد onBoardExpiryDateSelect باید تاریخ اتمام دوره هیئت‌مدیره را تنظیم کند', () => {
      component.openCreateModal();
      component.onBoardExpiryDateSelect('1405/08/30');
      expect(component.companyModal.data.board_term_expiry).toBe('1405/08/30');
    });
  });

  describe('۱۰. پیش‌نمایش درجا (In-Place Lightbox Preview) و فیلتر اسناد', () => {
    // پیش‌نمایش سند مادر (اساسنامه) در لایت‌باکس مشترک
    const openCoreDoc = (doc: any) => {
      component.companyModal.data.articles_of_association = doc.file_url;
      component.openCoreDocPreview('articles_of_association', doc.title);
    };

    it('پیش‌نمایش سند مادر برای فایل‌های PDF پرچم isPdf را true کند و عنوان مدرک را ست کند', () => {
      const doc = {
        id: 1,
        company: 1,
        title: 'اساسنامه رسمی',
        document_type: 'articles_of_association',
        file: '/media/documents/sample.pdf',
        file_url: '/media/documents/sample.pdf'
      } as any;

      openCoreDoc(doc);
      expect(component.docPreview!.previewModal.isOpen).toBe(true);
      expect(component.docPreview!.previewModal.title).toBe('اساسنامه رسمی');
      expect(component.docPreview!.previewModal.isPdf).toBe(true);

      component.docPreview!.closePreview();
      expect(component.docPreview!.previewModal.isOpen).toBe(false);
    });

    it('پیش‌نمایش سند مادر برای فایل‌های تصویری (png, jpg) باید isPdf را false کند', () => {
      const doc = {
        id: 2,
        company: 1,
        title: 'تصویر روزنامه رسمی',
        document_type: 'official_gazette',
        file: '/media/documents/sample.jpg',
        file_url: '/media/documents/sample.jpg'
      } as any;

      openCoreDoc(doc);
      expect(component.docPreview!.previewModal.isOpen).toBe(true);
      expect(component.docPreview!.previewModal.isPdf).toBe(false);
      expect(component.docPreview!.previewModal.isImage).toBe(true);
    });

    it('پاپ‌آپ پیش‌نمایش باید در DOM با z-index بالاتر از مودال استودیو (کلاس z-[70]) رندر شود', () => {
      component.companyModal.isOpen = true;
      fixture.detectChanges();

      const doc = {
        id: 3,
        company: 1,
        title: 'اساسنامه رسمی شرکت',
        document_type: 'articles_of_association',
        file: '/media/documents/statute.pdf',
        file_url: '/media/documents/statute.pdf'
      } as any;
      openCoreDoc(doc);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const previewEl = el.querySelector('div.fixed.z-\\[70\\]') as HTMLElement;
      expect(previewEl).not.toBeNull();
      expect(previewEl.textContent).toContain('اساسنامه رسمی شرکت');

      const canvas = previewEl.querySelector('canvas#pdf-render-canvas');
      expect(canvas).not.toBeNull();
    });

    it('فشردن کلید Escape باید لایت‌باکس پیش‌نمایش باز را فوراً ببندد', () => {
      const doc = {
        id: 1,
        company: 1,
        title: 'اساسنامه رسمی',
        document_type: 'articles_of_association',
        file: '/media/documents/sample.pdf',
        file_url: '/media/documents/sample.pdf'
      } as any;
      openCoreDoc(doc);
      expect(component.docPreview!.previewModal.isOpen).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.docPreview!.previewModal.isOpen).toBe(false);
    });
  });

  describe('۱۱. آزمون جامع تعاملی DOM: ثبت شرکت جدید، تمامی دکمه‌ها و انتخابگر تاریخ', () => {
    it('باید ثبت شرکت جدید از طریق تعامل کامل با فرم و دکمه‌های DOM همراه با انتخابگر تقویم شمسی جلالی انجام شود', () => {
      const el: HTMLElement = fixture.nativeElement;

      // ۱. کلیک روی دکمه «ثبت شرکت جدید» در DOM
      const createBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('ثبت شرکت جدید')) as HTMLButtonElement;
      expect(createBtn).not.toBeNull();
      createBtn.click();
      fixture.detectChanges();

      expect(component.companyModal.isOpen).toBe(true);
      expect(component.companyModal.isEdit).toBe(false);

      // ۲. مقداردهی فیلدهای هویتی شرکت
      component.companyModal.data.code = 'SAINA';
      component.companyModal.data.name = 'شرکت ساینا پرداز پیشرو';
      component.companyModal.data.national_id = '14009876545';
      component.companyModal.data.economic_code = '411122233344';
      component.companyModal.data.registration_number = '54321';
      component.companyModal.data.company_type = 'private_joint_stock';
      component.companyModal.data.ceo_name = 'دکتر مهندس پاینده';
      component.companyModal.data.phone = '02188776655';

      // ۳. تست دکمه تقویم تاریخ ثبت شرکت (جلالی)
      const dateButtons = el.querySelectorAll('button[title="انتخاب از تقویم شمسی"]');
      expect(dateButtons.length).toBeGreaterThanOrEqual(1);

      const regDateBtn = dateButtons[0] as HTMLButtonElement;
      regDateBtn.click();
      fixture.detectChanges();
      expect(component.isRegDatePickerOpen).toBe(true);

      // انتخاب تاریخ شمسی
      component.onRegDateSelect('1403/04/10');
      fixture.detectChanges();
      expect(component.isRegDatePickerOpen).toBe(false);
      expect(component.companyModal.data.registration_date).toBe('1403/04/10');
      expect(component.regDateControl.value).toBe('1403/04/10');

      // تایپ مستقیم در کنترل تاریخ ثبت شرکت
      component.regDateControl.setValue('1405/12/25');
      fixture.detectChanges();
      expect(component.companyModal.data.registration_date).toBe('1405/12/25');

      // ۴. تست انتخابگر تاریخ پایان تصدی هیئت‌مدیره
      component.setModalTab('governance');
      fixture.detectChanges();

      component.isBoardDatePickerOpen = true;
      fixture.detectChanges();
      component.onBoardExpiryDateSelect('1405/04/10');
      fixture.detectChanges();
      expect(component.isBoardDatePickerOpen).toBe(false);
      expect(component.companyModal.data.board_term_expiry).toBe('1405/04/10');

      // ۵. کلیک روی دکمه «ثبت شرکت» در استودیو
      const submitBtn = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('ثبت شرکت')) as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();
      submitBtn.click();
      fixture.detectChanges();

      // بررسی فراخوانی وب‌سرویس ایجاد شرکت با تاریخ‌ها و مقادیر صحیح
      expect(mockCompanyApi.create).toHaveBeenCalled();
      const createPayload = mockCompanyApi.create.mock.calls[0][0];
      expect(createPayload.code).toBe('SAINA');
      expect(createPayload.name).toBe('شرکت ساینا پرداز پیشرو');
      expect(createPayload.registration_date).toBe('1405/12/25');
      expect(createPayload.board_term_expiry).toBe('1405/04/10');

      expect(mockToast.success).toHaveBeenCalledWith('شرکت «شرکت ساینا پرداز پیشرو» با موفقیت ثبت شد.');
      expect(component.companyModal.isOpen).toBe(true);
    });

    it('تست تعاملی تمامی دکمه‌های هدر، فیلترها و سطرهای جدول شرکت‌ها در DOM', async () => {
      const el: HTMLElement = fixture.nativeElement;

      // ۱. دکمه خروجی اکسل در هدر
      const excelBtn = el.querySelector('button[title="خروجی اکسل شرکت‌ها"]') as HTMLButtonElement;
      expect(excelBtn).not.toBeNull();
      excelBtn.click();
      expect(mockCompanyApi.exportExcel).toHaveBeenCalled();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('فایل اکسل با موفقیت دانلود شد.');

      // ۲. دکمهٔ «ورود از اکسل» که کار نمی‌کرد حذف شده است (ت۵)
      expect(el.querySelector('button[title="ورود اطلاعات از اکسل"]')).toBeNull();

      // ۳. دکمه رفرش / به‌روزرسانی داده‌ها در هدر
      const refreshBtn = el.querySelector('button[title="به‌روزرسانی داده‌ها"]') as HTMLButtonElement;
      expect(refreshBtn).not.toBeNull();
      refreshBtn.click();
      expect(mockCompanyApi.getAll).toHaveBeenCalled();

      // ۴. دکمه‌های سطر اول جدول: استودیو، دسترسی‌ها و حذف
      const firstRow = el.querySelector('tbody tr');
      expect(firstRow).not.toBeNull();

      const studioBtn = Array.from(firstRow!.querySelectorAll('button')).find(b => b.textContent?.includes('استودیو')) as HTMLButtonElement;
      expect(studioBtn).not.toBeNull();
      navigateSpy.mockClear();
      studioBtn.click();
      // یک ناوبری با تب مقصد (A1)؛ نمونهٔ مسیر استودیو داده را خودش می‌گیرد
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(['/app/operations/companies', 1], { queryParams: { tab: 'identity' } });
      fixture.detectChanges();
      expect(component.companyModal.isOpen).toBe(true);
      expect(component.companyModal.isEdit).toBe(true);

      // ۵. تست کلیک روی تک‌تک ساب‌تب‌های استودیو در DOM
      const subtabButtons = Array.from(el.querySelectorAll('.bg-slate-100\\/90 button'));
      expect(subtabButtons.length).toBeGreaterThanOrEqual(6);

      // ساب‌تب بایگانی مدارک
      const docsTabBtn = subtabButtons.find(b => b.textContent?.includes('بایگانی مدارک')) as HTMLButtonElement;
      docsTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('documents');

      // ساب‌تب هیئت‌مدیره
      const boardTabBtn = subtabButtons.find(b => b.textContent?.includes('هیئت‌مدیره')) as HTMLButtonElement;
      boardTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('governance');

      // ساب‌تب کارگاه بیمه و مالیات (بیمه و مودیان)
      const insuranceTabBtn = subtabButtons.find(b => b.textContent?.includes('بیمه') || b.textContent?.includes('مودیان')) as HTMLButtonElement;
      expect(insuranceTabBtn).toBeDefined();
      insuranceTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('fiscal_insurance');

      // ساب‌تب حساب‌های بانکی (بانک و شبا)
      const banksTabBtn = subtabButtons.find(b => b.textContent?.includes('بانک') || b.textContent?.includes('شبا')) as HTMLButtonElement;
      expect(banksTabBtn).toBeDefined();
      banksTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('treasury');

      // ساب‌تب دسترسی کاربران
      const accessTabBtn = subtabButtons.find(b => b.textContent?.includes('دسترسی کاربران')) as HTMLButtonElement;
      accessTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('access');

      // بازگشت به ساب‌تب هویتی
      const identityTabBtn = subtabButtons.find(b => b.textContent?.includes('هویتی و ثبتی')) as HTMLButtonElement;
      identityTabBtn?.click();
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('identity');

      // بستن مودال استودیو با دکمه ✕ یا دکمه بازگشت به فهرست
      const closeStudioBtn = el.querySelector('button[aria-label="بازگشت به فهرست"]') as HTMLButtonElement;
      closeStudioBtn.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.companyModal.isOpen).toBe(false);
      expect(component.viewMode).toBe('list');

      // با بسته شدن استودیو و بازگشت به لیست، DOM جدول مجدداً رندر می‌شود
      const updatedFirstRow = el.querySelector('tbody tr') as HTMLTableRowElement;
      expect(updatedFirstRow).not.toBeNull();

      // ۶. دکمه «دسترسی‌ها» در سطر جدول به تب «دسترسی» استودیو می‌رود (ت۴؛ مودال جداگانه حذف شد)
      const accessModalBtn = Array.from(updatedFirstRow.querySelectorAll('button')).find(b => b.textContent?.includes('دسترسی‌ها')) as HTMLButtonElement;
      expect(accessModalBtn).not.toBeNull();
      navigateSpy.mockClear();
      accessModalBtn.click();
      expect(navigateSpy).toHaveBeenCalledWith(['/app/operations/companies', 1], { queryParams: { tab: 'access' } });
      component.closeCompanyModal();
      await fixture.whenStable();
      fixture.detectChanges();
      const listRow = el.querySelector('tbody tr') as HTMLTableRowElement;

      // ۷. تست دکمه «حذف» در سطر جدول: مودال تأیید باز می‌شود (بررسی پروژه‌ها با بک‌اند است، C4)
      const deleteRowBtn = Array.from(listRow.querySelectorAll('button')).find(b => b.textContent?.includes('حذف')) as HTMLButtonElement;
      expect(deleteRowBtn).not.toBeNull();
      deleteRowBtn.click();
      fixture.detectChanges();
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(component.deleteModal.isOpen).toBe(true);

      // کلیک انصراف از حذف
      const cancelDeleteBtn = (el.querySelector('.fixed.inset-0 button[aria-label="انصراف"]') || 
        Array.from(el.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent?.includes('انصراف') || b.getAttribute('aria-label') === 'انصراف' || b.getAttribute('title')?.includes('انصراف'))) as HTMLButtonElement;
      if (cancelDeleteBtn) {
        cancelDeleteBtn.click();
      } else {
        component.closeDeleteModal();
      }
      fixture.detectChanges();
      expect(component.deleteModal.isOpen).toBe(false);

      // تست تایید حذف
      deleteRowBtn.click();
      fixture.detectChanges();
      component.executeDelete();
      expect(mockCompanyApi.delete).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت حذف شد.'));
    });
  });

  describe('۱۲. چکسام شناسهٔ ملی شرکت', () => {
    it('باید متد isNationalIdChecksumValid الگوریتم رسمی چکسام ۱۱ رقمی شناسه ملی اشخاص حقوقی را دقیق بسنجد', () => {
      // تست با رشته خالی یا کمتر از ۱۱ رقم
      expect(component.isNationalIdChecksumValid('')).toBe(true);
      expect(component.isNationalIdChecksumValid('123')).toBe(false);

      // محاسبه نمونه شناسه ملی معتبر بر اساس فرمول:
      // شناسه ملی فرضی با کنترلر محاسبه شده
      const sample = '1010000000'; // 10 رقم اول
      // ضریب‌ها: 29, 27, 23, 19, 17, 29, 27, 23, 19, 17
      // رقم دهم = 0 -> دهگان = 2
      // sum = (1+2)*29 + (0+2)*27 + (1+2)*23 + (0+2)*19 + (0+2)*17 + 2*29 + 2*27 + 2*23 + 2*19 + 2*17
      // = 87 + 54 + 69 + 38 + 34 + 58 + 54 + 46 + 38 + 34 = 512
      // 512 % 11 = 6 -> رقم ۱۱ باید 6 باشد.
      expect(component.isNationalIdChecksumValid('10100000006')).toBe(true);
      expect(component.isNationalIdChecksumValid('10100000007')).toBe(false);
    });
  });

  describe('۱۳. آزمون‌های بلادرنگ، وب‌سوکت و به‌روزرسانی درجا بدون نیاز به خروج (Realtime, WebSocket & In-Place Updates)', () => {
    beforeEach(() => {
      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();
    });

    it('افزودن دسترسی کاربر در استودیو باید بلافاصله ردیف دسترسی را در studioAccesses درج کند', () => {
      component.systemUsers = [
        { id: 10, username: 'testuser', first_name: 'کاربر', last_name: 'آزمایشی' } as any
      ];
      component.studioSelectedUserId = 10;
      component.studioAccessLevel = 'docs_write';
      component.studioRoleInCompany = 'مسئول بایگانی';

      mockCompanyApi.createUserAccess.mockReturnValue(of({
        id: 55,
        user: 10,
        company: 1,
        access_level: 'docs_write',
        role_in_company: 'مسئول بایگانی',
        is_default: false
      }));

      component.addStudioAccess();
      fixture.detectChanges();

      expect(component.studioAccesses.some(a => a.id === 55)).toBe(true);
      const added = component.studioAccesses.find(a => a.id === 55);
      expect(added?.username).toBe('testuser');
      expect(added?.user_full_name).toBe('کاربر آزمایشی');
      expect(mockToast.success).toHaveBeenCalledWith('دسترسی کاربر با موفقیت ثبت شد.');
    });

    it('لغو دسترسی کاربر در استودیو باید بلافاصله ردیف را از studioAccesses خارج کند', async () => {
      component.studioAccesses = [
        { id: 55, user: 10, company: 1, access_level: 'docs_write', is_default: false }
      ];

      await component.removeStudioAccess(55);
      fixture.detectChanges();

      expect(component.studioAccesses.some(a => a.id === 55)).toBe(false);
      expect(mockToast.success).toHaveBeenCalledWith('دسترسی کاربر با موفقیت لغو شد.');
    });

    it('اعلان وب‌سوکت org_structure_updated از سایر کلاینت‌ها باید داده‌های شرکت را رفرش کند', () => {
      const spyLoadAccess = vi.spyOn(component, 'loadStudioAccesses');

      // شبیه‌سازی دریافت پیام وب‌سوکت از کلاینت دیگر
      mockWebSocket.notifications$.next({
        type_str: 'org_structure_updated',
        entity_type: 'company_access',
        company_id: 1,
        client_tab_id: 'other-client-tab-id'
      });

      expect(spyLoadAccess).toHaveBeenCalledWith(1);
    });

    it('اعلان وب‌سوکت با شناسه تب جاری (Echo Filter) باید نادیده گرفته شود تا از پرش‌های بیهوده جلوگیری گردد', () => {
      const spyLoadAccess = vi.spyOn(component, 'loadStudioAccesses');

      // ارسال پیام با همان tabId کامپوننت
      mockWebSocket.notifications$.next({
        type_str: 'org_structure_updated',
        entity_type: 'company_access',
        company_id: 1,
        client_tab_id: 'test-client-tab-id' // مساوی با tabId موک
      });

      expect(spyLoadAccess).not.toHaveBeenCalled();
    });

    it('نشانگر وضعیت اتصال شبکه (Online / Offline) باید در DOM هدر نمایش داده شود', async () => {
      // بستن استودیو جهت بازگشت به نمای فهرست و نمایش هدر نوار فرمان
      component.closeCompanyModal();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.viewMode).toBe('list');

      const el: HTMLElement = fixture.nativeElement;
      // پیش‌فرض آنلاین است
      expect(component.isOnline).toBe(true);
      const onlineBadge = el.querySelector('.bg-emerald-50.text-emerald-700');
      expect(onlineBadge).not.toBeNull();
      expect(onlineBadge?.textContent).toContain('برخط');

      // تغییر به آفلاین
      component.isOnline = false;
      (component as any).cdr.detectChanges();
      fixture.detectChanges();

      const offlineBadge = el.querySelector('.bg-amber-50.text-amber-700');
      expect(offlineBadge).not.toBeNull();
      expect(offlineBadge?.textContent).toContain('آفلاین');
    });
  });

  describe('E6. نوع موجودیت صف برای موجودیت‌های پلتفرم بدون وابستگی به ماژول حسابداری', () => {
    it('شرکت و دسترسی کاربر نوع دارند و الگوی دقیق‌تر ماژول مقدم می‌ماند', () => {
      expect(resolveEntityTypeFromUrl('/api/org/companies/2/')).toBe('company');
      expect(resolveEntityTypeFromUrl('/api/org/user-company-access/9/')).toBe('user_company_access');
      expect(resolveEntityTypeFromUrl('/api/items/3/')).not.toBe('company');
      expect(resolveEntityTypeFromUrl('')).toBeUndefined();
    });
  });

  describe('گام ۵. چیدمان موبایل هسته (ت۶، ت۷، A20، A23، A24، B3)', () => {
    it('ت۶: هدر استودیو یک ذخیره و یک بازگشت دارد و فوتر تکراری حذف شده است؛ پنل تب به تب خودش وصل است', () => {
      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelectorAll('button[appAction="save"]').length).toBe(1);
      expect(el.querySelectorAll('button[aria-label="بازگشت به فهرست"]').length).toBe(1);
      expect(el.querySelector('button[aria-label="انصراف و بازگشت"]')).toBeNull();
      expect(el.querySelector('h1[title]')?.textContent?.trim()).toBe(sampleCompanies[0].name);
      const panel = el.querySelector('[role="tabpanel"]#co-studio-panel-identity');
      expect(panel?.getAttribute('aria-labelledby')).toBe('co-studio-tab-identity');
      expect(el.querySelector('#co-studio-tab-identity')?.getAttribute('aria-controls')).toBe('co-studio-panel-identity');
    });

    it('A20: سرمایهٔ ثبتی با جداکنندهٔ فارسی نمایش داده و عدد در مدل ذخیره می‌شود؛ ورودی غیرعددی مدل را خراب نمی‌کند', () => {
      component.openCreateModal();
      component.setModalTab('identity');
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('#co_registered_capital') as HTMLInputElement;
      input.value = '۱۲۳۴۵۶7';
      input.dispatchEvent(new Event('input'));
      expect(component.companyModal.data.registered_capital).toBe(1234567);
      expect(input.value).toBe(new Intl.NumberFormat('fa-IR').format(1234567));
      input.value = input.value + 'abc';
      input.dispatchEvent(new Event('input'));
      expect(component.companyModal.data.registered_capital).toBe(1234567);
      input.value = '';
      input.dispatchEvent(new Event('input'));
      expect(component.companyModal.data.registered_capital).toBeNull();
    });

    it('A23: combobox کاربران جستجوپذیر است، کاربر دارای دسترسی را نشان نمی‌دهد و با صفحه‌کلید انتخاب می‌شود', () => {
      mockAccountsHttp.getUsers.mockReturnValue(of([
        { id: 10, username: 'ali', first_name: 'علي', last_name: 'رضایی' },
        { id: 11, username: 'sara', first_name: 'سارا', last_name: 'کریمی' },
        { id: 12, username: 'reza', first_name: 'رضا', last_name: 'محمدی' },
      ]));
      component.openEditModal(sampleCompanies[0]);
      component.studioAccesses = [{ id: 1, user: 12, company: 1, access_level: 'docs_read', is_default: false }];
      component.setModalTab('access');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const combo = el.querySelector('#studio_user_combo') as HTMLInputElement;
      combo.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      let options = Array.from(el.querySelectorAll('[role="option"]'));
      expect(options.map(o => o.textContent)).toHaveLength(2);
      expect(options.some(o => o.textContent?.includes('reza'))).toBe(false);

      // «ي» عربی در داده با «ی» فارسی در جستجو یکسان است
      combo.value = 'علی';
      combo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      options = Array.from(el.querySelectorAll('[role="option"]'));
      expect(options).toHaveLength(1);

      combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      fixture.detectChanges();
      expect(combo.getAttribute('aria-activedescendant')).toBe('studio_user_opt_0');
      combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      expect(component.studioSelectedUserId).toBe(10);
      expect(component.isUserListOpen).toBe(false);

      // نوشتن دوباره انتخاب را باطل می‌کند
      combo.value = 'سا';
      combo.dispatchEvent(new Event('input'));
      expect(component.studioSelectedUserId).toBeNull();
    });

    it('A23: شکست دریافت کاربران پیام خطا و «تلاش دوباره» دارد، نه انتظار بی‌پایان', () => {
      mockAccountsHttp.getUsers.mockReturnValue(throwError(() => ({ status: 500 })));
      component.openEditModal(sampleCompanies[0]);
      component.setModalTab('access');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const combo = el.querySelector('#studio_user_combo') as HTMLInputElement;
      combo.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      const alert = el.querySelector('[role="alert"] button[aria-label="تلاش دوباره"]') as HTMLButtonElement;
      expect(alert).not.toBeNull();
      expect(el.textContent).not.toContain('در حال دریافت کاربران');
      mockAccountsHttp.getUsers.mockReturnValueOnce(of([{ id: 11, username: 'sara', first_name: 'سارا', last_name: 'کریمی' }]));
      alert.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('[role="option"]')).toHaveLength(1);
    });

    it('A20: ویرایش وسط عدد نشانگر را به انتها نمی‌برد', () => {
      component.openCreateModal();
      component.setModalTab('identity');
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('#co_shares_count') as HTMLInputElement;
      input.focus();
      input.value = '1234';
      input.setSelectionRange(2, 2);
      input.dispatchEvent(new Event('input'));
      // «۱٬۲۳۴»: پس از دو رقم نخست، نشانگر پس از «۲» (جایگاه ۳) می‌ماند
      expect(input.value).toBe(new Intl.NumberFormat('fa-IR').format(1234));
      expect(input.selectionStart).toBe(3);
    });

    it('B3 و A24: دسترسی‌ها در موبایل کارت دارند و تاریخ انتساب شمسی نمایش داده می‌شود', () => {
      component.openEditModal(sampleCompanies[0]);
      component.studioAccesses = [{ id: 1, user: 12, company: 1, access_level: 'docs_read', is_default: true, username: 'reza', user_full_name: 'رضا محمدی', created_at: '2026-10-21T08:00:00Z' } as any];
      component.setModalTab('access');
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const card = el.querySelector('ul.xl\\:hidden li') as HTMLElement;
      expect(card).not.toBeNull();
      expect(card.textContent).toContain('رضا محمدی');
      expect(card.textContent).not.toContain('2026-10-21');
      expect(card.textContent).toContain('۱۴۰۵');
      expect(card.querySelector('button[aria-label="لغو دسترسی"]')).not.toBeNull();
    });
  });

  describe('۱۳. ایزولاسیون کامل تک‌ماژول (Single-Module Zero-Trace Isolation - T2.5)', () => {
    it('در حالت فقط مالی (accounting-only): ستون سامانه انبار و چک‌باکس مودال شرکت باید پنهان باشند و tableColspan برابر ۱۰ باشد', () => {
      const registry = TestBed.inject(ModuleRegistryService);
      registry.setInstalledModules(['platform', 'accounting']);
      fixture.detectChanges();

      expect(component.isWarehouseInstalled).toBe(false);
      expect(component.tableColspan).toBe(10);

      const el: HTMLElement = fixture.nativeElement;
      const headers = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
      expect(headers).not.toContain('سامانه انبار');

      // باز کردن مودال ثبت شرکت
      component.openCreateModal();
      fixture.detectChanges();

      const whCheckbox = el.querySelector('#co_has_warehouse');
      expect(whCheckbox).toBeNull();
      // پیش‌فرض فرم همچنان دست‌نخورده true می‌ماند طبق قاعده ۱
      expect(component.companyModal.data.has_warehouse_module).toBe(true);
    });

    it('در حالت فقط انبار یا فول‌سوییت: ستون سامانه انبار و چک‌باکس مودال باید در DOM رندر شوند و tableColspan برابر ۱۱ باشد', () => {
      const registry = TestBed.inject(ModuleRegistryService);
      registry.setInstalledModules(['platform', 'warehouse', 'accounting']);
      fixture.detectChanges();

      expect(component.isWarehouseInstalled).toBe(true);
      expect(component.tableColspan).toBe(11);

      const el: HTMLElement = fixture.nativeElement;
      const headers = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
      expect(headers).toContain('سامانه انبار');

      // باز کردن مودال ثبت شرکت
      component.openCreateModal();
      fixture.detectChanges();

      const whCheckbox = el.querySelector('#co_has_warehouse');
      expect(whCheckbox).not.toBeNull();
      expect(component.companyModal.data.has_warehouse_module).toBe(true);
    });
  });

  describe('۱۴. آزمون‌های فاز ۵: ارزش اسمی سهام، ورودی‌های بیمه کارگاه و مدیریت دوره‌های مالی رسمی', () => {
    it('ورودی ارزش اسمی هر سهم (share_nominal_value) باید در تب مشخصات هویتی رندر شود و به مدل بایند گردد', () => {
      component.openCreateModal();
      component.setModalTab('identity');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const nominalInput = el.querySelector('input[placeholder="مثال: ۱۰٬۰۰۰"]') as HTMLInputElement;
      expect(nominalInput).not.toBeNull();

      component.companyModal.data.share_nominal_value = 10000;
      fixture.detectChanges();
      expect(component.companyModal.data.share_nominal_value).toBe(10000);
    });

    it('ورودی‌های تکمیلی تأمین اجتماعی (کد و نام شعبه، ردیف پیمان، نام کارفرما) باید در تب ۲ رندر شوند', () => {
      component.openCreateModal();
      component.setModalTab('fiscal_insurance');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const branchCodeInput = el.querySelector('input[placeholder="22"]') as HTMLInputElement;
      const branchNameInput = el.querySelector('input[placeholder="مثال: شعبه ۲ شیراز"]') as HTMLInputElement;
      const contractRowInput = el.querySelector('input[placeholder="000"]') as HTMLInputElement;
      const employerNameInput = el.querySelector('input[placeholder="نام مدیرعامل یا شرکت در دیسکت"]') as HTMLInputElement;

      expect(branchCodeInput).not.toBeNull();
      expect(branchNameInput).not.toBeNull();
      expect(contractRowInput).not.toBeNull();
      expect(employerNameInput).not.toBeNull();

      component.companyModal.data.social_security_branch_code = '22';
      component.companyModal.data.social_security_branch_name = 'شعبه ۲ شیراز';
      component.companyModal.data.contract_row = '000';
      component.companyModal.data.employer_name = 'شرکت پاینده توان ساینا';
      fixture.detectChanges();

      expect(component.companyModal.data.social_security_branch_code).toBe('22');
      expect(component.companyModal.data.social_security_branch_name).toBe('شعبه ۲ شیراز');
      expect(component.companyModal.data.contract_row).toBe('000');
      expect(component.companyModal.data.employer_name).toBe('شرکت پاینده توان ساینا');
    });
  });

  describe('۱۴. قرارداد تب‌ها و بخش‌های مشارکتی استودیو (§۵-۱، §۵-۲، §۵-۴)', () => {
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    let tabLoader: ReturnType<typeof vi.fn>;
    let savedTabLoader: ReturnType<typeof vi.fn>;
    let sectionLoader: ReturnType<typeof vi.fn>;
    let cellLoader: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      tabLoader = vi.fn().mockResolvedValue(TestContribTabComponent);
      savedTabLoader = vi.fn().mockResolvedValue(TestContribTabComponent);
      sectionLoader = vi.fn().mockResolvedValue(TestContribSectionComponent);
      cellLoader = vi.fn().mockResolvedValue(TestContribCellComponent);
      const registry = TestBed.inject(ModuleRegistryService);
      vi.spyOn(registry, 'getExtensions').mockImplementation(((point: string) => point === 'companies' ? [{
        moduleCode: 'test-mod',
        extension: {
          studioTabs: [
            { id: 'saved_only', labelFa: 'فقط ذخیره‌شده', shortLabelFa: 'ذخیره', icon: 'cloud', order: 70, requiresSavedCompany: true, hiddenUntilSaved: true, loadComponent: savedTabLoader },
            { id: 'x_tab', labelFa: 'تب آزمایشی', shortLabelFa: 'آزمایشی', icon: 'database', order: 30, requiresSavedCompany: false, loadComponent: tabLoader },
            { id: 'identity', labelFa: 'هم‌نام هسته', shortLabelFa: 'هم‌نام', icon: 'x', order: 1, requiresSavedCompany: false, loadComponent: tabLoader }
          ],
          studioSections: [{ slot: 'documents', order: 10, loadComponent: sectionLoader }],
          listCells: [{ id: 'x_cell', labelFa: 'ستون آزمایشی', order: 10, cardPlacement: 'grid', loadComponent: cellLoader }],
          rowActions: [{ id: 'x_action', labelFa: 'اقدام آزمایشی', icon: 'cloud', tab: 'x_tab' }]
        }
      }] : []) as any);
    });

    // ModuleRegistryService تکین است؛ جاسوس getExtensions نباید به آزمون بعدی (و beforeEach بیرونی آن) برسد
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('تب مشارکتی به ترتیب order میان تب‌های هسته می‌نشیند و تب هم‌نام هسته نادیده گرفته می‌شود', () => {
      component.setupStudioForNew();
      expect(component.modalTabs.map(t => t.id)).toEqual(['identity', 'fiscal_insurance', 'x_tab', 'documents', 'access']);
      expect(component.modalTabs.find(t => t.id === 'identity')?.label).toBe('مشخصات هویتی و ثبتی');
    });

    it('تب hiddenUntilSaved پیش از ذخیره پنهان است و پس از باز شدن شرکت ذخیره‌شده دیده می‌شود', () => {
      component.setupStudioForNew();
      expect(component.modalTabs.some(t => t.id === 'saved_only')).toBe(false);
      component.setModalTab('saved_only');
      expect(component.activeModalTab).toBe('identity');

      component.setupStudioForCompany(1);
      expect(component.studioContext.companyId()).toBe(1);
      expect(component.modalTabs.map(t => t.id).at(-1)).toBe('saved_only');
      component.setModalTab('saved_only');
      expect(component.activeModalTab).toBe('saved_only');
    });

    it('شناسهٔ تب مشارکتی در query پذیرفته می‌شود و شناسهٔ ناشناخته به تب هویتی برمی‌گردد', async () => {
      const router = TestBed.inject(Router);
      component.setupStudioForCompany(1);
      await router.navigateByUrl('/app/operations/companies?tab=x_tab');
      expect(component.activeModalTab).toBe('x_tab');
      await router.navigateByUrl('/app/operations/companies?tab=no_such_tab');
      expect(component.activeModalTab).toBe('identity');
    });

    it('کامپوننت تب تنبل بارگذاری و با companyId رندر می‌شود؛ شمارنده و خطای context روی تب می‌آید', async () => {
      component.setupStudioForCompany(1);
      component.setModalTab('x_tab');
      fixture.detectChanges();
      expect(tabLoader).toHaveBeenCalledTimes(1);
      await flush();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      // همهٔ تب‌های مشارکتی در دسترس یک بار ساخته و با hidden نگه داشته می‌شوند؛ فقط تب فعال دیده می‌شود
      expect(savedTabLoader).toHaveBeenCalledTimes(1);
      const panels = Array.from(el.querySelectorAll('.contrib-tab')).map(p => p.closest('[hidden]') === null);
      expect(panels.filter(Boolean).length).toBe(1);
      expect(Array.from(el.querySelectorAll('.contrib-tab')).find(p => p.closest('[hidden]') === null)?.textContent).toContain('شرکت 1');
      component.setModalTab('identity');
      fixture.detectChanges();
      component.setModalTab('x_tab');
      fixture.detectChanges();
      expect(tabLoader).toHaveBeenCalledTimes(1);

      component.studioContext.setCount('x_tab', 4);
      component.studioContext.reportError('x_tab');
      const tab = component.modalTabs.find(t => t.id === 'x_tab');
      expect(tab?.count).toBe(4);
      expect(tab?.indicator?.tone).toBe('rose');
      fixture.detectChanges();
      expect(tabLoader).toHaveBeenCalledTimes(1);
    });

    it('تب requiresSavedCompany پیش از ذخیره پیام «ابتدا ذخیره کنید» نشان می‌دهد و کامپوننت را بار نمی‌کند', () => {
      const registry = TestBed.inject(ModuleRegistryService);
      vi.spyOn(registry, 'getExtensions').mockImplementation(((point: string) => point === 'companies' ? [{
        moduleCode: 'test-mod-2',
        extension: { studioTabs: [{ id: 'needs_save', labelFa: 'نیازمند ذخیره', shortLabelFa: 'ذخیره', icon: 'cloud', order: 30, requiresSavedCompany: true, loadComponent: tabLoader }] }
      }] : []) as any);
      component.setupStudioForNew();
      component.setModalTab('needs_save');
      fixture.detectChanges();
      expect(component.activeModalTab).toBe('needs_save');
      expect(fixture.nativeElement.textContent).toContain('ابتدا مشخصات اولیهٔ شرکت را ذخیره کنید');
      expect(tabLoader).not.toHaveBeenCalled();
    });

    it('بخش مشارکتی در انتهای تب مدارک رندر می‌شود', async () => {
      component.setupStudioForCompany(1);
      component.setModalTab('documents');
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.contrib-section')?.textContent).toContain('بخش 1');
    });

    it('شکست بارگذاری کامپوننت حالت خطا با «تلاش دوباره» دارد و تلاش دوباره دوباره بار می‌کند', async () => {
      tabLoader.mockRejectedValueOnce(new Error('chunk failed'));
      component.setupStudioForCompany(1);
      component.setModalTab('x_tab');
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('بارگذاری این بخش انجام نشد.');
      const retry = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تلاش دوباره') && b.closest('[role="alert"]')?.textContent?.includes('بارگذاری این بخش')) as HTMLButtonElement;
      retry.click();
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      expect(tabLoader).toHaveBeenCalledTimes(2);
      expect(el.querySelector('.contrib-tab')).not.toBeNull();
    });

    it('ستون مشارکتی (listCells) در جدول و کارت موبایل با ورودی company و variant رندر می‌شود', async () => {
      component.viewMode = 'list';
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const headers = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
      expect(headers).toContain('ستون آزمایشی');
      expect(component.tableColspan).toBe(9);
      const cells = Array.from(el.querySelectorAll('.contrib-cell')).map(c => c.textContent?.trim());
      expect(cells).toContain('سلول PTS table');
      expect(cells).toContain('سلول PTS card');
      // کامپوننت سلول یک بار برای همهٔ ردیف‌ها بارگذاری می‌شود
      expect(cellLoader).toHaveBeenCalledTimes(1);
    });

    it('دکمهٔ مشارکتی ردیف (rowActions) با یک ناوبری تب مقصد را باز می‌کند و برای ردیف در انتظار ارسال غیرفعال است', () => {
      component.viewMode = 'list';
      component.companies = [...sampleCompanies, { id: -5, code: 'Q', name: 'در صف', is_active: true, _offlinePending: true } as any];
      component.applyFilter();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const actions = Array.from(el.querySelectorAll('tbody button[aria-label="اقدام آزمایشی"]')) as HTMLButtonElement[];
      expect(actions.length).toBe(3);
      expect(actions[2].disabled).toBe(true);
      navigateSpy.mockClear();
      actions[0].click();
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(['/app/operations/companies', 1], { queryParams: { tab: 'x_tab' } });
    });

    it('تب renderOnlyWhenActive فقط وقتی باز است ساخته می‌شود و با بستن تب از بین می‌رود', async () => {
      const liveLoader = vi.fn().mockResolvedValue(TestContribTabComponent);
      const registry = TestBed.inject(ModuleRegistryService);
      vi.spyOn(registry, 'getExtensions').mockImplementation(((point: string) => point === 'companies' ? [{
        moduleCode: 'test-mod-3',
        extension: { studioTabs: [{ id: 'live_tab', labelFa: 'تب زنده', shortLabelFa: 'زنده', icon: 'cloud', order: 70, requiresSavedCompany: true, hiddenUntilSaved: true, renderOnlyWhenActive: true, loadComponent: liveLoader }] }
      }] : []) as any);
      component.setupStudioForCompany(1);
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      expect(liveLoader).not.toHaveBeenCalled();

      component.setModalTab('live_tab');
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(liveLoader).toHaveBeenCalledTimes(1);
      expect(el.querySelector('.contrib-tab')?.textContent).toContain('شرکت 1');

      component.setModalTab('identity');
      fixture.detectChanges();
      expect(el.querySelector('.contrib-tab')).toBeNull();
    });

    it('فرم ذخیره‌نشدهٔ کامپوننت مشارکتی (registerDirty) هشدار خروج را فعال می‌کند', () => {
      component.setupStudioForCompany(1);
      expect(component.hasUnsavedChanges()).toBe(false);
      let dirty = true;
      const unregister = component.studioContext.registerDirty('x_tab', () => dirty);
      expect(component.hasUnsavedChanges()).toBe(true);
      dirty = false;
      expect(component.hasUnsavedChanges()).toBe(false);
      dirty = true;
      unregister();
      expect(component.hasUnsavedChanges()).toBe(false);
    });
  });
});

@Component({
  selector: 'app-test-contrib-tab',
  standalone: true,
  template: '<p class="contrib-tab">شرکت {{ companyId }}</p>'
})
class TestContribTabComponent {
  @Input() companyId: number | null = null;
}

@Component({
  selector: 'app-test-contrib-section',
  standalone: true,
  template: '<p class="contrib-section">بخش {{ companyId }}</p>'
})
class TestContribSectionComponent {
  @Input() companyId: number | null = null;
}

@Component({
  selector: 'app-test-contrib-cell',
  standalone: true,
  template: '<span class="contrib-cell">سلول {{ company?.code }} {{ variant }}</span>'
})
class TestContribCellComponent {
  @Input() company: Company | null = null;
  @Input() variant: 'table' | 'card' = 'table';
}
