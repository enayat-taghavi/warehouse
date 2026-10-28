// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import {
  TreasurerDisbursementsComponent,
  TRACKING_CODE_REQUIRED_FA,
  TREASURY_OFFLINE_HINT_FA
} from './treasurer-disbursements';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('TreasurerDisbursementsComponent (Release v1 step 4.5-d DOM specs)', () => {
  let fixture: ComponentFixture<TreasurerDisbursementsComponent>;
  let component: TreasurerDisbursementsComponent;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockWs: any;
  let networkSpy: any = null;

  const cartable = {
    ready_periods_count: 1,
    ready_payrolls_count: 1,
    ready_trips_count: 0,
    total_payroll_amount: 100,
    total_fleet_amount: 0,
    total_disbursement_queue: 100,
    periods: [{ id: 40, year_month: '1405/06', status: 'READY_TO_PAY', manager_approved_at: null }],
    payrolls: [
      { id: 1, period: 40, period_year_month: '1405/06', personnel_name: 'علی', payable_amount: 100, payment_status: 'READY_TO_PAY' }
    ],
    trips: []
  };

  beforeEach(async () => {
    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getTreasuryCartable: vi.fn().mockReturnValue(of(cartable)),
      disburseTreasury: vi.fn().mockReturnValue(of({ message: 'ok' })),
      exportTreasuryDiskette: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    mockRouter = {
      navigate: vi.fn()
    };
    mockRoute = {
      queryParams: of({})
    };
    mockWs = {
      documentChanges$: vi.fn().mockReturnValue(of())
    };

    (window.URL as any).createObjectURL = vi.fn().mockReturnValue('blob:x');
    (window.URL as any).revokeObjectURL = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TreasurerDisbursementsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: vi.fn(), userPermissions: vi.fn().mockReturnValue([]) } },
        { provide: StateService, useValue: {} },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: WebSocketService, useValue: mockWs }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TreasurerDisbursementsComponent);
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

  it('f) openPeriodBatchModal(period) with empty batchTrackingCode then submitBatchDisbursement(): disburseTreasury not called, batchTrackingCodeError equals TRACKING_CODE_REQUIRED_FA and is rendered in DOM', () => {
    const period = { id: 40, year_month: '1405/06', status: 'READY_TO_PAY' };
    component.openPeriodBatchModal(period);

    expect(component.batchTrackingCode).toBe('');
    component.submitBatchDisbursement();

    expect(mockPersonnelApi.disburseTreasury).not.toHaveBeenCalled();
    expect(component.batchTrackingCodeError).toBe(TRACKING_CODE_REQUIRED_FA);

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(TRACKING_CODE_REQUIRED_FA);
  });

  it('g) with batchTrackingCode = "TRK-1", disburseTreasury returns error with code petty_settlement_changed: batchServerError contains MSG and modal stays open; with success payload has action: "disburse_period" and tracking_code: "TRK-1"', () => {
    const period = { id: 40, year_month: '1405/06', status: 'READY_TO_PAY' };
    component.openPeriodBatchModal(period);
    component.batchTrackingCode = 'TRK-1';

    const serverError = new HttpErrorResponse({
      status: 400,
      error: { code: 'petty_settlement_changed', error: 'MSG', detail: 'MSG' }
    });
    mockPersonnelApi.disburseTreasury.mockReturnValue(throwError(() => serverError));

    component.submitBatchDisbursement();

    expect(component.batchServerError).toContain('MSG');
    expect(component.batchModal).not.toBeNull();

    // Success flow
    mockPersonnelApi.disburseTreasury.mockReturnValue(of({ message: 'عملیات با موفقیت انجام شد' }));
    component.submitBatchDisbursement();

    expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalledWith(expect.objectContaining({
      action: 'disburse_period',
      tracking_code: 'TRK-1'
    }));
  });

  it('h) offline: submitBatchDisbursement() does not call disburseTreasury and component.batchServerError equals TREASURY_OFFLINE_HINT_FA', () => {
    const period = { id: 40, year_month: '1405/06', status: 'READY_TO_PAY' };
    component.openPeriodBatchModal(period);

    networkSpy = vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(false);

    component.submitBatchDisbursement();

    expect(mockPersonnelApi.disburseTreasury).not.toHaveBeenCalled();
    expect(component.batchServerError).toBe(TREASURY_OFFLINE_HINT_FA);
  });
});
