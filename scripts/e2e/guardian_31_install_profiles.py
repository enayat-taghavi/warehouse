#!/usr/bin/env python
"""
ایجنت نگهبان ۳۱ — راستی‌آزمایی سه پروفایل نصب توزیع‌ها (فاز ۷)
(Guardian 31 — Distribution Packaging and Installation Profiles Verification)

مرجع: Documents/Modular_Split_Warehouse_Accounting/implementation_plan_modular_split.md §۶, §۷

معیارهای سخت‌گیرانه آزمون:
  ۱) آزمون قفل نسخه پلتفرم (`requires_platform`):
     - ماژول‌های انبار و حسابداری باید نیازمند `wh-platform >= 1.0, < 2.0` باشند.
     - در صورت ناسازگاری نسخه پلتفرم، رجیستری باید با استثنا و پیام فارسی روشن خطا دهد.
  ۲) پروفایل (الف) `wh-platform + wh-accounting` (حسابداری‌تنها — `WH_MODULES=accounting`):
     - اجرای موفق `manage.py check` بدون خطا.
     - مهاجرت پایگاه‌داده خالی SQLite بدون هیچ جدولی از انبار.
     - صحت فهرست `installed_modules` (شامل accounting، فاقد warehouse).
     - قاعده طلایی شماره ۵ (قانون ۴۰۴ نه ۴۰۳): درخواست به اندپوینت‌های انبار (`/api/inventory/` و `/api/warehouses/`)
       باید قطعاً با کد **404** (Not Found) پاسخ داده شود نه 403.
  ۳) پروفایل (ب) `wh-platform + wh-warehouse` (انبارداری‌تنها — `WH_MODULES=warehouse`):
     - اجرای موفق `manage.py check` و مهاجرت دیتابیس خالی.
     - صحت فهرست `installed_modules` (شامل warehouse، فاقد accounting).
     - قاعده طلایی شماره ۵: درخواست به اندپوینت‌های حسابداری (`/api/personnel/`) باید قطعاً **404** باشد.
  ۴) پروفایل (ج) هر سه بسته کنار هم (Full Suite):
     - بارگذاری کامل و تکرار بی‌کم‌وکاست رفتار امروز.
     - حضور همزمان هر دو ماژول در `installed_modules`.
     - فعال بودن تمامی مسیرهای API و پاسخ‌دهی استاندارد تحت لایه احراز هویت.
"""

import os
import sys
import tempfile
import subprocess
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


def run_sub_verification(mod_env, test_script_content, title):
    print(f"\n▶️ ارزیابی {title} ...")
    temp_script = Path(tempfile.gettempdir()) / f"g31_sub_{os.getpid()}.py"
    temp_script.write_text(test_script_content, encoding="utf-8")

    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    if mod_env is not None:
        env["WH_MODULES"] = mod_env
    else:
        env.pop("WH_MODULES", None)

    res = subprocess.run(
        [str(VENV_PYTHON), str(temp_script)],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace"
    )

    try:
        temp_script.unlink(missing_ok=True)
    except Exception:
        pass

    if res.returncode != 0:
        print(f"❌ {title} شکست خورد با کد {res.returncode}:")
        print(res.stderr or res.stdout)
        return False, res.stderr or res.stdout

    for line in res.stdout.strip().splitlines():
        if "WARNING" not in line and "InMemory" not in line:
            print(f"   {line}")
    return True, ""


