"""
قواعد دسترسی کاربر به شرکت‌ها (هستهٔ چندمستأجری).

دسترسی مستقیم از UserCompanyAccess می‌آید. ماژول‌ها می‌توانند با
`register_derived_company_source` دسترسی مشتق اضافه کنند؛ مثلاً حسابداری عضویت فعال در بخش‌های
پروژه‌های یک شرکت را دسترسی کامل (workspace_full) به آن شرکت حساب می‌کند.
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


def derived_company_ids(user):
    """شناسهٔ شرکت‌هایی که کاربر از راه منابع مشتق ثبت‌شده در آن‌ها دسترسی کامل دارد."""
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



def get_user_allowed_companies(user, required_level='workspace_full'):
    """
    محاسبه شرکت‌های مجاز کاربر (ترکیبی: سوپریوزر = همه، عادی = انتساب صریح یا دسترسی مشتق ماژول‌ها)
    دارای حافظه کش در سطح چرخه درخواست کلاینت (Request Scope) جهت جلوگیری از اجرای کوئری‌های تکراری N+1
    """
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

    access_qs = UserCompanyAccess.objects.filter(user=user)
    if required_level == 'workspace_full':
        direct_ids = set(access_qs.filter(access_level='workspace_full').values_list('company_id', flat=True))
        allowed_ids = direct_ids.union(derived_company_ids(user))
    elif required_level == 'docs_write':
        allowed_ids = set(access_qs.filter(access_level__in=['docs_write', 'workspace_full']).values_list('company_id', flat=True))
    elif required_level == 'docs_read':
        allowed_ids = set(access_qs.filter(access_level__in=['docs_read', 'docs_write', 'workspace_full']).values_list('company_id', flat=True))
    else:
        direct_ids = set(access_qs.values_list('company_id', flat=True))
        allowed_ids = direct_ids.union(derived_company_ids(user))

    qs = Company.objects.filter(id__in=allowed_ids, is_active=True)
    if req_cache is not None:
        req_cache[cache_key] = qs
    return qs


def get_request_company_id(request):
    """
    استخراج شناسه شرکت از هدر یا کوئری‌پارامتر
    """
    return request.query_params.get('company_id') or request.query_params.get('company') or request.headers.get('X-Company-ID')


def validate_user_company_access(user, company_id, required_level='workspace_full'):
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
