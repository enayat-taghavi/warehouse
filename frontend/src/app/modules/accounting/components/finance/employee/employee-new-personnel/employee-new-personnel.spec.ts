// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeNewPersonnelHubComponent } from './employee-new-personnel';
import { of, throwError, Subject } from 'rxjs';
import { PersonnelProfile, ProjectSection } from '../../../../models/personnel.model';

describe('EmployeeNewPersonnelHubComponent Vitest Suite (Phase 5)', () => {
  let component: EmployeeNewPersonnelHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 101, name: 'بخش ابنیه', code: 'BLD', project: 1, project_name: 'پروژه مرکزی', is_active: true },
    { id: 102, name: 'بخش تاسیسات', code: 'MEC', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  const samplePersonnel: PersonnelProfile[] = [
    {
      id: 201,
      first_name: 'رضا',
      last_name: 'صادقی',
      full_name: 'رضا صادقی',
      national_code: '0010376488',
      father_name: 'حسین',
      job_title: 'کارگر ساده انبار',
      contract_type: 'daily',
      marital_status: 'single',
      daily_base_wage: 6500000,
      phone_number: '09121111111',
      bank_name: 'بانک ملی ایران',
      sheba_number: 'IR780170000000101111111001',
      account_number: '101111111001',
      children_count: 0,
      section: 101,
      approval_status: 'draft',
      is_active: true
    },
    {
      id: 202,
      first_name: 'احمد',
      last_name: 'کریمی',
      full_name: 'احمد کریمی',
      national_code: '0023456789',
      father_name: 'محمود',
      job_title: 'اپراتور لیفتراک',
      contract_type: 'hourly',
      marital_status: 'married',
      daily_base_wage: 8000000,
      phone_number: '09122222222',
      bank_name: 'بانک صادرات ایران',
      children_count: 2,
      section: 101,
      approval_status: 'approved',
      is_active: true
    },
    {
      id: 203,
      first_name: 'مهدی',
      last_name: 'نوری',
      full_name: 'مهدی نوری',
      national_code: '0034567890',
      job_title: 'کمک انباردار',
      contract_type: 'monthly',
      marital_status: 'married',
      daily_base_wage: 10000000,
      phone_number: '09123333333',
      children_count: 1,
      section: 101,
      approval_status: 'pending_supervisor',
      is_active: true
    }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'test_emp', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getPersonnelProfiles: vi.fn().mockReturnValue(of(samplePersonnel)),
      getJobTitles: vi.fn().mockReturnValue(of({ job_titles: ['کارگر ساده انبار', 'اپراتور لیفتراک', 'راننده'] })),
      lookupPersonnelByNationalCode: vi.fn().mockReturnValue(of({ found: false })),
      createPersonnelProfile: vi.fn().mockImplementation((data: any) => of({ id: 204, ...data })),
      updatePersonnelProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deletePersonnelProfile: vi.fn().mockReturnValue(of({ success: true })),
      submitPersonnelProfile: vi.fn().mockImplementation((id: number) => of({ id, approval_status: 'pending_supervisor' })),
      getPersonnelDocuments: vi.fn().mockReturnValue(of([])),
      uploadPersonnelDocument: vi.fn().mockImplementation((id: number, file: any, doc_type: string) => of({ id: 1, file: 'url', doc_type })),
      deletePersonnelDocument: vi.fn().mockReturnValue(of({ success: true })),
      getPersonnelBankAccounts: vi.fn().mockReturnValue(of([])),
      addPersonnelBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id: 1, ...data })),
      updatePersonnelBankAccount: vi.fn().mockImplementation((id: number, accId: number, data: any) => of({ id: accId, ...data })),
      deletePersonnelBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      exportPersonnelExcel: vi.fn().mockReturnValue(of(new Blob(['fake excel content']))),
      importPersonnelExcel: vi.fn().mockReturnValue(of({ message: 'درون‌ریزی پرسنل با موفقیت انجام شد', created_count: 5, updated_count: 2 })),
      downloadPersonnelTemplate: vi.fn().mockReturnValue(of(new Blob(['fake template content']))),
      importPersonnelExcelModal: vi.fn().mockReturnValue(of({
        success: true,
        dry_run: false,
        summary: { total_rows: 7, created: 5, updated: 2, skipped: 0, valid_count: 7, error_count: 0 },
        created_count: 5,
        updated_count: 2
      }))
    };

    mockWs = {
      notifications$: new Subject<any>(),
      connected$: of(true)
    };

    mockToast = {
      show: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({ section_id: '101' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeNewPersonnelHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockWs,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
  });

  describe('۱. راه‌اندازی و ایزولاسیون بخش (Guardian G1: Section Isolation)', () => {
    it('باید بخش‌های مجاز کارمند را بارگذاری کرده و بخش اول را به عنوان پیش‌فرض انتخاب کند', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(component.mySections.length).toBe(2);
      expect(component.selectedSectionId).toBe(101);
      expect(component.selectedSection?.name).toBe('بخش ابنیه');
    });

    it('باید لیست پرسنل بخش جاری را با ارسال section_id اجباری بارگذاری کند', () => {
      component.selectedSectionId = 101;
      component.loadRecentPersonnel();
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ section_id: 101 });
      expect(component.recentPersonnel.length).toBe(3);
    });

    it('در صورت تغییر بخش، باید URL را همگام کرده و پرسنل بخش جدید را دریافت کند', () => {
      component.mySections = sampleSections;
      component.selectedSectionId = 102;
      component.onSectionChanged();

      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { section_id: 102 },
        queryParamsHandling: 'merge'
      });
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ section_id: 102 });
      expect(component.selectedSection?.name).toBe('بخش تاسیسات');
    });

    it('isLoading باید هنگام بارگذاری بخش یا پرسنل true باشد', () => {
      component.isLoadingSections = true;
      component.isLoadingPersonnel = false;
      expect(component.isLoading).toBe(true);

      component.isLoadingSections = false;
      component.isLoadingPersonnel = true;
      expect(component.isLoading).toBe(true);

      component.isLoadingPersonnel = false;
      expect(component.isLoading).toBe(false);
    });
  });

  describe('۲. اعتبارسنجی آنلاین شماره شبا و تشخیص بانک', () => {
    it('شماره شبای خالی باید نتیجه اعتبارسنجی را null کند', () => {
      component.newPersonnel.sheba_number = '';
      component.onShebaChange();
      expect(component.shebaValidationResult).toBeNull();
    });

    it('شماره شبای معتبر بانک ملی را باید تایید و بانک را استخراج کند', () => {
      // شبا استاندارد ۲۴ رقمی بانک ملی (کد ۰۱۷)
      component.newPersonnel.sheba_number = 'IR780170000000101111111001';
      component.onShebaChange();

      expect(component.shebaValidationResult).toBeDefined();
      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.shebaValidationResult?.bank?.name).toContain('ملی');
      expect(component.newPersonnel.bank_name).toContain('ملی');
      expect(component.newPersonnel.account_number).toBe('101111111001');
    });

    it('onShebaInput باید ارقام شبا را تفکیک و فرمت‌بندی کرده و بانک را تشخیص دهد', () => {
      component.onShebaInput({ target: { value: '780170000000101111111001' } });

      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.shebaDigitsDisplay).toContain('78');
      expect(component.newPersonnel.sheba_number).toBe('IR780170000000101111111001');
      expect(component.newPersonnel.bank_name).toContain('ملی');
      expect(component.newPersonnel.account_number).toBe('101111111001');
    });

    it('copyShebaToClipboard باید ارقام شبا را در کلیپ‌بورد کپی کرده و پیام تایید نمایش دهد', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined)
        }
      });
      component.newPersonnel.sheba_number = 'IR780170000000101111111001';
      component.copyShebaToClipboard();
      await Promise.resolve();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('780170000000101111111001');
      expect(component.isShebaCopied).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('کپی شد'));
    });

    it('شماره شبای معتبر با ارقام فارسی باید نرمال‌سازی شده و تایید گردد', () => {
      // شبا بانک ملی با ارقام فارسی و پیشوند کوچک: ir۷۸۰۱۷۰۰۰۰۰۰۰۱۰۱۱۱۱۱۱۱۰۰۱
      component.newPersonnel.sheba_number = 'ir۷۸۰۱۷۰۰۰۰۰۰۰۱۰۱۱۱۱۱۱۱۰۰۱';
      component.onShebaChange();

      expect(component.newPersonnel.sheba_number).toBe('IR780170000000101111111001');
      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.newPersonnel.bank_name).toContain('ملی');
    });

    it('شماره شبای نامعتبر باید پیام خطا ثبت کند', () => {
      component.newPersonnel.sheba_number = 'IR000000000000000000000000';
      component.onShebaChange();

      expect(component.shebaValidationResult?.isValid).toBe(false);
      expect(component.shebaValidationResult?.errorMessage).toBeTruthy();
    });
  });

  describe('۳. اعتبارسنجی الگوریتم ۱۰ رقمی کد ملی (Mod 11)', () => {
    it('کد ملی کمتر یا بیشتر از ۱۰ رقم باید خطای طول بدهد', () => {
      component.newPersonnel.national_code = '12345';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('۱۰ رقم');

      component.newPersonnel.national_code = '012345678901';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('۱۰ رقم');
    });

    it('کد ملی با ارقام تکراری یکسان باید خطا برگرداند', () => {
      component.newPersonnel.national_code = '1111111111';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('ارقام تکراری');
    });

    it('کد ملی معتبر با چکسام درست باید خطایی تولید نکند', () => {
      component.newPersonnel.national_code = '0010376488';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toBeNull();
    });

    it('کد ملی معتبر با ارقام فارسی باید نرمال‌سازی شده و تایید گردد', () => {
      component.newPersonnel.national_code = '۰۰۱۰۳۷۶۴۸۸';
      component.onNationalCodeChange();
      expect(component.newPersonnel.national_code).toBe('0010376488');
      expect(component.nationalCodeError).toBeNull();
    });

    it('کد ملی با چکسام نامعتبر باید خطای رقم کنترلی بدهد', () => {
      component.newPersonnel.national_code = '0010376489';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('خطای رقم کنترلی');
    });

    it('خالی بودن کد ملی باید خطا را پاک کند', () => {
      component.newPersonnel.national_code = '';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toBeNull();
    });
  });

  describe('۴. تحمیل وضعیت پیش‌نویس و ثبت پرسنل جدید (Guardian G2: Draft Invariant)', () => {
    it('در صورت عدم انتخاب بخش، باید هشدار دهد و ارسال را متوقف کند', () => {
      component.selectedSectionId = null;
      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('یک بخش را انتخاب کنید'));
      expect(mockPersonnelApi.createPersonnelProfile).not.toHaveBeenCalled();
    });

    it('در صورت خالی بودن نام یا نام خانوادگی، باید هشدار دهد', () => {
      component.selectedSectionId = 101;
      component.newPersonnel.first_name = '';
      component.newPersonnel.last_name = 'محمدی';
      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('نام و نام خانوادگی'));

      component.newPersonnel.first_name = 'علی';
      component.newPersonnel.last_name = '';
      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('نام و نام خانوادگی'));
    });

    it('در صورت نامعتبر بودن کد ملی، باید مانع ارسال فرم شود', () => {
      component.selectedSectionId = 101;
      component.newPersonnel.first_name = 'علی';
      component.newPersonnel.last_name = 'محمدی';
      component.newPersonnel.national_code = '111';
      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('کد ملی ۱۰ رقمی'));

      component.newPersonnel.national_code = '1111111111';
      component.onNationalCodeChange();
      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('ارقام تکراری'));
    });

    it('در صورت نامعتبر بودن شبا، باید مانع ارسال فرم شود', () => {
      component.selectedSectionId = 101;
      component.newPersonnel.first_name = 'علی';
      component.newPersonnel.last_name = 'محمدی';
      component.newPersonnel.national_code = '0010376488';
      component.nationalCodeError = null;
      component.shebaValidationResult = {
        isValid: false,
        errorMessage: 'الگوریتم شبا نامعتبر است',
        rawSheba: '',
        shebaDigitsOnly: '',
        accountNumber: '',
        formattedDigits: '',
        formattedSheba: '',
        bank: null
      };

      component.savePersonnelDraft();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('الگوریتم شبا نامعتبر است'));
      expect(mockPersonnelApi.createPersonnelProfile).not.toHaveBeenCalled();
    });

    it('باید پرسنل را به طور قطعی با approval_status="draft" و section_id فعال ثبت کند (Guardian G2)', () => {
      component.selectedSectionId = 101;
      component.newPersonnel = {
        first_name: 'علی',
        last_name: 'محمدی',
        national_code: '0010376488',
        father_name: 'حسین',
        job_title: 'کارگر انبار',
        contract_type: 'daily',
        marital_status: 'married',
        children_count: 2,
        daily_base_wage: 7000000,
        phone_number: '09121234567',
        bank_name: 'بانک ملی',
        account_number: '123456',
        sheba_number: 'IR780170000000101111111001',
        is_active: true,
        approval_status: 'draft'
      };
      component.shebaValidationResult = { isValid: true } as any;
      component.nationalCodeError = null;

      component.savePersonnelDraft();

      expect(mockPersonnelApi.createPersonnelProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'علی',
          last_name: 'محمدی',
          national_code: '0010376488',
          children_count: 2,
          section: 101,
          approval_status: 'draft'
        })
      );
      // دستمزد از فرم کارمند فرستاده نمی‌شود (SoD مصوب ۶.۹، DEF-21) و وضعیت/فعال‌بودن فقط‌خواندنی سرور است
      const createPayload = mockPersonnelApi.createPersonnelProfile.mock.calls[0][0];
      expect(createPayload).not.toHaveProperty('daily_base_wage');
      expect(createPayload).not.toHaveProperty('is_active');
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس ثبت شد'));
    });

    it('پس از ثبت موفق، فرم باید ریست شده و لیست پرسنل نوسازی شود', () => {
      component.selectedSectionId = 101;
      component.newPersonnel.first_name = 'محسن';
      component.newPersonnel.last_name = 'قاسمی';
      component.newPersonnel.national_code = '0010376488';
      component.nationalCodeError = null;

      component.savePersonnelDraft();

      expect(component.newPersonnel.first_name).toBe('');
      expect(component.newPersonnel.last_name).toBe('');
      expect(component.newPersonnel.approval_status).toBe('draft');
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ section_id: 101 });
    });
  });

  describe('۵. فیلترها و جستجوی کارتابل پرسنل', () => {
    beforeEach(() => {
      component.recentPersonnel = [...samplePersonnel];
    });

    it('جستجوی متنی باید بر اساس نام، نام خانوادگی، کد ملی، عنوان شغلی یا شماره تماس فیلتر کند', () => {
      component.searchQuery = 'صادقی';
      expect(component.filteredPersonnel.length).toBe(1);
      expect(component.filteredPersonnel[0].first_name).toBe('رضا');

      component.searchQuery = '0023456789';
      expect(component.filteredPersonnel.length).toBe(1);
      expect(component.filteredPersonnel[0].last_name).toBe('کریمی');

      component.searchQuery = 'لیفتراک';
      expect(component.filteredPersonnel.length).toBe(1);

      component.searchQuery = '09123333333';
      expect(component.filteredPersonnel.length).toBe(1);
      expect(component.filteredPersonnel[0].last_name).toBe('نوری');
    });

    it('فیلتر وضعیت باید صرفاً رکوردهای وضعیت تعیین‌شده را بازگرداند', () => {
      component.statusFilter = 'draft';
      expect(component.filteredPersonnel.length).toBe(1);
      expect(component.filteredPersonnel[0].approval_status).toBe('draft');

      component.statusFilter = 'approved';
      expect(component.filteredPersonnel.length).toBe(1);
      expect(component.filteredPersonnel[0].approval_status).toBe('approved');

      component.statusFilter = 'all';
      expect(component.filteredPersonnel.length).toBe(3);
    });
  });

  describe('۶. شاخص‌های آماری پرسنل (KPI Metrics)', () => {
    it('باید مقادیر صحیح شاخص‌ها را محاسبه کند', () => {
      component.recentPersonnel = [...samplePersonnel];
      const m = component.personnelMetrics;

      expect(m.total).toBe(3);
      expect(m.drafts).toBe(1); // صادقی (draft)
      expect(m.approved).toBe(1); // کریمی (approved)
      expect(m.dailyCount).toBe(1); // صادقی (daily)
    });
  });

  describe('۷. حذف پیش‌نویس پرسنل', () => {
    it('پرسنل غیرپیش‌نویس نباید توسط کارمند حذف شوند', () => {
      const approvedPerson: PersonnelProfile = {
        id: 202,
        first_name: 'احمد',
        last_name: 'کریمی',
        national_code: '0023456789',
        contract_type: 'hourly',
        marital_status: 'married',
        children_count: 2,
        daily_base_wage: 8000000,
        job_title: 'اپراتور',
        approval_status: 'approved',
        is_active: true
      };

      component.deleteDraftPersonnel(approvedPerson);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط پرونده‌های در وضعیت پیش‌نویس'));
      expect(mockPersonnelApi.deletePersonnelProfile).not.toHaveBeenCalled();
    });

    it('پرسنل پیش‌نویس در صورت تایید کاربر باید حذف شوند', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const draftPerson: PersonnelProfile = {
        id: 201,
        first_name: 'رضا',
        last_name: 'صادقی',
        national_code: '0010376488',
        contract_type: 'daily',
        marital_status: 'single',
        children_count: 0,
        daily_base_wage: 6500000,
        job_title: 'کارگر',
        approval_status: 'draft',
        is_active: true
      };

      component.deleteDraftPersonnel(draftPerson);
      expect(mockPersonnelApi.deletePersonnelProfile).toHaveBeenCalledWith(201);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('حذف گردید'));
    });
  });

  describe('۸. توابع کمکی و تبدیل تومان', () => {
    it('wageInTomans باید ریال را بر ۱۰ تقسیم کرده و به تومان تبدیل کند', () => {
      component.newPersonnel.daily_base_wage = 6500000;
      expect(component.wageInTomans).toBe(650000);

      component.newPersonnel.daily_base_wage = 0;
      expect(component.wageInTomans).toBe(0);
    });

    it('formatNumber باید اعداد را به ارقام فارسی تبدیل کند', () => {
      const formatted = component.formatNumber(1250000);
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it('getStatusLabel و getStatusBadgeClass و getStatusIcon باید برچسب و استایل‌های متناسب بازگردانند', () => {
      expect(component.getStatusLabel('draft')).toBe('پیش‌نویس');
      expect(component.getStatusLabel('approved')).toBe('مصوب');
      expect(component.getStatusIcon('draft')).toBe('📝');
      expect(component.getStatusIcon('approved')).toBe('✓');
      expect(component.getStatusBadgeClass('draft')).toContain('bg-slate-100');
      expect(component.getStatusBadgeClass('approved')).toContain('bg-emerald-50');
    });

    it('getContractTypeLabel باید متن صحیح فارسی نوع قرارداد روزمزد مبنا ۱۰ ساعت را بازگرداند', () => {
      expect(component.getContractTypeLabel('daily')).toContain('روزمزد');
      expect(component.contractTypes).toEqual([{ value: 'daily', label: 'روزمزد (مبنا ۱۰ ساعت)' }]);
    });
  });

  describe('۹. مرکز فرماندهی، ناوبری زیرتب‌ها و خروجی اکسل ۲ ردیفه', () => {
    beforeEach(() => {
      component.ngOnInit();
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    it('کلیک روی زیرتب باید وضعیت و کوئری‌پارامتر URL را به‌روز کند', () => {
      component.setStatusFilter('pending_supervisor');
      expect(component.statusFilter).toBe('pending_supervisor');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { status_filter: 'pending_supervisor' },
        queryParamsHandling: 'merge'
      });

      component.setStatusFilter('all');
      expect(component.statusFilter).toBe('all');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { status_filter: null },
        queryParamsHandling: 'merge'
      });
    });

    it('تغییر و پاکسازی جستجو باید کوئری‌پارامتر search را هماهنگ کند', () => {
      vi.useFakeTimers();
      component.searchQuery = 'صادقی';
      component.onSearchChange();
      vi.advanceTimersByTime(350);
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { search: 'صادقی' },
        queryParamsHandling: 'merge'
      });

      component.clearSearch();
      expect(component.searchQuery).toBe('');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { search: null },
        queryParamsHandling: 'merge'
      });
      vi.useRealTimers();
    });

    it('متد exportExcel باید خروجی اکسل پرسنل بخش جاری را فراخوانی کند', () => {
      component.exportExcel();
      expect(mockPersonnelApi.exportPersonnelExcel).toHaveBeenCalledWith({ section_id: 101 });
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اکسل'));
    });
  });

  describe('۱۰. مدیریت مودال ثبت و معرفی پرسنل جدید (Modal Operations & Keybindings)', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('وضعیت باز بودن مودال در ابتدا باید false باشد', () => {
      expect(component.isNewPersonnelModalOpen).toBe(false);
    });

    it('فراخوانی openNewPersonnelModal باید مودال را باز کرده و فرم را ریست کند', () => {
      component.selectedSectionId = 101;
      component.newPersonnel.first_name = 'تست';
      component.openNewPersonnelModal();

      expect(component.isNewPersonnelModalOpen).toBe(true);
      expect(component.newPersonnel.first_name).toBe('');
      expect(mockCdr.detectChanges).toHaveBeenCalled();
    });

    it('فراخوانی openNewPersonnelModal در صورت عدم انتخاب بخش باید هشدار دهد و مودال را باز نکند', () => {
      component.selectedSectionId = null;
      component.openNewPersonnelModal();

      expect(component.isNewPersonnelModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('یک بخش را انتخاب کنید'));
    });

    it('فراخوانی closeNewPersonnelModal باید مودال را ببندد', () => {
      component.isNewPersonnelModalOpen = true;
      component.closeNewPersonnelModal();

      expect(component.isNewPersonnelModalOpen).toBe(false);
      expect(mockCdr.detectChanges).toHaveBeenCalled();
    });

    it('فشردن کلید Escape از طریق handleEscape باید مودال را در صورت باز بودن ببندد', () => {
      component.isNewPersonnelModalOpen = true;
      component.handleEscape();
      expect(component.isNewPersonnelModalOpen).toBe(false);

      // در حالت بسته نباید خطایی رخ دهد
      component.handleEscape();
      expect(component.isNewPersonnelModalOpen).toBe(false);
    });

    it('پس از ذخیره موفقیت‌آمیز پیش‌نویس پرسنل، مودال باید به طور خودکار بسته شود', () => {
      component.selectedSectionId = 101;
      component.isNewPersonnelModalOpen = true;
      component.newPersonnel = {
        first_name: 'جواد',
        last_name: 'کاظمی',
        national_code: '0010376488',
        daily_base_wage: 7000000,
        contract_type: 'daily',
        job_title: 'کارگر انبار'
      };

      component.savePersonnelDraft();

      expect(mockPersonnelApi.createPersonnelProfile).toHaveBeenCalled();
      expect(component.isNewPersonnelModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس ثبت شد'));
    });
  });

  describe('۱۱. مدیریت آپلود مدارک هویتی پرسنل (Document Attachment Upload)', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.selectedSectionId = 101;
    });

    it('انتخاب فایل معتبر کمتر از ۱۰ مگابایت باید در وضعیت ذخیره شود', () => {
      const mockFile = new File(['fake content'], 'national_card.jpg', { type: 'image/jpeg' });
      component.onDocumentFileSelected({ target: { files: [mockFile] } });

      expect(component.selectedDocumentAttachment).toBe(mockFile);
      expect(component.attachmentFileName).toBe('national_card.jpg');
    });

    it('انتخاب فایل با حجم بیشتر از ۱۰ مگابایت باید رد شود و هشدار دهد', () => {
      const largeFile = new File(['x'.repeat(100)], 'huge_doc.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeFile, 'size', { value: 15 * 1024 * 1024 });

      component.onDocumentFileSelected({ target: { files: [largeFile] } });

      expect(component.selectedDocumentAttachment).toBeNull();
      expect(component.attachmentFileName).toBe('');
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('۱۰ مگابایت'));
    });

    it('حذف پیوست انتخابی باید فایل و نام آن را پاک کند', () => {
      const mockFile = new File(['content'], 'birth_cert.png', { type: 'image/png' });
      component.selectedDocumentAttachment = mockFile;
      component.attachmentFileName = 'birth_cert.png';

      component.removeSelectedAttachment();

      expect(component.selectedDocumentAttachment).toBeNull();
      expect(component.attachmentFileName).toBe('');
    });

    it('در صورت وجود مدرک پیوست، باید فرم به صورت FormData با کلید attachment ارسال شود', () => {
      const mockFile = new File(['test attachment'], 'id_card.pdf', { type: 'application/pdf' });
      component.selectedDocumentAttachment = mockFile;
      component.attachmentFileName = 'id_card.pdf';
      component.newPersonnel = {
        first_name: 'امید',
        last_name: 'حسینی',
        national_code: '0010376488',
        daily_base_wage: 6000000,
        job_title: 'کارگر انبار',
        contract_type: 'daily'
      };

      component.savePersonnelDraft();

      expect(mockPersonnelApi.createPersonnelProfile).toHaveBeenCalledWith(expect.any(FormData));
      expect(component.isNewPersonnelModalOpen).toBe(false);
      expect(component.selectedDocumentAttachment).toBeNull();
      expect(component.attachmentFileName).toBe('');
    });

    it('resetForm باید فایل پیوست و نام مدرک را به حالت اولیه بازگرداند', () => {
      component.selectedDocumentAttachment = new File(['a'], 'a.pdf');
      component.attachmentFileName = 'a.pdf';
      component.shebaDigitsDisplay = '1234';

      component.resetForm();

      expect(component.selectedDocumentAttachment).toBeNull();
      expect(component.attachmentFileName).toBe('');
      expect(component.shebaDigitsDisplay).toBe('');
    });
  });

  describe('۱۲. مدیریت مودال استاندارد ورود اطلاعات از فایل اکسل (Unified Excel Import)', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.selectedSectionId = 101;
    });

    it('فراخوانی closeExcelModal باید فلگ باز بودن مودال را false کند', () => {
      component.isExcelModalOpen = true;
      component.closeExcelModal();
      expect(component.isExcelModalOpen).toBe(false);
      expect(mockCdr.detectChanges).toHaveBeenCalled();
    });

    it('فراخوانی onExcelImported با نتیجه موفقیت‌آمیز باید پیام موفقیت دهد و پرسنل را مجدداً لود کند', () => {
      component.onExcelImported({ success: true, created_count: 3 });
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اطلاعات پرسنل با موفقیت'));
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    });

    it('فراخوانی openImportModal در صورت انتخاب بخش، باید مودال اکسل را باز کرده و توابع ورود و دانلود قالب را تنظیم کند', () => {
      component.selectedSectionId = 101;
      component.openImportModal();

      expect(component.isExcelModalOpen).toBe(true);
      expect(component.excelModalTitle).toContain('آپلود و ثبت دسته‌جمعی پرسنل');
      expect(typeof component.excelImportFn).toBe('function');
      expect(typeof component.excelTemplateFn).toBe('function');
      expect(mockCdr.detectChanges).toHaveBeenCalled();
    });

    it('فراخوانی openImportModal در صورت عدم انتخاب بخش، باید مانع باز شدن مودال شده و هشدار دهد', () => {
      component.selectedSectionId = null;
      component.openImportModal();

      expect(component.isExcelModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('ابتدا یک بخش'));
    });

    it('تابع excelImportFn تولید شده باید متد importPersonnelExcelModal را با پارامترهای صحیح فراخوانی کند', () => {
      component.selectedSectionId = 101;
      component.openImportModal();

      const testFile = new File(['sample'], 'test.xlsx');
      component.excelImportFn(testFile, true, true);

      expect(mockPersonnelApi.importPersonnelExcelModal).toHaveBeenCalledWith(testFile, 101, true, true);
    });

    it('فراخوانی downloadPersonnelTemplate باید فایل قالب اکسل را دانلود کرده و پیام موفقیت دهد', () => {
      component.downloadPersonnelTemplate();

      expect(mockPersonnelApi.downloadPersonnelTemplate).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('قالب استاندارد اکسل'));
    });

    it('فراخوانی closeExcelModal باید وضعیت مودال را به false تغییر دهد', () => {
      component.isExcelModalOpen = true;
      component.closeExcelModal();

      expect(component.isExcelModalOpen).toBe(false);
      expect(mockCdr.detectChanges).toHaveBeenCalled();
    });

    it('فراخوانی onExcelImported با نتیجه موفقیت‌آمیز باید لیست پرسنل را بازخوانی کرده و پیام موفقیت نمایش دهد', () => {
      component.onExcelImported({ success: true, summary: { created: 3 } });

      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اطلاعات پرسنل با موفقیت'));
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    });
  });

  describe('۱۲. تست DOM و فرآیند تغییر پرسنل تصویب‌شده (Approved Personnel Change Workflow)', () => {
    it('باز کردن مودال برای پرسنل تصویب‌شده باید حالت ویرایش و پیشنهاد تغییرات را فعال کند', () => {
      component.selectedSectionId = 101;
      const approvedPerson = samplePersonnel.find(p => p.approval_status === 'approved')!;
      
      component.openEditModal(approvedPerson);

      expect(component.isNewPersonnelModalOpen).toBe(true);
      expect(component.editingPersonnel).toBe(approvedPerson);
      expect(component.editingId).toBe(approvedPerson.id);
      expect(component.isApprovedRecord).toBe(true);
      expect(component.isReadOnlyMode).toBe(false);
      expect(component.modalHeaderTitle).toBe('ویرایش و پیشنهاد تغییرات پرونده مصوب');
      expect(component.modalHeaderBadge.label).toBe('پرونده مصوب');
      expect(component.modalHeaderBadge.class).toContain('emerald');
    });

    it('ویرایش پرسنل تصویب‌شده فقط فیلد تغییرکرده را برای درخواست تغییرات می‌فرستد (DEF-08 و DEF-16)', () => {
      component.selectedSectionId = 101;
      const approvedPerson = samplePersonnel.find(p => p.approval_status === 'approved')!;
      mockPersonnelApi.updatePersonnelProfile.mockReturnValueOnce(of({ change_request_id: 77, message: 'ok', data: approvedPerson }));
      component.openEditModal(approvedPerson);

      component.newPersonnel.phone_number = '09129990000';

      component.savePersonnel('pending_supervisor');

      expect(mockPersonnelApi.updatePersonnelProfile).toHaveBeenCalledWith(approvedPerson.id, { phone_number: '09129990000' });
      expect(mockToast.show).toHaveBeenCalledWith(
        'success',
        expect.stringContaining('درخواست تغییرات پرونده «احمد کریمی» ثبت و جهت بررسی به کارتابل سرپرست و مدیر ارسال گردید.')
      );
      expect(component.isNewPersonnelModalOpen).toBe(false);
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    });

    it('باید رکوردهایی که دارای فلگ has_pending_changes هستند را با برچسب وضعیت در حال بررسی شناسایی کند', () => {
      const personWithChanges: PersonnelProfile = {
        ...samplePersonnel[1],
        id: 202,
        has_pending_changes: true
      };
      component.recentPersonnel = [personWithChanges];

      component.openEditModal(personWithChanges);
      expect(component.editingPersonnelHasPendingChanges).toBe(true);
    });

    it('ارسال مستقیم پیش‌نویس به کارتابل سرپرست از طریق submitDraftToSupervisor باید کار کند', () => {
      component.selectedSectionId = 101;
      const draftPerson = samplePersonnel.find(p => p.approval_status === 'draft')!;
      component.submitDraftToSupervisor(draftPerson);

      // اکشن submit با گیت سرور؛ PATCH وضعیت را سرور نادیده می‌گیرد (DEF-02)
      expect(mockPersonnelApi.submitPersonnelProfile).toHaveBeenCalledWith(draftPerson.id);
      expect(mockPersonnelApi.updatePersonnelProfile).not.toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('به کارتابل سرپرست بخش ارسال گردید'));
      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalled();
    });
  });

  describe('۱۶. بهینه‌سازی و استانداردهای ارگونومی موبایل (Mobile UX & Ergonomics)', () => {
    it('متد formatShebaDisplay باید شماره شبا را در قالب بسته‌های ۴ رقمی استاندارد نمایش دهد', () => {
      expect(component.formatShebaDisplay('IR060170000000100324200001')).toBe('IR06 0170 0000 0010 0324 2000 01');
      expect(component.formatShebaDisplay('')).toBe('—');
      expect(component.formatShebaDisplay(undefined)).toBe('—');
    });

    it('متد getFullStatusDescription باید توضیحات کامل و اداری برای تولتیپ‌های موبایل بازگرداند', () => {
      expect(component.getFullStatusDescription('draft')).toContain('پیش‌نویس ثبت شده');
      expect(component.getFullStatusDescription('pending_supervisor')).toContain('سرپرست');
      expect(component.getFullStatusDescription('approved')).toContain('تصویب و فعال‌سازی');
      expect(component.getFullStatusDescription('revision_required')).toContain('نیازمند بازنگری');
    });

    it('متد copyToClipboard باید در کلیپ‌بورد کپی کرده یا با توست اطلاع‌رسانی کند', async () => {
      component.copyToClipboard('IR060170000000100324200001', 'شماره شبا');
      await Promise.resolve();
      expect(mockToast.show).toHaveBeenCalled();
    });
  });

  describe('۱۷. آزمون‌های جامع ممیزی عمیق و گردش کار (Comprehensive Audit Suite)', () => {
    it('باید پیام‌های وب‌سوکت personnel_updated بخش جاری را دریافت و سطر پرسنل را درجا به‌روزرسانی کند (تسک ۷.۴)', () => {
      component.selectedSectionId = 101;
      component.ngOnInit();
      const loadSpy = vi.spyOn(component, 'loadRecentPersonnel');

      mockWs.notifications$.next({
        type: 'personnel_updated',
        section_id: 101,
        personnel_id: 201,
        approval_status: 'pending_supervisor',
        has_pending_changes: true
      });

      // طبق الزام تسک ۷.۴: به‌روزرسانی درجا بدون بارگذاری دوباره کل فهرست انجام می‌شود
      const updated = component.recentPersonnel.find(p => p.id === 201);
      expect(updated?.approval_status).toBe('pending_supervisor');
      expect(updated?.has_pending_changes).toBe(true);
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('پیام‌های وب‌سوکت مربوط به بخش‌های دیگر نباید جدول را بازخوانی کنند', () => {
      component.selectedSectionId = 101;
      component.ngOnInit();
      const loadSpy = vi.spyOn(component, 'loadRecentPersonnel');

      mockWs.notifications$.next({
        type: 'personnel_updated',
        section_id: 999,
        profile_id: 201
      });

      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('حذف پرونده‌های در وضعیت revision_required باید مجاز باشد', () => {
      component.selectedSectionId = 101;
      const revisionPerson: PersonnelProfile = {
        ...samplePersonnel[0],
        id: 205,
        approval_status: 'revision_required'
      };
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.deleteDraftPersonnel(revisionPerson);

      expect(mockPersonnelApi.deletePersonnelProfile).toHaveBeenCalledWith(205);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('عودت‌داده‌شده'));
    });

    it('متد isReadOnlyMode باید برای وضعیت‌های pending_accountant و pending_manager مقدار true باشد', () => {
      component.editingPersonnel = {
        ...samplePersonnel[0],
        approval_status: 'pending_accountant' as any
      };
      expect(component.isReadOnlyMode).toBe(true);

      component.editingPersonnel = {
        ...samplePersonnel[0],
        approval_status: 'pending_manager' as any
      };
      expect(component.isReadOnlyMode).toBe(true);

      component.editingPersonnel = {
        ...samplePersonnel[0],
        approval_status: 'revision_required'
      };
      expect(component.isReadOnlyMode).toBe(false);

      component.editingPersonnel = {
        ...samplePersonnel[0],
        approval_status: 'draft'
      };
      expect(component.isReadOnlyMode).toBe(false);
    });

    it('گتر rejectionRequestedByName باید نام بازنگری‌کننده را از revision_requested_by_name استخراج کند', () => {
      component.editingPersonnel = {
        ...samplePersonnel[0],
        approval_status: 'revision_required',
        revision_requested_by_name: 'محمد حسینی (سرپرست انبار)'
      } as any;

      expect(component.rejectionRequestedByName).toBe('محمد حسینی (سرپرست انبار)');
    });

    it('متد getCleanTelUrl باید شماره تماس را برای دایلر موبایل نرمال‌سازی کند', () => {
      expect(component.getCleanTelUrl('۰۹۱۲۳۴۵۶۷۸۹')).toBe('tel:09123456789');
      expect(component.getCleanTelUrl('+98 912 345 6789')).toBe('tel:+989123456789');
      expect(component.getCleanTelUrl('')).toBe('');
    });

    it('مودال مقایسه تغییرات معلق openPendingDiffModal و closePendingDiffModal باید درست کار کنند', () => {
      const personWithDiff: PersonnelProfile = {
        ...samplePersonnel[1],
        has_pending_changes: true
      };
      component.openPendingDiffModal(personWithDiff);
      expect(component.isPendingDiffModalOpen).toBe(true);
      expect(component.pendingDiffPersonnel).toBe(personWithDiff);

      component.closePendingDiffModal();
      expect(component.isPendingDiffModalOpen).toBe(false);
      expect(component.pendingDiffPersonnel).toBeNull();
    });

    it('عناوین شغلی باید از طریق API به صورت داینامیک دریافت شوند', () => {
      component.loadJobTitles();
      expect(mockPersonnelApi.getJobTitles).toHaveBeenCalled();
      expect(component.jobTitles).toContain('راننده');
    });
  });

  describe('۱۶. استاندارد جامع بانک، شماره حساب و تبدیل دوطرفه به شبا', () => {
    it('باید filteredBanks بر اساس جستجو درست فیلتر شود', () => {
      component.bankSearchQuery = 'ملی';
      expect(component.filteredBanks.some(b => b.name.includes('ملی'))).toBe(true);

      component.bankSearchQuery = '';
      expect(component.filteredBanks.length).toBe(component.iranianBanks.length);
    });

    it('انتخاب بانک از دراپ‌داون باید بانک را ست کرده و دراپ‌داون را ببندد', () => {
      const bank = component.iranianBanks.find(b => b.code === '017')!; // بانک ملی
      component.isBankDropdownOpen = true;
      component.selectBankFromDropdown(bank);

      expect(component.newPersonnel.bank_name).toBe(bank.name);
      expect(component.isBankDropdownOpen).toBe(false);
      expect(component.bankSearchQuery).toBe('');
    });

    it('ورود شماره حساب به همراه بانک معتبر باید خودکار شماره شبا را تولید کند', () => {
      component.newPersonnel.bank_name = 'بانک ملی ایران';
      // اکانت معتبر بانک ملی
      component.onAccountNumberInput('0101111111001');

      expect(component.newPersonnel.account_number).toBe('0101111111001');
      expect(component.newPersonnel.sheba_number).toMatch(/^IR\d{24}$/);
      expect(component.shebaValidationResult?.isValid).toBe(true);
    });

    it('انتخاب بانک در صورتی که شماره حساب معتبر موجود باشد باید شبا را مجدداً محاسبه و تولید کند', () => {
      component.newPersonnel.account_number = '0101111111001';
      component.onBankSelect('بانک ملی ایران');

      expect(component.newPersonnel.sheba_number).toMatch(/^IR\d{24}$/);
      expect(component.shebaValidationResult?.isValid).toBe(true);
    });

    it('کلیک بر دکمه تبدیل دستی convertAccountToShebaNow باید با اخطار یا موفقیت پیام دهد', () => {
      // بدون انتخاب بانک
      component.newPersonnel.bank_name = '';
      component.convertAccountToShebaNow();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('بانک عامل'));

      // با بانک و شماره حساب معتبر
      component.newPersonnel.bank_name = 'بانک ملی ایران';
      component.newPersonnel.account_number = '0101111111001';
      component.convertAccountToShebaNow();

      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره شبا با موفقیت'));
      expect(component.newPersonnel.sheba_number).toMatch(/^IR\d{24}$/);
    });

    it('متد copyAccountNumberToClipboard باید شماره حساب را کپی کرده و پرچم isAccountCopied را فعال کند', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation(() => Promise.resolve())
        }
      });
      component.newPersonnel.account_number = '0101111111001';
      component.copyAccountNumberToClipboard();
      expect(component.isAccountCopied).toBe(true);
      await Promise.resolve();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره حساب'));
    });

    it('متد copyPhoneToClipboard باید شماره موبایل را کپی کرده و پرچم isPhoneCopied را فعال کند', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation(() => Promise.resolve())
        }
      });
      component.newPersonnel.phone_number = '09121234567';
      component.copyPhoneToClipboard();
      expect(component.isPhoneCopied).toBe(true);
      await Promise.resolve();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره همراه'));
    });

    it('استعلام کد ملی موجود و بازخوانی اطلاعات باید فرم را خودکار پر کند', () => {
      const existingPerson = {
        id: 55,
        first_name: 'رضا',
        last_name: 'حسینی',
        father_name: 'علی',
        national_code: '0012345678',
        sheba_number: '120170000000101111111001',
        bank_name: 'بانک ملی ایران',
        account_number: '0101111111001',
        daily_base_wage: 7500000,
        children_count: 3
      };
      component.foundExistingPersonnel = existingPerson;
      component.applyFoundPersonnelData();

      expect(component.newPersonnel.first_name).toBe('رضا');
      expect(component.newPersonnel.last_name).toBe('حسینی');
      expect(component.newPersonnel.father_name).toBe('علی');
      expect(component.newPersonnel.children_count).toBe(3);
      expect(component.newPersonnel.daily_base_wage).toBe(7500000);
      expect(component.foundExistingPersonnel).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('با موفقیت فراخوانی شد'));
    });
  });
});
