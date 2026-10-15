import {
  normalizeText,
  normalizeDigits,
  convertPersianKeyboardToEnglish,
  filterAndSortSupervisorCountTasks,
  filterAndSortSupervisorDocTasks,
  handleSupervisorKeydownEvent,
  downloadBlob,
  matchesSupervisorBarcode,
  parseSupervisorUrlParams,
  getInvoiceTypeLabel,
  getCurrencyLabel,
  formatNumberWithCommas,
  getActionTypeLabel,
  SupervisorLongPressController,
  handleSupervisorSwr
} from './supervisor-dashboard.helpers';
import { SupervisorDashboardFacade } from './supervisor-dashboard.facade';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, HostListener, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, Subject, filter, debounceTime, distinctUntilChanged } from 'rxjs';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CountTaskApiService } from '../../../api/count-task-api.service';
import { CountTask } from '../../../../../core/models/count-task.model';
import { DocTaskApiService } from '../../../api/doc-task-api.service';
import { DocTask } from '../../../../../core/models/doc-task.model';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { SettingsService } from '../../../../../core/services/settings';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../../core/services/state.service';
import { WarehouseSelectorComponent } from '../../../../../shared/components/warehouse-selector/warehouse-selector.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { BarcodeScannerComponent } from '../../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { AuthStore } from '../../../../../core/stores/auth.store';
import { AuthService } from '../../../../../core/auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../../core/services/network-status.service';
import { PersianDatePipe } from '../../../../../shared/pipes/persian-date.pipe';
import { ItemPhotoGalleryComponent } from '../../item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../../item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../../item-photo-gallery/photo-gallery-host';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';
import { ContextualCommentsComponent } from '../../../../common/components/communications/contextual-comments/contextual-comments.component';

@Component({
  selector: 'app-supervisor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, WarehouseSelectorComponent, OfflinePendingBadgeComponent, BarcodeScannerComponent, PersianDatePipe, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, ContextualCommentsComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent],
  templateUrl: './supervisor-dashboard.html',
  styleUrl: './supervisor-dashboard.css'
})
export class SupervisorDashboard implements OnInit, OnDestroy {
  // تب‌ها از شمار زنده فهرست‌ها ساخته می‌شوند (مثل بایندینگ مستقیم پیشین)؛ آرایه فقط با تغییر شمارها عوض می‌شود
  // تا app-tab-bar (OnPush) بی‌دلیل بازرسم نشود.
  private tabsKey = '';
  private tabsCache: { section: TabDef[]; counting: TabDef[]; financial: TabDef[] } = { section: [], counting: [], financial: [] };

  private syncTabs() {
    const key = `${this.activeSection}|${this.tasks.length}|${this.poolTasks.length}|${this.docTasks.length}|${this.docPoolTasks.length}`;
    if (key === this.tabsKey) return this.tabsCache;
    this.tabsKey = key;
    const n = (len: number) => (len > 0 ? len : undefined);
    this.tabsCache = {
      section: [
        { id: 'counting', label: 'انبارگردانی (میدانی)', shortLabel: 'میدانی', icon: 'package', count: this.activeSection !== 'counting' ? n(this.tasks.length) : undefined },
        { id: 'financial', label: 'مالی / اسناد', shortLabel: 'مالی', icon: 'file', count: this.activeSection !== 'financial' ? n(this.docTasks.length) : undefined }
      ],
      counting: [
        { id: 'my-tasks', label: 'تسک‌های من', shortLabel: 'تسک‌ها', count: n(this.tasks.length) },
        { id: 'pool', label: 'مخزن کالاها', shortLabel: 'مخزن', count: n(this.poolTasks.length) }
      ],
      financial: [
        { id: 'doc', label: 'تسک‌های من', shortLabel: 'تسک‌ها', count: n(this.docTasks.length) },
        { id: 'doc-pool', label: 'مخزن اسناد', shortLabel: 'مخزن', count: n(this.docPoolTasks.length) }
      ]
    };
    return this.tabsCache;
  }

  get sectionTabs(): TabDef[] { return this.syncTabs().section; }
  get countingSubTabs(): TabDef[] { return this.syncTabs().counting; }
  get financialSubTabs(): TabDef[] { return this.syncTabs().financial; }

  private wsSub?: Subscription;
  private swrSub?: Subscription;
  private wsUpdateSubject = new Subject<any>();
  private wsDebounceSub?: Subscription;
  private offlineSync = OfflineSyncService.getInstance();
  updatedTaskIds = new Set<number>();
  flashTimeout: any;
  private routerSub?: Subscription;
  authStore = inject(AuthStore);
  auth = inject(AuthService);
  private router = inject(Router);
  private settingsService = inject(SettingsService);
  tasks: CountTask[] = [];
  poolTasks: CountTask[] = [];
  isLoading = true;
  selectedTasks: Set<number> = new Set();
  selectedPoolTasks: Set<number> = new Set();
  currentTab: 'my-tasks' | 'pool' | 'doc' | 'doc-pool' = 'my-tasks';
  lastCountTab: 'my-tasks' | 'pool' = 'my-tasks';
  lastDocTab: 'doc' | 'doc-pool' = 'doc';
  scannerCameraPreset = 'adaptive';

  // ── Photo Gallery State ───────────────────────────────────────────────────
  readonly photoGallery = new PhotoGalleryHost(msg => this.toast.warning(msg));

  /**
   * `countTaskId` را قالب می‌فرستد، نه این متد: لیست‌های سند (docTasks) هم از
   * همان بندانگشتی استفاده می‌کنند و شناسهٔ DocTask نباید در فیلدی برود که به
   * CountTask اشاره دارد.
   */
  onPhotosChanged(photos: any[]): void {
    this.photoGallery.apply(
      photos,
      this.tasks,
      this.poolTasks,
      this.docTasks,
      this.docPoolTasks,
      this.selectedCountingDetailTask,
    );
    this.cdr.markForCheck();
  }

  // ─── Search & Filters State ───
  searchQuery: string = '';
  searchSubject = new Subject<string>();
  statusFilter: 'all' | 'counted' | 'recount' = 'all';
  dateFilter: 'all' | 'today' | 'yesterday' | 'week' = 'all';
  locationFilter: string = 'all';
  filteredTasks: CountTask[] = [];
  filteredPoolTasks: CountTask[] = [];
  filteredDocTasks: DocTask[] = [];
  filteredDocPoolTasks: DocTask[] = [];

