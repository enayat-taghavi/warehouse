import { AuditFacade } from './audit.facade';
import {
  DiffItem,
  WordDiffToken,
  AUDIT_FIELD_LABELS_MAP,
  formatBytes
} from './audit.helpers';
import { Component, OnInit, OnDestroy, HostListener, computed, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppPersonaService } from '../../../../core/services/app-persona.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { AuditApiService } from '../../../../core/api/audit-api.service';
import { AuthStore } from '../../../../core/stores/auth.store';
import { AuthService } from '../../../../core/auth/auth.service';
import { StateService } from '../../../../core/services/state.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { OfflineSyncService } from '../../../../core/services/offline-sync.service';
import { NetworkStatusService } from '../../../../core/services/network-status.service';
import { WarehouseSelectorComponent } from '../../../../shared/components/warehouse-selector/warehouse-selector.component';
import { BarcodeScannerComponent } from '../../../../shared/components/barcode-scanner/barcode-scanner.component';
import { PersianDatePipe } from '../../../../shared/pipes/persian-date.pipe';
import { parseSmartDate, formatToStandardShamsi } from '../../../../core/utils/date-utils';
import { BRANDING } from '../../../../core/branding';
import {
  AuditLog,
  UserLoginLog,
  AuditStats,
  LoginStats,
  AuditFilters,
  LoginFilters,
  RevertPreviewResponse,
  RevertResult,
  RevertChangeItem,
  PurgeRequest,
  PurgePreviewResponse,
  PointInTimeRollbackPreview,
  PointInTimeRollbackRecordItem,
  PointInTimeRollbackRequest,
  PointInTimeRollbackResult,
  ExportColumnOption,
  LockedUserItem
} from '../../../../core/models/audit-log.model';

import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { formatDeviceModelName } from '../../../../core/utils/device-detector';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';
import { ActionButtonComponent } from '../../../../shared/components/action-button/action-button.component';



@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WarehouseSelectorComponent, PersianDatePipe, NgPersianDatepickerModule, BarcodeScannerComponent, SvgIconDirective, ActionButtonComponent],
  providers: [AuditFacade],
  templateUrl: './audit.html',
  styleUrl: './audit.css'
})
export class Audit implements OnInit, OnDestroy {
  private personaService = inject(AppPersonaService);
  private facade = inject(AuditFacade);

  get isFinanceScope(): boolean {
    if (!this.isWarehouseInstalled) return true;
    return this.selectedAppScope === 'finance' ||
           this.route.snapshot.data['appScope'] === 'finance' ||
           this.router.url.includes('/app/finance');
  }

  /** قلمرو را خود مسیر روی مالی قفل کرده است (نه انتخاب کاربر در انتخابگر قلمرو) */
  get isFinanceRouteLocked(): boolean {
    return this.route.snapshot.data['appScope'] === 'finance' || this.router.url.includes('/app/finance');
  }

  get isWarehouseScope(): boolean {
    if (!this.isAccountingInstalled) return true;
    return this.selectedAppScope === 'warehouse' ||
           this.route.snapshot.data['appScope'] === 'warehouse' ||
           this.router.url.includes('/app/warehouse');
  }

  get isWarehouseInstalled(): boolean {
    return this.personaService.moduleRegistry.getExtensions('audit').some(e => e.extension.appScopes?.includes('warehouse'));
  }

  get isAccountingInstalled(): boolean {
    return this.personaService.moduleRegistry.getExtensions('audit').some(e => e.extension.appScopes?.includes('finance'));
  }

  public readonly BRANDING = BRANDING;

  activeTab: 'audit' | 'security' | 'login' = 'audit';
  selectedAppScope: 'all' | 'warehouse' | 'finance' = 'all';
  selectedEvent: string = '';
  isLoading = false;
  hasError = false;

  // وضعیت اتصال زنده و آفلاین
  isWsConnected = false;
  isOnline = true;

  // رهگیری شناسه‌های رکوردهای تازه دریافت‌شده جهت انیمیشن Flash
  updatedLogIds = new Set<number>();
  updatedLoginIds = new Set<number>();
  private flashTimeouts: any[] = [];

