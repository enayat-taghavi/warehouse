"""
گردش‌های کار حسابداری روی موتور هسته (ت۱۷ و ت۲ طرح ۲.۳).

ماژول فقط گردش را اعلام می‌کند؛ موتور هسته مرحله، دریافت‌کننده و سابقه را نگه می‌دارد و با هر تغییر مرحله
on_state_change را صدا می‌زند تا وضعیت خود سند (ExpenseInvoice.status) به‌روز بماند. پس فهرست‌ها، فیلترها،
خروجی اکسل و برچسب‌های فرانت عوض نمی‌شوند.
"""
from decimal import Decimal

from workflow.registry import (APPROVE, CANCELLED, COMPLETED, EXECUTE, REJECTED, RETURN, ACT, RETURNED, REVIEW,
                               TERMINAL_STATES, StepSpec, WorkflowSpec)

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


# ─── پروندهٔ پرسنل و درخواست تغییر روی موتور (د۱ تا د۵ طرح ۴.۳) ─────────────────────────────────────
PERSONNEL_WORKFLOW = 'personnel_profile'
PERSONNEL_ENTITY = 'personnel_profile'
PERSONNEL_CHANGE_WORKFLOW = 'personnel_change'
PERSONNEL_CHANGE_ENTITY = 'personnel_change'
PERSONNEL_VIEW_PERM = 'view_sys_personnel'
# مرحلهٔ قدیمی (اکشن approve-X) ← کلید مرحلهٔ موتور
PERSONNEL_STAGE_STEP = {'supervisor': 'supervisor_ok', 'finance': 'accountant_review', 'manager': 'manager_ok'}
PERSONNEL_STEP_STATUS = {
    'supervisor_ok': 'pending_supervisor',
    'accountant_review': 'pending_accountant',
    'manager_ok': 'pending_manager',
    COMPLETED: 'approved',
    RETURNED: 'revision_required',
    REJECTED: 'rejected',
    CANCELLED: 'draft',
}
PERSONNEL_CHANGE_STEP_STATUS = dict(PERSONNEL_STEP_STATUS, **{CANCELLED: 'cancelled'})
# د۵: وضعیت قدیمیِ در جریان ← مرحله‌ای که کار آن باز می‌شود (manager_approved قدیمی معادل مصوب است)
PERSONNEL_LEGACY_STATUS_STEP = {
    'pending_supervisor': 'supervisor_ok',
    'supervisor_approved': 'accountant_review',
    'pending_accountant': 'accountant_review',
    'accountant_approved': 'manager_ok',
    'pending_manager': 'manager_ok',
}
# فیلدهای قدیمی «تأییدکننده و زمان» هر مرحله (برای گزارش‌های قدیمی)
PROFILE_APPROVER_FIELDS = {
    'supervisor_ok': ('supervisor_approved_by', 'supervisor_approved_at'),
    'accountant_review': ('accountant_approved_by', 'accountant_approved_at'),
    'manager_ok': ('manager_approved_by', 'manager_approved_at'),
}
CHANGE_APPROVER_FIELDS = {
    'supervisor_ok': ('supervisor_reviewed_by', 'supervisor_reviewed_at'),
    'accountant_review': ('accountant_reviewed_by', 'accountant_reviewed_at'),
    'manager_ok': ('manager_reviewed_by', 'manager_reviewed_at'),
}


def _personnel_steps():
    return (
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', 'perm_approve_personnel_supervisor', APPROVE),
        # بررسی حسابدار هرگز رد نمی‌شود (ق۷)؛ گیت فیلدهای مالی با قلاب can_act
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', 'perm_approve_personnel_finance', REVIEW),
        StepSpec('manager_ok', 'تصویب مدیر', 'manager', 'perm_approve_personnel_manager', APPROVE),
    )


def _acted_tasks(instance):
    """کارهای مرحلهٔ اقدام‌شدهٔ همین دور گردش (از آخرین ارسال)، به ترتیب بسته شدن."""
    from workflow.models import WorkflowTask
    qs = WorkflowTask.objects.filter(instance=instance, track=WorkflowTask.TRACK_STEP, is_open=False,
                                     outcome=WorkflowTask.ACTED)
    if instance.submitted_at:
        qs = qs.filter(closed_at__gte=instance.submitted_at)
    return list(qs.order_by('closed_at', 'pk'))


def _last_closer(instance):
    from workflow.models import WorkflowTask
    task = (WorkflowTask.objects.filter(instance=instance, track=WorkflowTask.TRACK_STEP, is_open=False)
            .exclude(closed_by=None).order_by('-closed_at', '-pk').first())
    return task.closed_by if task is not None else None


def _fill_approvers(obj, instance, fields_map, changed):
    """پر کردن «تأییدکننده و زمان» مرحله‌های اقدام‌شده؛ هرگز پاک نمی‌کند (سابقهٔ قدیمی می‌ماند)."""
    for task in _acted_tasks(instance):
        pair = fields_map.get(task.step_key)
        if not pair or task.closed_by_id is None:
            continue
        by_field, at_field = pair
        if getattr(obj, f'{by_field}_id') != task.closed_by_id or getattr(obj, at_field) != task.closed_at:
            setattr(obj, f'{by_field}_id', task.closed_by_id)
            setattr(obj, at_field, task.closed_at)
            changed.update((by_field, at_field))


PROFILE_ACT_ACTIONS = {'supervisor_ok': 'approve_supervisor', 'accountant_review': 'approve_finance',
                       'manager_ok': 'approve_manager'}
PROFILE_CLOSE_ACTIONS = {RETURNED: 'request_revision', REJECTED: 'reject', CANCELLED: 'cancel'}
CHANGE_ACT_ACTIONS = {'supervisor_ok': 'change_request_approve_supervisor',
                      'accountant_review': 'change_request_approve_finance', 'manager_ok': 'change_request_applied'}
CHANGE_CLOSE_ACTIONS = {RETURNED: 'change_request_revision', REJECTED: 'change_request_rejected',
                        CANCELLED: 'change_request_cancelled'}


def _legacy_action(instance, state, act_actions, close_actions):
    """نام اکشن قدیمی تایملاین: اقدام مرحله از آخرین کار اقدام‌شده؛ ورود اول پس از ارسال = None (ارسال جدا ثبت می‌شود)."""
    if state in close_actions:
        return close_actions[state]
    acted = _acted_tasks(instance)
    return act_actions.get(acted[-1].step_key) if acted else None


def _personnel_audit(profile, actor, from_status, to_status, action, state, reason=''):
    """ردیف تایملاین قدیمی (WorkflowAuditLog) با همان نام اکشن‌های قدیمی؛ سابقهٔ اصلی در موتور است."""
    from .models import WorkflowAuditLog
    metadata = {'engine': True, 'state': state, 'company_id': profile.company_id, 'batch': False}
    metadata.update(getattr(profile, '_wf_audit_meta', None) or {})
    WorkflowAuditLog.objects.create(
        content_type='personnel', object_id=profile.id, actor=actor, from_status=from_status, to_status=to_status,
        action=action, reason=reason or '', metadata=metadata,
    )


def _personnel_state_change(profile, state, instance):
    from django.utils import timezone
    old_status = profile.approval_status
    status = PERSONNEL_STEP_STATUS.get(state)
    changed = set()
    reason = getattr(profile, '_wf_reason', '') or ''
    actor = _last_closer(instance)
    if status and profile.approval_status != status:
        profile.approval_status = status
        changed.add('approval_status')
    _fill_approvers(profile, instance, PROFILE_APPROVER_FIELDS, changed)
    if state == COMPLETED:
        if not profile.is_active:
            profile.is_active = True
            changed.add('is_active')
        profile.rejection_reason = None
        changed.add('rejection_reason')
    elif state in (RETURNED, REJECTED):
        profile.rejection_reason = reason or profile.rejection_reason
        changed.add('rejection_reason')
        if state == RETURNED:
            profile.revision_requested_by = actor
            profile.revision_requested_at = timezone.now()
            changed.update(('revision_requested_by', 'revision_requested_at'))
    elif state != CANCELLED:
        profile.rejection_reason = None
        changed.add('rejection_reason')
    if changed:
        profile.save(update_fields=sorted(changed | {'updated_at'}))
    action = _legacy_action(instance, state, PROFILE_ACT_ACTIONS, PROFILE_CLOSE_ACTIONS)
    if action and old_status != profile.approval_status:
        _personnel_audit(profile, actor, old_status, profile.approval_status, action, state, reason)


