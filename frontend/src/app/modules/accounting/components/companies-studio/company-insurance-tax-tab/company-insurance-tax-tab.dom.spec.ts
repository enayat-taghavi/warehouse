// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Subject, of, throwError } from 'rxjs';

import { CompanyInsuranceTaxTabComponent } from './company-insurance-tax-tab';
import { CompaniesStudioFacade, CompanyPayrollProfile } from '../companies-studio.facade';
import { CompanyStudioContextService } from '../../../../../core/services/company-studio-context.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

const EMPTY: CompanyPayrollProfile = {
  company: 7, workshop_code: null, social_security_branch_code: null, social_security_branch_name: null,
  contract_row: null, employer_name: null, tax_memory_id: null, tax_economic_code: null, updated_at: null
};

describe('CompanyInsuranceTaxTabComponent (تب «بیمه و مالیات» استودیو، ت۵ طرح ۲.۱)', () => {
  let fixture: ComponentFixture<CompanyInsuranceTaxTabComponent>;
  let component: CompanyInsuranceTaxTabComponent;
  let facade: { getPayrollProfile: ReturnType<typeof vi.fn>; updatePayrollProfile: ReturnType<typeof vi.fn> };
  let toast: Record<string, ReturnType<typeof vi.fn>>;
  let notifications$: Subject<any>;
  let context: CompanyStudioContextService;

  async function create(companyId: number | null = 7): Promise<void> {
    fixture = TestBed.createComponent(CompanyInsuranceTaxTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', companyId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    facade = {
      getPayrollProfile: vi.fn().mockReturnValue(of(EMPTY)),
      updatePayrollProfile: vi.fn().mockImplementation((_id: number, p: Partial<CompanyPayrollProfile>) =>
        of({ ...EMPTY, ...p, updated_at: '2026-10-23T10:00:00Z' }))
    };
    toast = { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    notifications$ = new Subject();
    context = new CompanyStudioContextService();

    TestBed.configureTestingModule({
      imports: [CompanyInsuranceTaxTabComponent],
      providers: [
        { provide: CompanyStudioContextService, useValue: context },
        { provide: WebSocketService, useValue: { notifications$, tabId: 'tab-1' } },
        { provide: ToastService, useValue: toast }
      ]
    });
    TestBed.overrideComponent(CompanyInsuranceTaxTabComponent, {
      set: { providers: [{ provide: CompaniesStudioFacade, useValue: facade }] }
    });
    await TestBed.compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('پرونده را از payroll-profile همین شرکت می‌خواند؛ پاسخ تمام null فرم خالی و بی خطا می‌دهد', async () => {
    await create();
    expect(facade.getPayrollProfile).toHaveBeenCalledWith(7);
    const el: HTMLElement = fixture.nativeElement;
    const workshop = el.querySelector('#it_workshop_code') as HTMLInputElement;
    expect(workshop).not.toBeNull();
    expect(workshop.value).toBe('');
    expect(component.isDirty).toBe(false);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(context.hasError('fiscal_insurance')).toBe(false);
  });

  it('مقدار سرور در فرم می‌نشیند و ذخیره فقط فیلدهای تغییرکرده را با رقم لاتین می‌فرستد', async () => {
    facade.getPayrollProfile.mockReturnValue(of({ ...EMPTY, workshop_code: '1234567890', employer_name: 'کارفرما' }));
    await create();
    expect(component.form.workshop_code).toBe('1234567890');

    component.onFieldInput('contract_row', '۰۰۱');
    component.onFieldInput('tax_memory_id', 'a12b34');
    expect(component.form.contract_row).toBe('001');
    expect(component.isDirty).toBe(true);
    component.save();
    expect(facade.updatePayrollProfile).toHaveBeenCalledWith(7, { contract_row: '001', tax_memory_id: 'A12B34' });
    expect(toast['success']).toHaveBeenCalled();
    expect(component.isDirty).toBe(false);
  });

  it('خطای اعتبارسنجی کنار همان فیلد نمایش داده می‌شود و درخواستی فرستاده نمی‌شود', async () => {
    await create();
    component.onFieldInput('workshop_code', '123');
    component.save();
    fixture.detectChanges();
    expect(facade.updatePayrollProfile).not.toHaveBeenCalled();
    const err = fixture.nativeElement.querySelector('#it-err-workshop_code') as HTMLElement;
    expect(err?.textContent).toContain('۱۰ رقم');
    expect((fixture.nativeElement.querySelector('#it_workshop_code') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
  });

  it('خطای فیلدی سرور (400) کنار فیلد می‌نشیند', async () => {
    facade.updatePayrollProfile.mockReturnValue(throwError(() => ({ status: 400, error: { employer_name: ['نام نامعتبر است.'] } })));
    await create();
    component.onFieldInput('employer_name', 'x');
    component.save();
    fixture.detectChanges();
    expect(component.errors.employer_name).toBe('نام نامعتبر است.');
    expect(fixture.nativeElement.querySelector('#it-err-employer_name')?.textContent).toContain('نام نامعتبر است.');
  });

  it('سطح «خواندن» حوزهٔ insurance_tax: فرم غیرفعال و دکمهٔ ذخیره نیست', async () => {
    context.sectionLevels.set({ insurance_tax: 'read' });
    await create();
    const el: HTMLElement = fixture.nativeElement;
    expect(component.canWrite).toBe(false);
    expect(el.textContent).toContain('فقط خواندنی');
    expect(el.querySelector('button[type="submit"]')).toBeNull();
    component.onFieldInput('contract_row', '1');
    component.save();
    expect(facade.updatePayrollProfile).not.toHaveBeenCalled();
  });

  it('شکست دریافت حالت خطا با «تلاش دوباره» و نشان خطای تب می‌دهد', async () => {
    facade.getPayrollProfile.mockReturnValueOnce(throwError(() => ({ status: 500, error: {} })));
    await create();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('تلاش دوباره');
    expect(context.hasError('fiscal_insurance')).toBe(true);
    (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(facade.getPayrollProfile).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('پاسخ صف آفلاین مقدار کاربر را نگه می‌دارد و پیام «در صف» می‌دهد', async () => {
    facade.updatePayrollProfile.mockReturnValue(of({ _offlinePending: true } as any));
    await create();
    component.onFieldInput('social_security_branch_code', '22');
    component.save();
    fixture.detectChanges();
    expect(component.form.social_security_branch_code).toBe('22');
    expect(component.pendingOffline).toBe(true);
    expect(component.isDirty).toBe(false);
    expect(toast['info']).toHaveBeenCalled();
  });

  it('رویداد بلادرنگ company_payroll_profile همین شرکت دوباره می‌خواند، ولی فرم نیمه‌کاره را نه', async () => {
    await create();
    facade.getPayrollProfile.mockClear();
    notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_payroll_profile', company_id: 99 });
    expect(facade.getPayrollProfile).not.toHaveBeenCalled();
    notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_payroll_profile', company_id: 7 });
    expect(facade.getPayrollProfile).toHaveBeenCalledTimes(1);
    component.onFieldInput('contract_row', '5');
    notifications$.next({ type_str: 'org_structure_updated', entity_type: 'company_payroll_profile', company_id: 7 });
    expect(facade.getPayrollProfile).toHaveBeenCalledTimes(1);
  });

  it('ت۱۲: identifiers_visible=false به‌جای فرم خالی پیام می‌دهد و ذخیره نمی‌شود', async () => {
    facade.getPayrollProfile.mockReturnValue(of({ ...EMPTY, identifiers_visible: false }));
    await create();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-identifiers-hidden]')?.textContent)
      .toContain('برای دیدن شناسه‌های بیمه و مالیات به سطح خواندن حوزهٔ بیمه و مالیات نیاز دارید.');
    expect(el.querySelector('#it_workshop_code')).toBeNull();
    expect(el.querySelector('button[type="submit"]')).toBeNull();
    component.form.workshop_code = '1234567890';
    component.save();
    expect(facade.updatePayrollProfile).not.toHaveBeenCalled();
  });

  it('identifiers_visible=true همان فرم معمولی را نشان می‌دهد', async () => {
    facade.getPayrollProfile.mockReturnValue(of({ ...EMPTY, workshop_code: '1234567890', identifiers_visible: true }));
    await create();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-identifiers-hidden]')).toBeNull();
    expect((el.querySelector('#it_workshop_code') as HTMLInputElement).value).toBe('1234567890');
  });

  it('شرکت ذخیره‌نشده هیچ درخواستی نمی‌زند', async () => {
    await create(null);
    expect(facade.getPayrollProfile).not.toHaveBeenCalled();
  });
});
