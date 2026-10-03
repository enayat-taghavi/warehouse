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
    ownership_type: 'contract',
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
      rejectVehicle: vi.fn().mockReturnValue(of({ message: 'رد شد' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'عودت داده شد' })),
      getVehicleRateBenchmark: vi.fn().mockReturnValue(of({
        vehicle_id: 55,
        vehicle_type: 'truck',
        project_name: 'پروژه دالان',
        count: 5,
        avg_rate: 14500000,
        min_rate: 12000000,
        max_rate: 18000000,
        current_rate: 15000000
      })),
      getVehicleBankAccounts: vi.fn().mockReturnValue(of([{ id: 10, is_primary: true, sheba_number: validSheba }])),
      batchApproveVehicles: vi.fn().mockReturnValue(of({ results: [{ id: 55, success: true }] })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['x'])))
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
    expect(mockPersonnelApi.getVehicleRateBenchmark).toHaveBeenCalledWith(55);
    expect(mockPersonnelApi.getVehicleBankAccounts).toHaveBeenCalledWith(55);
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

  // ─── آزمون‌های تکمیلی فاز ۹ (تسک‌های ۹.۲ تا ۹.۶) ───
  it('11. should enforce canSendToManager gate on vehicle rate and sheba', () => {
    const invalidVehicle = {
      ...mockVehicle,
      default_service_rate: 0,
      sheba_number: ''
    } as unknown as VehicleDriverProfile;

    expect(component.canSendToManager(invalidVehicle)).toBe(false);
    const missing = component.getMissingFieldsSummary(invalidVehicle);
    expect(missing).toContain('تعیین نرخ پایه سرویس');
    expect(missing).toContain('شماره شبا معتبر ۲۴ رقمی');

    // خودروی کامل باید تایید شود
    expect(component.canSendToManager(mockVehicle)).toBe(true);
  });

  it('12. should load rate benchmark data for peer vehicles in the project', () => {
    component.loadRateBenchmark(55);
    expect(mockPersonnelApi.getVehicleRateBenchmark).toHaveBeenCalledWith(55);
    expect(component.rateBenchmark?.avg_rate).toBe(14500000);
    expect(component.rateBenchmark?.count).toBe(5);
  });

  it('13. should support dual-destination revision (supervisor vs employee)', () => {
    component.openRejectModal(55, '12-345-67', 'vehicle', 'revision');
    expect(component.revisionDestination).toBe('supervisor');
    component.rejectReason = 'نیاز به بررسی میدانی کارکرد دارد';

    component.submitRejectModal();
    expect(mockPersonnelApi.requestVehicleRevision).toHaveBeenCalledWith(55, 'نیاز به بررسی میدانی کارکرد دارد', 'supervisor');

    // تغییر مقصد به کارمند
    component.openRejectModal(55, '12-345-67', 'vehicle', 'revision');
    component.revisionDestination = 'employee';
    component.rejectReason = 'اصلاح شماره شبا راننده';
    component.submitRejectModal();
    expect(mockPersonnelApi.requestVehicleRevision).toHaveBeenCalledWith(55, 'اصلاح شماره شبا راننده', 'employee');
  });

  it('14. should support batch approval for accountant stage on eligible vehicles', () => {
    component.newVehiclesList = [mockVehicle];
    component.toggleSelectAll();
    expect(component.selectedVehicleIds.has(55)).toBe(true);

    component.openBatchApprovalModal();
    expect(component.isBatchApprovalModalOpen).toBe(true);
    component.batchApprovalNote = 'تایید گروهی نرخ‌های قرارداد';
    component.confirmBatchApproval();

    expect(mockPersonnelApi.batchApproveVehicles).toHaveBeenCalledWith([55], 'finance', 'تایید گروهی نرخ‌های قرارداد');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.selectedVehicleIds.size).toBe(0);
    expect(component.isBatchApprovalModalOpen).toBe(false);
  });

  it('15. should auto-generate Sheba on account number input and bank select', () => {
    component.openEditVehicleModal({ ...mockVehicle, account_number: '', sheba_number: '' });
    expect(component.isVehicleModalOpen).toBe(true);

    component.editingVehicle!.bank_name = 'بانک ملی ایران';
    component.onAccountNumberInput('102222222002');

    expect(component.editingVehicle?.sheba_number).toBeTruthy();
    expect(component.shebaValidationResult?.isValid).toBe(true);
    expect(component.shebaDigitsDisplay).toContain('0170');
  });

  it('16. should close all open modals when Escape key is pressed', () => {
    component.openEditVehicleModal(mockVehicle);
    expect(component.isVehicleModalOpen).toBe(true);
    component.onApprovalEscape();
    expect(component.isVehicleModalOpen).toBe(false);

    component.openRejectModal(55, '12-345-67', 'vehicle', 'revision');
    expect(component.isRejectModalOpen).toBe(true);
    component.onApprovalEscape();
    expect(component.isRejectModalOpen).toBe(false);
  });
});
