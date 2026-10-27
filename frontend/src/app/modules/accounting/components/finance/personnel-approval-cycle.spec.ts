// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AccountantPersonnelHubComponent } from './accountant/accountant-personnel/accountant-personnel';
import { ManagerApprovals } from '../personnel/manager-approvals/manager-approvals';
import { PersonnelChangeRequest } from '../../models/personnel.model';

/**
 * ۴.۳-ج: چرخهٔ تایید پرونده/درخواست تغییر پرسنل روی موتور گردش است («کارهای من»).
 * صفحه‌های حسابدار و مدیر فقط فهرست صفحه‌ای فقط‌خواندنی نشان می‌دهند و دکمهٔ تایید/رد خودشان را ندارند.
 */
describe('Personnel change request: read-only lists for accountant and manager (approval cycle lives in my-tasks)', () => {
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let activeCR: PersonnelChangeRequest;

  const page = <T>(results: T[]) => of({ count: results.length, next: null, previous: null, results });

  beforeEach(() => {
    activeCR = {
      id: 111,
      personnel: 5,
      personnel_name: 'احمد حسینی',
      personnel_national_code: '00****5678',
      status: 'pending_accountant',
      status_display: 'در انتظار تایید حسابدار',
      proposed_changes: { daily_base_wage: 4500000 },
      previous_values: { daily_base_wage: 3500000 },
      requested_by_name: 'کارمند انبار',
      created_at: '2026-09-21T10:00:00Z',
      updated_at: '2026-09-21T10:00:00Z'
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 10, username: 'test_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_finance', 'perm_approve_personnel_manager', 'admin_all']),
      userRoleTitles: vi.fn().mockReturnValue(['مدیر', 'حسابدار'])
    };
    mockState = { activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' }), hasRole: vi.fn().mockReturnValue(true) };
    mockToast = {
      success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(),
      showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش دریافت', project: 1 }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfilesPage: vi.fn().mockReturnValue(page([])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequestsPage: vi.fn().mockImplementation(() => page([activeCR])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([])),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({ year_month: '1405/04', period_status: 'OPEN' })),
      getYearlySettings: vi.fn().mockReturnValue(of({ fiscal_year: '1405', job_grades: [] })),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([])),
      getExpenseInvoices: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([]))
    };

    mockWs = { notifications$: of() };
    mockRouter = { navigate: vi.fn() };
    mockRoute = { queryParams: of({}) };
    mockCdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  });

  it('Accountant: lists pending change requests from a server page and opens the diff (no approve action)', () => {
    const accountantComp = new AccountantPersonnelHubComponent(
      mockAuth, mockState, mockToast, mockPersonnelApi, mockWs, mockRouter, mockRoute, mockCdr
    );
    accountantComp.fetchData();

    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, status: 'pending_accountant' })
    );
    expect(accountantComp.changeRequests.length).toBe(1);

    accountantComp.openDiffModal(accountantComp.changeRequests[0]);
    const wageRow = accountantComp.diffFieldRows.find(r => r.field_name === 'daily_base_wage');
    expect(wageRow?.old_value).toBe(3500000);
    expect(wageRow?.new_value).toBe(4500000);
    expect(wageRow?.is_changed).toBe(true);

    expect((accountantComp as any).approveChangeRequestFinance).toBeUndefined();
    expect((accountantComp as any).openRejectModal).toBeUndefined();
  });

  it('Manager: lists change requests from a server page, shows masked national code as-is, no approve/reject', () => {
    activeCR.status = 'pending_manager';
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

    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, status: 'pending_manager' })
    );
    expect(managerComp.personnelChangeRequests.length).toBe(1);
    expect(managerComp.personnelChangeRequests[0].personnel_national_code).toContain('*');
    expect(managerComp.isMasked(managerComp.personnelChangeRequests[0].personnel_national_code)).toBe(true);

    managerComp.openDiffModal(managerComp.personnelChangeRequests[0], 'personnel');
    const mgrWageRow = managerComp.diffFieldRows.find(r => r.field_name === 'daily_base_wage');
    expect(mgrWageRow?.old_value).toBe(3500000);
    expect(mgrWageRow?.new_value).toBe(4500000);

    expect(mockPersonnelApi.approvePersonnelChangeRequestManager).toBeUndefined();
    expect((managerComp as any).approvePersonnelManager).toBeUndefined();
  });

  it('Manager: wrong_step and action_blocked errors are shown in Persian from the body', () => {
    const managerComp = new ManagerApprovals(
      mockState, mockAuth, mockPersonnelApi,
      { getAll: vi.fn().mockReturnValue(of([])) } as any,
      mockToast, { show: vi.fn() } as any, mockCdr, mockRoute, mockRouter, { downloadPdf: vi.fn() } as any
    );
    expect(managerComp.workflowErrorText({ error: { code: 'wrong_step' } }, 'x')).toContain('کارهای من');
    expect(managerComp.workflowErrorText({ error: { code: 'action_blocked', error: 'ناقص', missing_fields: ['شبا'] } }, 'x')).toContain('شبا');
  });
});
