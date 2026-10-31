"""
خلاصهٔ زندهٔ فاکتور برای صفحهٔ عمومی صحت‌سنجی QR (O3 طرح شبانه) با قلاب `verify_summary:expense_invoice`.

صفحه بی‌ورود است و فقط با توکن امضاشدهٔ چاپ می‌رسد؛ پس فقط شماره، تاریخ، مبلغ قابل پرداخت و برچسب وضعیت
بیرون می‌رود (نه طرف حساب، نه ردیف‌ها، نه دادهٔ بانکی، نه نام اشخاص).
"""


def invoice_verify_summary(entity_id):
    from .models import ExpenseInvoice
    invoice = (ExpenseInvoice.objects
               .filter(pk=entity_id)
               .only('id', 'number', 'invoice_number', 'invoice_date_shamsi', 'amount', 'status',
                     'section__project__company_id')
               .select_related('section__project')
               .first())
    if invoice is None:
        return {'exists': False}
    return {
        'exists': True,
        'company_id': invoice.section.project.company_id,
        'number': invoice.number or invoice.invoice_number or '',
        'date': invoice.invoice_date_shamsi or '',
        'amount': str(invoice.amount if invoice.amount is not None else ''),
        'status': invoice.get_status_display(),
    }