def _personnel_summary(profile):
    # بی کد ملی و دستمزد (ق۱۶): خلاصهٔ کار برای همهٔ دریافت‌کنندگان دیده می‌شود
    return {'title': f'پروندهٔ پرسنل — {profile.full_name}', 'category': profile.job_title or ''}


def resolve_personnel(entity_id):
    from .models import PersonnelProfile
    return PersonnelProfile.objects.select_related('section', 'section__project', 'company').filter(
        pk=entity_id).first()


PERSONNEL_PROFILE_WORKFLOW_SPEC = WorkflowSpec(
    key=PERSONNEL_WORKFLOW,
    version=1,
    entity_kind=PERSONNEL_ENTITY,
    title_fa='پروندهٔ پرسنل',
    steps=_personnel_steps(),
    on_state_change=_personnel_state_change,
    summary=_personnel_summary,
    route='/app/finance/employee-new-personnel?personnel={id}',
    section_field='section',
    company_field='company',
    view_permission=PERSONNEL_VIEW_PERM,
)


def _change_state_change(cr, state, instance):
    from django.utils import timezone
    from workflow.errors import WorkflowError
    from .lifecycle_services import (PersonnelWorkflowError, apply_personnel_change_request,
                                     log_change_request_event, refresh_has_pending_changes)
    status = PERSONNEL_CHANGE_STEP_STATUS.get(state)
    if state == REJECTED and getattr(cr, '_wf_cancel', False):
        # لغو به دست مدیر کل (نه ثبت‌کننده) از مسیر رد موتور می‌گذرد ولی وضعیت درخواست «لغو» است
        status = 'cancelled'
    reason = getattr(cr, '_wf_reason', '') or ''
    actor = _last_closer(instance)
    changed = set()
    _fill_approvers(cr, instance, CHANGE_APPROVER_FIELDS, changed)
    if state == COMPLETED:
        # د۳: اعمال در همان تراکنش موتور؛ نامعتبر = برگشت کل اقدام و درخواست معلق می‌ماند
        try:
            apply_personnel_change_request(cr, request=getattr(cr, '_wf_request', None))
        except PersonnelWorkflowError as exc:
            err = WorkflowError(exc.code or 'invalid_change_request', exc.message, exc.status_code)
            err.errors = exc.errors
            raise err
    if state in (RETURNED, REJECTED, CANCELLED) and reason:
        cr.rejection_reason = reason
        changed.add('rejection_reason')
    if state == RETURNED:
        cr.revision_requested_by = actor
        cr.revision_requested_at = timezone.now()
        changed.update(('revision_requested_by', 'revision_requested_at'))
    previous = cr.status
    if status and cr.status != status:
        cr.status = status
        changed.add('status')
    if changed:
        cr.save(update_fields=sorted(changed | {'updated_at'}))
    if state in TERMINAL_STATES:
        refresh_has_pending_changes(cr.personnel)
    action = _legacy_action(instance, state, CHANGE_ACT_ACTIONS, CHANGE_CLOSE_ACTIONS)
    if state == REJECTED and status == 'cancelled':
        action = 'change_request_cancelled'
    if action and previous != cr.status:
        extra = {'from_change_request_status': previous, 'engine': True}
        if state == COMPLETED:
            extra.update({'diff': cr.proposed_changes, 'old_diff': cr.previous_values})
        log_change_request_event(cr, actor, action, reason=reason, extra=extra)


def _change_summary(cr):
    keys = ', '.join(sorted((cr.proposed_changes or {}).keys()))
    return {'title': f'درخواست تغییر پرونده — {cr.personnel.full_name}', 'category': keys[:100]}


def resolve_personnel_change(entity_id):
    from .models import PersonnelChangeRequest
    return (PersonnelChangeRequest.objects.select_related('personnel', 'personnel__section',
                                                          'personnel__section__project', 'requested_by')
            .filter(pk=entity_id).first())


PERSONNEL_CHANGE_WORKFLOW_SPEC = WorkflowSpec(
    key=PERSONNEL_CHANGE_WORKFLOW,
    version=1,
    entity_kind=PERSONNEL_CHANGE_ENTITY,
    title_fa='درخواست تغییر پروندهٔ پرسنل',
    steps=_personnel_steps(),
    on_state_change=_change_state_change,
    summary=_change_summary,
    route='/app/finance/employee-new-personnel?change_request={id}',
    # بخش و شرکت از پروندهٔ هدف (property های فقط‌خواندنی مدل، بی migration)
    section_field='wf_section',
    company_field='wf_company',
    view_permission=PERSONNEL_VIEW_PERM,
)


# ─── قلاب‌های دیدن، پیوست، قفل و پیش از اقدام پرونده ────────────────────────────────────────────────
def _personnel_in_scope(user, profile_id) -> bool:
    """همان دامنهٔ PersonnelProfileViewSet (scope_personnel_for_user در همهٔ شرکت‌های مجاز کاربر)."""
    from .models import PersonnelProfile
    from .views_domains.scope_helpers import scope_personnel_for_user
    if not profile_id or not getattr(user, 'is_authenticated', False):
        return False
    return scope_personnel_for_user(user, PersonnelProfile.objects.filter(pk=profile_id)).exists()


def personnel_company_id(entity_id):
    from .models import PersonnelProfile
    return PersonnelProfile.objects.filter(pk=entity_id).values_list('company_id', flat=True).first()


def personnel_change_company_id(entity_id):
    from .models import PersonnelChangeRequest
    return (PersonnelChangeRequest.objects.filter(pk=entity_id)
            .values_list('personnel__company_id', flat=True).first())


def can_view_personnel(user, entity_id):
    return True if _personnel_in_scope(user, entity_id) else None


def can_attach_personnel(user, entity_id):
    return can_view_personnel(user, entity_id)


def is_personnel_locked(entity_id):
    """پرونده قفل گردش ندارد؛ پروندهٔ مصوب فقط از مسیر درخواست تغییر عوض می‌شود."""
    return False


def _change_personnel_id(entity_id):
    from .models import PersonnelChangeRequest
    return PersonnelChangeRequest.objects.filter(pk=entity_id).values_list('personnel_id', flat=True).first()


def can_view_personnel_change(user, entity_id):
    return True if _personnel_in_scope(user, _change_personnel_id(entity_id)) else None


def can_attach_personnel_change(user, entity_id):
    return can_view_personnel_change(user, entity_id)


def is_personnel_change_locked(entity_id):
    from .models import PersonnelChangeRequest
    status = PersonnelChangeRequest.objects.filter(pk=entity_id).values_list('status', flat=True).first()
    return status in ('approved', 'cancelled')


def personnel_missing_message(missing):
    labels = '، '.join(m['label'] for m in missing)
    return f'فیلدهای الزامی مرحلهٔ حسابداری تکمیل نشده است: {labels}'


def can_act_personnel(user, profile, task, action):
    """د۲: تأیید «بررسی حسابدار» فقط با فیلدهای کامل مرحلهٔ مالی؛ عودت و رد آزادند."""
    if action != ACT or task.step_key != 'accountant_review':
        return None
    from .lifecycle_services import get_missing_fields
    missing = get_missing_fields(profile, stage='accountant')
    return personnel_missing_message(missing) if missing else None


def open_legacy_personnel_workflow(workflow_key, obj, reason='legacy: opened for an in-flight record'):
    """د۵: نمونهٔ موتور برای پرونده/درخواست در جریان قدیمی بی نمونه؛ تکرارپذیر. خروجی کار باز یا None."""
    from workflow import engine
    status = obj.approval_status if workflow_key == PERSONNEL_WORKFLOW else obj.status
    step_key = PERSONNEL_LEGACY_STATUS_STEP.get(status)
    if step_key is None:
        return None
    creator = obj.created_by if workflow_key == PERSONNEL_WORKFLOW else obj.requested_by
    return engine.open_at_step(workflow_key, obj, creator, step_key, reason=reason)


