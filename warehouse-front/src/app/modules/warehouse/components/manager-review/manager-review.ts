import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, HostListener, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, Subject, filter, debounceTime, distinctUntilChanged } from 'rxjs';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CountTaskApiService } from '../../api/count-task-api.service';
import { CountTask } from '../../models/count-task.model';
import { DocTaskApiService } from '../../api/doc-task-api.service';
import { DocTask } from '../../models/doc-task.model';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../../../core/services/state.service';
import { WarehouseSelectorComponent } from '../../../../shared/components/warehouse-selector/warehouse-selector.component';
import { OfflinePendingBadgeComponent } from '../../../../shared/components/offline-pending-badge/offline-pending-badge.component';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { AuthStore } from '../../../../core/stores/auth.store';
import { AuthService } from '../../../../core/auth/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../core/services/network-status.service';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { ItemPhotoGalleryComponent } from '../item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../item-photo-gallery/photo-gallery-host';
import { ContextualCommentsComponent } from '../../../common/components/communications/contextual-comments/contextual-comments.component';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../../../shared/components/tab-bar/tab-bar.component';

@Component({
  selector: 'app-manager-review',
  standalone: true,
  imports: [CommonModule, FormsModule, WarehouseSelectorComponent, OfflinePendingBadgeComponent, BarcodeScannerComponent, PersianDatePipe, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, ContextualCommentsComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent],
  templateUrl: './manager-review.html',
  styleUrl: './manager-review.css'
})
export class ManagerReview implements OnInit, OnDestroy {
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
  tasks: CountTask[] = [];
  poolTasks: CountTask[] = [];
  isLoading = true;
  selectedTasks: Set<number> = new Set();
  selectedPoolTasks: Set<number> = new Set();
  currentTab: 'my-tasks' | 'pool' | 'doc' | 'doc-pool' = 'my-tasks';
  lastCountTab: 'my-tasks' | 'pool' = 'my-tasks';
  lastDocTab: 'doc' | 'doc-pool' = 'doc';

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
  statusFilter: 'all' | 'pending' | 'recount' = 'all';
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
  detailManagerNote = '';

  openCountingDetail(task: CountTask, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.selectedCountingDetailTask = task;
    this.detailManagerNote = task.manager_note || '';
    this.cdr.detectChanges();
  }

  closeCountingDetail() {
    this.selectedCountingDetailTask = null;
    this.detailManagerNote = '';
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
    let pending = 0;
    let recount = 0;
    for (const t of this.tasks) {
      if (t.status === 'MANAGER_REVIEW') pending++;
      else if (t.status === 'MANAGER_REJECTED') recount++;
    }
    return {
      all: this.tasks.length,
      pending,
      recount
    };
  }

  get docStatusCounts() {
    let pending = 0;
    let recount = 0;
    for (const t of this.docTasks) {
      if (t.status === 'DOC_MANAGER_REVIEW') pending++;
      else if (t.status === 'DOC_MANAGER_REJECTED') recount++;
    }
    return {
      all: this.docTasks.length,
      pending,
      recount
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

  setLocationFilter(loc: string) {
    this.locationFilter = loc;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

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

  normalizeText(str: string | null | undefined): string {
    if (!str) return '';
    return String(str)
      .replace(/[آأإ]/g, 'ا')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ة/g, 'ه')
      .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .toLowerCase()
      .trim();
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
      return task.status === 'MANAGER_REVIEW' || task.status === 'MANAGER_REJECTED';
    } else {
      if (this.currentTab === 'doc-pool') return true;
      return task.status === 'DOC_MANAGER_REVIEW' || task.status === 'DOC_MANAGER_REJECTED';
    }
  }

  clearAllSelections() {
    this.selectedTasks.clear();
    this.selectedPoolTasks.clear();
    this.selectedDocTasks.clear();
    this.selectedDocPoolTasks.clear();
    this.cdr.detectChanges();
  }

  // Bulk Reject Dialog State
  showBulkRejectDialog = false;
  bulkRejectNote: string = '';

  // Approve Dialog State
  showApproveDialog = false;
  approveNote: string = '';

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

  openDocDetail(task: DocTask) {
    this.selectedDocDetailTask = task;
    this.cdr.detectChanges();
  }

  closeDocDetail() {
    this.selectedDocDetailTask = null;
    this.cdr.detectChanges();
  }

  getInvoiceTypeLabel(val: string | null | undefined): string {
    const map: Record<string, string> = {
      'formal': 'رسمی/مالیاتی',
      'domestic': 'داخلی',
      'foreign': 'خارجی',
      'consignment': 'امانی'
    };
    return val ? (map[val] || val) : '-';
  }

  getCurrencyLabel(val: string | null | undefined): string {
    const map: Record<string, string> = {
      'IRR': 'ریال',
      'USD': 'دلار',
      'EUR': 'یورو',
      'OTHER': 'سایر'
    };
    return val ? (map[val] || val) : '-';
  }

  formatNumberWithCommas(val: any): string {
    if (val === null || val === undefined || val === '') return '-';
    const parts = String(val).replace(/,/g, '').split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

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
    const target = event.target as HTMLElement;
    const isInsideInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Escape: close any open dialog
    if (event.key === 'Escape') {
      if (this.selectedCountingDetailTask) {
        event.preventDefault();
        this.closeCountingDetail();
      } else if (this.selectedDocDetailTask) {
        event.preventDefault();
        this.closeDocDetail();
      } else if (this.showBulkRejectDialog) {
        event.preventDefault();
        this.cancelBulkReject();
      } else if (this.showApproveDialog) {
        event.preventDefault();
        this.cancelApprove();
      } else if (this.showDocRejectDialog) {
        event.preventDefault();
        this.closeDocRejectDialog();
      } else if (this.showDocApproveDialog) {
        event.preventDefault();
        this.cancelDocApprove();
      } else if (this.isExportModalOpen) {
        event.preventDefault();
        this.closeExportModal();
      }
    }

    // Ctrl+Enter: confirm active action dialog
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (this.selectedCountingDetailTask) {
        event.preventDefault();
        if (this.detailManagerNote && this.detailManagerNote.trim()) {
          this.rejectDetailTask();
        } else {
          this.approveDetailTask();
        }
      } else if (this.showBulkRejectDialog) {
        event.preventDefault();
        this.confirmBulkReject();
      } else if (this.showApproveDialog) {
        event.preventDefault();
        this.confirmApprove();
      } else if (this.showDocRejectDialog) {
        event.preventDefault();
        this.confirmDocReject();
      } else if (this.showDocApproveDialog) {
        event.preventDefault();
        this.confirmDocApprove();
      } else if (this.isExportModalOpen && !this.isExporting) {
        event.preventDefault();
        this.executeExport();
      }
    }

    // Quick Action A (Approve / Claim) when tasks selected and not inside text input
    if (!isInsideInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'a' || event.key === 'A' || event.key === 'ش') {
        if (this.currentTab === 'my-tasks' && this.selectedTasks.size > 0 && !this.showApproveDialog && !this.showBulkRejectDialog && !this.selectedCountingDetailTask) {
          event.preventDefault();
          this.openApproveDialog();
        } else if (this.currentTab === 'doc' && this.selectedDocTasks.size > 0 && !this.showDocApproveDialog && !this.showDocRejectDialog && !this.selectedDocDetailTask) {
          event.preventDefault();
          this.openDocApproveDialog();
        } else if (this.currentTab === 'pool' && this.selectedPoolTasks.size > 0) {
          event.preventDefault();
          this.claimSelectedTasks();
        } else if (this.currentTab === 'doc-pool' && this.selectedDocPoolTasks.size > 0) {
          event.preventDefault();
          this.claimSelectedDocTasks();
        }
      }
    }

