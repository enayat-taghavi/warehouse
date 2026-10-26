// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { SupervisorNewProfilesHubComponent } from './supervisor-new-profiles';
import { PersonnelChangeRequest, VehicleChangeRequest } from '../../../../models/personnel.model';

describe('SupervisorNewProfilesHubComponent Unit & DOM Tests', () => {
  let component: SupervisorNewProfilesHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let wsSubject: Subject<any>;

  const mockCrPersonnel: PersonnelChangeRequest = {
    id: 111,
    personnel: 5,
    personnel_name: 'احمد حسینی',
    personnel_national_code: '0012345678',
    status: 'pending_supervisor',
    status_display: 'در انتظار تایید سرپرست',
    proposed_changes: { daily_base_wage: 4500000 },
    previous_values: { daily_base_wage: 3500000 },
    requested_by_name: 'کارمند انبار',
    created_at: '2026-09-21T10:00:00Z',
    updated_at: '2026-09-21T10:00:00Z'
  };

  const mockCrVehicle: VehicleChangeRequest = {
    id: 222,
    vehicle: 12,
    driver_name: 'رضا کمالی',
    plate_number: '12-345-67',
    status: 'pending_supervisor',
    status_display: 'در انتظار تایید سرپرست',
    proposed_changes: { default_service_rate: 1800000 },
    previous_values: { default_service_rate: 1500000 },
    requested_by_name: 'کارمند ترابری',
    created_at: '2026-09-21T11:00:00Z',
    updated_at: '2026-09-21T11:00:00Z'
  };

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_supervisor'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش دریافت', project: 1, is_active: true }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([
        { id: 1, first_name: 'علی', last_name: 'کریمی', approval_status: 'pending_supervisor' }
      ])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([
        { id: 2, plate_number: '33-444-55', approval_status: 'pending_supervisor' }
      ])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([mockCrPersonnel])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([mockCrVehicle])),
      approvePersonnelSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ message: 'عودت شد' })),
      approveVehicleSupervisor: vi.fn().mockReturnValue(of({ message: 'تایید شد' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'عودت شد' })),
      approvePersonnelChangeRequestSupervisor: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.' })),
      rejectPersonnelChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات رد شد.' })),
      approveVehicleChangeRequestSupervisor: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات خودرو به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.' })),
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات ناوگان رد شد.' })),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([]))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'change_requests', section_id: '10' }),
      snapshot: { queryParams: { tab: 'change_requests', section_id: '10' } }
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    component = new SupervisorNewProfilesHubComponent(
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

  it('1. should initialize with tab from route and load sections & profiles', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('change_requests');
    expect(component.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(mockPersonnelApi.getPersonnelChangeRequests).toHaveBeenCalledWith({ status: 'pending_supervisor' });
    expect(mockPersonnelApi.getVehicleChangeRequests).toHaveBeenCalledWith({ status: 'pending_supervisor' });
    expect(component.personnelChangeRequests.length).toBe(1);
    expect(component.vehicleChangeRequests.length).toBe(1);
    expect(component.statusCounters.change_requests).toBe(2);
  });

  it('2. should switch tab to change_requests and sync URL params', () => {
    component.ngOnInit();
    component.switchSubTab('change_requests');
    expect(component.activeSubTab).toBe('change_requests');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ tab: 'change_requests' })
    }));
  });

  it('3. should approve personnel change request and show toast & refresh', () => {
    component.ngOnInit();
    component.approvePersonnelChange(mockCrPersonnel);

    expect(mockPersonnelApi.approvePersonnelChangeRequestSupervisor).toHaveBeenCalledWith(111);
    expect(mockToast.success).toHaveBeenCalledWith('درخواست تغییرات به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.');
    expect(mockPersonnelApi.getPersonnelChangeRequests).toHaveBeenCalledTimes(2);
  });

  it('4. should reject personnel change request with reason prompt', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('دلیل عدم تطابق مزد روزانه');
    component.ngOnInit();
    component.rejectPersonnelChange(mockCrPersonnel);

    expect(mockPersonnelApi.rejectPersonnelChangeRequest).toHaveBeenCalledWith(111, 'دلیل عدم تطابق مزد روزانه');
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('5. should approve vehicle change request and refresh', () => {
    component.ngOnInit();
    component.approveVehicleChange(mockCrVehicle);

    expect(mockPersonnelApi.approveVehicleChangeRequestSupervisor).toHaveBeenCalledWith(222);
    expect(mockToast.success).toHaveBeenCalledWith('درخواست تغییرات خودرو به تایید سرپرست رسید و به کارتابل حسابداری ارسال شد.');
  });

  it('6. should reject vehicle change request with prompt', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('نرخ پیشنهادی نامتعارف است');
    component.ngOnInit();
    component.rejectVehicleChange(mockCrVehicle);

    expect(mockPersonnelApi.rejectVehicleChangeRequest).toHaveBeenCalledWith(222, 'نرخ پیشنهادی نامتعارف است');
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('7. should format change value and field label correctly in Persian', () => {
    expect(component.getFieldNameLabel('daily_base_wage')).toBe('مزد پایه روزانه');
    expect(component.getFieldNameLabel('plate_number')).toBe('پلاک انتظامی');
    expect(component.formatChangeValue('daily_base_wage', 4500000)).toContain('۴٬۵۰۰٬۰۰۰');
  });

  it('8. should refresh profiles when websocket notification is received', () => {
    component.ngOnInit();
    const initialCallCount = mockPersonnelApi.getPersonnelProfiles.mock.calls.length;

    wsSubject.next({ type_str: 'personnel_updated', section_id: 10 });

    expect(mockPersonnelApi.getPersonnelProfiles.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('9. should open Diff Modal and structure comparison rows correctly', () => {
    component.ngOnInit();
    component.openDiffModal(mockCrPersonnel, 'personnel');

    expect(component.isDiffModalOpen).toBe(true);
    expect(component.diffTargetType).toBe('personnel');
    expect(component.selectedDiffCR).toEqual(mockCrPersonnel);
    expect(component.diffFieldRows.length).toBeGreaterThan(0);

    const wageRow = component.diffFieldRows.find(r => r.field_name === 'daily_base_wage');
    expect(wageRow).toBeDefined();
    expect(wageRow?.field_label).toBe('مزد روزانه پایه');
    expect(wageRow?.old_value).toContain('۳٬۵۰۰٬۰۰۰');
    expect(wageRow?.new_value).toContain('۴٬۵۰۰٬۰۰۰');
    expect(wageRow?.is_changed).toBe(true);
  });
});
