#!/usr/bin/env python
"""
ایجنت نگهبان ۳۳ — سازوکار بیلد ماژولار و ایزولاسیون باندل فرانت‌اند
(Guardian 33 — Modular Build Mechanism and Dynamic Route Bundle Isolation)

مرجع: Documents/Deep_Modularization_Phase3/modular_architecture_phase3_plan.md

معیار آزمون:
  ۱) وجود اسکریپت `build:modules` در `package.json` که `tools/build-for-modules.js` را اجرا می‌کند.
  ۲) فایل `tools/build-for-modules.js` ماژول `gen-installed-modules` را فراخوانی کرده و بازگردانی
     نسخه متعهدشده `installed-modules.ts` را در بلوک `finally` و همچنین روی سیگنال‌های سیستمی انجام می‌دهد.
  ۳) فایل نسخه متعهدشده `installed-modules.ts` تمام ماژول‌های کشف‌شده در `src/app/modules/*/module.ts` را ایمپورت می‌کند.
  ۴) هر `module.ts` که `routes` دارد، از `import(` پویا استفاده می‌کند و هیچ ایمپورت ایستایی (static) از فایل روت‌هایش ندارد.
  ۵) هیچ فایلی در `src/app/core` یا `src/app/shared` فایل‌های `*.routes` ماژول‌ها را به صورت ایستا ایمپورت نکرده است.
"""

import os
import sys
import json
import re
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONT_DIR = REPO_ROOT / "warehouse-front"
PACKAGE_JSON = FRONT_DIR / "package.json"
BUILD_FOR_MODULES_JS = FRONT_DIR / "tools" / "build-for-modules.js"
MODULES_DIR = FRONT_DIR / "src" / "app" / "modules"
INSTALLED_MODULES_TS = MODULES_DIR / "installed-modules.ts"
CORE_DIR = FRONT_DIR / "src" / "app" / "core"
SHARED_DIR = FRONT_DIR / "src" / "app" / "shared"


def check_package_json(pkg_data):
    """بررسی وجود اسکریپت build:modules در package.json."""
    errors = []
    scripts = pkg_data.get("scripts", {})
    build_script = scripts.get("build:modules", "")
    if not build_script:
        errors.append("اسکریپت 'build:modules' در scripts بسته package.json یافت نشد.")
    elif "tools/build-for-modules.js" not in build_script and "build-for-modules.js" not in build_script:
        errors.append(f"اسکریپت 'build:modules' به tools/build-for-modules.js اشاره نمی‌کند: {build_script}")
    return errors


def check_build_for_modules(content):
    """بررسی نیازمندی‌ها، بلوک finally و سیگنال‌های build-for-modules.js."""
    errors = []
    if "gen-installed-modules" not in content or "require(" not in content:
        errors.append("فایل tools/build-for-modules.js ماژول gen-installed-modules را require نکرده است.")

    has_finally = bool(re.search(r"finally\s*\{[^}]*restore", content, re.DOTALL))
    if not has_finally:
        errors.append("بازگردانی نسخه متعهدشده در بلوک finally فایل tools/build-for-modules.js یافت نشد.")

    has_signals = "SIGINT" in content and "SIGTERM" in content and ("process.on" in content or "process.once" in content)
    if not has_signals:
        errors.append("شنونده‌های سیگنال سیستمی (مانند SIGINT/SIGTERM) برای بازگردانی فایل متعهدشده یافت نشد.")

    return errors


def check_installed_modules(content, module_names):
    """بررسی ثبت تمام ماژول‌های کشف‌شده در installed-modules.ts متعهدشده."""
    # ماژول opt-in (گام ۷) در نسخهٔ commitشده نیست؛ فقط با نام صریح در --modules نصب می‌شود
    module_names = [m for m in module_names
                    if not re.search(r"\boptIn\s*:\s*true\b", (MODULES_DIR / m / "module.ts").read_text(encoding="utf-8"))]
    errors = []
    for mod in module_names:
        imp_pattern = rf"from\s*['\"]\./{mod}/module['\"]"
        if not re.search(imp_pattern, content):
            errors.append(f"ماژول '{mod}' در installed-modules.ts ایمپورت نشده است.")

        if f"{mod}Module" not in content:
            errors.append(f"نماد '{mod}Module' در آرایه INSTALLED_MODULES در installed-modules.ts یافت نشد.")
    return errors


def check_module_routes(content, module_name):
    """بررسی بارگذاری تنبل و عدم ایمپورت ایستا در module.ts هر ماژول."""
    errors = []
    static_import = re.search(r"^\s*import\s+.*['\"][^'\"]*\.routes(?:\.ts)?['\"]", content, re.MULTILINE)
    if static_import:
        errors.append(f"ماژول '{module_name}' فایل روت خود را به صورت ایستا (static) ایمپورت کرده است: {static_import.group(0).strip()}")

    if re.search(r"\broutes\s*:", content):
        if not re.search(r"\broutes\s*:\s*\([^)]*\)\s*=>\s*import\(", content):
            errors.append(f"ماژول '{module_name}' روت‌ها را به شکل تابع import() پویا تعریف نکرده است.")

    return errors


