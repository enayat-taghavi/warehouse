// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject, throwError } from 'rxjs';
import { CompanyTreasuryTabComponent } from './company-treasury-tab';
import { CompanyApiService } from '../../../../../core/api/company-api.service';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyTreasuryTabComponent (تب «بانک و شبا»، مشارکت حسابداری)', () => {
  let fixture: ComponentFixture<CompanyTreasuryTabComponent>;
  let component: CompanyTreasuryTabComponent;
  let context: CompanyStudioContextService;
  let mockCompanyApi: any;
  let mockToast: any;
  let mockWebSocket: any;

  beforeEach(async () => {
    mockCompanyApi = {
      matchesCompanyUrl: vi.fn().mockReturnValue(false),
      getBankAccounts: vi.fn().mockReturnValue(of([
        {
          id: 1,
          company: 1,
          bank_name: 'بانک ملت',
          account_number: '1234567890',
          sheba_number: 'IR120120000000001234567890',
          account_title: 'حساب جاری پاینده',
          is_primary: true,
          is_active: true
        }
      ])),
      createBankAccount: vi.fn().mockImplementation((data: any) => of({ id: 2, ...data })),
      updateBankAccount: vi.fn().mockImplementation((id: number, data: any) => of({ id, ...data })),
      deleteBankAccount: vi.fn().mockReturnValue(of(void 0)),
      setPrimaryBankAccount: vi.fn().mockReturnValue(of({ success: true }))
    };
    mockToast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    mockWebSocket = { notifications$: new Subject<any>(), tabId: 'test-client-tab-id' };

    await TestBed.configureTestingModule({
      imports: [CompanyTreasuryTabComponent],
      providers: [
        CompanyStudioContextService,
        { provide: CompanyApiService, useValue: mockCompanyApi },
        { provide: ToastService, useValue: mockToast },
        { provide: WebSocketService, useValue: mockWebSocket },
        { provide: ConfirmDialogService, useValue: { open: vi.fn().mockResolvedValue(true) } }
      ]
    }).compileComponents();

    context = TestBed.inject(CompanyStudioContextService);
    fixture = TestBed.createComponent(CompanyTreasuryTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 1);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('بارگذاری و context استودیو', () => {
    it('با companyId حساب‌ها یک بار دریافت می‌شوند و شمارندهٔ تب در context می‌نشیند', () => {
      expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledTimes(1);
      expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledWith(1);
      expect(component.companyBankAccounts.length).toBe(1);
      expect(component.companyBankAccounts[0].bank_name).toBe('بانک ملت');
      expect(component.companyBankAccounts[0].is_primary).toBe(true);
      expect(context.count('treasury')).toBe(1);
    });

    it('شرکت تازه (بدون شناسه) درخواستی نمی‌زند و پیام «پس از ثبت اولیه» دارد', async () => {
      mockCompanyApi.getBankAccounts.mockClear();
      fixture.componentRef.setInput('companyId', null);
      fixture.detectChanges();
      expect(mockCompanyApi.getBankAccounts).not.toHaveBeenCalled();
      expect(component.companyBankAccounts.length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('پس از ثبت اولیه شرکت');
    });

    it('شکست دریافت حالت خطا با «تلاش دوباره» و نشان خطای تب دارد', () => {
      mockCompanyApi.getBankAccounts.mockReturnValueOnce(throwError(() => ({ status: 500 })));
      component.retry();
      fixture.detectChanges();
      expect(component.loadError).toBe(true);
      expect(context.hasError('treasury')).toBe(true);
      const retryBtn = Array.from(fixture.nativeElement.querySelectorAll('[role="alert"] button')) as HTMLButtonElement[];
      expect(retryBtn.length).toBe(1);
      retryBtn[0].click();
      fixture.detectChanges();
      expect(component.loadError).toBe(false);
      expect(context.hasError('treasury')).toBe(false);
    });

    it('فرم حساب نیمه‌کاره در هشدار خروج استودیو (context.isDirty) حساب می‌شود', () => {
      expect(context.isDirty()).toBe(false);
      component.newAccount.sheba_number = 'IR120120000000001234567890';
      expect(context.isDirty()).toBe(true);
      component.cancelEditAccount();
      expect(context.isDirty()).toBe(false);
      fixture.destroy();
      component.newAccount.sheba_number = 'IR1';
      expect(context.isDirty()).toBe(false);
    });

    it('پاسخ دیررسِ شرکت پیشین فهرست و شمارندهٔ شرکت تازه را عوض نمی‌کند', () => {
      const late = new Subject<any>();
      mockCompanyApi.getBankAccounts.mockReturnValueOnce(late).mockReturnValueOnce(of([]));
      component.retry();
      fixture.componentRef.setInput('companyId', 2);
      fixture.detectChanges();
      late.next([{ id: 9, company: 1, bank_name: 'دیررس', sheba_number: 'IR9', is_primary: false, is_active: true }]);
      expect(component.companyBankAccounts.length).toBe(0);
      expect(context.count('treasury')).toBeUndefined();
    });

    it('وب‌سوکت حساب بانکی همین شرکت داده را تازه می‌کند و پیام همین تب (اکو) نادیده گرفته می‌شود', () => {
      mockCompanyApi.getBankAccounts.mockClear();
      mockWebSocket.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_bank_account', company_id: 1, client_tab_id: 'test-client-tab-id' });
      expect(mockCompanyApi.getBankAccounts).not.toHaveBeenCalled();
      mockWebSocket.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_bank_account', company_id: 2, client_tab_id: 'other' });
      expect(mockCompanyApi.getBankAccounts).not.toHaveBeenCalled();
      mockWebSocket.notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_bank_account', company_id: 1, client_tab_id: 'other' });
      expect(mockCompanyApi.getBankAccounts).toHaveBeenCalledWith(1);
    });
  });

  describe('سیستم چندشبایی و خزانه‌داری هوشمند شرکت‌ها (Multi-IBAN & Smart Treasury)', () => {
    it('ورود شماره شبای معتبر باید نام بانک و شماره حساب را به صورت خودکار تشخیص دهد', () => {
      component.onShebaInput('IR160120000000001234567890');

      expect(component.shebaValidationResult?.isValid).toBe(true);
      expect(component.shebaValidationResult?.bank?.name).toBe('بانک ملت');
      expect(component.newAccount.bank_name).toBe('بانک ملت');
      expect(component.newAccount.account_number).toBe('1234567890');
    });

    it('ورود شماره شبای نامعتبر باید خطا بدهد و از ثبت جلوگیری کند', () => {
      component.onShebaInput('IR120000000000000000000000'); // نامعتبر

      expect(component.shebaValidationResult?.isValid).toBe(false);
      expect(component.shebaValidationResult?.errorMessage).toContain('نامعتبر');

      component.saveBankAccount();
      expect(mockToast.error).toHaveBeenCalled();
      expect(mockCompanyApi.createBankAccount).not.toHaveBeenCalled();
    });

    it('ثبت حساب بانکی معتبر باید وب‌سرویس ایجاد را با شرکت جاری صدا بزند', () => {
      component.onShebaInput('IR160120000000001234567890');
      component.newAccount.account_title = 'حساب حقوق پرسنل';

      component.saveBankAccount();
      fixture.detectChanges();

      expect(mockCompanyApi.createBankAccount).toHaveBeenCalledWith(expect.objectContaining({
        company: 1,
        sheba_number: 'IR160120000000001234567890',
        bank_name: 'بانک ملت',
        account_number: '1234567890'
      }));
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('بانک ملت'));
    });

    it('تغییر حساب بانکی اصلی وب‌سرویس را صدا می‌زند و فیلدهای حساب اصلی شرکت را از context به هسته می‌دهد', () => {
      const applied: any[] = [];
      context.serverFields$.subscribe(f => applied.push(f));
      const sampleAccount = {
        id: 5,
        company: 1,
        bank_name: 'بانک تجارت',
        account_number: '987654321',
        sheba_number: 'IR980180000000000987654321',
        account_title: 'حساب تجاری',
        is_primary: false,
        is_active: true
      };

      component.setPrimaryAccount(sampleAccount);
      fixture.detectChanges();

      expect(mockCompanyApi.setPrimaryBankAccount).toHaveBeenCalledWith(5);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('به عنوان حساب اصلی شرکت تنظیم شد'));
      expect(applied).toEqual([{ companyId: 1, fields: { primary_bank_name: 'بانک تجارت', primary_account_number: '987654321', primary_iban: 'IR980180000000000987654321' } }]);
    });

    it('کپی شماره شبا به کلیپ‌بورد باید توست موفقیت‌آمیز نمایش دهد', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(void 0)
        }
      });

      component.copySheba('IR120120000000001234567890');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('IR120120000000001234567890');

      await Promise.resolve();
      await new Promise(r => setTimeout(r, 10));

      expect(mockToast.success).toHaveBeenCalledWith('شماره شبا در حافظه کپی شد.');
      expect(component.copiedSheba).toBe('IR120120000000001234567890');
    });
  });

  describe('به‌روزرسانی درجا بدون خروج از استودیو', () => {
    it('افزودن حساب بانکی جدید باید بلافاصله و درجا در companyBankAccounts ظاهر شود و شمارنده بالا رود', () => {
      const initialCount = component.companyBankAccounts.length;
      component.onShebaInput('IR160120000000001234567890');
      component.newAccount.account_title = 'حساب تست درجا';

      mockCompanyApi.createBankAccount.mockReturnValue(of({
        id: 99,
        company: 1,
        bank_name: 'بانک ملت',
        account_number: '1234567890',
        sheba_number: 'IR160120000000001234567890',
        account_title: 'حساب تست درجا',
        is_primary: false,
        is_active: true
      }));

      component.saveBankAccount();
      fixture.detectChanges();

      expect(component.companyBankAccounts.length).toBe(initialCount + 1);
      const added = component.companyBankAccounts.find(a => a.id === 99);
      expect(added).toBeDefined();
      expect(added?.bank_name).toBe('بانک ملت');
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('افزوده شد'));
      expect(context.count('treasury')).toBe(initialCount + 1);
    });

    it('حذف حساب بانکی باید بلافاصله از companyBankAccounts حذف شود', async () => {
      const targetAcc = component.companyBankAccounts[0];
      const initialCount = component.companyBankAccounts.length;

      await component.deleteBankAccount(targetAcc);
      fixture.detectChanges();

      expect(component.companyBankAccounts.some(a => a.id === targetAcc.id)).toBe(false);
      expect(component.companyBankAccounts.length).toBe(initialCount - 1);
      expect(mockToast.success).toHaveBeenCalledWith('حساب بانکی با موفقیت حذف شد.');
    });

    it('تنظیم حساب اصلی باید وضعیت is_primary سایر حساب‌ها را فورا به false و حساب منتخب را به true تغییر دهد', () => {
      component.companyBankAccounts = [
        { id: 1, company: 1, bank_name: 'بانک یک', sheba_number: 'IR111', is_primary: true, is_active: true },
        { id: 2, company: 1, bank_name: 'بانک دو', sheba_number: 'IR222', is_primary: false, is_active: true }
      ];

      component.setPrimaryAccount(component.companyBankAccounts[1]);
      fixture.detectChanges();

      expect(component.companyBankAccounts[0].is_primary).toBe(false);
      expect(component.companyBankAccounts[1].is_primary).toBe(true);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('به عنوان حساب اصلی شرکت تنظیم شد'));
    });
  });
});
