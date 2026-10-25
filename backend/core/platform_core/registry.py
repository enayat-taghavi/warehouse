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
    audit_scope_keys: tuple[str, ...] = ()
    pull_entities: tuple[str, ...] = ()
    requires_platform: str = '>=1.0,<2.0'
    aliases: tuple[str, ...] = ()
    allowed_app_code: str = ''
    scope_codes: tuple[str, ...] = ()
    default_priority: int = 100
    active_priority: int = 100
    public_read_prefixes: tuple[str, ...] = ()
    reports_fallback: bool = False
    # ماژول opt-in فقط با نام صریح در WH_MODULES نصب می‌شود (مثل ماژول نمایشی)؛ پروفایل پیش‌فرض آن را ندارد
    opt_in: bool = False


PLATFORM_VERSION = '1.0.0'

_REGISTRY: dict[str, ModuleSpec] = {}
_CONTRIBUTIONS: dict[str, list] = {}


def contribute(point: str, item) -> None:
    """
    ثبت مشارکت ماژول‌ها در نقطه‌های توسعهٔ هسته (Extension Points) — طرح راه میانهٔ ماژولار (گام ۳).
    """
    _CONTRIBUTIONS.setdefault(point, []).append(item)


def contributions(point: str) -> tuple:
    """
    دریافت مشارکت‌های ثبت‌شده در یک نقطهٔ توسعه.
    """
    return tuple(_CONTRIBUTIONS.get(point, ()))


# ─── alias مجوز (گام ۸): ماژول صاحب، کد مجوزش را به یک «توانایی» نام‌دار مشارکت می‌دهد ──────────
# مصرف‌کننده (ماژول دیگر) فقط نام توانایی را می‌داند و هرگز کد مجوز ماژول دیگر را نمی‌نویسد.
PERMISSION_ALIAS_PREFIX = 'alias:'


def permission_alias(capability: str) -> str:
    """توکن یک توانایی برای جای‌گذاری در فهرست کدهای مجوز (مثلاً تاپل مراحل گردش کار)."""
    return f'{PERMISSION_ALIAS_PREFIX}{capability}'


def permission_aliases(capability: str) -> tuple[str, ...]:
    """کدهای مجوزی که ماژول‌های نصب‌شده با contribute('permission_aliases:<توانایی>', codename) اعلام کرده‌اند."""
    return tuple(dict.fromkeys(contributions(f'permission_aliases:{capability}')))


def expand_permission_aliases(codenames) -> tuple[str, ...]:
    """توکن‌های alias: را با کدهای اعلام‌شده جایگزین می‌کند؛ کد عادی دست‌نخورده می‌ماند."""
    result: list[str] = []
    for code in codenames:
        if isinstance(code, str) and code.startswith(PERMISSION_ALIAS_PREFIX):
            result.extend(permission_aliases(code[len(PERMISSION_ALIAS_PREFIX):]))
        else:
            result.append(code)
    return tuple(dict.fromkeys(result))


def has_permission_alias(user, capability: str) -> bool:
    """کاربر یکی از کدهای مجوز اعلام‌شده برای این توانایی را دارد (مجوزها روی accounts.CustomUser)."""
    # همان رفتار has_perm جنگو: سوپریوزر فعال هر مجوزی را دارد، حتی وقتی هیچ ماژولی alias را اعلام نکرده باشد
    if getattr(user, 'is_active', False) and getattr(user, 'is_superuser', False):
        return True
    return any(user.has_perm(f'accounts.{code}') for code in permission_aliases(capability))


def company_of(kind: str, entity_id) -> int | None:
    """
    حل شناسه شرکت مالک یک موجودیت بدون وابستگی مستقیم به ماژول مالک.
    مثال: company_of('warehouse', wh_id)
    اگر ماژول مربوطه نصب نباشد یا رکوردی پیدا نشود، None برمی‌گرداند.
    """
    if not entity_id:
        return None
    for resolver in contributions(f"company_of:{kind}"):
        try:
            cid = resolver(entity_id)
            if cid is not None:
                return cid
        except Exception:
            continue
    for item in contributions('company_resolvers'):
        if isinstance(item, tuple) and len(item) == 2 and item[0] == kind and callable(item[1]):
            try:
                cid = item[1](entity_id)
                if cid is not None:
                    return cid
            except Exception:
                continue
    return None


def resolve_entity(kind: str, entity_id):
    """
    حل شیء موجودیت بدون وابستگی مستقیم به اپ ماژول مالک.
    مثال: resolve_entity('warehouse', wh_id)
    """
    if not entity_id:
        return None
    for resolver in contributions(f"entity_resolver:{kind}"):
        try:
            obj = resolver(entity_id)
            if obj is not None:
                return obj
        except Exception:
            continue
    return None


