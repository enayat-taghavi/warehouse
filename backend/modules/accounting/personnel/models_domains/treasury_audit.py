from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce
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


# ارقام فارسی (U+06F0..) و عربی (U+0660..) به لاتین؛ فاصله‌ها، نیم‌فاصله، کشیده و انواع خط تیره حذف (د۳ طرح ۴.۱).
# نسخهٔ ثابت همین در migration personnel/0015 کپی شده است؛ تغییر این تابع به migration دست نمی‌زند.
_INVOICE_NUMBER_DIGITS = str.maketrans(
    '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9'
    '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669',
    '01234567890123456789',
)
# خط تیره‌ها (- و U+2010..U+2015، منفی، فرم‌های کوچک و تمام‌عرض)، کشیده، نیم‌فاصله و نویسه‌های نامرئی جهت.
_INVOICE_NUMBER_DROP = frozenset(
    '-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d'
    '\u0640\u200c\u200d\u200e\u200f\ufeff'
)


def normalize_invoice_number(value):
    """شمارهٔ فاکتور فروشنده برای یافتن تکراری: ارقام لاتین، بی فاصله و بی خط تیره."""
    if not value:
        return ''
    text = str(value).translate(_INVOICE_NUMBER_DIGITS)
    return ''.join(ch for ch in text if not ch.isspace() and ch not in _INVOICE_NUMBER_DROP)[:100]


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
        ('partially_paid', 'پرداخت ناقص'),
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
    # شمارهٔ فاکتور فروشنده اختیاری است (رسید بی شماره هم ثبت می‌شود)؛ خالی در یافتن تکراری شرکت نمی‌کند
    invoice_number = models.CharField(max_length=100, blank=True, default='', verbose_name="شماره فاکتور / رسید")
    invoice_date_shamsi = models.CharField(max_length=10, verbose_name="تاریخ فاکتور (شمسی)")
    # مبلغ قابل پرداخت = subtotal − discount_amount + vat_amount (د۱ طرح ۴.۱)؛ سقف گردش و سند از همین می‌خوانند.
    amount = models.DecimalField(max_digits=15, decimal_places=0, verbose_name="مبلغ فاکتور (ریال)")
    # جمع‌ها را سرور حساب می‌کند؛ سرفصل هزینه روی ردیف‌هاست (ExpenseInvoiceLine)، نه روی فاکتور.
    subtotal = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="جمع ردیف‌ها (ریال)")
    discount_amount = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="تخفیف (ریال)")
    vat_applicable = models.BooleanField(default=False, verbose_name="مشمول مالیات بر ارزش افزوده")
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                   verbose_name="نرخ مالیات در لحظهٔ ثبت (درصد)")
    vat_amount = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="مالیات بر ارزش افزوده (ریال)")
    vat_manual = models.BooleanField(default=False, verbose_name="مالیات دستی اصلاح شده")
    # شمارهٔ فروشنده پس از یکسان‌سازی (د۳)؛ save() پرش می‌کند. شاخص (counterparty, invoice_number_norm) در Meta.
    invoice_number_norm = models.CharField(max_length=100, blank=True, default='', verbose_name="شمارهٔ فاکتور یکسان‌شده")
    possible_duplicate = models.BooleanField(default=False, verbose_name="احتمال تکراری")
    duplicate_reason = models.TextField(blank=True, default='', verbose_name="دلیل ارسال فاکتور تکراری")
    # شمارهٔ داخلی (د۴): در اولین ارسال به گردش صادر می‌شود.
    number = models.CharField(max_length=150, blank=True, default='', db_index=True, verbose_name="شمارهٔ داخلی فاکتور")
    issued_number = models.ForeignKey(
        'numbering.IssuedNumber',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="شمارهٔ صادرشده"
    )
    # خالی بیاید، سریالایزر از شرح ردیف اول پر می‌کند
    description = models.TextField(blank=True, verbose_name="شرح هزینه")
    attachment = models.FileField(upload_to='invoices/', blank=True, null=True, verbose_name="تصویر یا فایل فاکتور")
    status = models.CharField(max_length=30, choices=INVOICE_STATUS_CHOICES, default='draft', verbose_name="وضعیت فاکتور")
    rejection_reason = models.TextField(blank=True, null=True, verbose_name="علت رد یا بازنگری فاکتور")
    # جمع قسط‌های باطل‌نشده (د۵ طرح ۴.۱)؛ فقط invoice_payments زیر select_for_update فاکتور آن را می‌نویسد
    paid_amount = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="پرداخت‌شده (ریال)")
    # بازتاب قسط آخر (فقط‌خواندنی)
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
            models.Index(fields=['counterparty', 'invoice_number_norm']),
        ]
        ordering = ['-invoice_date_shamsi', '-created_at']

    def __str__(self):
        return f"فاکتور {self.invoice_number} - {self.counterparty.name} ({self.amount:,.0f} ریال)"

    def save(self, *args, **kwargs):
        self.invoice_number_norm = normalize_invoice_number(self.invoice_number)
        update_fields = kwargs.get('update_fields')
        if update_fields is not None and 'invoice_number' in update_fields and 'invoice_number_norm' not in update_fields:
            kwargs['update_fields'] = [*update_fields, 'invoice_number_norm']
        super().save(*args, **kwargs)

    def head_amounts(self):
        """
        [(head, net)] برای سند: جمع ردیف‌های هر سرفصل منهای سهم تخفیف (د۱ طرح ۴.۱). سهم تخفیف به نسبت مبلغ است
        و باقی‌ماندهٔ گرد کردن به آخرین سرفصل می‌رود. ترتیب سرفصل‌ها = ترتیب نخستین ردیف هر سرفصل.
        """
        from ..accounting_reports import split_discount
        groups = {}
        for line in self.lines.all():
            key = line.expense_head_id
            if key not in groups:
                groups[key] = [line.expense_head, Decimal('0')]
            groups[key][1] += Decimal(str(line.line_amount or 0))
        items = list(groups.values())
        # پخش تخفیف با تابع مشترک گزارش هزینه (د۴ طرح ۴.۷) تا عدد سند و گزارش یکی بماند
        nets = split_discount([(idx, amt) for idx, (_head, amt) in enumerate(items)], self.discount_amount)
        return [(items[idx][0], net) for idx, net in nets]

    def to_journal_lines(self):
        """
        پیاده‌سازی پروتکل AccountingDocumentSource — فاز ۸ (تسک ۷۲ و ۷۳)، با ردیف‌های ۴.۱:
        بدهکار هر سرفصل (خالص از تخفیف)، بدهکار جدای مالیات بر ارزش افزوده، بستانکار طرف حساب به کل مبلغ.
        """
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
        desc = f"فاکتور هزینه {self.number or self.invoice_number} - {self.description or ''}".strip()
        lines = []
        for head, net in self.head_amounts():
            if not net:
                continue
            head_title = head.title if head is not None else 'بدون سرفصل'
            lines.append(JournalLine(
                account_code="6102",  # حساب معین هزینه عمومی/عملیاتی؛ سرفصل در تفصیلی
                side="debit",
                amount=net,
                cost_center_code=cost_center,
                detail_code=(f"EH-{head.code}" if head is not None else detail),
                description=f"{desc} - {head_title}",
            ))
        vat = Decimal(str(self.vat_amount or 0))
        if vat:
            lines.append(JournalLine(
                account_code="1301",  # مالیات بر ارزش افزودهٔ خرید (اعتبار مالیاتی)
                side="debit",
                amount=vat,
                cost_center_code=cost_center,
                detail_code=detail,
                description=f"{desc} - مالیات بر ارزش افزوده",
            ))
        lines.append(JournalLine(
            account_code="4101",  # حساب معین بستانکاران تجاری / طرف‌حساب‌ها
            side="credit",
            amount=amt,
            cost_center_code=cost_center,
            detail_code=detail,
            description=desc,
        ))
        return lines



