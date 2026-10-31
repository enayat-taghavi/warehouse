import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StateService } from '../../../../../core/services/state.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PersonnelApiService } from '../../../api/personnel-api.service';
import { ScopeDirectoryService } from '../../../../../core/http/scope-directory.service';
import {
  PersonnelProfile,
  VehicleDriverProfile,
  PersonnelChangeRequest,
  VehicleChangeRequest,
  PayrollYearlySettings,
  PersonnelWorkflowError,
  isMaskedValue
} from '../../../models/personnel.model';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { ACCOUNTING_ENTITY_ICONS } from '../../../entity-icons';
import { WorkflowReasonDialogComponent } from '../../../../../shared/components/workflow-reason-dialog/workflow-reason-dialog.component';

@Component({
  selector: 'app-manager-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, SvgIconDirective, TabBarComponent, ActionButtonComponent, WorkflowReasonDialogComponent],
  templateUrl: './manager-approvals.html',
  styleUrl: './manager-approvals.css'
})
export class ManagerApprovals implements OnInit, OnDestroy {
  // 6 Main Tabs:
  activeTab: 'new_personnel' | 'new_fleet' | 'change_requests' | 'work_periods' | 'petty_cash' = 'new_personnel';
  
  // Status Filters: 'ALL' | 'pending_manager' | 'revision_required' | 'approved' | 'rejected'
  approvalStatusFilter: string = 'pending_manager';
  changeRequestSubTab: 'personnel' | 'vehicles' = 'personnel';
  crStatusFilter: string = 'pending_manager';
  crSearchQuery: string = '';
  
  // Warehouse & Date Context
  selectedWarehouseId: number | null = null;
  warehouses: any[] = [];
  fiscalYear = '1405';
  selectedYearMonth = '';

  // صفحه‌بندی سمت سرور (۴.۳-ج): پرونده و درخواست تغییر پرسنل فقط‌خواندنی؛ تصویب/بازنگری/رد در «کارهای من»
  readonly pageSize = 20;
  personnelPage = 1;
  personnelCount = 0;
  personnelPendingCount = 0;
  personnelCrPage = 1;
  personnelCrCount = 0;
  personnelCrPendingCount = 0;
  loadError = false;
  readonly isMasked = isMaskedValue;
  private searchTimer: any = null;

  // Data Collections
  personnelList: PersonnelProfile[] = [];
  vehiclesList: VehicleDriverProfile[] = [];
  personnelChangeRequests: PersonnelChangeRequest[] = [];
  vehicleChangeRequests: VehicleChangeRequest[] = [];
  workPeriods: any[] = [];
  pettyCashList: any[] = [];
  yearlySettings: PayrollYearlySettings | null = null;

  // Loading Indicators
  isLoading = false;
  isSaving = false;

  // Search & Filter
  personnelSearch = '';
  vehicleSearch = '';

  // Diff Modal State
  isDiffModalOpen = false;
  diffTargetType: 'personnel' | 'vehicle' = 'personnel';
  selectedDiffCR: any = null;
  diffFieldRows: Array<{
    field_name: string;
    field_label: string;
    old_value: any;
    new_value: any;
    is_changed: boolean;
  }> = [];
  diffAuditLogs: any[] = [];
  isLoadingDiffLogs = false;

  // Reject / Revision Reason Modal
  isRejectModalOpen = false;
  rejectActionType: 'reject' | 'revision' = 'reject';
  rejectTargetType: 'vehicle' | 'vehicle_cr' = 'vehicle';
  rejectTargetId: number | null = null;
  rejectTargetName: string = '';
  rejectReasonText: string = '';

  // Approval Note Modal State
  isApprovalModalOpen = false;
  approvalTargetType: 'vehicle' | 'vehicle_cr' = 'vehicle';
  approvalTargetId: number | null = null;
  approvalTargetName = '';
  approvalNoteText = '';
  isApproving = false;

  // Edit Vehicle Modal State
  isVehicleModalOpen = false;
  editingVehicle: Partial<VehicleDriverProfile> = {};

  private querySub!: Subscription;

