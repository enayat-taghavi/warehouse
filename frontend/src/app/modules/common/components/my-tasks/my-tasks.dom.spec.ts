// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext, signal, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { MyTasksComponent } from './my-tasks';
import { WorkflowTasksService } from '../../../../core/services/workflow-tasks.service';
import { WorkflowApiService } from '../../../../core/api/workflow-api.service';
import { PermissionService } from '../../../../core/services/permission.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { WorkflowTaskCard } from '../../../../core/models/workflow.model';

describe('MyTasksComponent DOM Spec', () => {
  let component: MyTasksComponent;

  // Signals for fake WorkflowTasksService
  let tasksSignal: any;
  let countSignal: any;
  let isStaleSignal: any;
  let loadingSignal: any;
  let loadedSignal: any;
  let cachedAtSignal: any;
  let pendingSignal: any;
  let noticesSignal: any;
  let isEmptySignal: any;

  let mockTasksService: any;
  let mockApiService: any;
  let mockPermissionService: any;
  let mockRouter: any;
  let mockToast: any;
  let queryParamsSub: any;

  const sampleCard1: WorkflowTaskCard = {
    task_id: 101,
    instance_id: 201,
    revision: 1,
    workflow_key: 'expense_invoice',
    workflow_title_fa: 'گردش فاکتور هزینه',
    entity_kind: 'expense_invoice',
    entity_id: 501,
    step_key: 'step_supervisor',
    step_title_fa: 'تأیید سرپرست',
    step_kind: 'approve',
    actions: ['act', 'return', 'reject'],
    summary: { title: 'خرید تجهیزات شبکه', item_count: 5 },
    route: '/app/accounting/finance/employee/invoices?invoice=501',
    company: { id: 1, name: 'شرکت اصلی' },
    section: { id: 10, name: 'بخش فناوری اطلاعات' },
    amount: '12500000',
    opened_at: '2026-10-24T08:00:00Z',
    opened_at_shamsi: '۱۴۰۵/۰۸/۰۲ ۰۸:۰۰',
    waiting_hours: 6,
    has_recipients: true,
    on_behalf_of: null,
    valid_from: null,
    valid_to: null,
    valid_from_shamsi: '',
    valid_to_shamsi: '',
    can_cancel: false
  };

  const sampleCardSubstitute: WorkflowTaskCard = {
    task_id: 102,
    instance_id: 202,
    revision: 1,
    workflow_key: 'expense_invoice',
    workflow_title_fa: 'گردش فاکتور هزینه',
    entity_kind: 'expense_invoice',
    entity_id: 502,
    step_key: 'step_supervisor',
    step_title_fa: 'تأیید سرپرست',
    step_kind: 'approve',
    actions: ['act', 'return'],
    summary: { title: 'لوازم مصرفی اداری' },
    route: '/app/accounting/finance/employee/invoices?invoice=502',
    company: { id: 1, name: 'شرکت اصلی' },
    section: { id: 10, name: 'بخش فناوری اطلاعات' },
    amount: '3400000',
    opened_at: '2026-10-22T08:00:00Z',
    opened_at_shamsi: '۱۴۰۵/۰۷/۳۰ ۰۸:۰۰',
    waiting_hours: 50,
    has_recipients: true,
    on_behalf_of: { id: 88, name: 'محسن کریمی' },
    valid_from: null,
    valid_to: null,
    valid_from_shamsi: '',
    valid_to_shamsi: '',
    can_cancel: false
  };

  const sampleReferralReferCard: WorkflowTaskCard = {
    ...sampleCard1,
    task_id: 103,
    track: 'referral',
    step_kind: 'refer',
    kind: 'refer',
    actions: ['done'],
    referred_by: { id: 9, name: 'مدیر دفتر' },
    instruction: 'لطفاً بررسی شود',
    due_at: '2026-10-31T10:00:00Z',
    due_at_shamsi: '1405/08/10 10:00',
    read_at: null
  };

  const sampleReferralInformCard: WorkflowTaskCard = {
    ...sampleCard1,
    task_id: 104,
    track: 'referral',
    step_kind: 'inform',
    kind: 'inform',
    actions: ['seen'],
    referred_by: { id: 9, name: 'مدیر دفتر' },
    instruction: 'لطفاً بررسی شود',
    due_at: '2026-10-31T10:00:00Z',
    due_at_shamsi: '1405/08/10 10:00',
    read_at: null
  };

  beforeEach(() => {
    tasksSignal = signal<WorkflowTaskCard[]>([sampleCard1]);
    countSignal = signal(1);
    isStaleSignal = signal(false);
    loadingSignal = signal(false);
    loadedSignal = signal(true);
    cachedAtSignal = signal<number | null>(Date.now());
    pendingSignal = signal<ReadonlySet<number>>(new Set());
    noticesSignal = signal([]);
    isEmptySignal = signal(false);

    mockTasksService = {
      tasks: tasksSignal,
      count: countSignal,
      isStale: isStaleSignal,
      loading: loadingSignal,
      loaded: loadedSignal,
      cachedAt: cachedAtSignal,
      pendingTaskIds: pendingSignal,
      notices: noticesSignal,
      isEmpty: isEmptySignal,
      start: vi.fn(),
      refresh: vi.fn().mockResolvedValue(true),
      act: vi.fn().mockResolvedValue({ status: 'done', state: { instance_id: 201 } }),
      markRead: vi.fn(),
      dismissNotice: vi.fn()
    };

    mockApiService = {
      getUnassignedTasks: vi.fn().mockReturnValue(
        of({
          count: 1,
          results: [{ ...sampleCard1, task_id: 999, actions: [] }],
          page: 1,
          page_size: 100
        })
      )
    };

    mockPermissionService = {
      isSuperuser: signal(false)
    };

    mockRouter = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn()
    };

    mockToast = {
      success: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn()
    };

    queryParamsSub = of({ tab: 'my-tasks' });

    const injector = Injector.create({
      providers: [
        { provide: WorkflowTasksService, useValue: mockTasksService },
        { provide: WorkflowApiService, useValue: mockApiService },
        { provide: PermissionService, useValue: mockPermissionService },
        { provide: ActivatedRoute, useValue: { queryParams: queryParamsSub } },
        { provide: Router, useValue: mockRouter },
        { provide: ToastService, useValue: mockToast },
        { provide: ChangeDetectorRef, useValue: { detectChanges: vi.fn(), markForCheck: vi.fn() } }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new MyTasksComponent();
    });
  });

  it('renders data state with card details (workflow, step, company, section, formatted amount)', () => {
    component.ngOnInit();

    expect(component.showLoading).toBe(false);
    expect(component.showEmpty).toBe(false);
    expect(component.filteredCards.length).toBe(1);

    const card = component.filteredCards[0];
    expect(card.workflow_title_fa).toBe('گردش فاکتور هزینه');
    expect(card.company?.name).toBe('شرکت اصلی');
    expect(card.section?.name).toBe('بخش فناوری اطلاعات');
    expect(component.formatCardAmount(card.amount)).toMatch(/۱۲[,٬]۵۰۰[,٬]۰۰۰ ریال/);
    expect(component.formatHours(card.waiting_hours)).toBe('۶ ساعت');
  });

  it('handles loading state (skeleton visible when loading and not loaded)', () => {
    loadingSignal.set(true);
    loadedSignal.set(false);

    expect(component.showLoading).toBe(true);
    expect(component.showEmpty).toBe(false);
  });

  it('handles empty state (when loaded and no tasks)', () => {
    tasksSignal.set([]);
    countSignal.set(0);
    loadedSignal.set(true);
    loadingSignal.set(false);

    expect(component.showLoading).toBe(false);
    expect(component.showEmpty).toBe(true);
  });

  it('shows stale/offline banner when isStale is true with cachedAt timestamp', () => {
    isStaleSignal.set(true);
    cachedAtSignal.set(new Date('2026-10-24T14:30:00Z').getTime());

    expect(component.workflowTasks.isStale()).toBe(true);
    expect(component.staleBannerText).toContain('نمایش از حافظهٔ دستگاه');
  });

  it('renders on_behalf_of substitute label when present', () => {
    tasksSignal.set([sampleCardSubstitute]);
    component.ngOnInit();

    const card = component.filteredCards[0];
    expect(card.on_behalf_of).toBeDefined();
    expect(card.on_behalf_of?.name).toBe('محسن کریمی');
    expect(component.formatHours(card.waiting_hours)).toBe('۲ روز');
  });

  it('identifies pending cards and disables them', () => {
    pendingSignal.set(new Set([101]));
    component.ngOnInit();

    const card = component.filteredCards[0];
    expect(component.isPending(card)).toBe(true);
  });

  it('superuser tab is visible only when user is superuser and loads unassigned tasks', () => {
    // Normal user: 1 tab only
    mockPermissionService.isSuperuser.set(false);
    expect(component.tabs.length).toBe(1);
    expect(component.tabs[0].id).toBe('my-tasks');

    // Superuser: 2 tabs
    mockPermissionService.isSuperuser.set(true);
    expect(component.tabs.length).toBe(2);
    expect(component.tabs[1].id).toBe('unassigned');

    component.onTabChange('unassigned');
    expect(mockApiService.getUnassignedTasks).toHaveBeenCalled();
    expect(component.unassignedTasks.length).toBe(1);
    expect(component.unassignedTasks[0].task_id).toBe(999);
  });

  it('requires reason dialog before act is called with return or reject', async () => {
    component.ngOnInit();
    const card = component.filteredCards[0];

    // Clicking 'return' action opens reason dialog and does NOT call act immediately
    component.onActionClick(card, 'return');
    expect(component.reasonDialogOpen).toBe(true);
    expect(component.reasonDialogTitle).toContain('عودت برای اصلاح');
    expect(mockTasksService.act).not.toHaveBeenCalled();

    // Confirming with reason calls act
    component.onReasonConfirmed('فاکتور نیاز به اصلاح شرح دارد');
    expect(mockTasksService.act).toHaveBeenCalledWith(card, 'return', 'فاکتور نیاز به اصلاح شرح دارد');
  });

  it('calls act directly without dialog when clicking act action', async () => {
    component.ngOnInit();
    const card = component.filteredCards[0];

    component.onActionClick(card, 'act');
    expect(component.reasonDialogOpen).toBe(false);
    expect(mockTasksService.act).toHaveBeenCalledWith(card, 'act', undefined);
  });

  it('keeps filter and summary lists stable between change-detection passes (NG0103 regression)', () => {
    component.ngOnInit();
    const companies = component.availableCompanies;
    const workflows = component.availableWorkflows;
    expect(component.availableCompanies).toBe(companies);
    expect(component.availableWorkflows).toBe(workflows);

    const summary = component.filteredCards[0].summary;
    const entries = component.getSummaryEntries(summary);
    expect(component.getSummaryEntries(summary)).toBe(entries);
    expect(entries).toEqual([{ key: 'item_count', label: 'تعداد اقلام', value: '۵' }]);
    expect(component.getSummaryTitle(summary)).toBe('خرید تجهیزات شبکه');

    tasksSignal.set([...tasksSignal()]);
    expect(component.availableCompanies).not.toBe(companies);
  });

  it('computes showOffline accurately based on loaded, loading, isStale and tasks length', () => {
    loadedSignal.set(false);
    loadingSignal.set(false);
    isStaleSignal.set(true);
    tasksSignal.set([]);

    expect(component.showOffline).toBe(true);

    tasksSignal.set([sampleCard1]);
    expect(component.showOffline).toBe(false);
  });

  it('identifies referral card tracks and returns appropriate kind labels', () => {
    expect(component.isReferral(sampleReferralReferCard)).toBe(true);
    expect(component.referralKindLabel(sampleReferralReferCard)).toBe('ارجاع');

    expect(component.isReferral(sampleReferralInformCard)).toBe(true);
    expect(component.referralKindLabel(sampleReferralInformCard)).toBe('برای اطلاع');

    expect(component.isReferral(sampleCard1)).toBe(false);
    expect(component.isUnread(sampleCard1)).toBe(false);
  });

  it('evaluates isUnread based on read_at presence on referral cards', () => {
    const unreadCard: WorkflowTaskCard = { ...sampleReferralReferCard, read_at: null };
    expect(component.isUnread(unreadCard)).toBe(true);

    const readCard: WorkflowTaskCard = { ...sampleReferralReferCard, read_at: '2026-10-25T12:00:00Z' };
    expect(component.isUnread(readCard)).toBe(false);
  });

  it('evaluates isOverdue accurately for past, future, and null due_at dates', () => {
    const pastCard: WorkflowTaskCard = {
      ...sampleReferralReferCard,
      due_at: new Date(Date.now() - 3600 * 1000).toISOString()
    };
    expect(component.isOverdue(pastCard)).toBe(true);

    const futureCard: WorkflowTaskCard = {
      ...sampleReferralReferCard,
      due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    };
    expect(component.isOverdue(futureCard)).toBe(false);

    const noDueCard: WorkflowTaskCard = {
      ...sampleReferralReferCard,
      due_at: null
    };
    expect(component.isOverdue(noDueCard)).toBe(false);
  });

  it('calls markRead on unread referral card when opened, and does not call it for read or step cards', () => {
    const unreadCard: WorkflowTaskCard = { ...sampleReferralReferCard, read_at: null };
    component.onCardOpened(unreadCard);
    expect(mockTasksService.markRead).toHaveBeenCalledTimes(1);
    expect(mockTasksService.markRead).toHaveBeenCalledWith(unreadCard);

    mockTasksService.markRead.mockClear();

    const readCard: WorkflowTaskCard = { ...sampleReferralReferCard, read_at: '2026-10-25T12:00:00Z' };
    component.onCardOpened(readCard);
    expect(mockTasksService.markRead).not.toHaveBeenCalled();

    const stepCard: WorkflowTaskCard = { ...sampleCard1 };
    component.onCardOpened(stepCard);
    expect(mockTasksService.markRead).not.toHaveBeenCalled();
  });

  it('calls act directly with seen action without opening reason dialog for inform card', () => {
    component.ngOnInit();
    component.onActionClick(sampleReferralInformCard, 'seen');

    expect(component.reasonDialogOpen).toBe(false);
    expect(mockTasksService.act).toHaveBeenCalledWith(sampleReferralInformCard, 'seen', undefined);
  });

  it('calls act with replyText on done action and cleans up replyText upon success', async () => {
    component.ngOnInit();
    const card = sampleReferralReferCard;
    component.replyText[card.task_id] = 'انجام شد';

    component.onActionClick(card, 'done');

    expect(mockTasksService.act).toHaveBeenCalledWith(card, 'done', 'انجام شد');
    await vi.waitFor(() => {
      expect(component.replyText[card.task_id]).toBeUndefined();
    });
  });

  it('returns appropriate Persian action labels for done and seen actions', () => {
    expect(component.getActionLabel('done', 'refer')).toBe('انجام شد');
    expect(component.getActionLabel('seen', 'inform')).toBe('رؤیت شد');
  });
});
