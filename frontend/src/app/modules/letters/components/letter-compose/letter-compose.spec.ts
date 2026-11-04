// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { LetterComposePage } from './letter-compose';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { LetterDetail } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const detail = (over: Partial<LetterDetail> = {}): LetterDetail => ({
  id: 5, company: 3, kind: 'internal', subject: 'موضوع سرور', status: 'draft', confidentiality: 'normal', number_display: '',
  registered_at: null, created_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-04T08:00:00Z', revision: 2,
  response_due_at: null, project: null, project_title: null, author: { id: 1, name: 'نویسنده' },
  body: [{ type: 'paragraph', align: 'right', runs: [{ text: 'متن سرور' }] }], sign_mode: 'electronic',
  recipients: [], signers: [], draft_copies: [], can_edit: true, ...over,
});

describe('LetterComposePage — نوشتن و پیش‌نویس آفلاین', () => {
  let fixture: ComponentFixture<LetterComposePage>;
  let page: LetterComposePage;
  const online = signal(true);
  let offline: { online: typeof online; saveDraft: any; localDrafts: any };
  let api: { get: any; projects: any; action: any };
  let location: { replaceState: any };

  function setup(isOnline: boolean, params: Record<string, string> = { id: '5' }, query: Record<string, string> = {}) {
    online.set(isOnline);
    offline = { online, saveDraft: vi.fn(), localDrafts: vi.fn().mockResolvedValue([]) };
    api = { get: vi.fn().mockReturnValue(of(detail())), projects: vi.fn().mockReturnValue(of([])), action: vi.fn() };
    location = { replaceState: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LetterComposePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap(query) } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: Location, useValue: location },
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: offline },
        { provide: ActiveCompanyService, useValue: { activeCompanySignal: signal({ id: 3 }) } },
      ],
    });
    fixture = TestBed.createComponent(LetterComposePage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  }

  const btn = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement;

  beforeEach(() => vi.restoreAllMocks());

  it('آفلاین: «ارسال برای امضا» غیرفعال است، دلیلش دیده می‌شود و ذخیره فعال است', () => {
    setup(false);
    expect(btn('letter-submit').disabled).toBe(true);
    expect(btn('letter-register')).toBeNull();
    expect(btn('letter-action-block').textContent).toContain('نیاز به اتصال');
    expect(page.submitBlocked()).toBe('نیاز به اتصال');
    const save = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('آنلاین و ذخیره‌شده: «ارسال برای امضا» فعال است', () => {
    setup(true);
    expect(btn('letter-submit').disabled).toBe(false);
    expect(btn('letter-register')).toBeNull();
    expect(btn('letter-action-block')).toBeNull();
  });

  it('وارده: فقط «ثبت» نشان داده می‌شود و «ارسال برای امضا» نیست', () => {
    setup(true);
    page.form.controls.kind.setValue('incoming');
    fixture.detectChanges();
    expect(btn('letter-submit')).toBeNull();
    expect(btn('letter-register')).not.toBeNull();
    expect(btn('letter-register').textContent).toContain('ثبت');
    expect(btn('letter-action-block').textContent).toContain('تغییرها هنوز ذخیره نشده‌اند');
  });

  it('conflict: true «نسخهٔ ناهمگام» نشان می‌دهد و متن محلی را نگه می‌دارد', async () => {
    setup(true);
    offline.saveDraft.mockResolvedValue({ kind: 'conflict', letter: detail({ revision: 4, conflict: true, draft_copies: [] }) });
    page.form.controls.subject.setValue('متن محلی کاربر');
    await page.save();
    fixture.detectChanges();

    expect(offline.saveDraft).toHaveBeenCalledWith({ letterId: 5, payload: expect.objectContaining({ revision: 2, subject: 'متن محلی کاربر' }) });
    const box = fixture.nativeElement.querySelector('[data-testid="letter-conflict"]') as HTMLElement;
    expect(box.textContent).toContain('نسخهٔ ناهمگام');
    expect((fixture.nativeElement.querySelector('#letter-subject') as HTMLInputElement).value).toBe('متن محلی کاربر');
    expect(page.hasUnsavedChanges()).toBe(true);
  });

  it('«جایگزین کن» با نسخهٔ سرور دوباره ذخیره می‌کند', async () => {
    setup(true);
    offline.saveDraft.mockResolvedValueOnce({ kind: 'conflict', letter: detail({ revision: 4, conflict: true }) })
      .mockResolvedValueOnce({ kind: 'saved', letter: detail({ revision: 5 }) });
    page.form.controls.subject.setValue('متن من');
    await page.save();
    await page.replaceServer();
    expect(offline.saveDraft.mock.calls[1][0].payload.revision).toBe(4);
    expect(page.conflict()).toBeNull();
    expect(page.revision()).toBe(5);
  });

  it('در صف: «در صف ارسال» و کنش‌های آنلاین بسته', async () => {
    setup(false);
    offline.saveDraft.mockResolvedValue({ kind: 'queued', merged: false });
    page.form.controls.subject.setValue('پیش‌نویس آفلاین');
    await page.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('در صف ارسال');
    expect(page.hasUnsavedChanges()).toBe(false);
    expect(btn('letter-submit').disabled).toBe(true);
  });

  it('رد 4xx: پیام کنار فیلد و متن در فرم می‌ماند', async () => {
    setup(true);
    offline.saveDraft.mockResolvedValue({ kind: 'rejected', status: 400, message: 'نادرست', fieldErrors: { subject: 'موضوع بلند است.' } });
    page.form.controls.subject.setValue('موضوع من');
    await page.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#letter-subject-error')?.textContent).toContain('موضوع بلند است.');
    expect(page.form.controls.subject.value).toBe('موضوع من');
  });

  it('تایپ در میانهٔ ذخیره: «ذخیره نشده» و هشدار ترک صفحه می‌ماند', async () => {
    setup(true);
    let resolve!: (v: unknown) => void;
    offline.saveDraft.mockReturnValue(new Promise(r => (resolve = r)));
    page.form.controls.subject.setValue('نسخهٔ اول');
    const saving = page.save();
    page.form.controls.subject.setValue('نسخهٔ اول و حروف تازه');
    resolve({ kind: 'saved', letter: detail({ revision: 3 }) });
    await saving;
    expect(page.hasUnsavedChanges()).toBe(true);
    expect(page.revision()).toBe(3);

    // ذخیرهٔ بعدی بی‌تایپ در میانه، «ذخیره نشده» را برمی‌دارد
    offline.saveDraft.mockResolvedValue({ kind: 'queued', merged: false });
    await page.save();
    expect(page.hasUnsavedChanges()).toBe(false);
  });

  it('تایپ در میانهٔ ذخیرهٔ صف‌شده هم «ذخیره نشده» را نگه می‌دارد', async () => {
    setup(false);
    let resolve!: (v: unknown) => void;
    offline.saveDraft.mockReturnValue(new Promise(r => (resolve = r)));
    page.form.controls.subject.setValue('پیش‌نویس');
    const saving = page.save();
    page.onBody([{ type: 'paragraph', align: 'right', runs: [{ text: 'متن تازه' }] }]);
    resolve({ kind: 'queued', merged: true });
    await saving;
    expect(page.queued()).toBe(true);
    expect(page.hasUnsavedChanges()).toBe(true);
  });

  it('شکست ذخیرهٔ محلی: پیام و «ذخیره نشده» می‌ماند', async () => {
    setup(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    offline.saveDraft.mockRejectedValue(new Error('QuotaExceededError'));
    page.form.controls.subject.setValue('متن مهم');
    await page.save();
    fixture.detectChanges();
    expect(page.notice()).toEqual({ tone: 'error', text: 'ذخیرهٔ محلی ممکن نشد؛ متن در فرم مانده است.' });
    expect(page.hasUnsavedChanges()).toBe(true);
    expect(page.saving()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="letter-save-notice"]')?.textContent).toContain('ذخیرهٔ محلی ممکن نشد');
  });

  it('صف‌شده پس از duplicate: فرم به حالت ویرایش همان نامه می‌رود', async () => {
    setup(true, {});
    offline.saveDraft.mockResolvedValue({ kind: 'queued', merged: false, letterId: 11, revision: 4 });
    page.form.controls.subject.setValue('نامهٔ تازه');
    await page.save();
    expect(page.letterId()).toBe(11);
    expect(page.revision()).toBe(4);
    expect(location.replaceState).toHaveBeenCalledWith('/app/letters/11/edit');
    expect(page.buildPayload()).toMatchObject({ revision: 4 });
    expect(page.buildPayload().client_temp_id).toBeUndefined();
  });

  it('ناهمگامی روی ساخت تکراری: فرم به ویرایش همان نامه می‌رود و «جایگزین کن» keep_server_copy می‌فرستد', async () => {
    setup(true, {});
    offline.saveDraft.mockResolvedValueOnce({ kind: 'conflict', letter: { id: 11, revision: 4, status: 'draft', draft_copies: [] } });
    page.form.controls.subject.setValue('نامهٔ تازه');
    await page.save();
    expect(page.letterId()).toBe(11);
    expect(location.replaceState).toHaveBeenCalledWith('/app/letters/11/edit');

    offline.saveDraft.mockResolvedValueOnce({ kind: 'saved', letter: { id: 11, revision: 5, status: 'draft', draft_copies: [] } });
    await page.replaceServer();
    const req = offline.saveDraft.mock.calls[1][0];
    expect(req.letterId).toBe(11);
    expect(req.payload).toMatchObject({ revision: 4, keep_server_copy: true });
    expect(page.buildPayload().keep_server_copy).toBeUndefined();
  });

  it('خطای فیلد: نشانگر به نخستین فیلد نادرست می‌رود و aria-describedby فقط با خطا', async () => {
    setup(true);
    const subject = () => fixture.nativeElement.querySelector('#letter-subject') as HTMLInputElement;
    expect(subject().getAttribute('aria-describedby')).toBeNull();
    page.form.controls.subject.setValue('   ');
    await page.save();
    fixture.detectChanges();
    await new Promise(r => setTimeout(r));
    expect(offline.saveDraft).not.toHaveBeenCalled();
    expect(subject().getAttribute('aria-describedby')).toBe('letter-subject-error');
    expect(fixture.nativeElement.querySelector('#letter-subject-error')?.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(subject());
  });

  it('باز کردن پیش‌نویس ردشده همهٔ بخش‌ها را برمی‌گرداند', async () => {
    setup(false, {}, { local: '4' });
    offline.localDrafts.mockResolvedValue([{
      id: 4, state: 'failed', letterId: null, subject: 'ردشده', at: 1,
      body: {
        kind: 'outgoing', subject: 'ردشده', body: [{ type: 'paragraph', align: 'right', runs: [{ text: 'متن ردشده' }] }],
        confidentiality: 'normal', sign_mode: 'wet', project: 7,
        recipients: [
          { role: 'to', target_type: 'user', user: 21 },
          { role: 'cc', target_type: 'user', user: 22 },
          { role: 'cc', target_type: 'party', party: 9, party_name: 'شرکت بیرونی' },
        ],
        signers: [{ user: 31 }],
      },
    }]);
    page.ngOnInit();
    await new Promise(r => setTimeout(r));
    const v = page.form.getRawValue();
    expect(v).toMatchObject({ kind: 'outgoing', subject: 'ردشده', sign_mode: 'wet', project: 7, confidentiality: 'normal' });
    expect(v.toUsers.map(u => u.id)).toEqual([21]);
    expect(v.ccUsers.map(u => u.id)).toEqual([22]);
    expect(v.signers.map(u => u.id)).toEqual([31]);
    expect(page.parties()).toEqual([{ id: 9, name: 'شرکت بیرونی', role: 'cc' }]);
    expect((page.body()[0] as any).runs[0].text).toBe('متن ردشده');
    expect(page.letterId()).toBeNull();
  });
});
