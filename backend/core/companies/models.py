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
    # کلید ماژول‌های خاموش در این شرکت (ت۸ طرح ۲.۱)؛ خالی یعنی همهٔ ماژول‌های نصب‌شده روشن‌اند.
    # هسته نام هیچ ماژولی را نمی‌برد؛ کدها از رجیستری ماژول‌ها می‌آیند.
    disabled_modules = models.JSONField(default=list, blank=True, verbose_name="ماژول‌های خاموش در این شرکت")

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

    # نشانی قانونی (فیلدهای بیمه، مالیات و بانک اصلی از طرح ۲.۱ به ماژول صاحبشان رفته‌اند)
    postal_code = models.CharField(max_length=20, null=True, blank=True, verbose_name="کد پستی ۱۰ رقمی اقامتگاه قانونی")

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

    @property
    def enabled_modules(self):
        """کد ماژول‌های نصب‌شده که در این شرکت خاموش نشده‌اند (ت۸)."""
        from platform_core.registry import installed_modules
        disabled = set(self.disabled_modules or ())
        return [code for code in installed_modules() if code not in disabled]


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


def _section_role_specs() -> tuple:
    """
    اعلام‌های نقش انتساب از ماژول‌های نصب‌شده (contribute('section_roles', [...])): هر مورد (کد، برچسب) یا
    (کد، برچسب، رتبه). رتبه (ت۹ طرح ۲.۲) برای «بالاترین نقش در بخش» در ۲.۳ است و در قالب قدیم None است.
    یک کلید را چند ماژول می‌توانند اعلام کنند، فقط با برچسب و رتبهٔ یکسان؛ ناهمخوانی ValueError می‌دهد.
    خروجی: تاپل (کد، برچسب، رتبه) به ترتیب اولین اعلام.
    """
    from platform_core.registry import contributions
    seen, out = {}, []
    for roles in contributions('section_roles'):
        for item in roles:
            if len(item) == 2:
                code, label, rank = item[0], item[1], None
            elif len(item) == 3:
                code, label, rank = item
            else:
                raise ValueError(f'section_roles: اعلام نقش نامعتبر {item!r}')
            if code in seen:
                if seen[code] != (label, rank):
                    raise ValueError(
                        f'section_roles: نقش «{code}» با برچسب یا رتبهٔ ناهمخوان اعلام شده است '
                        f'({seen[code]!r} در برابر {(label, rank)!r})'
                    )
                continue
            seen[code] = (label, rank)
            out.append((code, label, rank))
    return tuple(out)


def section_role_choices() -> tuple:
    """
    نقش‌های انتساب به بخش، از ماژول‌های نصب‌شده: ((کد، برچسب), ...).
    هسته خودش نقشی نمی‌شناسد (طرح Project_Section_To_Core، ت۱).
    """
    return tuple((code, label) for code, label, _rank in _section_role_specs())


def section_role_ranks() -> dict:
    """رتبهٔ هر نقش انتساب {کد: رتبه یا None} (ت۹ طرح ۲.۲؛ مقدار و معنای نهایی در ۲.۳)."""
    return {code: rank for code, _label, rank in _section_role_specs()}


class Project(models.Model):
    """
    پروژه زیر شرکت (شرکت ← پروژه ← بخش)؛ از personnel به هسته منتقل شده و جدولش همان است.
    هر پروژه حتماً شرکت دارد؛ پروژهٔ سراسری (بی‌شرکت) دیگر وجود ندارد (طرح ۲.۱، ت۲).
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
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
            models.UniqueConstraint(fields=['company', 'code'], name='unique_company_project_code'),
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


ASSIGNMENT_LEVELS = ('company', 'project', 'section')


class SectionAssignment(models.Model):
    """
    انتساب کاربر با نقشی که یکی از ماژول‌ها اعلام کرده است (section_role_choices)، در یکی از سه سطح
    (طرح ۲.۱، ت۳): شرکت (برای همهٔ بخش‌های آن)، پروژه (برای همهٔ بخش‌های آن) یا یک بخش.
    دقیقاً یکی از company، project و section پر است. پاسخ «چه کسی این نقش را در این بخش دارد» فقط از
    `org_roles` می‌آید، نه از فیلتر مستقیم روی section.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='section_assignments',
        verbose_name="کاربر سیستم"
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='user_assignments',
        verbose_name="شرکت (انتساب در سطح شرکت)"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='user_assignments',
        verbose_name="پروژه (انتساب در سطح پروژه)"
    )
    section = models.ForeignKey(
        ProjectSection,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
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
        db_table = 'personnel_usersectionassignment'
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(company__isnull=False, project__isnull=True, section__isnull=True)
                    | models.Q(company__isnull=True, project__isnull=False, section__isnull=True)
                    | models.Q(company__isnull=True, project__isnull=True, section__isnull=False)
                ),
                name='section_assignment_single_target',
            ),
            models.UniqueConstraint(
                fields=['user', 'role', 'company'], condition=models.Q(company__isnull=False),
                name='unique_assignment_company_role',
            ),
            models.UniqueConstraint(
                fields=['user', 'role', 'project'], condition=models.Q(project__isnull=False),
                name='unique_assignment_project_role',
            ),
            models.UniqueConstraint(
                fields=['user', 'role', 'section'], condition=models.Q(section__isnull=False),
                name='unique_assignment_section_role',
            ),
        ]

    @property
    def level(self):
        """سطح انتساب: 'company'، 'project' یا 'section'."""
        if self.section_id:
            return 'section'
        if self.project_id:
            return 'project'
        return 'company'

    @property
    def target(self):
        """شرکت، پروژه یا بخشی که انتساب روی آن است."""
        if self.section_id:
            return self.section
        return self.project if self.project_id else self.company

    @property
    def target_project(self):
        """پروژهٔ هدف (سطح پروژه، یا پروژهٔ بخش)؛ برای سطح شرکت None."""
        if self.section_id:
            return self.section.project
        return self.project if self.project_id else None

    @property
    def target_company_id(self):
        """شرکتی که انتساب در آن معتبر است، در هر سه سطح."""
        if self.company_id:
            return self.company_id
        project = self.target_project
        return project.company_id if project is not None else None

    def get_role_display(self):
        return dict(section_role_choices()).get(self.role, self.role)

    def __str__(self):
        return f"{self.user} -> {getattr(self.target, 'name', '-')} ({self.get_role_display()})"
