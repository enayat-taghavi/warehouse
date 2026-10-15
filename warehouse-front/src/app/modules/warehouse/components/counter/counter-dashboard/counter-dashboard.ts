import {
  normalizeText,
  normalizeDigits,
  convertPersianKeyboardToEnglish,
  matchesOmniSearch,
  matchesCounterBarcode,
  extractCounterLocations,
  filterAndSortCounterTasks,
  filterPoolCounterTasks,
  handleCounterKeydownEvent,
  downloadBlob,
  populateCounterDetail,
  parseCounterUrlParams,
  CounterLongPressController
} from './counter-dashboard.helpers';
import { CounterDashboardFacade } from './counter-dashboard.facade';
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CountTaskApiService } from '../../../api/count-task-api.service';
import { ItemApiService } from '../../../api/item-api.service';
import { DynamicFieldApiService } from '../../../api/dynamic-field-api.service';
import { SettingsService } from '../../../../../core/services/settings';
import { CountTask, CountTaskStatus, CountTaskHistory } from '../../../../../core/models/count-task.model';
import { ToastService } from '../../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../../core/services/state.service';
import { WarehouseSelectorComponent } from '../../../../../shared/components/warehouse-selector/warehouse-selector.component';
import { OfflinePendingBadgeComponent } from '../../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AuthStore } from '../../../../../core/stores/auth.store';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Subject, Subscription, filter } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CountTaskStore } from '../../../services/count-task-store';
import { offlineDb } from '../../../../../core/services/offline-db';
import { OfflineSyncService } from '../../../../../core/services/offline-sync.service';
import { BarcodeScannerComponent } from '../../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { PersianDatePipe } from '../../../../../shared/pipes/persian-date.pipe';
import { WebSocketService } from '../../../../../core/http/websocket.service';
import { ItemPhotoGalleryComponent } from '../../item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../../item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../../item-photo-gallery/photo-gallery-host';
import { 
  FieldPermissionConfig, 
  mergeFieldPermissions 
} from '../../../../../core/models/field-config.model';
import { ActionButtonComponent } from '../../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../../shared/components/tab-bar/tab-bar.component';
import { SvgIconDirective } from '../../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-counter-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, PersianDatePipe, WarehouseSelectorComponent, OfflinePendingBadgeComponent, BarcodeScannerComponent, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent],
  templateUrl: './counter-dashboard.html',
  styleUrl: './counter-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CounterDashboardFacade]
})
export class CounterDashboard implements OnInit {
  tasks: CountTask[] = [];
  poolTasks: CountTask[] = [];
  filteredPoolTasks: CountTask[] = [];
  isLoading = true;
  selectedTask: CountTask | null = null;
  selectedTasks = new Set<number>();
  selectedPoolTasks = new Set<number>();
  currentTab: 'my-tasks' | 'pool' = 'my-tasks';
  isSubmitting = false;

  // شمارنده مخزن از طول زنده فهرست ساخته می‌شود (حذف و افزودن WebSocket هم دیده شود)؛
  // آرایه فقط با تغییر شمار عوض می‌شود تا app-tab-bar (OnPush) بی‌دلیل بازرسم نشود.
  private counterTabsPoolCount = -1;
  private counterTabsCache: TabDef[] = [];

  get counterTabs(): TabDef[] {
    const poolCount = this.poolTasks.length;
    if (poolCount !== this.counterTabsPoolCount) {
      this.counterTabsPoolCount = poolCount;
      this.counterTabsCache = [
        { id: 'my-tasks', label: 'تسک‌های من', shortLabel: 'تسک‌ها' },
        { id: 'pool', label: 'مخزن کالاها', shortLabel: 'مخزن', count: poolCount > 0 ? poolCount : undefined }
      ];
    }
    return this.counterTabsCache;
  }

  // ── Photo Gallery State ───────────────────────────────────────────────────
  readonly photoGallery = new PhotoGalleryHost(msg => this.toast.warning(msg));

  onPhotosChanged(photos: any[]): void {
    this.photoGallery.apply(photos, this.tasks, this.poolTasks, this.selectedTask);
    this.cdr.markForCheck();
  }
  
  // Detail view state
  countedBalanceStr: string = '';
  counterNote: string = '';
  isHistoryOpen: boolean = false;
  counterCanViewHistory: boolean = true;
  counterCanViewPreviousNotes: boolean = true;

  // ── Dynamic Field Permissions State ────────────────────────────────────────
  fieldConfigs: FieldPermissionConfig[] = [];
  editableValues: Record<string, any> = {};
  dynamicFieldsList: any[] = [];
  scannerCameraPreset = 'adaptive';

  // Stats & Filters
  totalTasksCount = 0;
  completedTasksCount = 0;
  remainingTasksCount = 0;
  filteredTasks: CountTask[] = [];
  pendingTasks: CountTask[] = [];
  readyToSubmitCount = 0;

  // New Filters & Defaults
  dateFilter: 'today' | 'yesterday' | 'week' | 'all' = 'all';
  statusFilter: 'pending' | 'initial' | 'completed' | 'recount' | 'all' = 'pending';
  locationFilter: string = 'all';
  availableLocations: string[] = [];
  searchQuery: string = '';
  searchSubject = new Subject<string>();
  private initialLoadDone = false;

  // Smart Sorting
  sortField: 'created_at' | 'updated_at' | 'location' | 'recount_first' | 'code' | 'title' = 'updated_at';
  sortDirection: 'asc' | 'desc' = 'desc';
  isSortMenuOpen = false;

  // Status Counts for Chips
  statusCounts = {
    all: 0,
    pending: 0,
    initial: 0,
    recount: 0,
    completed: 0
  };

