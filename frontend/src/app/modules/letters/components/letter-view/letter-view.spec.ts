// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { WritableSignal, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { NEVER, Subject, of, throwError } from 'rxjs';

import { LetterViewPage } from './letter-view';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { PrintService } from '../../../../core/services/print.service';
import { AttachmentsComponent } from '../../../../shared/components/attachments/attachments.component';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LetterViewDetail } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const detail = (over: Partial<LetterViewDetail> = {}): LetterViewDetail => ({
  id: 7, company: 3, kind: 'internal', subject: 'درخواست خرید', status: 'signing', confidentiality: 'normal',
  number_display: '', registered_at: null, created_at: '2026-11-04T08:00:00Z', updated_at: '2026-11-04T08:00:00Z',
  revision: 2, response_due_at: null, project: null, project_title: null, author: { id: 1, name: 'نویسنده' },
  body: [{ type: 'paragraph', align: 'right', runs: [{ text: 'متن ' }, { text: 'پررنگ', bold: true }] },
    { type: 'list', style: 'ordered', items: [[{ text: 'بند یک' }]] }],
  sign_mode: 'electronic', signers: [{ id: 1, user: { id: 5, name: 'امضاکننده' }, order: 0, title_text: '', status: 'pending' }],
  recipients: [{ role: 'to', target_type: 'user', user: 9, user_name: 'علی رضایی' }],
  draft_copies: [], can_edit: false, actions: ['sign', 'return'], ...over,
});

