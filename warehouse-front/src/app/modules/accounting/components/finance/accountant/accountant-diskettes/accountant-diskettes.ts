import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { WarehouseHttpService } from '../../../../../../core/http/warehouse-http.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import {
  PAYROLL_MONTHS,
  defaultPayrollPeriod,
  isPayrollMonthName,
  mergeFiscalYears,
  payrollMonthCode
} from '../payroll-period';

@Component({
  selector: 'app-accountant-diskettes-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent,
    SvgIconDirective
  ],
  templateUrl: './accountant-diskettes.html',
  styleUrl: './accountant-diskettes.css'
})
export class AccountantDiskettesHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'social_security' | 'tax_portal' | 'bank_payroll' = 'social_security';

  readonly tabs: TabDef[] = [
    {
      id: 'social_security',
      label: 'بیمه تامین اجتماعی',
      shortLabel: 'بیمه',
      icon: ACCOUNTING_ENTITY_ICONS.insurance
    },
    {
      id: 'tax_portal',
      label: 'مالیات حقوق',
      shortLabel: 'مالیات',
      icon: ACCOUNTING_ENTITY_ICONS.tax
    },
    {
      id: 'bank_payroll',
      label: 'واریز بانکی',
      shortLabel: 'بانک',
      icon: ACCOUNTING_ENTITY_ICONS.bankAccounts
    }
  ];

  // دوره و دامنهٔ خروجی‌ها (منتقل‌شده از کارتابل مالی قدیمی)
  readonly monthNames = PAYROLL_MONTHS.map(m => m.name);
  availableYears: string[] = [];
  fiscalYear = defaultPayrollPeriod().year;
  selectedMonth = defaultPayrollPeriod().month;
  /** دامنه: تهی = کل شرکت (سراسری)، یا یک انبار */
  selectedWarehouseId: number | null = null;
  warehouses: { id: number; name: string }[] = [];
  workshopCode = '0012345678';

  isLoading = false;
  /** دریافت رکوردهای دوره ناموفق بود؛ نباید «حقوقی محاسبه نشده» نشان داده شود */
  periodLoadError = false;
  isGenerating = false;
  /** پرچم جدا تا خروجی ناوگان دکمهٔ دیسکت حقوق را درگیر نکند */
  isGeneratingFleet = false;
  /** پرچم خروجی دیسکت پرداخت‌های آزادشده (DEF-20) */
  isGeneratingReleased = false;

  private routeSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    @Optional() private whService?: WarehouseHttpService,
    @Optional() private moduleRegistry?: ModuleRegistryService
  ) {}

  projects: any[] = [];
  selectedProjectId: number | null = null;
  currentPeriodId: number | null = null;

  get yearMonth(): string {
    return `${this.fiscalYear}/${payrollMonthCode(this.selectedMonth)}`;
  }

  get showWarehouseScope(): boolean {
    const hasFilter = this.moduleRegistry?.getExtensions('crossModuleFilters').some(e => e.extension.warehouseScopeFilter);
    return !!hasFilter && this.warehouses.length > 0;
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['social_security', 'tax_portal', 'bank_payroll'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['year'] && /^\d{4}$/.test(params['year'])) {
        this.fiscalYear = params['year'];
      }
      if (params['month'] && isPayrollMonthName(params['month'])) {
        this.selectedMonth = params['month'];
      }
      if (params['project_id']) {
        this.selectedProjectId = Number(params['project_id']);
      }
      if (params['wh']) {
        const wh = Number(params['wh']);
        this.selectedWarehouseId = Number.isFinite(wh) && wh > 0 ? wh : null;
      }
    });

    this.availableYears = mergeFiscalYears([], this.fiscalYear);
    this.personnelApi.getAvailableFiscalYears().subscribe({
      next: (res) => {
        this.availableYears = mergeFiscalYears(res?.years, this.fiscalYear);
        this.cdr.detectChanges();
      },
      error: () => {}
    });

    const hasWhFilter = this.moduleRegistry?.getExtensions('crossModuleFilters').some(e => e.extension.warehouseScopeFilter);
    if (this.whService && hasWhFilter) {
      this.whService.getAll().subscribe({
        next: (data: any) => {
          this.warehouses = (Array.isArray(data) ? data : []).map((w: any) => ({ id: w.id, name: w.name }));
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    this.loadData();
  }

  loadData(): void {
    this.personnelApi.getFinancialProjects().subscribe({
      next: (projs: any[]) => {
        this.projects = projs || [];
        if (this.projects.length > 0 && !this.selectedProjectId) {
          this.selectedProjectId = this.projects[0].id;
        }
        this.cdr.detectChanges();
      }
    });
    this.loadPeriod();
  }

  /** شناسهٔ دورهٔ محاسبه‌شدهٔ همین ماه و دامنه از روی رکوردهای حقوق */
  loadPeriod(): void {
    this.isLoading = true;
    this.periodLoadError = false;
    this.currentPeriodId = null;
    const params: any = { year_month: this.yearMonth };
    if (this.selectedWarehouseId) {
      params.warehouse_id = this.selectedWarehouseId;
    }
    this.personnelApi.getMonthlyPayrollRecords(params).subscribe({
      next: (recs: any[]) => {
        const first = Array.isArray(recs) ? recs[0] : null;
        this.currentPeriodId = first?.period ? (typeof first.period === 'object' ? first.period.id : first.period) : null;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.periodLoadError = true;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  onPeriodChanged(): void {
    this.syncUrlParams();
    this.loadPeriod();
  }

  switchSubTab(tab: string): void {
    if (tab !== 'social_security' && tab !== 'tax_portal' && tab !== 'bank_payroll') {
      return;
    }
    this.activeSubTab = tab;
    this.syncUrlParams();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        year: this.fiscalYear,
        month: this.selectedMonth,
        project_id: this.selectedProjectId,
        wh: this.selectedWarehouseId || null
      },
      queryParamsHandling: 'merge'
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * هشدار مسدودکننده پیش از دانلود دیسکت: پرسنلی که تاریخ اعتبارشان گذشته از دیسکت بیمه، مالیات و بانک
   * کنار گذاشته می‌شوند (تصمیم مصوب ۶.۶). این کنار گذاشتن دیگر بی‌صدا نیست (DEF-20).
   */
  private confirmExpiredExclusion(onConfirmed: () => void): void {
    if (!this.currentPeriodId || !this.selectedProjectId) return;
    this.isGenerating = true;
    this.personnelApi.getDisketteExpiredPersonnel(this.currentPeriodId, this.selectedProjectId).subscribe({
      next: (res) => {
        this.isGenerating = false;
        if (!res?.count) {
          onConfirmed();
          return;
        }
        const names = res.personnel.slice(0, 15).map(p => `• ${p.full_name} (اعتبار تا ${p.valid_until_date || '—'})`).join('\n');
        const more = res.count > 15 ? `\n… و ${res.count - 15} نفر دیگر` : '';
        const ok = confirm(
          `${res.count} نفر به‌دلیل پایان تاریخ اعتبار پرونده از این دیسکت کنار گذاشته می‌شوند و پرداخت و بیمهٔ آن‌ها در فایل نمی‌آید:\n\n${names}${more}\n\nادامه می‌دهید؟`
        );
        if (ok) {
          onConfirmed();
        } else {
          this.toast.info('صدور دیسکت لغو شد. پیش از صدور، تاریخ اعتبار این پرسنل را بررسی کنید.');
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.isGenerating = false;
        if (confirm('بررسی پرسنل منقضی پیش از صدور دیسکت ممکن نشد؛ ممکن است کسانی بی‌صدا کنار گذاشته شوند. ادامه می‌دهید؟')) {
          onConfirmed();
        }
        this.cdr.detectChanges();
      }
    });
  }

  generateSocialSecurityDiskette(): void {
    if (!this.currentPeriodId || !this.selectedProjectId) {
      this.toast.warning('دوره محاسباتی یا پروژه فعال یافت نشد. لطفاً ابتدا حقوق دوره را محاسبه فرمایید.');
      return;
    }
    this.confirmExpiredExclusion(() => this.doGenerateSocialSecurityDiskette());
  }

  private doGenerateSocialSecurityDiskette(): void {
    this.isGenerating = true;
    this.personnelApi.exportBimehDisketteZip(this.currentPeriodId!, this.selectedProjectId!).subscribe({
      next: (blob: Blob) => {
        this.isGenerating = false;
        this.saveBlob(blob, `Bimeh_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.zip`);
        this.toast.success(`دیسکت‌های DSKWOR00.DBF و DSKKAR00.DBF با موفقیت تولید و دانلود شد.`);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isGenerating = false;
        const msg = err?.error?.error || 'خطا در تولید دیسکت‌های تامین اجتماعی.';
        this.toast.error(msg);
        this.cdr.detectChanges();
      }
    });
  }

  generateTaxDiskette(): void {
    if (!this.currentPeriodId || !this.selectedProjectId) {
      this.toast.warning('دوره محاسباتی یا پروژه فعال یافت نشد.');
      return;
    }
    this.confirmExpiredExclusion(() => this.doGenerateTaxDiskette());
  }

  private doGenerateTaxDiskette(): void {
    this.isGenerating = true;
    const m = payrollMonthCode(this.selectedMonth);
    this.personnelApi.exportTaxWh(this.currentPeriodId!, this.selectedProjectId!).subscribe({
      next: (blobWh: Blob) => {
        this.saveBlob(blobWh, `WH_${this.fiscalYear}${m}.txt`);

        // Then download WP
        this.personnelApi.exportTaxWp(this.currentPeriodId!, this.selectedProjectId!).subscribe({
          next: (blobWp: Blob) => {
            this.isGenerating = false;
            this.saveBlob(blobWp, `WP_${this.fiscalYear}${m}.txt`);
            this.toast.success(`فایل‌های الکترونیکی مالیات بر درآمد حقوق (WH/WP) با موفقیت استخراج و دانلود گردید.`);
            this.cdr.detectChanges();
          },
          error: () => {
            this.isGenerating = false;
            this.toast.error('خطا در دریافت فایل WP مالیاتی.');
            this.cdr.detectChanges();
          }
        });
      },
      error: (err: any) => {
        this.isGenerating = false;
        const msg = err?.error?.error || 'خطا در تولید فایل WH مالیاتی.';
        this.toast.error(msg);
        this.cdr.detectChanges();
      }
    });
  }

  generateBankDiskette(): void {
    if (!this.currentPeriodId || !this.selectedProjectId) {
      this.toast.warning('دوره محاسباتی یا پروژه فعال یافت نشد.');
      return;
    }
    this.confirmExpiredExclusion(() => this.doGenerateBankDiskette());
  }

  private doGenerateBankDiskette(): void {
    this.isGenerating = true;
    this.personnelApi.exportBankPaymentExcel(this.currentPeriodId!, this.selectedProjectId!).subscribe({
      next: (blob: Blob) => {
        this.isGenerating = false;
        this.saveBlob(blob, `Bank_Payment_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`);
        this.toast.success(`فایل پرداخت گروهی بانک ملی با موفقیت صادر گردید.`);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isGenerating = false;
        const msg = err?.error?.error || 'خطا در صدور فایل پرداخت بانک.';
        this.toast.error(msg);
        this.cdr.detectChanges();
      }
    });
  }

  /** فایل پرداخت بانکی رکوردهای آزادشده پس از تمدید اعتبار (DEF-20) */
  generateReleasedBankDiskette(): void {
    if (!this.currentPeriodId || !this.selectedProjectId) {
      this.toast.warning('دوره محاسباتی یا پروژه فعال یافت نشد.');
      return;
    }
    this.isGeneratingReleased = true;
    this.personnelApi.exportBankPaymentExcel(this.currentPeriodId, this.selectedProjectId, true).subscribe({
      next: (blob: Blob) => {
        this.isGeneratingReleased = false;
        this.saveBlob(blob, `Bank_Payment_Released_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`);
        this.toast.success('فایل پرداخت گروهی رکوردهای آزادشده با موفقیت صادر گردید.');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isGeneratingReleased = false;
        const msg = err?.error?.error || 'خطا در صدور فایل پرداخت رکوردهای آزادشده.';
        this.toast.error(msg);
        this.cdr.detectChanges();
      }
    });
  }

  /** فایل پرداخت بانکی کرایهٔ رانندگان و پیمانکاران ناوگان (منتقل‌شده از کارتابل مالی قدیمی) */
  generateFleetBankExcel(): void {
    this.isGeneratingFleet = true;
    this.personnelApi.exportFleetBankExcel(this.selectedWarehouseId, this.yearMonth).subscribe({
      next: (blob: Blob) => {
        this.isGeneratingFleet = false;
        this.saveBlob(blob, `Fleet_Bank_Payment_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`);
        this.toast.success('فایل پرداخت بانکی تسویه ناوگان با موفقیت صادر گردید.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isGeneratingFleet = false;
        this.toast.error('خطا در صدور فایل پرداخت بانکی ناوگان.');
        this.cdr.detectChanges();
      }
    });
  }

  exportExcel(): void {
    if (!this.currentPeriodId) {
      this.toast.warning('دوره محاسباتی فعال یافت نشد.');
      return;
    }
    this.personnelApi.exportMonthlyPayrollExcel(this.currentPeriodId).subscribe({
      next: (blob: Blob) => {
        this.saveBlob(blob, `Payroll_Report_${this.fiscalYear}_${payrollMonthCode(this.selectedMonth)}.xlsx`);
        this.toast.success('گزارش اکسل تطبیق با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت گزارش اکسل تطبیق.');
      }
    });
  }

  importExcel(): void {
    this.toast.info('ساختار دیسکت‌های قانونی بر اساس مستندات تامین اجتماعی و دارایی تنظیم شده است.');
  }
}
