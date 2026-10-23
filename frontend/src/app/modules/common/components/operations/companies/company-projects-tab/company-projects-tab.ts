import { Component, OnChanges, OnDestroy, OnInit, SimpleChanges, ChangeDetectorRef, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { OrgStructureApiService, ORG_ASSIGNMENTS_ENDPOINT, ORG_PROJECTS_ENDPOINT, ORG_SECTIONS_ENDPOINT } from '../../../../../../core/api/org-structure-api.service';
import { AccountsHttpService, ImportResult, User } from '../../../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../../../core/services/network-status.service';
import { isServerUnreachable } from '../../../../../../core/services/server-reachability';
import { CompanyStudioContextService } from '../../../../../../core/services/company-studio-context.service';
import { ModuleRegistryService } from '../../../../../../core/modules/module-registry.service';
import { SectionRoleSpec } from '../../../../../../core/modules/module-contract';
import { OrgAssignmentLevel, OrgProject, OrgProjectSection, OrgSectionAssignment, assignmentLevel } from '../../../../../../core/models/company.model';
import { normalizeDigits } from '../../../../../../core/utils/date-utils';
import { saveBlob } from '../../../../../../core/platform/file-output';
import { ToastService } from '../../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ExcelImportModal } from '../../../../../../shared/components/excel-import-modal/excel-import-modal';
import { ModalComponent } from '../../../../../../shared/components/modal/modal.component';
import { LoadingSkeletonComponent } from '../../../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SvgIconDirective } from '../../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../../shared/components/action-button/action-button.component';
import { ACTION_ICONS, PLATFORM_ENTITY_ICONS, STATUS_ICONS } from '../../../../../../shared/icons/semantic-icons';

type SubTab = 'projects' | 'sections' | 'assignments';

/** کلاس‌های رنگی هر لحن نقش (نقش‌ها را ماژول‌ها با tone اعلام می‌کنند) */
const ROLE_TONE_CLASSES: Record<SectionRoleSpec['tone'], { badge: string; panel: string; text: string }> = {
  purple: { badge: 'bg-purple-50 text-purple-800 border-purple-200', panel: 'bg-purple-50/50 border-purple-200', text: 'text-purple-900' },
  amber: { badge: 'bg-amber-50 text-amber-800 border-amber-200', panel: 'bg-amber-50/50 border-amber-200', text: 'text-amber-900' },
  blue: { badge: 'bg-blue-50 text-blue-800 border-blue-200', panel: 'bg-blue-50/50 border-blue-200', text: 'text-blue-900' },
  emerald: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', panel: 'bg-emerald-50/50 border-emerald-200', text: 'text-emerald-900' },
  slate: { badge: 'bg-surface-muted text-fg border-line', panel: 'bg-surface-muted border-line', text: 'text-fg' }
};

/** دارندهٔ نقشی که انتسابش در سطح بالاتر (شرکت یا پروژه) است و برای این بخش هم معتبر است */
export interface InheritedHolder {
  assignment: OrgSectionAssignment;
  source: 'company' | 'project';
}

export interface SectionRoleGroup {
  role: SectionRoleSpec;
  /** انتساب‌های مستقیم همین مقصد (شرکت، پروژه یا بخش) */
  assignments: OrgSectionAssignment[];
  /** فقط در کارت بخش: دارندگان ارث‌برده از سطح شرکت یا پروژه */
  inherited: InheritedHolder[];
}

/** کارت ماتریس انتساب: یک مقصد در یکی از سه سطح */
export interface AssignmentGroup {
  /** کلید پایدار: `company`، `project:<id>` یا `section:<id>` */
  key: string;
  level: OrgAssignmentLevel;
  title: string;
  subtitle: string;
  code?: string;
  inactive?: boolean;
  project?: OrgProject;
  section?: OrgProjectSection;
  roles: SectionRoleGroup[];
  /** شمار کاربران متمایز (مستقیم و ارث‌برده) */
  totalAssignedUsers: number;
  /** نقش‌هایی که هشدار «فاقد …» دارند و هیچ دارندهٔ فعالی (مستقیم یا ارث‌برده) ندارند؛ فقط کارت بخش */
  missingWarnings: string[];
}

export interface SectionGroupedAssignments extends AssignmentGroup {
  section: OrgProjectSection;
}

/** مقصد انتساب گروهی و ویرایش */
export interface AssignmentTargetRef {
  level: OrgAssignmentLevel;
  /** شناسهٔ شرکت، پروژه یا بخش */
  id: number;
  name: string;
  /** پروژهٔ مقصد (برای سطح بخش، پروژهٔ والد) */
  projectId?: number | null;
  projectName?: string | null;
}

/** برچسب کوتاه سطح انتساب */
export const ASSIGNMENT_LEVEL_LABELS: Record<OrgAssignmentLevel, string> = {
  company: 'سطح شرکت',
  project: 'سطح پروژه',
  section: 'سطح بخش'
};

const LEVEL_BADGE_CLASSES: Record<OrgAssignmentLevel, string> = {
  company: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  project: 'bg-teal-50 text-teal-800 border-teal-200',
  section: 'bg-surface-muted text-fg-muted border-line'
};

/**
 * تب «پروژه‌ها و بخش‌ها»ی استودیوی شرکت (هسته): پروژه‌ها، بخش‌ها و انتساب کاربران به بخش‌ها، فقط برای همین شرکت.
 * نقش‌های انتساب را ماژول‌های نصب‌شده اعلام می‌کنند (companies.sectionRoles). نوشتن با سطح «نوشتن» بخش projects است
 * (ورودی canWrite)؛ سرور هم می‌سنجد.
 */
@Component({
  selector: 'app-company-projects-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelImportModal, ModalComponent, LoadingSkeletonComponent, SvgIconDirective, TabBarComponent, ActionButtonComponent],
  templateUrl: './company-projects-tab.html',
  host: { class: 'block' }
})
export class CompanyProjectsTabComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) companyId!: number;
  @Input() canWrite = false;

  private api = inject(OrgStructureApiService);
  private accountsHttp = inject(AccountsHttpService);
  private ws = inject(WebSocketService, { optional: true });
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService, { optional: true });
  private cdr = inject(ChangeDetectorRef);
  private moduleRegistry = inject(ModuleRegistryService);
  private studioContext = inject(CompanyStudioContextService, { optional: true });
  private route = inject(ActivatedRoute, { optional: true });
  private router = inject(Router, { optional: true });
  private offlineSync = OfflineSyncService.getInstance();
  private network = NetworkStatusService.getInstance();
  get isOnline(): boolean {
    return this.network.isOnline;
  }

  readonly icons = PLATFORM_ENTITY_ICONS;
  readonly statusIcons = STATUS_ICONS;
  readonly actionIcons = ACTION_ICONS;
  activeSubTab: SubTab = 'projects';

  projects: OrgProject[] = [];
  sections: OrgProjectSection[] = [];
  assignments: OrgSectionAssignment[] = [];
  systemUsers: User[] = [];

  /** دریافت نخست هنوز تمام نشده (اسکلت) */
  isLoading = false;
  usersLoading = false;
  isExporting = false;
  /** شکست دریافت پروژه، بخش یا انتساب؛ با «تلاش دوباره» */
  loadError = false;
  usersLoadError = false;
  private pendingLoads = 0;

  // فیلترها و جستجوی درجا
  projectSearchQuery = '';
  sectionSearchQuery = '';
  assignmentSearchQuery = '';
  selectedProjectId: number | null = null;
  assignmentProjectFilter: number | null = null;
  assignmentRoleFilter = 'all';
  assignmentViewMode: 'matrix' | 'table' = 'matrix';
  expandedSectionIds = new Set<number>();

  readonly assignmentViewTabs: TabDef[] = [
    { id: 'matrix', label: 'ماتریس', shortLabel: 'ماتریس' },
    { id: 'table', label: 'جدول', shortLabel: 'جدول' }
  ];

  // فرم‌های پروژه و بخش
  newProject: Partial<OrgProject> = this.emptyProject();
  editingProject: OrgProject | null = null;
  newSection: { project: number | null; code: string; name: string; is_active: boolean } = this.emptySection(null);
  editingSection: OrgProjectSection | null = null;
  isSavingProject = false;
  isSavingSection = false;

  /** انتساب گروهی: کارتِ مبدأ گزینه‌های سطح را تعیین می‌کند (بخش ← پروژه ← شرکت) */
  quickAssign: {
    isOpen: boolean;
    /** گزینه‌های سطح، از پایین به بالا (نخستین = کارت مبدأ) */
    targets: AssignmentTargetRef[];
    level: OrgAssignmentLevel;
    role: SectionRoleSpec | null;
    selectedUserIds: number[];
    userSearchQuery: string;
    isSubmitting: boolean;
  } = this.emptyQuickAssign();

  editAssignment: {
    isOpen: boolean;
    assignment: OrgSectionAssignment | null;
    role: string;
    is_active: boolean;
    level: OrgAssignmentLevel;
    projectId: number | null;
    sectionId: number | null;
    /** خطای فیلدی کنار همان فیلد */
    errors: Record<string, string>;
    isSubmitting: boolean;
  } = this.emptyEditAssignment();

  readonly levelLabels = ASSIGNMENT_LEVEL_LABELS;
  readonly levelOptions: { value: OrgAssignmentLevel; label: string }[] = [
    { value: 'company', label: 'کل شرکت' },
    { value: 'project', label: 'یک پروژه (همهٔ بخش‌های آن)' },
    { value: 'section', label: 'یک بخش' }
  ];

  cloneModal: {
    isOpen: boolean;
    targetSection: OrgProjectSection | null;
    sourceProjectId: number | null;
    sourceSectionId: number | null;
    isSubmitting: boolean;
  } = { isOpen: false, targetSection: null, sourceProjectId: null, sourceSectionId: null, isSubmitting: false };

  isExcelModalOpen = false;
  excelModalTitle = '';
  excelImportFn!: (file: File, updateExisting: boolean, dryRun?: boolean) => Observable<ImportResult>;
  excelTemplateFn!: () => void;

  private subs: Subscription[] = [];
  private unregisterDirty: (() => void) | null = null;

  // ─── نقش‌های انتساب (مشارکت ماژول‌ها) ───
  private _rolesKey = '';
  private _roles: SectionRoleSpec[] = [];

  get roles(): SectionRoleSpec[] {
    const exts = this.moduleRegistry.getExtensions('companies');
    const key = exts.map(e => e.moduleCode).join(',');
    if (key !== this._rolesKey) {
      this._rolesKey = key;
      const seen = new Set<string>();
      this._roles = exts
        .flatMap(e => e.extension.sectionRoles || [])
        .filter(r => !seen.has(r.key) && !!seen.add(r.key))
        .sort((a, b) => a.order - b.order);
    }
    return this._roles;
  }

  roleTone(role: SectionRoleSpec | null | undefined): { badge: string; panel: string; text: string } {
    return ROLE_TONE_CLASSES[role?.tone || 'slate'];
  }

  roleByKey(key: string): SectionRoleSpec | undefined {
    return this.roles.find(r => r.key === key);
  }

  // ─── سطح انتساب (شرکت، پروژه یا بخش) ───
  levelOf(a: OrgSectionAssignment): OrgAssignmentLevel {
    return assignmentLevel(a);
  }

  levelBadgeClass(level: OrgAssignmentLevel): string {
    return LEVEL_BADGE_CLASSES[level] ?? LEVEL_BADGE_CLASSES.section;
  }

  levelLabel(level: OrgAssignmentLevel): string {
    return ASSIGNMENT_LEVEL_LABELS[level] ?? '';
  }

  /** پروژهٔ مقصد ردیف (سطح پروژه: خود پروژه؛ سطح بخش: پروژهٔ والد بخش؛ سطح شرکت: null) */
  private projectIdOf(a: OrgSectionAssignment): number | null {
    const level = this.levelOf(a);
    if (level === 'company') return null;
    if (level === 'project') return Number(a.project ?? a.project_id) || null;
    if (a.project_id) return Number(a.project_id);
    const sec = this.sections.find(s => s.id === CompanyProjectsTabComponent.sectionIdOf(a));
    return sec ? Number(sec.project) : null;
  }

  /** متن مقصد ردیف برای جدول و کارت موبایل */
  targetLabel(a: OrgSectionAssignment): string {
    const level = this.levelOf(a);
    if (level === 'company') return a.company_name || 'همهٔ بخش‌های شرکت';
    if (level === 'project') return a.project_name || this.projects.find(p => p.id === this.projectIdOf(a))?.name || '—';
    return [a.project_name, a.section_name].filter(Boolean).join(' / ') || '—';
  }

  private isActiveRow(a: OrgSectionAssignment): boolean {
    return a.is_active !== false;
  }

  /** انتساب‌های فعالِ سطح شرکت این شرکت */
  private companyLevelRows(): OrgSectionAssignment[] {
    return this.assignments.filter(a => this.levelOf(a) === 'company' && this.isActiveRow(a)
      && (a.company == null || Number(a.company) === Number(this.companyId)));
  }

  /** انتساب‌های فعالِ سطح یک پروژه */
  private projectLevelRows(projectId: number): OrgSectionAssignment[] {
    return this.assignments.filter(a => this.levelOf(a) === 'project' && this.isActiveRow(a)
      && Number(a.project ?? a.project_id) === Number(projectId));
  }

  // ─── زیرتب‌ها ───
  private mainTabsKey = '';
  private mainTabsCache: TabDef[] = [];

  get mainTabs(): TabDef[] {
    const hasRoles = this.roles.length > 0;
    const key = `${this.projects.length}:${this.sections.length}:${this.assignments.length}:${hasRoles}`;
    if (key !== this.mainTabsKey) {
      this.mainTabsKey = key;
      const tabs: TabDef[] = [
        { id: 'projects', label: 'پروژه‌ها', shortLabel: 'پروژه‌ها', icon: this.icons.projects, count: this.projects.length },
        { id: 'sections', label: 'بخش‌ها', shortLabel: 'بخش‌ها', icon: this.icons.sections, count: this.sections.length }
      ];
      // بی نقشِ اعلام‌شده (هیچ ماژول نقش‌داری نصب نیست) انتسابی هم ممکن نیست
      if (hasRoles) {
        tabs.push({ id: 'assignments', label: 'انتساب کاربران و نقش‌ها', shortLabel: 'انتساب‌ها', icon: this.icons.users, count: this.assignments.filter(a => a.is_active !== false).length });
      }
      this.mainTabsCache = tabs;
    }
    return this.mainTabsCache;
  }

  ngOnInit(): void {
    const sub = this.route?.snapshot?.queryParamMap?.get('sub');
    // زیرتب انتساب بی نقشِ اعلام‌شده رندر نمی‌شود؛ پیوند مستقیم به آن به «پروژه‌ها» برمی‌گردد
    if (sub === 'projects' || sub === 'sections' || (sub === 'assignments' && this.roles.length > 0)) this.activeSubTab = sub;
    this.ws?.connect();
    this.setupRealtimeListeners();
    this.unregisterDirty = this.studioContext?.registerDirty('projects', () => this.isFormDirty()) || null;
    this.loadUsers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId'] && this.companyId) {
      this.resetForCompany();
      this.loadAllData();
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.unregisterDirty?.();
  }

  private resetForCompany(): void {
    this.projects = [];
    this.sections = [];
    this.assignments = [];
    this.selectedProjectId = null;
    this.assignmentProjectFilter = null;
    this.cancelEditProject();
    this.cancelEditSection();
    this.invalidateAssignmentsCache();
  }

  /** فرم پروژه یا بخش نیمه‌کاره (برای هشدار خروج استودیو) */
  isFormDirty(): boolean {
    const p = this.newProject;
    const s = this.newSection;
    return !!(this.editingProject || this.editingSection || p.code?.trim() || p.name?.trim() || p.description?.trim()
      || s.code?.trim() || s.name?.trim());
  }

  switchSubTab(tab: string): void {
    if (tab !== 'projects' && tab !== 'sections' && tab !== 'assignments') return;
    this.activeSubTab = tab;
    // زیرتب در `sub` می‌ماند؛ `tab` از آنِ تب‌های استودیو است
    if (this.router && this.route) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { sub: tab }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.cdr.markForCheck();
  }

  private setupRealtimeListeners(): void {
    if (this.ws) {
      this.subs.push(this.ws.notifications$.subscribe(msg => {
        if (msg?.type_str !== 'org_structure_updated') return;
        // رویداد همین تب پیش‌تر به‌صورت محلی اعمال شده است؛ رویداد شرکت دیگر به این تب ربطی ندارد
        if (msg.client_tab_id && msg.client_tab_id === this.ws?.tabId) return;
        if (msg.company_id && Number(msg.company_id) !== Number(this.companyId)) return;
        if (msg.entity_type === 'project') this.loadProjects();
        else if (msg.entity_type === 'section') this.loadSections();
        else if (msg.entity_type === 'assignment') this.loadAssignments(true);
      }));
    }
    // پاسخ تازهٔ پس‌زمینه (SWR) فقط وقتی جایگزین می‌شود که همان درخواست فهرست همین شرکت باشد
    this.subs.push(this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      if (!Array.isArray(data)) return;
      if (this.isOwnListUrl(url, ORG_PROJECTS_ENDPOINT)) this.projects = data;
      else if (this.isOwnListUrl(url, ORG_SECTIONS_ENDPOINT)) this.sections = data;
      else if (this.isOwnListUrl(url, ORG_ASSIGNMENTS_ENDPOINT)) this.assignments = data;
      else return;
      this.afterDataChange();
    }));
  }

  private isOwnListUrl(url: string | undefined, endpoint: string): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url, 'http://local');
      const params = [...parsed.searchParams.keys()];
      return parsed.pathname.replace(/\/$/, '').endsWith(`/${endpoint}`)
        && parsed.searchParams.get('company_id') === String(this.companyId)
        && params.every(k => k === 'company_id');
    } catch {
      return false;
    }
  }

  private afterDataChange(): void {
    this.invalidateAssignmentsCache();
    this.studioContext?.setCount('projects', this.projects.length);
    this.cdr.markForCheck();
  }

  // ─── بارگذاری ───
  loadAllData(): void {
    this.isLoading = true;
    this.loadError = false;
    this.loadProjects();
    this.loadSections();
    this.loadAssignments();
  }

  private trackLoad<T>(source: Observable<T>, onData: (data: T) => void, failMessage: string): void {
    this.pendingLoads++;
    source.subscribe({
      next: data => {
        onData(data);
        this.afterDataChange();
      },
      error: err => {
        this.loadError = true;
        this.studioContext?.reportError('projects');
        if (!isServerUnreachable(err?.status)) this.toast.error(this.extractApiErrorMessage(err, failMessage));
        this.finishLoad();
      },
      complete: () => this.finishLoad()
    });
  }

  private finishLoad(): void {
    this.pendingLoads = Math.max(0, this.pendingLoads - 1);
    if (this.pendingLoads === 0) {
      this.isLoading = false;
      if (!this.loadError) this.studioContext?.reportError('projects', false);
    }
    this.cdr.markForCheck();
  }

  loadProjects(): void {
    this.trackLoad(this.api.getProjects(undefined, this.companyId), projects => {
      this.projects = Array.isArray(projects) ? projects : [];
      if (this.selectedProjectId && !this.projects.some(p => p.id === this.selectedProjectId)) this.selectedProjectId = null;
      if (!this.newSection.project && this.projects.length > 0) this.newSection.project = this.selectedProjectId ?? this.projects[0].id!;
    }, 'خطا در دریافت فهرست پروژه‌ها');
  }

  loadSections(): void {
    this.trackLoad(this.api.getSections(undefined, this.companyId), sections => {
      this.sections = Array.isArray(sections) ? sections : [];
      const valid = new Set(this.sections.map(s => s.id));
      for (const id of [...this.expandedSectionIds]) if (!valid.has(id)) this.expandedSectionIds.delete(id);
    }, 'خطا در دریافت فهرست بخش‌ها');
  }

  /** همهٔ انتساب‌های بخش‌های این شرکت؛ فیلتر پروژه و نقش در خود صفحه است */
  loadAssignments(forceFresh: boolean = false): void {
    this.trackLoad(this.api.getAssignments(undefined, forceFresh, this.companyId), list => {
      this.assignments = Array.isArray(list) ? list : [];
    }, 'خطا در دریافت فهرست انتساب‌ها');
  }

  loadUsers(): void {
    this.usersLoadError = false;
    this.usersLoading = true;
    this.accountsHttp.getUsers().subscribe({
      next: users => {
        this.usersLoading = false;
        this.systemUsers = Array.isArray(users) ? users : [];
        this.invalidateAssignmentsCache();
        this.cdr.markForCheck();
      },
      error: err => {
        this.usersLoading = false;
        this.usersLoadError = true;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در دریافت لیست کاربران'));
        this.cdr.markForCheck();
      }
    });
  }

  // ─── فیلترها ───
  get filteredProjects(): OrgProject[] {
    const q = this.projectSearchQuery.trim().toLowerCase();
    if (!q) return this.projects;
    return this.projects.filter(p =>
      p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
  }

  get filteredSections(): OrgProjectSection[] {
    let list = this.sections;
    if (this.selectedProjectId) list = list.filter(s => Number(s.project) === this.selectedProjectId);
    const q = this.sectionSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(s =>
      s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.project_name?.toLowerCase().includes(q));
  }

  private _cachedGrouped: SectionGroupedAssignments[] | null = null;
  private _cachedFiltered: OrgSectionAssignment[] | null = null;
  private _cachedAvailableUsers: User[] | null = null;
  private _availableUsersKey = '';

  invalidateAssignmentsCache(): void {
    this._cachedGrouped = null;
    this._cachedLevelGroups = null;
    this._cachedFiltered = null;
    this._cachedAvailableUsers = null;
    this._availableUsersKey = '';
  }

  onAssignmentFilterChange(): void {
    this.invalidateAssignmentsCache();
    this.cdr.markForCheck();
  }

  clearAssignmentFilters(): void {
    this.assignmentSearchQuery = '';
    this.assignmentProjectFilter = null;
    this.assignmentRoleFilter = 'all';
    this.onAssignmentFilterChange();
  }

  private static sectionIdOf(a: OrgSectionAssignment): number {
    const sec = a.section as unknown;
    return Number(typeof sec === 'object' && sec ? (sec as { id?: number }).id : sec);
  }

  private matchesAssignmentQuery(a: OrgSectionAssignment, q: string): boolean {
    return !!(a.user_full_name?.toLowerCase().includes(q) || a.username?.toLowerCase().includes(q)
      || a.section_name?.toLowerCase().includes(q) || a.project_name?.toLowerCase().includes(q)
      || a.role_display?.toLowerCase().includes(q) || this.roleByKey(a.role)?.shortLabelFa.includes(q));
  }

  get filteredAssignments(): OrgSectionAssignment[] {
    if (this._cachedFiltered) return this._cachedFiltered;
    let list = this.assignments;
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    if (pFilter) {
      // انتساب سطح شرکت برای همهٔ پروژه‌ها معتبر است و زیر فیلتر پروژه هم دیده می‌شود
      list = list.filter(a => this.levelOf(a) === 'company' || this.projectIdOf(a) === pFilter);
    }
    if (this.assignmentRoleFilter !== 'all') list = list.filter(a => a.role === this.assignmentRoleFilter);
    const q = this.assignmentSearchQuery.trim().toLowerCase();
    if (q) list = list.filter(a => this.matchesAssignmentQuery(a, q));
    this._cachedFiltered = list;
    return list;
  }

  private buildRoles(direct: OrgSectionAssignment[], inherited: InheritedHolder[]): SectionRoleGroup[] {
    return this.roles.map(role => ({
      role,
      assignments: direct.filter(a => a.role === role.key),
      inherited: inherited.filter(h => h.assignment.role === role.key)
    }));
  }

  private static distinctUsers(direct: OrgSectionAssignment[], inherited: InheritedHolder[]): number {
    return new Set([...direct, ...inherited.map(h => h.assignment)].map(a => Number(a.user))).size;
  }

  private applyRoleFilter(roles: SectionRoleGroup[]): SectionRoleGroup[] {
    return this.assignmentRoleFilter === 'all' ? roles : roles.filter(r => r.role.key === this.assignmentRoleFilter);
  }

  private _cachedLevelGroups: AssignmentGroup[] | null = null;

  /**
   * کارت‌های سطح شرکت و سطح پروژه بالای کارت‌های بخش. انتساب این کارت‌ها برای همهٔ بخش‌های زیرشان معتبر است.
   * با جستجو فقط کارتی می‌ماند که عنوان یا دارنده‌ای مطابق دارد.
   */
  get levelGroups(): AssignmentGroup[] {
    if (this._cachedLevelGroups) return this._cachedLevelGroups;
    const q = this.assignmentSearchQuery.trim().toLowerCase();
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    const result: AssignmentGroup[] = [];
    const companyRows = this.companyLevelRows();
    const companyName = this.studioContext?.company()?.name || companyRows[0]?.company_name || '';
    if (!q || 'شرکت'.includes(q) || companyName.toLowerCase().includes(q) || companyRows.some(a => this.matchesAssignmentQuery(a, q))) {
      result.push({
        key: 'company', level: 'company', title: 'همهٔ بخش‌های شرکت',
        subtitle: 'انتساب این‌جا برای همهٔ پروژه‌ها و بخش‌های شرکت معتبر است.',
        roles: this.applyRoleFilter(this.buildRoles(companyRows, [])),
        totalAssignedUsers: CompanyProjectsTabComponent.distinctUsers(companyRows, []), missingWarnings: []
      });
    }
    for (const p of this.projects) {
      if (!p.id || (pFilter && p.id !== pFilter)) continue;
      const rows = this.projectLevelRows(p.id);
      if (q && !(p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || rows.some(a => this.matchesAssignmentQuery(a, q)))) continue;
      result.push({
        key: `project:${p.id}`, level: 'project', title: p.name, code: p.code, inactive: p.is_active === false, project: p,
        subtitle: 'انتساب این‌جا برای همهٔ بخش‌های این پروژه معتبر است.',
        roles: this.applyRoleFilter(this.buildRoles(rows, [])),
        totalAssignedUsers: CompanyProjectsTabComponent.distinctUsers(rows, []), missingWarnings: []
      });
    }
    this._cachedLevelGroups = result;
    return result;
  }

  get groupedAssignmentsBySection(): SectionGroupedAssignments[] {
    if (this._cachedGrouped) return this._cachedGrouped;
    let sections = this.sections;
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    if (pFilter) sections = sections.filter(s => Number(s.project) === pFilter);
    const q = this.assignmentSearchQuery.trim().toLowerCase();
    const companyInherited: InheritedHolder[] = this.companyLevelRows().map(assignment => ({ assignment, source: 'company' }));
    const projectInherited = new Map<number, InheritedHolder[]>();
    const result: SectionGroupedAssignments[] = [];
    for (const sec of sections) {
      const projectId = Number(sec.project);
      if (!projectInherited.has(projectId)) {
        projectInherited.set(projectId, this.projectLevelRows(projectId).map(assignment => ({ assignment, source: 'project' as const })));
      }
      const direct = this.assignments.filter(a =>
        this.levelOf(a) === 'section' && CompanyProjectsTabComponent.sectionIdOf(a) === Number(sec.id) && this.isActiveRow(a));
      const inherited = [...companyInherited, ...projectInherited.get(projectId)!];
      if (q) {
        const matchesSection = sec.name?.toLowerCase().includes(q) || sec.code?.toLowerCase().includes(q)
          || sec.project_name?.toLowerCase().includes(q);
        if (!matchesSection && !direct.some(a => this.matchesAssignmentQuery(a, q))) continue;
      }
      const allRoles = this.buildRoles(direct, inherited);
      // هشدار «فاقد …» فقط وقتی که نه انتساب مستقیم و نه دارندهٔ ارث‌برده از شرکت یا پروژه هست
      const missingWarnings = allRoles
        .filter(r => r.role.missingWarningFa && r.assignments.length === 0 && r.inherited.length === 0)
        .map(r => r.role.missingWarningFa!);
      result.push({
        key: `section:${sec.id}`, level: 'section', title: sec.name, code: sec.code, inactive: !sec.is_active,
        subtitle: `پروژه: ${sec.project_name || this.projects.find(p => p.id === projectId)?.name || ''}`,
        section: sec, roles: this.applyRoleFilter(allRoles),
        totalAssignedUsers: CompanyProjectsTabComponent.distinctUsers(direct, inherited), missingWarnings
      });
    }
    this._cachedGrouped = result;
    return result;
  }

  get availableUsersForQuickAssign(): User[] {
    const target = this.quickAssignTarget;
    const roleKey = this.quickAssign.role?.key;
    if (!target || !roleKey) return [];
    const q = this.quickAssign.userSearchQuery.trim().toLowerCase();
    const key = `${target.level}:${target.id}_${roleKey}_${q}_${this.assignments.length}_${this.systemUsers.length}`;
    if (this._cachedAvailableUsers && this._availableUsersKey === key) return this._cachedAvailableUsers;
    // کاربری که همین نقش را در همین مقصد دارد دوباره فهرست نمی‌شود
    const existing = new Set(this.assignments
      .filter(a => a.role === roleKey && this.isActiveRow(a) && this.isSameTarget(a, target))
      .map(a => Number(a.user)));
    let users = this.systemUsers.filter(u => u.is_active !== false && !existing.has(Number(u.id)));
    if (q) {
      users = users.filter(u => u.first_name?.toLowerCase().includes(q) || u.last_name?.toLowerCase().includes(q)
        || u.username?.toLowerCase().includes(q));
    }
    this._cachedAvailableUsers = users;
    this._availableUsersKey = key;
    return users;
  }

  /** انتساب‌های فعال مستقیم یک بخش (بی دارندگان ارث‌برده از شرکت یا پروژه) */
  sectionAssignmentCount(sectionId: number | undefined): number {
    return this.assignments.filter(a => this.levelOf(a) === 'section'
      && CompanyProjectsTabComponent.sectionIdOf(a) === Number(sectionId) && this.isActiveRow(a)).length;
  }

  get cloneSourceSections(): OrgProjectSection[] {
    const targetId = this.cloneModal.targetSection?.id;
    let list = this.sections.filter(s => s.id !== targetId);
    if (this.cloneModal.sourceProjectId) list = list.filter(s => Number(s.project) === this.cloneModal.sourceProjectId);
    return list;
  }

  get cloneSourceStats(): { total: number; roleCounts: Record<string, number> } {
    const sourceId = this.cloneModal.sourceSectionId;
    if (!sourceId) return { total: 0, roleCounts: {} };
    // کپی فقط ردیف‌های مستقیم بخش را می‌برد (همان رفتار سرور)
    const list = this.assignments.filter(a => this.levelOf(a) === 'section'
      && CompanyProjectsTabComponent.sectionIdOf(a) === Number(sourceId) && this.isActiveRow(a));
    const roleCounts: Record<string, number> = {};
    for (const a of list) roleCounts[a.role] = (roleCounts[a.role] || 0) + 1;
    return { total: list.length, roleCounts };
  }

  trackById(_: number, item: { id?: number }): number | undefined {
    return item.id;
  }

  getUserInitials(name?: string, username?: string): string {
    const clean = (name?.trim() || username || '').trim();
    if (!clean) return '؟';
    const parts = clean.split(/\s+/);
    return parts.length >= 2 ? `${parts[0][0]} ${parts[1][0]}` : clean.slice(0, 2);
  }

  fa(n: number): string {
    return new Intl.NumberFormat('fa-IR').format(n);
  }

  // ─── اکسل ───
  get exportLabel(): string {
    return this.activeSubTab === 'projects' ? 'خروجی پروژه‌ها' : this.activeSubTab === 'sections' ? 'خروجی بخش‌ها' : 'خروجی انتساب‌ها';
  }

  get importLabel(): string {
    return this.activeSubTab === 'projects' ? 'ورود پروژه‌ها' : this.activeSubTab === 'sections' ? 'ورود بخش‌ها' : 'ورود انتساب‌ها';
  }

  exportExcel(): void {
    const [source, filename] = this.activeSubTab === 'projects'
      ? [this.api.exportProjectsExcel(this.companyId), 'projects.xlsx']
      : this.activeSubTab === 'sections'
        ? [this.api.exportSectionsExcel(this.selectedProjectId, this.companyId), 'project_sections.xlsx']
        : [this.api.exportAssignmentsExcel(this.assignmentProjectFilter, this.assignmentRoleFilter, this.companyId), 'section_assignments.xlsx'];
    this.isExporting = true;
    source.subscribe({
      next: blob => {
        void saveBlob(blob, filename);
        this.isExporting = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.isExporting = false;
        this.toast.error(this.extractApiErrorMessage(err, 'خطا در دریافت فایل اکسل'));
        this.cdr.markForCheck();
      }
    });
  }

  openImportModal(): void {
    const cid = this.companyId;
    if (this.activeSubTab === 'projects') {
      this.excelModalTitle = 'ثبت دسته‌جمعی پروژه‌ها از اکسل';
      this.excelImportFn = (file, _update, dryRun) => this.api.importProjectsExcel(file, !!dryRun, cid);
      this.excelTemplateFn = () => this.downloadTemplate(this.api.downloadProjectsTemplate(), 'projects_template.xlsx');
    } else if (this.activeSubTab === 'sections') {
      this.excelModalTitle = 'ثبت دسته‌جمعی بخش‌ها از اکسل';
      this.excelImportFn = (file, _update, dryRun) => this.api.importSectionsExcel(file, !!dryRun, cid);
      this.excelTemplateFn = () => this.downloadTemplate(this.api.downloadSectionsTemplate(), 'sections_template.xlsx');
    } else {
      this.excelModalTitle = 'ثبت دسته‌جمعی انتساب‌ها از اکسل';
      this.excelImportFn = (file, _update, dryRun) => this.api.importAssignmentsExcel(file, !!dryRun, cid);
      this.excelTemplateFn = () => this.downloadTemplate(this.api.downloadAssignmentsTemplate(), 'assignments_template.xlsx');
    }
    this.isExcelModalOpen = true;
    this.cdr.markForCheck();
  }

  private downloadTemplate(source: Observable<Blob>, filename: string): void {
    source.subscribe({
      next: blob => void saveBlob(blob, filename),
      error: err => this.toast.error(this.extractApiErrorMessage(err, 'خطا در دریافت قالب اکسل'))
    });
  }

  onExcelImported(result: ImportResult | null): void {
    if (result?.success && !result.dry_run) {
      this.toast.success('اطلاعات اکسل با موفقیت اعمال شد.');
      this.loadAllData();
    }
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.cdr.markForCheck();
  }

  // ─── پروژه ───
  private emptyProject(): Partial<OrgProject> {
    return { code: '', name: '', description: '', is_active: true };
  }

  private normalizeCode(val?: string | null): string {
    return normalizeDigits(String(val || '')).trim().toUpperCase();
  }

  saveProject(): void {
    if (!this.canWrite || this.isSavingProject) return;
    const code = this.normalizeCode(this.newProject.code);
    const name = this.newProject.name?.trim() || '';
    if (!code || !name) {
      this.toast.warning('لطفاً کد و نام پروژه را وارد کنید.');
      return;
    }
    const payload: Partial<OrgProject> = {
      code, name, description: this.newProject.description?.trim() || '', is_active: this.newProject.is_active !== false
    };
    const editId = this.editingProject?.id;
    // پروژهٔ تازه همیشه زیر شرکت همین استودیو ساخته می‌شود
    const request = editId ? this.api.updateProject(editId, payload) : this.api.createProject({ ...payload, company: this.companyId });
    this.isSavingProject = true;
    request.subscribe({
      next: saved => {
        this.isSavingProject = false;
        const queued = CompanyProjectsTabComponent.isQueued(saved);
        if (queued) this.queuedToast();
        else this.toast.success(editId ? `پروژهٔ «${saved.name}» به‌روز شد.` : `پروژهٔ «${saved.name}» ثبت شد.`);
        // پاسخ صف آفلاین شناسهٔ موقت منفی دارد؛ در ویرایش فقط فیلدهای فرستاده‌شده روی ردیف موجود می‌نشینند
        this.projects = editId
          ? this.projects.map(p => p.id === editId ? (queued ? { ...p, ...payload, _offlinePending: true } : { ...p, ...saved }) : p)
          : [saved, ...this.projects.filter(p => p.id !== saved.id)];
        this.cancelEditProject();
        this.afterDataChange();
        if (!editId && saved.id && !this.newSection.project) this.newSection.project = saved.id;
      },
      error: err => {
        this.isSavingProject = false;
        this.toast.error(this.extractApiErrorMessage(err, editId ? 'خطا در ویرایش پروژه' : 'خطا در ثبت پروژه'));
        this.cdr.markForCheck();
      }
    });
  }

  editProject(proj: OrgProject): void {
    this.editingProject = proj;
    this.newProject = { ...proj };
    this.cdr.markForCheck();
  }

  cancelEditProject(): void {
    this.editingProject = null;
    this.newProject = this.emptyProject();
  }

  private async confirm(title: string, message: string, confirmText: string): Promise<boolean> {
    if (!this.confirmDialog) return false;
    return (await this.confirmDialog.open({ title, message, confirmText, cancelText: 'انصراف', type: 'danger' })) === true;
  }

  async deleteProject(proj: OrgProject): Promise<void> {
    if (!this.canWrite || !proj.id) return;
    const ok = await this.confirm('حذف پروژه',
      `آیا از حذف پروژهٔ «${proj.name}» اطمینان دارید؟ بخش‌ها و انتساب‌های آن هم حذف می‌شوند؛ اگر سندی به آن اشاره کند، فقط غیرفعال می‌شود.`,
      'حذف پروژه');
    if (!ok) return;
    const id = proj.id;
    this.api.deleteProject(id).subscribe({
      next: res => {
        if (this.selectedProjectId === id) this.selectedProjectId = null;
        if (CompanyProjectsTabComponent.isQueued(res)) {
          // در صف آفلاین: فقط نمای محلی؛ کش دست نمی‌خورد و دریافت آنلاین بعدی آن را با دادهٔ سرور جایگزین می‌کند
          this.queuedToast();
          const sectionIds = new Set(this.sections.filter(s => Number(s.project) === id).map(s => s.id));
          this.projects = this.projects.filter(p => p.id !== id);
          this.sections = this.sections.filter(s => Number(s.project) !== id);
          this.assignments = this.assignments.filter(a => !sectionIds.has(CompanyProjectsTabComponent.sectionIdOf(a))
            && !(this.levelOf(a) === 'project' && Number(a.project ?? a.project_id) === id));
          this.afterDataChange();
          return;
        }
        this.toast.success('پروژه حذف یا غیرفعال شد.');
        // حذف نرم (ارجاع بیرونی) یا فیزیکی را فقط سرور می‌داند؛ فهرست تازه کش را جایگزین می‌کند
        this.loadAllData();
      },
      error: err => this.toast.error(this.extractApiErrorMessage(err, 'خطا در حذف پروژه'))
    });
  }

  // ─── بخش ───
  private emptySection(project: number | null): { project: number | null; code: string; name: string; is_active: boolean } {
    return { project, code: '', name: '', is_active: true };
  }

  onSectionProjectFilterChange(projectId: number | null): void {
    this.selectedProjectId = projectId ? Number(projectId) : null;
    if (this.selectedProjectId && !this.editingSection) this.newSection.project = this.selectedProjectId;
    this.cdr.markForCheck();
  }

  saveSection(): void {
    if (!this.canWrite || this.isSavingSection) return;
    const project = this.newSection.project;
    if (!project) {
      this.toast.warning('لطفاً ابتدا پروژهٔ والد را انتخاب کنید.');
      return;
    }
    const code = this.normalizeCode(this.newSection.code);
    const name = this.newSection.name?.trim() || '';
    if (!code || !name) {
      this.toast.warning('لطفاً کد و نام بخش را وارد کنید.');
      return;
    }
    const payload = { code, name, is_active: this.newSection.is_active !== false, project };
    const editId = this.editingSection?.id;
    const request = editId ? this.api.updateSection(editId, payload) : this.api.createSection(payload);
    this.isSavingSection = true;
    request.subscribe({
      next: saved => {
        this.isSavingSection = false;
        const queued = CompanyProjectsTabComponent.isQueued(saved);
        if (queued) this.queuedToast();
        else this.toast.success(editId ? `بخش «${saved.name}» به‌روز شد.` : `بخش «${saved.name}» ثبت شد.`);
        const projectName = this.projects.find(p => p.id === project)?.name;
        this.sections = editId
          ? this.sections.map(s => s.id === editId ? (queued ? { ...s, ...payload, project_name: projectName, _offlinePending: true } : { ...s, ...saved }) : s)
          : [{ project_name: projectName, ...saved }, ...this.sections.filter(s => s.id !== saved.id)];
        this.editingSection = null;
        this.newSection = this.emptySection(project);
        // شمار بخش‌های پروژه از سرور می‌آید (فقط آنلاین)
        if (!queued) this.loadProjects();
        this.afterDataChange();
      },
      error: err => {
        this.isSavingSection = false;
        this.toast.error(this.extractApiErrorMessage(err, editId ? 'خطا در ویرایش بخش' : 'خطا در ثبت بخش'));
        this.cdr.markForCheck();
      }
    });
  }

  editSection(sec: OrgProjectSection): void {
    this.editingSection = sec;
    this.newSection = { project: sec.project ?? this.selectedProjectId, code: sec.code, name: sec.name, is_active: sec.is_active !== false };
    this.cdr.markForCheck();
  }

  cancelEditSection(): void {
    this.editingSection = null;
    this.newSection = this.emptySection(this.selectedProjectId ?? this.projects[0]?.id ?? null);
  }

  async deleteSection(sec: OrgProjectSection): Promise<void> {
    if (!this.canWrite || !sec.id) return;
    const ok = await this.confirm('حذف بخش',
      `آیا از حذف بخش «${sec.name}» اطمینان دارید؟ انتساب‌های کاربران به این بخش هم حذف می‌شوند؛ اگر سندی به آن اشاره کند، فقط غیرفعال می‌شود.`,
      'حذف بخش');
    if (!ok) return;
    const id = sec.id;
    this.api.deleteSection(id).subscribe({
      next: res => {
        if (CompanyProjectsTabComponent.isQueued(res)) {
          this.queuedToast();
          this.sections = this.sections.filter(s => s.id !== id);
          this.assignments = this.assignments.filter(a => this.levelOf(a) !== 'section' || CompanyProjectsTabComponent.sectionIdOf(a) !== id);
          this.afterDataChange();
          return;
        }
        this.toast.success('بخش حذف یا غیرفعال شد.');
        this.loadAllData();
      },
      error: err => this.toast.error(this.extractApiErrorMessage(err, 'خطا در حذف بخش'))
    });
  }

  // ─── ماتریس انتساب ───
  isSectionCollapsed(sectionId: number | undefined): boolean {
    return !sectionId || !this.expandedSectionIds.has(sectionId);
  }

  /** کارت‌های سطح شرکت و پروژه (کلید `company` و `project:<id>`) که باز شده‌اند */
  expandedLevelKeys = new Set<string>();

  isGroupCollapsed(g: AssignmentGroup): boolean {
    return g.section ? this.isSectionCollapsed(g.section.id) : !this.expandedLevelKeys.has(g.key);
  }

  /** باز و بسته کردن کارت یک مقصد (بخش با شناسه، سطح شرکت و پروژه با کلید) */
  toggleGroupCollapse(g: AssignmentGroup): void {
    const sectionId = g.section?.id;
    if (sectionId) {
      if (this.expandedSectionIds.has(sectionId)) this.expandedSectionIds.delete(sectionId);
      else this.expandedSectionIds.add(sectionId);
    } else if (g.section) {
      return;
    } else if (this.expandedLevelKeys.has(g.key)) this.expandedLevelKeys.delete(g.key);
    else this.expandedLevelKeys.add(g.key);
    this.cdr.markForCheck();
  }

  expandAllSections(): void {
    this.expandedSectionIds = new Set(this.sections.map(s => s.id).filter((id): id is number => typeof id === 'number'));
    this.expandedLevelKeys = new Set(this.levelGroups.map(g => g.key));
    this.cdr.markForCheck();
  }

  collapseAllSections(): void {
    this.expandedSectionIds = new Set();
    this.expandedLevelKeys = new Set();
    this.cdr.markForCheck();
  }

  private emptyQuickAssign(): CompanyProjectsTabComponent['quickAssign'] {
    return { isOpen: false, targets: [], level: 'section', role: null, selectedUserIds: [], userSearchQuery: '', isSubmitting: false };
  }

  private companyTarget(): AssignmentTargetRef {
    return { level: 'company', id: Number(this.companyId), name: this.studioContext?.company()?.name || 'کل شرکت', projectId: null };
  }

  private projectTarget(projectId: number): AssignmentTargetRef | null {
    const p = this.projects.find(x => x.id === projectId);
    return p?.id ? { level: 'project', id: p.id, name: p.name, projectId: p.id, projectName: p.name } : null;
  }

  /** گزینه‌های سطح برای کارت مبدأ: بخش ← پروژهٔ آن ← شرکت؛ پروژه ← شرکت؛ شرکت */
  private targetsFor(g: AssignmentGroup): AssignmentTargetRef[] {
    const targets: AssignmentTargetRef[] = [];
    if (g.section?.id) {
      const projectId = Number(g.section.project);
      targets.push({ level: 'section', id: g.section.id, name: g.section.name, projectId, projectName: g.section.project_name });
      const pt = this.projectTarget(projectId);
      if (pt) targets.push(pt);
    } else if (g.project?.id) {
      const pt = this.projectTarget(g.project.id);
      if (pt) targets.push(pt);
    }
    targets.push(this.companyTarget());
    return targets;
  }

  /** مقصد انتخاب‌شدهٔ مودال انتساب گروهی */
  get quickAssignTarget(): AssignmentTargetRef | null {
    return this.quickAssign.targets.find(t => t.level === this.quickAssign.level) ?? null;
  }

  /** متن گزینهٔ سطح در مودال انتساب گروهی */
  targetOptionLabel(t: AssignmentTargetRef): string {
    if (t.level === 'company') return 'کل شرکت (همهٔ پروژه‌ها و بخش‌ها)';
    if (t.level === 'project') return `کل پروژهٔ «${t.name}» (همهٔ بخش‌های آن)`;
    return `فقط بخش «${t.name}»`;
  }

  private isSameTarget(a: OrgSectionAssignment, t: AssignmentTargetRef): boolean {
    const level = this.levelOf(a);
    if (level !== t.level) return false;
    if (level === 'company') return a.company == null || Number(a.company) === t.id;
    if (level === 'project') return Number(a.project ?? a.project_id) === t.id;
    return CompanyProjectsTabComponent.sectionIdOf(a) === t.id;
  }

  openQuickAssign(group: AssignmentGroup, role: SectionRoleSpec): void {
    if (!this.canWrite) return;
    const targets = this.targetsFor(group);
    this.quickAssign = { ...this.emptyQuickAssign(), isOpen: true, targets, level: targets[0].level, role };
    this._cachedAvailableUsers = null;
    this.cdr.markForCheck();
  }

  onQuickAssignLevelChange(level: OrgAssignmentLevel): void {
    this.quickAssign.level = level;
    this._cachedAvailableUsers = null;
    this.cdr.markForCheck();
  }

  closeQuickAssign(): void {
    this.quickAssign = this.emptyQuickAssign();
    this._cachedAvailableUsers = null;
    this.cdr.markForCheck();
  }

  isUserSelected(userId: number): boolean {
    return this.quickAssign.selectedUserIds.includes(userId);
  }

  toggleUserSelection(userId: number): void {
    const ids = this.quickAssign.selectedUserIds;
    this.quickAssign.selectedUserIds = ids.includes(userId) ? ids.filter(id => id !== userId) : [...ids, userId];
  }

  selectAllAvailableUsers(): void {
    this.quickAssign.selectedUserIds = [...new Set([...this.quickAssign.selectedUserIds, ...this.availableUsersForQuickAssign.map(u => u.id)])];
  }

  deselectAllUsers(): void {
    this.quickAssign.selectedUserIds = [];
  }

  /** بدنهٔ مقصد برای bulk-assign */
  private static bulkTarget(t: AssignmentTargetRef): { section_id: number } | { project_id: number } | { company_id: number } {
    if (t.level === 'company') return { company_id: t.id };
    if (t.level === 'project') return { project_id: t.id };
    return { section_id: t.id };
  }

  /** فیلدهای مقصد ردیف محلی (صف آفلاین) هم‌شکل پاسخ سرور */
  private targetFields(t: AssignmentTargetRef): Partial<OrgSectionAssignment> {
    return {
      level: t.level,
      company: t.level === 'company' ? t.id : null,
      project: t.level === 'project' ? t.id : null,
      section: t.level === 'section' ? t.id : null,
      target_company_id: Number(this.companyId),
      section_name: t.level === 'section' ? t.name : null,
      project_id: t.projectId ?? null,
      project_name: t.projectName ?? null
    };
  }

  submitQuickAssign(): void {
    const { role, selectedUserIds } = this.quickAssign;
    const target = this.quickAssignTarget;
    if (!target || !role || selectedUserIds.length === 0) {
      this.toast.warning('لطفاً دست‌کم یک کاربر را برای انتساب انتخاب کنید.');
      return;
    }
    this.quickAssign.isSubmitting = true;
    this.api.bulkAssign({ ...CompanyProjectsTabComponent.bulkTarget(target), user_ids: [...selectedUserIds], role: role.key }).subscribe({
      next: created => {
        if (CompanyProjectsTabComponent.isQueued(created)) {
          // پاسخ صف آفلاین فهرست ندارد؛ ردیف‌های موقت (شناسهٔ منفی) تا دریافت آنلاین بعدی نمایش داده می‌شوند
          this.queuedToast();
          const users = new Map(this.systemUsers.map(u => [u.id, u]));
          const stamp = Date.now();
          const pending: OrgSectionAssignment[] = selectedUserIds.map((uid, i) => {
            const u = users.get(uid);
            return {
              id: -(stamp + i), user: uid, username: u?.username, user_full_name: `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.username,
              ...this.targetFields(target), section: target.level === 'section' ? target.id : null,
              role: role.key, is_active: true, _offlinePending: true
            };
          });
          this.assignments = [...pending, ...this.assignments];
          this.closeQuickAssign();
          this.afterDataChange();
          return;
        }
        const list = Array.isArray(created) ? created : [];
        const where = target.level === 'company' ? 'در سطح شرکت' : target.level === 'project' ? `در پروژهٔ «${target.name}»` : `در بخش «${target.name}»`;
        this.toast.success(`${this.fa(list.length)} کاربر به‌عنوان «${role.shortLabelFa}» ${where} منتسب شدند.`);
        const ids = new Set(list.map(a => a.id));
        this.assignments = [...list, ...this.assignments.filter(a => !ids.has(a.id))];
        this.closeQuickAssign();
        this.afterDataChange();
        this.loadAssignments();
      },
      error: err => {
        this.quickAssign.isSubmitting = false;
        this.toast.error(this.extractApiErrorMessage(err, 'خطا در انتساب کاربران'));
        this.cdr.markForCheck();
      }
    });
  }

  private emptyEditAssignment(): CompanyProjectsTabComponent['editAssignment'] {
    return { isOpen: false, assignment: null, role: '', is_active: true, level: 'section', projectId: null, sectionId: null, errors: {}, isSubmitting: false };
  }

  openEditAssignment(assignment: OrgSectionAssignment): void {
    if (!this.canWrite) return;
    const level = this.levelOf(assignment);
    this.editAssignment = {
      ...this.emptyEditAssignment(),
      isOpen: true, assignment, role: assignment.role, is_active: assignment.is_active !== false, level,
      projectId: this.projectIdOf(assignment),
      sectionId: level === 'section' ? CompanyProjectsTabComponent.sectionIdOf(assignment) : null
    };
    this.cdr.markForCheck();
  }

  closeEditAssignment(): void {
    this.editAssignment = this.emptyEditAssignment();
    this.cdr.markForCheck();
  }

  /** بخش‌های پروژهٔ انتخاب‌شده در مودال ویرایش (برای سطح بخش) */
  get editAssignmentSections(): OrgProjectSection[] {
    const pid = this.editAssignment.projectId;
    return pid ? this.sections.filter(s => Number(s.project) === Number(pid)) : this.sections;
  }

  /** عنوان گزینهٔ بخش در مودال ویرایش؛ تا پروژه انتخاب نشده نام پروژه هم نمایش داده می‌شود تا بخش‌های هم‌نام تمایز یابند */
  editSectionOptionLabel(s: OrgProjectSection): string {
    if (this.editAssignment.projectId) return s.name;
    const project = this.projects.find(p => Number(p.id) === Number(s.project));
    return project ? `${s.name} — ${project.name}` : s.name;
  }

  /** انتساب در سطح شرکت یا پروژه شامل همهٔ بخش‌های زیرمجموعه هم می‌شود */
  isWideLevel(level: OrgAssignmentLevel | null | undefined): boolean {
    return level === 'company' || level === 'project';
  }

  onEditLevelChange(level: OrgAssignmentLevel): void {
    this.editAssignment.level = level;
    this.editAssignment.errors = {};
    if (level === 'section' && this.editAssignment.sectionId
      && !this.editAssignmentSections.some(s => s.id === this.editAssignment.sectionId)) this.editAssignment.sectionId = null;
  }

  onEditProjectChange(projectId: number | null): void {
    this.editAssignment.projectId = projectId ? Number(projectId) : null;
    if (this.editAssignment.sectionId && !this.editAssignmentSections.some(s => s.id === this.editAssignment.sectionId)) {
      this.editAssignment.sectionId = null;
    }
    delete this.editAssignment.errors['project'];
  }

  /**
   * بدنهٔ PATCH ویرایش: نقش و وضعیت، و اگر سطح یا مقصد عوض شده، هر سه کلید مقصد (مقصد تازه پر و دو کلید دیگر null)
   * تا وضعیت نهایی دقیقاً یک مقصد داشته باشد. null یعنی خطای فیلدی (کنار همان فیلد نمایش داده می‌شود).
   */
  private buildEditPatch(): { patch: Partial<OrgSectionAssignment>; target: AssignmentTargetRef | null } | null {
    const e = this.editAssignment;
    const a = e.assignment!;
    const patch: Partial<OrgSectionAssignment> = { role: e.role, is_active: e.is_active };
    const errors: Record<string, string> = {};
    let target: AssignmentTargetRef | null = null;
    if (e.level === 'company') {
      target = this.companyTarget();
    } else if (e.level === 'project') {
      if (!e.projectId) errors['project'] = 'پروژه را انتخاب کنید.';
      else target = this.projectTarget(e.projectId);
    } else {
      const sec = this.sections.find(s => s.id === e.sectionId);
      if (!sec?.id) errors['section'] = 'بخش را انتخاب کنید.';
      else target = { level: 'section', id: sec.id, name: sec.name, projectId: Number(sec.project), projectName: sec.project_name };
    }
    e.errors = errors;
    if (Object.keys(errors).length > 0) return null;
    if (target && !this.isSameTarget(a, target)) {
      patch.company = target.level === 'company' ? target.id : null;
      patch.project = target.level === 'project' ? target.id : null;
      patch.section = target.level === 'section' ? target.id : null;
      return { patch, target };
    }
    return { patch, target: null };
  }

  submitEditAssignment(): void {
    const id = this.editAssignment.assignment?.id;
    if (!id) return;
    const built = this.buildEditPatch();
    if (!built) {
      this.cdr.markForCheck();
      return;
    }
    const { patch, target } = built;
    this.editAssignment.isSubmitting = true;
    // نمای محلی صف آفلاین: فیلدهای نمایشی مقصد تازه هم روی ردیف می‌نشینند
    const localPatch: Partial<OrgSectionAssignment> = target ? { ...patch, ...this.targetFields(target) } : patch;
    this.api.updateAssignment(id, patch).subscribe({
      next: updated => {
        const queued = CompanyProjectsTabComponent.isQueued(updated);
        if (queued) this.queuedToast();
        else this.toast.success('انتساب ویرایش شد.');
        this.assignments = this.assignments.map(a => a.id === id ? (queued ? { ...a, ...localPatch, _offlinePending: true } : { ...a, ...updated }) : a);
        this.closeEditAssignment();
        this.afterDataChange();
      },
      error: err => {
        this.editAssignment.isSubmitting = false;
        // خطای مقصد سرور (تکراری یا نامعتبر) کنار فیلد مقصد هم نشان داده می‌شود
        const body = err?.error;
        if (body && typeof body === 'object') {
          const fieldKey = this.editAssignment.level === 'company' ? 'level' : this.editAssignment.level;
          for (const k of ['target', 'section', 'project', 'company', 'non_field_errors']) {
            const v = body[k];
            if (v) {
              this.editAssignment.errors = { ...this.editAssignment.errors, [fieldKey]: Array.isArray(v) ? v.join('، ') : String(v) };
              break;
            }
          }
        }
        this.toast.error(this.extractApiErrorMessage(err, 'خطا در ویرایش انتساب'));
        this.cdr.markForCheck();
      }
    });
  }

  toggleAssignmentStatus(assignment: OrgSectionAssignment): void {
    if (!this.canWrite || !assignment.id) return;
    const id = assignment.id;
    const next = assignment.is_active === false;
    this.api.updateAssignment(id, { is_active: next }).subscribe({
      next: updated => {
        const queued = CompanyProjectsTabComponent.isQueued(updated);
        this.assignments = this.assignments.map(a => a.id === id ? (queued ? { ...a, is_active: next, _offlinePending: true } : { ...a, ...updated }) : a);
        if (queued) this.queuedToast();
        else this.toast.success(`انتساب «${assignment.user_full_name || assignment.username}» ${next ? 'فعال' : 'غیرفعال'} شد.`);
        this.afterDataChange();
      },
      error: err => this.toast.error(this.extractApiErrorMessage(err, 'خطا در تغییر وضعیت انتساب'))
    });
  }

  async deleteAssignment(assignment: OrgSectionAssignment): Promise<void> {
    if (!this.canWrite || !assignment.id) return;
    const who = assignment.user_full_name || assignment.username || '';
    const where = this.levelOf(assignment) === 'company' ? 'در سطح شرکت' : this.levelOf(assignment) === 'project' ? 'در سطح پروژه' : 'به این بخش';
    const ok = await this.confirm('لغو انتساب', `آیا از لغو انتساب «${who}» ${where} اطمینان دارید؟`, 'لغو انتساب');
    if (!ok) return;
    const id = assignment.id;
    this.api.deleteAssignment(id).subscribe({
      next: res => {
        if (CompanyProjectsTabComponent.isQueued(res)) {
          // سرور انتساب را غیرفعال می‌کند (حذف نرم)؛ نمای محلی همان را نشان می‌دهد
          this.queuedToast();
          this.assignments = this.assignments.map(a => a.id === id ? { ...a, is_active: false, _offlinePending: true } : a);
          this.afterDataChange();
          return;
        }
        this.toast.success('انتساب لغو شد.');
        this.loadAssignments();
      },
      error: err => this.toast.error(this.extractApiErrorMessage(err, 'خطا در لغو انتساب'))
    });
  }

  // ─── کپی ساختار انتساب از بخش دیگر ───
  openCloneModal(target: OrgProjectSection): void {
    if (!this.canWrite) return;
    this.cloneModal = { isOpen: true, targetSection: target, sourceProjectId: null, sourceSectionId: null, isSubmitting: false };
    this.cdr.markForCheck();
  }

  closeCloneModal(): void {
    this.cloneModal = { isOpen: false, targetSection: null, sourceProjectId: null, sourceSectionId: null, isSubmitting: false };
    this.cdr.markForCheck();
  }

  onCloneSourceProjectChange(projectId: number | null): void {
    this.cloneModal.sourceProjectId = projectId ? Number(projectId) : null;
    this.cloneModal.sourceSectionId = null;
  }

  executeClone(): void {
    const targetId = this.cloneModal.targetSection?.id;
    const sourceId = this.cloneModal.sourceSectionId;
    if (!targetId || !sourceId) {
      this.toast.warning('لطفاً بخش مبدأ را انتخاب کنید.');
      return;
    }
    this.cloneModal.isSubmitting = true;
    this.api.cloneSectionAssignments(targetId, Number(sourceId)).subscribe({
      next: res => {
        this.expandedSectionIds.add(targetId);
        this.closeCloneModal();
        if (CompanyProjectsTabComponent.isQueued(res)) {
          // نتیجهٔ کپی را فقط سرور می‌سازد؛ پس از ارسال صف، دریافت آنلاین بعدی آن را نشان می‌دهد
          this.queuedToast();
          return;
        }
        this.toast.success(res?.message || 'ساختار انتساب کپی شد.');
        this.loadAssignments();
      },
      error: err => {
        this.cloneModal.isSubmitting = false;
        this.toast.error(this.extractApiErrorMessage(err, 'خطا در کپی ساختار انتساب'));
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * پاسخ خوش‌بینانهٔ صف آفلاین (اینترسپتور): هنوز به سرور نرسیده است. در این حالت کش هرگز ابطال نمی‌شود؛
   * فقط نمای محلی وصله می‌شود و دریافت آنلاین بعدی، کش را با دادهٔ سرور جایگزین می‌کند.
   */
  static isQueued(res: unknown): boolean {
    const r = res as { _offlinePending?: boolean; id?: unknown } | null;
    return !!r && typeof r === 'object' && (r._offlinePending === true || (typeof r.id === 'number' && r.id < 0));
  }

  private queuedToast(): void {
    this.toast.info('اتصال برقرار نیست؛ تغییر در صف ارسال ماند و پس از اتصال فرستاده می‌شود.');
  }

  extractApiErrorMessage(err: any, fallback: string): string {
    if (isServerUnreachable(err?.status)) return `${fallback}: سرور در دسترس نیست.`;
    const body = err?.error;
    if (!body) return fallback;
    if (typeof body === 'string') return body;
    for (const k of ['error', 'message', 'detail']) {
      if (typeof body[k] === 'string') return body[k];
    }
    if (typeof body === 'object') {
      const messages = Object.entries(body)
        .filter(([k]) => k !== 'success' && k !== 'status')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('، ') : String(v)}`);
      if (messages.length > 0) return messages.join(' | ');
    }
    return fallback;
  }
}
