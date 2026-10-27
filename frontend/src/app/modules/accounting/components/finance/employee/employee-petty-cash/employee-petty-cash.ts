import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional, inject } from '@angular/core';
import { fiscalPeriodClosedMessage } from '../../../../fiscal-period-error';
import { WebSocketService, patchDocumentRow } from '../../../../../../core/http/websocket.service';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ProjectSection,
  Counterparty,
  FinancialProject,
  PettyCashAccount,
  PettyCashStatement,
  PettyCashTransaction,
  PettyCashBalanceSummary,
  PettyCashDebtSettlement
} from '../../../../models/personnel.model';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';
import { validateSheba, ShebaValidationResult } from '../../../../../../core/utils/sheba-utils';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { WorkflowHistoryComponent } from '../../../../../../shared/components/workflow-history/workflow-history.component';
import { ServerUrlPipe } from '../../../../../../shared/pipes/server-url.pipe';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ActiveCompanyService } from '../../../../../../core/services/active-company.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { OfflinePendingBadgeComponent } from '../../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { ExpenseHeadOptionGroup, buildExpenseHeadOptions, expenseHeadErrorMessage, expenseHeadLabel } from '../../expense-head-options';

/** تب‌های وضعیت ردیف‌های هزینه (۳.۶-د): وضعیت ردیف در گردش صورت‌حساب */
export type PettyCashStatusTab = 'all' | 'draft' | 'approved' | 'rejected';
/** زیرتب‌های صفحه: هزینه‌ها، درخواست شارژ، صورت‌حساب‌ها */
export type PettyCashView = 'expenses' | 'charges' | 'statements';
/** نوع موجودیت گردش کار برای سابقه و پیوند عمیق کارتابل */
export type PettyCashDetailKind = 'petty_cash_charge' | 'petty_cash_statement';

const PERM_CEILING = 'perm_manager_payment_authorize';
const PERM_REVIEW = 'perm_invoice_review';
const PERM_TREASURY = 'perm_treasury_disburse_action';
const OFFLINE_MSG = 'برای این کار اتصال به سرور لازم است. اتصال را بررسی کنید و دوباره تلاش کنید.';

import { AmountInputComponent } from '../../../../../../shared/components/amount-input/amount-input.component';

@Component({
  selector: 'app-employee-petty-cash-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, AmountInputComponent, ActionButtonComponent, TabBarComponent, CommandCenterComponent, ServerUrlPipe, WorkflowHistoryComponent, ModalComponent, LoadingSkeletonComponent, OfflinePendingBadgeComponent, SvgIconDirective, NgPersianDatepickerModule],
  templateUrl: './employee-petty-cash.html',
  styleUrl: './employee-petty-cash.css'
})
export class EmployeePettyCashHubComponent implements OnInit, OnDestroy {
  private readonly confirmDialog = (() => { try { return inject(ConfirmDialogService); } catch { return undefined as unknown as ConfirmDialogService; } })();
  readonly Math = Math;

  // ─── زیرتب‌های صفحه ───
  activeView: PettyCashView = 'expenses';
  readonly viewTabs: TabDef[] = [
    { id: 'expenses', label: 'هزینه‌ها', icon: ACCOUNTING_ENTITY_ICONS.pettyCash },
    { id: 'charges', label: 'درخواست شارژ', shortLabel: 'شارژ', icon: 'dollar-sign' },
    { id: 'statements', label: 'صورت‌حساب‌ها', shortLabel: 'صورت‌حساب', icon: 'file-check' },
  ];

