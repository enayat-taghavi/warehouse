"""
پرداخت چندمرحله‌ای فاکتور هزینه (د۵ طرح ۴.۱، زیرمرحلهٔ ۴.۱-ب).

- هر قسط در یک تراکنش: قفل نمونهٔ گردش و سپس ردیف فاکتور (همین ترتیب در قلاب `_invoice_state_change`)، پس دو
  قسط همزمان هرگز از مانده بیشتر نمی‌شوند.
- فقط کسی که الان می‌تواند روی کار باز `treasury_pay` اقدام کند (دریافت‌کننده یا جانشین؛ `wf_engine.can_act`)،
  ثبت‌کنندهٔ فاکتور فقط اگر خودش خزانه‌دار این مرحله باشد (creator_may_act).
- قسطی که مانده را صفر کند در همان تراکنش `wf_engine.act` را صدا می‌زند؛ گردش تمام و وضعیت «پرداخت‌شده» می‌شود.
- قسط حذف نمی‌شود؛ اصلاح فقط با ابطال با دلیل و فقط تا وقتی فاکتور کامل پرداخت نشده.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.audit_utils import log_audit_event
from common.date_utils import normalize_digits
from workflow import engine as wf_engine
from workflow.errors import TaskAlreadyDone, WorkflowError
from workflow.models import WorkflowInstance
from workflow.registry import ACT

from .fiscal import ensure_period_open, to_shamsi_str
from .workflows import INVOICE_ENTITY, INVOICE_WORKFLOW

PAY_STEP = 'treasury_pay'
PAYABLE_STATUSES = ('ready_to_pay', 'partially_paid')
PAYMENTS_EXIST_CODE = 'payments_exist'
PAYMENTS_EXIST_MESSAGE = ('برای این فاکتور قسط پرداخت ثبت شده است؛ عودت یا لغو ممکن نیست. '
                          'قسط اشتباه را با ثبت دلیل باطل کنید.')


def invoice_remaining(invoice) -> Decimal:
    return max(Decimal('0'), Decimal(str(invoice.amount or 0)) - Decimal(str(invoice.paid_amount or 0)))


def _company_id(invoice):
    return invoice.section.project.company_id


def _lock(invoice_id):
    """قفل نمونهٔ گردش (اگر هست) و سپس ردیف فاکتور؛ خروجی (فاکتور قفل‌شده، کار باز یا None)."""
    from .models import ExpenseInvoice
    wf = wf_engine.instance_of(INVOICE_WORKFLOW, invoice_id)
    if wf is not None:
        WorkflowInstance.objects.select_for_update().filter(pk=wf.pk).first()
    invoice = ExpenseInvoice.objects.select_for_update().get(pk=invoice_id)
    return invoice, wf_engine.open_task(INVOICE_WORKFLOW, invoice_id)


def _ensure_treasurer(user, invoice, task):
    # ثبت‌کننده‌ای که خزانه‌دار همین بخش است فاکتور خودش را پرداخت می‌کند (creator_may_act مرحلهٔ پرداخت)؛
    # ثبت‌کنندهٔ بی‌نقش خزانه‌دار را can_act رد می‌کند
    if task is None or task.step_key != PAY_STEP or invoice.status not in PAYABLE_STATUSES:
        raise WorkflowError('not_payable', 'فاکتور در مرحلهٔ پرداخت نیست یا کار پرداخت باز ندارد.', 409)
    if not wf_engine.can_act(user, task, ACT):
        raise WorkflowError('payment_not_allowed',
                            'فقط خزانه‌دار این فاکتور یا جانشین او می‌تواند قسط ثبت یا باطل کند.', 403)


def _recompute(invoice):
    """paid_amount از قسط‌های باطل‌نشده؛ payment_ref/paid_at/paid_by بازتاب قسط آخر."""
    active = invoice.payments.filter(voided_at__isnull=True)
    invoice.paid_amount = active.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    last = active.order_by('-created_at', '-pk').first()
    invoice.payment_ref = last.tracking_code if last else None
    invoice.paid_at = last.created_at if last else None
    invoice.paid_by_id = last.created_by_id if last else None


def _parse_amount(value):
    text = normalize_digits(str(value if value is not None else '')).replace(',', '').strip()
    try:
        amount = Decimal(text)
    except (InvalidOperation, ValueError):
        raise ValidationError({'amount': ['مبلغ قسط نامعتبر است.']})
    if amount != amount.to_integral_value() or amount <= 0:
        raise ValidationError({'amount': ['مبلغ قسط باید عددی صحیح و بزرگ‌تر از صفر (ریال) باشد.']})
    return amount


def _int_or_none(value, field):
    if value in (None, '', 'null'):
        return None
    text = normalize_digits(str(value)).strip()
    if not text.isdigit():
        raise ValidationError({field: ['شناسهٔ نامعتبر است.']})
    return int(text)


def _clean_payment(invoice, data, *, legacy=False):
    from .models import CompanyBankAccount, InvoicePayment, PartyBankAccount
    company_id = _company_id(invoice)
    out = {}
    tracking = str(data.get('tracking_code') or data.get('payment_ref') or '').strip()
    if not tracking:
        raise ValidationError({'tracking_code': ['درج شماره پیگیری یا شماره سند بانکی الزامی است.'],
                               'error': 'درج شماره پیگیری یا شماره سند بانکی الزامی است.'})
    out['tracking_code'] = tracking[:100]

    raw_date = data.get('payment_date_shamsi')
    if raw_date in (None, '') and legacy:
        raw_date = timezone.now()
    day = to_shamsi_str(raw_date)
    if not day:
        raise ValidationError({'payment_date_shamsi': ['تاریخ پرداخت (شمسی) نامعتبر یا خالی است.']})
    ensure_period_open(company_id, day, 'payment_date_shamsi')
    out['payment_date_shamsi'] = day

    method = str(data.get('method') or InvoicePayment.METHOD_TRANSFER).strip()
    if method not in dict(InvoicePayment.METHOD_CHOICES):
        raise ValidationError({'method': ['روش پرداخت نامعتبر است.']})
    out['method'] = method

    bank_id = _int_or_none(data.get('company_bank_account'), 'company_bank_account')
    if method == InvoicePayment.METHOD_CASH:
        if bank_id is not None:
            raise ValidationError({'company_bank_account': ['برای پرداخت نقدی حساب بانکی شرکت انتخاب نمی‌شود.']})
        out['company_bank_account'] = None
    else:
        bank = None
        if bank_id is not None:
            bank = CompanyBankAccount.objects.filter(pk=bank_id, company_id=company_id, is_active=True).first()
            if bank is None:
                raise ValidationError({'company_bank_account': ['حساب بانکی شرکت یافت نشد یا فعال نیست.']})
        elif legacy:
            # pay/ قدیمی حساب نمی‌فرستد: حساب اصلی فعال شرکت، وگرنه خالی (سازگاری تا ۴.۱-ج)
            bank = (CompanyBankAccount.objects.filter(company_id=company_id, is_active=True)
                    .order_by('-is_primary', '-created_at').first())
        else:
            raise ValidationError({'company_bank_account': ['برای حواله و چک، حساب بانکی شرکت را انتخاب کنید.']})
        out['company_bank_account'] = bank

    party_bank_id = _int_or_none(data.get('party_bank_account'), 'party_bank_account')
    party_bank = None
    if party_bank_id is not None:
        party_bank = PartyBankAccount.objects.filter(
            pk=party_bank_id, party_id=invoice.counterparty.party_id, is_active=True).first()
        if party_bank is None:
            raise ValidationError({'party_bank_account': ['حساب بانکی از حساب‌های فعال همین طرف‌حساب نیست.']})
    out['party_bank_account'] = party_bank
    out['notes'] = str(data.get('notes') or '').strip()[:2000]
    return out


def _check_revision(task, revision):
    if revision is not None and task is not None and int(revision) != task.revision:
        raise TaskAlreadyDone()


def _audit(action, payment, invoice, user, details=None):
    log_audit_event(
        module='treasury', action=action, target_model='InvoicePayment', target_object_id=payment.pk,
        target_repr=f'{invoice.number or invoice.invoice_number}: {payment.amount}', user=user,
        company_id=_company_id(invoice),
        after_state={'invoice_id': invoice.pk, 'amount': str(payment.amount), 'tracking_code': payment.tracking_code,
                     'method': payment.method, 'paid_amount': str(invoice.paid_amount)},
        details=details,
    )


def add_payment(user, invoice_id, data, *, revision=None, legacy=False):
    """
    ثبت یک قسط. legacy=True (اکشن قدیمی pay/) یعنی کل مانده در یک قسط. خروجی (قسط، فاکتور به‌روز).
    خطا: ValidationError (400) یا WorkflowError (403/409)؛ هر خطا کل تراکنش را برمی‌گرداند.
    """
    from .models import InvoicePayment
    from .workflow_engine import notify_document_changed
    with transaction.atomic():
        invoice, task = _lock(invoice_id)
        _ensure_treasurer(user, invoice, task)
        _check_revision(task, revision)
        ensure_period_open(_company_id(invoice), invoice.invoice_date_shamsi, 'invoice_date_shamsi')
        remaining = invoice_remaining(invoice)
        if legacy:
            amount = remaining
            if amount <= 0 and Decimal(str(invoice.amount or 0)) <= 0:
                # فاکتور با مبلغ صفر: قسطی ساخته نمی‌شود؛ همان قاعدهٔ قدیم (شمارهٔ پیگیری) گردش را می‌بندد
                fields = _clean_payment(invoice, data, legacy=True)
                invoice.payment_ref = fields['tracking_code']
                invoice.paid_at = timezone.now()
                invoice.paid_by = user
                invoice.save(update_fields=['payment_ref', 'paid_at', 'paid_by', 'updated_at'])
                wf_engine.act(user, task, reason=fields['notes'], revision=revision, obj=invoice)
                return None, invoice
            if amount <= 0:
                raise WorkflowError('nothing_to_pay', 'مانده‌ای برای پرداخت این فاکتور نیست.', 409)
        else:
            amount = _parse_amount(data.get('amount'))
        if amount > remaining:
            raise ValidationError({'amount': [f'مبلغ قسط از ماندهٔ فاکتور ({remaining:,.0f} ریال) بیشتر است.'],
                                   'code': 'amount_exceeds_remaining', 'remaining': str(remaining)})
        fields = _clean_payment(invoice, data, legacy=legacy)
        payment = InvoicePayment.objects.create(invoice=invoice, amount=amount, created_by=user, **fields)
        _recompute(invoice)
        invoice.save(update_fields=['paid_amount', 'payment_ref', 'paid_at', 'paid_by', 'updated_at'])
        _audit('invoice_payment_added', payment, invoice, user)
        if invoice_remaining(invoice) == 0:
            # مانده صفر: پایان گردش در همین تراکنش؛ قلاب وضعیت را «پرداخت‌شده» می‌کند و رویداد زنده می‌فرستد
            wf_engine.act(user, task, reason=fields['notes'], revision=revision, obj=invoice)
        else:
            if invoice.status != 'partially_paid':
                invoice.status = 'partially_paid'
                invoice.save(update_fields=['status', 'updated_at'])
            notify_document_changed(invoice, 'updated')
    return payment, invoice


def void_payment(user, invoice_id, payment_id, reason):
    """ابطال قسط با دلیل؛ فقط خزانه‌دار (یا جانشین) و فقط تا وقتی گردش باز و فاکتور کامل پرداخت نشده."""
    from .workflow_engine import notify_document_changed
    reason = str(reason or '').strip()
    if not reason:
        raise ValidationError({'reason': ['درج دلیل ابطال قسط الزامی است.'], 'error': 'درج دلیل ابطال قسط الزامی است.'})
    with transaction.atomic():
        invoice, task = _lock(invoice_id)
        payment = invoice.payments.select_for_update().filter(pk=payment_id).first()
        if payment is None:
            raise WorkflowError('payment_not_found', 'قسط یافت نشد.', 404)
        if payment.voided_at is not None:
            raise WorkflowError('payment_already_voided', 'این قسط پیش‌تر باطل شده است.', 409)
        if invoice.status == 'paid':
            raise WorkflowError('void_after_full_payment', 'فاکتور کامل پرداخت شده است؛ ابطال قسط ممکن نیست.', 409)
        _ensure_treasurer(user, invoice, task)
        ensure_period_open(_company_id(invoice), payment.payment_date_shamsi, 'payment_date_shamsi')
        payment.voided_at = timezone.now()
        payment.voided_by = user
        payment.void_reason = reason[:2000]
        payment.save(update_fields=['voided_at', 'voided_by', 'void_reason'])
        _recompute(invoice)
        invoice.status = 'partially_paid' if invoice.paid_amount > 0 else 'ready_to_pay'
        invoice.save(update_fields=['paid_amount', 'payment_ref', 'paid_at', 'paid_by', 'status', 'updated_at'])
        _audit('invoice_payment_voided', payment, invoice, user, details={'reason': payment.void_reason})
        notify_document_changed(invoice, 'updated')
    return payment, invoice
