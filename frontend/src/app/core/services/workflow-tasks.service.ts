import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { WorkflowApiService } from '../api/workflow-api.service';
import { WebSocketService } from '../http/websocket.service';
import { AuthUserProfile } from '../models/api-response.model';
import {
  WORKFLOW_TASK_ALREADY_DONE,
  WorkflowActionOutcome,
  WorkflowTaskAction,
  WorkflowTaskCard,
  WorkflowTaskEvent,
  WorkflowTaskNotice,
  WorkflowTaskPage,
} from '../models/workflow.model';
import { OfflineSyncService } from './offline-sync.service';
import { SyncErrorEntry, getCurrentActiveAppScope } from './offline-db';
import { isServerUnreachable } from './server-reachability';

/** کلید نگه‌داری محلی هر کاربر؛ هرگز پاک نمی‌شود، فقط با پاسخ تازهٔ سرور جایگزین می‌شود */
export const WORKFLOW_TASKS_STORAGE_KEY = (userId: number) => `wh_workflow_tasks_u${userId}`;

/** نوع موجودیت ردیف صف آفلاین اقدام روی کار */
export const WORKFLOW_ACTION_ENTITY_TYPE = 'workflow_task_action';

/** سقف کارت‌های نگه‌داشته (MAX_PAGE_SIZE سرور)؛ شمارهٔ کل از `count` می‌آید */
const PAGE_SIZE = 100;
/** فاصلهٔ جمع کردن چند رویداد وب‌سوکت پشت سر هم در یک بار خواندن */
const WS_DEBOUNCE_MS = 400;
const ACTION_URL_RE = /\/workflow\/tasks\/(\d+)\/action\/?(?:\?.*)?$/;
const WS_EVENT_TYPE = 'workflow_task';

export const WORKFLOW_MESSAGES = {
  alreadyDone: 'این کار را نفر دیگری انجام داده است',
  reasonRequired: 'برای عودت یا رد، نوشتن دلیل الزامی است',
  notAllowed: 'این اقدام در این مرحله مجاز نیست',
  queueFailed: 'ذخیرهٔ اقدام در حافظهٔ دستگاه ممکن نشد؛ دوباره تلاش کنید',
} as const;

interface StoredTasks {
  results: WorkflowTaskCard[];
  count: number;
  cachedAt: number;
}

function readStored(userId: number): StoredTasks | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WORKFLOW_TASKS_STORAGE_KEY(userId)) : null;
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.results) && typeof v.count === 'number' ? (v as StoredTasks) : null;
  } catch {
    return null;
  }
}

function writeStored(userId: number, value: StoredTasks): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WORKFLOW_TASKS_STORAGE_KEY(userId), JSON.stringify(value));
    }
  } catch {
    // پر بودن حافظه: نسخهٔ قبلی می‌ماند
  }
}

/** شناسهٔ کار از آدرس اقدام (`…/workflow/tasks/<id>/action/`) یا null */
export function workflowTaskIdFromUrl(url: string | null | undefined): number | null {
  const m = url ? ACTION_URL_RE.exec(url) : null;
  return m ? Number(m[1]) : null;
}

/**
 * ردیف صندوق خطاها که 409 «نفر دیگری انجام داده» برای اقدام روی کار است (ت۱۳).
 * این رد صریح است، نه تداخل قابل ادغام: پنجرهٔ حل تداخل برایش باز نشود.
 */
export function isWorkflowTaskAlreadyDone(err: Pick<SyncErrorEntry, 'statusCode' | 'serverResponse' | 'url'>): boolean {
  if (err.statusCode !== 409) return false;
  const code = err.serverResponse?.code;
  // بدنهٔ بی‌کد (مثلاً پاسخ غیر JSON) روی آدرس اقدام کار هم همین معنا را دارد
  return code ? code === WORKFLOW_TASK_ALREADY_DONE : workflowTaskIdFromUrl(err.url) !== null;
}

