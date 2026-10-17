import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { hasStructureWritePermission } from '../../../../../core/auth/auth.guard';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { AccountsHttpService, User, ImportResult } from '../../../../../core/http/accounts-http.service';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { ExcelImportModal } from '../../../../../shared/components/excel-import-modal/excel-import-modal';
import { ActiveCompanyService } from '../../../../../core/services/active-company.service';
import {
  FinancialProject,
  ProjectSection,
  UserSectionAssignment
} from '../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { CommandCenterComponent } from '../../../../../shared/components/command-center/command-center.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { PLATFORM_ENTITY_ICONS } from '../../../../../shared/icons/semantic-icons';
import { saveBlob } from '../../../../../core/platform/file-output';

export interface RoleDefinition {
  key: 'manager' | 'accountant' | 'supervisor' | 'treasury' | 'employee';
  label: string;
  shortLabel: string;
  badgeClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  icon: string;
  description: string;
}

export interface SectionGroupedAssignments {
  section: ProjectSection;
  roles: {
    roleDef: RoleDefinition;
    assignments: UserSectionAssignment[];
  }[];
  totalAssignedUsers: number;
}

@Component({
  selector: 'app-projects-and-sections',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ExcelImportModal,
    SvgIconDirective,
    TabBarComponent,
    ActionButtonComponent,
    CommandCenterComponent
  ],
  templateUrl: './projects-and-sections.html',
  styleUrl: './projects-and-sections.css'
})
export class ProjectsAndSectionsComponent implements OnInit, OnDestroy {
  activeSubTab: 'projects' | 'sections' | 'assignments' = 'projects';

  readonly assignmentViewTabs: TabDef[] = [
    { id: 'matrix', label: 'ماتریس', shortLabel: 'ماتریس' },
    { id: 'table', label: 'جدول', shortLabel: 'جدول' }
  ];

  private mainTabsCacheKey = '';
  private mainTabsCache: TabDef[] = [];
  get mainTabs(): TabDef[] {
    const key = `${this.financialProjects.length}:${this.projectSections.length}:${this.userAssignments.length}`;
    if (key !== this.mainTabsCacheKey) {
      this.mainTabsCacheKey = key;
      this.mainTabsCache = [
        {
          id: 'projects',
          label: 'پروژه‌های مالی',
          shortLabel: 'پروژه‌ها',
          icon: ACCOUNTING_ENTITY_ICONS.projectsAndSections,
          count: this.financialProjects.length
        },
        {
          id: 'sections',
          label: 'بخش‌ها و دپارتمان‌ها',
          shortLabel: 'بخش‌ها',
          icon: ACCOUNTING_ENTITY_ICONS.sections,
          count: this.projectSections.length
        },
        {
          id: 'assignments',
          label: 'انتساب کاربران و نقش‌ها',
          shortLabel: 'انتساب‌ها',
          icon: PLATFORM_ENTITY_ICONS.users,
          count: this.userAssignments.length
        }
      ];
    }
    return this.mainTabsCache;
  }

  financialProjects: FinancialProject[] = [];
  projectSections: ProjectSection[] = [];
  userAssignments: UserSectionAssignment[] = [];
  systemUsers: User[] = [];
  selectedProjectId: number | null = null;
  isLoading = false;

  // وضعیت کارت‌های جمع‌شونده (Collapsible Cards - پیش‌فرض: همه بسته)
  expandedSectionIds: Set<number> = new Set<number>();

  // وضعیت مدال تکثیر و کپی ساختار پرسنلی (Clone Assignments)
  cloneModal: {
    isOpen: boolean;
    targetSection: ProjectSection | null;
    sourceProjectId: number | null;
    sourceSectionId: number | null;
    isSubmitting: boolean;
    availableSourceSections: (ProjectSection & { assignmentCount: number })[];
    sourceStats: { total: number; roleCounts: { [key: string]: number } };
  } = {
    isOpen: false,
    targetSection: null,
    sourceProjectId: null,
    sourceSectionId: null,
    isSubmitting: false,
    availableSourceSections: [],
    sourceStats: { total: 0, roleCounts: {} }
  };

