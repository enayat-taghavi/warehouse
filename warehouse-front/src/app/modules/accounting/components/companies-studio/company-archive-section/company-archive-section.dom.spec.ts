// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';

import { CompanyArchiveSectionComponent } from './company-archive-section';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyArchiveSectionComponent (بخش بایگانی جامع مدارک استودیوی شرکت)', () => {
  let fixture: ComponentFixture<CompanyArchiveSectionComponent>;
  let component: CompanyArchiveSectionComponent;
  let context: CompanyStudioContextService;
  let mockApi: any;
  let mockToast: any;
  let mockWs: any;

  const docs = () => [
    { id: 1, company: 1, title: 'گواهی ارزش افزوده', document_type: 'vat_certificate', document_type_display: 'گواهی ثبت‌نام ارزش افزوده', file_url: '/media/vat.pdf', file_size: 2048, expiry_status: 'valid', is_confidential: false },
    { id: 2, company: 1, title: 'کارت بازرگانی', document_type: 'commercial_card', file_url: '/media/card.jpg', file_size: 1024, expiry_status: 'expired', is_confidential: true }
  ];

  beforeEach(async () => {
    mockApi = {
      getDocuments: vi.fn().mockReturnValue(of(docs())),
      createDocument: vi.fn().mockReturnValue(of({ id: 88, company: 1, title: 'گواهی صلاحیت جدید', document_type: 'contractor_qualification', file: '/media/certificate.pdf', file_size: 1024, is_confidential: false })),
      deleteDocument: vi.fn().mockReturnValue(of(void 0)),
      matchesCompanyUrl: vi.fn().mockReturnValue(false)
    };
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn() };
    mockWs = { notifications$: new Subject<any>(), tabId: 'this-tab' };

    await TestBed.configureTestingModule({
      imports: [CompanyArchiveSectionComponent],
      providers: [
        CompanyStudioContextService,
        { provide: CompanyApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } },
        { provide: WebSocketService, useValue: mockWs },
        { provide: HttpClient, useValue: { get: vi.fn().mockReturnValue(of(new ArrayBuffer(8))) } }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    context.setCompany({ id: 1, code: 'PTS', name: 'پاینده', is_active: true } as any);
    fixture = TestBed.createComponent(CompanyArchiveSectionComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const setCompany = (id: number | null) => {
    fixture.componentRef.setInput('companyId', id);
    fixture.detectChanges();
  };

  it('شرکت تازه (بدون شناسه): چیزی رندر نمی‌شود و درخواستی نمی‌رود', () => {
    setCompany(null);
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('بارگذاری و بایگانی مدرک جدید');
    expect(mockApi.getDocuments).not.toHaveBeenCalled();
  });

  it('مدارک یک بار دریافت، در جدول رندر و شمارندهٔ تب «مدارک» از context داده می‌شود', () => {
    setCompany(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(mockApi.getDocuments).toHaveBeenCalledTimes(1);
    expect(mockApi.getDocuments).toHaveBeenCalledWith({ company_id: 1 });
    expect(context.count('documents')).toBe(2);
    expect(el.textContent).toContain('گواهی ارزش افزوده');
    expect(el.textContent).toContain('منقضی شده');
    expect(el.textContent).toContain('۲ از ۲ سند');
  });

  it('فیلتر نوع و جستجو فهرست را محدود و «پاک‌سازی» آن را برمی‌گرداند', () => {
    setCompany(1);
    component.selectedDocTypeFilter = 'commercial_card';
    component.onDocFilterChange();
    expect(component.filteredDocuments.map(d => d.id)).toEqual([2]);
    component.clearDocFilter();
    component.docSearchQuery = 'ارزش';
    component.onDocFilterChange();
    expect(component.filteredDocuments.map(d => d.id)).toEqual([1]);
    component.clearDocFilter();
    expect(component.filteredDocuments.length).toBe(2);
  });

  it('فیلتر «نیازمند تمدید»، روزهای مانده، توضیحات و بارگذارنده (هم‌ارز بایگانی پیشین)', () => {
    mockApi.getDocuments.mockReturnValue(of([
      { ...docs()[0], days_until_expiry: 12, expiry_status: 'expiring_soon', description: 'نسخهٔ تمدیدشده', uploaded_by_name: 'رضا', issue_date: '1403/01/05' },
      docs()[1]
    ]));
    setCompany(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(component.renewalCount).toBe(2);
    expect(el.textContent).toContain('نزدیک انقضا (۱۲ روز مانده)');
    expect(el.textContent).toContain('نسخهٔ تمدیدشده');
    expect(el.textContent).toContain('رضا');
    expect(el.textContent).toContain('۱۴۰۳/۰۱/۰۵');
    component.toggleRenewalOnly();
    expect(component.filteredDocuments.length).toBe(2);
    mockApi.getDocuments.mockReturnValue(of(docs()));
    component.retry();
    expect(component.filteredDocuments.map(d => d.id)).toEqual([2]);
    component.clearDocFilter();
    expect(component.renewalOnly).toBe(false);
    expect(component.filteredDocuments.length).toBe(2);
  });

  it('ثبت مدرک بدون فایل یا عنوان با پیام هشدار متوقف می‌شود', () => {
    setCompany(1);
    component.uploadNewDocument();
    expect(mockToast.warning).toHaveBeenCalledWith('لطفاً فایل مدرک را انتخاب فرمایید.');
    component.newDoc.file = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
    component.newDoc.title = '';
    component.uploadNewDocument();
    expect(mockToast.warning).toHaveBeenCalledWith('لطفاً عنوان مدرک را وارد فرمایید.');
    expect(mockApi.createDocument).not.toHaveBeenCalled();
  });

  it('ثبت مدرک معتبر با FormData؛ مدرک بی‌درنگ در فهرست و شمارنده می‌نشیند و فرم خالی می‌شود', () => {
    setCompany(1);
    component.newDoc = {
      title: 'گواهی صلاحیت جدید',
      document_type: 'contractor_qualification',
      file: new File(['content'], 'certificate.pdf', { type: 'application/pdf' }),
      issue_date: '1403/01/01',
      expiry_date: '1405/01/01',
      is_confidential: false,
      description: 'تست'
    };
    component.uploadNewDocument();
    fixture.detectChanges();

    const fd: FormData = mockApi.createDocument.mock.calls[0][0];
    expect(fd.get('company')).toBe('1');
    expect(fd.get('title')).toBe('گواهی صلاحیت جدید');
    expect(fd.get('issue_date')).toBe('1403/01/01');
    expect(component.companyDocuments.some(d => d.id === 88)).toBe(true);
    expect(component.filteredDocuments.some(d => d.id === 88)).toBe(true);
    expect(context.count('documents')).toBe(3);
    expect(component.newDoc.file).toBeNull();
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('با موفقیت در آرشیو ثبت شد'));
  });

  it('پاسخ دیررس بارگذاری پس از رفتن به شرکت دیگر فرم و فهرست آن شرکت را دست نمی‌زند', () => {
    const late = new Subject<any>();
    mockApi.createDocument.mockReturnValueOnce(late.asObservable());
    setCompany(1);
    component.newDoc.file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    component.newDoc.title = 'مدرک شرکت یک';
    component.uploadNewDocument();
    setCompany(2);
    component.newDoc.title = 'پیش‌نویس شرکت دو';
    late.next({ id: 77, company: 1, title: 'مدرک شرکت یک', document_type: 'other' });
    expect(component.newDoc.title).toBe('پیش‌نویس شرکت دو');
    expect(component.companyDocuments.some(d => d.id === 77)).toBe(false);
    expect(component.isUploadingDoc).toBe(false);
  });

  it('تاریخ صدور و انقضای مدرک از تقویم شمسی تنظیم می‌شوند', () => {
    setCompany(1);
    component.onDocIssueDateSelect('1404/01/01');
    expect(component.newDoc.issue_date).toBe('1404/01/01');
    component.onDocExpiryDateSelect({ shamsi: '1405/01/01' });
    expect(component.newDoc.expiry_date).toBe('1405/01/01');
    expect(component.docExpiryDateControl.value).toBe('1405/01/01');
  });

  it('حذف مدرک پس از تأیید از فهرست و شمارنده برداشته می‌شود', async () => {
    setCompany(1);
    await component.deleteCompanyDocument(component.companyDocuments[0]);
    expect(mockApi.deleteDocument).toHaveBeenCalledWith(1);
    expect(component.companyDocuments.map(d => d.id)).toEqual([2]);
    expect(context.count('documents')).toBe(1);
  });

  it('مدرک انتخاب‌شده و ثبت‌نشده در هشدار خروج استودیو حساب می‌شود (registerDirty)', () => {
    setCompany(1);
    expect(context.isDirty()).toBe(false);
    component.newDoc.title = 'پیش‌نویس';
    expect(context.isDirty()).toBe(true);
    setCompany(2);
    expect(context.isDirty()).toBe(false);
  });

  it('رویداد وب‌سوکت مدرک همین شرکت دوباره دریافت می‌کند؛ اکوی همین تب و شرکت دیگر نادیده گرفته می‌شود', () => {
    setCompany(1);
    mockApi.getDocuments.mockClear();
    mockWs.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_document', company_id: 1, client_tab_id: 'this-tab' });
    mockWs.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_document', company_id: 12 });
    expect(mockApi.getDocuments).not.toHaveBeenCalled();
    mockWs.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_document', company_id: 1, client_tab_id: 'other' });
    expect(mockApi.getDocuments).toHaveBeenCalledTimes(1);
  });

  it('شکست دریافت حالت خطا با «تلاش دوباره» دارد', () => {
    mockApi.getDocuments.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    setCompany(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('دریافت مدارک بایگانی انجام نشد.');
    const retry = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تلاش دوباره')) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(mockApi.getDocuments).toHaveBeenCalledTimes(2);
    expect(el.textContent).not.toContain('دریافت مدارک بایگانی انجام نشد.');
  });

  it('پیش‌نمایش مدرک در لایت‌باکس مشترک باز می‌شود و مدرک بی‌فایل پیام می‌دهد', () => {
    setCompany(1);
    component.openPreview(component.companyDocuments[1]);
    expect(component.docPreview!.previewModal.isOpen).toBe(true);
    expect(component.docPreview!.previewModal.title).toBe('کارت بازرگانی');
    expect(component.docPreview!.previewModal.isImage).toBe(true);
    component.docPreview!.closePreview();

    component.openPreview({ id: 9, company: 1, title: 'بی‌فایل', document_type: 'other' } as any);
    expect(mockToast.warning).toHaveBeenCalledWith('فایل مدرک در دسترس نیست.');
    expect(component.docPreview!.previewModal.isOpen).toBe(false);
  });
});
