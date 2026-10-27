"""
طرف‌حساب مالی روی طرف بیرونی هسته (ص۲ تا ص۶ طرح ۳.۱): ساخت با تکرار امن، ویرایش، حساب بانکی اصلی،
حذف یا غیرفعال کردن، قاعدهٔ دیدن دادهٔ حساس و سابقه. viewset، اکسل و نگهبان بخش از همین استفاده می‌کنند.
"""
from django.db import transaction
from django.db.models import ProtectedError

from accounts.audit_utils import log_audit_event
from accounts.scoped_permissions import sections_where
from contacts.models import ExternalParty
from contacts.services import create_party, find_party, update_party

from .models import Counterparty, ExpenseInvoice, PartyBankAccount, PettyCashTransaction, primary_party_bank_account
from .permissions import COUNTERPARTY_MANAGE_PERM, has_structure_write_permission

AUDIT_MODULE = 'invoices'
ROLE_FIELDS = ('counterparty_type', 'account_code', 'is_active')
BANK_FIELDS = ('bank_name', 'account_number', 'sheba_number', 'card_number', 'owner_name', 'is_primary', 'is_active')
# دید کامل دادهٔ حساس در بخش‌های همان شرکت (ص۳ طرح ۳.۵: همان مجوز نوشتن طرف حساب)
FULL_VIEW_SECTION_PERMS = (COUNTERPARTY_MANAGE_PERM,)


# ─── پوشش دادهٔ حساس (ص۴) ─────────────────────────────────────────────────────

def is_masked(value):
    return value is not None and '*' in str(value)


def mask_tail(value, keep=4):
    """همه جز چهار رقم آخر ستاره؛ خالی همان خالی."""
    if not value:
        return value
    text = str(value)
    if len(text) <= keep:
        return '*' * len(text)
    return '*' * (len(text) - keep) + text[-keep:]


