from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator


class _WarehouseCompatQuerySet(models.QuerySet):
    def _remap_wh_filter(self, k):
        if k == 'warehouse':
            return 'warehouse_id'
        if k.startswith('warehouse__'):
            return 'warehouse_id' + k[len('warehouse'):]
        if k == 'assigned_warehouse':
            return 'assigned_warehouse_id'
        if k.startswith('assigned_warehouse__'):
            return 'assigned_warehouse_id' + k[len('assigned_warehouse'):]
        return k

    def filter(self, *args, **kwargs):
        new_kwargs = {}
        for k, v in kwargs.items():
            new_k = self._remap_wh_filter(k)
            new_v = getattr(v, 'id', v) if (new_k.endswith('_id') and hasattr(v, 'id')) else v
            new_kwargs[new_k] = new_v
        return super().filter(*args, **new_kwargs)

    def get_or_create(self, defaults=None, **kwargs):
        new_kwargs = {}
        for k, v in kwargs.items():
            new_k = self._remap_wh_filter(k)
            new_v = getattr(v, 'id', v) if (new_k.endswith('_id') and hasattr(v, 'id')) else v
            new_kwargs[new_k] = new_v
        return super().get_or_create(defaults=defaults, **new_kwargs)


class _WarehouseCompatManager(models.Manager.from_queryset(_WarehouseCompatQuerySet)):
    pass


class _WarehouseCompatMixin(models.Model):
    """
    فاز ۴ — سازگاری رو به عقب برای FK→عدد (جدا کردن حسابداری از اپ انبار).

    نامِ فیلد قدیمیِ `assigned_warehouse`/`warehouse` به‌عنوان kwarg مدل پذیرفته و
    به ستون عددیِ `_id` مپ می‌شود تا کدهای موجود (شامل تست‌ها) بدون تغییر کار کنند.
    هر مدل، `_warehouse_field` و `_warehouse_id_field` را تعیین و پراپرتیِ هم‌نامِ
    فیلد قدیمی را ارائه می‌دهد.
    """
    _warehouse_field = ''      # نام فیلد قدیمی (مثلاً 'assigned_warehouse' یا 'warehouse')
    _warehouse_id_field = ''   # نام ستون عددی (مثلاً 'assigned_warehouse_id' یا 'warehouse_id')

    objects = _WarehouseCompatManager()

    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        src = self._warehouse_field
        if src and src in kwargs:
            val = kwargs.pop(src)
            id_field = self._warehouse_id_field
            if id_field not in kwargs and val is not None:
                kwargs[id_field] = getattr(val, 'id', val)
        super().__init__(*args, **kwargs)

    def _wh_obj(self):
        """خواندن انبار مرتبط در صورت نصب بودن اپ انبار (با کشِ per-instance)."""
        id_field = self._warehouse_id_field
        wh_id = getattr(self, id_field, None)
        if not wh_id:
            return None
        if hasattr(self, '_wh_cached'):
            return self._wh_cached
        from django.apps import apps
        if apps.is_installed('warehouses'):
            Warehouse = apps.get_model('warehouses', 'Warehouse')
            obj = Warehouse.objects.filter(id=wh_id).first()
        else:
            obj = None
        self._wh_cached = obj
        return obj

# ==============================================================================
# 0. مدل‌های ساختار سازمانی، شرکت، پروژه، بخش و فاکتور هزینه‌ای (مستقل از انبارگردانی)
# ==============================================================================

class Company(models.Model):
    """
    موجودیت حقوقی شرکت (هلدینگ و شرکت‌های زیرمجموعه)
    """
    code = models.CharField(max_length=50, unique=True, verbose_name="کد یکتای شرکت")
    name = models.CharField(max_length=200, verbose_name="نام کامل شرکت")
    national_id = models.CharField(max_length=20, blank=True, null=True, verbose_name="شناسه ملی ۱۱ رقمی")
    economic_code = models.CharField(max_length=50, blank=True, null=True, verbose_name="کد اقتصادی")
    registration_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره ثبت")
    phone = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره تلفن")
    address = models.TextField(blank=True, null=True, verbose_name="نشانی دفتر مرکزی")
    ceo_name = models.CharField(max_length=150, blank=True, null=True, verbose_name="نام مدیرعامل")
    logo = models.ImageField(upload_to='company_logos/', blank=True, null=True, verbose_name="لوگوی شرکت")
    is_active = models.BooleanField(default=True, verbose_name="وضعیت فعال")
    has_warehouse_module = models.BooleanField(
        default=True,
        verbose_name="دسترسی به سامانه انبارداری و انبارگردانی"
    )

    # فیلدهای حقوقی و ثبتی تکمیلی
    company_type = models.CharField(
        max_length=50,
        choices=[
            ('private_joint_stock', 'سهامی خاص'),
            ('public_joint_stock', 'سهامی عام'),
            ('limited_liability', 'با مسئولیت محدود'),
            ('cooperative', 'تعاونی'),
            ('holding', 'هلدینگ / شرکت مادر'),
            ('other', 'سایر')
        ],
        default='private_joint_stock',
        verbose_name="نوع شرکت"
    )
    registration_date = models.DateField(null=True, blank=True, verbose_name="تاریخ ثبت")
    registered_capital = models.BigIntegerField(null=True, blank=True, verbose_name="سرمایه ثبتی (ریال)")
    shares_count = models.BigIntegerField(null=True, blank=True, verbose_name="تعداد سهام")
    share_nominal_value = models.BigIntegerField(null=True, blank=True, verbose_name="ارزش اسمی هر سهم (ریال)")
    fiscal_year_start_month = models.IntegerField(default=1, verbose_name="ماه شروع سال مالی (۱ تا ۱۲)")

    # ارکان حاکمیتی و صاحبان امضا (ماده ۱۰۹ و ۱۱۸ لایحه اصلاحی قانون تجارت)
    board_chairman = models.CharField(max_length=150, null=True, blank=True, verbose_name="رئیس هیئت‌مدیره")
    board_vice_chairman = models.CharField(max_length=150, null=True, blank=True, verbose_name="نایب‌رئیس هیئت‌مدیره")
    main_inspector = models.CharField(max_length=150, null=True, blank=True, verbose_name="بازرس اصلی")
    alternate_inspector = models.CharField(max_length=150, null=True, blank=True, verbose_name="بازرس علی‌البدل")
    authorized_signers = models.TextField(null=True, blank=True, verbose_name="صاحبان امضای مجاز و حدود اختیارات")
    board_term_expiry = models.DateField(null=True, blank=True, verbose_name="تاریخ انقضای دوره تصدی هیئت‌مدیره")

    # تنظیمات کارگاهی بیمه تأمین اجتماعی (منطبق بر دیسکت DSKKAR00.DBF)
    workshop_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد کارگاه تأمین اجتماعی (۱۰ رقم)")
    social_security_branch_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد شعبه تأمین اجتماعی")
    social_security_branch_name = models.CharField(max_length=100, null=True, blank=True, verbose_name="نام شعبه تأمین اجتماعی")
    contract_row = models.CharField(max_length=20, null=True, blank=True, verbose_name="ردیف پیمان بیمه")
    employer_name = models.CharField(max_length=150, null=True, blank=True, verbose_name="نام کارفرما در لیست بیمه")

    # تنظیمات سامانه مودیان مالیاتی و نشانی قانونی
    postal_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد پستی ۱۰ رقمی اقامتگاه قانونی")
    tax_memory_id = models.CharField(max_length=20, null=True, blank=True, verbose_name="شناسه یکتای حافظه مالیاتی (۶ کاراکتر)")
    tax_economic_code = models.CharField(max_length=50, null=True, blank=True, verbose_name="کد اقتصادی جدید ۱۶ رقمی")

    # اطلاعات خزانه‌داری، بانکی و تسویه پایا
    primary_bank_name = models.CharField(max_length=100, null=True, blank=True, verbose_name="نام بانک اصلی")
    primary_account_number = models.CharField(max_length=50, null=True, blank=True, verbose_name="شماره حساب رسمی")
    primary_iban = models.CharField(max_length=34, null=True, blank=True, verbose_name="شماره شبا رسمی (IR...)")

    # دسترسی سریع به دو سند مادر
    articles_of_association = models.FileField(upload_to='company_core_docs/', null=True, blank=True, verbose_name="فایل اساسنامه")
    latest_gazette = models.FileField(upload_to='company_core_docs/', null=True, blank=True, verbose_name="فایل آخرین روزنامه رسمی")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ایجاد")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "شرکت"
        verbose_name_plural = "شرکت‌ها"
        ordering = ['code']

    def __str__(self):
        return f"{self.name} ({self.code})"


