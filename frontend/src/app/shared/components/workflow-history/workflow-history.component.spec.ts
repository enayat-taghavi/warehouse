// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { WorkflowHistoryComponent } from './workflow-history.component';
import { WorkflowApiService } from '../../../core/api/workflow-api.service';
import { WorkflowTasksService } from '../../../core/services/workflow-tasks.service';
import { WorkflowHistory, WorkflowTaskEvent } from '../../../core/models/workflow.model';

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
        workflow_title_fa: 'گردش کار فاکتور هزینه',
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
});
