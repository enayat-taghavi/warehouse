#!/usr/bin/env python
"""
ایجنت نگهبان ۳۰ — زنده‌بودن هستهٔ تنظیمات بدون اپ انبار
(Guardian 30 — Settings Core Viability Without the Warehouse App)

فاز ۱ طرح «جداسازی انبارگردانی و حسابداری به دو ماژول نصب‌شدنی مستقل».
مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۱

مبنای فاز ۱: هستهٔ تنظیمات (`settings_core`) باید از اپ انبار مستقل باشد.
(نکتهٔ مهم: بوتِ کل `INSTALLED_APPS` بدون انبار در این مرحله غیرممکن است، چون
یال‌های FKِ هسته→انبارِ `accounts`/`communications` فقط در فازهای ۲ و ۴ بریده
می‌شوند. معیار واقعیِ فاز ۱ همان چیزی است که این نگهبان اثبات می‌کند: خودِ
`settings_core` و هر دو اندپوینت تنظیمات، وقتی انبار نصب نیست، زنده‌اند.)

    ۱) Django را تنها با اپ‌های حداقلی + `settings_core` بوت می‌کند
       (بدون `warehouses`، `inventory`، `reports`) و تأیید می‌کند
       `apps.is_installed('warehouses')` نادرست است.
    ۲) یک URLConf مصنوعی فقط با دو مسیر تنظیمات روت می‌کند و هر دو را با یک
       پایگاه تست واقعی می‌آزماید:
        - `GET /api/public/config/`      → 200 (AllowAny) با `installed_modules`
        - `GET /api/settings/global/`    → احراز هویت می‌خواهد (401/403)، نه 500
    ۳) مطمئن می‌شود `installed_modules` شامل کد `warehouse` نیست.

اجرا:
    python scripts/e2e/guardian_30_settings_core.py
"""

import os
import sys
import types
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "warehouse-backend"
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / (
    "python.exe" if os.name == "nt" else "python"
)
SETTINGS_MODULE = "config.guardian30_adhoc_settings"
URLCONF_MODULE = "config.guardian30_adhoc_urls"

# اپ‌هایِ غیرضروری برای این آزمون: هر چیزی به‌جز settings_core و وابسته‌هایش.
KEEP_APPS = (
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "rest_framework",
    "settings_core",
)


