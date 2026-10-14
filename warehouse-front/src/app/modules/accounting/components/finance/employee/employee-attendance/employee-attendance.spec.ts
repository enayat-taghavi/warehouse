// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeAttendanceHubComponent } from './employee-attendance';
import { of, Subject } from 'rxjs';

describe('EmployeeAttendanceHubComponent Comprehensive Vitest Suite (Phase 1)', () => {
  let component: EmployeeAttendanceHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWhService: any;
  let mockWsService: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'admin', is_superuser: true }),
      userPermissions: vi.fn().mockReturnValue(['admin_all'])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش مهندسی و فنی', code: 'ENG', project: 1, project_name: 'پروژه پردیس' },
        { id: 20, name: 'بخش عمران', code: 'CIV', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش مهندسی و فنی', code: 'ENG', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getAttendanceMatrix: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        date_shamsi: '1405/06/08',
        is_locked: false,
        period_status: 'OPEN',
        rows: [
          {
            personnel_id: 101,
            full_name: 'محمد صادقی',
            national_code: '1234567890',
            job_title: 'کارشناس پروژه',
            status: 'PRESENT_10H',
            effective_hours: 10,
            overtime_hours: 2,
            is_friday_work: false,
            is_mission: false,
            advance_payment: 0,
            notes: '',
            is_existing: true,
            _isDirty: false
          },
          {
            personnel_id: 102,
            full_name: 'سارا احمدی',
            national_code: '0987654321',
            job_title: 'مهندس ناظر',
            status: 'ABSENT',
            effective_hours: 0,
            overtime_hours: 0,
            is_friday_work: false,
            is_mission: false,
            advance_payment: 0,
            notes: '',
            is_existing: false,
            _isDirty: false
          }
        ]
      })),
      saveAttendanceBulk: vi.fn().mockReturnValue(of({ success: true, saved_count: 2, updated_count: 0 })),
      getMonthlyAttendanceGrid: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        year_month: '1405/06',
        days_in_month: 31,
        is_locked: false,
        period_status: 'OPEN',
        settings_window: { past_days: 3, future_days: 0 },
        days_meta: [
          { day_number: 1, date_shamsi: '1405/06/01', day_name: 'شنبه', is_friday: false, is_holiday: false }
        ],
        rows: [
          {
            personnel_id: 101,
            full_name: 'محمد صادقی',
            national_code: '1234567890',
            job_title: 'کارشناس پروژه',
            total_days_worked: 1,
            total_effective_hours: 10,
            total_overtime_hours: 2,
            days: [
              {
                day: 1,
                date_shamsi: '1405/06/01',
                status: 'PRESENT_10H',
                effective_hours: 10,
                overtime_hours: 2,
                is_friday_work: false,
                is_mission: false,
                advance_payment: 0,
                notes: '',
                is_locked: false,
                is_modified: false
              }
            ]
          }
        ]
      })),
      bulkSaveMonthlyGrid: vi.fn().mockReturnValue(of({ success: true, saved_count: 1, updated_count: 0 })),
      exportMonthlyAttendanceExcel: vi.fn().mockReturnValue(of(new Blob(['excel content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))),
      importMonthlyAttendanceExcel: vi.fn().mockReturnValue(of({ message: 'بارگذاری شد', saved_count: 1 })),
      periodWorkflowAction: vi.fn().mockReturnValue(of({ message: 'دوره کارکرد جهت بررسی مالی ارسال گردید' }))
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([
        { id: 1, name: 'انبار مرکزی' }
      ]))
    };

    mockWsService = {
      notifications$: new Subject<any>(),
      connected$: new Subject<boolean>(),
      tabId: 'test-tab-123'
    };

    mockToast = {
      show: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn(),
      markForCheck: vi.fn()
    };

    mockRoute = {
      queryParams: of({ section_id: '10' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeAttendanceHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockWhService,
      mockWsService,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );

    component.selectedSectionId = 10;
    component.selectedDateShamsi = '1405/06/08';
    component.selectedYearMonth = '1405/06';
  });

  describe('1. Initialization & Section Isolation (Guardian G1)', () => {
    it('should initialize and load sections and attendance matrix for selected section', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(component.selectedSectionId).toBe(10);
      expect(mockPersonnelApi.getAttendanceMatrix).toHaveBeenCalledWith(
        null,
        component.selectedDateShamsi,
        expect.objectContaining({ section_id: 10 })
      );
      expect(component.attendanceRows.length).toBe(2);
    });

    it('should filter personnel in monthly grid by section_id', () => {
      component.selectedSectionId = 10;
      component.activeMode = 'monthly_grid';
      component.loadMonthlyAttendanceGrid();
      expect(mockPersonnelApi.getMonthlyAttendanceGrid).toHaveBeenCalledWith(
        null,
        '1405/06',
        expect.objectContaining({ section_id: 10 })
      );
      expect(component.monthlyGridRows.length).toBe(1);
    });
  });

  describe('2. Status Management & Ergonomics', () => {
    beforeEach(() => {
      component.selectedSectionId = 10;
      component.loadAttendanceMatrix();
    });

    it('should toggle status on single click (toggle back to null/empty if clicked twice)', () => {
      const row = component.attendanceRows[0];
      expect(row.status).toBe('PRESENT_10H');
      
      // Clicking same status badge toggles it off
      component.setAttendanceStatus(row, 'PRESENT_10H');
      expect(row.status).toBe('');
      expect(row.effective_hours).toBe(0);
      expect(row.overtime_hours).toBe(0);
      expect(component.hasUnsavedChanges).toBe(true);

      // Clicking again sets it back
      component.setAttendanceStatus(row, 'PRESENT_10H');
      expect(row.status).toBe('PRESENT_10H');
      expect(row.effective_hours).toBe(10);
    });

    it('should reset hours to 0 when status is changed to ABSENT or LEAVE', () => {
      const row = component.attendanceRows[0];
      component.setAttendanceStatus(row, 'ABSENT');
      expect(row.status).toBe('ABSENT');
      expect(row.effective_hours).toBe(0);
      expect(row.overtime_hours).toBe(0);

      component.setAttendanceStatus(row, 'LEAVE');
      expect(row.status).toBe('LEAVE');
      expect(row.effective_hours).toBe(0);
      expect(row.overtime_hours).toBe(0);
    });

    it('should correctly calculate attendanceCounts aggregation', () => {
      const counts = component.attendanceCounts;
      expect(counts.total).toBe(2);
      expect(counts.present).toBe(1);
      expect(counts.absent).toBe(1);
      expect(counts.totalEffectiveHours).toBe(10);
      expect(counts.totalOvertimeHours).toBe(2);
    });
  });

  describe('3. Keyboard Navigation & Table Ergonomics', () => {
    beforeEach(() => {
      component.selectedSectionId = 10;
      component.loadAttendanceMatrix();
    });

    it('should toggle status on Enter or Space on status cell keydown', () => {
      const row = component.attendanceRows[0];
      expect(row.status).toBe('PRESENT_10H');

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const spyPrevent = vi.spyOn(enterEvent, 'preventDefault');

      component.onAttendanceGridKeydown(enterEvent, 'status', 0, 'PRESENT_10H', row);
      expect(spyPrevent).toHaveBeenCalled();
      expect(row.status).toBe('');
    });
  });

  describe('4. Bulk Hours Modal & Absent Protection', () => {
    beforeEach(() => {
      component.selectedSectionId = 10;
      component.loadAttendanceMatrix();
    });

    it('should protect absent personnel when bulk hours applied without status override', () => {
      component.bulkHoursScope = 'all';
      component.bulkEffectiveHours = 10;
      component.bulkOvertimeHours = 4;
      component.bulkStatusOption = ''; // No override

      component.applyBulkHours();

      const absentRow = component.attendanceRows.find(r => r.personnel_id === 102);
      expect(absentRow?.status).toBe('ABSENT');
      expect(absentRow?.effective_hours).toBe(0);
      expect(absentRow?.overtime_hours).toBe(0);

      const presentRow = component.attendanceRows.find(r => r.personnel_id === 101);
      expect(presentRow?.effective_hours).toBe(10);
      expect(presentRow?.overtime_hours).toBe(4);
    });
  });

  describe('5. Bulk Save & Section Tracking', () => {
    it('should include section_id in saveAttendanceMatrix payload', () => {
      component.selectedSectionId = 10;
      component.loadAttendanceMatrix();
      component.attendanceRows[0]._isDirty = true;
      component.hasUnsavedChanges = true;
      component.saveAttendanceMatrix();

      expect(mockPersonnelApi.saveAttendanceBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          section_id: 10,
          date_shamsi: '1405/06/08',
          items: expect.any(Array)
        })
      );
      expect(component.hasUnsavedChanges).toBe(false);
    });

    it('should include section_id in bulkSaveMonthlyGrid payload', () => {
      component.selectedSectionId = 10;
      component.loadMonthlyAttendanceGrid();
      component.monthlyGridRows[0].days[0].effective_hours = 8;
      (component.monthlyGridRows[0].days[0] as any).is_modified = true;
      component.hasUnsavedMonthlyGrid = true;

      component.saveMonthlyGrid();

      expect(mockPersonnelApi.bulkSaveMonthlyGrid).toHaveBeenCalledWith(
        expect.objectContaining({
          section_id: 10,
          year_month: '1405/06',
          items: expect.any(Array)
        })
      );
      expect(component.hasUnsavedMonthlyGrid).toBe(false);
    });
  });

  describe('6. WebSocket Echo Filtering & Tab Isolation', () => {
    it('should ignore websocket echoes originating from the same client tab', () => {
      component.selectedDateShamsi = '1405/06/08';
      component.ngOnInit();
      const spySilentRefresh = vi.spyOn(component, 'refreshAttendanceMatrixSilently');

      mockWsService.notifications$.next({
        type: 'attendance_updated',
        section_id: 10,
        date_shamsi: component.selectedDateShamsi,
        client_tab_id: 'test-tab-123' // Same as current tab
      });

      expect(spySilentRefresh).not.toHaveBeenCalled();
    });

    it('should detect remote conflict if unsaved changes exist and external update arrives', () => {
      component.selectedDateShamsi = '1405/06/08';
      component.ngOnInit();
      component.hasUnsavedChanges = true;

      mockWsService.notifications$.next({
        type: 'attendance_updated',
        section_id: 10,
        date_shamsi: component.selectedDateShamsi,
        client_tab_id: 'another-client-tab-456' // Different tab
      });

      expect(component.hasRemoteConflict).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('کارکرد پرسنل توسط همکار دیگری تغییر یافت')
      );
    });
  });

  describe('7. Printable Timesheet & Section Branding', () => {
    it('should open printable modal and populate company & section branding', () => {
      component.selectedSection = { id: 10, name: 'بخش مهندسی و فنی', code: 'ENG', project_name: 'پروژه پردیس' } as any;
      component.openPrintTimesheetModal();
      expect(component.isPrintModalOpen).toBe(true);
      expect(component.selectedSection?.name).toBe('بخش مهندسی و فنی');
      expect(component.selectedSection?.project_name).toBe('پروژه پردیس');
    });
  });

  describe('8. Section-Isolated Monthly Excel, MISSION & Workflow Actions', () => {
    it('should set status to MISSION with 10 effective hours and is_mission flag', () => {
      const row = {
        personnel_id: 101,
        full_name: 'محمد صادقی',
        status: '',
        effective_hours: 0,
        overtime_hours: 0,
        is_friday_work: false,
        is_mission: false,
        _isDirty: false
      } as any;

      component.setAttendanceStatus(row, 'MISSION');
      expect(row.status).toBe('MISSION');
      expect(row.effective_hours).toBe(10);
      expect(row.is_mission).toBe(true);
      expect(row.is_friday_work).toBe(false);
      expect(component.hasUnsavedChanges).toBe(true);
    });

    it('should call exportMonthlyAttendanceExcel passing selectedSectionId for section isolation', () => {
      component.selectedWarehouseId = 1;
      component.selectedYearMonth = '1405/06';
      component.selectedSectionId = 10;
      component.selectedSection = { id: 10, name: 'بخش مهندسی' } as any;

      // Mock URL creation
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      component.exportMonthlyExcel();

      expect(mockPersonnelApi.exportMonthlyAttendanceExcel).toHaveBeenCalledWith(1, '1405/06', 10);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('دانلود شد'));
    });

    it('should open submit modal and submit period for review with section scope', () => {
      component.selectedWarehouseId = 1;
      component.selectedSectionId = 10;
      component.selectedYearMonth = '1405/06';

      component.openSubmitModal();
      expect(component.isSubmitModalOpen).toBe(true);

      component.submitNotes = 'تایید کارکرد شهریور';
      component.submitPeriodForReview();

      expect(mockPersonnelApi.periodWorkflowAction).toHaveBeenCalledWith({
        warehouse_id: 1,
        year_month: '1405/06',
        action: 'submit',
        notes: 'تایید کارکرد شهریور'
      });
      expect(component.isSubmitModalOpen).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('بررسی مالی'));
    });

    it('should append section_id to FormData during monthly excel upload', () => {
      component.selectedWarehouseId = 1;
      component.selectedSectionId = 10;
      component.selectedYearMonth = '1405/06';
      component.selectedExcelImportFile = new File(['dummy'], 'attendance.xlsx');

      component.uploadMonthlyTimesheetExcel();

      expect(mockPersonnelApi.importMonthlyAttendanceExcel).toHaveBeenCalled();
      const calledFormData: FormData = mockPersonnelApi.importMonthlyAttendanceExcel.mock.calls[0][0];
      expect(calledFormData.get('section_id')).toBe('10');
      expect(calledFormData.get('warehouse_id')).toBe('1');
      expect(calledFormData.get('year_month')).toBe('1405/06');
    });
  });
});
