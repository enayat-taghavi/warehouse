// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { ManagerFleetHubComponent } from './manager-fleet';
import { VehicleChangeRequest, VehicleDriverProfile } from '../../../../models/personnel.model';

describe('ManagerFleetHubComponent Unit Tests', () => {
  let component: ManagerFleetHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let wsSubject: Subject<any>;

  const mockVehicle: VehicleDriverProfile = {
    id: 101,
    company: 1,
    vehicle_type: 'khavar',
    plate_number: '12ع345-Iran68',
    driver_name: 'مرتضی احمدی',
    driver_national_code: '0055443322',
    owner_name: 'شرکت همگام',
    approval_status: 'pending_manager',
    default_service_rate: 15000000,
    is_active: true
  };

  const mockVehicleCR = {
    id: 401,
    vehicle: 101,
    vehicle_plate: '12ع345-Iran68',
    status: 'pending_manager',
    status_display: 'در انتظار تایید مدیر',
    proposed_changes: { daily_rate: 18000000 },
    previous_values: { daily_rate: 15000000 },
    requested_by_name: 'حسابدار انبار',
    created_at: '2026-09-22T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z'
  } as unknown as VehicleChangeRequest;

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'manager_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_manager_payment_authorize', 'perm_approve_fleet_manager'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'دفتر مرکزی' })
    };

    mockToast = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn()
    };

    mockPersonnelApi = {
      getProjectSections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'کارگاه خط لوله', project_name: 'پروژه جنوب' }
      ])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([mockVehicle])),
      // شکل واقعی پاسخ بک‌اند (fleet_settlement_engine): { summary, records }
      calculateFleetSettlement: vi.fn().mockReturnValue(of({
        summary: { total_vehicles_count: 1, active_contractor_count: 1, total_fleet_trips: 10, total_payable_settlement: 15000000 },
        records: [
          { plate_number: '12ع345-Iran68', driver_name: 'مرتضی احمدی', trip_count: 10, default_service_rate: 1500000, gross_amount: 15000000, payable_amount: 15000000, is_payable: true }
        ]
      })),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([mockVehicleCR])),
      approveVehicleManager: vi.fn().mockReturnValue(of({ success: true })),
      rejectVehicle: vi.fn().mockReturnValue(of({ success: true })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ success: true })),
      approveVehicleChangeRequestManager: vi.fn().mockReturnValue(of({ success: true })),
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ success: true })),
      getVehicleCostEstimate: vi.fn().mockReturnValue(of({
        vehicle_id: 101,
        plate_number: '12ع345-Iran68',
        driver_name: 'مرتضی احمدی',
        vehicle_type: 'khavar',
        ownership_type: 'contract',
        is_payable: true,
        daily_rate: 15000000,
        standard_days: 26,
        full_month_days: 30,
        monthly_cost_standard: 390000000,
        monthly_cost_full: 450000000,
        yearly_cost_standard: 4680000000,
        avg_daily_rate: 14000000,
        avg_monthly_cost: 364000000,
        deviation_percentage: 7,
        benchmark_count: 3
      })),
      getVehicleDeleteImpact: vi.fn().mockReturnValue(of({
        impact: [],
        total_affected: 0,
        history: { has_history: false, can_delete: true, reasons: [] },
        can_delete: true,
        has_history: false,
        reasons: []
      })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of(void 0)),
      endVehicleCollaboration: vi.fn().mockReturnValue(of({ message: 'همکاری خودرو پایان یافت.', data: mockVehicle }))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new', section_id: '10' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new ManagerFleetHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr
    );
  });

  it('1. should initialize with default subtab and load vehicles, settlements, and change requests', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');
    expect(mockPersonnelApi.getProjectSections).toHaveBeenCalled();
    expect(component.selectedSectionId).toBe(10);
    expect(component.newVehiclesList.length).toBe(1);
    expect(component.settlementItems.length).toBe(1);
    expect(component.changeRequests.length).toBe(1);
    expect(component.statusCounters.newPending).toBe(1);
    expect(component.statusCounters.settlementPending).toBe(1);
    expect(component.statusCounters.changesPending).toBe(1);
  });

  it('2. should switch subtabs properly and update url params', () => {
    component.ngOnInit();
    component.switchSubTab('settlement');
    expect(component.activeSubTab).toBe('settlement');
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('3. should open approval modal, fetch server cost estimate, and submit approval', () => {
    component.ngOnInit();
    const veh = component.newVehiclesList[0];
    component.openApproveModal('vehicle', veh);
    expect(component.isApprovalModalOpen).toBe(true);
    expect(component.approvalTarget?.type).toBe('vehicle');
    expect(mockPersonnelApi.getVehicleCostEstimate).toHaveBeenCalledWith(veh.id);
    expect(component.approvalCostEstimate).toBeTruthy();
    expect(component.getCostDeviationPercentage()).toBe(7);
    expect(component.getVehicleDailyRate()).toBe(15000000);
    expect(component.getVehicleMonthlyStandardCost()).toBe(390000000);
    expect(component.getVehicleYearlyStandardCost()).toBe(4680000000);
    expect(component.isVehiclePayable()).toBe(true);

    component.approvalNote = 'خودرو تایید نهایی شد';
    component.submitApproval();
    expect(mockPersonnelApi.approveVehicleManager).toHaveBeenCalledWith(veh.id, 'خودرو تایید نهایی شد');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isApprovalModalOpen).toBe(false);
  });

  it('4. should handle return to accountant vs final rejection in reject modal', () => {
    component.ngOnInit();
    const veh = component.newVehiclesList[0];

    // ۱. عودت به حسابدار
    component.openRejectModal(veh.id!, veh.plate_number, 'vehicle', 'revision');
    expect(component.isRejectModalOpen).toBe(true);
    expect(component.rejectActionType).toBe('return_to_accountant');

    component.rejectReason = 'نرخ بالاتر از عرف پروژه است';
    component.submitReject();
    expect(mockPersonnelApi.requestVehicleRevision).toHaveBeenCalledWith(veh.id, 'نرخ بالاتر از عرف پروژه است');
    expect(mockToast.showSuccess).toHaveBeenCalledWith('پرونده برای اصلاح به ثبت‌کننده عودت داده شد.');
    expect(component.isRejectModalOpen).toBe(false);

    // ۲. رد قطعی پرونده
    component.openRejectModal(veh.id!, veh.plate_number, 'vehicle', 'reject');
    expect(component.rejectActionType).toBe('reject_final');
    component.rejectReason = 'عدم انطباق شرایط فنی و ایمنی';
    component.submitReject();
    expect(mockPersonnelApi.rejectVehicle).toHaveBeenCalledWith(veh.id, 'عدم انطباق شرایط فنی و ایمنی');
    expect(mockToast.showSuccess).toHaveBeenCalledWith('پرونده خودرو رد شد.');
  });

  it('5. should open diff modal for vehicle change request', () => {
    component.ngOnInit();
    component.openDiffModal(mockVehicleCR);
    expect(component.isDiffModalOpen).toBe(true);
    expect(component.diffFieldRows.length).toBe(1);
    expect(component.diffFieldRows[0].field_name).toBe('daily_rate');
    expect(component.diffFieldRows[0].new_value).toBe(18000000);

    component.closeDiffModal();
    expect(component.isDiffModalOpen).toBe(false);
  });

  it('6. should react to real-time websocket updates', () => {
    component.ngOnInit();
    const fetchSpy = vi.spyOn(component, 'fetchFleetData');
    wsSubject.next({ type_str: 'vehicle_updated', data: { id: 101 } });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('7. should handle smart delete modal for vehicle without movement', () => {
    component.ngOnInit();
    const veh = mockVehicle;
    component.openDeleteModal(veh);
    expect(component.isDeleteModalOpen).toBe(true);
    expect(component.deleteTargetVehicle).toBe(veh);
    expect(mockPersonnelApi.getVehicleDeleteImpact).toHaveBeenCalledWith(veh.id);

    component.confirmDeleteVehicle();
    expect(mockPersonnelApi.deleteVehicleProfile).toHaveBeenCalledWith(veh.id);
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isDeleteModalOpen).toBe(false);
  });

  it('8. should handle end collaboration modal and submission', () => {
    component.ngOnInit();
    const veh = mockVehicle;
    component.openEndCollaborationModal(veh);
    expect(component.isEndCollaborationModalOpen).toBe(true);
    expect(component.endCollaborationTarget).toBe(veh);

    component.endCollaborationDate = '1405/07/20';
    component.endCollaborationReason = 'پایان پروژه و تسویه‌حساب نهایی';
    component.submitEndCollaboration();
    expect(mockPersonnelApi.endVehicleCollaboration).toHaveBeenCalledWith(
      veh.id,
      '1405/07/20',
      'پایان پروژه و تسویه‌حساب نهایی'
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isEndCollaborationModalOpen).toBe(false);
  });

  it('9. should correctly evaluate user permissions for delete and end collaboration', () => {
    expect(component.canEndCollaboration).toBe(true);
    expect(component.canDeleteVehicle).toBe(false);

    mockAuth.userPermissions.mockReturnValue(['perm_delete_vehicle_nomovement']);
    expect(component.canDeleteVehicle).toBe(true);
  });
});
