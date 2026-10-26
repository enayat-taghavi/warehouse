// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeePettyCashHubComponent } from './employee-petty-cash';
import { of, Subject } from 'rxjs';
import {
  PettyCashTransaction,
  PettyCashBalanceSummary,
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
      status_display: 'پیش‌نویس کارمند'
    },
    {
      id: 2,
      section: 10,
      custodian: 1,
      custodian_name: 'کارمند نمونه',
      transaction_type: 'expense',
      amount: 20000000,
      transaction_date_shamsi: '1405/04/02',
      title: 'پذیرایی و آبدارخانه کارگاه',
      category: 'پذیرایی و آبدارخانه',
      status: 'pending_supervisor',
      status_display: 'در انتظار تایید سرپرست'
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
    }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getPettyCashBalance: vi.fn().mockReturnValue(of(sampleBalance)),
      getPettyCashTransactions: vi.fn().mockReturnValue(of(sampleTransactions)),
      getCounterparties: vi.fn().mockReturnValue(of(sampleCounterparties)),
      getExpenseHeads: vi.fn().mockReturnValue(of([{ id: 1, company: 1, parent: null, code: '10', title: 'عملیاتی', is_active: true }, { id: 11, company: 1, parent: 1, code: '1001', title: 'تعمیرات و نگهداری', is_active: true }])),
      createPettyCashTransaction: vi.fn().mockReturnValue(of({ ...sampleTransactions[0], id: 99 })),
      updatePettyCashTransaction: vi.fn().mockReturnValue(of({ ...sampleTransactions[0], status: 'pending_supervisor' })),
      deletePettyCashTransaction: vi.fn().mockReturnValue(of(undefined)),
      requestPettyCashReplenishment: vi.fn().mockReturnValue(of({ id: 88, amount: 20000000, transaction_type: 'allocation', status: 'draft' })),
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

  it('1. should initialize with shamsi date and load sections', () => {
    component.ngOnInit();
    expect(component.todayShamsi).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(component.mySections.length).toBe(2);
    expect(component.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getPettyCashBalance).toHaveBeenCalledWith(10);
    expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalledWith({ section_id: 10 });
  });

  it('2. should set balance summary and calculate utilization rate', () => {
    component.selectedSectionId = 10;
    component.loadBalanceSummary();
    expect(component.balanceSummary).toEqual(sampleBalance);
    expect(component.balanceSummary?.current_balance).toBe(50000000);
    expect(component.balanceSummary?.utilization_rate).toBe(30.0);
  });

  it('3. should enforce section isolation on transactions query (Guardian G1)', () => {
    component.selectedSectionId = 20;
    component.loadTransactions();
    expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalledWith({ section_id: 20 });
  });

  it('4. should filter transactions by text search across title, receipt, category, and counterparty', () => {
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

  it('5. should filter transactions by status tabs accurately', () => {
    component.transactions = sampleTransactions;

    component.setStatusFilter('draft');
    expect(component.filteredTransactions.length).toBe(1);
    expect(component.filteredTransactions[0].status).toBe('draft');

    component.setStatusFilter('pending_supervisor');
    expect(component.filteredTransactions.length).toBe(1);
    expect(component.filteredTransactions[0].status).toBe('pending_supervisor');

    component.setStatusFilter('allocation');
    expect(component.filteredTransactions.length).toBe(1);
    expect(component.filteredTransactions[0].transaction_type).toBe('allocation');

    component.setStatusFilter('all');
    expect(component.filteredTransactions.length).toBe(3);
  });

  it('6. should calculate status counters for all tabs', () => {
    component.transactions = sampleTransactions;
    const counters = component.statusCounters;
    expect(counters.all).toBe(3);
    expect(counters.draft).toBe(1);
    expect(counters.pending_supervisor).toBe(1);
    expect(counters.approved).toBe(1);
    expect(counters.allocation).toBe(1);
    expect(counters.rejected).toBe(0);
  });

  it('7. should enforce Draft status invariant on new expense voucher (Guardian G2)', () => {
    component.selectedSectionId = 10;
    component.openNewExpenseModal();
    expect(component.isNewExpenseModalOpen).toBe(true);
    expect(component.newExpense.status).toBe('draft');
    expect(component.newExpense.transaction_type).toBe('expense');
    expect(component.newExpense.section).toBe(10);
  });

  it('8. should validate required fields before saving expense', () => {
    component.selectedSectionId = 10;
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

  it('9. should save new expense with FormData when attachment is provided (Guardian G2)', () => {
    component.selectedSectionId = 10;
    component.newExpense = {
      title: 'خرید ابزار',
      transaction_date_shamsi: '1405/04/01',
      amount: 5000000,
      expense_head: 11,
      status: 'draft'
    };
    const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
    component.selectedExpenseAttachment = mockFile;

    component.saveExpense();

    expect(mockPersonnelApi.createPettyCashTransaction).toHaveBeenCalled();
    const payloadArg = mockPersonnelApi.createPettyCashTransaction.mock.calls[0][0];
    expect(payloadArg instanceof FormData).toBe(true);
    expect((payloadArg as FormData).get('expense_head')).toBe('11');
    expect((payloadArg as FormData).has('category')).toBe(false);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس'));
    expect(component.isNewExpenseModalOpen).toBe(false);
  });

  it('10. should send draft transaction to supervisor upon confirmation', async () => {
    const mockConfirm = { open: vi.fn().mockResolvedValue(true) };
    (component as any).confirmDialog = mockConfirm;
    const tx = sampleTransactions[0]; // draft
    await component.sendToSupervisor(tx);

    expect(mockPersonnelApi.updatePettyCashTransaction).toHaveBeenCalledWith(1, { status: 'pending_supervisor' });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('سرپرست'));
  });

  it('11. should block sending non-draft transaction to supervisor', () => {
    const tx = sampleTransactions[1]; // pending_supervisor
    component.sendToSupervisor(tx);

    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط اسناد در وضعیت پیش‌نویس'));
    expect(mockPersonnelApi.updatePettyCashTransaction).not.toHaveBeenCalled();
  });

  it('12. should delete draft transaction upon confirmation', async () => {
    const mockConfirm = { open: vi.fn().mockResolvedValue(true) };
    (component as any).confirmDialog = mockConfirm;
    const tx = sampleTransactions[0];
    await component.deleteDraftTransaction(tx);

    expect(mockPersonnelApi.deletePettyCashTransaction).toHaveBeenCalledWith(1);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('حذف شد'));
  });

  it('13. should handle replenishment request modal and submission', () => {
    component.selectedSectionId = 10;
    component.balanceSummary = sampleBalance;
    component.openReplenishModal();

    expect(component.isReplenishModalOpen).toBe(true);
    expect(component.replenishData.amount).toBe(50000000); // 100M ceiling - 50M current = 50M

    component.submitReplenishment();
    expect(mockPersonnelApi.requestPettyCashReplenishment).toHaveBeenCalledWith({
      section_id: 10,
      amount: 50000000,
      title: 'درخواست واریز و شارژ تنخواه گردان',
      description: '',
      receipt_number: ''
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('درخواست شارژ'));
    expect(component.isReplenishModalOpen).toBe(false);
  });

  it('14. should handle quick counterparty creation with auto-assignment', () => {
    component.isNewExpenseModalOpen = true;
    component.openQuickCounterpartyModal();
    expect(component.isQuickCounterpartyModalOpen).toBe(true);

    component.newCounterparty.name = 'تامین قطعات پایتخت';
    component.saveQuickCounterparty();

    expect(mockPersonnelApi.createCounterparty).toHaveBeenCalled();
    expect(component.newExpense.counterparty).toBe(202);
    expect(component.isQuickCounterpartyModalOpen).toBe(false);
  });

  it('15. should open and close attachment preview modal', () => {
    const tx = { ...sampleTransactions[0], attachment: 'http://example.com/receipt.jpg' };
    component.openAttachmentPreview(tx);
    expect(component.isAttachmentPreviewModalOpen).toBe(true);
    expect(component.previewAttachmentUrl).toBe('http://example.com/receipt.jpg');

    component.closeAttachmentPreview();
    expect(component.isAttachmentPreviewModalOpen).toBe(false);
    expect(component.previewAttachmentUrl).toBeNull();
  });

  it('16. should trigger excel export with section parameter', () => {
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
