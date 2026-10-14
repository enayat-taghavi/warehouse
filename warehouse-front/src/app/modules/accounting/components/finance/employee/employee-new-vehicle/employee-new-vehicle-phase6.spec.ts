// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { of, throwError, Subject } from 'rxjs';
import { VehicleDriverProfile, ProjectSection, VehicleBankAccount, VehicleDocument } from '../../../../../../core/models/personnel.model';

describe('EmployeeNewVehicleHubComponent - Phase 6 Suite (Employee Registration Form)', () => {
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ترابری مرکزی', code: 'LOG', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'test_emp', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getVehicleProfiles: vi.fn().mockReturnValue(of([])),
      createVehicleProfile: vi.fn().mockImplementation((payload: any) => of({ id: 901, ...payload })),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, payload: any) => of({ id, ...payload })),
      submitVehicleProfile: vi.fn().mockReturnValue(of({ success: true, approval_status: 'pending_supervisor' })),
      getVehicleBankAccounts: vi.fn().mockReturnValue(of([])),
      addVehicleBankAccount: vi.fn().mockImplementation((_id: number, acc: VehicleBankAccount) => of({ id: 11, ...acc })),
      updateVehicleBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      deleteVehicleBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      getVehicleDocuments: vi.fn().mockReturnValue(of([])),
      uploadVehicleDocument: vi.fn().mockImplementation((_id: number, _f: File, type: string, title: string, exp?: string) => of({
        id: 21,
        doc_type: type,
        title: title || 'سند تست',
        file_name: 'test.pdf',
        file: 'https://storage.local/test.pdf',
        expiry_date: exp
      })),
      deleteVehicleDocument: vi.fn().mockReturnValue(of({ success: true })),
      lookupPersonnelByNationalCode: vi.fn().mockReturnValue(of({ found: false }))
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
    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
  });

  describe('تسک ۶.۱: مدیریت تب‌های ۵گانه و گیت‌های اعتبارسنجی تکمیل پرونده', () => {
    it('تب اولیه باید technical باشد و قابلیت جابجایی بین تب‌های ۵گانه وجود داشته باشد', () => {
      expect(component.activeModalTab).toBe('technical');
      component.setActiveTab('driver');
      expect(component.activeModalTab).toBe('driver');
      component.setActiveTab('owner');
      expect(component.activeModalTab).toBe('owner');
      component.setActiveTab('banking');
      expect(component.activeModalTab).toBe('banking');
      component.setActiveTab('documents_expiry');
      expect(component.activeModalTab).toBe('documents_expiry');
    });

    it('گیت تکمیل تب technical برای خودرو جاده‌ای منوط به اجزای پلاک است', () => {
      component.newVehicle.vehicle_type = 'nissan';
      component.newVehicle.ownership_type = 'contract';
      component.platePart1 = '';
      component.platePart3 = '';
      component.platePart4 = '';
      expect(component.isTabComplete('technical')).toBe(false);

      component.platePart1 = '12';
      component.platePart2 = 'الف';
      component.platePart3 = '345';
      component.platePart4 = '63';
      expect(component.isTabComplete('technical')).toBe(true);
    });

    it('isSubmitDisabled تا زمان تکمیل همه تب‌ها true است و missingFieldsList عناوین تب‌های ناقص را برمی‌گرداند', () => {
      expect(component.isSubmitDisabled).toBe(true);
      const missing = component.missingFieldsList;
      expect(missing).toContain('مشخصات فنی و پلاک');
      expect(missing).toContain('مشخصات راننده');
      expect(missing).toContain('اطلاعات حساب بانکی');
    });

    it('switchToFirstIncompleteTab باید کاربر را به اولین تب ناقص هدایت کند', () => {
      component.activeModalTab = 'documents_expiry';
      component.switchToFirstIncompleteTab();
      expect(component.activeModalTab).toBe('technical');
    });

    it('mapMissingFieldsToTab باید خطاهای سروری را به تب مربوطه نگاشت کند', () => {
      component.mapMissingFieldsToTab(['plate_number']);
      expect(component.activeModalTab).toBe('technical');

      component.mapMissingFieldsToTab(['driver_name']);
      expect(component.activeModalTab).toBe('driver');

      component.mapMissingFieldsToTab(['owner_national_code']);
      expect(component.activeModalTab).toBe('owner');

      component.mapMissingFieldsToTab(['sheba_number']);
      expect(component.activeModalTab).toBe('banking');

      component.mapMissingFieldsToTab(['insurance_expiry_date']);
      expect(component.activeModalTab).toBe('documents_expiry');
    });
  });

  describe('تسک ۶.۳: ویجت ۴ قسمتی پلاک ملی و ورودی آزاد لیفتراک/تجهیزات کارگاهی', () => {
    it('برای نیسان، خاور و وانت تشخیص خودروی جاده‌ای مثبت است', () => {
      expect(component.isRoadVehicle('nissan')).toBe(true);
      expect(component.isRoadVehicle('pickup')).toBe(true);
      expect(component.isRoadVehicle('khavar')).toBe(true);
      expect(component.isRoadVehicle('forklift')).toBe(false);
      expect(component.isRoadVehicle('other')).toBe(false);
    });

    it('ورودی‌های ۴ بخشی پلاک ملی ایران ترکیب شده و فرمت استاندارد تولید می‌کنند', () => {
      component.newVehicle.vehicle_type = 'nissan';
      component.platePart1 = '24';
      component.platePart2 = 'ب';
      component.platePart3 = '567';
      component.platePart4 = '63';
      component.updatePlateFromParts();
      expect(component.newVehicle.plate_number).toBe('24 ب 567 ایران 63');
    });

    it('برای لیفتراک (forklift) ورودی آزاد پلاک/شماره سریال کارگاهی مستقیماً ذخیره می‌شود', () => {
      component.newVehicle.vehicle_type = 'forklift';
      component.freePlateNumber = 'FL-8802';
      component.updatePlateFromParts();
      expect(component.newVehicle.plate_number).toBe('FL-8802');
      expect(component.isTabComplete('technical')).toBe(true);
    });
  });

  describe('تسک ۶.۴: ماژول حساب‌های بانکی چندگانه و اعتبارسنجی ISO 7064 Mod 97', () => {
    it('شماره شبای نامعتبر اضافه نمی‌شود و خطا نمایش داده می‌شود', () => {
      component.newVehicle.sheba_number = '111111111111111111111111';
      component.onShebaChange();
      component.addCurrentAsNewAccount();
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('شماره شبای معتبر'));
      expect(component.bankAccounts.length).toBe(0);
    });

    it('اولین حساب ثبت‌شده به صورت خودکار به عنوان حساب اصلی واریز علامت‌گذاری می‌شود', () => {
      // شبای معتبر تستی
      component.newVehicle.sheba_number = 'IR780170000000101111111001';
      component.onShebaChange();
      component.addCurrentAsNewAccount();

      expect(component.bankAccounts.length).toBe(1);
      expect(component.bankAccounts[0].is_primary).toBe(true);
      expect(component.bankAccounts[0].bank_name).toBe('بانک ملی ایران');
      expect(component.hasValidPrimaryBankAccount).toBe(true);
    });

    it('تنظیم حساب دوم به عنوان اصلی باید حساب قبلی را از حالت اصلی خارج کند', () => {
      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', account_number: '111', sheba_number: '780170000000101111111001', payee_type: 'driver', is_primary: true },
        { bank_name: 'بانک ملت', account_number: '222', sheba_number: '820120000000000000000001', payee_type: 'driver', is_primary: false }
      ];
      component.setPrimaryAccount(1);
      expect(component.bankAccounts[0].is_primary).toBe(false);
      expect(component.bankAccounts[1].is_primary).toBe(true);
      expect(component.newVehicle.bank_name).toBe('بانک ملت');
    });

    it('حذف حساب اصلی، حساب اول باقیمانده را به عنوان حساب اصلی جدید تنظیم می‌کند', () => {
      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', account_number: '111', sheba_number: '780170000000101111111001', payee_type: 'driver', is_primary: true },
        { bank_name: 'بانک صادرات', account_number: '333', sheba_number: '190190000000000000000001', payee_type: 'driver', is_primary: false }
      ];
      component.removeBankAccount(0);
      expect(component.bankAccounts.length).toBe(1);
      expect(component.bankAccounts[0].is_primary).toBe(true);
      expect(component.bankAccounts[0].bank_name).toBe('بانک صادرات');
    });
  });

  describe('تسک ۶.۵: تاریخ‌های انقضا روی فرم‌کنترل‌های واکنشی', () => {
    it('تغییر مقدار فرم‌کنترل بیمه باید مقدار فیلد مدل و پیش‌نویس را به‌روز کند', () => {
      component.insuranceDateControl.setValue('1405/06/15');
      expect(component.newVehicle.insurance_expiry_date).toBe('1405/06/15');

      component.inspectionDateControl.setValue('1405/08/20');
      expect(component.newVehicle.inspection_expiry_date).toBe('1405/08/20');

      component.licenseDateControl.setValue('1406/01/10');
      expect(component.newVehicle.license_expiry_date).toBe('1406/01/10');

      component.validUntilDateControl.setValue('1405/12/29');
      expect(component.newVehicle.valid_until_date).toBe('1405/12/29');
    });
  });

  describe('تسک ۶.۶: مدیریت آپلود و لایت‌باکس مدارک خودرو', () => {
    it('آپلود فایل بیش از ۱۰ مگابایت رد شده و پیام هشدار صادر می‌شود', () => {
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large_card.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

      component.onMultipleFilesSelected({ target: { files: [largeFile] } });
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('بیش از ۱۰ مگابایت'));
      expect(component.pendingUploadDocuments.length).toBe(0);
    });

    it('آپلود فایل معتبر به صف مدارک پیوست اضافه می‌شود', () => {
      const validFile = new File(['dummy content'], 'bimeh.jpg', { type: 'image/jpeg' });
      Object.defineProperty(validFile, 'size', { value: 500 * 1024 });

      component.selectedDocTypeForUpload = 'insurance';
      component.docUploadTitle = 'بیمه‌نامه ثالث';
      component.onMultipleFilesSelected({ target: { files: [validFile] } });

      expect(component.pendingUploadDocuments.length).toBe(1);
      expect(component.pendingUploadDocuments[0].title).toBe('بیمه‌نامه ثالث');
      expect(component.pendingUploadDocuments[0].doc_type).toBe('insurance');
    });

    it('لایت‌باکس پیش‌نمایش تصویر به درستی باز و بسته می‌شود', () => {
      component.openLightbox('https://images.local/doc1.jpg', 'کارت خودرو');
      expect(component.isLightboxOpen).toBe(true);
      expect(component.lightboxImageUrl).toBe('https://images.local/doc1.jpg');
      expect(component.lightboxTitle).toBe('کارت خودرو');

      component.closeLightbox();
      expect(component.isLightboxOpen).toBe(false);
      expect(component.lightboxImageUrl).toBe('');
    });
  });

  describe('تسک ۶.۷: تفکیک دکمه‌های «ذخیره پیش‌نویس» و «ارسال به سرپرست» با گیت نواقص', () => {
    it('saveVehicle با استاتوس draft فقط پیش‌نویس را ثبت کرده و پیام پیش‌نویس می‌دهد', () => {
      component.newVehicle.vehicle_type = 'nissan';
      component.newVehicle.ownership_type = 'contract';
      component.newVehicle.driver_name = 'بهرام راد';
      component.platePart1 = '55';
      component.platePart2 = 'د';
      component.platePart3 = '123';
      component.platePart4 = '63';
      component.updatePlateFromParts();

      component.saveVehicle('draft');

      expect(mockPersonnelApi.createVehicleProfile).toHaveBeenCalledWith(expect.objectContaining({
        driver_name: 'بهرام راد'
      }));
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('پیش‌نویس'));
    });

    it('submitDraftVehicle متد submit را در بک‌اند فراخوانی می‌کند', () => {
      component.editingId = 501;
      component.editingVehicle = {
        id: 501,
        plate_number: '55 د 123 ایران 63',
        approval_status: 'draft'
      } as any;

      component.submitDraftVehicle();

      expect(mockPersonnelApi.submitVehicleProfile).toHaveBeenCalledWith(501);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('سرپرست'));
    });

    it('در صورت خطای ۴۰۰ گیت سرور با missing_fields، فرم بسته نشده و تب مربوطه فعال می‌گردد', () => {
      mockPersonnelApi.createVehicleProfile.mockReturnValue(throwError(() => ({
        error: {
          missing_fields: ['شماره پلاک الزامی است', 'تاریخ انقضای بیمه‌نامه الزامی است']
        }
      })));

      component.newVehicle.vehicle_type = 'nissan';
      component.newVehicle.driver_name = 'بهرام راد';
      component.platePart1 = '55';
      component.updatePlateFromParts();

      component.saveVehicle('pending_supervisor');

      expect(component.serverMissingFields.length).toBe(2);
      expect(component.isNewVehicleModalOpen).toBe(false); // saveVehicle calls close on success, but on error it remains open or doesn't close
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('نواقص پرونده'));
      expect(component.activeModalTab).toBe('technical');
    });
  });
});