class CompanyDocument(models.Model):
    """
    بایگانی و آرشیو مدارک، اسناد، مجوزها و قراردادهای شرکت
    """
    DOCUMENT_TYPES = [
        ('statute', 'اساسنامه شرکت'),
        ('establishment_gazette', 'روزنامه رسمی تأسیس'),
        ('changes_gazette', 'روزنامه رسمی آخرین تغییرات هیئت‌مدیره'),
        ('auditors_gazette', 'روزنامه رسمی تمدید بازرسان'),
        ('capital_gazette', 'روزنامه رسمی تغییرات سرمایه و آدرس'),
        ('vat_certificate', 'گواهی ثبت‌نام ارزش افزوده'),
        ('tax_clearance', 'مفاصاحساب مالیاتی / بیمه‌ای'),
        ('commercial_card', 'کارت بازرگانی'),
        ('contractor_qualification', 'گواهی رتبه‌بندی / صلاحیت پیمانکاری (ساجار)'),
        ('labor_safety_certificate', 'گواهی صلاحیت ایمنی پیمانکاران (اداره کار)'),
        ('operating_license', 'پروانه بهره‌برداری / جواز فعالیت'),
        ('lease_contract', 'سند مالکیت / اجاره‌نامه رسمی'),
        ('master_agreement', 'قرارداد مادر یا تفاهم‌نامه'),
        ('other', 'سایر مدارک و اسناد رسمی')
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='documents', verbose_name="شرکت متبوع")
    document_type = models.CharField(max_length=50, choices=DOCUMENT_TYPES, default='other', verbose_name="نوع مدرک")
    title = models.CharField(max_length=200, verbose_name="عنوان مدرک")
    file = models.FileField(upload_to='company_documents/', verbose_name="فایل ضمیمه")
    file_size = models.BigIntegerField(default=0, verbose_name="اندازه فایل به بایت")
    issue_date = models.DateField(null=True, blank=True, verbose_name="تاریخ صدور")
    expiry_date = models.DateField(null=True, blank=True, verbose_name="تاریخ انقضا")
    is_confidential = models.BooleanField(default=False, verbose_name="سند محرمانه (صرفاً مدیران ارشد)")
    version = models.IntegerField(default=1, verbose_name="شماره ویرایش / نسخه")
    is_superseded = models.BooleanField(default=False, verbose_name="سند منسوخ / جایگزین شده با نسخه جدید")
    description = models.TextField(blank=True, null=True, verbose_name="توضیحات و نکات")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="کاربر بارگذاری‌کننده")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "مدرک شرکت"
        verbose_name_plural = "مدارک و اسناد شرکت‌ها"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.company.name} - {self.get_document_type_display()} - {self.title}"

    @property
    def expiry_status(self):
        """
        محاسبه وضعیت انقضا:
        permanent: بدون تاریخ انقضا
        expired: منقضی شده
        expiring_soon: کمتر از ۳۰ روز مانده
        valid: معتبر
        """
        if not self.expiry_date:
            return 'permanent'
        from django.utils import timezone
        today = timezone.now().date()
        diff = (self.expiry_date - today).days
        if diff < 0:
            return 'expired'
        elif diff <= 30:
            return 'expiring_soon'
        return 'valid'

    @property
    def days_until_expiry(self):
        if not self.expiry_date:
            return None
        from django.utils import timezone
        return (self.expiry_date - timezone.now().date()).days


