// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseSettings } from './base-settings';
import { of } from 'rxjs';

describe('BaseSettings Unit Tests', () => {
  let component: BaseSettings;
  let mockState: any;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockState = {
      hasRole: vi.fn().mockReturnValue(true)
    };

    mockAuth = {
      userPermissions: vi.fn().mockReturnValue(['perm_sys_settings', 'admin_all'])
    };

    mockPersonnelApi = {
      getFinancialProjects: vi.fn().mockReturnValue(of([
        { id: 1, name: 'پروژه تست', code: 'PRJ-01' }
      ])),
      getSettingsVersions: vi.fn().mockReturnValue(of([
        { id: 1, fiscal_year: '1405', effective_from: '1405/01', version_title: 'نسخه فروردین', is_active: true }
      ])),
      createSettingsVersion: vi.fn().mockReturnValue(of({
        id: 2, fiscal_year: '1405', effective_from: '1405/07', version_title: 'اصلاحیه نیمه دوم', is_active: true
      })),
      getYearlySettings: vi.fn().mockReturnValue(of({
        id: 1,
        fiscal_year: '1405',
        effective_from: '1405/01',
        monthly_housing_allowance: 30000000,
        monthly_food_allowance: 22000000,
        attendance_edit_past_days: 3,
        attendance_edit_future_days: 0,
        standard_daily_hours: 10,
        job_grades: [
          { grade_number: 1, daily_base_wage: 2000000, daily_seniority_bonus: 50000 }
        ]
      })),
      updateYearlySettings: vi.fn().mockReturnValue(of({
        message: 'تنظیمات با موفقیت ذخیره شد',
        settings: { id: 1, fiscal_year: '1405' }
      })),
      updateAllSettingsTabs: vi.fn().mockReturnValue(of({
        message: 'تنظیمات با موفقیت ذخیره شد',
        settings: { id: 1, fiscal_year: '1405' }
      })),
      cloneSettingsForProject: vi.fn().mockReturnValue(of({
        id: 99,
        fiscal_year: '1405',
        project: 1,
        project_name: 'پروژه تست'
      })),
      revertSettingsToGlobal: vi.fn().mockReturnValue(of({
        message: 'تنظیمات با موفقیت به سراسری بازگشت',
        fiscal_year: '1405'
      })),
      getAvailableFiscalYears: vi.fn().mockReturnValue(of({
        years: ['1405']
      })),
      createFiscalYear: vi.fn().mockReturnValue(of({
        id: 101,
        fiscal_year: '1406',
        effective_from: '1406/01',
        version_title: 'احکام مصوب فروردین'
      }))
    };

    mockToast = {
      show: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({ tab: 'payroll_settings', year: '1405' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new BaseSettings(
      mockAuth,
      mockState,
      mockPersonnelApi,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
  });

  it('should initialize and load yearly settings with versions', () => {
    component.ngOnInit();
    expect(component.activeTab).toBe('grades');
    expect(mockPersonnelApi.getSettingsVersions).toHaveBeenCalledWith('1405', null);
    expect(mockPersonnelApi.getYearlySettings).toHaveBeenCalledWith('1405', null, 1, '1405/01');
    expect(component.yearlySettings).toBeDefined();
    expect(component.canManageSettings).toBe(true);
    expect(component.versions.length).toBe(1);
  });

  it('should switch tabs and sync query parameters', () => {
    component.setTab('labor');
    expect(component.activeTab).toBe('labor');
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('should update attendance edit window presets', () => {
    component.ngOnInit();
    component.setAttendanceWindowPreset(7, 1);
    expect(component.yearlySettings?.attendance_edit_past_days).toBe(7);
    expect(component.yearlySettings?.attendance_edit_future_days).toBe(1);
  });

  it('should save yearly settings across all tabs', () => {
    component.ngOnInit();
    component.saveYearlySettings();
    expect(mockPersonnelApi.updateYearlySettings).toHaveBeenCalledWith('1405', expect.any(Object));
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
  });

  it('should switch versions and reload settings for that version', () => {
    component.ngOnInit();
    component.onVersionChange(2);
    expect(component.selectedVersionId).toBe(2);
    expect(mockPersonnelApi.getYearlySettings).toHaveBeenCalledWith('1405', null, 2, null);
  });

  it('should open create version modal and submit new mid-year version', () => {
    component.ngOnInit();
    mockPersonnelApi.getSettingsVersions.mockReturnValue(of([
      { id: 1, fiscal_year: '1405', effective_from: '1405/01', version_title: 'نسخه فروردین', is_active: false },
      { id: 2, fiscal_year: '1405', effective_from: '1405/07', version_title: 'اصلاحیه نیمه دوم سال', is_active: true }
    ]));
    component.openCreateVersionModal();
    expect(component.showCreateVersionModal).toBe(true);

    component.newVersionEffectiveFrom = '1405/07';
    component.newVersionTitle = 'اصلاحیه نیمه دوم سال';
    component.submitCreateVersion();

    expect(mockPersonnelApi.createSettingsVersion).toHaveBeenCalledWith(expect.objectContaining({
      year: '1405',
      effective_from: '1405/07',
      version_title: 'اصلاحیه نیمه دوم سال'
    }));
    expect(component.showCreateVersionModal).toBe(false);
    expect(component.selectedVersionId).toBe(2);
  });

  it('should update selectedProjectId when switching project and reload versions', () => {
    component.ngOnInit();
    component.onProjectChange(1);
    expect(component.selectedProjectId).toBe(1);
    expect(mockPersonnelApi.getSettingsVersions).toHaveBeenCalledWith('1405', 1);
  });

  it('should auto-clone settings for project when saving if settings were inherited', () => {
    component.ngOnInit();
    component.selectedProjectId = 1;
    // yearlySettings has project: null (inherited from global)
    component.yearlySettings = {
      id: 1,
      fiscal_year: '1405',
      project: null,
      monthly_housing_allowance: 35000000
    } as any;

    expect(component.isCurrentSettingSpecificToProject).toBe(false);
    component.saveYearlySettings();

    expect(mockPersonnelApi.cloneSettingsForProject).toHaveBeenCalledWith(1, '1405');
    expect(mockPersonnelApi.updateYearlySettings).toHaveBeenCalledWith('1405', expect.objectContaining({
      id: 99,
      project: 1
    }));
  });

  it('should safely parse null and undefined query parameters without producing NaN', () => {
    mockRoute.queryParams = of({ project_id: 'null', version_id: 'undefined', year: '1407' });
    component.ngOnInit();
    expect(component.selectedProjectId).toBeNull();
    expect(component.selectedVersionId).not.toBeNaN();
    expect(component.fiscalYear).toBe('1407');
  });

  it('should load available fiscal years and allow switching via onYearChange', () => {
    mockPersonnelApi.getAvailableFiscalYears.mockReturnValue(of({ years: ['1405', '1406'] }));
    component.ngOnInit();
    expect(component.availableYears).toEqual(['1405', '1406']);

    component.onYearChange('1406');
    expect(component.fiscalYear).toBe('1406');
    expect(mockPersonnelApi.getSettingsVersions).toHaveBeenCalledWith('1406', null);
  });

  it('should open create year modal and submit new fiscal year with confirmation', () => {
    component.ngOnInit();
    component.openCreateYearModal();
    expect(component.showCreateYearModal).toBe(true);
    expect(component.newFiscalYear).toBe('1406');

    component.newFiscalYear = '1406';
    component.newYearSourceYear = '1405';
    component.submitCreateYear();

    expect(mockPersonnelApi.createFiscalYear).toHaveBeenCalledWith(expect.objectContaining({
      year: '1406',
      source_year: '1405'
    }));
    expect(component.showCreateYearModal).toBe(false);
    expect(component.fiscalYear).toBe('1406');
    expect(component.selectedVersionId).toBeTruthy();
  });

  it('should validate 4-digit format when creating a new fiscal year', () => {
    component.ngOnInit();
    component.openCreateYearModal();
    component.newFiscalYear = '14';
    component.submitCreateYear();
    expect(mockToast.show).toHaveBeenCalledWith('warning', expect.any(String));
    expect(mockPersonnelApi.createFiscalYear).not.toHaveBeenCalled();
  });

  it('should convert Rials to Toman properly', () => {
    expect(component.toToman(20000000)).toContain('۲٬۰۰۰٬۰۰۰');
    expect(component.toToman(0)).toBe('');
    expect(component.toToman(null)).toBe('');
  });

  it('should format Rials properly', () => {
    expect(component.formatRial(5000000)).toContain('۵٬۰۰۰٬۰۰۰');
    expect(component.formatRial(null)).toBe('۰ ریال');
  });

  it('should close modals on Escape key press', () => {
    component.showCreateVersionModal = true;
    component.showCreateYearModal = true;
    component.onEscape();
    expect(component.showCreateVersionModal).toBe(false);
    expect(component.showCreateYearModal).toBe(false);
  });

  it('should call revertToGlobal when confirmed for a project setting', () => {
    component.ngOnInit();
    component.selectedProjectId = 1;
    component.yearlySettings = {
      id: 99,
      project: 1,
      project_name: 'پروژه تست'
    } as any;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.revertToGlobal();
    expect(mockPersonnelApi.revertSettingsToGlobal).toHaveBeenCalledWith(99);
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.any(String));
  });
});
