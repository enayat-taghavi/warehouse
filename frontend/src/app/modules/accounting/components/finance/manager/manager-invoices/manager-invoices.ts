import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { PrintService } from '../../../../../../core/services/print.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { InvoiceReceiptButtonComponent } from '../../invoice-receipt-button/invoice-receipt-button';

/**
 * کارتابل فاکتور مدیر (صدور مجوز پرداخت)؛ از زیرتب «فاکتورهای هزینه» کارتابل تاییدات جدا شد
 * و در تب یکپارچهٔ «فاکتورها» نشانده می‌شود.
 */
@Component({
  selector: 'app-manager-invoices',
  standalone: true,
  imports: [CommonModule, SvgIconDirective, ActionButtonComponent, WorkflowReasonDialogComponent, InvoiceReceiptButtonComponent],
  templateUrl: './manager-invoices.html',
})
export class ManagerInvoicesComponent implements OnInit, OnDestroy {
  readonly invoiceIcon = ACCOUNTING_ENTITY_ICONS.invoices;

  invoicesList: any[] = [];
  isLoading = false;

  isInvoiceReasonOpen = false;
  invoiceReasonTitle = '';
  invoiceReasonServerError = '';
  pendingInvoiceRevision: any = null;

  private docSub?: Subscription;

  constructor(
    private api: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private printService: PrintService,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    this.loadInvoices();
    // فاکتوری که جای دیگری عوض شد فهرست را بی‌صدا تازه می‌کند
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(() => this.loadInvoices(true));
  }

  ngOnDestroy(): void {
    this.docSub?.unsubscribe();
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadInvoices(silent = false): void {
    if (!silent) this.isLoading = true;
    this.api.getExpenseInvoices({ status: 'pending_manager' }).subscribe({
      next: (res: any) => {
        this.invoicesList = Array.isArray(res) ? res : (res?.results || []);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (!silent) this.toast.show('error', err?.error?.error || 'خطا در دریافت لیست فاکتورهای هزینه');
        this.cdr.detectChanges();
      }
    });
  }

  approveInvoiceManager(inv: any): void {
    this.api.postCartableAction('manager', { action: 'approve', model: 'invoice', id: inv.id }).subscribe({
      next: () => {
        this.toast.show('success', `فاکتور هزینه «${inv.invoice_number || inv.id}» تایید و مجوز پرداخت صادر گردید.`);
        this.loadInvoices();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در صدور مجوز پرداخت فاکتور');
      }
    });
  }

  rejectInvoiceManager(inv: any): void {
    this.pendingInvoiceRevision = inv;
    this.invoiceReasonTitle = `علت بازنگری یا رد فاکتور «${inv.number || inv.invoice_number || inv.id}»`;
    this.invoiceReasonServerError = '';
    this.isInvoiceReasonOpen = true;
  }

  onInvoiceReasonConfirmed(reason: string): void {
    const inv = this.pendingInvoiceRevision;
    if (!inv) return;
    this.api.postCartableAction('manager', { action: 'revision', model: 'invoice', id: inv.id, reason }).subscribe({
      next: () => {
        this.isInvoiceReasonOpen = false;
        this.pendingInvoiceRevision = null;
        this.toast.show('warning', 'فاکتور هزینه جهت بازنگری عودت گردید.');
        this.loadInvoices();
      },
      error: (err: any) => {
        this.invoiceReasonServerError = err?.error?.error || err?.error?.detail || 'خطا در ارجاع بازنگری فاکتور';
        this.cdr.detectChanges();
      }
    });
  }

  onInvoiceReasonCancelled(): void {
    this.isInvoiceReasonOpen = false;
    this.pendingInvoiceRevision = null;
    this.invoiceReasonServerError = '';
  }

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  printInvoice(inv: any): void {
    void this.printService.downloadPdf('expense_invoice', inv.id);
  }
}
