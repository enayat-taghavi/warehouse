// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SupervisorFleetHubComponent } from './supervisor-fleet';
import { VehicleDriverProfile } from '../../../../models/personnel.model';

describe('SupervisorFleetHubComponent Unit Tests (Phase 8)', () => {
  let component: SupervisorFleetHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;

  const sampleVehicle: VehicleDriverProfile = {
    id: 101,
    plate_number: '55-123-99',
    vehicle_type: 'pickup',
    vehicle_type_display: 'وانت بار',
    model_name: 'آریسان',
    driver_name: 'حسن رضایی',
    driver_phone: '09121112233',
    owner_name: 'شرکت ترابری',
    section: 5,
    approval_status: 'pending_supervisor',
    default_service_rate: 0,
    sheba_number: '123456789012345678901234'
  } as unknown as VehicleDriverProfile;

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 10, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_fleet_supervisor'])
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
      getMySections: vi.fn().mockReturnValue(of([{ id: 5, name: 'کارگاه ۱' }])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([sampleVehicle])),
      getVehicleMatrix: vi.fn().mockReturnValue(of({ vehicles: [] })),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([])),
      approveVehicleSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'عودت داده شد' })),
      rejectVehicle: vi.fn().mockReturnValue(of({ message: 'رد شد' })),
      getVehicleDeleteImpact: vi.fn().mockReturnValue(of({ can_delete: true, has_history: false, reasons: [] })),
      getVehicleBankAccounts: vi.fn().mockReturnValue(of([{ id: 1, bank_name: 'ملی', is_primary: true }])),
      getVehicleDocuments: vi.fn().mockReturnValue(of([{ id: 2, title: 'بیمه‌نامه' }])),
      batchApproveVehicles: vi.fn().mockReturnValue(of({ results: [{ id: 101, success: true }] })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['x']))),
      cancelVehicleChangeRequest: vi.fn().mockReturnValue(of({ message: 'لغو شد' }))
    };

    mockWs = {
      notifications$: of()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'new', section_id: '5' })
    };

    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    };

    component = new SupervisorFleetHubComponent(
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

  it('1. should query only pending_supervisor vehicles (excluding draft)', () => {
    component.selectedSectionId = 5;
    component.fetchFleetData();
    expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ approval_status: 'pending_supervisor', section_id: 5 })
    );
    expect(component.newVehiclesList.length).toBe(1);
    expect(component.statusCounters.newCount).toBe(1);
  });

  it('2. should open view vehicle modal and load bank accounts and documents', () => {
    component.openViewVehicleModal(sampleVehicle);
    expect(component.isViewVehicleModalOpen).toBe(true);
    expect(component.selectedViewVehicle?.id).toBe(101);
    expect(mockPersonnelApi.getVehicleBankAccounts).toHaveBeenCalledWith(101);
    expect(mockPersonnelApi.getVehicleDocuments).toHaveBeenCalledWith(101);
  });

  it('3. should check delete impact when opening reject modal and detect purge candidate', () => {
    component.openRejectModal('new', sampleVehicle, 'reject');
    expect(component.isRejectModalOpen).toBe(true);
    expect(mockPersonnelApi.getVehicleDeleteImpact).toHaveBeenCalledWith(101);
    expect(component.isPurgeCandidate).toBe(true);
  });

  it('4. should submit reject for purge candidate and show appropriate purge toast', () => {
    component.openRejectModal('new', sampleVehicle, 'reject');
    component.rejectReason = 'فاقد اصالت مدارک';
    component.submitReject();
    expect(mockPersonnelApi.rejectVehicle).toHaveBeenCalledWith(101, 'فاقد اصالت مدارک');
    expect(mockToast.showSuccess).toHaveBeenCalledWith(expect.stringContaining('پاک‌سازی (Purge)'));
    expect(component.isRejectModalOpen).toBe(false);
  });

  it('5. should submit revision with required reason', () => {
    component.openRejectModal('new', sampleVehicle, 'revision');
    component.rejectReason = 'پلاک ناخوانا است';
    component.submitReject();
    expect(mockPersonnelApi.requestVehicleRevision).toHaveBeenCalledWith(101, 'پلاک ناخوانا است');
    expect(mockToast.showSuccess).toHaveBeenCalled();
  });

  it('6. should approve vehicle supervisor and notify', () => {
    component.openApproveModal('new', sampleVehicle);
    component.approvalNote = 'رویت شد و تایید است';
    component.submitApproval();
    expect(mockPersonnelApi.approveVehicleSupervisor).toHaveBeenCalledWith(101, 'رویت شد و تایید است');
    expect(mockToast.showSuccess).toHaveBeenCalled();
  });

  it('7. should support batch approval of selected vehicles', () => {
    component.newVehiclesList = [sampleVehicle];
    component.toggleVehicleSelection(101);
    expect(component.isVehicleSelected(101)).toBe(true);

    component.openBatchApproveModal();
    expect(component.isBatchApproveModalOpen).toBe(true);
    component.batchApprovalNote = 'تایید گروهی سرپرست کارگاه';
    component.submitBatchApprove();

    expect(mockPersonnelApi.batchApproveVehicles).toHaveBeenCalledWith([101], 'supervisor', 'تایید گروهی سرپرست کارگاه');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.selectedVehicleIds.size).toBe(0);
    expect(component.isBatchApproveModalOpen).toBe(false);
  });

  it('8. should close open modals when Escape key is pressed', () => {
    component.openApproveModal('new', sampleVehicle);
    expect(component.isApprovalModalOpen).toBe(true);
    component.onEscapeKey();
    expect(component.isApprovalModalOpen).toBe(false);

    component.openViewVehicleModal(sampleVehicle);
    expect(component.isViewVehicleModalOpen).toBe(true);
    component.onEscapeKey();
    expect(component.isViewVehicleModalOpen).toBe(false);
  });

  it('9. should toggle select all and clear selection', () => {
    component.newVehiclesList = [sampleVehicle];
    component.toggleSelectAllVehicles({ target: { checked: true } });
    expect(component.isVehicleSelected(101)).toBe(true);

    component.toggleSelectAllVehicles({ target: { checked: false } });
    expect(component.selectedVehicleIds.size).toBe(0);
  });
});

