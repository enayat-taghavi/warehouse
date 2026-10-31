// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TreasurerPettyCashComponent } from './treasurer-petty-cash';

describe('TreasurerPettyCashComponent — تن‌خواه جدای خزانه‌دار', () => {
  let component: TreasurerPettyCashComponent;
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
    component = new TreasurerPettyCashComponent(
      toast, api, { navigate: vi.fn() } as any, { queryParams: of({}) } as any, { detectChanges: vi.fn() } as any
    );
  });

  it('loads only legacy pending allocation rows', () => {
    component.ngOnInit();
    expect(api.getPettyCashTransactions).toHaveBeenCalledWith({ section_id: undefined, transaction_type: 'allocation' });
    expect(component.refills.map(r => r.id)).toEqual([1]);
    expect(component.refills[0].net_amount).toBe(1000);
  });

  it('refill needs a tracking code before it is sent', () => {
    component.ngOnInit();
    component.refillPettyCash(component.refills[0]);
    component.confirmRefill();
    expect(component.refillError).not.toBe('');
    expect(api.approvePettyCashTransaction).not.toHaveBeenCalled();
    component.refillTrackingCode = 'TRK-1';
    component.confirmRefill();
    expect(api.approvePettyCashTransaction).toHaveBeenCalledWith(1);
    expect(toast.success).toHaveBeenCalled();
  });
});
