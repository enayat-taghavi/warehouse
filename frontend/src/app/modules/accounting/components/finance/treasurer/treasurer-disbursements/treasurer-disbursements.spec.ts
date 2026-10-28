// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { TreasurerDisbursementsComponent } from './treasurer-disbursements';

describe('TreasurerDisbursementsComponent — قابلیت‌های منتقل‌شده از کارتابل خزانه‌داری قدیمی', () => {
  let component: TreasurerDisbursementsComponent;
  let mockToast: any;
  let mockPersonnelApi: any;

  const cartable = {
    ready_periods_count: 1,
    ready_payrolls_count: 2,
    ready_trips_count: 2,
    total_payroll_amount: 300,
    total_fleet_amount: 50,
    total_disbursement_queue: 350,
    periods: [{ id: 40, year_month: '1405/06', status: 'READY_TO_PAY', manager_approved_at: null }],
    payrolls: [
      { id: 1, period: 40, period_year_month: '1405/06', personnel_name: 'علی', payable_amount: 100, payment_status: 'READY_TO_PAY' },
      { id: 2, period: 41, period_year_month: '1405/05', personnel_name: 'سارا', payable_amount: 200, payment_status: 'FAILED_SHEBA', payment_failure_reason: 'شبا نامعتبر' }
    ],
    fleet_periods: [{ id: 90, year_month: '1405/06', section_id: 10, section_name: 'S', company_id: 1, total_payable: 50, trips_count: 2 }],
    trips: [
      { id: 7, driver_name: 'رضا', plate_number: '11-111-11', total_amount: 20, is_settled: false },
      { id: 8, driver_name: 'حسن', plate_number: '22-222-22', total_amount: 30, is_settled: false }
    ]
  };

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getTreasuryCartable: vi.fn().mockReturnValue(of(cartable)),
      disburseTreasury: vi.fn().mockReturnValue(of({ message: 'ok' })),
      exportTreasuryDiskette: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    (window.URL as any).createObjectURL = vi.fn().mockReturnValue('blob:x');
    (window.URL as any).revokeObjectURL = vi.fn();

    component = new TreasurerDisbursementsComponent(
      {} as any, {} as any, mockToast, mockPersonnelApi,
      { navigate: vi.fn() } as any,
      { queryParams: of({}) } as any,
      { detectChanges: vi.fn() } as any
    );
    component.refreshData();
  });

  it('1. maps KPIs, ready periods, payroll period ids and failed SHEBA rows', () => {
    expect(component.treasurySummary.total_disbursement_queue).toBe(350);
    expect(component.readyPeriods.length).toBe(1);
    expect(component.currentPeriodId).toBe(40);
    const failed = component.items.find(x => x.id === 2)!;
    expect(failed.sheba_failed).toBe(true);
    expect(failed.failure_reason).toBe('شبا نامعتبر');
    expect(failed.period_id).toBe(41);
  });

  it('2. pays a whole period with tracking code and batch id', () => {
    component.openPeriodBatchModal(component.readyPeriods[0]);
    expect(component.batchModal?.amount).toBe(100);
    expect(component.batchIdValue).toBe('BATCH-140506-01');

    component.submitBatchDisbursement();
    expect(mockPersonnelApi.disburseTreasury).not.toHaveBeenCalled();
    expect(component.batchTrackingCodeError).toBeTruthy();

    component.batchTrackingCode = 'PAYA-777';
    component.submitBatchDisbursement();
    expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalledWith({
      action: 'disburse_period', tracking_code: 'PAYA-777', batch_id: 'BATCH-140506-01', period_id: 40
    });
    expect(component.batchModal).toBeNull();
  });

  it('3. pays one fleet period by period_id with a tracking code', () => {
    component.openFleetPeriodModal(component.fleetPeriods[0]);
    expect(component.batchModal?.periodId).toBe(90);
    expect(component.batchModal?.amount).toBe(50);
    component.batchTrackingCode = 'FLEET-1';
    component.submitBatchDisbursement();
    expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalledWith({
      action: 'disburse_fleet', period_id: 90, tracking_code: 'FLEET-1'
    });
  });

  it('4. downloads PAYA and SATNA diskettes per period', () => {
    component.downloadPeriodDiskette(component.readyPeriods[0], 'satna');
    expect(mockPersonnelApi.exportTreasuryDiskette).toHaveBeenCalledWith(40, 'satna');
    component.downloadPeriodDiskette(component.readyPeriods[0], 'paya');
    expect(mockPersonnelApi.exportTreasuryDiskette).toHaveBeenCalledWith(40, 'paya');
  });

  it('6. never shows another period\'s total when the period has no rows in the queue', () => {
    const notQueued = { id: 99, year_month: '1405/03', status: 'READY_TO_PAY' };
    expect(component.periodPayableAmount(notQueued)).toBeNull();
    component.openPeriodBatchModal(notQueued);
    expect(component.batchModal?.amount).toBeNull();
    expect(component.batchModal?.periodId).toBe(99);
  });

  it('7. flags a load error instead of showing an empty queue', () => {
    mockPersonnelApi.getTreasuryCartable.mockReturnValue(throwError(() => new Error('down')));
    component.refreshData();
    expect(component.loadError).toBe(true);
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('5. single payment sends the optional batch id', () => {
    const item = component.items.find(x => x.id === 1)!;
    component.openPayModal(item);
    component.trackingCodeInput = 'TRK-1';
    component.batchIdInput = 'B-9';
    component.confirmDisbursement();
    expect(mockPersonnelApi.disburseTreasury).toHaveBeenCalledWith({
      tracking_code: 'TRK-1', batch_id: 'B-9', action: 'disburse_single_payroll', payroll_id: 1
    });
  });

  it('8. defines responsive ergonomics tabs for pending queue and archive', () => {
    expect(component.tabs.length).toBe(2);
    expect(component.tabs[0].id).toBe('pending_queue');
    expect(component.tabs[0].shortLabel).toBe('صف');
    expect(component.tabs[1].id).toBe('disbursed_archive');
    expect(component.tabs[1].shortLabel).toBe('آرشیو');

    component.switchSubTab('disbursed_archive');
    expect(component.activeSubTab).toBe('disbursed_archive');
    component.switchSubTab('invalid_tab');
    expect(component.activeSubTab).toBe('disbursed_archive');
  });
});
