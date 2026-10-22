"""
قواعد دسترسی کاربر به شرکت‌ها (هستهٔ چندمستأجری).

عضویت فقط از superuser و منبع‌های خودکار (`register_derived_company_source`) می‌آید؛ مثلاً
هسته انتساب فعال در بخش‌های پروژه‌های یک شرکت را عضویت در آن شرکت حساب می‌کند (`org_membership`).
ردیف UserCompanyAccess «پیوند کاربر با شرکت» است و سطح هر بخش را در `section_levels` نگه می‌دارد.
"""
from rest_framework.exceptions import PermissionDenied

from .models import Company, UserCompanyAccess


_DERIVED_COMPANY_SOURCES = []


def register_derived_company_source(source):
    """
    ثبت منبع دسترسی مشتق. `source(user)` مجموعهٔ شناسهٔ شرکت‌هایی را برمی‌گرداند که کاربر
    از راه آن ماژول در آن‌ها دسترسی workspace_full دارد. ثبت تکراری نادیده گرفته می‌شود.
    """
    if source not in _DERIVED_COMPANY_SOURCES:
        _DERIVED_COMPANY_SOURCES.append(source)


_SCOPE_BYPASS_KEY = '__module_scope_bypass__'


def mark_module_scope_bypass():
    """
    درخواستی که بدون قلمرو ماژول فقط به‌خاطر بخش‌های شرکت باز شد (حالت محدود استودیو): در همین درخواست
    عضویت حساب نمی‌شود تا قاعده‌های «عضو می‌خواند» (ت۱۱) به کاربرِ بی‌قلمرو باز نشوند؛ فقط سطح بخش‌ها می‌ماند.
    """
    from accounts.middleware import get_allowed_companies_cache
    req_cache = get_allowed_companies_cache()
    if req_cache is None:
        return False
    for key in [k for k in req_cache if isinstance(k, tuple) and k[1] != '__section_levels__']:
        del req_cache[key]
    req_cache[_SCOPE_BYPASS_KEY] = True
    return True


def module_scope_bypassed():
    from accounts.middleware import get_allowed_companies_cache
    req_cache = get_allowed_companies_cache()
    return bool(req_cache is not None and req_cache.get(_SCOPE_BYPASS_KEY))


def derived_company_ids(user):
    """شناسهٔ شرکت‌هایی که کاربر از راه منابع مشتق ثبت‌شده در آن‌ها دسترسی کامل دارد."""
    if module_scope_bypassed():
        return set()
    ids = set()
    for source in _DERIVED_COMPANY_SOURCES:
        res = source(user)
        if isinstance(res, (set, list, tuple)):
            for item in res:
                if isinstance(item, dict) and 'company_id' in item:
                    ids.add(item['company_id'])
                elif isinstance(item, int):
                    ids.add(item)
                elif hasattr(item, 'id'):
                    ids.add(item.id)
        elif isinstance(res, set):
            ids.update(res)
    return ids


def derived_company_access_details(user) -> list[dict]:
    """
    اطلاعات کامل دسترسی‌های مشتق کاربر به شرکت‌ها از منابع ثبت‌شده
    (جهت استفاده در سریالایزرهای کاربری بدون وابستگی به ماژول‌های خاص).
    """
    details = []
    for source in _DERIVED_COMPANY_SOURCES:
        res = source(user)
        if isinstance(res, (list, tuple)):
            for item in res:
                if isinstance(item, dict) and 'company_id' in item:
                    details.append(item)
    return details



def _row_levels(row):
    """سطح بخش‌های نصب‌شدهٔ یک ردیف (کلید ماژول نصب‌نشده به‌صورت داده می‌ماند و اینجا دیده نمی‌شود)."""
    from .permission_sections import normalize_levels
    return normalize_levels(row.section_levels)


def user_section_levels(user):
    """{company_id: {section: level}} برای ردیف‌های کاربر (کش در سطح درخواست)."""
    from accounts.middleware import get_allowed_companies_cache
    req_cache = get_allowed_companies_cache()
    key = (getattr(user, 'id', None), '__section_levels__')
    if req_cache is not None and key in req_cache:
        return req_cache[key]
    # شرکت غیرفعال هیچ سطحی نمی‌دهد (نوشتن با ensure_section هم در آن بسته است)
    result = {r.company_id: _row_levels(r) for r in UserCompanyAccess.objects.filter(user=user, company__is_active=True)}
    if req_cache is not None:
        req_cache[key] = result
    return result


def _level_ok(have, need):
    from .permission_sections import LEVEL_RANK
    return LEVEL_RANK.get(have or 'none', 0) >= LEVEL_RANK.get(need, 99)


