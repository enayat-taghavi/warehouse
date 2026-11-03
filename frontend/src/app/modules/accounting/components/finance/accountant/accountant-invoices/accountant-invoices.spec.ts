// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AccountantInvoicesHubComponent } from './accountant-invoices';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { PermissionService } from '../../../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function __inCtx<T>(factory: () => T): T {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: PermissionService, useValue: { canWriteDocuments: () => true } }],
  });
  return TestBed.runInInjectionContext(factory);
}


describe('AccountantInvoicesHubComponent — ممیزی فاکتورهای حسابدار و پیش‌نمایش/سابقه', () => {
  let component: AccountantInvoicesHubComponent;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockPrintService: any;

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 11, name: 'کارگاه ۲' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getExpenseInvoices: vi.fn().mockReturnValue(of([
        { id: 201, invoice_number: 'INV-ACC-1', status: 'pending_accountant', amount: 8000000 }
      ])),
      approveExpenseInvoice: vi.fn().mockReturnValue(of({})),
      requestRevisionExpenseInvoice: vi.fn().mockReturnValue(of({})),
    };
    mockPrintService = { downloadPdf: vi.fn() };

    component = __inCtx(() => new AccountantInvoicesHubComponent(
      {} as any,
      {} as any,
      mockToast,
      mockPersonnelApi,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any,
      mockPrintService
    ));
  });

  it('loads sections and accountant invoices', () => {
    component.ngOnInit();
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(mockPersonnelApi.getExpenseInvoices).toHaveBeenCalled();
    expect(component.allInvoices.length).toBe(1);
    expect(component.items.length).toBe(1);
  });

  it('opens and closes preview modal for invoice preview and history', () => {
    const item = { id: 201, invoice_number: 'INV-ACC-1' } as any;
    component.openPreview(item, 'preview');
    expect(component.previewModalOpen).toBe(true);
    expect(component.previewInvoiceId).toBe(201);
    expect(component.previewInvoiceItem).toBe(item);
    expect(component.previewInitialTab).toBe('preview');

    component.openPreview(item, 'history');
    expect(component.previewInitialTab).toBe('history');

    component.closePreview();
    expect(component.previewModalOpen).toBe(false);
    expect(component.previewInvoiceId).toBeNull();
    expect(component.previewInvoiceItem).toBeNull();
  });

  it('(a) with no query params, after ngOnInit() selectedSectionId is null and the last getExpenseInvoices call argument has no section_id property', () => {
    component.ngOnInit();
    expect(component.selectedSectionId).toBeNull();
    const lastCall = mockPersonnelApi.getExpenseInvoices.mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('section_id');
  });

  it('(b) with route queryParams: of({ section_id: \'10\' }) (10 is returned by getMySections) the call contains section_id: 10', () => {
    mockPersonnelApi.getMySections.mockReturnValue(of([{ id: 10, name: 'کارگاه ۱' }]));
    const compWithQuery = __inCtx(() => new AccountantInvoicesHubComponent(
      {} as any,
      {} as any,
      mockToast,
      mockPersonnelApi,
      { navigate: vi.fn() } as any,
      { queryParams: of({ section_id: '10' }) } as any,
      { detectChanges: vi.fn() } as any,
      mockPrintService
    ));
    compWithQuery.ngOnInit();
    expect(compWithQuery.selectedSectionId).toBe(10);
    const lastCall = mockPersonnelApi.getExpenseInvoices.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual(expect.objectContaining({ section_id: 10 }));
  });

  it('(c) with section_id: \'999\' (not in the list) selectedSectionId becomes null and no section_id is sent', () => {
    mockPersonnelApi.getMySections.mockReturnValue(of([{ id: 10, name: 'کارگاه ۱' }]));
    const compWithInvalidQuery = __inCtx(() => new AccountantInvoicesHubComponent(
      {} as any,
      {} as any,
      mockToast,
      mockPersonnelApi,
      { navigate: vi.fn() } as any,
      { queryParams: of({ section_id: '999' }) } as any,
      { detectChanges: vi.fn() } as any,
      mockPrintService
    ));
    compWithInvalidQuery.ngOnInit();
    expect(compWithInvalidQuery.selectedSectionId).toBeNull();
    const lastCall = mockPersonnelApi.getExpenseInvoices.mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('section_id');
  });
});

