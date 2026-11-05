import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  OnInit,
  Optional,
  SimpleChanges,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ACTION_ICONS } from '../../../../../shared/icons/semantic-icons';
import { AttachmentsComponent } from '../../../../../shared/components/attachments/attachments.component';
import { WorkflowHistoryComponent } from '../../../../../shared/components/workflow-history/workflow-history.component';
import { PersianDatePipe } from '../../../../../shared/pipes/persian-date.pipe';
import { PersianWordsPipe } from '../../../../../shared/pipes/persian-words.pipe';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { PrintService } from '../../../../../core/services/print.service';
import { ExpenseInvoice } from '../../../models/personnel.model';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-invoice-preview-modal',
  standalone: true,
  imports: [
    CommonModule,
    ModalComponent,
    ActionButtonComponent,
    SvgIconDirective,
    AttachmentsComponent,
    WorkflowHistoryComponent,
    PersianDatePipe,
    PersianWordsPipe,
  ],
  templateUrl: './invoice-preview-modal.component.html',
})
export class InvoicePreviewModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() invoiceId: number | null | undefined = null;
  @Input() invoice: ExpenseInvoice | any = null;
  @Input() initialTab: 'preview' | 'history' = 'preview';

  @Output() closed = new EventEmitter<void>();

  invoiceDetail: any = null;
  isLoading = false;
  sharingId: number | null = null;
  private docSub?: Subscription;

  constructor(
    private treasuryApi: TreasuryOrgApiService,
    private printService: PrintService,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService | null
  ) {}

  get modalTitle(): string {
    const inv = this.invoiceDetail || this.invoice;
    if (!inv) return 'مشاهده و سابقه دستور پرداخت';
    const num = inv.number || inv.invoice_number || inv.id;
    return `پیش‌نمایش و سابقه دستور پرداخت ${num}`;
  }

  ngOnInit(): void {
    // گام د: پنجرهٔ باز با تغییر همان فاکتور جای دیگر بی‌صدا تازه می‌شود
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(ev => {
      const id = this.invoiceId || this.invoice?.id;
      if (this.isOpen && id && Number(id) === Number(ev.doc_id)) this.loadInvoice(true);
    });
  }

  ngOnDestroy(): void {
    this.docSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoice'] && this.invoice) {
      this.invoiceDetail = this.invoice;
    }
    if ((changes['isOpen'] && this.isOpen) || (changes['invoiceId'] && this.invoiceId)) {
      this.loadInvoice();
      if (this.initialTab === 'history') {
        this.scrollToHistory();
      }
    } else if (changes['initialTab'] && this.initialTab === 'history' && this.isOpen) {
      this.scrollToHistory();
    }
  }

  private scrollToHistory(): void {
    setTimeout(() => {
      document.getElementById('inv-preview-history')?.scrollIntoView?.({ block: 'start' });
    }, 0);
  }

  loadInvoice(silent = false): void {
    const id = this.invoiceId || this.invoice?.id;
    if (!id) {
      this.invoiceDetail = this.invoice || null;
      return;
    }

    if (!silent) this.isLoading = true;
    this.treasuryApi.getExpenseInvoice(id).subscribe({
      next: (inv) => {
        // پاسخ دیرِ فاکتور قبلی جای فاکتور تازه را نمی‌گیرد
        if (id !== (this.invoiceId || this.invoice?.id)) return;
        this.invoiceDetail = inv;
        this.isLoading = false;
        this.cdr.detectChanges();
        if (this.isOpen && this.initialTab === 'history') {
          this.scrollToHistory();
        }
      },
      error: () => {
        this.isLoading = false;
        if (silent) return;
        if (this.invoice) {
          this.invoiceDetail = this.invoice;
        }
        this.cdr.detectChanges();
      },
    });
  }

  printInvoice(): void {
    const id = this.invoiceId || this.invoiceDetail?.id || this.invoice?.id;
    if (id) {
      void this.printService.printPdf('expense_invoice', id);
    }
  }

  async shareInvoice(): Promise<void> {
    const id = this.invoiceId || this.invoiceDetail?.id || this.invoice?.id;
    if (!id || this.sharingId) return;
    this.sharingId = Number(id);
    this.cdr.detectChanges();
    try {
      const inv = this.invoiceDetail || this.invoice || {};
      const num = inv.number || inv.invoice_number || id;
      await this.printService.sharePdf('expense_invoice', id, `payment-receipt-${num}.pdf`);
    } finally {
      this.sharingId = null;
      this.cdr.detectChanges();
    }
  }

  close(): void {
    this.closed.emit();
  }

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  getStatusBadgeClass(status?: string): string {
    switch (status) {
      case 'draft':
        return 'bg-surface-muted text-fg border-line';
      case 'pending_supervisor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'pending_accountant':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'pending_manager':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'ready_to_pay':
      case 'pending_payment':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'partially_paid':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'paid':
      case 'settled_outside':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'revision_required':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-surface-muted text-fg-muted border-line';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس کارمند';
      case 'pending_supervisor':
        return 'در انتظار تایید سرپرست';
      case 'pending_accountant':
        return 'در انتظار بررسی حسابدار';
      case 'pending_manager':
        return 'در انتظار تایید مدیر';
      case 'ready_to_pay':
      case 'pending_payment':
        return 'آماده پرداخت';
      case 'partially_paid':
        return 'پرداخت ناقص';
      case 'paid':
        return 'تسویه و پرداخت‌شده';
      case 'settled_outside':
        return 'تأییدشده، پرداخت بیرون از سامانه';
      case 'revision_required':
        return 'نیازمند بازنگری';
      case 'rejected':
        return 'رد / ابطال شده';
      default:
        return status || 'نامشخص';
    }
  }
}
