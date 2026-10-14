// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { ManagerPersonnelHubComponent } from './manager-personnel';
import { PersonnelChangeRequest } from '../../../../../../core/models/personnel.model';

describe('ManagerPersonnelHubComponent Unit Tests', () => {
  let component: ManagerPersonnelHubComponent;
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
    id: 301,
    personnel: 12,
    personnel_name: 'رضا کاظمی',
    personnel_national_code: '0076543210',
    status: 'pending_manager',
    status_display: 'در انتظار تایید مدیر',
    proposed_changes: { daily_base_wage: 5000000 },
    previous_values: { daily_base_wage: 4000000 },
    requested_by_name: 'حسابدار ارشد',
    created_at: '2026-09-22T10:00:00Z',
    updated_at: '2026-09-22T10:00:00Z'
  };

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'manager_user' }),
      userPermissions: vi.fn().mockReturnValue(['can_act_as_company_manager', 'perm_approve_personnel_manager', 'perm_delete_personnel_nomovement'])
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
      getYearlySettings: vi.fn().mockReturnValue(of({
        fiscal_year: '1405',
        employer_insurance_rate: 20,
        unemployment_insurance_rate: 3,
        monthly_housing_allowance: 30000000,
        monthly_food_allowance: 22000000,
        monthly_spouse_allowance: 5000000
      })),
      getPersonnelProfiles: vi.fn().mockImplementation((params) => {
        if (params?.approval_status === 'pending_manager') {
          return of([
            {
              id: 201,
              first_name: 'سهراب',
              last_name: 'سپهری',
              national_code: '1234567890',
              approval_status: 'pending_manager',
              daily_base_wage: 6572696,
              base_daily_rate: 6572696,
              contract_type: 'daily',
              children_count: 1
            }
          ]);
        }
        return of([
          { id: 201, first_name: 'سهراب', last_name: 'سپهری', national_code: '1234567890', approval_status: 'approved', base_daily_rate: 6572696 },
          { id: 202, first_name: 'نیما', last_name: 'یوشیج', national_code: '9876543210', approval_status: 'approved', base_daily_rate: 6572696 }
        ]);
      }),
      getPersonnelContracts: vi.fn().mockReturnValue(of([
        { id: 501, personnel_name: 'سهراب سپهری', status: 'pending_manager', contract_no: 'CT-1405-01' }
      ])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([mockCrPersonnel])),
      approvePersonnelManager: vi.fn().mockReturnValue(of({ success: true })),
      approvePersonnelChangeRequestManager: vi.fn().mockReturnValue(of({ success: true })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ success: true })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ success: true })),
      getPersonnelDeleteImpact: vi.fn().mockReturnValue(of({
        can_delete: true,
        history: { has_history: false, can_delete: true, reasons: [] },
        impact: []
      })),
      deletePersonnelProfile: vi.fn().mockReturnValue(of(undefined)),
      getPersonnelCostEstimate: vi.fn().mockReturnValue(of({
        year_month: '1405/07', gross_salary: 250000000, employer_insurance: 40000000, unemployment_insurance: 6000000,
        employer_monthly_cost: 296000000, employer_insurance_rate: 20, unemployment_insurance_rate: 3,
        marital_allowance: 0, child_allowance: 16625549, total_insurable_salary_allowances: 200000000
      })),
      getCompanyPersonnelCostSummary: vi.fn().mockReturnValue(of({ personnel_count: 2, average_employer_monthly_cost: 250000000 })),
      endPersonnelCollaboration: vi.fn().mockReturnValue(of({ message: 'ok', data: { id: 201, is_active: false } }))
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

    component = new ManagerPersonnelHubComponent(
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

  it('1. should initialize with default subtab and load sections & data', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');
    expect(mockPersonnelApi.getProjectSections).toHaveBeenCalled();
    expect(mockPersonnelApi.getYearlySettings).toHaveBeenCalledWith('1405');
    expect(component.selectedSectionId).toBe(10);
    expect(component.pendingManagerList.length).toBe(1);
    expect(component.contractsList.length).toBe(2);
    expect(component.changeRequests.length).toBe(1);
    expect(component.allPersonnelList.length).toBe(2);
    expect(component.statusCounters.newPending).toBe(1);
  });

  it('2. should switch subtabs properly and update url params', () => {
    component.ngOnInit();
    component.switchSubTab('contracts');
    expect(component.activeSubTab).toBe('contracts');
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('2b. should expose ergonomic personnelSubTabs with required icons and counters', () => {
    component.ngOnInit();
    const tabs = component.personnelSubTabs;
    expect(tabs.length).toBe(4);
    expect(tabs.map(t => t.id)).toEqual(['new', 'contracts', 'changes', 'all']);
    expect(tabs[0].count).toBe(component.statusCounters.newPending);
    expect(tabs[2].count).toBe(component.statusCounters.changesPending);
    expect(tabs[3].count).toBe(component.statusCounters.allTotal);
    expect(tabs[0].icon).toBeDefined();
    expect(tabs[1].icon).toBeDefined();
    expect(tabs[2].icon).toBeDefined();
    expect(tabs[3].icon).toBeDefined();
  });

  it('3. should open and submit approval for pending personnel', () => {
    component.ngOnInit();
    const candidate = component.pendingManagerList[0];
    component.openApproveModal('new', candidate);
    expect(component.isApprovalModalOpen).toBe(true);
    expect(component.approvalTarget?.type).toBe('new');

    component.approvalNote = 'مورد تایید مدیریت است';
    component.submitApproval();
    expect(mockPersonnelApi.approvePersonnelManager).toHaveBeenCalledWith(candidate.id, 'مورد تایید مدیریت است');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isApprovalModalOpen).toBe(false);
  });

  it('4. should open and submit rejection or return to accountant for pending personnel (Task 10.2)', () => {
    component.ngOnInit();
    const candidate = component.pendingManagerList[0];

    // حالت ۱: عودت به حسابدار (پیش‌فرض)
    component.openRejectModal(candidate.id!, 'سهراب سپهری', 'personnel');
    expect(component.isRejectModalOpen).toBe(true);
    expect(component.rejectActionType).toBe('return_to_accountant');

    component.rejectReason = 'مدارک مالی و شبا مخدوش است';
    component.submitReject();
    expect(mockPersonnelApi.requestPersonnelRevision).toHaveBeenCalledWith(candidate.id, 'مدارک مالی و شبا مخدوش است', 'pending_accountant');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);

    // حالت ۲: رد قطعی
    component.openRejectModal(candidate.id!, 'سهراب سپهری', 'personnel');
    component.rejectActionType = 'reject_final';
    component.rejectReason = 'عدم تطابق با شرایط احراز شغل';
    component.submitReject();
    expect(mockPersonnelApi.rejectPersonnel).toHaveBeenCalledWith(candidate.id, 'عدم تطابق با شرایط احراز شغل');
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);
  });

  it('5. should open and inspect change request diff details', () => {
    component.ngOnInit();
    component.openDiffModal(mockCrPersonnel);
    expect(component.isDiffModalOpen).toBe(true);
    expect(component.diffFieldRows.length).toBe(1);
    expect(component.diffFieldRows[0].field_name).toBe('daily_base_wage');
    expect(component.diffFieldRows[0].new_value).toBe(5000000);

    component.closeDiffModal();
    expect(component.isDiffModalOpen).toBe(false);
  });

  it('6. should react to real-time websocket updates', () => {
    component.ngOnInit();
    const fetchSpy = vi.spyOn(component, 'fetchData');
    wsSubject.next({ type_str: 'personnel_updated', data: { id: 201 } });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('Task 10.1 / DEF-05: financial impact widget uses the server payroll-engine estimate and company average', () => {
    component.ngOnInit();
    const candidate = component.pendingManagerList[0];
    component.openApproveModal('new', candidate);
    expect(mockPersonnelApi.getPersonnelCostEstimate).toHaveBeenCalledWith(candidate.id);
    expect(mockPersonnelApi.getCompanyPersonnelCostSummary).toHaveBeenCalled();

    expect(component.getPersonnelGrossMonthly(candidate)).toBe(250000000);
    const insShare = component.getEmployerInsuranceShare(candidate);
    expect(insShare.totalRate).toBeCloseTo(0.23); // 20% employer + 3% unemployment
    expect(insShare.cost).toBe(46000000);
    expect(component.getTotalEmployerMonthlyCost(candidate)).toBe(296000000);
    expect(component.getTotalEmployerYearlyCost(candidate)).toBe(296000000 * 12);
    // میانگین از اندپوینت تجمیعی سرور، نه از فهرست بارشدهٔ صفحه (DEF-04)
    expect(component.getCompanyAverageMonthlyCost()).toBe(250000000);
    expect(component.getCostDeviationPercentage(candidate)).toBe(18);

    // پیش از رسیدن برآورد، عددی ساختگی نمایش داده نمی‌شود
    const other = component.allPersonnelList[1];
    expect(component.getPersonnelGrossMonthly(other)).toBeNull();
  });

  it('Task 10.3: should manage smart delete modal and execute delete for personnel without history', () => {
    component.ngOnInit();
    expect(component.canDeletePersonnel).toBe(true);

    const p = component.allPersonnelList[0];
    component.openDeleteModal(p);
    expect(component.isDeleteModalOpen).toBe(true);
    expect(mockPersonnelApi.getPersonnelDeleteImpact).toHaveBeenCalledWith(p.id);
    expect(component.deleteImpactHistory?.can_delete).toBe(true);

    component.confirmDeletePersonnel();
    expect(mockPersonnelApi.deletePersonnelProfile).toHaveBeenCalledWith(p.id);
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isDeleteModalOpen).toBe(false);
  });

  it('DEF-27: delete button needs the dedicated permission, not manager perms alone', () => {
    mockAuth.userPermissions.mockReturnValue(['can_act_as_company_manager', 'can_act_as_manager', 'perm_approve_personnel_manager']);
    expect(component.canDeletePersonnel).toBe(false);
    expect(component.canEndCollaboration).toBe(true);
  });

  it('DEF-18: end collaboration requires date and reason and calls the server action', () => {
    component.ngOnInit();
    const p = component.allPersonnelList[0];
    component.openEndCollaborationModal(p);
    component.submitEndCollaboration();
    expect(mockPersonnelApi.endPersonnelCollaboration).not.toHaveBeenCalled();
    expect(mockToast.showWarning).toHaveBeenCalled();

    component.endCollaborationDate = '1405/07/01';
    component.endCollaborationReason = 'پایان قرارداد';
    component.submitEndCollaboration();
    expect(mockPersonnelApi.endPersonnelCollaboration).toHaveBeenCalledWith(p.id, '1405/07/01', 'پایان قرارداد');
    expect(component.isEndCollaborationModalOpen).toBe(false);
  });

  it('Task 10.3: should block deletion when personnel has historical records', () => {
    mockPersonnelApi.getPersonnelDeleteImpact.mockReturnValue(of({
      can_delete: false,
      history: { has_history: true, can_delete: false, reasons: ['دارای ۲۵ روز کارکرد در ماه جاری'] },
      impact: [{ model_name: 'DailyAttendance', count: 25 }]
    }));

    component.ngOnInit();
    const p = component.allPersonnelList[0];
    component.openDeleteModal(p);
    expect(component.deleteImpactHistory?.can_delete).toBe(false);

    // دکمه تایید حذف نباید اجازه فراخوانی متد delete دهد
    component.confirmDeletePersonnel();
    expect(mockPersonnelApi.deletePersonnelProfile).not.toHaveBeenCalled();
  });
});
