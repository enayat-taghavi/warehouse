from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator
from companies.models import Company
from .base import _WarehouseCompatMixin, _WarehouseCompatManager

class VehicleDriverProfile(_WarehouseCompatMixin, models.Model):
    """
    پرونده راننده و ناوگان خودرویی شرکت
    """
    _warehouse_field = 'assigned_warehouse'
    _warehouse_id_field = 'assigned_warehouse_id'

    @property
    def assigned_warehouse(self):
        """سازگاری رو به عقب — انبار تخصیص‌یافته، بدون وابستگی به اپ انبار."""
        return self._wh_obj()

    @assigned_warehouse.setter
    def assigned_warehouse(self, val):
        self.assigned_warehouse_id = getattr(val, 'id', val) if val is not None else None
        self._wh_cached = val if (val is None or hasattr(val, 'id')) else None
    VEHICLE_TYPE_CHOICES = (
        ('pickup', 'وانت'),
        ('nissan', 'نیسان'),
        ('khavar', 'خاور'),
        ('sedan', 'سواری'),
        ('truck', 'کامیون تک/جفت'),
        ('trailer', 'تریلی'),
        ('forklift', 'لیفتراک'),
        ('other', 'سایر'),
    )

    OWNERSHIP_CHOICES = (
        ('contract', 'استیجاری / پیمانکاری سرویسی'),
        ('company', 'خودرو شرکتی'),
        ('personal', 'خودرو ملکی راننده'),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicle_profile',
        verbose_name="حساب کاربری راننده (اختیاری)"
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='vehicles',
        verbose_name="شرکت متبوع"
    )
    plate_number = models.CharField(max_length=30, db_index=True, verbose_name="شماره پلاک")
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='nissan', verbose_name="نوع خودرو")
    ownership_type = models.CharField(max_length=20, choices=OWNERSHIP_CHOICES, default='contract', verbose_name="نوع مالکیت")
    driver_name = models.CharField(max_length=150, verbose_name="نام و نام خانوادگی راننده")
    driver_national_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="کد ملی راننده")
    driver_phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره تماس راننده")
    
    is_driver_owner = models.BooleanField(default=True, verbose_name="مالک شخص راننده است")
    owner_name = models.CharField(max_length=150, blank=True, null=True, verbose_name="نام و نام خانوادگی مالک")
    owner_national_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="کد ملی مالک")
    owner_phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره تماس مالک")
    
    default_service_rate = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(Decimal(0))],
        verbose_name="نرخ پایه پیش‌فرض به ازای هر سرویس (ریال)"
    )
    
    bank_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=30, blank=True, null=True, verbose_name="شماره شبا")
    notes = models.TextField(blank=True, null=True, verbose_name="توضیحات و یادداشت تکمیلی")

    insurance_expiry_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ انقضای بیمه‌نامه (شمسی)")
    inspection_expiry_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ انقضای معاینه فنی (شمسی)")
    license_expiry_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ انقضای گواهینامه رانندگی (شمسی)")
    valid_until_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ اعتبار همکاری (شمسی)")
    end_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ قطع همکاری (شمسی)")
    
    assigned_warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='assigned_warehouse_id',
        verbose_name="انبار تخصیص‌یافته"
    )
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_vehicles',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_vehicles',
        verbose_name="بخش/دپارتمان پروژه"
    )
    
    APPROVAL_STATUS_CHOICES = (
        ('draft', 'پیش‌نویس کارمند انبار'),
        ('pending_supervisor', 'در انتظار تایید سرپرست انبار'),
        ('supervisor_approved', 'تایید سرپرست / در انتظار حسابدار'),
        ('pending_accountant', 'در انتظار بررسی حسابدار'),
        ('accountant_approved', 'تایید حسابدار / در انتظار مدیر'),
        ('pending_manager', 'در انتظار تایید مدیر'),
        ('manager_approved', 'تایید مدیر / در انتظار حسابدار'),
        ('approved', 'تصویب و فعال شده'),
        ('ready_to_pay', 'تایید مدیر / آماده پرداخت خزانه‌داری'),
        ('paid', 'پرداخت و تسویه نهایی شده'),
        ('revision_required', 'نیازمند بازنگری و اصلاح'),
        ('rejected', 'رد شده / ابطال'),
    )
    approval_status = models.CharField(
        max_length=30,
        choices=APPROVAL_STATUS_CHOICES,
        default='draft',
        db_index=True,
        verbose_name="وضعیت تایید"
    )
    supervisor_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supervisor_approved_vehicles',
        verbose_name="سرپرست تاییدکننده"
    )
    supervisor_approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="تاریخ و ساعت تایید سرپرست"
    )
    accountant_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='accountant_approved_vehicles',
        verbose_name="حسابدار تاییدکننده"
    )
    accountant_approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="تاریخ و ساعت تایید حسابدار"
    )
    manager_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='manager_approved_vehicles',
        verbose_name="مدیر تاییدکننده"
    )
    manager_approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="تاریخ و ساعت تایید مدیر"
    )
    treasury_paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='treasury_paid_vehicles',
        verbose_name="خزانه‌دار پرداخت‌کننده"
    )
    treasury_paid_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="تاریخ و ساعت پرداخت خزانه‌دار"
    )
    payment_tracking_code = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="شماره پیگیری / کد رهگیری بانکی"
    )
    payment_method = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        default='PAYA',
        verbose_name="روش پرداخت (پایا / ساتنا / کارت / چک / نقدی)"
    )
    is_auto_passed = models.BooleanField(
        default=False,
        verbose_name="تایید شده با اصل عبور هوشمند"
    )
    auto_passed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='autopassed_vehicles',
        verbose_name="کاربر ثبت‌کننده عبور هوشمند"
    )
    auto_passed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان عبور هوشمند"
    )
    rejection_reason = models.TextField(
        blank=True,
        null=True,
        verbose_name="دلیل رد یا بازنگری"
    )
    revision_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revision_req_vehicles',
        verbose_name="درخواست‌دهنده بازنگری"
    )
    revision_requested_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان درخواست بازنگری"
    )
    has_pending_changes = models.BooleanField(
        default=False,
        verbose_name="دارای درخواست تغییرات معلق"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_vehicles',
        verbose_name="ایجادکننده"
    )

    class Meta:
        verbose_name = "خودرو و راننده"
        verbose_name_plural = "ناوگان و خودروها"
        ordering = ['driver_name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(default_service_rate__gte=0),
                name='vehicle_default_rate_gte_0'
            ),
            models.UniqueConstraint(
                fields=['company', 'plate_number'],
                condition=models.Q(company__isnull=False),
                name='unique_company_vehicle_plate'
            ),
            models.UniqueConstraint(
                fields=['plate_number'],
                condition=models.Q(company__isnull=True),
                name='unique_global_vehicle_plate'
            )
        ]

    def save(self, *args, **kwargs):
        if not self.company_id:
            if self.section and self.section.project and self.section.project.company_id:
                self.company_id = self.section.project.company_id
            elif self.project and self.project.company_id:
                self.company_id = self.project.company_id

        update_fields = kwargs.get('update_fields')
        bank_fields_touched = update_fields is None or bool(
            {'bank_name', 'account_number', 'sheba_number'} & set(update_fields)
        )
        with transaction.atomic():
            super().save(*args, **kwargs)

            # همگام‌سازی معکوس حساب بانکی اصلی از روی فیلدهای آینه (الگوی PersonnelProfile.save و DEF-01)
            if (self.sheba_number or self.account_number) and bank_fields_touched and not getattr(self, '_skip_bank_sync', False):
                primary_acc = self.bank_accounts.filter(is_primary=True).first()
                if primary_acc:
                    if (primary_acc.bank_name != (self.bank_name or '') or
                        primary_acc.account_number != (self.account_number or '') or
                        primary_acc.sheba_number != (self.sheba_number or '')):
                        primary_acc.bank_name = self.bank_name or primary_acc.bank_name
                        primary_acc.account_number = self.account_number or primary_acc.account_number
                        primary_acc.sheba_number = self.sheba_number or primary_acc.sheba_number
                        primary_acc.save()
                else:
                    VehicleBankAccount.objects.create(
                        vehicle=self,
                        bank_name=self.bank_name or 'نامشخص',
                        account_number=self.account_number or '',
                        sheba_number=self.sheba_number or '',
                        is_primary=True,
                        payee_type='driver' if self.is_driver_owner else 'owner'
                    )

    def __str__(self):
        return f"{self.driver_name} - {self.get_vehicle_type_display()} ({self.plate_number})"

