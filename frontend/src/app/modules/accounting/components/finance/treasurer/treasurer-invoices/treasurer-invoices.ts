import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional, Input, Output, EventEmitter, inject } from '@angular/core';
import { PermissionService } from '../../../../../../core/services/permission.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, ExpenseInvoice } from '../../../../models/personnel.model';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { PrintService } from '../../../../../../core/services/print.service';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { PaymentReceiptListComponent } from '../../payment-receipt-list/payment-receipt-list.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { InvoicePreviewModalComponent } from '../../invoice-preview-modal/invoice-preview-modal.component';
import { InvoicePaymentPanelComponent, PayableInvoiceItem, toPayableItem } from '../../invoice-payment-panel/invoice-payment-panel.component';

export type { PayableInvoiceItem } from '../../invoice-payment-panel/invoice-payment-panel.component';

@Component({
  selector: 'app-treasurer-invoices-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ActionButtonComponent, PaymentReceiptListComponent,
    CommandCenterComponent,
    ModalComponent,
    InvoicePreviewModalComponent,
    InvoicePaymentPanelComponent
  ],
  templateUrl: './treasurer-invoices.html',
  styleUrl: './treasurer-invoices.css'
})
export class TreasurerInvoicesComponent implements OnInit, OnDestroy {
  /** ستون سرفصل در فهرست مشترک دستورهای پرداخت */
  readonly categoryOf = (r: PayableInvoiceItem) => r.category || '—';
  protected perm = inject(PermissionService);
  /** درون فهرست یکپارچهٔ فاکتورها: فقط کارها و پنجره‌ها؛ بارگذاری و فهرست با میزبان است */
  @Input() embedded = false;
  /** پس از هر کار موفق در حالت embedded (میزبان فهرست را دوباره می‌خواند) */
  @Output() changed = new EventEmitter<void>();

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Search & Filters
  searchQuery = '';
  fiscalYear = '1405';

  // State
  isLoading = false;

  /** همهٔ فاکتورهای کارتابل (دامنهٔ سرور)؛ invoices همین فهرست با فیلتر بخش انتخاب‌شده است */
  allInvoices: PayableInvoiceItem[] = [];
  invoices: PayableInvoiceItem[] = [];

  // مودال پیش‌نمایش و سابقه فاکتور
  previewModalOpen = false;
  previewInvoiceId: number | null = null;
  previewInvoiceItem: any = null;
  previewInitialTab: 'preview' | 'history' = 'preview';

  openPreview(item: PayableInvoiceItem, tab: 'preview' | 'history' = 'preview'): void {
    this.previewInvoiceId = item.id || null;
    this.previewInvoiceItem = item;
    this.previewInitialTab = tab;
    this.previewModalOpen = true;
  }

  closePreview(): void {
    this.previewModalOpen = false;
    this.previewInvoiceId = null;
    this.previewInvoiceItem = null;
  }

  private routeSub?: Subscription;
  private docSub?: Subscription;
  private liveSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private printService: PrintService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    if (this.embedded) return;
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.loadSections();

    // ص۶ طرح ۲.۵: ردیف‌های این صفحه برچسب وضعیت خودشان را دارند، پس هر تغییر فاکتور = بازخوانی بی‌صدا
    this.liveSub = this.ws?.liveRefresh$?.().subscribe(() => this.loadTreasuryData(true));
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(() => this.loadTreasuryData(true));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.docSub?.unsubscribe();
    this.liveSub?.unsubscribe();
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          this.personnelApi.getProjectSections({ is_active: true }).subscribe({
            next: (allSecs: ProjectSection[]) => {
              this.mySections = allSecs || [];
              this.pickDefaultSection();
            },
            error: () => {
              this.isLoadingSections = false;
              this.loadTreasuryData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.loadTreasuryData();
      }
    });
  }

  /** پیش‌فرض «همه بخش‌ها» (null)؛ section_id نشانی فقط وقتی بخش در فهرست کاربر باشد می‌ماند */
  private pickDefaultSection(): void {
    if (this.selectedSectionId && !this.mySections.some(s => s.id === this.selectedSectionId)) {
      this.selectedSectionId = null;
    }
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.isLoadingSections = false;
    this.loadTreasuryData();
  }

  onSectionChanged(): void {
    this.selectedSectionId = this.selectedSectionId ? Number(this.selectedSectionId) : null;
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.syncUrlParams();
    this.applySectionFilter();
  }

  /** کارتابل خزانه بخش نمی‌گیرد؛ فیلتر بخش سمت کاربر و فقط روی فهرست دامنه‌دار سرور اعمال می‌شود */
  private applySectionFilter(): void {
    const sid = this.selectedSectionId;
    this.invoices = sid ? this.allInvoices.filter(i => Number(i.section_id) === sid) : [...this.allInvoices];
    this.cdr.detectChanges();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** ردیف فاکتور (کارتابل خزانه یا فهرست یکپارچه) به ردیف قابل پرداخت */
  toPayableItem(inv: any): PayableInvoiceItem {
    return toPayableItem(inv);
  }

  /** پرداخت از فهرست یکپارچهٔ فاکتورها (حالت embedded) */
  payExpenseInvoice(inv: ExpenseInvoice): void {
    this.payInvoice(this.toPayableItem(inv));
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadTreasuryData(silent = false): void {
    if (this.embedded) { this.cdr.markForCheck(); this.changed.emit(); return; }
    if (!silent) this.isLoading = true;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (res: any) => {
        const rawInvoices = res?.invoices || [];
        this.allInvoices = rawInvoices.map((inv: any) => this.toPayableItem(inv));

        this.isLoading = false;
        this.applySectionFilter();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.toast.error('خطا در دریافت اطلاعات خزانه‌داری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ── پنجرهٔ ثبت قسط (۴.۱-ج)؛ فرم و قسط‌ها در بخش مشترک app-invoice-payment-panel ──
  payModalOpen = false;
  payItem: PayableInvoiceItem | null = null;

  private isOffline(): boolean {
    const net = NetworkStatusService.getInstance();
    return !net.isBrowserOnline || net.state === 'offline';
  }

  payInvoice(item: PayableInvoiceItem): void {
    if (this.isOffline()) {
      this.toast.error('پرداخت فقط با اتصال به سرور ممکن است.');
      return;
    }
    this.payItem = item;
    this.payModalOpen = true;
  }

  closePayModal(): void {
    this.payModalOpen = false;
    this.payItem = null;
  }


  /** خروجی اکسل فاکتورهای هزینهٔ در دسترس خزانه‌دار (پیش‌تر فقط پیام موفقیت نشان می‌داد و فایلی نمی‌ساخت) */
  exportExcel(): void {
    this.personnelApi.exportExpenseInvoicesExcel().subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, 'treasury_expense_invoices.xlsx');
        this.toast.success('فایل اکسل دستورهای پرداخت هزینه دانلود شد.');
      },
      error: (err: any) => {
        const msg = (typeof err?.status === 'number' && isServerUnreachable(err.status))
          ? 'اتصال به سرور برقرار نیست؛ خروجی اکسل فقط آنلاین ممکن است.'
          : 'خطا در ساخت فایل اکسل.';
        this.toast.error(msg);
      }
    });
  }

  refreshData(): void {
    this.loadTreasuryData();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.loadTreasuryData();
  }
}
