import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection } from '../../../../models/personnel.model';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';

export type SupervisorPeriodLockSubTab = 'active_period' | 'locked_periods' | 'anomalies';

@Component({
  selector: 'app-supervisor-period-lock-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
  ],
  templateUrl: './supervisor-period-lock.html',
  styleUrl: './supervisor-period-lock.css'
})
export class SupervisorPeriodLockHubComponent implements OnInit, OnDestroy {
  activeSubTab: SupervisorPeriodLockSubTab = 'active_period';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  fiscalYear = '1405';
  selectedMonth = 'تیر';
  isLoading = false;
  isLocking = false;

  currentPeriodSummary = {
    total_personnel: 0,
    total_work_hours: 0,
    total_overtime_hours: 0,
    pending_approvals: 0,
    is_locked: false,
    period_status: 'OPEN'
  };

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

  monthsList: string[] = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];

  currentPeriodId: number | null = null;
  lockedPeriods: any[] = [];
  anomalies: any[] = [];

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
      if (params['tab'] && ['active_period', 'locked_periods', 'anomalies'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['year']) {
        this.fiscalYear = params['year'];
      }
      if (params['month'] && this.monthMap[params['month']]) {
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
              this.fetchPeriodData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchPeriodData();
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
    this.fetchPeriodData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchPeriodData();
  }

  onMonthChanged(): void {
    this.syncUrlParams();
    this.fetchPeriodData();
  }

  // ثابت است؛ یک آرایه برای همه چرخه‌های تشخیص تغییر (getter با آرایه تازه در dev mode خطای NG0100 می‌دهد)
  readonly periodSubTabs: TabDef[] = [
    { id: 'active_period', label: 'دوره جاری کارگاه', shortLabel: 'جاری', icon: ACCOUNTING_ENTITY_ICONS.attendance },
    { id: 'locked_periods', label: 'دوره‌های قفل‌شده', shortLabel: 'قفل‌شده', icon: 'status-locked' },
    { id: 'anomalies', label: 'مغایرت‌ها و هشدارها', shortLabel: 'مغایرت', icon: 'status-warning' },
  ];

  switchSubTab(tab: string): void {
    if (tab === 'active_period' || tab === 'locked_periods' || tab === 'anomalies') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchPeriodData();
    }
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        year: this.fiscalYear,
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
  }

  fetchPeriodData(): void {
    this.isLoading = true;
    const m = this.monthMap[this.selectedMonth] || '04';
    const yearMonth = `${this.fiscalYear}/${m}`;

    const options: { section_id?: number; project_id?: number } = {};
    if (this.selectedSectionId) options.section_id = this.selectedSectionId;
    const projId = this.selectedSection?.project_id ?? ((this.selectedSection as any)?.project || null);
    if (projId) options.project_id = projId;

    this.personnelApi.getAttendanceMonthlySummary(null, yearMonth, options).subscribe({
      next: (summaryRes: any) => {
        this.isLoading = false;
        const rows = summaryRes?.summary || [];
        this.currentPeriodId = summaryRes?.period_id || null;
        this.currentPeriodSummary = {
          total_personnel: rows.length,
          total_work_hours: rows.reduce((sum: number, r: any) => sum + (Number(r.total_hours) || 0), 0),
          total_overtime_hours: rows.reduce((sum: number, r: any) => sum + (Number(r.total_overtime_hours) || 0), 0),
          pending_approvals: summaryRes?.pending_approvals_count ?? 0,
          is_locked: summaryRes?.is_locked ?? false,
          period_status: summaryRes?.period_status || 'OPEN'
        };
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در دریافت خلاصه ماهانه دوره: ' + (err?.error?.error || err?.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  lockAndSubmitPeriod(): void {
    if (this.currentPeriodSummary.pending_approvals > 0) {
      this.toast.error(`امکان قفل دوره وجود ندارد. هنوز تعداد ${this.currentPeriodSummary.pending_approvals} کارکرد تاییدنشده وجود دارد. ابتدا به تب کارکرد رفته و تمام موارد را تایید نمایید.`);
      return;
    }

    const m = this.monthMap[this.selectedMonth] || '04';
    const yearMonth = `${this.fiscalYear}/${m}`;

    this.isLocking = true;
    this.personnelApi.postCartableAction('supervisor', {
      action: 'approve',
      model: 'period',
      id: this.currentPeriodId || 0,
      year_month: yearMonth,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project_id ?? ((this.selectedSection as any)?.project || null)
    }).subscribe({
      next: () => {
        this.isLocking = false;
        this.currentPeriodSummary.is_locked = true;
        this.toast.success(`دوره کارکرد ${this.selectedMonth} ماه ${this.fiscalYear} با موفقیت قفل و به کارتابل حسابداری ارسال شد.`);
        this.fetchPeriodData();
      },
      error: (err: any) => {
        this.isLocking = false;
        this.toast.error('خطا در قفل دوره: ' + (err.error?.error || err.error?.detail || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  goToAttendance(): void {
    this.router.navigate(['/app/finance/supervisor/attendance'], {
      queryParams: {
        tab: 'pending',
        section_id: this.selectedSectionId || null
      }
    });
  }

  exportExcel(): void {
    this.toast.info('در حال صدور فایل اکسل خلاصه ماهانه کارگاه...');
  }

  importExcel(): void {
    this.toast.info('قالب گزارش تجمیعی ماهانه آماده است.');
  }
}