class VehicleBankAccount(models.Model):
    """
    حساب‌های بانکی و شماره‌های شبای رسمی ناوگان و رانندگان (پشتیبانی از چند حسابی و SoD)
    """
    PAYEE_TYPE_CHOICES = (
        ('driver', 'راننده'),
        ('owner', 'مالک خودرو'),
        ('other', 'سایر / شخص ثالث'),
    )

    vehicle = models.ForeignKey(
        'VehicleDriverProfile',
        on_delete=models.CASCADE,
        related_name='bank_accounts',
        verbose_name="پرونده خودرو و راننده"
    )
    bank_name = models.CharField(max_length=100, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=34, verbose_name="شماره شبا (IR...)")
    card_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره کارت")
    account_owner_name = models.CharField(max_length=150, blank=True, null=True, verbose_name="نام صاحب حساب")
    account_owner_national_code = models.CharField(max_length=10, blank=True, null=True, verbose_name="کد ملی صاحب حساب")
    payee_type = models.CharField(max_length=20, choices=PAYEE_TYPE_CHOICES, default='driver', verbose_name="نوع ذینفع")
    is_primary = models.BooleanField(default=False, verbose_name="حساب اصلی / پیش‌فرض واریز کرایه")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    description = models.CharField(max_length=250, blank=True, null=True, verbose_name="توضیحات / عنوان حساب")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "حساب بانکی خودرو"
        verbose_name_plural = "حساب‌های بانکی خودرو"
        ordering = ['-is_primary', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['vehicle'],
                condition=models.Q(is_primary=True),
                name='unique_primary_vehicle_bank_account'
            )
        ]

    def __str__(self):
        return f"{self.vehicle.plate_number} - {self.bank_name} ({self.sheba_number})"

    def save(self, *args, **kwargs):
        # پاک‌سازی و نرمال‌سازی شبا
        if self.sheba_number:
            raw = self.sheba_number.strip().upper()
            if not raw.startswith('IR') and raw.isdigit() and len(raw) == 24:
                raw = f"IR{raw}"
            self.sheba_number = raw

        with transaction.atomic():
            # قفل ردیف پرونده تا تغییرهای هم‌زمان حساب‌های یک خودرو پشت سر هم اجرا شوند
            list(VehicleDriverProfile.objects.select_for_update().filter(pk=self.vehicle_id).values_list('pk', flat=True))

            # اگر اولین حساب این خودرو است، خودکار اصلی شود
            if not self.pk and not VehicleBankAccount.objects.filter(vehicle_id=self.vehicle_id).exists():
                self.is_primary = True

            # قید یکتایی حساب اصلی یک partial unique index غیرقابل‌تعویق است؛
            # پس حساب اصلی قبلی باید پیش از ذخیرهٔ این حساب خاموش شود (DEF-01).
            if self.is_primary:
                other_primaries = VehicleBankAccount.objects.filter(vehicle_id=self.vehicle_id, is_primary=True)
                if self.pk:
                    other_primaries = other_primaries.exclude(pk=self.pk)
                other_primaries.update(is_primary=False)

            super().save(*args, **kwargs)

            # آینهٔ حساب اصلی روی پرونده فقط از همین‌جا نوشته می‌شود (فقط ۳ فیلد موجود: ب-۱۵)
            if self.is_primary:
                VehicleDriverProfile.objects.filter(pk=self.vehicle_id).update(
                    bank_name=self.bank_name,
                    account_number=self.account_number,
                    sheba_number=self.sheba_number
                )

    def delete(self, *args, **kwargs):
        veh_id = self.vehicle_id
        with transaction.atomic():
            list(VehicleDriverProfile.objects.select_for_update().filter(pk=veh_id).values_list('pk', flat=True))
            was_primary = VehicleBankAccount.objects.filter(pk=self.pk, is_primary=True).exists() if self.pk else self.is_primary
            result = super().delete(*args, **kwargs)
            if was_primary:
                remaining = VehicleBankAccount.objects.filter(
                    vehicle_id=veh_id, is_active=True
                ).order_by('-created_at', '-id').first()
                if remaining:
                    remaining.is_primary = True
                    remaining.save()
                else:
                    VehicleDriverProfile.objects.filter(pk=veh_id).update(
                        bank_name=None,
                        account_number=None,
                        sheba_number=None
                    )
        return result