class CompanyBankAccount(models.Model):
    """
    حساب‌های بانکی و شماره‌های شبای رسمی شرکت (پشتیبانی از چند حسابی)
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='bank_accounts',
        verbose_name="شرکت متبوع"
    )
    bank_name = models.CharField(max_length=100, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=34, verbose_name="شماره شبا (IR...)")
    account_title = models.CharField(max_length=150, blank=True, null=True, verbose_name="عنوان/کاربرد حساب (مثلاً: واریز حقوق، تنخواه، بازرگانی)")
    is_primary = models.BooleanField(default=False, verbose_name="حساب اصلی / پیش‌فرض تسویه حقوق")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    class Meta:
        verbose_name = "حساب بانکی شرکت"
        verbose_name_plural = "حساب‌های بانکی شرکت‌ها"
        ordering = ['-is_primary', '-created_at']

    def __str__(self):
        return f"{self.company.name} - {self.bank_name} ({self.sheba_number})"

    def save(self, *args, **kwargs):
        # پاک‌سازی و نرمال‌سازی شبا
        if self.sheba_number:
            raw = self.sheba_number.strip().upper()
            if not raw.startswith('IR') and raw.isdigit() and len(raw) == 24:
                raw = f"IR{raw}"
            self.sheba_number = raw

        # اگر اولین حساب این شرکت است، خودکار اصلی شود
        if not self.pk and not CompanyBankAccount.objects.filter(company=self.company).exists():
            self.is_primary = True

        super().save(*args, **kwargs)

        if self.is_primary:
            CompanyBankAccount.objects.filter(company=self.company, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
            Company.objects.filter(pk=self.company_id).update(
                primary_bank_name=self.bank_name,
                primary_account_number=self.account_number,
                primary_iban=self.sheba_number
            )

    def delete(self, *args, **kwargs):
        comp_id = self.company_id
        was_primary = self.is_primary
        super().delete(*args, **kwargs)
        if was_primary:
            remaining = CompanyBankAccount.objects.filter(company_id=comp_id).first()
            if remaining:
                remaining.is_primary = True
                remaining.save()
            else:
                Company.objects.filter(pk=comp_id).update(
                    primary_bank_name=None,
                    primary_account_number=None,
                    primary_iban=None
                )


class CompanyBoardMember(models.Model):
    """
    اعضای هیئت‌مدیره، مدیران عامل، بازرسان قانونی و صاحبان امضای مجاز شرکت
    """
    ROLE_CHOICES = (
        ('chairman', 'رئیس هیئت‌مدیره'),
        ('vice_chairman', 'نایب‌رئیس هیئت‌مدیره'),
        ('board_member', 'عضو هیئت‌مدیره'),
        ('managing_director', 'مدیرعامل'),
        ('managing_director_and_member', 'عضو هیئت‌مدیره و مدیرعامل'),
        ('main_inspector', 'بازرس اصلی'),
        ('alternate_inspector', 'بازرس علی‌البدل'),
        ('secretary', 'دبیر هیئت‌مدیره'),
        ('other', 'سایر ارکان قانونی')
    )

    MEMBER_TYPE_CHOICES = (
        ('real', 'شخص حقیقی'),
        ('legal_rep', 'نماینده شخص حقوقی')
    )

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='board_members',
        verbose_name="شرکت متبوع"
    )
    first_name = models.CharField(max_length=100, verbose_name="نام")
    last_name = models.CharField(max_length=150, verbose_name="نام خانوادگی")
    national_code = models.CharField(max_length=10, verbose_name="کد ملی (۱۰ رقم)")
    member_type = models.CharField(max_length=20, choices=MEMBER_TYPE_CHOICES, default='real', verbose_name="نوع عضو")
    represented_legal_name = models.CharField(max_length=200, null=True, blank=True, verbose_name="نام شخصیت حقوقی متبوع")
    role = models.CharField(max_length=40, choices=ROLE_CHOICES, default='board_member', verbose_name="سمت")
    has_signature_right = models.BooleanField(default=False, verbose_name="دارای حق امضای تعهدآور")
    signature_scope = models.CharField(max_length=250, null=True, blank=True, verbose_name="حدود اختیارات امضا")
    term_start = models.DateField(null=True, blank=True, verbose_name="تاریخ شروع تصدی")
    term_expiry = models.DateField(null=True, blank=True, verbose_name="تاریخ پایان تصدی (حداکثر ۲ سال)")
    attached_id_doc = models.FileField(upload_to='company_board_docs/', null=True, blank=True, verbose_name="تصویر کارت ملی / شناسنامه")
    attached_appointment_doc = models.FileField(upload_to='company_board_docs/', null=True, blank=True, verbose_name="حکم انتصاب / صورتجلسه مجمع")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "عضو هیئت‌مدیره شرکت"
        verbose_name_plural = "اعضای هیئت‌مدیره شرکت‌ها"
        ordering = ['-has_signature_right', 'role', '-created_at']

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.get_role_display()}) - {self.company.name}"


class CompanyFiscalPeriod(models.Model):
    """
    دوره و سال مالی رسمی شرکت (جهت بستن حساب‌ها، انجماد کاردکس و انتقال مانده به سال بعد)
    """
    STATUS_CHOICES = (
        ('open', 'باز (امکان ثبت و ویرایش اسناد)'),
        ('frozen', 'منجمد / در حال رسیدگی و انبارگردانی'),
        ('closed', 'بسته شده / قطعی و غیرقابل ویرایش'),
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='fiscal_periods',
        verbose_name="شرکت"
    )
    fiscal_year = models.CharField(max_length=4, db_index=True, verbose_name="سال مالی (مثال ۱۴۰۵)")
    title = models.CharField(max_length=150, default="سال مالی جاری", verbose_name="عنوان دوره")
    start_date = models.CharField(max_length=10, verbose_name="تاریخ شروع دوره (شمسی)")
    end_date = models.CharField(max_length=10, verbose_name="تاریخ پایان دوره (شمسی)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open', verbose_name="وضعیت دوره مالی")
    is_active = models.BooleanField(default=True, verbose_name="دوره پیش‌فرض فعال")
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان بستن سال مالی")
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_fiscal_periods',
        verbose_name="کاربر بسته‌کننده دوره"
    )
    notes = models.TextField(blank=True, null=True, verbose_name="توضیحات و مصوبات مجمع")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "دوره مالی شرکت"
        verbose_name_plural = "دوره‌های مالی شرکت‌ها"
        unique_together = ('company', 'fiscal_year')
        ordering = ['-fiscal_year']

    def __str__(self):
        return f"{self.company.name} - سال {self.fiscal_year} ({self.get_status_display()})"


class FinancialProject(models.Model):
    """
    پروژه مالی و عملیاتی مستقل (مرکز هزینه و عملیات)
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='projects',
        verbose_name="شرکت متبوع"
    )
    code = models.CharField(max_length=50, verbose_name="کد پروژه")
    name = models.CharField(max_length=200, verbose_name="نام پروژه")
    description = models.TextField(blank=True, null=True, verbose_name="توضیحات")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "پروژه مالی/عملیاتی"
        verbose_name_plural = "پروژه‌های مالی/عملیاتی"
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(company__isnull=False),
                name='unique_company_project_code'
            ),
            models.UniqueConstraint(
                fields=['code'],
                condition=models.Q(company__isnull=True),
                name='unique_global_project_code'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class ProjectSection(models.Model):
    """
    بخش / دپارتمان تابعه پروژه مالی
    """
    project = models.ForeignKey(
        FinancialProject,
        on_delete=models.CASCADE,
        related_name='sections',
        verbose_name="پروژه"
    )
    code = models.CharField(max_length=50, verbose_name="کد بخش")
    name = models.CharField(max_length=200, verbose_name="نام بخش")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "بخش پروژه"
        verbose_name_plural = "بخش‌های پروژه"
        unique_together = ('project', 'code')
        ordering = ['project', 'code']

    def __str__(self):
        return f"{self.project.name} - {self.name} ({self.code})"


class UserSectionAssignment(models.Model):
    """
    انتساب کاربر به بخش پروژه و تعیین نقش سازمانی پویا
    """
    ROLE_CHOICES = (
        ('employee', 'کارمند / اپراتور ثبت'),
        ('supervisor', 'سرپرست بخش'),
        ('accountant', 'حسابدار پروژه'),
        ('manager', 'مدیر پروژه'),
        ('treasury', 'خزانه‌دار کل'),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='section_assignments',
        verbose_name="کاربر سیستم"
    )
    section = models.ForeignKey(
        ProjectSection,
        on_delete=models.CASCADE,
        related_name='user_assignments',
        verbose_name="بخش پروژه"
    )
    role = models.CharField(
        max_length=30,
        choices=ROLE_CHOICES,
        default='employee',
        verbose_name="نقش در بخش"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "انتساب کاربر به بخش"
        verbose_name_plural = "انتساب‌های کاربران به بخش‌ها"
        unique_together = ('user', 'section', 'role')

    def __str__(self):
        return f"{self.user} -> {self.section.name} ({self.get_role_display()})"


class UserCompanyAccess(models.Model):
    """
    تخصیص صریح یا ضمنی دسترسی کاربر به یک یا چند شرکت با تفکیک سطح دسترسی و نقش
    """
    ACCESS_LEVEL_CHOICES = (
        ('docs_read', 'فقط مشاهده مدارک رسمی'),
        ('docs_write', 'مشاهده و بارگذاری مدارک رسمی'),
        ('workspace_full', 'عضویت کامل در فضای کاری و ماژول‌ها'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='company_accesses',
        verbose_name="کاربر"
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='user_accesses',
        verbose_name="شرکت"
    )
    access_level = models.CharField(
        max_length=30,
        choices=ACCESS_LEVEL_CHOICES,
        default='docs_read',
        verbose_name="سطح دسترسی سازمانی"
    )
    role_in_company = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="سمت / نقش در این شرکت"
    )
    is_default = models.BooleanField(default=False, verbose_name="شرکت پیش‌فرض")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'company')
        verbose_name = "دسترسی کاربر به شرکت"
        verbose_name_plural = "دسترسی‌های کاربران به شرکت‌ها"

    def __str__(self):
        return f"{self.user} -> {self.company.name} ({self.get_access_level_display()})"



class Counterparty(models.Model):
    """
    طرف‌حساب مالی (تأمین‌کننده، راننده، تعمیرگاه، جایگاه سوخت و...)
    """
    TYPE_CHOICES = (
        ('driver', 'راننده / مالک خودرو'),
        ('repair_shop', 'تعمیرگاه و قطعات'),
        ('fuel_station', 'جایگاه سوخت'),
        ('contractor', 'پیمانکار خدماتی'),
        ('other', 'سایر اشخاص حقیقی/حقوقی'),
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='counterparties',
        verbose_name="شرکت متبوع"
    )
    name = models.CharField(max_length=200, verbose_name="نام شخص یا شرکت")
    counterparty_type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES,
        default='other',
        verbose_name="نوع طرف‌حساب"
    )
    national_id = models.CharField(max_length=20, blank=True, null=True, verbose_name="کد ملی / شناسه اقتصادی")
    phone = models.CharField(max_length=20, blank=True, null=True, verbose_name="تلفن تماس")
    bank_name = models.CharField(max_length=100, blank=True, null=True, verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=30, blank=True, null=True, verbose_name="شماره شبا")
    account_code = models.CharField(
        max_length=50, blank=True, null=True, db_index=True,
        verbose_name="کد حساب تفصیلی (رزرو دفتر کل)"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "طرف‌حساب مالی"
        verbose_name_plural = "طرف‌حساب‌های مالی"
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_counterparty_type_display()})"


