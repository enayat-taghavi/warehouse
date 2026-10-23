import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection } from '../../../../models/personnel.model';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ModalFocus } from '../../../../../../core/utils/modal-focus';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';

export interface DisbursementQueueItem {
  id: number;
  /** فقط برای حقوق: شناسهٔ دورهٔ حقوق */
  period_id?: number;
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
  /** پرداخت قبلی به‌علت شبای نامعتبر برگشت خورده است (FAILED_SHEBA) */
  sheba_failed?: boolean;
  failure_reason?: string;
}

/** دورهٔ حقوق مصوب مدیر که آمادهٔ پرداخت یکجاست */
export interface ReadyPayrollPeriod {
  id: number;
  year_month: string;
  status: string;
  manager_approved_at?: string | null;
}

@Component({
  selector: 'app-treasurer-disbursements-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PersianDatePipe,
    LoadingSkeletonComponent,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './treasurer-disbursements.html',
  styleUrl: './treasurer-disbursements.css',
  host: { '(document:keydown.escape)': 'onEscapeKey()', '(document:keydown)': 'onDocumentKeydown($event)' }
})
export class TreasurerDisbursementsComponent implements OnInit, OnDestroy {
  activeSubTab: 'pending_queue' | 'disbursed_archive' = 'pending_queue';

  readonly tabs: TabDef[] = [
    { id: 'pending_queue', label: 'صف پرداخت‌های مصوب', shortLabel: 'صف', icon: STATUS_ICONS.pending },
    { id: 'disbursed_archive', label: 'آرشیو واریزی‌ها', shortLabel: 'آرشیو', icon: STATUS_ICONS.archived }
  ];

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
  loadError = false;
  items: DisbursementQueueItem[] = [];
  currentPeriodId: number | null = null;
  /** دیسکتی که در حال دانلود است: `${periodId}-${type}` */
  downloadingDisketteKey: string | null = null;

  // Pay Single Modal
  isPayModalOpen = false;
  isSubmittingSingle = false;
  payingItem: DisbursementQueueItem | null = null;
  paymentMethod = 'PAYA';
  trackingCodeInput = '';
  batchIdInput = '';

  // شاخص‌ها و دوره‌های آماده پرداخت (منتقل‌شده از کارتابل خزانه‌داری قدیمی)
  treasurySummary = {
    ready_periods_count: 0,
    total_payroll_amount: 0,
    total_fleet_amount: 0,
    total_disbursement_queue: 0
  };
  readyPeriods: ReadyPayrollPeriod[] = [];

  // مودال پرداخت یکجا: کل حقوق یک دوره یا همهٔ سفرهای ناوگان در صف.
  // amount تهی یعنی رکوردهای دوره در صف این صفحه نیستند و مبلغ را سرور هنگام ثبت حساب می‌کند.
  batchModal: { kind: 'period' | 'fleet'; title: string; amount: number | null; periodId?: number; tripIds?: number[] } | null = null;
  batchTrackingCode = '';
  batchIdValue = '';
  batchPaymentMethod = 'PAYA';
  isSubmittingBatch = false;
  private readonly batchFocus = new ModalFocus();

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

