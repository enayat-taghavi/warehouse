# -*- coding: utf-8 -*-
"""
تسویهٔ بدهی تنخواه‌گردان (د۴ طرح ۴.۲): نقدی، کسر از شارژ بعدی، کسر از حقوق.

- هیچ ردیفی حذف نمی‌شود؛ اشتباه با ابطال (`void`) درست می‌شود.
- فقط تسویهٔ `done` بدهی را کم می‌کند؛ `pending` فقط جای بدهی را برای تسویهٔ بعدی می‌گیرد.
- کسر از حقوق فقط وقتی پذیرفته می‌شود که گیرندهٔ رجیستری `petty_cash_payroll_deduction` ثبت شده باشد (۴.۵)؛
  ۴.۵ با `pending_payroll_deductions` و `confirm_payroll_deduction` آن را قطعی می‌کند.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

PAYROLL_DEDUCTION_POINT = 'petty_cash_payroll_deduction'
SETTLEMENT_METHODS = ('cash', 'charge_offset', 'payroll')


class SettlementError(Exception):
    """خطای تسویه با کد ثابت برای کلاینت (همان شکل پاسخ خطای تنخواه)."""

    def __init__(self, code, message_fa, status=400):
        super().__init__(message_fa)
        self.code = code
        self.message_fa = message_fa
        self.status = status


def payroll_deduction_available() -> bool:
    from platform_core.registry import contributions
    return bool(contributions(PAYROLL_DEDUCTION_POINT))


def pending_settlement_total(account, exclude_pk=None):
    from .models import PettyCashDebtSettlement
    qs = PettyCashDebtSettlement.objects.filter(account=account, status='pending')
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return qs.aggregate(s=Sum('amount'))['s'] or Decimal('0')


def settleable_debt(account):
    """بدهی بازی که هنوز تسویهٔ در انتظار ندارد (سقف مبلغ تسویهٔ تازه)."""
    return max(account.debt_breakdown()['debt'] - pending_settlement_total(account), Decimal('0'))


def _audit(user, settlement, action_name, from_status='', to_status='', reason='', **metadata):
    from .models import WorkflowAuditLog
    WorkflowAuditLog.objects.create(
        content_type='pettycashdebtsettlement', object_id=settlement.pk,
        actor=user if getattr(user, 'is_authenticated', False) else None,
        from_status=from_status, to_status=to_status, action=action_name, reason=reason or '',
        metadata={'company_id': settlement.company_id, 'account_id': settlement.account_id,
                  'amount': str(int(settlement.amount)), 'method': settlement.method, **metadata})


def charge_open_for_offset(charge, account):
    """شارژ در جریان همین حساب (هنوز واریز نشده): allocation پیش‌نویس با گردش در جریان."""
    from workflow.models import WorkflowInstance
    from .workflows import PETTY_CHARGE_WORKFLOW
    if charge is None or charge.account_id != account.pk or charge.transaction_type != 'allocation':
        return False
    if charge.status != 'draft':
        return False
    return WorkflowInstance.objects.filter(workflow_key=PETTY_CHARGE_WORKFLOW, entity_id=charge.pk,
                                           status=WorkflowInstance.IN_PROGRESS).exists()


def create_settlement(user, account, amount, method, reference='', charge=None, note=''):
    """ثبت تسویه؛ مجوز (حسابدار شرکت) را ویو می‌سنجد. خطا: SettlementError."""
    from .models import PettyCashAccount, PettyCashDebtSettlement, PettyCashTransaction
    if method not in SETTLEMENT_METHODS:
        raise SettlementError('invalid_method', 'روش تسویه نامعتبر است.')
    try:
        amount = Decimal(str(amount))
        if amount <= 0 or amount != amount.to_integral_value():
            raise ValueError()
    except Exception:
        raise SettlementError('invalid_amount', 'مبلغ تسویه باید عددی صحیح و مثبت باشد.')
    reference = str(reference or '').strip()[:100]
    note = str(note or '').strip()
    if method == 'cash' and not reference:
        raise SettlementError('reference_required', 'برای تسویهٔ نقدی شمارهٔ پیگیری واریز الزامی است.')
    if method == 'payroll' and not payroll_deduction_available():
        raise SettlementError('payroll_not_available', 'کسر از حقوق هنوز در دسترس نیست.')
    with transaction.atomic():
        # قفل حساب: دو تسویهٔ هم‌زمان از بدهی باز بیشتر نشوند
        account = PettyCashAccount.objects.select_for_update().order_by().get(pk=account.pk)
        if amount > settleable_debt(account):
            raise SettlementError('amount_exceeds_debt', 'مبلغ تسویه از بدهی باز تنخواه‌گردان بیشتر است.')
        if method == 'charge_offset':
            charge_id = getattr(charge, 'pk', charge)
            charge = PettyCashTransaction.objects.select_for_update().filter(pk=charge_id).first() \
                if charge_id else None
            if not charge_open_for_offset(charge, account):
                raise SettlementError('charge_not_open', 'کسر فقط از شارژ در جریان (پیش از واریز) همین حساب ممکن است.')
            offsets = PettyCashDebtSettlement.objects.filter(
                charge=charge, method='charge_offset', status__in=['pending', 'done']).aggregate(s=Sum('amount'))['s']
            if (offsets or Decimal('0')) + amount > charge.amount:
                raise SettlementError('offset_exceeds_charge', 'جمع کسرها از مبلغ این شارژ بیشتر می‌شود.')
        else:
            charge = None
        done = method == 'cash'
        settlement = PettyCashDebtSettlement.objects.create(
            account=account, company_id=account.company_id, amount=amount, method=method,
            status='done' if done else 'pending', reference=reference, charge=charge, note=note,
            created_by=user if getattr(user, 'is_authenticated', False) else None,
            done_at=timezone.now() if done else None,
        )
        _audit(user, settlement, 'petty_settlement_create', '', settlement.status,
               reference=reference, charge_id=getattr(charge, 'pk', None))
    return settlement


def void_settlement(user, settlement, reason):
    """ابطال: فقط در انتظار، یا نقدیِ قطعی؛ با دلیل."""
    from .models import PettyCashDebtSettlement
    reason = str(reason or '').strip()
    if not reason:
        raise SettlementError('reason_required', 'درج دلیل ابطال الزامی است.')
    with transaction.atomic():
        settlement = PettyCashDebtSettlement.objects.select_for_update().get(pk=settlement.pk)
        voidable = settlement.status == 'pending' or (settlement.status == 'done' and settlement.method == 'cash')
        if not voidable:
            raise SettlementError('not_voidable', 'این تسویه قابل ابطال نیست.', 409)
        previous = settlement.status
        settlement.status = 'void'
        settlement.voided_by = user if getattr(user, 'is_authenticated', False) else None
        settlement.void_reason = reason
        settlement.save(update_fields=['status', 'voided_by', 'void_reason', 'updated_at'])
        _audit(user, settlement, 'petty_settlement_void', previous, 'void', reason=reason)
    return settlement


def complete_charge_offsets(charge, user=None):
    """با واریز شارژ، کسرهای در انتظار آن قطعی می‌شوند (در تراکنش واریز صدا زده می‌شود)."""
    from .models import PettyCashDebtSettlement
    now = timezone.now()
    rows = list(PettyCashDebtSettlement.objects.select_for_update().filter(
        charge=charge, method='charge_offset', status='pending'))
    for row in rows:
        row.status = 'done'
        row.done_at = now
        row.save(update_fields=['status', 'done_at', 'updated_at'])
        _audit(user, row, 'petty_settlement_done', 'pending', 'done', charge_id=charge.pk)
    return rows


# ─── برای ۴.۵ (حقوق) ─────────────────────────────────────────────────────────────────────────────
def pending_payroll_deductions(company_id, user_id):
    """کسرهای حقوقی در انتظارِ تنخواه‌گردان در یک شرکت (برای ساختن ردیف کسورات حقوق ۴.۵)."""
    from .models import PettyCashDebtSettlement
    return list(PettyCashDebtSettlement.objects.filter(
        company_id=company_id, account__custodian_id=user_id, method='payroll', status='pending',
    ).order_by('created_at', 'id').values('id', 'account_id', 'amount', 'note', 'created_at'))


def pending_payroll_deductions_bulk(company_id, user_ids, lock=False):
    """همان pending_payroll_deductions برای چند کاربر با یک پرس‌وجو: {user_id: [ردیف‌ها به ترتیب ثبت]}."""
    from .models import PettyCashDebtSettlement
    user_ids = [u for u in set(user_ids or ()) if u]
    if not company_id or not user_ids:
        return {}
    out = {}
    qs = PettyCashDebtSettlement.objects.filter(
        company_id=company_id, account__custodian_id__in=user_ids, method='payroll', status='pending',
    ).order_by('created_at', 'id')
    if lock:  # inside the caller's transaction.atomic(); of=('self',) keeps the join rows unlocked
        qs = qs.select_for_update(of=('self',))
    for row in qs.values('id', 'account__custodian_id', 'amount'):
        out.setdefault(row['account__custodian_id'], []).append({'id': row['id'], 'amount': row['amount']})
    return out


def confirm_payroll_deduction(settlement_id, payroll_ref, user=None):
    """حقوق آن ماه کسر را با payroll_ref قطعی می‌کند. خطا: SettlementError."""
    from .models import PettyCashDebtSettlement
    payroll_ref = str(payroll_ref or '').strip()[:100]
    if not payroll_ref:
        raise SettlementError('payroll_ref_required', 'مرجع حقوق الزامی است.')
    with transaction.atomic():
        settlement = PettyCashDebtSettlement.objects.select_for_update().filter(pk=settlement_id).first()
        if settlement is None or settlement.method != 'payroll':
            raise SettlementError('not_found', 'تسویهٔ حقوقی پیدا نشد.', 404)
        if settlement.status != 'pending':
            raise SettlementError('not_pending', 'این کسر حقوقی در انتظار نیست.', 409)
        settlement.status = 'done'
        settlement.payroll_ref = payroll_ref
        settlement.done_at = timezone.now()
        settlement.save(update_fields=['status', 'payroll_ref', 'done_at', 'updated_at'])
        _audit(user, settlement, 'petty_settlement_done', 'pending', 'done', payroll_ref=payroll_ref)
    return settlement
