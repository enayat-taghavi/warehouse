import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpContext } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import { SKIP_OFFLINE } from '../../../../core/interceptors/offline.interceptor';
import {
  ProjectSection,
  VehicleDriverProfile,
  VehicleMatrixRow,
  VehicleMonthlyGridDay,
  VehicleMonthlyGridRow,
  VehicleTripAuditLog,
  MonthlyGridDayMeta
} from '../../../../core/models/personnel.model';
import { jalaliToGregorian, gregorianToJalali } from '../../../../core/utils/date-utils';
import {
  IRANIAN_BANKS,
  IranianBankInfo,
  validateSheba,
  ShebaValidationResult,
  extractShebaDigits,
  generateShebaFromAccount,
  validateAccountNumber
} from '../../../../core/utils/sheba-utils';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

export interface FleetMatrixRow extends VehicleMatrixRow {
  _isDirty?: boolean;
}

@Component({
  selector: 'app-employee-fleet-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective],
  templateUrl: './employee-fleet.html',
  styleUrl: './employee-fleet.css'
})
export class EmployeeFleetHubComponent implements OnInit, OnDestroy {
  // حالت فعال: 'daily' (ثبت روزانه) | 'monthly_grid' (تقویم ۳۱ روزه ماهانه)
  activeMode: 'daily' | 'monthly_grid' = 'daily';

  // مدیریت بخش و قرنطینه داده‌ها (Guardian G1: Section Isolation)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // لیست انبارها (جهت فیلتر شناور)
  warehouses: any[] = [];
  selectedWarehouseId: number | null = null;

  // متغیرهای تاریخ شمسی و دوره مالی
  selectedDateShamsi = '';
  selectedYearMonth = '';
  fiscalYear = '1405';
  isFleetDatePickerOpen = false;
  fleetDateControl = new FormControl('');

  // پاپ‌اور انتخاب سریع ماه
  isMonthPickerOpen = false;
  readonly PERSIAN_MONTHS = [
    { num: 1, name: 'فروردین' },
    { num: 2, name: 'اردیبهشت' },
    { num: 3, name: 'خرداد' },
    { num: 4, name: 'تیر' },
    { num: 5, name: 'مرداد' },
    { num: 6, name: 'شهریور' },
    { num: 7, name: 'مهر' },
    { num: 8, name: 'آبان' },
    { num: 9, name: 'آذر' },
    { num: 10, name: 'دی' },
    { num: 11, name: 'بهمن' },
    { num: 12, name: 'اسفند' }
  ];

  // ۱. ماتریس روزانه سرویس‌های ناوگان
  vehicleRows: FleetMatrixRow[] = [];
  isVehicleLoading = false;
  isSavingVehicles = false;
  fleetStatusFilter: 'active' | 'inactive' | 'all' = 'active';
  fleetSearchQuery = '';
  hasUnsavedChanges = false;
  hasRemoteConflict = false;

  // ۲. تقویم ۳۱ روزه ماهانه ناوگان
  fleetMonthlyGridRows: VehicleMonthlyGridRow[] = [];
  monthlyGridDays: MonthlyGridDayMeta[] = [];
  monthName = '';
  daysInMonth = 31;
  isPeriodLocked = false;
  periodStatus = 'OPEN';
  isFleetMonthlyGridLoading = false;
  isSavingFleetMonthlyGrid = false;
  hasUnsavedFleetMonthlyGrid = false;

  // ۳. مودال جزئیات تردد روز خودرو
  isFleetDayDetailModalOpen = false;
  selectedFleetDayDetailRow: VehicleMonthlyGridRow | null = null;
  selectedFleetDayDetailItem: VehicleMonthlyGridDay | null = null;
  fleetDayDetailTripCount = 0;
  fleetDayDetailUnitRate = 0;
  fleetDayDetailDispatchRef = '';
  fleetDayDetailOrigDest = '';
  fleetDayDetailNotes = '';

  // ۴. مودال پیست هوشمند اکسل ناوگان
  isFleetExcelPasteModalOpen = false;
  fleetExcelPasteText = '';
  fleetExcelParsedRows: Array<{
    identifier: string;
    trip_count: number;
    unit_rate: number;
    dispatch_reference: string;
    origin_destination: string;
    notes: string;
    matchedRow?: FleetMatrixRow;
  }> = [];

  // ۵. مودال برگه چاپی رسمی در قطع A4 افقی
  isFleetPrintModalOpen = false;
  fleetPrintTimestamp = '';

  // ۶. مودال پرونده و تعریف راننده/خودرو
  isVehicleProfileModalOpen = false;
  isEditingVehicleProfile = false;
  selectedVehicleProfile: Partial<VehicleDriverProfile> = {};
  isSavingVehicleProfile = false;
  iranianBanks: IranianBankInfo[] = IRANIAN_BANKS;
  shebaValidationResult: ShebaValidationResult | null = null;
  shebaDigitsDisplay = '';
  isBankDropdownOpen = false;
  bankSearchQuery = '';
  isShebaCopied = false;
  isAccountCopied = false;
  private _isSyncingBank = false;

  // ۷. مودال لاگ‌های ممیزی ناوگان
  isFleetAuditLogsModalOpen = false;
  fleetAuditLogs: VehicleTripAuditLog[] = [];
  isLoadingFleetAuditLogs = false;

  // اشتراک‌های وب‌سوکت
  private wsSub?: Subscription;
  private wsConnectedSub?: Subscription;

