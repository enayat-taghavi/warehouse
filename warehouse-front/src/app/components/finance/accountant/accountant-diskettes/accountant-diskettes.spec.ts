// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AccountantDiskettesHubComponent } from './accountant-diskettes';

describe('AccountantDiskettesHubComponent — دوره، دامنه و فایل بانکی ناوگان', () => {
  let component: AccountantDiskettesHubComponent;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;

  beforeEach(() => {
    mockToast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockPersonnelApi = {
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({ years: ['1405'] })),
      getFinancialProjects: vi.fn().mockReturnValue(of([{ id: 7, name: 'پروژه ۷' }])),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([{ id: 1, period: 55 }])),
      exportBimehDisketteZip: vi.fn().mockReturnValue(of(new Blob(['x']))),
      exportFleetBankExcel: vi.fn().mockReturnValue(of(new Blob(['x'])))
    };
    mockRouter = { navigate: vi.fn() };
    (window.URL as any).createObjectURL = vi.fn().mockReturnValue('blob:x');
    (window.URL as any).revokeObjectURL = vi.fn();

    component = new AccountantDiskettesHubComponent(
      {} as any, {} as any, mockToast, mockPersonnelApi, mockRouter,
      { queryParams: of({ year: '1405', month: 'مرداد', wh: '26' }) } as any,
      { detectChanges: vi.fn() } as any
    );
  });

  it('1. resolves the calculated period for the selected month and scope', () => {
    component.ngOnInit();
    expect(mockPersonnelApi.getMonthlyPayrollRecords).toHaveBeenCalledWith({ year_month: '1405/05', warehouse_id: 26 });
    expect(component.currentPeriodId).toBe(55);
    expect(component.selectedProjectId).toBe(7);
  });

  it('2. changing the period reloads the period id', () => {
    component.ngOnInit();
    component.selectedMonth = 'شهریور';
    component.selectedWarehouseId = null;
    component.onPeriodChanged();
    expect(mockPersonnelApi.getMonthlyPayrollRecords).toHaveBeenLastCalledWith({ year_month: '1405/06' });
  });

  it('3. diskettes need a calculated period', () => {
    mockPersonnelApi.getMonthlyPayrollRecords.mockReturnValue(of([]));
    component.ngOnInit();
    component.generateSocialSecurityDiskette();
    expect(mockPersonnelApi.exportBimehDisketteZip).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('4. exports the fleet bank payment file for the selected period and scope', () => {
    component.ngOnInit();
    component.generateFleetBankExcel();
    expect(mockPersonnelApi.exportFleetBankExcel).toHaveBeenCalledWith(26, '1405/05');
    expect(mockToast.success).toHaveBeenCalled();
  });
});
