"""
مدل‌های موتور گردش کار هسته (طرح ۲.۳-الف). وضعیت سند در خود ماژول می‌ماند (ت۲)؛ اینجا فقط نمونهٔ گردش،
کار مرحلهٔ جاری، ردیف‌های دریافت‌کنندهٔ کار باز، سابقهٔ قدم‌ها (ت۱۴)، سقف مبلغ (ت۹)، تنظیمات شرکت (ت۱۲) و
جانشین موقت (ت۱۰) نگه داشته می‌شود. هیچ نام ماژول، نقش یا مجوزی اینجا نیست (ق۱).
"""
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

USER = settings.AUTH_USER_MODEL


class WorkflowInstance(models.Model):
    """یک گردش برای یک سند؛ با ارسال دوباره (پس از عودت یا لغو) همین ردیف از نو شروع می‌شود."""
    IN_PROGRESS = 'in_progress'
    RETURNED = 'returned'
    REJECTED = 'rejected'
    CANCELLED = 'cancelled'
    COMPLETED = 'completed'
    STATUS_CHOICES = [
        (IN_PROGRESS, 'در جریان'),
        (RETURNED, 'عودت برای اصلاح'),
        (REJECTED, 'رد قطعی'),
        (CANCELLED, 'لغوشده'),
        (COMPLETED, 'پایان‌یافته'),
    ]

    workflow_key = models.CharField(max_length=64, verbose_name='کلید گردش')
    version = models.PositiveIntegerField(default=1, verbose_name='نسخهٔ تعریف گردش')
    entity_kind = models.CharField(max_length=64, verbose_name='نوع سند')
    entity_id = models.PositiveBigIntegerField(verbose_name='شناسهٔ سند')
    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='workflow_instances',
                                verbose_name='شرکت')
    section = models.ForeignKey('companies.ProjectSection', on_delete=models.PROTECT,
                                related_name='workflow_instances', verbose_name='بخش')
    created_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                   verbose_name='ثبت‌کننده')
    creator_rank = models.SmallIntegerField(default=0, verbose_name='رتبهٔ ثبت‌کننده در بخش')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=IN_PROGRESS, verbose_name='وضعیت')
    current_step = models.CharField(max_length=64, blank=True, default='', verbose_name='مرحلهٔ جاری')
    step_keys = models.JSONField(default=list, blank=True, verbose_name='ترتیب مرحله‌های نسخهٔ جاری')
    skip_plan = models.JSONField(default=dict, blank=True, verbose_name='مرحله‌های ردشده از پیش (سقف و سطح)')
    revision = models.PositiveIntegerField(default=0, verbose_name='شمارهٔ تغییر')
    others_acted = models.BooleanField(default=False, verbose_name='اقدام نفر دیگر')
    amount = models.DecimalField(max_digits=24, decimal_places=2, null=True, blank=True, verbose_name='مبلغ')
    summary = models.JSONField(default=dict, blank=True, verbose_name='خلاصهٔ کارت کار')
    submitted_at = models.DateTimeField(default=timezone.now, verbose_name='زمان ارسال')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='آخرین تغییر')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان بسته شدن')
    # ر۴ طرح ۲.۳-و: False یعنی هیچ کار این نمونه (مرحله و ارجاع) به جانشین نمی‌رسد (سند محرمانه)
    allow_substitute = models.BooleanField(default=True, verbose_name='جانشین مجاز است')

    class Meta:
        verbose_name = 'نمونهٔ گردش کار'
        verbose_name_plural = 'نمونه‌های گردش کار'
        constraints = [
            models.UniqueConstraint(fields=['workflow_key', 'entity_kind', 'entity_id'],
                                    name='workflow_instance_unique_entity'),
        ]
        indexes = [
            models.Index(fields=['company', 'status'], name='wf_inst_company_status'),
            models.Index(fields=['entity_kind', 'entity_id'], name='wf_inst_entity'),
        ]

    def __str__(self):
        return f'{self.workflow_key}:{self.entity_kind}#{self.entity_id} ({self.status})'