class ExpenseInvoice(models.Model):
    """
    فاکتور هزینه‌ای / عملیاتی بخش پروژه
    """
    INVOICE_STATUS_CHOICES = (
        ('draft', 'پیش‌نویس کارمند'),
        ('pending_supervisor', 'در انتظار تایید سرپرست'),
        ('pending_accountant', 'در انتظار بررسی حسابدار'),
        ('pending_manager', 'در انتظار تایید مدیر'),
        ('ready_to_pay', 'تایید مدیر / آماده پرداخت'),
        ('paid', 'پرداخت‌شده توسط خزانه‌دار'),
        ('revision_required', 'نیازمند بازنگری و اصلاح'),
        ('rejected', 'رد شده'),
    )
    section = models.ForeignKey(
        ProjectSection,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name="بخش پروژه"
    )
    counterparty = models.ForeignKey(
        Counterparty,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name="طرف‌حساب"
    )
    invoice_number = models.CharField(max_length=100, verbose_name="شماره فاکتور / رسید")
    invoice_date_shamsi = models.CharField(max_length=10, verbose_name="تاریخ فاکتور (شمسی)")
    amount = models.DecimalField(max_digits=15, decimal_places=0, verbose_name="مبلغ فاکتور (ریال)")
    category = models.CharField(max_length=100, verbose_name="سرفصل هزینه")
    description = models.TextField(verbose_name="شرح هزینه")
    attachment = models.FileField(upload_to='invoices/', blank=True, null=True, verbose_name="تصویر یا فایل فاکتور")
    status = models.CharField(max_length=30, choices=INVOICE_STATUS_CHOICES, default='draft', verbose_name="وضعیت فاکتور")
    rejection_reason = models.TextField(blank=True, null=True, verbose_name="علت رد یا بازنگری فاکتور")
    payment_ref = models.CharField(max_length=100, blank=True, null=True, verbose_name="شماره پیگیری / سند پرداخت")
    paid_at = models.DateTimeField(blank=True, null=True, verbose_name="تاریخ و زمان پرداخت")
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='paid_invoices',
        verbose_name="پرداخت‌کننده خزانه‌داری"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_invoices',
        verbose_name="ثبت‌کننده فاکتور"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "فاکتور هزینه"
        verbose_name_plural = "فاکتورهای هزینه"
        indexes = [
            models.Index(fields=['section', 'invoice_date_shamsi']),
            models.Index(fields=['counterparty', 'invoice_number']),
        ]
        ordering = ['-invoice_date_shamsi', '-created_at']

    def __str__(self):
        return f"فاکتور {self.invoice_number} - {self.counterparty.name} ({self.amount:,.0f} ریال)"

    def to_journal_lines(self):
        """پیاده‌سازی پروتکل AccountingDocumentSource — فاز ۸ (تسک ۷۲ و ۷۳)."""
        from decimal import Decimal
        from platform_core.accounting_protocol import JournalLine
        amt = Decimal(str(self.amount or 0))

        sec = None
        try:
            sec = self.section
        except Exception:
            pass
        cost_center = f"{sec.project.code}-{sec.code}" if (sec and getattr(sec, 'project', None)) else None

        cp = None
        try:
            cp = self.counterparty
        except Exception:
            pass
        detail = getattr(cp, 'account_code', None) or (f"CP-{cp.id}" if cp else None)
        desc = f"فاکتور هزینه {self.invoice_number} - {self.description or ''}".strip()
        return [
            JournalLine(
                account_code="6102",  # حساب معین هزینه عمومی/عملیاتی
                side="debit",
                amount=amt,
                cost_center_code=cost_center,
                detail_code=detail,
                description=desc,
            ),
            JournalLine(
                account_code="4101",  # حساب معین بستانکاران تجاری / طرف‌حساب‌ها
                side="credit",
                amount=amt,
                cost_center_code=cost_center,
                detail_code=detail,
                description=desc,
            ),
        ]


# ==============================================================================
# 0.1 مدل‌های حساب و تراکنش‌های تنخواه‌گردان (Petty Cash Management)
# ==============================================================================

