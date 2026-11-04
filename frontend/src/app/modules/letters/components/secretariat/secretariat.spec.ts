// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NEVER, Subject, of, throwError } from 'rxjs';

import { SecretariatPage } from './secretariat';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ActiveCompanyService } from '../../../../core/services/active-company.service';
import { FileOutputService } from '../../../../core/platform/file-output';
import { RegisterRow } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const row = (id: number, over: Partial<RegisterRow> = {}): RegisterRow => ({
  id, kind: 'outgoing', status: 'registered', number_display: `1405/ص/${id}`, registered_at: '2026-11-04T08:00:00Z',
  confidentiality: 'normal', external_number: '', covered: false, subject: `نامه ${id}`, author: null, ...over,
});

describe('SecretariatPage — دبیرخانه', () => {
  let fixture: ComponentFixture<SecretariatPage>;
  let api: any;
  let files: any;
  const changes$ = new Subject<any>();

  beforeEach(() => {
    api = {
      register: vi.fn().mockReturnValue(of([row(1), row(2, { status: 'void' }), row(3, { kind: 'incoming', status: 'received' }),
        row(4, { covered: true, subject: 'نامهٔ محرمانه', confidentiality: 'secret' })])),
      registerExport: vi.fn().mockReturnValue(of(new Blob(['x']))),
    };
    files = { saveBlob: vi.fn().mockResolvedValue(undefined) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SecretariatPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online: signal(true) } },
        { provide: WebSocketService, useValue: { documentChanges$: () => changes$, liveRefresh$: () => NEVER } },
        { provide: ActiveCompanyService, useValue: { activeCompanySignal: signal({ id: 3 }) } },
        { provide: FileOutputService, useValue: files },
      ],
    });
    fixture = TestBed.createComponent(SecretariatPage);
    fixture.detectChanges();
  });
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  it('دفتر با ردیف باطل‌شده (خط‌خورده) و نامهٔ پوشیده بی‌پیوند', () => {
    expect(api.register).toHaveBeenCalledWith(3);
    const voided = q('[data-testid="register-row-2"]')!;
    expect(voided.querySelector('.line-through')?.textContent).toContain('1405/ص/2');
    expect(voided.textContent).toContain('باطل');
    expect(q('[data-testid="register-row-4"] a')).toBeNull();
    expect(q('[data-testid="register-row-4"]')!.textContent).toContain('نامهٔ محرمانه');
  });

  it('«منتظر ارسال» فقط صادرهٔ ثبت‌شده را نشان می‌دهد', () => {
    fixture.componentInstance.onTab('pending');
    fixture.detectChanges();
    expect(q('[data-testid="register-row-1"]')).not.toBeNull();
    expect(q('[data-testid="register-row-2"]')).toBeNull();
    expect(q('[data-testid="register-row-3"]')).toBeNull();
  });

  it('فوکوس پنجره و رویداد «سند تغییر کرد» دفتر را دوباره می‌خوانند', () => {
    window.dispatchEvent(new Event('focus'));
    expect(api.register).toHaveBeenCalledTimes(2);
    changes$.next({ type: 'document_changed', doc_type: 'letters_letter', doc_id: 50, action: 'updated' });
    expect(api.register).toHaveBeenCalledTimes(3);
  });

  it('قطعی در بازخوانی بی‌صدا دفتر نشان‌داده‌شده را پاک نمی‌کند', () => {
    api.register.mockReturnValue(throwError(() => ({ status: 0 })));
    window.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(q('[data-testid="register-row-1"]')).not.toBeNull();
    expect(q('[data-testid="register-error"]')).toBeNull();
  });

  it('خروجی اکسل از API سرور ذخیره می‌شود', () => {
    q('[data-testid="register-export"]')!.click();
    expect(api.registerExport).toHaveBeenCalledWith(3);
    expect(files.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'letters_register.xlsx');
  });
});
