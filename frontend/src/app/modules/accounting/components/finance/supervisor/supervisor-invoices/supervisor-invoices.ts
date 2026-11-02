import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, ExpenseInvoice } from '../../../../models/personnel.model';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';
import { PrintService } from '../../../../../../core/services/print.service';
import { InvoiceReceiptButtonComponent } from '../../invoice-receipt-button/invoice-receipt-button';
import { InvoicePreviewModalComponent } from '../../invoice-preview-modal/invoice-preview-modal.component';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import { attendanceActionErrorMessage } from '../../../../attendance-period-error';

@Component({
  selector: 'app-supervisor-invoices-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
    WorkflowReasonDialogComponent,
    InvoiceReceiptButtonComponent,
    InvoicePreviewModalComponent,
    PersianDatePipe,
  ],
  templateUrl: './supervisor-invoices.html',
  styleUrl: './supervisor-invoices.css'
})
export class SupervisorInvoicesHubComponent implements OnInit, OnDestroy {
  // Subtabs navigation
  activeSubTab: 'pending' | 'approved' | 'all' = 'pending';

  get tabs(): TabDef[] {
    return [
      {
        id: 'pending',
        label: 'نیازمند بررسی',
        shortLabel: 'بررسی',
        icon: STATUS_ICONS.pending,
        count: this.statusCounters.pending,
        tone: 'amber',
      },
      {
        id: 'approved',
        label: 'تایید شده',
        shortLabel: 'تایید',
        icon: STATUS_ICONS.approved,
        count: this.statusCounters.approved,
        tone: 'emerald',
      },
      {
        id: 'all',
        label: 'کل رسیدهای پرداخت',
        shortLabel: 'همه',
        icon: STATUS_ICONS.all,
        count: this.statusCounters.all,
        tone: 'slate',
      },
    ];
  }

  // Section Management (Guardian G1: Section Isolation)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Search & Filter
  searchQuery = '';
  fiscalYear = '1405';

  // State & Indicators
  isLoading = false;
  allInvoices: ExpenseInvoice[] = [];
  items: ExpenseInvoice[] = [];

  // Counters
  statusCounters = {
    pending: 0,
    approved: 0,
    all: 0
  };

