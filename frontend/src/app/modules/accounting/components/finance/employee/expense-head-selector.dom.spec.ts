// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { buildExpenseHeadOptions } from '../expense-head-options';
import { EmployeeInvoicesHubComponent } from './employee-invoices/employee-invoices';
import { EmployeePettyCashHubComponent } from './employee-petty-cash/employee-petty-cash';
import { ExpenseHead, ProjectSection } from '../../../models/personnel.model';

describe('Expense Head Selector & Form Integration Specs (Release v1 step 3.4-c)', () => {
  describe('buildExpenseHeadOptions', () => {
    it('e) groups heads under their group, labels "10 — گروه عملیاتی", and drops inactive heads and empty groups', () => {
      const rows: ExpenseHead[] = [
        { id: 1, company: 7, parent: null, code: '10', title: 'گروه عملیاتی', is_active: true },
        { id: 2, company: 7, parent: null, code: '20', title: 'گروه اداری (خالی)', is_active: true },
        { id: 3, company: 7, parent: null, code: '30', title: 'گروه غیرفعال', is_active: false },
        { id: 11, company: 7, parent: 1, code: '1001', title: 'تعمیرات', is_active: true },
        { id: 12, company: 7, parent: 1, code: '1002', title: 'سوخت غیرفعال', is_active: false },
        { id: 31, company: 7, parent: 3, code: '3001', title: 'ملزومات گروه غیرفعال', is_active: true }
      ];

      const options = buildExpenseHeadOptions(rows);

      expect(options.length).toBe(1);
      expect(options[0].id).toBe(1);
      expect(options[0].label).toBe('10 — گروه عملیاتی');
      expect(options[0].heads.length).toBe(1);
      expect(options[0].heads[0].id).toBe(11);
      expect(options[0].heads[0].title).toBe('تعمیرات');
    });
  });

  describe('EmployeeInvoicesHubComponent - expense_head validation & payload', () => {
    let component: EmployeeInvoicesHubComponent;
    let mockAuth: any;
    let mockPersonnelApi: any;
    let mockToast: any;
    let mockCdr: any;
    let mockRoute: any;
    let mockRouter: any;
    let mockConfirm: any;

    const sampleSections: ProjectSection[] = [
      { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true }
    ];

    beforeEach(() => {
      mockAuth = {
        user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
        userPermissions: vi.fn().mockReturnValue([])
      };

      mockPersonnelApi = {
        getMySections: vi.fn().mockReturnValue(of(sampleSections)),
        getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
        getExpenseInvoices: vi.fn().mockReturnValue(of([])),
        getExpenseHeads: vi.fn().mockReturnValue(of([
          { id: 1, company: 1, parent: null, code: '10', title: 'G', is_active: true },
          { id: 11, company: 1, parent: 1, code: '1001', title: 'H', is_active: true }
        ])),
        getCounterparties: vi.fn().mockReturnValue(of([])),
        createExpenseInvoice: vi.fn().mockImplementation((data: any) => of({ id: 1, ...data })),
        updateExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
        deleteExpenseInvoice: vi.fn().mockReturnValue(of({ success: true })),
        createCounterparty: vi.fn().mockImplementation((data: any) => of({ id: 103, ...data })),
        exportExpenseInvoicesExcel: vi.fn().mockReturnValue(of(new Blob(['fake-excel-data'])))
      };

      mockToast = { show: vi.fn() };
      mockCdr = { detectChanges: vi.fn() };
      mockRoute = { queryParams: of({ section_id: '10' }) };
      mockRouter = { navigate: vi.fn() };
      mockConfirm = { open: vi.fn().mockResolvedValue(true) };

      component = new EmployeeInvoicesHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter,
        undefined,
        undefined,
        mockConfirm
      );

      component.ngOnInit();
      component.selectedSectionId = 10;
      component.selectedSection = sampleSections[0];
      component.openNewInvoiceModal();
    });

    it('f) invoice: missing head blocks the call and sets expenseHeadError; with a head the payload has expense_head and no category', () => {
      // ۱. بدون سرفصل: ارسال انجام نمی‌شود و پیام خطا ثبت می‌شود
      component.newInvoice = {
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-101',
        invoice_date_shamsi: '1403/08/15',
        amount: 5000000,
        expense_head: null,
        description: 'تست بدون سرفصل',
        status: 'draft'
      };

      component.saveInvoice();

      expect(mockPersonnelApi.createExpenseInvoice).not.toHaveBeenCalled();
      expect(component.expenseHeadError).toBe('سرفصل هزینه الزامی است.');
      expect(mockToast.show).toHaveBeenCalledWith('warning', 'لطفاً سرفصل هزینه را انتخاب کنید.');

      // ۲. با سرفصل ۱۱: فراخوانی با payload شامل expense_head و بدون فیلد category انجام می‌شود
      component.newInvoice.expense_head = 11;
      component.saveInvoice();

      expect(mockPersonnelApi.createExpenseInvoice).toHaveBeenCalledTimes(1);
      const payload = mockPersonnelApi.createExpenseInvoice.mock.calls[0][0];
      expect(payload.expense_head).toBe(11);
      expect('category' in payload).toBe(false);
    });

    it('invoice: a rejected create with 400 expense_head error sets component.expenseHeadError', () => {
      component.newInvoice = {
        section: 10,
        counterparty: 101,
        invoice_number: 'INV-102',
        invoice_date_shamsi: '1403/08/15',
        amount: 5000000,
        expense_head: 11,
        description: 'تست رد سرفصل',
        status: 'draft'
      };

      const err400 = {
        status: 400,
        error: { expense_head: ['سرفصل انتخابشده فعال نیست.'] }
      };
      mockPersonnelApi.createExpenseInvoice.mockReturnValueOnce(throwError(() => err400));

      component.saveInvoice();

      expect(component.expenseHeadError).toBe('سرفصل انتخابشده فعال نیست.');
      expect(mockToast.show).toHaveBeenCalledWith('error', 'سرفصل انتخابشده فعال نیست.');
    });
  });

  describe('EmployeePettyCashHubComponent - expense_head validation & payload', () => {
    let component: EmployeePettyCashHubComponent;
    let mockAuth: any;
    let mockPersonnelApi: any;
    let mockToast: any;
    let mockCdr: any;
    let mockRoute: any;
    let mockRouter: any;

    const sampleSections: ProjectSection[] = [
      { id: 10, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه پردیس', is_active: true }
    ];

    beforeEach(() => {
      mockAuth = {
        user: vi.fn().mockReturnValue({ id: 1, username: 'employee_test', is_superuser: false }),
        userPermissions: vi.fn().mockReturnValue([])
      };

      mockPersonnelApi = {
        getMySections: vi.fn().mockReturnValue(of(sampleSections)),
        getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
        getPettyCashBalance: vi.fn().mockReturnValue(of({ balance: 10000000, total_spent: 0, pending_expenses: 0 })),
        getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
        getCounterparties: vi.fn().mockReturnValue(of([])),
        getExpenseHeads: vi.fn().mockReturnValue(of([
          { id: 1, company: 1, parent: null, code: '10', title: 'عملیاتی', is_active: true },
          { id: 11, company: 1, parent: 1, code: '1001', title: 'تعمیرات', is_active: true }
        ])),
        createPettyCashTransaction: vi.fn().mockImplementation((data: any) => of({ id: 99, ...data })),
        updatePettyCashTransaction: vi.fn().mockReturnValue(of({ success: true })),
        deletePettyCashTransaction: vi.fn().mockReturnValue(of(undefined))
      };

      mockToast = { show: vi.fn() };
      mockCdr = { detectChanges: vi.fn() };
      mockRoute = { queryParams: of({}) };
      mockRouter = { navigate: vi.fn() };

      component = new EmployeePettyCashHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      component.ngOnInit();
      component.selectedSectionId = 10;
      component.selectedSection = sampleSections[0];
      component.openNewExpenseModal();
    });

    it('petty cash: missing head blocks call and sets expenseHeadError; with head payload has expense_head and no category', () => {
      // ۱. بدون سرفصل: ارسال انجام نمی‌شود و خطا ثبت می‌شود
      component.newExpense = {
        title: 'هزینه تعمیر',
        transaction_date_shamsi: '1403/08/15',
        amount: 2000000,
        expense_head: null,
        counterparty: 101,
        description: 'بدون سرفصل'
      };

      component.saveExpense();

      expect(mockPersonnelApi.createPettyCashTransaction).not.toHaveBeenCalled();
      expect(component.expenseHeadError).toBe('سرفصل هزینه الزامی است.');
      expect(mockToast.show).toHaveBeenCalledWith('warning', 'لطفاً سرفصل هزینه را انتخاب کنید.');

      // ۲. با سرفصل: ارسال با expense_head و بدون فیلد category
      component.newExpense.expense_head = 11;
      component.saveExpense();

      expect(mockPersonnelApi.createPettyCashTransaction).toHaveBeenCalledTimes(1);
      const payload = mockPersonnelApi.createPettyCashTransaction.mock.calls[0][0];
      expect(payload.expense_head).toBe(11);
      expect('category' in payload).toBe(false);
    });

    it('g) petty cash: a 400 expense_head error sets expenseHeadError', () => {
      component.newExpense = {
        title: 'خرید ابزار',
        transaction_date_shamsi: '1403/08/15',
        amount: 1500000,
        expense_head: 11,
        counterparty: 101,
        description: 'رد خطا'
      };

      const err400 = {
        status: 400,
        error: { expense_head: ['سرفصل انتخابشده فعال نیست.'] }
      };
      mockPersonnelApi.createPettyCashTransaction.mockReturnValueOnce(throwError(() => err400));

      component.saveExpense();

      expect(component.expenseHeadError).toBe('سرفصل انتخابشده فعال نیست.');
      expect(mockToast.show).toHaveBeenCalledWith('error', 'سرفصل انتخابشده فعال نیست.');
    });
  });
});
