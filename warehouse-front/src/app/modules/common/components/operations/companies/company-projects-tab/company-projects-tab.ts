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
import { OrgProject, OrgProjectSection, OrgSectionAssignment } from '../../../../../../core/models/company.model';
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

export interface SectionRoleGroup {
  role: SectionRoleSpec;
  assignments: OrgSectionAssignment[];
}

export interface SectionGroupedAssignments {
  section: OrgProjectSection;
  roles: SectionRoleGroup[];
  totalAssignedUsers: number;
  /** نقش‌هایی که هشدار «فاقد …» دارند و انتساب فعالی ندارند */
  missingWarnings: string[];
}

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

  quickAssign: {
    isOpen: boolean;
    section: OrgProjectSection | null;
    role: SectionRoleSpec | null;
    selectedUserIds: number[];
    userSearchQuery: string;
    isSubmitting: boolean;
  } = { isOpen: false, section: null, role: null, selectedUserIds: [], userSearchQuery: '', isSubmitting: false };

  editAssignment: {
    isOpen: boolean;
    assignment: OrgSectionAssignment | null;
    role: string;
    is_active: boolean;
    isSubmitting: boolean;
  } = { isOpen: false, assignment: null, role: '', is_active: true, isSubmitting: false };

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
        { id: 'sections', label: 'بخش‌ها و دپارتمان‌ها', shortLabel: 'بخش‌ها', icon: this.icons.sections, count: this.sections.length }
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
    this.accountsHttp.getUsers().subscribe({
      next: users => {
        this.systemUsers = Array.isArray(users) ? users : [];
        this.invalidateAssignmentsCache();
        this.cdr.markForCheck();
      },
      error: err => {
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
      list = list.filter(a => {
        if (a.project_id) return Number(a.project_id) === pFilter;
        const sec = this.sections.find(s => s.id === CompanyProjectsTabComponent.sectionIdOf(a));
        return sec ? Number(sec.project) === pFilter : false;
      });
    }
    if (this.assignmentRoleFilter !== 'all') list = list.filter(a => a.role === this.assignmentRoleFilter);
    const q = this.assignmentSearchQuery.trim().toLowerCase();
    if (q) list = list.filter(a => this.matchesAssignmentQuery(a, q));
    this._cachedFiltered = list;
    return list;
  }

  get groupedAssignmentsBySection(): SectionGroupedAssignments[] {
    if (this._cachedGrouped) return this._cachedGrouped;
    let sections = this.sections;
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    if (pFilter) sections = sections.filter(s => Number(s.project) === pFilter);
    const q = this.assignmentSearchQuery.trim().toLowerCase();
    const result: SectionGroupedAssignments[] = [];
    for (const sec of sections) {
      const secAssignments = this.assignments.filter(a =>
        CompanyProjectsTabComponent.sectionIdOf(a) === Number(sec.id) && a.is_active !== false);
      if (q) {
        const matchesSection = sec.name?.toLowerCase().includes(q) || sec.code?.toLowerCase().includes(q)
          || sec.project_name?.toLowerCase().includes(q);
        if (!matchesSection && !secAssignments.some(a => this.matchesAssignmentQuery(a, q))) continue;
      }
      let roles = this.roles.map(role => ({ role, assignments: secAssignments.filter(a => a.role === role.key) }));
      const missingWarnings = roles.filter(r => r.role.missingWarningFa && r.assignments.length === 0).map(r => r.role.missingWarningFa!);
      if (this.assignmentRoleFilter !== 'all') roles = roles.filter(r => r.role.key === this.assignmentRoleFilter);
      result.push({ section: sec, roles, totalAssignedUsers: secAssignments.length, missingWarnings });
    }
    this._cachedGrouped = result;
    return result;
  }

  get availableUsersForQuickAssign(): User[] {
    const section = this.quickAssign.section;
    const roleKey = this.quickAssign.role?.key;
    if (!section || !roleKey) return [];
    const q = this.quickAssign.userSearchQuery.trim().toLowerCase();
    const key = `${section.id}_${roleKey}_${q}_${this.assignments.length}_${this.systemUsers.length}`;
    if (this._cachedAvailableUsers && this._availableUsersKey === key) return this._cachedAvailableUsers;
    const existing = new Set(this.assignments
      .filter(a => CompanyProjectsTabComponent.sectionIdOf(a) === Number(section.id) && a.role === roleKey && a.is_active !== false)
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

  sectionAssignmentCount(sectionId: number | undefined): number {
    return this.assignments.filter(a => CompanyProjectsTabComponent.sectionIdOf(a) === Number(sectionId) && a.is_active !== false).length;
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
    const list = this.assignments.filter(a => CompanyProjectsTabComponent.sectionIdOf(a) === Number(sourceId) && a.is_active !== false);
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
          this.assignments = this.assignments.filter(a => !sectionIds.has(CompanyProjectsTabComponent.sectionIdOf(a)));
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
          this.assignments = this.assignments.filter(a => CompanyProjectsTabComponent.sectionIdOf(a) !== id);
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

  toggleSectionCollapse(sectionId: number | undefined): void {
    if (!sectionId) return;
    if (this.expandedSectionIds.has(sectionId)) this.expandedSectionIds.delete(sectionId);
    else this.expandedSectionIds.add(sectionId);
    this.cdr.markForCheck();
  }

  expandAllSections(): void {
    this.expandedSectionIds = new Set(this.sections.map(s => s.id).filter((id): id is number => typeof id === 'number'));
    this.cdr.markForCheck();
  }

  collapseAllSections(): void {
    this.expandedSectionIds = new Set();
    this.cdr.markForCheck();
  }

  openQuickAssign(section: OrgProjectSection, role: SectionRoleSpec): void {
    if (!this.canWrite) return;
    this.quickAssign = { isOpen: true, section, role, selectedUserIds: [], userSearchQuery: '', isSubmitting: false };
    this._cachedAvailableUsers = null;
    this.cdr.markForCheck();
  }

  closeQuickAssign(): void {
    this.quickAssign = { isOpen: false, section: null, role: null, selectedUserIds: [], userSearchQuery: '', isSubmitting: false };
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

  submitQuickAssign(): void {
    const { section, role, selectedUserIds } = this.quickAssign;
    if (!section?.id || !role || selectedUserIds.length === 0) {
      this.toast.warning('لطفاً دست‌کم یک کاربر را برای انتساب انتخاب کنید.');
      return;
    }
    this.quickAssign.isSubmitting = true;
    this.api.bulkAssign({ section_id: section.id, user_ids: [...selectedUserIds], role: role.key }).subscribe({
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
              section: section.id!, section_name: section.name, project_name: section.project_name, role: role.key, is_active: true, _offlinePending: true
            };
          });
          this.assignments = [...pending, ...this.assignments];
          this.closeQuickAssign();
          this.afterDataChange();
          return;
        }
        const list = Array.isArray(created) ? created : [];
        this.toast.success(`${this.fa(list.length)} کاربر به‌عنوان «${role.shortLabelFa}» در بخش «${section.name}» منتسب شدند.`);
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

  openEditAssignment(assignment: OrgSectionAssignment): void {
    if (!this.canWrite) return;
    this.editAssignment = { isOpen: true, assignment, role: assignment.role, is_active: assignment.is_active !== false, isSubmitting: false };
    this.cdr.markForCheck();
  }

  closeEditAssignment(): void {
    this.editAssignment = { isOpen: false, assignment: null, role: '', is_active: true, isSubmitting: false };
    this.cdr.markForCheck();
  }

  submitEditAssignment(): void {
    const id = this.editAssignment.assignment?.id;
    if (!id) return;
    this.editAssignment.isSubmitting = true;
    const patch = { role: this.editAssignment.role, is_active: this.editAssignment.is_active };
    this.api.updateAssignment(id, patch).subscribe({
      next: updated => {
        const queued = CompanyProjectsTabComponent.isQueued(updated);
        if (queued) this.queuedToast();
        else this.toast.success('انتساب ویرایش شد.');
        this.assignments = this.assignments.map(a => a.id === id ? (queued ? { ...a, ...patch, _offlinePending: true } : { ...a, ...updated }) : a);
        this.closeEditAssignment();
        this.afterDataChange();
      },
      error: err => {
        this.editAssignment.isSubmitting = false;
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
    const ok = await this.confirm('لغو انتساب', `آیا از لغو انتساب «${who}» به این بخش اطمینان دارید؟`, 'لغو انتساب');
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
