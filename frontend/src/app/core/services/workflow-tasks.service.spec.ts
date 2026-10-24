// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import {
  WORKFLOW_TASKS_STORAGE_KEY,
  WORKFLOW_ACTION_ENTITY_TYPE,
  WorkflowTasksService,
  isWorkflowTaskAlreadyDone,
  workflowTaskIdFromUrl,
} from './workflow-tasks.service';
import { AuthService } from '../auth/auth.service';
import { WorkflowApiService } from '../api/workflow-api.service';
import { WebSocketService } from '../http/websocket.service';
import { OfflineSyncService } from './offline-sync.service';
import { WorkflowTaskCard } from '../models/workflow.model';
import { sendEntry } from './offline/offline-queue-runner';
import { warehouseOfflineDb, SyncQueueEntry } from './offline-db';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function createStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

const UID = 7;

function card(id: number, partial: Partial<WorkflowTaskCard> = {}): WorkflowTaskCard {
  return {
    task_id: id, instance_id: 100 + id, revision: 2, workflow_key: 'wf', workflow_title_fa: 'گردش',
    entity_kind: 'doc', entity_id: 500 + id, step_key: 's1', step_title_fa: 'تأیید', step_kind: 'approve',
    actions: ['act', 'return', 'reject'], summary: {}, route: `/x/${id}`, company: { id: 1, name: 'ش' },
    section: { id: 3, name: 'ب' }, amount: '10', opened_at: null, opened_at_shamsi: '', waiting_hours: 1,
    has_recipients: true, on_behalf_of: null, valid_from: null, valid_to: null, valid_from_shamsi: '',
    valid_to_shamsi: '', can_cancel: false, ...partial,
  };
}

