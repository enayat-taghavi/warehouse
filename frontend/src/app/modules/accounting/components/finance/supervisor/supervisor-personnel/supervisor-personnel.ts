import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, PersonnelProfile, PersonnelChangeRequest, PagedResult, isMaskedValue } from '../../../../models/personnel.model';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { CommandCenterComponent } from '../../../../../../shared/components/command-center/command-center.component';
import { ExternalLinkDirective } from '../../../../../../shared/directives/external-link.directive';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { attendanceActionErrorMessage } from '../../../../attendance-period-error';

export type SupervisorPersonnelSubTab = 'new' | 'attendance' | 'changes' | 'all';

@Component({
  selector: 'app-supervisor-personnel-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CommandCenterComponent,
    TabBarComponent,
    ActionButtonComponent,
    ExternalLinkDirective,
    RouterLink,
    SvgIconDirective,
  ],
  templateUrl: './supervisor-personnel.html',
  styleUrl: './supervisor-personnel.css'
})
export class SupervisorPersonnelHubComponent implements OnInit, OnDestroy {
  activeSubTab: SupervisorPersonnelSubTab = 'new';

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  selectedDateShamsi = '';
  fiscalYear = '1405';
  isLoading = false;

  // لیست‌های داده
  newPersonnelList: PersonnelProfile[] = [];
  attendanceList: any[] = [];
  changeRequestsList: PersonnelChangeRequest[] = [];
  allPersonnelList: PersonnelProfile[] = [];

  // شمارنده‌های زنده کارتابل
  statusCounters = {
    newCount: 0,
    attendanceCount: 0,
    changesCount: 0,
    allCount: 0
  };

  // صفحه‌بندی سمت سرور (۲۰ ردیف)
  readonly pageSize = 20;
  pages = { new: 1, changes: 1, all: 1 };
  totals = { new: 0, changes: 0, all: 0 };
  loadError = '';
  readonly isMasked = isMaskedValue;

  // پنجره ثبت یادداشت تایید کارکرد (Approval Modal)
  isApprovalModalOpen = false;
  approvalTarget: { type: 'attendance'; item: any; title: string } | null = null;
  approvalNote = '';
  isApproving = false;

