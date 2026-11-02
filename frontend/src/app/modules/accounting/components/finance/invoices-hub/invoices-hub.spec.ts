// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { InvoicesHubComponent } from './invoices-hub';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { getModuleRegistry } from '../../../../../core/modules/module-registry.service';

@Component({ selector: 'app-employee-invoices-hub', standalone: true, template: '' })
class StubEmployeeInvoicesHubComponent {}

@Component({ selector: 'app-supervisor-invoices-hub', standalone: true, template: '' })
class StubSupervisorInvoicesHubComponent {}

@Component({ selector: 'app-accountant-invoices-hub', standalone: true, template: '' })
class StubAccountantInvoicesHubComponent {}

@Component({ selector: 'app-treasurer-invoices-hub', standalone: true, template: '' })
class StubTreasurerInvoicesComponent {}

@Component({ selector: 'app-manager-invoices', standalone: true, template: '' })
class StubManagerInvoicesComponent {}

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function setup(role: string, perms: string[], query: Record<string, string> = {}, superuser = false) {
  const params$ = new BehaviorSubject(convertToParamMap(query));
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoicesHubComponent],
    providers: [
      { provide: AuthService, useValue: { isSuperuser: signal(superuser), userPermissions: signal(perms) } },
      { provide: AppPersonaService, useValue: { activeRole: signal(role) } },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { queryParamMap: params$, snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  TestBed.overrideComponent(InvoicesHubComponent, {
    set: {
      imports: [
        StubEmployeeInvoicesHubComponent,
        StubSupervisorInvoicesHubComponent,
        StubAccountantInvoicesHubComponent,
        StubTreasurerInvoicesComponent,
        StubManagerInvoicesComponent,
      ],
    },
  });
  const fixture = TestBed.createComponent(InvoicesHubComponent);
  const hub = fixture.componentInstance;
  return { hub, fixture, router, params$ };
}

describe('InvoicesHubComponent — تب یکپارچهٔ فاکتورها همراه با چیپ‌های فیلتر', () => {
  beforeAll(() => {
    // قواعد pagePermissions ماژول حسابداری باید فعال باشد تا مجوز زیرتب‌ها واقعی سنجیده شود
    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
  });

  it('supervisor sees the approval cartable first and «my invoices» second', () => {
    const { hub } = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.chips().map(t => t.id)).toEqual(['all', 'mine', 'approve']);
    expect(hub.chips()[2].label).toBe('منتظر تأیید من');
    expect(hub.filter()).toBe('all');
  });

  it('each role opens its own cartable with its own permission', () => {
    expect(setup('accountant', ['perm_invoice_review']).hub.cartableRole()).toBe('accountant');
    expect(setup('manager', ['perm_manager_payment_authorize']).hub.cartableRole()).toBe('manager');
    expect(setup('treasury', ['perm_treasury_disburse_action']).hub.cartableRole()).toBe('treasury');
  });

  it('without the role action permission only «my invoices» is shown', () => {
    const { hub } = setup('supervisor', ['perm_invoice_record']);
    expect(hub.cartableRole()).toBeNull();
    expect(hub.chips().map(t => t.id)).toEqual(['mine']);
    expect(hub.filter()).toBe('mine');
  });

  it('the employee persona never gets a cartable', () => {
    const { hub } = setup('operator', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.cartableRole()).toBeNull();
    expect(hub.filter()).toBe('mine');
  });

  it('without any invoice permission nothing is shown', () => {
    const { hub } = setup('supervisor', []);
    expect(hub.chips()).toEqual([]);
    expect(hub.filter()).toBeNull();
  });

  it('view=mine opens «my invoices» and switching back clears the previous page params', () => {
    const { hub, router } = setup('accountant', ['perm_invoice_record', 'perm_invoice_review'], { view: 'mine' });
    expect(hub.filter()).toBe('mine');
    hub.switchFilter('approve');
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { filter: 'approve', view: null, tab: null, q: null, invoice: null },
      queryParamsHandling: 'merge',
    }));
    router.navigate.mockClear();
    hub.switchFilter('mine');
    expect(router.navigate).not.toHaveBeenCalled();
    hub.switchFilter('unknown');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('a superuser without a cartable role sees the first cartable', () => {
    const { hub } = setup('superuser', [], {}, true);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.chips().map(t => t.id)).toEqual(['all', 'mine', 'approve']);
  });

  it('default filter is all when both cartable and mine are allowed', () => {
    const { hub } = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.filter()).toBe('all');
  });

  it('chips shown per role (treasury shows pay, supervisor shows approve, employee-only shows only mine with no chips row)', () => {
    const trs = setup('treasury', ['perm_invoice_record', 'perm_treasury_disburse_action']);
    trs.fixture.detectChanges();
    expect(trs.hub.chips().map(c => c.id)).toEqual(['all', 'mine', 'pay']);
    const trsButtons = trs.fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(Array.from(trsButtons).map((b: any) => b.textContent.trim())).toEqual(['همه', 'مال من', 'منتظر پرداخت']);

    const sup = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve']);
    sup.fixture.detectChanges();
    expect(sup.hub.chips().map(c => c.id)).toEqual(['all', 'mine', 'approve']);
    const supButtons = sup.fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(Array.from(supButtons).map((b: any) => b.textContent.trim())).toEqual(['همه', 'مال من', 'منتظر تأیید من']);

    const emp = setup('operator', ['perm_invoice_record']);
    emp.fixture.detectChanges();
    expect(emp.hub.chips().map(c => c.id)).toEqual(['mine']);
    const empRadiogroup = emp.fixture.nativeElement.querySelector('[role="radiogroup"]');
    expect(empRadiogroup).toBeNull();
  });

  it('old view=mine and view=cartable query params map to the new filters', () => {
    const mine = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve'], { view: 'mine' });
    expect(mine.hub.filter()).toBe('mine');

    const supCartable = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve'], { view: 'cartable' });
    expect(supCartable.hub.filter()).toBe('approve');

    const trsCartable = setup('treasury', ['perm_invoice_record', 'perm_treasury_disburse_action'], { view: 'cartable' });
    expect(trsCartable.hub.filter()).toBe('pay');
  });

  it('all shows the cartable section before the mine section', () => {
    const { hub, fixture } = setup('supervisor', ['perm_invoice_record', 'perm_invoice_approve']);
    expect(hub.filter()).toBe('all');
    fixture.detectChanges();

    const sections = fixture.nativeElement.querySelectorAll('section');
    expect(sections.length).toBe(2);

    const firstHeading = sections[0].querySelector('h2');
    const secondHeading = sections[1].querySelector('h2');
    expect(firstHeading?.textContent?.trim()).toBe('تایید رسیدهای پرداخت');
    expect(secondHeading?.textContent?.trim()).toBe('رسیدهای پرداخت من');

    const supComponent = sections[0].querySelector('app-supervisor-invoices-hub');
    const empComponent = sections[1].querySelector('app-employee-invoices-hub');
    expect(supComponent).toBeTruthy();
    expect(empComponent).toBeTruthy();
  });
});
