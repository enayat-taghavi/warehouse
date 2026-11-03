// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ɵɵdirectiveInject, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { EmployeeInvoicesHubComponent } from './employee-invoices';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { TreasuryOrgApiService } from '../../../../api/treasury-org-api.service';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { PrintService } from '../../../../../../core/services/print.service';
import { PermissionService } from '../../../../../../core/services/permission.service';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {}

/** ردیف نمونه با my_step دلخواه (در انتظار، غیرقابل ویرایش) */
function row(id: number, my_step: any, status = 'pending_supervisor'): any {
  return { id, invoice_number: `INV-${id}`, amount: 1000, status, my_step, created_by_name: 'کارمند' };
}

describe('EmployeeInvoicesHubComponent — فهرست یکپارچه، تیک «فقط رسیدهای خودم» و کار نقش (ح۲)', () => {
  let fixture: ComponentFixture<EmployeeInvoicesHubComponent>;
  let component: EmployeeInvoicesHubComponent;
  let treasuryApi: any;
  let router: any;

  beforeAll(() => {
    Object.defineProperty(EmployeeInvoicesHubComponent, 'ɵfac', {
      value: function(t: any) {
        return new (t || EmployeeInvoicesHubComponent)(
          ɵɵdirectiveInject(AuthService),
          ɵɵdirectiveInject(PersonnelApiService),
          ɵɵdirectiveInject(ToastService),
          ɵɵdirectiveInject(ChangeDetectorRef),
          ɵɵdirectiveInject(ActivatedRoute),
          ɵɵdirectiveInject(Router),
          ɵɵdirectiveInject(ActiveCompanyService, 8),
          ɵɵdirectiveInject(TreasuryOrgApiService, 8),
          ɵɵdirectiveInject(ConfirmDialogService, 8),
          ɵɵdirectiveInject(WebSocketService, 8),
          ɵɵdirectiveInject(PrintService, 8)
        );
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function setup(query: Record<string, string> = {}, actionStep: string | null = null, results: any[] = []) {
    treasuryApi = {
      getExpenseInvoicesPage: vi.fn().mockImplementation(() => of({ count: results.length, results })),
      getExpenseInvoiceDuplicates: vi.fn().mockReturnValue(of({ count: 0, results: [] })),
      getExpenseInvoice: vi.fn().mockReturnValue(of({ id: 55, status: 'pending_manager' })),
    };
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      imports: [EmployeeInvoicesHubComponent],
      providers: [ { provide: PermissionService, useValue: { canWriteDocuments: () => true } },
        { provide: AuthService, useValue: { user: vi.fn().mockReturnValue({ id: 1, is_superuser: false }), userPermissions: vi.fn().mockReturnValue([]) } },
        {
          provide: PersonnelApiService,
          useValue: {
            getMySections: vi.fn().mockReturnValue(of([{ id: 10, name: 'بخش ابنیه', is_active: true }])),
            getProjectSections: vi.fn().mockReturnValue(of([])),
            getExpenseHeads: vi.fn().mockReturnValue(of([])),
            getCounterparties: vi.fn().mockReturnValue(of([])),
          },
        },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ActivatedRoute, useValue: { queryParams: of(query) } },
        { provide: Router, useValue: router },
        { provide: ActiveCompanyService, useValue: { activeCompanyId: 1 } },
        { provide: TreasuryOrgApiService, useValue: treasuryApi },
        { provide: ConfirmDialogService, useValue: { open: vi.fn() } },
        { provide: WebSocketService, useValue: { documentChanges$: vi.fn().mockReturnValue(of()) } },
        { provide: PrintService, useValue: { downloadPdf: vi.fn(), isOnline: vi.fn().mockReturnValue(true) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(EmployeeInvoicesHubComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('actionStep', actionStep);
    fixture.detectChanges();
  }

  /** پس از مقداردهی مستقیم فهرست، نمای کامپوننت دوباره کشیده می‌شود */
  const render = () => { (component as any).cdr.markForCheck(); fixture.detectChanges(); };
  const lastParams = () => treasuryApi.getExpenseInvoicesPage.mock.lastCall[0];
  const desktopRow = (): HTMLElement => fixture.nativeElement.querySelector('table tbody tr');
  const roleButtons = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[data-role-action]')).map(b => `${b.getAttribute('data-role-action')}:${b.textContent?.trim()}`);

  it('the «only mine» tick sits beside the status tabs and sends mine=1 from page one', () => {
    setup();
    const box: HTMLInputElement = fixture.nativeElement.querySelector('input[data-only-mine]');
    expect(box).toBeTruthy();
    expect(box.closest('label')?.textContent).toContain('فقط رسیدهای خودم');
    expect(lastParams()).not.toHaveProperty('mine');

    component.page = 3;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(component.onlyMine).toBe(true);
    expect(component.page).toBe(1);
    expect(lastParams()).toEqual(expect.objectContaining({ page: 1, mine: 1 }));
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: { mine: 1, filter: null },
      queryParamsHandling: 'merge',
    }));

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(lastParams()).not.toHaveProperty('mine');
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { mine: null, filter: null } }));
  });

  it('the tick narrows every status tab', () => {
    setup();
    component.setOnlyMine(true);
    component.setStatusFilter('draft');
    expect(lastParams()).toEqual(expect.objectContaining({ status: 'draft', mine: 1 }));
  });

  it('the «ready to pay» tab sends both open treasury statuses', () => {
    setup();
    component.setStatusFilter('ready_to_pay');
    expect(lastParams().status).toBe('ready_to_pay,partially_paid');
    component.setStatusFilter('paid');
    expect(lastParams().status).toBe('paid');
  });

  it('?mine=1 and the old ?filter=mine turn the tick on and reload with mine=1', () => {
    setup({ mine: '1' });
    expect(component.onlyMine).toBe(true);
    expect(lastParams()).toEqual(expect.objectContaining({ mine: 1 }));
    TestBed.resetTestingModule();
    setup({ filter: 'mine' });
    expect(component.onlyMine).toBe(true);
    expect(lastParams()).toEqual(expect.objectContaining({ mine: 1 }));
    const box: HTMLInputElement = fixture.nativeElement.querySelector('input[data-only-mine]');
    expect(box.checked).toBe(true);
  });

  it('old ?filter=approve / ?view=cartable open the status tab of the active role; ?filter=pay opens ready to pay', () => {
    const cases: [Record<string, string>, string | null, string][] = [
      [{ filter: 'approve' }, 'supervisor_ok', 'pending_supervisor'],
      [{ view: 'cartable' }, 'accountant_review', 'pending_accountant'],
      [{ filter: 'approve' }, 'manager_ok', 'pending_manager'],
      [{ view: 'cartable' }, 'treasury_pay', 'ready_to_pay'],
      [{ filter: 'pay' }, null, 'ready_to_pay'],
    ];
    for (const [query, step, tab] of cases) {
      TestBed.resetTestingModule();
      setup(query, step);
      expect(component.statusFilter).toBe(tab);
      expect(component.onlyMine).toBe(false);
      expect(lastParams().status).toBe(tab === 'ready_to_pay' ? 'ready_to_pay,partially_paid' : tab);
    }
  });

  it('an explicit ?tab= wins over the old filter param', () => {
    setup({ tab: 'paid', filter: 'approve' }, 'supervisor_ok');
    expect(component.statusFilter).toBe('paid');
  });

  it('?view=mine (the notification link) is the plain list without the tick and still opens ?invoice= detail', () => {
    setup({ view: 'mine', invoice: '55' }, 'manager_ok');
    expect(component.onlyMine).toBe(false);
    expect(component.statusFilter).toBe('all');
    expect(lastParams()).not.toHaveProperty('mine');
    expect(lastParams()).not.toHaveProperty('status');
    expect(treasuryApi.getExpenseInvoice).toHaveBeenCalledWith(55);
    expect(component.isDetailPanelOpen).toBe(true);
  });

  it('role buttons per my_step appear only when it matches the host step', () => {
    const expected: Record<string, string[]> = {
      supervisor_ok: ['approve:تأیید', 'return:عودت'],
      accountant_review: ['approve:صدور', 'return:عودت'],
      manager_ok: ['approve:مجوز', 'return:بازنگری'],
      treasury_pay: ['pay:پرداخت'],
    };
    for (const step of Object.keys(expected)) {
      TestBed.resetTestingModule();
      setup({}, step);
      component.invoices = [row(1, step)];
      render();
      expect(roleButtons(desktopRow())).toEqual(expected[step]);
      const mobile: HTMLElement = fixture.nativeElement.querySelector('ul li');
      expect(roleButtons(mobile)).toEqual(expected[step]);

      // مرحلهٔ دیگر، بی‌مرحله، یا میزبان بی‌نقش: دکمه‌ای نیست
      for (const other of [...Object.keys(expected).filter(s => s !== step), null]) {
        component.invoices = [row(2, other)];
        render();
        expect(roleButtons(desktopRow())).toEqual([]);
      }
    }
    TestBed.resetTestingModule();
    setup({}, null);
    component.invoices = [row(3, 'supervisor_ok')];
    render();
    expect(roleButtons(desktopRow())).toEqual([]);
  });

  it('role buttons carry Persian hints, hide the lock badge and emit roleAction', () => {
    setup({}, 'accountant_review');
    const inv = row(4, 'accountant_review', 'pending_accountant');
    component.invoices = [inv];
    render();
    const tr = desktopRow();
    const approve = tr.querySelector('[data-role-action="approve"]') as HTMLButtonElement;
    expect(approve.getAttribute('title')).toBe('صدور سند');
    expect(approve.getAttribute('aria-label')).toBe('صدور');
    expect(tr.textContent).not.toContain('قفل');

    const spy = vi.fn();
    component.roleAction.subscribe(spy);
    approve.click();
    (tr.querySelector('[data-role-action="return"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenNthCalledWith(1, { kind: 'approve', inv });
    expect(spy).toHaveBeenNthCalledWith(2, { kind: 'return', inv });

    // بی کار نقش، نشان قفل همچنان دیده می‌شود
    component.invoices = [row(5, null, 'pending_accountant')];
    render();
    expect(desktopRow().textContent).toContain('قفل');
  });
});
