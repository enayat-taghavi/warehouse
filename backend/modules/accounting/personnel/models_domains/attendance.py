from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator
from companies.models import Company
from .base import _WarehouseCompatMixin, _WarehouseCompatManager

class MonthlyWorkPeriod(_WarehouseCompatMixin, models.Model):
    """
    دوره ماهانه کارکرد (جهت قفل کردن سوابق پس از محاسبه حقوق و گزارش‌ها)
    """
    _warehouse_field = 'warehouse'
    _warehouse_id_field = 'warehouse_id'

    @property
    def warehouse(self):
        """سازگاری رو به عقب — انبار مربوطه، بدون وابستگی به اپ انبار."""
        return self._wh_obj()

    @warehouse.setter
    def warehouse(self, val):
        self.warehouse_id = getattr(val, 'id', val) if val is not None else None
        self._wh_cached = val if (val is None or hasattr(val, 'id')) else None
    PERIOD_STATUS_CHOICES = (
        ('OPEN', 'باز (امکان ثبت و ویرایش)'),
        ('SUBMITTED_SUPERVISOR', 'تایید و ارسال سرپرست انبار'),
        ('SUBMITTED_ACCOUNTANT', 'تایید و ارسال حسابدار'),
        ('READY_TO_PAY', 'تایید مدیر / آماده پرداخت خزانه‌داری'),
        ('PAID', 'پرداخت و تسویه قطعی خزانه‌داری'),
        ('SUBMITTED', 'ارسال‌شده جهت بررسی مالی'),
        ('LOCKED', 'تایید نهایی و قفل‌شده'),
        ('FINALIZED', 'قطعی و تسویه‌شده'),
        ('REVISION_REQUIRED', 'نیازمند بازنگری و اصلاح'),
        ('REJECTED', 'رد شده و نیازمند بازبینی'),
    )

    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='monthly_work_periods',
        verbose_name="شرکت متبوع"
    )
    warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='warehouse_id',
        verbose_name="انبار مربوطه"
    )
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monthly_work_periods',
        verbose_name="پروژه مالی مربوطه"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monthly_work_periods',
        verbose_name="بخش/دپارتمان مربوطه"
    )
    year_month = models.CharField(max_length=7, db_index=True, verbose_name="سال و ماه (مثال ۱۴۰۴/۰۵)")
    status = models.CharField(max_length=25, choices=PERIOD_STATUS_CHOICES, default='OPEN', verbose_name="وضعیت دوره")
    
    # چرخه بررسی ۵ سطحی
    submitted_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان ارسال جهت بررسی")
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_work_periods',
        verbose_name="ارسال‌کننده جهت بررسی"
    )
    submission_notes = models.TextField(blank=True, null=True, verbose_name="یادداشت سرپرست هنگام ارسال")
    rejection_reason = models.TextField(blank=True, null=True, verbose_name="علت رد توسط حسابداری")

    supervisor_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sup_approved_work_periods',
        verbose_name="سرپرست تاییدکننده"
    )
    supervisor_approved_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تایید سرپرست")
    accountant_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='acc_approved_work_periods',
        verbose_name="حسابدار تاییدکننده"
    )
    accountant_approved_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تایید حسابدار")
    manager_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mgr_approved_work_periods',
        verbose_name="مدیر تاییدکننده"
    )
    manager_approved_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تایید مدیر")
    treasury_paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='treasury_paid_work_periods',
        verbose_name="خزانه‌دار تسویه‌کننده"
    )
    treasury_paid_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان پرداخت خزانه‌دار")
    payment_tracking_code = models.CharField(max_length=100, blank=True, null=True, verbose_name="کد رهگیری بانکی تسویه")
    payment_batch_id = models.CharField(max_length=100, blank=True, null=True, verbose_name="شناسه دسته پرداخت پایا")

    revision_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revision_req_work_periods',
        verbose_name="درخواست‌دهنده بازنگری"
    )
    revision_requested_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان بازنگری")

    locked_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان قفل")
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='locked_work_periods',
        verbose_name="قفل‌کننده"
    )
    notes = models.TextField(blank=True, null=True, verbose_name="توضیحات دوره")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "دوره کارکرد ماهانه"
        verbose_name_plural = "دوره‌های کارکرد ماهانه"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'warehouse_id', 'year_month'],
                condition=models.Q(company__isnull=False, warehouse_id__isnull=False),
                name='unique_company_warehouse_year_month_period'
            ),
            models.UniqueConstraint(
                fields=['company', 'year_month'],
                condition=models.Q(company__isnull=False, warehouse_id__isnull=True),
                name='unique_company_year_month_period'
            ),
            models.UniqueConstraint(
                fields=['warehouse_id', 'year_month'],
                condition=models.Q(company__isnull=True),
                name='unique_warehouse_year_month_period'
            ),
        ]
        ordering = ['-year_month']

    def save(self, *args, **kwargs):
        # انتساب خودکار شرکت از روی انبار در صورت خالی بودن (طرح راه میانهٔ ماژولار گام ۳)
        if not self.company_id and self.warehouse_id:
            try:
                from platform_core.registry import company_of
                cid = company_of('warehouse', self.warehouse_id)
                if cid:
                    self.company_id = cid
            except Exception:
                pass
        super().save(*args, **kwargs)


    def __str__(self):
        wh = self.warehouse
        wh_name = wh.name if wh else '—'
        return f"دوره {self.year_month} - انبار {wh_name} ({self.get_status_display()})"

    def to_journal_lines(self):
        """پیاده‌سازی پروتکل AccountingDocumentSource برای تسویه و پرداخت خزانه‌داری (تسک ۷۳)."""
        from decimal import Decimal
        from platform_core.accounting_protocol import JournalLine
        total_net = sum(Decimal(str(r.payable_amount or 0)) for r in self.payroll_records.all())
        cost_center = f"WH-{self.warehouse_id}" if self.warehouse_id else None
        desc = f"سند پرداخت خزانه‌داری دوره حقوق {self.year_month}"
        return [
            JournalLine(
                account_code="4102",  # بدهکار کردن حساب حقوق پرداختنی کارکنان (تسویه تعهد)
                side="debit",
                amount=total_net,
                cost_center_code=cost_center,
                description=desc,
            ),
            JournalLine(
                account_code="1101",  # بستانکار کردن موجودی نقد و بانک خزانه‌داری (خروج وجه)
                side="credit",
                amount=total_net,
                cost_center_code=cost_center,
                description=desc,
            ),
        ]