class PettyCashAccount(models.Model):
    """
    حساب / صندوق تنخواه‌گردان بخش پروژه منتسب به کارمند (تنخواه‌دار)
    """
    section = models.ForeignKey(
        ProjectSection,
        on_delete=models.CASCADE,
        related_name='petty_cash_accounts',
        verbose_name="بخش پروژه"
    )
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='petty_cash_accounts',
        verbose_name="تنخواه‌دار (کارمند)"
    )
    ceiling_amount = models.DecimalField(
        max_digits=15,
        decimal_places=0,
        default=0,
        verbose_name="سقف مصوب تنخواه (ریال)"
    )
    card_or_account_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        verbose_name="شماره کارت یا حساب تنخواه‌دار"
    )
    sheba_number = models.CharField(
        max_length=30,
        blank=True,
        null=True,
        verbose_name="شماره شبا تنخواه‌دار"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    description = models.TextField(blank=True, null=True, verbose_name="توضیحات / یادداشت")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "حساب تنخواه‌گردان"
        verbose_name_plural = "حساب‌های تنخواه‌گردان"
        unique_together = ('section', 'custodian')
        ordering = ['section', 'custodian']

    def __str__(self):
        custodian_name = f"{self.custodian.first_name} {self.custodian.last_name}".strip() or self.custodian.username
        return f"تنخواه {self.section.name} - {custodian_name} (سقف: {self.ceiling_amount:,.0f} ریال)"


class PettyCashTransaction(models.Model):
    """
    تراکنش / سند گردش تنخواه (هزینه‌کرد، شارژ تنخواه یا عودت مانده)
    """
    TRANSACTION_TYPE_CHOICES = (
        ('expense', 'هزینه‌کرد از محل تنخواه (ارائه فاکتور/رسید)'),
        ('allocation', 'شارژ تنخواه (دریافت وجه از خزانه‌داری)'),
        ('refund', 'عودت مانده تنخواه به صندوق شرکت'),
    )
    STATUS_CHOICES = (
        ('draft', 'پیش‌نویس تنخواه‌دار'),
        ('pending_supervisor', 'در انتظار تایید سرپرست'),
        ('pending_accountant', 'در انتظار بررسی حسابدار'),
        ('approved', 'تایید نهایی / تسویه قطعی'),
        ('rejected', 'رد شده'),
    )

    account = models.ForeignKey(
        PettyCashAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions',
        verbose_name="حساب تنخواه"
    )
    section = models.ForeignKey(
        ProjectSection,
        on_delete=models.PROTECT,
        related_name='petty_cash_transactions',
        verbose_name="بخش پروژه"
    )
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='petty_cash_transactions',
        verbose_name="تنخواه‌دار"
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=TRANSACTION_TYPE_CHOICES,
        default='expense',
        verbose_name="نوع تراکنش"
    )
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=0,
        verbose_name="مبلغ تراکنش (ریال)"
    )
    transaction_date_shamsi = models.CharField(
        max_length=10,
        verbose_name="تاریخ تراکنش (شمسی)"
    )
    title = models.CharField(
        max_length=200,
        verbose_name="عنوان / شرح مختصر"
    )
    category = models.CharField(
        max_length=100,
        default='متفرقه',
        verbose_name="سرفصل هزینه / منبع شارژ"
    )
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name="شرح تفصیلی"
    )
    counterparty = models.ForeignKey(
        Counterparty,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='petty_cash_transactions',
        verbose_name="طرف‌حساب / فروشنده"
    )
    receipt_number = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name="شماره رسید / فاکتور یا پیگیری بانکی"
    )
    attachment = models.FileField(
        upload_to='petty_cash/',
        blank=True,
        null=True,
        verbose_name="تصویر فاکتور / رسید پرداخت"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="وضعیت"
    )
    rejection_reason = models.TextField(
        blank=True,
        null=True,
        verbose_name="علت رد درخواست"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_petty_cash_txs',
        verbose_name="ثبت‌کننده"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تراکنش تنخواه‌گردان"
        verbose_name_plural = "تراکنش‌های تنخواه‌گردان"
        indexes = [
            models.Index(fields=['section', 'custodian', 'transaction_date_shamsi']),
            models.Index(fields=['status', 'transaction_type']),
        ]
        ordering = ['-transaction_date_shamsi', '-created_at']

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.title} ({self.amount:,.0f} ریال)"


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
    education_level = models.CharField(max_length=50, default='5', verbose_name="مدرک تحصیلی")
    marital_status = models.CharField(max_length=20, choices=MARITAL_STATUS_CHOICES, default='single', verbose_name="وضعیت تاهل")
    children_count = models.PositiveIntegerField(default=0, verbose_name="تعداد فرزند")

    # ── ۲. اطلاعات بیمه و مالیات (سازگار با دیسکت DSK و مالیات WH/WP) ───
    insurance_number = models.CharField(max_length=20, blank=True, null=True, verbose_name="شماره بیمه تامین اجتماعی")
    insurance_type = models.CharField(max_length=20, default='2', verbose_name="نوع بیمه")
    insurance_name = models.CharField(max_length=100, default='تامین اجتماعی', verbose_name="نام بیمه")
    exemption_type = models.CharField(max_length=20, default='1', verbose_name="نوع معافیت مالیاتی")
    job_category = models.CharField(max_length=20, default='15', verbose_name="رسته شغلی")
    job_code = models.CharField(max_length=20, blank=True, null=True, verbose_name="کد ۶ رقمی شغل بیمه")
    job_title = models.CharField(max_length=150, verbose_name="سمت شغل / عنوان شغلی")
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
        FinancialProject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personnel_profiles',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        ProjectSection,
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
        """مزد مبنا روزانه (مزد روزانه + پایه سنوات)"""
        if self.base_daily_rate and self.base_daily_rate > 0:
            return float(self.base_daily_rate)
        return float(self.daily_base_wage + self.daily_seniority_bonus)

    @property
    def hourly_rate(self):
        """نرخ دستمزد هر ساعت کارکرد بر مبنای ۱۰ ساعت کارکرد روزانه"""
        daily = self.effective_daily_rate
        if daily > 0:
            return round(daily / 10.0, 2)
        return 0.0

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
        # محاسبه خودکار و همگام مزد مبنا از مجموع مزد روزانه و سنوات
        try:
            wage = int(self.daily_base_wage or 0)
        except (ValueError, TypeError):
            wage = 0
        try:
            bonus = int(self.daily_seniority_bonus or 0)
        except (ValueError, TypeError):
            bonus = 0
        self.base_daily_rate = wage + bonus
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.national_code}) - {self.job_title}"


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
        'ProjectSection',
        on_delete=models.CASCADE,
        related_name='personnel_assignments',
        verbose_name="بخش/دپارتمان پروژه"
    )
    project = models.ForeignKey(
        'FinancialProject',
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
    
    assigned_warehouse_id = models.IntegerField(
        null=True,
        blank=True,
        db_index=True,
        db_column='assigned_warehouse_id',
        verbose_name="انبار تخصیص‌یافته"
    )
    project = models.ForeignKey(
        FinancialProject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_vehicles',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        ProjectSection,
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
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.driver_name} - {self.get_vehicle_type_display()} ({self.plate_number})"


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
        FinancialProject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monthly_work_periods',
        verbose_name="پروژه مالی مربوطه"
    )
    section = models.ForeignKey(
        ProjectSection,
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
        # انتساب خودکار شرکت از روی انبار در صورت خالی بودن
        if not self.company_id and self.warehouse_id:
            try:
                from warehouses.models import Warehouse
                wh = Warehouse.objects.filter(id=self.warehouse_id).first()
                if wh and wh.company_id:
                    self.company_id = wh.company_id
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
        PersonnelProfile,
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
        FinancialProject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='daily_attendances',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        ProjectSection,
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
        VehicleDriverProfile,
        on_delete=models.CASCADE,
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
        FinancialProject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vehicle_trip_logs',
        verbose_name="پروژه مالی/عملیاتی"
    )
    section = models.ForeignKey(
        ProjectSection,
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


# ══════════════════════════════════════════════════════════════════════════════
# ── ۵. مدل‌های تنظیمات پایه، سالانه و سازمان‌ها (منطبق بر شیت Settings اکسل) ──
# ══════════════════════════════════════════════════════════════════════════════

class PayrollYearlySettings(models.Model):
    """
    تنظیمات پایه و مالی سالانه حقوق و دستمزد (قانون کار و بخشنامه‌های سالانه)
    """
    fiscal_year = models.CharField(max_length=4, db_index=True, verbose_name="سال مالی (مثال ۱۴۰۵)")
    effective_from = models.CharField(max_length=7, default='1405/01', db_index=True, verbose_name="ماه شروع اعتبار (مثال ۱۴۰۵/۰۱)")
    effective_to = models.CharField(max_length=7, null=True, blank=True, db_index=True, verbose_name="ماه پایان اعتبار (خالی=جاری)")
    version_title = models.CharField(max_length=150, default="احکام مصوب فروردین", verbose_name="عنوان نسخه احکام")
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='payroll_yearly_settings',
        verbose_name="شرکت متبوع"
    )
    project = models.ForeignKey(
        FinancialProject,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payroll_yearly_settings',
        verbose_name="پروژه مالی/عملیاتی (خالی=سراسری شرکت)"
    )
    title = models.CharField(max_length=150, default="تنظیمات پایه و قانون کار", verbose_name="عنوان دوره تنظیمات")
    is_active = models.BooleanField(default=True, verbose_name="سال مالی پیش‌فرض فعال")
    
    # اقلام مصوب ماهانه قانون کار (ریال)
    monthly_food_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=22000000, verbose_name="بن خانوار / اقلام مصرفی ماهانه")
    monthly_housing_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=30000000, verbose_name="حق مسکن ماهانه")
    monthly_spouse_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=5000000, verbose_name="حق تاهل ماهانه")
    monthly_child_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=16625549, verbose_name="حق اولاد به ازای هر فرزند")
    
    # ضرایب و مبالغ فوق‌العاده‌ها
    shift_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد نوبت کاری")
    transport_help_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد فوق‌العاده ایاب و ذهاب")
    transport_fixed_amount = models.DecimalField(max_digits=14, decimal_places=0, default=2388728, verbose_name="ثابت فوق‌العاده ایاب و ذهاب (ریال)")
    specialist_attraction_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد جذب تخصصی ماهانه")
    bad_weather_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد بدی آب و هوا")
    remote_hardship_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد جذب و دوری از خانواده")
    south_pars_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, verbose_name="درصد فوق‌العاده پارس جنوبی")
    travel_cost_per_day = models.DecimalField(max_digits=14, decimal_places=0, default=8736600, verbose_name="هزینه سفر یک روز (ریال)")
    
    # نرخ‌های بیمه تامین اجتماعی
    worker_insurance_rate = models.DecimalField(max_digits=5, decimal_places=2, default=7.00, verbose_name="نرخ بیمه سهم کارگر (درصد)")
    employer_insurance_rate = models.DecimalField(max_digits=5, decimal_places=2, default=20.00, verbose_name="نرخ بیمه سهم کارفرما (درصد)")
    unemployment_insurance_rate = models.DecimalField(max_digits=5, decimal_places=2, default=3.00, verbose_name="نرخ بیمه بیکاری (درصد)")
    
    # تسهیم مازاد ناخالص به اضافه‌کار و سفر/ماموریت
    surplus_overtime_percent = models.DecimalField(max_digits=5, decimal_places=2, default=50.00, verbose_name="درصد تخصیص مازاد به اضافه‌کار (پیش‌فرض ۵۰٪)")

    # ساعت کار استاندارد روزانه (پیش‌فرض ۱۰.۰۰ ساعت مطابق اصل ۶ و اکسل مرجع انبارداری)
    standard_daily_hours = models.DecimalField(max_digits=4, decimal_places=2, default=10.00, verbose_name="ساعت کار استاندارد روزانه")

    # ضرایب محاسباتی مصوب اکسل مرجع شرکت
    bonus_daily_coefficient = models.DecimalField(max_digits=6, decimal_places=2, default=5.00, verbose_name="ضریب روزانه عیدی و پاداش")
    seniority_monthly_coefficient = models.DecimalField(max_digits=6, decimal_places=2, default=2.50, verbose_name="ضریب ماهانه سنوات")
    overtime_rate_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=1.40, verbose_name="ضریب نرخ اضافه‌کار")
    friday_work_rate_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=0.40, verbose_name="ضریب نرخ جمعه‌کاری")

    # سقف اختیاری دستی دستمزد مشمول بیمه (در صورت خالی بودن، خودکار معادل ۷ برابر گروه ۱ محاسبه می‌شود)
    max_insurable_daily_wage = models.DecimalField(max_digits=14, decimal_places=0, null=True, blank=True, verbose_name="سقف دستی دستمزد روزانه مشمول بیمه (خالی = ۷ برابر گروه ۱)")

    # محدودیت بازه زمانی ویرایش کارکرد روزانه توسط مدیر (-۱ به معنای نامحدود، ۰ به معنای فقط امروز)
    attendance_edit_past_days = models.IntegerField(default=3, verbose_name="حداکثر روزهای گذشته مجاز برای ویرایش کارکرد")
    attendance_edit_future_days = models.IntegerField(default=0, verbose_name="حداکثر روزهای آینده مجاز برای ثبت کارکرد")

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_payroll_settings',
        verbose_name="ایجادکننده"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_payroll_settings',
        verbose_name="ویرایش‌کننده"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تنظیمات دوره‌ای حقوق و دستمزد"
        verbose_name_plural = "تنظیمات دوره‌ای حقوق و دستمزد"
        ordering = ['-effective_from', 'project']
        constraints = [
            models.UniqueConstraint(
                fields=['fiscal_year', 'effective_from'],
                condition=models.Q(project__isnull=True, company__isnull=True),
                name='unique_global_effective_period_setting'
            ),
            models.UniqueConstraint(
                fields=['company', 'fiscal_year', 'effective_from'],
                condition=models.Q(project__isnull=True, company__isnull=False),
                name='unique_company_effective_period_setting'
            ),
            models.UniqueConstraint(
                fields=['project', 'fiscal_year', 'effective_from'],
                condition=models.Q(project__isnull=False),
                name='unique_project_effective_period_setting'
            ),
        ]

    def __str__(self):
        proj_str = f" - پروژه {self.project.name}" if self.project else " (سراسری سازمان)"
        period_str = f" از {self.effective_from}" + (f" تا {self.effective_to}" if self.effective_to else "")
        return f"{self.version_title} ({self.fiscal_year}{period_str}){proj_str}"


