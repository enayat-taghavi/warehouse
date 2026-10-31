// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { InvoicesHubComponent } from './invoices-hub';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { getModuleRegistry } from '../../../../../core/modules/module-registry.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function setup(role: string, perms: string[], query: Record<string, string> = {}, superuser = false) {
  const params$ = new BehaviorSubject(convertToParamMap(query));
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isSuperuser: signal(superuser), userPermissions: signal(perms) } },
      { provide: AppPersonaService, useValue: { activeRole: signal(role) } },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { queryParamMap: params$, snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const hub = TestBed.runInInjectionContext(() => new InvoicesHubComponent());
  return { hub, router, params$ };
}

describe('InvoicesHubComponent — تب یکپارچهٔ فاکتورها', () => {
  beforeAll(() => {
    // قواعد pagePermissions ماژول حسابداری باید فعال باشد تا مجوز زیرتب‌ها واقعی سنجیده شود
    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
  });

  it('supervisor sees the approval cartable first and «my invoices» second', () => {
    const { hub } = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.tabs().map(t => t.id)).toEqual(['cartable', 'mine']);
    expect(hub.tabs()[0].label).toBe('تایید فاکتورها');
    expect(hub.view()).toBe('cartable');
  });

  it('each role opens its own cartable with its own permission', () => {
    expect(setup('accountant', ['perm_invoice_review']).hub.cartableRole()).toBe('accountant');
    expect(setup('manager', ['perm_manager_payment_authorize']).hub.cartableRole()).toBe('manager');
    expect(setup('treasury', ['perm_treasury_disburse_action']).hub.cartableRole()).toBe('treasury');
  });

  it('without the role action permission only «my invoices» is shown', () => {
    const { hub } = setup('supervisor', ['perm_invoice_record']);
    expect(hub.cartableRole()).toBeNull();
    expect(hub.tabs().map(t => t.id)).toEqual(['mine']);
    expect(hub.view()).toBe('mine');
  });

  it('the employee persona never gets a cartable', () => {
    const { hub } = setup('operator', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.cartableRole()).toBeNull();
    expect(hub.view()).toBe('mine');
  });

  it('without any invoice permission nothing is shown', () => {
    const { hub } = setup('supervisor', []);
    expect(hub.tabs()).toEqual([]);
    expect(hub.view()).toBeNull();
  });

  it('view=mine opens «my invoices» and switching back clears the previous page params', () => {
    const { hub, router } = setup('accountant', ['perm_invoice_record', 'perm_invoice_review'], { view: 'mine' });
    expect(hub.view()).toBe('mine');
    hub.switchView('cartable');
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { view: 'cartable', tab: null, q: null, invoice: null },
      queryParamsHandling: 'merge',
    }));
    router.navigate.mockClear();
    hub.switchView('mine');
    expect(router.navigate).not.toHaveBeenCalled();
    hub.switchView('unknown');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('a superuser without a cartable role sees the first cartable', () => {
    const { hub } = setup('superuser', [], {}, true);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.tabs().map(t => t.id)).toEqual(['cartable', 'mine']);
  });
});