describe('LetterViewPage — نمایش نامه', () => {
  let fixture: ComponentFixture<LetterViewPage>;
  let api: any;
  let printService: any;
  let online: WritableSignal<boolean>;
  let router: Router;
  const changes$ = new Subject<any>();

  const setup = (letter: LetterViewDetail) => {
    api = {
      get: vi.fn().mockReturnValue(of(letter)),
      lifecycle: vi.fn().mockReturnValue(of({ ...letter, status: 'registered', actions: [] })),
      viewers: vi.fn().mockReturnValue(throwError(() => ({ status: 403 }))),
      referrals: vi.fn().mockReturnValue(of({ instance_id: null, referrals: [], can_refer: false })),
      uploadSignedScan: vi.fn().mockReturnValue(of({ id: 10, label: 'signed_scan', original_name: 'scan.pdf' })),
    };
    printService = {
      printPdf: vi.fn().mockResolvedValue(true),
    };
    online = signal(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LetterViewPage],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '7' })), snapshot: { paramMap: convertToParamMap({ id: '7' }), queryParamMap: convertToParamMap({}) } } },
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online } },
        { provide: PrintService, useValue: printService },
        { provide: WebSocketService, useValue: { documentChanges$: () => changes$, liveRefresh$: () => NEVER } },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(LetterViewPage);
    fixture.detectChanges();
  };
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(() => setup(detail()));

  it('متن بلوکی، گیرنده با نام و امضاکننده نمایش داده می‌شود', () => {
    expect(q('[data-testid="letter-body"] strong')?.textContent).toBe('پررنگ');
    expect(q('[data-testid="letter-body"] ol li')?.textContent).toContain('بند یک');
    expect(q('[data-testid="recipients"]')?.textContent).toContain('علی رضایی');
    expect(q('[data-testid="signers"]')?.textContent).toContain('امضاکننده');
  });

  it('فقط کنش‌هایی که سرور اجازه داده دیده می‌شوند', () => {
    expect(q('[data-testid="act-sign"]')).not.toBeNull();
    expect(q('[data-testid="act-return"]')).not.toBeNull();
    for (const a of ['edit', 'submit', 'register', 'send', 'archive', 'void', 'refer', 'print', 'upload-scan']) {
      expect(q(`[data-testid="act-${a}"]`)).toBeNull();
    }
  });

  it('امضا با تأیید به API می‌رود و پاسخ سرور جایگزین می‌شود', async () => {
    q('[data-testid="act-sign"]')!.click();
    await fixture.whenStable();
    expect(api.lifecycle).toHaveBeenCalledWith(7, 'sign', {});
    fixture.detectChanges();
    expect(q('[data-testid="act-sign"]')).toBeNull();
  });

  it('عودت بی‌دلیل فرستاده نمی‌شود', () => {
    q('[data-testid="act-return"]')!.click();
    fixture.detectChanges();
    (q('[data-testid="action-form"]') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.lifecycle).not.toHaveBeenCalled();
    expect(q('[data-testid="action-error"]')?.textContent).toContain('دلیل');
  });

  it('آفلاین، کنش‌ها غیرفعال‌اند', () => {
    online.set(false);
    fixture.detectChanges();
    expect((q('[data-testid="act-sign"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('نسخهٔ ناهمگام با «بردن به ویرایشگر» به فرم ویرایش می‌رود', () => {
    setup(detail({ status: 'draft', actions: ['edit'], can_edit: true,
      draft_copies: [{ id: 4, subject: 'متن کهنه', body: [], reason: 'stale_revision', created_at: '2026-11-04T09:00:00Z', created_by: 1 }] }));
    expect(q('[data-testid="draft-copies"]')?.textContent).toContain('نسخهٔ ناهمگام');
    q('[data-testid="copy-4"]')!.click();
    expect(router.navigate).toHaveBeenCalledWith(['/app/letters', 7, 'edit'], { queryParams: { copy: 4 } });
  });

  it('رویداد زندهٔ همین نامه بازخوانی می‌کند و نامهٔ دیگر نه', () => {
    expect(api.get).toHaveBeenCalledTimes(1);
    changes$.next({ type: 'document_changed', doc_type: 'letters_letter', doc_id: 99, action: 'updated' });
    expect(api.get).toHaveBeenCalledTimes(1);
    changes$.next({ type: 'document_changed', doc_type: 'letters_letter', doc_id: 7, action: 'updated' });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('دکمهٔ چاپ بدون مجوز print پنهان و با آن نمایش داده می‌شود', () => {
    expect(q('[data-testid="act-print"]')).toBeNull();
    setup(detail({ actions: ['print'] }));
    const printBtn = q('[data-testid="act-print"]');
    expect(printBtn).not.toBeNull();
    expect(printBtn?.getAttribute('aria-label')).toBe('چاپ یا PDF نامه');
    expect(printBtn?.textContent).toContain('چاپ');
  });

  it('کلیک روی چاپ پس از انتخاب A5 متد PrintService.printPdf را با letters_letter و A5 صدا می‌زند', async () => {
    setup(detail({ actions: ['print'] }));
    const select = q('[data-testid="print-paper-size"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    select.value = 'A5';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const printBtn = q('[data-testid="act-print"]') as HTMLButtonElement;
    printBtn.click();
    await fixture.whenStable();

    expect(printService.printPdf).toHaveBeenCalledWith('letters_letter', 7, 'A5');
  });

  it('دکمهٔ بارگذاری نسخهٔ امضاشده بدون upload_scan پنهان و با آن نمایش داده می‌شود', () => {
    expect(q('[data-testid="act-upload-scan"]')).toBeNull();
    setup(detail({ actions: ['upload_scan'] }));
    const uploadBtn = q('[data-testid="act-upload-scan"]');
    expect(uploadBtn).not.toBeNull();
    expect(uploadBtn?.getAttribute('aria-label')).toBe('بارگذاری نسخهٔ امضاشده (اسکن)');
    expect(uploadBtn?.textContent).toContain('نسخهٔ امضاشده');
  });

  it('انتخاب فایل اسکن FormData را به مسیر scan با برچسب signed_scan می‌فرستد و پیام موفقیت می‌دهد', async () => {
    setup(detail({ actions: ['upload_scan'] }));
    const file = new File(['dummy-scan-content'], 'scan.pdf', { type: 'application/pdf' });
    const input = q('[data-testid="scan-file-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(api.uploadSignedScan).toHaveBeenCalledWith(7, file, 'signed_scan');
    await fixture.whenStable();
    fixture.detectChanges();

    const successEl = q('[data-testid="scan-success"]');
    expect(successEl).not.toBeNull();
    expect(successEl?.textContent).toContain('نسخهٔ امضاشده بارگذاری شد.');
  });

  it('کامپوننت app-attachments نوع letters_letter را می‌گیرد و canEdit فقط با attach و آنلاین بودن فعال است', () => {
    // پیش‌فرض: بدون attach
    setup(detail({ actions: ['sign'] }));
    let attComp = fixture.debugElement.query(By.directive(AttachmentsComponent)).componentInstance as AttachmentsComponent;
    expect(attComp.kind).toBe('letters_letter');
    expect(attComp.canEdit).toBe(false);

    // با attach در حالت آنلاین
    setup(detail({ actions: ['attach'] }));
    attComp = fixture.debugElement.query(By.directive(AttachmentsComponent)).componentInstance as AttachmentsComponent;
    expect(attComp.kind).toBe('letters_letter');
    expect(attComp.canEdit).toBe(true);

    // با attach در حالت آفلاین
    online.set(false);
    fixture.detectChanges();
    expect(attComp.canEdit).toBe(false);
  });
});
