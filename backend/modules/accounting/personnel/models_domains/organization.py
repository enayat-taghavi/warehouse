from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone
from companies.models import Company

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

    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name='documents', verbose_name="شرکت متبوع")
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
        on_delete=models.PROTECT,
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
        constraints = [
            # یکتایی شبا در هر شرکت (F2)؛ شبا در save() یکسان‌سازی می‌شود
            models.UniqueConstraint(fields=['company', 'sheba_number'], name='unique_company_bank_sheba'),
        ]

    def __str__(self):
        return f"{self.company.name} - {self.bank_name} ({self.sheba_number})"

    def save(self, *args, **kwargs):
        # پاک‌سازی و نرمال‌سازی شبا (تابع مشترک با حساب بانکی طرف حساب، ص۳ طرح ۳.۱)
        if self.sheba_number:
            from ..sheba_utils import normalize_sheba
            self.sheba_number = normalize_sheba(self.sheba_number)

        # اگر اولین حساب این شرکت است، خودکار اصلی شود
        if not self.pk and not CompanyBankAccount.objects.filter(company=self.company).exists():
            self.is_primary = True

        super().save(*args, **kwargs)

        # هر شرکت حداکثر یک حساب اصلی دارد؛ حساب اصلی تنها منبع «بانک اصلی شرکت» است (ت۶ طرح ۲.۱)
        if self.is_primary:
            CompanyBankAccount.objects.filter(company=self.company, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        # جایگزینی حساب اصلی پس از حذف در سیگنال post_delete است (signals.handle_bank_account_deleted)


def primary_bank_account(company):
    """حساب اصلی فعال شرکت (شیء یا شناسه)، یا None. جای فیلدهای حذف‌شدهٔ primary_* روی Company."""
    company_id = getattr(company, 'pk', company)
    if company_id is None:
        return None
    return CompanyBankAccount.objects.filter(company_id=company_id, is_primary=True, is_active=True).first()


class CompanyPayrollProfile(models.Model):
    """
    پروندهٔ بیمه و مالیات شرکت برای دیسکت حقوق (ت۵ طرح ۲.۱)؛ این فیلدها پیش‌تر روی Company هسته بودند.
    یک‌به‌یک با شرکت و در صورت نیاز ساخته می‌شود (`for_company`). مجوز آن حوزهٔ `insurance_tax` است.
    """
    company = models.OneToOneField(
        Company,
        on_delete=models.CASCADE,
        related_name='payroll_profile',
        verbose_name="شرکت"
    )
    # تنظیمات کارگاهی بیمه تأمین اجتماعی (منطبق بر دیسکت DSKKAR00.DBF)
    workshop_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد کارگاه تأمین اجتماعی (۱۰ رقم)")
    social_security_branch_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد شعبه تأمین اجتماعی")
    social_security_branch_name = models.CharField(max_length=100, null=True, blank=True, verbose_name="نام شعبه تأمین اجتماعی")
    contract_row = models.CharField(max_length=20, null=True, blank=True, verbose_name="ردیف پیمان بیمه")
    employer_name = models.CharField(max_length=150, null=True, blank=True, verbose_name="نام کارفرما در لیست بیمه")
    # تنظیمات سامانه مودیان مالیاتی
    tax_memory_id = models.CharField(max_length=20, null=True, blank=True, verbose_name="شناسه یکتای حافظه مالیاتی (۶ کاراکتر)")
    tax_economic_code = models.CharField(max_length=50, null=True, blank=True, verbose_name="کد اقتصادی جدید ۱۶ رقمی")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="تاریخ ثبت")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="تاریخ آخرین ویرایش")

    FIELDS = (
        'workshop_code', 'social_security_branch_code', 'social_security_branch_name', 'contract_row',
        'employer_name', 'tax_memory_id', 'tax_economic_code',
    )

    class Meta:
        verbose_name = "پروندهٔ بیمه و مالیات شرکت"
        verbose_name_plural = "پرونده‌های بیمه و مالیات شرکت‌ها"

    def __str__(self):
        return f"بیمه و مالیات {self.company}"

    @classmethod
    def for_company(cls, company):
        profile, _ = cls.objects.get_or_create(company=company)
        return profile

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
        on_delete=models.PROTECT,
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

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

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
        on_delete=models.PROTECT,
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
