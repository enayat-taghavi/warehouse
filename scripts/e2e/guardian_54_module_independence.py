#!/usr/bin/env python
"""
نگهبان ۵۴ — استقلال ماژول‌ها (انبارداری و حسابداری) در هر پروفایل نصب

مرجع: Documents/Modular_Deploy_Options/implementation_plan_modular_deploy.md §۴.۱ و گام ۲

برای هر پروفایل (`warehouse`، `accounting` و هر دو) در یک زیرفرایند جدا با `WH_MODULES`:
  ۱) `manage.py check` بدون خطا تمام شود.
  ۲) گراف مایگریشن فقط با اپ‌های همان پروفایل ساخته شود (وابستگی ناموجود = شکست) و
     `makemigrations --check` تغییری نبیند (مدل و مایگریشن در همان پروفایل هم‌خوان باشند).
  ۳) جهت وابستگی مایگریشن‌ها یک‌طرفه باشد: هیچ مایگریشنِ هسته به ماژولی وابسته نباشد و
     هیچ ماژولی به ماژول دیگر وابسته نباشد (هر ماژول ← فقط هسته و چارچوب).

این نگهبان چیزی در پایگاه‌داده نمی‌نویسد.
"""

import os
import subprocess
import sys
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

PROFILES = (
    ("warehouse", "فقط انبارداری"),
    ("accounting", "فقط حسابداری"),
    ("warehouse,accounting", "هر دو سامانه"),
)

# اسکریپت زیرفرایند: خروجی هر بررسی یک خط `OK ...` یا `FAIL ...` است.
PROFILE_CHECK = r"""
import io, os, sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
sys.path.insert(0, os.getcwd())
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.db.migrations.loader import MigrationLoader
from platform_core.module_catalog import MODULE_CATALOG

def label(app_path):
    return app_path.split('.')[0]

core = {label(a) for a in settings.PLATFORM_APPS}
owner = {}
for code, spec in MODULE_CATALOG.items():
    for a in spec.django_apps:
        owner[label(a)] = code
from config import settings as raw_settings  # نام‌های زیرخط‌دار در django.conf.settings در دسترس نیستند
expected = set(core) | {l for l, c in owner.items() if c in raw_settings._INSTALLED_MODULE_CODES}
project_installed = {label(a) for a in settings.LOCAL_APPS}
if project_installed != expected:
    print('FAIL apps', sorted(project_installed), 'expected', sorted(expected))
else:
    print('OK apps', ','.join(sorted(project_installed)))

failed = False
try:
    call_command('check', stdout=io.StringIO(), stderr=io.StringIO())
    print('OK check')
except BaseException as exc:
    failed = True
    print('FAIL check', str(exc).replace('\n', ' | ')[:1500])

try:
    loader = MigrationLoader(None, ignore_no_migrations=True)
    loader.graph.validate_consistency()
    print('OK graph', len(loader.graph.nodes))
except BaseException as exc:
    loader = None
    print('FAIL graph', exc)

if loader is not None:
    bad = []
    for (app, name), node in loader.graph.node_map.items():
        src = 'core' if app in core else owner.get(app)
        if src is None:
            continue  # چارچوب و کتابخانه‌های بیرونی
        for parent in node.parents:
            dst = 'core' if parent.key[0] in core else owner.get(parent.key[0])
            if dst is None or dst == 'core' or dst == src:
                continue
            bad.append(f'{app}.{name} -> {parent.key[0]}.{parent.key[1]}')
    if bad:
        print('FAIL direction', '; '.join(sorted(bad)))
    else:
        print('OK direction')

    out = io.StringIO()
    try:
        call_command('makemigrations', check=True, dry_run=True, stdout=out, stderr=io.StringIO())
        print('OK makemigrations')
    except SystemExit:
        print('FAIL makemigrations', out.getvalue().replace('\n', ' | ')[:1500])
    except BaseException as exc:
        print('FAIL makemigrations', exc)
"""


def run_profile(modules):
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["WH_MODULES"] = modules
    res = subprocess.run(
        [str(VENV_PYTHON), "-c", PROFILE_CHECK],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    lines = [l for l in res.stdout.splitlines() if l.startswith(("OK ", "FAIL "))]
    return res.returncode, lines, res.stderr


def main():
    print("=" * 74)
    print("🛡️ نگهبان ۵۴: استقلال ماژول‌ها در هر پروفایل نصب")
    print("=" * 74)
    expected_checks = {"apps", "check", "graph", "direction", "makemigrations"}
    errors = []
    for modules, title in PROFILES:
        print(f"\n▶️ پروفایل «{title}» (WH_MODULES={modules})")
        code, lines, stderr = run_profile(modules)
        seen = set()
        for line in lines:
            status, _, rest = line.partition(" ")
            name = rest.split(" ", 1)[0]
            seen.add(name)
            print(f"   {'✅' if status == 'OK' else '❌'} {rest}")
            if status == "FAIL":
                errors.append(f"{modules}: {rest[:300]}")
        missing = expected_checks - seen
        if code != 0 or missing:
            errors.append(f"{modules}: زیرفرایند کامل اجرا نشد (کد {code}، بررسی‌های اجرانشده: {sorted(missing)})")
            print("   ❌ زیرفرایند کامل اجرا نشد:")
            print("   " + (stderr or "").strip()[-1500:])

    print("\n" + "=" * 74)
    if errors:
        print(f"❌ نگهبان ۵۴ رد شد ({len(errors)} خطا):")
        for e in errors:
            print(f"   - {e}")
        return 1
    print("✅ نگهبان ۵۴ پذیرفته شد: هر سه پروفایل مستقل‌اند و جهت وابستگی مایگریشن‌ها یک‌طرفه است.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
