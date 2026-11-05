// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { PettyCashPageComponent } from './petty-cash-page';

// پیش‌تر treasurer-petty-cash.spec.ts؛ خزانه‌دار اکنون صفحهٔ مشترک تن‌خواه با pettyRole='treasurer' است
describe('PettyCashPageComponent (treasurer) — تن‌خواه خزانه‌دار', () => {
  let component: PettyCashPageComponent;
  let api: any;
  let toast: any;

  beforeEach(() => {
    api = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([
        { id: 1, status: 'pending_accountant', amount: 1000, custodian_name: 'الف' },
        { id: 2, status: 'approved', amount: 500 },
      ])),
      approvePettyCashTransaction: vi.fn().mockReturnValue(of({})),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    component = new PettyCashPageComponent(
      toast, api, { navigate: vi.fn() } as any,
      { queryParams: of({}), snapshot: { data: { pettyRole: 'treasurer' } } } as any,
      { detectChanges: vi.fn() } as any,
      { canWriteDocuments: () => false } as any
    );
  });

  it('loads only legacy pending allocation rows', () => {
    component.ngOnInit();
    expect(api.getPettyCashTransactions).toHaveBeenCalledWith({ transaction_type: 'allocation' });
    // «همه» پیش‌فرض است؛ زبانهٔ «واریز» فقط ردیف قدیمیِ منتظر را نشان می‌دهد
    expect(component.activeSubTab).toBe('all');
    component.switchSubTab('pending_review');
    expect(component.items.map(r => r.id)).toEqual([1]);
    expect(component.netAmount(component.items[0])).toBe(1000);
    expect(component.tabs.map(t => t.label)).toEqual(['همه', 'واریز', 'پرداخت‌شده']);
    expect(component.tabs.find(t => t.id === 'pending_review')?.count).toBe(1);
  });

  it('refill needs a tracking code before it is sent', () => {
    component.ngOnInit();
    component.switchSubTab('pending_review');
    component.refillPettyCash(component.items[0]);
    component.confirmRefill();
    expect(component.refillError).not.toBe('');
    expect(api.approvePettyCashTransaction).not.toHaveBeenCalled();
    component.refillTrackingCode = 'TRK-1';
    component.confirmRefill();
    expect(api.approvePettyCashTransaction).toHaveBeenCalledWith(1, 'TRK-1');
    expect(toast.success).toHaveBeenCalled();
  });
});