def check_no_static_route_imports(files_dict):
    """بررسی عدم ایمپورت فایل‌های routes ماژول‌ها در core و shared."""
    errors = []
    for rel_path, content in files_dict.items():
        match = re.search(r"^\s*import\s+.*['\"][^'\"]*\.routes(?:\.ts)?['\"]", content, re.MULTILINE)
        if match:
            errors.append(f"فایل '{rel_path}' فایل روت ماژولار را به صورت ایستا ایمپورت کرده است: {match.group(0).strip()}")
    return errors


def run_self_test():
    """اجرای خودآزمایی نگهبان ۳۳ روی فیکسچرهای حافظه‌ای بدون نوشتن فایل بیرونی."""
    print("=" * 74)
    print("🧪 اجرای خودآزمایی نگهبان ۳۳ (--self-test)...")
    print("=" * 74)

    # ۱. فیکسچرهای معتبر (باید با موفقیت و بدون خطا پاس شوند)
    good_pkg = {"scripts": {"build:modules": "node tools/build-for-modules.js"}}
    good_bfm = (
        "const { TARGET_FILE } = require('./gen-installed-modules');\n"
        "for (const sig of ['SIGINT', 'SIGTERM']) { process.on(sig, () => { restoreCommitted(); }); }\n"
        "try { runBuild(); } finally { restoreCommitted(); }\n"
    )
    good_inst = (
        "import { MODULE as accountingModule } from './accounting/module';\n"
        "import { MODULE as warehouseModule } from './warehouse/module';\n"
        "export const INSTALLED_MODULES: WhFrontendModule[] = [ accountingModule, warehouseModule ];\n"
    )
    good_module_ts = (
        "export const MODULE: WhFrontendModule = {\n"
        "  code: 'warehouse',\n"
        "  routes: () => import('./warehouse.routes').then(m => m.WAREHOUSE_ROUTES)\n"
        "};\n"
    )
    good_core_files = {
        "src/app/core/services/some.service.ts": "import { Injectable } from '@angular/core';\nexport class SomeService {}\n"
    }

    if check_package_json(good_pkg):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب package.json با خطا مواجه شد.")
        return False
    if check_build_for_modules(good_bfm):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب build-for-modules با خطا مواجه شد.")
        return False
    if check_installed_modules(good_inst, ["accounting", "warehouse"]):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب installed-modules با خطا مواجه شد.")
        return False
    if check_module_routes(good_module_ts, "warehouse"):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب module.ts با خطا مواجه شد.")
        return False
    if check_no_static_route_imports(good_core_files):
        print("❌ خودآزمایی شکست خورد: فیکسچر خوب core_files با خطا مواجه شد.")
        return False

    # ۲. فیکسچرهای معیوب package.json
    bad_pkg_no_script = {"scripts": {}}
    bad_pkg_wrong_script = {"scripts": {"build:modules": "ng build"}}
    if not check_package_json(bad_pkg_no_script) or not check_package_json(bad_pkg_wrong_script):
        print("❌ خودآزمایی شکست خورد: خطای package.json تشخیص داده نشد.")
        return False

    # ۳. فیکسچرهای معیوب build-for-modules.js
    bad_bfm_no_gen = good_bfm.replace("gen-installed-modules", "other-tool")
    bad_bfm_no_finally = good_bfm.replace("finally", "catch")
    bad_bfm_no_sig = good_bfm.replace("SIGINT", "OTHER")
    if (
        not check_build_for_modules(bad_bfm_no_gen)
        or not check_build_for_modules(bad_bfm_no_finally)
        or not check_build_for_modules(bad_bfm_no_sig)
    ):
        print("❌ خودآزمایی شکست خورد: خطای build-for-modules.js تشخیص داده نشد.")
        return False

    # ۴. فیکسچرهای معیوب installed-modules.ts
    bad_inst_missing_import = (
        "import { MODULE as accountingModule } from './accounting/module';\n"
        "export const INSTALLED_MODULES = [ accountingModule ];\n"
    )
    if not check_installed_modules(bad_inst_missing_import, ["accounting", "warehouse"]):
        print("❌ خودآزمایی شکست خورد: ماژول ناموجود در installed-modules.ts تشخیص داده نشد.")
        return False

    # ۵. فیکسچرهای معیوب module.ts
    bad_mod_static = (
        "import { WAREHOUSE_ROUTES } from './warehouse.routes';\n"
        "export const MODULE = { code: 'warehouse', routes: () => import('./warehouse.routes') };\n"
    )
    bad_mod_non_dyn = (
        "export const MODULE = { code: 'warehouse', routes: 'STATIC_ROUTES' };\n"
    )
    if not check_module_routes(bad_mod_static, "warehouse") or not check_module_routes(bad_mod_non_dyn, "warehouse"):
        print("❌ خودآزمایی شکست خورد: خطای ایمپورت ایستا یا روت غیرپویا در module.ts تشخیص داده نشد.")
        return False

    # ۶. فیکسچرهای معیوب core/shared
    bad_core_files = {
        "src/app/core/services/bad.service.ts": "import { WAREHOUSE_ROUTES } from '../../modules/warehouse/warehouse.routes';\n"
    }
    if not check_no_static_route_imports(bad_core_files):
        print("❌ خودآزمایی شکست خورد: ایمپورت استاتیک روت در core تشخیص داده نشد.")
        return False

    print("✅ تمام سناریوهای خودآزمایی نگهبان ۳۳ (پاس فیکسچر سالم و رد ۵ فیکسچر معیوب) با موفقیت اعتبارسنجی شدند.")
    return True


