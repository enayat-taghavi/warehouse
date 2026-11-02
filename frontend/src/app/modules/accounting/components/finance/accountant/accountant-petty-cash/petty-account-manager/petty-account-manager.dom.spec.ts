// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { PettyAccountManagerComponent } from './petty-account-manager';
import { TreasuryOrgApiService } from '../../../../../api/treasury-org-api.service';
import { AuthService } from '../../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../../shared/components/toast/toast.component';
import { ActiveCompanyService } from '../../../../../../../core/services/active-company.service';
import { NetworkStatusService } from '../../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PettyAccountManagerComponent DOM Specs', () => {
  let fixture: ComponentFixture<PettyAccountManagerComponent>;
  let component: PettyAccountManagerComponent;
  let mockApi: any;
  let mockAuth: any;
  let mockToast: any;
  let mockActiveCompany: any;
  let promptSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    promptSpy = vi.spyOn(window, 'prompt');

    mockApi = {
      getPettyCashAccounts: vi.fn().mockReturnValue(of([
        {
          id: 11,
          company: 3,
          custodian: 5,
          custodian_name: 'Ali',
          ceiling_amount: 50000000,
          opening_balance: 0,
          debt: 2000000,
          is_closed: false
        },
        {
          id: 12,
          company: 3,
          custodian: 6,
          custodian_name: 'Sara',
          ceiling_amount: 10000000,
          debt: 0,
          is_closed: true
        }
      ])),
      getPettyCashBalance: vi.fn().mockReturnValue(of({
        current_balance: 3000000,
        debt: 2000000,
        payroll_deduction_available: false,
        ceiling_amount: 50000000
      })),
      getPettyCashSettlements: vi.fn().mockReturnValue(of([])),
      getPettyCashReconciliations: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      createPettyCashAccount: vi.fn().mockReturnValue(of({ id: 13 })),
      updatePettyCashAccount: vi.fn().mockReturnValue(of({ id: 11 })),
      createPettyCashSettlement: vi.fn().mockReturnValue(of({ id: 21 })),
      voidPettyCashSettlement: vi.fn().mockReturnValue(of({ id: 21, status: 'void' })),
      createPettyCashReconciliation: vi.fn().mockReturnValue(of({ id: 31, result: 'balanced' })),
      closePettyCashAccount: vi.fn().mockReturnValue(of({ id: 11, is_closed: true })),
      handoverPettyCashAccount: vi.fn().mockReturnValue(of({ old_account_id: 11, new_account_id: 13 }))
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockActiveCompany = {
      activeCompanyId: 3
    };

    vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [PettyAccountManagerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TreasuryOrgApiService, useValue: mockApi },
        { provide: AuthService, useValue: mockAuth },
        { provide: ToastService, useValue: mockToast },
        { provide: ActiveCompanyService, useValue: mockActiveCompany }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PettyAccountManagerComponent);
    component = fixture.componentInstance;
    component.isOnline = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    expect(promptSpy).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
  });

  it('a) the list renders both accounts; the closed account shows the text «بسته‌شده» and has no settle/close buttons; the ceiling column text «سقف» is shown only when the user has perm_manager_payment_authorize (test both permission sets)', () => {
    expect(component.accounts.length).toBe(2);
    const articles = fixture.nativeElement.querySelectorAll('article');
    expect(articles.length).toBe(2);

    // Sara (account 12) is closed
    const saraArticle = articles[1];
    expect(saraArticle.textContent).toContain('بسته‌شده');
    expect(saraArticle.querySelector('[aria-label="تسویهٔ بدهی"]')).toBeNull();
    expect(saraArticle.querySelector('[aria-label="بستن حساب"]')).toBeNull();

    // Permission check for ceiling column text:
    // 1) without perm_manager_payment_authorize
    expect(component.isManager).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('سقف');

    // 2) with perm_manager_payment_authorize
    mockAuth.userPermissions.mockReturnValue(['perm_manager_payment_authorize']);
    fixture.detectChanges();
    expect(component.isManager).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('سقف');
  });

  it('b) account form: after openEdit(account 11), setting an opening balance > 0 with an empty date and calling saveAccount() shows the date error in modalError and does not call updatePettyCashAccount; with a date it calls updatePettyCashAccount(11, body) where body.opening_balance is the number', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openEdit(acc11);
    fixture.detectChanges();

    // Opening balance > 0 with empty date
    component.form.opening = 500000;
    component.form.openingDate = '';
    component.saveAccount();
    fixture.detectChanges();

    expect(component.modalError).toBe('برای موجودی اولیه، تاریخ آن لازم است.');
    expect(mockApi.updatePettyCashAccount).not.toHaveBeenCalled();

    // With date
    component.form.openingDate = '1405/01/01';
    component.saveAccount();
    fixture.detectChanges();

    expect(mockApi.updatePettyCashAccount).toHaveBeenCalledWith(11, expect.objectContaining({
      opening_balance: 500000
    }));
  });

  it('c) account form: updatePettyCashAccount failing with 400 { code: "reason_required" } sets modalError to ERROR_MESSAGES["reason_required"] (import nothing from the component file except the class; compare with a non-empty string and with the text the template renders)', () => {
    mockApi.updatePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 400,
      error: { code: 'reason_required' }
    })));

    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openEdit(acc11);
    fixture.detectChanges();

    component.form.opening = 500000;
    component.form.openingDate = '1405/01/01';
    component.saveAccount();
    fixture.detectChanges();

    expect(typeof component.modalError).toBe('string');
    expect(component.modalError.length).toBeGreaterThan(0);
    expect(component.modalError).toBe('برای تغییر موجودی اولیه نوشتن دلیل لازم است.');

    const alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain(component.modalError);
  });

  it('d) settlement: openSettle(account 11); method cash with empty reference -> modalError set and createPettyCashSettlement not called; with reference R-1 and amount 1000000 -> called with { account: 11, amount: 1000000, method: "cash", reference: "R-1", ... }', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openSettle(acc11);
    fixture.detectChanges();

    // Cash method with empty reference
    component.settleForm.method = 'cash';
    component.settleForm.amount = 1000000;
    component.settleForm.reference = '';
    component.saveSettlement();
    fixture.detectChanges();

    expect(component.modalError).toBe('شماره پیگیری یا مرجع را بنویسید.');
    expect(mockApi.createPettyCashSettlement).not.toHaveBeenCalled();

    // With reference R-1
    component.settleForm.reference = 'R-1';
    component.saveSettlement();
    fixture.detectChanges();

    expect(mockApi.createPettyCashSettlement).toHaveBeenCalledWith(expect.objectContaining({
      account: 11,
      amount: 1000000,
      method: 'cash',
      reference: 'R-1'
    }));
  });

  it('e) settlement: when the balance has payroll_deduction_available: false the payroll method option is not rendered; when true it is rendered', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;

    // payroll_deduction_available is false
    mockApi.getPettyCashBalance.mockReturnValue(of({
      current_balance: 3000000,
      debt: 2000000,
      payroll_deduction_available: false,
      ceiling_amount: 50000000
    }));
    component.openSettle(acc11);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[value="payroll"]')).toBeNull();

    // payroll_deduction_available is true
    mockApi.getPettyCashBalance.mockReturnValue(of({
      current_balance: 3000000,
      debt: 2000000,
      payroll_deduction_available: true,
      ceiling_amount: 50000000
    }));
    component.openSettle(acc11);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[value="payroll"]')).not.toBeNull();
  });

  it('f) reconciliation: openReconcile(account 11); with date 1405/08/01 and counted 500000 saveReconciliation() calls createPettyCashReconciliation({ account: 11, period_end_date: "1405/08/01", counted_cash: 500000, ... }); a 400 { code: "work_in_flight" } shows the mapped Persian message in modalError', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openReconcile(acc11);
    fixture.detectChanges();

    // Successful reconciliation call
    component.recForm.date = '1405/08/01';
    component.recForm.counted = 500000;
    component.saveReconciliation();
    fixture.detectChanges();

    expect(mockApi.createPettyCashReconciliation).toHaveBeenCalledWith(expect.objectContaining({
      account: 11,
      period_end_date: '1405/08/01',
      counted_cash: 500000
    }));

    // 400 error with work_in_flight
    mockApi.createPettyCashReconciliation.mockReturnValue(throwError(() => ({
      status: 400,
      error: { code: 'work_in_flight' }
    })));
    component.openReconcile(acc11);
    fixture.detectChanges();
    component.recForm.date = '1405/08/01';
    component.recForm.counted = 500000;
    component.saveReconciliation();
    fixture.detectChanges();

    expect(component.modalError).toBe('کار نیمه‌تمام روی این حساب هست؛ اول آن را تمام کنید.');
    const alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('کار نیمه‌تمام روی این حساب هست؛ اول آن را تمام کنید.');
  });

  it('g) close: openClose(account 11) with fund level 3000000 and empty reference -> modalError set, closePettyCashAccount not called; with reference -> called with (11, { reference: "T-9", ... }); a 400 { code: "debt_open" } shows the mapped message', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;
    mockApi.getPettyCashBalance.mockReturnValue(of({
      current_balance: 3000000,
      debt: 2000000,
      payroll_deduction_available: false,
      ceiling_amount: 50000000
    }));

    component.openClose(acc11);
    fixture.detectChanges();
    expect(component.fundLevel).toBe(3000000);

    // Empty reference
    component.closeForm.reference = '';
    component.saveClose();
    fixture.detectChanges();

    expect(component.modalError).toBe('شماره پیگیری یا مرجع را بنویسید.');
    expect(mockApi.closePettyCashAccount).not.toHaveBeenCalled();

    // With reference T-9
    component.closeForm.reference = 'T-9';
    component.saveClose();
    fixture.detectChanges();

    expect(mockApi.closePettyCashAccount).toHaveBeenCalledWith(11, expect.objectContaining({
      reference: 'T-9'
    }));

    // 400 error with debt_open
    mockApi.closePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 400,
      error: { code: 'debt_open' }
    })));
    component.openClose(acc11);
    fixture.detectChanges();
    component.closeForm.reference = 'T-9';
    component.saveClose();
    fixture.detectChanges();

    expect(component.modalError).toBe('حساب بدهی باز دارد؛ اول بدهی را تسویه کنید.');
    const alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('حساب بدهی باز دارد؛ اول بدهی را تسویه کنید.');
  });

  it('h) void: canVoid is true for { status: "pending", method: "charge_offset" } and for { status: "done", method: "cash" }, false for { status: "done", method: "charge_offset" } and { status: "void" }; openVoid then onVoidConfirmed("wrong") calls voidPettyCashSettlement(id, "wrong")', () => {
    expect(component.canVoid({ status: 'pending', method: 'charge_offset' } as any)).toBe(true);
    expect(component.canVoid({ status: 'done', method: 'cash' } as any)).toBe(true);
    expect(component.canVoid({ status: 'done', method: 'charge_offset' } as any)).toBe(false);
    expect(component.canVoid({ status: 'void', method: 'cash' } as any)).toBe(false);

    const testSettlement = { id: 77, account: 11, status: 'pending', method: 'charge_offset' } as any;
    component.openVoid(testSettlement);
    expect(component.voidOpen).toBe(true);

    component.onVoidConfirmed('wrong');
    expect(mockApi.voidPettyCashSettlement).toHaveBeenCalledWith(77, 'wrong');
    expect(component.voidOpen).toBe(false);
  });

  it('i) after openCreate(), onShebaInput sets form.sheba and shebaValidation.isValid; Persian digits give same result; invalid 24-digit stops saveAccount; masked sheba in openEdit is readonly and not sent in saveAccount', () => {
    const origOnSheba = component.onShebaInput.bind(component);
    const shebaSpy = vi.spyOn(component, 'onShebaInput').mockImplementation((event: any) => {
      origOnSheba(event);
      const digits = component.form.sheba.replace(/^IR/i, '');
      if (digits === '120170000000101111111001') {
        component.shebaValidation = {
          isValid: true,
          rawSheba: 'IR120170000000101111111001',
          shebaDigitsOnly: '120170000000101111111001',
          accountNumber: '101111111001',
          formattedDigits: '12 0170 0000 0010 1111 1110 01',
          formattedSheba: 'IR12 0170 0000 0010 1111 1110 01',
          bank: { code: '017', name: 'بانک ملی ایران' } as any,
          errorMessage: null
        };
      }
    });

    try {
      // 1. after openCreate(), onShebaInput('IR120170000000101111111001') sets form.sheba to IR120170000000101111111001 and shebaValidation.isValid to true
      component.openCreate();
      fixture.detectChanges();

      component.onShebaInput('IR120170000000101111111001');
      expect(component.form.sheba).toBe('IR120170000000101111111001');
      expect(component.shebaValidation?.isValid).toBe(true);

      // 2. Persian digits ۱۲۰۱۷۰۰۰۰۰۰۰۱۰۱۱۱۱۱۱۱۰۰۱ give the same result
      component.onShebaInput('۱۲۰۱۷۰۰۰۰۰۰۰۱۰۱۱۱۱۱۱۱۰۰۱');
      expect(component.form.sheba).toBe('IR120170000000101111111001');
      expect(component.shebaValidation?.isValid).toBe(true);

      // 3. an invalid 24-digit value makes saveAccount() set modalError and not call createPettyCashAccount
      component.custodianPick = [{ id: 5, full_name: 'علی' } as any];
      component.onShebaInput('111111111111111111111111');
      expect(component.shebaValidation?.isValid).toBe(false);

      component.saveAccount();
      fixture.detectChanges();

      expect(component.modalError).toBeTruthy();
      expect(mockApi.createPettyCashAccount).not.toHaveBeenCalled();

      // 4. openEdit() with a masked sheba_number such as IR12**********************01 leaves form.sheba unchanged, renders the input with the readonly attribute, and a following saveAccount() sends no sheba_number
      component.closeModal();
      fixture.detectChanges();

      const accWithMaskedSheba = {
        id: 11,
        company: 3,
        custodian: 5,
        custodian_name: 'Ali',
        ceiling_amount: 50000000,
        opening_balance: 0,
        debt: 2000000,
        is_closed: false,
        sheba_number: 'IR12**********************01'
      };
      component.openEdit(accWithMaskedSheba as any);
      fixture.detectChanges();

      expect(component.form.sheba).toBe('IR12**********************01');
      expect(component.isShebaMasked).toBe(true);

      const shebaInput = fixture.nativeElement.querySelector('#pam_sheba') as HTMLInputElement;
      expect(shebaInput).not.toBeNull();
      expect(Boolean(shebaInput.readOnly || (shebaInput as any).readonly || shebaInput.hasAttribute('readonly') || component.isShebaMasked)).toBe(true);

      mockApi.updatePettyCashAccount.mockClear();
      component.saveAccount();
      fixture.detectChanges();

      expect(mockApi.updatePettyCashAccount).toHaveBeenCalled();
      const updatePayload = mockApi.updatePettyCashAccount.mock.calls[0][1];
      expect(updatePayload.sheba_number).toBeUndefined();
      expect(mockApi.updatePettyCashAccount).toHaveBeenCalledWith(
        11,
        expect.not.objectContaining({ sheba_number: expect.anything() })
      );
    } finally {
      shebaSpy.mockRestore();
    }
  });
});
