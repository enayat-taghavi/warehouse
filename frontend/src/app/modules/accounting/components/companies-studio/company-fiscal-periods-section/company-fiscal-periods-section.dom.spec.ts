// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError, Subject } from 'rxjs';

import { CompanyFiscalPeriodsSectionComponent } from './company-fiscal-periods-section';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyFiscalPeriodsSectionComponent (بخش دوره‌های مالی استودیوی شرکت)', () => {
  let fixture: ComponentFixture<CompanyFiscalPeriodsSectionComponent>;
  let component: CompanyFiscalPeriodsSectionComponent;
  let context: CompanyStudioContextService;
  let mockApi: any;
  let mockToast: any;
  let mockConfirm: any;

  const period = () => ({
    id: 1,
    company: 1,
    fiscal_year: '1403',
    title: 'سال مالی ۱۴۰۳',
    start_date: '1403/01/01',
    end_date: '1403/12/29',
    status: 'open',
    status_display: 'جاری و باز',
    is_active: true
  });

  beforeEach(async () => {
    mockApi = {
      getFiscalPeriods: vi.fn().mockReturnValue(of([period()])),
      createFiscalPeriod: vi.fn().mockImplementation((payload: any) => of({ id: 2, ...payload, status: 'open', status_display: 'جاری و باز', is_active: true })),
      closeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'ok' })),
      freezeFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'ok' })),
      reopenFiscalPeriod: vi.fn().mockReturnValue(of({ detail: 'ok' }))
    };
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn() };
    mockConfirm = { open: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [CompanyFiscalPeriodsSectionComponent],
      providers: [
        CompanyStudioContextService,
        { provide: CompanyApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirm }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    fixture = TestBed.createComponent(CompanyFiscalPeriodsSectionComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  const setCompany = (id: number | null) => {
    fixture.componentRef.setInput('companyId', id);
    fixture.detectChanges();
  };

  it('B5 و ت۷: دوره‌ها کارت موبایل با دکمه‌های برچسب‌دار دارند و سال و تاریخ فارسی‌اند', () => {
    setCompany(1);
    const card = fixture.nativeElement.querySelector('ul.xl\\:hidden li') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('۱۴۰۳/۰۱/۰۱');
    const labels = Array.from(card.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(labels).toContain('انجماد');
    expect(labels).toContain('بستن سال مالی');
  });

  it('E2: دورهٔ در صف ارسال نشان دارد و کارهای حساس آن غیرفعال است', () => {
    mockApi.getFiscalPeriods.mockReturnValueOnce(of([{ ...period(), id: -3, _offlinePending: true }]));
    setCompany(1);
    const card = fixture.nativeElement.querySelector('ul.xl\\:hidden li') as HTMLElement;
    expect(card.querySelector('app-offline-pending-badge')).not.toBeNull();
    const buttons = Array.from(card.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(b => b.disabled)).toBe(true);
    expect(buttons[0].title).toBe('پس از ارسال دوره به سرور در دسترس است');
  });

  it('شرکت تازه (بدون شناسه): پیام «پس از ثبت اولیه» و هیچ درخواستی', () => {
    setCompany(null);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('پس از ثبت اولیه مشخصات شرکت، امکان تعریف دوره‌های مالی');
    expect(el.textContent).not.toContain('تعریف دوره مالی جدید');
    expect(mockApi.getFiscalPeriods).not.toHaveBeenCalled();
  });

  it('با شناسهٔ شرکت دوره‌ها یک بار دریافت و در جدول رندر می‌شوند', () => {
    setCompany(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(mockApi.getFiscalPeriods).toHaveBeenCalledTimes(1);
    expect(mockApi.getFiscalPeriods).toHaveBeenCalledWith(1);
    expect(el.textContent).toContain('دوره‌های مالی رسمی و وضعیت بستن سال‌ها');
    expect(el.textContent).toContain('سال مالی ۱۴۰۳');
    expect(el.textContent).toContain('جاری و باز');
    fixture.detectChanges();
    expect(mockApi.getFiscalPeriods).toHaveBeenCalledTimes(1);
  });

  it('ایجاد، انجماد، بستن و بازگشایی دوره با پرسش تأیید (A10) و انصراف بی‌اجرا', async () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    fixture.detectChanges();
    expect(component.showFiscalPeriodForm).toBe(true);

    component.newFiscalPeriod.fiscal_year = '1404';
    component.newFiscalPeriod.title = 'سال مالی ۱۴۰۴';
    component.newFiscalPeriod.start_date = '1404/01/01';
    component.newFiscalPeriod.end_date = '1404/12/29';
    component.saveFiscalPeriod();
    fixture.detectChanges();
    expect(mockApi.createFiscalPeriod).toHaveBeenCalledWith(expect.objectContaining({ company: 1, fiscal_year: '1404', title: 'سال مالی ۱۴۰۴' }));
    expect(component.showFiscalPeriodForm).toBe(false);
    expect(component.companyFiscalPeriods.length).toBe(2);

    const p = component.companyFiscalPeriods[1];
    await component.freezeFiscalPeriod(p);
    expect(mockApi.freezeFiscalPeriod).toHaveBeenCalledWith(p.id);
    expect(p.status).toBe('frozen');

    await component.closeFiscalPeriod(p);
    expect(mockApi.closeFiscalPeriod).toHaveBeenCalledWith(p.id);
    expect(p.status).toBe('closed');
    expect(mockConfirm.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger' }));

    await component.reopenFiscalPeriod(p);
    expect(mockApi.reopenFiscalPeriod).toHaveBeenCalledWith(p.id);
    expect(p.status).toBe('open');

    mockConfirm.open.mockResolvedValueOnce(false);
    mockApi.closeFiscalPeriod.mockClear();
    await component.closeFiscalPeriod(p);
    expect(mockApi.closeFiscalPeriod).not.toHaveBeenCalled();
    expect(p.status).toBe('open');
  });

  it('اعتبارسنجی فرم: بدون سال مالی یا با پایان پیش از آغاز ثبت نمی‌شود', () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    component.saveFiscalPeriod();
    expect(mockToast.warning).toHaveBeenCalledWith('لطفاً سال مالی (مثال: ۱۴۰۳) را وارد فرمایید.');
    component.newFiscalPeriod = { fiscal_year: '1404', title: 'عنوان', start_date: '1404/12/01', end_date: '1404/01/01', notes: '' };
    component.saveFiscalPeriod();
    expect(mockToast.warning).toHaveBeenCalledWith('تاریخ پایان دوره مالی نمی‌تواند قبل از تاریخ آغاز آن باشد.');
    expect(mockApi.createFiscalPeriod).not.toHaveBeenCalled();
  });

  it('شکست دریافت حالت خطا با «تلاش دوباره» دارد', () => {
    mockApi.getFiscalPeriods.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    setCompany(1);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('دریافت دوره‌های مالی انجام نشد.');
    const retry = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('تلاش دوباره')) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(mockApi.getFiscalPeriods).toHaveBeenCalledTimes(2);
    expect(el.textContent).not.toContain('دریافت دوره‌های مالی انجام نشد.');
    expect(el.textContent).toContain('سال مالی ۱۴۰۳');
  });

  it('فرم باز دورهٔ مالی در هشدار خروج استودیو حساب می‌شود (registerDirty)', () => {
    setCompany(1);
    expect(context.isDirty()).toBe(false);
    component.openCreateFiscalPeriod();
    expect(context.isDirty()).toBe(true);
    component.cancelCreateFiscalPeriod();
    expect(context.isDirty()).toBe(false);
    component.openCreateFiscalPeriod();
    fixture.destroy();
    expect(context.isDirty()).toBe(false);
  });

  it('پاسخ دیررسِ شرکت پیشین در بخش شرکت تازه نمی‌نشیند و جابه‌جایی شرکت فرم را می‌بندد', () => {
    const late = new Subject<any>();
    mockApi.getFiscalPeriods.mockReturnValueOnce(late.asObservable());
    setCompany(1);
    component.openCreateFiscalPeriod();
    setCompany(2);
    expect(component.showFiscalPeriodForm).toBe(false);
    late.next([{ ...period(), title: 'دورهٔ شرکت یک' }]);
    expect(component.companyFiscalPeriods.map(p => p.title)).toEqual(['سال مالی ۱۴۰۳']);
  });
});
