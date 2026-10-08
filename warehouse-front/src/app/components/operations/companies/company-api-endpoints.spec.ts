import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { ModuleRegistryService } from '../../../core/modules/module-registry.service';

describe('CompanyApiService: نشانی هسته یا حسابداری بر پایهٔ ماژول نصب‌شده', () => {
  let http: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let accountingInstalled: boolean;
  let api: CompanyApiService;

  beforeEach(() => {
    accountingInstalled = true;
    http = {
      get: vi.fn().mockReturnValue(of([])),
      post: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        CompanyApiService,
        { provide: HttpClient, useValue: http },
        { provide: ModuleRegistryService, useValue: { isModuleInstalled: (code: string) => code === 'accounting' && accountingInstalled } },
      ],
    });
    api = TestBed.inject(CompanyApiService);
  });

  it('در نصب «فقط انبار» فهرست و دسترس‌پذیری شرکت از /org/companies خوانده می‌شود', () => {
    accountingInstalled = false;
    api.getAll().subscribe();
    api.getUserAvailable('all').subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/org\/companies\/$/);
    expect(http.get.mock.calls[1][0]).toMatch(/\/org\/companies\/user-available\/$/);
    expect(http.get.mock.calls.some(c => String(c[0]).includes('/personnel/'))).toBe(false);
  });

  it('با نصب حسابداری، نسخهٔ کامل حسابداری (/personnel/companies) خوانده می‌شود', () => {
    api.getById(3).subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/personnel\/companies\/3\/$/);
  });

  it('دسترسی کاربر به شرکت: با حسابداری مسیر قبلی (کش و صف آفلاین دست نخورد)، بدون آن مسیر هسته', () => {
    const urlsFor = (installed: boolean): string[] => {
      accountingInstalled = installed;
      for (const m of [http.get, http.post, http.patch, http.delete]) m.mockClear();
      api.getUserAccesses({ company_id: 1 }).subscribe();
      api.createUserAccess({ user: 1, company: 1 }).subscribe();
      api.updateUserAccess(7, {}).subscribe();
      api.deleteUserAccess(7).subscribe();
      return [http.get, http.post, http.patch, http.delete].flatMap(m => m.mock.calls.map(c => String(c[0])));
    };
    const withAccounting = urlsFor(true);
    const warehouseOnly = urlsFor(false);
    expect(withAccounting.length).toBe(4);
    expect(withAccounting.every(u => u.includes('/personnel/user-company-access/'))).toBe(true);
    expect(warehouseOnly.length).toBe(4);
    expect(warehouseOnly.every(u => u.includes('/org/user-company-access/'))).toBe(true);
  });
});
