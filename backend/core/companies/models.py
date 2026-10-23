"""
مدل‌های شرکت و دسترسی کاربر به شرکت؛ از personnel به هستهٔ پلتفرم منتقل شده‌اند
(طرح Modular_Deploy_Options، گام ۱). نام جدول‌ها همان نام قبلی است.
"""
from django.conf import settings
from django.db import models


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
        db_table = 'personnel_company'

    def __str__(self):
        return f"{self.name} ({self.code})"


class UserCompanyAccess(models.Model):
    """
    پیوند کاربر با شرکت (ت۸) و سطح هر بخش شرکت برای او. عضویت از اینجا نمی‌آید (ق۲).
    """
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
    # سطح هر بخش شرکت: {'identity': 'read', ...}. کلیدها از رجیستری permission_sections.
    # ردیف بدون سطح «پیوند کاربر با شرکت» است و عضویت نمی‌دهد (عضویت فقط از منبع‌های خودکار).
    section_levels = models.JSONField(default=dict, blank=True, verbose_name="سطح دسترسی بخش‌ها")
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
        db_table = 'personnel_usercompanyaccess'

    def __str__(self):
        return f"{self.user} -> {self.company.name}"


def section_role_choices() -> tuple:
    """
    نقش‌های انتساب به بخش، از ماژول‌های نصب‌شده (contribute('section_roles', [(کد, برچسب), ...])).
    هسته خودش نقشی نمی‌شناسد (طرح Project_Section_To_Core، ت۱).
    """
    from platform_core.registry import contributions
    seen, out = set(), []
    for roles in contributions('section_roles'):
        for code, label in roles:
            if code not in seen:
                seen.add(code)
                out.append((code, label))
    return tuple(out)


class Project(models.Model):
    """
    پروژه زیر شرکت (شرکت ← پروژه ← بخش)؛ از personnel به هسته منتقل شده و جدولش همان است.
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
        db_table = 'personnel_financialproject'
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
    بخش / دپارتمان تابعه پروژه
    """
    project = models.ForeignKey(
        Project,
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
        db_table = 'personnel_projectsection'

    def __str__(self):
        return f"{self.project.name} - {self.name} ({self.code})"


class SectionAssignment(models.Model):
    """
    انتساب کاربر به بخش با نقشی که یکی از ماژول‌ها اعلام کرده است (section_role_choices).
    """
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
    role = models.CharField(max_length=30, default='employee', verbose_name="نقش در بخش")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "انتساب کاربر به بخش"
        verbose_name_plural = "انتساب‌های کاربران به بخش‌ها"
        unique_together = ('user', 'section', 'role')
        db_table = 'personnel_usersectionassignment'

    def get_role_display(self):
        return dict(section_role_choices()).get(self.role, self.role)

    def __str__(self):
        return f"{self.user} -> {self.section.name} ({self.get_role_display()})"
