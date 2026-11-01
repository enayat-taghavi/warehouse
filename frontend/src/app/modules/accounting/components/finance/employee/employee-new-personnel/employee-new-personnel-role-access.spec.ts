// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasRoutePermission } from '../../../../../../core/auth/auth.guard';
import { isAccountingRouteDeniedForRole } from '../../../../personas';
import { ACCOUNTANT_NAV_ITEMS } from '../../../../nav-items';
import { EmployeeNewPersonnelHubComponent } from './employee-new-personnel';
import { of } from 'rxjs';

describe('Employee New Personnel - Role Access & Excel Import Verification (Superuser vs Accountant)', () => {
  // ۱. بررسی دسترسی روت‌ها (Route Permissions)
  describe('Route Access Guards', () => {
    const superuserPerms = ['admin_all'];
    const standardAccountantPerms = ['view_sys_payroll', 'perm_approve_personnel_finance', 'view_sys_personnel'];
    const unauthorizedPerms = ['view_sys_dashboard'];

    it('مدیر کل سیستم (Superuser) به روت ثبت پرسنل جدید به بخش (employee-new-personnel) دسترسی دارد', () => {
      expect(hasRoutePermission('employee-new-personnel', superuserPerms)).toBe(true);
    });

    it('مدیر کل سیستم (Superuser) به روت بانک پرونده‌ها (profiles) دسترسی دارد', () => {
      expect(hasRoutePermission('profiles', superuserPerms)).toBe(true);
    });

    it('حسابدار با دسترسی استاندارد مالی (view_sys_payroll) اکنون به روت ثبت پرسنل به تفکیک بخش دسترسی دارد', () => {
      expect(hasRoutePermission('employee-new-personnel', standardAccountantPerms)).toBe(true);
      // بررسی عدم بانس و تفکیک نقش (SoD): نباید برای نقش حسابدار Denied شود
      expect(isAccountingRouteDeniedForRole('accountant', '/app/finance/employee-new-personnel')).toBe(false);
    });

    it('حسابدار به روت بانک پرونده‌ها (profiles) دسترسی دارد چون دسترسی view_sys_personnel دارد', () => {
      expect(hasRoutePermission('profiles', standardAccountantPerms)).toBe(true);
    });

    it('کاربر فاقد مجوزهای حقوق یا کارکرد از دسترسی به employee-new-personnel منع می‌شود', () => {
      expect(hasRoutePermission('employee-new-personnel', unauthorizedPerms)).toBe(false);
    });
  });

  // ۲. بررسی منوی ناوبری حسابدار (Navigation Menu)
  describe('Accountant Navigation Menu (ACCOUNTANT_NAV_ITEMS)', () => {
    it('آیتم ثبت پرسنل جدید به تفکیک بخش (employee-new-personnel) در منوی پیش‌فرض حسابدار وجود ندارد', () => {
      const found = ACCOUNTANT_NAV_ITEMS.find(item => item.id === 'employee-new-personnel' || item.id === 'employee/new-personnel');
      expect(found).toBeUndefined();
    });

    it('آیتم بانک پرونده‌ها (profiles) در منوی حسابدار وجود دارد', () => {
      const found = ACCOUNTANT_NAV_ITEMS.find(item => item.id === 'profiles');
      expect(found).toBeDefined();
      expect(found?.label).toBe('بانک پرونده‌ها');
    });
  });

  // ۳. بررسی رفتار کامپوننت ثبت پرسنل جدید در زمان بارگذاری فایل اکسل
  describe('EmployeeNewPersonnelHubComponent Excel Import Workflow', () => {
    let component: EmployeeNewPersonnelHubComponent;
    let mockToast: any;
    let mockPersonnelApi: any;
    let mockCdr: any;

    beforeEach(() => {
      mockToast = {
        show: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn()
      };
      mockPersonnelApi = {
        importPersonnelExcelModal: vi.fn().mockReturnValue(of({
          success: true,
          created_count: 59,
          updated_count: 0,
          summary: { total_rows: 59, created: 59, updated: 0, skipped: 0, valid_count: 59, error_count: 0 },
          fields_info: { detected_count: 35, unrecognized_count: 5, missing_count: 2 }
        })),
        getMySections: vi.fn().mockReturnValue(of([])),
        getPersonnelBySection: vi.fn().mockReturnValue(of([]))
      };
      mockCdr = {
        detectChanges: vi.fn()
      };

      component = new EmployeeNewPersonnelHubComponent(
        {} as any, // AuthService
        mockPersonnelApi,
        {} as any, // WebSocketService
        mockToast,
        mockCdr,
        { queryParams: of({}) } as any, // ActivatedRoute
        {} as any, // Router
        { activeCompanyId: vi.fn().mockReturnValue(1) } as any // ActiveCompanyService
      );
    });

    it('اگر قبل از انتخاب بخش، روی دکمه بارگذاری اکسل کلیک شود، هشدار انتخاب بخش نمایش داده می‌شود', () => {
      component.selectedSectionId = null;
      component.openImportModal();

      expect(component.isExcelModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
    });

    it('پس از انتخاب بخش، مودال ایمپورت اکسل باز شده و تابع excelImportFn به درستی sectionId را ارسال می‌کند', () => {
      component.selectedSectionId = 42;
      component.openImportModal();

      expect(component.isExcelModalOpen).toBe(true);
      expect(component.excelImportFn).toBeDefined();

      const fakeFile = new File(['dummy'], 'mehr1405.xlsx');
      component.excelImportFn(fakeFile, true, false).subscribe(res => {
        expect(res.success).toBe(true);
        expect(res.created_count).toBe(59);
      });

      expect(mockPersonnelApi.importPersonnelExcelModal).toHaveBeenCalledWith(fakeFile, 42, true, false);
    });
  });
});
