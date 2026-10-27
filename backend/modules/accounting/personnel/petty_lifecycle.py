# -*- coding: utf-8 -*-
"""
چرخهٔ عمر حساب تنخواه (د۵ تا د۹ طرح ۴.۲): تطبیق و قفل دوره، بستن، تحویل، جانشین و شمارهٔ صورت‌حساب.

- هیچ چیز حذف نمی‌شود: تطبیق تغییر نمی‌کند (اشتباه با تطبیق تازه)، بستن و تحویل با سند `refund`/`allocation`.
- اختلاف تطبیق: `difference = counted_cash − expected_cash`؛ منفی = کسری = بدهی (فرمول د۱).
- حساب بسته (`closed_at` پر) فقط خواندنی است و دوباره باز نمی‌شود.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from numbering.registry import NumberSeriesSpec

from .fiscal import fiscal_period_key
from .petty_settlements import SettlementError

PETTY_STATEMENT_SERIES_KEY = 'accounting.petty_statement'
PETTY_STATEMENT_NUMBER_SERIES = NumberSeriesSpec(
    key=PETTY_STATEMENT_SERIES_KEY, title_fa='صورت‌حساب تنخواه', default_template='{period}/ت/{seq}',
    period_key=fiscal_period_key, manage_perm='',
)

HANDOVER_REFUND_TITLE = 'تحویل به تنخواه‌گردان تازه'
HANDOVER_IN_TITLE = 'تحویل از تنخواه‌گردان پیشین'
CLOSE_REFUND_TITLE = 'عودت ماندهٔ تنخواه در بستن حساب'
# صورت‌حساب در جریان یا نگه‌دارندهٔ ردیف (لغوشده = پیش‌نویس با ردیف)
STATEMENT_OPEN_STATUSES = ('draft', 'submitted', 'approved')
EXPENSE_FINAL_STATUSES = ('approved', 'rejected')


class PettyLifecycleError(SettlementError):
    """همان شکل خطای تسویه: {code, error, detail} با وضعیت HTTP."""


def _err(code, message_fa, status=400):
    return PettyLifecycleError(code, message_fa, status)


def _audit(user, account, action_name, from_status='', to_status='', reason='', **metadata):
    from .models import WorkflowAuditLog
    WorkflowAuditLog.objects.create(
        content_type='pettycashaccount', object_id=account.pk,
        actor=user if getattr(user, 'is_authenticated', False) else None,
        from_status=from_status, to_status=to_status, action=action_name, reason=reason or '',
        metadata={'company_id': account.company_id, 'custodian_id': account.custodian_id, **metadata})


def _today():
    from .fiscal import to_shamsi_str
    return to_shamsi_str(timezone.now())


# ─── حساب بسته (د۶) ────────────────────────────────────────────────────────────────────────────────
def is_account_closed(account) -> bool:
    return account is not None and getattr(account, 'closed_at', None) is not None


def ensure_account_open(account):
    if is_account_closed(account):
        raise _err('account_closed', 'این حساب تنخواه بسته شده است و فقط خواندنی است.')


# ─── قفل دورهٔ تطبیق‌شده (د۵) ──────────────────────────────────────────────────────────────────────
def latest_period_end(account_id):
    from .models import PettyCashReconciliation
    if not account_id:
        return None
    return (PettyCashReconciliation.objects.filter(account_id=account_id)
            .order_by('-period_end_date', '-pk').values_list('period_end_date', flat=True).first())


def is_period_locked(account_id, day, tx_type='expense', cache=None) -> bool:
    """هزینه با تاریخی تا آخرین پایان دورهٔ تطبیق‌شدهٔ حساب قفل است. cache (dict) پرس‌وجو را در فهرست یک‌بار می‌کند."""
    from .fiscal import to_shamsi_str
    if tx_type != 'expense' or not account_id or not day:
        return False
    if cache is not None:
        if account_id not in cache:
            cache[account_id] = latest_period_end(account_id)
        last = cache[account_id]
    else:
        last = latest_period_end(account_id)
    day = to_shamsi_str(day)
    return bool(last and day and day <= last)


def ensure_period_unlocked(account_id, day, tx_type='expense'):
    if is_period_locked(account_id, day, tx_type):
        last = latest_period_end(account_id)
        raise _err('period_locked',
                   f'دورهٔ تنخواه تا تاریخ {last} تطبیق و بسته شده است؛ هزینه با تاریخ تا این روز ثبت یا ویرایش '
                   'نمی‌شود. تاریخ را درست کنید.')


# ─── کار در جریان ─────────────────────────────────────────────────────────────────────────────────
def _running_charge_ids():
    from workflow.models import WorkflowInstance
    from .workflows import PETTY_CHARGE_WORKFLOW
    return WorkflowInstance.objects.filter(workflow_key=PETTY_CHARGE_WORKFLOW,
                                           status=WorkflowInstance.IN_PROGRESS).values('entity_id')


def statements_in_flight(account):
    return account.statements.filter(status__in=STATEMENT_OPEN_STATUSES)


def charges_in_flight(account):
    return account.transactions.filter(transaction_type='allocation', pk__in=_running_charge_ids()) \
        .exclude(status__in=['approved', 'paid'])


def unsettled_expenses(account):
    """هزینهٔ ثبت‌شده بیرون از صورت‌حساب که هنوز تأیید یا رد نشده است."""
    return account.transactions.filter(transaction_type='expense', statement__isnull=True) \
        .exclude(status__in=EXPENSE_FINAL_STATUSES).exclude(line_status='rejected')


def ensure_no_work_in_flight(account, include_open_expenses=False):
    if statements_in_flight(account).exists() or charges_in_flight(account).exists() or (
            include_open_expenses and unsettled_expenses(account).exists()):
        msg = ('برای این حساب صورت‌حساب یا شارژ در جریان است' +
               (' یا هزینهٔ تسویه‌نشده بیرون از صورت‌حساب هست' if include_open_expenses else '') +
               '؛ اول آن‌ها را به پایان برسانید.')
        raise _err('work_in_flight', msg)


def expected_cash(account, period_end_date):
    """نقد مورد انتظار = سطح تنخواه − هزینه‌های در جریان (تأیید یا رد نشده) با تاریخ تا پایان دوره."""
    from .workflows import petty_fund_level
    in_flight = account.transactions.filter(transaction_type='expense', transaction_date_shamsi__lte=period_end_date) \
        .exclude(status__in=EXPENSE_FINAL_STATUSES).exclude(line_status='rejected') \
        .aggregate(s=Sum('amount'))['s'] or Decimal('0')
    return petty_fund_level(account) - in_flight


def _parse_amount(raw, field_fa):
    try:
        value = Decimal(str(raw).strip())
        if value < 0 or value != value.to_integral_value():
            raise ValueError
    except Exception:
        raise _err('invalid_amount', f'{field_fa} باید عددی صحیح و نامنفی باشد.')
    return value


def _lock(account):
    from .models import PettyCashAccount
    return PettyCashAccount.objects.select_for_update().get(pk=account.pk)


# ─── تطبیق (د۵) ─────────────────────────────────────────────────────────────────────────────────
def create_reconciliation(user, account, period_end_date, counted_cash, note=''):
    from .fiscal import to_shamsi_str
    from .models import PettyCashReconciliation
    day = to_shamsi_str(period_end_date) if period_end_date else None
    if not day:
        raise _err('invalid_date', 'تاریخ پایان دوره نامعتبر است.')
    counted = _parse_amount(counted_cash, 'نقد شمرده‌شده')
    with transaction.atomic():
        account = _lock(account)
        ensure_account_open(account)
        last = latest_period_end(account.pk)
        if last and day < last:
            raise _err('period_before_last', f'پایان دوره نمی‌تواند پیش از آخرین تطبیق ({last}) باشد.')
        ensure_no_work_in_flight(account)
        expected = expected_cash(account, day)
        row = PettyCashReconciliation.objects.create(
            account=account, company_id=account.company_id, period_end_date=day, expected_cash=expected,
            counted_cash=counted, difference=counted - expected, note=str(note or '').strip(), created_by=user)
        _audit(user, account, 'petty_reconciliation', str(int(expected)), str(int(counted)), reason=row.note,
               reconciliation_id=row.pk, period_end_date=day, difference=str(int(row.difference)))
    return row


# ─── بستن و تحویل (د۶ و د۷) ─────────────────────────────────────────────────────────────────────────
def _ensure_closable(account):
    from .petty_settlements import pending_settlement_total
    ensure_account_open(account)
    if account.debt_breakdown()['debt'] > 0:
        raise _err('debt_open', 'تنخواه‌گردان بدهی باز دارد؛ اول بدهی را تسویه کنید.')
    if pending_settlement_total(account) > 0:
        raise _err('settlement_pending', 'تسویهٔ در انتظار برای این حساب هست؛ اول آن را قطعی یا باطل کنید.')
    ensure_no_work_in_flight(account, include_open_expenses=True)


def _move_out(user, account, amount, title, reference):
    """سند عودت تأییدشده که سطح حساب را صفر می‌کند."""
    from .models import PettyCashTransaction
    from .expense_heads import PETTY_CASH_FIXED_CATEGORY
    return PettyCashTransaction.objects.create(
        account=account, custodian_id=account.custodian_id, created_by=user, transaction_type='refund',
        amount=amount, transaction_date_shamsi=_today(), title=title, category=PETTY_CASH_FIXED_CATEGORY['refund'],
        receipt_number=(reference or '')[:100] or None, status='approved')


def _close(user, account):
    account.is_active = False
    account.closed_at = timezone.now()
    account.closed_by = user if getattr(user, 'is_authenticated', False) else None
    account.save(update_fields=['is_active', 'closed_at', 'closed_by', 'updated_at'])


def close_account(user, account, reference='', note=''):
    from .fiscal import ensure_period_open
    from .workflows import petty_fund_level
    reference = str(reference or '').strip()
    with transaction.atomic():
        account = _lock(account)
        _ensure_closable(account)
        level = petty_fund_level(account)
        refund = None
        if level > 0:
            if not reference:
                raise _err('reference_required', 'حساب مانده دارد؛ شمارهٔ پیگیری عودت مانده الزامی است.')
            ensure_period_open(account.company_id, _today(), 'transaction_date_shamsi')
            refund = _move_out(user, account, level, CLOSE_REFUND_TITLE, reference)
        _close(user, account)
        _audit(user, account, 'petty_account_close', 'active', 'closed', reason=str(note or '').strip(),
               fund_level=str(int(level)), refund_id=refund.pk if refund else None, reference=reference)
    return account, refund


def handover_account(user, account, new_custodian, reference='', note=''):
    from companies.access import get_user_allowed_companies
    from .fiscal import ensure_period_open
    from .models import PettyCashAccount, PettyCashTransaction
    from .workflows import petty_allocation_category, petty_fund_level
    reference = str(reference or '').strip()
    if new_custodian is None or not new_custodian.is_active:
        raise _err('invalid_custodian', 'تنخواه‌گردان تازه پیدا نشد.')
    if new_custodian.pk == account.custodian_id:
        raise _err('invalid_custodian', 'تنخواه‌گردان تازه باید شخص دیگری باشد.')
    if not (new_custodian.is_superuser or
            get_user_allowed_companies(new_custodian).filter(id=account.company_id).exists()):
        raise _err('invalid_custodian', 'تنخواه‌گردان تازه باید عضو همین شرکت باشد.')
    with transaction.atomic():
        account = _lock(account)
        _ensure_closable(account)
        if PettyCashAccount.objects.filter(company_id=account.company_id, custodian=new_custodian,
                                           is_active=True).exists():
            raise _err('custodian_has_account', 'تنخواه‌گردان تازه در این شرکت از قبل حساب تنخواه فعال دارد.')
        level = petty_fund_level(account)
        if level > 0:
            ensure_period_open(account.company_id, _today(), 'transaction_date_shamsi')
        refund = _move_out(user, account, level, HANDOVER_REFUND_TITLE, reference) if level > 0 else None
        _close(user, account)
        new = PettyCashAccount.objects.create(
            company_id=account.company_id, custodian=new_custodian, ceiling_amount=account.ceiling_amount,
            opening_balance=0, handover_from=account)
        account.handover_to = new
        account.save(update_fields=['handover_to', 'updated_at'])
        incoming = None
        if level > 0:
            incoming = PettyCashTransaction.objects.create(
                account=new, custodian=new_custodian, created_by=user, transaction_type='allocation', amount=level,
                transaction_date_shamsi=_today(), title=HANDOVER_IN_TITLE,
                category=petty_allocation_category('handover_in'), source='handover_in',
                receipt_number=reference[:100] or None, status='approved')
        meta = dict(fund_level=str(int(level)), refund_id=refund.pk if refund else None,
                    allocation_id=incoming.pk if incoming else None, reference=reference)
        _audit(user, account, 'petty_account_handover', 'active', 'closed', reason=str(note or '').strip(),
               to_account_id=new.pk, new_custodian_id=new_custodian.pk, **meta)
        _audit(user, new, 'petty_account_handover_in', '', 'active', reason=str(note or '').strip(),
               from_account_id=account.pk, previous_custodian_id=account.custodian_id, **meta)
    return account, new


# ─── جانشین (د۸) ─────────────────────────────────────────────────────────────────────────────────
def _active_substitutions(user, today=None):
    from workflow.models import WorkflowSubstitute
    if user is None or not getattr(user, 'is_authenticated', False):
        return WorkflowSubstitute.objects.none()
    today = today or timezone.localdate()
    return WorkflowSubstitute.objects.filter(substitute=user, revoked_at__isnull=True, start_date__lte=today,
                                             end_date__gte=today)


def deputy_rows(user):
    """(principal_id, company_id یا None) جانشینی‌های فعال امروز این کاربر."""
    return list(_active_substitutions(user).values_list('principal_id', 'company_id'))


def deputy_account_q(user, prefix='', rows=None):
    """Q روی حساب‌هایی که کاربر امروز جانشین صاحبشان است (شرکت جانشینی یا همه)؛ بی جانشینی = Q تهی‌ناپذیر."""
    rows = deputy_rows(user) if rows is None else rows
    q = Q(pk__in=[])
    for principal_id, company_id in rows:
        part = Q(**{f'{prefix}custodian_id': principal_id})
        if company_id:
            part &= Q(**{f'{prefix}company_id': company_id})
        q |= part
    return q


def is_petty_deputy(user, account) -> bool:
    """جانشین فعال تنخواه‌گردان این حساب در شرکت آن (و عضو همان شرکت)."""
    from .workflows import petty_company_allowed
    if account is None or user is None or account.custodian_id == getattr(user, 'pk', None):
        return False
    if not petty_company_allowed(user, account.company_id):
        return False
    return _active_substitutions(user).filter(principal_id=account.custodian_id).filter(
        Q(company__isnull=True) | Q(company_id=account.company_id)).exists()


# ─── شمارهٔ صورت‌حساب (د۹) ─────────────────────────────────────────────────────────────────────────
def ensure_statement_number(statement, user):
    """شمارهٔ ۲.۸ در اولین ارسال (داخل تراکنش ارسال)؛ شمارهٔ موجود هرگز عوض نمی‌شود."""
    if statement.issued_number_id:
        return statement.issued_number
    from numbering.services import allocate
    from .workflows import PETTY_STATEMENT_ENTITY
    issued = allocate(statement.company_id, PETTY_STATEMENT_SERIES_KEY, PETTY_STATEMENT_ENTITY, statement.pk,
                      user=user)
    statement.issued_number = issued
    statement.document_number = issued.display
    statement.save(update_fields=['issued_number', 'document_number', 'updated_at'])
    return issued
