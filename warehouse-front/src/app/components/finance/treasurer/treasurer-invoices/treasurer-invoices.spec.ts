// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TreasurerInvoicesComponent } from './treasurer-invoices';

describe('TreasurerInvoicesComponent — ارگونومی واکنش‌گرا و تب‌ها', () => {
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
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any
    );
  });

  it('1. defines responsive ergonomics tabs with short labels and entity icons', () => {
    expect(component.tabs.length).toBe(2);
    expect(component.tabs[0].id).toBe('payable_invoices');
    expect(component.tabs[0].label).toBe('فاکتورهای آماده پرداخت');
    expect(component.tabs[0].shortLabel).toBe('فاکتورها');
    expect(component.tabs[1].id).toBe('petty_cash_refills');
    expect(component.tabs[1].label).toBe('شارژ دفاتر تنخواه');
    expect(component.tabs[1].shortLabel).toBe('تنخواه');
  });

  it('2. switches sub-tabs with explicit validation', () => {
    component.switchSubTab('petty_cash_refills');
    expect(component.activeSubTab).toBe('petty_cash_refills');
    component.switchSubTab('invalid_sub_tab');
    expect(component.activeSubTab).toBe('petty_cash_refills');
    component.switchSubTab('payable_invoices');
    expect(component.activeSubTab).toBe('payable_invoices');
  });
});
