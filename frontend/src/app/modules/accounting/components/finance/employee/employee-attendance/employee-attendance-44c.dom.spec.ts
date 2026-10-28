// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';

import { EmployeeAttendanceHubComponent } from './employee-attendance';
import { ATTENDANCE_PERIOD_LOCKED_FA } from '../../../../attendance-period-error';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../../core/http/scope-directory.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';

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

describe('EmployeeAttendanceHubComponent 4.4-c DOM Specs', () => {
  let fixture: ComponentFixture<EmployeeAttendanceHubComponent>;
  let component: EmployeeAttendanceHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWhService: any;
  let mockWsService: any;
  let mockToast: any;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش مهندسی و فنی', code: 'ENG', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش مهندسی و فنی', code: 'ENG', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getAttendanceMatrix: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        date_shamsi: '1405/06/08',
        is_locked: false,
        period_status: 'OPEN',
        rows: []
      })),
      saveAttendanceBulk: vi.fn().mockReturnValue(of({ success: true, saved_count: 0, updated_count: 0 })),
      getMonthlyAttendanceGrid: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        year_month: '1405/06',
        days_in_month: 31,
        is_locked: false,
        period_status: 'OPEN',
        days_meta: [],
        rows: []
      })),
      bulkSaveMonthlyGrid: vi.fn().mockReturnValue(of({ success: true, saved_count: 1, updated_count: 0 })),
      exportMonthlyAttendanceExcel: vi.fn().mockReturnValue(of(new Blob(['excel']))),
      importMonthlyAttendanceExcel: vi.fn().mockReturnValue(of({ message: 'بارگذاری شد', saved_count: 1 })),
      periodWorkflowAction: vi.fn().mockReturnValue(of({ message: 'دوره کارکرد جهت بررسی مالی ارسال گردید' }))
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([
        { id: 1, name: 'انبار مرکزی' }
      ]))
    };

    mockWsService = {
      notifications$: new Subject<any>(),
      connected$: new Subject<boolean>(),
      tabId: 'test-tab-123'
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [EmployeeAttendanceHubComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ScopeDirectoryService, useValue: mockWhService },
        { provide: WebSocketService, useValue: mockWsService },
        { provide: ToastService, useValue: mockToast }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeAttendanceHubComponent);
    component = fixture.componentInstance;
    component.selectedSectionId = 10;
    component.selectedYearMonth = '1405/06';
    component.selectedDateShamsi = '1405/06/08';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('online'));
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a) when the monthly grid response has period_status: "SUBMITTED_SUPERVISOR" and is_locked: false, component.isPeriodLocked is true, the rendered monthly tab contains ATTENDANCE_PERIOD_LOCKED_FA, and an anchor whose href contains my-tasks and attendance_period is present', () => {
    mockPersonnelApi.getMonthlyAttendanceGrid.mockReturnValue(of({
      warehouse_id: 1,
      year_month: '1405/06',
      days_in_month: 31,
      is_locked: false,
      period_status: 'SUBMITTED_SUPERVISOR',
      days_meta: [],
      rows: []
    }));

    component.activeMode = 'monthly_grid';
    component.loadMonthlyAttendanceGrid();
    fixture.detectChanges();

    expect(component.isPeriodLocked).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(ATTENDANCE_PERIOD_LOCKED_FA);

    const anchors = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    const myTasksAnchor = anchors.find(a => {
      const href = a.getAttribute('href') || a.href || '';
      return href.includes('my-tasks') && href.includes('attendance_period');
    });
    expect(myTasksAnchor).toBeTruthy();
  });

  it('b) saveMonthlyGrid whose bulkSaveMonthlyGrid mock returns throwError with the server lock error calls mockToast.show("error", ATTENDANCE_PERIOD_LOCKED_FA)', () => {
    const serverLockError = new HttpErrorResponse({
      status: 400,
      error: { code: 'attendance_period_locked', error: 'x', detail: 'x' }
    });
    mockPersonnelApi.bulkSaveMonthlyGrid.mockReturnValue(throwError(() => serverLockError));

    component.isPeriodLocked = false;
    component.selectedYearMonth = '1405/06';
    component.selectedSectionId = 10;
    component.saveMonthlyGrid();

    expect(mockToast.show).toHaveBeenCalledWith('error', ATTENDANCE_PERIOD_LOCKED_FA);
  });

  it('c) the same with the fiscal error calls mockToast.show("error", "MSG-FISCAL")', () => {
    const fiscalError = new HttpErrorResponse({
      status: 400,
      error: { date_shamsi: ['MSG-FISCAL'], code: 'fiscal_period_closed' }
    });
    mockPersonnelApi.bulkSaveMonthlyGrid.mockReturnValue(throwError(() => fiscalError));

    component.isPeriodLocked = false;
    component.selectedYearMonth = '1405/06';
    component.selectedSectionId = 10;
    component.saveMonthlyGrid();

    expect(mockToast.show).toHaveBeenCalledWith('error', 'MSG-FISCAL');
  });

  it('d) with two grid rows of 3 days each, after calling onMonthlyCellHoursChange on exactly one cell (personnel of row 1, day 2, set effective_hours to 8 first) saveMonthlyGrid sends items with length 1 for that personnel and day 2', () => {
    const row1: any = {
      personnel_id: 101,
      full_name: 'پرسنل یک',
      days: [
        { day: 1, effective_hours: 0, status: '', is_existing: false },
        { day: 2, effective_hours: 0, status: '', is_existing: false },
        { day: 3, effective_hours: 0, status: '', is_existing: false }
      ]
    };
    const row2: any = {
      personnel_id: 102,
      full_name: 'پرسنل دو',
      days: [
        { day: 1, effective_hours: 0, status: '', is_existing: false },
        { day: 2, effective_hours: 0, status: '', is_existing: false },
        { day: 3, effective_hours: 0, status: '', is_existing: false }
      ]
    };

    component.monthlyGridRows = [row1, row2];
    component.isPeriodLocked = false;
    component.selectedYearMonth = '1405/06';
    component.selectedSectionId = 10;

    row1.days[1].effective_hours = 8;
    component.onMonthlyCellHoursChange(row1, row1.days[1]);

    component.saveMonthlyGrid();

    expect(mockPersonnelApi.bulkSaveMonthlyGrid).toHaveBeenCalledTimes(1);
    const payload = mockPersonnelApi.bulkSaveMonthlyGrid.mock.calls[0][0];
    expect(payload.items.length).toBe(1);
    expect(payload.items[0].personnel_id).toBe(101);
    expect(payload.items[0].day).toBe(2);
    expect(payload.items[0].effective_hours).toBe(8);
  });

  it('e) offline: submitPeriodForReview does not call periodWorkflowAction and shows a warning toast; online with selectedSectionId = 10 it calls periodWorkflowAction with an object containing section_id: 10 and action: "submit"', () => {
    component.selectedSectionId = 10;
    component.selectedYearMonth = '1405/06';

    // Simulate offline
    window.dispatchEvent(new Event('offline'));
    expect(NetworkStatusService.getInstance().isOnline).toBe(false);

    component.submitPeriodForReview();
    expect(mockPersonnelApi.periodWorkflowAction).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.any(String));

    // Restore online
    window.dispatchEvent(new Event('online'));
    expect(NetworkStatusService.getInstance().isOnline).toBe(true);

    component.submitPeriodForReview();
    expect(mockPersonnelApi.periodWorkflowAction).toHaveBeenCalledWith(
      expect.objectContaining({
        section_id: 10,
        action: 'submit'
      })
    );
  });
});
