// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployeeFleetHubComponent } from './employee-fleet';
import { of, Subject } from 'rxjs';

describe('EmployeeFleetHubComponent Comprehensive Vitest Suite (Phase 2)', () => {
  let component: EmployeeFleetHubComponent;
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
      user: vi.fn().mockReturnValue({ id: 1, username: 'employee1', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش حمل و نقل', code: 'LOG', project: 1, project_name: 'پروژه پردیس' },
        { id: 20, name: 'بخش کارگاه مرکزی', code: 'WSH', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getProjectSections: vi.fn().mockReturnValue(of([
        { id: 10, name: 'بخش حمل و نقل', code: 'LOG', project: 1, project_name: 'پروژه پردیس' }
      ])),
      getVehicleMatrix: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        date_shamsi: '1405/04/01',
        rows: [
          {
            vehicle_id: 201,
            driver_name: 'علی حسینی',
            plate_number: '12ع345-67',
            vehicle_type_display: 'وانت نیسان',
            default_rate: 1500000,
            trip_count: 2,
            unit_rate: 1500000,
            total_amount: 3000000,
            dispatch_reference: 'BL-1001',
            origin_destination: 'انبار مرکزی به سایت',
            notes: 'تحویل بار لوله',
            is_existing: true,
            is_active: true
          },
          {
            vehicle_id: 202,
            driver_name: 'رضا مرادی',
            plate_number: '34د567-89',
            vehicle_type_display: 'خاور',
            default_rate: 2500000,
            trip_count: 0,
            unit_rate: 2500000,
            total_amount: 0,
            dispatch_reference: '',
            origin_destination: '',
            notes: '',
            is_existing: false,
            is_active: false
          }
        ]
      })),
      saveVehicleTripsBulk: vi.fn().mockReturnValue(of({ message: 'اطلاعات ناوگان ذخیره شد', saved_count: 2 })),
      getVehicleMonthlyGrid: vi.fn().mockReturnValue(of({
        warehouse_id: 1,
        year_month: '1405/04',
        month_name: 'تیر',
        days_in_month: 31,
        is_locked: false,
        period_status: 'OPEN',
        days_meta: [
          { day: 1, date_shamsi: '1405/04/01', weekday_short: 'ش', is_friday: false },
          { day: 2, date_shamsi: '1405/04/02', weekday_short: 'ی', is_friday: false }
        ],
        rows: [
          {
            vehicle_id: 201,
            driver_name: 'علی حسینی',
            plate_number: '12ع345-67',
            vehicle_type: 'nissan',
            vehicle_type_display: 'وانت نیسان',
            ownership_type: 'contract',
            ownership_type_display: 'استیجاری',
            default_rate: 1500000,
            sheba_number: 'IR000000000000000000000000',
            total_trips: 4,
            total_amount: 6000000,
            active_days: 2,
            is_active: true,
            days: [
              {
                day: 1,
                date_shamsi: '1405/04/01',
                trip_count: 2,
                unit_rate: 1500000,
                total_amount: 3000000,
                dispatch_reference: 'BL-1001',
                origin_destination: 'انبار به سایت',
                notes: '',
                is_existing: true
              },
              {
                day: 2,
                date_shamsi: '1405/04/02',
                trip_count: 2,
                unit_rate: 1500000,
                total_amount: 3000000,
                dispatch_reference: 'BL-1002',
                origin_destination: 'انبار به سایت',
                notes: '',
                is_existing: true
              }
            ]
          }
        ]
      })),
      saveVehicleMonthlyGridBulk: vi.fn().mockReturnValue(of({ message: 'تقویم با موفقیت ذخیره شد', saved_count: 2 })),
      updateVehicleDayTrip: vi.fn().mockReturnValue(of({ message: 'ثبت شد', trip_id: 55 })),
      getFleetMonthlyExcelDownloadUrl: vi.fn().mockReturnValue('/api/personnel/trips/export-monthly-excel/?year_month=1405/04&section_id=10'),
      getVehicleTripAuditLogs: vi.fn().mockReturnValue(of([
        {
          id: 1,
          vehicle_id: 201,
          driver_name: 'علی حسینی',
          plate_number: '12ع345-67',
          date_shamsi: '1405/04/01',
          field_name: 'trip_count',
          old_value: '1',
          new_value: '2',
          changed_by_name: 'مدیر حمل',
          changed_at: '2026-06-22T10:00:00Z',
          reason: 'اصلاح حواله'
        }
      ])),
      getVehicleDriverProfile: vi.fn().mockReturnValue(of({
        id: 201,
        driver_name: 'علی حسینی',
        plate_number: '12ع345-67',
        vehicle_type: 'nissan',
        ownership_type: 'contract',
        default_service_rate: 1500000,
        sheba_number: 'IR120170000000101111111001',
        is_active: true
      })),
      createVehicleDriverProfile: vi.fn().mockReturnValue(of({ message: 'خودرو ایجاد شد', id: 300 })),
      updateVehicleDriverProfile: vi.fn().mockReturnValue(of({ message: 'خودرو ویرایش شد' }))
    };

    mockWhService = {
      getAll: vi.fn().mockReturnValue(of([
        { id: 1, name: 'انبار مرکزی' }
      ]))
    };

    mockWsService = {
      notifications$: new Subject<any>(),
      connected$: new Subject<boolean>(),
      tabId: 'fleet-tab-test-456'
    };

    mockToast = {
      show: vi.fn()
    };

    mockCdr = {
      detectChanges: vi.fn()
    };

    mockRoute = {
      queryParams: of({ section_id: '10' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeFleetHubComponent(
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
    component.selectedDateShamsi = '1405/04/01';
    component.selectedYearMonth = '1405/04';
  });

  describe('1. Section Isolation (Guardian G1)', () => {
    it('should initialize and load vehicle matrix with section_id enforced', () => {
      component.ngOnInit();
      expect(mockPersonnelApi.getMySections).toHaveBeenCalled();
      expect(component.selectedSectionId).toBe(10);
      expect(mockPersonnelApi.getVehicleMatrix).toHaveBeenCalledWith(
        null,
        component.selectedDateShamsi,
        expect.objectContaining({ section_id: 10 })
      );
      expect(component.vehicleRows.length).toBe(2);
    });

    it('should enforce section_id in monthly grid queries', () => {
      component.activeMode = 'monthly_grid';
      component.loadFleetMonthlyGrid();
      expect(mockPersonnelApi.getVehicleMonthlyGrid).toHaveBeenCalledWith(
        null,
        '1405/04',
        expect.objectContaining({ section_id: 10 })
      );
      expect(component.fleetMonthlyGridRows.length).toBe(1);
    });

    it('should include section_id in saveVehicleTripsBulk payload', () => {
      component.loadVehicleMatrix();
      component.saveVehicleMatrix();
      expect(mockPersonnelApi.saveVehicleTripsBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          section_id: 10,
          date_shamsi: component.selectedDateShamsi
        })
      );
    });

    it('should include section_id in saveVehicleMonthlyGridBulk payload', () => {
      component.loadFleetMonthlyGrid();
      component.saveFleetMonthlyGrid();
      expect(mockPersonnelApi.saveVehicleMonthlyGridBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          section_id: 10,
          year_month: '1405/04'
        })
      );
    });
  });

  describe('2. Inactive Vehicle Protection & Daily Matrix', () => {
    beforeEach(() => {
      component.loadVehicleMatrix();
    });

    it('should filter displayed rows using search query', () => {
      component.fleetSearchQuery = 'حسینی';
      expect(component.displayedVehicleRows.length).toBe(1);
      expect(component.displayedVehicleRows[0].driver_name).toBe('علی حسینی');

      component.fleetSearchQuery = '34د567';
      expect(component.displayedVehicleRows.length).toBe(1);
      expect(component.displayedVehicleRows[0].driver_name).toBe('رضا مرادی');
    });

    it('should prevent saving if inactive vehicle has trip_count > 0', () => {
      const inactiveRow = component.vehicleRows.find(r => r.is_active === false);
      expect(inactiveRow).toBeDefined();
      inactiveRow!.trip_count = 3;

      component.saveVehicleMatrix();
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('خودروی غیرفعال'));
      expect(mockPersonnelApi.saveVehicleTripsBulk).not.toHaveBeenCalled();
    });

    it('should calculate totalDailyTrips and totalDailyAmount accurately', () => {
      expect(component.totalDailyTrips).toBe(2);
      expect(component.totalDailyAmount).toBe(3000000);
    });
  });

  describe('3. Monthly Grid & Day Detail Modal', () => {
    beforeEach(() => {
      component.loadFleetMonthlyGrid();
    });

    it('should open day detail modal with correct day info', () => {
      const row = component.fleetMonthlyGridRows[0];
      const dayItem = row.days[0];
      component.openFleetDayDetailModal(row, dayItem);

      expect(component.isFleetDayDetailModalOpen).toBe(true);
      expect(component.fleetDayDetailTripCount).toBe(2);
      expect(component.fleetDayDetailUnitRate).toBe(1500000);
      expect(component.fleetDayDetailDispatchRef).toBe('BL-1001');
    });

    it('should save day detail and update row metrics dynamically', () => {
      const row = component.fleetMonthlyGridRows[0];
      const dayItem = row.days[0];
      component.openFleetDayDetailModal(row, dayItem);

      component.fleetDayDetailTripCount = 5;
      component.fleetDayDetailDispatchRef = 'BL-9999';
      component.saveFleetDayDetail();

      expect(component.isFleetDayDetailModalOpen).toBe(false);
      expect(dayItem.trip_count).toBe(5);
      expect(dayItem.total_amount).toBe(7500000);
      expect(row.total_trips).toBe(7); // 5 + 2
      expect(mockPersonnelApi.updateVehicleDayTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicle_id: 201,
          section_id: 10,
          trip_count: 5
        })
      );
    });
  });

  describe('4. Smart Excel Paste', () => {
    beforeEach(() => {
      component.loadVehicleMatrix();
      component.openFleetExcelPasteModal();
    });

    it('should parse TSV text and match with vehicleRows by plate or name', () => {
      component.fleetExcelPasteText = '12ع345\t3\t1600000\tBL-888\tانبار به بندر\tعادی';
      component.parseFleetExcelPaste();

      expect(component.fleetExcelParsedRows.length).toBe(1);
      expect(component.fleetExcelParsedRows[0].matchedRow).toBeDefined();
      expect(component.fleetExcelParsedRows[0].matchedRow?.driver_name).toBe('علی حسینی');
      expect(component.fleetExcelParsedRows[0].trip_count).toBe(3);
    });

    it('should apply parsed rows to matrix and flag dirty', () => {
      component.fleetExcelPasteText = 'علی حسینی\t4\t1500000\tBL-777\tمبدا مقصد\tیادداشت';
      component.parseFleetExcelPaste();
      component.applyFleetExcelPaste();

      const matched = component.vehicleRows.find(v => v.driver_name === 'علی حسینی');
      expect(matched?.trip_count).toBe(4);
      expect(matched?.dispatch_reference).toBe('BL-777');
      expect(matched?._isDirty).toBe(true);
      expect(component.hasUnsavedChanges).toBe(true);
      expect(component.isFleetExcelPasteModalOpen).toBe(false);
    });
  });

  describe('5. Driver & Vehicle Profile Redirection to employee-new-vehicle', () => {
    it('should navigate to employee-new-vehicle with new=true and section_id', () => {
      component.selectedSectionId = 10;
      component.openNewVehicleProfileModal();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle'], {
        queryParams: { new: 'true', section_id: 10 }
      });
    });

    it('should navigate to employee-new-vehicle with edit id and section_id', () => {
      component.selectedSectionId = 10;
      component.openEditVehicleProfileModal(201);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/finance/employee-new-vehicle'], {
        queryParams: { edit: 201, section_id: 10 }
      });
    });
  });

  describe('6. WebSocket Echo Filtering & Remote Conflict', () => {
    beforeEach(() => {
      (component as any).setupWebSocket();
    });

    it('should ignore WebSocket messages from the same client tab', () => {
      component.loadVehicleMatrix();
      mockPersonnelApi.getVehicleMatrix.mockClear();

      mockWsService.notifications$.next({
        type: 'fleet_trips_updated',
        client_tab_id: 'fleet-tab-test-456',
        date_shamsi: component.selectedDateShamsi,
        section_id: 10
      });

      expect(mockPersonnelApi.getVehicleMatrix).not.toHaveBeenCalled();
    });

    it('should trigger remote conflict banner if user has unsaved changes', () => {
      component.loadVehicleMatrix();
      component.hasUnsavedChanges = true;

      mockWsService.notifications$.next({
        type: 'fleet_trips_updated',
        client_tab_id: 'other-tab-999',
        date_shamsi: component.selectedDateShamsi,
        section_id: 10
      });

      expect(component.hasRemoteConflict).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith('warning', expect.stringContaining('کاربر دیگری'));
    });
  });

  describe('7. Fleet Audit Logs Modal', () => {
    it('should fetch and display audit logs for section and period', () => {
      component.openFleetAuditLogs(201);
      expect(component.isFleetAuditLogsModalOpen).toBe(true);
      expect(mockPersonnelApi.getVehicleTripAuditLogs).toHaveBeenCalledWith({
        vehicle_id: 201,
        year_month: '1405/04',
        section_id: 10
      });
      expect(component.fleetAuditLogs.length).toBe(1);
      expect(component.fleetAuditLogs[0].field_name).toBe('trip_count');

      component.closeFleetAuditLogs();
      expect(component.isFleetAuditLogsModalOpen).toBe(false);
    });
  });
});