# ─── vehicle_profile / vehicle_change: پروندهٔ خودرو و درخواست تغییر روی موتور ۲.۳ (د۱ و د۲ طرح ۴.۶) ──────────
VEHICLE_WORKFLOW = 'vehicle_profile'
VEHICLE_ENTITY = 'vehicle_profile'
VEHICLE_CHANGE_WORKFLOW = 'vehicle_change'
VEHICLE_CHANGE_ENTITY = 'vehicle_change'
FLEET_VIEW_PERM = 'view_sys_fleet_attendance'
# همان نگاشت‌های پرونده (اکشن approve-X ← مرحله، مرحله ← وضعیت، وضعیت قدیمی در جریان ← مرحلهٔ بازشونده)
VEHICLE_STAGE_STEP = dict(PERSONNEL_STAGE_STEP)
VEHICLE_STEP_STATUS = dict(PERSONNEL_STEP_STATUS)
VEHICLE_CHANGE_STEP_STATUS = dict(PERSONNEL_CHANGE_STEP_STATUS)
VEHICLE_LEGACY_STATUS_STEP = dict(PERSONNEL_LEGACY_STATUS_STEP)


def _fleet_steps():
    # مرحله فقط یک مجوز بخشی می‌گیرد؛ نام مستعار مدیر (manager_approver) در موتور سنجیده نمی‌شود (مثل پرونده)
    return (
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', 'perm_approve_fleet_supervisor', APPROVE),
        # بررسی حسابدار هرگز رد نمی‌شود (ق۷)؛ گیت نرخ و شبا با قلاب can_act
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', 'perm_approve_fleet_finance', REVIEW),
        StepSpec('manager_ok', 'تصویب مدیر', 'manager', 'perm_approve_fleet_manager', APPROVE),
    )


def _vehicle_audit(vehicle, actor, from_status, to_status, action, state, reason=''):
    from .models import WorkflowAuditLog
    metadata = {'engine': True, 'state': state, 'company_id': vehicle.company_id, 'batch': False}
    metadata.update(getattr(vehicle, '_wf_audit_meta', None) or {})
    WorkflowAuditLog.objects.create(
        content_type='vehicle', object_id=vehicle.id, actor=actor, from_status=from_status, to_status=to_status,
        action=action, reason=reason or '', metadata=metadata,
    )


def _vehicle_state_change(vehicle, state, instance):
    from django.utils import timezone
    old_status = vehicle.approval_status
    status = VEHICLE_STEP_STATUS.get(state)
    changed = set()
    reason = getattr(vehicle, '_wf_reason', '') or ''
    actor = _last_closer(instance)
    if status and vehicle.approval_status != status:
        vehicle.approval_status = status
        changed.add('approval_status')
    _fill_approvers(vehicle, instance, PROFILE_APPROVER_FIELDS, changed)
    if state == COMPLETED:
        if not vehicle.is_active:
            vehicle.is_active = True
            changed.add('is_active')
        vehicle.rejection_reason = None
        changed.add('rejection_reason')
    elif state in (RETURNED, REJECTED):
        vehicle.rejection_reason = reason or vehicle.rejection_reason
        changed.add('rejection_reason')
        if state == RETURNED:
            vehicle.revision_requested_by = actor
            vehicle.revision_requested_at = timezone.now()
            changed.update(('revision_requested_by', 'revision_requested_at'))
    elif state != CANCELLED:
        vehicle.rejection_reason = None
        changed.add('rejection_reason')
    if changed:
        vehicle.save(update_fields=sorted(changed | {'updated_at'}))
    action = _legacy_action(instance, state, PROFILE_ACT_ACTIONS, PROFILE_CLOSE_ACTIONS)
    if action and old_status != vehicle.approval_status:
        _vehicle_audit(vehicle, actor, old_status, vehicle.approval_status, action, state, reason)


def _vehicle_summary(vehicle):
    # بی کد ملی و شبا (ق۱۶): خلاصهٔ کار برای همهٔ دریافت‌کنندگان دیده می‌شود
    return {'title': f'پروندهٔ خودرو — {vehicle.plate_number} ({vehicle.driver_name})',
            'category': vehicle.get_vehicle_type_display() if vehicle.vehicle_type else ''}


def resolve_vehicle(entity_id):
    from .models import VehicleDriverProfile
    return VehicleDriverProfile.objects.select_related('section', 'section__project', 'company').filter(
        pk=entity_id).first()


VEHICLE_PROFILE_WORKFLOW_SPEC = WorkflowSpec(
    key=VEHICLE_WORKFLOW,
    version=1,
    entity_kind=VEHICLE_ENTITY,
    title_fa='پروندهٔ خودرو',
    steps=_fleet_steps(),
    on_state_change=_vehicle_state_change,
    summary=_vehicle_summary,
    route='/app/finance/employee-new-vehicle?vehicle={id}',
    section_field='section',
    company_field='company',
    view_permission=FLEET_VIEW_PERM,
)


def _vehicle_change_state_change(cr, state, instance):
    from django.utils import timezone
    from workflow.errors import WorkflowError
    from .fleet_lifecycle_services import (VehicleWorkflowError, apply_vehicle_change_request,
                                           log_vehicle_change_request_event, refresh_vehicle_has_pending_changes)
    status = VEHICLE_CHANGE_STEP_STATUS.get(state)
    if state == REJECTED and getattr(cr, '_wf_cancel', False):
        status = 'cancelled'
    reason = getattr(cr, '_wf_reason', '') or ''
    actor = _last_closer(instance)
    changed = set()
    _fill_approvers(cr, instance, CHANGE_APPROVER_FIELDS, changed)
    if state == COMPLETED:
        # د۲: اعمال در همان تراکنش موتور؛ نامعتبر = برگشت کل اقدام و درخواست معلق می‌ماند
        try:
            apply_vehicle_change_request(cr, request=getattr(cr, '_wf_request', None))
        except VehicleWorkflowError as exc:
            err = WorkflowError(exc.code or 'invalid_change_request', exc.message, exc.status_code)
            err.errors = exc.errors
            raise err
    if state in (RETURNED, REJECTED, CANCELLED) and reason:
        cr.rejection_reason = reason
        changed.add('rejection_reason')
    if state == RETURNED:
        cr.revision_requested_by = actor
        cr.revision_requested_at = timezone.now()
        changed.update(('revision_requested_by', 'revision_requested_at'))
    previous = cr.status
    if status and cr.status != status:
        cr.status = status
        changed.add('status')
    if changed:
        cr.save(update_fields=sorted(changed | {'updated_at'}))
    if state in TERMINAL_STATES:
        refresh_vehicle_has_pending_changes(cr.vehicle)
    action = _legacy_action(instance, state, CHANGE_ACT_ACTIONS, CHANGE_CLOSE_ACTIONS)
    if state == REJECTED and status == 'cancelled':
        action = 'change_request_cancelled'
    if action and previous != cr.status:
        extra = {'from_change_request_status': previous, 'engine': True}
        if state == COMPLETED:
            extra.update({'diff': cr.proposed_changes, 'old_diff': cr.previous_values})
        log_vehicle_change_request_event(cr, actor, action, reason=reason, extra=extra)


def _vehicle_change_summary(cr):
    keys = ', '.join(sorted((cr.proposed_changes or {}).keys()))
    return {'title': f'درخواست تغییر خودرو — {cr.vehicle.plate_number}', 'category': keys[:100]}


def resolve_vehicle_change(entity_id):
    from .models import VehicleChangeRequest
    return (VehicleChangeRequest.objects.select_related('vehicle', 'vehicle__section', 'vehicle__section__project',
                                                        'requested_by')
            .filter(pk=entity_id).first())


VEHICLE_CHANGE_WORKFLOW_SPEC = WorkflowSpec(
    key=VEHICLE_CHANGE_WORKFLOW,
    version=1,
    entity_kind=VEHICLE_CHANGE_ENTITY,
    title_fa='درخواست تغییر پروندهٔ خودرو',
    steps=_fleet_steps(),
    on_state_change=_vehicle_change_state_change,
    summary=_vehicle_change_summary,
    route='/app/finance/employee-new-vehicle?change_request={id}',
    # بخش و شرکت از خودروی هدف (property های فقط‌خواندنی مدل، بی migration)
    section_field='wf_section',
    company_field='wf_company',
    view_permission=FLEET_VIEW_PERM,
)


