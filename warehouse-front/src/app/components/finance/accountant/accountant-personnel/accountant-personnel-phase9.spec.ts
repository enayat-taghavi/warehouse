// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { AccountantPersonnelHubComponent } from './accountant-personnel';
import { PersonnelProfile } from '../../../../core/models/personnel.model';
import { generateShebaFromAccount } from '../../../../core/utils/sheba-utils';

describe('AccountantPersonnelHubComponent Phase 9 Tests', () => {
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

  const completePersonnel: PersonnelProfile = {
    id: 101,
    first_name: 'علیرضا',
    last_name: 'حیدری',
    national_code: '0075301989',
    section: 3,
    approval_status: 'pending_accountant',
    contract_type: 'daily',
    job_grade: '19',
    job_title: 'کارشناس حسابداری',
    job_code: '123456',
    base_years_experience: 3,
    daily_base_wage: 6572696,
    daily_seniority_bonus: 171867,
    base_daily_rate: 7088297,
    hourly_rate: 708830,
    contract_hours: 220,
    contract_base_salary: 155942534,
    housing_allowance: 30000000,
    food_allowance: 22000000,
    spouse_allowance: 5000000,
    children_count: 1,
    sheba_number: validSheba,
    bank_name: 'بانک ملی ایران',
    account_number: '101111111001',
    insurance_number: '1234567890',
    insurance_name: 'تامین اجتماعی'
  } as unknown as PersonnelProfile;

  const incompletePersonnel: PersonnelProfile = {
    id: 102,
    first_name: 'مهدی',
    last_name: 'صادقی',
    national_code: '0081234567',
    section: 3,
    approval_status: 'pending_accountant',
    daily_base_wage: 0,
    job_code: '', // نقص کد شغل
    sheba_number: '', // نقص شبا
    insurance_number: ''
  } as unknown as PersonnelProfile;

  beforeEach(() => {
    wsSubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 2, username: 'accountant_user' }),
      userPermissions: vi.fn().mockReturnValue(['view_sys_payroll', 'can_act_as_accountant'])
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
      getYearlySettings: vi.fn().mockReturnValue(of({ monthly_housing_allowance: 30000000, monthly_food_allowance: 22000000, monthly_spouse_allowance: 5000000 })),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([completePersonnel, incompletePersonnel])),
      getMonthlyPayrollRecords: vi.fn().mockReturnValue(of([])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([])),
      getJobTitles: vi.fn().mockReturnValue(of({
        job_titles: ['کارشناس حسابداری', 'کارگر انبار', 'راننده پایه یک'],
        items: [
          { title: 'کارشناس حسابداری', job_codes: ['123456', '123457'] },
          { title: 'کارگر انبار', job_codes: ['654321'] }
        ]
      })),
      approvePersonnelFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی صادر شد.' })),
      updatePersonnelProfile: vi.fn().mockReturnValue(of({ ...completePersonnel })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ message: 'رد شد' })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ message: 'عودت داده شد' })),
      batchApprovePersonnel: vi.fn().mockReturnValue(of({
        results: [{ id: 101, success: true }]
      })),
      getJobGradeRate: vi.fn().mockReturnValue(of({
        daily_base_wage: 7000000,
        daily_seniority_bonus: 180000,
        hourly_rate: 700000
      }))
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

  it('Task 9.1: should switch subtabs and synchronize URL params', () => {
    component.ngOnInit();
    expect(component.activeSubTab).toBe('new');

    component.switchSubTab('changes');
    expect(component.activeSubTab).toBe('changes');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ tab: 'changes' })
    }));
  });

  it('Task 9.2 / DEF-05: live calculator shows the server payroll-engine estimate, not a client formula', () => {
    vi.useFakeTimers();
    try {
      mockPersonnelApi.getPersonnelCostEstimate = vi.fn().mockReturnValue(of({
        real_hourly_rate: 708829.7, gross_salary: 201000000, total_insurable_salary_allowances: 187000000,
        employer_monthly_cost: 247000000, marital_allowance: 5000000, child_allowance: 0
      }));
      component.openEditPersonnelModal(completePersonnel);

      // مزد مبنا و نرخ ساعتی مبنا همچنان درجا نمایش داده می‌شوند
      expect(component.editingPersonnel?.base_daily_rate).toBe(7088297);
      expect(component.editingPersonnel?.hourly_rate).toBe(708830);

      // پیش از پاسخ سرور عدد ساختگی نمایش داده نمی‌شود
      expect(component.estimatedGrossSalary).toBeNull();

      vi.advanceTimersByTime(450);
      expect(mockPersonnelApi.getPersonnelCostEstimate).toHaveBeenCalledWith(
        completePersonnel.id,
        expect.objectContaining({ contract_hours: completePersonnel.contract_hours, contract_base_salary: completePersonnel.contract_base_salary })
      );
      expect(component.realHourlyRate).toBe(708829.7);
      expect(component.estimatedGrossSalary).toBe(201000000);
      // پایهٔ بیمه از موتور حقوق (همهٔ مزایای مشمول از جمله حق تأهل، با سقف)
      expect(component.estimatedInsuranceBase).toBe(187000000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Task 9.2: should update rates when job grade changes via onJobGradeChange', () => {
    component.openEditPersonnelModal(completePersonnel);
    component.onJobGradeChange('20');
    expect(mockPersonnelApi.getJobGradeRate).toHaveBeenCalledWith('20', '1405');
    expect(component.editingPersonnel?.daily_base_wage).toBe(7000000);
    expect(component.editingPersonnel?.base_daily_rate).toBe(7000000 + (3 * 180000));
  });

  it('Task 9.3: should edit identity & financial fields and attach accountant note in audit log payload', () => {
    component.openEditPersonnelModal(completePersonnel);
    component.setPersonnelTab('identity');
    expect(component.personnelModalTab).toBe('identity');

    if (component.editingPersonnel) {
      component.editingPersonnel.father_name = 'غلامعلی';
    }
    component.accountantNote = 'اصلاح نام پدر و تطبیق احکام قانون کار';

    component.savePersonnelFinancialChanges();
    expect(mockPersonnelApi.updatePersonnelProfile).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        father_name: 'غلامعلی',
        note: 'اصلاح نام پدر و تطبیق احکام قانون کار'
      })
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isPersonnelModalOpen).toBe(false);
  });

  it('Task 9.4: should load job titles, suggest 6-digit job codes and permit free manual editing', () => {
    component.ngOnInit();
    expect(mockPersonnelApi.getJobTitles).toHaveBeenCalled();
    expect(component.jobTitles.length).toBe(3);

    component.openEditPersonnelModal(completePersonnel);
    component.onJobTitleSelect('کارگر انبار');
    expect(component.editingPersonnel?.job_title).toBe('کارگر انبار');
    expect(component.availableJobCodes).toEqual(['654321']);
    expect(component.editingPersonnel?.job_code).toBe('654321');

    // ویرایش دستی آزادانه کد شغل
    component.selectJobCode('999888');
    expect(component.editingPersonnel?.job_code).toBe('999888');
  });

  it('Task 9.5: should lock send-to-manager if required fields are missing and enable if complete', () => {
    expect(component.canSendToManager(completePersonnel)).toBe(true);
    expect(component.canSendToManager(incompletePersonnel)).toBe(false);

    const missingSummary = component.getMissingFieldsSummary(incompletePersonnel);
    expect(missingSummary).toContain('شماره شبا (۲۴ رقم)');
    expect(missingSummary).toContain('کد ۶ رقمی شغل تامین اجتماعی');
  });

  it('Task 9.6: should allow choosing return destination in revision modal and send targetStatus', () => {
    component.openRejectModal(101, 'علیرضا حیدری', 'personnel', 'revision');
    expect(component.isRejectModalOpen).toBe(true);
    expect(component.revisionDestination).toBe('pending_supervisor');

    // تغییر مقصد به کارمند
    component.revisionDestination = 'revision_required';
    component.rejectReason = 'عدم تطابق شماره شبا با نام دارنده حساب';

    component.submitRejectModal();
    expect(mockPersonnelApi.requestPersonnelRevision).toHaveBeenCalledWith(
      101,
      'عدم تطابق شماره شبا با نام دارنده حساب',
      'revision_required'
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.isRejectModalOpen).toBe(false);
  });

  it('Task 9.7: should manage batch selection and execute batch approval workflow', () => {
    component.fetchData();
    expect(component.personnelItems.length).toBe(2);

    // انتخاب همه رکوردهای واجد شرایط (فقط ۱۰۱ واجد شرایط است، ۱۰۲ نقص دارد)
    component.toggleSelectAll();
    expect(component.selectedCount()).toBe(1);
    expect(component.isSelected(101)).toBe(true);
    expect(component.isSelected(102)).toBe(false);

    component.openBatchApprovalModal();
    expect(component.isBatchApprovalModalOpen).toBe(true);

    component.batchApprovalNote = 'تایید احکام کلیه نفرات این دوره کارگاهی';
    component.confirmBatchApproval();

    expect(mockPersonnelApi.batchApprovePersonnel).toHaveBeenCalledWith(
      [101],
      'finance',
      'تایید احکام کلیه نفرات این دوره کارگاهی'
    );
    expect(mockToast.showSuccess).toHaveBeenCalled();
    expect(component.selectedCount()).toBe(0);
    expect(component.isBatchApprovalModalOpen).toBe(false);
  });

  it('Task 9.8: should provide 1-click copy helper with transient visual feedback', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy }
    });

    component.copyField('IR123456789012345678901234', 'sh-101', 'شماره شبا');
    expect(writeTextSpy).toHaveBeenCalledWith('IR123456789012345678901234');
    expect(component.isFieldCopied('sh-101')).toBe(true);
    expect(mockToast.showSuccess).toHaveBeenCalledWith('شماره شبا در حافظه کپی شد: IR123456789012345678901234');
  });
});
