"""
رجیستری قابلیت‌های ماژول (Module Registry) — فاز ۳ طرح جداسازی.

قانون طلایی: از این نقطه به بعد هیچ فایل هسته‌ای (platform) نام هیچ ماژولی را
سخت‌کد نمی‌کند؛ تنها از همین رجیستری سؤال می‌پرسد. مرجع:
`Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md` §۳

قراردادها:
- `installed_modules()` — فهرست کدهای ماژولِ نصب‌شده (manifest فرانت‌اند).
- `module_for_path(path)` — یافتن ماژولِ مالکِ یک پیشوند مسیر API (جای زنجیرهٔ
  `if path.startswith(...)` در `accounts/authentication.py`).
- `register_module(spec)` — ثبت خودکار ماژول از `AppConfig.ready()`.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModuleSpec:
    """
    مشخصات یک ماژول نصب‌شدنی.
    """
    code: str                          # 'warehouse' | 'accounting'
    title_fa: str
    django_apps: tuple[str, ...] = ()
    api_prefixes: tuple[str, ...] = () # ('api/warehouses/', 'api/inventory/', ...)
    permission_markers: tuple[str, ...] = ()
    roles: tuple[str, ...] = ()
    nav: tuple = ()
    ws_routes: tuple = ()
    url_includes: tuple[tuple[str, str], ...] = ()  # (پیشوند مسیر، urlconf)
    audit_modules: tuple[tuple[str, str], ...] = ()
    sod_app_module: str = ''           # برای حسابداری: 'personnel' (سازگاری داده)
    pull_entities: tuple[str, ...] = ()
    requires_platform: str = '>=1.0,<2.0'


PLATFORM_VERSION = '1.0.0'

_REGISTRY: dict[str, ModuleSpec] = {}


def _verify_platform_compatibility(spec: ModuleSpec) -> None:
    """
    بررسی بازه نسخه پلتفرم مورد نیاز ماژول — فاز ۷ (تسک ۶۶).
    در صورت ناسازگاری، استارت‌آپ با پیام فارسی روشن متوقف می‌شود.
    """
    req = getattr(spec, 'requires_platform', None)
    if not req:
        return
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.version import Version
        specifiers = SpecifierSet(req)
        if Version(PLATFORM_VERSION) not in specifiers:
            raise RuntimeError(
                f"خطای ناسازگاری نسخه ماژول «{spec.title_fa}» ({spec.code}): "
                f"این ماژول نیازمند نسخه پلتفرم {req} است، در حالی که نسخه پلتفرم فعال {PLATFORM_VERSION} می‌باشد."
            )
    except ImportError:
        pass


def register_module(spec):
    """
    ثبت ماژول در رجیستری. ابتدا نسخه سازگاری پلتفرم بررسی شده (تسک ۶۶) و سپس
    اگر ماژول `audit_modules` اعلام کرده باشد، آن‌ها را در رجیستری ممیزیِ هسته
    (`accounts.models.AUDIT_MODULES`) نیز ثبت می‌کند.
    """
    _verify_platform_compatibility(spec)
    _REGISTRY[spec.code] = spec
    if spec.audit_modules:
        from accounts.models import register_audit_modules
        register_audit_modules(spec.audit_modules)


def discover_entry_point_modules():
    """
    کشف خودکار ماژول‌ها از طریق گروه entry-point به نام 'wh.module' — فاز ۷ (تسک ۶۵).
    """
    import importlib.metadata
    try:
        eps = importlib.metadata.entry_points(group='wh.module')
    except TypeError:
        eps = importlib.metadata.entry_points().get('wh.module', [])

    for ep in eps:
        try:
            spec = ep.load()
            if callable(spec):
                spec = spec()
            register_module(spec)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"[ModuleRegistry] Failed to load module from entry-point '{ep.name}': {e}"
            )


def get_module(code):
    """برگرداندن `ModuleSpec` برای یک کد ماژول، یا None اگر وجود ندارد."""
    return _REGISTRY.get(code)


def installed_modules():
    """فهرست کدهای ماژولِ ثبت‌شده (نصب‌شده)."""
    return tuple(_REGISTRY.keys())


def module_for_path(path):
    """
    یافتن ماژولِ نصب‌شدهٔ مالکِ مسیر. `path` را با هر `api_prefix` ثبت‌شده مقایسه
    می‌کند. اگر مسیر متعلق به هیچ ماژول شناخته‌شده‌ای نبود، None برمی‌گرداند.
    """
    if not path:
        return None
    rel = path.lstrip('/')
    for spec in _REGISTRY.values():
        for prefix in spec.api_prefixes:
            if rel.startswith(prefix):
                return spec
    return None


def known_module_for_path(path):
    """
    یافتن ماژولِ «شناخته‌شده» در کاتالوگ (حتی اگر نصب نباشد). برای قانون ۵
    (افشای نکردن ماژول نصب‌نشده) لازم است: ببینیم مسیر به کدام ماژول تعلق دارد
    تا اگر نصب نیست، ۴۰۴ برگردانیم نه ۴۰۳.
    """
    if not path:
        return None
    from platform_core.module_catalog import MODULE_CATALOG
    rel = path.lstrip('/')
    for spec in MODULE_CATALOG.values():
        for prefix in spec.api_prefixes:
            if rel.startswith(prefix):
                return spec
    return None


def is_module_installed(code):
    return code in _REGISTRY


# ── پلِ سازگاری با کدهای قدیمی توکن/هدر ─────────────────────────────
# کد ماژول در رجیستری ('warehouse'/'accounting') با کدهایی که در JWT/هدر در
# گردش‌اند ('warehouse'/'finance'/'personnel') یکسان نیست. این نگاشت‌ها رفتار
# امروز را عیناً حفظ می‌کنند تا فرانت‌اند (فاز ۶) بدون تغییر بماند.
_APP_CODE_TO_MODULE = {
    'warehouse': 'warehouse',
    'finance': 'accounting',
    'personnel': 'accounting',
}
_MODULE_TO_ALLOWED_APP = {
    'warehouse': 'warehouse',
    'accounting': 'finance',
}


def app_code_to_module(app_code):
    """
    نگاشت کد قدیمیِ توکن/هدر ('warehouse'/'finance'/'personnel') به کد ماژول.
    اگر خودِ کد، کد ماژولِ شناخته‌شده باشد، همان را دست‌نخورده برمی‌گرداند؛
    اگر ناشناخته باشد (مثل 'operations') None برمی‌گرداند.
    """
    if not app_code:
        return None
    if app_code in _APP_CODE_TO_MODULE:
        return _APP_CODE_TO_MODULE[app_code]
    from platform_core.module_catalog import MODULE_CATALOG
    return app_code if app_code in MODULE_CATALOG else None


def default_module():
    """ماژول پیش‌فرض وقتی هدرِ قلمرو مشخص نیست (مطابق ترجیح فرانت‌اند: حسابداری اول)."""
    if 'accounting' in _REGISTRY:
        return 'accounting'
    if 'warehouse' in _REGISTRY:
        return 'warehouse'
    return ''


def app_code_for_sod(module_code):
    """
    کدِ `app_module` که برای جدول SoD باید استفاده شود (مطابق `spec.sod_app_module`).
    برای ماژول 'accounting' این همان 'personnel' است تا دادهٔ قدیمی SoD سازگار بماند.
    """
    spec = _REGISTRY.get(module_code)
    if spec and spec.sod_app_module:
        return spec.sod_app_module
    return module_code


def module_allowed_app_code(module_code):
    """
    کدِ `allowed_apps` که در توکن برای یک ماژول درج می‌شود.
    (مثلاً ماژول 'accounting' در توکن با کد قدیمی 'finance' ظاهر می‌شود.)
    """
    return _MODULE_TO_ALLOWED_APP.get(module_code, module_code)


# کدهای مجازِ `allowed_apps` برای هر ماژول (برای بررسی قلمرو در احراز هویت).
# ماژول 'accounting' از دیرباز هم 'finance' و هم 'personnel' را می‌پذیرد.
_MODULE_SCOPE_CODES = {
    'warehouse': ('warehouse',),
    'accounting': ('finance', 'personnel'),
}


def module_scope_codes(module_code):
    """کدهای مجازِ `allowed_apps` برای بررسی قلمروِ یک ماژول."""
    return _MODULE_SCOPE_CODES.get(module_code, (module_allowed_app_code(module_code),))
