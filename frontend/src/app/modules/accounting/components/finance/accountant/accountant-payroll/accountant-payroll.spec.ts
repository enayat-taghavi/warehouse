// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AccountantPayrollHubComponent } from './accountant-payroll';
import { defaultPayrollPeriod, mergeFiscalYears, payrollMonthCode } from '../payroll-period';

describe('AccountantPayrollHubComponent — قابلیت‌های منتقل‌شده از کارتابل مالی قدیمی', () => {
  let component: AccountantPayrollHubComponent;
  let mockAuth: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let mockWh: any;
  let mockRegistry: any;

  const records = [
    { id: 1, period: 90, full_name: 'علی رضایی', national_code: '0012345678', status_category: 'نفرات شرکتی', job_grade: '5', gross_salary: 100, payable_amount: 80, worker_insurance: 7, employer_insurance: 23, income_tax: 5, payment_status: 'PENDING' },
    { id: 2, period: 90, full_name: 'سارا احمدی', national_code: '0098765432', status_category: 'سرپرستی', job_grade: '9', gross_salary: 200, payable_amount: 170, total_insurance: 60, income_tax: 10, payment_status: 'READY_TO_PAY' },
    { id: 3, period: 90, full_name: 'رضا کریمی', national_code: '1111111111', status_category: 'نفرات شرکتی', gross_salary: 0, payable_amount: 0, payment_status: 'PENDING' }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 2, username: 'acc', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue(['view_sys_payroll', 'can_act_as_accountant'])
    };
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 3, name: 'دالان کارگاه' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({ years: ['1404', '1405'] })),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of(records)),
      calculatePeriodPayroll: vi.fn().mockReturnValue(of({ message: 'ok', period_id: 91, period_status: 'OPEN' })),
      lockPeriod: vi.fn().mockReturnValue(of({ message: 'قفل شد' })),
      unlockPeriod: vi.fn().mockReturnValue(of({ message: 'باز شد' })),
      importTaxExcel: vi.fn().mockReturnValue(of({ message: 'اعمال شد', matched_count: 1, unmatched_count: 0, unmatched_rows: [], total_imported_tax: 4500000, period_year_month: '1405/06' })),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({ summary: [{ personnel_id: 1, full_name: 'علی رضایی', present_days: 20 }] })),
      postCartableAction: vi.fn().mockReturnValue(of({})),
      exportMonthlyPayrollExcel: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { queryParams: of({ year: '1405', month: 'شهریور', wh: '19' }) };
    mockCdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
    mockWh = { getAll: vi.fn().mockReturnValue(of([{ id: 19, name: 'انبار ۱۹' }, { id: 26, name: 'انبار ۲۶' }])) };
    mockRegistry = {
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getExtensions: vi.fn().mockImplementation((point: string) => {
        if (point === 'scopeDirectory') {
          return [{ moduleCode: 'warehouse', extension: { endpoint: '/warehouses/', offersScopeFilter: true } }];
        }
        return [];
      })
    };

    component = new AccountantPayrollHubComponent(
      mockAuth, {} as any, mockToast, mockPersonnelApi, mockRouter, mockRoute, mockCdr, mockWh, mockRegistry
    );
  });

  it('1. period and scope come from the URL and drive the payroll query', () => {
    component.ngOnInit();
    expect(component.fiscalYear).toBe('1405');
    expect(component.selectedMonth).toBe('شهریور');
    expect(component.selectedWarehouseId).toBe(19);
    expect(component.availableYears).toEqual(['1405', '1404']);
    expect(component.warehouses.length).toBe(2);
    expect(component.showWarehouseScope).toBe(true);
    expect(mockPersonnelApi.getMonthlyPayrollRecords).toHaveBeenCalledWith({ year_month: '1405/06', warehouse_id: 19 });
    expect(component.currentPeriodId).toBe(90);
  });

  it('2. company-wide scope omits warehouse_id', () => {
    component.fiscalYear = '1405';
    component.selectedMonth = 'تیر';
    component.selectedWarehouseId = null;
    component.fetchPayrollData();
    expect(mockPersonnelApi.getMonthlyPayrollRecords).toHaveBeenCalledWith({ year_month: '1405/04' });
  });

  it('3. KPI summary, counters and category/search filters', () => {
    component.activeSubTab = 'all';
    component.fetchPayrollData();
    expect(component.payrollSummary.totalPersonnel).toBe(3);
    expect(component.payrollSummary.totalGross).toBe(300);
    expect(component.payrollSummary.totalPayable).toBe(250);
    expect(component.payrollSummary.totalInsurance).toBe(90);
    expect(component.payrollSummary.totalTax).toBe(15);
    expect(component.statusCounters.approved).toBe(1);

    component.statusCategoryFilter = 'سرپرستی';
    component.applyFilters();
    expect(component.items.map(i => i.id)).toEqual([2]);

    component.statusCategoryFilter = 'ALL';
    component.searchQuery = '1111';
    component.applyFilters();
    expect(component.items.map(i => i.id)).toEqual([3]);
  });

  it('4. calculation sends period and scope, then records the period status', () => {
    component.fiscalYear = '1405';
    component.selectedMonth = 'مهر';
    component.selectedWarehouseId = 26;
    component.calculateBatch();
    expect(mockPersonnelApi.calculatePeriodPayroll).toHaveBeenCalledWith({ warehouse_id: 26, year_month: '1405/07' });
    expect(component.periodStatus).toBe('OPEN');
  });

  it('5. calculation is blocked on a locked period', () => {
    component.periodStatus = 'LOCKED';
    component.calculateBatch();
    expect(mockPersonnelApi.calculatePeriodPayroll).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('6. lock needs perm_lock_work_period; unlock only for superuser (same as backend)', () => {
    component.currentPeriodId = 90;
    expect(component.canLockPeriod).toBe(false);
    component.toggleLockPeriod();
    expect(mockPersonnelApi.lockPeriod).not.toHaveBeenCalled();

    mockAuth.userPermissions.mockReturnValue(['view_sys_payroll', 'perm_lock_work_period']);
    expect(component.canLockPeriod).toBe(true);
    component.toggleLockPeriod();
    expect(mockPersonnelApi.lockPeriod).toHaveBeenCalledWith(90);
    expect(component.isPeriodLocked).toBe(true);

    expect(component.canUnlockPeriod).toBe(false);
    component.toggleLockPeriod();
    expect(mockPersonnelApi.unlockPeriod).not.toHaveBeenCalled();

    mockAuth.user.mockReturnValue({ id: 1, is_superuser: true });
    component.toggleLockPeriod();
    expect(mockPersonnelApi.unlockPeriod).toHaveBeenCalledWith(90);
    expect(component.isPeriodLocked).toBe(false);
  });

  it('7. smart paste parses Persian digits, skips the header and matches national codes', () => {
    component.fetchPayrollData();
    component.taxExcelText = 'کد ملی\tمالیات\n۰۰۱۲۳۴۵۶۷۸\t۴۵۰۰۰۰۰\n2222222222\t100';
    component.onTaxTextChange();
    expect(component.taxParsedRows.length).toBe(2);
    expect(component.taxParsedRows[0]).toEqual(expect.objectContaining({ national_code: '0012345678', tax_amount: 4500000, matched: true }));
    expect(component.taxParsedRows[1].matched).toBe(false);

    component.fiscalYear = '1405';
    component.selectedMonth = 'شهریور';
    component.taxModalMode = 'paste';
    component.submitTaxImport();
    expect(mockPersonnelApi.importTaxExcel).toHaveBeenCalledWith({
      year_month: '1405/06',
      period_id: 90,
      items: [
        { national_code: '0012345678', tax_amount: 4500000 },
        { national_code: '2222222222', tax_amount: 100 }
      ]
    });
    expect(component.taxImportResult?.matched_count).toBe(1);
  });

  it('8. file mode requires a selected file', () => {
    component.openTaxModal();
    component.submitTaxImport();
    expect(mockPersonnelApi.importTaxExcel).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('9. payslip modal opens and closes with the selected record', () => {
    component.openPayslipModal(records[1]);
    expect(component.isPayslipModalOpen).toBe(true);
    expect(component.selectedPayslipRecord.id).toBe(2);
    component.onEscapeKey();
    expect(component.isPayslipModalOpen).toBe(false);
    expect(component.selectedPayslipRecord).toBeNull();
  });

  it('10. monthly work summary uses the same period and scope; errors are surfaced', () => {
    component.fiscalYear = '1405';
    component.selectedMonth = 'شهریور';
    component.selectedWarehouseId = 19;
    component.loadWorkSummary();
    expect(mockPersonnelApi.getAttendanceMonthlySummary).toHaveBeenCalledWith(19, '1405/06');
    expect(component.workSummaryRows.length).toBe(1);

    mockPersonnelApi.getAttendanceMonthlySummary.mockReturnValue(throwError(() => new Error('x')));
    component.loadWorkSummary();
    expect(component.workSummaryError).toBe(true);
    expect(component.workSummaryRows.length).toBe(0);
  });

  it('11. period helpers: previous Shamsi month, month codes and merged years', () => {
    expect(defaultPayrollPeriod(new Date(2026, 9, 1))).toEqual({ year: '1405', month: 'شهریور' });
    expect(defaultPayrollPeriod(new Date(2026, 2, 25))).toEqual({ year: '1404', month: 'اسفند' });
    expect(payrollMonthCode('مهر')).toBe('07');
    expect(mergeFiscalYears(['1404', 'bad'], '1405', '1404')).toEqual(['1405', '1404']);
  });

  it('12. the lock state is known on load from the records (no stale "lock" button on a locked period)', () => {
    mockPersonnelApi.getMonthlyPayrollRecords.mockReturnValue(of(records.map(r => ({ ...r, period_status: 'LOCKED' }))));
    component.fetchPayrollData();
    expect(component.currentPeriodId).toBe(90);
    expect(component.isPeriodLocked).toBe(true);
    component.calculateBatch();
    expect(mockPersonnelApi.calculatePeriodPayroll).not.toHaveBeenCalled();
  });

  it('13. a load error is flagged instead of looking like an empty period', () => {
    mockPersonnelApi.getMonthlyPayrollRecords.mockReturnValue(throwError(() => new Error('down')));
    component.fetchPayrollData();
    expect(component.loadError).toBe(true);
    expect(component.items.length).toBe(0);
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('14. locking asks for confirmation first (unlocking is superuser-only)', async () => {
    const confirmDialog = { open: vi.fn().mockResolvedValue(false) };
    const withDialog = new AccountantPayrollHubComponent(
      mockAuth, {} as any, mockToast, mockPersonnelApi, mockRouter, mockRoute, mockCdr, mockWh, mockRegistry, confirmDialog as any
    );
    mockAuth.userPermissions.mockReturnValue(['view_sys_payroll', 'perm_lock_work_period']);
    withDialog.currentPeriodId = 90;
    withDialog.periodStatus = 'OPEN';

    await withDialog.toggleLockPeriod();
    expect(confirmDialog.open).toHaveBeenCalled();
    expect(mockPersonnelApi.lockPeriod).not.toHaveBeenCalled();

    confirmDialog.open.mockResolvedValue(true);
    await withDialog.toggleLockPeriod();
    expect(mockPersonnelApi.lockPeriod).toHaveBeenCalledWith(90);
  });
});