def resolve_entity_map(kind: str, entity_ids) -> dict:
    """
    حل نگاشت شناسه‌ها به نام/موجودیت بدون وابستگی مستقیم به اپ ماژول مالک.
    مثال: resolve_entity_map('warehouse', [1, 2])
    """
    if not entity_ids:
        return {}
    for resolver in contributions(f"entity_map_resolver:{kind}"):
        try:
            res = resolver(entity_ids)
            if isinstance(res, dict):
                return res
        except Exception:
            continue
    return {}


# ─── قلاب دیدن و قفل سند (ص۱ و ص۴ طرح ۲.۶) ───────────────────────────────────────────────────────
# ماژول مالک با contribute('can_view:<kind>', fn) و contribute('is_locked:<kind>', fn) اعلام می‌کند.
# fn دیدن: fn(user, entity_id) → True (اجازه) | False (منع) | None (بی‌نظر). فقط False دقیق منع است و
# فقط True دقیق اجازه؛ 0 یا '' بی‌نظر حساب می‌شود. fn قفل: fn(entity_id) → bool.

def entity_view_decision(user, kind: str, entity_id):
    """
    تصمیم سه‌حالتهٔ دیدن یک سند: True، False یا None (هیچ قلابی نظر نداد).
    هر منع برنده است؛ خطای قلاب = منع (بسته در برابر خطا). مدیر کل فعال همیشه می‌بیند.
    """
    if user is None or not getattr(user, 'is_active', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if not kind or not entity_id:
        return False
    allowed = None
    for hook in contributions(f'can_view:{kind}'):
        try:
            verdict = hook(user, entity_id)
        except Exception:
            return False
        if verdict is False:
            return False
        if verdict is True:
            allowed = True
    return allowed


def can_view(user, kind: str, entity_id) -> bool:
    """دیدن سند برای پیوست و دانلود: فقط اجازهٔ صریح (نوع بی‌قلاب = منع)."""
    return entity_view_decision(user, kind, entity_id) is True


def record_entity_view(user, kind: str, entity_id, company_id=None) -> bool:
    """سابقهٔ دیدن سند (ص۱۰ طرح ۲.۶): حداکثر یک ردیف برای هر کاربر و سند در هر ۱۰ دقیقه."""
    from attachments.services import record_entity_view as _record
    return _record(user, kind, entity_id, company_id)


def is_entity_locked(kind: str, entity_id) -> bool:
    """سند قفل است اگر هر قلابی بگوید قفل؛ خطای قلاب = قفل (تا پیوست اشتباهی پاک یا جایگزین نشود)."""
    if not kind or not entity_id:
        return False
    for hook in contributions(f'is_locked:{kind}'):
        try:
            if hook(entity_id):
                return True
        except Exception:
            return True
    return False


# ─── قلاب پیوست و محرمانگی (ص۵ و ص۷ طرح ۲.۶) ─────────────────────────────────────────────────────
# contribute('can_attach:<kind>', fn): fn(user, entity_id) → True | False | None، مثل can_view.
# contribute('is_confidential:<kind>', fn): fn(entity_id) → bool.

def can_attach(user, kind: str, entity_id) -> bool:
    """افزودن، حذف نرم یا جایگزینی پیوست: فقط اجازهٔ صریح؛ هر منع برنده؛ خطای قلاب = منع؛ نوع بی‌قلاب = منع."""
    if user is None or not getattr(user, 'is_active', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if not kind or not entity_id:
        return False
    allowed = False
    for hook in contributions(f'can_attach:{kind}'):
        try:
            verdict = hook(user, entity_id)
        except Exception:
            return False
        if verdict is False:
            return False
        if verdict is True:
            allowed = True
    return allowed


def is_entity_confidential(kind: str, entity_id) -> bool:
    """سند محرمانه است اگر هر قلابی بگوید؛ خطای قلاب = محرمانه (فایلش فقط روی سرور می‌ماند)."""
    for hook in contributions(f'is_confidential:{kind}'):
        try:
            if hook(entity_id):
                return True
        except Exception:
            return True
    return False


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


def app_code_to_module(app_code):
    """
    نگاشت کد توکن یا هدر به کد ماژول بر اساس مشخصات ماژول‌ها.
    """
    if not app_code:
        return None
    from platform_core.module_catalog import MODULE_CATALOG
    all_specs = {**MODULE_CATALOG, **_REGISTRY}
    if app_code in all_specs:
        return app_code
    for spec in all_specs.values():
        if app_code in getattr(spec, 'aliases', ()):
            return spec.code
        if app_code == getattr(spec, 'allowed_app_code', ''):
            return spec.code
        if app_code in getattr(spec, 'scope_codes', ()):
            return spec.code
    return None


def default_module():
    """ماژول پیش‌فرض بر اساس اولویت ماژول‌های فعال (default_priority کمتر اولویت بالاتر دارد)."""
    if not _REGISTRY:
        return ''
    candidates = sorted(
        _REGISTRY.values(),
        key=lambda s: getattr(s, 'default_priority', 100)
    )
    if candidates:
        return candidates[0].code
    return ''


def module_allowed_app_code(module_code):
    """
    کدِ مجاز که در توکن برای یک ماژول درج می‌شود.
    """
    spec = _REGISTRY.get(module_code)
    if not spec:
        from platform_core.module_catalog import MODULE_CATALOG
        spec = MODULE_CATALOG.get(module_code)
    if spec:
        return spec.allowed_app_code if getattr(spec, 'allowed_app_code', '') else spec.code
    return module_code


def module_scope_codes(module_code):
    """کدهای مجاز برای بررسی قلمروِ یک ماژول."""
    spec = _REGISTRY.get(module_code)
    if not spec:
        from platform_core.module_catalog import MODULE_CATALOG
        spec = MODULE_CATALOG.get(module_code)
    if spec and getattr(spec, 'scope_codes', ()):
        return spec.scope_codes
    return (module_allowed_app_code(module_code),)


def module_for_scope_code(code: str):
    """
    یافتن مشخصات ماژول کاتالوگ (ModuleSpec) بر اساس scope_codes.
    برای مثال 'warehouse' ماژول warehouse و 'finance' یا 'personnel' ماژول accounting را برمی‌گرداند.
    برای 'accounting'، 'all' یا مقادیر خالی/ناشناخته، None برمی‌گرداند.
    """
    if not code:
        return None
    clean_code = str(code).lower().strip()
    from platform_core.module_catalog import MODULE_CATALOG
    for spec in MODULE_CATALOG.values():
        if clean_code in getattr(spec, 'scope_codes', ()):
            return spec
    return None


def audit_scope_keys(module_code: str) -> tuple[str, ...]:
    """
    برگرداندن کلیدهای دامنه ممیزی (audit_scope_keys) برای یک ماژول از کاتالوگ (حتی اگر نصب نباشد).
    """
    from platform_core.module_catalog import MODULE_CATALOG
    spec = MODULE_CATALOG.get(module_code)
    if spec:
        return getattr(spec, 'audit_scope_keys', ())
    return ()


def build_user_token_scopes(user) -> dict[str, list[str]]:
    """
    تولید دیکشنری scopeهای توکن JWT بر اساس ماژول‌های کاتالوگ پلتفرم.
    """
    from platform_core.module_catalog import runtime_catalog_codes
    from accounts.middleware import get_user_valid_roles_for_app

    scopes = {}
    for code in runtime_catalog_codes():
        scopes[module_allowed_app_code(code)] = get_user_valid_roles_for_app(user, code)
    return scopes


def resolve_default_active_app(allowed_apps) -> str:
    """
    تعیین قلمرو فعال پیش‌فرض بر اساس فهرست قلمروهای مجاز کاربر و اولویت مشخصات ماژول‌ها.
    """
    allowed = set(allowed_apps or ())
    from platform_core.module_catalog import MODULE_CATALOG
    all_specs = {**MODULE_CATALOG, **_REGISTRY}

    matching = []
    for spec in all_specs.values():
        app_code = spec.allowed_app_code if getattr(spec, 'allowed_app_code', '') else spec.code
        if app_code in allowed:
            matching.append((getattr(spec, 'active_priority', 100), app_code))

    if matching:
        matching.sort(key=lambda x: x[0])
        return matching[0][1]

    catalog_specs = sorted(
        (MODULE_CATALOG.values() if MODULE_CATALOG else all_specs.values()),
        key=lambda s: getattr(s, 'default_priority', 100)
    )
    if catalog_specs:
        best_spec = catalog_specs[0]
        return best_spec.allowed_app_code if getattr(best_spec, 'allowed_app_code', '') else best_spec.code

    return ''


def normalize_ws_app_scope(code) -> str | None:
    """
    نرمال‌سازی قلمرو وب‌سوکت بر اساس رجیستری ماژول‌ها.
    """
    if not code:
        return None
    module = app_code_to_module(code)
    return module_allowed_app_code(module) if module else None


