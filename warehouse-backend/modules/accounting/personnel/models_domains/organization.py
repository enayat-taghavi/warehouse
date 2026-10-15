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
