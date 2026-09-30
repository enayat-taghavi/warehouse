import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-accountant-diskettes-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './accountant-diskettes.html',
  styleUrl: './accountant-diskettes.css'
})
export class AccountantDiskettesHubComponent implements OnInit, OnDestroy {
  activeSubTab: 'social_security' | 'tax_portal' | 'bank_payroll' = 'social_security';

  fiscalYear = '1405';
  selectedMonth = 'تیر';
  workshopCode = '0012345678';

  isLoading = false;
  isGenerating = false;

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

  monthMap: Record<string, string> = {
    'فروردین': '01',
    'اردیبهشت': '02',
    'خرداد': '03',
    'تیر': '04',
    'مرداد': '05',
    'شهریور': '06',
    'مهر': '07',
    'آبان': '08',
    'آذر': '09',
    'دی': '10',
    'بهمن': '11',
    'اسفند': '12'
  };

  projects: any[] = [];
  selectedProjectId: number | null = null;
  currentPeriodId: number | null = null;

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['social_security', 'tax_portal', 'bank_payroll'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['year']) {
        this.fiscalYear = params['year'];
      }
      if (params['month']) {
        this.selectedMonth = params['month'];
      }
      if (params['project_id']) {
        this.selectedProjectId = Number(params['project_id']);
      }
    });

    this.loadData();
  }

  loadData(): void {
    this.personnelApi.getFinancialProjects().subscribe({
      next: (projs: any[]) => {
        this.projects = projs || [];
        if (this.projects.length > 0 && !this.selectedProjectId) {
          this.selectedProjectId = this.projects[0].id;
        }
      }
    });

    const m = this.monthMap[this.selectedMonth] || '04';
    const ym = `${this.fiscalYear}/${m}`;
    this.personnelApi.getMonthlyPayrollRecords({ year_month: ym }).subscribe({
      next: (recs: any[]) => {
        if (recs && recs.length > 0 && recs[0].period) {
          this.currentPeriodId = typeof recs[0].period === 'object' ? recs[0].period.id : recs[0].period;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  switchSubTab(tab: 'social_security' | 'tax_portal' | 'bank_payroll'): void {
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
        project_id: this.selectedProjectId
      },
      queryParamsHandling: 'merge'
    });
  }

  generateSocialSecurityDiskette(): void {
    if (!this.currentPeriodId || !this.selectedProjectId) {
      this.toast.warning('دوره محاسباتی یا پروژه فعال یافت نشد. لطفاً ابتدا حقوق دوره را محاسبه فرمایید.');
      return;
    }
    this.isGenerating = true;
    this.personnelApi.exportBimehDisketteZip(this.currentPeriodId, this.selectedProjectId).subscribe({
      next: (blob: Blob) => {
        this.isGenerating = false;
        const m = this.monthMap[this.selectedMonth] || '04';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bimeh_${this.fiscalYear}_${m}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
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
    this.isGenerating = true;
    this.personnelApi.exportTaxWh(this.currentPeriodId, this.selectedProjectId).subscribe({
      next: (blobWh: Blob) => {
        const m = this.monthMap[this.selectedMonth] || '04';
        const urlWh = window.URL.createObjectURL(blobWh);
        const aWh = document.createElement('a');
        aWh.href = urlWh;
        aWh.download = `WH_${this.fiscalYear}${m}.txt`;
        aWh.click();
        window.URL.revokeObjectURL(urlWh);

        // Then download WP
        this.personnelApi.exportTaxWp(this.currentPeriodId!, this.selectedProjectId!).subscribe({
          next: (blobWp: Blob) => {
            this.isGenerating = false;
            const urlWp = window.URL.createObjectURL(blobWp);
            const aWp = document.createElement('a');
            aWp.href = urlWp;
            aWp.download = `WP_${this.fiscalYear}${m}.txt`;
            aWp.click();
            window.URL.revokeObjectURL(urlWp);
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
    this.isGenerating = true;
    this.personnelApi.exportBankPaymentExcel(this.currentPeriodId, this.selectedProjectId).subscribe({
      next: (blob: Blob) => {
        this.isGenerating = false;
        const m = this.monthMap[this.selectedMonth] || '04';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bank_Payment_${this.fiscalYear}_${m}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
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

  exportExcel(): void {
    if (!this.currentPeriodId) {
      this.toast.warning('دوره محاسباتی فعال یافت نشد.');
      return;
    }
    this.personnelApi.exportMonthlyPayrollExcel(this.currentPeriodId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Payroll_Report_${this.fiscalYear}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
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