  constructor(
    public auth: AuthService,
    public state: StateService,
    private api: PersonnelApiService,
    private scopeDirectory: ScopeDirectoryService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get canApprovePersonnelManager(): boolean {
    const p = this.auth.userPermissions();
    return p.includes('perm_approve_personnel_manager') || p.includes('admin_all');
  }

  get canApproveFleetManager(): boolean {
    const p = this.auth.userPermissions();
    return p.includes('perm_approve_fleet_manager') || p.includes('admin_all');
  }

  get pendingPersonnelCount(): number {
    return this.personnelPendingCount;
  }

  get pendingFleetCount(): number {
    return this.vehiclesList.filter(v => v.approval_status === 'pending_manager' || v.approval_status === 'accountant_approved' || v.approval_status === 'draft' || v.approval_status === 'revision_required').length;
  }

  get pendingCRCount(): number {
    const p = this.personnelCrPendingCount;
    const v = this.vehicleChangeRequests.filter(cr => cr.status === 'pending_manager' || cr.status === 'accountant_approved').length;
    return p + v;
  }

  get pendingWorkPeriodCount(): number {
    return this.workPeriods.filter(wp => wp.status === 'OPEN' || wp.status === 'REJECTED').length;
  }

  get pendingPettyCashCount(): number {
    return this.pettyCashList.filter(pc => pc.status === 'pending_manager').length;
  }

  ngOnInit(): void {
    this.scopeDirectory.getAll().subscribe({
      next: (data: any) => {
        this.warehouses = Array.isArray(data) ? data : [];
      },
      error: () => {}
    });

    this.api.getYearlySettings(this.fiscalYear).subscribe({
      next: (res: any) => { this.yearlySettings = res; },
      error: () => {}
    });

    // Eagerly prefetch change requests and vehicles count for header badge accuracy
    this.loadInitialCounts();

    // Listen to query params for two-way state syncing
    this.querySub = this.route.queryParams.subscribe(params => {
      // فاکتورهای مدیر به تب یکپارچهٔ «فاکتورها» رفت؛ نشانی قدیمی همان‌جا هدایت می‌شود
      if (params['tab'] === 'invoices') {
        void this.router.navigate(['../invoices'], { relativeTo: this.route, queryParams: { view: 'cartable' }, replaceUrl: true });
        return;
      }
      if (params['tab'] &&['new_personnel', 'new_fleet', 'change_requests', 'work_periods', 'petty_cash'].includes(params['tab'])) {
        this.activeTab = params['tab'];
      }
      if (params['status']) {
        this.approvalStatusFilter = params['status'];
      }
      if (params['wh']) {
        this.selectedWarehouseId = params['wh'] === 'ALL' ? null : Number(params['wh']);
      }
      if (params['cr_type'] && ['personnel', 'vehicles'].includes(params['cr_type'])) {
        this.changeRequestSubTab = params['cr_type'];
      }
      this.refreshCurrentTabData();
    });
  }

  loadInitialCounts(): void {
    this.api.getPersonnelChangeRequestsPage({ page: 1, page_size: 1, status: 'pending_manager' }).subscribe({
      next: (res) => {
        this.personnelCrPendingCount = res?.count ?? 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
    this.api.getPersonnelProfilesPage({ page: 1, page_size: 1, approval_status: 'pending_manager,accountant_approved' }).subscribe({
      next: (res) => {
        this.personnelPendingCount = res?.count ?? 0;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
    this.api.getVehicleChangeRequests().subscribe({
      next: (res: any) => {
        this.vehicleChangeRequests = Array.isArray(res) ? res : (res?.results || []);
        this.cdr.detectChanges();
      },
      error: () => {}
    });
    this.api.getVehicleProfiles({ approval_status: 'pending_manager,accountant_approved' }).subscribe({
      next: (res: any) => {
        this.vehiclesList = Array.isArray(res) ? res : (res?.results || []);
        this.cdr.detectChanges();
      },
      error: () => {}
    });
    this.api.getPettyCashTransactions({ status: 'pending_manager' }).subscribe({
      next: (res: any) => {
        this.pettyCashList = Array.isArray(res) ? res : (res?.results || []);
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  ngOnDestroy(): void {
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
  }

  // ─── Responsive Tab Definitions (AGENTS §7 & Shared Toolkit) ───────
  readonly statusFilterTabs: TabDef[] = [
    { id: 'pending_manager', label: 'در انتظار تصویب مدیر', shortLabel: 'در انتظار', icon: 'status-pending' },
    { id: 'revision_required', label: 'نیازمند بازنگری', shortLabel: 'بازنگری', icon: 'status-revision' },
    { id: 'approved', label: 'مصوب نهایی و فعال', shortLabel: 'مصوب', icon: 'status-approved' },
    { id: 'ALL', label: 'همه', shortLabel: 'همه', icon: 'status-all' }
  ];

  readonly crStatusFilterTabs: TabDef[] = [
    { id: 'pending_manager', label: 'در انتظار تصویب مدیر', shortLabel: 'در انتظار', icon: 'status-pending' },
    { id: 'approved', label: 'تصویب شده', shortLabel: 'تصویب', icon: 'status-approved' },
    { id: 'rejected', label: 'رد شده', shortLabel: 'رد', icon: 'status-rejected' },
    { id: 'ALL', label: 'همه', shortLabel: 'همه', icon: 'status-all' }
  ];

  private mainTabsKey = '';
  private mainTabsCache: TabDef[] = [];
  get mainTabs(): TabDef[] {
    const key = `${this.pendingPersonnelCount}:${this.pendingFleetCount}:${this.pendingCRCount}:${this.pendingWorkPeriodCount}:${this.pendingPettyCashCount}`;
    if (key !== this.mainTabsKey) {
      this.mainTabsKey = key;
      this.mainTabsCache = [
        {
          id: 'new_personnel',
          label: 'پرسنل جدید',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.newPersonnel,
          count: this.pendingPersonnelCount,
          tone: 'amber'
        },
        {
          id: 'new_fleet',
          label: 'ناوگان جدید',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: this.pendingFleetCount,
          tone: 'indigo'
        },
        {
          id: 'change_requests',
          label: 'کارتابل ویرایش‌ها',
          shortLabel: 'ویرایش‌ها',
          icon: ACCOUNTING_ENTITY_ICONS.changeRequests,
          count: this.pendingCRCount,
          tone: 'rose',
          // نقطه چشمک‌زن نسخه پایه؛ در mobile="icon" شمارنده زیر ۶۴۰px پنهان است
          indicator: this.pendingCRCount > 0
            ? { tone: 'amber', label: `${this.pendingCRCount} درخواست ویرایش در انتظار`, pulse: true }
            : undefined
        },
        {
          id: 'work_periods',
          label: 'دوره‌های کارکرد ماهانه',
          shortLabel: 'دوره‌ها',
          icon: ACCOUNTING_ENTITY_ICONS.attendance,
          count: this.pendingWorkPeriodCount,
          tone: 'indigo'
        },
        {
          id: 'petty_cash',
          label: 'اسناد تنخواه‌گردان',
          shortLabel: 'تنخواه',
          icon: ACCOUNTING_ENTITY_ICONS.pettyCash,
          count: this.pendingPettyCashCount,
          tone: 'slate'
        }
      ];
    }
    return this.mainTabsCache;
  }

  private crSubTabsKey = '';
  private crSubTabsCache: TabDef[] = [];
  get crSubTabs(): TabDef[] {
    const key = `${this.personnelCrPendingCount}:${this.vehicleChangeRequests.length}`;
    if (key !== this.crSubTabsKey) {
      this.crSubTabsKey = key;
      this.crSubTabsCache = [
        {
          id: 'personnel',
          label: 'پرسنل',
          shortLabel: 'پرسنل',
          icon: ACCOUNTING_ENTITY_ICONS.personnel,
          count: this.personnelCrPendingCount
        },
        {
          id: 'vehicles',
          label: 'ناوگان',
          shortLabel: 'ناوگان',
          icon: ACCOUNTING_ENTITY_ICONS.fleet,
          count: this.vehicleChangeRequests.length
        }
      ];
    }
    return this.crSubTabsCache;
  }

  setTab(tab: string): void {
    if (
      tab === 'new_personnel' ||
      tab === 'new_fleet' ||
      tab === 'change_requests' ||
      tab === 'work_periods' ||
      tab === 'petty_cash'
    ) {
      this.activeTab = tab;
      this.updateQueryParams();
    }
  }

  setStatusFilter(status: string): void {
    this.approvalStatusFilter = status;
    this.personnelPage = 1;
    this.updateQueryParams();
  }

  setCRSubTab(subTab: string): void {
    if (subTab === 'personnel' || subTab === 'vehicles') {
      this.changeRequestSubTab = subTab;
      this.updateQueryParams();
    }
  }

  setCRStatusFilter(status: string): void {
    this.crStatusFilter = status;
    this.personnelCrPage = 1;
    if (this.changeRequestSubTab === 'personnel') this.loadChangeRequests();
  }

  onWarehouseChange(): void {
    this.updateQueryParams();
  }

  private updateQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeTab,
        status: this.approvalStatusFilter,
        wh: this.selectedWarehouseId !== null ? this.selectedWarehouseId : undefined,
        cr_type: this.activeTab === 'change_requests' ? this.changeRequestSubTab : undefined
      },
      queryParamsHandling: 'merge'
    });
  }

  refreshCurrentTabData(): void {
    if (this.activeTab === 'new_personnel') {
      this.loadPersonnel();
    } else if (this.activeTab === 'new_fleet') {
      this.loadVehicles();
    } else if (this.activeTab === 'change_requests') {
      this.loadChangeRequests();
    } else if (this.activeTab === 'work_periods') {
      this.loadWorkPeriods();
    } else if (this.activeTab === 'petty_cash') {
      this.loadPettyCash();
    }
  }

  // ─── 1. Personnel Operations (فقط‌خواندنی؛ اقدام در کارهای من) ──────────────────────────────
  loadPersonnel(): void {
    this.isLoading = true;
    this.loadError = false;
    let filterStatus = this.approvalStatusFilter === 'ALL' ? undefined : this.approvalStatusFilter;
    if (filterStatus === 'pending_manager') {
      filterStatus = 'pending_manager,accountant_approved';
    }
    const params: any = {
      page: this.personnelPage,
      page_size: this.pageSize,
      warehouse_id: this.selectedWarehouseId || undefined,
      approval_status: filterStatus
    };
    if (this.personnelSearch.trim()) params.search = this.personnelSearch.trim();
    this.api.getPersonnelProfilesPage(params).subscribe({
      next: (res) => {
        this.personnelList = res?.results || [];
        this.personnelCount = res?.count ?? this.personnelList.length;
        if (filterStatus === 'pending_manager,accountant_approved' && !this.personnelSearch.trim() && !this.selectedWarehouseId) {
          this.personnelPendingCount = this.personnelCount;
        }
        this.isLoading = false;

        // رفع نقطه کور: هدایت خودکار به تب درخواست‌های تغییرات در صورت نبود پرونده جدید
        if (!this.route?.snapshot?.queryParams?.['tab'] && this.activeTab === 'new_personnel' && this.personnelList.length === 0 && this.pendingCRCount > 0) {
          this.activeTab = 'change_requests';
          this.loadChangeRequests();
        }

        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (err?.status === 404 && this.personnelPage > 1) {
          this.personnelPage = 1;
          this.loadPersonnel();
          return;
        }
        this.isLoading = false;
        this.loadError = true;
        this.toast.show('error', this.workflowErrorText(err, 'خطا در دریافت لیست پرسنل'));
        this.cdr.detectChanges();
      }
    });
  }

  /** فیلتر سمت سرور است؛ همان فهرست صفحهٔ جاری */
  get filteredPersonnel(): PersonnelProfile[] {
    return this.personnelList;
  }

  get personnelTotalPages(): number { return Math.max(1, Math.ceil(this.personnelCount / this.pageSize)); }
  get personnelCrTotalPages(): number { return Math.max(1, Math.ceil(this.personnelCrCount / this.pageSize)); }

  goToPersonnelPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.personnelTotalPages);
    if (next === this.personnelPage) return;
    this.personnelPage = next;
    this.loadPersonnel();
  }

  goToPersonnelCrPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.personnelCrTotalPages);
    if (next === this.personnelCrPage) return;
    this.personnelCrPage = next;
    this.loadChangeRequests();
  }

  /** جستجوی سمت سرور با تأخیر کوتاه */
  onPersonnelSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.personnelPage = 1;
      this.loadPersonnel();
    }, 350);
  }

