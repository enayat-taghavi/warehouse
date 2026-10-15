import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../../../core/api/personnel-api.service';
import { ProjectSection, ExpenseInvoice } from '../../../../../../core/models/personnel.model';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';

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
        label: 'کل فاکتورها',
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

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

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
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
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
    if (tab === 'pending' || tab === 'approved' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.updateViewAndCounters();
    }
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

  fetchInvoices(): void {
    this.isLoading = true;
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
        this.toast.error('خطا در دریافت فاکتورهای هزینه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  updateViewAndCounters(): void {
    const list = this.allInvoices;
    this.statusCounters = {
      pending: list.filter(x => x.status === 'pending_supervisor').length,
      approved: list.filter(x => ['pending_accountant', 'pending_manager', 'ready_to_pay', 'paid'].includes(x.status)).length,
      all: list.length
    };

    if (this.activeSubTab === 'pending') {
      this.items = list.filter(x => x.status === 'pending_supervisor');
    } else if (this.activeSubTab === 'approved') {
      this.items = list.filter(x => ['pending_accountant', 'pending_manager', 'ready_to_pay', 'paid'].includes(x.status));
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
        this.toast.success(`فاکتور شماره ${item.invoice_number || ''} تایید و به کارتابل حسابداری ارسال شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در تایید فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  rejectSingle(item: ExpenseInvoice): void {
    if (!item.id) return;
    const reason = window.prompt(`علت عودت / رد فاکتور شماره ${item.invoice_number || ''} را وارد کنید:`);
    if (reason === null) return;
    if (!reason.trim()) {
      this.toast.warning('ثبت دلیل عودت الزامی است.');
      return;
    }
    this.isLoading = true;
    this.personnelApi.rejectExpenseInvoice(item.id, reason.trim()).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.warning(`فاکتور شماره ${item.invoice_number || ''} با ثبت اشکال عودت داده شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در عودت فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  exportExcel(): void {
    this.toast.info('در حال تولید فایل اکسل فاکتورها...');
    this.personnelApi.exportExpenseInvoicesExcel({
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending' ? 'pending_supervisor' : undefined
    }).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Expense_Invoices_${this.selectedSectionId || 'all'}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل اکسل فاکتورها با موفقیت دریافت شد.');
      },
      error: () => {
        this.toast.error('خطا در دانلود فایل اکسل فاکتورها.');
      }
    });
  }

  importExcel(): void {
    this.toast.info('قالب اکسل فاکتورها بارگیری شد.');
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.fetchInvoices();
  }
}
