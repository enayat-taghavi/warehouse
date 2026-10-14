// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { EmployeeNewPersonnelHubComponent } from './employee-new-personnel';
import { PersonnelProfile, WorkflowAuditLog } from '../../../../../../core/models/personnel.model';

describe('EmployeeNewPersonnelHubComponent - Phase 7 Comprehensive Unit Tests', () => {
  let component: EmployeeNewPersonnelHubComponent;
  let mockAuth: any;
  let mockPersonnelApi: any;
  let mockWs: any;
  let mockToast: any;
  let mockCdr: any;
  let mockRoute: any;
  let mockRouter: any;

  const sampleApprovedPersonnel: PersonnelProfile = {
    id: 301,
    first_name: 'رضا',
    last_name: 'بهرامی',
    full_name: 'رضا بهرامی',
    national_code: '0010376488',
    father_name: 'مهدی',
    job_title: 'کمک انباردار',
    job_code: '123456',
    contract_type: 'daily',
    marital_status: 'married',
    children_count: 1,
    daily_base_wage: 7500000,
    phone_number: '09121234567',
    bank_name: 'بانک ملت',
    sheba_number: 'IR120120000000123456789012',
    account_number: '123456789012',
    section: 101,
    approval_status: 'approved',
    has_pending_changes: true,
    pending_change_request: {
      id: 55,
      status: 'pending_supervisor',
      proposed_changes: { phone_number: '09129999999' },
      previous_values: { phone_number: '09121234567' }
    },
    is_active: true
  };

  const sampleDraftPersonnel: PersonnelProfile = {
    id: 302,
    first_name: 'امید',
    last_name: 'مرادی',
    full_name: 'امید مرادی',
    national_code: '0020376489',
    job_title: 'کارگر ساده انبار',
    contract_type: 'daily',
    section: 101,
    approval_status: 'draft',
    is_active: true,
    marital_status: 'single',
    children_count: 0,
    daily_base_wage: 0
  };

  const mockLogs: WorkflowAuditLog[] = [
    {
      id: 1,
      content_type: 'personnel',
      object_id: 301,
      action: 'create',
      from_status: '',
      to_status: 'draft',
      actor_name: 'کارمند انبار',
      created_at: '2026-10-01T10:00:00Z',
      created_at_shamsi: '1405/07/09 13:30'
    },
    {
      id: 2,
      content_type: 'personnel',
      object_id: 301,
      action: 'submit',
      from_status: 'draft',
      to_status: 'pending_supervisor',
      actor_name: 'کارمند انبار',
      created_at: '2026-10-01T10:05:00Z',
      created_at_shamsi: '1405/07/09 13:35'
    },
    {
      id: 3,
      content_type: 'personnel',
      object_id: 301,
      action: 'approve_supervisor',
      from_status: 'pending_supervisor',
      to_status: 'pending_accountant',
      actor_name: 'سرپرست بخش',
      reason: 'مدارک و مشخصات تایید شد.',
      created_at: '2026-10-01T11:00:00Z',
      created_at_shamsi: '1405/07/09 14:30'
    }
  ];

  beforeEach(() => {
    vi.useFakeTimers();

    mockAuth = {
      currentUserValue: { id: 10, username: 'testuser', role: 'employee' },
      user: () => ({ id: 10, username: 'testuser', role: 'employee' })
    };

    mockPersonnelApi = {
      getMySections: vi.fn().mockReturnValue(of([{ id: 101, name: 'بخش ابنیه', code: 'ABN' }])),
      getPersonnelProfiles: vi.fn().mockReturnValue(of([{ ...sampleApprovedPersonnel }, { ...sampleDraftPersonnel }])),
      getJobTitles: vi.fn().mockReturnValue(of({ job_titles: ['کارگر ساده انبار', 'کمک انباردار'], items: [] })),
      getWorkflowAuditLogs: vi.fn().mockReturnValue(of(mockLogs)),
      cancelPersonnelChangeRequest: vi.fn().mockReturnValue(of({ status: 'success', message: 'درخواست تغییرات ابطال شد.' }))
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
      queryParams: of({ section_id: '101' })
    };

    mockRouter = {
      navigate: vi.fn()
    };

    component = new EmployeeNewPersonnelHubComponent(
      mockAuth,
      mockPersonnelApi,
      mockWs,
      mockToast,
      mockCdr,
      mockRoute,
      mockRouter
    );

    component.selectedSectionId = 101;
    component.recentPersonnel = [{ ...sampleApprovedPersonnel }, { ...sampleDraftPersonnel }];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // تسک ۷.۱: تایملاین بصری گردش کار، اکشن‌بج‌ها و کپی سریع با فیدبک ۲ ثانیه‌ای
  // ════════════════════════════════════════════════════════════════════════════
  describe('تسک ۷.۱: تایملاین بصری گردش کار و کپی سریع ۲ ثانیه‌ای', () => {
    it('متد openTimelineModal باید وضعیت بارگذاری را فعال کرده و لاگ‌ها را دریافت کند', () => {
      component.openTimelineModal(sampleApprovedPersonnel);

      expect(component.isTimelineModalOpen).toBe(true);
      expect(component.timelinePersonnel).toBe(sampleApprovedPersonnel);
      expect(mockPersonnelApi.getWorkflowAuditLogs).toHaveBeenCalledWith({
        content_type: 'personnel',
        object_id: 301
      });
      expect(component.isLoadingTimeline).toBe(false);
      expect(component.timelineLogs.length).toBe(3);
    });

    it('متد closeTimelineModal باید مودال را ببندد و داده‌ها را پاکسازی کند', () => {
      component.openTimelineModal(sampleApprovedPersonnel);
      expect(component.isTimelineModalOpen).toBe(true);

      component.closeTimelineModal();
      expect(component.isTimelineModalOpen).toBe(false);
      expect(component.timelinePersonnel).toBeNull();
      expect(component.timelineLogs.length).toBe(0);
    });

    it('توابع نگاشت اکشن‌های گردش کار باید برچسب‌ها، آیکون‌ها و کلاس‌های صحیح را بازگردانند', () => {
      expect(component.getWorkflowActionLabel('submit')).toBe('ارسال به سرپرست');
      expect(component.getWorkflowActionLabel('approve_supervisor')).toBe('تایید سرپرست');
      expect(component.getWorkflowActionLabel('approve_manager')).toBe('تصویب نهایی مدیر');
      expect(component.getWorkflowActionLabel('revision')).toBe('عودت جهت اصلاح');
      expect(component.getWorkflowActionLabel('reject')).toBe('رد پرونده');
      expect(component.getWorkflowActionLabel('cancel_change_request')).toBe('ابطال درخواست تغییرات');

      expect(component.getWorkflowActionIcon('submit')).toBe('📤');
      expect(component.getWorkflowActionIcon('approve_manager')).toBe('🌟');
      expect(component.getWorkflowActionIcon('reject')).toBe('✕');
      expect(component.getWorkflowActionIcon('cancel_change_request')).toBe('🚫');

      expect(component.getWorkflowActionBadgeClass('submit')).toContain('purple');
      expect(component.getWorkflowActionBadgeClass('approve_manager')).toContain('emerald');
      expect(component.getWorkflowActionBadgeClass('reject')).toContain('rose');
    });

    it('متد copyValue باید مقدار را کپی کرده، پرچم کلید را فعال و پس از ۲ ثانیه ریست کند', () => {
      component.copyValue('09121234567', 'phone_301', 'شماره همراه');

      expect(component.isKeyCopied('phone_301')).toBe(true);
      expect(component.isKeyCopied('other_key')).toBe(false);

      // جلو بردن زمان به میزان ۱.۹ ثانیه (هنوز باید فعال باشد)
      vi.advanceTimersByTime(1900);
      expect(component.isKeyCopied('phone_301')).toBe(true);

      // جلو بردن زمان به میزان ۲۰۰ میلی‌ثانیه دیگر (مجموع ۲.۱ ثانیه، باید ریست شده باشد)
      vi.advanceTimersByTime(200);
      expect(component.isKeyCopied('phone_301')).toBe(false);
    });

    it('کپی‌های پیاپی باید تایمر قبلی را لغو کرده و کلید جدید را فعال نگه دارند', () => {
      component.copyValue('IR120120000000123456789012', 'sheba_301', 'شماره شبا');
      expect(component.isKeyCopied('sheba_301')).toBe(true);

      vi.advanceTimersByTime(1000);

      component.copyValue('123456789012', 'acc_301', 'شماره حساب');
      expect(component.isKeyCopied('sheba_301')).toBe(false);
      expect(component.isKeyCopied('acc_301')).toBe(true);

      vi.advanceTimersByTime(2100);
      expect(component.isKeyCopied('acc_301')).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // تسک ۷.۲: فرم درخواست تغییرات پرسنل مصوب و ابطال درخواست
  // ════════════════════════════════════════════════════════════════════════════
  describe('تسک ۷.۲: فرم درخواست تغییرات و ابطال درخواست معلق', () => {
    it('برای پرسنل مصوب، isApprovedRecord باید true باشد', () => {
      component.openEditModal(sampleApprovedPersonnel);
      expect(component.isApprovedRecord).toBe(true);
      expect(component.modalHeaderTitle).toBe('ویرایش و پیشنهاد تغییرات پرونده مصوب');
    });

    it('متد cancelPendingChangeRequest در صورت رد در تاییدیه confirm نباید API را فراخوانی کند', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.cancelPendingChangeRequest(sampleApprovedPersonnel);

      expect(mockPersonnelApi.cancelPersonnelChangeRequest).not.toHaveBeenCalled();
      expect(mockToast.show).not.toHaveBeenCalled();
    });

    it('متد cancelPendingChangeRequest در صورت تایید باید API را فراخوانی کرده و فلگ را پاک کند', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const target = { ...sampleApprovedPersonnel };

      component.cancelPendingChangeRequest(target);

      expect(mockPersonnelApi.cancelPersonnelChangeRequest).toHaveBeenCalledWith(55);
      expect(mockToast.show).toHaveBeenCalledWith('success', 'درخواست تغییرات ابطال شد.');
      expect(target.has_pending_changes).toBe(false);
      expect(target.pending_change_request).toBeNull();
    });

    it('در صورت بروز خطا در ابطال درخواست، باید پیام خطا با توست نمایش داده شود', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockPersonnelApi.cancelPersonnelChangeRequest = vi.fn().mockReturnValue(
        throwError(() => ({ error: { error: 'عدم دسترسی به لغو درخواست' } }))
      );

      component.cancelPendingChangeRequest(sampleApprovedPersonnel);

      expect(component.isCancellingChangeRequest).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith('error', expect.stringContaining('عدم دسترسی'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // تسک ۷.۳: ارگونومی کارت‌های موبایل
  // ════════════════════════════════════════════════════════════════════════════
  describe('تسک ۷.۳: ارگونومی کارت‌های موبایل', () => {
    it('شماره تماس پرسنل باید برای دایلر موبایل با getCleanTelUrl استانداردسازی شود', () => {
      expect(component.getCleanTelUrl('۰۹۱۲-۱۲۳-۴۵۶۷')).toBe('tel:09121234567');
      expect(component.getCleanTelUrl('0912 123 4567')).toBe('tel:09121234567');
      expect(component.getCleanTelUrl(undefined)).toBe('');
    });

    it('فرمت شماره شبا باید در موبایل در گروه‌های ۴ رقمی مجزا نمایش داده شود', () => {
      const display = component.formatShebaDisplay('IR120120000000123456789012');
      expect(display).toBe('IR12 0120 0000 0012 3456 7890 12');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // تسک ۷.۴: به‌روزرسانی درجای سطر و شمارنده‌ها با رویداد personnel_updated
  // ════════════════════════════════════════════════════════════════════════════
  describe('تسک ۷.۴: به‌روزرسانی درجای سطر و شمارنده‌ها با وب‌سوکت', () => {
    it('پیام personnel_updated برای پرسنل موجود باید سطر را درجا به‌روز کند بدون لود کامل لیست', () => {
      const loadSpy = vi.spyOn(component, 'loadRecentPersonnel');

      component.handlePersonnelWebSocketUpdate({
        type: 'personnel_updated',
        section_id: 101,
        personnel_id: 302,
        approval_status: 'pending_supervisor',
        job_title: 'کمک انباردار ارشد'
      });

      // رکورد ۳۰۲ درجا تغییر کرده است
      const updated = component.recentPersonnel.find(p => p.id === 302);
      expect(updated?.approval_status).toBe('pending_supervisor');
      expect(updated?.job_title).toBe('کمک انباردار ارشد');

      // نباید کل لیست دوباره از سرور خوانده شود
      expect(loadSpy).not.toHaveBeenCalled();

      // شمارنده‌های personnelMetrics باید بی‌درنگ منعکس شوند
      const metrics = component.personnelMetrics;
      expect(metrics.drafts).toBe(0); // قبلاً ۱ پیش‌نویس بود، اکنون ۰ شد
      expect(metrics.pending).toBe(1); // قبلاً ۰ در انتظار بود، اکنون ۱ شد
      expect(metrics.approved).toBe(1);
    });

    it('اگر مودال همان پرونده باز باشد، editingPersonnel نیز باید به صورت زنده همگام شود', () => {
      component.openEditModal(component.recentPersonnel.find(p => p.id === 302)!);
      expect(component.editingPersonnel?.approval_status).toBe('draft');

      component.handlePersonnelWebSocketUpdate({
        type: 'personnel_updated',
        section_id: 101,
        personnel_id: 302,
        approval_status: 'revision_required',
        rejection_reason: 'نقص مدرک کارت ملی'
      });

      expect(component.editingPersonnel?.approval_status).toBe('revision_required');
      expect(component.editingPersonnel?.rejection_reason).toBe('نقص مدرک کارت ملی');
    });

    it('رویداد action: deleted باید رکورد را بلافاصله از آرایه recentPersonnel حذف کند', () => {
      expect(component.recentPersonnel.length).toBe(2);

      component.handlePersonnelWebSocketUpdate({
        type: 'personnel_updated',
        section_id: 101,
        personnel_id: 302,
        action: 'deleted'
      });

      expect(component.recentPersonnel.length).toBe(1);
      expect(component.recentPersonnel.find(p => p.id === 302)).toBeUndefined();
    });

    it('رویداد مربوط به بخش غیرمجاز نباید در لیست بخش فعلی تغییری ایجاد کند', () => {
      const initialCount = component.recentPersonnel.length;

      component.handlePersonnelWebSocketUpdate({
        type: 'personnel_updated',
        section_id: 999, // بخش متفرقه
        personnel_id: 9999,
        approval_status: 'approved'
      });

      expect(component.recentPersonnel.length).toBe(initialCount);
    });
  });
});
