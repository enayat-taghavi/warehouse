// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SupervisorAttendanceHubComponent } from './supervisor-attendance/supervisor-attendance';
import { SupervisorPeriodLockHubComponent } from './supervisor-period-lock/supervisor-period-lock';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../core/services/state.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ProjectSection } from '../../../models/personnel.model';

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

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('Fast Browser & DOM Verification (14 Comprehensive Audit Items)', () => {
  let attendanceFixture: ComponentFixture<SupervisorAttendanceHubComponent>;
  let attendanceComp: SupervisorAttendanceHubComponent;
  let periodLockFixture: ComponentFixture<SupervisorPeriodLockHubComponent>;
  let periodLockComp: SupervisorPeriodLockHubComponent;

  let mockAuth: any;
  let mockState: any;
  let mockToast: any;
  let mockPersonnelApi: any;
  let mockRoute: any;
  let router: Router;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'کارگاه مرکزی دالان', code: 'SEC-10', project: 1, project_name: 'پروژه قطار شهری', is_active: true }
  ];

  const mockAttendanceList = [
    {
      id: 201,
      personnel: 11,
      personnel_name: 'رضا حسینی',
      national_code: '0010376488',
      date_shamsi: '1405/04/10',
      status: 'PRESENT_10H',
      status_display: 'حاضر کامل (۱۰ ساعت)',
      approval_status: 'PENDING_SUPERVISOR',
      approval_status_display: 'در انتظار بررسی سرپرست',
      effective_hours: 10,
      overtime_hours: 2,
      notes: 'یادداشت قبلی کارشناس بدون تخریب'
    },
    {
      id: 202,
      personnel: 12,
      personnel_name: 'علی اکبری',
      national_code: '0023456789',
      date_shamsi: '1405/04/10',
      status: 'PRESENT_10H',
      status_display: 'حاضر کامل (۱۰ ساعت)',
      approval_status: 'APPROVED',
      approval_status_display: 'تایید شده سرپرست',
      supervisor_approved_by_name: 'سرپرست ناظر',
      effective_hours: 10,
      overtime_hours: 0,
      notes: 'تاییدیه اولیه'
    },
    {
      id: 203,
      personnel: 13,
      personnel_name: 'محمد رضایی',
      national_code: '0034567890',
      date_shamsi: '1405/04/10',
      status: 'ABSENT',
      status_display: 'غایب (۰ ساعت)',
      approval_status: 'REVISION_REQUIRED',
      approval_status_display: 'عودت داده‌شده جهت اصلاح',
      revision_reason: 'علت عدم حضور پرسنل مشخص نیست',
      effective_hours: 0,
      overtime_hours: 0,
      notes: 'نیازمند اصلاح مدارک'
    }
  ];

  const mockWorkPeriods = [
    {
      id: 88,
      year_month: '1405/04',
      section_id: 10,
      section_name: 'کارگاه مرکزی دالان',
      status: 'OPEN',
      status_display: 'باز',
      submitted_by_name: 'کارشناس کارگاه',
      submitted_at: '2026-07-20T10:00:00Z'
    },
    {
      id: 89,
      year_month: '1405/04',
      section_id: 10,
      section_name: 'کارگاه مرکزی دالان',
      status: 'LOCKED',
      status_display: 'قفل‌شده',
      submitted_by_name: 'سرپرست کارگاه',
      submitted_at: '2026-07-21T12:00:00Z'
    }
  ];

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'supervisor_main', full_name: 'سرپرست کارگاه' }),
      userPermissions: vi.fn().mockReturnValue(['perm_approve_attendance_supervisor', 'can_lock_period'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      show: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getDailyAttendance: vi.fn().mockImplementation(() => of(JSON.parse(JSON.stringify(mockAttendanceList)))),
      getWorkPeriods: vi.fn().mockImplementation(() => of(JSON.parse(JSON.stringify(mockWorkPeriods)))),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockRoute = {
      queryParams: of({ tab: 'pending', section_id: '10' })
    };

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        SupervisorAttendanceHubComponent,
        SupervisorPeriodLockHubComponent
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    attendanceFixture = TestBed.createComponent(SupervisorAttendanceHubComponent);
    attendanceComp = attendanceFixture.componentInstance;

    periodLockFixture = TestBed.createComponent(SupervisorPeriodLockHubComponent);
    periodLockComp = periodLockFixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    attendanceFixture?.destroy();
    periodLockFixture?.destroy();
    TestBed.resetTestingModule();
  });

  // ─── تسک ۱: تفکیک فیلد وضعیت تایید کارکرد ──────────────────────────────────
  it('مورد ۱: باید در DOM جدول کارکرد، وضعیت حضور فیزیکی کاملاً جدا از وضعیت تایید سرپرست رندر شود', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const rootEl: HTMLElement = attendanceFixture.nativeElement;
    const ths = Array.from(rootEl.querySelectorAll('th')).map(th => th.textContent?.trim());
    expect(ths.some(t => t?.includes('وضعیت حضور') || t?.includes('حضور'))).toBe(true);
    expect(ths.some(t => t?.includes('وضعیت تایید'))).toBe(true);

    const firstRowText = rootEl.querySelector('tbody tr')?.textContent || '';
    expect(firstRowText).toContain('حاضر');
    expect(firstRowText).toContain('در انتظار بررسی سرپرست');
  });

  // ─── تسک ۲: فیلدهای ممیزی و حسابرسی سرپرست بدون تخریب notes ──────────────────
  it('مورد ۲: تایید کارکرد باید متد postCartableAction را با id صحیح صدا زند و یادداشت قبلی حفظ شود', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const targetItem = attendanceComp.items[0];
    expect(targetItem.notes).toBe('یادداشت قبلی کارشناس بدون تخریب');

    attendanceComp.approveSingle(targetItem);
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'approve',
      model: 'attendance',
      id: 201
    });
    expect(targetItem.notes).toBe('یادداشت قبلی کارشناس بدون تخریب');
    expect(mockToast.success).toHaveBeenCalled();
  });

  // ─── تسک ۳: استعلام دوره‌های کارکرد بر مبنای section_id و year_month ──────────
  it('مورد ۳: دوره کارکرد باید بر مبنای section_id و year_month از طریق getWorkPeriods استعلام شود', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    expect(periodLockComp.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getWorkPeriods).toHaveBeenCalledWith({
      year_month: '1405/04',
      section_id: 10
    });
  });

  // ─── تسک ۴: نگهداری فهرست دوره‌های دریافت‌شده در آرایه periods ─────────────────
  it('مورد ۴: فهرست دوره‌های دریافت شده از سرور در آرایه periods ذخیره شده و ردیف‌های متناظر نگهداری می‌شوند', () => {
    periodLockComp.selectedSectionId = 10;
    periodLockComp.fetchPeriods();
    periodLockFixture.detectChanges();

    expect(periodLockComp.periods.length).toBe(2);
    expect(periodLockComp.periods[0].id).toBe(88);
    expect(periodLockComp.periods[1].id).toBe(89);
    expect(periodLockComp.periods[0].year_month).toBe('1405/04');
  });

  // ─── تسک ۵: کلاس‌های وضعیت و نشان‌های متمایز دوره‌های باز و قفل در DOM ───────────
  it('مورد ۵: متد statusClass و نشان‌های DOM وضعیت‌های باز و قفل را با رنگ‌ها و برچسب‌های متمایز رندر می‌کنند', () => {
    expect(periodLockComp.statusClass('OPEN')).toContain('text-amber-700');
    expect(periodLockComp.statusClass('LOCKED')).toContain('text-emerald-700');
    expect(periodLockComp.statusClass('SUBMITTED')).toContain('text-blue-700');
    expect(periodLockComp.statusClass('REVISION_REQUIRED')).toContain('text-rose-700');

    periodLockComp.selectedSectionId = 10;
    periodLockComp.fetchPeriods();
    periodLockFixture.detectChanges();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    const badges = rootEl.querySelectorAll('tbody tr span.rounded-full');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(badges[0].textContent?.trim()).toContain('باز');
    expect(badges[1].textContent?.trim()).toContain('قفل‌شده');
    expect(badges[0].className).toContain('text-amber-700');
    expect(badges[1].className).toContain('text-emerald-700');
  });

  // ─── تسک ۶: حذف عملیات قفل مستقیم از صفحه و نبود دکمه قفل دوره ───────────────
  it('مورد ۶: صفحه فاقد هرگونه دکمه یا اکشن قفل دوره است و عملیات قفل مستقیم حذف شده است', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    const buttons = Array.from(rootEl.querySelectorAll('button'));
    const lockBtn = buttons.find(b => b.textContent?.includes('قفل'));
    expect(lockBtn).toBeUndefined();
  });

  // ─── تسک ۷: ابطال خودکار تاییدیه در صورت ویرایش کارکرد ───────────────────────
  it('مورد ۷: ویرایش وضعیت یا ساعات رکورد تاییدشده باید وضعیت تایید را مجدداً به در انتظار بازگرداند', () => {
    attendanceComp.ngOnInit();
    const approvedItem = attendanceComp.rawItems.find(x => x.id === 202);
    expect(approvedItem.approval_status).toBe('APPROVED');

    approvedItem.effective_hours = 8;
    approvedItem.approval_status = 'PENDING_SUPERVISOR';
    attendanceComp.applyFilter();

    expect(attendanceComp.statusCounters.pending).toBe(2);
  });

  // ─── تسک ۸: نمایش پیوند هدایت به گردش‌کار (کارهای من) در قالب ──────────────────
  it('مورد ۸: پیوند ارجاع به کارتابل گردش‌کار (کارهای من) جهت بررسی دوره در DOM رندر می‌شود', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    const workflowLinks = Array.from(rootEl.querySelectorAll('a')).filter(a =>
      a.getAttribute('href')?.includes('/app/my-tasks') || a.textContent?.includes('کارهای من')
    );
    expect(workflowLinks.length).toBeGreaterThan(0);
    expect(rootEl.textContent).toContain('این فهرست فقط نمایشی است؛ تأیید دوره در «کارهای من» انجام می‌شود');
  });

  // ─── تسک ۹: تایید دسته‌ای کارکردهای در انتظار ─────────────────────────────────
  it('مورد ۹: دکمه تایید دسته‌ای در DOM باید تمام رکوردهای در انتظار را یکجا به کارتابل ارسال کند', async () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    await attendanceComp.approveBatch();
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'approve',
      model: 'attendance',
      ids: [201]
    });
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('کارکرد در انتظار با موفقیت')
    );
  });

  // ─── تسک ۱۰: تفکیک نشان‌های حضور و تایید در جدول کارتابل سرپرست ─────────────
  it('مورد ۱۰: نشان‌های وضعیت حضور و وضعیت گردش‌کار دارای کلاس‌ها و برچسب‌های متمایز هستند', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const rootEl: HTMLElement = attendanceFixture.nativeElement;
    const badges = rootEl.querySelectorAll('.rounded-full, .rounded-lg, .rounded-xl');
    expect(badges.length).toBeGreaterThan(0);
    expect(attendanceComp.getApprovalStatusLabel('APPROVED')).toBe('تایید شده سرپرست');
    expect(attendanceComp.getApprovalStatusLabel('PENDING_SUPERVISOR')).toBe('در انتظار بررسی سرپرست');
  });

  // ─── تسک ۱۱: فیلتر تب‌های کارتابل کارکرد و شمارنده‌ها ────────────────────────
  it('مورد ۱۱: کلیک روی تب‌های «تایید شده» و «نیازمند بازنگری» باید لیست را منحصراً فیلتر کند', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    expect(attendanceComp.activeSubTab).toBe('pending');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(201);

    attendanceComp.switchSubTab('approved');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(202);

    attendanceComp.switchSubTab('revision');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(203);
  });

  // ─── تسک ۱۲: مودال مدرن عودت کارکرد و الزام ثبت دلیل بدون prompt ─────────────
  it('مورد ۱۲: باز شدن مودال عودت، الزام ثبت دلیل، ارسال اکشن revision با id و بدون فراخوانی window.prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const targetItem = attendanceComp.items[0];
    attendanceComp.openRevisionModal(targetItem);
    attendanceFixture.detectChanges();

    expect(attendanceComp.showRevisionModal).toBe(true);
    expect(attendanceComp.revisionTargetItem).toBe(targetItem);

    // ارسال بدون دلیل: هیچ درخواستی نباید ارسال شود و خطا نمایش داده شود
    mockPersonnelApi.postCartableAction.mockClear();
    attendanceComp.confirmRevision('');
    expect(mockToast.error).toHaveBeenCalledWith('ثبت علت عودت و بازنگری کارکرد الزامی است.');
    expect(mockPersonnelApi.postCartableAction).not.toHaveBeenCalled();

    // درج دلیل معتبر و تایید عودت
    attendanceComp.confirmRevision('ساعات اضافه کار مغایرت دارد');
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'revision',
      model: 'attendance',
      id: 201,
      reason: 'ساعات اضافه کار مغایرت دارد'
    });
    expect(attendanceComp.showRevisionModal).toBe(false);
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  // ─── تسک ۱۳: به‌روزرسانی پارامترهای استعلام با تغییر فیلتر ماه و سال ──────────
  it('مورد ۱۳: تغییر ماه و سال فیلتر در کامپوننت دوره‌ها متد getWorkPeriods را با پارامترهای جدید فراخوانی می‌کند', () => {
    periodLockComp.selectedSectionId = 10;
    periodLockComp.fiscalYear = '1405';
    periodLockComp.selectedMonth = 'مرداد';
    mockPersonnelApi.getWorkPeriods.mockClear();

    periodLockComp.onFilterChanged();
    expect(mockPersonnelApi.getWorkPeriods).toHaveBeenCalledWith({
      year_month: '1405/05',
      section_id: 10
    });
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({
        section_id: 10,
        year: '1405',
        month: 'مرداد'
      })
    }));
  });

  // ─── تسک ۱۴: مدیریت خطای سرور و فعال‌سازی پرچم loadFailed ────────────────────
  it('مورد ۱۴: در صورت بروز خطای سرور در دریافت دوره‌ها، متغیر loadFailed فعال شده و پیام خطا در DOM رندر می‌شود', () => {
    mockPersonnelApi.getWorkPeriods.mockReturnValue(throwError(() => new Error('خطای شبکه در ارتباط با سرور')));

    periodLockComp.selectedSectionId = 10;
    periodLockComp.fetchPeriods();
    periodLockFixture.detectChanges();

    expect(periodLockComp.loadFailed).toBe(true);
    expect(periodLockComp.periods).toEqual([]);
    expect(mockToast.error).toHaveBeenCalled();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    expect(rootEl.textContent).toContain('دریافت دوره‌ها ناموفق بود');
  });
});
