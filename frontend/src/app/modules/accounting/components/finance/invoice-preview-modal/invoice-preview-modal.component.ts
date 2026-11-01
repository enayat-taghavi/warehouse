import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ACTION_ICONS } from '../../../../../shared/icons/semantic-icons';
import { AttachmentsComponent } from '../../../../../shared/components/attachments/attachments.component';
import { WorkflowHistoryComponent } from '../../../../../shared/components/workflow-history/workflow-history.component';
import { TreasuryOrgApiService } from '../../../api/treasury-org-api.service';
import { PrintService } from '../../../../../core/services/print.service';
import { ExpenseInvoice } from '../../../models/personnel.model';

@Component({
  selector: 'app-invoice-preview-modal',
  standalone: true,
  imports: [
    CommonModule,
    ModalComponent,
    TabBarComponent,
    ActionButtonComponent,
    SvgIconDirective,
    AttachmentsComponent,
    WorkflowHistoryComponent,
  ],
  templateUrl: './invoice-preview-modal.component.html',
})
export class InvoicePreviewModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() invoiceId: number | null | undefined = null;
  @Input() invoice: ExpenseInvoice | any = null;
  @Input() initialTab: 'preview' | 'history' = 'preview';

  @Output() closed = new EventEmitter<void>();

  activeTab: 'preview' | 'history' = 'preview';
  invoiceDetail: any = null;
  isLoading = false;

  readonly tabs: TabDef[] = [
    { id: 'preview', label: 'پیش‌نمایش فاکتور', shortLabel: 'پیش‌نمایش', icon: ACTION_ICONS.view },
    { id: 'history', label: 'سابقه گردش کار', shortLabel: 'سابقه', icon: ACTION_ICONS.history },
  ];

  constructor(
    private treasuryApi: TreasuryOrgApiService,
    private printService: PrintService,
    private cdr: ChangeDetectorRef
  ) {}

  get modalTitle(): string {
    const inv = this.invoiceDetail || this.invoice;
    if (!inv) return 'مشاهده و سابقه فاکتور';
    const num = inv.number || inv.invoice_number || inv.id;
    return `پیش‌نمایش و سابقه فاکتور ${num}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTab'] && this.initialTab) {
      this.activeTab = this.initialTab;
    }
    if (changes['invoice'] && this.invoice) {
      this.invoiceDetail = this.invoice;
    }
    if ((changes['isOpen'] && this.isOpen) || (changes['invoiceId'] && this.invoiceId)) {
      // هر بار بازشدن از همان تبی شروع می‌شود که صفحه خواسته، نه تب دفعهٔ قبل
      this.activeTab = this.initialTab || 'preview';
      this.loadInvoice();
    }
  }

  onTabChange(tabId: string): void {
    if (tabId === 'preview' || tabId === 'history') {
      this.activeTab = tabId;
    }
  }

  loadInvoice(): void {
    const id = this.invoiceId || this.invoice?.id;
    if (!id) {
      this.invoiceDetail = this.invoice || null;
      return;
    }

    this.isLoading = true;
    this.treasuryApi.getExpenseInvoice(id).subscribe({
      next: (inv) => {
        // پاسخ دیرِ فاکتور قبلی جای فاکتور تازه را نمی‌گیرد
        if (id !== (this.invoiceId || this.invoice?.id)) return;
        this.invoiceDetail = inv;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
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
      void this.printService.downloadPdf('expense_invoice', id);
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
      case 'revision_required':
        return 'نیازمند بازنگری';
      case 'rejected':
        return 'رد / ابطال شده';
      default:
        return status || 'نامشخص';
    }
  }
}