  // پنجره مقایسه تغییرات (Diff Viewer Modal)
  isDiffModalOpen = false;
  selectedDiffCR: PersonnelChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];
  diffAuditLogs: any[] = [];
  isLoadingDiffLogs = false;

  // پنجره مشاهده کامل پرونده (Profile Viewer Modal)
  isViewProfileModalOpen = false;
  selectedViewProfile: PersonnelProfile | null = null;

  copiedId: number | null = null;
  copiedKey: string | null = null;

  private routeSub?: Subscription;
  private wsSub?: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private toast: ToastService,
    private personnelApi: PersonnelApiService,
    private ws: WebSocketService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['new', 'attendance', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as SupervisorPersonnelSubTab;
      }
      if (params['section_id']) {
        this.selectedSectionId = Number(params['section_id']);
      }
      if (params['q']) {
        this.searchQuery = params['q'];
      }
    });

    this.wsSub = this.ws.notifications$.subscribe((msg: any) => {
      // ق۴: رویداد همین زبانه یا شرکت دیگر نادیده گرفته می‌شود
      if (this.ws.skipLiveEvent?.(msg)) return;
      if (msg && (msg.type_str === 'personnel_updated' || msg.type === 'personnel_updated')) {
        if (!this.selectedSectionId || msg.section_id === this.selectedSectionId) {
          this.fetchData();
        }
      }
    });

    this.loadSections();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.wsSub?.unsubscribe();
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
              this.fetchData();
            }
          });
          return;
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.fetchData();
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
    this.fetchData();
  }

  onSectionChanged(): void {
    this.pages = { new: 1, changes: 1, all: 1 };
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  // Memoized tabs for app-tab-bar (getter با آرایه تازه در هر چرخه، در dev mode خطای NG0100 می‌دهد)
  private personnelSubTabsKey = '';
  private personnelSubTabsCache: TabDef[] = [];
  get personnelSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newCount}:${sc.attendanceCount}:${sc.changesCount}:${sc.allCount}`;
    if (key !== this.personnelSubTabsKey) {
      this.personnelSubTabsKey = key;
      this.personnelSubTabsCache = [
        {
          id: 'new',
          label: 'پرونده‌های جدید',
          shortLabel: 'جدید',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: sc.newCount,
          tone: 'amber',
          indicator: sc.newCount > 0 ? { tone: 'amber', label: 'پرونده جدید نیازمند بررسی', pulse: true } : undefined,
        },
        {
          id: 'attendance',
          label: 'کارکرد و حضورغیاب',
          shortLabel: 'کارکرد',
          icon: ACCOUNTING_ENTITY_ICONS.attendance,
          count: sc.attendanceCount,
          tone: 'indigo',
        },
        {
          id: 'changes',
          label: 'درخواست‌های تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesCount,
          tone: 'amber',
          indicator: sc.changesCount > 0 ? { tone: 'amber', label: 'درخواست تغییرات جدید', pulse: true } : undefined,
        },
        {
          id: 'all',
          label: 'همه پرسنل',
          shortLabel: 'همه',
          icon: ACCOUNTING_ENTITY_ICONS.personnel,
          count: sc.allCount,
          tone: 'slate',
        },
      ];
    }
    return this.personnelSubTabsCache;
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'attendance' || tab === 'changes' || tab === 'all') {
      this.activeSubTab = tab;
      this.syncUrlParams();
      this.fetchData();
    }
  }

  syncUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeSubTab,
        section_id: this.selectedSectionId || null,
        q: this.searchQuery ? this.searchQuery : null
      },
      queryParamsHandling: 'merge'
    });
  }

  /** رفتن به صفحهٔ دیگر یکی از لیست‌های سمت سرور */
  goToPage(tab: 'new' | 'changes' | 'all', p: number): void {
    const total = this.totalPages(tab);
    const next = Math.min(Math.max(1, p), total);
    if (next === this.pages[tab]) return;
    this.pages[tab] = next;
    this.fetchData();
  }

  totalPages(tab: 'new' | 'changes' | 'all'): number {
    return Math.max(1, Math.ceil(this.totals[tab] / this.pageSize));
  }

  onSearchChanged(): void {
    this.pages = { new: 1, changes: 1, all: 1 };
    this.fetchData();
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('fa-IR').format(n);
  }

  fetchData(): void {
    this.isLoading = true;
    this.loadError = '';
    const baseParams: any = {};
    if (this.selectedSectionId) {
      baseParams.section_id = this.selectedSectionId;
    }
    if (this.searchQuery.trim()) {
      baseParams.search = this.searchQuery.trim();
    }
    const failed = (err: any) => {
      this.loadError = isServerUnreachable(err?.status ?? 0)
        ? 'ارتباط با سرور برقرار نیست؛ پس از اتصال دوباره تلاش کنید.'
        : 'بارگذاری فهرست انجام نشد.';
    };

    // ۱. پرونده‌های جدید پرسنل در انتظار تایید سرپرست (فقط‌خواندنی؛ تایید در «کارهای من»)
    this.personnelApi.getPersonnelProfilesPage({ ...baseParams, approval_status: 'pending_supervisor', page: this.pages.new, page_size: this.pageSize }).subscribe({
      next: (res: PagedResult<PersonnelProfile>) => {
        this.newPersonnelList = res?.results || [];
        this.totals.new = res?.count ?? this.newPersonnelList.length;
        this.statusCounters.newCount = this.totals.new;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.new > 1) { this.pages.new = 1; this.fetchData(); return; }
        failed(err);
        this.cdr.markForCheck();
      }
    });

    // ۲. کارکرد روزانه پرسنل
    const attParams: any = { ...baseParams };
    if (this.selectedDateShamsi) {
      attParams.date_shamsi = this.selectedDateShamsi;
    }
    this.personnelApi.getDailyAttendance(attParams).subscribe({
      next: (attList: any[]) => {
        this.attendanceList = attList || [];
        this.statusCounters.attendanceCount = this.attendanceList.filter(a => a.supervisor_approved === false || a.status === 'pending').length;
      },
      error: (err: any) => {
        failed(err);
      }
    });

    // ۳. درخواست‌های تغییرات پرسنل (فقط‌خواندنی)
    this.personnelApi.getPersonnelChangeRequestsPage({ ...baseParams, page: this.pages.changes, page_size: this.pageSize }).subscribe({
      next: (res: PagedResult<PersonnelChangeRequest>) => {
        this.changeRequestsList = res?.results || [];
        this.totals.changes = res?.count ?? this.changeRequestsList.length;
        this.statusCounters.changesCount = this.totals.changes;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.changes > 1) { this.pages.changes = 1; this.fetchData(); return; }
        failed(err);
        this.cdr.markForCheck();
      }
    });

    // ۴. تمام پرسنل بخش
    this.personnelApi.getPersonnelProfilesPage({ ...baseParams, page: this.pages.all, page_size: this.pageSize }).subscribe({
      next: (res: PagedResult<PersonnelProfile>) => {
        this.allPersonnelList = res?.results || [];
        this.totals.all = res?.count ?? this.allPersonnelList.length;
        this.statusCounters.allCount = this.totals.all;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.all > 1) { this.pages.all = 1; this.fetchData(); return; }
        failed(err);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── تایید کارکرد روزانه (پرونده و درخواست تغییر پرسنل در «کارهای من» انجام می‌شود) ───
  openApproveModal(type: 'attendance', item: any): void {
    const title = `تایید کارکرد روزانه: ${item.personnel_name || ''} (${item.date_shamsi || ''})`;
    this.approvalTarget = { type, item, title };
    this.approvalNote = '';
    this.isApprovalModalOpen = true;
  }

  closeApproveModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTarget = null;
    this.approvalNote = '';
  }

  submitApproval(): void {
    if (!this.approvalTarget) return;
    this.isApproving = true;
    const { item } = this.approvalTarget;
    // تأیید واقعی ردیف کارکرد در کارتابل سرپرست (نه فقط نوشتن یادداشت)
    const note = this.approvalNote.trim();
    this.personnelApi.postCartableAction('supervisor', {
      action: 'approve',
      model: 'attendance',
      id: item.id,
      ...(note ? { reason: note } : {}),
    }).subscribe({
      next: () => {
        this.toast.showSuccess('کارکرد روزانه با موفقیت تایید شد.');
        this.isApproving = false;
        this.closeApproveModal();
        this.fetchData();
      },
      error: (err: any) => {
        this.isApproving = false;
        this.toast.showError(attendanceActionErrorMessage(err, 'خطا در تایید کارکرد'));
      }
    });
  }

  // ─── پنجره مقایسه تغییرات (Diff Viewer) ───
  openDiffModal(cr: PersonnelChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
    this.diffAuditLogs = [];
    const proposed = (cr.proposed_changes || {}) as Record<string, any>;
    const current = (cr.previous_values || {}) as Record<string, any>;

    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)]));
    for (const key of allKeys) {
      if (['id', 'created_at', 'updated_at', 'personnel'].includes(key)) continue;
      const oldVal = current[key];
      const newVal = proposed[key];
      const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
      this.diffFieldRows.push({
        field_name: key,
        field_label: this.getFieldLabel(key),
        old_value: oldVal ?? '—',
        new_value: newVal ?? '—',
        is_changed: isChanged
      });
    }

    if (cr.id && typeof this.personnelApi.getWorkflowAuditLogs === 'function') {
      this.isLoadingDiffLogs = true;
      this.personnelApi.getWorkflowAuditLogs({ content_type: 'personnelchangerequest', object_id: cr.id }).subscribe({
        next: (logs: any) => {
          this.diffAuditLogs = Array.isArray(logs) ? logs : (logs?.results || []);
          this.isLoadingDiffLogs = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingDiffLogs = false;
          this.cdr.markForCheck();
        }
      });
    }

    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
    this.diffAuditLogs = [];
    this.isLoadingDiffLogs = false;
  }

  // ─── پنجره مشاهده کامل پرونده (Profile Viewer Modal) ───
  openViewProfileModal(p: PersonnelProfile): void {
    this.selectedViewProfile = p;
    this.isViewProfileModalOpen = true;
  }

  closeViewProfileModal(): void {
    this.isViewProfileModalOpen = false;
    this.selectedViewProfile = null;
  }

  // ─── ابزارهای کپی سریع ───
  copyField(val: string | undefined | null, key: string): void {
    if (!val) return;
    navigator.clipboard.writeText(String(val)).then(() => {
      this.copiedKey = key;
      this.toast.showSuccess(`کپی شد: ${val}`);
      setTimeout(() => {
        if (this.copiedKey === key) {
          this.copiedKey = null;
          this.cdr.markForCheck();
        }
      }, 2000);
    });
  }

  isFieldCopied(key: string): boolean {
    return this.copiedKey === key;
  }

  getFieldLabel(field: string): string {
    const dict: Record<string, string> = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      mobile: 'شماره موبایل',
      sheba_number: 'شماره شبا',
      bank_name: 'نام بانک',
      account_number: 'شماره حساب',
      contract_type: 'نوع قرارداد',
      job_title: 'عنوان شغلی',
      insurance_number: 'شماره بیمه'
    };
    return dict[field] || field;
  }

  copyToClipboard(text: string, id: number): void {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedId = id;
      this.toast.showSuccess('در حافظه کپی شد: ' + text);
      setTimeout(() => {
        if (this.copiedId === id) this.copiedId = null;
        this.cdr.markForCheck();
      }, 2000);
    });
  }
}
