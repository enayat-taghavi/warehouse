// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject, throwError } from 'rxjs';
import { CompanyTreasuryTabComponent } from './company-treasury-tab';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { CompanyBankAccount } from '../../../../../core/models/company.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyTreasuryTabComponent — موجودی اولیه حساب بانکی (۳.۳-ج)', () => {
  let fixture: ComponentFixture<CompanyTreasuryTabComponent>;
  let component: CompanyTreasuryTabComponent;
  let context: CompanyStudioContextService;
  let mockCompanyApi: any;
  let mockToast: any;
  let mockWebSocket: any;

  beforeEach(async () => {
    mockCompanyApi = {
      matchesCompanyUrl: vi.fn().mockReturnValue(false),
      getBankAccounts: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          bank_name: 'بانک ملت',
          account_number: '1234567890',
          sheba_number: 'IR160120000000001234567890',
          account_title: 'حساب جاری پاینده',
          is_primary: true,
          is_active: true,
          opening_balance: '10000000',
          opening_balance_date: '1405/01/01',
          has_movements: false
        }
      ])),
      createBankAccount: vi.fn().mockImplementation((data: any) => of({ id: 2, ...data })),
      updateBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteBankAccount: vi.fn().mockReturnValue(of(void 0)),
      setPrimaryBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      setOpeningBalance: vi.fn().mockImplementation((id: number, body: any) => of({ id, ...body })),
      getOpeningHistory: vi.fn().mockReturnValue(of({ count: 0, results: [] }))
    };
    mockToast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockWebSocket = { notifications$: new Subject<any>(), tabId: 'test-client-tab-id' };

    await TestBed.configureTestingModule({
      imports: [CompanyTreasuryTabComponent],
      providers: [
        CompanyStudioContextService,
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    fixture = TestBed.createComponent(CompanyTreasuryTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 1);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('a) ساخت حساب: نبود تاریخ موجودی اولیه فراخوانی API را متوقف و پیام خطا را نمایش می‌دهد؛ با تاریخ، متد فراخوانی می‌شود', async () => {
    component.onShebaInput('IR160120000000001234567890');
    component.newAccount.opening_balance_date = '';
    component.newAccount.opening_balance = '';

    await component.saveBankAccount();
    fixture.detectChanges();

    expect(mockCompanyApi.createBankAccount).not.toHaveBeenCalled();
    expect(component.createFieldErrors.opening_balance_date).toBe('تاریخ موجودی اولیه الزامی است.');
    const errorEl = fixture.nativeElement.querySelector('#bank_opening_date_error');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain('تاریخ موجودی اولیه الزامی است.');

    component.newAccount.opening_balance_date = '1405/01/01';
    await component.saveBankAccount();
    fixture.detectChanges();

    expect(mockCompanyApi.createBankAccount).toHaveBeenCalledWith(expect.objectContaining({
      opening_balance_date: '1405/01/01',
      opening_balance: '0'
    }));
  });

  it('b) نمایش پوشیده (Masked) و ثبت‌نشده: عدم دسترسی به بانک «—» و حساب بدون تاریخ «ثبت نشده» را نمایش می‌دهد', () => {
    component.companyBankAccounts = [
      {
        id: 1,
        company: 1,
        bank_name: 'بانک ملت',
        account_number: '1234567890',
        sheba_number: 'IR160120000000001234567890',
        opening_balance: null,
        opening_balance_date: null,
        has_movements: false,
        is_primary: true,
        is_active: true
      }
    ];
    context.sectionLevels.set({ bank: 'none', bank_sheba: 'none', bank_opening_balance: 'none' });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const maskedEl = fixture.nativeElement.querySelector('[data-testid="opening-balance-text"]');
    expect(maskedEl?.textContent?.trim()).toBe('—');

    context.sectionLevels.set({ bank: 'read', bank_sheba: 'read', bank_opening_balance: 'read' });
    component.companyBankAccounts = [
      {
        id: 1,
        company: 1,
        bank_name: 'بانک ملت',
        account_number: '1234567890',
        sheba_number: 'IR160120000000001234567890',
        opening_balance: '100000',
        opening_balance_date: null,
        has_movements: false,
        is_primary: true,
        is_active: true
      }
    ];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const notRegisteredEl = fixture.nativeElement.querySelector('[data-testid="opening-balance-text"]');
    expect(notRegisteredEl?.textContent?.trim()).toBe('ثبت نشده');
  });

  it('c) قواعد دکمهٔ تغییر: در حالت خواندن پنهان است؛ در حالت نوشتن با گردش حساب، نیازمند مجوز bank_opening_balance است', () => {
    const acc: CompanyBankAccount = {
      id: 1,
      company: 1,
      bank_name: 'بانک ملت',
      account_number: '1234567890',
      sheba_number: 'IR160120000000001234567890',
      opening_balance: '1000',
      opening_balance_date: '1405/01/01',
      has_movements: false,
      is_primary: true,
      is_active: true
    };
    component.companyBankAccounts = [acc];

    // ۱. دسترسی bank فقط read است -> دکمه پنهان
    context.sectionLevels.set({ bank: 'read', bank_sheba: 'read', bank_opening_balance: 'write' });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.canChangeOpening(acc)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="open-opening-balance"]')).toBeNull();

    // ۲. دسترسی bank نوشتن است ولی حساب گردش دارد و bank_opening_balance سطح write ندارد -> دکمه پنهان
    acc.has_movements = true;
    context.sectionLevels.set({ bank: 'write', bank_sheba: 'write', bank_opening_balance: 'read' });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.canChangeOpening(acc)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="open-opening-balance"]')).toBeNull();

    // ۳. دسترسی bank نوشتن، حساب دارای گردش و bank_opening_balance سطح write دارد -> دکمه نمایش داده می‌شود
    context.sectionLevels.set({ bank: 'write', bank_sheba: 'write', bank_opening_balance: 'write' });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.canChangeOpening(acc)).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="open-opening-balance"]')).not.toBeNull();
  });

  it('d) الزام علت تغییر: برای حساب دارای گردش، ثبت بدون علت متوقف شده و خطای reason تنظیم می‌شود', () => {
    const acc: CompanyBankAccount = {
      id: 1,
      company: 1,
      bank_name: 'بانک ملت',
      account_number: '1234567890',
      sheba_number: 'IR160120000000001234567890',
      opening_balance: '1000',
      opening_balance_date: '1405/01/01',
      has_movements: true,
      is_primary: true,
      is_active: true
    };
    component.companyBankAccounts = [acc];
    context.sectionLevels.set(null);

    component.openOpeningBalance(acc);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    expect(component.openingAccount).toBe(acc);
    expect(component.openingForm.reason).toBe('');

    component.saveOpeningBalance();
    fixture.detectChanges();

    expect(mockCompanyApi.setOpeningBalance).not.toHaveBeenCalled();
    expect(component.openingErrors.reason).toBe('علت تغییر برای حساب دارای گردش الزامی است.');
    const reasonErr = fixture.nativeElement.querySelector('#opening_change_reason_error');
    expect(reasonErr).not.toBeNull();
    expect(reasonErr?.textContent).toContain('علت تغییر برای حساب دارای گردش الزامی است.');
  });

  it('e) خطای دوره مالی بسته (fiscal_period_closed): خطای ۴۰۰ پیام را در فیلد تاریخ نشان می‌دهد و مودال را باز نگه می‌دارد', () => {
    const acc: CompanyBankAccount = {
      id: 1,
      company: 1,
      bank_name: 'بانک ملت',
      account_number: '1234567890',
      sheba_number: 'IR160120000000001234567890',
      opening_balance: '1000',
      opening_balance_date: '1405/01/01',
      has_movements: false,
      is_primary: true,
      is_active: true
    };
    component.companyBankAccounts = [acc];
    context.sectionLevels.set(null);

    component.openOpeningBalance(acc);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    mockCompanyApi.setOpeningBalance.mockReturnValueOnce(
      throwError(() => ({
        status: 400,
        error: {
          opening_balance_date: ['دوره مالی بسته است.'],
          code: 'fiscal_period_closed'
        }
      }))
    );

    component.saveOpeningBalance();
    fixture.detectChanges();

    expect(component.openingErrors.opening_balance_date).toBe('دوره مالی بسته است.');
    expect(component.openingAccount).not.toBeNull();
    const dateErr = fixture.nativeElement.querySelector('#opening_change_date_error');
    expect(dateErr).not.toBeNull();
    expect(dateErr?.textContent).toContain('دوره مالی بسته است.');
  });

  it('f) وضعیت خالی سابقه: در صورت نبود سابقه، پیام «سابقه‌ای ثبت نشده است.» رندر شده و getOpeningHistory فراخوانی می‌شود', () => {
    const acc: CompanyBankAccount = {
      id: 42,
      company: 1,
      bank_name: 'بانک سامان',
      account_number: '987654321',
      sheba_number: 'IR160120000000001234567890',
      opening_balance: '1000',
      opening_balance_date: '1405/01/01',
      has_movements: false,
      is_primary: true,
      is_active: true
    };
    component.companyBankAccounts = [acc];
    context.sectionLevels.set(null);

    component.openOpeningBalance(acc);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    expect(mockCompanyApi.getOpeningHistory).toHaveBeenCalledWith(42);
    expect(component.isLoadingHistory).toBe(false);
    expect(component.openingHistory.length).toBe(0);

    const emptyEl = fixture.nativeElement.querySelector('[data-testid="opening-history-empty"]');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toContain('ثبت نشده است.');
  });

  it('g) ثبت موفق موجودی اولیه: حساب در فهرست به‌روز شده و مودال بسته می‌شود', () => {
    const acc: CompanyBankAccount = {
      id: 1,
      company: 1,
      bank_name: 'بانک ملت',
      account_number: '1234567890',
      sheba_number: 'IR160120000000001234567890',
      opening_balance: '1000',
      opening_balance_date: '1405/01/01',
      has_movements: false,
      is_primary: true,
      is_active: true
    };
    component.companyBankAccounts = [acc];
    context.sectionLevels.set(null);

    component.openOpeningBalance(acc);
    fixture.detectChanges();

    component.openingForm.opening_balance = '25000000';
    component.openingForm.opening_balance_date = '1405/02/01';

    mockCompanyApi.setOpeningBalance.mockReturnValueOnce(
      of({
        id: 1,
        bank_name: 'بانک ملت',
        opening_balance: '25000000',
        opening_balance_date: '1405/02/01'
      })
    );

    component.saveOpeningBalance();
    fixture.detectChanges();

    expect(mockCompanyApi.setOpeningBalance).toHaveBeenCalledWith(1, {
      opening_balance: '25000000',
      opening_balance_date: '1405/02/01',
      reason: ''
    });
    expect(component.openingAccount).toBeNull();
    expect(component.companyBankAccounts[0].opening_balance).toBe('25000000');
    expect(mockToast.success).toHaveBeenCalledWith('موجودی اولیهٔ حساب ثبت شد.');
  });
});
