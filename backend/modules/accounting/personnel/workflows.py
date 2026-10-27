"""
گردش‌های کار حسابداری روی موتور هسته (ت۱۷ و ت۲ طرح ۲.۳).

ماژول فقط گردش را اعلام می‌کند؛ موتور هسته مرحله، دریافت‌کننده و سابقه را نگه می‌دارد و با هر تغییر مرحله
on_state_change را صدا می‌زند تا وضعیت خود سند (ExpenseInvoice.status) به‌روز بماند. پس فهرست‌ها، فیلترها،
خروجی اکسل و برچسب‌های فرانت عوض نمی‌شوند.
"""
from decimal import Decimal

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


def _locked_paid_amount(invoice):
    """paid_amount تازه از پایگاه داده زیر قفل ردیف فاکتور (موتور پیش از این نمونهٔ گردش را قفل کرده است)."""
    from .models import ExpenseInvoice
    value = (ExpenseInvoice.objects.select_for_update().filter(pk=invoice.pk)
             .values_list('paid_amount', flat=True).first())
    return Decimal(str(value or 0))


def _invoice_state_change(invoice, state, instance):
    from workflow.errors import WorkflowError
    if state == COMPLETED:
        # د۵ طرح ۴.۱: پایان گردش فقط وقتی جمع قسط‌ها برابر مبلغ است (اکشن قسط یا pay/)؛ اقدام عمومی «کارهای من»
        # بی قسط برگشت می‌خورد. فاکتور با مبلغ صفر همان قاعدهٔ قدیم (شمارهٔ پیگیری) را دارد.
        amount = Decimal(str(invoice.amount or 0))
        paid = _locked_paid_amount(invoice)
        if (amount > 0 and paid != amount) or (amount <= 0 and not (invoice.payment_ref or '').strip()):
            raise WorkflowError('payment_required',
                                'پرداخت فاکتور فقط با ثبت قسط‌ها از صفحهٔ فاکتور و تا صفر شدن مانده انجام می‌شود', 400)
    elif state in (RETURNED, CANCELLED, REJECTED) and _locked_paid_amount(invoice) > 0:
        # بعد از اولین قسط باطل‌نشده، عودت، لغو و رد بسته است (اصلاح فقط با ابطال قسط)
        from .invoice_payments import PAYMENTS_EXIST_CODE, PAYMENTS_EXIST_MESSAGE
        raise WorkflowError(PAYMENTS_EXIST_CODE, PAYMENTS_EXIST_MESSAGE, 409)
    status = INVOICE_STEP_STATUS.get(state)
    if status == 'ready_to_pay' and Decimal(str(invoice.paid_amount or 0)) > 0:
        status = 'partially_paid'
    if status and invoice.status != status:
        invoice.status = status
        invoice.save(update_fields=['status', 'updated_at'])
        from .workflow_engine import notify_document_changed
        notify_document_changed(invoice)


def invoice_heads_summary(invoice):
    """عنوان سرفصل ردیف اول و «و n سرفصل دیگر» (د۱ طرح ۴.۱)؛ بی سرفصل، شرح ردیف اول."""
    heads = []
    first_description = ''
    for line in invoice.lines.all():
        if not first_description:
            first_description = line.description or ''
        if line.expense_head_id and line.expense_head_id not in [h.pk for h in heads]:
            heads.append(line.expense_head)
    if not heads:
        return first_description[:100]
    text = heads[0].title
    if len(heads) > 1:
        text += f' و {len(heads) - 1} سرفصل دیگر'
    return text


def _invoice_summary(invoice):
    counterparty = getattr(invoice, 'counterparty', None)
    return {
        'title': f'فاکتور {invoice.invoice_number}' + (f' — {counterparty.name}' if counterparty else ''),
        'amount': invoice.amount,
        'category': invoice_heads_summary(invoice),
        'date_shamsi': invoice.invoice_date_shamsi,
    }


def resolve_invoice(entity_id):
    from .models import ExpenseInvoice
    return (ExpenseInvoice.objects.select_related('section', 'section__project', 'counterparty__party')
            .filter(pk=entity_id).first())


