// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal, computed, WritableSignal, ɵresolveComponentResources, ɵɵdirectiveInject, ChangeDetectorRef } from '@angular/core';
import { of, BehaviorSubject, Subject } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import * as fs from 'fs';
import * as path from 'path';

import { EmployeePettyCashHubComponent } from './employee-petty-cash';
import { MyPettyAccount, MyPettyAccountsService } from './my-petty-accounts.service';
import { WorkflowTasksService } from '../../../../../../core/services/workflow-tasks.service';
import { WorkflowTaskCard } from '../../../../../../core/models/workflow.model';
import { WorkflowApiService } from '../../../../../../core/api/workflow-api.service';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ApiService } from '../../../../../../core/api/api.service';
import { FileOutputService } from '../../../../../../core/platform/file-output';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('EmployeePettyCashHubComponent — Approver Tab DOM Specs', () => {
  let fixture: ComponentFixture<EmployeePettyCashHubComponent>;
  let component: EmployeePettyCashHubComponent;

  let accountsSignal: WritableSignal<MyPettyAccount[]>;
  let queryParams$: BehaviorSubject<Record<string, string>>;

  let workflowTasksMock: {
    tasks: WritableSignal<WorkflowTaskCard[]>;
    loaded: WritableSignal<boolean>;
    loading: WritableSignal<boolean>;
    isStale: WritableSignal<boolean>;
    pendingTaskIds: WritableSignal<ReadonlySet<number>>;
    events$: Subject<any>;
    refresh: ReturnType<typeof vi.fn>;
    act: ReturnType<typeof vi.fn>;
  };

  let confirmDialogMock: { open: ReturnType<typeof vi.fn> };
  let toastMock: { show: ReturnType<typeof vi.fn> };
  let mockPersonnelApi: any;

  const task11: WorkflowTaskCard = {
    task_id: 11,
    instance_id: 110,
    revision: 1,
    workflow_key: 'petty_cash_charge',
    workflow_title_fa: 'درخواست شارژ',
    entity_kind: 'petty_cash_charge',
    entity_id: 5,
    step_key: 'supervisor_ok',
    step_title_fa: 'تأیید سرپرست',
    step_kind: 'approve',
    track: 'step',
    actions: ['act', 'return'],
    summary: { title: 'Charge A' },
    route: null,
    company: { id: 5, name: 'شرکت ۱' } as any,
    section: null,
    amount: '1000000',
    opened_at: '2026-11-01T08:00:00Z',
    opened_at_shamsi: '1405/08/10',
    waiting_hours: 2,
  } as unknown as WorkflowTaskCard;

  const task12: WorkflowTaskCard = {
    task_id: 12,
    instance_id: 120,
    revision: 1,
    workflow_key: 'petty_cash_statement',
    workflow_title_fa: 'صورت‌حساب تنخواه',
    entity_kind: 'petty_cash_statement',
    entity_id: 6,
    step_key: 'supervisor_ok',
    step_title_fa: 'تأیید سرپرست',
    step_kind: 'approve',
    track: 'step',
    actions: ['act', 'return'],
    summary: { title: 'Statement B' },
    route: null,
    company: { id: 5, name: 'شرکت ۱' } as any,
    section: null,
    amount: '2000000',
    opened_at: '2026-11-02T08:00:00Z',
    opened_at_shamsi: '1405/08/11',
    waiting_hours: 3,
  } as unknown as WorkflowTaskCard;

  const task13: WorkflowTaskCard = {
    task_id: 13,
    instance_id: 130,
    revision: 1,
    workflow_key: 'petty_cash_charge',
    workflow_title_fa: 'درخواست شارژ',
    entity_kind: 'petty_cash_charge',
    entity_id: 7,
    step_key: 'accountant_review',
    step_title_fa: 'بررسی حسابدار',
    step_kind: 'review',
    track: 'step',
    actions: ['act', 'return'],
    summary: { title: 'Charge C' },
    route: null,
    company: { id: 5, name: 'شرکت ۱' } as any,
    section: null,
    amount: '500000',
    opened_at: '2026-11-03T08:00:00Z',
    opened_at_shamsi: '1405/08/12',
    waiting_hours: 1,
  } as unknown as WorkflowTaskCard;

  const task14: WorkflowTaskCard = {
    task_id: 14,
    instance_id: 140,
    revision: 1,
    workflow_key: 'invoice',
    workflow_title_fa: 'فاکتور',
    entity_kind: 'invoice',
    entity_id: 8,
    step_key: 'supervisor_ok',
    step_title_fa: 'تأیید سرپرست',
    step_kind: 'approve',
    track: 'step',
    actions: ['act', 'return'],
    summary: { title: 'Invoice D' },
    route: null,
    company: { id: 5, name: 'شرکت ۱' } as any,
    section: null,
    amount: '3000000',
    opened_at: '2026-11-04T08:00:00Z',
    opened_at_shamsi: '1405/08/13',
    waiting_hours: 4,
  } as unknown as WorkflowTaskCard;

  beforeAll(async () => {
    Object.defineProperty(EmployeePettyCashHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || EmployeePettyCashHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(WebSocketService, 8)
        );
      },
      configurable: true,
      writable: true
    });

    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const candidates = [
        path.resolve(__dirname, filename),
        path.resolve(__dirname, '../../counterparties/counterparty-form', filename),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
      }
      return '';
    });
  });

  beforeEach(() => {
    accountsSignal = signal<MyPettyAccount[]>([]);
    queryParams$ = new BehaviorSubject<Record<string, string>>({});

    workflowTasksMock = {
      tasks: signal<WorkflowTaskCard[]>([]),
      loaded: signal<boolean>(false),
      loading: signal<boolean>(false),
      isStale: signal<boolean>(false),
      pendingTaskIds: signal<ReadonlySet<number>>(new Set<number>()),
      events$: new Subject<any>(),
      refresh: vi.fn().mockResolvedValue(true),
      act: vi.fn().mockResolvedValue({ status: 'done' }),
    };

    confirmDialogMock = {
      open: vi.fn().mockResolvedValue(true),
    };

    toastMock = {
      show: vi.fn(),
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([])),
      getProjectSections: vi.fn().mockReturnValue(of([])),
      getPettyCashBalance: vi.fn().mockReturnValue(of(null)),
      getPettyCashAccounts: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      getPettyCashStatements: vi.fn().mockReturnValue(of([])),
      getPettyCashStatement: vi.fn().mockReturnValue(of(null)),
      getFinancialProjects: vi.fn().mockReturnValue(of([])),
      getCounterparties: vi.fn().mockReturnValue(of([])),
      getExpenseHeads: vi.fn().mockReturnValue(of([])),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function createTestComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EmployeePettyCashHubComponent],
      providers: [
        { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 7, username: 'test_user' }),
            currentUser: () => ({ id: 7, username: 'test_user' }),
            userPermissions: () => [],
          },
        },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfirmDialogService, useValue: confirmDialogMock },
        {
          provide: MyPettyAccountsService,
          useValue: {
            accounts: computed(() => accountsSignal()),
            ownAccounts: computed(() => accountsSignal().filter(a => a.role !== 'approver')),
            approverAccounts: computed(() => accountsSignal().filter(a => a.role === 'approver')),
            hasAccess: computed(() => accountsSignal().length > 0),
            refresh: vi.fn(),
          },
        },
        { provide: WorkflowTasksService, useValue: workflowTasksMock },
        {
          provide: WorkflowApiService,
          useValue: { getHistory: vi.fn().mockReturnValue(of({ instances: [] })) },
        },
        {
          provide: ActiveCompanyService,
          useValue: {
            activeCompanyId: 5,
            availableCompanies: [{ id: 5, name: 'شرکت ۱' }],
            switchCompany: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParams$.asObservable(),
            snapshot: { queryParams: {} },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: WebSocketService, useValue: { documentChanges$: vi.fn().mockReturnValue(of()) } },
        {
          provide: ApiService,
          useValue: {
            get: vi.fn().mockReturnValue(of([])),
            post: vi.fn().mockReturnValue(of({})),
            delete: vi.fn().mockReturnValue(of({})),
          },
        },
        {
          provide: FileOutputService,
          useValue: {
            canShareFiles: () => false,
            shareFile: vi.fn(),
            saveBlob: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeePettyCashHubComponent);
    component = fixture.componentInstance;
  }

  function getViewTabButtons(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('app-command-center app-tab-bar button[role="tab"]'));
  }

  it('a) only custodian rows (role \'custodian\'): no tab with label «تأیید» is rendered and isApprover is false', async () => {
    accountsSignal.set([
      { id: 1, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'custodian' },
    ]);
    await createTestComponent();
    fixture.detectChanges();

    expect(component.isApprover).toBe(false);
    expect(component.visibleViewTabs.some(t => t.id === 'approvals')).toBe(false);

    const tabs = getViewTabButtons();
    const tabTexts = tabs.map(el => el.textContent || '');
    expect(tabTexts.some(text => text.includes('تأیید'))).toBe(false);
  });

  it('b) one custodian row and one approver row (role \'approver\', custodian_name \'Ali\', pending 2): a tab «تأیید» is rendered with count 2 before the cartable loads (loaded false), and after loaded true with tasks 11–14 the count is 2 (only tasks 11 and 12)', async () => {
    accountsSignal.set([
      { id: 1, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'custodian' },
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 2 },
    ]);
    workflowTasksMock.loaded.set(false);

    await createTestComponent();
    fixture.detectChanges();

    expect(component.isApprover).toBe(true);
    expect(component.approvalCount).toBe(2);

    let tabButtons = getViewTabButtons();
    let approvalTab = tabButtons.find(b => (b.textContent || '').includes('تأیید'));
    expect(approvalTab).toBeTruthy();
    expect(approvalTab!.textContent).toContain('2');

    // Cartable loads with tasks 11–14
    workflowTasksMock.tasks.set([task11, task12, task13, task14]);
    workflowTasksMock.loaded.set(true);
    fixture.detectChanges();

    expect(component.approvalTasks.map(t => t.task_id)).toEqual([11, 12]);
    expect(component.approvalCount).toBe(2);

    tabButtons = getViewTabButtons();
    approvalTab = tabButtons.find(b => (b.textContent || '').includes('تأیید'));
    expect(approvalTab).toBeTruthy();
    expect(approvalTab!.textContent).toContain('2');
  });

  it('c) approver-only user (only approver rows): after init the active view is \'approvals\' and the section #pettyApprovals is rendered; the custodian name Ali is shown in its header', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 2 },
    ]);

    await createTestComponent();
    fixture.detectChanges();

    expect(component.activeView).toBe('approvals');

    const section = fixture.nativeElement.querySelector('#pettyApprovals');
    expect(section).toBeTruthy();
    expect(section.textContent).toContain('Ali');
  });

  it('d) the same approver-only user opened with query param charge=5: the active view stays \'charges\' (deep link wins)', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 2 },
    ]);
    queryParams$.next({ charge: '5' });

    await createTestComponent();
    fixture.detectChanges();

    expect(component.activeView).toBe('charges');
    expect(fixture.nativeElement.querySelector('#pettyApprovals')).toBeNull();
  });

  it('e) in the approvals view, clicking the approve button of task 11 calls act with (task11, \'act\', \'\') after the confirm dialog resolves true', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 1 },
    ]);
    workflowTasksMock.tasks.set([task11, task12]);
    workflowTasksMock.loaded.set(true);

    await createTestComponent();
    fixture.detectChanges();

    expect(component.activeView).toBe('approvals');

    const items = fixture.nativeElement.querySelectorAll('#pettyApprovals ul > li');
    expect(items.length).toBe(2);

    const approveBtn = items[0].querySelector('button[appAction="approve"]') as HTMLButtonElement;
    expect(approveBtn).toBeTruthy();

    approveBtn.click();
    await fixture.whenStable();
    await Promise.resolve();

    expect(confirmDialogMock.open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'تأیید سند',
        confirmText: 'تأیید',
      })
    );
    expect(workflowTasksMock.act).toHaveBeenCalledWith(task11, 'act', '');
  });

  it('f) return flow: click the return button of task 12, click the confirm-return button with an empty reason: act is not called and the text «دلیل برگشت را بنویسید.» is shown; then type a reason into the textarea, confirm: act is called with (task12, \'return\', \'<your reason>\')', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 1 },
    ]);
    workflowTasksMock.tasks.set([task11, task12]);
    workflowTasksMock.loaded.set(true);

    await createTestComponent();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('#pettyApprovals ul > li');
    expect(items.length).toBe(2);

    // Click return on task 12 (second item)
    const returnBtn = items[1].querySelector('button[appAction="return"]') as HTMLButtonElement;
    expect(returnBtn).toBeTruthy();
    returnBtn.click();
    fixture.detectChanges();

    expect(component.returnTaskId).toBe(12);

    // Find the return box inside task 12
    const returnBox = items[1].querySelector('.bg-amber-50\\/60');
    expect(returnBox).toBeTruthy();

    // Inside the return box, find the confirm return button (with label "ثبت برگشت")
    const confirmReturnBtn = returnBox.querySelector('button[appAction="return"]') as HTMLButtonElement;
    expect(confirmReturnBtn).toBeTruthy();

    // Confirm with empty reason
    confirmReturnBtn.click();
    fixture.detectChanges();

    expect(workflowTasksMock.act).not.toHaveBeenCalled();
    expect(returnBox.textContent).toContain('دلیل برگشت را بنویسید.');

    // Type a reason into the textarea
    const textarea = returnBox.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = 'نقص در فاکتور پیوست شده';
    textarea.dispatchEvent(new Event('input'));
    component.returnReason = 'نقص در فاکتور پیوست شده';
    fixture.detectChanges();

    // Click confirm return again
    confirmReturnBtn.click();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    expect(workflowTasksMock.act).toHaveBeenCalledWith(task12, 'return', 'نقص در فاکتور پیوست شده');
  });

  it('g) cartable not available (loaded false, loading false): the text «فهرست سندها دریافت نشد.» and one [appAction="refresh"] button are inside #pettyApprovals; clicking that button calls refresh. With loaded true and no matching tasks the text «سندی منتظر تأیید شما نیست.» is shown instead', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 1 },
    ]);
    workflowTasksMock.loaded.set(false);
    workflowTasksMock.loading.set(false);

    await createTestComponent();
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('#pettyApprovals');
    expect(section).toBeTruthy();
    expect(section.textContent).toContain('فهرست سندها دریافت نشد.');

    const refreshBtn = section.querySelector('button[appAction="refresh"]') as HTMLButtonElement;
    expect(refreshBtn).toBeTruthy();

    refreshBtn.click();
    expect(workflowTasksMock.refresh).toHaveBeenCalled();

    // Now loaded true with no matching tasks
    workflowTasksMock.loaded.set(true);
    workflowTasksMock.tasks.set([]);
    fixture.detectChanges();

    expect(section.textContent).toContain('سندی منتظر تأیید شما نیست.');
    expect(section.textContent).not.toContain('فهرست سندها دریافت نشد.');
  });

  it('h) a user in the approvals view whose approver rows disappear (set the accounts signal to only custodian rows and run change detection): the active view becomes \'expenses\' and the «تأیید» tab is gone', async () => {
    accountsSignal.set([
      { id: 2, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'approver', custodian_name: 'Ali', pending: 1 },
    ]);

    await createTestComponent();
    fixture.detectChanges();

    expect(component.activeView).toBe('approvals');
    expect(component.visibleViewTabs.some(t => t.id === 'approvals')).toBe(true);

    // Approver rows disappear; only custodian rows remain
    accountsSignal.set([
      { id: 1, company: 5, company_name: 'شرکت ۱', is_active: true, is_closed: false, role: 'custodian' },
    ]);
    fixture.detectChanges();

    expect(component.activeView).toBe('expenses');
    expect(component.visibleViewTabs.some(t => t.id === 'approvals')).toBe(false);

    const tabs = getViewTabButtons();
    const tabTexts = tabs.map(el => el.textContent || '');
    expect(tabTexts.some(text => text.includes('تأیید'))).toBe(false);
  });
});
