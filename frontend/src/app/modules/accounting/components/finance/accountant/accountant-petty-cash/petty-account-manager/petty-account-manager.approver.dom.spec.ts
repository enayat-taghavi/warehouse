// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵresolveComponentResources } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

import { PettyAccountManagerComponent } from './petty-account-manager';
import { TreasuryOrgApiService } from '../../../../../api/treasury-org-api.service';
import { AuthService } from '../../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../../shared/components/toast/toast.component';
import { ActiveCompanyService } from '../../../../../../../core/services/active-company.service';
import { NetworkStatusService } from '../../../../../../../core/services/network-status.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('PettyAccountManagerComponent Approver DOM Specs', () => {
  let fixture: ComponentFixture<PettyAccountManagerComponent>;
  let component: PettyAccountManagerComponent;
  let mockApi: any;
  let mockAuth: any;
  let mockToast: any;
  let mockActiveCompany: any;
  let promptSpy: ReturnType<typeof vi.spyOn>;

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
    promptSpy = vi.spyOn(window, 'prompt');

    mockApi = {
      getPettyCashAccounts: vi.fn().mockReturnValue(of([
        {
          id: 11,
          company: 3,
          custodian: 5,
          custodian_name: 'Ali',
          ceiling_amount: 50000000,
          opening_balance: 0,
          debt: 2000000,
          is_closed: false
        },
        {
          id: 12,
          company: 3,
          custodian: 6,
          custodian_name: 'Sara',
          ceiling_amount: 10000000,
          debt: 0,
          is_closed: true
        }
      ])),
      getPettyCashBalance: vi.fn().mockReturnValue(of({
        current_balance: 3000000,
        debt: 2000000,
        payroll_deduction_available: false,
        ceiling_amount: 50000000
      })),
      getPettyCashSettlements: vi.fn().mockReturnValue(of([])),
      getPettyCashReconciliations: vi.fn().mockReturnValue(of([])),
      getPettyCashTransactions: vi.fn().mockReturnValue(of([])),
      createPettyCashAccount: vi.fn().mockReturnValue(of({ id: 13 })),
      updatePettyCashAccount: vi.fn().mockReturnValue(of({ id: 11 })),
      createPettyCashSettlement: vi.fn().mockReturnValue(of({ id: 21 })),
      voidPettyCashSettlement: vi.fn().mockReturnValue(of({ id: 21, status: 'void' })),
      createPettyCashReconciliation: vi.fn().mockReturnValue(of({ id: 31, result: 'balanced' })),
      closePettyCashAccount: vi.fn().mockReturnValue(of({ id: 11, is_closed: true })),
      handoverPettyCashAccount: vi.fn().mockReturnValue(of({ old_account_id: 11, new_account_id: 13 }))
    };

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue(['perm_petty_cash_manage'])
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockActiveCompany = {
      activeCompanyId: 3,
      availableCompanies: [{ id: 3, name: 'شرکت اصلی', code: 'C1' }]
    };

    vi.spyOn(NetworkStatusService.getInstance(), 'isOnline', 'get').mockReturnValue(true);

    await TestBed.configureTestingModule({
      imports: [PettyAccountManagerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TreasuryOrgApiService, useValue: mockApi },
        { provide: AuthService, useValue: mockAuth },
        { provide: ToastService, useValue: mockToast },
        { provide: ActiveCompanyService, useValue: mockActiveCompany }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PettyAccountManagerComponent);
    component = fixture.componentInstance;
    component.isOnline = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    expect(promptSpy).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
  });

  it('a) openCreate(): the form modal renders two app-person-role-picker elements (custodian and approver) and the label text «سرپرست تأییدکننده»', () => {
    component.openCreate();
    fixture.detectChanges();

    const pickers = fixture.nativeElement.querySelectorAll('app-person-role-picker');
    expect(pickers.length).toBe(2);

    const custodianPicker = fixture.nativeElement.querySelector('app-person-role-picker[name="custodian"]');
    expect(custodianPicker).not.toBeNull();

    const approverPicker = fixture.nativeElement.querySelector('app-person-role-picker[name="approver"]');
    expect(approverPicker).not.toBeNull();

    expect(fixture.nativeElement.textContent).toContain('سرپرست تأییدکننده');
  });

  it('b) create with a custodian and an approver (id 7): createPettyCashAccount is called with a body whose approver is 7', () => {
    component.openCreate();
    fixture.detectChanges();

    component.form.companyId = 3;
    component.custodianPick = [{ type: 'user', id: 5, label: 'Ali' }];
    component.approverPick = [{ type: 'user', id: 7, label: 'Sara' }];

    component.saveAccount();
    fixture.detectChanges();

    expect(mockApi.createPettyCashAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        approver: 7,
        custodian: 5
      })
    );
  });

  it('c) openEdit of an account with approver: 7, approver_name: "Sara": approverPick holds one value with id 7 and label "Sara"; saving without change calls updatePettyCashAccount with a body that has NO approver key; after setting approverPick = [] and saving, the body has approver: null', () => {
    const accountWithApprover = {
      id: 11,
      company: 3,
      custodian: 5,
      custodian_name: 'Ali',
      ceiling_amount: 50000000,
      opening_balance: 0,
      debt: 2000000,
      is_closed: false,
      approver: 7,
      approver_name: 'Sara'
    };

    component.openEdit(accountWithApprover as any);
    fixture.detectChanges();

    expect(component.approverPick).toEqual([{ type: 'user', id: 7, label: 'Sara' }]);

    // Saving without change: no approver key
    mockApi.updatePettyCashAccount.mockClear();
    component.saveAccount();
    fixture.detectChanges();

    expect(mockApi.updatePettyCashAccount).toHaveBeenCalled();
    const firstCallBody = mockApi.updatePettyCashAccount.mock.calls[0][1];
    expect('approver' in firstCallBody).toBe(false);

    // After setting approverPick = [] and saving: approver: null
    component.openEdit(accountWithApprover as any);
    fixture.detectChanges();
    mockApi.updatePettyCashAccount.mockClear();
    component.approverPick = [];
    component.saveAccount();
    fixture.detectChanges();

    expect(mockApi.updatePettyCashAccount).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        approver: null
      })
    );
  });

  it('d) server error { status: 400, error: { code: "approver_pending", error: "x" } } on update: the modal error text is «اول سندهای منتظر سرپرست تمام شوند.»', () => {
    mockApi.updatePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 400,
      error: { code: 'approver_pending', error: 'x' }
    })));

    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openEdit(acc11);
    fixture.detectChanges();

    component.approverPick = [{ type: 'user', id: 7, label: 'Sara' }];
    component.saveAccount();
    fixture.detectChanges();

    expect(component.modalError).toBe('اول سندهای منتظر سرپرست تمام شوند.');
    const alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('اول سندهای منتظر سرپرست تمام شوند.');
  });

  it('e) server error { status: 403, error: { detail: "Server says no" } } on update: the modal error text is Server says no (not the generic text «اجازهٔ این کار را ندارید.»); and { status: 403, error: {} } shows «اجازهٔ این کار را ندارید.»', () => {
    const acc11 = component.accounts.find(a => a.id === 11)!;

    // 1) 403 with custom detail: 'Server says no'
    mockApi.updatePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 403,
      error: { detail: 'Server says no' }
    })));

    component.openEdit(acc11);
    fixture.detectChanges();

    component.approverPick = [{ type: 'user', id: 7, label: 'Sara' }];
    component.saveAccount();
    fixture.detectChanges();

    expect(component.modalError).toBe('Server says no');
    expect(component.modalError).not.toBe('اجازهٔ این کار را ندارید.');
    let alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('Server says no');

    // 2) 403 with empty error object: shows 'اجازهٔ این کار را ندارید.'
    mockApi.updatePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 403,
      error: {}
    })));

    component.saveAccount();
    fixture.detectChanges();

    expect(component.modalError).toBe('اجازهٔ این کار را ندارید.');
    alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('اجازهٔ این کار را ندارید.');
  });

  it('f) server error { status: 400, error: { approver: ["Approver bad"] } }: the modal error text is Approver bad', () => {
    mockApi.updatePettyCashAccount.mockReturnValue(throwError(() => ({
      status: 400,
      error: { approver: ['Approver bad'] }
    })));

    const acc11 = component.accounts.find(a => a.id === 11)!;
    component.openEdit(acc11);
    fixture.detectChanges();

    component.approverPick = [{ type: 'user', id: 7, label: 'Sara' }];
    component.saveAccount();
    fixture.detectChanges();

    expect(component.modalError).toBe('Approver bad');
    const alertEl = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('Approver bad');
  });

  it('g) an account with approver_name: "Sara" shows the text «سرپرست:» and Sara on its card; an account without approver_name shows no «سرپرست:» text', () => {
    component.accounts = [
      {
        id: 21,
        company: 3,
        custodian: 5,
        custodian_name: 'Ali',
        ceiling_amount: 50000000,
        opening_balance: 0,
        debt: 0,
        is_closed: false,
        approver: 7,
        approver_name: 'Sara'
      },
      {
        id: 22,
        company: 3,
        custodian: 6,
        custodian_name: 'Reza',
        ceiling_amount: 10000000,
        debt: 0,
        is_closed: false
      }
    ] as any;
    fixture.detectChanges();

    const articles = fixture.nativeElement.querySelectorAll('article');
    expect(articles.length).toBe(2);

    expect(articles[0].textContent).toContain('سرپرست:');
    expect(articles[0].textContent).toContain('Sara');

    expect(articles[1].textContent).not.toContain('سرپرست:');
  });

  it('h) inputs: with showHeaderActions = false no [appAction="refresh"] and no [appAction="create"] button is rendered (default true renders both); with role = "manager" the row has no button with aria-label «تسویهٔ بدهی» or «تطبیق نقد» but keeps «تحویل حساب» and «بستن حساب»; with the default role both «تسویهٔ بدهی» and «تطبیق نقد» exist', () => {
    // 1) showHeaderActions default is true -> both buttons exist
    expect(component.showHeaderActions).toBe(true);
    expect(fixture.nativeElement.querySelector('button[appAction="refresh"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[appAction="create"]')).not.toBeNull();

    // with showHeaderActions = false -> neither rendered
    component.showHeaderActions = false;
    fixture.componentRef.setInput('showHeaderActions', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[appAction="refresh"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[appAction="create"]')).toBeNull();

    // 2) role checks on open account card (account 11)
    let openRow = fixture.nativeElement.querySelector('article');
    expect(openRow).not.toBeNull();

    // Default role ('accountant'): both «تسویهٔ بدهی» and «تطبیق نقد» exist
    expect(component.role).toBe('accountant');
    expect(openRow.querySelector('[aria-label="تسویهٔ بدهی"]')).not.toBeNull();
    expect(openRow.querySelector('[aria-label="تطبیق نقد"]')).not.toBeNull();
    expect(openRow.querySelector('[aria-label="تحویل حساب"]')).not.toBeNull();
    expect(openRow.querySelector('[aria-label="بستن حساب"]')).not.toBeNull();

    // With role = 'manager': no «تسویهٔ بدهی» or «تطبیق نقد», but keeps «تحویل حساب» and «بستن حساب»
    component.role = 'manager';
    fixture.componentRef.setInput('role', 'manager');
    fixture.detectChanges();
    openRow = fixture.nativeElement.querySelector('article');
    expect(openRow.querySelector('[aria-label="تسویهٔ بدهی"]')).toBeNull();
    expect(openRow.querySelector('[aria-label="تطبیق نقد"]')).toBeNull();
    expect(openRow.querySelector('[aria-label="تحویل حساب"]')).not.toBeNull();
    expect(openRow.querySelector('[aria-label="بستن حساب"]')).not.toBeNull();
  });
});