class JobGradeTier(models.Model):
    """
    جدول ۲۰ گروه شغلی و نرخ مزد شغل و سنوات (منطبق بر جدول Table7 شیت Settings)
    """
    yearly_settings = models.ForeignKey(
        PayrollYearlySettings,
        on_delete=models.CASCADE,
        related_name='job_grades',
        verbose_name="تنظیمات سال مالی"
    )
    grade_number = models.PositiveIntegerField(verbose_name="گروه شغلی (۱ تا ۲۰)")
    daily_base_wage = models.DecimalField(max_digits=14, decimal_places=0, verbose_name="مزد شغل روزانه (ریال)")
    daily_seniority_bonus = models.DecimalField(max_digits=14, decimal_places=0, verbose_name="پایه سنوات روزانه (ریال)")

    class Meta:
        verbose_name = "پایه گروه شغلی"
        verbose_name_plural = "جدول ۲۰ گروه شغلی و سنوات"
        ordering = ['grade_number']
        constraints = [
            models.UniqueConstraint(fields=['yearly_settings', 'grade_number'], name='unique_grade_per_year')
        ]

    def __str__(self):
        return f"گروه {self.grade_number} (سال {self.yearly_settings.fiscal_year}) - مزد: {self.daily_base_wage:,} | سنوات: {self.daily_seniority_bonus:,}"


class WorkshopInsuranceSettings(models.Model):
    """
    تنظیمات کارگاه و کارفرما جهت صدور دیسکت‌های بیمه (منطبق بر DSKKARTable و list_info)
    """
    yearly_settings = models.OneToOneField(
        PayrollYearlySettings,
        on_delete=models.CASCADE,
        related_name='workshop_insurance',
        verbose_name="تنظیمات سال مالی"
    )
    workshop_code = models.CharField(max_length=20, default='4894290013', verbose_name="کد کارگاه ۱۰ رقمی")
    workshop_name = models.CharField(max_length=150, default='دفترشركت فارس عاليش', verbose_name="نام کارگاه")
    employer_name = models.CharField(max_length=150, default='شرکت نفت و گاز پارس', verbose_name="نام کارفرما")
    workshop_address = models.CharField(max_length=255, default='بوشهر شهرستان عسلویه', verbose_name="آدرس کارگاه")
    list_type = models.CharField(max_length=10, default='0', verbose_name="نوع لیست (۰=عادی)")
    list_number = models.CharField(max_length=10, default='01', verbose_name="شماره لیست")
    default_dsk_rate = models.DecimalField(max_digits=5, decimal_places=2, default=27.00, verbose_name="نرخ حق بیمه DSK_RATE")
    default_mon_pym = models.CharField(max_length=10, default='024', verbose_name="کد MON_PYM")

    class Meta:
        verbose_name = "تنظیمات کارگاه و بیمه تامین اجتماعی"
        verbose_name_plural = "تنظیمات کارگاه و بیمه تامین اجتماعی"

    def __str__(self):
        return f"کارگاه {self.workshop_name} ({self.workshop_code})"


class TaxRuleSettings(models.Model):
    """
    تنظیمات سازمان امور مالیاتی و فایل‌های WH/WP (منطبق بر WHFildeTable و WPFildeTable)
    """
    yearly_settings = models.OneToOneField(
        PayrollYearlySettings,
        on_delete=models.CASCADE,
        related_name='tax_settings',
        verbose_name="تنظیمات سال مالی"
    )
    payment_type = models.CharField(max_length=10, default='1', verbose_name="نوع پرداختی (۱=ریالی)")
    service_location = models.CharField(max_length=10, default='1', verbose_name="محل خدمت (۱=عادی)")
    exceptions = models.CharField(max_length=10, default='1', verbose_name="استثنائات (۱=عادی)")
    currency_type = models.CharField(max_length=10, default='84', verbose_name="نوع ارز (۸۴=ریال ایران)")
    currency_exchange_rate = models.DecimalField(max_digits=10, decimal_places=2, default=1.00, verbose_name="نرخ تسعیر ارز")
    housing_benefit_type = models.CharField(max_length=10, default='1', verbose_name="مسکن (۱=عدم استفاده)")
    vehicle_benefit_type = models.CharField(max_length=10, default='1', verbose_name="اتومبیل (۱=عدم استفاده)")
    wh_file_prefix = models.CharField(max_length=10, default='WH', verbose_name="پیشوند فایل WH")
    wp_file_prefix = models.CharField(max_length=10, default='WP', verbose_name="پیشوند فایل WP")

    class Meta:
        verbose_name = "تنظیمات مالیات حقوق"
        verbose_name_plural = "تنظیمات مالیات حقوق"

    def __str__(self):
        return f"تنظیمات مالیات سال {self.yearly_settings.fiscal_year}"


class BankExportSettings(models.Model):
    """
    تنظیمات خروجی فایل پرداخت گروهی بانک ملی (منطبق بر BankTable و ماکروی BankMeli)
    """
    yearly_settings = models.OneToOneField(
        PayrollYearlySettings,
        on_delete=models.CASCADE,
        related_name='bank_export_settings',
        verbose_name="تنظیمات سال مالی"
    )
    bank_name = models.CharField(max_length=100, default='بانک ملی', verbose_name="نام بانک پرداخت‌کننده")
    source_account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب مبدا")
    source_sheba_number = models.CharField(max_length=30, blank=True, null=True, verbose_name="شماره شبا مبدا (IR)")
    default_deposit_id = models.CharField(max_length=50, blank=True, null=True, verbose_name="شناسه واریز پیش‌فرض")
    deposit_description_template = models.CharField(
        max_length=200,
        default='انبارداری حقوق {month_name} {fiscal_year}',
        verbose_name="الگوی شرح واریز"
    )

    class Meta:
        verbose_name = "تنظیمات واریز بانکی"
        verbose_name_plural = "تنظیمات واریز بانکی"

    def __str__(self):
        return f"تنظیمات بانک {self.bank_name} (سال {self.yearly_settings.fiscal_year})"


# ══════════════════════════════════════════════════════════════════════════════
# ── ۶. مدل محاسبه جامع ماهانه حقوق و دستمزد (منطبق بر شیت تیر اکسل شرکت) ────
# ══════════════════════════════════════════════════════════════════════════════

