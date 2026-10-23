from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator
from companies.models import Company
from .base import _WarehouseCompatMixin, _WarehouseCompatManager

class InsuranceJobTitle(models.Model):
    """
    سمت‌های استاندارد شغلی و کد ۶ رقمی متناظر بیمه تامین اجتماعی (شیت Emp_info اکسل مرجع)
    """
    title = models.CharField(max_length=150, db_index=True, verbose_name="عنوان شغل / سمت")
    job_code = models.CharField(max_length=6, verbose_name="کد ۶ رقمی شغل بیمه")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "سمت و کد شغل بیمه"
        verbose_name_plural = "سمت‌ها و کدهای شغلی بیمه"
        ordering = ['title', 'job_code']
        constraints = [
            models.UniqueConstraint(
                fields=['title', 'job_code'],
                name='unique_insurance_job_title_code'
            )
        ]

    def __str__(self):
        return f"{self.title} ({self.job_code})"

class PersonnelProfile(_WarehouseCompatMixin, models.Model):
    """
    پرونده کارگزینی و اطلاعات استخدامی پرسنل (منطبق بر شیت Emp_info اکسل مرجع شرکت)
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
    MARITAL_STATUS_CHOICES = (
        ('single', 'مجرد'),
        ('married', 'متاهل'),
    )
    
    CONTRACT_TYPE_CHOICES = (
        ('daily', 'روزمزد (مبنا ۱۰ ساعت)'),
        ('hourly', 'ساعتی'),
        ('monthly', 'ماهانه قراردادی'),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personnel_profile',
        verbose_name="حساب کاربری سیستم (اختیاری)"
    )
    
    # ── ۱. اطلاعات هویتی و شناسنامه‌ای ─────────────────────────────────
    first_name = models.CharField(max_length=100, verbose_name="نام")
    last_name = models.CharField(max_length=100, verbose_name="نام خانوادگی")
    national_code = models.CharField(max_length=10, db_index=True, verbose_name="کد ملی (۱۰ رقم)")
    father_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="نام پدر")
    id_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره شناسنامه")
    id_series = models.CharField(max_length=50, blank=True, null=True, verbose_name="مسلسل شناسنامه")
    id_serial = models.CharField(max_length=50, blank=True, null=True, verbose_name="سریال شناسنامه")
    birth_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ تولد (شمسی)")
    birth_place = models.CharField(max_length=100, blank=True, null=True, verbose_name="محل تولد")
    issue_place = models.CharField(max_length=100, blank=True, null=True, verbose_name="محل صدور")
    issue_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ صدور شناسنامه")
    gender = models.CharField(max_length=10, default='مرد', verbose_name="جنسیت")
    nationality_code = models.CharField(max_length=10, default='1', verbose_name="کد ملیت (۱=ایران)")
    citizenship_country_code = models.CharField(max_length=10, default='103', verbose_name="کشور تابعیت (۱۰۳=ایران)")
    residence_country_code = models.CharField(max_length=10, default='103', verbose_name="کشور محل زندگی (۱۰۳=ایران)")
    education_level = models.CharField(max_length=50, default='4', verbose_name="مدرک تحصیلی (۴=فوق دیپلم/کاردانی)")
    marital_status = models.CharField(max_length=20, choices=MARITAL_STATUS_CHOICES, default='single', verbose_name="وضعیت تاهل")
    children_count = models.PositiveIntegerField(default=0, verbose_name="تعداد فرزند")

    # ── ۲. اطلاعات بیمه و مالیات (سازگار با دیسکت DSK و مالیات WH/WP) ───
    insurance_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره بیمه تامین اجتماعی")
    insurance_type = models.CharField(max_length=20, default='2', verbose_name="نوع بیمه")
    insurance_name = models.CharField(max_length=100, default='تامین اجتماعی', verbose_name="نام بیمه")
    exemption_type = models.CharField(max_length=20, default='1', verbose_name="نوع معافیت مالیاتی")
    job_category = models.CharField(max_length=20, default='15', verbose_name="رسته شغلی")
    job_code = models.CharField(max_length=20, blank=True, null=True, verbose_name="کد ۶ رقمی شغل بیمه")
    job_title = models.CharField(max_length=150, blank=True, default='', verbose_name="سمت شغل / عنوان شغلی")
    employment_type = models.CharField(max_length=20, default='2', verbose_name="نوع استخدام")
    status_category = models.CharField(max_length=50, default='نفرات شرکتی', verbose_name="وضعیت (شرکتی/پیمانکاری)")
    group_status = models.CharField(max_length=50, default='شاغل', verbose_name="گروه (شاغل/بازنشسته)")
    include_in_insurance = models.BooleanField(default=True, verbose_name="ارسال در لیست دیسکت بیمه")
    include_in_tax = models.BooleanField(default=True, verbose_name="ارسال در فایل مالیات حقوق")
    include_in_bank = models.BooleanField(default=True, verbose_name="ارسال در فایل واریز بانک")

    # فیلدهای تنظیمی جدول WHFildeTable و راهنمای رسمی مالیات دارایی (نسخه 1.7.0.4)
    tax_payment_type = models.CharField(max_length=10, default='1', verbose_name="نوع پرداختی مالیات (۱=ریالی / ۲=ارزی / ۳=ریالی ارزی)")
    tax_service_location = models.CharField(max_length=10, default='1', verbose_name="محل خدمت مالیات (۱=عادی / ۲=مناطق محروم / ۳=دانش‌بنیان / ۴=ماده ۱۲)")
    tax_exceptions = models.CharField(max_length=10, default='1', verbose_name="استثنائات مالیات (۱=عادی / ۲=هیئت علمی / ۳=قضات / ۴=نفت و سکوها / ۵=پزشکان)")
    tax_currency_type = models.CharField(max_length=10, default='84', verbose_name="نوع ارز مالیات (۸۴=ریال)")
    tax_currency_exchange_rate = models.DecimalField(max_digits=10, decimal_places=2, default=1.00, verbose_name="نرخ تسعیر ارز")
    tax_housing_benefit_type = models.CharField(max_length=10, default='1', verbose_name="مزایای مسکن مالیات (۱=عدم استفاده / ۲=با اثاثیه / ۳=بدون اثاثیه)")
    tax_vehicle_benefit_type = models.CharField(max_length=10, default='1', verbose_name="مزایای اتومبیل مالیات (۱=عدم استفاده / ۲=با راننده / ۳=بدون راننده)")

    # ── ۳. قرارداد، دستمزد پایه و سنوات (قانون کار) ───────────────────
    contract_type = models.CharField(max_length=10, choices=CONTRACT_TYPE_CHOICES, default='daily', verbose_name="نوع قرارداد")
    start_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ شروع به کار (شمسی)")
    end_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ پایان کار (شمسی)")
    retirement_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ بازنشستگی (شمسی)")
    valid_until_date = models.CharField(max_length=10, blank=True, null=True, verbose_name="تاریخ اعتبار پرونده (شمسی YYYY/MM/DD)")
    recommender = models.CharField(max_length=150, blank=True, null=True, verbose_name="مشخصات معرف")
    contract_hours = models.DecimalField(max_digits=8, decimal_places=2, default=230, verbose_name="ساعت کار قرارداد شده ماهانه")
    contract_base_salary = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق قرارداد شده ماهانه (ریال)")
    job_grade = models.CharField(max_length=20, default='19', verbose_name="گروه شغلی")
    daily_base_wage = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="دستمزد روزانه پایه (۱۰ ساعت)")
    daily_seniority_bonus = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="پایه سنواتی روزانه")
    base_daily_rate = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مزد مبنا روزانه (روزانه + سنوات)")
    base_years_experience = models.PositiveIntegerField(default=0, verbose_name="تعداد سال کارکرد")
    personnel_id_code = models.CharField(max_length=20, blank=True, null=True, verbose_name="کد/ردیف پرسنلی")

    # ── ۴. مزایای مستمر و فوق‌العاده‌ها (ماهانه - ریال) ───────────────
    housing_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق مسکن")
    food_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="بن خواربار / اقلام مصرفی")
    spouse_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق تاهل")
    weather_bonus = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق‌العاده بدی آب و هوا")
    asaluyeh_parsian_bonus = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق‌العاده مناطق پارسیان و عسلویه")
    remote_hardship_bonus = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق‌العاده جذب و دوری از خانواده")
    market_attraction_bonus = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق‌العاده جذب بازار کار")
    transport_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="ایاب و ذهاب و کمک رفاهی")

    # ── ۵. حساب بانکی، نشانی و اطلاعات تماس ─────────────────────────────
    bank_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=30, blank=True, null=True, verbose_name="شماره شبا")
    card_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره کارت")
    phone_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره همراه")
    postal_code = models.CharField(max_length=20, blank=True, null=True, verbose_name="کد پستی")
    address = models.TextField(blank=True, null=True, verbose_name="آدرس محل سکونت")
    notes = models.TextField(blank=True, null=True, verbose_name="توضیحات و یادداشت تکمیلی")
    attachment = models.FileField(
        upload_to='personnel_docs/',
        blank=True,
        null=True,
        verbose_name="تصویر یا فایل مدارک پرسنل (کارت ملی / شناسنامه)"
    )
    
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='personnel_profiles',
        verbose_name="شرکت متبوع"
    )
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
        related_name='personnel_profiles',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personnel_profiles',
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
        related_name='supervisor_approved_personnel',
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
        related_name='accountant_approved_personnel',
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
        related_name='manager_approved_personnel',
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
        related_name='treasury_paid_personnel',
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
        related_name='autopassed_personnel',
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
        related_name='revision_req_personnel',
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
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ بروزرسانی")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_personnel',
        verbose_name="ایجادکننده"
    )

    class Meta:
        verbose_name = "پرونده پرسنل"
        verbose_name_plural = "پرسنل و کارگزینی"
        ordering = ['last_name', 'first_name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'national_code'],
                condition=models.Q(company__isnull=False),
                name='unique_company_personnel_national_code'
            ),
            models.UniqueConstraint(
                fields=['national_code'],
                condition=models.Q(company__isnull=True),
                name='unique_global_personnel_national_code'
            )
        ]

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def effective_daily_rate(self):
        """مزد مبنا روزانه (مزد روزانه + سال کارکرد × پایه سنوات)"""
        if self.base_daily_rate and self.base_daily_rate > 0:
            return float(self.base_daily_rate)
        try:
            wage = float(self.daily_base_wage or 0)
            bonus = float(self.daily_seniority_bonus or 0)
            exp = float(self.base_years_experience or 0)
            return wage + (exp * bonus)
        except (ValueError, TypeError):
            return 0.0

    @property
    def hourly_rate(self):
        """نرخ دستمزد هر ساعت کارکرد مبنای بیمه بر مبنای ۱۰ ساعت کارکرد روزانه"""
        daily = self.effective_daily_rate
        if daily > 0:
            return round(daily / 10.0, 2)
        return 0.0

    @property
    def real_hourly_rate(self):
        """نرخ ساعتی واقعی قرارداد: حقوق قرارداد ماهانه تقسیم بر ساعات کار قرارداد شده"""
        if self.contract_hours and self.contract_hours > 0 and self.contract_base_salary and self.contract_base_salary > 0:
            return round(float(self.contract_base_salary) / float(self.contract_hours), 2)
        return None

    def save(self, *args, **kwargs):
        # انتساب خودکار شرکت از روی بخش یا پروژه در صورت خالی بودن
        if not self.company_id:
            if self.section and self.section.project and self.section.project.company_id:
                self.company_id = self.section.project.company_id
            elif self.project and self.project.company_id:
                self.company_id = self.project.company_id

        # پدینگ خودکار کد ملی به ۱۰ رقم
        if self.national_code:
            self.national_code = self.national_code.strip().zfill(10)
        # محاسبه خودکار و همگام مزد مبنا از مجموع مزد روزانه و سنوات با سال کارکرد
        try:
            wage = int(self.daily_base_wage or 0)
        except (ValueError, TypeError):
            wage = 0
        try:
            bonus = int(self.daily_seniority_bonus or 0)
        except (ValueError, TypeError):
            bonus = 0
        try:
            years = int(self.base_years_experience or 0)
        except (ValueError, TypeError):
            years = 0
        self.base_daily_rate = wage + (years * bonus)

        update_fields = kwargs.get('update_fields')
        bank_fields_touched = update_fields is None or bool(
            {'bank_name', 'account_number', 'sheba_number', 'card_number'} & set(update_fields)
        )
        # ذخیرهٔ پرونده و همگام‌سازی حساب اصلی در یک تراکنش. خطای همگام‌سازی بلعیده نمی‌شود،
        # چون بلعیدن خطای دیتابیس درون بلوک اتمیک تراکنش را مسموم می‌کند (DEF-01).
        with transaction.atomic():
            super().save(*args, **kwargs)

            # همگام‌سازی حساب بانکی اصلی از روی فیلدهای آینه، در صورت ارسال اطلاعات بانکی
            if (self.sheba_number or self.account_number) and bank_fields_touched and not getattr(self, '_skip_bank_sync', False):
                primary_acc = self.bank_accounts.filter(is_primary=True).first()
                if primary_acc:
                    if (primary_acc.bank_name != (self.bank_name or '') or
                        primary_acc.account_number != (self.account_number or '') or
                        primary_acc.sheba_number != (self.sheba_number or '') or
                        primary_acc.card_number != (self.card_number or '')):
                        primary_acc.bank_name = self.bank_name or primary_acc.bank_name
                        primary_acc.account_number = self.account_number or primary_acc.account_number
                        primary_acc.sheba_number = self.sheba_number or primary_acc.sheba_number
                        primary_acc.card_number = self.card_number or primary_acc.card_number
                        primary_acc.save()
                else:
                    PersonnelBankAccount.objects.create(
                        personnel=self,
                        bank_name=self.bank_name or 'نامشخص',
                        account_number=self.account_number or '',
                        sheba_number=self.sheba_number or '',
                        card_number=self.card_number or '',
                        is_primary=True
                    )

    def __str__(self):
        return f"{self.full_name} ({self.national_code}) - {self.job_title}"

class PersonnelBankAccount(models.Model):
    """
    حساب‌های بانکی و شماره‌های شبای رسمی پرسنل (پشتیبانی از چند حسابی با الگوی CompanyBankAccount)
    """
    personnel = models.ForeignKey(
        'PersonnelProfile',
        on_delete=models.CASCADE,
        related_name='bank_accounts',
        verbose_name="پرونده پرسنل"
    )
    bank_name = models.CharField(max_length=100, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=34, verbose_name="شماره شبا (IR...)")
    card_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره کارت")
    is_primary = models.BooleanField(default=False, verbose_name="حساب اصلی / پیش‌فرض واریز حقوق")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    description = models.CharField(max_length=250, blank=True, null=True, verbose_name="توضیحات / عنوان حساب")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "حساب بانکی پرسنل"
        verbose_name_plural = "حساب‌های بانکی پرسنل"
        ordering = ['-is_primary', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['personnel'],
                condition=models.Q(is_primary=True),
                name='unique_primary_personnel_bank_account'
            )
        ]

    def __str__(self):
        return f"{self.personnel.full_name} - {self.bank_name} ({self.sheba_number})"

    def save(self, *args, **kwargs):
        # پاک‌سازی و نرمال‌سازی شبا
        if self.sheba_number:
            raw = self.sheba_number.strip().upper()
            if not raw.startswith('IR') and raw.isdigit() and len(raw) == 24:
                raw = f"IR{raw}"
            self.sheba_number = raw

        with transaction.atomic():
            # قفل ردیف پرونده تا تغییرهای هم‌زمان حساب‌های یک پرسنل پشت سر هم اجرا شوند
            list(PersonnelProfile.objects.select_for_update().filter(pk=self.personnel_id).values_list('pk', flat=True))

            # اگر اولین حساب این پرسنل است، خودکار اصلی شود
            if not self.pk and not PersonnelBankAccount.objects.filter(personnel_id=self.personnel_id).exists():
                self.is_primary = True

            # قید یکتایی حساب اصلی یک partial unique index غیرقابل‌تعویق است؛
            # پس حساب اصلی قبلی باید پیش از ذخیرهٔ این حساب خاموش شود (DEF-01).
            if self.is_primary:
                other_primaries = PersonnelBankAccount.objects.filter(personnel_id=self.personnel_id, is_primary=True)
                if self.pk:
                    other_primaries = other_primaries.exclude(pk=self.pk)
                other_primaries.update(is_primary=False)

            super().save(*args, **kwargs)

            # آینهٔ حساب اصلی روی پرونده فقط از همین‌جا نوشته می‌شود
            if self.is_primary:
                PersonnelProfile.objects.filter(pk=self.personnel_id).update(
                    bank_name=self.bank_name,
                    account_number=self.account_number,
                    sheba_number=self.sheba_number,
                    card_number=self.card_number
                )

    def delete(self, *args, **kwargs):
        pers_id = self.personnel_id
        with transaction.atomic():
            # همان قفل save(): دو حذف هم‌زمان پرونده را بی‌حساب اصلی نمی‌گذارند
            list(PersonnelProfile.objects.select_for_update().filter(pk=pers_id).values_list('pk', flat=True))
            # وضعیت «اصلی» پس از قفل از دیتابیس خوانده می‌شود، نه از نمونهٔ احتمالاً کهنهٔ حافظه
            was_primary = PersonnelBankAccount.objects.filter(pk=self.pk, is_primary=True).exists() if self.pk else self.is_primary
            result = super().delete(*args, **kwargs)
            if was_primary:
                # فقط حساب فعال جانشین حساب اصلی می‌شود؛ حقوق به حساب غیرفعال هدایت نمی‌شود
                remaining = PersonnelBankAccount.objects.filter(
                    personnel_id=pers_id, is_active=True
                ).order_by('-created_at', '-id').first()
                if remaining:
                    remaining.is_primary = True
                    remaining.save()
                else:
                    PersonnelProfile.objects.filter(pk=pers_id).update(
                        bank_name=None,
                        account_number=None,
                        sheba_number=None,
                        card_number=None
                    )
        return result

class PersonnelDocument(models.Model):
    """
    مدارک چندگانه پرسنل (کارت ملی، شناسنامه، قرارداد، سایر)
    """
    DOC_TYPE_CHOICES = (
        ('national_card', 'کارت ملی'),
        ('birth_certificate', 'شناسنامه'),
        ('contract', 'قرارداد پرسنلی'),
        ('other', 'سایر مدارک'),
    )
    personnel = models.ForeignKey(
        'PersonnelProfile',
        on_delete=models.CASCADE,
        related_name='documents',
        verbose_name="پرونده پرسنل"
    )
    doc_type = models.CharField(
        max_length=30,
        choices=DOC_TYPE_CHOICES,
        default='other',
        verbose_name="نوع مدرک"
    )
    file = models.FileField(
        upload_to='personnel_docs/',
        verbose_name="فایل پیوست"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_personnel_docs',
        verbose_name="بارگذاری‌کننده"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ بارگذاری")

    class Meta:
        verbose_name = "مدرک پرسنل"
        verbose_name_plural = "مدارک پرسنل"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.personnel.full_name} - {self.get_doc_type_display()}"

class PersonnelSectionAssignment(models.Model):
    """
    انتساب سازمانی پرسنل به بخش‌ها و پروژه‌های مختلف با حفظ استقلال سمت و دستمزد
    """
    personnel = models.ForeignKey(
        'PersonnelProfile',
        on_delete=models.CASCADE,
        related_name='section_assignments',
        verbose_name="پرسنل"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.CASCADE,
        related_name='personnel_assignments',
        verbose_name="بخش/دپارتمان پروژه"
    )
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='personnel_assignments',
        verbose_name="پروژه مالی/عملیاتی"
    )
    job_title = models.CharField(
        max_length=150,
        blank=True,
        null=True,
        verbose_name="سمت / شغل در این بخش"
    )
    daily_base_wage = models.DecimalField(
        max_digits=14,
        decimal_places=0,
        default=0,
        verbose_name="دستمزد روزانه مصوب این بخش (ریال)"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="فعال در این بخش"
    )
    assigned_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="تاریخ انتساب به بخش"
    )

    class Meta:
        verbose_name = "انتساب پرسنل به بخش"
        verbose_name_plural = "انتساب‌های پرسنل به بخش‌ها"
        unique_together = ('personnel', 'section')

    def save(self, *args, **kwargs):
        if not self.project_id and self.section and self.section.project_id:
            self.project_id = self.section.project_id
        if not self.job_title and self.personnel:
            self.job_title = self.personnel.job_title
        if (not self.daily_base_wage or self.daily_base_wage == 0) and self.personnel:
            self.daily_base_wage = self.personnel.daily_base_wage
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.personnel.full_name} -> {self.section.name} ({self.job_title})"

class PersonnelChangeRequest(models.Model):
    """
    پیش‌نویس درخواست تغییرات اطلاعات پرسنل (Pending Edit Staging)
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

    personnel = models.ForeignKey(
        PersonnelProfile,
        on_delete=models.CASCADE,
        related_name='change_requests',
        verbose_name="پرسنل هدف"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='personnel_change_requests',
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
        related_name='reviewed_sup_personnel_changes',
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
        related_name='reviewed_acc_personnel_changes',
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
        related_name='reviewed_mgr_personnel_changes',
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
        related_name='autopassed_p_changes',
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
        related_name='revision_req_p_changes',
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
        verbose_name = "درخواست تغییرات پرسنل"
        verbose_name_plural = "درخواست‌های تغییرات پرسنل"
        ordering = ['-created_at']

    def __str__(self):
        return f"درخواست تغییرات {self.personnel.full_name} ({self.get_status_display()})"
