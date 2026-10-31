// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { UserChatPolicyComponent, UserChatPolicy } from './user-chat-policy';
import { ApiService } from '../../../../../core/api/api.service';
import { PermissionService } from '../../../../../core/services/permission.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

describe('UserChatPolicyComponent DOM Spec', () => {
  let fixture: ComponentFixture<UserChatPolicyComponent>;
  let component: UserChatPolicyComponent;
  let api: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  let isSuperuserSig: WritableSignal<boolean>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const defaultPolicy: UserChatPolicy = {
    user_id: 12,
    chat_allowed: true,
    contact_scope: ''
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
      imports: [UserChatPolicyComponent],
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

  async function createComponent(policy: Partial<UserChatPolicy> = defaultPolicy, userId = 12): Promise<void> {
    api.get.mockReturnValue(of({ ...defaultPolicy, ...policy }));
    fixture = TestBed.createComponent(UserChatPolicyComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', userId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('1. GET is called with communications/policies/users/12 and the toggle reflects chat_allowed', async () => {
    await createComponent({ chat_allowed: true }, 12);
    expect(api.get).toHaveBeenCalledWith('communications/policies/users/12', undefined, expect.objectContaining({ context: expect.anything() }));
    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="chat-policy-toggle"] button') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.getAttribute('aria-checked')).toBe('true');
    expect(component.chatAllowed).toBe(true);
  });

  it('2. switching the toggle off PUTs { chat_allowed: false, contact_scope: "" } to the same endpoint and shows the success toast', async () => {
    await createComponent({ chat_allowed: true, contact_scope: '' }, 12);
    api.put.mockReturnValue(of({ user_id: 12, chat_allowed: false, contact_scope: '' }));

    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="chat-policy-toggle"] button') as HTMLButtonElement;
    toggleBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.put).toHaveBeenCalledWith('communications/policies/users/12', {
      chat_allowed: false,
      contact_scope: ''
    }, expect.objectContaining({ context: expect.anything() }));
    expect(toast.success).toHaveBeenCalledWith('تنظیمات پیام‌رسان ذخیره شد');
    expect(component.chatAllowed).toBe(false);
  });

  it('3. choosing section PUTs { chat_allowed: true, contact_scope: "section" }; choosing "" («پیروی از شرکت») PUTs contact_scope: ""', async () => {
    await createComponent({ chat_allowed: true, contact_scope: 'company' }, 12);
    api.put.mockImplementation((_url: string, body: unknown) => of({ user_id: 12, ...(body as object) }));

    const select = fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]') as HTMLSelectElement;
    select.value = 'section';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.put).toHaveBeenCalledWith('communications/policies/users/12', {
      chat_allowed: true,
      contact_scope: 'section'
    }, expect.objectContaining({ context: expect.anything() }));

    select.value = '';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.put).toHaveBeenCalledWith('communications/policies/users/12', {
      chat_allowed: true,
      contact_scope: ''
    }, expect.objectContaining({ context: expect.anything() }));
  });

  it('4. non-superuser actor: no option with value all; superuser actor: the option all exists', async () => {
    isSuperuserSig.set(false);
    await createComponent({ contact_scope: 'company' }, 12);
    let select = fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]') as HTMLSelectElement;
    let optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).toBeNull();

    fixture.destroy();
    isSuperuserSig.set(true);
    await createComponent({ contact_scope: 'company' }, 12);
    select = fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]') as HTMLSelectElement;
    optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).not.toBeNull();
    expect(optionAll?.textContent?.trim()).toBe('همهٔ شرکت‌ها');
  });

  it('5. non-superuser actor and saved value all: the option exists and the select is disabled', async () => {
    isSuperuserSig.set(false);
    await createComponent({ contact_scope: 'all' }, 12);

    const select = fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]') as HTMLSelectElement;
    const optionAll = select.querySelector('option[value="all"]');
    expect(optionAll).not.toBeNull();
    expect(select.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('فقط مدیر کل می‌تواند این حوزه را تغییر دهد');
  });

  it('6. PUT error: the values revert and the error toast receives the server detail text', async () => {
    await createComponent({ chat_allowed: true, contact_scope: 'section' }, 12);
    api.put.mockReturnValue(throwError(() => ({ error: { detail: 'مجوز لازم برای تغییر این کاربر را ندارید' } })));

    const toggleBtn = fixture.nativeElement.querySelector('[data-testid="chat-policy-toggle"] button') as HTMLButtonElement;
    toggleBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.chatAllowed).toBe(true);
    expect(toast.error).toHaveBeenCalledWith('مجوز لازم برای تغییر این کاربر را ندارید');

    const select = fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]') as HTMLSelectElement;
    select.value = 'company';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.contactScope).toBe('section');
  });

  it('7. GET 403: no card, no toggle and no select are rendered', async () => {
    api.get.mockReturnValue(throwError(() => ({ status: 403 })));
    fixture = TestBed.createComponent(UserChatPolicyComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', 12);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="chat-policy-toggle"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="chat-policy-scope"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('8. GET 500: the error alert and the retry button are shown; clicking retry calls GET again', async () => {
    api.get.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    fixture = TestBed.createComponent(UserChatPolicyComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', 12);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('دریافت تنظیمات پیام‌رسان ممکن نشد.');
    const retryBtn = fixture.nativeElement.querySelector('button[title="تلاش دوباره"]') as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    api.get.mockReturnValue(of({ user_id: 12, chat_allowed: true, contact_scope: 'company' }));
    retryBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[data-testid="chat-policy-toggle"]')).toBeTruthy();
  });
});
