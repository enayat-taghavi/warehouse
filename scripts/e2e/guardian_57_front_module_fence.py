#!/usr/bin/env python
"""
ایجنت نگهبان ۵۷ — حصار ماژول‌های فرانت‌اند (گام ۲ طرح راه میانهٔ ماژولار)
(Guardian 57 — Front-End Module Boundaries & Independence Fence)

مرجع: Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md §۵ (گام ۲)

این نگهبان سه شمارندهٔ اصلی مرزبندی ماژول‌های فرانت را می‌سنجد و آچار یک‌طرفه را برقرار می‌کند:
  (الف) core/، shared/ یا modules/common/ → modules/warehouse|accounting (core_to_module_imports)
  (ب) انبار ↔ مالی (cross_module_imports)
  (ج) isModuleInstalled('<کد ماژول>') بیرون از پوشهٔ همان ماژول (is_module_installed_outside_module)

ریشهٔ ترکیب (app.routes.ts، app.config.ts، app.component.ts و installed-modules.ts) مستثناست.
مبنای آچاری در scripts/e2e/front_fence_baseline.json نگه‌داری می‌شود و فقط کاهش مجاز است.

گزینه‌ها:
  python scripts/e2e/guardian_57_front_module_fence.py                  # بررسی عدم پس‌رفت
  python scripts/e2e/guardian_57_front_module_fence.py --update-baseline # ثبت snapshot جدید
  python scripts/e2e/guardian_57_front_module_fence.py --self-test       # آزمون خودکار تشخیص نقض ساختگی
  python scripts/e2e/guardian_57_front_module_fence.py --json            # خروجی ماشین‌خوان
"""

import argparse
import json
import os
import pathlib
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
FRONT_APP_DIR = REPO_ROOT / "warehouse-front" / "src" / "app"
BASELINE_FILE = pathlib.Path(__file__).resolve().parent / "front_fence_baseline.json"
SCRATCH_DIR = REPO_ROOT / "scratch"

COMPOSITION_ROOT_FILES = {
    "app.routes.ts",
    "app.config.ts",
    "app.component.ts",
    "app.ts",
    "installed-modules.ts",
}

IMPORT_RE = re.compile(r"""(?:from\s+|import\s*\(|import\s+)['"]([^'"]+)['"]""")
IS_MODULE_INSTALLED_RE = re.compile(r"""isModuleInstalled\(\s*['"]([^'"]+)['"]\s*\)""")


def discover_module_names(app_dir):
    """کشف پویای نام ماژول‌ها از پوشهٔ modules (به‌جز common)."""
    modules_dir = app_dir / "modules"
    if not modules_dir.exists():
        return {"warehouse", "accounting"}
    names = set()
    for child in modules_dir.iterdir():
        if child.is_dir() and child.name != "common":
            names.add(child.name)
    return names or {"warehouse", "accounting"}


def get_file_zone(rel_posix, module_names):
    """
    تعیین ناحیهٔ فایل:
      - 'composition_root': فایل‌های ریشه ترکیب
      - '<module_name>': داخل پوشهٔ یک ماژول (مانند warehouse یا accounting)
      - 'core_common': هسته، ابزارها و پوستهٔ مشترک
    """
    parts = rel_posix.split("/")
    filename = parts[-1]
    if filename in COMPOSITION_ROOT_FILES or filename.startswith("app."):
        return "composition_root"
    if parts[0] == "modules" and len(parts) > 1 and parts[1] in module_names:
        return parts[1]
    return "core_common"


def resolve_import_zone(src_file, import_str, app_dir, module_names):
    """
    تشخیص ناحیهٔ مقصد یک ایمپورت:
    اگر به ماژولی اشاره دارد نام آن، در غیر این صورت None.
    """
    if import_str == "warehouse-ui":
        return "warehouse"
    if import_str == "accounting-ui":
        return "accounting"
    if import_str == "platform-shell":
        return "common"

    if not import_str.startswith("."):
        return None

    target = (src_file.parent / import_str).resolve()
    try:
        t_rel = target.relative_to(app_dir).as_posix()
    except ValueError:
        return None

    t_parts = t_rel.split("/")
    if t_parts[0] == "modules" and len(t_parts) > 1 and t_parts[1] in module_names:
        return t_parts[1]
    return None


