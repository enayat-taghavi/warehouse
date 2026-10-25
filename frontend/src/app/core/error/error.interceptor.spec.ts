import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { errorInterceptor, SKIP_GLOBAL_ERROR_TOAST } from './error.interceptor';
import { ToastService } from '../../shared/components/toast/toast.component';
import { AuthStore } from '../stores/auth.store';

describe('errorInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let toastService: { show: ReturnType<typeof vi.fn> };
  let simulatedTime = Date.now();

  beforeEach(() => {
    simulatedTime += 10000;
    vi.useFakeTimers({ now: simulatedTime });
    toastService = { show: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toastService },
        { provide: AuthStore, useValue: { setActiveWarehouse: vi.fn() } },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  it('1. GET with 502 shows one warning, no error', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(null, { status: 502, statusText: 'Bad Gateway' });

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'warning',
      'ارتباط با سرور برقرار نیست؛ اطلاعات تازه پس از برقراری اتصال نمایش داده می‌شود.'
    );
    expect(toastService.show).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('2. GET with status 0 shows a warning, no error', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.error(new ProgressEvent('error'));

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'warning',
      'ارتباط با سرور برقرار نیست؛ اطلاعات تازه پس از برقراری اتصال نمایش داده می‌شود.'
    );
    expect(toastService.show).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('3. GET with 530 twice within 3 seconds shows one warning', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.get('/api/test-1').subscribe({
      error: () => {},
    });
    const req1 = httpMock.expectOne('/api/test-1');
    req1.flush(null, { status: 530, statusText: 'Cloudflare 530' });

    httpClient.get('/api/test-2').subscribe({
      error: () => {},
    });
    const req2 = httpMock.expectOne('/api/test-2');
    req2.flush(null, { status: 530, statusText: 'Cloudflare 530' });

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'warning',
      'ارتباط با سرور برقرار نیست؛ اطلاعات تازه پس از برقراری اتصال نمایش داده می‌شود.'
    );
    expect(toastService.show).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('4. POST with 503 still shows the red unreachable error', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.post('/api/test', {}).subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'error',
      'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.'
    );
  });

  it('5. GET with 403 shows the permission error', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(null, { status: 403, statusText: 'Forbidden' });

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'error',
      'شما مجوز دسترسی به این عملیات را ندارید.'
    );
  });

  it('6. GET with 500 shows the internal server error', () => {
    vi.setSystemTime(Date.now() + 10000);
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(null, { status: 500, statusText: 'Internal Server Error' });

    expect(toastService.show).toHaveBeenCalledTimes(1);
    expect(toastService.show).toHaveBeenCalledWith(
      'error',
      'خطای داخلی سرور. لطفا با پشتیبانی تماس بگیرید.'
    );
  });

  it('7. GET with SKIP_GLOBAL_ERROR_TOAST shows nothing', () => {
    vi.setSystemTime(Date.now() + 10000);
    const context = new HttpContext().set(SKIP_GLOBAL_ERROR_TOAST, true);
    httpClient.get('/api/test', { context }).subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(null, { status: 502, statusText: 'Bad Gateway' });

    expect(toastService.show).not.toHaveBeenCalled();
  });
});
