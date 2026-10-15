import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, filter, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DocTaskApiService } from '../../api/doc-task-api.service';
import { ItemApiService } from '../../api/item-api.service';
import { DynamicFieldApiService } from '../../api/dynamic-field-api.service';
import { SettingsService } from '../../../../core/services/settings';
import { DocTaskStore } from '../../services/doc-task-store';
import { DocTask, DocTaskStatus, INVOICE_TYPE_LABELS, CURRENCY_LABELS } from '../../../../core/models/doc-task.model';
import { 
  FieldPermissionConfig, 
  mergeDocFieldPermissions 
} from '../../../../core/models/field-config.model';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../core/services/state.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { WarehouseSelectorComponent } from '../../../../shared/components/warehouse-selector/warehouse-selector.component';
import { OfflinePendingBadgeComponent } from '../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { ItemPhotoGalleryComponent } from '../item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../item-photo-gallery/photo-gallery-host';
import { environment } from '../../../../../environments/environment';
import { Router, NavigationEnd } from '@angular/router';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { offlineDb } from '../../../../core/services/offline-db';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { ParsedScanRow, ParsedScanRowStatus, ParsedScanFieldChange, ScanBatchSummary } from './customs-scanner.types';
import { CustomsScannerParser } from './customs-scanner-parser';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';
import { CustomsFacade } from './customs.facade';
import {
  DOC_TASK_DIRECT_KEYS,
  normalizeText,
  convertPersianKeyboardToEnglish,
  normalizeDigits,
  isFinancialField,
  formatNumberWithCommas,
  decodeDelimiter,
  isDateValid,
  convertToShamsiDateString,
  getFieldLabel,
  getFieldDisplayValue,
  hasDocData,
  isTaskReady,
  isTaskSelectable,
  getStatusLabel,
  getActionTypeLabel,
  getStatusColor,
  filterCustomsTasks,
  filterCustomsPoolTasks,
  matchesDocTaskBarcode,
  downloadBlob,
  sortTaskHistory,
  populateTaskEditableValues,
  handleCustomsKeydownEvent,
  calculateCustomsTotalValue,
  getTodayShamsiDate
} from './customs.helpers';

