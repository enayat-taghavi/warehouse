import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpContext } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SKIP_OFFLINE } from '../../../../core/interceptors/offline.interceptor';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.component';
import { PersonnelApiService } from '../../../../core/api/personnel-api.service';
import { WarehouseHttpService } from '../../../../core/http/warehouse-http.service';
import { WebSocketService } from '../../../../core/http/websocket.service';
import {
  ProjectSection,
  AttendanceMatrixRow,
  MonthlyGridDayMeta,
  MonthlyGridPersonnelDay,
  MonthlyGridRow,
  MonthlyGridResponse,
  AttendanceAnomaly
} from '../../../../core/models/personnel.model';
import { jalaliToGregorian, gregorianToJalali } from '../../../../core/utils/date-utils';
import { NgPersianDatepickerModule } from 'ng-persian-datepicker';
import { SvgIconDirective } from '../../../../shared/icons/svg-icon.directive';

@Component({
  selector: 'app-employee-attendance-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NgPersianDatepickerModule, SvgIconDirective],
  templateUrl: './employee-attendance.html',
  styleUrl: './employee-attendance.css'
})
export class EmployeeAttendanceHubComponent implements OnInit, OnDestroy {
  // Sub-view modes: 'daily' (ثبت ماتریسی روزانه) | 'monthly_grid' (تقویم ۳۱ روزه ماهانه)
  activeMode: 'daily' | 'monthly_grid' = 'daily';

  // Section & Scope Management (Guardian G1)
  mySections: ProjectSection[] = [];
  selectedSectionId: number | null = null;
  selectedSection: ProjectSection | null = null;
  isLoadingSections = false;

  // Warehouses (Optional tag assignment per row)
  warehouses: any[] = [];
  selectedWarehouseId: number | null = null;
  isWarehouseMenuOpen = false;

  // Date State
  selectedDateShamsi = '';
  selectedYearMonth = '';
  fiscalYear = '1405';
  isAttendanceDatePickerOpen = false;
  attendanceDateControl = new FormControl('');
  searchQuery = '';

  // Persian Month Popover
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

  // Daily Matrix Attendance
  attendanceRows: AttendanceMatrixRow[] = [];
  filteredAttendanceRows: AttendanceMatrixRow[] = [];
  isAttendanceLoading = false;
  isSavingAttendance = false;
  isPeriodLocked = false;
  periodStatus = 'OPEN';
  hasUnsavedChanges = false;
  hasRemoteConflict = false;

  // Row selection in matrix
  selectedPersonnelIds = new Set<number>();
  selectAllChecked = false;

  // Bulk Hours Modal
  isBulkHoursModalOpen = false;
  bulkHoursScope: 'selected' | 'present' | 'all' = 'selected';
  bulkEffectiveHours = 10;
  bulkOvertimeHours = 0;
  bulkAdvancePayment: number | null = null;
  bulkStatusOption: '' | 'PRESENT_10H' | 'HALF_5H' = '';
  bulkNotes = '';

  // Excel Smart Paste Modal
  isExcelPasteModalOpen = false;
  excelPasteText = '';
  excelParsedRows: Array<{
    national_code: string;
    full_name: string;
    status: string;
    effective_hours: number;
    overtime_hours: number;
    advance_payment: number;
    notes: string;
    matchedRow?: AttendanceMatrixRow;
  }> = [];

  // Direct Excel Upload
  isImportingExcel = false;
  @ViewChild('excelFileInput') excelFileInput?: ElementRef<HTMLInputElement>;

  // 31-Day Monthly Grid State
  monthlyGridRows: MonthlyGridRow[] = [];
  monthlyGridDays: MonthlyGridDayMeta[] = [];
  monthName = '';
  daysInMonth = 31;
  isMonthlyGridLoading = false;
  isSavingMonthlyGrid = false;
  hasUnsavedMonthlyGrid = false;
  anomalies: AttendanceAnomaly[] = [];
  showAnomalies = false;
  highlightPersonnelId: number | null = null;
  isExportingMonthlyExcel = false;
  isImportingMonthlyExcel = false;
  isExcelImportModalOpen = false;
  selectedExcelImportFile: File | null = null;

  // Day Detail Modal (Monthly Grid)
  isDayDetailModalOpen = false;
  selectedDayDetailRow: MonthlyGridRow | null = null;
  selectedDayDetailItem: MonthlyGridPersonnelDay | null = null;
  dayDetailStatus = 'PRESENT_10H';
  dayDetailEffectiveHours = 10;
  dayDetailOvertimeHours = 0;
  dayDetailIsFridayWork = false;
  dayDetailNotes = '';

  // Date Range Modal (Monthly Grid)
  isRangeModalOpen = false;
  rangeStartDay = 1;
  rangeEndDay = 31;
  rangeTargetScope: 'all' | 'selected' = 'all';
  rangeStatus = 'PRESENT_10H';
  rangeEffectiveHours = 10;
  rangeOvertimeHours = 0;
  rangeSkipFridays = true;
  rangeOnlyEmptyDays = true;

  // Printable Timesheet Modal
  isPrintModalOpen = false;

  // Workflow Submit Modal
  isSubmitModalOpen = false;
  submitNotes = '';
  isSubmittingWorkflow = false;

  // WebSocket Subscriptions
  private wsSub?: Subscription;
  private wsConnectedSub?: Subscription;

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

