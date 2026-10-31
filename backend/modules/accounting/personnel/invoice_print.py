"""
چاپ / PDF فاکتور هزینه (د۷ طرح ۴.۱) با قلاب `printable:expense_invoice` (الگوی ۲.۷).

API هسته (`/api/print/expense_invoice/<id>/pdf/`) پیش از این قلاب `can_view` را می‌سنجد (همان دامنهٔ فاکتور یا کار
باز گردش)؛ نادیدنی = 404. دادهٔ بانکی در چاپ نمی‌آید.
"""
from decimal import Decimal

from .workflows import INVOICE_WORKFLOW, INVOICE_WORKFLOW_SPEC


def _money(value) -> str:
    from reports.document_pdf import fa_digits
    text = f'{Decimal(str(value or 0)):,.0f}'.replace(',', '٬')
    return fa_digits(text) + ' ریال'


def _qty(value) -> str:
    from reports.document_pdf import fa_digits
    if value is None:
        return ''
    text = format(Decimal(str(value)).normalize(), 'f')
    return fa_digits(text)


def _name(user):
    if user is None:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


def _signers(invoice):
    """ثبت‌کننده (ارسال) و اقدام‌کنندگان هر مرحله از سابقهٔ گردش همین فاکتور؛ بی گردش فقط ثبت‌کننده."""
    from reports.document_pdf import Signer
    from workflow import engine as wf_engine
    from workflow.models import WorkflowStep
    signers = []
    instance = wf_engine.instance_of(INVOICE_WORKFLOW, invoice.pk)
    if instance is None:
        if invoice.created_by is not None:
            signers.append(Signer(name=_name(invoice.created_by), role='ثبت‌کننده', user_id=invoice.created_by_id))
        return signers
    titles = {step.key: step.title_fa for step in INVOICE_WORKFLOW_SPEC.steps}
    rows = (WorkflowStep.objects.filter(instance=instance, action__in=(WorkflowStep.SUBMIT, WorkflowStep.ACT))
            .select_related('actor').order_by('at', 'pk'))
    latest = {}
    for row in rows:
        key = 'submit' if row.action == WorkflowStep.SUBMIT else row.from_step
        latest[key] = row  # آخرین اقدام هر مرحله (پس از عودت و ارسال دوباره)
    order = ['submit'] + [step.key for step in INVOICE_WORKFLOW_SPEC.steps]
    for key in order:
        row = latest.get(key)
        if row is None or row.actor is None:
            continue
        role = 'ثبت‌کننده' if key == 'submit' else titles.get(key, key)
        signers.append(Signer(name=_name(row.actor), role=role, user_id=row.actor_id, signed=True))
    return signers


def printable_invoice(user, entity_id):
    from reports.document_pdf import DocTable, PrintableDocument, fa_digits
    from .invoice_payments import invoice_remaining
    from .models import ExpenseInvoice
    invoice = (ExpenseInvoice.objects
               .select_related('section__project', 'counterparty__party', 'created_by')
               .prefetch_related('lines__expense_head', 'payments')
               .filter(pk=entity_id).first())
    if invoice is None:
        return None

    info_pairs = [
        ('شمارهٔ داخلی', fa_digits(invoice.number) if invoice.number else '—'),
        ('شمارهٔ فاکتور فروشنده', fa_digits(invoice.invoice_number) if invoice.invoice_number else '—'),
        ('تاریخ فاکتور', fa_digits(invoice.invoice_date_shamsi)),
        ('طرف حساب', invoice.counterparty.name if invoice.counterparty_id else '—'),
        ('پروژه / بخش', f'{invoice.section.project.name} / {invoice.section.name}'),
        ('وضعیت', invoice.get_status_display()),
    ]

    paragraphs = [f'شرح: {invoice.description}'] if invoice.description else []

    lines = list(invoice.lines.all())
    rows = [[
        fa_digits(idx), line.description or '', line.expense_head.title if line.expense_head else '',
        _qty(line.quantity), line.unit or '', _money(line.unit_price), _money(line.line_amount),
    ] for idx, line in enumerate(lines, start=1)]

    totals = [('جمع ردیف‌ها', _money(invoice.subtotal))]
    if Decimal(str(invoice.discount_amount or 0)) != 0:
        totals.append(('تخفیف', _money(invoice.discount_amount)))
    if Decimal(str(invoice.vat_amount or 0)) != 0:
        totals.append(('مالیات بر ارزش افزوده', _money(invoice.vat_amount)))
    totals.append(('مبلغ قابل پرداخت', _money(invoice.amount), True))
    totals.append(('پرداخت‌شده', _money(invoice.paid_amount)))
    totals.append(('مانده', _money(invoice_remaining(invoice)), True))

    extra_tables = []
    payments = sorted((p for p in invoice.payments.all() if p.voided_at is None), key=lambda p: (p.created_at, p.pk))
    if payments:
        payment_rows = [
            [fa_digits(idx), fa_digits(p.payment_date_shamsi), _money(p.amount), p.get_method_display(), fa_digits(p.tracking_code or '')]
            for idx, p in enumerate(payments, start=1)
        ]
        extra_tables.append(DocTable(
            title='قسط‌های پرداخت',
            headers=['ردیف', 'تاریخ', 'مبلغ', 'روش', 'شمارهٔ پیگیری'],
            rows=payment_rows,
            col_widths=[0.6, 1.4, 2, 1.6, 2],
            center_cols=[0, 1],
        ))

    return PrintableDocument(
        company_id=invoice.section.project.company_id,
        title='فاکتور هزینه',
        number=invoice.number or invoice.invoice_number,
        date=invoice.invoice_date_shamsi,
        attachments_count=1 if invoice.attachment else 0,
        paragraphs=paragraphs,
        table_headers=['ردیف', 'شرح', 'سرفصل هزینه', 'تعداد', 'واحد', 'فی', 'مبلغ'],
        table_rows=rows,
        signers=_signers(invoice),
        info_pairs=info_pairs,
        totals=totals,
        extra_tables=extra_tables,
        table_col_widths=[0.6, 3.2, 1.7, 0.8, 0.9, 1.6, 1.8],
        table_center_cols=[0, 3, 4],
    )
