// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { SupervisorAttendanceHubComponent } from './supervisor-attendance';
import { ProjectSection } from '../../../../models/personnel.model';

describe('SupervisorAttendanceHubComponent Unit Tests', () => {
  let component: SupervisorAttendanceHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'کارگاه مرکزی', code: 'SEC-10', project: 1, project_name: 'پروژه الف', is_active: true }
  ];

  const mockAttendanceData = [
    {
      id: 101,
      personnel_name: 'رضا حسینی',
      national_code: '0012345678',
      date_shamsi: '1405/01/05',
      status: 'PRESENT_10H',
      approval_status: 'PENDING_SUPERVISOR',
      notes: 'کارکرد اولیه'
    },
    {
      id: 102,
      personnel_name: 'علی اکبری',
      national_code: '0023456789',
      date_shamsi: '1405/01/05',
      status: 'PRESENT_10H',
      approval_status: 'APPROVED',
      supervisor_approved_by_name: 'سرپرست آزمایشی',
      notes: ''
    },
    {
      id: 103,
      personnel_name: 'محمد رضایی',
      national_code: '0034567890',
      date_shamsi: '1405/01/05',
      status: 'ABSENT',
      approval_status: 'REVISION_REQUIRED',
      revision_reason: 'علت غیبت نامشخص است',
      notes: ''
    }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_attendance_supervisor'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getDailyAttendance: vi.fn().mockReturnValue(of(mockAttendanceData)),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'pending', section_id: '10' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new SupervisorAttendanceHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  it('1. should initialize with default pending subtab and load sections', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('pending');
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(component.selectedSectionId).toBe(10);
  });

  it('2. should fetch attendance and calculate status counters accurately', () => {
    component.fetchAttendanceData();
    expect(mockPersonnelApi.getDailyAttendance).toHaveBeenCalled();
    expect(component.statusCounters.pending).toBe(1);
    expect(component.statusCounters.approved).toBe(1);
    expect(component.statusCounters.revision).toBe(1);
    expect(component.statusCounters.all).toBe(3);
    // In 'pending' tab, items list should only have pending items
    expect(component.items.length).toBe(1);
    expect(component.items[0].id).toBe(101);
  });

  it('3. should switch subtabs and filter records accordingly', () => {
    component.fetchAttendanceData();

    // Switch to approved
    component.switchSubTab('approved');
    expect(component.activeSubTab).toBe('approved');
    expect(component.items.length).toBe(1);
    expect(component.items[0].id).toBe(102);
    expect(component.items[0].approval_status).toBe('APPROVED');

    // Switch to revision
    component.switchSubTab('revision');
    expect(component.activeSubTab).toBe('revision');
    expect(component.items.length).toBe(1);
    expect(component.items[0].id).toBe(103);
    expect(component.items[0].approval_status).toBe('REVISION_REQUIRED');

    // Switch to all
    component.switchSubTab('all');
    expect(component.activeSubTab).toBe('all');
    expect(component.items.length).toBe(3);
  });

  it('4. should approve single attendance record via postCartableAction', () => {
    component.fetchAttendanceData();
    const item = component.items[0]; // item 101

    component.approveSingle(item);
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'approve',
      model: 'attendance',
      id: 101
    });
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('5. should batch approve all pending attendance records', () => {
    component.fetchAttendanceData();
    component.approveBatch();

    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'approve',
      model: 'attendance',
      ids: [101]
    });
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('6. should handle revision modal workflow and mandate reason', () => {
    component.fetchAttendanceData();
    const item = component.items[0];

    component.openRevisionModal(item);
    expect(component.showRevisionModal).toBe(true);
    expect(component.revisionTargetItem).toBe(item);

    // Attempt confirm without reason
    component.revisionReasonText = '   ';
    component.confirmRevision();
    expect(mockToast.error).toHaveBeenCalledWith('ثبت علت عودت و بازنگری کارکرد الزامی است.');

    // Confirm with reason
    component.revisionReasonText = 'ساعات اضافه کاری نیاز به بررسی دارد';
    component.confirmRevision();
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'revision',
      model: 'attendance',
      id: 101,
      reason: 'ساعات اضافه کاری نیاز به بررسی دارد'
    });
    expect(mockToast.warning).toHaveBeenCalled();
    expect(component.showRevisionModal).toBe(false);
  });
});
