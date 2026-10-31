// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeePettyCashHubComponent } from './employee-petty-cash';
import { of, throwError } from 'rxjs';
import {
  PettyCashTransaction,
  PettyCashBalanceSummary,
  PettyCashStatement,
  Counterparty,
  ProjectSection
} from '../../../../models/personnel.model';

describe('EmployeePettyCashHubComponent Vitest Suite', () => {
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

  it('1. should initialize with shamsi date and load company-level data without a section', () => {
    component.ngOnInit();
    expect(component.todayShamsi).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(component.mySections.length).toBe(2);
    expect(component.selectedSectionId).toBeNull();
    expect(mockPersonnelApi.getPettyCashBalance).toHaveBeenCalledWith(null, undefined, null);
    expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalledWith({});
    expect(mockPersonnelApi.getPettyCashStatements).toHaveBeenCalledWith({ custodian_id: 1 });
    expect(component.account?.id).toBe(1);
  });

  it('2. should set balance summary with debt', () => {
    component.loadBalanceSummary();
    expect(component.balanceSummary).toEqual(sampleBalance);
    expect(component.balanceSummary?.current_balance).toBe(50000000);
    expect(component.balanceSummary?.debt).toBe(2000000);
  });

  it('3. should filter transactions by an optional section', () => {
    component.selectedSectionId = 20;
    component.loadTransactions();
    expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalledWith({ section_id: 20 });
  });

  it('4. should filter expenses by text search across title, receipt, category, and counterparty', () => {
    component.transactions = sampleTransactions;
    component.transactionSearch = 'آبدارخانه';
    expect(component.filteredTransactions.length).toBe(1);
    expect(component.filteredTransactions[0].id).toBe(2);

    component.transactionSearch = 'REC-1001';
    expect(component.filteredTransactions.length).toBe(1);
    expect(component.filteredTransactions[0].id).toBe(1);

    component.transactionSearch = 'البرز';
    expect(component.filteredTransactions.length).toBe(1);
  });

  it('5. should filter expenses by status tabs using the line status', () => {
    component.transactions = sampleTransactions;

    component.setStatusFilter('draft');
    expect(component.filteredTransactions.map(t => t.id)).toEqual([1, 4]);

    component.setStatusFilter('rejected');
    expect(component.filteredTransactions.map(t => t.id)).toEqual([2]);

    component.setStatusFilter('all');
    expect(component.filteredTransactions.length).toBe(3); // شارژ در نمای جدا است
    expect(component.chargeRows.length).toBe(1);
  });

  it('6. should calculate status counters for expense tabs', () => {
    component.transactions = sampleTransactions;
    const counters = component.statusCounters;
    expect(counters.all).toBe(3);
    expect(counters.draft).toBe(2);
    expect(counters.approved).toBe(0);
    expect(counters.rejected).toBe(1);
  });

  it('7. should keep the Draft invariant on a new expense; section and project are optional', () => {
    component.openNewExpenseModal();
    expect(component.isNewExpenseModalOpen).toBe(true);
    expect(component.newExpense.status).toBe('draft');
    expect(component.newExpense.transaction_type).toBe('expense');
    expect(component.newExpense.section).toBeNull();
    expect(component.newExpense.project).toBeNull();
  });

  it('8. should validate required fields before saving expense', () => {
    component.newExpense = { title: '', amount: 0, transaction_date_shamsi: '' };
    component.saveExpense();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('عنوان'));

    component.newExpense.title = 'خرید پیچ و مهره';
    component.saveExpense();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('تاریخ'));

    component.newExpense.transaction_date_shamsi = '1405/04/01';
    component.saveExpense();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('مبلغ'));
    expect(mockPersonnelApi.createPettyCashTransaction).not.toHaveBeenCalled();
  });

  it('9. should save new expense with FormData and optional section/project when attachment is provided', () => {
    component.newExpense = {
      title: 'خرید ابزار',
      transaction_date_shamsi: '1405/04/01',
      amount: 5000000,
      expense_head: 11,
      section: 10,
      project: 3,
      status: 'draft'
    };
    component.selectedExpenseAttachment = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

    component.saveExpense();

    expect(mockPersonnelApi.createPettyCashTransaction).toHaveBeenCalled();
    const payloadArg = mockPersonnelApi.createPettyCashTransaction.mock.calls[0][0] as FormData;
    expect(payloadArg instanceof FormData).toBe(true);
    expect(payloadArg.get('expense_head')).toBe('11');
    expect(payloadArg.get('section')).toBe('10');
    expect(payloadArg.get('project')).toBe('3');
    expect(payloadArg.has('category')).toBe(false);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس'));
    expect(component.isNewExpenseModalOpen).toBe(false);
  });

  it('10. should save an expense without any section or project', () => {
    component.newExpense = { title: 'خرید', transaction_date_shamsi: '1405/04/01', amount: 1000, expense_head: 11, section: null, project: null };
    component.saveExpense();
    const payload = mockPersonnelApi.createPettyCashTransaction.mock.calls[0][0];
    expect(payload.section).toBeNull();
    expect(payload.project).toBeNull();
  });

  it('11. should only allow modifying open draft expenses outside a statement and not locked', () => {
    expect(component.canModifyExpense(sampleTransactions[0])).toBe(true);
    expect(component.canModifyExpense(sampleTransactions[1])).toBe(false); // در صورت‌حساب و ردشده
    expect(component.canModifyExpense(sampleTransactions[3])).toBe(false); // قفل
    component.deleteDraftTransaction(sampleTransactions[1]);
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('قابل حذف'));
    expect(mockPersonnelApi.deletePettyCashTransaction).not.toHaveBeenCalled();
  });

  it('12. should delete draft transaction upon confirmation', async () => {
    const mockConfirm = { open: vi.fn().mockResolvedValue(true) };
    (component as any).confirmDialog = mockConfirm;
    await component.deleteDraftTransaction(sampleTransactions[0]);

    expect(mockPersonnelApi.deletePettyCashTransaction).toHaveBeenCalledWith(1);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('حذف شد'));
  });

  it('13. should request a charge through the workflow endpoint', () => {
    component.balanceSummary = sampleBalance;
    component.openChargeModal();

    expect(component.isChargeModalOpen).toBe(true);
    expect(component.chargeData.amount).toBe(50000000); // 100M ceiling - 50M current

    component.submitCharge();
    expect(mockPersonnelApi.requestPettyCashCharge).toHaveBeenCalledWith({
      amount: 50000000,
      title: 'درخواست شارژ تنخواه',
      description: ''
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('درخواست شارژ'));
    expect(component.isChargeModalOpen).toBe(false);
  });

  it('14. should show a connection-needed message when the charge request cannot reach the server', () => {
    mockPersonnelApi.requestPettyCashCharge.mockReturnValue(throwError(() => ({ status: 530 })));
    component.chargeData = { amount: 1000, title: '', description: '' };
    component.submitCharge();
    expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('اتصال'));
    expect(component.isSaving).toBe(false);
  });

  it('15. should build a statement from the selected open expenses only', () => {
    component.transactions = sampleTransactions;
    expect(component.openExpenses.map(t => t.id)).toEqual([1]);
    component.toggleLine(sampleTransactions[1]); // در صورت‌حساب است؛ انتخاب نمی‌شود
    expect(component.selectedLineIds.size).toBe(0);
    component.createStatement();
    expect(mockPersonnelApi.createPettyCashStatement).not.toHaveBeenCalled();

    component.toggleLine(sampleTransactions[0]);
    expect(component.selectedTotal).toBe(10000000);
    component.createStatement();
    expect(mockPersonnelApi.createPettyCashStatement).toHaveBeenCalledWith({ line_ids: [1], statement_date_shamsi: component.todayShamsi });
    expect(component.selectedLineIds.size).toBe(0);
  });

  it('16. should resend only a draft statement', () => {
    component.resendStatement({ ...sampleStatement, status: 'submitted' });
    expect(mockPersonnelApi.sendPettyCashStatement).not.toHaveBeenCalled();
    component.resendStatement({ ...sampleStatement, status: 'draft' });
    expect(mockPersonnelApi.sendPettyCashStatement).toHaveBeenCalledWith(7);
  });

  it('17. should open the charge and statement detail from deep-link query params', () => {
    mockRoute.queryParams = of({ statement: '7' });
    component.ngOnInit();
    expect(component.activeView).toBe('statements');
    expect(component.detailKind).toBe('petty_cash_statement');
    expect(component.detailId).toBe(7);
    expect(mockPersonnelApi.getPettyCashStatement).toHaveBeenCalledWith(7);
    expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalledWith({ statement_id: 7 });

    mockRoute.queryParams = of({ charge: '3' });
    component.ngOnInit();
    expect(component.activeView).toBe('charges');
    expect(component.detailKind).toBe('petty_cash_charge');
    expect(component.detailId).toBe(3);
  });

  it('18. should let a reviewer reject a line with a required reason but not on own statement', () => {
    mockAuth.userPermissions.mockReturnValue(['perm_invoice_review']);
    component.detailKind = 'petty_cash_statement';
    component.detailId = 7;
    component.detailStatement = { ...sampleStatement, custodian: 1 };
    expect(component.canRejectLines).toBe(false); // سند خود کاربر

    component.detailStatement = { ...sampleStatement, custodian: 99 };
    expect(component.canRejectLines).toBe(true);

    component.startRejectLine(sampleTransactions[0]);
    component.confirmRejectLine();
    expect(component.rejectReasonError).toContain('الزامی');
    expect(mockPersonnelApi.rejectPettyCashStatementLine).not.toHaveBeenCalled();

    component.rejectReason = 'مبلغ نادرست';
    component.confirmRejectLine();
    expect(mockPersonnelApi.rejectPettyCashStatementLine).toHaveBeenCalledWith(7, 1, 'مبلغ نادرست');
  });

  it('19. should let the treasurer pay with a tracking code, and require the code', () => {
    mockAuth.userPermissions.mockReturnValue(['perm_treasury_disburse_action']);
    component.detailKind = 'petty_cash_statement';
    component.detailId = 7;
    component.detailStatement = { ...sampleStatement, status: 'approved' };
    expect(component.canPayStatement).toBe(true);

    component.payDetail();
    expect(component.trackingError).toContain('الزامی');
    expect(mockPersonnelApi.payPettyCashStatement).not.toHaveBeenCalled();

    component.trackingCode = 'TRK-1';
    component.payDetail();
    // رسید پرداخت اجباری است: بی‌رسید فراخوانی نمی‌شود و خطای فارسی می‌آید
    expect(component.receiptError).toContain('رسید');
    expect(mockPersonnelApi.payPettyCashStatement).not.toHaveBeenCalled();

    const receipt1 = new File(['%PDF'], 'r1.pdf', { type: 'application/pdf' });
    component.onPayReceiptChange({ target: { files: [receipt1], value: 'r1.pdf' } } as unknown as Event);
    expect(component.payReceipt).toBe(receipt1);
    component.payDetail();
    expect(mockPersonnelApi.payPettyCashStatement).toHaveBeenCalledWith(7, 'TRK-1', receipt1);
    expect(component.payReceipt).toBeNull();

    component.detailKind = 'petty_cash_charge';
    component.detailId = 88;
    component.trackingCode = 'TRK-2';
    const receipt2 = new File(['%PDF'], 'r2.pdf', { type: 'application/pdf' });
    component.onPayReceiptChange({ target: { files: [receipt2], value: 'r2.pdf' } } as unknown as Event);
    component.payDetail();
    expect(mockPersonnelApi.payPettyCashCharge).toHaveBeenCalledWith(88, 'TRK-2', receipt2);

    // پسوند غیرمجاز پذیرفته نمی‌شود
    component.onPayReceiptChange({ target: { files: [new File(['x'], 'a.exe')], value: 'a.exe' } } as unknown as Event);
    expect(component.payReceipt).toBeNull();
    expect(component.receiptError).toContain('مجاز');
  });

  it('20. should show the ceiling editor only with the payment-authorize permission', () => {
    expect(component.canEditCeiling).toBe(false);
    mockAuth.userPermissions.mockReturnValue(['perm_manager_payment_authorize']);
    expect(component.canEditCeiling).toBe(true);
    component.account = { id: 1, custodian: 1, ceiling_amount: 100000000 };
    component.ceilingDraft = 90000000;
    component.saveCeiling();
    expect(mockPersonnelApi.updatePettyCashAccount).toHaveBeenCalledWith(1, { ceiling_amount: 90000000 });
  });

  it('21. should handle quick counterparty creation with auto-assignment', () => {
    component.isNewExpenseModalOpen = true;
    component.openQuickCounterpartyModal();
    expect(component.isQuickCounterpartyModalOpen).toBe(true);

    component.newCounterparty.name = 'تامین قطعات پایتخت';
    component.saveQuickCounterparty();

    expect(mockPersonnelApi.createCounterparty).toHaveBeenCalled();
    expect(component.newExpense.counterparty).toBe(202);
    expect(component.isQuickCounterpartyModalOpen).toBe(false);
  });

  it('22. should open and close attachment preview modal', () => {
    const tx = { ...sampleTransactions[0], attachment: 'http://example.com/receipt.jpg' };
    component.openAttachmentPreview(tx);
    expect(component.isAttachmentPreviewModalOpen).toBe(true);
    expect(component.previewAttachmentUrl).toBe('http://example.com/receipt.jpg');

    component.closeAttachmentPreview();
    expect(component.isAttachmentPreviewModalOpen).toBe(false);
    expect(component.previewAttachmentUrl).toBeNull();
  });

  it('23. should trigger excel export with optional section and status filter', () => {
    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
    component.statusFilter = 'approved';

    const createObjectURLSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURLSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});

    component.exportExcel();

    expect(mockPersonnelApi.exportPettyCashTransactionsExcel).toHaveBeenCalledWith({
      section_id: 10,
      status: 'approved'
    });
    expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('اکسل'));

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });
});