  private routeSub?: Subscription;
  private docSub?: Subscription;
  private liveSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private printService: PrintService,
    @Optional() private ws?: WebSocketService
  ) {}

  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  printInvoice(item: ExpenseInvoice): void {
    if (item.id) void this.printService.downloadPdf('expense_invoice', item.id);
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['pending', 'approved', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.loadSections();

    // ص۶ طرح ۲.۵: فاکتوری که جای دیگری عوض شد درجا به‌روز می‌شود، وگرنه فهرست بی‌صدا دوباره خوانده می‌شود
    this.liveSub = this.ws?.liveRefresh$?.().subscribe(() => this.fetchInvoices(true));
    this.docSub = this.ws?.documentChanges$?.(['expense_invoice']).subscribe(ev => {
      if (patchDocumentRow(this.allInvoices, ev)) {
        this.updateViewAndCounters();
        this.cdr.detectChanges();
      } else if (!this.selectedSectionId || !ev.section_id || Number(ev.section_id) === Number(this.selectedSectionId)) {
        this.fetchInvoices(true);
      }
    });
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
              this.fetchInvoices();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchInvoices();
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
    this.fetchInvoices();
  }

  onSectionChanged(): void {
    this.selectedSectionId = this.selectedSectionId ? Number(this.selectedSectionId) : null;
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.syncUrlParams();
    this.fetchInvoices();
  }

  switchSubTab(tab: string): void {
    if (tab === 'pending' || tab === 'approved' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.updateViewAndCounters();
    }
  }

  onSearch(): void {
    this.syncUrlParams();
    this.fetchInvoices();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  fetchInvoices(silent = false): void {
    if (!silent) this.isLoading = true;
    const params: { section_id?: number; search?: string } = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    if (this.searchQuery?.trim()) params.search = this.searchQuery.trim();

    this.personnelApi.getExpenseInvoices(params).subscribe({
      next: (data: ExpenseInvoice[]) => {
        this.isLoading = false;
        this.allInvoices = data || [];
        this.updateViewAndCounters();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.toast.error(attendanceActionErrorMessage(err, 'خطا در دریافت رسیدهای پرداخت هزینه'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    const list = this.allInvoices;
    this.statusCounters = {
      pending: list.filter(x => x.status === 'pending_supervisor').length,
      approved: list.filter(x => ['pending_accountant', 'pending_manager', 'ready_to_pay', 'partially_paid', 'paid'].includes(x.status)).length,
      all: list.length
    };

    if (this.activeSubTab === 'pending') {
      this.items = list.filter(x => x.status === 'pending_supervisor');
    } else if (this.activeSubTab === 'approved') {
      this.items = list.filter(x => ['pending_accountant', 'pending_manager', 'ready_to_pay', 'partially_paid', 'paid'].includes(x.status));
    } else {
      this.items = list;
    }
  }

  approveSingle(item: ExpenseInvoice): void {
    if (!item.id) return;
    this.isLoading = true;
    this.personnelApi.approveExpenseInvoice(item.id).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.success(`رسید پرداخت شماره ${item.invoice_number || ''} تایید و به کارتابل حسابداری ارسال شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error(attendanceActionErrorMessage(err, 'خطا در تایید رسید پرداخت'));
        this.cdr.detectChanges();
      }
    });
  }

  // مودال پیش‌نمایش و سابقه فاکتور
  previewModalOpen = false;
  previewInvoiceId: number | null = null;
  previewInvoiceItem: ExpenseInvoice | null = null;
  previewInitialTab: 'preview' | 'history' = 'preview';

  openPreview(item: ExpenseInvoice, tab: 'preview' | 'history' = 'preview'): void {
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

  isReasonDialogOpen = false;
  reasonDialogTitle = '';
  reasonDialogConfirmLabel = 'عودت رسید پرداخت';
  reasonDialogServerError = '';
  pendingRejectInvoice: ExpenseInvoice | null = null;

  rejectSingle(item: ExpenseInvoice): void {
    if (!item.id) return;
    this.pendingRejectInvoice = item;
    this.reasonDialogTitle = `علت عودت رسید پرداخت شماره ${item.invoice_number || ''} برای اصلاح`;
    this.reasonDialogConfirmLabel = 'عودت رسید پرداخت';
    this.reasonDialogServerError = '';
    this.isReasonDialogOpen = true;
  }

  onReasonConfirmed(reason: string): void {
    if (!this.pendingRejectInvoice?.id) return;
    const invNumber = this.pendingRejectInvoice.invoice_number || '';
    this.isLoading = true;
    // «عودت» = برگشت به کارمند برای اصلاح (مثل حسابدار)، نه رد همیشگی (تصمیم کاربر، ۳۰ اکتبر ۲۰۲۶)
    this.personnelApi.requestRevisionExpenseInvoice(this.pendingRejectInvoice.id, reason).subscribe({
      next: () => {
        this.isLoading = false;
        this.isReasonDialogOpen = false;
        this.pendingRejectInvoice = null;
        this.toast.warning(`رسید پرداخت شماره ${invNumber} برای اصلاح به کارمند برگشت.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        const detail = attendanceActionErrorMessage(err, 'خطا در عودت رسید پرداخت');
        this.reasonDialogServerError = detail;
        this.toast.error(detail);
        this.cdr.detectChanges();
      }
    });
  }

  onReasonCancelled(): void {
    this.isReasonDialogOpen = false;
    this.pendingRejectInvoice = null;
    this.reasonDialogServerError = '';
  }

  exportExcel(): void {
    this.toast.info('در حال تولید فایل اکسل رسیدهای پرداخت...');
    const params: any = {
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending' ? 'pending_supervisor' : undefined
    };
    if (this.searchQuery?.trim()) {
      params.search = this.searchQuery.trim();
    }
    this.personnelApi.exportExpenseInvoicesExcel(params).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `Expense_Invoices_${this.selectedSectionId || 'all'}.xlsx`);
        this.toast.success('فایل اکسل رسیدهای پرداخت با موفقیت دریافت شد.');
      },
      error: () => {
        this.toast.error('خطا در دانلود فایل اکسل رسیدهای پرداخت.');
      }
    });
  }


  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.fetchInvoices();
  }
}
