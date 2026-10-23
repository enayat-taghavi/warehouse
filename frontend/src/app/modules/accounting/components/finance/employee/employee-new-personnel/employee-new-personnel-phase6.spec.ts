// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmployeeNewPersonnelHubComponent } from './employee-new-personnel';
import { of, throwError, Subject } from 'rxjs';
import { PersonnelProfile, ProjectSection, PersonnelBankAccount, PersonnelDocument } from '../../../../models/personnel.model';

describe('آزمون‌های جامع فاز ۶ - گردش کار ثبت پرسنل کارمند و مودال ۵ تب (Phase 6 Unit & DOM Tests)', () => {
  let component: EmployeeNewPersonnelHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSection: ProjectSection = {
    id: 10,
    name: 'بخش مرکزی انبار',
    code: 'SEC10',
    project: 1,
    project_name: 'پروژه مرکزی',
    is_active: true
  };

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'test_emp', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([sampleSection])),
      getProjectSections: vi.fn().mockReturnValue(of([sampleSection])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([])),
      getJobTitles: vi.fn().mockReturnValue(of({
        job_titles: ['کارگر انبار', 'راننده پایه یک', 'حسابدار انبار'],
        job_items: [
          { title: 'کارگر انبار', job_codes: ['900101', '900102'] },
          { title: 'راننده پایه یک', job_codes: ['800201'] }
        ]
      })),
      lookupPersonnelByNationalCode: vi.fn().mockReturnValue(of({ found: false })),
      createPersonnelProfile: vi.fn().mockImplementation((data: any) => of({ id: 301, ...data })),
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
      downloadPersonnelTemplate: vi.fn().mockReturnValue(of(new Blob(['fake template content']))),
      reopenPersonnelProfile: vi.fn().mockImplementation((id: number) => of({
        message: 'ok',
        data: { id, first_name: 'جواد', last_name: 'نادری', national_code: '0010376488', approval_status: 'draft' }
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
      queryParams: of({})
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

    component.selectedSectionId = sampleSection.id!;
    component.selectedSection = sampleSection;
    component.openNewPersonnelModal();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── تسک ۶.۱: مودال ۵ تب و سوئیچ بین گام‌ها ───
  describe('تسک ۶.۱: مدیریت تب‌های ۵گانه و تکمیل گام‌ها', () => {
    it('باید تب اولیه روی identity تنظیم شده باشد', () => {
      expect(component.activeModalTab).toBe('identity');
    });

    it('باید بتوان تب را با setActiveTab به job، banking، address و documents تغییر داد', () => {
      component.setActiveTab('job');
      expect(component.activeModalTab).toBe('job');

      component.setActiveTab('banking');
      expect(component.activeModalTab).toBe('banking');

      component.setActiveTab('address');
      expect(component.activeModalTab).toBe('address');

      component.setActiveTab('documents');
      expect(component.activeModalTab).toBe('documents');
    });

    it('متد isTabComplete برای تب identity تا زمان تکمیل نام، نام خانوادگی، کد ملی و پدر باید false باشد', () => {
      expect(component.isTabComplete('identity')).toBe(false);

      component.newPersonnel.first_name = 'محمدرضا';
      component.newPersonnel.last_name = 'اکبری';
      component.newPersonnel.national_code = '0010376488';
      component.newPersonnel.father_name = 'علی';
      component.newPersonnel.birth_date = '1370/01/01';
      component.newPersonnel.id_number = '1234';
      component.newPersonnel.gender = 'مرد';

      expect(component.isTabComplete('identity')).toBe(true);
    });

    it('تب مدارک (documents) باید همواره تکمیل‌شده در نظر گرفته شود (مدارک اختیاری)', () => {
      expect(component.isTabComplete('documents')).toBe(true);
    });
  });

  // ─── تسک ۶.۲: فرم هویتی، موبایل و کد پستی ───
  describe('تسک ۶.۲: اعتبارسنجی ارقام فارسی، موبایل ۰۹ و کد پستی ۱۰ رقمی', () => {
    it('ورود شماره همراه با ارقام فارسی باید نرمال‌سازی شده و ساختار ۰۹ اعتبارسنجی گردد', () => {
      component.onPhoneInput({ target: { value: '۰۹۱۲۳۴۵۶۷۸۹' } });
      expect(component.newPersonnel.phone_number).toBe('09123456789');
      expect(component.phoneError).toBeNull();
    });

    it('شماره همراه کمتر از ۱۱ رقم یا بدون ۰۹ باید خطا ثبت کند', () => {
      component.onPhoneInput({ target: { value: '08123456789' } });
      expect(component.phoneError).toContain('۰۹');

      component.onPhoneInput({ target: { value: '0912' } });
      expect(component.phoneError).toContain('۱۱ رقم');
    });

    it('کد پستی ۱۰ رقمی با ارقام فارسی باید تمیز و اعتبارسنجی شود', () => {
      component.onPostalCodeInput({ target: { value: '۱۲۳۴۵۶۷۸۹۰' } });
      expect(component.newPersonnel.postal_code).toBe('1234567890');
      expect(component.postalCodeError).toBeNull();
    });

    it('کد پستی نامعتبر با ارقام یکسان یا کمتر از ۱۰ رقم باید خطا دهد', () => {
      component.onPostalCodeInput({ target: { value: '1111111111' } });
      expect(component.postalCodeError).toContain('نامعتبر');

      component.onPostalCodeInput({ target: { value: '12345' } });
      expect(component.postalCodeError).toContain('۱۰ رقم');
    });
  });

  // ─── تسک ۶.۳: استعلام کد ملی و بازگشایی پرونده ردشده ───
  describe('تسک ۶.۳: استعلام هوشمند کد ملی و بازگشایی پرونده ردشده', () => {
    it('استعلام کد ملی در صورت رد شدن پرونده قبلی باید پرچم isFoundPersonnelRejected را فعال کند', () => {
      mockPersonnelApi.lookupPersonnelByNationalCode.mockReturnValue(of({
        found: true,
        personnel: {
          id: 404,
          first_name: 'جواد',
          last_name: 'نادری',
          national_code: '0010376488',
          approval_status: 'rejected'
        }
      }));

      component.lookupExistingPersonnel('0010376488');
      expect(component.foundExistingPersonnel).toBeTruthy();
      expect(component.isFoundPersonnelRejected).toBe(true);
    });

    it('فراخوانی reopenRejectedPersonnel باید پرونده ردشده را در مودال باز کند و پیام اطلاع‌رسانی دهد', () => {
      component.foundExistingPersonnel = {
        id: 404,
        first_name: 'جواد',
        last_name: 'نادری',
        national_code: '0010376488',
        approval_status: 'rejected'
      };
      component.isFoundPersonnelRejected = true;

      component.reopenRejectedPersonnel();
      // بازگشایی در سرور (rejected ← draft) پیش از بازکردن فرم (DEF-15)
      expect(mockPersonnelApi.reopenPersonnelProfile).toHaveBeenCalledWith(404);
      expect(component.editingPersonnel?.approval_status).toBe('draft');
      expect(component.editingId).toBe(404);
      expect(component.newPersonnel.first_name).toBe('جواد');
      expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('بازگشایی'));
    });
  });

  // ─── تسک ۶.۴: کامپوننت حساب‌های بانکی چندگانه ───
  describe('تسک ۶.۴: مدیریت حساب‌های بانکی چندگانه و الگوریتم شبا', () => {
    it('افزودن حساب بانکی جدید با شبای معتبر باید به لیست bankAccounts افزوده شود', () => {
      component.newPersonnel.bank_name = 'بانک ملی ایران';
      component.newPersonnel.account_number = '0101111111001';
      component.newPersonnel.sheba_number = 'IR780170000000101111111001';
      component.shebaValidationResult = { isValid: true, rawSheba: 'IR780170000000101111111001' } as any;

      component.addCurrentAsNewAccount();
      expect(component.bankAccounts.length).toBe(1);
      expect(component.bankAccounts[0].is_primary).toBe(true);
      expect(component.hasValidPrimaryBankAccount).toBe(true);
    });

    it('تغییر حساب اصلی با setPrimaryAccount باید فیلدهای ریشه را همگام کند', () => {
      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', sheba_number: '780170000000101111111001', account_number: '111', is_primary: true },
        { bank_name: 'بانک ملت', sheba_number: '820120000000001111111111', account_number: '222', is_primary: false }
      ];

      component.setPrimaryAccount(1);
      expect(component.bankAccounts[0].is_primary).toBe(false);
      expect(component.bankAccounts[1].is_primary).toBe(true);
      expect(component.newPersonnel.bank_name).toBe('بانک ملت');
    });

    it('حذف حساب بانکی با removeBankAccount باید حساب را از آرایه خارج کند', () => {
      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', sheba_number: '780170000000101111111001', account_number: '111', is_primary: true },
        { bank_name: 'بانک ملت', sheba_number: '820120000000001111111111', account_number: '222', is_primary: false }
      ];

      component.removeBankAccount(0);
      expect(component.bankAccounts.length).toBe(1);
      expect(component.bankAccounts[0].is_primary).toBe(true);
    });
  });

  // ─── تسک ۶.۵: مشخصات شغلی و تفکیک وظایف SoD ───
  describe('تسک ۶.۵: فیلدهای شغلی و تطبیق کدهای ۶ رقمی بیمه بدون فیلدهای دستمزد', () => {
    it('انتخاب عنوان شغلی باید کدهای بیمه مرتبط را بارگذاری کند', () => {
      component.jobItems = [
        { title: 'کارگر انبار', job_codes: ['900101', '900102'] }
      ];

      component.onJobTitleSelect('کارگر انبار');
      expect(component.availableJobCodes).toEqual(['900101', '900102']);
      expect(component.newPersonnel.job_code).toBe('900101');
    });

    it('انتخاب مستقیم کد شغل باید فیلد job_code را تغییر دهد', () => {
      component.selectJobCode('900102');
      expect(component.newPersonnel.job_code).toBe('900102');
    });

    it('ورود دستی کد شغل بیمه باید به ۶ رقم محدود شود', () => {
      component.onJobCodeInput({ target: { value: '۱۲۳۴۵۶۷۸' } });
      expect(component.newPersonnel.job_code).toBe('123456');
    });
  });

  // ─── تسک ۶.۶: مدیریت مدارک چندگانه و لایت‌باکس ───
  describe('تسک ۶.۶: آپلود مدارک چندگانه و پیش‌نمایش در لایت‌باکس', () => {
    it('انتخاب فایل‌های معتبر باید به صف pendingUploadDocuments اضافه شود', () => {
      const mockFile = new File(['dummy content'], 'national_card.jpg', { type: 'image/jpeg' });
      const mockEvent = {
        target: {
          files: [mockFile]
        }
      };

      component.selectedDocTypeForUpload = 'national_card';
      component.onMultipleFilesSelected(mockEvent);

      expect(component.pendingUploadDocuments.length).toBe(1);
      expect(component.pendingUploadDocuments[0].name).toBe('national_card.jpg');
      expect(component.pendingUploadDocuments[0].doc_type).toBe('national_card');
    });

    it('متدهای openLightbox و closeLightbox باید وضعیت لایت‌باکس را کنترل کنند', () => {
      component.openLightbox('https://example.com/doc.jpg', 'تصویر کارت ملی');
      expect(component.isLightboxOpen).toBe(true);
      expect(component.lightboxImageUrl).toBe('https://example.com/doc.jpg');
      expect(component.lightboxTitle).toBe('تصویر کارت ملی');

      component.closeLightbox();
      expect(component.isLightboxOpen).toBe(false);
      expect(component.lightboxImageUrl).toBe('');
    });
  });

  // ─── تسک ۶.۷: گیت نواقص و ارسال به سرپرست ───
  describe('تسک ۶.۷: بررسی نواقص و گیت ارسال پرونده به سرپرست', () => {
    it('تا زمان تکمیل فیلدهای الزامی تمام تب‌ها، isSubmitDisabled باید true باشد', () => {
      expect(component.isSubmitDisabled).toBe(true);
      expect(component.missingFieldsList.length).toBeGreaterThan(0);
    });

    it('با تکمیل تمام فیلدهای الزامی، isSubmitDisabled باید false شود', () => {
      component.newPersonnel.first_name = 'محمدرضا';
      component.newPersonnel.last_name = 'اکبری';
      component.newPersonnel.national_code = '0010376488';
      component.newPersonnel.father_name = 'علی';
      component.newPersonnel.birth_date = '1370/01/01';
      component.newPersonnel.id_number = '1234';
      component.newPersonnel.gender = 'مرد';

      component.newPersonnel.job_title = 'کارگر انبار';

      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', sheba_number: '780170000000101111111001', account_number: '0101111111001', is_primary: true }
      ];

      component.newPersonnel.phone_number = '09121111111';
      component.phoneError = null;
      component.newPersonnel.address = 'تهران، خیابان آزادی';
      component.newPersonnel.postal_code = '1234567890';
      component.postalCodeError = null;

      expect(component.isSubmitDisabled).toBe(false);
      expect(component.missingFieldsList.length).toBe(0);
    });

    it('فراخوانی submitDraftPersonnel در صورت باز بودن پرونده پیش‌نویس موجود، باید اکشن submit سرور را فراخوانی کند', () => {
      component.editingId = 205;
      component.editingPersonnel = { id: 205, approval_status: 'draft' } as any;

      component.newPersonnel.first_name = 'محمدرضا';
      component.newPersonnel.last_name = 'اکبری';
      component.newPersonnel.national_code = '0010376488';
      component.newPersonnel.father_name = 'علی';
      component.newPersonnel.birth_date = '1370/01/01';
      component.newPersonnel.id_number = '1234';
      component.newPersonnel.gender = 'مرد';
      component.newPersonnel.job_title = 'کارگر انبار';
      component.bankAccounts = [
        { bank_name: 'بانک ملی ایران', sheba_number: '780170000000101111111001', account_number: '0101111111001', is_primary: true }
      ];
      component.newPersonnel.phone_number = '09121111111';
      component.phoneError = null;
      component.newPersonnel.address = 'تهران، خیابان آزادی';
      component.newPersonnel.postal_code = '1234567890';
      component.postalCodeError = null;

      component.submitDraftPersonnel();
      expect(mockPersonnelApi.submitPersonnelProfile).toHaveBeenCalledWith(205);
    });
  });
});
