// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
