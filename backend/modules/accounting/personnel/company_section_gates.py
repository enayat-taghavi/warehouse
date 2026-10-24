"""
دروازه‌های بخش‌های شرکتِ ماژول حسابداری (طرح مجوزهای بخش‌به‌بخش شرکت، گام ۹).
بر پایهٔ API هسته (`companies.access`)؛ عضو بودن برای فهرست‌های انتخابی بانک و دوره خواندن کافی است (ت۱۱).
"""
from rest_framework.exceptions import PermissionDenied

from companies.access import (  # noqa: F401  (بازصادر برای viewها)
    company_section_level,
    companies_with_section,
    get_user_allowed_companies,
)


def section_or_member_company_ids(user, section, members_read=False):
    ids = set(companies_with_section(user, section, 'read').values_list('id', flat=True))
    if members_read:
        ids |= set(get_user_allowed_companies(user).values_list('id', flat=True))
    return ids


def company_section_allows(user, company_id, section, level='read'):
    """آیا کاربر سطح لازم بخش شرکت را دارد (ابرکاربر همیشه)؛ برخلاف ensure_company_section خطا نمی‌دهد."""
    if user.is_superuser:
        return True
    have = company_section_level(user, company_id, section)
    return have == 'write' if level == 'write' else have in ('read', 'write')


def ensure_company_section(user, company_id, section, level='read', members_read=False):
    """شناسهٔ عددی شرکت را برمی‌گرداند یا PermissionDenied فارسی می‌دهد."""
    try:
        cid = int(company_id)
    except (TypeError, ValueError):
        # شناسهٔ نامعتبر هرگز به فهرست بی‌فیلتر نمی‌رسد (یافتهٔ tenant-scope-reviewer گام ۹)
        raise PermissionDenied("شناسهٔ شرکت نامعتبر است.")
    if user.is_superuser:
        return cid
    have = company_section_level(user, cid, section)
    ok = have == 'write' if level == 'write' else have in ('read', 'write')
    if not ok and level == 'read' and members_read:
        ok = get_user_allowed_companies(user).filter(id=cid).exists()
    if not ok:
        raise PermissionDenied("شما برای این بخش از اطلاعات شرکت مجوز لازم را ندارید.")
    return cid


def ensure_company_unchanged(serializer):
    """رکورد شرکتی با ویرایش به شرکت دیگر منتقل نمی‌شود (یافتهٔ tenant-scope-reviewer گام ۹)."""
    new_company = serializer.validated_data.get('company')
    if new_company is not None and new_company.id != serializer.instance.company_id:
        raise PermissionDenied("انتقال این رکورد به شرکت دیگر ممکن نیست.")