  // Memoized tabs for app-tab-bar
  private pettyCashStatusTabsKey = '';
  private pettyCashStatusTabsCache: TabDef[] = [];
  get pettyCashStatusTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.all}:${sc.draft}:${sc.approved}:${sc.rejected}`;
    if (key !== this.pettyCashStatusTabsKey) {
      this.pettyCashStatusTabsKey = key;
      this.pettyCashStatusTabsCache = [
        { id: 'all', label: 'همه هزینه‌ها', shortLabel: 'همه', icon: 'status-all', count: sc.all },
        { id: 'draft', label: 'باز (پیش‌نویس)', shortLabel: 'باز', icon: 'status-draft', count: sc.draft },
        { id: 'approved', label: 'تأییدشده', shortLabel: 'تأیید', icon: 'status-approved', count: sc.approved },
        { id: 'rejected', label: 'ردشده', shortLabel: 'رد', icon: 'status-rejected', count: sc.rejected },
      ];
    }
    return this.pettyCashStatusTabsCache;
  }

  // ─── بخش (اختیاری): فقط فیلتر فهرست و انتخاب اختیاری روی ردیف هزینه ───
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections: boolean = false;

  // ─── پروژه‌های شرکت (انتخاب اختیاری روی ردیف هزینه) ───
  projects: FinancialProject[] = [];

  // ─── حساب تنخواه سطح شرکت، مانده و بدهی ───
  balanceSummary: PettyCashBalanceSummary | null = null;
  isLoadingBalance: boolean = false;
  account: PettyCashAccount | null = null;
  ceilingDraft: number | null = null;
  isSavingCeiling = false;

  // ─── لیست تراکنش‌ها و وضعیت بارگذاری ───
  transactions: PettyCashTransaction[] = [];
  isLoading: boolean = false;
  isSaving: boolean = false;

  // ─── جستجو و فیلتر ───
  transactionSearch: string = '';
  statusFilter: PettyCashStatusTab = 'all';

  // ─── لیست طرف‌های حساب ───
  counterparties: Counterparty[] = [];
  isLoadingCounterparties: boolean = false;

  // ─── سرفصل‌های هزینهٔ فعال شرکت ───
  expenseHeadGroups: ExpenseHeadOptionGroup[] = [];
  isLoadingExpenseHeads: boolean = false;
  /** شرکتی که فهرست سرفصلش بار شده (پاسخ دیررس شرکت پیشین نادیده گرفته می‌شود) */
  private expenseHeadsCompanyId: number | null = null;
  readonly expenseHeadLabel = expenseHeadLabel;
  // ساخت دستی در آزمون‌ها بیرون از زمینهٔ تزریق است (مثل confirmDialog)
  private readonly activeCompanyService = (() => { try { return inject(ActiveCompanyService, { optional: true }); } catch { return null; } })();

  // ─── مودال ثبت هزینه از محل تنخواه (آفلاین مثل قبل ساخته می‌شود) ───
  isNewExpenseModalOpen: boolean = false;
  newExpense: Partial<PettyCashTransaction> = {
    title: '',
    transaction_date_shamsi: '',
    amount: 0,
    expense_head: null,
    counterparty: undefined,
    receipt_number: '',
    description: '',
    transaction_type: 'expense',
    status: 'draft'
  };
  selectedExpenseAttachment: File | null = null;
  attachmentFileName: string = '';

  // ─── درخواست شارژ (فقط آنلاین) ───
  isChargeModalOpen: boolean = false;
  chargeData = {
    amount: 0,
    title: 'درخواست شارژ تنخواه',
    description: ''
  };

  // ─── صورت‌حساب‌ها ───
  statements: PettyCashStatement[] = [];
  isLoadingStatements = false;
  selectedLineIds = new Set<number>();
  isCreatingStatement = false;

  // ─── پنل جزئیات (پیوند عمیق از کارتابل: ?charge= و ?statement=) ───
  detailKind: PettyCashDetailKind | null = null;
  detailId: number | null = null;
  detailTx: PettyCashTransaction | null = null;
  detailStatement: PettyCashStatement | null = null;
  detailLines: PettyCashTransaction[] = [];
  isLoadingDetail = false;
  rejectLineId: number | null = null;
  rejectReason = '';
  rejectReasonError = '';
  trackingCode = '';
  trackingError = '';
  isActing = false;

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

  private docSub?: Subscription;

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() private ws?: WebSocketService
  ) {}

  ngOnDestroy(): void {
    this.docSub?.unsubscribe();
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  ngOnInit(): void {
    this.initTodayShamsi();
    // سند تنخواهی که جای دیگری عوض شد درجا به‌روز می‌شود، وگرنه فهرست بی‌صدا دوباره خوانده می‌شود
    this.docSub = this.ws?.documentChanges$?.(['petty_cash']).subscribe(ev => {
      if (patchDocumentRow(this.transactions, ev)) {
        this.cdr.detectChanges();
      } else {
        this.loadTransactions(true);
        this.loadStatements(true);
        this.loadBalanceSummary();
      }
      if (this.detailKind && this.detailId) this.loadDetail(true);
    });
    this.loadMySections();
    this.refreshData();
    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && sId !== this.selectedSectionId) {
          this.selectedSectionId = sId;
          this.selectedSection = this.mySections.find(s => s.id === sId) || null;
          this.refreshData();
        }
      }
      // پیوند عمیق از «کارهای من»
      const chargeId = Number(params['charge']);
      const statementId = Number(params['statement']);
      if (chargeId > 0) {
        this.activeView = 'charges';
        this.openDetail('petty_cash_charge', chargeId, false);
      } else if (statementId > 0) {
        this.activeView = 'statements';
        this.openDetail('petty_cash_statement', statementId, false);
      }
    });
  }

  private initTodayShamsi(): void {
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    this.todayShamsi = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }

  // ─── دسترسی‌ها ───
  private hasPerm(code: string): boolean {
    const user = this.auth.user();
    const perms = this.auth.userPermissions() || [];
    return !!user?.is_superuser || perms.includes('admin_all') || perms.includes(code);
  }
  get canEditCeiling(): boolean { return this.hasPerm(PERM_CEILING); }
  get canTreasuryPay(): boolean { return this.hasPerm(PERM_TREASURY); }
  get canReviewLines(): boolean { return this.hasPerm(PERM_REVIEW) || this.hasPerm(PERM_CEILING); }
  private get currentUserId(): number | null { return (this.auth.user() as { id?: number } | null)?.id ?? null; }

  /** پیام فارسی خطا؛ قطع اتصال با isServerUnreachable تشخیص داده می‌شود (نه status >= 500) */
  private errorText(err: any, fallback: string): string {
    if (isServerUnreachable(Number(err?.status ?? 0))) return OFFLINE_MSG;
    return this.codeMessage(err) || err?.error?.error || err?.error?.detail || fallback;
  }

  /** پیام فارسی روشن برای کدهای خطای تنخواه (period_locked و account_closed) */
  private codeMessage(err: any): string {
    const code = err?.error?.code;
    if (code === 'period_locked') {
      return 'تاریخ این هزینه در دورهٔ تطبیق‌شده است؛ تاریخ دیرتری انتخاب کنید.';
    }
    if (code === 'account_closed') {
      this.accountClosedByServer = true;
      return 'حساب تنخواه بسته شده است؛ از حسابدار یا مدیر حساب تازه بخواهید.';
    }
    return '';
  }

  /** فارسی‌سازی مبلغ با جداکنندهٔ هزارگان (جایگزین pipe number) */
  faAmount(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('fa-IR').format(n) : String(value);
  }

  /** حساب بسته: از خود حساب یا از پاسخ account_closed سرور */
  accountClosedByServer = false;
  get accountClosed(): boolean {
    return !!this.account?.is_closed || this.accountClosedByServer;
  }
  readonly lockedTitle = 'ردیف قفل است: در صورت‌حساب، دورهٔ تطبیق‌شده یا حساب بسته';

  isPendingRecord(rec: any): boolean {
    return !!rec?._offlinePending || (typeof rec?.id === 'number' && rec.id < 0);
  }

  // ─── صفحه‌بندی و فیلتر هزینه‌ها (سمت سرور؛ بدون اتصال از کش فهرست کامل) ───
  readonly pageSize = 25;
  page = 1;
  pageTotal = 0;
  /** ردیف‌های صفحهٔ سرور؛ null یعنی فهرست کامل (کش/آفلاین) سمت کلاینت صفحه‌بندی می‌شود */
  pageRows: PettyCashTransaction[] | null = null;
  isLoadingPage = false;
  loadError = '';
  dateFrom = '';
  dateTo = '';
  isDateFromOpen = false;
  isDateToOpen = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  settlements: PettyCashDebtSettlement[] = [];

  private toAsciiDigits(v: string): string {
    return (v || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  onDateSelect(which: 'from' | 'to', event: any): void {
    const raw = typeof event === 'string' ? event : (event?.shamsi || '');
    const val = this.toAsciiDigits(raw).replace(/-/g, '/');
    if (which === 'from') { this.dateFrom = val; this.isDateFromOpen = false; }
    else { this.dateTo = val; this.isDateToOpen = false; }
    this.onFilterChange();
  }

  clearDates(): void {
    this.dateFrom = '';
    this.dateTo = '';
    this.onFilterChange();
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadExpensePage();
  }

  /** جستجوی سمت سرور با تأخیر کوتاه */
  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.onFilterChange(), 350);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  get totalCount(): number {
    return this.pageRows ? this.pageTotal : this.filteredTransactions.length;
  }

  goToPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages);
    if (next === this.page) return;
    this.page = next;
    this.loadExpensePage();
  }

  /** ردیف‌های نمایش‌داده‌شده: صفحهٔ سرور (به‌اضافهٔ ردیف‌های در صف آفلاین در صفحهٔ ۱) یا برش فهرست کش */
  get displayedExpenses(): PettyCashTransaction[] {
    if (this.pageRows) {
      if (this.page !== 1) return this.pageRows;
      const ids = new Set(this.pageRows.map(r => r.id));
      const pending = this.expenseRows.filter(t => this.isPendingRecord(t) && !ids.has(t.id));
      return [...pending, ...this.pageRows];
    }
    const start = (this.page - 1) * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  /** خواندن صفحهٔ سرور؛ هر خطا (از جمله قطع اتصال) به فهرست کش برمی‌گردد */
  loadExpensePage(silent = false): void {
    const api = this.personnelApi.treasuryOrg;
    if (!api?.getPettyCashTransactionsPage) { this.pageRows = null; return; }
    const params: Record<string, any> = { page: this.page, page_size: this.pageSize, transaction_type: 'expense' };
    if (this.statusFilter !== 'all') params['status'] = this.statusFilter;
    if (this.dateFrom) params['date_from'] = this.dateFrom;
    if (this.dateTo) params['date_to'] = this.dateTo;
    const q = this.transactionSearch.trim();
    if (q) params['search'] = q;
    if (this.selectedSectionId) params['section_id'] = this.selectedSectionId;
    if (!silent) this.isLoadingPage = true;
    api.getPettyCashTransactionsPage(params as any).subscribe({
      next: (res) => {
        this.pageRows = res?.results || [];
        this.pageTotal = res?.count ?? this.pageRows.length;
        this.isLoadingPage = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoadingPage = false;
        if (err?.status === 404 && this.page > 1) {
          this.page = 1;
          this.loadExpensePage(silent);
          return;
        }
        this.pageRows = null;
        this.cdr.detectChanges();
      }
    });
  }

  retryLoad(): void {
    this.loadError = '';
    this.refreshData();
  }

  printStatement(st: PettyCashStatement): void {
    const url = this.personnelApi.treasuryOrg?.pettyCashStatementPrintUrl?.(st.id);
    if (url) window.open(url, '_blank');
  }

  loadSettlements(): void {
    const id = this.account?.id;
    const api = this.personnelApi.treasuryOrg;
    if (!id || !api?.getPettyCashSettlements) return;
    api.getPettyCashSettlements({ account_id: id }).subscribe({
      next: (list) => { this.settlements = list || []; this.cdr.detectChanges(); },
      error: () => { this.settlements = []; }
    });
  }

  private get companyId(): number | null {
    return this.activeCompanyService?.activeCompanyId ?? null;
  }

  // ─── بارگذاری بخش‌های مجاز کاربر (فقط برای فیلتر و ردیف اختیاری) ───
  loadMySections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.selectedSectionId) {
          this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
        }
        this.isLoadingSections = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingSections = false;
        this.cdr.detectChanges();
      }
    });
  }

  onSectionChanged(): void {
    this.selectedSectionId = this.selectedSectionId ? Number(this.selectedSectionId) : null;
    this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.page = 1;
    this.loadTransactions();
  }

  refreshData(): void {
    this.loadBalanceSummary();
    this.loadAccount();
    this.loadTransactions();
    this.loadStatements();
    this.loadCounterparties();
  }

  // ─── مانده و بدهی حساب شرکت ───
  loadBalanceSummary(): void {
    this.isLoadingBalance = true;
    this.personnelApi.getPettyCashBalance(null, undefined, this.companyId).subscribe({
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

  /** حساب فعال خود کاربر در شرکت فعال (برای نمایش شرکت، تنخواه‌گردان، سقف و بدهی) */
  loadAccount(): void {
    const uid = this.currentUserId;
    if (!uid || !this.personnelApi.getPettyCashAccounts) return;
    this.personnelApi.getPettyCashAccounts({ custodian_id: uid }).subscribe({
      next: (list: PettyCashAccount[]) => {
        const rows = (list || []).filter(a => a.is_active !== false);
        const cid = this.companyId;
        this.account = rows.find(a => !cid || a.company === cid) || rows[0] || null;
        this.ceilingDraft = this.account ? Number(this.account.ceiling_amount) : null;
        this.loadSettlements();
        this.cdr.detectChanges();
      },
      error: () => { this.account = null; }
    });
  }

  saveCeiling(): void {
    if (!this.account?.id || !this.canEditCeiling) return;
    const value = Number(this.ceilingDraft);
    if (!Number.isFinite(value) || value < 0) {
      this.toast.show('warning', 'سقف تنخواه باید عددی صفر یا بیشتر (ریال) باشد.');
      return;
    }
    this.isSavingCeiling = true;
    this.personnelApi.updatePettyCashAccount(this.account.id, { ceiling_amount: value }).subscribe({
      next: (acc: PettyCashAccount) => {
        this.isSavingCeiling = false;
        this.account = { ...this.account, ...acc };
        this.toast.show('success', 'سقف تنخواه ذخیره شد.');
        this.loadBalanceSummary();
      },
      error: (err: any) => {
        this.isSavingCeiling = false;
        this.toast.show('error', this.errorText(err, 'خطا در ذخیرهٔ سقف تنخواه.'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── بارگذاری تراکنش‌ها ───
  /** silent: بازخوانی پس از رویداد زنده، بی‌نشانگر بارگذاری و بی‌پیام خطا */
  loadTransactions(silent = false): void {
    if (!silent) this.isLoading = true;
    const params = this.selectedSectionId ? { section_id: this.selectedSectionId } : {};
    this.personnelApi.getPettyCashTransactions(params).subscribe({
      next: (res: PettyCashTransaction[]) => {
        this.transactions = res || [];
        this.loadError = '';
        this.pruneSelection();
        this.isLoading = false;
        this.loadExpensePage(silent);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        if (silent) return;
        this.loadError = this.errorText(err, 'بارگذاری هزینه‌های تنخواه انجام نشد.');
        this.toast.show('error', 'خطا در بارگذاری تراکنش‌های تنخواه: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  loadStatements(silent = false): void {
    const uid = this.currentUserId;
    if (!this.personnelApi.getPettyCashStatements) return;
    if (!silent) this.isLoadingStatements = true;
    this.personnelApi.getPettyCashStatements(uid ? { custodian_id: uid } : {}).subscribe({
      next: (res: PettyCashStatement[]) => {
        this.statements = res || [];
        this.isLoadingStatements = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoadingStatements = false;
        if (!silent) this.toast.show('error', this.errorText(err, 'خطا در بارگذاری صورت‌حساب‌ها.'));
        this.cdr.detectChanges();
      }
    });
  }

  loadProjects(): void {
    if (this.projects.length || !this.personnelApi.getFinancialProjects) return;
    this.personnelApi.getFinancialProjects({ is_active: true }).subscribe({
      next: (list: any) => {
        const all: FinancialProject[] = Array.isArray(list) ? list : (list?.results || []);
        const cid = this.companyId;
        this.projects = all.filter(p => !cid || !p.company || p.company === cid);
        this.cdr.detectChanges();
      },
      error: () => { this.projects = []; }
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

  // ─── ردیف‌های هزینه و شارژها ───
  get expenseRows(): PettyCashTransaction[] {
    return this.transactions.filter(t => t.transaction_type !== 'allocation');
  }

  get chargeRows(): PettyCashTransaction[] {
    return this.transactions.filter(t => t.transaction_type === 'allocation');
  }

  /** ردیف هزینه‌ای که هنوز در صورت‌حساب نیست و می‌شود آن را در صورت‌حساب گذاشت */
  isOpenExpense(t: PettyCashTransaction): boolean {
    return t.transaction_type === 'expense' && !t.statement && (t.line_status ?? 'open') === 'open' && t.status === 'draft' && !t.is_locked;
  }

  get openExpenses(): PettyCashTransaction[] {
    return this.transactions.filter(t => this.isOpenExpense(t));
  }

  /** ویرایش و حذف فقط برای پیش‌نویس باز، بیرون صورت‌حساب و قفل‌نشده */
  canModifyExpense(t: PettyCashTransaction): boolean {
    return this.isOpenExpense(t);
  }

  get filteredTransactions(): PettyCashTransaction[] {
    let list = this.expenseRows;

    if (this.statusFilter === 'draft') {
      list = list.filter(t => t.status === 'draft' && (t.line_status ?? 'open') === 'open');
    } else if (this.statusFilter === 'approved') {
      list = list.filter(t => t.line_status === 'approved' || t.status === 'approved');
    } else if (this.statusFilter === 'rejected') {
      list = list.filter(t => t.line_status === 'rejected' || t.status === 'rejected');
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
    const rows = this.expenseRows;
    return {
      all: rows.length,
      draft: rows.filter(t => t.status === 'draft' && (t.line_status ?? 'open') === 'open').length,
      approved: rows.filter(t => t.line_status === 'approved' || t.status === 'approved').length,
      rejected: rows.filter(t => t.line_status === 'rejected' || t.status === 'rejected').length
    };
  }

  setStatusFilter(tab: string): void {
    if (tab === 'all' || tab === 'draft' || tab === 'approved' || tab === 'rejected') {
      this.statusFilter = tab;
      this.onFilterChange();
    }
  }

  setView(view: string): void {
    if (view === 'expenses' || view === 'charges' || view === 'statements') {
      this.activeView = view;
    }
  }

  lineStatusLabel(t: PettyCashTransaction): string {
    if (t.line_status === 'rejected') return 'ردشده';
    if (t.line_status === 'approved') return 'تأییدشده';
    if (t.statement) return 'در صورت‌حساب';
    return t.status_display || 'باز';
  }

  statementStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'پیش‌نویس', submitted: 'در بررسی', approved: 'تأییدشده', paid: 'پرداخت‌شده', returned: 'عودت‌شده'
    };
    return map[status] || status;
  }

  chargeStatusLabel(t: PettyCashTransaction): string {
    const map: Record<string, string> = {
      draft: 'پیش‌نویس', approved: 'تأییدشده', rejected: 'ردشده', paid: 'پرداخت‌شده',
      pending_supervisor: 'در انتظار سرپرست', pending_accountant: 'در بررسی حسابدار',
      pending_manager: 'در انتظار مدیر', revision_required: 'نیازمند بازنگری'
    };
    return map[t.status] || t.status_display || t.status;
  }

  // ─── مودال ثبت هزینه (آفلاین مثل قبل) ───
  openNewExpenseModal(): void {
    if (this.accountClosed) {
      this.toast.show('warning', 'حساب تنخواه بسته است و ثبت هزینهٔ تازه ممکن نیست.');
      return;
    }
    this.expenseDateError = '';
    this.expenseHeadError = '';
    this.loadExpenseHeads();
    this.loadProjects();
    this.newExpense = {
      section: this.selectedSectionId ?? null,
      project: null,
      title: '',
      transaction_date_shamsi: this.todayShamsi,
      amount: 0,
      expense_head: null,
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

  /** پیام ردِ سرور کنار فیلد تاریخ هزینه (دورهٔ مالی بسته) */
  expenseDateError = '';
  /** پیام کنار انتخابگر سرفصل هزینه */
  expenseHeadError = '';

  /** شرکت فعال؛ وگرنه شرکت بخش انتخاب‌شده (برای فهرست سرفصل) */
  private get sectionCompanyId(): number | null {
    return this.activeCompanyService?.activeCompanyId ?? this.selectedSection?.company_id ?? null;
  }

  /** سرفصل‌های فعال شرکت؛ از کش خواندن آفلاین هم پر می‌شود */
  loadExpenseHeads(): void {
    const companyId = this.sectionCompanyId;
    if (!companyId) {
      this.expenseHeadGroups = [];
      this.expenseHeadsCompanyId = null;
      return;
    }
    if (companyId === this.expenseHeadsCompanyId && this.expenseHeadGroups.length) return;
    this.expenseHeadsCompanyId = companyId;
    this.isLoadingExpenseHeads = true;
    this.personnelApi.getExpenseHeads(companyId, true).subscribe({
      next: (heads) => {
        if (companyId !== this.expenseHeadsCompanyId) return;
        this.expenseHeadGroups = buildExpenseHeadOptions(heads);
        this.isLoadingExpenseHeads = false;
        this.cdr.detectChanges();
      },
      error: () => {
        if (companyId !== this.expenseHeadsCompanyId) return;
        this.expenseHeadGroups = [];
        this.expenseHeadsCompanyId = null;
        this.isLoadingExpenseHeads = false;
        this.cdr.detectChanges();
      }
    });
  }

  saveExpense(): void {
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
    if (!this.newExpense.expense_head) {
      this.expenseHeadError = 'سرفصل هزینه الزامی است.';
      this.toast.show('warning', 'لطفاً سرفصل هزینه را انتخاب کنید.');
      return;
    }

    this.isSaving = true;
    this.expenseDateError = '';
    this.expenseHeadError = '';
    const sectionId = this.newExpense.section ? Number(this.newExpense.section) : null;
    const projectId = this.newExpense.project ? Number(this.newExpense.project) : null;
    let payload: Partial<PettyCashTransaction> | FormData;

    if (this.selectedExpenseAttachment) {
      const formData = new FormData();
      if (sectionId) formData.append('section', String(sectionId));
      if (projectId) formData.append('project', String(projectId));
      formData.append('title', this.newExpense.title.trim());
      formData.append('transaction_date_shamsi', this.newExpense.transaction_date_shamsi.trim());
      formData.append('amount', String(this.newExpense.amount));
      formData.append('expense_head', String(this.newExpense.expense_head));
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
        section: sectionId,
        project: projectId,
        title: this.newExpense.title.trim(),
        transaction_date_shamsi: this.newExpense.transaction_date_shamsi.trim(),
        amount: this.newExpense.amount,
        expense_head: this.newExpense.expense_head,
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
        const closedMsg = fiscalPeriodClosedMessage(err, 'transaction_date_shamsi');
        const headMsg = expenseHeadErrorMessage(err);
        const codeMsg = this.codeMessage(err);
        if (codeMsg) {
          if (err?.error?.code === 'period_locked') this.expenseDateError = codeMsg;
          this.toast.show('error', codeMsg);
        } else if (closedMsg) {
          // دورهٔ مالی بسته: پیام کنار فیلد تاریخ
          this.expenseDateError = closedMsg;
          this.toast.show('error', closedMsg);
        } else if (headMsg) {
          // سرفصل نادرست یا غیرفعال: پیام کنار انتخابگر
          this.expenseHeadError = headMsg;
          this.toast.show('error', headMsg);
        } else {
          this.toast.show('error', 'خطا در ثبت سند تنخواه: ' + (err.error?.error || err.message || 'نامشخص'));
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ─── حذف سند پیش‌نویس ───
  async deleteDraftTransaction(tx: PettyCashTransaction): Promise<void> {
    if (!tx.id) return;
    if (!this.canModifyExpense(tx)) {
      this.toast.show('warning', 'فقط هزینهٔ پیش‌نویسِ بیرون از صورت‌حساب و قفل‌نشده قابل حذف است.');
      return;
    }

    if ((await this.confirmDialog?.open({ title: 'حذف', message: `آیا از حذف سند پیش‌نویس «${tx.title}» اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`, type: 'danger', confirmText: 'حذف' })) !== true) {
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
        this.toast.show('error', fiscalPeriodClosedMessage(err, 'transaction_date_shamsi') || this.codeMessage(err) || ('خطا در حذف سند: ' + (err.error?.error || err.message || 'نامشخص')));
      }
    });
  }

  // ─── درخواست شارژ (فقط آنلاین) ───
  openChargeModal(): void {
    if (this.accountClosed) {
      this.toast.show('warning', 'حساب تنخواه بسته است و درخواست شارژ ممکن نیست.');
      return;
    }
    const defAmount = Math.max(
      0,
      (this.balanceSummary?.ceiling_amount || 0) - (this.balanceSummary?.current_balance || 0)
    );
    this.chargeData = {
      amount: defAmount > 0 ? defAmount : 0,
      title: 'درخواست شارژ تنخواه',
      description: ''
    };
    this.isChargeModalOpen = true;
    this.cdr.detectChanges();
  }

  closeChargeModal(): void {
    this.isChargeModalOpen = false;
    this.cdr.detectChanges();
  }

  get chargeAmountTomans(): number {
    return Math.floor((Number(this.chargeData.amount) || 0) / 10);
  }

  submitCharge(): void {
    if (!this.chargeData.amount || this.chargeData.amount <= 0) {
      this.toast.show('warning', 'مبلغ درخواستی باید بزرگتر از صفر ریال باشد.');
      return;
    }
    this.isSaving = true;
    this.personnelApi.requestPettyCashCharge({
      amount: this.chargeData.amount,
      title: this.chargeData.title.trim() || 'درخواست شارژ تنخواه',
      description: this.chargeData.description.trim()
    }).subscribe({
      next: (tx: PettyCashTransaction) => {
        this.isSaving = false;
        this.toast.show('success', `درخواست شارژ به مبلغ ${this.faAmount(tx.amount)} ریال ثبت و ارسال شد.`);
        this.closeChargeModal();
        this.refreshData();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.show('error', this.errorText(err, 'خطا در ثبت درخواست شارژ.'));
        this.cdr.detectChanges();
      }
    });
  }

  resendCharge(tx: PettyCashTransaction): void {
    if (!tx.id || tx.status !== 'draft') return;
    this.isActing = true;
    this.personnelApi.sendPettyCashCharge(tx.id).subscribe({
      next: () => {
        this.isActing = false;
        this.toast.show('success', 'درخواست شارژ دوباره ارسال شد.');
        this.refreshData();
        if (this.detailKind === 'petty_cash_charge') this.loadDetail(true);
      },
      error: (err: any) => {
        this.isActing = false;
        this.toast.show('error', this.errorText(err, 'خطا در ارسال درخواست شارژ.'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── ساخت و ارسال صورت‌حساب (فقط آنلاین) ───
  private pruneSelection(): void {
    const ids = new Set(this.openExpenses.map(t => t.id as number));
    for (const id of Array.from(this.selectedLineIds)) {
      if (!ids.has(id)) this.selectedLineIds.delete(id);
    }
  }

  toggleLine(tx: PettyCashTransaction): void {
    if (!tx.id || !this.isOpenExpense(tx)) return;
    if (this.selectedLineIds.has(tx.id)) this.selectedLineIds.delete(tx.id);
    else this.selectedLineIds.add(tx.id);
  }

  toggleAllLines(checked: boolean): void {
    this.selectedLineIds.clear();
    if (checked) this.openExpenses.forEach(t => t.id && this.selectedLineIds.add(t.id));
  }

  get selectedTotal(): number {
    return this.openExpenses.filter(t => t.id && this.selectedLineIds.has(t.id)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }

  createStatement(): void {
    const ids = Array.from(this.selectedLineIds);
    if (!ids.length) {
      this.toast.show('warning', 'دست‌کم یک ردیف هزینه برای صورت‌حساب انتخاب کنید.');
      return;
    }
    this.isCreatingStatement = true;
    this.personnelApi.createPettyCashStatement({ line_ids: ids, statement_date_shamsi: this.todayShamsi }).subscribe({
      next: (st: PettyCashStatement) => {
        this.isCreatingStatement = false;
        this.selectedLineIds.clear();
        this.toast.show('success', `صورت‌حساب ${st.document_number || st.id} ساخته و ارسال شد.`);
        this.refreshData();
      },
      error: (err: any) => {
        this.isCreatingStatement = false;
        this.toast.show('error', fiscalPeriodClosedMessage(err, 'statement_date_shamsi') || this.errorText(err, 'خطا در ساخت صورت‌حساب.'));
        this.cdr.detectChanges();
      }
    });
  }

  resendStatement(st: PettyCashStatement): void {
    if (st.status !== 'draft') return;
    this.isActing = true;
    this.personnelApi.sendPettyCashStatement(st.id).subscribe({
      next: () => {
        this.isActing = false;
        this.toast.show('success', 'صورت‌حساب دوباره ارسال شد.');
        this.refreshData();
        if (this.detailKind === 'petty_cash_statement') this.loadDetail(true);
      },
      error: (err: any) => {
        this.isActing = false;
        this.toast.show('error', this.errorText(err, 'خطا در ارسال صورت‌حساب.'));
        this.cdr.detectChanges();
      }
    });
  }

  // ─── پنل جزئیات و سابقهٔ گردش کار ───
  openDetail(kind: PettyCashDetailKind, id: number | undefined, updateUrl = true): void {
    if (!id) return;
    this.detailKind = kind;
    this.detailId = id;
    this.rejectLineId = null;
    this.rejectReason = '';
    this.rejectReasonError = '';
    this.trackingCode = '';
    this.trackingError = '';
    if (updateUrl) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { charge: kind === 'petty_cash_charge' ? id : null, statement: kind === 'petty_cash_statement' ? id : null },
        queryParamsHandling: 'merge'
      });
    }
    this.loadDetail();
  }

  closeDetail(): void {
    this.detailKind = null;
    this.detailId = null;
    this.detailTx = null;
    this.detailStatement = null;
    this.detailLines = [];
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { charge: null, statement: null },
      queryParamsHandling: 'merge'
    });
    this.cdr.detectChanges();
  }

  loadDetail(silent = false): void {
    const kind = this.detailKind;
    const id = this.detailId;
    if (!kind || !id) return;
    if (!silent) this.isLoadingDetail = true;
    if (kind === 'petty_cash_charge') {
      const found = this.transactions.find(t => t.id === id) || null;
      this.detailTx = found;
      this.isLoadingDetail = false;
      this.cdr.detectChanges();
      return;
    }
    this.personnelApi.getPettyCashStatement(id).subscribe({
      next: (st: PettyCashStatement) => {
        if (this.detailId !== id) return;
        this.detailStatement = st;
        this.personnelApi.getPettyCashTransactions({ statement_id: id }).subscribe({
          next: (lines: PettyCashTransaction[]) => {
            if (this.detailId !== id) return;
            this.detailLines = lines || [];
            this.isLoadingDetail = false;
            this.cdr.detectChanges();
          },
          error: () => {
            this.isLoadingDetail = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err: any) => {
        this.isLoadingDetail = false;
        if (!silent) this.toast.show('error', this.errorText(err, 'خطا در بارگذاری صورت‌حساب.'));
        this.cdr.detectChanges();
      }
    });
  }

  get detailTitle(): string {
    return this.detailKind === 'petty_cash_statement'
      ? `صورت‌حساب تنخواه ${this.detailStatement?.document_number || this.detailId}`
      : `درخواست شارژ تنخواه ${this.detailId}`;
  }

  /** رد ردیف: بازبین (حسابدار یا مدیر) و نه صاحب صورت‌حساب، تا وقتی در بررسی است */
  get canRejectLines(): boolean {
    const st = this.detailStatement;
    if (!st || st.status !== 'submitted' || !this.canReviewLines) return false;
    return st.custodian !== this.currentUserId || !!this.auth.user()?.is_superuser;
  }

  startRejectLine(line: PettyCashTransaction): void {
    this.rejectLineId = line.id ?? null;
    this.rejectReason = '';
    this.rejectReasonError = '';
  }

  cancelRejectLine(): void {
    this.rejectLineId = null;
    this.rejectReason = '';
    this.rejectReasonError = '';
  }

  confirmRejectLine(): void {
    const st = this.detailStatement;
    if (!st || !this.rejectLineId) return;
    if (!this.rejectReason.trim()) {
      this.rejectReasonError = 'درج دلیل رد ردیف الزامی است.';
      return;
    }
    this.isActing = true;
    this.personnelApi.rejectPettyCashStatementLine(st.id, this.rejectLineId, this.rejectReason.trim()).subscribe({
      next: () => {
        this.isActing = false;
        this.toast.show('warning', 'ردیف رد شد و به بدهی تنخواه‌گردان افزوده می‌شود.');
        this.cancelRejectLine();
        this.loadDetail(true);
        this.loadStatements(true);
      },
      error: (err: any) => {
        this.isActing = false;
        this.rejectReasonError = this.errorText(err, 'خطا در رد ردیف.');
        this.cdr.detectChanges();
      }
    });
  }

  get canPayStatement(): boolean {
    const st = this.detailStatement;
    return !!st && this.canTreasuryPay && (st.status === 'submitted' || st.status === 'approved');
  }

  get canPayCharge(): boolean {
    const tx = this.detailTx;
    return !!tx && this.canTreasuryPay && tx.status !== 'draft' && tx.status !== 'approved' && tx.status !== 'rejected';
  }

  payDetail(): void {
    const code = this.trackingCode.trim();
    if (!code) {
      this.trackingError = 'درج شماره پیگیری یا شماره سند بانکی الزامی است.';
      return;
    }
    const kind = this.detailKind;
    const id = this.detailId;
    if (!kind || !id) return;
    this.trackingError = '';
    this.isActing = true;
    const call$ = kind === 'petty_cash_statement'
      ? this.personnelApi.payPettyCashStatement(id, code)
      : this.personnelApi.payPettyCashCharge(id, code);
    (call$ as any).subscribe({
      next: () => {
        this.isActing = false;
        this.trackingCode = '';
        this.toast.show('success', 'پرداخت ثبت شد.');
        this.refreshData();
        this.loadDetail(true);
      },
      error: (err: any) => {
        this.isActing = false;
        this.trackingError = this.errorText(err, 'خطا در ثبت پرداخت.');
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
        // پاسخ 200 با existing یعنی همان طرف حساب موجود برگشت (تکراری)، نه خطا
        if (created.existing) {
          this.toast.show('info', `طرف‌حساب «${created.name}» از قبل ثبت شده بود (تکراری) و انتخاب شد.`);
        } else {
          this.toast.show('success', `طرف‌حساب «${created.name}» با موفقیت افزوده شد.`);
        }
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
    const params: Record<string, any> = {};
    if (this.selectedSectionId) {
      params['section_id'] = this.selectedSectionId;
    }
    if (this.statusFilter === 'draft' || this.statusFilter === 'approved' || this.statusFilter === 'rejected') {
      params['status'] = this.statusFilter;
    }

    this.toast.show('info', 'در حال صدور فایل اکسل گردش تنخواه‌گردان...');
    this.personnelApi.exportPettyCashTransactionsExcel(params).subscribe({
      next: (blob: Blob) => {
        void saveBlob(blob, `petty_cash_${this.selectedSection?.code || 'company'}.xlsx`);
        this.toast.show('success', 'فایل اکسل گردش تنخواه با موفقیت دریافت شد.');
      },
      error: () => {
        this.toast.show('error', 'خطا در تولید فایل اکسل تنخواه.');
      }
    });
  }
}
