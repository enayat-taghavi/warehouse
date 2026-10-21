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


def _discover_modules() -> None:
    # مسیر ریشه بک‌اند نسبت به این فایل: warehouse-backend/core/platform_core/module_catalog.py
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
        custom = tuple(
            getattr(mod, 'PERMISSIONS', None)
            or getattr(mod, f"{dir_code.upper()}_PERMISSIONS", ())
        )
        MODULE_PERMISSIONS[dir_code] = custom
        # هر مجوز سفارشی ماژول جزو کدهای همان ماژول هم هست (برای دفاع در عمق)
        MODULE_PERMISSION_CODENAMES[dir_code] = tuple(dict.fromkeys((*perms, *(c for c, _ in custom))))


_discover_modules()


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
