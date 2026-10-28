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