  // ورودی فایل مستقیم اکسل
  @ViewChild('fleetExcelFileInput') fleetExcelFileInput?: ElementRef<HTMLInputElement>;

  constructor(
    public auth: AuthService,
    private personnelApi: PersonnelApiService,
    private whService: WarehouseHttpService,
    private wsService: WebSocketService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initDefaultDate();
    this.loadWarehouses();
    this.loadMySections();
    this.setupWebSocket();
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.wsConnectedSub?.unsubscribe();
  }

  // --- تنظیم تاریخ پیش‌فرض شمسی ---
  private initDefaultDate(): void {
    try {
      const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(new Date());
      const y = parts.find(p => p.type === 'year')?.value || '1405';
      const m = parts.find(p => p.type === 'month')?.value || '04';
      const d = parts.find(p => p.type === 'day')?.value || '01';
      this.selectedDateShamsi = `${y}/${m}/${d}`;
      this.selectedYearMonth = `${y}/${m}`;
      this.fiscalYear = y;
      this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    } catch {
      this.selectedDateShamsi = '1405/04/01';
      this.selectedYearMonth = '1405/04';
      this.fiscalYear = '1405';
      this.fleetDateControl.setValue('1405/04/01', { emitEvent: false });
    }
  }

  // --- بارگذاری انبارها ---
  loadWarehouses(): void {
    this.whService.getAll().subscribe({
      next: (whs: any[]) => {
        this.warehouses = whs || [];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // --- بارگذاری بخش‌های مجاز کارمند (Guardian G1: Section Isolation) ---
  loadMySections(): void {
    this.isLoadingSections = true;
    this.personnelApi.getMySections().subscribe({
      next: (sections: ProjectSection[]) => {
        this.mySections = sections || [];
        if (this.mySections.length === 0) {
          const isSuper = this.auth.user()?.is_superuser || (this.auth.userPermissions() || []).includes('admin_all');
          if (isSuper) {
            this.personnelApi.getProjectSections({ is_active: true }).subscribe({
              next: (allSecs: ProjectSection[]) => {
                this.mySections = allSecs || [];
                this.pickDefaultSection();
              },
              error: () => {
                this.isLoadingSections = false;
                this.cdr.detectChanges();
              }
            });
            return;
          }
        }
        this.pickDefaultSection();
      },
      error: () => {
        this.isLoadingSections = false;
        this.toast.show('error', 'خطا در دریافت لیست بخش‌های کارگاهی مجاز');
        this.cdr.detectChanges();
      }
    });
  }

  private pickDefaultSection(): void {
    this.route.queryParams.subscribe(params => {
      if (params['section_id']) {
        const sId = Number(params['section_id']);
        if (!isNaN(sId) && this.mySections.some(s => s.id === sId)) {
          this.selectedSectionId = sId;
        }
      }
      if (params['mode'] && (params['mode'] === 'daily' || params['mode'] === 'monthly_grid')) {
        this.activeMode = params['mode'];
      }
      if (!this.selectedSectionId && this.mySections.length > 0) {
        this.selectedSectionId = this.mySections[0]?.id ?? null;
      }
      this.selectedSection = this.mySections.find(s => s.id === this.selectedSectionId) || null;
      this.isLoadingSections = false;
      this.onFilterChange();
    });
  }

  onSectionChanged(): void {
    this.selectedSection = this.mySections.find(s => s.id === Number(this.selectedSectionId)) || null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section_id: this.selectedSectionId },
      queryParamsHandling: 'merge'
    });
    this.onFilterChange();
  }

  setMode(mode: 'daily' | 'monthly_grid'): void {
    this.activeMode = mode;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: this.activeMode },
      queryParamsHandling: 'merge'
    });
    this.onFilterChange();
  }

  onFilterChange(): void {
    if (!this.selectedSectionId) {
      this.vehicleRows = [];
      this.fleetMonthlyGridRows = [];
      this.cdr.detectChanges();
      return;
    }
    if (this.activeMode === 'daily') {
      this.loadVehicleMatrix();
    } else {
      this.loadFleetMonthlyGrid();
    }
  }

  setFleetStatusFilter(status: 'active' | 'inactive' | 'all'): void {
    this.fleetStatusFilter = status;
    if (this.activeMode === 'daily') {
      this.loadVehicleMatrix();
    } else {
      this.loadFleetMonthlyGrid();
    }
  }

  get displayedVehicleRows(): FleetMatrixRow[] {
    if (!this.vehicleRows) return [];
    if (!this.fleetSearchQuery || !this.fleetSearchQuery.trim()) {
      return this.vehicleRows;
    }
    const q = this.fleetSearchQuery.trim().toLowerCase();
    return this.vehicleRows.filter(v =>
      (v.driver_name && v.driver_name.toLowerCase().includes(q)) ||
      (v.plate_number && v.plate_number.toLowerCase().includes(q)) ||
      (v.vehicle_type_display && v.vehicle_type_display.toLowerCase().includes(q)) ||
      (v.origin_destination && v.origin_destination.toLowerCase().includes(q)) ||
      (v.dispatch_reference && v.dispatch_reference.toLowerCase().includes(q))
    );
  }

  get displayedFleetMonthlyGridRows(): VehicleMonthlyGridRow[] {
    if (!this.fleetMonthlyGridRows) return [];
    if (!this.fleetSearchQuery || !this.fleetSearchQuery.trim()) {
      return this.fleetMonthlyGridRows;
    }
    const q = this.fleetSearchQuery.trim().toLowerCase();
    return this.fleetMonthlyGridRows.filter(r =>
      (r.driver_name && r.driver_name.toLowerCase().includes(q)) ||
      (r.plate_number && r.plate_number.toLowerCase().includes(q)) ||
      (r.vehicle_type_display && r.vehicle_type_display.toLowerCase().includes(q))
    );
  }

  // --- اتصالات زنده وب‌سوکت (WebSocket & Tab Echo Filtering) ---
  private setupWebSocket(): void {
    this.wsSub = this.wsService.notifications$.subscribe(notif => {
      if (!notif) return;

      // فیلتر اکوی همین تب
      if (notif.client_tab_id && notif.client_tab_id === this.wsService.tabId) {
        return;
      }

      // رویدادهای تردد ناوگان
      if (notif.type === 'fleet_trips_updated' || notif.event === 'fleet_trips_updated') {
        // فیلتر قرنطینه بخش کارگاه
        if (notif.section_id && this.selectedSectionId && notif.section_id !== this.selectedSectionId) {
          return;
        }

        if (this.activeMode === 'daily') {
          if (notif.date_shamsi === this.selectedDateShamsi) {
            if (this.hasUnsavedChanges) {
              this.hasRemoteConflict = true;
              this.toast.show('warning', '⚠️ تردد ناوگان توسط کاربر دیگری ویرایش شد.');
            } else {
              this.refreshVehicleMatrixSilently();
            }
          }
        } else if (this.activeMode === 'monthly_grid') {
          const isMatchingMonth = notif.year_month === this.selectedYearMonth ||
            (notif.date_shamsi && notif.date_shamsi.startsWith(this.selectedYearMonth));
          if (isMatchingMonth) {
            if (this.hasUnsavedFleetMonthlyGrid) {
              this.hasRemoteConflict = true;
              this.toast.show('warning', '⚠️ تقویم ماهانه ناوگان توسط کاربر دیگری تغییر یافت.');
            } else {
              this.refreshFleetMonthlyGridSilently();
            }
          }
        }
      }
    });

    let isFirstConnection = true;
    this.wsConnectedSub = this.wsService.connected$.subscribe(isConnected => {
      if (isConnected) {
        if (!isFirstConnection) {
          if (this.activeMode === 'daily') {
            this.refreshVehicleMatrixSilently(true);
          } else if (this.activeMode === 'monthly_grid') {
            this.refreshFleetMonthlyGridSilently(true);
          }
        }
        isFirstConnection = false;
      }
    });
  }

  // --- ۱. ماتریس ثبت روزانه سرویس‌های ناوگان (Guardian G1 Enforced) ---
  loadVehicleMatrix(): void {
    if (!this.selectedDateShamsi || !this.selectedSectionId) return;
    this.isVehicleLoading = true;
    this.personnelApi.getVehicleMatrix(this.selectedWarehouseId, this.selectedDateShamsi, {
      status: this.fleetStatusFilter,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project
    }).subscribe({
      next: res => {
        this.vehicleRows = (res.rows || []).map(r => ({ ...r, _isDirty: false }));
        this.isVehicleLoading = false;
        this.hasUnsavedChanges = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isVehicleLoading = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در بارگذاری ماتریس روزانه ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  refreshVehicleMatrixSilently(forceFresh = true): void {
    if (!this.selectedDateShamsi || !this.selectedSectionId) return;
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    this.personnelApi.getVehicleMatrix(this.selectedWarehouseId, this.selectedDateShamsi, {
      context,
      status: this.fleetStatusFilter,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project
    }).subscribe({
      next: res => {
        const newRows = res.rows || [];
        const vMap = new Map<number, VehicleMatrixRow>();
        newRows.forEach(r => vMap.set(r.vehicle_id, r));

        this.vehicleRows = this.vehicleRows.filter(r => vMap.has(r.vehicle_id));

        this.vehicleRows.forEach(r => {
          const updated = vMap.get(r.vehicle_id);
          if (updated && !r._isDirty) {
            r.trip_count = updated.trip_count;
            r.unit_rate = updated.unit_rate;
            r.total_amount = updated.total_amount;
            r.dispatch_reference = updated.dispatch_reference;
            r.origin_destination = updated.origin_destination;
            r.notes = updated.notes;
            r.warehouse_name = updated.warehouse_name;
            r.is_existing = updated.is_existing;
            r.is_active = updated.is_active;
          }
        });

        const existingIds = new Set(this.vehicleRows.map(r => r.vehicle_id));
        newRows.forEach(nr => {
          if (!existingIds.has(nr.vehicle_id)) {
            this.vehicleRows.push({ ...nr, _isDirty: false });
          }
        });

        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onFleetCellChange(row: FleetMatrixRow): void {
    row._isDirty = true;
    row.total_amount = (Number(row.trip_count) || 0) * (Number(row.unit_rate) || 0);
    this.hasUnsavedChanges = true;
  }

  saveVehicleMatrix(): void {
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا یک بخش کارگاهی را انتخاب نمایید.');
      return;
    }

    const invalidInactive = this.vehicleRows.find(r => r.is_active === false && Number(r.trip_count) > 0);
    if (invalidInactive) {
      this.toast.show('error', `ثبت کارکرد برای خودروی غیرفعال (${invalidInactive.driver_name}) مجاز نیست.`);
      return;
    }

    this.isSavingVehicles = true;
    const payload = {
      warehouse_id: this.selectedWarehouseId,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project || null,
      date_shamsi: this.selectedDateShamsi,
      client_tab_id: this.wsService.tabId,
      items: this.vehicleRows.map(r => ({
        vehicle_id: r.vehicle_id,
        trip_count: Number(r.trip_count) || 0,
        unit_rate: Number(r.unit_rate) || Number(r.default_rate) || 0,
        dispatch_reference: r.dispatch_reference || '',
        origin_destination: r.origin_destination || '',
        notes: r.notes || ''
      }))
    };

    this.personnelApi.saveVehicleTripsBulk(payload).subscribe({
      next: res => {
        this.isSavingVehicles = false;
        this.hasUnsavedChanges = false;
        this.vehicleRows.forEach(r => {
          r.is_existing = true;
          r._isDirty = false;
        });
        this.toast.show('success', res.message || 'اطلاعات تردد ناوگان با موفقیت ذخیره شد');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSavingVehicles = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در ذخیره تردد ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  // --- ۲. تقویم ۳۱ روزه ماهانه ناوگان (31-Day Monthly Grid) ---
  loadFleetMonthlyGrid(): void {
    if (!this.selectedYearMonth || !this.selectedSectionId) return;
    this.isFleetMonthlyGridLoading = true;
    this.personnelApi.getVehicleMonthlyGrid(this.selectedWarehouseId, this.selectedYearMonth, {
      status: this.fleetStatusFilter,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project
    }).subscribe({
      next: res => {
        this.fleetMonthlyGridRows = res.rows || [];
        this.monthName = res.month_name || '';
        this.daysInMonth = res.days_in_month || 31;
        this.monthlyGridDays = (res.days_meta || []) as any;
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';
        this.isFleetMonthlyGridLoading = false;
        this.hasUnsavedFleetMonthlyGrid = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isFleetMonthlyGridLoading = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در بارگذاری تقویم ماهانه ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  refreshFleetMonthlyGridSilently(forceFresh = true): void {
    if (!this.selectedYearMonth || !this.selectedSectionId) return;
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    this.personnelApi.getVehicleMonthlyGrid(this.selectedWarehouseId, this.selectedYearMonth, {
      context,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project
    }).subscribe({
      next: res => {
        this.fleetMonthlyGridRows = res.rows || [];
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  saveFleetMonthlyGrid(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل شده است و امکان ذخیره وجود ندارد.');
      return;
    }
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'بخش کارگاهی مشخص نشده است.');
      return;
    }

    this.isSavingFleetMonthlyGrid = true;
    const items: any[] = [];
    this.fleetMonthlyGridRows.forEach(row => {
      row.days.forEach(d => {
        items.push({
          vehicle_id: row.vehicle_id,
          day: d.day,
          trip_count: Number(d.trip_count) || 0,
          unit_rate: Number(d.unit_rate) || Number(row.default_rate) || 0,
          dispatch_reference: d.dispatch_reference || '',
          origin_destination: d.origin_destination || '',
          notes: d.notes || ''
        });
      });
    });

    this.personnelApi.saveVehicleMonthlyGridBulk({
      warehouse_id: this.selectedWarehouseId,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project || null,
      year_month: this.selectedYearMonth,
      client_tab_id: this.wsService.tabId,
      items
    }).subscribe({
      next: res => {
        this.isSavingFleetMonthlyGrid = false;
        this.hasUnsavedFleetMonthlyGrid = false;
        this.toast.show('success', res.message || 'تقویم ماهانه ناوگان با موفقیت ذخیره شد');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSavingFleetMonthlyGrid = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در ذخیره تقویم ماهانه ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  // --- ۳. مودال جزئیات روز خودرو در تقویم ماهانه (Fleet Day Detail Modal) ---
  openFleetDayDetailModal(row: VehicleMonthlyGridRow, dayItem: VehicleMonthlyGridDay): void {
    if (row.is_active === false) {
      this.toast.show('warning', `ثبت کارکرد برای خودروی غیرفعال (${row.driver_name}) مجاز نیست.`);
      return;
    }
    if (this.isPeriodLocked) {
      this.toast.show('info', 'این دوره قفل است و شیت فقط‌خواندنی می‌باشد.');
      return;
    }
    this.selectedFleetDayDetailRow = row;
    this.selectedFleetDayDetailItem = dayItem;
    this.fleetDayDetailTripCount = dayItem.trip_count || 0;
    this.fleetDayDetailUnitRate = dayItem.unit_rate || row.default_rate || 0;
    this.fleetDayDetailDispatchRef = dayItem.dispatch_reference || '';
    this.fleetDayDetailOrigDest = dayItem.origin_destination || '';
    this.fleetDayDetailNotes = dayItem.notes || '';
    this.isFleetDayDetailModalOpen = true;
  }

  saveFleetDayDetail(): void {
    if (!this.selectedFleetDayDetailRow || !this.selectedFleetDayDetailItem) return;

    if (this.selectedFleetDayDetailRow.is_active === false && Number(this.fleetDayDetailTripCount) > 0) {
      this.toast.show('error', `ثبت کارکرد برای خودروی غیرفعال (${this.selectedFleetDayDetailRow.driver_name}) مجاز نیست.`);
      return;
    }

    const vId = this.selectedFleetDayDetailRow.vehicle_id;
    const day = this.selectedFleetDayDetailItem.day;
    const activeRow = this.fleetMonthlyGridRows.find(r => r.vehicle_id === vId) || this.selectedFleetDayDetailRow;
    const activeItem = activeRow.days.find(d => d.day === day) || this.selectedFleetDayDetailItem;

    activeItem.trip_count = Number(this.fleetDayDetailTripCount) || 0;
    activeItem.unit_rate = Number(this.fleetDayDetailUnitRate) || 0;
    activeItem.total_amount = activeItem.trip_count * activeItem.unit_rate;
    activeItem.dispatch_reference = this.fleetDayDetailDispatchRef;
    activeItem.origin_destination = this.fleetDayDetailOrigDest;
    activeItem.notes = this.fleetDayDetailNotes;
    activeItem.is_existing = activeItem.trip_count > 0;

    let totalTrips = 0;
    let totalAmount = 0;
    let activeDays = 0;
    activeRow.days.forEach(d => {
      totalTrips += d.trip_count;
      if (activeRow.ownership_type !== 'company') {
        totalAmount += d.total_amount;
      }
      if (d.trip_count > 0) activeDays++;
    });
    activeRow.total_trips = totalTrips;
    activeRow.total_amount = totalAmount;
    activeRow.active_days = activeDays;

    this.isFleetDayDetailModalOpen = false;

    this.personnelApi.updateVehicleDayTrip({
      vehicle_id: vId,
      warehouse_id: this.selectedWarehouseId,
      section_id: this.selectedSectionId,
      project_id: this.selectedSection?.project || null,
      date_shamsi: activeItem.date_shamsi,
      trip_count: activeItem.trip_count,
      unit_rate: activeItem.unit_rate,
      dispatch_reference: activeItem.dispatch_reference,
      origin_destination: activeItem.origin_destination,
      notes: activeItem.notes,
      client_tab_id: this.wsService.tabId
    }).subscribe({
      next: () => {
        this.toast.show('success', 'تردد روزانه خودرو با موفقیت ثبت شد');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در ثبت تردد روزانه');
      }
    });
  }

  // --- ۴. مودال پیست هوشمند اکسل برای ناوگان (Smart Excel Paste) ---
  openFleetExcelPasteModal(): void {
    this.fleetExcelPasteText = '';
    this.fleetExcelParsedRows = [];
    this.isFleetExcelPasteModalOpen = true;
  }

  parseFleetExcelPaste(): void {
    if (!this.fleetExcelPasteText.trim()) {
      this.fleetExcelParsedRows = [];
      return;
    }
    const lines = this.fleetExcelPasteText.trim().split('\n');
    const parsed: any[] = [];
    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length === 0 || !parts[0]) continue;
      const identifier = parts[0];
      const tripCount = parseInt(parts[1] || '1', 10) || 0;
      const unitRate = parseFloat(parts[2] || '0') || 0;
      const dispatchRef = parts[3] || '';
      const origDest = parts[4] || '';
      const notes = parts[5] || '';

      const matched = this.vehicleRows.find(v =>
        (v.plate_number && v.plate_number.includes(identifier)) ||
        (v.driver_name && v.driver_name.includes(identifier))
      );

      parsed.push({
        identifier,
        trip_count: tripCount,
        unit_rate: unitRate,
        dispatch_reference: dispatchRef,
        origin_destination: origDest,
        notes,
        matchedRow: matched
      });
    }
    this.fleetExcelParsedRows = parsed;
  }

  applyFleetExcelPaste(): void {
    let appliedCount = 0;
    let skippedInactive = 0;
    this.fleetExcelParsedRows.forEach(p => {
      if (p.matchedRow) {
        if (p.matchedRow.is_active === false) {
          skippedInactive++;
          return;
        }
        p.matchedRow.trip_count = p.trip_count;
        if (p.unit_rate > 0) p.matchedRow.unit_rate = p.unit_rate;
        if (p.dispatch_reference) p.matchedRow.dispatch_reference = p.dispatch_reference;
        if (p.origin_destination) p.matchedRow.origin_destination = p.origin_destination;
        if (p.notes) p.matchedRow.notes = p.notes;
        p.matchedRow._isDirty = true;
        p.matchedRow.total_amount = (p.matchedRow.trip_count || 0) * (p.matchedRow.unit_rate || 0);
        appliedCount++;
      }
    });
    this.isFleetExcelPasteModalOpen = false;
    this.hasUnsavedChanges = true;
    let msg = `${appliedCount} ردیف ناوگان از اکسل اعمال شد`;
    if (skippedInactive > 0) {
      msg += ` (${skippedInactive} ردیف غیرفعال نادیده گرفته شد)`;
    }
    this.toast.show('success', msg);
    this.cdr.detectChanges();
  }

  // --- خروجی و ورودی فایل اکسل ماهانه ناوگان ---
  downloadFleetMonthlyExcel(): void {
    if (!this.selectedYearMonth) return;
    const url = this.personnelApi.getFleetMonthlyExcelDownloadUrl(this.selectedWarehouseId, this.selectedYearMonth, this.selectedSectionId);
    window.open(url, '_blank');
  }

  onFleetExcelFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل شده است و امکان بارگذاری اکسل وجود ندارد.');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (this.selectedWarehouseId) formData.append('warehouse_id', this.selectedWarehouseId.toString());
    if (this.selectedSectionId) formData.append('section_id', this.selectedSectionId.toString());
    if (this.selectedYearMonth) formData.append('year_month', this.selectedYearMonth);

    this.toast.show('info', 'در حال پردازش فایل اکسل ناوگان...');
    this.personnelApi.importFleetMonthlyExcel(formData).subscribe({
      next: res => {
        this.toast.show('success', res.message || 'فایل اکسل با موفقیت بارگذاری شد');
        this.loadFleetMonthlyGrid();
        event.target.value = '';
      },
      error: (err: any) => {
        this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در بارگذاری فایل اکسل');
        event.target.value = '';
      }
    });
  }

  // --- ۵. برگه چاپی رسمی ناوگان در قطع A4 افقی ---
  openFleetPrintModal(): void {
    const now = new Date();
    this.fleetPrintTimestamp = now.toLocaleDateString('fa-IR') + ' ' + now.toLocaleTimeString('fa-IR');
    this.isFleetPrintModalOpen = true;
  }

  closeFleetPrintModal(): void {
    this.isFleetPrintModalOpen = false;
  }

  printFleetSheet(): void {
    window.print();
  }

  get totalFleetMonthlyTrips(): number {
    return this.fleetMonthlyGridRows.reduce((acc, row) => acc + (row.total_trips || 0), 0);
  }

  get totalFleetMonthlyAmount(): number {
    return this.fleetMonthlyGridRows.reduce((acc, row) => acc + (row.ownership_type !== 'company' ? (row.total_amount || 0) : 0), 0);
  }

  // --- ۶. پرونده رانندگان و ناوگان (Driver & Vehicle Profile Modal) ---
  get filteredBanks(): IranianBankInfo[] {
    if (!this.bankSearchQuery || !this.bankSearchQuery.trim()) {
      return this.iranianBanks;
    }
    const q = this.bankSearchQuery.trim().toLowerCase();
    return this.iranianBanks.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.shortName.toLowerCase().includes(q) ||
      b.code.includes(q)
    );
  }

  selectBankFromDropdown(bank: IranianBankInfo, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.onBankSelect(bank.name);
    this.isBankDropdownOpen = false;
    this.bankSearchQuery = '';
  }

  onShebaInput(event: any): void {
    if (this._isSyncingBank) return;
    this._isSyncingBank = true;
    try {
      const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
      const digits = extractShebaDigits(rawVal);
      const res = validateSheba(digits);
      this.shebaValidationResult = res;
      this.shebaDigitsDisplay = res.formattedDigits || digits;
      this.selectedVehicleProfile.sheba_number = res.rawSheba;
      if (res.bank) {
        this.selectedVehicleProfile.bank_name = res.bank.name;
      }
      if (res.accountNumber) {
        this.selectedVehicleProfile.account_number = res.accountNumber;
      }
      if (event?.target) {
        event.target.value = this.shebaDigitsDisplay;
      }
    } finally {
      this._isSyncingBank = false;
    }
    this.cdr.detectChanges();
  }

  onAccountNumberInput(event: any): void {
    if (this._isSyncingBank) return;
    const rawVal = typeof event === 'string' ? event : (event?.target?.value || '');
    const cleanAcc = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                           .replace(/[٠-٩]/g, (d: string) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                           .replace(/\D/g, '')
                           .substring(0, 18);
    this.selectedVehicleProfile.account_number = cleanAcc;
    if (event?.target) {
      event.target.value = cleanAcc;
    }

    const accValidation = validateAccountNumber(cleanAcc);
    if (accValidation.isValid && this.selectedVehicleProfile.bank_name) {
      const generated = generateShebaFromAccount(this.selectedVehicleProfile.bank_name, cleanAcc);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.selectedVehicleProfile.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.detectChanges();
  }

  onAccountNumberPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onAccountNumberInput(pasted);
  }

  onAccountNumberCopy(event: ClipboardEvent): void {
    const acc = this.selectedVehicleProfile.account_number || '';
    if (acc && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', acc);
      this.isAccountCopied = true;
      setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  onBankSelect(bankName: string): void {
    this.selectedVehicleProfile.bank_name = bankName;
    const accValidation = validateAccountNumber(this.selectedVehicleProfile.account_number);
    if (accValidation.isValid && bankName) {
      const generated = generateShebaFromAccount(bankName, this.selectedVehicleProfile.account_number);
      if (generated) {
        this._isSyncingBank = true;
        try {
          const res = validateSheba(generated);
          this.shebaValidationResult = res;
          this.shebaDigitsDisplay = res.formattedDigits;
          this.selectedVehicleProfile.sheba_number = res.rawSheba;
        } finally {
          this._isSyncingBank = false;
        }
      }
    }
    this.cdr.detectChanges();
  }

  convertAccountToShebaNow(): void {
    if (!this.selectedVehicleProfile.bank_name) {
      this.toast.show('warning', 'لطفاً ابتدا بانک عامل را انتخاب نمایید.');
      return;
    }
    const accValidation = validateAccountNumber(this.selectedVehicleProfile.account_number);
    if (!accValidation.isValid) {
      this.toast.show('warning', accValidation.errorMessage || 'شماره حساب معتبر نیست.');
      return;
    }
    const generated = generateShebaFromAccount(this.selectedVehicleProfile.bank_name, this.selectedVehicleProfile.account_number);
    if (generated) {
      this.onShebaInput(generated);
      this.toast.show('success', `شماره شبا با موفقیت بر اساس بانک ${this.selectedVehicleProfile.bank_name} تولید شد.`);
    } else {
      this.toast.show('error', 'امکان تولید شبا برای این ساختار شماره حساب وجود ندارد.');
    }
  }

  onShebaPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    this.onShebaInput(pasted);
  }

  onShebaCopy(event: ClipboardEvent): void {
    const rawSheba = this.selectedVehicleProfile.sheba_number || '';
    const cleanSheba = rawSheba.toString().trim().toUpperCase().replace(/^IR/i, '');
    if (cleanSheba && event.clipboardData) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', cleanSheba);
      this.isShebaCopied = true;
      this.toast.show('success', 'شماره شبا (بدون IR) کپی شد: ' + cleanSheba);
      setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2000);
      this.cdr.detectChanges();
    }
  }

  copyShebaToClipboard(): void {
    const rawSheba = this.selectedVehicleProfile.sheba_number;
    const sheba = rawSheba ? rawSheba.toString().trim().toUpperCase().replace(/^IR/i, '') : '';
    if (sheba) {
      navigator.clipboard.writeText(sheba).then(() => {
        this.isShebaCopied = true;
        this.toast.show('success', 'شماره شبا (بدون IR) کپی شد: ' + sheba);
        setTimeout(() => { this.isShebaCopied = false; this.cdr.detectChanges(); }, 2500);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('error', 'عدم دسترسی به حافظه موقت سیستم.');
      });
    }
  }

  copyAccountNumberToClipboard(): void {
    const acc = this.selectedVehicleProfile.account_number || this.shebaValidationResult?.accountNumber;
    if (acc) {
      navigator.clipboard.writeText(acc).then(() => {
        this.isAccountCopied = true;
        this.toast.show('success', `شماره حساب (${acc}) کپی شد.`);
        setTimeout(() => { this.isAccountCopied = false; this.cdr.detectChanges(); }, 2500);
        this.cdr.detectChanges();
      }).catch(() => {
        this.toast.show('error', 'عدم دسترسی به حافظه موقت.');
      });
    }
  }

  openNewVehicleProfileModal(): void {
    const queryParams: any = { new: 'true' };
    if (this.selectedSectionId) {
      queryParams.section_id = this.selectedSectionId;
    }
    this.router.navigate(['/app/finance/employee-new-vehicle'], { queryParams });
  }

  openEditVehicleProfileModal(vehicleId: number): void {
    const queryParams: any = { edit: vehicleId };
    if (this.selectedSectionId) {
      queryParams.section_id = this.selectedSectionId;
    }
    this.router.navigate(['/app/finance/employee-new-vehicle'], { queryParams });
  }



  // --- ۷. لاگ‌های ممیزی ناوگان (Fleet Audit Logs Modal) ---
  openFleetAuditLogs(vehicleId?: number): void {
    this.isLoadingFleetAuditLogs = true;
    this.isFleetAuditLogsModalOpen = true;
    this.personnelApi.getVehicleTripAuditLogs({
      vehicle_id: vehicleId,
      year_month: this.selectedYearMonth,
      section_id: this.selectedSectionId || undefined
    }).subscribe({
      next: (logs: VehicleTripAuditLog[]) => {
        this.fleetAuditLogs = logs || [];
        this.isLoadingFleetAuditLogs = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingFleetAuditLogs = false;
        this.toast.show('error', 'خطا در واکشی تاریخچه تردد ناوگان');
        this.cdr.detectChanges();
      }
    });
  }

  closeFleetAuditLogs(): void {
    this.isFleetAuditLogsModalOpen = false;
  }

  // --- کمکی‌های تاریخ و تقویم ---
  goToPrevDay(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.selectedDateShamsi, -1);
    this.syncYearMonthFromDailyDate();
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  goToNextDay(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.selectedDateShamsi, 1);
    this.syncYearMonthFromDailyDate();
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  goToToday(): void {
    this.initDefaultDate();
    this.onFilterChange();
  }

  goToYesterday(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.getTodayShamsi(), -1);
    this.syncYearMonthFromDailyDate();
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  toggleFleetDatePicker(event?: Event): void {
    if (event) event.stopPropagation();
    this.isFleetDatePickerOpen = !this.isFleetDatePickerOpen;
    this.isMonthPickerOpen = false;
    this.cdr.detectChanges();
  }

  openFleetDatePicker(): void {
    this.isFleetDatePickerOpen = true;
    this.isMonthPickerOpen = false;
    this.cdr.detectChanges();
  }

  closeFleetDatePicker(): void {
    this.isFleetDatePickerOpen = false;
    this.cdr.detectChanges();
  }

  onFleetDateInput(event: any): void {
    const rawVal = (event?.target?.value || '').trim();
    if (!rawVal) return;
    const enVal = rawVal.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    const digitsOnly = enVal.replace(/\D/g, '');
    if (digitsOnly.length === 8) {
      const y = digitsOnly.substring(0, 4);
      const m = digitsOnly.substring(4, 6);
      const d = digitsOnly.substring(6, 8);
      const formatted = `${y}/${m}/${d}`;
      this.selectedDateShamsi = formatted;
      this.fleetDateControl.setValue(formatted, { emitEvent: false });
      this.syncYearMonthFromDailyDate();
      this.onFilterChange();
      return;
    }
    if (enVal.includes('/') && enVal.length >= 8) {
      this.selectedDateShamsi = enVal;
      this.syncYearMonthFromDailyDate();
      this.onFilterChange();
    }
  }

  onFleetDateSelect(event: any): void {
    if (!event) return;
    this.closeFleetDatePicker();
    if (event.shamsi) {
      let rawShamsi = event.shamsi.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
      const parts = rawShamsi.split('/');
      if (parts.length === 3) {
        const pad = (n: string) => n.length === 1 ? '0' + n : n;
        rawShamsi = `${parts[0]}/${pad(parts[1])}/${pad(parts[2])}`;
      }
      this.selectedDateShamsi = rawShamsi;
      this.fleetDateControl.setValue(rawShamsi, { emitEvent: false });
      this.syncYearMonthFromDailyDate();
      this.onFilterChange();
    } else if (event.gregorian) {
      const d = new Date(event.gregorian);
      const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const pad = (n: number) => n < 10 ? '0' + n : String(n);
      const formatted = `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
      this.selectedDateShamsi = formatted;
      this.fleetDateControl.setValue(formatted, { emitEvent: false });
      this.syncYearMonthFromDailyDate();
      this.onFilterChange();
    }
  }

  private syncYearMonthFromDailyDate(): void {
    if (this.selectedDateShamsi) {
      const parts = this.selectedDateShamsi.split('/');
      if (parts.length >= 2) {
        this.selectedYearMonth = `${parts[0]}/${parts[1]}`;
        this.fiscalYear = parts[0];
      }
    }
  }

  private shiftShamsiDay(dateStr: string, deltaDays: number): string {
    try {
      const parts = dateStr.split('/').map(p => parseInt(p, 10));
      if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return dateStr;
      const g = jalaliToGregorian(parts[0], parts[1], parts[2]);
      const d = new Date(g.gy, g.gm - 1, g.gd);
      d.setDate(d.getDate() + deltaDays);
      const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const pad = (n: number) => n < 10 ? '0' + n : String(n);
      return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
    } catch {
      return dateStr;
    }
  }

  private getTodayShamsi(): string {
    const d = new Date();
    const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const pad = (n: number) => n < 10 ? '0' + n : String(n);
    return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
  }

  toggleMonthPicker(event?: Event): void {
    if (event) event.stopPropagation();
    this.isMonthPickerOpen = !this.isMonthPickerOpen;
    this.isFleetDatePickerOpen = false;
  }

  selectMonth(monthNum: number): void {
    const rawYear = this.selectedYearMonth ? this.selectedYearMonth.split('/')[0] : '1405';
    const year = rawYear.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    const mmStr = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
    this.selectedYearMonth = `${year}/${mmStr}`;
    this.fiscalYear = year;
    const curDay = this.selectedDateShamsi ? (this.selectedDateShamsi.split('/')[2] || '01') : '01';
    this.selectedDateShamsi = `${year}/${mmStr}/${curDay}`;
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.isMonthPickerOpen = false;
    this.onFilterChange();
  }

  goToPrevMonth(): void {
    const parts = (this.selectedYearMonth || '1405/04').split('/');
    let y = parseInt(parts[0], 10) || 1405;
    let m = parseInt(parts[1], 10) || 4;
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
    const mmStr = m < 10 ? `0${m}` : `${m}`;
    this.selectedYearMonth = `${y}/${mmStr}`;
    this.fiscalYear = String(y);
    const curDay = this.selectedDateShamsi ? (this.selectedDateShamsi.split('/')[2] || '01') : '01';
    this.selectedDateShamsi = `${y}/${mmStr}/${curDay}`;
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  goToNextMonth(): void {
    const parts = (this.selectedYearMonth || '1405/04').split('/');
    let y = parseInt(parts[0], 10) || 1405;
    let m = parseInt(parts[1], 10) || 4;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    const mmStr = m < 10 ? `0${m}` : `${m}`;
    this.selectedYearMonth = `${y}/${mmStr}`;
    this.fiscalYear = String(y);
    const curDay = this.selectedDateShamsi ? (this.selectedDateShamsi.split('/')[2] || '01') : '01';
    this.selectedDateShamsi = `${y}/${mmStr}/${curDay}`;
    this.fleetDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  reloadWithRemote(): void {
    this.hasRemoteConflict = false;
    this.hasUnsavedChanges = false;
    this.hasUnsavedFleetMonthlyGrid = false;
    if (this.activeMode === 'daily') {
      this.loadVehicleMatrix();
    } else {
      this.loadFleetMonthlyGrid();
    }
    this.toast.show('info', 'اطلاعات ناوگان با موفقیت از سرور بازخوانی شد');
  }

  dismissRemoteConflict(): void {
    this.hasRemoteConflict = false;
  }

  // --- ارگونومی کیبورد در جدول (Keyboard Ergonomics) ---
  onFleetGridKeydown(event: KeyboardEvent, colType: string, rowIndex: number): void {
    const key = event.key;
    if (key === 'ArrowDown') {
      event.preventDefault();
      const nextEl = document.getElementById(`input-${colType}-${rowIndex + 1}`);
      if (nextEl) {
        (nextEl as HTMLElement).focus();
        (nextEl as HTMLInputElement).select?.();
      }
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      const prevEl = document.getElementById(`input-${colType}-${rowIndex - 1}`);
      if (prevEl) {
        (prevEl as HTMLElement).focus();
        (prevEl as HTMLInputElement).select?.();
      }
    } else if (key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    }
  }

  // جمع کل سرویس‌ها در ماتریس روزانه
  get totalDailyTrips(): number {
    return this.vehicleRows.reduce((acc, r) => acc + (Number(r.trip_count) || 0), 0);
  }

  get totalDailyAmount(): number {
    return this.vehicleRows.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
  }

  getSelectedWarehouseName(): string {
    if (!this.selectedWarehouseId) return 'همه انبارهای بخش';
    const wh = this.warehouses.find(w => w.id === this.selectedWarehouseId);
    return wh ? wh.name : 'انبار مشخص‌شده';
  }
}