class WorkflowTask(models.Model):
    """
    یک بار رسیدن گردش به یک مرحله (مسیر step؛ فقط یک کار باز برای هر نمونه)، یا یک شاخهٔ ارجاع به کاربر مشخص
    (مسیر referral، طرح ۲.۳-و؛ چند شاخهٔ باز هم‌زمان، بی‌نقش و مجوز). ماشین مرحله‌ها کار ارجاع را جابه‌جا نمی‌کند.
    """
    TRACK_STEP = 'step'
    TRACK_REFERRAL = 'referral'
    TRACK_CHOICES = [
        (TRACK_STEP, 'مرحله'),
        (TRACK_REFERRAL, 'ارجاع'),
    ]
    ACTED = 'acted'
    RETURNED = 'returned'
    REJECTED = 'rejected'
    CANCELLED = 'cancelled'
    SKIPPED = 'skipped'
    SUPERSEDED = 'superseded'
    OUTCOME_CHOICES = [
        (ACTED, 'انجام شد'),
        (RETURNED, 'عودت شد'),
        (REJECTED, 'رد شد'),
        (CANCELLED, 'لغو شد'),
        (SKIPPED, 'رد شدن خودکار'),
        (SUPERSEDED, 'جایگزین با تعریف تازه'),
    ]

    instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name='tasks',
                                 verbose_name='نمونهٔ گردش')
    step_key = models.CharField(max_length=64, verbose_name='مرحله')
    step_kind = models.CharField(max_length=16, verbose_name='نوع مرحله')
    role = models.CharField(max_length=64, verbose_name='نقش دریافت‌کننده')
    permission = models.CharField(max_length=150, verbose_name='مجوز اقدام')
    revision = models.PositiveIntegerField(default=0, verbose_name='شمارهٔ تغییر نمونه هنگام باز شدن')
    is_open = models.BooleanField(default=True, db_index=True, verbose_name='باز')
    has_recipients = models.BooleanField(default=False, verbose_name='دریافت‌کنندهٔ اصلی دارد')
    opened_at = models.DateTimeField(default=timezone.now, verbose_name='زمان باز شدن')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان بسته شدن')
    closed_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                  verbose_name='بسته‌شده به دست')
    outcome = models.CharField(max_length=16, choices=OUTCOME_CHOICES, blank=True, default='', verbose_name='نتیجه')
    reminder_sent_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان یادآوری')
    escalated_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان خبر به بالاتر')
    superuser_alerted_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان هشدار مدیر کل')
    # ارجاع (ر۱ و ر۲ طرح ۲.۳-و)؛ برای کار مرحله خالی می‌مانند
    track = models.CharField(max_length=16, choices=TRACK_CHOICES, default=TRACK_STEP, db_index=True,
                             verbose_name='مسیر')
    target_user = models.ForeignKey(USER, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
                                    verbose_name='گیرندهٔ ارجاع')
    parent_task = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='children', verbose_name='کار والد')
    referred_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                    verbose_name='ارجاع‌دهنده')
    instruction = models.TextField(blank=True, default='', verbose_name='دستور')
    due_at = models.DateTimeField(null=True, blank=True, verbose_name='مهلت')
    reply = models.TextField(blank=True, default='', verbose_name='پاسخ')

    class Meta:
        verbose_name = 'کار گردش'
        verbose_name_plural = 'کارهای گردش'
        constraints = [
            models.UniqueConstraint(fields=['instance'], condition=Q(is_open=True, track='step'),
                                    name='workflow_task_one_open_per_instance'),
        ]
        indexes = [
            models.Index(fields=['is_open', 'has_recipients'], name='wf_task_open_recipients'),
        ]

    def __str__(self):
        return f'{self.instance_id}:{self.step_key} ({"باز" if self.is_open else self.outcome})'