class DailyAttendance(_WarehouseCompatMixin, models.Model):
    """
    کارکرد روزانه پرسنل (ثبت ماتریسی و سریع)
    """
    _warehouse_field = 'warehouse'
    _warehouse_id_field = 'warehouse_id'

    @property
    def warehouse(self):
        """سازگاری رو به عقب — انبار، بدون وابستگی به اپ انبار."""
        return self._wh_obj()

    @warehouse.setter
    def warehouse(self, val):
        self.warehouse_id = getattr(val, 'id', val) if val is not None else None
        self._wh_cached = val if (val is None or hasattr(val, 'id')) else None
    STATUS_CHOICES = (
        ('PRESENT_10H', 'حاضر کامل (۱۰ ساعت)'),
        ('HALF_5H', 'نیمه‌وقت (۵ ساعت)'),
        ('ABSENT', 'غایب (۰ ساعت)'),
        ('LEAVE', 'مرخصی'),
        ('MISSION', 'مأموریت'),
        ('FRIDAY_WORK', 'جمعه‌کاری'),
        ('CUSTOM', 'ساعت سفارشی'),
    )
    APPROVAL_STATUS_CHOICES = (
        ('DRAFT', 'پیش‌نویس اولیه'),
        ('PENDING_SUPERVISOR', 'در انتظار بررسی و تایید سرپرست'),
        ('APPROVED', 'تایید نهایی سرپرست کارگاه'),
        ('REVISION_REQUIRED', 'عودت داده‌شده جهت اصلاح و بازنگری'),
    )

    personnel = models.ForeignKey(
        'personnel.PersonnelProfile',
        on_delete=models.CASCADE,
        related_name='daily_attendances',
        verbose_name="پرسنل"
    )
    warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='warehouse_id',
        verbose_name="انبار"
    )
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='daily_attendances',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='daily_attendances',
        verbose_name="بخش/دپارتمان پروژه"
    )
    date_shamsi = models.CharField(max_length=10, db_index=True, verbose_name="تاریخ شمسی (مثال ۱۴۰۴/۰۵/۱۲)")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PRESENT_10H', verbose_name="وضعیت حضور")
    approval_status = models.CharField(
        max_length=25,
        choices=APPROVAL_STATUS_CHOICES,
        default='PENDING_SUPERVISOR',
        db_index=True,
        verbose_name="وضعیت چرخه تایید"
    )
    supervisor_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_daily_attendances',
        verbose_name="سرپرست تاییدکننده"
    )
    supervisor_approved_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تایید سرپرست")
    revision_reason = models.TextField(blank=True, null=True, verbose_name="علت عودت و بازنگری سرپرست")
    revision_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revised_daily_attendances',
        verbose_name="درخواست‌دهنده بازنگری"
    )
    revision_requested_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان عودت و بازنگری")
    
    effective_hours = models.DecimalField(max_digits=5, decimal_places=2, default=10.00, verbose_name="ساعات کارکرد موثر")
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="ساعات اضافه‌کار")
    is_friday_work = models.BooleanField(default=False, verbose_name="جمعه‌کاری")
    is_mission = models.BooleanField(default=False, verbose_name="روز مأموریت")
    advance_payment = models.DecimalField(max_digits=12, decimal_places=0, default=0, verbose_name="مساعده دریافتی روزانه (ریال)")
    
    notes = models.CharField(max_length=255, blank=True, null=True, verbose_name="توضیحات سرپرست")
    period = models.ForeignKey(
        MonthlyWorkPeriod,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendances',
        verbose_name="دوره ماهانه"
    )
    
    is_deleted = models.BooleanField(default=False, verbose_name="حذف منطقی")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_attendances',
        verbose_name="ثبت‌کننده"
    )
    modified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='modified_attendances',
        verbose_name="ویرایش‌کننده"
    )

    class Meta:
        verbose_name = "کارکرد روزانه پرسنل"
        verbose_name_plural = "کارکردهای روزانه پرسنل"
        indexes = [
            models.Index(fields=['warehouse_id', 'date_shamsi']),
            models.Index(fields=['personnel', 'date_shamsi']),
            models.Index(fields=['section', 'date_shamsi']),
        ]
        ordering = ['-date_shamsi', 'personnel__last_name']

    def __str__(self):
        return f"{self.personnel.full_name} | {self.date_shamsi} | {self.get_status_display()} ({self.effective_hours}h)"

