// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject, of } from 'rxjs';
import { ApiService } from '../../../../../../core/api/api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { MY_PETTY_ACCOUNTS_KEY, MyPettyAccount, MyPettyAccountsService } from './my-petty-accounts.service';
import { EmployeePettyCashHubComponent } from './employee-petty-cash';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const row = (id: number, company: number, extra: Partial<MyPettyAccount> = {}): MyPettyAccount => ({
  id, company, company_name: `C${company}`, is_active: true, is_closed: false, role: 'custodian', ...extra
});

describe('MyPettyAccountsService (offline cache)', () => {
  let user: ReturnType<typeof signal<any>>;
  let responses: Subject<unknown>[];
  let api: { get: ReturnType<typeof vi.fn> };

  function make(): MyPettyAccountsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { user } },
      ]
    });
    return TestBed.inject(MyPettyAccountsService);
  }

  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
    });
    user = signal<any>({ id: 7 });
    responses = [];
    api = { get: vi.fn(() => { const s = new Subject<unknown>(); responses.push(s); return s; }) };
  });

  it('loads the per-user cache synchronously before the server answers', () => {
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(7), JSON.stringify([row(1, 5)]));
    const svc = make();
    expect(svc.hasAccess()).toBe(true);
    expect(svc.accounts().map(a => a.id)).toEqual([1]);
  });

  it('keeps the cached list when the request fails', () => {
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(7), JSON.stringify([row(1, 5)]));
    const svc = make();
    svc.refresh();
    expect(responses.length).toBe(1);
    responses[0].error({ status: 503 });
    expect(svc.accounts().map(a => a.id)).toEqual([1]);
    expect(JSON.parse(localStorage.getItem(MY_PETTY_ACCOUNTS_KEY(7))!)[0].id).toBe(1);
  });

  it('replaces memory and storage on a successful response (empty list too)', () => {
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(7), JSON.stringify([row(1, 5)]));
    const svc = make();
    svc.refresh();
    responses[0].next([row(2, 6, { role: 'deputy' })]);
    expect(svc.accounts().map(a => a.id)).toEqual([2]);
    expect(JSON.parse(localStorage.getItem(MY_PETTY_ACCOUNTS_KEY(7))!)[0].id).toBe(2);
    svc.refresh();
    responses[1].next([]);
    expect(svc.hasAccess()).toBe(false);
    expect(localStorage.getItem(MY_PETTY_ACCOUNTS_KEY(7))).toBe('[]');
  });

  it('ignores a malformed response and keeps the cache', () => {
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(7), JSON.stringify([row(1, 5)]));
    const svc = make();
    svc.refresh();
    responses[0].next({ detail: 'x' });
    expect(svc.accounts().map(a => a.id)).toEqual([1]);
  });

  it('logout clears memory only; another user sees only their own cache', () => {
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(7), JSON.stringify([row(1, 5)]));
    localStorage.setItem(MY_PETTY_ACCOUNTS_KEY(8), JSON.stringify([row(9, 6)]));
    const svc = make();
    user.set(null);
    expect(svc.accounts()).toEqual([]);
    expect(localStorage.getItem(MY_PETTY_ACCOUNTS_KEY(7))).not.toBeNull();
    user.set({ id: 8 });
    expect(svc.accounts().map(a => a.id)).toEqual([9]);
  });
});

describe('EmployeePettyCashHubComponent account picker', () => {
  let accounts: ReturnType<typeof signal<MyPettyAccount[]>>;
  let switchCompany: ReturnType<typeof vi.fn>;
  let toast: { show: ReturnType<typeof vi.fn> };

  function make(activeId: number): EmployeePettyCashHubComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
        { provide: MyPettyAccountsService, useValue: { accounts, hasAccess: () => accounts().length > 0 } },
        {
          provide: ActiveCompanyService, useValue: {
            activeCompanyId: activeId,
            availableCompanies: [{ id: 5, name: 'C5' }, { id: 6, name: 'C6' }],
            switchCompany
          }
        },
      ]
    });
    return TestBed.runInInjectionContext(() => new EmployeePettyCashHubComponent(
      { user: () => ({ id: 7 }), currentUser: () => ({ id: 7 }) } as any,
      {} as any, toast as any, { detectChanges: () => {} } as any,
      { queryParamMap: of(new Map()), snapshot: { queryParamMap: new Map() } } as any,
      { navigate: vi.fn() } as any
    ));
  }

  beforeEach(() => {
    accounts = signal<MyPettyAccount[]>([row(1, 5), row(2, 6, { is_active: false, is_closed: true })]);
    switchCompany = vi.fn(() => Promise.resolve(true));
    toast = { show: vi.fn() };
  });

  it('lists accounts and switches the active company for another company account', () => {
    const c = make(5);
    expect(c.myAccounts.length).toBe(2);
    expect(c.hasAccountInActiveCompany).toBe(true);
    expect(c.myAccountTitle(accounts()[1])).toContain('بسته‌شده');
    c.switchToAccount(accounts()[0]);
    expect(switchCompany).not.toHaveBeenCalled();
    c.switchToAccount(accounts()[1]);
    expect(switchCompany).toHaveBeenCalledWith({ id: 6, name: 'C6' });
  });

  it('no account in the active company: offers the other companies', () => {
    accounts.set([row(2, 6, { role: 'deputy' })]);
    const c = make(5);
    expect(c.hasAccountInActiveCompany).toBe(false);
    expect(c.otherCompanyAccounts.map(a => a.id)).toEqual([2]);
    expect(c.myAccountTitle(accounts()[0])).toContain('جانشین');
  });

  it('warns instead of switching when the company is not in the user list', () => {
    accounts.set([row(3, 99)]);
    const c = make(5);
    c.switchToAccount(accounts()[0]);
    expect(switchCompany).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('warning', expect.any(String));
  });
});
