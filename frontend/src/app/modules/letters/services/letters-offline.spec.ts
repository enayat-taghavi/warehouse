// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError } from 'rxjs';

import { getModuleRegistry } from '../../../core/modules/module-registry.service';
import { OfflineSyncService } from '../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { SyncQueueEntry, resolveOfflineDbStrict } from '../../../core/services/offline-db';
import { sendEntry } from '../../../core/services/offline/offline-queue-runner';
import { MODULE } from '../module';
import { LetterWritePayload } from '../letters.models';
import { LettersApiService } from './letters-api.service';
import { LETTERS_SCOPE, LETTER_DRAFT_ENTITY, LettersOfflineService } from './letters-offline';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

getModuleRegistry().registerModule(MODULE);

const payload = (over: Partial<LetterWritePayload> = {}): LetterWritePayload => ({
  kind: 'internal', company: 3, client_temp_id: 'tmp-1', subject: 'موضوع آزمایشی',
  body: [{ type: 'paragraph', align: 'right', runs: [{ text: 'متن کاربر' }] }],
  confidentiality: 'normal', sign_mode: 'electronic', project: null, recipients: [], signers: [], ...over,
});

describe('LettersOfflineService — پیش‌نویس آفلاین بی‌از‌دست‌رفتن متن (ن۱۱)', () => {
  let service: LettersOfflineService;
  let api: { create: any; update: any };
  let sync: { enqueue: any; getQueueEntries: any; getErrors: any; isSyncing$: any };
  let browserOnline = true;

  beforeEach(() => {
    browserOnline = true;
    vi.spyOn(NetworkStatusService.prototype, 'isBrowserOnline', 'get').mockImplementation(() => browserOnline);
    api = { create: vi.fn(), update: vi.fn() };
    sync = {
      enqueue: vi.fn().mockResolvedValue({ id: 7 }),
      getQueueEntries: vi.fn().mockResolvedValue([]),
      getErrors: vi.fn().mockResolvedValue([]),
      isSyncing$: of(false),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: LettersApiService, useValue: api },
        { provide: OfflineSyncService, useValue: sync },
      ],
    });
    service = TestBed.inject(LettersOfflineService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('قلمرو letters پایگاه دادهٔ خودش را دارد', () => {
    expect(resolveOfflineDbStrict(LETTERS_SCOPE)?.name).toBe('WarehouseOfflineDB_letters');
  });

  it('آفلاین: پیش‌نویس تازه در صف هسته می‌رود و API صدا زده نمی‌شود', async () => {
    browserOnline = false;
    const db = resolveOfflineDbStrict(LETTERS_SCOPE)!;
    vi.spyOn(db.syncQueue, 'toArray').mockResolvedValue([]);
    vi.spyOn(db, 'transaction').mockImplementation(((...args: any[]) => args[args.length - 1]()) as any);

    const out = await service.saveDraft({ letterId: null, payload: payload() });

    expect(out.kind).toBe('queued');
    expect(api.create).not.toHaveBeenCalled();
    expect(sync.enqueue).toHaveBeenCalledWith('POST', expect.stringContaining('/letters/'), expect.objectContaining({ subject: 'موضوع آزمایشی' }),
      expect.objectContaining({ entityType: LETTER_DRAFT_ENTITY, entitySyncId: 'new-tmp-1', appScope: LETTERS_SCOPE }));
  });

  it('آنلاین با 503 یا 500: متن در صف می‌ماند (ردیف «شاید رسیده»)', async () => {
    vi.spyOn(resolveOfflineDbStrict(LETTERS_SCOPE)!.syncQueue, 'toArray').mockResolvedValue([]);
    api.create.mockReturnValue(throwError(() => ({ status: 503 })));
    expect((await service.saveDraft({ letterId: null, payload: payload() })).kind).toBe('queued');
    api.update.mockReturnValue(throwError(() => ({ status: 500 })));
    expect((await service.saveDraft({ letterId: 9, payload: payload({ revision: 2 }) })).kind).toBe('queued');
    expect(sync.enqueue).toHaveBeenCalledTimes(2);
    expect(sync.enqueue.mock.calls[1][0]).toBe('PATCH');
    expect(sync.enqueue.mock.calls[1][3].entitySyncId).toBe('letter-9~attempted');
  });

  it('4xx صریح: رد با پیام فیلد، بی‌صف (متن در فرم می‌ماند)', async () => {
    api.create.mockReturnValue(throwError(() => ({ status: 400, error: { subject: ['موضوع لازم است.'] } })));
    const out = await service.saveDraft({ letterId: null, payload: payload() });
    expect(out).toMatchObject({ kind: 'rejected', status: 400, fieldErrors: { subject: 'موضوع لازم است.' } });
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('404 روی ویرایش: «gone» و بی‌صف', async () => {
    api.update.mockReturnValue(throwError(() => ({ status: 404 })));
    const out = await service.saveDraft({ letterId: 5, payload: payload({ revision: 1 }) });
    expect(out.kind).toBe('gone');
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('200 با conflict: true → «conflict» و هیچ صفی', async () => {
    api.update.mockReturnValue(of({ id: 5, revision: 3, conflict: true, conflict_reason: 'stale_revision' }));
    const out = await service.saveDraft({ letterId: 5, payload: payload({ revision: 1 }) });
    expect(out.kind).toBe('conflict');
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('ساخت تکراری (duplicate) متن تازه را با PATCH می‌فرستد', async () => {
    api.create.mockReturnValue(of({ id: 11, revision: 4, duplicate: true }));
    api.update.mockReturnValue(of({ id: 11, revision: 5 }));
    const out = await service.saveDraft({ letterId: null, payload: payload() });
    expect(out.kind).toBe('saved');
    expect(api.update).toHaveBeenCalledWith(11, expect.objectContaining({ revision: 4, subject: 'موضوع آزمایشی' }));
    expect(api.update.mock.calls[0][1].client_temp_id).toBeUndefined();
  });

  it('نامهٔ محرمانه در آفلاین روی دستگاه ذخیره نمی‌شود', async () => {
    browserOnline = false;
    const out = await service.saveDraft({ letterId: null, payload: payload({ confidentiality: 'secret' }) });
    expect(out.kind).toBe('not-queueable');
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('ذخیرهٔ دوباره در آفلاین کامل: متن ردیف «pending» درجا تازه می‌شود', async () => {
    browserOnline = false;
    const db = resolveOfflineDbStrict(LETTERS_SCOPE)!;
    const queued: SyncQueueEntry = { id: 3, method: 'POST', url: '/api/v1/letters/', body: payload(), createdAt: 1,
      retryCount: 0, status: 'pending', entityType: LETTER_DRAFT_ENTITY, entitySyncId: 'new-tmp-1', appScope: LETTERS_SCOPE };
    vi.spyOn(db.syncQueue, 'toArray').mockResolvedValue([queued]);
    const update = vi.spyOn(db.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(db, 'transaction').mockImplementation(((...args: any[]) => args[args.length - 1]()) as any);

    const out = await service.saveDraft({ letterId: null, payload: payload({ subject: 'متن تازه‌تر' }) });

    expect(out).toEqual({ kind: 'queued', merged: true });
    expect(update).toHaveBeenCalledWith(3, { body: expect.objectContaining({ subject: 'متن تازه‌تر', client_temp_id: 'tmp-1' }) });
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('ردیفِ در حال ارسال یا «شاید رسیده» درجا عوض نمی‌شود؛ پیش‌نویس تازه با شناسهٔ موقت تازه', async () => {
    browserOnline = false;
    const db = resolveOfflineDbStrict(LETTERS_SCOPE)!;
    const sending: SyncQueueEntry = { id: 3, method: 'POST', url: '/api/v1/letters/', body: payload(), createdAt: 1,
      retryCount: 0, status: 'sending', entityType: LETTER_DRAFT_ENTITY, entitySyncId: 'new-tmp-1', appScope: LETTERS_SCOPE };
    vi.spyOn(db.syncQueue, 'toArray').mockResolvedValue([sending]);
    const update = vi.spyOn(db.syncQueue, 'update').mockResolvedValue(1);
    vi.spyOn(db, 'transaction').mockImplementation(((...args: any[]) => args[args.length - 1]()) as any);

    const out = await service.saveDraft({ letterId: null, payload: payload({ subject: 'نسخهٔ دوم' }) });

    expect(out.kind).toBe('queued');
    expect(update).not.toHaveBeenCalled();
    const newTempId = (out as any).newTempId;
    expect(newTempId).toBeTruthy();
    expect(sync.enqueue.mock.calls[0][2]).toMatchObject({ subject: 'نسخهٔ دوم', client_temp_id: newTempId });
  });

  it('فهرست پیش‌نویس‌های محلی: در صف و ردشده (404) با متن', async () => {
    sync.getQueueEntries.mockResolvedValue([{ id: 1, url: '/api/v1/letters/', body: payload(), createdAt: 10,
      entityType: LETTER_DRAFT_ENTITY, status: 'pending' }]);
    sync.getErrors.mockResolvedValue([{ id: 2, url: '/api/v1/letters/8/', body: payload({ subject: 'رد شده' }), failedAt: 20,
      statusCode: 404, entityType: LETTER_DRAFT_ENTITY }]);
    const rows = await service.localDrafts();
    expect(rows.map(r => [r.state, r.letterId, r.subject])).toEqual([['failed', 8, 'رد شده'], ['pending', null, 'موضوع آزمایشی']]);
  });
});

describe('اجراکنندهٔ صف هسته با ردیف پیش‌نویس نامه', () => {
  const entry = (): SyncQueueEntry => ({ id: 21, method: 'POST', url: '/api/v1/letters/', body: payload(), createdAt: 1,
    retryCount: 0, status: 'pending', entityType: LETTER_DRAFT_ENTITY, entitySyncId: 'new-tmp-1', appScope: LETTERS_SCOPE });
  const fakeNetwork = { reportServerUnreachable: vi.fn(), reportServerReachable: vi.fn() } as any;

  afterEach(() => vi.restoreAllMocks());

  function spies() {
    const db = resolveOfflineDbStrict(LETTERS_SCOPE)!;
    return {
      db,
      update: vi.spyOn(db.syncQueue, 'update').mockResolvedValue(1),
      del: vi.spyOn(db.syncQueue, 'delete').mockResolvedValue(undefined as any),
      addError: vi.spyOn(db.syncErrors, 'add').mockResolvedValue(5 as any),
    };
  }

  it('5xx ردیف را پاک نمی‌کند', async () => {
    const s = spies();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as any);
    expect(await sendEntry(entry(), s.db, false, fakeNetwork)).toBe('server-error');
    expect(s.del).not.toHaveBeenCalled();
  });

  it('قطعی (خطای انتقال) ردیف را پاک نمی‌کند', async () => {
    const s = spies();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await sendEntry(entry(), s.db, false, fakeNetwork)).toBe('transport-failed');
    expect(s.del).not.toHaveBeenCalled();
  });

  it('2xx ردیف را برمی‌دارد', async () => {
    const s = spies();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) } as any);
    expect(await sendEntry(entry(), s.db, false, fakeNetwork)).toBe('sent');
    expect(s.del).toHaveBeenCalledWith(21);
  });

  it('4xx ردیف را با همان متن به صندوق خطا می‌برد', async () => {
    const s = spies();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400, json: async () => ({ detail: 'نادرست' }) } as any);
    expect(await sendEntry(entry(), s.db, false, fakeNetwork)).toBe('rejected');
    expect(s.addError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, body: expect.objectContaining({ subject: 'موضوع آزمایشی' }) }));
    expect(s.addError.mock.invocationCallOrder[0]).toBeLessThan(s.del.mock.invocationCallOrder[0]);
  });
});
