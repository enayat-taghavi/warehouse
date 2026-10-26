from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator
from companies.models import Company

# فیلدهای هویتی که Counterparty.objects.create برای ساخت طرف بیرونی می‌پذیرد (سازگاری با کد و تست‌های پیشین)
COUNTERPARTY_IDENTITY_FIELDS = ('company', 'company_id', 'kind', 'name', 'national_id', 'economic_code',
                                'registration_number', 'phone', 'mobile', 'email', 'address', 'postal_code', 'notes')


class CounterpartyManager(models.Manager):
    def create(self, **kwargs):
        """
        بی `party`: فیلدهای هویتی (company، name، national_id، phone …) طرف بیرونی تازه‌ای در هسته می‌سازند
        و طرف حساب روی آن ساخته می‌شود (ص۲ طرح ۳.۱). مسیر API از counterparty_services استفاده می‌کند.
        """
        if 'party' in kwargs or 'party_id' in kwargs:
            return super().create(**kwargs)
        from contacts.services import create_party
        identity = {k: kwargs.pop(k) for k in COUNTERPARTY_IDENTITY_FIELDS if k in kwargs}
        company = identity.pop('company', None)
        company_id = identity.pop('company_id', None)
        with transaction.atomic():
            kwargs['party'] = create_party(company or company_id, identity, kwargs.get('created_by'))
            return super().create(**kwargs)


class Counterparty(models.Model):
    """
    طرف‌حساب مالی (تأمین‌کننده، راننده، تعمیرگاه، جایگاه سوخت و...): نقش مالی یک طرف بیرونی هسته (ص۲ طرح ۳.۱).
    هویت، تماس و شرکت روی `party` است؛ حساب‌های بانکی در PartyBankAccount.
    """
    TYPE_CHOICES = (
        ('driver', 'راننده / مالک خودرو'),
        ('repair_shop', 'تعمیرگاه و قطعات'),
        ('fuel_station', 'جایگاه سوخت'),
        ('contractor', 'پیمانکار خدماتی'),
        ('other', 'سایر اشخاص حقیقی/حقوقی'),
    )
    party = models.OneToOneField(
        'contacts.ExternalParty',
        on_delete=models.PROTECT,
        related_name='counterparty',
        verbose_name="طرف بیرونی"
    )
    counterparty_type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES,
        default='other',
        verbose_name="نوع طرف‌حساب"
    )
    account_code = models.CharField(
        max_length=50, blank=True, null=True, db_index=True,
        verbose_name="کد حساب تفصیلی (رزرو دفتر کل)"
    )
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="ثبت‌کننده"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CounterpartyManager()

    class Meta:
        verbose_name = "طرف‌حساب مالی"
        verbose_name_plural = "طرف‌حساب‌های مالی"
        ordering = ['party__name']

    # خواننده‌های پیشین (اعتبار شرکت فاکتور، نام در پاسخ‌ها، خلاصهٔ گردش، اکسل) از طرف بیرونی می‌خوانند
    @property
    def company_id(self):
        return self.party.company_id

    @property
    def company(self):
        return self.party.company

    @property
    def name(self):
        return self.party.name

    @property
    def national_id(self):
        return self.party.national_id

    @property
    def phone(self):
        return self.party.phone

    def __str__(self):
        return f"{self.name} ({self.get_counterparty_type_display()})"


class PartyBankAccount(models.Model):
    """
    حساب بانکی طرف بیرونی (ص۳ طرح ۳.۱)؛ به طرف بیرونی وصل است تا در هر نقش مالی یکی باشد.
    هر طرف حداکثر یک حساب اصلی دارد؛ جایگزینی اصلی پس از حذف در signals.handle_party_bank_account_deleted.
    """
    party = models.ForeignKey(
        'contacts.ExternalParty',
        on_delete=models.PROTECT,
        related_name='bank_accounts',
        verbose_name="طرف بیرونی"
    )
    bank_name = models.CharField(max_length=100, blank=True, default='', verbose_name="نام بانک")
    account_number = models.CharField(max_length=50, blank=True, default='', verbose_name="شماره حساب")
    sheba_number = models.CharField(max_length=34, verbose_name="شماره شبا (IR...)")
    card_number = models.CharField(max_length=19, blank=True, default='', verbose_name="شماره کارت")
    owner_name = models.CharField(max_length=150, blank=True, default='', verbose_name="نام صاحب حساب")
    is_primary = models.BooleanField(default=False, verbose_name="حساب اصلی")
    is_active = models.BooleanField(default=True, verbose_name="فعال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "حساب بانکی طرف حساب"
        verbose_name_plural = "حساب‌های بانکی طرف حساب"
        ordering = ['-is_primary', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['party', 'sheba_number'], name='unique_party_bank_sheba'),
        ]

    def __str__(self):
        return f"{self.party_id} - {self.bank_name} ({self.sheba_number})"

    def save(self, *args, **kwargs):
        from ..sheba_utils import normalize_sheba
        self.sheba_number = normalize_sheba(self.sheba_number)
        # نخستین حساب طرف خودکار اصلی می‌شود (الگوی CompanyBankAccount)
        if not self.pk and not PartyBankAccount.objects.filter(party_id=self.party_id).exists():
            self.is_primary = True
        super().save(*args, **kwargs)
        if self.is_primary:
            PartyBankAccount.objects.filter(party_id=self.party_id, is_primary=True).exclude(pk=self.pk).update(is_primary=False)


def primary_party_bank_account(party):
    """حساب اصلی طرف (شیء)؛ از فهرست prefetch شده اگر هست، تا پرس‌وجوی تازه نخورد."""
    cache = getattr(party, '_prefetched_objects_cache', {}).get('bank_accounts')
    if cache is not None:
        return next((a for a in cache if a.is_primary), None)
    return PartyBankAccount.objects.filter(party_id=party.pk, is_primary=True).first()


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
        'companies.ProjectSection',
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
    # سرفصل هزینهٔ شرکت (ص۲ طرح ۳.۴)؛ متن category از عنوان آن پر می‌شود. ردیف‌های پیش از ۳.۴ خالی‌اند.
    expense_head = models.ForeignKey(
        'personnel.ExpenseHead',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoices',
        verbose_name="سرفصل هزینه (کدینگ)"
    )
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

class PettyCashAccount(models.Model):
    """
    حساب / صندوق تنخواه‌گردان بخش پروژه منتسب به کارمند (تنخواه‌دار)
    """
    section = models.ForeignKey(
        'companies.ProjectSection',
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
        'companies.ProjectSection',
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
    # فقط برای نوع expense (ص۲ طرح ۳.۴)
    expense_head = models.ForeignKey(
        'personnel.ExpenseHead',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_transactions',
        verbose_name="سرفصل هزینه (کدینگ)"
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
