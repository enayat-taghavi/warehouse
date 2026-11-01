// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SupervisorInvoicesHubComponent } from './supervisor-invoices';

describe('SupervisorInvoicesHubComponent — تایید فاکتورهای سرپرست و پیش‌نمایش/سابقه', () => {
  let component: SupervisorInvoicesHubComponent;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockPrintService: any;

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'کارگاه ۱' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getExpenseInvoices: vi.fn().mockReturnValue(of([
        { id: 101, invoice_number: 'INV-SUP-1', status: 'pending_supervisor', amount: 5000000 }
      ])),
      approveExpenseInvoice: vi.fn().mockReturnValue(of({})),
      requestRevisionExpenseInvoice: vi.fn().mockReturnValue(of({})),
    };
    mockPrintService = { downloadPdf: vi.fn() };

    component = new SupervisorInvoicesHubComponent(
      {} as any,
      {} as any,
      mockToast,
      mockPersonnelApi,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any,
      mockPrintService
    );
  });

  it('loads sections and invoices', () => {
    component.ngOnInit();
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(mockPersonnelApi.getExpenseInvoices).toHaveBeenCalled();
    expect(component.allInvoices.length).toBe(1);
    expect(component.items.length).toBe(1);
  });

  it('opens and closes preview modal for invoice preview and history', () => {
    const item = { id: 101, invoice_number: 'INV-SUP-1' } as any;
    component.openPreview(item, 'preview');
    expect(component.previewModalOpen).toBe(true);
    expect(component.previewInvoiceId).toBe(101);
    expect(component.previewInvoiceItem).toBe(item);
    expect(component.previewInitialTab).toBe('preview');

    component.openPreview(item, 'history');
    expect(component.previewInitialTab).toBe('history');

    component.closePreview();
    expect(component.previewModalOpen).toBe(false);
    expect(component.previewInvoiceId).toBeNull();
    expect(component.previewInvoiceItem).toBeNull();
  });
});

