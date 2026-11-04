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

  function setup(isOnline: boolean) {
    online.set(isOnline);
    offline = { online, saveDraft: vi.fn(), localDrafts: vi.fn().mockResolvedValue([]) };
    api = { get: vi.fn().mockReturnValue(of(detail())), projects: vi.fn().mockReturnValue(of([])), action: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LetterComposePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '5' }), queryParamMap: convertToParamMap({}) } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: Location, useValue: { replaceState: vi.fn() } },
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

  it('آفلاین: «ارسال برای امضا» و «ثبت وارده» غیرفعال‌اند و ذخیره فعال است', () => {
    setup(false);
    expect(btn('letter-submit').disabled).toBe(true);
    expect(btn('letter-register').disabled).toBe(true);
    expect(page.submitBlocked()).toBe('نیاز به اتصال');
    const save = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('آنلاین و ذخیره‌شده: «ارسال برای امضا» فعال است', () => {
    setup(true);
    expect(btn('letter-submit').disabled).toBe(false);
    expect(btn('letter-register').disabled).toBe(true);
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
});
