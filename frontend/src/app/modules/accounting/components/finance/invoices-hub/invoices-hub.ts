import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../../../core/auth/auth.service';
import { hasRoutePermission } from '../../../../../core/auth/auth.guard';
import { AppPersonaService } from '../../../../../core/services/app-persona.service';
import { EmployeeInvoicesHubComponent } from '../employee/employee-invoices/employee-invoices';
import { SupervisorInvoicesHubComponent } from '../supervisor/supervisor-invoices/supervisor-invoices';
import { AccountantInvoicesHubComponent } from '../accountant/accountant-invoices/accountant-invoices';
import { TreasurerInvoicesComponent } from '../treasurer/treasurer-invoices/treasurer-invoices';
import { ManagerInvoicesComponent } from '../manager/manager-invoices/manager-invoices';

export type InvoiceFilter = 'all' | 'mine' | 'approve' | 'pay';
export type InvoicesView = 'cartable' | 'mine';
export type InvoiceCartableRole = 'supervisor' | 'accountant' | 'manager' | 'treasury';

export interface InvoiceFilterChip {
  id: InvoiceFilter;
  label: string;
}

/**
 * کارتابل فاکتور هر نقش؛ `page` شناسهٔ صفحهٔ قبلی همان نقش است تا مجوز زیرتب
 * دقیقاً همان قاعدهٔ pagePermissions صفحهٔ قبلی بماند (route-access.ts).
 */
export const INVOICE_CARTABLES: Record<InvoiceCartableRole, { page: string; label: string; shortLabel: string }> = {
  supervisor: { page: 'supervisor-invoices', label: 'تایید رسیدهای پرداخت', shortLabel: 'تایید' },
  accountant: { page: 'accountant-invoices', label: 'ممیزی رسیدهای پرداخت', shortLabel: 'ممیزی' },
  manager: { page: 'manager-approvals', label: 'مجوز پرداخت رسیدهای پرداخت', shortLabel: 'مجوز پرداخت' },
  treasury: { page: 'treasurer-invoices', label: 'پرداخت رسیدهای پرداخت', shortLabel: 'پرداخت' },
};

const CARTABLE_ORDER: InvoiceCartableRole[] = ['supervisor', 'accountant', 'manager', 'treasury'];

const FILTER_LABELS: Record<InvoiceFilter, string> = {
  all: 'همه',
  mine: 'مال من',
  approve: 'منتظر تأیید من',
  pay: 'منتظر پرداخت',
};

/**
 * تب یکپارچهٔ «فاکتورها» در منوی سرپرست، حسابدار، مدیر و خزانه‌دار همراه با چیپ‌های فیلتر.
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly INVOICE_CARTABLES = INVOICE_CARTABLES;

  private readonly requestedFilter = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('filter'))),
    { initialValue: this.route.snapshot.queryParamMap.get('filter') }
  );

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

  /** چیپ‌ها فقط برای فیلترهایی که کاربر مجاز است نمایش داده می‌شوند */
  readonly allowedFilters = computed<InvoiceFilter[]>(() => {
    const others: InvoiceFilter[] = [];
    if (this.canSeeMine()) {
      others.push('mine');
    }
    const role = this.cartableRole();
    if (role === 'supervisor' || role === 'accountant' || role === 'manager') {
      others.push('approve');
    } else if (role === 'treasury') {
      others.push('pay');
    }

    const result: InvoiceFilter[] = [];
    if (others.length >= 2) {
      result.push('all');
    }
    result.push(...others);
    return result;
  });

  readonly chips = computed<InvoiceFilterChip[]>(() => {
    return this.allowedFilters().map(id => ({ id, label: FILTER_LABELS[id] }));
  });

  readonly filter = computed<InvoiceFilter | null>(() => {
    const allowed = this.allowedFilters();
    if (allowed.length === 0) return null;

    const reqFilter = this.requestedFilter() as InvoiceFilter | null;
    if (reqFilter && allowed.includes(reqFilter)) {
      return reqFilter;
    }

    // نگاشت پارامترهای قدیمی view: view=mine -> mine، view=cartable -> approve یا pay
    const reqView = this.requestedView();
    if (reqView === 'mine' && allowed.includes('mine')) {
      return 'mine';
    }
    if (reqView === 'cartable') {
      if (allowed.includes('approve')) return 'approve';
      if (allowed.includes('pay')) return 'pay';
    }

    // پیش‌فرض: all در صورت مجاز بودن، در غیر این صورت نخستین فیلتر مجاز
    if (allowed.includes('all')) {
      return 'all';
    }
    return allowed[0] ?? null;
  });

  /** سازگاری با تست‌ها یا ارجاعات احتمالی قبلی */
  readonly view = computed<InvoicesView | null>(() => {
    const f = this.filter();
    if (f === 'mine') return 'mine';
    if (f === 'approve' || f === 'pay') return 'cartable';
    if (f === 'all') return this.cartableRole() ? 'cartable' : 'mine';
    return null;
  });

  readonly tabs = computed(() => {
    return this.chips().map(c => ({ id: c.id, label: c.label }));
  });

  switchFilter(next: string): void {
    const target = next as InvoiceFilter;
    if (!this.allowedFilters().includes(target)) return;
    if (target === this.filter()) return;

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: target, view: null, tab: null, q: null, invoice: null },
      queryParamsHandling: 'merge',
    });
  }

  switchView(next: string): void {
    if (next === 'cartable') {
      const role = this.cartableRole();
      if (role === 'treasury') this.switchFilter('pay');
      else this.switchFilter('approve');
    } else if (next === 'mine') {
      this.switchFilter('mine');
    } else {
      this.switchFilter(next);
    }
  }
}
