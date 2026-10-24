"""
کاتالوگ پویای ماژول‌های نصب‌شدنی — طرح راه میانهٔ ماژولار (گام ۳).

این فایل در زمان بارگذاری settings ایمپورت می‌شود (پیش از آماده‌شدن Django apps)
تا `INSTALLED_APPS` بتواند از آن ساخته شود (تسک ۳۵). این ماژول پوشه‌های `modules/*/module.py`
را به صورت پویا با `importlib.util.spec_from_file_location` کشف می‌کند.
"""

import importlib.util
from pathlib import Path
from platform_core.registry import ModuleSpec

MODULE_CATALOG: dict[str, ModuleSpec] = {}
MODULE_PERMISSION_CODENAMES: dict[str, tuple[str, ...]] = {}
# مجوزهای سفارشی هر ماژول روی accounts.CustomUser: (کد، نام فارسی)؛ از `PERMISSIONS` مانیفست
MODULE_PERMISSIONS: dict[str, tuple[tuple[str, str], ...]] = {}
# همان مجوزها با قالب کامل (طرح ۲.۲، ت۲ و ت۳): هر ردیف دیکشنری با کلیدهای
# code، label_fa، category، scope ('section' یا 'system')، defaults (کلید نقش‌های انتساب) و module
MODULE_PERMISSION_SPECS: dict[str, tuple[dict, ...]] = {}
# دسته‌های مجوز هر ماژول (`PERMISSION_CATEGORIES` مانیفست): key، label_fa، order، menu و module
MODULE_PERMISSION_CATEGORIES: dict[str, tuple[dict, ...]] = {}

PERMISSION_SCOPES = ('section', 'system')


def _normalize_categories(module_code: str, raw) -> tuple[dict, ...]:
    """دسته‌های اعلام‌شدهٔ یک ماژول، با کلید یکتا در همان ماژول."""
    out, seen = [], set()
    for item in raw or ():
        if not isinstance(item, dict) or not item.get('key') or not item.get('label_fa'):
            raise ValueError(f"ماژول «{module_code}»: هر دستهٔ مجوز باید key و label_fa داشته باشد: {item!r}")
        key = str(item['key'])
        if key in seen:
            raise ValueError(f"ماژول «{module_code}»: دستهٔ مجوز «{key}» دو بار اعلام شده است.")
        seen.add(key)
        menu = item.get('menu')
        out.append({
            'key': key,
            'label_fa': str(item['label_fa']),
            'order': int(item.get('order', 0)),
            'menu': str(menu) if menu else None,
            'module': module_code,
        })
    return tuple(out)


def _normalize_permissions(module_code: str, raw, categories: tuple[dict, ...]) -> tuple[dict, ...]:
    """
    مجوزهای اعلام‌شدهٔ یک ماژول به قالب کامل. قالب قدیم (کد، نام فارسی) سامانه‌ای و بی‌دسته است (ت۲).
    قالب تازه: {'code', 'label_fa', 'category', 'scope', 'defaults'}؛ defaults فقط برای مجوز بخشی.
    """
    category_keys = {c['key'] for c in categories}
    out, seen = [], set()
    for item in raw or ():
        if isinstance(item, (tuple, list)):
            if len(item) != 2:
                raise ValueError(f"ماژول «{module_code}»: مجوز با قالب قدیم باید (کد، نام فارسی) باشد: {item!r}")
            spec = {'code': str(item[0]), 'label_fa': str(item[1]), 'category': None, 'scope': 'system',
                    'defaults': ()}
        elif isinstance(item, dict):
            unknown = set(item) - {'code', 'label_fa', 'category', 'scope', 'defaults'}
            if unknown:
                raise ValueError(f"ماژول «{module_code}»: کلید ناشناخته {sorted(unknown)} در مجوز {item.get('code')!r}")
            if not item.get('code') or not item.get('label_fa'):
                raise ValueError(f"ماژول «{module_code}»: هر مجوز باید code و label_fa داشته باشد: {item!r}")
            scope = item.get('scope', 'system')
            if scope not in PERMISSION_SCOPES:
                raise ValueError(f"ماژول «{module_code}»: دامنهٔ ناشناختهٔ «{scope}» برای مجوز «{item['code']}».")
            defaults = item.get('defaults') or ()
            if isinstance(defaults, str):
                raise ValueError(f"ماژول «{module_code}»: defaults مجوز «{item['code']}» باید تاپل کلید نقش باشد.")
            defaults = tuple(dict.fromkeys(str(r) for r in defaults))
            if defaults and scope != 'section':
                raise ValueError(
                    f"ماژول «{module_code}»: مجوز سامانه‌ای «{item['code']}» در بستهٔ نقش انتساب نمی‌آید (defaults).")
            category = item.get('category')
            if category is not None and category not in category_keys:
                raise ValueError(f"ماژول «{module_code}»: دستهٔ ناشناختهٔ «{category}» برای مجوز «{item['code']}».")
            spec = {'code': str(item['code']), 'label_fa': str(item['label_fa']), 'category': category,
                    'scope': scope, 'defaults': defaults}
        else:
            raise ValueError(f"ماژول «{module_code}»: قالب مجوز ناشناخته: {item!r}")
        if spec['code'] in seen:
            raise ValueError(f"ماژول «{module_code}»: مجوز «{spec['code']}» دو بار اعلام شده است.")
        seen.add(spec['code'])
        spec['module'] = module_code
        out.append(spec)
    return tuple(out)