class _UserScopeRequest:
    """درخواست ساختگی برای scope_vehicle_queryset در قلاب‌های موتور (بی سربرگ شرکت: همهٔ شرکت‌های مجاز کاربر)."""

    def __init__(self, user):
        self.user = user
        self.headers = {}
        self.META = {}
        self.query_params = {}
        self.GET = {}
        self.data = {}


def _vehicle_in_scope(user, vehicle_id) -> bool:
    from .models import VehicleDriverProfile
    from .views_domains.scope_helpers import scope_vehicle_queryset
    if not vehicle_id or not getattr(user, 'is_authenticated', False):
        return False
    return scope_vehicle_queryset(_UserScopeRequest(user), VehicleDriverProfile.objects.filter(pk=vehicle_id)).exists()


def vehicle_company_id(entity_id):
    from .models import VehicleDriverProfile
    return VehicleDriverProfile.objects.filter(pk=entity_id).values_list('company_id', flat=True).first()


def vehicle_change_company_id(entity_id):
    from .models import VehicleChangeRequest
    return VehicleChangeRequest.objects.filter(pk=entity_id).values_list('vehicle__company_id', flat=True).first()


def can_view_vehicle(user, entity_id):
    return True if _vehicle_in_scope(user, entity_id) else None


def can_attach_vehicle(user, entity_id):
    return can_view_vehicle(user, entity_id)


def is_vehicle_locked(entity_id):
    """پرونده قفل گردش ندارد؛ خودروی مصوب فقط از مسیر درخواست تغییر عوض می‌شود."""
    return False


def _change_vehicle_id(entity_id):
    from .models import VehicleChangeRequest
    return VehicleChangeRequest.objects.filter(pk=entity_id).values_list('vehicle_id', flat=True).first()


def can_view_vehicle_change(user, entity_id):
    return True if _vehicle_in_scope(user, _change_vehicle_id(entity_id)) else None


def can_attach_vehicle_change(user, entity_id):
    return can_view_vehicle_change(user, entity_id)


def is_vehicle_change_locked(entity_id):
    from .models import VehicleChangeRequest
    status = VehicleChangeRequest.objects.filter(pk=entity_id).values_list('status', flat=True).first()
    return status in ('approved', 'cancelled')


def vehicle_missing_message(missing):
    labels = '، '.join(m['label'] for m in missing)
    return f'فیلدهای الزامی مرحلهٔ حسابداری خودرو تکمیل نشده است: {labels}'


def can_act_vehicle(user, vehicle, task, action):
    """د۱: تأیید «بررسی حسابدار» فقط با نرخ و شبای کامل؛ عودت و رد آزادند."""
    if action != ACT or task.step_key != 'accountant_review':
        return None
    from .fleet_lifecycle_services import get_vehicle_missing_fields
    missing = get_vehicle_missing_fields(vehicle, stage='accountant')
    return vehicle_missing_message(missing) if missing else None


def open_legacy_vehicle_workflow(workflow_key, obj, reason='legacy: opened for an in-flight vehicle record'):
    """د۴: نمونهٔ موتور برای خودرو/درخواست در جریان قدیمی بی نمونه؛ تکرارپذیر. خروجی کار باز یا None."""
    from workflow import engine
    status = obj.approval_status if workflow_key == VEHICLE_WORKFLOW else obj.status
    step_key = VEHICLE_LEGACY_STATUS_STEP.get(status)
    if step_key is None:
        return None
    creator = obj.created_by if workflow_key == VEHICLE_WORKFLOW else obj.requested_by
    return engine.open_at_step(workflow_key, obj, creator, step_key, reason=reason)


# ─── attendance_period: monthly work period on engine 2.3 (plan 4.4, D2) ────────────────────────────────
ATTENDANCE_PERIOD_WORKFLOW = 'attendance_period'
ATTENDANCE_PERIOD_ENTITY = 'attendance_period'
ATTENDANCE_VIEW_PERM = 'view_sys_personnel_attendance'
PERIOD_APPROVER_FIELDS = {
    'supervisor_ok': ('supervisor_approved_by', 'supervisor_approved_at'),
    'accountant_review': ('accountant_approved_by', 'accountant_approved_at'),
    'manager_ok': ('manager_approved_by', 'manager_approved_at'),
}
PERIOD_ACT_ACTIONS = {'supervisor_ok': 'approve_supervisor', 'accountant_review': 'approve_finance',
                      'manager_ok': 'approve_manager'}
PERIOD_CLOSE_ACTIONS = {RETURNED: 'request_revision', REJECTED: 'reject', CANCELLED: 'cancel'}
# steps past supervisor_ok: entering one of them means the month is supervisor-approved
PERIOD_AFTER_SUPERVISOR = ('accountant_review', 'manager_ok', COMPLETED)
# وضعیت دوره ← نگاشت حالت موتور (د۲)؛ LOCKED و FINALIZED برای دورهٔ تازه به کار نمی‌روند
PERIOD_STEP_STATUS = {
    'supervisor_ok': 'SUBMITTED',
    'accountant_review': 'SUBMITTED_SUPERVISOR',
    'manager_ok': 'SUBMITTED_ACCOUNTANT',
    COMPLETED: 'READY_TO_PAY',
    RETURNED: 'REVISION_REQUIRED',
    REJECTED: 'REJECTED',
    CANCELLED: 'OPEN',
}
# قلاب is_locked موتور: فقط دورهٔ بسته (پایان گردش یا مسیر قدیمی)؛ دورهٔ در جریان باید اقدام‌پذیر بماند.
# قفل کارکرد (د۴) جداست: attendance_periods.is_period_locked از ارسال به بعد.
PERIOD_ENGINE_LOCKED_STATUSES = ('READY_TO_PAY', 'PAID', 'LOCKED', 'FINALIZED')


def _period_steps():
    return (
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', 'perm_approve_attendance_supervisor', APPROVE),
        # بررسی حسابدار هرگز رد نمی‌شود (ق۷)
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', 'perm_approve_attendance_finance', REVIEW),
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', 'perm_approve_attendance_manager', APPROVE),
    )


def period_audit(period, actor, from_status, to_status, action, state, reason='', extra=None):
    """ردیف تایملاین قدیمی (WorkflowAuditLog) دوره با نام اکشن‌های قدیمی؛ سابقهٔ اصلی در موتور است."""
    from .models import WorkflowAuditLog
    metadata = {'engine': True, 'state': state, 'company_id': period.company_id, 'section_id': period.section_id,
                'year_month': period.year_month}
    metadata.update(extra or {})
    WorkflowAuditLog.objects.create(
        content_type='monthlyworkperiod', object_id=period.id, actor=actor, from_status=from_status,
        to_status=to_status, action=action, reason=reason or '', metadata=metadata,
    )


def _approve_pending_attendance(period, actor):
    """د۲: تأیید سرپرست یعنی تأیید کل ماه؛ همهٔ کارکردهای PENDING_SUPERVISOR دوره در همان تراکنش APPROVED."""
    from django.utils import timezone
    from .attendance_periods import period_attendance_qs
    from .models import AttendanceAuditLog
    now = timezone.now()
    rows = list(period_attendance_qs(period).filter(approval_status='PENDING_SUPERVISOR')
                .select_for_update(of=('self',)).select_related('personnel'))
    for rec in rows:
        rec.approval_status = 'APPROVED'
        rec.supervisor_approved_by = actor
        rec.supervisor_approved_at = now
        rec.save(update_fields=['approval_status', 'supervisor_approved_by', 'supervisor_approved_at', 'updated_at'])
        AttendanceAuditLog.objects.create(
            attendance=rec, personnel_name=rec.personnel.full_name, date_shamsi=rec.date_shamsi, changed_by=actor,
            field_name='approval_status', old_value='PENDING_SUPERVISOR', new_value='APPROVED',
            reason=f'تأیید ماه {period.year_month} در گردش کارکرد ماهانه',
        )
    return len(rows)


