// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { SupervisorPersonnelHubComponent } from './supervisor-personnel';
import { PersonnelChangeRequest } from '../../../../models/personnel.model';

describe('SupervisorPersonnelHubComponent Unit Tests', () => {
  let component: SupervisorPersonnelHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let wsSubject: Subject<any>;

  const mockCrPersonnel: PersonnelChangeRequest = {
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

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_supervisor', 'can_act_as_workshop_supervisor'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'کارگاه مرکزی', project_name: 'پروژه الف' }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([
        { id: 101, first_name: 'علی', last_name: 'اکبری', national_code: '1234567890', approval_status: 'pending_supervisor' }
      ])),
      getDailyAttendance: vi.fn().mockReturnValue(of([
        { id: 201, personnel_name: 'علی اکبری', status: 'PRESENT', supervisor_approved: false, date_shamsi: '1405/01/01' }
      ])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([mockCrPersonnel])),
      approvePersonnelSupervisor: vi.fn().mockReturnValue(of({ success: true })),
      patchDailyAttendance: vi.fn().mockReturnValue(of({ success: true })),
      approvePersonnelChangeRequestSupervisor: vi.fn().mockReturnValue(of({ success: true })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ success: true })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new', section_id: '10' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new SupervisorPersonnelHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  it('1. should initialize with 4 dedicated subtabs for personnel domain', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');
    expect(component.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
  });

  it('2. should fetch new personnel profiles and count them correctly', () => {
    component.fetchData();
    expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    expect(component.newPersonnelList.length).toBe(1);
    expect(component.statusCounters.newCount).toBe(1);
  });

  it('3. should switch subtabs and synchronize URL params', () => {
    component.switchSubTab('attendance');
    expect(component.activeSubTab).toBe('attendance');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ tab: 'attendance' })
    }));
  });

  it('4. should approve new personnel with note modal and show success toast', () => {
    const item = { id: 101, first_name: 'علی', last_name: 'اکبری' };
    component.openApproveModal('new', item);
    expect(component.isApprovalModalOpen).toBe(true);
    component.approvalNote = 'مدارک تکمیل است.';

    component.submitApproval();
    expect(mockPersonnelApi.approvePersonnelSupervisor).toHaveBeenCalledWith(101, 'مدارک تکمیل است.');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isApprovalModalOpen).toBe(false);
  });

  it('5. should open diff modal and calculate field rows correctly for change requests', () => {
    component.openDiffModal(mockCrPersonnel);
    expect(component.isDiffModalOpen).toBe(true);
    expect(component.diffFieldRows.length).toBeGreaterThan(0);
  });

  it('6. should reject personnel with mandatory reason', () => {
    const item = { id: 101, first_name: 'علی', last_name: 'اکبری' };
    component.openRejectModal('new', item, 'reject');
    expect(component.isRejectModalOpen).toBe(true);

    component.submitReject(); // empty reason
    expect(mockToast.showWarning).toHaveBeenCalled();

    component.rejectReason = 'عدم تطابق مدارک هویتی';
    component.submitReject();
    expect(mockPersonnelApi.rejectPersonnel).toHaveBeenCalledWith(101, 'عدم تطابق مدارک هویتی');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);
  });
});
