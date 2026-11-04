import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../core/services/server-reachability';
import { SyncQueueEntry, resolveOfflineDbStrict } from '../../../core/services/offline-db';
import { getStoredCurrentUserId } from '../../../core/services/sync-pull.service';
import { QUEUE_LOCK_NAME } from '../../../core/services/offline/offline-sync.models';
import { LetterDetail, LetterWritePayload } from '../letters.models';
import { LETTERS_API, LettersApiService } from './letters-api.service';

/** قلمرو آفلاین ماژول (همان `offlineSync.scopeKind` مانیفست) */
export const LETTERS_SCOPE = 'letters';
/** نوع موجودیت ردیف صف پیش‌نویس نامه */
export const LETTER_DRAFT_ENTITY = 'letters_draft';
/** پسوند شناسهٔ ردیفی که شاید به سرور رسیده باشد (پاسخ گم شد)؛ چنین ردیفی هرگز درجا عوض نمی‌شود. */
const ATTEMPTED = '~attempted';

export interface DraftSaveRequest {
  /** شناسهٔ نامه روی سرور؛ null یعنی پیش‌نویس تازه (POST با client_temp_id) */
  letterId: number | null;
  payload: LetterWritePayload;
}

export type DraftSaveOutcome =
  | { kind: 'saved'; letter: LetterDetail }
  /** 200 با conflict: true — سرور متن را در نسخهٔ ناهمگام نگه داشت؛ متن فرم دست نمی‌خورد */
  | { kind: 'conflict'; letter: LetterDetail }
  /**
   * در صف آفلاین ماند؛ newTempId یعنی ردیف تازه با شناسهٔ موقت تازه ساخته شد (فرم باید آن را بردارد).
   * letterId/revision یعنی نامه پیش‌تر روی سرور ساخته شده بود (duplicate) و PATCH در صف رفت؛ فرم به حالت ویرایش می‌رود.
   */
  | { kind: 'queued'; merged: boolean; newTempId?: string; letterId?: number; revision?: number }
  /** 4xx صریح سرور؛ متن در فرم می‌ماند */
  | { kind: 'rejected'; status: number; message: string; fieldErrors: Record<string, string> }
  /** 404 روی ویرایش: نامه دیگر برای کاربر دیده نمی‌شود؛ متن در فرم می‌ماند (مسئلهٔ باز ل-ج) */
  | { kind: 'gone'; message: string }
  /** نامهٔ محرمانه و سری روی دستگاه ذخیره نمی‌شود (ن۱۱)؛ متن در فرم می‌ماند */
  | { kind: 'not-queueable'; message: string };

export interface LocalDraft {
  /** شناسهٔ ردیف صف یا صندوق خطا */
  id: number;
  state: 'pending' | 'failed';
  letterId: number | null;
  subject: string;
  body: LetterWritePayload;
  at: number;
  message?: string;
  statusCode?: number;
}

export function newClientTempId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // نسخهٔ ۴ ساده برای محیط بی randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function draftSyncId(req: DraftSaveRequest): string {
  return req.letterId ? `letter-${req.letterId}` : `new-${req.payload.client_temp_id || ''}`;
}

export function letterIdFromUrl(url: string): number | null {
  const m = /\/letters\/(\d+)\/?$/.exec((url || '').split('?')[0]);
  return m ? Number(m[1]) : null;
}

/** 4xx صریح (پاسخ قطعی سرور)؛ 401، 408 و 429 موقتی‌اند و متن را در صف نگه می‌داریم. */
function isExplicitRejection(status: number): boolean {
  return !isServerUnreachable(status) && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

export function serverErrorText(error: unknown): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  let message = '';
  if (typeof error === 'string') message = error;
  else if (error && typeof error === 'object') {
    for (const [key, value] of Object.entries(error as Record<string, unknown>)) {
      const text = Array.isArray(value) ? value.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')
        : typeof value === 'string' ? value : '';
      if (!text) continue;
      if (key === 'detail' || key === 'non_field_errors') message = text;
      else fieldErrors[key] = text;
    }
  }
  if (!message) message = Object.keys(fieldErrors).length ? 'چند بخش فرم نادرست است.' : 'سرور ذخیره را نپذیرفت.';
  return { message, fieldErrors };
}

