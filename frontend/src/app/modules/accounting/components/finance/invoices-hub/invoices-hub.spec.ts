// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { InvoicesHubComponent } from './invoices-hub';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { getModuleRegistry } from '../../../../../core/modules/module-registry.service';

@Component({ selector: 'app-employee-invoices-hub', standalone: true, template: '' })
class StubEmployeeInvoicesHubComponent {
  @Input() actionStep: string | null = null;
  @Output() roleAction = new EventEmitter<any>();
  loadInvoices = vi.fn();
}

@Component({ selector: 'app-supervisor-invoices-hub', standalone: true, template: '' })
class StubSupervisorInvoicesHubComponent {
  @Input() embedded = false;
  @Output() changed = new EventEmitter<void>();
  approveSingle = vi.fn();
  rejectSingle = vi.fn();
  cdr = { markForCheck: vi.fn() };
}

@Component({ selector: 'app-accountant-invoices-hub', standalone: true, template: '' })
class StubAccountantInvoicesHubComponent {
  @Input() embedded = false;
  @Output() changed = new EventEmitter<void>();
  bookDocument = vi.fn();
  rejectDocument = vi.fn();
}

@Component({ selector: 'app-treasurer-invoices-hub', standalone: true, template: '' })
class StubTreasurerInvoicesComponent {
  @Input() embedded = false;
  @Output() changed = new EventEmitter<void>();
  payExpenseInvoice = vi.fn();
}

@Component({ selector: 'app-manager-invoices', standalone: true, template: '' })
class StubManagerInvoicesComponent {
  @Input() embedded = false;
  @Output() changed = new EventEmitter<void>();
  approveInvoiceManager = vi.fn();
  rejectInvoiceManager = vi.fn();
}

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

function setup(role: string, perms: string[], superuser = false) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InvoicesHubComponent],
    providers: [
      { provide: AuthService, useValue: { isSuperuser: signal(superuser), userPermissions: signal(perms) } },
      { provide: AppPersonaService, useValue: { activeRole: signal(role) } },
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
  fixture.detectChanges();
  const list = () => fixture.debugElement.query(By.directive(StubEmployeeInvoicesHubComponent))?.componentInstance as StubEmployeeInvoicesHubComponent | undefined;
  return { hub, fixture, list };
}

const SUP = ['perm_invoice_record', 'perm_invoice_approve'];

