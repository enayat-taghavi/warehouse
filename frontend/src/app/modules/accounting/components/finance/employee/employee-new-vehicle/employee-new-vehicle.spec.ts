// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { of, Subject } from 'rxjs';
import { VehicleDriverProfile, ProjectSection } from '../../../../models/personnel.model';

describe('EmployeeNewVehicleHubComponent Vitest Suite (Phase 4 & Refactor)', () => {
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ترابری', code: 'LOG', project: 1, project_name: 'پروژه مرکزی', is_active: true },
    { id: 20, name: 'بخش بتن', code: 'CON', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  const sampleVehicles: VehicleDriverProfile[] = [
    {
      id: 501,
      plate_number: '12 الف 345 ایران 63',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: 'رضا علوی',
      driver_national_code: '0012345678',
      driver_phone: '09121111111',
      default_service_rate: 1500000,
      bank_name: 'بانک ملت',
      sheba_number: 'IR780170000000101111111001',
      section: 10,
      approval_status: 'draft',
      is_active: true
    },
    {
      id: 502,
      plate_number: '34 ب 567 ایران 63',
      vehicle_type: 'khavar',
      ownership_type: 'company',
      driver_name: 'محسن کریمی',
      driver_national_code: '0023456789',
      driver_phone: '09122222222',
      default_service_rate: 2500000,
      bank_name: 'بانک ملی ایران',
      sheba_number: 'IR780170000000101111111001',
      section: 10,
      approval_status: 'approved',
      is_active: true
    },
    {
      id: 503,
      plate_number: '78 ج 901 ایران 63',
      vehicle_type: 'trailer',
      ownership_type: 'contract',
      driver_name: 'احمد مرادی',
      driver_phone: '09123333333',
      default_service_rate: 6000000,
      section: 10,
      approval_status: 'pending_supervisor',
      is_active: true
    }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee_fleet', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getVehicleProfiles: vi.fn().mockReturnValue(of(sampleVehicles)),
      createVehicleProfile: vi.fn().mockImplementation((data: any) => of({ id: 504, ...data })),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['fake excel content']))),
      downloadVehicleTemplate: vi.fn().mockReturnValue(of(new Blob(['fake template content']))),
      importVehicleExcelModal: vi.fn().mockReturnValue(of({
        success: true,
        dry_run: false,
        summary: { total_rows: 5, created: 3, updated: 2, skipped: 0, valid_count: 5, error_count: 0 },
        created_count: 3,
        updated_count: 2
      })),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([
        {
          id: 99,
          first_name: 'علیرضا',
          last_name: 'صادقی',
          national_code: '0078901234',
          phone_number: '09124445566',
          sheba_number: 'IR110110000000000000000001',
          job_title: 'راننده ترابری سنگین'
        }
      ])),
      submitVehicleProfile: vi.fn().mockReturnValue(of({ success: true, approval_status: 'pending_supervisor' }))
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
      queryParams: of({ section_id: '10' })
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
  });

  describe('۱. مقداردهی اولیه، ایزولاسیون بخش و وب‌سوکت', () => {
    it('باید بخش‌های مجاز کارمند را بارگذاری و بخش اول را انتخاب کند', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(component.mySections.length).toBe(2);
      expect(component.selectedSectionId).toBe(10);
      expect(component.selectedSection?.name).toBe('بخش ترابری');
    });

    it('باید لیست خودروهای بخش فعال را با پارامتر اجباری section_id واکشی کند', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalledWith({ section_id: 10 });
      expect(component.recentVehicles.length).toBe(3);
    });

    it('دریافت رویداد وب‌سوکت vehicle_updated باید لیست خودروها را رفرش کند', () => {
      component.ngOnInit();
      mockPersonnelApi.getVehicleProfiles.mockClear();

      mockWs.notifications$.next({
        type_str: 'vehicle_updated',
        section_id: 10,
        vehicle_id: 501
      });

      expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalledWith({ section_id: 10 });
    });

    it('تغییر بخش باید کوئری‌پارامتر URL را به‌روز کرده و خودروهای بخش جدید را لود کند', () => {
      component.ngOnInit();
      component.selectedSectionId = 20;
      component.onSectionChanged();

      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { section_id: 20 },
        queryParamsHandling: 'merge'
      });
      expect(mockPersonnelApi.getVehicleProfiles).toHaveBeenCalledWith({ section_id: 20 });
    });
  });

  describe('۲. اعتبارسنجی آنلاین شماره شبا، کد ملی و فرمت نرخ', () => {
    it('باید شماره شبا را اعتبارسنجی و نام بانک را به طور خودکار استخراج کند', () => {
      component.newVehicle.sheba_number = 'IR120120000000000000000001';
      component.onShebaChange();

      expect(component.shebaValidationResult).not.toBeNull();
      if (component.shebaValidationResult?.isValid) {
        expect(component.newVehicle.bank_name).toBe(component.shebaValidationResult.bank?.name);
      }
    });

    it('متد onShebaInput باید ارقام شبا را فرمت کند و نام بانک را تشخیص دهد', () => {
      component.onShebaInput({ target: { value: '120120000000000000000001' } });
      expect(component.shebaDigitsDisplay).toBeDefined();
      expect(component.newVehicle.sheba_number).toContain('120120000000000000000001');
    });

    it('کپی شبا در کلیپ‌بورد پیام موفقیت‌آمیز نمایش دهد', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });
      component.copyShebaToClipboard('IR780170000000101111111001');
      await Promise.resolve();
      expect(writeTextMock).toHaveBeenCalledWith('IR780170000000101111111001');
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('کلیپ‌بورد'));
    });

    it('اعتبارسنجی کد ملی ارقام نامعتبر یا تکراری را رد کند', () => {
      component.newVehicle.driver_national_code = '1111111111';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('تکراری');

      component.newVehicle.driver_national_code = '123';
      component.onNationalCodeChange();
      expect(component.nationalCodeError).toContain('۱۰ رقم');
    });

    it('ورود نرخ در onRateInput باید جداکننده سه رقمی را اعمال و معادل تومان را محاسبه کند', () => {
      component.onRateInput({ target: { value: '2500000' } });
      expect(component.newVehicle.default_service_rate).toBe(2500000);
      expect(component.rateInTomans).toBe(250000);
      expect(component.rateFormattedDisplay).toContain('۲');
    });
  });

  describe('۳. تفکیک و ترکیب ۴ بخشی پلاک ملی ایران', () => {
    it('باید رشته پلاک استاندارد را به ۴ بخش تفکیک کند', () => {
      component.parsePlateToParts('12 الف 345 ایران 63');
      expect(component.platePart1).toBe('12');
      expect(component.platePart2).toBe('الف');
      expect(component.platePart3).toBe('345');
      expect(component.platePart4).toBe('63');
    });

    it('ترکیب ۴ بخش پلاک باید رشته یکپارچه شماره پلاک ملی تولید کند', () => {
      component.platePart1 = '24';
      component.platePart2 = 'ج';
      component.platePart3 = '891';
      component.platePart4 = '63';
      component.updatePlateFromParts();

      expect(component.newVehicle.plate_number).toBe('24 ج 891 ایران 63');
    });
  });

  describe('۴. مدیریت مودال ثبت و ویرایش و ایجاد پیشنهاد تغییرات', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('باز کردن مودال جدید باید فیلدها را ریست کند', () => {
      component.openNewVehicleModal();
      expect(component.isNewVehicleModalOpen).toBe(true);
      expect(component.editingId).toBeNull();
      expect(component.newVehicle.plate_number).toBe('');
    });

    it('باز کردن مودال ویرایش باید مشخصات خودرو را در فرم بارگذاری کند', () => {
      const v = sampleVehicles[0];
      component.openEditModal(v);

      expect(component.isNewVehicleModalOpen).toBe(true);
      expect(component.editingId).toBe(v.id);
      expect(component.newVehicle.driver_name).toBe(v.driver_name);
      expect(component.platePart1).toBe('12');
      expect(component.platePart2).toBe('الف');
      expect(component.platePart3).toBe('345');
    });

    it('ثبت خودرو به صورت پیش‌نویس باید approval_status = draft را ارسال کند', () => {
      component.openNewVehicleModal();
      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      component.newVehicle.driver_name = 'سهراب سپهری';

      component.saveVehicle('draft');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(expect.objectContaining({
        driver_name: 'سهراب سپهری',
        section: 10
      }));
      expect(component.isNewVehicleModalOpen).toBe(false);
    });

    it('ثبت خودرو با ارسال به سرپرست باید approval_status = pending_supervisor را ارسال کند', () => {
      component.openNewVehicleModal();
      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      component.newVehicle.driver_name = 'سهراب سپهری';

      component.saveVehicle('pending_supervisor');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(expect.objectContaining({
        driver_name: 'سهراب سپهری',
        section: 10
      }));
      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(504);
    });

    it('ویرایش خودرو مصوب باید متد updateVehicleProfile را فراخوانی کرده و پیام درخواست تغییرات دهد', () => {
      const approvedVehicle = sampleVehicles[1];
      component.openEditModal(approvedVehicle);
      expect(component.isApprovedRecord).toBe(true);

      component.saveVehicle('approved');

      expect(mockPersonnelApi.updateVehicleProfile).toHaveBeenCalledWith(
        approvedVehicle.id,
        expect.objectContaining({ section: 10 })
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('درخواست تغییرات'));
    });

    it('متد submitDraftToSupervisor باید پیش‌نویس را مستقیماً به سرپرست ارسال کند', () => {
      const draftVehicle = sampleVehicles[0];
      component.submitDraftToSupervisor(draftVehicle);

      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(
        draftVehicle.id
      );
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('سرپرست'));
    });
  });

  describe('۵. فیلترها، جستجو، حذف و اکسل', () => {
    beforeEach(() => {
      component.ngOnInit();
      (component as any).confirmDialog = { open: vi.fn().mockResolvedValue(true) };
    });

    it('فیلتر وضعیت خودروها را به درستی محدود کند', () => {
      component.setStatusFilter('draft');
      expect(component.filteredVehicles.length).toBe(1);
      expect(component.filteredVehicles[0].approval_status).toBe('draft');

      component.setStatusFilter('approved');
      expect(component.filteredVehicles.length).toBe(1);
      expect(component.filteredVehicles[0].approval_status).toBe('approved');
    });

    it('شاخص‌های vehicleMetrics را به درستی محاسبه کند', () => {
      const metrics = component.vehicleMetrics;
      expect(metrics.total).toBe(3);
      expect(metrics.drafts).toBe(1);
      expect(metrics.pending).toBe(1);
      expect(metrics.approved).toBe(1);
      expect(metrics.contractCount).toBe(2);
    });

    it('حذف خودرو پیش‌نویس را اجرا کند', async () => {
      const draftVehicle = sampleVehicles[0];
      await component.deleteDraftVehicle(draftVehicle);

      expect(mockPersonnelApi.deleteVehicleProfile).toHaveBeenCalledWith(draftVehicle.id);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('حذف گردید'));
    });

    it('حذف خودروهای مصوب را مسدود کند', () => {
      const approvedVehicle = sampleVehicles[1];
      component.deleteDraftVehicle(approvedVehicle);

      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('فقط خودروهای در وضعیت پیش‌نویس'));
      expect(mockPersonnelApi.deleteVehicleProfile).not.toHaveBeenCalled();
    });

    it('متد openImportModal باید توابع excelImportFn و excelTemplateFn را مقداردهی کند', () => {
      component.openImportModal();
      expect(component.isExcelModalOpen).toBe(true);
      expect(typeof component.excelImportFn).toBe('function');
      expect(typeof component.excelTemplateFn).toBe('function');
    });

    it('کلید Escape باید مودال‌های باز را ببندد', () => {
      component.isNewVehicleModalOpen = true;
      component.handleEscape();
      expect(component.isNewVehicleModalOpen).toBe(false);
    });
  });

  describe('۶. آزمایش جامع نواقص نه گانه طرح تکمیلی (Deficiencies Plan Verification)', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('نقص ۳ و بند ۲۲: کلیک مجدد روی تب فعال وضعیت باید فیلتر را به all تاگل کند', () => {
      component.setStatusFilter('draft');
      expect(component.statusFilter).toBe('draft');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { status_filter: 'draft' },
        queryParamsHandling: 'merge'
      });

      // کلیک مجدد روی تب draft
      component.setStatusFilter('draft');
      expect(component.statusFilter).toBe('all');
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        relativeTo: mockRoute,
        queryParams: { status_filter: null },
        queryParamsHandling: 'merge'
      });
    });

    it('نقص ۲ و بند ۲۴: رکوردهای در جریان یا رد شده باید به عنوان فقط‌خواندنی (isReadOnlyMode) شناسایی شوند', () => {
      const pendingVehicle = sampleVehicles[2]; // approval_status: 'pending_supervisor'
      expect(component.isReadOnlyVehicle(pendingVehicle)).toBe(true);

      component.openEditModal(pendingVehicle);
      expect(component.isReadOnlyMode).toBe(true);
      expect(component.modalHeaderTitle).toContain('مشاهده پرونده خودرو');

      // تلاش برای ذخیره در حالت فقط خواندنی باید مودال را ببندد و فراخوانی API انجام ندهد
      component.saveVehicle('draft');
      expect(mockPersonnelApi.updateVehicleProfile).not.toHaveBeenCalled();
      expect(component.isNewVehicleModalOpen).toBe(false);
    });

    it('نقص ۲: رکوردهای پیش‌نویس و عودت‌داده‌شده نباید فقط‌خواندنی باشند', () => {
      const draftVehicle = sampleVehicles[0]; // approval_status: 'draft'
      expect(component.isReadOnlyVehicle(draftVehicle)).toBe(false);
      component.openEditModal(draftVehicle);
      expect(component.isReadOnlyMode).toBe(false);
      expect(component.modalHeaderTitle).toContain('ویرایش پیش‌نویس خودرو');
    });

    it('نقص ۱ و بند ۲۱: تفکیک راننده و مالک خودرو و اعتبارسنجی کدملی مالک', () => {
      component.openNewVehicleModal();
      expect(component.newVehicle.is_driver_owner).toBe(true);

      // برداشتن تیک «مالک شخص راننده است»
      component.toggleIsDriverOwner(false);
      expect(component.newVehicle.is_driver_owner).toBe(false);

      // ورود کدملی تکراری برای مالک
      component.newVehicle.owner_national_code = '1111111111';
      component.onOwnerNationalCodeChange();
      expect(component.ownerNationalCodeError).toContain('تکراری');

      // ورود کدملی کمتر از ۱۰ رقم
      component.newVehicle.owner_national_code = '12345';
      component.onOwnerNationalCodeChange();
      expect(component.ownerNationalCodeError).toContain('۱۰ رقم');

      // بازگرداندن تیک به true باید فیلدهای مالک را پاک کند
      component.toggleIsDriverOwner(true);
      expect(component.newVehicle.is_driver_owner).toBe(true);
      expect(component.newVehicle.owner_name).toBe('');
      expect(component.newVehicle.owner_national_code).toBe('');
      expect(component.ownerNationalCodeError).toBeNull();
    });

    it('نقص ۱: ذخیره خودرو استیجاری با مالک مجزا باید فیلدهای مالک را در پیلود ارسال کند', () => {
      component.openNewVehicleModal();
      component.platePart1 = '55';
      component.platePart2 = 'ط';
      component.platePart3 = '789';
      component.platePart4 = '63';
      component.newVehicle.driver_name = 'بهرام صادقی';
      component.toggleIsDriverOwner(false);
      component.newVehicle.owner_name = 'محمود کاظمی';
      component.newVehicle.owner_national_code = '0078901235';
      component.newVehicle.owner_phone = '09127778899';

      component.saveVehicle('draft');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(expect.objectContaining({
        driver_name: 'بهرام صادقی',
        is_driver_owner: false,
        owner_name: 'محمود کاظمی',
        owner_national_code: '0078901235',
        owner_phone: '09127778899'
      }));
    });

    it('نقص ۸ و بند ۱۶: تطابق خودکار مشخصات راننده با پرسنل ثبت‌شده شرکت بر اساس کد ملی', () => {
      component.openNewVehicleModal();
      component.newVehicle.driver_national_code = '0078901235';
      component.onNationalCodeChange();

      expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ search: '0078901235' });
    });

    it('نقص ۵ و بند ۳: ترجمه فارسی و فرمت‌بندی دوطرفه فیلدهای تغییرات در مودال Diff', () => {
      expect(component.getFieldLabel('driver_name')).toBe('نام راننده');
      expect(component.getFieldLabel('default_service_rate')).toBe('نرخ پایه سرویس (ریال)');
      expect(component.getFieldLabel('is_driver_owner')).toBe('مالک شخص راننده است');
      expect(component.getFieldLabel('owner_name')).toBe('نام مالک');

      const vehicleWithDiff: VehicleDriverProfile = {
        ...sampleVehicles[1],
        pending_change_request: {
          id: 901,
          status: 'pending_supervisor',
          created_at: '2026-09-22T10:00:00Z',
          proposed_changes: {
            driver_name: 'محسن کریمی‌زاده',
            default_service_rate: 3000000
          },
          previous_values: {
            driver_name: 'محسن کریمی',
            default_service_rate: 2500000
          }
        }
      };

      component.openPendingDiffModal(vehicleWithDiff);
      expect(component.isPendingDiffModalOpen).toBe(true);
      expect(component.pendingDiffVehicle).toBe(vehicleWithDiff);

      expect(component.getPreviousValueDisplay('driver_name')).toBe('محسن کریمی');
      expect(component.getProposedValueDisplay('driver_name', 'محسن کریمی‌زاده')).toBe('محسن کریمی‌زاده');
      expect(component.getPreviousValueDisplay('default_service_rate')).toContain('ریال');
    });

    it('نقص ۷ و بند ۱۵: دسته‌بندی انواع خودرو شامل گروه‌های سبک، سنگین و تجهیزات انبار', () => {
      expect(component.vehicleGroups.length).toBe(3);
      expect(component.vehicleGroups[0].group).toBe('سبک و نیمه‌باری');
      expect(component.vehicleGroups[1].group).toBe('سنگین و تجاری');
      expect(component.vehicleGroups[2].group).toBe('ماشین‌آلات و تجهیزات انبار');

      const equipmentTypes = component.vehicleGroups[2].types.map(t => t.value);
      expect(equipmentTypes).toContain('forklift');
      expect(equipmentTypes).toContain('other');
    });
  });

  describe('۹. استاندارد جامع بانک، شماره حساب و تبدیل دوطرفه به شبا (ناوگان)', () => {
    it('باید filteredBanks بر اساس جستجو درست فیلتر شود', () => {
      component.bankSearchQuery = 'ملت';
      expect(component.filteredBanks.some(b => b.name.includes('ملت'))).toBe(true);

      component.bankSearchQuery = '';
      expect(component.filteredBanks.length).toBe(component.iranianBanks.length);
    });

    it('انتخاب بانک از دراپ‌داون باید بانک را ست کرده و دراپ‌داون را ببندد', () => {
      const bank = component.iranianBanks.find(b => b.code === '017')!; // بانک ملی
      component.isBankDropdownOpen = true;
      component.selectBankFromDropdown(bank);

      expect(component.newVehicle.bank_name).toBe(bank.name);
      expect(component.isBankDropdownOpen).toBe(false);
      expect(component.bankSearchQuery).toBe('');
    });

    it('ورود شماره حساب به همراه بانک معتبر باید خودکار شماره شبا را تولید کند', () => {
      component.newVehicle.bank_name = 'بانک ملی ایران';
      component.onAccountNumberInput('0101111111001');

      expect(component.newVehicle.account_number).toBe('0101111111001');
      expect(component.newVehicle.sheba_number).toMatch(/^IR\d{24}$/);
      expect(component.shebaValidationResult?.isValid).toBe(true);
    });

    it('انتخاب بانک در صورتی که شماره حساب معتبر موجود باشد باید شبا را مجدداً محاسبه و تولید کند', () => {
      component.newVehicle.account_number = '0101111111001';
      component.onBankSelect('بانک ملی ایران');

      expect(component.newVehicle.sheba_number).toMatch(/^IR\d{24}$/);
      expect(component.shebaValidationResult?.isValid).toBe(true);
    });

    it('کلیک بر دکمه تبدیل دستی convertAccountToShebaNow باید با اخطار یا موفقیت پیام دهد', () => {
      // بدون انتخاب بانک
      component.newVehicle.bank_name = '';
      component.convertAccountToShebaNow();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('بانک عامل'));

      // با بانک و شماره حساب معتبر
      component.newVehicle.bank_name = 'بانک ملی ایران';
      component.newVehicle.account_number = '0101111111001';
      component.convertAccountToShebaNow();

      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره شبا با موفقیت'));
      expect(component.newVehicle.sheba_number).toMatch(/^IR\d{24}$/);
    });

    it('متد copyAccountNumberToClipboard باید شماره حساب را کپی کرده و پرچم isAccountCopied را فعال کند', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation(() => Promise.resolve())
        }
      });
      component.newVehicle.account_number = '0101111111001';
      component.copyAccountNumberToClipboard();
      expect(component.isAccountCopied).toBe(true);
      await Promise.resolve();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره حساب'));
    });
  });
});
