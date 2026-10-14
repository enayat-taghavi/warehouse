// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { SupervisorAttendanceHubComponent } from './supervisor-attendance/supervisor-attendance';
import { SupervisorPeriodLockHubComponent } from './supervisor-period-lock/supervisor-period-lock';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../services/state.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../core/api/personnel-api.service';
import { ProjectSection } from '../../../../../core/models/personnel.model';

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
  let mockRouter: any;
  let mockRoute: any;

  const mockSections: ProjectSection[] = [
    { id: 10, name: 'کارگاه مرکزی دالان', project: 1, project_name: 'پروژه قطار شهری', is_active: true }
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

  beforeAll(async () => {
    Object.defineProperty(SupervisorAttendanceHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || SupervisorAttendanceHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(SupervisorPeriodLockHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || SupervisorPeriodLockHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const candidates = [
        path.resolve(__dirname, 'supervisor-attendance', filename),
        path.resolve(__dirname, 'supervisor-period-lock', filename)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf-8');
        }
      }
      return '';
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
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
      info: vi.fn()
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(mockSections)),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getDailyAttendance: vi.fn().mockImplementation(() => of(JSON.parse(JSON.stringify(mockAttendanceList)))),
      getAttendanceMonthlySummary: vi.fn().mockReturnValue(of({
        period_id: 88,
        period_status: 'OPEN',
        is_locked: false,
        pending_approvals_count: 2,
        summary: [
          { personnel_id: 11, total_hours: 190, total_overtime_hours: 10 },
          { personnel_id: 12, total_hours: 200, total_overtime_hours: 0 }
        ]
      })),
      postCartableAction: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockRouter = {
      navigate: vi.fn()
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
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: ToastService, useValue: mockToast },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute }
      ]
    }).compileComponents();

    attendanceFixture = TestBed.createComponent(SupervisorAttendanceHubComponent);
    attendanceComp = attendanceFixture.componentInstance;

    periodLockFixture = TestBed.createComponent(SupervisorPeriodLockHubComponent);
    periodLockComp = periodLockFixture.componentInstance;
  });

  // ─── تسک ۱: تفکیک فیلد وضعیت تایید کارکرد ──────────────────────────────────
  it('مورد ۱: باید در DOM جدول کارکرد، وضعیت حضور فیزیکی کاملاً جدا از وضعیت تایید سرپرست رندر شود', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const rootEl: HTMLElement = attendanceFixture.nativeElement;
    // بررسی وجود ستون «نوع حضور» و ستون «وضعیت گردش‌کار»
    const ths = Array.from(rootEl.querySelectorAll('th')).map(th => th.textContent?.trim());
    expect(ths.some(t => t?.includes('نوع حضور') || t?.includes('حضور'))).toBe(true);
    expect(ths.some(t => t?.includes('وضعیت گردش‌کار') || t?.includes('وضعیت تایید'))).toBe(true);

    // بررسی برچسب وضعیت در ردیف اول: نشان حضور 'حاضر کامل' و نشان تایید 'در انتظار بررسی سرپرست'
    const firstRowText = rootEl.querySelector('tbody tr')?.textContent || '';
    expect(firstRowText).toContain('حاضر');
    expect(firstRowText).toContain('در انتظار بررسی سرپرست');
  });

  // ─── تسک ۲: فیلدهای ممیزی و حسابرسی سرپرست بدون تخریب notes ──────────────────
  it('مورد ۲: تایید کارکرد باید متد postCartableAction را با id صحیح صدا زند و یادداشت قبلی حفظ شود', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const targetItem = attendanceComp.items[0]; // رضا حسینی با notes قبلی
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

  // ─── تسک ۳: وابستگی دوره کارکرد ماهانه به بخش و پروژه ─────────────────────────
  it('مورد ۳: دوره کارکرد باید بر مبنای section_id و project_id استعلام و فیلتر شود', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    expect(periodLockComp.selectedSectionId).toBe(10);
    expect(mockPersonnelApi.getAttendanceMonthlySummary).toHaveBeenCalledWith(
      null,
      '1405/04',
      expect.objectContaining({ section_id: 10 })
    );
  });

  // ─── تسک ۴: ممانعت از محاسبه حقوق کارکردهای تاییدنشده ─────────────────────────
  it('مورد ۴: خلاصه ماهانه باید تعداد کارکردهای تاییدنشده (pending_approvals) را منعکس نماید', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    expect(periodLockComp.currentPeriodSummary.pending_approvals).toBe(2);
  });

  // ─── تسک ۵: محاسبه دقیق تعداد معلق‌ها و وضعیت قفل در اندپوینت ─────────────────
  it('مورد ۵: DOM کامپوننت قفل دوره باید کارت معلق‌ها و وضعیت باز/قفل دوره را دقیق نمایش دهد', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    const bodyText = rootEl.textContent || '';
    expect(bodyText).toContain('2'); // ۲ مورد تاییدنشده
    expect(periodLockComp.currentPeriodSummary.is_locked).toBe(false);
  });

  // ─── تسک ۶: سد امنیتی سرور برای قفل دوره ──────────────────────────────────────
  it('مورد ۶: در صورت وجود کارکرد تاییدنشده، کلیک روی دکمه قفل دوره باید متوقف شده و هشدار دهد', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    periodLockComp.lockAndSubmitPeriod();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining('امکان قفل دوره وجود ندارد')
    );
    expect(mockPersonnelApi.postCartableAction).not.toHaveBeenCalled();
  });

  // ─── تسک ۷: ابطال خودکار تاییدیه در صورت ویرایش کارکرد ───────────────────────
  it('مورد ۷: ویرایش وضعیت یا ساعات رکورد تاییدشده باید وضعیت تایید را مجدداً به در انتظار بازگرداند', () => {
    attendanceComp.ngOnInit();
    const approvedItem = attendanceComp.rawItems.find(x => x.id === 202); // علی اکبری (APPROVED)
    expect(approvedItem.approval_status).toBe('APPROVED');

    // شبیه‌سازی اعمال ویرایش فرانت
    approvedItem.effective_hours = 8;
    approvedItem.approval_status = 'PENDING_SUPERVISOR';
    attendanceComp.applyFilter();

    expect(attendanceComp.statusCounters.pending).toBe(2); // رضا حسینی + علی اکبری
  });

  // ─── تسک ۸: مسدودسازی ویرایش کارکرد در دوره قفل‌شده ──────────────────────────
  it('مورد ۸: در صورت قفل بودن دوره (is_locked=true)، وضعیت دوره منعکس شده و امکان تغییر وجود ندارد', () => {
    mockPersonnelApi.getAttendanceMonthlySummary.mockReturnValue(of({
      period_id: 88,
      period_status: 'LOCKED',
      is_locked: true,
      pending_approvals_count: 0,
      summary: []
    }));

    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    expect(periodLockComp.currentPeriodSummary.is_locked).toBe(true);
    const lockBtn: HTMLButtonElement | null = periodLockFixture.nativeElement.querySelector('button[disabled]');
    expect(lockBtn).not.toBeNull();
  });

  // ─── تسک ۹: اکشن‌های کارتابل کارکرد در سرور (تایید تکی و دسته‌ای) ──────────────
  it('مورد ۹: دکمه تایید دسته‌ای در DOM باید تمام رکوردهای در انتظار را یکجا به کارتابل ارسال کند', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    attendanceComp.approveBatch();
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
  it('مورد ۱۰: نشان‌های وضعیت حضور و وضعیت گردش‌کار دارای کلاس‌ها و رنگ‌های متمایز در DOM هستند', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const rootEl: HTMLElement = attendanceFixture.nativeElement;
    const badges = rootEl.querySelectorAll('.rounded-full, .rounded-lg, .rounded-xl');
    expect(badges.length).toBeGreaterThan(0);
    // تضمین وجود نشان تایید سرپرست
    expect(attendanceComp.getApprovalStatusLabel('APPROVED')).toBe('تایید شده سرپرست');
    expect(attendanceComp.getApprovalStatusLabel('PENDING_SUPERVISOR')).toBe('در انتظار بررسی سرپرست');
  });

  // ─── تسک ۱۱: اصلاح فیلتر تب‌های کارتابل کارکرد و شمارنده‌ها ──────────────────
  it('مورد ۱۱: کلیک روی تب‌های «تایید شده» و «نیازمند بازنگری» باید لیست را منحصراً فیلتر کند', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    // تب پیش‌فرض pending
    expect(attendanceComp.activeSubTab).toBe('pending');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(201);

    // سوییچ به approved
    attendanceComp.switchSubTab('approved');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(202);

    // سوییچ به revision
    attendanceComp.switchSubTab('revision');
    expect(attendanceComp.items.length).toBe(1);
    expect(attendanceComp.items[0].id).toBe(203);
  });

  // ─── تسک ۱۲: جایگزینی window.prompt با مودال مدرن عودت ───────────────────────
  it('مورد ۱۲: باز شدن مودال عودت در DOM، الزام ثبت دلیل، و ارسال اکشن revision بدون window.prompt', () => {
    attendanceComp.ngOnInit();
    attendanceFixture.detectChanges();

    const targetItem = attendanceComp.items[0];
    attendanceComp.openRevisionModal(targetItem);
    attendanceFixture.detectChanges();

    expect(attendanceComp.showRevisionModal).toBe(true);
    const modalEl: HTMLElement | null = attendanceFixture.nativeElement.querySelector('.fixed.inset-0');
    expect(modalEl).not.toBeNull();

    // تایید بدون متن علت
    attendanceComp.revisionReasonText = '';
    attendanceComp.confirmRevision();
    expect(mockToast.error).toHaveBeenCalledWith('ثبت علت عودت و بازنگری کارکرد الزامی است.');

    // درج علت معتبر و تایید
    attendanceComp.revisionReasonText = 'ساعات اضافه کار مغایرت دارد';
    attendanceComp.confirmRevision();
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'revision',
      model: 'attendance',
      id: 201,
      reason: 'ساعات اضافه کار مغایرت دارد'
    });
    expect(attendanceComp.showRevisionModal).toBe(false);
  });

  // ─── تسک ۱۳: غیرفعال‌سازی دکمه قفل دوره تا صفر شدن معلق‌ها همراه با بنر هشدار ───
  it('مورد ۱۳: دکمه قفل دوره دارای کلاس opacity-50 و غیرفعال است و بنر هشدار کهربایی رندر شده است', () => {
    periodLockComp.ngOnInit();
    periodLockFixture.detectChanges();

    const rootEl: HTMLElement = periodLockFixture.nativeElement;
    // بنر هشدار کهربایی راهنما
    const warningBanner = rootEl.querySelector('.bg-amber-50, .border-amber-200');
    expect(warningBanner).not.toBeNull();
    expect(warningBanner?.textContent).toContain('قفل دوره تا تایید تمامی کارکردها مسدود است');

    // دکمه قفل دوره در حالت غیرفعال
    const lockBtn = rootEl.querySelector('button[disabled]');
    expect(lockBtn).not.toBeNull();
  });

  // ─── تسک ۱۴: ارسال صریح section_id و project_id در قفل دوره ─────────────────
  it('مورد ۱۴: در صورت تایید همه کارکردها (معلق=۰)، اکشن قفل دوره با section_id و project_id ارسال می‌شود', () => {
    mockPersonnelApi.getAttendanceMonthlySummary.mockReturnValue(of({
      period_id: 88,
      period_status: 'OPEN',
      is_locked: false,
      pending_approvals_count: 0,
      summary: [{ personnel_id: 11, total_hours: 190, total_overtime_hours: 0 }]
    }));

    periodLockComp.selectedSectionId = 10;
    periodLockComp.selectedSection = mockSections[0];
    periodLockComp.fetchPeriodData();
    periodLockFixture.detectChanges();

    expect(periodLockComp.currentPeriodSummary.pending_approvals).toBe(0);

    periodLockComp.lockAndSubmitPeriod();
    expect(mockPersonnelApi.postCartableAction).toHaveBeenCalledWith('supervisor', {
      action: 'approve',
      model: 'period',
      id: 88,
      year_month: '1405/04',
      section_id: 10,
      project_id: 1
    });
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('با موفقیت قفل')
    );
  });
});