/**
 * «کارهای من» (طرح ۲.۳ کار ۵، ت۱۳ و ت۱۹).
 *
 * - **نگه‌داری آفلاین برای هر کاربر:** آخرین فهرست در `localStorage` با کلید همان کاربر. هرگز پاک نمی‌شود (خروج،
 *   خطا یا تعویض کاربر هم آن را دست نمی‌زند) و فقط با پاسخ موفق سرور جایگزین می‌شود. اگر داده تأییدِ سرور در همین
 *   نشست را ندارد یا آخرین تلاش به سرور نرسید، `isStale` روشن است.
 * - **اقدام از راه صف آفلاین موجود:** اگر سرور در دسترس نباشد (`isServerUnreachable`) یا مرورگر آفلاین باشد، اقدام با
 *   `OfflineSyncService.enqueue` در صف می‌ماند؛ صف آن را فقط با پاسخ 2xx یا 4xx برمی‌دارد و 5xx را دوباره می‌فرستد.
 * - **409 (ت۱۳):** چه مستقیم چه از صف، کار از فهرست برداشته می‌شود و در `notices` با پیام
 *   «این کار را نفر دیگری انجام داده است» می‌ماند تا کاربر ببیند؛ ردیف صندوق خطاهای صف هم با همین پیام می‌ماند.
 * - **وب‌سوکت:** هر رویداد `workflow_task` فهرست و شمارنده را دوباره می‌خواند و در `events$` منتشر می‌شود.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowTasksService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(WorkflowApiService);
  private readonly sync = inject(OfflineSyncService);
  private readonly injector = inject(Injector);

  private readonly _tasks = signal<WorkflowTaskCard[]>([]);
  private readonly _count = signal(0);
  private readonly _cachedAt = signal<number | null>(null);
  private readonly _isStale = signal(false);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _pending = signal<ReadonlySet<number>>(new Set());
  private readonly _notices = signal<WorkflowTaskNotice[]>([]);

  /** کارهای باز کاربر (حداکثر ۱۰۰ کارت؛ شمارهٔ کل در `count`) */
  readonly tasks = this._tasks.asReadonly();
  /** شمارهٔ کارهای باز؛ برای شمارندهٔ منو */
  readonly count = this._count.asReadonly();
  /** زمان آخرین پاسخ موفق سرور (میلی‌ثانیه) یا null */
  readonly cachedAt = this._cachedAt.asReadonly();
  /** دادهٔ نمایش‌داده از حافظهٔ دستگاه است و تأیید تازهٔ سرور ندارد */
  readonly isStale = this._isStale.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** دست‌کم یک بار داده (از دستگاه یا سرور) در دست است */
  readonly loaded = this._loaded.asReadonly();
  /** شناسهٔ کارهایی که اقدامشان در صف آفلاین منتظر ارسال است */
  readonly pendingTaskIds = this._pending.asReadonly();
  /** کارهایی که نفر دیگری زودتر انجام داد یا اقدام صف رد شد */
  readonly notices = this._notices.asReadonly();
  readonly isEmpty = computed(() => this._loaded() && this._tasks().length === 0);

  /** رویدادهای وب‌سوکت کار (برای تازه کردن سابقه و صفحه‌های دیگر) */
  readonly events$ = new Subject<WorkflowTaskEvent>();

  private userId: number | null = null;
  private started = false;
  private subs: Subscription[] = [];
  private onlineListener: (() => void) | null = null;
  private wsTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private refreshAgain = false;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.syncFromAuth(user));
    });
  }

  /** راه‌اندازی یک‌باره پس از ورود: گوش دادن به وب‌سوکت، صف و برگشت شبکه، و یک بار خواندن */
  start(): void {
    if (!this.started) {
      this.started = true;
      const ws = this.injector.get(WebSocketService, null);
      if (ws) this.subs.push(ws.notifications$.subscribe((msg) => this.handleSocketMessage(msg)));
      this.subs.push(this.sync.rejected$.subscribe((err) => { void this.handleQueueRejected(err); }));
      this.subs.push(this.sync.syncOutcome$.subscribe((o) => {
        void this.refreshPending();
        if ('synced' in o && o.synced > 0) void this.refresh();
      }));
      if (typeof window !== 'undefined') {
        this.onlineListener = () => { void this.refresh(); };
        window.addEventListener('online', this.onlineListener);
      }
    }
    void this.refreshPending();
    void this.refresh();
  }

  /** خواندن فهرست از سرور؛ true اگر پاسخ تازه رسید. خطا هرگز دادهٔ نگه‌داشته را پاک نمی‌کند */
  refresh(): Promise<boolean> {
    if (!this.userId) return Promise.resolve(false);
    if (this.inFlight) {
      this.refreshAgain = true;
      return this.inFlight;
    }
    const uid = this.userId;
    this._loading.set(true);
    this.inFlight = (async () => {
      try {
        const page = await firstValueFrom(this.api.getMyTasks({ page_size: PAGE_SIZE }));
        if (uid !== this.userId || !isTaskPage(page)) return false;
        const stored: StoredTasks = { results: page.results, count: page.count, cachedAt: Date.now() };
        writeStored(uid, stored);
        this.apply(stored, false);
        return true;
      } catch {
        // سرور در دسترس نیست یا خطا داد: نسخهٔ دستگاه می‌ماند و فقط کهنه علامت می‌خورد
        if (uid === this.userId) this._isStale.set(true);
        return false;
      }
    })().finally(() => {
      this.inFlight = null;
      this._loading.set(false);
      if (this.refreshAgain) {
        this.refreshAgain = false;
        void this.refresh();
      }
    });
    return this.inFlight;
  }

  /**
   * اقدام روی یک کار. عودت و رد بی‌دلیل همین‌جا رد می‌شوند (کد `reason_required` برای خطای کنار فیلد).
   * اگر سرور در دسترس نباشد اقدام در صف می‌ماند و کارت با `pendingTaskIds` «در انتظار ارسال» نشان داده می‌شود.
   */
  async act(task: WorkflowTaskCard, action: WorkflowTaskAction, reason = ''): Promise<WorkflowActionOutcome> {
    const text = (reason || '').trim();
    if (!task.actions.includes(action)) {
      return { status: 'rejected', httpStatus: 0, code: 'invalid_action', message: WORKFLOW_MESSAGES.notAllowed };
    }
    if ((action === 'return' || action === 'reject') && !text) {
      return { status: 'rejected', httpStatus: 0, code: 'reason_required', message: WORKFLOW_MESSAGES.reasonRequired };
    }
    if (this._pending().has(task.task_id)) return { status: 'queued' };

    const body: { action: WorkflowTaskAction; revision: number; reason?: string } = { action, revision: task.revision };
    if (text) body.reason = text;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return this.enqueue(task, body);
    }
    try {
      const state = await firstValueFrom(this.api.postTaskAction(task.task_id, body));
      this.dropTask(task.task_id);
      void this.refresh();
      return { status: 'done', state };
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 0;
      if (isServerUnreachable(status)) return this.enqueue(task, body);
      const errBody = err?.error && typeof err.error === 'object' ? err.error : {};
      if (status === 409) {
        const message = errBody.code === WORKFLOW_TASK_ALREADY_DONE && errBody.detail
          ? String(errBody.detail) : WORKFLOW_MESSAGES.alreadyDone;
        this.addNotice(task.task_id, message);
        this.dropTask(task.task_id);
        void this.refresh();
        return { status: 'already-done', message };
      }
      return {
        status: 'rejected',
        httpStatus: status,
        code: String(errBody.code || 'error'),
        message: String(errBody.detail || `خطای ${status}`),
      };
    }
  }

  dismissNotice(taskId: number): void {
    this._notices.update((list) => list.filter((n) => n.task_id !== taskId));
  }

  // ────────── داخلی ──────────

  /** تعویض کاربر: نسخهٔ نگه‌داشتهٔ همان کاربر بار می‌شود؛ خروج فقط حالت حافظه را خالی می‌کند */
  syncFromAuth(user: AuthUserProfile | null): void {
    const uid = typeof user?.id === 'number' ? user.id : null;
    if (uid === this.userId) return;
    this.userId = uid;
    this._notices.set([]);
    this._pending.set(new Set());
    if (!uid) {
      this._tasks.set([]);
      this._count.set(0);
      this._cachedAt.set(null);
      this._isStale.set(false);
      this._loaded.set(false);
      return;
    }
    const stored = readStored(uid);
    if (stored) {
      this.apply(stored, true);
    } else {
      this._tasks.set([]);
      this._count.set(0);
      this._cachedAt.set(null);
      this._isStale.set(true);
      this._loaded.set(false);
    }
    if (this.started) {
      void this.refreshPending();
      void this.refresh();
    }
  }

  private apply(stored: StoredTasks, stale: boolean): void {
    this._tasks.set(stored.results);
    this._count.set(stored.count);
    this._cachedAt.set(stored.cachedAt);
    this._isStale.set(stale);
    this._loaded.set(true);
  }

  /** برداشتن کارت از فهرست جاری (و نسخهٔ دستگاه تا پاسخ بعدی سرور) */
  private dropTask(taskId: number): void {
    const before = this._tasks();
    if (!before.some((t) => t.task_id === taskId)) return;
    const results = before.filter((t) => t.task_id !== taskId);
    const count = Math.max(0, this._count() - 1);
    this._tasks.set(results);
    this._count.set(count);
    if (this.userId) writeStored(this.userId, { results, count, cachedAt: this._cachedAt() ?? Date.now() });
  }

  private addNotice(taskId: number, message: string): void {
    const card = this._tasks().find((t) => t.task_id === taskId) ?? null;
    this._notices.update((list) => [
      { task_id: taskId, card: card ?? list.find((n) => n.task_id === taskId)?.card ?? null, message, at: Date.now() },
      ...list.filter((n) => n.task_id !== taskId),
    ]);
  }

  private async enqueue(
    task: WorkflowTaskCard,
    body: { action: WorkflowTaskAction; revision: number; reason?: string },
  ): Promise<WorkflowActionOutcome> {
    // پس از بارگذاری دوباره یا تعویض کاربر، مجموعهٔ حافظه هنوز از صف خوانده نشده است: ردیف دوم نسازیم
    await this.refreshPending();
    if (this._pending().has(task.task_id)) return { status: 'queued' };
    try {
      await this.sync.enqueue('POST', `${environment.apiUrl}/workflow/tasks/${task.task_id}/action/`, body, {
        userId: this.userId ?? undefined,
        entityType: WORKFLOW_ACTION_ENTITY_TYPE,
        entitySyncId: `wf-task-${task.task_id}-r${task.revision}`,
        appScope: getCurrentActiveAppScope(),
      });
    } catch {
      return { status: 'rejected', httpStatus: 0, code: 'queue_failed', message: WORKFLOW_MESSAGES.queueFailed };
    }
    this._pending.update((s) => new Set(s).add(task.task_id));
    return { status: 'queued' };
  }

  /** کارهای منتظر در صف (هر قلمرو) برای کاربر جاری */
  async refreshPending(): Promise<void> {
    const uid = this.userId;
    if (!uid) return;
    try {
      const entries = await this.sync.getQueueEntries('all');
      if (uid !== this.userId) return;
      const ids = new Set<number>();
      for (const e of entries) {
        if (e.userId != null && e.userId !== uid) continue;
        const id = workflowTaskIdFromUrl(e.url);
        if (id !== null) ids.add(id);
      }
      this._pending.set(ids);
    } catch {
      // خواندن صف ممکن نشد: وضعیت قبلی می‌ماند
    }
  }

  /** ردِ صریح سرور برای اقدامی که از صف رفته بود (ردیف صف را صف برداشته و در صندوق خطاها گذاشته است) */
  private async handleQueueRejected(err: SyncErrorEntry): Promise<void> {
    const taskId = workflowTaskIdFromUrl(err.url);
    if (taskId === null || (err.userId != null && err.userId !== this.userId)) return;
    const message = isWorkflowTaskAlreadyDone(err)
      ? (err.serverResponse?.detail ? String(err.serverResponse.detail) : WORKFLOW_MESSAGES.alreadyDone)
      : (err.serverMessage || `خطای ${err.statusCode}`);
    this.addNotice(taskId, message);
    if (isWorkflowTaskAlreadyDone(err)) this.dropTask(taskId);
    await this.refreshPending();
    void this.refresh();
  }

  private handleSocketMessage(msg: any): void {
    const type = msg?.type_str || msg?.notification_type || msg?.type || msg?.event;
    if (type !== WS_EVENT_TYPE || !this.userId) return;
    this.events$.next(toTaskEvent(msg));
    if (this.wsTimer) clearTimeout(this.wsTimer);
    this.wsTimer = setTimeout(() => {
      this.wsTimer = null;
      void this.refresh();
    }, WS_DEBOUNCE_MS);
  }
}

function isTaskPage(v: unknown): v is WorkflowTaskPage {
  const p = v as WorkflowTaskPage;
  return !!p && typeof p === 'object' && Array.isArray(p.results) && typeof p.count === 'number';
}

function num(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : Number(v);
}

function toTaskEvent(msg: any): WorkflowTaskEvent {
  return {
    workflow_event: String(msg.workflow_event ?? ''),
    message: String(msg.message ?? ''),
    task_id: num(msg.task_id),
    instance_id: num(msg.instance_id),
    workflow_key: msg.workflow_key ?? null,
    entity_kind: msg.entity_kind ?? null,
    entity_id: num(msg.entity_id),
    step_key: msg.step_key ?? null,
    company_id: num(msg.company_id),
    section_id: num(msg.section_id),
    actor_id: num(msg.actor_id),
    to_superusers: msg.to_superusers === true,
  };
}
