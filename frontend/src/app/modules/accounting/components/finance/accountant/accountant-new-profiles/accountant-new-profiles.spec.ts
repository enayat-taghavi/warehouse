// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { AccountantNewProfilesHubComponent } from './accountant-new-profiles';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  ProjectSection
} from '../../../../models/personnel.model';
import { generateShebaFromAccount } from '../../../../../../core/utils/sheba-utils';

describe('AccountantNewProfilesHubComponent Unit & DOM Tests', () => {
  let component: AccountantNewProfilesHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let mockActiveCompanyService: any;
  let wsSubject: Subject<any>;
  let companySubject: Subject<any>;

  const mockPersonnel: PersonnelProfile = {
    id: 938,
    first_name: 'مرتضی',
    last_name: 'منصوریان',
    national_code: '0075301989',
    section: 3,
    approval_status: 'pending_accountant',
    contract_type: 'daily',
    marital_status: 'married',
    job_title: 'کارگر',
    job_grade: '19',
    base_years_experience: 2,
    daily_base_wage: 6572696,
    daily_seniority_bonus: 171867,
    base_daily_rate: 6916430,
    hourly_rate: 691643,
    housing_allowance: 30000000,
    food_allowance: 22000000,
    spouse_allowance: 5000000,
    children_count: 1,
    bank_name: 'ملی ایران',
    account_number: '0101234567001',
    sheba_number: 'IR120170000000101234567001',
    is_active: true
  };

  const mockVehicle: VehicleDriverProfile = {
    id: 45,
    driver_name: 'بهرام رادان',
    plate_number: '21-789-10',
    vehicle_type: 'khavar',
    approval_status: 'pending_accountant',
    default_service_rate: 2500000,
    sheba_number: 'IR980120000000001234567890',
    is_active: true
  };

  const mockCrPersonnel: PersonnelChangeRequest = {
    id: 301,
    personnel: 938,
    personnel_name: 'مرتضی منصوریان',
    personnel_national_code: '0075301989',
    status: 'pending_accountant',
    status_display: 'در انتظار تایید حسابدار',
    proposed_changes: { daily_base_wage: 7000000, job_grade: '20' },
    previous_values: { daily_base_wage: 6572696, job_grade: '19' },
    requested_by_name: 'سرپرست کارگاه',
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z'
  };

  const mockCrVehicle: VehicleChangeRequest = {
    id: 401,
    vehicle: 45,
    driver_name: 'بهرام رادان',
    plate_number: '21-789-10',
    status: 'pending_accountant',
    status_display: 'در انتظار تایید حسابدار',
    proposed_changes: { default_service_rate: 2800000 },
    previous_values: { default_service_rate: 2500000 },
    requested_by_name: 'سرپرست ترابری',
    created_at: '2026-09-29T11:00:00Z',
    updated_at: '2026-09-29T11:00:00Z'
  };

  const mockSections: ProjectSection[] = [
    { id: 3, name: 'دالان کارگاه', code: 'SEC-01', project: 1, is_active: true },
    { id: 4, name: 'انبار مرکزی', code: 'SEC-02', project: 1, is_active: true }
  ];

  beforeEach(() => {
    wsSubject = new Subject<any>();
    companySubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 5, username: 'hesabdar_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_finance', 'view_sys_payroll'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getYearlySettings: vi.fn().mockReturnValue(of({
        year: '1405',
        monthly_housing_allowance: 30000000,
        monthly_food_allowance: 22000000,
        monthly_spouse_allowance: 5000000
      })),
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of(mockSections)),
      getPersonnelProfilesPage: vi.fn().mockReturnValue(of({ count: 1, next: null, previous: null, results: [mockPersonnel] })),
      getVehicleProfiles: vi.fn().mockReturnValue(of([mockVehicle])),
      getPersonnelChangeRequestsPage: vi.fn().mockReturnValue(of({ count: 1, next: null, previous: null, results: [mockCrPersonnel] })),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([mockCrVehicle])),
      approveVehicleFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی خودرو با موفقیت ثبت شد.' })),
      rejectVehicle: vi.fn().mockReturnValue(of({ message: 'پرونده خودرو رد شد.' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'پرونده خودرو عودت گردید.' })),
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات خودرو رد شد.' })),
      getJobGradeRate: vi.fn().mockReturnValue(of({
        grade: '20',
        daily_base_wage: 7100000,
        daily_seniority_bonus: 180000,
        hourly_rate: 746000
      })),
      updatePersonnelProfile: vi.fn().mockReturnValue(of({ message: 'پروفایل بروزرسانی شد.' })),
      approveVehicleChangeRequestFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی تغییرات ناوگان انجام شد.' }))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'personnel', section_id: '3' }),
      snapshot: { queryParams: { tab: 'personnel', section_id: '3' } }
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    mockActiveCompanyService = {
      activeCompany$: companySubject.asObservable()
    };

    component = new AccountantNewProfilesHubComponent(
      mockAuth,
      mockState,
      mockToast,
      mockPersonnelApi,
      mockWs,
      mockRouter,
      mockRoute,
      mockCdr,
      mockActiveCompanyService
    );
  });

  it('1. should initialize, load yearly settings, sections and profiles in section 3', () => {
    component.ngOnInit();

    expect(component.activeSubTab).toBe('personnel');
    expect(component.selectedSectionId).toBe(3);
    expect(mockPersonnelApi.getYearlySettings).toHaveBeenCalledWith('1405');
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
    expect(mockPersonnelApi.getPersonnelProfilesPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20, section_id: 3 }));
    expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalled();
    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenCalled();
    expect(mockPersonnelApi.getVehicleChangeRequests).toHaveBeenCalled();

    expect(component.personnelItems.length).toBe(1);
    expect(component.personnelItems[0].first_name).toBe('مرتضی');
    expect(component.statusCounters.personnelPending).toBe(1);
    expect(component.statusCounters.vehiclesPending).toBe(1);
    expect(component.statusCounters.changeRequestsPending).toBe(2);
    expect(component.statusCounters.allPending).toBe(4);
  });

  it('2. should switch tabs and navigate with updated queryParams', () => {
    component.ngOnInit();
    component.switchSubTab('vehicles');

    expect(component.activeSubTab).toBe('vehicles');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ tab: 'vehicles' })
    }));
  });

  it('3. personnel approve / reject actions are gone (engine my-tasks does them)', () => {
    const c: any = component;
    expect(c.approvePersonnelFinance).toBeUndefined();
    expect(mockPersonnelApi.approvePersonnelFinance).toBeUndefined();
  });

  it('4. should approve vehicle finance and display success toast', () => {
    component.ngOnInit();
    component.approveVehicleFinance(mockVehicle);

    expect(mockPersonnelApi.approveVehicleFinance).toHaveBeenCalledWith(45);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید مالی خودرو'));
  });

  it('5. should open financial editing modal and calculate base daily wage and hourly rate', () => {
    component.ngOnInit();
    component.openEditPersonnelModal(mockPersonnel);

    expect(component.isPersonnelModalOpen).toBe(true);
    expect(component.personnelModalTab).toBe('contract');
    expect(component.editingPersonnel).toBeDefined();
    expect(component.editingPersonnel?.job_grade).toBe('19');

    // Formula: daily_base_wage + (years * seniority) = 6572696 + (2 * 171867) = 6916430
    expect(component.editingPersonnel?.base_daily_rate).toBe(6916430);
    // Formula: base_daily_rate / 10 = 691643
    expect(component.editingPersonnel?.hourly_rate).toBe(691643);
  });

  it('6. should auto-fetch rates when job grade changes in financial modal', () => {
    component.ngOnInit();
    component.openEditPersonnelModal(mockPersonnel);

    component.onJobGradeChange('20');

    expect(mockPersonnelApi.getJobGradeRate).toHaveBeenCalledWith('20', '1405');
    expect(component.editingPersonnel?.daily_base_wage).toBe(7100000);
    expect(component.editingPersonnel?.daily_seniority_bonus).toBe(180000);
    // Base daily rate with 2 years: 7100000 + (2 * 180000) = 7460000
    expect(component.editingPersonnel?.base_daily_rate).toBe(7460000);
  });

  it('7. should save updated personnel profile with financial data', () => {
    component.ngOnInit();
    component.openEditPersonnelModal(mockPersonnel);
    component.editingPersonnel!.job_grade = '20';
    component.savePersonnel();

    expect(mockPersonnelApi.updatePersonnelProfile).toHaveBeenCalledWith(938, expect.objectContaining({
      job_grade: '20'
    }));
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('مشخصات و ارقام مالی'));
    expect(component.isPersonnelModalOpen).toBe(false);
  });

  it('8. should validate Sheba and auto-populate bank and account number', () => {
    component.ngOnInit();
    component.openEditPersonnelModal({ ...mockPersonnel, bank_name: '', account_number: '' });

    // Generate valid Sheba for Bank Melli
    const validSheba = generateShebaFromAccount('017', '101111111001');
    expect(validSheba).toBeTruthy();

    component.onShebaInput(validSheba);

    expect(component.shebaValidationResult?.isValid).toBe(true);
    expect(component.editingPersonnel?.sheba_number).toContain(validSheba);
    expect(component.editingPersonnel?.bank_name).toBe('بانک ملی ایران');
    expect(component.editingPersonnel?.account_number).toBe('101111111001');
  });

  it('9. should handle vehicle rejection and revision modal with mandatory reason', () => {
    component.ngOnInit();

    component.openRejectModal(45, '21-789-10', 'vehicle', 'revision');
    expect(component.isRejectModalOpen).toBe(true);

    component.rejectReason = '';
    component.submitRejectModal();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('علت'));
    expect(mockPersonnelApi.requestVehicleRevision).not.toHaveBeenCalled();

    component.rejectReason = 'مدارک خودرو ناخوانا است';
    component.submitRejectModal();
    expect(mockPersonnelApi.requestVehicleRevision).toHaveBeenCalledWith(45, 'مدارک خودرو ناخوانا است');
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
    expect(component.isRejectModalOpen).toBe(false);
  });

  it('10. should open Diff Viewer modal and compare change request rows', () => {
    component.ngOnInit();
    component.openDiffModal(mockCrPersonnel, 'personnel');

    expect(component.isDiffModalOpen).toBe(true);
    expect(component.selectedDiffCR).toEqual(mockCrPersonnel);
    expect(component.diffRows.length).toBe(2);

    const wageRow = component.diffRows.find(r => r.key === 'daily_base_wage');
    expect(wageRow).toBeDefined();
    expect(wageRow?.isDiff).toBe(true);
    expect(wageRow?.oldValue).toBe(6572696);
    expect(wageRow?.newValue).toBe(7000000);
  });

  it('11. personnel change requests are a paged read-only list (no approve action)', () => {
    component.ngOnInit();
    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }));
    expect(component.personnelChangeRequests.length).toBe(1);
    expect((component as any).approvePersonnelChangeRequestFinance).toBeUndefined();
  });

  it('11b. masked values are dropped from the payload when saving the financial modal', () => {
    component.ngOnInit();
    component.openEditPersonnelModal({ ...mockPersonnel, national_code: '00****1989', account_number: '1011****001' } as any);
    component.editingPersonnel!.job_grade = '20';
    component.savePersonnel();
    const payload = mockPersonnelApi.updatePersonnelProfile.mock.calls[0][1];
    expect(payload.job_grade).toBe('20');
    expect(payload.national_code).toBeUndefined();
    expect(payload.account_number).toBeUndefined();
  });

  it('11c. workflow error text: wrong_step and action_blocked with missing fields', () => {
    expect(component.workflowErrorText({ error: { code: 'wrong_step' } }, 'f')).toContain('کارهای من');
    const msg = component.workflowErrorText({ error: { code: 'action_blocked', error: 'ناقص', missing_fields: [{ field: 'a', label: 'کد شغل' }] } }, 'f');
    expect(msg).toContain('کد شغل');
  });

  it('12. should approve vehicle change request finance', () => {
    component.ngOnInit();
    component.approveChangeRequestFinance(mockCrVehicle);

    expect(mockPersonnelApi.approveVehicleChangeRequestFinance).toHaveBeenCalledWith(401);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید مالی'));
  });

  it('13. should react to real-time websocket message for matching section', () => {
    component.ngOnInit();
    const initialCallCount = mockPersonnelApi.getPersonnelProfilesPage.mock.calls.length;

    wsSubject.next({ type_str: 'personnel_updated', section_id: 3 });

    expect(mockPersonnelApi.getPersonnelProfilesPage.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
