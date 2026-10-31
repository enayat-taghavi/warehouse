// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { DocumentVerify } from './document-verify';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('DocumentVerify DOM Spec', () => {
  let fixture: ComponentFixture<DocumentVerify>;
  let component: DocumentVerify;
  let httpMock: HttpTestingController;

  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const filename = path.basename(url);
      const localPath = path.resolve(__dirname, filename);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf-8');
      }
      return '';
    });
  });

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

  it('shows live current data', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({
      valid: true,
      number: '1405-9',
      title: 'فاکتور هزینه',
      date: '1405/08/01',
      company_name: 'C',
      live: true,
      exists: true,
      current: {
        number: '1405-9',
        date: '1405/08/02',
        amount: '3000',
        status: 'پرداختشده',
      },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('وضعیت فعلی در سامانه');
    expect(text).toContain('پرداختشده');
    expect(text).toContain(new Intl.NumberFormat('fa-IR').format(3000));
    expect(text).toContain('ریال');
    expect(text).not.toContain('فرق دارد');
  });

  it('warns when the number changed', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({
      valid: true,
      number: '1405-9',
      title: 'فاکتور هزینه',
      date: '1405/08/01',
      company_name: 'C',
      live: true,
      exists: true,
      current: {
        number: '1405-10',
        date: '1405/08/02',
        amount: '3000',
        status: 'پرداختشده',
      },
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('فرق دارد');
  });

  it('shows deleted warning', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({
      valid: true,
      number: '1',
      title: 'T',
      live: true,
      exists: false,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('حذف شده است');
    expect(text).not.toContain('وضعیت فعلی در سامانه');
  });

  it('no live block when not live', () => {
    const req = httpMock.expectOne('/api/public/verify/abc%3Adef/');
    req.flush({
      valid: true,
      number: '1',
      title: 'T',
      live: false,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('وضعیت فعلی در سامانه');
    expect(text).not.toContain('حذف شده است');
  });
});
