"""
موجودی اولیهٔ حساب بانکی شرکت (طرح ۳.۳، ص۳ تا ص۶): گردش حساب، سطح دید و ثبت سابقه.
"""
from accounts.audit_utils import log_audit_event

from .company_section_gates import company_section_allows

# رابطه‌هایی که گردش حساب نیستند (سابقهٔ خود موجودی اولیه)
_NOT_MOVEMENTS = {'opening_balance_changes'}


def bank_account_has_movements(account):
    """آیا ردیفی در مدل دیگری به این حساب وصل است (ص۴)؛ امروز هیچ مدلی وصل نیست، پس False."""
    for rel in account._meta.related_objects:
        if not (rel.one_to_many or rel.one_to_one):
            continue
        if rel.get_accessor_name() in _NOT_MOVEMENTS:
            continue
        if rel.related_model._default_manager.filter(**{rel.field.name: account.pk}).exists():
            return True
    return False


def can_see_opening_balance(user, company_id):
    """رقم موجودی اولیه فقط برای مدیر کل و دارندهٔ سطح خواندن `bank` است (ص۶، ق۱۶)؛ عضو ساده نه."""
    if user is None or not getattr(user, 'is_authenticated', False) or not company_id:
        return False
    return company_section_allows(user, company_id, 'bank', 'read')


def opening_state(amount, date):
    return {'opening_balance': None if amount is None else str(amount), 'opening_balance_date': date}


def record_opening_change(account, old_amount, old_date, user, reason='', had_movements=False):
    """یک ردیف سابقه و یک رویداد ممیزی برای ثبت (old خالی) یا تغییر موجودی اولیه (ص۵)."""
    from .models import CompanyBankOpeningBalanceChange
    first = old_amount is None and old_date is None
    row = CompanyBankOpeningBalanceChange.objects.create(
        account=account, old_amount=old_amount, old_date=old_date,
        new_amount=account.opening_balance, new_date=account.opening_balance_date,
        reason=reason or '', had_movements=had_movements,
        changed_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    log_audit_event(
        module='treasury',
        action='bank_opening_balance_set' if first else 'bank_opening_balance_changed',
        target_model='CompanyBankAccount', target_object_id=account.pk,
        target_repr=f'{account.bank_name} ({account.sheba_number})', user=user,
        company_id=account.company_id,
        before_state=None if first else opening_state(old_amount, old_date),
        after_state=opening_state(account.opening_balance, account.opening_balance_date),
        details={'reason': reason, 'had_movements': had_movements} if (reason or had_movements) else None,
    )
    return row
