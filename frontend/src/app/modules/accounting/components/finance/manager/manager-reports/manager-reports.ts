import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { CompanyApiService } from '../../../../../../core/api/company-api.service';
import { Company } from '../../../../../../core/models/company.model';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { printWindow, saveBlob } from '../../../../../../core/platform/file-output';
import { formatToStandardShamsi, gregorianToJalali, normalizeDigits } from '../../../../../../core/utils/date-utils';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { FinancialProject, ProjectSection } from '../../../../models/personnel.model';
import {
  AccountingReportData,
  AccountingReportKey,
  AccountingReportParams,
  BankPaymentsReport,
  ExpenseGroupBy,
  ExpenseReport,
  ReportPage,
  UnpaidInvoicesReport,
} from '../../../../models/accounting-reports.model';

type ColKind = 'text' | 'money' | 'num';

interface ReportColumn {
  key: string;
  label: string;
  kind: ColKind;
  /** شناسهٔ لاتین (شبا، کد رهگیری، شماره) که باید چپ‌به‌راست جدا شود */
  ltr?: boolean;
}

type ReportRow = Record<string, unknown>;

/** نتیجهٔ هر زیرتب با فیلترهای اعمال‌شدهٔ همان درخواست (برای صفحه‌بندی، اکسل و سربرگ چاپ) */
interface CachedReport {
  data: AccountingReportData;
  at: string;
  params: AccountingReportParams;
  page: number;
  company: string;
  range: string;
}

interface ReportTabDef extends TabDef {
  id: AccountingReportKey;
  /** بدون بازهٔ تاریخ (وضع امروز) */
  noDates?: boolean;
  /** برچسب ستون «جمع کل» در ردیف مجموع */
  totalLabelKey: string;
}

const PAGE_SIZE = 25;

const GROUP_BY_OPTIONS: { id: ExpenseGroupBy; label: string }[] = [
  { id: 'head', label: 'سرفصل' },
  { id: 'section', label: 'بخش' },
  { id: 'project', label: 'پروژه' },
  { id: 'counterparty', label: 'طرف‌حساب' },
  { id: 'month', label: 'ماه' },
];

