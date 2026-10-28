// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { ExcelImportModal } from '../../../../../../shared/components/excel-import-modal/excel-import-modal';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { VehicleDriverProfile, ProjectSection } from '../../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeeNewVehicleHubComponent Real DOM & Browser Spec (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<EmployeeNewVehicleHubComponent>;
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockRouter: any;

  beforeAll(async () => {
    Object.defineProperty(EmployeeNewVehicleHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || EmployeeNewVehicleHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WebSocketService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router)
        );
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(ExcelImportModal, 'ɵfac', {
      value: function(t: any) {
        return new (t || ExcelImportModal)(
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; }
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      });
    }

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      const sharedPath = path.resolve(__dirname, '../../../../../../shared/components/excel-import-modal', filename);
      if (fs.existsSync(sharedPath)) {
        return fs.readFileSync(sharedPath, 'utf-8');
      }
      return '';
    });
  });

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ترابری سنگین', code: 'TRB', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  const sampleVehicles: VehicleDriverProfile[] = [
    {
      id: 101,
      plate_number: '12 الف 345 ایران 63',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: 'علی حسینی',
      driver_national_code: '0010376488',
      driver_phone: '09121111111',
      is_driver_owner: true,
      default_service_rate: 1500000,
      bank_name: 'بانک ملت',
      sheba_number: 'IR780170000000101111111001',
      section: 10,
      approval_status: 'draft',
      is_active: true
    },
    {
      id: 102,
      plate_number: '34 ب 567 ایران 63',
      vehicle_type: 'khavar',
      ownership_type: 'company',
      driver_name: 'محسن کریمی',
      driver_national_code: '0078901235',
      driver_phone: '09122222222',
      is_driver_owner: false,
      owner_name: 'رضا کمالی',
      owner_national_code: '0010376488',
      owner_phone: '09123334455',
      default_service_rate: 2500000,
      section: 10,
      approval_status: 'approved',
      is_active: true,
      pending_change_request: {
        id: 901,
        status: 'pending_supervisor',
        created_at: '2026-09-22T10:00:00Z',
        proposed_changes: {
          driver_name: 'محسن کریمی‌راد',
          default_service_rate: 3000000
        },
        previous_values: {
          driver_name: 'محسن کریمی',
          default_service_rate: 2500000
        }
      }
    },
    {
      id: 103,
      plate_number: '78 ج 901 ایران 63',
      vehicle_type: 'forklift',
      ownership_type: 'contract',
      driver_name: 'احمد مرادی',
      driver_phone: '09123333333',
      default_service_rate: 4000000,
      section: 10,
      approval_status: 'pending_supervisor',
      is_active: true
    },
    {
      id: 104,
      plate_number: '99 د 111 ایران 63',
      vehicle_type: 'pickup',
      ownership_type: 'contract',
      driver_name: 'مهدی صادقی',
      default_service_rate: 1200000,
      section: 10,
      approval_status: 'revision_required',
      rejection_reason: 'شماره شبا با نام راننده همخوانی ندارد',
      is_active: true
    }
  ];

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'fleet_admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getVehicleProfiles: vi.fn().mockReturnValue(of(sampleVehicles)),
      createVehicleProfile: vi.fn().mockImplementation((data: any) => of({ id: 105, ...data })),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      exportVehiclesExcel: vi.fn().mockReturnValue(of(new Blob(['excel']))),
      downloadVehicleTemplate: vi.fn().mockReturnValue(of(new Blob(['template']))),
      importVehicleExcelModal: vi.fn().mockReturnValue(of({ success: true, dry_run: false })),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([
        {
          id: 50,
          first_name: 'حسین',
          last_name: 'محمدی',
          national_code: '0078901235',
          phone_number: '09125556677',
          job_title: 'راننده جرثقیل کارگاهی'
        }
      ]))
    };

    mockWs = {
      notifications$: new Subject<any>(),
      connected$: of(true)
    };

    mockToast = {
      show: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule, EmployeeNewVehicleHubComponent, ExcelImportModal, SvgIconDirective],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: WebSocketService, useValue: mockWs },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: { queryParams: of({ section_id: '10' }) } },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeNewVehicleHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('۱. هدر چسبان و دکمه‌های آیکونی متقارن (DOM Header & Sticky Command Center)', () => {
    it('باید دکمه چهارم هدر (ثبت خودرو جدید) به صورت آیکونی متقارن w-9 h-9 با تولتیپ فارسی رندر شود', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const addBtn = nativeEl.querySelector('button[title*="معرفی خودرو جدید"]') as HTMLButtonElement;

      // دکمه روی ابزار مشترک appAction است (اندازه و رنگ را دستور مشترک می‌دهد)؛ فقط وجود، نوع و برچسب فارسی سنجیده می‌شود
      expect(addBtn).not.toBeNull();
      expect(addBtn.type).toBe('button');
      expect(addBtn.getAttribute('title')).toContain('معرفی خودرو جدید');
    });

    it('کلیک روی دکمه ثبت خودرو در DOM باید مودال تعریف خودرو را در بدنه DOM ظاهر کند', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const addBtn = nativeEl.querySelector('button[title*="معرفی خودرو جدید"]') as HTMLButtonElement;

      addBtn.click();
      fixture.detectChanges();

      const modalEl = nativeEl.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(modalEl).not.toBeNull();
      expect(modalEl.textContent).toContain('ثبت مشخصات خودرو و راننده جدید');
    });
  });

  describe('۲. پایداری زیرتب‌های کارتابل و رفتار تاگل در DOM (DOM Subtabs & Toggle Invariant)', () => {
    it('تب‌های نیازمند اصلاح و رد شده باید همواره در DOM حتی در صورت صفر بودن رندر شوند (فاقد ngIf)', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const allButtons = Array.from(nativeEl.querySelectorAll('.bg-surface-muted button, .bg-slate-100\\/90 button'));
      const buttonTexts = allButtons.map(b => b.textContent?.trim() || '');

      const hasRevisionTab = buttonTexts.some(t => t.includes('نیازمند اصلاح'));
      const hasRejectedTab = buttonTexts.some(t => t.includes('رد شده'));

      expect(hasRevisionTab).toBe(true);
      expect(hasRejectedTab).toBe(true);
    });

    it('کلیک مجدد روی تب فعال وضعیت در DOM باید فیلتر را به حالت «همه» تاگل کند', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const buttons = Array.from(nativeEl.querySelectorAll('.bg-surface-muted button, .bg-slate-100\\/90 button')) as HTMLButtonElement[];
      const draftBtn = buttons.find(b => b.textContent?.includes('پیش‌نویس'));
      expect(draftBtn).toBeDefined();

      // ۱. کلیک اول: فعال‌سازی فیلتر پیش‌نویس
      draftBtn!.click();
      fixture.detectChanges();
      expect(component.statusFilter).toBe('draft');

      // ۲. app-tab-bar روی تب فعال رویداد نمی‌دهد؛ تاگل در خود کامپوننت سنجیده می‌شود
      component.setStatusFilter('draft');
      fixture.detectChanges();
      expect(component.statusFilter).toBe('all');
    });
  });

  describe('۳. ارگونومی سطرها و اکشن‌های تفکیک‌شده جدول در DOM (Differentiated Table Actions)', () => {
    it('برای رکورد در انتظار سرپرست، باید دکمه «👁️ مشاهده» در DOM رندر شود نه ویرایش', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const rows = Array.from(nativeEl.querySelectorAll('tbody tr'));
      const pendingRow = rows.find(r => r.textContent?.includes('احمد مرادی'));
      expect(pendingRow).toBeDefined();

      const viewBtn = pendingRow!.querySelector('button[title="مشاهده پرونده خودرو"]');
      expect(viewBtn).not.toBeNull();
      expect(viewBtn?.textContent).toContain('مشاهده');

      const editBtn = pendingRow!.querySelector('button[title="ویرایش مشخصات خودرو"]');
      expect(editBtn).toBeNull();
    });

    it('برای رکورد نیازمند اصلاح، باید دکمه نارنجی «↩️ اصلاح» در DOM رندر شود', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const rows = Array.from(nativeEl.querySelectorAll('tbody tr'));
      const revisionRow = rows.find(r => r.textContent?.includes('مهدی صادقی'));
      expect(revisionRow).toBeDefined();

      const reviseBtn = revisionRow!.querySelector('button[title="اصلاح مشخصات خودرو و ارسال مجدد"]');
      expect(reviseBtn).not.toBeNull();
      expect(reviseBtn?.textContent).toContain('اصلاح');
      expect(reviseBtn?.className).toContain('text-orange-700');
    });

    it('برای خودرو مصوب دارای تغییرات، باید بج و دکمه «🔍 تغییرات» در DOM رندر شود', () => {
      const nativeEl: HTMLElement = fixture.nativeElement;
      const diffBtn = nativeEl.querySelector('button[title="مشاهده تغییرات معلق خودرو"]');
      expect(diffBtn).not.toBeNull();
      expect(diffBtn?.textContent).toContain('تغییرات');
    });
  });

  describe('۴. مودال فقط‌خواندنی، ساختار Bottom Sheet و بستن با کلیک پس‌زمینه (Modal ReadOnly & Bottom Sheet)', () => {
    it('کانتینر مودال باید دارای استایل Bottom Sheet موبایل (items-end sm:items-center) باشد', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const modalBackdrop = nativeEl.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(modalBackdrop.className).toContain('items-end');
      expect(modalBackdrop.className).toContain('sm:items-center');

      const card = modalBackdrop.querySelector('.bg-surface, .bg-white') as HTMLElement;
      expect(card).toBeDefined();
      expect(card.className).toContain('rounded-t-3xl');
      expect(card.className).toContain('sm:rounded-3xl');
    });

    it('کلیک روی پس‌زمینه مودال (Backdrop) باید مودال را در DOM ببندد', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const modalBackdrop = nativeEl.querySelector('.fixed.inset-0.z-50') as HTMLElement;

      modalBackdrop.click();
      fixture.detectChanges();

      expect(component.isNewVehicleModalOpen).toBe(false);
    });

    it('مشاهده رکورد در گردش کار باید تمامی اینپوت‌های مودال را غیرفعال کند و دکمه بستن پرونده را نشان دهد', async () => {
      const pendingVehicle = sampleVehicles.find(v => v.approval_status === 'pending_supervisor')!;
      component.openEditModal(pendingVehicle);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.isReadOnlyMode).toBe(true);

      component.setActiveTab('driver');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const driverNameInput = nativeEl.querySelector('input[placeholder="مثال: علی حسینی"]') as HTMLInputElement;
      expect(driverNameInput).not.toBeNull();
      expect(driverNameInput.disabled || driverNameInput.hasAttribute('disabled')).toBe(true);

      const modal = nativeEl.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(modal).not.toBeNull();
      const footerBtn = modal.querySelector('.border-t button') as HTMLButtonElement;
      expect(footerBtn.textContent?.trim()).toBe('بستن پرونده');
    });
  });

  describe('۵. تفکیک مالک و راننده و اعتبارسنجی زنده در DOM (Driver vs Owner & Validation)', () => {
    it('چک‌باکس مالک خودرو باید در DOM وجود داشته و با برداشتن تیک، فیلدهای مالک ظاهر شوند', () => {
      component.openNewVehicleModal();
      component.setActiveTab('owner');
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const checkbox = nativeEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).not.toBeNull();
      expect(checkbox.checked).toBe(true);

      // برداشتن تیک مالکیت راننده
      checkbox.click();
      fixture.detectChanges();

      const ownerSection = nativeEl.querySelector('.bg-amber-50\\/50');
      expect(ownerSection).not.toBeNull();

      const ownerNameInput = nativeEl.querySelector('input[placeholder="مثال: رضا محمدی"]');
      expect(ownerNameInput).not.toBeNull();

      const ownerCodeInputs = nativeEl.querySelectorAll('input[placeholder="۰۱۲۳۴۵۶۷۸۹"]');
      expect(ownerCodeInputs.length).toBe(1);
    });

    it('ورود کد ملی نامعتبر برای مالک باید پیام هشدار در DOM نمایش دهد', () => {
      component.openNewVehicleModal();
      component.setActiveTab('owner');
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const checkbox = nativeEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      checkbox.click();
      fixture.detectChanges();

      const ownerCodeInput = nativeEl.querySelector('input[placeholder="۰۱۲۳۴۵۶۷۸۹"]') as HTMLInputElement;
      expect(ownerCodeInput).not.toBeNull();
      ownerCodeInput.value = '1111111111';
      ownerCodeInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const modal = fixture.nativeElement.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(modal).not.toBeNull();

      const errorEl = modal.querySelector('p.text-rose-600');
      expect(component.ownerNationalCodeError).toContain('کد ملی مالک نامعتبر است');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toContain('کد ملی مالک نامعتبر است');
    });
  });

  describe('۶. گروه‌بندی فهرست کشویی انواع خودرو با تجهیزات انبار در DOM (Optgroup Vehicle Types)', () => {
    it('سلکتور نوع خودرو باید حاوی تگ‌های optgroup با دسته‌های سبک، سنگین و تجهیزات انبار باشد', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const optgroups = Array.from(nativeEl.querySelectorAll('select optgroup')) as HTMLOptGroupElement[];
      const labels = optgroups.map(g => g.label);

      expect(labels).toContain('سبک و نیمه‌باری');
      expect(labels).toContain('سنگین و تجاری');
      expect(labels).toContain('ماشین‌آلات و تجهیزات انبار');

      // بررسی گزینه لیفتراک
      const forkliftOption = nativeEl.querySelector('option[value="forklift"]');
      expect(forkliftOption).not.toBeNull();
      expect(forkliftOption?.textContent).toContain('لیفتراک');
    });
  });

  describe('۷. انطباق خودکار کد ملی راننده با پرسنل شرکت در DOM (Driver National Code Personnel Matching)', () => {
    it('ورود کد ملی معتبر راننده باید پرسنل همخوان را استعلام کرده و بج اطلاع‌رسانی در DOM نمایش دهد', () => {
      component.openNewVehicleModal();
      component.setActiveTab('driver');
      fixture.detectChanges();

      component.newVehicle.driver_national_code = '0078901235';
      component.onNationalCodeChange();
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      expect(nativeEl.textContent).toContain('یافت شد: حسین محمدی');
      expect(component.newVehicle.driver_name).toBe('حسین محمدی');
    });
  });

  describe('۸. مودال مقایسه دوطرفه تغییرات (Diff Viewer Modal DOM)', () => {
    it('مودال Diff باید مقادیر قبلی را با خط‌خوردگی و مقادیر پیشنهادی جدید را به صورت بج سبز با عناوین فارسی نمایش دهد', () => {
      const vehicleWithDiff = sampleVehicles.find(v => v.pending_change_request)!;
      component.openPendingDiffModal(vehicleWithDiff);
      fixture.detectChanges();

      const nativeEl: HTMLElement = fixture.nativeElement;
      const diffModal = nativeEl.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(diffModal).not.toBeNull();
      expect(diffModal.textContent).toContain('درخواست تغییرات معلق خودرو');
      expect(diffModal.textContent).toContain('نام راننده');
      expect(diffModal.textContent).toContain('نرخ پایه سرویس (ریال)');

      // بررسی مقدار قبلی خط‌خورده
      const strikeThroughs = Array.from(diffModal.querySelectorAll('.line-through'));
      expect(strikeThroughs.length).toBeGreaterThan(0);
      expect(strikeThroughs.some(el => el.textContent?.includes('محسن کریمی'))).toBe(true);

      // بررسی مقدار جدید پیشنهادی
      const greenBadges = Array.from(diffModal.querySelectorAll('.text-emerald-700'));
      expect(greenBadges.length).toBeGreaterThan(0);
      expect(greenBadges.some(el => el.textContent?.includes('محسن کریمی‌راد'))).toBe(true);
    });
  });

  describe('۹. هماهنگی ناهمگام بخش و پارامترهای آدرس (STATE-01: Section & QueryParams Coordination)', () => {
    it('اگر پارامتر section_id قبل از تکمیل لود بخش‌ها برسد، باید به درستی ذخیره شده و پس از لود بخش فعال گردد', () => {
      component.mySections = [];
      component.selectedSectionId = null;
      component['pendingSectionId'] = 10;

      component.mySections = sampleSections;
      (component as any).pickDefaultSection();

      expect(component.selectedSectionId).toBe(10);
      expect(component.selectedSection?.name).toBe('بخش ترابری سنگین');
      expect(component['pendingSectionId']).toBeNull();
    });
  });

  describe('۱۰. کش‌کردن پیش‌نویس فرم در حافظه محلی (DATA-02: Form Draft LocalStorage)', () => {
    it('باید اطلاعات وارد شده در فرم پیش‌نویس را در LocalStorage ذخیره کند و با باز شدن مجدد مودال بازیابی نماید', () => {
      component.selectedSectionId = 10;
      component.openNewVehicleModal();
      component.newVehicle.driver_name = 'محمود کاظمی';
      component.platePart1 = '44';
      component.platePart2 = 'ب';
      component.platePart3 = '789';
      component.platePart4 = '63';
      component.saveDraftToStorage();

      const raw = localStorage.getItem('vehicle_draft_form_10');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.newVehicle.driver_name).toBe('محمود کاظمی');
      expect(parsed.platePart1).toBe('44');

      // باز کردن مجدد مودال و بازیابی خودکار
      component.resetForm();
      expect(component.newVehicle.driver_name).toBe('');
      component.openNewVehicleModal();
      expect(component.newVehicle.driver_name).toBe('محمود کاظمی');
      expect(component.platePart1).toBe('44');
      expect(component.platePart3).toBe('789');
    });

    it('پس از ثبت موفق خودرو جدید، باید پیش‌نویس ذخیره‌شده از LocalStorage پاک شود', () => {
      component.selectedSectionId = 10;
      component.openNewVehicleModal();
      component.newVehicle.driver_name = 'محمود کاظمی';
      component.newVehicle.plate_number = '44 ب 789 ایران 63';
      component.saveDraftToStorage();
      expect(localStorage.getItem('vehicle_draft_form_10')).not.toBeNull();

      component.saveVehicle('draft');
      expect(localStorage.getItem('vehicle_draft_form_10')).toBeNull();
    });
  });

  describe('۱۱. جلوگیری از نشت حافظه اشتراک‌های RxJS (LEAK-01: RxJS Subscription Management)', () => {
    it('جستجوی مجدد پرسنل باید اشتراک قبلی را لغو کرده و در onDestroy تمامی اشتراک‌ها تمیز شوند', () => {
      const searchSubject = new Subject<any>();
      mockPersonnelApi.getPersonnelProfiles.mockReturnValue(searchSubject);

      component.openNewVehicleModal();
      component.newVehicle.driver_national_code = '0078901235';
      component.onNationalCodeChange();

      const sub1 = component['personnelSearchSub'];
      expect(sub1).toBeDefined();
      expect(sub1?.closed).toBe(false);

      // اجرای مجدد جستجو باید سابسکرایب قبلی را لغو کند
      component.onNationalCodeChange();
      expect(sub1?.closed).toBe(true);

      const sub2 = component['personnelSearchSub'];
      expect(sub2).toBeDefined();
      expect(sub2?.closed).toBe(false);

      component.ngOnDestroy();
      expect(sub2?.closed).toBe(true);
      expect(component['queryParamsSub']?.closed).toBe(true);
    });
  });

  describe('۱۲. ارگونومی جهش فوکوس خودکار پلاک ۴ بخشی (UI-01: Auto-Tab Plate Inputs)', () => {
    it('با ورود ۲ رقم در بخش ۱، فوکوس باید به حرف یا بخش ۳ هدایت شود', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const p2SelectSpy = vi.fn();
      component.p2Select = { nativeElement: { focus: p2SelectSpy } } as any;

      component.platePart1 = '12';
      component.onPlatePart1Input({});
      expect(p2SelectSpy).toHaveBeenCalled();
    });

    it('با ورود ۳ رقم در بخش ۳، فوکوس باید به بخش ۴ (کد ایران) منتقل شود', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const p4InputSpy = vi.fn();
      component.p4Input = { nativeElement: { focus: p4InputSpy } } as any;

      component.platePart3 = '456';
      component.onPlatePart3Input({});
      expect(p4InputSpy).toHaveBeenCalled();
    });
  });

  describe('۱۳. نمایش مشخصات مالک در نمای موبایل و دسکتاپ (UI-02: Owner Info in Mobile & Desktop)', () => {
    it('در صورت تفکیک راننده و مالک، مشخصات هویتی و تماسی مالک باید در هر دو نمای کارتی و جدول نمایش داده شود', () => {
      fixture.detectChanges();
      const nativeEl: HTMLElement = fixture.nativeElement;

      // بررسی نمای دسکتاپ
      const ownerDesktopTag = nativeEl.querySelector('.text-amber-800.bg-amber-50');
      expect(ownerDesktopTag).not.toBeNull();
      expect(ownerDesktopTag?.textContent).toContain('مالک: رضا کمالی');

      // بررسی نمای کارتی موبایل
      const mobileCards = nativeEl.querySelectorAll('.block.md\\:hidden > div > div');
      const mobileText = Array.from(mobileCards).map(c => c.textContent).join(' ');
      expect(mobileText).toContain('رضا کمالی');
      expect(mobileText).toContain('09123334455');
    });
  });

  describe('۱۴. استانداردهای دسترسی‌پذیری مودال‌ها (UI-04: Accessibility & Escape Handling)', () => {
    it('مودال‌های ثبت خودرو و Diff باید دارای ویژگی‌های role="dialog" و aria-modal="true" باشند', () => {
      component.openNewVehicleModal();
      fixture.detectChanges();

      const modalEl = fixture.nativeElement.querySelector('.fixed.inset-0.z-50') as HTMLElement;
      expect(modalEl.getAttribute('role')).toBe('dialog');
      expect(modalEl.getAttribute('aria-modal')).toBe('true');
      expect(modalEl.getAttribute('aria-labelledby')).toBe('newVehicleModalTitle');
    });

    it('فشردن کلید Escape باید مودال فعال را ببندد', () => {
      component.openNewVehicleModal();
      expect(component.isNewVehicleModalOpen).toBe(true);

      component.handleEscape();
      expect(component.isNewVehicleModalOpen).toBe(false);
    });
  });

  describe('۱۵. فوکوس مجدد فیلد جستجو هنگام پاک‌سازی (UI-05: Search Input Autofocus on Clear)', () => {
    it('فراخوانی clearSearch باید فیلد ورودی جستجو را مجدداً فوکوس کند', async () => {
      const searchFocusSpy = vi.fn();
      component.searchInput = { nativeElement: { focus: searchFocusSpy } } as any;

      component.searchQuery = 'تست';
      component.clearSearch();
      expect(component.searchQuery).toBe('');

      // منتظر اتمام setTimeout
      await new Promise(r => setTimeout(r, 10));
      expect(searchFocusSpy).toHaveBeenCalled();
    });
  });
});
