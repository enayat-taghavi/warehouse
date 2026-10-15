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
import { formatToStandardShamsi } from '../../../../core/utils/date-utils';
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

const DOC_TASK_DIRECT_KEYS = new Set([
  'added_rti_no',
  'inv_rti_number',
  'invoice_type',
  'invoice_date',
  'invoice_page',
  'page_row',
  'doc_supplier',
  'total_value',
  'price_amount',
  'similar_unit_price',
  'currency',
  'folder_address',
  'stamp',
  'signature',
  'worker_note'
]);

@Component({
  selector: 'app-customs',
  standalone: true,
  imports: [CommonModule, FormsModule, PersianDatePipe, WarehouseSelectorComponent, OfflinePendingBadgeComponent, BarcodeScannerComponent, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent],
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

  private normalizeText(str: string | null | undefined): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[آأإ]/g, 'ا')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ة/g, 'ه')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
  }

  hasDocData(task: DocTask | null): boolean {
    if (!task) return false;
    return Boolean(
      task.invoice_type ||
      task.invoice_date ||
      task.inv_rti_number ||
      task.added_rti_no ||
      task.doc_supplier ||
      task.total_value ||
      task.price_amount ||
      task.similar_unit_price ||
      task.currency ||
      task.folder_address ||
      task.stamp ||
      task.signature ||
      (task.worker_note && task.worker_note.trim())
    );
  }

  isTaskReady(task: DocTask): boolean {
    if (this.isReadOnly(task)) return false;
    return (task.status === 'PENDING_DOC' && this.hasDocData(task)) ||
           ((task.status === 'DOC_SUPERVISOR_REJECTED' || task.status === 'DOC_MANAGER_REJECTED') && this.hasDocData(task));
  }

  isTaskSelectable(task: DocTask): boolean {
    if (this.isReadOnly(task)) return false;
    return this.hasDocData(task) || task.status === 'DOC_SUPERVISOR_REJECTED' || task.status === 'DOC_MANAGER_REJECTED';
  }

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
    const rawQ = (this.searchQuery || '').trim();
    const q = this.normalizeText(rawQ);
    const convertedQ = this.normalizeText(this.convertPersianKeyboardToEnglish(rawQ));

    // 1. Calculate Performance Metrics
    this.totalTasksCount = this.tasks.length;
    this.completedTasksCount = this.tasks.filter(t =>
      ['DOC_PROCESSED', 'DOC_MANAGER_REVIEW', 'DOC_FINAL_APPROVED'].includes(t.status)
    ).length;
    this.remainingTasksCount = this.tasks.filter(t =>
      ['PENDING_DOC', 'DOC_SUPERVISOR_REJECTED', 'DOC_MANAGER_REJECTED'].includes(t.status)
    ).length;

    // 2. Calculate Status Counts
    this.statusCounts = {
      untouched: this.tasks.filter(t => t.status === 'PENDING_DOC' && !this.hasDocData(t)).length,
      rejected: this.tasks.filter(t => (t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED') && !this.hasDocData(t)).length,
      ready: this.tasks.filter(t => this.isTaskReady(t)).length,
      completed: this.completedTasksCount,
      all: this.tasks.length
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const week = today - 7 * 86400000;

    const matchesDate = (t: DocTask) => {
      if (this.dateFilter === 'all') return true;
      const dateStr = (t as any).updated_at || t.created_at;
      if (!dateStr) return true;
      const taskTime = new Date(dateStr).getTime();
      if (this.dateFilter === 'today') return taskTime >= today;
      if (this.dateFilter === 'yesterday') return taskTime >= yesterday && taskTime < today;
      if (this.dateFilter === 'week') return taskTime >= week;
      return true;
    };

    const matchesLocation = (t: DocTask) => {
      if (this.locationFilter === 'all') return true;
      const loc = (t.item_details?.new_location || t.item_details?.old_location || '').trim().toLowerCase();
      return loc.includes(this.locationFilter.toLowerCase());
    };

    const matchesSearch = (t: DocTask) => {
      if (!q && !convertedQ) return true;
      const item = t.item_details as any;
      let dynMatch = false;
      if (item?.dynamic_data && typeof item.dynamic_data === 'object') {
        for (const val of Object.values(item.dynamic_data)) {
          if (val !== null && val !== undefined) {
            const normVal = this.normalizeText(String(val));
            if ((q && normVal.includes(q)) || (convertedQ && normVal.includes(convertedQ))) {
              dynMatch = true;
              break;
            }
          }
        }
      }
      return (
        dynMatch ||
        (q && this.normalizeText(item?.fa_unic_code).includes(q)) ||
        (convertedQ && this.normalizeText(item?.fa_unic_code).includes(convertedQ)) ||
        (q && this.normalizeText(item?.en_unic_code).includes(q)) ||
        (convertedQ && this.normalizeText(item?.en_unic_code).includes(convertedQ)) ||
        (q && this.normalizeText(item?.item_no).includes(q)) ||
        (convertedQ && this.normalizeText(item?.item_no).includes(convertedQ)) ||
        (q && this.normalizeText(item?.description).includes(q)) ||
        (convertedQ && this.normalizeText(item?.description).includes(convertedQ)) ||
        (q && this.normalizeText(item?.po).includes(q)) ||
        (convertedQ && this.normalizeText(item?.po).includes(convertedQ)) ||
        (q && this.normalizeText(item?.pk_number).includes(q)) ||
        (convertedQ && this.normalizeText(item?.pk_number).includes(convertedQ)) ||
        (q && this.normalizeText(item?.plpkitem).includes(q)) ||
        (convertedQ && this.normalizeText(item?.plpkitem).includes(convertedQ)) ||
        (q && this.normalizeText(item?.pl).includes(q)) ||
        (convertedQ && this.normalizeText(item?.pl).includes(convertedQ)) ||
        (q && this.normalizeText(item?.tag).includes(q)) ||
        (convertedQ && this.normalizeText(item?.tag).includes(convertedQ)) ||
        (q && this.normalizeText(item?.size).includes(q)) ||
        (convertedQ && this.normalizeText(item?.size).includes(convertedQ)) ||
        (q && this.normalizeText(item?.new_location).includes(q)) ||
        (convertedQ && this.normalizeText(item?.new_location).includes(convertedQ)) ||
        (q && this.normalizeText(item?.warehouse_name).includes(q)) ||
        (convertedQ && this.normalizeText(item?.warehouse_name).includes(convertedQ)) ||
        (q && this.normalizeText(t.doc_supplier).includes(q)) ||
        (convertedQ && this.normalizeText(t.doc_supplier).includes(convertedQ)) ||
        (q && this.normalizeText(t.inv_rti_number).includes(q)) ||
        (convertedQ && this.normalizeText(t.inv_rti_number).includes(convertedQ)) ||
        (q && this.normalizeText(t.added_rti_no).includes(q)) ||
        (convertedQ && this.normalizeText(t.added_rti_no).includes(convertedQ)) ||
        (q && this.normalizeText(t.worker_note).includes(q)) ||
        (convertedQ && this.normalizeText(t.worker_note).includes(convertedQ)) ||
        (q && this.normalizeText(t.supervisor_note).includes(q)) ||
        (convertedQ && this.normalizeText(t.supervisor_note).includes(convertedQ)) ||
        (q && this.normalizeText(t.manager_note).includes(q)) ||
        (convertedQ && this.normalizeText(t.manager_note).includes(convertedQ))
      );
    };

    // 3. Filter My Tasks
    this.filteredTasks = this.tasks.filter(t => {
      let matchStatus = true;
      if (this.statusFilter === 'untouched') {
        matchStatus = t.status === 'PENDING_DOC' && !this.hasDocData(t);
      } else if (this.statusFilter === 'rejected') {
        matchStatus = (t.status === 'DOC_SUPERVISOR_REJECTED' || t.status === 'DOC_MANAGER_REJECTED') && !this.hasDocData(t);
      } else if (this.statusFilter === 'ready') {
        matchStatus = this.isTaskReady(t);
      } else if (this.statusFilter === 'completed') {
        matchStatus = ['DOC_PROCESSED', 'DOC_MANAGER_REVIEW', 'DOC_FINAL_APPROVED'].includes(t.status);
      } // 'all' matches everything

      return matchStatus && matchesDate(t) && matchesLocation(t) && matchesSearch(t);
    });

    // 4. Sort My Tasks
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    this.filteredTasks.sort((a, b) => {
      if (this.sortBy === 'fa_unic_code') {
        return (a.item_details?.fa_unic_code || '').localeCompare(b.item_details?.fa_unic_code || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      if (this.sortBy === 'description') {
        return (a.item_details?.description || '').localeCompare(b.item_details?.description || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      if (this.sortBy === 'po') {
        return (a.item_details?.po || '').localeCompare(b.item_details?.po || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      if (this.sortBy === 'inv_rti_number') {
        return (a.inv_rti_number || '').localeCompare(b.inv_rti_number || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      // default: updated_at (desc by default when dir is -1)
      const dateA = new Date((a as any).updated_at || a.created_at || 0).getTime();
      const dateB = new Date((b as any).updated_at || b.created_at || 0).getTime();
      return (dateA - dateB) * dir;
    });

    // 5. Filter & Sort Pool Tasks
    this.filteredPoolTasks = this.poolTasks.filter(t => matchesSearch(t) && matchesDate(t) && matchesLocation(t));
    this.filteredPoolTasks.sort((a, b) => {
      if (this.sortBy === 'fa_unic_code') {
        return (a.item_details?.fa_unic_code || '').localeCompare(b.item_details?.fa_unic_code || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      if (this.sortBy === 'description') {
        return (a.item_details?.description || '').localeCompare(b.item_details?.description || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      if (this.sortBy === 'po') {
        return (a.item_details?.po || '').localeCompare(b.item_details?.po || '', 'fa', { sensitivity: 'base' }) * dir;
      }
      const dateA = new Date((a as any).updated_at || a.created_at || 0).getTime();
      const dateB = new Date((b as any).updated_at || b.created_at || 0).getTime();
      return (dateA - dateB) * dir;
    });
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
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Escape: close modal / detail / sort menu
    if (event.key === 'Escape') {
      if (this.isSortMenuOpen) {
        event.preventDefault();
        this.isSortMenuOpen = false;
        this.cdr.detectChanges();
        return;
      }
      if (this.isScanBatchModalOpen) {
        event.preventDefault();
        this.closeScanBatchModal();
        return;
      }
      if (this.isExportModalOpen) {
        event.preventDefault();
        this.closeExportModal();
        return;
      }
      if (this.selectedTask) {
        event.preventDefault();
        this.closeDetail();
        return;
      }
    }

    // Close sort menu on clicking outside or keyboard
    if (this.isSortMenuOpen && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      this.isSortMenuOpen = false;
      this.cdr.detectChanges();
    }

    // Modal isolation: disable background shortcuts when any modal is open
    if (this.isScanBatchModalOpen || this.isExportModalOpen) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && this.isExportModalOpen && !this.isExporting) {
        event.preventDefault();
        this.executeExport();
      }
      return;
    }

    // Ctrl+Enter: Save draft in detail view, or Submit selected in dashboard
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (this.selectedTask && !this.isReadOnly(this.selectedTask)) {
        event.preventDefault();
        this.saveDraft();
        return;
      } else if (!this.selectedTask) {
        if (this.currentTab === 'my-tasks' && this.selectedTasks.size > 0 && !this.isSaving) {
          event.preventDefault();
          this.submitSelected();
          return;
        } else if (this.currentTab === 'pool' && this.selectedPoolTasks.size > 0 && !this.isLoading) {
          event.preventDefault();
          this.claimSelectedTasks();
          return;
        }
      }
    }

    // Alt+1: My tasks tab, Alt+2: Pool tab
    if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      if (event.key === '1' || event.key === '۱') {
        event.preventDefault();
        this.setTab('my-tasks');
        return;
      } else if (event.key === '2' || event.key === '۲') {
        event.preventDefault();
        this.setTab('pool');
        return;
      }
    }

    // Hardware Keyboard Wedge Barcode Scanner Listener
    if (!this.selectedTask && !isInsideInput) {
      const now = Date.now();
      if (now - this.lastKeyTime > 500) {
        this.barcodeBuffer = '';
      }
      this.lastKeyTime = now;

      if (event.key === 'Enter') {
        if (this.barcodeBuffer.length >= 3) {
          const code = this.barcodeBuffer;
          this.barcodeBuffer = '';
          event.preventDefault();
          this.onBarcodeScanned(code);
        }
      } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        this.barcodeBuffer += event.key;
      }
    }
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

  loadTasks(showLoading = true) {
    if (this.localFirst) {
      this.readFromLocal(showLoading);
      this.store.refresh(this.activeWarehouseId!);
      return;
    }
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    const params: any = { as_role: 'doc_worker', page_size: 1000 };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;

    this.docTaskApi.getAll(params).subscribe({
      next: (res: any) => {
        const newTasks = Array.isArray(res) ? res : (res.results || []);
        this.trackUpdates(this.tasks, newTasks);
        this.tasks = newTasks;
        this.tasksLoaded = true;
        this.applyFilters();
        this.checkPendingUrlTask();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در دریافت اطلاعات');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadPoolTasks(showLoading = true) {
    if (this.localFirst) {
      this.readFromLocal(showLoading);
      this.store.refresh(this.activeWarehouseId!);
      return;
    }
    if (showLoading) { this.isLoading = true; this.cdr.detectChanges(); }
    const params: any = { as_role: 'doc_worker' };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;

    this.docTaskApi.poolTasks(params).subscribe({
      next: (res: any) => {
        const newPoolTasks = Array.isArray(res) ? res : [];
        this.trackUpdates(this.poolTasks, newPoolTasks);
        this.poolTasks = newPoolTasks;
        this.poolTasksLoaded = true;
        this.applyFilters();
        this.checkPendingUrlTask();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در دریافت تسک‌های استخر');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
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
    const whId = this.activeWarehouseId;
    const numWhId = whId ? Number(whId) : undefined;

    if (this.localFirst && numWhId) {
      try {
        const localDf = await offlineDb.dynamicFields.where('warehouse_id').equals(numWhId).toArray();
        if (localDf && localDf.length > 0) {
          this.dynamicFieldsList = localDf as any;
        }
      } catch (e) {
        console.warn('[Customs] Could not read dynamicFields from Dexie', e);
      }
    }

    this.dynamicFieldApi.getFields(numWhId).subscribe({
      next: (dfRes: any) => {
        this.dynamicFieldsList = Array.isArray(dfRes) ? dfRes : (dfRes?.results || []);
        this.fetchFieldSettings(numWhId);
      },
      error: async () => {
        if (numWhId) {
          try {
            const localDf = await offlineDb.dynamicFields.where('warehouse_id').equals(numWhId).toArray();
            this.dynamicFieldsList = (localDf as any) || [];
          } catch (e) {}
        }
        this.fetchFieldSettings(numWhId);
      }
    });
  }

  private fetchFieldSettings(whId?: number) {
    if (whId) {
      this.settingsService.getWarehouseSettings(whId).subscribe({
        next: (res: any) => {
          const savedPerms = res?.field_permissions_doc?.value;
          this.fieldConfigs = mergeDocFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.scannerRowSep = this.decodeDelimiter(res?.scanner_row_delimiter?.value ?? res?.scanner_row_delimiter ?? ';');
          this.scannerColSep = this.decodeDelimiter(res?.scanner_col_delimiter?.value ?? res?.scanner_col_delimiter ?? '|');
          this.scannerCameraPreset = res?.scanner_camera_preset?.value ?? res?.scanner_camera_preset ?? 'adaptive';
          this.financialCanViewHistory = res?.financial_can_view_history?.value ?? res?.financial_can_view_history ?? true;
          this.financialCanViewPreviousNotes = res?.financial_can_view_previous_notes?.value ?? res?.financial_can_view_previous_notes ?? true;
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeDocFieldPermissions(null, this.dynamicFieldsList);
          this.cdr.detectChanges();
        }
      });
    } else {
      this.settingsService.getGlobalSettings().subscribe({
        next: (res: any) => {
          const savedPerms = res?.field_permissions_doc;
          this.fieldConfigs = mergeDocFieldPermissions(savedPerms, this.dynamicFieldsList);
          this.scannerRowSep = this.decodeDelimiter(res?.scanner_row_delimiter ?? ';');
          this.scannerColSep = this.decodeDelimiter(res?.scanner_col_delimiter ?? '|');
          this.scannerCameraPreset = res?.scanner_camera_preset ?? 'adaptive';
          this.financialCanViewHistory = res?.financial_can_view_history ?? true;
          this.financialCanViewPreviousNotes = res?.financial_can_view_previous_notes ?? true;
          this.cdr.detectChanges();
        },
        error: () => {
          this.fieldConfigs = mergeDocFieldPermissions(null, this.dynamicFieldsList);
          this.cdr.detectChanges();
        }
      });
    }
  }

  decodeDelimiter(val: string): string {
    if (!val) return val;
    if (val === 'Chr(30)') return '\x1E';
    if (val === 'Chr(31)') return '\x1F';
    if (val === 'Chr(30) & ";"') return '\x1E;';
    if (val === 'Chr(31) & "|"') return '\x1F|';
    if (val === '\\n') return '\n';
    if (val === '\\t') return '\t';
    return val;
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

  // ════════════════════════════════════════════
  //  Financial Helpers & Formatting
  // ════════════════════════════════════════════

  isFinancialField(key: string): boolean {
    return ['price_amount', 'similar_unit_price', 'total_value'].includes(key);
  }

  formatNumberWithCommas(val: any): string {
    if (val === null || val === undefined || val === '') return '';
    const parts = String(val).replace(/,/g, '').split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

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
    const price = this.getNumericValue('price_amount');
    const item = this.selectedTask?.item_details as any;
    const inventory = Number(item?.balance || item?.inventory || item?.bal4miv || item?.count || item?.quantity || item?.dynamic_data?.inventory || 0);
    if (price > 0 && inventory > 0) {
      const total = Math.round(price * inventory * 100) / 100;
      this.editableValues['total_value'] = this.formatNumberWithCommas(total);
      this.toast.info(`ارزش کل بر اساس ${inventory} عدد × ${this.formatNumberWithCommas(price)} محاسبه شد: ${this.formatNumberWithCommas(total)}`);
      this.cdr.detectChanges();
    } else if (price <= 0) {
      this.toast.warning('لطفاً ابتدا مبلغ / قیمت واحد را وارد نمایید.');
    } else {
      this.toast.warning('موجودی یا تعداد این کالا در سیستم ثبت نشده است (۰). ارزش کل را می‌توانید دستی وارد فرمایید.');
    }
  }

  setTodayDate(fieldKey: string) {
    const today = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tehran'
      });
      const parts = formatter.formatToParts(today);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      this.editableValues[fieldKey] = `${y}/${m}/${d}`;
    } catch {
      const iso = today.toISOString().split('T')[0];
      this.editableValues[fieldKey] = iso;
    }
    this.cdr.detectChanges();
  }

  isDateValid(val: string): boolean {
    if (!val) return true;
    const clean = String(val).trim();
    return /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(clean);
  }

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

    let previousStatus: DocTaskStatus = 'PENDING_DOC';
    let statusLabel = 'در انتظار';
    if (task.manager_note) {
      previousStatus = 'DOC_MANAGER_REJECTED';
      statusLabel = 'بررسی مجدد (مدیر)';
    } else if (task.supervisor_note) {
      previousStatus = 'DOC_SUPERVISOR_REJECTED';
      statusLabel = 'بررسی مجدد (سرپرست)';
    }

    const confirmed = await this.confirmDialog.open({
      title: 'بازگرداندن وضعیت کالا',
      message: `آیا از لغو پیش‌نویس و بازگرداندن این کالا به وضعیت «${statusLabel}» اطمینان دارید؟`,
      confirmText: 'بله، بازگردان',
      cancelText: 'انصراف',
      type: 'warning'
    });
    if (!confirmed) return;

    const payload: any = {
      status: previousStatus
    };

    if (previousStatus === 'PENDING_DOC') {
      payload.added_rti_no = '';
      payload.inv_rti_number = '';
      payload.invoice_type = null;
      payload.invoice_date = null;
      payload.invoice_page = null;
      payload.page_row = null;
      payload.doc_supplier = '';
      payload.total_value = null;
      payload.price_amount = null;
      payload.similar_unit_price = null;
      payload.currency = null;
      payload.folder_address = '';
      payload.stamp = false;
      payload.signature = false;
      payload.worker_note = '';
    }

    if (this.selectedTask && this.selectedTask.id === task.id) {
      this.closeDetail(true);
    }

    this.selectedTasks.delete(task.id);

    const revertHistoryRecord: any = {
      id: Date.now(),
      action_type: 'CANCELLED',
      action_by_name: this.auth.user()?.username || 'کارشناس مالی',
      created_at: new Date().toISOString(),
      note: `لغو پیش‌نویس و بازگشت به وضعیت «${statusLabel}»`
    };
    if (!task.history) task.history = [];
    task.history = [revertHistoryRecord, ...task.history];

    if (this.localFirst && task.sync_id) {
      try {
        await this.store.saveDraft(task, payload, this.currentUserId!);
        Object.assign(task, payload, { _offlinePending: true });
        this.applyFilters();
        this.toast.success(`کالا به وضعیت «${statusLabel}» بازگردانده شد`);
      } catch (e) {
        console.error('[Customs] خطا در بازگرداندن وضعیت محلی:', e);
        this.toast.error('خطا در بازگرداندن وضعیت کالا');
      }
      this.cdr.detectChanges();
      return;
    }

    this.docTaskApi.update(task.id, payload).subscribe({
      next: () => {
        Object.assign(task, payload);
        this.applyFilters();
        this.toast.success(`کالا به وضعیت «${statusLabel}» بازگردانده شد`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در بازگرداندن وضعیت کالا');
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════
  //  Detail Panel
  // ════════════════════════════════════════════

  convertToShamsiDateString(val: any): string {
    if (!val) return '';
    return formatToStandardShamsi(val) || String(val).trim();
  }

  openDetail(task: DocTask, updateUrl = true) {
    this.selectedTask = task;
    this.f_worker_note = task.worker_note || '';

    if (task.history && task.history.length > 1) {
      task.history = task.history.slice().sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });
    }

    this.editableValues = {};
    const item: any = task.item_details || {};

    this.editableFormFields.forEach(f => {
      if (DOC_TASK_DIRECT_KEYS.has(f.key)) {
        const val = (task as any)[f.key];
        if (f.key === 'invoice_date' && val) {
          this.editableValues[f.key] = this.convertToShamsiDateString(val);
        } else if (this.isFinancialField(f.key) && val !== undefined && val !== null && val !== '') {
          this.editableValues[f.key] = this.formatNumberWithCommas(val);
        } else {
          this.editableValues[f.key] = val !== undefined && val !== null ? val : '';
        }
      } else if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        this.editableValues[f.key] = item.dynamic_data?.[realKey] ?? '';
      } else {
        this.editableValues[f.key] = item[f.key] ?? '';
      }
    });

    if (this.editableValues['worker_note'] !== undefined) {
      this.f_worker_note = this.editableValues['worker_note'];
    }

    this.initialFormSnapshot = JSON.stringify({ values: this.editableValues, note: this.f_worker_note });

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
    const payload: Partial<DocTask> = {
      worker_note: this.f_worker_note || this.editableValues['worker_note'] || null
    };

    DOC_TASK_DIRECT_KEYS.forEach(key => {
      if (key === 'worker_note') return;
      if (this.editableValues[key] !== undefined) {
        const val = this.editableValues[key];
        if (key === 'stamp' || key === 'signature') {
          (payload as any)[key] = Boolean(val);
        } else if (key === 'invoice_page' || key === 'page_row') {
          (payload as any)[key] = val !== '' && val !== null ? Number(val) : null;
        } else if (this.isFinancialField(key)) {
          const clean = val !== '' && val !== null ? String(val).replace(/,/g, '').trim() : null;
          (payload as any)[key] = clean && !isNaN(Number(clean)) ? clean : null;
        } else {
          (payload as any)[key] = val !== '' && val !== null ? val : null;
        }
      } else {
        (payload as any)[key] = (this.selectedTask as any)?.[key] ?? null;
      }
    });

    return payload;
  }

  private async saveExtraEditedFields(): Promise<void> {
    if (!this.selectedTask) return;

    const itemPayload: Record<string, any> = {};
    const dynamicDataUpdates: Record<string, any> = {};
    let hasChanges = false;

    this.editableFormFields.forEach(f => {
      if (DOC_TASK_DIRECT_KEYS.has(f.key)) return;
      const newVal = this.editableValues[f.key];
      if (f.is_dynamic) {
        const realKey = f.key.replace(/^dyn_/, '');
        dynamicDataUpdates[realKey] = newVal;
        hasChanges = true;
      } else {
        itemPayload[f.key] = newVal;
        hasChanges = true;
      }
    });

    if (Object.keys(dynamicDataUpdates).length > 0) {
      const existingDyn = (this.selectedTask.item_details as any)?.dynamic_data || {};
      itemPayload['dynamic_data'] = { ...existingDyn, ...dynamicDataUpdates };
    }

    if (hasChanges && Object.keys(itemPayload).length > 0) {
      const itemSyncId = (this.selectedTask.item_details as any)?.sync_id;
      const itemId = String(this.selectedTask.item_details?.id || this.selectedTask.item);

      if (this.localFirst && itemSyncId) {
        try {
          await offlineDb.items.update(itemSyncId, {
            ...itemPayload,
            _offlinePending: true
          });
          await OfflineSyncService.getInstance().enqueue(
            'PATCH',
            `${environment.apiUrl}/inventory/items/${itemId}/`,
            itemPayload,
            {
              userId: this.currentUserId!,
              entityType: 'item',
              entitySyncId: itemSyncId
            }
          );
          OfflineSyncService.getInstance().processQueue();
        } catch (err) {
          console.warn('[Customs] Could not update local item in Dexie', err);
        }
      } else if (itemId && itemId !== 'undefined') {
        try {
          await firstValueFrom(this.itemApi.update(itemId, itemPayload));
        } catch (err) {
          console.warn('Could not save extra item fields', err);
        }
      }
    }
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
    const payload = this.buildPayload();

    const draftHistoryRecord: any = {
      id: Date.now(),
      action_type: 'DOC_DRAFT_SAVED',
      action_by_name: this.auth.user()?.username || 'کارشناس مالی',
      created_at: new Date().toISOString(),
      note: this.f_worker_note || 'ذخیره پیش‌نویس مدارک مالی'
    };
    if (!this.selectedTask.history) this.selectedTask.history = [];
    this.selectedTask.history = [draftHistoryRecord, ...this.selectedTask.history];

    if (this.localFirst && this.selectedTask.sync_id) {
      try {
        await this.store.saveDraft(this.selectedTask, payload, this.currentUserId!);
        Object.assign(this.selectedTask, payload, { _offlinePending: true });
        this.saveExtraEditedFields();
        this.applyFilters();
        this.initialFormSnapshot = JSON.stringify({ values: this.editableValues, note: this.f_worker_note });
        if (showToast) {
          this.toast.success('پیش‌نویس ذخیره شد');
          this.closeDetail(true);
        }
      } catch (e) {
        this.toast.error('خطا در ذخیره اطلاعات');
      }
      this.isSaving = false;
      this.cdr.detectChanges();
      return;
    }

    this.docTaskApi.update(this.selectedTask.id, payload).subscribe({
      next: (res) => {
        Object.assign(this.selectedTask!, res);
        this.saveExtraEditedFields();
        this.applyFilters();
        this.initialFormSnapshot = JSON.stringify({ values: this.editableValues, note: this.f_worker_note });
        if (showToast) {
          this.toast.success('پیش‌نویس ذخیره شد');
          this.closeDetail(true);
        }
        this.isSaving = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.error('خطا در ذخیره اطلاعات');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
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
    const payload = this.buildPayload();

    const submitHistoryRecord: any = {
      id: Date.now(),
      action_type: 'DOC_PROCESSED',
      action_by_name: this.auth.user()?.username || 'کارشناس مالی',
      created_at: new Date().toISOString(),
      note: this.f_worker_note || 'تکمیل اسناد و ارسال جهت بررسی سرپرست'
    };
    if (!this.selectedTask.history) this.selectedTask.history = [];
    this.selectedTask.history = [submitHistoryRecord, ...this.selectedTask.history];

    if (this.localFirst && this.selectedTask.sync_id) {
      try {
        await this.store.saveDraft(this.selectedTask, payload, this.currentUserId!);
        await this.store.submitTasks([this.selectedTask], this.currentUserId!, this.activeWarehouseId || undefined);
        await this.saveExtraEditedFields();
        this.toast.success('سند با موفقیت به سرپرست ارسال شد');
        this.isSaving = false;
        this.closeDetail(true);
        this.readFromLocal(false);
      } catch {
        this.toast.error('خطا در ارسال سند');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
      return;
    }

    this.docTaskApi.update(this.selectedTask.id, payload).subscribe({
      next: async () => {
        await this.saveExtraEditedFields();
        const submitPayload: any = { task_ids: [this.selectedTask!.id] };
        if (this.activeWarehouseId) submitPayload.warehouse_id = this.activeWarehouseId;
        this.docTaskApi.bulkSubmit(submitPayload).subscribe({
          next: (res: any) => {
            if (res?.message && (res.message.includes('یافت نشد') || res.message.includes('هیچ سند مالی'))) {
              this.toast.warning(res.message);
              this.isSaving = false;
              this.loadTasks(false);
              this.cdr.detectChanges();
              return;
            }
            this.toast.success('سند با موفقیت به سرپرست ارسال شد');
            this.isSaving = false;
            this.closeDetail(true);
            this.loadTasks(false);
            this.cdr.detectChanges();
          },
          error: () => {
            this.toast.error('خطا در ارسال سند به سرپرست');
            this.isSaving = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        this.toast.error('خطا در ذخیره اطلاعات پیش‌نویس');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
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
      confirmText: 'بله، ارسال شود',
      cancelText: 'انصراف',
      type: 'info'
    });
    if (!confirmed) return;

    this.isSubmitting = true;
    this.cdr.detectChanges();

    try {
      if (this.localFirst && task.sync_id) {
        await this.store.submitTasks([task], this.currentUserId!, this.activeWarehouseId || undefined);
        this.toast.success('کالا جهت بررسی ارسال شد');
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } else {
        const payload: any = { task_ids: [task.id] };
        if (this.activeWarehouseId) payload.warehouse_id = this.activeWarehouseId;
        await new Promise<void>((resolve, reject) => {
          this.docTaskApi.bulkSubmit(payload).subscribe({
            next: (res: any) => {
              this.toast.success(res?.message || 'کالا با موفقیت ارسال شد');
              this.loadTasks(false);
              resolve();
            },
            error: (err: any) => {
              this.toast.error(err?.error?.error || 'خطا در ارسال کالا');
              reject(err);
            }
          });
        });
      }
    } catch (e) {
      console.error('Quick submit error', e);
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
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

    if (toSubmit.length === 0) {
      if (isPartial) {
        this.toast.warning('هیچ‌کدام از کالاهای انتخابی دارای اطلاعات سند مالی نیستند. لطفاً ابتدا اطلاعات را وارد کنید.');
      } else {
        this.toast.warning('هیچ سند مالی تکمیل‌شده‌ای برای ارسال وجود ندارد. لطفاً ابتدا اطلاعات اسناد را ثبت فرمایید.');
      }
      return;
    }

    const confirmed = await this.confirmDialog.open({
      title: isPartial ? 'ارسال موارد انتخابی' : 'ارسال همه موارد تکمیل‌شده',
      message: `آیا از ارسال ${toSubmit.length} سند مالی به سرپرست اطمینان دارید؟`,
      confirmText: 'بله، ارسال کن', cancelText: 'انصراف', type: 'info'
    });
    if (!confirmed) return;

    if (this.localFirst) {
      try {
        await this.store.submitTasks(toSubmit, this.currentUserId!, this.activeWarehouseId || undefined);
        this.toast.success(`${toSubmit.length} مورد در صف ارسال قرار گرفت`);
        this.selectedTasks.clear();
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } catch { this.toast.error('خطا در ارسال اطلاعات'); this.cdr.detectChanges(); }
      return;
    }

    const whId = this.state.appState.activeWarehouseId;
    const payload: any = { task_ids: toSubmit.map(t => t.id) };
    if (whId && whId !== 'ALL' && whId !== -1) {
      payload.warehouse_id = whId;
    }
    this.docTaskApi.bulkSubmit(payload).subscribe({
      next: (res) => { this.toast.success(res.message); this.selectedTasks.clear(); this.loadTasks(); },
      error: () => { this.toast.error('خطا در ارسال اطلاعات'); this.cdr.detectChanges(); }
    });
  }

  async claimSelectedTasks() {
    if (this.selectedPoolTasks.size === 0) return;

    if (this.localFirst) {
      const poolList = this.poolTasks.filter(t => this.selectedPoolTasks.has(t.id));
      try {
        await this.store.claimTasks(poolList, this.currentUserId!, 'doc_worker');
        this.toast.success(`${poolList.length} کالا با موفقیت به عهده گرفته شد`);
        this.selectedPoolTasks.clear();
        this.poolTasksLoaded = false;
        this.setTab('my-tasks');
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } catch {
        this.toast.error('خطا در بر عهده گرفتن کالاها');
      }
      return;
    }

    if (!navigator.onLine) {
      this.toast.error('بر عهده گرفتن کالاها نیاز به اتصال اینترنت دارد.');
      return;
    }

    this.docTaskApi.claimTasks(Array.from(this.selectedPoolTasks), 'doc_worker').subscribe({
      next: async (res) => {
        this.toast.success(`${res.claimed_count} کالا با موفقیت به عهده گرفته شد`);
        this.selectedPoolTasks.clear();
        this.poolTasksLoaded = false;
        this.setTab('my-tasks');
        this.loadTasks();
        this.loadPoolTasks(false);
      },
      error: (err) => this.toast.error(err?.error?.error || 'خطا در عملیات')
    });
  }

  // ════════════════════════════════════════════
  //  Barcode Scanner
  // ════════════════════════════════════════════

  private normalizeDigits(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[\/،]/g, '.')
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

  async onBarcodeScanned(code: string) {
    if (this.selectedTask) {
      this.toast.info('فرم جزئیات کالا باز است. برای اسکن کالای دیگر ابتدا فرم را ببندید.');
      return;
    }
    if (this.scanBusy || this.isScanBatchModalOpen) return;
    this.scanBusy = true;
    try {
      // ۱. بررسی ساختار چندردیفه/جدولی
      if (CustomsScannerParser.isMultiRowOrStructured(code, this.scannerRowSep, this.scannerColSep)) {
        const parsedTable = CustomsScannerParser.parseRawText(code, this.fieldConfigs, this.scannerRowSep, this.scannerColSep);
        if (parsedTable && parsedTable.rows.length > 0) {
          await this.processStructuredScan(parsedTable);
          return;
        }
      }

      // ۲. روال استاندارد تک‌بارکد
      const rawQ = (code || '').trim();
      const convertedQ = this.convertPersianKeyboardToEnglish(rawQ).toLowerCase();
      const normQ = this.normalizeDigits(rawQ).toLowerCase();
      const normConvertedQ = this.normalizeDigits(convertedQ).toLowerCase();
      const lowerRaw = rawQ.toLowerCase();

      const match = (t: DocTask) => {
        const item = t.item_details as any;
        const unic = (item?.fa_unic_code || '').trim().toLowerCase();
        const normUnic = this.normalizeDigits(unic).toLowerCase();
        const enUnic = (item?.en_unic_code || '').trim().toLowerCase();
        const itemNo = (item?.item_no || '').trim().toLowerCase();
        const normItemNo = this.normalizeDigits(itemNo).toLowerCase();
        const itemId = String(item?.id || t.item || '').trim();
        const po = (item?.po || '').trim().toLowerCase();
        const invRti = (t.inv_rti_number || '').trim().toLowerCase();
        const tag = (item?.tag || '').trim().toLowerCase();
        const pk = (item?.pk_number || '').trim().toLowerCase();
        const plpk = (item?.plpkitem || '').trim().toLowerCase();
        const pl = (item?.pl || '').trim().toLowerCase();

        return (
          unic === lowerRaw ||
          unic === convertedQ ||
          normUnic === normQ ||
          normUnic === normConvertedQ ||
          enUnic === normQ ||
          enUnic === convertedQ ||
          enUnic === normConvertedQ ||
          itemNo === lowerRaw ||
          itemNo === convertedQ ||
          normItemNo === normQ ||
          normItemNo === normConvertedQ ||
          itemId === normQ ||
          itemId === normConvertedQ ||
          (po && (po === lowerRaw || po === convertedQ || po === normQ || po === normConvertedQ)) ||
          (invRti && (invRti === lowerRaw || invRti === convertedQ || invRti === normQ || invRti === normConvertedQ)) ||
          (tag && (tag === lowerRaw || tag === convertedQ || tag === normQ || tag === normConvertedQ)) ||
          (pk && (pk === lowerRaw || pk === convertedQ || pk === normQ || pk === normConvertedQ)) ||
          (plpk && (plpk === lowerRaw || plpk === convertedQ || plpk === normQ || plpk === normConvertedQ)) ||
          (pl && (pl === lowerRaw || pl === convertedQ || pl === normQ || pl === normConvertedQ))
        );
      };

      let myTasks: DocTask[];
      let pool: DocTask[];

      if (this.localFirst) {
        [myTasks, pool] = await Promise.all([
          this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!),
          this.store.getPoolTasks(this.activeWarehouseId!),
        ]);
      } else {
        myTasks = this.tasks;
        pool = this.poolTasks.length > 0 ? this.poolTasks : await this.fetchPoolOnce();
      }

      // مرحله ۱: بررسی تطبیق مستقیم در کارتابل کارشناس
      const mine = myTasks.filter(match);
      if (mine.length === 1) {
        const target = mine[0];
        this.openDetail(target);
        return;
      } else if (mine.length > 1) {
        this.searchQuery = rawQ;
        this.searchSubject.next(rawQ);
        this.applyFilters();
        this.toast.info(`تعداد ${mine.length} کالا با مشخصه «${rawQ}» در کارتابل شما یافت شد.`);
        this.cdr.detectChanges();
        return;
      }

      // مرحله ۲: بررسی تطبیق مستقیم در استخر اقلام (Pool)
      const poolTask = pool.find(match);
      if (poolTask) {
        await this.claimScannedTask(poolTask);
        return;
      }

      // مرحله ۳: فالبک هوشمند به جستجوی همه‌جانبه روی تمامی فیلدها
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
    let myTasks: DocTask[];
    let pool: DocTask[];

    if (this.localFirst) {
      [myTasks, pool] = await Promise.all([
        this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!),
        this.store.getPoolTasks(this.activeWarehouseId!),
      ]);
    } else {
      myTasks = this.tasks;
      pool = this.poolTasks.length > 0 ? this.poolTasks : await this.fetchPoolOnce();
    }

    const rows: ParsedScanRow[] = [];
    let readyCount = 0;
    let poolCount = 0;
    let readOnlyCount = 0;
    let notFoundCount = 0;

    const editableKeyMap = new Map<string, FieldPermissionConfig>();
    this.fieldConfigs.forEach(f => {
      if (f.visible && f.editable) {
        editableKeyMap.set(f.key, f);
      }
    });

    table.rows.forEach((rawRow: any, idx: number) => {
      const rawUnic = (rawRow['fa_unic_code'] || '').trim();
      const normUnic = this.normalizeDigits(rawUnic).toLowerCase();

      const match = (t: DocTask) => {
        const tUnic = (t.item_details?.fa_unic_code || '').trim().toLowerCase();
        const tNormUnic = this.normalizeDigits(tUnic).toLowerCase();
        const tEnUnic = (t.item_details?.en_unic_code || '').trim().toLowerCase();
        return tUnic === rawUnic.toLowerCase() || tNormUnic === normUnic || tEnUnic === normUnic;
      };

      let matched = myTasks.find(match);
      let isFromPool = false;

      if (!matched) {
        matched = pool.find(match);
        if (matched) isFromPool = true;
      }

      let rowStatus: ParsedScanRowStatus = 'not_found';
      let statusMessage = 'کالا در کارتابل یا استخر یافت نشد';

      if (matched) {
        if (isFromPool) {
          rowStatus = 'pool';
          statusMessage = 'موجود در استخر اسناد (تخصیص خودکار به شما)';
          poolCount++;
        } else if (this.isReadOnly(matched)) {
          rowStatus = 'readonly';
          statusMessage = `کالا در وضعیت ${this.getStatusLabel(matched.status)} قرار دارد و غیرقابل ویرایش است`;
          readOnlyCount++;
        } else {
          rowStatus = 'ready';
          statusMessage = 'آماده اعمال تغییرات';
          readyCount++;
        }
      } else {
        notFoundCount++;
      }

      const changes: ParsedScanFieldChange[] = [];
      Object.keys(rawRow).forEach(key => {
        if (key === 'fa_unic_code' || key.startsWith('col_')) return;
        const rawVal = rawRow[key];
        if (rawVal === undefined || rawVal === '') return;

        const fieldCfg = this.fieldConfigs.find(f => f.key === key);
        const isEditable = editableKeyMap.has(key);
        const label = fieldCfg ? this.getFieldLabel(fieldCfg) : key;

        let oldValue: any = '';
        if (matched) {
          if (DOC_TASK_DIRECT_KEYS.has(key)) {
            oldValue = (matched as any)[key];
          } else if (key.startsWith('dyn_')) {
            const realKey = key.replace(/^dyn_/, '');
            oldValue = (matched.item_details as any)?.dynamic_data?.[realKey];
          } else {
            oldValue = (matched.item_details as any)?.[key];
          }
        }

        changes.push({
          key,
          label,
          oldValue: oldValue ?? '',
          newValue: rawVal,
          isEditable
        });
      });

      rows.push({
        rowIndex: idx + 1,
        unicCode: rawUnic,
        rawValues: rawRow,
        status: rowStatus,
        statusMessage,
        matchedTask: matched || null,
        isFromPool,
        isReadOnly: rowStatus === 'readonly',
        changes
      });
    });

    const summary: ScanBatchSummary = {
      totalRows: rows.length,
      readyCount,
      poolCount,
      readOnlyCount,
      notFoundCount,
      rows,
      detectedRowSeparator: table.detectedRowSep,
      detectedColSeparator: table.detectedColSep,
      headers: table.headers
    };

    this.openScanBatchModal(summary);
  }

  private fetchPoolOnce(): Promise<DocTask[]> {
    const params: any = { as_role: 'doc_worker' };
    if (this.activeWarehouseId) params.warehouse_id = this.activeWarehouseId;
    return new Promise(resolve => {
      this.docTaskApi.poolTasks(params).subscribe({
        next: (res: any) => resolve(Array.isArray(res) ? res : []),
        error: () => resolve([])
      });
    });
  }

  private async claimScannedTask(task: DocTask): Promise<void> {
    const confirmed = await this.confirmDialog.open({
      title: 'بر عهده گرفتن کالا',
      message: `کالای <b dir="ltr">${task.item_details?.fa_unic_code || ''}</b><br>${task.item_details?.description || ''}<br>در استخر است. آیا آن را بر عهده می‌گیرید؟`,
      confirmText: 'بله، بر عهده می‌گیرم', cancelText: 'انصراف', type: 'info'
    });
    if (!confirmed) return;
    if (!navigator.onLine) { this.toast.error('بر عهده گرفتن کالا نیاز به اتصال اینترنت دارد'); return; }

    await new Promise<void>(resolve => {
      this.docTaskApi.claimTasks([task.id], 'doc_worker').subscribe({
        next: async () => {
          this.toast.success('کالا با موفقیت به عهده گرفته شد');
          this.setTab('my-tasks');
          if (this.localFirst) {
            await this.store.refresh(this.activeWarehouseId!);
            await this.readFromLocal(false);
            const fresh = (await this.store.getMyTasks(this.activeWarehouseId!, this.currentUserId!))
              .find(t => task.sync_id ? t.sync_id === task.sync_id : t.id === task.id);
            if (fresh) this.openDetail(fresh);
          } else { this.loadTasks(false); this.openDetail(task); }
          this.cdr.detectChanges(); resolve();
        },
        error: (err) => { this.toast.error(err?.error?.error || 'خطا در عملیات'); resolve(); }
      });
    });
  }

  // ════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════

  trackById(_: number, t: DocTask) { return t.id ?? (t as any)._offlineId ?? _; }

  getStatusLabel(s: string): string {
    const m: Record<string,string> = {
      PENDING_DOC:'در انتظار', DOC_PROCESSED:'ارسال‌شده', DOC_SUPERVISOR_REJECTED:'رد سرپرست',
      DOC_MANAGER_REVIEW:'نزد مدیر', DOC_MANAGER_REJECTED:'رد مدیر', DOC_FINAL_APPROVED:'تأیید نهایی'
    };
    return m[s] || s;
  }

  getActionTypeLabel(actionType: string): string {
    const map: Record<string, string> = {
      'DISPATCHED': 'ارجاع اولیه سند',
      'DOC_PROCESSED': 'تکمیل و ارسال جهت بررسی سرپرست',
      'DOC_SUPERVISOR_APPROVED': 'تایید سرپرست اسناد',
      'DOC_SUPERVISOR_REJECTED': 'رد شده توسط سرپرست اسناد',
      'DOC_MANAGER_REVIEW': 'ارسال مستقیم جهت تایید مدیر',
      'DOC_MANAGER_REJECTED': 'رد شده توسط مدیر',
      'DOC_FINAL_APPROVED': 'تایید نهایی مدیر و اعمال به کالا',
      'CLAIMED': 'بر عهده گرفته شد از استخر',
      'CANCELLED': 'لغو ارجاع / لغو پیش‌نویس',
      'DOC_DRAFT_SAVED': 'ذخیره پیش‌نویس مدارک مالی',
      'REVERTED': 'بازگردانی به وضعیت قبلی'
    };
    return map[actionType] || actionType;
  }

  getStatusColor(s: string): string {
    if (['PENDING_DOC'].includes(s)) return 'bg-amber-100 text-amber-800 border border-amber-200';
    if (['DOC_SUPERVISOR_REJECTED','DOC_MANAGER_REJECTED'].includes(s)) return 'bg-red-100 text-red-800 border border-red-200';
    if (s === 'DOC_PROCESSED') return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (s === 'DOC_MANAGER_REVIEW') return 'bg-purple-100 text-purple-800 border border-purple-200';
    if (s === 'DOC_FINAL_APPROVED') return 'bg-green-100 text-green-800 border border-green-200';
    return 'bg-slate-50 text-gray-600 border border-slate-200';
  }

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
    
    const payload: any = {
      data_scope: this.exportDataScope,
      columns_scope: this.exportColumnScope,
      as_role: 'doc_worker',
    };
    
    if (this.exportDataScope === 'selected') {
      payload.selected_ids = Array.from(this.selectedTasks);
    }
    
    if (this.exportColumnScope === 'custom') {
      payload.columns_list = Array.from(this.selectedExportColumns);
    } else if (this.exportColumnScope === 'visible') {
      payload.columns_list = this.fieldConfigs.filter(f => f.visible).map(f => f.key);
    }
    
    const params: any = { as_role: 'doc_worker' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }
    if (this.searchQuery) {
      params.q = this.searchQuery;
    }
    if (this.statusFilter && this.statusFilter !== 'all') {
      params.status = this.statusFilter;
    }
    if (this.dateFilter && this.dateFilter !== 'all') {
      params.date = this.dateFilter;
    }

    this.exportSubscription = this.docTaskApi.exportExcel({ ...payload, ...params }).subscribe({
      next: (blob) => {
        try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_customs_${new Date().getTime()}.xlsx`;
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
    this.docTaskApi.downloadTemplate(this.activeWarehouseId).subscribe({
      next: (blob) => {
        try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Customs_Doc_Template_${new Date().getTime()}.xlsx`;
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

  /**
   * اعمال به‌روزرسانی دسته‌ای روی کالاهای تاییدشده و انتساب خودکار از استخر
   */
  async applyBulkScanUpdate() {
    if (!this.scanBatchSummary || this.isApplyingBatchUpdate) return;
    const eligibleRows = this.scanBatchSummary.rows.filter(r => r.status === 'ready' || r.status === 'pool');
    if (eligibleRows.length === 0) {
      this.toast.warning('هیچ کالای مجازی برای به‌روزرسانی وجود ندارد.');
      return;
    }

    this.isApplyingBatchUpdate = true;
    this.cdr.detectChanges();

    try {
      // ۱. اگر کالایی از استخر باشد، ابتدا تسک‌ها Claim می‌شوند
      const poolRows = eligibleRows.filter(r => r.isFromPool && r.matchedTask);
      if (poolRows.length > 0) {
        if (this.localFirst) {
          const poolTasksList = poolRows.map(r => r.matchedTask!);
          await this.store.claimTasks(poolTasksList, this.currentUserId!, 'doc_worker');
        } else {
          if (!navigator.onLine) {
            this.toast.error('بر عهده گرفتن کالاهای استخر نیاز به اتصال اینترنت دارد.');
            this.isApplyingBatchUpdate = false;
            this.cdr.detectChanges();
            return;
          }
          const poolTaskIds = poolRows.map(r => r.matchedTask!.id);
          await new Promise<void>((resolve, reject) => {
            this.docTaskApi.claimTasks(poolTaskIds, 'doc_worker').subscribe({
              next: () => resolve(),
              error: (err) => reject(err)
            });
          });
        }
      }

      // ۲. تهیه پی‌لود و به‌روزرسانی مقادیر روی هر کالا به صورت دسته‌ای (Chunked Batching)
      const editableKeys = new Set(this.editableFormFields.map(f => f.key));
      if (this.isWorkerNoteVisible) editableKeys.add('worker_note');

      const processRow = async (row: ParsedScanRow) => {
        const task = row.matchedTask;
        if (!task) return;

        const payload: Record<string, any> = {};
        const dynamicUpdates: Record<string, any> = {};
        const itemExtraPayload: Record<string, any> = {};

        row.changes.forEach(chg => {
          if (!editableKeys.has(chg.key)) return; // فقط فیلدهای مجاز

          const val = chg.newValue;
          if (DOC_TASK_DIRECT_KEYS.has(chg.key)) {
            if (chg.key === 'stamp' || chg.key === 'signature') {
              payload[chg.key] = CustomsScannerParser.parseBoolean(val);
            } else if (chg.key === 'invoice_type') {
              payload[chg.key] = CustomsScannerParser.normalizeInvoiceType(val) || val;
            } else if (chg.key === 'currency') {
              payload[chg.key] = CustomsScannerParser.normalizeCurrency(val) || val;
            } else if (chg.key === 'invoice_page' || chg.key === 'page_row') {
              payload[chg.key] = val !== '' && val !== null ? Number(val) : null;
            } else if (this.isFinancialField(chg.key)) {
              const clean = String(val).replace(/,/g, '').trim();
              payload[chg.key] = clean !== '' ? clean : null;
            } else {
              payload[chg.key] = val;
            }
          } else if (chg.key.startsWith('dyn_')) {
            const realKey = chg.key.replace(/^dyn_/, '');
            dynamicUpdates[realKey] = val;
          } else {
            itemExtraPayload[chg.key] = val;
          }
        });

        if (Object.keys(dynamicUpdates).length > 0) {
          const existingDyn = (task.item_details as any)?.dynamic_data || {};
          itemExtraPayload['dynamic_data'] = { ...existingDyn, ...dynamicUpdates };
          if (task.item_details) {
            (task.item_details as any).dynamic_data = itemExtraPayload['dynamic_data'];
          }
        }

        // ذخیره فیلدهای اختصاصی کالا (Item)
        if (Object.keys(itemExtraPayload).length > 0) {
          const itemSyncId = (task.item_details as any)?.sync_id;
          const itemId = String(task.item_details?.id || task.item);
          if (this.localFirst && itemSyncId) {
            offlineDb.items.update(itemSyncId, { ...itemExtraPayload, _offlinePending: true })
              .catch(err => console.warn('[Customs Batch] Dexie item update error:', err));
            OfflineSyncService.getInstance().enqueue('PATCH', `${environment.apiUrl}/inventory/items/${itemId}/`, itemExtraPayload, {
              userId: this.currentUserId!,
              entityType: 'item',
              entitySyncId: itemSyncId
            });
          } else if (itemId && itemId !== 'undefined') {
            this.itemApi.update(itemId, itemExtraPayload).subscribe({
              next: () => {},
              error: (err) => console.warn('[Customs Batch] item update error:', err)
            });
          }
        }

        // ۳. ذخیره Local-First یا ارسال به سرور برای فیلدهای مالی DocTask
        if (Object.keys(payload).length > 0) {
          if (this.localFirst && task.sync_id) {
            await this.store.saveDraft(task, payload, this.currentUserId!);
            Object.assign(task, payload, { _offlinePending: true });
          } else {
            await new Promise<void>((resolve) => {
              this.docTaskApi.update(task.id, payload).subscribe({
                next: (res) => { Object.assign(task, res); resolve(); },
                error: () => resolve() // ادامه سایر موارد
              });
            });
          }
        }
      };

      // اجرای دسته‌بندی‌شده (دسته‌های ۵ تایی) برای پایداری و پیشگیری از خطای همزمانی
      const chunkSize = 5;
      for (let i = 0; i < eligibleRows.length; i += chunkSize) {
        const chunk = eligibleRows.slice(i, i + chunkSize);
        await Promise.all(chunk.map(row => processRow(row)));
      }

      this.toast.success(`${eligibleRows.length} کالا با موفقیت به‌روزرسانی شدند.`);
      this.closeScanBatchModal();

      // تازه کردن داده‌های تب جاری
      if (this.localFirst) {
        await this.store.refresh(this.activeWarehouseId!);
        await this.readFromLocal(false);
      } else {
        this.loadTasks(false);
        this.loadPoolTasks(false);
      }
    } catch (e: any) {
      console.error('[Customs] Batch scan update error:', e);
      this.toast.error(e?.error?.error || 'خطا در اعمال به‌روزرسانی دسته‌ای اسکنر');
    } finally {
      this.isApplyingBatchUpdate = false;
      this.cdr.detectChanges();
    }
  }
}
