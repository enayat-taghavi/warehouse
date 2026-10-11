import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, Subject, filter } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CountTaskApiService } from '../../core/api/count-task-api.service';
import { CountTask } from '../../core/models/count-task.model';
import { ToastService } from '../../services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { StateService } from '../../services/state.service';
import { AuthStore } from '../../core/stores/auth.store';
import { AuthService } from '../../core/auth/auth.service';
import { DataTableComponent, TableColumnDirective, SortState } from '../../shared/components/data-table/data-table.component';
import { PersianDatePipe } from '../../shared/pipes/persian-date.pipe';
import { WarehouseSelectorComponent } from '../../shared/components/warehouse-selector/warehouse-selector.component';
import { WebSocketService } from '../../core/http/websocket.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { ItemPhotoGalleryComponent } from '../../shared/components/item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../../shared/components/item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../../shared/components/item-photo-gallery/photo-gallery-host';
import { ContextualCommentsComponent } from '../communications/contextual-comments/contextual-comments.component';
import { ActionButtonComponent } from '../../shared/components/action-button/action-button.component';
import { TabBarComponent, TabDef } from '../../shared/components/tab-bar/tab-bar.component';
import { OverflowMenuComponent } from '../../shared/components/overflow-menu/overflow-menu.component';
import { SvgIconDirective } from '../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-count-tracking',
  standalone: true,
  imports: [CommonModule, FormsModule, DataTableComponent, TableColumnDirective, PersianDatePipe, WarehouseSelectorComponent, BarcodeScannerComponent, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, ContextualCommentsComponent, SvgIconDirective, ActionButtonComponent, TabBarComponent, OverflowMenuComponent],
  templateUrl: './count-tracking.html',
  styleUrl: './count-tracking.css'
})
export class CountTracking implements OnInit, OnDestroy {
  @ViewChild(BarcodeScannerComponent) scanner?: BarcodeScannerComponent;

  readonly performanceTabs: TabDef[] = [
    { id: 'overview', label: 'نمای کلی و شاخص‌ها', shortLabel: 'نمای کلی', icon: 'action-view' },
    { id: 'counters', label: 'انبارگردان‌ها (سرعت و دقت)', shortLabel: 'انبارگردان‌ها', icon: 'action-users' },
    { id: 'supervisors', label: 'سرپرستان (سرعت تایید)', shortLabel: 'سرپرستان', icon: 'action-user-check' }
  ];

  tasks: any[] = [];
  filteredTasks: any[] = [];
  isLoading = true;
  showCompleted = false;
  savedShowCompletedState = false;
  selectedTaskIds: Set<number> = new Set();

  // ─── Mini Dashboard & Discrepancy KPIs ───
  statTotal = 0;
  statCounted = 0;
  statDiscrepancy = 0;
  statShortage = 0;
  statSurplus = 0;
  statApproved = 0;

  // ─── فیلتر مغایرت و وضعیت سریع ───
  discrepancyFilter: 'all' | 'counted' | 'discrepancy' | 'shortage' | 'surplus' | 'approved' = 'all';
  showOnlyDiscrepancies = false;

  // ─── WebSocket & SWR ───
  private wsSub?: Subscription;
  private routerSub?: Subscription;
  private swrSub?: Subscription;
  private wsTaskUpdateSubject = new Subject<any>();
  private wsDebounceSub?: Subscription;
  private offlineSync = OfflineSyncService.getInstance();

  // ── متغیرهای جدول و صفحه‌بندی ──
  updatedTaskIds = new Set<number>();
  currentPage = 1;
  pageSize = 50;

  // ── وضعیت مودال گالری تصاویر کالا ──
  readonly photoGallery = new PhotoGalleryHost(msg => this.toast.warning(msg));

  onPhotosChanged(photos: any[]): void {
    this.photoGallery.apply(photos, this.tasks);
    this.cdr.markForCheck();
  }
  
  getRowClass(row: any): string {
    return this.updatedTaskIds.has(row.id) ? 'status-updated-flash' : '';
  }
  
  visibleCols: string[] = [
    'warehouse_name',
    'fa_unic_code',
    'description',
    'counter',
    'supervisor',
    'manager',
    'status',
    'counted_balance',
    'discrepancy',
    'created_at',
    'updated_at',
    'actions'
  ];

  // ─── فیلتر جدول ───
  tableSearch = '';
  tableFilters: Record<string, string> = {};

  // گزینه‌های فیلتر چک‌باکسی
  warehouseOptions: {label: string, value: string}[] = [];
  counterOptions: {label: string, value: string}[] = [];
  supervisorOptions: {label: string, value: string}[] = [];
  managerOptions: {label: string, value: string}[] = [];
  statusOptions: {label: string, value: string}[] = [
    { label: 'در انتظار شمارش', value: 'PENDING_COUNT' },
    { label: 'شمارش اولیه (ثبت موقت)', value: 'INITIAL_COUNT' },
    { label: 'در کارتابل سرپرست', value: 'COUNTED' },
    { label: 'در کارتابل مدیر', value: 'MANAGER_REVIEW' },
    { label: 'مغایرت - ارجاع به انبارگردان', value: 'SUPERVISOR_REJECTED' },
    { label: 'مغایرت - ارجاع به سرپرست', value: 'MANAGER_REJECTED' },
    { label: 'تایید نهایی', value: 'FINAL_APPROVED' }
  ];
  
  // ─── کشوی جانبی تایم‌لاین گردش کالا (Audit Trail Drawer) ───
  isDrawerOpen = false;
  selectedTaskForDrawer: any = null;
  isLoadingDrawerHistory = false;

  // ─── مودال خلاصه عملکرد و راندمان افراد تیم (Team Performance Modal) ───
  isPerformanceModalOpen = false;
  performanceActiveTab: 'overview' | 'counters' | 'supervisors' = 'overview';
  counterStats: any[] = [];
  supervisorStats: any[] = [];
  overviewStats: any = {};

