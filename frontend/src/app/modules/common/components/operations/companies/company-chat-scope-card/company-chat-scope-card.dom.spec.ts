// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { CompanyChatScopeCardComponent, CompanyChatPolicy } from './company-chat-scope-card';
import { ApiService } from '../../../../../../core/api/api.service';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('CompanyChatScopeCardComponent DOM Spec', () => {
  let fixture: ComponentFixture<CompanyChatScopeCardComponent>;
  let component: CompanyChatScopeCardComponent;
  let api: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  let isSuperuserSig: WritableSignal<boolean>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const defaultPolicy: CompanyChatPolicy = {
    company_id: 5,
    contact_scope: 'company'
  };

  beforeEach(async () => {
    isSuperuserSig = signal(false);
    api = {
      get: vi.fn().mockReturnValue(of({ ...defaultPolicy })),
      put: vi.fn().mockReturnValue(of({ ...defaultPolicy }))
    };
    toast = {
      success: vi.fn(),
      error: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CompanyChatScopeCardComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: PermissionService, useValue: { isSuperuser: isSuperuserSig } },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function createComponent(policy: Partial<CompanyChatPolicy> = defaultPolicy, companyId = 5): Promise<void> {
    api.get.mockReturnValue(of({ ...defaultPolicy, ...policy }));
    fixture = TestBed.createComponent(CompanyChatScopeCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', companyId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('1. GET endpoint communications/policies/companies/5 and the selected value', async () => {
    await createComponent({ contact_scope: 'project' }, 5);
    expect(api.get).toHaveBeenCalledWith('communications/policies/companies/5');
    const select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('project');
    expect(component.contactScope).toBe('project');
  });

  it('2. changing to project PUTs { contact_scope: "project" } with the success toast', async () => {
    await createComponent({ contact_scope: 'section' }, 5);
    api.put.mockReturnValue(of({ company_id: 5, contact_scope: 'project' }));

    const select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    select.value = 'project';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.put).toHaveBeenCalledWith('communications/policies/companies/5', {
      contact_scope: 'project'
    });
    expect(toast.success).toHaveBeenCalledWith('حوزهٔ مخاطبان چت ذخیره شد');
    expect(component.contactScope).toBe('project');
  });

  it('3. all hidden for a non-superuser and shown for a superuser', async () => {
    isSuperuserSig.set(false);
    await createComponent({ contact_scope: 'company' }, 5);
    let select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    let optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).toBeNull();

    fixture.destroy();
    isSuperuserSig.set(true);
    await createComponent({ contact_scope: 'company' }, 5);
    select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).not.toBeNull();
    expect(optionAll?.textContent?.trim()).toBe('همهٔ شرکتها');
  });

  it('4. GET 403 renders nothing', async () => {
    api.get.mockReturnValue(throwError(() => ({ status: 403 })));
    fixture = TestBed.createComponent(CompanyChatScopeCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 5);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('5. PUT error reverts with the error toast', async () => {
    await createComponent({ contact_scope: 'company' }, 5);
    api.put.mockReturnValue(throwError(() => ({ error: { detail: 'خطا در ذخیرهٔ حوزهٔ مخاطبان' } })));

    const select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    select.value = 'project';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.contactScope).toBe('company');
    expect(toast.error).toHaveBeenCalledWith('خطا در ذخیرهٔ حوزهٔ مخاطبان');
  });

  it('6. non-superuser actor and saved value all: the option exists and the select is disabled', async () => {
    isSuperuserSig.set(false);
    await createComponent({ contact_scope: 'all' }, 5);

    const select = fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]') as HTMLSelectElement;
    const optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).not.toBeNull();
    expect(select.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('فقط مدیر کل میتواند این حوزه را تغییر دهد');
  });

  it('7. GET 500 shows error alert and retry button reloads', async () => {
    api.get.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture = TestBed.createComponent(CompanyChatScopeCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('companyId', 5);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('دریافت حوزهٔ مخاطبان چت ممکن نشد.');
    const retryBtn = fixture.nativeElement.querySelector('button[title="تلاش دوباره"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    api.get.mockReturnValue(of({ company_id: 5, contact_scope: 'section' }));
    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[data-testid="chat-scope-select"]')).toBeTruthy();
  });
});
