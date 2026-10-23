import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { PersonnelApiService } from './personnel-api.service';

describe('Fleet and Personnel Integration Frontend Fast Tests (10 Vehicles & Diverse Scenarios)', () => {
  let mockApiService: any;
  let personnelApi: PersonnelApiService;

  // نمونه داده ۱۰ خودرو در فرانت‌اند برای تست سناریوهای متنوع
  const mockTenVehicles = [
    { id: 1, driver_name: 'رضا صادقی', plate_number: '11ع111-11', vehicle_type: 'nissan', ownership_type: 'contract', default_service_rate: 1200000, sheba_number: 'IR110170000000111111111001', is_active: true },
    { id: 2, driver_name: 'محمود کریمی', plate_number: '22ع222-22', vehicle_type: 'khavar', ownership_type: 'contract', default_service_rate: 2500000, sheba_number: 'IR220170000000222222222002', is_active: true },
    { id: 3, driver_name: 'بهرام رادمنش', plate_number: '33ع333-33', vehicle_type: 'trailer', ownership_type: 'contract', default_service_rate: 7000000, sheba_number: 'IR330120000000333333333003', is_active: true },
    { id: 4, driver_name: 'اصغر مرادی', plate_number: '44ع444-44', vehicle_type: 'pickup', ownership_type: 'personal', default_service_rate: 900000, sheba_number: 'IR440170000000444444444004', is_active: true },
    { id: 5, driver_name: 'قاسم سلیمانیان', plate_number: '55ع555-55', vehicle_type: 'khavar', ownership_type: 'company', default_service_rate: 0, sheba_number: 'IR550190000000555555555005', is_active: true },
    { id: 6, driver_name: 'علی اکبر رضوانی', plate_number: 'LF-901', vehicle_type: 'other', ownership_type: 'company', default_service_rate: 0, sheba_number: 'IR660170000000666666666006', is_active: true },
    { id: 7, driver_name: 'داوود حیدری', plate_number: '77ع777-77', vehicle_type: 'truck', ownership_type: 'contract', default_service_rate: 3200000, sheba_number: 'IR770170000000777777777007', is_active: true },
    { id: 8, driver_name: 'جواد میرزایی', plate_number: '88ع888-88', vehicle_type: 'trailer', ownership_type: 'contract', default_service_rate: 6500000, sheba_number: 'IR880180000000888888888008', is_active: true },
    { id: 9, driver_name: 'سعید تقوی', plate_number: '99ع999-99', vehicle_type: 'nissan', ownership_type: 'contract', default_service_rate: 1800000, sheba_number: 'IR990170000000999999999009', is_active: true },
    { id: 10, driver_name: 'حمید گودرزی', plate_number: '10ع100-10', vehicle_type: 'pickup', ownership_type: 'personal', default_service_rate: 1100000, sheba_number: 'IR100170000000100000100010', is_active: true },
  ];

  beforeEach(() => {
    mockApiService = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      upload: vi.fn()
    };
    personnelApi = new PersonnelApiService(mockApiService as any);
  });

  it('1. should construct correct download URL for fleet monthly excel with warehouse_id', () => {
    const url = personnelApi.getFleetMonthlyExcelDownloadUrl(5, '1405/06');
    expect(url).toContain('/api/personnel/trips/export-monthly-excel/');
    expect(url).toContain('year_month=1405/06');
    expect(url).toContain('warehouse_id=5');
  });

  it('2. should construct correct cross-warehouse download URL when warehouse_id is null', () => {
    const url = personnelApi.getFleetMonthlyExcelDownloadUrl(null, '1405/06');
    expect(url).toContain('/api/personnel/trips/export-monthly-excel/');
    expect(url).toContain('year_month=1405/06');
    expect(url).not.toContain('warehouse_id=');
  });

  it('3. should construct correct download URL for fleet bank payment excel', () => {
    const url = personnelApi.getFleetBankExcelDownloadUrl(null, '1405/06');
    expect(url).toContain('/api/personnel/fleet-settlement/export-bank-excel/');
    expect(url).toContain('year_month=1405/06');
    expect(url).not.toContain('warehouse_id=');
  });

  it('4. should process 10 vehicles matrix and calculate accurate summary totals', () => {
    const mockMonthlyGridResponse = {
      year_month: '1405/06',
      is_locked: false,
      days_meta: Array.from({ length: 31 }, (_, i) => ({ day: i + 1, date_shamsi: `1405/06/${String(i + 1).padStart(2, '0')}` })),
      rows: mockTenVehicles.map((v, idx) => ({
        vehicle_id: v.id,
        driver_name: v.driver_name,
        plate_number: v.plate_number,
        ownership_type: v.ownership_type,
        default_rate: v.default_service_rate,
        total_trips: idx === 4 ? 20 : (idx < 4 ? 5 : 0),
        total_amount: v.ownership_type === 'company' ? 0 : (idx < 4 ? 5 * v.default_service_rate : 0),
        active_days: idx < 5 ? 5 : 0
      }))
    };

    mockApiService.get.mockReturnValue(of(mockMonthlyGridResponse));

    personnelApi.getVehicleMonthlyGrid(1, '1405/06').subscribe(res => {
      expect(res.rows.length).toBe(10);
      
      // محاسبه جمع کل سرویس‌ها در سمت کلاینت
      const totalTripsSum = res.rows.reduce((acc: number, r: any) => acc + r.total_trips, 0);
      expect(totalTripsSum).toBe(4 * 5 + 20); // 40 سرویس

      // بررسی خودروی شرکتی (سرویس دارد ولی مبلغ کل صفر است)
      const companyRow = res.rows.find((r: any) => r.vehicle_id === 5);
      expect(companyRow!.total_trips).toBe(20);
      expect(companyRow!.total_amount).toBe(0);

      // بررسی خودروی استیجاری
      const contractRow = res.rows.find((r: any) => r.vehicle_id === 1);
      expect(contractRow!.total_trips).toBe(5);
      expect(contractRow!.total_amount).toBe(5 * 1200000);
    });

    expect(mockApiService.get).toHaveBeenCalledWith(
      'personnel/trips/monthly-grid',
      { warehouse_id: 1, year_month: '1405/06' },
      undefined
    );
  });

  it('5. should call updateVehicleDayTrip endpoint with full payload', () => {
    const payload = {
      vehicle_id: 1,
      warehouse_id: 2,
      date_shamsi: '1405/06/15',
      trip_count: 3,
      unit_rate: 1250000,
      dispatch_reference: 'DISP-999',
      origin_destination: 'تهران - قم',
      notes: 'حمل بار حساس',
      client_tab_id: 'tab-xyz-123'
    };

    mockApiService.post.mockReturnValue(of({ message: 'ثبت شد', trip_id: 101 }));

    personnelApi.updateVehicleDayTrip(payload).subscribe(res => {
      expect(res.trip_id).toBe(101);
    });

    expect(mockApiService.post).toHaveBeenCalledWith('personnel/trips/update-day-trip/', payload);
  });

  it('6. should call calculate fleet settlement and handle 10 vehicles breakdown', () => {
    const mockSettlementData = {
      summary: {
        year_month: '1405/06',
        is_locked: false,
        total_vehicles_count: 10,
        active_contractor_count: 4,
        total_fleet_trips: 45,
        total_payable_settlement: 35000000
      },
      records: mockTenVehicles.map(v => ({
        vehicle_id: v.id,
        driver_name: v.driver_name,
        ownership_type: v.ownership_type,
        trip_count: 5,
        payable_amount: v.ownership_type === 'company' ? 0 : 5 * v.default_service_rate,
        is_payable: v.ownership_type !== 'company'
      }))
    };

    mockApiService.get.mockReturnValue(of(mockSettlementData));

    personnelApi.calculateFleetSettlement(null, '1405/06').subscribe(res => {
      expect(res.summary.total_vehicles_count).toBe(10);
      expect(res.summary.total_payable_settlement).toBe(35000000);
      
      const payableDrivers = res.records.filter((r: any) => r.is_payable);
      expect(payableDrivers.length).toBe(8); // 6 استیجاری + ۲ شخصی

      const nonPayableDrivers = res.records.filter((r: any) => !r.is_payable);
      expect(nonPayableDrivers.length).toBe(2); // ۲ شرکتی
    });

    expect(mockApiService.get).toHaveBeenCalledWith(
      'personnel/fleet-settlement/calculate/',
      { year_month: '1405/06' }
    );
  });

  it('7. should query audit logs filtered by vehicle_id and date', () => {
    const mockLogs = [
      { id: 10, driver_name: 'رضا صادقی', field_name: 'unit_rate', old_value: '1200000', new_value: '1300000', reason: 'سختی مسیر' }
    ];

    mockApiService.get.mockReturnValue(of(mockLogs));

    personnelApi.getVehicleTripAuditLogs({ vehicle_id: 1, date_shamsi: '1405/06/05' } as any).subscribe(logs => {
      expect(logs.length).toBe(1);
      expect(logs[0].field_name).toBe('unit_rate');
      expect(logs[0].new_value).toBe('1300000');
    });

    expect(mockApiService.get).toHaveBeenCalledWith('personnel/trips/audit-logs/', {
      vehicle_id: 1,
      date_shamsi: '1405/06/05'
    });
  });

  it('8. should upload Excel file for monthly matrix import', () => {
    const formData = new FormData();
    formData.append('year_month', '1405/06');
    formData.append('warehouse_id', '1');

    mockApiService.upload.mockReturnValue(of({ message: 'موفق', updated_count: 15 }));

    personnelApi.importFleetMonthlyExcel(formData).subscribe(res => {
      expect(res.updated_count).toBe(15);
    });

    expect(mockApiService.upload).toHaveBeenCalledWith(
      'personnel/trips/import-monthly-excel/',
      formData
    );
  });
});
