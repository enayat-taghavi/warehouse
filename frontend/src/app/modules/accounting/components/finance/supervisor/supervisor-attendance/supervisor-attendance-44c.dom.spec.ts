// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { SupervisorAttendanceHubComponent } from './supervisor-attendance';
import { ATTENDANCE_PERIOD_LOCKED_FA } from '../../../../attendance-period-error';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection } from '../../../../models/personnel.model';

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

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('SupervisorAttendanceHubComponent 4.4-c DOM Specs', () => {
  let fixture: ComponentFixture<SupervisorAttendanceHubComponent>;
  let component: SupervisorAttendanceHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRoute: any;

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
    }
  ];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

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
      info: vi.fn(),
      show: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getDailyAttendance: vi.fn().mockReturnValue(of(mockAttendanceData)),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockRoute = {
      queryParams: of({ tab: 'pending', section_id: '10' })
    };

    await TestBed.configureTestingModule({
      imports: [SupervisorAttendanceHubComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ActivatedRoute, useValue: mockRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SupervisorAttendanceHubComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('f) openRevisionModal(item) then fixture.detectChanges(): an app-workflow-reason-dialog element is present and component.showRevisionModal is true; confirmRevision("") calls no postCartableAction', () => {
    const item = { id: 101, personnel_name: 'رضا حسینی', date_shamsi: '1405/01/05' };
    component.openRevisionModal(item);
    fixture.detectChanges();

    const dialogElement = fixture.nativeElement.querySelector('app-workflow-reason-dialog');
    expect(dialogElement).toBeTruthy();
    expect(component.showRevisionModal).toBe(true);

    component.confirmRevision('');
    expect(mockPersonnelApi.postCartableAction).not.toHaveBeenCalled();
  });

  it('g) confirmRevision("علت آزمایشی") calls postCartableAction once with "supervisor" and an object containing action: "revision"', () => {
    const item = { id: 101, personnel_name: 'رضا حسینی', date_shamsi: '1405/01/05' };
    component.openRevisionModal(item);
    component.confirmRevision('علت آزمایشی');

    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledTimes(1);
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', expect.objectContaining({
      action: 'revision'
    }));
  });

  it('h) when postCartableAction returns throwError with the server lock error, component.revisionServerError equals ATTENDANCE_PERIOD_LOCKED_FA and the dialog stays open', () => {
    const serverLockError = new HttpErrorResponse({
      status: 400,
      error: { code: 'attendance_period_locked', error: 'x', detail: 'x' }
    });
    mockPersonnelApi.postCartableAction.mockReturnValue(throwError(() => serverLockError));

    const item = { id: 101, personnel_name: 'رضا حسینی', date_shamsi: '1405/01/05' };
    component.openRevisionModal(item);
    component.confirmRevision('علت آزمایشی');

    expect(component.revisionServerError).toBe(ATTENDANCE_PERIOD_LOCKED_FA);
    expect(component.showRevisionModal).toBe(true);
  });
});