def test_bundle_isolation():
    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۳۳: سازوکار بیلد ماژولار و تفکیک مسیرها (فاز ۳)")
    print("=" * 74)

    errors = []

    # ۱. بررسی package.json
    if not PACKAGE_JSON.exists():
        print("❌ فایل package.json یافت نشد.")
        return False

    with open(PACKAGE_JSON, "r", encoding="utf-8") as f:
        pkg_data = json.load(f)

    pkg_errors = check_package_json(pkg_data)
    if pkg_errors:
        for err in pkg_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print("✅ اسکریپت 'build:modules' در package.json به tools/build-for-modules.js متصل است.")

    # ۲. بررسی tools/build-for-modules.js
    if not BUILD_FOR_MODULES_JS.exists():
        print(f"❌ فایل {BUILD_FOR_MODULES_JS} یافت نشد.")
        return False

    bfm_content = BUILD_FOR_MODULES_JS.read_text(encoding="utf-8")
    bfm_errors = check_build_for_modules(bfm_content)
    if bfm_errors:
        for err in bfm_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print("✅ ابزار build-for-modules.js از gen-installed-modules استفاده کرده و بازیابی در finally و سیگنال‌ها برقرار است.")

    # ۳. بررسی installed-modules.ts
    if not MODULES_DIR.exists() or not INSTALLED_MODULES_TS.exists():
        print("❌ دایرکتوری ماژول‌ها یا فایل installed-modules.ts یافت نشد.")
        return False

    discovered_modules = sorted([
        d.name for d in MODULES_DIR.iterdir()
        if d.is_dir() and d.name != "common" and (d / "module.ts").exists()
    ])

    inst_content = INSTALLED_MODULES_TS.read_text(encoding="utf-8")
    inst_errors = check_installed_modules(inst_content, discovered_modules)
    if inst_errors:
        for err in inst_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print(f"✅ تمام ماژول‌های کشف‌شده {discovered_modules} در installed-modules.ts ثبت و متعهد شده‌اند.")

    # ۴. بررسی module.ts هر ماژول
    for mod_name in discovered_modules:
        mod_ts_file = MODULES_DIR / mod_name / "module.ts"
        mod_content = mod_ts_file.read_text(encoding="utf-8")
        mod_errors = check_module_routes(mod_content, mod_name)
        if mod_errors:
            for err in mod_errors:
                print(f"❌ {err}")
                errors.append(err)
        else:
            print(f"✅ ماژول '{mod_name}' روت‌های خود را منحصراً به شکل Lazy و import() پویا بارگذاری می‌کند.")

    # ۵. بررسی عدم ایمپورت ایستا در core و shared
    scan_files = {}
    for folder in [CORE_DIR, SHARED_DIR]:
        if folder.exists():
            for ts_file in folder.rglob("*.ts"):
                # spec در باندل نیست؛ آزمون روت‌ها حق دارد app.routes را مستقیم ایمپورت کند
                if ts_file.name.endswith(".spec.ts"):
                    continue
                rel_path = str(ts_file.relative_to(FRONT_DIR)).replace("\\", "/")
                scan_files[rel_path] = ts_file.read_text(encoding="utf-8", errors="replace")

    fence_errors = check_no_static_route_imports(scan_files)
    if fence_errors:
        for err in fence_errors:
            print(f"❌ {err}")
            errors.append(err)
    else:
        print(f"✅ هیچ ایمپورت ایستایی از روت‌های ماژول‌ها در {len(scan_files)} فایل core و shared یافت نشد.")

    if errors:
        print("=" * 74)
        print(f"❌ نگهبان ۳۳ شکست خورد با {len(errors)} خطا.")
        return False

    print("=" * 74)
    print("✨ نتیجه: نگهبان ۳۳ تایید شد (PASS) — سازوکار بیلد ماژولار و تفکیک مسیرها برقرار است ✨")
    print("=" * 74)
    return True


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        success = run_self_test()
    else:
        success = test_bundle_isolation()
    sys.exit(0 if success else 1)