function page(results: WorkflowTaskCard[]) {
  return { count: results.length, results, page: 1, page_size: 100 };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WorkflowTasksService', () => {
  let service: WorkflowTasksService;
  let user: ReturnType<typeof signal<any>>;
  let api: { getMyTasks: ReturnType<typeof vi.fn>; postTaskAction: ReturnType<typeof vi.fn> };
  let sync: any;
  let notifications$: Subject<any>;
  let mockLocal: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    mockLocal = createStorageMock();
    vi.stubGlobal('localStorage', mockLocal);
    user = signal<any>(null);
    api = {
      getMyTasks: vi.fn(() => throwError(() => ({ status: 0 }))),
      postTaskAction: vi.fn(),
    };
    sync = {
      enqueue: vi.fn(async (method: string, url: string, body: any, meta: any) => ({ id: 9, method, url, body, ...meta })),
      getQueueEntries: vi.fn(async () => []),
      rejected$: new Subject<any>(),
      syncOutcome$: new Subject<any>(),
    };
    notifications$ = new Subject<any>();
    TestBed.configureTestingModule({
      providers: [
        WorkflowTasksService,
        { provide: AuthService, useValue: { user } },
        { provide: WorkflowApiService, useValue: api },
        { provide: OfflineSyncService, useValue: sync },
        { provide: WebSocketService, useValue: { notifications$ } },
      ],
    });
    service = TestBed.inject(WorkflowTasksService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function login(): void {
    user.set({ id: UID });
    TestBed.tick();
  }

  function store(results: WorkflowTaskCard[]): void {
    mockLocal.setItem(WORKFLOW_TASKS_STORAGE_KEY(UID), JSON.stringify({ results, count: results.length, cachedAt: 1 }));
  }

  // ─── نگه‌داری آفلاین ───

  it('loads the stored list of the logged-in user as stale and keeps it when the server is unreachable', async () => {
    store([card(1)]);
    login();
    expect(service.tasks().map((t) => t.task_id)).toEqual([1]);
    expect(service.isStale()).toBe(true);
    service.start();
    await flush();
    expect(api.getMyTasks).toHaveBeenCalledWith({ page_size: 100 });
    expect(service.tasks().map((t) => t.task_id)).toEqual([1]);
    expect(service.isStale()).toBe(true);
    expect(mockLocal.getItem(WORKFLOW_TASKS_STORAGE_KEY(UID))).not.toBeNull();
  });

  it('keeps the stored list on a 5xx or 4xx refresh error', async () => {
    store([card(1)]);
    login();
    for (const status of [500, 403]) {
      api.getMyTasks.mockReturnValueOnce(throwError(() => ({ status })));
      expect(await service.refresh()).toBe(false);
      expect(service.tasks().length).toBe(1);
      expect(JSON.parse(mockLocal.getItem(WORKFLOW_TASKS_STORAGE_KEY(UID))!).results.length).toBe(1);
    }
  });

  it('replaces the stored list only with a fresh server answer', async () => {
    store([card(1)]);
    login();
    api.getMyTasks.mockReturnValue(of(page([card(2), card(3)])));
    expect(await service.refresh()).toBe(true);
    expect(service.tasks().map((t) => t.task_id)).toEqual([2, 3]);
    expect(service.count()).toBe(2);
    expect(service.isStale()).toBe(false);
    expect(JSON.parse(mockLocal.getItem(WORKFLOW_TASKS_STORAGE_KEY(UID))!).results.map((t: any) => t.task_id)).toEqual([2, 3]);
  });

  it('logout empties memory but never the stored list; another user sees only their own list', async () => {
    store([card(1)]);
    login();
    user.set(null);
    TestBed.tick();
    expect(service.tasks()).toEqual([]);
    expect(mockLocal.getItem(WORKFLOW_TASKS_STORAGE_KEY(UID))).not.toBeNull();
    user.set({ id: 8 });
    TestBed.tick();
    expect(service.tasks()).toEqual([]);
    expect(service.loaded()).toBe(false);
  });

  // ─── اقدام ───

  it('online 2xx: sends action with revision and reason, drops the card', async () => {
    store([card(1), card(2)]);
    login();
    api.postTaskAction.mockReturnValue(of({ instance_id: 101, status: 'in_progress' }));
    const out = await service.act(card(1), 'return', '  دلیل  ');
    expect(out.status).toBe('done');
    expect(api.postTaskAction).toHaveBeenCalledWith(1, { action: 'return', revision: 2, reason: 'دلیل' });
    expect(service.tasks().map((t) => t.task_id)).toEqual([2]);
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('return or reject without a reason is refused locally with reason_required', async () => {
    login();
    for (const action of ['return', 'reject'] as const) {
      const out = await service.act(card(1), action, '   ');
      expect(out).toMatchObject({ status: 'rejected', code: 'reason_required' });
    }
    expect(api.postTaskAction).not.toHaveBeenCalled();
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('an action the step does not offer is refused locally', async () => {
    login();
    const out = await service.act(card(1, { actions: ['act'] }), 'reject', 'x');
    expect(out).toMatchObject({ status: 'rejected', code: 'invalid_action' });
    expect(api.postTaskAction).not.toHaveBeenCalled();
  });

  for (const status of [0, 408, 429, 502, 503, 504, 530]) {
    it(`server unreachable or busy (${status}): action goes to the existing offline queue, card stays as pending`, async () => {
      store([card(1)]);
      login();
      api.postTaskAction.mockReturnValue(throwError(() => ({ status })));
      const out = await service.act(card(1), 'act');
      expect(out.status).toBe('queued');
      expect(sync.enqueue).toHaveBeenCalledTimes(1);
      const [method, url, body, meta] = sync.enqueue.mock.calls[0];
      expect(method).toBe('POST');
      expect(workflowTaskIdFromUrl(url)).toBe(1);
      expect(body).toEqual({ action: 'act', revision: 2 });
      expect(meta).toMatchObject({ userId: UID, entityType: WORKFLOW_ACTION_ENTITY_TYPE, entitySyncId: 'wf-task-1-r2' });
      expect(meta.appScope).toBeTruthy();
      expect(service.tasks().map((t) => t.task_id)).toEqual([1]);
      expect(service.pendingTaskIds().has(1)).toBe(true);
      // دوباره زدن، ردیف دوم در صف نمی‌سازد
      expect((await service.act(card(1), 'act')).status).toBe('queued');
      expect(sync.enqueue).toHaveBeenCalledTimes(1);
    });
  }

  it('browser offline: queues without trying the network', async () => {
    login();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const out = await service.act(card(4), 'reject', 'نادرست');
    expect(out.status).toBe('queued');
    expect(api.postTaskAction).not.toHaveBeenCalled();
    expect(sync.enqueue.mock.calls[0][2]).toEqual({ action: 'reject', revision: 2, reason: 'نادرست' });
  });

  it('queue write failure is reported, nothing marked pending', async () => {
    login();
    api.postTaskAction.mockReturnValue(throwError(() => ({ status: 0 })));
    sync.enqueue.mockRejectedValue(new Error('idb'));
    const out = await service.act(card(1), 'act');
    expect(out).toMatchObject({ status: 'rejected', code: 'queue_failed' });
    expect(service.pendingTaskIds().size).toBe(0);
  });

  it('direct 409 task_already_done: card removed, notice shown with the server message, nothing queued', async () => {
    store([card(1), card(2)]);
    login();
    api.postTaskAction.mockReturnValue(throwError(() => ({
      status: 409, error: { code: 'task_already_done', detail: 'این کار را نفر دیگری انجام داده است' },
    })));
    const out = await service.act(card(1), 'act');
    expect(out).toEqual({ status: 'already-done', message: 'این کار را نفر دیگری انجام داده است' });
    expect(service.tasks().map((t) => t.task_id)).toEqual([2]);
    expect(service.notices()[0]).toMatchObject({ task_id: 1, message: 'این کار را نفر دیگری انجام داده است' });
    expect(service.notices()[0].card?.task_id).toBe(1);
    expect(sync.enqueue).not.toHaveBeenCalled();
    service.dismissNotice(1);
    expect(service.notices()).toEqual([]);
  });

  it('direct 400/403: rejected with the server code for the field error, card kept', async () => {
    store([card(1)]);
    login();
    api.postTaskAction.mockReturnValue(throwError(() => ({ status: 400, error: { code: 'reason_required', detail: 'دلیل' } })));
    expect(await service.act(card(1), 'return', 'x')).toEqual(
      { status: 'rejected', httpStatus: 400, code: 'reason_required', message: 'دلیل' });
    api.postTaskAction.mockReturnValue(throwError(() => ({ status: 403, error: { code: 'not_recipient', detail: 'نه' } })));
    expect((await service.act(card(1), 'act')).status).toBe('rejected');
    expect(service.tasks().length).toBe(1);
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  // ─── صف و وب‌سوکت ───

  it('a queued action rejected with 409 by the queue becomes a notice and the card is removed', async () => {
    store([card(1)]);
    login();
    service.start();
    await flush();
    sync.rejected$.next({
      url: '/api/workflow/tasks/1/action/', statusCode: 409, userId: UID,
      serverResponse: { code: 'task_already_done', detail: 'این کار را نفر دیگری انجام داده است' },
      serverMessage: 'این کار را نفر دیگری انجام داده است',
    });
    await flush();
    expect(service.tasks()).toEqual([]);
    expect(service.notices()[0]).toMatchObject({ task_id: 1, message: 'این کار را نفر دیگری انجام داده است' });
  });

  it('queue rejections of other users or other urls are ignored', async () => {
    store([card(1)]);
    login();
    service.start();
    await flush();
    sync.rejected$.next({ url: '/api/workflow/tasks/1/action/', statusCode: 409, userId: 99, serverResponse: {} });
    sync.rejected$.next({ url: '/api/other/1/', statusCode: 409, userId: UID, serverResponse: {} });
    await flush();
    expect(service.tasks().length).toBe(1);
    expect(service.notices()).toEqual([]);
  });

  it('pending ids come from the own queue entries only', async () => {
    login();
    sync.getQueueEntries.mockResolvedValue([
      { url: '/api/workflow/tasks/5/action/', userId: UID },
      { url: '/api/workflow/tasks/6/action/', userId: 99 },
      { url: '/api/other/7/', userId: UID },
    ]);
    await service.refreshPending();
    expect([...service.pendingTaskIds()]).toEqual([5]);
  });

  it('a workflow_task socket event re-reads the list once (debounced) and is published', async () => {
    vi.useFakeTimers();
    login();
    service.start();
    api.getMyTasks.mockClear();
    api.getMyTasks.mockReturnValue(of(page([card(9)])));
    const seen: any[] = [];
    service.events$.subscribe((e) => seen.push(e));
    notifications$.next({ type: 'workflow_task', workflow_event: 'received', task_id: '9', company_id: 1 });
    notifications$.next({ type: 'workflow_task', workflow_event: 'removed', task_id: 8 });
    notifications$.next({ type: 'permissions_updated' });
    expect(seen.map((e) => e.task_id)).toEqual([9, 8]);
    await vi.advanceTimersByTimeAsync(500);
    expect(api.getMyTasks).toHaveBeenCalledTimes(1);
    expect(service.tasks().map((t) => t.task_id)).toEqual([9]);
  });

  it('isWorkflowTaskAlreadyDone: only workflow 409, never other conflicts', () => {
    expect(isWorkflowTaskAlreadyDone({ statusCode: 409, url: '/api/workflow/tasks/3/action/', serverResponse: {} })).toBe(true);
    expect(isWorkflowTaskAlreadyDone({ statusCode: 409, url: '/x/', serverResponse: { code: 'task_already_done' } })).toBe(true);
    expect(isWorkflowTaskAlreadyDone({ statusCode: 409, url: '/api/items/3/', serverResponse: { server_record: {} } })).toBe(false);
    expect(isWorkflowTaskAlreadyDone({ statusCode: 400, url: '/api/workflow/tasks/3/action/', serverResponse: {} })).toBe(false);
    expect(isWorkflowTaskAlreadyDone({ statusCode: 409, url: '/api/workflow/tasks/3/action/', serverResponse: { code: 'invalid_state' } })).toBe(false);
  });

  it('after a reload, an action already waiting in the queue is not queued twice', async () => {
    login();
    sync.getQueueEntries.mockResolvedValue([{ url: '/api/workflow/tasks/1/action/', userId: UID }]);
    api.postTaskAction.mockReturnValue(throwError(() => ({ status: 0 })));
    expect((await service.act(card(1), 'act')).status).toBe('queued');
    expect(sync.enqueue).not.toHaveBeenCalled();
  });
});

/** رفتار صف موجود برای ردیف اقدام کار (ت۱۳): 409 رد صریح است، 5xx و قطع اتصال ردیف را نگه می‌دارند */
describe('offline queue characterization for workflow task actions', () => {
  const entry = (): SyncQueueEntry => ({
    id: 301, url: '/api/workflow/tasks/1/action/', method: 'POST', body: { action: 'act', revision: 2 },
    appScope: 'warehouse', createdAt: Date.now(), status: 'pending', retryCount: 0, userId: UID,
    entityType: WORKFLOW_ACTION_ENTITY_TYPE,
  });
  let del: any;
  let errAdd: any;

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
    vi.spyOn(warehouseOfflineDb.syncQueue, 'update').mockResolvedValue(1);
    del = vi.spyOn(warehouseOfflineDb.syncQueue, 'delete').mockResolvedValue(undefined as any);
    errAdd = vi.spyOn(warehouseOfflineDb.syncErrors, 'add').mockResolvedValue(1 as any);
    vi.spyOn(warehouseOfflineDb.apiCache, 'delete').mockResolvedValue(undefined as any);
    vi.spyOn(warehouseOfflineDb.apiCache, 'filter').mockReturnValue({ primaryKeys: async () => [] } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('409 task_already_done: removed from the queue, kept in the error box with the Persian message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ code: 'task_already_done', detail: 'این کار را نفر دیگری انجام داده است' }),
    } as any);
    const onRejected = vi.fn(async () => {});
    const result = await sendEntry(entry(), warehouseOfflineDb, false, undefined, onRejected);
    expect(result).toBe('rejected');
    expect(del).toHaveBeenCalledWith(301);
    expect(errAdd).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 409, serverMessage: 'این کار را نفر دیگری انجام داده است',
    }));
    const rejected = (onRejected.mock.calls[0] as any[])[0];
    expect(isWorkflowTaskAlreadyDone(rejected)).toBe(true);
  });

  for (const status of [500, 503, 530]) {
    it(`${status}: the queue entry is never deleted`, async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status, json: async () => ({}) } as any);
      const result = await sendEntry(entry(), warehouseOfflineDb);
      expect(result).toBe('server-error');
      expect(del).not.toHaveBeenCalled();
    });
  }

  it('transport failure: the queue entry is never deleted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await sendEntry(entry(), warehouseOfflineDb);
    expect(result).toBe('transport-failed');
    expect(del).not.toHaveBeenCalled();
  });
});
