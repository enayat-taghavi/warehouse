import { ChangeDetectorRef, Component, ViewChild, computed, inject } from '@angular/core';
import { AuthService } from '../../../../../core/auth/auth.service';
import { hasRoutePermission } from '../../../../../core/auth/auth.guard';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import {
  EmployeeInvoicesHubComponent,
  InvoiceRoleAction,
  InvoiceRoleActionKind,
  InvoiceRoleStep,
} from '../employee/employee-invoices/employee-invoices';
import { SupervisorInvoicesHubComponent } from '../supervisor/supervisor-invoices/supervisor-invoices';
import { AccountantInvoicesHubComponent } from '../accountant/accountant-invoices/accountant-invoices';
import { TreasurerInvoicesComponent } from '../treasurer/treasurer-invoices/treasurer-invoices';
import { ManagerInvoicesComponent } from '../manager/manager-invoices/manager-invoices';

export type InvoiceCartableRole = 'supervisor' | 'accountant' | 'manager' | 'treasury';

/**
 * کارتابل فاکتور هر نقش؛ `page` شناسهٔ صفحهٔ قبلی همان نقش است تا مجوز کار نقش
 * دقیقاً همان قاعدهٔ pagePermissions صفحهٔ قبلی بماند (route-access.ts).
 */
export const INVOICE_CARTABLES: Record<InvoiceCartableRole, { page: string }> = {
  supervisor: { page: 'supervisor-invoices' },
  accountant: { page: 'accountant-invoices' },
  manager: { page: 'manager-approvals' },
  treasury: { page: 'treasurer-invoices' },
};

const CARTABLE_ORDER: InvoiceCartableRole[] = ['supervisor', 'accountant', 'manager', 'treasury'];

/** مرحلهٔ کار هر نقش (همان my_step سرور) */
export const INVOICE_ROLE_STEP: Record<InvoiceCartableRole, InvoiceRoleStep> = {
  supervisor: 'supervisor_ok',
  accountant: 'accountant_review',
  manager: 'manager_ok',
  treasury: 'treasury_pay',
};

/** کار ردیف ← متد همان کار در کامپوننت نقش (حالت embedded) */
const ROLE_DISPATCH: Record<InvoiceCartableRole, Partial<Record<InvoiceRoleActionKind, string>>> = {
  supervisor: { approve: 'approveSingle', return: 'rejectSingle' },
  accountant: { approve: 'bookDocument', return: 'rejectDocument' },
  manager: { approve: 'approveInvoiceManager', return: 'rejectInvoiceManager' },
  treasury: { pay: 'payExpenseInvoice' },
};

/**
 * تب یکپارچهٔ «فاکتورها» (ح۲): یک فهرست با تب‌های وضعیت و تیک «فقط رسیدهای خودم»؛
 * کار نقش (تأیید، عودت، مجوز، پرداخت) روی همان ردیف و با پنجره‌های کامپوننت نقش (embedded) انجام می‌شود.
 */
@Component({
  selector: 'app-invoices-hub',
  standalone: true,
  imports: [
    EmployeeInvoicesHubComponent,
    SupervisorInvoicesHubComponent,
    AccountantInvoicesHubComponent,
    TreasurerInvoicesComponent,
    ManagerInvoicesComponent,
  ],
  templateUrl: './invoices-hub.html',
})
export class InvoicesHubComponent {
  private readonly auth = inject(AuthService);
  private readonly persona = inject(AppPersonaService);

  @ViewChild('invoiceList') invoiceList?: EmployeeInvoicesHubComponent;
  /** کامپوننت نقش فعال در حالت embedded (فقط کارها و پنجره‌ها) */
  @ViewChild('roleActions') roleActions?: unknown;

  private canOpen(page: string): boolean {
    return this.auth.isSuperuser() || hasRoutePermission(page, this.auth.userPermissions());
  }

  /** کارتابل نقش فعال؛ مدیر ارشد بدون نقش کارتابلی، نخستین کارتابل را می‌بیند */
  readonly cartableRole = computed<InvoiceCartableRole | null>(() => {
    const role = this.persona.activeRole() as InvoiceCartableRole;
    if (CARTABLE_ORDER.includes(role)) {
      return this.canOpen(INVOICE_CARTABLES[role].page) ? role : null;
    }
    if (this.auth.isSuperuser()) return CARTABLE_ORDER[0];
    return null;
  });

  readonly canSeeMine = computed(() => this.canOpen('employee-invoices'));

  /** مرحله‌ای که دکمه‌هایش روی ردیف‌های فهرست دیده می‌شود */
  readonly actionStep = computed<InvoiceRoleStep | null>(() => {
    const role = this.cartableRole();
    return role ? INVOICE_ROLE_STEP[role] : null;
  });

  /** کار ردیف را به متد کامپوننت نقش فعال می‌سپارد */
  onRoleAction(event: InvoiceRoleAction): void {
    const role = this.cartableRole();
    if (!role || !event?.inv) return;
    if (event.inv.my_step !== INVOICE_ROLE_STEP[role]) return;
    const method = ROLE_DISPATCH[role][event.kind];
    const target = this.roleActions as (Record<string, unknown> & { cdr?: ChangeDetectorRef }) | undefined;
    const fn = method && target ? target[method] : undefined;
    if (typeof fn !== 'function') return;
    fn.call(target, event.inv);
    // کامپوننت نقش OnPush است و کلیک در فهرست آن را کثیف نمی‌کند؛ پنجرهٔ تازه‌باز باید کشیده شود
    target?.cdr?.markForCheck?.();
  }

  /** پس از کار موفق نقش، فهرست دوباره خوانده می‌شود */
  reloadList(): void {
    this.invoiceList?.loadInvoices();
  }
}
