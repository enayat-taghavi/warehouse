// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EmployeeNewVehicleHubComponent } from './employee-new-vehicle';
import { of, throwError, Subject } from 'rxjs';
import { VehicleDriverProfile, ProjectSection, WorkflowAuditLog } from '../../../../../../core/models/personnel.model';

describe('EmployeeNewVehicleHubComponent - Phase 7 Suite (Employee Cartable & Hub)', () => {
  let component: EmployeeNewVehicleHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleSections: ProjectSection[] = [
    { id: 10, name: 'بخش ترابری مرکزی', code: 'LOG', project: 1, project_name: 'پروژه مرکزی', is_active: true }
  ];

  const sampleVehicles: VehicleDriverProfile[] = [
    {
      id: 601,
      plate_number: '11 الف 111 ایران 63',
      vehicle_type: 'pickup',
      ownership_type: 'contract',
      driver_name: 'اصغر فرهادی',
      driver_national_code: '0011111111',
      driver_phone: '09121112233',
      default_service_rate: 1800000,
      bank_name: 'بانک ملت',
      sheba_number: '780170000000101111111001',
      section: 10,
      approval_status: 'draft',
      is_active: true
    },
    {
      id: 602,
      plate_number: '22 ب 222 ایران 63',
      vehicle_type: 'nissan',
      ownership_type: 'contract',
      driver_name: 'بهرام رادان',
      driver_phone: '09122223344',
      section: 10,
      approval_status: 'pending_supervisor',
      is_active: true
    },
    {
      id: 603,
      plate_number: '33 ج 333 ایران 63',
      vehicle_type: 'khavar',
      ownership_type: 'company',
      driver_name: 'حمید جبلی',
      section: 10,
      approval_status: 'revision_required',
      rejection_reason: 'تصویر کارت خودرو ناخواناست',
      is_active: true
    },
    {
      id: 604,
      plate_number: '44 د 444 ایران 63',
      vehicle_type: 'truck',
      ownership_type: 'contract',
      driver_name: 'پژمان جمشیدی',
      section: 10,
      approval_status: 'approved',
      has_pending_changes: true,
      pending_change_request: {
        id: 701,
        proposed_changes: {
          driver_phone: '09129998877',
          vehicle_type: 'trailer'
        },
        previous_values: {
          driver_phone: '09125556677',
          vehicle_type: 'truck'
        }
      } as any,
      is_active: true
    },
    {
      id: 605,
      plate_number: '55 س 555 ایران 63',
      vehicle_type: 'sedan',
      ownership_type: 'contract',
      driver_name: 'نوید محمدزاده',
      section: 10,
      approval_status: 'rejected',
      rejection_reason: 'خودرو شرایط احراز ایمنی را کسب ننمود',
      is_active: false
    }
  ];

  beforeEach(() => {
    vi.useFakeTimers();

    mockAuth = {
      user: vi.fn().mockReturnValue({ id: 1, username: 'test_emp', is_superuser: false }),
      userPermissions: vi.fn().mockReturnValue([])
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of(sampleSections)),
      getProjectSections: vi.fn().mockReturnValue(of(sampleSections)),
      getVehicleProfiles: vi.fn().mockReturnValue(of(sampleVehicles)),
      updateVehicleProfile: vi.fn().mockImplementation((id: number, p: any) => of({ id, ...p })),
      deleteVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      submitVehicleProfile: vi.fn().mockReturnValue(of({ success: true })),
      reopenVehicleProfile: vi.fn().mockReturnValue(of({
        success: true,
        data: { id: 605, plate_number: '55 س 555 ایران 63', approval_status: 'draft' }
      })),
      cancelVehicleChangeRequest: vi.fn().mockReturnValue(of({ success: true })),
      getVehicleBankAccounts: vi.fn().mockReturnValue(of([])),
      getVehicleDocuments: vi.fn().mockReturnValue(of([])),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of([
        {
          id: 1,
          action: 'submit',
          performed_by_name: 'کارمند ترابری',
          created_at_jalali: '۱۴۰۵/۰۱/۱۵ ۱۲:۳۰',
          from_status: 'draft',
          to_status: 'pending_supervisor',
          note: 'تشکیل پرونده و ارسال به سرپرست'
        },
        {
          id: 2,
          action: 'revision',
          performed_by_name: 'سرپرست کارگاه',
          created_at_jalali: '۱۴۰۵/۰۱/۱۵ ۱۴:۰۰',
          from_status: 'pending_supervisor',
          to_status: 'revision_required',
          note: 'نقص مدرک بیمه‌نامه'
        }
      ]))
    };

    mockWs = {
      notifications$: new Subject<any>(),
      connected$: of(true)
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

    component = new EmployeeNewVehicleHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockWs,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );
    component.selectedSectionId = 10;
    component.selectedSection = sampleSections[0];
    component.recentVehicles = [...sampleVehicles];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('تسک ۷.۱: فیلترهای تب‌های وضعیت، آمار کارتابل و جستجوی چندفیلدی', () => {
    it('آمار vehicleMetrics باید تعداد دقیق هر وضعیت را محاسبه کند', () => {
      const metrics = component.vehicleMetrics;
      expect(metrics.total).toBe(5);
      expect(metrics.drafts).toBe(1);
      expect(metrics.pending).toBe(1);
      expect(metrics.revision).toBe(1);
      expect(metrics.approved).toBe(1);
      expect(metrics.rejected).toBe(1);
    });

    it('فیلتر وضعیت باید رفتاری دوحالته (Toggle) داشته باشد', () => {
      component.setStatusFilter('draft');
      expect(component.statusFilter).toBe('draft');
      expect(component.filteredVehicles.length).toBe(1);
      expect(component.filteredVehicles[0].plate_number).toBe('11 الف 111 ایران 63');

      // کلیک مجدد روی همان تب باید به all تغییر وضعیت دهد
      component.setStatusFilter('draft');
      expect(component.statusFilter).toBe('all');
      expect(component.filteredVehicles.length).toBe(5);
    });

    it('جستجوی زنده روی پلاک، راننده و کد ملی کار می‌کند', () => {
      component.searchQuery = 'بهرام';
      expect(component.filteredVehicles.length).toBe(1);
      expect(component.filteredVehicles[0].driver_name).toBe('بهرام رادان');

      component.searchQuery = '333';
      expect(component.filteredVehicles.length).toBe(1);
      expect(component.filteredVehicles[0].plate_number).toContain('333');
    });
  });

  describe('تسک ۷.۲: مودال تایملاین گردش کار و ممیزی (WorkflowAuditLog)', () => {
    it('openTimelineModal سوابق ممیزی خودرو را بارگذاری و مودال را باز می‌کند', () => {
      const v = sampleVehicles[0];
      component.openTimelineModal(v);

      expect(component.isTimelineModalOpen).toBe(true);
      expect(component.timelineVehicle).toBe(v);
      expect(mockPersonnelApi.getWorkflowAuditLogs).toHaveBeenCalledWith({
        content_type: 'vehicle',
        object_id: 601
      });
      expect(component.timelineLogs.length).toBe(2);
    });

    it('closeTimelineModal وضعیت را ریست کرده و مودال را می‌بندد', () => {
      component.openTimelineModal(sampleVehicles[0]);
      component.closeTimelineModal();

      expect(component.isTimelineModalOpen).toBe(false);
      expect(component.timelineVehicle).toBeNull();
      expect(component.timelineLogs.length).toBe(0);
    });

    it('getWorkflowActionLabel عناوین فارسی استانداردی برای اکشن‌ها برمی‌گرداند', () => {
      expect(component.getWorkflowActionLabel('submit')).toBe('ارسال به سرپرست');
      expect(component.getWorkflowActionLabel('revision')).toBe('عودت جهت اصلاح');
      expect(component.getWorkflowActionLabel('cancel_change_request')).toBe('ابطال درخواست تغییرات');
      expect(component.getWorkflowActionLabel('reopen')).toBe('بازگشایی پرونده ردشده');
    });
  });

  describe('تسک ۷.۳: کپی سریع با فیدبک ۲ ثانیه‌ای', () => {
    it('copyValue کلیپ‌بورد را فراخوانی کرده و کلید را تا ۲ ثانیه فعال نگه می‌دارد', () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true
      });

      component.copyValue('11 الف 111 ایران 63', 'plate_601', 'شماره پلاک');
      expect(component.isKeyCopied('plate_601')).toBe(true);

      // پس از ۱.۵ ثانیه همچنان true است
      vi.advanceTimersByTime(1500);
      expect(component.isKeyCopied('plate_601')).toBe(true);

      // پس از ۲.۱ ثانیه به false باز می‌گردد
      vi.advanceTimersByTime(600);
      expect(component.isKeyCopied('plate_601')).toBe(false);
    });
  });

  describe('تسک ۷.۴: مشاهده و ابطال درخواست تغییرات معلق (Change Request Cancel)', () => {
    it('openPendingDiffModal مودال تفاوت‌ها را باز کرده و فیلدهای تغییریافته را نمایش می‌دهد', () => {
      const v = sampleVehicles[3]; // vehicle with change request
      component.openPendingDiffModal(v);

      expect(component.isPendingDiffModalOpen).toBe(true);
      expect(component.pendingDiffVehicle).toBe(v);
      expect(component.getPreviousValueDisplay('driver_phone')).toBe('09125556677');
      expect(component.getProposedValueDisplay('driver_phone', '09129998877')).toBe('09129998877');
    });

    it('cancelPendingChangeRequest با تایید کاربر درخواست را ابطال و پرچم معلق را پاک می‌کند', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const v = sampleVehicles[3];

      component.cancelPendingChangeRequest(v);

      expect(mockPersonnelApi.cancelVehicleChangeRequest).toHaveBeenCalledWith(701);
      expect(v.has_pending_changes).toBe(false);
      expect(v.pending_change_request).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith('success', expect.stringContaining('ابطال'));
    });
  });

  describe('تسک ۷.۵: بازگشایی پرونده ردشده (Reopen Rejected Vehicle)', () => {
    it('reopenRejectedVehicle پرونده ردشده را بازگشایی کرده و به حالت پیش‌نویس در می‌آورد', () => {
      const rejectedVehicle = sampleVehicles[4];
      component.reopenRejectedVehicle(rejectedVehicle);

      expect(mockPersonnelApi.reopenVehicleProfile).toHaveBeenCalledWith(605);
      expect(mockToast.show).toHaveBeenCalledWith('info', expect.stringContaining('بازگشایی'));
      expect(component.isNewVehicleModalOpen).toBe(true);
      expect(component.editingVehicle?.approval_status).toBe('draft');
    });
  });

  describe('تسک ۷.۶: به‌روزرسانی درجای سطر و آمار با رویدادهای وب‌سوکت', () => {
    it('دریافت پیام وب‌سوکت سطر موجود را درجا بدون لود مجدد به‌روزرسانی می‌کند', () => {
      const wsMsg = {
        type_str: 'vehicle_updated',
        section_id: 10,
        vehicle_id: 601,
        approval_status: 'pending_supervisor',
        driver_name: 'اصغر فرهادی جدید'
      };

      component.handleVehicleWebSocketUpdate(wsMsg);

      const updated = component.recentVehicles.find(v => v.id === 601);
      expect(updated?.approval_status).toBe('pending_supervisor');
      expect(updated?.driver_name).toBe('اصغر فرهادی جدید');
    });

    it('پیام‌های مربوط به سایر بخش‌ها باید نادیده گرفته شوند', () => {
      const wsMsg = {
        type_str: 'vehicle_updated',
        section_id: 999, // other section
        vehicle_id: 601,
        approval_status: 'approved'
      };

      component.handleVehicleWebSocketUpdate(wsMsg);

      const unchanged = component.recentVehicles.find(v => v.id === 601);
      expect(unchanged?.approval_status).toBe('draft');
    });

    it('پیام حذف از وب‌سوکت سطر را از recentVehicles خارج می‌کند', () => {
      const wsMsg = {
        type_str: 'vehicle_updated',
        section_id: 10,
        vehicle_id: 601,
        action: 'deleted'
      };

      component.handleVehicleWebSocketUpdate(wsMsg);
      expect(component.recentVehicles.some(v => v.id === 601)).toBe(false);
    });
  });
});
