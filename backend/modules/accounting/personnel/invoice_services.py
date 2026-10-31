"""
بدنهٔ فاکتور هزینه در سرور (زیرمرحلهٔ ۴.۱-الف): جمع‌ها و مالیات، فاکتور تکراری و شمارهٔ داخلی.

- د۱/د۲: جمع ردیف‌ها، تخفیف و مالیات را فقط سرور حساب می‌کند؛ نرخ از تنظیم شرکت `accounting.vat_rate`.
- د۳: تکراری = همان شرکت + همان طرف حساب + همان شمارهٔ یکسان‌شدهٔ فروشنده، بیرون از «رد قطعی». فقط هشدار است.
- د۴: سری `accounting.expense_invoice`؛ شماره در اولین ارسال، ابطال در حذف پیش‌نویس شماره‌دار.
"""
from decimal import Decimal, ROUND_HALF_UP

from numbering.registry import NumberSeriesSpec
from settings_core.company_settings import CompanySettingSpec

from .fiscal import fiscal_period_key

INVOICE_SERIES_KEY = 'accounting.expense_invoice'
INVOICE_NUMBER_ENTITY = 'expense_invoice'
VAT_SETTING_MODULE = 'accounting'
VAT_SETTING_KEY = 'vat_rate'
VAT_DEFAULT_RATE = 10
MIN_LINES = 1
MAX_LINES = 100
DUPLICATE_EXCLUDED_STATUSES = ('rejected',)
VOID_REASON_DELETE = 'حذف فاکتور'

VAT_RATE_SETTING = CompanySettingSpec(
    module=VAT_SETTING_MODULE, key=VAT_SETTING_KEY, default=VAT_DEFAULT_RATE, type='float',
    title_fa='نرخ مالیات بر ارزش افزوده (درصد)', perm='perm_manager_payment_authorize',
)

INVOICE_NUMBER_SERIES = NumberSeriesSpec(
    key=INVOICE_SERIES_KEY, title_fa='فاکتور هزینه', default_template='{period}/ف/{seq}',
    period_key=fiscal_period_key, manage_perm='',
)


def round_rial(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)


def company_vat_rate(company_id) -> Decimal:
    """نرخ فعلی شرکت (درصد)؛ مقدار نامعتبر یا بیرون از ۰ تا ۱۰۰ = پیش‌فرض."""
    from settings_core.company_settings import get_company_setting
    raw = get_company_setting(company_id, VAT_SETTING_MODULE, VAT_SETTING_KEY) if company_id else None
    try:
        rate = Decimal(str(raw if raw is not None else VAT_DEFAULT_RATE))
    except Exception:
        rate = Decimal(VAT_DEFAULT_RATE)
    if rate < 0 or rate > 100:
        rate = Decimal(VAT_DEFAULT_RATE)
    return rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def suggested_vat(rate, base) -> Decimal:
    return round_rial(Decimal(str(rate)) * Decimal(str(base)) / Decimal('100'))


def duplicate_queryset(company_id, counterparty_id, invoice_number_norm, exclude_id=None):
    """همهٔ فاکتورهای هم‌شمارهٔ همان طرف حساب در همان شرکت (بی‌توجه به دامنهٔ دیدن کاربر)."""
    from .models import ExpenseInvoice
    if not company_id or not counterparty_id or not invoice_number_norm:
        return ExpenseInvoice.objects.none()
    qs = (ExpenseInvoice.objects
          .filter(section__project__company_id=company_id, counterparty_id=counterparty_id,
                  invoice_number_norm=invoice_number_norm)
          .exclude(status__in=DUPLICATE_EXCLUDED_STATUSES))
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs


def invoice_duplicates(invoice):
    company_id = getattr(getattr(invoice.section, 'project', None), 'company_id', None)
    return duplicate_queryset(company_id, invoice.counterparty_id, invoice.invoice_number_norm, invoice.pk)


def refresh_duplicate_flag(invoice):
    """پرچم possible_duplicate همین فاکتور (و هم‌شماره‌های آن) پس از ثبت یا ویرایش؛ هرگز خطا نمی‌دهد."""
    from .models import ExpenseInvoice
    matches = invoice_duplicates(invoice)
    flag = matches.exists() and invoice.status not in DUPLICATE_EXCLUDED_STATUSES
    if flag:
        matches.filter(possible_duplicate=False).update(possible_duplicate=True)
    if invoice.possible_duplicate != flag:
        invoice.possible_duplicate = flag
        ExpenseInvoice.objects.filter(pk=invoice.pk).update(possible_duplicate=flag)
    return flag


def ensure_invoice_number(invoice, user):
    """شمارهٔ داخلی در اولین ارسال (داخل تراکنش ارسال)؛ شمارهٔ موجود هرگز عوض نمی‌شود."""
    if invoice.issued_number_id:
        return invoice.issued_number
    from numbering.services import allocate
    company_id = invoice.section.project.company_id
    issued = allocate(company_id, INVOICE_SERIES_KEY, INVOICE_NUMBER_ENTITY, invoice.pk, user=user)
    invoice.issued_number = issued
    invoice.number = issued.display
    invoice.save(update_fields=['issued_number', 'number', 'updated_at'])
    return issued


def void_invoice_number(invoice, user):
    """حذف پیش‌نویس شماره‌دار: شماره با دلیل «حذف فاکتور» باطل می‌شود (ردیف شماره هرگز پاک نمی‌شود)."""
    if not invoice.issued_number_id:
        return
    from numbering.models import IssuedNumber
    from numbering.services import void
    issued = IssuedNumber.objects.filter(pk=invoice.issued_number_id).first()
    if issued is not None and issued.status != IssuedNumber.STATUS_VOID:
        void(issued, VOID_REASON_DELETE, user=user)


SHEBA_REQUIRED_CODE = 'counterparty_sheba_required'
SHEBA_REQUIRED_MESSAGE = 'طرف‌حساب این فاکتور شبای معتبر ندارد؛ پیش از ارسال، شمارهٔ شبای درست را برای او ثبت کنید.'


def counterparty_has_valid_sheba(counterparty) -> bool:
    """ارسال فاکتور به گردش: طرف‌حساب دست‌کم یک حساب فعال با شبای معتبر (رقم کنترل درست) دارد."""
    from .models import PartyBankAccount
    from .sheba_utils import validate_sheba
    if counterparty is None or not getattr(counterparty, 'party_id', None):
        return False
    shebas = PartyBankAccount.objects.filter(party_id=counterparty.party_id, is_active=True).values_list(
        'sheba_number', flat=True)
    return any(validate_sheba(s)[0] for s in shebas)
