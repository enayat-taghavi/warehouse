"""
حصار مرکزی «مدیر کل فقط می‌بیند» (طرح نبودن نفر ۱۴۰۵-۰۸، بند ۴-۶ راه پیشنهادی ۲).

هر درخواست نوشتنی (POST، PUT، PATCH، DELETE) مدیر کل سامانه روی مسیرهای حصارشده با 403 superuser_view_only رد
می‌شود، مگر مسیر در فهرست استثنا باشد. هسته نام ماژولی را نمی‌شناسد (ق۱): ماژول‌ها در module.py
(SUPERUSER_WRITE_FENCE، SUPERUSER_WRITE_ALLOWLIST) یا با رجیستری اعلام می‌کنند:

- contribute('superuser_write_fence', '/api/<prefix>/')  ← پیشوند مسیرهای سند ماژول؛
- contribute('superuser_write_allowlist', r'^/api/<prefix>/...$')  ← کار کلان یا POST فقط‌خواندنی (خروجی، پیش‌نمایش)؛
- contribute('superuser_view_only_kinds', '<entity_kind>')  ← نوع سندی که مدیر کل پیوستش را عوض نمی‌کند.

کارهای موتور (اقدام، ارجاع) در خود موتور هم بسته‌اند؛ اینجا لایهٔ API است. نگهبان ۶۰ هر مسیر نوشتن ماژول را که
نه حصار دارد و نه در فهرست است می‌گیرد.
"""
import re
from functools import lru_cache

WRITE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})
SUPERUSER_VIEW_ONLY_CODE = 'superuser_view_only'
SUPERUSER_VIEW_ONLY_FA = 'مدیر کل سامانه فقط سند را می‌بیند'

# مسیرهای هستهٔ گردش کار (اقدام، ارجاع، لغو) که روی سند شرکت کار می‌کنند
CORE_FENCED_PREFIXES = ('/api/workflow/tasks/', '/api/workflow/instances/')
CORE_ALLOWLIST = (
    # خوانده‌شدن کار فقط نشانهٔ دیدن است، نه اقدام روی سند
    r'^/api/workflow/tasks/\d+/read/$',
    # س۲: مدیر کل سندهای قدیمی خودش را لغو می‌کند (موتور فقط ثبت‌کننده را می‌پذیرد)
    r'^/api/workflow/instances/\d+/cancel/$',
)


def _contributions(key):
    from platform_core.registry import contributions
    return tuple(contributions(key))


def _manifest_entries():
    """SUPERUSER_WRITE_FENCE و SUPERUSER_WRITE_ALLOWLIST مانیفست (module.py) ماژول‌های نصب‌شده."""
    from platform_core.module_catalog import MODULE_SUPERUSER_FENCE
    from platform_core.registry import installed_modules
    prefixes, allow = [], []
    for code in installed_modules():
        fence, allowlist = MODULE_SUPERUSER_FENCE.get(code, ((), ()))
        prefixes.extend(fence)
        allow.extend(allowlist)
    return tuple(prefixes), tuple(allow)


@lru_cache(maxsize=1)
def _compiled():
    m_prefixes, m_allow = _manifest_entries()
    prefixes = (tuple(CORE_FENCED_PREFIXES) + m_prefixes
                + tuple(str(p) for p in _contributions('superuser_write_fence')))
    allow = tuple(re.compile(p) for p in CORE_ALLOWLIST + m_allow
                  + tuple(str(p) for p in _contributions('superuser_write_allowlist')))
    return prefixes, allow


def reset_cache():
    """برای آزمون‌ها پس از contribute تازه."""
    _compiled.cache_clear()


def is_fenced_write(method, path) -> bool:
    """مسیر نوشتنی حصارشده و بیرون از فهرست استثنا؟ (بی نگاه به کاربر)"""
    if (method or '').upper() not in WRITE_METHODS:
        return False
    prefixes, allow = _compiled()
    path = path or ''
    if not path.startswith(prefixes):
        return False
    return not any(rx.match(path) for rx in allow)


def blocks(user, method, path) -> bool:
    """مدیر کل سامانهٔ فعال روی مسیر نوشتنی حصارشده؟"""
    return bool(user is not None and getattr(user, 'is_authenticated', False)
                and getattr(user, 'is_superuser', False) and is_fenced_write(method, path))


def view_only_kinds() -> frozenset:
    return frozenset(str(k) for k in _contributions('superuser_view_only_kinds'))


def forbidden_response():
    from django.http import JsonResponse
    return JsonResponse({'code': SUPERUSER_VIEW_ONLY_CODE, 'error': SUPERUSER_VIEW_ONLY_CODE,
                         'detail': SUPERUSER_VIEW_ONLY_FA}, status=403)
