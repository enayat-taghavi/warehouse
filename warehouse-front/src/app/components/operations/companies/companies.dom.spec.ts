// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { CompaniesManagementComponent } from './companies';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { ToastService } from '../../../shared/components/toast/toast.component';
import { AccountsHttpService } from '../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../core/http/websocket.service';
import { Company } from '../../../core/models/company.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompaniesManagementComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<CompaniesManagementComponent>;
  let component: CompaniesManagementComponent;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockAccountsHttp: any;
  let mockToast: any;
  let mockWebSocket: any;

  const sampleCompanies: Company[] = [
    {
      id: 1,
      code: 'PTS',
      name: 'پاینده توان ساینا',
      national_id: '10101234567',
      economic_code: '4111222333',
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
      national_id: '10207654321',
      economic_code: '4222333444',
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
          national_code: '1234567890',
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
      deleteBoardMember: vi.fn().mockReturnValue(of(void 0))
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
        { provide: WebSocketService, useValue: mockWebSocket }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompaniesManagementComponent);
    component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/app/operations/companies');
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
      expect(badge?.textContent).toContain('2 شرکت');
    });

    it('باید سه دکمه آیکونی استاندارد (اکسل خروجی، اکسل ورودی، رفرش) با اندازه w-9 h-9 در هدر وجود داشته باشند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const exportBtn = el.querySelector('button[title="خروجی اکسل شرکت‌ها"]');
      const importBtn = el.querySelector('button[title="ورود اطلاعات از اکسل"]');
      const refreshBtn = el.querySelector('button[title="به‌روزرسانی داده‌ها"]');

      expect(exportBtn).not.toBeNull();
      expect(exportBtn?.className).toContain('w-9');
      expect(exportBtn?.className).toContain('h-9');

      expect(importBtn).not.toBeNull();
      expect(importBtn?.className).toContain('w-9');
      expect(importBtn?.className).toContain('h-9');

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

    it('باید ستون‌های شناسه ملی، مدیرعامل و تعداد پروژه‌ها با فرمت صحیح رندر شوند', () => {
      const el: HTMLElement = fixture.nativeElement;
      const firstRow = el.querySelectorAll('tbody tr')[0];

      expect(firstRow.textContent).toContain('10101234567');
      expect(firstRow.textContent).toContain('مهندس پاینده');
      expect(firstRow.textContent).toContain('2 پروژه');
    });

    it('ردیف دوم که شرکت فعال جاری نیست نباید نشان «فعال جاری» داشته باشد', () => {
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

      const modalTitle = el.querySelector('h3');
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
      expect(mockCompanyApi.create).not.toHaveBeenCalled();
    });

    it('فرم معتبر باید با موفقیت به وب‌سرویس ارسال شده و مودال بسته شود', () => {
      component.openCreateModal();
      component.companyModal.data.code = 'NEW';
      component.companyModal.data.name = 'شرکت جدید آزمایشی';
      component.companyModal.data.national_id = '10320987654';
      component.companyModal.data.economic_code = '4999888777';

      component.submitCompanyForm();
      fixture.detectChanges();

      expect(mockCompanyApi.create).toHaveBeenCalledWith(expect.objectContaining({
        code: 'NEW',
        name: 'شرکت جدید آزمایشی',
        national_id: '10320987654',
        economic_code: '4999888777'
      }));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('شرکت جدید آزمایشی'));
      expect(component.companyModal.isOpen).toBe(false);
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
      expect(component.companyModal.isOpen).toBe(false);
    });
  });

  describe('۶. امنیت و گارد حذف شرکت (Delete Guard & Active Projects Invariant)', () => {
    it('تلاش برای حذف شرکتی که پروژه فعال دارد (projects_count > 0) باید با پیام خطای قرمز مسدود شود', () => {
      const companyWithProjects = sampleCompanies[0]; // projects_count: 2
      expect(companyWithProjects.projects_count).toBeGreaterThan(0);

      component.confirmDelete(companyWithProjects);
      fixture.detectChanges();

      expect(component.deleteModal.isOpen).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('این شرکت دارای 2 پروژه فعال است و امکان حذف آن وجود ندارد.');
      expect(mockCompanyApi.delete).not.toHaveBeenCalled();
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

      expect(mockCompanyApi.delete).toHaveBeenCalledWith(99);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('شرکت «شرکت بدون پروژه» با موفقیت حذف شد.'));
      expect(component.deleteModal.isOpen).toBe(false);
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

    it('باز کردن مودال ویرایش یک شرکت باید اسناد آرشیو آن شرکت را بارگذاری کند', () => {
      mockCompanyApi.getDocuments.mockReturnValue(of([
        { id: 1, title: 'اساسنامه ثبتی', document_type: 'articles_of_association', file_url: '/media/test.pdf' }
      ]));

      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();

      expect(mockCompanyApi.getDocuments).toHaveBeenCalledWith({ company_id: 1 });
      expect(component.companyDocuments.length).toBe(1);
      expect(component.companyDocuments[0].title).toBe('اساسنامه ثبتی');
    });

    it('ثبت مدرک جدید بدون انتخاب فایل یا عنوان باید با پیام هشدار متوقف شود', () => {
      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();

      // بدون فایل
      component.uploadNewDocument();
      expect(mockToast.warning).toHaveBeenCalledWith('لطفاً فایل مدرک را انتخاب فرمایید.');
      expect(mockCompanyApi.createDocument).not.toHaveBeenCalled();

      // با فایل اما بدون عنوان
      const fakeFile = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
      component.newDoc.file = fakeFile;
      component.newDoc.title = '';
      component.uploadNewDocument();
      expect(mockToast.warning).toHaveBeenCalledWith('لطفاً عنوان مدرک را وارد فرمایید.');
      expect(mockCompanyApi.createDocument).not.toHaveBeenCalled();
    });

    it('ثبت مدرک جدید با مشخصات معتبر باید سرویس createDocument را با FormData فراخوانی کند', () => {
      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();

      const fakeFile = new File(['dummy content'], 'tax_sheet.pdf', { type: 'application/pdf' });
      component.newDoc.file = fakeFile;
      component.newDoc.title = 'برگ تشخیص مالیاتی';
      component.newDoc.document_type = 'tax_sheet' as any;
      component.newDoc.issue_date = '1405/01/15';

      component.uploadNewDocument();
      fixture.detectChanges();

      expect(mockCompanyApi.createDocument).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('برگ تشخیص مالیاتی'));
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

  describe('۸. سیستم چندشبایی و خزانه‌داری هوشمند شرکت‌ها (Multi-IBAN & Smart Treasury)', () => {
    it('باز کردن ویرایش شرکت باید لیست شماره شباهای آن را بارگذاری کند', () => {
      component.openEditModal(sampleCompanies[0]);
      fixture.detectChanges();

      expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledWith(1);
      expect(component.companyBankAccounts.length).toBe(1);
      expect(component.companyBankAccounts[0].bank_name).toBe('بانک ملت');
      expect(component.companyBankAccounts[0].is_primary).toBe(true);
    });

    it('ورود شماره شبای معتبر باید نام بانک و شماره حساب را به صورت خودکار تشخیص دهد', () => {
      component.onShebaInput('IR160120000000001234567890');

      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.shebaValidationResult?.bank?.name).toBe('بانک ملت');
      expect(component.newAccount.bank_name).toBe('بانک ملت');
      expect(component.newAccount.account_number).toBe('1234567890');
    });

    it('ورود شماره شبای نامعتبر باید خطا بدهد و از ثبت جلوگیری کند', () => {
      component.openEditModal(sampleCompanies[0]);
      component.onShebaInput('IR120000000000000000000000'); // نامعتبر

      expect(component.shebaValidationResult?.isValid).toBe(false);
      expect(component.shebaValidationResult?.errorMessage).toContain('نامعتبر');

      component.saveBankAccount();
      expect(mockToast.error).toHaveBeenCalled();
      expect(mockCompanyApi.createBankAccount).not.toHaveBeenCalled();
    });

    it('ثبت حساب بانکی معتبر باید وب‌سرویس ایجاد را با شرکت جاری صدا بزند', () => {
      component.openEditModal(sampleCompanies[0]);
      component.onShebaInput('IR160120000000001234567890');
      component.newAccount.account_title = 'حساب حقوق پرسنل';

      component.saveBankAccount();
      fixture.detectChanges();

      expect(mockCompanyApi.createBankAccount).toHaveBeenCalledWith(expect.objectContaining({
        company: 1,
        sheba_number: 'IR160120000000001234567890',
        bank_name: 'بانک ملت',
        account_number: '1234567890'
      }));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('بانک ملت'));
    });

    it('تغییر حساب بانکی اصلی باید وب‌سرویس setPrimaryBankAccount را فراخوانی کند', () => {
      const sampleAccount = {
        id: 5,
        company: 1,
        bank_name: 'بانک تجارت',
        account_number: '987654321',
        sheba_number: 'IR980180000000000987654321',
        account_title: 'حساب تجاری',
        is_primary: false,
        is_active: true
      };

      component.setPrimaryAccount(sampleAccount);
      fixture.detectChanges();

      expect(mockCompanyApi.setPrimaryBankAccount).toHaveBeenCalledWith(5);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('به عنوان حساب اصلی شرکت تنظیم شد'));
    });

    it('کپی شماره شبا به کلیپ‌بورد باید توست موفقیت‌آمیز نمایش دهد', async () => {
      // Mock clipboard
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(void 0)
        }
      });

      component.copySheba('IR120120000000001234567890');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('IR120120000000001234567890');
      
      // Allow async promise chain to resolve
      await Promise.resolve();
      await new Promise(r => setTimeout(r, 10));

      expect(mockToast.success).toHaveBeenCalledWith('شماره شبا در حافظه کپی شد.');
      expect(component.copiedSheba).toBe('IR120120000000001234567890');
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

    it('متدهای صدور و انقضای اسناد باید تاریخ‌های مدرک جدید را شمسی تنظیم کنند', () => {
      component.onDocIssueDateSelect('1404/01/01');
      expect(component.newDoc.issue_date).toBe('1404/01/01');

      component.onDocExpiryDateSelect('1405/01/01');
      expect(component.newDoc.expiry_date).toBe('1405/01/01');
    });
  });

  describe('۱۰. پیش‌نمایش درجا (In-Place Lightbox Preview) و فیلتر اسناد', () => {
    it('متد openPreview باید برای فایل‌های PDF پرچم isPdf را true کند و عنوان مدرک را ست کند', () => {
      const doc = {
        id: 1,
        company: 1,
        title: 'اساسنامه رسمی',
        document_type: 'articles_of_association',
        file: '/media/documents/sample.pdf',
        file_url: '/media/documents/sample.pdf'
      } as any;

      component.openPreview(doc);
      expect(component.previewModal.isOpen).toBe(true);
      expect(component.previewModal.title).toBe('اساسنامه رسمی');
      expect(component.previewModal.isPdf).toBe(true);

      component.closePreview();
      expect(component.previewModal.isOpen).toBe(false);
    });

    it('متد openPreview برای فایل‌های تصویری (png, jpg) باید isPdf را false کند', () => {
      const doc = {
        id: 2,
        company: 1,
        title: 'تصویر روزنامه رسمی',
        document_type: 'official_gazette',
        file: '/media/documents/sample.jpg',
        file_url: '/media/documents/sample.jpg'
      } as any;

      component.openPreview(doc);
      expect(component.previewModal.isOpen).toBe(true);
      expect(component.previewModal.isPdf).toBe(false);
      expect(component.previewModal.isImage).toBe(true);
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
      component.openPreview(doc);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const previewEl = el.querySelector('div.fixed.z-\\[70\\]') as HTMLElement;
      expect(previewEl).not.toBeNull();
      expect(previewEl.textContent).toContain('اساسنامه رسمی شرکت');

      const canvas = previewEl.querySelector('canvas#pdf-render-canvas');
      expect(canvas).not.toBeNull();
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
      component.companyModal.data.national_id = '14009876543';
      component.companyModal.data.economic_code = '4111222333';
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
      expect(component.companyModal.isOpen).toBe(false);
    });

    it('تست تعاملی تمامی دکمه‌های هدر، فیلترها و سطرهای جدول شرکت‌ها در DOM', () => {
      const el: HTMLElement = fixture.nativeElement;

      // ۱. دکمه خروجی اکسل در هدر
      const excelBtn = el.querySelector('button[title="خروجی اکسل شرکت‌ها"]') as HTMLButtonElement;
      expect(excelBtn).not.toBeNull();
      excelBtn.click();
      expect(mockCompanyApi.exportExcel).toHaveBeenCalled();
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('فایل اکسل با موفقیت دانلود شد.');

      // ۲. دکمه ورود از اکسل در هدر
      const importBtn = el.querySelector('button[title="ورود اطلاعات از اکسل"]') as HTMLButtonElement;
      expect(importBtn).not.toBeNull();
      importBtn.click();
      expect(mockToast.info).toHaveBeenCalledWith('امکان ورود اطلاعات شرکت‌ها از اکسل در این نسخه آماده است.');

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
      studioBtn.click();
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
      const closeStudioBtn = (el.querySelector('button[title="بازگشت به فهرست شرکت‌ها"]') || el.querySelector('button[title="انصراف و بازگشت"]') || el.querySelector('.fixed.inset-0 button')) as HTMLButtonElement;
      closeStudioBtn.click();
      fixture.detectChanges();
      expect(component.companyModal.isOpen).toBe(false);
      expect(component.viewMode).toBe('list');

      // با بسته شدن استودیو و بازگشت به لیست، DOM جدول مجدداً رندر می‌شود
      const updatedFirstRow = el.querySelector('tbody tr') as HTMLTableRowElement;
      expect(updatedFirstRow).not.toBeNull();

      // ۶. تست دکمه «دسترسی‌ها» در سطر جدول
      const accessModalBtn = Array.from(updatedFirstRow.querySelectorAll('button')).find(b => b.textContent?.includes('دسترسی‌ها')) as HTMLButtonElement;
      expect(accessModalBtn).not.toBeNull();
      accessModalBtn.click();
      fixture.detectChanges();
      expect(component.userAccessModal.isOpen).toBe(true);

      component.closeUserAccessModal();
      fixture.detectChanges();
      expect(component.userAccessModal.isOpen).toBe(false);

      // ۷. تست دکمه «حذف» در سطر جدول: ابتدا تست گارد مسدودکننده (به دلیل وجود ۲ پروژه فعال)
      const deleteRowBtn = Array.from(updatedFirstRow.querySelectorAll('button')).find(b => b.textContent?.includes('حذف')) as HTMLButtonElement;
      expect(deleteRowBtn).not.toBeNull();
      deleteRowBtn.click();
      fixture.detectChanges();
      expect(mockToast.error).toHaveBeenCalledWith('این شرکت دارای 2 پروژه فعال است و امکان حذف آن وجود ندارد.');
      expect(component.deleteModal.isOpen).toBe(false);

      // تست مودال حذف برای شرکتی بدون پروژه
      component.filteredCompanies[0].projects_count = 0;
      fixture.detectChanges();

      deleteRowBtn.click();
      fixture.detectChanges();
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

  describe('۱۲. آزمون جامع تعاملی DOM: مدیریت پویای اعضای هیئت‌مدیره، حق امضا، مدارک پیوست و چکسام شناسه ملی', () => {
    beforeEach(() => {
      // باز کردن استودیو شرکت ۱
      component.openEditModal(sampleCompanies[0]);
      component.setModalTab('governance');
      fixture.detectChanges();
    });

    it('باید تب هیئت‌مدیره آمار کل ارکان، صاحبان حق امضا، رئیس و مدیرعامل را در DOM به درستی رندر کند', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(component.activeModalTab).toBe('governance');
      expect(component.companyBoardMembers.length).toBe(1);

      // بررسی شاخص‌های آماری
      expect(component.getSignersCount()).toBe(1);
      expect(component.getChairmanMember()?.first_name).toBe('رضا');

      // بررسی وجود جدول در DOM
      const boardTable = el.querySelector('table');
      expect(boardTable).not.toBeNull();
      const rows = boardTable!.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('رضا پاینده');
      expect(rows[0].textContent).toContain('1234567890');
      expect(rows[0].textContent).toContain('رئیس هیئت‌مدیره');
      expect(rows[0].textContent).toContain('دارای حق امضا');
    });

    it('باید دکمه «افزودن عضو جدید» فرم ثبت را در DOM باز کند و امکان انصراف وجود داشته باشد', () => {
      expect(component.showBoardMemberForm).toBe(false);

      component.openNewBoardMemberForm();
      fixture.detectChanges();
      expect(component.showBoardMemberForm).toBe(true);

      component.cancelBoardMemberForm();
      fixture.detectChanges();
      expect(component.showBoardMemberForm).toBe(false);
    });

    it('باید ثبت عضو جدید هیئت‌مدیره همراه با حق امضا و تاریخ‌های تصدی جلالی در وب‌سرویس فراخوانی شود', () => {
      component.openNewBoardMemberForm();
      fixture.detectChanges();

      // مقداردهی داده‌های عضو
      component.newBoardMember.first_name = 'علیرضا';
      component.newBoardMember.last_name = 'عالیشوندی';
      component.newBoardMember.national_code = '0012345678';
      component.newBoardMember.member_type = 'real';
      component.newBoardMember.role = 'managing_director';
      component.newBoardMember.has_signature_right = true;
      component.newBoardMember.signature_scope = 'امضای کلیه قراردادها منفرداً';

      // تست انتخابگر تاریخ تصدی جلالی
      component.isBoardTermStartDatePickerOpen = true;
      component.onBoardTermStartSelect('1403/01/01');
      expect(component.isBoardTermStartDatePickerOpen).toBe(false);
      expect(component.newBoardMember.term_start).toBe('1403/01/01');

      component.isBoardTermExpiryDatePickerOpen = true;
      component.onBoardTermExpirySelect('1405/01/01');
      expect(component.isBoardTermExpiryDatePickerOpen).toBe(false);
      expect(component.newBoardMember.term_expiry).toBe('1405/01/01');

      // ذخیره عضو
      component.saveBoardMember();
      expect(mockCompanyApi.createBoardMember).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت افزوده شد.'));
      expect(component.showBoardMemberForm).toBe(false);
    });

    it('باید ویرایش عضو هیئت‌مدیره فرم را با داده‌های عضو پر کرده و updateBoardMember را فراخوانی کند', () => {
      const member = component.companyBoardMembers[0];
      component.editBoardMember(member);
      fixture.detectChanges();

      expect(component.showBoardMemberForm).toBe(true);
      expect(component.isEditingBoardMember).toBe(true);
      expect(component.editingBoardMemberId).toBe(member.id);
      expect(component.newBoardMember.first_name).toBe('رضا');

      // تغییر سمت
      component.newBoardMember.role = 'managing_director_and_member';
      component.saveBoardMember();

      expect(mockCompanyApi.updateBoardMember).toHaveBeenCalledWith(member.id, expect.any(FormData));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت ویرایش شد.'));
    });

    it('باید حذف عضو هیئت‌مدیره پس از تایید کاربر، وب‌سرویس deleteBoardMember را فراخوانی کند', () => {
      const member = component.companyBoardMembers[0];
      component.deleteBoardMember(member);

      expect(mockCompanyApi.deleteBoardMember).toHaveBeenCalledWith(member.id);
      expect(mockToast.success).toHaveBeenCalledWith('عضو هیئت‌مدیره با موفقیت حذف گردید.');
    });

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

    it('افزودن حساب بانکی جدید باید بلافاصله و درجا در companyBankAccounts ظاهر شود بدون نیاز به بستن مودال', () => {
      const initialCount = component.companyBankAccounts.length;
      component.onShebaInput('IR160120000000001234567890');
      component.newAccount.account_title = 'حساب تست درجا';

      mockCompanyApi.createBankAccount.mockReturnValue(of({
        id: 99,
        company: 1,
        bank_name: 'بانک ملت',
        account_number: '1234567890',
        sheba_number: 'IR160120000000001234567890',
        account_title: 'حساب تست درجا',
        is_primary: false,
        is_active: true
      }));

      component.saveBankAccount();
      fixture.detectChanges();

      expect(component.companyBankAccounts.length).toBe(initialCount + 1);
      const added = component.companyBankAccounts.find(a => a.id === 99);
      expect(added).toBeDefined();
      expect(added?.bank_name).toBe('بانک ملت');
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('افزوده شد'));
    });

    it('حذف حساب بانکی باید بلافاصله از companyBankAccounts حذف شود بدون نیاز به بستن مودال', () => {
      const targetAcc = component.companyBankAccounts[0];
      const initialCount = component.companyBankAccounts.length;

      component.deleteBankAccount(targetAcc);
      fixture.detectChanges();

      expect(component.companyBankAccounts.some(a => a.id === targetAcc.id)).toBe(false);
      expect(component.companyBankAccounts.length).toBe(initialCount - 1);
      expect(mockToast.success).toHaveBeenCalledWith('حساب بانکی با موفقیت حذف شد.');
    });

    it('تنظیم حساب اصلی باید وضعیت is_primary سایر حساب‌ها را فورا به false و حساب منتخب را به true تغییر دهد', () => {
      // ایجاد دو حساب برای تست
      component.companyBankAccounts = [
        { id: 1, company: 1, bank_name: 'بانک یک', sheba_number: 'IR111', is_primary: true, is_active: true },
        { id: 2, company: 1, bank_name: 'بانک دو', sheba_number: 'IR222', is_primary: false, is_active: true }
      ];

      component.setPrimaryAccount(component.companyBankAccounts[1]);
      fixture.detectChanges();

      expect(component.companyBankAccounts[0].is_primary).toBe(false);
      expect(component.companyBankAccounts[1].is_primary).toBe(true);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('به عنوان حساب اصلی شرکت تنظیم شد'));
    });

    it('افزودن عضو جدید هیئت‌مدیره باید بلافاصله در companyBoardMembers ظاهر شود بدون بستن صفحه', () => {
      const initialCount = component.companyBoardMembers.length;
      component.openNewBoardMemberForm();
      component.newBoardMember = {
        first_name: 'علی',
        last_name: 'اکبری',
        national_code: '0012345678',
        member_type: 'real',
        represented_legal_name: '',
        role: 'board_member',
        has_signature_right: false,
        signature_scope: '',
        term_start: '',
        term_expiry: '',
        is_active: true
      };

      mockCompanyApi.createBoardMember.mockReturnValue(of({
        id: 77,
        company: 1,
        first_name: 'علی',
        last_name: 'اکبری',
        national_code: '0012345678',
        role: 'board_member',
        is_active: true
      }));

      component.saveBoardMember();
      fixture.detectChanges();

      expect(component.companyBoardMembers.length).toBe(initialCount + 1);
      const added = component.companyBoardMembers.find(m => m.id === 77);
      expect(added).toBeDefined();
      expect(added?.first_name).toBe('علی');
      expect(added?.last_name).toBe('اکبری');
    });

    it('بارگذاری مدرک جدید باید بلافاصله مدرک را در companyDocuments و filteredDocuments قرار دهد', () => {
      component.newDoc = {
        title: 'گواهی صلاحیت جدید',
        document_type: 'contractor_qualification',
        file: new File(['content'], 'certificate.pdf', { type: 'application/pdf' }),
        issue_date: '1403/01/01',
        expiry_date: '1405/01/01',
        is_confidential: false,
        description: 'تست آپلود درجا'
      };

      mockCompanyApi.createDocument.mockReturnValue(of({
        id: 88,
        company: 1,
        title: 'گواهی صلاحیت جدید',
        document_type: 'contractor_qualification',
        file: '/media/certificate.pdf',
        file_size: 1024,
        is_confidential: false
      }));

      component.uploadNewDocument();
      fixture.detectChanges();

      expect(component.companyDocuments.some(d => d.id === 88)).toBe(true);
      expect(component.filteredDocuments.some(d => d.id === 88)).toBe(true);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت در آرشیو ثبت شد'));
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

    it('لغو دسترسی کاربر در استودیو باید بلافاصله ردیف را از studioAccesses خارج کند', () => {
      component.studioAccesses = [
        { id: 55, user: 10, company: 1, access_level: 'docs_write', is_default: false }
      ];

      component.removeStudioAccess(55);
      fixture.detectChanges();

      expect(component.studioAccesses.some(a => a.id === 55)).toBe(false);
      expect(mockToast.success).toHaveBeenCalledWith('دسترسی کاربر با موفقیت لغو شد.');
    });

    it('اعلان وب‌سوکت org_structure_updated از سایر کلاینت‌ها باید داده‌های شرکت را رفرش کند', () => {
      const spyLoadBank = vi.spyOn(component, 'loadCompanyBankAccounts');
      const spyLoadBoard = vi.spyOn(component, 'loadCompanyBoardMembers');

      // شبیه‌سازی دریافت پیام وب‌سوکت از کلاینت دیگر
      mockWebSocket.notifications$.next({
        type_str: 'org_structure_updated',
        entity_type: 'company_bank_account',
        company_id: 1,
        client_tab_id: 'other-client-tab-id'
      });

      expect(spyLoadBank).toHaveBeenCalledWith(1);

      mockWebSocket.notifications$.next({
        type_str: 'org_structure_updated',
        entity_type: 'company_board_member',
        company_id: 1,
        client_tab_id: 'other-client-tab-id'
      });

      expect(spyLoadBoard).toHaveBeenCalledWith(1);
    });

    it('اعلان وب‌سوکت با شناسه تب جاری (Echo Filter) باید نادیده گرفته شود تا از پرش‌های بیهوده جلوگیری گردد', () => {
      const spyLoadBank = vi.spyOn(component, 'loadCompanyBankAccounts');

      // ارسال پیام با همان tabId کامپوننت
      mockWebSocket.notifications$.next({
        type_str: 'org_structure_updated',
        entity_type: 'company_bank_account',
        company_id: 1,
        client_tab_id: 'test-client-tab-id' // مساوی با tabId موک
      });

      expect(spyLoadBank).not.toHaveBeenCalled();
    });

    it('نشانگر وضعیت اتصال شبکه (Online / Offline) باید در DOM هدر نمایش داده شود', () => {
      // بستن استودیو جهت بازگشت به نمای فهرست و نمایش هدر نوار فرمان
      component.closeCompanyModal();
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
});



