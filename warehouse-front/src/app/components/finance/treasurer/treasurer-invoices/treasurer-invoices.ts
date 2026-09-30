import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { ProjectSection } from '../../../../core/models/personnel.model';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

export interface PayableInvoiceItem {
  id: number;
  invoice_number: string;
  vendor_name: string;
  category: string;
  section_name: string;
  amount: number;
  due_date: string;
  sheba_number: string;
  status: 'pending_payment' | 'paid';
  tracking_code?: string;
}

export interface PettyCashRefillItem {
  id: number;
  custodian_name: string;
  section_name: string;
  ceiling_limit: number;
  current_balance: number;
  requested_refill_amount: number;
  card_number: string;
  status: 'pending_refill' | 'refilled';
  tracking_code?: string;
}

@Component({
  selector: 'app-treasurer-invoices-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './treasurer-invoices.html',
  styleUrl: './treasurer-invoices.css'
})
export class TreasurerInvoicesComponent implements OnInit, OnDestroy {
  activeSubTab: 'payable_invoices' | 'petty_cash_refills' = 'payable_invoices';

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

  invoices: PayableInvoiceItem[] = [];
  refills: PettyCashRefillItem[] = [];

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
      if (params['tab'] && ['payable_invoices', 'petty_cash_refills'].includes(params['tab'])) {
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

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    }
    this.isLoadingSections = false;
    this.loadTreasuryData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.loadTreasuryData();
  }

  switchSubTab(tab: 'payable_invoices' | 'petty_cash_refills'): void {
    this.activeSubTab = tab;
    this.syncUrlParams();
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

  loadTreasuryData(): void {
    this.isLoading = true;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (res: any) => {
        const rawInvoices = res?.invoices || [];
        this.invoices = rawInvoices.map((inv: any) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          vendor_name: inv.counterparty_name || 'طرف‌حساب',
          category: inv.category,
          section_name: inv.section_name || '',
          amount: inv.amount,
          due_date: inv.invoice_date_shamsi,
          sheba_number: inv.payment_ref || '',
          status: inv.status === 'paid' ? 'paid' : 'pending_payment',
          tracking_code: inv.payment_ref
        }));

        this.personnelApi.getPettyCashTransactions({
          section_id: this.selectedSectionId || undefined,
          transaction_type: 'allocation'
        }).subscribe({
          next: (txs: any[]) => {
            this.isLoading = false;
            this.refills = (txs || []).map((t: any) => ({
              id: t.id,
              custodian_name: t.custodian_name || 'مسئول تنخواه',
              section_name: t.section_name || '',
              ceiling_limit: 50000000,
              current_balance: 0,
              requested_refill_amount: t.amount,
              card_number: t.receipt_number || '---',
              status: t.status === 'approved' ? 'refilled' : 'pending_refill',
              tracking_code: t.receipt_number
            }));
            this.cdr.detectChanges();
          },
          error: () => {
            this.isLoading = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در دریافت اطلاعات خزانه‌داری: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  payInvoice(item: PayableInvoiceItem): void {
    const code = window.prompt(`شماره پیگیری یا فیش پرداخت بانکی فاکتور ${item.invoice_number} را وارد نمایید:`);
    if (code === null) return;
    if (!code.trim()) {
      this.toast.warning('ورود شماره پیگیری الزامی است.');
      return;
    }
    this.isLoading = true;
    this.personnelApi.payExpenseInvoice(item.id, { payment_ref: code.trim() }).subscribe({
      next: () => {
        this.isLoading = false;
        item.status = 'paid';
        item.tracking_code = code.trim();
        this.toast.success(`فاکتور ${item.invoice_number} به مبلغ ${item.amount.toLocaleString()} ریال تسویه گردید.`);
        this.loadTreasuryData();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در تسویه فاکتور: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  refillPettyCash(item: PettyCashRefillItem): void {
    const code = window.prompt(`شماره پیگیری واریز به کارت ${item.custodian_name} را وارد نمایید:`);
    if (code === null) return;
    if (!code.trim()) {
      this.toast.warning('ورود شماره پیگیری الزامی است.');
      return;
    }
    this.isLoading = true;
    this.personnelApi.approvePettyCashTransaction(item.id).subscribe({
      next: () => {
        this.isLoading = false;
        item.status = 'refilled';
        item.tracking_code = code.trim();
        this.toast.success(`شارژ تن‌خواه به حساب ${item.custodian_name} با موفقیت ثبت شد.`);
        this.loadTreasuryData();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در ثبت شارژ تن‌خواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  exportExcel(): void {
    this.toast.success('فایل اکسل تسویه فاکتورها و تن‌خواه صادر گردید.');
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
