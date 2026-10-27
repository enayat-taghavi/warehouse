// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SupervisorNewProfilesHubComponent } from './supervisor/supervisor-new-profiles/supervisor-new-profiles';
import { AccountantPersonnelHubComponent } from './accountant/accountant-personnel/accountant-personnel';
import { ManagerApprovals } from '../personnel/manager-approvals/manager-approvals';
import { PersonnelChangeRequest } from '../../models/personnel.model';

describe('Complete Personnel 3-Tier Lifecycle DOM & State Integration (Employee -> Supervisor -> Finance -> Manager)', () => {
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  // Active change request in system
  let activeCR: PersonnelChangeRequest;

  beforeEach(() => {
    activeCR = {
      id: 111,
      personnel: 5,
      personnel_name: 'احمد حسینی',
      personnel_national_code: '0012345678',
      status: 'pending_supervisor',
      status_display: 'در انتظار تایید سرپرست',
      proposed_changes: { daily_base_wage: 4500000 },
      previous_values: { daily_base_wage: 3500000 },
      requested_by_name: 'کارمند انبار',
      created_at: '2026-09-21T10:00:00Z',
      updated_at: '2026-09-21T10:00:00Z'
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 10, username: 'test_user' }),
      userPermissions: vi.fn().mockReturnValue([
        'perm_approve_personnel_supervisor',
        'perm_approve_personnel_supervisor',
        'perm_approve_personnel_finance',
        'perm_approve_personnel_manager',
        'admin_all'
      ]),
      userRoleTitles: vi.fn().mockReturnValue(['مدیر', 'سرپرست', 'حسابدار'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' }),
      hasRole: vi.fn().mockReturnValue(true)
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      show: vi.fn(),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش دریافت', project: 1 }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequests: vi.fn().mockImplementation((params) => {
        if (params?.status === 'pending_supervisor') {
          return of(activeCR.status === 'pending_supervisor' ? [activeCR] : []);
        }
        return of([activeCR]);
      }),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([])),
      approvePersonnelChangeRequestSupervisor: vi.fn().mockImplementation((id: number) => {
        activeCR.status = 'pending_accountant';
        activeCR.status_display = 'در انتظار تایید حسابدار';
        return of({ message: 'درخواست تغییرات به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.' });
      }),
      approvePersonnelChangeRequestFinance: vi.fn().mockImplementation((id: number) => {
        activeCR.status = 'pending_manager';
        activeCR.status_display = 'در انتظار تصویب نهایی مدیر';
        return of({ message: 'تایید مالی با موفقیت صادر و پرونده جهت تصویب نهایی به کارتابل مدیر ارسال گردید.' });
      }),
      approvePersonnelChangeRequestManager: vi.fn().mockImplementation((id: number) => {
        activeCR.status = 'approved';
        activeCR.status_display = 'تصویب شده';
        return of({ message: 'تصویب نهایی تغییرات با موفقیت انجام و روی پرونده اعمال گردید.' });
      }),
      rejectPersonnelChangeRequest: vi.fn().mockImplementation((id: number, reason: string) => {
        activeCR.status = 'rejected';
        activeCR.status_display = 'رد شده';
        return of({ message: 'درخواست تغییرات رد شد.' });
      }),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({ year_month: '1405/04', period_status: 'OPEN' })),
      getYearlySettings: vi.fn().mockReturnValue(of({ fiscal_year: '1405', job_grades: [] })),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([]))
    };

    mockWs = {
      notifications$: of()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({})
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };
  });

  it('Flow 1: Happy path through full 3-step workflow (Supervisor -> Finance -> Manager)', () => {
    // ──── مرحله ۱: سرپرست کارگاه ────
    const supervisorComp = new SupervisorNewProfilesHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
    supervisorComp.ngOnInit();

    // سرپرست رکورد احمد حسینی را در تب change_requests با وضعیت pending_supervisor مشاهده می‌کند
    expect(supervisorComp.personnelChangeRequests.length).toBe(1);
    expect(supervisorComp.personnelChangeRequests[0].personnel_name).toBe('احمد حسینی');
    expect(supervisorComp.personnelChangeRequests[0].status).toBe('pending_supervisor');

    // سرپرست دکمه تایید مرحله اول را می‌زند
    supervisorComp.approvePersonnelChange(supervisorComp.personnelChangeRequests[0]);

    expect(mockPersonnelApi.approvePersonnelChangeRequestSupervisor).toHaveBeenCalledWith(111);
    expect(activeCR.status).toBe('pending_accountant');

    // ──── مرحله ۲: حسابدار مالی (هاب پرسنل حسابدار، جانشین کارتابل مالی قدیمی) ────
    const accountantComp = new AccountantPersonnelHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
    accountantComp.fetchData();

    // حسابدار رکورد را در زیرتب درخواست‌های تغییر مشاهده می‌کند
    expect(accountantComp.changeRequests.length).toBe(1);
    expect(accountantComp.changeRequests[0].status).toBe('pending_accountant');

    // حسابدار مدال Diff را باز و مقایسه می‌کند
    accountantComp.openDiffModal(accountantComp.changeRequests[0]);
    expect(accountantComp.diffFieldRows.length).toBeGreaterThan(0);
    const wageRow = accountantComp.diffFieldRows.find(r => r.field_name === 'daily_base_wage');
    expect(wageRow).toBeDefined();
    expect(wageRow?.old_value).toBe(3500000);
    expect(wageRow?.new_value).toBe(4500000);
    expect(wageRow?.is_changed).toBe(true);

    // حسابدار تایید مالی را می‌زند
    accountantComp.approveChangeRequestFinance(accountantComp.changeRequests[0]);

    expect(mockPersonnelApi.approvePersonnelChangeRequestFinance).toHaveBeenCalledWith(111);
    expect(activeCR.status).toBe('pending_manager');

    // ──── مرحله ۳: مدیر ارشد ────
    const managerComp = new ManagerApprovals(
      mockState,
      mockAuth,
      mockPersonnelApi,
      { getAll: vi.fn().mockReturnValue(of([])) } as any,
      mockToast,
      { show: vi.fn() } as any,
      mockCdr,
      mockRoute,
      mockRouter,
      { downloadPdf: vi.fn() } as any
    );
    managerComp.loadChangeRequests();

    // مدیر تغییرات را در کارتابل مصوبات مشاهده می‌کند
    expect(managerComp.personnelChangeRequests.length).toBe(1);
    expect(managerComp.personnelChangeRequests[0].status).toBe('pending_manager');

    // مدیر مدال Diff را بررسی می‌کند
    managerComp.openDiffModal(managerComp.personnelChangeRequests[0], 'personnel');
    const mgrWageRow = managerComp.diffFieldRows.find(r => r.field_name === 'daily_base_wage');
    expect(mgrWageRow?.old_value).toBe(3500000);
    expect(mgrWageRow?.new_value).toBe(4500000);

    // مدیر دکمه تصویب نهایی را می‌زند
    managerComp.approveChangeRequestManager(managerComp.personnelChangeRequests[0], 'personnel');

    expect(mockPersonnelApi.approvePersonnelChangeRequestManager).toHaveBeenCalledWith(111);
    expect(activeCR.status).toBe('approved');
  });

  it('Flow 2: Rejection at supervisor stage returns to rejected and halts cycle', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('دلیل: مدارک تکمیلی ناقص است');

    const supervisorComp = new SupervisorNewProfilesHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
    supervisorComp.ngOnInit();

    supervisorComp.rejectPersonnelChange(activeCR);

    expect(mockPersonnelApi.rejectPersonnelChangeRequest).toHaveBeenCalledWith(111, 'دلیل: مدارک تکمیلی ناقص است');
    expect(activeCR.status).toBe('rejected');
  });
});
