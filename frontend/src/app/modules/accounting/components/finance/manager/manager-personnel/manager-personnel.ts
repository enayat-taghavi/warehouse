import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../../core/auth/auth.service';
import { StateService } from '../../../../../../core/services/state.service';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../api/personnel-api.service';
import { ProjectSection, PersonnelProfile, PersonnelChangeRequest, PayrollYearlySettings, PersonnelCostEstimate, PagedResult, isMaskedValue } from '../../../../models/personnel.model';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { SmartDeleteModalComponent } from '../../../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { ACCOUNTING_ENTITY_ICONS } from '../../../../entity-icons';
import { getPermissionAliases } from '../../../../../../core/modules/permission-aliases';

export type ManagerPersonnelSubTab = 'new' | 'contracts' | 'changes' | 'all';

@Component({
  selector: 'app-manager-personnel-hub',
  standalone: true,
  host: { '(document:keydown.escape)': 'onGlobalEscape()' },
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SmartDeleteModalComponent,
    SvgIconDirective,
    ActionButtonComponent,
    TabBarComponent,
    RouterLink
  ],
  templateUrl: './manager-personnel.html',
  styleUrl: './manager-personnel.css'
})
export class ManagerPersonnelHubComponent implements OnInit, OnDestroy {
  activeSubTab: ManagerPersonnelSubTab = 'new';

  private personnelSubTabsKey = '';
  private personnelSubTabsCache: TabDef[] = [];
  get personnelSubTabs(): TabDef[] {
    const sc = this.statusCounters;
    const key = `${sc.newPending}:${sc.contractsPending}:${sc.changesPending}:${sc.allTotal}`;
    if (key !== this.personnelSubTabsKey) {
      this.personnelSubTabsKey = key;
      this.personnelSubTabsCache = [
        {
          id: 'new',
          label: 'تصویب پرونده‌های جدید',
          shortLabel: 'جدید',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: sc.newPending,
          tone: 'amber',
          indicator: sc.newPending > 0 ? { tone: 'amber', label: 'پرونده‌های جدید معلق', pulse: true } : undefined
        },
        {
          id: 'contracts',
          label: 'احکام و قراردادها',
          shortLabel: 'احکام',
          icon: ACCOUNTING_ENTITY_ICONS.jobGrades,
          count: sc.contractsPending,
          tone: 'slate'
        },
        {
          id: 'changes',
          label: 'تصویب تغییرات',
          shortLabel: 'تغییرات',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: sc.changesPending,
          tone: 'amber',
          indicator: sc.changesPending > 0 ? { tone: 'amber', label: 'درخواست‌های تغییرات', pulse: true } : undefined
        },
        {
          id: 'all',
          label: 'پرسنل فعال',
          shortLabel: 'همه',
          icon: 'status-all',
          count: sc.allTotal,
          tone: 'slate'
        }
      ];
    }
    return this.personnelSubTabsCache;
  }

  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  searchQuery = '';
  fiscalYear = '1405';
  isLoading = false;
  yearlySettings: PayrollYearlySettings | null = null;

  // لیست‌های داده
  pendingManagerList: PersonnelProfile[] = [];
  contractsList: any[] = [];
  changeRequests: PersonnelChangeRequest[] = [];
  allPersonnelList: PersonnelProfile[] = [];

  statusCounters = {
    newPending: 0,
    contractsPending: 0,
    changesPending: 0,
    allTotal: 0
  };

  // مودال تحلیل بار مالی (فقط‌خواندنی)
  isCostModalOpen = false;
  costTarget: { item: any; title: string } | null = null;

  // صفحه‌بندی سمت سرور (۲۰ ردیف)
  readonly pageSize = 20;
  pages: Record<ManagerPersonnelSubTab, number> = { new: 1, contracts: 1, changes: 1, all: 1 };
  totals: Record<ManagerPersonnelSubTab, number> = { new: 0, contracts: 0, changes: 0, all: 0 };
  loadError = '';
  readonly isMasked = isMaskedValue;

  // مودال حذف پرسنل بدون سابقه (تسک ۱۰.۳)
  isDeleteModalOpen = false;
  deleteTargetPersonnel: PersonnelProfile | null = null;
  deleteImpactUrl = '';
  deleteImpactLoading = false;
  deleteImpactHistory: any = null;
  isDeletingPersonnel = false;