@Component({
  selector: 'app-customs',
  standalone: true,
  imports: [CommonModule, FormsModule, PersianDatePipe, WarehouseSelectorComponent, OfflinePendingBadgeComponent, BarcodeScannerComponent, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent],
  providers: [CustomsFacade],
  templateUrl: './customs.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Customs implements OnInit, OnDestroy {
  // آرایه فقط با تغییر شمار مخزن عوض می‌شود تا app-tab-bar (OnPush) در هر دور تشخیص تغییر بازرسم نشود.
  private customsTabsPoolCount = -1;
  private customsTabsCache: TabDef[] = [];

  get customsTabs(): TabDef[] {
    const poolCount = this.poolTasks.length;
    if (poolCount !== this.customsTabsPoolCount) {
      this.customsTabsPoolCount = poolCount;
      this.customsTabsCache = [
        { id: 'my-tasks', label: 'تسک‌های من', shortLabel: 'تسک‌ها', icon: 'clipboard' },
        { id: 'pool', label: 'مخزن اسناد', shortLabel: 'مخزن', icon: 'folder', count: poolCount || undefined },
      ];
    }
    return this.customsTabsCache;
  }

  tasks: DocTask[] = [];
  poolTasks: DocTask[] = [];

  // ── وضعیت مودال گالری تصاویر کالا ──
  readonly photoGallery = new PhotoGalleryHost(msg => this.toast.warning(msg));

  /**
   * `countTaskId` فرستاده نمی‌شود: ردیف‌های این صفحه DocTask هستند و آن ورودی
   * به CountTask اشاره دارد. نسخهٔ قبلی شناسهٔ DocTask را در آن می‌گذاشت.
   */
  onPhotosChanged(photos: any[]): void {
    this.photoGallery.apply(photos, this.tasks, this.poolTasks, this.selectedTask);
    this.cdr.markForCheck();
  }
  isLoading = true;
  selectedTask: DocTask | null = null;
  selectedTasks = new Set<number>();
  selectedPoolTasks = new Set<number>();
  currentTab: 'my-tasks' | 'pool' = 'my-tasks';

  isSaving = false;
  isSubmitting = false;

  // ── Dynamic Field Permissions State ────────────────────────────────────────
  fieldConfigs: FieldPermissionConfig[] = [];
  editableValues: Record<string, any> = {};
  dynamicFieldsList: any[] = [];
  f_worker_note = '';
  private initialFormSnapshot = '';

  // ── Performance Metrics & Status Counts ──
  totalTasksCount = 0;
  completedTasksCount = 0;
  remainingTasksCount = 0;

  statusCounts = {
    untouched: 0,
    rejected: 0,
    ready: 0,
    completed: 0,
    all: 0
  };

  // ── Filters & Sorting ──
  statusFilter: 'untouched' | 'rejected' | 'ready' | 'completed' | 'all' = 'untouched';
  dateFilter: 'all' | 'today' | 'yesterday' | 'week' = 'all';
  locationFilter = 'all';
  sortBy: 'updated_at' | 'fa_unic_code' | 'description' | 'po' | 'inv_rti_number' = 'updated_at';
  sortDirection: 'asc' | 'desc' = 'desc';
  isSortMenuOpen = false;
  searchQuery = '';
  filteredTasks: DocTask[] = [];
  filteredPoolTasks: DocTask[] = [];
  searchSubject = new Subject<string>();
  private initialLoadDone = false;

  readonly invoiceTypes = Object.entries(INVOICE_TYPE_LABELS);
  readonly currencies = Object.entries(CURRENCY_LABELS);

  private pullSub: Subscription | null = null;
  private scanBusy = false;

  // Export Modal State
  isExportModalOpen = false;
  exportDataScope: 'all' | 'selected' = 'all';
  exportColumnScope: 'all_db' | 'visible' | 'custom' = 'all_db';
  selectedExportColumns: Set<string> = new Set();
  isExporting = false;
  exportSubscription?: Subscription;
  availableExportColumns: {key: string, label: string}[] = [];
  isDownloadingTemplate = false;

  // Batch Scan Modal State
  isScanBatchModalOpen = false;
  scanBatchSummary: ScanBatchSummary | null = null;
  isApplyingBatchUpdate = false;
  activeScanFilterTab: 'all' | 'ready' | 'pool' | 'readonly' | 'not_found' = 'all';
  scannerRowSep = ';';
  scannerColSep = '|';
  scannerCameraPreset = 'adaptive';

  private routerSub?: Subscription;
  private wsSub?: Subscription;
  private swrSub?: Subscription;
  private offlineSync = OfflineSyncService.getInstance();

  updatedTaskIds = new Set<number>();
  flashTimeout: any;
  tasksLoaded = false;
  poolTasksLoaded = false;
  needsRefresh = false;

  financialCanViewHistory = true;
  financialCanViewPreviousNotes = true;

  private barcodeBuffer = '';
  private lastKeyTime = 0;

  @ViewChild(BarcodeScannerComponent) scanner?: BarcodeScannerComponent;

  constructor(
    private docTaskApi: DocTaskApiService,
    private itemApi: ItemApiService,
    private dynamicFieldApi: DynamicFieldApiService,
    private settingsService: SettingsService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    public state: StateService,
    private auth: AuthService,
    public authStore: AuthStore,
    private store: DocTaskStore,
    private router: Router,
    private wsService: WebSocketService,
    private facade: CustomsFacade
  ) {}

  private get activeWarehouseId(): number | null {
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && Number(whId) !== -1) return Number(whId);
    return null;
  }

  private get localFirst(): boolean {
    return (
      (environment as any).useLocalFirstDoc === true &&
      this.activeWarehouseId !== null &&
      this.currentUserId !== null
    );
  }

  private get currentUserId(): number | null {
    const id = this.auth.user()?.id;
    return typeof id === 'number' ? id : null;
  }

  // ════════════════════════════════════════════
  //  Lifecycle
  // ════════════════════════════════════════════

  ngOnInit() {
    this.loadFieldPermissions();

    this.pullSub = this.store.pull.pullCompleted$.subscribe(({ warehouseId }) => {
      if (this.localFirst && warehouseId === this.activeWarehouseId && !this.selectedTask) {
        this.readFromLocal(false);
      }
    });

    // ── URL State: خواندن استیت از آدرس مرورگر ──
    this.syncStateFromUrl();
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => this.syncStateFromUrl());

    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (data.type === 'doc_task_update' || data.event === 'doc_task_update') {
        if (data.warehouse_id && this.activeWarehouseId && Number(data.warehouse_id) !== this.activeWarehouseId) {
          return;
        }
        if (!this.selectedTask) {
          if (this.localFirst) {
            this.store.refresh(this.activeWarehouseId!);
          } else if (this.currentTab === 'my-tasks') {
            this.loadTasks(false);
          } else {
            this.loadPoolTasks(false);
          }
        } else {
          this.needsRefresh = true;
        }
      }
    });

    // ─── SWR Live Revalidation: دریافت داده‌های جدیدتر سرور در پس‌زمینه ───
    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      if (url.includes('/api/inventory/doc-tasks/') && data) {
        if (!this.selectedTask) {
          const freshList = Array.isArray(data) ? data : data.results || [];
          if (freshList.length > 0) {
            const isPoolUrl = url.includes('/pool_tasks/');
            if (isPoolUrl && this.currentTab === 'pool') {
              this.trackUpdates(this.poolTasks, freshList);
              this.poolTasks = freshList;
              this.applyFilters();
              this.cdr.detectChanges();
            } else if (!isPoolUrl && this.currentTab === 'my-tasks') {
              this.trackUpdates(this.tasks, freshList);
              this.tasks = freshList;
              this.applyFilters();
              this.cdr.detectChanges();
            }
            console.log('[Customs] ⚡ داده‌های کارتابل مالی با استعلام پس‌زمینه SWR به‌روزرسانی شد.');
          }
        } else {
          this.needsRefresh = true;
        }
      }
    });

    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(q => {
      this.router.navigate([], { queryParams: { q: q || null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  ngOnDestroy() {
    this.pullSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.swrSub?.unsubscribe();
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
  }

  private trackUpdates(oldList: any[], newList: any[]) {
    const oldMap = new Map(oldList.map((t: any) => [t.id, t]));
    let hasUpdates = false;

    for (const t of newList) {
      const oldItem = oldMap.get(t.id);
      if (!oldItem || oldItem.status !== t.status) {
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

  // ════════════════════════════════════════════
  //  Filters & Search
  // ════════════════════════════════════════════

  normalizeText(str: string | null | undefined): string { return normalizeText(str); }
  hasDocData(task: DocTask | null): boolean { return hasDocData(task); }
  isTaskReady(task: DocTask): boolean { return isTaskReady(task, t => this.isReadOnly(t)); }
  isTaskSelectable(task: DocTask): boolean { return isTaskSelectable(task, t => this.isReadOnly(t)); }

  get availableLocations(): string[] {
    const locSet = new Set<string>();
    const sourceList = this.currentTab === 'my-tasks' ? this.tasks : this.poolTasks;
    sourceList.forEach(t => {
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim();
      if (loc) {
        const part = loc.split(/[-_\s/]/)[0];
        if (part) locSet.add(part);
      }
    });
    return Array.from(locSet).sort((a, b) => a.localeCompare(b, 'fa', { sensitivity: 'base' }));
  }

  setLocationFilter(loc: string) {
    this.locationFilter = loc;
    this.selectedTasks.clear();
    this.applyFilters();
    this.cdr.detectChanges();
  }

  applyFilters() {
    const res = filterCustomsTasks(
      this.tasks,
      this.searchQuery,
      this.statusFilter,
      this.dateFilter,
      this.locationFilter,
      this.sortBy,
      this.sortDirection,
      t => this.isTaskReady(t),
      t => this.hasDocData(t)
    );
    this.totalTasksCount = res.totalCount;
    this.completedTasksCount = res.completedCount;
    this.remainingTasksCount = res.remainingCount;
    this.statusCounts = res.statusCounts;
    this.filteredTasks = res.filteredTasks;

    this.filteredPoolTasks = filterCustomsPoolTasks(
      this.poolTasks,
      this.searchQuery,
      this.locationFilter,
      this.sortBy,
      this.sortDirection
    );
  }

  setStatusFilter(f: 'untouched' | 'rejected' | 'ready' | 'completed' | 'all') {
    this.statusFilter = f;
    this.selectedTasks.clear();
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setDateFilter(df: 'all' | 'today' | 'yesterday' | 'week') {
    this.dateFilter = df;
    this.selectedTasks.clear();
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setSortBy(s: 'updated_at' | 'fa_unic_code' | 'description' | 'po' | 'inv_rti_number') {
    this.sortBy = s;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  private updateUrlState() {
    this.router.navigate([], {
      queryParams: {
        tab: this.currentTab !== 'my-tasks' ? this.currentTab : null,
        status: this.statusFilter !== 'untouched' ? this.statusFilter : null,
        date: this.dateFilter !== 'all' ? this.dateFilter : null,
        sort: this.sortBy !== 'updated_at' ? this.sortBy : null,
        q: this.searchQuery || null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  getSortLabel(): string {
    const map: Record<string, string> = {
      updated_at: 'آخرین تغییر',
      fa_unic_code: 'کد کالا',
      description: 'شرح کالا',
      po: 'شماره PO',
      inv_rti_number: 'شماره RTI/فاکتور'
    };
    return map[this.sortBy] || 'آخرین تغییر';
  }

  toggleSortMenu(e?: Event) {
    if (e) e.stopPropagation();
    this.isSortMenuOpen = !this.isSortMenuOpen;
    this.cdr.detectChanges();
  }

  closeSortMenu() {
    if (this.isSortMenuOpen) {
      this.isSortMenuOpen = false;
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeSortMenu();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    handleCustomsKeydownEvent(event, this);
  }

  toggleSortDirection() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setSort(field: 'updated_at' | 'fa_unic_code' | 'description' | 'po' | 'inv_rti_number') {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = (field === 'fa_unic_code' || field === 'description' || field === 'po' || field === 'inv_rti_number') ? 'asc' : 'desc';
    }
    this.isSortMenuOpen = false;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  triggerCameraScan() {
    this.scanner?.openCamera();
  }

  isReadOnly(task: DocTask | null): boolean {
    if (!task) return false;
    return ['DOC_PROCESSED', 'DOC_MANAGER_REVIEW', 'DOC_FINAL_APPROVED'].includes(task.status);
  }

  trackByTaskId(index: number, task: DocTask): string | number {
    return task?.id ?? task?.sync_id ?? (task as any)?._offlineId ?? index;
  }

  trackByFieldKey(index: number, field: FieldPermissionConfig): string {
    return field.key;
  }

  trackByColKey(index: number, col: { key: string; label: string }): string {
    return col.key;
  }

  trackByHistoryId(index: number, h: any): string | number {
    return h?.id ?? h?.created_at ?? index;
  }

  trackByScanRow(index: number, row: any): string | number {
    return row?.rowIndex ?? row?.unicCode ?? index;
  }

  clearAllSelections() {
    this.selectedTasks.clear();
    this.cdr.detectChanges();
  }

  toggleAll() {
    this.toggleSelectAll();
  }

  async submitSelected() {
    await this.submitAll();
  }

  refreshCurrentTab() {
    if (this.currentTab === 'my-tasks') {
      this.loadTasks();
    } else {
      this.loadPoolTasks();
    }
  }

  onSearchChange(val: string) {
    this.searchQuery = val;
    this.applyFilters();
    this.searchSubject.next(val);
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilters();
    this.searchSubject.next('');
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  onSearchEnter() {
    if (this.searchQuery && this.filteredTasks.length === 1) {
      this.openDetail(this.filteredTasks[0]);
    }
  }

  // ════════════════════════════════════════════
  //  Local-First
  // ════════════════════════════════════════════

  private async readFromLocal(showLoading = true) {
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    try {
      if (this.currentTab === 'my-tasks') {
        const newTasks = await this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!);
        this.trackUpdates(this.tasks, newTasks);
        this.tasks = newTasks;
        this.tasksLoaded = true;
        this.applyFilters();
        this.checkPendingUrlTask();
      } else {
        const newPoolTasks = await this.store.getPoolTasks(this.activeWarehouseId!);
        this.trackUpdates(this.poolTasks, newPoolTasks);
        this.poolTasks = newPoolTasks;
        this.poolTasksLoaded = true;
        this.applyFilters();
        this.checkPendingUrlTask();
      }
    } catch (e) {
      console.error('[Customs] خطا در خواندن از Dexie:', e);
    }
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════
  //  Load (Server fallback)
  // ════════════════════════════════════════════

  async loadTasks(showLoading = true) {
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    try {
      const newTasks = await this.facade.loadTasksData();
      this.trackUpdates(this.tasks, newTasks);
      this.tasks = newTasks;
      this.tasksLoaded = true;
      this.applyFilters();
      this.checkPendingUrlTask();
    } catch {
      this.toast.error('خطا در دریافت اطلاعات');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadPoolTasks(showLoading = true) {
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    try {
      const newPoolTasks = await this.facade.loadPoolTasksData();
      this.trackUpdates(this.poolTasks, newPoolTasks);
      this.poolTasks = newPoolTasks;
      this.poolTasksLoaded = true;
      this.applyFilters();
      this.checkPendingUrlTask();
    } catch {
      this.toast.error('خطا در دریافت تسک‌های استخر');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }


  /** خواندن تب فعال و فیلترها از پارامترهای آدرس مرورگر */
  private syncStateFromUrl() {
    if (!this.router.url.split('?')[0].includes('/customs')) return;
    const params = this.router.parseUrl(this.router.url).queryParams;
    
    // 1. Sync Tab
    const tab = params['tab'] as typeof this.currentTab;
    const validTabs: typeof this.currentTab[] = ['my-tasks', 'pool'];
    const resolved = validTabs.includes(tab) ? tab : 'my-tasks';
    let tabChanged = false;
    if (resolved !== this.currentTab) {
      this.currentTab = resolved;
      this.selectedTasks.clear();
      this.selectedPoolTasks.clear();
      tabChanged = true;
    }

    // 2. Sync Status Filter
    const statusParam = params['status'];
    const validStatuses = ['untouched', 'rejected', 'ready', 'completed', 'all'];
    if (statusParam && validStatuses.includes(statusParam)) {
      this.statusFilter = statusParam as any;
    } else if (statusParam === 'pending') {
      this.statusFilter = 'untouched';
    } else if (statusParam === 'processing') {
      this.statusFilter = 'completed';
    }

    // 3. Sync Date Filter
    const dateParam = params['date'];
    const validDates = ['all', 'today', 'yesterday', 'week'];
    if (dateParam && validDates.includes(dateParam)) {
      this.dateFilter = dateParam as any;
    }

    // 4. Sync Sort By
    const sortParam = params['sort'];
    const validSorts = ['updated_at', 'fa_unic_code', 'description', 'po', 'inv_rti_number'];
    if (sortParam && validSorts.includes(sortParam)) {
      this.sortBy = sortParam as any;
    }

    // 5. Sync Search Query
    const q = params['q'] || '';
    if (q !== this.searchQuery) {
      this.searchQuery = q;
    }

    // 6. Apply Filters & Load Data only if needed
    this.applyFilters();

    if (tabChanged || !this.initialLoadDone) {
      this.initialLoadDone = true;
      if (resolved === 'my-tasks') this.loadTasks(!this.tasksLoaded);
      else this.loadPoolTasks(!this.poolTasksLoaded);
    } else {
      this.checkPendingUrlTask();
    }
  }

  private checkPendingUrlTask() {
    const params = this.router.parseUrl(this.router.url).queryParams;
    const taskIdParam = params['taskId'] || params['task_id'];
    if (taskIdParam) {
      const targetId = Number(taskIdParam);
      if (!this.selectedTask || this.selectedTask.id !== targetId) {
        const found = this.tasks.find(t => t.id === targetId) || this.poolTasks.find(t => t.id === targetId);
        if (found) {
          this.openDetail(found, false);
        }
      }
    }
  }

  setTab(tab: string) {
    if (tab === 'my-tasks' || tab === 'pool') {
      this.selectedTasks.clear();
      this.selectedPoolTasks.clear();
      this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
    }
  }

  // ════════════════════════════════════════════
  //  Selection & Select All
  // ════════════════════════════════════════════

  toggleSelection(taskId: number) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task && !this.isTaskSelectable(task) && !this.selectedTasks.has(taskId)) {
      this.toast.warning('این کالا فاقد مدرک مالی است و قابل انتخاب برای ارسال گروهی نمی‌باشد.');
      return;
    }
    if (this.selectedTasks.has(taskId)) this.selectedTasks.delete(taskId);
    else this.selectedTasks.add(taskId);
    this.cdr.detectChanges();
  }

  togglePoolSelection(taskId: number) {
    if (this.selectedPoolTasks.has(taskId)) this.selectedPoolTasks.delete(taskId);
    else this.selectedPoolTasks.add(taskId);
    this.cdr.detectChanges();
  }

  isAllSelected(): boolean {
    const eligible = this.filteredTasks.filter(t => this.isTaskSelectable(t));
    if (eligible.length === 0) return false;
    return eligible.every(t => this.selectedTasks.has(t.id));
  }

  isIndeterminate(): boolean {
    const eligible = this.filteredTasks.filter(t => this.isTaskSelectable(t));
    const count = eligible.filter(t => this.selectedTasks.has(t.id)).length;
    return count > 0 && count < eligible.length;
  }

  toggleSelectAll() {
    const eligible = this.filteredTasks.filter(t => this.isTaskSelectable(t));
    if (this.isAllSelected()) {
      eligible.forEach(t => this.selectedTasks.delete(t.id));
    } else {
      eligible.forEach(t => this.selectedTasks.add(t.id));
    }
    this.cdr.detectChanges();
  }

  isAllPoolSelected(): boolean {
    if (this.filteredPoolTasks.length === 0) return false;
    return this.filteredPoolTasks.every(t => this.selectedPoolTasks.has(t.id));
  }

  isPoolIndeterminate(): boolean {
    const count = this.filteredPoolTasks.filter(t => this.selectedPoolTasks.has(t.id)).length;
    return count > 0 && count < this.filteredPoolTasks.length;
  }

  toggleSelectAllPool() {
    if (this.isAllPoolSelected()) {
      this.filteredPoolTasks.forEach(t => this.selectedPoolTasks.delete(t.id));
    } else {
      this.filteredPoolTasks.forEach(t => this.selectedPoolTasks.add(t.id));
    }
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════
  //  Field Permissions & Dynamic Fields
  // ════════════════════════════════════════════

  async loadFieldPermissions() {
    const res = await this.facade.loadFieldPermissions();
    this.fieldConfigs = res.fieldConfigs;
    this.dynamicFieldsList = res.dynamicFieldsList;
    this.financialCanViewHistory = res.financialCanViewHistory;
    this.financialCanViewPreviousNotes = res.financialCanViewPreviousNotes;
    this.scannerCameraPreset = res.scannerCameraPreset;
    this.scannerRowSep = res.scannerRowSep;
    this.scannerColSep = res.scannerColSep;
    this.cdr.detectChanges();
  }

  decodeDelimiter(val: string): string {
    return decodeDelimiter(val);
  }


  canViewRecordNote(index: number): boolean {
    if (!this.financialCanViewHistory) return false;
    if (this.financialCanViewPreviousNotes) return true;
    return index === 0;
  }

  get visibleInfoFields(): FieldPermissionConfig[] {
    return this.fieldConfigs.filter(f => 
      f.visible && 
      !f.editable && 
      f.key !== 'worker_note'
    );
  }

  get editableFormFields(): FieldPermissionConfig[] {
    return this.fieldConfigs.filter(f => 
      f.visible && 
      f.editable && 
      f.key !== 'worker_note'
    );
  }

  get isWorkerNoteVisible(): boolean {
    const noteField = this.fieldConfigs.find(f => f.key === 'worker_note');
    return noteField ? noteField.visible : true;
  }

  get workerNoteLabel(): string {
    const noteField = this.fieldConfigs.find(f => f.key === 'worker_note');
    return (noteField?.custom_label?.trim()) || 'یادداشت کارشناس مالی';
  }

  getFieldLabel(field: FieldPermissionConfig): string { return getFieldLabel(field); }
  getFieldDisplayValue(field: FieldPermissionConfig, item: any): string { return getFieldDisplayValue(field, item); }

  // ════════════════════════════════════════════
  //  Financial Helpers & Formatting
  // ════════════════════════════════════════════

  isFinancialField(key: string): boolean { return isFinancialField(key); }
  formatNumberWithCommas(val: any): string { return formatNumberWithCommas(val); }
  normalizeDigits(val: string): string { return normalizeDigits(val); }

  onPriceChange(fieldKey: string, val: string) {
    if (!val) {
      this.editableValues[fieldKey] = '';
      return;
    }
    const norm = this.normalizeDigits(val);
    const clean = String(norm).replace(/,/g, '').replace(/[^\d.]/g, '');
    this.editableValues[fieldKey] = this.formatNumberWithCommas(clean);
  }

  getNumericValue(key: string): number {
    const val = this.editableValues[key];
    if (!val) return 0;
    const clean = this.normalizeDigits(val).replace(/,/g, '').trim();
    return Number(clean) || 0;
  }

  calculateTotalValue() {
    calculateCustomsTotalValue(this.editableValues, { formatNumberWithCommas: this.formatNumberWithCommas });
  }

  setTodayDate(fieldKey: string) {
    this.editableValues[fieldKey] = getTodayShamsiDate();
    this.cdr.detectChanges();
  }

  isDateValid(val: string): boolean { return isDateValid(val); }

  // ════════════════════════════════════════════
  //  Long Press & Multi-Select UX
  // ════════════════════════════════════════════
  pressTimeout: any;
  justLongPressed = false;
  initialTouchY = 0;
  initialTouchX = 0;

  onTaskPressStart(task: DocTask, event: PointerEvent) {
    if (!this.isTaskSelectable(task)) return;
    this.initialTouchY = event.clientY;
    this.initialTouchX = event.clientX;
    
    this.pressTimeout = setTimeout(() => {
      this.pressTimeout = null;
      this.justLongPressed = true;
      if (!this.selectedTasks.has(task.id)) {
        this.selectedTasks.add(task.id);
      } else {
        this.selectedTasks.delete(task.id);
      }
      this.cdr.markForCheck();
      if (navigator.vibrate) navigator.vibrate(50);
    }, 450);
  }

  onTaskPressMove(event: PointerEvent) {
    if (this.pressTimeout) {
      if (Math.abs(event.clientY - this.initialTouchY) > 10 || Math.abs(event.clientX - this.initialTouchX) > 10) {
        clearTimeout(this.pressTimeout);
        this.pressTimeout = null;
      }
    }
  }

  onTaskPressEnd() {
    if (this.pressTimeout) {
      clearTimeout(this.pressTimeout);
      this.pressTimeout = null;
    }
  }

  onTaskClick(task: DocTask, event: Event) {
    if (this.justLongPressed) {
      this.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // اگر در حالت انتخاب چندتایی هستیم، کلیک تیک را فعال/غیرفعال می‌کند
    if (this.selectedTasks.size > 0) {
      if (!this.isReadOnly(task)) {
        if (this.selectedTasks.has(task.id)) {
          this.selectedTasks.delete(task.id);
        } else {
          this.selectedTasks.add(task.id);
        }
      }
      this.cdr.detectChanges();
      return;
    }

    this.openDetail(task);
  }

  /** بازگرداندن هوشمند کالا و لغو پیش‌نویس به وضعیت پیشین */
  async revertTaskStatus(task: DocTask, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!task || this.isReadOnly(task)) return;
    const ok = await this.facade.revertTaskStatus(task);
    if (ok) {
      task.status = 'PENDING_DOC';
      if (this.selectedTask && this.selectedTask.id === task.id) {
        this.closeDetail(true);
      }
      this.selectedTasks.delete(task.id);
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════
  //  Detail Panel
  // ════════════════════════════════════════════

  convertToShamsiDateString(val: any): string { return convertToShamsiDateString(val); }

  openDetail(task: DocTask, updateUrl = true) {
    this.selectedTask = task;
    sortTaskHistory(task);
    const populated = populateTaskEditableValues(task, this.editableFormFields);
    this.editableValues = populated.editableValues;
    this.f_worker_note = populated.workerNote;
    this.initialFormSnapshot = populated.snapshot;

    if (updateUrl) {
      this.router.navigate([], { queryParams: { taskId: task.id }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    this.cdr.detectChanges();
  }

  async closeDetail(force = false) {
    if (!force && this.hasUnsavedChanges()) {
      const confirmed = await this.confirmDialog.open({
        title: 'تغییرات ذخیره‌نشده',
        message: 'تغییراتی در فرم اسناد اعمال شده که هنوز ذخیره نشده‌اند. آیا از خروج و صرف‌نظر از تغییرات اطمینان دارید؟',
        confirmText: 'بله، خارج شو', cancelText: 'ادامه ویرایش', type: 'warning'
      });
      if (!confirmed) return;
    }

    this.selectedTask = null;
    this.initialFormSnapshot = '';
    this.router.navigate([], { queryParams: { taskId: null }, queryParamsHandling: 'merge', replaceUrl: true });

    if (this.needsRefresh) {
      this.needsRefresh = false;
      if (this.localFirst) {
        this.store.refresh(this.activeWarehouseId!);
      } else if (this.currentTab === 'my-tasks') {
        this.loadTasks(false);
      } else {
        this.loadPoolTasks(false);
      }
    }

    this.cdr.detectChanges();
    this.scanner?.focusInput();
  }

  hasUnsavedChanges(): boolean {
    if (!this.selectedTask || !this.initialFormSnapshot) return false;
    const currentSnapshot = JSON.stringify({ values: this.editableValues, note: this.f_worker_note });
    return currentSnapshot !== this.initialFormSnapshot;
  }

  isRejected(task: DocTask | null): boolean {
    if (!task) return false;
    return task.status === 'DOC_SUPERVISOR_REJECTED' || task.status === 'DOC_MANAGER_REJECTED';
  }

  getRejectionTitle(task: DocTask | null): string {
    if (!task) return '';
    if (task.status === 'DOC_SUPERVISOR_REJECTED') return 'رد شده توسط سرپرست';
    if (task.status === 'DOC_MANAGER_REJECTED') return 'رد شده توسط مدیریت';
    return '';
  }

  getRejectionNote(task: DocTask | null): string {
    if (!task) return '';
    if (task.status === 'DOC_SUPERVISOR_REJECTED') return task.supervisor_note || 'علت رد توسط سرپرست ثبت نشده است.';
    if (task.status === 'DOC_MANAGER_REJECTED') return task.manager_note || 'علت رد توسط مدیریت ثبت نشده است.';
    return '';
  }

  private buildPayload(): Partial<DocTask> {
    return this.facade.buildTaskPayload(this.selectedTask!, this.editableValues, this.f_worker_note);
  }

  private async saveExtraEditedFields(): Promise<void> {
    if (!this.selectedTask) return;
    await this.facade.saveExtraEditedFields(this.selectedTask, this.editableValues, this.editableFormFields);
  }

  hasFormValues(): boolean {
    if (this.f_worker_note && this.f_worker_note.trim()) return true;
    for (const key of Object.keys(this.editableValues)) {
      const val = this.editableValues[key];
      if (val !== undefined && val !== null && String(val).trim() !== '' && val !== false) {
        return true;
      }
    }
    return false;
  }

  async saveDraft(showToast = true) {
    if (!this.selectedTask || this.isSaving) return;
    if (!this.hasFormValues() && !this.hasDocData(this.selectedTask)) {
      if (showToast) {
        this.toast.warning('هیچ اطلاعات یا یادداشتی برای ذخیره به عنوان پیش‌نویس وارد نشده است.');
      }
      return;
    }
    this.isSaving = true;
    const ok = await this.facade.saveDraft(
      this.selectedTask,
      this.editableValues,
      this.f_worker_note,
      this.editableFormFields,
      showToast
    );
    if (ok) {
      this.applyFilters();
      this.initialFormSnapshot = JSON.stringify({ values: this.editableValues, note: this.f_worker_note });
      if (showToast) this.closeDetail(true);
    }
    this.isSaving = false;
    this.cdr.detectChanges();
  }

  // ════════════════════════════════════════════
  //  Submit Single & Bulk
  // ════════════════════════════════════════════

  /** ارسال تکی کالای فعال در فرم جزئیات به سرپرست */
  async submitCurrentTask() {
    if (!this.selectedTask || this.isSaving) return;
    if (!this.hasFormValues() && !this.hasDocData(this.selectedTask)) {
      this.toast.warning('لطفاً حداقل یکی از فیلدهای سند مالی یا یادداشت کالا را تکمیل فرمایید.');
      return;
    }
    const confirmed = await this.confirmDialog.open({
      title: 'ارسال سند به سرپرست',
      message: `آیا از ثبت و ارسال اسناد کالای <b dir="ltr">${this.selectedTask.item_details?.fa_unic_code || ''}</b> به سرپرست اطمینان دارید؟`,
      confirmText: 'بله، ارسال کن', cancelText: 'انصراف', type: 'info'
    });
    if (!confirmed) return;
    this.isSaving = true;
    const ok = await this.facade.submitCurrentTask(
      this.selectedTask,
      this.editableValues,
      this.f_worker_note,
      this.editableFormFields
    );
    if (ok) {
      this.closeDetail(true);
      if (this.localFirst) {
        this.readFromLocal(false);
      } else {
        this.loadTasks(false);
      }
    }
    this.isSaving = false;
    this.cdr.detectChanges();
  }

  /** ارسال سریع تک‌کلیکه یک کالا مستقیم از روی کارت */
  async quickSubmitTask(task: DocTask, event: Event) {
    event.stopPropagation();
    if (this.isReadOnly(task)) {
      this.toast.warning('این کالا در وضعیت غیرقابل ارسال قرار دارد.');
      return;
    }
    if (!this.hasDocData(task) && task.status !== 'DOC_SUPERVISOR_REJECTED' && task.status !== 'DOC_MANAGER_REJECTED') {
      this.toast.warning('اطلاعات سند مالی برای این کالا تکمیل نشده است.');
      return;
    }
    const confirmed = await this.confirmDialog.open({
      title: 'ارسال سریع به سرپرست',
      message: `آیا از ارسال مستقیم کالای <b dir="ltr">${task.item_details?.fa_unic_code || ''}</b> جهت بررسی سرپرست اسناد اطمینان دارید؟`,
      confirmText: 'بله، ارسال شود', cancelText: 'انصراف', type: 'info'
    });
    if (!confirmed) return;
    this.isSubmitting = true;
    this.cdr.detectChanges();
    const ok = await this.facade.quickSubmitTask(task, this.editableFormFields);
    if (ok) {
      if (this.localFirst) {
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } else {
        this.loadTasks(false);
      }
    }
    this.isSubmitting = false;
    this.cdr.detectChanges();
  }

  /** ارسال گروهی از لیست */
  async submitAll() {
    const isPartial = this.selectedTasks.size > 0;
    const eligible = this.tasks.filter(t =>
      ['PENDING_DOC', 'DOC_SUPERVISOR_REJECTED', 'DOC_MANAGER_REJECTED'].includes(t.status)
    );
    const toSubmit = isPartial
      ? eligible.filter(t => this.selectedTasks.has(t.id) && (this.hasDocData(t) || t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED'))
      : eligible.filter(t => this.hasDocData(t) || t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED');

    const ok = await this.facade.submitAll(toSubmit, isPartial);
    if (ok) {
      this.selectedTasks.clear();
      if (this.localFirst) {
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } else {
        this.loadTasks();
      }
    }
  }

  async claimSelectedTasks() {
    if (this.selectedPoolTasks.size === 0) return;
    const ok = await this.facade.claimSelectedTasks(this.poolTasks, this.selectedPoolTasks);
    if (ok) {
      this.selectedPoolTasks.clear();
      this.poolTasksLoaded = false;
      this.tasksLoaded = false;
      if (this.localFirst) {
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } else {
        this.loadPoolTasks();
        this.loadTasks(false);
      }
    }
  }

  // ════════════════════════════════════════════
  //  Barcode Scanner
  // ════════════════════════════════════════════

  async onBarcodeScanned(code: string) {
    if (this.selectedTask) {
      this.toast.info('فرم جزئیات کالا باز است. برای اسکن کالای دیگر ابتدا فرم را ببندید.');
      return;
    }
    if (this.scanBusy || this.isScanBatchModalOpen) return;
    this.scanBusy = true;
    try {
      if (CustomsScannerParser.isMultiRowOrStructured(code, this.scannerRowSep, this.scannerColSep)) {
        const parsedTable = CustomsScannerParser.parseRawText(code, this.fieldConfigs, this.scannerRowSep, this.scannerColSep);
        if (parsedTable && parsedTable.rows.length > 0) {
          await this.processStructuredScan(parsedTable);
          return;
        }
      }

      const rawQ = (code || '').trim();
      const convertedQ = convertPersianKeyboardToEnglish(rawQ).toLowerCase();
      const normQ = normalizeDigits(rawQ).toLowerCase();
      const normConvertedQ = normalizeDigits(convertedQ).toLowerCase();
      const match = (t: DocTask) => matchesDocTaskBarcode(t, rawQ, convertedQ, normQ, normConvertedQ);

      let myTasks: DocTask[];
      let pool: DocTask[];
      if (this.localFirst) {
        [myTasks, pool] = await Promise.all([
          this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!),
          this.store.getPoolTasks(this.activeWarehouseId!),
        ]);
      } else {
        myTasks = this.tasks;
        pool = this.poolTasks.length > 0 ? this.poolTasks : await this.facade.fetchPoolOnce();
      }

      const mine = myTasks.filter(match);
      if (mine.length === 1) {
        this.openDetail(mine[0]);
        return;
      } else if (mine.length > 1) {
        this.searchQuery = rawQ;
        this.searchSubject.next(rawQ);
        this.applyFilters();
        this.toast.info(`تعداد ${mine.length} کالا با مشخصه «${rawQ}» در کارتابل شما یافت شد.`);
        this.cdr.detectChanges();
        return;
      }

      const poolTask = pool.find(match);
      if (poolTask) {
        await this.claimScannedTask(poolTask);
        return;
      }

      this.searchQuery = rawQ;
      this.searchSubject.next(rawQ);
      this.applyFilters();
      const totalMatched = this.currentTab === 'my-tasks' ? this.filteredTasks.length : this.filteredPoolTasks.length;
      if (totalMatched > 0) {
        this.toast.info(`تعداد ${totalMatched} کالا بر اساس جستجوی «${rawQ}» یافت شد.`);
      } else {
        this.toast.warning(`هیچ موردی مطابق با «${rawQ}» در کارتابل یا استخر یافت نشد.`);
      }
      this.cdr.detectChanges();
    } finally {
      this.scanBusy = false;
      if (!this.selectedTask && !this.isScanBatchModalOpen) this.scanner?.focusInput();
      this.cdr.detectChanges();
    }
  }

  private async processStructuredScan(table: any) {
    const summary = await this.facade.processStructuredScan(
      table,
      this.fieldConfigs,
      this.tasks,
      this.poolTasks,
      t => this.isReadOnly(t),
      s => this.getStatusLabel(s)
    );
    this.openScanBatchModal(summary);
  }

  private async claimScannedTask(task: DocTask): Promise<void> {
    const ok = await this.facade.claimScannedTask(task);
    if (ok) {
      this.setTab('my-tasks');
      if (this.localFirst) {
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
        const fresh = (await this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!))
          .find(t => task.sync_id ? t.sync_id === task.sync_id : t.id === task.id);
        if (fresh) this.openDetail(fresh);
      } else {
        this.loadTasks(false);
        this.openDetail(task);
      }
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════

  trackById(_: number, t: DocTask) { return t.id ?? (t as any)._offlineId ?? _; }
  getStatusLabel(s: string): string { return getStatusLabel(s); }
  getActionTypeLabel(actionType: string): string { return getActionTypeLabel(actionType); }
  getStatusColor(s: string): string { return getStatusColor(s); }

  get pendingCount(): number {
    return this.tasks.filter(t => ['PENDING_DOC','DOC_SUPERVISOR_REJECTED','DOC_MANAGER_REJECTED'].includes(t.status)).length;
  }

  // Export Methods
  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.selectedTasks.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
    try { document.body.style.overflow = 'hidden'; } catch {}
    
    if (this.availableExportColumns.length === 0) {
      this.docTaskApi.getExportColumns().subscribe({
        next: (cols) => {
          this.availableExportColumns = cols;
          this.cdr.detectChanges();
        }
      });
    }
  }

  closeExportModal() {
    this.isExporting = false;
    this.isExportModalOpen = false;
    try { document.body.style.overflow = ''; } catch {}
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
    const params: any = {
      data_scope: this.exportDataScope,
      columns_scope: this.exportColumnScope,
      as_role: 'doc_worker',
    };
    if (this.exportDataScope === 'selected') {
      params.selected_ids = Array.from(this.selectedTasks);
    }
    if (this.exportColumnScope === 'custom') {
      params.columns_list = Array.from(this.selectedExportColumns);
    } else if (this.exportColumnScope === 'visible') {
      params.columns_list = this.fieldConfigs.filter(f => f.visible).map(f => f.key);
    }
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;
    if (this.searchQuery) params.q = this.searchQuery;
    if (this.statusFilter && this.statusFilter !== 'all') params.status = this.statusFilter;
    if (this.dateFilter && this.dateFilter !== 'all') params.date = this.dateFilter;

    this.exportSubscription = this.facade.exportExcel(params).subscribe({
      next: (blob) => {
        downloadBlob(blob, `export_customs_${Date.now()}.xlsx`);
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

  onWarehouseChanged(newWhId: any) {
    this.authStore.setActiveWarehouse(newWhId);
    this.state.appState.activeWarehouseId = newWhId;
    this.tasksLoaded = false;
    this.poolTasksLoaded = false;
    this.selectedTasks.clear();
    this.selectedPoolTasks.clear();
    this.loadFieldPermissions();
    if (this.currentTab === 'my-tasks') {
      this.loadTasks();
    } else {
      this.loadPoolTasks();
    }
  }

  // ════════════════════════════════════════════
  //  Sample Template Download & Batch Scan Modal
  // ════════════════════════════════════════════

  downloadSampleTemplate() {
    if (this.isDownloadingTemplate) return;
    this.isDownloadingTemplate = true;
    this.facade.downloadTemplate(this.activeWarehouseId).subscribe({
      next: (blob) => {
        downloadBlob(blob, `Customs_Doc_Template_${Date.now()}.xlsx`);
        this.toast.success('قالب اکسل نمونه با موفقیت دانلود شد.');
        this.isDownloadingTemplate = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در دریافت فایل نمونه از سرور');
        this.isDownloadingTemplate = false;
        this.cdr.detectChanges();
      }
    });
  }

  openScanBatchModal(summary: ScanBatchSummary) {
    this.scanBatchSummary = summary;
    this.activeScanFilterTab = 'all';
    this.isScanBatchModalOpen = true;
    try { document.body.style.overflow = 'hidden'; } catch {}
    this.cdr.detectChanges();
  }

  closeScanBatchModal() {
    if (this.isApplyingBatchUpdate) return;
    this.isScanBatchModalOpen = false;
    this.scanBatchSummary = null;
    try { document.body.style.overflow = ''; } catch {}
    this.cdr.detectChanges();
    this.scanner?.focusInput();
  }

  get filteredScanRows(): ParsedScanRow[] {
    if (!this.scanBatchSummary?.rows) return [];
    if (this.activeScanFilterTab === 'all') return this.scanBatchSummary.rows;
    return this.scanBatchSummary.rows.filter(r => r.status === this.activeScanFilterTab);
  }

  async applyBulkScanUpdate() {
    if (!this.scanBatchSummary || this.isApplyingBatchUpdate) return;
    this.isApplyingBatchUpdate = true;
    this.cdr.detectChanges();
    try {
      const ok = await this.facade.applyBulkScanUpdate(
        this.scanBatchSummary,
        this.editableFormFields,
        this.isWorkerNoteVisible
      );
      if (ok) {
        this.closeScanBatchModal();
        if (this.localFirst) {
          await this.store.refresh(this.activeWarehouseId!);
          await this.readFromLocal(false);
        } else {
          this.loadTasks(false);
          this.loadPoolTasks(false);
        }
      }
    } catch (e: any) {
      this.toast.error(e?.error?.error || 'خطا در اعمال به‌روزرسانی دسته‌ای اسکنر');
    } finally {
      this.isApplyingBatchUpdate = false;
      this.cdr.detectChanges();
    }
  }
}