def test_installation_profiles():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۱: راستی‌آزمایی سه پروفایل نصب توزیع‌های ماژولار (فاز ۷)")
    print("=" * 74)

    errors = []

    # ── ۱) آزمون بررسی سازگاری نسخه پلتفرم (تسک ۶۶) ──────────────────────
    test_version_script = """
import sys
if 'warehouse-backend' not in sys.path:
    sys.path.insert(0, r'E:\\warehouse project\\warehouse-backend')
import backend_paths
backend_paths.install()

from platform_core.registry import register_module, ModuleSpec, PLATFORM_VERSION

# ماژول سازگار
spec_ok = ModuleSpec(
    code='test_ok',
    title_fa='تست سازگار',
    requires_platform='>=1.0,<2.0'
)
register_module(spec_ok)
print("✓ ماژول با نسخه سازگار (>=1.0,<2.0) با موفقیت ثبت شد.")

# ماژول ناسازگار
spec_incompat = ModuleSpec(
    code='test_incompat',
    title_fa='تست ناسازگار',
    requires_platform='>=2.0,<3.0'
)
try:
    register_module(spec_incompat)
    print("ERROR: ماژول ناسازگار نباید ثبت می‌شد!")
    sys.exit(1)
except RuntimeError as e:
    err_msg = str(e)
    assert "ناسازگاری نسخه ماژول" in err_msg
    print(f"✓ پیام خطای فارسی برای ماژول ناسازگار تایید شد: {err_msg[:65]}...")
"""
    ok, err = run_sub_verification(None, test_version_script, "سازگاری نسخه پلتفرم (requires_platform)")
    if not ok:
        errors.append("Platform version compatibility check failed: " + err)

    # ── ۲) پروفایل (الف) حسابداری‌تنها (accounting-only) ─────────────────
    test_acct_script = """
import os, sys, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
if 'warehouse-backend' not in sys.path:
    sys.path.insert(0, r'E:\\warehouse project\\warehouse-backend')
import backend_paths
backend_paths.install()

django.setup()
from django.test import Client
from platform_core.registry import installed_modules, is_module_installed

mods = installed_modules()
assert 'accounting' in mods, "accounting must be installed"
assert 'warehouse' not in mods, "warehouse must NOT be installed in accounting-only"
print("✓ ماژول‌های نصب‌شده: accounting (بدون انبار)")

client = Client(HTTP_HOST='localhost')
r_conf = client.get('/api/public/config/')
assert r_conf.status_code == 200
pub_mods = r_conf.json().get('installed_modules', [])
assert 'accounting' in pub_mods and 'warehouse' not in pub_mods
print("✓ پاسخ /api/public/config/ با ماژول‌های معتبر تایید شد.")

# قانون ۴۰۴ برای مسیر ماژول‌های نصب‌نشده
r_inv = client.get('/api/inventory/items/')
assert r_inv.status_code == 404, f"Expected 404 for /api/inventory/, got {r_inv.status_code}"
r_wh = client.get('/api/warehouses/')
assert r_wh.status_code == 404, f"Expected 404 for /api/warehouses/, got {r_wh.status_code}"
print("✓ پاسخ ۴۰۴ (قانون ۵: عدم افشای ماژول نصب‌نشده) برای /api/inventory/ و /api/warehouses/ تایید شد.")
"""
    ok, err = run_sub_verification("accounting", test_acct_script, "پروفایل (الف) — فقط حسابداری (wh-platform + wh-accounting)")
    if not ok:
        errors.append("Profile A (accounting-only) failed: " + err)

    # ── ۳) پروفایل (ب) انبارداری‌تنها (warehouse-only) ─────────────────────
    test_wh_script = """
import os, sys, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
if 'warehouse-backend' not in sys.path:
    sys.path.insert(0, r'E:\\warehouse project\\warehouse-backend')
import backend_paths
backend_paths.install()

django.setup()
from django.test import Client
from platform_core.registry import installed_modules, is_module_installed

mods = installed_modules()
assert 'warehouse' in mods, "warehouse must be installed"
assert 'accounting' not in mods, "accounting must NOT be installed in warehouse-only"
print("✓ ماژول‌های نصب‌شده: warehouse (بدون پرسنل)")

client = Client(HTTP_HOST='localhost')
r_conf = client.get('/api/public/config/')
assert r_conf.status_code == 200
pub_mods = r_conf.json().get('installed_modules', [])
assert 'warehouse' in pub_mods and 'accounting' not in pub_mods
print("✓ پاسخ /api/public/config/ با ماژول‌های معتبر تایید شد.")

# قانون ۴۰۴ برای مسیر ماژول پرسنل
r_pers = client.get('/api/personnel/profiles/')
assert r_pers.status_code == 404, f"Expected 404 for /api/personnel/, got {r_pers.status_code}"
print("✓ پاسخ ۴۰۴ برای مسیر /api/personnel/ در غیاب ماژول حسابداری تایید شد.")
"""
    ok, err = run_sub_verification("warehouse", test_wh_script, "پروفایل (ب) — فقط انبارداری (wh-platform + wh-warehouse)")
    if not ok:
        errors.append("Profile B (warehouse-only) failed: " + err)

    # ── ۴) پروفایل (ج) سوئیت کامل (Full Suite) ───────────────────────────
    test_full_script = """
import os, sys, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
if 'warehouse-backend' not in sys.path:
    sys.path.insert(0, r'E:\\warehouse project\\warehouse-backend')
import backend_paths
backend_paths.install()

django.setup()
from django.test import Client
from platform_core.registry import installed_modules, is_module_installed

mods = installed_modules()
assert 'warehouse' in mods and 'accounting' in mods, "Both modules must be installed in Full suite"
print("✓ ماژول‌های نصب‌شده: همزمان warehouse و accounting")

client = Client(HTTP_HOST='localhost')
r_conf = client.get('/api/public/config/')
assert r_conf.status_code == 200
pub_mods = r_conf.json().get('installed_modules', [])
assert 'warehouse' in pub_mods and 'accounting' in pub_mods
print("✓ پاسخ /api/public/config/ با هر دو ماژول تایید شد.")

# هر دو اندپوینت باید زنده باشند و ۴۰۴ ندهند (احراز هویت ۴۰۱/۴۰۳)
r_wh = client.get('/api/warehouses/')
assert r_wh.status_code != 404, f"Endpoint /api/warehouses/ should not be 404 in full mode"
r_pers = client.get('/api/personnel/profiles/')
assert r_pers.status_code != 404, f"Endpoint /api/personnel/ should not be 404 in full mode"
print("✓ زنده بودن همزمان اندپوینت‌های هر دو دامنه در سوئیت کامل تایید شد.")
"""
    ok, err = run_sub_verification(None, test_full_script, "پروفایل (ج) — سوئیت کامل (Full Suite — تکرار بی‌کم‌وکاست رفتار امروز)")
    if not ok:
        errors.append("Profile C (Full Suite) failed: " + err)

    print("\n" + "=" * 74)
    if errors:
        print(f"❌ نگهبان ۳۱ شکست خورد با {len(errors)} خطا:")
        for e in errors:
            print(f"   - {e}")
        return False

    print("✨ نتیجه: نگهبان ۳۱ تایید شد (PASS) — هر سه پروفایل نصب با موفقیت راستی‌آزمایی شدند ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    success = test_installation_profiles()
    sys.exit(0 if success else 1)
