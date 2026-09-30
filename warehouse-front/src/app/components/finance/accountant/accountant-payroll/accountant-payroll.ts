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

@Component({
  selector: 'app-accountant-payroll-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective],
  templateUrl: './accountant-payroll.html',
  styleUrl: './accountant-payroll.css'
})
export class AccountantPayrollHubComponent implements OnInit, OnDestroy {
  // Subtabs navigation
  activeSubTab: 'ready_to_calculate' | 'calculated' | 'approved' | 'all' = 'ready_to_calculate';

  // Section Isolation (Guardian G1)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Fiscal Context & Filters
  searchQuery = '';
  fiscalYear = '1405';
  selectedMonth = 'تیر';

  // State & Indicators
  isLoading = false;
  isCalculating = false;
  items: any[] = [];

  // Summary Metrics (Mirroring reference Excel: حقوق تیر ماه انبارداری.xlsm)
  payrollSummary = {
    totalGross: 0,
    totalInsuranceEmployee: 0,
    totalInsuranceEmployer: 0,
    totalTax: 0,
    totalNetPay: 0
  };

  // Status Counters
  statusCounters = {
    ready_to_calculate: 0,
    calculated: 0,
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
      if (params['tab'] && ['ready_to_calculate', 'calculated', 'approved', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
      if (params['month']) {
        this.selectedMonth = params['month'];
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
              this.fetchPayrollData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchPayrollData();
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
    this.fetchPayrollData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchPayrollData();
  }

  switchSubTab(tab: 'ready_to_calculate' | 'calculated' | 'approved' | 'all'): void {
    this.activeSubTab = tab;
    this.syncUrlParams();
    this.fetchPayrollData();
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null,
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
  }

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

  currentPeriodId: number | null = null;

  fetchPayrollData(): void {
    this.isLoading = true;
    const m = this.monthMap[this.selectedMonth] || '04';
    const yearMonth = `${this.fiscalYear}/${m}`;
    const warehouseId = this.state.selectedWarehouseId();

    const params: any = { year_month: yearMonth };
    if (warehouseId) {
      params.warehouse_id = warehouseId;
    }

    this.personnelApi.getMonthlyPayrollRecords(params).subscribe({
      next: (records: any[]) => {
        this.isLoading = false;
        const allItems = records || [];
        if (allItems.length > 0 && allItems[0].period) {
          this.currentPeriodId = typeof allItems[0].period === 'object' ? allItems[0].period.id : allItems[0].period;
        }

        // Apply search query if present
        let filtered = allItems;
        if (this.searchQuery && this.searchQuery.trim()) {
          const q = this.searchQuery.trim().toLowerCase();
          filtered = filtered.filter(x =>
            (x.personnel_name && x.personnel_name.toLowerCase().includes(q)) ||
            (x.full_name && x.full_name.toLowerCase().includes(q)) ||
            (x.national_code && x.national_code.includes(q))
          );
        }

        // Subtab filtering
        if (this.activeSubTab === 'ready_to_calculate') {
          this.items = filtered.filter(x => !x.gross_salary || Number(x.gross_salary) === 0 || x.payment_status === 'PENDING');
        } else if (this.activeSubTab === 'calculated') {
          this.items = filtered.filter(x => Number(x.gross_salary || 0) > 0 && x.payment_status === 'PENDING');
        } else if (this.activeSubTab === 'approved') {
          this.items = filtered.filter(x => ['READY_TO_PAY', 'PAID', 'FINANCE_APPROVED'].includes(x.payment_status));
        } else {
          this.items = filtered;
        }

        // Status counters
        this.statusCounters = {
          ready_to_calculate: allItems.filter(x => !x.gross_salary || Number(x.gross_salary) === 0 || x.payment_status === 'PENDING').length,
          calculated: allItems.filter(x => Number(x.gross_salary || 0) > 0 && x.payment_status === 'PENDING').length,
          approved: allItems.filter(x => ['READY_TO_PAY', 'PAID', 'FINANCE_APPROVED'].includes(x.payment_status)).length,
          all: allItems.length
        };

        // Summary metrics
        this.payrollSummary = {
          totalGross: allItems.reduce((sum, x) => sum + Number(x.gross_salary || 0), 0),
          totalInsuranceEmployee: allItems.reduce((sum, x) => sum + Number(x.worker_insurance || 0), 0),
          totalInsuranceEmployer: allItems.reduce((sum, x) => sum + Number(x.employer_insurance || 0), 0),
          totalTax: allItems.reduce((sum, x) => sum + Number(x.income_tax || 0), 0),
          totalNetPay: allItems.reduce((sum, x) => sum + Number(x.net_salary || x.payable_amount || 0), 0)
        };

        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.items = [];
        this.cdr.detectChanges();
      }
    });
  }

  calculateBatch(): void {
    this.isCalculating = true;
    const m = this.monthMap[this.selectedMonth] || '04';
    const yearMonth = `${this.fiscalYear}/${m}`;
    const warehouseId = this.state.selectedWarehouseId();

    this.personnelApi.calculatePeriodPayroll({
      warehouse_id: warehouseId,
      year_month: yearMonth
    }).subscribe({
      next: (res: any) => {
        this.isCalculating = false;
        this.currentPeriodId = res.period_id || null;
        this.toast.success(res.message || 'محاسبه مکانیزه حقوق با موفقیت انجام شد.');
        this.fetchPayrollData();
      },
      error: (err: any) => {
        this.isCalculating = false;
        const msg = err?.error?.error || 'خطا در محاسبه حقوق دوره.';
        this.toast.error(msg);
      }
    });
  }

  approveSingle(item: any): void {
    this.personnelApi.postCartableAction('accountant', {
      action: 'approve',
      model: 'payroll',
      id: item.id
    }).subscribe({
      next: () => {
        this.toast.success(`فیش حقوقی ${item.personnel_name || item.full_name || ''} تایید مالی شد.`);
        this.fetchPayrollData();
      },
      error: (err: any) => {
        const msg = err?.error?.error || 'خطا در تایید مالی فیش حقوقی.';
        this.toast.error(msg);
      }
    });
  }

  exportExcel(): void {
    if (!this.currentPeriodId && this.items.length > 0 && this.items[0].period) {
      this.currentPeriodId = typeof this.items[0].period === 'object' ? this.items[0].period.id : this.items[0].period;
    }
    if (!this.currentPeriodId) {
      this.toast.warning('ابتدا باید محاسبات یک دوره انجام شده باشد تا خروجی اکسل صادر گردد.');
      return;
    }
    this.toast.info('در حال تولید فایل اکسل ۵۸ ستونی مطابق شیت مرجع تیرماه...');
    this.personnelApi.exportMonthlyPayrollExcel(this.currentPeriodId).subscribe({
      next: (blob: Blob) => {
        const m = this.monthMap[this.selectedMonth] || '04';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Payroll_${this.fiscalYear}_${m}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('فایل اکسل حقوق با موفقیت دانلود شد.');
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل اکسل حقوق.');
      }
    });
  }

  importExcel(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const m = this.monthMap[this.selectedMonth] || '04';
      const yearMonth = `${this.fiscalYear}/${m}`;
      this.toast.info('در حال تطبیق اکسل مالیات دارایی با ستون‌های دوره...');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('year_month', yearMonth);
      if (this.currentPeriodId) {
        formData.append('period_id', String(this.currentPeriodId));
      }
      this.personnelApi.importTaxExcel(formData).subscribe({
        next: (res: any) => {
          this.toast.success(res.message || 'اکسل مالیات با موفقیت درون‌ریزی و تطبیق داده شد.');
          this.fetchPayrollData();
        },
        error: (err: any) => {
          const msg = err?.error?.error || 'خطا در درون‌ریزی فایل مالیات دارایی.';
          this.toast.error(msg);
        }
      });
    };
    input.click();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