def _period_state_change(period, state, instance):
    from django.utils import timezone
    old_status = period.status
    status = PERIOD_STEP_STATUS.get(state)
    reason = getattr(period, '_wf_reason', '') or ''
    actor = _last_closer(instance)
    acted = _acted_tasks(instance)
    changed = set()
    if status and period.status != status:
        period.status = status
        changed.add('status')
    if (state not in (RETURNED, REJECTED, CANCELLED, COMPLETED) and not acted
            and old_status not in ('SUBMITTED', 'SUBMITTED_SUPERVISOR', 'SUBMITTED_ACCOUNTANT')):
        # ورود اول پس از ارسال (یا ارسال دوباره)؛ دورهٔ در جریان قدیمی (open_at_step) فیلدهای خودش را نگه می‌دارد
        period.submitted_by_id = instance.created_by_id
        period.submitted_at = instance.submitted_at
        period.rejection_reason = None
        changed.update(('submitted_by', 'submitted_at', 'rejection_reason'))
    _fill_approvers(period, instance, PERIOD_APPROVER_FIELDS, changed)
    if state in PERIOD_AFTER_SUPERVISOR:
        # سرپرست تأیید کرد، یا مرحلهٔ او (سطح ثبت‌کننده یا بخش بی سرپرست) رد شد
        sup_task = next((t for t in acted if t.step_key == 'supervisor_ok'), None)
        approver = sup_task.closed_by if sup_task is not None else instance.created_by
        _approve_pending_attendance(period, approver)
    if state == COMPLETED:
        period.locked_at = timezone.now()
        period.locked_by = actor
        changed.update(('locked_at', 'locked_by'))
    elif state in (RETURNED, REJECTED):
        period.rejection_reason = reason or period.rejection_reason
        changed.add('rejection_reason')
        if state == RETURNED:
            period.revision_requested_by = actor
            period.revision_requested_at = timezone.now()
            changed.update(('revision_requested_by', 'revision_requested_at'))
    elif state == CANCELLED:
        period.locked_at = None
        period.locked_by = None
        changed.update(('locked_at', 'locked_by'))
    if changed:
        period.save(update_fields=sorted(changed | {'updated_at'}))
    action = _legacy_action(instance, state, PERIOD_ACT_ACTIONS, PERIOD_CLOSE_ACTIONS)
    if action is None and not acted and state not in (RETURNED, REJECTED, CANCELLED):
        action = 'submit'
        actor = instance.created_by
    if action and old_status != period.status:
        period_audit(period, actor, old_status, period.status, action, state, reason)


def _period_summary(period):
    section = period.section.name if period.section_id and period.section else ''
    return {'title': f'کارکرد ماهانه {period.year_month}' + (f' — {section}' if section else ''),
            'category': section}


def resolve_attendance_period(entity_id):
    from .models import MonthlyWorkPeriod
    return MonthlyWorkPeriod.objects.select_related('section', 'section__project', 'company').filter(
        pk=entity_id).first()


ATTENDANCE_PERIOD_WORKFLOW_SPEC = WorkflowSpec(
    key=ATTENDANCE_PERIOD_WORKFLOW,
    version=1,
    entity_kind=ATTENDANCE_PERIOD_ENTITY,
    title_fa='کارکرد ماهانه',
    steps=_period_steps(),
    on_state_change=_period_state_change,
    summary=_period_summary,
    route='/app/finance/employee-attendance?period={id}',
    section_field='section',
    company_field='company',
    view_permission=ATTENDANCE_VIEW_PERM,
)


def attendance_period_company_id(entity_id):
    from .models import MonthlyWorkPeriod
    return MonthlyWorkPeriod.objects.filter(pk=entity_id).values_list('company_id', flat=True).first()


def can_view_attendance_period(user, entity_id):
    from .attendance_periods import user_can_see_period
    from .models import MonthlyWorkPeriod
    period = MonthlyWorkPeriod.objects.filter(pk=entity_id).first()
    return True if user_can_see_period(user, period) else None


def can_attach_attendance_period(user, entity_id):
    return can_view_attendance_period(user, entity_id)


def is_attendance_period_locked(entity_id):
    from .models import MonthlyWorkPeriod
    status = MonthlyWorkPeriod.objects.filter(pk=entity_id).values_list('status', flat=True).first()
    return status in PERIOD_ENGINE_LOCKED_STATUSES


def can_act_attendance_period(user, period, task, action):
    """د۲: تأیید سرپرست با کارکرد عودت‌شده (REVISION_REQUIRED) در دوره بسته است؛ عودت و رد آزادند."""
    if action != ACT or task.step_key != 'supervisor_ok':
        return None
    from .attendance_periods import revision_blocked_message, revision_required_count
    count = revision_required_count(period)
    return revision_blocked_message(count) if count else None


def open_legacy_period_workflow(period, reason='legacy: opened for an in-flight attendance period'):
    """د۶: نمونهٔ موتور برای دورهٔ در جریان قدیمی بی نمونه؛ تکرارپذیر. خروجی کار باز یا None."""
    from workflow import engine
    from .attendance_periods import PERIOD_LEGACY_STATUS_STEP
    step_key = PERIOD_LEGACY_STATUS_STEP.get(period.status)
    if step_key is None or period.company_id is None:
        return None
    creator = period.submitted_by or period.locked_by
    return engine.open_at_step(ATTENDANCE_PERIOD_WORKFLOW, period, creator, step_key, reason=reason)


# ─── گردش حقوق ماهانه روی موتور ۲.۳ (د۴ طرح ۴.۵) ───────────────────────────────────────────────────
# نمونهٔ جدا از گردش کارکرد روی همان MonthlyWorkPeriod (کلید و نوع payroll_period). پایان manager_ok (رسیدن به
# treasury_pay) ردیف‌های بی تعلیق را READY_TO_PAY می‌کند؛ پایان treasury_pay (COMPLETED) پرداخت دوره را در همان
# تراکنش موتور انجام می‌دهد؛ عودت ردیف‌ها را به PENDING برمی‌گرداند تا محاسبهٔ دوباره آزاد شود.
PAYROLL_PERIOD_WORKFLOW = 'payroll_period'
PAYROLL_PERIOD_ENTITY = 'payroll_period'
PAYROLL_VIEW_PERM = 'view_sys_payroll'
PAYROLL_MANAGER_PERM = 'perm_manager_payment_authorize'
PAYROLL_TREASURY_PERM = 'perm_treasury_disburse_action'
PAYROLL_LOCK_STEPS = ('manager_ok', 'treasury_pay')
PAYROLL_LOCKED_CODE = 'payroll_locked'
PAYROLL_LOCKED_MESSAGE = ('حقوق این دوره تأیید مدیر گرفته یا پرداخت شده است و تغییر نمی‌کند؛ '
                          'برای اصلاح، مدیر یا خزانه‌دار باید آن را عودت دهد.')


def payroll_payable_total(period):
    """مبلغ گردش = جمع قابل پرداخت ردیف‌های دوره (ردیف REJECTED شمرده نمی‌شود)."""
    from django.db.models import Sum
    from .models import MonthlyPayrollRecord
    total = (MonthlyPayrollRecord.objects.filter(period_id=period.pk).exclude(payment_status='REJECTED')
             .aggregate(s=Sum('payable_amount'))['s'])
    return Decimal(str(total or 0))


def resolve_payroll_period(entity_id):
    from .models import MonthlyWorkPeriod
    period = MonthlyWorkPeriod.objects.select_related('section', 'section__project', 'company').filter(
        pk=entity_id).first()
    if period is not None:
        period.payroll_payable_total = payroll_payable_total(period)
    return period


def _payroll_summary(period):
    section = period.section.name if period.section_id and period.section else ''
    return {'title': f'حقوق ماهانه {period.year_month}' + (f' — {section}' if section else ''),
            'category': section}


def _payroll_rows_to(period, from_statuses, to_status):
    from django.utils import timezone
    from .models import MonthlyPayrollRecord
    qs = MonthlyPayrollRecord.objects.filter(period_id=period.pk, payment_status__in=from_statuses)
    if to_status == 'READY_TO_PAY':
        qs = qs.filter(payment_hold=False)
    return qs.update(payment_status=to_status, updated_at=timezone.now())