  // ─── Smart Sorting State ───
  sortField: 'updated_at' | 'created_at' | 'location' | 'recount_first' | 'code' | 'title' = 'updated_at';
  sortDirection: 'asc' | 'desc' = 'desc';
  isSortMenuOpen = false;

  // ─── Touch / Long Press Handling for Mobile ───
  pressTimeout: any = null;
  justLongPressed = false;
  initialTouchY = 0;
  initialTouchX = 0;

  // ─── Counting Task Details Modal ───
  selectedCountingDetailTask: CountTask | null = null;

  openCountingDetail(task: CountTask, event?: Event) { if (event) event.stopPropagation(); this.selectedCountingDetailTask = task; this.cdr.detectChanges(); }

  closeCountingDetail() { this.selectedCountingDetailTask = null; this.cdr.detectChanges(); }

  setSort(field: 'created_at' | 'updated_at' | 'location' | 'recount_first' | 'code' | 'title') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = (field === 'created_at' || field === 'updated_at') ? 'desc' : 'asc';
    }
    this.isSortMenuOpen = false;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  toggleSortDirection() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  toggleSortMenu(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isSortMenuOpen = !this.isSortMenuOpen;
    this.cdr.detectChanges();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.isSortMenuOpen) {
      this.isSortMenuOpen = false;
      this.cdr.detectChanges();
    }
  }

  getSortLabel(): string {
    switch (this.sortField) {
      case 'updated_at': return 'آخرین تغییر';
      case 'created_at': return 'زمان تخصیص';
      case 'location': return 'مسیر لوکیشن';
      case 'recount_first': return 'اولویت بازشماری';
      case 'code': return 'کد کالا';
      case 'title': return 'شرح کالا';
      default: return 'مرتب‌سازی';
    }
  }

  private fetchSettings() {
    const whId = Number(this.state.appState.activeWarehouseId);
    if (whId && !isNaN(whId)) {
      this.settingsService.getWarehouseSettings(whId).subscribe({
        next: (res: any) => {
          this.scannerCameraPreset = res?.scanner_camera_preset?.value ?? res?.scanner_camera_preset ?? 'adaptive';
        }
      });
    } else {
      this.settingsService.getGlobalSettings().subscribe({
        next: (res: any) => {
          this.scannerCameraPreset = res?.scanner_camera_preset ?? 'adaptive';
        }
      });
    }
  }

  trackByTaskId(index: number, task: CountTask | DocTask): number {
    return task.id ?? index;
  }

  // Barcode Scanning State
  @ViewChild(BarcodeScannerComponent) scanner?: BarcodeScannerComponent;
  private scanBusy = false;
  private barcodeBuffer = '';
  private lastKeyTime = 0;

  get activeSection(): 'counting' | 'financial' {
    return (this.currentTab === 'doc' || this.currentTab === 'doc-pool') ? 'financial' : 'counting';
  }

  get statusCounts() {
    let counted = 0;
    let recount = 0;
    for (const t of this.tasks) {
      if (t.status === 'COUNTED') counted++;
      else if (t.status === 'SUPERVISOR_REJECTED' || t.status === 'MANAGER_REJECTED') recount++;
    }
    return {
      all: this.tasks.length,
      counted,
      recount
    };
  }

  get docStatusCounts() {
    let processed = 0;
    let rejected = 0;
    for (const t of this.docTasks) {
      if (t.status === 'DOC_PROCESSED') processed++;
      else if (t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED') rejected++;
    }
    return {
      all: this.docTasks.length,
      processed,
      rejected
    };
  }

  switchSection(section: string) {
    if (section === 'counting') {
      const target = this.lastCountTab || 'my-tasks';
      this.setTab(target);
    } else {
      const target = this.lastDocTab || 'doc';
      this.setTab(target);
    }
  }

  setLocationFilter(loc: string) { this.locationFilter = loc; this.applyFilters(); this.updateUrlState(); }

  get availableLocations(): string[] {
    const locSet = new Set<string>();
    const list = this.activeSection === 'counting'
      ? (this.currentTab === 'my-tasks' ? this.tasks : this.poolTasks)
      : (this.currentTab === 'doc' ? this.docTasks : this.docPoolTasks);
    for (const t of list) {
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim();
      if (loc) {
        const prefix = loc.split(/[-_/]/)[0] || loc;
        locSet.add(prefix.toUpperCase());
      }
    }
    return Array.from(locSet).sort();
  }

  onWarehouseChanged(whId: any) {
    this.authStore.setActiveWarehouse(whId);
    this.state.appState.activeWarehouseId = whId;
    this.clearAllSelections();
    this.tasks = [];
    this.poolTasks = [];
    this.docTasks = [];
    this.docPoolTasks = [];
    this.refreshCurrentTab();
    this.preloadTabCounts();
  }

  getDynamicEntries(task: CountTask | DocTask | null | undefined): { key: string, label: string, value: any }[] {
    if (!task || !task.item_details) return [];
    const dyn = (task.item_details as any).dynamic_data;
    if (!dyn || typeof dyn !== 'object') return [];
    return Object.entries(dyn).map(([k, v]) => ({
      key: k,
      label: k.replace(/_/g, ' '),
      value: v !== undefined && v !== null && v !== '' ? v : '-'
    }));
  }

  isTaskSelectable(task: CountTask | DocTask | null | undefined): boolean {
    if (!task || !task.id) return false;
    if (this.activeSection === 'counting') {
      if (this.currentTab === 'pool') return true;
      return task.status === 'COUNTED' || task.status === 'MANAGER_REJECTED';
    } else {
      if (this.currentTab === 'doc-pool') return true;
      return task.status === 'DOC_PROCESSED' || task.status === 'DOC_MANAGER_REJECTED';
    }
  }

  clearAllSelections() {
    this.selectedTasks.clear();
    this.selectedPoolTasks.clear();
    this.selectedDocTasks.clear();
    this.selectedDocPoolTasks.clear();
    this.cdr.detectChanges();
  }

  // Reject Dialog State
  showRejectDialog = false;
  rejectingTask: CountTask | null = null;
  rejectNote: string = '';

  // Bulk Reject Dialog State
  showBulkRejectDialog = false;
  bulkRejectNote: string = '';

  // Approve Dialog State
  showApproveDialog = false;
  approveNote: string = '';

  // History Dialog State
  showHistoryDialog = false;
  historyTask: CountTask | null = null;

  // ── Doc Task Tab ──
  docTasks: DocTask[] = [];
  isDocLoading = false;
  selectedDocTasks = new Set<number>();
  showDocApproveDialog = false;
  docApproveNote = '';
  showDocRejectDialog = false;
  docRejectNote = '';

  // ── Doc Pool Tab ──
  docPoolTasks: DocTask[] = [];
  isDocPoolLoading = false;
  selectedDocPoolTasks = new Set<number>();

  // Doc Detail Modal State
  selectedDocDetailTask: DocTask | null = null;

  openDocDetail(task: DocTask) { this.selectedDocDetailTask = task; this.cdr.detectChanges(); }

  closeDocDetail() { this.selectedDocDetailTask = null; this.cdr.detectChanges(); }

  getInvoiceTypeLabel(val: string | null | undefined): string { return getInvoiceTypeLabel(val); }

  getCurrencyLabel(val: string | null | undefined): string { return getCurrencyLabel(val); }

  formatNumberWithCommas(val: any): string { return formatNumberWithCommas(val); }

  getItemDetail(task: DocTask | CountTask | any | null, key: string): any {
    if (!task || !task.item_details) return '-';
    const item = task.item_details as any;
    return item[key] !== undefined && item[key] !== null && item[key] !== '' ? item[key] : '-';
  }

  // Export Modal State
  isExportModalOpen = false;
  exportDataScope: 'all' | 'selected' = 'all';
  exportColumnScope: 'all_db' | 'visible' | 'custom' = 'all_db';
  selectedExportColumns: Set<string> = new Set();
  isExporting = false;
  exportSubscription?: Subscription;
  availableExportColumns: {key: string, label: string}[] = [];

  get currentSelectedTasks() {
    if (this.currentTab === 'my-tasks') return this.selectedTasks;
    if (this.currentTab === 'pool') return this.selectedPoolTasks;
    if (this.currentTab === 'doc') return this.selectedDocTasks;
    if (this.currentTab === 'doc-pool') return this.selectedDocPoolTasks;
    return new Set<number>();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    handleSupervisorKeydownEvent(event, this);
  }

  getActionTypeLabel(val: string | null | undefined): string { return getActionTypeLabel(val); }

  constructor(
    public facade: SupervisorDashboardFacade,
    private countTaskApi: CountTaskApiService,
    private docTaskApi: DocTaskApiService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    public state: StateService,
    private http: HttpClient,
    private wsService: WebSocketService
  ) {
    this.searchSubject.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.applyFilters();
      this.updateUrlState();
      this.cdr.detectChanges();
    });
  }

  initialLoadDone = false;

  ngOnInit() {
    this.wsService.connect();
    this.fetchSettings();

    this.wsDebounceSub = this.wsUpdateSubject.pipe(debounceTime(600)).subscribe(() => {
      this.refreshCurrentTab(false, true);
    });

    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      const activeWh = this.state.appState.activeWarehouseId;
      if (data.warehouse_id && activeWh && activeWh !== 'ALL' && Number(data.warehouse_id) !== Number(activeWh)) {
        return;
      }
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        if (data.task && data.task.id) this.updateCountTaskInPlace(data.task);
        else if (data.task_id) this.fetchSingleCountTask(data.task_id);
        else this.wsUpdateSubject.next(data);
      } else if (data.type === 'doc_task_update' || data.event === 'doc_task_update') {
        if (data.task && data.task.id) this.updateDocTaskInPlace(data.task);
        else if (data.task_id) this.fetchSingleDocTask(data.task_id);
        else this.wsUpdateSubject.next(data);
      }
    });

    this.syncStateFromUrl();
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => this.syncStateFromUrl());

    this.preloadTabCounts();

    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      handleSupervisorSwr(url, data, this.currentTab, {
        tasks: this.tasks,
        poolTasks: this.poolTasks,
        docTasks: this.docTasks,
        docPoolTasks: this.docPoolTasks,
        trackUpdates: this.trackUpdates.bind(this),
        applyFilters: this.applyFilters.bind(this),
        detectChanges: () => this.cdr.detectChanges()
      });
    });
  }

  onSearchChange(val: string) {
    this.searchQuery = val;
    this.applyFilters();
    this.searchSubject.next(val);
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setStatusFilter(filter: "all" | "counted" | "recount") { this.statusFilter = filter; this.applyFilters(); this.updateUrlState(); }

  setDateFilter(filter: "all" | "today" | "yesterday" | "week") { this.dateFilter = filter; this.applyFilters(); this.updateUrlState(); }

  applyFilters() {
    const opts = {
      searchQuery: this.searchQuery,
      locationFilter: this.locationFilter,
      dateFilter: this.dateFilter,
      statusFilter: this.statusFilter,
      sortField: this.sortField,
      sortDirection: this.sortDirection
    };

    this.filteredTasks = filterAndSortSupervisorCountTasks(this.tasks, opts);
    this.filteredPoolTasks = this.poolTasks.filter(t => {
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').toLowerCase().trim();
      const matchLoc = !this.locationFilter || this.locationFilter === 'all' || loc.startsWith(this.locationFilter.toLowerCase().trim());
      if (!matchLoc) return false;
      if (!this.searchQuery) return true;
      const q = normalizeText(this.searchQuery);
      const enQ = normalizeText(convertPersianKeyboardToEnglish(this.searchQuery));
      const unic = normalizeText(t.item_details?.fa_unic_code || '');
      const desc = normalizeText(t.item_details?.description || '');
      return unic.includes(q) || unic.includes(enQ) || desc.includes(q);
    });

    this.filteredDocTasks = filterAndSortSupervisorDocTasks(this.docTasks, opts);
    this.filteredDocPoolTasks = this.docPoolTasks.filter(t => {
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').toLowerCase().trim();
      const matchLoc = !this.locationFilter || this.locationFilter === 'all' || loc.startsWith(this.locationFilter.toLowerCase().trim());
      if (!matchLoc) return false;
      if (!this.searchQuery) return true;
      const q = normalizeText(this.searchQuery);
      const enQ = normalizeText(convertPersianKeyboardToEnglish(this.searchQuery));
      const unic = normalizeText(t.item_details?.fa_unic_code || '');
      const desc = normalizeText(t.item_details?.description || '');
      return unic.includes(q) || unic.includes(enQ) || desc.includes(q);
    });
  }

  async onBarcodeScanned(code: string) {
    if (this.selectedCountingDetailTask || this.selectedDocDetailTask) {
      this.toast.info('لطفاً ابتدا پنجره جزئیات کالا/سند جاری را تعیین تکلیف نمایید');
      return;
    }
    if (this.scanBusy) return;
    this.scanBusy = true;
    try {
      const rawQ = (code || '').trim().toLowerCase();
      const convertedQ = convertPersianKeyboardToEnglish(rawQ).toLowerCase();
      const normQ = normalizeDigits(rawQ).toLowerCase();
      const normConvertedQ = normalizeDigits(convertedQ).toLowerCase();
      const match = (t: any) => matchesSupervisorBarcode(t, rawQ, convertedQ, normQ, normConvertedQ);

      if (this.activeSection === 'counting') {
        const foundTask = this.tasks.find(match);
        if (foundTask) {
          this.openCountingDetail(foundTask);
          return;
        }
        const foundPool = this.poolTasks.find(match);
        if (foundPool) {
          this.toast.info(`کالای ${code} در استخر انبارگردانی یافت شد`);
          this.setTab('pool');
          return;
        }
      } else {
        const foundDoc = this.docTasks.find(match);
        if (foundDoc) {
          this.openDocDetail(foundDoc);
          return;
        }
        const foundDocPool = this.docPoolTasks.find(match);
        if (foundDocPool) {
          this.toast.info(`سند ${code} در استخر اسناد مالی یافت شد`);
          this.setTab('doc-pool');
          return;
        }
      }
      this.searchQuery = rawQ;
      this.applyFilters();
      this.toast.warning(`موردی مطابق با «${rawQ}» یافت نشد.`);
      this.cdr.detectChanges();
    } finally {
      this.scanBusy = false;
      this.scanner?.focusInput();
      this.cdr.detectChanges();
    }
  }

  preloadTabCounts() {
    const whId = this.state.appState.activeWarehouseId;
    const countParams: any = { as_role: 'supervisor' };
    if (whId && whId !== 'ALL' && whId !== -1) countParams.warehouse_id = whId;

    if (this.currentTab !== 'pool') {
      this.facade.loadPoolTasks(countParams).subscribe({
        next: (res: any) => {
          this.poolTasks = Array.isArray(res) ? res : (res.results || []);
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    if (this.currentTab !== 'doc') {
      const docParams: any = { as_role: 'doc_supervisor', page_size: 500 };
      if (whId && whId !== 'ALL' && whId !== -1) docParams.warehouse_id = whId;
      this.facade.loadDocTasks(docParams).subscribe({
        next: (res: any) => {
          const all: DocTask[] = Array.isArray(res) ? res : (res.results || []);
          this.docTasks = all.filter(t => t.status === 'DOC_PROCESSED' || t.status === 'DOC_MANAGER_REJECTED');
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    if (this.currentTab !== 'doc-pool') {
      const docPoolParams: any = { as_role: 'doc_supervisor' };
      if (whId && whId !== 'ALL' && whId !== -1) docPoolParams.warehouse_id = whId;
      this.facade.loadDocPoolTasks(docPoolParams).subscribe({
        next: (res: any) => {
          this.docPoolTasks = Array.isArray(res) ? res : (res.results || []);
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.wsDebounceSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.swrSub?.unsubscribe();
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
  }

  refreshCurrentTab(showLoading = true, preserveState = false) {
    if (this.currentTab === 'my-tasks') this.loadTasks(showLoading, preserveState);
    else if (this.currentTab === 'pool') this.loadPoolTasks(showLoading, preserveState);
    else if (this.currentTab === 'doc') this.loadDocTasks(showLoading, preserveState);
    else this.loadDocPoolTasks(showLoading, preserveState);
  }

  private triggerFlash(id: number) {
    this.updatedTaskIds.add(id);
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
    this.flashTimeout = setTimeout(() => {
      this.updatedTaskIds.clear();
      this.cdr.detectChanges();
    }, 4000);
  }

  updateCountTaskInPlace(taskData: any) {
    if (!taskData || !taskData.id) return;
    const id = taskData.id;
    if (taskData._deleted) {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
      this.cdr.detectChanges();
      return;
    }
    const isSupervisorStatus = taskData.status === 'COUNTED' || taskData.status === 'MANAGER_REJECTED';
    if (!isSupervisorStatus) {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
      this.cdr.detectChanges();
      return;
    }
    const currentUserId = this.auth.user()?.id;
    const isMyTask = taskData.supervisor === currentUserId || (taskData.supervisor && typeof taskData.supervisor === 'object' && taskData.supervisor.id === currentUserId);
    const isPool = !taskData.supervisor;

    if (isMyTask) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx !== -1) this.tasks[idx] = { ...this.tasks[idx], ...taskData };
      else this.tasks = [taskData, ...this.tasks];
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else if (isPool) {
      const idx = this.poolTasks.findIndex(t => t.id === id);
      if (idx !== -1) this.poolTasks[idx] = { ...this.poolTasks[idx], ...taskData };
      else this.poolTasks = [taskData, ...this.poolTasks];
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
    }
    if (this.selectedCountingDetailTask && this.selectedCountingDetailTask.id === id) {
      this.selectedCountingDetailTask = { ...this.selectedCountingDetailTask, ...taskData };
    }
    this.cdr.detectChanges();
  }

  updateDocTaskInPlace(taskData: any) {
    if (!taskData || !taskData.id) return;
    const id = taskData.id;
    if (taskData._deleted) {
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.selectedDocTasks.delete(id);
      this.selectedDocPoolTasks.delete(id);
      if (this.selectedDocDetailTask?.id === id) this.selectedDocDetailTask = null;
      this.cdr.detectChanges();
      return;
    }
    const isSupervisorDocStatus = taskData.status === 'DOC_PROCESSED' || taskData.status === 'DOC_MANAGER_REJECTED';
    if (!isSupervisorDocStatus) {
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.selectedDocTasks.delete(id);
      this.selectedDocPoolTasks.delete(id);
      if (this.selectedDocDetailTask?.id === id) this.selectedDocDetailTask = null;
      this.cdr.detectChanges();
      return;
    }
    const currentUserId = this.auth.user()?.id;
    const isMyTask = taskData.doc_supervisor === currentUserId || (taskData.doc_supervisor && typeof taskData.doc_supervisor === 'object' && taskData.doc_supervisor.id === currentUserId);
    const isPool = !taskData.doc_supervisor;

    if (isMyTask) {
      const idx = this.docTasks.findIndex(t => t.id === id);
      if (idx !== -1) this.docTasks[idx] = { ...this.docTasks[idx], ...taskData };
      else this.docTasks = [taskData, ...this.docTasks];
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else if (isPool) {
      const idx = this.docPoolTasks.findIndex(t => t.id === id);
      if (idx !== -1) this.docPoolTasks[idx] = { ...this.docPoolTasks[idx], ...taskData };
      else this.docPoolTasks = [taskData, ...this.docPoolTasks];
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else {
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.selectedDocTasks.delete(id);
      this.selectedDocPoolTasks.delete(id);
    }
    if (this.selectedDocDetailTask && this.selectedDocDetailTask.id === id) {
      this.selectedDocDetailTask = { ...this.selectedDocDetailTask, ...taskData };
    }
    this.cdr.detectChanges();
  }

  fetchSingleCountTask(taskId: number) {
    this.countTaskApi.getById(String(taskId)).subscribe({
      next: (task) => {
        if (task) this.updateCountTaskInPlace(task);
      },
      error: () => {
        this.wsUpdateSubject.next(taskId);
      }
    });
  }

  fetchSingleDocTask(taskId: number) {
    this.docTaskApi.getById(taskId).subscribe({
      next: (task) => {
        if (task) this.updateDocTaskInPlace(task);
      },
      error: () => {
        this.wsUpdateSubject.next(taskId);
      }
    });
  }

  private trackUpdates(oldList: any[], newList: any[]) {
    const oldMap = new Map(oldList.map((t: any) => [t.id, t]));
    let hasUpdates = false;
    for (const t of newList) {
      const oldItem = oldMap.get(t.id);
      if (!oldItem || oldItem.status !== t.status || oldItem.counted_balance !== t.counted_balance) {
        this.updatedTaskIds.add(t.id);
        hasUpdates = true;
      }
    }
    if (hasUpdates) {
      if (this.flashTimeout) clearTimeout(this.flashTimeout);
      this.flashTimeout = setTimeout(() => {
        this.updatedTaskIds.clear();
        this.cdr.detectChanges();
      }, 4000);
    }
  }

  loadTasks(showLoading = true, preserveState = false) {
    if (!preserveState) this.selectedTasks.clear();
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }

    const params: any = { as_role: 'supervisor', page_size: 1000 };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.facade.loadCountTasks(params).then(newTasks => {
      this.trackUpdates(this.tasks, newTasks);
      this.tasks = newTasks;
      this.applyFilters();
      if (preserveState) {
        const validIds = new Set(this.tasks.map(t => t.id));
        this.selectedTasks = new Set(Array.from(this.selectedTasks).filter(id => validIds.has(id)));
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    }).catch(err => {
      if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
        this.toast.error('خطا در دریافت اطلاعات');
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  loadPoolTasks(showLoading = true, preserveState = false) {
    if (!preserveState) this.selectedPoolTasks.clear();
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }

    const params: any = { as_role: 'supervisor' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.facade.loadCountPoolTasks(params).then(res => {
      this.trackUpdates(this.poolTasks, res);
      this.poolTasks = res;
      this.applyFilters();
      if (preserveState) {
        const validIds = new Set(this.poolTasks.map(t => t.id));
        this.selectedPoolTasks = new Set(Array.from(this.selectedPoolTasks).filter(id => validIds.has(id)));
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    }).catch(err => {
      if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
        this.toast.error('خطا در دریافت اطلاعات استخر انبارگردانی');
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  /** به‌روزرسانی پارامترهای آدرس مرورگر و حافظه مرورگر */
  private updateUrlState() {
    const defaultSortDir = (this.sortField === 'created_at' || this.sortField === 'updated_at') ? 'desc' : 'asc';
    const queryParams: any = {
      tab: this.currentTab,
      q: this.searchQuery ? this.searchQuery : null,
      status: this.statusFilter !== 'all' ? this.statusFilter : null,
      date: this.dateFilter !== 'all' ? this.dateFilter : null,
      loc: this.locationFilter !== 'all' ? this.locationFilter : null,
      sort: this.sortField !== 'updated_at' ? this.sortField : null,
      sortDir: this.sortDirection !== defaultSortDir ? this.sortDirection : null
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('supervisor_active_tab', this.currentTab);
        if (this.currentTab === 'my-tasks' || this.currentTab === 'pool') {
          this.lastCountTab = this.currentTab;
          localStorage.setItem('supervisor_last_count_tab', this.currentTab);
          localStorage.setItem('supervisor_active_section', 'counting');
        } else {
          this.lastDocTab = this.currentTab;
          localStorage.setItem('supervisor_last_doc_tab', this.currentTab);
          localStorage.setItem('supervisor_active_section', 'financial');
        }
      } catch (e) {
        console.warn('LocalStorage write failed:', e);
      }
    }

    this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** خواندن وضعیت فیلترها از پارامترهای آدرس مرورگر و LocalStorage */
  private syncStateFromUrl() {
    if (!this.router.url.split('?')[0].includes('/supervisor')) return;
    const params = this.router.parseUrl(this.router.url).queryParams;
    const p = parseSupervisorUrlParams(params);

    let tabChanged = false;
    if (p.tab !== this.currentTab) {
      this.currentTab = p.tab;
      this.selectedTasks.clear();
      this.selectedPoolTasks.clear();
      this.selectedDocTasks.clear();
      this.selectedDocPoolTasks.clear();
      tabChanged = true;
    }
    this.statusFilter = p.statusFilter;
    this.dateFilter = p.dateFilter;
    this.locationFilter = p.locationFilter;
    this.sortField = p.sortField;
    this.sortDirection = p.sortDirection;
    this.searchQuery = p.searchQuery;

    this.applyFilters();
    if (tabChanged || !this.initialLoadDone) {
      this.initialLoadDone = true;
      this.refreshCurrentTab();
    }
  }

  setTab(tab: string) {
    if (tab === 'my-tasks' || tab === 'pool' || tab === 'doc' || tab === 'doc-pool') {
      this.currentTab = tab;
      if (tab === 'my-tasks' || tab === 'pool') {
        this.lastCountTab = tab;
      } else {
        this.lastDocTab = tab;
      }
      this.clearAllSelections();
      this.updateUrlState();
      this.refreshCurrentTab();
    }
  }

  // ─── Touch / Long Press Handling for Counting Tasks ───
  private countLpCtrl = new SupervisorLongPressController();
  private docLpCtrl = new SupervisorLongPressController();

  onTaskPressStart(task: CountTask, event: PointerEvent) {
    if (!this.isTaskSelectable(task)) return;
    this.countLpCtrl.start(event, () => {
      this.toggleSelection(task.id);
      this.cdr.markForCheck();
    });
  }

  onTaskPressMove(event: PointerEvent) {
    this.countLpCtrl.move(event);
  }

  onTaskPressEnd() {
    this.countLpCtrl.end();
  }

  onTaskClick(task: CountTask, event: Event) {
    if (this.countLpCtrl.justLongPressed) {
      this.countLpCtrl.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.selectedTasks.size > 0 && this.isTaskSelectable(task)) {
      event.preventDefault();
      this.toggleSelection(task.id);
      return;
    }
    this.openCountingDetail(task);
  }

  onDocTaskPressStart(task: DocTask, event: PointerEvent) {
    if (!this.isTaskSelectable(task)) return;
    this.docLpCtrl.start(event, () => {
      this.toggleDocSelection(task.id);
      this.cdr.markForCheck();
    });
  }

  onDocTaskPressMove(event: PointerEvent) {
    this.docLpCtrl.move(event);
  }

  onDocTaskPressEnd() {
    this.docLpCtrl.end();
  }

  onDocTaskClick(task: DocTask, event: Event) {
    if (this.docLpCtrl.justLongPressed) {
      this.docLpCtrl.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.selectedDocTasks.size > 0) {
      event.preventDefault();
      this.toggleDocSelection(task.id);
      return;
    }
    this.openDocDetail(task);
  }

  togglePoolSelection(taskId: number) { if (this.selectedPoolTasks.has(taskId)) this.selectedPoolTasks.delete(taskId); else this.selectedPoolTasks.add(taskId); this.selectedPoolTasks = new Set(this.selectedPoolTasks); this.cdr.detectChanges(); }

  toggleAllPool(event: Event) { const chk = (event.target as HTMLInputElement).checked; if (chk) this.filteredPoolTasks.forEach(t => this.selectedPoolTasks.add(t.id)); else this.filteredPoolTasks.forEach(t => this.selectedPoolTasks.delete(t.id)); this.selectedPoolTasks = new Set(this.selectedPoolTasks); this.cdr.detectChanges(); }

  isAllPoolSelected() {
    return this.filteredPoolTasks.length > 0 && this.filteredPoolTasks.every(t => this.selectedPoolTasks.has(t.id));
  }

  async claimSelectedTasks() {
    if (this.selectedPoolTasks.size === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.toast.error('عملیات به عهده گرفتن نیازمند اتصال اینترنت است');
      return;
    }
    const whId = this.state.appState.activeWarehouseId;
    this.facade.claimCountTasks(Array.from(this.selectedPoolTasks), whId).subscribe({
      next: (res: any) => {
        this.toast.success(`${res.claimed_count} کالا با موفقیت به عهده گرفته شد`);
        this.selectedPoolTasks.clear();
        this.loadPoolTasks(false);
        this.setTab('my-tasks');
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || 'خطا در عملیات');
      }
    });
  }

  toggleSelection(taskId: number) { if (this.selectedTasks.has(taskId)) this.selectedTasks.delete(taskId); else this.selectedTasks.add(taskId); this.selectedTasks = new Set(this.selectedTasks); this.cdr.detectChanges(); }

  toggleAll(event?: Event) { const chk = (event?.target as HTMLInputElement)?.checked ?? !this.isAllSelected(); if (chk) this.filteredTasks.forEach(t => this.selectedTasks.add(t.id)); else this.filteredTasks.forEach(t => this.selectedTasks.delete(t.id)); this.selectedTasks = new Set(this.selectedTasks); this.cdr.detectChanges(); }

  isAllSelected() {
    return this.filteredTasks.length > 0 && this.filteredTasks.every(t => this.selectedTasks.has(t.id));
  }

  openApproveDialog() { if (this.selectedTasks.size === 0) return; this.approveNote = ""; this.showApproveDialog = true; this.cdr.detectChanges(); }

  cancelApprove() { this.showApproveDialog = false; this.approveNote = ""; this.cdr.detectChanges(); }

  confirmApprove() {
    if (this.selectedTasks.size === 0) return;
    const taskIds = Array.from(this.selectedTasks);
    const count = taskIds.length;
    const backupTasks = [...this.tasks];

    this.tasks = this.tasks.filter(t => !taskIds.includes(t.id));
    this.selectedTasks.clear();
    this.showApproveDialog = false;
    this.cdr.detectChanges();

    this.facade.approveCountTasks(taskIds, this.approveNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`تأیید ${count} کالا در صف ارسال آفلاین قرار گرفت.`);
        } else {
          this.toast.success(res?.message || `${count} کالا با موفقیت تایید شد`);
        }
        this.loadTasks(false, true);
      },
      error: (err: any) => {
        this.tasks = backupTasks;
        this.toast.error(err?.error?.error || 'خطا در تایید کالاها');
        this.loadTasks(false, true);
      }
    });
  }

  approveSingle(task: CountTask) { this.selectedTasks.clear(); this.selectedTasks.add(task.id); this.openApproveDialog(); }

  openRejectDialog(task: CountTask) { this.rejectingTask = task; this.rejectNote = ""; this.showRejectDialog = true; this.cdr.detectChanges(); }

  async closeRejectDialog() { this.showRejectDialog = false; this.rejectNote = ""; this.rejectingTask = null; this.cdr.detectChanges(); }

  confirmReject() {
    if (!this.rejectNote.trim()) {
      this.toast.error('لطفا دلیل رد کردن را بنویسید');
      return;
    }

    if (this.rejectingTask) {
      const taskId = this.rejectingTask.id;
      const backupTasks = [...this.tasks];
      this.tasks = this.tasks.filter(t => t.id !== taskId);
      this.selectedTasks.delete(taskId);
      this.showRejectDialog = false;
      this.cdr.detectChanges();

      this.facade.rejectCountTask(taskId, this.rejectNote).subscribe({
        next: (res: any) => {
          const isOffline = res?._offlinePending || !navigator.onLine;
          if (isOffline) {
            this.toast.info('ارجاع جهت بررسی مجدد در صف آفلاین ذخیره شد.');
          } else {
            this.toast.success(res?.message || 'کالا با موفقیت جهت بررسی مجدد ارجاع داده شد');
          }
          this.loadTasks(false, true);
        },
        error: (err: any) => {
          this.tasks = backupTasks;
          this.toast.error(err?.error?.error || 'خطا در انجام عملیات');
          this.loadTasks(false, true);
        }
      });
    }
  }

  openBulkRejectDialog() { if (this.selectedTasks.size === 0) return; this.bulkRejectNote = ""; this.showBulkRejectDialog = true; this.cdr.detectChanges(); }

  async cancelBulkReject() { this.showBulkRejectDialog = false; this.bulkRejectNote = ""; this.cdr.detectChanges(); }

  confirmBulkReject() {
    if (this.selectedTasks.size === 0) return;
    if (!this.bulkRejectNote.trim()) {
      this.toast.error('لطفا دلیل ارجاع را بنویسید');
      return;
    }

    const taskIds = Array.from(this.selectedTasks);
    const count = taskIds.length;
    const backupTasks = [...this.tasks];

    this.tasks = this.tasks.filter(t => !taskIds.includes(t.id));
    this.selectedTasks.clear();
    this.showBulkRejectDialog = false;
    this.cdr.detectChanges();

    this.facade.bulkRejectCountTasks(taskIds, this.bulkRejectNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`ارجاع ${count} کالا در صف ارسال آفلاین ذخیره شد.`);
        } else {
          this.toast.success(res?.message || `${count} کالا با موفقیت جهت بررسی مجدد ارجاع داده شد`);
        }
        this.loadTasks(false, true);
      },
      error: (err: any) => {
        this.tasks = backupTasks;
        this.toast.error(err?.error?.error || 'خطا در ارجاع کالاها');
        this.loadTasks(false, true);
      }
    });
  }

  openHistoryDialog(task: CountTask) { this.historyTask = task; this.showHistoryDialog = true; this.cdr.detectChanges(); }

  closeHistoryDialog() { this.showHistoryDialog = false; this.historyTask = null; this.cdr.detectChanges(); }

  approveSingleDoc(task: DocTask, event?: Event) { if (event) event.stopPropagation(); this.selectedDocTasks.clear(); this.selectedDocTasks.add(task.id); this.openDocApproveDialog(); }

  rejectSingleDoc(task: DocTask, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocTasks = new Set([task.id]);
    this.openDocRejectDialog();
  }

  claimSingleDocTask(task: DocTask, event?: Event) { if (event) event.stopPropagation(); this.selectedDocPoolTasks.clear(); this.selectedDocPoolTasks.add(task.id); this.claimSelectedDocTasks(); }

  claimSingleTask(task: CountTask, event?: Event) { if (event) event.stopPropagation(); this.selectedPoolTasks.clear(); this.selectedPoolTasks.add(task.id); this.claimSelectedTasks(); }

  // ════════════════════════════════════════════
  //  Doc Task Tab
  // ════════════════════════════════════════════

  loadDocTasks(showLoading = true, preserveState = false) {
    if (!preserveState) this.selectedDocTasks.clear();
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }

    const params: any = { as_role: 'doc_supervisor', page_size: 1000 };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.facade.loadDocTasksData(params).then(newDocTasks => {
      this.trackUpdates(this.docTasks, newDocTasks);
      this.docTasks = newDocTasks;
      this.applyFilters();
      if (preserveState) {
        const validIds = new Set(this.docTasks.map(t => t.id));
        this.selectedDocTasks = new Set(Array.from(this.selectedDocTasks).filter(id => validIds.has(id)));
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    }).catch(err => {
      if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
        this.toast.error('خطا در دریافت اطلاعات اسناد مالی');
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  toggleDocSelection(id: number) { if (this.selectedDocTasks.has(id)) this.selectedDocTasks.delete(id); else this.selectedDocTasks.add(id); this.selectedDocTasks = new Set(this.selectedDocTasks); this.cdr.detectChanges(); }

  toggleAllDoc(event?: Event) { const chk = (event?.target as HTMLInputElement)?.checked ?? !this.isAllDocSelected(); if (chk) this.filteredDocTasks.forEach(t => this.selectedDocTasks.add(t.id)); else this.filteredDocTasks.forEach(t => this.selectedDocTasks.delete(t.id)); this.selectedDocTasks = new Set(this.selectedDocTasks); this.cdr.detectChanges(); }

  isAllDocSelected() {
    return this.filteredDocTasks.length > 0 && this.filteredDocTasks.every(t => this.selectedDocTasks.has(t.id));
  }

  openDocApproveDialog() { if (this.selectedDocTasks.size === 0) return; this.docApproveNote = ""; this.showDocApproveDialog = true; this.cdr.detectChanges(); }

  cancelDocApprove() { this.showDocApproveDialog = false; this.docApproveNote = ""; this.cdr.detectChanges(); }

  confirmDocApprove() {
    if (this.selectedDocTasks.size === 0) return;
    const taskIds = Array.from(this.selectedDocTasks);
    const count = taskIds.length;
    const backupTasks = [...this.docTasks];

    this.docTasks = this.docTasks.filter(t => !taskIds.includes(t.id));
    this.selectedDocTasks.clear();
    this.showDocApproveDialog = false;
    this.cdr.detectChanges();

    this.facade.approveDocTasks(taskIds, this.docApproveNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`تأیید ${count} سند مالی در صف ارسال آفلاین قرار گرفت.`);
        } else {
          this.toast.success(res?.message || `${count} سند مالی با موفقیت تایید شد`);
        }
        this.loadDocTasks(false, true);
      },
      error: (err: any) => {
        this.docTasks = backupTasks;
        this.toast.error(err?.error?.error || 'خطا در تایید اسناد مالی');
        this.loadDocTasks(false, true);
      }
    });
  }

  openDocRejectDialog() {
    if (this.selectedDocTasks.size === 0) return;
    this.docRejectNote = '';
    this.showDocRejectDialog = true;
    this.cdr.detectChanges();
  }

  async closeDocRejectDialog() {
    if (this.docRejectNote.trim()) {
      const ok = await this.confirmDialog.open({
        title: 'انصراف از رد مدارک',
        message: 'متن یادداشت ذخیره نشده است. آیا مایل به بستن پنجره هستید؟',
        type: 'warning'
      });
      if (!ok) return;
    }
    this.showDocRejectDialog = false;
    this.docRejectNote = '';
    this.cdr.detectChanges();
  }

  confirmDocReject() {
    if (!this.docRejectNote.trim()) {
      this.toast.error('لطفاً دلیل رد را بنویسید');
      return;
    }

    const taskIds = Array.from(this.selectedDocTasks);
    const count = taskIds.length;
    const backupTasks = [...this.docTasks];
    this.docTasks = this.docTasks.filter(t => !taskIds.includes(t.id));
    this.selectedDocTasks.clear();
    this.showDocRejectDialog = false;
    this.cdr.detectChanges();

    this.facade.bulkRejectDocTasks(taskIds, this.docRejectNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`رد ${count} سند در صف آفلاین ذخیره شد.`);
        } else {
          this.toast.success(res?.message || `${count} سند با موفقیت رد شد`);
        }
        this.loadDocTasks(false, true);
      },
      error: (err: any) => {
        this.docTasks = backupTasks;
        this.toast.error(err?.error?.error || 'خطا در رد اسناد');
        this.loadDocTasks(false, true);
      }
    });
  }

  // ════════════════════════════════════════════
  //  Doc Pool Tab
  // ════════════════════════════════════════════

  loadDocPoolTasks(showLoading = true, preserveState = false) {
    if (!preserveState) this.selectedDocPoolTasks.clear();
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }

    const params: any = { as_role: 'doc_supervisor' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.facade.loadDocPoolTasksData(params).then(res => {
      this.trackUpdates(this.docPoolTasks, res);
      this.docPoolTasks = res;
      this.applyFilters();
      if (preserveState) {
        const validIds = new Set(this.docPoolTasks.map(t => t.id));
        this.selectedDocPoolTasks = new Set(Array.from(this.selectedDocPoolTasks).filter(id => validIds.has(id)));
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    }).catch(err => {
      if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
        this.toast.error('خطا در دریافت اطلاعات استخر اسناد');
      }
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  toggleDocPoolSelection(id: number) { if (this.selectedDocPoolTasks.has(id)) this.selectedDocPoolTasks.delete(id); else this.selectedDocPoolTasks.add(id); this.selectedDocPoolTasks = new Set(this.selectedDocPoolTasks); this.cdr.detectChanges(); }

  toggleAllDocPool(event: Event) { const chk = (event.target as HTMLInputElement).checked; if (chk) this.filteredDocPoolTasks.forEach(t => this.selectedDocPoolTasks.add(t.id)); else this.filteredDocPoolTasks.forEach(t => this.selectedDocPoolTasks.delete(t.id)); this.selectedDocPoolTasks = new Set(this.selectedDocPoolTasks); this.cdr.detectChanges(); }

  isAllDocPoolSelected() {
    return this.filteredDocPoolTasks.length > 0 && this.filteredDocPoolTasks.every(t => this.selectedDocPoolTasks.has(t.id));
  }

  async claimSelectedDocTasks() {
    if (this.selectedDocPoolTasks.size === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.toast.error('عملیات به عهده گرفتن نیازمند اتصال اینترنت است');
      return;
    }
    const whId = this.state.appState.activeWarehouseId;
    this.facade.claimDocTasks(Array.from(this.selectedDocPoolTasks), whId).subscribe({
      next: (res: any) => {
        this.toast.success(`${res.claimed_count} سند با موفقیت به عهده گرفته شد`);
        this.selectedDocPoolTasks.clear();
        this.loadDocPoolTasks(false);
        this.setTab('doc');
      },
      error: (err: any) => {
        this.toast.error(err?.error?.error || 'خطا در عملیات');
      }
    });
  }

  // Export Methods
  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.currentSelectedTasks.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
    
    // We fetch columns dynamically based on the active section (Count vs Doc)
    const api = this.activeSection === 'counting' ? this.countTaskApi : this.docTaskApi;
    api.getExportColumns().subscribe({
      next: (cols) => {
        this.availableExportColumns = cols;
        this.cdr.detectChanges();
      }
    });
  }

  closeExportModal() {
    this.isExporting = false;
    this.isExportModalOpen = false;
    if (this.exportSubscription) {
      this.exportSubscription.unsubscribe();
      this.exportSubscription = undefined;
    }
    this.cdr.detectChanges();
  }

  onDataScopeChange(scope: string) {
    if (scope === 'all') {
      this.exportColumnScope = 'all_db';
    } else if (scope === 'selected') {
      this.exportColumnScope = 'visible';
    }
  }

  executeExport() {
    this.isExporting = true;
    const isCount = this.activeSection === 'counting';
    const role = isCount ? 'supervisor' : 'doc_supervisor';

    const payload: any = {
      data_scope: this.exportDataScope,
      columns_scope: this.exportColumnScope,
      as_role: role,
    };
    if (this.exportDataScope === 'selected') {
      payload.selected_ids = Array.from(this.currentSelectedTasks);
    }
    if (this.exportColumnScope === 'custom') {
      payload.columns_list = Array.from(this.selectedExportColumns);
    }
    const params: any = { as_role: role };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;
    if (this.searchQuery && this.searchQuery.trim()) params.q = this.searchQuery.trim();
    if (this.statusFilter && this.statusFilter !== 'all') params.status = this.statusFilter;
    if (this.dateFilter && this.dateFilter !== 'all') params.date = this.dateFilter;

    if ((this.currentTab === 'pool' || this.currentTab === 'doc-pool') && this.exportDataScope === 'all') {
      payload.selected_ids = this.currentTab === 'pool' ? this.poolTasks.map(t => t.id) : this.docPoolTasks.map(t => t.id);
      payload.data_scope = 'selected';
    }

    this.exportSubscription = this.facade.exportExcel(isCount, payload, params).subscribe({
      next: (blob) => {
        downloadBlob(blob, `export_supervisor_${role}_${new Date().getTime()}.xlsx`);
        this.isExporting = false;
        this.closeExportModal();
        this.toast.success('خروجی اکسل با موفقیت دانلود شد.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل خروجی');
        this.isExporting = false;
        this.cdr.detectChanges();
      }
    });
  }

}
