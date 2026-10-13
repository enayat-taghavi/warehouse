// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { CompanyDocumentsArchiveComponent } from './company-documents-archive';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/components/toast/toast.component';
import { Company, CompanyDocument } from '../../../core/models/company.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyDocumentsArchiveComponent DOM Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<CompanyDocumentsArchiveComponent>;
  let component: CompanyDocumentsArchiveComponent;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockAuthService: any;
  let mockToast: any;

  const sampleCompanies: Company[] = [
    {
      id: 1,
      code: 'PTS',
      name: 'پاینده توان ساینا',
      national_id: '10101234567',
      is_active: true,
      user_access_level: 'docs_read'
    },
    {
      id: 2,
      code: 'FA',
      name: 'فارس عالیش',
      national_id: '10207654321',
      is_active: true,
      user_access_level: 'workspace_full'
    }
  ];

  const sampleDocuments: CompanyDocument[] = [
    {
      id: 10,
      company: 1,
      document_type: 'statute',
      document_type_display: 'اساسنامه شرکت',
      title: 'اساسنامه پاینده توان ساینا',
      tracking_code: 'DOC-1001',
      file: '/media/company_docs/statute.pdf',
      file_name: 'statute.pdf',
      file_size_formatted: '1.2 MB',
      is_confidential: false,
      is_valid: true,
      days_to_expiry: null,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z'
    },
    {
      id: 11,
      company: 1,
      document_type: 'vat_certificate',
      document_type_display: 'گواهی ثبت‌نام ارزش افزوده',
      title: 'گواهی ارزش افزوده ۱۴۰۵',
      tracking_code: 'DOC-1002',
      file: '/media/company_docs/vat.pdf',
      file_name: 'vat.pdf',
      file_size_formatted: '850 KB',
      is_confidential: false,
      is_valid: true,
      days_to_expiry: 15,
      created_at: '2026-09-24T10:00:00Z',
      updated_at: '2026-09-24T10:00:00Z'
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
      getUserAvailable: vi.fn().mockReturnValue(of({ companies: sampleCompanies, is_superuser: false })),
      getDocuments: vi.fn().mockReturnValue(of(sampleDocuments)),
      createDocument: vi.fn().mockImplementation((data: any) => of({ id: 12, title: 'سند جدید' })),
      deleteDocument: vi.fn().mockReturnValue(of(void 0)),
      downloadDocument: vi.fn().mockReturnValue(of(new Blob()))
    };

    mockActiveCompanyService = {
      activeCompany: sampleCompanies[0],
      selectedCompanyId: vi.fn().mockReturnValue(1),
      loadDocumentCompanies: vi.fn().mockReturnValue(of(sampleCompanies))
    };

    mockAuthService = {
      user: vi.fn().mockReturnValue({ id: 5, username: 'n.beyrami', is_superuser: false }),
      isSuperuser: vi.fn().mockReturnValue(false)
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CompanyDocumentsArchiveComponent, CommonModule, FormsModule, ReactiveFormsModule],
      providers: [
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToast }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyDocumentsArchiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('باید کامپوننت با موفقیت بارگذاری شود و لیست شرکت‌ها را استعلام کند', () => {
    expect(component).toBeTruthy();
    expect(mockActiveCompanyService.loadDocumentCompanies).toHaveBeenCalled();
    expect(component.companies.length).toBe(2);
    expect(component.selectedCompanyId).toBe(1);
    expect(component.currentUserAccessLevel).toBe('docs_read');
  });

  it('کاربر با سطح docs_read نباید اجازه آپلود یا حذف مدرک داشته باشد', () => {
    expect(component.currentUserAccessLevel).toBe('docs_read');
    expect(component.canUpload).toBe(false);
    expect(component.canDelete).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    const uploadBtn = compiled.querySelector('button[title="بارگذاری مدرک جدید"]');
    expect(uploadBtn).toBeNull();
  });

  it('با انتخاب شرکت با سطح دسترسی workspace_full، امکانات ثبت و حذف فعال می‌شوند', () => {
    // انتخاب شرکت فارس عالیش (دارای سطح دسترسی workspace_full)
    component.selectCompany(sampleCompanies[1]);
    fixture.detectChanges();

    expect(component.selectedCompanyId).toBe(2);
    expect(component.currentUserAccessLevel).toBe('workspace_full');
    expect(component.canUpload).toBe(true);
    expect(component.canDelete).toBe(true);
  });

  it('فیلتر دسته‌بندی مدارک باید اسناد را بر اساس رسته دسته‌بندی فیلتر کند', () => {
    expect(component.documents.length).toBe(2);

    // فیلتر رسته مالیاتی و بیمه‌ای (FISCAL)
    component.setCategory('FISCAL');
    expect(component.filteredDocuments.length).toBe(1);
    expect(component.filteredDocuments[0].document_type).toBe('vat_certificate');

    // فیلتر رسته شرکتی و ثبتی (CORPORATE)
    component.setCategory('CORPORATE');
    expect(component.filteredDocuments.length).toBe(1);
    expect(component.filteredDocuments[0].document_type).toBe('statute');

    // فیلتر همه (ALL)
    component.setCategory('ALL');
    expect(component.filteredDocuments.length).toBe(2);
  });

  it('جستجوی متنی باید لیست اسناد را بر اساس عنوان یا کد پیگیری فیلتر کند', () => {
    component.searchQuery = 'ارزش افزوده';
    component.applyFilter();
    expect(component.filteredDocuments.length).toBe(1);
    expect(component.filteredDocuments[0].title).toContain('ارزش افزوده');

    component.searchQuery = 'اساسنامه';
    component.applyFilter();
    expect(component.filteredDocuments.length).toBe(1);
    expect(component.filteredDocuments[0].title).toContain('اساسنامه');

    component.clearSearch();
    expect(component.filteredDocuments.length).toBe(2);
  });

  it('باید سطح دسترسی و قابلیت مشاهده اسناد را فارغ از شغل کاربری برای شرکت مجاز فراهم کند', () => {
    // سناریوی کاربر gh.alishvandi: دسترسی به شرکت فارس عالیش با سطح docs_read
    const farsAlishCompany: Company = {
      id: 5,
      name: 'شرکت فارس عالیش',
      code: 'FA01',
      user_access_level: 'docs_read',
      has_warehouse_module: true
    };

    component.selectCompany(farsAlishCompany);
    fixture.detectChanges();

    expect(component.selectedCompanyId).toBe(5);
    expect(component.selectedCompany?.name).toBe('شرکت فارس عالیش');
    expect(component.currentUserAccessLevel).toBe('docs_read');
    // در سطح docs_read، کاربر می‌تواند اسناد را مشاهده و دانلود کند اما اجازه آپلود یا حذف ندارد
    expect(component.canUpload).toBe(false);
    expect(component.canDelete).toBe(false);
  });

  it('کاربری که صرفاً در بخش‌های تابعه شاغل است و هیچ انتساب صریح شرکتی ندارد باید در DOM پیام عدم انتساب شرکت را ببیند', () => {
    // شبیه‌سازی کاربری که لیست شرکت‌های مجاز مدارک برای او خالی است (تنها در بخش‌ها شاغل است بدون UserCompanyAccess)
    component.companies = [];
    component.selectedCompany = null;
    component.selectedCompanyId = null;
    component.isLoadingCompanies = false;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    // بررسی پیام عدم دسترسی در DOM
    const emptyNotice = compiled.querySelector('h3');
    expect(emptyNotice).not.toBeNull();
    expect(emptyNotice?.textContent).toContain('هیچ شرکتی جهت دسترسی به مدارک به شما منتسب نشده است');

    // بررسی عدم وجود دکمه‌های عملیاتی و فیلترها در DOM
    const uploadBtn = compiled.querySelector('button[title="بارگذاری مدرک جدید"]');
    expect(uploadBtn).toBeNull();
    expect(component.canUpload).toBe(false);
  });

  describe('تست‌های تعاملی DOM و بارگذاری فایل‌های واقعی از پوشه Downloads', () => {
    it('باید فایل واقعی PDF از پوشه Downloads کامپیوتر بارگذاری شده و با اعتبارسنجی تاریخ‌ها در آرشیو ثبت گردد', () => {
      // ۱. خواندن فایل واقعی از پوشه Downloads
      const pdfPath = 'C:\\Users\\Payandeh\\Downloads\\00.pdf';
      expect(fs.existsSync(pdfPath)).toBe(true);
      const pdfBuffer = fs.readFileSync(pdfPath);
      const realPdfFile = new File([pdfBuffer], '00.pdf', { type: 'application/pdf' });
      expect(realPdfFile.size).toBeGreaterThan(0);

      // ۲. انتخاب شرکت با دسترسی کامل جهت فعال شدن دکمه آپلود
      component.selectCompany(sampleCompanies[1]);
      fixture.detectChanges();
      expect(component.canUpload).toBe(true);

      const compiled = fixture.nativeElement as HTMLElement;
      const uploadBtn = Array.from(compiled.querySelectorAll('button')).find(b => b.textContent?.includes('بارگذاری مدرک')) as HTMLButtonElement;
      expect(uploadBtn).not.toBeNull();

      // ۳. کلیک روی دکمه باز کردن مودال در DOM
      uploadBtn.click();
      fixture.detectChanges();
      expect(component.uploadModal.isOpen).toBe(true);

      // ۴. مقداردهی عنوان و رسته مدرک
      component.uploadModal.data.title = 'اساسنامه رسمی پاینده توان ساینا';
      component.uploadModal.data.document_type = 'statute';

      // ۵. تست دکمه تقویم تاریخ صدور
      const dateButtons = compiled.querySelectorAll('.fixed.inset-0 button[title="انتخاب از تقویم شمسی"]');
      expect(dateButtons.length).toBe(2);

      const issueDateBtn = dateButtons[0] as HTMLButtonElement;
      issueDateBtn.click();
      fixture.detectChanges();
      expect(component.isDocIssueDatePickerOpen).toBe(true);

      // انتخاب تاریخ صدور شمسی
      component.onDocIssueDateSelect({ shamsi: '1404/01/15' });
      fixture.detectChanges();
      expect(component.isDocIssueDatePickerOpen).toBe(false);
      expect(component.uploadModal.data.issue_date).toBe('1404/01/15');

      // ۶. تست دکمه تقویم تاریخ انقضا
      const expiryDateBtn = dateButtons[1] as HTMLButtonElement;
      expiryDateBtn.click();
      fixture.detectChanges();
      expect(component.isDocExpiryDatePickerOpen).toBe(true);

      // انتخاب تاریخ انقضای شمسی
      component.onDocExpiryDateSelect({ shamsi: '1405/01/15' });
      fixture.detectChanges();
      expect(component.isDocExpiryDatePickerOpen).toBe(false);
      expect(component.uploadModal.data.expiry_date).toBe('1405/01/15');
      expect(component.docExpiryDateControl.value).toBe('1405/01/15');

      // ۷. الصاق فایل واقعی PDF از کامپیوتر
      component.uploadModal.data.file = realPdfFile;

      // ۸. کلیک روی دکمه «ثبت و ذخیره سند» در DOM
      const submitBtn = Array.from(compiled.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent?.includes('ثبت و ذخیره سند')) as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();

      submitBtn.click();
      fixture.detectChanges();

      // بررسی فراخوانی وب‌سرویس ایجاد مدرک با فایل واقعی
      expect(mockCompanyApi.createDocument).toHaveBeenCalled();
      const calledFormData = mockCompanyApi.createDocument.mock.calls[0][0] as FormData;
      expect(calledFormData.get('company')).toBe('2');
      expect(calledFormData.get('title')).toBe('اساسنامه رسمی پاینده توان ساینا');
      expect(calledFormData.get('issue_date')).toBe('1404/01/15');
      expect(calledFormData.get('expiry_date')).toBe('1405/01/15');
      const attachedFile = calledFormData.get('file') as File;
      expect(attachedFile.name).toBe('00.pdf');

      expect(mockToast.success).toHaveBeenCalled();
      expect(component.uploadModal.isOpen).toBe(false);
    });

    it('باید فایل واقعی تصویر JPG از پوشه Downloads کامپیوتر بارگذاری شده و با موفقیت ثبت شود', () => {
      // ۱. خواندن فایل واقعی تصویر از پوشه Downloads
      const jpgPath = 'C:\\Users\\Payandeh\\Downloads\\-2147483648_-210031.jpg';
      expect(fs.existsSync(jpgPath)).toBe(true);
      const jpgBuffer = fs.readFileSync(jpgPath);
      const realJpgFile = new File([jpgBuffer], 'license_scan.jpg', { type: 'image/jpeg' });

      component.selectCompany(sampleCompanies[1]);
      component.openUploadModal();
      fixture.detectChanges();

      component.uploadModal.data.title = 'تصویر پروانه بهره‌برداری';
      component.uploadModal.data.document_type = 'operating_license';
      component.uploadModal.data.file = realJpgFile;

      const compiled = fixture.nativeElement as HTMLElement;
      const submitBtn = Array.from(compiled.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent?.includes('ثبت و ذخیره سند')) as HTMLButtonElement;
      submitBtn.click();
      fixture.detectChanges();

      expect(mockCompanyApi.createDocument).toHaveBeenCalled();
      const calledFormData = mockCompanyApi.createDocument.mock.calls[mockCompanyApi.createDocument.mock.calls.length - 1][0] as FormData;
      const attachedFile = calledFormData.get('file') as File;
      expect(attachedFile.name).toBe('license_scan.jpg');
      expect(attachedFile.type).toBe('image/jpeg');
      expect(component.uploadModal.isOpen).toBe(false);
    });

    it('تست تمامی دکمه‌های پیش‌نمایش درجا (PDF و تصویر)، دانلود امن و حذف سند در DOM', () => {
      component.selectCompany(sampleCompanies[1]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // ۱. تست دکمه «پیش‌نمایش» سند PDF
      const previewButtons = Array.from(compiled.querySelectorAll('button')).filter(b => b.textContent?.includes('مشاهده') || b.textContent?.includes('پیش‌نمایش') || b.getAttribute('appaction') === 'view');
      expect(previewButtons.length).toBeGreaterThan(0);

      // کلیک روی پیش‌نمایش سند اول (PDF)
      previewButtons[0].click();
      fixture.detectChanges();

      expect(component.previewModal.isOpen).toBe(true);
      expect(component.previewModal.isPdf).toBe(true);

      // بررسی رندر شدن iframe در DOM
      const iframe = compiled.querySelector('iframe');
      expect(iframe).not.toBeNull();

      // بررسی لینک باز کردن در تب مجزا
      const externalLink = Array.from(compiled.querySelectorAll('a')).find(a => a.textContent?.includes('باز کردن در تب مجزا'));
      expect(externalLink).not.toBeNull();

      // بستن پیش‌نمایش با دکمه ✕
      const closePreviewBtn = Array.from(compiled.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent?.trim() === '✕' || b.getAttribute('appaction') === 'close' || b.title === 'بستن') as HTMLButtonElement;
      expect(closePreviewBtn).not.toBeNull();
      closePreviewBtn.click();
      fixture.detectChanges();
      expect(component.previewModal.isOpen).toBe(false);

      // ۲. تست پیش‌نمایش سند تصویری (Image Preview)
      const imageDoc: CompanyDocument = {
        id: 99,
        company: 1,
        title: 'تصویر کارت بازرگانی',
        document_type: 'commercial_card',
        file: '/media/docs/card.png',
        file_size_formatted: '500 KB',
        is_confidential: false,
        is_valid: true,
        days_to_expiry: 100,
        created_at: '2026-09-24T10:00:00Z',
        updated_at: '2026-09-24T10:00:00Z'
      };
      component.openPreview(imageDoc);
      fixture.detectChanges();

      expect(component.previewModal.isOpen).toBe(true);
      expect(component.previewModal.isPdf).toBe(false);
      expect(component.previewModal.isImage).toBe(true);

      // بررسی رندر شدن تگ img در DOM
      const img = compiled.querySelector('.fixed.inset-0 img[alt="تصویر کارت بازرگانی"]');
      expect(img).not.toBeNull();

      component.closePreview();
      fixture.detectChanges();
      expect(component.previewModal.isOpen).toBe(false);

      // ۳. تست دکمه «دانلود امن سند» در جدول
      const downloadButtons = Array.from(compiled.querySelectorAll('button')).filter(b => b.textContent?.includes('دانلود') || b.getAttribute('appaction') === 'download' || b.title === 'دانلود');
      expect(downloadButtons.length).toBeGreaterThan(0);

      downloadButtons[0].click();
      expect(mockCompanyApi.downloadDocument).toHaveBeenCalledWith(sampleDocuments[0].id);
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('سند با موفقیت دریافت شد.');

      // ۴. تست دکمه «حذف سند» در جدول
      const deleteButtons = Array.from(compiled.querySelectorAll('button')).filter(b => b.title === 'حذف مدرک' || b.title === 'حذف' || b.getAttribute('appaction') === 'delete');
      expect(deleteButtons.length).toBeGreaterThan(0);

      deleteButtons[0].click();
      expect(mockCompanyApi.deleteDocument).toHaveBeenCalledWith(sampleDocuments[0].id);
      expect(mockToast.success).toHaveBeenCalledWith('سند از آرشیو شرکت حذف گردید.');
    });

    it('تست تمامی دکمه‌های فیلتر رسته‌ها، جستجو، رفرش و لغو در DOM', () => {
      component.selectCompany(sampleCompanies[1]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // ۱. تست کلیک روی تک‌تک دکمه‌های رسته
      const categoryButtons = Array.from(compiled.querySelectorAll('app-tab-bar button, .sticky button, div button')).filter(b => 
        ['همه اسناد', 'اساسنامه و روزنامه', 'اسناد هویتی و ثبتی', 'مجوزها و پروانه‌ها', 'مالیات و بیمه', 'قراردادها و اجاره‌نامه'].some(t => b.textContent?.includes(t))
      );
      expect(categoryButtons.length).toBeGreaterThanOrEqual(4);

      // کلیک روی رسته مالیات و بیمه
      const fiscalBtn = categoryButtons.find(b => b.textContent?.includes('مالیات و بیمه'));
      (fiscalBtn as HTMLElement)?.click();
      fixture.detectChanges();
      expect(component.activeCategory).toBe('FISCAL');
      expect(component.filteredDocuments.length).toBe(1);

      // کلیک روی همه اسناد
      const allBtn = categoryButtons.find(b => b.textContent?.includes('همه اسناد'));
      (allBtn as HTMLElement)?.click();
      fixture.detectChanges();
      expect(component.activeCategory).toBe('ALL');
      expect(component.filteredDocuments.length).toBe(2);

      // ۲. تست دکمه پاک‌کردن جستجو (✕)
      component.searchQuery = 'تست سرچ';
      component.applyFilter();
      fixture.detectChanges();

      const clearSearchBtn = Array.from(compiled.querySelectorAll('button')).find(b => b.textContent?.trim() === '✕');
      expect(clearSearchBtn).not.toBeNull();
      clearSearchBtn?.click();
      fixture.detectChanges();
      expect(component.searchQuery).toBe('');
      expect(component.filteredDocuments.length).toBe(2);

      // ۳. تست دکمه به‌روزرسانی بایگانی
      const refreshBtn = (compiled.querySelector('button[title="بروزرسانی بایگانی"]') || compiled.querySelector('button[appaction="refresh"]')) as HTMLButtonElement;
      expect(refreshBtn).not.toBeNull();
      refreshBtn.click();
      expect(mockCompanyApi.getDocuments).toHaveBeenCalled();

      // ۴. تست دکمه‌های بستن و انصراف در مودال آپلود
      component.openUploadModal();
      fixture.detectChanges();
      expect(component.uploadModal.isOpen).toBe(true);

      const cancelBtn = Array.from(compiled.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent?.includes('انصراف')) as HTMLButtonElement;
      expect(cancelBtn).not.toBeNull();
      cancelBtn.click();
      fixture.detectChanges();
      expect(component.uploadModal.isOpen).toBe(false);
    });
  });
});