const COLUMNS: Record<string, ReportColumn[]> = {
  'expense-head': [
    { key: 'group_label', label: 'گروه سرفصل', kind: 'text' },
    { key: 'code', label: 'کد', kind: 'text', ltr: true },
    { key: 'label', label: 'سرفصل', kind: 'text' },
    { key: 'invoice_amount', label: 'هزینهٔ فاکتور', kind: 'money' },
    { key: 'petty_amount', label: 'هزینهٔ تنخواه', kind: 'money' },
    { key: 'total', label: 'جمع هزینه', kind: 'money' },
  ],
  'expense-other': [
    { key: 'label', label: 'عنوان', kind: 'text' },
    { key: 'invoice_amount', label: 'هزینهٔ فاکتور', kind: 'money' },
    { key: 'petty_amount', label: 'هزینهٔ تنخواه', kind: 'money' },
    { key: 'total', label: 'جمع هزینه', kind: 'money' },
    { key: 'vat_amount', label: 'مالیات بر ارزش افزوده', kind: 'money' },
    { key: 'invoice_count', label: 'تعداد فاکتور', kind: 'num' },
  ],
  'unpaid-invoices': [
    { key: 'counterparty_name', label: 'طرف‌حساب', kind: 'text' },
    { key: 'count', label: 'تعداد فاکتور', kind: 'num' },
    { key: 'remaining', label: 'مانده', kind: 'money' },
    { key: 'age_0_30', label: '۰ تا ۳۰ روز', kind: 'money' },
    { key: 'age_31_60', label: '۳۱ تا ۶۰ روز', kind: 'money' },
    { key: 'age_61_90', label: '۶۱ تا ۹۰ روز', kind: 'money' },
    { key: 'age_over_90', label: 'بیش از ۹۰ روز', kind: 'money' },
  ],
  'unpaid-details': [
    { key: 'number', label: 'شمارهٔ داخلی', kind: 'text', ltr: true },
    { key: 'invoice_number', label: 'شمارهٔ فاکتور', kind: 'text', ltr: true },
    { key: 'approved_date', label: 'تاریخ تأیید مدیر', kind: 'text' },
    { key: 'age_days', label: 'سن بدهی (روز)', kind: 'num' },
    { key: 'section_name', label: 'بخش', kind: 'text' },
    { key: 'counterparty_name', label: 'طرف‌حساب', kind: 'text' },
    { key: 'amount', label: 'مبلغ', kind: 'money' },
    { key: 'paid_amount', label: 'پرداخت‌شده', kind: 'money' },
    { key: 'remaining', label: 'مانده', kind: 'money' },
  ],
  'petty-cash': [
    { key: 'custodian_name', label: 'تنخواه‌گردان', kind: 'text' },
    { key: 'company_name', label: 'شرکت', kind: 'text' },
    { key: 'ceiling_amount', label: 'سقف', kind: 'money' },
    { key: 'received_total', label: 'شارژ', kind: 'money' },
    { key: 'spent_total', label: 'هزینه', kind: 'money' },
    { key: 'refund_total', label: 'عودت', kind: 'money' },
    { key: 'balance', label: 'مانده', kind: 'money' },
    { key: 'debt', label: 'بدهی', kind: 'money' },
    { key: 'open_statements', label: 'صورت‌حساب باز', kind: 'num' },
  ],
  'bank-payments': [
    { key: 'company_name', label: 'شرکت', kind: 'text' },
    { key: 'bank_name', label: 'بانک', kind: 'text' },
    { key: 'account_title', label: 'عنوان حساب', kind: 'text' },
    { key: 'sheba_number', label: 'شبا', kind: 'text', ltr: true },
    { key: 'opening_balance', label: 'موجودی اولیه', kind: 'money' },
    { key: 'count', label: 'تعداد پرداخت', kind: 'num' },
    { key: 'total', label: 'جمع پرداخت', kind: 'money' },
  ],
  'bank-details': [
    { key: 'payment_date', label: 'تاریخ پرداخت', kind: 'text' },
    { key: 'amount', label: 'مبلغ', kind: 'money' },
    { key: 'tracking_code', label: 'کد رهگیری', kind: 'text', ltr: true },
    { key: 'invoice_number', label: 'شمارهٔ فاکتور', kind: 'text', ltr: true },
    { key: 'counterparty_name', label: 'طرف‌حساب', kind: 'text' },
    { key: 'bank_name', label: 'بانک', kind: 'text' },
  ],
  'labor-cost': [
    { key: 'section_name', label: 'بخش', kind: 'text' },
    { key: 'year_month', label: 'ماه', kind: 'text', ltr: true },
    { key: 'headcount', label: 'تعداد', kind: 'num' },
    { key: 'base_salary', label: 'حقوق پایه', kind: 'money' },
    { key: 'overtime', label: 'اضافه‌کار', kind: 'money' },
    { key: 'allowances', label: 'مزایا', kind: 'money' },
    { key: 'employer_insurance', label: 'سهم بیمهٔ کارفرما', kind: 'money' },
    { key: 'total_cost', label: 'جمع هزینه', kind: 'money' },
    { key: 'average_cost', label: 'میانگین هر نفر', kind: 'money' },
  ],
  'fleet-cost': [
    { key: 'section_name', label: 'بخش', kind: 'text' },
    { key: 'year_month', label: 'ماه', kind: 'text', ltr: true },
    { key: 'vehicles', label: 'خودروی فعال', kind: 'num' },
    { key: 'services', label: 'تعداد سرویس', kind: 'num' },
    { key: 'rent', label: 'کرایه', kind: 'money' },
    { key: 'settlement', label: 'جمع تسویه', kind: 'money' },
  ],
};

const TITLES: Record<AccountingReportKey, string> = {
  expense: 'گزارش هزینه',
  'unpaid-invoices': 'ماندهٔ پرداخت‌نشدهٔ فاکتورها',
  'petty-cash': 'گزارش تنخواه',
  'bank-payments': 'پرداخت‌ها از حساب بانکی',
  'labor-cost': 'بهای نیروی انسانی',
  'fleet-cost': 'هزینهٔ ناوگان',
};

