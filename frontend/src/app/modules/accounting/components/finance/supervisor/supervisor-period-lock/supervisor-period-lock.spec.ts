// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { SupervisorPeriodLockHubComponent } from './supervisor-period-lock';
import { ProjectSection } from '../../../../models/personnel.model';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';

describe('SupervisorPeriodLockHubComponent (read-only period list)', () => {
  let component: SupervisorPeriodLockHubComponent;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'کارگاه مرکزی', code: 'SEC-10', project: 1, project_name: 'پروژه الف', is_active: true }
  ];

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getWorkPeriods: vi.fn().mockReturnValue(of([
        { id: 55, year_month: '1405/04', section: 10, section_name: 'کارگاه مرکزی', status: 'SUBMITTED' }
      ]))
    };
    mockRouter = { navigate: vi.fn() };

    component = new SupervisorPeriodLockHubComponent(
      { user: vi.fn() } as any,
      {} as any,
      mockToast,
      mockPersonnelApi,
      mockRouter,
      { queryParams: of({ section_id: '10' }) } as any,
      { markForCheck: vi.fn(), detectChanges: vi.fn() } as any
    );
  });

  it('1. loads sections and the period list for the selected section and month', () => {
    const t = new Date();
    const j = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    const expectedYearMonth = `${j.jy}/${String(j.jm).padStart(2, '0')}`;

    component.ngOnInit();
    expect(component.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getWorkPeriods).toHaveBeenCalledWith({ year_month: expectedYearMonth, section_id: 10 });
    expect(component.periods.length).toBe(1);
  });

  it('2. approve / lock actions are gone (engine my-tasks does them)', () => {
    const c: any = component;
    expect(c.lockAndSubmitPeriod).toBeUndefined();
    expect(c.fetchPeriodData).toBeUndefined();
    expect(mockPersonnelApi.postCartableAction).toBeUndefined();
  });

  it('3. shows an error toast and an empty list when loading fails', () => {
    mockPersonnelApi.getWorkPeriods.mockReturnValue(throwError(() => ({ status: 500, error: {} })));
    component.fetchPeriods();
    expect(component.loadFailed).toBe(true);
    expect(component.periods).toEqual([]);
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('4. filter change syncs the URL and reloads', () => {
    component.selectedSectionId = 10;
    component.onFilterChanged();
    expect(mockRouter.navigate).toHaveBeenCalled();
    expect(mockPersonnelApi.getWorkPeriods).toHaveBeenCalled();
  });
});