INVOICE_WORKFLOW_SPEC = WorkflowSpec(
    key=INVOICE_WORKFLOW,
    version=1,
    entity_kind=INVOICE_ENTITY,
    title_fa='فاکتور هزینه',
    steps=(
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', 'perm_invoice_approve', APPROVE),
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', 'perm_invoice_review', REVIEW),
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
    """پرداخت‌شده، یا با تاریخی در دورهٔ مالی بستهٔ شرکت بخش (طرح ۳.۲، ص۵)."""
    from .fiscal import closed_period_for
    from .models import ExpenseInvoice
    row = (ExpenseInvoice.objects.filter(pk=entity_id)
           .values_list('status', 'invoice_date_shamsi', 'section__project__company_id').first())
    if row is None:
        return False
    status, invoice_date, company_id = row
    return status in INVOICE_LOCKED_STATUSES or closed_period_for(company_id, invoice_date) is not None


# ─── تنخواه سطح شرکت روی موتور (ص۲ تا ص۴ و ص۱۱ طرح ۳.۶) ───────────────────────────────────────────
PETTY_CHARGE_WORKFLOW = 'petty_cash_charge'
PETTY_CHARGE_ENTITY = 'petty_cash_charge'
PETTY_STATEMENT_WORKFLOW = 'petty_cash_statement'
PETTY_STATEMENT_ENTITY = 'petty_cash_statement'
PETTY_CASH_PERM = 'perm_petty_cash_manage'
PETTY_REVIEW_PERM = 'perm_invoice_review'
PETTY_MANAGER_PERM = 'perm_manager_payment_authorize'
PETTY_TREASURY_PERM = 'perm_treasury_disburse_action'
# دیدن تنخواه دیگران در سطح شرکت: مدیریت تنخواه یا یکی از مجوزهای مرحله‌های گردش
PETTY_COMPANY_VIEW_PERMS = (PETTY_CASH_PERM, PETTY_REVIEW_PERM, PETTY_MANAGER_PERM, PETTY_TREASURY_PERM)
PETTY_EDITABLE_STATUSES = ('draft',)
PETTY_STATEMENT_LOCKED_STATUSES = ('paid',)
PETTY_STATEMENT_LINE_REJECT_STEPS = ('accountant_review', 'manager_ok')


def petty_fund_level_breakdown(account):
    """
    اجزای سطح تنخواه (د۱ طرح ۴.۲): موجودی اولیه + شارژهای دریافتی (خالص از کسر بدهی) − هزینه‌های تأییدشده
    − ردیف‌های ردشده − عودت‌های تأییدشده.
    """
    from decimal import Decimal
    from django.db.models import Sum
    from .models import PettyCashDebtSettlement, PettyCashTransaction
    zero = Decimal('0')
    keys = ('opening_balance', 'received_total', 'offset_total', 'spent_total', 'rejected_total', 'refund_total',
            'fund_level')
    if account is None or not account.pk:
        return dict.fromkeys(keys, zero)
    rows = PettyCashTransaction.objects.filter(account=account)

    def _total(qs, field='amount'):
        return qs.aggregate(s=Sum(field))['s'] or zero

    received = _total(rows.filter(transaction_type='allocation', status__in=['approved', 'paid']))
    # کسر بدهی فقط وقتی قطعی است که شارژ واریز شده باشد (د۴)
    offsets = _total(PettyCashDebtSettlement.objects.filter(
        account=account, method='charge_offset', status='done', charge__status__in=['approved', 'paid']))
    spent = _total(rows.filter(transaction_type='expense', status='approved').exclude(line_status='rejected'))
    rejected = _total(rows.filter(line_status='rejected'))
    refunds = _total(rows.filter(transaction_type='refund', status='approved'))
    opening = account.opening_balance or zero
    return {'opening_balance': opening, 'received_total': received, 'offset_total': offsets, 'spent_total': spent,
            'rejected_total': rejected, 'refund_total': refunds,
            'fund_level': opening + received - offsets - spent - rejected - refunds}


def petty_fund_level(account):
    """سطح تنخواه حساب (د۱ طرح ۴.۲) = نقد در دست تنخواه‌گردان + هزینه‌های در جریان."""
    return petty_fund_level_breakdown(account)['fund_level']


def petty_charge_offset_total(tx):
    """جمع کسر بدهی ثبت‌شده روی یک شارژ (در انتظار یا قطعی؛ باطل نه)."""
    from decimal import Decimal
    from django.db.models import Sum
    from .models import PettyCashDebtSettlement
    if tx is None or not tx.pk:
        return Decimal('0')
    return PettyCashDebtSettlement.objects.filter(
        charge=tx, method='charge_offset', status__in=['pending', 'done']).aggregate(s=Sum('amount'))['s'] \
        or Decimal('0')


def petty_charge_exceeds_ceiling(tx):
    """سطح تنخواه + شارژهای در جریان دیگر + خالص این شارژ از سقف بیشتر است؟ سقف تعیین‌نشده (۰) = بله."""
    account = getattr(tx, 'account', None)
    if account is None or not account.ceiling_amount:
        return True
    net = tx.amount - petty_charge_offset_total(tx)
    return petty_fund_level(account) + _charges_in_flight(account, tx) + net > account.ceiling_amount


def _charge_needs_manager(tx):
    """ص۳: مدیر فقط وقتی لازم است که سطح تنخواه پس از شارژ از سقف حساب بیشتر شود. سقف تعیین‌نشده (۰) = مدیر لازم."""
    return petty_charge_exceeds_ceiling(tx)


def _charges_in_flight(account, tx):
    """Charges of the same account still running in the workflow (not yet paid) count toward the ceiling."""
    from decimal import Decimal
    from django.db.models import Sum
    from workflow.models import WorkflowInstance
    from .models import PettyCashTransaction
    running = WorkflowInstance.objects.filter(
        workflow_key=PETTY_CHARGE_WORKFLOW, status=WorkflowInstance.IN_PROGRESS).values('entity_id')
    rows = PettyCashTransaction.objects.filter(account=account, transaction_type='allocation', pk__in=running) \
        .exclude(status__in=['approved', 'paid']).exclude(pk=tx.pk)
    return rows.aggregate(s=Sum('amount'))['s'] or Decimal('0')


def _tracking_required():
    from workflow.errors import WorkflowError
    raise WorkflowError('payment_ref_required', 'واریز خزانه‌دار فقط با ثبت شمارهٔ پیگیری از صفحهٔ تنخواه انجام می‌شود', 400)


def _charge_state_change(tx, state, instance):
    if state == COMPLETED:
        if not (tx.receipt_number or '').strip():
            _tracking_required()
        new_status = 'approved'
    elif state == REJECTED:
        new_status = 'rejected'
    elif state in (RETURNED, CANCELLED):
        new_status = 'draft'
    else:
        # در جریان گردش وضعیت سند «پیش‌نویس» می‌ماند (pending_* فقط برای اسناد قدیمی است، ص۱۰)
        return
    if tx.status != new_status:
        tx.status = new_status
        tx.save(update_fields=['status', 'updated_at'])
        from .workflow_engine import notify_document_changed
        notify_document_changed(tx)


def _person_name(user):
    if user is None:
        return ''
    return f'{user.first_name} {user.last_name}'.strip() or user.username


def _charge_summary(tx):
    return {'title': f'شارژ تنخواه — {_person_name(getattr(tx, "custodian", None))}', 'amount': tx.amount,
            'category': tx.category, 'date_shamsi': tx.transaction_date_shamsi}


def resolve_petty_tx(entity_id):
    from .models import PettyCashTransaction
    return (PettyCashTransaction.objects.select_related('account', 'section', 'section__project', 'custodian')
            .filter(pk=entity_id).first())


PETTY_CHARGE_WORKFLOW_SPEC = WorkflowSpec(
    key=PETTY_CHARGE_WORKFLOW,
    version=1,
    entity_kind=PETTY_CHARGE_ENTITY,
    title_fa='شارژ تنخواه',
    steps=(
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', PETTY_REVIEW_PERM, REVIEW),
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', PETTY_MANAGER_PERM, APPROVE, required=_charge_needs_manager),
        # واریز فقط از اکشن pay-charge (شمارهٔ پیگیری لازم است)
        StepSpec('treasury_pay', 'واریز خزانه‌دار', 'treasury', PETTY_TREASURY_PERM, EXECUTE, actions=(ACT, RETURN)),
    ),
    on_state_change=_charge_state_change,
    summary=_charge_summary,
    route='/app/finance/employee-petty-cash?charge={id}',
    section_field=None,
    company_field='wf_company',
    amount_field='amount',
    view_permission=PETTY_CASH_PERM,
)


def recompute_statement(statement, save=True):
    """جمع ردیف‌ها و جمع ردیف‌های ردنشده (تأییدشده یا هنوز باز)."""
    from decimal import Decimal
    from django.db.models import Sum
    lines = statement.lines.all()
    statement.total_amount = lines.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    statement.approved_amount = lines.exclude(line_status='rejected').aggregate(s=Sum('amount'))['s'] or Decimal('0')
    if save:
        statement.save(update_fields=['total_amount', 'approved_amount', 'updated_at'])
    return statement


def _release_statement_lines(statement):
    """عودت یا رد کل صورت‌حساب: ردیف‌ها آزاد و باز می‌شوند تا در صورت‌حساب تازه بیایند (هیچ ردیفی حذف نمی‌شود)."""
    # Rejected lines stay rejected on the statement: they remain the custodian's debt.
    statement.lines.exclude(line_status='rejected').update(statement=None, line_status='open')


def _execute_statement(statement):
    """ص۴: ردیف‌های باز تأیید می‌شوند و شارژ دوباره به مبلغ ردیف‌های تأییدشده ساخته می‌شود."""
    from django.utils import timezone
    from .fiscal import to_shamsi_str
    from .models import PettyCashTransaction
    tracking = (getattr(statement, '_payment_ref', '') or '').strip()
    if not tracking:
        _tracking_required()
    statement.lines.filter(line_status='open').update(line_status='approved')
    statement.lines.filter(line_status='approved').update(status='approved')
    statement.lines.filter(line_status='rejected').update(status='rejected')
    recompute_statement(statement, save=False)
    if statement.approved_amount > 0:
        PettyCashTransaction.objects.create(
            account=statement.account, custodian=statement.custodian,
            created_by=getattr(statement, '_paid_by', None),
            transaction_type='allocation', amount=statement.approved_amount,
            transaction_date_shamsi=to_shamsi_str(timezone.now()),
            title=f'شارژ دوبارهٔ صورت‌حساب تنخواه {statement.pk}',
            category=petty_allocation_category('statement_refill'),
            source='statement_refill', source_statement=statement,
            receipt_number=tracking, status='approved',
        )
    statement.status = 'paid'


def petty_allocation_category(source):
    """د۳: متن category شارژ از برچسب منبع (برای اکسل و خلاصهٔ کار)؛ منبع خالی = متن ثابت قدیمی."""
    from .expense_heads import PETTY_CASH_FIXED_CATEGORY
    from .models import PettyCashTransaction
    return dict(PettyCashTransaction.SOURCE_CHOICES).get(source) or PETTY_CASH_FIXED_CATEGORY['allocation']


STATEMENT_STEP_STATUS = {COMPLETED: 'paid', RETURNED: 'returned', REJECTED: 'returned', CANCELLED: 'draft'}


def _statement_state_change(statement, state, instance):
    if state == COMPLETED:
        _execute_statement(statement)
    else:
        if state in (RETURNED, REJECTED):
            _release_statement_lines(statement)
            recompute_statement(statement, save=False)
        statement.status = STATEMENT_STEP_STATUS.get(state, 'submitted')
    statement.save(update_fields=['status', 'total_amount', 'approved_amount', 'updated_at'])
    from .workflow_engine import notify_document_changed
    notify_document_changed(statement)


def _statement_summary(statement):
    return {'title': f'صورت‌حساب تنخواه {statement.pk} — {_person_name(getattr(statement, "custodian", None))}',
            'amount': statement.total_amount, 'category': 'صورت‌حساب تنخواه',
            'date_shamsi': statement.statement_date_shamsi}


def resolve_petty_statement(entity_id):
    from .models import PettyCashStatement
    return PettyCashStatement.objects.select_related('account', 'custodian', 'company').filter(pk=entity_id).first()


PETTY_STATEMENT_WORKFLOW_SPEC = WorkflowSpec(
    key=PETTY_STATEMENT_WORKFLOW,
    version=1,
    entity_kind=PETTY_STATEMENT_ENTITY,
    title_fa='صورت‌حساب تنخواه',
    steps=(
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', PETTY_REVIEW_PERM, REVIEW),
        # سقف مبلغ شرکت (WorkflowThreshold) این مرحله را برای صورت‌حساب کوچک رد می‌کند
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', PETTY_MANAGER_PERM, APPROVE),
        StepSpec('treasury_pay', 'شارژ دوباره به دست خزانه‌دار', 'treasury', PETTY_TREASURY_PERM, EXECUTE,
                 actions=(ACT, RETURN)),
    ),
    on_state_change=_statement_state_change,
    summary=_statement_summary,
    route='/app/finance/employee-petty-cash?statement={id}',
    section_field=None,
    company_field='company',
    amount_field='total_amount',
    view_permission=PETTY_CASH_PERM,
)


# ─── دیدن، پیوست و قفل تنخواه (ص۱۱) ──────────────────────────────────────────────────────────────
def petty_tx_company_id(entity_id):
    tx = resolve_petty_tx(entity_id)
    return tx.wf_company_id if tx is not None else None


def petty_statement_company_id(entity_id):
    from .models import PettyCashStatement
    return PettyCashStatement.objects.filter(pk=entity_id).values_list('company_id', flat=True).first()


def petty_company_allowed(user, company_id) -> bool:
    from companies.access import get_user_allowed_companies
    if not company_id:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_allowed_companies(user).filter(id=company_id).exists()


def petty_company_viewer(user, company_id) -> bool:
    """دیدن تنخواه دیگران در شرکت: انتساب سطح شرکت با مدیریت تنخواه یا مجوز یکی از مرحله‌ها."""
    from accounts.scoped_permissions import can_at_company_level
    return petty_company_allowed(user, company_id) and any(
        can_at_company_level(user, code, company_id) for code in PETTY_COMPANY_VIEW_PERMS)


def _petty_tx_in_scope(user, tx) -> bool:
    from accounts.scoped_permissions import can
    company_id = tx.wf_company_id
    if not petty_company_allowed(user, company_id):
        return False
    if tx.custodian_id == user.pk or petty_company_viewer(user, company_id):
        return True
    if _petty_deputy(user, tx.account):
        return True
    # سند قدیمی بخش‌دار: مدیر تنخواه همان بخش
    return bool(tx.section_id) and can(user, PETTY_CASH_PERM, tx.section)


def can_view_petty_tx(user, entity_id):
    tx = resolve_petty_tx(entity_id)
    if tx is None:
        return None
    return True if _petty_tx_in_scope(user, tx) else None


def can_attach_petty_tx(user, entity_id):
    tx = resolve_petty_tx(entity_id)
    if tx is None:
        return None
    if tx.custodian_id == user.pk or _petty_deputy(user, tx.account):
        editable = tx.status in PETTY_EDITABLE_STATUSES and tx.statement_id is None
        return True if editable and petty_company_allowed(user, tx.wf_company_id) else None
    return True if _petty_tx_in_scope(user, tx) else None


def is_petty_tx_locked(entity_id):
    """
    ردیف تنخواه با تاریخی در دورهٔ مالی بستهٔ شرکت (قلاب ۳.۲)، هزینه با تاریخی تا آخرین دورهٔ تطبیق‌شدهٔ حساب
    (د۵ طرح ۴.۲)، یا ردیف حساب بسته (د۶).
    """
    from .fiscal import closed_period_for
    from .petty_lifecycle import is_account_closed, is_period_locked
    tx = resolve_petty_tx(entity_id)
    if tx is None:
        return False
    if is_account_closed(tx.account) or is_period_locked(tx.account_id, tx.transaction_date_shamsi,
                                                         tx.transaction_type):
        return True
    return closed_period_for(tx.wf_company_id, tx.transaction_date_shamsi) is not None


def _petty_statement_in_scope(user, statement) -> bool:
    if not petty_company_allowed(user, statement.company_id):
        return False
    return (statement.custodian_id == user.pk or petty_company_viewer(user, statement.company_id)
            or _petty_deputy(user, statement.account))


def _petty_deputy(user, account) -> bool:
    """جانشین فعال تنخواه‌گردان (د۸ طرح ۴.۲) مثل خود او سند را می‌بیند و پیوست می‌کند."""
    from .petty_lifecycle import is_petty_deputy
    return account is not None and is_petty_deputy(user, account)


def can_view_petty_statement(user, entity_id):
    statement = resolve_petty_statement(entity_id)
    if statement is None:
        return None
    return True if _petty_statement_in_scope(user, statement) else None


def can_attach_petty_statement(user, entity_id):
    statement = resolve_petty_statement(entity_id)
    if statement is None or statement.status in PETTY_STATEMENT_LOCKED_STATUSES:
        return None
    return True if _petty_statement_in_scope(user, statement) else None


def is_petty_statement_locked(entity_id):
    """صورت‌حساب پرداخت‌شده، یا با تاریخی در دورهٔ مالی بستهٔ شرکت."""
    from .fiscal import closed_period_for
    from .models import PettyCashStatement
    row = (PettyCashStatement.objects.filter(pk=entity_id)
           .values_list('status', 'statement_date_shamsi', 'company_id').first())
    if row is None:
        return False
    status, statement_date, company_id = row
    return status in PETTY_STATEMENT_LOCKED_STATUSES or closed_period_for(company_id, statement_date) is not None