  updatedTaskIds = new Set<number>();
  flashTimeout: any;

  private pushSub?: Subscription;
  private pullSub?: Subscription;
  private wsSub?: Subscription;
  private wsDebounceSub?: Subscription;
  private wsUpdateSubject = new Subject<any>();
  private routerSub?: Subscription;
  private swrSub?: Subscription;
  private offlineSync = OfflineSyncService.getInstance();

  @ViewChild(BarcodeScannerComponent) scanner?: BarcodeScannerComponent;
  private scanBusy = false;
  private barcodeBuffer = '';
  private lastKeyTime = 0;

  // Export Modal State
  isExportModalOpen = false;
  exportDataScope: 'all' | 'selected' = 'all';
  exportColumnScope: 'all_db' | 'visible' | 'custom' = 'all_db';
  selectedExportColumns: Set<string> = new Set();
  isExporting = false;
  isDownloadingTemplate = false;
  exportSubscription?: Subscription;
  availableExportColumns: {key: string, label: string}[] = [];

  constructor(
    public facade: CounterDashboardFacade,
    private countTaskApi: CountTaskApiService,
    private itemApi: ItemApiService,
    private dynamicFieldApi: DynamicFieldApiService,
    private settingsService: SettingsService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    public state: StateService,
    public authStore: AuthStore,
    private auth: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private store: CountTaskStore,
    private wsService: WebSocketService
  ) {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.updateUrlState();
    });
  }

  // ─── Local-First ───

  /** انبار فعال به‌صورت عددی؛ null یعنی «همه/نامشخص» → مسیر Local-First غیرفعال */
  private get activeWarehouseId(): number | null {
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && Number(whId) !== -1) return Number(whId);
    return null;
  }

  /** Local-First فقط با feature flag روشن + انبار مشخص + کاربر شناخته‌شده */
  private get localFirst(): boolean {
    return (
      (environment as any).useLocalFirstCounting === true &&
      this.activeWarehouseId !== null &&
      this.currentUserId !== null
    );
  }

  private get currentUserId(): number | null {
    const id = this.auth.user()?.id;
    return typeof id === 'number' ? id : null;
  }

  ngOnInit() {
    this.loadFieldPermissions();

    // پس از هر Pull موفق (خودکار یا دستی)، لیست از Dexie تازه شود
    this.pullSub = this.store.pull.pullCompleted$.subscribe(({ warehouseId }) => {
      if (this.localFirst && warehouseId === this.activeWarehouseId && !this.selectedTask) {
        this.readFromLocal(false);
      }
    });

    this.wsDebounceSub = this.wsUpdateSubject.pipe(debounceTime(600)).subscribe(() => {
      this.refreshCurrentTab();
    });

    this.wsService.connect();
    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        if (data.warehouse_id && this.activeWarehouseId && Number(data.warehouse_id) !== this.activeWarehouseId) {
          return;
        }
        if (data.task && data.task.id) {
          this.updateCountTaskInPlace(data.task);
        } else if (data.task_id) {
          this.fetchSingleCountTask(data.task_id);
        } else {
          this.wsUpdateSubject.next(data);
        }
      }
    });

    // ── URL State: خواندن پارامترها از آدرس مرورگر ──
    this.syncStateFromUrl();
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => this.syncStateFromUrl());

    // ─── SWR Live Revalidation: دریافت داده‌های جدیدتر سرور در پس‌زمینه با تطبیق دقیق نقش شمارشگر ───
    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      const isCounterUrl = url.includes('/api/inventory/count-tasks/') &&
        (url.includes('as_role=counter') || (!url.includes('as_role=supervisor') && !url.includes('as_role=manager') && !url.includes('as_role=tracking')));
      if (isCounterUrl && data) {
        const freshList = Array.isArray(data) ? data : data.results || [];
        if (freshList.length > 0 && this.currentTab === 'my-tasks' && !this.selectedTask) {
          // ادغام امن داده‌ها با حفظ پیش‌نویس‌های محلی دارای _offlinePending
          const offlinePendingMap = new Map(this.tasks.filter(t => t._offlinePending).map(t => [t.id || t.sync_id, t]));
          const mergedList = freshList.map((serverTask: CountTask) => {
            const pendingTask = offlinePendingMap.get(serverTask.id) || (serverTask.sync_id ? offlinePendingMap.get(serverTask.sync_id) : undefined);
            return pendingTask ? { ...serverTask, ...pendingTask } : serverTask;
          });
          this.trackUpdates(this.tasks, mergedList);
          this.tasks = mergedList;
          this.applyFilters();
          this.cdr.detectChanges();
          console.log('[CounterDashboard] ⚡ داده‌های انبارگردان با استعلام پس‌زمینه SWR به‌روزرسانی شد.');
        }
      }
    });
  }

  ngOnDestroy() {
    this.pushSub?.unsubscribe();
    this.pullSub?.unsubscribe();
    this.wsSub?.unsubscribe();
    this.wsDebounceSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.swrSub?.unsubscribe();
    this.searchSubject.complete();
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
  }

  refreshCurrentTab() {
    if (this.currentTab === 'my-tasks') this.loadTasks(false);
    else if (this.currentTab === 'pool') this.loadPoolTasks(false);
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
      if (this.selectedTask?.id === id) {
        this.selectedTask = null;
      }
      this.applyFilters();
      this.cdr.detectChanges();
      if (this.localFirst) {
        if (taskData.sync_id) {
          offlineDb.countTasks.delete(taskData.sync_id).catch(() => {});
        } else {
          offlineDb.countTasks.where('id').equals(id).delete().catch(() => {});
        }
      }
      return;
    }

    const currentUserId = this.currentUserId;
    const isMyTask = currentUserId !== null && (
      taskData.counter === currentUserId ||
      (taskData.counter && typeof taskData.counter === 'object' && taskData.counter.id === currentUserId) ||
      taskData.counter_id === currentUserId
    );
    const isPoolTask = (taskData.counter === null || taskData.counter === undefined) && taskData.status === 'PENDING_COUNT';

    if (isMyTask) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        const pendingState = this.tasks[idx]._offlinePending ? { _offlinePending: true } : {};
        this.tasks[idx] = { ...this.tasks[idx], ...taskData, ...pendingState };
      } else {
        this.tasks = [taskData, ...this.tasks];
      }
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedPoolTasks.delete(id);
      if (this.selectedTask && this.selectedTask.id === id) {
        this.selectedTask = { ...this.selectedTask, ...taskData };
      }
      this.triggerFlash(id);
    } else if (isPoolTask) {
      const idx = this.poolTasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.poolTasks[idx] = { ...this.poolTasks[idx], ...taskData };
      } else {
        this.poolTasks = [taskData, ...this.poolTasks];
      }
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      if (this.selectedTask?.id === id) {
        this.selectedTask = null;
      }
      this.triggerFlash(id);
    } else {
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
      if (this.selectedTask?.id === id) {
        this.selectedTask = null;
      }
    }

    this.applyFilters();
    this.cdr.detectChanges();

    if (this.localFirst && taskData.sync_id) {
      offlineDb.countTasks.put(taskData).catch(() => {});
    }
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

  applyFilters() {
    this.availableLocations = extractCounterLocations(this.tasks);

    const res = filterAndSortCounterTasks(this.tasks, {
      searchQuery: this.searchQuery,
      statusFilter: this.statusFilter,
      dateFilter: this.dateFilter,
      locationFilter: this.locationFilter,
      sortField: this.sortField,
      sortDirection: this.sortDirection
    });

    this.totalTasksCount = res.totalTasksCount;
    this.completedTasksCount = res.completedTasksCount;
    this.remainingTasksCount = res.remainingTasksCount;
    this.readyToSubmitCount = res.readyToSubmitCount;
    this.statusCounts = res.statusCounts;
    this.filteredTasks = res.filteredTasks;
    this.pendingTasks = this.tasks.filter((t: any) => t.status !== 'COUNTED' && t.status !== 'SUPERVISOR_APPROVED' && t.status !== 'MANAGER_REVIEW' && t.status !== 'COMPLETED');

    this.filteredPoolTasks = filterPoolCounterTasks(this.poolTasks, (this.searchQuery || '').trim());
  }

  setLocationFilter(loc: string) {
    this.locationFilter = loc;
    this.selectedTasks.clear();
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setDateFilter(filter: 'today' | 'yesterday' | 'week' | 'all') {
    this.dateFilter = filter;
    this.selectedTasks.clear();
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setStatusFilter(filter: 'pending' | 'initial' | 'completed' | 'recount' | 'all') {
    this.statusFilter = filter;
    this.selectedTasks.clear();
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

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

  trackByTaskId(index: number, task: CountTask): number {
    return task.id ?? (task as any)._offlineId ?? index;
  }

  trackByFieldKey(index: number, field: FieldPermissionConfig): string {
    return field.key;
  }

  trackByColKey(index: number, col: any): string {
    return col.key;
  }

  /**
   * Local-First: خواندن فوری از Dexie (حتی آفلاین) — سپس Pull دلتا در پس‌زمینه.
   */
  private async readFromLocal(showLoading = true) {
    const whId = this.activeWarehouseId!;
    const userId = this.currentUserId!;
    if (showLoading) {
      this.isLoading = true;
      this.cdr.detectChanges();
    }
    try {
      if (this.currentTab === 'my-tasks') {
        const newTasks = await this.store.getMyTasks(whId, userId);
        this.trackUpdates(this.tasks, newTasks);
        this.tasks = newTasks;
        this.applyFilters();
      } else {
        const newPoolTasks = await this.store.getPoolTasks(whId);
        this.trackUpdates(this.poolTasks, newPoolTasks);
        this.poolTasks = newPoolTasks;
        this.applyFilters();
      }
    } catch (e) {
      console.error('[CounterDashboard] خطا در خواندن از Dexie:', e);
    }
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  async loadTasks(showLoading = true) {
    if (this.localFirst) {
      await this.readFromLocal(showLoading);
      this.store.refresh(this.activeWarehouseId!);
      return;
    }
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    try {
      const data = await this.facade.loadTasksData(this.activeWarehouseId, this.currentUserId!, this.localFirst);
      this.trackUpdates(this.tasks, data);
      this.tasks = data;
      this.applyFilters();
    } catch {
      this.toast.error('خطا در دریافت اطلاعات تسک‌ها');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadPoolTasks(showLoading = true) {
    if (this.localFirst) {
      this.poolTasks = await this.store.getPoolTasks(this.activeWarehouseId!);
      this.applyFilters();
      return;
    }
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    try {
      const data = await this.facade.loadPoolTasksData(this.activeWarehouseId, this.localFirst);
      this.poolTasks = data;
      this.applyFilters();
    } catch {
      this.toast.error('خطا در دریافت کالاهای مخزن');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** به‌روزرسانی پارامترهای آدرس مرورگر */
  private updateUrlState() {
    const defaultSortDir = (this.sortField === 'created_at' || this.sortField === 'updated_at') ? 'desc' : 'asc';
    const queryParams: any = {
      tab: this.currentTab !== 'my-tasks' ? this.currentTab : null,
      q: this.searchQuery ? this.searchQuery : null,
      status: this.statusFilter !== 'pending' ? this.statusFilter : null,
      date: this.dateFilter !== 'all' ? this.dateFilter : null,
      loc: this.locationFilter !== 'all' ? this.locationFilter : null,
      sort: this.sortField !== 'updated_at' ? this.sortField : null,
      sortDir: this.sortDirection !== defaultSortDir ? this.sortDirection : null
    };
    this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** خواندن وضعیت فیلترها از پارامترهای آدرس مرورگر */
  private syncStateFromUrl() {
    if (!this.router.url.split('?')[0].includes('/counter')) return;
    const params = this.router.parseUrl(this.router.url).queryParams;
    const p = parseCounterUrlParams(params);

    let tabChanged = false;
    if (p.resolvedTab !== this.currentTab) {
      this.currentTab = p.resolvedTab as 'my-tasks' | 'pool';
      this.selectedTasks.clear();
      this.selectedPoolTasks.clear();
      tabChanged = true;
    }
    this.statusFilter = p.statusFilter as any;
    this.dateFilter = p.dateFilter as any;
    this.locationFilter = p.locationFilter;
    this.sortField = p.sortField as any;
    this.sortDirection = p.sortDirection as any;
    this.searchQuery = p.searchQuery;

    this.applyFilters();
    if (tabChanged || !this.initialLoadDone) {
      this.initialLoadDone = true;
      this.refreshCurrentTab();
    }
  }

  setTab(tab: string) {
    this.currentTab = (tab === 'pool' ? 'pool' : 'my-tasks');
    this.updateUrlState();
    this.refreshCurrentTab();
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

  onSearchEnter() {
    if (this.searchQuery && this.searchQuery.trim().length >= 3) {
      const q = this.searchQuery.trim();
      this.searchQuery = '';
      this.applyFilters();
      this.updateUrlState();
      this.onBarcodeScanned(q);
    }
  }

  triggerCameraScan() {
    this.scanner?.openCamera();
  }

  onWarehouseChange(whId: any) {
    this.authStore.setActiveWarehouse(whId);
    this.state.appState.activeWarehouseId = whId;
    this.loadFieldPermissions();
    if (this.currentTab === 'my-tasks') {
      this.loadTasks();
    } else {
      this.loadPoolTasks();
    }
  }

  private normalizeDigits(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[/،]/g, '.')
      .trim();
  }

  private convertPersianKeyboardToEnglish(str: string): string {
    if (!str) return '';
    const faToEn: Record<string, string> = {
      'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']',
      'ش': 'a', 'س': 's', 'ی': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'گ': "'",
      'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'پ': 'm', 'و': ',', 'ئ': 'm'
    };
    return str.split('').map(char => faToEn[char] || faToEn[char.toLowerCase()] || char).join('');
  }

  isAllPoolSelected(): boolean {
    return this.filteredPoolTasks.length > 0 && this.selectedPoolTasks.size === this.filteredPoolTasks.length;
  }

  isPoolIndeterminate(): boolean {
    return this.selectedPoolTasks.size > 0 && this.selectedPoolTasks.size < this.filteredPoolTasks.length;
  }

  toggleSelectAllPool() {
    if (this.isAllPoolSelected()) {
      this.selectedPoolTasks.clear();
    } else {
      this.filteredPoolTasks.forEach(t => this.selectedPoolTasks.add(t.id));
    }
    this.cdr.detectChanges();
  }

  togglePoolSelection(taskId: number) {
    if (this.selectedPoolTasks.has(taskId)) {
      this.selectedPoolTasks.delete(taskId);
    } else {
      this.selectedPoolTasks.add(taskId);
    }
    this.cdr.detectChanges();
  }

  async claimSelectedTasks() {
    if (this.selectedPoolTasks.size === 0) return;
    if (!navigator.onLine) {
      this.toast.error('به عهده گرفتن کالا از مخزن نیاز به اتصال اینترنت دارد');
      return;
    }
    try {
      const res = await this.facade.claimSelectedTasks(Array.from(this.selectedPoolTasks), this.localFirst, this.activeWarehouseId);
      if (!res.success) {
        this.toast.error(res.message || 'خطا در به عهده گرفتن کالاها');
        this.selectedPoolTasks.clear();
        this.loadPoolTasks(false);
        return;
      }
      this.toast.success(`${res.claimedCount} کالا با موفقیت به عهده گرفته شد`);
      this.selectedPoolTasks.clear();
      this.loadPoolTasks(false);
      this.setTab('my-tasks');
    } catch (err: any) {
      this.toast.error(err?.error?.error || 'خطا در عملیات');
    }
  }

  // ════════════════════════════════════════════
  //  اسکنر بارکد و دریافت رویدادها
  // ════════════════════════════════════════════

  async onBarcodeScanned(code: string) {
    if (this.selectedTask) {
      this.toast.info('فرم جزئیات کالا باز است. برای اسکن کالای دیگر ابتدا فرم را ببندید.');
      return;
    }
    const rawQ = (code || '').trim();
    if (!rawQ) return;

    const convertedQ = convertPersianKeyboardToEnglish(rawQ).toLowerCase();
    const normQ = normalizeDigits(rawQ).toLowerCase();
    const normConvertedQ = normalizeDigits(convertedQ).toLowerCase();
    const match = (t: CountTask) => matchesCounterBarcode(t, rawQ, convertedQ, normQ, normConvertedQ);

    let myTasks: CountTask[];
    let pool: CountTask[];
    if (this.localFirst) {
      [myTasks, pool] = await Promise.all([
        this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!),
        this.store.getPoolTasks(this.activeWarehouseId!),
      ]);
    } else {
      myTasks = this.tasks;
      pool = this.poolTasks.length > 0 ? this.poolTasks : await this.facade.fetchPoolTasksSilently(this.activeWarehouseId);
    }

    const mine = myTasks.filter(match);
    if (mine.length === 1) {
      this.openDetail(mine[0]);
      return;
    } else if (mine.length > 1) {
      this.searchQuery = rawQ;
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
    this.applyFilters();
    const totalMatched = this.currentTab === 'my-tasks' ? this.filteredTasks.length : this.filteredPoolTasks.length;
    if (totalMatched > 0) {
      this.toast.info(`تعداد ${totalMatched} کالا بر اساس جستجوی «${rawQ}» یافت شد.`);
    } else {
      this.toast.warning(`هیچ موردی مطابق با «${rawQ}» در کارتابل یا مخزن کالاها یافت نشد.`);
    }
    this.cdr.detectChanges();
  }

  fetchPoolTasksSilently() {
    if (this.localFirst && this.activeWarehouseId) {
      this.store.getPoolTasks(this.activeWarehouseId).then(tasks => {
        this.trackUpdates(this.poolTasks, tasks);
        this.poolTasks = tasks;
        this.cdr.detectChanges();
      }).catch(err => console.warn('[CounterDashboard] Silent local pool fetch error:', err));
      return;
    }
    this.fetchPoolTasks().then(tasks => {
      this.trackUpdates(this.poolTasks, tasks);
      this.poolTasks = tasks;
      this.cdr.detectChanges();
    });
  }

  /** استخر در حالت سرور-محور */
  private fetchPoolTasks(): Promise<CountTask[]> {
    const params: any = { as_role: 'counter', page_size: 1000 };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;
    return new Promise((resolve) => {
      this.http
        .get<CountTask[]>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params })
        .subscribe({
          next: (res: any) => resolve(Array.isArray(res) ? res : res.results || []),
          error: () => resolve([]),
        });
    });
  }

  private async claimScannedTask(task: CountTask): Promise<void> {
    const ok = await this.facade.claimScannedTask(task, this.localFirst, this.activeWarehouseId);
    if (ok) {
      this.loadPoolTasks(false);
      await this.loadTasks(false);
      this.setTab('my-tasks');
      const foundInMyTasks = this.tasks.find(t => t.id === task.id);
      if (foundInMyTasks) {
        this.openDetail(foundInMyTasks);
      }
    }
  }

  loadFieldPermissions() {
    const whId = this.activeWarehouseId;
    const numWhId = whId ? Number(whId) : undefined;

    this.dynamicFieldApi.getFields(numWhId).subscribe({
      next: (dfRes: any) => {
        this.dynamicFieldsList = Array.isArray(dfRes) ? dfRes : (dfRes?.results || []);
        this.fetchFieldSettings(numWhId);
      },
      error: () => {
        this.dynamicFieldsList = [];
        this.fetchFieldSettings(numWhId);
      }
    });
  }

  private fetchFieldSettings(whId?: number) {
    if (whId) {
      this.settingsService.getWarehouseSettings(whId).subscribe({
        next: (res: any) => {
          const savedPerms = res?.field_permissions_counter?.value;
          this.fieldConfigs = mergeFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.counterCanViewHistory = res?.counter_can_view_history?.value ?? true;
          this.counterCanViewPreviousNotes = res?.counter_can_view_previous_notes?.value ?? true;
          this.scannerCameraPreset = res?.scanner_camera_preset?.value ?? res?.scanner_camera_preset ?? 'adaptive';
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
          this.counterCanViewHistory = true;
          this.counterCanViewPreviousNotes = true;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.settingsService.getGlobalSettings().subscribe({
        next: (res: any) => {
          const savedPerms = res?.field_permissions_counter;
          this.fieldConfigs = mergeFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.counterCanViewHistory = res?.counter_can_view_history ?? true;
          this.counterCanViewPreviousNotes = res?.counter_can_view_previous_notes ?? true;
          this.scannerCameraPreset = res?.scanner_camera_preset ?? 'adaptive';
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeFieldPermissions(null, this.dynamicFieldsList);
          this.counterCanViewHistory = true;
          this.counterCanViewPreviousNotes = true;
          this.cdr.detectChanges();
        }
      });
    }
  }

  canViewRecordNote(index: number): boolean {
    if (this.counterCanViewPreviousNotes) return true;
    return index === 0;
  }

  get visibleInfoFields(): FieldPermissionConfig[] {
    return this.fieldConfigs.filter(f => 
      f.visible && 
      !f.editable && 
      f.key !== 'counted_qty' && 
      f.key !== 'counter_note' &&
      (!this.selectedTask?.is_blind || (f.key !== 'inventory' && f.key !== 'bal4miv' && f.key !== 'balance'))
    );
  }

  get editableFormFields(): FieldPermissionConfig[] {
    return this.fieldConfigs.filter(f => 
      f.visible && 
      f.editable && 
      f.key !== 'counted_qty' && 
      f.key !== 'counter_note'
    );
  }

  getFieldLabel(field: FieldPermissionConfig): string {
    return field.custom_label?.trim() || field.default_label;
  }

  getFieldDisplayValue(field: FieldPermissionConfig, item: any): string {
    if (!item) return '-';
    let val: any;
    if (field.is_dynamic) {
      const realKey = field.key.replace(/^dyn_/, '');
      val = item.dynamic_data?.[realKey];
    } else {
      val = item[field.key];
    }
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'boolean') return val ? 'بله' : 'خیر';
    return String(val);
  }

  isFieldVisible(key: string): boolean {
    const cfg = this.fieldConfigs.find(f => f.key === key);
    return cfg ? !!cfg.visible : true;
  }

  isReadOnly(task: CountTask | null): boolean {
    if (!task) return false;
    return task.status !== 'PENDING_COUNT' && task.status !== 'INITIAL_COUNT' && task.status !== 'SUPERVISOR_REJECTED' && task.status !== 'MANAGER_REJECTED';
  }

  isTaskSelectable(task: CountTask | null): boolean {
    if (!task) return false;
    return (task.status === 'INITIAL_COUNT' || (task.status === 'PENDING_COUNT' && task.counted_balance !== null && task.counted_balance !== undefined)) && !this.isReadOnly(task);
  }

  getActionTypeLabel(actionType: string): string {
    const map: Record<string, string> = {
      'PENDING_COUNT': 'در انتظار',
      'INITIAL_COUNT': 'آماده ارسال (ثبت موقت)',
      'COUNTED': 'شمارش شده (ارسال به سرپرست)',
      'SUPERVISOR_APPROVED': 'تایید سرپرست',
      'SUPERVISOR_REJECTED': 'بررسی مجدد (سرپرست)',
      'MANAGER_REVIEW': 'در حال بررسی مدیر',
      'MANAGER_REJECTED': 'بررسی مجدد (مدیر)',
      'FINAL_APPROVED': 'تایید نهایی',
      'CLAIMED': 'به عهده گرفته شده',
      'DISPATCHED': 'تخصیص اولیه'
    };
    return map[actionType] || actionType;
  }

  // --- Long Press & Multi-Select UX ---
  pressTimeout: any;
  justLongPressed = false;
  initialTouchY = 0;
  initialTouchX = 0;

  private longPressCtrl = new CounterLongPressController();

  onTaskPressStart(task: CountTask, event: PointerEvent) {
    if (this.isReadOnly(task) || task.counted_balance === null || task.counted_balance === undefined) return;
    this.longPressCtrl.start(event, () => {
      if (!this.selectedTasks.has(task.id)) {
        this.selectedTasks.add(task.id);
      } else {
        this.selectedTasks.delete(task.id);
      }
      this.cdr.markForCheck();
    });
  }

  onTaskPressMove(event: PointerEvent) {
    this.longPressCtrl.move(event);
  }

  onTaskPressEnd() {
    this.longPressCtrl.end();
  }

  onTaskClick(task: CountTask, event: Event) {
    if (this.longPressCtrl.justLongPressed) {
      this.longPressCtrl.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.selectedTasks.size > 0 && !this.isReadOnly(task) && task.counted_balance !== null && task.counted_balance !== undefined) {
      event.preventDefault();
      this.toggleSelection(task.id);
      return;
    }
    this.openDetail(task);
  }

  openDetail(task: CountTask) {
    this.selectedTask = task;
    this.isHistoryOpen = false;
    const detail = populateCounterDetail(task, this.editableFormFields);
    this.countedBalanceStr = detail.countedBalanceStr;
    this.counterNote = detail.counterNote;
    this.editableValues = detail.editableValues;
    this.cdr.detectChanges();
  }

  /** تغییر سریع مقدار شمارش‌شده با دکمه‌های استپر */
  stepQty(delta: number) {
    const current = Number(normalizeDigits(this.countedBalanceStr)) || 0;
    const nextVal = Math.max(0, current + delta);
    this.countedBalanceStr = String(nextVal);
    this.cdr.detectChanges();
  }

  /** بررسی وجود تغییرات ذخیره‌نشده در فرم جزئیات */
  hasUnsavedChanges(): boolean {
    if (!this.selectedTask) return false;
    const origVal = (this.selectedTask.counted_balance !== null && this.selectedTask.counted_balance !== undefined) ? String(this.selectedTask.counted_balance) : '';
    const curVal = this.normalizeDigits(this.countedBalanceStr).trim();
    if (curVal !== origVal && (curVal !== '' || origVal !== '')) return true;

    const origNote = (this.selectedTask.counter_note || '').trim();
    const curNote = (this.counterNote || '').trim();
    if (curNote !== origNote) return true;

    const item: any = this.selectedTask.item_details || {};
    for (const f of this.editableFormFields) {
      const curFieldVal = this.editableValues[f.key];
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        const oldVal = item.dynamic_data?.[realKey];
        if (curFieldVal !== oldVal && (curFieldVal !== '' || (oldVal !== null && oldVal !== undefined))) return true;
      } else {
        const oldVal = item[f.key];
        if (curFieldVal !== oldVal && (curFieldVal !== '' || (oldVal !== null && oldVal !== undefined))) return true;
      }
    }
    return false;
  }

  /** بستن فرم با گارد محافظت از تغییرات */
  async closeDetailWithGuard() {
    if (this.hasUnsavedChanges() && !this.isReadOnly(this.selectedTask)) {
      const confirmed = await this.confirmDialog.open({
        title: 'تغییرات ذخیره‌نشده',
        message: 'شما مقادیری را تغییر داده‌اید اما ذخیره نکرده‌اید. آیا مایل به بستن فرم و نادیده گرفتن تغییرات هستید؟',
        confirmText: 'بله، خروج بدون ذخیره',
        cancelText: 'ادامه ویرایش',
        type: 'warning'
      });
      if (!confirmed) return;
    }
    this.closeDetail();
  }

  closeDetail() {
    this.selectedTask = null;
    this.isHistoryOpen = false;
    this.editableValues = {};
    this.cdr.detectChanges();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    handleCounterKeydownEvent(event, this);
  }

  async saveDraft() {
    if (!this.selectedTask) return;
    if (this.isReadOnly(this.selectedTask)) {
      this.closeDetail();
      return;
    }
    const task = this.selectedTask;
    const rawVal = normalizeDigits(this.countedBalanceStr);
    this.countedBalanceStr = rawVal;
    if (rawVal !== '') {
      const num = Number(rawVal);
      if (isNaN(num) || num < 0) {
        this.toast.error('مقدار شمارش شده نمی‌تواند منفی یا نامعتبر باشد');
        return;
      }
    }
    try {
      const res = await this.facade.saveDraft(
        task,
        rawVal,
        this.counterNote,
        this.localFirst,
        this.currentUserId!,
        this.auth.user(),
        this.editableFormFields,
        this.editableValues
      );
      if (res.success) {
        this.applyFilters();
        this.toast.success(rawVal !== '' ? 'مقدار ذخیره شد (آماده ارسال)' : 'مقدار شمارش پاک شد');
        this.closeDetail();
      }
    } catch {
      this.toast.error('خطا در ذخیره اطلاعات');
    }
    this.cdr.detectChanges();
  }

  /** بازگرداندن هوشمند کالا از آماده ارسال به وضعیت پیشین (دست‌نخورده یا بازشماری) */
  async revertTaskStatus(task: CountTask, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!task || this.isReadOnly(task)) return;

    let previousStatus: CountTaskStatus = 'PENDING_COUNT';
    let statusLabel = 'در انتظار شمارش';
    if (task.history && task.history.length > 0) {
      const sortedHistory = task.history.slice().sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
        const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
        return timeB - timeA;
      });
      const prevRecord = sortedHistory.find(h => h.action_type === 'SUPERVISOR_REJECTED' || h.action_type === 'MANAGER_REJECTED' || h.action_type === 'PENDING_COUNT');
      if (prevRecord) {
        if (prevRecord.action_type === 'SUPERVISOR_REJECTED') {
          previousStatus = 'SUPERVISOR_REJECTED';
          statusLabel = 'بررسی مجدد (سرپرست)';
        } else if (prevRecord.action_type === 'MANAGER_REJECTED') {
          previousStatus = 'MANAGER_REJECTED';
          statusLabel = 'بررسی مجدد (مدیر)';
        }
      } else if (task.manager_note) {
        previousStatus = 'MANAGER_REJECTED';
        statusLabel = 'بررسی مجدد';
      } else if (task.supervisor_note) {
        previousStatus = 'SUPERVISOR_REJECTED';
        statusLabel = 'بررسی مجدد';
      }
    }

    const confirmed = await this.confirmDialog.open({
      title: 'بازگرداندن وضعیت کالا',
      message: `آیا از لغو پیش‌نویس و بازگرداندن این کالا به وضعیت «${statusLabel}» اطمینان دارید؟`,
      confirmText: 'بله، بازگردان',
      cancelText: 'انصراف',
      type: 'warning'
    });
    if (!confirmed) return;

    try {
      const ok = await this.facade.revertTaskStatus(task, previousStatus, this.localFirst, this.currentUserId!, this.auth.user());
      if (ok) {
        task.status = previousStatus;
        task.counted_balance = null;
        if (this.selectedTask && this.selectedTask.id === task.id) {
          this.countedBalanceStr = '';
          this.selectedTask.status = previousStatus;
          this.selectedTask.counted_balance = null;
        }
        this.selectedTasks.delete(task.id);
        this.applyFilters();
        this.toast.success('وضعیت کالا به حالت قبل بازگشت');
      }
    } catch {
      this.toast.error('خطا در بازگرداندن وضعیت کالا');
    }
    this.cdr.detectChanges();
  }

  /** ثبت و ارسال مستقیم یک کالا به سرپرست/مدیر از نمای Detail */
  async submitDirectlyToSupervisor() {
    if (!this.selectedTask) return;
    if (this.isReadOnly(this.selectedTask)) {
      this.closeDetail();
      return;
    }
    const rawVal = normalizeDigits(this.countedBalanceStr);
    this.countedBalanceStr = rawVal;
    if (rawVal === '') {
      this.toast.error('لطفاً ابتدا مقدار شمارش شده را وارد نمایید');
      return;
    }
    const num = Number(rawVal);
    if (isNaN(num) || num < 0) {
      this.toast.error('مقدار شمارش شده نمی‌تواند منفی یا نامعتبر باشد');
      return;
    }
    this.isSubmitting = true;
    this.cdr.detectChanges();

    const task = this.selectedTask;
    const whId = this.state.appState.activeWarehouseId;
    try {
      const res = await this.facade.submitDirectly(
        task,
        rawVal,
        this.counterNote,
        this.localFirst,
        this.currentUserId!,
        this.auth.user(),
        whId,
        this.editableFormFields,
        this.editableValues
      );
      if (res.success) {
        this.selectedTasks.delete(task.id);
        this.applyFilters();
        this.toast.success(task.skip_supervisor ? 'کالا با موفقیت مستقیم به مدیر ارسال شد' : 'کالا با موفقیت به سرپرست ارسال شد');
        this.closeDetail();
        if (this.localFirst) {
          this.readFromLocal(false);
        }
      }
    } catch {
      this.toast.error('خطا در ارسال اطلاعات');
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  /** ارسال سریع تک‌کلیکه یک کالا مستقیم از روی کارت آماده ارسال */
  async quickSubmitTask(task: CountTask, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.isReadOnly(task) || task.counted_balance === null || task.counted_balance === undefined) {
      this.toast.error('این کالا مقدار شمارش‌شده معتبر ندارد');
      return;
    }
    const confirmed = await this.confirmDialog.open({
      title: 'ارسال سریع به سرپرست',
      message: `آیا از ارسال کالای «${task.item_details?.description || task.item_details?.fa_unic_code}» با مقدار شمارش‌شده ${task.counted_balance} به سرپرست اطمینان دارید؟`,
      confirmText: 'بله، ارسال کن',
      cancelText: 'انصراف',
      type: 'info'
    });
    if (!confirmed) return;

    const whId = this.state.appState.activeWarehouseId;
    try {
      const res = await this.facade.quickSubmitTask(task, this.localFirst, this.currentUserId!, this.auth.user(), whId);
      if (res.success) {
        this.selectedTasks.delete(task.id);
        this.applyFilters();
        this.toast.success(res.message || (task.skip_supervisor ? 'کالا با موفقیت به مدیر ارسال شد' : 'کالا با موفقیت به سرپرست ارسال شد'));
        if (this.localFirst) this.readFromLocal(false);
      }
    } catch {
      this.toast.error('خطا در ارسال اطلاعات');
    }
    this.cdr.detectChanges();
  }

  private async saveExtraEditedFields(task: CountTask) {
    await this.facade.saveExtraEditedFields(task, this.editableFormFields, this.editableValues);
  }

  toggleSelection(taskId: number) {
    if (this.selectedTasks.has(taskId)) {
      this.selectedTasks.delete(taskId);
    } else {
      this.selectedTasks.add(taskId);
    }
    this.cdr.detectChanges();
  }

  onSelectionChange(selectedIds: Set<any>) {
    this.selectedTasks = new Set(Array.from(selectedIds).map(id => Number(id)));
    this.cdr.detectChanges();
  }

  toggleAll() {
    const readyTasks = this.filteredTasks.filter(t => (t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && t.counted_balance !== null && t.counted_balance !== undefined)) && !this.isReadOnly(t));
    if (this.selectedTasks.size === readyTasks.length && readyTasks.length > 0) {
      this.selectedTasks.clear();
    } else {
      readyTasks.forEach(t => this.selectedTasks.add(t.id));
    }
    this.cdr.detectChanges();
  }

  clearAllSelections() {
    this.selectedTasks.clear();
    this.selectedPoolTasks.clear();
    this.cdr.detectChanges();
  }

  submitSelected() {
    this.submitAll();
  }

  async submitAll() {
    const isReady = (t: CountTask) => t.status === 'INITIAL_COUNT' || (t.status === 'PENDING_COUNT' && t.counted_balance !== null && t.counted_balance !== undefined);
    const tasksToSubmit = this.tasks.filter(isReady);
    if (tasksToSubmit.length === 0) {
      this.toast.warning('هیچ کالای آماده ارسالی یافت نشد');
      return;
    }
    const confirmed = await this.confirmDialog.open({
      title: 'ارسال همه کالاها به سرپرست',
      message: `آیا از ارسال ${tasksToSubmit.length} کالای شمارش‌شده به سرپرست اطمینان دارید؟`,
      confirmText: 'بله، ارسال همه',
      cancelText: 'انصراف',
      type: 'info'
    });
    if (!confirmed) return;

    this.isSubmitting = true;
    this.cdr.detectChanges();
    const whId = this.state.appState.activeWarehouseId;
    try {
      const res = await this.facade.submitAll(tasksToSubmit, this.localFirst, this.currentUserId!, this.auth.user(), whId);
      if (res.success) {
        this.selectedTasks.clear();
        this.applyFilters();
        this.toast.success(res.message || `${res.count} کالا با موفقیت ارسال شد`);
        if (this.localFirst) this.readFromLocal(false);
      }
    } catch {
      this.toast.error('خطا در ارسال دسته‌ای کالاها');
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  // Export Methods
  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.selectedTasks.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
    
    if (this.availableExportColumns.length === 0) {
      this.countTaskApi.getExportColumns().subscribe({
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
    
    const payload: any = {
      data_scope: this.exportDataScope,
      columns_scope: this.exportColumnScope,
      as_role: 'counter',
    };
    
    if (this.exportDataScope === 'selected') {
      payload.selected_ids = Array.from(this.selectedTasks);
    }
    
    if (this.exportColumnScope === 'custom') {
      payload.columns_list = Array.from(this.selectedExportColumns);
    } else if (this.exportColumnScope === 'visible') {
      payload.columns_list = this.fieldConfigs.filter(f => f.visible).map(f => f.key);
    }
    
    const params: any = { as_role: 'counter' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }
    if (this.exportDataScope !== 'selected') {
      if (this.statusFilter && this.statusFilter !== 'all') {
        params.status = this.statusFilter;
      }
      if (this.dateFilter && this.dateFilter !== 'all') {
        params.date = this.dateFilter;
      }
      if (this.searchQuery && this.searchQuery.trim()) {
        params.q = this.searchQuery.trim();
      }
    }

    this.exportSubscription = this.countTaskApi.exportExcel({ ...payload, ...params }).subscribe({
      next: (blob) => {
        try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_counter_${new Date().getTime()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch(e) {
          console.error('File download error', e);
        }
        
        this.isExporting = false;
        this.closeExportModal();
        this.toast.success('خروجی اکسل با موفقیت دانلود شد.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Export error:', err);
        this.toast.error('خطا در دریافت فایل خروجی');
        this.isExporting = false;
        this.cdr.detectChanges();
      }
    });
  }

  downloadSampleTemplate() {
    if (this.isDownloadingTemplate) return;
    this.isDownloadingTemplate = true;
    const whId = this.state.appState.activeWarehouseId;
    this.countTaskApi.downloadTemplate(whId).subscribe({
      next: (blob) => {
        try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Counter_Template_${new Date().getTime()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.toast.success('قالب اکسل نمونه با موفقیت دانلود شد.');
        } catch (e) {
          console.error('Template download error', e);
          this.toast.error('خطا در دانلود فایل نمونه');
        }
        this.isDownloadingTemplate = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Template download error:', err);
        this.toast.error('خطا در دریافت فایل نمونه از سرور');
        this.isDownloadingTemplate = false;
        this.cdr.detectChanges();
      }
    });
  }

}