  // ─── متغیرهای مودال خروجی اکسل ───
  isExportModalOpen = false;
  exportDataScope: 'all' | 'selected' = 'all';
  exportColumnScope: 'all_db' | 'visible' | 'custom' = 'all_db';
  selectedExportColumns: Set<string> = new Set();
  isExporting = false;
  exportSubscription?: Subscription;
  availableExportColumns: {key: string, label: string}[] = [];
  flashTimeout: any;

  public authStore = inject(AuthStore);
  public authService = inject(AuthService);

  get canFinalizeOrManage(): boolean {
    const perms = this.authService.userPermissions();
    return perms.includes('admin_all') ||
           perms.includes('perm_inventory_finalize') ||
           perms.includes('can_act_as_manager') ||
           perms.includes('view_sys_manager_review');
  }

  get canCancelAllocation(): boolean {
    const perms = this.authService.userPermissions();
    return perms.includes('admin_all') ||
           perms.includes('perm_inventory_finalize') ||
           perms.includes('can_act_as_manager') ||
           perms.includes('view_sys_manager_review') ||
           perms.includes('can_act_as_supervisor') ||
           perms.includes('view_sys_supervisor');
  }

  constructor(
    private countTaskApi: CountTaskApiService,
    private toast: ToastService,
    private confirmDialog: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    public state: StateService,
    private wsService: WebSocketService,
    private router: Router
  ) {}

  ngOnInit() {
    // ── URL State: خواندن پارامترها از آدرس مرورگر ──
    this.syncStateFromUrl();
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => this.syncStateFromUrl());

    this.countTaskApi.getExportColumns().subscribe(cols => {
      this.availableExportColumns = cols;
    });

    // ─── Debounce برای رویدادهای عمومی وب‌سوکت (جلوگیری از درخواست رگباری) ───
    this.wsDebounceSub = this.wsTaskUpdateSubject.pipe(
      debounceTime(600)
    ).subscribe(() => {
      this.loadTasks(false, true);
    });