  switchSubTab(tab: string): void {
    if (tab === 'pending_queue' || tab === 'disbursed_archive') {
      this.activeSubTab = tab;
      this.syncUrlParams();
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

  /** سفرهای ناوگانِ در صف پرداخت (برای تسویهٔ گروهی) */
  get pendingFleetItems(): DisbursementQueueItem[] {
    return this.items.filter(x => x.type === 'fleet' && x.status === 'pending_payment');
  }

  openPayModal(item: DisbursementQueueItem): void {
    this.payingItem = item;
    const now = new Date();
    this.trackingCodeInput = `PAY-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getTime().toString().slice(-6)}`;
    this.batchIdInput = '';
    this.isPayModalOpen = true;
  }

  closePayModal(): void {
    this.isPayModalOpen = false;
    this.payingItem = null;
  }

  onEscapeKey(): void {
    if (this.batchModal) this.closeBatchModal();
    if (this.isPayModalOpen) {
      this.closePayModal();
      this.cdr.detectChanges();
    }
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if (this.batchModal) this.batchFocus.trapTab(event, 'treasury-batch-dialog');
  }

  // ─── پرداخت یکجای دوره و تسویهٔ گروهی ناوگان ───
  /**
   * جمع حقوق در صفِ همان دوره. اگر رکوردهای دوره در صف این صفحه نباشند، تهی برمی‌گردد
   * تا جمع دوره‌های دیگر به‌جای مبلغ این دوره نمایش داده نشود؛ مبلغ واقعی را سرور هنگام ثبت حساب می‌کند.
   */
  periodPayableAmount(period: ReadyPayrollPeriod): number | null {
    const inQueue = this.items.filter(x => x.type === 'payroll' && x.status === 'pending_payment' && x.period_id === period.id);
    return inQueue.length > 0 ? inQueue.reduce((sum, x) => sum + x.amount, 0) : null;
  }

  openPeriodBatchModal(period: ReadyPayrollPeriod): void {
    const ym = (period.year_month || '').replace('/', '');
    this.batchModal = {
      kind: 'period',
      title: `تسویه کل حقوق دوره ماهانه ${period.year_month}`,
      amount: this.periodPayableAmount(period),
      periodId: period.id
    };
    this.batchTrackingCode = '';
    this.batchIdValue = `BATCH-${ym}-01`;
    this.batchPaymentMethod = 'PAYA';
    this.cdr.detectChanges();
    this.batchFocus.open('treasury-batch-dialog');
  }

  openFleetBatchModal(): void {
    const fleet = this.pendingFleetItems;
    if (fleet.length === 0) {
      this.toast.info('سرویس ناوگان معلقی جهت تسویه وجود ندارد.');
      return;
    }
    this.batchModal = {
      kind: 'fleet',
      title: `تسویه گروهی سفرهای ناوگان (${fleet.length} سفر)`,
      amount: fleet.reduce((sum, x) => sum + x.amount, 0),
      tripIds: fleet.map(x => x.id)
    };
    this.batchTrackingCode = '';
    this.batchIdValue = `BATCH-FLEET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    this.batchPaymentMethod = 'PAYA';
    this.cdr.detectChanges();
    this.batchFocus.open('treasury-batch-dialog');
  }

  closeBatchModal(): void {
    if (this.isSubmittingBatch) return;
    this.batchModal = null;
    this.cdr.detectChanges();
    this.batchFocus.close();
  }

  submitBatchDisbursement(): void {
    if (!this.batchModal || this.isSubmittingBatch) return;
    const trackingCode = this.batchTrackingCode.trim();
    if (!trackingCode) {
      this.toast.warning('وارد کردن شماره پیگیری / کد رهگیری بانکی الزامی است.');
      return;
    }

    const payload: any = {
      action: this.batchModal.kind === 'period' ? 'disburse_period' : 'disburse_fleet',
      tracking_code: trackingCode,
      batch_id: this.batchIdValue.trim()
    };
    if (this.batchModal.kind === 'period') {
      payload.period_id = this.batchModal.periodId;
    } else {
      payload.trip_ids = this.batchModal.tripIds || [];
    }

    this.isSubmittingBatch = true;
    this.personnelApi.disburseTreasury(payload).subscribe({
      next: (res: any) => {
        this.isSubmittingBatch = false;
        this.toast.success(res?.message || 'عملیات پرداخت و تسویه خزانه‌داری با موفقیت انجام شد.');
        this.batchModal = null;
        this.batchFocus.close();
        this.refreshData();
      },
      error: (err: any) => {
        this.isSubmittingBatch = false;
        this.toast.error(err?.error?.detail || err?.error?.error || 'خطا در ثبت پرداخت خزانه‌داری.');
        this.cdr.detectChanges();
      }
    });
  }

  /** دیسکت بانکی دوره (پایا یا ساتنا) با دانلود احراز‌شده */
  downloadPeriodDiskette(period: ReadyPayrollPeriod, type: 'paya' | 'satna'): void {
    if (this.downloadingDisketteKey) return;
    this.downloadingDisketteKey = `${period.id}-${type}`;
    this.personnelApi.exportTreasuryDiskette(period.id, type).pipe(
      finalize(() => {
        this.downloadingDisketteKey = null;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `${type.toUpperCase()}_${(period.year_month || '').replace('/', '')}.csv`);
        this.toast.success(`دیسکت ${type === 'paya' ? 'پایا' : 'ساتنا'} دوره ${period.year_month} دانلود شد.`);
      },
      error: () => {
        this.toast.error(`خطا در دریافت دیسکت ${type === 'paya' ? 'پایا' : 'ساتنا'}.`);
      }
    });
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
    if (this.batchIdInput.trim()) {
      payload.batch_id = this.batchIdInput.trim();
    }

    if (this.payingItem.type === 'payroll') {
      payload.action = 'disburse_single_payroll';
      payload.payroll_id = this.payingItem.id;
    } else {
      payload.action = 'disburse_fleet';
      payload.trip_ids = [this.payingItem.id];
    }

    this.isSubmittingSingle = true;
    this.personnelApi.disburseTreasury(payload).subscribe({
      next: () => {
        this.isSubmittingSingle = false;
        this.toast.success(`پرداخت مبلغ ${this.payingItem?.amount.toLocaleString()} ریال با شناسه پیگیری ${this.trackingCodeInput} قطعی شد.`);
        this.closePayModal();
        this.refreshData();
      },
      error: (err: any) => {
        this.isSubmittingSingle = false;
        const msg = err?.error?.error || 'خطا در ثبت تسویه و پرداخت خزانه‌داری.';
        this.toast.error(msg);
        this.cdr.detectChanges();
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
        void saveBlob(blob, `PAYA_Batch_${this.currentPeriodId}.csv`);
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
        void saveBlob(blob, `Treasury_Disbursements_${this.fiscalYear}.xlsx`);
        this.toast.success('فایل اکسل پرداخت‌های خزانه‌داری صادر گردید.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل اکسل خزانه‌داری.');
      }
    });
  }

  refreshData(): void {
    this.isLoading = true;
    this.loadError = false;
    this.personnelApi.getTreasuryCartable().subscribe({
      next: (data: any) => {
        this.isLoading = false;
        const newItems: DisbursementQueueItem[] = [];

        this.treasurySummary = {
          ready_periods_count: Number(data?.ready_periods_count || 0),
          total_payroll_amount: Number(data?.total_payroll_amount || 0),
          total_fleet_amount: Number(data?.total_fleet_amount || 0),
          total_disbursement_queue: Number(data?.total_disbursement_queue || 0)
        };
        this.readyPeriods = Array.isArray(data?.periods) ? data.periods : [];

        // Map Payrolls
        if (data?.payrolls && Array.isArray(data.payrolls)) {
          for (const p of data.payrolls) {
            // سریالایزر رکورد حقوق شناسهٔ دوره را در فیلد `period` می‌فرستد
            const periodId = typeof p.period === 'object' ? p.period?.id : (p.period ?? p.period_id);
            if (periodId && !this.currentPeriodId) {
              this.currentPeriodId = periodId;
            }
            newItems.push({
              id: p.id,
              period_id: periodId ?? undefined,
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
              payment_date: p.paid_at || '',
              sheba_failed: p.payment_status === 'FAILED_SHEBA',
              failure_reason: p.payment_failure_reason || ''
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
        this.loadError = true;
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
