// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SupervisorPeriodLockHubComponent } from './supervisor-period-lock';
import { ProjectSection } from '../../../../../../core/models/personnel.model';

describe('SupervisorPeriodLockHubComponent Unit Tests', () => {
  let component: SupervisorPeriodLockHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'کارگاه مرکزی', project: 1, project_name: 'پروژه الف', is_active: true }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_lock_period_supervisor'])
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
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({
        period_id: 55,
        period_status: 'OPEN',
        is_locked: false,
        pending_approvals_count: 2,
        summary: [
          { personnel_id: 1, personnel_name: 'رضا حسینی', total_hours: 190, total_overtime_hours: 10 },
          { personnel_id: 2, personnel_name: 'علی اکبری', total_hours: 200, total_overtime_hours: 20 }
        ]
      })),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'active_period', section_id: '10' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new SupervisorPeriodLockHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  it('1. should initialize with default section and period tab', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('active_period');
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(component.selectedSectionId).toBe(10);
  });

  it('2. should fetch period summary and extract pending_approvals_count and is_locked accurately', () => {
    component.fetchPeriodData();
    expect(mockPersonnelApi.getAttendanceMonthlySummary).toHaveBeenCalled();
    expect(component.currentPeriodSummary.pending_approvals).toBe(2);
    expect(component.currentPeriodSummary.total_personnel).toBe(2);
    expect(component.currentPeriodSummary.total_work_hours).toBe(390);
    expect(component.currentPeriodSummary.is_locked).toBe(false);
    expect(component.currentPeriodId).toBe(55);
  });

  it('3. should block lock submission if pending_approvals > 0 and show error toast', () => {
    component.fetchPeriodData();
    expect(component.currentPeriodSummary.pending_approvals).toBe(2);

    component.lockAndSubmitPeriod();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('امکان قفل دوره وجود ندارد')
    );
    expect(mockPersonnelApi.postCartableAction).not.toHaveBeenCalled();
  });

  it('4. should successfully lock period when pending_approvals is 0', () => {
    mockPersonnelApi.getAttendanceMonthlySummary.mockReturnValue(of({
      period_id: 55,
      period_status: 'OPEN',
      is_locked: false,
      pending_approvals_count: 0,
      summary: [{ personnel_id: 1, total_hours: 190, total_overtime_hours: 0 }]
    }));

    component.selectedSectionId = 10;
    component.fetchPeriodData();
    expect(component.currentPeriodSummary.pending_approvals).toBe(0);

    component.lockAndSubmitPeriod();
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', expect.objectContaining({
      action: 'approve',
      model: 'period',
      id: 55,
      section_id: 10
    }));
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('با موفقیت قفل')
    );
  });

  it('5. should navigate to attendance tab on goToAttendance()', () => {
    component.selectedSectionId = 10;
    component.goToAttendance();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/supervisor/attendance'], {
      queryParams: {
        tab: 'pending',
        section_id: 10
      }
    });
  });
});
