// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ManagerInvoicesComponent } from './manager-invoices';

describe('ManagerInvoicesComponent — مجوز پرداخت فاکتور مدیر', () => {
  let component: ManagerInvoicesComponent;
  let api: any;
  let toast: any;

  beforeEach(() => {
    api = {
      getExpenseInvoices: vi.fn().mockReturnValue(of([{ id: 201, invoice_number: 'INV-1', status: 'pending_manager' }])),
      postCartableAction: vi.fn().mockReturnValue(of({})),
    };
    toast = { show: vi.fn() };
    component = new ManagerInvoicesComponent(api, toast, { detectChanges: vi.fn() } as any, { downloadPdf: vi.fn() } as any);
  });

  it('loads invoices waiting for the manager', () => {
    component.ngOnInit();
    expect(api.getExpenseInvoices).toHaveBeenCalledWith({ status: 'pending_manager' });
    expect(component.invoicesList.length).toBe(1);
  });

  it('approve sends the manager cartable action', () => {
    component.approveInvoiceManager({ id: 201, invoice_number: 'INV-1' });
    expect(api.postCartableAction).toHaveBeenCalledWith('manager', { action: 'approve', model: 'invoice', id: 201 });
  });

  it('revision needs the dialog reason and keeps the server error in the dialog', () => {
    component.rejectInvoiceManager({ id: 201 });
    expect(component.isInvoiceReasonOpen).toBe(true);
    api.postCartableAction.mockReturnValueOnce(throwError(() => ({ error: { error: 'خطای سرور' } })));
    component.onInvoiceReasonConfirmed('دلیل');
    expect(api.postCartableAction).toHaveBeenCalledWith('manager', { action: 'revision', model: 'invoice', id: 201, reason: 'دلیل' });
    expect(component.isInvoiceReasonOpen).toBe(true);
    expect(component.invoiceReasonServerError).toBe('خطای سرور');
    component.onInvoiceReasonConfirmed('دلیل');
    expect(component.isInvoiceReasonOpen).toBe(false);
  });
});