  canExportAudit = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_sys_audit_export') ||
    this.auth.user()?.permissions?.includes('perm_sys_purge_logs') ||
    this.auth.user()?.permissions?.includes('perm_sys_logs') ||
    this.auth.user()?.roles?.includes('admin') ||
    this.auth.user()?.department === 'admin'
  ));

  canPurgeLogs = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_sys_purge_logs')
  ));

  canRollbackBulk = computed(() => !!(
    this.auth.user()?.is_superuser ||
    this.auth.user()?.permissions?.includes('perm_rollback_bulk') ||
    this.auth.user()?.permissions?.includes('perm_rollback_data') ||
    this.auth.user()?.roles?.includes('admin') ||
    this.auth.user()?.department === 'admin'
  ));

  // Data lists
  auditLogs: AuditLog[] = [];
  loginLogs: UserLoginLog[] = [];

  // Statistics
  auditStats: AuditStats = {
    total_all_time: 0,
    audits_24h: 0,
    critical_count: 0,
    warning_count: 0,
    module_breakdown: {},
    storage: {
      db_total_bytes: 0,
      db_total_formatted: '—',
      audit_bytes: 0,
      audit_formatted: '—',
      audit_percent: 0,
      login_bytes: 0,
      login_formatted: '—',
      login_percent: 0,
      total_logs_bytes: 0,
      total_logs_formatted: '—',
      total_logs_percent: 0,
      avg_row_size_kb: 2.5
    }
  };

  loginStats: LoginStats = {
    total_all_time: 0,
    logins_24h: 0,
    success_24h: 0,
    failed_24h: 0,
    status_breakdown: {},
    storage: {
      db_total_bytes: 0,
      db_total_formatted: '—',
      audit_bytes: 0,
      audit_formatted: '—',
      audit_percent: 0,
      login_bytes: 0,
      login_formatted: '—',
      login_percent: 0,
      total_logs_bytes: 0,
      total_logs_formatted: '—',
      total_logs_percent: 0,
      avg_row_size_kb: 1.5
    }
  };

  // Pagination
  auditPage = 1;
  auditPageSize = 20;
  auditTotalCount = 0;

  loginPage = 1;
  loginPageSize = 20;
  loginTotalCount = 0;

  // Filters
  searchTerm = '';
  selectedModule = '';
  selectedSeverity = '';
  selectedAction = '';
  selectedLoginStatus = '';
  fromDate = '';
  toDate = '';
  fromDateControl = new FormControl<string>('');
  toDateControl = new FormControl<string>('');

  // Debounced search
  private searchSubject = new Subject<string>();
  private subs = new Subscription();

  // Diff Modal
  isDiffModalOpen = false;
  isLoadingDiff = false;
  selectedLog: AuditLog | null = null;
  diffItems: DiffItem[] = [];
  modalRawBefore = '';
  modalRawAfter = '';
  modalSearchKey = '';

  // Revert / Rollback Modal
  isRevertModalOpen = false;
  isReverting = false;
  isLoadingRevertPreview = false;
  revertPreview: RevertPreviewResponse | null = null;
  revertLogTarget: AuditLog | null = null;
  revertReason = '';

  // Purge Modal State
  isPurgeModalOpen = false;
  isPurging = false;
  isLoadingPurgePreview = false;
  purgeFromDate = '';
  purgeToDate = '';
  purgeFromDateControl = new FormControl<string>('');
  purgeToDateControl = new FormControl<string>('');
  purgeWarehouse: number | string = '';
  purgeModule = '';
  purgeDays = '';
  purgeConfirmText = '';
  purgePreviewCount: number | null = null;

  // Point-in-Time Rollback Modal State
  isPointInTimeModalOpen = false;
  isLoadingPitPreview = false;
  isExecutingPit = false;
  pitTargetDate = '';
  pitTargetTime = '00:00';
  pitTargetDateControl = new FormControl<string>('');
  pitWarehouse: number | string = '';
  pitModule = '';
  pitReason = '';
  pitPreview: PointInTimeRollbackPreview | null = null;

  // Login Details Modal State
  selectedLoginForDetails: UserLoginLog | null = null;
  isLoginDetailsModalOpen = false;

  // Export Modal State
  isExportModalOpen = false;
  isExporting = false;
  exportFormat: 'xlsx' | 'csv' = 'xlsx';
  exportColumnsScope: 'all' | 'custom' = 'all';

  // Custom columns for Audit Tab
  availableAuditColumns: ExportColumnOption[] = [
    { key: 'index', label: 'ردیف', defaultChecked: true },
    { key: 'id', label: 'شناسه لاگ', defaultChecked: true },
    { key: 'user', label: 'کاربر اقدام‌کننده', defaultChecked: true },
    { key: 'actor_username', label: 'نام کاربری', defaultChecked: true },
    { key: 'warehouse', label: 'انبار', defaultChecked: true },
    { key: 'module', label: 'ماژول سیستم', defaultChecked: true },
    { key: 'action', label: 'نوع عملیات', defaultChecked: true },
    { key: 'severity', label: 'سطح اهمیت', defaultChecked: true },
    { key: 'target_repr', label: 'شرح رکورد هدف', defaultChecked: true },
    { key: 'target_object_id', label: 'شناسه رکورد', defaultChecked: true },
    { key: 'ip_address', label: 'آدرس آی‌پی', defaultChecked: true },
    { key: 'changes_summary', label: 'خلاصه تغییرات (Diff)', defaultChecked: true },
    { key: 'created_at', label: 'تاریخ و زمان رویداد', defaultChecked: true },
  ];
  selectedAuditColumns = new Set<string>([
    'index', 'id', 'user', 'warehouse', 'module', 'action', 'severity', 'target_repr', 'ip_address', 'changes_summary', 'created_at'
  ]);

  // Custom columns for Login Tab
  availableLoginColumns: ExportColumnOption[] = [
    { key: 'index', label: 'ردیف', defaultChecked: true },
    { key: 'id', label: 'شناسه لاگ', defaultChecked: true },
    { key: 'username_attempted', label: 'نام کاربری ورودی', defaultChecked: true },
    { key: 'user_name', label: 'نام پرسنل', defaultChecked: true },
    { key: 'status', label: 'وضعیت ورود', defaultChecked: true },
    { key: 'ip_address', label: 'آدرس آی‌پی', defaultChecked: true },
    { key: 'device_model', label: 'مدل دستگاه', defaultChecked: true },
    { key: 'user_agent', label: 'مشخصات مرورگر', defaultChecked: true },
    { key: 'failure_reason', label: 'علت شکست', defaultChecked: true },
    { key: 'created_at', label: 'تاریخ و زمان', defaultChecked: true },
  ];
  selectedLoginColumns = new Set<string>([
    'index', 'id', 'username_attempted', 'user_name', 'status', 'ip_address', 'device_model', 'failure_reason', 'created_at'
  ]);

  // Export filters
  exportSearch = '';
  exportModule = '';
  exportSeverity = '';
  exportAction = '';
  exportLoginStatus = '';
  exportWarehouse: number | string = '';
  exportFromDate = '';
  exportToDate = '';
  exportFromDateControl = new FormControl<string>('');
  exportToDateControl = new FormControl<string>('');

  // Locked users & Lockout Reset State
  lockedUsersList: LockedUserItem[] = [];
  isLoadingLockedUsers = false;
  showUnlockConfirmModal = false;
  targetUserToUnlock: { username?: string; ip_address?: string; reason?: string } | null = null;
  isUnlocking = false;

  // Help Modal State
  isHelpModalOpen = false;

  // KPI Strip Collapse State
  isKpiCollapsed = false;

  // Barcode Scanner ViewChild
  @ViewChild('barcodeScanner') barcodeScanner?: BarcodeScannerComponent;

  openHelpModal(): void {
    this.isHelpModalOpen = true;
  }

  closeHelpModal(): void {
    this.isHelpModalOpen = false;
  }

  toggleKpi(): void {
    this.isKpiCollapsed = !this.isKpiCollapsed;
  }

  openLoginDetailsModal(log: UserLoginLog, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedLoginForDetails = log;
    this.isLoginDetailsModalOpen = true;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  closeLoginDetailsModal(): void {
    this.isLoginDetailsModalOpen = false;
    this.selectedLoginForDetails = null;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  copyUserAgent(ua?: string | null): void {
    if (!ua) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ua).then(() => {
        this.toast.show('success', 'رشته کامل User-Agent در کلیپ‌بورد کپی شد.');
      }).catch(() => {
        this.toast.show('info', 'امکان دسترسی مستقیم به کلیپ‌بورد وجود ندارد.');
      });
    } else {
      this.toast.show('info', 'مرورگر از کپی مستقیم پشتیبانی نمی‌کند.');
    }
  }

  getFormattedDeviceModel(log?: UserLoginLog | null): string {
    if (!log) return '';
    if (log.device_model) {
      return formatDeviceModelName(log.device_model);
    }
    const ua = log.user_agent || '';
    const match = ua.match(/;\s*([A-Z0-9_-]+)\s+Build\//i);
    if (match && match[1] && match[1] !== 'K') {
      return formatDeviceModelName(match[1]);
    }
    return '';
  }

  openScanner(): void {
    if (this.barcodeScanner) {
      this.barcodeScanner.openCamera();
    }
  }

  onBarcodeScanned(code: string): void {
    if (!code?.trim()) return;
    const clean = code.trim();
    this.searchTerm = clean;
    this.toast.show('success', `بارکد اسکن شد: ${clean}`);
    this.resetPageAndReload();
  }

  constructor(
    private auditApi: AuditApiService,
    private toast: ToastService,
    public authStore: AuthStore,
    public auth: AuthService,
    public state: StateService,
    private wsService: WebSocketService,
    private offlineSync: OfflineSyncService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  get currentWarehouseId(): number | undefined {
    if (this.isFinanceScope) return undefined;
    const val = this.authStore.activeWarehouseId();
    if (!val || val === 'ALL') return undefined;
    return typeof val === 'number' ? val : Number(val);
  }

  get currentWarehouseName(): string | null {
    if (this.isFinanceScope) return null;
    const val = this.authStore.activeWarehouseId();
    if (!val || val === 'ALL') return null;
    const wh = this.state.appState?.projects?.find((p: any) => p.id === Number(val));
    return wh ? wh.name : null;
  }

  onWarehouseChanged(id: number | string | null): void {
    this.authStore.setActiveWarehouse(id);
    this.state.appState.activeWarehouseId = id as any;
    this.loadStats();
    this.resetPageAndReload();
  }

  ngOnInit(): void {
    // ── تشخیص و قفل هوشمند قلمرو سامانه بر اساس مسیر و پرسونای فعال ──
    const routeScope = this.route.snapshot.data['appScope'];
    if (routeScope === 'finance' || this.router.url.includes('/app/finance')) {
      this.selectedAppScope = 'finance';
    } else if (routeScope === 'warehouse' || this.router.url.includes('/app/warehouse')) {
      this.selectedAppScope = 'warehouse';
    } else if (routeScope === 'security' || this.router.url.includes('/app/operations')) {
      // ممیزی مرکز عملیات جانشین ممیزی منوی مالی است؛ پیش‌فرض همهٔ قلمروها
      if (!this.isWarehouseInstalled && this.isAccountingInstalled) {
        this.selectedAppScope = 'finance';
      } else if (this.isWarehouseInstalled && !this.isAccountingInstalled) {
        this.selectedAppScope = 'warehouse';
      } else {
        this.selectedAppScope = 'all';
      }
    } else if (this.personaService?.activeApp) {
      this.selectedAppScope = this.personaService.activeApp() === 'personnel' ? 'finance' : 'warehouse';
    }
    if (!this.isWarehouseInstalled) {
      this.selectedAppScope = 'finance';
    } else if (!this.isAccountingInstalled) {
      this.selectedAppScope = 'warehouse';
    }

    // ── وضعیت آنلاین/آفلاین ──
    const network = NetworkStatusService.getInstance();
    this.isOnline = network.isOnline;
    this.subs.add(
      network.state$.subscribe(state => {
        this.isOnline = state === 'online';
        this.cdr.markForCheck();
      })
    );

    // ── بازیابی فیلترها و وضعیت تب از QueryParams آدرس ──
    this.parseQueryParamsFromUrl();

    // ── جستجوی با دی‌بانس ──
    this.subs.add(
      this.searchSubject.pipe(
        debounceTime(400),
        distinctUntilChanged()
      ).subscribe(() => {
        this.resetPageAndReload();
      })
    );

    // ── اتصال به وب‌سوکت و اشتراک در رویدادهای زنده ──
    this.wsService.connect();
    this.subs.add(
      this.wsService.connected$.subscribe(connected => {
        this.isWsConnected = connected;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.wsService.notifications$.subscribe((data: any) => {
        this.handleWebSocketNotification(data);
      })
    );

    // ── اشتراک در رویدادهای SWR پس‌زمینه (LocalFirst Revalidation) ──
    this.subs.add(
      this.offlineSync.liveDataUpdates$.subscribe(({ url, data }) => {
        this.handleSwrDataUpdate(url, data);
      })
    );

    this.loadStats();
    this.loadActiveTabData();
  }

  refreshAll(): void {
    this.loadStats();
    this.loadActiveTabData();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.flashTimeouts.forEach(t => clearTimeout(t));
    this.isDiffModalOpen = false;
    this.isRevertModalOpen = false;
    this.isPurgeModalOpen = false;
    this.isPointInTimeModalOpen = false;
    this.isLoginDetailsModalOpen = false;
    this.isExportModalOpen = false;
    this.showUnlockConfirmModal = false;
    this.updateScrollLock();
  }

  private savedScrollTop = 0;

  private updateScrollLock(): void {
    if (typeof document !== 'undefined') {
      const isAnyOpen = this.isDiffModalOpen || this.isRevertModalOpen || this.isPurgeModalOpen || this.isPointInTimeModalOpen || this.isLoginDetailsModalOpen || this.isExportModalOpen || this.showUnlockConfirmModal;
      const container = document.getElementById('content-container');
      if (container) {
        if (isAnyOpen) {
          if (container.style.overflowY !== 'hidden') {
            this.savedScrollTop = container.scrollTop;
          }
          container.scrollTop = 0;
          container.style.overflowY = 'hidden';
        } else {
          container.style.overflowY = 'auto';
          if (this.savedScrollTop > 0) {
            container.scrollTop = this.savedScrollTop;
            this.savedScrollTop = 0;
          }
        }
      }
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.showUnlockConfirmModal) {
      this.closeUnlockConfirmModal();
    } else if (this.isExportModalOpen) {
      this.closeExportModal();
    } else if (this.isLoginDetailsModalOpen) {
      this.closeLoginDetailsModal();
    } else if (this.isRevertModalOpen) {
      this.closeRevertModal();
    } else if (this.isPurgeModalOpen) {
      this.closePurgeModal();
    } else if (this.isPointInTimeModalOpen) {
      this.closePointInTimeModal();
    } else if (this.isDiffModalOpen) {
      this.closeModal();
    }
  }

  setTab(tab: 'audit' | 'security' | 'login'): void {
    if (this.activeTab !== tab) {
      this.activeTab = tab;
      this.searchTerm = '';
      this.selectedModule = '';
      this.selectedSeverity = '';
      this.selectedAction = '';
      this.selectedEvent = '';
      this.selectedLoginStatus = '';
      this.fromDate = '';
      this.toDate = '';
      this.fromDateControl.setValue('', { emitEvent: false });
      this.toDateControl.setValue('', { emitEvent: false });
      this.hasError = false;
      this.syncQueryParams();
      this.loadActiveTabData();
    }
  }

  setAppScope(scope: 'all' | 'warehouse' | 'finance'): void {
    if (this.selectedAppScope !== scope) {
      this.selectedAppScope = scope;
      this.resetPageAndReload();
    }
  }

  filterByEvent(event: string): void {
    if (this.selectedEvent === event) {
      this.selectedEvent = '';
    } else {
      this.selectedEvent = event;
    }
    this.resetPageAndReload();
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  onFilterChange(): void {
    this.resetPageAndReload();
  }

  onFromDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.fromDate = event.gregorian;
      this.onFilterChange();
    }
  }

  onToDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.toDate = event.gregorian;
      this.onFilterChange();
    }
  }

  formatDateToShamsiString(date?: Date | string | null): string {
    return formatToStandardShamsi(date);
  }

  parseShamsiStringToDate(shamsiStr: string): Date | null {
    const d = parseSmartDate(shamsiStr, { strict: false });
    if (!d) return null;
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // ── ماسک هوشمند ورود تاریخ شمسی (تبدیل خودکار 14050531 به 1405/05/31) ──
  onDateInput(type: 'from' | 'to', event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    let val = input.value || '';
    
    // تبدیل ارقام فارسی و عربی به انگلیسی
    val = val.replace(/[\u06F0-\u06F9]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728))
             .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584));
    
    const digitsOnly = val.replace(/\D/g, '');

    if (digitsOnly.length === 8) {
      const y = digitsOnly.substring(0, 4);
      const m = digitsOnly.substring(4, 6);
      const d = digitsOnly.substring(6, 8);
      const formatted = `${y}/${m}/${d}`;
      input.value = formatted;
      if (type === 'from') {
        this.fromDateControl.setValue(formatted, { emitEvent: false });
      } else {
        this.toDateControl.setValue(formatted, { emitEvent: false });
      }

      const gDate = this.parseShamsiStringToDate(formatted);
      if (gDate) {
        if (type === 'from') {
          this.fromDate = gDate.toISOString();
        } else {
          this.toDate = gDate.toISOString();
        }
        this.onFilterChange();
      }
      return;
    }

    if (val.length >= 10 && val.includes('/')) {
      const gDate = this.parseShamsiStringToDate(val);
      if (gDate) {
        if (type === 'from') {
          this.fromDate = gDate.toISOString();
        } else {
          this.toDate = gDate.toISOString();
        }
        this.onFilterChange();
      }
    } else if (val.trim() === '') {
      if (type === 'from') {
        this.fromDate = '';
      } else {
        this.toDate = '';
      }
      this.onFilterChange();
    }
  }

  // ── همگام‌سازی دوطرفه آدرس URL و QueryParams ──
  private parseQueryParamsFromUrl(): void {
    const params = this.route.snapshot.queryParams;
    if (!params || Object.keys(params).length === 0) return;

    if (params['tab'] === 'login' || params['tab'] === 'audit' || params['tab'] === 'security') {
      this.activeTab = params['tab'];
    }
    if (params['app_scope'] && ['all', 'warehouse', 'finance'].includes(params['app_scope'])) {
      this.selectedAppScope = params['app_scope'];
    }
    if (params['event']) this.selectedEvent = params['event'];
    if (params['module']) this.selectedModule = params['module'];
    if (params['action']) this.selectedAction = params['action'];
    if (params['severity']) this.selectedSeverity = params['severity'];
    if (params['status']) this.selectedLoginStatus = params['status'];
    if (params['q']) this.searchTerm = params['q'];
    if (params['page']) {
      const p = parseInt(params['page'], 10);
      if (p > 0) {
        if (this.activeTab === 'audit' || this.activeTab === 'security') this.auditPage = p;
        else this.loginPage = p;
      }
    }
    if (params['pageSize']) {
      const ps = parseInt(params['pageSize'], 10);
      if ([20, 50, 100].includes(ps)) {
        if (this.activeTab === 'audit' || this.activeTab === 'security') this.auditPageSize = ps;
        else this.loginPageSize = ps;
      }
    }
    if (params['from']) {
      const gDate = this.parseShamsiStringToDate(params['from']);
      if (gDate) {
        this.fromDate = gDate.toISOString();
        this.fromDateControl.setValue(params['from'], { emitEvent: false });
      }
    }
    if (params['to']) {
      const gDate = this.parseShamsiStringToDate(params['to']);
      if (gDate) {
        this.toDate = gDate.toISOString();
        this.toDateControl.setValue(params['to'], { emitEvent: false });
      }
    }
  }

  syncQueryParams(): void {
    const queryParams: Record<string, any> = {};

    if (this.activeTab !== 'audit') queryParams['tab'] = this.activeTab;
    if (this.searchTerm?.trim()) queryParams['q'] = this.searchTerm.trim();

    if (this.activeTab === 'audit') {
      if (this.selectedAppScope && this.selectedAppScope !== 'all') queryParams['app_scope'] = this.selectedAppScope;
      if (this.selectedModule) queryParams['module'] = this.selectedModule;
      if (this.selectedAction) queryParams['action'] = this.selectedAction;
      if (this.selectedSeverity) queryParams['severity'] = this.selectedSeverity;
      if (this.auditPage > 1) queryParams['page'] = this.auditPage;
      if (this.auditPageSize !== 20) queryParams['pageSize'] = this.auditPageSize;
    } else if (this.activeTab === 'security') {
      if (this.selectedEvent) queryParams['event'] = this.selectedEvent;
      if (this.selectedSeverity) queryParams['severity'] = this.selectedSeverity;
      if (this.auditPage > 1) queryParams['page'] = this.auditPage;
      if (this.auditPageSize !== 20) queryParams['pageSize'] = this.auditPageSize;
    } else {
      if (this.selectedLoginStatus) queryParams['status'] = this.selectedLoginStatus;
      if (this.loginPage > 1) queryParams['page'] = this.loginPage;
      if (this.loginPageSize !== 20) queryParams['pageSize'] = this.loginPageSize;
    }

    if (this.fromDateControl.value?.trim()) {
      queryParams['from'] = this.fromDateControl.value.trim();
    }
    if (this.toDateControl.value?.trim()) {
      queryParams['to'] = this.toDateControl.value.trim();
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true
    });
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedAppScope = 'all';
    this.selectedEvent = '';
    this.selectedModule = '';
    this.selectedSeverity = '';
    this.selectedAction = '';
    this.selectedLoginStatus = '';
    this.fromDate = '';
    this.toDate = '';
    this.fromDateControl.setValue('', { emitEvent: false });
    this.toDateControl.setValue('', { emitEvent: false });
    this.hasError = false;
    this.resetPageAndReload();
  }

  // ── Helper methods for Active Filter Chips & Quick Date Presets ──
  hasActiveFilters(): boolean {
    if (this.searchTerm?.trim()) return true;
    if (this.fromDate || this.toDate) return true;
    if (this.activeTab === 'audit') {
      return !!(this.selectedModule || this.selectedSeverity || this.selectedAction || (this.selectedAppScope && this.selectedAppScope !== 'all'));
    } else if (this.activeTab === 'security') {
      return !!(this.selectedEvent || this.selectedSeverity);
    } else {
      return !!this.selectedLoginStatus;
    }
  }

  clearAppScopeFilter(): void {
    this.selectedAppScope = 'all';
    this.resetPageAndReload();
  }

  clearEventFilter(): void {
    this.selectedEvent = '';
    this.resetPageAndReload();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.resetPageAndReload();
  }

  clearModuleFilter(): void {
    this.selectedModule = '';
    this.resetPageAndReload();
  }

  clearActionFilter(): void {
    this.selectedAction = '';
    this.resetPageAndReload();
  }

  clearSeverityFilter(): void {
    this.selectedSeverity = '';
    this.resetPageAndReload();
  }

  clearLoginStatusFilter(): void {
    this.selectedLoginStatus = '';
    this.resetPageAndReload();
  }

  clearDateFilter(): void {
    this.fromDate = '';
    this.toDate = '';
    this.fromDateControl.setValue('', { emitEvent: false });
    this.toDateControl.setValue('', { emitEvent: false });
    this.resetPageAndReload();
  }

  setPresetRange(preset: 'today' | '24h' | '7d' | '30d'): void {
    const now = new Date();
    const to = new Date(now);
    let from = new Date(now);

    if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (preset === '24h') {
      from.setTime(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === '7d') {
      from.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === '30d') {
      from.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    this.fromDate = from.toISOString();
    this.toDate = to.toISOString();
    this.fromDateControl.setValue(this.toShamsiDisplay(this.fromDate) || '', { emitEvent: false });
    this.toDateControl.setValue(this.toShamsiDisplay(this.toDate) || '', { emitEvent: false });
    this.resetPageAndReload();
  }

  getModuleLabel(key: string): string {
    const map: Record<string, string> = {
      docs: 'مدیریت کالا',
      dispatch: 'تخصیص کالا',
      customs: 'مالی و گمرکی',
      feeding: 'تغذیه سامانه‌ها (MT)',
      labels: 'لیبلینگ و بارکد',
      counter: 'میزکار شمارش',
      supervisor: 'کارتابل سرپرست',
      manager: 'بررسی مدیر',
      users: 'کاربران و نقش‌ها',
      warehouses: 'مدیریت انبارها',
      settings: 'تنظیمات انبار و سیستم',
      system: 'رویدادهای سیستمی'
    };
    return map[key] || key;
  }

  getActionLabel(key: string): string {
    const map: Record<string, string> = {
      CREATE: 'ایجاد رکورد',
      UPDATE: 'ویرایش رکورد',
      DELETE: 'حذف رکورد',
      BULK_UPDATE: 'ویرایش گروهی',
      APPROVE: 'تایید سرپرست',
      REJECT: 'رد درخواست',
      RECOUNT: 'دستور بازشماری',
      PRINT: 'چاپ لیبل / گزارش',
      EXPORT: 'خروجی اکسل/CSV',
      IMPORT: 'تزریق / ایمپورت داده',
      ROLLBACK: 'بازگردانی اطلاعات'
    };
    return map[key] || key;
  }

  getSeverityLabel(key: string): string {
    const map: Record<string, string> = {
      info: 'عادی (اطلاع‌رسانی)',
      warning: 'هشدار (تغییرات محدود)',
      critical: 'بحرانی (حذف/تغییرات گروهی)'
    };
    return map[key] || key;
  }

  getLoginStatusLabel(key: string): string {
    const map: Record<string, string> = {
      SUCCESS: 'ورود موفق (Success)',
      DAILY_ACTIVE: 'حضور روزانه (Daily)',
      FAILED_CREDENTIALS: 'رمز عبور اشتباه',
      FAILED_LOCKED: 'مسدود شده توسط ضدنفوذ',
      FAILED_INACTIVE: 'حساب غیرفعال',
      FAILED: 'تلاش‌های ناموفق (همه)',
      LOGOUT: 'خروج امن'
    };
    return map[key] || key;
  }

  resetPageAndReload(): void {
    this.syncQueryParams();
    if (this.activeTab === 'audit' || this.activeTab === 'security') {
      this.auditPage = 1;
      this.loadAuditLogs();
    } else {
      this.loginPage = 1;
      this.loadLoginLogs();
    }
  }

  loadActiveTabData(): void {
    if (this.activeTab === 'audit' || this.activeTab === 'security') {
      this.loadAuditLogs();
    } else {
      this.loadLoginLogs();
      this.loadLockedUsers();
    }
  }

  loadStats(): void {
    if (!this.isOnline) return;
    this.auditApi.getAuditStats(this.currentWarehouseId).subscribe({
      next: (stats: any) => {
        if (stats) {
          stats.audits_24h = stats.logs_24h ?? stats.audits_24h ?? 0;
          stats.critical_count = stats.critical_24h ?? stats.critical_count ?? 0;
          stats.warning_count = stats.warning_24h ?? stats.warning_count ?? 0;
        }
        this.auditStats = stats;
        this.cdr.markForCheck();
      },
      error: () => {}
    });

    this.facade.getLoginStats().subscribe({
      next: (stats) => {
        this.loginStats = stats;
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  private formatIsoDate(dateStr: string, isEnd: boolean): string | undefined {
    if (!dateStr) return undefined;
    try {
      const s = String(dateStr).trim();
      if (!s) return undefined;
      const dateOnly = s.includes('T') ? s.split('T')[0] : (s.length === 10 && s.includes('-') ? s : null);
      if (dateOnly) {
        const timePart = isEnd ? 'T23:59:59.999' : 'T00:00:00.000';
        const d = new Date(`${dateOnly}${timePart}`);
        return isNaN(d.getTime()) ? undefined : d.toISOString();
      }
      const d = new Date(s);
      if (isNaN(d.getTime())) return undefined;
      if (isEnd) {
        d.setHours(23, 59, 59, 999);
      } else {
        d.setHours(0, 0, 0, 0);
      }
      return d.toISOString();
    } catch {
      return undefined;
    }
  }

  loadAuditLogs(): void {
    this.isLoading = true;
    this.hasError = false;
    this.cdr.markForCheck();

    const filters: AuditFilters = {
      page: this.auditPage,
      page_size: this.auditPageSize,
      warehouse: this.currentWarehouseId,
      search: this.searchTerm || undefined,
      module: this.selectedModule || undefined,
      severity: this.selectedSeverity || undefined,
      action_type: this.selectedAction || undefined,
      event: this.selectedEvent || undefined,
      app_scope: this.activeTab === 'security' ? 'security' : (this.selectedAppScope !== 'all' ? this.selectedAppScope : undefined),
      from_date: this.formatIsoDate(this.fromDate, false),
      to_date: this.formatIsoDate(this.toDate, true),
    };

    this.auditApi.getAuditLogs(filters).subscribe({
      next: (resp: any) => {
        this.isLoading = false;
        this.hasError = false;
        if (resp && resp.results) {
          this.auditLogs = resp.results;
          this.auditTotalCount = resp.count || 0;
        } else if (Array.isArray(resp)) {
          this.auditLogs = resp;
          this.auditTotalCount = resp.length;
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.hasError = true;
        if (this.isOnline && err?.status !== 503) {
          this.toast.show('error', 'خطا در دریافت لاگ‌های ممیزی.');
        }
        this.cdr.markForCheck();
      }
    });
  }

  loadLoginLogs(): void {
    this.isLoading = true;
    this.hasError = false;
    this.cdr.markForCheck();

    const filters: LoginFilters = {
      page: this.loginPage,
      page_size: this.loginPageSize,
      search: this.searchTerm || undefined,
      status: this.selectedLoginStatus || undefined,
      from_date: this.formatIsoDate(this.fromDate, false),
      to_date: this.formatIsoDate(this.toDate, true),
    };

    this.auditApi.getLoginLogs(filters).subscribe({
      next: (resp: any) => {
        this.isLoading = false;
        this.hasError = false;
        if (resp && resp.results) {
          this.loginLogs = resp.results;
          this.loginTotalCount = resp.count || 0;
        } else if (Array.isArray(resp)) {
          this.loginLogs = resp;
          this.loginTotalCount = resp.length;
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.hasError = true;
        if (this.isOnline && err?.status !== 503) {
          this.toast.show('error', 'خطا در دریافت تاریخچه ورود کاربران.');
        }
        this.cdr.markForCheck();
      }
    });
  }

  // Pagination controls
  get totalPages(): number {
    if (this.activeTab === 'audit' || this.activeTab === 'security') {
      return Math.ceil(this.auditTotalCount / this.auditPageSize) || 1;
    }
    return Math.ceil(this.loginTotalCount / this.loginPageSize) || 1;
  }

  get currentPage(): number {
    return (this.activeTab === 'audit' || this.activeTab === 'security') ? this.auditPage : this.loginPage;
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      if (this.activeTab === 'audit' || this.activeTab === 'security') {
        this.auditPage++;
        this.syncQueryParams();
        this.loadAuditLogs();
      } else {
        this.loginPage++;
        this.syncQueryParams();
        this.loadLoginLogs();
      }
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      if (this.activeTab === 'audit' || this.activeTab === 'security') {
        this.auditPage--;
        this.syncQueryParams();
        this.loadAuditLogs();
      } else {
        this.loginPage--;
        this.syncQueryParams();
        this.loadLoginLogs();
      }
    }
  }

  onPageSizeChange(newSize: number): void {
    if (this.activeTab === 'audit' || this.activeTab === 'security') {
      this.auditPageSize = Number(newSize);
      this.auditPage = 1;
      this.syncQueryParams();
      this.loadAuditLogs();
    } else {
      this.loginPageSize = Number(newSize);
      this.loginPage = 1;
      this.syncQueryParams();
      this.loadLoginLogs();
    }
  }

  filterBySeverity(severity: string): void {
    if (this.selectedSeverity === severity) {
      this.selectedSeverity = '';
    } else {
      this.selectedSeverity = severity;
    }
    this.auditPage = 1;
    this.syncQueryParams();
    this.loadAuditLogs();
  }

  filterByLoginStatus(status: string): void {
    if (this.selectedLoginStatus === status) {
      this.selectedLoginStatus = '';
    } else {
      this.selectedLoginStatus = status;
    }
    this.loginPage = 1;
    this.syncQueryParams();
    this.loadLoginLogs();
  }

  parseUserAgent(ua?: string | null): { browser: string; browserVersion?: string; os: string; osVersion?: string; isMobile: boolean; deviceType: string } {
    if (!ua) return { browser: 'نامشخص', os: 'نامشخص', isMobile: false, deviceType: 'نامشخص' };
    let browser = 'مرورگر وب';
    let browserVersion = '';
    let os = 'سایر';
    let osVersion = '';
    let isMobile = false;
    let deviceType = 'رایانه رومیزی';

    const uaLower = ua.toLowerCase();

    // OS & Device detection
    if (uaLower.includes('windows nt 10.0')) { os = 'Windows 10 / 11'; deviceType = 'رایانه رومیزی'; }
    else if (uaLower.includes('windows nt 6.3')) { os = 'Windows 8.1'; deviceType = 'رایانه رومیزی'; }
    else if (uaLower.includes('windows nt 6.1')) { os = 'Windows 7'; deviceType = 'رایانه رومیزی'; }
    else if (uaLower.includes('windows')) { os = 'Windows'; deviceType = 'رایانه رومیزی'; }
    else if (uaLower.includes('android')) {
      os = 'Android';
      isMobile = true;
      deviceType = 'موبایل / تبلت اندروید';
      const m = ua.match(/Android\s+([\d.]+)/i);
      if (m) osVersion = m[1];
    }
    else if (uaLower.includes('iphone')) {
      os = 'iOS';
      isMobile = true;
      deviceType = 'آیفون';
      const m = ua.match(/OS\s+([\d_]+)/i);
      if (m) osVersion = m[1].replace(/_/g, '.');
    }
    else if (uaLower.includes('ipad')) {
      os = 'iPadOS';
      isMobile = true;
      deviceType = 'آیپد';
    }
    else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) {
      os = 'macOS';
      deviceType = 'رایانه مک';
    }
    else if (uaLower.includes('linux')) {
      os = 'GNU/Linux';
      deviceType = 'لینوکس';
    }

    // Browser detection
    if (uaLower.includes('edg/')) {
      browser = 'Edge';
      const m = ua.match(/Edg\/([\d.]+)/i);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('chrome') && !uaLower.includes('edg')) {
      browser = 'Chrome';
      const m = ua.match(/Chrome\/([\d.]+)/i);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('firefox')) {
      browser = 'Firefox';
      const m = ua.match(/Firefox\/([\d.]+)/i);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('safari') && !uaLower.includes('chrome')) {
      browser = 'Safari';
      const m = ua.match(/Version\/([\d.]+)/i);
      if (m) browserVersion = m[1].split('.')[0];
    } else if (uaLower.includes('postman')) {
      browser = 'Postman';
      deviceType = 'کلاینت تست API';
    } else if (uaLower.includes('curl') || uaLower.includes('python')) {
      browser = 'API Client';
      deviceType = 'اسکریپت خودکار';
    }

    return { browser, browserVersion, os, osVersion, isMobile, deviceType };
  }

  // ─── Export Modal Methods ──────────────────────────────────────────────────
  openExportModal(): void {
    if (!this.canExportAudit()) {
      this.toast.show('error', 'شما مجوز دریافت خروجی اکسل/CSV را ندارید.');
      return;
    }
    // Prefill modal filters from current active table filters
    this.exportSearch = this.searchTerm;
    this.exportModule = this.selectedModule;
    this.exportSeverity = this.selectedSeverity;
    this.exportAction = this.selectedAction;
    this.exportLoginStatus = this.selectedLoginStatus;
    this.exportWarehouse = this.currentWarehouseId || '';
    this.exportFromDate = this.fromDate;
    this.exportToDate = this.toDate;
    this.exportFromDateControl.setValue(this.fromDateControl.value || '', { emitEvent: false });
    this.exportToDateControl.setValue(this.toDateControl.value || '', { emitEvent: false });
    this.exportFormat = 'xlsx';
    this.exportColumnsScope = 'all';

    this.isExportModalOpen = true;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  closeExportModal(): void {
    this.isExportModalOpen = false;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  toggleAuditColumn(key: string): void {
    if (this.selectedAuditColumns.has(key)) {
      this.selectedAuditColumns.delete(key);
    } else {
      this.selectedAuditColumns.add(key);
    }
    this.cdr.markForCheck();
  }

  toggleLoginColumn(key: string): void {
    if (this.selectedLoginColumns.has(key)) {
      this.selectedLoginColumns.delete(key);
    } else {
      this.selectedLoginColumns.add(key);
    }
    this.cdr.markForCheck();
  }

  selectAllAuditColumns(): void {
    this.availableAuditColumns.forEach(c => this.selectedAuditColumns.add(c.key));
    this.cdr.markForCheck();
  }

  deselectAllAuditColumns(): void {
    this.selectedAuditColumns.clear();
    this.cdr.markForCheck();
  }

  selectAllLoginColumns(): void {
    this.availableLoginColumns.forEach(c => this.selectedLoginColumns.add(c.key));
    this.cdr.markForCheck();
  }

  deselectAllLoginColumns(): void {
    this.selectedLoginColumns.clear();
    this.cdr.markForCheck();
  }

  onExportFromDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.exportFromDate = event.gregorian;
    }
  }

  onExportToDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.exportToDate = event.gregorian;
    }
  }

  onExportDateInput(type: 'from' | 'to', event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    let val = input.value || '';
    val = val.replace(/[\u06F0-\u06F9]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728))
             .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584));
    const digitsOnly = val.replace(/\D/g, '');

    if (digitsOnly.length === 8) {
      const y = digitsOnly.substring(0, 4);
      const m = digitsOnly.substring(4, 6);
      const d = digitsOnly.substring(6, 8);
      const formatted = `${y}/${m}/${d}`;
      input.value = formatted;
      if (type === 'from') {
        this.exportFromDateControl.setValue(formatted, { emitEvent: false });
      } else {
        this.exportToDateControl.setValue(formatted, { emitEvent: false });
      }

      const gDate = this.parseShamsiStringToDate(formatted);
      if (gDate) {
        if (type === 'from') {
          this.exportFromDate = gDate.toISOString();
        } else {
          this.exportToDate = gDate.toISOString();
        }
      }
      return;
    }

    if (val.length >= 10 && val.includes('/')) {
      const gDate = this.parseShamsiStringToDate(val);
      if (gDate) {
        if (type === 'from') {
          this.exportFromDate = gDate.toISOString();
        } else {
          this.exportToDate = gDate.toISOString();
        }
      }
    } else if (val.trim() === '') {
      if (type === 'from') {
        this.exportFromDate = '';
      } else {
        this.exportToDate = '';
      }
    }
  }

  executeExport(): void {
    this.isExporting = true;
    this.cdr.markForCheck();
    const format = this.exportFormat;

    if (this.activeTab === 'audit' || this.activeTab === 'security') {
      const cols = this.exportColumnsScope === 'custom'
        ? Array.from(this.selectedAuditColumns)
        : this.availableAuditColumns.map(c => c.key);

      const payload = {
        warehouse: this.exportWarehouse || undefined,
        search: this.exportSearch || undefined,
        module: this.exportModule || undefined,
        severity: this.exportSeverity || undefined,
        action_type: this.exportAction || undefined,
        app_scope: this.activeTab === 'security' ? 'security' : (this.selectedAppScope !== 'all' ? this.selectedAppScope : undefined),
        from_date: this.formatIsoDate(this.exportFromDate, false),
        to_date: this.formatIsoDate(this.exportToDate, true),
        format: format,
        columns: cols,
      };

      this.auditApi.exportAuditExcel(payload).subscribe({
        next: (blob) => {
          const ext = format === 'csv' ? 'csv' : 'xlsx';
          this.triggerDownload(blob, `audit_trail_report.${ext}`);
          this.toast.show('success', 'فایل گزارش ممیزی با موفقیت دریافت و ذخیره شد.');
          this.isExporting = false;
          this.closeExportModal();
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.show('error', 'خطا در تولید فایل خروجی ممیزی.');
          this.isExporting = false;
          this.cdr.markForCheck();
        }
      });
    } else {
      const cols = this.exportColumnsScope === 'custom'
        ? Array.from(this.selectedLoginColumns)
        : this.availableLoginColumns.map(c => c.key);

      const payload = {
        search: this.exportSearch || undefined,
        status: this.exportLoginStatus || undefined,
        from_date: this.formatIsoDate(this.exportFromDate, false),
        to_date: this.formatIsoDate(this.exportToDate, true),
        format: format,
        columns: cols,
      };

      this.auditApi.exportLoginExcel(payload).subscribe({
        next: (blob) => {
          const ext = format === 'csv' ? 'csv' : 'xlsx';
          this.triggerDownload(blob, `login_history_report.${ext}`);
          this.toast.show('success', 'فایل تاریخچه ورود کاربران با موفقیت دریافت و ذخیره شد.');
          this.isExporting = false;
          this.closeExportModal();
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.show('error', 'خطا در تولید فایل خروجی ورود.');
          this.isExporting = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  // ─── User Lockout & Unlock Methods ─────────────────────────────────────────
  loadLockedUsers(): void {
    if (this.activeTab !== 'login') return;
    this.isLoadingLockedUsers = true;
    this.auditApi.getLockedUsers().subscribe({
      next: (res) => {
        this.lockedUsersList = res?.locked_users || [];
        this.isLoadingLockedUsers = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingLockedUsers = false;
        this.cdr.markForCheck();
      }
    });
  }

  get hasLockedAccounts(): boolean {
    return this.lockedUsersList.some(u => u.is_locked);
  }

  get activeLockedAccounts(): LockedUserItem[] {
    return this.lockedUsersList.filter(u => u.is_locked);
  }

  confirmUnlockUser(username?: string | null, ip_address?: string | null, event?: Event): void {
    if (event) event.stopPropagation();
    this.targetUserToUnlock = {
      username: username || undefined,
      ip_address: ip_address || undefined
    };
    this.showUnlockConfirmModal = true;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  closeUnlockConfirmModal(): void {
    this.showUnlockConfirmModal = false;
    this.targetUserToUnlock = null;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  executeUnlockUser(): void {
    if (!this.targetUserToUnlock) return;
    this.isUnlocking = true;
    this.cdr.markForCheck();

    this.auditApi.resetUserLockout({
      username: this.targetUserToUnlock.username,
      ip_address: this.targetUserToUnlock.ip_address
    }).subscribe({
      next: (res) => {
        this.toast.show('success', res.message || 'قفل حساب کاربری با موفقیت بازنشانی شد.');
        this.isUnlocking = false;
        this.closeUnlockConfirmModal();
        this.loadLockedUsers();
        this.loadLoginLogs();
        this.loadStats();
        if (this.selectedLoginForDetails && this.selectedLoginForDetails.username_attempted === this.targetUserToUnlock?.username) {
          this.closeLoginDetailsModal();
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.show('error', err?.error?.error || 'خطا در رفع مسدودیت حساب کاربری.');
        this.isUnlocking = false;
        this.cdr.markForCheck();
      }
    });
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  trackByLogId(index: number, item: AuditLog): number {
    return item.id;
  }

  trackByLoginId(index: number, item: UserLoginLog): number {
    return item.id;
  }

  // Diff Modal methods
  openAuditDiffModal(log: AuditLog): void {
    this.selectedLog = log;
    this.modalSearchKey = '';
    this.isDiffModalOpen = true;
    this.updateScrollLock();

    if (log.before_state !== undefined || log.after_state !== undefined) {
      this.populateDiffModal(log);
      this.cdr.markForCheck();
    } else {
      this.isLoadingDiff = true;
      this.diffItems = [];
      this.modalRawBefore = '';
      this.modalRawAfter = '';
      this.cdr.markForCheck();
      this.auditApi.getAuditLog(log.id).subscribe({
        next: (fullLog) => {
          this.selectedLog = fullLog;
          this.populateDiffModal(fullLog);
          this.isLoadingDiff = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingDiff = false;
          this.populateDiffModal(log);
          this.toast.show('error', 'خطا در دریافت جزئیات تفاضل از سرور.');
          this.cdr.markForCheck();
        }
      });
    }
  }

  private populateDiffModal(log: AuditLog): void {
    this.diffItems = this.buildDiffItems(log.before_state, log.after_state);
    this.modalRawBefore = log.before_state ? JSON.stringify(log.before_state, null, 2) : '';
    this.modalRawAfter = log.after_state ? JSON.stringify(log.after_state, null, 2) : '';
  }

  closeModal(): void {
    this.isDiffModalOpen = false;
    this.selectedLog = null;
    this.diffItems = [];
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  get filteredDiffItems(): DiffItem[] {
    if (!this.modalSearchKey.trim()) {
      return this.diffItems;
    }
    const q = this.modalSearchKey.toLowerCase();
    return this.diffItems.filter(item =>
      item.key.toLowerCase().includes(q) ||
      String(item.oldValue).toLowerCase().includes(q) ||
      String(item.newValue).toLowerCase().includes(q)
    );
  }

  private isValueEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    }
    return false;
  }

  private buildDiffItems(before: Record<string, any> | null | undefined, after: Record<string, any> | null | undefined): DiffItem[] {
    const b = before || {};
    const a = after || {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    const items: DiffItem[] = [];

    for (const k of keys) {
      const hasB = b !== null && b !== undefined && Object.prototype.hasOwnProperty.call(b, k);
      const hasA = a !== null && a !== undefined && Object.prototype.hasOwnProperty.call(a, k);
      const valB = hasB ? b[k] : undefined;
      const valA = hasA ? a[k] : undefined;

      let type: DiffItem['type'] = 'changed';
      if (!hasB && hasA) {
        type = 'added';
      } else if (hasB && !hasA) {
        type = 'removed';
      } else if (this.isValueEqual(valB, valA)) {
        type = 'unchanged';
      }

      items.push({
        key: k,
        label: AUDIT_FIELD_LABELS_MAP[k] || k,
        oldValue: hasB ? this.formatValue(valB) : '—',
        newValue: hasA ? this.formatValue(valA) : '—',
        type
      });
    }

    // Sort: added, removed, changed first, then unchanged
    return items.sort((x, y) => {
      const weight = { added: 1, removed: 2, changed: 3, unchanged: 4 };
      return weight[x.type] - weight[y.type];
    });
  }

  formatValue(val: any): string {
    if (val === null) return 'null';
    if (val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'بله (True)' : 'خیر (False)';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  isMultiline(val: string): boolean {
    return typeof val === 'string' && (val.includes('\n') || val.length > 60);
  }

  copyJson(dataStr: string): void {
    if (!dataStr) return;
    navigator.clipboard.writeText(dataStr).then(() => {
      this.toast.show('success', 'جی‌سان در حافظه کپی شد.');
    }).catch(() => {
      this.toast.show('info', 'امکان کپی خودکار فراهم نبود.');
    });
  }

  formatDateTime(dtStr: string): string {
    if (!dtStr) return '—';
    try {
      const d = new Date(dtStr);
      if (isNaN(d.getTime())) return dtStr;
      const datePart = d.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timePart = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${datePart} ${timePart}`;
    } catch {
      return dtStr;
    }
  }

  toShamsiDisplay(isoDateStr?: string): string {
    if (!isoDateStr) return '';
    try {
      return this.formatDateToShamsiString(isoDateStr);
    } catch {
      return '';
    }
  }

  // ─── Rollback / Revert Methods ──────────────────────────────────────────

  canRevertLog(log: AuditLog | null): boolean {
    if (!log) return false;
    if (!['UPDATE', 'DELETE', 'CREATE', 'BULK_UPDATE'].includes(log.action)) return false;
    const user = this.auth.user();
    if (!user) return false;
    if (user.is_superuser || user.roles?.includes('admin') || user.department === 'admin') return true;
    const perms = (user.permissions || []).map(p => p.replace(/^accounts\./, ''));
    if (perms.includes('perm_rollback_data') || perms.includes('perm_rollback_bulk') || perms.includes('perm_rollback_single') || perms.includes('perm_sys_logs')) {
      return true;
    }
    if (log.action === 'DELETE' && perms.includes('perm_restore_deleted')) {
      return true;
    }
    return false;
  }

  openRevertModal(log: AuditLog, event?: Event): void {
    if (event) event.stopPropagation();
    if (!this.canRevertLog(log)) {
      this.toast.show('error', 'شما مجوز بازگردانی این رکورد را ندارید.');
      return;
    }

    this.revertLogTarget = log;
    this.revertReason = '';
    this.revertPreview = null;
    this.isRevertModalOpen = true;
    this.isLoadingRevertPreview = true;
    this.updateScrollLock();
    this.cdr.markForCheck();

    this.auditApi.previewRevert(log.id).subscribe({
      next: (res) => {
        this.revertPreview = res;
        this.isLoadingRevertPreview = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoadingRevertPreview = false;
        this.isRevertModalOpen = false;
        this.cdr.markForCheck();
        const msg = err.error?.detail || err.error?.message || 'خطا در واکشی پیش‌نمایش بازگردانی';
        this.toast.show('error', msg);
      }
    });
  }

  closeRevertModal(): void {
    this.isRevertModalOpen = false;
    this.revertLogTarget = null;
    this.revertPreview = null;
    this.revertReason = '';
    this.isReverting = false;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  executeRevert(): void {
    if (!this.revertLogTarget) return;

    this.isReverting = true;
    this.cdr.markForCheck();
    this.auditApi.revertLog(this.revertLogTarget.id, this.revertReason.trim()).subscribe({
      next: (res) => {
        this.isReverting = false;
        this.toast.show('success', res.message || 'داده‌ها با موفقیت بازگردانی شدند.');
        this.closeRevertModal();
        if (this.isDiffModalOpen) {
          this.closeModal();
        }
        this.loadAuditLogs();
        this.loadStats();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isReverting = false;
        this.cdr.markForCheck();
        const msg = err.error?.error || err.error?.detail || err.error?.message || 'خطا در بازگردانی داده‌ها';
        this.toast.show('error', msg);
      }
    });
  }

  // ─── Word-Level Diff & Highlight Helper ──────────────────────────────────
  computeWordDiff(oldVal: any, newVal: any): { oldTokens: WordDiffToken[]; newTokens: WordDiffToken[]; isDifferent: boolean } {
    const formatToString = (v: any): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v, null, 2);
        } catch {
          return String(v);
        }
      }
      return String(v).trim();
    };

    const strOld = formatToString(oldVal);
    const strNew = formatToString(newVal);

    if (strOld === strNew) {
      return {
        oldTokens: [{ text: strOld || '—', type: 'unchanged' }],
        newTokens: [{ text: strNew || '—', type: 'unchanged' }],
        isDifferent: false
      };
    }

    const wordsOld = strOld ? strOld.split(/(\s+|[,;:،؛\-—/])/) : [];
    const wordsNew = strNew ? strNew.split(/(\s+|[,;:،؛\-—/])/) : [];

    const setOld = new Set(wordsOld.filter(w => w.trim()));
    const setNew = new Set(wordsNew.filter(w => w.trim()));

    const oldTokens: WordDiffToken[] = wordsOld.map(w => {
      if (!w.trim()) return { text: w, type: 'unchanged' };
      const type: WordDiffToken['type'] = !setNew.has(w) ? 'removed' : 'unchanged';
      return { text: w, type };
    });

    const newTokens: WordDiffToken[] = wordsNew.map(w => {
      if (!w.trim()) return { text: w, type: 'unchanged' };
      const type: WordDiffToken['type'] = !setOld.has(w) ? 'added' : 'unchanged';
      return { text: w, type };
    });

    return { oldTokens, newTokens, isDifferent: true };
  }

  // ─── Purge Logs Methods ──────────────────────────────────────────────────
  purgeTargetType: 'audit' | 'login' = 'audit';

  openPurgeModal(): void {
    if (!this.canPurgeLogs()) {
      this.toast.show('error', 'شما دسترسی لازم برای پاکسازی لاگ‌ها را ندارید.');
      return;
    }
    this.purgeTargetType = this.activeTab === 'login' ? 'login' : 'audit';
    this.purgeFromDate = '';
    this.purgeToDate = '';
    this.purgeFromDateControl.setValue('', { emitEvent: false });
    this.purgeToDateControl.setValue('', { emitEvent: false });
    this.purgeWarehouse = this.currentWarehouseId || '';
    this.purgeModule = '';
    this.purgeDays = '';
    this.purgeConfirmText = '';
    this.purgePreviewCount = null;
    this.isPurgeModalOpen = true;
    this.updateScrollLock();
    this.fetchPurgePreview();
    this.cdr.markForCheck();
  }

  closePurgeModal(): void {
    this.isPurgeModalOpen = false;
    this.purgeConfirmText = '';
    this.purgePreviewCount = null;
    this.isPurging = false;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  onPurgeFromDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.purgeFromDate = event.gregorian.split('T')[0];
      this.fetchPurgePreview();
    }
  }

  onPurgeToDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.purgeToDate = event.gregorian.split('T')[0];
      this.fetchPurgePreview();
    }
  }

  fetchPurgePreview(): void {
    this.isLoadingPurgePreview = true;
    this.cdr.markForCheck();

    const req: PurgeRequest = {
      from_date: this.formatIsoDate(this.purgeFromDate, false),
      to_date: this.formatIsoDate(this.purgeToDate, true),
      warehouse: this.purgeTargetType === 'audit' ? (this.purgeWarehouse || undefined) : undefined,
      module: this.purgeTargetType === 'audit' ? (this.purgeModule || undefined) : undefined,
      days: this.purgeDays ? Number(this.purgeDays) : undefined,
    };

    const call$ = this.purgeTargetType === 'login'
      ? this.auditApi.getLoginPurgePreview(req)
      : this.auditApi.getPurgePreview(req);

    call$.subscribe({
      next: (res) => {
        this.isLoadingPurgePreview = false;
        this.purgePreviewCount = res.count;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingPurgePreview = false;
        this.purgePreviewCount = 0;
        this.cdr.markForCheck();
      }
    });
  }

  executePurge(): void {
    const requiredConfirm = this.purgeTargetType === 'login' ? 'PURGE_LOGIN_LOGS_CONFIRM' : 'PURGE_AUDIT_LOGS_CONFIRM';
    if (this.purgeConfirmText.trim() !== requiredConfirm) {
      this.toast.show('error', `لطفاً عبارت تاییدیه امنیتی را به صورت دقیق ${requiredConfirm} وارد نمایید.`);
      return;
    }

    this.isPurging = true;
    this.cdr.markForCheck();

    const req: PurgeRequest = {
      from_date: this.formatIsoDate(this.purgeFromDate, false),
      to_date: this.formatIsoDate(this.purgeToDate, true),
      warehouse: this.purgeTargetType === 'audit' ? (this.purgeWarehouse || undefined) : undefined,
      module: this.purgeTargetType === 'audit' ? (this.purgeModule || undefined) : undefined,
      days: this.purgeDays ? Number(this.purgeDays) : undefined,
      confirm_text: this.purgeConfirmText.trim()
    };

    const call$ = this.purgeTargetType === 'login'
      ? this.auditApi.purgeLoginLogs(req)
      : this.facade.purgeLogs(req);

    call$.subscribe({
      next: (res) => {
        this.isPurging = false;
        this.toast.show('success', res.message || 'لاگ‌ها با موفقیت پاکسازی شدند.');
        this.closePurgeModal();
        this.loadStats();
        this.resetPageAndReload();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isPurging = false;
        this.cdr.markForCheck();
        const msg = err.error?.error || err.error?.message || err.error?.detail || 'خطا در پاکسازی لاگ‌ها';
        this.toast.show('error', msg);
      }
    });
  }

  // ─── Point-in-Time Rollback Methods ──────────────────────────────────────
  openPointInTimeModal(): void {
    if (!this.canRollbackBulk()) {
      this.toast.show('error', 'شما دسترسی لازم برای بازگردانی گروهی به تاریخ را ندارید.');
      return;
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.pitTargetDate = yesterday.toISOString().split('T')[0];
    this.pitTargetDateControl.setValue(this.formatDateToShamsiString(yesterday), { emitEvent: false });
    this.pitTargetTime = '00:00';
    this.pitWarehouse = this.currentWarehouseId || '';
    this.pitModule = '';
    this.pitReason = '';
    this.pitPreview = null;
    this.isPointInTimeModalOpen = true;
    this.updateScrollLock();
    this.fetchPointInTimePreview();
    this.cdr.markForCheck();
  }

  closePointInTimeModal(): void {
    this.isPointInTimeModalOpen = false;
    this.pitPreview = null;
    this.isExecutingPit = false;
    this.updateScrollLock();
    this.cdr.markForCheck();
  }

  onPitDateSelect(event: any): void {
    if (event && event.gregorian) {
      this.pitTargetDate = event.gregorian.split('T')[0];
      this.fetchPointInTimePreview();
    }
  }

  onModalDateInput(modal: 'pit' | 'purgeFrom' | 'purgeTo', event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    let val = input.value || '';
    val = val.replace(/[\u06F0-\u06F9]/g, d => String.fromCharCode(d.charCodeAt(0) - 1728))
             .replace(/[\u0660-\u0669]/g, d => String.fromCharCode(d.charCodeAt(0) - 1584));
    const digitsOnly = val.replace(/\D/g, '');

    if (digitsOnly.length === 8) {
      const y = digitsOnly.substring(0, 4);
      const m = digitsOnly.substring(4, 6);
      const d = digitsOnly.substring(6, 8);
      const formatted = `${y}/${m}/${d}`;
      input.value = formatted;
      if (modal === 'pit') {
        this.pitTargetDateControl.setValue(formatted, { emitEvent: false });
      } else if (modal === 'purgeFrom') {
        this.purgeFromDateControl.setValue(formatted, { emitEvent: false });
      } else {
        this.purgeToDateControl.setValue(formatted, { emitEvent: false });
      }

      const gDate = this.parseShamsiStringToDate(formatted);
      if (gDate) {
        const iso = gDate.toISOString().split('T')[0];
        if (modal === 'pit') {
          this.pitTargetDate = iso;
          this.fetchPointInTimePreview();
        } else if (modal === 'purgeFrom') {
          this.purgeFromDate = iso;
          this.fetchPurgePreview();
        } else {
          this.purgeToDate = iso;
          this.fetchPurgePreview();
        }
      }
      return;
    }

    if (val.length >= 10 && val.includes('/')) {
      const gDate = this.parseShamsiStringToDate(val);
      if (gDate) {
        const iso = gDate.toISOString().split('T')[0];
        if (modal === 'pit') {
          this.pitTargetDate = iso;
          this.fetchPointInTimePreview();
        } else if (modal === 'purgeFrom') {
          this.purgeFromDate = iso;
          this.fetchPurgePreview();
        } else {
          this.purgeToDate = iso;
          this.fetchPurgePreview();
        }
      }
    } else if (val.trim() === '') {
      if (modal === 'pit') {
        this.pitTargetDate = '';
        this.fetchPointInTimePreview();
      } else if (modal === 'purgeFrom') {
        this.purgeFromDate = '';
        this.fetchPurgePreview();
      } else {
        this.purgeToDate = '';
        this.fetchPurgePreview();
      }
    }
  }

  private buildPitIsoDateTime(): string | null {
    if (!this.pitTargetDate) return null;
    const time = this.pitTargetTime || '00:00';
    const d = new Date(`${this.pitTargetDate}T${time}:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  fetchPointInTimePreview(): void {
    const targetIso = this.buildPitIsoDateTime();
    if (!targetIso) return;

    this.isLoadingPitPreview = true;
    this.cdr.markForCheck();

    const req: PointInTimeRollbackRequest = {
      target_datetime: targetIso,
      warehouse: this.pitWarehouse || undefined,
      module: this.pitModule || undefined
    };

    this.facade.previewPointInTimeRollback(req).subscribe({
      next: (res) => {
        this.pitPreview = res;
        this.isLoadingPitPreview = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoadingPitPreview = false;
        this.pitPreview = null;
        this.cdr.markForCheck();
        const msg = err.error?.message || err.error?.detail || 'خطا در شبیه‌سازی بازگردانی به تاریخ';
        this.toast.show('error', msg);
      }
    });
  }

  executePointInTimeRollback(): void {
    const targetIso = this.buildPitIsoDateTime();
    if (!targetIso) {
      this.toast.show('error', 'تاریخ هدف نامعتبر است.');
      return;
    }

    this.isExecutingPit = true;
    this.cdr.markForCheck();

    const req: PointInTimeRollbackRequest = {
      target_datetime: targetIso,
      warehouse: this.pitWarehouse || undefined,
      module: this.pitModule || undefined,
      reason: this.pitReason.trim() || undefined
    };

    this.facade.executePointInTimeRollback(req).subscribe({
      next: (res) => {
        this.isExecutingPit = false;
        this.toast.show('success', res.message || 'بازگردانی به تاریخ با موفقیت انجام شد.');
        this.closePointInTimeModal();
        this.loadStats();
        this.resetPageAndReload();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isExecutingPit = false;
        this.cdr.markForCheck();
        const msg = err.error?.error || err.error?.message || err.error?.detail || 'خطا در بازگردانی به تاریخ';
        this.toast.show('error', msg);
      }
    });
  }

  // ─── WebSocket & LocalFirst Handlers ─────────────────────────────────────

  private handleWebSocketNotification(data: any): void {
    if (!data) return;
    const eventType = data.type || data.event;

    // ۱. دریافت لاگ ممیزی جدید
    if (eventType === 'audit_log_created') {
      const log: AuditLog = data.log || data;
      if (!log || !log.id) return;

      const selectedWh = this.currentWarehouseId;
      const logWh = log.warehouse !== undefined && log.warehouse !== null ? log.warehouse : undefined;
      const matchesWarehouse = (selectedWh === undefined) || (logWh !== undefined && Number(logWh) === Number(selectedWh));

      // همیشه آمار عمومی را به‌روز کن
      this.incrementAuditStats(log);

      if (this.activeTab === 'audit' || this.activeTab === 'security') {
        if (matchesWarehouse && this.isFilterMatch(log)) {
          if (this.auditPage === 1) {
            const exists = this.auditLogs.some(l => l.id === log.id);
            if (!exists) {
              this.auditLogs.unshift(log);
              if (this.auditLogs.length > this.auditPageSize) {
                this.auditLogs.pop();
              }
              this.auditTotalCount++;
              this.markLogUpdated(log.id);
            }
          } else {
            this.auditTotalCount++;
          }
        }
      }
      this.cdr.markForCheck();
    }

    // ۲. دریافت لاگ ورود جدید
    else if (eventType === 'login_log_created') {
      const loginLog: UserLoginLog = data.login_log || data;
      if (!loginLog || !loginLog.id) return;

      this.incrementLoginStats(loginLog);

      if (this.activeTab === 'login') {
        if (this.loginPage === 1 && this.isLoginFilterMatch(loginLog)) {
          const exists = this.loginLogs.some(l => l.id === loginLog.id);
          if (!exists) {
            this.loginLogs.unshift(loginLog);
            if (this.loginLogs.length > this.loginPageSize) {
              this.loginLogs.pop();
            }
            this.loginTotalCount++;
            this.markLoginUpdated(loginLog.id);
          }
        } else {
          this.loginTotalCount++;
        }
      }
      this.cdr.markForCheck();
    }
  }

  private isFilterMatch(log: AuditLog): boolean {
    if (this.activeTab === 'security') {
      const isSec = log.details?.event === 'CROSS_APP_DENIED' ||
                    log.details?.event === 'APP_SCOPE_SWITCH' ||
                    log.severity === 'critical' ||
                    log.module === 'security' ||
                    log.module === 'users' ||
                    log.action === 'ROLLBACK';
      if (!isSec) return false;
      if (this.selectedEvent && log.details?.event !== this.selectedEvent) return false;
    } else if (this.activeTab === 'audit') {
      if (this.selectedAppScope === 'warehouse') {
        const isWh = ['docs', 'dispatch', 'customs', 'feeding', 'labels', 'counter', 'supervisor', 'manager', 'warehouses'].includes(log.module) || (log.warehouse !== undefined && log.warehouse !== null);
        const isCross = log.details?.event === 'CROSS_APP_DENIED' || log.details?.event === 'APP_SCOPE_SWITCH';
        if (!isWh || isCross) return false;
      } else if (this.selectedAppScope === 'finance') {
        const isFin = ['personnel', 'payroll', 'attendance', 'fleet', 'treasury', 'finance'].includes(log.module) || log.details?.target_module === 'finance';
        const isCross = log.details?.event === 'CROSS_APP_DENIED' || log.details?.event === 'APP_SCOPE_SWITCH';
        if (!isFin || isCross) return false;
      }
    }

    if (this.selectedModule && log.module !== this.selectedModule) return false;
    if (this.selectedSeverity && log.severity !== this.selectedSeverity) return false;
    if (this.selectedAction && log.action !== this.selectedAction) return false;
    if (this.fromDate && log.created_at) {
      const logTime = new Date(log.created_at).getTime();
      const fromTime = new Date(this.fromDate).getTime();
      if (!isNaN(logTime) && !isNaN(fromTime) && logTime < fromTime) return false;
    }
    if (this.toDate && log.created_at) {
      const logTime = new Date(log.created_at).getTime();
      const toTime = new Date(this.toDate).getTime();
      if (!isNaN(logTime) && !isNaN(toTime) && logTime > toTime) return false;
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      const matchUser = (log.user_display || '').toLowerCase().includes(term) || (log.actor_username || '').toLowerCase().includes(term);
      const matchRepr = (log.target_repr || '').toLowerCase().includes(term);
      const matchMod = (log.module_display || log.module || '').toLowerCase().includes(term);
      const matchAct = (log.action_display || log.action || '').toLowerCase().includes(term);
      if (!matchUser && !matchRepr && !matchMod && !matchAct) return false;
    }
    return true;
  }

  private isLoginFilterMatch(log: UserLoginLog): boolean {
    if (this.selectedLoginStatus) {
      if (this.selectedLoginStatus === 'FAILED') {
        if (!log.status || !log.status.startsWith('FAILED')) return false;
      } else if (log.status !== this.selectedLoginStatus) {
        return false;
      }
    }
    if (this.fromDate && log.created_at) {
      const logTime = new Date(log.created_at).getTime();
      const fromTime = new Date(this.fromDate).getTime();
      if (!isNaN(logTime) && !isNaN(fromTime) && logTime < fromTime) return false;
    }
    if (this.toDate && log.created_at) {
      const logTime = new Date(log.created_at).getTime();
      const toTime = new Date(this.toDate).getTime();
      if (!isNaN(logTime) && !isNaN(toTime) && logTime > toTime) return false;
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      const matchUser = (log.username_attempted || '').toLowerCase().includes(term) || (log.user_display || '').toLowerCase().includes(term);
      const matchIp = (log.ip_address || '').toLowerCase().includes(term);
      if (!matchUser && !matchIp) return false;
    }
    return true;
  }

  private incrementAuditStats(log: AuditLog): void {
    const selectedWh = this.currentWarehouseId;
    const logWh = log.warehouse !== undefined && log.warehouse !== null ? log.warehouse : undefined;
    const matchesWarehouse = (selectedWh === undefined) || (logWh !== undefined && Number(logWh) === Number(selectedWh));
    if (!matchesWarehouse) return;

    this.auditStats.total_all_time = (this.auditStats.total_all_time || 0) + 1;
    this.auditStats.audits_24h = (this.auditStats.audits_24h || 0) + 1;
    if (log.severity === 'critical') {
      this.auditStats.critical_count = (this.auditStats.critical_count || 0) + 1;
    } else if (log.severity === 'warning') {
      this.auditStats.warning_count = (this.auditStats.warning_count || 0) + 1;
    }
    if (log.module) {
      this.auditStats.module_breakdown = this.auditStats.module_breakdown || {};
      this.auditStats.module_breakdown[log.module] = (this.auditStats.module_breakdown[log.module] || 0) + 1;
    }

    const isSecurity = log.details?.event === 'CROSS_APP_DENIED' ||
                       log.details?.event === 'APP_SCOPE_SWITCH' ||
                       log.severity === 'critical' ||
                       log.module === 'security' ||
                       log.action === 'ROLLBACK';
    if (isSecurity) {
      this.auditStats.security_all_time = (this.auditStats.security_all_time || 0) + 1;
      if (log.details?.event === 'CROSS_APP_DENIED') {
        this.auditStats.cross_app_denied_count = (this.auditStats.cross_app_denied_count || 0) + 1;
      } else if (log.details?.event === 'APP_SCOPE_SWITCH') {
        this.auditStats.app_switch_count = (this.auditStats.app_switch_count || 0) + 1;
      }
    }
  }

  private incrementLoginStats(log: UserLoginLog): void {
    this.loginStats.total_all_time = (this.loginStats.total_all_time || 0) + 1;
    this.loginStats.logins_24h = (this.loginStats.logins_24h || 0) + 1;
    if (log.status === 'SUCCESS') {
      this.loginStats.success_24h = (this.loginStats.success_24h || 0) + 1;
    } else if (log.status && log.status.startsWith('FAILED')) {
      this.loginStats.failed_24h = (this.loginStats.failed_24h || 0) + 1;
    }
  }

  markLogUpdated(id: number): void {
    this.updatedLogIds.add(id);
    const timer = setTimeout(() => {
      this.updatedLogIds.delete(id);
      this.cdr.markForCheck();
    }, 3500);
    this.flashTimeouts.push(timer);
  }

  markLoginUpdated(id: number): void {
    this.updatedLoginIds.add(id);
    const timer = setTimeout(() => {
      this.updatedLoginIds.delete(id);
      this.cdr.markForCheck();
    }, 3500);
    this.flashTimeouts.push(timer);
  }

  private handleSwrDataUpdate(url: string, data: any): void {
    if (!url || !data) return;

    if (url.includes('auth/audit-logs') && !url.includes('/stats') && !url.includes('/export_csv')) {
      if (this.activeTab === 'audit' || this.activeTab === 'security') {
        const freshList: AuditLog[] = Array.isArray(data) ? data : (data.results || []);
        const count = data.count !== undefined ? data.count : freshList.length;
        if (freshList.length > 0) {
          for (const item of freshList) {
            const old = this.auditLogs.find(o => o.id === item.id);
            if (!old) {
              this.markLogUpdated(item.id);
            }
          }
          this.auditLogs = freshList;
          this.auditTotalCount = count;
          this.cdr.markForCheck();
        }
      }
    } else if (url.includes('auth/login-logs') && !url.includes('/stats') && !url.includes('/export_csv')) {
      if (this.activeTab === 'login') {
        const freshList: UserLoginLog[] = Array.isArray(data) ? data : (data.results || []);
        const count = data.count !== undefined ? data.count : freshList.length;
        if (freshList.length > 0) {
          for (const item of freshList) {
            const old = this.loginLogs.find(o => o.id === item.id);
            if (!old) {
              this.markLoginUpdated(item.id);
            }
          }
          this.loginLogs = freshList;
          this.loginTotalCount = count;
          this.cdr.markForCheck();
        }
      }
    } else if (url.includes('auth/audit-logs/stats')) {
      this.auditStats = data;
      this.cdr.markForCheck();
    } else if (url.includes('auth/login-logs/stats')) {
      this.loginStats = data;
      this.cdr.markForCheck();
    }
  }
}