class WorkflowTaskRecipient(models.Model):
    """
    ردیف مشتق دریافت‌کنندهٔ کار باز (ت۴)؛ با بسته شدن کار حذف می‌شود و سابقه در WorkflowStep است.
    ردیف جانشین on_behalf_of و بازهٔ جانشینی را دارد و پرس‌وجوها بازه را می‌سنجند (ت۱۰).
    """
    task = models.ForeignKey(WorkflowTask, on_delete=models.CASCADE, related_name='recipients', verbose_name='کار')
    user = models.ForeignKey(USER, on_delete=models.CASCADE, related_name='workflow_task_rows', verbose_name='کاربر')
    on_behalf_of = models.ForeignKey(USER, on_delete=models.CASCADE, null=True, blank=True, related_name='+',
                                     verbose_name='به جانشینی از')
    valid_from = models.DateField(null=True, blank=True, verbose_name='شروع جانشینی')
    valid_to = models.DateField(null=True, blank=True, verbose_name='پایان جانشینی')
    # «رسید» این ردیف جانشین فرستاده شده و هنوز «برداشته شد» نگرفته (ت۱۰ و ت۱۲). ردیف بازهٔ آینده False می‌ماند
    # تا زمان‌بند هنگام شروع بازه «رسید» را بفرستد. ردیف اصلی همیشه اعلام‌شده حساب می‌شود.
    announced = models.BooleanField(default=False, verbose_name='اعلام‌شده')
    # ر۳ طرح ۲.۳-و: اولین باز کردن کار به دست دارندهٔ همین ردیف
    read_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان خواندن')

    class Meta:
        verbose_name = 'دریافت‌کنندهٔ کار'
        verbose_name_plural = 'دریافت‌کنندگان کار'
        constraints = [
            models.UniqueConstraint(fields=['task', 'user'], condition=Q(on_behalf_of__isnull=True),
                                    name='workflow_recipient_unique_principal'),
            models.UniqueConstraint(fields=['task', 'user', 'on_behalf_of'], condition=Q(on_behalf_of__isnull=False),
                                    name='workflow_recipient_unique_substitute'),
        ]
        indexes = [
            models.Index(fields=['user', 'task'], name='wf_recipient_user_task'),
        ]


class WorkflowStep(models.Model):
    """سابقهٔ قدم‌های گردش (ت۱۴)؛ کاربر حذف‌شده سابقه را پاک نمی‌کند (SET_NULL)."""
    SUBMIT = 'submit'
    ACT = 'act'
    RETURN = 'return'
    REJECT = 'reject'
    CANCEL = 'cancel'
    AUTO = 'auto'
    REFER = 'refer'
    DONE = 'done'
    SEEN = 'seen'
    ACTION_CHOICES = [
        (SUBMIT, 'ارسال'),
        (ACT, 'اقدام'),
        (RETURN, 'عودت برای اصلاح'),
        (REJECT, 'رد قطعی'),
        (CANCEL, 'لغو'),
        (AUTO, 'خودکار'),
        (REFER, 'ارجاع'),
        (DONE, 'انجام شد'),
        (SEEN, 'رؤیت شد'),
    ]

    instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE, related_name='steps',
                                 verbose_name='نمونهٔ گردش')
    task = models.ForeignKey(WorkflowTask, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                             verbose_name='کار')
    actor = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                              verbose_name='انجام‌دهنده (خالی یعنی سامانه)')
    on_behalf_of = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                     verbose_name='به جانشینی از')
    as_superuser = models.BooleanField(default=False, verbose_name='اقدام مدیر کل')
    action = models.CharField(max_length=16, choices=ACTION_CHOICES, verbose_name='اقدام')
    from_step = models.CharField(max_length=64, blank=True, default='', verbose_name='از مرحله')
    to_step = models.CharField(max_length=64, blank=True, default='', verbose_name='به مرحله')
    reason = models.TextField(blank=True, default='', verbose_name='دلیل')
    skipped = models.JSONField(default=list, blank=True, verbose_name='مرحله‌های ردشده با دلیل')
    at = models.DateTimeField(default=timezone.now, verbose_name='زمان')

    class Meta:
        verbose_name = 'قدم گردش کار'
        verbose_name_plural = 'قدم‌های گردش کار'
        ordering = ['at', 'id']
        indexes = [
            models.Index(fields=['instance', 'at'], name='wf_step_instance_at'),
        ]


