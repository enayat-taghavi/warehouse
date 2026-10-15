import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { firstValueFrom, Subscription, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../../../core/services/state.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { DataTableComponent, TableColumnDirective } from '../../../../shared';
import { ItemApiService } from '../../api/item-api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ConfirmDialogService } from '../../../../shared';
import { PersianDatePipe } from '../../../../shared';
import { AccountsHttpService } from '../../../../core/http/accounts-http.service';
import { SettingsService } from '../../../../core/services/settings';
import { DraggableDirective } from '../../../../shared/directives/draggable.directive';
import { LabelDesigner } from '../label-designer/label-designer';
import { SmartDeleteModalComponent } from '../../../../shared/components/smart-delete-modal/smart-delete-modal';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { ItemPhotoGalleryComponent } from '../item-photo-gallery/item-photo-gallery.component';
import { ItemPhotoThumbComponent } from '../item-photo-gallery/item-photo-thumb.component';
import { PhotoGalleryHost } from '../item-photo-gallery/photo-gallery-host';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';

@Component({
  selector: 'app-dispatch',
  imports: [CommonModule, FormsModule, DataTableComponent, TableColumnDirective, PersianDatePipe, DraggableDirective, LabelDesigner, SmartDeleteModalComponent, ItemPhotoGalleryComponent, ItemPhotoThumbComponent, SvgIconDirective, ActionButtonComponent],
  templateUrl: './dispatch.html',
  styleUrl: './dispatch.css'
})
export class Dispatch implements OnInit, OnDestroy {
  @ViewChild(DataTableComponent) dataTable!: DataTableComponent;

  private loadSubscription?: Subscription;
  private exportSubscription?: Subscription;
  private wsSub?: Subscription;
  private wsDebounceSub?: Subscription;
  private swrSub?: Subscription;
  private usersSub?: Subscription;
  private settingsSub?: Subscription;
  private colsSub?: Subscription;
  private roleSubs: Subscription[] = [];
  private wsTaskUpdateSubject = new Subject<any>();
  private offlineSync = OfflineSyncService.getInstance();

  // ── Photo Gallery State ───────────────────────────────────────────────────
  readonly photoGallery = new PhotoGalleryHost(msg => this.toast.warning(msg));

  onPhotosChanged(photos: any[]): void {
    this.photoGallery.apply(photos, this.state.appState.items);
    this.cdr.markForCheck();
  }

  newTagInput = '';
  
  fieldWorkers: any[] = [];
  supervisors: any[] = [];
  managers: any[] = [];
  docWorkers: any[] = [];
  docSupervisors: any[] = [];

  selectedFieldWorker = '';
  selectedSupervisor = '';
  selectedManager = '';
  selectedDocWorker = '';
  selectedDocSupervisor = '';
  selectedDocManager = '';

  selectedItemIds: Set<string> = new Set();
  selectionMode: 'none' | 'page' | 'all' = 'none';
  availableTagsList: {label: string, value: string}[] = [];

  selectedItemsTags: string[] = [];

  // Server-side state
  items: any[] = [];
  totalItems = 0;
  currentPage = 1;
  pageSize = 100;
  isLoading = false;
  requireSupervisor = true;
  requireDocSupervisor = true; // پیش‌فرض: سرپرست اجباری
  isBlindCounting = false;

  // Quick Filter Modal
  isQuickFilterModalOpen = false;
  selectedQuickFilters: string[] = ['waiting'];

  // Export Modal State
  isExportModalOpen = false;
  exportDataScope: 'all' | 'selected' = 'all';
  exportColumnScope: 'all_db' | 'visible' | 'custom' = 'all_db';
  selectedExportColumns: Set<string> = new Set();
  isExporting = false;

  // Label Print Modal State
  isLabelModalOpen = false;
  printItemsToPass: any[] = [];

  // Delete Modal State
  isDeleteModalOpen = false;
  entityToDelete: any = null;
  deleteImpactUrl = '';
  isDeleting = false;
  deleteErrorMessage = '';

  availableExportColumns: {key: string, label: string}[] = [];

  // Categorized Column Manager & Preset Views
  isColumnManagerOpen = false;
  selectedCategoryTab: string = 'all';
  columnSearchQuery: string = '';

  get currentPreset(): string {
    const visible = this.state.appState.dispatchSettings.visibleCols || [];
    const fieldPreset = ['fa_unic_code', 'description', 'inventory', 'bal4miv', 'old_location', 'new_location', 'labelStatus', 'fieldAssignee', 'fieldStatus', 'my_tag', 'has_conflict', 'actions'];
    const financialPreset = ['fa_unic_code', 'description', 'price_amount', 'similar_unit_price', 'total_value', 'currency', 'invoice_type', 'invoice_date', 'inv_rti_number', 'docAssignee', 'docStatus', 'customs_field', 'actions'];
    const procPreset = ['fa_unic_code', 'description', 'po', 'pl', 'pk_number', 'item_no', 'unit', 'vendor', 'supplier', 'hov_no', 'hov_date', 'msr_status', 'irn_no', 'actions'];

    if (this.areArraysEqual(visible, fieldPreset)) return 'field';
    if (this.areArraysEqual(visible, financialPreset)) return 'financial';
    if (this.areArraysEqual(visible, procPreset)) return 'procurement';
    if (visible.length >= this.allCategorizedColumns.length - 2) return 'all';
    return 'custom';
  }

  private areArraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    return b.every(x => setA.has(x));
  }

  applyPresetView(preset: 'field' | 'financial' | 'procurement' | 'all') {
    if (preset === 'field') {
      this.state.appState.dispatchSettings.visibleCols = [
        'fa_unic_code', 'description', 'inventory', 'bal4miv', 'old_location', 'new_location', 'labelStatus', 'fieldAssignee', 'fieldStatus', 'my_tag', 'has_conflict', 'actions'
      ];
    } else if (preset === 'financial') {
      this.state.appState.dispatchSettings.visibleCols = [
        'fa_unic_code', 'description', 'price_amount', 'similar_unit_price', 'total_value', 'currency', 'invoice_type', 'invoice_date', 'inv_rti_number', 'docAssignee', 'docStatus', 'customs_field', 'actions'
      ];
    } else if (preset === 'procurement') {
      this.state.appState.dispatchSettings.visibleCols = [
        'fa_unic_code', 'description', 'po', 'pl', 'pk_number', 'item_no', 'unit', 'vendor', 'supplier', 'hov_no', 'hov_date', 'msr_status', 'irn_no', 'actions'
      ];
    } else if (preset === 'all') {
      this.state.appState.dispatchSettings.visibleCols = this.allCategorizedColumns.map(c => c.key);
    }
    this.savePreferences();
    this.cdr.detectChanges();
  }

  toggleColumn(key: string) {
    const cols = [...(this.state.appState.dispatchSettings.visibleCols || [])];
    const idx = cols.indexOf(key);
    if (idx > -1) {
      if (cols.length > 1) {
        cols.splice(idx, 1);
      } else {
        this.toast.show('warning', 'حداقل یک ستون باید در جدول فعال باشد.');
        return;
      }
    } else {
      cols.push(key);
    }
    this.state.appState.dispatchSettings.visibleCols = cols;
    this.savePreferences();
    this.cdr.detectChanges();
  }

  isColumnVisible(key: string): boolean {
    return (this.state.appState.dispatchSettings.visibleCols || []).includes(key);
  }

  selectAllCategoryColumns(categoryKey: string) {
    const colsToAdd = this.allCategorizedColumns
      .filter(c => categoryKey === 'all' || c.category === categoryKey)
      .map(c => c.key);
    const merged = Array.from(new Set([...(this.state.appState.dispatchSettings.visibleCols || []), ...colsToAdd]));
    this.state.appState.dispatchSettings.visibleCols = merged;
    this.savePreferences();
    this.cdr.detectChanges();
  }

  deselectAllCategoryColumns(categoryKey: string) {
    const colsToRemove = new Set(
      this.allCategorizedColumns
        .filter(c => categoryKey === 'all' || c.category === categoryKey)
        .map(c => c.key)
    );
    const filtered = (this.state.appState.dispatchSettings.visibleCols || []).filter((k: string) => !colsToRemove.has(k));
    this.state.appState.dispatchSettings.visibleCols = filtered.length > 0 ? filtered : ['fa_unic_code', 'description', 'actions'];
    this.savePreferences();
    this.cdr.detectChanges();
  }

  get allCategorizedColumns(): { key: string; label: string; category: string }[] {
    const standardMap: Record<string, { label: string; category: string }> = {
      // ۱. مشخصات و ردیابی
      fa_unic_code: { label: 'کد یکتا (FA-UNIC)', category: 'basic' },
      description: { label: 'شرح کالا', category: 'basic' },
      plpkitem: { label: 'کد ترکیبی', category: 'basic' },
      pl: { label: 'پکینگ لیست (PL)', category: 'basic' },
      po: { label: 'سفارش خرید (PO)', category: 'basic' },
      pk_number: { label: 'پکیج (PK)', category: 'basic' },
      item_no: { label: 'ردیف (Item)', category: 'basic' },
      unit: { label: 'واحد سنجش', category: 'basic' },
      scope_discipline: { label: 'دیسیپلین کاری', category: 'basic' },
      tag: { label: 'شماره تگ کالا', category: 'basic' },
      size: { label: 'سایز اصلی', category: 'basic' },
      request_number_of_table: { label: 'شماره درخواست جدول', category: 'basic' },

      // ۲. موجودی و لوکیشن
      inventory: { label: 'موجودی سیستم', category: 'inventory' },
      bal4miv: { label: 'موجودی مجاز MIV', category: 'inventory' },
      old_location: { label: 'لوکیشن فیزیکی', category: 'inventory' },
      new_location: { label: 'لوکیشن جدید', category: 'inventory' },

      // ۳. خرید و تامین
      hov_no: { label: 'شماره HOV', category: 'procurement' },
      hov_date: { label: 'تاریخ HOV', category: 'procurement' },
      msr_status: { label: 'وضعیت MSR', category: 'procurement' },
      vendor: { label: 'سازنده (Vendor)', category: 'procurement' },
      supplier: { label: 'تامین کننده', category: 'procurement' },
      irn_no: { label: 'شماره IRN', category: 'procurement' },
      item2: { label: 'ردیف فرعی (ITEM2)', category: 'procurement' },
      inventory_status: { label: 'طبقه‌بندی انبار', category: 'procurement' },
      indent: { label: 'تقاضای خرید', category: 'procurement' },
      remark: { label: 'ملاحظات', category: 'procurement' },

      // ۴. مالی و گمرک
      price_amount: { label: 'قیمت واحد', category: 'financial' },
      similar_unit_price: { label: 'قیمت کالای مشابه', category: 'financial' },
      total_value: { label: 'ارزش کل', category: 'financial' },
      currency: { label: 'ارز', category: 'financial' },
      invoice_type: { label: 'نوع فاکتور', category: 'financial' },
      invoice_date: { label: 'تاریخ فاکتور', category: 'financial' },
      inv_rti_number: { label: 'شماره RTI فاکتور', category: 'financial' },
      added_rti_no: { label: 'شماره RTI افزوده', category: 'financial' },
      page_row: { label: 'ردیف در فاکتور', category: 'financial' },
      invoice_page: { label: 'صفحه فاکتور', category: 'financial' },
      doc_supplier: { label: 'تامین‌کننده اسناد', category: 'financial' },
      folder_address: { label: 'مسیر پوشه اسناد', category: 'financial' },
      hyperlink: { label: 'هایپرلینک اسناد', category: 'financial' },
      stamp: { label: 'وضعیت مهر اسناد', category: 'financial' },
      signature: { label: 'وضعیت امضای اسناد', category: 'financial' },
      invoice_file: { label: 'آدرس فاکتور', category: 'financial' },
      customs_field: { label: 'فیلد گمرکی', category: 'financial' },
      customs_file: { label: 'آدرس گمرکی', category: 'financial' },
      customs_file_page: { label: 'صفحه گمرک', category: 'financial' },
      price_remark: { label: 'توضیحات قیمت', category: 'financial' },
      issue_remark: { label: 'ملاحظات صدور', category: 'financial' },

      // ۶. وضعیت‌ها و رهگیری
      labelStatus: { label: 'وضعیت لیبل', category: 'system' },
      fieldAssignee: { label: 'تیم شمارش', category: 'system' },
      fieldStatus: { label: 'فاز میدانی', category: 'system' },
      docAssignee: { label: 'تیم مدارک', category: 'system' },
      docStatus: { label: 'فاز اسناد', category: 'system' },
      my_tag: { label: 'تگ / محموله', category: 'system' },
      has_conflict: { label: 'مغایرت دارد', category: 'system' },
      is_fragile: { label: 'شکستنی', category: 'system' },
      is_heavy: { label: 'سنگین', category: 'system' },
      needs_qc: { label: 'نیاز به کنترل کیفی', category: 'system' },
      created_at: { label: 'تاریخ ایجاد', category: 'system' },
      updated_at: { label: 'آخرین بروزرسانی', category: 'system' },
      created_by_name: { label: 'ایجاد کننده', category: 'system' },
      modified_by_name: { label: 'ویرایش کننده', category: 'system' },
      actions: { label: 'عملیات', category: 'system' }
    };

    const result: { key: string; label: string; category: string }[] = [];
    Object.keys(standardMap).forEach(key => {
      result.push({ key, label: standardMap[key].label, category: standardMap[key].category });
    });

    this.availableExportColumns.forEach(c => {
      if (!standardMap[c.key]) {
        result.push({ key: c.key, label: c.label || c.key, category: 'dynamic' });
      }
    });

    return result;
  }

  get filteredCategoryColumns(): { key: string; label: string; category: string }[] {
    let cols = this.allCategorizedColumns;
    if (this.selectedCategoryTab !== 'all') {
      cols = cols.filter(c => c.category === this.selectedCategoryTab);
    }
    if (this.columnSearchQuery.trim()) {
      const q = this.columnSearchQuery.trim().toLowerCase();
      cols = cols.filter(c => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));
    }
    return cols;
  }

  get dynamicColumnsList(): { key: string; label: string; category: string }[] {
    return this.allCategorizedColumns.filter(c => c.category === 'dynamic');
  }

  getRowClass = (row: any) => {
    if (row.has_conflict) return 'bg-orange-100 hover:bg-orange-200 text-slate-800';
    if (row.fieldStatus === 'done') return 'bg-emerald-100 hover:bg-emerald-200 text-slate-800';
    if (row.fieldStatus === 'counting') return 'bg-blue-100 hover:bg-blue-200 text-slate-800';
    return '';
  };

  constructor(
    public state: StateService, 
    private toast: ToastService,
    private itemApi: ItemApiService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private confirmDialog: ConfirmDialogService,
    private accountsService: AccountsHttpService,
    private settingsService: SettingsService,
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    const whId = this.state.appState.activeWarehouseId;
    const whParam = whId && whId !== 'ALL' ? Number(whId) : undefined;
    this.colsSub = this.itemApi.getExportColumns(whParam).subscribe(cols => {
      this.availableExportColumns = cols;
      this.cdr.detectChanges();
    });

    // Load full user list for App State (used for ID lookups)
    this.usersSub = this.accountsService.getUsers().subscribe(users => {
      this.state.appState.users = users;
    });
    
    // Load granular role lists based on RBAC Permissions
    this.roleSubs.push(
      this.accountsService.getUsers('can_act_as_counter').subscribe(users => { this.fieldWorkers = users; this.cdr.detectChanges(); }),
      this.accountsService.getUsers('can_act_as_supervisor').subscribe(users => { this.supervisors = users; this.cdr.detectChanges(); }),
      this.accountsService.getUsers('can_act_as_manager').subscribe(users => { this.managers = users; this.cdr.detectChanges(); }),
      this.accountsService.getUsers('can_act_as_doc_worker').subscribe(users => { this.docWorkers = users; this.cdr.detectChanges(); }),
      this.accountsService.getUsers('can_act_as_doc_supervisor').subscribe(users => { this.docSupervisors = users; this.cdr.detectChanges(); })
    );
    
    // Load column preferences
    const prefs = this.auth.user()?.ui_preferences?.dispatchSettings;
    if (prefs) {
      if (prefs.visibleCols && prefs.visibleCols.length > 0) {
        this.state.appState.dispatchSettings.visibleCols = prefs.visibleCols;
      }
      if (prefs.filters) this.state.appState.dispatchSettings.filters = prefs.filters;
      if (prefs.sort) this.state.appState.dispatchSettings.sort = prefs.sort;
    }

    // ─── WebSocket: دریافت خودکار تغییرات با به‌روزرسانی نقطه‌ای In-Place ───
    this.wsService.connect();
    this.wsSub = this.wsService.notifications$.subscribe((data: any) => {
      if (!data) return;
      const typeStr = data.type_str || data.type;
      if (typeStr === 'count_task_update' || typeStr === 'doc_task_update' || typeStr === 'item_update') {
        if (data.task) {
          this.updateTaskInPlace(data.task, typeStr);
        } else if (data.task_id || data.item_id) {
          this.wsTaskUpdateSubject.next(data);
        } else {
          this.wsTaskUpdateSubject.next(data);
        }
      }
    });

    // ─── Debounce برای رویدادهای عمومی وب‌سوکت (جلوگیری از درخواست رگباری) ───
    this.wsDebounceSub = this.wsTaskUpdateSubject.pipe(
      debounceTime(600)
    ).subscribe(() => {
      this.loadItems();
    });

    // ─── SWR Live Revalidation: دریافت داده‌های جدیدتر سرور در پس‌زمینه بدون ایجاد حلقه درخواست ───
    this.swrSub = this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
      if (url && url.includes('/api/inventory/items/') && data) {
        const rawList = data.results || (Array.isArray(data) ? data : []);
        this.items = rawList.map((r: any) => ({
          ...r,
          labelStatus: r.tag_status === 'printed' ? 'چاپ شده' : (r.tag_status || 'چاپ نشده'),
          fieldStatus: r.field_status === 'counting' ? 'counting' : r.field_status === 'recount' ? 'recount' : r.field_status === 'done' ? 'done' : 'waiting',
          docStatus: r.doc_status === 'processing' ? 'processing' : (r.doc_status === 'done' || r.doc_status === 'approved') ? 'done' : 'waiting',
          fieldAssignee: r.field_assignee || 'ثبت نشده',
          docAssignee: r.doc_assignee || 'ثبت نشده'
        }));
        if (data.count !== undefined) {
          this.totalItems = data.count;
        }
        this.updateAvailableTags();
        if (this.selectedItemIds.size > 0) {
          this.updateSelectedItemsTags();
        }
        this.cdr.markForCheck();
      }
    });

    this.loadItems();

    // خواندن تنظیم تایید سرپرست برای انبار فعال
    if (whId && whId !== 'ALL') {
        this.settingsSub = this.settingsService.getWarehouseSettings(Number(whId)).subscribe({
          next: (res: any) => {
            this.requireSupervisor = res?.require_supervisor_approval?.value ?? true;
            this.requireDocSupervisor = res?.require_doc_supervisor_approval?.value ?? true;
            this.isBlindCounting = res?.blind_counting?.value === 'blind';
            
            if (this.requireSupervisor === false) {
              this.selectedSupervisor = 'skip';
            } else {
              this.selectedSupervisor = '';
            }

            if (this.requireDocSupervisor === false) {
              this.selectedDocSupervisor = 'skip';
            } else {
              this.selectedDocSupervisor = '';
            }
            this.cdr.detectChanges();
          },
          error: () => { /* پیش‌فرض: نیازمند سرپرست */ }
        });
    }
  }

  ngOnDestroy() {
    if (this.loadSubscription) this.loadSubscription.unsubscribe();
    if (this.exportSubscription) this.exportSubscription.unsubscribe();
    if (this.wsSub) this.wsSub.unsubscribe();
    if (this.wsDebounceSub) this.wsDebounceSub.unsubscribe();
    if (this.swrSub) this.swrSub.unsubscribe();
    if (this.usersSub) this.usersSub.unsubscribe();
    if (this.settingsSub) this.settingsSub.unsubscribe();
    if (this.colsSub) this.colsSub.unsubscribe();
    this.roleSubs.forEach(s => s.unsubscribe());
  }

  updateTaskInPlace(task: any, eventType: string) {
    if (!task) return;
    const itemId = task.item_id || task.item?.id || task.item || task.id;
    if (!itemId) return;

    const row = this.items.find((r: any) => r.id === itemId || String(r.id) === String(itemId));
    if (!row) {
      // ردیف در صفحه جاری نیست؛ ارسال به دیبانسر جهت هماهنگی احتمالی
      this.wsTaskUpdateSubject.next(task);
      return;
    }

    if (eventType.includes('count_task')) {
      const status = task.status;
      if (status === 'counted' || status === 'verified') {
        row.fieldStatus = 'done';
        row.field_status = 'done';
      } else if (status === 'in_progress') {
        row.fieldStatus = 'counting';
        row.field_status = 'counting';
      } else if (status === 'recount' || status === 'discrepancy') {
        row.fieldStatus = 'recount';
        row.field_status = 'recount';
        row.has_conflict = true;
      } else if (status === 'pending') {
        row.fieldStatus = 'waiting';
        row.field_status = 'waiting';
      }

      if (task.assigned_to_name || task.counter_name) {
        row.fieldAssignee = task.assigned_to_name || task.counter_name;
        row.field_assignee = row.fieldAssignee;
      }
      if (task.has_conflict !== undefined) {
        row.has_conflict = task.has_conflict;
      }
    } else if (eventType.includes('doc_task')) {
      const status = task.status;
      if (status === 'done' || status === 'verified' || status === 'completed') {
        row.docStatus = 'done';
        row.doc_status = 'done';
      } else if (status === 'in_progress' || status === 'processing') {
        row.docStatus = 'processing';
        row.doc_status = 'processing';
      } else if (status === 'pending') {
        row.docStatus = 'waiting';
        row.doc_status = 'waiting';
      }

      if (task.assigned_to_name || task.doc_worker_name) {
        row.docAssignee = task.assigned_to_name || task.doc_worker_name;
        row.doc_assignee = row.docAssignee;
      }
    } else if (eventType.includes('item_update')) {
      Object.assign(row, task);
      if (task.tag_status) {
        row.labelStatus = task.tag_status === 'printed' ? 'چاپ شده' : (task.tag_status === 'reprint' ? 'چاپ مجدد' : 'چاپ نشده');
      }
    }

    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  get tagFilterOptions() {
    const tags = new Set<string>();
    this.items.forEach(i => {
      if (i.my_tag) {
        i.my_tag.split('،').forEach((t: string) => tags.add(t.trim()));
      }
    });
    return Array.from(tags).filter(t => t).map(t => ({label: t, value: t}));
  }

  booleanFilterOptions = [
    { label: 'دارد', value: 'true' },
    { label: 'ندارد', value: 'false' }
  ];

  get fieldAssigneeFilterOptions() {
    const list = this.fieldWorkers.map(w => {
      const name = `${w.first_name} ${w.last_name}`.trim() || w.username;
      return { label: name, value: name };
    });
    list.unshift({ label: 'استخر عمومی', value: 'استخر عمومی' });
    list.unshift({ label: 'ثبت نشده', value: 'ثبت نشده' });
    return list;
  }

  get docAssigneeFilterOptions() {
    const list = this.docWorkers.map(w => {
      const name = `${w.first_name} ${w.last_name}`.trim() || w.username;
      return { label: name, value: name };
    });
    list.unshift({ label: 'استخر عمومی', value: 'استخر عمومی' });
    list.unshift({ label: 'ثبت نشده', value: 'ثبت نشده' });
    return list;
  }

  get createdByFilterOptions() {
    const users = this.state.appState.users || [];
    return users.map((u: any) => {
      const name = `${u.first_name} ${u.last_name}`.trim() || u.username;
      return { label: name, value: name };
    });
  }

  get modifiedByFilterOptions() {
    const users = this.state.appState.users || [];
    return users.map((u: any) => {
      const name = `${u.first_name} ${u.last_name}`.trim() || u.username;
      return { label: name, value: name };
    });
  }

  buildApiFilters(includePagination: boolean = true): any {
    const filters: any = {};
    if (this.state.appState.activeWarehouseId !== 'ALL') {
      filters['warehouse'] = this.state.appState.activeWarehouseId;
    }

    // Add search filters
    const stateFilters = this.state.appState.dispatchSettings.filters;
    Object.keys(stateFilters).forEach(key => {
      if (stateFilters[key]) {
        // Do not send the UI label for date filters (e.g. hov_date="امروز") if it's just for display
        if (['created_at', 'updated_at', 'hov_date'].includes(key)) {
          return;
        }
        
        // For boolean filters, if both are selected ("true,false"), ignore the filter
        if (['has_conflict', 'is_fragile', 'is_heavy', 'needs_qc'].includes(key)) {
          if (stateFilters[key].includes(',')) {
            return;
          }
        }
        
        // For checkbox filters, we need to append __in
        // We know which ones are checkboxes based on if they contain commas and match certain keys
        const inFields = ['field_status', 'doc_status', 'tag_status', 'field_assignee', 'doc_assignee', 'my_tag', 'created_by_name', 'modified_by_name'];
        if (inFields.includes(key)) {
            let val = stateFilters[key];
            if (key === 'doc_status' && val && typeof val === 'string') {
              const parts = val.split(',').map((p: string) => p.trim());
              if (parts.includes('done') && !parts.includes('approved')) {
                parts.push('approved');
                val = parts.join(',');
              }
            }
            filters[`${key}__in`] = val;
        } else {
            // For mapping UI keys to Backend keys if they differ
            if (key === 'fieldStatus') filters['field_status__in'] = stateFilters[key];
            else if (key === 'docStatus') {
              let val = stateFilters[key];
              if (val && typeof val === 'string') {
                const parts = val.split(',').map((p: string) => p.trim());
                if (parts.includes('done') && !parts.includes('approved')) {
                  parts.push('approved');
                  val = parts.join(',');
                }
              }
              filters['doc_status__in'] = val;
            }
            else if (key === 'labelStatus') filters['tag_status__in'] = stateFilters[key];
            else if (key === 'fieldAssignee') filters['field_assignee__in'] = stateFilters[key];
            else if (key === 'docAssignee') filters['doc_assignee__in'] = stateFilters[key];
            else if (key === 'my_tag_search') filters['my_tag'] = stateFilters[key];
            else if (key === 'fieldAssignee_search') filters['field_assignee'] = stateFilters[key];
            else if (key === 'docAssignee_search') filters['doc_assignee'] = stateFilters[key];
            else if (key === 'created_by_name_search') filters['created_by_name'] = stateFilters[key];
            else if (key === 'modified_by_name_search') filters['modified_by_name'] = stateFilters[key];
            else filters[key] = stateFilters[key]; 
        }
      }
    });

    if (includePagination) {
      // Add pagination
      filters['page'] = this.currentPage;
      filters['page_size'] = this.pageSize;
    }

    // Add search
    const globalSearch = this.state.appState.dispatchSettings.search;
    if (globalSearch) {
      filters['search'] = globalSearch;
    }

    // Merge Quick Filters with column filters to properly exclude "waiting" if unselected
    const columnFieldFilter = stateFilters['fieldStatus'] || stateFilters['field_status__in'] || stateFilters['field_status'];
    if (columnFieldFilter) {
      // Column filter takes precedence
      filters['field_status__in'] = columnFieldFilter;
    } else {
      let allowedQuickStatuses: string[] = [];
      if (this.selectedQuickFilters.includes('waiting')) allowedQuickStatuses.push('waiting');
      if (this.selectedQuickFilters.includes('counting')) allowedQuickStatuses.push('counting', 'recount');
      if (this.selectedQuickFilters.includes('counted')) allowedQuickStatuses.push('done');
      
      if (allowedQuickStatuses.length === 0) {
        filters['field_status__in'] = '__NONE__';
      } else {
        filters['field_status__in'] = allowedQuickStatuses.join(',');
      }
    }

    // Add sorting
    const sort = this.state.appState.dispatchSettings.sort;
    if (sort.key) {
      const orderingMap: Record<string, string> = {
        fieldStatus: 'field_status',
        docStatus: 'doc_status',
        labelStatus: 'tag_status',
        fieldAssignee: 'field_assignee',
        docAssignee: 'doc_assignee',
        created_by_name: 'created_by__username',
        modified_by_name: 'modified_by__username',
      };
      const sortKey = orderingMap[sort.key] || sort.key;
      filters['ordering'] = sort.dir === 'desc' ? `-${sortKey}` : sortKey;
    }

    return filters;
  }

  loadItems() {
    this.isLoading = true;
    const filters = this.buildApiFilters(true);

    if (this.loadSubscription) {
      this.loadSubscription.unsubscribe();
    }

    this.loadSubscription = this.itemApi.getAll(filters).subscribe({
      next: (res) => {
        this.items = res.results.map(r => ({
          ...r,
          labelStatus: r.tag_status === 'printed' ? 'چاپ شده' : (r.tag_status || 'چاپ نشده'),
          fieldStatus: r.field_status === 'counting' ? 'counting' : r.field_status === 'recount' ? 'recount' : r.field_status === 'done' ? 'done' : 'waiting',
          docStatus: r.doc_status === 'processing' ? 'processing' : (r.doc_status === 'done' || r.doc_status === 'approved') ? 'done' : 'waiting',
          fieldAssignee: r.field_assignee || 'ثبت نشده',
          docAssignee: r.doc_assignee || 'ثبت نشده'
        }));
        this.totalItems = res.count;
        
        setTimeout(() => {
          this.isLoading = false;
          this.updateAvailableTags();
          if (this.selectedItemIds.size > 0) {
            this.updateSelectedItemsTags();
          }
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.toast.show('error', 'خطا در دریافت اطلاعات');
        setTimeout(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      }
    });
  }

  get activeWhName() {
    if (this.state.appState.activeWarehouseId === 'ALL') return 'تجمیعی کل سایت‌ها (همه انبارها)';
    const wh = this.state.appState.projects.find((p: any) => p.id === this.state.appState.activeWarehouseId);
    return wh ? wh.name : 'نامشخص';
  }
  get hasActiveFilters(): boolean {
    const filters = this.state.appState.dispatchSettings?.filters;
    if (!filters) return false;
    return Object.values(filters).some((v) => {
      return typeof v === 'string' ? v.trim().length > 0 : !!v;
    });
  }

  getDisplayValue(record: any, key: string) {
    if(key === 'labelStatus') return record.labelStatus === 'printed' ? 'چاپ شده' : record.labelStatus === 'reprint' ? 'چاپ مجدد' : (record.labelStatus || 'چاپ نشده');
    if(key === 'fieldStatus') return record.fieldStatus === 'counting' ? 'در کارتابل' : record.fieldStatus === 'recount' ? 'مغایرت' : record.fieldStatus === 'done' ? 'تایید میدانی' : 'در انتظار';
    if(key === 'docStatus') return record.docStatus === 'processing' ? 'در دست بررسی' : record.docStatus === 'done' ? 'تکمیل اسناد' : 'در انتظار';
    return record[key] ? String(record[key]) : '';
  }

  handleTableSort(sortData: any) {
    this.state.appState.dispatchSettings.sort.key = sortData.key;
    this.state.appState.dispatchSettings.sort.dir = sortData.direction;
    this.loadItems();
    this.savePreferences();
  }

  onSearchChanged(term: string) {
    this.state.appState.dispatchSettings.search = term;
    this.currentPage = 1;
    this.loadItems();
  }

  handleTableFilter(filters: any) {
    this.state.appState.dispatchSettings.filters = filters;
    this.currentPage = 1;
    this.loadItems();
    this.savePreferences();
  }

  handleTablePageChange(event: any) {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.loadItems();
  }

  handleVisibleColumnsChanged(visibleCols: string[]) {
    this.state.appState.dispatchSettings.visibleCols = visibleCols;
    this.savePreferences();
  }

  savePreferences() {
    this.auth.updatePreferences({ dispatchSettings: this.state.appState.dispatchSettings }).subscribe();
  }

  get hasAnyFilter(): boolean {
    const settings = this.state.appState.dispatchSettings;
    const hasSearch = !!settings.search && settings.search.trim() !== '';
    const hasSort = !!settings.sort.key;
    const hasFilters = Object.keys(settings.filters).length > 0;
    return hasSearch || hasSort || hasFilters;
  }

  clearAllFilters() {
    this.state.appState.dispatchSettings.search = '';
    this.state.appState.dispatchSettings.filters = {};
    this.state.appState.dispatchSettings.sort = { key: null, dir: 'asc' };
    this.selectedQuickFilters = ['waiting'];
    if (this.dataTable) {
      this.dataTable.clearAllFilters(false);
    }
    this.currentPage = 1;
    this.loadItems();
    this.savePreferences();
  }

  toggleQuickFilter(filter: string) {
    const index = this.selectedQuickFilters.indexOf(filter);
    if (index === -1) {
      this.selectedQuickFilters.push(filter);
    } else {
      this.selectedQuickFilters.splice(index, 1);
    }
    this.loadItems();
  }

  onSelectionChange(selectedIds: Set<string>) {
    this.selectedItemIds = new Set(selectedIds);
    if (this.selectedItemIds.size === 0) {
      this.selectionMode = 'none';
    } else if (this.selectionMode === 'none') {
      this.selectionMode = 'page';
    }
    this.updateSelectedItemsTags();
    this.cdr.detectChanges();
  }

  onSelectionModeChange(mode: 'none' | 'page' | 'all') {
    this.selectionMode = mode;
    if (mode === 'none') {
      this.selectedItemIds.clear();
      this.selectedItemsTags = [];
    }
    this.cdr.detectChanges();
  }

  onBulkUpdate(changedRows: any[]) {
    if (!changedRows || changedRows.length === 0) return;

    this.isLoading = true;
    this.itemApi.bulkUpdate(changedRows).subscribe({
      next: (res) => {
        this.toast.show('success', 'تغییرات با موفقیت ذخیره شد');
        this.loadItems();
      },
      error: () => {
        this.toast.show('error', 'خطا در ذخیره تغییرات');
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  get selectedItems() {
    // Only return items from current page that are selected. For cross-page bulk actions, 
    // we would use `this.selectedItemIds` directly against the backend.
    return this.items.filter((r: any) => this.selectedItemIds.has(r.id));
  }

  executeBatchLabelPrint() {
    const selected = this.selectedItems;
    if (selected.length === 0 && this.selectionMode === 'none') {
      this.toast.show('warning', 'ابتدا رکوردهایی که قصد چاپ لیبل آن‌ها را دارید انتخاب کنید.');
      return;
    }
    this.printItemsToPass = [...selected];
    this.isLabelModalOpen = true;
  }

  closeLabelModal() {
    this.isLabelModalOpen = false;
  }

  onLabelPrintComplete() {
    // Update label status for selected items locally
    this.selectedItems.forEach((r: any) => { r.labelStatus = 'چاپ شده'; r.tag_status = 'چاپ شده'; });
    this.isLabelModalOpen = false;
    this.selectedItemIds = new Set(this.selectedItemIds);
    this.cdr.detectChanges();
  }

  get labelPrintItemIds(): (string | number)[] {
    return Array.from(this.selectedItemIds);
  }

  get activeWarehouseIdNumber(): number | null {
    const id = this.state.appState.activeWarehouseId;
    if (id && id !== 'ALL') return Number(id);
    return null;
  }

  async executeFieldDispatch() {
    const isAll = this.selectionMode === 'all';
    const totalCount = isAll ? this.totalItems : this.selectedItemIds.size;
    if (totalCount === 0) return this.toast.show('warning', 'رکوردی انتخاب نشده است.');

    const worker = this.selectedFieldWorker ? this.state.appState.users.find((u: any) => u.id === Number(this.selectedFieldWorker)) : null;
    const workerName = worker ? `${worker.first_name} ${worker.last_name}`.trim() || worker.username : (this.selectedFieldWorker ? this.selectedFieldWorker : 'همه انبارگردان‌ها (مخزن مشترک)');
    
    let supName = 'همه سرپرست‌ها (مخزن مشترک)';
    if (this.selectedSupervisor) {
      if (this.selectedSupervisor === 'skip') {
        supName = 'بدون نیاز به سرپرست';
      } else {
        const sup = this.state.appState.users.find((u: any) => u.id === Number(this.selectedSupervisor));
        supName = sup ? `${sup.first_name} ${sup.last_name}`.trim() || sup.username : this.selectedSupervisor;
      }
    }

    let managerName = 'همه مدیران (مخزن مشترک)';
    if (this.selectedManager) {
      const mgr = this.state.appState.users.find((u: any) => u.id === Number(this.selectedManager));
      managerName = mgr ? `${mgr.first_name} ${mgr.last_name}`.trim() || mgr.username : this.selectedManager;
    }

    const countDesc = isAll 
      ? `تمامی <span class="font-black text-emerald-700 underline">${this.totalItems.toLocaleString()}</span> کالای فیلترشده (کل دیتابیس)` 
      : `<span class="font-black text-indigo-700">${this.selectedItemIds.size.toLocaleString()}</span> کالا`;

    const confirmed = await this.confirmDialog.open({
      title: 'ارجاع شمارش کالا',
      message: `آیا از ارجاع ${countDesc} به انبارگردان <span class="font-black text-blue-600">«${workerName}»</span>، سرپرست <span class="font-black text-emerald-600">«${supName}»</span> و مدیر <span class="font-black text-purple-600">«${managerName}»</span> اطمینان دارید؟`,
      confirmText: 'بله، ارجاع بده',
      cancelText: 'انصراف',
      type: 'info'
    });

    if (!confirmed) return;

    const payload: any = {
      item_ids: Array.from(this.selectedItemIds),
      field_assignee: this.selectedFieldWorker || null,
      field_status: 'counting',
      supervisor_assignee: this.selectedSupervisor || null,
      manager_assignee: this.selectedManager || null,
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    const sendRequest = (force = false) => {
      const finalPayload = { ...payload, force };
      this.itemApi.bulkDispatch(finalPayload).subscribe({
        next: async (res) => {
          if (res.warning) {
            const forceConfirm = await this.confirmDialog.open({
              title: 'هشدار ارجاع مجدد',
              message: res.message,
              confirmText: 'بله، مجدداً ارجاع بده',
              cancelText: 'انصراف',
              type: 'warning'
            });
            if (forceConfirm) {
              sendRequest(true);
            }
          } else {
            this.toast.show('success', res.success || 'رکوردها با موفقیت به کارتابل انبارگردان ارسال شدند.');
            this.selectedItemIds.clear();
            this.selectionMode = 'none';
            this.loadItems();
          }
        },
        error: (err) => {
          const errorMsg = err?.error?.error || 'خطا در ارجاع میدانی';
          this.toast.show('error', errorMsg);
        }
      });
    };

    sendRequest();
  }

  async executeDocDispatch() {
    const isAll = this.selectionMode === 'all';
    const totalCount = isAll ? this.totalItems : this.selectedItemIds.size;
    if (totalCount === 0) return this.toast.show('warning', 'رکوردی انتخاب نشده است.');

    const worker = this.selectedDocWorker ? this.state.appState.users.find((u: any) => u.id === Number(this.selectedDocWorker)) : null;
    const workerName = worker ? `${worker.first_name} ${worker.last_name}`.trim() || worker.username : (this.selectedDocWorker ? this.selectedDocWorker : 'همه کارشناسان اسناد (مخزن مشترک)');
    
    let supName = 'همه سرپرست‌های اسناد (مخزن مشترک)';
    if (this.selectedDocSupervisor) {
      if (this.selectedDocSupervisor === 'skip') {
        supName = 'بدون نیاز به سرپرست';
      } else {
        const sup = this.state.appState.users.find((u: any) => u.id === Number(this.selectedDocSupervisor));
        supName = sup ? `${sup.first_name} ${sup.last_name}`.trim() || sup.username : this.selectedDocSupervisor;
      }
    }

    let managerName = 'همه مدیران (مخزن مشترک)';
    if (this.selectedDocManager) {
      const mgr = this.state.appState.users.find((u: any) => u.id === Number(this.selectedDocManager));
      managerName = mgr ? `${mgr.first_name} ${mgr.last_name}`.trim() || mgr.username : this.selectedDocManager;
    }

    const countDesc = isAll 
      ? `تمامی <span class="font-black text-emerald-700 underline">${this.totalItems.toLocaleString()}</span> کالای فیلترشده (کل دیتابیس)` 
      : `<span class="font-black text-indigo-700">${this.selectedItemIds.size.toLocaleString()}</span> کالا`;

    const confirmed = await this.confirmDialog.open({
      title: 'ارجاع بررسی اسناد',
      message: `آیا از ارجاع ${countDesc} به بررسی‌کننده اسناد <span class="font-black text-blue-600">«${workerName}»</span>، سرپرست <span class="font-black text-emerald-600">«${supName}»</span> و مدیر <span class="font-black text-purple-600">«${managerName}»</span> اطمینان دارید؟`,
      confirmText: 'بله، ارجاع بده',
      cancelText: 'انصراف',
      type: 'info'
    });

    if (!confirmed) return;

    const payload: any = {
      item_ids: Array.from(this.selectedItemIds),
      doc_assignee: this.selectedDocWorker || null,
      doc_status: 'processing',
      doc_supervisor_assignee: this.selectedDocSupervisor || null,
      doc_manager_assignee: this.selectedDocManager || null,
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    const sendRequest = (force = false) => {
      const finalPayload = { ...payload, force };
      this.itemApi.bulkDispatch(finalPayload).subscribe({
        next: async (res) => {
          if (res.warning) {
            const forceConfirm = await this.confirmDialog.open({
              title: 'هشدار ارجاع مجدد',
              message: res.message,
              confirmText: 'بله، مجدداً ارجاع بده',
              cancelText: 'انصراف',
              type: 'warning'
            });
            if (forceConfirm) {
              sendRequest(true);
            }
          } else {
            this.toast.show('success', res.success || `فایل ${res.updated} رکورد جهت بررسی اسناد و قیمت ارسال شد.`);
            this.selectedItemIds.clear();
            this.selectionMode = 'none';
            this.loadItems();
          }
        },
        error: (err) => {
          const errorMsg = err?.error?.error || 'خطا در ارجاع اسناد';
          this.toast.show('error', errorMsg);
        }
      });
    };

    sendRequest();
  }

  async requestRecount() {
    const isAll = this.selectionMode === 'all';
    const totalCount = isAll ? this.totalItems : this.selectedItemIds.size;
    if (totalCount === 0) return this.toast.show('warning', 'رکوردی انتخاب نشده است.');

    if (!isAll) {
      const invalidItems = this.items.filter(item => 
        this.selectedItemIds.has(item.id) && 
        (item.field_status === 'waiting' || item.field_status === 'counting')
      );

      if (invalidItems.length > 0) {
        return this.toast.show('error', 'برخی از رکوردهای انتخاب شده هنوز شمرده نشده‌اند و قابل بازشماری نیستند.');
      }
    }

    const countDesc = isAll 
      ? `تمامی <span class="font-black text-emerald-700 underline">${this.totalItems.toLocaleString()}</span> کالای فیلترشده (کل دیتابیس)` 
      : `<span class="font-black text-rose-700">${this.selectedItemIds.size.toLocaleString()}</span> کالا`;

    const confirmed = await this.confirmDialog.open({
      title: 'درخواست بازشماری (ثبت مغایرت)',
      message: `آیا از ثبت مغایرت و ارجاع ${countDesc} به فرآیند بازشماری اطمینان دارید؟`,
      confirmText: 'بله، ثبت بازشماری',
      cancelText: 'انصراف',
      type: 'warning'
    });

    if (!confirmed) return;

    const payload: any = {
      item_ids: Array.from(this.selectedItemIds),
      field_status: 'recount',
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    this.itemApi.bulkDispatch(payload).subscribe({
      next: (res) => {
        this.toast.show('warning', `وضعیت ${res.updated} رکورد به "مغایرت - بازشماری کور" تغییر یافت.`);
        this.selectedItemIds.clear();
        this.selectionMode = 'none';
        this.loadItems();
      },
      error: () => {}
    });
  }

  // ────────── Delete Methods ──────────
  openDeleteModal(id: number) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    this.entityToDelete = item;
    this.deleteImpactUrl = `/api/inventory/items/${id}/delete_impact/`;
    this.isDeleteModalOpen = true;
    this.isDeleting = false;
    this.deleteErrorMessage = '';
    this.cdr.detectChanges();
  }

  handleHardDelete() {
    if (!this.entityToDelete) return;
    this.isDeleting = true;
    this.deleteErrorMessage = '';
    this.itemApi.delete(this.entityToDelete.id).subscribe({
      next: () => {
        this.toast.show('success', 'کالا با موفقیت حذف شد.');
        this.isDeleteModalOpen = false;
        this.entityToDelete = null;
        this.isDeleting = false;
        this.loadItems();
      },
      error: (err: any) => {
        this.deleteErrorMessage = err.error?.error || err.error?.detail || 'خطا در حذف کالا';
        this.isDeleting = false;
        this.cdr.detectChanges();
      }
    });
  }

  updateAvailableTags() {
    const tagsSet = new Set<string>();
    this.items.forEach((r: any) => {
      if (r.my_tag) {
        r.my_tag.split(/[،,]/).forEach((t: string) => {
          const trimmed = t.trim();
          if (trimmed) tagsSet.add(trimmed);
        });
      }
    });
    this.availableTagsList = Array.from(tagsSet).filter((t: string) => t).map((t: string) => ({label: t, value: t}));
  }

  applyBatchTags() {
    const val = this.newTagInput.trim();
    if (!val) return this.toast.show('warning', 'لطفاً نام تگ را وارد کنید.');
    const isAll = this.selectionMode === 'all';
    if (this.selectedItemIds.size === 0 && !isAll) return this.toast.show('warning', 'رکوردی انتخاب نشده است.');

    const payload: any = {
      action: 'add',
      tag: val,
      item_ids: Array.from(this.selectedItemIds),
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    this.itemApi.bulkTag(payload).subscribe({
      next: (res) => {
        this.newTagInput = '';
        this.toast.show('success', `تگ "${val}" با موفقیت به ${res.updated || (isAll ? this.totalItems : this.selectedItemIds.size)} رکورد افزوده شد.`);
        if (!this.selectedItemsTags.includes(val)) {
          this.selectedItemsTags.push(val);
        }
        this.loadItems();
      },
      error: () => {}
    });
  }

  updateSelectedItemsTags() {
    const tagsSet = new Set<string>();
    Array.from(this.selectedItemIds).forEach(id => {
      const r = this.items.find(i => i.id === id || String(i.id) === String(id));
      if (r?.my_tag) {
        r.my_tag.split(/[،,]/).forEach((t: string) => {
          const trimmed = t.trim();
          if (trimmed) tagsSet.add(trimmed);
        });
      }
    });
    this.selectedItemsTags = Array.from(tagsSet).filter((t: string) => t);
  }

  removeTagFromSelected(tagToRemove: string) {
    const isAll = this.selectionMode === 'all';
    if (this.selectedItemIds.size === 0 && !isAll) return;
    
    const payload: any = {
      action: 'remove',
      tag: tagToRemove,
      item_ids: Array.from(this.selectedItemIds),
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    this.itemApi.bulkTag(payload).subscribe({
      next: (res) => {
        this.toast.show('success', `تگ "${tagToRemove}" از رکوردهای انتخابی حذف شد.`);
        this.selectedItemsTags = this.selectedItemsTags.filter((t: string) => t !== tagToRemove);
        this.loadItems();
      },
      error: () => {}
    });
  }

  clearBatchTags() {
    const isAll = this.selectionMode === 'all';
    if (this.selectedItemIds.size === 0 && !isAll) return this.toast.show('warning', 'رکوردی انتخاب نشده است.');

    const payload: any = {
      action: 'clear',
      item_ids: Array.from(this.selectedItemIds),
      select_all: isAll,
      filters: isAll ? this.buildApiFilters(false) : undefined
    };

    this.itemApi.bulkTag(payload).subscribe({
      next: (res) => {
        this.toast.show('success', `تمامی تگ‌های ${res.updated || (isAll ? this.totalItems : this.selectedItemIds.size)} رکورد انتخابی پاک شد.`);
        this.selectedItemsTags = [];
        this.loadItems();
      },
      error: () => {}
    });
  }

  getSplitTags(tagStr: string) {
    return tagStr ? tagStr.split(/[،,]/).map((t: string) => t.trim()).filter((t: string) => t) : [];
  }

  filterByTag(tag: string, event: MouseEvent) {
    event.stopPropagation();
    
    // Checkbox text filter uses the column key for the checkbox selections (comma separated)
    const currentStr = this.state.appState.dispatchSettings.filters['my_tag'] || '';
    const currentTags = currentStr.split(/[،,]/).map((t: string) => t.trim()).filter((t: string) => t);
    let newTags: string[] = [];

    if (event.shiftKey) {
      if (currentTags.includes(tag)) {
        newTags = currentTags.filter((t: string) => t !== tag);
      } else {
        newTags = [...currentTags, tag];
      }
    } else {
      if (currentTags.length === 1 && currentTags[0] === tag) {
        newTags = [];
      } else {
        newTags = [tag];
      }
    }

    const newValue = newTags.join(',');

    this.state.appState.dispatchSettings.filters = {
      ...this.state.appState.dispatchSettings.filters,
      my_tag: newValue,
      my_tag_search: ''
    };
    
    if (this.dataTable) {
      this.dataTable.filters = { ...this.state.appState.dispatchSettings.filters };
    }
    
    this.currentPage = 1;
    this.loadItems();
    this.savePreferences();
  }

  // ────────── Export Methods ──────────
  openExportModal() {
    this.isExportModalOpen = true;
    this.exportDataScope = this.selectedItemIds.size > 0 ? 'selected' : 'all';
    this.exportColumnScope = 'all_db';
    this.selectedExportColumns.clear();
  }

  closeExportModal() {
    this.isExporting = false;
    this.isExportModalOpen = false;
    
    if (this.exportSubscription) {
      try {
        this.exportSubscription.unsubscribe();
      } catch (e) {
        console.error('Error unsubscribing', e);
      }
      this.exportSubscription = undefined;
    }
    
    try {
      this.cdr.detectChanges();
    } catch(e) {}
  }

  onDataScopeChange(scope: string) {
    if (scope === 'all') {
      this.exportColumnScope = 'all_db';
    } else if (scope === 'selected') {
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
    };
    
    if (this.exportDataScope === 'selected') {
      payload.selected_ids = Array.from(this.selectedItemIds);
    }
    
    if (this.exportColumnScope === 'visible') {
      payload.columns_list = this.state.appState.dispatchSettings.visibleCols || [];
    } else    if (this.exportColumnScope === 'custom') {
      payload.columns_list = Array.from(this.selectedExportColumns);
    }
    
    const filters = this.buildApiFilters(false);
    
    this.exportSubscription = this.itemApi.exportExcel({ ...payload, ...filters }).subscribe({
      next: (blob) => {
        try {
          const isZip = blob.type === 'application/zip' || blob.type.includes('zip');
          const ext = isZip ? 'zip' : 'xlsx';
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_items_${new Date().getTime()}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          
          const successMsg = isZip ? 'فایل فشرده حاوی بخش‌های اکسل با موفقیت دانلود شد.' : 'فایل اکسل با موفقیت دانلود شد.';
          this.toast.show('success', successMsg);
        } catch(e) {
          console.error('File download error', e);
        }
        
        this.isExporting = false;
        this.closeExportModal();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Export error:', err);
        this.toast.show('error', 'خطا در دریافت فایل خروجی');
        this.isExporting = false;
        this.cdr.detectChanges();
      }
    });
  }


  async confirmLeave(): Promise<boolean> {
    if (this.dataTable && this.dataTable.pendingChanges && this.dataTable.pendingChanges.size > 0) {
      const result = await this.confirmDialog.open({
        title: 'خروج از صفحه',
        message: 'شما تغییرات ذخیره‌نشده‌ای در جدول دارید. مایل به انجام چه کاری هستید؟',
        confirmText: 'خروج (حذف تغییرات)',
        cancelText: 'ماندن در صفحه',
        extraText: 'ذخیره و خروج',
        type: 'warning'
      });

      if (result === true) {
        return true;
      } else if (result === 'extra') {
        const changes = Array.from(this.dataTable.pendingChanges);
        this.isLoading = true;
        this.cdr.detectChanges();
        try {
          await firstValueFrom(this.itemApi.bulkUpdate(changes));
          this.toast.show('success', 'تغییرات با موفقیت ذخیره شد');
          return true;
        } catch (e) {
          this.toast.show('error', 'خطا در ذخیره تغییرات');
          this.isLoading = false;
          this.cdr.detectChanges();
          return false;
        }
      } else {
        return false;
      }
    }
    return true;
  }


}

