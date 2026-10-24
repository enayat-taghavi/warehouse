// @vitest-environment jsdom
import '@angular/compiler';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { VerifyCard } from './verify-card';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('VerifyCard', () => {
  let fixture: ComponentFixture<VerifyCard>;
  let component: VerifyCard;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VerifyCard);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  const lastRequest = () => http.expectOne((r) => r.url.includes('verify_card'));

  it('کارت معتبر: فقط نام کامل و عکس نمایش داده می‌شود', () => {
    component.verifyCode('EMP-1-0123456789abcdef');
    lastRequest().flush({ valid: true, first_name: 'علی', last_name: 'رضایی', avatar: null });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('علی رضایی');
    expect(text).toContain('کارت شناسایی معتبر است');
    expect(text).not.toContain('کد ملی');
    expect(text).not.toContain('تماس اضطراری');
    expect(text).not.toContain('گروه خونی');
  });

  it('۴۰۴ از سرور: حالت «کارت نامعتبر» نمایش داده می‌شود نه خطای شبکه', () => {
    component.verifyCode('EMP-1-bad');
    lastRequest().flush({ valid: false }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.personnel).toBeNull();
    expect(component.errorType).toBe('invalid');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('کارت شناسایی نامعتبر است');
  });

  it('خطای شبکه: پیام ارتباط با سرور و دکمهٔ استعلام مجدد', () => {
    component.verifyCode('EMP-1-x');
    lastRequest().error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();

    expect(component.errorType).toBe('network');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('استعلام مجدد');
  });
});