class WorkflowThreshold(models.Model):
    """سقف مبلغ یک مرحلهٔ تأیید برای شرکت یا بخش (ت۹)؛ سقف بخش بر سقف شرکت مقدم است."""
    workflow_key = models.CharField(max_length=64, verbose_name='کلید گردش')
    step_key = models.CharField(max_length=64, verbose_name='مرحله')
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, null=True, blank=True,
                                related_name='+', verbose_name='شرکت')
    section = models.ForeignKey('companies.ProjectSection', on_delete=models.CASCADE, null=True, blank=True,
                                related_name='+', verbose_name='بخش')
    amount = models.DecimalField(max_digits=24, decimal_places=2, verbose_name='سقف مبلغ')
    updated_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                   verbose_name='آخرین ویرایش‌کننده')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='آخرین ویرایش')

    class Meta:
        verbose_name = 'سقف مرحلهٔ گردش'
        verbose_name_plural = 'سقف‌های مرحلهٔ گردش'
        constraints = [
            models.CheckConstraint(
                check=(Q(company__isnull=False, section__isnull=True) | Q(company__isnull=True, section__isnull=False)),
                name='workflow_threshold_single_target',
            ),
            models.UniqueConstraint(fields=['workflow_key', 'step_key', 'company'], condition=Q(company__isnull=False),
                                    name='workflow_threshold_unique_company'),
            models.UniqueConstraint(fields=['workflow_key', 'step_key', 'section'], condition=Q(section__isnull=False),
                                    name='workflow_threshold_unique_section'),
        ]


class WorkflowCompanySettings(models.Model):
    """مدت یادآوری و خبر به بالاتر برای هر شرکت (ت۱۲)؛ بی‌ردیف یعنی پیش‌فرض ۴۸ و ۹۶ ساعت."""
    DEFAULT_REMINDER_HOURS = 48
    DEFAULT_ESCALATION_HOURS = 96

    company = models.OneToOneField('companies.Company', on_delete=models.CASCADE, related_name='workflow_settings',
                                   verbose_name='شرکت')
    reminder_hours = models.PositiveIntegerField(default=DEFAULT_REMINDER_HOURS, verbose_name='ساعت تا یادآوری')
    escalation_hours = models.PositiveIntegerField(default=DEFAULT_ESCALATION_HOURS,
                                                   verbose_name='ساعت تا خبر به بالاتر')
    updated_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                   verbose_name='آخرین ویرایش‌کننده')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='آخرین ویرایش')

    class Meta:
        verbose_name = 'تنظیمات گردش کار شرکت'
        verbose_name_plural = 'تنظیمات گردش کار شرکت‌ها'

    @classmethod
    def for_company(cls, company_id):
        """ردیف تنظیمات شرکت یا نمونهٔ ذخیره‌نشده با مقدارهای پیش‌فرض."""
        return cls.objects.filter(company_id=company_id).first() or cls(company_id=company_id)


class WorkflowSubstitute(models.Model):
    """
    جانشین موقت (ت۱۰): substitute در بازهٔ [start_date, end_date] کارهای گردش principal را می‌گیرد، فقط در
    شرکت company (خالی یعنی همهٔ شرکت‌ها). زنجیره نمی‌شود و ثبت‌کنندهٔ سند هرگز جانشین کار همان سند نیست.
    """
    principal = models.ForeignKey(USER, on_delete=models.CASCADE, related_name='workflow_substitutions',
                                  verbose_name='صاحب کار')
    substitute = models.ForeignKey(USER, on_delete=models.CASCADE, related_name='workflow_substituting',
                                   verbose_name='جانشین')
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, null=True, blank=True,
                                related_name='+', verbose_name='شرکت (خالی یعنی همه)')
    start_date = models.DateField(verbose_name='شروع')
    end_date = models.DateField(verbose_name='پایان')
    created_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                   verbose_name='تعیین‌کننده')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ثبت')
    revoked_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان لغو')
    revoked_by = models.ForeignKey(USER, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
                                   verbose_name='لغوکننده')

    class Meta:
        verbose_name = 'جانشین گردش کار'
        verbose_name_plural = 'جانشین‌های گردش کار'
        constraints = [
            models.CheckConstraint(check=Q(end_date__gte=models.F('start_date')),
                                   name='workflow_substitute_end_after_start'),
            models.CheckConstraint(check=~Q(principal=models.F('substitute')),
                                   name='workflow_substitute_not_self'),
        ]
        indexes = [
            models.Index(fields=['principal', 'end_date'], name='wf_sub_principal_end'),
            models.Index(fields=['substitute', 'end_date'], name='wf_sub_substitute_end'),
        ]
