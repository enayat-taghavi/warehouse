// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { provideRouter, ActivatedRoute } from '@angular/router';

import { EmployeeFleetHubComponent, FLEET_LOCKED_FA } from './employee-fleet';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../../core/http/scope-directory.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeFleetHubComponent (Release v1 step 4.6-c monthly submit)', () => {
  let fixture: ComponentFixture<EmployeeFleetHubComponent>;
  let component: EmployeeFleetHubComponent;
  let api: any;
  let toast: any;
  let networkSpy: any = null;

  const gridDay = (editable = true) => ({ day: 1, date_shamsi: '1405/04/01', weekday_short: 'ش', is_friday: false, is_editable: editable });
  const grid = (extra: any = {}) => ({
    warehouse_id: null, year_month: '1405/04', month_name: 'تیر', days_in_month: 31,
    is_locked: false, period_status: 'OPEN', days_meta: [gridDay()], rows: [], period_id: 77, ...extra
  });

  beforeEach(async () => {
    toast = { show: vi.fn() };
    api = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش حمل', code: 'L', project: 1, project_name: 'P' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getVehicleMatrix: vi.fn().mockReturnValue(of([])),
      getVehicleMonthlyGrid: vi.fn().mockReturnValue(of(grid())),
      submitFleetPeriod: vi.fn().mockReturnValue(of({})),
      updateVehicleDayTrip: vi.fn().mockReturnValue(of({}))
    };
    await TestBed.configureTestingModule({
      imports: [EmployeeFleetHubComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: vi.fn().mockReturnValue({ id: 1 }), userPermissions: vi.fn().mockReturnValue([]) } },
        { provide: ToastService, useValue: toast },
        { provide: PersonnelApiService, useValue: api },
        { provide: ScopeDirectoryService, useValue: { getAll: vi.fn().mockReturnValue(of([])) } },
        { provide: WebSocketService, useValue: { notifications$: of(), connected$: of(), tabId: 't1' } },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(EmployeeFleetHubComponent);
    component = fixture.componentInstance;
    component.selectedSectionId = 10;
    component.selectedYearMonth = '1405/04';
    component.activeMode = 'monthly_grid';
  });

  afterEach(() => {
    networkSpy?.mockRestore();
    networkSpy = null;
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) monthly submit sends period_id after confirmation', async () => {
    component.loadFleetMonthlyGrid();
    await component.submitFleetMonthly();
    expect(api.submitFleetPeriod).toHaveBeenCalledWith({ period_id: 77 });
  });

  it('b) fleet_locked shows the notice and blocks day editing', () => {
    api.getVehicleMonthlyGrid.mockReturnValue(of(grid({ fleet_locked: true, is_locked: true, fleet_workflow_step: 'manager_ok' })));
    component.loadFleetMonthlyGrid();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="fleet-locked-notice"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="fleet-workflow-bar"]').textContent).toContain('در انتظار تأیید مدیر');
    component.openFleetDayDetailModal({ is_active: true, days: [] } as any, { day: 1 } as any);
    expect(component.isFleetDayDetailModalOpen).toBe(false);
  });

  it('c) offline: the submit does not call the API', async () => {
    component.loadFleetMonthlyGrid();
    networkSpy = vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(false);
    await component.submitFleetMonthly();
    expect(api.submitFleetPeriod).not.toHaveBeenCalled();
    expect(component.offlineHint).toBeTruthy();
  });

  it('d) a trip save rejected with fleet_locked shows the message and reloads the grid', () => {
    component.loadFleetMonthlyGrid();
    api.updateVehicleDayTrip.mockReturnValue(throwError(() => ({ status: 400, error: { code: 'fleet_locked' } })));
    const row: any = { vehicle_id: 1, is_active: true, ownership_type: 'contract', default_rate: 1, days: [{ day: 1, date_shamsi: '1405/04/01', trip_count: 0, unit_rate: 0, total_amount: 0 }] };
    component.openFleetDayDetailModal(row, row.days[0]);
    component.fleetDayDetailTripCount = 1;
    api.getVehicleMonthlyGrid.mockClear();
    component.saveFleetDayDetail();
    expect(toast.show).toHaveBeenCalledWith('error', FLEET_LOCKED_FA);
    expect(api.getVehicleMonthlyGrid).toHaveBeenCalled();
  });
});
