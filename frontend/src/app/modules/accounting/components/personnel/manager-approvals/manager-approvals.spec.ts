// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManagerApprovals } from './manager-approvals';
import { of } from 'rxjs';

describe('ManagerApprovals Unit Tests', () => {
  let component: ManagerApprovals;
  let mockState: any;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWhService: any;
  let mockToast: any;
  let mockConfirmDialog: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockState = {
      activeWarehouse: vi.fn().mockReturnValue(null),
      hasRole: vi.fn().mockReturnValue(true)
    };

    mockAuth = {
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_manager', 'perm_approve_fleet_manager', 'admin_all']),
      userRoleTitles: vi.fn().mockReturnValue(['مدیر ارشد'])
    };

    mockPersonnelApi = {
      getPersonnelProfilesPage: vi.fn().mockReturnValue(of({ count: 2, next: null, previous: null, results: [
        { id: 1, full_name: 'محمد رضایی', national_code: '12******90', approval_status: 'pending_manager' },
        { id: 2, full_name: 'علی حسینی', national_code: '0987654321', approval_status: 'pending_manager' }
      ] })),
      getVehicleProfiles: vi.fn().mockReturnValue(of([
        { id: 10, driver_name: 'حسین احمدی', plate_number: '12-345-67', approval_status: 'draft' }
      ])),
      getPersonnelChangeRequestsPage: vi.fn().mockReturnValue(of({ count: 1, next: null, previous: null, results: [
        { id: 201, status: 'pending_manager', changes_payload: { first_name: { old: 'علی', new: 'علیرضا' } } }
      ] })),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({
        year_month: '1405/04',
        period_status: 'OPEN'
      })),
      getYearlySettings: vi.fn().mockReturnValue(of({ fiscal_year: '1405', job_grades: [] })),
      approveVehicleManager: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      periodWorkflowAction: vi.fn().mockReturnValue(of({ message: 'ارسال شد' })),
      getExpenseInvoices: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([])),
      postCartableAction: vi.fn().mockReturnValue(of({ message: 'عملیات با موفقیت انجام شد' }))
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([{ id: 1, name: 'انبار مرکزی' }]))
    };

    mockToast = {
      show: vi.fn()
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new_personnel', status: 'draft' }),
      snapshot: { queryParams: { tab: 'new_personnel', status: 'draft' } }
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new ManagerApprovals(
      mockAuth,
      mockState,
      mockPersonnelApi,
      mockWhService,
      mockToast,
      mockConfirmDialog,
      mockCdr,
      mockRoute,
      mockRouter,
      { downloadPdf: vi.fn() } as any
    );
  });

  it('should initialize and load draft personnel', () => {
    component.ngOnInit();
    expect(component.activeTab).toBe('new_personnel');
    expect(mockPersonnelApi.getPersonnelProfilesPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }));
    expect(component.personnelList.length).toBe(2);
    expect(component.personnelCount).toBe(2);
    expect(component.pendingPersonnelCount).toBe(2);
  });

  it('should switch tabs and update query params', () => {
    component.setTab('change_requests');
    expect(component.activeTab).toBe('change_requests');
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('should open Diff Viewer modal and parse changed fields', () => {
    const mockCR = {
      id: 50,
      changes_payload: {
        daily_base_wage: { old: 1000000, new: 1200000 },
        job_title: { old: 'کارگر', new: 'انباردار' }
      }
    };
    component.openDiffModal(mockCR, 'personnel');
    expect(component.isDiffModalOpen).toBe(true);
    expect(component.diffFieldRows.length).toBe(2);
    expect(component.diffFieldRows[0].is_changed).toBe(true);
  });

  it('personnel approve / reject / edit actions are gone (engine my-tasks does them)', () => {
    const c: any = component;
    expect(c.approvePersonnelManager).toBeUndefined();
    expect(c.openEditPersonnelModal).toBeUndefined();
    expect(c.savePersonnelProfile).toBeUndefined();
    expect(mockPersonnelApi.approvePersonnelManager).toBeUndefined();
  });

  it('shows masked national code as-is and detects it with isMasked', () => {
    component.ngOnInit();
    expect(component.isMasked(component.personnelList[0].national_code)).toBe(true);
    expect(component.isMasked(component.personnelList[1].national_code)).toBe(false);
  });

  it('should submit work period for finance review', () => {
    const wp = { id: 1, year_month: '1405/04' };
    component.submitPeriodForFinance(wp);
    expect(mockPersonnelApi.periodWorkflowAction).toHaveBeenCalledWith({
      warehouse_id: null,
      year_month: '1405/04',
      action: 'submit'
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
  });

  it('personnel change requests are filtered on the server (status + search + page)', () => {
    component.changeRequestSubTab = 'personnel';
    component.crSearchQuery = 'احمد';
    component.setCRStatusFilter('rejected');
    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, status: 'rejected', search: 'احمد' })
    );
    component.setCRStatusFilter('ALL');
    const last = mockPersonnelApi.getPersonnelChangeRequestsPage.mock.calls.slice(-1)[0][0];
    expect(last.status).toBeUndefined();
  });

  it('should ignore internal system fields (like approval_status) in Diff Viewer modal and translate phone_number', () => {
    const mockCR = {
      id: 111,
      proposed_changes: {
        phone_number: '08174567890',
        approval_status: 'pending_supervisor',
        attachment: null
      },
      previous_values: {
        phone_number: '09174567890',
        approval_status: 'approved',
        attachment: ''
      }
    };
    component.openDiffModal(mockCR, 'personnel');
    expect(component.isDiffModalOpen).toBe(true);

    // approval_status must NOT be in diff rows
    const fieldNames = component.diffFieldRows.map(r => r.field_name);
    expect(fieldNames).not.toContain('approval_status');

    // phone_number must be translated
    const phoneRow = component.diffFieldRows.find(r => r.field_name === 'phone_number');
    expect(phoneRow).toBeDefined();
    expect(phoneRow?.field_label).toBe('شماره تماس');
    expect(phoneRow?.old_value).toBe('09174567890');
    expect(phoneRow?.new_value).toBe('08174567890');
    expect(phoneRow?.is_changed).toBe(true);
  });
});

