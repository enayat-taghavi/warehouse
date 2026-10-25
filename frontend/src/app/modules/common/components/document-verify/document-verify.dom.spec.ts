// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { DocumentVerify } from './document-verify';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DocumentVerify DOM Spec', () => {
  let fixture: ComponentFixture<DocumentVerify>;
  let component: DocumentVerify;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DocumentVerify],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ token: 'abc:def' })),
            snapshot: { paramMap: convertToParamMap({ token: 'abc:def' }) },
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DocumentVerify);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    httpMock.verify();
  });

  it('requests public verify with encoded token', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    expect(req.request.method).toBe('GET');
    req.flush({ valid: true });
  });

  it('renders full valid result', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({ valid: true, number: '1404-17', title: 'T1', date: '1404/08/04', company_name: 'C1' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1404-17');
    expect(text).toContain('T1');
    expect(text).toContain('1404/08/04');
    expect(text).toContain('C1');
    expect(text).toContain('سند معتبر است');
  });

  it('confidential shows only number', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({ valid: true, number: '9' });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('9');
    expect(text).not.toContain('T1');
    expect(text).not.toContain('C1');
    expect(text).toContain('سند معتبر است');
  });

  it('invalid token message', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({ valid: false });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('این سند معتبر نیست یا دست‌کاری شده است');
  });

  it('error shows retry and retries', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush('Unreachable', { status: 530, statusText: 'Origin Unreachable' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('اتصال به سرور برقرار نیست؛ بعداً دوباره تلاش کنید');

    const retryBtn = fixture.nativeElement.querySelector('button');
    expect(retryBtn).not.toBeNull();
    retryBtn.click();

    const retryReq = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    retryReq.flush({ valid: true });
  });

  it('never renders an amount', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({ valid: true, number: '1', title: 'T', date: 'D', company_name: 'C', amount: '999999' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('999999');
  });
});