def scan_front_fences(app_dir=FRONT_APP_DIR, extra_files=None):
    """
    پویش کلیهٔ فایل‌های TypeScript فرانت‌اند و استخراج نقض‌ها در ۳ دسته:
      (الف) core_to_module_imports
      (ب) cross_module_imports
      (ج) is_module_installed_outside_module
    """
    module_names = discover_module_names(app_dir)
    violations = {
        "core_to_module_imports": [],
        "cross_module_imports": [],
        "is_module_installed_outside_module": [],
    }

    files_to_scan = []
    if app_dir.exists():
        files_to_scan.extend(sorted(app_dir.rglob("*.ts")))

    if extra_files:
        for f in extra_files:
            if isinstance(f, tuple):
                files_to_scan.append(f)
            else:
                files_to_scan.append(pathlib.Path(f))

    for item in files_to_scan:
        simulated_zone = None
        if isinstance(item, tuple):
            file_path, simulated_zone = item
            rel_posix = file_path.name
        else:
            file_path = item
            try:
                rel_posix = file_path.relative_to(app_dir).as_posix()
            except ValueError:
                rel_posix = file_path.as_posix()

        zone = simulated_zone or get_file_zone(rel_posix, module_names)
        if zone == "composition_root":
            continue

        try:
            text = file_path.read_text(encoding="utf-8")
        except Exception:
            continue

        # بررسی سطرهای فایل برای شماره خط دقیق
        lines = text.splitlines()

        # ۱) بررسی ایمپورت‌ها (الف و ب)
        for line_idx, line in enumerate(lines, 1):
            for m in IMPORT_RE.finditer(line):
                import_str = m.group(1)
                t_zone = resolve_import_zone(file_path, import_str, app_dir, module_names)
                if not t_zone:
                    continue

                if zone == "core_common":
                    violations["core_to_module_imports"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "import": import_str,
                        "target_module": t_zone,
                    })
                elif zone in module_names and t_zone in module_names and zone != t_zone:
                    violations["cross_module_imports"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "import": import_str,
                        "source_module": zone,
                        "target_module": t_zone,
                    })

        # ۲) بررسی فراخوانی isModuleInstalled (ج)
        for line_idx, line in enumerate(lines, 1):
            for m in IS_MODULE_INSTALLED_RE.finditer(line):
                code = m.group(1).strip()
                # نام مستعار: personnel همان ماژول accounting است
                norm_code = "accounting" if code == "personnel" else code
                if norm_code in module_names and zone != norm_code:
                    violations["is_module_installed_outside_module"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "code": code,
                        "current_zone": zone,
                    })

    counters = {
        "core_to_module_imports": len(violations["core_to_module_imports"]),
        "cross_module_imports": len(violations["cross_module_imports"]),
        "is_module_installed_outside_module": len(violations["is_module_installed_outside_module"]),
    }
    return counters, violations


