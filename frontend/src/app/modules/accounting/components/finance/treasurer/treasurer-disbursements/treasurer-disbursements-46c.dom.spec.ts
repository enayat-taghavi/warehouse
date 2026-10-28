// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';

import { TreasurerDisbursementsComponent, TRACKING_CODE_REQUIRED_FA } from './treasurer-disbursements';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('TreasurerDisbursementsComponent (Release v1 step 4.6-c fleet periods)', () => {
  let fixture: ComponentFixture<TreasurerDisbursementsComponent>;
  let component: TreasurerDisbursementsComponent;
  let mockPersonnelApi: any;
  let networkSpy: any = null;

  const cartable = {
    ready_periods_count: 0,
    total_payroll_amount: 0,
    total_fleet_amount: 900,
    total_disbursement_queue: 900,
    periods: [],
    payrolls: [],
    trips: [],
    fleet_periods: [
      { id: 90, year_month: '1405/06', section_id: 10, section_name: 'بخش حمل', company_id: 1, total_payable: 900, trips_count: 3 }
    ]
  };

  beforeEach(async () => {
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getTreasuryCartable: vi.fn().mockReturnValue(of(cartable)),
      disburseTreasury: vi.fn().mockReturnValue(of({ message: 'ok' })),
      exportTreasuryDiskette: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    await TestBed.configureTestingModule({
      imports: [TreasurerDisbursementsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: vi.fn(), userPermissions: vi.fn().mockReturnValue([]) } },
        { provide: StateService, useValue: {} },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: WebSocketService, useValue: { documentChanges$: vi.fn().mockReturnValue(of()) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(TreasurerDisbursementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    networkSpy?.mockRestore();
    networkSpy = null;
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('a) renders one row per fleet period with section name and trips count', () => {
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="fleet-period-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('بخش حمل');
    expect(rows[0].textContent).toContain('شهریور');
  });

  it('b) paying requires a tracking code, then sends period_id', () => {
    component.openFleetPeriodModal(component.fleetPeriods[0]);
    component.submitBatchDisbursement();
    expect(mockPersonnelApi.disburseTreasury).not.toHaveBeenCalled();
    expect(component.batchTrackingCodeError).toBe(TRACKING_CODE_REQUIRED_FA);

    component.batchTrackingCode = 'TRK-9';
    component.submitBatchDisbursement();
    expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalledWith({
      action: 'disburse_fleet', period_id: 90, tracking_code: 'TRK-9'
    });
  });

  it('c) offline: the period pay button is disabled', () => {
    networkSpy = vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="fleet-period-row"] button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('d) shows the empty state when there are no fleet periods', () => {
    component.fleetPeriods = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="fleet-periods-empty"]')).not.toBeNull();
  });
});
