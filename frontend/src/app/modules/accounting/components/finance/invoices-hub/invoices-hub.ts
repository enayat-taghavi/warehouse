import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../../../core/auth/auth.service';
import { hasRoutePermission } from '../../../../../core/auth/auth.guard';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { EmployeeInvoicesHubComponent } from '../employee/employee-invoices/employee-invoices';
import { SupervisorInvoicesHubComponent } from '../supervisor/supervisor-invoices/supervisor-invoices';
import { AccountantInvoicesHubComponent } from '../accountant/accountant-invoices/accountant-invoices';
import { TreasurerInvoicesComponent } from '../treasurer/treasurer-invoices/treasurer-invoices';
import { ManagerInvoicesComponent } from '../manager/manager-invoices/manager-invoices';

export type InvoicesView = 'cartable' | 'mine';
export type InvoiceCartableRole = 'supervisor' | 'accountant' | 'manager' | 'treasury';

/**
 * کارتابل فاکتور هر نقش؛ `page` شناسهٔ صفحهٔ قبلی همان نقش است تا مجوز زیرتب
 * دقیقاً همان قاعدهٔ pagePermissions صفحهٔ قبلی بماند (route-access.ts).
 */
export const INVOICE_CARTABLES: Record<InvoiceCartableRole, { page: string; label: string; shortLabel: string }> = {
  supervisor: { page: 'supervisor-invoices', label: 'تایید فاکتورها', shortLabel: 'تایید' },
  accountant: { page: 'accountant-invoices', label: 'ممیزی فاکتورها', shortLabel: 'ممیزی' },
  manager: { page: 'manager-approvals', label: 'مجوز پرداخت فاکتورها', shortLabel: 'مجوز پرداخت' },
  treasury: { page: 'treasurer-invoices', label: 'پرداخت فاکتورها', shortLabel: 'پرداخت' },
};

const CARTABLE_ORDER: InvoiceCartableRole[] = ['supervisor', 'accountant', 'manager', 'treasury'];

/**
 * تب یکپارچهٔ «فاکتورها» در منوی سرپرست، حسابدار، مدیر و خزانه‌دار.
 * فقط پوسته است: «کارتابل» صفحهٔ نقش فعال و «فاکتورهای من» صفحهٔ ثبت فاکتور را بی‌تغییر نشان می‌دهد.
 * تن‌خواه عمداً اینجا نیست. طرح: Documents/Release_v1/4.1_invoice/plan_invoices_unified_tab.md
 */
@Component({
  selector: 'app-invoices-hub',
  standalone: true,
  imports: [
    TabBarComponent,
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly requestedView = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('view'))),
    { initialValue: this.route.snapshot.queryParamMap.get('view') }
  );

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

  readonly view = computed<InvoicesView | null>(() => {
    const hasCartable = this.cartableRole() !== null;
    const requested = this.requestedView();
    if (requested === 'mine' && this.canSeeMine()) return 'mine';
    if (hasCartable) return 'cartable';
    return this.canSeeMine() ? 'mine' : null;
  });

  readonly tabs = computed<TabDef[]>(() => {
    const tabs: TabDef[] = [];
    const role = this.cartableRole();
    if (role) {
      const c = INVOICE_CARTABLES[role];
      tabs.push({ id: 'cartable', label: c.label, shortLabel: c.shortLabel, icon: ACCOUNTING_ENTITY_ICONS.approvals });
    }
    if (this.canSeeMine()) {
      tabs.push({ id: 'mine', label: 'فاکتورهای من', shortLabel: 'من', icon: ACCOUNTING_ENTITY_ICONS.invoices });
    }
    return tabs;
  });

  switchView(next: string): void {
    if (next !== 'cartable' && next !== 'mine') return;
    if (next === this.view()) return;
    // پارامترهای صفحهٔ قبلی (زیرتب وضعیت، جستجو، فاکتور باز) به صفحهٔ دیگر نمی‌رسند؛ بخش فعال می‌ماند
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: next, tab: null, q: null, invoice: null },
      queryParamsHandling: 'merge',
    });
  }
}