class VehicleDocument(models.Model):
    """
    مدارک چندگانه ناوگان و خودرو (بیمه‌نامه، معاینه فنی، گواهینامه، کارت خودرو، قرارداد، سایر)
    """
    DOC_TYPE_CHOICES = (
        ('insurance', 'بیمه‌نامه شخص ثالث'),
        ('inspection', 'معاینه فنی'),
        ('license', 'گواهینامه رانندگی'),
        ('car_card', 'کارت خودرو / برگ سبز'),
        ('contract', 'قرارداد همکاری'),
        ('other', 'سایر مدارک'),
    )
    vehicle = models.ForeignKey(
        'VehicleDriverProfile',
        on_delete=models.CASCADE,
        related_name='documents',
        verbose_name="پرونده خودرو و راننده"
    )
    doc_type = models.CharField(
        max_length=30,
        choices=DOC_TYPE_CHOICES,
        default='other',
        verbose_name="نوع مدرک"
    )
    file = models.FileField(
        upload_to='vehicle_docs/%Y/%m/',
        verbose_name="فایل پیوست"
    )
    title = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        verbose_name="عنوان مدرک"
    )
    issue_date = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        verbose_name="تاریخ صدور (شمسی)"
    )
    expiry_date = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        verbose_name="تاریخ انقضا (شمسی)"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_vehicle_docs',
        verbose_name="بارگذاری‌کننده"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ بارگذاری")

    class Meta:
        verbose_name = "مدرک خودرو"
        verbose_name_plural = "مدارک خودرو"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.vehicle.plate_number} - {self.get_doc_type_display()}"

