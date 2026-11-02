// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PrintService } from './print.service';
import { FileOutputService } from '../platform/file-output';
import { ToastService } from '../../shared/components/toast/toast.component';
import { NetworkStatusService } from './network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PrintService', () => {
  let service: PrintService;
  let httpMock: HttpTestingController;
  let fakeFileOutput: { saveBlob: ReturnType<typeof vi.fn>; shareBlob: ReturnType<typeof vi.fn> };
  let fakeToast: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    TestBed.resetTestingModule();
    fakeFileOutput = {
      saveBlob: vi.fn().mockResolvedValue(undefined),
      shareBlob: vi.fn().mockResolvedValue('shared'),
    };
    fakeToast = {
      error: vi.fn(),
      success: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PrintService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FileOutputService, useValue: fakeFileOutput },
        { provide: ToastService, useValue: fakeToast },
      ],
    });

    service = TestBed.inject(PrintService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    httpMock.verify();
  });

  it('downloads pdf and saves blob', async () => {
    const promise = service.downloadPdf('zz_doc', 7, 'A5');

    const req = httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/') && (r.urlWithParams.includes('size=A5') || r.url.includes('size=A5')));
    expect(req.request.responseType).toBe('blob');

    const blob = new Blob(['%PDF']);
    req.flush(blob);

    const result = await promise;
    expect(result).toBe(true);
    expect(fakeFileOutput.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'zz_doc-7.pdf');
  });

  it('404 shows not available toast', async () => {
    const promise = service.downloadPdf('zz_doc', 7, 'A5');

    const req = httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/'));
    req.flush(new Blob(['']), { status: 404, statusText: 'Not Found' });

    const result = await promise;
    expect(result).toBe(false);
    expect(fakeToast.error).toHaveBeenCalledWith('سند برای چاپ در دسترس نیست');
    expect(fakeFileOutput.saveBlob).not.toHaveBeenCalled();
  });

  it('server unreachable shows offline toast', async () => {
    const promise = service.downloadPdf('zz_doc', 7, 'A5');

    const req = httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/'));
    req.flush(new Blob(['']), { status: 530, statusText: 'Origin Error' });

    const result = await promise;
    expect(result).toBe(false);
    expect(fakeToast.error).toHaveBeenCalledWith('اتصال به سرور برقرار نیست؛ چاپ در حالت آفلاین ممکن نیست');
  });

  it('offline does not send request', async () => {
    vi.spyOn(NetworkStatusService.getInstance(), 'isBrowserOnline', 'get').mockReturnValue(false);

    const result = await service.downloadPdf('zz_doc', 7, 'A5');

    expect(result).toBe(false);
    httpMock.expectNone(() => true);
    expect(fakeToast.error).toHaveBeenCalledOnce();
    expect(fakeToast.error).toHaveBeenCalledWith('اتصال به سرور برقرار نیست؛ چاپ در حالت آفلاین ممکن نیست');
  });

  it('other error shows generic toast', async () => {
    const promise = service.downloadPdf('zz_doc', 7, 'A5');

    const req = httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/'));
    req.flush(new Blob(['']), { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result).toBe(false);
    expect(fakeToast.error).toHaveBeenCalledWith('ساخت فایل PDF ناموفق بود');
  });
  it('sharePdf fetches the pdf and hands it to the share sheet', async () => {
    const promise = service.sharePdf('zz_doc', 7, 'receipt-7.pdf');

    const req = httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/'));
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']));

    expect(await promise).toBe(true);
    expect(fakeFileOutput.shareBlob).toHaveBeenCalledWith(expect.any(Blob), 'receipt-7.pdf');
    expect(fakeFileOutput.saveBlob).not.toHaveBeenCalled();
  });

  it('sharePdf share error shows no second toast', async () => {
    fakeFileOutput.shareBlob.mockRejectedValue(new Error('boom'));
    const promise = service.sharePdf('zz_doc', 7);

    httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/')).flush(new Blob(['%PDF']));

    expect(await promise).toBe(false);
    expect(fakeFileOutput.shareBlob).toHaveBeenCalledWith(expect.any(Blob), 'zz_doc-7.pdf');
    expect(fakeToast.error).not.toHaveBeenCalled();
  });

  it('sharePdf 404 shows not available toast and shares nothing', async () => {
    const promise = service.sharePdf('zz_doc', 7);

    httpMock.expectOne((r) => r.url.includes('/api/print/zz_doc/7/pdf/'))
      .flush(new Blob(['']), { status: 404, statusText: 'Not Found' });

    expect(await promise).toBe(false);
    expect(fakeFileOutput.shareBlob).not.toHaveBeenCalled();
    expect(fakeToast.error).toHaveBeenCalledOnce();
  });
});
