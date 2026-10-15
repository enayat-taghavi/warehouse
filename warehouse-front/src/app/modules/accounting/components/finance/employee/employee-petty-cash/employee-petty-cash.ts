import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ProjectSection,
  Counterparty,
  PettyCashTransaction,
  PettyCashBalanceSummary
} from '../../../../../../core/models/personnel.model';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';
import { validateSheba, ShebaValidationResult } from '../../../../../../core/utils/sheba-utils';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type PettyCashStatusTab = 'all' | 'draft' | 'pending_supervisor' | 'approved' | 'allocation' | 'rejected';

@Component({
  selector: 'app-employee-petty-cash-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ActionButtonComponent, TabBarComponent, CommandCenterComponent],
  templateUrl: './employee-petty-cash.html',
  styleUrl: './employee-petty-cash.css'
})
export class EmployeePettyCashHubComponent implements OnInit {
  readonly Math = Math;

  // Memoized tabs for app-tab-bar
  private pettyCashStatusTabsKey = '';
  private pettyCashStatusTabsCache: TabDef[] = [];
  get pettyCashStatusTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.all}:${sc.draft}:${sc.pending_supervisor}:${sc.approved}:${sc.allocation}:${sc.rejected}`;
    if (key !== this.pettyCashStatusTabsKey) {
      this.pettyCashStatusTabsKey = key;
      this.pettyCashStatusTabsCache = [
        { id: 'all', label: 'همه اسناد', shortLabel: 'همه', icon: 'status-all', count: sc.all },
        { id: 'draft', label: 'پیش‌نویس', icon: 'status-draft', count: sc.draft },
        { id: 'pending_supervisor', label: 'در انتظار سرپرست', shortLabel: 'سرپرست', icon: 'status-pending', count: sc.pending_supervisor },
        { id: 'approved', label: 'تایید و تسویه‌شده', shortLabel: 'تسویه', icon: 'status-approved', count: sc.approved },
        { id: 'allocation', label: 'شارژهای دریافتی', shortLabel: 'شارژ', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, count: sc.allocation },
        { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected', count: sc.rejected },
      ];
    }
    return this.pettyCashStatusTabsCache;
  }

  // ─── مدیریت بخش و ایزولاسیون داده‌ها (Guardian G1: Section Isolation) ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  // ─── شاخص‌های کلیدی مانده و گردش تنخواه ───
  balanceSummary: PettyCashBalanceSummary | null = null;
  isLoadingBalance: boolean = false;

  // ─── لیست تراکنش‌ها و وضعیت بارگذاری ───
  transactions: PettyCashTransaction[] = [];
  isLoading: boolean = false;
  isSaving: boolean = false;

  // ─── جستجو و فیلتر کارتابل ───
  transactionSearch: string = '';
  statusFilter: PettyCashStatusTab = 'all';

  // ─── لیست طرف‌های حساب ───
  counterparties: Counterparty[] = [];
  isLoadingCounterparties: boolean = false;

  // ─── دسته‌بندی‌های استاندارد هزینه تنخواه ───
  readonly expenseCategories: string[] = [
    'ملزومات و مصرفی کارگاه',
    'پذیرایی و آبدارخانه',
    'سوخت و روغن اضطراری',
    'کرایه و ایاب و ذهاب',
    'تعمیرات جزئی و خدمات فنی',
    'ابزارآلات و قطعات خرد',
    'شارژ مجدد تنخواه',
    'متفرقه'
  ];

  // ─── مودال ثبت هزینه از محل تنخواه (Guardian G2: Draft Invariant) ───
  isNewExpenseModalOpen: boolean = false;
  newExpense: Partial<PettyCashTransaction> = {
    title: '',
    transaction_date_shamsi: '',
    amount: 0,
    category: 'ملزومات و مصرفی کارگاه',
    counterparty: undefined,
    receipt_number: '',
    description: '',
    transaction_type: 'expense',
    status: 'draft'
  };
  selectedExpenseAttachment: File | null = null;
  attachmentFileName: string = '';

  // ─── مودال درخواست شارژ مجدد تنخواه (Replenishment Request) ───
  isReplenishModalOpen: boolean = false;
  replenishData = {
    amount: 0,
    title: 'درخواست شارژ مجدد تنخواه گردان',
    description: '',
    receipt_number: ''
  };

  // ─── مودال تعریف سریع طرف‌حساب ───
  isQuickCounterpartyModalOpen: boolean = false;
  newCounterparty: Partial<Counterparty> = {
    name: '',
    counterparty_type: 'other',
    phone: '',
    national_id: '',
    bank_name: '',
    account_number: '',
    sheba_number: '',
    is_active: true
  };
  shebaValidationResult: ShebaValidationResult | null = null;

  // ─── مودال پیش‌نمایش تصویر پیوست ───
  isAttachmentPreviewModalOpen: boolean = false;
  previewAttachmentUrl: string | null = null;
  previewTxTitle: string = '';

  // ─── تاریخ شمسی امروز ───
  todayShamsi: string = '';

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initTodayShamsi();
    this.loadMySections();
    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && sId !== this.selectedSectionId) {
          this.selectedSectionId = sId;
          this.selectedSection = this.mySections.find(s => s.id === sId) || null;
          if (this.selectedSectionId) {
            this.refreshData();
          }
        }
      }
    });
  }

  private initTodayShamsi(): void {
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    this.todayShamsi = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }

  // ─── بارگذاری بخش‌های مجاز کاربر ───
  loadMySections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            this.personnelApi.getProjectSections({ is_active: true }).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => {
                this.isLoadingSections = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.cdr.detectChanges();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      if (this.selectedSectionId) {
        this.refreshData();
      }
    }
    this.isLoadingSections = false;
    this.cdr.detectChanges();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.refreshData();
  }

  refreshData(): void {
    this.loadBalanceSummary();
    this.loadTransactions();
    this.loadCounterparties();
  }

  // ─── بارگذاری مانده و شاخص‌های لحظه‌ای تنخواه (Guardian G1) ───
  loadBalanceSummary(): void {
    if (!this.selectedSectionId) return;
    this.isLoadingBalance = true;
    this.personnelApi.getPettyCashBalance(this.selectedSectionId).subscribe({
      next: (res: PettyCashBalanceSummary) => {
        this.balanceSummary = res;
        this.isLoadingBalance = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingBalance = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── بارگذاری تراکنش‌ها و اسناد تنخواه ───
  loadTransactions(): void {
    if (!this.selectedSectionId) return;
    this.isLoading = true;
    this.personnelApi.getPettyCashTransactions({ section_id: this.selectedSectionId }).subscribe({
      next: (res: PettyCashTransaction[]) => {
        this.transactions = res || [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.show('error', 'خطا در بارگذاری تراکنش‌های تنخواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── بارگذاری طرف‌های حساب ───
  loadCounterparties(): void {
    this.isLoadingCounterparties = true;
    this.personnelApi.getCounterparties().subscribe({
      next: (res: any) => {
        this.counterparties = Array.isArray(res) ? res : (res?.results || []);
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingCounterparties = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── فیلتر هوشمند تراکنش‌ها بر اساس تب و متن جستجو ───
  get filteredTransactions(): PettyCashTransaction[] {
    let list = this.transactions;

    if (this.statusFilter === 'draft') {
      list = list.filter(t => t.status === 'draft');
    } else if (this.statusFilter === 'pending_supervisor') {
      list = list.filter(t => t.status === 'pending_supervisor');
    } else if (this.statusFilter === 'approved') {
      list = list.filter(t => t.status === 'approved');
    } else if (this.statusFilter === 'allocation') {
      list = list.filter(t => t.transaction_type === 'allocation');
    } else if (this.statusFilter === 'rejected') {
      list = list.filter(t => t.status === 'rejected');
    }

    const q = this.transactionSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.receipt_number && t.receipt_number.toLowerCase().includes(q)) ||
        (t.counterparty_name && t.counterparty_name.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return list;
  }

  // ─── شمارنده‌های تب‌های وضعیت ───
  get statusCounters(): Record<PettyCashStatusTab, number> {
    return {
      all: this.transactions.length,
      draft: this.transactions.filter(t => t.status === 'draft').length,
      pending_supervisor: this.transactions.filter(t => t.status === 'pending_supervisor').length,
      approved: this.transactions.filter(t => t.status === 'approved').length,
      allocation: this.transactions.filter(t => t.transaction_type === 'allocation').length,
      rejected: this.transactions.filter(t => t.status === 'rejected').length
    };
  }

  setStatusFilter(tab: string): void {
    if (
      tab === 'all' ||
      tab === 'draft' ||
      tab === 'pending_supervisor' ||
      tab === 'approved' ||
      tab === 'allocation' ||
      tab === 'rejected'
    ) {
      this.statusFilter = tab;
    }
  }

  // ─── مودال ثبت هزینه از محل تنخواه (Guardian G2: Force draft) ───
  openNewExpenseModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    this.newExpense = {
      section: this.selectedSectionId,
      title: '',
      transaction_date_shamsi: this.todayShamsi,
      amount: 0,
      category: 'ملزومات و مصرفی کارگاه',
      counterparty: undefined,
      receipt_number: '',
      description: '',
      transaction_type: 'expense',
      status: 'draft' // Guardian G2
    };
    this.selectedExpenseAttachment = null;
    this.attachmentFileName = '';
    this.isNewExpenseModalOpen = true;
    this.cdr.detectChanges();
  }

  closeNewExpenseModal(): void {
    this.isNewExpenseModalOpen = false;
    this.cdr.detectChanges();
  }

  get expenseAmountTomans(): number {
    return Math.floor((Number(this.newExpense.amount) || 0) / 10);
  }

  onExpenseFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        this.toast.show('warning', 'حجم فایل پیوست نباید بیشتر از ۱۰ مگابایت باشد.');
        return;
      }
      this.selectedExpenseAttachment = file;
      this.attachmentFileName = file.name;
    }
  }

  removeSelectedAttachment(): void {
    this.selectedExpenseAttachment = null;
    this.attachmentFileName = '';
  }

  saveExpense(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'بخش فعال مشخص نیست.');
      return;
    }
    if (!this.newExpense.title?.trim()) {
      this.toast.show('warning', 'عنوان یا شرح مختصر هزینه الزامی است.');
      return;
    }
    if (!this.newExpense.transaction_date_shamsi?.trim()) {
      this.toast.show('warning', 'تاریخ هزینه الزامی است.');
      return;
    }
    if (!this.newExpense.amount || this.newExpense.amount <= 0) {
      this.toast.show('warning', 'مبلغ هزینه باید بزرگتر از صفر ریال باشد.');
      return;
    }

    this.isSaving = true;
    let payload: Partial<PettyCashTransaction> | FormData;

    if (this.selectedExpenseAttachment) {
      const formData = new FormData();
      formData.append('section', String(this.selectedSectionId));
      formData.append('title', this.newExpense.title.trim());
      formData.append('transaction_date_shamsi', this.newExpense.transaction_date_shamsi.trim());
      formData.append('amount', String(this.newExpense.amount));
      formData.append('category', this.newExpense.category || 'متفرقه');
      formData.append('transaction_type', 'expense');
      formData.append('status', 'draft'); // Guardian G2
      if (this.newExpense.counterparty) {
        formData.append('counterparty', String(this.newExpense.counterparty));
      }
      if (this.newExpense.receipt_number) {
        formData.append('receipt_number', this.newExpense.receipt_number.trim());
      }
      if (this.newExpense.description) {
        formData.append('description', this.newExpense.description.trim());
      }
      formData.append('attachment', this.selectedExpenseAttachment);
      payload = formData;
    } else {
      payload = {
        section: this.selectedSectionId,
        title: this.newExpense.title.trim(),
        transaction_date_shamsi: this.newExpense.transaction_date_shamsi.trim(),
        amount: this.newExpense.amount,
        category: this.newExpense.category || 'متفرقه',
        counterparty: this.newExpense.counterparty || undefined,
        receipt_number: this.newExpense.receipt_number?.trim() || undefined,
        description: this.newExpense.description?.trim() || '',
        transaction_type: 'expense',
        status: 'draft' // Guardian G2
      };
    }

    this.personnelApi.createPettyCashTransaction(payload).subscribe({
      next: (created: PettyCashTransaction) => {
        this.isSaving = false;
        this.toast.show('success', `هزینه «${created.title}» با موفقیت در وضعیت پیش‌نویس ثبت شد.`);
        this.closeNewExpenseModal();
        this.refreshData();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت سند تنخواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ارسال سند تنخواه به سرپرست کارگاه ───
  sendToSupervisor(tx: PettyCashTransaction): void {
    if (!tx.id) return;
    if (tx.status !== 'draft') {
      this.toast.show('warning', 'فقط اسناد در وضعیت پیش‌نویس قابلیت ارسال به سرپرست را دارند.');
      return;
    }

    if (!confirm(`آیا از ارسال سند تنخواه «${tx.title}» به مبلغ ${Number(tx.amount).toLocaleString()} ریال به سرپرست اطمینان دارید؟`)) {
      return;
    }

    this.isSaving = true;
    this.personnelApi.updatePettyCashTransaction(tx.id, { status: 'pending_supervisor' }).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `سند تنخواه «${tx.title}» با موفقیت به کارتابل سرپرست ارسال شد.`);
        this.refreshData();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ارسال به سرپرست: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── حذف سند پیش‌نویس ───
  deleteDraftTransaction(tx: PettyCashTransaction): void {
    if (!tx.id) return;
    if (tx.status !== 'draft') {
      this.toast.show('warning', 'تنها اسناد در وضعیت پیش‌نویس توسط کارمند قابل حذف هستند.');
      return;
    }

    if (!confirm(`آیا از حذف سند پیش‌نویس «${tx.title}» اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`)) {
      return;
    }

    this.isSaving = true;
    this.personnelApi.deletePettyCashTransaction(tx.id).subscribe({
      next: () => {
        this.isSaving = false;
        this.toast.show('success', `سند پیش‌نویس «${tx.title}» حذف شد.`);
        this.refreshData();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در حذف سند: ' + (err.error?.error || err.message || 'نامشخص'));
      }
    });
  }

  // ─── مودال درخواست شارژ مجدد تنخواه ───
  openReplenishModal(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    // پیشنهاد پیش‌فرض مبلغ شارژ: سقف منهای مانده فعلی (یا مبلغ پیش‌فرض مناسب)
    const defAmount = Math.max(
      0,
      (this.balanceSummary?.ceiling_amount || 50000000) - (this.balanceSummary?.current_balance || 0)
    );
    this.replenishData = {
      amount: defAmount > 0 ? defAmount : 20000000,
      title: 'درخواست واریز و شارژ تنخواه گردان',
      description: '',
      receipt_number: ''
    };
    this.isReplenishModalOpen = true;
    this.cdr.detectChanges();
  }

  closeReplenishModal(): void {
    this.isReplenishModalOpen = false;
    this.cdr.detectChanges();
  }

  get replenishAmountTomans(): number {
    return Math.floor((Number(this.replenishData.amount) || 0) / 10);
  }

  submitReplenishment(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'بخش فعال مشخص نیست.');
      return;
    }
    if (!this.replenishData.amount || this.replenishData.amount <= 0) {
      this.toast.show('warning', 'مبلغ درخواستی باید بزرگتر از صفر ریال باشد.');
      return;
    }

    this.isSaving = true;
    this.personnelApi.requestPettyCashReplenishment({
      section_id: this.selectedSectionId,
      amount: this.replenishData.amount,
      title: this.replenishData.title.trim() || 'درخواست شارژ مجدد تنخواه',
      description: this.replenishData.description.trim(),
      receipt_number: this.replenishData.receipt_number.trim()
    }).subscribe({
      next: (tx: PettyCashTransaction) => {
        this.isSaving = false;
        this.toast.show('success', `درخواست شارژ به مبلغ ${Number(tx.amount).toLocaleString()} ریال با موفقیت ثبت و ارسال شد.`);
        this.closeReplenishModal();
        this.refreshData();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت درخواست شارژ: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── مودال تعریف سریع طرف‌حساب ───
  openQuickCounterpartyModal(): void {
    this.newCounterparty = {
      name: '',
      counterparty_type: 'other',
      phone: '',
      national_id: '',
      bank_name: '',
      account_number: '',
      sheba_number: '',
      is_active: true
    };
    this.shebaValidationResult = null;
    this.isQuickCounterpartyModalOpen = true;
    this.cdr.detectChanges();
  }

  closeQuickCounterpartyModal(): void {
    this.isQuickCounterpartyModalOpen = false;
    this.cdr.detectChanges();
  }

  onShebaInput(): void {
    if (!this.newCounterparty.sheba_number) {
      this.shebaValidationResult = null;
      return;
    }
    const val = this.newCounterparty.sheba_number.trim();
    this.shebaValidationResult = validateSheba(val);
    if (this.shebaValidationResult.isValid && this.shebaValidationResult.bank) {
      this.newCounterparty.bank_name = this.shebaValidationResult.bank.name;
    }
  }

  saveQuickCounterparty(): void {
    if (!this.newCounterparty.name?.trim()) {
      this.toast.show('warning', 'نام شخص یا فروشگاه الزامی است.');
      return;
    }

    this.isSaving = true;
    const payload = {
      ...this.newCounterparty,
      name: this.newCounterparty.name.trim(),
      phone: this.newCounterparty.phone?.trim() || undefined,
      national_id: this.newCounterparty.national_id?.trim() || undefined,
      sheba_number: this.newCounterparty.sheba_number?.trim() || undefined,
      bank_name: this.newCounterparty.bank_name?.trim() || undefined,
      account_number: this.newCounterparty.account_number?.trim() || undefined,
      is_active: true
    };

    this.personnelApi.createCounterparty(payload).subscribe({
      next: (created: Counterparty) => {
        this.isSaving = false;
        this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت افزوده شد.`);
        this.closeQuickCounterpartyModal();
        this.loadCounterparties();
        if (this.isNewExpenseModalOpen && created.id) {
          this.newExpense.counterparty = created.id;
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', 'خطا در ثبت طرف‌حساب: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── پیش‌نمایش تصویر پیوست ───
  openAttachmentPreview(tx: PettyCashTransaction): void {
    if (!tx.attachment) return;
    this.previewAttachmentUrl = tx.attachment;
    this.previewTxTitle = `پیوست سند: ${tx.title} - ${tx.counterparty_name || ''}`;
    this.isAttachmentPreviewModalOpen = true;
    this.cdr.detectChanges();
  }

  closeAttachmentPreview(): void {
    this.isAttachmentPreviewModalOpen = false;
    this.previewAttachmentUrl = null;
    this.previewTxTitle = '';
    this.cdr.detectChanges();
  }

  // ─── خروجی اکسل رسمی تراکنش‌های تنخواه ───
  exportExcel(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش را انتخاب کنید.');
      return;
    }
    const params: Record<string, any> = {
      section_id: this.selectedSectionId
    };
    if (this.statusFilter === 'draft' || this.statusFilter === 'pending_supervisor' || this.statusFilter === 'approved' || this.statusFilter === 'rejected') {
      params['status'] = this.statusFilter;
    } else if (this.statusFilter === 'allocation') {
      params['transaction_type'] = 'allocation';
    }

    this.toast.show('info', 'در حال صدور فایل اکسل گردش تنخواه‌گردان...');
    this.personnelApi.exportPettyCashTransactionsExcel(params).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `petty_cash_${this.selectedSection?.code || 'section'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.show('success', 'فایل اکسل گردش تنخواه با موفقیت دریافت شد.');
      },
      error: () => {
        this.toast.show('error', 'خطا در تولید فایل اکسل تنخواه.');
      }
    });
  }
}