class AttendanceAuditLog(models.Model):
    """
    لاگ ممیزی و تاریخچه تغییرات کارکرد پرسنل (بدون حذف، جهت نظارت مدیر)
    """
    attendance = models.ForeignKey(
        DailyAttendance,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        verbose_name="رکورد کارکرد"
    )
    personnel_name = models.CharField(max_length=150, verbose_name="نام پرسنل")
    date_shamsi = models.CharField(max_length=10, verbose_name="تاریخ کارکرد")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="کاربر ویرایش‌کننده"
    )
    changed_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان تغییر")
    field_name = models.CharField(max_length=100, verbose_name="نام فیلد")
    old_value = models.TextField(blank=True, null=True, verbose_name="مقدار قبلی")
    new_value = models.TextField(blank=True, null=True, verbose_name="مقدار جدید")
    reason = models.CharField(max_length=255, blank=True, null=True, verbose_name="دلیل ویرایش")

    class Meta:
        verbose_name = "لاگ ممیزی کارکرد"
        verbose_name_plural = "لاگ‌های ممیزی کارکرد"
        ordering = ['-changed_at']

    def __str__(self):
        return f"تغییر {self.field_name} برای {self.personnel_name} در {self.date_shamsi}"

class VehicleTripLog(_WarehouseCompatMixin, models.Model):
    """
    لاگ سرویس‌های انجام‌شده توسط خودروها
    """
    _warehouse_field = 'warehouse'
    _warehouse_id_field = 'warehouse_id'

    @property
    def warehouse(self):
        """سازگاری رو به عقب — انبار، بدون وابستگی به اپ انبار."""
        return self._wh_obj()

    @warehouse.setter
    def warehouse(self, val):
        self.warehouse_id = getattr(val, 'id', val) if val is not None else None
        self._wh_cached = val if (val is None or hasattr(val, 'id')) else None
    vehicle = models.ForeignKey(
        'personnel.VehicleDriverProfile',
        on_delete=models.PROTECT,
        related_name='trip_logs',
        verbose_name="خودرو و راننده"
    )
    warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='warehouse_id',
        verbose_name="انبار"
    )
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicle_trip_logs',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicle_trip_logs',
        verbose_name="بخش/دپارتمان پروژه"
    )
    date_shamsi = models.CharField(max_length=10, db_index=True, verbose_name="تاریخ شمسی")
    trip_count = models.PositiveIntegerField(default=1, verbose_name="تعداد سرویس")
    unit_rate = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مبلغ هر سرویس (ریال)")
    total_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مبلغ کل (ریال)")
    
    dispatch_reference = models.CharField(max_length=100, blank=True, null=True, verbose_name="شماره حواله خروج / بارنامه")
    origin_destination = models.CharField(max_length=255, blank=True, null=True, verbose_name="مبدأ و مقصد")
    notes = models.TextField(blank=True, null=True, verbose_name="توضیحات")
    
    period = models.ForeignKey(
        MonthlyWorkPeriod,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicle_trips',
        verbose_name="دوره ماهانه"
    )
    
    is_settled = models.BooleanField(default=False, verbose_name="تسویه شده")
    settled_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان تسویه")
    settled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settled_trips',
        verbose_name="کاربر تسویه‌کننده"
    )
    payment_tracking_code = models.CharField(max_length=100, blank=True, null=True, verbose_name="کد رهگیری پرداخت بانکی")
    
    is_deleted = models.BooleanField(default=False, verbose_name="حذف منطقی")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_trips',
        verbose_name="ثبت‌کننده"
    )

    class Meta:
        verbose_name = "سرویس خودرو"
        verbose_name_plural = "سرویس‌های خودروها"
        indexes = [
            models.Index(fields=['warehouse_id', 'date_shamsi']),
            models.Index(fields=['vehicle', 'date_shamsi']),
            models.Index(fields=['section', 'date_shamsi']),
        ]
        ordering = ['-date_shamsi', '-created_at']

    def clean(self):
        super().clean()
        if self.vehicle_id and self.date_shamsi:
            from ..fleet_lifecycle_services import assert_vehicle_trip_allowed, VehicleWorkflowError
            from django.core.exceptions import ValidationError
            try:
                assert_vehicle_trip_allowed(self.vehicle, self.date_shamsi)
            except VehicleWorkflowError as e:
                raise ValidationError({'vehicle': str(e.message or e)})

    def save(self, *args, **kwargs):
        if not self.total_amount:
            self.total_amount = (self.unit_rate or 0) * (self.trip_count or 1)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.vehicle.driver_name} | {self.date_shamsi} | {self.trip_count} سرویس ({self.total_amount:,} ریال)"

    def to_journal_lines(self):
        """پیاده‌سازی پروتکل AccountingDocumentSource برای تسویه سرویس ناوگان (تسک ۷۳)."""
        from decimal import Decimal
        from platform_core.accounting_protocol import JournalLine
        amt = Decimal(str(self.total_amount or 0))

        cost_center = None
        try:
            if self.project and self.section:
                cost_center = f"{self.project.code}-{self.section.code}"
        except Exception:
            pass

        driver_name = "نامشخص"
        detail = None
        try:
            if self.vehicle:
                driver_name = self.vehicle.driver_name
                detail = getattr(self.vehicle, 'driver_national_code', None) or f"DRV-{self.vehicle.id}"
        except Exception:
            pass

        desc = f"کرایه سرویس خودرو {driver_name} - تاریخ {self.date_shamsi}"
        return [
            JournalLine(
                account_code="6103",  # هزینه حمل و نقل و ناوگان
                side="debit",
                amount=amt,
                cost_center_code=cost_center,
                detail_code=detail,
                description=desc,
            ),
            JournalLine(
                account_code="4105",  # حساب بستانکاران ناوگان و رانندگان
                side="credit",
                amount=amt,
                cost_center_code=cost_center,
                detail_code=detail,
                description=desc,
            ),
        ]

