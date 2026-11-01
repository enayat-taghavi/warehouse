// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';

import { TreasurerBankAccountsComponent } from './treasurer-bank-accounts';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('TreasurerBankAccountsComponent (DOM Specs)', () => {
  let fixture: ComponentFixture<TreasurerBankAccountsComponent>;
  let component: TreasurerBankAccountsComponent;
  let mockCompanyApi: { getBankAccounts: ReturnType<typeof vi.fn> };

  const sampleAccount = {
    id: 1,
    company: 1,
    company_name: 'شرکت الف',
    bank_name: 'بانک آزمون',
    sheba_number: 'IR000000000000000000000001',
    account_number: '123',
    account_title: 'جاری',
    is_primary: true,
    is_active: true
  };

  beforeEach(async () => {
    mockCompanyApi = {
      getBankAccounts: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TreasurerBankAccountsComponent],
      providers: [
        provideRouter([]),
        { provide: CompanyApiService, useValue: mockCompanyApi }
      ]
    }).compileComponents();
  });

  it('shows real accounts from the server', () => {
    mockCompanyApi.getBankAccounts.mockReturnValue(of([sampleAccount]));

    fixture = TestBed.createComponent(TreasurerBankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledTimes(1);
    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledWith();
    expect(text).toContain('بانک آزمون');
    expect(text).toContain('IR000000000000000000000001');
    expect(text).toContain('اصلی');
  });

  it('accepts a paginated response', () => {
    mockCompanyApi.getBankAccounts.mockReturnValue(
      of({
        count: 1,
        results: [sampleAccount]
      })
    );

    fixture = TestBed.createComponent(TreasurerBankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('بانک آزمون');
  });

  it('shows empty state', () => {
    mockCompanyApi.getBankAccounts.mockReturnValue(of([]));

    fixture = TestBed.createComponent(TreasurerBankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('هنوز حساب بانکی');
  });

  it('shows error with retry', () => {
    mockCompanyApi.getBankAccounts.mockReturnValue(throwError(() => new Error('x')));

    fixture = TestBed.createComponent(TreasurerBankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('دریافت حسابهای بانکی انجام نشد');

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const retryBtn = buttons.find(b => b.textContent?.includes('تلاش دوباره'));
    expect(retryBtn).toBeTruthy();

    retryBtn!.click();
    fixture.detectChanges();

    expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledTimes(2);
  });

  it('no fake data', () => {
    mockCompanyApi.getBankAccounts.mockReturnValue(of([]));

    fixture = TestBed.createComponent(TreasurerBankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('بانک ملت');
    expect(text).not.toContain('موجودی');
    expect(text).not.toContain('انتقال وجه');
    expect(text).not.toContain('صندوق');
  });
});
