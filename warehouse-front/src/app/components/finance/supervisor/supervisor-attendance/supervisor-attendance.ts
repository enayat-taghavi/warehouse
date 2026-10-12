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
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../shared/components/command-center/command-center.component';

@Component({
  selector: 'app-supervisor-attendance-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ActionButtonComponent,
    TabBarComponent,
    CommandCenterComponent,
  ],
  templateUrl: './supervisor-attendance.html',
  styleUrl: './supervisor-attendance.css'
})
export class SupervisorAttendanceHubComponent implements OnInit, OnDestroy {
  // Subtabs navigation
  activeSubTab: 'pending' | 'approved' | 'revision' | 'all' | 'daily_summary' = 'pending';

  // Memoized tabs for app-tab-bar
  private attendanceSubTabsKey = '';
  private attendanceSubTabsCache: TabDef[] = [];
  get attendanceSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.pending}:${sc.approved}:${sc.revision}:${sc.all}`;
    if (key !== this.attendanceSubTabsKey) {
      this.attendanceSubTabsKey = key;
      this.attendanceSubTabsCache = [
        { id: 'pending', label: 'نیازمند بررسی', shortLabel: 'بررسی', icon: 'status-pending', count: sc.pending },
        { id: 'approved', label: 'تایید شده', shortLabel: 'تایید', icon: 'status-approved', count: sc.approved },
        { id: 'revision', label: 'عودت داده‌شده', shortLabel: 'عودت', icon: 'status-revision', count: sc.revision, tone: 'rose' },
        { id: 'all', label: 'کل کارکردها', shortLabel: 'همه', icon: 'status-all', count: sc.all },
        { id: 'daily_summary', label: 'خلاصه روزانه کارگاه', shortLabel: 'خلاصه', icon: 'bar-chart-2' },
      ];
    }
    return this.attendanceSubTabsCache;
  }

  // Section Management (Guardian G1: Section Isolation)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Search & Filter
  searchQuery = '';
  fiscalYear = '1405';
  selectedDateShamsi = '';

  // State & Indicators
  isLoading = false;
  isSaving = false;
  items: any[] = [];
  rawItems: any[] = [];

  // Counters
  statusCounters = {
    pending: 0,
    approved: 0,
    revision: 0,
    all: 0,
    daily_summary: 0
  };

  // Revision Modal State
  showRevisionModal = false;
  revisionTargetItem: any = null;
  revisionReasonText = '';
  isSubmittingRevision = false;

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
      if (params['tab'] && ['pending', 'approved', 'revision', 'all', 'daily_summary'].includes(params['tab'])) {
        this.activeSubTab = params['tab'];
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
      if (params['date']) {
        this.selectedDateShamsi = params['date'];
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
              this.fetchAttendanceData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchAttendanceData();
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
    this.fetchAttendanceData();
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchAttendanceData();
  }

  switchSubTab(tab: string): void {
    if (tab === 'pending' || tab === 'approved' || tab === 'revision' || tab === 'all' || tab === 'daily_summary') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.applyFilter();
    }
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null,
        date: this.selectedDateShamsi ? this.selectedDateShamsi : null
      },
      queryParamsHandling: 'merge'
    });
  }

  fetchAttendanceData(): void {
    this.isLoading = true;
    const params: { section_id?: number; date_shamsi?: string } = {};
    if (this.selectedSectionId) params.section_id = this.selectedSectionId;
    if (this.selectedDateShamsi) params.date_shamsi = this.selectedDateShamsi;

    this.personnelApi.getDailyAttendance(params).subscribe({
      next: (data: any[]) => {
        this.isLoading = false;
        this.rawItems = (data || []).map(row => ({
          ...row,
          national_code: row.personnel_national_code || row.national_code || '---',
          work_hours: row.effective_hours ?? row.work_hours ?? 0,
          overtime_hours: row.overtime_hours ?? 0,
          attendance_status: row.status || 'PRESENT_10H',
          attendance_status_display: row.status_display || this.getAttendanceStatusLabel(row.status),
          approval_status: row.approval_status || 'PENDING_SUPERVISOR',
          approval_status_display: row.approval_status_display || this.getApprovalStatusLabel(row.approval_status)
        }));
        this.applyFilter();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('خطا در دریافت لیست کارکرد: ' + (err.error?.error || err.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  applyFilter(): void {
    let rows = [...this.rawItems];
    if (this.searchQuery?.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      rows = rows.filter(x =>
        (x.personnel_name && x.personnel_name.toLowerCase().includes(q)) ||
        (x.national_code && x.national_code.includes(q))
      );
    }

    this.statusCounters = {
      pending: rows.filter(x => x.approval_status === 'PENDING_SUPERVISOR' || x.approval_status === 'DRAFT').length,
      approved: rows.filter(x => x.approval_status === 'APPROVED').length,
      revision: rows.filter(x => x.approval_status === 'REVISION_REQUIRED').length,
      all: rows.length,
      daily_summary: rows.length
    };

    if (this.activeSubTab === 'pending') {
      this.items = rows.filter(x => x.approval_status === 'PENDING_SUPERVISOR' || x.approval_status === 'DRAFT');
    } else if (this.activeSubTab === 'approved') {
      this.items = rows.filter(x => x.approval_status === 'APPROVED');
    } else if (this.activeSubTab === 'revision') {
      this.items = rows.filter(x => x.approval_status === 'REVISION_REQUIRED');
    } else {
      this.items = rows;
    }
    this.cdr.detectChanges();
  }

  getAttendanceStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'PRESENT_10H': 'حاضر کامل (۱۰ ساعت)',
      'HALF_5H': 'نیمه‌وقت (۵ ساعت)',
      'ABSENT': 'غایب (۰ ساعت)',
      'LEAVE': 'مرخصی',
      'MISSION': 'مأموریت',
      'FRIDAY_WORK': 'جمعه‌کاری',
      'CUSTOM': 'ساعت سفارشی'
    };
    return map[status] || status || 'نامشخص';
  }

  getApprovalStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'DRAFT': 'پیش‌نویس اولیه',
      'PENDING_SUPERVISOR': 'در انتظار بررسی سرپرست',
      'APPROVED': 'تایید شده سرپرست',
      'REVISION_REQUIRED': 'عودت داده‌شده جهت اصلاح'
    };
    return map[status] || status || 'در انتظار بررسی';
  }

  approveSingle(item: any): void {
    if (!item.id) return;
    const oldStatus = item.approval_status;
    item.approval_status = 'APPROVED';
    this.applyFilter();

    this.personnelApi.postCartableAction('supervisor', {
      action: 'approve',
      model: 'attendance',
      id: item.id
    }).subscribe({
      next: () => {
        this.toast.success(`کارکرد ${item.personnel_name || 'پرسنل'} با موفقیت به تایید سرپرست رسید.`);
        this.fetchAttendanceData();
      },
      error: (err: any) => {
        item.approval_status = oldStatus;
        this.applyFilter();
        this.toast.error('خطا در تایید کارکرد پرسنل: ' + (err?.error?.error || err?.error?.detail || err?.message || 'نامشخص'));
      }
    });
  }

  openRevisionModal(item: any): void {
    this.revisionTargetItem = item;
    this.revisionReasonText = item.revision_reason || '';
    this.showRevisionModal = true;
    this.cdr.detectChanges();
  }

  closeRevisionModal(): void {
    this.showRevisionModal = false;
    this.revisionTargetItem = null;
    this.revisionReasonText = '';
  }

  confirmRevision(): void {
    if (!this.revisionTargetItem) return;
    const reason = this.revisionReasonText.trim();
    if (!reason) {
      this.toast.error('ثبت علت عودت و بازنگری کارکرد الزامی است.');
      return;
    }

    this.isSubmittingRevision = true;
    this.personnelApi.postCartableAction('supervisor', {
      action: 'revision',
      model: 'attendance',
      id: this.revisionTargetItem.id,
      reason: reason
    }).subscribe({
      next: () => {
        this.isSubmittingRevision = false;
        this.toast.warning(`کارکرد ${this.revisionTargetItem.personnel_name || 'پرسنل'} جهت اصلاح عودت داده شد.`);
        this.closeRevisionModal();
        this.fetchAttendanceData();
      },
      error: (err: any) => {
        this.isSubmittingRevision = false;
        this.toast.error('خطا در ثبت عودت کارکرد: ' + (err?.error?.error || err?.error?.detail || err?.message || 'نامشخص'));
        this.cdr.detectChanges();
      }
    });
  }

  approveBatch(): void {
    const pendingItems = this.rawItems.filter(it => it.approval_status === 'PENDING_SUPERVISOR' || it.approval_status === 'DRAFT');
    if (pendingItems.length === 0) {
      this.toast.info('هیچ کارکرد در انتظاری برای تایید وجود ندارد.');
      return;
    }

    const ids = pendingItems.map(it => it.id);
    this.personnelApi.postCartableAction('supervisor', {
      action: 'approve',
      model: 'attendance',
      ids: ids
    }).subscribe({
      next: () => {
        this.toast.success(`تعداد ${ids.length} کارکرد در انتظار با موفقیت توسط سرپرست تایید شدند.`);
        this.fetchAttendanceData();
      },
      error: (err: any) => {
        this.toast.error('خطا در تایید دسته‌ای کارکردها: ' + (err?.error?.error || err?.error?.detail || err?.message || 'نامشخص'));
      }
    });
  }

  exportExcel(): void {
    this.toast.info('در حال صدور فایل اکسل کارکرد...');
  }

  importExcel(): void {
    this.toast.info('قالب اکسل بازبینی کارکرد آماده بارگیری است.');
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.syncUrlParams();
    this.applyFilter();
  }
}
