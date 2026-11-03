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
  WorkflowDefinition,
  WorkflowCompanyPolicies,
  WorkflowPolicyPreview
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

  const samplePolicies: WorkflowCompanyPolicies = {
    company_id: 1,
    role_defaults: { accountant: 'skip', treasurer: 'wait' },
    company_default: {
      roles: [
        { role: 'accountant', role_title_fa: 'حسابدار', value: 'skip', effective: 'skip', source: 'own' },
        { role: 'treasurer', role_title_fa: 'خزانه‌دار', value: null, effective: 'wait', source: 'default' }
      ],
      creator_may_approve_own: { value: null, effective: false, source: 'default' },
      notify: { mode: null, user_ids: null, effective_mode: 'role_assigners', effective_user_ids: [], source: 'default' }
    },
    workflows: [
      {
        key: 'expense_invoice',
        title_fa: 'فاکتور هزینه',
        has_own_row: true,
        roles: [
          { role: 'accountant', role_title_fa: 'حسابدار', value: 'wait', effective: 'wait', source: 'own' }
        ],
        creator_may_approve_own: { value: true, effective: true, source: 'own' },
        notify: { mode: 'users', user_ids: [7], effective_mode: 'users', effective_user_ids: [7], source: 'own' },
        steps: [
          { key: 'step_accountant', title_fa: 'بررسی حسابدار', kind: 'review', role: 'accountant', role_title_fa: 'حسابدار',
            payment: false, locked: null, effective: 'wait', source: 'own' }
        ]
      }
    ],
    notify_candidates: [{ id: 7, name: 'کاربر هفت' }]
  };

  const samplePreview: WorkflowPolicyPreview = {
    counts: { advance: 3, recipients_changed: 1, waiting: 0 },
    per_workflow: {},
    samples: [{ instance_id: 5, workflow_key: 'expense_invoice', title: 'فاکتور ۵', step_key: 'step_accountant', effect: 'advance' }],
    token: 'tok-1'
  };

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
      getDefinitions: vi.fn().mockReturnValue(of(sampleDefinitions)),
      getCompanyPolicies: vi.fn().mockReturnValue(of(samplePolicies)),
      previewCompanyPolicy: vi.fn().mockReturnValue(of(samplePreview)),
      saveCompanyPolicy: vi.fn().mockReturnValue(of(samplePolicies)),
      resetWorkflowPolicy: vi.fn().mockReturnValue(of(samplePolicies))
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
      escalation_hours: 48
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

  it('company settings save no longer sends creator_may_approve_own (moved to the policy card)', () => {
    component.reminderHours = 24;
    component.escalationHours = 48;
    component.saveCompanySettings();
    const body = mockWorkflowApi.saveCompanySettings.mock.calls[0][1];
    expect('creator_may_approve_own' in body).toBe(false);
  });

  // ─── «وقتی کسی برای مرحله نیست» (طرح نبودن نفر ۱۴۰۵-۰۸) ───

  it('loads policies and builds drafts from stored values (null = inherit)', () => {
    component.ngOnInit();
    expect(mockWorkflowApi.getCompanyPolicies).toHaveBeenCalledWith(1);
    expect(component.companyDraft?.roleActions).toEqual({ accountant: 'skip', treasurer: null });
    expect(component.companyDraft?.creatorMayApproveOwn).toBeNull();
    expect(component.workflowDrafts['expense_invoice'].notifyMode).toBe('users');
    expect(component.workflowDrafts['expense_invoice'].notifyUserIds).toEqual([7]);
  });

  it('valuesFromDraft drops inherited roles and clears user ids unless mode is users', () => {
    const values = component.valuesFromDraft({
      roleActions: { accountant: 'wait', treasurer: null },
      creatorMayApproveOwn: true,
      notifyMode: 'role_assigners',
      notifyUserIds: [7]
    });
    expect(values).toEqual({
      role_actions: { accountant: 'wait' },
      creator_may_approve_own: true,
      notify_mode: 'role_assigners',
      notify_user_ids: []
    });
  });

  it('save: preview first, confirm with counts, then PUT with the preview token', async () => {
    component.ngOnInit();
    component.setRoleAction('', 'treasurer', 'skip');
    await component.savePolicy('');

    expect(mockWorkflowApi.previewCompanyPolicy).toHaveBeenCalledWith(1, {
      workflow_key: '',
      values: expect.objectContaining({ role_actions: { accountant: 'skip', treasurer: 'skip' } })
    });
    const dialog = mockConfirmDialog.open.mock.calls[0][0];
    expect(dialog.message).toContain('۳ سند جلو می‌رود');
    expect(dialog.message).toContain('۱ سند گیرنده‌اش عوض می‌شود');
    expect(mockWorkflowApi.saveCompanyPolicy).toHaveBeenCalledWith(1, '', expect.any(Object), 'tok-1');
    expect(mockToast.show).toHaveBeenCalledWith('success', 'تنظیم ذخیره شد.');
    expect(component.savingPolicyKey).toBeNull();
  });

  it('cancel in the preview dialog writes nothing', async () => {
    component.ngOnInit();
    mockConfirmDialog.open.mockResolvedValue(false);
    await component.savePolicy('expense_invoice');
    expect(mockWorkflowApi.previewCompanyPolicy).toHaveBeenCalled();
    expect(mockWorkflowApi.saveCompanyPolicy).not.toHaveBeenCalled();
  });

  it('409 preview_stale shows the fresh counts and saves with the fresh token', async () => {
    component.ngOnInit();
    const fresh: WorkflowPolicyPreview = { ...samplePreview, counts: { advance: 5, recipients_changed: 0, waiting: 2 }, token: 'tok-2' };
    mockWorkflowApi.saveCompanyPolicy
      .mockReturnValueOnce(throwError(() => ({ status: 409, error: { code: 'preview_stale', preview: fresh } })))
      .mockReturnValueOnce(of(samplePolicies));
    await component.savePolicy('expense_invoice');

    expect(mockConfirmDialog.open).toHaveBeenCalledTimes(2);
    const second = mockConfirmDialog.open.mock.calls[1][0];
    expect(second.message).toContain('۵ سند جلو می‌رود');
    expect(second.message).toContain('۲ سند منتظر می‌ماند');
    expect(mockWorkflowApi.saveCompanyPolicy.mock.calls[1][3]).toBe('tok-2');
  });

  it('users mode without anyone selected is blocked before preview', async () => {
    component.ngOnInit();
    component.setNotifyMode('', 'users');
    await component.savePolicy('');
    expect(component.policyFormErrors['']).toContain('دست‌کم یک کاربر');
    expect(mockWorkflowApi.previewCompanyPolicy).not.toHaveBeenCalled();
  });

  it('reset: preview with reset flag, then DELETE with the token', async () => {
    component.ngOnInit();
    await component.resetWorkflowPolicy('expense_invoice');
    expect(mockWorkflowApi.previewCompanyPolicy).toHaveBeenCalledWith(1, { workflow_key: 'expense_invoice', reset: true });
    expect(mockWorkflowApi.resetWorkflowPolicy).toHaveBeenCalledWith(1, 'expense_invoice', 'tok-1');
  });

  it('save error keeps the draft and shows the server message', async () => {
    component.ngOnInit();
    mockWorkflowApi.saveCompanyPolicy.mockReturnValue(
      throwError(() => ({ status: 400, error: { code: 'notify_user_not_member', detail: 'گیرنده عضو نیست' } }))
    );
    component.setRoleAction('expense_invoice', 'accountant', 'skip');
    await component.savePolicy('expense_invoice');
    expect(component.policyFormErrors['expense_invoice']).toBe('گیرنده عضو نیست');
    expect(component.workflowDrafts['expense_invoice'].roleActions['accountant']).toBe('skip');
    expect(component.savingPolicyKey).toBeNull();
  });

  // ─── DOM specs (گام ه رابط کاربری) ───

  it('policy card renders company roles and workflow badges', async () => {
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    const policyCard = el.querySelector('[data-testid="policy-card"]');
    expect(policyCard).toBeTruthy();
    expect(policyCard?.textContent).toContain('وقتی کسی برای مرحله نیست');

    const companySec = el.querySelector('[data-testid="policy-company"]');
    expect(companySec).toBeTruthy();
    expect(companySec?.textContent).toContain('حسابدار');
    expect(companySec?.textContent).toContain('خزانه‌دار');

    const wfRow = el.querySelector('[data-testid="policy-wf-expense_invoice"]');
    expect(wfRow).toBeTruthy();
    expect(wfRow?.textContent).toContain('تنظیم جدا');
  });

  it('expanding a workflow shows its steps and the reset button', async () => {
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const wfRow = fixture.nativeElement.querySelector('[data-testid="policy-wf-expense_invoice"]');
    const toggleBtn: HTMLButtonElement | null = wfRow?.querySelector('button[aria-expanded]');
    expect(toggleBtn).toBeTruthy();
    toggleBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const text = wfRow?.textContent || '';
    expect(text).toContain('بررسی حسابدار');
    expect(text).toContain('برگشت به پیشفرض شرکت');
  });

  it('choosing «رد شود» updates the company draft', async () => {
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const treasurerSkipRadio: HTMLInputElement | null = fixture.nativeElement.querySelector(
      'input[name="company-role-treasurer"][value="skip"]'
    );
    expect(treasurerSkipRadio).toBeTruthy();
    treasurerSkipRadio!.checked = true;
    treasurerSkipRadio!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.companyDraft?.roleActions['treasurer']).toBe('skip');
  });

  it('users notify mode lists notify candidates', async () => {
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    component.toggleWorkflowPolicy('expense_invoice');
    fixture.detectChanges();
    await fixture.whenStable();

    const wfRow = fixture.nativeElement.querySelector('[data-testid="policy-wf-expense_invoice"]');
    expect(wfRow?.textContent).toContain('کاربر هفت');
    const user7Checkbox: HTMLInputElement | null = wfRow?.querySelector('input[type="checkbox"]');
    expect(user7Checkbox).toBeTruthy();
    expect(user7Checkbox?.checked).toBe(true);
  });

  it('locked step shows the lock reason', async () => {
    const lockedPolicies: WorkflowCompanyPolicies = JSON.parse(JSON.stringify(samplePolicies));
    lockedPolicies.workflows[0].steps[0].locked = 'wait';
    mockWorkflowApi.getCompanyPolicies.mockReturnValue(of(lockedPolicies));

    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    component.toggleWorkflowPolicy('expense_invoice');
    fixture.detectChanges();
    await fixture.whenStable();

    const reason = component.lockReason(lockedPolicies.workflows[0].steps[0]);
    const wfRow = fixture.nativeElement.querySelector('[data-testid="policy-wf-expense_invoice"]');
    expect(wfRow?.textContent).toContain(reason);

    const table = wfRow?.querySelector('table');
    expect(table?.querySelector('input[type="radio"]')).toBeNull();
  });

  it('save button calls savePolicy for the company level', async () => {
    component.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();

    const spy = vi.spyOn(component, 'savePolicy').mockResolvedValue(undefined as any);
    const companySec = fixture.nativeElement.querySelector('[data-testid="policy-company"]');
    const saveBtn: HTMLButtonElement | null = companySec?.querySelector('button[appAction="save"]');
    expect(saveBtn).toBeTruthy();
    saveBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(spy).toHaveBeenCalledWith('');
  });
});