class MonthlyPayrollRecord(models.Model):
    """
    رکورد ۵۸ ستونی محاسبه ماهانه حقوق پرسنل (منطبق بر ساختار دقیق شیت تیر ماه اکسل شرکت)
    """
    period = models.ForeignKey(
        MonthlyWorkPeriod,
        on_delete=models.CASCADE,
        related_name='payroll_records',
        verbose_name="دوره ماهانه"
    )
    personnel = models.ForeignKey(
        PersonnelProfile,
        on_delete=models.CASCADE,
        related_name='monthly_payrolls',
        verbose_name="پرسنل"
    )
    
    # ── ۱. اطلاعات هویتی و قراردادی (ستون‌های ۱ تا ۱۶) ────────────────
    row_number = models.PositiveIntegerField(default=1, verbose_name="ردیف")
    status_category = models.CharField(max_length=50, default='نفرات شرکتی', verbose_name="گروه (ستون ۱)")
    include_in_tax = models.BooleanField(default=True, verbose_name="maliat (ستون ۳)")
    include_in_insurance = models.BooleanField(default=True, verbose_name="بیمه (ستون ۴)")
    include_in_bank = models.BooleanField(default=True, verbose_name="bank (ستون ۵)")
    national_code = models.CharField(max_length=10, db_index=True, verbose_name="کد ملی (ستون ۶)")
    full_name = models.CharField(max_length=200, verbose_name="نام و نام خانوادگی (ستون ۷)")
    marital_status = models.CharField(max_length=20, default='مجرد', verbose_name="وضعیت تاهل (ستون ۸)")
    children_count = models.PositiveIntegerField(default=0, verbose_name="تعداد فرزند (ستون ۹)")
    contract_hours = models.DecimalField(max_digits=8, decimal_places=2, default=230, verbose_name="کارکرد قرارداد شده (ستون ۱۰)")
    contract_salary = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق قرارداد شده (ستون ۱۱)")
    job_grade = models.CharField(max_length=10, default='19', verbose_name="گروه شغلی (ستون ۱۲)")
    daily_wage = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مزد روزانه (ستون ۱۳)")
    daily_seniority = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="پایه سنواتی (ستون ۱۴)")
    years_of_service = models.PositiveIntegerField(default=0, verbose_name="تعداد سال کارکرد (ستون ۱۵)")
    base_daily_rate = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مزد مبنا (ستون ۱۶)")

    # ── ۲. کارکرد، تردد و کسورات ورودی (ستون‌های ۱۷ تا ۲۴) ───────────
    worked_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0, verbose_name="ساعت کارکرد (ستون ۱۷)")
    insurance_days = models.PositiveIntegerField(default=31, verbose_name="روز بیمه (ستون ۱۸)")
    overtime_hours = models.DecimalField(max_digits=8, decimal_places=2, default=0, verbose_name="ساعت اضافه کار (ستون ۱۹)")
    friday_work_days = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="روز جمعه کاری (ستون ۲۰)")
    mission_days = models.DecimalField(max_digits=5, decimal_places=2, default=0, verbose_name="ماموریت (ستون ۲۱)")
    income_tax = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مالیات (ستون ۲۲)")
    advance_payment_deduction = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="کسر مساعده (ستون ۲۳)")
    other_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="سایر مزایا (ستون ۲۴)")

    # ── ۳. مزایای ناخالص و اقلام قانونی (ستون‌های ۲۵ تا ۴۰) ─────────────
    friday_work_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمعه کاری (ستون ۲۵)")
    overtime_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="اضافه کار (ستون ۲۶)")
    travel_cost_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="هزینه سفر (ستون ۲۷)")
    mission_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق ماموریت (ستون ۲۸)")
    bonus_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="عیدی و پاداش (ستون ۲۹)")
    leave_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مرخصی (ستون ۳۰)")
    food_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="بن خانوار (ستون ۳۱)")
    housing_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق مسکن (ستون ۳۲)")
    marital_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق تاهل (ستون ۳۳)")
    transport_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق العاده ایاب و ذهاب (ستون ۳۴)")
    market_attraction_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق العاده جذب بازار (ستون ۳۵)")
    bad_weather_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق العاده بدی آب و هوا (ستون ۳۶)")
    remote_hardship_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق العاده دوری از خانواده (ستون ۳۷)")
    south_pars_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="فوق العاده مناطق پارسیان و عسلویه (ستون ۳۸)")
    child_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق اولاد (ستون ۳۹)")
    seniority_allowance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حق سنوات (ستون ۴۰)")

    # ── ۴. سرجمع‌های مشمول و غیرمشمول بیمه و مالیات (ستون‌های ۴۱ تا ۴۹) ──
    total_taxable_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مزایا مشمول (ستون ۴۱)")
    total_non_continuous_taxable_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمع مزایا مشمول غیر مستمر (ستون ۴۲)")
    continuous_taxable_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="مزایا مستمر مشمول مالیات (ستون ۴۳)")
    total_non_taxable_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمع مزایا غیر مشمول (ستون ۴۴)")
    total_seniority_accumulated = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمع پایه سنواتی (ستون ۴۵)")
    worker_insurance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="بیمه سهم کارگر ۷٪ (ستون ۴۶)")
    employer_insurance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="بیمه سهم کارفرما ۲۰٪ (ستون ۴۷)")
    unemployment_insurance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="بیمه بیکاری ۳٪ (ستون ۴۸)")
    total_insurance = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمع بیمه ۳۰٪ (ستون ۴۹)")

    # ── ۵. حقوق پایه، ناخالص، خالص و پرداخت نهایی (ستون‌های ۵۰ تا ۵۸) ───
    base_salary = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق پایه (ستون ۵۰)")
    continuous_taxable_salary_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق و مزایای مستمر مالیات (ستون ۵۱)")
    total_insurable_salary_allowances = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="جمع حقوق و مزایا مشمول بیمه (ستون ۵۲)")
    gross_salary = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق ناخالص (ستون ۵۳)")
    total_deductions = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="کسورات (ستون ۵۴)")
    net_salary = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="حقوق خالص (ستون ۵۵)")
    bank_account_number = models.CharField(max_length=50, blank=True, null=True, verbose_name="شماره حساب (ستون ۵۶)")
    payable_amount = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="قابل پرداخت (ستون ۵۷)")
    tax_check_discrepancy = models.DecimalField(max_digits=14, decimal_places=0, default=0, verbose_name="چک مالیات (ستون ۵۸)")

    # ── ۶. متادیتای پرداخت و خزانه‌داری ───────────────────────────
    PAYMENT_STATUS_CHOICES = (
        ('PENDING', 'در انتظار تایید'),
        ('READY_TO_PAY', 'تایید مدیر / آماده پرداخت'),
        ('PAID', 'پرداخت و تسویه شده'),
        ('FAILED_SHEBA', 'خطای شماره شبا / حساب بانکی'),
        ('REJECTED', 'رد شده'),
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default='PENDING',
        db_index=True,
        verbose_name="وضعیت پرداخت خزانه‌داری"
    )
    paid_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان پرداخت خزانه‌داری")
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='paid_payrolls',
        verbose_name="خزانه‌دار پرداخت‌کننده"
    )
    payment_tracking_code = models.CharField(max_length=100, blank=True, null=True, verbose_name="کد رهگیری بانکی واریز")
    payment_batch_id = models.CharField(max_length=100, blank=True, null=True, verbose_name="شناسه دسته واریز پایا")
    payment_failure_reason = models.TextField(blank=True, null=True, verbose_name="علت عدم واریز یا خطای شبا")

    # ── ۷. متادیتای ممیزی و فایل مالیات دارایی ───────────────────────
    tax_source_type = models.CharField(
        max_length=50,
        default='MANUAL',
        choices=[
            ('MANUAL', 'دستی / پیش‌فرض سیستم'),
            ('IMPORTED_EXCEL', 'فایل اکسل دارایی'),
            ('CALCULATED_BRACKET', 'جدول مالیاتی ماده ۸۴'),
        ],
        verbose_name="منبع مالیات"
    )
    tax_exemption_months = models.PositiveIntegerField(default=1, verbose_name="تعداد ماه اعمال شده در معافیت مالیاتی")
    has_multiple_employers = models.BooleanField(default=False, verbose_name="بیش از یک کارفرما در ماه")
    is_tax_imported = models.BooleanField(default=False, verbose_name="مالیات از اکسل دارایی بارگذاری شده")

    is_manually_overridden = models.BooleanField(default=False, verbose_name="ویرایش دستی شده توسط حسابدار")
    override_notes = models.TextField(blank=True, null=True, verbose_name="توضیحات بازنویسی دستی")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "محاسبه ماهانه حقوق پرسنل"
        verbose_name_plural = "محاسبات ماهانه حقوق پرسنل"
        constraints = [
            models.UniqueConstraint(fields=['period', 'personnel'], name='unique_period_personnel_payroll')
        ]
        ordering = ['row_number']

    def __str__(self):
        return f"{self.full_name} | دوره {self.period.year_month} | خالص: {self.payable_amount:,} ریال"

    def to_journal_lines(self):
        """پیاده‌سازی پروتکل AccountingDocumentSource برای محاسبه و پرداخت حقوق (تسک ۷۳)."""
        from decimal import Decimal
        from platform_core.accounting_protocol import JournalLine

        gross = Decimal(str(self.gross_salary or 0))
        payable = Decimal(str(self.payable_amount or 0))
        tax = Decimal(str(self.income_tax or 0))
        insurance = Decimal(str(self.worker_insurance or 0))
        advance = Decimal(str(self.advance_payment_deduction or 0))

        cost_center = None
        if self.personnel_id and getattr(self, 'personnel', None) and getattr(self.personnel, 'section', None):
            sec = self.personnel.section
            proj_code = sec.project.code if sec.project else "PRJ"
            cost_center = f"{proj_code}-{sec.code}"

        detail = self.national_code or (f"EMP-{self.personnel_id}" if self.personnel_id else "EMP-0")
        period_str = self.period.year_month if self.period_id and hasattr(self, 'period') and self.period else "جاری"
        desc = f"حقوق و دستمزد {self.full_name or 'پرسنل'} - دوره {period_str}"

        lines = [
            JournalLine(
                account_code="6101",  # حساب معین هزینه حقوق و دستمزد ناخالص
                side="debit",
                amount=gross,
                cost_center_code=cost_center,
                detail_code=detail,
                description=desc,
            ),
            JournalLine(
                account_code="4102",  # حساب معین بستانکاران / حقوق پرداختنی
                side="credit",
                amount=payable,
                cost_center_code=cost_center,
                detail_code=detail,
                description=f"خالص پرداختی {desc}",
            ),
        ]
        if tax > 0:
            lines.append(
                JournalLine(
                    account_code="4103",  # مالیات تکلیفی حقوق پرداختنی
                    side="credit",
                    amount=tax,
                    cost_center_code=cost_center,
                    detail_code=detail,
                    description=f"مالیات تکلیفی {desc}",
                )
            )
        if insurance > 0:
            lines.append(
                JournalLine(
                    account_code="4104",  # بیمه سهم کارمند پرداختنی
                    side="credit",
                    amount=insurance,
                    cost_center_code=cost_center,
                    detail_code=detail,
                    description=f"بیمه سهم کارمند {desc}",
                )
            )
        if advance > 0:
            lines.append(
                JournalLine(
                    account_code="1201",  # حساب معین مساعده و پیش‌پرداخت پرسنل
                    side="credit",
                    amount=advance,
                    cost_center_code=cost_center,
                    detail_code=detail,
                    description=f"کسر مساعده {desc}",
                )
            )

        # محاسبه و تسویه هرگونه کسورات متفرقه جهت تضمین تراز دوبل (Debit == Credit)
        credits_sum = payable + tax + insurance + advance
        discrepancy = gross - credits_sum
        if discrepancy > 0:
            lines.append(
                JournalLine(
                    account_code="4105",  # سایر کسورات و تعدیلات حقوق
                    side="credit",
                    amount=discrepancy,
                    cost_center_code=cost_center,
                    detail_code=detail,
                    description=f"سایر کسورات {desc}",
                )
            )
        elif discrepancy < 0:
            # در موارد استثنایی اگر پرداخت بیش از ناخالص باشد
            lines.append(
                JournalLine(
                    account_code="6102",  # اضافه پرداختی و تعدیلات حقوق
                    side="debit",
                    amount=abs(discrepancy),
                    cost_center_code=cost_center,
                    detail_code=detail,
                    description=f"تعدیلات مثبت {desc}",
                )
            )
        return lines


