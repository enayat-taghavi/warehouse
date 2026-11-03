import { Component, EventEmitter, Input, Output, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { PrintService } from '../../../../../core/services/print.service';
import { PersianDatePipe } from '../../../../../shared/pipes/persian-date.pipe';
// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
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
      printPdf: vi.fn().mockResolvedValue(true),
      isOnline: vi.fn().mockReturnValue(true),
      sharePdf: vi.fn().mockReturnValue(Promise.resolve(true)),
    };
    mockCdr = {
      detectChanges: vi.fn(),
    };

    component = new InvoicePreviewModalComponent(mockTreasuryApi, mockPrintService, mockCdr);
  });

  it('1. component creates and renders no app-tab-bar', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvoicePreviewModalComponent],
      providers: [
        { provide: TreasuryOrgApiService, useValue: mockTreasuryApi },
        { provide: PrintService, useValue: mockPrintService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(InvoicePreviewModalComponent, {
      set: {
        imports: [CommonModule, StubModalComponent, PersianDatePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
    const fixture = TestBed.createComponent(InvoicePreviewModalComponent);
    fixture.componentInstance.isOpen = true;
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    const tabBar = fixture.nativeElement.querySelector('app-tab-bar');
    expect(tabBar).toBeNull();
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

  it('4. with initialTab: history opening scrolls #inv-preview-history into view', () => {
    vi.useFakeTimers();
    try {
      const scrollSpy = vi.fn();
      const el = document.createElement('div');
      el.id = 'inv-preview-history';
      el.scrollIntoView = scrollSpy;
      document.body.appendChild(el);

      component.isOpen = true;
      component.initialTab = 'history';
      component.ngOnChanges({
        isOpen: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true },
        initialTab: { currentValue: 'history', previousValue: 'preview', firstChange: true, isFirstChange: () => true },
      });

      vi.runAllTimers();
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'start' });
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('5. preview content and app-workflow-history are both rendered at the same time', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvoicePreviewModalComponent],
      providers: [
        { provide: TreasuryOrgApiService, useValue: mockTreasuryApi },
        { provide: PrintService, useValue: mockPrintService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(InvoicePreviewModalComponent, {
      set: {
        imports: [CommonModule, StubModalComponent, PersianDatePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
    const fixture = TestBed.createComponent(InvoicePreviewModalComponent);
    fixture.componentInstance.isOpen = true;
    fixture.componentInstance.invoiceId = 101;
    fixture.componentInstance.invoiceDetail = sampleInvoice;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('فروشگاه آذرخش');
    expect(text).toContain('شماره رسید پرداخت:');

    const historySection = fixture.nativeElement.querySelector('#inv-preview-history');
    expect(historySection).not.toBeNull();
    const wfHistory = fixture.nativeElement.querySelector('app-workflow-history');
    expect(wfHistory).not.toBeNull();
  });

  it('6. modalTitle formats title with document/invoice number', () => {
    component.invoiceDetail = sampleInvoice;
    expect(component.modalTitle).toBe('پیش‌نمایش و سابقه رسید پرداخت DOC-101');

    component.invoiceDetail = { id: 999, invoice_number: 'INV-999' };
    expect(component.modalTitle).toBe('پیش‌نمایش و سابقه رسید پرداخت INV-999');

    component.invoiceDetail = null;
    component.invoice = null;
    expect(component.modalTitle).toBe('مشاهده و سابقه رسید پرداخت');
  });

  it('7. printInvoice calls PrintService with expense_invoice and id', () => {
    component.invoiceId = 101;
    component.printInvoice();
    expect(mockPrintService.printPdf).toHaveBeenCalledWith('expense_invoice', 101);
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

  it('11. live refetch: event for open invoice silently reloads details, other events or when closed do not, and unsubscribes on destroy', () => {
    const doc$ = new Subject<any>();
    const mockWs = {
      documentChanges$: vi.fn(() => doc$.asObservable())
    };
    const modal = new InvoicePreviewModalComponent(mockTreasuryApi, mockPrintService, mockCdr, mockWs as any);
    modal.ngOnInit();

    modal.isOpen = true;
    modal.invoiceId = 5;
    mockTreasuryApi.getExpenseInvoice.mockClear();

    // Event with doc_id 5 when isOpen = true
    doc$.next({ doc_type: 'expense_invoice', doc_id: 5 });
    expect(mockTreasuryApi.getExpenseInvoice).toHaveBeenCalledWith(5);
    expect(modal.isLoading).toBe(false);

    // Event with doc_id 6 when isOpen = true -> no call
    mockTreasuryApi.getExpenseInvoice.mockClear();
    doc$.next({ doc_type: 'expense_invoice', doc_id: 6 });
    expect(mockTreasuryApi.getExpenseInvoice).not.toHaveBeenCalled();

    // Event with doc_id 5 when isOpen = false -> no call
    modal.isOpen = false;
    doc$.next({ doc_type: 'expense_invoice', doc_id: 5 });
    expect(mockTreasuryApi.getExpenseInvoice).not.toHaveBeenCalled();

    // After ngOnDestroy -> no call even when open
    modal.isOpen = true;
    modal.ngOnDestroy();
    doc$.next({ doc_type: 'expense_invoice', doc_id: 5 });
    expect(mockTreasuryApi.getExpenseInvoice).not.toHaveBeenCalled();
  });

  it('share button calls PrintService.sharePdf with expense_invoice and the id', async () => {
    mockPrintService.sharePdf = vi.fn().mockResolvedValue(true);
    component.invoiceId = 101;
    component.invoiceDetail = sampleInvoice;
    await component.shareInvoice();
    expect(mockPrintService.sharePdf).toHaveBeenCalledWith(
      'expense_invoice',
      101,
      'payment-receipt-DOC-101.pdf'
    );
  });

  it('share button is busy and ignores a second click while sharing', async () => {
    let resolveShare: (val: boolean) => void = () => {};
    const sharePromise = new Promise<boolean>((resolve) => {
      resolveShare = resolve;
    });
    mockPrintService.sharePdf = vi.fn().mockReturnValue(sharePromise);

    component.invoiceId = 101;
    component.invoiceDetail = sampleInvoice;

    const firstCall = component.shareInvoice();
    expect(component.sharingId).toBe(101);

    await component.shareInvoice();
    expect(mockPrintService.sharePdf).toHaveBeenCalledTimes(1);

    resolveShare(true);
    await firstCall;
    expect(component.sharingId).toBeNull();
  });
});

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: '<div *ngIf="isOpen"><ng-content></ng-content><ng-content select="[modal-footer]"></ng-content></div>',
})
class StubModalComponent {
  @Input() isOpen = false;
  @Input() size = 'md';
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();
}

describe('InvoicePreviewModalComponent DOM tracking block', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvoicePreviewModalComponent],
      providers: [
        { provide: TreasuryOrgApiService, useValue: { getExpenseInvoice: vi.fn().mockReturnValue(of({})) } },
        { provide: PrintService, useValue: { downloadPdf: vi.fn() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(InvoicePreviewModalComponent, {
      set: {
        imports: [CommonModule, StubModalComponent, PersianDatePipe],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
  });

  it('shows creator, created date, last modifier and last modified date', () => {
    const fixture = TestBed.createComponent(InvoicePreviewModalComponent);
    fixture.componentInstance.isOpen = true;
    fixture.componentInstance.invoiceDetail = {
      id: 101,
      created_by_name: 'رضا کمالی',
      created_at: '2026-11-01T10:30:00Z',
      updated_by_name: 'محمد علوی',
      updated_at: '2026-11-02T14:45:00Z',
    };
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('ثبت‌کننده:');
    expect(text).toContain('رضا کمالی');
    expect(text).toContain('تاریخ ثبت:');
    expect(text).toContain('آخرین تغییردهنده:');
    expect(text).toContain('محمد علوی');
    expect(text).toContain('تاریخ آخرین تغییر:');
  });

  it('shows a dash when updated_by_name is empty', () => {
    const fixture = TestBed.createComponent(InvoicePreviewModalComponent);
    fixture.componentInstance.isOpen = true;
    fixture.componentInstance.invoiceDetail = {
      id: 102,
      created_by_name: 'رضا کمالی',
      created_at: '2026-11-01T10:30:00Z',
      updated_by_name: null,
      updated_at: null,
    };
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('آخرین تغییردهنده:');
    expect(text).toContain('—');
  });
});
