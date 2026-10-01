// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { ManagerFleetHubComponent } from './manager-fleet';
import { VehicleChangeRequest, VehicleDriverProfile } from '../../../../core/models/personnel.model';

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
      userPermissions: vi.fn().mockReturnValue(['can_act_as_company_manager', 'perm_approve_fleet_manager'])
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
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ success: true }))
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

  it('3. should open and submit approval for pending vehicle', () => {
    component.ngOnInit();
    const veh = component.newVehiclesList[0];
    component.openApproveModal('vehicle', veh);
    expect(component.isApprovalModalOpen).toBe(true);
    expect(component.approvalTarget?.type).toBe('vehicle');

    component.approvalNote = 'خودرو تایید نهایی شد';
    component.submitApproval();
    expect(mockPersonnelApi.approveVehicleManager).toHaveBeenCalledWith(veh.id, 'خودرو تایید نهایی شد');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isApprovalModalOpen).toBe(false);
  });

  it('4. should open and submit rejection for pending vehicle', () => {
    component.ngOnInit();
    const veh = component.newVehiclesList[0];
    component.openRejectModal(veh.id!, veh.plate_number, 'vehicle', 'reject');
    expect(component.isRejectModalOpen).toBe(true);

    component.rejectReason = 'بیمه‌نامه معتبر نیست';
    component.submitReject();
    expect(mockPersonnelApi.rejectVehicle).toHaveBeenCalledWith(veh.id, 'بیمه‌نامه معتبر نیست');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);
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
});
