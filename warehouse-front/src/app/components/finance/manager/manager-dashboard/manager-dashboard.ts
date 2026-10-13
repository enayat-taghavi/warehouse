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
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonDirective } from '../../../../shared/components/action-button/action-button.directive';
import { PLATFORM_ENTITY_ICONS } from '../../../../shared/icons/semantic-icons';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../modules/accounting/entity-icons';

@Component({
  selector: 'app-manager-dashboard-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SvgIconDirective, TabBarComponent, ActionButtonDirective],
  templateUrl: './manager-dashboard.html',
  styleUrl: './manager-dashboard.css'
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  activeSubTab: 'kpi_overview' | 'section_variance' | 'urgent_alerts' = 'kpi_overview';

  dashboardTabs: TabDef[] = [
    { id: 'kpi_overview', label: 'شاخص‌های کلان', shortLabel: 'شاخص‌ها', icon: PLATFORM_ENTITY_ICONS.reports },
    { id: 'section_variance', label: 'انحراف بودجه بخش‌ها', shortLabel: 'انحراف', icon: ACCOUNTING_ENTITY_ICONS.budget },
    { id: 'urgent_alerts', label: 'هشدارهای نیازمند اقدام', shortLabel: 'هشدارها', icon: 'status-alert', count: 3 }
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

  // State
  isLoading = false;

  // Executive KPI Summary
  kpiSummary = {
    totalBudget: 4500000000,
    totalExpenses: 3820000000,
    totalPayrollCost: 2650000000,
    totalFleetCost: 780000000,
    totalInvoicesCost: 390000000,
    activePersonnelCount: 142,
    activeFleetCount: 38,
    overtimeHoursTotal: 1840,
    consumptionPercent: 84.8,
    pendingApprovalsCount: 7
  };

  // Section Breakdown Matrix
  sectionStats = [
    { id: 1, name: 'بخش لجستیک و انبار مرکزی', project: 'پروژه پایانه جنوب', budget: 1800000000, spent: 1540000000, personnel: 52, fleet: 18, variancePercent: 85.5, status: 'normal' },
    { id: 2, name: 'بخش تخلیه و بارگیری اسکله', project: 'پروژه بندر امام', budget: 1400000000, spent: 1310000000, personnel: 44, fleet: 12, variancePercent: 93.5, status: 'warning' },
    { id: 3, name: 'بخش ترابری سنگین', project: 'پروژه خط لوله شرق', budget: 800000000, spent: 840000000, personnel: 26, fleet: 8, variancePercent: 105.0, status: 'danger' },
    { id: 4, name: 'بخش فنی و مهندسی', project: 'پروژه پایانه غرب', budget: 500000000, spent: 130000000, personnel: 20, fleet: 0, variancePercent: 26.0, status: 'normal' }
  ];

  // Urgent Alerts Feed
  urgentAlerts = [
    { id: 101, type: 'danger', title: 'انحراف بودجه در بخش ترابری سنگین', description: 'هزینه ناوگان و اضافه‌کاری ۵٪ از سقف مصوب ماه تیر فراتر رفته است.', time: '۲ ساعت پیش', linkTab: 'manager-budget' },
    { id: 102, type: 'warning', title: 'فاکتورهای نیازمند تایید ویژه مدیر', description: '۲ فقره فاکتور هزینه تعمیرات به مبلغ ۴۵ میلیون تومان بالای سقف مجاز ثبت شده است.', time: '۴ ساعت پیش', linkTab: 'manager-approvals' },
    { id: 103, type: 'info', title: 'درخواست تغییر احکام کارگزینی', description: '۳ فقره پیشنهاد ارتقای پایه حقوقی کارشناسان انبار آماده بررسی و تایید است.', time: 'امروز', linkTab: 'manager-contracts' }
  ];

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
      if (params['tab'] && ['kpi_overview', 'section_variance', 'urgent_alerts'].includes(params['tab'])) {
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
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
  }

  switchSubTab(tab: string): void {
    if (tab === 'kpi_overview' || tab === 'section_variance' || tab === 'urgent_alerts') {
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
        q: this.searchQuery ? this.searchQuery : null,
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
  }

  navigateToApprovals(): void {
    this.router.navigate(['/app/finance/manager-approvals']);
  }

  navigateToBudget(): void {
    this.router.navigate(['/app/finance/manager-budget']);
  }

  exportExecutiveSummary(): void {
    this.toast.success('در حال صدور گزارش داشبورد مدیریتی و شاخص‌های کلان...');
  }

  refreshData(): void {
    this.isLoading = true;
    this.personnelApi.getManagerCartable().subscribe({
      next: (data: any) => {
        this.isLoading = false;
        if (data?.counts) {
          this.kpiSummary.pendingApprovalsCount = data.counts.total_pending || 0;
          if (data.counts.personnel) this.kpiSummary.activePersonnelCount = data.counts.personnel;
          if (data.counts.vehicles) this.kpiSummary.activeFleetCount = data.counts.vehicles;
        }
        this.toast.info('شاخص‌های مدیریتی با کارتابل تصویب مدیر همگام‌سازی شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
  }
}
