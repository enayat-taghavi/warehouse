// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { TreasurerInvoicesComponent } from './treasurer-invoices';
import { By } from '@angular/platform-browser';
import { InvoicePaymentPanelComponent } from '../../invoice-payment-panel/invoice-payment-panel.component';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { PrintService } from '../../../../../../core/services/print.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PermissionService } from '../../../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('TreasurerInvoicesComponent — Invoice Payment Modal and Payments DOM Specs (Task A)', () => {
  let fixture: ComponentFixture<TreasurerInvoicesComponent>;
  let component: TreasurerInvoicesComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockTreasuryOrgApi: any;
  let mockCompanyApi: any;
  let mockPrintService: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockConfirm: any;
  let promptSpy: any;
  /** فرم و قسط‌ها در بخش مشترک پرداخت درون پنجره‌اند */
  const panel = (): InvoicePaymentPanelComponent =>
    fixture.debugElement.query(By.directive(InvoicePaymentPanelComponent)).componentInstance;

  beforeAll(async () => {
    Object.defineProperty(TreasurerInvoicesComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || TreasurerInvoicesComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(PrintService),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(WebSocketService, 8)
        );
      },
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    expect(promptSpy).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    promptSpy = vi.spyOn(window, 'prompt');

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'treasurer_user' }),
      currentUser: vi.fn().mockReturnValue({ id: 1, username: 'treasurer_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_treasury', 'admin_all'])
    };

    mockState = {
      user: { id: 1, username: 'treasurer_user' }
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockImplementation(() => of([{ id: 1, name: 'بخش اصلی', is_active: true }])),
      getProjectSections: vi.fn().mockImplementation(() => of([{ id: 1, name: 'بخش اصلی', is_active: true }])),
      getTreasuryCartable: vi.fn().mockImplementation(() => of({
        invoices: [{
          id: 7,
          invoice_number: 'F-7',
          number: 'INV-1405-0007',
          amount: 1000000,
          paid_amount: '400000',
          remaining: '600000',
          status: 'partially_paid',
          counterparty: null
        }]
      })),
      getPettyCashTransactions: vi.fn().mockImplementation(() => of([])),
      getCounterparties: vi.fn().mockImplementation(() => of([])),
      getPartyBankAccounts: vi.fn().mockImplementation(() => of([]))
    };

    mockTreasuryOrgApi = {
      getInvoicePayments: vi.fn().mockImplementation(() => of({
        results: [],
        paid_amount: '400000',
        remaining: '600000'
      })),
      addInvoicePayment: vi.fn().mockImplementation(() => of({
        message: 'قسط با موفقیت ثبت شد',
        paid_amount: '1000000',
        remaining: '0'
      })),
      voidInvoicePayment: vi.fn().mockImplementation(() => of({
        message: 'قسط باطل شد',
        paid_amount: '0',
        remaining: '1000000'
      }))
    };

    mockCompanyApi = {
      getBankAccounts: vi.fn().mockImplementation(() => of([
        { id: 5, bank_name: 'Mellat', account_title: 'Main', is_primary: true, is_active: true }
      ]))
    };

    mockPrintService = {
      downloadPdf: vi.fn().mockResolvedValue(undefined),
      printPdf: vi.fn().mockResolvedValue(true),
      sharePdf: vi.fn().mockResolvedValue(true),
      isOnline: vi.fn().mockReturnValue(true),
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({})
    };

    mockConfirm = {
      confirm: vi.fn().mockReturnValue(of(true)),
      open: vi.fn().mockResolvedValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, TreasurerInvoicesComponent],
      providers: [ { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: PrintService, useValue: mockPrintService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: ConfirmDialogService, useValue: mockConfirm }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TreasurerInvoicesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('a) the row shows the label for partially_paid and a button whose text contains the payment label; clicking it opens the modal (app-modal content visible) and calls getInvoicePayments(7); the amount input default equals the remaining 600000', async () => {
    const statusBadge = fixture.nativeElement.querySelector('tbody tr td span.bg-teal-50');
    expect(statusBadge).toBeTruthy();
    expect(statusBadge.textContent).toContain('پرداخت ناقص');

    const payBtn = Array.from(fixture.nativeElement.querySelectorAll('tbody tr button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('پرداخت'));
    expect(payBtn).toBeTruthy();

    payBtn!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockTreasuryOrgApi.getInvoicePayments).toHaveBeenCalledWith(7);
    expect(component.payModalOpen).toBe(true);

    const modalDialog = fixture.nativeElement.querySelector('app-modal [role="dialog"]');
    expect(modalDialog).toBeTruthy();

    expect(panel().payAmount).toBe('600000');
    const amountInput = fixture.nativeElement.querySelector('#pay-amount') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    expect(amountInput.value.replace(/,/g, '')).toBe('600000');
  });

  it('b) the payments list renders one row per payment from getInvoicePayments (two payments, one with is_voided: true shown with class line-through on its amount cell)', () => {
    mockTreasuryOrgApi.getInvoicePayments.mockReturnValue(of({
      results: [
        {
          id: 1,
          invoice: 7,
          amount: 250000,
          payment_date_shamsi: '1405/04/01',
          tracking_code: 'TR-101',
          method: 'transfer',
          method_display: 'انتقال',
          company_bank_name: 'Mellat',
          is_voided: false
        },
        {
          id: 2,
          invoice: 7,
          amount: 150000,
          payment_date_shamsi: '1405/04/05',
          tracking_code: 'TR-102',
          method: 'transfer',
          method_display: 'انتقال',
          company_bank_name: 'Mellat',
          is_voided: true,
          void_reason: 'شماره پیگیری اشتباه'
        }
      ],
      paid_amount: '400000',
      remaining: '600000'
    }));

    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    const paymentRows = fixture.nativeElement.querySelectorAll('app-modal table tbody tr');
    expect(paymentRows.length).toBe(2);

    const amountCells = Array.from(paymentRows).map((row: any) => row.querySelectorAll('td')[1]);
    expect(amountCells[0].classList.contains('line-through')).toBe(false);
    expect(amountCells[1].classList.contains('line-through')).toBe(true);
  });

  it('c) with method cash the company account select (#pay-company-account) is not rendered; with transfer it is rendered', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    const methodSelect = fixture.nativeElement.querySelector('#pay-method') as HTMLSelectElement;
    expect(methodSelect).toBeTruthy();

    methodSelect.value = 'cash';
    methodSelect.dispatchEvent(new Event('change'));
    panel().payMethod = 'cash';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pay-company-account')).toBeNull();

    methodSelect.value = 'transfer';
    methodSelect.dispatchEvent(new Event('change'));
    panel().payMethod = 'transfer';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pay-company-account')).not.toBeNull();
  });

  it('d) submitting with an empty tracking code is allowed (optional) and calls addInvoicePayment with tracking_code: ""', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    panel().payAmount = '600000';
    panel().payMethod = 'transfer';
    panel().payCompanyAccount = 5;
    panel().payDateControl.setValue('1405/04/15');
    panel().payTracking = '';
    const receipt = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });
    panel().onPayReceiptChange({ target: { files: [receipt], value: 'receipt.pdf' } } as unknown as Event);

    const trackingInput = fixture.nativeElement.querySelector('#pay-tracking') as HTMLInputElement;
    if (trackingInput) {
      trackingInput.value = '';
      trackingInput.dispatchEvent(new Event('input'));
    }

    mockTreasuryOrgApi.addInvoicePayment.mockReturnValue(of({
      message: 'قسط با موفقیت ثبت شد',
      paid_amount: '600000',
      remaining: '400000'
    }));

    panel().submitPayment();
    fixture.detectChanges();

    const trackingErr = fixture.nativeElement.querySelector('#pay-tracking-err');
    expect(trackingErr).toBeNull();
    expect(mockTreasuryOrgApi.addInvoicePayment).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        tracking_code: ''
      }),
      receipt
    );
  });

  it('e) a valid submit calls addInvoicePayment(7, body) with amount, payment_date_shamsi, tracking_code, method, company_bank_account: 5; when the result has remaining: \'0\' the modal closes', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    panel().payAmount = '600000';
    panel().payTracking = 'TR-555';
    panel().payMethod = 'transfer';
    panel().payCompanyAccount = 5;
    panel().payDateControl.setValue('1405/04/15');
    const receipt = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });
    panel().onPayReceiptChange({ target: { files: [receipt], value: 'receipt.pdf' } } as unknown as Event);

    mockTreasuryOrgApi.addInvoicePayment.mockReturnValue(of({
      message: 'قسط با موفقیت ثبت شد',
      paid_amount: '1000000',
      remaining: '0'
    }));

    panel().submitPayment();
    fixture.detectChanges();

    expect(mockTreasuryOrgApi.addInvoicePayment).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        amount: '600000',
        payment_date_shamsi: '1405/04/15',
        tracking_code: 'TR-555',
        method: 'transfer',
        company_bank_account: 5
      }),
      receipt
    );
    expect(component.payModalOpen).toBe(false);
  });

  it('g) without a receipt the submit button is disabled, submit shows #pay-receipt-err and does not call addInvoicePayment', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();
    panel().payAmount = '600000';
    panel().payTracking = 'TR-1';
    panel().payCompanyAccount = 5;
    panel().payDateControl.setValue('1405/04/15');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#pay-receipt') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('aria-required')).toBe('true');
    const submit = fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // ثبت از راه رویداد فرم (مثل کلیک یا Enter کاربر) تا نمای OnPush هم تازه شود
    (submit.closest('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    const err = fixture.nativeElement.querySelector('#pay-receipt-err');
    expect(err?.textContent).toContain('سند واریز');
    expect(mockTreasuryOrgApi.addInvoicePayment).not.toHaveBeenCalled();

    // انتخاب فایل از راه رویداد change خود input (مثل کاربر)
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'r.pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(panel().payReceipt?.name).toBe('r.pdf');
    expect(submit.disabled).toBe(false);
  });

  it('f) a 400 response { amount: [\'too much\'] } shows #pay-amount-err with that text; a 409 { code: \'void_after_full_payment\', error: \'X\' } on void shows X in the reason dialog (serverError)', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    panel().payAmount = '600000';
    panel().payTracking = 'TR-555';
    panel().payMethod = 'transfer';
    panel().payCompanyAccount = 5;
    panel().payDateControl.setValue('1405/04/15');
    panel().payReceipt = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });

    mockTreasuryOrgApi.addInvoicePayment.mockReturnValue(throwError(() => ({
      status: 400,
      error: { amount: ['too much'] }
    })));

    panel().submitPayment();
    fixture.detectChanges();

    const amountErr = fixture.nativeElement.querySelector('#pay-amount-err');
    expect(amountErr).toBeTruthy();
    expect(amountErr.textContent).toContain('too much');

    // Test 409 on void
    panel().pendingVoid = { id: 101, amount: 250000 } as any;
    panel().voidDialogOpen = true;

    mockTreasuryOrgApi.voidInvoicePayment.mockReturnValue(throwError(() => ({
      status: 409,
      error: { code: 'void_after_full_payment', error: 'X' }
    })));

    panel().onVoidConfirmed('اشتباه');
    fixture.detectChanges();

    expect(panel().voidDialogServerError).toBe('X');
    const reasonDialogEl = fixture.nativeElement.querySelector('app-workflow-reason-dialog');
    expect(reasonDialogEl).toBeTruthy();
    expect(reasonDialogEl.textContent).toContain('X');
  });

  it('g) clicking the void button of a payment opens the reason dialog; confirming with a reason calls voidInvoicePayment(7, paymentId, reason)', () => {
    mockTreasuryOrgApi.getInvoicePayments.mockReturnValue(of({
      results: [
        {
          id: 101,
          invoice: 7,
          amount: 250000,
          payment_date_shamsi: '1405/04/01',
          tracking_code: 'TR-101',
          method: 'transfer',
          is_voided: false
        }
      ],
      paid_amount: '250000',
      remaining: '750000'
    }));

    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    const voidBtn = Array.from(fixture.nativeElement.querySelectorAll('app-modal table button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('ابطال قسط'));
    expect(voidBtn).toBeTruthy();

    voidBtn!.click();
    fixture.detectChanges();

    expect(panel().voidDialogOpen).toBe(true);
    expect(panel().pendingVoid?.id).toBe(101);

    panel().onVoidConfirmed('اشتباه در ثبت');
    expect(mockTreasuryOrgApi.voidInvoicePayment).toHaveBeenCalledWith(7, 101, 'اشتباه در ثبت');
  });

  it('h) the component source has no window.prompt call for invoices: read nothing from disk; instead assert vi.spyOn(window, \'prompt\') is never called during a) to g) (put the spy in beforeEach)', () => {
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('i) the payee primary account is preselected and its account number and Sheba are copied without spaces', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    mockPersonnelApi.getCounterparties.mockReturnValue(of([{ id: 3, party: 9 }]));
    mockPersonnelApi.getPartyBankAccounts.mockReturnValue(of([
      { id: 10, party: 9, bank_name: 'Saderat', account_number: '111', sheba_number: 'IR000000000000000000000001', is_primary: false, is_active: true },
      { id: 11, party: 9, bank_name: 'Melli', account_number: '0123 456 789', sheba_number: 'IR12 0170 0000 0000 0000 0000 01', owner_name: 'Ali', is_primary: true, is_active: true }
    ]));
    component.payInvoice({ ...component.invoices[0], counterparty_id: 3 });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockPersonnelApi.getPartyBankAccounts).toHaveBeenCalledWith(9);
    expect(panel().payPartyAccount).toBe(11);
    const box = fixture.nativeElement.querySelector('[data-party-account-copy]') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('0123 456 789');

    (box.querySelector('[data-copy-account]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenLastCalledWith('0123456789');
    (box.querySelector('[data-copy-sheba]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenLastCalledWith('120170000000000000000001');
    expect(panel().copiedKey).toBe('sheba');
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('j) the treasurer list no longer shows the payment tracking code as the vendor Sheba', () => {
    mockPersonnelApi.getTreasuryCartable.mockReturnValue(of({
      invoices: [{ id: 8, invoice_number: 'F-8', amount: 5, paid_amount: 0, remaining: 5, status: 'ready_to_pay', payment_ref: 'TRK-777', counterparty: null }]
    }));
    component.loadTreasuryData();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('TRK-777');
  });

  it('k) the bank website link shows only for a company account with a safe https URL and opens in a new tab', async () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();
    panel().payMethod = 'transfer';
    panel().companyAccounts = [
      { id: 5, company: 1, bank_name: 'Mellat', sheba_number: 'IR1', is_primary: true, is_active: true, internet_bank_url: 'https://ib.bankmellat.ir' },
      { id: 6, company: 1, bank_name: 'Melli', sheba_number: 'IR2', is_primary: false, is_active: true, internet_bank_url: '' },
      { id: 7, company: 1, bank_name: 'Tejarat', sheba_number: 'IR3', is_primary: false, is_active: true, internet_bank_url: 'javascript:alert(1)' }
    ];
    panel().payCompanyAccount = 5;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // pick through the select so the ngModel event also refreshes the modal view
    const pickCompanyAccount = async (id: number) => {
      const select = fixture.nativeElement.querySelector('#pay-company-account') as HTMLSelectElement;
      const index = panel().companyAccounts.findIndex(a => a.id === id) + 1;
      select.value = select.options[index].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const link = fixture.nativeElement.querySelector('[data-company-bank-link]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://ib.bankmellat.ir');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBeTruthy();

    await pickCompanyAccount(6);
    expect(panel().payCompanyAccount).toBe(6);
    expect(fixture.nativeElement.querySelector('[data-company-bank-link]')).toBeNull();

    await pickCompanyAccount(7);
    expect(panel().payCompanyAccount).toBe(7);
    expect(fixture.nativeElement.querySelector('[data-company-bank-link]')).toBeNull();
  });

  it('l) shows the bank website hint when the selected company account has no URL and hides it when it has a safe https URL', async () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();
    panel().payMethod = 'transfer';
    panel().companyAccounts = [
      { id: 5, company: 1, bank_name: 'Mellat', sheba_number: 'IR1', is_primary: true, is_active: true, internet_bank_url: 'https://ib.bankmellat.ir' },
      { id: 6, company: 1, bank_name: 'Melli', sheba_number: 'IR2', is_primary: false, is_active: true, internet_bank_url: '' }
    ];
    panel().payCompanyAccount = null;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const pickCompanyAccount = async (id: number | null) => {
      const select = fixture.nativeElement.querySelector('#pay-company-account') as HTMLSelectElement;
      const index = id === null ? 0 : panel().companyAccounts.findIndex(a => a.id === id) + 1;
      select.value = select.options[index].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    // 1. No account selected: no hint
    await pickCompanyAccount(null);
    expect(panel().selectedCompanyAccount).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-company-bank-hint]')).toBeNull();

    // 2. Account with safe https URL: no hint
    await pickCompanyAccount(5);
    expect(panel().selectedCompanyAccount?.id).toBe(5);
    expect(panel().selectedCompanyBankUrl).toBe('https://ib.bankmellat.ir');
    expect(fixture.nativeElement.querySelector('[data-company-bank-hint]')).toBeNull();

    // 3. Account with empty URL: shows hint text
    await pickCompanyAccount(6);
    expect(panel().selectedCompanyAccount?.id).toBe(6);
    expect(panel().selectedCompanyBankUrl).toBeNull();
    const hint = fixture.nativeElement.querySelector('[data-company-bank-hint]') as HTMLElement;
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('آدرس سایت بانک برای این حساب ثبت نشده؛ از بخش حساب‌های بانکی شرکت آن را وارد کنید.');
  });

  it('m) the company account Sheba and account number are not shown in the pay form; the bank site link stays', async () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();
    panel().payMethod = 'transfer';
    panel().companyAccounts = [
      {
        id: 5,
        company: 1,
        bank_name: 'Mellat',
        account_number: '1234 5678 90',
        sheba_number: 'IR12 0120 0000 0000 1234 5678 90',
        is_primary: true,
        is_active: true,
        internet_bank_url: 'https://ib.bankmellat.ir'
      }
    ];
    panel().payCompanyAccount = 5;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-company-account-copy]')).toBeNull();
    expect(root.querySelector('[data-copy-company-account]')).toBeNull();
    expect(root.querySelector('[data-copy-company-sheba]')).toBeNull();
    expect(root.textContent).not.toContain('IR12 0120 0000 0000 1234 5678 90');
    expect(root.querySelector('[data-company-bank-link]')).toBeTruthy();
  });

  it('filters invoices client-side by section without re-fetching treasury cartable', () => {
    mockPersonnelApi.getTreasuryCartable.mockReturnValue(of({
      invoices: [
        { id: 101, invoice_number: 'INV-10', section: 10, amount: 1000 },
        { id: 102, invoice_number: 'INV-20', section: 20, amount: 2000 }
      ]
    }));
    component.loadTreasuryData();
    expect(component.allInvoices.length).toBe(2);
    expect(component.invoices.length).toBe(2);

    const callsBeforeFilter = mockPersonnelApi.getTreasuryCartable.mock.calls.length;
    component.selectedSectionId = 20;
    component.onSectionChanged();

    expect(component.invoices.length).toBe(1);
    expect(component.invoices[0].id).toBe(102);
    expect(component.invoices[0].section_id).toBe(20);
    expect(mockPersonnelApi.getTreasuryCartable.mock.calls.length).toBe(callsBeforeFilter);

    component.selectedSectionId = null;
    component.onSectionChanged();

    expect(component.invoices.length).toBe(2);
    expect(mockPersonnelApi.getTreasuryCartable.mock.calls.length).toBe(callsBeforeFilter);
  });

  it('drag & drop on the payment form attaches, replaces, and clears the receipt file', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    expect(form).toBeTruthy();

    // 1. Drag enter with Files sets isDraggingOver
    const dragEnterEvent = new Event('dragenter', { bubbles: true, cancelable: true }) as any;
    dragEnterEvent.dataTransfer = { types: ['Files'] };
    form.dispatchEvent(dragEnterEvent);
    fixture.detectChanges();
    expect(panel().isDraggingOver).toBe(true);

    // 2. Drop attaches the file
    const file1 = new File(['%PDF-1'], 'receipt-1.pdf', { type: 'application/pdf' });
    const dropEvent1 = new Event('drop', { bubbles: true, cancelable: true }) as any;
    dropEvent1.dataTransfer = { types: ['Files'], files: [file1] };
    form.dispatchEvent(dropEvent1);
    fixture.detectChanges();

    expect(panel().isDraggingOver).toBe(false);
    expect(panel().payReceipt?.name).toBe('receipt-1.pdf');
    expect(fixture.nativeElement.querySelector('[data-receipt-attached]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-receipt-attached]').textContent).toContain('receipt-1.pdf');

    // 3. Drop a second file replaces the first file
    const file2 = new File(['%PDF-2'], 'receipt-2.pdf', { type: 'application/pdf' });
    const dropEvent2 = new Event('drop', { bubbles: true, cancelable: true }) as any;
    dropEvent2.dataTransfer = { types: ['Files'], files: [file2] };
    form.dispatchEvent(dropEvent2);
    fixture.detectChanges();

    expect(panel().payReceipt?.name).toBe('receipt-2.pdf');
    expect(fixture.nativeElement.querySelector('[data-receipt-attached]').textContent).toContain('receipt-2.pdf');

    // 4. Click clear button removes the file
    const clearBtn = fixture.nativeElement.querySelector('[data-clear-receipt]') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    fixture.detectChanges();

    expect(panel().payReceipt).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-receipt-attached]')).toBeNull();
  });
});
