"""
مدل‌های ماژول نامه‌های شرکت (ن۲ طرح plan_letters.md).

- همهٔ مدل‌ها شرکت دارند (مستقیم یا از راه نامه) و روی شرکت شاخص دارند.
- هیچ مدلی حذف واقعی ندارد: پیش‌نویسِ کنارگذاشته `void` می‌شود. پس همهٔ کلیدهای خارجی PROTECT‌اند،
  هم به دادهٔ هسته (شرکت، کاربر، پروژه، طرف بیرونی، شمارهٔ صادرشده) و هم داخل ماژول.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

# بی‌نقطه: API پیوست هسته نوع را با ^[a-z][a-z0-9_]{0,49}$ می‌پذیرد (یافتهٔ ل-ج)
LETTER_ENTITY = 'letters_letter'
SECRETARIAT_ENTITY = 'letters_secretariat'


class Secretariat(models.Model):
    """دبیرخانهٔ شرکت؛ هر شرکت یکی، با اولین کار دبیرخانه خودکار ساخته می‌شود (get_or_create)."""
    company = models.OneToOneField('companies.Company', on_delete=models.PROTECT, related_name='+',
                                   verbose_name='شرکت')
    title = models.CharField(max_length=200, default='دبیرخانه', verbose_name='عنوان')
    is_active = models.BooleanField(default=True, verbose_name='فعال')

    class Meta:
        verbose_name = 'دبیرخانه'
        verbose_name_plural = 'دبیرخانه‌ها'

    def __str__(self):
        return f'{self.title} ({self.company_id})'


class Letter(models.Model):
    KIND_INTERNAL, KIND_OUTGOING, KIND_INCOMING, KIND_MINUTES, KIND_CIRCULAR = (
        'internal', 'outgoing', 'incoming', 'minutes', 'circular')
    KIND_CHOICES = (
        (KIND_INTERNAL, 'داخلی'),
        (KIND_OUTGOING, 'صادره'),
        (KIND_INCOMING, 'وارده'),
        (KIND_MINUTES, 'صورت‌جلسه'),
        (KIND_CIRCULAR, 'بخشنامه'),
    )
    CONF_NORMAL, CONF_CONFIDENTIAL, CONF_SECRET = 'normal', 'confidential', 'secret'
    CONFIDENTIALITY_CHOICES = (
        (CONF_NORMAL, 'عادی'),
        (CONF_CONFIDENTIAL, 'محرمانه'),
        (CONF_SECRET, 'سری'),
    )
    STATUS_DRAFT, STATUS_SIGNING, STATUS_REGISTERED, STATUS_SENT, STATUS_ARCHIVED, STATUS_RECEIVED, STATUS_VOID = (
        'draft', 'signing', 'registered', 'sent', 'archived', 'received', 'void')
    STATUS_CHOICES = (
        (STATUS_DRAFT, 'پیش‌نویس'),
        (STATUS_SIGNING, 'در امضا'),
        (STATUS_REGISTERED, 'ثبت‌شده'),
        (STATUS_SENT, 'ارسال‌شده'),
        (STATUS_ARCHIVED, 'بایگانی'),
        (STATUS_RECEIVED, 'دریافت‌شده'),
        (STATUS_VOID, 'باطل'),
    )
    # از ثبت به بعد متن، موضوع، گیرنده‌ها و پیوست اصلی قفل‌اند (ن۳)
    LOCKED_STATUSES = (STATUS_REGISTERED, STATUS_SENT, STATUS_ARCHIVED, STATUS_VOID)
    SIGN_ELECTRONIC, SIGN_WET = 'electronic', 'wet'
    SIGN_MODE_CHOICES = ((SIGN_ELECTRONIC, 'امضای الکترونیکی'), (SIGN_WET, 'امضای زنده'))
    SOURCE_INTERNAL, SOURCE_PORTAL = 'internal', 'portal'
    SOURCE_CHOICES = ((SOURCE_INTERNAL, 'داخلی'), (SOURCE_PORTAL, 'درگاه'))

    company = models.ForeignKey('companies.Company', on_delete=models.PROTECT, related_name='+', verbose_name='شرکت')
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, verbose_name='نوع')
    subject = models.CharField(max_length=500, blank=True, default='', verbose_name='موضوع')
    body = models.JSONField(default=list, blank=True, verbose_name='متن (بلوکی)')
    confidentiality = models.CharField(max_length=16, choices=CONFIDENTIALITY_CHOICES, default=CONF_NORMAL,
                                       verbose_name='محرمانگی')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, verbose_name='وضعیت')
    sign_mode = models.CharField(max_length=16, choices=SIGN_MODE_CHOICES, default=SIGN_ELECTRONIC,
                                 verbose_name='روش امضا')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+',
                               verbose_name='نویسنده')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ساخت')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='زمان آخرین تغییر')
    revision = models.PositiveIntegerField(default=1, verbose_name='نسخه')

    # شماره (ن۴): فقط در لحظهٔ ثبت
    number_display = models.CharField(max_length=64, blank=True, default='', verbose_name='شمارهٔ نامه')
    issued_number = models.ForeignKey('numbering.IssuedNumber', null=True, blank=True, on_delete=models.PROTECT,
                                      related_name='+', verbose_name='شمارهٔ صادرشده')
    registered_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان ثبت')
    registered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                      related_name='+', verbose_name='ثبت‌کننده')

    # وارده
    external_number = models.CharField(max_length=64, blank=True, default='', verbose_name='شمارهٔ فرستنده')
    external_date = models.DateField(null=True, blank=True, verbose_name='تاریخ نامهٔ فرستنده')
    sender_party = models.ForeignKey('contacts.ExternalParty', null=True, blank=True, on_delete=models.PROTECT,
                                     related_name='+', verbose_name='فرستنده')

    follow_up_of = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT,
                                     related_name='follow_ups', verbose_name='پیرو')
    reply_to = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT,
                                 related_name='replies', verbose_name='بازگشت به')
    response_due_at = models.DateTimeField(null=True, blank=True, verbose_name='مهلت پاسخ')
    # بایگانی بر اساس پروژه (س۶)؛ پروژه دسترسی نمی‌دهد. هم‌شرکتی بودن را API می‌سنجد (ل-ج).
    project = models.ForeignKey('companies.Project', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='+', verbose_name='پروژه')

    # قفل ویرایش نوبتی (ن۱۰)
    edit_locked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                       related_name='+', verbose_name='در حال ویرایش توسط')
    edit_locked_until = models.DateTimeField(null=True, blank=True, verbose_name='پایان قفل ویرایش')

    # صف آفلاین (ن۱۱): ثبت تکراری همان نامه را برمی‌گرداند
    client_temp_id = models.UUIDField(null=True, blank=True, verbose_name='شناسهٔ موقت دستگاه')
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default=SOURCE_INTERNAL, verbose_name='منبع')

    # ارسال صادره به دست دبیرخانه (ن۳، س۹): روش و زمان؛ بایگانی بازگشت‌پذیر از روی همین به «ارسال‌شده» برمی‌گردد
    SEND_IN_PERSON, SEND_POST, SEND_COURIER, SEND_EMAIL = 'in_person', 'post', 'courier', 'email'
    SEND_METHOD_CHOICES = (
        (SEND_IN_PERSON, 'حضوری'),
        (SEND_POST, 'پست'),
        (SEND_COURIER, 'پیک'),
        (SEND_EMAIL, 'ایمیل دستی'),
    )
    sent_method = models.CharField(max_length=16, choices=SEND_METHOD_CHOICES, blank=True, default='',
                                   verbose_name='روش ارسال')
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان ارسال')

    void_reason = models.TextField(blank=True, default='', verbose_name='دلیل ابطال')
    voided_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان ابطال')
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                  related_name='+', verbose_name='باطل‌کننده')

    class Meta:
        verbose_name = 'نامه'
        verbose_name_plural = 'نامه‌ها'
        indexes = [
            models.Index(fields=['company', 'kind', 'status'], name='letters_co_kind_status'),
            models.Index(fields=['company', 'registered_at'], name='letters_co_registered'),
            models.Index(fields=['company', 'number_display'], name='letters_co_number'),
            models.Index(fields=['company', 'response_due_at'], name='letters_co_due'),
            models.Index(fields=['company', 'project'], name='letters_co_project'),
        ]
        constraints = [
            models.UniqueConstraint(fields=['author', 'client_temp_id'], condition=Q(client_temp_id__isnull=False),
                                    name='letters_author_client_temp_unique'),
        ]

    def __str__(self):
        return self.number_display or f'#{self.pk}'

    @property
    def is_locked(self) -> bool:
        return self.status in self.LOCKED_STATUSES

    @property
    def is_confidential(self) -> bool:
        return self.confidentiality != self.CONF_NORMAL


class LetterRecipient(models.Model):
    ROLE_TO, ROLE_CC = 'to', 'cc'
    ROLE_CHOICES = ((ROLE_TO, 'گیرنده'), (ROLE_CC, 'رونوشت'))
    TARGET_USER, TARGET_SECTION, TARGET_PARTY, TARGET_TEXT = 'user', 'section', 'party', 'text'
    TARGET_CHOICES = (
        (TARGET_USER, 'کاربر'),
        (TARGET_SECTION, 'بخش'),
        (TARGET_PARTY, 'طرف بیرونی'),
        (TARGET_TEXT, 'نام آزاد'),
    )

    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='recipients', verbose_name='نامه')
    role = models.CharField(max_length=8, choices=ROLE_CHOICES, default=ROLE_TO, verbose_name='نقش')
    target_type = models.CharField(max_length=16, choices=TARGET_CHOICES, verbose_name='نوع گیرنده')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                             related_name='+', verbose_name='کاربر')
    section_id = models.PositiveIntegerField(null=True, blank=True, verbose_name='بخش')
    party = models.ForeignKey('contacts.ExternalParty', null=True, blank=True, on_delete=models.PROTECT,
                              related_name='+', verbose_name='طرف بیرونی')
    name_text = models.CharField(max_length=200, blank=True, default='', verbose_name='نام')
    title_text = models.CharField(max_length=200, blank=True, default='', verbose_name='سمت')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='ترتیب')

    class Meta:
        verbose_name = 'گیرندهٔ نامه'
        verbose_name_plural = 'گیرنده‌های نامه'
        ordering = ('letter', 'role', 'order', 'id')
        indexes = [
            models.Index(fields=['user', 'letter'], name='letters_rcpt_user'),
            models.Index(fields=['section_id', 'letter'], name='letters_rcpt_section'),
        ]
        constraints = [
            # هر نوع گیرنده فقط با فیلد خودش (دادهٔ نادرست به پایگاه نمی‌رسد)
            models.CheckConstraint(
                check=(Q(target_type='user', user__isnull=False)
                       | Q(target_type='section', section_id__isnull=False)
                       | Q(target_type='party', party__isnull=False)
                       | (Q(target_type='text') & ~Q(name_text=''))),
                name='letters_rcpt_target_valid'),
        ]


class LetterSigner(models.Model):
    STATUS_PENDING, STATUS_SIGNED, STATUS_RETURNED = 'pending', 'signed', 'returned'
    STATUS_CHOICES = ((STATUS_PENDING, 'در انتظار'), (STATUS_SIGNED, 'امضا شد'), (STATUS_RETURNED, 'عودت شد'))

    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='signers', verbose_name='نامه')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+',
                             verbose_name='امضاکننده')
    order = models.PositiveSmallIntegerField(default=0, verbose_name='ترتیب')
    title_text = models.CharField(max_length=200, blank=True, default='', verbose_name='سمت روی برگ')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='وضعیت')
    signed_at = models.DateTimeField(null=True, blank=True, verbose_name='زمان امضا')

    class Meta:
        verbose_name = 'امضاکنندهٔ نامه'
        verbose_name_plural = 'امضاکننده‌های نامه'
        ordering = ('letter', 'order', 'id')
        indexes = [models.Index(fields=['user', 'letter'], name='letters_signer_user')]
        constraints = [
            # هر نفر یک بار امضا می‌کند (ل-۰: نفر تکراری فقط یک بار)
            models.UniqueConstraint(fields=['letter', 'user'], name='letters_signer_unique'),
        ]


class LetterEditor(models.Model):
    """هم‌نویسندهٔ پیش‌نویس (ن۱۰)."""
    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='editors', verbose_name='نامه')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+',
                             verbose_name='هم‌نویسنده')

    class Meta:
        verbose_name = 'هم‌نویسندهٔ نامه'
        verbose_name_plural = 'هم‌نویسنده‌های نامه'
        indexes = [models.Index(fields=['user', 'letter'], name='letters_editor_user')]
        constraints = [models.UniqueConstraint(fields=['letter', 'user'], name='letters_editor_unique')]


class LetterLink(models.Model):
    """پیوند نامه به سند دیگر (ن۱۳)؛ نوع و شناسه مثل پیوست‌ها، بی‌وابستگی به ماژول مالک."""
    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='links', verbose_name='نامه')
    entity_kind = models.CharField(max_length=64, verbose_name='نوع سند')
    entity_id = models.CharField(max_length=64, verbose_name='شناسهٔ سند')
    title_snapshot = models.CharField(max_length=300, blank=True, default='', verbose_name='عنوان سند')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+',
                                   verbose_name='سازنده')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان ساخت')

    class Meta:
        verbose_name = 'پیوند نامه'
        verbose_name_plural = 'پیوندهای نامه'
        indexes = [models.Index(fields=['entity_kind', 'entity_id'], name='letters_link_entity')]
        constraints = [
            models.UniqueConstraint(fields=['letter', 'entity_kind', 'entity_id'], name='letters_link_unique'),
        ]


class LetterDraftCopy(models.Model):
    """نسخهٔ ناهمگامی که از صف آفلاین رسید و با نسخهٔ سرور برخورد داشت (ن۱۱). هرگز پاک نمی‌شود."""
    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='draft_copies', verbose_name='نامه')
    subject = models.CharField(max_length=500, blank=True, default='', verbose_name='موضوع')
    body = models.JSONField(default=list, blank=True, verbose_name='متن (بلوکی)')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='+',
                                   verbose_name='فرستنده')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='زمان رسیدن')
    reason = models.CharField(max_length=64, blank=True, default='', verbose_name='دلیل')

    class Meta:
        verbose_name = 'نسخهٔ ناهمگام نامه'
        verbose_name_plural = 'نسخه‌های ناهمگام نامه'
        ordering = ('letter', '-created_at', '-id')


class CircularAudience(models.Model):
    """مخاطب بخشنامه (س۴): همهٔ شرکت یا یک بخش."""
    SCOPE_COMPANY, SCOPE_SECTION = 'company', 'section'
    SCOPE_CHOICES = ((SCOPE_COMPANY, 'همهٔ شرکت'), (SCOPE_SECTION, 'بخش'))

    letter = models.ForeignKey(Letter, on_delete=models.PROTECT, related_name='audiences', verbose_name='نامه')
    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, verbose_name='دامنه')
    section_id = models.PositiveIntegerField(null=True, blank=True, verbose_name='بخش')

    class Meta:
        verbose_name = 'مخاطب بخشنامه'
        verbose_name_plural = 'مخاطبان بخشنامه'
        indexes = [models.Index(fields=['section_id', 'letter'], name='letters_aud_section')]
        constraints = [
            models.CheckConstraint(
                check=(Q(scope='company', section_id__isnull=True) | Q(scope='section', section_id__isnull=False)),
                name='letters_aud_scope_valid'),
        ]
