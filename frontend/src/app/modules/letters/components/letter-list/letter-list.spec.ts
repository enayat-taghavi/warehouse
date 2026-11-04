// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, Subject, of } from 'rxjs';

import { LetterListPage, parseLetterFilters } from './letter-list';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { LetterRow } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const row = (id: number, over: Partial<LetterRow> = {}): LetterRow => ({
  id, company: 3, kind: 'outgoing', subject: `نامهٔ بسیار بلند با موضوعی که در صفحهٔ کوچک باید بشکند ${id}`, status: 'registered',
  confidentiality: 'normal', number_display: `1405/ص/${id}`, registered_at: '2026-11-04T08:00:00Z', created_at: '2026-11-04T08:00:00Z',
  updated_at: '2026-11-04T08:00:00Z', revision: 1, response_due_at: null, project: null, project_title: null, author: null, ...over,
});

describe('LetterListPage — فهرست نامه‌ها', () => {
  let fixture: ComponentFixture<LetterListPage>;
  let api: { list: any; projects: any };
  let router: Router;
  const params$ = new BehaviorSubject(convertToParamMap({ tab: 'all', kind: 'outgoing', q: 'قرارداد', page: '2' }));
  const changes$ = new Subject<any>();

  beforeEach(() => {
    params$.next(convertToParamMap({ tab: 'all', kind: 'outgoing', q: 'قرارداد', page: '2' }));
    api = {
      list: vi.fn().mockReturnValue(of({ count: 2, next: null, previous: null, results: [row(1), row(2)] })),
      projects: vi.fn().mockReturnValue(of([])),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LetterListPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params$, snapshot: {} } },
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online: signal(true), localDrafts: vi.fn().mockResolvedValue([]) } },
        { provide: WebSocketService, useValue: { documentChanges$: () => changes$, liveRefresh$: () => NEVER } },
        { provide: ActiveCompanyService, useValue: { activeCompanySignal: signal({ id: 3 }) } },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(LetterListPage);
    fixture.detectChanges();
  });

  it('فیلترهای آدرس صفحه خوانده و به API داده می‌شوند', () => {
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'all', kind: 'outgoing', q: 'قرارداد', page: 2 }), 3);
  });

  it('مقدار نامعتبر آدرس کنار گذاشته می‌شود', () => {
    const f = parseLetterFilters(convertToParamMap({ tab: 'x', kind: '<script>', status: 'void', project: '-4', page: 'abc' }));
    expect(f).toMatchObject({ tab: 'inbox', kind: '', status: 'void', project: null, page: 1 });
  });

  it('عوض کردن فیلتر آدرس را عوض می‌کند (صفحه به ۱ برمی‌گردد)', () => {
    const select = fixture.nativeElement.querySelector('#letters-kind') as HTMLSelectElement;
    select.value = 'internal';
    select.dispatchEvent(new Event('change'));
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ tab: 'all', kind: 'internal', q: 'قرارداد', page: null }), replaceUrl: true,
    }));
  });

  it('رویداد «سند تغییر کرد» نامه فهرست را دوباره می‌خواند', () => {
    expect(api.list).toHaveBeenCalledTimes(1);
    changes$.next({ type: 'document_changed', doc_type: 'letters_letter', doc_id: 99, action: 'updated' });
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('تغییر وضعیت ردیف موجود درجا می‌نشیند', () => {
    changes$.next({ type: 'document_changed', doc_type: 'letters_letter', doc_id: 1, action: 'status_changed', status: 'archived' });
    fixture.detectChanges();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.rows()[0].status).toBe('archived');
  });

  it('کارت موبایل در ۳۶۰ پیکسل: بی‌عرض ثابت و با شکستن متن؛ جدول فقط در دسکتاپ', () => {
    const cards = fixture.nativeElement.querySelector('[data-testid="letters-cards"]') as HTMLElement;
    const table = fixture.nativeElement.querySelector('[data-testid="letters-table"]') as HTMLElement;
    expect(cards.classList).toContain('md:hidden');
    expect(table.classList).toContain('hidden');
    expect(table.classList).toContain('md:block');
    const links = cards.querySelectorAll('a');
    expect(links.length).toBe(2);
    links.forEach(a => {
      expect(a.classList).toContain('min-w-0');
      expect(a.classList).toContain('break-words');
    });
    const fixedWide = Array.from(fixture.nativeElement.querySelectorAll('*') as NodeListOf<HTMLElement>)
      .flatMap(el => Array.from(el.classList))
      .filter(c => /^(min-)?w-\[(\d+)px\]$/.test(c) && Number(/\d+/.exec(c)![0]) > 320);
    expect(fixedWide).toEqual([]);
  });
});
