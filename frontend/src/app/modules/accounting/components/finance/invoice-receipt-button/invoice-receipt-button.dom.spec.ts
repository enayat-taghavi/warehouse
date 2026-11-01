// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { InvoiceReceiptButtonComponent, ReceiptItem } from './invoice-receipt-button';
import { ApiService } from '../../../../../core/api/api.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('InvoiceReceiptButtonComponent (DOM & unit tests)', () => {
  let fixture: ComponentFixture<InvoiceReceiptButtonComponent>;
  let component: InvoiceReceiptButtonComponent;
  let http: HttpTestingController;
  let mockToast: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    if (typeof URL.createObjectURL !== 'function') {
      (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as any).revokeObjectURL = vi.fn();
    }
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockToast = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InvoiceReceiptButtonComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ApiService,
          useFactory: (httpClient: HttpClient) => new ApiService(httpClient),
          deps: [HttpClient],
        },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceReceiptButtonComponent);
    component = fixture.componentInstance;
    component.invoiceId = 42;
    vi.spyOn(component, 'downloadItem');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('one receipt downloads directly', async () => {
    const item: ReceiptItem = {
      id: 101,
      original_name: 'receipt_42.pdf',
      created_at: '2026-10-30T10:00:00Z',
      download_url: '/api/attachments/101/download/',
    };

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    fixture.detectChanges();

    const listReq = http.expectOne(
      (req) =>
        (req.url.endsWith('attachments/') || req.url.endsWith('attachments')) &&
        req.params.get('label') === 'payment_receipt'
    );
    expect(listReq.request.params.get('id')).toBe('42');
    expect(listReq.request.params.get('kind')).toBe('expense_invoice');
    listReq.flush([item]);

    await fixture.whenStable();
    fixture.detectChanges();

    const dlReq = http.expectOne((req) => req.url.includes('101/download'));
    dlReq.flush(new Blob(['pdf-data'], { type: 'application/pdf' }));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.downloadItem).toHaveBeenCalledWith(item);
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('several receipts open a menu', async () => {
    const items: ReceiptItem[] = [
      {
        id: 201,
        original_name: 'receipt_first.pdf',
        created_at: '2026-10-30T10:00:00Z',
        download_url: '/api/attachments/201/download/',
      },
      {
        id: 202,
        original_name: 'receipt_second.png',
        created_at: '2026-10-31T12:00:00Z',
        download_url: '/api/attachments/202/download/',
      },
    ];

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    fixture.detectChanges();

    const listReq = http.expectOne(
      (req) =>
        (req.url.endsWith('attachments/') || req.url.endsWith('attachments')) &&
        req.params.get('label') === 'payment_receipt'
    );
    listReq.flush(items);

    await fixture.whenStable();
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('receipt_first.pdf');
    expect(fixture.nativeElement.textContent).toContain('receipt_second.png');

    const menuItems = fixture.nativeElement.querySelectorAll('[role="menuitem"]');
    expect(menuItems.length).toBe(2);

    (menuItems[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    const dlReq = http.expectOne((req) => req.url.includes('202/download'));
    dlReq.flush(new Blob(['img-bytes'], { type: 'image/png' }));

    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.downloadItem).toHaveBeenCalledWith(items[1], expect.anything());
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('no receipt shows info toast', async () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    fixture.detectChanges();

    const listReq = http.expectOne(
      (req) =>
        (req.url.endsWith('attachments/') || req.url.endsWith('attachments')) &&
        req.params.get('label') === 'payment_receipt'
    );
    listReq.flush([]);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockToast.info).toHaveBeenCalledWith('رسیدی برای این فاکتور ثبت نشده است');
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('403 shows the same info toast', async () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    fixture.detectChanges();

    const listReq = http.expectOne(
      (req) =>
        (req.url.endsWith('attachments/') || req.url.endsWith('attachments')) &&
        req.params.get('label') === 'payment_receipt'
    );
    listReq.flush({ detail: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockToast.info).toHaveBeenCalledWith('رسیدی برای این فاکتور ثبت نشده است');
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('has Persian aria-label and download icon', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('دانلود رسید');
    expect(btn.getAttribute('title')).toBe('دانلود رسید پرداخت');
    expect(btn.hasAttribute('appaction')).toBe(true);
    expect(btn.querySelector('svg')).not.toBeNull();
  });
});
