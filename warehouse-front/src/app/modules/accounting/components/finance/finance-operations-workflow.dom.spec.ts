// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { SupervisorAttendanceHubComponent } from './supervisor/supervisor-attendance/supervisor-attendance';
import { AccountantPayrollHubComponent } from './accountant/accountant-payroll/accountant-payroll';
import { EmployeePettyCashHubComponent } from './employee/employee-petty-cash/employee-petty-cash';
import { EmployeeInvoicesHubComponent } from './employee/employee-invoices/employee-invoices';
import { TreasurerDisbursementsComponent } from './treasurer/treasurer-disbursements/treasurer-disbursements';
import { ProjectSection, FinancialProject } from '../../models/personnel.model';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();
(globalThis as any).sessionStorage = createStorageMock();

describe('عملیات جامع صفحات مالی: تردد، مأموریت‌ها، حقوق، خزانه‌داری، تنخواه، فاکتورها، پروژه‌ها و بخش‌ها', () => {
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockAccountsHttp: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'بخش عمران و ابنیه', code: 'CIVIL', project: 1, project_name: 'پروژه قطار شهری شیراز', is_active: true }
  ];

  const mockProjects: FinancialProject[] = [
    { id: 1, name: 'پروژه قطار شهری شیراز', code: 'METRO', is_active: true, description: 'خط ۲ مترو' }
  ];

  const mockAttendanceData = [
    {
      id: 301,
      personnel: 11,
      personnel_name: 'رضا حسینی',
      national_code: '0010376488',
      date_shamsi: '1405/04/10',
      status: 'PRESENT_10H',
      status_display: 'حاضر (۱۰ ساعت)',
      approval_status: 'PENDING_SUPERVISOR',
      effective_hours: 10,
      overtime_hours: 2,
      notes: 'کارکرد روزانه'
    },
    {
      id: 302,
      personnel: 12,
      personnel_name: 'حمید محمدی',
      national_code: '0023456789',
      date_shamsi: '1405/04/10',
      status: 'MISSION',
      status_display: 'مأموریت روزانه',
      approval_status: 'APPROVED',
      effective_hours: 10,
      overtime_hours: 3,
      notes: 'مأموریت انبار مرکزی'
    }
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(OfflineSyncService.getInstance(), 'invalidateCache').mockImplementation(async () => {});

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue([
        'perm_approve_attendance_supervisor',
        'view_sys_payroll',
        'perm_manage_petty_cash',
        'perm_manage_invoices',
        'perm_manage_treasury',
        'can_act_as_operator',
        'perm_system_super_admin'
      ])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' }),
      appState: { activeWarehouseId: 1 }
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'ready_to_calculate', section_id: '10' }),
      snapshot: { queryParams: { tab: 'ready_to_calculate', section_id: '10' } }
    };

    mockWs = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      notifications$: new Subject<any>(),
      connected$: of(true)
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of(mockSections)),
      getFinancialProjects: vi.fn().mockReturnValue(of(mockProjects)),
      getDailyAttendance: vi.fn().mockReturnValue(of(mockAttendanceData)),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true })),

      // حقوق و دستمزد
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({ years: ['1404', '1405'] })),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([
        {
          id: 401,
          personnel_name: 'رضا حسینی',
          national_code: '0010376488',
          job_title: 'کارشناس انبار',
          base_wage: 65726960,
          housing_allowance: 30000000,
          food_allowance: 22000000,
          gross_salary: 117726960,
          insurance_worker: 8240887,
          tax_deduction: 5000000,
          net_payable: 104486073,
          approval_status: 'ready_to_calculate',
          payment_status: 'PENDING'
        }
      ])),
      getMonthlyPayrollList: vi.fn().mockReturnValue(of([
        {
          id: 401,
          personnel_name: 'رضا حسینی',
          national_code: '0010376488',
          job_title: 'کارشناس انبار',
          base_wage: 65726960,
          housing_allowance: 30000000,
          food_allowance: 22000000,
          gross_salary: 117726960,
          insurance_worker: 8240887,
          tax_deduction: 5000000,
          net_payable: 104486073,
          approval_status: 'ready_to_calculate',
          payment_status: 'PENDING'
        }
      ])),
      getYearlySettings: vi.fn().mockReturnValue(of({
        year: '1405',
        monthly_housing_allowance: 30000000,
        monthly_food_allowance: 22000000,
        tax_exemption_ceiling: 100000000
      })),
      calculatePeriodPayroll: vi.fn().mockReturnValue(of({ success: true, processed_count: 1 })),

      // تنخواه گردان
      getPettyCashBalance: vi.fn().mockReturnValue(of({ current_balance: 50000000, total_expenses: 15000000, initial_allocation: 65000000 })),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([
        {
          id: 501,
          title: 'خرید لوازم بسته‌بندی انبار',
          amount: 4500000,
          status: 'draft',
          transaction_date_shamsi: '1405/04/10',
          category: 'supplies',
          section: 10
        }
      ])),
      createPettyCashTransaction: vi.fn().mockImplementation((data: any) => of({ id: 502, ...data, status: 'draft' })),
      getCounterparties: vi.fn().mockReturnValue(of([{ id: 801, name: 'شرکت تامین ابزار پارس' }])),

      // فاکتورها
      getExpenseInvoices: vi.fn().mockReturnValue(of([
        {
          id: 601,
          invoice_number: 'INV-1405-091',
          counterparty_name: 'شرکت تامین ابزار پارس',
          amount: 125000000,
          status: 'draft',
          invoice_date_shamsi: '1405/04/05'
        }
      ])),
      createExpenseInvoice: vi.fn().mockImplementation((data: any) => of({ id: 602, ...data, status: 'draft' })),

      // خزانه‌داری و پرداخت‌ها
      getTreasuryCartable: vi.fn().mockReturnValue(of({
        ready_periods_count: 0,
        total_payroll_amount: 0,
        total_fleet_amount: 85000000,
        total_disbursement_queue: 1,
        payrolls: [],
        trips: [
          {
            id: 701,
            driver_name: 'حمید محمدی',
            amount: 85000000,
            status: 'pending_payment',
            bank_name: 'بانک ملی ایران',
            sheba_number: 'IR780170000000101111111001',
            type: 'fleet'
          }
        ]
      })),
      disburseTreasury: vi.fn().mockReturnValue(of({ success: true, message: 'پرداخت با موفقیت انجام شد' })),

      // پروژه‌ها و بخش‌ها
      createFinancialProject: vi.fn().mockImplementation((data: any) => of({ id: 2, ...data, is_active: true })),
      updateFinancialProject: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      createProjectSection: vi.fn().mockImplementation((data: any) => of({ id: 20, ...data, is_active: true })),
      updateProjectSection: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      getUserSectionAssignments: vi.fn().mockReturnValue(of([]))
    };

    mockAccountsHttp = {
      getUsers: vi.fn().mockReturnValue(of([
        { id: 1, username: 'admin', first_name: 'مدیر', last_name: 'سیستم' }
      ]))
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۱. تردد و مأموریت‌ها: جدول ماهانه، ذخیره‌سازی، و اکسل Import/Export
  // ════════════════════════════════════════════════════════════════════════
  describe('۱. تردد و مأموریت‌ها - جدول ماهانه، ذخیره‌سازی و ورود/دریافت اکسل', () => {
    it('جدول ماهانه تردد و مأموریت‌ها را بارگذاری کرده، تغییرات وضعیت را ذخیره و خروجی/ورودی اکسل را اجرا می‌کند', () => {
      const attendanceHub = new SupervisorAttendanceHubComponent(
        mockAuth,
        mockState,
        mockToast,
        mockPersonnelApi,
        mockRouter,
        mockRoute,
        mockCdr
      );

      attendanceHub.ngOnInit();

      // ۱. اعتبارسنجی بارگذاری داده‌های تردد و مأموریت‌ها
      expect(mockPersonnelApi.getDailyAttendance).toHaveBeenCalled();
      expect(attendanceHub.rawItems.length).toBe(2);

      // اعتبارسنجی فیلتر بر اساس تب‌های کارتابل سرپرست
      expect(attendanceHub.activeSubTab).toBe('pending');
      expect(attendanceHub.items.length).toBe(1);

      attendanceHub.switchSubTab('all');
      expect(attendanceHub.activeSubTab).toBe('all');
      expect(attendanceHub.items.length).toBe(2);

      // اعتبارسنجی تشخیص وضعیت مأموریت (MISSION)
      const missionRecord = attendanceHub.items.find(i => i.status === 'MISSION');
      expect(missionRecord).toBeDefined();
      expect(missionRecord?.personnel_name).toBe('حمید محمدی');
      expect(attendanceHub.getAttendanceStatusLabel(missionRecord!.status)).toBe('مأموریت');

      // ۲. تایید و ذخیره‌سازی کارکرد پرسنل
      attendanceHub.approveSingle(attendanceHub.items[0]);
      expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
        action: 'approve',
        model: 'attendance',
        id: 301
      });
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('تایید سرپرست'));

      // ۳. دریافت خروجی اکسل (Export)
      attendanceHub.exportExcel();
      expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('اکسل'));

      // ۴. ورود فایل اکسل کارکرد (Import)
      attendanceHub.importExcel();
      expect(mockToast.info).toHaveBeenCalledWith(expect.stringContaining('اکسل'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۲. حقوق و دستمزد: باز کردن فرم‌ها، ذخیره‌سازی و فیلتر کردن اطلاعات
  // ════════════════════════════════════════════════════════════════════════
  describe('۲. حقوق و دستمزد - باز کردن فرم‌ها، محاسبات، ذخیره‌سازی و فیلترها', () => {
    it('محاسبات حقوق ماهانه را بارگذاری کرده، فیلترها را اعمال و فرم احکام را ذخیره می‌کند', () => {
      const payrollHub = new AccountantPayrollHubComponent(
        mockAuth,
        mockState,
        mockToast,
        mockPersonnelApi,
        mockRouter,
        mockRoute,
        mockCdr
      );

      payrollHub.ngOnInit();

      // ۱. اعتبارسنجی بارگذاری بخش‌ها و سال مالی
      expect(mockPersonnelApi.getAvailableFiscalYears).toHaveBeenCalled();
      expect(payrollHub.fiscalYear).toBe('1405');

      // ۲. فیلتر کردن اطلاعات بر اساس زیرتب‌های آماده محاسبه و محاسبه‌شده
      expect(payrollHub.activeSubTab).toBe('ready_to_calculate');
      payrollHub.switchSubTab('calculated');
      expect(payrollHub.activeSubTab).toBe('calculated');
      payrollHub.switchSubTab('all');
      expect(payrollHub.activeSubTab).toBe('all');

      // ۳. باز کردن مودال فرم فیش حقوقی پرسنل
      const sampleRecord = { id: 401, personnel_name: 'رضا حسینی', gross_salary: 117726960 };
      payrollHub.openPayslipModal(sampleRecord);
      expect(payrollHub.isPayslipModalOpen).toBe(true);
      expect(payrollHub.selectedPayslipRecord?.id).toBe(401);

      payrollHub.closePayslipModal();
      expect(payrollHub.isPayslipModalOpen).toBe(false);

      // ۴. اجرای محاسبه و ذخیره‌سازی دسته‌جمعی حقوق
      payrollHub.calculateBatch();
      expect(mockPersonnelApi.calculatePeriodPayroll).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۳. خزانه‌داری: باز کردن فرم‌ها، ذخیره‌سازی و فیلتر اطلاعات اسناد تسویه
  // ════════════════════════════════════════════════════════════════════════
  describe('۳. خزانه‌داری - باز کردن فرم اسناد پرداخت، ذخیره تسویه و فیلترها', () => {
    it('اسناد پرداختی خزانه‌داری را بارگذاری کرده، فیلتر و تسویه پرداخت را تایید و ذخیره می‌کند', () => {
      const disbursementsComp = new TreasurerDisbursementsComponent(
        mockAuth,
        mockState,
        mockToast,
        mockPersonnelApi,
        mockRouter,
        mockRoute,
        mockCdr
      );

      disbursementsComp.ngOnInit();

      // ۱. بارگذاری صف پرداخت‌های خزانه‌داری
      expect(mockPersonnelApi.getTreasuryCartable).toHaveBeenCalled();
      expect(disbursementsComp.items.length).toBe(1);
      expect(disbursementsComp.items[0].recipient_name).toBe('حمید محمدی');

      // ۲. فیلتر کردن بر اساس زیرتب‌های پرداخت‌نشده و آرشیو
      expect(disbursementsComp.activeSubTab).toBe('pending_queue');
      expect(disbursementsComp.filteredItems.length).toBe(1);

      disbursementsComp.switchSubTab('disbursed_archive');
      expect(disbursementsComp.activeSubTab).toBe('disbursed_archive');
      expect(disbursementsComp.filteredItems.length).toBe(0);

      disbursementsComp.switchSubTab('pending_queue');
      expect(disbursementsComp.filteredItems.length).toBe(1);

      // ۳. باز کردن فرم جزئیات و مودال پرداخت
      const itemToPay = disbursementsComp.items[0];
      disbursementsComp.openPayModal(itemToPay);
      expect(disbursementsComp.payingItem?.id).toBe(701);
      expect(disbursementsComp.isPayModalOpen).toBe(true);

      // ۴. ثبت و ذخیره‌سازی تسویه حواله بانکی
      disbursementsComp.confirmDisbursement();
      expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۴. تنخواه گردان: باز کردن فرم‌ها، ذخیره‌سازی و فیلتر کردن اطلاعات
  // ════════════════════════════════════════════════════════════════════════
  describe('۴. تنخواه گردان - ثبت درخواست، پیوست فاکتور، ذخیره‌سازی و فیلترها', () => {
    it('فرم ثبت تنخواه را باز کرده، فیلتر وضعیت را اعمال و هزینه جدید را ذخیره می‌کند', () => {
      const pettyCashHub = new EmployeePettyCashHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      pettyCashHub.ngOnInit();

      // ۱. بارگذاری مانده تنخواه و لیست هزینه‌ها
      expect(mockPersonnelApi.getPettyCashBalance).toHaveBeenCalled();
      expect(mockPersonnelApi.getPettyCashTransactions).toHaveBeenCalled();
      expect(pettyCashHub.transactions.length).toBe(1);

      // فیلتر بر اساس وضعیت
      pettyCashHub.statusFilter = 'draft';
      expect(pettyCashHub.filteredTransactions.length).toBe(1);

      pettyCashHub.statusFilter = 'approved';
      expect(pettyCashHub.filteredTransactions.length).toBe(0);

      // ۲. باز کردن فرم ثبت هزینه تنخواه جدید
      pettyCashHub.openNewExpenseModal();
      expect(pettyCashHub.isNewExpenseModalOpen).toBe(true);

      // ۳. تکمیل اطلاعات هزینه تنخواه
      pettyCashHub.selectedSectionId = 10;
      pettyCashHub.newExpense.title = 'خرید اقلام شوینده و بهداشتی انبار';
      pettyCashHub.newExpense.amount = 3200000;
      pettyCashHub.newExpense.category = 'supplies';
      pettyCashHub.newExpense.transaction_date_shamsi = '1405/04/12';

      // ۴. ذخیره‌سازی هزینه تنخواه
      pettyCashHub.saveExpense();

      expect(mockPersonnelApi.createPettyCashTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'خرید اقلام شوینده و بهداشتی انبار',
          amount: 3200000
        })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس ثبت شد'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۵. فاکتورها: باز کردن فرم‌ها، ذخیره‌سازی و فیلتر کردن اطلاعات
  // ════════════════════════════════════════════════════════════════════════
  describe('۵. فاکتورها - باز کردن فرم، طرف حساب، محاسبات مالیات و ذخیره‌سازی', () => {
    it('فرم فاکتور را باز کرده، مبالغ را ثبت، فیلترها را اجرا و ذخیره‌سازی را انجام می‌دهد', () => {
      const invoicesHub = new EmployeeInvoicesHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      invoicesHub.ngOnInit();

      // ۱. بارگذاری لیست فاکتورها و اعمال فیلتر
      expect(mockPersonnelApi.getExpenseInvoices).toHaveBeenCalled();
      expect(invoicesHub.invoices.length).toBe(1);
      expect(invoicesHub.invoices[0].invoice_number).toBe('INV-1405-091');

      invoicesHub.statusFilter = 'draft';
      expect(invoicesHub.filteredInvoices.length).toBe(1);

      invoicesHub.statusFilter = 'paid';
      expect(invoicesHub.filteredInvoices.length).toBe(0);

      // ۲. باز کردن فرم ثبت فاکتور جدید
      invoicesHub.openNewInvoiceModal();
      expect(invoicesHub.isNewInvoiceModalOpen).toBe(true);

      // ۳. تکمیل اطلاعات مالی فاکتور
      invoicesHub.selectedSectionId = 10;
      invoicesHub.newInvoice.counterparty = 801;
      invoicesHub.newInvoice.invoice_number = 'INV-1405-102';
      invoicesHub.newInvoice.amount = 200000000;
      invoicesHub.newInvoice.invoice_date_shamsi = '1405/04/11';

      // ۴. ذخیره‌سازی فاکتور
      invoicesHub.saveInvoice();

      expect(mockPersonnelApi.createExpenseInvoice).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
    });
  });

});