  onCrSearchChange(): void {
    if (this.changeRequestSubTab !== 'personnel') return;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.personnelCrPage = 1;
      this.loadChangeRequests();
    }, 350);
  }

  /** خطای فارسی از بدنهٔ پاسخ سرور (کدهای گردش کار) */
  workflowErrorText(err: any, fallback: string): string {
    const body: PersonnelWorkflowError = err?.error || {};
    if (body.code === 'wrong_step') return 'این کار در مرحلهٔ دیگری است؛ از کارهای من پیگیری کنید';
    let msg = body.error || body.detail || fallback;
    if (body.code === 'action_blocked' && body.missing_fields?.length) {
      const labels = body.missing_fields.map(m => typeof m === 'string' ? m : (m.label || m.field));
      msg += ': ' + labels.join('، ');
    }
    return msg;
  }

  openApprovalModal(id: number, name: string, type: 'vehicle' | 'vehicle_cr'): void {
    this.approvalTargetId = id;
    this.approvalTargetName = name;
    this.approvalTargetType = type;
    this.approvalNoteText = '';
    this.isApprovalModalOpen = true;
    this.cdr.detectChanges();
  }

  closeApprovalModal(): void {
    this.isApprovalModalOpen = false;
    this.approvalTargetId = null;
    this.approvalTargetName = '';
    this.approvalNoteText = '';
    this.cdr.detectChanges();
  }

  confirmApprovalWithNote(): void {
    if (!this.approvalTargetId) return;
    const id = this.approvalTargetId;
    const note = this.approvalNoteText.trim() || undefined;
    const type = this.approvalTargetType;
    this.isApproving = true;

    let req$: any;
    if (type === 'vehicle') {
      req$ = note ? this.api.approveVehicleManager(id, note) : this.api.approveVehicleManager(id);
    } else if (type === 'vehicle_cr') {
      req$ = note ? this.api.approveVehicleChangeRequestManager(id, note) : this.api.approveVehicleChangeRequestManager(id);
    }

    if (req$) {
      req$.subscribe({
        next: (res: any) => {
          this.isApproving = false;
          this.toast.show('success', res.message || 'تصویب نهایی با موفقیت ثبت شد و پرونده فعال گردید.');
          this.closeApprovalModal();
          this.isDiffModalOpen = false;
          this.refreshCurrentTabData();
        },
        error: (err: any) => {
          this.isApproving = false;
          this.toast.show('error', err?.error?.error || 'خطا در ثبت تصویب نهایی');
          this.cdr.detectChanges();
        }
      });
    }
  }

  // ─── 2. Fleet Operations ──────────────────────────────────
  loadVehicles(): void {
    this.isLoading = true;
    let filterStatus = this.approvalStatusFilter === 'ALL' ? undefined : this.approvalStatusFilter;
    if (filterStatus === 'pending_manager') {
      filterStatus = 'pending_manager,accountant_approved';
    }
    this.api.getVehicleProfiles({
      warehouse_id: this.selectedWarehouseId || undefined,
      approval_status: filterStatus
    }).subscribe({
      next: (res: any) => {
        this.vehiclesList = Array.isArray(res) ? res : (res?.results || []);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.show('error', err?.error?.error || 'خطا در دریافت لیست ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  get filteredVehicles(): VehicleDriverProfile[] {
    let list = this.vehiclesList;
    if (this.approvalStatusFilter !== 'ALL') {
      if (this.approvalStatusFilter === 'pending_manager') {
        list = list.filter(v => v.approval_status === 'pending_manager' || v.approval_status === 'accountant_approved');
      } else {
        list = list.filter(v => v.approval_status === this.approvalStatusFilter);
      }
    }
    if (this.vehicleSearch.trim()) {
      const q = this.vehicleSearch.trim().toLowerCase();
      list = list.filter(v =>
        (v.driver_name && v.driver_name.toLowerCase().includes(q)) ||
        (v.plate_number && v.plate_number.includes(q)) ||
        (v.driver_national_code && v.driver_national_code.includes(q))
      );
    }
    return list;
  }

  approveVehicleManager(v: VehicleDriverProfile, note?: string): void {
    if (!v.id) return;
    const req$ = note ? this.api.approveVehicleManager(v.id, note) : this.api.approveVehicleManager(v.id);
    req$.subscribe({
      next: (res: any) => {
        this.toast.show('success', res.message || 'تصویب نهایی مدیر با موفقیت ثبت شد و خودرو فعال گردید.');
        this.loadVehicles();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در تصویب نهایی ناوگان');
      }
    });
  }

  // ─── 3. Change Requests (Diff Viewer) ──────────────────────
  loadChangeRequests(): void {
    this.isLoading = true;
    if (this.changeRequestSubTab === 'personnel') {
      const params: any = { page: this.personnelCrPage, page_size: this.pageSize };
      if (this.crStatusFilter !== 'ALL') params.status = this.crStatusFilter;
      if (this.crSearchQuery.trim()) params.search = this.crSearchQuery.trim();
      this.api.getPersonnelChangeRequestsPage(params).subscribe({
        next: (res) => {
          this.personnelChangeRequests = res?.results || [];
          this.personnelCrCount = res?.count ?? this.personnelChangeRequests.length;
          if (this.crStatusFilter === 'pending_manager' && !this.crSearchQuery.trim()) {
            this.personnelCrPendingCount = this.personnelCrCount;
          }
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          if (err?.status === 404 && this.personnelCrPage > 1) {
            this.personnelCrPage = 1;
            this.loadChangeRequests();
            return;
          }
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.api.getVehicleChangeRequests().subscribe({
        next: (res: any) => {
          this.vehicleChangeRequests = Array.isArray(res) ? res : (res?.results || []);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => { this.isLoading = false; }
      });
    }
  }

  /** فیلتر وضعیت و جستجو سمت سرور است؛ همان فهرست صفحهٔ جاری */
  get filteredPersonnelChangeRequests(): PersonnelChangeRequest[] {
    return this.personnelChangeRequests;
  }

  get filteredVehicleChangeRequests(): VehicleChangeRequest[] {
    let list = this.vehicleChangeRequests;
    if (this.crStatusFilter !== 'ALL') {
      if (this.crStatusFilter === 'pending_manager') {
        list = list.filter(cr => cr.status === 'pending_manager' || cr.status === 'accountant_approved');
      } else {
        list = list.filter(cr => cr.status === this.crStatusFilter);
      }
    }
    if (this.crSearchQuery.trim()) {
      const q = this.crSearchQuery.trim().toLowerCase();
      list = list.filter(cr =>
        (cr.driver_name && cr.driver_name.toLowerCase().includes(q)) ||
        (cr.plate_number && cr.plate_number.includes(q)) ||
        (cr.created_by_name && cr.created_by_name.toLowerCase().includes(q))
      );
    }
    return list;
  }

  openDiffModal(cr: any, type: 'personnel' | 'vehicle'): void {
    this.diffTargetType = type;
    this.selectedDiffCR = cr;
    this.isDiffModalOpen = true;
    this.diffFieldRows = [];

    const proposed = cr.proposed_changes || {};
    const previous = cr.previous_values || {};
    const payload = cr.changes_payload || {};
    const allKeys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(previous), ...Object.keys(payload)]));

    const labels: { [k: string]: string } = {
      first_name: 'نام',
      last_name: 'نام خانوادگی',
      national_code: 'کد ملی',
      father_name: 'نام پدر',
      daily_base_wage: 'مزد روزانه پایه',
      daily_seniority_bonus: 'پایه سنواتی روزانه',
      base_daily_rate: 'مزد مبنا روزانه',
      job_title: 'سمت شغلی',
      job_grade: 'گروه شغلی',
      contract_type: 'نوع قرارداد',
      marital_status: 'وضعیت تأهل',
      children_count: 'تعداد اولاد',
      sheba_number: 'شماره شبا',
      account_number: 'شماره حساب',
      bank_name: 'نام بانک',
      phone_number: 'شماره تماس',
      mobile: 'شماره همراه',
      attachment: 'پیوست مدارک',
      driver_name: 'نام راننده',
      plate_number: 'شماره پلاک',
      vehicle_type: 'نوع خودرو',
      default_service_rate: 'نرخ پایه هر سرویس',
      driver_phone: 'شماره تماس راننده',
      ownership_type: 'نوع مالکیت',
      is_active: 'وضعیت فعالیت'
    };

    // Filter out internal system and audit keys from diff modal
    const ignoredKeys = new Set(['id', 'pk', 'approval_status', 'created_at', 'updated_at', 'created_by', 'section']);

    for (const key of allKeys) {
      if (ignoredKeys.has(key)) continue;

      let oldVal = previous[key];
      let newVal = proposed[key];

      if (oldVal === undefined && payload[key]?.old !== undefined) {
        oldVal = payload[key].old;
      }
      if (newVal === undefined && payload[key]?.new !== undefined) {
        newVal = payload[key].new;
      }
      if (newVal === undefined && payload[key] !== undefined && typeof payload[key] !== 'object') {
        newVal = payload[key];
      }

      this.diffFieldRows.push({
        field_name: key,
        field_label: labels[key] || key,
        old_value: oldVal ?? '—',
        new_value: newVal ?? '—',
        is_changed: String(oldVal ?? '') !== String(newVal ?? '')
      });
    }

    this.diffAuditLogs = [];
    this.isLoadingDiffLogs = true;
    const modelName = type === 'personnel' ? 'personnelchangerequest' : 'vehiclechangerequest';
    this.api.getWorkflowAuditLogs({ content_type: modelName, object_id: cr.id }).subscribe({
      next: (logs: any) => {
        this.diffAuditLogs = Array.isArray(logs) ? logs : (logs?.results || []);
        this.isLoadingDiffLogs = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingDiffLogs = false;
        this.cdr.detectChanges();
      }
    });
  }

  approveChangeRequestManager(cr: any, note?: string): void {
    const req$ = note ? this.api.approveVehicleChangeRequestManager(cr.id, note) : this.api.approveVehicleChangeRequestManager(cr.id);

    req$.subscribe({
      next: (res: any) => {
        this.toast.show('success', res.message || 'تصویب نهایی تغییرات با موفقیت انجام و روی پرونده اعمال گردید.');
        this.isDiffModalOpen = false;
        this.loadChangeRequests();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در تصویب تغییرات');
      }
    });
  }

  // ─── 4. Work Periods ───────────────────────────────────────
  loadWorkPeriods(): void {
    this.isLoading = true;
    this.api.getAttendanceMonthlySummary(this.selectedWarehouseId, this.fiscalYear + '/04').subscribe({
      next: (res: any) => {
        this.workPeriods = [{
          id: 1,
          warehouse_name: 'سراسری شرکت',
          year_month: res.year_month || (this.fiscalYear + '/04'),
          status: res.period_status || 'OPEN',
          status_display: res.period_status === 'LOCKED' ? 'قفل شده' : 'باز',
          submitted_at: new Date()
        }];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; }
    });
  }


  // ─── Reject / Revision Modal ──────────────────────────────
  openProfileRejectModal(id: number, name: string, type: 'vehicle' | 'vehicle_cr', action: 'reject' | 'revision'): void {
    this.rejectTargetId = id;
    this.rejectTargetName = name;
    this.rejectTargetType = type;
    this.rejectActionType = action;
    this.rejectReasonText = '';
    this.isRejectModalOpen = true;
  }

  confirmProfileRejectOrRevision(): void {
    if (!this.rejectTargetId) return;
    if (this.rejectActionType === 'revision' && !this.rejectReasonText.trim()) {
      this.toast.show('warning', 'ثبت دلیل برای ارجاع به بازنگری الزامی است.');
      return;
    }

    const id = this.rejectTargetId;
    const reason = this.rejectReasonText.trim();
    const action = this.rejectActionType;
    const type = this.rejectTargetType;

    let req$: any;
    if (type === 'vehicle') {
      req$ = action === 'reject' ? this.api.rejectVehicle(id, reason) : this.api.requestVehicleRevision(id, reason);
    } else if (type === 'vehicle_cr') {
      req$ = this.api.rejectVehicleChangeRequest(id, reason);
    }

    if (req$) {
      req$.subscribe({
        next: (res: any) => {
          this.toast.show('info', res.message || 'عملیات با موفقیت انجام شد.');
          this.isRejectModalOpen = false;
          this.isDiffModalOpen = false;
          this.refreshCurrentTabData();
        },
        error: (err: any) => {
          this.toast.show('error', err?.error?.error || 'خطا در اجرای عملیات');
        }
      });
    }
  }

  // ─── 5. Petty Cash (Manager Approval Hub) ──────────
  loadPettyCash(): void {
    this.isLoading = true;
    this.api.getPettyCashTransactions({ status: 'pending_manager' }).subscribe({
      next: (res: any) => {
        this.pettyCashList = Array.isArray(res) ? res : (res?.results || []);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.show('error', err?.error?.error || 'خطا در دریافت اسناد تنخواه');
        this.cdr.detectChanges();
      }
    });
  }

  approvePettyCashManager(pc: any): void {
    this.api.postCartableAction('manager', { action: 'approve', model: 'petty_cash', id: pc.id }).subscribe({
      next: () => {
        this.toast.show('success', `سند تنخواه «${pc.title || pc.id}» تایید و به مرحله پرداخت رفت.`);
        this.loadPettyCash();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در تایید سند تنخواه');
      }
    });
  }

  isPcReasonOpen = false;
  pcReasonTitle = '';
  private pendingPcReject: any = null;

  rejectPettyCashManager(pc: any): void {
    this.pendingPcReject = pc;
    this.pcReasonTitle = `علت بازنگری یا رد سند تنخواه «${pc.title || pc.id}»`;
    this.isPcReasonOpen = true;
  }

  onPcReasonCancelled(): void {
    this.isPcReasonOpen = false;
    this.pendingPcReject = null;
  }

  onPcReasonConfirmed(reason: string): void {
    const pc = this.pendingPcReject;
    if (!pc) return;
    this.isPcReasonOpen = false;
    this.pendingPcReject = null;
    this.api.postCartableAction('manager', { action: 'revision', model: 'petty_cash', id: pc.id, reason }).subscribe({
      next: () => {
        this.toast.show('warning', 'سند تنخواه جهت بازنگری عودت گردید.');
        this.loadPettyCash();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || 'خطا در ارجاع بازنگری سند تنخواه');
      }
    });
  }

  // ─── Helper Formatting ────────────────────────────────────
  getApprovalBadgeClass(status?: string): string {
    switch (status) {
      case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending_manager':
      case 'accountant_approved':
      case 'manager_approved': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'pending_accountant':
      case 'supervisor_approved': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'draft':
      case 'pending_supervisor': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'revision_required': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  getApprovalStatusTitle(status?: string): string {
    switch (status) {
      case 'approved': return 'مصوب نهایی و فعال';
      case 'pending_manager':
      case 'accountant_approved': return 'در انتظار تصویب مدیر';
      case 'manager_approved': return 'تایید مرحله اول مدیر';
      case 'pending_accountant':
      case 'supervisor_approved': return 'در انتظار تایید مالی (حسابدار)';
      case 'pending_supervisor': return 'در انتظار بررسی سرپرست';
      case 'draft': return 'پیش‌نویس';
      case 'revision_required': return 'نیازمند بازنگری و اصلاح';
      case 'rejected': return 'رد شده';
      default: return status || '—';
    }
  }
}