def compute_line_amount(quantity, unit_price):
    """مبلغ ردیف = گرد شدهٔ (نیمه به بالا) تعداد × فی، به ریال."""
    from decimal import ROUND_HALF_UP
    q = Decimal(str(quantity or 0))
    p = Decimal(str(unit_price or 0))
    return (q * p).quantize(Decimal('1'), rounding=ROUND_HALF_UP)


class ExpenseInvoiceLine(models.Model):
    """
    ردیف فاکتور هزینه (د۱ طرح ۴.۱). جزء فاکتور است و با آن حذف می‌شود (فاکتور فقط در پیش‌نویس حذف می‌شود).
    `expense_head` در پایگاه داده اختیاری است (ردیف‌های کهنه) ولی سریالایزر آن را لازم می‌داند.
    `line_amount` را save() حساب می‌کند؛ bulk_create آن را حساب نمی‌کند.
    """
    invoice = models.ForeignKey(
        ExpenseInvoice,
        on_delete=models.CASCADE,
        related_name='lines',
        verbose_name="فاکتور"
    )
    position = models.PositiveIntegerField(default=1, verbose_name="ردیف")
    description = models.TextField(verbose_name="شرح ردیف")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1, verbose_name="تعداد / مقدار")
    unit = models.CharField(max_length=30, blank=True, default='', verbose_name="واحد")
    unit_price = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="فی (ریال)")
    line_amount = models.DecimalField(max_digits=15, decimal_places=0, default=0, verbose_name="مبلغ ردیف (ریال)")
    expense_head = models.ForeignKey(
        'personnel.ExpenseHead',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_lines',
        verbose_name="سرفصل هزینه (کدینگ)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ردیف فاکتور هزینه"
        verbose_name_plural = "ردیف‌های فاکتور هزینه"
        ordering = ['invoice', 'position', 'id']

    def __str__(self):
        return f"{self.invoice_id}/{self.position}: {self.line_amount:,.0f}"

    def save(self, *args, **kwargs):
        self.line_amount = compute_line_amount(self.quantity, self.unit_price)
        update_fields = kwargs.get('update_fields')
        if update_fields is not None and 'line_amount' not in update_fields and (
                'quantity' in update_fields or 'unit_price' in update_fields):
            kwargs['update_fields'] = [*update_fields, 'line_amount']
        super().save(*args, **kwargs)


class InvoicePayment(models.Model):
    """
    قسط پرداخت فاکتور هزینه (د۵ طرح ۴.۱). حذف نمی‌شود؛ اصلاح فقط با ابطال با دلیل (voided_*).
    فقط invoice_payments.add_payment / void_payment آن را می‌سازند و باطل می‌کنند.
    """
    METHOD_TRANSFER = 'transfer'
    METHOD_CHEQUE = 'cheque'
    METHOD_CASH = 'cash'
    METHOD_CHOICES = (
        (METHOD_TRANSFER, 'حواله'),
        (METHOD_CHEQUE, 'چک'),
        (METHOD_CASH, 'نقد'),
    )
    invoice = models.ForeignKey(
        ExpenseInvoice,
        on_delete=models.PROTECT,
        related_name='payments',
        verbose_name="فاکتور"
    )
    amount = models.DecimalField(max_digits=15, decimal_places=0, validators=[MinValueValidator(1)],
                                 verbose_name="مبلغ قسط (ریال)")
    payment_date_shamsi = models.CharField(max_length=10, verbose_name="تاریخ پرداخت (شمسی)")
    tracking_code = models.CharField(max_length=100, verbose_name="شماره پیگیری / شماره چک")
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default=METHOD_TRANSFER, verbose_name="روش پرداخت")
    company_bank_account = models.ForeignKey(
        'personnel.CompanyBankAccount',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_payments',
        verbose_name="حساب بانکی شرکت"
    )
    party_bank_account = models.ForeignKey(
        PartyBankAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_payments',
        verbose_name="حساب بانکی طرف حساب"
    )
    notes = models.TextField(blank=True, default='', verbose_name="توضیح")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_payments_created',
        verbose_name="ثبت‌کنندهٔ قسط"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    voided_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان ابطال")
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_payments_voided',
        verbose_name="باطل‌کننده"
    )
    void_reason = models.TextField(blank=True, default='', verbose_name="دلیل ابطال")

    class Meta:
        verbose_name = "قسط پرداخت فاکتور"
        verbose_name_plural = "قسط‌های پرداخت فاکتور"
        ordering = ['invoice', 'created_at', 'id']
        indexes = [models.Index(fields=['invoice', 'voided_at'])]

    def __str__(self):
        return f"{self.invoice_id}: {self.amount:,.0f} ({self.tracking_code})"

    @property
    def is_voided(self):
        return self.voided_at is not None


