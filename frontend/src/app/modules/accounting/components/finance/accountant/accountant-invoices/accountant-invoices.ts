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
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { WorkflowReasonDialogComponent } from '../../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';

@Component({
  selector: 'app-accountant-invoices-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent,
    WorkflowReasonDialogComponent
  ],
  templateUrl: './accountant-invoices.html',
  styleUrl: './accountant-invoices.css'
})
export class AccountantInvoicesHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_audit' | 'booked' | 'all' = 'pending_audit';

  // Memoized tabs for app-tab-bar (getter با آرایه تازه در هر چرخه، در dev mode خطای NG0100 می‌دهد)
  private tabsKey = '';
  private tabsCache: TabDef[] = [];
  get tabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.pending_audit}:${sc.booked}:${sc.all}`;
    if (key !== this.tabsKey) {
      this.tabsKey = key;
      this.tabsCache = [
        {
          id: 'pending_audit',
          label: 'در انتظار صدور سند',
          shortLabel: 'در انتظار',
          icon: STATUS_ICONS.pending,
          count: sc.pending_audit,
          tone: 'amber'
        },
        {
          id: 'booked',
          label: 'اسناد ثبت‌شده',
          shortLabel: 'ثبت‌شده',
          icon: STATUS_ICONS.approved,
          count: sc.booked,
          tone: 'emerald'
        },
        {
          id: 'all',
          label: 'کل فاکتورها',
          shortLabel: 'همه',
          icon: STATUS_ICONS.all,
          count: sc.all,
          tone: 'slate'
        }
      ];
    }
    return this.tabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  fiscalYear = '1405';

  isLoading = false;
  allInvoices: ExpenseInvoice[] = [];
  items: ExpenseInvoice[] = [];

  statusCounters = {
    pending_audit: 0,
    booked: 0,
    all: 0
  };

  private routeSub?: Subscription;
  private docSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['pending_audit', 'booked', 'all'].includes(params['tab'])) {
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

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    }
    this.isLoadingSections = false;
    this.fetchInvoices();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchInvoices();
  }

  switchSubTab(tab: string): void {
    if (tab !== 'pending_audit' && tab !== 'booked' && tab !== 'all') {
      return;
    }
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.updateViewAndCounters();
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
        this.toast.error('خطا در دریافت فاکتورهای حسابداری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    const list = this.allInvoices;
    this.statusCounters = {
      pending_audit: list.filter(x => x.status === 'pending_accountant').length,
      booked: list.filter(x => ['pending_manager', 'ready_to_pay', 'paid'].includes(x.status)).length,
      all: list.length
    };

    if (this.activeSubTab === 'pending_audit') {
      this.items = list.filter(x => x.status === 'pending_accountant');
    } else if (this.activeSubTab === 'booked') {
      this.items = list.filter(x => ['pending_manager', 'ready_to_pay', 'paid'].includes(x.status));
    } else {
      this.items = list;
    }
  }

  bookDocument(item: ExpenseInvoice): void {
    if (!item.id) return;
    this.isLoading = true;
    this.personnelApi.approveExpenseInvoice(item.id).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.success(`سند حسابداری فاکتور ${item.invoice_number || ''} صادر و پرونده جهت تایید نهایی به مدیر ارسال شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در صدور سند حسابداری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  isReasonDialogOpen = false;
  reasonDialogTitle = '';
  reasonDialogConfirmLabel = 'بازگرداندن به سرپرست';
  reasonDialogServerError = '';
  pendingRejectInvoice: ExpenseInvoice | null = null;

  rejectDocument(item: ExpenseInvoice): void {
    if (!item.id) return;
    this.pendingRejectInvoice = item;
    this.reasonDialogTitle = `علت بازگرداندن فاکتور شماره ${item.invoice_number || ''} به سرپرست`;
    this.reasonDialogConfirmLabel = 'بازگرداندن به سرپرست';
    this.reasonDialogServerError = '';
    this.isReasonDialogOpen = true;
  }

  onReasonConfirmed(reason: string): void {
    if (!this.pendingRejectInvoice?.id) return;
    const invNumber = this.pendingRejectInvoice.invoice_number || '';
    this.isLoading = true;
    this.personnelApi.requestRevisionExpenseInvoice(this.pendingRejectInvoice.id, reason).subscribe({
      next: () => {
        this.isLoading = false;
        this.isReasonDialogOpen = false;
        this.pendingRejectInvoice = null;
        this.toast.warning(`فاکتور شماره ${invNumber} جهت بازنگری به سرپرست برگردانده شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        const detail = err.error?.detail || err.error?.error || err.message || 'خطا در ارجاع به بازنگری';
        this.reasonDialogServerError = detail;
        this.toast.error('خطا در ارجاع به بازنگری: ' + detail);
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
    this.toast.info('در حال تولید فایل اکسل ممیزی فاکتورها...');
    this.personnelApi.exportExpenseInvoicesExcel({
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending_audit' ? 'pending_accountant' : undefined
    }).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `Accountant_Invoices_${this.selectedSectionId || 'all'}.xlsx`);
        this.toast.success('فایل اکسل ممیزی فاکتورها دریافت شد.');
      },
      error: () => {
        this.toast.error('خطا در دانلود فایل اکسل.');
      }
    });
  }

  importExcel(): void {
    this.toast.info('قالب اکسل فاکتورهای حسابداری آماده بارگیری است.');
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.fetchInvoices();
  }
}