    // ─── WebSocket: دریافت خودکار تغییرات با به‌روزرسانی نقطه‌ای In-Place ───
    this.wsService.connect();
    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (data.type === 'count_task_update' || data.event === 'count_task_update') {
        const activeWh = this.authStore.activeWarehouseId();
        if (data.warehouse_id && activeWh && activeWh !== 'ALL' && activeWh !== -1) {
          if (String(data.warehouse_id) !== String(activeWh)) {
            return;
          }
        }
        if (data.task && data.task.id) {
          this.updateTaskInPlace(data.task);
        } else if (data.task_id) {
          this.countTaskApi.getById(String(data.task_id)).subscribe({
            next: (t) => { if (t) this.updateTaskInPlace(t); },
            error: () => this.wsTaskUpdateSubject.next(data)
          });
        } else {
          this.wsTaskUpdateSubject.next(data);
        }
      }
    });

    // ─── SWR Live Revalidation: دریافت داده‌های جدیدتر سرور در پس‌زمینه با تطبیق دقیق ───
    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      const isTrackingEndpoint = url.includes('/api/inventory/count-tasks/') &&
        (url.includes('as_role=tracking') || (!url.includes('as_role=supervisor') && !url.includes('as_role=counter') && !url.includes('as_role=manager')));
      
      if (isTrackingEndpoint && data) {
        const freshList = Array.isArray(data) ? data : data.results || [];
        if (freshList.length > 0) {
          const processed = this.preprocessTasks(freshList);
          this.trackUpdates(this.tasks, processed);
          this.tasks = processed;
          this.computeStats();
          this.buildFilterOptions();
          this.applyFilters();
          this.cdr.detectChanges();
          console.log('[CountTracking] ⚡ داده‌های پیگیری با استعلام پس‌زمینه SWR به‌روزرسانی شد.');
        }
      }
    });
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    this.swrSub?.unsubscribe();
    this.wsDebounceSub?.unsubscribe();
    this.wsTaskUpdateSubject.complete();
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
  }

  /** محاسبه متمرکز و یکپارچه موجودی سیستم بر اساس bal4miv > inventory > balance */
  getSystemBalance(itemDetails: any): number | null {
    if (!itemDetails) return null;
    const raw = itemDetails.bal4miv !== undefined && itemDetails.bal4miv !== null && String(itemDetails.bal4miv).trim() !== ''
      ? itemDetails.bal4miv
      : (itemDetails.inventory !== undefined && itemDetails.inventory !== null && String(itemDetails.inventory).trim() !== ''
          ? itemDetails.inventory
          : itemDetails.balance);
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const num = parseFloat(raw);
    return isNaN(num) ? null : num;
  }

  /** پیش‌پردازش و محاسبه یکباره فیلدهای سنگین یک تسک */
  preprocessTask(t: any): any {
    t._computed_manager_name = this.getManagerName(t);
    t._computed_counter_dur = this.getStageDuration(t, 'counter');
    t._computed_supervisor_dur = this.getStageDuration(t, 'supervisor');
    t._computed_manager_dur = this.getStageDuration(t, 'manager');
    const counted = parseFloat(t.counted_balance);
    const system = this.getSystemBalance(t.item_details);
    t._system_balance = system;
    t._discrepancy = (!isNaN(counted) && system !== null) ? (counted - system) : null;
    return t;
  }

  /** پیش‌پردازش آرایه تسک‌ها */
  preprocessTasks(raw: any[]): any[] {
    return raw.map((t: any) => this.preprocessTask(t));
  }

  /** به‌روزرسانی موضعی یک تسک در آرایه جاری بدون ریفرش کل جدول و بدون تغییر صفحه */
  updateTaskInPlace(taskData: any) {
    if (!taskData || !taskData.id) return;
    const idx = this.tasks.findIndex((t: any) => t.id === taskData.id);
    if (taskData._deleted || taskData.is_deleted) {
      if (idx !== -1) {
        this.tasks.splice(idx, 1);
        this.selectedTaskIds.delete(taskData.id);
        this.computeStats();
        this.buildFilterOptions();
        this.applyFilters();
        this.cdr.detectChanges();
      }
      return;
    }
    if (idx !== -1) {
      const merged = { ...this.tasks[idx], ...taskData };
      this.tasks[idx] = this.preprocessTask(merged);
      this.updatedTaskIds.add(taskData.id);
      if (this.flashTimeout) clearTimeout(this.flashTimeout);
      this.flashTimeout = setTimeout(() => {
        this.updatedTaskIds.clear();
        this.cdr.detectChanges();
      }, 4000);
      this.computeStats();
      this.buildFilterOptions();
      this.applyFilters();
      this.cdr.detectChanges();
    } else {
      this.wsTaskUpdateSubject.next(taskData);
    }
  }

  /** خواندن وضعیت از پارامترهای آدرس مرورگر */
  private syncStateFromUrl() {
    if (!this.router.url.split('?')[0].includes('/count-tracking')) return;
    const params = this.router.parseUrl(this.router.url).queryParams;
    this.showOnlyDiscrepancies = params['discrepancies'] === 'true';
    const page = parseInt(params['page'], 10);
    if (!isNaN(page) && page > 0) this.currentPage = page;
    this.loadTasks();
  }

  toggleCompleted() {
    this.showCompleted = !this.showCompleted;
    this.savedShowCompletedState = this.showCompleted;
    this.selectedTaskIds = new Set();
    this.applyFilters();
  }

  loadTasks(showLoading = true, preserveState = false) {
    if (!preserveState) {
      this.selectedTaskIds = new Set();
    }
    if (showLoading) {
      this.isLoading = true;
    }
    const params: any = { as_role: 'tracking', show_completed: true, page_size: 5000 };
    const whId = this.authStore.activeWarehouseId();
    if (whId && whId !== 'ALL' && whId !== -1) {
      params.warehouse_id = whId;
    }
    
    this.countTaskApi.getAll(params).subscribe({
      next: (res: any) => {
        const raw = Array.isArray(res) ? res : (res.results || []);
        const processed = this.preprocessTasks(raw);
        this.trackUpdates(this.tasks || [], processed);
        this.tasks = processed;
        this.computeStats();
        this.buildFilterOptions();
        if (!preserveState) {
          this.currentPage = 1;
        } else {
          const validIds = new Set(this.tasks.map((t: any) => t.id));
          this.selectedTaskIds = new Set(Array.from(this.selectedTaskIds).filter(id => validIds.has(id)));
        }
        this.applyFilters();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت لیست تسک‌ها');
        this.isLoading = false;
        this.cdr.detectChanges();
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

  /** نرمال‌سازی حروف فارسی و عربی جهت جستجوی دقیق */
  normalizeText(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/[\u064A\u0649]/g, 'ی')
      .replace(/[\u0643]/g, 'ک')
      .replace(/[\u0622\u0623\u0625]/g, 'ا')
      .replace(/[\u0629]/g, 'ه')
      .replace(/[\u200C\u200B]/g, ' ')
      .trim()
      .toLowerCase();
  }

  applyFilters() {
    const globalQ = this.tableSearch?.trim() || '';
    const filters = this.tableFilters;

    this.filteredTasks = this.tasks.filter(t => {
      // ── فیلتر عدم نمایش اقلام تأیید نهایی در حالت عادی ──
      if (!this.showCompleted && this.discrepancyFilter !== 'approved') {
        if (t.status === 'FINAL_APPROVED') return false;
      }

      // ── فیلتر مغایرت و وضعیت تفکیکی ──
      if (this.discrepancyFilter === 'discrepancy' || (this.showOnlyDiscrepancies && this.discrepancyFilter === 'all')) {
        if (t._discrepancy === null || Math.abs(t._discrepancy) <= 0.0001) return false;
      } else if (this.discrepancyFilter === 'shortage') {
        if (t._discrepancy === null || t._discrepancy >= -0.0001) return false;
      } else if (this.discrepancyFilter === 'surplus') {
        if (t._discrepancy === null || t._discrepancy <= 0.0001) return false;
      } else if (this.discrepancyFilter === 'counted') {
        if (t.status === 'PENDING_COUNT') return false;
      } else if (this.discrepancyFilter === 'approved') {
        if (t.status !== 'FINAL_APPROVED') return false;
      }

      // ── جستجوی سراسری با نرمال‌سازی حروف ──
      if (globalQ) {
        const normQ = this.normalizeText(globalQ);
        const haystack = [
          t.item_details?.fa_unic_code,
          t.item_details?.description,
          t.item_details?.item_no,
          t.item_details?.po,
          t.item_details?.new_location,
          t.item_details?.old_location,
          t.counter_name,
          t.supervisor_name,
          t._computed_manager_name,
          t.item_details?.warehouse_name
        ].filter(Boolean).map((v: any) => this.normalizeText(v)).join(' ');
        if (!haystack.includes(normQ)) return false;
      }

      // ── فیلتر چک‌باکسی ستون‌ها ──
      // انبار
      if (filters['warehouse_name']) {
        const allowed = filters['warehouse_name'].split(',');
        const val = t.item_details?.warehouse_name || '-';
        if (!allowed.includes(val)) return false;
      }
      // انبارگردان
      if (filters['counter']) {
        const allowed = filters['counter'].split(',');
        const val = t.counter_name || 'نامشخص';
        if (!allowed.includes(val)) return false;
      }
      // سرپرست
      if (filters['supervisor']) {
        const allowed = filters['supervisor'].split(',');
        const val = t.supervisor_name || 'ندارد';
        if (!allowed.includes(val)) return false;
      }
      // مدیریت
      if (filters['manager']) {
        const allowed = filters['manager'].split(',');
        const val = t._computed_manager_name;
        if (!allowed.includes(val)) return false;
      }
      // وضعیت
      if (filters['status']) {
        const allowed = filters['status'].split(',');
        if (!allowed.includes(t.status)) return false;
      }

      // ── فیلتر بازه زمانی (آخرین تغییر) ──
      if (filters['updated_at_after'] && t.updated_at) {
        if (new Date(t.updated_at).getTime() < new Date(filters['updated_at_after']).getTime()) return false;
      }
      if (filters['updated_at_before'] && t.updated_at) {
        if (new Date(t.updated_at).getTime() > new Date(filters['updated_at_before']).getTime()) return false;
      }

      // ── فیلتر بازه زمانی (تاریخ ایجاد) ──
      if (filters['created_at_after'] && t.created_at) {
        if (new Date(t.created_at).getTime() < new Date(filters['created_at_after']).getTime()) return false;
      }
      if (filters['created_at_before'] && t.created_at) {
        if (new Date(t.created_at).getTime() > new Date(filters['created_at_before']).getTime()) return false;
      }

      // ── فیلتر بازه عددی (تعداد شمارش) ──
      if (filters['counted_balance_min']) {
        if (t.counted_balance === null || Number(t.counted_balance) < Number(filters['counted_balance_min'])) return false;
      }
      if (filters['counted_balance_max']) {
        if (t.counted_balance === null || Number(t.counted_balance) > Number(filters['counted_balance_max'])) return false;
      }

      // ── فیلترهای متنی سرستون (_search) با نرمال‌سازی ──
      if (filters['warehouse_name_search']) {
        const q = this.normalizeText(filters['warehouse_name_search']);
        if (!this.normalizeText(t.item_details?.warehouse_name || '').includes(q)) return false;
      }
      if (filters['counter_search']) {
        const q = this.normalizeText(filters['counter_search']);
        if (!this.normalizeText(t.counter_name || 'نامشخص').includes(q)) return false;
      }
      if (filters['supervisor_search']) {
        const q = this.normalizeText(filters['supervisor_search']);
        if (!this.normalizeText(t.supervisor_name || 'ندارد').includes(q)) return false;
      }
      if (filters['manager_search']) {
        const q = this.normalizeText(filters['manager_search']);
        if (!this.normalizeText(t._computed_manager_name || '').includes(q)) return false;
      }
      if (filters['status_search']) {
        const q = this.normalizeText(filters['status_search']);
        if (!this.normalizeText(this.getStatusName(t.status)).includes(q)) return false;
      }
      // فیلترهای متنی ساده (کد کالا و شرح کالا)
      if (filters['fa_unic_code']) {
        const q = this.normalizeText(filters['fa_unic_code']);
        if (!this.normalizeText(t.item_details?.fa_unic_code || '').includes(q)) return false;
      }
      if (filters['description']) {
        const q = this.normalizeText(filters['description']);
        if (!this.normalizeText(t.item_details?.description || '').includes(q)) return false;
      }

      return true;
    });
  }

  // ── محاسبه آمار خطی (Mini Dashboard) ──
  computeStats() {
    this.statTotal = this.tasks.length;
    this.statCounted = this.tasks.filter(t => t.status !== 'PENDING_COUNT').length;
    this.statDiscrepancy = this.tasks.filter(t => t._discrepancy !== null && Math.abs(t._discrepancy) > 0.0001).length;
    this.statShortage = this.tasks.filter(t => t._discrepancy !== null && t._discrepancy < -0.0001).length;
    this.statSurplus = this.tasks.filter(t => t._discrepancy !== null && t._discrepancy > 0.0001).length;
    this.statApproved = this.tasks.filter(t => t.status === 'FINAL_APPROVED').length;
  }

  // ── اعمال فیلتر سریع مغایرت، کسری، مازاد یا وضعیت ──
  setDiscrepancyFilter(type: 'all' | 'counted' | 'discrepancy' | 'shortage' | 'surplus' | 'approved') {
    const wasApproved = this.discrepancyFilter === 'approved';
    const isApproved = type === 'approved';

    if (this.discrepancyFilter === type) {
      this.discrepancyFilter = 'all';
      this.showOnlyDiscrepancies = false;
      if (wasApproved) {
        this.showCompleted = this.savedShowCompletedState;
      }
    } else {
      if (isApproved && !wasApproved) {
        this.savedShowCompletedState = this.showCompleted;
        this.showCompleted = true;
      } else if (!isApproved && wasApproved) {
        this.showCompleted = this.savedShowCompletedState;
      }
      this.discrepancyFilter = type;
      this.showOnlyDiscrepancies = (type === 'discrepancy' || type === 'shortage' || type === 'surplus');
    }
    this.selectedTaskIds.clear();
    this.currentPage = 1;
    this.applyFilters();
  }

  get eligibleGreenTasksCount(): number {
    return this.filteredTasks.filter(t =>
      t.status === 'MANAGER_REVIEW' && t._discrepancy !== null && Math.abs(t._discrepancy) < 0.0001
    ).length;
  }

  // ── فیلتر فقط مغایرت‌ها (سازگاری با دکمه قبلی) ──
  toggleDiscrepancyFilter() {
    if (this.discrepancyFilter === 'discrepancy') {
      this.setDiscrepancyFilter('all');
    } else {
      this.setDiscrepancyFilter('discrepancy');
    }
  }

  // ── سورت کلاینت‌ساید ──
  onSortChanged(sort: SortState) {
    if (!sort.key) return;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const key = sort.key;

    this.filteredTasks.sort((a, b) => {
      let valA = this.resolveSortValue(a, key);
      let valB = this.resolveSortValue(b, key);

      // Handle nulls
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      // Numeric comparison
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * dir;
      }

      // String comparison
      return String(valA).localeCompare(String(valB), 'fa') * dir;
    });
    this.currentPage = 1;
  }

  private resolveSortValue(row: any, key: string): any {
    switch (key) {
      case 'warehouse_name': return row.item_details?.warehouse_name || '';
      case 'fa_unic_code': return row.item_details?.fa_unic_code || '';
      case 'description': return row.item_details?.description || '';
      case 'counter': return row.counter_name || '';
      case 'supervisor': return row.supervisor_name || '';
      case 'manager': return row._computed_manager_name || '';
      case 'status': return row.status || '';
      case 'counted_balance': return row.counted_balance != null ? Number(row.counted_balance) : null;
      case 'discrepancy': return row._discrepancy;
      case 'created_at': return row.created_at ? new Date(row.created_at).getTime() : null;
      case 'updated_at': return row.updated_at ? new Date(row.updated_at).getTime() : null;
      default: return row[key];
    }
  }

  // ── تأیید گروهی موارد بدون مغایرت (Manager Approve) ──
  async bulkApproveGreenTasks() {
    // تسک‌هایی که وضعیتشان MANAGER_REVIEW بوده و مغایرت ندارند
    const greenTasks = this.filteredTasks.filter(t =>
      t.status === 'MANAGER_REVIEW' && t._discrepancy !== null && Math.abs(t._discrepancy) < 0.0001
    );

    if (greenTasks.length === 0) {
      this.toast.show('warning', 'هیچ تسکی با وضعیت «در کارتابل مدیر» و بدون مغایرت وجود ندارد.');
      return;
    }

    const confirmed = await this.confirmDialog.open({
      title: 'تأیید گروهی مدیر',
      message: `آیا از تأیید نهایی ${greenTasks.length} تسک بدون مغایرت (سبز) اطمینان دارید؟`,
      confirmText: 'بله، تأیید نهایی',
      cancelText: 'انصراف',
      type: 'info'
    });

    if (confirmed) {
      const ids = greenTasks.map((t: any) => t.id);
      
      // اعمال به‌روزرسانی خوش‌بینانه (Optimistic Update)
      for (const t of this.tasks) {
        if (ids.includes(t.id)) {
          t.status = 'FINAL_APPROVED';
          t._offlinePending = true;
          this.updatedTaskIds.add(t.id);
        }
      }
      this.computeStats();
      this.applyFilters();
      this.cdr.detectChanges();

      this.countTaskApi.bulkManagerApprove(ids).subscribe({
        next: (res: any) => {
          const isOffline = res?._offlinePending || !navigator.onLine;
          if (isOffline) {
            this.toast.show('info', `تأیید نهایی ${ids.length} تسک در صف ارسال آفلاین قرار گرفت.`);
          } else {
            this.toast.show('success', res?.message || `${ids.length} تسک تأیید نهایی شد.`);
          }
          this.loadTasks(false, true);
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در تأیید گروهی');
          this.loadTasks(false, true);
        }
      });
    }
  }

  // ── ساخت گزینه‌های فیلتر از داده‌های دریافتی ──
  buildFilterOptions() {
    const unique = (arr: string[]) => [...new Set(arr)].sort();

    this.warehouseOptions = unique(
      this.tasks.map(t => t.item_details?.warehouse_name || '-')
    ).map(v => ({ label: v, value: v }));

    this.counterOptions = unique(
      this.tasks.map(t => t.counter_name || 'نامشخص')
    ).map(v => ({ label: v, value: v }));

    this.supervisorOptions = unique(
      this.tasks.map(t => t.supervisor_name || 'ندارد')
    ).map(v => ({ label: v, value: v }));

    this.managerOptions = unique(
      this.tasks.map(t => t._computed_manager_name || 'استخر مشترک')
    ).map(v => ({ label: v, value: v }));
  }

  // ── صفحه‌بندی ──
  get paginatedTasks(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTasks.slice(start, start + this.pageSize);
  }

  onPageChange(event: { page: number; pageSize: number }) {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
  }

  onTableSearch(term: string) {
    this.tableSearch = term;
    this.currentPage = 1;
    this.applyFilters();
  }

  onTableFilter(filters: Record<string, string>) {
    this.tableFilters = filters;
    this.currentPage = 1;
    this.applyFilters();
  }

  onFiltersCleared() {
    this.tableSearch = '';
    this.tableFilters = {};
    this.currentPage = 1;
    this.applyFilters();
  }

  onSelectionChange(selectedIds: Set<any>) {
    this.selectedTaskIds = new Set(Array.from(selectedIds).map(id => Number(id)));
  }

  async cancelAllocation() {
    if (this.selectedTaskIds.size === 0) {
      this.toast.show('warning', 'هیچ رکوردی انتخاب نشده است');
      return;
    }

    // فیلتر رکوردهای مجاز (PENDING_COUNT و INITIAL_COUNT)
    const allowedStatuses = ['PENDING_COUNT', 'INITIAL_COUNT'];
    const selectedTasks = this.filteredTasks.filter(t => this.selectedTaskIds.has(t.id));
    const eligibleIds = selectedTasks.filter(t => allowedStatuses.includes(t.status)).map(t => t.id);
    const ineligibleCount = selectedTasks.length - eligibleIds.length;

    if (eligibleIds.length === 0) {
      this.toast.show('warning', 'هیچ‌یک از رکوردهای انتخاب شده قابل لغو تخصیص نیستند. فقط رکوردهای «در انتظار شمارش» و «شمارش اولیه» مجاز هستند.');
      return;
    }

    let msg = `آیا از لغو تخصیص و بازگرداندن ${eligibleIds.length} رکورد به استخر تخصیص کالا اطمینان دارید؟`;
    if (ineligibleCount > 0) {
      msg += `\n(${ineligibleCount} رکورد به دلیل وضعیت نامعتبر نادیده گرفته می‌شود.)`;
    }

    const confirmed = await this.confirmDialog.open({
      title: 'لغو تخصیص',
      message: msg,
      confirmText: 'بله، لغو تخصیص',
      cancelText: 'انصراف',
      type: 'warning'
    });

    if (confirmed) {
      // اعمال به‌روزرسانی خوش‌بینانه و حذف از لیست جاری پیگیری
      this.tasks = this.tasks.filter(t => !eligibleIds.includes(t.id));
      for (const id of eligibleIds) {
        this.selectedTaskIds.delete(id);
      }
      this.computeStats();
      this.applyFilters();
      this.cdr.detectChanges();

      this.countTaskApi.bulkCancel(eligibleIds).subscribe({
        next: (res: any) => {
          const isOffline = res?._offlinePending || !navigator.onLine;
          if (isOffline) {
            this.toast.show('info', `لغو تخصیص ${eligibleIds.length} رکورد در صف ارسال آفلاین قرار گرفت.`);
          } else {
            this.toast.show('success', res?.message || `${eligibleIds.length} رکورد لغو تخصیص شد.`);
          }
          this.loadTasks(false, true);
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در لغو تخصیص');
          this.loadTasks(false, true);
        }
      });
    }
  }

  async cancelSingleAllocation(task: any) {
    if (task.status !== 'PENDING_COUNT' && task.status !== 'INITIAL_COUNT') {
      this.toast.show('warning', 'فقط رکوردهای «در انتظار شمارش» و «شمارش اولیه» قابل لغو تخصیص هستند.');
      return;
    }

    const confirmed = await this.confirmDialog.open({
      title: 'لغو تخصیص',
      message: `آیا از لغو تخصیص کالای ${task.item_details?.fa_unic_code || ''} و بازگرداندن به استخر کالا اطمینان دارید؟`,
      confirmText: 'بله، لغو تخصیص',
      cancelText: 'انصراف',
      type: 'warning'
    });

    if (confirmed) {
      // اعمال به‌روزرسانی خوش‌بینانه و حذف از لیست جاری
      this.tasks = this.tasks.filter(t => t.id !== task.id);
      this.selectedTaskIds.delete(task.id);
      this.computeStats();
      this.applyFilters();
      this.cdr.detectChanges();

      this.countTaskApi.bulkCancel([task.id]).subscribe({
        next: (res: any) => {
          const isOffline = res?._offlinePending || !navigator.onLine;
          if (isOffline) {
            this.toast.show('info', 'لغو تخصیص در صف ارسال آفلاین قرار گرفت.');
          } else {
            this.toast.show('success', res?.message || 'تخصیص با موفقیت لغو شد');
          }
          this.loadTasks(false, true);
        },
        error: (err) => {
          this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در لغو تخصیص');
          this.loadTasks(false, true);
        }
      });
    }
  }

  getStatusName(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING_COUNT': 'در انتظار شمارش',
      'INITIAL_COUNT': 'شمارش اولیه (ثبت موقت)',
      'COUNTED': 'در کارتابل سرپرست',
      'MANAGER_REVIEW': 'در کارتابل مدیر',
      'SUPERVISOR_REJECTED': 'مغایرت - ارجاع به انبارگردان',
      'MANAGER_REJECTED': 'مغایرت - ارجاع به سرپرست',
      'FINAL_APPROVED': 'تایید نهایی'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const classMap: Record<string, string> = {
      'PENDING_COUNT': 'bg-slate-100 text-slate-700 border-slate-200',
      'INITIAL_COUNT': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'COUNTED': 'bg-amber-50 text-amber-700 border-amber-200',
      'MANAGER_REVIEW': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
      'SUPERVISOR_REJECTED': 'bg-rose-50 text-rose-700 border-rose-200',
      'MANAGER_REJECTED': 'bg-rose-50 text-rose-700 border-rose-200',
      'FINAL_APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
    return 'px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center shadow-2xs ' + (classMap[status] || 'bg-slate-50 text-slate-800');
  }

  getBalanceColorClass(row: any): string {
    const counted = parseFloat(row.counted_balance);
    const system = this.getSystemBalance(row.item_details);
    
    if (isNaN(counted) || system === null) return 'text-slate-800 font-bold';
    
    if (Math.abs(counted - system) < 0.0001) return 'text-emerald-600 font-bold';
    
    // محاسبه درصد مغایرت
    let diffPercent = 0;
    if (system === 0) {
       diffPercent = 100;
    } else {
       diffPercent = Math.abs((counted - system) / system) * 100;
    }

    if (diffPercent < 5) return 'text-amber-600 font-bold';
    if (diffPercent <= 20) return 'text-orange-600 font-bold';
    return 'text-rose-600 font-bold';
  }

  formatDuration(diffMs: number): string {
    if (isNaN(diffMs) || diffMs < 0) return '-';
    
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (remainingHours > 0) {
        return `${days} روز و ${remainingHours} ساعت`;
      }
      return `${days} روز`;
    }
    
    if (hours > 0) {
      return `${hours} ساعت و ${mins} دقیقه`;
    }
    
    return `${mins} دقیقه`;
  }

  getStageDuration(task: CountTask, stage: 'counter' | 'supervisor' | 'manager'): string | null {
    if (!task.history || task.history.length === 0) {
      if (stage === 'counter' && task.created_at && (task.status === 'PENDING_COUNT' || task.status === 'INITIAL_COUNT')) {
         return this.formatDuration(new Date().getTime() - new Date(task.created_at).getTime());
      }
      return null;
    }

    const sortedHistory = [...task.history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const findDate = (type: string) => {
      const e = sortedHistory.find(h => h.action_type === type);
      return e ? new Date(e.created_at).getTime() : null;
    };

    const taskCreated = new Date(task.created_at).getTime();
    const now = new Date().getTime();

    if (stage === 'counter') {
      const counted = findDate('COUNTED');
      const start = findDate('SUPERVISOR_REJECTED') || taskCreated;
      if (counted && counted > start) return this.formatDuration(counted - start);
      if (task.status === 'PENDING_COUNT' || task.status === 'INITIAL_COUNT' || task.status === 'SUPERVISOR_REJECTED') return this.formatDuration(now - start);
      return null;
    }

    if (stage === 'supervisor') {
      const counted = findDate('COUNTED');
      if (!counted) return null;
      const start = findDate('MANAGER_REJECTED') || counted;
      const mgrReview = findDate('MANAGER_REVIEW');
      const supReject = findDate('SUPERVISOR_REJECTED');
      const end = Math.max(mgrReview || 0, supReject || 0);
      
      if (end && end > start) return this.formatDuration(end - start);
      if (task.status === 'COUNTED' || task.status === 'MANAGER_REJECTED') return this.formatDuration(now - start);
      return null;
    }

    if (stage === 'manager') {
      const mgrReview = findDate('MANAGER_REVIEW');
      if (!mgrReview) return null;
      const approved = findDate('FINAL_APPROVED');
      const mgrReject = findDate('MANAGER_REJECTED');
      const end = Math.max(approved || 0, mgrReject || 0);
      
      if (end && end > mgrReview) return this.formatDuration(end - mgrReview);
      if (task.status === 'MANAGER_REVIEW') return this.formatDuration(now - mgrReview);
      return null;
    }
    return null;
  }

  getManagerName(task: CountTask): string {
    if (task.assigned_manager_name) return task.assigned_manager_name;
    if (task.history && task.history.length > 0) {
      const sortedHistory = [...task.history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const managerAction = sortedHistory.find(h => h.action_type === 'FINAL_APPROVED' || h.action_type === 'MANAGER_REJECTED');
      if (managerAction && managerAction.action_by_name) {
        return managerAction.action_by_name;
      }
    }
    return 'استخر مشترک';
  }

  // ─── Export Excel Methods ───

  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.selectedTaskIds.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
  }

  closeExportModal() {
    this.isExporting = false;
    this.isExportModalOpen = false;
    if (this.exportSubscription) {
      try { this.exportSubscription.unsubscribe(); } catch (e) {}
      this.exportSubscription = undefined;
    }
  }

  onExportDataScopeChange(scope: 'all' | 'selected') {
    this.exportDataScope = scope;
    if (scope === 'all') {
      this.exportColumnScope = 'all_db';
    } else {
      this.exportColumnScope = 'visible';
    }
  }

  toggleExportColumn(key: string) {
    if (this.selectedExportColumns.has(key)) {
      this.selectedExportColumns.delete(key);
    } else {
      this.selectedExportColumns.add(key);
    }
  }

  executeExport() {
    this.isExporting = true;

    const payload: any = {
      data_scope: this.exportDataScope,
      columns_scope: this.exportColumnScope,
      as_role: 'tracking',
      show_completed: this.showCompleted ? 'true' : 'false',
    };

    const whId = this.authStore.activeWarehouseId();
    if (whId && whId !== 'ALL' && whId !== -1) {
      payload.warehouse_id = whId;
    }

    if (this.exportDataScope === 'selected') {
      payload.selected_ids = Array.from(this.selectedTaskIds);
    }

    if (this.exportColumnScope === 'visible') {
      payload.columns_list = this.visibleCols;
    } else if (this.exportColumnScope === 'custom') {
      payload.columns_list = Array.from(this.selectedExportColumns);
    }

    this.exportSubscription = this.countTaskApi.exportExcel(payload).subscribe({
      next: (blob) => {
        try {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `count_tracking_${new Date().getTime()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
        } catch (e) {
          console.error('File download error', e);
        }
        this.isExporting = false;
        this.closeExportModal();
        this.toast.show('success', 'فایل اکسل با موفقیت دانلود شد.');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Export error:', err);
        this.toast.show('error', 'خطا در دانلود فایل اکسل');
        this.isExporting = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ─── اسکن بارکد دوربین ───
  onBarcodeScanned(barcode: string) {
    if (!barcode) return;
    const clean = barcode.trim();
    this.tableSearch = clean;
    this.currentPage = 1;
    this.applyFilters();
    this.toast.show('info', `فیلتر بر اساس بارکد: ${clean}`);
  }

  // ─── بستن مودال‌ها با کلید ESC ───
  @HostListener('window:keydown.escape')
  handleEscapeKey() {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else if (this.isPerformanceModalOpen) {
      this.closePerformanceModal();
    } else if (this.isExportModalOpen) {
      this.closeExportModal();
    }
  }

  // ─── کشوی جانبی تایم‌لاین گردش کالا (Drawer) ───
  openDrawer(task: any) {
    if (!task) return;
    this.selectedTaskForDrawer = task;
    this.isDrawerOpen = true;
    this.isLoadingDrawerHistory = true;
    this.cdr.detectChanges();

    // استعلام زنده تاریخچه کامل تسک جهت اطمینان از جدیدترین لاگ‌ها
    this.countTaskApi.getById(String(task.id)).subscribe({
      next: (fresh: any) => {
        if (fresh && this.selectedTaskForDrawer?.id === task.id) {
          this.selectedTaskForDrawer = this.preprocessTask(fresh);
        }
        this.isLoadingDrawerHistory = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingDrawerHistory = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.selectedTaskForDrawer = null;
    this.cdr.detectChanges();
  }

  getActionTypeName(actionType: string): string {
    const map: Record<string, string> = {
      'PENDING_COUNT': 'ایجاد یا بازگشت به انتظار شمارش',
      'INITIAL_COUNT': 'ثبت موقت شمارش اولیه',
      'COUNTED': 'اتمام شمارش و ارسال به سرپرست',
      'SUPERVISOR_APPROVED': 'تایید سرپرست و ارسال به مدیر',
      'SUPERVISOR_REJECTED': 'رد سرپرست (مغایرت - ارجاع به انبارگردان)',
      'MANAGER_REVIEW': 'در انتظار بررسی مدیریت',
      'MANAGER_REJECTED': 'رد مدیر (مغایرت - ارجاع به سرپرست/شمارش)',
      'FINAL_APPROVED': 'تایید نهایی انبارگردانی',
      'CANCEL_ALLOCATION': 'لغو تخصیص کالا',
      'RECOUNT': 'درخواست بازشماری'
    };
    return map[actionType] || actionType || 'ثبت اقدام';
  }

  getActionBadgeClass(actionType: string): string {
    const map: Record<string, string> = {
      'PENDING_COUNT': 'bg-slate-100 text-slate-700 border-slate-200',
      'INITIAL_COUNT': 'bg-blue-50 text-blue-700 border-blue-200',
      'COUNTED': 'bg-indigo-50 text-indigo-700 border-indigo-200',
      'SUPERVISOR_APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200',
      'SUPERVISOR_REJECTED': 'bg-rose-50 text-rose-700 border-rose-200',
      'MANAGER_REVIEW': 'bg-purple-50 text-purple-700 border-purple-200',
      'MANAGER_REJECTED': 'bg-amber-50 text-amber-700 border-amber-200',
      'FINAL_APPROVED': 'bg-emerald-100 text-emerald-800 border-emerald-300',
      'CANCEL_ALLOCATION': 'bg-rose-50 text-rose-700 border-rose-200'
    };
    return map[actionType] || 'bg-slate-100 text-slate-700 border-slate-200';
  }

  // ─── مودال خلاصه عملکرد و راندمان افراد تیم ───
  openPerformanceModal() {
    this.calculateTeamPerformance();
    this.isPerformanceModalOpen = true;
    this.cdr.detectChanges();
  }

  closePerformanceModal() {
    this.isPerformanceModalOpen = false;
    this.cdr.detectChanges();
  }

  calculateTeamPerformance() {
    const allTasks = this.tasks || [];

    // ─── ۱. انبارگردان‌ها ───
    const counterMap = new Map<string, {
      name: string;
      total: number;
      counted: number;
      discrepancies: number;
      timestamps: number[];
    }>();

    let unassignedCount = 0;
    for (const t of allTasks) {
      if (!t.counter_name) {
        unassignedCount++;
        continue;
      }
      const name = t.counter_name;
      if (!counterMap.has(name)) {
        counterMap.set(name, {
          name,
          total: 0,
          counted: 0,
          discrepancies: 0,
          timestamps: []
        });
      }
      const entry = counterMap.get(name)!;
      entry.total++;
      if (t.status !== 'PENDING_COUNT') {
        entry.counted++;
        if (t._discrepancy !== null && Math.abs(t._discrepancy) > 0.0001) {
          entry.discrepancies++;
        }
        if (t.updated_at) entry.timestamps.push(new Date(t.updated_at).getTime());
      }
    }

    this.counterStats = Array.from(counterMap.values()).map(c => {
      const progressPercent = c.total > 0 ? Math.round((c.counted / c.total) * 100) : 0;
      const discrepancyRate = c.counted > 0 ? Math.round((c.discrepancies / c.counted) * 100) : 0;
      const accuracyRate = 100 - discrepancyRate;

      let itemsPerHour = 0;
      if (c.counted > 0 && c.timestamps.length >= 2) {
        const sortedTs = [...c.timestamps].sort((a, b) => a - b);
        let sessionStart = sortedTs[0];
        let sessionEnd = sortedTs[0];
        let totalMs = 0;
        for (let i = 1; i < sortedTs.length; i++) {
          const diff = sortedTs[i] - sortedTs[i - 1];
          if (diff <= 2 * 60 * 60 * 1000) {
            sessionEnd = sortedTs[i];
          } else {
            totalMs += Math.max(sessionEnd - sessionStart, 15 * 60 * 1000);
            sessionStart = sortedTs[i];
            sessionEnd = sortedTs[i];
          }
        }
        totalMs += Math.max(sessionEnd - sessionStart, 15 * 60 * 1000);
        const effectiveHours = totalMs / (1000 * 60 * 60);
        itemsPerHour = effectiveHours > 0 ? Math.round((c.counted / effectiveHours) * 10) / 10 : c.counted;
      } else if (c.counted > 0) {
        itemsPerHour = c.counted;
      }

      return {
        name: c.name,
        total: c.total,
        counted: c.counted,
        pending: c.total - c.counted,
        progressPercent,
        discrepancies: c.discrepancies,
        discrepancyRate,
        accuracyRate,
        itemsPerHour: Math.min(itemsPerHour, 300)
      };
    }).sort((a, b) => b.counted - a.counted);

    // ─── ۲. سرپرستان ───
    const supervisorMap = new Map<string, {
      name: string;
      reviewed: number;
      approved: number;
      rejected: number;
    }>();

    for (const t of allTasks) {
      if (!t.supervisor_name) continue;
      const name = t.supervisor_name;
      if (!supervisorMap.has(name)) {
        supervisorMap.set(name, {
          name,
          reviewed: 0,
          approved: 0,
          rejected: 0
        });
      }
      const entry = supervisorMap.get(name)!;
      if (['MANAGER_REVIEW', 'SUPERVISOR_REJECTED', 'FINAL_APPROVED', 'MANAGER_REJECTED'].includes(t.status)) {
        entry.reviewed++;
        if (t.status === 'SUPERVISOR_REJECTED') {
          entry.rejected++;
        } else {
          entry.approved++;
        }
      }
    }

    this.supervisorStats = Array.from(supervisorMap.values()).map(s => {
      const rejectionRate = s.reviewed > 0 ? Math.round((s.rejected / s.reviewed) * 100) : 0;
      const approvalRate = 100 - rejectionRate;
      return {
        name: s.name,
        reviewed: s.reviewed,
        approved: s.approved,
        rejected: s.rejected,
        rejectionRate,
        approvalRate
      };
    }).sort((a, b) => b.reviewed - a.reviewed);

    // ─── ۳. خلاصه کلی ───
    const totalTasks = allTasks.length;
    const totalCounted = this.statCounted;
    const totalDiscrepancies = this.statDiscrepancy;
    const overallProgress = totalTasks > 0 ? Math.round((totalCounted / totalTasks) * 100) : 0;
    const overallAccuracy = totalCounted > 0 ? Math.round(((totalCounted - totalDiscrepancies) / totalCounted) * 100) : 100;
    const topCounter = this.counterStats.find(c => c.counted >= 3) || this.counterStats[0];

    this.overviewStats = {
      totalTasks,
      unassignedTasks: unassignedCount,
      totalCounted,
      totalApproved: this.statApproved,
      totalDiscrepancies,
      overallProgress,
      overallAccuracy,
      activeCountersCount: this.counterStats.filter(c => c.counted > 0).length,
      activeSupervisorsCount: this.supervisorStats.length,
      topCounterName: topCounter?.name || '-',
      topCounterSpeed: topCounter?.itemsPerHour || 0
    };

    this.performanceTabs[1].count = this.counterStats.length;
    this.performanceTabs[2].count = this.supervisorStats.length;
  }

  onPerformanceTabChange(tabId: string) {
    this.performanceActiveTab = tabId as 'overview' | 'counters' | 'supervisors';
  }
}

