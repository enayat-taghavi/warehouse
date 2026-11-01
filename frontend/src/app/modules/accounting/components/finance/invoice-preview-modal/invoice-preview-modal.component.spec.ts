// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { InvoicePreviewModalComponent } from './invoice-preview-modal.component';

describe('InvoicePreviewModalComponent — پیش‌نمایش و سابقه فاکتور', () => {
  let component: InvoicePreviewModalComponent;
  let mockTreasuryApi: any;
  let mockPrintService: any;
  let mockCdr: any;

  const sampleInvoice = {
    id: 101,
    invoice_number: 'INV-2026-001',
    number: 'DOC-101',
    issue_date_shamsi: '1405/08/10',
    counterparty_name: 'فروشگاه آذرخش',
    section_name: 'کارگاه خط ۱',
    project_name: 'پروژه قطار شهری',
    created_by_name: 'احمد رضایی',
    status: 'pending_supervisor',
    status_display: 'در انتظار تایید سرپرست',
    amount: 15000000,
    subtotal: 14000000,
    discount_amount: 500000,
    vat_amount: 1500000,
    vat_manual: true,
    paid_amount: 0,
    remaining: 15000000,
    description: 'خرید تجهیزات و قطعات مصرفی',
    lines: [
      {
        id: 1,
        position: 1,
        description: 'کابل برق فشار قوی',
        quantity: 10,
        unit: 'متر',
        unit_price: 1000000,
        expense_head_title: 'مصرفی برقی',
        line_amount: 10000000,
      },
      {
        id: 2,
        position: 2,
        description: 'کلید و پریز صنعتی',
        quantity: 8,
        unit: 'عدد',
        unit_price: 500000,
        expense_head_title: 'ابزارآلات',
        line_amount: 4000000,
      },
    ],
  };

  beforeEach(() => {
    mockTreasuryApi = {
      getExpenseInvoice: vi.fn().mockReturnValue(of(sampleInvoice)),
    };
    mockPrintService = {
      downloadPdf: vi.fn().mockReturnValue(Promise.resolve()),
    };
    mockCdr = {
      detectChanges: vi.fn(),
    };

    component = new InvoicePreviewModalComponent(mockTreasuryApi, mockPrintService, mockCdr);
  });

  it('1. should create component with default preview tab', () => {
    expect(component).toBeTruthy();
    expect(component.tabs.length).toBe(2);
    expect(component.tabs[0].id).toBe('preview');
    expect(component.tabs[1].id).toBe('history');
    expect(component.activeTab).toBe('preview');
  });

  it('2. loads invoice details via treasuryApi on changes when open', () => {
    component.isOpen = true;
    component.invoiceId = 101;
    component.ngOnChanges({
      isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true },
      invoiceId: { currentValue: 101, previousValue: null, firstChange: true, isFirstChange: () => true },
    });

    expect(mockTreasuryApi.getExpenseInvoice).toHaveBeenCalledWith(101);
    expect(component.invoiceDetail).toEqual(sampleInvoice);
    expect(component.isLoading).toBe(false);
    expect(mockCdr.detectChanges).toHaveBeenCalled();
  });

  it('3. falls back to invoice input if getExpenseInvoice fails', () => {
    mockTreasuryApi.getExpenseInvoice.mockReturnValueOnce(throwError(() => new Error('API error')));
    component.isOpen = true;
    component.invoiceId = 101;
    component.invoice = sampleInvoice as any;
    component.loadInvoice();

    expect(component.invoiceDetail).toBe(sampleInvoice);
    expect(component.isLoading).toBe(false);
  });

  it('4. sets initialTab to history when specified', () => {
    component.initialTab = 'history';
    component.ngOnChanges({
      initialTab: { currentValue: 'history', previousValue: 'preview', firstChange: true, isFirstChange: () => true },
    });
    expect(component.activeTab).toBe('history');
  });

  it('5. allows switching between preview and history tabs', () => {
    component.onTabChange('history');
    expect(component.activeTab).toBe('history');

    component.onTabChange('preview');
    expect(component.activeTab).toBe('preview');

    component.onTabChange('invalid');
    expect(component.activeTab).toBe('preview');
  });

  it('6. modalTitle formats title with document/invoice number', () => {
    component.invoiceDetail = sampleInvoice;
    expect(component.modalTitle).toBe('پیش‌نمایش و سابقه فاکتور DOC-101');

    component.invoiceDetail = { id: 999, invoice_number: 'INV-999' };
    expect(component.modalTitle).toBe('پیش‌نمایش و سابقه فاکتور INV-999');

    component.invoiceDetail = null;
    component.invoice = null;
    expect(component.modalTitle).toBe('مشاهده و سابقه فاکتور');
  });

  it('7. printInvoice calls PrintService with expense_invoice and id', () => {
    component.invoiceId = 101;
    component.printInvoice();
    expect(mockPrintService.downloadPdf).toHaveBeenCalledWith('expense_invoice', 101);
  });

  it('8. close emits closed event', () => {
    const spy = vi.fn();
    component.closed.subscribe(spy);
    component.close();
    expect(spy).toHaveBeenCalled();
  });

  it('9. getStatusBadgeClass and getStatusLabel return appropriate tone styles and Persian labels', () => {
    expect(component.getStatusBadgeClass('pending_supervisor')).toContain('bg-amber-50');
    expect(component.getStatusBadgeClass('pending_accountant')).toContain('bg-sky-50');
    expect(component.getStatusBadgeClass('pending_manager')).toContain('bg-indigo-50');
    expect(component.getStatusBadgeClass('ready_to_pay')).toContain('bg-purple-50');
    expect(component.getStatusBadgeClass('paid')).toContain('bg-emerald-50');
    expect(component.getStatusBadgeClass('rejected')).toContain('bg-rose-50');
    expect(component.getStatusBadgeClass('revision_required')).toContain('bg-amber-100');

    expect(component.getStatusLabel('pending_supervisor')).toBe('در انتظار تایید سرپرست');
    expect(component.getStatusLabel('pending_accountant')).toBe('در انتظار بررسی حسابدار');
    expect(component.getStatusLabel('pending_manager')).toBe('در انتظار تایید مدیر');
    expect(component.getStatusLabel('ready_to_pay')).toBe('آماده پرداخت');
    expect(component.getStatusLabel('paid')).toBe('تسویه و پرداخت‌شده');
  });

  it('10. faAmount formats numeric strings with Persian locale', () => {
    expect(component.faAmount(null)).toBe('—');
    expect(component.faAmount('')).toBe('—');
    const formatted = component.faAmount(15000000);
    expect(formatted.replace(/[\u06F0-\u06F90-9,\u066C]/g, '')).toBe('');
  });
});