  // --- تنظیم تاریخ پیش‌فرض ---
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
      this.attendanceDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    } catch {
      this.selectedDateShamsi = '1405/04/01';
      this.selectedYearMonth = '1405/04';
      this.fiscalYear = '1405';
      this.attendanceDateControl.setValue('1405/04/01', { emitEvent: false });
    }
  }

  // --- بارگذاری انبارها (جهت تگ‌گذاری سطرها) ---
  loadWarehouses(): void {
    this.whService.getAll().subscribe({
      next: (whs: any[]) => {
        this.warehouses = whs || [];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  // --- بارگذاری بخش‌های مجاز کاربر (Guardian G1) ---
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
        this.toast.show('error', 'خطا در واکشی بخش‌های مجاز کارمند');
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

  // --- اتصالات وب‌سوکت بلادرنگ ---
  private setupWebSocket(): void {
    this.wsSub = this.wsService.notifications$.subscribe(notif => {
      if (!notif) return;

      // جلوگیری از اکو روی همین تب
      if (notif.client_tab_id && notif.client_tab_id === this.wsService.tabId) {
        return;
      }

      if (notif.type === 'attendance_updated' || notif.event === 'attendance_updated') {
        // فیلتر بخش در صورت تطابق
        if (this.selectedSectionId && notif.section_id && Number(notif.section_id) !== this.selectedSectionId) {
          return;
        }

        if (this.activeMode === 'daily') {
          if (notif.date_shamsi === this.selectedDateShamsi || (notif.year_month && notif.year_month === this.selectedYearMonth)) {
            if (this.hasUnsavedChanges) {
              this.hasRemoteConflict = true;
              this.toast.show('warning', '⚠️ کارکرد پرسنل توسط همکار دیگری تغییر یافت. شما تغییرات ذخیره‌نشده دارید.');
            } else {
              this.refreshAttendanceMatrixSilently();
            }
          }
        } else if (this.activeMode === 'monthly_grid') {
          const isMatchingMonth = notif.year_month === this.selectedYearMonth ||
            (notif.date_shamsi && notif.date_shamsi.startsWith(this.selectedYearMonth));
          if (isMatchingMonth) {
            if (this.hasUnsavedMonthlyGrid) {
              this.hasRemoteConflict = true;
              this.toast.show('warning', '⚠️ شیت ماهانه توسط کاربر دیگری تغییر یافت.');
            } else {
              this.refreshMonthlyGridSilently();
            }
          }
        }
      }
    });

    // فرآیند Catch-up پس از قطع و وصل وب‌سوکت
    let isFirstConnection = true;
    this.wsConnectedSub = this.wsService.connected$.subscribe(isConnected => {
      if (isConnected) {
        if (!isFirstConnection) {
          if (this.activeMode === 'daily') {
            this.refreshAttendanceMatrixSilently(true);
          } else if (this.activeMode === 'monthly_grid') {
            this.refreshMonthlyGridSilently(true);
          }
        }
        isFirstConnection = false;
      }
    });
  }

  // --- تغییر مد نمایش ---
  setMode(mode: 'daily' | 'monthly_grid'): void {
    this.activeMode = mode;
    this.onFilterChange();
  }

  onFilterChange(): void {
    if (!this.selectedSectionId) {
      this.attendanceRows = [];
      this.filteredAttendanceRows = [];
      this.monthlyGridRows = [];
      this.cdr.detectChanges();
      return;
    }
    if (this.activeMode === 'daily') {
      this.loadAttendanceMatrix();
    } else {
      this.loadMonthlyAttendanceGrid();
    }
  }

  // --- ۱. ماتریس کارکرد روزانه پرسنل (Guardian G1: section_id Enforced) ---
  loadAttendanceMatrix(): void {
    if (!this.selectedDateShamsi || !this.selectedSectionId) return;
    this.isAttendanceLoading = true;
    this.selectedPersonnelIds.clear();
    this.selectAllChecked = false;

    this.personnelApi.getAttendanceMatrix(this.selectedWarehouseId, this.selectedDateShamsi, {
      section_id: this.selectedSectionId
    }).subscribe({
      next: res => {
        this.attendanceRows = (res.rows || []).map((r: any) => ({
          ...r,
          warehouse_id: r.warehouse_id !== undefined && r.warehouse_id !== null ? r.warehouse_id : null
        }));
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';
        this.isAttendanceLoading = false;
        this.hasUnsavedChanges = false;
        this.applySearchFilter();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isAttendanceLoading = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در بارگذاری ماتریس کارکرد روزانه');
        this.cdr.detectChanges();
      }
    });
  }

  refreshAttendanceMatrixSilently(forceFresh = true): void {
    if (!this.selectedDateShamsi || !this.selectedSectionId) return;
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    this.personnelApi.getAttendanceMatrix(this.selectedWarehouseId, this.selectedDateShamsi, {
      context,
      section_id: this.selectedSectionId
    }).subscribe({
      next: res => {
        const newRows: AttendanceMatrixRow[] = (res.rows || []).map((r: any) => ({
          ...r,
          warehouse_id: r.warehouse_id !== undefined && r.warehouse_id !== null ? r.warehouse_id : null
        }));
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';

        const rowMap = new Map<number, AttendanceMatrixRow>();
        newRows.forEach(r => rowMap.set(r.personnel_id, r));

        this.attendanceRows = this.attendanceRows.filter(r => rowMap.has(r.personnel_id));

        this.attendanceRows.forEach(r => {
          const updated = rowMap.get(r.personnel_id);
          if (updated) {
            r.status = updated.status;
            r.effective_hours = updated.effective_hours;
            r.overtime_hours = updated.overtime_hours;
            r.is_friday_work = updated.is_friday_work;
            r.is_mission = updated.is_mission;
            r.advance_payment = updated.advance_payment;
            r.notes = updated.notes;
            r.is_existing = updated.is_existing;
            r.warehouse_id = updated.warehouse_id;
            r.warehouse_name = updated.warehouse_name;
            r.attendance_id = updated.attendance_id;
          }
        });

        const existingIds = new Set(this.attendanceRows.map(r => r.personnel_id));
        newRows.forEach(nr => {
          if (!existingIds.has(nr.personnel_id)) {
            this.attendanceRows.push(nr);
          }
        });

        this.applySearchFilter();
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  applySearchFilter(): void {
    if (!this.searchQuery.trim()) {
      this.filteredAttendanceRows = [...this.attendanceRows];
    } else {
      const q = this.searchQuery.trim().toLowerCase();
      this.filteredAttendanceRows = this.attendanceRows.filter(r =>
        (r.full_name && r.full_name.toLowerCase().includes(q)) ||
        (r.national_code && r.national_code.includes(q)) ||
        (r.job_title && r.job_title.toLowerCase().includes(q))
      );
    }
  }

  onAttendanceCellChange(row: AttendanceMatrixRow): void {
    row._isDirty = true;
    this.hasUnsavedChanges = true;
  }

  // تنظیم وضعیت با ۱ کلیک (همراه با قابلیت Toggle و لغو انتخاب مجدد)
  setAttendanceStatus(row: AttendanceMatrixRow, status: string): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره کارکرد قفل شده و قابل ویرایش نیست');
      return;
    }

    if (row.status === status) {
      row.status = '';
      row.effective_hours = 0;
      row.overtime_hours = 0;
      row.is_friday_work = false;
      row.is_mission = false;
      row._isDirty = true;
      this.hasUnsavedChanges = true;
      this.cdr.detectChanges();
      return;
    }

    row.status = status;
    row._isDirty = true;
    this.hasUnsavedChanges = true;

    const isFriday = this.isSelectedDateFriday;
    if (status === 'PRESENT_10H') {
      row.effective_hours = 10;
      row.is_friday_work = isFriday;
      row.is_mission = false;
    } else if (status === 'HALF_5H') {
      row.effective_hours = 5;
      row.is_friday_work = isFriday;
      row.is_mission = false;
    } else if (status === 'MISSION') {
      row.effective_hours = 10;
      row.overtime_hours = 0;
      row.is_friday_work = false;
      row.is_mission = true;
    } else if (status === 'ABSENT' || status === 'LEAVE') {
      row.effective_hours = 0;
      row.overtime_hours = 0;
      row.is_friday_work = false;
      row.is_mission = false;
    }
    this.cdr.detectChanges();
  }

  // انتخاب دسته‌ای سطرها
  toggleSelectAll(): void {
    this.selectAllChecked = !this.selectAllChecked;
    if (this.selectAllChecked) {
      const targets = this.searchQuery.trim() ? this.filteredAttendanceRows : this.attendanceRows;
      targets.forEach(r => this.selectedPersonnelIds.add(r.personnel_id));
    } else {
      this.selectedPersonnelIds.clear();
    }
  }

  toggleRowSelection(personnelId: number): void {
    if (this.selectedPersonnelIds.has(personnelId)) {
      this.selectedPersonnelIds.delete(personnelId);
    } else {
      this.selectedPersonnelIds.add(personnelId);
    }
    const currentTargetCount = this.searchQuery.trim() ? this.filteredAttendanceRows.length : this.attendanceRows.length;
    this.selectAllChecked = this.selectedPersonnelIds.size === currentTargetCount && currentTargetCount > 0;
  }

  isRowSelected(personnelId: number): boolean {
    return this.selectedPersonnelIds.has(personnelId);
  }

  // اعمال گروهی وضعیت
  setBulkAttendanceStatus(status: 'PRESENT_10H' | 'HALF_5H' | 'ABSENT' | 'LEAVE' | 'MISSION'): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره کارکرد قفل شده و قابل ویرایش نیست');
      return;
    }
    const targetRows = this.selectedPersonnelIds.size > 0
      ? this.attendanceRows.filter(r => this.selectedPersonnelIds.has(r.personnel_id))
      : (this.searchQuery.trim() ? this.filteredAttendanceRows : this.attendanceRows);

    if (targetRows.length === 0) {
      this.toast.show('info', 'هیچ پرسنلی برای تغییر وضعیت یافت نشد');
      return;
    }

    let statusLabel = '';
    const isFriday = this.isSelectedDateFriday;
    targetRows.forEach(r => {
      r.status = status;
      r._isDirty = true;
      if (status === 'PRESENT_10H') {
        r.effective_hours = 10;
        r.overtime_hours = 0;
        r.is_friday_work = isFriday;
        r.is_mission = false;
        statusLabel = isFriday ? 'حاضر (۱۰ ساعت - جمعه‌کاری)' : 'حاضر (۱۰ ساعت)';
      } else if (status === 'HALF_5H') {
        r.effective_hours = 5;
        r.overtime_hours = 0;
        r.is_friday_work = isFriday;
        r.is_mission = false;
        statusLabel = isFriday ? 'نیمه‌وقت (۵ ساعت - جمعه‌کاری)' : 'نیمه‌وقت (۵ ساعت)';
      } else if (status === 'MISSION') {
        r.effective_hours = 10;
        r.overtime_hours = 0;
        r.is_friday_work = false;
        r.is_mission = true;
        statusLabel = 'ماموریت (۱۰ ساعت)';
      } else if (status === 'ABSENT') {
        r.effective_hours = 0;
        r.overtime_hours = 0;
        r.is_friday_work = false;
        r.is_mission = false;
        statusLabel = 'غایب';
      } else if (status === 'LEAVE') {
        r.effective_hours = 0;
        r.overtime_hours = 0;
        r.is_friday_work = false;
        r.is_mission = false;
        statusLabel = 'مرخصی';
      }
    });

    this.hasUnsavedChanges = true;
    const scopeText = this.selectedPersonnelIds.size > 0 ? `${targetRows.length} نفر انتخاب‌شده` : `${targetRows.length} نفر`;
    this.toast.show('success', `${scopeText} به عنوان «${statusLabel}» تنظیم شدند`);
    this.cdr.detectChanges();
  }

  // کپی کارکرد روز قبل (با فیلتر بخش)
  copyFromYesterday(): void {
    if (this.isPeriodLocked || !this.selectedSectionId) return;
    this.isAttendanceLoading = true;
    const yesterdayStr = this.shiftShamsiDay(this.selectedDateShamsi, -1);

    this.personnelApi.getAttendanceMatrix(this.selectedWarehouseId, yesterdayStr, {
      section_id: this.selectedSectionId
    }).subscribe({
      next: res => {
        this.isAttendanceLoading = false;
        const prevRows = res.rows || [];
        if (prevRows.length === 0) {
          this.toast.show('warning', 'اطلاعاتی برای روز قبل در این بخش یافت نشد');
          return;
        }
        let matched = 0;
        prevRows.forEach(pr => {
          const cur = this.attendanceRows.find(r => r.personnel_id === pr.personnel_id);
          if (cur) {
            cur.status = pr.status || '';
            const isZeroHour = (pr.status === 'ABSENT' || pr.status === 'LEAVE' || !pr.status);
            cur.effective_hours = isZeroHour ? 0 : (Number(pr.effective_hours) || 0);
            cur.overtime_hours = isZeroHour ? 0 : (Number(pr.overtime_hours) || 0);
            cur.is_friday_work = !!pr.is_friday_work;
            cur.is_mission = !!pr.is_mission;
            cur.is_existing = !!pr.is_existing;
            cur._isDirty = true;
            matched++;
          }
        });
        this.hasUnsavedChanges = true;
        this.toast.show('success', `اطلاعات کارکرد ${matched} نفر از روز قبل کپی شد`);
        this.cdr.detectChanges();
      },
      error: () => {
        this.isAttendanceLoading = false;
        this.toast.show('error', 'خطا در واکشی اطلاعات روز قبل');
        this.cdr.detectChanges();
      }
    });
  }

  markOfficialHoliday(): void {
    if (this.isPeriodLocked) return;
    const targets = this.selectedPersonnelIds.size > 0
      ? this.attendanceRows.filter(r => this.selectedPersonnelIds.has(r.personnel_id))
      : (this.searchQuery.trim() ? this.filteredAttendanceRows : this.attendanceRows);

    targets.forEach(r => {
      r.status = 'LEAVE';
      r.effective_hours = 0;
      r.overtime_hours = 0;
      r.notes = r.notes ? `${r.notes} (تعطیل رسمی)` : 'تعطیل رسمی';
      r._isDirty = true;
    });
    this.hasUnsavedChanges = true;
    this.toast.show('success', `وضعیت ${targets.length} نفر به تعطیل رسمی تغییر یافت`);
    this.cdr.detectChanges();
  }

  clearDayAttendance(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره کارکرد قفل شده و امکان پاکسازی وجود ندارد');
      return;
    }

    const target = this.selectedPersonnelIds.size > 0
      ? this.attendanceRows.filter(r => this.selectedPersonnelIds.has(r.personnel_id))
      : (this.searchQuery.trim() ? this.filteredAttendanceRows : this.attendanceRows);

    if (target.length === 0) {
      this.toast.show('info', 'هیچ سطری برای پاکسازی انتخاب نشده است');
      return;
    }

    target.forEach(r => {
      r.status = '';
      r.effective_hours = 0;
      r.overtime_hours = 0;
      r.is_friday_work = false;
      r.is_mission = false;
      r.advance_payment = 0;
      r.notes = '';
      r._isDirty = true;
    });

    this.hasUnsavedChanges = true;
    this.applySearchFilter();
    this.toast.show('info', `وضعیت ${target.length} نفر پاکسازی شد. جهت اعمال نهایی در سرور، دکمه «به‌روزرسانی کارکرد» را بزنید.`);
    this.cdr.detectChanges();
  }

  // اعمال گروهی ساعات کارکرد (Bulk Hours Modal)
  openBulkHoursModal(): void {
    if (this.isPeriodLocked) return;
    this.bulkHoursScope = this.selectedPersonnelIds.size > 0 ? 'selected' : 'all';
    this.bulkEffectiveHours = 10;
    this.bulkOvertimeHours = 0;
    this.bulkAdvancePayment = null;
    this.bulkStatusOption = '';
    this.bulkNotes = '';
    this.isBulkHoursModalOpen = true;
  }

  applyBulkHours(): void {
    let targets: AttendanceMatrixRow[] = [];
    const baseRows = this.searchQuery.trim() ? this.filteredAttendanceRows : this.attendanceRows;
    if (this.bulkHoursScope === 'selected') {
      targets = this.attendanceRows.filter(r => this.selectedPersonnelIds.has(r.personnel_id));
    } else if (this.bulkHoursScope === 'present') {
      targets = baseRows.filter(r => r.status === 'PRESENT_10H' || r.status === 'HALF_5H');
    } else {
      targets = baseRows;
    }

    targets.forEach(r => {
      const isAbsentOrLeave = r.status === 'ABSENT' || r.status === 'LEAVE';
      if (this.bulkStatusOption) {
        r.status = this.bulkStatusOption;
        r.effective_hours = this.bulkEffectiveHours;
        r.overtime_hours = this.bulkOvertimeHours;
      } else {
        if (!isAbsentOrLeave) {
          r.effective_hours = this.bulkEffectiveHours;
          r.overtime_hours = this.bulkOvertimeHours;
        }
      }
      if (this.bulkAdvancePayment !== null && this.bulkAdvancePayment !== undefined && this.bulkAdvancePayment >= 0) {
        r.advance_payment = Number(this.bulkAdvancePayment);
      }
      if (this.bulkNotes.trim()) {
        r.notes = this.bulkNotes.trim();
      }
      r._isDirty = true;
    });
    this.hasUnsavedChanges = true;
    this.isBulkHoursModalOpen = false;
    this.toast.show('success', `ساعات کارکرد برای ${targets.length} نفر با موفقیت اعمال شد`);
    this.cdr.detectChanges();
  }

  // پیست هوشمند از اکسل (Excel Smart Paste Modal)
  openExcelPasteModal(): void {
    if (this.isPeriodLocked) return;
    this.excelPasteText = '';
    this.excelParsedRows = [];
    this.isExcelPasteModalOpen = true;
  }

  parseExcelPasteText(): void {
    if (!this.excelPasteText.trim()) {
      this.excelParsedRows = [];
      return;
    }
    const lines = this.excelPasteText.trim().split('\n');
    this.excelParsedRows = [];

    lines.forEach(line => {
      const cols = line.split('\t').map(c => c.trim());
      if (cols.length === 0 || !cols[0]) return;

      const codeOrName = cols[0];
      const matchedRow = this.attendanceRows.find(r =>
        r.national_code === codeOrName ||
        (r.full_name && r.full_name.includes(codeOrName))
      );

      let status = cols[1] || 'PRESENT_10H';
      if (status.includes('حاضر')) status = 'PRESENT_10H';
      else if (status.includes('غایب')) status = 'ABSENT';
      else if (status.includes('مرخصی')) status = 'LEAVE';
      else if (status.includes('ماموریت')) status = 'MISSION';
      else if (status.includes('جمعه')) status = 'FRIDAY_WORK';

      const isZeroHourStatus = (status === 'ABSENT' || status === 'LEAVE');
      const defaultHours = isZeroHourStatus ? 0 : 10;
      const effectiveHours = cols[2] ? parseFloat(cols[2]) : defaultHours;
      const overtimeHours = (cols[3] && !isZeroHourStatus) ? parseFloat(cols[3]) : 0;
      const rawAdv = cols[4] ? parseFloat(cols[4].replace(/,/g, '')) : 0;
      const advancePayment = !isNaN(rawAdv) && rawAdv > 0 ? rawAdv : 0;
      const notes = cols[5] || (isNaN(rawAdv) ? cols[4] : '') || '';

      this.excelParsedRows.push({
        national_code: matchedRow?.national_code || (codeOrName.length === 10 ? codeOrName : ''),
        full_name: matchedRow?.full_name || codeOrName,
        status,
        effective_hours: isNaN(effectiveHours) ? defaultHours : (isZeroHourStatus ? 0 : effectiveHours),
        overtime_hours: isNaN(overtimeHours) ? 0 : (isZeroHourStatus ? 0 : overtimeHours),
        advance_payment: advancePayment,
        notes,
        matchedRow
      });
    });
  }

  applyExcelPaste(): void {
    let appliedCount = 0;
    this.excelParsedRows.forEach(pr => {
      if (pr.matchedRow) {
        if (pr.status) pr.matchedRow.status = pr.status;
        if (pr.effective_hours !== undefined) pr.matchedRow.effective_hours = pr.effective_hours;
        if (pr.overtime_hours !== undefined) pr.matchedRow.overtime_hours = pr.overtime_hours;
        if (pr.advance_payment !== undefined && pr.advance_payment > 0) pr.matchedRow.advance_payment = pr.advance_payment;
        if (pr.notes) pr.matchedRow.notes = pr.notes;
        pr.matchedRow._isDirty = true;
        appliedCount++;
      }
    });

    if (appliedCount > 0) {
      this.hasUnsavedChanges = true;
      this.toast.show('success', `${appliedCount} سطر از اکسل با موفقیت تطبیق و اعمال شد`);
      this.isExcelPasteModalOpen = false;
      this.cdr.detectChanges();
    } else {
      this.toast.show('warning', 'هیچ سطری با پرسنل سیستم تطبیق داده نشد');
    }
  }

  triggerExcelImport(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل است و امکان بارگذاری اکسل وجود ندارد.');
      return;
    }
    this.excelFileInput?.nativeElement.click();
  }

  onExcelFileSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      this.toast.show('warning', 'لطفاً فقط فایل اکسل (.xlsx یا .xls) انتخاب کنید.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    if (this.selectedWarehouseId) {
      formData.append('warehouse_id', this.selectedWarehouseId.toString());
    }
    if (this.selectedSectionId) {
      formData.append('section_id', this.selectedSectionId.toString());
    }
    formData.append('year_month', this.selectedYearMonth);

    this.isImportingExcel = true;
    this.personnelApi.importMonthlyAttendanceExcel(formData).subscribe({
      next: (res: any) => {
        this.isImportingExcel = false;
        const updated = res.updated_count || res.matched_count || res.saved_count || 0;
        this.toast.show('success', `فایل اکسل پردازش شد و کارکرد ${updated} نفر به‌روزرسانی گردید.`);
        if (this.activeMode === 'daily') {
          this.loadAttendanceMatrix();
        } else {
          this.loadMonthlyAttendanceGrid();
        }
        if (this.excelFileInput?.nativeElement) {
          this.excelFileInput.nativeElement.value = '';
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isImportingExcel = false;
        const msg = err.error?.error || err.error?.message || 'خطا در بارگذاری فایل اکسل کارکرد';
        this.toast.show('error', msg);
        if (this.excelFileInput?.nativeElement) {
          this.excelFileInput.nativeElement.value = '';
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ذخیره ماتریس روزانه با تحمیل section_id (Guardian G1)
  saveAttendanceMatrix(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل شده و امکان ذخیره وجود ندارد');
      return;
    }
    if (!this.selectedSectionId) {
      this.toast.show('warning', 'لطفاً ابتدا بخش فعال را انتخاب کنید.');
      return;
    }

    const dirtyRows = this.attendanceRows.filter(r => r._isDirty);
    if (dirtyRows.length === 0) {
      this.hasUnsavedChanges = false;
      this.toast.show('info', 'هیچ تغییر جدیدی برای ذخیره وجود ندارد.');
      return;
    }

    this.isSavingAttendance = true;

    const payload = {
      warehouse_id: this.selectedWarehouseId,
      section_id: this.selectedSectionId,
      date_shamsi: this.selectedDateShamsi,
      client_tab_id: this.wsService.tabId,
      items: dirtyRows.map(r => ({
        personnel_id: r.personnel_id,
        warehouse_id: r.warehouse_id || this.selectedWarehouseId || null,
        status: r.status || '',
        effective_hours: Number(r.effective_hours) || 0,
        overtime_hours: Number(r.overtime_hours) || 0,
        is_friday_work: !!r.is_friday_work,
        is_mission: !!r.is_mission,
        advance_payment: Number(r.advance_payment) || 0,
        notes: r.notes || ''
      }))
    };

    this.personnelApi.saveAttendanceBulk(payload).subscribe({
      next: res => {
        this.isSavingAttendance = false;
        this.hasUnsavedChanges = false;
        dirtyRows.forEach(r => {
          r._isDirty = false;
          r.is_existing = !!r.status || Number(r.effective_hours) > 0;
        });
        this.applySearchFilter();
        this.toast.show('success', res.message || (this.hasExistingAttendance ? 'کارکرد روزانه با موفقیت به‌روزرسانی شد' : 'کارکرد روزانه با موفقیت ثبت شد'));

        if (this.selectedYearMonth) {
          this.personnelApi.getMonthlyAttendanceGrid(this.selectedWarehouseId, this.selectedYearMonth, {
            context: new HttpContext().set(SKIP_OFFLINE, true),
            section_id: this.selectedSectionId!
          }).subscribe({
            next: mRes => {
              this.monthlyGridDays = mRes.days_meta || [];
              this.monthlyGridRows = mRes.rows || [];
              this.monthName = mRes.month_name || '';
              this.daysInMonth = mRes.days_in_month || 31;
              this.cdr.detectChanges();
            },
            error: () => {}
          });
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSavingAttendance = false;
        const msg = err?.error?.detail || err?.error?.error || 'خطا در ذخیره کارکرد روزانه';
        this.toast.show('error', msg);
        this.cdr.detectChanges();
      }
    });
  }

  // --- ۲. تقویم ۳۱ روزه ماهانه کارکرد پرسنل (Guardian G1: section_id Enforced) ---
  loadMonthlyAttendanceGrid(): void {
    if (!this.selectedYearMonth || !this.selectedSectionId) return;
    this.isMonthlyGridLoading = true;
    this.hasUnsavedMonthlyGrid = false;

    this.personnelApi.getMonthlyAttendanceGrid(this.selectedWarehouseId, this.selectedYearMonth, {
      section_id: this.selectedSectionId
    }).subscribe({
      next: (res: MonthlyGridResponse) => {
        this.monthlyGridDays = res.days_meta || [];
        this.monthlyGridRows = res.rows || [];
        this.monthName = res.month_name || '';
        this.daysInMonth = res.days_in_month || 31;
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';
        this.anomalies = res.anomalies || [];
        this.isMonthlyGridLoading = false;
        this.hasUnsavedMonthlyGrid = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isMonthlyGridLoading = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در دریافت ماتریس ماهانه کارکرد');
        this.cdr.detectChanges();
      }
    });
  }

  refreshMonthlyGridSilently(forceFresh = true): void {
    if (!this.selectedYearMonth || !this.selectedSectionId) return;
    const context = forceFresh ? new HttpContext().set(SKIP_OFFLINE, true) : undefined;
    this.personnelApi.getMonthlyAttendanceGrid(this.selectedWarehouseId, this.selectedYearMonth, {
      context,
      section_id: this.selectedSectionId
    }).subscribe({
      next: (res: MonthlyGridResponse) => {
        this.monthlyGridDays = res.days_meta || [];
        this.monthlyGridRows = res.rows || [];
        this.monthName = res.month_name || '';
        this.daysInMonth = res.days_in_month || 31;
        this.isPeriodLocked = !!res.is_locked;
        this.periodStatus = res.period_status || 'OPEN';
        this.anomalies = res.anomalies || [];

        if (this.isDayDetailModalOpen && this.selectedDayDetailRow && this.selectedDayDetailItem) {
          const targetPid = this.selectedDayDetailRow.personnel_id;
          const targetDay = this.selectedDayDetailItem.day;
          const freshRow = this.monthlyGridRows.find(r => r.personnel_id === targetPid);
          if (freshRow) {
            this.selectedDayDetailRow = freshRow;
            const freshDayItem = freshRow.days.find(d => d.day === targetDay);
            if (freshDayItem) {
              this.selectedDayDetailItem = freshDayItem;
            }
          }
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  saveMonthlyGrid(): void {
    if (!this.selectedYearMonth || !this.selectedSectionId) return;
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل شده و امکان ذخیره وجود ندارد');
      return;
    }
    this.isSavingMonthlyGrid = true;

    const items: any[] = [];
    for (const row of this.monthlyGridRows) {
      for (const d of row.days) {
        if (d.status || d.effective_hours > 0 || d.is_existing) {
          items.push({
            personnel_id: row.personnel_id,
            day: d.day,
            status: d.status || 'PRESENT_10H',
            effective_hours: d.effective_hours,
            overtime_hours: d.overtime_hours,
            is_friday_work: d.is_friday_work,
            is_mission: d.is_mission,
            advance_payment: d.advance_payment || 0,
            notes: d.notes || ''
          });
        }
      }
    }

    this.personnelApi.bulkSaveMonthlyGrid({
      warehouse_id: this.selectedWarehouseId,
      section_id: this.selectedSectionId,
      year_month: this.selectedYearMonth,
      client_tab_id: this.wsService.tabId,
      items
    }).subscribe({
      next: () => {
        this.isSavingMonthlyGrid = false;
        this.hasUnsavedMonthlyGrid = false;
        this.toast.show('success', 'تغییرات تقویم ماهانه با موفقیت ذخیره شد');
        this.refreshMonthlyGridSilently();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSavingMonthlyGrid = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در ذخیره تقویم ماهانه');
        this.cdr.detectChanges();
      }
    });
  }

  // --- ۳. مودال ویرایش جزییات روز پرسنل (Day Detail Modal) ---
  openDayDetailModal(row: MonthlyGridRow, dayItem: MonthlyGridPersonnelDay): void {
    if (this.isPeriodLocked) {
      this.toast.show('info', 'این سلول در دوره قفل‌شده قرار دارد و فقط‌خواندنی است');
      return;
    }
    this.selectedDayDetailRow = row;
    this.selectedDayDetailItem = dayItem;
    this.dayDetailStatus = dayItem.status || 'PRESENT_10H';
    this.dayDetailEffectiveHours = (this.dayDetailStatus === 'ABSENT' || this.dayDetailStatus === 'LEAVE') ? 0 : (dayItem.effective_hours || 10);
    this.dayDetailOvertimeHours = (this.dayDetailStatus === 'ABSENT' || this.dayDetailStatus === 'LEAVE') ? 0 : (dayItem.overtime_hours || 0);
    this.dayDetailIsFridayWork = !!dayItem.is_friday_work;
    this.dayDetailNotes = dayItem.notes || '';
    this.isDayDetailModalOpen = true;
  }

  onDayDetailStatusChange(): void {
    if (this.dayDetailStatus === 'ABSENT' || this.dayDetailStatus === 'LEAVE') {
      this.dayDetailEffectiveHours = 0;
      this.dayDetailOvertimeHours = 0;
      this.dayDetailIsFridayWork = false;
    } else if (this.dayDetailStatus === 'PRESENT_10H') {
      if (!this.dayDetailEffectiveHours) this.dayDetailEffectiveHours = 10;
      this.dayDetailIsFridayWork = this.isSelectedDayDetailFriday;
    } else if (this.dayDetailStatus === 'HALF_5H') {
      if (!this.dayDetailEffectiveHours) this.dayDetailEffectiveHours = 5;
      this.dayDetailIsFridayWork = this.isSelectedDayDetailFriday;
    }
  }

  saveDayDetail(): void {
    if (!this.selectedDayDetailItem || !this.selectedDayDetailRow) return;

    const activeRow = this.monthlyGridRows.find(r => r.personnel_id === this.selectedDayDetailRow?.personnel_id) || this.selectedDayDetailRow;
    const activeItem = activeRow.days.find(d => d.day === this.selectedDayDetailItem?.day) || this.selectedDayDetailItem;

    activeItem.status = this.dayDetailStatus as any;
    if (this.dayDetailStatus === 'ABSENT' || this.dayDetailStatus === 'LEAVE') {
      this.dayDetailEffectiveHours = 0;
      this.dayDetailOvertimeHours = 0;
      this.dayDetailIsFridayWork = false;
    } else {
      this.dayDetailIsFridayWork = this.isSelectedDayDetailFriday && (this.dayDetailEffectiveHours > 0);
    }
    activeItem.effective_hours = this.dayDetailEffectiveHours;
    activeItem.overtime_hours = this.dayDetailOvertimeHours;
    activeItem.is_friday_work = this.dayDetailIsFridayWork;
    activeItem.is_mission = false;
    activeItem.notes = this.dayDetailNotes;

    this.onMonthlyCellHoursChange(activeRow, activeItem);
    this.isDayDetailModalOpen = false;
    this.saveMonthlyGrid();
  }

  onMonthlyCellHoursChange(row: MonthlyGridRow, dayItem: MonthlyGridPersonnelDay): void {
    this.hasUnsavedMonthlyGrid = true;
    let h = parseFloat(dayItem.effective_hours as any) || 0;
    if (h < 0) h = 0;
    if (h > 24) h = 24;
    dayItem.effective_hours = h;
    if (h === 0 && dayItem.status === 'PRESENT_10H') {
      dayItem.status = 'ABSENT';
    } else if (h > 0 && (!dayItem.status || dayItem.status === 'ABSENT')) {
      dayItem.status = h === 10 ? 'PRESENT_10H' : (h === 5 ? 'HALF_5H' : 'CUSTOM');
    }
    row.total_hours = row.days.reduce((acc, d) => acc + (parseFloat(d.effective_hours as any) || 0), 0);
    row.total_overtime = row.days.reduce((acc, d) => acc + (parseFloat(d.overtime_hours as any) || 0), 0);
    row.present_days = row.days.filter(d => ['PRESENT_10H', 'HALF_5H', 'FRIDAY_WORK', 'MISSION', 'CUSTOM'].includes(d.status) && (parseFloat(d.effective_hours as any) || 0) > 0).length;
  }

  // --- ۴. مودال اعمال کارکرد در بازه زمانی مشخص (Date Range Applicator) ---
  openRangeModal(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره قفل شده و امکان ویرایش وجود ندارد.');
      return;
    }
    this.rangeStartDay = 1;
    this.rangeEndDay = this.daysInMonth || 31;
    this.rangeTargetScope = this.selectedPersonnelIds.size > 0 ? 'selected' : 'all';
    this.rangeStatus = 'PRESENT_10H';
    this.rangeEffectiveHours = 10;
    this.rangeOvertimeHours = 0;
    this.rangeSkipFridays = true;
    this.rangeOnlyEmptyDays = true;
    this.isRangeModalOpen = true;
  }

  onRangeStatusChange(): void {
    if (this.rangeStatus === 'PRESENT_10H') {
      this.rangeEffectiveHours = 10;
      this.rangeOvertimeHours = 0;
    } else if (this.rangeStatus === 'HALF_5H') {
      this.rangeEffectiveHours = 5;
      this.rangeOvertimeHours = 0;
    } else if (this.rangeStatus === 'FRIDAY_WORK') {
      this.rangeEffectiveHours = 10;
      this.rangeOvertimeHours = 0;
      this.rangeSkipFridays = false;
    } else if (this.rangeStatus === 'MISSION') {
      this.rangeEffectiveHours = 10;
      this.rangeOvertimeHours = 0;
    } else if (this.rangeStatus === 'ABSENT' || this.rangeStatus === 'LEAVE') {
      this.rangeEffectiveHours = 0;
      this.rangeOvertimeHours = 0;
    }
  }

  applyDateRangeAttendance(): void {
    if (this.isPeriodLocked) return;
    if (this.rangeStartDay > this.rangeEndDay) {
      this.toast.show('warning', 'روز شروع نمی‌تواند از روز پایان بزرگتر باشد.');
      return;
    }
    if (!this.monthlyGridRows.length) {
      this.toast.show('warning', 'سطری در جدول ماهانه وجود ندارد.');
      return;
    }

    const targetRows = this.rangeTargetScope === 'selected' && this.selectedPersonnelIds.size > 0
      ? this.monthlyGridRows.filter(r => this.selectedPersonnelIds.has(r.personnel_id))
      : this.monthlyGridRows;

    if (targetRows.length === 0) {
      this.toast.show('warning', 'سطری برای اعمال کارکرد یافت نشد.');
      return;
    }

    const fridayDays = new Set(this.monthlyGridDays.filter(m => m.is_friday).map(m => m.day));
    let affectedCount = 0;

    for (const row of targetRows) {
      for (const d of row.days) {
        if (d.day < this.rangeStartDay || d.day > this.rangeEndDay) {
          continue;
        }
        const isFriday = fridayDays.has(d.day);
        if (this.rangeSkipFridays && isFriday && this.rangeStatus !== 'FRIDAY_WORK') {
          continue;
        }

        if (this.rangeOnlyEmptyDays) {
          const hasExistingWork = d.status && d.status !== 'ABSENT' && Number(d.effective_hours) > 0;
          if (hasExistingWork) {
            continue;
          }
        }

        d.status = this.rangeStatus;
        d.effective_hours = this.rangeEffectiveHours;
        d.overtime_hours = this.rangeOvertimeHours;
        d.is_friday_work = isFriday && this.rangeEffectiveHours > 0;
        d.is_mission = this.rangeStatus === 'MISSION';
        affectedCount++;
      }
      row.total_hours = row.days.reduce((acc, d) => acc + (parseFloat(d.effective_hours as any) || 0), 0);
      row.total_overtime = row.days.reduce((acc, d) => acc + (parseFloat(d.overtime_hours as any) || 0), 0);
      row.present_days = row.days.filter(d => ['PRESENT_10H', 'HALF_5H', 'FRIDAY_WORK', 'MISSION', 'CUSTOM'].includes(d.status) && (parseFloat(d.effective_hours as any) || 0) > 0).length;
    }

    this.isRangeModalOpen = false;
    if (affectedCount > 0) {
      this.hasUnsavedMonthlyGrid = true;
      this.toast.show('success', `کارکرد روزهای ${this.rangeStartDay} تا ${this.rangeEndDay} برای ${targetRows.length} نفر (${affectedCount} سلول) اعمال شد. جهت ثبت نهایی، دکمه ذخیره را بزنید.`);
    } else {
      this.toast.show('info', 'هیچ سلولی مطابق شروط انتخابی تغییر نیافت.');
    }
    this.cdr.detectChanges();
  }

  // --- ۵. خروجی و بارگذاری اکسل و چاپ رسمی تایم‌شیت ---
  exportMonthlyExcel(): void {
    if (!this.selectedYearMonth) return;
    this.isExportingMonthlyExcel = true;
    this.personnelApi.exportMonthlyAttendanceExcel(this.selectedWarehouseId, this.selectedYearMonth, this.selectedSectionId).subscribe({
      next: (blob: Blob) => {
        this.isExportingMonthlyExcel = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const secName = this.selectedSection?.name || 'all_sections';
        a.download = `Timesheet_${this.selectedYearMonth.replace('/', '_')}_${secName}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.show('success', 'فایل اکسل تقویم کارکرد با موفقیت دانلود شد');
        this.cdr.detectChanges();
      },
      error: () => {
        this.isExportingMonthlyExcel = false;
        this.toast.show('error', 'خطا در دانلود فایل اکسل کارکرد');
        this.cdr.detectChanges();
      }
    });
  }

  openExcelImportModal(): void {
    if (this.isPeriodLocked) {
      this.toast.show('warning', 'دوره کارکرد قفل شده است و امکان بارگذاری وجود ندارد.');
      return;
    }
    this.selectedExcelImportFile = null;
    this.isExcelImportModalOpen = true;
  }

  closeExcelImportModal(): void {
    this.isExcelImportModalOpen = false;
    this.selectedExcelImportFile = null;
  }

  onExcelImportFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.selectedExcelImportFile = file;
    }
  }

  uploadMonthlyTimesheetExcel(): void {
    if (!this.selectedExcelImportFile || !this.selectedYearMonth) return;
    this.isImportingMonthlyExcel = true;
    const formData = new FormData();
    formData.append('file', this.selectedExcelImportFile);
    if (this.selectedWarehouseId) {
      formData.append('warehouse_id', this.selectedWarehouseId.toString());
    }
    if (this.selectedSectionId) {
      formData.append('section_id', this.selectedSectionId.toString());
    }
    formData.append('year_month', this.selectedYearMonth);

    this.personnelApi.importMonthlyAttendanceExcel(formData).subscribe({
      next: (res) => {
        this.isImportingMonthlyExcel = false;
        this.closeExcelImportModal();
        this.toast.show('success', res.message || 'شیت کارکرد با موفقیت از فایل اکسل بارگذاری شد.');
        this.loadMonthlyAttendanceGrid();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isImportingMonthlyExcel = false;
        this.toast.show('error', err?.error?.error || err?.error?.detail || 'خطا در پردازش فایل اکسل');
        this.cdr.detectChanges();
      }
    });
  }

  // --- ۶. گردش کار ارسال کارکرد به واحد مالی ---
  openSubmitModal(): void {
    if (!this.selectedSectionId && !this.selectedWarehouseId) {
      this.toast.show('warning', 'برای ارسال کارکرد ماهانه به واحد مالی، لطفاً ابتدا یک بخش یا انبار مشخص را انتخاب کنید.');
      return;
    }
    this.submitNotes = '';
    this.isSubmitModalOpen = true;
  }

  submitPeriodForReview(): void {
    this.isSubmittingWorkflow = true;
    this.personnelApi.periodWorkflowAction({
      warehouse_id: this.selectedWarehouseId,
      year_month: this.selectedYearMonth,
      action: 'submit',
      notes: this.submitNotes
    }).subscribe({
      next: res => {
        this.isSubmittingWorkflow = false;
        this.isSubmitModalOpen = false;
        this.toast.show('success', res.message || 'کارکرد ماهانه جهت بررسی مالی ارسال گردید');
        this.loadMonthlyAttendanceGrid();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isSubmittingWorkflow = false;
        this.toast.show('error', err?.error?.detail || err?.error?.error || 'خطا در ارسال دوره جهت بررسی');
        this.cdr.detectChanges();
      }
    });
  }

  openPrintTimesheetModal(): void {
    this.isPrintModalOpen = true;
  }

  closePrintTimesheetModal(): void {
    this.isPrintModalOpen = false;
  }

  triggerPrint(): void {
    window.print();
  }

  focusAnomaly(anom: AttendanceAnomaly): void {
    if (anom.personnel_id) {
      this.highlightPersonnelId = anom.personnel_id;
      const el = document.getElementById(`grid-row-${anom.personnel_id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        this.highlightPersonnelId = null;
        this.cdr.detectChanges();
      }, 3500);
    }
  }

  // --- ناوبری صفحه کلید (Keyboard Grid Ergonomics) ---
  onAttendanceGridKeydown(event: KeyboardEvent, colType: 'status' | 'eff' | 'ot' | 'adv' | 'note' | 'wh', rowIndex: number, statusType?: string, row?: AttendanceMatrixRow): void {
    const key = event.key;

    if (colType === 'status') {
      const statuses = ['PRESENT_10H', 'HALF_5H', 'LEAVE', 'ABSENT', 'MISSION'];
      const currentIdx = statuses.indexOf(statusType || 'PRESENT_10H');

      if (key === 'ArrowLeft') {
        event.preventDefault();
        if (currentIdx < statuses.length - 1) {
          const nextStatus = statuses[currentIdx + 1];
          const el = document.getElementById(`btn-status-${nextStatus}-${rowIndex}`);
          if (el) el.focus();
        } else {
          const el = document.getElementById(`input-eff-${rowIndex}`);
          if (el) {
            (el as HTMLInputElement).focus();
            (el as HTMLInputElement).select?.();
          }
        }
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        if (currentIdx > 0) {
          const prevStatus = statuses[currentIdx - 1];
          const el = document.getElementById(`btn-status-${prevStatus}-${rowIndex}`);
          if (el) el.focus();
        } else {
          const el = document.getElementById(`chk-${rowIndex}`);
          if (el) el.focus();
        }
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        const nextEl = document.getElementById(`btn-status-${statusType}-${rowIndex + 1}`);
        if (nextEl) nextEl.focus();
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        const prevEl = document.getElementById(`btn-status-${statusType}-${rowIndex - 1}`);
        if (prevEl) prevEl.focus();
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (row && statusType) {
          this.setAttendanceStatus(row, statusType);
        }
      }
      return;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      const prevEl = document.getElementById(colType === 'wh' ? `select-wh-${rowIndex - 1}` : `input-${colType}-${rowIndex - 1}`);
      if (prevEl) {
        (prevEl as HTMLElement).focus();
        (prevEl as HTMLInputElement).select?.();
      }
    } else if (key === 'ArrowDown' || key === 'Enter') {
      event.preventDefault();
      const nextEl = document.getElementById(colType === 'wh' ? `select-wh-${rowIndex + 1}` : `input-${colType}-${rowIndex + 1}`);
      if (nextEl) {
        (nextEl as HTMLElement).focus();
        (nextEl as HTMLInputElement).select?.();
      } else {
        (event.target as HTMLElement).blur();
      }
    } else if (key === 'ArrowLeft') {
      const target = event.target as HTMLInputElement;
      const isAtEnd = target.selectionStart === target.selectionEnd && target.selectionStart === (target.value || '').length;
      if (isAtEnd || target.type === 'number' || target.tagName === 'SELECT') {
        event.preventDefault();
        let nextColId = '';
        if (colType === 'eff') nextColId = `input-ot-${rowIndex}`;
        else if (colType === 'ot') nextColId = `input-adv-${rowIndex}`;
        else if (colType === 'adv') nextColId = `input-note-${rowIndex}`;
        else if (colType === 'note') nextColId = `select-wh-${rowIndex}`;
        if (nextColId) {
          const el = document.getElementById(nextColId);
          if (el) {
            (el as HTMLElement).focus();
            (el as HTMLInputElement).select?.();
          }
        }
      }
    } else if (key === 'ArrowRight') {
      const target = event.target as HTMLInputElement;
      const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
      if (isAtStart || target.type === 'number' || target.tagName === 'SELECT') {
        event.preventDefault();
        let prevColId = '';
        if (colType === 'wh') prevColId = `input-note-${rowIndex}`;
        else if (colType === 'note') prevColId = `input-adv-${rowIndex}`;
        else if (colType === 'adv') prevColId = `input-ot-${rowIndex}`;
        else if (colType === 'ot') prevColId = `input-eff-${rowIndex}`;
        else if (colType === 'eff') {
          const activeStatus = row?.status || 'MISSION';
          prevColId = `btn-status-${activeStatus}-${rowIndex}`;
          if (!document.getElementById(prevColId)) {
            prevColId = `btn-status-MISSION-${rowIndex}`;
          }
        }
        if (prevColId) {
          const el = document.getElementById(prevColId);
          if (el) {
            (el as HTMLElement).focus();
            (el as HTMLInputElement).select?.();
          }
        }
      }
    } else if (key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    }
  }

  // --- متدهای کمکی و تاریخ ---
  goToPrevDay(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.selectedDateShamsi, -1);
    this.syncYearMonthFromDailyDate();
    this.attendanceDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  goToNextDay(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.selectedDateShamsi, 1);
    this.syncYearMonthFromDailyDate();
    this.attendanceDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  goToToday(): void {
    this.initDefaultDate();
    this.onFilterChange();
  }

  goToYesterday(): void {
    this.selectedDateShamsi = this.shiftShamsiDay(this.getTodayShamsi(), -1);
    this.syncYearMonthFromDailyDate();
    this.attendanceDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.onFilterChange();
  }

  toggleAttendanceDatePicker(event?: Event): void {
    if (event) event.stopPropagation();
    this.isAttendanceDatePickerOpen = !this.isAttendanceDatePickerOpen;
    this.isMonthPickerOpen = false;
    this.isWarehouseMenuOpen = false;
    this.cdr.detectChanges();
  }

  openAttendanceDatePicker(): void {
    this.isAttendanceDatePickerOpen = true;
    this.isMonthPickerOpen = false;
    this.isWarehouseMenuOpen = false;
    this.cdr.detectChanges();
  }

  closeAttendanceDatePicker(): void {
    this.isAttendanceDatePickerOpen = false;
    this.cdr.detectChanges();
  }

  onAttendanceDateInput(event: any): void {
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
      this.attendanceDateControl.setValue(formatted, { emitEvent: false });
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

  onAttendanceDateSelect(event: any): void {
    if (!event) return;
    this.closeAttendanceDatePicker();
    if (event.shamsi) {
      let rawShamsi = event.shamsi.replace(/[۰-۹]/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
      const parts = rawShamsi.split('/');
      if (parts.length === 3) {
        const pad = (n: string) => n.length === 1 ? '0' + n : n;
        rawShamsi = `${parts[0]}/${pad(parts[1])}/${pad(parts[2])}`;
      }
      this.selectedDateShamsi = rawShamsi;
      this.attendanceDateControl.setValue(rawShamsi, { emitEvent: false });
      this.syncYearMonthFromDailyDate();
      this.onFilterChange();
    } else if (event.gregorian) {
      const d = new Date(event.gregorian);
      const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
      const pad = (n: number) => n < 10 ? '0' + n : String(n);
      const formatted = `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
      this.selectedDateShamsi = formatted;
      this.attendanceDateControl.setValue(formatted, { emitEvent: false });
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
    this.isAttendanceDatePickerOpen = false;
  }

  selectMonth(monthNum: number): void {
    const rawYear = this.selectedYearMonth ? this.selectedYearMonth.split('/')[0] : '1405';
    const year = rawYear.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    const mmStr = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
    this.selectedYearMonth = `${year}/${mmStr}`;
    this.fiscalYear = year;
    const curDay = this.selectedDateShamsi ? (this.selectedDateShamsi.split('/')[2] || '01') : '01';
    this.selectedDateShamsi = `${year}/${mmStr}/${curDay}`;
    this.attendanceDateControl.setValue(this.selectedDateShamsi, { emitEvent: false });
    this.isMonthPickerOpen = false;
    this.onFilterChange();
  }

  reloadWithRemote(): void {
    this.hasRemoteConflict = false;
    this.hasUnsavedChanges = false;
    this.hasUnsavedMonthlyGrid = false;
    if (this.activeMode === 'daily') {
      this.loadAttendanceMatrix();
    } else {
      this.loadMonthlyAttendanceGrid();
    }
    this.toast.show('info', 'اطلاعات با موفقیت از سرور بازخوانی شد');
  }

  dismissRemoteConflict(): void {
    this.hasRemoteConflict = false;
  }

  // --- گترها و محاسبات ---
  get isSelectedDateFriday(): boolean {
    if (!this.selectedDateShamsi) return false;
    try {
      const parts = this.selectedDateShamsi.split('/').map(p => parseInt(p, 10));
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const g = jalaliToGregorian(parts[0], parts[1], parts[2]);
        const d = new Date(g.gy, g.gm - 1, g.gd);
        return d.getDay() === 5;
      }
    } catch {}
    return false;
  }

  get isSelectedDayDetailFriday(): boolean {
    if (!this.selectedDayDetailItem) return false;
    return !!this.monthlyGridDays.find(d => d.day === this.selectedDayDetailItem?.day)?.is_friday;
  }

  get hasExistingAttendance(): boolean {
    return (this.attendanceRows || []).some(r => !!r.is_existing || !!r.attendance_id);
  }

  get attendanceCounts() {
    let present = 0;
    let half = 0;
    let absent = 0;
    let leave = 0;
    let mission = 0;
    let other = 0;
    let totalEffectiveHours = 0;
    let totalOvertimeHours = 0;
    let totalAdvance = 0;

    for (const r of (this.attendanceRows || [])) {
      if (r.status === 'PRESENT_10H') present++;
      else if (r.status === 'HALF_5H') half++;
      else if (r.status === 'ABSENT') absent++;
      else if (r.status === 'LEAVE' || r.status === 'HOURLY_LEAVE') leave++;
      else if (r.status === 'MISSION') mission++;
      else if (r.status) other++;

      totalEffectiveHours += Number(r.effective_hours) || 0;
      totalOvertimeHours += Number(r.overtime_hours) || 0;
      totalAdvance += Number(r.advance_payment) || 0;
    }
    return {
      present,
      half,
      absent,
      leave,
      mission,
      other,
      total: this.attendanceRows.length,
      totalEffectiveHours,
      totalOvertimeHours,
      totalAdvance
    };
  }

  get attendanceRegistrationState(): {
    status: 'none' | 'partial' | 'full';
    savedCount: number;
    totalCount: number;
    label: string;
  } {
    const total = this.attendanceRows.length;
    if (total === 0) {
      return { status: 'none', savedCount: 0, totalCount: 0, label: 'پیش‌نویس (بدون پرسنل)' };
    }
    const saved = this.attendanceRows.filter(r => !!r.is_existing || !!r.attendance_id).length;
    if (saved === 0) {
      return { status: 'none', savedCount: 0, totalCount: total, label: 'پیش‌نویس (ذخیره‌نشده)' };
    } else if (saved === total) {
      return { status: 'full', savedCount: saved, totalCount: total, label: `نهایی (${saved} از ${total})` };
    } else {
      return { status: 'partial', savedCount: saved, totalCount: total, label: `ثبت ناقص (${saved} از ${total})` };
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isMonthPickerOpen = false;
    this.isAttendanceDatePickerOpen = false;
  }

  @HostListener('window:keydown.escape')
  onGlobalEscape(): void {
    if (this.isAttendanceDatePickerOpen) {
      this.isAttendanceDatePickerOpen = false;
      return;
    }
    if (this.isRangeModalOpen) {
      this.isRangeModalOpen = false;
      return;
    }
    if (this.isDayDetailModalOpen) {
      this.isDayDetailModalOpen = false;
      return;
    }
    if (this.isBulkHoursModalOpen) {
      this.isBulkHoursModalOpen = false;
      return;
    }
    if (this.isExcelPasteModalOpen) {
      this.isExcelPasteModalOpen = false;
      return;
    }
    if (this.isPrintModalOpen) {
      this.isPrintModalOpen = false;
      return;
    }
    this.isMonthPickerOpen = false;
  }
}
