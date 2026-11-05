// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { InvoicePaymentPageComponent } from './invoice-payment-page.component';
import { InvoicePaymentPanelComponent } from '../invoice-payment-panel/invoice-payment-panel.component';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { PermissionService } from '../../../../../core/services/permission.service';

describe('InvoicePaymentPageComponent — صفحهٔ جدای پرداخت روی بخش مشترک', () => {
  let fixture: ComponentFixture<InvoicePaymentPageComponent>;
  let component: InvoicePaymentPageComponent;
  let mockToast: any;
  let mockTreasuryOrgApi: any;
  let mockRouter: any;
  let params$: BehaviorSubject<any>;

  const sampleInvoice = {
    id: 15,
    invoice_number: 'INV-1500',
    number: '15/1405/F',
    counterparty_name: 'فروشگاه سپهر',
    category: 'خرید کالا',
    section: 2,
    project_name: 'پروژه مرکزی',
    section_name: 'بخش عمران',
    amount: 5000000,
    paid_amount: 2000000,
    remaining: 3000000,
    invoice_date_shamsi: '1405/08/10',
    status: 'partially_paid',
    status_display: 'پرداخت ناقص',
    payment_ref: 'REF-123',
    counterparty: 42,
    created_by_name: 'علی تقوی'
  };

  const samplePayments = [{
    id: 101,
    payment_date_shamsi: '1405/08/11',
    amount: '2000000',
    method: 'transfer',
    method_display: 'انتقال',
    tracking_code: 'TRK-9876',
    created_by_name: 'خزانه‌دار',
    is_voided: false
  }];

  const panel = (): InvoicePaymentPanelComponent =>
    fixture.debugElement.query(By.directive(InvoicePaymentPanelComponent))?.componentInstance;

  async function setup(invoice: any = sampleInvoice, id = '15') {
    params$ = new BehaviorSubject(convertToParamMap({ id }));
    mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    mockTreasuryOrgApi = {
      getExpenseInvoice: vi.fn().mockReturnValue(of(invoice)),
      getInvoicePayments: vi.fn().mockReturnValue(of({ results: samplePayments, paid_amount: invoice.paid_amount, remaining: invoice.remaining })),
      addInvoicePayment: vi.fn().mockReturnValue(of({ message: 'پرداخت ثبت شد', paid_amount: 5000000, remaining: 0 })),
      voidInvoicePayment: vi.fn().mockReturnValue(of({ message: 'قسط باطل شد', paid_amount: 0, remaining: 5000000 }))
    };
    mockRouter = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [InvoicePaymentPageComponent],
      providers: [
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: {
          getCounterparties: vi.fn().mockReturnValue(of([{ id: 42, party: 99 }])),
          getPartyBankAccounts: vi.fn().mockReturnValue(of([
            { id: 88, bank_name: 'بانک تجارت', owner_name: 'علی سپهری', account_number: '1234567890', sheba_number: 'IR123456789012345678901234', is_primary: true, is_active: true }
          ]))
        } },
        { provide: TreasuryOrgApiService, useValue: mockTreasuryOrgApi },
        { provide: CompanyApiService, useValue: { getBankAccounts: vi.fn().mockReturnValue(of([
          { id: 5, bank_name: 'بانک ملت', account_title: 'جاری شرکت', is_primary: true, is_active: true, internet_bank_url: 'https://bankmellat.ir' }
        ])) } },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { paramMap: params$ } },
        { provide: PermissionService, useValue: { canWriteDocuments: vi.fn().mockReturnValue(true) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicePaymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('دستور پرداخت‌پذیر', () => {
    beforeEach(async () => { await setup(); });

    it('1) loads the invoice, renders the shared panel and defaults the amount to the remaining', () => {
      expect(mockTreasuryOrgApi.getExpenseInvoice).toHaveBeenCalledWith(15);
      expect(component.payable).toBe(true);
      expect(panel()).toBeTruthy();
      expect(panel().payAmount).toBe('3000000');
      expect(fixture.nativeElement.querySelector('#pay-amount')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-pay-page-link]')).toBeNull();
    });

    it('2) shows the page-only invoice info and the installments table', () => {
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('فروشگاه سپهر');
      expect(text).toContain('علی تقوی');
      expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain('TRK-9876');
    });

    it('3) the company bank link and the payee copy buttons come from the shared panel', () => {
      expect(panel().payCompanyAccount).toBe(5);
      const bankLink = fixture.nativeElement.querySelector('[data-company-bank-link]') as HTMLAnchorElement;
      expect(bankLink.href).toBe('https://bankmellat.ir/');
      expect(bankLink.target).toBe('_blank');
      expect(panel().payPartyAccount).toBe(88);
      expect(fixture.nativeElement.querySelector('[data-copy-account]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-copy-sheba]')).toBeTruthy();
    });

    it('4) without a receipt nothing is sent', () => {
      panel().submitPayment();
      expect(mockTreasuryOrgApi.addInvoicePayment).not.toHaveBeenCalled();
      expect(panel().payFieldErrors['receipt']).toBeTruthy();
    });

    it('5) a full payment settles the invoice and hides the form', () => {
      const file = new File(['x'], 'receipt.pdf', { type: 'application/pdf' });
      panel().payReceipt = file;
      panel().payAmount = '3000000';
      panel().payDateControl.setValue('1405/08/12');
      panel().submitPayment();
      fixture.detectChanges();

      expect(mockTreasuryOrgApi.addInvoicePayment).toHaveBeenCalledWith(15, expect.objectContaining({ amount: '3000000', payment_date_shamsi: '1405/08/12', method: 'transfer' }), file);
      expect(component.payItem?.status).toBe('paid');
      expect(component.payable).toBe(false);
    });

    it('6) confirming a void calls voidInvoicePayment', () => {
      panel().askVoid(samplePayments[0] as any);
      expect(panel().voidDialogOpen).toBe(true);
      panel().onVoidConfirmed('اشتباه');
      expect(mockTreasuryOrgApi.voidInvoicePayment).toHaveBeenCalledWith(15, 101, 'اشتباه');
    });

    it('7) cancel and back go to the invoices list', () => {
      panel().cancelled.emit();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/invoices']);
    });
  });

  it('8) an invoice that is not ready to pay shows a notice instead of the form', async () => {
    await setup({ ...sampleInvoice, status: 'pending_review', status_display: 'در انتظار بررسی', paid_amount: 0, remaining: 5000000 });
    expect(component.payable).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-pay-not-payable]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#pay-amount')).toBeNull();
    panel().submitPayment();
    expect(mockTreasuryOrgApi.addInvoicePayment).not.toHaveBeenCalled();
  });

  it('9) a bad id or a failed load shows the error box', async () => {
    await setup(sampleInvoice, 'abc');
    expect(mockTreasuryOrgApi.getExpenseInvoice).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();

    mockTreasuryOrgApi.getExpenseInvoice.mockReturnValue(throwError(() => ({ status: 404 })));
    params$.next(convertToParamMap({ id: '16' }));
    fixture.detectChanges();
    expect(component.loadError).toBeTruthy();
    expect(panel()).toBeFalsy();
  });
});