def _payroll_state_change(period, state, instance):
    from django.utils import timezone
    from workflow.errors import WorkflowError
    from .models import MonthlyWorkPeriod
    from .workflow_engine import notify_document_changed
    # قفل ردیف دوره: محاسبهٔ دوباره (که همین قفل را می‌گیرد) با تأیید یا پرداخت هم‌زمان نمی‌شود
    MonthlyWorkPeriod.objects.select_for_update().filter(pk=period.pk).values_list('pk', flat=True).first()
    if state == 'treasury_pay':
        # پایان manager_ok (یا رد شدنش): ردیف‌های بی تعلیق آمادهٔ پرداخت؛ مهر تأیید مدیر روی دوره
        _payroll_rows_to(period, ('PENDING',), 'READY_TO_PAY')
        mgr = next((t for t in _acted_tasks(instance) if t.step_key == 'manager_ok'), None)
        period.manager_approved_by_id = mgr.closed_by_id if mgr is not None else instance.created_by_id
        period.manager_approved_at = timezone.now()
        period.save(update_fields=['manager_approved_by', 'manager_approved_at', 'updated_at'])
    elif state == COMPLETED:
        payment = getattr(period, '_wf_payment', None) or {}
        tracking_code = str(payment.get('tracking_code') or '').strip()
        if not tracking_code:
            raise WorkflowError('tracking_code_required',
                                'پرداخت حقوق فقط از کارتابل خزانه با ثبت کد رهگیری بانکی انجام می‌شود.', 400)
        from .treasury_engine import execute_period_payment
        user = payment.get('user') or _last_closer(instance)
        period._wf_payment_result = execute_period_payment(
            period, user, tracking_code, payment.get('batch_id') or '')
    elif state in (RETURNED, CANCELLED, REJECTED):
        # عودت: ردیف‌ها دوباره در انتظار و محاسبهٔ دوباره آزاد (هیچ ردیفی حذف نمی‌شود)
        _payroll_rows_to(period, ('READY_TO_PAY',), 'PENDING')
    notify_document_changed(period)


PAYROLL_PERIOD_WORKFLOW_SPEC = WorkflowSpec(
    key=PAYROLL_PERIOD_WORKFLOW,
    version=1,
    entity_kind=PAYROLL_PERIOD_ENTITY,
    title_fa='حقوق ماهانه',
    steps=(
        # بررسی حسابدار همان ارسال است (submit_payroll_period با view_sys_payroll)؛ مرحلهٔ REVIEW جدا با سطح
        # ثبت‌کننده رد نمی‌شود و حسابدار دومی را لازم می‌کرد، پس گردش از تأیید مدیر شروع می‌شود.
        # ن۳: مدیر حقوق را رد نمی‌کند، فقط برای اصلاح عودت می‌دهد
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', PAYROLL_MANAGER_PERM, APPROVE, actions=(ACT, RETURN)),
        # پرداخت فقط با کد رهگیری (کارتابل خزانه)؛ اقدام عمومی «کارهای من» بی کد 400 tracking_code_required
        StepSpec('treasury_pay', 'پرداخت خزانه‌دار', 'treasury', PAYROLL_TREASURY_PERM, EXECUTE,
                 actions=(ACT, RETURN)),
    ),
    on_state_change=_payroll_state_change,
    summary=_payroll_summary,
    route='/app/finance/accountant-payroll?period={id}',
    section_field='section',
    company_field='company',
    amount_field='payroll_payable_total',
    view_permission=PAYROLL_VIEW_PERM,
)


def payroll_open_task(period_id):
    from workflow import engine
    return engine.open_task(PAYROLL_PERIOD_WORKFLOW, period_id)


def payroll_instance(period_id):
    from workflow import engine
    return engine.instance_of(PAYROLL_PERIOD_WORKFLOW, period_id)


def is_payroll_locked(period) -> bool:
    """د۵: کار باز حقوق از manager_ok به بعد، یا ردیف READY_TO_PAY/PAID، یا دورهٔ PAID."""
    if period is None:
        return False
    if period.status == 'PAID':
        return True
    task = payroll_open_task(period.pk)
    if task is not None and task.step_key in PAYROLL_LOCK_STEPS:
        return True
    return period.payroll_records.filter(payment_status__in=('READY_TO_PAY', 'PAID')).exists()


def payroll_manager_approved(period, records=None) -> bool:
    """
    آیا حقوق دوره تأیید مدیر گرفته است؟ با گردش حقوق: کار باز در treasury_pay یا گردش پایان‌یافته.
    دورهٔ بی نمونهٔ گردش (قدیمی): دورهٔ PAID یا ردیف READY_TO_PAY/PAID (records بارشده = بی پرس‌وجو).
    """
    from workflow.models import WorkflowInstance
    instance = payroll_instance(period.pk)
    if instance is not None:
        return instance.status == WorkflowInstance.COMPLETED or (
            instance.status == WorkflowInstance.IN_PROGRESS and instance.current_step == 'treasury_pay')
    if period.status == 'PAID':
        return True
    approved = ('READY_TO_PAY', 'PAID')
    if records is not None:
        return any(r.period_id == period.id and r.payment_status in approved for r in records)
    return period.payroll_records.filter(payment_status__in=approved).exists()


def payroll_period_company_id(entity_id):
    return attendance_period_company_id(entity_id)


def can_view_payroll_period(user, entity_id):
    """دیدن سند گردش حقوق: شرکت مجاز و یکی از مجوزهای حقوق/مدیر/خزانه در بخش دوره؛ بیرون از آن بی‌نظر."""
    from companies.access import get_user_allowed_companies
    from .lifecycle_services import user_has_any_perm
    from .models import MonthlyWorkPeriod
    period = MonthlyWorkPeriod.objects.filter(pk=entity_id).first()
    if period is None or not getattr(user, 'is_authenticated', False):
        return None
    if user.is_superuser:
        return True
    if period.company_id is None or not get_user_allowed_companies(user).filter(id=period.company_id).exists():
        return None
    perms = (PAYROLL_VIEW_PERM, PAYROLL_MANAGER_PERM, PAYROLL_TREASURY_PERM)
    return True if user_has_any_perm(user, perms, period) else None


def can_attach_payroll_period(user, entity_id):
    return can_view_payroll_period(user, entity_id)


def is_payroll_period_closed(entity_id):
    """دورهٔ پرداخت‌شده در گردش حقوق جابه‌جا نمی‌شود (قفل موتور)؛ قفل محاسبه (د۵) جداست."""
    from .models import MonthlyWorkPeriod
    return MonthlyWorkPeriod.objects.filter(pk=entity_id, status='PAID').exists()


def submit_payroll_period(user, period):
    """
    ارسال حقوق دوره به گردش (حسابدار). فقط وقتی گردش کارکرد تمام شده (READY_TO_PAY)، دست‌کم یک ردیف حقوق هست و
    کار باز حقوق نیست. مجوز: view_sys_payroll در بخش دوره. خطا: WorkflowError.
    """
    from django.db import transaction
    from workflow import engine
    from workflow.errors import WorkflowError
    from .lifecycle_services import user_has_any_perm
    from .models import MonthlyWorkPeriod
    if period.company_id is None:
        raise WorkflowError('invalid_state', 'این دوره شرکت ندارد و به گردش حقوق نمی‌رود.', 400)
    if not user_has_any_perm(user, (PAYROLL_VIEW_PERM,), period):
        raise WorkflowError('not_allowed', 'شما مجوز ارسال حقوق این بخش را ندارید.', 403)
    with transaction.atomic():
        locked = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
        if locked.status != 'READY_TO_PAY':
            raise WorkflowError('attendance_not_approved',
                                'حقوق فقط پس از پایان گردش کارکرد و پیش از پرداخت به گردش می‌رود.', 400)
        if not locked.payroll_records.exists():
            raise WorkflowError('no_payroll_records', 'ابتدا حقوق این دوره را محاسبه کنید.', 400)
        if payroll_open_task(locked.pk) is not None:
            raise WorkflowError('already_in_progress', 'حقوق این دوره از قبل در گردش تأیید است.', 409)
        locked.payroll_payable_total = payroll_payable_total(locked)
        engine.submit(PAYROLL_PERIOD_WORKFLOW, locked, user)
    period.refresh_from_db()
    return period


