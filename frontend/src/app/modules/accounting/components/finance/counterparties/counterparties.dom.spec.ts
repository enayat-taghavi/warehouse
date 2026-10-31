// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵɵdirectiveInject, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';

import { CounterpartiesComponent } from './counterparties';
import { ExcelImportModal } from '../../../../../shared/components/excel-import-modal/excel-import-modal';
import { AuthService } from '../../../../../core/auth/auth.service';
import { StateService } from '../../../../../core/services/state.service';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import { Counterparty, PartyBankAccount } from '../../../models/personnel.model';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CounterpartiesComponent DOM Spec (Release v1 step 3.1-c: bank-accounts sub-list, masked state)', () => {
  let fixture: ComponentFixture<CounterpartiesComponent>;
  let component: CounterpartiesComponent;
  let mockAuth: any;
  let mockState: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockRoute: any;
  let mockRouter: any;
  let mockActiveCompany: any;

  beforeAll(() => {
    Object.defineProperty(CounterpartiesComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || CounterpartiesComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(StateService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(WebSocketService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActiveCompanyService, 8)
        );
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(ExcelImportModal, 'ɵfac', {
      value: function(t: any) {
        return new (t || ExcelImportModal)(
          ɵɵdirectiveInject(ChangeDetectorRef)
        );
      },
      configurable: true,
      writable: true
    });

    let localStore: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => localStore[key] || null,
      setItem: (key: string, val: string) => { localStore[key] = String(val); },
      removeItem: (key: string) => { delete localStore[key]; },
      clear: () => { localStore = {}; },
      get length() { return Object.keys(localStore).length; },
      key: (i: number) => Object.keys(localStore)[i] || null
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      });
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: mockLocalStorage,
        writable: true,
        configurable: true
      });
    }

    window.scrollTo = vi.fn();

    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined)
        },
        writable: true,
        configurable: true
      });
    } else {
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    }
  });

  beforeEach(async () => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    mockState = {
      activeWarehouse: vi.fn().mockReturnValue({ id: 1, name: 'انبار مرکزی' })
    };

    mockPersonnelApi = {
      getCounterparties: vi.fn().mockReturnValue(of([])),
      createCounterparty: vi.fn().mockImplementation((data: any) => of({ id: 101, ...data })),
      updateCounterparty: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteCounterparty: vi.fn().mockReturnValue(of({ success: true })),
      getPartyBankAccounts: vi.fn().mockReturnValue(of([])),
      createPartyBankAccount: vi.fn().mockImplementation((data: any) => of({ id: 501, ...data })),
      updatePartyBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deletePartyBankAccount: vi.fn().mockReturnValue(of({ success: true })),
      exportCounterpartiesExcel: vi.fn().mockReturnValue(of(new Blob(['excel']))),
      downloadCounterpartiesTemplate: vi.fn().mockReturnValue(of(new Blob(['template']))),
      importCounterpartiesExcel: vi.fn().mockReturnValue(of({ success: true }))
    };

    mockWs = {
      connect: vi.fn(),
      notifications$: new Subject<any>(),
      connected$: of(true),
      tabId: 'test-tab-id'
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockRoute = {
      queryParams: of({})
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockActiveCompany = {
      activeCompanyId: 1
    };

    await TestBed.configureTestingModule({
      imports: [CounterpartiesComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: StateService, useValue: mockState },
        { provide: PersonnelApiService, useValue: mockPersonnelApi },
        { provide: WebSocketService, useValue: mockWs },
        { provide: ToastService, useValue: mockToast },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: ActiveCompanyService, useValue: mockActiveCompany }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CounterpartiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('نمایش دکمه کپی شماره شبا برای طرف‌حساب عادی در نمای جدول', () => {
    const unmaskedCp: Counterparty = {
      id: 1,
      name: 'فروشگاه آذرخش',
      counterparty_type: 'repair_shop',
      sheba_number: '450120000000101111111001',
      bank_masked: false,
      is_active: true
    };

    component.counterparties = [unmaskedCp];
    component.isLoading = false;
    component.viewMode = 'table';
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector('table button[title="کپی شماره شبا (بدون IR)"]');
    expect(copyBtn).not.toBeNull();
  });

  it('عدم نمایش دکمه کپی شماره شبا برای طرف‌حساب masked با bank_masked: true و شبای ستاره‌دار در نمای جدول', () => {
    const maskedCp: Counterparty = {
      id: 2,
      name: 'فروشگاه پارس',
      counterparty_type: 'repair_shop',
      sheba_number: '********************1001',
      bank_masked: true,
      is_active: true
    };

    component.counterparties = [maskedCp];
    component.isLoading = false;
    component.viewMode = 'table';
    fixture.detectChanges();

    const maskedCopyBtn = fixture.nativeElement.querySelector('table button[title="کپی شماره شبا (بدون IR)"]');
    expect(maskedCopyBtn).toBeNull();
  });

  it('فراخوانی editCounterparty با party: 7 باید getPartyBankAccounts(7) را صدا زده و حساب‌ها را با برچسب اصلی رندر کند', () => {
    const cp: Counterparty = {
      id: 10,
      party: 7,
      name: 'شرکت راهبر',
      counterparty_type: 'contractor',
      is_active: true
    };
    const accounts: PartyBankAccount[] = [
      { id: 101, party: 7, bank_name: 'بانک ملت', sheba_number: 'IR450120000000101111111001', is_primary: true },
      { id: 102, party: 7, bank_name: 'بانک تجارت', sheba_number: 'IR560180000000202222222002', is_primary: false }
    ];
    mockPersonnelApi.getPartyBankAccounts.mockReturnValue(of(accounts));

    component.editCounterparty(cp);
    fixture.detectChanges();

    expect(mockPersonnelApi.getPartyBankAccounts).toHaveBeenCalledWith(7);
    const section = fixture.nativeElement.querySelector('section[aria-labelledby="cp-bank-list-title"]');
    expect(section).not.toBeNull();
    const items = section.querySelectorAll('ul li');
    expect(items.length).toBe(2);

    const primaryBadge = items[0].querySelector('span.text-emerald-700');
    expect(primaryBadge).not.toBeNull();
    expect(primaryBadge.textContent).toContain('اصلی');

    const nonPrimaryBadge = items[1].querySelector('span.text-emerald-700');
    expect(nonPrimaryBadge).toBeNull();
  });

  it('در ویرایش طرف‌حساب masked دکمه‌های کپی زیرفهرست مخفی شده و فیلد کد ملی readonly می‌شود', () => {
    const cpMasked: Counterparty = {
      id: 20,
      party: 7,
      name: 'شخص پوشیده',
      counterparty_type: 'driver',
      national_id: '******5678',
      bank_masked: true,
      is_active: true
    };
    const accounts: PartyBankAccount[] = [
      { id: 201, party: 7, bank_name: 'بانک سامان', sheba_number: '********************1001', is_primary: true }
    ];
    mockPersonnelApi.getPartyBankAccounts.mockReturnValue(of(accounts));

    component.editCounterparty(cpMasked);
    fixture.detectChanges();

    expect(component.isEditingMasked).toBe(true);
    const subCopyBtn = fixture.nativeElement.querySelector('section[aria-labelledby="cp-bank-list-title"] button[aria-label="کپی شبا"]');
    expect(subCopyBtn).toBeNull();

    const nationalIdInput = fixture.nativeElement.querySelector('input[name="national_id"]') as HTMLInputElement;
    expect(nationalIdInput).not.toBeNull();
    expect(nationalIdInput.readOnly).toBe(true);
  });

  it('متد addBankAccount پس از onShebaInput باید createPartyBankAccount را با is_primary متناسب با خالی بودن لیست فراخوانی کند', () => {
    component.editingCounterparty = {
      id: 10,
      party: 7,
      name: 'طرف‌حساب',
      counterparty_type: 'other',
      is_active: true
    };
    component.bankAccounts = [];
    mockPersonnelApi.createPartyBankAccount.mockReturnValue(of({ id: 999 }));

    component.cpForm.onShebaInput('450120000000101111111001');
    component.addBankAccount();

    expect(mockPersonnelApi.createPartyBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        party: 7,
        sheba_number: 'IR450120000000101111111001',
        is_primary: true
      })
    );

    mockPersonnelApi.createPartyBankAccount.mockClear();
    component.editingCounterparty = {
      id: 10,
      party: 7,
      name: 'طرف‌حساب',
      counterparty_type: 'other',
      is_active: true
    };
    component.bankAccounts = [
      { id: 101, party: 7, bank_name: 'بانک ملت', sheba_number: 'IR450120000000101111111001', is_primary: true }
    ];

    component.cpForm.onShebaInput('450120000000101111111001');
    component.addBankAccount();

    expect(mockPersonnelApi.createPartyBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        party: 7,
        sheba_number: 'IR450120000000101111111001',
        is_primary: false
      })
    );
  });

  it('فراخوانی deleteBankAccount و سپس executeConfirmDialog باید deletePartyBankAccount را فراخوانی کند', () => {
    const accToDelete: PartyBankAccount = {
      id: 55,
      party: 7,
      bank_name: 'بانک ملت',
      sheba_number: 'IR450120000000101111111001',
      is_primary: false
    };
    mockPersonnelApi.deletePartyBankAccount.mockReturnValue(of({ success: true }));

    component.deleteBankAccount(accToDelete);
    expect(component.confirmModal.isOpen).toBe(true);

    component.executeConfirmDialog();
    expect(mockPersonnelApi.deletePartyBankAccount).toHaveBeenCalledWith(55);
  });

  it('متد saveCounterparty در حالت ویرایش طرف‌حساب masked نباید فیلدهای هویتی و بانکی پوشیده یا company را بفرستد', () => {
    const maskedCp: Counterparty = {
      id: 30,
      party: 7,
      name: 'راننده پوشیده',
      counterparty_type: 'driver',
      national_id: '******5678',
      bank_name: 'بانک ملت',
      account_number: '12345',
      sheba_number: '********************1001',
      bank_masked: true,
      is_active: true
    };

    component.editCounterparty(maskedCp);
    mockPersonnelApi.updateCounterparty.mockReturnValue(of({ ...maskedCp, name: 'راننده پوشیده' }));

    component.saveCounterparty();

    expect(mockPersonnelApi.updateCounterparty).toHaveBeenCalledWith(
      30,
      expect.not.objectContaining({
        national_id: expect.anything(),
        sheba_number: expect.anything(),
        bank_name: expect.anything(),
        account_number: expect.anything(),
        company: expect.anything()
      })
    );

    const payload = mockPersonnelApi.updateCounterparty.mock.calls[0][1];
    expect(payload.national_id).toBeUndefined();
    expect(payload.sheba_number).toBeUndefined();
    expect(payload.bank_name).toBeUndefined();
    expect(payload.account_number).toBeUndefined();
    expect(payload.company).toBeUndefined();
  });

  it('متد saveCounterparty در حالت ساخت با شبای معتبر bank_accounts با is_primary: true ارسال کرده و در پاسخ existing: true توست info می‌دهد', () => {
    component.resetForm();
    component.newCounterparty.name = 'تعمیرگاه زاگرس';
    component.newCounterparty.counterparty_type = 'repair_shop';
    component.cpForm.onShebaInput('450120000000101111111001');

    const createdResponse: Counterparty = {
      id: 45,
      name: 'تعمیرگاه زاگرس',
      counterparty_type: 'repair_shop',
      is_active: true,
      existing: true
    };
    mockPersonnelApi.createCounterparty.mockReturnValue(of(createdResponse));

    component.saveCounterparty();

    expect(mockPersonnelApi.createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'تعمیرگاه زاگرس',
        bank_accounts: [
          expect.objectContaining({
            sheba_number: 'IR450120000000101111111001',
            is_primary: true
          })
        ]
      })
    );
    expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('تکراری'));
  });
});