# ==============================================================================
# ── ۷. جدول رویدادهای مالی (Transactional Outbox Pattern) — فاز ۸ (تسک ۷۴) ────
# ==============================================================================

class AccountingEvent(models.Model):
    """
    جدول رویدادهای مالی و اسناد بالقوه دفتر کل (Outbox Pattern).
    برای هر تایید یا گذار مالی، یک رکورد تراکنشی در این جدول ثبت می‌شود
    تا توزیع مستقل آینده (wh-accounting-gl) بتواند بدون نیاز به کدهای این اپ،
    اسناد رسمی حسابداری دوطرفه را تولید، قطعی و ثبت کند.
    """
    source_model = models.CharField(max_length=100, db_index=True, verbose_name="مدل مبدا")
    source_id = models.CharField(max_length=100, db_index=True, verbose_name="شناسه رکورد مبدا")
    event_type = models.CharField(max_length=50, db_index=True, verbose_name="نوع رویداد مالی")
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True, verbose_name="زمان وقوع")
    payload = models.JSONField(default=dict, verbose_name="داده‌های رویداد و آرتیکل‌های سند")
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True, verbose_name="زمان ثبت قطعی در دفتر کل")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "رویداد مالی (Outbox)"
        verbose_name_plural = "رویدادهای مالی (Outbox)"
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['source_model', 'source_id']),
            models.Index(fields=['event_type', 'occurred_at']),
        ]

    def __str__(self):
        status_label = "ثبت‌شده در GL" if self.posted_at else "در صف صدور سند"
        return f"رویداد {self.event_type} | {self.source_model}#{self.source_id} ({status_label})"


def emit_accounting_event(source_instance, event_type: str, occurred_at=None, payload=None):
    """
    ثبت تراکنشی رویداد مالی در جدول Outbox برای تغذیه دفتر کل آینده — فاز ۸ (تسک ۷۴).
    """
    source_model = source_instance.__class__.__name__
    source_id = str(source_instance.pk)
    journal_lines = []
    if hasattr(source_instance, 'to_journal_lines'):
        try:
            lines = source_instance.to_journal_lines()
            journal_lines = [
                {
                    'account_code': l.account_code,
                    'side': l.side,
                    'amount': str(l.amount),
                    'cost_center_code': l.cost_center_code,
                    'detail_code': l.detail_code,
                    'description': l.description,
                }
                for l in lines
            ]
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[AccountingOutbox] Error generating journal lines: {e}")

    company_id = (payload or {}).get('company_id')
    company_name = (payload or {}).get('company_name')

    if not company_id:
        if hasattr(source_instance, 'company_id') and source_instance.company_id:
            company_id = source_instance.company_id
        elif hasattr(source_instance, 'company') and source_instance.company:
            company_id = getattr(source_instance.company, 'id', None)
            if not company_name and hasattr(source_instance.company, 'name'):
                company_name = source_instance.company.name
        elif hasattr(source_instance, 'project') and source_instance.project:
            company_id = getattr(source_instance.project, 'company_id', None)
            if not company_name and hasattr(source_instance.project, 'company') and source_instance.project.company:
                company_name = getattr(source_instance.project.company, 'name', None)
        elif hasattr(source_instance, 'section') and source_instance.section:
            sec = source_instance.section
            if hasattr(sec, 'project') and sec.project:
                company_id = getattr(sec.project, 'company_id', None)
                if not company_name and hasattr(sec.project, 'company') and sec.project.company:
                    company_name = getattr(sec.project.company, 'name', None)
        elif hasattr(source_instance, 'account') and source_instance.account:
            acc = source_instance.account
            if hasattr(acc, 'section') and acc.section and hasattr(acc.section, 'project') and acc.section.project:
                company_id = getattr(acc.section.project, 'company_id', None)
                if not company_name and hasattr(acc.section.project, 'company') and acc.section.project.company:
                    company_name = getattr(acc.section.project.company, 'name', None)

    if company_id and not company_name:
        try:
            c_name = Company.objects.filter(id=company_id).values_list('name', flat=True).first()
            if c_name:
                company_name = c_name
        except Exception:
            pass

    final_payload = {
        **(payload or {}),
        'company_id': company_id,
        'company_name': company_name,
        'journal_lines': journal_lines,
    }
    return AccountingEvent.objects.create(
        source_model=source_model,
        source_id=source_id,
        event_type=event_type,
        occurred_at=occurred_at or timezone.now(),
        payload=final_payload,
    )


# ==============================================================================
# لاگ جامع و پایدار ممیزی گردش‌کار و تغییرات وضعیت (Enterprise Workflow Audit Trail)
# ==============================================================================

class WorkflowAuditLog(models.Model):
    """
    ثبت دائمی و تغییرناپذیر تمامی مراحل، تاییدات، بازنگری‌ها و ابطال‌های گردش کار
    """
    content_type = models.CharField(max_length=50, verbose_name="نوع مدل") # 'personnel', 'vehicle', 'invoice', 'petty_cash', 'period'
    object_id = models.IntegerField(verbose_name="شناسه رکورد")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workflow_audit_logs',
        verbose_name="اقدام‌کننده"
    )
    from_status = models.CharField(max_length=50, blank=True, null=True, verbose_name="وضعیت مبدأ")
    to_status = models.CharField(max_length=50, verbose_name="وضعیت مقصد")
    action = models.CharField(max_length=50, verbose_name="نوع اقدام") # 'submit', 'approve', 'revision', 'reject', 'pay'
    reason = models.TextField(blank=True, null=True, verbose_name="شرح / دلیل بازنگری یا رد")
    metadata = models.JSONField(blank=True, null=True, default=dict, verbose_name="متادیتای الحاقی")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="زمان ثبت")

    class Meta:
        verbose_name = "لاگ ممیزی گردش‌کار"
        verbose_name_plural = "لاگ‌های ممیزی گردش‌کار"
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['created_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        actor_name = self.actor.username if self.actor else "سیستم"
        return f"[{self.content_type}#{self.object_id}] {self.action} by {actor_name} -> {self.to_status}"