class VehicleChangeRequest(models.Model):
    """
    پیش‌نویس درخواست تغییرات اطلاعات خودرو و راننده (Pending Edit Staging)
    """
    CHANGE_STATUS_CHOICES = (
        ('draft', 'پیش‌نویس کارمند انبار'),
        ('pending_supervisor', 'در انتظار بررسی سرپرست انبار'),
        ('supervisor_approved', 'تایید سرپرست / در انتظار حسابدار'),
        ('pending_accountant', 'در انتظار بررسی حسابدار'),
        ('accountant_approved', 'تایید حسابدار / در انتظار مدیر'),
        ('pending_manager', 'در انتظار بررسی مدیر'),
        ('manager_approved', 'تایید مدیر / در انتظار حسابدار'),
        ('approved', 'تایید نهایی و اعمال شده'),
        ('revision_required', 'نیازمند بازنگری و اصلاح'),
        ('rejected', 'رد شده'),
        ('cancelled', 'لغو شده'),
    )

    vehicle = models.ForeignKey(
        VehicleDriverProfile,
        on_delete=models.CASCADE,
        related_name='change_requests',
        verbose_name="خودرو/راننده هدف"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='vehicle_change_requests',
        verbose_name="درخواست‌دهنده"
    )
    proposed_changes = models.JSONField(
        default=dict,
        verbose_name="فیلدهای تغییریافته (داده‌های جدید)"
    )
    previous_values = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="مقادیر پیشین (جهت مقایسه)"
    )
    status = models.CharField(
        max_length=30,
        choices=CHANGE_STATUS_CHOICES,
        default='pending_manager',
        db_index=True,
        verbose_name="وضعیت درخواست"
    )
    supervisor_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_sup_vehicle_changes',
        verbose_name="سرپرست بررسی‌کننده"
    )
    supervisor_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان بررسی سرپرست"
    )
    accountant_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_acc_vehicle_changes',
        verbose_name="حسابدار بررسی‌کننده"
    )
    accountant_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان بررسی حسابدار"
    )
    manager_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_mgr_vehicle_changes',
        verbose_name="مدیر بررسی‌کننده"
    )
    manager_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان بررسی مدیر"
    )
    is_auto_passed = models.BooleanField(
        default=False,
        verbose_name="اعمال شده با عبور هوشمند"
    )
    auto_passed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='autopassed_v_changes',
        verbose_name="کاربر عبور هوشمند"
    )
    auto_passed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان عبور هوشمند"
    )
    rejection_reason = models.TextField(
        blank=True,
        null=True,
        verbose_name="توضیحات و دلیل رد"
    )
    revision_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revision_req_v_changes',
        verbose_name="درخواست‌دهنده بازنگری"
    )
    revision_requested_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان درخواست بازنگری"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت درخواست")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین بروزرسانی")

    class Meta:
        verbose_name = "درخواست تغییرات خودرو"
        verbose_name_plural = "درخواست‌های تغییرات خودروها"
        ordering = ['-created_at']

    def __str__(self):
        return f"درخواست تغییرات {self.vehicle.driver_name} - {self.vehicle.plate_number} ({self.get_status_display()})"

    # بخش و شرکت گردش موتور از خودروی هدف (طرح ۴.۶، د۲؛ فقط‌خواندنی، بی ستون تازه)
    @property
    def wf_section_id(self):
        return self.vehicle.section_id if self.vehicle_id else None

    @property
    def wf_company_id(self):
        return self.vehicle.company_id if self.vehicle_id else None