class PettyCashAccount(models.Model):
    """
    حساب / صندوق تنخواه‌گردان در سطح شرکت منتسب به کارمند (تنخواه‌دار) — ص۱ و ص۹ طرح ۳.۶.
    در هر شرکت برای هر نفر فقط یک حساب فعال. `section` فقط برای حساب‌های قدیمی پر است.
    """
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_accounts',
        verbose_name="شرکت"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='petty_cash_accounts',
        verbose_name="بخش پروژه (فقط حساب‌های قدیمی)"
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
    # د۲ طرح ۴.۲: موجودی اولیه با قاعدهٔ حساب بانکی ۳.۳
    opening_balance = models.DecimalField(
        max_digits=15, decimal_places=0, default=0, validators=[MinValueValidator(0)],
        verbose_name="موجودی اولیه (ریال)")
    opening_balance_date = models.CharField(max_length=10, null=True, blank=True,
                                            verbose_name="تاریخ موجودی اولیه (شمسی)")
    # د۶ و د۷: بستن و تحویل
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name="تاریخ بستن")
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='closed_petty_cash_accounts', verbose_name="بستهٔ‌شده به دست")
    handover_from = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True,
        related_name='handover_successors', verbose_name="تحویل‌گرفته از حساب")
    handover_to = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True,
        related_name='handover_predecessors', verbose_name="تحویل‌شده به حساب")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "حساب تنخواه‌گردان"
        verbose_name_plural = "حساب‌های تنخواه‌گردان"
        ordering = ['section', 'custodian']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'custodian'],
                condition=Q(is_active=True),
                name='uniq_active_petty_cash_per_company_custodian',
            ),
        ]

    def __str__(self):
        custodian_name = f"{self.custodian.first_name} {self.custodian.last_name}".strip() or self.custodian.username
        owner = self.section.name if self.section_id else (self.company.name if self.company_id else '-')
        return f"تنخواه {owner} - {custodian_name} (سقف: {self.ceiling_amount:,.0f} ریال)"

    def clean(self):
        super().clean()
        if not self.company_id and not self.section_id:
            raise ValidationError({'company': "شرکت حساب تنخواه مشخص نیست."})

    def save(self, *args, **kwargs):
        # سازگاری با مسیرهای قدیمی که فقط بخش می‌دهند: شرکت از بخش ← پروژه گرفته می‌شود
        if not self.company_id and self.section_id:
            self.company_id = self.section.project.company_id
        super().save(*args, **kwargs)

    @staticmethod
    def debt_expression():
        """
        بدهی تنخواه‌گردان (د۱ طرح ۴.۲) برای annotate: ردیف‌های ردشده + کسری تطبیق − تسویه‌های قطعی.
        هر جمع در زیرکوئری جدا تا join ها ضرب نشوند.
        """
        from django.db.models import OuterRef, Subquery
        from django.db.models.functions import Greatest
        money = models.DecimalField(max_digits=15, decimal_places=0)
        zero = Value(Decimal('0'), output_field=money)

        def _sum(qs, field):
            agg = qs.filter(account=OuterRef('pk')).order_by().values('account') \
                .annotate(s=Sum(field)).values('s')
            return Coalesce(Subquery(agg, output_field=money), zero, output_field=money)

        rejected = _sum(PettyCashTransaction.objects.filter(line_status='rejected'), 'amount')
        shortage = _sum(PettyCashReconciliation.objects.filter(difference__lt=0), 'difference')
        settled = _sum(PettyCashDebtSettlement.objects.filter(status='done'), 'amount')
        return Greatest(rejected - shortage - settled, zero, output_field=money)

    @classmethod
    def annotate_debt(cls, queryset):
        """queryset را با `debt_amount` (بدهی د۱) برمی‌گرداند؛ سریالایزر اول آن را می‌خواند."""
        return queryset.annotate(debt_amount=cls.debt_expression())

    def debt_breakdown(self):
        """اجزای بدهی (د۱): ردیف‌های ردشده، کسری تطبیق، تسویه‌های قطعی و بدهی باز (هرگز منفی نیست)."""
        zero = Decimal('0')
        if not self.pk:
            return {'rejected_total': zero, 'shortage_total': zero, 'settled_total': zero, 'debt': zero}
        rejected = self.transactions.filter(line_status='rejected').aggregate(s=Sum('amount'))['s'] or zero
        # difference = counted − expected؛ منفی یعنی کسری
        shortage = -(self.reconciliations.filter(difference__lt=0).aggregate(s=Sum('difference'))['s'] or zero)
        settled = self.debt_settlements.filter(status='done').aggregate(s=Sum('amount'))['s'] or zero
        return {'rejected_total': rejected, 'shortage_total': shortage, 'settled_total': settled,
                'debt': max(rejected + shortage - settled, zero)}

    @property
    def debt(self):
        """بدهی باز تنخواه‌گردان (د۱ طرح ۴.۲)."""
        annotated = getattr(self, 'debt_amount', None)
        if annotated is not None:
            return annotated
        return self.debt_breakdown()['debt']


