// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { SupervisorInvoicesHubComponent } from '../supervisor/supervisor-invoices/supervisor-invoices';
import { AccountantInvoicesHubComponent } from '../accountant/accountant-invoices/accountant-invoices';
import { ManagerInvoicesComponent } from '../manager/manager-invoices/manager-invoices';
import { TreasurerInvoicesComponent } from '../treasurer/treasurer-invoices/treasurer-invoices';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { PrintService } from '../../../../../core/services/print.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function mocks() {
  const personnelApi: any = {
    getMySections: vi.fn().mockReturnValue(of([])),
    getProjectSections: vi.fn().mockReturnValue(of([])),
    getExpenseInvoices: vi.fn().mockReturnValue(of([])),
    getTreasuryCartable: vi.fn().mockReturnValue(of({ invoices: [] })),
    approveExpenseInvoice: vi.fn().mockReturnValue(of({})),
    requestRevisionExpenseInvoice: vi.fn().mockReturnValue(of({})),
    postCartableAction: vi.fn().mockReturnValue(of({})),
    getCounterparties: vi.fn().mockReturnValue(of([])),
  };
  const toast: any = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
  const route: any = { queryParams: of({ tab: 'all' }) };
  const router: any = { navigate: vi.fn() };
  const cdr: any = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  const ws: any = { liveRefresh$: vi.fn().mockReturnValue(of()), documentChanges$: vi.fn().mockReturnValue(of()) };
  return { personnelApi, toast, route, router, cdr, ws };
}

