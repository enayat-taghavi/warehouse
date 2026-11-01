// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TreasurerInvoicesComponent } from './treasurer-invoices';

describe('TreasurerInvoicesComponent — فقط فاکتورهای آماده پرداخت', () => {
  let component: TreasurerInvoicesComponent;
  let mockToast: any;
  let mockPersonnelApi: any;

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getTreasuryCartable: vi.fn().mockReturnValue(of({ invoices: [] })),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      payExpenseInvoice: vi.fn().mockReturnValue(of({ message: 'ok' })),
      approvePettyCashTransaction: vi.fn().mockReturnValue(of({ message: 'ok' }))
    };

    component = new TreasurerInvoicesComponent(
      {} as any, {} as any, mockToast, mockPersonnelApi,
      {} as any, {} as any, {} as any,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any
    );
  });

  it('1. loads only payable invoices; petty cash refills moved to their own treasurer page', () => {
    component.loadTreasuryData();
    expect(mockPersonnelApi.getTreasuryCartable).toHaveBeenCalled();
    expect(mockPersonnelApi.getPettyCashTransactions).not.toHaveBeenCalled();
    expect((component as any).tabs).toBeUndefined();
  });

  it('opens and closes preview modal for invoice preview and history', () => {
    const item = { id: 501, invoice_number: 'INV-PAY-1' } as any;
    component.openPreview(item, 'preview');
    expect(component.previewModalOpen).toBe(true);
    expect(component.previewInvoiceId).toBe(501);
    expect(component.previewInitialTab).toBe('preview');

    component.openPreview(item, 'history');
    expect(component.previewInitialTab).toBe('history');

    component.closePreview();
    expect(component.previewModalOpen).toBe(false);
    expect(component.previewInvoiceId).toBeNull();
  });
});