def merge_permission_specs(specs_by_module: dict[str, tuple[dict, ...]], module_codes=None) -> dict[str, dict]:
    """
    {code: spec} از مجوزهای چند ماژول (به ترتیب کاتالوگ). یک کد را چند ماژول فقط با نام و دامنهٔ یکسان
    می‌توانند اعلام کنند؛ سهم پیش‌فرضشان در بسته‌ها روی هم جمع می‌شود (ت۳). ناهمخوانی ValueError می‌دهد.
    """
    merged: dict[str, dict] = {}
    for module_code, specs in specs_by_module.items():
        if module_codes is not None and module_code not in module_codes:
            continue
        for spec in specs:
            prev = merged.get(spec['code'])
            if prev is None:
                merged[spec['code']] = {**spec, 'defaults': tuple(spec['defaults'])}
                continue
            if prev['scope'] != spec['scope'] or prev['label_fa'] != spec['label_fa']:
                raise ValueError(
                    f"مجوز «{spec['code']}» را ماژول‌های «{prev['module']}» و «{module_code}» ناهمخوان اعلام کرده‌اند.")
            prev['defaults'] = tuple(dict.fromkeys((*prev['defaults'], *spec['defaults'])))
    return merged


def _discover_modules() -> None:
    # مسیر ریشه بک‌اند نسبت به این فایل: backend/core/platform_core/module_catalog.py
    backend_root = Path(__file__).resolve().parents[2]
    modules_dir = backend_root / 'modules'
    if not modules_dir.is_dir():
        return

    # پیمایش به ترتیب نام پوشه‌ها جهت ترتیب قطعی
    for mod_dir in sorted(modules_dir.iterdir()):
        if not mod_dir.is_dir():
            continue
        manifest_path = mod_dir / 'module.py'
        if not manifest_path.is_file():
            continue

        dir_code = mod_dir.name
        unique_mod_name = f"_wh_module_manifest_{dir_code}"
        spec = importlib.util.spec_from_file_location(unique_mod_name, str(manifest_path))
        if spec is None or spec.loader is None:
            continue

        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # استخراج شیء مشخصات ماژول
        mod_spec = (
            getattr(mod, 'MODULE_SPEC', None)
            or getattr(mod, 'SPEC', None)
            or getattr(mod, f"{dir_code.upper()}_SPEC", None)
        )
        if not mod_spec:
            continue

        # شرط برابری کد ماژول با نام پوشه
        if mod_spec.code != dir_code:
            raise ValueError(
                f"کد ماژول «{mod_spec.code}» با نام پوشه «{dir_code}» هم‌خوانی ندارد."
            )

        MODULE_CATALOG[dir_code] = mod_spec

        perms = (
            getattr(mod, 'PERMISSION_CODENAMES', None)
            or getattr(mod, f"{dir_code.upper()}_PERMISSION_CODENAMES", ())
        )
        raw_categories = (
            getattr(mod, 'PERMISSION_CATEGORIES', None)
            or getattr(mod, f"{dir_code.upper()}_PERMISSION_CATEGORIES", ())
        )
        raw_custom = (
            getattr(mod, 'PERMISSIONS', None)
            or getattr(mod, f"{dir_code.upper()}_PERMISSIONS", ())
        )
        categories = _normalize_categories(dir_code, raw_categories)
        specs = _normalize_permissions(dir_code, raw_custom, categories)
        MODULE_PERMISSION_CATEGORIES[dir_code] = categories
        MODULE_PERMISSION_SPECS[dir_code] = specs
        custom = tuple((s['code'], s['label_fa']) for s in specs)
        MODULE_PERMISSIONS[dir_code] = custom
        # هر مجوز سفارشی ماژول جزو کدهای همان ماژول هم هست (برای دفاع در عمق)
        MODULE_PERMISSION_CODENAMES[dir_code] = tuple(dict.fromkeys((*perms, *(c for c, _ in custom))))