class VehicleTripAuditLog(models.Model):
    """
    لاگ ممیزی و تاریخچه تغییرات تردد و سرویس‌های ناوگان (بدون حذف، جهت نظارت مدیر)
    """
    trip = models.ForeignKey(
        VehicleTripLog,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        verbose_name="رکورد سرویس ناوگان"
    )
    driver_name = models.CharField(max_length=150, verbose_name="نام راننده")
    plate_number = models.CharField(max_length=30, blank=True, null=True, verbose_name="پلاک")
    date_shamsi = models.CharField(max_length=10, verbose_name="تاریخ کارکرد")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="کاربر ویرایش‌کننده"
    )
    changed_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان تغییر")
    field_name = models.CharField(max_length=100, verbose_name="نام فیلد")
    old_value = models.TextField(blank=True, null=True, verbose_name="مقدار قبلی")
    new_value = models.TextField(blank=True, null=True, verbose_name="مقدار جدید")
    reason = models.CharField(max_length=255, blank=True, null=True, verbose_name="دلیل ویرایش")

    class Meta:
        verbose_name = "لاگ ممیزی ناوگان"
        verbose_name_plural = "لاگ‌های ممیزی ناوگان"
        ordering = ['-changed_at']

    def __str__(self):
        return f"تغییر {self.field_name} برای {self.driver_name} در {self.date_shamsi}"