describe('Role invoice components in embedded mode (ح۲)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('supervisor: embedded does not fetch or subscribe, and approve/return emit changed instead of reloading', () => {
    const m = mocks();
    const cmp = new SupervisorInvoicesHubComponent({} as any, {} as any, m.toast, m.personnelApi, m.router, m.route, m.cdr, {} as any, m.ws);
    cmp.embedded = true;
    const changed = vi.fn();
    cmp.changed.subscribe(changed);
    cmp.ngOnInit();
    expect(m.personnelApi.getMySections).not.toHaveBeenCalled();
    expect(m.personnelApi.getExpenseInvoices).not.toHaveBeenCalled();
    expect(m.ws.documentChanges$).not.toHaveBeenCalled();
    expect(m.ws.liveRefresh$).not.toHaveBeenCalled();

    cmp.approveSingle({ id: 3, invoice_number: 'A' } as any);
    expect(m.personnelApi.approveExpenseInvoice).toHaveBeenCalledWith(3);
    expect(changed).toHaveBeenCalledTimes(1);

    cmp.rejectSingle({ id: 4, invoice_number: 'B' } as any);
    expect(cmp.isReasonDialogOpen).toBe(true);
    cmp.onReasonConfirmed('دلیل');
    expect(m.personnelApi.requestRevisionExpenseInvoice).toHaveBeenCalledWith(4, 'دلیل');
    expect(changed).toHaveBeenCalledTimes(2);
    expect(m.personnelApi.getExpenseInvoices).not.toHaveBeenCalled();
  });

  it('supervisor: non-embedded behaviour still loads sections and invoices', () => {
    const m = mocks();
    const cmp = new SupervisorInvoicesHubComponent({} as any, {} as any, m.toast, m.personnelApi, m.router, m.route, m.cdr, {} as any, m.ws);
    const changed = vi.fn();
    cmp.changed.subscribe(changed);
    cmp.ngOnInit();
    expect(m.personnelApi.getMySections).toHaveBeenCalled();
    expect(m.personnelApi.getExpenseInvoices).toHaveBeenCalled();
    expect(cmp.activeSubTab).toBe('all');
    cmp.approveSingle({ id: 3 } as any);
    expect(changed).not.toHaveBeenCalled();
  });

  it('accountant: embedded does not fetch; book and return emit changed', () => {
    const m = mocks();
    const cmp = new AccountantInvoicesHubComponent({} as any, {} as any, m.toast, m.personnelApi, m.router, m.route, m.cdr, {} as any, m.ws);
    cmp.embedded = true;
    const changed = vi.fn();
    cmp.changed.subscribe(changed);
    cmp.ngOnInit();
    expect(m.personnelApi.getMySections).not.toHaveBeenCalled();
    cmp.bookDocument({ id: 5 } as any);
    cmp.rejectDocument({ id: 5 } as any);
    cmp.onReasonConfirmed('x');
    expect(changed).toHaveBeenCalledTimes(2);
    expect(m.personnelApi.getExpenseInvoices).not.toHaveBeenCalled();
  });

  it('treasurer: embedded does not fetch; payExpenseInvoice opens the pay modal with the mapped row', () => {
    const m = mocks();
    const treasuryApi: any = { getInvoicePayments: vi.fn().mockReturnValue(of({ results: [], paid_amount: 0, remaining: 900 })) };
    const companyApi: any = { getBankAccounts: vi.fn().mockReturnValue(of([])) };
    const cmp = new TreasurerInvoicesComponent({} as any, {} as any, m.toast, m.personnelApi, treasuryApi, companyApi, {} as any, m.router, m.route, m.cdr, m.ws);
    cmp.embedded = true;
    const changed = vi.fn();
    cmp.changed.subscribe(changed);
    cmp.ngOnInit();
    expect(m.personnelApi.getMySections).not.toHaveBeenCalled();
    expect(m.personnelApi.getTreasuryCartable).not.toHaveBeenCalled();

    cmp.payExpenseInvoice({ id: 12, invoice_number: 'P-12', counterparty_name: 'فروشنده', status: 'partially_paid', amount: 1000, paid_amount: 100, remaining: 900, section: 4, counterparty: 7 } as any);
    expect(cmp.payModalOpen).toBe(true);
    expect(cmp.payItem).toEqual(expect.objectContaining({ id: 12, vendor_name: 'فروشنده', status: 'partially_paid', remaining: 900, section_id: 4, counterparty_id: 7 }));
    expect(treasuryApi.getInvoicePayments).toHaveBeenCalledWith(12);

    cmp.loadTreasuryData(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(m.personnelApi.getTreasuryCartable).not.toHaveBeenCalled();
  });

  it('treasurer: toPayableItem keeps the old cartable mapping', () => {
    const m = mocks();
    const cmp = new TreasurerInvoicesComponent({} as any, {} as any, m.toast, m.personnelApi, {} as any, {} as any, {} as any, m.router, m.route, m.cdr, m.ws);
    expect(cmp.toPayableItem({ id: 1, status: 'ready_to_pay', amount: 500, paid_amount: 200 })).toEqual(expect.objectContaining({
      id: 1, status: 'pending_payment', vendor_name: 'طرف‌حساب', paid_amount: 200, remaining: 300, section_id: null, counterparty_id: null, number: null,
    }));
  });

  function managerFixture(embedded: boolean) {
    const m = mocks();
    TestBed.configureTestingModule({
      imports: [ManagerInvoicesComponent],
      providers: [
        { provide: PersonnelApiService, useValue: m.personnelApi },
        { provide: ToastService, useValue: m.toast },
        { provide: PrintService, useValue: { downloadPdf: vi.fn() } },
        { provide: WebSocketService, useValue: m.ws },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(ManagerInvoicesComponent);
    fixture.componentRef.setInput('embedded', embedded);
    fixture.detectChanges();
    return { fixture, m };
  }

  it('manager DOM: embedded renders only the dialogs and never fetches; non-embedded renders the table', () => {
    const emb = managerFixture(true);
    const el: HTMLElement = emb.fixture.nativeElement;
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('app-workflow-reason-dialog')).toBeTruthy();
    expect(el.querySelector('app-invoice-preview-modal')).toBeTruthy();
    expect(el.firstElementChild?.classList.contains('contents')).toBe(true);
    expect(emb.m.personnelApi.getExpenseInvoices).not.toHaveBeenCalled();
    const changed = vi.fn();
    emb.fixture.componentInstance.changed.subscribe(changed);
    emb.fixture.componentInstance.approveInvoiceManager({ id: 9 });
    expect(emb.m.personnelApi.postCartableAction).toHaveBeenCalledWith('manager', { action: 'approve', model: 'invoice', id: 9 });
    expect(changed).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    const full = managerFixture(false);
    const fel: HTMLElement = full.fixture.nativeElement;
    expect(fel.querySelector('table')).toBeTruthy();
    expect(fel.firstElementChild?.classList.contains('contents')).toBe(false);
    expect(full.m.personnelApi.getExpenseInvoices).toHaveBeenCalledWith({ status: 'pending_manager' });
  });
});
