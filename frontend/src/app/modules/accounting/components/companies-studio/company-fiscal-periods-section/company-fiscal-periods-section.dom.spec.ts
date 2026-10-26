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
    expect(labels).not.toContain('انجماد');
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

  it('ایجاد، بستن و بازگشایی دوره با پرسش تأیید (A10) و انصراف بی‌اجرا', async () => {
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

  it('اعتبارسنجی فرم: بدون عنوان یا با پایان پیش از آغاز ثبت نمی‌شود', () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    component.saveFiscalPeriod();
    expect(mockToast.warning).toHaveBeenCalledWith('لطفاً عنوان دوره مالی را وارد فرمایید.');
    component.newFiscalPeriod = { fiscal_year: '', title: 'عنوان', start_date: '1404/12/01', end_date: '1404/01/01', notes: '' };
    component.saveFiscalPeriod();
    expect(component.fieldErrors.end_date).toBe('تاریخ پایان دوره مالی نمی‌تواند قبل از تاریخ آغاز آن باشد.');
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

  it('دکمه‌های دورهٔ باز هرگز برچسب «انجماد» ندارند و متد freezeFiscalPeriod وجود ندارد', () => {
    setCompany(1);
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const labels = buttons.map(b => b.textContent?.trim() || '');
    expect(labels.some(l => l.includes('انجماد'))).toBe(false);
    expect((component as any).freezeFiscalPeriod).toBeUndefined();
  });

  it('دورهٔ مالی بسته شده (با closed_at و closed_by_name) دکمهٔ بازگشایی دارد ولی دکمهٔ بستن سال مالی ندارد، آیکون قفل در نشان وضعیت و نام مدیر مالی رندر می‌شود', () => {
    const closedPeriod = {
      ...period(),
      status: 'closed' as const,
      status_display: 'بسته شده رسمی',
      closed_at: '2026-03-20T08:00:00Z',
      closed_by_name: 'مدیر مالی'
    };
    mockApi.getFiscalPeriods.mockReturnValueOnce(of([closedPeriod]));
    setCompany(1);

    const el: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[];
    const labels = buttons.map(b => b.textContent?.trim() || '');

    expect(labels.some(l => l.includes('بازگشایی'))).toBe(true);
    expect(labels.some(l => l.includes('بستن سال مالی'))).toBe(false);

    const lockIcon = el.querySelector('[appIcon="status-locked"]');
    expect(lockIcon).not.toBeNull();

    expect(el.textContent).toContain('بسته شده');
    expect(el.textContent).toContain('مدیر مالی');
  });

  it('متد closeFiscalPeriod با انصراف mockConfirm.open فراخوانی API انجام نمی‌دهد؛ با تأیید API فراخوانی شده و فهرست دوره‌ها مجدداً با getFiscalPeriods بارگذاری می‌شود', async () => {
    setCompany(1);
    const p = component.companyFiscalPeriods[0];
    mockApi.closeFiscalPeriod.mockClear();
    mockApi.getFiscalPeriods.mockClear();

    mockConfirm.open.mockResolvedValueOnce(false);
    await component.closeFiscalPeriod(p);
    expect(mockApi.closeFiscalPeriod).not.toHaveBeenCalled();
    expect(mockApi.getFiscalPeriods).not.toHaveBeenCalled();

    mockConfirm.open.mockResolvedValueOnce(true);
    await component.closeFiscalPeriod(p);
    expect(mockApi.closeFiscalPeriod).toHaveBeenCalledWith(p.id);
    expect(mockApi.getFiscalPeriods).toHaveBeenCalledWith(1);
  });

  it('بازگشایی دوره با اکشن سرور reopen-period از تأیید mockConfirm.open عبور کرده و وضعیت دوره را به open تغییر می‌دهد', async () => {
    setCompany(1);
    const p = { ...period(), status: 'closed' as const, is_locked: true };
    component.companyFiscalPeriods = [p];
    mockApi.reopenFiscalPeriod.mockClear();
    mockConfirm.open.mockClear();

    mockConfirm.open.mockResolvedValueOnce(false);
    await component.reopenFiscalPeriod(p);
    expect(mockApi.reopenFiscalPeriod).not.toHaveBeenCalled();
    expect(p.status).toBe('closed');

    // تایید بازگشایی روی اندپوینت reopen-period
    mockConfirm.open.mockResolvedValueOnce(true);
    await component.reopenFiscalPeriod(p);
    expect(mockConfirm.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    expect(mockApi.reopenFiscalPeriod).toHaveBeenCalledWith(p.id);
    expect(p.status).toBe('open');
  });

  it('رد شدن createFiscalPeriod با خطای ۴۰۰ فیلددار ({ start_date: [...] }) فرم را باز نگه می‌دارد، fieldErrors.start_date را تنظیم می‌کند، عنصر #fp_start_date_error را رندر کرده و aria-invalid فیلد آغاز را true می‌کند', () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    fixture.detectChanges();

    component.newFiscalPeriod = {
      fiscal_year: '1404',
      title: 'سال مالی ۱۴۰۴',
      start_date: '1404/01/01',
      end_date: '1404/12/29',
      notes: ''
    };

    const overlapError = {
      status: 400,
      error: {
        start_date: ['این بازه با دورهٔ مالی ۱۴۰۴ همپوشانی دارد.']
      }
    };
    mockApi.createFiscalPeriod.mockReturnValueOnce(throwError(() => overlapError));

    component.saveFiscalPeriod();
    fixture.detectChanges();

    expect(component.showFiscalPeriodForm).toBe(true);
    expect(component.fieldErrors.start_date).toBe('این بازه با دورهٔ مالی ۱۴۰۴ همپوشانی دارد.');

    const errorEl = fixture.nativeElement.querySelector('#fp_start_date_error') as HTMLElement;
    expect(errorEl).not.toBeNull();
    expect(errorEl.textContent).toContain('این بازه با دورهٔ مالی ۱۴۰۴ همپوشانی دارد.');
    expect(errorEl.getAttribute('role')).toBe('alert');

    const startInput = fixture.nativeElement.querySelector('input[aria-label="تاریخ شروع دوره"]') as HTMLInputElement;
    expect(startInput).not.toBeNull();
    expect(startInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('خطای ۴۰۰ با { detail: "x" } پیام را فقط در toast.error نشان می‌دهد و fieldErrors را خالی نگه می‌دارد', () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    fixture.detectChanges();

    component.newFiscalPeriod = {
      fiscal_year: '1404',
      title: 'سال مالی ۱۴۰۴',
      start_date: '1404/01/01',
      end_date: '1404/12/29',
      notes: ''
    };

    mockApi.createFiscalPeriod.mockReturnValueOnce(throwError(() => ({
      status: 400,
      error: { detail: 'خطای اعتبارسنجی کلی دوره مالی' }
    })));

    component.saveFiscalPeriod();
    fixture.detectChanges();

    expect(mockToast.error).toHaveBeenCalledWith('خطای اعتبارسنجی کلی دوره مالی');
    expect(component.fieldErrors).toEqual({});
  });

  it('ذخیره دوره مالی با سال خالی و عنوان و تاریخ معتبر، createFiscalPeriod را با payload بدون کلید fiscal_year فراخوانی می‌کند', () => {
    setCompany(1);
    component.openCreateFiscalPeriod();
    fixture.detectChanges();

    component.newFiscalPeriod = {
      fiscal_year: '',
      title: 'سال مالی بدون سال صریح',
      start_date: '1405/01/01',
      end_date: '1405/12/29',
      notes: ''
    };

    component.saveFiscalPeriod();
    fixture.detectChanges();

    expect(mockApi.createFiscalPeriod).toHaveBeenCalledTimes(1);
    const sentPayload = mockApi.createFiscalPeriod.mock.calls[0][0];
    expect('fiscal_year' in sentPayload).toBe(false);
    expect(sentPayload.title).toBe('سال مالی بدون سال صریح');
    expect(sentPayload.start_date).toBe('1405/01/01');
    expect(sentPayload.end_date).toBe('1405/12/29');
  });
});