    // Tab switching Alt+1, Alt+2, Alt+3, Alt+4
    if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      if (event.key === '1' || event.key === '۱') {
        event.preventDefault();
        this.setTab('my-tasks');
      } else if (event.key === '2' || event.key === '۲') {
        event.preventDefault();
        this.setTab('pool');
      } else if (event.key === '3' || event.key === '۳') {
        event.preventDefault();
        this.setTab('doc');
      } else if (event.key === '4' || event.key === '۴') {
        event.preventDefault();
        this.setTab('doc-pool');
      }
    }

    // Hardware Keyboard Wedge Barcode Scanner Listener
    if (!this.selectedCountingDetailTask && !this.selectedDocDetailTask && !this.showBulkRejectDialog && !this.showApproveDialog && !this.showDocRejectDialog && !this.showDocApproveDialog && !this.isExportModalOpen && !isInsideInput) {
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

  getActionTypeLabel(val: string | null | undefined): string {
    if (!val) return '-';
    const map: Record<string, string> = {
      'COUNTED': 'شمارش شده',
      'INITIAL_COUNT': 'ثبت اولیه شمارش',
      'MANAGER_REVIEW': 'در انتظار تایید مدیر',
      'SUPERVISOR_REJECTED': 'بررسی مجدد (سرپرست)',
      'MANAGER_REJECTED': 'دستور بازشماری (مدیر)',
      'FINAL_APPROVED': 'تایید نهایی مدیر',
      'DOC_PROCESSED': 'ثبت اولیه سند',
      'DOC_SUPERVISOR_REJECTED': 'رد سرپرست مالی',
      'DOC_MANAGER_REVIEW': 'در انتظار تایید مدیر مالی',
      'DOC_MANAGER_REJECTED': 'رد مدیر مالی',
      'DOC_FINAL_APPROVED': 'تایید نهایی مالی',
      'CLAIMED': 'به عهده گرفته شد',
    };
    return map[val] || val.replace(/_/g, ' ');
  }

  constructor(
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

    this.wsDebounceSub = this.wsUpdateSubject.pipe(debounceTime(600)).subscribe(() => {
      this.refreshCurrentTab(false, true);
    });

    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      const activeWh = this.state.appState.activeWarehouseId;
      if (data.warehouse_id && activeWh && activeWh !== 'ALL' && Number(data.warehouse_id) !== Number(activeWh)) {
        return;
      }
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        if (data.task && data.task.id) {
          this.updateCountTaskInPlace(data.task);
        } else if (data.task_id) {
          this.fetchSingleCountTask(data.task_id);
        } else {
          this.wsUpdateSubject.next(data);
        }
      } else if (data.type === 'doc_task_update' || data.event === 'doc_task_update') {
        if (data.task && data.task.id) {
          this.updateDocTaskInPlace(data.task);
        } else if (data.task_id) {
          this.fetchSingleDocTask(data.task_id);
        } else {
          this.wsUpdateSubject.next(data);
        }
      }
    });

    // ── URL State: خواندن وضعیت و فیلترها از آدرس مرورگر ──
    this.syncStateFromUrl();
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => this.syncStateFromUrl());

    // ── پیش‌بارگذاری آرام شمارنده‌های تب‌های دیگر ──
    this.preloadTabCounts();

    // ─── SWR Live Revalidation: دریافت داده‌های جدیدتر سرور در پس‌زمینه با فیلتر دقیق نقش مدیر ───
    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      if (!data) return;
      const freshList = Array.isArray(data) ? data : data.results || [];
      const isPoolUrl = url.includes('/pool_tasks/');
      const isManagerCountTasks = url.includes('/inventory/count-tasks/') && (url.includes('as_role=manager') || (!url.includes('as_role=counter') && !url.includes('as_role=supervisor') && !url.includes('as_role=tracking')));
      const isManagerDocTasks = url.includes('/inventory/doc-tasks/') && (url.includes('as_role=manager') || (!url.includes('as_role=doc_worker') && !url.includes('as_role=doc_supervisor')));

      if (isManagerCountTasks) {
        if (isPoolUrl) {
          if (this.currentTab === 'pool') this.trackUpdates(this.poolTasks, freshList);
          this.poolTasks = freshList;
          this.applyFilters();
          this.cdr.detectChanges();
        } else {
          const filtered = freshList.filter((t: CountTask) => t.status === 'MANAGER_REVIEW' || t.status === 'MANAGER_REJECTED');
          if (filtered.length > 0 || freshList.length === 0) {
            if (this.currentTab === 'my-tasks') this.trackUpdates(this.tasks, filtered);
            this.tasks = filtered;
            this.applyFilters();
            this.cdr.detectChanges();
          }
        }
      } else if (isManagerDocTasks) {
        if (isPoolUrl) {
          if (this.currentTab === 'doc-pool') this.trackUpdates(this.docPoolTasks, freshList);
          this.docPoolTasks = freshList;
          this.applyFilters();
          this.cdr.detectChanges();
        } else {
          const filtered = freshList.filter((t: DocTask) => t.status === 'DOC_MANAGER_REVIEW' || t.status === 'DOC_MANAGER_REJECTED');
          if (filtered.length > 0 || freshList.length === 0) {
            if (this.currentTab === 'doc') this.trackUpdates(this.docTasks, filtered);
            this.docTasks = filtered;
            this.applyFilters();
            this.cdr.detectChanges();
          }
        }
      }
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

  setStatusFilter(filter: 'all' | 'pending' | 'recount') {
    this.statusFilter = filter;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
  }

  setDateFilter(filter: 'all' | 'today' | 'yesterday' | 'week') {
    this.dateFilter = filter;
    this.applyFilters();
    this.updateUrlState();
    this.cdr.detectChanges();
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

  applyFilters() {
    const rawQuery = (this.searchQuery || '').trim();
    const query = this.normalizeText(rawQuery);
    const normDigitsQuery = this.normalizeDigits(rawQuery.toLowerCase());
    const convertedQuery = this.convertPersianKeyboardToEnglish(rawQuery).toLowerCase();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const week = today - 7 * 86400000;

    const matchesSearch = (itemDetails: any, workerOrCounterName?: string, taskData?: any) => {
      if (!rawQuery) return true;
      const unic = this.normalizeText(itemDetails?.fa_unic_code || '');
      const enUnic = this.normalizeText(itemDetails?.en_unic_code || '');
      const desc = this.normalizeText(itemDetails?.description || '');
      const itemNo = this.normalizeText(itemDetails?.item_no || itemDetails?.part_no || '');
      const po = this.normalizeText(itemDetails?.po || '');
      const tag = this.normalizeText(itemDetails?.tag || itemDetails?.tag_number || '');
      const pkNumber = this.normalizeText(itemDetails?.pk_number || itemDetails?.plpkitem || '');
      const locNew = this.normalizeText(itemDetails?.new_location || '');
      const locOld = this.normalizeText(itemDetails?.old_location || '');
      const personName = this.normalizeText(workerOrCounterName || '');
      const rti = this.normalizeText(taskData?.inv_rti_number || taskData?.added_rti_no || '');
      const supplier = this.normalizeText(taskData?.doc_supplier || '');

      return unic.includes(query) || unic.includes(normDigitsQuery) || unic.includes(convertedQuery) ||
             enUnic.includes(query) ||
             desc.includes(query) ||
             itemNo.includes(query) ||
             po.includes(query) ||
             tag.includes(query) ||
             pkNumber.includes(query) ||
             locNew.includes(query) || locOld.includes(query) ||
             personName.includes(query) ||
             rti.includes(query) ||
             supplier.includes(query);
    };

    const matchesLocation = (itemDetails: any) => {
      if (!this.locationFilter || this.locationFilter === 'all') return true;
      const loc = (itemDetails?.new_location || itemDetails?.old_location || '').toLowerCase().trim();
      return loc.startsWith(this.locationFilter.toLowerCase().trim());
    };

    const matchesDate = (t: any) => {
      if (this.dateFilter === 'all') return true;
      const dateStr = t.updated_at || t.created_at;
      if (!dateStr) return true;
      const taskDate = new Date(dateStr).getTime();
      if (this.dateFilter === 'today') return taskDate >= today;
      if (this.dateFilter === 'yesterday') return taskDate >= yesterday && taskDate < today;
      if (this.dateFilter === 'week') return taskDate >= week;
      return true;
    };

    // ۱. فیلتر کارهای من (انبارگردانی مدیر)
    this.filteredTasks = this.tasks.filter(t => {
      if (!matchesDate(t)) return false;
      if (this.statusFilter === 'pending' && t.status !== 'MANAGER_REVIEW') return false;
      if (this.statusFilter === 'recount' && t.status !== 'MANAGER_REJECTED') return false;
      if (!matchesLocation(t.item_details)) return false;
      return matchesSearch(t.item_details, t.counter_name, t);
    });

    // ۲. فیلتر استخر (انبارگردانی مدیر)
    this.filteredPoolTasks = this.poolTasks.filter(t => matchesLocation(t.item_details) && matchesSearch(t.item_details, undefined, t));

    // ۳. فیلتر اسناد مالی مدیر
    this.filteredDocTasks = this.docTasks.filter(t => {
      if (!matchesDate(t)) return false;
      if (this.statusFilter === 'pending' && t.status !== 'DOC_MANAGER_REVIEW') return false;
      if (this.statusFilter === 'recount' && t.status !== 'DOC_MANAGER_REJECTED') return false;
      if (!matchesLocation(t.item_details)) return false;
      return matchesSearch(t.item_details, t.doc_worker_name, t);
    });

    // ۴. فیلتر استخر اسناد مدیر
    this.filteredDocPoolTasks = this.docPoolTasks.filter(t => matchesLocation(t.item_details) && matchesSearch(t.item_details, undefined, t));

    // ۵. اعمال مرتب‌سازی هوشمند برای اقلام انبارگردانی
    this.filteredTasks.sort((a, b) => {
      let result = 0;
      if (this.sortField === 'created_at') {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
        const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
        result = timeA - timeB;
      } else if (this.sortField === 'updated_at') {
        const timeA = (a as any).updated_at ? new Date((a as any).updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : (a.id || 0));
        const timeB = (b as any).updated_at ? new Date((b as any).updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : (b.id || 0));
        result = timeA - timeB;
      } else if (this.sortField === 'location') {
        const locA = a.item_details?.new_location || a.item_details?.old_location || '';
        const locB = b.item_details?.new_location || b.item_details?.old_location || '';
        result = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (this.sortField === 'recount_first') {
        const isRecountA = (a.status === 'MANAGER_REJECTED') ? 0 : 1;
        const isRecountB = (b.status === 'MANAGER_REJECTED') ? 0 : 1;
        if (isRecountA !== isRecountB) {
          return isRecountA - isRecountB;
        }
        const locA = a.item_details?.new_location || a.item_details?.old_location || '';
        const locB = b.item_details?.new_location || b.item_details?.old_location || '';
        const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
        return this.sortDirection === 'asc' ? locCompare : -locCompare;
      } else if (this.sortField === 'code') {
        const codeA = a.item_details?.fa_unic_code || '';
        const codeB = b.item_details?.fa_unic_code || '';
        result = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (this.sortField === 'title') {
        const titleA = a.item_details?.description || '';
        const titleB = b.item_details?.description || '';
        result = titleA.localeCompare(titleB, 'fa', { sensitivity: 'base' });
      }
      return this.sortDirection === 'asc' ? result : -result;
    });

    // ۶. اعمال مرتب‌سازی هوشمند برای اسناد مالی
    this.filteredDocTasks.sort((a, b) => {
      let result = 0;
      if (this.sortField === 'created_at') {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
        const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
        result = timeA - timeB;
      } else if (this.sortField === 'updated_at') {
        const timeA = (a as any).updated_at ? new Date((a as any).updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : (a.id || 0));
        const timeB = (b as any).updated_at ? new Date((b as any).updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : (b.id || 0));
        result = timeA - timeB;
      } else if (this.sortField === 'location') {
        const locA = a.item_details?.new_location || a.item_details?.old_location || '';
        const locB = b.item_details?.new_location || b.item_details?.old_location || '';
        result = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (this.sortField === 'recount_first') {
        const isRecountA = (a.status === 'DOC_MANAGER_REJECTED') ? 0 : 1;
        const isRecountB = (b.status === 'DOC_MANAGER_REJECTED') ? 0 : 1;
        if (isRecountA !== isRecountB) {
          return isRecountA - isRecountB;
        }
        const locA = a.item_details?.new_location || a.item_details?.old_location || '';
        const locB = b.item_details?.new_location || b.item_details?.old_location || '';
        const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
        return this.sortDirection === 'asc' ? locCompare : -locCompare;
      } else if (this.sortField === 'code') {
        const codeA = a.item_details?.fa_unic_code || '';
        const codeB = b.item_details?.fa_unic_code || '';
        result = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      } else if (this.sortField === 'title') {
        const titleA = a.item_details?.description || '';
        const titleB = b.item_details?.description || '';
        result = titleA.localeCompare(titleB, 'fa', { sensitivity: 'base' });
      }
      return this.sortDirection === 'asc' ? result : -result;
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
      const convertedQ = this.convertPersianKeyboardToEnglish(rawQ).toLowerCase();
      const normQ = this.normalizeDigits(rawQ).toLowerCase();
      const normConvertedQ = this.normalizeDigits(convertedQ).toLowerCase();

      const match = (t: any) => {
        const unic = (t.item_details?.fa_unic_code || '').trim().toLowerCase();
        const normUnic = this.normalizeDigits(unic).toLowerCase();
        const itemNo = (t.item_details?.item_no || '').trim().toLowerCase();
        const itemId = String(t.item_details?.id || t.item || '').trim();
        const po = (t.item_details?.po || '').trim().toLowerCase();

        const matchesAny = (val: string) => {
          if (!val) return false;
          return val === rawQ || val === convertedQ || val === normQ || val === normConvertedQ;
        };

        return matchesAny(unic) || matchesAny(normUnic) || matchesAny(itemNo) || matchesAny(itemId) || matchesAny(po);
      };

      if (this.activeSection === 'counting') {
        const targetMyTask = this.tasks.find(match);
        if (targetMyTask) {
          this.selectedTasks.clear();
          this.selectedTasks.add(targetMyTask.id);
          this.toast.success(`کالای «${targetMyTask.item_details?.fa_unic_code}» انتخاب شد`);
          this.triggerFlash(targetMyTask.id);
          this.cdr.detectChanges();
          return;
        }

        const targetPoolTask = this.poolTasks.find(match);
        if (targetPoolTask) {
          const confirmed = await this.confirmDialog.open({
            title: 'بر عهده گرفتن کالا',
            message: `کالای «${targetPoolTask.item_details?.fa_unic_code} - ${targetPoolTask.item_details?.description}» در مخزن کالاها است. آیا آن را بر عهده می‌گیرید؟`,
            confirmText: 'بله، بر عهده می‌گیرم',
            cancelText: 'انصراف',
            type: 'info'
          });
          if (confirmed) {
            this.selectedPoolTasks = new Set([targetPoolTask.id]);
            this.claimSelectedTasks();
          }
          return;
        }
      } else {
        const targetDocTask = this.docTasks.find(match);
        if (targetDocTask) {
          this.openDocDetail(targetDocTask);
          return;
        }
        const targetDocPool = this.docPoolTasks.find(match);
        if (targetDocPool) {
          this.selectedDocPoolTasks = new Set([targetDocPool.id]);
          this.claimSelectedDocTasks();
          return;
        }
      }

      this.toast.error(`کالایی با کد «${code}» در کارتابل یا استخر یافت نشد`);
    } finally {
      this.scanBusy = false;
      this.cdr.detectChanges();
    }
  }

  preloadTabCounts() {
    const whId = this.state.appState.activeWarehouseId;
    const countParams: any = { as_role: 'manager' };
    if (whId && whId !== 'ALL' && whId !== -1) countParams.warehouse_id = whId;

    // استعلام سبک برای بج استخر انبارگردانی مدیر
    if (this.currentTab !== 'pool') {
      this.http.get<CountTask[]>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params: countParams }).subscribe({
        next: (res: any) => {
          this.poolTasks = Array.isArray(res) ? res : (res.results || []);
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    // استعلام سبک برای بج کارهای اسناد مالی مدیر
    if (this.currentTab !== 'doc') {
      const docParams: any = { as_role: 'manager', page_size: 500 };
      if (whId && whId !== 'ALL' && whId !== -1) docParams.warehouse_id = whId;
      this.docTaskApi.getAll(docParams).subscribe({
        next: (res: any) => {
          const all: DocTask[] = Array.isArray(res) ? res : (res.results || []);
          this.docTasks = all.filter(t => t.status === 'DOC_MANAGER_REVIEW' || t.status === 'DOC_MANAGER_REJECTED');
          this.cdr.detectChanges();
        },
        error: () => {}
      });
    }

    // استعلام سبک برای بج استخر اسناد مالی مدیر
    if (this.currentTab !== 'doc-pool') {
      const docPoolParams: any = { as_role: 'manager' };
      if (whId && whId !== 'ALL' && whId !== -1) docPoolParams.warehouse_id = whId;
      this.docTaskApi.poolTasks(docPoolParams).subscribe({
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

    const isManagerStatus = taskData.status === 'MANAGER_REVIEW' || taskData.status === 'MANAGER_REJECTED';

    if (!isManagerStatus) {
      // تسک از کارتابل مدیر خارج شده است (مثلاً تایید نهایی شده)
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
      this.cdr.detectChanges();
      return;
    }

    const currentUserId = this.auth.user()?.id;
    const isMyTask = taskData.assigned_manager === currentUserId ||
      (taskData.assigned_manager && typeof taskData.assigned_manager === 'object' && taskData.assigned_manager.id === currentUserId);
    const isPool = !taskData.assigned_manager;

    if (isMyTask) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.tasks[idx] = { ...this.tasks[idx], ...taskData };
      } else {
        this.tasks = [taskData, ...this.tasks];
      }
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else if (isPool) {
      const idx = this.poolTasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.poolTasks[idx] = { ...this.poolTasks[idx], ...taskData };
      } else {
        this.poolTasks = [taskData, ...this.poolTasks];
      }
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else {
      // به مدیر دیگری تخصیص یافته است
      this.tasks = this.tasks.filter(t => t.id !== id);
      this.poolTasks = this.poolTasks.filter(t => t.id !== id);
      this.selectedTasks.delete(id);
      this.selectedPoolTasks.delete(id);
    }
    if (this.selectedCountingDetailTask && this.selectedCountingDetailTask.id === id) {
      if (taskData._deleted || !isManagerStatus) {
        this.selectedCountingDetailTask = null;
      } else {
        this.selectedCountingDetailTask = { ...this.selectedCountingDetailTask, ...taskData };
      }
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
      if (this.selectedDocDetailTask && this.selectedDocDetailTask.id === id) {
        this.selectedDocDetailTask = null;
      }
      this.cdr.detectChanges();
      return;
    }

    const isManagerDocStatus = taskData.status === 'DOC_MANAGER_REVIEW' || taskData.status === 'DOC_MANAGER_REJECTED';

    if (!isManagerDocStatus) {
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.selectedDocTasks.delete(id);
      this.selectedDocPoolTasks.delete(id);
      if (this.selectedDocDetailTask && this.selectedDocDetailTask.id === id) {
        this.selectedDocDetailTask = null;
      }
      this.cdr.detectChanges();
      return;
    }

    const currentUserId = this.auth.user()?.id;
    const isMyDoc = taskData.assigned_manager === currentUserId ||
      (taskData.assigned_manager && typeof taskData.assigned_manager === 'object' && taskData.assigned_manager.id === currentUserId);
    const isPool = !taskData.assigned_manager;

    if (isMyDoc) {
      const idx = this.docTasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.docTasks[idx] = { ...this.docTasks[idx], ...taskData };
      } else {
        this.docTasks = [taskData, ...this.docTasks];
      }
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else if (isPool) {
      const idx = this.docPoolTasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        this.docPoolTasks[idx] = { ...this.docPoolTasks[idx], ...taskData };
      } else {
        this.docPoolTasks = [taskData, ...this.docPoolTasks];
      }
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.triggerFlash(id);
    } else {
      // به مدیر مالی دیگری تخصیص یافته است
      this.docTasks = this.docTasks.filter(t => t.id !== id);
      this.docPoolTasks = this.docPoolTasks.filter(t => t.id !== id);
      this.selectedDocTasks.delete(id);
      this.selectedDocPoolTasks.delete(id);
    }

    if (this.selectedDocDetailTask && this.selectedDocDetailTask.id === id) {
      if (taskData._deleted || !isManagerDocStatus) {
        this.selectedDocDetailTask = null;
      } else {
        this.selectedDocDetailTask = { ...this.selectedDocDetailTask, ...taskData };
      }
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
    if (!preserveState) {
      this.selectedTasks.clear();
    }
    if (showLoading) {
      this.isLoading = true;
      this.cdr.detectChanges();
    }
    
    const params: any = { as_role: 'manager', page_size: 1000 };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }

    this.countTaskApi.getAll(params).subscribe({
      next: (res: any) => {
        try {
          const allTasks = Array.isArray(res) ? res : (res.results || []);
          const newTasks = Array.isArray(allTasks) ? allTasks.filter((t: CountTask) => t.status === 'MANAGER_REVIEW' || t.status === 'MANAGER_REJECTED') : [];
          this.trackUpdates(this.tasks, newTasks);
          this.tasks = newTasks;
          this.applyFilters();
          if (preserveState) {
            const validIds = new Set(this.tasks.map(t => t.id));
            this.selectedTasks = new Set(Array.from(this.selectedTasks).filter(id => validIds.has(id)));
          }
        } catch (e) {
          console.error('Error assigning tasks:', e);
          this.tasks = [];
          this.applyFilters();
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
          this.toast.error('خطا در دریافت اطلاعات کارتابل مدیر');
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadPoolTasks(showLoading = true, preserveState = false) {
    if (!preserveState) {
      this.selectedPoolTasks.clear();
    }
    if (showLoading) {
      this.isLoading = true;
      this.cdr.detectChanges();
    }
    
    const params: any = { as_role: 'manager' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }
    
    this.http.get<CountTask[]>(`${environment.apiUrl}/inventory/count-tasks/pool_tasks/`, { params }).subscribe({
      next: (res: any) => {
        const newPoolTasks = Array.isArray(res) ? res : (res.results || []);
        this.trackUpdates(this.poolTasks, newPoolTasks);
        this.poolTasks = newPoolTasks;
        this.applyFilters();
        if (preserveState) {
          const validIds = new Set(this.poolTasks.map(t => t.id));
          this.selectedPoolTasks = new Set(Array.from(this.selectedPoolTasks).filter(id => validIds.has(id)));
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
          this.toast.error('خطا در دریافت مخزن کالاهای مدیر');
        }
        this.isLoading = false;
        this.cdr.detectChanges();
      }
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
        localStorage.setItem('manager_review_active_tab', this.currentTab);
        if (this.currentTab === 'my-tasks' || this.currentTab === 'pool') {
          this.lastCountTab = this.currentTab;
          localStorage.setItem('manager_review_last_count_tab', this.currentTab);
          localStorage.setItem('manager_review_active_section', 'counting');
        } else {
          this.lastDocTab = this.currentTab;
          localStorage.setItem('manager_review_last_doc_tab', this.currentTab);
          localStorage.setItem('manager_review_active_section', 'financial');
        }
      } catch (e) {
        console.warn('LocalStorage write failed:', e);
      }
    }

    this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** خواندن وضعیت فیلترها از پارامترهای آدرس مرورگر و LocalStorage */
  private syncStateFromUrl() {
    if (!this.router.url.split('?')[0].includes('/manager-review')) return;
    const params = this.router.parseUrl(this.router.url).queryParams;
    
    // 1. Sync Tab & Persistence
    let tab = params['tab'] as typeof this.currentTab;
    const validTabs: typeof this.currentTab[] = ['my-tasks', 'pool', 'doc', 'doc-pool'];
    
    if (!validTabs.includes(tab) && typeof window !== 'undefined' && window.localStorage) {
      try {
        const savedTab = localStorage.getItem('manager_review_active_tab') as typeof this.currentTab;
        if (validTabs.includes(savedTab)) {
          tab = savedTab;
        }
      } catch (e) {
        console.warn('LocalStorage read failed:', e);
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const savedLastCount = localStorage.getItem('manager_review_last_count_tab');
        if (savedLastCount === 'my-tasks' || savedLastCount === 'pool') {
          this.lastCountTab = savedLastCount;
        }
        const savedLastDoc = localStorage.getItem('manager_review_last_doc_tab');
        if (savedLastDoc === 'doc' || savedLastDoc === 'doc-pool') {
          this.lastDocTab = savedLastDoc;
        }
      } catch (e) {}
    }

    const resolvedTab = validTabs.includes(tab) ? tab : 'my-tasks';
    let tabChanged = false;
    if (resolvedTab !== this.currentTab) {
      this.currentTab = resolvedTab;
      this.clearAllSelections();
      tabChanged = true;
    }

    if (this.currentTab === 'my-tasks' || this.currentTab === 'pool') {
      this.lastCountTab = this.currentTab;
    } else {
      this.lastDocTab = this.currentTab;
    }

    // 2. Status Filter
    const status = params['status'];
    const validStatuses = ['all', 'pending', 'recount'];
    this.statusFilter = validStatuses.includes(status) ? (status as any) : 'all';

    // 3. Date Filter
    const date = params['date'];
    const validDates = ['all', 'today', 'yesterday', 'week'];
    this.dateFilter = validDates.includes(date) ? (date as any) : 'all';

    // 3.5 Location Filter
    const loc = params['loc'];
    this.locationFilter = loc || 'all';

    // 4. Sort Field
    const sort = params['sort'];
    const validSorts = ['created_at', 'updated_at', 'location', 'recount_first', 'code', 'title'];
    this.sortField = validSorts.includes(sort) ? (sort as any) : 'updated_at';

    // 5. Sort Direction
    const sortDir = params['sortDir'];
    if (sortDir === 'asc' || sortDir === 'desc') {
      this.sortDirection = sortDir;
    } else {
      this.sortDirection = (this.sortField === 'created_at' || this.sortField === 'updated_at') ? 'desc' : 'asc';
    }

    // 6. Search Query
    const q = params['q'] || '';
    this.searchQuery = q;

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
  onTaskPressStart(task: CountTask, event: PointerEvent) {
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
      this.selectedTasks = new Set(this.selectedTasks);
      this.cdr.markForCheck();
      if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
        (navigator as any).vibrate(50);
      }
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

  onTaskClick(task: CountTask, event: Event) {
    if (this.justLongPressed) {
      this.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // اگر در حالت انتخاب گروهی هستیم، ترافیک انتخاب را تغییر می‌دهیم
    if (this.selectedTasks.size > 0) {
      this.toggleSelection(task.id);
      return;
    }

    this.openCountingDetail(task, event);
  }

  // ─── Touch / Long Press Handling for Doc Tasks ───
  onDocTaskPressStart(task: DocTask, event: PointerEvent) {
    if (!this.isTaskSelectable(task)) return;
    this.initialTouchY = event.clientY;
    this.initialTouchX = event.clientX;
    
    this.pressTimeout = setTimeout(() => {
      this.pressTimeout = null;
      this.justLongPressed = true;
      if (!this.selectedDocTasks.has(task.id)) {
        this.selectedDocTasks.add(task.id);
      } else {
        this.selectedDocTasks.delete(task.id);
      }
      this.selectedDocTasks = new Set(this.selectedDocTasks);
      this.cdr.markForCheck();
      if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
        (navigator as any).vibrate(50);
      }
    }, 450);
  }

  onDocTaskPressMove(event: PointerEvent) {
    if (this.pressTimeout) {
      if (Math.abs(event.clientY - this.initialTouchY) > 10 || Math.abs(event.clientX - this.initialTouchX) > 10) {
        clearTimeout(this.pressTimeout);
        this.pressTimeout = null;
      }
    }
  }

  onDocTaskPressEnd() {
    if (this.pressTimeout) {
      clearTimeout(this.pressTimeout);
      this.pressTimeout = null;
    }
  }

  onDocTaskClick(task: DocTask, event: Event) {
    if (this.justLongPressed) {
      this.justLongPressed = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    if (this.selectedDocTasks.size > 0) {
      this.toggleDocSelection(task.id);
      return;
    }

    this.openDocDetail(task);
  }

  togglePoolSelection(taskId: number) {
    if (this.selectedPoolTasks.has(taskId)) {
      this.selectedPoolTasks.delete(taskId);
    } else {
      this.selectedPoolTasks.add(taskId);
    }
    this.selectedPoolTasks = new Set(this.selectedPoolTasks);
    this.cdr.detectChanges();
  }

  toggleAllPool(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    const targetList = this.filteredPoolTasks;
    if (isChecked) {
      targetList.forEach(t => this.selectedPoolTasks.add(t.id));
    } else {
      targetList.forEach(t => this.selectedPoolTasks.delete(t.id));
    }
    this.selectedPoolTasks = new Set(this.selectedPoolTasks);
    this.cdr.detectChanges();
  }

  isAllPoolSelected() {
    return this.filteredPoolTasks.length > 0 && this.filteredPoolTasks.every(t => this.selectedPoolTasks.has(t.id));
  }

  async claimSelectedTasks() {
    if (this.selectedPoolTasks.size === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.toast.error('عملیات به عهده گرفتن نیازمند اتصال اینترنت است');
      return;
    }
    
    const payload: any = {
      task_ids: Array.from(this.selectedPoolTasks),
      as_role: 'manager'
    };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) {
      payload.warehouse_id = whId;
    }

    this.http.post(`${environment.apiUrl}/inventory/count-tasks/claim_tasks/`, payload).subscribe({
      next: (res: any) => {
        this.toast.success(`${res.claimed_count} کالا با موفقیت به عهده گرفته شد`);
        this.selectedPoolTasks.clear();
        this.loadPoolTasks(false);
        this.setTab('my-tasks');
      },
      error: (err: any) => {
        const errorMsg = err?.error?.error || 'خطا در عملیات';
        this.toast.error(errorMsg);
      }
    });
  }

  toggleSelection(taskId: number) {
    if (this.selectedTasks.has(taskId)) {
      this.selectedTasks.delete(taskId);
    } else {
      this.selectedTasks.add(taskId);
    }
    this.selectedTasks = new Set(this.selectedTasks);
    this.cdr.detectChanges();
  }

  toggleAll(event?: Event) {
    const target = event?.target as HTMLInputElement | undefined;
    const isCheckbox = target?.type === 'checkbox';
    const isChecked = isCheckbox ? target.checked : !this.isAllSelected();

    const targetList = this.filteredTasks;
    if (isChecked) {
      targetList.forEach(t => this.selectedTasks.add(t.id));
    } else {
      targetList.forEach(t => this.selectedTasks.delete(t.id));
    }
    this.selectedTasks = new Set(this.selectedTasks);
    this.cdr.detectChanges();
  }

  isAllSelected() {
    return this.filteredTasks.length > 0 && this.filteredTasks.every(t => this.selectedTasks.has(t.id));
  }

  selectMatchedTasks() {
    const matched = this.filteredTasks.filter(t => this.isMatched(t));
    if (matched.length === 0) {
      this.toast.info('هیچ کالای منطبقی در این لیست وجود ندارد.');
      return;
    }
    matched.forEach(t => this.selectedTasks.add(t.id));
    this.selectedTasks = new Set(this.selectedTasks);
    this.toast.success(`${matched.length} کالای منطبق (بدون مغایرت) انتخاب شدند.`);
    this.cdr.detectChanges();
  }

  selectMismatchedTasks() {
    const mismatched = this.filteredTasks.filter(t => !this.isMatched(t));
    if (mismatched.length === 0) {
      this.toast.info('هیچ کالای دارای مغایرتی در این لیست وجود ندارد.');
      return;
    }
    mismatched.forEach(t => this.selectedTasks.add(t.id));
    this.selectedTasks = new Set(this.selectedTasks);
    this.toast.success(`${mismatched.length} کالای دارای مغایرت انتخاب شدند.`);
    this.cdr.detectChanges();
  }

  openApproveDialog() {
    if (this.selectedTasks.size === 0) return;
    this.approveNote = '';
    this.showApproveDialog = true;
    this.cdr.detectChanges();
  }

  cancelApprove() {
    this.showApproveDialog = false;
    this.approveNote = '';
    this.cdr.detectChanges();
  }

  confirmApprove() {
    if (this.selectedTasks.size === 0) return;
    const taskIds = Array.from(this.selectedTasks);
    const count = taskIds.length;
    const backupTasks = [...this.tasks];

    // اعمال خوش‌بینانه در جدول
    this.tasks = this.tasks.filter(t => !taskIds.includes(t.id));
    this.selectedTasks.clear();
    this.showApproveDialog = false;
    this.cdr.detectChanges();

    this.countTaskApi.bulkManagerApprove(taskIds, this.approveNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`تأیید نهایی ${count} کالا در صف ارسال آفلاین قرار گرفت.`);
        } else {
          this.toast.success(res?.message || `${count} کالا با موفقیت تایید نهایی شد`);
        }
        this.loadTasks(false, true);
      },
      error: (err: any) => {
        this.tasks = backupTasks;
        this.toast.error(err?.error?.error || 'خطا در تایید نهایی کالاها');
        this.loadTasks(false, true);
      }
    });
  }

  approveSingle(task: CountTask) {
    this.selectedTasks = new Set([task.id]);
    this.openApproveDialog();
  }

  rejectSingle(task: CountTask) {
    this.selectedTasks = new Set([task.id]);
    this.openBulkRejectDialog();
  }

  approveDetailTask() {
    if (!this.selectedCountingDetailTask) return;
    const task = this.selectedCountingDetailTask;
    const taskId = task.id;

    // اعمال خوش‌بینانه
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.selectedTasks.delete(taskId);
    this.closeCountingDetail();
    this.applyFilters();

    this.countTaskApi.bulkManagerApprove([taskId], this.detailManagerNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info('تایید نهایی کالا در صف ارسال آفلاین قرار گرفت.');
        } else {
          this.toast.success(res?.message || 'تایید نهایی با موفقیت ثبت شد');
        }
        this.loadTasks(false, true);
      },
      error: () => {
        this.toast.error('خطا در تایید کالا');
        this.loadTasks(false, true);
      }
    });
  }

  rejectDetailTask() {
    if (!this.selectedCountingDetailTask) return;
    const note = (this.detailManagerNote || '').trim();
    if (!note) {
      return this.toast.error('لطفاً علت رد (دستورات به سرپرست یا شمارشگر) را بنویسید.');
    }
    const task = this.selectedCountingDetailTask;
    const taskId = task.id;

    // اعمال خوش‌بینانه
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.selectedTasks.delete(taskId);
    this.closeCountingDetail();
    this.applyFilters();

    this.countTaskApi.managerReject(taskId, note).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info('ارجاع جهت بازشماری در صف آفلاین ذخیره شد.');
        } else {
          this.toast.success(res?.message || 'کالا جهت بازشماری ارجاع داده شد.');
        }
        this.loadTasks(false, true);
      },
      error: (err) => {
        this.toast.error(err?.error?.error || 'خطا در ثبت رد کالا');
        this.loadTasks(false, true);
      }
    });
  }

  openBulkRejectDialog() {
    if (this.selectedTasks.size === 0) return;
    this.bulkRejectNote = '';
    this.showBulkRejectDialog = true;
    this.cdr.detectChanges();
  }

  async cancelBulkReject() {
    if (this.bulkRejectNote.trim()) {
      const ok = await this.confirmDialog.open({
        title: 'انصراف از رد گروهی',
        message: 'متن یادداشت ذخیره نشده است. آیا مایل به بستن پنجره هستید؟',
        type: 'warning'
      });
      if (!ok) return;
    }
    this.showBulkRejectDialog = false;
    this.bulkRejectNote = '';
    this.cdr.detectChanges();
  }

  confirmBulkReject() {
    if (this.selectedTasks.size === 0) return;
    if (!this.bulkRejectNote.trim()) {
      this.toast.error('لطفاً دلیل ارجاع جهت بازشماری را بنویسید.');
      return;
    }
    const taskIds = Array.from(this.selectedTasks);
    const count = taskIds.length;
    const backupTasks = [...this.tasks];

    // اعمال خوش‌بینانه
    this.tasks = this.tasks.filter(t => !taskIds.includes(t.id));
    this.selectedTasks.clear();
    this.showBulkRejectDialog = false;
    this.cdr.detectChanges();

    this.countTaskApi.bulkManagerReject(taskIds, this.bulkRejectNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`دستور بازشماری برای ${count} کالا در صف آفلاین ذخیره شد.`);
        } else {
          this.toast.success(res?.message || `${count} کالا جهت بازشماری ارجاع داده شد`);
        }
        this.loadTasks(false, true);
      },
      error: (err: any) => {
        this.tasks = backupTasks;
        const msg = err?.error?.error || 'خطا در رد گروهی کالاها';
        this.toast.error(msg);
        this.loadTasks(false, true);
      }
    });
  }

  approveSingleDoc(task: DocTask, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocTasks = new Set([task.id]);
    this.openDocApproveDialog();
  }

  rejectSingleDoc(task: DocTask, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocTasks = new Set([task.id]);
    this.openDocRejectDialog();
  }

  claimSingleDocTask(task: DocTask, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedDocPoolTasks = new Set([task.id]);
    this.claimSelectedDocTasks();
  }

  claimSingleTask(task: CountTask, event?: Event) {
    if (event) event.stopPropagation();
    this.selectedPoolTasks = new Set([task.id]);
    this.claimSelectedTasks();
  }

  // ════════════════════════════════════════════
  //  Doc Task Tab
  // ════════════════════════════════════════════

  loadDocTasks(showLoading = true, preserveState = false) {
    if (!preserveState) {
      this.selectedDocTasks.clear();
    }
    if (showLoading) {
      this.isDocLoading = true;
      this.cdr.detectChanges();
    }
    const params: any = { as_role: 'manager', page_size: 1000 };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.docTaskApi.getAll(params).subscribe({
      next: (res: any) => {
        const all: DocTask[] = Array.isArray(res) ? res : (res.results || []);
        const newDocTasks = all.filter(t => t.status === 'DOC_MANAGER_REVIEW' || t.status === 'DOC_MANAGER_REJECTED');
        this.trackUpdates(this.docTasks, newDocTasks);
        this.docTasks = newDocTasks;
        this.applyFilters();
        if (preserveState) {
          const validIds = new Set(this.docTasks.map(t => t.id));
          this.selectedDocTasks = new Set(Array.from(this.selectedDocTasks).filter(id => validIds.has(id)));
        }
        this.isDocLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
          this.toast.error('خطا در دریافت اسناد مالی مدیر');
        }
        this.isDocLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleDocSelection(id: number) {
    if (this.selectedDocTasks.has(id)) this.selectedDocTasks.delete(id);
    else this.selectedDocTasks.add(id);
    this.selectedDocTasks = new Set(this.selectedDocTasks);
    this.cdr.detectChanges();
  }

  toggleAllDoc(event?: Event) {
    const target = event?.target as HTMLInputElement | undefined;
    const isCheckbox = target?.type === 'checkbox';
    const isChecked = isCheckbox ? target.checked : !this.isAllDocSelected();

    const targetList = this.filteredDocTasks;
    if (isChecked) targetList.forEach(t => this.selectedDocTasks.add(t.id));
    else targetList.forEach(t => this.selectedDocTasks.delete(t.id));
    this.selectedDocTasks = new Set(this.selectedDocTasks);
    this.cdr.detectChanges();
  }

  isAllDocSelected() {
    return this.filteredDocTasks.length > 0 && this.filteredDocTasks.every(t => this.selectedDocTasks.has(t.id));
  }

  openDocApproveDialog() {
    if (this.selectedDocTasks.size === 0) return;
    this.docApproveNote = '';
    this.showDocApproveDialog = true;
    this.cdr.detectChanges();
  }

  cancelDocApprove() {
    this.showDocApproveDialog = false;
    this.docApproveNote = '';
    this.cdr.detectChanges();
  }

  confirmDocApprove() {
    if (this.selectedDocTasks.size === 0) return;
    const taskIds = Array.from(this.selectedDocTasks);
    const count = taskIds.length;
    const backupDocTasks = [...this.docTasks];

    // اعمال خوش‌بینانه
    this.docTasks = this.docTasks.filter(t => !taskIds.includes(t.id));
    this.selectedDocTasks.clear();
    this.showDocApproveDialog = false;
    this.cdr.detectChanges();

    this.docTaskApi.bulkManagerApprove(taskIds, this.docApproveNote).subscribe({
      next: (res: any) => {
        const isOffline = res?._offlinePending || !navigator.onLine;
        if (isOffline) {
          this.toast.info(`تأیید نهایی ${count} سند در صف آفلاین ذخیره شد.`);
        } else {
          this.toast.success(res?.message || `${count} سند با موفقیت تایید نهایی شد`);
        }
        this.loadDocTasks(false, true);
      },
      error: (err: any) => {
        this.docTasks = backupDocTasks;
        this.toast.error(err?.error?.error || 'خطا در تایید نهایی اسناد');
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
    if (!this.docRejectNote.trim()) { this.toast.error('لطفاً دلیل رد را بنویسید'); return; }
    const taskIds = Array.from(this.selectedDocTasks);
    const count = taskIds.length;
    const backupDocTasks = [...this.docTasks];

    // اعمال خوش‌بینانه
    this.docTasks = this.docTasks.filter(t => !taskIds.includes(t.id));
    this.selectedDocTasks.clear();
    this.showDocRejectDialog = false;
    this.cdr.detectChanges();

    this.docTaskApi.managerReject(taskIds, this.docRejectNote).subscribe({
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
        this.docTasks = backupDocTasks;
        this.toast.error(err?.error?.error || 'خطا در رد اسناد');
        this.loadDocTasks(false, true);
      }
    });
  }

  // ════════════════════════════════════════════
  //  Doc Pool Tab
  // ════════════════════════════════════════════

  loadDocPoolTasks(showLoading = true, preserveState = false) {
    if (!preserveState) {
      this.selectedDocPoolTasks.clear();
    }
    if (showLoading) {
      this.isDocPoolLoading = true;
      this.cdr.detectChanges();
    }
    const params: any = { as_role: 'manager' };
    const whId = this.state.appState.activeWarehouseId;
    if (whId && whId !== 'ALL' && whId !== -1) params.warehouse_id = whId;

    this.docTaskApi.poolTasks(params).subscribe({
      next: (res: any) => {
        const newDocPoolTasks = Array.isArray(res) ? res : (res.results || []);
        this.trackUpdates(this.docPoolTasks, newDocPoolTasks);
        this.docPoolTasks = newDocPoolTasks;
        this.applyFilters();
        if (preserveState) {
          const validIds = new Set(this.docPoolTasks.map(t => t.id));
          this.selectedDocPoolTasks = new Set(Array.from(this.selectedDocPoolTasks).filter(id => validIds.has(id)));
        }
        this.isDocPoolLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        if (NetworkStatusService.getInstance().isOnline && err?.status !== 503) {
          this.toast.error('خطا در دریافت استخر اسناد مدیر');
        }
        this.isDocPoolLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleDocPoolSelection(id: number) {
    if (this.selectedDocPoolTasks.has(id)) this.selectedDocPoolTasks.delete(id);
    else this.selectedDocPoolTasks.add(id);
    this.selectedDocPoolTasks = new Set(this.selectedDocPoolTasks);
    this.cdr.detectChanges();
  }

  toggleAllDocPool(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const targetList = this.filteredDocPoolTasks;
    if (checked) targetList.forEach(t => this.selectedDocPoolTasks.add(t.id));
    else targetList.forEach(t => this.selectedDocPoolTasks.delete(t.id));
    this.selectedDocPoolTasks = new Set(this.selectedDocPoolTasks);
    this.cdr.detectChanges();
  }

  isAllDocPoolSelected() {
    return this.filteredDocPoolTasks.length > 0 && this.filteredDocPoolTasks.every(t => this.selectedDocPoolTasks.has(t.id));
  }

  claimSelectedDocTasks() {
    if (this.selectedDocPoolTasks.size === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.toast.error('عملیات به عهده گرفتن نیازمند اتصال اینترنت است');
      return;
    }
    this.docTaskApi.claimTasks(Array.from(this.selectedDocPoolTasks), 'manager').subscribe({
      next: (res: any) => {
        this.toast.success(`${res.claimed_count} سند با موفقیت به عهده گرفته شد`);
        this.selectedDocPoolTasks.clear();
        this.loadDocPoolTasks(false);
        this.setTab('doc');
      },
      error: (err: any) => {
        const errorMsg = err?.error?.error || 'خطا در عملیات';
        this.toast.error(errorMsg);
      }
    });
  }

  // ── Matching / Discrepancy Helpers ──
  isMatched(task: CountTask): boolean {
    if (!task || task.counted_balance === null || task.counted_balance === undefined) return false;
    const expected = task.item_details?.bal4miv;
    if (expected === null || expected === undefined) return false;
    return Number(task.counted_balance) === Number(expected);
  }

  getDifference(task: CountTask): number {
    if (!task || task.counted_balance === null || task.counted_balance === undefined) return 0;
    const expected = Number(task.item_details?.bal4miv ?? 0);
    return Number(task.counted_balance) - expected;
  }

  getDifferenceAbs(task: CountTask): number {
    return Math.abs(this.getDifference(task));
  }

  hasConflict(task: CountTask): boolean {
    return !this.isMatched(task);
  }

  // Export Methods
  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.currentSelectedTasks.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
    
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

  setExportColumnScope(scope: 'all_db' | 'visible' | 'custom') {
    this.exportColumnScope = scope;
  }

  toggleExportColumn(key: string) {
    if (this.selectedExportColumns.has(key)) {
      this.selectedExportColumns.delete(key);
    } else {
      this.selectedExportColumns.add(key);
    }
  }

  isExportColumnSelected(key: string): boolean {
    return this.selectedExportColumns.has(key);
  }

  executeExport() {
    this.isExporting = true;
    
    const isCount = this.activeSection === 'counting';
    const role = 'manager';
    const api = isCount ? this.countTaskApi : this.docTaskApi;

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
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }
    if (this.searchQuery && this.searchQuery.trim()) {
      params.q = this.searchQuery.trim();
    }
    if (this.statusFilter && this.statusFilter !== 'all') {
      params.status = this.statusFilter;
    }
    if (this.dateFilter && this.dateFilter !== 'all') {
      params.date = this.dateFilter;
    }

    if ((this.currentTab === 'pool' || this.currentTab === 'doc-pool') && this.exportDataScope === 'all') {
      const poolIds = this.currentTab === 'pool'
        ? this.poolTasks.map(t => t.id)
        : this.docPoolTasks.map(t => t.id);
      payload.selected_ids = poolIds;
      payload.data_scope = 'selected';
    }

    this.exportSubscription = api.exportExcel({ ...payload, ...params }).subscribe({
      next: (blob) => {
        try {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_manager_${isCount ? 'count' : 'doc'}_${new Date().getTime()}.xlsx`;
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

  // ── Barcode Scanner Dialog ──
  isBarcodeScannerOpen = false;

  openBarcodeScanner() {
    this.isBarcodeScannerOpen = true;
    this.cdr.detectChanges();
  }

  closeBarcodeScanner() {
    this.isBarcodeScannerOpen = false;
    this.cdr.detectChanges();
  }

  onCameraBarcodeScanned(code: string) {
    this.closeBarcodeScanner();
    this.onBarcodeScanned(code);
  }
}
