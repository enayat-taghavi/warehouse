// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { ModuleRegistryService } from '../../../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyApiService: نشانی هسته یا حسابداری بر پایهٔ ماژول نصب‌شده', () => {
  let http: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let accountingInstalled: boolean;
  let api: CompanyApiService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    accountingInstalled = true;
    http = {
      get: vi.fn().mockReturnValue(of([])),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn().mockReturnValue(of({})),
      patch: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        CompanyApiService,
        { provide: HttpClient, useValue: http },
        {
          provide: ModuleRegistryService,
          useValue: {
            isModuleInstalled: (code: string) => code === 'accounting' && accountingInstalled,
            getExtensions: (point: string) => {
              if (point === 'companyApiEndpoints' && accountingInstalled) {
                return [{
                  moduleCode: 'accounting',
                  extension: {
                    companiesEndpoint: '/personnel/companies',
                    accessEndpoint: '/personnel/user-company-access',
                    documentsEndpoint: '/personnel/company-documents',
                    bankAccountsEndpoint: '/personnel/company-bank-accounts',
                    boardMembersEndpoint: '/personnel/company-board-members',
                    fiscalPeriodsEndpoint: '/personnel/company-fiscal-periods',
                    companyGdriveBaseEndpoint: (cid: any) => '/personnel/companies/' + cid + '/gdrive'
                  }
                }];
              }
              return [];
            }
          }
        },
      ],
    });
    api = TestBed.inject(CompanyApiService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
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
      for (const m of [http.get, http.post, http.put, http.patch, http.delete]) m.mockClear();
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

  it('با افزونهٔ حسابداری، چهار نقطهٔ انتهایی فرعی و getCompanyGdriveUrl برابر نشانی‌های قبلی هستند', () => {
    api.getDocuments({ company_id: 1 }).subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/personnel\/company-documents\/$/);
    expect(http.get.mock.calls[0][1].params.get('company_id')).toBe('1');

    http.get.mockClear();
    api.getBankAccounts(2).subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/personnel\/company-bank-accounts\/$/);
    expect(http.get.mock.calls[0][1].params.get('company_id')).toBe('2');

    http.get.mockClear();
    api.getBoardMembers(3).subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/personnel\/company-board-members\/$/);
    expect(http.get.mock.calls[0][1].params.get('company_id')).toBe('3');

    http.get.mockClear();
    api.getFiscalPeriods(4).subscribe();
    expect(http.get.mock.calls[0][0]).toMatch(/\/personnel\/company-fiscal-periods\/$/);
    expect(http.get.mock.calls[0][1].params.get('company_id')).toBe('4');

    const gdriveUrl = api.getCompanyGdriveUrl(5, '/queue/');
    expect(gdriveUrl).toMatch(/\/personnel\/companies\/5\/gdrive\/queue\/$/);
  });

  it('بدون افزونهٔ حسابداری، متدها خطا می‌دهند و هیچ درخواست HTTP ارسال نمی‌شود', () => {
    accountingInstalled = false;
    for (const m of [http.get, http.post, http.put, http.patch, http.delete]) m.mockClear();

    let errCount = 0;
    const expectError = (obs: any) => {
      obs.subscribe({
        next: () => {
          throw new Error('should not succeed');
        },
        error: (err: Error) => {
          expect(err.message).toBe('accounting-module-not-installed');
          errCount++;
        }
      });
    };

    expectError(api.getDocuments());
    expectError(api.createDocument(new FormData()));
    expectError(api.deleteDocument(1));
    expectError(api.downloadDocument(1));

    expectError(api.getBankAccounts(1));
    expectError(api.createBankAccount({}));
    expectError(api.updateBankAccount(1, {}));
    expectError(api.deleteBankAccount(1));
    expectError(api.setPrimaryBankAccount(1));

    expectError(api.getBoardMembers(1));
    expectError(api.createBoardMember({}));
    expectError(api.updateBoardMember(1, {}));
    expectError(api.deleteBoardMember(1));

    expectError(api.getFiscalPeriods(1));
    expectError(api.createFiscalPeriod({}));
    expectError(api.closeFiscalPeriod(1));
    expectError(api.freezeFiscalPeriod(1));
    expectError(api.reopenFiscalPeriod(1));

    expect(errCount).toBe(18);
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
    expect(http.patch).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
    expect(api.getCompanyGdriveUrl(5, '/queue/')).toBeNull();
  });

  it('matchesCompanyUrl برای هر چهار نوع منابع شرکت به درستی ارزیابی می‌شود', () => {
    // با نصب حسابداری
    expect(api.matchesCompanyUrl('/personnel/companies/1/', 'companies')).toBe(true);
    expect(api.matchesCompanyUrl('/org/companies/1/', 'companies')).toBe(true);
    expect(api.matchesCompanyUrl('/other/path/', 'companies')).toBe(false);

    expect(api.matchesCompanyUrl('/personnel/company-bank-accounts/?company_id=1', 'bankAccounts')).toBe(true);
    expect(api.matchesCompanyUrl('/org/companies/1/', 'bankAccounts')).toBe(false);

    expect(api.matchesCompanyUrl('/personnel/company-board-members/?company_id=1', 'boardMembers')).toBe(true);
    expect(api.matchesCompanyUrl('/org/companies/1/', 'boardMembers')).toBe(false);

    expect(api.matchesCompanyUrl('/personnel/company-documents/?company_id=1', 'documents')).toBe(true);
    expect(api.matchesCompanyUrl('/org/companies/1/', 'documents')).toBe(false);

    // بدون نصب حسابداری
    accountingInstalled = false;
    expect(api.matchesCompanyUrl('/org/companies/1/', 'companies')).toBe(true);
    expect(api.matchesCompanyUrl('/personnel/companies/1/', 'companies')).toBe(false);
    expect(api.matchesCompanyUrl('/personnel/company-bank-accounts/', 'bankAccounts')).toBe(false);
    expect(api.matchesCompanyUrl('/personnel/company-board-members/', 'boardMembers')).toBe(false);
    expect(api.matchesCompanyUrl('/personnel/company-documents/', 'documents')).toBe(false);
  });
});

