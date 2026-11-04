"""
طرف‌های بیرونی نامه (ن۹، ن۱۶): لایهٔ نازک روی سرویس هستهٔ `contacts`؛ ساخت و یکسان‌سازی فقط از آن‌جاست.
کد ملی شخص حقیقی برای کسی که مجوز دبیرخانهٔ همان شرکت را ندارد پوشیده است (ق۱۶).
"""
from django.db.models import Q

from contacts.models import ExternalParty
from contacts.services import create_party, find_party, national_id_error, normalize_party_data

from .access import COMPOSE_PERM, HUB_PERM, SECRETARIAT_PERM, has_company_perm, member_company_ids

MAX_RESULTS = 50


def parties_for(user, company_id, query=''):
    """طرف‌های فعال همان شرکت (فقط اگر کاربر عضو آن است)، با جست‌وجوی نام یا شناسه.

    جست‌وجو با کد ملی شخص حقیقی فقط برای کسی که آن را می‌بیند؛ وگرنه با پیشوند حرف‌به‌حرف لو می‌رفت (ق۱۶).
    """
    if not company_id or company_id not in member_company_ids(user) and not getattr(user, 'is_superuser', False):
        return ExternalParty.objects.none()
    # همان طرف‌های حسابداری‌اند: فقط کاربر نامه‌های همان شرکت فهرست را می‌بیند (ل-ط)
    if not any(has_company_perm(user, company_id, code) for code in (HUB_PERM, COMPOSE_PERM, SECRETARIAT_PERM)):
        return ExternalParty.objects.none()
    qs = ExternalParty.objects.filter(company_id=company_id, is_active=True)
    query = str(query or '').strip()
    if query:
        by_id = Q(national_id__startswith=query)
        if not has_company_perm(user, company_id, SECRETARIAT_PERM):
            by_id &= Q(kind=ExternalParty.KIND_LEGAL)
        qs = qs.filter(Q(name__icontains=query) | by_id | Q(economic_code=query))
    return qs.order_by('name', 'id')[:MAX_RESULTS]


def party_payload(user, party) -> dict:
    secretariat = has_company_perm(user, party.company_id, SECRETARIAT_PERM)
    show_id = party.kind == ExternalParty.KIND_LEGAL or secretariat
    # تلفن، رایانامه و نشانی فقط برای نگارنده و دبیرخانه (ل-ط)
    show_contact = secretariat or has_company_perm(user, party.company_id, COMPOSE_PERM)
    return {
        'id': party.pk, 'company': party.company_id, 'kind': party.kind, 'name': party.name,
        'national_id': party.national_id if show_id else ('••••' if party.national_id else None),
        'economic_code': party.economic_code,
        'phone': party.phone if show_contact else '', 'email': party.email if show_contact else '',
        'address': party.address if show_contact else '',
    }


def can_create_party(user, company_id) -> bool:
    return (company_id in member_company_ids(user)
            and (has_company_perm(user, company_id, COMPOSE_PERM) or has_company_perm(user, company_id, SECRETARIAT_PERM)))


def get_or_create_party(user, company_id, data):
    """(party, created) یا ValueError. طرفی با همان شناسهٔ ملی در همان شرکت دوباره ساخته نمی‌شود."""
    fields = normalize_party_data(data or {})
    if not fields.get('name'):
        raise ValueError('نام طرف بیرونی لازم است.')
    if len(fields['name']) > 200:
        raise ValueError('نام طرف بیرونی بیش از اندازه است.')
    error = national_id_error(fields.get('kind'), fields.get('national_id'))
    if error:
        raise ValueError(error)
    existing = find_party(company_id, fields.get('national_id'))
    if existing is not None:
        return existing, False
    fields['is_active'] = True
    return create_party(company_id, fields, user=user), True
