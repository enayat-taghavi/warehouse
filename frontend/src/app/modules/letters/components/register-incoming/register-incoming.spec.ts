// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { WritableSignal, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { RegisterIncomingComponent } from './register-incoming';
import { LettersApiService } from '../../services/letters-api.service';
import { LettersOfflineService } from '../../services/letters-offline';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('RegisterIncomingComponent — ثبت وارده با اسکن', () => {
  let fixture: ComponentFixture<RegisterIncomingComponent>;
  let api: any;
  let online: WritableSignal<boolean>;
  let created: number[];

  beforeEach(() => {
    api = {
      create: vi.fn().mockReturnValue(of({ id: 11 })),
      uploadScan: vi.fn().mockReturnValue(of({})),
      lifecycle: vi.fn().mockReturnValue(of({ id: 11, status: 'received' })),
      parties: vi.fn().mockReturnValue(of([])),
    };
    online = signal(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RegisterIncomingComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: LettersApiService, useValue: api },
        { provide: LettersOfflineService, useValue: { online } },
      ],
    });
    fixture = TestBed.createComponent(RegisterIncomingComponent);
    fixture.componentRef.setInput('company', 3);
    created = [];
    fixture.componentInstance.created.subscribe(id => created.push(id));
    fixture.detectChanges();
  });
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
  const pickFile = (testid: string, file: File) => {
    const input = q(`[data-testid="${testid}"]`) as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('دوربین پشتی برای اسکن باز می‌شود', () => {
    expect(q('[data-testid="incoming-camera"]')!.getAttribute('capture')).toBe('environment');
  });

  it('ساخت، بارگذاری اسکن و ثبت به ترتیب', async () => {
    fixture.componentInstance.form.controls.subject.setValue('نامهٔ اداره');
    fixture.componentInstance.form.controls.external_number.setValue('۱۲۳');
    const file = new File(['scan'], 'scan.jpg', { type: 'image/jpeg' });
    pickFile('incoming-camera', file);
    expect(q('[data-testid="incoming-scan-name"]')?.textContent).toContain('scan.jpg');
    await fixture.componentInstance.submit();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'incoming', company: 3, subject: 'نامهٔ اداره', external_number: '۱۲۳' }));
    expect(api.uploadScan).toHaveBeenCalledWith(11, file);
    expect(api.lifecycle).toHaveBeenCalledWith(11, 'register');
    expect(created).toEqual([11]);
  });

  it('بی‌موضوع چیزی فرستاده نمی‌شود و پیام کنار فیلد است', async () => {
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(api.create).not.toHaveBeenCalled();
    expect(q('#incoming-subject')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('قطعی پیش از ساخت: فرم و متن می‌ماند', async () => {
    api.create.mockReturnValue(throwError(() => ({ status: 503 })));
    fixture.componentInstance.form.controls.subject.setValue('نامهٔ اداره');
    await fixture.componentInstance.submit();
    expect(fixture.componentInstance.form.controls.subject.value).toBe('نامهٔ اداره');
    expect(fixture.componentInstance.error()).toContain('اتصال');
    expect(created).toEqual([]);
  });

  it('شکست بارگذاری پس از ساخت: به صفحهٔ همان نامه می‌رود (چیزی گم نمی‌شود)', async () => {
    api.uploadScan.mockReturnValue(throwError(() => ({ status: 500 })));
    fixture.componentInstance.form.controls.subject.setValue('نامهٔ اداره');
    pickFile('incoming-file', new File(['pdf'], 'a.pdf', { type: 'application/pdf' }));
    await fixture.componentInstance.submit();
    expect(created).toEqual([11]);
    expect(api.lifecycle).not.toHaveBeenCalled();
  });

  it('آفلاین، دکمهٔ ثبت غیرفعال است', () => {
    online.set(false);
    fixture.detectChanges();
    expect((q('[data-testid="incoming-submit"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
