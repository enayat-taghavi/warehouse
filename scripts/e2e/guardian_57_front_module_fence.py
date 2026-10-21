#!/usr/bin/env python
"""
ایجنت نگهبان ۵۷ — حصار ماژول‌های فرانت‌اند (گام ۲ طرح راه میانهٔ ماژولار)
(Guardian 57 — Front-End Module Boundaries & Independence Fence)

مرجع: Documents/Modular_Middle_Path/implementation_plan_modular_middle_path.md §۵ (گام ۲)

این نگهبان چهار شمارندهٔ اصلی مرزبندی ماژول‌های فرانت را می‌سنجد و آچار یک‌طرفه را برقرار می‌کند:
  (الف) core/، shared/ یا modules/common/ → modules/warehouse|accounting (core_to_module_imports)
  (ب) انبار ↔ مالی (cross_module_imports)
  (ج) isModuleInstalled('<کد ماژول>') بیرون از پوشهٔ همان ماژول (is_module_installed_outside_module)
  (د) مسیرهای سخت‌کدشده API ماژول در هسته/مشترک (core_hardcoded_module_api_paths)
  (هـ) لیترال نام ماژول در core/ و shared/ (core_module_literals): به‌جای آچار، فهرست مجاز دقیق
       scripts/e2e/core_literal_allowlist.json (بخش front)؛ لیترال بیرون از فهرست و ورودی کهنه هر دو شکست‌اند.
  (و) مسیر صفحهٔ ماژول (/app/<پیشوند ماژول>) در core/، shared/ و ریشهٔ ترکیب (core_module_route_paths): باید صفر بماند.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core_literal_allowlist  # noqa: E402

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
HARDCODED_MODULE_API_PATH_RE = re.compile(r"""['"`][^'"`\n]*/(?:personnel|inventory)/""")
IMPORT_EXPORT_FROM_LINE_RE = re.compile(r"""^\s*(?:import|export)\b.*\bfrom\b""")
MODULE_LITERAL_RE = re.compile(r"""(['"])(warehouse|finance|personnel|accounting)\1""")
IMPORT_LINE_RE = re.compile(r"""^\s*import\b""")
# پوستهٔ مشترک modules/common هم جزو هسته است؛ قالب‌های html این ریشه‌ها هم شمرده می‌شوند
LITERAL_SCAN_ROOTS = ("core/", "shared/", "modules/common/")


def find_module_literals(text):
    """(سطر، لیترال) برای هر لیترال نقل‌قول‌شدهٔ نام ماژول؛ سطرهای توضیح و ایمپورت شمرده نمی‌شوند."""
    found = []
    for line_idx, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith(("//", "*", "/*", "<!--")) or IMPORT_LINE_RE.match(line):
            continue
        for m in MODULE_LITERAL_RE.finditer(line):
            found.append((line_idx, m.group(2)))
    return found


ROUTE_PREFIX_RE = re.compile(r"""['"](/app/[a-z][a-z0-9-]*)""")


def discover_module_route_prefixes(app_dir):
    """پیشوندهای مسیر صفحهٔ ماژول‌ها (/app/<بخش>) از routePrefix، defaultRoute و appRoutePrefixes هر module.ts."""
    prefixes = set()
    modules_dir = app_dir / "modules"
    if not modules_dir.exists():
        return prefixes
    for mod_file in sorted(modules_dir.glob("*/module.ts")):
        if mod_file.parent.name == "common":
            continue
        try:
            content = mod_file.read_text(encoding="utf-8")
        except Exception:
            continue
        for key in ("routePrefix", "defaultRoute"):
            m = re.search(key + r"""\s*:\s*['"](/app/[a-z][a-z0-9-]*)""", content)
            if m:
                prefixes.add(m.group(1))
        m = re.search(r"""appRoutePrefixes\s*:\s*\[(.*?)\]""", content, re.DOTALL)
        if m:
            prefixes.update(ROUTE_PREFIX_RE.findall(m.group(1)))
    return prefixes


