// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';
import { CompanyWorkflowTabComponent } from './company-workflow-tab.component';
import { WorkflowApiService } from '../../../../../../core/api/workflow-api.service';
import { OrgStructureApiService } from '../../../../../../core/api/org-structure-api.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import {
  WorkflowCompanySettings,
  WorkflowThreshold,
  WorkflowDefinition
} from '../../../../../../core/models/workflow.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyWorkflowTabComponent', () => {
  let fixture: ComponentFixture<CompanyWorkflowTabComponent>;
  let component: CompanyWorkflowTabComponent;
  let mockWorkflowApi: any;
  let mockOrgApi: any;
  let mockConfirmDialog: any;
  let mockToast: any;

  const sampleSettings: WorkflowCompanySettings = {
    company_id: 1,
    reminder_hours: 24,
    escalation_hours: 48,
    creator_may_approve_own: false,
    is_default: false,
    updated_at: '2026-10-24T12:00:00Z'
  };

  const sampleDefinitions: WorkflowDefinition[] = [
    {
      key: 'expense_invoice',
      version: 1,
      entity_kind: 'expense_invoice',
      title_fa: 'فاکتور هزینه',
      has_amount: true,
      steps: [
        { key: 'step_supervisor', title_fa: 'تأیید سرپرست', kind: 'approve', role: 'supervisor', actions: ['act', 'return', 'reject'] },
        { key: 'step_accountant', title_fa: 'بررسی حسابدار', kind: 'review', role: 'accountant', actions: ['act', 'return'] },
        { key: 'step_manager', title_fa: 'تأیید مدیر مالی', kind: 'approve', role: 'manager', actions: ['act', 'reject'] }
      ]
    },
    {
      key: 'item_request',
      version: 1,
      entity_kind: 'item_request',
      title_fa: 'درخواست کالا',
      has_amount: false,
      steps: [
        { key: 'step_head', title_fa: 'تأیید رئیس', kind: 'approve', role: 'supervisor', actions: ['act'] }
      ]
    }
  ];

  const sampleThresholds: WorkflowThreshold[] = [
    {
      id: 1,
      workflow_key: 'expense_invoice',
      workflow_title_fa: 'فاکتور هزینه',
      step_key: 'step_supervisor',
      step_title_fa: 'تأیید سرپرست',
      company_id: 1,
      section: null,
      amount: '50000000',
      updated_by: { id: 10, name: 'مدیر مالی' },
      updated_at: '2026-10-24T10:00:00Z',
      updated_at_shamsi: '۱۴۰۵/۰۸/۰۲ ۱۰:۰۰'
    }
  ];

  const sampleSections = [
    { id: 101, name: 'بخش کارگاه مرکزی' },
    { id: 102, name: 'بخش انبار مرکزی' }
  ];

  beforeEach(async () => {
    mockWorkflowApi = {
      getCompanySettings: vi.fn().mockReturnValue(of(sampleSettings)),
      saveCompanySettings: vi.fn().mockReturnValue(of(sampleSettings)),
      getThresholds: vi.fn().mockReturnValue(of(sampleThresholds)),
      saveThreshold: vi.fn().mockReturnValue(of(sampleThresholds[0])),
      deleteThreshold: vi.fn().mockReturnValue(of(undefined)),
      getDefinitions: vi.fn().mockReturnValue(of(sampleDefinitions))
    };

    mockOrgApi = {
      getSections: vi.fn().mockReturnValue(of(sampleSections))
    };

    mockConfirmDialog = {
      open: vi.fn().mockResolvedValue(true)
    };

    mockToast = {
      show: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CompanyWorkflowTabComponent],
      providers: [
        { provide: WorkflowApiService, useValue: mockWorkflowApi },
        { provide: OrgStructureApiService, useValue: mockOrgApi },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: ToastService, useValue: mockToast }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyWorkflowTabComponent);
    component = fixture.componentInstance;
    component.companyId = 1;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('1. loads settings, definitions, sections and thresholds on init', () => {
    component.ngOnInit();

    expect(mockWorkflowApi.getCompanySettings).toHaveBeenCalledWith(1);
    expect(mockWorkflowApi.getThresholds).toHaveBeenCalledWith(1);
    expect(mockWorkflowApi.getDefinitions).toHaveBeenCalled();
    expect(mockOrgApi.getSections).toHaveBeenCalledWith(undefined, 1);

    expect(component.settings).toEqual(sampleSettings);
    expect(component.reminderHours).toBe(24);
    expect(component.escalationHours).toBe(48);
    expect(component.thresholds).toEqual(sampleThresholds);
    expect(component.sections.length).toBe(2);
    expect(component.loading).toBe(false);
  });

  it('2. filters definitions to only has_amount workflows and approve steps', () => {
    component.ngOnInit();

    expect(component.amountWorkflows.length).toBe(1);
    expect(component.amountWorkflows[0].key).toBe('expense_invoice');

    component.selectedWorkflowKey = 'expense_invoice';
    const steps = component.availableSteps;
    expect(steps.length).toBe(2);
    expect(steps.map((s) => s.key)).toEqual(['step_supervisor', 'step_manager']);
  });

  it('3. validates reminder and escalation hours rules (1 <= reminder < escalation <= 720)', () => {
    // Both zero/negative
    component.reminderHours = 0;
    component.escalationHours = 0;
    expect(component.validateSettings()).toBe(false);
    expect(component.settingsErrors.reminder).toBe('ساعت یادآوری باید بین ۱ تا ۷۲۰ باشد.');
    expect(component.settingsErrors.escalation).toBe('ساعت خبر به بالاتر باید بین ۱ تا ۷۲۰ باشد.');

    // Reminder >= escalation
    component.reminderHours = 50;
    component.escalationHours = 30;
    expect(component.validateSettings()).toBe(false);
    expect(component.settingsErrors.escalation).toContain('باید بیشتر از ساعت یادآوری باشد');

    // Valid range
    component.reminderHours = 24;
    component.escalationHours = 72;
    expect(component.validateSettings()).toBe(true);
    expect(component.settingsErrors.reminder).toBeUndefined();
    expect(component.settingsErrors.escalation).toBeUndefined();
  });

  it('4. saves company settings successfully when valid', () => {
    component.reminderHours = 12;
    component.escalationHours = 48;

    component.saveCompanySettings();

    expect(mockWorkflowApi.saveCompanySettings).toHaveBeenCalledWith(1, {
      reminder_hours: 12,
      escalation_hours: 48,
      creator_may_approve_own: false
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('ذخیره شد'));
  });

  it('5. validates and saves threshold replacing existing one', () => {
    component.ngOnInit();
    component.selectedWorkflowKey = 'expense_invoice';
    component.selectedStepKey = 'step_supervisor';
    component.selectedSectionId = 101;
    component.thresholdAmount = '۳۵,۰۰۰,۰۰۰';

    component.saveThreshold();

    expect(mockWorkflowApi.saveThreshold).toHaveBeenCalledWith({
      company: 1,
      section: 101,
      workflow_key: 'expense_invoice',
      step_key: 'step_supervisor',
      amount: 35000000
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', 'سقف مبلغ با موفقیت ثبت شد.');
    expect(component.selectedWorkflowKey).toBe('');
  });

  it('6. deletes threshold after confirmation dialog approval', async () => {
    component.ngOnInit();
    const th = sampleThresholds[0];

    await component.deleteThreshold(th);

    expect(mockConfirmDialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'danger',
        confirmText: 'حذف'
      })
    );
    expect(mockWorkflowApi.deleteThreshold).toHaveBeenCalledWith(th.id);
    expect(mockToast.show).toHaveBeenCalledWith('success', 'سقف مبلغ حذف شد.');
  });

  it('7. displays 403 message and sets is403 flag when user lacks permission', () => {
    mockWorkflowApi.getCompanySettings.mockReturnValue(
      throwError(() => ({
        status: 403,
        error: { detail: 'اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید' }
      }))
    );

    component.ngOnInit();

    expect(component.is403).toBe(true);
    expect(component.forbiddenMessage).toBe('اجازهٔ ویرایش تنظیمات گردش کار این شرکت را ندارید');
  });

  it('loads creator_may_approve_own into the checkbox', async () => {
    mockWorkflowApi.getCompanySettings.mockReturnValue(
      of({ ...sampleSettings, creator_may_approve_own: true })
    );
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const checkbox = fixture.nativeElement.querySelector('#cwf-creator-self-approval') as HTMLInputElement;
    expect(component.creatorMayApproveOwn).toBe(true);
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(true);
  });

  it('save sends creator_may_approve_own', () => {
    component.reminderHours = 24;
    component.escalationHours = 48;
    component.creatorMayApproveOwn = true;

    component.saveCompanySettings();

    expect(mockWorkflowApi.saveCompanySettings).toHaveBeenCalledWith(1, {
      reminder_hours: 24,
      escalation_hours: 48,
      creator_may_approve_own: true
    });
    expect(mockToast.show).toHaveBeenCalledWith('success', 'تنظیمات گردش کار با موفقیت ذخیره شد.');
  });

  it('checkbox defaults to unchecked when the field is missing', async () => {
    mockWorkflowApi.getCompanySettings.mockReturnValue(
      of({
        company_id: 1,
        reminder_hours: 24,
        escalation_hours: 48,
        is_default: false,
        updated_at: null
      } as any)
    );
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const checkbox = fixture.nativeElement.querySelector('#cwf-creator-self-approval') as HTMLInputElement;
    expect(component.creatorMayApproveOwn).toBe(false);
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });
});
