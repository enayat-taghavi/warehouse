// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { EmployeeNewPersonnelHubComponent } from './employee/employee-new-personnel/employee-new-personnel';
import { EmployeeNewVehicleHubComponent } from './employee/employee-new-vehicle/employee-new-vehicle';
import { PersonnelProfile, VehicleDriverProfile, ProjectSection } from '../../../../core/models/personnel.model';
import { validateSheba, generateShebaFromAccount, extractShebaDigits } from '../../../../core/utils/sheba-utils';

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

(globalThis as any).localStorage = createStorageMock();
(globalThis as any).sessionStorage = createStorageMock();

describe('۳. صفحات بخش مالی (Finance Pages Workflow)', () => {
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const validNationalCode = '0075301989';
  const validShebaMelli = 'IR780170000000101111111001'; // بانک ملی ایران - معتبر با ISO 7064 Mod 97
  const invalidSheba = 'IR111111111111111111111111'; // شبای نامعتبر (چک‌سام اشتباه)

  const sampleSections: ProjectSection[] = [
    { id: 101, name: 'بخش عمران و ابنیه', code: 'CIVIL', project: 1, project_name: 'پروژه مرکزی شیراز', is_active: true },
    { id: 102, name: 'بخش ترابری و لجستیک', code: 'LOG', project: 1, project_name: 'پروژه مرکزی شیراز', is_active: true }
  ];

  const samplePersonnelList: PersonnelProfile[] = [
    {
      id: 501,
      first_name: 'مرتضی',
      last_name: 'منصوریان',
      full_name: 'مرتضی منصوریان',
      national_code: validNationalCode,
      father_name: 'علی',
      job_title: 'کارشناس فنی انبار',
      contract_type: 'daily',
      marital_status: 'single',
      daily_base_wage: 6572696,
      phone_number: '09121112233',
      bank_name: 'بانک ملی ایران',
      sheba_number: validShebaMelli,
      account_number: '101111111001',
      children_count: 0,
      section: 101,
      approval_status: 'draft',
      is_active: true,
      documents: []
    },
    {
      id: 502,
      first_name: 'علی',
      last_name: 'حسینی',
      full_name: 'علی حسینی',
      national_code: '0023456789',
      job_title: 'راننده جرثقیل',
      contract_type: 'monthly',
      marital_status: 'married',
      daily_base_wage: 9500000,
      phone_number: '09123334455',
      bank_name: 'بانک صادرات ایران',
      children_count: 2,
      section: 101,
      approval_status: 'approved',
      is_active: true,
      documents: []
    }
  ];

  const sampleVehicleList: VehicleDriverProfile[] = [
    {
      id: 701,
      driver_name: 'بهرام رادان',
      driver_national_code: '0089998877',
      driver_phone: '09171234567',
      plate_number: '21 ب 789 ایران 63',
      vehicle_type: 'pickup',
      section: 102,
      approval_status: 'draft',
      is_active: true,
      default_service_rate: 3500000,
      bank_name: 'بانک ملی ایران',
      sheba_number: validShebaMelli
    }
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 10, username: 'finance_operator', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue(['can_act_as_operator', 'view_sys_personnel'])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getPersonnelProfiles: vi.fn().mockReturnValue(of(samplePersonnelList)),
      getJobTitles: vi.fn().mockReturnValue(of({ job_titles: ['کارشناس فنی انبار', 'راننده جرثقیل', 'اپراتور لیفتراک'] })),
      lookupPersonnelByNationalCode: vi.fn().mockReturnValue(of({ found: false })),
      createPersonnelProfile: vi.fn().mockImplementation((data: any) => of({ id: 503, ...data, approval_status: 'draft' })),
      updatePersonnelProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deletePersonnelProfile: vi.fn().mockReturnValue(of({ success: true })),
      submitPersonnelProfile: vi.fn().mockImplementation((id: number) => of({ id, approval_status: 'pending_supervisor' })),
      getPersonnelDocuments: vi.fn().mockReturnValue(of([])),
      uploadPersonnelDocument: vi.fn().mockImplementation((id: number, file: any, doc_type: string) => of({
        id: 99,
        file: `https://app.farsalish.ir/media/documents/${file.name || 'doc.jpg'}`,
        doc_type: doc_type || 'other',
        title: 'تصویر کارت ملی'
      })),
      deletePersonnelDocument: vi.fn().mockReturnValue(of({ success: true })),
      getPersonnelBankAccounts: vi.fn().mockReturnValue(of([])),
      addPersonnelBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id: 1, ...data })),

      // بخش خودروها
      getVehicleProfiles: vi.fn().mockReturnValue(of(sampleVehicleList)),
      createVehicleProfile: vi.fn().mockImplementation((data: any) => of({ id: 702, ...data, approval_status: 'draft' })),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      submitVehicleProfile: vi.fn().mockImplementation((id: number) => of({ id, approval_status: 'pending_supervisor' })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockWs = {
      notifications$: new Subject<any>(),
      connected$: of(true)
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۱. پرسنل: مشاهده لیست، فیلترها و جستجو
  // ════════════════════════════════════════════════════════════════════════
  describe('۱. پرسنل - مشاهده لیست، فیلتر وضعیت و جستجو', () => {
    it('لیست پرسنل بخش با موفقیت لود شده و فیلترهای وضعیت به درستی عمل می‌کنند', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.ngOnInit();

      // ۱. اعتبارسنجی بارگذاری بخش‌ها و لود لیست اولیه پرسنل
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(personnelHub.selectedSectionId).toBe(101);
      expect(personnelHub.recentPersonnel.length).toBe(2);
      expect(personnelHub.recentPersonnel[0].full_name).toContain('مرتضی منصوریان');

      // ۲. فیلتر کردن بر اساس وضعیت پیش‌نویس (draft)
      personnelHub.setStatusFilter('draft');
      expect(personnelHub.statusFilter).toBe('draft');
      expect(personnelHub.filteredPersonnel.length).toBe(1);
      expect(personnelHub.filteredPersonnel[0].approval_status).toBe('draft');

      // ۳. فیلتر کردن بر اساس وضعیت تایید شده (approved)
      personnelHub.setStatusFilter('approved');
      expect(personnelHub.filteredPersonnel.length).toBe(1);
      expect(personnelHub.filteredPersonnel[0].first_name).toBe('علی');

      // ۴. جستجوی زنده بر اساس کد ملی
      personnelHub.setStatusFilter('all');
      personnelHub.searchQuery = validNationalCode;
      expect(personnelHub.filteredPersonnel.length).toBe(1);
      expect(personnelHub.filteredPersonnel[0].national_code).toBe(validNationalCode);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۲. پرسنل: ثبت پرسنل جدید
  // ════════════════════════════════════════════════════════════════════════
  describe('۲. پرسنل - ثبت پرسنل جدید', () => {
    it('فرم ثبت پرسنل جدید با موفقیت باز شده و با داده‌های معتبر ثبت می‌گردد', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.ngOnInit();

      // باز کردن فرم تعریف پرسنل جدید
      personnelHub.openNewPersonnelModal();
      expect(personnelHub.isNewPersonnelModalOpen).toBe(true);
      expect(personnelHub.editingId).toBeNull();

      // تکمیل اطلاعات هویتی و شغلی
      personnelHub.newPersonnel.first_name = 'سروش';
      personnelHub.newPersonnel.last_name = 'رضایی';
      personnelHub.newPersonnel.national_code = '1234567890';
      personnelHub.newPersonnel.job_title = 'اپراتور لیفتراک';
      personnelHub.newPersonnel.daily_base_wage = 7000000;
      personnelHub.newPersonnel.phone_number = '09129998877';

      // ذخیره پرسنل
      personnelHub.savePersonnel('draft');

      expect(mockPersonnelApi.createPersonnelProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'سروش',
          last_name: 'رضایی',
          national_code: '1234567890',
          job_title: 'اپراتور لیفتراک'
        })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('سروش رضایی'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۳. پرسنل: ویرایش پرسنل موجود
  // ════════════════════════════════════════════════════════════════════════
  describe('۳. پرسنل - ویرایش پرسنل موجود', () => {
    it('پرونده پرسنل برای ویرایش لود شده و تغییرات با موفقیت ذخیره می‌شود', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.ngOnInit();

      // باز کردن پرونده مرتضی منصوریان جهت ویرایش
      const target = samplePersonnelList[0];
      personnelHub.openEditModal(target);

      expect(personnelHub.isNewPersonnelModalOpen).toBe(true);
      expect(personnelHub.editingId).toBe(501);
      expect(personnelHub.newPersonnel.first_name).toBe('مرتضی');

      // ویرایش فیلدها: تغییر عنوان شغل
      personnelHub.newPersonnel.job_title = 'سرپرست انبار قطعات';

      // ذخیره ویرایش
      personnelHub.savePersonnel('draft');

      expect(mockPersonnelApi.updatePersonnelProfile).toHaveBeenCalledWith(
        501,
        expect.objectContaining({
          job_title: 'سرپرست انبار قطعات'
        })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('مرتضی منصوریان'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۴. پرسنل: بارگذاری مدارک
  // ════════════════════════════════════════════════════════════════════════
  describe('۴. پرسنل - بارگذاری مدارک', () => {
    it('آپلود اسناد و مدارک پرسنل با دسته‌بندی و عنوان با موفقیت انجام می‌شود', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.ngOnInit();
      personnelHub.openEditModal(samplePersonnelList[0]);

      // آماده‌سازی فایل برای بارگذاری
      const fakeFile = new File(['fake-image-content'], 'national_card.jpg', { type: 'image/jpeg' });
      personnelHub.selectedDocTypeForUpload = 'national_card';
      personnelHub.onMultipleFilesSelected({ target: { files: [fakeFile] } });

      // بررسی قرارگیری فایل در صف مدارک
      expect(personnelHub.pendingUploadDocuments.length).toBe(1);
      expect(personnelHub.pendingUploadDocuments[0].name).toBe('national_card.jpg');

      // ذخیره و آپلود خودکار مدارک در صف
      personnelHub.savePersonnel('draft');

      expect(mockPersonnelApi.uploadPersonnelDocument).toHaveBeenCalledWith(
        501,
        fakeFile,
        'national_card'
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۵. پرسنل: حساب بانکی و اعتبارسنجی دوطرفه شبا
  // ════════════════════════════════════════════════════════════════════════
  describe('۵. پرسنل - حساب بانکی و تشخیص هوشمند شماره شبا', () => {
    it('ورود شماره شبای معتبر بانک ملی را به درستی تشخیص داده و شماره حساب را استخراج می‌کند', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.openNewPersonnelModal();

      // ۱. اعتبارسنجی مستقیم الگوریتم ISO 7064 Mod 97 با ابزار sheba-utils
      const validationResult = validateSheba(extractShebaDigits(validShebaMelli));
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.bank?.name).toBe('بانک ملی ایران');

      // ۲. اعمال ورودی در متد onShebaInput کامپوننت
      personnelHub.onShebaInput(validShebaMelli);

      expect(personnelHub.shebaValidationResult?.isValid).toBe(true);
      expect(personnelHub.newPersonnel.bank_name).toBe('بانک ملی ایران');
      expect(personnelHub.newPersonnel.account_number).toBe('101111111001');

      // ۳. تبدیل معکوس: تولید شماره شبا از روی شماره حساب و بانک
      personnelHub.newPersonnel.account_number = '101111111001';
      expect(personnelHub.newPersonnel.bank_name).toBe('بانک ملی ایران');
      personnelHub.convertAccountToShebaNow();

      expect(personnelHub.newPersonnel.sheba_number).toContain('017');
      expect(personnelHub.shebaValidationResult?.isValid).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۶. پرسنل: رد شماره شبای نامعتبر (CRITICAL: Invalid Sheba Rejection)
  // ════════════════════════════════════════════════════════════════════════
  describe('۶. پرسنل - رد قطعی شماره شبای نامعتبر با خطا', () => {
    it('شماره شبای نامعتبر با خطا مواجه شده، پیام هشدار نمایش داده و ذخیره را متوقف می‌کند', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.ngOnInit();
      personnelHub.openNewPersonnelModal();

      // ۱. تکمیل فیلدهای اجباری هویت پرسنل
      personnelHub.newPersonnel.first_name = 'محسن';
      personnelHub.newPersonnel.last_name = 'کریمی';
      personnelHub.newPersonnel.national_code = '0075301989';

      // ۲. وارد کردن شماره شبای نامعتبر (چک‌سام اشتباه)
      personnelHub.onShebaInput(invalidSheba);

      // بررسی اعتبارسنجی در جا
      expect(personnelHub.shebaValidationResult?.isValid).toBe(false);
      expect(personnelHub.shebaValidationResult?.errorMessage).toBeTruthy();

      // ۳. تلاش برای ذخیره پرسنل با شماره شبای نامعتبر
      personnelHub.savePersonnel('draft');

      // ۴. اعتبارسنجی: سیستم حتماً باید عملیات را مسدود کرده و مانع از تماس با API شود
      expect(mockToast.show).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(personnelHub.shebaValidationResult!.errorMessage!)
      );
      expect(mockPersonnelApi.createPersonnelProfile).not.toHaveBeenCalled();
      expect(mockPersonnelApi.updatePersonnelProfile).not.toHaveBeenCalled();
    });

    it('تلاش برای افزودن حساب بانکی جدید با شبای نامعتبر در لیست حساب‌ها فوراً رد می‌شود', () => {
      const personnelHub = new EmployeeNewPersonnelHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      personnelHub.openNewPersonnelModal();
      personnelHub.newPersonnel.bank_name = 'بانک ملت';
      personnelHub.newPersonnel.sheba_number = invalidSheba;
      personnelHub.onShebaInput(invalidSheba);

      personnelHub.addCurrentAsNewAccount();

      // پیام هشدار عدم اعتبار شبا داده شده و حسابی اضافه نمی‌شود
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.any(String));
      expect(personnelHub.bankAccounts.length).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۷. خودروها: افزودن و ویرایش خودرو
  // ════════════════════════════════════════════════════════════════════════
  describe('۷. خودروها - افزودن و ویرایش مشخصات خودرو و راننده', () => {
    it('خودروی جدید با مشخصات راننده و نوع خودرو با موفقیت ثبت می‌شود', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.ngOnInit();
      vehicleHub.openNewVehicleModal();

      expect(vehicleHub.isNewVehicleModalOpen).toBe(true);

      // ثبت مشخصات راننده و خودرو
      vehicleHub.newVehicle.driver_name = 'صادق هدایت';
      vehicleHub.newVehicle.driver_phone = '09128887766';
      vehicleHub.newVehicle.driver_national_code = '0010376488';
      vehicleHub.newVehicle.vehicle_type = 'forklift';
      vehicleHub.newVehicle.plate_number = '12 ع 345 ایران 63';
      vehicleHub.newVehicle.default_service_rate = 4000000;

      vehicleHub.saveVehicle('draft');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          driver_name: 'صادق هدایت',
          vehicle_type: 'forklift',
          plate_number: '12 ع 345 ایران 63'
        })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('صادق هدایت'));
    });

    it('ویرایش مشخصات خودروی موجود با موفقیت لود شده و ثبت می‌گردد', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.ngOnInit();
      const existing = sampleVehicleList[0];
      vehicleHub.openEditModal(existing);

      expect(vehicleHub.editingId).toBe(701);
      expect(vehicleHub.newVehicle.driver_name).toBe('بهرام رادان');

      // تغییر نرخ سرویس
      vehicleHub.newVehicle.default_service_rate = 4500000;
      vehicleHub.saveVehicle('draft');

      expect(mockPersonnelApi.updateVehicleProfile).toHaveBeenCalledWith(
        701,
        expect.objectContaining({
          default_service_rate: 4500000
        })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تغییرات پیش‌نویس خودرو'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۸. خودروها: پلاک استاندارد ۴ بخشی
  // ════════════════════════════════════════════════════════════════════════
  describe('۸. خودروها - ساختار پلاک استاندارد ۴ بخشی', () => {
    it('ورود بخش‌های ۴ گانه پلاک به صورت خودکار ترکیب شده و فرمت پلاک رسمی را می‌سازد', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.openNewVehicleModal();
      vehicleHub.newVehicle.vehicle_type = 'pickup';

      // ورود اجزای پلاک ایران
      vehicleHub.platePart1 = '33'; // ۲ رقم
      vehicleHub.platePart2 = 'د';  // حرف میانی
      vehicleHub.platePart3 = '567'; // ۳ رقم
      vehicleHub.platePart4 = '74'; // کد شهر/ایران

      // ترکیب پلاک
      vehicleHub.updatePlateFromParts();

      expect(vehicleHub.newVehicle.plate_number).toBe('33 د 567 ایران 74');
    });

    it('باز کردن خودروی موجود پلاک را به ۴ بخش مجزا تجزیه می‌کند', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.parsePlateToParts('21 ب 789 ایران 63');

      expect(vehicleHub.platePart1).toBe('21');
      expect(vehicleHub.platePart2).toBe('ب');
      expect(vehicleHub.platePart3).toBe('789');
      expect(vehicleHub.platePart4).toBe('63');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ۹. خودروها: شماره شبا و اعتبارسنجی
  // ════════════════════════════════════════════════════════════════════════
  describe('۹. خودروها - شماره شبا و اعتبارسنجی واریز', () => {
    it('شماره شبای معتبر برای راننده/مالک خودرو پذیرفته شده و بانک شناسایی می‌شود', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.openNewVehicleModal();
      vehicleHub.onShebaInput(validShebaMelli);

      expect(vehicleHub.shebaValidationResult?.isValid).toBe(true);
      expect(vehicleHub.newVehicle.bank_name).toBe('بانک ملی ایران');
    });

    it('شماره شبای نامعتبر در فرم خودرو اخطار ایجاد کرده و اعتبارسنجی را نقض می‌کند', () => {
      const vehicleHub = new EmployeeNewVehicleHubComponent(
        mockAuth,
        mockPersonnelApi,
        mockWs,
        mockToast,
        mockCdr,
        mockRoute,
        mockRouter
      );

      vehicleHub.openNewVehicleModal();
      vehicleHub.onShebaInput(invalidSheba);

      expect(vehicleHub.shebaValidationResult?.isValid).toBe(false);
      expect(vehicleHub.shebaValidationResult?.errorMessage).toBeTruthy();
    });
  });
});
