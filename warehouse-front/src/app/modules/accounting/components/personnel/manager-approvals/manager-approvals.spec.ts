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
      getPersonnelProfiles: vi.fn().mockReturnValue(of([
        { id: 1, full_name: 'محمد رضایی', national_code: '1234567890', approval_status: 'draft' },
        { id: 2, full_name: 'علی حسینی', national_code: '0987654321', approval_status: 'revision_required' }
      ])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([
        { id: 10, driver_name: 'حسین احمدی', plate_number: '12-345-67', approval_status: 'draft' }
      ])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([
        { id: 201, status: 'pending_manager', changes_payload: { first_name: { old: 'علی', new: 'علیرضا' } } }
      ])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({
        year_month: '1405/04',
        period_status: 'OPEN'
      })),
      getYearlySettings: vi.fn().mockReturnValue(of({ fiscal_year: '1405', job_grades: [] })),
      approvePersonnelManager: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      approveVehicleManager: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      approvePersonnelChangeRequestManager: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      periodWorkflowAction: vi.fn().mockReturnValue(of({ message: 'ارسال شد' })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ message: 'رد شد' })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ message: 'ارجاع شد' })),
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
      mockRouter
    );
  });

  it('should initialize and load draft personnel', () => {
    component.ngOnInit();
    expect(component.activeTab).toBe('new_personnel');
    expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    expect(component.personnelList.length).toBe(2);
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

  it('should approve personnel by manager and reload data', () => {
    component.approvePersonnelManager({ id: 1 } as any);
    expect(mockPersonnelApi.approvePersonnelManager).toHaveBeenCalledWith(1);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
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

  it('should filter personnel change requests by status and search query', () => {
    component.personnelChangeRequests = [
      { id: 111, personnel_name: 'احمد حسینی', status: 'pending_manager', personnel_national_code: '0012345678' } as any,
      { id: 110, personnel_name: 'احمد حسینی', status: 'rejected', personnel_national_code: '0012345678' } as any,
      { id: 105, personnel_name: 'رضا کمالی', status: 'pending_manager', personnel_national_code: '9876543210' } as any
    ];

    // Default crStatusFilter is 'pending_manager'
    expect(component.filteredPersonnelChangeRequests.length).toBe(2);

    // Filter by search query
    component.crSearchQuery = 'احمد';
    expect(component.filteredPersonnelChangeRequests.length).toBe(1);
    expect(component.filteredPersonnelChangeRequests[0].id).toBe(111);

    // Switch to ALL
    component.crSearchQuery = '';
    component.setCRStatusFilter('ALL');
    expect(component.filteredPersonnelChangeRequests.length).toBe(3);

    // Switch to rejected
    component.setCRStatusFilter('rejected');
    expect(component.filteredPersonnelChangeRequests.length).toBe(1);
    expect(component.filteredPersonnelChangeRequests[0].id).toBe(110);
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