@Component({
  selector: 'app-manager-reports-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, TabBarComponent, LoadingSkeletonComponent, SvgIconDirective],
  templateUrl: './manager-reports.html',
  styleUrl: './manager-reports.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerReportsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(PersonnelApiService);
  private readonly companyApi = inject(CompanyApiService);
  // NetworkStatusService is a singleton (getInstance), not a DI provider; tests may still provide a mock
  private readonly network = inject(NetworkStatusService, { optional: true }) ?? NetworkStatusService.getInstance();
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly groupByOptions = GROUP_BY_OPTIONS;
  readonly offlineMessage = 'گزارش فقط با اتصال به سرور ساخته می‌شود';
  readonly pageSize = PAGE_SIZE;
  readonly pageIcons = { next: 'chevron-left', prev: 'chevron-right' };
  readonly tabs: ReportTabDef[] = [];

  private readonly money = new Intl.NumberFormat('fa-IR');

  readonly activeTab = signal<AccountingReportKey>('expense');
  readonly online = signal(this.network.isOnline);
  /** زیرتبی که درخواستش در راه است؛ پاسخ دیررس زیرتب دیگر وضع بارگذاری این زیرتب را پاک نمی‌کند */
  private readonly loadingKey = signal<AccountingReportKey | null>(null);
  readonly loading = computed(() => this.loadingKey() === this.activeTab());
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly cache = signal<Partial<Record<AccountingReportKey, CachedReport>>>({});

  readonly companies = signal<Company[]>([]);
  readonly projects = signal<FinancialProject[]>([]);
  readonly sections = signal<ProjectSection[]>([]);

  companyId: number | null = null;
  projectId: number | null = null;
  sectionId: number | null = null;
  groupBy: ExpenseGroupBy = 'head';
  readonly dateFromCtrl = new FormControl<string>('', { nonNullable: true });
  readonly dateToCtrl = new FormControl<string>('', { nonNullable: true });
  fromPickerOpen = false;
  toPickerOpen = false;
  filtersError = false;

  readonly activeDef = computed(() => this.tabs.find(t => t.id === this.activeTab()) ?? this.tabs[0]);
  readonly current = computed(() => this.cache()[this.activeTab()] ?? null);
  readonly page = computed(() => this.current()?.page ?? 1);
  readonly printedAt = signal('');

  readonly visibleProjects = computed(() => {
    const cid = this.companyId_();
    return this.projects().filter(p => cid == null || p.company === cid);
  });
  readonly visibleSections = computed(() => {
    const cid = this.companyId_();
    const pid = this.projectId_();
    return this.sections().filter(s =>
      (cid == null || s.company_id === cid) && (pid == null || (s.project_id ?? s.project) === pid));
  });
  /** نسخهٔ سیگنالی فیلترها فقط برای computed ها */
  private readonly companyId_ = signal<number | null>(null);
  private readonly projectId_ = signal<number | null>(null);

  readonly columns = computed<ReportColumn[]>(() => {
    const key = this.activeTab();
    if (key === 'expense') {
      const data = this.current()?.data as ExpenseReport | undefined;
      return COLUMNS[(data?.group_by ?? this.groupBy) === 'head' ? 'expense-head' : 'expense-other'];
    }
    return COLUMNS[key];
  });
  readonly rows = computed<ReportRow[]>(() => (this.current()?.data?.rows ?? []) as unknown as ReportRow[]);
  readonly totals = computed<ReportRow | null>(() => {
    const data = this.current()?.data;
    return data && 'totals' in data ? (data.totals as unknown as ReportRow) : null;
  });
  readonly totalLabelKey = computed(() => {
    const key = this.activeTab();
    if (key === 'expense') return (this.current()?.data as ExpenseReport | undefined)?.group_by === 'head' ? 'group_label' : 'label';
    return this.activeDef()?.totalLabelKey ?? '';
  });
  readonly detailColumns = computed<ReportColumn[]>(() =>
    this.activeTab() === 'unpaid-invoices' ? COLUMNS['unpaid-details'] : COLUMNS['bank-details']);
  readonly detailPage = computed<ReportPage<ReportRow> | null>(() => {
    const data = this.current()?.data;
    if (!data || !('details' in data)) return null;
    return (data as UnpaidInvoicesReport | BankPaymentsReport).details as unknown as ReportPage<ReportRow>;
  });
  readonly pageCount = computed(() => {
    const d = this.detailPage();
    return d ? Math.max(1, Math.ceil(d.count / d.page_size)) : 1;
  });
  readonly asOf = computed(() => {
    const data = this.current()?.data;
    return data && 'as_of' in data ? (data as UnpaidInvoicesReport).as_of : '';
  });
  readonly title = computed(() => TITLES[this.activeTab()]);

  ngOnInit(): void {
    const defs: ReportTabDef[] = [
      { id: 'expense', label: 'هزینه', shortLabel: 'هزینه', icon: ACCOUNTING_ENTITY_ICONS.invoices, totalLabelKey: 'label' },
      { id: 'unpaid-invoices', label: 'ماندهٔ فاکتورها', shortLabel: 'مانده', icon: ACCOUNTING_ENTITY_ICONS.counterparties, noDates: true, totalLabelKey: 'counterparty_name' },
      { id: 'petty-cash', label: 'تنخواه', shortLabel: 'تنخواه', icon: ACCOUNTING_ENTITY_ICONS.pettyCash, noDates: true, totalLabelKey: 'custodian_name' },
      { id: 'bank-payments', label: 'پرداخت‌ها از حساب بانکی', shortLabel: 'بانک', icon: ACCOUNTING_ENTITY_ICONS.bankAccounts, totalLabelKey: 'company_name' },
    ];
    if (this.auth.hasPermission('view_sys_payroll')) {
      defs.push({ id: 'labor-cost', label: 'بهای نیروی انسانی', shortLabel: 'نیرو', icon: ACCOUNTING_ENTITY_ICONS.personnel, totalLabelKey: 'section_name' });
    }
    if (this.auth.hasPermission('view_sys_fleet_settlement')) {
      defs.push({ id: 'fleet-cost', label: 'هزینهٔ ناوگان', shortLabel: 'ناوگان', icon: ACCOUNTING_ENTITY_ICONS.fleet, totalLabelKey: 'section_name' });
    }
    this.tabs.push(...defs);

    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const pad = (n: number) => String(n).padStart(2, '0');
    this.dateFromCtrl.setValue(`${j.jy}/${pad(j.jm)}/01`);
    this.dateToCtrl.setValue(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);

    this.network.state$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.online.set(this.network.isOnline));

    this.loadLookups();
    this.load();
  }

  private loadLookups(): void {
    this.companyApi.getUserAvailable().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.companies.set(r?.companies ?? []),
      error: () => {
        this.companies.set([]);
        this.filtersError = true;
      },
    });
    this.api.getFinancialProjects({ is_active: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.projects.set(r ?? []),
      error: () => {
        this.projects.set([]);
        this.filtersError = true;
      },
    });
    this.api.getProjectSections({ is_active: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => this.sections.set(r ?? []),
      error: () => {
        this.sections.set([]);
        this.filtersError = true;
      },
    });
  }

  onTabChange(id: string): void {
    this.activeTab.set(id as AccountingReportKey);
    this.error.set('');
    if (!this.cache()[this.activeTab()] && this.online()) this.load();
  }

  onCompanyChange(): void {
    this.companyId_.set(this.companyId);
    const pid = this.projectId;
    if (pid != null && !this.visibleProjects().some(p => p.id === pid)) this.projectId = null;
    this.onProjectChange();
  }

  onProjectChange(): void {
    this.projectId_.set(this.projectId);
    const sid = this.sectionId;
    if (sid != null && !this.visibleSections().some(s => s.id === sid)) this.sectionId = null;
  }

  onDateSelect(which: 'from' | 'to', event: unknown): void {
    const e = event as { shamsi?: string; gregorian?: string } | string;
    const val = typeof e === 'string' ? e : (e?.shamsi || e?.gregorian || '');
    (which === 'from' ? this.dateFromCtrl : this.dateToCtrl).setValue(normalizeDigits(val));
    if (which === 'from') this.fromPickerOpen = false; else this.toPickerOpen = false;
  }

  private buildParams(page: number): AccountingReportParams {
    const key = this.activeTab();
    const params: AccountingReportParams = {};
    if (this.companyId != null) params.company_id = this.companyId;
    if (this.projectId != null) params.project_id = this.projectId;
    if (this.sectionId != null) params.section_id = this.sectionId;
    if (!this.activeDef().noDates) {
      const from = normalizeDigits(this.dateFromCtrl.value.trim());
      const to = normalizeDigits(this.dateToCtrl.value.trim());
      if (from) params.date_from = from;
      if (to) params.date_to = to;
    }
    if (key === 'expense') params.group_by = this.groupBy;
    if (key === 'unpaid-invoices' || key === 'bank-payments') {
      params.page = page;
      params.page_size = PAGE_SIZE;
    }
    return params;
  }

  /** «نمایش»: گزارش را از صفحهٔ اول دوباره می‌سازد */
  load(): void {
    const params = this.buildParams(1);
    const company = this.companies().find(c => c.id === this.companyId)?.name ?? 'همهٔ شرکت‌ها';
    const range = this.activeDef().noDates ? '' : `از ${params.date_from ?? '—'} تا ${params.date_to ?? '—'}`;
    this.fetch(params, 1, company, range);
  }

  /** صفحهٔ دیگر فهرست ریز با همان فیلترهای نتیجهٔ روی صفحه */
  goToPage(p: number): void {
    const cur = this.current();
    if (!cur || p < 1 || p > this.pageCount() || p === cur.page) return;
    this.fetch({ ...cur.params, page: p }, p, cur.company, cur.range);
  }

  private fetch(params: AccountingReportParams, page: number, company: string, baseRange: string): void {
    if (!this.online()) return;
    const key = this.activeTab();
    this.loadingKey.set(key);
    this.error.set('');
    this.api.getAccountingReport<AccountingReportData>(key, params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          const range = baseRange || ('as_of' in data ? `وضع تا تاریخ ${(data as UnpaidInvoicesReport).as_of}` : '');
          this.cache.update(c => ({ ...c, [key]: { data, at: formatToStandardShamsi(new Date(), true), params, page, company, range } }));
          if (this.loadingKey() === key) this.loadingKey.set(null);
        },
        error: (err: HttpErrorResponse) => {
          if (this.loadingKey() === key) this.loadingKey.set(null);
          if (this.activeTab() === key) this.error.set(this.errorMessage(err));
        },
      });
  }

  private errorMessage(err: HttpErrorResponse): string {
    if (isServerUnreachable(err.status)) return 'ارتباط با سرور برقرار نشد. اتصال را بررسی و دوباره تلاش کنید.';
    if (err.status === 400) return String(err.error?.error || err.error?.detail || 'پارامترهای گزارش نامعتبر است.');
    if (err.status === 403) return 'دسترسی به این گزارش ندارید';
    if (err.status === 404) return 'بخش یا شرکت انتخاب‌شده در دامنهٔ شما نیست';
    return 'ساخت گزارش انجام نشد. دوباره تلاش کنید.';
  }

  exportExcel(): void {
    if (!this.online() || this.exporting()) return;
    const key = this.activeTab();
    this.exporting.set(true);
    const cur = this.current();
    const params: AccountingReportParams = cur ? { ...cur.params } : this.buildParams(1);
    delete params.page;
    delete params.page_size;
    this.api.exportAccountingReport(key, params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          this.exporting.set(false);
          const stamp = formatToStandardShamsi(new Date()).replace(/\//g, '-');
          void saveBlob(blob, `accounting-report-${key}-${stamp}.xlsx`);
        },
        error: (err: HttpErrorResponse) => {
          this.exporting.set(false);
          // پاسخ خطا blob است؛ پیام کلی بر پایهٔ کد وضعیت
          this.toast.error(this.errorMessage(err));
        },
      });
  }

  print(): void {
    this.printedAt.set(formatToStandardShamsi(new Date(), true));
    void printWindow();
  }

  fmt(value: unknown, kind: ColKind): string {
    if (value === null || value === undefined || value === '') return '—';
    if (kind === 'text') return String(value);
    return this.money.format(Number(value));
  }

  trackRow(index: number): number {
    return index;
  }
}
