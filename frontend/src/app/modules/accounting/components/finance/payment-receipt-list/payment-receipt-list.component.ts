import { Component, TemplateRef, contentChild, input, output } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { InvoiceReceiptButtonComponent } from '../invoice-receipt-button/invoice-receipt-button';
import { invoiceAmountHint, invoiceCreatorHint, invoiceStatusClass, invoiceStatusShort } from '../../../payment-receipt';

/** فیلدهای مشترک ردیف رسید پرداخت که فهرست مشترک نشان می‌دهد */
export interface PaymentReceiptListRow {
  id?: number;
  invoice_number?: string | null;
  number?: string | null;
  counterparty_name?: string | null;
  project_name?: string | null;
  section_name?: string | null;
  description?: string | null;
  amount?: number | string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  remaining?: number | string | null;
  subtotal?: number | string | null;
  discount_amount?: number | string | null;
  vat_amount?: number | string | null;
  lines?: unknown[] | null;
  status?: string | null;
  status_display?: string | null;
  possible_duplicate?: boolean | null;
  duplicate_reason?: string | null;
  vat_manual?: boolean | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_by_name?: string | null;
  updated_at?: string | null;
  invoice_date_shamsi?: string | null;
  issue_date_shamsi?: string | null;
  date?: string | null;
}

export interface PaymentReceiptListColumn<T> {
  label: string;
  value: (row: T) => string;
}

/**
 * فهرست یکسان رسیدهای پرداخت برای همهٔ نقش‌ها (کارمند، سرپرست، حسابدار، مدیر، خزانه‌دار).
 * ظاهر ردیف، دکمه‌های مشترک (پیش‌نمایش، همرسانی، چاپ، رسید) فقط این‌جاست؛ هر صفحه فقط
 * دکمه‌های کار نقش خود را با `<ng-template #rowActions let-row>` و نشان‌های پایانی را با
 * `<ng-template #rowExtra let-row>` می‌دهد.
 */
@Component({
  selector: 'app-payment-receipt-list',
  standalone: true,
  imports: [NgClass, NgTemplateOutlet, SvgIconDirective, ActionButtonComponent, InvoiceReceiptButtonComponent],
  templateUrl: './payment-receipt-list.component.html',
})
export class PaymentReceiptListComponent<T extends PaymentReceiptListRow = PaymentReceiptListRow> {
  readonly rows = input.required<T[]>();
  /** شمارهٔ ردیف پیش از این صفحه (صفحه‌بندی) */
  readonly indexOffset = input(0);
  readonly sharingId = input<number | null>(null);
  readonly canPrint = input(true);
  readonly showDescription = input(true);
  /** ستون «سرفصل» وقتی داده شود */
  readonly headsOf = input<((row: T) => string) | null>(null);
  /** یک ستون ویژهٔ نقش (مثلاً تاییدکنندهٔ سرپرست برای حسابدار) */
  readonly extraColumn = input<PaymentReceiptListColumn<T> | null>(null);

  readonly preview = output<T>();
  readonly share = output<T>();
  readonly print = output<T>();

  readonly actionsTpl = contentChild<TemplateRef<{ $implicit: T }>>('rowActions');
  readonly extraTpl = contentChild<TemplateRef<{ $implicit: T }>>('rowExtra');

  readonly statusShort = invoiceStatusShort;
  readonly statusClass = invoiceStatusClass;
  readonly creatorHint = invoiceCreatorHint;

  amountOf(row: T): number {
    return Number(row.amount ?? row.total_amount ?? 0) || 0;
  }

  amountHint(row: T): string {
    return invoiceAmountHint({ ...row, amount: this.amountOf(row) });
  }

  isPaidPart(row: T): boolean {
    return !!row.paid_amount && +row.paid_amount > 0;
  }

  dateOf(row: T): string {
    return row.invoice_date_shamsi || row.issue_date_shamsi || row.date || '—';
  }

  sectionText(row: T): string {
    return (row.project_name ? row.project_name + ' ◀ ' : '') + (row.section_name || '');
  }

  fa(v: unknown): string {
    const n = Number(v);
    return isNaN(n) ? String(v ?? '') : n.toLocaleString('fa-IR');
  }
}