  // مدال تایید اختصاصی (جایگزین کامل confirm مرورگر)
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDanger: boolean;
    onConfirm: () => void;
  } = {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'تایید و حذف',
    cancelText: 'انصراف',
    isDanger: true,
    onConfirm: () => {}
  };

  // فیلترهای جستجوی سریع درجا برای جداول
  projectSearchQuery: string = '';
  sectionSearchQuery: string = '';
  assignmentSearchQuery: string = '';
  assignmentProjectFilter: number | null = null;
  assignmentRoleFilter: string = 'all';
  assignmentViewMode: 'matrix' | 'table' = 'matrix';

  // تعاریف نقش‌های ۵ گانه سازمانی
  readonly roleDefinitions: RoleDefinition[] = [
    {
      key: 'manager',
      label: 'مدیران پروژه / شرکت (تایید نهایی)',
      shortLabel: 'مدیران',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
      bgClass: 'bg-purple-50/50',
      borderClass: 'border-purple-200',
      textClass: 'text-purple-900',
      icon: '👑',
      description: 'تایید هر یک از مدیران، گردش‌کار و اسناد را مستقیماً به مرحله بعد منتقل می‌کند.'
    },
    {
      key: 'accountant',
      label: 'حسابداران پروژه (بررسی و تایید مالی)',
      shortLabel: 'حسابداران',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      bgClass: 'bg-amber-50/50',
      borderClass: 'border-amber-200',
      textClass: 'text-amber-900',
      icon: '💼',
      description: 'بررسی هزینه‌ها و تطبیق صورت‌حساب‌ها.'
    },
    {
      key: 'supervisor',
      label: 'سرپرستان بخش (بررسی عملیاتی)',
      shortLabel: 'سرپرستان',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
      bgClass: 'bg-blue-50/50',
      borderClass: 'border-blue-200',
      textClass: 'text-blue-900',
      icon: '🛡️',
      description: 'نظارت عملیاتی بر ترددها، کارکرد پرسنل و ناوگان.'
    },
    {
      key: 'treasury',
      label: 'خزانه‌داران کل (پرداخت و تسویه)',
      shortLabel: 'خزانه‌داران',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      bgClass: 'bg-emerald-50/50',
      borderClass: 'border-emerald-200',
      textClass: 'text-emerald-900',
      icon: '💰',
      description: 'صدور حواله پرداخت و تسویه ریالی فاکتورها.'
    },
    {
      key: 'employee',
      label: 'کارمندان و اپراتورها (ثبت‌کنندگان)',
      shortLabel: 'کارمندان',
      badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
      bgClass: 'bg-slate-50/70',
      borderClass: 'border-slate-200',
      textClass: 'text-slate-900',
      icon: '📝',
      description: 'ثبت اطلاعات خام، کارکرد و پیش‌نویس اسناد.'
    }
  ];

  // وضعیت مدال انتساب سریع درجا (پشتیبانی از انتخاب همزمان چند کاربر)
  quickAssignState: {
    isOpen: boolean;
    section: ProjectSection | null;
    role: 'employee' | 'supervisor' | 'accountant' | 'manager' | 'treasury';
    roleDef: RoleDefinition | null;
    selectedUserIds: number[];
    userSearchQuery: string;
    isSubmitting: boolean;
  } = {
    isOpen: false,
    section: null,
    role: 'employee',
    roleDef: null,
    selectedUserIds: [],
    userSearchQuery: '',
    isSubmitting: false
  };

  // وضعیت و توابع مدال اکسل
  isExcelModalOpen = false;
  excelModalTitle = 'آپلود فایل اکسل';
  excelImportFn!: (file: File, updateExisting: boolean) => any;
  excelTemplateFn!: () => void;

  // مدل‌های فرم
  newProject: Partial<FinancialProject> = { code: '', name: '', description: '', is_active: true };
  editingProject: FinancialProject | null = null;

  newSection: {
    id?: number;
    project: number | null;
    code: string;
    name: string;
    is_active: boolean;
  } = { project: null, code: '', name: '', is_active: true };
  editingSection: ProjectSection | null = null;

  editAssignmentModal: {
    isOpen: boolean;
    assignment: UserSectionAssignment | null;
    role: 'employee' | 'supervisor' | 'accountant' | 'manager' | 'treasury';
    is_active: boolean;
    isSubmitting: boolean;
  } = {
    isOpen: false,
    assignment: null,
    role: 'employee',
    is_active: true,
    isSubmitting: false
  };

  private subs: Subscription[] = [];
  private offlineSync = OfflineSyncService.getInstance();

  constructor(
    public auth: AuthService,
    public state: StateService,
    private api: PersonnelApiService,
    private accountsHttp: AccountsHttpService,
    private ws: WebSocketService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Optional() public activeCompanyService?: ActiveCompanyService
  ) {}

  ngOnInit(): void {
    this.ws.connect();
    this.setupRealtimeListeners();
    this.setupRouteQuerySync();
    this.loadCollapsedSectionsState();

    // همگام‌سازی فهرست پروژه‌ها، بخش‌ها و انتساب‌ها با تغییر شرکت فعال
    if (this.activeCompanyService?.activeCompany$) {
      this.subs.push(
        this.activeCompanyService.activeCompany$.subscribe(() => {
          this.loadProjects();
          this.loadSections();
          this.loadAssignments(true);
        })
      );
    }

    this.loadAllData();
  }

  private setupRouteQuerySync(): void {
    this.subs.push(
      this.route.queryParams.subscribe(params => {
        if (params['tab']) {
          const tab = params['tab'] as any;
          if (['projects', 'sections', 'assignments'].includes(tab)) {
            this.activeSubTab = tab;
          }
        }

        const q = params['q'] || '';

        if (this.activeSubTab === 'projects') {
          this.projectSearchQuery = q;
        } else if (this.activeSubTab === 'sections') {
          this.sectionSearchQuery = q;
          if (params['project_id'] !== undefined) {
            const pId = Number(params['project_id']);
            this.selectedProjectId = (!isNaN(pId) && pId > 0) ? pId : null;
            if (this.selectedProjectId && !this.newSection.project) {
              this.newSection.project = this.selectedProjectId;
            }
          }
        } else if (this.activeSubTab === 'assignments') {
          this.assignmentSearchQuery = q;
          let filterChanged = false;
          if (params['project_id'] !== undefined) {
            const pId = Number(params['project_id']);
            const newPid = (!isNaN(pId) && pId > 0) ? pId : null;
            if (this.assignmentProjectFilter !== newPid) {
              this.assignmentProjectFilter = newPid;
              filterChanged = true;
            }
          } else if (this.assignmentProjectFilter !== null) {
            this.assignmentProjectFilter = null;
            filterChanged = true;
          }
          if (params['role'] !== undefined) {
            const newRole = params['role'] || 'all';
            if (this.assignmentRoleFilter !== newRole) {
              this.assignmentRoleFilter = newRole;
              filterChanged = true;
            }
          } else if (this.assignmentRoleFilter !== 'all') {
            this.assignmentRoleFilter = 'all';
            filterChanged = true;
          }
          if (params['view'] !== undefined) {
            this.assignmentViewMode = params['view'] === 'table' ? 'table' : 'matrix';
          }
          if (filterChanged) {
            this.loadAssignments();
          }
        }

        this.cdr.detectChanges();
      })
    );
  }

  updateQueryParams(params: Record<string, any>): void {
    this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  switchSubTab(tab: string): void {
    if (tab !== 'projects' && tab !== 'sections' && tab !== 'assignments') {
      return;
    }
    this.activeSubTab = tab;
    const queryParams: any = { tab };
    if (tab === 'projects') {
      queryParams['project_id'] = null;
      queryParams['role'] = null;
      queryParams['view'] = null;
      queryParams['q'] = this.projectSearchQuery || null;
    } else if (tab === 'sections') {
      queryParams['project_id'] = this.selectedProjectId || null;
      queryParams['role'] = null;
      queryParams['view'] = null;
      queryParams['q'] = this.sectionSearchQuery || null;
    } else if (tab === 'assignments') {
      queryParams['project_id'] = this.assignmentProjectFilter || null;
      queryParams['role'] = this.assignmentRoleFilter !== 'all' ? this.assignmentRoleFilter : null;
      queryParams['view'] = this.assignmentViewMode === 'table' ? 'table' : null;
      queryParams['q'] = this.assignmentSearchQuery || null;
      this.loadAssignments();
    }
    this.router.navigate([], { queryParams, replaceUrl: false });
    this.cdr.detectChanges();
  }

  onProjectSelectChange(projectId: any): void {
    const pId = projectId ? Number(projectId) : null;
    this.selectedProjectId = pId;
    if (pId) {
      this.newSection.project = pId;
    }
    this.updateQueryParams({ project_id: pId || null });
    this.cdr.detectChanges();
  }

  onAssignmentProjectFilterChange(projectId: any): void {
    const pId = projectId ? Number(projectId) : null;
    this.assignmentProjectFilter = pId;
    this.invalidateAssignmentsCache();
    this.updateQueryParams({ project_id: pId || null });
    this.loadAssignments();
    this.cdr.detectChanges();
  }

  onAssignmentRoleFilterChange(role: string): void {
    this.assignmentRoleFilter = role || 'all';
    this.invalidateAssignmentsCache();
    this.updateQueryParams({ role: role !== 'all' ? role : null });
    this.loadAssignments();
    this.cdr.detectChanges();
  }

  onAssignmentViewModeChange(mode: string): void {
    if (mode !== 'matrix' && mode !== 'table') {
      return;
    }
    this.assignmentViewMode = mode;
    this.updateQueryParams({ view: mode === 'table' ? 'table' : null });
    this.cdr.detectChanges();
  }

  onSearchQueryChange(tab: 'projects' | 'sections' | 'assignments', query: string): void {
    const q = query?.trim() || null;
    if (tab === 'projects') this.projectSearchQuery = query;
    else if (tab === 'sections') this.sectionSearchQuery = query;
    else if (tab === 'assignments') {
      this.assignmentSearchQuery = query;
      this.invalidateAssignmentsCache();
    }
    this.updateQueryParams({ q });
    this.cdr.detectChanges();
  }

  onSectionParentProjectChange(projectId: any): void {
    const pId = projectId ? Number(projectId) : null;
    this.newSection.project = pId;
    if (pId && !this.selectedProjectId) {
      this.selectedProjectId = pId;
      this.loadSections();
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private setupRealtimeListeners(): void {
    // ۱. شنود وب‌سوکت سراسری جهت همگام‌سازی بلادرنگ رویدادها بین تب‌ها و کاربران
    this.subs.push(
      this.ws.notifications$.subscribe(msg => {
        if (msg?.type_str === 'org_structure_updated') {
          // فیلتر اکو: اگر مبدا رویداد همین تب بوده است، دوباره رفرش نکن چون به صورت محلی فوراً اعمال شده
          if (msg.client_tab_id && msg.client_tab_id === this.ws.tabId) {
            return;
          }
          if (msg.entity_type === 'project') {
            this.loadProjects();
          } else if (msg.entity_type === 'section') {
            this.loadSections();
          } else if (msg.entity_type === 'assignment') {
            this.loadAssignments(true);
          }
        }
      })
    );

    // ۲. شنود تغییرات زنده کش و صف آفلاین SWR
    this.subs.push(
      this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
        if (!url) return;
        if (url.includes('/financial-projects/')) {
          if (Array.isArray(data)) {
            this.financialProjects = data;
            this.cdr.detectChanges();
          }
        } else if (url.includes('/project-sections/')) {
          if (Array.isArray(data)) {
            this.projectSections = data;
            this.cdr.detectChanges();
          }
        } else if (url.includes('/user-section-assignments/')) {
          if (Array.isArray(data)) {
            this.userAssignments = data;
            this.cdr.detectChanges();
          }
        }
      })
    );
  }

  // --- بارگذاری داده‌ها ---
  loadAllData(): void {
    this.isLoading = true;
    this.loadProjects();
    this.loadAssignments();
    this.loadUsers();
  }

  loadProjects(): void {
    this.api.getFinancialProjects().subscribe({
      next: (projects) => {
        this.financialProjects = projects;
        const qpId = this.route.snapshot.queryParams['project_id'];
        const numId = qpId ? Number(qpId) : null;
        if (this.activeSubTab === 'assignments') {
          if (numId && projects.some(p => p.id === numId)) {
            this.assignmentProjectFilter = numId;
          }
        } else if (this.activeSubTab === 'sections') {
          if (numId && projects.some(p => p.id === numId)) {
            this.selectedProjectId = numId;
          } else if (!this.selectedProjectId && projects.length > 0) {
            this.selectedProjectId = projects[0].id!;
          }
          if (!this.newSection.project && this.selectedProjectId) {
            this.newSection.project = this.selectedProjectId;
          }
        } else {
          if (numId && projects.some(p => p.id === numId)) {
            this.selectedProjectId = numId;
          } else if (!this.selectedProjectId && projects.length > 0) {
            this.selectedProjectId = projects[0].id!;
          }
        }
        this.loadSections();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.toast.show('error', 'خطا در دریافت لیست پروژه‌ها');
        this.cdr.detectChanges();
      }
    });
  }

  // --- ابزارهای کمکی و فیلترهای جستجو ---

  get filteredProjects(): FinancialProject[] {
    if (!this.projectSearchQuery?.trim()) return this.financialProjects;
    const q = this.projectSearchQuery.trim().toLowerCase();
    return this.financialProjects.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  get filteredSections(): ProjectSection[] {
    let list = this.projectSections;
    if (this.selectedProjectId) {
      list = list.filter(s => s.project === this.selectedProjectId);
    }
    if (!this.sectionSearchQuery?.trim()) return list;
    const q = this.sectionSearchQuery.trim().toLowerCase();
    return list.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.project_name && s.project_name.toLowerCase().includes(q))
    );
  }

  // --- حافظه کش محلی و متدهای بهینه‌سازی عملکرد (DOM Optimization & TrackBy) ---
  private _cachedGroupedAssignments: SectionGroupedAssignments[] | null = null;
  private _cachedFilteredAssignments: UserSectionAssignment[] | null = null;
  private _cachedAvailableUsers: User[] | null = null;
  private _lastQuickAssignStateKey: string = '';

  invalidateAssignmentsCache(): void {
    this._cachedGroupedAssignments = null;
    this._cachedFilteredAssignments = null;
    this._cachedAvailableUsers = null;
    this._lastQuickAssignStateKey = '';
  }

  trackBySectionId(index: number, group: SectionGroupedAssignments | ProjectSection): number | string {
    const sec = 'section' in group ? group.section : group;
    return sec.id || index;
  }

  trackByRoleKey(index: number, r: any): string {
    return r.roleDef.key;
  }

  trackByAssignmentId(index: number, a: UserSectionAssignment): number {
    return a.id || index;
  }

  trackByUserId(index: number, u: User): number {
    return u.id;
  }

  get filteredAssignments(): UserSectionAssignment[] {
    if (this._cachedFilteredAssignments) {
      return this._cachedFilteredAssignments;
    }
    let list = this.userAssignments;
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    if (pFilter) {
      list = list.filter(a => {
        if (a.project_id) return Number(a.project_id) === pFilter;
        const sec = this.projectSections.find(s => s.id === a.section);
        return sec ? Number(sec.project) === pFilter : false;
      });
    }
    if (this.assignmentRoleFilter && this.assignmentRoleFilter !== 'all') {
      list = list.filter(a => a.role === this.assignmentRoleFilter);
    }
    if (this.assignmentSearchQuery?.trim()) {
      const q = this.assignmentSearchQuery.trim().toLowerCase();
      list = list.filter(a =>
        (a.user_full_name && a.user_full_name.toLowerCase().includes(q)) ||
        (a.username && a.username.toLowerCase().includes(q)) ||
        (a.section_name && a.section_name.toLowerCase().includes(q)) ||
        (a.project_name && a.project_name.toLowerCase().includes(q)) ||
        (a.role_display && a.role_display.toLowerCase().includes(q))
      );
    }
    this._cachedFilteredAssignments = list;
    return list;
  }

  get groupedAssignmentsBySection(): SectionGroupedAssignments[] {
    if (this._cachedGroupedAssignments) {
      return this._cachedGroupedAssignments;
    }
    let sections = [...this.projectSections];
    const pFilter = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : null;
    if (pFilter) {
      sections = sections.filter(s => Number(s.project) === pFilter);
    }

    const query = this.assignmentSearchQuery?.trim().toLowerCase();
    const result: SectionGroupedAssignments[] = [];

    for (const sec of sections) {
      const secAssignments = this.userAssignments.filter(a => {
        const secId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
        return Number(secId) === Number(sec.id) && a.is_active !== false;
      });

      let rolesData = this.roleDefinitions.map(roleDef => {
        const assigned = secAssignments.filter(a => a.role === roleDef.key);
        return {
          roleDef,
          assignments: assigned
        };
      });

      if (this.assignmentRoleFilter && this.assignmentRoleFilter !== 'all') {
        rolesData = rolesData.filter(r => r.roleDef.key === this.assignmentRoleFilter);
      }

      if (query) {
        const matchesSection = (sec.name && sec.name.toLowerCase().includes(query)) ||
                               (sec.code && sec.code.toLowerCase().includes(query)) ||
                               (sec.project_name && sec.project_name.toLowerCase().includes(query));
        const hasMatchingUser = secAssignments.some(a =>
          (a.user_full_name && a.user_full_name.toLowerCase().includes(query)) ||
          (a.username && a.username.toLowerCase().includes(query)) ||
          (a.role_display && a.role_display.toLowerCase().includes(query))
        );
        if (!matchesSection && !hasMatchingUser) {
          continue;
        }
      }

      result.push({
        section: sec,
        roles: rolesData,
        totalAssignedUsers: secAssignments.length
      });
    }

    this._cachedGroupedAssignments = result;
    return result;
  }

  get availableUsersForQuickAssign(): User[] {
    if (!this.quickAssignState.section) return this.systemUsers;
    const currentSectionId = Number(this.quickAssignState.section.id);
    const currentRole = this.quickAssignState.role;
    const q = this.quickAssignState.userSearchQuery?.trim().toLowerCase() || '';
    const currentKey = `${currentSectionId}_${currentRole}_${q}_${this.userAssignments.length}_${this.systemUsers.length}`;

    if (this._cachedAvailableUsers && this._lastQuickAssignStateKey === currentKey) {
      return this._cachedAvailableUsers;
    }

    const existingUserIds = new Set(
      this.userAssignments
        .filter(a => {
          const secId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
          return Number(secId) === currentSectionId && a.role === currentRole && a.is_active !== false;
        })
        .map(a => Number(typeof a.user === 'object' ? (a.user as any)?.id : a.user))
    );
    let users = this.systemUsers.filter(u => u.is_active !== false && !existingUserIds.has(Number(u.id)));
    if (q) {
      users = users.filter(u =>
        (u.first_name && u.first_name.toLowerCase().includes(q)) ||
        (u.last_name && u.last_name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q))
      );
    }
    this._cachedAvailableUsers = users;
    this._lastQuickAssignStateKey = currentKey;
    return users;
  }

  // --- ورودی و خروجی اکسل ---
  private triggerDownloadBlob(blob: Blob, filename: string): void {
    void saveBlob(blob, filename);
  }

  exportExcel(): void {
    this.isLoading = true;
    if (this.activeSubTab === 'projects') {
      this.api.exportFinancialProjectsExcel().subscribe({
        next: (blob) => {
          this.triggerDownloadBlob(blob, 'financial_projects.xlsx');
          this.toast.show('success', 'فایل اکسل پروژه‌های مالی با موفقیت دانلود شد.');
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.toast.show('error', 'خطا در دانلود فایل اکسل پروژه‌ها');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else if (this.activeSubTab === 'sections') {
      this.api.exportProjectSectionsExcel(this.selectedProjectId || undefined).subscribe({
        next: (blob) => {
          this.triggerDownloadBlob(blob, 'project_sections.xlsx');
          this.toast.show('success', 'فایل اکسل بخش‌های پروژه با موفقیت دانلود شد.');
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.toast.show('error', 'خطا در دانلود فایل اکسل بخش‌ها');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else if (this.activeSubTab === 'assignments') {
      this.api.exportUserSectionAssignmentsExcel(this.assignmentProjectFilter || undefined, this.assignmentRoleFilter).subscribe({
        next: (blob) => {
          this.triggerDownloadBlob(blob, 'user_assignments.xlsx');
          this.toast.show('success', 'فایل اکسل انتساب پرسنل و نقش‌ها با موفقیت دانلود شد.');
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.toast.show('error', 'خطا در دانلود فایل اکسل انتساب پرسنل');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.api.exportFinancialProjectsExcel().subscribe({
        next: (blob) => {
          this.triggerDownloadBlob(blob, 'organization_structure.xlsx');
          this.toast.show('success', 'فایل اکسل ساختار سازمانی دانلود شد.');
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.toast.show('error', 'خطا در دانلود فایل اکسل');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  getExportTooltip(): string {
    switch (this.activeSubTab) {
      case 'projects': return 'خروجی اکسل پروژه‌های مالی';
      case 'sections': return 'خروجی اکسل بخش‌ها و دپارتمان‌ها';
      case 'assignments': return 'خروجی اکسل ماتریس انتساب کاربران و نقش‌ها';
      default: return 'خروجی فایل اکسل';
    }
  }

  /** درون‌ریزی اکسل برای نویسندگان ساختار (از جمله راهبر تشکیلات)؛ بک‌اند آن را به شرکت فعالِ مجاز محدود می‌کند. */
  get canImportExcel(): boolean {
    const user = this.auth.user();
    const perms = this.auth.userPermissions() || [];
    return hasStructureWritePermission(perms, !!user?.is_superuser || !!user?.roles?.includes('admin'))
      || perms.includes('perm_manage_projects_sections');
  }

  getImportTooltip(): string {
    switch (this.activeSubTab) {
      case 'projects': return 'ورودی و ثبت پروژه‌ها از فایل اکسل';
      case 'sections': return 'ورودی و ثبت بخش‌ها از فایل اکسل';
      case 'assignments': return 'ورودی و ثبت انتساب پرسنل از فایل اکسل';
      default: return 'ورودی فایل اکسل';
    }
  }

  openImportModal(): void {
    if (this.activeSubTab === 'projects') {
      this.excelModalTitle = 'آپلود و ثبت دسته‌جمعی پروژه‌ها از اکسل';
      this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => this.api.importFinancialProjectsExcel(file, dryRun);
      this.excelTemplateFn = () => this.downloadProjectsTemplate();
    } else if (this.activeSubTab === 'sections') {
      this.excelModalTitle = 'آپلود و ثبت دسته‌جمعی بخش‌های پروژه از اکسل';
      this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => this.api.importProjectSectionsExcel(file, dryRun);
      this.excelTemplateFn = () => this.downloadSectionsTemplate();
    } else {
      this.excelModalTitle = 'آپلود و ثبت دسته‌جمعی انتساب پرسنل و نقش‌ها از اکسل';
      this.excelImportFn = (file: File, updateExisting: boolean, dryRun?: boolean) => this.api.importUserSectionAssignmentsExcel(file, dryRun);
      this.excelTemplateFn = () => this.downloadAssignmentsTemplate();
    }
    this.isExcelModalOpen = true;
    this.cdr.detectChanges();
  }

  downloadProjectsTemplate(): void {
    this.api.downloadFinancialProjectsTemplate().subscribe({
      next: (blob) => {
        this.triggerDownloadBlob(blob, 'projects_template.xlsx');
        this.toast.show('success', 'قالب اکسل پروژه‌ها با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل پروژه‌ها')
    });
  }

  downloadSectionsTemplate(): void {
    this.api.downloadProjectSectionsTemplate().subscribe({
      next: (blob) => {
        this.triggerDownloadBlob(blob, 'sections_template.xlsx');
        this.toast.show('success', 'قالب اکسل بخش‌ها با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل بخش‌ها')
    });
  }

  downloadAssignmentsTemplate(): void {
    this.api.downloadUserSectionAssignmentsTemplate().subscribe({
      next: (blob) => {
        this.triggerDownloadBlob(blob, 'assignments_template.xlsx');
        this.toast.show('success', 'قالب اکسل انتساب پرسنل با موفقیت دانلود شد.');
      },
      error: () => this.toast.show('error', 'خطا در دریافت قالب اکسل انتساب پرسنل')
    });
  }

  onExcelImported(result: any): void {
    if (result?.success) {
      this.toast.show('success', 'اطلاعات اکسل با موفقیت اعمال شد.');
      this.loadAllData();
      // مودال باز می‌ماند تا کاربر گزارش سطور و خطاها را ببیند و خودش دکمه بستن را بزند
    }
  }

  closeExcelModal(): void {
    this.isExcelModalOpen = false;
    this.cdr.detectChanges();
  }

  normalizeInput(val?: string | null): string {
    if (!val) return '';
    return val
      .toString()
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .trim();
  }

  loadSections(): void {
    this.api.getProjectSections().subscribe({
      next: (sections) => {
        this.projectSections = sections;
        this.pruneCollapsedSectionsState();
        this.invalidateAssignmentsCache();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در دریافت لیست بخش‌ها'));
        this.cdr.detectChanges();
      }
    });
  }

  loadAssignments(
    forceFresh: boolean = false,
    customParams?: { section_id?: number; project_id?: number; user_id?: number; role?: string }
  ): void {
    let params: { section_id?: number; project_id?: number; user_id?: number; role?: string } | undefined = customParams;
    if (!params && this.activeSubTab === 'assignments') {
      const pId = this.assignmentProjectFilter ? Number(this.assignmentProjectFilter) : undefined;
      const role = (this.assignmentRoleFilter && this.assignmentRoleFilter !== 'all') ? this.assignmentRoleFilter : undefined;
      if (pId || role) {
        params = {};
        if (pId) params.project_id = pId;
        if (role) params.role = role;
      }
    }

    this.api.getUserSectionAssignments(params, forceFresh).subscribe({
      next: (assignments) => {
        this.userAssignments = assignments;
        this.invalidateAssignmentsCache();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در دریافت لیست انتساب‌ها'));
        this.cdr.detectChanges();
      }
    });
  }

  loadUsers(): void {
    this.accountsHttp.getUsers().subscribe({
      next: (users) => {
        this.systemUsers = users;
        this.invalidateAssignmentsCache();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در دریافت لیست کاربران'));
        this.cdr.detectChanges();
      }
    });
  }

  onProjectFilterChange(projId: number): void {
    this.selectedProjectId = projId;
    this.loadSections();
  }

  // --- عملیات پروژه (Project CRUD) ---
  saveProject(): void {
    const code = this.normalizeInput(this.newProject.code).toUpperCase();
    const name = this.newProject.name?.trim() || '';
    if (!code || !name) {
      this.toast.show('warning', 'لطفاً کد و نام پروژه را وارد نمایید.');
      return;
    }

    const payload: any = {
      ...this.newProject,
      code,
      name,
      description: this.newProject.description?.trim() || ''
    };

    if (this.newProject.company) {
      payload.company = this.newProject.company;
    } else if (!this.editingProject && this.activeCompanyService?.activeCompanyId) {
      payload.company = this.activeCompanyService.activeCompanyId;
    }

    if (this.editingProject?.id) {
      const editId = this.editingProject.id;
      this.api.updateFinancialProject(editId, payload).subscribe({
        next: (updated) => {
          this.toast.show('success', `پروژه «${updated.name}» بروزرسانی شد.`);
          this.editingProject = null;
          this.newProject = { code: '', name: '', description: '', is_active: true };
          this.financialProjects = this.financialProjects.map(p => p.id === editId ? updated : p);
          this.offlineSync.invalidateCache('financial-projects');
          this.loadProjects();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ویرایش پروژه'));
          this.cdr.detectChanges();
        }
      });
    } else {
      this.api.createFinancialProject(payload).subscribe({
        next: (created) => {
          this.toast.show('success', `پروژه «${created.name}» با موفقیت ایجاد شد.`);
          this.newProject = { code: '', name: '', description: '', is_active: true };
          this.financialProjects = [created, ...this.financialProjects.filter(p => p.id !== created.id)];
          this.selectedProjectId = created.id!;
          this.offlineSync.invalidateCache('financial-projects');
          this.loadSections();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ایجاد پروژه'));
          this.cdr.detectChanges();
        }
      });
    }
  }

  editProject(proj: FinancialProject): void {
    this.editingProject = proj;
    this.newProject = { ...proj };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditProject(): void {
    this.editingProject = null;
    this.newProject = { code: '', name: '', description: '', is_active: true };
  }

  deleteProject(id: number, name: string): void {
    this.openConfirmDialog({
      title: 'حذف پروژه مالی و عملیاتی',
      message: `آیا از حذف پروژه «${name}» اطمینان دارید؟ تمامی بخش‌های سازمانی، انتساب‌ها و اسناد تابعه این پروژه نیز حذف یا غیرفعال خواهند شد.`,
      confirmText: 'بله، پروژه حذف شود',
      cancelText: 'انصراف',
      isDanger: true,
      onConfirm: () => {
        this.api.deleteFinancialProject(id).subscribe({
          next: () => {
            this.toast.show('success', 'پروژه با موفقیت حذف یا غیرفعال شد.');
            this.financialProjects = this.financialProjects.filter(p => p.id !== id);
            this.projectSections = this.projectSections.filter(s => Number(s.project) !== id);
            this.userAssignments = this.userAssignments.filter(a => a.project_id !== id);
            this.invalidateAssignmentsCache();
            if (this.selectedProjectId === id) {
              this.selectedProjectId = this.financialProjects.length > 0 ? this.financialProjects[0].id! : null;
            }
            this.offlineSync.invalidateCache('financial-projects');
            this.loadSections();
            this.cdr.detectChanges();
          },
          error: (err) => this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در حذف پروژه'))
        });
      }
    });
  }

  // --- عملیات بخش‌ها (Section CRUD) ---
  saveSection(): void {
    const targetProjectId = this.newSection.project || this.selectedProjectId;
    if (!targetProjectId) {
      this.toast.show('warning', 'لطفاً ابتدا پروژه والد را انتخاب کنید.');
      return;
    }
    const code = this.normalizeInput(this.newSection.code).toUpperCase();
    const name = this.newSection.name?.trim() || '';
    if (!code || !name) {
      this.toast.show('warning', 'لطفاً کد و نام بخش را وارد نمایید.');
      return;
    }

    const payload = {
      code,
      name,
      is_active: this.newSection.is_active !== false,
      project: targetProjectId
    };

    if (this.editingSection?.id) {
      const editId = this.editingSection.id;
      this.api.updateProjectSection(editId, payload).subscribe({
        next: (updated) => {
          this.toast.show('success', `بخش «${updated.name}» بروزرسانی شد.`);
          this.editingSection = null;
          this.newSection = { project: this.selectedProjectId, code: '', name: '', is_active: true };
          this.projectSections = this.projectSections.map(s => s.id === editId ? updated : s);
          this.offlineSync.invalidateCache('project-sections');
          this.loadSections();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ویرایش بخش'));
          this.cdr.detectChanges();
        }
      });
    } else {
      this.api.createProjectSection(payload).subscribe({
        next: (created) => {
          this.toast.show('success', `بخش «${created.name}» با موفقیت ایجاد شد.`);
          this.newSection = { project: targetProjectId, code: '', name: '', is_active: true };
          this.projectSections = [created, ...this.projectSections.filter(s => s.id !== created.id)];
          this.offlineSync.invalidateCache('project-sections');
          this.loadSections();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ایجاد بخش'));
          this.cdr.detectChanges();
        }
      });
    }
  }

  editSection(sec: ProjectSection): void {
    this.editingSection = sec;
    this.newSection = {
      id: sec.id,
      project: sec.project ?? this.selectedProjectId,
      code: sec.code,
      name: sec.name,
      is_active: sec.is_active !== false
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditSection(): void {
    this.editingSection = null;
    this.newSection = { project: this.selectedProjectId, code: '', name: '', is_active: true };
  }

  deleteSection(id: number, name: string): void {
    this.openConfirmDialog({
      title: 'حذف بخش سازمانی',
      message: `آیا از حذف بخش سازمانی «${name}» اطمینان دارید؟ تمامی انتساب‌های کاربران به این بخش نیز حذف خواهند شد.`,
      confirmText: 'بله، بخش حذف شود',
      cancelText: 'انصراف',
      isDanger: true,
      onConfirm: () => {
        this.api.deleteProjectSection(id).subscribe({
          next: () => {
            this.toast.show('success', 'بخش با موفقیت حذف یا غیرفعال شد.');
            this.projectSections = this.projectSections.filter(s => s.id !== id);
            this.userAssignments = this.userAssignments.filter(a => {
              const secId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
              return Number(secId) !== id;
            });
            if (this.expandedSectionIds.has(id)) {
              this.expandedSectionIds.delete(id);
              this.saveCollapsedSectionsState();
            }
            this.invalidateAssignmentsCache();
            this.offlineSync.invalidateCache('project-sections');
            this.loadSections();
            this.cdr.detectChanges();
          },
          error: (err) => this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در حذف بخش'))
        });
      }
    });
  }

  // --- عملیات انتساب کاربران (Assignment CRUD) ---
  openEditAssignmentModal(assignment: UserSectionAssignment, event?: Event): void {
    if (event) event.stopPropagation();
    this.editAssignmentModal = {
      isOpen: true,
      assignment,
      role: assignment.role,
      is_active: assignment.is_active !== false,
      isSubmitting: false
    };
    this.cdr.detectChanges();
  }

  closeEditAssignmentModal(): void {
    this.editAssignmentModal.isOpen = false;
    this.editAssignmentModal.assignment = null;
    this.editAssignmentModal.isSubmitting = false;
    this.cdr.detectChanges();
  }

  submitEditAssignment(): void {
    if (!this.editAssignmentModal.assignment?.id) return;
    this.editAssignmentModal.isSubmitting = true;
    const id = this.editAssignmentModal.assignment.id;
    const payload = {
      role: this.editAssignmentModal.role,
      is_active: this.editAssignmentModal.is_active
    };
    this.api.updateUserSectionAssignment(id, payload).subscribe({
      next: (updated) => {
        this.toast.show('success', 'انتساب با موفقیت ویرایش شد.');
        this.userAssignments = this.userAssignments.map(a => a.id === id ? { ...a, ...updated } : a);
        this.invalidateAssignmentsCache();
        this.closeEditAssignmentModal();
        this.offlineSync.invalidateCache('user-section-assignments');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.editAssignmentModal.isSubmitting = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در ویرایش انتساب'));
        this.cdr.detectChanges();
      }
    });
  }

  deleteAssignment(id: number, userOrRoleInfo?: string): void {
    const desc = userOrRoleInfo ? ` (${userOrRoleInfo})` : '';
    this.openConfirmDialog({
      title: 'لغو انتساب نقش سازمانی',
      message: `آیا از لغو این انتساب کاربر به بخش سازمانی${desc} اطمینان دارید؟`,
      confirmText: 'لغو انتساب',
      cancelText: 'انصراف',
      isDanger: true,
      onConfirm: () => {
        // ۱. حذف آنی و خوش‌بینانه از آرایه محلی
        this.userAssignments = this.userAssignments.filter(a => a.id !== id);
        this.invalidateAssignmentsCache();
        this.cdr.detectChanges();

        this.api.deleteUserSectionAssignment(id).subscribe({
          next: () => {
            this.toast.show('success', 'انتساب با موفقیت لغو شد.');
            // ۲. نامعتبرسازی کش و استعلام مستقیم بدون کش SWR از سرور
            this.offlineSync.invalidateCache('user-section-assignments');
            this.loadAssignments(true);
            this.cdr.detectChanges();
          },
          error: () => {
            this.toast.show('error', 'خطا در لغو انتساب');
            this.loadAssignments(true);
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  getRoleDef(key: string): RoleDefinition {
    return this.roleDefinitions.find(r => r.key === key) || this.roleDefinitions[4];
  }

  getUserInitials(name?: string, username?: string): string {
    const clean = (name || username || '').trim();
    if (!clean) return '؟';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + ' ' + parts[1][0]);
    }
    return clean.slice(0, 2);
  }

  // --- متدهای انتساب سریع و گروهی پرسنل به بخش‌ها ---
  openQuickAssignModal(section: ProjectSection, roleKey: 'employee' | 'supervisor' | 'accountant' | 'manager' | 'treasury'): void {
    const roleDef = this.getRoleDef(roleKey);
    this.quickAssignState = {
      isOpen: true,
      section,
      role: roleKey,
      roleDef,
      selectedUserIds: [],
      userSearchQuery: '',
      isSubmitting: false
    };
    this._cachedAvailableUsers = null;
    this._lastQuickAssignStateKey = '';
    this.cdr.detectChanges();
  }

  closeQuickAssignModal(): void {
    this.quickAssignState.isOpen = false;
    this.quickAssignState.section = null;
    this.quickAssignState.selectedUserIds = [];
    this.quickAssignState.userSearchQuery = '';
    this.quickAssignState.isSubmitting = false;
    this._cachedAvailableUsers = null;
    this._lastQuickAssignStateKey = '';
    this.cdr.detectChanges();
  }

  toggleUserSelection(userId: number): void {
    const idx = this.quickAssignState.selectedUserIds.indexOf(userId);
    if (idx >= 0) {
      this.quickAssignState.selectedUserIds.splice(idx, 1);
    } else {
      this.quickAssignState.selectedUserIds.push(userId);
    }
  }

  selectAllAvailableUsers(): void {
    const available = this.availableUsersForQuickAssign;
    const currentSet = new Set(this.quickAssignState.selectedUserIds);
    available.forEach(u => currentSet.add(u.id));
    this.quickAssignState.selectedUserIds = Array.from(currentSet);
  }

  deselectAllUsers(): void {
    this.quickAssignState.selectedUserIds = [];
  }

  isUserSelected(userId: number): boolean {
    return this.quickAssignState.selectedUserIds.includes(userId);
  }

  submitQuickAssign(): void {
    if (!this.quickAssignState.section || this.quickAssignState.selectedUserIds.length === 0) {
      this.toast.show('warning', 'لطفاً حداقل یک کاربر را برای انتساب انتخاب کنید.');
      return;
    }

    const section = this.quickAssignState.section;
    const userIds = [...this.quickAssignState.selectedUserIds];
    const role = this.quickAssignState.role;
    const roleDef = this.quickAssignState.roleDef;

    this.quickAssignState.isSubmitting = true;
    this.api.bulkAssignUsersToSection({
      section_id: section.id!,
      user_ids: userIds,
      role: role
    }).subscribe({
      next: (createdAssignments) => {
        const count = createdAssignments.length;
        this.toast.show('success', `${count} کاربر با موفقیت به عنوان «${roleDef?.shortLabel || 'نقش'}» در بخش «${section.name}» منتسب شدند.`);

        // ۱. ادغام آنی و خوش‌بینانه انتساب‌های جدید در لیست محلی
        const createdIds = new Set(createdAssignments.map(a => a.id));
        this.userAssignments = [
          ...createdAssignments,
          ...this.userAssignments.filter(a => !createdIds.has(a.id))
        ];
        this.invalidateAssignmentsCache();

        // ۲. بستن فوری مدال و پاکسازی
        this.closeQuickAssignModal();
        this.cdr.detectChanges();

        // ۳. نامعتبرسازی کش SWR و استعلام مستقیم بدون کش از سرور
        this.offlineSync.invalidateCache('user-section-assignments');
        this.loadAssignments(true);
      },
      error: (err) => {
        this.quickAssignState.isSubmitting = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در انتساب کاربران'));
        this.cdr.detectChanges();
      }
    });
  }

  // --- سیستم دیالوگ تایید اختصاصی درون‌برنامه‌ای ---
  openConfirmDialog(options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }): void {
    this.confirmModal = {
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'تایید و حذف',
      cancelText: options.cancelText || 'انصراف',
      isDanger: options.isDanger !== false,
      onConfirm: options.onConfirm
    };
    this.cdr.detectChanges();
  }

  closeConfirmDialog(): void {
    this.confirmModal.isOpen = false;
    this.cdr.detectChanges();
  }

  executeConfirmDialog(): void {
    const action = this.confirmModal.onConfirm;
    this.closeConfirmDialog();
    if (action) {
      action();
    }
  }

  // --- مدیریت کارت‌های جمع‌شونده (Collapsible Sections - پیش‌فرض: بسته بودن تمامی کارت‌ها) ---
  private loadCollapsedSectionsState(): void {
    try {
      const stored = localStorage.getItem('warehouse_expanded_sections');
      if (stored) {
        const ids: number[] = JSON.parse(stored);
        this.expandedSectionIds = new Set<number>(ids);
      } else {
        // پیش‌فرض: لیست خالی، یعنی تمامی کارت‌ها به صورت پیش‌فرض بسته هستند
        this.expandedSectionIds = new Set<number>();
      }
    } catch {
      this.expandedSectionIds = new Set<number>();
    }
  }

  private saveCollapsedSectionsState(): void {
    try {
      localStorage.setItem('warehouse_expanded_sections', JSON.stringify(Array.from(this.expandedSectionIds)));
    } catch {
      // Ignore
    }
  }

  pruneCollapsedSectionsState(): void {
    if (!this.projectSections || this.projectSections.length === 0) return;
    const validIds = new Set(this.projectSections.map(s => s.id).filter((id): id is number => typeof id === 'number'));
    let changed = false;
    for (const id of Array.from(this.expandedSectionIds)) {
      if (!validIds.has(id)) {
        this.expandedSectionIds.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.saveCollapsedSectionsState();
    }
  }

  toggleSectionCollapse(sectionId: number, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedSectionIds.has(sectionId)) {
      this.expandedSectionIds.delete(sectionId);
    } else {
      this.expandedSectionIds.add(sectionId);
    }
    this.saveCollapsedSectionsState();
    this.cdr.detectChanges();
  }

  isSectionCollapsed(sectionId: number): boolean {
    return !this.expandedSectionIds.has(sectionId);
  }

  expandAllSections(): void {
    const validIds = this.projectSections.map(s => s.id).filter((id): id is number => typeof id === 'number');
    this.expandedSectionIds = new Set<number>(validIds);
    this.saveCollapsedSectionsState();
    this.cdr.detectChanges();
  }

  collapseAllSections(): void {
    this.expandedSectionIds.clear();
    this.saveCollapsedSectionsState();
    this.cdr.detectChanges();
  }

  hasManagerAssigned(sGroup: SectionGroupedAssignments): boolean {
    const secId = Number(sGroup.section.id);
    return this.userAssignments.some(a => {
      const aSecId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
      return Number(aSecId) === secId && a.role === 'manager' && a.is_active !== false;
    });
  }

  // --- مدیریت تکثیر و کپی ساختار پرسنلی (Clone Assignments) ---
  openCloneModal(targetSection: ProjectSection, event?: Event): void {
    event?.stopPropagation();
    this.cloneModal = {
      isOpen: true,
      targetSection,
      sourceProjectId: null,
      sourceSectionId: null,
      isSubmitting: false,
      availableSourceSections: [],
      sourceStats: { total: 0, roleCounts: {} }
    };
    if (this.assignmentProjectFilter || (this.assignmentRoleFilter && this.assignmentRoleFilter !== 'all')) {
      this.api.getUserSectionAssignments().subscribe(allAssignments => {
        this.userAssignments = allAssignments;
        this.updateCloneAvailableSections();
        this.cdr.detectChanges();
      });
    } else {
      this.updateCloneAvailableSections();
    }
    this.cdr.detectChanges();
  }

  closeCloneModal(): void {
    this.cloneModal.isOpen = false;
    this.cloneModal.targetSection = null;
    this.cloneModal.sourceProjectId = null;
    this.cloneModal.sourceSectionId = null;
    this.cloneModal.isSubmitting = false;
    this.cloneModal.availableSourceSections = [];
    this.cloneModal.sourceStats = { total: 0, roleCounts: {} };
    this.cdr.detectChanges();
  }

  onCloneSourceProjectChange(projectId: any): void {
    const pId = projectId ? Number(projectId) : null;
    this.cloneModal.sourceProjectId = pId;
    this.cloneModal.sourceSectionId = null;
    this.updateCloneAvailableSections();
    this.updateCloneSourceStats();
    this.cdr.detectChanges();
  }

  onCloneSourceSectionChange(sectionId: any): void {
    const sId = sectionId ? Number(sectionId) : null;
    this.cloneModal.sourceSectionId = sId;
    this.updateCloneSourceStats();
    this.cdr.detectChanges();
  }

  private updateCloneAvailableSections(): void {
    const targetId = this.cloneModal.targetSection?.id;
    let list = this.projectSections.filter(s => s.id !== targetId);
    if (this.cloneModal.sourceProjectId) {
      list = list.filter(s => Number(s.project) === this.cloneModal.sourceProjectId);
    }
    this.cloneModal.availableSourceSections = list.map(s => ({
      ...s,
      assignmentCount: this.userAssignments.filter(a => {
        const aSecId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
        return Number(aSecId) === Number(s.id) && a.is_active !== false;
      }).length
    }));
  }

  private updateCloneSourceStats(): void {
    if (!this.cloneModal.sourceSectionId) {
      this.cloneModal.sourceStats = { total: 0, roleCounts: {} };
      return;
    }
    const secId = Number(this.cloneModal.sourceSectionId);
    const assignments = this.userAssignments.filter(a => {
      const aSecId = typeof a.section === 'object' ? (a.section as any)?.id : a.section;
      return Number(aSecId) === secId && a.is_active !== false;
    });
    const roleCounts: { [key: string]: number } = {};
    for (const a of assignments) {
      roleCounts[a.role] = (roleCounts[a.role] || 0) + 1;
    }
    this.cloneModal.sourceStats = { total: assignments.length, roleCounts };
  }

  executeCloneAssignments(): void {
    if (!this.cloneModal.targetSection?.id || !this.cloneModal.sourceSectionId) {
      this.toast.show('warning', 'لطفاً بخش مبدأ را جهت کپی انتخاب کنید.');
      return;
    }

    this.cloneModal.isSubmitting = true;
    const targetId = this.cloneModal.targetSection.id;
    this.api.cloneSectionAssignments(targetId, this.cloneModal.sourceSectionId).subscribe({
      next: (res) => {
        this.toast.show('success', res?.message || 'ساختار پرسنلی با موفقیت کپی شد.');
        this.loadAssignments(true);
        this.offlineSync.invalidateCache('user-section-assignments');
        // باز کردن کارت بخش مقصد تا کاربر نتیجه را بلافاصله ببیند
        this.expandedSectionIds.add(targetId);
        this.saveCollapsedSectionsState();
        this.closeCloneModal();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cloneModal.isSubmitting = false;
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در کپی ساختار پرسنلی'));
        this.cdr.detectChanges();
      }
    });
  }

  toggleAssignmentStatus(assignment: UserSectionAssignment): void {
    if (!assignment.id) return;
    const newStatus = !assignment.is_active;
    this.api.updateUserSectionAssignment(assignment.id, { is_active: newStatus }).subscribe({
      next: (updated) => {
        assignment.is_active = updated.is_active;
        this.invalidateAssignmentsCache();
        this.toast.show('success', `وضعیت انتساب «${assignment.user_full_name || assignment.username}» به ${newStatus ? 'فعال' : 'غیرفعال'} تغییر یافت.`);
        this.offlineSync.invalidateCache('user-section-assignments');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.show('error', this.extractApiErrorMessage(err, 'خطا در تغییر وضعیت انتساب'));
        this.cdr.detectChanges();
      }
    });
  }

  extractApiErrorMessage(err: any, fallback: string): string {
    if (!err?.error) return fallback;
    if (typeof err.error === 'string') return err.error;
    if (err.error.error && typeof err.error.error === 'string') return err.error.error;
    if (err.error.message && typeof err.error.message === 'string') return err.error.message;
    if (err.error.detail && typeof err.error.detail === 'string') return err.error.detail;
    if (typeof err.error === 'object') {
      const messages: string[] = [];
      for (const [key, val] of Object.entries(err.error)) {
        if (key === 'success' || key === 'status') continue;
        const text = Array.isArray(val) ? val.join('، ') : String(val);
        messages.push(`${key}: ${text}`);
      }
      if (messages.length > 0) return messages.join(' | ');
    }
    return fallback;
  }
}
