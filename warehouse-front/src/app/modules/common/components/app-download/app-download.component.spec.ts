// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { AppDownloadComponent } from './app-download.component';
import { ConfigApiService, PublicConfig } from '../../../../core/api/config-api.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('AppDownloadComponent', () => {
  let fixture: ComponentFixture<AppDownloadComponent>;
  let component: AppDownloadComponent;
  let mockConfigApi: {
    getPublicConfig: ReturnType<typeof vi.fn>;
  };

  const sampleConfigWithUrl: PublicConfig = {
    system_version: '1.2.0',
    system_name: 'سامانه یکپارچه مدیریت شرکت‌ها',
    app_recommended_version: '1.2.0',
    app_download_urls: {
      direct: 'https://app.farsalish.ir/media/downloads/comanage.apk',
    },
  };

  const sampleConfigWithoutUrl: PublicConfig = {
    system_version: '1.2.0',
    system_name: 'سامانه یکپارچه مدیریت شرکت‌ها',
    app_recommended_version: '1.2.0',
    app_download_urls: {},
  };

  beforeEach(async () => {
    mockConfigApi = {
      getPublicConfig: vi.fn().mockReturnValue(of(sampleConfigWithUrl)),
    };

    await TestBed.configureTestingModule({
      imports: [AppDownloadComponent],
      providers: [
        provideRouter([]),
        { provide: ConfigApiService, useValue: mockConfigApi },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('the page renders without login', () => {
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(component.appName).toBe('CoManage');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('CoManage');
    expect(text).toContain('بازگشت به صفحه ورود');
  });

  it('button enabled with a URL', () => {
    mockConfigApi.getPublicConfig.mockReturnValue(of(sampleConfigWithUrl));
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('#btn-download-android') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('دانلود نسخهٔ اندروید');
  });

  it('disabled text without one', () => {
    mockConfigApi.getPublicConfig.mockReturnValue(of(sampleConfigWithoutUrl));
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('#btn-download-android') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('به‌زودی');
    expect(fixture.nativeElement.textContent).toContain('لینک دانلود هنوز منتشر نشده است');
  });

  it('shows loading text on button while config is loading', () => {
    mockConfigApi.getPublicConfig.mockReturnValue(NEVER);
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('#btn-download-android') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('در حال بارگذاری…');
  });

  it('shows error line and retry button when config request fails, and retrying re-fetches config', () => {
    mockConfigApi.getPublicConfig.mockReturnValueOnce(throwError(() => new Error('Server error')));
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('خطا در دریافت اطلاعات دانلود.');
    const retryBtn = fixture.nativeElement.querySelector('button[type="button"]:not(#btn-download-android)') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();
    expect(retryBtn.textContent).toContain('تلاش مجدد');

    mockConfigApi.getPublicConfig.mockReturnValueOnce(of(sampleConfigWithUrl));
    retryBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('خطا در دریافت اطلاعات دانلود.');
    const downloadBtn = fixture.nativeElement.querySelector('#btn-download-android') as HTMLButtonElement;
    expect(downloadBtn.disabled).toBe(false);
    expect(downloadBtn.textContent).toContain('دانلود نسخهٔ اندروید');
  });

  it('iPhone guide rendered', () => {
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Safari');
    expect(text).toContain('Share');
    expect(text).toContain('Add to Home Screen');
  });

  it('should trigger download when download button is clicked with a valid URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockConfigApi.getPublicConfig.mockReturnValue(of(sampleConfigWithUrl));
    fixture = TestBed.createComponent(AppDownloadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('#btn-download-android') as HTMLButtonElement;
    btn.click();

    expect(openSpy).toHaveBeenCalled();
    expect(openSpy.mock.calls[0][0]).toContain('comanage.apk');
  });
});
