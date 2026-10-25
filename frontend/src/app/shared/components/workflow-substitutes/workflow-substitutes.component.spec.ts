// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';
import { WorkflowSubstitutesComponent } from './workflow-substitutes.component';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { ActiveCompanyService } from '../../../core/services/active-company.service';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.component';
import { ToastService } from '../toast/toast.component';
import { WorkflowSubstitute } from '../../../core/models/workflow.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('WorkflowSubstitutesComponent', () => {
  let component: WorkflowSubstitutesComponent;
  let mockWorkflowApi: any;
  let mockActiveCompany: any;
  let mockConfirmDialog: any;
  let mockToast: any;

  const sampleSubstitutes: WorkflowSubstitute[] = [
    {
      id: 1,
      principal: { id: 10, name: 'علی محمدی' },
      substitute: { id: 20, name: 'رضا کریمی' },
      company: { id: 1, name: 'شرکت پتروشیمی' },
      start_date: '2026-11-01',
      end_date: '2026-11-15',
      start_date_shamsi: '۱۴۰۵/۰۸/۱۱',
      end_date_shamsi: '۱۴۰۵/۰۸/۲۵',
      is_active: true,
      is_current: true,
      created_by: null,
      created_at: '2026-10-24T12:00:00Z',
      revoked_at: null,
      revoked_by: null,
      can_revoke: true
    },
    {
      id: 2,
      principal: { id: 10, name: 'علی محمدی' },
      substitute: { id: 30, name: 'سارا احمدی' },
      company: null,
      start_date: '2026-12-01',
      end_date: '2026-12-10',
      start_date_shamsi: '۱۴۰۵/۰۹/۱۱',
      end_date_shamsi: '۱۴۰۵/۰۹/۲۰',
      is_active: true,
      is_current: false,
      created_by: null,
      created_at: '2026-10-24T12:00:00Z',
      revoked_at: null,
      revoked_by: null,
      can_revoke: true
    }
  ];

  beforeEach(() => {
    mockWorkflowApi = {
      getSubstitutes: vi.fn().mockReturnValue(of(sampleSubstitutes)),
      createSubstitute: vi.fn().mockReturnValue(of({ id: 99 })),
      revokeSubstitute: vi.fn().mockReturnValue(of({ success: true })),
      getSubstituteCandidates: vi.fn().mockReturnValue(
        of([
          { id: 20, name: 'رضا کریمی' },
          { id: 30, name: 'سارا احمدی' }
        ])
      )
    };

    mockActiveCompany = {
      manageableCompanies: vi.fn().mockReturnValue([
        { id: 1, name: 'شرکت پتروشیمی' },
        { id: 2, name: 'شرکت تجارت' }
      ])
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockToast = {
      show: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [WorkflowSubstitutesComponent],
      providers: [
        { provide: WorkflowApiService, useValue: mockWorkflowApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: ToastService, useValue: mockToast }
      ]
    });

    const injector = Injector.create({
      providers: [
        { provide: WorkflowApiService, useValue: mockWorkflowApi },
        { provide: ActiveCompanyService, useValue: mockActiveCompany },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: ToastService, useValue: mockToast }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new WorkflowSubstitutesComponent();
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('1. loads substitutes and users on init', () => {
    component.ngOnInit();

    expect(mockWorkflowApi.getSubstitutes).toHaveBeenCalledWith(undefined);
    expect(component.substitutes).toEqual(sampleSubstitutes);
    expect(component.loading).toBe(false);
    expect(component.availableUsers.length).toBe(2);
    expect(component.availableUsers[0].name).toBe('رضا کریمی');
    expect(mockWorkflowApi.getSubstituteCandidates).toHaveBeenCalledWith(undefined, null);
  });

  it('2. displays empty state when substitute list is empty', () => {
    mockWorkflowApi.getSubstitutes.mockReturnValue(of([]));
    component.ngOnInit();

    expect(component.substitutes.length).toBe(0);
    expect(component.loading).toBe(false);
    expect(component.error).toBe('');
  });

  it('3. handles load error and allows retry', () => {
    mockWorkflowApi.getSubstitutes.mockReturnValue(
      throwError(() => ({ status: 500, error: { detail: 'خطای سرور' } }))
    );
    component.ngOnInit();

    expect(component.error).toBe('خطای سرور');
    expect(component.substitutes.length).toBe(0);

    // Retry
    mockWorkflowApi.getSubstitutes.mockReturnValue(of(sampleSubstitutes));
    component.loadSubstitutes();
    expect(component.error).toBe('');
    expect(component.substitutes).toEqual(sampleSubstitutes);
  });

  it('4. handles 403 error in manager mode with permission denied message', () => {
    component.principalId = 55;
    mockWorkflowApi.getSubstitutes.mockReturnValue(
      throwError(() => ({
        status: 403,
        error: { detail: 'اجازهٔ مدیریت جانشین‌های این کاربر را ندارید.' }
      }))
    );
    component.ngOnInit();

    expect(component.is403).toBe(true);
    expect(component.error).toBe('اجازهٔ مدیریت جانشین‌های این کاربر را ندارید.');
    expect(component.isManagerMode).toBe(true);
  });

  it('5. validates substitute selection and date ranges before submit', () => {
    component.substituteId = null;
    component.startControl.setValue('');
    component.endControl.setValue('');

    const isValid = component.validate();
    expect(isValid).toBe(false);
    expect(component.fieldErrors.substitute).toBe('انتخاب کاربر جانشین الزامی است.');
    expect(component.fieldErrors.dates).toBe('تعیین تاریخ شروع و تاریخ پایان الزامی است.');

    // End date before start date
    component.substituteId = 20;
    component.startControl.setValue('۱۴۰۵/۰۸/۲۰');
    component.endControl.setValue('۱۴۰۵/۰۸/۱۰');

    const isValidReversed = component.validate();
    expect(isValidReversed).toBe(false);
    expect(component.fieldErrors.dates).toBe('تاریخ پایان نباید پیش از تاریخ شروع باشد.');
  });

  it('6. creates substitute successfully and resets form', () => {
    component.principalId = 10;
    component.substituteId = 20;
    component.companyId = 1;
    component.startControl.setValue('۱۴۰۵/۰۸/۱۰');
    component.endControl.setValue('۱۴۰۵/۰۸/۲۰');

    component.onSubmit();

    expect(mockWorkflowApi.createSubstitute).toHaveBeenCalled();
    const callArg = mockWorkflowApi.createSubstitute.mock.calls[0][0];
    expect(callArg.substitute_id).toBe(20);
    expect(callArg.principal_id).toBe(10);
    expect(callArg.company_id).toBe(1);
    expect(callArg.start_date).toBeDefined();
    expect(callArg.end_date).toBeDefined();
    expect(mockToast.show).toHaveBeenCalledWith('success', 'جانشینی موقت با موفقیت ثبت شد.');
    expect(component.substituteId).toBeNull();
  });

  it('7. revokes substitute after confirmation dialog approval', async () => {
    const subToRevoke = sampleSubstitutes[0];
    await component.onRevoke(subToRevoke);

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'danger',
        confirmText: 'لغو جانشینی'
      })
    );
    expect(mockWorkflowApi.revokeSubstitute).toHaveBeenCalledWith(subToRevoke.id);
    expect(mockToast.show).toHaveBeenCalledWith('success', 'جانشینی موقت لغو شد.');
  });

  it('8. loadUsers() with an erroring getSubstituteCandidates sets usersLoadError and renders the alert with a retry button that calls loadUsers again', async () => {
    mockWorkflowApi.getSubstituteCandidates.mockReturnValue(
      throwError(() => new Error('Server error'))
    );
    const fixture = TestBed.createComponent(WorkflowSubstitutesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.usersLoadError).toBe('فهرست کاربران قابل انتخاب دریافت نشد');
    expect(comp.availableUsers.length).toBe(0);

    const alertEl = Array.from(fixture.nativeElement.querySelectorAll('[role="alert"]'))
      .find((el: any) => el.textContent.includes('فهرست کاربران قابل انتخاب دریافت نشد')) as HTMLElement;
    expect(alertEl).toBeTruthy();

    const retryBtn = alertEl.querySelector('button') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.textContent).toContain('تلاش دوباره');

    const loadUsersSpy = vi.spyOn(comp, 'loadUsers');
    retryBtn.click();
    expect(loadUsersSpy).toHaveBeenCalled();
    fixture.destroy();
  });

  it('9. with two substitutes the md:hidden card list renders two cards', async () => {
    const fixture = TestBed.createComponent(WorkflowSubstitutesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('[data-testid="substitute-card"]');
    expect(cards.length).toBe(2);
    fixture.destroy();
  });
});
