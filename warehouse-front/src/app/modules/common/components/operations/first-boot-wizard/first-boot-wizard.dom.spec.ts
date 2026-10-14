// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { FirstBootWizardComponent } from './first-boot-wizard';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { Company } from '../../../../../core/models/company.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('FirstBootWizardComponent DOM & Browser Unit Test (Type 1 Vitest + JSDOM)', () => {
  let fixture: ComponentFixture<FirstBootWizardComponent>;
  let component: FirstBootWizardComponent;
  let mockCompanyApi: any;
  let mockActiveCompanyService: any;
  let mockToast: any;
  let mockRouter: any;
  let isFirstBootSubject: BehaviorSubject<boolean>;

  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

  beforeEach(async () => {
    isFirstBootSubject = new BehaviorSubject<boolean>(true);

    mockCompanyApi = {
      create: vi.fn().mockImplementation((data: any) => of({
        id: 1,
        ...data,
        projects_count: 0,
        created_at: '2026-09-24T12:00:00Z',
        updated_at: '2026-09-24T12:00:00Z'
      }))
    };

    mockActiveCompanyService = {
      isFirstBoot$: isFirstBootSubject.asObservable(),
      selectCompany: vi.fn(),
      closeFirstBootWizard: vi.fn().mockImplementation(() => isFirstBootSubject.next(false)),
      loadAvailableCompanies: vi.fn().mockReturnValue(of({ companies: [], is_superuser: true }))
    };

    mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      show: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [FirstBootWizardComponent, CommonModule, FormsModule],
      providers: [
        { provide: ActiveCompanyService, useValue: mockActiveCompanyService },
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FirstBootWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    try {
      localStorage.removeItem('wh_installed_modules');
    } catch {}
  });

  it('۱. کامپوننت با موفقیت ایجاد می‌شود', () => {
    expect(component).toBeTruthy();
    expect(component.formData.has_warehouse_module).toBe(true);
    expect(component.formData.is_active).toBe(true);
  });

  it('۲. هنگامی که isFirstBoot$ مقدار true دارد، پنجره ویزارد در DOM رندر می‌شود', () => {
    const overlay = fixture.nativeElement.querySelector('.first-boot-overlay');
    expect(overlay).toBeTruthy();
    const title = fixture.nativeElement.querySelector('h2');
    expect(title.textContent).toContain('راه‌اندازی ساختار سازمانی هلدینگ');
  });

  it('۳. هنگامی که isFirstBoot$ مقدار false است، ویزارد از DOM حذف می‌شود', () => {
    isFirstBootSubject.next(false);
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('.first-boot-overlay');
    expect(overlay).toBeNull();
  });

  it('۴. فیلدهای الزامی فرم و پیش‌فرض فعال بودن ماژول انبار وجود دارند', () => {
    const nameInput = fixture.nativeElement.querySelector('#fb-company-name');
    const codeInput = fixture.nativeElement.querySelector('#fb-company-code');
    const nationalInput = fixture.nativeElement.querySelector('#fb-national-id');
    const economicInput = fixture.nativeElement.querySelector('#fb-economic-code');
    const addressInput = fixture.nativeElement.querySelector('#fb-company-address');

    expect(nameInput).toBeTruthy();
    expect(codeInput).toBeTruthy();
    expect(nationalInput).toBeTruthy();
    expect(economicInput).toBeTruthy();
    expect(addressInput).toBeTruthy();
  });

  it('۵. در صورت خالی بودن نام شرکت، اعتبارسنجی خطا می‌دهد و درخواست ارسال نمی‌شود', () => {
    component.formData.name = '';
    component.formData.code = 'PTS';
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toContain('نام رسمی شرکت');
    expect(mockCompanyApi.create).not.toHaveBeenCalled();
  });

  it('۶. در صورت خالی بودن کد اختصاری شرکت، اعتبارسنجی خطا می‌دهد و درخواست ارسال نمی‌شود', () => {
    component.formData.name = 'شرکت تست';
    component.formData.code = '';
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toContain('کد اختصاری شرکت');
    expect(mockCompanyApi.create).not.toHaveBeenCalled();
  });

  it('۷. در صورت نامعتبر بودن طول شناسه ملی (مثلاً ۶ رقم)، خطا نمایش داده می‌شود', () => {
    component.formData.name = 'شرکت پاینده';
    component.formData.code = 'PTS';
    component.formData.national_id = '123456';
    component.onSubmit();
    fixture.detectChanges();

    expect(component.errorMessage).toContain('شناسه ملی شرکت باید دقیقاً ۱۱ رقم باشد');
    expect(mockCompanyApi.create).not.toHaveBeenCalled();
  });

  it('۸. متد toggleWarehouseModule سوئیچ ماژول انبارداری را تغییر می‌دهد', () => {
    expect(component.formData.has_warehouse_module).toBe(true);
    component.toggleWarehouseModule();
    expect(component.formData.has_warehouse_module).toBe(false);
    component.toggleWarehouseModule();
    expect(component.formData.has_warehouse_module).toBe(true);
  });

  it('۹. ثبت موفق اطلاعات: فراخوانی create، انتخاب شرکت فعال، بستن ویزارد و هدایت به مرکز عملیات', () => {
    component.formData.name = 'شرکت بین‌المللی پارس';
    component.formData.code = 'PARS';
    component.formData.national_id = '10101234567';
    component.formData.economic_code = '4111222333';
    component.formData.address = 'تهران، کیلومتر ۱۴ جاده مخصوص';
    component.formData.has_warehouse_module = true;

    component.onSubmit();
    fixture.detectChanges();

    expect(mockCompanyApi.create).toHaveBeenCalledWith({
      name: 'شرکت بین‌المللی پارس',
      code: 'PARS',
      national_id: '10101234567',
      economic_code: '4111222333',
      address: 'تهران، کیلومتر ۱۴ جاده مخصوص',
      has_warehouse_module: true,
      is_active: true
    });

    expect(mockActiveCompanyService.selectCompany).toHaveBeenCalled();
    expect(mockActiveCompanyService.closeFirstBootWizard).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('شرکت بین‌المللی پارس'));
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/operations/companies']);
  });

  it('۱۰. مدیریت خطای پاسخ سرور: خطای سرور دریافت و در errorMessage نمایش داده می‌شود', () => {
    mockCompanyApi.create.mockReturnValue(throwError(() => ({
      error: { detail: 'کد شرکت تکراری است.' }
    })));

    component.formData.name = 'شرکت تکراری';
    component.formData.code = 'DUP';
    component.onSubmit();
    fixture.detectChanges();

    expect(component.isSubmitting).toBe(false);
    expect(component.errorMessage).toBe('کد شرکت تکراری است.');
    expect(mockActiveCompanyService.selectCompany).not.toHaveBeenCalled();
  });

  it('۱۱. ایزولاسیون تک‌ماژول (فقط مالی): کارت فعال‌سازی انبارداری در DOM نمایش داده نمی‌شود و واژگان انبار نشت نمی‌کنند', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'accounting']);
    fixture.detectChanges();

    const whCheckbox = fixture.nativeElement.querySelector('input[name="has_warehouse_module"]');
    expect(whCheckbox).toBeNull();
    // پیش‌فرض ذخیره‌سازی همچنان دست‌نخورده true می‌ماند
    expect(component.formData.has_warehouse_module).toBe(true);

    const cardText = fixture.nativeElement.textContent || '';
    expect(cardText).not.toContain('انبارداری پارس');
    expect(cardText).not.toContain('کدهای انبارداری');
    expect(cardText).not.toContain('دفتر مرکزی / انبار');
  });

  it('۱۲. ایزولاسیون تک‌ماژول (فقط انبار): کارت فعال‌سازی انبارداری نمایش داده می‌شود و پیش‌فرض true است', () => {
    const registry = TestBed.inject(ModuleRegistryService);
    registry.setInstalledModules(['platform', 'warehouse']);
    fixture.detectChanges();

    const whCheckbox = fixture.nativeElement.querySelector('input[name="has_warehouse_module"]');
    expect(whCheckbox).not.toBeNull();
    expect(component.formData.has_warehouse_module).toBe(true);
  });
});
