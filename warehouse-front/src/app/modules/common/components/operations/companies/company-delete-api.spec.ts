// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';
import { SKIP_OFFLINE } from '../../../../../core/interceptors/offline.interceptor';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyApiService: حذف شرکت (گام ۸، ت۹)', () => {
  let api: CompanyApiService;
  let httpDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpDelete = vi.fn().mockReturnValue(of(void 0));
    TestBed.configureTestingModule({
      providers: [
        CompanyApiService,
        { provide: HttpClient, useValue: { delete: httpDelete } },
        { provide: ModuleRegistryService, useValue: { getExtensions: () => [] } }
      ]
    });
    api = TestBed.inject(CompanyApiService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('حذف آبشاری هرگز در صف آفلاین نمی‌رود (SKIP_OFFLINE) و اثرِ نشان‌داده‌شده را می‌فرستد', () => {
    api.delete(7, 14).subscribe();
    const [url, options] = httpDelete.mock.calls[0] as [string, { params: HttpParams; context: HttpContext }];
    expect(url).toMatch(/\/org\/companies\/7\/$/);
    expect(options.context.get(SKIP_OFFLINE)).toBe(true);
    expect(options.params.get('expected_total')).toBe('14');
  });

  it('بدون اثر، پارامتر expected_total فرستاده نمی‌شود ولی SKIP_OFFLINE می‌ماند', () => {
    api.delete(7).subscribe();
    const [, options] = httpDelete.mock.calls[0] as [string, { params: HttpParams; context: HttpContext }];
    expect(options.params.has('expected_total')).toBe(false);
    expect(options.context.get(SKIP_OFFLINE)).toBe(true);
  });

  it('نشانی اثر حذف از همان منبع شرکت ساخته می‌شود', () => {
    expect(api.deleteImpactUrl(7)).toMatch(/\/org\/companies\/7\/delete_impact\/$/);
  });
});
