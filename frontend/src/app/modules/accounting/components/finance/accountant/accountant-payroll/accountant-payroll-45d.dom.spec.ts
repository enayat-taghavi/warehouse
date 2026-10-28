// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AccountantPayrollHubComponent } from './accountant-payroll';
import { PAYROLL_LOCKED_FA, PAYROLL_OFFLINE_FA } from '../payroll-period';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../../core/http/scope-directory.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('AccountantPayrollHubComponent (Release v1 step 4.5-d DOM specs)', () => {
  let fixture: ComponentFixture<AccountantPayrollHubComponent>;
  let component: AccountantPayrollHubComponent;
  let mockAuth: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockWh: any;
  let mockRegistry: any;
  let mockConfirmDialog: any;
  let mockWs: any;
  let networkSpy: any = null;

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 2, username: 'acc', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue(['view_sys_payroll', 'perm_approve_personnel_finance', 'perm_lock_work_period'])
    };
    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'S' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({ years: ['1404', '1405'] })),
      getWorkPeriods: vi.fn().mockReturnValue(of([])),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([])),
      calculatePeriodPayroll: vi.fn().mockReturnValue(of({ message: 'ok' })),
      submitPayrollWorkflow: vi.fn().mockReturnValue(of({ message: 'ok', workflow_step: 'manager_ok' })),
      lockPeriod: vi.fn().mockReturnValue(of({ message: 'ok' })),
      unlockPeriod: vi.fn().mockReturnValue(of({ message: 'ok' })),
      importTaxExcel: vi.fn().mockReturnValue(of({})),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({ summary: [] })),
      exportMonthlyPayrollExcel: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    mockRouter = {
      navigate: vi.fn()
    };
    mockRoute = {
      queryParams: of({})
    };
    mockWh = {
      getAll: vi.fn().mockReturnValue(of([]))
    };
    mockRegistry = {
      isModuleInstalled: vi.fn().mockReturnValue(true),
      getExtensions: vi.fn().mockReturnValue([])
    };
    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };
    mockWs = {
      documentChanges$: vi.fn().mockReturnValue(of())
    };

    await TestBed.configureTestingModule({
      imports: [AccountantPayrollHubComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: {} },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ScopeDirectoryService, useValue: mockWh },
        { provide: ModuleRegistryService, useValue: mockRegistry },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: WebSocketService, useValue: mockWs }
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    fixture = TestBed.createComponent(AccountantPayrollHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    if (networkSpy) {
      networkSpy.mockRestore();
      networkSpy = null;
    }
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) section mode, getWorkPeriods returns manager_ok period and getMonthlyPayrollRecords returns one PENDING row: period is frozen, cannot submit workflow, anchor renders with my-tasks and payroll_period', () => {
    component.mySections = [{ id: 10, name: 'S' } as any];
    component.selectedSectionId = 10;
    mockPersonnelApi.getWorkPeriods.mockReturnValue(of([{
      id: 5,
      section: 10,
      status: 'READY_TO_PAY',
      payroll_workflow_step: 'manager_ok'
    }]));
    mockPersonnelApi.getMonthlyPayrollRecords.mockReturnValue(of([{
      id: 101,
      payment_status: 'PENDING',
      gross_salary: 1000
    }]));

    component.fetchPayrollData();

    expect(component.currentPeriodId).toBe(5);
    expect(component.isPayrollFrozen).toBe(true);
    expect(component.canSubmitWorkflow).toBe(false);

    fixture.detectChanges();

    const anchors = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    const targetAnchor = anchors.find(a => {
      const href = a.getAttribute('href') || '';
      return href.includes('my-tasks') && href.includes('payroll_period');
    });
    expect(targetAnchor).toBeTruthy();
  });

  it('b) section mode, calculatePeriodPayroll returns attendance_not_approved: payload contains section_id: 10 and no warehouse_id, attendanceBlockedMessage is not empty', () => {
    component.mySections = [{ id: 10, name: 'S' } as any];
    component.selectedSectionId = 10;
    component.selectedWarehouseId = null;
    component.periodStatus = 'OPEN';
    component.workflowLocked = false;
    component.workflowStep = null;
    component.allRecords = [];

    const err = new HttpErrorResponse({
      status: 400,
      error: { code: 'attendance_not_approved', error: 'MSG', detail: 'MSG' }
    });
    mockPersonnelApi.calculatePeriodPayroll.mockReturnValue(throwError(() => err));

    component.calculateBatch();

    expect(mockPersonnelApi.calculatePeriodPayroll).toHaveBeenCalled();
    const payload = mockPersonnelApi.calculatePeriodPayroll.mock.calls[0][0];
    expect(payload.section_id).toBe(10);
    expect(payload.warehouse_id).toBeUndefined();
    expect(component.attendanceBlockedMessage).toBeTruthy();
    expect(component.attendanceBlockedMessage.length).toBeGreaterThan(0);
  });

  it('c) calculatePeriodPayroll returns payroll_locked: workflowLocked is true and error toast receives PAYROLL_LOCKED_FA', () => {
    component.periodStatus = 'OPEN';
    component.workflowLocked = false;
    component.workflowStep = null;
    component.allRecords = [];

    const err = new HttpErrorResponse({
      status: 400,
      error: { code: 'payroll_locked', error: 'MSG', detail: 'MSG' }
    });
    mockPersonnelApi.calculatePeriodPayroll.mockReturnValue(throwError(() => err));

    component.calculateBatch();

    expect(component.workflowLocked).toBe(true);
    expect(mockToast.error).toHaveBeenCalledWith(PAYROLL_LOCKED_FA);
  });

  it('d) calculatePeriodPayroll success with skipped_no_attendance: skippedNoAttendance has length 1 and page text contains Persian full_name', () => {
    component.periodStatus = 'OPEN';
    component.workflowLocked = false;
    component.workflowStep = null;
    component.allRecords = [];
    mockPersonnelApi.getMonthlyPayrollRecords.mockReturnValue(of([]));

    mockPersonnelApi.calculatePeriodPayroll.mockReturnValue(of({
      message: 'ok',
      period_id: 10,
      period_status: 'OPEN',
      skipped_no_attendance: [{ personnel_id: 7, full_name: 'نام آزمایشی' }]
    }));

    component.calculateBatch();

    expect(component.skippedNoAttendance.length).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('نام آزمایشی');
  });

  it('e) section mode with period 5 loaded, no workflow step and one PENDING row, confirm dialog resolving true: submitForManager calls submitPayrollWorkflow(5) once and workflowLocked is true; offline: submitPayrollWorkflow is not called and error toast receives PAYROLL_OFFLINE_FA', async () => {
    component.mySections = [{ id: 10, name: 'S' } as any];
    component.selectedSectionId = 10;
    component.currentPeriodId = 5;
    component.periodStatus = 'OPEN';
    component.workflowStep = null;
    component.workflowLocked = false;
    component.allRecords = [{ id: 1, payment_status: 'PENDING', gross_salary: 100 }];
    mockConfirmDialog.open.mockResolvedValue(true);
    mockPersonnelApi.submitPayrollWorkflow.mockReturnValue(of({ message: 'ok', workflow_step: 'manager_ok' }));

    await component.submitForManager();

    expect(mockPersonnelApi.submitPayrollWorkflow).toHaveBeenCalledTimes(1);
    expect(mockPersonnelApi.submitPayrollWorkflow).toHaveBeenCalledWith(5);
    expect(component.workflowLocked).toBe(true);

    // Offline check
    mockPersonnelApi.submitPayrollWorkflow.mockClear();
    mockToast.error.mockClear();
    component.workflowStep = null;
    component.workflowLocked = false;
    networkSpy = vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(false);

    await component.submitForManager();

    expect(mockPersonnelApi.submitPayrollWorkflow).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(PAYROLL_OFFLINE_FA);
  });
});
