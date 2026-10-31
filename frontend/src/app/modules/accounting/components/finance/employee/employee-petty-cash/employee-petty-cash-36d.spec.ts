// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeePettyCashHubComponent } from './employee-petty-cash';
import { of, Subject, throwError } from 'rxjs';
import {
  PettyCashTransaction,
  PettyCashBalanceSummary,
  PettyCashStatement,
  Counterparty,
  ProjectSection
} from '../../../../models/personnel.model';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';

describe('EmployeePettyCashHubComponent 3.6-d', () => {
  let component: EmployeePettyCashHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true },
    { id: 20, name: 'بخش تاسیسات', code: 'MEC', project: 1, project_name: 'پروژه پردیس', is_active: true }
  ];

  const sampleCounterparties: Counterparty[] = [
    {
      id: 101,
      name: 'ابزار صنعت البرز',
      counterparty_type: 'other',
      phone: '09121111111',
      is_active: true
    }
  ];

  const sampleBalance: PettyCashBalanceSummary = {
    account_id: 1,
    company_id: 5,
    debt: 2000000,
    ceiling_amount: 100000000,
    ceiling_amount_tomans: 10000000,
    total_allocated: 80000000,
    total_allocated_tomans: 8000000,
    total_spent: 30000000,
    total_spent_tomans: 3000000,
    current_balance: 50000000,
    current_balance_tomans: 5000000,
    pending_settlement: 15000000,
    pending_settlement_tomans: 1500000,
    utilization_rate: 30.0,
    card_or_account_number: '6037991122334455',
    sheba_number: 'IR120120000000000000000001',
    custodian_name: 'کارمند نمونه',
    custodian_id: 1
  };

  const sampleTransactions: PettyCashTransaction[] = [
    {
      id: 1,
      section: 10,
      custodian: 1,
      custodian_name: 'کارمند نمونه',
      transaction_type: 'expense',
      amount: 10000000,
      transaction_date_shamsi: '1405/04/01',
      title: 'خرید ملزومات کارگاه',
      category: 'ملزومات و مصرفی کارگاه',
      counterparty: 101,
      counterparty_name: 'ابزار صنعت البرز',
      receipt_number: 'REC-1001',
      status: 'draft',
      line_status: 'open',
      statement: null,
      status_display: 'پیش‌نویس کارمند'
    },
    {
      id: 2,
      section: null,
      custodian: 1,
      custodian_name: 'کارمند نمونه',
      transaction_type: 'expense',
      amount: 20000000,
      transaction_date_shamsi: '1405/04/02',
      title: 'پذیرایی و آبدارخانه کارگاه',
      category: 'پذیرایی و آبدارخانه',
      status: 'draft',
      line_status: 'rejected',
      line_reject_reason: 'فاکتور ناخوانا',
      statement: 7
    },
    {
      id: 3,
      section: 10,
      custodian: 1,
      custodian_name: 'کارمند نمونه',
      transaction_type: 'allocation',
      amount: 80000000,
      transaction_date_shamsi: '1405/04/03',
      title: 'شارژ اولیه تنخواه گردان',
      category: 'شارژ مجدد تنخواه',
      status: 'approved',
      status_display: 'تایید و تسویه‌شده'
    },
    {
      id: 4,
      section: null,
      custodian: 1,
      transaction_type: 'expense',
      amount: 5000000,
      transaction_date_shamsi: '1405/04/04',
      title: 'هزینهٔ قفل',
      category: 'متفرقه',
      status: 'draft',
      line_status: 'open',
      is_locked: true
    }
  ];

  const sampleStatement: PettyCashStatement = {
    id: 7,
    company: 5,
    account: 1,
    custodian: 1,
    statement_date_shamsi: '1405/04/10',
    total_amount: 20000000,
    approved_amount: 0,
    status: 'submitted',
    lines_count: 1
  };

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getPettyCashBalance: vi.fn().mockReturnValue(of(sampleBalance)),
      getPettyCashAccounts: vi.fn().mockReturnValue(of([{ id: 1, company: 5, custodian: 1, ceiling_amount: 100000000, is_active: true }])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of(sampleTransactions)),
      getPettyCashStatements: vi.fn().mockReturnValue(of([sampleStatement])),
      getPettyCashStatement: vi.fn().mockReturnValue(of(sampleStatement)),
      getFinancialProjects: vi.fn().mockReturnValue(of([{ id: 3, code: 'P3', name: 'پروژه سه', is_active: true }])),
      getCounterparties: vi.fn().mockReturnValue(of(sampleCounterparties)),
      getExpenseHeads: vi.fn().mockReturnValue(of([{ id: 1, company: 1, parent: null, code: '10', title: 'عملیاتی', is_active: true }, { id: 11, company: 1, parent: 1, code: '1001', title: 'تعمیرات و نگهداری', is_active: true }])),
      createPettyCashTransaction: vi.fn().mockReturnValue(of({ ...sampleTransactions[0], id: 99 })),
      deletePettyCashTransaction: vi.fn().mockReturnValue(of(undefined)),
      requestPettyCashCharge: vi.fn().mockReturnValue(of({ id: 88, amount: 20000000, transaction_type: 'allocation', status: 'pending_accountant' })),
      sendPettyCashCharge: vi.fn().mockReturnValue(of({ id: 88 })),
      payPettyCashCharge: vi.fn().mockReturnValue(of({ id: 88 })),
      createPettyCashStatement: vi.fn().mockReturnValue(of(sampleStatement)),
      sendPettyCashStatement: vi.fn().mockReturnValue(of(sampleStatement)),
      rejectPettyCashStatementLine: vi.fn().mockReturnValue(of(sampleStatement)),
      payPettyCashStatement: vi.fn().mockReturnValue(of(sampleStatement)),
      updatePettyCashAccount: vi.fn().mockReturnValue(of({ id: 1, ceiling_amount: 90000000 })),
      createCounterparty: vi.fn().mockReturnValue(of({ id: 202, name: 'فروشگاه جدید' })),
      exportPettyCashTransactionsExcel: vi.fn().mockReturnValue(of(new Blob(['mock excel'], { type: 'application/vnd.ms-excel' })))
    };

    mockToast = {
      show: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({})
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeePettyCashHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
  });

  it('a) charge request: sets amount, submits charge, calls requestPettyCashCharge once, and shows success toast', () => {
    component.openChargeModal();
    component.chargeData.amount = 45000000;

    component.submitCharge();

    expect(mockPersonnelApi.requestPettyCashCharge).toHaveBeenCalledTimes(1);
    expect(mockPersonnelApi.requestPettyCashCharge).toHaveBeenCalledWith({
      amount: 45000000,
      title: 'درخواست شارژ تنخواه',
      description: ''
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('درخواست شارژ'));
  });

  it('b) charge request offline: throws unreachable error, shows error toast, and does not retry/queue transaction', () => {
    const unreachableErr = { status: 0 };
    expect(isServerUnreachable(unreachableErr.status)).toBe(true);

    mockPersonnelApi.requestPettyCashCharge.mockReturnValue(throwError(() => unreachableErr));
    component.chargeData = { amount: 30000000, title: 'شارژ آفلاین', description: '' };

    component.submitCharge();

    expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('اتصال'));
    expect(mockPersonnelApi.createPettyCashTransaction).not.toHaveBeenCalled();
  });

  it('c) statement builder: filters open draft expenses, toggles lines, sums selected total, and creates statement', () => {
    const openDraft1: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 501,
      transaction_type: 'expense',
      amount: 1500000,
      status: 'draft',
      line_status: 'open',
      statement: null,
      is_locked: false
    };
    const openDraft2: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 502,
      transaction_type: 'expense',
      amount: 2500000,
      status: 'draft',
      line_status: 'open',
      statement: null,
      is_locked: false
    };
    const alreadyInStatement: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 503,
      transaction_type: 'expense',
      amount: 3500000,
      status: 'draft',
      line_status: 'open',
      statement: 12,
      is_locked: false
    };

    component.transactions = [openDraft1, openDraft2, alreadyInStatement];
    expect(component.openExpenses.map(t => t.id)).toEqual([501, 502]);

    component.toggleLine(openDraft1);
    component.toggleLine(openDraft2);
    expect(component.selectedTotal).toBe(4000000);

    component.createStatement();
    expect(mockPersonnelApi.createPettyCashStatement).toHaveBeenCalledWith(
      expect.objectContaining({ line_ids: [501, 502] })
    );
  });

  it('d) canModifyExpense: false for is_locked, statement set, and non-draft status; true for open unlocked draft', () => {
    const lockedExpense: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 601,
      transaction_type: 'expense',
      status: 'draft',
      line_status: 'open',
      statement: null,
      is_locked: true
    };
    const inStatementExpense: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 602,
      transaction_type: 'expense',
      status: 'draft',
      line_status: 'open',
      statement: 8,
      is_locked: false
    };
    const nonDraftExpense: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 603,
      transaction_type: 'expense',
      status: 'approved',
      line_status: 'open',
      statement: null,
      is_locked: false
    };
    const openUnlockedDraft: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 604,
      transaction_type: 'expense',
      status: 'draft',
      line_status: 'open',
      statement: null,
      is_locked: false
    };

    expect(component.canModifyExpense(lockedExpense)).toBe(false);
    expect(component.canModifyExpense(inStatementExpense)).toBe(false);
    expect(component.canModifyExpense(nonDraftExpense)).toBe(false);
    expect(component.canModifyExpense(openUnlockedDraft)).toBe(true);
  });

  it('e) ceiling permission: canEditCeiling is false without perm_manager_payment_authorize and saves no ceiling; true when granted', () => {
    component.account = { id: 1, company: 5, custodian: 1, ceiling_amount: 100000000, is_active: true };
    component.ceilingDraft = 120000000;

    mockAuth.user.mockReturnValue({ id: 1, username: 'test_user', is_superuser: false });
    mockAuth.userPermissions.mockReturnValue([]);

    expect(component.canEditCeiling).toBe(false);
    component.saveCeiling();
    expect(mockPersonnelApi.updatePettyCashAccount).not.toHaveBeenCalled();

    mockAuth.userPermissions.mockReturnValue(['perm_manager_payment_authorize']);
    expect(component.canEditCeiling).toBe(true);
    component.saveCeiling();
    expect(mockPersonnelApi.updatePettyCashAccount).toHaveBeenCalledWith(1, { ceiling_amount: 120000000 });
  });

  it('f) line reject: open statement detail for other custodian, verify reason requirement for confirmRejectLine', () => {
    const otherCustodianStatement: PettyCashStatement = {
      ...sampleStatement,
      id: 70,
      custodian: 99,
      status: 'submitted'
    };
    const statementLine: PettyCashTransaction = {
      ...sampleTransactions[0],
      id: 801,
      statement: 70,
      transaction_type: 'expense',
      amount: 1000000,
      title: 'خرید مصالح',
      status: 'draft',
      line_status: 'open'
    };

    mockPersonnelApi.getPettyCashStatement.mockReturnValue(of(otherCustodianStatement));
    mockPersonnelApi.getPettyCashTransactions.mockReturnValue(of([statementLine]));
    mockAuth.userPermissions.mockReturnValue(['perm_invoice_review']);

    (component as any).openDetail('statement', 70);

    expect(component.detailStatement?.id).toBe(70);
    expect(component.detailLines.length).toBe(1);
    expect(component.canRejectLines).toBe(true);

    component.startRejectLine(statementLine);
    expect(component.rejectLineId).toBe(801);

    component.rejectReason = '';
    component.confirmRejectLine();
    expect(mockPersonnelApi.rejectPettyCashStatementLine).not.toHaveBeenCalled();
    expect(component.rejectReasonError).toContain('الزامی');

    component.rejectReason = 'فاکتور پیوست نشده است';
    component.confirmRejectLine();
    expect(mockPersonnelApi.rejectPettyCashStatementLine).toHaveBeenCalledWith(70, 801, 'فاکتور پیوست نشده است');
  });

  it('g) deep link: loads statement detail for { statement: "7" } and charge detail for { charge: "9" }', () => {
    mockRoute.queryParams = of({ statement: '7' });
    component.ngOnInit();
    expect(component.activeView).toBe('statements');
    expect(component.detailKind).toBe('petty_cash_statement');
    expect(component.detailId).toBe(7);
    expect(mockPersonnelApi.getPettyCashStatement).toHaveBeenCalledWith(7);

    const chargeTx: PettyCashTransaction = {
      ...sampleTransactions[2],
      id: 9,
      transaction_type: 'allocation',
      amount: 50000000,
      title: 'شارژ آزمایشی',
      status: 'draft'
    };
    const txSubject = new Subject<PettyCashTransaction[]>();
    const mockRouteCharge: any = { queryParams: of({ charge: '9' }) };
    const mockApiForCharge: any = {
      ...mockPersonnelApi,
      getPettyCashTransactions: vi.fn().mockReturnValue(txSubject.asObservable())
    };
    const chargeComponent = new EmployeePettyCashHubComponent(
      mockAuth,
      mockApiForCharge,
      mockToast,
      mockCdr,
      mockRouteCharge,
      mockRouter
    );
    chargeComponent.ngOnInit();
    expect(chargeComponent.activeView).toBe('charges');
    expect(chargeComponent.detailKind).toBe('petty_cash_charge');
    expect(chargeComponent.detailId).toBe(9);
    expect(chargeComponent.isLoadingDetail).toBe(true);
    txSubject.next([chargeTx]);
    expect(chargeComponent.detailTx?.id).toBe(9);
    expect(chargeComponent.isLoadingDetail).toBe(false);
    mockAuth.userPermissions.mockReturnValue(['perm_treasury_disburse_action']);
    // دکمهٔ واریز فقط وقتی گردش به مرحلهٔ خزانه‌دار رسیده باشد (همان گارد سرور)
    expect(chargeComponent.canPayCharge).toBe(false);
    chargeComponent.detailWfStep = 'manager_approve';
    expect(chargeComponent.canPayCharge).toBe(false);
    chargeComponent.detailWfStep = 'treasury_pay';
    expect(chargeComponent.canPayCharge).toBe(true);
  });
});