/**
 * پیش‌نویس آفلاین نامه (ن۱۱) روی همان صف آفلاین هسته (`OfflineSyncService`)؛ صف دومی ساخته نمی‌شود.
 *
 * قاعدهٔ بی‌از‌دست‌رفتن داده:
 * - ردیف صف را فقط اجراکنندهٔ هسته برمی‌دارد: 2xx (پذیرش) یا 4xx (به صندوق خطا با همان متن). 5xx و قطعی = ماندن در صف.
 * - این سرویس هیچ ردیف صف، صندوق خطا یا کشی را پاک نمی‌کند.
 * - ذخیرهٔ دوباره در آفلاین کامل، متن ردیف «هنوز فرستاده‌نشده» را درجا تازه می‌کند (تراکنش Dexie، نه در حال ارسال).
 *   اگر ردیف شاید به سرور رسیده باشد یا اتصال نیمه‌برقرار است، ردیف تازه ساخته می‌شود (پیش‌نویس تازه با شناسهٔ موقت تازه،
 *   یا PATCH دوم که سرور اگر کهنه بود در نسخهٔ ناهمگام نگه می‌دارد).
 */
@Injectable({ providedIn: 'root' })
export class LettersOfflineService {
  private readonly api = inject(LettersApiService);
  private readonly sync = inject(OfflineSyncService);
  private readonly network = NetworkStatusService.getInstance();

  /** کاملاً آنلاین (مرورگر و سرور)؛ کنش‌های فقط-آنلاین با آن فعال می‌شوند. */
  readonly online = signal(this.network.isOnline);

  constructor() {
    this.network.state$.subscribe(state => this.online.set(state === 'online'));
  }

  async saveDraft(req: DraftSaveRequest): Promise<DraftSaveOutcome> {
    if (!this.network.isBrowserOnline) return this.queue(req, false);
    /** درخواست واقعی در حال ارسال؛ پس از duplicate همان PATCH روی نامهٔ موجود است، نه POST اولیه */
    let target = req;
    let duplicateOf: LetterDetail | null = null;
    try {
      let letter = await firstValueFrom(
        req.letterId ? this.api.update(req.letterId, req.payload) : this.api.create(req.payload));
      if (!req.letterId && letter.duplicate) {
        // همان client_temp_id پیش‌تر به سرور رسیده بود؛ سرور تکرار را بی‌اعمال برمی‌گرداند، پس متن تازه را با PATCH می‌فرستیم
        const { kind: _k, company: _c, client_temp_id: _t, ...rest } = req.payload;
        duplicateOf = letter;
        target = { letterId: letter.id, payload: { ...rest, revision: letter.revision } };
        letter = await firstValueFrom(this.api.update(letter.id, target.payload));
      }
      return letter.conflict ? { kind: 'conflict', letter } : { kind: 'saved', letter };
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 0;
      if (isExplicitRejection(status)) {
        const { message, fieldErrors } = serverErrorText(err?.error);
        if (status === 404 && target.letterId) {
          return { kind: 'gone', message: 'این نامه دیگر برای شما دیده نمی‌شود؛ متن در فرم مانده است.' };
        }
        return { kind: 'rejected', status, message, fieldErrors };
      }
      // قطعی سرور، 5xx، 401، 408 و 429: درخواست شاید رسیده باشد؛ متن در صف می‌ماند و ردیف درجا عوض نمی‌شود.
      // پس از duplicate، PATCH در صف می‌رود (POST تکراری در بازپخش بی‌اعمال می‌ماند و متن تازه گم می‌شد).
      const out = await this.queue(target, true);
      if (duplicateOf && out.kind === 'queued') {
        return { ...out, letterId: duplicateOf.id, revision: duplicateOf.revision };
      }
      return out;
    }
  }

  /** پیش‌نویس‌های در صف و ردشده (صندوق خطا) همین کاربر؛ فقط خواندن. */
  async localDrafts(): Promise<LocalDraft[]> {
    const out: LocalDraft[] = [];
    // مثل اجراکنندهٔ هسته: ردیف بی‌userId مال کاربر فعلی شمرده می‌شود؛ ردیف کاربر دیگر دیده نمی‌شود
    const currentUserId = getStoredCurrentUserId();
    const isMine = (e: { userId?: number }) => !e.userId || e.userId === currentUserId;
    try {
      const queued = await this.sync.getQueueEntries(LETTERS_SCOPE);
      for (const e of queued) {
        if (e.entityType !== LETTER_DRAFT_ENTITY || !e.id || !isMine(e)) continue;
        out.push({
          id: e.id, state: 'pending', letterId: letterIdFromUrl(e.url), subject: String(e.body?.subject || ''),
          body: e.body, at: e.createdAt, message: e.lastError,
        });
      }
      const errors = await this.sync.getErrors(LETTERS_SCOPE);
      for (const e of errors) {
        if (e.entityType !== LETTER_DRAFT_ENTITY || !e.id || !isMine(e)) continue;
        out.push({
          id: e.id, state: 'failed', letterId: letterIdFromUrl(e.url), subject: String(e.body?.subject || ''),
          body: e.body, at: e.failedAt, statusCode: e.statusCode,
          message: e.statusCode === 404 ? 'نامه دیگر برای شما دیده نمی‌شود.' : e.serverMessage,
        });
      }
    } catch (e) {
      console.warn('[Letters] خواندن پیش‌نویس‌های محلی ممکن نشد (چیزی پاک نشد):', e);
    }
    return out.sort((a, b) => b.at - a.at);
  }