_discover_modules()
# ناهمخوانی اعلام یک کد در دو ماژول روی دیسک همین‌جا خطا می‌دهد
merge_permission_specs(MODULE_PERMISSION_SPECS)


def default_module_codes() -> list[str]:
    """ماژول‌های پروفایل پیش‌فرض (بی WH_MODULES): همهٔ ماژول‌های روی دیسک جز opt-in."""
    return [code for code, spec in MODULE_CATALOG.items() if not spec.opt_in]


def runtime_catalog_codes() -> list[str]:
    """
    ماژول‌هایی که قلمروشان در توکن و تعویض قلمرو شناخته است: ماژول‌های غیر opt-in کاتالوگ
    (نصب‌شده یا نه، مثل امروز) به‌اضافهٔ ماژول opt-in فقط وقتی نصب است.
    """
    from platform_core.registry import installed_modules
    installed = set(installed_modules())
    return [code for code, spec in MODULE_CATALOG.items() if not spec.opt_in or code in installed]


def get_disallowed_permission_codenames() -> set[str]:
    """
    برگرداندن کدهای دسترسی ماژول‌هایی که در حال حاضر نصب یا فعال نیستند.
    جهت اعمال کنترل دفاع در عمق (Defense in Depth) در لایه API و اعتبارسنجی نقش‌ها.
    """
    from platform_core.registry import installed_modules
    installed = set(installed_modules())
    disallowed = set()
    for code, perms in MODULE_PERMISSION_CODENAMES.items():
        if code not in installed:
            disallowed.update(perms)
    return disallowed


def installed_module_permissions() -> tuple[tuple[str, str], ...]:
    """
    مجوزهای سفارشی ماژول‌های نصب‌شده (کد، نام فارسی) به ترتیب کاتالوگ.
    سازندهٔ ردیف‌های Permission در post_migrate و فرمان seed_permissions از این می‌خوانند.
    """
    from platform_core.registry import installed_modules
    installed = set(installed_modules())
    result: dict[str, str] = {}
    for code, perms in MODULE_PERMISSIONS.items():
        if code in installed:
            for codename, name in perms:
                result.setdefault(codename, name)
    return tuple(result.items())


def installed_permission_specs() -> dict[str, dict]:
    """
    {codename: spec} مجوزهای ماژول‌های نصب‌شده با قالب کامل (طرح ۲.۲، ت۲ و ت۳):
    spec = {'code', 'label_fa', 'category', 'scope', 'defaults', 'module'}؛ defaults سهم جمع‌شدهٔ ماژول‌ها
    در بستهٔ هر نقش انتساب است. مجوزهای خود هسته (CustomUser.Meta) اینجا نیستند و همه سامانه‌ای‌اند.
    """
    from platform_core.registry import installed_modules
    return merge_permission_specs(MODULE_PERMISSION_SPECS, set(installed_modules()))


def installed_permission_categories() -> tuple[dict, ...]:
    """دسته‌های مجوز ماژول‌های نصب‌شده (key، label_fa، order، menu، module) به ترتیب کاتالوگ و order."""
    from platform_core.registry import installed_modules
    installed = set(installed_modules())
    out = []
    for code, categories in MODULE_PERMISSION_CATEGORIES.items():
        if code in installed:
            out.extend(sorted(categories, key=lambda c: c['order']))
    return tuple(out)