def open_legacy_payroll_workflow(period, reason='legacy: opened for a calculated payroll period'):
    """د۹: دورهٔ READY_TO_PAY با ردیف حقوق و بی نمونهٔ گردش حقوق ← کار باز در manager_ok؛ تکرارپذیر."""
    from workflow import engine
    if period.company_id is None:
        return None
    period.payroll_payable_total = payroll_payable_total(period)
    creator = period.locked_by or period.submitted_by
    return engine.open_at_step(PAYROLL_PERIOD_WORKFLOW, period, creator, 'manager_ok', reason=reason)


# ─── کارکرد ماهانهٔ ناوگان روی موتور ۲.۳ (د۵ طرح ۴.۶) ──────────────────────────────────────────────
# نمونهٔ جدا (کلید و نوع fleet_period) روی همان MonthlyWorkPeriod بخش + ماه. ترددهای بخش‌دار به دورهٔ بخش وصل
# می‌شوند؛ از ارسال تا پرداخت تردد آن ماه قفل است (is_fleet_locked). پایان treasury_pay ترددهای تسویه‌نشدهٔ
# خودروهای کرایه‌ای همان دوره را در همان تراکنش موتور تسویه می‌کند؛ عودت قفل را باز می‌کند (هیچ ردیفی حذف نمی‌شود).
FLEET_PERIOD_WORKFLOW = 'fleet_period'
FLEET_PERIOD_ENTITY = 'fleet_period'
FLEET_SUPERVISOR_PERM = 'perm_approve_fleet_supervisor'
FLEET_FINANCE_PERM = 'perm_approve_fleet_finance'
FLEET_MANAGER_PERM = 'perm_approve_fleet_manager'
FLEET_TREASURY_PERM = 'perm_treasury_disburse_action'
FLEET_SETTLEMENT_PERM = 'view_sys_fleet_settlement'
FLEET_PAYABLE_OWNERSHIP = ('contract', 'personal')
FLEET_PERIOD_VIEW_PERMS = (FLEET_VIEW_PERM, FLEET_SUPERVISOR_PERM, FLEET_FINANCE_PERM, FLEET_MANAGER_PERM,
                           FLEET_TREASURY_PERM, FLEET_SETTLEMENT_PERM)
FLEET_SUBMIT_PERMS = (FLEET_VIEW_PERM, FLEET_SUPERVISOR_PERM)
FLEET_LOCKED_CODE = 'fleet_locked'
FLEET_LOCKED_MESSAGE = ('کارکرد ماهانهٔ ناوگان این بخش و ماه ارسال یا پرداخت شده و تردد آن قفل است؛ '
                        'برای اصلاح، باید در گردش عودت داده شود.')


def fleet_period_trips(period):
    """ترددهای فعال دوره: وصل به همین دوره، یا ترددهای بخش همان ماه (ترددهای پیش از ۴.۶ بی پیوند دوره)."""
    from django.db.models import Q
    from .models import VehicleTripLog
    q = Q(period_id=period.pk)
    if period.section_id:
        ym = (period.year_month or '').replace('-', '/')[:7]
        q |= Q(section_id=period.section_id, date_shamsi__startswith=ym)
    return VehicleTripLog.objects.filter(q, is_deleted=False)


def fleet_payable_trips(period):
    """ترددهای مشمول پرداخت: خودروی کرایه‌ای/ملکی راننده با تعداد مثبت (خودروی شرکتی تسویهٔ صفر نمی‌گیرد)."""
    return fleet_period_trips(period).filter(vehicle__ownership_type__in=FLEET_PAYABLE_OWNERSHIP, trip_count__gt=0)


def fleet_payable_total(period):
    """مبلغ گردش = جمع تعداد × نرخ ترددهای مشمول پرداخت (همان فرمول تسویه)."""
    from django.db.models import DecimalField, ExpressionWrapper, F, Sum
    expr = ExpressionWrapper(F('trip_count') * F('unit_rate'), output_field=DecimalField(max_digits=20, decimal_places=2))
    total = fleet_payable_trips(period).aggregate(s=Sum(expr))['s']
    return Decimal(str(total or 0))


def resolve_fleet_period(entity_id):
    from .models import MonthlyWorkPeriod
    period = MonthlyWorkPeriod.objects.select_related('section', 'section__project', 'company').filter(
        pk=entity_id).first()
    if period is not None:
        period.fleet_payable_total = fleet_payable_total(period)
    return period


def _fleet_summary(period):
    section = period.section.name if period.section_id and period.section else ''
    return {'title': f'کارکرد ماهانهٔ ناوگان {period.year_month}' + (f' — {section}' if section else ''),
            'category': section}


def _fleet_state_change(period, state, instance):
    from workflow.errors import WorkflowError
    from .models import MonthlyWorkPeriod
    from .workflow_engine import notify_document_changed
    # قفل ردیف دوره: نوشتن تردد (که همین قفل را می‌گیرد) با ارسال، عودت یا پرداخت هم‌زمان نمی‌شود
    MonthlyWorkPeriod.objects.select_for_update().filter(pk=period.pk).values_list('pk', flat=True).first()
    if state == COMPLETED:
        payment = getattr(period, '_wf_payment', None) or {}
        tracking_code = str(payment.get('tracking_code') or '').strip()
        if not tracking_code:
            raise WorkflowError('tracking_code_required',
                                'پرداخت ناوگان فقط از کارتابل خزانه با ثبت کد رهگیری بانکی انجام می‌شود.', 400)
        from .treasury_engine import TreasuryDisbursementService
        user = payment.get('user') or _last_closer(instance)
        period._wf_payment_result = TreasuryDisbursementService.settle_fleet_trips(
            fleet_payable_trips(period).filter(is_settled=False).values_list('id', flat=True), user, tracking_code,
            payment.get('batch_id') or f'FLEET-P{period.pk}')
    notify_document_changed(period)


def _fleet_steps():
    return (
        StepSpec('supervisor_ok', 'تأیید سرپرست', 'supervisor', FLEET_SUPERVISOR_PERM, APPROVE, actions=(ACT, RETURN)),
        # بررسی حسابدار هرگز رد نمی‌شود (ق۷)؛ گیت شبا با قلاب can_act:fleet_period
        StepSpec('accountant_review', 'بررسی حسابدار', 'accountant', FLEET_FINANCE_PERM, REVIEW,
                 actions=(ACT, RETURN)),
        # مدیر کارکرد ناوگان را رد نمی‌کند، فقط برای اصلاح عودت می‌دهد
        StepSpec('manager_ok', 'تأیید مدیر', 'manager', FLEET_MANAGER_PERM, APPROVE, actions=(ACT, RETURN)),
        # پرداخت فقط با کد رهگیری (کارتابل خزانه)؛ اقدام عمومی «کارهای من» بی کد 400 tracking_code_required
        StepSpec('treasury_pay', 'پرداخت خزانه‌دار', 'treasury', FLEET_TREASURY_PERM, EXECUTE, actions=(ACT, RETURN)),
    )


FLEET_PERIOD_WORKFLOW_SPEC = WorkflowSpec(
    key=FLEET_PERIOD_WORKFLOW,
    version=1,
    entity_kind=FLEET_PERIOD_ENTITY,
    title_fa='کارکرد ماهانهٔ ناوگان',
    steps=_fleet_steps(),
    on_state_change=_fleet_state_change,
    summary=_fleet_summary,
    route='/app/finance/employee-fleet?period={id}',
    section_field='section',
    company_field='company',
    amount_field='fleet_payable_total',
    view_permission=FLEET_VIEW_PERM,
)


def fleet_open_task(period_id):
    from workflow import engine
    return engine.open_task(FLEET_PERIOD_WORKFLOW, period_id)


def fleet_instance(period_id):
    from workflow import engine
    return engine.instance_of(FLEET_PERIOD_WORKFLOW, period_id)