describe('InvoicesHubComponent — یک فهرست با کار نقش روی ردیف (ح۲)', () => {
  beforeAll(() => {
    // قواعد pagePermissions ماژول حسابداری باید فعال باشد تا مجوز نقش‌ها واقعی سنجیده شود
    getModuleRegistry().setInstalledModules(['warehouse', 'accounting']);
  });

  it('supervisor sees one list with the supervisor step and an embedded supervisor component, no chips or sections', () => {
    const { hub, fixture, list } = setup('supervisor', SUP);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.actionStep()).toBe('supervisor_ok');
    expect(list()?.actionStep).toBe('supervisor_ok');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('app-employee-invoices-hub').length).toBe(1);
    const sup = fixture.debugElement.query(By.directive(StubSupervisorInvoicesHubComponent))?.componentInstance;
    expect(sup?.embedded).toBe(true);
    expect(el.querySelector('[role="radiogroup"]')).toBeNull();
    expect(el.querySelectorAll('section').length).toBe(0);
    expect(el.querySelector('#cartable-section-heading')).toBeNull();
  });

  it('each role opens its own step with its own permission', () => {
    const acc = setup('accountant', ['perm_invoice_record', 'perm_invoice_review']);
    expect(acc.hub.cartableRole()).toBe('accountant');
    expect(acc.hub.actionStep()).toBe('accountant_review');
    const man = setup('manager', ['perm_invoice_record', 'perm_manager_payment_authorize']);
    expect(man.hub.cartableRole()).toBe('manager');
    expect(man.hub.actionStep()).toBe('manager_ok');
    const trs = setup('treasury', ['perm_invoice_record', 'perm_treasury_disburse_action']);
    expect(trs.hub.cartableRole()).toBe('treasury');
    expect(trs.hub.actionStep()).toBe('treasury_pay');
    const trsCmp = trs.fixture.debugElement.query(By.directive(StubTreasurerInvoicesComponent))?.componentInstance;
    expect(trsCmp?.embedded).toBe(true);
  });

  it('without the role action permission only the plain list is shown (no role step, no role component)', () => {
    const { hub, fixture, list } = setup('supervisor', ['perm_invoice_record']);
    expect(hub.cartableRole()).toBeNull();
    expect(hub.actionStep()).toBeNull();
    expect(list()?.actionStep).toBeNull();
    expect(fixture.nativeElement.querySelector('app-supervisor-invoices-hub')).toBeNull();
  });

  it('the employee persona never gets a role step', () => {
    const { hub, list } = setup('operator', SUP);
    expect(hub.cartableRole()).toBeNull();
    expect(list()?.actionStep).toBeNull();
  });

  it('without any invoice permission nothing but the access message is shown', () => {
    const { fixture } = setup('supervisor', []);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-employee-invoices-hub')).toBeNull();
    expect(el.querySelector('app-supervisor-invoices-hub')).toBeNull();
    expect(el.textContent).toContain('دسترسی به رسیدهای پرداخت برای نقش فعلی تعریف نشده است.');
  });

  it('a role without the list permission falls back to the old (non-embedded) role page', () => {
    const { fixture } = setup('accountant', ['perm_invoice_review']);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-employee-invoices-hub')).toBeNull();
    const acc = fixture.debugElement.query(By.directive(StubAccountantInvoicesHubComponent))?.componentInstance;
    expect(acc).toBeTruthy();
    expect(acc.embedded).toBe(false);
  });

  it('a superuser without a cartable role gets the first step', () => {
    const { hub } = setup('superuser', [], true);
    expect(hub.cartableRole()).toBe('supervisor');
    expect(hub.actionStep()).toBe('supervisor_ok');
  });

  it('row actions dispatch to the embedded role component methods', () => {
    const inv: any = { id: 7, my_step: 'supervisor_ok' };
    const sup = setup('supervisor', SUP);
    const supCmp = sup.fixture.debugElement.query(By.directive(StubSupervisorInvoicesHubComponent)).componentInstance;
    sup.list()!.roleAction.emit({ kind: 'approve', inv });
    expect(supCmp.approveSingle).toHaveBeenCalledWith(inv);
    sup.list()!.roleAction.emit({ kind: 'return', inv });
    expect(supCmp.rejectSingle).toHaveBeenCalledWith(inv);
    // OnPush: the role component view is marked so its dialog renders
    expect(supCmp.cdr.markForCheck).toHaveBeenCalledTimes(2);

    const accInv: any = { id: 8, my_step: 'accountant_review' };
    const acc = setup('accountant', ['perm_invoice_record', 'perm_invoice_review']);
    const accCmp = acc.fixture.debugElement.query(By.directive(StubAccountantInvoicesHubComponent)).componentInstance;
    acc.hub.onRoleAction({ kind: 'approve', inv: accInv });
    acc.hub.onRoleAction({ kind: 'return', inv: accInv });
    expect(accCmp.bookDocument).toHaveBeenCalledWith(accInv);
    expect(accCmp.rejectDocument).toHaveBeenCalledWith(accInv);

    const manInv: any = { id: 9, my_step: 'manager_ok' };
    const man = setup('manager', ['perm_invoice_record', 'perm_manager_payment_authorize']);
    const manCmp = man.fixture.debugElement.query(By.directive(StubManagerInvoicesComponent)).componentInstance;
    man.hub.onRoleAction({ kind: 'approve', inv: manInv });
    man.hub.onRoleAction({ kind: 'return', inv: manInv });
    expect(manCmp.approveInvoiceManager).toHaveBeenCalledWith(manInv);
    expect(manCmp.rejectInvoiceManager).toHaveBeenCalledWith(manInv);

    const trsInv: any = { id: 10, my_step: 'treasury_pay' };
    const trs = setup('treasury', ['perm_invoice_record', 'perm_treasury_disburse_action']);
    const trsCmp = trs.fixture.debugElement.query(By.directive(StubTreasurerInvoicesComponent)).componentInstance;
    trs.hub.onRoleAction({ kind: 'pay', inv: trsInv });
    expect(trsCmp.payExpenseInvoice).toHaveBeenCalledWith(trsInv);
  });

  it('a row whose my_step is not the active role step is never dispatched', () => {
    const { hub, fixture } = setup('supervisor', SUP);
    const supCmp = fixture.debugElement.query(By.directive(StubSupervisorInvoicesHubComponent)).componentInstance;
    hub.onRoleAction({ kind: 'approve', inv: { id: 1, my_step: 'manager_ok' } as any });
    hub.onRoleAction({ kind: 'approve', inv: { id: 2, my_step: null } as any });
    hub.onRoleAction({ kind: 'pay', inv: { id: 3, my_step: 'supervisor_ok' } as any });
    expect(supCmp.approveSingle).not.toHaveBeenCalled();
  });

  it('a finished role action (changed) reloads the list', () => {
    const { fixture, list } = setup('manager', ['perm_invoice_record', 'perm_manager_payment_authorize']);
    const manCmp = fixture.debugElement.query(By.directive(StubManagerInvoicesComponent)).componentInstance;
    manCmp.changed.emit();
    expect(list()!.loadInvoices).toHaveBeenCalledTimes(1);
  });
});
