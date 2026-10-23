// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { AccountantNewProfilesHubComponent } from './accountant-new-profiles';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { ACCOUNTANT_NAV_ITEMS } from '../../../../nav-items';
import { ACCOUNTING_ROUTES } from '../../../../accounting.routes';
import { routes as appRoutes } from '../../../../../../app.routes';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  ProjectSection
} from '../../../../models/personnel.model';
import { generateShebaFromAccount } from '../../../../../../core/utils/sheba-utils';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('AccountantNewProfilesHubComponent DOM & Browser Testing (12 Comprehensive Items Verification)', () => {
  let fixture: ComponentFixture<AccountantNewProfilesHubComponent>;
  let component: AccountantNewProfilesHubComponent;

  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockRouter: any;
  let mockRoute: any;
  let mockActiveCompanyService: any;
  let wsSubject: Subject<any>;
  let companySubject: Subject<any>;
  const validSheba = generateShebaFromAccount('017', '101111111001');

  const mockPersonnel: PersonnelProfile = {
    id: 938,
    first_name: 'مرتضی',
    last_name: 'منصوریان',
    national_code: '0075301989',
    section: 3,
    approval_status: 'pending_accountant',
    contract_type: 'daily',
    marital_status: 'married',
    job_title: 'کارشناس انبار',
    is_active: true,
    job_grade: '19',
    base_years_experience: 2,
    daily_base_wage: 6572696,
    daily_seniority_bonus: 171867,
    base_daily_rate: 6916430,
    hourly_rate: 691643,
    housing_allowance: 30000000,
    food_allowance: 22000000,
    spouse_allowance: 5000000,
    children_count: 1,
    bank_name: 'بانک ملی ایران',
    account_number: '101111111001',
    sheba_number: validSheba
  };

  const mockVehicle: VehicleDriverProfile = {
    id: 45,
    driver_name: 'بهرام رادان',
    plate_number: '21-789-10',
    vehicle_type: 'pickup',
    is_active: true,
    approval_status: 'pending_accountant',
    default_service_rate: 2500000,
    driver_phone: '09121234567',
    bank_name: 'بانک ملت',
    sheba_number: 'IR980120000000001234567890'
  };

  const mockCrPersonnel: PersonnelChangeRequest = {
    id: 301,
    personnel: 938,
    personnel_name: 'مرتضی منصوریان',
    personnel_national_code: '0075301989',
    status: 'pending_accountant',
    status_display: 'در انتظار تایید حسابدار',
    proposed_changes: { daily_base_wage: 7000000, job_grade: '20' },
    previous_values: { daily_base_wage: 6572696, job_grade: '19' },
    requested_by_name: 'سرپرست کارگاه',
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z'
  };

  const mockCrVehicle: VehicleChangeRequest = {
    id: 401,
    vehicle: 45,
    driver_name: 'بهرام رادان',
    plate_number: '21-789-10',
    status: 'pending_accountant',
    status_display: 'در انتظار تایید حسابدار',
    proposed_changes: { default_service_rate: 2800000 },
    previous_values: { default_service_rate: 2500000 },
    requested_by_name: 'سرپرست ترابری',
    created_at: '2026-09-29T11:00:00Z',
    updated_at: '2026-09-29T11:00:00Z'
  };

  const mockSections: ProjectSection[] = [
    { id: 3, name: 'دالان کارگاه', code: 'S03', project: 1, is_active: true },
    { id: 4, name: 'انبار مرکزی', code: 'S04', project: 1, is_active: true }
  ];

  beforeAll(async () => {
    Object.defineProperty(AccountantNewProfilesHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || AccountantNewProfilesHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WebSocketService),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActiveCompanyService, 8)
        );
      },
      configurable: true,
      writable: true
    });

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    wsSubject = new Subject<any>();
    companySubject = new Subject<any>();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 5, username: 'hesabdar_user' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_personnel_finance', 'can_act_as_accountant', 'view_sys_payroll'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockPersonnelApi = {
      getYearlySettings: vi.fn().mockReturnValue(of({
        year: '1405',
        monthly_housing_allowance: 30000000,
        monthly_food_allowance: 22000000,
        monthly_spouse_allowance: 5000000
      })),
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of(mockSections)),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([mockPersonnel])),
      getVehicleProfiles: vi.fn().mockReturnValue(of([mockVehicle])),
      getPersonnelChangeRequests: vi.fn().mockReturnValue(of([mockCrPersonnel])),
      getVehicleChangeRequests: vi.fn().mockReturnValue(of([mockCrVehicle])),
      approvePersonnelFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی پرسنل با موفقیت ثبت شد.' })),
      approveVehicleFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی خودرو با موفقیت ثبت شد.' })),
      rejectPersonnel: vi.fn().mockReturnValue(of({ message: 'پرونده پرسنل رد شد.' })),
      requestPersonnelRevision: vi.fn().mockReturnValue(of({ message: 'پرونده پرسنل عودت گردید.' })),
      rejectVehicle: vi.fn().mockReturnValue(of({ message: 'پرونده خودرو رد شد.' })),
      requestVehicleRevision: vi.fn().mockReturnValue(of({ message: 'پرونده خودرو عودت گردید.' })),
      rejectPersonnelChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات پرسنل رد شد.' })),
      rejectVehicleChangeRequest: vi.fn().mockReturnValue(of({ message: 'درخواست تغییرات خودرو رد شد.' })),
      getJobGradeRate: vi.fn().mockReturnValue(of({
        grade: '20',
        daily_base_wage: 7100000,
        daily_seniority_bonus: 180000,
        hourly_rate: 746000
      })),
      updatePersonnelProfile: vi.fn().mockReturnValue(of({ message: 'مشخصات و ارقام مالی پرسنل با موفقیت ذخیره شد.' })),
      approvePersonnelChangeRequestFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی تغییرات پرسنل انجام شد.' })),
      approveVehicleChangeRequestFinance: vi.fn().mockReturnValue(of({ message: 'تایید مالی تغییرات ناوگان انجام شد.' }))
    };

    mockWs = {
      notifications$: wsSubject.asObservable()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'personnel', section_id: '3' }),
      snapshot: { queryParams: { tab: 'personnel', section_id: '3' } }
    };

    mockActiveCompanyService = {
      activeCompany$: companySubject.asObservable()
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, ReactiveFormsModule, AccountantNewProfilesHubComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: WebSocketService, useValue: mockWs },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AccountantNewProfilesHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // آیتم ۱: بررسی آیتم‌های سایدبار حسابدار در nav-items.ts (تفکیک پرسنل و ناوگان)
  // ─────────────────────────────────────────────────────────────────
  it('Item 1: Sidebar Navigation contains "پرسنل" and "ناوگان" for accountant', () => {
    const personnelItem = ACCOUNTANT_NAV_ITEMS.find(item => item.id === 'accountant-personnel');
    const fleetItem = ACCOUNTANT_NAV_ITEMS.find(item => item.id === 'accountant-fleet');
    expect(personnelItem).toBeDefined();
    expect(personnelItem?.label).toBe('پرسنل');
    expect(personnelItem?.isAccounting).toBe(true);

    expect(fleetItem).toBeDefined();
    expect(fleetItem?.label).toBe('ناوگان');
    expect(fleetItem?.isAccounting).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۲: بررسی روتینگ و ریدایرکت‌های ماژول حسابداری
  // ─────────────────────────────────────────────────────────────────
  it('Item 2: Routing is registered in accounting.routes.ts and app.routes.ts', () => {
    const routeDef = ACCOUNTING_ROUTES.find(r => r.path === 'accountant-personnel');
    expect(routeDef).toBeDefined();
    expect(routeDef?.data?.['reuse']).toBe(true);

    const redirectDef = ACCOUNTING_ROUTES.find(r => r.path === 'accountant/personnel');
    expect(redirectDef).toBeDefined();
    expect(redirectDef?.redirectTo).toBe('accountant-personnel');

    const appRedirect = appRoutes.find(r => r.path === 'accountant-personnel');
    expect(appRedirect).toBeDefined();
    expect(appRedirect?.redirectTo).toBe('app/finance/accountant-personnel');
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۳: رندر هدر چسبان، دراپ‌داون بخش سازمانی و زیرتب‌های کپسولی در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 3: Sticky Command Center renders section selector and pill subtabs with live counters in DOM', () => {
    const hostElem: HTMLElement = fixture.nativeElement;

    // 1. Sticky header exists
    const stickyHeader = hostElem.querySelector('.sticky');
    expect(stickyHeader).toBeTruthy();

    // 2. Section selector dropdown exists and contains sections
    const sectionSelect: HTMLSelectElement | null = hostElem.querySelector('select');
    expect(sectionSelect).toBeTruthy();
    expect(sectionSelect?.options.length).toBeGreaterThanOrEqual(2);
    expect(sectionSelect?.textContent).toContain('دالان کارگاه');

    // 3. Subtab pills with live counters exist
    const subtabsText = hostElem.textContent || '';
    expect(subtabsText).toContain('پرونده‌های پرسنل');
    expect(subtabsText).toContain('پرونده‌های ناوگان');
    expect(subtabsText).toContain('درخواست‌های تغییرات');
    expect(subtabsText).toContain('همه موارد');

    // Counters: 1 personnel, 1 vehicle, 2 change requests, 4 total
    expect(component.statusCounters.personnelPending).toBe(1);
    expect(component.statusCounters.vehiclesPending).toBe(1);
    expect(component.statusCounters.changeRequestsPending).toBe(2);
    expect(component.statusCounters.allPending).toBe(4);
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۴: رندر کارت ارگونومیک پرسنل در DOM برای «مرتضی منصوریان»
  // ─────────────────────────────────────────────────────────────────
  it('Item 4: Personnel Card for "مرتضی منصوریان" (#938) renders with details & status badge in DOM', () => {
    const hostElem: HTMLElement = fixture.nativeElement;

    // Personnel name & details
    expect(hostElem.textContent).toContain('مرتضی منصوریان');
    expect(hostElem.textContent).toContain('0075301989');

    // Status badge: "در انتظار تایید حسابدار"
    expect(hostElem.textContent).toContain('در انتظار تایید حسابدار');

    // Action buttons inside card
    const approveBtn = hostElem.querySelector('button[appAction="approve"]');
    expect(approveBtn).toBeTruthy();
    expect(approveBtn?.textContent).toContain('تایید مالی');

    const editBtn = hostElem.querySelector('button[appAction="edit"]');
    expect(editBtn).toBeTruthy();
    expect(editBtn?.textContent).toContain('ویرایش مدارک');
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۵: باز شدن مودال ۴ تب احکام مالی با کلیک در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 5: Clicking "ویرایش مدارک، مزد و احکام مالی" opens 4-tab financial modal in DOM', () => {
    const hostElem: HTMLElement = fixture.nativeElement;

    // Find and click the edit button
    const editBtn: HTMLButtonElement | null = Array.from(hostElem.querySelectorAll('button'))
      .find(b => b.textContent?.includes('ویرایش مدارک')) as HTMLButtonElement || null;
    expect(editBtn).toBeTruthy();
    editBtn.click();
    fixture.detectChanges();

    // Verify modal container exists in DOM
    expect(component.isPersonnelModalOpen).toBe(true);
    const modalDialog = hostElem.querySelector('[role="dialog"]');
    expect(modalDialog).toBeTruthy();

    // Verify all 4 tab buttons exist in modal
    const modalText = modalDialog?.textContent || '';
    expect(modalText).toContain('مزد و مزایای قانونی');
    expect(modalText).toContain('بیمه و مالیات');
    expect(modalText).toContain('شماره حساب و شبا');
    expect(modalText).toContain('مشخصات فردی');
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۶: محاسبه آنی گروه شغلی ۲۰ گانه و سنوات و ذخیره در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 6: Changing Job Grade to 20 recalculates wage and saves via DOM', () => {
    component.openEditPersonnelModal(mockPersonnel);
    fixture.detectChanges();

    // Set job grade to 20 and trigger change
    component.editingPersonnel!.job_grade = '20';
    component.onJobGradeChange('20');
    fixture.detectChanges();

    expect(mockPersonnelApi.getJobGradeRate).toHaveBeenCalledWith('20', '1405');
    // Base daily rate: 7100000 + (2 * 180000) = 7460000
    expect(component.editingPersonnel?.base_daily_rate).toBe(7460000);
    expect(component.editingPersonnel?.hourly_rate).toBe(746000);

    // Save changes via modal save button
    const hostElem: HTMLElement = fixture.nativeElement;
    const saveBtn: HTMLButtonElement | null = Array.from(hostElem.querySelectorAll('button'))
      .find(b => b.textContent?.includes('ذخیره تغییرات')) as HTMLButtonElement || null;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    fixture.detectChanges();

    expect(mockPersonnelApi.updatePersonnelProfile).toHaveBeenCalledWith(938, expect.objectContaining({
      job_grade: '20',
      base_daily_rate: 7460000
    }));
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('مشخصات و ارقام مالی'));
    expect(component.isPersonnelModalOpen).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۷: اعتبارسنجی دوطرفه شبا، تشخیص بانک و تولید خودکار در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 7: Bidirectional Sheba ISO 7064 Mod 97 validation and auto-generation in DOM', () => {
    component.openEditPersonnelModal({ ...mockPersonnel, bank_name: '', account_number: '', sheba_number: '' });
    component.setPersonnelTab('contact');
    fixture.detectChanges();

    const hostElem: HTMLElement = fixture.nativeElement;

    // Input Sheba
    component.onShebaInput(validSheba);
    fixture.detectChanges();

    expect(component.shebaValidationResult?.isValid).toBe(true);
    expect(component.editingPersonnel?.bank_name).toBe('بانک ملی ایران');
    expect(component.editingPersonnel?.account_number).toBe('101111111001');

    // DOM displays validity badge
    expect(hostElem.textContent).toContain('شبا معتبر است');

    // Test automatic generation button
    component.convertAccountToShebaNow();
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('شماره شبا با موفقیت'));
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۸: تایید مالی پرسنل و ارسال پرونده به مدیر در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 8: Clicking "تایید مالی (ارسال به مدیر)" invokes approvePersonnelFinance in DOM', () => {
    const hostElem: HTMLElement = fixture.nativeElement;

    const approveBtn: HTMLButtonElement | null = hostElem.querySelector('button[appAction="approve"]');
    expect(approveBtn).toBeTruthy();
    approveBtn?.click();
    fixture.detectChanges();

    expect(mockPersonnelApi.approvePersonnelFinance).toHaveBeenCalledWith(938);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید مالی پرسنل'));
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۹: ارجاع به بازنگری یا رد پرونده با مودال علت مستند در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 9: Revision modal opens, rejects empty reason, and submits valid reason via DOM', () => {
    const hostElem: HTMLElement = fixture.nativeElement;

    // Click "🔄 عودت" button in DOM
    const returnBtn: HTMLButtonElement | null = Array.from(hostElem.querySelectorAll('button'))
      .find(b => b.textContent?.includes('عودت')) as HTMLButtonElement || null;
    expect(returnBtn).toBeTruthy();
    returnBtn.click();
    fixture.detectChanges();

    // Verify modal is open in DOM
    expect(component.isRejectModalOpen).toBe(true);
    expect(hostElem.textContent).toContain('ارجاع به بازنگری و عودت');

    // Try submitting with empty reason
    component.rejectReason = '';
    component.submitRejectModal();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('علت'));
    expect(mockPersonnelApi.requestPersonnelRevision).not.toHaveBeenCalled();

    // Type valid documented reason
    component.rejectReason = 'شماره بیمه تامین اجتماعی ناخوانا است';
    component.submitRejectModal();
    fixture.detectChanges();

    expect(mockPersonnelApi.requestPersonnelRevision).toHaveBeenCalledWith(938, 'شماره بیمه تامین اجتماعی ناخوانا است');
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
    expect(component.isRejectModalOpen).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۱۰: تب پرونده‌های ناوگان و تایید مالی خودرو در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 10: Fleet tab renders vehicle card and approves rate via DOM', () => {
    // Switch to vehicles tab
    component.switchSubTab('vehicles');
    fixture.detectChanges();

    const hostElem: HTMLElement = fixture.nativeElement;

    // Vehicle card rendered in DOM
    expect(hostElem.textContent).toContain('21-789-10');
    expect(hostElem.textContent).toContain('بهرام رادان');
    expect(hostElem.textContent).toContain('در انتظار تایید حسابدار');

    // Click approve vehicle button
    const approveVehBtn: HTMLButtonElement | null = hostElem.querySelector('button[appAction="approve"]');
    expect(approveVehBtn).toBeTruthy();
    approveVehBtn?.click();
    fixture.detectChanges();

    expect(mockPersonnelApi.approveVehicleFinance).toHaveBeenCalledWith(45);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید مالی خودرو'));
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۱۱: تب درخواست‌های تغییرات و مودال Diff Viewer در DOM
  // ─────────────────────────────────────────────────────────────────
  it('Item 11: Change requests tab renders Diff Viewer and approves changes via DOM', () => {
    // Switch to change requests tab
    component.switchSubTab('change_requests');
    fixture.detectChanges();

    const hostElem: HTMLElement = fixture.nativeElement;
    expect(hostElem.textContent).toContain('مرتضی منصوریان');

    // Open Diff Modal
    const diffBtn: HTMLButtonElement | null = Array.from(hostElem.querySelectorAll('button'))
      .find(b => b.textContent?.includes('مقایسه')) as HTMLButtonElement || null;
    expect(diffBtn).toBeTruthy();
    diffBtn.click();
    fixture.detectChanges();

    // Verify Diff modal in DOM
    expect(component.isDiffModalOpen).toBe(true);
    expect(hostElem.textContent).toContain('مشاهده تفاوت‌ها و تغییرات پیشنهادی');
    expect(component.diffRows.length).toBe(2);

    // Close diff modal
    component.closeDiffModal();
    fixture.detectChanges();
    expect(component.isDiffModalOpen).toBe(false);

    // Approve CR
    component.approveChangeRequestFinance(mockCrPersonnel, 'personnel');
    expect(mockPersonnelApi.approvePersonnelChangeRequestFinance).toHaveBeenCalledWith(301);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('تایید مالی'));
  });

  // ─────────────────────────────────────────────────────────────────
  // آیتم ۱۲: به‌روزرسانی زنده وب‌سوکت در DOM بدون نیاز به رفرش صفحه
  // ─────────────────────────────────────────────────────────────────
  it('Item 12: Real-time WebSocket event updates component data in-place without page reload', () => {
    const initialCallCount = mockPersonnelApi.getPersonnelProfiles.mock.calls.length;

    // Send WebSocket notification for active section 3
    wsSubject.next({ type_str: 'personnel_updated', section_id: 3 });
    fixture.detectChanges();

    // Verify component refreshed data in-place
    expect(mockPersonnelApi.getPersonnelProfiles.mock.calls.length).toBeGreaterThan(initialCallCount);
  });
});
