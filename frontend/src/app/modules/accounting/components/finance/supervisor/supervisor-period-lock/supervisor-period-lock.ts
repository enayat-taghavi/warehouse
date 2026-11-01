import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { MonthlyWorkPeriod, ProjectSection } from '../../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { attendanceActionErrorMessage } from '../../../../attendance-period-error';
import { PersianDatePipe } from '../../../../../../shared/pipes/persian-date.pipe';
import { gregorianToJalali } from '../../../../../../core/utils/date-utils';

/**
 * فهرست فقط‌خواندنی دوره‌های کارکرد بخش‌ها (۴.۴-ج).
 * تأیید، عودت و رد دوره از «کارهای من» (`/app/my-tasks?workflow=attendance_period`) انجام می‌شود.
 */
const PERIOD_LOCK_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

@Component({
  selector: 'app-supervisor-period-lock-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SvgIconDirective, CommandCenterComponent, PersianDatePipe],
  templateUrl: './supervisor-period-lock.html',
  styleUrl: './supervisor-period-lock.css'
})
export class SupervisorPeriodLockHubComponent implements OnInit, OnDestroy {
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  isLoadingSections = false;

  fiscalYear = (() => {
    const t = new Date();
    const j = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    return String(j.jy);
  })();
  selectedMonth = (() => {
    const t = new Date();
    const j = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    return PERIOD_LOCK_MONTHS[j.jm - 1] || 'تیر';
  })();
  isLoading = false;
  loadFailed = false;

  periods: MonthlyWorkPeriod[] = [];

  readonly monthMap: Record<string, string> = {
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

  readonly monthsList: string[] = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
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
    const t = new Date();
    const j = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
    this.fiscalYear = String(j.jy);
    this.selectedMonth = this.monthsList[j.jm - 1] || 'تیر';

    this.routeSub = this.route.queryParams.subscribe(params => {
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
              this.fetchPeriods();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchPeriods();
      }
    });
  }

  private pickDefaultSection(): void {
    if (this.mySections.length > 0) {
      if (!this.selectedSectionId || !this.mySections.some(s => s.id === this.selectedSectionId)) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
    }
    this.isLoadingSections = false;
    this.fetchPeriods();
  }

  onFilterChanged(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        section_id: this.selectedSectionId || null,
        year: this.fiscalYear,
        month: this.selectedMonth
      },
      queryParamsHandling: 'merge'
    });
    this.fetchPeriods();
  }

  fetchPeriods(): void {
    this.isLoading = true;
    this.loadFailed = false;
    this.fiscalYear = String(this.fiscalYear || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const m = this.monthMap[this.selectedMonth] || '04';
    this.personnelApi.getWorkPeriods({
      year_month: `${this.fiscalYear}/${m}`,
      section_id: this.selectedSectionId ? Number(this.selectedSectionId) : null
    }).subscribe({
      next: (rows: any) => {
        this.isLoading = false;
        this.periods = Array.isArray(rows) ? rows : (rows?.results || []);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.loadFailed = true;
        this.periods = [];
        this.toast.error(attendanceActionErrorMessage(err, 'خطا در دریافت دوره‌های کارکرد.'));
        this.cdr.detectChanges();
      }
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'READY_TO_PAY':
      case 'PAID':
      case 'LOCKED':
      case 'FINALIZED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'SUBMITTED':
      case 'SUBMITTED_SUPERVISOR':
      case 'SUBMITTED_ACCOUNTANT':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'REVISION_REQUIRED':
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }
}