def find_module_route_paths(text, prefixes):
    """(سطر، مسیر) برای هر رشته‌ای که با پیشوند مسیر یک ماژول آغاز شود؛ توضیح و ایمپورت شمرده نمی‌شوند."""
    if not prefixes:
        return []
    alt = "|".join(re.escape(p) for p in sorted(prefixes, key=len, reverse=True))
    route_re = re.compile(r"""['"`](?:""" + alt + r""")(?![a-z0-9-])""")
    found = []
    for line_idx, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith(("//", "*", "/*", "<!--")) or IMPORT_LINE_RE.match(line):
            continue
        for m in route_re.finditer(line):
            found.append((line_idx, m.group(0)[1:]))
    return found


def discover_module_identity_names(app_dir, module_names):
    """نام‌های هویتی هر ماژول (کد، نام‌های مستعار و scopeKind) از module.ts همان ماژول."""
    identity = {}
    for mod_name in module_names:
        names = {mod_name}
        mod_file = app_dir / "modules" / mod_name / "module.ts"
        try:
            content = mod_file.read_text(encoding="utf-8")
        except Exception:
            content = ""
        m = re.search(r"""aliases\s*:\s*\[(.*?)\]""", content, re.DOTALL)
        if m:
            # نام مستعار کوتاه (مثل wh) در کد معنای دیگری هم دارد (نوع ستون، پارامتر)؛ شمرده نمی‌شود
            names.update(a.strip() for a in re.findall(r"""['"]([^'"]+)['"]""", m.group(1)) if len(a.strip()) >= 4)
        m = re.search(r"""\bscopeKind\s*:\s*['"]([^'"]+)['"]""", content)
        if m:
            names.add(m.group(1).strip())
        identity[mod_name] = names
    return identity


def find_cross_module_literals(text, foreign_names):
    """(سطر، لیترال) برای هر لیترال نقل‌قول‌شده‌ای که نام هویتی ماژول دیگری است."""
    if not foreign_names:
        return []
    alt = "|".join(re.escape(n) for n in sorted(foreign_names))
    rx = re.compile(r"""(['"])(""" + alt + r""")\1""")
    found = []
    for line_idx, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith(("//", "*", "/*", "<!--")) or IMPORT_LINE_RE.match(line):
            continue
        for m in rx.finditer(line):
            found.append((line_idx, m.group(2)))
    return found


def discover_module_names(app_dir):
    """کشف پویای نام ماژول‌ها از پوشهٔ modules (به‌جز common)."""
    modules_dir = app_dir / "modules"
    if not modules_dir.exists():
        return set()
    return {child.name for child in modules_dir.iterdir() if child.is_dir() and child.name != "common"}


def discover_module_aliases(app_dir, module_names):
    """استخراج پویای نام‌های مستعار ماژول‌ها از فایل قرارداد module.ts هر ماژول."""
    alias_map = {}
    for mod_name in module_names:
        alias_map[mod_name] = mod_name
        alias_map[f"{mod_name}-ui"] = mod_name
        mod_file = app_dir / "modules" / mod_name / "module.ts"
        if mod_file.exists():
            try:
                content = mod_file.read_text(encoding="utf-8")
                m = re.search(r"""aliases\s*:\s*\[(.*?)\]""", content, re.DOTALL)
                if m:
                    for a in re.findall(r"""['"]([^'"]+)['"]""", m.group(1)):
                        alias_map[a.strip()] = mod_name
            except Exception:
                pass
    return alias_map


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


