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

export interface DisbursementQueueItem {
  id: number;
  type: 'payroll' | 'fleet';
  title: string;
  recipient_name: string;
  sheba_number: string;
  bank_name: string;
  section_name: string;
  amount: number;
  approved_by_manager: boolean;
  status: 'pending_payment' | 'paid';
  tracking_code?: string;
  payment_date?: string;
}

@Component({
  selector: 'app-treasurer-disbursements-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './treasurer-disbursements.html',
  styleUrl: './treasurer-disbursements.css'
})
export class TreasurerDisbursementsComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_queue' | 'disbursed_archive' = 'pending_queue';

  // Section Isolation
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Fiscal Context & Filters
  searchQuery = '';
  fiscalYear = '1405';
  selectedMonth = 'تیر';
  selectedPaymentType: 'all' | 'payroll' | 'fleet' = 'all';

  // State
  isLoading = false;
  items: DisbursementQueueItem[] = [];
  currentPeriodId: number | null = null;

  // Pay Single Modal
  isPayModalOpen = false;
  payingItem: DisbursementQueueItem | null = null;
  paymentMethod = 'PAYA';
  trackingCodeInput = '';

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
      if (params['tab'] && ['pending_queue', 'disbursed_archive'].includes(params['tab'])) {
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
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
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
    this.refreshData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.refreshData();
  }

  switchSubTab(tab: 'pending_queue' | 'disbursed_archive'): void {
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

  get filteredItems(): DisbursementQueueItem[] {
    let list = this.items;
    if (this.activeSubTab === 'pending_queue') {
      list = list.filter(x => x.status === 'pending_payment');
    } else {
      list = list.filter(x => x.status === 'paid');
    }

    if (this.selectedPaymentType !== 'all') {
      list = list.filter(x => x.type === this.selectedPaymentType);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(x =>
        x.recipient_name.toLowerCase().includes(q) ||
        x.sheba_number.toLowerCase().includes(q) ||
        x.title.toLowerCase().includes(q)
      );
    }
    return list;
  }

  get pendingTotalAmount(): number {
    return this.items
      .filter(x => x.status === 'pending_payment')
      .reduce((sum, item) => sum + item.amount, 0);
  }

  openPayModal(item: DisbursementQueueItem): void {
    this.payingItem = item;
    const now = new Date();
    this.trackingCodeInput = `PAY-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getTime().toString().slice(-6)}`;
    this.isPayModalOpen = true;
  }

  closePayModal(): void {
    this.isPayModalOpen = false;
    this.payingItem = null;
  }

  confirmDisbursement(): void {
    if (!this.payingItem) return;
    if (!this.trackingCodeInput.trim()) {
      this.toast.warning('لطفاً شناسه پیگیری پرداخت بانکی را وارد نمایید.');
      return;
    }

    const payload: any = {
      tracking_code: this.trackingCodeInput.trim()
    };

    if (this.payingItem.type === 'payroll') {
      payload.action = 'disburse_single_payroll';
      payload.payroll_id = this.payingItem.id;
    } else {
      payload.action = 'disburse_fleet';
      payload.trip_ids = [this.payingItem.id];
    }

    this.personnelApi.disburseTreasury(payload).subscribe({
      next: () => {
        this.toast.success(`پرداخت مبلغ ${this.payingItem?.amount.toLocaleString()} ریال با شناسه پیگیری ${this.trackingCodeInput} قطعی شد.`);
        this.closePayModal();
        this.refreshData();
      },
      error: (err: any) => {
        const msg = err?.error?.error || 'خطا در ثبت تسویه و پرداخت خزانه‌داری.';
        this.toast.error(msg);
      }
    });
  }

  generateBatchPayaFile(): void {
    if (!this.currentPeriodId) {
      this.toast.warning('دوره فعالی برای صدور دیسکت پایا انتخاب نشده است.');
      return;
    }
    this.toast.info('در حال تولید فایل انتقال وجه بین‌بانکی پایا...');
    this.personnelApi.exportTreasuryDiskette(this.currentPeriodId, 'paya').subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PAYA_Batch_${this.currentPeriodId}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل پایا با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل دیسکت پایا.');
      }
    });
  }

  exportExcel(): void {
    if (!this.currentPeriodId) {
      this.toast.warning('دوره فعالی جهت خروجی اکسل یافت نشد.');
      return;
    }
    this.personnelApi.exportMonthlyPayrollExcel(this.currentPeriodId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Treasury_Disbursements_${this.fiscalYear}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل اکسل پرداخت‌های خزانه‌داری صادر گردید.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل اکسل خزانه‌داری.');
      }
    });
  }

  refreshData(): void {
    this.isLoading = true;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (data: any) => {
        this.isLoading = false;
        const newItems: DisbursementQueueItem[] = [];

        // Map Payrolls
        if (data?.payrolls && Array.isArray(data.payrolls)) {
          for (const p of data.payrolls) {
            if (p.period_id && !this.currentPeriodId) {
              this.currentPeriodId = p.period_id;
            }
            newItems.push({
              id: p.id,
              type: 'payroll',
              title: `حقوق دوره ${p.period_year_month || this.selectedMonth + ' ' + this.fiscalYear}`,
              recipient_name: p.personnel_name || p.full_name || 'کارمند',
              sheba_number: p.sheba_number || p.bank_account_number || 'فاقد شبا',
              bank_name: p.bank_name || 'بانک عامل',
              section_name: p.section_name || 'پرسنل شرکت',
              amount: Number(p.net_salary || p.payable_amount || 0),
              approved_by_manager: true,
              status: p.payment_status === 'PAID' ? 'paid' : 'pending_payment',
              tracking_code: p.payment_tracking_code || '',
              payment_date: p.paid_at || ''
            });
          }
        }

        // Map Trips
        if (data?.trips && Array.isArray(data.trips)) {
          for (const t of data.trips) {
            newItems.push({
              id: t.id,
              type: 'fleet',
              title: `تسویه تردد ناوگان (${t.plate_number || ''})`,
              recipient_name: t.driver_name || 'راننده',
              sheba_number: t.sheba_number || 'فاقد شبا',
              bank_name: t.bank_name || 'بانک عامل',
              section_name: 'ترابری و ناوگان',
              amount: Number(t.total_amount || 0),
              approved_by_manager: true,
              status: t.is_settled ? 'paid' : 'pending_payment',
              tracking_code: '',
              payment_date: t.date_shamsi || ''
            });
          }
        }

        this.items = newItems;
        this.toast.info('صف دستور پرداخت‌های مصوب خزانه‌داری به‌روزرسانی شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.toast.error('خطا در بارگذاری کارتابل پرداخت خزانه‌داری.');
        this.cdr.detectChanges();
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