def can_view_sensitive(user, party, cache=None):
    """
    شبا، شماره‌حساب، کارت و کد ملی حقیقی کامل (ص۴): مدیر کل سامانه، نویسندهٔ ساختار سازمانی، ثبت‌کنندهٔ طرف،
    یا کسی که در بخشی از همان شرکت یکی از FULL_VIEW_SECTION_PERMS را دارد (مجوز در شرکت دیگر بس نیست). cache (dict) پرس‌وجو را در فهرست یک‌بار می‌کند.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or (party.created_by_id and party.created_by_id == user.id):
        return True
    cache = {} if cache is None else cache
    if 'manager' not in cache:
        cache['manager'] = has_structure_write_permission(user)
    if cache['manager']:
        return True
    key = ('company', party.company_id)
    if key not in cache:
        cache[key] = any(
            sections_where(user, code).filter(project__company_id=party.company_id).exists()
            for code in FULL_VIEW_SECTION_PERMS
        )
    return cache[key]


# ─── سابقه (ص۶) ───────────────────────────────────────────────────────────────

def counterparty_snapshot(cp):
    party = cp.party
    data = {f: getattr(party, f) for f in ('kind', 'name', 'national_id', 'economic_code', 'registration_number',
                                           'phone', 'mobile', 'email', 'address', 'postal_code')}
    data.update({f: getattr(cp, f) for f in ROLE_FIELDS})
    data['company_id'] = party.company_id
    if party.kind == ExternalParty.KIND_PERSON:
        data['national_id'] = mask_tail(party.national_id)  # ق۱۶: کد ملی شخص حقیقی در سابقه هم پوشیده
    return data


def bank_snapshot(account):
    data = {f: getattr(account, f) for f in BANK_FIELDS}
    data['party_id'] = account.party_id
    return data


def _audit(action, model, obj_id, label, company_id, user, before=None, after=None, details=None):
    log_audit_event(module=AUDIT_MODULE, action=action, severity='warning' if action == 'DELETE' else 'info',
                    target_model=model, target_object_id=obj_id,
                    target_repr=label, user=user, company_id=company_id,
                    before_state=before, after_state=after, details=details)


def audit_counterparty(action, cp, user, before=None, after=None, details=None):
    _audit(action, 'Counterparty', cp.pk, cp.party.name, cp.party.company_id, user, before, after, details)


def audit_bank_account(action, account, user, before=None, after=None):
    party = account.party
    _audit(action, 'PartyBankAccount', account.pk, party.name, party.company_id, user, before, after)


# ─── حساب بانکی ──────────────────────────────────────────────────────────────

def create_bank_account(party, data, user=None):
    account = PartyBankAccount(party=party, **{k: v for k, v in data.items() if k in BANK_FIELDS})
    account.save()
    audit_bank_account('CREATE', account, user, after=bank_snapshot(account))
    return account


def update_bank_account(account, data, user=None):
    before = bank_snapshot(account)
    for key, value in data.items():
        if key in BANK_FIELDS:
            setattr(account, key, value)
    account.save()
    audit_bank_account('UPDATE', account, user, before=before, after=bank_snapshot(account))
    return account


def delete_bank_account(account, user=None):
    """حساب به‌کاررفته در قسط فاکتور (د۵ طرح ۴.۱) حذف نمی‌شود، فقط غیرفعال می‌شود (FK آن PROTECT است)."""
    before = bank_snapshot(account)
    if account.invoice_payments.exists():
        was_primary = account.is_primary
        account.is_active = False
        account.is_primary = False
        account.save(update_fields=['is_active', 'is_primary', 'updated_at'])
        audit_bank_account('UPDATE', account, user, before=before, after=bank_snapshot(account))
        if was_primary:
            replacement = (PartyBankAccount.objects.filter(party_id=account.party_id, is_active=True)
                           .exclude(pk=account.pk).order_by('-created_at').first())
            if replacement is not None:
                replacement.is_primary = True
                replacement.save()
        return
    audit_bank_account('DELETE', account, user, before=before)
    account.delete()


def upsert_primary_bank(party, data, user=None):
    """فیلدهای تخت قدیمی (bank_name، account_number، sheba_number) روی حساب اصلی؛ بی حساب اصلی و با شبا، حساب تازه."""
    # مقدار خالی، شبا یا حساب واقعی را پاک نمی‌کند (data-loss-reviewer)؛ حذف حساب فقط از مسیر حساب بانکی
    data = {k: v for k, v in data.items() if k in ('bank_name', 'account_number', 'sheba_number') and v}
    if not data:
        return None
    primary = primary_party_bank_account(party)
    if primary is not None:
        return update_bank_account(primary, data, user)
    if not data.get('sheba_number'):
        return None
    return create_bank_account(party, {**data, 'is_primary': True}, user)


# ─── طرف حساب ────────────────────────────────────────────────────────────────

@transaction.atomic
def create_counterparty(company_id, party_data, role_data, bank_rows=(), user=None, details=None):
    """
    ساخت با تکرار امن (ص۵): طرفِ همان شرکت با همان شناسهٔ ملی دوباره ساخته نمی‌شود. اگر نقش مالی دارد،
    همان با existing=True برمی‌گردد (درخواست تکراری صف)؛ وگرنه نقش روی همان طرف ساخته می‌شود.
    خروجی: (counterparty, existing).
    """
    party = find_party(company_id, party_data.get('national_id'))
    if party is not None:
        party = ExternalParty.objects.select_for_update().get(pk=party.pk)
        existing = Counterparty.objects.filter(party=party).first()
        if existing is not None:
            return existing, True
    else:
        party = create_party(company_id, party_data, user)
    cp = Counterparty.objects.create(party=party, created_by=user, **{k: v for k, v in role_data.items() if k in ROLE_FIELDS})
    audit_counterparty('CREATE', cp, user, after=counterparty_snapshot(cp), details=details)
    seen = set(party.bank_accounts.values_list('sheba_number', flat=True))
    for row in bank_rows:
        sheba = row.get('sheba_number')
        if sheba and sheba not in seen:  # شبای تکراری ردیف دوم نمی‌سازد (IntegrityError و گیر کردن صف)
            seen.add(sheba)
            create_bank_account(party, row, user)
    return cp, False


@transaction.atomic
def update_counterparty(cp, party_data, role_data, flat_bank=None, user=None):
    before = counterparty_snapshot(cp)
    if party_data:
        update_party(cp.party, party_data, user)
    fields = [k for k in role_data if k in ROLE_FIELDS]
    for key in fields:
        setattr(cp, key, role_data[key])
    if fields:
        cp.save(update_fields=[*fields, 'updated_at'])
    if flat_bank:
        upsert_primary_bank(cp.party, flat_bank, user)
    after = counterparty_snapshot(cp)
    deactivated = before['is_active'] and not after['is_active']
    audit_counterparty('UPDATE', cp, user, before=before, after=after,
                       details={'change': 'deactivate'} if deactivated else None)
    return cp


def counterparty_in_use(cp):
    return (ExpenseInvoice.objects.filter(counterparty=cp).exists()
            or PettyCashTransaction.objects.filter(counterparty=cp).exists())


@transaction.atomic
def remove_counterparty(cp, user=None):
    """
    حذف (ص۵): اگر فاکتور یا تراکنش تنخواه به آن وصل است فقط غیرفعال می‌شود ('deactivated')؛ وگرنه طرف حساب،
    حساب‌های بانکی و طرف بیرونی‌اش (اگر نقش دیگری ندارد) پاک می‌شوند ('deleted').
    """
    cp = Counterparty.objects.select_for_update().select_related('party').get(pk=cp.pk)
    before = counterparty_snapshot(cp)
    if counterparty_in_use(cp):
        if cp.is_active:
            cp.is_active = False
            cp.save(update_fields=['is_active', 'updated_at'])
        audit_counterparty('UPDATE', cp, user, before=before, after=counterparty_snapshot(cp),
                           details={'change': 'deactivate', 'reason': 'in_use'})
        return 'deactivated'
    party = cp.party
    audit_counterparty('DELETE', cp, user, before=before)
    cp.delete()
    try:
        with transaction.atomic():
            for account in list(party.bank_accounts.all()):
                delete_bank_account(account, user)
            party.delete()
    except ProtectedError:
        pass  # ماژول دیگری هم به این طرف وصل است؛ طرف و حساب‌هایش می‌مانند
    return 'deleted'