class PettyCashStatement(models.Model):
    """
    صورت‌حساب تنخواه (ص۴ و ص۹ طرح ۳.۶): چند هزینهٔ ثبت‌شدهٔ یک حساب که با هم فرستاده می‌شوند.
    `status` وضعیت سند است؛ وضعیت گردش کار جداست (موتور ۲.۳).
    """
    STATUS_CHOICES = (
        ('draft', 'پیش‌نویس'),
        ('submitted', 'ارسال‌شده'),
        ('approved', 'تأییدشده'),
        ('paid', 'پرداخت‌شده'),
        ('returned', 'عودت‌شده'),
    )

    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        related_name='petty_cash_statements',
        verbose_name="شرکت"
    )
    account = models.ForeignKey(
        PettyCashAccount,
        on_delete=models.PROTECT,
        related_name='statements',
        verbose_name="حساب تنخواه"
    )
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='petty_cash_statements',
        verbose_name="تنخواه‌دار"
    )
    statement_date_shamsi = models.CharField(
        max_length=10,
        verbose_name="تاریخ صورت‌حساب (شمسی)"
    )
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=0,
        default=0,
        verbose_name="جمع مبلغ ردیف‌ها (ریال)"
    )
    approved_amount = models.DecimalField(
        max_digits=15,
        decimal_places=0,
        default=0,
        verbose_name="جمع مبلغ ردیف‌های تأییدشده (ریال)"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        verbose_name="وضعیت"
    )
    document_number = models.CharField(
        max_length=50,
        blank=True,
        default='',
        verbose_name="شماره سند"
    )
    # د۹ طرح ۴.۲: شمارهٔ ۲.۸ در اولین ارسال (مثل فاکتور)
    issued_number = models.ForeignKey(
        'numbering.IssuedNumber',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name="شمارهٔ صادرشده"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_petty_cash_statements',
        verbose_name="ثبت‌کننده"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "صورت‌حساب تنخواه"
        verbose_name_plural = "صورت‌حساب‌های تنخواه"
        ordering = ['-statement_date_shamsi', '-created_at']
        indexes = [
            models.Index(fields=['company', 'status']),
        ]

    def __str__(self):
        return f"صورت‌حساب تنخواه {self.pk} - {self.statement_date_shamsi} ({self.total_amount:,.0f} ریال)"


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
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='transactions',
        verbose_name="حساب تنخواه"
    )
    section = models.ForeignKey(
        'companies.ProjectSection',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_transactions',
        verbose_name="بخش پروژه (اختیاری)"
    )
    # پروژهٔ اختیاری برای گزارش (ص۱ طرح ۳.۶)
    project = models.ForeignKey(
        'companies.Project',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='petty_cash_transactions',
        verbose_name="پروژه (اختیاری)"
    )
    custodian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='petty_cash_transactions',
        verbose_name="تنخواه‌دار"
    )
    # ردیف صورت‌حساب تنخواه (ص۴ و ص۹ طرح ۳.۶)
    LINE_STATUS_CHOICES = (
        ('open', 'باز'),
        ('approved', 'تأییدشده'),
        ('rejected', 'ردشده'),
    )
    statement = models.ForeignKey(
        PettyCashStatement,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='lines',
        verbose_name="صورت‌حساب تنخواه"
    )
    line_status = models.CharField(
        max_length=10,
        choices=LINE_STATUS_CHOICES,
        default='open',
        verbose_name="وضعیت ردیف در صورت‌حساب"
    )
    line_reject_reason = models.TextField(
        blank=True,
        default='',
        verbose_name="دلیل رد ردیف"
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
    # د۳ طرح ۴.۲: منبع ساختاریافتهٔ شارژ (فقط allocation)؛ category از برچسب آن پر می‌شود
    SOURCE_CHOICES = (
        ('charge', 'شارژ تنخواه'),
        ('statement_refill', 'شارژ دوبارهٔ صورت‌حساب'),
        ('handover_in', 'تحویل از تنخواه‌گردان قبلی'),
    )
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        blank=True,
        default='',
        verbose_name="منبع شارژ"
    )
    source_statement = models.ForeignKey(
        'personnel.PettyCashStatement',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='refills',
        verbose_name="صورت‌حساب شارژ دوباره"
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

    @property
    def wf_company_id(self):
        """شرکت ردیف برای گردش سطح شرکت (company_field='wf_company'، ص۷ طرح ۳.۶): شرکت حساب، وگرنه شرکت بخش."""
        if self.account_id and self.account.company_id:
            return self.account.company_id
        if self.section_id:
            return self.section.project.company_id
        return None


class PettyCashDebtSettlement(models.Model):
    """تسویهٔ بدهی تنخواه‌گردان (د۴ طرح ۴.۲): نقدی، کسر از شارژ بعدی یا کسر از حقوق. حذف نمی‌شود؛ ابطال می‌شود."""
    METHOD_CHOICES = (
        ('cash', 'واریز نقدی'),
        ('charge_offset', 'کسر از شارژ'),
        ('payroll', 'کسر از حقوق'),
    )
    STATUS_CHOICES = (
        ('pending', 'در انتظار'),
        ('done', 'قطعی'),
        ('void', 'باطل'),
    )
    account = models.ForeignKey(PettyCashAccount, on_delete=models.PROTECT, related_name='debt_settlements',
                                verbose_name="حساب تنخواه")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name='petty_cash_debt_settlements',
                                verbose_name="شرکت")
    amount = models.DecimalField(max_digits=15, decimal_places=0, validators=[MinValueValidator(1)],
                                 verbose_name="مبلغ (ریال)")
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, verbose_name="روش تسویه")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending', verbose_name="وضعیت")
    reference = models.CharField(max_length=100, blank=True, default='', verbose_name="شمارهٔ پیگیری")
    charge = models.ForeignKey(PettyCashTransaction, on_delete=models.PROTECT, null=True, blank=True,
                               related_name='debt_offsets', verbose_name="شارژ (کسر از شارژ)")
    payroll_ref = models.CharField(max_length=100, blank=True, default='', verbose_name="مرجع حقوق")
    note = models.TextField(blank=True, default='', verbose_name="یادداشت")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='created_petty_debt_settlements', verbose_name="ثبت‌کننده")
    done_at = models.DateTimeField(null=True, blank=True, verbose_name="زمان قطعی شدن")
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name='voided_petty_debt_settlements', verbose_name="باطل‌کننده")
    void_reason = models.TextField(blank=True, default='', verbose_name="دلیل ابطال")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تسویهٔ بدهی تنخواه"
        verbose_name_plural = "تسویه‌های بدهی تنخواه"
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['account', 'status']), models.Index(fields=['company', 'method', 'status'])]

    def __str__(self):
        return f"تسویهٔ {self.get_method_display()} {self.amount:,.0f} ریال ({self.get_status_display()})"