  private async queue(req: DraftSaveRequest, attempted: boolean): Promise<DraftSaveOutcome> {
    if (req.payload.confidentiality !== 'normal') {
      return { kind: 'not-queueable', message: 'نامهٔ محرمانه و سری روی دستگاه ذخیره نمی‌شود؛ متن در فرم مانده است. پس از اتصال ذخیره کنید.' };
    }
    const baseId = draftSyncId(req);
    if (!attempted && (await this.mergeIntoQueued(baseId, req))) return { kind: 'queued', merged: true };

    let payload = req.payload;
    let newTempId: string | undefined;
    if (!req.letterId && (await this.hasQueued(baseId))) {
      // POST دوم با همان شناسهٔ موقت بی‌اعمال برمی‌گشت؛ پیش‌نویس تازه می‌سازیم تا متن گم نشود
      newTempId = newClientTempId();
      payload = { ...payload, client_temp_id: newTempId };
    }
    const syncId = draftSyncId({ letterId: req.letterId, payload }) + (attempted ? ATTEMPTED : '');
    const url = req.letterId ? `${LETTERS_API}/${req.letterId}/` : `${LETTERS_API}/`;
    await this.sync.enqueue(req.letterId ? 'PATCH' : 'POST', url, payload, {
      userId: getStoredCurrentUserId() ?? undefined,
      entityType: LETTER_DRAFT_ENTITY,
      entitySyncId: syncId,
      appScope: LETTERS_SCOPE,
    });
    return { kind: 'queued', merged: false, ...(newTempId ? { newTempId } : {}) };
  }

  private async rowsOf(baseId: string): Promise<SyncQueueEntry[]> {
    const db = resolveOfflineDbStrict(LETTERS_SCOPE);
    if (!db) return [];
    const rows = await db.syncQueue.toArray();
    return rows.filter(r => r.entitySyncId === baseId || r.entitySyncId === baseId + ATTEMPTED)
      .sort((a, b) => (a.id || 0) - (b.id || 0));
  }

  private async hasQueued(baseId: string): Promise<boolean> {
    return (await this.rowsOf(baseId)).length > 0;
  }

  /**
   * متن ردیف آخرِ همین پیش‌نویس را درجا تازه می‌کند، فقط وقتی مرورگر آفلاین است و صف در حال اجرا نیست
   * (اجراکننده در آفلاین به سرور نمی‌رسد، پس نسخهٔ کهنه نمی‌تواند پذیرفته و ردیف پاک شود).
   * قفل صف هسته (`QUEUE_LOCK_NAME`) میان زبانه‌هاست: اگر زبانهٔ دیگری صف را می‌فرستد یا Web Locks نیست،
   * درجا عوض نمی‌کنیم و ردیف تازه ساخته می‌شود (آن زبانه نسخهٔ کهنه را می‌فرستد و ردیف را برمی‌دارد).
   */
  private async mergeIntoQueued(baseId: string, req: DraftSaveRequest): Promise<boolean> {
    if (this.network.isBrowserOnline) return false;
    const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
    if (!locks || typeof locks.request !== 'function') return false;
    try {
      return await locks.request(QUEUE_LOCK_NAME, { ifAvailable: true },
        async (lock: unknown) => (lock ? this.mergeLocked(baseId, req) : false));
    } catch (e) {
      console.warn('[Letters] درجا تازه‌کردن ردیف صف ممکن نشد؛ ردیف تازه ساخته می‌شود:', e);
      return false;
    }
  }

  private async mergeLocked(baseId: string, req: DraftSaveRequest): Promise<boolean> {
    if (await firstValueFrom(this.sync.isSyncing$)) return false;
    const db = resolveOfflineDbStrict(LETTERS_SCOPE);
    if (!db) return false;
    return db.transaction('rw', db.syncQueue, async () => {
      const rows = await this.rowsOf(baseId);
      const last = rows[rows.length - 1];
      if (!last?.id || last.entitySyncId !== baseId || last.status !== 'pending' || last.lastError || last.retryCount) {
        return false;
      }
      const body: LetterWritePayload = req.letterId
        ? { ...req.payload, revision: last.body?.revision ?? req.payload.revision }
        : { ...req.payload, client_temp_id: last.body?.client_temp_id ?? req.payload.client_temp_id };
      await db.syncQueue.update(last.id, { body });
      return true;
    });
  }
}