def resolve_import_zone(src_file, import_str, app_dir, module_names, alias_map=None):
    """
    تشخیص ناحیهٔ مقصد یک ایمپورت:
    اگر به ماژولی اشاره دارد نام آن، در غیر این صورت None.
    """
    if alias_map and import_str in alias_map:
        return alias_map[import_str]
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
    alias_map = discover_module_aliases(app_dir, module_names)

    violations = {
        "core_to_module_imports": [],
        "cross_module_imports": [],
        "is_module_installed_outside_module": [],
        "core_hardcoded_module_api_paths": [],
        "core_module_literals": [],
        "core_module_route_paths": [],
        "cross_module_literals": [],
    }
    route_prefixes = discover_module_route_prefixes(app_dir)
    identity = discover_module_identity_names(app_dir, module_names)

    files_to_scan = []
    if app_dir.exists():
        # قالب‌های html فقط برای شمارندهٔ مسیر (و)
        files_to_scan.extend(sorted(p for p in app_dir.rglob("*.html") if p.name != "index.html"))
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
        is_spec = rel_posix.endswith(".spec.ts") or file_path.name.endswith(".spec.ts")

        try:
            text = file_path.read_text(encoding="utf-8")
        except Exception:
            continue

        # ۵) مسیر صفحهٔ ماژول در هسته، مشترک و ریشهٔ ترکیب (و)
        in_core_shell = not rel_posix.startswith("modules/") or rel_posix.startswith("modules/common/")
        if not is_spec and zone in ("composition_root", "core_common") and in_core_shell:
            for line_idx, route in find_module_route_paths(text, route_prefixes):
                violations["core_module_route_paths"].append({
                    "file": rel_posix,
                    "line": line_idx,
                    "match": route,
                })

        if zone == "composition_root":
            continue

        # (ز) ماژول نام هویتی ماژول دیگر را نمی‌نویسد (ts و html، بدون spec)
        if zone in module_names and not is_spec:
            foreign = set().union(*[n for k, n in identity.items() if k != zone]) - identity.get(zone, set())
            x_lines = text.splitlines()
            for line_idx, literal in find_cross_module_literals(text, foreign):
                violations["cross_module_literals"].append({
                    "file": rel_posix,
                    "line": line_idx,
                    "match": literal,
                    "text": x_lines[line_idx - 1].strip(),
                })

        # قالب html: فقط لیترال نام ماژول (هـ)؛ ایمپورت و API ندارد
        if file_path.suffix == ".html":
            if rel_posix.startswith(LITERAL_SCAN_ROOTS):
                html_lines = text.splitlines()
                for line_idx, literal in find_module_literals(text):
                    violations["core_module_literals"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "match": literal,
                        "text": html_lines[line_idx - 1].strip(),
                    })
            continue

        # بررسی سطرهای فایل برای شماره خط دقیق
        lines = text.splitlines()

        # ۱) بررسی ایمپورت‌ها (الف و ب)
        for line_idx, line in enumerate(lines, 1):
            for m in IMPORT_RE.finditer(line):
                import_str = m.group(1)
                t_zone = resolve_import_zone(file_path, import_str, app_dir, module_names, alias_map)
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
                norm_code = alias_map.get(code, code)
                if norm_code in module_names and zone != norm_code:
                    violations["is_module_installed_outside_module"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "code": code,
                        "current_zone": zone,
                    })

        # ۳) بررسی مسیرهای سخت‌کدشده API ماژول در فایل‌های غیرتست ناحیه core_common (د)
        if zone == "core_common" and not is_spec:
            for line_idx, line in enumerate(lines, 1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
                    continue
                if IMPORT_EXPORT_FROM_LINE_RE.search(line):
                    continue
                for m in HARDCODED_MODULE_API_PATH_RE.finditer(line):
                    violations["core_hardcoded_module_api_paths"].append({
                        "file": rel_posix,
                        "line": line_idx,
                        "match": m.group(0),
                    })

        # ۴) لیترال نام ماژول در core/ و shared/ (بدون spec، توضیح و ایمپورت) (هـ)
        in_literal_roots = rel_posix.startswith(LITERAL_SCAN_ROOTS) or simulated_zone == "core_common"
        if in_literal_roots and not is_spec:
            lines_cache = text.splitlines()
            for line_idx, literal in find_module_literals(text):
                violations["core_module_literals"].append({
                    "file": rel_posix,
                    "line": line_idx,
                    "match": literal,
                    "text": lines_cache[line_idx - 1].strip(),
                })

    counters = {
        "core_to_module_imports": len(violations["core_to_module_imports"]),
        "cross_module_imports": len(violations["cross_module_imports"]),
        "is_module_installed_outside_module": len(violations["is_module_installed_outside_module"]),
        "core_hardcoded_module_api_paths": len(violations["core_hardcoded_module_api_paths"]),
        "core_module_literals": len(violations["core_module_literals"]),
        "core_module_route_paths": len(violations["core_module_route_paths"]),
        "cross_module_literals": len(violations["cross_module_literals"]),
    }
    return counters, violations


def check_literal_allowlist(violations, allowlist=None):
    """(ok, پیام‌ها): لیترال‌های core/ و shared/ دقیقاً برابر بخش front فهرست مجاز."""
    try:
        data = allowlist if allowlist is not None else core_literal_allowlist.load_allowlist()
    except Exception as e:
        return False, [f"فهرست مجاز خوانده نشد: {e}"]
    return core_literal_allowlist.check(violations["core_module_literals"], data.get("front", []))


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


def check_module_contracts(app_dir=FRONT_APP_DIR, repo_root=REPO_ROOT):
    """
    بررسی‌های قرارداد ساختاری ماژول‌ها طبق گام ۴ طرح راه میانهٔ ماژولار:
      ۱. وجود module.ts در هر پوشهٔ ماژول فرانت (به‌جز common).
      ۲. برابری code در module.ts با نام پوشه.
      ۳. برابری code ماژول فرانت با code در warehouse-backend/modules/<x>/module.py.
      ۴. کامل بودن installed-modules.ts (شامل همهٔ پوشه‌های ماژول‌های کشف‌شده).
    """
    errors = []
    modules_dir = app_dir / "modules"
    if not modules_dir.exists():
        errors.append("پوشهٔ modules در فرانت‌اند یافت نشد.")
        return errors

    discovered = sorted([d for d in modules_dir.iterdir() if d.is_dir() and d.name != "common"], key=lambda d: d.name)
    if not discovered:
        errors.append("هیچ ماژولی در پوشهٔ modules یافت نشد.")
        return errors

    backend_modules_dir = repo_root / "warehouse-backend" / "modules"

    for mod_dir in discovered:
        mod_name = mod_dir.name
        # ۱. وجود module.ts
        mod_file = mod_dir / "module.ts"
        if not mod_file.exists():
            errors.append(f"ماژول '{mod_name}' فاقد فایل قرارداد module.ts است ({mod_file.relative_to(repo_root)}).")
            continue

        try:
            content = mod_file.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"خطا در خواندن {mod_file}: {e}")
            continue

        # ۲. برابری code با نام پوشه
        m = re.search(r"""\bcode\s*:\s*['"]([^'"]+)['"]""", content)
        if not m:
            errors.append(f"فیلد code در {mod_file.relative_to(repo_root)} یافت نشد.")
            front_code = None
        else:
            front_code = m.group(1).strip()
            if front_code != mod_name:
                errors.append(f"کد ماژول '{front_code}' در {mod_file.relative_to(repo_root)} با نام پوشه '{mod_name}' تطابق ندارد.")

        # ۳. برابری با بک‌اند
        b_mod_file = backend_modules_dir / mod_name / "module.py"
        if b_mod_file.exists():
            try:
                b_content = b_mod_file.read_text(encoding="utf-8")
                bm = re.search(r"""\bcode\s*=\s*['"]([^'"]+)['"]""", b_content)
                if not bm:
                    errors.append(f"فیلد code در ماژول بک‌اند {b_mod_file.relative_to(repo_root)} یافت نشد.")
                else:
                    backend_code = bm.group(1).strip()
                    if front_code and backend_code != front_code:
                        errors.append(f"عدم تطابق کد ماژول: فرانت '{front_code}' با بک‌اند '{backend_code}' برابر نیست.")
            except Exception as e:
                errors.append(f"خطا در خواندن ماژول بک‌اند {b_mod_file}: {e}")
        else:
            errors.append(f"ماژول متناظر در بک‌اند یافت نشد: {b_mod_file.relative_to(repo_root)}")

    # ۴. کامل بودن installed-modules.ts
    installed_file = modules_dir / "installed-modules.ts"
    if not installed_file.exists():
        errors.append(f"فایل installed-modules.ts یافت نشد ({installed_file.relative_to(repo_root)}).")
    else:
        try:
            inst_text = installed_file.read_text(encoding="utf-8")
            for mod_dir in discovered:
                mod_name = mod_dir.name
                expected_import = f"./{mod_name}/module"
                if expected_import not in inst_text:
                    errors.append(f"ماژول '{mod_name}' در installed-modules.ts ایمپورت نشده است ({expected_import}).")
        except Exception as e:
            errors.append(f"خطا در خواندن installed-modules.ts: {e}")

    return errors


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
            '  const syncUrl = `/api/personnel/sync/pull/?project_id=1`;\n'
            '  return isModuleInstalled("warehouse");\n'
            '}\n',
            encoding="utf-8",
        )
        # پویش با فایل ساختگی شبیه‌سازی‌شده در ناحیه core_common
        counters, violations = scan_front_fences(FRONT_APP_DIR, extra_files=[(dummy_file, "core_common")])
        found_import = any(v["file"] == dummy_file.name for v in violations["core_to_module_imports"])
        found_call = any(v["file"] == dummy_file.name for v in violations["is_module_installed_outside_module"])
        found_api_path = any(v["file"] == dummy_file.name for v in violations["core_hardcoded_module_api_paths"])
        found_literal = any(v["file"] == dummy_file.name for v in violations["core_module_literals"])

        # شمارندهٔ core_module_literals با قانون «افزایش ممنوع»: fixture بدون تغییر قبول، یک لیترال اضافه رد
        fixture = (
            "// 'warehouse' in a comment\n"
            "import { X } from './finance';\n"
            " * 'accounting' in a doc comment\n"
            "const a = 'personnel';\n"
        )
        literal_baseline = len(find_module_literals(fixture))
        unchanged_ok = len(find_module_literals(fixture)) <= literal_baseline
        extra_fails = len(find_module_literals(fixture + 'const b = "warehouse";\n')) > literal_baseline
        literal_ok = literal_baseline == 1 and unchanged_ok and extra_fails
        print(f"self-test core_module_literals: fixture={literal_baseline} (expected 1), "
              f"unchanged passes={unchanged_ok}, extra literal fails={extra_fails}")

        # شمارندهٔ مسیر صفحهٔ ماژول (و): پیشوند ماژول شناخته شود، مسیر هسته و توضیح شمرده نشوند
        route_fixture = (
            "// '/app/finance/x' in a comment\n"
            "const a = '/app/operations/dashboard';\n"
            "const b = '/app/finance-like';\n"
            "const c = `/app/finance/payroll`;\n"
        )
        routes = find_module_route_paths(route_fixture, {"/app/finance"})
        route_ok = [r for _, r in routes] == ["/app/finance"] and bool(discover_module_route_prefixes(FRONT_APP_DIR))
        print(f"self-test core_module_route_paths: found={[r for _, r in routes]} (expected ['/app/finance']), "
              f"module prefixes discovered={sorted(discover_module_route_prefixes(FRONT_APP_DIR))}")

        # فهرست مجاز دقیق (هـ): منطق مشترک و اعمال روی violations
        allow_logic_ok = core_literal_allowlist.self_test()
        sample = {"core_module_literals": [{"file": "x.ts", "line": 1, "match": "warehouse", "text": "a = 'warehouse';"}]}
        entry = {"file": "x.ts", "text": "a = 'warehouse';", "match": "warehouse", "category": "data_field", "reason": "نمونه"}
        allow_apply_ok = (check_literal_allowlist(sample, {"front": [entry]})[0]
                          and not check_literal_allowlist(sample, {"front": []})[0]
                          and not check_literal_allowlist({"core_module_literals": []}, {"front": [entry]})[0])
        print(f"self-test allowlist on guardian 57 violations: {allow_apply_ok}")
        cross_fixture = "// 'finance' in a comment\nconst a = 'finance';\nconst b = 'warehouse';\n"
        cross = [lit for _, lit in find_cross_module_literals(cross_fixture, {"finance", "personnel"})]
        cross_ok = cross == ["finance"]
        print(f"self-test cross_module_literals: found={cross} (expected ['finance'])")
        allow_apply_ok = allow_apply_ok and cross_ok
        literal_ok = literal_ok and route_ok and allow_logic_ok and allow_apply_ok

        # آزمون قراردادهای ماژول
        contract_errors = check_module_contracts()
        if contract_errors:
            print(f"❌ خودآزمایی قرارداد ماژول‌ها با خطا مواجه شد: {contract_errors}")
            return 1

        if found_import and found_call and found_api_path and found_literal and literal_ok:
            print("✅ خودآزمایی نگهبان ۵۷ (--self-test): نقض ساختگی و قراردادهای ماژول با موفقیت راستی‌آزمایی شدند.")
            return 0
        else:
            print(
                f"❌ خودآزمایی شکست خورد: found_import={found_import}, "
                f"found_call={found_call}, found_api_path={found_api_path}, "
                f"found_literal={found_literal}, literal_ok={literal_ok}"
            )
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
        "cross_module_imports": "ایمپورت متقابل بین ماژول‌ها (ب)",
        "is_module_installed_outside_module": "فراخوانی isModuleInstalled بیرون از ماژول (ج)",
        "core_hardcoded_module_api_paths": "مسیر سخت‌کدشده API ماژول در هسته/مشترک (د)",
        "core_module_literals": "لیترال نام ماژول در core/ و shared/ (هـ) — سنجش با فهرست مجاز دقیق",
        "core_module_route_paths": "مسیر صفحهٔ ماژول در هسته/مشترک/ریشهٔ ترکیب (و) — باید صفر باشد",
        "cross_module_literals": "نام ماژول دیگر در کد یک ماژول (ز) — باید صفر باشد",
    }
    # این شمارنده‌ها آچار مبنا ندارند: (هـ) با فهرست مجاز، (و) و (ز) با صفر مطلق سنجیده می‌شوند
    exact_keys = {"core_module_literals", "core_module_route_paths", "cross_module_literals"}

    for key, val in counters.items():
        title = labels.get(key, key)
        prev = base_counters.get(key)
        if key in exact_keys:
            mark, note = "📏", "سنجش دقیق (پایین)"
        elif prev is None:
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

    # بررسی قرارداد ساختاری ماژول‌ها طبق گام ۴
    contract_errors = check_module_contracts()
    print("📋 بررسی قرارداد ساختاری ماژول‌ها (module.ts، تطابق با بک‌اند، installed-modules.ts):")
    if not contract_errors:
        print("   🟢 کلیه قراردادهای ساختاری ماژول‌ها برقرار و معتبرند.")
    else:
        for err in contract_errors:
            print(f"   ❌ {err}")
    print("-" * 74)

    passed = True
    if contract_errors:
        passed = False

    allow_ok, allow_msgs = check_literal_allowlist(violations)
    print("📜 فهرست مجاز دقیق لیترال‌ها (core_literal_allowlist.json، بخش front):")
    if allow_ok:
        print(f"   🟢 {counters['core_module_literals']} لیترال، همه در فهرست مجاز با دسته و دلیل؛ ورودی کهنه نیست.")
    else:
        passed = False
        for msg in allow_msgs:
            print(f"   ❌ {msg}")
    if counters["cross_module_literals"]:
        passed = False
        print("🚫 نام ماژول دیگر در کد ماژول (رفتار مشترک باید از extension و رجیستری بیاید):")
        for v in violations["cross_module_literals"]:
            print(f"   ❌ {v['file']}:{v['line']} '{v['match']}' | {v['text'][:120]}")
    if counters["core_module_route_paths"]:
        passed = False
        print("🚫 مسیر صفحهٔ ماژول در هسته/مشترک/ریشهٔ ترکیب (باید از extension ماژول خوانده شود):")
        for v in violations["core_module_route_paths"]:
            print(f"   ❌ {v['file']}:{v['line']} {v['match']}")
    print("-" * 74)

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