def load_baseline():
    if not BASELINE_FILE.exists():
        return None
    try:
        return json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_baseline(counters, violations):
    payload = {
        "_readme": (
            "snapshot مبنای حصار ماژول‌های فرانت‌اند (نگهبان ۵۷). "
            "فقط کاهش مجاز است (قانون آچار یک‌طرفه). برای ثبت پیشرفت: "
            "python scripts/e2e/guardian_57_front_module_fence.py --update-baseline"
        ),
        "counters": counters,
        "violations": violations,
    }
    BASELINE_FILE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_self_test():
    """
    آزمون خودکار: ایجاد یک فایل نقض ساختگی در scratch/، اجرای پویش،
    اثبات کشف نقض، پاک‌سازی فایل و بازگرداندن کد ۰ در صورت موفقیت.
    """
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    dummy_file = SCRATCH_DIR / "dummy_front_fence_violation.ts"
    try:
        dummy_file.write_text(
            '// فایل نقض ساختگی برای خودآزمایی نگهبان ۵۷\n'
            'import { test } from "../warehouse-front/src/app/modules/warehouse/warehouse-flags";\n'
            'export function check() {\n'
            '  return isModuleInstalled("warehouse");\n'
            '}\n',
            encoding="utf-8",
        )
        # پویش با فایل ساختگی شبیه‌سازی‌شده در ناحیه core_common
        counters, violations = scan_front_fences(FRONT_APP_DIR, extra_files=[(dummy_file, "core_common")])
        found_import = any(v["file"] == dummy_file.name for v in violations["core_to_module_imports"])
        found_call = any(v["file"] == dummy_file.name for v in violations["is_module_installed_outside_module"])

        if found_import and found_call:
            print("✅ خودآزمایی نگهبان ۵۷ (--self-test): نقض ساختگی با موفقیت کشف و راستی‌آزمایی شد.")
            return 0
        else:
            print(f"❌ خودآزمایی شکست خورد: found_import={found_import}, found_call={found_call}")
            return 1
    finally:
        if dummy_file.exists():
            try:
                dummy_file.unlink()
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser(description="نگهبان ۵۷: حصار ماژول‌های فرانت‌اند")
    ap.add_argument("--update-baseline", action="store_true", help="ثبت snapshot مبنای جدید")
    ap.add_argument("--self-test", action="store_true", help="اجرای خودآزمایی با فایل نقض ساختگی در scratch/")
    ap.add_argument("--json", action="store_true", help="خروجی ماشین‌خوان")
    args = ap.parse_args()

    if args.self_test:
        return run_self_test()

    counters, violations = scan_front_fences()
    baseline = load_baseline()

    if args.json:
        print(json.dumps({"counters": counters, "baseline": (baseline or {}).get("counters")}, ensure_ascii=False, indent=2))

    print("=" * 74)
    print("🛡️ ایجنت نگهبان ۵۷: حصار ماژول‌های فرانت‌اند (گام ۲ — راه میانهٔ ماژولار)")
    print("=" * 74)

    regressions = []
    improvements = []
    base_counters = (baseline or {}).get("counters", {})

    labels = {
        "core_to_module_imports": "ایمپورت از هسته/مشترک به ماژول (الف)",
        "cross_module_imports": "ایمپورت متقابل انبار ↔ مالی (ب)",
        "is_module_installed_outside_module": "فراخوانی isModuleInstalled بیرون از ماژول (ج)",
    }

    for key, val in counters.items():
        title = labels.get(key, key)
        prev = base_counters.get(key)
        if prev is None:
            mark, note = "🆕", "مبنای جدید"
        elif val > prev:
            mark, note = "🔴", f"پس‌رفت! از {prev} به {val}"
            regressions.append((title, prev, val))
        elif val < prev:
            mark, note = "🟢", f"پیشرفت: از {prev} به {val}"
            improvements.append((title, prev, val))
        else:
            mark, note = "⚪", f"بدون تغییر (مبنا {prev})"
        print(f"   {mark} {title} = {val}   [{note}]")

    print("-" * 74)

    passed = True
    if baseline is None or args.update_baseline:
        save_baseline(counters, violations)
        print(f"📌 snapshot مبنا ثبت شد: {BASELINE_FILE.relative_to(REPO_ROOT)}")
        print("   از این لحظه هر افزایش شمارنده = شکست نگهبان ۵۷.")
        regressions = []
        improvements = []

    if regressions:
        passed = False
        print("🚫 پس‌رفت حصار فرانت‌اند (قانون آچار یک‌طرفه نقض شد):")
        for title, prev, val in regressions:
            print(f"   ❌ {title}: مبنا {prev} ← مقدار جاری {val}")
    elif improvements and not args.update_baseline:
        print("🟢 پیشرفت ثبت‌نشده وجود دارد. برای قفل‌کردن آن اجرا کنید:")
        print("   python scripts/e2e/guardian_57_front_module_fence.py --update-baseline")

    print("=" * 74)
    if passed:
        print("✨ نتیجه: نگهبان ۵۷ تایید شد (PASS) — حصار فرانت بدون پس‌رفت برقرار است ✨")
    else:
        print("🚫 نتیجه: نگهبان ۵۷ رد شد (REJECTED) 🚫")
    print("=" * 74)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
