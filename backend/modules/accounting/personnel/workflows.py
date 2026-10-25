"""
گردش‌های کار حسابداری روی موتور هسته (ت۱۷ و ت۲ طرح ۲.۳).

ماژول فقط گردش را اعلام می‌کند؛ موتور هسته مرحله، دریافت‌کننده و سابقه را نگه می‌دارد و با هر تغییر مرحله
on_state_change را صدا می‌زند تا وضعیت خود سند (ExpenseInvoice.status) به‌روز بماند. پس فهرست‌ها، فیلترها،
خروجی اکسل و برچسب‌های فرانت عوض نمی‌شوند.
"""
from workflow.registry import (APPROVE, CANCELLED, COMPLETED, EXECUTE, REJECTED, RETURN, ACT, RETURNED, REVIEW,
                               StepSpec, WorkflowSpec)

INVOICE_WORKFLOW = 'expense_invoice'
INVOICE_ENTITY = 'expense_invoice'

# مرحلهٔ موتور → وضعیت فاکتور
INVOICE_STEP_STATUS = {
    'supervisor_ok': 'pending_supervisor',
    'accountant_review': 'pending_accountant',
    'manager_ok': 'pending_manager',
    'treasury_pay': 'ready_to_pay',
    COMPLETED: 'paid',
    RETURNED: 'revision_required',
    REJECTED: 'rejected',
    CANCELLED: 'draft',
}


def _invoice_state_change(invoice, state, instance):
    if state == COMPLETED and not (invoice.payment_ref or '').strip():
        # پرداخت فقط با شمارهٔ پیگیری (اکشن pay فاکتور)؛ اقدام عمومی «کارهای من» روی این مرحله برگشت می‌خورد
        from workflow.errors import WorkflowError
        raise WorkflowError('payment_ref_required', 'پرداخت فاکتور فقط با ثبت شمارهٔ پیگیری از صفحهٔ فاکتور انجام می‌شود', 400)
    status = INVOICE_STEP_STATUS.get(state)
    if status and invoice.status != status:
        invoice.status = status
        invoice.save(update_fields=['status', 'updated_at'])
        from .workflow_engine import notify_document_changed
        notify_document_changed(invoice)


def _invoice_summary(invoice):
    counterparty = getattr(invoice, 'counterparty', None)
    return {
        'title': f'فاکتور {invoice.invoice_number}' + (f' — {counterparty.name}' if counterparty else ''),
        'amount': invoice.amount,
        'category': invoice.category,
        'date_shamsi': invoice.invoice_date_shamsi,
    }


def resolve_invoice(entity_id):
    from .models import ExpenseInvoice
    return (ExpenseInvoice.objects.select_related('section', 'section__project', 'counterparty')
            .filter(pk=entity_id).first())


INVOICE_WORKFLOW_SPEC = WorkflowSpec(
    key=INVOICE_WORKFLOW,
    version=1,
    entity_kind=INVOICE_ENTITY,
    title_fa='فاکتور هزینه',
    steps=(
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', 'can_act_as_workshop_supervisor', APPROVE),
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', 'can_act_as_accountant', REVIEW),
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', 'perm_manager_payment_authorize', APPROVE),
        # پرداخت فقط از اکشن pay فاکتور (شمارهٔ پیگیری لازم است)؛ رد قطعی در این مرحله نیست
        StepSpec('treasury_pay', 'پرداخت خزانه‌دار', 'treasury', 'perm_treasury_disburse_action', EXECUTE,
                 actions=(ACT, RETURN)),
    ),
    on_state_change=_invoice_state_change,
    summary=_invoice_summary,
    route='/app/finance/employee-invoices?invoice={id}',
    amount_field='amount',
    view_permission='perm_invoice_record',
)


# ─── قلاب‌های دیدن، پیوست و قفل فاکتور (ص۱، ص۴ و ص۵ طرح ۲.۶) ─────────────────────────────────────
# همان دامنهٔ ExpenseInvoiceViewSet.get_queryset: دسترسی به شرکت + «ثبت و دیدن فاکتور» در بخش فاکتور.
# بیرون از این دامنه None (بی‌نظر) تا قاعدهٔ گردش کار (دریافت‌کنندهٔ مرحله و…) دست نخورد.
INVOICE_PERM = 'perm_invoice_record'
INVOICE_EDITABLE_STATUSES = ('draft', 'revision_required')
INVOICE_LOCKED_STATUSES = ('paid',)


def invoice_company_id(entity_id):
    from .models import ExpenseInvoice
    return (ExpenseInvoice.objects.filter(pk=entity_id)
            .values_list('section__project__company_id', flat=True).first())


def _invoice_company_allowed(user, invoice) -> bool:
    from companies.access import get_user_allowed_companies
    company_id = invoice_company_id(invoice.pk)
    return company_id is not None and get_user_allowed_companies(user).filter(id=company_id).exists()


def _invoice_in_scope(user, invoice) -> bool:
    from accounts.scoped_permissions import can
    return _invoice_company_allowed(user, invoice) and can(user, INVOICE_PERM, invoice.section)


def can_view_invoice(user, entity_id):
    invoice = resolve_invoice(entity_id)
    if invoice is None:
        return None
    return True if _invoice_in_scope(user, invoice) else None


def can_attach_invoice(user, entity_id):
    invoice = resolve_invoice(entity_id)
    if invoice is None:
        return None
    if (invoice.created_by_id == user.pk and invoice.status in INVOICE_EDITABLE_STATUSES
            and _invoice_company_allowed(user, invoice)):
        return True
    return True if _invoice_in_scope(user, invoice) else None


def is_invoice_locked(entity_id):
    from .models import ExpenseInvoice
    status = ExpenseInvoice.objects.filter(pk=entity_id).values_list('status', flat=True).first()
    return status in INVOICE_LOCKED_STATUSES