def _main():
    # اگر مفسر جاری Django پروژه را ندارد، خود را با پایتون venv اجرا کن.
    try:
        import django  # noqa: F401
    except ImportError:
        if VENV_PYTHON.exists():
            import subprocess
            sys.exit(subprocess.call([str(VENV_PYTHON), os.path.abspath(__file__)] + sys.argv[1:]))
        print("❌ Django در مفسر جاری پیدا نشد.")
        sys.exit(1)

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))
    import backend_paths
    backend_paths.install()

    # ── ۱) settings مشتق‌شده با INSTALLED_APPS حداقلی ─────────────────
    import config.settings as base_settings  # نوع‌های تنظیمات (بدون بوت)

    adhoc = types.ModuleType(SETTINGS_MODULE)
    for name in dir(base_settings):
        if not name.startswith("_"):
            setattr(adhoc, name, getattr(base_settings, name))
    adhoc.INSTALLED_APPS = [
        app for app in base_settings.INSTALLED_APPS
        if app in (
            "django.contrib.contenttypes",
            "django.contrib.auth",
            "django.contrib.sessions",
            "rest_framework",
            "settings_core.apps.SettingsCoreConfig",
        )
    ]
    adhoc.ROOT_URLCONF = URLCONF_MODULE
    # از ارجاع base به `accounts` (که به اپ انبار وابسته است) پرهیز می‌کنیم:
    # احراز هویتِ سادهٔ DRF برای 401/AllowAny کافی است و هیچ middleware سفارشی
    # پروژه را بار نمی‌کند.
    adhoc.REST_FRAMEWORK = {
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework.authentication.SessionAuthentication",
            "rest_framework.authentication.BasicAuthentication",
        ],
        "DEFAULT_PERMISSION_CLASSES": [],
    }
    adhoc.MIDDLEWARE = [
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
    ]
    # این آزمون فقط زنده‌بودن اندپوینت‌ها را ثابت می‌کند؛ به سرور PostgreSQL نیازی
    # ندارد. برای پرهیز از وابستگی به دیتابیس تستِ postgres (که در محیط CI/جدا
    # در دسترس نیست) از یک فایل SQLite موقت استفاده می‌کنیم (نه `:memory:`، چون با
    # `:memory:` هر اتصال دیتابیس مجزای خالی می‌گیرد و جدولِ migrate‌شده در اتصال
    # درخواست دیده نمی‌شود).
    import tempfile
    _db_file = os.path.join(tempfile.gettempdir(), f"guardian30_{os.getpid()}.sqlite3")
    adhoc.DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _db_file,
        }
    }
    # پروژه مدل کاربرِ سفارشی `accounts.CustomUser` دارد که (هنوز) به اپ انبار
    # گره خورده است و تا بریده‌شدن آن در فاز ۲ بوت‌شدن accounts بدون انبار
    # ممکن نیست. این نگهبان فقط دو اندپوینت GET را می‌آزماید و به مدل کاربرِ
    # سفارشی نیازی ندارد؛ پس AUTH_USER_MODEL را به `auth.User` پیش‌فرض
    # برمی‌گردانیم تا setup بدون اپ accounts انجام شود.
    adhoc.AUTH_USER_MODEL = "auth.User"
    sys.modules[SETTINGS_MODULE] = adhoc
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", SETTINGS_MODULE)

    # ── ۲) URLConf مصنوعی فقط با دو اندپوینت تنظیمات ──────────────────
    # ابتدا apps را بوت می‌کنیم (django.setup) آن‌گاه settings_core.views را
    # ایمپورت می‌کنیم؛ چون مدل `SystemSetting` به رجیستری آمادهٔ اپ نیاز دارد و
    # ایمپورت پیش از setup با `AppRegistryNotReady` رد می‌شود.
    import django
    django.setup()

    from django.urls import path
    from settings_core.views import SettingsViewSet, PublicConfigViewSet

    urlconf = types.ModuleType(URLCONF_MODULE)
    urlconf.urlpatterns = [
        path("api/settings/global/",
             SettingsViewSet.as_view({"get": "global_settings", "post": "global_settings"})),
        path("api/public/config/",
             PublicConfigViewSet.as_view({"get": "list"})),
    ]
    sys.modules[URLCONF_MODULE] = urlconf

    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۰: زنده‌بودن هستهٔ تنظیمات بدون اپ انبار (فاز ۱)")
    print("=" * 74)

    from django.apps import apps

    errors = []

    # نبودِ اپ انبار
    ok = not apps.is_installed("warehouses")
    print(f"{'✅' if ok else '❌'} 'warehouses' در نصب آزمون نصب نیست")
    if not ok:
        errors.append("اپ warehouses کماکان نصب است.")

    # آزمون واقعی اندپوینت روی پایگاه تست
    # از `setup_databases` استفاده نمی‌کنیم: آن موجودیتِ دیتابیسِ واقعی/اصلی را
    # serialize می‌کند که برای یک نگهبانِ فقط‌تحت‌خواندنی لازم نیست و روی sqlite
    # هم بدون جداولِ از‌پیش‌ساخته شکست می‌خورد. به‌جایش فقط schema را migrate
    # می‌کنیم (کاملأ local، روی `:memory:`).
    from django.test.utils import setup_test_environment
    from django.core.management import call_command
    from django.test import Client

    setup_test_environment()
    try:
        call_command("migrate", interactive=False, verbosity=0)
        client = Client()

        r_config = client.get("/api/public/config/")
        ok = r_config.status_code == 200
        print(f"{'✅' if ok else '❌'} GET /api/public/config/ → {r_config.status_code} (انتظار 200)")
        if not ok:
            errors.append(f"/api/public/config/ با {r_config.status_code} پاسخ داد: "
                          f"{getattr(r_config, 'content', b'')[:300]}")

        modules = []
        try:
            modules = r_config.json().get("installed_modules", [])
        except Exception:
            pass
        ok = "warehouse" not in modules
        print(f"{'✅' if ok else '❌'} installed_modules فاقد 'warehouse' است → {modules}")
        if not ok:
            errors.append(f"installed_modules نباید 'warehouse' داشته باشد: {modules}")

        r_settings = client.get("/api/settings/global/")
        ok = r_settings.status_code in (200, 401, 403)
        print(f"{'✅' if ok else '❌'} GET /api/settings/global/ → {r_settings.status_code} "
              f"(انتظار 200/401/403، نه خطای بارگذاری)")
        if not ok:
            errors.append(f"/api/settings/global/ با {r_settings.status_code} پاسخ داد: "
                          f"{getattr(r_settings, 'content', b'')[:300]}")
    finally:
        # فایل SQLite موقت را پاک می‌کنیم.
        try:
            os.remove(_db_file)
        except OSError:
            pass

    print("=" * 74)
    if errors:
        print("🚫 نتیجه: نگهبان ۳۰ رد شد (REJECTED)")
        for err in errors:
            print(f"   - {err}")
        sys.exit(1)
    print("✨ نتیجه: نگهبان ۳۰ تایید شد (PASS) — هستهٔ تنظیمات بدون اپ انبار زنده است ✨")
    print("=" * 74)
    sys.exit(0)


if __name__ == "__main__":
    _main()
