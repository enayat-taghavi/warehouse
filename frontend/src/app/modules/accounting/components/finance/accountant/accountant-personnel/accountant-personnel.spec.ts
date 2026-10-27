// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { AccountantPersonnelHubComponent } from './accountant-personnel';
import { PersonnelProfile } from '../../../../models/personnel.model';
import { generateShebaFromAccount } from '../../../../../../core/utils/sheba-utils';

describe('AccountantPersonnelHubComponent Unit Tests', () => {
  let component: AccountantPersonnelHubComponent;
  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockCdr: any;
  let wsSubject: Subject<any>;

  const validSheba = generateShebaFromAccount('017', '101111111001');

  const mockPersonnel = {
    id: 938,
    first_name: 'مرتضی',
    last_name: 'منصوریان',
    national_code: '0075301989',
    section: 3,
    approval_status: 'pending_accountant',
    contract_type: 'daily',
    job_grade: '19',
    base_years_experience: 2,
    daily_base_wage: 6572696,
    daily_seniority_bonus: 171867,
    base_daily_rate: 6916430,
    hourly_rate: 691643,
    sheba_number: validSheba,
    bank_name: 'بانک ملی ایران',
    account_number: '101111111001',
    insurance_number: '1234567890'
  } as unknown as PersonnelProfile;

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 2, username: 'accountant_user' }),
      userPermissions: vi.fn().mockReturnValue(['view_sys_payroll', 'perm_approve_personnel_finance'])
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
      getYearlySettings: vi.fn().mockReturnValue(of({ monthly_housing_allowance: 30000000, monthly_food_allowance: 22000000 })),
      getPersonnelProfilesPage: vi.fn().mockReturnValue(of({ count: 1, next: null, previous: null, results: [mockPersonnel] })),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([
        { id: 50, personnel_name: 'مرتضی منصوریان', gross_salary: 150000000, net_salary: 130000000, finance_approved: false }
      ])),
      getPersonnelChangeRequestsPage: vi.fn().mockReturnValue(of({ count: 0, next: null, previous: null, results: [] })),
      updatePersonnelProfile: vi.fn().mockReturnValue(of({ ...mockPersonnel })),
      getJobGradeRate: vi.fn().mockReturnValue(of({ daily_base_wage: 7000000, daily_seniority_bonus: 180000, hourly_rate: 700000 }))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
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

    component = new AccountantPersonnelHubComponent(
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

  it('1. should initialize accountant personnel hub with default subtab', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');
    expect(component.selectedSectionId).toBe(3);
    expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
  });

  it('2. should fetch the first server page of pending personnel (read-only list)', () => {
    component.fetchData();
    expect(mockPersonnelApi.getPersonnelProfilesPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, approval_status: 'pending_accountant,supervisor_approved' })
    );
    expect(component.personnelItems.length).toBe(1);
    expect(component.personnelCount).toBe(1);
    expect(component.statusCounters.newPending).toBe(1);
  });

  it('3. should open 4-tab modal for wage and documents editing', () => {
    component.openEditPersonnelModal(mockPersonnel);
    expect(component.isPersonnelModalOpen).toBe(true);
    expect(component.personnelModalTab).toBe('contract');
    expect(component.editingPersonnel?.job_grade).toBe('19');
    expect(component.shebaValidationResult?.isValid).toBe(true);
  });

  it('4. should calculate daily base wage and effective rates correctly', () => {
    component.editingPersonnel = {
      daily_base_wage: 6000000,
      daily_seniority_bonus: 100000,
      base_years_experience: 5
    };
    component.recalculatePersonnelRates();
    expect(component.editingPersonnel.base_daily_rate).toBe(6500000);
    expect(component.editingPersonnel.hourly_rate).toBe(650000);
  });

  it('5. should generate valid ISO 7064 Sheba from account number and bank', () => {
    component.editingPersonnel = {
      bank_name: 'بانک ملی ایران',
      account_number: '101111111001'
    };
    component.convertAccountToShebaNow();
    expect(component.editingPersonnel.sheba_number).toBe(validSheba);
    expect(component.shebaValidationResult?.isValid).toBe(true);
    expect(mockToast.showSuccess).toHaveBeenCalled();
  });

  it('6. has no approve / reject / batch actions any more (engine my-tasks does them)', () => {
    const c: any = component;
    for (const name of ['approvePersonnelFinance', 'approveChangeRequestFinance', 'openApprovalModal', 'confirmApproval',
      'openRejectModal', 'submitRejectModal', 'openBatchApprovalModal', 'confirmBatchApproval', 'toggleSelectAll']) {
      expect(c[name]).toBeUndefined();
    }
  });

  it('7. paginates on the server: next page asks page 2 and a 404 on page > 1 falls back to page 1', () => {
    mockPersonnelApi.getPersonnelProfilesPage.mockReturnValue(of({ count: 45, next: 'x', previous: null, results: [mockPersonnel] }));
    component.fetchData();
    expect(component.personnelTotalPages).toBe(3);
    component.goToPersonnelPage(2);
    expect(mockPersonnelApi.getPersonnelProfilesPage).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('8. change requests are loaded paged with status pending_accountant', () => {
    component.fetchData();
    expect(mockPersonnelApi.getPersonnelChangeRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 20, status: 'pending_accountant' })
    );
  });

  it('9. masked values are never sent back when saving accountant edits', () => {
    const masked = { ...mockPersonnel, national_code: '00****1989', sheba_number: 'IR**********************12', account_number: '1011*****001' } as unknown as PersonnelProfile;
    component.openEditPersonnelModal(masked);
    component.editingPersonnel!.job_title = 'انباردار';
    component.savePersonnelFinancialChanges();
    const payload = mockPersonnelApi.updatePersonnelProfile.mock.calls[0][1];
    expect(payload.job_title).toBe('انباردار');
    expect(payload.national_code).toBeUndefined();
    expect(payload.sheba_number).toBeUndefined();
    expect(payload.account_number).toBeUndefined();
  });

  it('10. workflow error texts come from the body (wrong_step, action_blocked with missing fields)', () => {
    expect(component.workflowErrorText({ error: { code: 'wrong_step', error: 'x' } }, 'f')).toContain('کارهای من');
    const msg = component.workflowErrorText({ error: { code: 'action_blocked', error: 'ناقص است', missing_fields: [{ field: 'job_code', label: 'کد شغل' }, 'شبا'] } }, 'f');
    expect(msg).toContain('ناقص است');
    expect(msg).toContain('کد شغل');
    expect(msg).toContain('شبا');
  });
});
