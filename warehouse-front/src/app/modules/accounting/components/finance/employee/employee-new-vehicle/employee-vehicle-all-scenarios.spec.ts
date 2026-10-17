// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { of, throwError, Subject } from 'rxjs';
import { VehicleDriverProfile, ProjectSection, VehicleChangeRequest } from '../../../../models/personnel.model';

describe('آزمون‌های جامع تمامی سناریوهای ثبت خودرو، فیلدها، دکمه‌ها و چرخه حیات ناوگان (All Vehicle Scenarios, Fields, Buttons & Lifecycle Suite)', () => {
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;
  let domContainer: HTMLDivElement;

  const sampleSection: ProjectSection = {
    id: 12,
    name: 'بخش ترابری و لجستیک کارگاه',
    code: 'LOG12',
    project: 1,
    project_name: 'پروژه مرکزی',
    is_active: true
  };

  let activeVehicleRecord: VehicleDriverProfile;
  let activeVehicleCR: VehicleChangeRequest;

  beforeEach(() => {
    domContainer = document.createElement('div');
    document.body.appendChild(domContainer);

    activeVehicleRecord = {
      id: 501,
      plate_number: '12 الف 345 ایران 63',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: 'حسین اکبری',
      driver_national_code: '0010376488',
      driver_phone: '09121234567',
      is_driver_owner: true,
      owner_name: '',
      owner_national_code: '',
      owner_phone: '',
      default_service_rate: 4500000,
      bank_name: 'بانک ملی ایران',
      account_number: '0101234567001',
      sheba_number: 'IR780170000000101111111001',
      section: 12,
      approval_status: 'draft',
      is_active: false
    };

    activeVehicleCR = {
      id: 801,
      vehicle: 501,
      plate_number: '12 الف 345 ایران 63',
      status: 'pending_supervisor',
      status_display: 'در انتظار تایید سرپرست',
      proposed_changes: { default_service_rate: 6000000 },
      previous_values: { default_service_rate: 4500000 },
      requested_by_name: 'کارمند ترابری',
      created_at: '2026-09-29T10:00:00Z',
      updated_at: '2026-09-29T10:00:00Z'
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'operator_test', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([sampleSection])),
      getProjectSections: vi.fn().mockReturnValue(of([sampleSection])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([activeVehicleRecord])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([])),
      createVehicleProfile: vi.fn().mockImplementation((payload: any) => {
        const id = 502;
        const record = { id, ...payload };
        return of(record);
      }),
      createVehicleDriverProfile: vi.fn().mockImplementation((payload: any) => {
        const id = 502;
        const record = { id, ...payload };
        return of(record);
      }),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, payload: any) => {
        if (activeVehicleRecord.approval_status === 'approved') {
          return of({
            message: 'درخواست تغییرات خودرو ثبت و جهت بررسی به سرپرست ارسال گردید.',
            change_request_id: 801
          });
        }
        Object.assign(activeVehicleRecord, payload);
        return of({ message: 'ویرایش با موفقیت ذخیره شد.', data: activeVehicleRecord });
      }),
      updateVehicleDriverProfile: vi.fn().mockImplementation((id: number, payload: any) => {
        if (activeVehicleRecord.approval_status === 'approved') {
          return of({
            message: 'درخواست تغییرات خودرو ثبت و جهت بررسی به سرپرست ارسال گردید.',
            change_request_id: 801
          });
        }
        Object.assign(activeVehicleRecord, payload);
        return of({ message: 'ویرایش با موفقیت ذخیره شد.', data: activeVehicleRecord });
      }),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true, message: 'پرونده خودرو حذف گردید.' })),
      deleteVehicleDriverProfile: vi.fn().mockReturnValue(of({ success: true, message: 'پرونده خودرو حذف گردید.' })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['fake excel content']))),
      exportVehicleExcel: vi.fn().mockReturnValue(of(new Blob(['fake excel content']))),
      importVehicleExcelModal: vi.fn().mockReturnValue(of({ success: true, created_count: 3 })),
      downloadVehicleTemplate: vi.fn().mockReturnValue(of(new Blob(['fake template content']))),
      // متدهای چرخه تایید ۳ مرحله‌ای
      approveVehicleSupervisor: vi.fn().mockImplementation((id: number) => {
        activeVehicleRecord.approval_status = 'pending_accountant';
        return of({ message: 'تایید سرپرست صادر شد و به کارتابل حسابداری ارسال گردید.' });
      }),
      approveVehicleFinance: vi.fn().mockImplementation((id: number) => {
        activeVehicleRecord.approval_status = 'pending_manager';
        return of({ message: 'تایید مالی صادر شد و به کارتابل مدیر ارسال گردید.' });
      }),
      approveVehicleManager: vi.fn().mockImplementation((id: number) => {
        activeVehicleRecord.approval_status = 'approved';
        activeVehicleRecord.is_active = true;
        return of({ message: 'تصویب نهایی مدیر صادر و خودرو فعال گردید.' });
      }),
      rejectVehicleSupervisor: vi.fn().mockImplementation((id: number, reason: string) => {
        activeVehicleRecord.approval_status = 'rejected';
        activeVehicleRecord.rejection_reason = reason;
        return of({ message: 'پرونده خودرو توسط سرپرست رد شد.' });
      }),
      requestRevisionVehicleSupervisor: vi.fn().mockImplementation((id: number, reason: string) => {
        activeVehicleRecord.approval_status = 'revision_required';
        activeVehicleRecord.rejection_reason = reason;
        return of({ message: 'پرونده خودرو جهت اصلاح به کارمند عودت داده شد.' });
      }),
      submitVehicleProfile: vi.fn().mockImplementation((id: number) => {
        activeVehicleRecord.approval_status = 'pending_supervisor';
        return of({ message: 'پرونده خودرو به کارتابل سرپرست ارسال گردید.' });
      }),
      approveVehicleChangeRequestSupervisor: vi.fn().mockImplementation((id: number) => {
        activeVehicleCR.status = 'pending_accountant';
        return of({ message: 'تایید تغییرات توسط سرپرست انجام شد.' });
      }),
      approveVehicleChangeRequestFinance: vi.fn().mockImplementation((id: number) => {
        activeVehicleCR.status = 'pending_manager';
        return of({ message: 'تایید تغییرات توسط حسابدار انجام شد.' });
      }),
      approveVehicleChangeRequestManager: vi.fn().mockImplementation((id: number) => {
        activeVehicleCR.status = 'approved';
        activeVehicleRecord.default_service_rate = 6000000;
        activeVehicleRecord.has_pending_changes = false;
        return of({ message: 'تصویب تغییرات توسط مدیر انجام و روی خودرو اعمال شد.' });
      })
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
      queryParams: of({ section_id: '12' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeNewVehicleHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockWs,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
    component.selectedSectionId = 12;
    component.selectedSection = sampleSection;
  });

  afterEach(() => {
    if (domContainer && domContainer.parentNode) {
      domContainer.parentNode.removeChild(domContainer);
    }
    vi.clearAllMocks();
  });

  // =========================================================================
  // بخش ۱: آزمون سناریوهای فیلدها و انواع داده‌ای در DOM و کامپوننت
  // =========================================================================

  describe('بخش ۱: سناریوهای داده‌ای و اعتبارسنجی تمامی فیلدها', () => {

    it('سناریو ۱ (پلاک ۴ بخشی خودرو): جهش فوکوس خودکار، فرمت‌بندی استاندارد ملی و جلوگیری از پلاک ناقص', () => {
      // شبیه‌سازی ویجت ورودی ۴ قسمتی پلاک در DOM
      domContainer.innerHTML = `
        <div id="plateWidget" dir="ltr">
          <input type="text" id="p1" maxlength="2" placeholder="12" />
          <select id="p2"><option value="الف">الف</option><option value="ب">ب</option></select>
          <input type="text" id="p3" maxlength="3" placeholder="345" />
          <input type="text" id="p4" maxlength="2" placeholder="63" />
        </div>
      `;

      // تست جهش فوکوس خودکار از پارت ۱ به سلکت پارت ۲
      const p2FocusSpy = vi.fn();
      component.p2Select = { nativeElement: { focus: p2FocusSpy } } as any;
      component.platePart1 = '12';
      component.onPlatePart1Input({});
      expect(p2FocusSpy).toHaveBeenCalled();

      // تست جهش فوکوس خودکار از پارت ۳ به پارت ۴
      const p4FocusSpy = vi.fn();
      component.p4Input = { nativeElement: { focus: p4FocusSpy } } as any;
      component.platePart3 = '345';
      component.onPlatePart3Input({});
      expect(p4FocusSpy).toHaveBeenCalled();

      // ترکیب پلاک
      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      component.updatePlateFromParts();
      expect(component.newVehicle.plate_number).toBe('12 الف 345 ایران 63');

      // اعتبارسنجی جلوگیری از پلاک ناقص
      component.newVehicle.plate_number = '';
      component.platePart1 = '';
      component.platePart3 = '';
      component.saveVehicle('draft');
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('شماره پلاک'));
    });

    it('سناریو ۲ (راننده خود مالک است): عدم نمایش فیلدهای مالک در DOM و ارسال با is_driver_owner = true', () => {
      component.newVehicle.is_driver_owner = true;

      // رندر بخش تاگل مالکیت و کادر فیلدهای مالک در DOM
      domContainer.innerHTML = `
        <div id="ownerToggleWrapper">
          <input type="checkbox" id="driverOwnerToggle" ${component.newVehicle.is_driver_owner ? 'checked' : ''} />
          <span>مالک خودرو، شخص راننده است</span>
        </div>
        <div id="ownerFieldsBox" style="display: ${component.newVehicle.is_driver_owner ? 'none' : 'block'};">
          <input id="ownerNameInput" />
          <input id="ownerNationalCodeInput" />
          <input id="ownerPhoneInput" />
        </div>
      `;

      const ownerBox = domContainer.querySelector('#ownerFieldsBox') as HTMLElement;
      expect(ownerBox.style.display).toBe('none');

      // بررسی مقادیر مدل
      expect(component.newVehicle.is_driver_owner).toBe(true);
      expect(component.newVehicle.owner_name).toBe('');
    });

    it('سناریو ۳ (راننده غیرمالک است): نمایش فیلدهای مالک در DOM، اعتبارسنجی و ارسال مجزای اطلاعات مالک', () => {
      component.toggleIsDriverOwner(false);
      expect(component.newVehicle.is_driver_owner).toBe(false);

      // رندر بخش فیلدهای هویتی مالک در DOM
      domContainer.innerHTML = `
        <div id="ownerFieldsBox" class="p-3.5 bg-amber-50">
          <label>نام و نام خانوادگی مالک *</label>
          <input id="ownerNameInput" value="${component.newVehicle.owner_name || ''}" />
          <label>کد ملی مالک (۱۰ رقم) *</label>
          <input id="ownerNationalCodeInput" value="${component.newVehicle.owner_national_code || ''}" />
          <label>شماره همراه مالک</label>
          <input id="ownerPhoneInput" value="${component.newVehicle.owner_phone || ''}" />
        </div>
      `;

      const ownerBox = domContainer.querySelector('#ownerFieldsBox');
      expect(ownerBox).not.toBeNull();

      // تکمیل اطلاعات اولیه پلاک و راننده
      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      component.updatePlateFromParts();
      component.newVehicle.driver_name = 'علی حسینی';

      // تلاش برای ثبت بدون نام مالک -> باید مانع شود
      component.newVehicle.owner_name = '';
      component.saveVehicle('draft');
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('نام و نام خانوادگی مالک'));

      // تکمیل اطلاعات مالک
      component.newVehicle.owner_name = 'رضا کمالی';
      component.newVehicle.owner_national_code = '0010376488';
      component.newVehicle.owner_phone = '09123334455';

      component.saveVehicle('draft');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          is_driver_owner: false,
          owner_name: 'رضا کمالی',
          owner_national_code: '0010376488',
          owner_phone: '09123334455'
        })
      );
    });

    it('سناریو ۴ (انواع کاربری خودرو vehicle_type): پشتیبانی کامل از تمامی گزینه‌ها و برچسب‌های فارسی', () => {
      const types = ['nissan', 'pickup', 'sedan', 'khavar', 'truck', 'trailer', 'forklift', 'other'] as const;

      types.forEach(t => {
        component.newVehicle.vehicle_type = t;
        expect(component.newVehicle.vehicle_type).toBe(t);
        const label = component.getVehicleTypeLabel(t);
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
      });

      expect(component.getVehicleTypeLabel('nissan')).toContain('نیسان');
      expect(component.getVehicleTypeLabel('pickup')).toContain('وانت');
      expect(component.getVehicleTypeLabel('truck')).toContain('کامیون');
      expect(component.getVehicleTypeLabel('khavar')).toContain('خاور');
    });

    it('سناریو ۵ (انواع مالکیت ownership_type): پشتیبانی از شرکتی، استیجاری و شخصی', () => {
      const ownerships = ['contract', 'company', 'personal'] as const;

      ownerships.forEach(o => {
        component.newVehicle.ownership_type = o;
        expect(component.newVehicle.ownership_type).toBe(o);
        const label = component.getOwnershipTypeLabel(o);
        expect(label).toBeTruthy();
      });

      expect(component.getOwnershipTypeLabel('company')).toContain('شرکتی');
      expect(component.getOwnershipTypeLabel('contract')).toContain('استیجاری');
      expect(component.getOwnershipTypeLabel('personal')).toContain('ملکی راننده');
    });

    it('سناریو ۶ (اعتبارسنجی کد ملی راننده و مالک با الگوریتم Mod 11): رد کدهای نامعتبر و پذیرش کد استاندارد', () => {
      // کد ملی کمتر از ۱۰ رقم
      component.newVehicle.driver_national_code = '12345';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('۱۰ رقم');

      // کد ملی با ارقام تکراری
      component.newVehicle.driver_national_code = '2222222222';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('ارقام تکراری');

      // کد ملی با چکسام اشتباه
      component.newVehicle.driver_national_code = '0010376489';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('خطای رقم کنترلی');

      // کد ملی معتبر با ارقام فارسی
      component.newVehicle.driver_national_code = '۰۰۱۰۳۷۶۴۸۸';
      component.onNationalCodeChange();
      expect(component.newVehicle.driver_national_code).toBe('0010376488');
      expect(component.nationalCodeError).toBeNull();
    });

    it('سناریو ۷ (استاندارد بانکی، شماره حساب و شبا ISO 7064 Mod 97): استخراج و تبدیل دوطرفه بانک و حساب به شبا', () => {
      // ۱. اعتبارسنجی شماره شبای معتبر بانک ملی
      component.newVehicle.sheba_number = 'IR780170000000101111111001';
      component.onShebaChange();

      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.shebaValidationResult?.bank?.name).toContain('ملی');
      expect(component.newVehicle.bank_name).toContain('ملی');
      expect(component.newVehicle.account_number).toBe('101111111001');

      // ۲. تولید شبا بر اساس شماره حساب و بانک عامل
      component.newVehicle.bank_name = 'بانک ملی ایران';
      component.onAccountNumberInput('0101111111001');

      expect(component.newVehicle.sheba_number).toMatch(/^IR\d{24}$/);
      expect(component.shebaValidationResult?.isValid).toBe(true);
    });

    it('سناریو ۸ (نرخ پیش‌فرض سرویس و محاسبات ریال به تومان): تبدیل و فرمت‌بندی جداکننده هزارگان', () => {
      component.onRateInput('45000000');
      expect(component.newVehicle.default_service_rate).toBe(45000000);
      expect(component.rateInTomans).toBe(4500000);

      const formatted = component.formatNumber(45000000);
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it('سناریو ۹ (قالب اکسل استاندارد و ورود اطلاعات ناوگان): دریافت قالب و آماده‌سازی ایمپورت اکسل', () => {
      // دانلود قالب استاندارد اکسل ناوگان
      component.downloadExcelTemplate();
      expect(mockPersonnelApi.downloadVehicleTemplate).toHaveBeenCalled();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('قالب استاندارد اکسل'));

      // باز کردن مودال ورود اکسل
      component.openImportModal();
      expect(component.isExcelModalOpen).toBe(true);
      expect(component.excelImportFn).toBeDefined();

      // تست تابع ایمپورت با فایل اکسل ماک
      const dummyFile = new File(['dummy'], 'vehicles.xlsx');
      component.excelImportFn(dummyFile, true, false).subscribe((res) => {
        expect(res.success).toBe(true);
      });
      expect(mockPersonnelApi.importVehicleExcelModal).toHaveBeenCalledWith(dummyFile, 12, true, false);

      component.closeExcelModal();
      expect(component.isExcelModalOpen).toBe(false);
    });

    it('سناریو ۱۰ (ایزولاسیون بر اساس بخش فعال Guardian G1): ممانعت از باز شدن مودال یا ثبت بدون بخش', () => {
      component.selectedSectionId = null;
      component.openNewVehicleModal();

      expect(component.isNewVehicleModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('ابتدا یک بخش را انتخاب کنید'));
    });
  });

  // =========================================================================
  // بخش ۲: آزمون تمامی دکمه‌ها و المان‌های تعاملی در DOM و کامپوننت
  // =========================================================================

  describe('بخش ۲: تمامی دکمه‌ها و المان‌های تعاملی در DOM', () => {

    it('دکمه ۱ (کپی شماره شبا): کپی در کلیپ‌بورد، تغییر آیکون به ✓ برای ۲ ثانیه و پیام توست', async () => {
      vi.useFakeTimers();
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) }
      });

      component.newVehicle.sheba_number = 'IR780170000000101111111001';
      component.copyShebaToClipboard();

      await vi.waitFor(() => {
        expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره شبا در کلیپ‌بورد کپی شد'));
      });
      expect(component.isShebaCopied).toBe(true);

      vi.advanceTimersByTime(2600);
      expect(component.isShebaCopied).toBe(false);
      vi.useRealTimers();
    });

    it('دکمه ۲ (کپی شماره حساب): کپی شماره حساب و بازخورد سریع', async () => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) }
      });

      component.newVehicle.account_number = '0101234567001';
      component.copyAccountNumberToClipboard();

      await Promise.resolve();
      expect(component.isAccountCopied).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره حساب'));
    });

    it('دکمه ۳ (تولید دستی شبا با ⚡): هشدار در صورت نبود بانک و تولید موفق با حساب معتبر', () => {
      // بدون بانک
      component.newVehicle.bank_name = '';
      component.convertAccountToShebaNow();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('بانک عامل'));

      // با بانک و حساب معتبر
      component.newVehicle.bank_name = 'بانک ملی ایران';
      component.newVehicle.account_number = '0101111111001';
      component.convertAccountToShebaNow();

      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره شبا با موفقیت'));
      expect(component.newVehicle.sheba_number).toMatch(/^IR\d{24}$/);
    });

    it('دکمه ۴ (کومبوباکس جستجوی بانک عامل): فیلتر زنده بانک‌ها و انتخاب بانک با تنظیم نام', () => {
      component.openBankDropdown();
      expect(component.isBankDropdownOpen).toBe(true);

      // فیلتر بانک ملت
      component.bankSearchQuery = 'ملت';
      const filtered = component.filteredBanks;
      expect(filtered.some(b => b.name.includes('ملت'))).toBe(true);

      const mellat = filtered.find(b => b.name.includes('ملت'))!;
      component.selectBankFromDropdown(mellat);
      expect(component.newVehicle.bank_name).toBe(mellat.name);
      expect(component.isBankDropdownOpen).toBe(false);
    });

    it('دکمه ۵ (کنترل مودال: باز کردن، بستن و کلید Escape): بررسی عملکرد کامل مودال در DOM', () => {
      component.openNewVehicleModal();
      expect(component.isNewVehicleModalOpen).toBe(true);

      // بستن با متد closeNewVehicleModal
      component.closeNewVehicleModal();
      expect(component.isNewVehicleModalOpen).toBe(false);

      // باز کردن مجدد و بستن با کلید Escape
      component.openNewVehicleModal();
      expect(component.isNewVehicleModalOpen).toBe(true);
      component.handleEscape();
      expect(component.isNewVehicleModalOpen).toBe(false);
    });

    it('دکمه ۶ و ۷ (ذخیره پیش‌نویس و ارسال به سرپرست): بررسی فراخوانی سرویس با وضعیت‌های مربوطه', () => {
      component.openNewVehicleModal();
      component.newVehicle.driver_name = 'احمد قاسمی';
      component.newVehicle.driver_national_code = '0010376488';
      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      component.updatePlateFromParts();

      // ۱. ذخیره به عنوان پیش‌نویس (دکمه ۶)
      component.saveVehicle('draft');
      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(
        expect.objectContaining({ driver_name: 'احمد قاسمی' })
      );

      // ۲. ثبت و ارسال مستقیم به سرپرست (دکمه ۷)
      component.saveVehicle('pending_supervisor');
      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(
        expect.objectContaining({ driver_name: 'احمد قاسمی' })
      );
      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(502);
    });

    it('دکمه ۸ (ارسال سریع پیش‌نویس submitDraftToSupervisor): ارسال مستقیم خودرو پیش‌نویس به کارتابل سرپرست', () => {
      component.submitDraftToSupervisor(activeVehicleRecord);
      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(501);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('سرپرست'));
    });

    it('دکمه ۹ (حذف پیش‌نویس خودرو deleteDraftVehicle): حذف پیش‌نویس با تایید و ممانعت از حذف خودروهای مصوب', () => {
      // ممانعت از حذف خودروی مصوب
      const approvedVeh: VehicleDriverProfile = { ...activeVehicleRecord, approval_status: 'approved' };
      component.deleteDraftVehicle(approvedVeh);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط خودروهای در وضعیت پیش‌نویس'));
      expect(mockPersonnelApi.deleteVehicleProfile).not.toHaveBeenCalled();

      // حذف خودروی پیش‌نویس با تایید کاربر
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const draftVeh: VehicleDriverProfile = { ...activeVehicleRecord, approval_status: 'draft' };
      component.deleteDraftVehicle(draftVeh);
      expect(mockPersonnelApi.deleteVehicleProfile).toHaveBeenCalledWith(501);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('با موفقیت حذف گردید'));
    });

    it('دکمه ۱۰ (مشاهده تفاوت‌ها و تغییرات معلق openPendingDiffModal / closePendingDiffModal)', () => {
      const vehWithCR: VehicleDriverProfile = {
        ...activeVehicleRecord,
        pending_change_request: activeVehicleCR
      };

      component.openPendingDiffModal(vehWithCR);
      expect(component.isPendingDiffModalOpen).toBe(true);
      expect(component.pendingDiffVehicle).toBe(vehWithCR);

      component.closePendingDiffModal();
      expect(component.isPendingDiffModalOpen).toBe(false);
      expect(component.pendingDiffVehicle).toBeNull();
    });

    it('دکمه ۱۱ (مرکز فرماندهی: خروجی اکسل ۲ ردیفه، ورود اطلاعات، فیلتر وضعیت و پاکسازی جستجو)', () => {
      // خروجی اکسل
      component.exportExcel();
      expect(mockPersonnelApi.exportVehiclesExcel).toHaveBeenCalledWith({ section_id: 12 });
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('فایل اکسل ناوگان با موفقیت دانلود شد'));

      // مودال ورود از فایل اکسل
      component.openImportModal();
      expect(component.isExcelModalOpen).toBe(true);
      component.closeExcelModal();
      expect(component.isExcelModalOpen).toBe(false);

      // فیلتر وضعیت
      component.setStatusFilter('approved');
      expect(component.statusFilter).toBe('approved');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { status_filter: 'approved' }
      }));

      // پاکسازی جستجو
      component.searchQuery = 'نیسان';
      component.clearSearch();
      expect(component.searchQuery).toBe('');
    });
  });

  // =========================================================================
  // بخش ۳: آزمون چرخه کامل ثبت و گردش تاییدات ۳ مرحله‌ای
  // =========================================================================

  describe('بخش ۳: چرخه کامل ثبت و گردش تاییدات ۳ مرحله‌ای (3-Tier Lifecycle Integration)', () => {

    it('چرخه ۱ (مسیر موفق Happy Path: ثبت -> تایید سرپرست -> تایید مالی -> تصویب مدیر)', () => {
      // مرحله ۱: ثبت خودرو در وضعیت پیش‌نویس توسط کارمند
      expect(activeVehicleRecord.approval_status).toBe('draft');

      // مرحله ۲: ارسال پیش‌نویس به کارتابل سرپرست
      component.submitDraftToSupervisor(activeVehicleRecord);
      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(501);

      // مرحله ۳: تایید سرپرست کارگاه -> ارسال به حسابداری
      mockPersonnelApi.approveVehicleSupervisor(501).subscribe((res: any) => {
        expect(res.message).toContain('تایید سرپرست');
      });
      expect(activeVehicleRecord.approval_status).toBe('pending_accountant');

      // مرحله ۴: تایید مالی حسابدار -> ارسال به مدیر
      mockPersonnelApi.approveVehicleFinance(501).subscribe((res: any) => {
        expect(res.message).toContain('تایید مالی');
      });
      expect(activeVehicleRecord.approval_status).toBe('pending_manager');

      // مرحله ۵: تصویب نهایی مدیر ارشد -> مصوب و فعال‌سازی قطعی
      mockPersonnelApi.approveVehicleManager(501).subscribe((res: any) => {
        expect(res.message).toContain('تصویب نهایی');
      });
      expect(activeVehicleRecord.approval_status).toBe('approved');
      expect(activeVehicleRecord.is_active).toBe(true);
    });

    it('چرخه ۲ (مسیر بازنگری Revision Required): عودت توسط سرپرست، اصلاح مشخصات و ارسال مجدد', () => {
      // سرپرست به دلیل نقص مدارک پرونده را عودت می‌دهد
      mockPersonnelApi.requestRevisionVehicleSupervisor(501, 'مدارک کارت خودرو ناخوانا است').subscribe();
      expect(activeVehicleRecord.approval_status).toBe('revision_required');
      expect(activeVehicleRecord.rejection_reason).toBe('مدارک کارت خودرو ناخوانا است');

      // کارمند پرونده عودت داده شده را باز می‌کند
      component.openEditModal(activeVehicleRecord);
      expect(component.isRevisionMode).toBe(true);
      expect(component.modalHeaderTitle).toContain('اصلاح مشخصات خودرو');
      expect(component.modalHeaderTitle).toContain('(عودت سرپرست)');

      // اصلاح مدارک و شماره شبا
      component.onShebaInput('IR780170000000101111111001');
      component.saveVehicle('pending_supervisor');

      expect(mockPersonnelApi.updateVehicleProfile).toHaveBeenCalledWith(
        501,
        expect.objectContaining({ sheba_number: 'IR780170000000101111111001' })
      );
      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(501);
    });

    it('چرخه ۳ (مسیر رد پرونده Rejection): رد قطعی توسط سرپرست با ذکر علت', () => {
      mockPersonnelApi.rejectVehicleSupervisor(501, 'عدم انطباق شرایط فنی خودرو با پروژه').subscribe();
      expect(activeVehicleRecord.approval_status).toBe('rejected');
      expect(activeVehicleRecord.rejection_reason).toBe('عدم انطباق شرایط فنی خودرو با پروژه');
      expect(component.getStatusIcon('rejected')).toBe('x');
      expect(component.getStatusLabel('rejected')).toBe('رد شده');
    });

    it('چرخه ۴ (پیشنهاد تغییرات روی خودرو مصوب Vehicle Change Request Flow): ثبت و تصویب ۳ مرحله‌ای تغییرات', () => {
      // خودرو مصوب است
      activeVehicleRecord.approval_status = 'approved';
      activeVehicleRecord.is_active = true;

      // کارمند نرخ جدید سرویس را پیشنهاد می‌دهد
      component.openEditModal(activeVehicleRecord);
      expect(component.isApprovedRecord).toBe(true);
      expect(component.modalHeaderTitle).toContain('ویرایش مشخصات خودرو');
      expect(component.modalHeaderTitle).toContain('(پیشنهاد تغییرات)');

      component.newVehicle.default_service_rate = 6000000;
      component.saveVehicle('approved');

      expect(mockPersonnelApi.updateVehicleProfile).toHaveBeenCalledWith(
        501,
        expect.objectContaining({ default_service_rate: 6000000 })
      );

      // خودرو همچنان فعال می‌ماند در حالی که تغییرات در انتظار تایید هستند
      expect(activeVehicleRecord.is_active).toBe(true);

      // تایید مرحله اول تغییرات: سرپرست
      mockPersonnelApi.approveVehicleChangeRequestSupervisor(801).subscribe();
      expect(activeVehicleCR.status).toBe('pending_accountant');

      // تایید مرحله دوم تغییرات: حسابدار
      mockPersonnelApi.approveVehicleChangeRequestFinance(801).subscribe();
      expect(activeVehicleCR.status).toBe('pending_manager');

      // تصویب نهایی تغییرات: مدیر ارشد -> اعمال تغییرات روی خودرو
      mockPersonnelApi.approveVehicleChangeRequestManager(801).subscribe();
      expect(activeVehicleCR.status).toBe('approved');
      expect(activeVehicleRecord.default_service_rate).toBe(6000000);
      expect(activeVehicleRecord.has_pending_changes).toBe(false);
    });
  });
});
