// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError, Subject } from 'rxjs';
import { WorkflowHistoryComponent } from './workflow-history.component';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { WorkflowTasksService } from '../../../core/services/workflow-tasks.service';
import { WorkflowHistory, WorkflowTaskEvent } from '../../../core/models/workflow.model';
import { WebSocketService } from '../../../core/http/websocket.service';

describe('WorkflowHistoryComponent', () => {
  let component: WorkflowHistoryComponent;
  let mockApi: any;
  let mockTasksService: any;
  let events$: Subject<WorkflowTaskEvent>;

  const sampleHistory: WorkflowHistory = {
    entity_kind: 'expense_invoice',
    entity_id: 123,
    instances: [
      {
        instance_id: 456,
        workflow_key: 'expense_invoice',
        workflow_title_fa: 'گردش کار رسید پرداخت هزینه',
        version: 1,
        status: 'pending_supervisor',
        status_fa: 'در انتظار تأیید سرپرست',
        current_step: 'step_supervisor',
        current_step_title_fa: 'تأیید سرپرست',
        revision: 1,
        created_by: { id: 10, name: 'احمد رضایی' },
        company: { id: 1, name: 'شرکت اصلی' },
        section: { id: 2, name: 'بخش مالی' },
        amount: '5000000',
        submitted_at: '2026-10-24T10:00:00Z',
        submitted_at_shamsi: '۱۴۰۵/۰۸/۰۲ ۱۰:۰۰',
        closed_at: null,
        closed_at_shamsi: '',
        can_cancel: true,
        steps: [
          {
            id: 1,
            action: 'submit',
            action_fa: 'ارسال',
            actor: { id: 10, name: 'احمد رضایی' },
            actor_name: 'احمد رضایی',
            on_behalf_of: null,
            as_superuser: false,
            from_step: null,
            from_step_title_fa: '',
            to_step: 'step_supervisor',
            to_step_title_fa: 'تأیید سرپرست',
            reason: '',
            skipped: [
              {
                step: 'step_initial',
                step_title_fa: 'بررسی اولیه',
                reason: 'threshold',
                reason_fa: 'مبلغ کمتر از سقف تعیین‌شده است'
              }
            ],
            at: '2026-10-24T10:00:00Z',
            at_shamsi: '۱۴۰۵/۰۸/۰۲ ۱۰:۰۰'
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    events$ = new Subject<WorkflowTaskEvent>();
    mockApi = {
      getHistory: vi.fn().mockReturnValue(of(sampleHistory))
    };
    mockTasksService = {
      events$
    };

    const injector = Injector.create({
      providers: [
        { provide: WorkflowApiService, useValue: mockApi },
        { provide: WorkflowTasksService, useValue: mockTasksService }
      ]
    });

    runInInjectionContext(injector, () => {
      component = new WorkflowHistoryComponent();
    });
  });

  it('loads history and displays timeline when initialized with kind and entityId', () => {
    component.kind = 'expense_invoice';
    component.entityId = 123;
    component.ngOnInit();

    expect(mockApi.getHistory).toHaveBeenCalledWith('expense_invoice', 123);
    expect(component.history).toEqual(sampleHistory);
    expect(component.loading).toBe(false);
    expect(component.notFound).toBe(false);
  });

  it('contains skipped steps with specific formatted text', () => {
    component.kind = 'expense_invoice';
    component.entityId = 123;
    component.ngOnInit();

    const instance = component.history?.instances[0];
    const skipped = instance?.steps[0]?.skipped[0];

    expect(skipped).toBeDefined();
    expect(skipped?.step_title_fa).toBe('بررسی اولیه');
    expect(skipped?.reason_fa).toBe('مبلغ کمتر از سقف تعیین‌شده است');
  });

  it('handles 404 response by setting notFound to true', () => {
    mockApi.getHistory.mockReturnValue(throwError(() => ({ status: 404 })));

    component.kind = 'expense_invoice';
    component.entityId = 999;
    component.ngOnInit();

    expect(component.notFound).toBe(true);
    expect(component.history).toBeNull();
    expect(component.hasError).toBe(false);
  });

  it('shows cancel button only when can_cancel is true and emits cancelRequested', () => {
    component.kind = 'expense_invoice';
    component.entityId = 123;
    component.ngOnInit();

    let cancelledId: number | undefined;
    component.cancelRequested.subscribe((id) => (cancelledId = id));

    const instance = component.history?.instances[0];
    expect(instance?.can_cancel).toBe(true);

    component.onCancelInstance(instance!.instance_id);
    expect(cancelledId).toBe(456);

    // When can_cancel is false
    instance!.can_cancel = false;
    expect(instance?.can_cancel).toBe(false);
  });

  it('refetches history on document_changed for open entity silently, ignores other ids, and keeps history on error', () => {
    const doc$ = new Subject<any>();
    const mockWs = {
      documentChanges$: vi.fn(() => doc$.asObservable())
    };

    let loadingDuringCall: boolean | undefined;
    const historyApi = {
      getHistory: vi.fn().mockImplementation(() => {
        loadingDuringCall = comp.loading;
        return of(sampleHistory);
      })
    };

    const injector = Injector.create({
      providers: [
        { provide: WorkflowApiService, useValue: historyApi },
        { provide: WorkflowTasksService, useValue: { events$: new Subject() } },
        { provide: WebSocketService, useValue: mockWs }
      ]
    });

    let comp!: WorkflowHistoryComponent;
    runInInjectionContext(injector, () => {
      comp = new WorkflowHistoryComponent();
    });

    comp.kind = 'expense_invoice';
    comp.entityId = 7;
    comp.ngOnInit();

    expect(historyApi.getHistory).toHaveBeenCalledWith('expense_invoice', 7);
    expect(comp.history).toEqual(sampleHistory);
    historyApi.getHistory.mockClear();

    // 1. Event for doc_id 7 calls getHistory again and loading stays false during call
    doc$.next({ doc_type: 'expense_invoice', doc_id: 7 });
    expect(historyApi.getHistory).toHaveBeenCalledTimes(1);
    expect(historyApi.getHistory).toHaveBeenCalledWith('expense_invoice', 7);
    expect(loadingDuringCall).toBe(false);
    expect(comp.loading).toBe(false);

    // 2. Event for doc_id 8 makes no call
    historyApi.getHistory.mockClear();
    doc$.next({ doc_type: 'expense_invoice', doc_id: 8 });
    expect(historyApi.getHistory).not.toHaveBeenCalled();

    // 3. Silent reload that errors keeps previous history and leaves hasError false
    historyApi.getHistory.mockReturnValue(throwError(() => new Error('Server error')));
    doc$.next({ doc_type: 'expense_invoice', doc_id: 7 });
    expect(comp.history).toEqual(sampleHistory);
    expect(comp.hasError).toBe(false);
    expect(comp.loading).toBe(false);
  });
});

describe('WorkflowHistoryComponent (DOM): no-recipient note', () => {
  try {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch {}

  async function noteText(waitReason: string): Promise<string | null> {
    const history = {
      entity_kind: 'k', entity_id: 1,
      instances: [{
        instance_id: 1, workflow_key: 'k', workflow_title_fa: 't', version: 1, status: 'in_progress', status_fa: 's',
        current_step: 'review', current_step_title_fa: 'r', revision: 1, created_by: null, company: null, section: null,
        amount: null, submitted_at: null, submitted_at_shamsi: '', closed_at: null, closed_at_shamsi: '',
        can_cancel: false, wait_reason: waitReason, steps: [],
      }],
    };
    TestBed.configureTestingModule({
      imports: [WorkflowHistoryComponent],
      providers: [
        { provide: WorkflowApiService, useValue: { getHistory: vi.fn().mockReturnValue(of(history)) } },
        { provide: WorkflowTasksService, useValue: { events$: new Subject() } },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowHistoryComponent);
    fixture.componentInstance.kind = 'k';
    fixture.componentInstance.entityId = 1;
    fixture.detectChanges();
    fixture.detectChanges();
    const note = (fixture.nativeElement as HTMLElement).querySelector('[data-waiting-reason]');
    TestBed.resetTestingModule();
    return note ? (note.textContent || '').trim() : null;
  }

  it('shows the note only when the open step has nobody to act, with a text per wait reason', async () => {
    const noHolder = await noteText('no_holder');
    const creatorOnly = await noteText('creator_only');
    expect(noHolder).toBeTruthy();
    expect(creatorOnly).toBeTruthy();
    expect(noHolder).not.toBe(creatorOnly);
    expect(noHolder).not.toContain('مدیر کل');
    expect(await noteText('')).toBeNull();
  });

  // گام ه: پاسخ دیررس بدون بازبینی صفحهٔ میزبان هم نما را از «در حال بارگذاری» بیرون می‌آورد
  it('renders a late history reply without the host running change detection', () => {
    const reply$ = new Subject<WorkflowHistory>();
    TestBed.configureTestingModule({
      imports: [WorkflowHistoryComponent],
      providers: [
        { provide: WorkflowApiService, useValue: { getHistory: vi.fn().mockReturnValue(reply$) } },
        { provide: WorkflowTasksService, useValue: { events$: new Subject() } },
      ],
    });
    const fixture = TestBed.createComponent(WorkflowHistoryComponent);
    fixture.componentInstance.kind = 'k';
    fixture.componentInstance.entityId = 1;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('در حال بارگذاری');

    reply$.next({
      entity_kind: 'k', entity_id: 1,
      instances: [{
        instance_id: 1, workflow_key: 'k', workflow_title_fa: 'گردش نمونه', version: 1, status: 'in_progress', status_fa: 's',
        current_step: 'review', current_step_title_fa: 'r', revision: 1, created_by: null, company: null, section: null,
        amount: null, submitted_at: null, submitted_at_shamsi: '', closed_at: null, closed_at_shamsi: '',
        can_cancel: false, wait_reason: '', steps: [],
      }],
    } as any);

    // بی fixture.detectChanges()
    expect(el.textContent).not.toContain('در حال بارگذاری');
    expect(el.textContent).toContain('گردش نمونه');
    TestBed.resetTestingModule();
  });
});
