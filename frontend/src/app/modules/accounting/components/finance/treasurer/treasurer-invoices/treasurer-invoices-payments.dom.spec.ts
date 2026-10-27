// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { TreasurerInvoicesComponent } from './treasurer-invoices';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { PrintService } from '../../../../../../core/services/print.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';

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

  beforeAll(async () => {
    Object.defineProperty(TreasurerInvoicesComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || TreasurerInvoicesComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(TreasuryOrgApiService),
          ɵɵdirectiveInject(CompanyApiService),
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

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
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
      downloadPdf: vi.fn().mockResolvedValue(undefined)
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
      providers: [
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
    const statusBadge = fixture.nativeElement.querySelector('tbody tr td span.bg-sky-50');
    expect(statusBadge).toBeTruthy();
    expect(statusBadge.textContent).toContain('پرداخت ناقص');

    const payBtn = Array.from(fixture.nativeElement.querySelectorAll('tbody tr button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent?.includes('ثبت قسط'));
    expect(payBtn).toBeTruthy();

    payBtn!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockTreasuryOrgApi.getInvoicePayments).toHaveBeenCalledWith(7);
    expect(component.payModalOpen).toBe(true);

    const modalDialog = fixture.nativeElement.querySelector('app-modal [role="dialog"]');
    expect(modalDialog).toBeTruthy();

    expect(component.payAmount).toBe('600000');
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
    component.payMethod = 'cash';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pay-company-account')).toBeNull();

    methodSelect.value = 'transfer';
    methodSelect.dispatchEvent(new Event('change'));
    component.payMethod = 'transfer';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pay-company-account')).not.toBeNull();
  });

  it('d) submitting with an empty tracking code shows the field error element #pay-tracking-err and does not call addInvoicePayment', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    component.payAmount = '600000';
    component.payMethod = 'transfer';
    component.payCompanyAccount = 5;
    component.payDateControl.setValue('1405/04/15');
    component.payTracking = '';

    const trackingInput = fixture.nativeElement.querySelector('#pay-tracking') as HTMLInputElement;
    if (trackingInput) {
      trackingInput.value = '';
      trackingInput.dispatchEvent(new Event('input'));
    }

    component.submitPayment();
    fixture.detectChanges();

    const trackingErr = fixture.nativeElement.querySelector('#pay-tracking-err');
    expect(trackingErr).toBeTruthy();
    expect(trackingErr.textContent).toContain('کد پیگیری');
    expect(mockTreasuryOrgApi.addInvoicePayment).not.toHaveBeenCalled();
  });

  it('e) a valid submit calls addInvoicePayment(7, body) with amount, payment_date_shamsi, tracking_code, method, company_bank_account: 5; when the result has remaining: \'0\' the modal closes', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    component.payAmount = '600000';
    component.payTracking = 'TR-555';
    component.payMethod = 'transfer';
    component.payCompanyAccount = 5;
    component.payDateControl.setValue('1405/04/15');

    mockTreasuryOrgApi.addInvoicePayment.mockReturnValue(of({
      message: 'قسط با موفقیت ثبت شد',
      paid_amount: '1000000',
      remaining: '0'
    }));

    component.submitPayment();
    fixture.detectChanges();

    expect(mockTreasuryOrgApi.addInvoicePayment).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        amount: '600000',
        payment_date_shamsi: '1405/04/15',
        tracking_code: 'TR-555',
        method: 'transfer',
        company_bank_account: 5
      })
    );
    expect(component.payModalOpen).toBe(false);
  });

  it('f) a 400 response { amount: [\'too much\'] } shows #pay-amount-err with that text; a 409 { code: \'void_after_full_payment\', error: \'X\' } on void shows X in the reason dialog (serverError)', () => {
    component.payInvoice(component.invoices[0]);
    fixture.detectChanges();

    component.payAmount = '600000';
    component.payTracking = 'TR-555';
    component.payMethod = 'transfer';
    component.payCompanyAccount = 5;
    component.payDateControl.setValue('1405/04/15');

    mockTreasuryOrgApi.addInvoicePayment.mockReturnValue(throwError(() => ({
      status: 400,
      error: { amount: ['too much'] }
    })));

    component.submitPayment();
    fixture.detectChanges();

    const amountErr = fixture.nativeElement.querySelector('#pay-amount-err');
    expect(amountErr).toBeTruthy();
    expect(amountErr.textContent).toContain('too much');

    // Test 409 on void
    component.pendingVoid = { id: 101, amount: 250000 } as any;
    component.voidDialogOpen = true;

    mockTreasuryOrgApi.voidInvoicePayment.mockReturnValue(throwError(() => ({
      status: 409,
      error: { code: 'void_after_full_payment', error: 'X' }
    })));

    component.onVoidConfirmed('اشتباه');
    fixture.detectChanges();

    expect(component.voidDialogServerError).toBe('X');
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

    expect(component.voidDialogOpen).toBe(true);
    expect(component.pendingVoid?.id).toBe(101);

    component.onVoidConfirmed('اشتباه در ثبت');
    expect(mockTreasuryOrgApi.voidInvoicePayment).toHaveBeenCalledWith(7, 101, 'اشتباه در ثبت');
  });

  it('h) the component source has no window.prompt call for invoices: read nothing from disk; instead assert vi.spyOn(window, \'prompt\') is never called during a) to g) (put the spy in beforeEach)', () => {
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
