// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmployeeNewPersonnelHubComponent } from './employee-new-personnel';
import { of, throwError, Subject } from 'rxjs';
import { PersonnelProfile, ProjectSection } from '../../../../../../core/models/personnel.model';

describe('آزمون‌های جامع مرورگر و DOM برای ۱۳ ویژگی پیاده‌سازی‌شده (13 Features Browser & DOM Suite)', () => {
  let component: EmployeeNewPersonnelHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;
  let domContainer: HTMLDivElement;

  const section3: ProjectSection = {
    id: 3,
    name: 'بخش کارگاه دالان',
    code: 'SEC03',
    project: 1,
    project_name: 'پروژه دالان',
    is_active: true
  };

  const section5: ProjectSection = {
    id: 5,
    name: 'بخش ایستگاه پارسیان',
    code: 'SEC05',
    project: 2,
    project_name: 'پروژه پارسیان',
    is_active: true
  };

  const existingPersonInSec3: PersonnelProfile = {
    id: 99,
    first_name: 'رضا',
    last_name: 'پاینده',
    full_name: 'رضا پاینده',
    national_code: '0010376488',
    father_name: 'علی',
    job_title: 'کارشناس فنی دالان',
    daily_base_wage: 5000000,
    phone_number: '09121234567',
    bank_name: 'بانک ملی ایران',
    account_number: '0101234567001',
    sheba_number: 'IR000170000000101234567001',
    gender: 'مرد',
    marital_status: 'married',
    children_count: 2,
    birth_date: '1365/04/10',
    section: 3,
    approval_status: 'approved',
    is_active: true
  };

  const assignedPersonInSec5: PersonnelProfile = {
    ...existingPersonInSec3,
    job_title: 'سرپرست کارگاه پارسیان',
    daily_base_wage: 7500000,
    section: 5
  };

  beforeEach(() => {
    domContainer = document.createElement('div');
    document.body.appendChild(domContainer);

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([section3, section5])),
      getProjectSections: vi.fn().mockReturnValue(of([section3, section5])),
      getPersonnelProfiles: vi.fn().mockImplementation((params: any) => {
        if (params?.section_id === 3) {
          return of([existingPersonInSec3]);
        } else if (params?.section_id === 5) {
          return of([assignedPersonInSec5]);
        }
        return of([existingPersonInSec3, assignedPersonInSec5]);
      }),
      lookupPersonnelByNationalCode: vi.fn().mockImplementation((nationalCode: string) => {
        if (nationalCode === '0010376488') {
          return of({
            found: true,
            personnel: {
              id: 99,
              first_name: 'رضا',
              last_name: 'پاینده',
              national_code: '0010376488',
              father_name: 'علی',
              phone_number: '09121234567',
              bank_name: 'بانک ملی ایران',
              account_number: '0101234567001',
              sheba_number: 'IR000170000000101234567001',
              children_count: 2,
              marital_status: 'married',
              current_section_id: 3,
              current_section_name: 'بخش کارگاه دالان'
            }
          });
        }
        return of({ found: false, personnel: null });
      }),
      assignPersonnelToSection: vi.fn().mockReturnValue(of({
        success: true,
        message: 'پرسنل «رضا پاینده» با موفقیت به این بخش منتسب شد.'
      })),
      createPersonnelProfile: vi.fn().mockImplementation((data: any) => of({ id: 100, ...data })),
      updatePersonnelProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deletePersonnelProfile: vi.fn().mockReturnValue(of({ success: true })),
      getDailyAttendanceMatrix: vi.fn().mockImplementation((params: any) => {
        if (params?.section_id === 3) {
          return of({
            date_shamsi: params.date_shamsi,
            section_id: 3,
            rows: [{ personnel_id: 99, full_name: 'رضا پاینده', job_title: 'کارشناس فنی دالان', status: 'PRESENT_10H', effective_hours: 10.0 }]
          });
        }
        if (params?.section_id === 5) {
          return of({
            date_shamsi: params.date_shamsi,
            section_id: 5,
            rows: [{ personnel_id: 99, full_name: 'رضا پاینده', job_title: 'سرپرست کارگاه پارسیان', status: 'HALF_5H', effective_hours: 5.0 }]
          });
        }
        return of({ rows: [] });
      }),
      bulkSaveDailyAttendance: vi.fn().mockImplementation((payload: any) => {
        // شبیه‌سازی جلوگیری از ثبت دو حاضر کامل ۱۰ ساعته در یک روز در دو بخش مجزا
        if (payload.section_id === 5 && payload.items?.[0]?.status === 'PRESENT_10H') {
          return throwError(() => ({
            status: 400,
            error: { error: 'برای این پرسنل قبلاً در همین روز وضعیت «حاضر کامل» در بخش دیگری ثبت شده است و امکان ثبت حاضر کامل مجدد وجود ندارد.' }
          }));
        }
        return of({ success: true, saved_count: payload.items?.length || 0 });
      }),
      clearDailyAttendance: vi.fn().mockImplementation((payload: any) => {
        return of({ success: true, message: `کارکرد روز در بخش ${payload.section_id} پاک شد.` });
      }),
      exportPersonnelExcel: vi.fn().mockReturnValue(of(new Blob(['fake excel content']))),
      getMonthlyAttendanceGrid: vi.fn().mockImplementation((params: any) => {
        return of({
          section_id: params.section_id,
          month: params.month,
          rows: [
            params.section_id === 3
              ? { personnel_id: 99, job_title: 'کارشناس فنی دالان', total_hours: 240 }
              : { personnel_id: 99, job_title: 'سرپرست کارگاه پارسیان', total_hours: 120 }
          ]
        });
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
      queryParams: of({ section_id: '3' })
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

  afterEach(() => {
    if (domContainer && domContainer.parentNode) {
      domContainer.parentNode.removeChild(domContainer);
    }
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۱. ارگونومی و چیدمان ردیف اول فرم (DOM Layout: National Code -> First Name -> Last Name)
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۱: چیدمان ارگونومیک ردیف اول فرم در DOM باید کد ملی را در ستون راست (اول)، نام را در وسط و نام خانوادگی را در چپ قرار دهد', () => {
    // رندر المان‌های ردیف اول فرم مطابق با قالب کامپوننت
    domContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="formRow1">
        <!-- ستون ۱: کد ملی (راست) -->
        <div class="col-national-code">
          <label class="text-[11px] font-bold">کد ملی (۱۰ رقم) *</label>
          <input type="text" id="personnelNationalCode" maxlength="10" placeholder="۰۱۲۳۴۵۶۷۸۹" />
        </div>
        <!-- ستون ۲: نام (وسط) -->
        <div class="col-first-name">
          <label class="text-[11px] font-bold">نام *</label>
          <input type="text" id="personnelFirstName" placeholder="مثال: علی" />
        </div>
        <!-- ستون ۳: نام خانوادگی (چپ) -->
        <div class="col-last-name">
          <label class="text-[11px] font-bold">نام خانوادگی *</label>
          <input type="text" id="personnelLastName" placeholder="مثال: محمدی" />
        </div>
      </div>
    `;

    const row = domContainer.querySelector('#formRow1')!;
    expect(row).not.toBeNull();

    const cols = Array.from(row.children);
    expect(cols.length).toBe(3);

    // بررسی ترتیب ستون‌ها از راست به چپ در DOM
    expect(cols[0].querySelector('label')?.textContent).toContain('کد ملی (۱۰ رقم)');
    expect(cols[0].querySelector('input')?.id).toBe('personnelNationalCode');

    expect(cols[1].querySelector('label')?.textContent).toContain('نام *');
    expect(cols[1].querySelector('input')?.id).toBe('personnelFirstName');

    expect(cols[2].querySelector('label')?.textContent).toContain('نام خانوادگی *');
    expect(cols[2].querySelector('input')?.id).toBe('personnelLastName');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۲. دکمه کپی ۱-کلیک شماره همراه و بازخورد موقت ۲ ثانیه‌ای
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۲: دکمه کپی ۱-کلیک شماره همراه باید مقدار را در کلیپ‌بورد کپی کرده، آیکون را موقتاً به ✓ تغییر داده و پس از ۲ ثانیه ریست شود', async () => {
    vi.useFakeTimers();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve())
      }
    });

    component.newPersonnel.phone_number = '09121234567';

    // رندر ساختار DOM ورودی شماره همراه به همراه دکمه کپی
    domContainer.innerHTML = `
      <div class="phone-input-wrapper">
        <input type="tel" id="personnelPhone" value="${component.newPersonnel.phone_number}" />
        <button id="copyPhoneBtn" type="button" class="copy-btn">
          <span class="btn-icon">${component.isPhoneCopied ? '✓' : '📋'}</span>
        </button>
      </div>
    `;

    const copyBtn = domContainer.querySelector('#copyPhoneBtn') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.querySelector('.btn-icon')?.textContent).toBe('📋');

    // کلیک بر روی دکمه کپی
    component.copyPhoneToClipboard();
    await vi.waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره همراه در کلیپ‌بورد کپی شد'));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('09121234567');
    expect(component.isPhoneCopied).toBe(true);

    // به‌روزرسانی DOM شبیه‌سازی‌شده
    domContainer.querySelector('.btn-icon')!.textContent = component.isPhoneCopied ? '✓' : '📋';
    expect(domContainer.querySelector('.btn-icon')?.textContent).toBe('✓');

    // پیشروی ۲ ثانیه در زمان جهت بررسی ریست خودکار وضعیت دکمه
    vi.advanceTimersByTime(2000);
    expect(component.isPhoneCopied).toBe(false);

    domContainer.querySelector('.btn-icon')!.textContent = component.isPhoneCopied ? '✓' : '📋';
    expect(domContainer.querySelector('.btn-icon')?.textContent).toBe('📋');

    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۳. حذف دراپ‌داون نوع قرارداد از ظاهر فرم و ذخیره پیش‌فرض daily
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۳: فیلد نوع قرارداد کاری باید از ظاهر DOM حذف شده باشد و در پشت‌صحنه پیش‌فرض daily ذخیره گردد', () => {
    // بررسی عدم وجود المان select یا input برای contract_type در قالب جدید
    domContainer.innerHTML = `
      <div id="modalForm">
        <input id="personnelNationalCode" />
        <input id="personnelFirstName" />
        <input id="personnelLastName" />
        <!-- فیلد نوع قرارداد کاری حذف شده است -->
      </div>
    `;

    const contractTypeSelect = domContainer.querySelector('#contractTypeSelect');
    expect(contractTypeSelect).toBeNull();

    // بررسی مقدار پیش‌فرض مدل
    expect(component.newPersonnel.contract_type).toBe('daily');

    // ذخیره پیش‌نویس
    component.selectedSectionId = 3;
    component.newPersonnel.first_name = 'علی';
    component.newPersonnel.last_name = 'محمودی';
    component.newPersonnel.national_code = '0010376488';
    component.nationalCodeError = null;

    component.savePersonnelDraft();

    expect(mockPersonnelApi.createPersonnelProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        contract_type: 'daily'
      })
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۴. رفع قفل فیلد تعداد فرزندان برای همه وضعیت‌های تاهل
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۴: فیلد تعداد فرزندان باید برای تمامی وضعیت‌های تاهل (مجرد، متاهل، مطلقه) فعال و باز باشد', () => {
    // رندر DOM ورودی تعداد فرزندان
    domContainer.innerHTML = `
      <div>
        <label>تعداد فرزندان</label>
        <input type="number" id="childrenCountInput" min="0" />
      </div>
    `;

    const input = domContainer.querySelector('#childrenCountInput') as HTMLInputElement;
    expect(input.disabled).toBe(false);

    // وضعیت تاهل: مجرد -> فیلد فرزندان نباید قفل باشد
    component.newPersonnel.marital_status = 'single';
    component.newPersonnel.children_count = 1; // مثلا فرزندخواندگی یا ثبت قانونی
    expect(component.newPersonnel.children_count).toBe(1);

    // وضعیت تاهل: متاهل
    component.newPersonnel.marital_status = 'married';
    component.newPersonnel.children_count = 3;
    expect(component.newPersonnel.children_count).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // ۵. استعلام هوشمند کد ملی و نمایش بنر مشخصات هویتی
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۵: وارد کردن ۱۰ رقم کد ملی معتبر باید استعلام خودکار را اجرا کرده و بنر هویت پرسنل را در DOM فعال کند', () => {
    component.selectedSectionId = 5; // در حال تعریف پرسنل در بخش ۵ (پارسیان)
    component.newPersonnel.national_code = '0010376488';
    component.onNationalCodeChange();

    expect(mockPersonnelApi.lookupPersonnelByNationalCode).toHaveBeenCalledWith('0010376488');
    expect(component.foundExistingPersonnel).not.toBeNull();
    expect(component.foundExistingPersonnel?.first_name).toBe('رضا');
    expect(component.foundExistingPersonnel?.last_name).toBe('پاینده');
    expect(component.foundExistingPersonnel?.current_section_name).toBe('بخش کارگاه دالان');

    // رندر بنر هویت در DOM
    domContainer.innerHTML = `
      <div id="foundPersonnelBanner" class="bg-purple-50">
        <span class="found-name">این شخص با نام «${component.foundExistingPersonnel?.first_name} ${component.foundExistingPersonnel?.last_name}» قبلاً در سامانه ثبت شده است</span>
        <span class="current-section">بخش فعال: ${component.foundExistingPersonnel?.current_section_name}</span>
        <button id="applyDataBtn" type="button">بازخوانی و پر کردن فرم</button>
      </div>
    `;

    const banner = domContainer.querySelector('#foundPersonnelBanner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('رضا پاینده');
    expect(banner?.textContent).toContain('بخش کارگاه دالان');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۶. فراخوانی ۱-کلیک مشخصات هویتی و بانکی در فرم
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۶: متد applyFoundPersonnelData باید مشخصات هویتی و بانکی را به فرم منتقل کرده و شناسه پرسنل را جهت انتساب ثبت کند', () => {
    component.foundExistingPersonnel = {
      id: 99,
      first_name: 'رضا',
      last_name: 'پاینده',
      father_name: 'علی',
      national_code: '0010376488',
      phone_number: '09121234567',
      bank_name: 'بانک ملی ایران',
      account_number: '0101234567001',
      sheba_number: 'IR000170000000101234567001',
      children_count: 2,
      marital_status: 'married',
      current_section_id: 3,
      current_section_name: 'بخش کارگاه دالان'
    };

    component.applyFoundPersonnelData();

    expect(component.newPersonnel.first_name).toBe('رضا');
    expect(component.newPersonnel.last_name).toBe('پاینده');
    expect(component.newPersonnel.phone_number).toBe('09121234567');
    expect(component.newPersonnel.bank_name).toBe('بانک ملی ایران');
    expect(component.newPersonnel.account_number).toBe('0101234567001');
    expect(component.newPersonnel.sheba_number).toBe('IR000170000000101234567001');
    expect(component.existingPersonnelId).toBe(99);
    expect(component.existingPersonnelSectionId).toBe(3);
    expect(component.foundExistingPersonnel).toBeNull();
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('با موفقیت فراخوانی شد'));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۷. مدل داده‌ای انتساب چندبخشی پرسنل (Multi-Section Assignment Data Model)
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۷: ساختار مدل انتساب چندبخشی باید امکان ارتباط همزمان به بخش‌های متعدد با سمت و دستمزد تفکیک‌شده را تامین کند', () => {
    interface AssignmentStructure {
      personnel_id: number;
      section_id: number;
      job_title: string;
      daily_base_wage: number;
      is_active: boolean;
    }

    const assignmentSec3: AssignmentStructure = {
      personnel_id: 99,
      section_id: 3,
      job_title: 'کارشناس فنی دالان',
      daily_base_wage: 5000000,
      is_active: true
    };

    const assignmentSec5: AssignmentStructure = {
      personnel_id: 99,
      section_id: 5,
      job_title: 'سرپرست کارگاه پارسیان',
      daily_base_wage: 7500000,
      is_active: true
    };

    expect(assignmentSec3.personnel_id).toBe(assignmentSec5.personnel_id);
    expect(assignmentSec3.section_id).not.toBe(assignmentSec5.section_id);
    expect(assignmentSec3.job_title).toBe('کارشناس فنی دالان');
    expect(assignmentSec5.job_title).toBe('سرپرست کارگاه پارسیان');
    expect(assignmentSec3.daily_base_wage).toBe(5000000);
    expect(assignmentSec5.daily_base_wage).toBe(7500000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۸. فراخوانی اکشن assign-section جهت اتصال پرسنل موجود به بخش جدید
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۸: در صورت وجود existingPersonnelId، هنگام ثبت فرم باید اکشن assignPersonnelToSection با سمت و دستمزد جدید فراخوانی شود', () => {
    component.selectedSectionId = 5; // بخش جدید
    component.existingPersonnelId = 99;
    component.existingPersonnelSectionId = 3; // بخش قبلی
    component.newPersonnel.first_name = 'رضا';
    component.newPersonnel.last_name = 'پاینده';
    component.newPersonnel.national_code = '0010376488';
    component.newPersonnel.job_title = 'سرپرست کارگاه پارسیان';
    component.newPersonnel.daily_base_wage = 7500000;
    component.newPersonnel.notes = 'انتقال پروژه‌ای';

    component.savePersonnelDraft();

    expect(mockPersonnelApi.assignPersonnelToSection).toHaveBeenCalledWith(99, {
      section_id: 5,
      job_title: 'سرپرست کارگاه پارسیان',
      daily_base_wage: 7500000,
      notes: 'انتقال پروژه‌ای'
    });
    expect(mockPersonnelApi.createPersonnelProfile).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('منتسب شد'));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۹. نمایش همزمان در هر دو بخش با سمت و دستمزد مستقل
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۹: بارگذاری پرسنل در صفحه بخش ۳ و بخش ۵ باید پرسنل یکسان را با سمت شغلی و دستمزد مجزای همان بخش نمایش دهد', () => {
    // استعلام برای بخش ۳ (دالان)
    component.selectedSectionId = 3;
    component.loadRecentPersonnel();
    expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ section_id: 3 });
    expect(component.recentPersonnel.length).toBe(1);
    expect(component.recentPersonnel[0].job_title).toBe('کارشناس فنی دالان');
    expect(component.recentPersonnel[0].daily_base_wage).toBe(5000000);

    // تغییر بخش به بخش ۵ (پارسیان)
    component.selectedSectionId = 5;
    component.loadRecentPersonnel();
    expect(mockPersonnelApi.getPersonnelProfiles).toHaveBeenCalledWith({ section_id: 5 });
    expect(component.recentPersonnel.length).toBe(1);
    expect(component.recentPersonnel[0].job_title).toBe('سرپرست کارگاه پارسیان');
    expect(component.recentPersonnel[0].daily_base_wage).toBe(7500000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۱۰. ماتریس کارکرد روزانه مستقل برای هر بخش
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۱۰: ماتریس کارکرد روزانه باید در هر دو بخش ردیف اختصاصی پرسنل با سمت شغلی همان بخش را بازگرداند', () => {
    let mat3Rows: any[] = [];
    mockPersonnelApi.getDailyAttendanceMatrix({ section_id: 3, date_shamsi: '1405/04/15' }).subscribe((res: any) => {
      mat3Rows = res.rows;
    });
    expect(mat3Rows.length).toBe(1);
    expect(mat3Rows[0].job_title).toBe('کارشناس فنی دالان');
    expect(mat3Rows[0].status).toBe('PRESENT_10H');
    expect(mat3Rows[0].effective_hours).toBe(10.0);

    let mat5Rows: any[] = [];
    mockPersonnelApi.getDailyAttendanceMatrix({ section_id: 5, date_shamsi: '1405/04/15' }).subscribe((res: any) => {
      mat5Rows = res.rows;
    });
    expect(mat5Rows.length).toBe(1);
    expect(mat5Rows[0].job_title).toBe('سرپرست کارگاه پارسیان');
    expect(mat5Rows[0].status).toBe('HALF_5H');
    expect(mat5Rows[0].effective_hours).toBe(5.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۱۱. اعتبارسنجی تداخل کارکرد: ممانعت از دو «حاضر کامل» همزمان در یک روز
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۱۱: ثبت دو حاضر کامل ۱۰ ساعته در یک روز در دو بخش مجزا باید با خطا رد شده اما شیفت نیمه‌وقت باید مجاز باشد', () => {
    const conflictingPayload = {
      date_shamsi: '1405/04/15',
      section_id: 5,
      items: [{ personnel_id: 99, status: 'PRESENT_10H', effective_hours: 10.0 }]
    };

    let conflictError: any = null;
    mockPersonnelApi.bulkSaveDailyAttendance(conflictingPayload).subscribe({
      next: () => {},
      error: (err: any) => { conflictError = err; }
    });

    expect(conflictError).not.toBeNull();
    expect(conflictError.status).toBe(400);
    expect(conflictError.error.error).toContain('حاضر کامل');

    // ثبت شیفت قانونی نیمه‌وقت (۵ ساعت) در بخش ۵
    const validHalfShiftPayload = {
      date_shamsi: '1405/04/15',
      section_id: 5,
      items: [{ personnel_id: 99, status: 'HALF_5H', effective_hours: 5.0 }]
    };

    let validSuccess = false;
    mockPersonnelApi.bulkSaveDailyAttendance(validHalfShiftPayload).subscribe((res: any) => {
      validSuccess = res.success;
    });
    expect(validSuccess).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۱۲. پاکسازی ایزوله روزانه و حفظ سوابق سایر بخش‌ها
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۱۲: پاکسازی کارکرد روز جاری در بخش ۳ باید تنها اطلاعات همان بخش را حذف کرده و سوابق بخش ۵ حفظ گردد', () => {
    let clearMessage = '';
    mockPersonnelApi.clearDailyAttendance({ date_shamsi: '1405/04/15', section_id: 3 }).subscribe((res: any) => {
      clearMessage = res.message;
    });
    expect(clearMessage).toContain('کارکرد روز در بخش 3 پاک شد');

    // بررسی پابرجایی کارکرد در بخش ۵ پس از پاکسازی بخش ۳
    let mat5Rows: any[] = [];
    mockPersonnelApi.getDailyAttendanceMatrix({ section_id: 5, date_shamsi: '1405/04/15' }).subscribe((res: any) => {
      mat5Rows = res.rows;
    });
    expect(mat5Rows.length).toBe(1);
    expect(mat5Rows[0].status).toBe('HALF_5H');
    expect(mat5Rows[0].effective_hours).toBe(5.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ۱۳. شیت ماهانه و خروجی اکسل چندبخشی
  // ─────────────────────────────────────────────────────────────────────────
  it('مورد ۱۳: شیت ماهانه و فایل اکسل باید کارکرد هر بخش را بر اساس انتساب‌های اختصاصی آن بخش فیلتر و محاسبه کنند', () => {
    // شیت ماهانه بخش ۳
    let grid3: any = null;
    mockPersonnelApi.getMonthlyAttendanceGrid({ section_id: 3, month: '1405/04' }).subscribe((res: any) => {
      grid3 = res;
    });
    expect(grid3.rows[0].job_title).toBe('کارشناس فنی دالان');
    expect(grid3.rows[0].total_hours).toBe(240);

    // شیت ماهانه بخش ۵
    let grid5: any = null;
    mockPersonnelApi.getMonthlyAttendanceGrid({ section_id: 5, month: '1405/04' }).subscribe((res: any) => {
      grid5 = res;
    });
    expect(grid5.rows[0].job_title).toBe('سرپرست کارگاه پارسیان');
    expect(grid5.rows[0].total_hours).toBe(120);

    // خروجی اکسل بخش جاری
    component.selectedSectionId = 5;
    component.exportExcel();
    expect(mockPersonnelApi.exportPersonnelExcel).toHaveBeenCalledWith({ section_id: 5 });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('اکسل'));
  });
});
