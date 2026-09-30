import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { ProjectSection, ExpenseInvoice } from '../../../../core/models/personnel.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-accountant-invoices-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './accountant-invoices.html',
  styleUrl: './accountant-invoices.css'
})
export class AccountantInvoicesHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_audit' | 'booked' | 'all' = 'pending_audit';

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

  switchSubTab(tab: 'pending_audit' | 'booked' | 'all'): void {
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

  rejectDocument(item: ExpenseInvoice): void {
    if (!item.id) return;
    const reason = window.prompt(`علت بازگرداندن فاکتور شماره ${item.invoice_number || ''} به سرپرست را وارد کنید:`);
    if (reason === null) return;
    if (!reason.trim()) {
      this.toast.warning('ثبت دلیل عودت الزامی است.');
      return;
    }
    this.isLoading = true;
    this.personnelApi.requestRevisionExpenseInvoice(item.id, reason.trim()).subscribe({
      next: () => {
        this.isLoading = false;
        this.toast.warning(`فاکتور شماره ${item.invoice_number || ''} جهت بازنگری به سرپرست برگردانده شد.`);
        this.fetchInvoices();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در ارجاع به بازنگری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  exportExcel(): void {
    this.toast.info('در حال تولید فایل اکسل ممیزی فاکتورها...');
    this.personnelApi.exportExpenseInvoicesExcel({
      section_id: this.selectedSectionId || undefined,
      status: this.activeSubTab === 'pending_audit' ? 'pending_accountant' : undefined
    }).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Accountant_Invoices_${this.selectedSectionId || 'all'}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
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