class PettyCashReconciliation(models.Model):
    """
    تطبیق دورهٔ تنخواه (د۵ طرح ۴.۲). difference = counted_cash − expected_cash؛ منفی یعنی کسری (بدهی).
    حذف یا ویرایش نمی‌شود؛ اشتباه با تطبیق تازه درست می‌شود.
    """
    account = models.ForeignKey(PettyCashAccount, on_delete=models.PROTECT, related_name='reconciliations',
                                verbose_name="حساب تنخواه")
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name='petty_cash_reconciliations',
                                verbose_name="شرکت")
    period_end_date = models.CharField(max_length=10, verbose_name="پایان دوره (شمسی)")
    expected_cash = models.DecimalField(max_digits=15, decimal_places=0, verbose_name="نقد مورد انتظار (ریال)")
    counted_cash = models.DecimalField(max_digits=15, decimal_places=0, validators=[MinValueValidator(0)],
                                       verbose_name="نقد شمرده‌شده (ریال)")
    difference = models.DecimalField(max_digits=15, decimal_places=0, verbose_name="اختلاف (شمرده − انتظار)")
    note = models.TextField(blank=True, default='', verbose_name="یادداشت")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='created_petty_reconciliations', verbose_name="ثبت‌کننده")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تطبیق دورهٔ تنخواه"
        verbose_name_plural = "تطبیق‌های دورهٔ تنخواه"
        ordering = ['-period_end_date', '-created_at']
        indexes = [models.Index(fields=['account', 'period_end_date'])]

    def __str__(self):
        return f"تطبیق تنخواه {self.account_id} تا {self.period_end_date}"


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
