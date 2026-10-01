// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { AccountantFleetHubComponent } from './accountant-fleet';
import { VehicleDriverProfile } from '../../../../core/models/personnel.model';
import { generateShebaFromAccount } from '../../../../core/utils/sheba-utils';

describe('AccountantFleetHubComponent Unit Tests', () => {
  let component: AccountantFleetHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  const validSheba = generateShebaFromAccount('017', '102222222002');

  const mockVehicle = {
    id: 55,
    plate_number: '12-345-67',
    vehicle_type: 'truck',
    model_name: 'ایسوزو ۶ تن',
    driver_name: 'اکبر کریمی',
    driver_mobile: '09120000000',
    owner_name: 'شرکت ترابری ستاره',
    section: 3,
    approval_status: 'pending_accountant',
    default_service_rate: 15000000,
    sheba_number: validSheba,
    bank_name: 'بانک ملی ایران',
    account_number: '102222222002'
  } as unknown as VehicleDriverProfile;

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 2, username: 'accountant_user' }),
      userPermissions: vi.fn().mockReturnValue(['view_sys_fleet_settlement', 'can_act_as_accountant'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 3, name: 'دالان کارگاه' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([mockVehicle])),
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({ years: ['1405', '1404'] })),
      // شکل واقعی پاسخ بک‌اند (fleet_settlement_engine): { summary, records }
      calculateFleetSettlement: vi.fn().mockReturnValue(of({
        summary: { total_vehicles_count: 2, active_contractor_count: 1, total_fleet_trips: 20, total_payable_settlement: 280000000 },
        records: [
          { plate_number: '12-345-67', driver_name: 'اکبر کریمی', trip_count: 20, gross_amount: 280000000, payable_amount: 280000000, is_payable: true },
          { plate_number: '98-765-43', driver_name: 'خودرو شرکتی', trip_count: 5, gross_amount: 0, payable_amount: 0, is_payable: false }
        ]
      })),
      exportFleetBankExcel: vi.fn().mockReturnValue(of(new Blob(['x']))),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      approveVehicleFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی ناوگان صادر شد.' })),
      approveVehicleChangeRequestFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی تغییرات ثبت شد.' })),
      updateVehicleProfile: vi.fn().mockReturnValue(of({ ...mockVehicle })),
      rejectVehicle: vi.fn().mockReturnValue(of({ message: 'رد شد' }))
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new', section_id: '3' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new AccountantFleetHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  it('1. should initialize accountant fleet hub with default subtab', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');
    expect(component.selectedSectionId).toBe(3);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
  });

  it('2. should fetch vehicles and count pending accountant items', () => {
    component.fetchFleetData();
    expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalled();
    expect(component.newVehiclesList.length).toBe(1);
    expect(component.statusCounters.newPending).toBe(1);
  });

  it('3. should open modal for vehicle service rate and bank editing', () => {
    component.openEditVehicleModal(mockVehicle);
    expect(component.isVehicleModalOpen).toBe(true);
    expect(component.editingVehicle?.default_service_rate).toBe(15000000);
    expect(component.shebaValidationResult?.isValid).toBe(true);
  });

  it('4. should approve vehicle finance and send to manager', () => {
    component.approveVehicleFinance(mockVehicle);
    expect(mockPersonnelApi.approveVehicleFinance).toHaveBeenCalledWith(55);
    expect(mockToast.showSuccess).toHaveBeenCalled();
  });

  it('5. should reject vehicle with valid reason', () => {
    component.openRejectModal(55, '12-345-67', 'vehicle', 'reject');
    expect(component.isRejectModalOpen).toBe(true);
    component.rejectReason = 'پلاک ناخواناست';

    component.submitRejectModal();
    expect(mockPersonnelApi.rejectVehicle).toHaveBeenCalledWith(55, 'پلاک ناخواناست');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);
  });

  // ─── قابلیت‌های منتقل‌شده از کارتابل مالی قدیمی ───
  it('6. should map real settlement response (summary/records) and count payable rows only', () => {
    component.fiscalYear = '1405';
    component.selectedMonth = 'شهریور';
    component.loadSettlement();
    expect(mockPersonnelApi.calculateFleetSettlement).toHaveBeenCalledWith(null, '1405/06');
    expect(component.settlementItems.length).toBe(2);
    expect(component.settlementSummary?.total_payable_settlement).toBe(280000000);
    expect(component.statusCounters.settlementPending).toBe(1);
  });

  it('7. should send settlement scope (warehouse) and period to the API', () => {
    component.fiscalYear = '1405';
    component.selectedMonth = 'تیر';
    component.selectedWarehouseId = 26;
    component.loadSettlement();
    expect(mockPersonnelApi.calculateFleetSettlement).toHaveBeenCalledWith(26, '1405/04');
  });

  it('8. should approve vehicle change request (finance stage) with optional note', () => {
    component.openApprovalModal(71, '12-345-67', 'vehicle_cr');
    expect(component.isApprovalModalOpen).toBe(true);
    component.approvalNote = 'نرخ کرایه بررسی شد';
    component.confirmApproval();
    expect(mockPersonnelApi.approveVehicleChangeRequestFinance).toHaveBeenCalledWith(71, 'نرخ کرایه بررسی شد');
    expect(component.isApprovalModalOpen).toBe(false);
  });

  it('9. should approve a new vehicle through the approval modal without a note', () => {
    component.openApprovalModal(55, '12-345-67', 'vehicle');
    component.confirmApproval();
    expect(mockPersonnelApi.approveVehicleFinance).toHaveBeenCalledWith(55);
  });

  it('10. should export fleet bank payment file for the selected period and scope', () => {
    const createUrl = vi.fn().mockReturnValue('blob:x');
    const revokeUrl = vi.fn();
    (window.URL as any).createObjectURL = createUrl;
    (window.URL as any).revokeObjectURL = revokeUrl;
    component.fiscalYear = '1405';
    component.selectedMonth = 'مرداد';
    component.exportFleetBankExcel();
    expect(mockPersonnelApi.exportFleetBankExcel).toHaveBeenCalledWith(null, '1405/05');
    expect(mockToast.showSuccess).toHaveBeenCalled();
  });
});
