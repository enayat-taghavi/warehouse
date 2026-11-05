import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { ExpenseInvoice } from '../../../models/personnel.model';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../shared/components/command-center/command-center.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { isServerUnreachable } from '../../../../../core/services/server-reachability';
import {
  InvoicePaymentPanelComponent, PAYABLE_INVOICE_STATUSES, PayableInvoiceItem, toPayableItem,
} from '../invoice-payment-panel/invoice-payment-panel.component';

/** صفحهٔ جدای پرداخت یک رسید («/invoices/:id/pay»)؛ فرم و قسط‌ها همان بخش مشترک پنجرهٔ خزانه‌دار است */
@Component({
  selector: 'app-invoice-payment-page',
  standalone: true,
  imports: [CommonModule, ActionButtonComponent, CommandCenterComponent, SvgIconDirective, InvoicePaymentPanelComponent],
  templateUrl: './invoice-payment-page.component.html',
  styleUrl: './invoice-payment-page.component.css'
})
export class InvoicePaymentPageComponent implements OnInit, OnDestroy {
  private treasuryApi = inject(TreasuryOrgApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  invoiceId: number | null = null;
  payItem: PayableInvoiceItem | null = null;
  /** فقط وضعیت‌های پرداخت‌پذیر سرور فرم قسط تازه را نشان می‌دهند */
  payable = false;
  isLoading = true;
  loadError = '';

  private routeSub?: Subscription;

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (Number.isInteger(id) && id > 0) {
        this.invoiceId = id;
        this.loadInvoiceDetails(id);
      } else {
        this.invoiceId = null;
        this.payItem = null;
        this.loadError = 'شناسهٔ دستور پرداخت درست نیست.';
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  reload(): void {
    if (this.invoiceId) this.loadInvoiceDetails(this.invoiceId);
  }

  loadInvoiceDetails(id: number): void {
    this.isLoading = true;
    this.loadError = '';
    this.treasuryApi.getExpenseInvoice(id).subscribe({
      next: (inv: ExpenseInvoice) => {
        this.payItem = toPayableItem(inv);
        this.payable = PAYABLE_INVOICE_STATUSES.includes((inv as any).status);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.payItem = null;
        this.loadError = typeof err?.status === 'number' && isServerUnreachable(err.status)
          ? 'اتصال به سرور برقرار نیست؛ پرداخت فقط آنلاین ممکن است.'
          : 'دستور پرداخت یافت نشد یا دسترسی به آن مجاز نیست.';
        this.cdr.detectChanges();
      }
    });
  }

  /** پس از تسویهٔ کامل، وضعیت رسید دیگر پرداخت‌پذیر نیست */
  onChanged(item: PayableInvoiceItem): void {
    this.payable = item.remaining > 0;
  }

  goBack(): void {
    this.router.navigate(['/app/finance/invoices']);
  }
}
