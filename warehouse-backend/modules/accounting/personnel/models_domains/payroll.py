from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from companies.models import Company

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
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payroll_yearly_settings',
        verbose_name="شرکت متبوع"
    )
    project = models.ForeignKey(
        'companies.Project',
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

class MonthlyPayrollRecord(models.Model):
    """
    رکورد ۵۸ ستونی محاسبه ماهانه حقوق پرسنل (منطبق بر ساختار دقیق شیت تیر ماه اکسل شرکت)
    """
    period = models.ForeignKey(
        'personnel.MonthlyWorkPeriod',
        on_delete=models.CASCADE,
        related_name='payroll_records',
        verbose_name="دوره ماهانه"
    )
    personnel = models.ForeignKey(
        'personnel.PersonnelProfile',
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
    payment_hold = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="تعلیق پرداخت (انقضای اعتبار تا تمدید)"
    )
    payment_hold_reason = models.CharField(
        max_length=250,
        blank=True,
        null=True,
        verbose_name="علت تعلیق پرداخت"
    )
    payment_hold_released_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="زمان آزادسازی پرداخت معلق"
    )
    payment_hold_released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='released_payroll_holds',
        verbose_name="کاربر آزادکننده پرداخت معلق"
    )

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