  // مودال مقایسه تفاوت‌ها (Diff Viewer)
  isDiffModalOpen = false;
  selectedDiffCR: PersonnelChangeRequest | null = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];

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
      if (params['tab'] && ['new', 'contracts', 'changes', 'all'].includes(params['tab'])) {
        this.activeSubTab = params['tab'] as ManagerPersonnelSubTab;
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
        this.fetchData();
      }
    });

    this.loadSections();
    this.loadYearlySettings();
  }

  loadYearlySettings(): void {
    this.personnelApi.getYearlySettings(this.fiscalYear).subscribe({
      next: (res: any) => {
        this.yearlySettings = res;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.showError('دریافت تنظیمات سالانه انجام نشد.');
      }
    });
  }

  /** سرور فقط مجوز اختصاصی حذف پرسنل فاقد سابقه را می‌پذیرد (تصمیم ۶.۸، DEF-27) */
  get canDeletePersonnel(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    return this.auth.userPermissions().includes('perm_delete_personnel_nomovement');
  }

  /** قطع همکاری با مجوز مدیر (DEF-18) */
  get canEndCollaboration(): boolean {
    const u = this.auth.user();
    if (u?.is_superuser) return true;
    const perms = this.auth.userPermissions();
    return ['perm_approve_personnel_manager', ...getPermissionAliases('manager_approver')].some(c => perms.includes(c));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.wsSub?.unsubscribe();
  }

  loadSections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getProjectSections({ is_active: true }).subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length > 0 && !this.selectedSectionId) {
          this.selectedSectionId = this.mySections[0]?.id ?? null;
        }
        this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
        this.isLoadingSections = false;
        this.fetchData();
      },
      error: () => {
        this.isLoadingSections = false;
        this.toast.showError('دریافت اطلاعات بخش‌ها انجام نشد.');
        this.fetchData();
      }
    });
  }

  onSectionChanged(): void {
    this.pages = { new: 1, contracts: 1, changes: 1, all: 1 };
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.syncUrlParams();
    this.fetchData();
  }

  switchSubTab(tab: string): void {
    if (tab === 'new' || tab === 'contracts' || tab === 'changes' || tab === 'all') {
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
  goToPage(tab: ManagerPersonnelSubTab, p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages(tab));
    if (next === this.pages[tab]) return;
    this.pages[tab] = next;
    this.fetchData();
  }

  totalPages(tab: ManagerPersonnelSubTab): number {
    return Math.max(1, Math.ceil(this.totals[tab] / this.pageSize));
  }

  onSearchChanged(): void {
    this.pages = { new: 1, contracts: 1, changes: 1, all: 1 };
    this.fetchData();
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('fa-IR').format(n);
  }

  fetchData(): void {
    this.isLoading = true;
    this.loadError = '';
    const baseParams: any = {};
    if (this.selectedSectionId) baseParams.section_id = this.selectedSectionId;
    if (this.searchQuery.trim()) baseParams.search = this.searchQuery.trim();
    const failed = (err: any) => {
      this.loadError = 'دریافت اطلاعات انجام نشد.';
      this.toast.showError('دریافت اطلاعات انجام نشد.');
    };
    const paged = (tab: ManagerPersonnelSubTab) => ({ page: this.pages[tab], page_size: this.pageSize });

    // ۱. پرونده‌های در انتظار تصویب نهایی مدیر (فقط‌خواندنی؛ تصویب در «کارهای من»)
    this.personnelApi.getPersonnelProfilesPage({ ...baseParams, approval_status: 'pending_manager', ...paged('new') }).subscribe({
      next: (res: PagedResult<PersonnelProfile>) => {
        this.pendingManagerList = res?.results || [];
        this.totals.new = res?.count ?? this.pendingManagerList.length;
        this.statusCounters.newPending = this.totals.new;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.new > 1) { this.pages.new = 1; this.fetchData(); return; }
        failed(err);
        this.cdr.detectChanges();
      }
    });

    // ۲. قراردادها و احکام
    this.personnelApi.getPersonnelProfilesPage({ ...baseParams, is_active: true, ...paged('contracts') }).subscribe({
      next: (res: PagedResult<PersonnelProfile>) => {
        this.contractsList = (res?.results || []).map(p => ({
          personnel_name: `${p.first_name || ''} ${p.last_name || ''}`,
          contract_type: p.contract_type || 'قرارداد کاری',
          start_date_shamsi: p.start_date || '-',
          end_date_shamsi: p.end_date || '-',
          status: p.approval_status
        }));
        this.totals.contracts = res?.count ?? this.contractsList.length;
        this.statusCounters.contractsPending = this.totals.contracts;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.contracts > 1) { this.pages.contracts = 1; this.fetchData(); return; }
        failed(err);
        this.cdr.detectChanges();
      }
    });

    // ۳. تغییرات پرسنل در انتظار مدیر (فقط‌خواندنی)
    this.personnelApi.getPersonnelChangeRequestsPage({ ...baseParams, status: 'pending_manager', ...paged('changes') }).subscribe({
      next: (res: PagedResult<PersonnelChangeRequest>) => {
        this.changeRequests = res?.results || [];
        this.totals.changes = res?.count ?? this.changeRequests.length;
        this.statusCounters.changesPending = this.totals.changes;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.changes > 1) { this.pages.changes = 1; this.fetchData(); return; }
        failed(err);
        this.cdr.detectChanges();
      }
    });

    // ۴. تمام پرسنل فعال و مصوب
    this.personnelApi.getPersonnelProfilesPage({ ...baseParams, ...paged('all') }).subscribe({
      next: (res: PagedResult<PersonnelProfile>) => {
        this.allPersonnelList = res?.results || [];
        this.totals.all = res?.count ?? this.allPersonnelList.length;
        this.statusCounters.allTotal = this.totals.all;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.pages.all > 1) { this.pages.all = 1; this.fetchData(); return; }
        failed(err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── تحلیل بار مالی (فقط‌خواندنی)؛ تصویب نهایی در «کارهای من» انجام می‌شود ───
  openCostModal(item: any): void {
    this.costTarget = { item, title: `تحلیل بار مالی: ${item.first_name || ''} ${item.last_name || ''}` };
    this.isCostModalOpen = true;
    if (item?.id) {
      this.loadCostAnalysis(item.id);
    }
  }

  // ─── ویجت تحلیل بار مالی با برآورد سروری همان موتور حقوق (تسک ۱۰.۱، DEF-04 و DEF-05) ───
  approvalCostEstimate: PersonnelCostEstimate | null = null;
  companyCostSummary: { personnel_count: number; average_employer_monthly_cost: number } | null = null;
  isLoadingCostAnalysis = false;

  private loadCostAnalysis(personnelId: number): void {
    this.approvalCostEstimate = null;
    this.isLoadingCostAnalysis = true;
    this.personnelApi.getPersonnelCostEstimate(personnelId).subscribe({
      next: (est) => {
        this.approvalCostEstimate = est;
        this.isLoadingCostAnalysis = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingCostAnalysis = false;
        this.toast.showError('دریافت تحلیل بار مالی انجام نشد.');
        this.cdr.detectChanges();
      }
    });
    // میانگین شرکت فقط از پرونده‌های مصوب و فعال، مستقل از فیلتر بخش و جستجوی صفحه
    this.personnelApi.getCompanyPersonnelCostSummary().subscribe({
      next: (summary) => {
        this.companyCostSummary = summary;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.showError('دریافت میانگین هزینه شرکت انجام نشد.');
      }
    });
  }

  // ─── قطع همکاری پرسنل دارای سابقه (DEF-18) ───
  isEndCollaborationModalOpen = false;
  endCollaborationTarget: PersonnelProfile | null = null;
  endCollaborationDate = '';
  endCollaborationReason = '';
  isEndingCollaboration = false;

  openEndCollaborationModal(p: PersonnelProfile): void {
    this.endCollaborationTarget = p;
    this.endCollaborationDate = '';
    this.endCollaborationReason = '';
    this.isEndCollaborationModalOpen = true;
  }

  closeEndCollaborationModal(): void {
    this.isEndCollaborationModalOpen = false;
    this.endCollaborationTarget = null;
    this.isEndingCollaboration = false;
  }

  submitEndCollaboration(): void {
    const target = this.endCollaborationTarget;
    if (!target?.id || this.isEndingCollaboration) return;
    if (!this.endCollaborationDate.trim() || !this.endCollaborationReason.trim()) {
      this.toast.showWarning('تاریخ پایان همکاری (شمسی) و دلیل آن الزامی است.');
      return;
    }
    this.isEndingCollaboration = true;
    this.personnelApi.endPersonnelCollaboration(target.id, this.endCollaborationDate.trim(), this.endCollaborationReason.trim()).subscribe({
      next: (res: any) => {
        this.isEndingCollaboration = false;
        this.toast.showSuccess(res?.message || `همکاری «${target.first_name} ${target.last_name}» پایان یافت.`);
        this.closeEndCollaborationModal();
        this.fetchData();
      },
      error: (err: any) => {
        this.isEndingCollaboration = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در ثبت قطع همکاری');
        this.cdr.detectChanges();
      }
    });
  }

  closeCostModal(): void {
    this.isCostModalOpen = false;
    this.costTarget = null;
  }

  onGlobalEscape(): void {
    if (this.isDeleteModalOpen) {
      if (!this.isDeletingPersonnel) {
        this.closeDeleteModal();
      }
      return;
    }
    if (this.isEndCollaborationModalOpen) {
      if (!this.isEndingCollaboration) {
        this.closeEndCollaborationModal();
      }
      return;
    }
    if (this.isDiffModalOpen) {
      this.closeDiffModal();
      return;
    }
    if (this.isCostModalOpen) {
      this.closeCostModal();
      return;
    }
  }

  // ─── مقایسه تفاوت‌ها (Diff Viewer) ───
  openDiffModal(cr: PersonnelChangeRequest): void {
    this.selectedDiffCR = cr;
    this.diffFieldRows = [];
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
    this.isDiffModalOpen = true;
  }

  closeDiffModal(): void {
    this.isDiffModalOpen = false;
    this.selectedDiffCR = null;
    this.diffFieldRows = [];
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
      insurance_number: 'شماره بیمه',
      daily_base_wage: 'مزد مبنای روزانه',
      job_grade: 'گروه شغلی'
    };
    return dict[field] || field;
  }

  // ─── ویجت تحلیل بار مالی پرسنل (تسک ۱۰.۱) ───
  // همهٔ اعداد از برآورد سروری PayrollCalculationEngine می‌آیند تا با کارتابل حسابدار و حقوق یکی باشند (DEF-05)
  private estimateFor(p: any): PersonnelCostEstimate | null {
    const est = this.approvalCostEstimate;
    return est && p?.id && this.costTarget?.item?.id === p.id ? est : null;
  }

  getPersonnelGrossMonthly(p: any): number | null {
    return this.estimateFor(p)?.gross_salary ?? null;
  }

  getEmployerInsuranceShare(p: any): { employerRate: number; unempRate: number; totalRate: number; cost: number | null } {
    const est = this.estimateFor(p);
    const employerRate = (est?.employer_insurance_rate ?? 20) / 100;
    const unempRate = (est?.unemployment_insurance_rate ?? 3) / 100;
    return {
      employerRate,
      unempRate,
      totalRate: employerRate + unempRate,
      cost: est ? est.employer_insurance + est.unemployment_insurance : null
    };
  }

  getTotalEmployerMonthlyCost(p: any): number | null {
    return this.estimateFor(p)?.employer_monthly_cost ?? null;
  }

  getTotalEmployerYearlyCost(p: any): number | null {
    const monthly = this.getTotalEmployerMonthlyCost(p);
    return monthly === null ? null : monthly * 12;
  }

  /** میانگین هزینهٔ ماهانهٔ پرسنل مصوب و فعال شرکت، از اندپوینت تجمیعی سرور (DEF-04) */
  getCompanyAverageMonthlyCost(): number {
    return this.companyCostSummary?.average_employer_monthly_cost || 0;
  }

  getCostDeviationPercentage(p: any): number | null {
    const avg = this.getCompanyAverageMonthlyCost();
    const cost = this.getTotalEmployerMonthlyCost(p);
    if (!avg || cost === null) return null;
    return Math.round(((cost - avg) / avg) * 100);
  }

  // ─── ابزار حذف پرسنل بدون سابقه (تسک ۱۰.۳) ───
  openDeleteModal(p: PersonnelProfile): void {
    if (!p?.id) return;
    this.deleteTargetPersonnel = p;
    this.deleteImpactUrl = `/api/personnel/profiles/${p.id}/delete_impact/`;
    this.deleteImpactLoading = true;
    this.deleteImpactHistory = null;
    this.isDeleteModalOpen = true;

    this.personnelApi.getPersonnelDeleteImpact(p.id).subscribe({
      next: (res) => {
        this.deleteImpactHistory = res;
        this.deleteImpactLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.deleteImpactHistory = { can_delete: false, reasons: ['خطا در استعلام سوابق از سرور'] };
        this.deleteImpactLoading = false;
        this.toast.showError('استعلام سوابق کارکرد پرسنل با خطا مواجه شد.');
        this.cdr.detectChanges();
      }
    });
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen = false;
    this.deleteTargetPersonnel = null;
    this.deleteImpactHistory = null;
    this.isDeletingPersonnel = false;
    this.cdr.detectChanges();
  }

  confirmDeletePersonnel(): void {
    if (!this.deleteTargetPersonnel?.id || !this.deleteImpactHistory?.can_delete || this.isDeletingPersonnel) return;
    this.isDeletingPersonnel = true;
    const id = this.deleteTargetPersonnel.id;
    const fullName = `${this.deleteTargetPersonnel.first_name} ${this.deleteTargetPersonnel.last_name}`;

    this.personnelApi.deletePersonnelProfile(id).subscribe({
      next: () => {
        this.toast.showSuccess(`پرونده پرسنل «${fullName}» به علت عدم سابقه با موفقیت حذف گردید.`);
        this.isDeletingPersonnel = false;
        this.closeDeleteModal();
        this.fetchData();
      },
      error: (err) => {
        this.isDeletingPersonnel = false;
        this.toast.showError(err?.error?.error || err?.error?.detail || 'خطا در حذف پرونده پرسنل');
        this.cdr.detectChanges();
      }
    });
  }
}
