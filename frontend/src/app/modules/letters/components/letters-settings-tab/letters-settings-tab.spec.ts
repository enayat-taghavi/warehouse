// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

import { LettersSettingsTabComponent } from './letters-settings-tab';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';
import { AttachmentsComponent } from '../../../../shared/components/attachments/attachments.component';
import { CompanySettingRow } from '../../letters.models';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const defaultRows = (): CompanySettingRow[] => [
  { module: 'letters', key: 'letterhead_a4', type: 'int', title_fa: 'تصویر سربرگ A4', default: 0, value: 0, is_default: true, can_edit: true },
  { module: 'letters', key: 'letterhead_a5', type: 'int', title_fa: 'تصویر سربرگ A5', default: 0, value: 0, is_default: true, can_edit: true },
  { module: 'letters', key: 'secretariat_stamp', type: 'int', title_fa: 'تصویر مهر دبیرخانه', default: 0, value: 0, is_default: true, can_edit: true },
  { module: 'letters', key: 'default_due_days', type: 'int', title_fa: 'مهلت پاسخ (روز)', default: 7, value: 7, is_default: true, can_edit: true },
];

describe('LettersSettingsTabComponent — تنظیمات نامه در استودیوی شرکت', () => {
  let fixture: ComponentFixture<LettersSettingsTabComponent>;
  let api: { companySettings: any; saveCompanySetting: any };
  let online: WritableSignal<boolean>;

  const setup = (rows: CompanySettingRow[] = defaultRows()) => {
    online = signal(true);
    api = {
      companySettings: vi.fn().mockReturnValue(of({ company_id: 3, results: rows })),
      saveCompanySetting: vi.fn().mockImplementation((_cid: number, _k: string, v: number) =>
        of({ module: 'letters', key: 'default_due_days', type: 'int', title_fa: 'مهلت پاسخ (روز)', default: 7, value: v, is_default: false, can_edit: true })),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LettersSettingsTabComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online } },
      ],
    });

    fixture = TestBed.createComponent(LettersSettingsTabComponent);
  };

  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(() => setup());

  it('حالت بارگذاری: نمایش وضعیت «در حال بارگذاری تنظیمات نامه…»', () => {
    const pending$ = new Subject<{ company_id: number; results: CompanySettingRow[] }>();
    api.companySettings.mockReturnValue(pending$);
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    const statusEl = q('[role="status"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.textContent).toContain('در حال بارگذاری تنظیمات نامه…');
  });

  it('حالت خطا: نمایش خطا و بازخوانی با دکمهٔ «تلاش دوباره»', () => {
    api.companySettings.mockReturnValue(throwError(() => new Error('Server error')));
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    expect(q('[role="alert"]')).not.toBeNull();
    const retryBtn = q('button[appAction="refresh"]') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();
    expect(retryBtn.textContent).toContain('تلاش دوباره');

    api.companySettings.mockReturnValue(of({ company_id: 3, results: defaultRows() }));
    retryBtn.click();
    fixture.detectChanges();

    expect(api.companySettings).toHaveBeenCalledTimes(2);
    expect(q('[data-testid="images-section"]')).not.toBeNull();
  });

  it('حالت آفلاین: دکمهٔ «ذخیره» و دسترسی ویرایش پیوست‌ها (canEdit) غیرفعال می‌شوند', () => {
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    // مقدار تغییر کند تا unchanged مانع نشود
    fixture.componentInstance.dueDaysControl.setValue(3);
    fixture.detectChanges();
    expect((q('[data-testid="btn-save-due-days"]') as HTMLButtonElement).disabled).toBe(false);

    // آفلاین شدن
    online.set(false);
    fixture.detectChanges();

    expect((q('[data-testid="btn-save-due-days"]') as HTMLButtonElement).disabled).toBe(true);

    const attachmentDebugElements = fixture.debugElement.queryAll(By.directive(AttachmentsComponent));
    expect(attachmentDebugElements.length).toBe(3);
    for (const de of attachmentDebugElements) {
      const attComp = de.componentInstance as AttachmentsComponent;
      expect(attComp.canEdit).toBe(false);
    }
  });

  it('اگر can_edit: false باشد: بلوک‌های تصویر پنهان و اینپوت مهلت غیرفعال می‌شود', () => {
    setup(defaultRows().map(r => ({ ...r, can_edit: false })));
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    expect(q('[data-testid="images-section"]')).toBeNull();
    const forbidden = q('[data-testid="images-forbidden"]');
    expect(forbidden).not.toBeNull();
    expect(forbidden?.textContent).toContain('تصویر سربرگ و مهر را فقط مسئول تنظیمات نامه می‌بیند.');

    const input = q('[data-testid="input-due-days"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    const saveBtn = q('[data-testid="btn-save-due-days"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('ذخیرهٔ مهلت: ارسال PATCH با بدنه و کلید default_due_days و نمایش «ذخیره شد.»', () => {
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    fixture.componentInstance.dueDaysControl.setValue(3);
    fixture.detectChanges();

    const saveBtn = q('[data-testid="btn-save-due-days"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    saveBtn.click();
    fixture.detectChanges();

    expect(api.saveCompanySetting).toHaveBeenCalledWith(3, 'default_due_days', 3);
    const successMsg = q('[data-testid="save-success"]');
    expect(successMsg).not.toBeNull();
    expect(successMsg?.textContent).toContain('ذخیره شد.');

    // ویرایش دوباره پیام «ذخیره شد.» کهنه را برمی‌دارد
    fixture.componentInstance.dueDaysControl.setValue(4);
    fixture.detectChanges();
    expect(q('[data-testid="save-success"]')).toBeNull();
  });

  it('مقدار نامعتبرِ دست‌خورده پیام خطای کنار فیلد و aria-invalid می‌گیرد', () => {
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    const ctrl = fixture.componentInstance.dueDaysControl;
    ctrl.setValue(400);
    ctrl.markAsDirty();
    fixture.detectChanges();

    const input = q('[data-testid="input-due-days"]') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(q('[data-testid="due-days-error"]')?.textContent).toContain('عدد صحیح بین ۰ تا ۳۶۵ وارد کنید.');
  });

  it('مقدار نامعتبر (مثلاً ۴۰۰ یا منفی) دکمهٔ «ذخیره» را غیرفعال نگه می‌دارد', () => {
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    const saveBtn = q('[data-testid="btn-save-due-days"]') as HTMLButtonElement;

    fixture.componentInstance.dueDaysControl.setValue(400);
    fixture.detectChanges();
    expect(saveBtn.disabled).toBe(true);

    fixture.componentInstance.dueDaysControl.setValue(-1);
    fixture.detectChanges();
    expect(saveBtn.disabled).toBe(true);
  });

  it('اگر پاسخی ردیف نداشته باشد حالت خالی نشان داده می‌شود و شناسهٔ شرکت تهی چیزی لود نمی‌کند', () => {
    setup([]);
    fixture.componentRef.setInput('companyId', 3);
    fixture.detectChanges();

    expect(q('[data-testid="settings-empty"]')?.textContent).toContain('تنظیمی برای نامه‌ها پیدا نشد.');

    // با شرکت null نباید چیزی بارگذاری شود
    api.companySettings.mockClear();
    fixture.componentRef.setInput('companyId', null);
    fixture.detectChanges();
    expect(api.companySettings).not.toHaveBeenCalled();
  });
});