def is_fleet_locked(period) -> bool:
    """د۵: کار باز ناوگان (از supervisor_ok به بعد)، گردش پرداخت‌شده، یا تردد تسویه‌شده در دوره."""
    from workflow.models import WorkflowInstance
    if period is None or not getattr(period, 'pk', None):
        return False
    instance = fleet_instance(period.pk)
    if instance is not None and (
            instance.status == WorkflowInstance.COMPLETED
            or (instance.status == WorkflowInstance.IN_PROGRESS and instance.current_step)):
        return True
    return fleet_period_trips(period).filter(is_settled=True).exists()


def fleet_manager_approved(period) -> bool:
    """تأیید مدیر گرفته؟ کار باز در treasury_pay یا گردش پایان‌یافته."""
    from workflow.models import WorkflowInstance
    instance = fleet_instance(period.pk) if period is not None else None
    if instance is None:
        return False
    return instance.status == WorkflowInstance.COMPLETED or (
        instance.status == WorkflowInstance.IN_PROGRESS and instance.current_step == 'treasury_pay')


def fleet_workflow_state(period) -> dict:
    """وضعیت گردش ناوگان برای پاسخ‌ها (فرانت ۴.۶-ج)."""
    instance = fleet_instance(period.pk) if period is not None and period.pk else None
    return {
        'fleet_period_id': period.pk if period is not None else None,
        'fleet_workflow_status': instance.status if instance is not None else None,
        'fleet_workflow_step': (instance.current_step or None) if instance is not None else None,
        'fleet_approved': fleet_manager_approved(period) if instance is not None else False,
        'fleet_locked': is_fleet_locked(period),
    }


def fleet_locked_error(message=None):
    from rest_framework.exceptions import ValidationError
    msg = message or FLEET_LOCKED_MESSAGE
    return ValidationError({'code': FLEET_LOCKED_CODE, 'error': msg, 'detail': msg})


def fleet_period_for_trip(section_id, date_shamsi, *, lock=False):
    """
    د۵: دورهٔ «بخش + ماه» تردد بخش‌دار (ساخته می‌شود اگر نباشد)؛ تردد بی بخش None (رفتار قدیمی انبار).
    lock=True (درون تراکنش): ردیف دوره قفل می‌شود تا نوشتن با ارسال یا پرداخت هم‌زمان نشود.
    """
    if not section_id:
        return None
    from common.date_utils import normalize_digits
    from .attendance_periods import get_or_create_period
    from .models import MonthlyWorkPeriod
    ym = normalize_digits(str(date_shamsi or '')).strip().replace('-', '/')[:7]
    period = get_or_create_period(None, section_id, ym)[0]
    if lock:
        period = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
    return period


def assert_fleet_trip_writable(section_id, date_shamsi, *, lock=True):
    """دورهٔ تردد بخش‌دار را برمی‌گرداند؛ دورهٔ قفل = ValidationError 400 fleet_locked (صف آفلاین: رد صریح)."""
    period = fleet_period_for_trip(section_id, date_shamsi, lock=lock)
    if period is not None and is_fleet_locked(period):
        raise fleet_locked_error()
    return period


def assert_existing_trip_writable(trip):
    """ترددی که هست: دورهٔ وصل‌شده یا دورهٔ بخش + ماهش نباید قفل باشد؛ تردد تسویه‌شده هرگز تغییر نمی‌کند."""
    if trip is None:
        return
    if trip.is_settled:
        raise fleet_locked_error()
    if trip.period_id and trip.period is not None and trip.period.section_id and is_fleet_locked(trip.period):
        raise fleet_locked_error()
    if trip.section_id:
        assert_fleet_trip_writable(trip.section_id, trip.date_shamsi, lock=True)


def fleet_period_company_id(entity_id):
    return attendance_period_company_id(entity_id)


def can_view_fleet_period(user, entity_id):
    """دیدن سند گردش ناوگان: شرکت مجاز و یکی از مجوزهای ناوگان در بخش دوره؛ بیرون از آن بی‌نظر."""
    from companies.access import get_user_allowed_companies
    from .lifecycle_services import user_has_any_perm
    from .models import MonthlyWorkPeriod
    period = MonthlyWorkPeriod.objects.filter(pk=entity_id).first()
    if period is None or not getattr(user, 'is_authenticated', False):
        return None
    if user.is_superuser:
        return True
    if period.company_id is None or not get_user_allowed_companies(user).filter(id=period.company_id).exists():
        return None
    return True if user_has_any_perm(user, FLEET_PERIOD_VIEW_PERMS, period) else None


def can_attach_fleet_period(user, entity_id):
    return can_view_fleet_period(user, entity_id)


def is_fleet_period_closed(entity_id):
    """گردش ناوگان پرداخت‌شده جابه‌جا نمی‌شود (قفل موتور)؛ قفل تردد (is_fleet_locked) جداست."""
    from workflow.models import WorkflowInstance
    instance = fleet_instance(entity_id)
    return instance is not None and instance.status == WorkflowInstance.COMPLETED


def fleet_missing_sheba_plates(period):
    """پلاک خودروهای کرایه‌ای دارای تردد در دوره که شبای معتبر (حساب اصلی فعال یا شبای خودرو) ندارند."""
    from django.db.models import Prefetch
    from .models import VehicleBankAccount, VehicleDriverProfile
    from .sheba_utils import validate_sheba
    vehicle_ids = fleet_payable_trips(period).values_list('vehicle_id', flat=True).distinct()
    vehicles = VehicleDriverProfile.objects.filter(id__in=vehicle_ids).prefetch_related(Prefetch(
        'bank_accounts', queryset=VehicleBankAccount.objects.filter(is_primary=True, is_active=True),
        to_attr='primary_accounts')).order_by('plate_number')
    plates = []
    for v in vehicles:
        primary = v.primary_accounts[0] if v.primary_accounts else None
        sheba = (primary.sheba_number if primary is not None and primary.sheba_number else v.sheba_number) or ''
        if not sheba or not validate_sheba(sheba)[0]:
            plates.append(v.plate_number)
    return plates


def can_act_fleet_period(user, period, task, action):
    """گیت بررسی حسابدار: هر خودروی کرایه‌ای دارای تردد شبای معتبر دارد؛ وگرنه action_blocked با پلاک‌ها."""
    if action != ACT or task.step_key != 'accountant_review':
        return None
    plates = fleet_missing_sheba_plates(period)
    if plates:
        return 'برای این خودروهای کرایه‌ای شبای معتبر ثبت نشده است: ' + '، '.join(plates)
    return None


def submit_fleet_period(user, period):
    """
    ارسال کارکرد ماهانهٔ ناوگان دوره به گردش (ثبت‌کنندهٔ تردد یا سرپرست؛ مجوز در بخش دوره). فقط دورهٔ بخش‌دار با
    دست‌کم یک تردد و بی کار باز ناوگان. خطا: WorkflowError.
    """
    from django.db import transaction
    from workflow import engine
    from workflow.errors import WorkflowError
    from .lifecycle_services import user_has_any_perm
    from .models import MonthlyWorkPeriod
    if period.company_id is None or not period.section_id:
        raise WorkflowError('invalid_state', 'کارکرد ناوگان فقط برای دورهٔ بخش‌دار به گردش می‌رود.', 400)
    if not user_has_any_perm(user, FLEET_SUBMIT_PERMS, period):
        raise WorkflowError('not_allowed', 'شما مجوز ارسال کارکرد ناوگان این بخش را ندارید.', 403)
    with transaction.atomic():
        locked = MonthlyWorkPeriod.objects.select_for_update().get(pk=period.pk)
        if not fleet_period_trips(locked).filter(trip_count__gt=0).exists():
            raise WorkflowError('no_fleet_trips', 'برای این بخش و ماه هیچ ترددی ثبت نشده است.', 400)
        if fleet_open_task(locked.pk) is not None:
            raise WorkflowError('already_in_progress', 'کارکرد ناوگان این دوره از قبل در گردش تأیید است.', 409)
        locked.fleet_payable_total = fleet_payable_total(locked)
        engine.submit(FLEET_PERIOD_WORKFLOW, locked, user)
    period.refresh_from_db()
    return period