def company_section_level(user, company_id, section):
    if not user or not user.is_authenticated:
        return 'none'
    if user.is_superuser:
        return 'write'
    try:
        cid = int(company_id)
    except (TypeError, ValueError):
        return 'none'
    return user_section_levels(user).get(cid, {}).get(section, 'none')


def companies_with_section(user, section, level='read'):
    if not user or not user.is_authenticated:
        return Company.objects.none()
    if user.is_superuser:
        return Company.objects.filter(is_active=True)
    ids = [cid for cid, lv in user_section_levels(user).items() if _level_ok(lv.get(section), level)]
    return Company.objects.filter(id__in=ids, is_active=True)


def companies_with_any_section(user):
    """شرکت‌هایی که کاربر دست‌کم یک بخش «خواندن» یا بالاتر دارد (فهرست حالت محدود)."""
    if not user or not user.is_authenticated:
        return Company.objects.none()
    if user.is_superuser:
        return Company.objects.filter(is_active=True)
    ids = [cid for cid, lv in user_section_levels(user).items() if any(_level_ok(v, 'read') for v in lv.values())]
    return Company.objects.filter(id__in=ids, is_active=True)


def ensure_section(user, company_id, section, level='read', message=None):
    if not _level_ok(company_section_level(user, company_id, section), level):
        raise PermissionDenied(message or "شما برای این بخش از اطلاعات شرکت مجوز لازم را ندارید.")


MEMBER = 'workspace_full'
LINK = None


def get_user_allowed_companies(user, required_level=MEMBER):
    """
    شرکت‌هایی که کاربر به آن‌ها راه دارد؛ superuser همه را دارد.
    required_level='workspace_full' (پیش‌فرض): «عضو»، فقط از منبع‌های خودکار ماژول‌ها (ق۲).
    required_level=None: «پیوند»، یعنی عضو، یا دارای ردیف UserCompanyAccess، یا دارای بخشی با سطح خواندن.
    سطح بخش‌ها از company_section_level و companies_with_section خوانده می‌شود، نه از اینجا.
    """
    if required_level not in (MEMBER, LINK):
        raise ValueError(f"required_level نامعتبر: {required_level!r}")
    if not user or not user.is_authenticated:
        return Company.objects.none()
    if user.is_superuser:
        return Company.objects.filter(is_active=True)

    from accounts.middleware import get_allowed_companies_cache
    req_cache = get_allowed_companies_cache()
    user_id = getattr(user, 'id', None)
    cache_key = (user_id, required_level)
    if req_cache is not None and cache_key in req_cache:
        return req_cache[cache_key]

    allowed_ids = derived_company_ids(user)
    if required_level is LINK:
        allowed_ids |= set(UserCompanyAccess.objects.filter(user=user).values_list('company_id', flat=True))
        allowed_ids |= set(companies_with_any_section(user).values_list('id', flat=True))

    qs = Company.objects.filter(id__in=allowed_ids, is_active=True)
    if req_cache is not None:
        req_cache[cache_key] = qs
    return qs


def get_request_company_id(request):
    """
    استخراج شناسه شرکت از هدر یا کوئری‌پارامتر
    """
    return request.query_params.get('company_id') or request.query_params.get('company') or request.headers.get('X-Company-ID')


def validate_user_company_access(user, company_id, required_level=MEMBER):
    """
    اعتبارسنجی دسترسی کاربر به شناسه شرکت داده‌شده. در صورت عدم دسترسی، PermissionDenied پرتاب می‌شود.
    پیش‌فرض: required_level='workspace_full' برای جلوگیری از دسترسی کاربران غیرمجاز به اطلاعات پروژه‌ها و انبار.
    """
    if not company_id:
        return None
    try:
        cid = int(company_id)
    except (ValueError, TypeError):
        return None
    if not user or not user.is_authenticated:
        raise PermissionDenied("کاربر احراز هویت نشده است.")
    if user.is_superuser:
        return cid
    allowed_ids = set(get_user_allowed_companies(user, required_level=required_level).values_list('id', flat=True))
    if cid not in allowed_ids:
        raise PermissionDenied("شما به اطلاعات و پروژه‌های این شرکت دسترسی ندارید.")
    return cid


# ─── نوشتن محدود به شرکت برای همهٔ کاربران غیرسوپریوزر (requires_company_scope) ───
def ensure_scoped_write(user, company_id, message):
    """
    رکورد باید به یکی از شرکت‌های مجاز کاربر تعلق داشته باشد. رکورد سراسری (بدون شرکت) هم رد می‌شود،
    چون بین همهٔ شرکت‌ها مشترک است و فقط سوپریوزر آن را تغییر می‌دهد. در صورت نقض، PermissionDenied پرتاب می‌شود.
    """
    allowed_ids = set(get_user_allowed_companies(user).values_list('id', flat=True))
    if company_id is None or company_id not in allowed_ids:
        raise PermissionDenied(message)
